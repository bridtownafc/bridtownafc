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
