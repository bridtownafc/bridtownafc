// Screenshots of the staff admin for the Word guide (docs/Brid_Town_Website_Admin_Guide.docx),
// taken as real staff: temporary Football Editor and Commercial Editor accounts with one-off
// random passwords (never printed), signed in through headless Chrome with a throwaway profile.
// One clearly labelled example enquiry is created for the inbox shots. Accounts, the example
// enquiry and the browser profile are removed at the end. No secrets appear in the images.
//
// Run with one Super Admin 2FA code:
//   SHOTS_DIR=<folder> npm run cms:admin -- --otp=123456 guide-shots
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DirectusError, loadEnv, login, q } from './lib/directus.mjs';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(process.env.SHOTS_DIR ?? path.join(tmpdir(), 'bridtown-guide-shots'));
const PROFILE = path.join(tmpdir(), `bridtown-guide-chrome-${randomBytes(3).toString('hex')}`);
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { url, env } = loadEnv();
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const tag = `gs${randomBytes(3).toString('hex')}`;
const created = { users: [], enquiries: [] };
mkdirSync(OUT, { recursive: true });

async function staff(roleName) {
  const [role] = await admin.get('/roles' + q({ filter: { name: { _eq: roleName } }, fields: 'id' }));
  const email = `${tag}-${roleName.split(' ')[0].toLowerCase()}@example.com`;
  const password = randomBytes(24).toString('base64url');
  const user = await admin.post('/users', { first_name: 'Sam', last_name: roleName.split(' ')[0], email, password, role: role.id, status: 'active' });
  created.users.push(user.id);
  return { email, password };
}

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--lang=en-GB', 'about:blank'], { stdio: 'ignore' });
let ws;
let failure = null;
try {
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = id++;
    waiting.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // Directus Core shows a licence dialog to administrators; Skip only closes it.
  const skipDialogs = () => evaluate(`(() => { const d = [...document.querySelectorAll('.v-dialog, .v-card, [role=dialog]')].find((e) => /license key/i.test(e.textContent) && e.offsetParent); const b = d && [...d.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Skip'); if (b) { b.click(); return true; } return false; })()`);
  const go = async (route, wait = 5000) => { await send('Page.navigate', { url: `${url}${route}` }); await sleep(wait); for (let i = 0; i < 2 && (await skipDialogs()); i++) await sleep(700); };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`  ${name}.png`);
  };
  const scrollMain = (y) => evaluate(`(() => { const s = [...document.querySelectorAll('main, #main-content, .content, *')].find((e) => e.scrollHeight > e.clientHeight + 200 && getComputedStyle(e).overflowY !== 'visible' && e.clientWidth > 600); (s || document.scrollingElement).scrollTo(0, ${y}); return true; })()`);
  const clickAdd = (label) => evaluate(`(() => { const field = [...document.querySelectorAll('.field')].find((e) => (e.querySelector('.field-label, .label, .field-name')?.textContent ?? '').trim() === ${JSON.stringify(label)}); const b = field && [...field.querySelectorAll('button')].find((e) => e.querySelector('[data-icon="add"]') || /create new/i.test((e.getAttribute('aria-label') ?? '') + (e.title ?? ''))); if (b) { b.click(); return true; } return false; })()`);
  async function signIn({ email, password }) {
    await send('Network.clearBrowserCookies');
    const response = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, mode: 'session' }) });
    if (!response.ok) throw new Error(`Sign-in for the temporary account failed (${response.status})`);
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith('directus_session_token=')).split(';')[0].split('=').slice(1).join('=');
    await send('Network.setCookie', { name: 'directus_session_token', value: cookie, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' });
    return cookie;
  }
  const signOut = (cookie) => fetch(`${url}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `directus_session_token=${cookie}` }, body: JSON.stringify({ mode: 'session' }) }).catch(() => {});

  console.log('Sign-in page');
  await send('Network.clearBrowserCookies');
  await go('/admin/login', 4000);
  await shot('01-login');

  const teams = Object.fromEntries((await admin.get('/items/teams?fields=id,key')).map((t) => [t.key, t.id]));
  const [person] = await admin.get('/items/people' + q({ filter: { status: { _eq: 'published' } }, sort: 'display_name', limit: 1, fields: 'id' }));
  const [allocation] = await admin.get('/items/squad_memberships' + q({ filter: { person: { _eq: person.id } }, limit: 1, fields: 'id' }));
  const [article] = await admin.get('/items/articles' + q({ sort: 'id', limit: 1, fields: 'id' }));

  console.log('As a Football Editor');
  let cookie = await signIn(await staff('Football Editor'));
  await go('/admin/content/teams');
  await shot('02-navigation');
  await go(`/admin/content/teams/${teams.mens}`);
  await shot('03-team-squad');
  if (await clickAdd('Squad')) { await sleep(2500); await shot('04-team-add-player'); }
  await go('/admin/content/people');
  await shot('05-players-list');
  await go(`/admin/content/people/${person.id}`);
  await shot('06-player-profile-top');
  await scrollMain(760); await sleep(1200);
  await shot('07-player-profile-teams');
  await go('/admin/content/people/+');
  await shot('08-new-player');
  await go(`/admin/content/squad_memberships/${allocation.id}`);
  await shot('09-team-allocation');
  await go('/admin/content/squad_memberships');
  await shot('10-allocations-list');
  await go('/admin/content/fixtures/+');
  await shot('11-match-correction');
  await go(`/admin/content/articles/${article.id}`);
  await shot('12-article-form');
  await go('/admin/files');
  await shot('13-file-library');
  await signOut(cookie);

  console.log('As a Commercial Editor');
  const example = await admin.post('/items/enquiries', { topic: 'commercial', name: 'Example Enquirer', organisation: 'Example Business Ltd', email: `${tag}@example.com`, message: 'Example message for the staff guide: we would like to hear about pitchside advertising.', consent: true, page: '/commercial/' });
  created.enquiries.push(example.id);
  cookie = await signIn(await staff('Commercial Editor'));
  await go('/admin/content/enquiries');
  await shot('14-enquiries-inbox');
  await go(`/admin/content/enquiries/${example.id}`);
  await shot('15-enquiry');
  await go('/admin/content/sponsors/+');
  await shot('16-sponsor-form');
  await signOut(cookie);
} catch (error) {
  failure = error;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await sleep(1500);
  rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  if (created.enquiries.length) await admin.del('/items/enquiries', created.enquiries);
  for (const userId of created.users) {
    await admin.patch(`/users/${userId}`, { status: 'suspended' });
    try { await admin.del(`/users/${userId}`); } catch (error) { if (!(error instanceof DirectusError)) throw error; }
  }
  console.log(`Temporary accounts, example enquiry and browser profile removed. Images in ${OUT}`);
}
if (failure) {
  console.error(`FAILED: ${failure.message}`);
  process.exit(1);
}
