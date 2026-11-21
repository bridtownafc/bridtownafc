// Builds Brid_Town_Website_Admin_Guide.docx (staff guide to the Directus admin).
// Usage: node guide.cjs <output.docx>
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, LevelFormat, HeadingLevel, Header, Footer, PageNumber, PageBreak, TabStopType,
} = require('docx');

const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'shots2');
const missingShots = [];
const GUIDE_DATE = '17 November 2026';
const OUT = process.argv[2] || path.join(__dirname, 'Brid_Town_Website_Admin_Guide.docx');

const RED = 'A51C30';
const NAVY = '1B2A41';
const GREY = '5F6B7A';
const FONT = 'Arial';
const CONTENT_WIDTH = 9026; // A4 with 1" margins, in DXA

// ---------- inline markup: **bold**, `code` ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: 'Consolas', size: 19, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const body = [];
const P = (text, opts = {}) => body.push(new Paragraph({ children: runs(text), spacing: { after: 120 }, ...opts }));
const H1 = (text, { pageBreak = true } = {}) => body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: pageBreak }));
const H2 = (text) => body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }));
const H3 = (text) => body.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }));
const bullets = (items) => items.forEach((t) => body.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(t), spacing: { after: 60 } })));
let listInstance = 0;
const steps = (items) => {
  listInstance += 1;
  items.forEach((t) => body.push(new Paragraph({ numbering: { reference: 'steps', level: 0, instance: listInstance }, children: runs(t), spacing: { after: 60 } })));
  body.push(new Paragraph({ children: [], spacing: { after: 60 } }));
};

// Shaded box with a coloured left bar, for tips and warnings.
function callout(title, lines, { colour = RED, fill = 'FBEFF1' } = {}) {
  const border = { style: BorderStyle.SINGLE, size: 24, color: colour, space: 8 };
  const shading = { type: ShadingType.CLEAR, fill, color: 'auto' };
  const indent = { left: 200, right: 200 };
  body.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, color: colour })], border: { left: border }, shading, indent, spacing: { before: 120, after: 40 }, keepNext: true }));
  lines.forEach((l, i) => body.push(new Paragraph({
    children: runs(l), border: { left: border }, shading, indent,
    spacing: { after: i === lines.length - 1 ? 200 : 40 }, keepNext: i < lines.length - 1,
  })));
}

let figure = 0;
function shot(file, caption, { width = 600 } = {}) {
  if (!fs.existsSync(path.join(SHOTS, file))) { missingShots.push(file); return; }
  const buf = fs.readFileSync(path.join(SHOTS, file));
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  figure += 1;
  body.push(new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: 'png', data: buf, transformation: { width, height: Math.round((width * h) / w) }, altText: { title: caption, description: caption, name: file } })],
  }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `Figure ${figure}. ${caption}`, italics: true, size: 18, color: GREY })] }));
}

function table(header, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CED6' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, i, head) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    borders,
    shading: head ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 110, right: 110 },
    children: String(text).split('\n').map((line) => new Paragraph({ children: runs(line, head ? { bold: true, color: 'FFFFFF' } : {}), spacing: { after: 40 } })),
  });
  body.push(new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
    ],
  }));
  body.push(new Paragraph({ children: [], spacing: { after: 160 } }));
}


// ======================================================================
// Title page
// ======================================================================
body.push(new Paragraph({ spacing: { before: 2400, after: 0 }, children: [new TextRun({ text: 'Bridlington Town AFC', bold: true, size: 30, color: RED })] }));
body.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Website Admin Guide')] }));
body.push(new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: 'How club staff update the website: squads, players, matches, news, sponsors and enquiries', size: 26, color: GREY })] }));
body.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 4 } }, children: [] }));
body.push(new Paragraph({ spacing: { before: 240, after: 60 }, children: runs(`**Version:** 2.0, ${GUIDE_DATE}`) }));
body.push(new Paragraph({ spacing: { after: 60 }, children: runs('**Admin address:** http://localhost:8055/admin (on the admin computer only)') }));
body.push(new Paragraph({ spacing: { after: 60 }, children: runs('**Admin software:** Directus 12 (the screens may say "Powered by Directus")') }));
body.push(new Paragraph({ spacing: { after: 480 }, children: runs('**Status:** the admin runs on one club computer and updates a **local preview** of the website, where publishing has been tested. It is **not connected to the live website at bridtown.com**, and nothing has been deployed.') }));
callout('Keep this guide free of secrets', [
  'Never write passwords, two-factor codes or other sign-in details into this guide, a shared document or an email. The screenshots in this guide contain none, and the names in them are examples.',
]);

// ======================================================================
H1('Contents');
const CONTENTS = [
  '1. The three things to remember', '2. Starting the admin and signing in', '3. Finding your way around', '4. Staff roles and accounts',
  '5. Saving and publishing', '6. Teams and squads', '7. Player and staff profiles', '8. Photographs',
  '9. Moving players, two teams and leaving', '10. Matches: fixtures, results and tables', '11. News, announcements and events',
  '12. Sponsors and sponsorship packages', '13. Website enquiries', '14. Club details and club pages',
  '15. How changes reach the website', '16. Common problems', '17. Current limitations', '18. Quick reference',
];
CONTENTS.forEach((c) => body.push(new Paragraph({ spacing: { after: 70 }, children: [new TextRun({ text: c, size: 23 })] })));

// ======================================================================
H1('1. The three things to remember');
bullets([
  '**Website status decides what the public sees.** Saving keeps your work in the admin. Only items whose Website status is **Published** go on the website, and the bell tells you when the website has been updated.',
  '**One profile per person.** A player has one profile (name, photo, biography). Each team they play in is a **team allocation** holding their squad number, position and captaincy for that team.',
  '**Taking a player out of a team never deletes the player.** Their profile and photograph are kept.',
]);
P('Everything else in this guide follows from these three rules.');

// ======================================================================
H1('2. Starting the admin and signing in');
H2('2.1 Starting the admin (admin computer only)');
steps([
  'Open **Windows PowerShell** in the website project folder (for example `C:\\Users\\Steven Barlow\\Documents\\bridtownafc-preview`).',
  'Type `npm run cms:start` and press Enter. It starts the database, the admin, the local email inbox, the website rebuild service and the match data updates. Anything already running is left alone, so it is safe to run twice.',
  'Wait for the green line **Staff admin dashboard: http://localhost:8055/admin**, then open that address in Chrome or Edge.',
]);
table(['Command', 'What it does'], [
  ['`npm run cms:start`', 'Starts everything (safe to run again).'],
  ['`npm run cms:status`', 'Shows what is running.'],
  ['`npm run cms:stop`', 'Stops everything. All content is kept.'],
  ['`npm run preview`', 'Shows the local preview website at http://localhost:4321.'],
], [3000, 6026]);
P('After the computer restarts, run `npm run cms:start` again.');
H2('2.2 Signing in');
steps([
  'Go to **http://localhost:8055/admin**, enter your email address and password, and click **Sign In**.',
  'If asked, enter the 6-digit code from your authenticator app (two-factor authentication). Codes change every 30 seconds; if one is refused, use the next.',
]);
shot('01-login.png', 'The sign-in page.', { width: 500 });
P('**Two-factor authentication** is required for Club Admins and the Super Admin and recommended for everyone: the admin asks you to set it up at first sign-in, or you can turn it on from your own profile (the person icon at the bottom left). Scan the QR code with an authenticator app such as Microsoft Authenticator, then type the code it shows.');
P('Accounts lock after **5 failed sign-ins**. Passwords must be at least **12 characters**. The Super Admin may also see a "Have a license key?" box: click **Skip**.');

// ======================================================================
H1('3. Finding your way around');
P('The menu on the left is arranged by club task. You only see the sections your role allows.');
shot('02-navigation.png', 'The admin as a Football Editor sees it.');
table(['Menu', 'Sections'], [
  ['**Squads and players**', 'Teams and squads · Players and staff · Team allocations'],
  ['**Matches**', 'Match corrections · League tables · Competitions · Seasons'],
  ['**News and events**', 'News · Announcements · Events'],
  ['**Sponsors**', 'Sponsors · Sponsorship packages'],
  ['**Club**', 'Club details · Club pages · Website enquiries'],
], [2600, 6426]);
bullets([
  'Each list shows a line of help at the top. Click a row to open it; click **Create** (top right) to add something new.',
  'Use the **magnifying glass** to search, the **filter** icon to narrow a list, and the **bookmarks** under a section (for example Men\'s First Team or New enquiries) for ready-made views.',
  'The icons on the far left are **Content** (the menu above), **File Library** (photos and logos), the **bell** (messages, such as "Website updated") and **your profile** (password, two-factor authentication and sign out).',
  'Optional and technical settings sit in groups lower down each form, some closed until you open them.',
]);

// ======================================================================
H1('4. Staff roles and accounts');
table(['Role', 'Manages', 'Publishes directly?'], [
  ['**Club Admin**', 'All website content, club details, every website enquiry, team names and FA Full-Time settings. Approves other staff\'s changes.', 'Yes'],
  ['**Football Editor**', 'Squads, players, team allocations, match corrections, club-entered tables, competitions, seasons, and match reports and previews.', 'Yes'],
  ['**Media Editor**', 'News, announcements, events and photographs.', 'Yes, except major announcements (Club Admin approval)'],
  ['**Commercial Editor**', 'Sponsors, sponsorship packages, commercial club pages and **commercial** website enquiries.', 'No: a Club Admin approves and publishes'],
  ['**Super Admin**', 'Everything, including staff accounts and settings. The website administrator.', 'Yes'],
], [2100, 4826, 2100]);
P('Every editor can upload photos, but can change or delete only the files they uploaded. Editors cannot change staff accounts, settings, team names or a match\'s Match Centre reference.');
H2('4.1 Adding a staff account (Super Admin)');
steps([
  'Click the **User Directory** icon, then **Create**.',
  'Enter the person\'s name and email, a password of at least 12 characters, and their **Role**. Save.',
  'Give them the password in person and ask them to change it and set up two-factor authentication at first sign-in.',
]);
P('Without a licence key, at most **3 accounts can sign in to the admin at once** (section 17).');

// ======================================================================
H1('5. Saving and publishing');
P('Every website item has a **Website status**. It is the one control that decides what the public sees:');
table(['Website status', 'Meaning'], [
  ['**Draft (not on the website)**', 'Being prepared. Saved in the admin, never shown.'],
  ['**In review**', 'Ready for a Club Admin to check. Not shown.'],
  ['**Published (on the website)**', 'Shown on the website once it has been updated.'],
  ['**Archived (kept, not shown)**', 'Kept for the record. Use this instead of deleting.'],
], [3000, 6026]);
P('For team allocations the same control is called **Squad status**: Active (on the squad page), Inactive (hidden for now) or Removed from team.');
H2('5.1 Making and publishing a change');
steps([
  'Open the item and make your change.',
  'Set **Website status**: Published to show it, or Draft to keep working on it privately.',
  'Click **Save** (top right).',
  'Watch the **bell**: **Website updated** means your change is now on the website (at the moment, the local preview). **Website not updated** means it was saved in the admin but the website kept its previous version; see section 15.',
]);
callout('Saved is not the same as on the website', [
  'A draft is private. A saved change to a Published item is in the admin straight away, and on the website only after the bell says **Website updated**. The admin never reports success before the website update has finished.',
]);
H2('5.2 Sponsors, packages, club pages and major announcements');
P('These need a Club Admin\'s approval, so they work slightly differently. The button says **Publish**, and the label next to the title shows **Draft** or **Published**:');
steps([
  'New item: fill it in, set Website status to **In review (waiting for a Club Admin)** and click Publish to save it. Add a note in the **Comments** panel on the right if useful.',
  'Changing a live item: just start editing. The admin switches to a **Draft** copy ("Editing on draft version") and saves your edits there automatically; the live item is unchanged.',
  'A Club Admin opens the item, checks the Draft copy, sets it to Published and clicks **Publish**. If the button says **Edit**, a Draft copy is already waiting; click it to carry on.',
]);
P('If you try to publish one of these yourself, the admin says **"Publishing this needs Club Admin approval…"**. That is expected.');

// ======================================================================
H1('6. Teams and squads');
P('Open **Squads and players → Teams and squads** and click a team. The **Squad** list shows everyone in it, in website order.');
shot('03-team-squad.png', "A team's squad.");
H2('6.1 Adding a player to a team');
steps([
  'Open the team and click the red **+** above the Squad list. A panel opens.',
  '**Player or staff member:** start typing to choose someone who already has a profile, or click **+** to create a new one: enter the **Display name**, set Website status to **Published** if they should appear now, and add a photo if you have one. The team is filled in for you.',
  'Set **Role in team** (Player or Staff), then **Position**, **Squad number** and **Captaincy** as needed. **Squad status** starts as Active.',
  'Click **Save** on the panel, then **Save** at the top of the team page.',
]);
shot('04-team-add-player.png', 'Adding someone from the squad list. The team does not need choosing.');
P('When saved with a Published profile and an Active allocation, the player gets a **squad card** and a **profile page** automatically. Without a photo, both show the club badge until one is added. The admin refuses a second profile with the same name, and adding someone to a team they are already in.');
H2('6.2 Squad order and placeholder cards');
bullets([
  '**Order:** drag rows by their handle (the two lines on the left), then **Save**. This is the order on the website.',
  '**"To be confirmed" cards:** how many "Player to be confirmed" cards follow the named players.',
  'Team names, website keys and FA Full-Time settings (the closed **Advanced** group) are for Club Admins only.',
]);

// ======================================================================
H1('7. Player and staff profiles');
P('**Squads and players → Players and staff** lists everyone. Bookmarks show one team, drafts only, or published profiles only.');
shot('05-players-list.png', 'Players and staff.');
H2('7.1 The profile form');
shot('06-player-profile-top.png', 'The top of a profile.');
table(['Field', 'On the website?', 'Notes'], [
  ['**Website status**', '—', 'Draft until the profile is ready, then Published.'],
  ['**First name / Surname**', 'No', 'For staff records.'],
  ['**Display name** (required)', 'Yes', 'The name shown, e.g. a preferred first name and surname. Must be different from every other profile.'],
  ['**Web address**', 'In the page address', 'Filled in automatically from the display name (e.g. jess-corner). Leave it empty.'],
  ['**Profile photograph / Photo description**', 'Yes', 'Section 8.'],
  ['**Teams**', 'Yes', 'The teams they are in, with squad number, position and captaincy for each (section 9).'],
  ['**Biography, Player sponsor, Sponsor website**', 'Yes, when filled in', 'Optional. Sponsor website must start https://'],
  ['**Internal notes** (Staff only)', 'Never', 'Notes for staff.'],
], [3000, 1800, 4226]);
P('**Only what you enter is shown.** Empty details (number, position, captaincy, biography, sponsor) are simply left out; the profile says, for example, "Position, squad number, biography and statistics will be added once confirmed by the club". Nothing is invented.');
callout('Privacy', ['Never enter dates of birth, home addresses, phone numbers or other private details in any field shown on the website, including the biography.']);
shot('07-player-profile-teams.png', 'Further down: the photograph, the Teams list and the biography.');
H2('7.2 Creating a profile on its own');
steps([
  'Open **Players and staff** and click **Create**. Leave Website status as **Draft**.',
  'Enter the names and **Display name** (the web address fills itself in). Add a photo now or later (section 8).',
  'Under **Teams**, click the red **+** to add their team, squad number, position and captaincy.',
  'Click **Save**. When everything is ready, set Website status to **Published** and Save again.',
]);
shot('08-new-player.png', 'A new profile starts as a Draft.');
H2('7.3 Messages you may see');
table(['Problem', 'What the admin says or does'], [
  ['Same name as an existing profile', '"A profile called … already exists." Choose the existing profile instead, or use a name that tells them apart.'],
  ['Already in that team', '"… is already in …" Open their existing allocation instead (set it back to Active if they have returned).'],
  ['Squad number outside 1–99', 'Squad numbers are whole numbers from 1 to 99.'],
  ['Unknown position or captaincy', 'Choose from the list (Goalkeeper, Defender, Midfielder, Forward; Captain or Vice-captain).'],
  ['Sponsor website without https://', 'Enter a full web address starting https://, or leave it empty.'],
  ['Web address already used', 'Use lower-case words joined by hyphens, different from every other profile.'],
], [3000, 6026]);

// ======================================================================
H1('8. Photographs');
P('Everything happens in the player’s own form, in the **Profile photograph** box:');
table(['I want to…', 'Do this'], [
  ['**Upload a new photo**', 'Click the box (or drag a photo onto it) and choose the file. A preview appears straight away. Then **Save**.'],
  ['**Use a photo already in the library**', 'Open the box’s menu and choose **from the library**, pick the photo, then **Save**.'],
  ['**Replace the photo**', 'Click the **×** on the current photo to remove it from this player, then upload or choose the new one, and **Save**. The old photo stays in the library.'],
  ['**Remove the photo**', 'Click the **×** and **Save**. The card and profile go back to the club badge.'],
], [3000, 6026]);
bullets([
  'Use a portrait photo: **JPEG, PNG or WebP**, up to **25 MB**. Other formats are refused with a message saying what to do (most phones can share a photo as JPEG).',
  'Add a **Photo description** for screen readers. New uploads go into the **Squad photos** folder automatically.',
  'The website crops photos to a 4:5 portrait. To choose what stays in view, open the photo in the **File Library** and set its **focal point** (usually the face).',
  'Do not use **Replace file** inside the File Library: that changes the picture everywhere it is used. Removing a photo from a player never deletes the original.',
  'After you save, the squad card and profile page update together; the bell says **Website updated** when they have.',
]);
shot('13-file-library.png', 'The File Library.');

// ======================================================================
H1('9. Moving players, two teams and leaving');
P('A **team allocation** links one person to one team. Open one from the team\'s Squad list, the profile\'s Teams list, or **Team allocations**.');
shot('09-team-allocation.png', 'A team allocation.');
table(['I want to…', 'Do this in the allocation'], [
  ['Move a player to another team', 'Change **Team**, check number, position and captaincy, then Save. At the next website update they leave the old team\'s pages (profile page and photos included) and appear on the new team\'s.'],
  ['Put a player in a second team', 'In their profile, click **+** under Teams and fill in the second team. One profile, two allocations.'],
  ['Hide a player for now (injury, loan)', 'Set **Squad status** to **Inactive**.'],
  ['Record that a player has left', 'Set **Squad status** to **Removed from team** and fill in **Left the team on**. Their profile is kept.'],
  ['Remove the allocation completely', 'First set it to Removed from team and Save, then use the bin on the team\'s Squad list. Active allocations cannot be deleted by editors.'],
], [3000, 6026]);
H2('9.1 Who appears on a squad page');
table(['Profile Website status', 'Allocation', 'On that team\'s pages?'], [
  ['Published', 'Active, no leaving date passed', '**Yes**, on that team only'],
  ['Published', 'Active, leaving date passed', 'No'],
  ['Published', 'Inactive or Removed from team', 'No'],
  ['Draft, In review or Archived', 'Any', 'No, on any team'],
], [3000, 3600, 2426]);
P('Every row of this table was checked on the admin computer\'s local preview (section 15).');
shot('10-allocations-list.png', 'Team allocations, with team names, positions and squad numbers.');

// ======================================================================
H1('10. Matches: fixtures, results and tables');
P('The men\'s fixtures, results and league table arrive **automatically** from Football Web Pages. Nobody needs to type them in.');
table(['', 'How it works'], [
  ['**How often**', 'Every 6 hours, and every 15 minutes from 12:00 to 23:00 UK time on a matchday.'],
  ['**Results**', 'Appear once the source marks the match finished. Pages show when data was last updated. **This is not a live score service.**'],
  ['**Postponed matches**', 'Stay in fixtures, marked "new date to be confirmed".'],
  ['**If the source fails**', 'The last good fixtures and table are kept, and the page says details may be out of date.'],
  ['**Women\'s team**', 'Shown from FA Full-Time once the club supplies its code snippets (section 17). Until then the Match Centre links to the official FA Full-Time pages.'],
], [2400, 6626]);
H2('10.1 Correcting an imported match, or adding a friendly');
steps([
  'Open **Matches → Match corrections** and click **Create**.',
  'To correct an imported match, copy its reference from the Match Centre ("Ref …" under the match, e.g. football-web-pages:591448) into **Match Centre reference**. To add a match the source does not list, leave it empty.',
  'Fill in only what needs correcting (kick-off, ground, status, score, note), set Website status to **Published** and Save. Matchday changes reach the website within seconds of the update starting.',
  'Remove (or archive) the correction once the source has caught up.',
]);
shot('11-match-correction.png', 'A new match correction: which match, match details, then result and status.');
P('The Match Centre reference cannot be changed once saved; create a new correction instead. A corrected match is marked "Updated by the club" on the website.');
H2('10.2 Club-entered league tables');
P('**Matches → League tables** is only for a team with no automatic table. A published club-entered table is labelled "Entered by the club. Not updated automatically." Tick **Bridlington Town** on our row.');

// ======================================================================
H1('11. News, announcements and events');
shot('12-article-form.png', 'A news article: the article first, then image and publishing.');
table(['Section', 'Essentials', 'Good to know'], [
  ['**News**', 'Headline, summary (shown on the news card), full article, category, team', 'Set Website status to **Published** and Save: it appears in the team news listings, the homepage news section and its own page (articles with a full article get a page). **Publish date** under Publishing: leave empty for straight away, or set a future time and it appears automatically at that time, with no need to save again. Setting it back to Draft removes it. The web address fills itself in. Football Editors can write Match reports and Match previews.'],
  ['**Announcements**', 'Title, message, importance, team', '**Show from / Show until** control when it appears. Major announcements need Club Admin approval (section 5.2).'],
  ['**Events**', 'Name, start, venue, description', 'Image and booking link (https://) are optional. The web address is under Advanced.'],
], [1900, 3000, 4126]);

// ======================================================================
H1('12. Sponsors and sponsorship packages');
shot('16-sponsor-form.png', 'A new sponsor, as a Commercial Editor sees it.');
bullets([
  '**Sponsor:** name, **Partnership level** (decides where and how prominently they appear), **Featured sponsor**, website (https://) and a short description.',
  '**Logo:** PNG or SVG with a transparent background works best. It goes into the Sponsors folder automatically.',
  '**Dates:** optional start and end; the sponsor stops appearing after the end date.',
  '**Packages:** name, category and description. Prices are internal only and never shown on the website.',
  'Commercial Editors save as **In review**; a Club Admin publishes (section 5.2).',
]);

// ======================================================================
H1('13. Website enquiries');
P('**Club → Website enquiries** is the inbox for messages sent through the website. **Club Admins** see every enquiry; **Commercial Editors** see commercial enquiries only. Other roles do not see enquiries.');
shot('14-enquiries-inbox.png', 'The enquiries inbox, newest first (an example message).');
steps([
  'Open an enquiry. Contact details and the message cannot be edited.',
  'Set **Progress** to **In progress** while you deal with it, and add **Staff notes** (who is handling it, what was agreed).',
  'Reply to the sender by email or phone from your usual account, then set Progress to **Done**.',
  'Enquiries hold personal details: a Club Admin deletes them once dealt with.',
]);
shot('15-enquiry.png', 'An enquiry: progress, the message and staff notes.');
callout('Is the website form switched on?', [
  'Not yet. At the moment the website asks visitors to phone or email the club. Delivery into this inbox has been tested on the admin computer; switching the form on for the live website is a decision for the club when the site goes live.',
], { colour: 'B7791F', fill: 'FFF8E6' });

// ======================================================================
H1('14. Club details and club pages');
bullets([
  '**Club details** (Club Admins): club name and ground; contact email and phone; postal address; social media links (each starting https://). It has a plain **Save** button.',
  '**Club pages:** title, section of the website, summary and content first; search-engine wording and page admin (web address, review date, internal notes) in closed groups. Commercial Editors manage Commercial pages, with approval.',
  'These sections are kept in the admin but **not yet shown on the website**; the current club details and pages are part of the website design (section 17).',
]);

// ======================================================================
H1('15. How changes reach the website');
P('The website is not read directly from the admin. When you save a change to something the website uses, the admin asks for the website to be rebuilt from **published** content only. Ordinary edits are grouped and sent within about a minute; matchday changes within about 5 seconds. The rebuild itself takes a minute or two on the admin computer.');
callout('Local preview, not bridtown.com', [
  '**Working and tested:** on the admin computer, a rebuild updates the **local preview** website (http://localhost:4321 with `npm run preview`).',
  '**Not set up yet:** the live website. The admin is **not connected to bridtown.com** and nothing has been deployed, so visitors see none of these changes. The bell says "the local preview website (not bridtown.com)" to make this clear.',
], { colour: 'B7791F', fill: 'FFF8E6' });
H2('15.1 What has been checked on the admin computer');
bullets([
  'Draft players stay hidden; published players appear only on their own team, with only the details entered.',
  'Moving teams leaves nothing behind on the old team, including its profile page and photo files.',
  'Inactive, Removed and past-leaving-date players are hidden, with no leftover profile page.',
  'A failed update keeps the existing website and sends **Website not updated**; saving again updates the website and sends **Website updated**.',
  'Editors cannot reach settings, staff accounts, other roles\' enquiries, team settings or Match Centre references; duplicates are refused.',
]);
H2('15.2 Notifications');
table(['Bell message', 'What to do'], [
  ['**Website updated**', 'Nothing: your change is on the (local preview) website.'],
  ['**Website not updated**: "…saved in the CMS but have not reached…"', 'Your change is safe in the admin; the website kept its previous version. Save the item again to retry. If it keeps happening, contact the website administrator.'],
  ['**Website not updated**: "…could not be asked to update…"', 'The rebuild service is not running. On the admin computer run `npm run cms:start`, then save again.'],
], [3800, 5226]);

// ======================================================================
H1('16. Common problems');
table(['Problem', 'What to do'], [
  ['The sign-in page does not load', 'Run `npm run cms:start` on the admin computer. If it fails, note the message and contact the website administrator.'],
  ['Windows shows a "blocked" security message', 'Do not turn off Windows security. Contact the website administrator with the exact message.'],
  ['2FA code refused', 'Wait for the next code. Check the phone\'s clock is set automatically.'],
  ['Lost phone or authenticator', 'Ask the Super Admin to reset two-factor authentication on your account.'],
  ['Forgotten password or locked account', 'Ask the Super Admin to set a new password and make the account active again.'],
  ['A player is not on the website', 'Check: profile Published; allocation Active; no past leaving date; right team; the bell. Remember only the local preview is updated at the moment.'],
  ['"A profile called … already exists"', 'Choose the existing profile in the squad panel instead of creating a new one.'],
  ['"This item is live on the website. Archive it…"', 'Set it to Archived (or Removed from team) instead of deleting.'],
  ['"Publishing this needs Club Admin approval…"', 'Set it to In review; a Club Admin publishes it.'],
  ['"Only a Club Admin can change a team\'s name…"', 'Ask a Club Admin. You can still manage the squad.'],
  ['"You can only change or delete files you uploaded."', 'Ask a Club Admin.'],
  ['A red message under a field', 'Correct the field as the message says and save again.'],
  ['Changed something by mistake', 'A Club Admin can restore an earlier version from the item\'s **Revisions** panel (right).'],
  ['Deleted something by mistake', 'Contact the website administrator straight away. Database backups are taken before admin changes; restoring one is a technical job.'],
], [3300, 5726]);

// ======================================================================
H1('17. Current limitations');
bullets([
  '**Local only.** The admin runs on one club computer and updates the local preview. It is not connected to bridtown.com; hosting, the live website connection and scheduled backups are not set up yet.',
  '**Emails stay on the admin computer.** Password-reset and invitation emails go to the local inbox at http://localhost:8025 (when it is running), not to real inboxes. The Super Admin sets passwords for new and locked-out staff.',
  '**No licence key yet.** On the free plan at most 3 accounts can use the admin, and some finer privacy limits are not available: for example, staff can see colleagues\' email addresses. Team settings and Match Centre references are protected by the club\'s own rules instead. A free Directus Open Innovation Grant licence would remove these limits.',
  '**Enquiry routing.** Football and matchday enquiries for Football Editors, and community enquiries for Media Editors, are prepared but switched off until the club confirms them. Until then Club Admins handle those.',
  '**Women\'s fixtures and table** need the club\'s FA Full-Time code snippets.',
  '**Not on the website yet:** announcements, events, sponsors, club pages and club details. Team introductions, the Club page and homepage text are still part of the website design.',
  '**Ground name.** The match data calls the ground "Mounting Systems Stadium"; the website uses the club\'s "HDM Energies Stadium" until the club confirms which is correct.',
  '**Automations** ("Run Script" flows) are unavailable because Windows security blocks part of them. Day-to-day editing is not affected.',
]);

// ======================================================================
H1('18. Quick reference');
table(['I want to…', 'Do this'], [
  ['Start the admin', '`npm run cms:start`, then open http://localhost:8055/admin'],
  ['See the local preview website', '`npm run preview`, then open http://localhost:4321'],
  ['Add a player to a team', 'Teams and squads → team → Squad + → choose or create the profile → Save → Save'],
  ['Show a player on the website', 'Profile Website status Published + allocation Active → Save → bell says Website updated'],
  ['Hide a player for now', 'Allocation → Squad status Inactive → Save'],
  ['Move a player to another team', 'Allocation → change Team → Save'],
  ['Record that a player has left', 'Allocation → Removed from team + Left the team on → Save'],
  ['Change the squad order', 'Team → drag rows → Save'],
  ['Replace a photo', 'Profile → remove photo → upload new one → Save'],
  ['Correct an imported match', 'Match corrections → Create → Match Centre reference + corrections → Published → Save'],
  ['Publish news', 'News → Create → headline, summary, full article → Published → Save'],
  ['Schedule news', 'News → Publish date in the future → Published → Save (it appears at that time on its own)'],
  ['Add or change a player photo', 'Player → Profile photograph: upload or choose (× first to replace) → Save'],
  ['Get approval', 'Website status In review → Publish; comment for the Club Admin'],
  ['Deal with an enquiry', 'Website enquiries → In progress → reply → Done'],
  ['Check a change reached the website', 'Bell: Website updated (local preview) / Website not updated'],
  ['Stop the admin', '`npm run cms:stop` (content is kept)'],
], [3100, 5926]);

const doc = new Document({
  creator: 'Bridlington Town AFC',
  title: 'Website Admin Guide',
  description: 'Staff guide to the Bridlington Town AFC website admin',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 56, bold: true, color: NAVY }, paragraph: { spacing: { before: 0, after: 120 }, keepNext: true } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 34, bold: true, color: RED }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true, color: NAVY }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 340 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1300, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Bridlington Town AFC · Website Admin Guide', size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: GREY })] })] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log(`wrote ${OUT} (${Math.round(buf.length / 1024)} KB, ${figure} figures)${missingShots.length ? `; missing: ${missingShots.join(', ')}` : ''}`); });
