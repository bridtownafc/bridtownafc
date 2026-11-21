// End-to-end check of player and team management against the running local CMS, as a
// temporary Football Editor (a static API token, so no second 2FA code is needed):
// adding a draft player from a team, photo upload and replacement, profile edits,
// validation, moving/adding/deactivating/removing team allocations, editor permissions,
// and that the website sync leaves draft and inactive records out. Nothing is published:
// the test player stays a draft throughout. Everything it creates is removed at the end.
//
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 players-test
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { DirectusError, client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const website = client(url, env.DIRECTUS_WEBSITE_TOKEN);
const tag = `pt${randomBytes(3).toString('hex')}`;
const slug = `test-player-${tag}`;
const created = { user: null, person: null, files: [] };
const results = [];

const pass = (text) => { results.push(text); console.log(`  PASS ${text}`); };
const step = (text) => console.log(`\n- ${text}`);
async function refused(promise, status, pattern) {
  const error = await promise.then(() => null, (e) => e);
  assert.ok(error instanceof DirectusError, 'expected a refusal, but it succeeded');
  assert.equal(error.status, status, `expected ${status}, got ${error.status}: ${error.message}`);
  if (pattern) assert.match(error.message, pattern);
  return error;
}
async function photo(colour) {
  const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: colour } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('folder', squadFolder.id);
  form.append('title', `Temporary test photo ${tag}`);
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), `${slug}-${created.files.length + 1}.jpg`);
  const file = await editor.post('/files', form);
  created.files.push(file.id);
  return file;
}
const allocationsOf = (personId) =>
  admin.get('/items/squad_memberships' + q({ filter: { person: { _eq: personId } }, fields: 'id,team.key,status,position,shirt_number,captaincy,sort', sort: 'id' }));

const teams = Object.fromEntries((await admin.get('/items/teams?fields=id,key,name')).map((t) => [t.key, t]));
const [squadFolder] = await admin.get('/folders' + q({ filter: { name: { _eq: 'Squad photos' } }, fields: 'id' }));
const [footballRole] = await admin.get('/roles' + q({ filter: { name: { _eq: 'Football Editor' } }, fields: 'id' }));
const token = randomBytes(32).toString('base64url');
created.user = (await admin.post('/users', { first_name: 'Temporary', last_name: `Test editor ${tag}`, email: `${tag}@example.com`, role: footballRole.id, token, status: 'active' })).id;
const editor = client(url, token);

let failure = null;
try {
  step('1. Add a temporary draft player from the Men\'s First Team squad list');
  await editor.patch(`/items/teams/${teams.mens.id}`, {
    squad: { create: [{ kind: 'player', position: 'Midfielder', shirt_number: 98, person: { status: 'draft', first_name: 'Test', surname: `Player ${tag}`, display_name: `Test Player ${tag}`, slug } }], update: [], delete: [] },
  });
  const [person] = await editor.get('/items/people' + q({ filter: { slug: { _eq: slug } }, fields: 'id,status,first_name,surname,display_name' }));
  assert.ok(person, 'player profile was not created');
  created.person = person.id;
  assert.equal(person.status, 'draft');
  let allocations = await allocationsOf(person.id);
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].team.key, 'mens', 'team allocation was not prefilled');
  assert.equal(allocations[0].status, 'published', 'new allocations should start Active');
  pass('player created from the team with the team prefilled; profile Draft, allocation Active');

  step('2. Upload, replace and preview a photograph; edit the profile');
  const first = await photo('#a81c2c');
  await editor.patch(`/items/people/${person.id}`, { photo: first.id, photo_description: 'temporary test image' });
  const second = await photo('#1c2ca8');
  await editor.patch(`/items/people/${person.id}`, { photo: second.id });
  const preview = await editor.raw('GET', `/assets/${second.id}?width=200&height=250&fit=cover`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type'), /^image\//);
  await editor.del(`/files/${first.id}`);
  created.files = created.files.filter((id) => id !== first.id);
  await editor.patch(`/items/people/${person.id}`, { biography: 'Temporary test biography.', sponsor_name: 'Test Sponsor Ltd', sponsor_url: 'https://example.com/sponsor' });
  const edited = await editor.get(`/items/people/${person.id}?fields=photo,biography,sponsor_name,sponsor_url`);
  assert.deepEqual(edited, { photo: second.id, biography: 'Temporary test biography.', sponsor_name: 'Test Sponsor Ltd', sponsor_url: 'https://example.com/sponsor' });
  pass('photo uploaded, replaced (old file removed by its uploader) and previewed as a thumbnail');
  pass('biography and sponsor saved');

  step('3. Validation');
  const allocation = allocations[0].id;
  await refused(editor.patch(`/items/squad_memberships/${allocation}`, { shirt_number: 120 }), 400);
  await refused(editor.patch(`/items/squad_memberships/${allocation}`, { position: 'Striker' }), 400);
  await refused(editor.patch(`/items/squad_memberships/${allocation}`, { captaincy: 'boss' }), 400);
  await refused(editor.patch(`/items/people/${person.id}`, { sponsor_url: 'www.example.com' }), 400);
  await refused(editor.patch(`/items/people/${person.id}`, { slug: 'Not A Slug' }), 400);
  await refused(editor.post('/items/people', { status: 'draft', slug: `${slug}-x` }), 400);
  const [someone] = await admin.get('/items/people' + q({ filter: { id: { _neq: person.id } }, fields: 'slug', limit: '1' }));
  await refused(editor.patch(`/items/people/${person.id}`, { slug: someone.slug }), 400);
  pass('refused: squad number 120, unknown position, unknown captaincy, sponsor link without https://, badly formed or duplicate web address, profile without a display name');

  step('4. Change, add and remove team allocations');
  await editor.patch(`/items/squad_memberships/${allocation}`, { team: teams.womens.id, captaincy: 'captain', sort: 99 });
  allocations = await allocationsOf(person.id);
  assert.equal(allocations[0].team.key, 'womens');
  assert.equal(allocations[0].captaincy, 'captain');
  pass('moved from the men\'s to the women\'s team, made captain, display order set');
  await editor.patch(`/items/people/${person.id}`, { team_allocations: { create: [{ team: teams.mens.id, kind: 'player', position: 'Defender', shirt_number: 97, captaincy: 'vice_captain' }], update: [], delete: [] } });
  allocations = await allocationsOf(person.id);
  assert.deepEqual(allocations.map((a) => a.team.key).sort(), ['mens', 'womens']);
  const profiles = await admin.get('/items/people' + q({ filter: { slug: { _eq: slug } }, fields: 'id' }));
  assert.equal(profiles.length, 1);
  pass('second team added from the player\'s profile: two allocations, one profile');
  const mensAllocation = allocations.find((a) => a.team.key === 'mens').id;
  await editor.patch(`/items/squad_memberships/${mensAllocation}`, { status: 'draft' });
  pass('allocation set to Inactive');
  await refused(editor.patch(`/items/teams/${teams.womens.id}`, { squad: { create: [], update: [], delete: [allocation] } }), 403, /live on the website/);
  pass('an Active allocation cannot be deleted by an editor (the rule asks them to use Removed from team)');
  await editor.patch(`/items/squad_memberships/${allocation}`, { status: 'archived' });
  await editor.patch(`/items/teams/${teams.womens.id}`, { squad: { create: [], update: [], delete: [allocation] } });
  allocations = await allocationsOf(person.id);
  assert.deepEqual(allocations.map((a) => a.team.key), ['mens']);
  assert.ok(await editor.get(`/items/people/${person.id}?fields=id`), 'profile should survive removal from a team');
  pass('removed from the women\'s team (Removed from team, then deleted from the squad list); the profile is kept');

  step('5. Editor permissions');
  await refused(editor.post('/users', { email: `${tag}-x@example.com`, role: footballRole.id }), 403);
  await refused(editor.patch('/settings', { project_name: 'x' }), 403);
  await refused(editor.post('/roles', { name: `x-${tag}` }), 403);
  await refused(editor.patch('/fields/people/display_name', { meta: { note: 'x' } }), 403);
  await refused(editor.post('/items/teams', { key: `x${tag}`, name: 'x' }), 403);
  await refused(editor.del(`/items/teams/${teams.womens.id}`), 403);
  await refused(editor.post('/items/sponsors', { name: 'x', tier: 'Main partner' }), 403);
  await refused(editor.post('/items/pages', { title: 'x', slug: `x-${tag}`, area: 'club' }), 403);
  pass('Football Editor refused: staff accounts, roles, settings, data model, creating or deleting teams, sponsors, pages');

  step('6. Website sync: draft and inactive records stay off the website');
  const today = new Date().toISOString().slice(0, 10);
  const published = { status: { _eq: 'published' } };
  const syncFilter = { _and: [published, { kind: { _eq: 'player' } }, { person: published }, { _or: [{ left_on: { _null: true } }, { left_on: { _gt: today } }] }] };
  const visible = await website.get('/items/squad_memberships' + q({ filter: syncFilter, fields: 'team.key,person.slug,person.photo', limit: '-1' }));
  assert.ok(!visible.some((m) => m.person?.slug === slug), 'a draft profile reached the website query');
  const activeOnly = await website.get('/items/squad_memberships' + q({ filter: { _and: [published, { person: { _eq: person.id } }] }, fields: 'id' }));
  assert.equal(activeOnly.length, 0, 'an Inactive allocation was offered to the website');
  pass('the website token\'s query leaves out the Draft profile and the Inactive allocation');

  const sync = spawnSync(process.execPath, ['cms/scripts/sync.mjs'], { encoding: 'utf8' });
  assert.equal(sync.status, 0, `cms:sync failed:\n${sync.stderr || sync.stdout}`);
  const content = JSON.parse(readFileSync('src/data/cms/content.json', 'utf8'));
  for (const key of ['mens', 'womens']) {
    const expected = await admin.get('/items/squad_memberships' + q({ filter: { _and: [syncFilter, { team: { key: { _eq: key } } }] }, fields: 'person.slug,person.photo', limit: '-1' }));
    const players = content.teams[key].players;
    assert.ok(!players.some((p) => p.slug === slug), `test player appeared in the ${key} snapshot`);
    assert.deepEqual(new Set(players.map((p) => p.slug)), new Set(expected.map((m) => m.person.slug)), `${key} players differ from the published allocations`);
    for (const m of expected) assert.equal(Boolean(players.find((p) => p.slug === m.person.slug).photo), Boolean(m.person.photo), `${m.person.slug}: photo mismatch`);
    pass(`cms:sync: ${players.length} ${key} players, exactly the published Active allocations, each with its photo; no test content`);
  }
} catch (error) {
  failure = error;
} finally {
  step('Cleaning up');
  if (created.person) {
    const left = await allocationsOf(created.person);
    if (left.length) await admin.del('/items/squad_memberships', left.map((a) => a.id));
    await admin.patch(`/items/people/${created.person}`, { photo: null });
    await admin.del(`/items/people/${created.person}`);
  }
  if (created.files.length) await admin.del('/files', created.files);
  if (created.user) {
    // Directus will not delete an account still recorded as the last editor of an item (here
    // the teams it saved). Then the token is cleared and the account suspended instead.
    await admin.patch(`/users/${created.user}`, { token: null, status: 'suspended' });
    try {
      await admin.del(`/users/${created.user}`);
    } catch (error) {
      if (!(error instanceof DirectusError)) throw error;
      console.log(`  NOTE temporary editor ${tag}@example.com could not be deleted (it last edited a team); token cleared and account suspended`);
      created.user = null;
    }
  }
  const leftovers = [
    ...(await admin.get('/items/people' + q({ filter: { slug: { _eq: slug } }, fields: 'id' }))),
    ...(await admin.get('/files' + q({ filter: { title: { _contains: tag } }, fields: 'id' }))),
    ...(created.user ? await admin.get('/users' + q({ filter: { email: { _contains: tag } }, fields: 'id' })) : []),
  ];
  assert.equal(leftovers.length, 0, `cleanup left ${leftovers.length} records`);
  console.log('  temporary player, allocations, photos and editor account removed');
}

if (failure) {
  console.error(`\nFAILED after ${results.length} checks: ${failure.message}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
