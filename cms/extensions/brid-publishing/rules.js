// Publishing rules for Bridlington Town AFC, enforced on every create, update and delete
// regardless of licence tier. They repeat the item-level permission rules set up by
// cms/scripts/bootstrap.mjs, so approvals hold even if those rules stop applying.
// Pure functions only: no Directus imports, so they can be unit-tested directly.

export const PUBLISHED = 'published';

/** Roles that may publish anything and approve other people's changes. */
export const APPROVER_ROLES = ['Club Admin'];

/** Content that needs Club Admin approval before it goes live, and while it is live. */
export const APPROVAL_RULES = {
  sponsors: () => true,
  sponsorship_packages: () => true,
  pages: () => true,
  announcements: (item) => item.importance === 'major',
};

export const MATCH_ARTICLE_CATEGORIES = ['Match report', 'Match preview'];

/** Items a role may touch within a collection it otherwise has access to. */
export const SCOPE_RULES = {
  'Football Editor': {
    articles: { allows: (item) => MATCH_ARTICLE_CATEGORIES.includes(item.category), describe: 'match reports and previews' },
  },
  'Commercial Editor': {
    pages: { allows: (item) => item.area === 'commercial', describe: 'commercial pages' },
  },
};

/**
 * Website enquiry topics each editor role handles. Club Admins see every enquiry, including
 * "general"; the matching permissions are in cms/schema/access.mjs. Only access the club has
 * authorised is listed: Commercial Editors have always handled commercial enquiries.
 */
export const ENQUIRY_TOPICS = {
  'Commercial Editor': ['commercial'],
};

/**
 * Proposed further routing, awaiting the club's confirmation (it would give these roles access
 * they do not have today). To adopt it, merge it into ENQUIRY_TOPICS and re-run bootstrap.
 */
export const PROPOSED_ENQUIRY_TOPICS = {
  'Football Editor': ['football', 'matchday'],
  'Media Editor': ['community'],
};

/** Whether a user may see and update an enquiry about `topic`. */
export function canHandleEnquiry({ topic, user }) {
  if (user.admin || user.roleNames.some((role) => APPROVER_ROLES.includes(role))) return true;
  return user.roleNames.some((role) => ENQUIRY_TOPICS[role]?.includes(topic));
}

/**
 * Read limits within a collection, added to every query a role makes. These repeat the
 * item-level read rules in cms/schema/access.mjs, which Directus Core does not apply.
 */
const published = { status: { _eq: PUBLISHED } };
export const READ_SCOPES = {
  'Commercial Editor': {
    enquiries: { topic: { _in: ENQUIRY_TOPICS['Commercial Editor'] } },
    pages: { area: { _eq: 'commercial' } },
  },
  // The website build token: published content only (and articles only once their time has come).
  Website: {
    ...Object.fromEntries(['competitions', 'people', 'squad_memberships', 'fixtures', 'league_tables', 'sponsors', 'sponsorship_packages', 'events', 'pages', 'announcements'].map((c) => [c, published])),
    league_table_rows: { league_table: published },
    articles: (now) => ({ _and: [published, { _or: [{ published_at: { _null: true } }, { published_at: { _lte: now } }] }] }),
  },
};

/**
 * Adds a role's read limits to a query's filter.
 * @param {{ collection: string, query: object, user: { admin: boolean, roleNames: string[] }, now?: string }} read
 * @returns {object} the query to run
 */
export function scopeQuery({ collection, query, user, now = new Date().toISOString() }) {
  if (user.admin || user.roleNames.some((role) => APPROVER_ROLES.includes(role))) return query;
  const limits = user.roleNames
    .map((role) => READ_SCOPES[role]?.[collection])
    .filter(Boolean)
    .map((limit) => (typeof limit === 'function' ? limit(now) : limit));
  if (!limits.length) return query;
  const filters = [...(query.filter ? [query.filter] : []), ...limits];
  return { ...query, filter: { _and: filters } };
}

/**
 * A team allocation must name its team. Added from a team's Squad list, Directus fills it in
 * when the team is saved; anywhere else, staff choose it. Returns a reason, or null.
 */
export function checkAllocation({ action, before, after }) {
  if (action === 'delete') return null;
  const team = after?.team ?? (action === 'update' && !('team' in (after ?? {})) ? before?.team : null);
  return team === null || team === undefined || team === ''
    ? "Choose the team for this allocation. (Adding someone from a team's Squad list fills it in automatically.)"
    : null;
}

/**
 * Settings that only Club Admins and administrators change: a team's name and website key,
 * and its FA Full-Time snippets. Editors may still manage the team's squad from its page.
 */
export const TEAM_FIELDS_FOR_EDITORS = ['squad', 'placeholder_cards'];

/**
 * Protects settings and provider identifiers from ordinary editors. Returns a reason, or null.
 * @param {{ action: 'create'|'update'|'delete', collection: string, before: object|null, payload: object|null, user: { admin: boolean, roleNames: string[] } }} write
 */
export function checkProtectedFields({ action, collection, before, payload, user }) {
  if (user.admin || user.roleNames.some((role) => APPROVER_ROLES.includes(role))) return null;
  if (collection === 'teams' && action === 'update') {
    const other = Object.keys(payload ?? {}).filter((field) => !TEAM_FIELDS_FOR_EDITORS.includes(field));
    if (other.length) return "Only a Club Admin can change a team's name, website key or FA Full-Time settings. You can still manage its squad.";
  }
  if (collection === 'fixtures' && action === 'update' && before?.source_match_id && payload && 'source_match_id' in payload
    && (payload.source_match_id ?? '') !== before.source_match_id) {
    return 'The Match Centre reference links this correction to the imported match and cannot be changed. Create a new correction for a different match.';
  }
  return null;
}

/** Display names compared for duplicates: case, accents and extra spaces ignored. */
export const nameKey = (name) => String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Refuses a second profile with the same display name. Returns a reason, or null. */
export function checkDuplicatePerson({ name, existing }) {
  return existing.some((other) => nameKey(other) === nameKey(name)) && nameKey(name)
    ? `A profile called "${String(name).trim()}" already exists. To add them to a team, choose the existing profile instead of creating a new one. If this is a different person, use a name that tells them apart (for example with a middle initial).`
    : null;
}

/** Refuses a second current allocation of the same person to the same team. Returns a reason, or null. */
export function checkDuplicateAllocation({ duplicates, personName, teamName }) {
  return duplicates > 0
    ? `${personName ?? 'This person'} is already in ${teamName ?? 'this team'}. Open their existing allocation instead (set it back to Active if they have returned).`
    : null;
}

/** Collections whose published content appears on the website. */
export const SITE_COLLECTIONS = [
  'teams', 'seasons', 'competitions', 'people', 'squad_memberships', 'fixtures', 'league_tables',
  'league_table_rows', 'articles', 'announcements', 'sponsors', 'sponsorship_packages', 'events',
  'pages', 'site_settings',
];

/** Matchday changes rebuild straight away instead of waiting for edits to settle. */
export const URGENT_COLLECTIONS = ['fixtures', 'league_tables', 'league_table_rows', 'announcements'];

/**
 * Decides whether a write is allowed.
 * @param {object} write
 * @param {'create'|'update'|'delete'} write.action
 * @param {string} write.collection
 * @param {object|null} write.before  stored item (update/delete), null on create
 * @param {object|null} write.after   item as it would be saved (create/update), null on delete
 * @param {{ admin: boolean, roleNames: string[] }} write.user
 * @returns {string|null} reason the write is refused, or null when it is allowed
 */
export function checkWrite({ action, collection, before, after, user }) {
  if (user.admin || user.roleNames.some((role) => APPROVER_ROLES.includes(role))) return null;

  for (const role of user.roleNames) {
    const scope = SCOPE_RULES[role]?.[collection];
    if (!scope) continue;
    if ((before && !scope.allows(before)) || (after && !scope.allows(after))) {
      return `${role}s can only manage ${scope.describe}.`;
    }
  }

  if (action === 'delete' && before?.status === PUBLISHED) {
    return 'This item is live on the website. Archive it, or ask a Club Admin to delete it.';
  }

  const needsApproval = APPROVAL_RULES[collection];
  if (!needsApproval) return null;

  const isLive = (item) => item?.status === PUBLISHED && needsApproval(item);
  if (isLive(before)) {
    return action === 'delete'
      ? 'This item is live on the website. Ask a Club Admin to remove it.'
      : 'This item is live on the website. Create a version with your changes and a Club Admin will review and publish it.';
  }
  if (isLive(after)) {
    return 'Publishing this needs Club Admin approval. Save it as "In review" and a Club Admin will publish it.';
  }
  return null;
}

/**
 * Editors may change or delete only the media they uploaded; Club Admins any.
 * @param {{ file: { uploaded_by?: string|null }, user: { admin: boolean, roleNames: string[], id?: string|null } }} write
 * @returns {string|null}
 */
export function checkFileWrite({ file, user }) {
  if (user.admin || user.roleNames.some((role) => APPROVER_ROLES.includes(role))) return null;
  if (file.uploaded_by && file.uploaded_by === user.id) return null;
  return 'You can only change or delete files you uploaded. Ask a Club Admin for help with this file.';
}

/** Web addresses filled in automatically: collection -> the field they are made from. */
export const SLUG_SOURCES = { people: 'display_name', articles: 'title', events: 'title', pages: 'title' };

/** Lower-case words joined by hyphens, e.g. "Jess O'Corner" -> "jess-ocorner". Empty if nothing usable. */
export function slugify(text) {
  return String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

/** The first of base, base-2, base-3 … not in `taken`. */
export function uniqueSlug(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Image formats the website can publish (cms/scripts/sync.mjs PHOTO_TYPES). */
export const WEB_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Refuses a photo the website cannot show, with a reason staff can act on. Returns a reason, or null. */
export function checkPhotoFile(file) {
  if (!file) return null;
  if (WEB_PHOTO_TYPES.includes(file.type)) return null;
  const kind = file.type ? file.type.replace(/^image\//, '').toUpperCase() : 'unknown';
  return `"${file.filename_download}" is a ${kind} file, which the website cannot show. Please upload a JPEG, PNG or WebP photo (most phones can share a photo as JPEG).`;
}
