// Unit tests for the publishing rules. Run: npm run cms:test:rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFileWrite, checkWrite, scopeQuery } from '../extensions/brid-publishing/rules.js';

const as = (...roleNames) => ({ admin: false, roleNames });
const superAdmin = { admin: true, roleNames: ['Super Admin'] };
const draft = (extra = {}) => ({ status: 'draft', ...extra });
const live = (extra = {}) => ({ status: 'published', ...extra });

const create = (collection, after, user) => checkWrite({ action: 'create', collection, before: null, after, user });
const update = (collection, before, changes, user) => checkWrite({ action: 'update', collection, before, after: { ...before, ...changes }, user });
const remove = (collection, before, user) => checkWrite({ action: 'delete', collection, before, after: null, user });

test('Super Admin and Club Admin can publish anything', () => {
  for (const user of [superAdmin, as('Club Admin')]) {
    assert.equal(create('sponsors', live(), user), null);
    assert.equal(update('announcements', draft({ importance: 'major' }), { status: 'published' }, user), null);
    assert.equal(remove('pages', live(), user), null);
  }
});

test('Media Editor publishes routine news and announcements directly', () => {
  const media = as('Media Editor');
  assert.equal(create('articles', live({ category: 'Club news' }), media), null);
  assert.equal(create('announcements', live({ importance: 'routine' }), media), null);
  assert.equal(update('announcements', live({ importance: 'routine' }), { title: 'Gates open 2pm' }, media), null);
});

test('major announcements need Club Admin approval', () => {
  const media = as('Media Editor');
  assert.equal(create('announcements', draft({ importance: 'major' }), media), null, 'drafting is allowed');
  assert.equal(create('announcements', { status: 'in_review', importance: 'major' }, media), null, 'submitting is allowed');
  assert.match(create('announcements', live({ importance: 'major' }), media), /approval/);
  assert.match(update('announcements', draft({ importance: 'major' }), { status: 'published' }, media), /approval/, 'status-only change');
  assert.match(update('announcements', live({ importance: 'routine' }), { importance: 'major' }, media), /approval/, 'upgrading a live routine notice');
  assert.match(update('announcements', live({ importance: 'major' }), { title: 'Edited' }, media), /live/, 'editing a live major notice');
  assert.match(remove('announcements', live({ importance: 'major' }), media), /live/);
});

test('Commercial Editor drafts sponsor and package changes for approval', () => {
  const commercial = as('Commercial Editor');
  for (const collection of ['sponsors', 'sponsorship_packages']) {
    assert.equal(create(collection, draft(), commercial), null);
    assert.equal(update(collection, draft(), { status: 'in_review' }, commercial), null);
    assert.match(create(collection, live(), commercial), /approval/);
    assert.match(update(collection, { status: 'in_review' }, { status: 'published' }, commercial), /approval/);
    assert.match(update(collection, live(), { price_label: '£1' }, commercial), /version/, 'live items change through versions');
    assert.match(update(collection, live(), { status: 'archived' }, commercial), /live/, 'cannot take a sponsor down alone');
    assert.match(remove(collection, live(), commercial), /live/);
    assert.equal(remove(collection, draft(), commercial), null);
  }
});

test('Commercial Editor is limited to commercial pages', () => {
  const commercial = as('Commercial Editor');
  assert.equal(create('pages', draft({ area: 'commercial' }), commercial), null);
  assert.match(create('pages', draft({ area: 'club' }), commercial), /commercial pages/);
  assert.match(update('pages', draft({ area: 'commercial' }), { area: 'policies' }, commercial), /commercial pages/);
  assert.match(update('pages', draft({ area: 'club' }), { title: 'x' }, commercial), /commercial pages/);
  assert.match(create('pages', live({ area: 'commercial' }), commercial), /approval/);
});

test('Football Editor publishes football content and only match articles', () => {
  const football = as('Football Editor');
  for (const collection of ['fixtures', 'league_tables', 'league_table_rows', 'people', 'squad_memberships']) {
    assert.equal(create(collection, live(), football), null);
    assert.equal(update(collection, live(), { score_for: 2 }, football), null);
  }
  assert.equal(create('articles', live({ category: 'Match report' }), football), null);
  assert.equal(create('articles', live({ category: 'Match preview' }), football), null);
  assert.match(create('articles', draft({ category: 'Statement' }), football), /match reports/);
  assert.match(update('articles', live({ category: 'Match report' }), { category: 'Club news' }, football), /match reports/);
  assert.match(update('articles', live({ category: 'Club news' }), { title: 'x' }, football), /match reports/);
});

test('only approvers delete live content; drafts and archived items can be deleted', () => {
  for (const role of ['Media Editor', 'Football Editor']) {
    const collection = role === 'Media Editor' ? 'articles' : 'fixtures';
    const extra = role === 'Football Editor' ? {} : { category: 'Club news' };
    assert.match(remove(collection, live(extra), as(role)), /live/);
    assert.equal(remove(collection, draft(extra), as(role)), null);
    assert.equal(remove(collection, { status: 'archived', ...extra }, as(role)), null);
  }
  assert.equal(remove('league_table_rows', { position: 1 }, as('Football Editor')), null, 'rows have no status');
  assert.equal(remove('articles', live(), as('Club Admin')), null);
});

test('editors change only their own uploads', () => {
  const editor = { admin: false, roleNames: ['Media Editor'], id: 'u1' };
  assert.equal(checkFileWrite({ file: { uploaded_by: 'u1' }, user: editor }), null);
  assert.match(checkFileWrite({ file: { uploaded_by: 'u2' }, user: editor }), /you uploaded/);
  assert.match(checkFileWrite({ file: { uploaded_by: null }, user: editor }), /you uploaded/);
  assert.equal(checkFileWrite({ file: { uploaded_by: 'u2' }, user: { admin: false, roleNames: ['Club Admin'], id: 'u3' } }), null);
});

test('roles without a rule are not restricted by the guard (permissions handle them)', () => {
  assert.equal(create('fixtures', live(), as('Media Editor')), null);
  assert.equal(create('directus_files', {}, as()), null);
});

// --- Read limits (brid-publishing items.query), independent of licence tier --------------------

const commercial = { admin: false, roleNames: ['Commercial Editor'] };
const website = { admin: false, roleNames: ['Website'] };

test('Commercial Editors only read commercial enquiries, combined with their own filter', () => {
  const q = scopeQuery({ collection: 'enquiries', query: { filter: { handling: { _eq: 'new' } }, limit: 10 }, user: commercial });
  assert.deepEqual(q, { filter: { _and: [{ handling: { _eq: 'new' } }, { topic: { _eq: 'commercial' } }] }, limit: 10 });
});

test('the website token reads published items only, and articles only once due', () => {
  assert.deepEqual(scopeQuery({ collection: 'fixtures', query: {}, user: website }).filter, { _and: [{ status: { _eq: 'published' } }] });
  const articles = scopeQuery({ collection: 'articles', query: {}, user: website, now: '2026-10-27T09:00:00.000Z' }).filter;
  assert.deepEqual(articles._and[0]._and[1], { _or: [{ published_at: { _null: true } }, { published_at: { _lte: '2026-10-27T09:00:00.000Z' } }] });
  assert.deepEqual(scopeQuery({ collection: 'league_table_rows', query: {}, user: website }).filter, { _and: [{ league_table: { status: { _eq: 'published' } } }] });
});

test('Club Admins and administrators are not limited; other collections are unchanged', () => {
  const query = { filter: { id: { _eq: 1 } } };
  assert.equal(scopeQuery({ collection: 'enquiries', query, user: { admin: false, roleNames: ['Club Admin'] } }), query);
  assert.equal(scopeQuery({ collection: 'enquiries', query, user: { admin: true, roleNames: [] } }), query);
  assert.equal(scopeQuery({ collection: 'articles', query, user: commercial }), query);
});
