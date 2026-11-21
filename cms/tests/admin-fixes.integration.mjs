// Checks the admin fixes against the running local CMS, after `players` has been applied:
// team, competition and season links show names; adding someone from a team's Squad list
// fills in the team, while an allocation saved elsewhere without a team is refused; and
// website enquiries are in the Club menu with each editor role limited to its topics.
// Creates one draft person and allocation (never published) and removes them.
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 admin-check
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DirectusError, loadEnv, login, q } from '../scripts/lib/directus.mjs';
import { ENQUIRY_TOPICS } from '../extensions/brid-publishing/rules.js';

const { url, env } = loadEnv();
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const tag = randomBytes(3).toString('hex');
const pass = (text) => console.log(`  PASS ${text}`);
const created = { person: null, allocations: [] };

try {
  console.log('- Names instead of numbers');
  for (const c of ['teams', 'competitions', 'seasons']) {
    assert.equal((await admin.get(`/collections/${c}`)).meta.display_template, '{{name}}', `${c} display template`);
  }
  const relational = [
    ...['squad_memberships', 'fixtures', 'league_tables', 'articles', 'announcements', 'events'].map((c) => [c, 'team']),
    ['fixtures', 'competition'], ['league_tables', 'competition'], ['fixtures', 'season'],
  ];
  for (const [c, f] of relational) {
    const { meta } = await admin.get(`/fields/${c}/${f}`);
    assert.equal(meta.display, 'related-values', `${c}.${f} display`);
    assert.equal(meta.options?.template, '{{name}}', `${c}.${f} dropdown template`);
  }
  pass('teams, competitions and seasons show their names in forms and lists');

  console.log('- Adding someone from a team\'s Squad list');
  const team = (await admin.get('/fields/squad_memberships/team')).meta;
  assert.equal(team.required, false, 'the Team box should not be required on screen');
  const [mens] = await admin.get('/items/teams' + q({ filter: { key: { _eq: 'mens' } }, fields: 'id' }));
  created.person = await admin.post('/items/people', { status: 'draft', display_name: `Admin Check ${tag}`, slug: `admin-check-${tag}` });
  // Exactly what the Squad list sends when the team is saved: the new row has no team.
  await admin.patch(`/items/teams/${mens.id}`, { squad: { create: [{ person: created.person.id, kind: 'player', status: 'draft' }] } });
  const [allocation] = await admin.get('/items/squad_memberships' + q({ filter: { person: { _eq: created.person.id } }, fields: 'id,team,status' }));
  assert.ok(allocation, 'no allocation was created');
  created.allocations.push(allocation.id);
  assert.equal(allocation.team, mens.id, 'the team was not filled in');
  assert.equal(allocation.status, 'draft');
  pass("an allocation added through the men's Squad list gets the men's team automatically (draft, not on the website)");

  const refused = await admin.post('/items/squad_memberships', { person: created.person.id, kind: 'player', status: 'draft' }).then(() => null, (e) => e);
  if (refused === null) {
    const [stray] = await admin.get('/items/squad_memberships' + q({ filter: { _and: [{ person: { _eq: created.person.id } }, { team: { _null: true } }] }, fields: 'id' }));
    if (stray) created.allocations.push(stray.id);
  }
  assert.ok(refused instanceof DirectusError && refused.status === 403, 'an allocation without a team was accepted');
  assert.match(refused.message, /Choose the team/);
  pass('an allocation saved without a team is refused with a clear message');

  console.log('- Website enquiries');
  const enquiries = await admin.get('/collections/enquiries');
  assert.equal(enquiries.meta.group, 'nav_club', 'enquiries should be in the Club menu');
  assert.equal(enquiries.meta.hidden, false);
  pass('"Website enquiries" is in the Club menu');
  const policies = await admin.get('/policies' + q({ fields: 'id,name', limit: '-1' }));
  for (const [role, topics] of Object.entries(ENQUIRY_TOPICS)) {
    const policy = policies.find((p) => p.name === role);
    const rows = await admin.get('/permissions' + q({ filter: { _and: [{ policy: { _eq: policy.id } }, { collection: { _eq: 'enquiries' } }] }, fields: 'action', limit: '-1' }));
    assert.deepEqual(rows.map((r) => r.action).sort(), ['read', 'update'], `${role} enquiry permissions`);
    pass(`${role}: can read and update enquiries (limited to ${topics.join(' and ')} by brid-publishing)`);
  }
  const clubAdmin = policies.find((p) => p.name === 'Club Admin');
  const adminRows = await admin.get('/permissions' + q({ filter: { _and: [{ policy: { _eq: clubAdmin.id } }, { collection: { _eq: 'enquiries' } }] }, fields: 'action', limit: '-1' }));
  assert.deepEqual(adminRows.map((r) => r.action).sort(), ['delete', 'read', 'update']);
  pass('Club Admin: unchanged (read, update and delete every enquiry)');
} finally {
  for (const id of created.allocations) await admin.del(`/items/squad_memberships/${id}`).catch((e) => console.error(`  allocation ${id}: ${e.message}`));
  if (created.person) await admin.del(`/items/people/${created.person.id}`).catch((e) => console.error(`  person: ${e.message}`));
  const left = await admin.get('/items/people' + q({ filter: { slug: { _starts_with: 'admin-check-' } }, fields: 'id' }));
  assert.deepEqual(left, [], 'temporary records left behind');
  console.log('  PASS temporary person and allocation removed');
}
console.log('\nAdmin fixes: all checks passed.');
