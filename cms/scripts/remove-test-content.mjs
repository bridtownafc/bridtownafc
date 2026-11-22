// Removes leftovers of interrupted automated checks: only records whose names match the exact
// patterns the tests use ("Test men's article 8590C5", "Test Player AB12CD", accounts at
// @example.com created by the tests). Genuine club content never matches. Lists what it removes.
// Usage: npm run cms:admin -- --otp=123456 cleanup
import { DirectusError, loadEnv, login, q } from './lib/directus.mjs';

const { url, env } = loadEnv();
const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const log = (...args) => console.log(' ', ...args);

const TAG = '[0-9A-Fa-f]{6}';
const TEST_ARTICLE = new RegExp(`^Test (men's |women's |future )?article ${TAG}( \\(edited\\))?$`);
const TEST_PERSON = new RegExp(`^(Test (Men |Draft )?Player ${TAG}|Test Player (pt|sr)?${TAG}|Admin Check ${TAG})$`, 'i');
const TEST_EMAIL = /^(test-[0-9a-z]+-[a-z]+|test-rebuild-[0-9a-z]+|(pt|sr|gs|eq)[0-9a-f]{6}(-[a-z]+)?)@example\.com$/;

const articles = (await api.get('/items/articles' + q({ filter: { title: { _starts_with: 'Test ' } }, fields: 'id,title', limit: '-1' }))).filter((a) => TEST_ARTICLE.test(a.title));
const people = (await api.get('/items/people' + q({ filter: { _or: [{ display_name: { _starts_with: 'Test ' } }, { display_name: { _starts_with: 'Admin Check ' } }] }, fields: 'id,display_name,photo', limit: '-1' }))).filter((p) => TEST_PERSON.test(p.display_name));
const allocations = people.length ? await api.get('/items/squad_memberships' + q({ filter: { person: { _in: people.map((p) => p.id) } }, fields: 'id', limit: '-1' })) : [];
const files = (await api.get('/files' + q({ filter: { filename_download: { _starts_with: 'test-photo-' } }, fields: 'id,filename_download', limit: '-1' })));
const users = (await api.get('/users' + q({ filter: { email: { _ends_with: '@example.com' } }, fields: 'id,email,status', limit: '-1' }))).filter((u) => TEST_EMAIL.test(u.email));

if (allocations.length) await api.del('/items/squad_memberships', allocations.map((a) => a.id));
for (const p of people) { await api.patch(`/items/people/${p.id}`, { photo: null }); log(`- player ${p.display_name}`); }
if (people.length) await api.del('/items/people', people.map((p) => p.id));
for (const a of articles) log(`- article ${a.id} "${a.title}"`);
if (articles.length) await api.del('/items/articles', articles.map((a) => a.id));
for (const f of files) log(`- file ${f.filename_download}`);
if (files.length) await api.del('/files', files.map((f) => f.id));
const notes = users.length ? await api.get('/notifications' + q({ filter: { recipient: { _in: users.map((u) => u.id) } }, fields: 'id', limit: '-1' })) : [];
if (notes.length) await api.del('/notifications', notes.map((n) => n.id));
for (const u of users) {
  await api.patch(`/users/${u.id}`, { status: 'suspended', token: null });
  try { await api.del(`/users/${u.id}`); log(`- account ${u.email}`); }
  catch (error) { if (!(error instanceof DirectusError)) throw error; log(`~ account ${u.email}: suspended (it last edited a record, so it is kept for the history)`); }
}
console.log(`\nRemoved ${articles.length} test article(s), ${people.length} test player(s), ${files.length} test photo(s); ${users.length} test account(s) removed or suspended.`);
