// Roles, policies and permissions, applied by cms/scripts/bootstrap.mjs.
// Bootstrap owns these policies: their permissions are replaced on every run, so this
// file is the single source of truth. Approval rules are enforced a second time by
// cms/extensions/brid-publishing, independent of licence tier.
import { ENQUIRY_TOPICS, MATCH_ARTICLE_CATEGORIES } from '../extensions/brid-publishing/rules.js';

const CRUD = ['create', 'read', 'update', 'delete'];

/** One permission row per action. `filter` limits which stored items; `validation` checks what is saved. */
const allow = (collection, actions, { filter = null, validation = null, fields = ['*'], presets = null } = {}) =>
  actions.map((action) => ({
    collection,
    action,
    fields,
    permissions: action === 'create' ? null : filter,
    validation: action === 'create' || action === 'update' ? validation : null,
    presets: action === 'create' || action === 'update' ? presets : null,
  }));

const ME = '$CURRENT_USER';
const notLive = { status: { _neq: 'published' } };

/** Read and update website enquiries about a role's topics. No delete: Club Admins delete them. */
const ENQUIRY_FIELDS = ['id', 'topic', 'handling', 'name', 'organisation', 'email', 'phone', 'message', 'consent', 'page', 'internal_notes', 'date_created'];
const enquiriesAbout = (role) => allow('enquiries', ['read', 'update'], { filter: { topic: { _in: ENQUIRY_TOPICS[role] } }, fields: ENQUIRY_FIELDS });
const unpublished = { status: { _in: ['draft', 'in_review'] } };

export const CONTENT_COLLECTIONS = [
  'competitions', 'people', 'squad_memberships', 'fixtures', 'league_tables', 'league_table_rows',
  'articles', 'announcements', 'sponsors', 'sponsorship_packages', 'events', 'pages',
];
const REFERENCE_COLLECTIONS = ['teams', 'seasons'];

const STAFF_DIRECTORY_FIELDS = ['id', 'first_name', 'last_name', 'avatar'];

export const POLICIES = {
  'Club Admin': {
    description: 'Manages all website content and approves other staff changes.',
    icon: 'verified_user',
    app_access: true,
    admin_access: false,
    enforce_tfa: true,
    permissions: [
      ...[...CONTENT_COLLECTIONS, ...REFERENCE_COLLECTIONS].flatMap((c) => allow(c, CRUD)),
      ...allow('site_settings', ['create', 'read', 'update']),
      ...allow('enquiries', ['read', 'update', 'delete']),
      ...allow('directus_files', CRUD),
      ...allow('directus_folders', CRUD),
      ...allow('directus_versions', CRUD),
      ...allow('directus_comments', ['create', 'read']),
      ...allow('directus_comments', ['update', 'delete'], { filter: { user_created: { _eq: ME } } }),
      ...allow('directus_activity', ['read']),
      ...allow('directus_revisions', ['read']),
      ...allow('directus_users', ['read'], { fields: [...STAFF_DIRECTORY_FIELDS, 'email', 'role', 'status', 'last_access'] }),
      ...allow('directus_roles', ['read'], { fields: ['id', 'name'] }),
    ],
  },

  'Staff editor': {
    description: 'Shared by every editor role: media library, versions, comments and reference data.',
    icon: 'edit',
    app_access: true,
    admin_access: false,
    enforce_tfa: false,
    permissions: [
      ...allow('directus_files', ['create', 'read']),
      ...allow('directus_files', ['update', 'delete'], { filter: { uploaded_by: { _eq: ME } } }),
      ...allow('directus_folders', ['read']),
      ...allow('directus_versions', ['create', 'read']),
      ...allow('directus_versions', ['update', 'delete'], { filter: { user_created: { _eq: ME } } }),
      ...allow('directus_comments', ['create', 'read']),
      ...allow('directus_comments', ['update', 'delete'], { filter: { user_created: { _eq: ME } } }),
      ...allow('directus_users', ['read'], { fields: STAFF_DIRECTORY_FIELDS }),
      ...REFERENCE_COLLECTIONS.flatMap((c) => allow(c, ['read'])),
      ...allow('competitions', ['read']),
    ],
  },

  'Media Editor': {
    description: 'News, articles, routine announcements, events and photographs. Major announcements need Club Admin approval.',
    icon: 'photo_camera',
    app_access: true,
    admin_access: false,
    enforce_tfa: false,
    permissions: [
      ...['articles', 'announcements', 'events'].flatMap((c) => [
        ...allow(c, ['create', 'read', 'update']),
        ...allow(c, ['delete'], { filter: notLive }),
      ]),
    ],
  },

  'Football Editor': {
    description: 'Squads, players, fixtures, results, league tables and match reports. Publishes directly.',
    icon: 'sports_soccer',
    app_access: true,
    admin_access: false,
    enforce_tfa: false,
    permissions: [
      ...['people', 'squad_memberships', 'fixtures', 'league_tables', 'league_table_rows'].flatMap((c) => [
        ...allow(c, ['create', 'read', 'update']),
        ...allow(c, ['delete'], { filter: c === 'league_table_rows' ? null : notLive }),
      ]),
      // Team details and squad lists (adding a player from a team saves the team). Not create/delete.
      ...allow('teams', ['update']),
      ...allow('seasons', ['create', 'update']),
      ...allow('competitions', ['create', 'update']),
      ...allow('articles', ['create', 'read', 'update'], {
        filter: { category: { _in: MATCH_ARTICLE_CATEGORIES } },
        validation: { category: { _in: MATCH_ARTICLE_CATEGORIES } },
        presets: { category: 'Match report' },
      }),
      ...allow('articles', ['delete'], { filter: { _and: [{ category: { _in: MATCH_ARTICLE_CATEGORIES } }, notLive] } }),
    ],
  },

  'Commercial Editor': {
    description: 'Sponsors, sponsorship packages and commercial pages. Changes go live only after Club Admin approval.',
    icon: 'handshake',
    app_access: true,
    admin_access: false,
    enforce_tfa: false,
    permissions: [
      ...['sponsors', 'sponsorship_packages'].flatMap((c) => [
        ...allow(c, ['read']),
        ...allow(c, ['create'], { validation: unpublished }),
        ...allow(c, ['update'], { filter: { status: { _in: ['draft', 'in_review', 'archived'] } }, validation: unpublished }),
        ...allow(c, ['delete'], { filter: unpublished }),
      ]),
      ...allow('pages', ['read'], { filter: { area: { _eq: 'commercial' } } }),
      ...allow('pages', ['create'], { validation: { _and: [{ area: { _eq: 'commercial' } }, unpublished] }, presets: { area: 'commercial' } }),
      ...allow('pages', ['update'], {
        filter: { _and: [{ area: { _eq: 'commercial' } }, { status: { _in: ['draft', 'in_review', 'archived'] } }] },
        validation: { _and: [{ area: { _eq: 'commercial' } }, unpublished] },
      }),
      ...allow('pages', ['delete'], { filter: { _and: [{ area: { _eq: 'commercial' } }, unpublished] } }),
      // Commercial enquiries from the website form (see ENQUIRY_TOPICS); the rest go to other roles.
      ...enquiriesAbout('Commercial Editor'),
    ],
  },

  'Enquiry form': {
    description: 'API-only account used by the website enquiry relay. Can only create enquiries; cannot read anything.',
    icon: 'mail',
    app_access: false,
    admin_access: false,
    enforce_tfa: false,
    permissions: [
      ...allow('enquiries', ['create'], { fields: ['topic', 'name', 'organisation', 'email', 'phone', 'message', 'consent', 'page'], presets: { handling: 'new' } }),
    ],
  },

  'Website build': {
    description: 'Read-only API access for the website build. Published content only; no Studio access.',
    icon: 'public',
    app_access: false,
    admin_access: false,
    enforce_tfa: false,
    permissions: [
      ...allow('site_settings', ['read']),
      ...REFERENCE_COLLECTIONS.flatMap((c) => allow(c, ['read'])),
      ...allow('competitions', ['read'], { filter: { status: { _eq: 'published' } } }),
      ...allow('people', ['read'], { filter: { status: { _eq: 'published' } }, fields: ['id', 'status', 'display_name', 'slug', 'photo', 'photo_description', 'photo_crop', 'biography', 'sponsor_name', 'sponsor_url'] }),
      ...allow('squad_memberships', ['read'], { filter: { status: { _eq: 'published' } }, fields: ['id', 'status', 'team', 'person', 'season', 'kind', 'shirt_number', 'position', 'captaincy', 'staff_title', 'left_on', 'sort'] }),
      ...allow('fixtures', ['read'], { filter: { status: { _eq: 'published' } }, fields: ['id', 'status', 'team', 'competition', 'season', 'opponent', 'opponent_badge', 'venue_type', 'venue', 'kickoff', 'match_status', 'score_for', 'score_against', 'attendance', 'source_match_id', 'public_note'] }),
      ...allow('league_tables', ['read'], { filter: { status: { _eq: 'published' } } }),
      ...allow('league_table_rows', ['read'], { filter: { league_table: { status: { _eq: 'published' } } } }),
      ...allow('articles', ['read'], { filter: { _and: [{ status: { _eq: 'published' } }, { _or: [{ published_at: { _null: true } }, { published_at: { _lte: '$NOW' } }] }] } }),
      ...allow('announcements', ['read'], {
        filter: { _and: [{ status: { _eq: 'published' } }, { _or: [{ starts_at: { _null: true } }, { starts_at: { _lte: '$NOW' } }] }, { _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: '$NOW' } }] }] },
      }),
      ...allow('sponsors', ['read'], { filter: { status: { _eq: 'published' } }, fields: ['id', 'status', 'name', 'tier', 'logo', 'website_url', 'description', 'starts_on', 'ends_on', 'featured', 'sort'] }),
      ...['sponsorship_packages', 'events'].flatMap((c) => allow(c, ['read'], { filter: { status: { _eq: 'published' } } })),
      ...allow('pages', ['read'], { filter: { status: { _eq: 'published' } }, fields: ['id', 'status', 'title', 'slug', 'area', 'summary', 'body', 'seo_title', 'seo_description'] }),
      ...allow('directus_files', ['read'], { fields: ['id', 'filename_download', 'type', 'filesize', 'width', 'height', 'focal_point_x', 'focal_point_y', 'modified_on', 'title', 'description'] }),
    ],
  },
};

/** Roles and the policies they combine. The Super Admin role is Directus's built-in administrator. */
export const ROLES = {
  'Club Admin': { icon: 'verified_user', description: 'Full content management, approval and publishing.', policies: ['Club Admin'] },
  'Media Editor': { icon: 'photo_camera', description: 'News, articles, photographs and announcements.', policies: ['Staff editor', 'Media Editor'] },
  'Football Editor': { icon: 'sports_soccer', description: 'Squads, fixtures, results and match reports.', policies: ['Staff editor', 'Football Editor'] },
  'Commercial Editor': { icon: 'handshake', description: 'Sponsors and commercial content, with Club Admin approval.', policies: ['Staff editor', 'Commercial Editor'] },
  'Website': { icon: 'public', description: 'API-only account used by the website build. Not a person.', policies: ['Website build'] },
  'Enquiry form': { icon: 'mail', description: 'API-only account used by the website enquiry form. Not a person.', policies: ['Enquiry form'] },
};

export const SUPER_ADMIN_ROLE = 'Super Admin';
