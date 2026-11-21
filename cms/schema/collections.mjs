// Bridlington Town AFC content model, applied by cms/scripts/bootstrap.mjs.
// Every publishable collection has a status (draft → in review → published → archived),
// audit fields, revision history and content versions. Bootstrap only ever adds
// collections, fields and relations; it never changes or deletes existing ones.

const choices = (...values) => values.map((v) => (typeof v === 'string' ? { text: v, value: v } : v));

const field = (name, type, meta = {}, schema = {}) => ({ field: name, type, meta: { width: 'full', ...meta }, schema });

const text = (name, meta = {}, schema = {}) => field(name, 'string', { interface: 'input', ...meta }, schema);
const required = (name, meta = {}, schema = {}) => text(name, { required: true, ...meta }, { is_nullable: false, ...schema });
const longText = (name, meta = {}) => field(name, 'text', { interface: 'input-multiline', ...meta });
const markdown = (name, meta = {}) => field(name, 'text', { interface: 'input-rich-text-md', ...meta });
const integer = (name, meta = {}, schema = {}) => field(name, 'integer', { interface: 'input', ...meta }, schema);
const bool = (name, meta = {}) => field(name, 'boolean', { interface: 'boolean', special: ['cast-boolean'], ...meta }, { default_value: false });
const date = (name, meta = {}) => field(name, 'date', { interface: 'datetime', ...meta });
const timestamp = (name, meta = {}) => field(name, 'timestamp', { interface: 'datetime', ...meta });
const select = (name, options, meta = {}, schema = {}) =>
  field(name, 'string', { interface: 'select-dropdown', options: { choices: choices(...options) }, display: 'labels', ...meta }, schema);
const slug = (name = 'slug', note = 'Web address, e.g. jess-corner. Lower-case words separated by hyphens.') =>
  required(name, { note, options: { slug: true, trim: true }, validation: { [name]: { _regex: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } }, validation_message: 'Use lower-case letters, numbers and hyphens only.' }, { is_unique: true });
const internalNotes = () => longText('internal_notes', { note: 'Staff only. Never shown on the website.' });

/** Many-to-one: `relation` is created alongside the field. */
const m2o = (name, related, meta = {}, onDelete = 'SET NULL') => ({
  ...field(name, 'integer', { interface: 'select-dropdown-m2o', special: ['m2o'], ...meta }),
  relation: { related_collection: related, schema: { on_delete: onDelete } },
});
const image = (name, meta = {}) => ({
  ...field(name, 'uuid', { interface: 'file-image', special: ['file'], ...meta }),
  relation: { related_collection: 'directus_files', schema: { on_delete: 'SET NULL' } },
});

const STATUS = field(
  'status',
  'string',
  {
    interface: 'select-dropdown',
    width: 'half',
    required: true,
    display: 'labels',
    options: {
      choices: [
        { text: 'Draft', value: 'draft', color: '#A2B5CD' },
        { text: 'In review', value: 'in_review', color: '#FFA439' },
        { text: 'Published', value: 'published', color: '#2ECDA7' },
        { text: 'Archived', value: 'archived', color: '#6B6B6B' },
      ],
    },
    note: 'Only Published items appear on the website.',
  },
  { default_value: 'draft', is_nullable: false },
);

const SORT = integer('sort', { hidden: true });

const AUDIT = [
  { ...field('user_created', 'uuid', { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }), relation: { related_collection: 'directus_users' } },
  field('date_created', 'timestamp', { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }),
  { ...field('user_updated', 'uuid', { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }), relation: { related_collection: 'directus_users' } },
  field('date_updated', 'timestamp', { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }),
];

const collection = (name, meta, fields, { publishable = true } = {}) => ({
  collection: name,
  meta: {
    accountability: 'all',
    // Draft versions only where approvals need them; elsewhere Website status is the one control.
    versioning: publishable && ['sponsors', 'sponsorship_packages', 'pages', 'announcements'].includes(name),
    ...(publishable ? { archive_field: 'status', archive_value: 'archived', unarchive_value: 'draft' } : {}),
    ...(fields.some((f) => f.field === 'sort') ? { sort_field: 'sort' } : {}),
    ...meta,
  },
  fields: [...(publishable ? [STATUS] : []), ...fields, ...AUDIT],
});

const TEAM_HINT = 'Leave empty for club-wide content shown to both teams.';
const LINK_TARGETS = [
  { text: "Team news page", value: 'news' },
  { text: 'Match Centre', value: 'matches' },
  { text: 'Squad page', value: 'team' },
  { text: 'Club page', value: 'club' },
  { text: 'Commercial page', value: 'commercial' },
  { text: 'Contact page', value: 'contact' },
];

export const ARTICLE_CATEGORIES = ['Club news', 'Match report', 'Match preview', 'Player news', 'Commercial', 'Community', 'Events', 'Statement'];

// FA Full-Time code snippets (Full-Time Admin > Media > Code Snippets). All optional.
const FULLTIME_CODE_FIELDS = [
  ['table', 'League table'],
  ['fixtures_results', 'Team fixtures and results (combined)'],
  ['fixtures', 'Upcoming fixtures (if supplied separately)'],
  ['results', 'Recent results (if supplied separately)'],
].map(([kind, label]) =>
  longText(`fulltime_${kind}_code`, {
    note: `${label}: paste the whole FA Full-Time code snippet, or just its number. Leave empty if not supplied.`,
  }));

export const COLLECTIONS = [
  collection('site_settings', { singleton: true, icon: 'settings', note: 'Club-wide contact details and social links.', group: null }, [
    required('club_name', { width: 'half' }, { default_value: 'Bridlington Town AFC' }),
    text('ground_name', { width: 'half' }),
    longText('address'),
    text('contact_email', { width: 'half' }),
    text('contact_phone', { width: 'half' }),
    text('facebook_url', { width: 'half' }),
    text('instagram_url', { width: 'half' }),
    text('x_url', { width: 'half' }),
    text('youtube_url', { width: 'half' }),
  ], { publishable: false }),

  collection('teams', { icon: 'groups', note: "The club's teams. Changing a key changes website addresses." }, [
    required('key', { width: 'half', readonly: true, note: 'Used in website addresses (/mens/, /womens/).' }, { is_unique: true }),
    required('name', { width: 'half' }),
    integer('placeholder_cards', { width: 'half', note: '"Player to be confirmed" cards shown after the named players.' }, { default_value: 0, is_nullable: false }),
    ...FULLTIME_CODE_FIELDS,
    SORT,
  ], { publishable: false }),

  collection('seasons', { icon: 'date_range' }, [
    required('name', { width: 'half', note: 'e.g. 2026/27' }, { is_unique: true }),
    bool('is_current', { width: 'half' }),
    date('starts_on', { width: 'half' }),
    date('ends_on', { width: 'half' }),
  ], { publishable: false }),

  collection('competitions', { icon: 'emoji_events' }, [
    required('name', { width: 'half' }),
    text('short_name', { width: 'half' }),
    text('governing_body', { width: 'half' }),
    text('data_source', { width: 'half', note: 'Where fixtures and tables are verified.' }),
  ]),

  collection('people', { icon: 'person', display_template: '{{display_name}}', note: 'Players and staff. People are never deleted when they leave; close their squad membership instead.' }, [
    required('display_name', { width: 'half', note: 'Name as shown on the website.' }),
    slug(),
    image('photo', { width: 'half', note: 'Official squad photo. The website crops it to a 4:5 portrait.' }),
    text('photo_description', { width: 'half', note: 'Describes the photo for screen readers, e.g. "squad portrait in the red club shirt".' }),
    field('photo_crop', 'json', { interface: 'input-code', options: { language: 'json' }, hidden: true, note: 'Exact crop {left, top, width, height}; set by the import. Leave empty to crop automatically.' }),
    markdown('biography'),
    internalNotes(),
  ]),

  collection('squad_memberships', { icon: 'badge', display_template: '{{person.display_name}} ({{team.name}})' }, [
    m2o('team', 'teams', { required: true, width: 'half' }, 'RESTRICT'),
    m2o('person', 'people', { required: true, width: 'half', template: '{{display_name}}' }, 'RESTRICT'),
    m2o('season', 'seasons', { width: 'half' }),
    select('kind', ['player', 'staff'].map((v) => ({ text: v[0].toUpperCase() + v.slice(1), value: v })), { width: 'half', required: true }, { default_value: 'player', is_nullable: false }),
    integer('shirt_number', { width: 'half' }),
    select('position', ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], { width: 'half' }),
    text('staff_title', { width: 'half', note: 'Staff only, e.g. Manager.' }),
    date('left_on', { width: 'half', note: 'Set when the person leaves; they disappear from the squad page.' }),
    SORT,
  ]),

  collection('fixtures', { icon: 'sports_soccer', display_template: '{{team.name}} v {{opponent}}' }, [
    m2o('team', 'teams', { required: true, width: 'half' }, 'RESTRICT'),
    m2o('competition', 'competitions', { width: 'half' }),
    m2o('season', 'seasons', { width: 'half' }),
    required('opponent', { width: 'half' }),
    image('opponent_badge', { width: 'half' }),
    select('venue_type', ['Home', 'Away', 'Neutral'].map((t) => ({ text: t, value: t.toLowerCase() })), { width: 'half' }, { default_value: 'home' }),
    text('venue', { width: 'half' }),
    timestamp('kickoff', { width: 'half', required: true }),
    select('match_status', [
      { text: 'Scheduled', value: 'scheduled' }, { text: 'Live', value: 'live' }, { text: 'Full time', value: 'full_time' },
      { text: 'Postponed', value: 'postponed' }, { text: 'Abandoned', value: 'abandoned' }, { text: 'Cancelled', value: 'cancelled' },
    ], { width: 'half', note: 'Matchday changes rebuild the website straight away.' }, { default_value: 'scheduled', is_nullable: false }),
    integer('score_for', { width: 'half', note: 'Bridlington Town goals.' }),
    integer('score_against', { width: 'half' }),
    integer('attendance', { width: 'half' }),
    text('source_match_id', {
      width: 'half',
      note: 'To correct a match imported automatically, enter its id from the Match Centre (e.g. football-web-pages:591448). Leave empty for a match the source does not list.',
      validation: { source_match_id: { _regex: '^[a-z0-9-]+:[A-Za-z0-9_.-]+$' } },
      validation_message: 'Copy the id exactly as shown, e.g. football-web-pages:591448.',
    }),
    text('public_note', { width: 'half', note: 'Optional note shown with the match, e.g. "Rearranged from 14 November".' }),
    internalNotes(),
  ]),

  collection('league_tables', { icon: 'leaderboard', display_template: '{{competition.name}} {{effective_at}}' }, [
    m2o('team', 'teams', { required: true, width: 'half' }, 'RESTRICT'),
    m2o('competition', 'competitions', { width: 'half' }),
    m2o('season', 'seasons', { width: 'half' }),
    timestamp('effective_at', { width: 'half', note: 'When this table was correct.' }),
    text('source', { note: 'Where the table was taken from.' }),
    { ...field('rows', 'alias', { interface: 'list-o2m', special: ['o2m'], options: { template: '{{position}}. {{club_name}} — {{points}} pts' } }), alias: true },
  ]),

  collection('league_table_rows', { icon: 'table_rows', hidden: true, display_template: '{{position}}. {{club_name}}' }, [
    { ...m2o('league_table', 'league_tables', { hidden: true }, 'CASCADE'), relation: { related_collection: 'league_tables', schema: { on_delete: 'CASCADE' }, meta: { one_field: 'rows', sort_field: 'sort' } } },
    integer('position', { width: 'half', required: true }),
    required('club_name', { width: 'half' }),
    bool('is_bridlington', { width: 'half' }),
    integer('played', { width: 'half' }), integer('won', { width: 'half' }), integer('drawn', { width: 'half' }), integer('lost', { width: 'half' }),
    integer('goals_for', { width: 'half' }), integer('goals_against', { width: 'half' }), integer('points', { width: 'half' }),
    SORT,
  ], { publishable: false }),

  collection('articles', { icon: 'article', display_template: '{{title}}' }, [
    required('title'),
    slug('slug', 'Web address for the article page.'),
    select('category', ARTICLE_CATEGORIES, { width: 'half', required: true }, { is_nullable: false, default_value: 'Club news' }),
    m2o('team', 'teams', { width: 'half', note: TEAM_HINT }),
    longText('summary', { required: true, note: 'One or two sentences shown on news cards.' }),
    markdown('body'),
    image('hero_image', { width: 'half' }),
    text('hero_image_alt', { width: 'half', note: 'Describe the photo for screen readers.' }),
    timestamp('published_at', { width: 'half', note: 'Leave empty to publish immediately; set a future time to schedule.' }),
    select('link', LINK_TARGETS, { width: 'half', note: 'Where "Read more" goes until article pages are added.' }, { default_value: 'news' }),
    SORT,
  ]),

  collection('announcements', { icon: 'campaign', display_template: '{{title}}' }, [
    required('title'),
    longText('message', { required: true }),
    select('importance', [
      { text: 'Routine (Media Editors can publish)', value: 'routine' },
      { text: 'Major club announcement (Club Admin approval)', value: 'major' },
    ], { width: 'half', required: true }, { default_value: 'routine', is_nullable: false }),
    m2o('team', 'teams', { width: 'half', note: TEAM_HINT }),
    text('link_url', { note: 'Optional link, e.g. /club/ or a full https:// address.' }),
    timestamp('starts_at', { width: 'half' }),
    timestamp('ends_at', { width: 'half' }),
  ]),

  collection('sponsors', { icon: 'handshake', display_template: '{{name}} ({{tier}})', note: 'Publishing or changing a live sponsor needs Club Admin approval.' }, [
    required('name', { width: 'half' }),
    select('tier', ['Principal partner', 'Main partner', 'Official partner', 'Community partner', 'Matchday partner'], { width: 'half', required: true }, { is_nullable: false }),
    image('logo', { width: 'half' }),
    text('website_url', { width: 'half' }),
    longText('description'),
    date('starts_on', { width: 'half' }),
    date('ends_on', { width: 'half', note: 'The sponsor stops appearing after this date.' }),
    bool('featured', { width: 'half' }),
    SORT,
    internalNotes(),
  ]),

  collection('sponsorship_packages', { icon: 'sell', display_template: '{{title}}', note: 'Publishing or changing a live package needs Club Admin approval.' }, [
    required('title'),
    required('category', { width: 'half', note: 'e.g. Advertising, Matchday' }),
    text('price_label', { width: 'half', note: 'Internal only. Prices are never shown on the website; visitors are asked to contact the club.' }),
    field('price_amount', 'decimal', { interface: 'input', width: 'half', note: 'Internal only, for reporting. Never shown on the website.' }, { numeric_precision: 10, numeric_scale: 2 }),
    required('detail', { note: 'Short description shown under the title.' }),
    SORT,
  ]),

  collection('events', { icon: 'event', display_template: '{{title}}' }, [
    required('title'),
    slug(),
    m2o('team', 'teams', { width: 'half', note: TEAM_HINT }),
    timestamp('starts_at', { width: 'half', required: true }),
    timestamp('ends_at', { width: 'half' }),
    text('venue', { width: 'half' }),
    text('booking_url', { width: 'half' }),
    image('image', { width: 'half' }),
    markdown('description'),
  ]),

  collection('pages', { icon: 'description', display_template: '{{title}}', note: 'Publishing or changing a live page needs Club Admin approval.' }, [
    required('title'),
    slug(),
    select('area', ['club', 'commercial', 'matchday', 'community', 'policies'].map((v) => ({ text: v[0].toUpperCase() + v.slice(1), value: v })), { width: 'half', required: true }, { is_nullable: false }),
    date('review_due', { width: 'half', note: 'When the page owner should check it again.' }),
    longText('summary'),
    markdown('body'),
    text('seo_title', { width: 'half' }),
    text('seo_description', { width: 'half' }),
    internalNotes(),
  ]),
];

// Not publishable and not website content: messages sent through the website's enquiry
// form. Created only through the enquiry relay (cms/scripts/enquiry-relay.mjs).
COLLECTIONS.push(
  collection('enquiries', { icon: 'mail', display_template: '{{topic}}: {{name}}', note: 'Messages from the website enquiry form. Personal data: delete once dealt with (see docs/CMS.md).' }, [
    select('topic', ['commercial', 'matchday', 'football', 'community', 'general'].map((v) => ({ text: v[0].toUpperCase() + v.slice(1), value: v })), { width: 'half', readonly: true }),
    select('handling', [{ text: 'New', value: 'new' }, { text: 'In progress', value: 'in_progress' }, { text: 'Done', value: 'done' }], { width: 'half' }, { default_value: 'new' }),
    text('name', { width: 'half', readonly: true }),
    text('organisation', { width: 'half', readonly: true }),
    text('email', { width: 'half', readonly: true }),
    text('phone', { width: 'half', readonly: true }),
    longText('message', { readonly: true }),
    bool('consent', { width: 'half', readonly: true, note: 'Agreed to the club using these details to reply.' }),
    text('page', { width: 'half', readonly: true, note: 'Website page the form was sent from.' }),
    internalNotes(),
  ], { publishable: false }),
);

/** Changes to existing fields' editor settings (bootstrap otherwise never changes a field). */
export const FIELD_UPDATES = [
  // Prices are no longer shown on the website, so they are optional and internal.
  { collection: 'sponsorship_packages', field: 'price_label', meta: { required: false, note: 'Internal only. Prices are never shown on the website; visitors are asked to contact the club.' }, schema: { is_nullable: true } },
  { collection: 'sponsorship_packages', field: 'price_amount', meta: { note: 'Internal only, for reporting. Never shown on the website.' } },
  // Full-Time codes were numbers-only strings; staff now paste whole snippets, which need a
  // longer text column and no numbers-only validation. The website extracts the number.
  ...FULLTIME_CODE_FIELDS
    .filter((f) => f.field !== 'fulltime_fixtures_results_code')
    .map((f) => ({ collection: 'teams', field: f.field, type: f.type, meta: { ...f.meta, validation: null, validation_message: null } })),
];
export const COLLECTION_UPDATES = [
  { collection: 'sponsorship_packages', meta: { display_template: '{{title}}' } },
];

export const FOLDERS = ['Squad photos', 'News', 'Sponsors', 'Events', 'Pages', 'Opposition badges'];
