// Applies the plain-English forms (cms/schema/admin-simplify.mjs) to the local Directus, after
// `cms:admin players`. Safe to re-run. Backs up and verifies the database first and stops if
// that fails. Only editor settings change: no content is changed or deleted. Draft versions are
// turned off outside APPROVAL_VERSIONED only while no unpublished draft versions exist there.
// Usage: npm run cms:admin -- --otp=123456 players simplify
import { APPROVAL_VERSIONED, LAYOUT, NEW_FIELDS, PRESETS, UPLOAD_FOLDERS } from '../schema/admin-simplify.mjs';
import { backupDatabase } from './lib/backup.mjs';
import { loadEnv, login, q } from './lib/directus.mjs';

const VERSIONABLE = ['people', 'squad_memberships', 'fixtures', 'league_tables', 'competitions', 'articles', 'announcements', 'events', 'sponsors', 'sponsorship_packages', 'pages'];

const { url, env } = loadEnv();
const log = (...args) => console.log(' ', ...args);

console.log('Database backup');
const backup = backupDatabase(env, 'before-admin-simplify');
log(`${backup.file} (${backup.kb} KB, ${backup.tables} tables, verified)`);

const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));

console.log('Groups');
const existing = {};
for (const collection of Object.keys(LAYOUT)) existing[collection] = new Set((await api.get(`/fields/${collection}`)).map((f) => f.field));
for (const [collection, fields] of Object.entries(NEW_FIELDS)) {
  for (const f of fields.filter((f) => !existing[collection].has(f.field))) {
    await api.post(`/fields/${collection}`, f);
    existing[collection].add(f.field);
    log(`+ ${collection}.${f.field}`);
  }
}

console.log('Forms');
const folders = await api.get('/folders' + q({ fields: 'id,name', limit: '-1' }));
const folderId = (name) => folders.find((f) => f.name === name)?.id ?? null;
const uploads = new Map(UPLOAD_FOLDERS.map(([collection, field, folder]) => [`${collection}.${field}`, folderId(folder)]));
for (const [collection, layout] of Object.entries(LAYOUT)) {
  const sortIn = new Map();
  for (const [field, group, meta] of layout) {
    const sort = (sortIn.get(group) ?? 0) + 1;
    sortIn.set(group, sort);
    if (!existing[collection].has(field)) {
      log(`  skipped ${collection}.${field} (not in this database)`);
      continue;
    }
    const folder = uploads.get(`${collection}.${field}`);
    const withFolder = folder ? { ...meta, options: { ...meta.options, folder } } : meta;
    await api.patch(`/fields/${collection}/${field}`, { meta: { ...withFolder, group, sort: group ? sort : sort + 1 } });
  }
  log(`~ ${collection}: ${layout.length} fields arranged`);
}
await api.patch('/fields/league_table_rows/is_bridlington', { meta: { translations: [{ language: 'en-GB', translation: 'Bridlington Town' }, { language: 'en-US', translation: 'Bridlington Town' }] } });

console.log('Publishing control');
// One control (Website status) everywhere except where approvals need draft versions.
const drafts = await api.get('/versions' + q({ fields: 'collection,item', limit: '-1' }));
for (const collection of VERSIONABLE) {
  const versioning = APPROVAL_VERSIONED.includes(collection);
  const waiting = drafts.filter((v) => v.collection === collection).length;
  if (!versioning && waiting) {
    log(`  kept draft versions on ${collection}: ${waiting} unpublished draft(s) would be stranded; publish or discard them, then re-run`);
    continue;
  }
  await api.patch(`/collections/${collection}`, { meta: { versioning } });
  log(`~ ${collection}: ${versioning ? 'draft versions (approval needed)' : 'Save + Website status'}`);
}

console.log('List views');
const shared = await api.get('/presets' + q({ filter: { _and: [{ user: { _null: true } }, { role: { _null: true } }, { collection: { _in: [...new Set(PRESETS.map((p) => p.collection))] } }] }, limit: '-1', fields: 'id,collection,bookmark' }));
for (const preset of PRESETS) {
  const found = shared.find((p) => p.collection === preset.collection && p.bookmark === preset.bookmark);
  const body = { ...preset, user: null, role: null };
  if (found) await api.patch(`/presets/${found.id}`, body);
  else await api.post('/presets', body);
  log(`${found ? '~' : '+'} ${preset.collection}: ${preset.bookmark ?? 'default view'}`);
}

console.log('\nDone. Reload the admin in your browser (F5) to see the changes.');
