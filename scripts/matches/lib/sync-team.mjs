// One team's sync, as a pure-ish function so it can be tested with a fake fetch.
// The previous snapshot is the fallback for everything: if the source is unreachable,
// answers in an unexpected format, or returns a suspicious drop in matches, the matches
// and table are kept exactly as they were and only the sync status records the failure.
import { mergeProviderMatches, leagueTableSchema, matchSchema, snapshotSchema, emptySnapshot } from '../../../src/lib/matches/model.ts';
import { SEASON, TEAM_SOURCES } from '../../../src/lib/matches/sources.ts';
import * as footballWebPages from '../providers/football-web-pages.mjs';

export const PROVIDERS = { [footballWebPages.PROVIDER]: footballWebPages };

export function sourceInfo(team) {
  const s = TEAM_SOURCES[team];
  return { provider: s.provider, name: s.name, method: s.method, url: s.url, attribution: s.attribution };
}

/** Everything the website shows; sync bookkeeping that changes on every attempt is left out. */
export function displayKey(snapshot) {
  const { lastAttemptAt, consecutiveFailures, ...sync } = snapshot.sync;
  return JSON.stringify({ ...snapshot, sync: { ...sync, lastSuccessAt: null, failing: sync.status === 'error' } , table: snapshot.table && { ...snapshot.table, retrievedAt: null } });
}

const describe = (error) => String(error?.message ?? error).slice(0, 500);

/**
 * @param {object} options
 * @param {'mens'|'womens'} options.team
 * @param {object|null} options.previous  last snapshot on disk (already validated), or null
 * @param {object} options.env             FWP_API_KEY etc.
 * @param {typeof fetch} [options.fetch]
 * @param {Date} [options.now]
 * @returns {Promise<{ snapshot: object, changed: boolean, status: string, summary: string, raw?: unknown }>}
 */
export async function syncTeam({ team, previous, env, fetch: fetchImpl = fetch, now = new Date() }) {
  const config = TEAM_SOURCES[team];
  const base = previous ?? emptySnapshot(team, SEASON, sourceInfo(team));
  const current = { ...base, season: SEASON, source: sourceInfo(team) };
  const attemptAt = now.toISOString();
  const finish = (snapshot, status, summary, raw) => {
    const valid = snapshotSchema.parse(snapshot);
    return { snapshot: valid, changed: !previous || displayKey(valid) !== displayKey(previous), status, summary, raw };
  };

  if (config.method !== 'api') {
    return finish({ ...current, sync: { ...current.sync, status: 'not-configured' } }, 'embed', `${config.name} is shown with its official embed; nothing to fetch.`);
  }
  const provider = PROVIDERS[config.provider];
  let fetched;
  try {
    fetched = await provider.fetchTeam({ env, fetch: fetchImpl, season: SEASON, now });
  } catch (error) {
    return failure(error);
  }
  if (fetched === null) {
    return finish({ ...current, sync: { ...current.sync, status: 'not-configured', lastError: null } }, 'not-configured', `${config.name}: no API key or team id configured; existing data kept.`);
  }

  try {
    // Validate every match and the table before anything is merged.
    const matches = fetched.matches.map((m, i) => {
      const parsed = matchSchema.safeParse(m);
      if (!parsed.success) throw new Error(`match ${i} (${m?.id}): ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      return parsed.data;
    });
    const tableResult = fetched.table ? leagueTableSchema.safeParse(fetched.table) : null;
    if (tableResult && !tableResult.success) throw new Error(`league table: ${tableResult.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    const merged = mergeProviderMatches(current.matches, matches, config.provider);
    const table = tableResult?.data ?? current.table;
    const snapshot = {
      ...current,
      matches: merged.matches,
      table,
      sync: { status: 'ok', lastAttemptAt: attemptAt, lastSuccessAt: attemptAt, lastError: null, consecutiveFailures: 0 },
    };
    const { added, updated, removed } = merged.changes;
    return finish(snapshot, 'ok', `${config.name}: ${merged.matches.length} matches (${added} new, ${updated} changed, ${removed} removed)${table ? `, table of ${table.rows.length}` : ''}.`, fetched.raw);
  } catch (error) {
    return failure(error, fetched.raw);
  }

  function failure(error, raw = error?.raw) {
    const snapshot = {
      ...current,
      sync: {
        status: 'error',
        lastAttemptAt: attemptAt,
        lastSuccessAt: current.sync.lastSuccessAt,
        lastError: describe(error),
        consecutiveFailures: current.sync.consecutiveFailures + 1,
      },
    };
    return finish(snapshot, 'error', `${config.name} FAILED: ${describe(error)} Previous data kept.`, raw);
  }
}
