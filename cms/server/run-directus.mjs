// Runs a Directus CLI command (bootstrap, start, ...) in this process with the
// settings from directus-env.mjs. Started by cms/scripts/windows/*.ps1 under the
// portable Node 22 (Directus's isolated-vm has prebuilt Windows binaries for Node 22).
// Usage: node run-directus.mjs <command> [...args]
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { directusEnv } from './directus-env.mjs';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (!existsSync(envFile)) throw new Error('cms/.env not found. Run `npm run cms:env` first.');
const runtimeDir = process.env.BRIDTOWN_CMS_HOME;
if (!runtimeDir) throw new Error('BRIDTOWN_CMS_HOME is not set; start Directus with cms/scripts/windows/start-cms.ps1.');

Object.assign(process.env, directusEnv(parseEnv(readFileSync(envFile, 'utf8')), runtimeDir));

// Same as `directus <command>`, without the npm update check.
process.argv = [process.argv[0], 'directus', ...process.argv.slice(2)];
await import('@directus/api/cli/run.js');
