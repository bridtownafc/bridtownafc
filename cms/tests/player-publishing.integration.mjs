// End-to-end check that player changes made in the CMS reach the right public team pages
// through the real publishing chain: Directus write -> brid-publishing extension -> rebuild
// listener -> cms/scripts/build-from-cms.mjs (sync + astro build) -> dist/.
// Uses one temporary person, membership and photo, all removed at the end, and checks:
// drafts stay private; publishing shows name, number, position, biography and photo on the
// correct team only; moving teams leaves no stale page; a player who has left disappears;
// a failed build keeps the last good website and notifies the member of staff; deleting
// removes every trace, including photo files.
//
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 publishing
// Needs: npm run cms:start. Starts its own rebuild listener (short batching) unless one runs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
const LISTENER = `http://127.0.0.1:${env.REBUILD_LISTEN_PORT || 4400}`;
const DIST = 'dist';
const tag = randomBytes(3).toString('hex');
const slug = `test-player-${tag}`;
const name = `Test Player ${tag.toUpperCase()}`;
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const me = await admin.get('/users/me?fields=id');
const teams = Object.fromEntries((await admin.get('/items/teams?fields=id,key')).map((t) => [t.key, t.id]));
const created = { person: null, membership: null, file: null };
// Captaincy and sponsor come from the staff admin's player management; tested once applied.
const hasField = async (collection, field) => (await admin.get(`/fields/${collection}`)).some((f) => f.field === field);
const extras = (await hasField('people', 'sponsor_name')) && (await hasField('squad_memberships', 'captaincy'));
console.log(extras ? 'Captaincy and player sponsor fields found: included.' : 'Captaincy and player sponsor fields not in this CMS yet: skipped.');
const children = [];
const startedAt = Date.now();

const step = (text) => console.log(`\n- ${text}`);
const pass = (text) => console.log(`  PASS ${text}`);

// --- Rebuild listener ------------------------------------------------------------------------
async function status() {
  const response = await fetch(`${LISTENER}/status`, { signal: AbortSignal.timeout(3000) });
  return response.json();
}
if (await status().then(() => true, () => false)) {
  console.log(`Using the rebuild listener already running at ${LISTENER}.`);
} else {
  console.log('Starting a rebuild listener for this test (changes batched for 3 s).');
  const listener = spawn(process.execPath, ['cms/scripts/rebuild-listener.mjs'], {
    env: { ...process.env, REBUILD_BATCH_SECONDS: '3', REBUILD_URGENT_SECONDS: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  children.push(listener);
  for (let i = 0; i < 40 && !(await status().then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 250));
}

/** Waits for the first build that started after `since` to finish, and returns it. */
async function buildAfter(since, timeoutMs = 8 * 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { lastBuild } = await status();
    if (lastBuild?.finishedAt && Date.parse(lastBuild.startedAt) >= since) return lastBuild;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('No website build finished in time. Is the brid-publishing extension calling the listener?');
}

/** Makes a CMS change and waits until the website build that includes it has finished. */
async function publish(change) {
  const since = Date.now();
  await change();
  return buildAfter(since);
}

// --- Built pages -----------------------------------------------------------------------------
const page = (p) => (existsSync(path.join(DIST, p, 'index.html')) ? readFileSync(path.join(DIST, p, 'index.html'), 'utf8') : null);
const allHtml = (dir = DIST) => readdirSync(dir).flatMap((f) => {
  const full = path.join(dir, f);
  return statSync(full).isDirectory() ? allHtml(full) : full.endsWith('.html') ? [full] : [];
});
const mentions = () => allHtml().filter((f) => readFileSync(f, 'utf8').includes(name)).map((f) => path.relative(DIST, f).replace(/\\/g, '/'));
const images = (html) => [...html.matchAll(/(?:src|srcset)="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0])).filter((src) => src.includes(slug));

function assertListedOn(team) {
  const other = team === 'mens' ? 'womens' : 'mens';
  const squad = page(`${team}/team`);
  assert.ok(squad.includes(name), `${name} is not on the ${team} squad page`);
  assert.ok(squad.includes(`href="/${team}/team/${slug}/"`), 'the squad card does not link to the profile');
  const profile = page(`${team}/team/${slug}`);
  assert.ok(profile, `no ${team} profile page`);
  assert.equal(page(`${other}/team/${slug}`), null, `a stale ${other} profile page remains`);
  assert.ok(!page(`${other}/team`).includes(name), `the player is still on the ${other} squad page`);
  const photos = images(profile);
  assert.ok(photos.length > 0, 'the profile shows no player photo');
  for (const src of photos) {
    assert.ok(src.startsWith(`/media/cms/squad/${team}/`), `photo ${src} is not in the ${team} folder`);
    assert.ok(existsSync(path.join(DIST, src)), `photo ${src} is missing from the build`);
  }
  return { squad, profile };
}

try {
  // A small generated portrait stands in for a squad photo.
  const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#a81c2c' } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('title', `${name} test photo`);
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), `${slug}.jpg`);
  created.file = await admin.post('/files', form);
  assert.ok(created.file?.id, 'test photo upload failed');

  step('Draft player with a draft membership stays private');
  let build = await publish(async () => {
    created.person = await admin.post('/items/people', {
      status: 'draft', display_name: name, slug, photo: created.file.id, photo_description: 'test portrait',
      biography: `${name} is a **temporary** record created by the publishing test.`,
      ...(extras ? { sponsor_name: `Sponsor ${tag}`, sponsor_url: 'https://example.com/sponsor' } : {}),
    });
    created.membership = await admin.post('/items/squad_memberships', {
      status: 'draft', team: teams.mens, person: created.person.id, kind: 'player', shirt_number: 98, position: 'Midfielder', sort: 9999,
      ...(extras ? { captaincy: 'vice_captain' } : {}),
    });
  });
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  assert.deepEqual(mentions(), []);
  pass('the extension triggered a build, and the draft appears on no page');

  step('Publishing the membership alone is not enough while the person is a draft');
  build = await publish(() => admin.patch(`/items/squad_memberships/${created.membership.id}`, { status: 'published' }));
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  assert.deepEqual(mentions(), []);
  pass('still hidden');

  step('Publishing the person shows them on the men\'s pages only');
  build = await publish(() => admin.patch(`/items/people/${created.person.id}`, { status: 'published' }));
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  let { squad, profile } = assertListedOn('mens');
  assert.match(squad, /Midfielder/);
  assert.match(squad, /class="player-number"[^>]*>.*?98</s);
  assert.match(profile, /<dt[^>]*>Squad number<\/dt><dd[^>]*>98<\/dd>/);
  assert.match(profile, /<dt[^>]*>Position<\/dt><dd[^>]*>Midfielder<\/dd>/);
  assert.match(profile, /<strong>temporary<\/strong> record created by the publishing test/);
  assert.match(profile, /Statistics will be added once confirmed by the club/);
  if (extras) {
    assert.match(squad, /Midfielder · Vice-captain/);
    assert.match(profile, /<dd[^>]*>Vice-captain<\/dd>/);
    assert.match(profile, new RegExp(`Player sponsor: <a href="https://example.com/sponsor" rel="sponsored noopener"[^>]*>Sponsor ${tag}</a>`));
    pass('captaincy and player sponsor shown');
  }
  const profileLinks = [...squad.matchAll(/class="player-card" href="\/mens\/team\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  assert.equal(profileLinks.at(-1), slug, 'display order: the test player (sort 9999) should be listed last');
  pass('name, number, position, biography and photo shown; listed last by display order; not on the women\'s pages');

  step('Moving the player to the women\'s team leaves no stale men\'s entry');
  build = await publish(() => admin.patch(`/items/squad_memberships/${created.membership.id}`, { team: teams.womens }));
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  assertListedOn('womens');
  assert.ok(!existsSync(path.join(DIST, `media/cms/squad/mens/web/${slug}-400.jpg`)) && !readdirSync(path.join(DIST, 'media/cms/squad/mens/web')).some((f) => f.startsWith(slug)), 'old men\'s photo files remain');
  pass('now only on the women\'s pages, photos moved with them');

  step('Optional details missing: no number, position or biography');
  build = await publish(async () => {
    await admin.patch(`/items/squad_memberships/${created.membership.id}`, { shirt_number: null, position: null, ...(extras ? { captaincy: null } : {}) });
    await admin.patch(`/items/people/${created.person.id}`, { biography: null, ...(extras ? { sponsor_name: null, sponsor_url: null } : {}) });
  });
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  profile = page(`womens/team/${slug}`);
  // Match elements, not class names: the page's inline CSS names every class.
  assert.ok(!/<dl class="profile-facts"/.test(profile), 'an empty facts list is shown');
  assert.ok(!/<p class="profile-sponsor"/.test(profile), 'an empty sponsor line is shown');
  assert.ok(!profile.includes('id="biography-title"'), 'an empty biography section is shown');
  const card = page('womens/team').match(new RegExp(`<a class="player-card" href="/womens/team/${slug}/"[^]*?</a>`))?.[0];
  assert.ok(card, 'squad card not found');
  assert.ok(!card.includes('class="player-number"'), 'an empty squad number is shown');
  assert.match(card, /<small[^>]*>Women&#39;s First Team<\/small>/, 'without a position the card should name the team');
  assert.match(profile, /Position, squad number, biography and statistics will be added once confirmed by the club/);
  pass('nothing invented, nothing empty shown');

  step('A failed build keeps the last good website and notifies the member of staff');
  // An exclusive lock on one page stops both ways of replacing dist/ (rename, then copy),
  // so the build must fail and roll back everything it had already copied.
  const locked = path.join(DIST, 'womens', 'team', slug, 'index.html');
  const beforeFailure = { profile: page(`womens/team/${slug}`), squad: page('womens/team') };
  const failureStep = new Date().toISOString();
  const holder = spawn('powershell.exe', ['-NoProfile', '-Command',
    `$f = [IO.File]::Open('${path.resolve(locked)}', 'Open', 'ReadWrite', 'None'); Write-Output locked; Start-Sleep 900`], { stdio: ['ignore', 'pipe', 'inherit'] });
  children.push(holder);
  await new Promise((resolve, reject) => {
    holder.stdout.on('data', (d) => String(d).includes('locked') && resolve());
    holder.once('exit', () => reject(new Error('could not lock the test page')));
  });
  build = await publish(() => admin.patch(`/items/people/${created.person.id}`, { biography: 'Changed while the build is blocked.' }));
  holder.kill();
  await new Promise((r) => (holder.exitCode !== null ? r() : holder.once('exit', r)));
  assert.equal(build.ok, false, 'expected the blocked build to fail');
  assert.match(build.reason, /dist\/ is in use|could not be copied into dist/);
  assert.match(build.reason, /The website has not changed/);
  assert.equal(page(`womens/team/${slug}`), beforeFailure.profile, 'the profile changed although the build failed');
  assert.equal(page('womens/team'), beforeFailure.squad, 'the squad page was not rolled back');
  let notes = [];
  for (let i = 0; i < 20 && !notes.length; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    notes = await admin.get('/notifications' + q({ filter: { recipient: { _eq: me.id }, subject: { _eq: 'Website not updated' }, timestamp: { _gte: failureStep } }, fields: 'id,message' }));
  }
  assert.ok(notes.length, 'no "Website not updated" notification');
  assert.match(notes[0].message, /people/);
  assert.match(notes[0].message, /still shows the last successful version/);
  pass(`build failed safely; staff told: "${notes[0].message.slice(0, 90)}…"`);

  step('Saving again publishes and tells staff it worked');
  const retryStep = new Date().toISOString();
  build = await publish(() => admin.patch(`/items/people/${created.person.id}`, { biography: 'Published after the retry.' }));
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  assert.match(page(`womens/team/${slug}`), /Published after the retry\./);
  notes = [];
  for (let i = 0; i < 20 && !notes.length; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    notes = await admin.get('/notifications' + q({ filter: { recipient: { _eq: me.id }, subject: { _eq: 'Website updated' }, timestamp: { _gte: retryStep } }, fields: 'id' }));
  }
  assert.ok(notes.length, 'no "Website updated" notification after the retry');
  pass('change live; "Website updated" notification sent');

  step('Inactive and Removed allocations are hidden; Active shows again');
  for (const [label, status] of [['Inactive', 'draft'], ['Removed from team', 'archived']]) {
    build = await publish(() => admin.patch(`/items/squad_memberships/${created.membership.id}`, { status }));
    assert.equal(build.ok, true, `build failed: ${build.reason}`);
    assert.deepEqual(mentions(), [], `${label} player still shown`);
    pass(`${label}: not shown, no stale profile page`);
  }
  build = await publish(() => admin.patch(`/items/squad_memberships/${created.membership.id}`, { status: 'published' }));
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  assertListedOn('womens');
  pass("Active again: back on the women's squad");

  step('A player who has left disappears');
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  build = await publish(() => admin.patch(`/items/squad_memberships/${created.membership.id}`, { left_on: yesterday }));
  assert.equal(build.ok, true, `build failed: ${build.reason}`);
  assert.deepEqual(mentions(), []);
  pass('no longer listed once their leaving date has passed');
} finally {
  step('Cleaning up');
  const since = Date.now();
  if (created.membership) await admin.del(`/items/squad_memberships/${created.membership.id}`).catch((e) => console.error(`  membership: ${e.message}`));
  if (created.person) await admin.del(`/items/people/${created.person.id}`).catch((e) => console.error(`  person: ${e.message}`));
  if (created.file) await admin.del(`/files/${created.file.id}`).catch((e) => console.error(`  file: ${e.message}`));
  const notes = await admin.get('/notifications' + q({ filter: { recipient: { _eq: me.id }, subject: { _in: ['Website not updated', 'Website updated'] }, timestamp: { _gte: new Date(startedAt).toISOString() } }, fields: 'id' }));
  if (notes.length) await admin.del('/notifications', notes.map((n) => n.id)).catch((e) => console.error(`  notifications: ${e.message}`));
  if (created.membership || created.person) {
    const build = await buildAfter(since).catch((e) => ({ ok: false, reason: e.message }));
    assert.equal(build.ok, true, `clean-up build failed: ${build.reason}`);
    assert.deepEqual(mentions(), [], 'test player still on the website after clean-up');
    const leftovers = ['public/media/cms', path.join(DIST, 'media/cms'), '.cache/cms-media'].flatMap((dir) => existsSync(dir) ? allFiles(dir) : []).filter((f) => f.includes(slug) || (created.file && f.includes(created.file.id)));
    assert.deepEqual(leftovers, [], 'test photo files left behind');
    pass('test person, membership, photo, notifications and generated files removed');
  }
  for (const child of children) child.kill();
}
console.log('\nPlayer publishing: all checks passed.');

function allFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f);
    return statSync(full).isDirectory() ? allFiles(full) : [full];
  });
}
