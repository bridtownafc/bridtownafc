// Directus hook: enforces the club's publishing rules (rules.js) on every write and asks
// the website to rebuild when site content changes. Writes made by Directus itself
// (no accountability) and by administrators are never blocked.
import { SITE_COLLECTIONS, URGENT_COLLECTIONS, checkFileWrite, checkWrite } from './rules.js';

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

export default ({ filter, action }, { env, logger }) => {
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

  function requestRebuild(collection, event) {
    if (!env.REBUILD_HOOK_URL) return;
    fetch(env.REBUILD_HOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rebuild-secret': env.REBUILD_HOOK_SECRET ?? '' },
      body: JSON.stringify({ collection, event, urgent: URGENT_COLLECTIONS.includes(collection) }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok) logger.warn(`[brid-publishing] rebuild hook answered ${response.status}`);
      })
      .catch((error) => logger.warn(`[brid-publishing] rebuild hook unreachable: ${error.message}`));
  }

  for (const event of ['create', 'update', 'delete']) {
    action(`items.${event}`, ({ collection }) => {
      if (SITE_COLLECTIONS.includes(collection)) requestRebuild(collection, event);
    });
  }
  // Replacing a photo or moving its focal point changes the website too.
  action('files.update', () => requestRebuild('directus_files', 'update'));
};
