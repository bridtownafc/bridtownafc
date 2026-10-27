// One-off corrections to content already in the local CMS (seed never overwrites items).
// - The ground is now the Mounting Systems Stadium (club ticket website, 27 Oct 2026);
//   the seeded commercial story still named its former name.
// Re-runnable: does nothing once corrected. Usage: npm run cms:admin -- --otp=123456 fixes
import { loadEnv, login, q } from './lib/directus.mjs';

const { url, env } = loadEnv();
const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
const stale = await api.get('/items/articles' + q({ filter: { summary: { _contains: 'Hudgell Solicitor Stadium' } }, fields: 'id,summary' }));
for (const a of stale) {
  await api.patch(`/items/articles/${a.id}`, { summary: a.summary.replace('Hudgell Solicitor Stadium', 'Mounting Systems Stadium') });
  console.log(`  ~ article ${a.id}: stadium name updated`);
}
console.log(stale.length ? 'Content fixes applied.' : 'Nothing to fix.');
