// Builds Brid_Town_Website_Admin_Guide.docx (staff guide to the Directus admin).
// Usage: node guide.cjs <output.docx>
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, LevelFormat, HeadingLevel, Header, Footer, PageNumber, PageBreak, TabStopType,
} = require('docx');

const SHOTS = path.join(__dirname, 'shots');
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
body.push(new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: 'How club staff update the website: players, squads, news and club content', size: 26, color: GREY })] }));
body.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 4 } }, children: [] }));
body.push(new Paragraph({ spacing: { before: 240, after: 60 }, children: runs('**Version:** 1.1, 16 November 2026') }));
body.push(new Paragraph({ spacing: { after: 60 }, children: runs('**Admin address:** http://localhost:8055/admin (on the admin computer only)') }));
body.push(new Paragraph({ spacing: { after: 60 }, children: runs('**Admin software:** Directus 12 (the screens may say "Powered by Directus")') }));
body.push(new Paragraph({ spacing: { after: 480 }, children: runs('**Status:** the admin currently runs on one club computer for setting up and testing. Publishing has been tested there against a local copy of the website. It is not connected to the live website at bridtown.com, and nothing has been deployed.') }));
callout('Keep this guide free of secrets', [
  'Never write passwords, two-factor codes or other sign-in details into this guide, a shared document or an email. The screenshots in this guide contain none.',
]);

// ======================================================================
// Contents
// ======================================================================
H1('Contents');
const CONTENTS = [
  '1. What the admin does',
  '2. Starting the admin and signing in',
  '3. Finding your way around',
  '4. Staff roles and accounts',
  '5. Saving, drafts and publishing',
  '6. Teams and squads',
  '7. Players and staff profiles',
  '8. Photographs',
  '9. Team allocations: adding, moving and removing players',
  '10. How saved changes reach the website',
  '11. Other sections of the admin',
  '12. Common problems and how to fix them',
  '13. Current limitations',
  '14. Quick reference',
];
CONTENTS.forEach((c) => body.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: c, size: 24 })] })));

// ======================================================================
H1('1. What the admin does');
P('The admin is where club staff edit the content of the Bridlington Town AFC website: squads and player profiles, photographs, news and other club content. It is a separate, private system. Visitors to the website never see it.');
P('The website itself is a set of ready-made pages. When content is published in the admin, the website is rebuilt from it, so changes appear a short while after you publish, not instantly (see section 10).');
H2('The three things to remember');
bullets([
  '**Nothing is public until it is Published.** Every player profile, team allocation, article and other item has a status. Only Published items can appear on the website.',
  '**One profile per person.** A player has a single profile (name, photo, biography). Which team they play for is a separate **team allocation**, so the same person can be in more than one team without being entered twice.',
  '**Removing a player from a team never deletes the player.** You change or remove the team allocation; the profile and photograph are kept.',
]);

// ======================================================================
H1('2. Starting the admin and signing in');
H2('2.1 Starting the admin (admin computer only)');
P('The admin runs on the club\'s admin computer. If the login page does not load, the admin is probably not running. To start it:');
steps([
  'Open **Windows PowerShell** or **Terminal**.',
  'Go to the website project folder, for example: `cd "C:\\Users\\Steven Barlow\\Documents\\bridtownafc-preview"`',
  'Type `npm run cms:start` and press Enter.',
  'Wait for the green line **Staff admin dashboard: http://localhost:8055/admin**. This usually takes under a minute.',
  'Open that address in your web browser (Chrome or Edge).',
]);
callout('The yellow "Mailpit" warning is expected', [
  'While starting, you may see a yellow message saying Mailpit could not start and that password-reset and invite emails will not be sent. Windows security currently blocks the local email program. Signing in still works. See section 13.',
], { colour: 'B7791F', fill: 'FFF8E6' });
table(['Command', 'What it does'], [
  ['`npm run cms:start`', 'Starts the database and the admin. Safe to run again if it is already running.'],
  ['`npm run cms:status`', 'Shows whether each part is running.'],
  ['`npm run cms:stop`', 'Stops the admin. All content is kept. Run cms:start to use it again.'],
], [3000, 6026]);
P('After the computer restarts, the admin needs starting again with `npm run cms:start`.');

H2('2.2 Signing in');
steps([
  'Go to **http://localhost:8055/admin**.',
  'Enter your email address and password, then click **Sign In**.',
  'When asked, enter the 6-digit code shown in your authenticator app (two-factor authentication, "2FA"). Codes change every 30 seconds; if one is refused, wait for the next one.',
]);
shot('01-login.png', 'The sign-in page.', { width: 520 });
H3('Setting up two-factor authentication')
P('Two-factor authentication is **required** for the Super Admin and Club Admin roles and **recommended** for everyone. If your role requires it, the admin asks you to set it up the first time you sign in. Otherwise, set it up yourself from your own profile (the round person icon at the bottom left).');
steps([
  'Install an authenticator app on your phone (for example Microsoft Authenticator or Google Authenticator).',
  'In the admin, choose to enable two-factor authentication. The admin shows a QR code.',
  'Scan the QR code with the app, then type the 6-digit code from the app into the admin to confirm.',
]);
P('Keep your phone and authenticator app safe. If you lose access to them, ask the Super Admin to reset two-factor authentication on your account (section 12).');
P('Accounts lock after **5 failed sign-in attempts**. Passwords must be at least **12 characters**.');

H2('2.3 The "Have a license key?" message');
P('After signing in, a box asking **Have a license key?** may appear on every page. The club does not have a licence key yet (see section 13). Click **Skip**. Do not enter anything in this box unless the club has received a key from Directus; adding a key is a job for the Super Admin.');
shot('02a-licence-prompt.png', 'The licence message. Click Skip.', { width: 520 });

// ======================================================================
H1('3. Finding your way around');
P('The screen has three parts: a narrow icon bar on the far left, the navigation menu next to it, and the main working area. A panel on the right holds extra tools such as revisions and comments.');
shot('02-navigation.png', 'The admin after signing in, showing the Teams list and the navigation menu.');
H2('3.1 The navigation menu');
P('Content is grouped into four folders. You see only the sections your role allows.');
table(['Folder', 'Sections'], [
  ['**Football**', 'Teams; Players and staff; Team allocations; Fixtures and results; League tables; Competitions; Seasons'],
  ['**News and events**', 'News articles; Announcements; Events'],
  ['**Commercial**', 'Sponsors; Sponsorship packages'],
  ['**Club**', 'Club pages; Club details'],
], [2400, 6626]);
P('Under **Players and staff** and **Team allocations** there are ready-made shortcuts (bookmarks):');
bullets([
  '**Players and staff:** Drafts (not on the website); Men\'s First Team; Published profiles; Women\'s First Team.',
  '**Team allocations:** Inactive players; Men\'s squad order; Women\'s squad order.',
]);
H2('3.2 The icon bar');
table(['Icon', 'Name', 'Use'], [
  ['Cube', 'Content', 'All the sections above. This is where most work happens.'],
  ['People', 'User Directory', 'Staff accounts. Only the Super Admin can add or change accounts.'],
  ['Folder', 'File Library', 'All uploaded photographs and files, in folders.'],
  ['Bell (bottom)', 'Notifications', 'Messages from the admin, such as "Website not updated".'],
  ['Person (bottom)', 'Your profile', 'Your name, password, two-factor authentication and sign out.'],
], [1700, 2000, 5326]);
P('Some other icons (such as Insights, Flows and Settings) are for the Super Admin and are not needed for day-to-day editing.');
H2('3.3 Lists');
bullets([
  'Click a row to open it. Click **Create** (top right) to add a new item.',
  'Use the **magnifying glass** to search and the **filter** icon to narrow a list.',
  'Click a column heading to sort by it.',
  'Next to a list\'s name you may see a **Published** label. Leave it on Published to see the saved records.',
]);

// ======================================================================
H1('4. Staff roles and accounts');
P('Each staff account has one role, which decides what that person can see and change.');
table(['Role', 'Can manage', 'Publishes directly?'], [
  ['**Super Admin**', 'Everything, including staff accounts, roles and settings.', 'Yes'],
  ['**Club Admin**', 'All website content. Approves other staff\'s changes. Can see revision history.', 'Yes'],
  ['**Football Editor**', 'Players and staff, team allocations and squad order, team names, fixtures, results, league tables, seasons, competitions, and news articles in the Match report and Match preview categories.', 'Yes'],
  ['**Media Editor**', 'News articles, announcements, events and photographs.', 'Yes, except major announcements, which need Club Admin approval'],
  ['**Commercial Editor**', 'Sponsors, sponsorship packages and commercial club pages.', 'No. A Club Admin approves and publishes their changes.'],
], [2100, 4826, 2100]);
P('Every editor can upload photographs but can change or delete only the files they uploaded themselves. No editor can create or delete whole teams, change staff accounts or change admin settings.');
H2('4.1 Adding a staff account (Super Admin only)');
P('Invitation emails are not sent at the moment (section 13), so the Super Admin creates accounts and sets the first password:');
steps([
  'Click the **User Directory** icon, then **Create**.',
  'Enter the person\'s first name, last name and email address.',
  'Set a password of at least 12 characters and choose their **Role**.',
  'Save. Give the person their password in person, not by email, and ask them to change it from their profile and set up two-factor authentication.',
]);
callout('Account limit', [
  'Without a licence key the admin allows **3 staff accounts that can sign in to the admin**, including the Super Admin. See section 13.',
], { colour: 'B7791F', fill: 'FFF8E6' });

// ======================================================================
H1('5. Saving, drafts and publishing');
P('Two separate things decide whether a change reaches the website. Getting both right is the most important part of using the admin.');
table(['', 'What it is', 'Where you see it'], [
  ['**1. The Publish button**', 'Saves your edits. While you edit an existing item, the admin keeps your changes in a separate **Draft copy**, and the real record stays unchanged. Clicking **Publish** copies your edits into the real record.', 'Top right of the item. The label next to the item\'s title shows **Draft** while you are working on the draft copy and **Published** for the saved record.'],
  ['**2. The item\'s status**', 'Decides whether the website shows the item: Draft, In review, Published or Archived. For team allocations it is called **Squad status**: Active, Inactive or Removed from team.', 'The first field on the form (Website status, Status or Squad status).'],
], [2200, 4126, 2700]);
callout('Saving is not the same as going live', [
  'Clicking **Publish** saves your work. It does not by itself put the item on the website.',
  'The website shows an item only when it has been saved with the Publish button **and** its status is **Published** (or **Active** for a team allocation).',
  'To save something without showing it on the website, leave its status as **Draft** and click Publish.',
]);
H2('5.1 Making a change to an existing item');
steps([
  'Open the item. The label next to the title says **Published**: this is the saved record.',
  'Start making your changes. On the first change the admin switches to the **Draft** copy and shows the message **Editing on draft version**. From then on your edits are saved in the Draft copy automatically. They do not change the saved record or the website.',
  'Check the status field is what you want (for example Published to show it on the website, or Draft to hide it).',
  'Click **Publish** (top right). A comparison of your changes opens; check them and confirm. The arrow next to the button also offers **Publish and Quit**, and **Publish without Review**, which skips the comparison.',
]);
bullets([
  'If the button says **Edit** instead of Publish, the item already has a Draft copy with unpublished changes. Click **Edit** to carry on with it.',
  'If the Publish button is grey, nothing has changed yet.',
  'If you leave without publishing, your edits stay in the Draft copy. They are not lost, but they are not in the saved record or on the website until someone clicks Publish.',
]);
H2('5.2 Creating a new item');
P('A new item starts as a Draft copy (the label next to "Creating…" says **Draft**). Fill in the form and click **Publish** to create it. Its status field still controls whether the website shows it; new player profiles start with status **Draft (not on the website)**.');
H2('5.3 Pages with a plain Save button');
P('**Teams** and **Club details** have no draft copies. Their button says **Save**, and saving changes them straight away.');
H2('5.4 Statuses');
table(['Status', 'Meaning'], [
  ['**Draft**', 'Being prepared. Never shown on the website.'],
  ['**In review**', 'Ready for a Club Admin to check. Not shown on the website.'],
  ['**Published**', 'Shown on the website (for content the website displays; see section 11).'],
  ['**Archived**', 'Kept for the record but no longer shown. Use this instead of deleting.'],
], [2200, 6826]);
H2('5.5 Changes that need Club Admin approval');
P('Commercial Editors (sponsors, sponsorship packages, commercial pages) and Media Editors (major announcements) cannot publish these items themselves:');
steps([
  'Prepare the item and set its status to **In review**. Add a note in the **Comments** panel on the right if useful.',
  'For an item that is already live, make your changes in the Draft copy and do not publish them yourself.',
  'A Club Admin opens the item, checks it (using the label next to the title to switch to the Draft copy if needed), sets it to Published and clicks Publish.',
]);
P('If you try to publish something that needs approval, the admin refuses with a message such as **"Publishing this needs Club Admin approval. Save it as "In review" and a Club Admin will publish it."** This is expected.');

// ======================================================================
H1('6. Teams and squads');
P('The club has two teams in the admin: **Men\'s First Team** and **Women\'s First Team**. Open **Football → Teams** and click a team to see its squad.');
shot('03-team-squad.png', 'A team page. The Squad list shows everyone allocated to the team, in website order.');
table(['Field', 'What it is'], [
  ['**Website key**', 'Fixed (mens or womens). Used in website addresses, so it cannot be changed here.'],
  ['**Team name**', 'The team\'s name.'],
  ['**Squad**', 'Everyone in the team: photo, name, position, squad number, captaincy, squad status and profile status.'],
  ['**"To be confirmed" cards**', 'How many "Player to be confirmed" cards the website shows after the named players.'],
], [2600, 6426]);
H2('6.1 Working with the Squad list');
bullets([
  '**Reorder:** drag a row by its handle (the two lines on the left). This is the order on the website. Click **Save** at the top of the team page afterwards.',
  '**Open a row:** click the open icon (square with an arrow) on the right of the row to change squad number, position, captaincy or squad status.',
  '**Add someone:** click the red **+** button above the list (section 6.2).',
  '**Remove from the team:** see section 9.4. The bin icon removes only the team allocation, never the person\'s profile.',
]);
P('**Team numbers in lists.** In some lists and fields, a team shows as a number instead of its name: **1 = Men\'s First Team**, **2 = Women\'s First Team**.');
H2('6.2 Adding a player to a team');
steps([
  'Open **Football → Teams** and click the team.',
  'In the **Squad** section, click the red **+** button. A panel opens on the right: **Creating Team allocation**.',
  '**Squad status** starts as **Active (on the squad page)**. Choose Inactive if they should not appear yet.',
  '**Team:** if this box is empty, choose the team you are working on.',
  '**Player or staff member:** click the box to choose an existing profile, or click **+** to create a new profile (section 7.3).',
  'Set **Role in team** (Player or Staff), then **Position**, **Squad number** and **Captaincy** as needed. Staff members have a **Staff title** instead (for example Manager).',
  'Click **Save** at the top of the panel, then **Save** at the top of the team page.',
]);
shot('04-team-add-player.png', 'Adding someone to a team from its Squad list.');
P('The player appears on the website only when their **profile** is Published and this allocation is **Active** (section 9.1).');
H2('6.3 Adding or removing a whole team');
P('Editors cannot create or delete teams. A new team also needs changes to the website itself, so ask the website administrator.');

// ======================================================================
H1('7. Players and staff profiles');
P('**Football → Players and staff** lists everyone: players and staff, in all teams, published or not. Each person has one profile, shared by every team they are in.');
shot('05-players-list.png', 'The Players and staff list, with photograph, name, team allocations and website status.');
P('Use the bookmarks under Players and staff to see only one team, only drafts or only published profiles.');
H2('7.1 The profile form');
shot('06-player-profile-top.png', 'The top of a player profile: website status, name and web address.');
table(['Field', 'Shown on website?', 'Notes'], [
  ['**Website status**', '—', 'Draft (not on the website), In review, Published (on the website) or Archived.'],
  ['**First name / Surname**', 'No', 'For staff records.'],
  ['**Display name** (required)', 'Yes', 'The name shown on the website, e.g. a preferred first name and surname.'],
  ['**Web address** (required)', 'Yes, in the page address', 'Lower-case words joined by hyphens, e.g. jess-corner. Must be unique. Changing it changes the page address.'],
  ['**Profile photograph**', 'Yes', 'See section 8.'],
  ['**Photo description**', 'Read by screen readers', 'e.g. "squad portrait in the red home shirt".'],
  ['**Team allocations**', 'Yes', 'The teams this person is in, with squad number, position and captaincy for each (section 9).'],
  ['**Biography**', 'Yes', 'Optional, a few sentences.'],
  ['**Player sponsor / Sponsor website**', 'Yes', 'Optional. The website address must start https://'],
  ['**Internal notes** (Staff only section)', 'Never', 'Notes for staff.'],
], [2600, 1900, 4526]);
P('**Missing details are left out cleanly.** If squad number, position, captaincy, biography or sponsor are empty, the website does not show an empty box or invent anything. Instead the profile page says, for example, "Position, squad number, biography and statistics will be added once confirmed by the club", and a squad card without a position shows the team name. This was checked on the admin computer (section 10.1).');
callout('Privacy', [
  'Never enter dates of birth, home addresses, phone numbers, email addresses or other private details in any field that is shown on the website, including the biography.',
]);
shot('07-player-profile-teams.png', 'Further down the profile: the photograph, the Teams section and the biography.');
H2('7.2 Editing a player');
steps([
  'Open **Players and staff** (or a team\'s squad list) and click the person.',
  'Change what you need. The admin keeps your edits in the Draft copy.',
  'Click **Publish** to save. If the profile\'s Website status is Published, the website is updated with your changes (section 10).',
]);
H2('7.3 Creating a new player profile');
P('You can create a profile while adding someone to a team (section 6.2), or on its own:');
steps([
  'Open **Players and staff** and click **Create**.',
  'Leave **Website status** as **Draft (not on the website)** until everything is ready.',
  'Enter first name, surname, **Display name** and **Web address**.',
  'Upload the photograph (section 8) and add a photo description.',
  'Under **Teams**, click the red **+** button to add a team allocation (section 9).',
  'Add a biography and sponsor if you have them, then click **Publish** to save.',
  'When ready to show the player on the website, change Website status to **Published (on the website)** and click **Publish** again.',
]);
shot('08-new-player.png', 'A new profile starts with Website status set to Draft (not on the website).');
H2('7.4 Checks the admin makes');
P('The admin refuses to save if something is wrong and shows a message beside the field:');
table(['Problem', 'Message or fix'], [
  ['Squad number outside 1–99', 'Squad numbers are whole numbers from 1 to 99.'],
  ['Unknown position', 'Choose one of: Goalkeeper, Defender, Midfielder, Forward.'],
  ['Unknown captaincy', 'Choose Captain or Vice-captain, or leave it empty.'],
  ['Sponsor website without https://', 'Enter a full web address starting https://, or leave it empty.'],
  ['Web address already used or badly formed', 'Use lower-case words joined by hyphens, different from every other profile.'],
  ['No display name', 'Display name is required.'],
], [3300, 5726]);

// ======================================================================
H1('8. Photographs');
H2('8.1 Uploading a profile photograph');
steps([
  'Open the player\'s profile and go to the **Photograph** section.',
  'Click the **Profile photograph** box and upload a file from your computer, or choose one already in the File Library.',
  'Use a portrait photo: JPEG, PNG or WebP, up to 25 MB.',
  'Fill in **Photo description**, then click **Publish** to save.',
]);
P('The website crops the photo to a 4:5 portrait. To control which part stays in view, open the photo in the **File Library** and set its **focal point** (the most important part of the picture, usually the face).');
H2('8.2 Replacing a photograph');
steps([
  'In the profile\'s **Profile photograph** box, remove the current photo.',
  'Upload the new photo in the same box.',
  'Check the preview and the photo description, then click **Publish**.',
]);
P('The old file stays in the File Library. Editors can delete only files they uploaded themselves; ask a Club Admin to remove any other file.');
H2('8.3 The File Library');
P('Click the **folder** icon in the icon bar. Photos are kept in folders: Events, News, Opposition badges, Pages, Sponsors and Squad photos. Please upload player photos to **Squad photos**.');
shot('13-file-library-crop.png', 'The File Library folders.');

// ======================================================================
H1('9. Team allocations: adding, moving and removing players');
P('A **team allocation** links one person to one team and holds everything that is specific to that team. Open one from a team\'s Squad list, a profile\'s Teams section, or **Football → Team allocations**.');
shot('09-team-allocation.png', 'A team allocation: squad status, team, person, role, position, squad number, captaincy, season and leaving date.');
table(['Field', 'Notes'], [
  ['**Squad status**', '**Active (on the squad page)**, **Inactive (hidden from the squad page)** or **Removed from team**.'],
  ['**Team**', 'Change this to move the person to another team.'],
  ['**Player or staff member**', 'The profile this allocation belongs to.'],
  ['**Role in team**', 'Player or Staff.'],
  ['**Position**', 'Goalkeeper, Defender, Midfielder or Forward (players only).'],
  ['**Squad number**', '1 to 99, for this team only.'],
  ['**Captaincy**', 'Captain or Vice-captain, for this team only. Leave empty for most players.'],
  ['**Staff title**', 'Staff only, e.g. Manager.'],
  ['**Season**', 'Optional.'],
  ['**Left the team on**', 'Optional. From this date the person no longer appears on the squad page.'],
], [2600, 6426]);
H2('9.1 Who appears on a squad page');
table(['Profile Website status', 'Allocation Squad status', 'On that team\'s squad page?'], [
  ['Published', 'Active, and no leaving date has passed', '**Yes**, on that team only'],
  ['Published', 'Active, but the "Left the team on" date has passed', 'No'],
  ['Published', 'Inactive', 'No'],
  ['Published', 'Removed from team', 'No'],
  ['Draft, In review or Archived', 'Any', 'No, on any team'],
], [3000, 3600, 2426]);
P('A published player appears only on the teams they have an Active allocation for, never on another team\'s pages. When they are hidden, their profile page is hidden too. Every row of this table was checked on the admin computer (section 10.1).');
P('**In lists, squad status may show the admin\'s own words:** Published means Active, Draft means Inactive, and Archived means Removed from team.');
H2('9.2 Moving a player to another team');
steps([
  'Open the player\'s allocation for their current team.',
  'Change **Team** to the new team. Check squad number, position and captaincy are still right.',
  'Click **Publish**.',
]);
P('At the next website update the player leaves the old team\'s squad page, and their old profile page and the photo files used for it are removed; they appear on the new team\'s pages instead. Nothing is left behind on the old team (checked on the admin computer).');
H2('9.3 Putting a player in more than one team');
steps([
  'Open the player\'s profile and scroll to **Teams**.',
  'Click the red **+** button and fill in the new allocation (team, squad status, position, squad number, captaincy).',
  'Save the allocation, then click **Publish** on the profile.',
]);
P('The player keeps one profile and one photo; squad number, position and captaincy can be different in each team.');
H2('9.4 Taking a player out of a team');
P('Choose the option that fits:');
bullets([
  '**For now (injury, loan, not registered yet):** set Squad status to **Inactive**. They disappear from the squad page but stay in the team\'s list in the admin.',
  '**They have left:** set Squad status to **Removed from team** and, if you know it, the **Left the team on** date. Their profile and photo are kept.',
  '**Delete the allocation altogether:** first set it to Removed from team and publish, then click the bin icon on the row and save. An Active allocation cannot be deleted by an editor; the admin will ask you to use Removed from team first.',
]);
P('If the person is not in any team any more, you can also set their profile\'s Website status to **Archived**. Profiles are not normally deleted.');
H2('9.5 Setting the display order');
P('The website lists a squad in the order of the team\'s Squad list. Drag rows into order on the team page and click **Save**. You can also use the **Men\'s squad order** and **Women\'s squad order** bookmarks under Team allocations.');
shot('10-allocations-list.png', 'Football → Team allocations, showing every allocation with team (1 = Men\'s, 2 = Women\'s), position and squad number.');

// ======================================================================
H1('10. How saved changes reach the website');
P('The website is not read directly from the admin. When a change to website content is saved into the record (with the Publish button, or Save on Teams and Club details), the admin asks for the website to be rebuilt from the published content.');
P('Only **published** content is used: records with status Published and allocations that are Active. Unpublished Draft copies, drafts, items in review, inactive or removed allocations and internal notes are never used.');
callout('Where this works today', [
  '**Tested:** the admin computer only. There, a rebuild updates a **local copy** of the website for checking, while the rebuild service is running in its own PowerShell window (`npm run cms:listen`).',
  '**Not set up:** the live website. The admin is **not connected to bridtown.com** and nothing has been deployed, so visitors to bridtown.com see none of these changes. Connecting the admin to a live website is a later step for the website administrator.',
], { colour: 'B7791F', fill: 'FFF8E6' });
H2('10.1 What has been checked on the admin computer');
P('On 16 November 2026 the whole player publishing process was tested on the admin computer: from a saved change in the admin, through the rebuild, to the local copy of the website. The test used a temporary test player, who was removed afterwards. It confirmed that:');
bullets([
  '**Draft players stay hidden.** A player whose profile is Draft appears on no page, even when their team allocation is Active.',
  '**Published players appear only on their own team.** Name, squad number, position, captaincy, biography, sponsor and photo appear on the allocated team\'s squad page and profile page, in the squad\'s display order, and not on the other team\'s pages.',
  '**Moving teams leaves nothing behind.** After a player moves, the old team\'s squad entry, the old profile page and its photo files are removed.',
  '**Missing optional details are left out cleanly.** No empty boxes appear, and nothing is invented (section 7.1).',
  '**Hidden players disappear completely.** Inactive and Removed from team allocations, and allocations whose "Left the team on" date has passed, are hidden from the squad page, with no leftover profile page. Setting the allocation back to Active shows the player again.',
  '**A failed update keeps the existing website.** If a rebuild fails, the website stays exactly as it was and you get a **Website not updated** notification.',
  '**Saving again after a failure works.** Publishing the change again updates the website, and you get a **Website updated** notification.',
]);
H2('10.2 Notifications');
P('Watch the **bell** icon (bottom left) after publishing:');
table(['Notification', 'What it means and what to do'], [
  ['No notification', 'The website update worked first time. Nothing to do.'],
  ['**Website not updated**: "…were saved in the CMS but have not reached the website… The website still shows the last successful version."', 'Your change is safe in the admin, but the website kept its previous version. Publish the item again to retry. If it keeps failing, contact the website administrator.'],
  ['**Website not updated**: "…the website could not be asked to update…"', 'The rebuild service is not running. On the admin computer, start it with `npm run cms:listen`, then publish again.'],
  ['**Website updated**', 'Sent after an earlier failure, when your changes have now reached the website.'],
], [4200, 4826]);
H2('10.3 Timing');
P('The admin groups ordinary edits together and asks for one rebuild within about **a minute** of the first change. Matchday content (fixtures, results, league tables and announcements) is sent within about **5 seconds**. The rebuild itself then takes a little longer. These timings are how the admin is set up; the live website\'s timing will be confirmed when it is connected.');

// ======================================================================
H1('11. Other sections of the admin');
P('Not every section is shown on the website yet. Content entered in the sections marked "not yet" is kept safely and will appear once the matching part of the website is built.');
table(['Section', 'On the website now?', 'Who manages it'], [
  ['Teams, Players and staff, Team allocations', 'Yes (squad pages and player profiles)', 'Football Editor, Club Admin'],
  ['News articles', 'Yes (team news cards)', 'Media Editor; Football Editor for match reports and previews; Club Admin'],
  ['Sponsorship packages', 'Yes', 'Commercial Editor (with approval), Club Admin'],
  ['Fixtures and results, League tables, Competitions, Seasons', 'Not yet', 'Football Editor, Club Admin'],
  ['Announcements, Events', 'Not yet', 'Media Editor, Club Admin'],
  ['Sponsors, Club pages', 'Not yet', 'Commercial Editor (with approval; commercial pages only), Club Admin'],
  ['Club details', 'Not yet', 'Club Admin'],
], [3300, 2626, 3100]);
P('Club text that is still part of the website design (team introductions, the Club page and homepage text) cannot be edited in the admin yet.');

H2('11.1 News articles');
shot('12-article-form.png', 'A news article.');
table(['Field', 'Notes'], [
  ['**Status**', 'Only Published articles appear.'],
  ['**Title**, **Slug**', 'Slug is the web address part, lower-case words joined by hyphens.'],
  ['**Category**', 'Club news, Match report, Match preview, Player news, Commercial, Community, Events or Statement. Football Editors can only use Match report and Match preview.'],
  ['**Team**', 'Leave empty for club-wide news shown to both teams (1 = Men\'s, 2 = Women\'s).'],
  ['**Summary** (required)', 'One or two sentences, shown on the news card.'],
  ['**Body**, **Hero image**, image description', 'The full article and its main photo.'],
  ['**Published at**', 'Leave empty to publish immediately, or set a future date and time to schedule it.'],
  ['**Read more link**', 'Where "Read more" goes until article pages are added.'],
], [2900, 6126]);
H2('11.2 Announcements');
P('Title, message, optional team and link, and start and end times. Set **Importance** to **Routine** (Media Editors can publish) or **Major club announcement** (needs Club Admin approval). Announcements show only between their start and end times.');
H2('11.3 Events');
P('Title, web address, optional team, start and end time, venue, booking link, image and description.');
H2('11.4 Fixtures and results');
P('Team, competition, season, opponent and badge, home/away/neutral, venue, kick-off, match status (Scheduled, Live, Full time, Postponed, Abandoned, Cancelled), scores, attendance and a public note such as "Rearranged from 14 November". To correct a match that was imported automatically, enter its Match Centre id (for example football-web-pages:591448).');
H2('11.5 League tables, Competitions and Seasons');
P('A league table has a team, competition, season, the date it was correct and its source, with one row per club (position, played, won, drawn, lost, goals, points). Competitions and seasons are short reference lists used by fixtures and tables.');
H2('11.6 Sponsors and sponsorship packages');
P('**Sponsors:** name, tier, logo, website, description, start and end dates (the sponsor stops appearing after the end date), and whether they are featured. **Sponsorship packages:** title, category and a short description. The price fields are for internal use only: prices are never shown on the website, and visitors are asked to contact the club. Publishing or changing a live sponsor, package or club page needs Club Admin approval.');
H2('11.7 Club pages and Club details');
P('**Club pages** have a title, web address, area (Club, Commercial, Matchday, Community, Policies), summary, body and a review date. **Club details** is a single form with the club name, ground, address, contact email and phone, and social media links. It has a plain **Save** button.');
shot('14-club-details.png', 'Club details.');

// ======================================================================
H1('12. Common problems and how to fix them');
table(['Problem', 'What to do'], [
  ['The login page does not load', 'The admin is not running. On the admin computer run `npm run cms:start` (section 2.1). If it fails, note the message and the log folder it mentions and contact the website administrator.'],
  ['Windows shows a security message or "blocked" when starting the admin', 'Do not turn off Windows security. Contact the website administrator with the exact message.'],
  ['"Have a license key?" box appears', 'Click Skip (section 2.3).'],
  ['The 2FA code is refused', 'Wait for a new code and type it straight away. Check the phone\'s clock is set automatically.'],
  ['Lost phone or authenticator app', 'Ask the Super Admin to reset two-factor authentication on your account. If the Super Admin loses theirs, contact the website administrator.'],
  ['Forgotten password or locked account (5 failed attempts)', 'Reset emails are not sent at the moment. Ask the Super Admin to set a new password and make the account active again in the User Directory.'],
  ['A player is not on the website', 'Check: (1) the profile\'s Website status is Published and you clicked Publish; (2) their allocation for that team is Active; (3) no "Left the team on" date has passed; (4) the Team is correct; (5) the bell for a Website not updated notification. Remember the admin currently updates only the local copy of the website, not bridtown.com.'],
  ['A player is in the wrong place in the squad', 'Drag them into place in the team\'s Squad list and click Save (section 9.5).'],
  ['"This item is live on the website. Archive it, or ask a Club Admin to delete it."', 'You tried to delete something that is published. Set it to Archived (or Removed from team for an allocation) instead.'],
  ['"Publishing this needs Club Admin approval…"', 'Set the status to In review; a Club Admin will publish it (section 5.5).'],
  ['"You can only change or delete files you uploaded."', 'Ask a Club Admin to change or delete that file.'],
  ['A red message under a field', 'Correct the field as described (section 7.4) and try again.'],
  ['"Website not updated" notification', 'Your change is saved in the admin and the website still shows its previous version. Publish the item again to retry; a Website updated notification confirms it worked. If the message says the website could not be asked to update, start `npm run cms:listen` on the admin computer first (section 10.2).'],
  ['Publish button is grey', 'Nothing has changed yet, or a required field is empty.'],
  ['A team shows as a number', '1 = Men\'s First Team, 2 = Women\'s First Team.'],
  ['Something was changed by mistake', 'A Club Admin can open the item\'s **Revisions** panel (on the right) to see earlier versions and restore one.'],
  ['Something was deleted by mistake', 'Contact the website administrator straight away. A database backup was taken before the latest admin changes, but restoring one is a technical job.'],
], [3300, 5726]);

// ======================================================================
H1('13. Current limitations');
bullets([
  '**Not live yet.** The admin runs on one club computer at http://localhost:8055/admin and can only be used on that computer. Publishing has been tested there against a local copy of the website (section 10.1), but the admin is not connected to the live website at bridtown.com, nothing has been deployed, and no online hosting is set up.',
  '**No emails.** Windows security currently blocks the local email program (Mailpit), so **password-reset and invitation emails are not sent**. The Super Admin sets passwords for new and locked-out staff (section 4.1).',
  '**No licence key yet.** The admin runs on Directus\'s free Core plan: at most **3 staff accounts** can use the admin, and the "Have a license key?" message appears. Some finer privacy limits are not enforced: staff can see colleagues\' email addresses, and Commercial Editors can see all club pages, not just commercial ones (they can still only change commercial pages). The club can apply for a free Directus Open Innovation Grant licence, which removes these limits.',
  '**Automations are unavailable.** Windows security also blocks parts of the admin used for custom automations ("Run Script" flows). Day-to-day editing is not affected.',
  '**Several sections are not on the website yet:** fixtures and results, league tables, announcements, events, sponsors, club pages and club details (section 11).',
  '**Website enquiries** are stored by the system but do not appear in the admin menu yet.',
  '**Some lists show teams as numbers** (1 = Men\'s First Team, 2 = Women\'s First Team).',
  '**Adding a player from a team:** the Team box in the new allocation panel may be empty; choose the team yourself (section 6.2).',
  '**Club text in the website design** (team introductions, the Club page and homepage text) cannot be edited in the admin yet.',
  '**New teams** need a change to the website itself.',
  '**No automatic backups** are scheduled yet.',
]);

// ======================================================================
H1('14. Quick reference');
table(['I want to…', 'Do this'], [
  ['Start the admin', '`npm run cms:start` in the project folder, then open http://localhost:8055/admin'],
  ['Add a player to a team', 'Teams → team → Squad + → choose or create the profile → Save → Save team'],
  ['Show a new player on the website', 'Profile Website status Published + allocation Active, then Publish'],
  ['Hide a player for now', 'Their allocation → Squad status Inactive → Publish'],
  ['Move a player to another team', 'Their allocation → change Team → Publish'],
  ['Put a player in two teams', 'Profile → Teams → + → new allocation → Publish'],
  ['Take a player out of a team', 'Allocation → Removed from team (+ Left the team on date) → Publish'],
  ['Change the squad order', 'Teams → team → drag rows → Save'],
  ['Replace a photo', 'Profile → remove photo → upload new one → Publish'],
  ['Save without publishing to the website', 'Leave status as Draft, then click Publish'],
  ['Check a change reached the (local) website', 'Bell icon: no message = done; Website not updated = publish again'],
  ['Get approval', 'Status In review, comment for the Club Admin'],
  ['Stop the admin', '`npm run cms:stop` (content is kept)'],
], [3300, 5726]);

// ======================================================================
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

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log(`wrote ${OUT} (${Math.round(buf.length / 1024)} KB, ${figure} figures)`); });
