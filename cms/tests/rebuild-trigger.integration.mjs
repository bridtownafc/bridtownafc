// Checks that saving content in the CMS triggers a website rebuild, without publishing anything.
// A temporary Football Editor saves a DRAFT player profile (never shown on the website); the
// rebuild it triggers must finish successfully and the editor must get "Website updated". The
// draft must appear on no page. The draft and the account are then removed, which triggers one
// more rebuild, also checked. No articles are created and nothing is published.
//
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 rebuild-check
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DirectusError, client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
const SITE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4321';
const LISTENER = `http://127.0.0.1:${env.REBUILD_LISTEN_PORT || 4400}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const tag = randomBytes(3).toString('hex').toUpperCase();
const name = `Test Draft Player ${tag}`;
const created = { user: null, person: null };

async function buildAfter(since, timeoutMs = 6 * 60_000) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(3000)) {
    const status = await (await fetch(`${LISTENER}/status`)).json();
    const b = status.lastBuild;
    if (b?.finishedAt && Date.parse(b.startedAt) >= since && !status.building && !status.scheduled) return b;
  }
  throw new Error('no rebuild finished within 6 minutes of the save: the save did not trigger one');
}
const onSite = async (text) => {
  for (const route of ['/mens/team/', '/womens/team/']) if ((await (await fetch(SITE + route, { cache: 'no-store' })).text()).includes(text)) return true;
  return false;
};

let failure = null;
try {
  const [role] = await admin.get('/roles' + q({ filter: { name: { _eq: 'Football Editor' } }, fields: 'id' }));
  const token = randomBytes(32).toString('base64url');
  created.user = (await admin.post('/users', { first_name: 'Test', last_name: `Rebuild check ${tag}`, email: `test-rebuild-${tag.toLowerCase()}@example.com`, role: role.id, token, status: 'active' })).id;
  const editor = client(url, token);

  const since = Date.now();
  created.person = (await editor.post('/items/people', { status: 'draft', display_name: name })).id;
  console.log(`  saved a draft profile "${name}" as a Football Editor`);
  const build = await buildAfter(since);
  assert.equal(build.ok, true, `the rebuild failed: ${build.reason}`);
  console.log(`  PASS the save triggered a rebuild (started ${Math.round((Date.parse(build.startedAt) - since) / 1000)} s after saving) that succeeded`);
  let note = null;
  for (let i = 0; i < 20 && !note; i++, await sleep(1500)) {
    [note] = await admin.get('/notifications' + q({ filter: { _and: [{ recipient: { _eq: created.user } }, { subject: { _eq: 'Website updated' } }] }, fields: 'id,message,timestamp' }));
  }
  assert.ok(note, 'no "Website updated" notification');
  assert.ok(Date.parse(note.timestamp) >= Date.parse(build.finishedAt) - 1000, 'the notification came before the build finished');
  console.log(`  PASS "Website updated" sent only after the build finished: "${note.message}"`);
  assert.equal(await onSite(name), false, 'the draft is visible on the website');
  console.log('  PASS the draft appears on no page');
} catch (error) {
  failure = error;
} finally {
  const since = Date.now();
  if (created.person) await admin.del(`/items/people/${created.person}`).catch((e) => console.error(`  draft: ${e.message}`));
  if (created.user) {
    const notes = await admin.get('/notifications' + q({ filter: { recipient: { _eq: created.user } }, fields: 'id' })).catch(() => []);
    if (notes.length) await admin.del('/notifications', notes.map((n) => n.id)).catch(() => {});
    await admin.patch(`/users/${created.user}`, { token: null, status: 'suspended' }).catch(() => {});
    try { await admin.del(`/users/${created.user}`); } catch (error) { if (!(error instanceof DirectusError)) throw error; }
  }
  if (created.person) {
    const build = await buildAfter(since).catch((e) => ({ ok: false, reason: e.message }));
    console.log(`  clean-up: draft and account removed; the deletion's rebuild ${build.ok ? 'succeeded' : `FAILED: ${build.reason}`}`);
    if (!build.ok) failure ??= new Error(`clean-up rebuild failed: ${build.reason}`);
  }
}
if (failure) {
  console.error(`\nFAILED: ${failure.message}`);
  process.exit(1);
}
console.log('\nRebuild trigger: all checks passed. Nothing was published.');
