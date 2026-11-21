// Backs up the CMS database (pg_dump, custom format) and checks the copy can be read.
// Media files are in %LOCALAPPDATA%\BridTownCMS\uploads and need copying alongside it.
// Usage: npm run cms:backup            Restore: see docs/PRODUCTION.md
import { backupDatabase } from './lib/backup.mjs';
import { loadEnv } from './lib/directus.mjs';

const { env } = loadEnv();
const { file, kb, tables } = backupDatabase(env, process.argv[2] ?? 'manual');
console.log(`Backup written and verified: ${file} (${kb} KB, ${tables} tables)`);
