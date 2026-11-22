// Integration test against the running local CMS: a Football Editor changes a player's photo
// in Directus, brid-publishing asks the rebuild listener to rebuild, and the next website build
// carries the new photo, with no change to the frontend code. The original photo is then
// restored and everything the test created is removed.
// Also checks three brid-publishing rules against the live API (licence-independent).
//
// Needs the CMS running (npm run cms:start) and the content seeded (npm run cms:seed).
// The Super Admin has 2FA, so pass a current authenticator code (used only to create and
// remove a temporary Football Editor account; the test itself runs as that editor):
//   npm run cms:test:photo -- --otp=123456
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { cropFor, writeVariants } from '../../scripts/lib/squad-photos.mjs';
import { DirectusError, client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const SLUG = 'brooke-stephenson';
const ALTERNATIVE = '.cache/drive/originals/brooke__EC__6486.jpg'; // Brooke's away-shirt photo
// Generated photo names carry a version (they change when the photo does), so find the current one.
const BUILT_DIR = 'dist/media/cms/squad/womens/web';
const builtPhoto = () => {
  const name = readdirSync(BUILT_DIR).find((f) => f.startsWith(`${SLUG}-`) && f.endsWith('-800.jpg'));
  if (!name) throw new Error(`no built 800px photo for ${SLUG}`);
  return path.join(BUILT_DIR, name);
};
const BUILT_PAGE = `dist/womens/team/${SLUG}/index.html`;
const LISTENER = 'http://127.0.0.1:4400';

const { url, env } = loadEnv();
const otp = process.argv.find((a) => a.startsWith('--otp='))?.slice(6);
const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const step = (text) => console.log(`\n- ${text}`);
const pass = (text) => console.log(`  PASS ${text}`);
const refused = async (promise, pattern) => {
  const error = await promise.then(() => null, (e) => e);
  assert.ok(error instanceof DirectusError && error.status === 403, `expected 403, got ${error?.status ?? 'success'}`);
  assert.match(error.message, pattern);
};

const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, otp);
const listenerBusy = await fetch(`${LISTENER}/status`).then(() => true, () => false);
if (listenerBusy) throw new Error('Something is already listening on 127.0.0.1:4400 (npm run cms:listen?). Stop it and re-run.');

let editorUser, uploadedFile, listener, person, restore;
try {
  step('Temporary Football Editor account');
  const [role] = await admin.get('/roles' + q({ filter: { name: { _eq: 'Football Editor' } }, fields: 'id' }));
  const email = `photo-test-${randomBytes(4).toString('hex')}@example.com`;
  const password = randomBytes(18).toString('base64url');
  editorUser = await admin.post('/users', { email, password, role: role.id, first_name: 'Photo', last_name: 'Test', status: 'active' });
  const editor = await login(url, email, password);
  pass(`created ${email} and signed in (Football Editor, no 2FA required for this role)`);

  step('Rebuild listener (short batching for the test)');
  listener = spawn(process.execPath, ['cms/scripts/rebuild-listener.mjs'], {
    env: { ...process.env, REBUILD_BATCH_SECONDS: '3', REBUILD_URGENT_SECONDS: '1' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  listener.stdout.on('data', (d) => process.stdout.write(`  [listener] ${d}`.replace(/\n(?!$)/g, '\n  [listener] ')));
  for (let i = 0; i < 50 && !(await fetch(`${LISTENER}/status`).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 200));

  /** Waits until a build that started after `since` has finished and nothing else is queued. */
  async function waitForBuild(since) {
    for (let i = 0; i < 300; i++) {
      const s = await fetch(`${LISTENER}/status`).then((r) => r.json());
      if (!s.building && !s.scheduled && s.lastBuild && new Date(s.lastBuild.startedAt) >= since) {
        assert.equal(s.lastBuild.ok, true, 'website build failed');
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Timed out waiting for the website build');
  }

  step('Current state');
  [person] = await editor.get('/items/people' + q({ filter: { slug: { _eq: SLUG } }, fields: 'id,photo,photo_crop,photo_description' }));
  assert.ok(person?.photo, `${SLUG} has no photo in Directus; run npm run cms:seed first`);
  restore = { photo: person.photo, photo_crop: person.photo_crop, photo_description: person.photo_description };
  let since = new Date();
  await editor.patch(`/items/people/${person.id}`, { photo_description: person.photo_description }); // no-op edit: publishes current state
  await waitForBuild(since);
  const before = await sha(builtPhoto());
  pass(`build from Directus shows the current photo (${before.slice(0, 12)}…)`);

  step('Football Editor uploads a new photo and assigns it');
  const form = new FormData();
  form.append('title', 'Brooke Stephenson (integration test)');
  form.append('file', new Blob([await readFile(ALTERNATIVE)], { type: 'image/jpeg' }), 'brooke-stephenson-EC__6486.jpg');
  uploadedFile = (await editor.post('/files', form)).id;
  since = new Date();
  await editor.patch(`/items/people/${person.id}`, { photo: uploadedFile, photo_crop: null, photo_description: 'squad portrait in the navy away shirt' });
  await waitForBuild(since);

  const expectedDir = await mkdtemp(path.join(tmpdir(), 'bt-photo-'));
  await writeVariants(ALTERNATIVE, await cropFor(ALTERNATIVE), expectedDir, SLUG);
  const after = await sha(builtPhoto());
  assert.notEqual(after, before, 'photo on the website did not change');
  assert.equal(after, await sha(path.join(expectedDir, `${SLUG}-800.jpg`)), 'website photo is not the new upload');
  assert.match(await readFile(BUILT_PAGE, 'utf8'), /navy away shirt/);
  await rm(expectedDir, { recursive: true, force: true });
  pass('next build shows the new photo (byte-identical to the expected crop) and its new description');

  step('Publishing rules enforced by brid-publishing on the live API');
  const [adminFile] = await editor.get('/files' + q({ filter: { id: { _eq: restore.photo } }, fields: 'id' }));
  await refused(editor.del(`/files/${adminFile.id}`), /only change or delete files you uploaded/);
  pass('editor cannot delete a photo someone else uploaded');
  await refused(editor.del(`/items/people/${person.id}`), /live on the website/);
  pass('editor cannot delete a published player');
  await refused(editor.post('/items/articles', { title: 'Test', slug: `test-${Date.now()}`, category: 'Statement', summary: 'x' }), /match reports/);
  pass('Football Editor cannot write a non-match article');

  step('Restore the original photo');
  since = new Date();
  await editor.patch(`/items/people/${person.id}`, restore);
  restore = null;
  await waitForBuild(since);
  assert.equal(await sha(builtPhoto()), before, 'original photo not restored on the website');
  pass('next build shows the original photo again');
} finally {
  if (restore && person) await admin.patch(`/items/people/${person.id}`, restore).catch((e) => console.error('  could not restore photo:', e.message));
  if (uploadedFile) await admin.del(`/files/${uploadedFile}`).catch((e) => console.error('  could not delete test upload:', e.message));
  if (editorUser) await admin.del(`/users/${editorUser.id}`).catch((e) => console.error('  could not delete test user:', e.message));
  listener?.kill();
  console.log('\nCleaned up: test upload deleted, temporary editor removed, listener stopped.');
}
console.log('\nAll photo-change integration checks passed.');
