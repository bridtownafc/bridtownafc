// Applies the player and team management admin (cms/schema/player-admin.mjs) to the local
// Directus, after cms:bootstrap. Safe to re-run. It first backs up the database with
// pg_dump to %LOCALAPPDATA%\BridTownCMS\backups and stops if that fails. It only adds
// fields and changes editor settings: no content is changed or deleted, apart from the
// Super Admin's own saved list views for players and allocations, which are reset so the
// new shared views show.
// Usage: npm run cms:admin -- --otp=123456 players
import { POLICIES } from '../schema/access.mjs';
import {
  DISPLAY_TEMPLATES, LAYOUT, NAVIGATION, NAV_FOLDERS, NEW_FIELDS, PRESETS, RELATION_DISPLAYS, RELATION_UPDATES, SCHEMA_UPDATES, collectionNames,
} from '../schema/player-admin.mjs';
import { backupDatabase } from './lib/backup.mjs';
import { DirectusError, loadEnv, login, q } from './lib/directus.mjs';

const UPDATED_POLICIES = ['Football Editor', 'Media Editor', 'Commercial Editor', 'Website build'];

const { url, env } = loadEnv();
const log = (...args) => console.log(' ', ...args);

console.log('Database backup');
const backup = backupDatabase(env, 'before-player-admin');
log(`${backup.file} (${backup.kb} KB, ${backup.tables} tables, verified)`);

const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));

console.log('Fields');
const existing = {};
for (const collection of Object.keys(LAYOUT)) existing[collection] = new Set((await api.get(`/fields/${collection}`)).map((f) => f.field));
for (const [collection, fields] of Object.entries(NEW_FIELDS)) {
  for (const f of fields.filter((f) => !existing[collection].has(f.field))) {
    await api.post(`/fields/${collection}`, f);
    existing[collection].add(f.field);
    log(`+ ${collection}.${f.field}`);
  }
}

console.log('Relations');
for (const { collection, field, meta } of RELATION_UPDATES) {
  await api.patch(`/relations/${collection}/${field}`, { meta });
  log(`~ ${collection}.${field} (${meta.one_field} list)`);
}

console.log('Forms');
// Photos uploaded from a profile go to the Squad photos folder.
const [squadFolder] = await api.get('/folders' + q({ filter: { name: { _eq: 'Squad photos' } }, fields: 'id' }));
const photoMeta = LAYOUT.people.find(([field]) => field === 'photo')[2];
photoMeta.options = { ...photoMeta.options, folder: squadFolder?.id ?? null };
for (const [collection, layout] of Object.entries(LAYOUT)) {
  const sortIn = new Map();
  for (const [field, group, meta] of layout) {
    const sort = (sortIn.get(group) ?? 0) + 1;
    sortIn.set(group, sort);
    if (!existing[collection].has(field)) {
      log(`  skipped ${collection}.${field} (not in this database)`);
      continue;
    }
    await api.patch(`/fields/${collection}/${field}`, { meta: { ...meta, group, sort: group ? sort : sort + 1 } });
  }
  log(`~ ${collection}: ${layout.length} fields arranged`);
}
for (const { collection, field, meta } of RELATION_DISPLAYS) {
  // The squad_memberships.team form settings above are kept; only the display keys are added.
  await api.patch(`/fields/${collection}/${field}`, { meta });
}
log(`~ ${RELATION_DISPLAYS.length} team, competition and season links show names`);
for (const { collection, field, schema } of SCHEMA_UPDATES) {
  await api.patch(`/fields/${collection}/${field}`, { schema });
  log(`~ ${collection}.${field} default ${schema.default_value}`);
}

console.log('Navigation');
const collections = new Set((await api.get('/collections')).map((c) => c.collection));
for (const [index, { collection, icon, name }] of NAV_FOLDERS.entries()) {
  const meta = { icon, translations: collectionNames(name), collapse: 'open', sort: index + 1, hidden: false };
  if (collections.has(collection)) await api.patch(`/collections/${collection}`, { meta });
  else await api.post('/collections', { collection, meta, schema: null });
  log(`${collections.has(collection) ? '~' : '+'} folder ${name}`);
}
for (const [folder, members] of Object.entries(NAVIGATION)) {
  for (const [index, [collection, singular, plural, note]] of members.entries()) {
    if (!collections.has(collection)) {
      log(`  skipped ${collection} (not in this database)`);
      continue;
    }
    await api.patch(`/collections/${collection}`, {
      meta: { group: folder, sort: index + 1, translations: collectionNames(singular, plural), ...(note ? { note } : {}), ...(DISPLAY_TEMPLATES[collection] ? { display_template: DISPLAY_TEMPLATES[collection] } : {}) },
    });
  }
  log(`~ ${folder}: ${members.map(([, , plural]) => plural).join(', ')}`);
}

console.log('List views and bookmarks');
const shared = await api.get('/presets' + q({ filter: { _and: [{ user: { _null: true } }, { role: { _null: true } }, { collection: { _in: ['people', 'squad_memberships'] } }] }, limit: '-1', fields: 'id,collection,bookmark' }));
for (const preset of PRESETS) {
  const found = shared.find((p) => p.collection === preset.collection && p.bookmark === preset.bookmark);
  const body = { ...preset, user: null, role: null };
  if (found) await api.patch(`/presets/${found.id}`, body);
  else await api.post('/presets', body);
  log(`${found ? '~' : '+'} ${preset.collection}: ${preset.bookmark ?? 'default view'}`);
}
const me = await api.get('/users/me?fields=id');
const personal = await api.get('/presets' + q({ filter: { _and: [{ user: { _eq: me.id } }, { bookmark: { _null: true } }, { collection: { _in: ['people', 'squad_memberships', 'teams'] } }] }, fields: 'id,collection' }));
for (const p of personal) {
  await api.del(`/presets/${p.id}`);
  log(`- your saved ${p.collection} view (reset to the shared view)`);
}

console.log('Permissions');
// Same as cms:bootstrap: the policy's permissions are replaced from access.mjs, falling back
// to collection-level permissions when Directus Core refuses item rules or field limits.
const isRestricted = (e) => e instanceof DirectusError && e.body?.errors?.some((x) => x.extensions?.code === 'RESOURCE_RESTRICTED');
const collectionLevel = (p) => ({ ...p, fields: ['*'], permissions: null, validation: null, presets: null });
for (const name of UPDATED_POLICIES) {
  const [policy] = await api.get('/policies' + q({ filter: { name: { _eq: name } }, fields: 'id' }));
  if (!policy) throw new Error(`Policy "${name}" not found. Run npm run cms:bootstrap first.`);
  const rows = POLICIES[name].permissions.map((p) => ({ ...p, policy: policy.id }));
  const old = await api.get('/permissions' + q({ filter: { policy: { _eq: policy.id } }, fields: 'id', limit: '-1' }));
  if (old.length) await api.del('/permissions', old.map((p) => p.id));
  let core = false;
  try {
    await api.post('/permissions', rows);
  } catch (error) {
    if (!isRestricted(error)) throw error;
    core = true;
    await api.post('/permissions', rows.map(collectionLevel));
  }
  log(`${name}: ${rows.length} permissions${core ? ' (collection level: Core tier)' : ''}`);
}

console.log('\nDone. Reload the admin in your browser (F5) to see the changes.');
