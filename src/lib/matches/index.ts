// Match data for the pages: each team's synced snapshot (src/data/matches/<team>.json),
// with staff corrections from the CMS applied on top when the site is built from Directus.
// Everything is decided at build time; the scheduler rebuilds the site when data changes.
import { cmsContent } from '@/lib/cms';
import {
  applyOverrides, fixtures, isStale, latestResult, nextMatch, otherMatches, results, snapshotSchema,
  type LeagueTable, type Match, type MatchSnapshot, type TeamKey,
} from './model';
import { TEAM_SOURCES, WOMENS_FULLTIME_CODES, type TeamSource } from './sources';

export type { LeagueTable, Match, MatchSnapshot } from './model';
export { isAwaitingResult, outcome } from './model';

const snapshots = import.meta.glob<unknown>('/src/data/matches/*.json', { eager: true, import: 'default' });

function load(team: TeamKey): MatchSnapshot {
  const file = `/src/data/matches/${team}.json`;
  if (!(file in snapshots)) throw new Error(`[matches] ${file} is missing. Run \`npm run matches:sync\`.`);
  const parsed = snapshotSchema.safeParse(snapshots[file]);
  if (!parsed.success) {
    throw new Error(`[matches] ${file} failed validation:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  if (parsed.data.team !== team) throw new Error(`[matches] ${file} holds data for "${parsed.data.team}", not "${team}".`);
  return parsed.data;
}

/** The moment this build was made. Pages say "at the time of the last update", never "live". */
export const BUILT_AT = new Date();

export interface FullTimeCodes { fixtures: string; results: string; table: string }

export interface TeamMatches {
  team: TeamKey;
  source: TeamSource;
  snapshot: MatchSnapshot;
  matches: Match[];
  fixtures: Match[];
  results: Match[];
  other: Match[];
  next: Match | null;
  latest: Match | null;
  table: LeagueTable | null;
  stale: boolean;
  /** Official FA Full-Time widget codes, when the team's data is shown through the embed. */
  embedCodes: FullTimeCodes | null;
  /** Club corrections that could not be applied; reported in the build log. */
  rejectedOverrides: string[];
}

const cache = new Map<TeamKey, TeamMatches>();

export function teamMatches(team: TeamKey): TeamMatches {
  const cached = cache.get(team);
  if (cached) return cached;
  const snapshot = load(team);
  const source = TEAM_SOURCES[team];
  const managed = cmsContent?.matchData?.[team];
  const { matches, rejected } = applyOverrides(snapshot.matches, managed?.overrides ?? []);
  for (const message of rejected) console.warn(`[matches] ${team}: ${message}`);

  // The official automatic table always wins; a staff-entered table is shown only without one.
  const manual = managed?.table;
  const table: LeagueTable | null = snapshot.table ?? (manual ? {
    competition: manual.competition,
    season: manual.season,
    effectiveAt: manual.effectiveAt,
    retrievedAt: manual.effectiveAt ?? cmsContent!.generatedAt,
    sourceUrl: null,
    automatic: false,
    sourceName: 'Bridlington Town AFC',
    notes: manual.source,
    rows: manual.rows,
  } : null);

  const codes = managed?.fulltimeCodes ?? (team === 'womens' ? WOMENS_FULLTIME_CODES : null);
  const embedCodes = source.method === 'embed' && codes && (codes.fixtures || codes.results || codes.table) ? codes : null;

  const value: TeamMatches = {
    team,
    source,
    snapshot,
    matches,
    fixtures: fixtures(matches),
    results: results(matches),
    other: otherMatches(matches),
    next: nextMatch(matches, BUILT_AT),
    latest: latestResult(matches),
    table,
    stale: isStale(snapshot, BUILT_AT),
    embedCodes,
    rejectedOverrides: rejected,
  };
  cache.set(team, value);
  return value;
}

/** True when the page has any fixtures, results or table to show for the team. */
export const hasMatchData = (m: TeamMatches) => m.matches.length > 0 || m.table !== null || m.embedCodes !== null;
