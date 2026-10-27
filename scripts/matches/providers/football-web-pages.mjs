// Football Web Pages API adapter (men's first team).
//
// Documented at https://www.footballwebpages.co.uk/api (reviewed 27 Oct 2026):
//   base URL     https://api.footballwebpages.co.uk/v2/
//   auth         header "FWP-API-Key" (free for non-league clubs' official websites, by email request)
//   rate limit   10 requests a minute; one sync uses 2
//   endpoints    fixtures-results.json?team=ID   league-table.json?team=ID   competitions.json?include=teams
//
// The documentation lists endpoints but not the JSON field names. RESPONSE_SHAPE below is
// therefore UNVERIFIED until checked against the first real response (run
// `npm run matches:sync -- --save-raw` once a key is set and compare .cache/matches/raw/).
// Every response is validated against it: if it does not match, the sync fails, the
// website keeps its last good data, and nothing is guessed.
import { z } from 'astro/zod';
import { isClubName } from '../../../src/lib/matches/sources.ts';
import { londonLocalToUtc } from '../../../src/lib/matches/model.ts';

export const PROVIDER = 'football-web-pages';
export const BASE_URL = 'https://api.footballwebpages.co.uk/v2/';
export const SHAPE_VERIFIED = false;

export class SourceError extends Error {
  constructor(message, { raw, retryable = false } = {}) {
    super(message);
    this.raw = raw;
    this.retryable = retryable;
  }
}

// --- Expected response shape (UNVERIFIED, see above) ----------------------------------------
const side = z.object({ id: z.coerce.string(), name: z.string().min(1), score: z.coerce.number().int().nullable().optional() }).passthrough();
const fwpMatch = z
  .object({
    id: z.coerce.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
    competition: z.object({ name: z.string().min(1), type: z.string().optional() }).passthrough(),
    'home-team': side,
    'away-team': side,
    status: z.object({ short: z.string().optional(), full: z.string().optional() }).passthrough().nullable().optional(),
    venue: z.string().nullable().optional(),
    penalties: z.object({ home: z.coerce.number().int(), away: z.coerce.number().int() }).nullable().optional(),
  })
  .passthrough();
const fixturesResponse = z.object({ 'fixtures-results': z.object({ matches: z.array(fwpMatch) }).passthrough() }).passthrough();

const record = z.object({ played: z.number().int(), won: z.number().int(), drawn: z.number().int(), lost: z.number().int(), for: z.number().int(), against: z.number().int() }).passthrough();
const tableResponse = z
  .object({
    'league-table': z
      .object({
        competition: z.object({ name: z.string().min(1) }).passthrough(),
        teams: z.array(z.object({ position: z.number().int(), name: z.string().min(1), 'all-matches': record, 'total-points': z.number().int() }).passthrough()).min(2),
      })
      .passthrough(),
  })
  .passthrough();

// --- Status mapping -----------------------------------------------------------------------
// Only explicit full-time wording marks a match finished. Anything unrecognised stays a
// fixture, so an unexpected status can never create a result.
const FINISHED = /^(ft|full[ -]?time|aet|a\.e\.t\.|after extra time|pens?|penalties|fin(ished)?)$/i;
const POSTPONED = /^(p ?- ?p|p|postponed|pp)$/i;
const ABANDONED = /^(a ?- ?a|aba|abandoned)$/i;
const CANCELLED = /^(c ?- ?c|can|cancelled|canceled)$/i;
const VOID = /^(void|expunged)$/i;
const AWARDED = /^(awarded|w\/o|walkover)$/i;
const LIVE = /^(ht|half[ -]?time|live|\d{1,3}'?|\d{1,3}\+\d{1,2}'?|1st half|2nd half|et)$/i;

export function mapStatus(raw) {
  const values = [raw?.short, raw?.full].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
  for (const v of values) {
    if (FINISHED.test(v)) return 'finished';
    if (POSTPONED.test(v)) return 'postponed';
    if (ABANDONED.test(v)) return 'abandoned';
    if (CANCELLED.test(v)) return 'cancelled';
    if (VOID.test(v)) return 'void';
    if (AWARDED.test(v)) return 'awarded';
    if (LIVE.test(v)) return 'live';
  }
  return 'scheduled';
}

const competitionKind = (name, type = '') => {
  const text = `${name} ${type}`.toLowerCase();
  if (/friendly/.test(text)) return 'friendly';
  if (/league|division|premier/.test(text) && !/cup|trophy|vase|shield|challenge/.test(text)) return 'league';
  if (/cup|trophy|vase|shield|challenge|round/.test(text)) return 'cup';
  return 'other';
};

const tidyCompetition = (name) => name.replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();

/** Converts one Football Web Pages match to the website's match model, from Bridlington Town's side. */
export function toMatch(raw) {
  const home = raw['home-team'];
  const away = raw['away-team'];
  const clubIsHome = isClubName(home.name);
  if (!clubIsHome && !isClubName(away.name)) throw new SourceError(`Match ${raw.id} does not involve Bridlington Town (${home.name} v ${away.name})`, { raw });
  const status = mapStatus(raw.status);
  const hasScore = Number.isInteger(home.score) && Number.isInteger(away.score);
  const club = clubIsHome ? home : away;
  const opp = clubIsHome ? away : home;
  const scored = status === 'finished' || status === 'awarded' || status === 'live' || status === 'abandoned';
  const time = raw.time && /^\d{1,2}:\d{2}$/.test(raw.time) && raw.time !== '00:00' ? raw.time.padStart(5, '0') : null;
  return {
    id: `${PROVIDER}:${raw.id}`,
    provider: PROVIDER,
    externalId: String(raw.id),
    date: raw.date,
    kickoff: time ? londonLocalToUtc(raw.date, time) : null,
    competition: { name: tidyCompetition(raw.competition.name), kind: competitionKind(raw.competition.name, raw.competition.type) },
    venueType: clubIsHome ? 'home' : 'away',
    opponent: opp.name.trim(),
    venue: raw.venue?.trim() || null,
    // A finished match without both scores is not a confirmed result: keep it as a fixture.
    status: (status === 'finished' || status === 'awarded') && !hasScore ? 'scheduled' : status,
    score: scored && hasScore ? { for: club.score, against: opp.score } : null,
    penalties: raw.penalties ? { for: clubIsHome ? raw.penalties.home : raw.penalties.away, against: clubIsHome ? raw.penalties.away : raw.penalties.home } : null,
    note: null,
    sourceUrl: null,
    override: null,
  };
}

export function toTable(raw, { season, retrievedAt }) {
  const t = raw['league-table'];
  return {
    competition: tidyCompetition(t.competition.name),
    season,
    effectiveAt: null,
    retrievedAt,
    sourceUrl: 'https://www.footballwebpages.co.uk/bridlington-town/league-table',
    automatic: true,
    sourceName: 'Football Web Pages',
    notes: null,
    rows: t.teams.map((row) => ({
      position: row.position,
      team: row.name.trim(),
      played: row['all-matches'].played,
      won: row['all-matches'].won,
      drawn: row['all-matches'].drawn,
      lost: row['all-matches'].lost,
      goalsFor: row['all-matches'].for,
      goalsAgainst: row['all-matches'].against,
      goalDifference: row['all-matches'].for - row['all-matches'].against,
      points: row['total-points'],
      isClub: isClubName(row.name),
    })),
  };
}

function parse(schema, json, what) {
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new SourceError(`Unexpected ${what} response from Football Web Pages (${issues}). The response format may differ from the expected shape; the previous data was kept.`, { raw: json });
  }
  return result.data;
}

/** GET with timeout and up to two retries for network errors and 5xx/429 answers. */
async function get(fetchImpl, endpoint, params, key) {
  const url = new URL(endpoint, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { 'FWP-API-Key': key, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 429 || response.status >= 500) throw new SourceError(`Football Web Pages answered ${response.status} for ${endpoint}`, { retryable: true });
      if (!response.ok) throw new SourceError(`Football Web Pages answered ${response.status} for ${endpoint}${response.status === 400 || response.status === 401 || response.status === 403 ? ' (check FWP_API_KEY and FWP_TEAM_ID)' : ''}`);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new SourceError(`Football Web Pages returned non-JSON for ${endpoint}`, { raw: text.slice(0, 2000) });
      }
    } catch (error) {
      lastError = error instanceof SourceError ? error : new SourceError(`Football Web Pages request failed for ${endpoint}: ${error.message}`, { retryable: true });
      if (!lastError.retryable || attempt === 3) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  throw lastError;
}

/**
 * Fetches the team's fixtures, results and league table.
 * @returns {{ matches: object[], table: object|null, raw: object }}
 */
export async function fetchTeam({ env, fetch: fetchImpl = fetch, season, now = new Date() }) {
  const key = env.FWP_API_KEY;
  const team = env.FWP_TEAM_ID;
  if (!key || !team) return null;
  const fixturesJson = await get(fetchImpl, 'fixtures-results.json', { team }, key);
  const tableJson = await get(fetchImpl, 'league-table.json', { team }, key);
  const raw = { fixtures: fixturesJson, table: tableJson };
  const fixtures = parse(fixturesResponse, fixturesJson, 'fixtures-results');
  const table = parse(tableResponse, tableJson, 'league-table');
  return {
    matches: fixtures['fixtures-results'].matches.map(toMatch),
    table: toTable(table, { season, retrievedAt: now.toISOString() }),
    raw,
  };
}

/** Lists competitions and teams whose name mentions Bridlington, to find FWP_TEAM_ID. */
export async function discover({ env, fetch: fetchImpl = fetch }) {
  if (!env.FWP_API_KEY) throw new Error('Set FWP_API_KEY in .env first.');
  const json = await get(fetchImpl, 'competitions.json', { include: 'teams' }, env.FWP_API_KEY);
  const found = [];
  JSON.stringify(json, (_key, v) => {
    if (v && typeof v === 'object' && typeof v.name === 'string' && /bridlington/i.test(v.name)) found.push(v);
    return v;
  });
  return { found, raw: json };
}
