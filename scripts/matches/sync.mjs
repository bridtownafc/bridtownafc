// Fetches each team's fixtures, results and league table from its source and writes
// src/data/matches/<team>.json. A failed sync never removes data: the snapshot keeps the
// last good matches and table and records the failure, which the website shows as a
// "may be out of date" notice.
//
// Usage: npm run matches:sync [-- --team mens] [--save-raw] [--dry-run]
// Exit codes: 0 synced (or nothing to do), 1 at least one team failed, 2 usage/config error.
// Prints CHANGED=<teams> when what the website shows has changed, for the scheduler.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { snapshotSchema, TEAM_KEYS } from '../../src/lib/matches/model.ts';
import { syncTeam } from './lib/sync-team.mjs';

export const SNAPSHOT_DIR = 'src/data/matches';
const RAW_DIR = '.cache/matches/raw';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

if (existsSync('.env')) process.loadEnvFile('.env');
const only = option('team');
if (only && !TEAM_KEYS.includes(only)) {
  console.error(`Unknown team "${only}". Use one of: ${TEAM_KEYS.join(', ')}`);
  process.exit(2);
}

async function load(team) {
  const file = path.join(SNAPSHOT_DIR, `${team}.json`);
  if (!existsSync(file)) return null;
  const parsed = snapshotSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success) throw new Error(`${file} is invalid; fix or restore it from Git before syncing: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

async function save(team, snapshot) {
  const file = path.join(SNAPSHOT_DIR, `${team}.json`);
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(`${file}.part`, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(`${file}.part`, file);
}

let failed = false;
const changed = [];
for (const team of only ? [only] : TEAM_KEYS) {
  const previous = await load(team);
  const result = await syncTeam({ team, previous, env: process.env });
  console.log(`[${team}] ${result.summary}`);
  if (result.status === 'error') failed = true;
  if (flag('save-raw') && result.raw) {
    await mkdir(RAW_DIR, { recursive: true });
    const file = path.join(RAW_DIR, `${team}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(file, JSON.stringify(result.raw, null, 2));
    console.log(`[${team}] raw response saved to ${file}`);
  }
  if (flag('dry-run')) continue;
  // Bookkeeping (last attempt) is written every time; CHANGED only lists visible changes.
  if (result.changed || result.status !== 'embed') await save(team, result.snapshot);
  if (result.changed) changed.push(team);
}
console.log(`CHANGED=${changed.join(',')}`);
process.exit(failed ? 1 : 0);
