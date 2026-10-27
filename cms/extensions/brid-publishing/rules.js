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
 * Read limits within a collection, added to every query a role makes. These repeat the
 * item-level read rules in cms/schema/access.mjs, which Directus Core does not apply.
 */
const published = { status: { _eq: PUBLISHED } };
export const READ_SCOPES = {
  'Commercial Editor': {
    enquiries: { topic: { _eq: 'commercial' } },
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
