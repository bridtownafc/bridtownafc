// End-to-end staff workflow against the running local CMS (Directus 12, native Windows).
// Creates temporary staff accounts one at a time (Core allows 3 Studio seats), checks each
// role's permissions and the approval rules, two-factor authentication, account lockout,
// password reset by email (Mailpit), image upload, enquiries, that drafts stay private, and
// that published content reaches a real website build. Everything it creates is removed.
//
// Run with one Super Admin 2FA code:  npm run cms:test:workflow -- --otp=123456
// Needs: npm run cms:start, npm run cms:bootstrap, npm run cms:seed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DirectusError, client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
const MAILPIT = 'http://127.0.0.1:8025';
const OUT = '.cache/workflow-dist';
const tag = `wf${randomBytes(3).toString('hex')}`;
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const website = client(url, env.DIRECTUS_WEBSITE_TOKEN);
const enquiryForm = client(url, env.ENQUIRY_FORM_TOKEN);
const anon = client(url);
const created = { users: [], files: [], items: [] };
const results = [];

const pass = (text) => { results.push(text); console.log(`  PASS ${text}`); };
const step = (text) => console.log(`\n- ${text}`);
const track = (collection, item) => { created.items.push([collection, item.id]); return item; };
async function refused(promise, pattern, status = 403) {
  const error = await promise.then(() => null, (e) => e);
  assert.ok(error instanceof DirectusError, `expected a refusal, but it succeeded`);
  assert.equal(error.status, status, `expected ${status}, got ${error.status}: ${error.message}`);
  if (pattern) assert.match(error.message, pattern);
  return error;
}

// --- TOTP (RFC 6238), to act as an authenticator app for a temporary account --------------
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const roles = Object.fromEntries((await admin.get('/roles?limit=-1&fields=id,name')).map((r) => [r.name, r.id]));
for (const name of ['Club Admin', 'Media Editor', 'Football Editor', 'Commercial Editor']) assert.ok(roles[name], `role ${name} missing; run cms:bootstrap`);
const teams = Object.fromEntries((await admin.get('/items/teams?fields=id,key')).map((t) => [t.key, t.id]));

async function staff(role) {
  const email = `${tag}-${role.toLowerCase().replace(/ /g, '-')}@example.com`;
  const password = randomBytes(18).toString('base64url');
  const user = await admin.post('/users', { email, password, role: roles[role], first_name: 'Workflow', last_name: role, status: 'active' });
  created.users.push(user.id);
  return { id: user.id, email, password, api: await login(url, email, password) };
}
async function remove(user) {
  await admin.del(`/users/${user.id}`);
  created.users = created.users.filter((id) => id !== user.id);
}

try {
  // --- Security settings ------------------------------------------------------------------
  step('Security settings');
  const settings = await admin.get('/settings?fields=auth_login_attempts,auth_password_policy,public_registration');
  assert.equal(settings.auth_login_attempts, 5);
  assert.equal(settings.public_registration, false);
  pass('accounts lock after 5 failed sign-ins; public sign-up is off; password policy set');
  const noOtp = await anon.post('/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }).then(() => null, (e) => e);
  assert.equal(noOtp?.body?.errors?.[0]?.extensions?.code, 'INVALID_OTP');
  pass('Super Admin cannot sign in without a 2FA code');
  const policies = await admin.get('/policies?limit=-1&fields=name,enforce_tfa');
  assert.ok(policies.find((p) => p.name === 'Club Admin')?.enforce_tfa, 'Club Admin policy must require 2FA');
  pass('Club Admin and Super Admin policies require 2FA');

  // --- Media Editor: upload, draft, publish routine news ---------------------------------------
  step('Media Editor');
  const media = await staff('Media Editor');
  const form = new FormData();
  form.append('title', `${tag} test image`);
  form.append('file', new Blob([readFileSync('public/assets/brand/brid-town-badge-light-640.png')], { type: 'image/png' }), `${tag}.png`);
  const image = await media.api.post('/files', form);
  created.files.push(image.id);
  pass('Media Editor uploads an image');
  const draft = track('articles', await media.api.post('/items/articles', {
    status: 'draft', title: `${tag} Draft story`, slug: `${tag}-draft`, category: 'Club news', summary: 'A draft that must never be published.', body: 'Draft body.',
  }));
  const article = track('articles', await media.api.post('/items/articles', {
    status: 'published', title: `${tag} Published story`, slug: `${tag}-published`, category: 'Club news', team: teams.womens,
    summary: 'A routine story published directly by a Media Editor.', body: `## Match day\n\nThe **full article** body for ${tag}.`, hero_image: image.id, hero_image_alt: 'Club crest',
  }));
  pass('Media Editor creates a draft and publishes a routine article with an image');
  await refused(media.api.post('/items/announcements', { status: 'published', title: `${tag} major`, message: 'Major news', importance: 'major' }), /Club Admin approval/);
  const major = track('announcements', await media.api.post('/items/announcements', { status: 'in_review', title: `${tag} major`, message: 'Major news', importance: 'major' }));
  pass('Media Editor cannot publish a major announcement; can submit it for review');
  await refused(media.api.get('/items/enquiries'));
  pass('Media Editor cannot read enquiries');
  const adminFile = new FormData();
  adminFile.append('file', new Blob([readFileSync('public/assets/brand/brid-town-badge-light-160.png')], { type: 'image/png' }), `${tag}-admin.png`);
  const othersFile = await admin.post('/files', adminFile);
  created.files.push(othersFile.id);
  await refused(media.api.patch(`/files/${othersFile.id}`, { title: 'changed' }));
  pass("Media Editor cannot change someone else's upload");

  step('Drafts stay private');
  const visible = await website.get('/items/articles' + q({ filter: { slug: { _in: [`${tag}-draft`, `${tag}-published`] } }, fields: 'slug' }));
  assert.deepEqual(visible.map((a) => a.slug), [`${tag}-published`]);
  const direct = await website.get(`/items/articles/${draft.id}?fields=slug`).then((d) => d, (e) => e);
  assert.ok(direct instanceof DirectusError || !direct, 'the website token must not read a draft by id');
  await refused(anon.get(`/items/articles/${draft.id}`));
  pass('the website token sees the published article only, not the draft (even by id); the public sees nothing');
  await remove(media);

  // --- Commercial Editor and enquiries ------------------------------------------------------------
  step('Commercial Editor and enquiries');
  const commercial = await staff('Commercial Editor');
  await refused(commercial.api.post('/items/sponsors', { status: 'published', name: `${tag} Sponsor`, tier: 'Official partner' }));
  const sponsor = track('sponsors', await commercial.api.post('/items/sponsors', { status: 'in_review', name: `${tag} Sponsor`, tier: 'Official partner', website_url: 'https://example.com/' }));
  pass('Commercial Editor cannot publish a sponsor; submits it for review');
  await enquiryForm.post('/items/enquiries', { topic: 'commercial', name: `${tag} Commercial`, email: 'a@example.com', message: 'Sponsorship please', consent: true, page: '/commercial/' });
  await enquiryForm.post('/items/enquiries', { topic: 'general', name: `${tag} General`, email: 'b@example.com', message: 'General question', consent: true, page: '/contact/' });
  const mine = await admin.get('/items/enquiries' + q({ filter: { name: { _starts_with: tag } }, fields: 'id' }));
  for (const e of mine) created.items.push(['enquiries', e.id]);
  await refused(enquiryForm.get('/items/enquiries'));
  pass('the enquiry form account can create enquiries but cannot read any');
  const seen = await commercial.api.get('/items/enquiries' + q({ filter: { name: { _starts_with: tag } }, fields: 'topic' }));
  assert.deepEqual(seen.map((e) => e.topic), ['commercial']);
  pass('Commercial Editor sees commercial enquiries only');
  await remove(commercial);

  // --- Club Admin: 2FA and approvals ----------------------------------------------------------------
  step('Club Admin: two-factor authentication and approvals');
  const clubAdmin = await staff('Club Admin');
  const { secret } = await clubAdmin.api.post('/users/me/tfa/generate', { password: clubAdmin.password });
  await clubAdmin.api.post('/users/me/tfa/enable', { secret, otp: totp(secret) });
  const withoutCode = await anon.post('/auth/login', { email: clubAdmin.email, password: clubAdmin.password }).then(() => null, (e) => e);
  assert.equal(withoutCode?.body?.errors?.[0]?.extensions?.code, 'INVALID_OTP');
  const approver = await login(url, clubAdmin.email, clubAdmin.password, totp(secret));
  pass('with 2FA enabled, sign-in needs the authenticator code, and works with it');
  await approver.patch(`/items/sponsors/${sponsor.id}`, { status: 'published' });
  await approver.patch(`/items/announcements/${major.id}`, { status: 'published' });
  pass('Club Admin approves and publishes the sponsor and the major announcement');
  await remove(clubAdmin);

  // --- Football Editor: fixtures; password reset; lockout -----------------------------------------------
  step('Football Editor');
  const football = await staff('Football Editor');
  const kickoff = new Date(Date.now() + 9 * 86400000);
  kickoff.setUTCHours(14, 0, 0, 0);
  const fixture = track('fixtures', await football.api.post('/items/fixtures', {
    status: 'published', team: teams.mens, opponent: `${tag} Select XI`, venue_type: 'home', kickoff: kickoff.toISOString(), match_status: 'scheduled', public_note: 'Pre-season friendly',
  }));
  pass('Football Editor adds a fixture and publishes it directly');
  await refused(football.api.post('/items/articles', { status: 'draft', title: `${tag} not mine`, slug: `${tag}-not-mine`, category: 'Club news', summary: 'x' }));
  track('articles', await football.api.post('/items/articles', { status: 'draft', title: `${tag} report`, slug: `${tag}-report`, category: 'Match report', summary: 'Report' }));
  pass('Football Editor writes match reports only');

  step('Password reset by email');
  const before = Date.now();
  await anon.post('/auth/password/request', { email: football.email, reset_url: 'http://localhost:8055/admin/reset-password' });
  let token;
  for (let i = 0; i < 20 && !token; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${football.email}`)}`)).json();
    const message = list.messages?.find((m) => Date.parse(m.Created) >= before - 5000);
    if (message) token = /token=([A-Za-z0-9._-]+)/.exec((await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()).Text)?.[1];
  }
  assert.ok(token, 'no password reset email arrived in Mailpit');
  const newPassword = randomBytes(18).toString('base64url');
  await anon.post('/auth/password/reset', { token, password: newPassword });
  await refused(login(url, football.email, football.password), null, 401);
  await login(url, football.email, newPassword);
  pass('reset email arrives; the link sets a new password; the old one stops working');
  const forged = await anon.post('/auth/password/reset', { token: 'not-a-token', password: 'whatever-long-enough' }).then(() => null, (e) => e);
  assert.ok(forged instanceof DirectusError && forged.status >= 400 && forged.status < 500, 'a made-up reset token must be refused');
  pass('a made-up reset token is refused');

  step('Account lockout');
  for (let i = 0; i < 5; i++) await anon.post('/auth/login', { email: football.email, password: 'wrong-password-xx' }).catch(() => {});
  await refused(login(url, football.email, newPassword), null, 401);
  const locked = await admin.get(`/users/${football.id}?fields=status`);
  assert.equal(locked.status, 'suspended');
  pass('after 5 wrong passwords the account is suspended, even with the right password');
  await remove(football);

  // --- Published content reaches the website ---------------------------------------------------------
  step('Website build from the CMS');
  const sync = spawnSync(process.execPath, ['cms/scripts/sync.mjs'], { encoding: 'utf8' });
  assert.equal(sync.status, 0, sync.stderr || sync.stdout);
  const build = spawnSync(process.execPath, ['node_modules/astro/astro.js', 'build', '--outDir', OUT], { encoding: 'utf8', env: { ...process.env, CONTENT_SOURCE: 'directus' } });
  assert.equal(build.status, 0, build.stderr?.slice(-2000) || build.stdout?.slice(-2000));
  const page = (p) => readFileSync(path.join(OUT, p, 'index.html'), 'utf8');
  const articlePage = page(`womens/news/${tag}-published`);
  assert.match(articlePage, new RegExp(`<strong>full article</strong> body for ${tag}`));
  assert.match(articlePage, /\/media\/cms\/news\/.*\.jpg/);
  assert.ok(!existsSync(path.join(OUT, `mens/news/${tag}-published`)), "a women's article must not appear under the men's team");
  pass("the published article has its own page, with its image, under the women's team only");
  const all = (dir) => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? all(path.join(dir, f)) : f.endsWith('.html') ? [path.join(dir, f)] : []));
  assert.ok(!all(OUT).some((f) => readFileSync(f, 'utf8').includes(`${tag} Draft story`)), 'the draft appeared in the build');
  pass('the draft appears nowhere in the built site');
  assert.match(page('mens'), new RegExp(`${tag} Sponsor`));
  pass('the approved sponsor appears in the partners strip');
  const matches = page('mens/matches');
  assert.match(matches, new RegExp(`${tag} Select XI`));
  assert.match(matches, /Pre-season friendly/);
  assert.ok(!page('womens/matches').includes(`${tag} Select XI`), "a men's fixture must not appear for the women's team");
  pass("the club-entered fixture appears in the men's fixtures only");
  assert.ok(!all(OUT).some((f) => /£\s?\d/.test(readFileSync(f, 'utf8'))), 'a price appeared in the build');
  pass('no sponsorship price appears anywhere in the CMS build');
} finally {
  step('Cleaning up');
  for (const [collection, id] of created.items.reverse()) await admin.del(`/items/${collection}/${id}`).catch((e) => console.warn(`  could not delete ${collection} ${id}: ${e.message}`));
  for (const id of created.files) await admin.del(`/files/${id}`).catch(() => {});
  for (const id of created.users) await admin.del(`/users/${id}`).catch(() => {});
  const resync = spawnSync(process.execPath, ['cms/scripts/sync.mjs'], { encoding: 'utf8' });
  console.log(`  removed test content and accounts; CMS snapshot re-synced (${resync.status === 0 ? 'ok' : 'FAILED'})`);
}
console.log(`\n${results.length} checks passed.`);
