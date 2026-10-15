// Builds the website from Directus: sync published content, then `astro build`
// with CONTENT_SOURCE=directus. Stops at the first failure, so a failed sync
// never produces a build. Usage: npm run build:cms
import { spawnSync } from 'node:child_process';

const run = (args, env = {}) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['cms/scripts/sync.mjs']);
run(['node_modules/astro/astro.js', 'build'], { CONTENT_SOURCE: 'directus' });
