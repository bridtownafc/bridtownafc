// Player and team management in the staff admin, applied by cms/scripts/player-admin.mjs
// (run it after cms:bootstrap). Adds to the content model in collections.mjs:
// - a Squad list on each team and a Teams list on each player, so staff add, move,
//   reorder and remove players from either side (squad_memberships stays the only link);
// - name, sponsor and captaincy fields; labelled, grouped forms with validation;
// - plain-English collection names in folders, list layouts and bookmarks.
// A team allocation's status doubles as its squad status: Active = published (on the
// squad page), Inactive = draft, Removed from team = archived. cms:sync already lists
// only published allocations of published people, so no website change is needed for it.

const label = (text) => [{ language: 'en-GB', translation: text }, { language: 'en-US', translation: text }];
const names = (singular, plural = singular) =>
  ['en-GB', 'en-US'].map((language) => ({ language, translation: plural, singular, plural }));

const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
const orNull = (field, rule) => ({ _or: [{ [field]: { _null: true } }, { [field]: rule }] });
const playerOnly = [{ name: 'Players only', rule: { kind: { _eq: 'staff' } }, hidden: true }];
const staffOnly = [{ name: 'Staff only', rule: { kind: { _neq: 'staff' } }, hidden: true }];

const group = (field, text, { open = true } = {}) => ({
  field,
  type: 'alias',
  meta: { interface: 'group-detail', special: ['alias', 'no-data', 'group'], options: { start: open ? 'open' : 'closed' }, width: 'full', translations: label(text) },
});

/** Fields this step creates when missing. Groups come first so their members can join them. */
export const NEW_FIELDS = {
  people: [
    group('group_name', 'Name'),
    group('group_photo', 'Photograph'),
    group('group_teams', 'Teams'),
    group('group_profile', 'Profile and sponsor'),
    group('group_staff', 'Staff only', { open: false }),
    { field: 'first_name', type: 'string', meta: { interface: 'input', width: 'half' } },
    { field: 'surname', type: 'string', meta: { interface: 'input', width: 'half' } },
    { field: 'team_allocations', type: 'alias', meta: { interface: 'list-o2m', special: ['o2m'] } },
    { field: 'sponsor_name', type: 'string', meta: { interface: 'input', width: 'half' } },
    { field: 'sponsor_url', type: 'string', meta: { interface: 'input', width: 'half' } },
  ],
  squad_memberships: [
    { field: 'captaincy', type: 'string', meta: { interface: 'select-dropdown', width: 'half' } },
  ],
  teams: [
    group('group_squad', 'Squad'),
    { field: 'squad', type: 'alias', meta: { interface: 'list-o2m', special: ['o2m'] } },
  ],
};

/**
 * Form layout and editor settings, in display order. Each entry is [field, group, meta];
 * `sort` and `group` are set from the position. Only the meta keys given are changed.
 */
export const LAYOUT = {
  people: [
    ['status', null, {
      translations: label('Website status'),
      options: { choices: [
        { text: 'Draft (not on the website)', value: 'draft', color: '#A2B5CD' },
        { text: 'In review', value: 'in_review', color: '#FFA439' },
        { text: 'Published (on the website)', value: 'published', color: '#2ECDA7' },
        { text: 'Archived', value: 'archived', color: '#6B6B6B' },
      ] },
      note: 'Draft profiles are saved but never shown on the website. Choose Published and save to show this person on every team they are Active in.',
    }],
    ['group_name', null, {}],
    ['first_name', 'group_name', { translations: label('First name') }],
    ['surname', 'group_name', { translations: label('Surname') }],
    ['display_name', 'group_name', { translations: label('Display name'), note: 'The name shown on the website, e.g. a preferred first name and surname.' }],
    ['slug', 'group_name', { translations: label('Web address'), required: false, note: 'Filled in automatically from the display name when left empty (e.g. jess-corner). Changing it later changes the profile page address.' }],
    ['group_photo', null, {}],
    ['photo', 'group_photo', {
      translations: label('Profile photograph'),
      display: 'image',
      options: { folder: null, crop: false, letterbox: true },
      note: 'Upload a portrait photo (JPEG, PNG or WebP, up to 25 MB). To replace it, remove this photo and upload the new one. The website crops it to a 4:5 portrait around the focal point set on the photo.',
    }],
    ['photo_description', 'group_photo', { translations: label('Photo description'), note: 'For screen readers, e.g. "squad portrait in the red home shirt".' }],
    ['photo_crop', 'group_photo', {}],
    ['group_teams', null, {}],
    ['team_allocations', 'group_teams', {
      translations: label('Team allocations'),
      note: 'The teams this person is in. Add a team with "Create new". Squad number, position and captaincy are set per team. To take them out of a team, open the allocation and set its Squad status to Removed from team.',
      display: 'related-values',
      display_options: { template: '{{team.name}}' },
      options: {
        layout: 'table',
        fields: ['team', 'position', 'shirt_number', 'captaincy', 'status'],
        enableCreate: true,
        enableSelect: false,
        enableLink: true,
        limit: 25,
      },
    }],
    ['group_profile', null, {}],
    ['biography', 'group_profile', { translations: label('Biography'), note: 'Optional. A few sentences about the player. Do not include private details such as dates of birth, addresses or contact details.' }],
    ['sponsor_name', 'group_profile', { translations: label('Player sponsor'), note: 'Optional. The person or business sponsoring this player.' }],
    ['sponsor_url', 'group_profile', {
      translations: label('Sponsor website'),
      note: 'Optional. Full address starting https://',
      validation: { _or: [{ sponsor_url: { _null: true } }, { sponsor_url: { _empty: true } }, { sponsor_url: { _regex: '^https?://[^ ]+$' } }] },
      validation_message: 'Enter a full web address starting https://, or leave it empty.',
    }],
    ['group_staff', null, {}],
    ['internal_notes', 'group_staff', { translations: label('Internal notes') }],
  ],

  squad_memberships: [
    ['status', null, {
      translations: label('Squad status'),
      options: { choices: [
        { text: 'Active (on the squad page)', value: 'published', color: '#2ECDA7' },
        { text: 'Inactive (hidden from the squad page)', value: 'draft', color: '#A2B5CD' },
        { text: 'Removed from team', value: 'archived', color: '#6B6B6B' },
      ] },
      note: 'Active players appear on the team\'s squad page once their profile is Published. Inactive hides them for now; Removed from team takes them out of the squad and keeps their profile.',
    }],
    // Not required on screen: a team's Squad list fills it in when the team is saved, and the
    // brid-publishing extension refuses an allocation saved without one.
    ['team', null, {
      translations: label('Team'),
      required: false,
      note: "Filled in automatically when you add someone from a team's Squad list. Change this to move the person to another team.",
    }],
    ['person', null, {
      translations: label('Player or staff member'),
      options: { template: '{{display_name}}', enableCreate: true, enableSelect: true },
      display: 'related-values',
      display_options: { template: '{{display_name}}' },
      note: 'Choose an existing profile, or create a new one here.',
    }],
    ['kind', null, { translations: label('Role in team') }],
    ['position', null, {
      translations: label('Position'),
      conditions: playerOnly,
      validation: orNull('position', { _in: POSITIONS }),
      validation_message: `Choose one of: ${POSITIONS.join(', ')}.`,
    }],
    ['shirt_number', null, {
      translations: label('Squad number'),
      conditions: playerOnly,
      note: 'Shirt number for this team, 1 to 99.',
      validation: orNull('shirt_number', { _between: [1, 99] }),
      validation_message: 'Squad numbers are whole numbers from 1 to 99.',
    }],
    ['captaincy', null, {
      translations: label('Captaincy'),
      conditions: playerOnly,
      display: 'labels',
      options: { choices: [{ text: 'Captain', value: 'captain' }, { text: 'Vice-captain', value: 'vice_captain' }], allowNone: true },
      note: 'For this team only. Leave empty for most players.',
      validation: orNull('captaincy', { _in: ['captain', 'vice_captain'] }),
      validation_message: 'Choose Captain or Vice-captain, or leave it empty.',
    }],
    ['staff_title', null, { translations: label('Staff title'), conditions: staffOnly }],
    ['season', null, { translations: label('Season'), note: 'Optional.' }],
    ['left_on', null, { translations: label('Left the team on'), note: 'Optional. From this date they no longer appear on the squad page.' }],
  ],

  teams: [
    ['key', null, { translations: label('Website key') }],
    ['name', null, { translations: label('Team name') }],
    ['group_squad', null, {}],
    ['squad', 'group_squad', {
      translations: label('Squad'),
      note: 'Players and staff in this team, in website order: drag to reorder. "Create new" adds someone to this team (choose an existing profile or create one). Open a row to change number, position, captaincy or squad status.',
      options: {
        layout: 'table',
        fields: ['person.photo', 'person', 'position', 'shirt_number', 'captaincy', 'status', 'person.status'],
        enableCreate: true,
        enableSelect: false,
        enableLink: true,
        limit: 50,
      },
    }],
    ['placeholder_cards', 'group_squad', { translations: label('"To be confirmed" cards') }],
  ],
};

/** New allocations start Active. */
export const SCHEMA_UPDATES = [{ collection: 'squad_memberships', field: 'status', schema: { default_value: 'published' } }];

/** The Squad and Teams lists. Removing a row in either deletes only the allocation, never the profile. */
export const RELATION_UPDATES = [
  { collection: 'squad_memberships', field: 'team', meta: { one_field: 'squad', sort_field: 'sort', one_deselect_action: 'delete' } },
  { collection: 'squad_memberships', field: 'person', meta: { one_field: 'team_allocations', one_deselect_action: 'delete' } },
];

/**
 * Navigation folders (collections without a table) and where each collection sits, arranged
 * around club tasks. Each entry: [collection, singular, plural, short help shown on the list].
 */
export const NAV_FOLDERS = [
  { collection: 'nav_football', icon: 'groups', name: 'Squads and players' },
  { collection: 'nav_matches', icon: 'sports_soccer', name: 'Matches' },
  { collection: 'nav_news', icon: 'newspaper', name: 'News and events' },
  { collection: 'nav_commercial', icon: 'handshake', name: 'Sponsors' },
  { collection: 'nav_club', icon: 'home', name: 'Club' },
];
export const NAVIGATION = {
  nav_football: [
    ['teams', 'Team', 'Teams and squads', 'Open a team to see its squad. Add players with the + button, drag to change the order.'],
    ['people', 'Player or staff profile', 'Players and staff', 'One profile per person: name, photo, biography and the teams they are in.'],
    ['squad_memberships', 'Team allocation', 'Team allocations', 'Who is in which team, with squad number, position and captaincy. Usually easier from the team page.'],
  ],
  nav_matches: [
    ['fixtures', 'Match correction', 'Match corrections', 'Fixtures, results and tables arrive automatically. Add an entry here only to correct an imported match or to add one the source does not list, such as a friendly.'],
    ['league_tables', 'Club-entered table', 'League tables', 'Only used for a team without an automatic table. Shown as "Entered by the club".'],
    ['competitions', 'Competition', 'Competitions', 'Names used by match corrections and tables.'],
    ['seasons', 'Season', 'Seasons', 'Names used by team allocations, match corrections and tables.'],
  ],
  nav_news: [
    ['articles', 'News article', 'News', 'Team and club news shown on the news cards.'],
    ['announcements', 'Announcement', 'Announcements', 'Short notices with start and end times. Major announcements need Club Admin approval.'],
    ['events', 'Event', 'Events'],
  ],
  nav_commercial: [
    ['sponsors', 'Sponsor', 'Sponsors', 'Publishing or changing a live sponsor needs Club Admin approval.'],
    ['sponsorship_packages', 'Sponsorship package', 'Sponsorship packages', 'Packages on the commercial page. Prices are internal only. Changes need Club Admin approval.'],
  ],
  nav_club: [
    ['site_settings', 'Club details', 'Club details', 'Club name, ground, contact details and social media links.'],
    ['pages', 'Club page', 'Club pages', 'Publishing or changing a live page needs Club Admin approval.'],
    ['enquiries', 'Website enquiry', 'Website enquiries', 'Messages sent through the website. Mark each one In progress, then Done. Contains personal details: delete once dealt with.'],
  ],
};
export const DISPLAY_TEMPLATES = {
  teams: '{{name}}',
  competitions: '{{name}}',
  seasons: '{{name}}',
  people: '{{display_name}}',
  squad_memberships: '{{person.display_name}} – {{team.name}}',
};
export const collectionNames = names;

/**
 * Links to teams, competitions and seasons show the name, not the number, in forms and lists.
 * Only these display settings are changed on each field.
 */
const named = { options: { template: '{{name}}' }, display: 'related-values', display_options: { template: '{{name}}' } };
export const RELATION_DISPLAYS = [
  ...['squad_memberships', 'fixtures', 'league_tables', 'articles', 'announcements', 'events'].map((collection) => ({ collection, field: 'team', meta: named })),
  ...['fixtures', 'league_tables'].map((collection) => ({ collection, field: 'competition', meta: named })),
  ...['squad_memberships', 'fixtures', 'league_tables'].map((collection) => ({ collection, field: 'season', meta: named })),
];

const tabular = (fields, sort, widths = {}) => ({
  layout: 'tabular',
  layout_query: { tabular: { fields, sort, page: 1, limit: 100 } },
  layout_options: { tabular: { widths, spacing: 'comfortable' } },
});
const inTeam = (key) => ({ team_allocations: { _some: { _and: [{ team: { key: { _eq: key } } }, { status: { _neq: 'archived' } }] } } });
const PEOPLE_LIST = tabular(['photo', 'display_name', 'team_allocations', 'status'], ['display_name'], { photo: 80, display_name: 260, team_allocations: 320 });
const SQUAD_LIST = tabular(['person.photo', 'person', 'team', 'position', 'shirt_number', 'captaincy', 'status', 'person.status'], ['team', 'sort'], { 'person.photo': 80, person: 220 });

/** Everyone's default list views (bookmark null) and shared bookmarks. */
export const PRESETS = [
  { collection: 'people', bookmark: null, ...PEOPLE_LIST, filter: null },
  { collection: 'people', bookmark: "Men's First Team", icon: 'groups', ...PEOPLE_LIST, filter: inTeam('mens') },
  { collection: 'people', bookmark: "Women's First Team", icon: 'groups', ...PEOPLE_LIST, filter: inTeam('womens') },
  { collection: 'people', bookmark: 'Drafts (not on the website)', icon: 'edit_note', ...PEOPLE_LIST, filter: { status: { _in: ['draft', 'in_review'] } } },
  { collection: 'people', bookmark: 'Published profiles', icon: 'public', ...PEOPLE_LIST, filter: { status: { _eq: 'published' } } },
  { collection: 'squad_memberships', bookmark: null, ...SQUAD_LIST, filter: null },
  { collection: 'squad_memberships', bookmark: "Men's squad order", icon: 'format_list_numbered', ...tabular(SQUAD_LIST.layout_query.tabular.fields, ['sort']), filter: { team: { key: { _eq: 'mens' } } } },
  { collection: 'squad_memberships', bookmark: "Women's squad order", icon: 'format_list_numbered', ...tabular(SQUAD_LIST.layout_query.tabular.fields, ['sort']), filter: { team: { key: { _eq: 'womens' } } } },
  { collection: 'squad_memberships', bookmark: 'Inactive players', icon: 'visibility_off', ...SQUAD_LIST, filter: { status: { _eq: 'draft' } } },
];
