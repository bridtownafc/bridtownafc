// End-to-end check of the simplified admin as real staff roles, against the running local CMS.
// Temporary Football Editor and Commercial Editor accounts (static API tokens, so no second
// 2FA code) work through the squad, match-correction, sponsor and enquiry workflows, and
// confirm what stays out of reach: settings, staff accounts, other roles' enquiries, team
// settings and Match Centre references. Everything stays unpublished, and every temporary
// record and account is removed at the end.
//
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 staff-check
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DirectusError, client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const tag = `sr${randomBytes(3).toString('hex')}`;
const created = { users: [], enquiries: [], people: [], allocations: [], fixtures: [], sponsors: [] };
let checks = 0;

const pass = (text) => { checks += 1; console.log(`  PASS ${text}`); };
const step = (text) => console.log(`\n- ${text}`);
async function refused(promise, pattern) {
  const error = await promise.then(() => null, (e) => e);
  assert.ok(error instanceof DirectusError, 'expected a refusal, but it succeeded');
  assert.ok([400, 401, 403].includes(error.status), `expected a refusal, got ${error.status}: ${error.message}`);
  if (pattern) assert.match(error.message, pattern);
}
async function staff(roleName) {
  const [role] = await admin.get('/roles' + q({ filter: { name: { _eq: roleName } }, fields: 'id' }));
  const token = randomBytes(32).toString('base64url');
  const user = await admin.post('/users', { first_name: 'Temporary', last_name: `${roleName} ${tag}`, email: `${tag}-${roleName.split(' ')[0].toLowerCase()}@example.com`, role: role.id, token, status: 'active' });
  created.users.push(user.id);
  return { id: user.id, api: client(url, token) };
}

const teams = Object.fromEntries((await admin.get('/items/teams?fields=id,key,name')).map((t) => [t.key, t]));
let failure = null;
try {
  step('Settings applied');
  const meta = async (c) => (await admin.get(`/collections/${c}`)).meta;
  for (const c of ['people', 'squad_memberships', 'articles', 'fixtures', 'events']) assert.equal((await meta(c)).versioning, false, `${c}: Save + Website status`);
  for (const c of ['sponsors', 'sponsorship_packages', 'pages', 'announcements']) assert.equal((await meta(c)).versioning, true, `${c}: draft versions for approvals`);
  pass('one publishing control (Website status) except sponsors, packages, pages and announcements, which keep draft versions for approvals');
  const enquiriesMeta = await meta('enquiries');
  assert.equal(enquiriesMeta.group, 'nav_club');
  assert.equal((await meta('fixtures')).group, 'nav_matches');
  pass('navigation: Website enquiries under Club, match corrections under Matches');

  // Test enquiries, as if sent from the website form.
  for (const topic of ['commercial', 'football', 'general']) {
    const e = await admin.post('/items/enquiries', { topic, name: `Test sender ${tag}`, email: `${tag}@example.com`, message: `Temporary test enquiry ${tag}`, consent: true, page: '/contact/' });
    created.enquiries.push({ id: e.id, topic });
  }
  const enquiry = (topic) => created.enquiries.find((e) => e.topic === topic).id;

  step('Football Editor');
  const football = await staff('Football Editor');
  const fe = football.api;
  await refused(fe.get('/items/enquiries'));
  await refused(fe.get(`/items/enquiries/${enquiry('football')}`));
  await refused(fe.patch(`/items/enquiries/${enquiry('football')}`, { handling: 'done' }));
  pass('no access to website enquiries, by list or directly (football routing awaits confirmation)');

  await refused(fe.patch(`/items/teams/${teams.mens.id}`, { name: `Renamed ${tag}` }), /Only a Club Admin/);
  await refused(fe.patch(`/items/teams/${teams.womens.id}`, { fulltime_table_code: '123456' }), /Only a Club Admin/);
  pass('team names and FA Full-Time settings refused');

  const slug = `test-player-${tag}`;
  await fe.patch(`/items/teams/${teams.mens.id}`, {
    squad: { create: [{ kind: 'player', position: 'Defender', shirt_number: 97, person: { status: 'draft', first_name: 'Test', surname: `Player ${tag}`, display_name: `Test Player ${tag}`, slug } }], update: [], delete: [] },
  });
  const [person] = await admin.get('/items/people' + q({ filter: { slug: { _eq: slug } }, fields: 'id' }));
  assert.ok(person, 'player not created from the squad list');
  created.people.push(person.id);
  const [allocation] = await admin.get('/items/squad_memberships' + q({ filter: { person: { _eq: person.id } }, fields: 'id,team,status' }));
  created.allocations.push(allocation.id);
  assert.equal(allocation.team, teams.mens.id, 'team not carried into the allocation');
  pass("new draft player added from the men's squad list; the team was filled in automatically");

  await refused(fe.post('/items/people', { status: 'draft', display_name: `test player ${tag.toUpperCase()}`, slug: `${slug}-2` }), /already exists/);
  await refused(fe.post('/items/squad_memberships', { person: person.id, team: teams.mens.id, kind: 'player' }), /already in Men/);
  await refused(fe.post('/items/squad_memberships', { person: person.id, kind: 'player' }), /Choose the team/);
  pass('duplicate profile, duplicate allocation and allocation without a team refused');

  await fe.patch(`/items/squad_memberships/${allocation.id}`, { team: teams.womens.id });
  const today = new Date().toISOString().slice(0, 10);
  await fe.patch(`/items/squad_memberships/${allocation.id}`, { status: 'archived', left_on: today });
  const moved = await admin.get(`/items/squad_memberships/${allocation.id}?fields=team,status,left_on`);
  assert.deepEqual([moved.team, moved.status, moved.left_on], [teams.womens.id, 'archived', today]);
  pass('moved to the women\'s team, then marked as having left (Removed from team, with the date)');

  const fixture = await fe.post('/items/fixtures', { status: 'draft', team: teams.mens.id, opponent: `Test opponent ${tag}`, kickoff: '2027-05-01T14:00:00Z', source_match_id: `football-web-pages:9${Date.now() % 1e8}` });
  created.fixtures.push(fixture.id);
  await fe.patch(`/items/fixtures/${fixture.id}`, { match_status: 'full_time', score_for: 2, score_against: 1 });
  await refused(fe.patch(`/items/fixtures/${fixture.id}`, { source_match_id: 'football-web-pages:1' }), /cannot be changed/);
  await refused(fe.post('/items/fixtures', { status: 'draft', team: teams.mens.id, opponent: 'x', kickoff: '2027-05-01T14:00:00Z', source_match_id: 'not a reference' }));
  pass('draft match correction created and edited; its Match Centre reference is protected and badly formed references refused');

  await refused(fe.patch('/settings', { project_name: `x ${tag}` }));
  await refused(fe.post('/users', { email: `${tag}-x@example.com` }));
  await refused(fe.post('/roles', { name: `x-${tag}` }));
  await refused(fe.get('/items/site_settings'));
  await refused(fe.post('/items/sponsors', { status: 'draft', name: `x ${tag}`, tier: 'Matchday partner' }));
  pass('settings, staff accounts, roles, club details and sponsors out of reach');

  step('Media Editor');
  const [mediaRole] = await admin.get('/roles' + q({ filter: { name: { _eq: 'Media Editor' } }, fields: 'id' }));
  await admin.patch(`/users/${football.id}`, { role: mediaRole.id });
  await refused(fe.get('/items/enquiries'));
  await refused(fe.get(`/items/enquiries/${enquiry('general')}`));
  pass('no access to website enquiries (community routing awaits confirmation)');

  step('Commercial Editor');
  const ce = (await staff('Commercial Editor')).api;
  const visible = await ce.get('/items/enquiries' + q({ filter: { message: { _contains: tag } }, fields: 'id,topic', limit: '-1' }));
  assert.deepEqual(visible.map((e) => e.topic), ['commercial'], 'list should show commercial enquiries only');
  await refused(ce.get(`/items/enquiries/${enquiry('general')}`));
  await refused(ce.patch(`/items/enquiries/${enquiry('general')}`, { handling: 'done' }));
  await ce.patch(`/items/enquiries/${enquiry('commercial')}`, { handling: 'in_progress', internal_notes: `Test note ${tag}` });
  await refused(ce.del(`/items/enquiries/${enquiry('commercial')}`));
  pass('commercial enquiries only, in the list and directly; can mark progress; cannot delete');

  await refused(ce.post('/items/sponsors', { status: 'published', name: `Test sponsor ${tag}`, tier: 'Matchday partner' }), /Club Admin approval/);
  const sponsor = await ce.post('/items/sponsors', { status: 'in_review', name: `Test sponsor ${tag}`, tier: 'Matchday partner', website_url: 'https://example.com' });
  created.sponsors.push(sponsor.id);
  pass('sponsor saved In review; publishing it directly needs Club Admin approval');

  step('Club Admin');
  const [clubAdmin] = await admin.get('/policies' + q({ filter: { name: { _eq: 'Club Admin' } }, fields: 'id' }));
  const rows = await admin.get('/permissions' + q({ filter: { _and: [{ policy: { _eq: clubAdmin.id } }, { collection: { _eq: 'enquiries' } }] }, fields: 'action', limit: '-1' }));
  assert.deepEqual(rows.map((r) => r.action).sort(), ['delete', 'read', 'update']);
  pass('Club Admin keeps every enquiry: read, update and delete');
} catch (error) {
  failure = error;
} finally {
  step('Cleaning up');
  if (created.allocations.length) await admin.del('/items/squad_memberships', created.allocations);
  if (created.people.length) await admin.del('/items/people', created.people);
  if (created.fixtures.length) await admin.del('/items/fixtures', created.fixtures);
  if (created.sponsors.length) await admin.del('/items/sponsors', created.sponsors);
  if (created.enquiries.length) await admin.del('/items/enquiries', created.enquiries.map((e) => e.id));
  for (const id of created.users) {
    await admin.patch(`/users/${id}`, { token: null, status: 'suspended' });
    try {
      await admin.del(`/users/${id}`);
    } catch (error) {
      if (!(error instanceof DirectusError)) throw error;
      console.log('  NOTE a temporary account could not be deleted (it last edited a team); token cleared and account suspended');
    }
  }
  const leftovers = [
    ...(await admin.get('/items/people' + q({ filter: { slug: { _contains: tag } }, fields: 'id' }))),
    ...(await admin.get('/items/fixtures' + q({ filter: { opponent: { _contains: tag } }, fields: 'id' }))),
    ...(await admin.get('/items/sponsors' + q({ filter: { name: { _contains: tag } }, fields: 'id' }))),
    ...(await admin.get('/items/enquiries' + q({ filter: { message: { _contains: tag } }, fields: 'id' }))),
    ...(await admin.get('/users' + q({ filter: { _and: [{ email: { _contains: tag } }, { status: { _eq: 'active' } }] }, fields: 'id' }))),
  ];
  assert.equal(leftovers.length, 0, `cleanup left ${leftovers.length} records`);
  console.log('  temporary records and accounts removed');
}

if (failure) {
  console.error(`\nFAILED after ${checks} checks: ${failure.message}`);
  process.exit(1);
}
console.log(`\nAll ${checks} staff-role checks passed.`);
