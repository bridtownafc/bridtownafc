// Unit tests for the player and team admin definitions (cms/schema/player-admin.mjs).
// Run: node --test cms/tests/player-admin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload } from '../server/node_modules/@directus/utils/dist/shared/index.js';
import { LAYOUT, NAVIGATION, NEW_FIELDS, PRESETS, RELATION_UPDATES } from '../schema/player-admin.mjs';
import { COLLECTIONS } from '../schema/collections.mjs';

const rule = (collection, field) => LAYOUT[collection].find(([f]) => f === field)[2].validation;
const valid = (collection, field, value) => validatePayload(rule(collection, field), { [field]: value }).length === 0;

test('every field in a form exists in the content model or is added here', () => {
  for (const [collection, layout] of Object.entries(LAYOUT)) {
    const known = new Set([
      ...COLLECTIONS.find((c) => c.collection === collection).fields.map((f) => f.field),
      ...(NEW_FIELDS[collection] ?? []).map((f) => f.field),
    ]);
    for (const [field, group] of layout) {
      assert.ok(known.has(field), `${collection}.${field} is not defined`);
      if (group) assert.ok(layout.some(([f]) => f === group), `${collection}.${field}: group ${group} is not laid out`);
    }
  }
});

test('squad numbers are optional whole numbers from 1 to 99', () => {
  for (const ok of [null, 1, 99]) assert.ok(valid('squad_memberships', 'shirt_number', ok), String(ok));
  for (const bad of [0, 100, 120]) assert.ok(!valid('squad_memberships', 'shirt_number', bad), String(bad));
});

test('position and captaincy accept only their choices, or nothing', () => {
  assert.ok(valid('squad_memberships', 'position', 'Goalkeeper'));
  assert.ok(valid('squad_memberships', 'position', null));
  assert.ok(!valid('squad_memberships', 'position', 'Striker'));
  assert.ok(valid('squad_memberships', 'captaincy', 'vice_captain'));
  assert.ok(valid('squad_memberships', 'captaincy', null));
  assert.ok(!valid('squad_memberships', 'captaincy', 'boss'));
});

test('sponsor links must be full web addresses', () => {
  for (const ok of [null, '', 'https://example.com/sponsor', 'http://example.com']) assert.ok(valid('people', 'sponsor_url', ok), String(ok));
  for (const bad of ['www.example.com', 'example.com', 'javascript:alert(1)']) assert.ok(!valid('people', 'sponsor_url', bad), bad);
});

test('allocation squad status keeps the values the website sync relies on', () => {
  const choices = LAYOUT.squad_memberships.find(([f]) => f === 'status')[2].options.choices;
  assert.equal(choices.find((c) => c.text.startsWith('Active')).value, 'published');
  assert.equal(choices.find((c) => c.text.startsWith('Removed')).value, 'archived');
});

test('removing a row from a Squad or Teams list deletes only the allocation', () => {
  for (const { collection, meta } of RELATION_UPDATES) {
    assert.equal(collection, 'squad_memberships');
    assert.equal(meta.one_deselect_action, 'delete');
  }
});

test('navigation lists each collection once; presets use known collections', () => {
  const listed = Object.values(NAVIGATION).flat().map(([c]) => c);
  assert.equal(new Set(listed).size, listed.length);
  for (const p of PRESETS) assert.ok(['people', 'squad_memberships'].includes(p.collection));
});
