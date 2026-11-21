// Applies the content model (cms/schema/collections.mjs) and access rules
// (cms/schema/access.mjs) to the local Directus. Safe to re-run:
// - collections, fields and relations are only added, never changed or deleted;
// - permissions of the policies defined in access.mjs are replaced to match the file;
// - the website's read-only token is created once and stored in cms/.env.
// Usage: npm run cms:bootstrap [-- --otp=123456]   (OTP once the Super Admin has 2FA)
import { randomBytes } from 'node:crypto';
import { COLLECTIONS, COLLECTION_UPDATES, FIELD_UPDATES, FOLDERS } from '../schema/collections.mjs';
import { POLICIES, ROLES, SUPER_ADMIN_ROLE } from '../schema/access.mjs';
import { DirectusError, loadEnv, login, q, setEnvValue } from './lib/directus.mjs';

const WEBSITE_USER_EMAIL = 'website-build@example.com';
const ENQUIRY_USER_EMAIL = 'enquiry-form@example.com';
const EXTENSION = 'directus-extension-brid-publishing';

const { url, env } = loadEnv();
const otp = process.argv.find((a) => a.startsWith('--otp='))?.slice(6);
const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, otp);
const log = (...args) => console.log(' ', ...args);

const missing = async (promise) => promise.then(() => false, (e) => (e instanceof DirectusError && [403, 404].includes(e.status) ? true : Promise.reject(e)));

console.log('Checking server');
const extensions = await api.get('/extensions');
if (!extensions.some((e) => e.name === EXTENSION || e.bundle === EXTENSION || e.schema?.name === EXTENSION)) {
  throw new Error(`${EXTENSION} is not loaded. Publishing rules would not be enforced; check cms/extensions and the Directus logs.`);
}
log(`${EXTENSION} loaded`);

console.log('Project settings');
await api.patch('/settings', {
  project_name: 'Bridlington Town AFC',
  project_descriptor: 'Website content',
  project_color: '#A81C2C',
  default_language: 'en-GB',
  auth_login_attempts: 5,
  auth_password_policy: '/^.{12,}$/',
  public_registration: false,
});
log('login attempts 5 before lock, passwords at least 12 characters, public sign-up off');

console.log('Media folders');
const folders = await api.get('/folders?limit=-1&fields=id,name,parent');
for (const name of FOLDERS) {
  if (folders.some((f) => f.name === name && !f.parent)) continue;
  await api.post('/folders', { name });
  log(`+ ${name}`);
}

console.log('Collections and fields');
const strip = ({ relation, alias, ...rest }) => (alias ? { field: rest.field, type: rest.type, meta: rest.meta } : rest);
const withSort = (fields) => fields.map((f, i) => ({ ...f, meta: { ...f.meta, sort: i + 2 } }));
const PRIMARY_KEY = { field: 'id', type: 'integer', meta: { hidden: true, readonly: true, interface: 'input', sort: 1 }, schema: { is_primary_key: true, has_auto_increment: true } };

for (const def of COLLECTIONS) {
  const fields = withSort(def.fields);
  if (await missing(api.get(`/collections/${def.collection}`))) {
    await api.post('/collections', { collection: def.collection, meta: def.meta, schema: {}, fields: [PRIMARY_KEY, ...fields.map(strip)] });
    log(`+ ${def.collection} (${fields.length} fields)`);
    continue;
  }
  const existing = new Set((await api.get(`/fields/${def.collection}`)).map((f) => f.field));
  for (const f of fields.filter((f) => !existing.has(f.field))) {
    await api.post(`/fields/${def.collection}`, strip(f));
    log(`+ ${def.collection}.${f.field}`);
  }
}

console.log('Field updates');
// The only changes bootstrap makes to existing fields: listed explicitly in collections.mjs.
for (const { collection, field, type, meta, schema } of FIELD_UPDATES) {
  await api.patch(`/fields/${collection}/${field}`, { ...(type ? { type } : {}), meta, ...(schema ? { schema } : {}) });
  log(`~ ${collection}.${field}`);
}
for (const { collection, meta } of COLLECTION_UPDATES) {
  await api.patch(`/collections/${collection}`, { meta });
  log(`~ ${collection}`);
}

console.log('Relations');
const relations = await api.get('/relations');
for (const def of COLLECTIONS) {
  for (const f of def.fields.filter((f) => f.relation)) {
    if (relations.some((r) => r.collection === def.collection && r.field === f.field)) continue;
    await api.post('/relations', { collection: def.collection, field: f.field, ...f.relation });
    log(`+ ${def.collection}.${f.field} → ${f.relation.related_collection}`);
  }
}

console.log('Teams');
for (const [index, team] of [{ key: 'mens', name: "Men's First Team" }, { key: 'womens', name: "Women's First Team" }].entries()) {
  const [found] = await api.get('/items/teams' + q({ filter: { key: { _eq: team.key } }, fields: 'id' }));
  if (found) continue;
  await api.post('/items/teams', { ...team, sort: index + 1 });
  log(`+ ${team.name}`);
}

console.log('Policies and permissions');
// Without a licence (Directus Core tier), permissions with item rules, validation, presets or
// a field subset are refused (403 RESOURCE_RESTRICTED). Then each permission is applied at
// collection level (all fields); brid-publishing still enforces approvals, role scope,
// live-item deletes and file ownership, and cms:sync requests published content and named
// fields only. Re-run after adding a licence key to restore the full rules.
const isRestricted = (e) => e instanceof DirectusError && e.body?.errors?.some((x) => x.extensions?.code === 'RESOURCE_RESTRICTED');
const collectionLevel = (p) => ({ ...p, fields: ['*'], permissions: null, validation: null, presets: null });
let coreMode = false;
const policyIds = {};
for (const [name, { permissions, ...flags }] of Object.entries(POLICIES)) {
  const [found] = await api.get('/policies' + q({ filter: { name: { _eq: name } }, fields: 'id' }));
  const id = found ? (await api.patch(`/policies/${found.id}`, flags)).id : (await api.post('/policies', { name, ...flags })).id;
  policyIds[name] = id;
  const old = await api.get('/permissions' + q({ filter: { policy: { _eq: id } }, fields: 'id', limit: '-1' }));
  if (old.length) await api.del('/permissions', old.map((p) => p.id));
  const rows = permissions.map((p) => ({ ...p, policy: id }));
  if (!coreMode) {
    try {
      await api.post('/permissions', rows);
    } catch (error) {
      if (!isRestricted(error)) throw error;
      coreMode = true;
    }
  }
  if (coreMode) await api.post('/permissions', rows.map(collectionLevel));
  const ruled = permissions.filter((p) => p.permissions || p.validation || p.presets || p.fields.join() !== '*').length;
  log(`${name}: ${permissions.length} permissions${coreMode && ruled ? ` (${ruled} without item rules: Core tier)` : ''}` +
    `${flags.enforce_tfa ? ', 2FA required' : ''}${flags.app_access ? '' : ', API only'}`);
}

console.log('Roles');
const roles = await api.get('/roles?limit=-1&fields=id,name,policies.id,policies.policy.id,policies.policy.admin_access');
const adminRole = roles.find((r) => r.name === SUPER_ADMIN_ROLE) ?? roles.find((r) => r.policies.some((a) => a.policy?.admin_access));
if (!adminRole) throw new Error('No administrator role found.');
await api.patch(`/roles/${adminRole.id}`, { name: SUPER_ADMIN_ROLE, icon: 'shield_person', description: 'Full administration, staff accounts and security.' });
for (const access of adminRole.policies.filter((a) => a.policy?.admin_access)) {
  await api.patch(`/policies/${access.policy.id}`, { name: SUPER_ADMIN_ROLE, enforce_tfa: true });
}
log(`${SUPER_ADMIN_ROLE}: administrator, 2FA required`);

const roleIds = { [SUPER_ADMIN_ROLE]: adminRole.id };
for (const [name, { policies, ...details }] of Object.entries(ROLES)) {
  let role = roles.find((r) => r.name === name);
  if (!role) role = { ...(await api.post('/roles', { name, ...details })), policies: [] };
  else await api.patch(`/roles/${role.id}`, details);
  const wanted = policies.map((p) => policyIds[p]);
  const attached = role.policies.map((a) => a.policy?.id);
  const create = wanted.filter((id) => !attached.includes(id)).map((policy) => ({ policy }));
  const remove = role.policies.filter((a) => !wanted.includes(a.policy?.id)).map((a) => a.id);
  if (create.length || remove.length) await api.patch(`/roles/${role.id}`, { policies: { create, update: [], delete: remove } });
  roleIds[name] = role.id;
  log(`${name}: ${policies.join(' + ')}`);
}

console.log('Website build account');
const [websiteUser] = await api.get('/users' + q({ filter: { email: { _eq: WEBSITE_USER_EMAIL } }, fields: 'id' }));
if (!websiteUser || !env.DIRECTUS_WEBSITE_TOKEN) {
  const token = randomBytes(32).toString('base64url');
  if (websiteUser) await api.patch(`/users/${websiteUser.id}`, { token, role: roleIds.Website });
  else await api.post('/users', { first_name: 'Website', last_name: 'build', email: WEBSITE_USER_EMAIL, role: roleIds.Website, token, status: 'active' });
  await setEnvValue('DIRECTUS_WEBSITE_TOKEN', token);
  log('read-only token created and saved to cms/.env (not printed)');
} else {
  log('exists; token unchanged');
}

console.log('Enquiry form account');
const [enquiryUser] = await api.get('/users' + q({ filter: { email: { _eq: ENQUIRY_USER_EMAIL } }, fields: 'id' }));
if (!enquiryUser || !env.ENQUIRY_FORM_TOKEN) {
  const token = randomBytes(32).toString('base64url');
  if (enquiryUser) await api.patch(`/users/${enquiryUser.id}`, { token, role: roleIds['Enquiry form'] });
  else await api.post('/users', { first_name: 'Enquiry', last_name: 'form', email: ENQUIRY_USER_EMAIL, role: roleIds['Enquiry form'], token, status: 'active' });
  await setEnvValue('ENQUIRY_FORM_TOKEN', token);
  log('create-only token created and saved to cms/.env (not printed)');
} else {
  log('exists; token unchanged');
}

if (coreMode) {
  console.warn(`
WARNING: No licence key, so Directus refused item- and field-level permission rules
  (Core tier). Applied at collection level instead.
  Still enforced: which collections each role can use; approvals, role scope, live-item
  deletes and file ownership (brid-publishing); published-only website sync.
  Read limits inside a collection (Commercial Editors, the website token) are applied by
  brid-publishing to top-level queries.
  NOT enforced until a licence key is added and bootstrap re-run: field limits
  (staff can see colleagues' email addresses), and version/comment ownership.
  Fine for local testing; production needs the Open Innovation Grant key.`);
}
console.log('\nDone. Sign in at http://localhost:8055 and set up 2FA for the Super Admin account.');
