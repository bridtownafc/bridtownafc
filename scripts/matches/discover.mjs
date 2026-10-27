// Finds Bridlington Town's ids in Football Web Pages, for FWP_TEAM_ID in .env.
// Needs FWP_API_KEY. Saves the full response to .cache/matches/raw/ for checking.
// Usage: npm run matches:discover
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { discover } from './providers/football-web-pages.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const { found, raw } = await discover({ env: process.env });
await mkdir('.cache/matches/raw', { recursive: true });
await writeFile('.cache/matches/raw/competitions.json', JSON.stringify(raw, null, 2));
console.log(found.length ? found.map((f) => JSON.stringify(f)).join('\n') : 'Nothing named Bridlington found; check .cache/matches/raw/competitions.json.');
