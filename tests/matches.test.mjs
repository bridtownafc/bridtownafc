import { readFileSync } from 'node:fs';
// Match data: Europe/London time, status rules, merging, failure handling and team separation.
// All match data here is synthetic (fictional opponents) and exists only for these tests.
// Run: npm run test:matches
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyOverrides, fixtures, isAwaitingResult, isStale, latestResult, londonDate, londonLocalToUtc,
  mergeProviderMatches, nextMatch, otherMatches, outcome, results, snapshotSchema, SuspiciousDataError,
} from '../src/lib/matches/model.ts';
import { mapStatus, toMatch } from '../scripts/matches/providers/football-web-pages.mjs';
import { syncTeam } from '../scripts/matches/lib/sync-team.mjs';
import { nextInterval } from '../scripts/matches/scheduler.mjs';
import { fullTimeCode, isClubName } from '../src/lib/matches/sources.ts';

// --- Synthetic Football Web Pages responses (shape as expected by the adapter) ----------------
const raw = (id, date, time, home, away, status = null, scores = [null, null], competition = 'Northern Premier League - East Division') => ({
  id, date, time, competition: { name: competition },
  'home-team': { id: 1, name: home, score: scores[0] }, 'away-team': { id: 2, name: away, score: scores[1] },
  status: status && { short: status }, venue: null,
});
const BRID = 'Bridlington Town';
const tableJson = (clubPosition = 2) => ({
  'league-table': {
    competition: { name: 'Northern Premier League - East Division' },
    teams: [1, 2, 3].map((position) => ({
      position, name: position === clubPosition ? BRID : `Example ${position} FC`,
      'all-matches': { played: 10, won: 5, drawn: 2, lost: 3, for: 15, against: 10 }, 'total-points': 30 - position,
    })),
  },
});
function fakeFetch(fixtures, table = tableJson(), calls = []) {
  return async (url) => {
    calls.push(String(url));
    const body = String(url).includes('fixtures-results') ? { 'fixtures-results': { team: { id: 123, name: BRID }, matches: fixtures } } : table;
    return new Response(JSON.stringify(body), { status: 200 });
  };
}
const env = { FWP_API_KEY: 'test-key', FWP_TEAM_ID: '123', FWP_COMPETITION_ID: '45' };

// --- Europe/London time -----------------------------------------------------------------------
test('kick-off times convert to UTC across British Summer Time', () => {
  assert.equal(londonLocalToUtc('2026-09-05', '15:00'), '2026-09-05T14:00:00.000Z'); // BST
  assert.equal(londonLocalToUtc('2026-10-31', '15:00'), '2026-10-31T15:00:00.000Z'); // GMT, after 25 Oct
  assert.equal(londonLocalToUtc('2026-10-24', '19:45'), '2026-10-24T18:45:00.000Z'); // last BST Saturday
  assert.equal(londonLocalToUtc('2026-10-25', '01:30'), '2026-10-25T00:30:00.000Z'); // repeated hour: earlier instant
  assert.equal(londonLocalToUtc('2027-03-28', '01:30'), '2027-03-28T01:30:00.000Z'); // skipped hour moves forward
  assert.equal(londonLocalToUtc('2027-03-28', '15:00'), '2027-03-28T14:00:00.000Z');
});

test('the match date is the Bridlington calendar date, not the UTC date', () => {
  assert.equal(londonDate('2026-08-01T23:30:00Z'), '2026-08-02');
  assert.equal(londonDate('2026-12-01T23:30:00Z'), '2026-12-01');
});

// --- Status rules -----------------------------------------------------------------------------
test('only explicit full-time statuses mark a match finished; unknown statuses stay fixtures', () => {
  assert.equal(mapStatus({ short: 'FT' }), 'finished');
  assert.equal(mapStatus({ short: 'P - P' }), 'postponed');
  assert.equal(mapStatus({ short: 'A-A' }), 'abandoned');
  assert.equal(mapStatus({ full: 'Cancelled' }), 'cancelled');
  assert.equal(mapStatus({ short: 'HT' }), 'live');
  assert.equal(mapStatus({ short: 'Something new' }), 'scheduled');
  assert.equal(mapStatus(null), 'scheduled');
});

test('a fixture whose kick-off has passed is not a result until the source confirms it', () => {
  const m = toMatch(raw(1, '2026-10-31', '15:00', BRID, 'Example Rovers'));
  const evening = new Date('2026-10-31T20:00:00Z');
  assert.equal(m.status, 'scheduled');
  assert.equal(results([m]).length, 0);
  assert.equal(fixtures([m]).length, 1);
  assert.equal(isAwaitingResult(m, evening), true);
  assert.equal(nextMatch([m], evening), null, 'an unconfirmed past fixture is not the "next match"');
});

test('"FT" without a score is not treated as a result', () => {
  const m = toMatch(raw(2, '2026-10-17', '15:00', 'Example Rovers', BRID, 'FT', [null, null]));
  assert.equal(m.status, 'scheduled');
  assert.equal(results([m]).length, 0);
});

test('scores are recorded from Bridlington Town\'s side, home or away', () => {
  const away = toMatch(raw(3, '2026-10-17', '15:00', 'Example Rovers', BRID, 'FT', [1, 3]));
  assert.deepEqual(away.score, { for: 3, against: 1 });
  assert.equal(away.venueType, 'away');
  assert.equal(away.opponent, 'Example Rovers');
  assert.equal(outcome(away), 'win');
  const cup = toMatch(raw(4, '2026-10-24', '15:00', BRID, 'Example Athletic', 'FT', [2, 2], 'FA Trophy'));
  assert.equal(cup.competition.kind, 'cup');
  assert.equal(cup.competition.name, 'FA Trophy');
});

test('a match not involving Bridlington Town is rejected', () => {
  assert.throws(() => toMatch(raw(5, '2026-10-17', '15:00', 'Example Rovers', 'Example United')));
});

test('postponed matches stay in fixtures; cancelled and abandoned are neither fixtures nor results', () => {
  const p = toMatch(raw(6, '2026-11-14', '15:00', 'Example Rovers', BRID, 'P - P'));
  const c = toMatch(raw(7, '2026-11-21', '15:00', BRID, 'Example United', 'Cancelled'));
  const a = toMatch(raw(8, '2026-11-28', '15:00', BRID, 'Example Town', 'A-A', [1, 0]));
  assert.deepEqual(fixtures([p, c, a]).map((m) => m.status), ['postponed']);
  assert.deepEqual(otherMatches([p, c, a]).map((m) => m.status).sort(), ['abandoned', 'cancelled']);
  assert.equal(results([p, c, a]).length, 0);
});

test('next match and latest result', () => {
  const ms = [
    toMatch(raw(10, '2026-10-17', '15:00', 'Example Rovers', BRID, 'FT', [1, 1])),
    toMatch(raw(11, '2026-10-20', '19:45', BRID, 'Example United', 'FT', [0, 1])),
    toMatch(raw(12, '2026-10-31', '15:00', BRID, 'Example Town')),
    toMatch(raw(13, '2026-11-07', '15:00', 'Example City', BRID)),
  ];
  const now = new Date('2026-10-27T09:00:00Z');
  assert.equal(nextMatch(ms, now).externalId, '12');
  assert.equal(latestResult(ms).externalId, '11');
  assert.deepEqual(results(ms).map((m) => m.externalId), ['11', '10']);
});

// --- Merging ----------------------------------------------------------------------------------
test('corrected scores and rearranged dates update in place without duplicates', () => {
  const first = [toMatch(raw(20, '2026-10-17', '15:00', BRID, 'Example Rovers', 'FT', [2, 1])), toMatch(raw(21, '2026-11-14', '15:00', BRID, 'Example United', 'P - P'))];
  const second = [toMatch(raw(20, '2026-10-17', '15:00', BRID, 'Example Rovers', 'FT', [2, 2])), toMatch(raw(21, '2026-12-01', '19:45', BRID, 'Example United'))];
  const a = mergeProviderMatches([], first, 'football-web-pages').matches;
  const { matches, changes } = mergeProviderMatches(a, second, 'football-web-pages');
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.find((m) => m.externalId === '20').score, { for: 2, against: 2 });
  const rearranged = matches.find((m) => m.externalId === '21');
  assert.equal(rearranged.status, 'scheduled');
  assert.equal(rearranged.date, '2026-12-01');
  assert.deepEqual(changes, { added: 0, updated: 2, removed: 0 });
});

test('the same fixture listed twice is collapsed, preferring the result', () => {
  const fixture = toMatch(raw(30, '2026-10-17', '15:00', BRID, 'Example Rovers'));
  const result = toMatch(raw(31, '2026-10-17', '15:00', BRID, 'Example Rovers', 'FT', [1, 0]));
  const { matches } = mergeProviderMatches([], [fixture, result, fixture], 'football-web-pages');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, 'finished');
});

test('a response that loses most matches is rejected as suspicious', () => {
  const many = Array.from({ length: 10 }, (_, i) => toMatch(raw(40 + i, `2026-09-${String(i + 1).padStart(2, '0')}`, '15:00', BRID, `Example ${i}`)));
  const held = mergeProviderMatches([], many, 'football-web-pages').matches;
  assert.throws(() => mergeProviderMatches(held, many.slice(0, 2), 'football-web-pages'), SuspiciousDataError);
});

// --- Full sync with a fake source ----------------------------------------------------------------
test('sync imports matches and table, then keeps them when the source fails', async () => {
  const now = new Date('2026-10-27T09:00:00Z');
  const ok = await syncTeam({ team: 'mens', previous: null, env, now, fetch: fakeFetch([
    raw(50, '2026-10-17', '15:00', 'Example Rovers', BRID, 'FT', [1, 1]),
    raw(51, '2026-10-31', '15:00', BRID, 'Example Town'),
  ]) });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.snapshot.matches.length, 2);
  assert.equal(ok.snapshot.table.rows.find((r) => r.isClub).position, 2);
  assert.equal(ok.snapshot.table.automatic, true);
  assert.equal(ok.snapshot.sync.lastSuccessAt, now.toISOString());

  const later = new Date('2026-10-27T10:00:00Z');
  const down = await syncTeam({ team: 'mens', previous: ok.snapshot, env, now: later, fetch: async () => new Response('', { status: 503 }) });
  assert.equal(down.status, 'error');
  assert.deepEqual(down.snapshot.matches, ok.snapshot.matches, 'matches are retained');
  assert.deepEqual(down.snapshot.table, ok.snapshot.table, 'table is retained');
  assert.equal(down.snapshot.sync.lastSuccessAt, now.toISOString());
  assert.equal(down.snapshot.sync.consecutiveFailures, 1);
  assert.equal(isStale(down.snapshot, later), true);
  assert.equal(down.changed, true, 'the failure notice reaches the site');
}, { timeout: 30_000 });

test('an unexpected response format keeps the previous data and saves nothing guessed', async () => {
  const good = await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([raw(60, '2026-10-17', '15:00', BRID, 'Example Rovers', 'FT', [3, 0])]) });
  const odd = await syncTeam({ team: 'mens', previous: good.snapshot, env, fetch: async () => new Response(JSON.stringify({ something: 'else' })) });
  assert.equal(odd.status, 'error');
  assert.match(odd.snapshot.sync.lastError, /Unexpected fixtures-results response/);
  assert.deepEqual(odd.snapshot.matches, good.snapshot.matches);
});

test('a table without Bridlington Town is rejected and the previous table kept', async () => {
  const good = await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([]) });
  const wrong = await syncTeam({ team: 'mens', previous: good.snapshot, env, fetch: fakeFetch([], tableJson(99)) });
  assert.equal(wrong.status, 'error');
  assert.deepEqual(wrong.snapshot.table, good.snapshot.table);
});

test('an unchanged sync does not ask for a rebuild', async () => {
  const fx = [raw(70, '2026-10-17', '15:00', BRID, 'Example Rovers', 'FT', [1, 0])];
  const a = await syncTeam({ team: 'mens', previous: null, env, now: new Date('2026-10-27T09:00:00Z'), fetch: fakeFetch(fx) });
  const b = await syncTeam({ team: 'mens', previous: a.snapshot, env, now: new Date('2026-10-27T09:15:00Z'), fetch: fakeFetch(fx) });
  assert.equal(b.changed, false);
});

test('without credentials nothing is fetched and existing data is kept', async () => {
  const calls = [];
  const r = await syncTeam({ team: 'mens', previous: null, env: {}, fetch: fakeFetch([], tableJson(), calls) });
  assert.equal(r.status, 'not-configured');
  assert.equal(calls.length, 0);
});

// --- Team separation -------------------------------------------------------------------------------
test("the women's team never uses the men's source", async () => {
  const calls = [];
  const r = await syncTeam({ team: 'womens', previous: null, env, fetch: fakeFetch([raw(80, '2026-10-17', '15:00', BRID, 'Example Rovers')], tableJson(), calls) });
  assert.equal(calls.length, 0);
  assert.equal(r.snapshot.team, 'womens');
  assert.equal(r.snapshot.source.provider, 'fa-full-time');
  assert.equal(r.snapshot.matches.length, 0);
});

test('a snapshot cannot hold the same match twice', () => {
  const m = toMatch(raw(90, '2026-10-17', '15:00', BRID, 'Example Rovers'));
  const snap = { schemaVersion: 1, team: 'mens', season: '2026/27', source: { provider: 'x', name: 'x', method: 'api', url: null, attribution: 'x' },
    sync: { status: 'ok', lastAttemptAt: null, lastSuccessAt: null, lastError: null, consecutiveFailures: 0 }, matches: [m, m], table: null };
  assert.equal(snapshotSchema.safeParse(snap).success, false);
});

// --- Staff corrections -------------------------------------------------------------------------------
test('staff corrections replace only the fields they set and are marked', () => {
  const m = toMatch(raw(100, '2026-10-17', '15:00', BRID, 'Example Rovers', 'FT', [2, 1]));
  const { matches, rejected } = applyOverrides([m], [{ cmsId: 5, matchId: m.id, score: { for: 2, against: 0 }, note: 'Score corrected by the league' }]);
  assert.deepEqual(rejected, []);
  assert.deepEqual(matches[0].score, { for: 2, against: 0 });
  assert.equal(matches[0].opponent, 'Example Rovers');
  assert.deepEqual(matches[0].override.fields, ['score', 'note']);
});

test('a club-entered match is added; an invalid correction is rejected, not applied', () => {
  const m = toMatch(raw(101, '2026-10-17', '15:00', BRID, 'Example Rovers'));
  const { matches, rejected } = applyOverrides([m], [
    { cmsId: 7, matchId: null, date: '2026-12-26', kickoff: '2026-12-26T15:00:00.000Z', competition: { name: 'Friendly', kind: 'friendly' }, venueType: 'home', opponent: 'Example Select', status: 'scheduled' },
    { cmsId: 8, matchId: m.id, status: 'finished' },
    { cmsId: 9, matchId: 'football-web-pages:999', status: 'postponed' },
  ]);
  assert.equal(matches.length, 2);
  assert.equal(matches.find((x) => x.id === 'club:7').opponent, 'Example Select');
  assert.equal(matches.find((x) => x.id === m.id).status, 'scheduled', 'finished without a score is rejected');
  assert.equal(rejected.length, 2);
});

test('postponing a match through the CMS removes its score', () => {
  const m = toMatch(raw(102, '2026-10-17', '15:00', BRID, 'Example Rovers'));
  const { matches } = applyOverrides([m], [{ cmsId: 10, matchId: m.id, status: 'postponed' }]);
  assert.equal(matches[0].status, 'postponed');
  assert.equal(matches[0].score, null);
});

// --- Scheduling -------------------------------------------------------------------------------------
test('syncs every 15 minutes on a matchday afternoon, otherwise every 6 hours', async () => {
  const today = await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([raw(110, '2026-10-31', '15:00', BRID, 'Example Town')]) });
  assert.equal(nextInterval([today.snapshot], new Date('2026-10-31T14:00:00Z')), 15);
  assert.equal(nextInterval([today.snapshot], new Date('2026-11-01T14:00:00Z')), 360);
});

test('a long wait never runs past the start of a matchday window', async () => {
  const winter = await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([raw(111, '2026-10-31', '15:00', BRID, 'Example Town')]) });
  assert.equal(nextInterval([winter.snapshot], new Date('2026-10-31T08:00:00Z')), 240, 'matchday morning: wait until 12:00 GMT');
  assert.equal(nextInterval([winter.snapshot], new Date('2026-10-31T10:49:00Z')), 71);
  assert.equal(nextInterval([winter.snapshot], new Date('2026-10-30T09:00:00Z')), 360, 'the day before: a normal wait');
  assert.equal(nextInterval([winter.snapshot], new Date('2026-10-31T07:00:00Z')), 300);
  const summer = await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([raw(112, '2026-08-15', '15:00', BRID, 'Example Town')]) });
  assert.equal(nextInterval([summer.snapshot], new Date('2026-08-15T08:00:00Z')), 180, 'British Summer Time: 12:00 BST is 11:00 UTC');
  assert.equal(nextInterval([summer.snapshot], new Date('2026-08-15T11:30:00Z')), 15);
  assert.equal(nextInterval([summer.snapshot], new Date('2026-08-14T22:00:00Z')), 360);
});

// --- Configuration and full-season import ------------------------------------------------------------
test('the table is requested by competition ID, fixtures by team ID, as documented', async () => {
  const calls = [];
  await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([], tableJson(), calls) });
  assert.deepEqual(calls.map((u) => new URL(u).pathname + new URL(u).search), ['/v2/fixtures-results.json?team=123', '/v2/league-table.json?comp=45']);
});

test('without a competition ID the table is not fetched and the previous table is kept', async () => {
  const withTable = await syncTeam({ team: 'mens', previous: null, env, fetch: fakeFetch([]) });
  const calls = [];
  const noComp = await syncTeam({ team: 'mens', previous: withTable.snapshot, env: { ...env, FWP_COMPETITION_ID: '' }, fetch: fakeFetch([], tableJson(), calls) });
  assert.equal(calls.length, 1);
  assert.deepEqual(noComp.snapshot.table, withTable.snapshot.table);
});

test('IDs that are not numbers are refused rather than sent', async () => {
  const r = await syncTeam({ team: 'mens', previous: null, env: { ...env, FWP_TEAM_ID: 'bridlington-town' }, fetch: fakeFetch([]) });
  assert.equal(r.status, 'error');
  assert.match(r.snapshot.sync.lastError, /numeric IDs/);
});

test('a whole season imports: every completed league and cup match and every remaining fixture', async () => {
  const season = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(2026, 7, 8 + i * 4));
    const date = d.toISOString().slice(0, 10);
    season.push(raw(200 + i, date, '15:00', i % 2 ? BRID : `Example ${i}`, i % 2 ? `Example ${i}` : BRID, 'FT', [i % 3, 1], i % 6 === 5 ? 'FA Trophy' : 'Northern Premier League - East Division'));
  }
  for (let i = 0; i < 12; i++) season.push(raw(300 + i, `2026-11-${String(i * 2 + 1).padStart(2, '0')}`, '15:00', BRID, `Example Future ${i}`));
  const r = await syncTeam({ team: 'mens', previous: null, env, now: new Date('2026-10-28T09:00:00Z'), fetch: fakeFetch(season) });
  assert.equal(results(r.snapshot.matches).length, 18);
  assert.equal(results(r.snapshot.matches).filter((m) => m.competition.kind === 'cup').length, 3);
  assert.equal(fixtures(r.snapshot.matches).length, 12);
});

test('FA Full-Time codes are read from the number or from a pasted snippet', () => {
  assert.equal(fullTimeCode('123456789'), '123456789');
  assert.equal(fullTimeCode(`<div id="lrep987654321">Data loading…</div><script>var lrcode = '987654321'</script>`), '987654321');
  assert.equal(fullTimeCode('<div id="lrep55555555"></div>'), '55555555');
  assert.equal(fullTimeCode('not a code'), '');
  assert.equal(fullTimeCode(null), '');
});

test("the ladies' FA Full-Time team name is recognised as the club", () => {
  assert.equal(isClubName('Bridlington Town FC Rovers Ladies'), true);
  assert.equal(isClubName('Bridlington Rovers'), false);
});

// --- Real Football Web Pages responses (extract saved 16 Nov 2026) ------------------------------
const sample = JSON.parse(readFileSync(new URL('./fixtures/football-web-pages-sample.json', import.meta.url), 'utf8'));
const realEnv = { FWP_API_KEY: 'test-key', FWP_TEAM_ID: '288', FWP_COMPETITION_ID: '15' };
const realFetch = (fixtures = sample.fixtures, table = sample.table) => async (url) =>
  new Response(JSON.stringify(String(url).includes('fixtures-results') ? fixtures : table), { status: 200 });

test('real responses: results, an unplayed 0-0 fixture, a postponement and the table map correctly', async () => {
  const r = await syncTeam({ team: 'mens', previous: null, env: realEnv, now: new Date('2026-11-16T09:00:00Z'), fetch: realFetch() });
  assert.equal(r.status, 'ok', r.snapshot.sync.lastError);
  const byId = Object.fromEntries(r.snapshot.matches.map((m) => [m.externalId, m]));
  assert.deepEqual([byId['571567'].status, byId['571567'].venueType, byId['571567'].score], ['finished', 'away', { for: 2, against: 1 }]);
  assert.equal(byId['571567'].competition.kind, 'cup');
  assert.deepEqual([byId['581726'].status, byId['581726'].score, byId['581726'].competition.kind], ['finished', { for: 1, against: 1 }, 'league']);
  // Not yet played: the API sends 0-0 and a kick-off time as the status. It must stay a fixture with no score.
  assert.deepEqual([byId['593801'].status, byId['593801'].score, byId['593801'].kickoff], ['scheduled', null, '2026-11-17T19:45:00.000Z']);
  assert.deepEqual([byId['581955'].status, byId['581955'].score], ['postponed', null]);
  assert.equal(r.snapshot.table.rows.length, 3);
  assert.equal(r.snapshot.table.rows.filter((row) => row.isClub).length, 1);
  assert.equal(r.snapshot.table.competition, 'Northern Premier League East Division');
});

test('an answer for a different team or competition is refused and the previous data kept', async () => {
  const good = await syncTeam({ team: 'mens', previous: null, env: realEnv, now: new Date('2026-11-16T09:00:00Z'), fetch: realFetch() });
  const otherTeam = structuredClone(sample.fixtures);
  otherTeam['fixtures-results'].team = { id: 875, name: 'Penrith' };
  const r1 = await syncTeam({ team: 'mens', previous: good.snapshot, env: realEnv, fetch: realFetch(otherTeam) });
  assert.equal(r1.status, 'error');
  assert.match(r1.snapshot.sync.lastError, /not FWP_TEAM_ID 288/);
  assert.deepEqual(r1.snapshot.matches, good.snapshot.matches);
  const otherComp = structuredClone(sample.table);
  otherComp['league-table'].competition.id = 14;
  const r2 = await syncTeam({ team: 'mens', previous: good.snapshot, env: realEnv, fetch: realFetch(sample.fixtures, otherComp) });
  assert.equal(r2.status, 'error');
  assert.match(r2.snapshot.sync.lastError, /not FWP_COMPETITION_ID 15/);
  assert.deepEqual(r2.snapshot.table, good.snapshot.table);
});
