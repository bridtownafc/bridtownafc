// Keeps match data current on a schedule and rebuilds the website when it changes.
// Local stand-in for the production scheduled job (.github/workflows/match-data.yml).
//
// Schedule (Europe/London, from each team's refresh setting in src/lib/matches/sources.ts):
// - Matchday: every 15 minutes from 12:00 to 23:00 when a team has a fixture today.
// - Otherwise: every 6 hours.
// Rebuild: when what the website shows has changed, and at least every 6 hours so the
// "last checked" time stays current.
//
// How the site is rebuilt (MATCHES_REBUILD in .env):
//   listener  POST to the CMS rebuild listener (npm run cms:listen), which syncs the CMS and builds
//   local     run `astro build` from local content
//   none      sync only
// Usage: npm run matches:watch [-- --once]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fixtures, londonDate, snapshotSchema, TEAM_KEYS } from '../../src/lib/matches/model.ts';
import { TEAM_SOURCES } from '../../src/lib/matches/sources.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const MODE = process.env.MATCHES_REBUILD ?? (existsSync('cms/.env') ? 'listener' : 'local');
const MAX_BUILD_AGE_MS = 6 * 60 * 60 * 1000;
const stamp = () => new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });

let lastBuildAt = 0;

function readSnapshots() {
  return TEAM_KEYS.flatMap((team) => {
    const file = path.join('src/data/matches', `${team}.json`);
    if (!existsSync(file)) return [];
    const parsed = snapshotSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? [parsed.data] : [];
  });
}

/** Minutes until the next sync. */
export function nextInterval(snapshots, now = new Date()) {
  const today = londonDate(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(now));
  let minutes = Infinity;
  for (const team of TEAM_KEYS) {
    const refresh = TEAM_SOURCES[team].refresh;
    if (!refresh) continue;
    const snapshot = snapshots.find((s) => s.team === team);
    const matchday = snapshot && fixtures(snapshot.matches).some((m) => m.date === today && m.status !== 'postponed');
    minutes = Math.min(minutes, matchday && hour >= 12 && hour < 23 ? refresh.matchdayMinutes : refresh.otherwiseMinutes);
  }
  return Number.isFinite(minutes) ? minutes : 360;
}

function sync() {
  const result = spawnSync(process.execPath, ['scripts/matches/sync.mjs'], { encoding: 'utf8' });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  const changed = /CHANGED=(.*)/.exec(result.stdout ?? '')?.[1]?.trim();
  return { ok: result.status === 0, changed: changed ? changed.split(',') : [] };
}

async function rebuild(reason) {
  console.log(`[${stamp()}] rebuilding (${reason}) via ${MODE}`);
  if (MODE === 'none') return true;
  if (MODE === 'listener') {
    process.loadEnvFile('cms/.env');
    const port = process.env.REBUILD_LISTEN_PORT || 4400;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/rebuild`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-rebuild-secret': process.env.REBUILD_HOOK_SECRET ?? '' },
        body: JSON.stringify({ collection: 'match_data', event: 'sync', urgent: true }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return true;
      console.warn(`[${stamp()}] rebuild listener answered ${response.status}`);
    } catch (error) {
      console.warn(`[${stamp()}] rebuild listener unreachable (${error.message}); is \`npm run cms:listen\` running?`);
    }
    return false;
  }
  const build = spawnSync(process.execPath, ['node_modules/astro/astro.js', 'build'], { stdio: 'inherit' });
  return build.status === 0;
}

async function tick() {
  console.log(`[${stamp()}] syncing match data`);
  const { changed } = sync();
  const stale = Date.now() - lastBuildAt > MAX_BUILD_AGE_MS;
  if (changed.length || stale) {
    if (await rebuild(changed.length ? `changed: ${changed.join(', ')}` : 'refresh last-checked time')) lastBuildAt = Date.now();
  }
  const minutes = nextInterval(readSnapshots());
  console.log(`[${stamp()}] next sync in ${minutes} minutes`);
  return minutes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/matches/scheduler.mjs')) {
  if (process.argv.includes('--once')) {
    await tick();
  } else {
    const loop = async () => setTimeout(loop, (await tick()) * 60 * 1000);
    await loop();
  }
}
