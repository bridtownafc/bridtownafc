// Where each team's fixtures, results and table come from. Each team has its own source
// and its own snapshot (src/data/matches/<team>.json); they are never combined.
// See docs/MATCH-DATA.md for how each source was verified and what it still needs.
// Plain Node imports this file too: no path aliases or relative imports.

export const SEASON = '2026/27';

export interface TeamSource {
  provider: string;
  name: string;
  /** api: fetched on a schedule and built into the pages. embed: the provider's own widget, loaded in the visitor's browser. */
  method: 'api' | 'embed';
  /** The team's page at the source, linked for attribution. */
  url: string;
  attribution: string;
  /** The team's name as the competition lists it. */
  listedAs: string;
  /** League and division, as named by the competition. */
  league: string;
  /** The official league table page, linked whenever data is unavailable. */
  officialTableUrl: string;
  /** Official fixtures and results page, linked whenever data is unavailable. */
  officialFixturesUrl: string;
  /** How often the scheduler syncs (scripts/matches/scheduler.mjs); null for embeds. */
  refresh: { matchdayMinutes: number; otherwiseMinutes: number } | null;
}

export const TEAM_SOURCES: Record<'mens' | 'womens', TeamSource> = {
  // Football Web Pages provides its API free to non-league clubs for their official website.
  // Key, team ID and competition ID are pending (FWP_API_KEY, FWP_TEAM_ID, FWP_COMPETITION_ID).
  mens: {
    provider: 'football-web-pages',
    name: 'Football Web Pages',
    method: 'api',
    url: 'https://www.footballwebpages.co.uk/bridlington-town',
    attribution: 'Fixtures, results and table supplied by Football Web Pages',
    listedAs: 'Bridlington Town',
    league: 'Pitching In Northern Premier League, East Division',
    officialTableUrl: 'https://www.thenpl.co.uk/tables/east',
    officialFixturesUrl: 'https://www.footballwebpages.co.uk/bridlington-town/fixtures-results',
    refresh: { matchdayMinutes: 15, otherwiseMinutes: 360 },
  },
  // FA Full-Time blocks automated requests and publishes no public API. Its supported route is
  // the code snippets an authorised club or league administrator creates in Full-Time Admin
  // (Media > Code Snippets), which the visitor's browser loads from Full-Time.
  womens: {
    provider: 'fa-full-time',
    name: 'FA Full-Time',
    method: 'embed',
    url: 'https://fulltime.thefa.com/displayTeam.html?id=65157437',
    attribution: 'Fixtures, results and table supplied by FA Full-Time',
    listedAs: 'Bridlington Town FC Rovers Ladies',
    league: "East Riding County Women's Football League, Division 2",
    officialTableUrl: 'https://fulltime.thefa.com/index.html?league=5355055&selectedFixtureGroupKey=1_237951137',
    officialFixturesUrl: 'https://fulltime.thefa.com/displayTeam.html?id=65157437',
    refresh: null,
  },
};

/**
 * FA Full-Time code snippets. Each is optional: the club may receive one combined
 * fixtures-and-results snippet, or separate upcoming-fixtures and recent-results snippets,
 * plus a league table snippet. Values are the snippet's `lrcode`; public, not secrets.
 */
export interface FullTimeCodes { table: string; fixturesResults: string; fixtures: string; results: string }
export const EMPTY_FULLTIME_CODES: FullTimeCodes = { table: '', fixturesResults: '', fixtures: '', results: '' };

/** Used when the CMS has no codes for the women's team. Empty until the snippets are supplied. */
export const WOMENS_FULLTIME_CODES: FullTimeCodes = { ...EMPTY_FULLTIME_CODES };

/**
 * Takes a Full-Time code as staff may paste it: the number alone, or the whole snippet
 * (`var lrcode = '123456789'` or `id="lrep123456789"`). Returns the number, or '' if none.
 */
export function fullTimeCode(input: string | null | undefined): string {
  const text = (input ?? '').trim();
  if (/^[0-9]{5,12}$/.test(text)) return text;
  const match = /lrcode\s*=\s*['"]?([0-9]{5,12})/.exec(text) ?? /lrep([0-9]{5,12})/.exec(text);
  return match ? match[1] : '';
}

/** Finds Bridlington Town in source data, e.g. "Bridlington Town" or "Bridlington Town FC Rovers Ladies". */
export const isClubName = (name: string) => {
  const n = name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return n === 'bridlington town' || n.startsWith('bridlington town ');
};
