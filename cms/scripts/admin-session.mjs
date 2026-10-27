// Runs several Super Admin CMS steps with a single 2FA code. Signs in once, then runs each
// step with the session token in DIRECTUS_ADMIN_SESSION (never printed or written to disk),
// refreshing it before every step. The session is signed out at the end.
// Usage: npm run cms:admin -- --otp=123456 bootstrap seed workflow
import { spawnSync } from 'node:child_process';
import { client, loadEnv } from './lib/directus.mjs';

const STEPS = {
  bootstrap: 'cms/scripts/bootstrap.mjs',
  seed: 'cms/scripts/seed.mjs',
  fixes: 'cms/scripts/content-fixes.mjs',
  workflow: 'cms/tests/workflow.integration.mjs',
  photo: 'cms/tests/photo-change.integration.mjs',
};
const otp = process.argv.find((a) => a.startsWith('--otp='))?.slice(6);
const steps = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const unknown = steps.filter((s) => !STEPS[s]);
if (!steps.length || unknown.length) {
  console.error(`Usage: npm run cms:admin -- --otp=123456 <${Object.keys(STEPS).join('|')}> ...${unknown.length ? `\nUnknown: ${unknown.join(', ')}` : ''}`);
  process.exit(2);
}

const { url, env } = loadEnv();
const anon = client(url);
let session = await anon.post('/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, mode: 'json', ...(otp ? { otp } : {}) });
console.log('Signed in as the Super Admin.');
let failed = false;
for (const step of steps) {
  session = await anon.post('/auth/refresh', { refresh_token: session.refresh_token, mode: 'json' });
  console.log(`\n=== ${step} ===`);
  const result = spawnSync(process.execPath, [STEPS[step]], { stdio: 'inherit', env: { ...process.env, DIRECTUS_ADMIN_SESSION: session.access_token } });
  if (result.status !== 0) {
    failed = true;
    console.error(`${step} failed (exit ${result.status}); later steps skipped.`);
    break;
  }
}
await anon.post('/auth/logout', { refresh_token: session.refresh_token, mode: 'json' }).catch(() => {});
process.exit(failed ? 1 : 0);
