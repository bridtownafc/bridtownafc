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
  /** Public page for the team at the source, linked for attribution. */
  url: string;
  attribution: string;
  /** The competition the team's league table belongs to, as verified. Null until verified. */
  league: string | null;
  /** How often the scheduler syncs (scripts/matches/scheduler.mjs). */
  refresh: { matchdayMinutes: number; otherwiseMinutes: number } | null;
}

export const TEAM_SOURCES: Record<'mens' | 'womens', TeamSource> = {
  // Verified 27 Oct 2026 on footballwebpages.co.uk/bridlington-town: Northern Premier League
  // East Division 2026/27, plus FA Trophy and other cup ties. Football Web Pages provides its
  // API free to non-league clubs for their official website; it needs a key (FWP_API_KEY).
  mens: {
    provider: 'football-web-pages',
    name: 'Football Web Pages',
    method: 'api',
    url: 'https://www.footballwebpages.co.uk/bridlington-town',
    attribution: 'Fixtures, results and table supplied by Football Web Pages',
    league: 'Northern Premier League East Division',
    refresh: { matchdayMinutes: 15, otherwiseMinutes: 360 },
  },
  // FA Full-Time blocks automated requests (Cloudflare challenge, also on robots.txt), and the
  // FA publishes no public API. Its supported route is the official website widget, which
  // the visitor's browser loads from Full-Time. Codes are created in Full-Time and entered in
  // the CMS (Teams > Women's First Team) or WOMENS_FULLTIME_CODES below.
  womens: {
    provider: 'fa-full-time',
    name: 'FA Full-Time',
    method: 'embed',
    url: 'https://fulltime.thefa.com/displayTeam.html?id=65157437',
    attribution: 'Fixtures, results and table supplied by FA Full-Time',
    league: null,
    refresh: null,
  },
};

/**
 * FA Full-Time website widget codes ("Code for your website" in Full-Time) for the women's
 * team, used when the CMS has none. Public values, not secrets. Empty until generated.
 */
export const WOMENS_FULLTIME_CODES = { fixtures: '', results: '', table: '' };

/** Finds Bridlington Town in source data, e.g. "Bridlington Town" or "Bridlington Town Ladies". */
export const isClubName = (name: string) => {
  const n = name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return n === 'bridlington town' || n.startsWith('bridlington town ');
};
