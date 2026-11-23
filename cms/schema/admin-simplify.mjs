// Plain-English forms for every staff section other than players and squads (those are in
// player-admin.mjs), applied by cms/scripts/admin-simplify.mjs after cms:admin players.
// - Essential fields first; optional, technical and staff-only fields in groups below.
// - One publishing control: the Website status field. Directus's draft versions are kept only
//   where approvals need them (APPROVAL_VERSIONED), so everywhere else the button is "Save".
// - Technical settings (FA Full-Time snippets, data sources, web addresses) sit in collapsed
//   "Advanced" groups. Directus Core cannot hide fields per role, so the brid-publishing
//   extension stops ordinary editors changing the ones that matter (rules.js).

const label = (text) => [{ language: 'en-GB', translation: text }, { language: 'en-US', translation: text }];

const group = (field, text, { open = true } = {}) => ({
  field,
  type: 'alias',
  meta: { interface: 'group-detail', special: ['alias', 'no-data', 'group'], options: { start: open ? 'open' : 'closed' }, width: 'full', translations: label(text) },
});

/**
 * Collections that keep Directus draft versions. Editors who may not publish these prepare a
 * change to a live item in its draft version and a Club Admin publishes it.
 */
export const APPROVAL_VERSIONED = ['sponsors', 'sponsorship_packages', 'pages', 'announcements'];

const choices = (inReview) => [
  { text: 'Draft (not on the website)', value: 'draft', color: '#A2B5CD' },
  { text: inReview, value: 'in_review', color: '#FFA439' },
  { text: 'Published (on the website)', value: 'published', color: '#2ECDA7' },
  { text: 'Archived (kept, not shown)', value: 'archived', color: '#6B6B6B' },
];
const status = (note, { approval = false } = {}) => ['status', null, {
  translations: label('Website status'),
  options: { choices: choices(approval ? 'In review (waiting for a Club Admin)' : 'In review') },
  note,
}];
const SAVED_NOTE = 'Saving stores your change. Only Published items go on the website; the bell tells you when the website has been updated.';
const APPROVAL_NOTE = 'Choose In review when it is ready; a Club Admin publishes it. Changes to a live item are prepared in its draft version (the label next to the title).';

const https = (field, message = 'Enter a full web address starting https://, or leave it empty.') => ({
  validation: { _or: [{ [field]: { _null: true } }, { [field]: { _empty: true } }, { [field]: { _regex: '^https://[^ ]+$' } }] },
  validation_message: message,
});
const image = (text, note) => ({ translations: label(text), note, options: { crop: false, letterbox: true } });
const IMAGE_HELP = 'JPEG, PNG or WebP, up to 25 MB. Choose one from the library or upload a new one.';

/** Group fields this step creates when missing. */
export const NEW_FIELDS = {
  articles: [group('group_article', 'Article'), group('group_image', 'Image'), group('group_publishing', 'Publishing')],
  announcements: [group('group_message', 'Announcement'), group('group_timing', 'When to show it')],
  events: [group('group_event', 'Event'), group('group_media', 'Image and booking'), group('group_advanced', 'Advanced', { open: false })],
  sponsors: [group('group_sponsor', 'Sponsor'), group('group_logo', 'Logo'), group('group_dates', 'Dates'), group('group_staff', 'Staff only', { open: false })],
  sponsorship_packages: [group('group_internal', 'Internal (never on the website)', { open: false })],
  fixtures: [group('group_which', 'Which match'), group('group_match', 'Match details'), group('group_result', 'Result and status'), group('group_staff', 'Staff only', { open: false })],
  competitions: [group('group_advanced', 'Advanced', { open: false })],
  pages: [group('group_page', 'Page'), group('group_seo', 'Search engines (optional)', { open: false }), group('group_admin', 'Page admin', { open: false })],
  site_settings: [group('group_club', 'Club'), group('group_contact', 'Contact'), group('group_address', 'Address'), group('group_social', 'Social media')],
  enquiries: [group('group_message', 'Message'), group('group_staff', 'Staff notes')],
  teams: [group('group_advanced', 'Advanced: FA Full-Time snippets (Club Admin)', { open: false })],
};

/**
 * Form layout, in display order. Each entry is [field, group, meta]; sort and group come from
 * the position, and only the meta keys given are changed. Fields left out keep their settings.
 */
export const LAYOUT = {
  articles: [
    status(SAVED_NOTE),
    ['group_article', null, {}],
    ['title', 'group_article', { translations: label('Headline') }],
    ['summary', 'group_article', { translations: label('Summary'), note: 'One or two sentences, shown on the news card.' }],
    ['body', 'group_article', { translations: label('Full article') }],
    ['category', 'group_article', { translations: label('Category'), note: 'Football Editors can use Match report and Match preview.' }],
    ['team', 'group_article', { translations: label('Team'), note: 'Leave empty for club-wide news shown to both teams.' }],
    ['group_image', null, {}],
    ['hero_image', 'group_image', image('Main photo', `${IMAGE_HELP} Landscape photos work best.`)],
    ['hero_image_alt', 'group_image', { translations: label('Photo description'), note: 'For screen readers, e.g. "players celebrating the winning goal".' }],
    ['group_publishing', null, {}],
    ['published_at', 'group_publishing', { translations: label('Publish date'), note: 'Leave empty to publish as soon as it is Published, or set a future date and time to schedule it.' }],
    ['link', 'group_publishing', { translations: label('"Read more" goes to'), note: 'Where the news card links until article pages are added.' }],
    ['slug', 'group_publishing', { translations: label('Web address'), required: false, note: 'Filled in automatically from the headline when left empty. Changing it later changes the article page address.' }],
  ],
  announcements: [
    status(`${SAVED_NOTE} Major announcements: ${APPROVAL_NOTE}`),
    ['group_message', null, {}],
    ['title', 'group_message', { translations: label('Title') }],
    ['message', 'group_message', { translations: label('Message') }],
    ['importance', 'group_message', { translations: label('Importance') }],
    ['team', 'group_message', { translations: label('Team'), note: 'Leave empty for both teams.' }],
    ['link_url', 'group_message', { translations: label('Link (optional)'), note: 'A page on this site such as /club/, or a full address starting https://' }],
    ['group_timing', null, {}],
    ['starts_at', 'group_timing', { translations: label('Show from'), note: 'Leave empty to show straight away.' }],
    ['ends_at', 'group_timing', { translations: label('Show until'), note: 'Leave empty to keep showing it.' }],
  ],
  events: [
    status(SAVED_NOTE),
    ['group_event', null, {}],
    ['title', 'group_event', { translations: label('Event name') }],
    ['starts_at', 'group_event', { translations: label('Starts') }],
    ['ends_at', 'group_event', { translations: label('Ends'), note: 'Optional.' }],
    ['venue', 'group_event', { translations: label('Venue') }],
    ['team', 'group_event', { translations: label('Team'), note: 'Leave empty for club-wide events.' }],
    ['description', 'group_event', { translations: label('Description') }],
    ['group_media', null, {}],
    ['image', 'group_media', image('Image', IMAGE_HELP)],
    ['booking_url', 'group_media', { translations: label('Booking link'), note: 'Optional. Full address starting https://', ...https('booking_url') }],
    ['group_advanced', null, {}],
    ['slug', 'group_advanced', { translations: label('Web address'), required: false, note: 'Filled in automatically from the event name when left empty.' }],
  ],
  sponsors: [
    status(APPROVAL_NOTE, { approval: true }),
    ['group_sponsor', null, {}],
    ['name', 'group_sponsor', { translations: label('Sponsor name') }],
    ['tier', 'group_sponsor', { translations: label('Partnership level'), note: 'Decides where and how prominently the sponsor appears.' }],
    ['featured', 'group_sponsor', { translations: label('Featured sponsor'), note: 'Highlight this sponsor where the website features sponsors.' }],
    ['website_url', 'group_sponsor', { translations: label('Sponsor website'), note: 'Full address starting https://', ...https('website_url') }],
    ['description', 'group_sponsor', { translations: label('Short description') }],
    ['group_logo', null, {}],
    ['logo', 'group_logo', image('Logo', 'PNG or SVG with a transparent background works best (JPEG and WebP also accepted), up to 25 MB.')],
    ['group_dates', null, {}],
    ['starts_on', 'group_dates', { translations: label('Sponsorship starts'), note: 'Optional.' }],
    ['ends_on', 'group_dates', { translations: label('Sponsorship ends'), note: 'Optional. The sponsor stops appearing after this date.' }],
    ['group_staff', null, {}],
    ['internal_notes', 'group_staff', { translations: label('Internal notes'), note: 'Staff only. Never shown on the website.' }],
  ],
  sponsorship_packages: [
    status(APPROVAL_NOTE, { approval: true }),
    ['title', null, { translations: label('Package name') }],
    ['category', null, { translations: label('Category'), note: 'e.g. Advertising, Matchday' }],
    ['detail', null, { translations: label('Description'), note: 'Short description shown under the name.' }],
    ['group_internal', null, {}],
    ['price_label', 'group_internal', { translations: label('Price (internal)'), note: 'Never shown on the website; visitors are asked to contact the club.' }],
    ['price_amount', 'group_internal', { translations: label('Price amount (internal)'), note: 'For reporting only. Never shown on the website.' }],
  ],
  fixtures: [
    status('Only Published corrections are used. Saving stores your change; the bell tells you when the website has been updated (matchday changes go within seconds).'),
    ['group_which', null, {}],
    ['team', 'group_which', { translations: label('Team') }],
    ['source_match_id', 'group_which', {
      translations: label('Match Centre reference'),
      note: 'To correct an imported match, copy its reference from the Match Centre ("Ref …" under the match), e.g. football-web-pages:591448. Leave empty to add a match the source does not list, such as a friendly. It cannot be changed once saved.',
    }],
    ['competition', 'group_which', { translations: label('Competition') }],
    ['season', 'group_which', { translations: label('Season') }],
    ['group_match', null, {}],
    ['opponent', 'group_match', { translations: label('Opponent') }],
    ['kickoff', 'group_match', { translations: label('Kick-off (UK time)') }],
    ['venue_type', 'group_match', { translations: label('Home or away') }],
    ['venue', 'group_match', { translations: label('Ground'), note: 'Leave empty to use the usual ground name.' }],
    ['opponent_badge', 'group_match', image('Opponent badge', 'Optional. A small square image.')],
    ['group_result', null, {}],
    ['match_status', 'group_result', { translations: label('Match status'), note: 'Full time shows the score as a result. Postponed shows "new date to be confirmed".' }],
    ['score_for', 'group_result', { translations: label('Bridlington Town score') }],
    ['score_against', 'group_result', { translations: label('Opponent score') }],
    ['attendance', 'group_result', { translations: label('Attendance'), note: 'Optional.' }],
    ['public_note', 'group_result', { translations: label('Note shown with the match'), note: 'Optional, e.g. "Rearranged from 14 November".' }],
    ['group_staff', null, {}],
    ['internal_notes', 'group_staff', { translations: label('Internal notes'), note: 'Staff only. Never shown on the website.' }],
  ],
  league_tables: [
    status('Shown only when the team has no automatic table, labelled "Entered by the club".'),
    ['team', null, { translations: label('Team') }],
    ['competition', null, { translations: label('Competition') }],
    ['season', null, { translations: label('Season') }],
    ['effective_at', null, { translations: label('Correct as of') }],
    ['source', null, { translations: label('Taken from'), note: 'Where the table was copied from, e.g. FA Full-Time.' }],
    ['rows', null, { translations: label('Table rows'), note: 'One row per club. Tick "Bridlington Town" on our row.' }],
  ],
  competitions: [
    status('Published competitions can be chosen in match corrections and tables.'),
    ['name', null, { translations: label('Competition name') }],
    ['short_name', null, { translations: label('Short name'), note: 'Optional, for narrow screens.' }],
    ['governing_body', null, { translations: label('Organised by'), note: 'Optional.' }],
    ['group_advanced', null, {}],
    ['data_source', 'group_advanced', { translations: label('Data source') }],
  ],
  seasons: [
    ['name', null, { translations: label('Season'), note: 'e.g. 2026/27' }],
    ['is_current', null, { translations: label('Current season') }],
    ['starts_on', null, { translations: label('Starts') }],
    ['ends_on', null, { translations: label('Ends') }],
  ],
  pages: [
    status(APPROVAL_NOTE, { approval: true }),
    ['group_page', null, {}],
    ['title', 'group_page', { translations: label('Page title') }],
    ['area', 'group_page', { translations: label('Section of the website'), note: 'Commercial Editors can manage Commercial pages.' }],
    ['summary', 'group_page', { translations: label('Summary'), note: 'Optional. One or two sentences.' }],
    ['body', 'group_page', { translations: label('Page content') }],
    ['group_seo', null, {}],
    ['seo_title', 'group_seo', { translations: label('Title in search results'), note: 'Optional. Defaults to the page title.' }],
    ['seo_description', 'group_seo', { translations: label('Description in search results'), note: 'Optional, about 150 characters.' }],
    ['group_admin', null, {}],
    ['slug', 'group_admin', { translations: label('Web address'), required: false, note: 'Filled in automatically from the page title when left empty. Changing it changes the page address.' }],
    ['review_due', 'group_admin', { translations: label('Review by'), note: 'When the page owner should check it again.' }],
    ['internal_notes', 'group_admin', { translations: label('Internal notes'), note: 'Staff only. Never shown on the website.' }],
  ],
  site_settings: [
    ['group_club', null, {}],
    ['club_name', 'group_club', { translations: label('Club name') }],
    ['ground_name', 'group_club', { translations: label('Ground name'), note: 'The ground name used across the website.' }],
    ['group_contact', null, {}],
    ['contact_email', 'group_contact', {
      translations: label('Contact email'),
      validation: { _or: [{ contact_email: { _null: true } }, { contact_email: { _empty: true } }, { contact_email: { _regex: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' } }] },
      validation_message: 'Enter an email address such as info@example.com, or leave it empty.',
    }],
    ['contact_phone', 'group_contact', { translations: label('Contact phone') }],
    ['group_address', null, {}],
    ['address', 'group_address', { translations: label('Postal address'), note: 'One line per line of the address.' }],
    ['group_social', null, {}],
    ...['facebook_url', 'instagram_url', 'x_url', 'youtube_url'].map((field) => [field, 'group_social', {
      translations: label({ facebook_url: 'Facebook', instagram_url: 'Instagram', x_url: 'X (Twitter)', youtube_url: 'YouTube' }[field]),
      note: 'Full address starting https://, or leave empty.',
      ...https(field),
    }]),
  ],
  enquiries: [
    ['handling', null, { translations: label('Progress'), note: 'New, then In progress while someone deals with it, then Done.' }],
    ['date_created', null, { hidden: false, readonly: true, translations: label('Received'), width: 'half' }],
    ['group_message', null, {}],
    ['topic', 'group_message', { translations: label('Topic') }],
    ['name', 'group_message', { translations: label('Name') }],
    ['organisation', 'group_message', { translations: label('Organisation') }],
    ['email', 'group_message', { translations: label('Email') }],
    ['phone', 'group_message', { translations: label('Phone') }],
    ['message', 'group_message', { translations: label('Message') }],
    ['page', 'group_message', { translations: label('Sent from page') }],
    ['consent', 'group_message', { translations: label('Agreed to be contacted') }],
    ['group_staff', null, {}],
    ['internal_notes', 'group_staff', { translations: label('Staff notes'), note: 'Who is dealing with it and what was agreed. Never shown to the sender.' }],
  ],
  teams: [
    // Keep the squad first and the closed Advanced group last.
    ['key', null, {}],
    ['name', null, {}],
    ['group_squad', null, {}],
    ['group_advanced', null, {}],
    ...['fulltime_table_code', 'fulltime_fixtures_results_code', 'fulltime_fixtures_code', 'fulltime_results_code'].map((field) => [field, 'group_advanced', {}]),
  ],
};

/** Image fields and the File Library folder their uploads go to. */
export const UPLOAD_FOLDERS = [
  ['articles', 'hero_image', 'News'],
  ['events', 'image', 'Events'],
  ['sponsors', 'logo', 'Sponsors'],
  ['fixtures', 'opponent_badge', 'Opposition badges'],
];

const tabular = (fields, sort, widths = {}) => ({
  layout: 'tabular',
  layout_query: { tabular: { fields, sort, page: 1, limit: 100 } },
  layout_options: { tabular: { widths, spacing: 'comfortable' } },
});
const INBOX = tabular(['handling', 'date_created', 'topic', 'name', 'organisation', 'message'], ['-date_created'], { handling: 130, date_created: 170, topic: 130, name: 180 });

/** Shared list views (bookmark null = everyone's default) for the sections above. */
export const PRESETS = [
  // Lists and "Select item" pickers show names first (without these, Directus shows arbitrary columns).
  { collection: 'teams', bookmark: null, ...tabular(['name', 'placeholder_cards'], ['sort'], { name: 320 }), filter: null },
  { collection: 'competitions', bookmark: null, ...tabular(['name', 'short_name', 'status'], ['name'], { name: 320 }), filter: null },
  { collection: 'seasons', bookmark: null, ...tabular(['name', 'is_current', 'starts_on', 'ends_on'], ['-starts_on'], { name: 200 }), filter: null },
  { collection: 'enquiries', bookmark: null, ...INBOX, filter: null },
  { collection: 'enquiries', bookmark: 'New enquiries', icon: 'mark_email_unread', ...INBOX, filter: { handling: { _eq: 'new' } } },
  { collection: 'enquiries', bookmark: 'In progress', icon: 'pending', ...INBOX, filter: { handling: { _eq: 'in_progress' } } },
  { collection: 'articles', bookmark: null, ...tabular(['status', 'title', 'category', 'team', 'published_at'], ['-published_at'], { title: 320 }), filter: null },
  { collection: 'fixtures', bookmark: null, ...tabular(['status', 'kickoff', 'team', 'opponent', 'source_match_id', 'match_status', 'score_for', 'score_against'], ['-kickoff'], { opponent: 200, source_match_id: 220 }), filter: null },
  { collection: 'sponsors', bookmark: null, ...tabular(['status', 'logo', 'name', 'tier', 'featured', 'ends_on'], ['sort'], { name: 240 }), filter: null },
];

export const SIMPLIFIED_COLLECTIONS = Object.keys(LAYOUT);
