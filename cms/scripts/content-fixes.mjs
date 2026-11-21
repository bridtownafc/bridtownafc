// One-off corrections to content already in the local CMS (seed never overwrites items).
// - The ground is the HDM Energies Stadium, Queensgate, Bridlington, YO16 7LN (confirmed by
//   the club, 27 Oct 2026). Seeded content named former sponsors' names for the ground.
// - Site settings get the confirmed ground and address only if they are empty or out of date.
// Re-runnable: does nothing once corrected. Usage: npm run cms:admin -- --otp=123456 fixes
import { loadEnv, login, q } from './lib/directus.mjs';

const GROUND = 'HDM Energies Stadium';
const ADDRESS = 'HDM Energies Stadium\nQueensgate\nBridlington\nYO16 7LN';
const FORMER = /Hudgell Solicitor Stadium|Mounting Systems Stadium/;
const FORMER_ALL = new RegExp(FORMER.source, 'g');

const { url, env } = loadEnv();
const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
let changes = 0;
for (const [collection, fields] of [['articles', ['summary', 'body']], ['pages', ['summary', 'body']], ['events', ['venue', 'description']], ['fixtures', ['venue']]]) {
  const items = await api.get(`/items/${collection}` + q({ filter: { _or: fields.map((f) => ({ [f]: { _regex: 'Hudgell Solicitor Stadium|Mounting Systems Stadium' } })) }, fields: `id,${fields.join(',')}`, limit: '-1' })).catch(() => []);
  for (const item of items) {
    const patch = Object.fromEntries(fields.filter((f) => typeof item[f] === 'string' && FORMER.test(item[f])).map((f) => [f, item[f].replace(FORMER_ALL, GROUND)]));
    if (!Object.keys(patch).length) continue;
    await api.patch(`/items/${collection}/${item.id}`, patch);
    console.log(`  ~ ${collection} ${item.id}: ground name updated`);
    changes++;
  }
}
const settings = await api.get('/items/site_settings?fields=ground_name,address');
if (!settings?.ground_name || FORMER.test(settings.ground_name) || !settings?.address || FORMER.test(settings.address ?? '')) {
  await api.patch('/items/site_settings', { ground_name: GROUND, address: ADDRESS });
  console.log('  ~ site settings: ground and address set');
  changes++;
}
console.log(changes ? 'Content fixes applied.' : 'Nothing to fix.');
