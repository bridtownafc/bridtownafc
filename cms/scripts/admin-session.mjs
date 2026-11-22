// Runs several Super Admin CMS steps with a single 2FA code. Signs in once, then runs each
// step with the session token in DIRECTUS_ADMIN_SESSION (never printed or written to disk),
// refreshing it before every step. The session is signed out at the end.
// Usage: npm run cms:admin -- --otp=123456 bootstrap seed workflow
import { spawn } from 'node:child_process';
import { client, loadEnv } from './lib/directus.mjs';

const STEPS = {
  bootstrap: 'cms/scripts/bootstrap.mjs',
  seed: 'cms/scripts/seed.mjs',
  fixes: 'cms/scripts/content-fixes.mjs',
  workflow: 'cms/tests/workflow.integration.mjs',
  photo: 'cms/tests/photo-change.integration.mjs',
  publishing: 'cms/tests/player-publishing.integration.mjs',
  players: 'cms/scripts/player-admin.mjs',
  'players-test': 'cms/tests/player-admin.integration.mjs',
  'admin-check': 'cms/tests/admin-fixes.integration.mjs',
  simplify: 'cms/scripts/admin-simplify.mjs',
  'staff-check': 'cms/tests/staff-roles.integration.mjs',
  'enquiry-check': 'cms/tests/enquiry-delivery.integration.mjs',
  'guide-shots': 'cms/scripts/guide-screenshots.mjs',
  photos: 'cms/scripts/import-squad-photos.mjs',
  browser: 'cms/tests/browser-workflows.integration.mjs',
  'rebuild-check': 'cms/tests/rebuild-trigger.integration.mjs',
  cleanup: 'cms/scripts/remove-test-content.mjs',
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
  // Access tokens last 15 minutes; a longer step asks for a fresh one over IPC when its expires.
  const child = spawn(process.execPath, [STEPS[step]], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: { ...process.env, DIRECTUS_ADMIN_SESSION: session.access_token } });
  child.on('message', async (message) => {
    if (message?.type !== 'refresh') return;
    try {
      session = await anon.post('/auth/refresh', { refresh_token: session.refresh_token, mode: 'json' });
      child.send({ type: 'token', token: session.access_token });
    } catch {
      child.send({ type: 'token', token: null });
    }
  });
  const status = await new Promise((resolve) => child.on('exit', resolve));
  if (status !== 0) {
    failed = true;
    console.error(`${step} failed (exit ${status}); later steps skipped.`);
    break;
  }
}
await anon.post('/auth/logout', { refresh_token: session.refresh_token, mode: 'json' }).catch(() => {});
process.exit(failed ? 1 : 0);
