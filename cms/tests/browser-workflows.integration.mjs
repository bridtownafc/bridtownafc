// Real staff workflows through the Directus interface in headless Chrome, checked on the
// running local preview website (npm run preview, http://127.0.0.1:4321) after each automatic
// rebuild. Temporary Media Editor and Football Editor accounts (one-off random passwords, never
// printed) do the work; everything they create is clearly labelled "Test …" and removed at the
// end, followed by a clean rebuild. A screenshot of every step is kept in SHOTS_DIR.
//
//   1. News: create and publish an article; edit it; unpublish it. Listing + article page.
//   2. Women's squad photos are served on cards and profiles.
//   3. Player: add from the squad list without a photo (placeholder on card and profile),
//      upload a photo in the player form, then replace it. Both views follow.
//   4. Drafts stay hidden.
//
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 browser
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { DirectusError, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
const SITE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4321';
const LISTENER = `http://127.0.0.1:${env.REBUILD_LISTEN_PORT || 4400}`;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(process.env.SHOTS_DIR ?? path.join(tmpdir(), 'bridtown-browser-workflows'));
const PROFILE = path.join(tmpdir(), `bridtown-browser-${randomBytes(3).toString('hex')}`);
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const tag = randomBytes(3).toString('hex').toUpperCase();
const created = { users: [], articles: [], people: [], allocations: [], files: [] };
let checks = 0;
const pass = (text) => { checks += 1; console.log(`  PASS ${text}`); };
const step = (text) => console.log(`\n- ${text}`);

// ---- website checks ------------------------------------------------------------------------------
const page = async (route) => { const r = await fetch(SITE + route, { cache: 'no-store' }); return r.ok ? r.text() : null; };
async function lastBuild() { return (await (await fetch(`${LISTENER}/status`)).json()).lastBuild; }
/** Waits for a website build that started after `since` to finish. Returns it. */
async function buildAfter(since, timeoutMs = 8 * 60_000) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(3000)) {
    const status = await (await fetch(`${LISTENER}/status`)).json();
    const b = status.lastBuild;
    if (b?.finishedAt && Date.parse(b.startedAt) >= since && !status.building && !status.scheduled) return b;
  }
  throw new Error('no website build finished in time');
}
async function notified(userId, subject, since) {
  for (let i = 0; i < 20; i++) {
    const rows = await admin.get('/notifications' + q({ filter: { _and: [{ recipient: { _eq: userId } }, { subject: { _eq: subject } }, { timestamp: { _gte: new Date(since).toISOString() } }] }, fields: 'id,message' }));
    if (rows.length) return rows[0];
    await sleep(1500);
  }
  return null;
}
const imgFor = (html, name) => {
  const card = html.split(/<li|<article/).find((part) => part.includes(name));
  return card?.match(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/) ?? card?.match(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"/);
};
const sha = (buf) => createHash('sha1').update(buf).digest('hex');

// ---- browser -------------------------------------------------------------------------------------
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--lang=en-GB', 'about:blank'], { stdio: 'ignore' });
let ws;
let send;
let evaluate;
async function startBrowser() {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 1;
  const waiting = new Map();
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = id++;
    waiting.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page script: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  };
  await send('Page.enable');
  await send('DOM.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}
let shotNo = 0;
const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(OUT, `${String(++shotNo).padStart(2, '0')}-${name}.png`), Buffer.from(data, 'base64')); };
const go = async (route, wait = 4500) => { await send('Page.navigate', { url: `${url}${route}` }); await sleep(wait); };

// Page helpers run inside the admin. The "scope" is the topmost open drawer, else the page.
const HELPERS = `
  window.__scope = () => { const d = [...document.querySelectorAll('.v-drawer, .drawer-content, [role=dialog]')].filter((e) => e.offsetParent); return d.length ? d[d.length - 1] : document; };
  window.__field = (label) => [...__scope().querySelectorAll('.field')].find((f) => { const l = f.querySelector('.field-label, .field-name, .label'); return l && l.textContent.replace(/[*\\s]+$/,'').trim() === label; });
  window.__setText = (label, value) => {
    const f = __field(label); if (!f) return 'no field ' + label;
    const el = f.querySelector('textarea, input:not([type=checkbox]):not([type=file]), [contenteditable=true]'); if (!el) return 'no input in ' + label;
    el.focus();
    if (el.isContentEditable) { el.textContent = value; el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
    else { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    el.blur(); return 'ok';
  };
  // Clicks inside the field's input area (never its label menu), trying each selector in turn.
  window.__clickIn = (label, selector) => { const f = __field(label); if (!f) return false; const root = f.querySelector('.interface') || f; for (const sel of selector.split(/,\s*/)) { const el = [...root.querySelectorAll(sel)].find((e) => e.offsetParent || e.getClientRects().length); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } } return false; };
  window.__menuPick = (text) => { const item = [...document.querySelectorAll('.v-menu-content .v-list-item, .v-list-item')].filter((e) => e.offsetParent).find((e) => e.textContent.trim().startsWith(text)); if (!item) return false; item.click(); return true; };
  window.__headerSave = () => { const s = __scope(); const root = s === document ? document.querySelector('header, .header-bar') : s; const b = [...root.querySelectorAll('button')].filter((e) => e.offsetParent && !e.disabled).find((e) => /^(save|publish)$/i.test(e.textContent.trim()) || e.querySelector('[data-icon="check"]')); if (!b) return false; b.click(); return true; };
`;
async function helpers() { await evaluate(`(() => { ${HELPERS}; return true; })()`); }
/** On failure: saves the field's HTML and any open drawer's, for diagnosis. */
async function dumpField(label) {
  await helpers();
  const html = await evaluate(`(() => { const f = __field(${JSON.stringify(label)}); const d = [...document.querySelectorAll('.v-drawer, .v-menu-content, [role=dialog]')].filter((e) => e.offsetParent).map((e) => e.outerHTML.slice(0, 20000)); return (f ? f.outerHTML : 'NO FIELD') + ' === open drawers/menus === ' + d.join(' --- '); })()`);
  writeFileSync(path.join(OUT, `dump-${label.replace(/[^A-Za-z]+/g, '-')}.html`), html ?? '');
  await shot(`dump-${label.replace(/[^A-Za-z]+/g, '-')}`);
}
async function setText(label, value) { await helpers(); const r = await evaluate(`__setText(${JSON.stringify(label)}, ${JSON.stringify(value)})`); assert.equal(r, 'ok', r); await sleep(300); }
async function choose(label, option) {
  await helpers();
  if (!(await evaluate(`__clickIn(${JSON.stringify(label)}, '.v-input, input, .v-select, button')`))) { await dumpField(label); assert.fail(`no dropdown ${label}`); }
  await sleep(700);
  if (!(await evaluate(`__menuPick(${JSON.stringify(option)})`))) { await dumpField(label); assert.fail(`no option "${option}" in ${label}`); }
  await sleep(500);
}
/** A many-to-one field (e.g. Team): opens its picker and chooses the row containing `text`. */
async function chooseRelated(label, text) {
  await helpers();
  assert.ok(await evaluate(`__clickIn(${JSON.stringify(label)}, '.v-input, input, .preview, button')`), `no picker for ${label}`);
  await sleep(2000);
  const picked = await evaluate(`(() => { const s = __scope(); const row = [...s.querySelectorAll('tr, .table-row, .v-list-item, .row')].filter((e) => e.offsetParent).find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!row) return false; row.click(); return true; })()`);
  if (!picked) { await dumpField(label); assert.fail(`no "${text}" to choose for ${label}`); }
  await sleep(1200);
  await helpers();
  // Some pickers close on selection; others need confirming with the drawer's tick.
  if (await evaluate(`__scope() !== document && [...__scope().querySelectorAll('tr, .table-row')].some((e) => e.textContent.includes(${JSON.stringify(text)}))`)) await saveForm();
}
async function saveForm() { await helpers(); assert.ok(await evaluate('__headerSave()'), 'no Save button'); await sleep(3500); }
async function errorText() { return evaluate(`(() => [...document.querySelectorAll('.v-notice.danger, .validation-errors, .notification.error, .v-notification.error, .notification-item.danger, .validation-error')].map((e) => e.textContent.trim()).join(' | '))()`); }
async function upload(label, file) {
  await helpers();
  const { root } = await send('DOM.getDocument', { depth: -1, pierce: true });
  const marker = `upload-${randomBytes(3).toString('hex')}`;
  assert.ok(await evaluate(`(() => { const f = __field(${JSON.stringify(label)}); const i = f && f.querySelector('input[type=file]'); if (!i) return false; i.setAttribute('data-test', '${marker}'); return true; })()`), `no upload input in ${label}`);
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-test="${marker}"]` });
  await send('DOM.setFileInputFiles', { nodeId, files: [file] });
  await sleep(4000);
}
async function signIn(email, password) {
  await send('Network.clearBrowserCookies');
  const r = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, mode: 'session' }) });
  assert.ok(r.ok, `temporary account sign-in failed (${r.status})`);
  const cookie = r.headers.getSetCookie().find((c) => c.startsWith('directus_session_token=')).split(';')[0].split('=').slice(1).join('=');
  await send('Network.setCookie', { name: 'directus_session_token', value: cookie, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' });
}
async function staff(roleName) {
  const [role] = await admin.get('/roles' + q({ filter: { name: { _eq: roleName } }, fields: 'id' }));
  const email = `test-${tag.toLowerCase()}-${roleName.split(' ')[0].toLowerCase()}@example.com`;
  const password = randomBytes(24).toString('base64url');
  const user = await admin.post('/users', { first_name: 'Test', last_name: `${roleName} ${tag}`, email, password, role: role.id, status: 'active' });
  created.users.push(user.id);
  await signIn(email, password);
  return user.id;
}

let failure = null;
try {
  await startBrowser();
  assert.ok(await page('/'), `the preview website is not running at ${SITE} (npm run preview)`);
  const teams = Object.fromEntries((await admin.get('/items/teams?fields=id,key,name')).map((t) => [t.key, t]));

  // ---- 1. News: one men's and one women's article ------------------------------------------------
  step("News, as a Media Editor, through the article form: a men's and a women's article");
  const media = await staff('Media Editor');
  const articles = {};
  for (const [team, other] of [['mens', 'womens'], ['womens', 'mens']]) {
    const headline = `Test ${team === 'mens' ? "men's" : "women's"} article ${tag}`;
    const since = Date.now();
    await go('/admin/content/articles/+');
    await setText('Headline', headline);
    await setText('Summary', `Temporary test summary ${tag}.`);
    await setText('Full article', `Temporary test article ${tag} for the ${teams[team].name}. It is removed automatically.`);
    await chooseRelated('Team', teams[team].name);
    await choose('Website status', 'Published');
    await shot(`news-form-${team}`);
    await saveForm();
    const [article] = await admin.get('/items/articles' + q({ filter: { title: { _eq: headline } }, fields: 'id,slug,status,team' }));
    assert.ok(article, `the ${team} article was not saved: ${await errorText()}`);
    created.articles.push(article.id);
    assert.equal(article.team, teams[team].id, `the ${team} article was not assigned to ${teams[team].name}`);
    const build = await buildAfter(since);
    assert.equal(build.ok, true, `website build failed: ${build.reason}`);
    assert.ok(await notified(media, 'Website updated', since), 'no "Website updated" notification');
    assert.ok((await page(`/${team}/news/`))?.includes(headline), `not in the ${team} news listing`);
    assert.ok((await page(`/${team}/news/${article.slug}/`))?.includes(`Temporary test article ${tag}`), `${team} article page missing`);
    assert.ok((await page(`/${team}/`))?.includes(headline), `not in the ${team} homepage news section`);
    assert.ok(!(await page(`/${other}/news/`))?.includes(headline), `also listed for ${other}`);
    assert.equal(await page(`/${other}/news/${article.slug}/`), null, `article page also built for ${other}`);
    articles[team] = { ...article, headline };
    pass(`${teams[team].name} article (${article.slug}): published through the form, then automatically in the ${team} news listing, homepage news section and article page only; "Website updated" sent`);
  }

  let since = Date.now();
  await go(`/admin/content/articles/${articles.mens.id}`);
  await setText('Headline', `${articles.mens.headline} (edited)`);
  await saveForm();
  let build = await buildAfter(since);
  assert.equal(build.ok, true, `website build failed: ${build.reason}`);
  assert.ok((await page(`/mens/news/${articles.mens.slug}/`))?.includes(`${articles.mens.headline} (edited)`), 'edit did not reach the article page');
  pass("edited headline reached the men's article page");

  for (const team of ['mens', 'womens']) {
    since = Date.now();
    await go(`/admin/content/articles/${articles[team].id}`);
    await choose('Website status', 'Draft');
    await saveForm();
    build = await buildAfter(since);
    assert.equal(build.ok, true, `website build failed: ${build.reason}`);
    assert.equal(await page(`/${team}/news/${articles[team].slug}/`), null, `unpublished ${team} article page still served`);
    assert.ok(!(await page(`/${team}/news/`))?.includes(articles[team].headline), `unpublished ${team} article still listed`);
  }
  pass('both set back to Draft: removed from the listings and their pages are gone');

  const future = await admin.post('/items/articles', { status: 'published', team: teams.mens.id, title: `Test future article ${tag}`, summary: 'Temporary.', body: 'Temporary future-dated test.', published_at: new Date(Date.now() + 7 * 864e5).toISOString() });
  created.articles.push(future.id);
  since = Date.now();
  build = await buildAfter(since);
  assert.ok(!(await page('/mens/news/'))?.includes(`Test future article ${tag}`), 'a future-dated article is visible');
  pass('a published article dated next week stays hidden until its time');

  // ---- 2. Women's photos ------------------------------------------------------------------------
  step("Women's squad photos on the preview website");
  const womensPage = await page('/womens/team/');
  const womens = await admin.get('/items/squad_memberships' + q({ filter: { _and: [{ team: { key: { _eq: 'womens' } } }, { status: { _eq: 'published' } }, { person: { status: { _eq: 'published' } } }] }, fields: 'person.display_name,person.slug', limit: '-1' }));
  for (const { person } of womens) {
    const card = imgFor(womensPage, person.display_name);
    const src = card?.[1]?.startsWith('/') ? card[1] : card?.[2];
    assert.ok(src?.startsWith('/media/cms/squad/womens/'), `${person.display_name}: no photo on the squad card (${src})`);
    assert.equal((await fetch(SITE + src)).status, 200, `${person.display_name}: ${src} not served`);
    const profile = await page(`/womens/team/${person.slug}/`);
    assert.ok(profile?.includes('/media/cms/squad/womens/'), `${person.display_name}: no photo on the profile`);
  }
  pass(`all ${womens.length} women's players show their photos on squad cards and profiles, and the images are served`);

  // ---- 3. Player without a photo, then upload and replace ---------------------------------------
  step('New player, as a Football Editor, from the squad list');
  const football = await staff('Football Editor');
  const name = `Test Player ${tag}`;
  since = Date.now();
  await go(`/admin/content/teams/${teams.womens.id}`);
  await helpers();
  assert.ok(await evaluate(`__clickIn('Squad', 'button:has([data-icon="add"])')`), 'no + on the squad list');
  await sleep(2500);
  await helpers();
  assert.ok(await evaluate(`__clickIn('Player or staff member', 'button:has([data-icon="add"]), [data-icon="add"]')`), 'no + to create a new profile');
  await sleep(2500);
  await setText('Display name', name);
  await choose('Website status', 'Published');
  await shot('player-new-profile');
  await saveForm(); // the new profile drawer
  await choose('Position', 'Midfielder');
  await shot('player-allocation');
  await saveForm(); // the allocation drawer
  await saveForm(); // the team
  const [person] = await admin.get('/items/people' + q({ filter: { display_name: { _eq: name } }, fields: 'id,slug,status,photo' }));
  assert.ok(person, `the player was not saved: ${await errorText()}`);
  created.people.push(person.id);
  const [allocation] = await admin.get('/items/squad_memberships' + q({ filter: { person: { _eq: person.id } }, fields: 'id,team,status' }));
  created.allocations.push(allocation.id);
  assert.deepEqual([allocation.team, allocation.status, person.status, person.photo], [teams.womens.id, 'published', 'published', null]);
  assert.equal(person.slug, `test-player-${tag.toLowerCase()}`);
  pass(`created from the women's squad list in one go: profile Published, allocation Active, team carried, web address ${person.slug}`);
  build = await buildAfter(since);
  assert.equal(build.ok, true, `website build failed: ${build.reason}`);
  let card = imgFor(await page('/womens/team/'), name);
  assert.ok(card && /shown until a photo of/.test(card[0]), 'no placeholder squad card');
  assert.match((await page(`/womens/team/${person.slug}/`)) ?? '', /shown until a photo of/, 'no placeholder profile');
  pass('squad card and profile page created, both with the club-badge placeholder');

  const pictures = [];
  for (const colour of ['#1e6fd9', '#e0a400']) {
    const file = path.join(OUT, `test-photo-${tag}-${pictures.length + 1}.jpg`);
    writeFileSync(file, await sharp({ create: { width: 800, height: 1000, channels: 3, background: colour } }).jpeg({ quality: 90 }).toBuffer());
    pictures.push(file);
  }
  since = Date.now();
  await go(`/admin/content/people/${person.id}`);
  await upload('Profile photograph', pictures[0]);
  await shot('player-photo-uploaded');
  await saveForm();
  let saved = await admin.get(`/items/people/${person.id}?fields=photo`);
  assert.ok(saved.photo, `the photo was not saved: ${await errorText()}`);
  created.files.push(saved.photo);
  build = await buildAfter(since);
  assert.equal(build.ok, true, `website build failed: ${build.reason}`);
  card = imgFor(await page('/womens/team/'), name);
  const firstSrc = (card?.[1]?.startsWith('/') ? card[1] : card?.[2]) ?? '';
  assert.ok(firstSrc.includes(`/media/cms/squad/womens/`), `no photo on the card (${firstSrc})`);
  const firstImage = sha(Buffer.from(await (await fetch(SITE + firstSrc)).arrayBuffer()));
  assert.ok((await page(`/womens/team/${person.slug}/`))?.includes('/media/cms/squad/womens/'), 'no photo on the profile');
  pass('photo uploaded in the player form: shown on the squad card and profile');

  since = Date.now();
  await go(`/admin/content/people/${person.id}`);
  await helpers();
  assert.ok(await evaluate(`__clickIn('Profile photograph', 'button:has([data-icon="close"]), [data-icon="close"], button:has([data-icon="clear"])')`), 'no remove button on the photo');
  await sleep(1000);
  await upload('Profile photograph', pictures[1]);
  await shot('player-photo-replaced');
  await saveForm();
  saved = await admin.get(`/items/people/${person.id}?fields=photo`);
  assert.ok(saved.photo && !created.files.includes(saved.photo), 'the photo was not replaced');
  created.files.push(saved.photo);
  build = await buildAfter(since);
  assert.equal(build.ok, true, `website build failed: ${build.reason}`);
  card = imgFor(await page('/womens/team/'), name);
  const secondSrc = (card?.[1]?.startsWith('/') ? card[1] : card?.[2]) ?? '';
  const secondImage = sha(Buffer.from(await (await fetch(SITE + secondSrc)).arrayBuffer()));
  assert.notEqual(secondSrc, firstSrc, 'the replaced photo kept the same URL, so caches could keep the old one');
  assert.notEqual(secondImage, firstImage, 'the website still serves the old photo');
  assert.ok((await admin.get('/files' + q({ filter: { id: { _eq: created.files[0] } }, fields: 'id' }))).length, 'the first original was deleted');
  pass('photo replaced in the player form: the new image is served; the earlier original is kept in the library');

  // ---- 3b. Men's player with a photo uploaded while creating them, then an edit -------------------
  step("New men's player with a photo uploaded during creation, then edited");
  const menName = `Test Men Player ${tag}`;
  since = Date.now();
  await go(`/admin/content/teams/${teams.mens.id}`);
  await helpers();
  assert.ok(await evaluate(`__clickIn('Squad', 'button:has([data-icon="add"])')`), "no + on the men's squad list");
  await sleep(2500);
  await helpers();
  assert.ok(await evaluate(`__clickIn('Player or staff member', 'button:has([data-icon="add"]), [data-icon="add"]')`), 'no + to create a new profile');
  await sleep(2500);
  await setText('Display name', menName);
  await choose('Website status', 'Published');
  await upload('Profile photograph', pictures[0]);
  await shot('men-player-new-with-photo');
  await saveForm(); // profile drawer
  await choose('Position', 'Defender');
  await saveForm(); // allocation drawer
  await saveForm(); // team
  const [menPerson] = await admin.get('/items/people' + q({ filter: { display_name: { _eq: menName } }, fields: 'id,slug,status,photo' }));
  assert.ok(menPerson, `the men's player was not saved: ${await errorText()}`);
  created.people.push(menPerson.id);
  if (menPerson.photo) created.files.push(menPerson.photo);
  const [menAllocation] = await admin.get('/items/squad_memberships' + q({ filter: { person: { _eq: menPerson.id } }, fields: 'id,team' }));
  if (menAllocation) created.allocations.push(menAllocation.id);
  assert.ok(menPerson.photo, 'the photo chosen while creating the player was not saved');
  assert.equal(menAllocation?.team, teams.mens.id, 'team not carried');
  build = await buildAfter(since);
  assert.equal(build.ok, true, `website build failed: ${build.reason}`);
  card = imgFor(await page('/mens/team/'), menName);
  const menSrc = (card?.[1]?.startsWith('/') ? card[1] : card?.[2]) ?? '';
  assert.ok(menSrc.includes(`/media/cms/squad/mens/web/${menPerson.slug}-`), `no photo on the men's card (${menSrc})`);
  assert.equal((await fetch(SITE + menSrc)).status, 200);
  assert.ok((await page(`/mens/team/${menPerson.slug}/`))?.includes(`/web/${menPerson.slug}-`), "no photo on the men's profile");
  pass("men's player created from the squad list with a photo uploaded in the same step: card and profile show it");

  since = Date.now();
  await go(`/admin/content/people/${menPerson.id}`);
  await setText('Biography', `Temporary test biography ${tag}.`);
  await saveForm();
  build = await buildAfter(since);
  assert.equal(build.ok, true, `website build failed: ${build.reason}`);
  assert.ok((await page(`/mens/team/${menPerson.slug}/`))?.includes(`Temporary test biography ${tag}`), 'biography edit not on the profile');
  pass('player information edited in the form (biography) and shown on the profile');

  // ---- 4. Drafts and permissions ----------------------------------------------------------------
  step('Drafts and permissions');
  const draftName = `Test Draft Player ${tag}`;
  since = Date.now();
  await go(`/admin/content/people/+`);
  await setText('Display name', draftName);
  await saveForm();
  const [draft] = await admin.get('/items/people' + q({ filter: { display_name: { _eq: draftName } }, fields: 'id,status,slug' }));
  assert.ok(draft, 'draft not saved');
  created.people.push(draft.id);
  assert.equal(draft.status, 'draft');
  assert.ok(!(await page('/womens/team/'))?.includes(draftName) && !(await page('/mens/team/'))?.includes(draftName));
  pass('a new profile is saved as a Draft and appears nowhere on the website');
  await go('/admin/settings/data-model', 4000);
  const blocked = await evaluate(`!document.querySelector('.field-detail, .collections-overview, .data-model')`);
  assert.ok(blocked, 'a Football Editor reached the data model settings');
  await shot('editor-settings-blocked');
  pass('settings stay out of reach for a Football Editor');
} catch (error) {
  failure = error;
  try { await shot('FAILED'); } catch {}
} finally {
  step('Cleaning up');
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(1200);
  rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  const since = Date.now();
  if (created.allocations.length) await admin.del('/items/squad_memberships', created.allocations).catch((e) => console.error(`  allocations: ${e.message}`));
  for (const id of created.people) await admin.patch(`/items/people/${id}`, { photo: null }).catch(() => {});
  if (created.people.length) await admin.del('/items/people', created.people).catch((e) => console.error(`  people: ${e.message}`));
  if (created.articles.length) await admin.del('/items/articles', created.articles).catch((e) => console.error(`  articles: ${e.message}`));
  if (created.files.length) await admin.del('/files', created.files).catch((e) => console.error(`  files: ${e.message}`));
  for (const id of created.users) {
    await admin.patch(`/users/${id}`, { status: 'suspended' }).catch(() => {});
    try { await admin.del(`/users/${id}`); } catch (error) { if (!(error instanceof DirectusError)) throw error; }
  }
  const notes = await admin.get('/notifications' + q({ filter: { recipient: { _in: created.users.length ? created.users : ['00000000-0000-0000-0000-000000000000'] } }, fields: 'id', limit: '-1' })).catch(() => []);
  if (notes.length) await admin.del('/notifications', notes.map((n) => n.id)).catch(() => {});
  if (created.people.length || created.articles.length) {
    const build = await buildAfter(since).catch((e) => ({ ok: false, reason: e.message }));
    const leftovers = ['/mens/news/', '/womens/news/', '/womens/team/', '/mens/team/'];
    let found = false;
    for (const route of leftovers) if ((await page(route))?.includes(tag)) found = true;
    console.log(`  clean rebuild ${build.ok ? 'succeeded' : `FAILED: ${build.reason}`}; test content ${found ? 'STILL ON THE WEBSITE' : 'gone from the website'}`);
    if (!build.ok || found) failure ??= new Error('clean-up rebuild did not remove the test content');
  }
  console.log(`  temporary articles, players, photos, notifications and accounts removed. Screenshots: ${OUT}`);
}
if (failure) {
  console.error(`\nFAILED after ${checks} checks: ${failure.message}`);
  process.exit(1);
}
console.log(`\nAll ${checks} browser workflow checks passed.`);
