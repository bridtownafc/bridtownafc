// Directus hook: enforces the club's publishing rules (rules.js) on every write and asks
// the website to rebuild when site content changes. Writes made by Directus itself
// (no accountability) and by administrators are never blocked.
import {
  SITE_COLLECTIONS, URGENT_COLLECTIONS, canHandleEnquiry, checkAllocation, checkDuplicateAllocation, checkDuplicatePerson,
  checkFileWrite, checkPhotoFile, checkProtectedFields, checkWrite, scopeQuery, SLUG_SOURCES, slugify, uniqueSlug,
} from './rules.js';

/** Image fields the website publishes, checked for a usable format when chosen. */
const PHOTO_FIELDS = { people: 'photo', articles: 'hero_image', events: 'image' };

const ROLE_CACHE_MS = 60_000;

/** Shaped like a Directus error so the API answers 403 with this message. */
class PublishingRuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DirectusError';
    this.code = 'FORBIDDEN';
    this.status = 403;
    this.extensions = { reason: message };
  }
}

export default ({ filter, action, schedule }, { env, logger, database }) => {
  let roleNames = new Map();
  let rolesLoadedAt = 0;

  async function userFrom(accountability, database) {
    if (Date.now() - rolesLoadedAt > ROLE_CACHE_MS) {
      const rows = await database('directus_roles').select('id', 'name');
      roleNames = new Map(rows.map((row) => [row.id, row.name]));
      rolesLoadedAt = Date.now();
    }
    const roleIds = accountability.roles ?? (accountability.role ? [accountability.role] : []);
    return {
      id: accountability.user ?? null,
      admin: accountability.admin === true,
      roleNames: roleIds.map((id) => roleNames.get(id)).filter(Boolean),
    };
  }

  async function storedItems({ database, schema }, collection, keys) {
    const primaryKey = schema.collections[collection]?.primary ?? 'id';
    return database(collection).whereIn(primaryKey, keys).select('*');
  }

  function enforce(write) {
    const reason = checkWrite(write);
    if (reason) throw new PublishingRuleError(reason);
  }

  // Read limits inside a collection (e.g. Commercial Editors see commercial enquiries only).
  filter('items.query', async (query, { collection }, context) => {
    if (!context.accountability) return query;
    const user = await userFrom(context.accountability, context.database);
    return scopeQuery({ collection, query, user });
  });

  // Every team allocation names its team, whoever saves it (administrators included).
  filter('items.create', (payload, { collection }, context) => {
    if (context.accountability && collection === 'squad_memberships') {
      const reason = checkAllocation({ action: 'create', before: null, after: payload });
      if (reason) throw new PublishingRuleError(reason);
    }
    return payload;
  });

  // Web addresses are filled in from the name or title when left empty, and kept unique.
  filter('items.create', async (payload, { collection }, context) => {
    const source = SLUG_SOURCES[collection];
    if (!source || (typeof payload.slug === 'string' && payload.slug.trim())) return payload;
    const base = slugify(payload[source]) || collection.replace(/s$/, '');
    const taken = (await context.database(collection).where('slug', 'like', `${base}%`).select('slug')).map((row) => row.slug);
    return { ...payload, slug: uniqueSlug(base, taken) };
  });

  // A photo the website cannot show is refused when chosen, rather than breaking the website update.
  for (const event of ['items.create', 'items.update']) {
    filter(event, async (payload, { collection }, context) => {
      const field = PHOTO_FIELDS[collection];
      if (!field || !payload[field] || typeof payload[field] !== 'string') return payload;
      const [file] = await context.database('directus_files').where({ id: payload[field] }).select('type', 'filename_download');
      const reason = checkPhotoFile(file);
      if (reason) throw new PublishingRuleError(reason);
      return payload;
    });
  }

  // Team settings and Match Centre references: Club Admins only (Core cannot limit fields).
  filter('items.update', async (payload, { collection, keys }, context) => {
    if (!context.accountability || !['teams', 'fixtures'].includes(collection)) return payload;
    const user = await userFrom(context.accountability, context.database);
    const stored = collection === 'fixtures' ? await storedItems(context, collection, keys) : [null];
    for (const before of stored) {
      const reason = checkProtectedFields({ action: 'update', collection, before, payload, user });
      if (reason) throw new PublishingRuleError(reason);
    }
    return payload;
  });

  // No second profile with the same display name, and no person twice in the same team.
  async function checkDuplicates(collection, item, ownId, database) {
    if (collection === 'people' && item.display_name !== undefined) {
      const rows = await database('people').select('id', 'display_name');
      const others = rows.filter((row) => String(row.id) !== String(ownId)).map((row) => row.display_name);
      return checkDuplicatePerson({ name: item.display_name, existing: others });
    }
    // Only existing records can be duplicates: a profile created in the same save arrives as an
    // object (not yet an id), and a related record may arrive as { id }.
    const idOf = (value) => (value !== null && typeof value === 'object' ? value.id ?? null : value);
    const person = idOf(item.person);
    const team = idOf(item.team);
    const isId = (value) => typeof value === 'number' || (typeof value === 'string' && /^d+$/.test(value));
    if (collection === 'squad_memberships' && isId(person) && isId(team) && item.status !== 'archived') {
      const query = database('squad_memberships').where({ person, team }).whereNot('status', 'archived');
      if (ownId !== null) query.whereNot('id', ownId);
      const [{ count }] = await query.count({ count: '*' });
      if (Number(count) === 0) return null;
      const [personRow] = await database('people').where({ id: person }).select('display_name');
      const [teamRow] = await database('teams').where({ id: team }).select('name');
      return checkDuplicateAllocation({ duplicates: Number(count), personName: personRow?.display_name, teamName: teamRow?.name });
    }
    return null;
  }
  filter('items.create', async (payload, { collection }, context) => {
    if (!context.accountability || !['people', 'squad_memberships'].includes(collection)) return payload;
    const reason = await checkDuplicates(collection, { status: 'published', ...payload }, null, context.database);
    if (reason) throw new PublishingRuleError(reason);
    return payload;
  });
  filter('items.update', async (payload, { collection, keys }, context) => {
    if (!context.accountability || !['people', 'squad_memberships'].includes(collection)) return payload;
    if (collection === 'people' && !('display_name' in payload)) return payload;
    if (collection === 'squad_memberships' && !['person', 'team', 'status'].some((field) => field in payload)) return payload;
    for (const before of await storedItems(context, collection, keys)) {
      const reason = await checkDuplicates(collection, { ...before, ...payload }, before.id, context.database);
      if (reason) throw new PublishingRuleError(reason);
    }
    return payload;
  });

  // Directus Core cannot limit updates to some enquiries, so editors' topics are checked here.
  filter('items.update', async (payload, { collection, keys }, context) => {
    if (!context.accountability || !['enquiries', 'squad_memberships'].includes(collection)) return payload;
    const user = await userFrom(context.accountability, context.database);
    for (const before of await storedItems(context, collection, keys)) {
      const reason = collection === 'squad_memberships'
        ? checkAllocation({ action: 'update', before, after: { ...before, ...payload } })
        : canHandleEnquiry({ topic: before.topic, user }) ? null : 'Enquiries about this topic are handled by another role.';
      if (reason) throw new PublishingRuleError(reason);
    }
    return payload;
  });

  filter('items.create', async (payload, { collection }, context) => {
    if (!context.accountability || !SITE_COLLECTIONS.includes(collection)) return payload;
    const user = await userFrom(context.accountability, context.database);
    // New items without a status start as drafts (the field default).
    enforce({ action: 'create', collection, before: null, after: { status: 'draft', ...payload }, user });
    return payload;
  });

  filter('items.update', async (payload, { collection, keys }, context) => {
    if (!context.accountability || !SITE_COLLECTIONS.includes(collection)) return payload;
    const user = await userFrom(context.accountability, context.database);
    for (const before of await storedItems(context, collection, keys)) {
      enforce({ action: 'update', collection, before, after: { ...before, ...payload }, user });
    }
    return payload;
  });

  filter('items.delete', async (keys, { collection }, context) => {
    if (!context.accountability || !SITE_COLLECTIONS.includes(collection)) return keys;
    const user = await userFrom(context.accountability, context.database);
    for (const before of await storedItems(context, collection, keys)) {
      enforce({ action: 'delete', collection, before, after: null, user });
    }
    return keys;
  });

  async function enforceFileOwnership(keys, context) {
    if (!context.accountability) return;
    const user = await userFrom(context.accountability, context.database);
    for (const file of await context.database('directus_files').whereIn('id', keys).select('id', 'uploaded_by')) {
      const reason = checkFileWrite({ file, user });
      if (reason) throw new PublishingRuleError(reason);
    }
  }

  filter('files.update', async (payload, { keys }, context) => {
    await enforceFileOwnership(keys ?? [], context);
    return payload;
  });

  filter('files.delete', async (keys, _meta, context) => {
    await enforceFileOwnership(keys, context);
    return keys;
  });

  // --- Publishing: ask the website to rebuild, then tell staff if it did not ----------------
  // The rebuild listener (cms/scripts/rebuild-listener.mjs) reports each build at /status.
  // While a member of staff has a change waiting, its builds are followed; if the one that
  // includes their change fails, or the listener cannot be reached, they get a notification
  // in the admin (bell icon) saying the website was not updated and why. The website keeps
  // its last successful build. A host's deploy hook without /status is not followed.
  const STATUS_URL = env.REBUILD_HOOK_URL?.replace(/\/rebuild$/, '/status');
  const POLL_MS = 5_000;
  const GIVE_UP_MS = 20 * 60_000;
  const pending = new Map(); // user id -> { since, collections }
  const lastOutcome = new Map(); // user id -> 'ok' | 'failed'
  const lastWarned = new Map(); // user id -> time of the last "could not ask" notification
  let polling = null;

  async function notify(recipient, subject, message) {
    if (!recipient) return;
    try {
      await database('directus_notifications').insert({ timestamp: new Date(), status: 'inbox', recipient, sender: null, subject, message });
    } catch (error) {
      logger.error(`[brid-publishing] could not notify ${recipient}: ${error.message}`);
    }
  }

  const what = (collections) => [...collections].map((c) => c.replace(/_/g, ' ')).join(', ');
  // Staff are told which website was updated: this setup only updates the local preview.
  const SITE = env.WEBSITE_ENVIRONMENT === 'production' ? 'the website' : 'the local preview website (not bridtown.com)';

  async function settle(user, entry, build) {
    pending.delete(user);
    if (build.ok) {
      // Sent only once the build that includes the change has finished successfully.
      await notify(user, 'Website updated', `Your changes (${what(entry.collections)}) are now on ${SITE}.`);
      lastOutcome.set(user, 'ok');
    } else {
      lastOutcome.set(user, 'failed');
      await notify(user, 'Website not updated',
        `Your changes (${what(entry.collections)}) were saved in the CMS but have not reached ${SITE}. ` +
        `${build.reason ?? 'The website build failed.'} The website still shows the last successful version. ` +
        'Saving again retries; if it keeps failing, contact the website administrator.');
    }
  }

  async function poll() {
    if (!pending.size) {
      clearInterval(polling);
      polling = null;
      return;
    }
    let status;
    try {
      const response = await fetch(STATUS_URL, { signal: AbortSignal.timeout(5000) });
      status = await response.json();
    } catch {
      status = null;
    }
    for (const [user, entry] of pending) {
      const build = status?.lastBuild;
      if (build?.finishedAt && Date.parse(build.startedAt) >= entry.since) await settle(user, entry, build);
      else if (Date.now() - entry.since > GIVE_UP_MS) {
        await settle(user, entry, { ok: false, reason: 'The website build did not finish within 20 minutes.' });
      }
    }
  }

  function follow(user, collection, requestedAt) {
    if (!user || !STATUS_URL) return;
    // Wait for a build that started after the latest change, so it includes all of them.
    const entry = pending.get(user) ?? { since: requestedAt, collections: new Set() };
    entry.since = Math.max(entry.since, requestedAt);
    entry.collections.add(collection);
    pending.set(user, entry);
    polling ??= setInterval(() => poll().catch((error) => logger.warn(`[brid-publishing] status check failed: ${error.message}`)), POLL_MS);
  }

  async function couldNotAsk(user, collection, detail) {
    logger.warn(`[brid-publishing] rebuild not requested: ${detail}`);
    if (!user || Date.now() - (lastWarned.get(user) ?? 0) < 10 * 60_000) return;
    lastWarned.set(user, Date.now());
    lastOutcome.set(user, 'failed');
    await notify(user, 'Website not updated',
      `Your change (${what([collection])}) was saved in the CMS, but the website could not be asked to update (${detail}). ` +
      'The website still shows the last successful version. Contact the website administrator.');
  }

  function requestRebuild(collection, event, user) {
    if (!env.REBUILD_HOOK_URL) {
      logger.warn('[brid-publishing] REBUILD_HOOK_URL is not set; content changes will not reach the website.');
      return;
    }
    const requestedAt = Date.now();
    fetch(env.REBUILD_HOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rebuild-secret': env.REBUILD_HOOK_SECRET ?? '' },
      body: JSON.stringify({ collection, event, urgent: URGENT_COLLECTIONS.includes(collection) }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => (response.ok ? follow(user, collection, requestedAt) : couldNotAsk(user, collection, `the rebuild service answered ${response.status}`)))
      .catch((error) => couldNotAsk(user, collection, error.name === 'TimeoutError' ? 'the rebuild service did not answer' : 'the rebuild service is not running'));
  }

  for (const event of ['create', 'update', 'delete']) {
    action(`items.${event}`, ({ collection }, { accountability }) => {
      if (SITE_COLLECTIONS.includes(collection)) requestRebuild(collection, event, accountability?.user ?? null);
    });
  }
  // Scheduled content: a news article whose publish time arrives, or an announcement that starts
  // or ends, changes the website without anyone saving. Checked every minute; one rebuild covers all.
  // After a restart, the first check looks back to the last successful website build.
  let checkedUpTo = null;
  schedule('* * * * *', async () => {
    if (checkedUpTo === null) {
      const status = STATUS_URL ? await fetch(STATUS_URL, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null) : null;
      checkedUpTo = Date.parse(status?.lastSuccessAt ?? '') || Date.now();
    }
    const from = new Date(checkedUpTo);
    const to = new Date();
    checkedUpTo = to.getTime();
    try {
      const between = (q, column) => q.orWhere((w) => w.where('status', 'published').where(column, '>', from).where(column, '<=', to));
      const [articles, announcements] = await Promise.all([
        between(database('articles'), 'published_at').count({ count: '*' }),
        between(between(database('announcements'), 'starts_at'), 'ends_at').count({ count: '*' }),
      ]);
      const due = Number(articles[0].count) + Number(announcements[0].count);
      if (due) {
        logger.info(`[brid-publishing] ${due} scheduled item(s) due: rebuilding`);
        requestRebuild(Number(articles[0].count) ? 'articles' : 'announcements', 'scheduled', null);
      }
    } catch (error) {
      logger.warn(`[brid-publishing] scheduled check failed: ${error.message}`);
    }
  });

  // Replacing a photo or moving its focal point changes the website too.
  action('files.update', (_meta, { accountability }) => requestRebuild('directus_files', 'update', accountability?.user ?? null));
};
