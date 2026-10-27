// Provider-neutral match data: the shape of each team's snapshot in src/data/matches/
// and the rules for what the website shows. Written by scripts/matches/sync.mjs and
// checked again by the site before any page uses it.
//
// Plain Node imports this file too (type stripping), so keep it free of path aliases,
// relative imports, enums and other syntax that needs compiling.
//
// Rules (docs/MATCH-DATA.md):
// - A match is a result only when the source says it finished AND gives the score.
//   Kick-off time passing never turns a fixture into a result.
// - Each team's data is kept in its own snapshot and never mixed.
// - A failed or suspicious fetch never replaces the last good data.
import { z } from 'astro/zod';

export const TIME_ZONE = 'Europe/London';
export const TEAM_KEYS = ['mens', 'womens'] as const;
export type TeamKey = (typeof TEAM_KEYS)[number];

export const MATCH_STATUSES = ['scheduled', 'live', 'finished', 'postponed', 'cancelled', 'abandoned', 'awarded', 'void'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Statuses that confirm a match is complete. A score is also required. */
const COMPLETE: readonly MatchStatus[] = ['finished', 'awarded'];
/** Still to be played (or being played). */
const PENDING: readonly MatchStatus[] = ['scheduled', 'live', 'postponed'];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const goals = z.number().int().min(0).max(99);
const score = z.object({ for: goals, against: goals }).strict();

export const matchSchema = z
  .object({
    /** Stable across syncs: `<provider>:<external id>`, or `club:<CMS id>` for club-entered matches. */
    id: z.string().regex(/^[a-z0-9-]+:[A-Za-z0-9_.-]+$/),
    provider: z.string().min(1),
    externalId: z.string().min(1),
    /** Calendar date in Europe/London. */
    date: isoDate,
    /** Kick-off instant in UTC, or null while the time is to be confirmed. */
    kickoff: z.string().datetime().nullable(),
    competition: z.object({ name: z.string().trim().min(1), kind: z.enum(['league', 'cup', 'friendly', 'other']) }).strict(),
    venueType: z.enum(['home', 'away', 'neutral']),
    opponent: z.string().trim().min(1),
    venue: z.string().trim().min(1).nullable(),
    status: z.enum(MATCH_STATUSES),
    /** Bridlington Town's goals first. */
    score: score.nullable(),
    penalties: score.nullable(),
    note: z.string().trim().min(1).nullable(),
    sourceUrl: z.string().url().nullable(),
    /** Set when club staff corrected this match in the CMS. */
    override: z.object({ fields: z.array(z.string()).min(1), note: z.string().nullable() }).strict().nullable(),
  })
  .strict()
  .superRefine((match, ctx) => {
    if (COMPLETE.includes(match.status) && !match.score) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['score'], message: `a ${match.status} match needs a score` });
    }
    if ((match.status === 'scheduled' || match.status === 'postponed' || match.status === 'cancelled') && match.score) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['score'], message: `a ${match.status} match cannot have a score` });
    }
    if (match.kickoff && londonDate(match.kickoff) !== match.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kickoff'], message: 'kick-off is not on the match date (Europe/London)' });
    }
  });
export type Match = z.infer<typeof matchSchema>;

const tableRow = z
  .object({
    position: z.number().int().min(1),
    team: z.string().trim().min(1),
    played: z.number().int().min(0),
    won: z.number().int().min(0),
    drawn: z.number().int().min(0),
    lost: z.number().int().min(0),
    goalsFor: z.number().int().min(0),
    goalsAgainst: z.number().int().min(0),
    goalDifference: z.number().int(),
    points: z.number().int(),
    isClub: z.boolean(),
  })
  .strict();

export const leagueTableSchema = z
  .object({
    competition: z.string().trim().min(1),
    season: z.string().trim().min(1),
    /** When the source says the table was correct, if it says. */
    effectiveAt: z.string().datetime().nullable(),
    retrievedAt: z.string().datetime(),
    sourceUrl: z.string().url().nullable(),
    /** True only when the table came from an automatic source. */
    automatic: z.boolean(),
    sourceName: z.string().min(1),
    notes: z.string().nullable(),
    rows: z.array(tableRow).min(2),
  })
  .strict()
  .superRefine((table, ctx) => {
    if (table.rows.filter((r) => r.isClub).length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'the table must contain Bridlington Town exactly once' });
    }
    const positions = table.rows.map((r) => r.position);
    if (new Set(positions).size !== positions.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'duplicate table positions' });
    }
  });
export type LeagueTable = z.infer<typeof leagueTableSchema>;

export const SOURCE_METHODS = ['api', 'embed', 'manual', 'none'] as const;

export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    team: z.enum(TEAM_KEYS),
    season: z.string().min(1),
    source: z
      .object({
        provider: z.string().min(1),
        name: z.string().min(1),
        method: z.enum(SOURCE_METHODS),
        url: z.string().url().nullable(),
        attribution: z.string().min(1),
      })
      .strict(),
    sync: z
      .object({
        status: z.enum(['ok', 'error', 'not-configured']),
        lastAttemptAt: z.string().datetime().nullable(),
        lastSuccessAt: z.string().datetime().nullable(),
        lastError: z.string().nullable(),
        consecutiveFailures: z.number().int().min(0),
      })
      .strict(),
    matches: z.array(matchSchema).superRefine((matches, ctx) => {
      const seen = new Set<string>();
      for (const [index, { id }] of matches.entries()) {
        if (seen.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: `duplicate match "${id}"` });
        seen.add(id);
      }
    }),
    table: leagueTableSchema.nullable(),
  })
  .strict();
export type MatchSnapshot = z.infer<typeof snapshotSchema>;

// --- Europe/London time ---------------------------------------------------------------

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partsAt(instant: number) {
  const parts = Object.fromEntries(londonParts.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, min: +parts.minute, s: +parts.second };
}

/** Minutes Europe/London is ahead of UTC at an instant: 0 (GMT) or 60 (BST). */
export function londonOffsetMinutes(instant: number): number {
  const p = partsAt(instant);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(instant / 1000) * 1000) / 60000);
}

/**
 * Converts a wall-clock time in Bridlington to a UTC ISO string, across both clock
 * changes. In the repeated autumn hour the earlier (BST) instant is used; a time in the
 * skipped spring hour moves forward an hour, as a clock would.
 */
export function londonLocalToUtc(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isInteger) || hh > 23 || mm > 59) throw new Error(`Invalid local date/time: ${date} ${time}`);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const candidates = [60, 0].map((offset) => wall - offset * 60000).filter((utc) => londonOffsetMinutes(utc) * 60000 === wall - utc);
  // No candidate means the time falls in the skipped spring hour: 01:30 reads as 02:30 BST, i.e. 01:30 UTC.
  const utc = candidates.length ? Math.min(...candidates) : wall;
  return new Date(utc).toISOString();
}

/** The Europe/London calendar date (YYYY-MM-DD) of an instant. */
export function londonDate(instant: string | number | Date): string {
  const p = partsAt(new Date(instant).getTime());
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// --- What the website shows --------------------------------------------------------------

/** After this long without a confirmed result, a fixture shows "awaiting result". */
const RESULT_GRACE_MS = 2.5 * 60 * 60 * 1000;

const sortInstant = (m: Match) => (m.kickoff ? Date.parse(m.kickoff) : Date.parse(`${m.date}T12:00:00Z`));

export const isResult = (m: Match) => COMPLETE.includes(m.status) && m.score !== null;

/** A fixture whose kick-off has passed but whose result the source has not confirmed. */
export function isAwaitingResult(m: Match, now: Date): boolean {
  if (m.status !== 'scheduled' && m.status !== 'live') return false;
  if (m.kickoff) return now.getTime() > Date.parse(m.kickoff) + RESULT_GRACE_MS;
  return m.date < londonDate(now);
}

/** Fixtures still to be completed, soonest first: scheduled, live, postponed and awaiting result. */
export const fixtures = (matches: Match[]) =>
  matches.filter((m) => PENDING.includes(m.status)).sort((a, b) => sortInstant(a) - sortInstant(b) || a.id.localeCompare(b.id));

/** Completed matches with a confirmed score, most recent first. */
export const results = (matches: Match[]) =>
  matches.filter(isResult).sort((a, b) => sortInstant(b) - sortInstant(a) || a.id.localeCompare(b.id));

/** Cancelled, abandoned or void matches: neither fixtures nor results. */
export const otherMatches = (matches: Match[]) =>
  matches.filter((m) => !PENDING.includes(m.status) && !isResult(m)).sort((a, b) => sortInstant(b) - sortInstant(a));

/** The next match to be played: live now, or the first scheduled fixture not yet kicked off. */
export function nextMatch(matches: Match[], now: Date): Match | null {
  return fixtures(matches).find((m) => m.status === 'live' || (m.status === 'scheduled' && !isAwaitingResult(m, now))) ?? null;
}

export const latestResult = (matches: Match[]) => results(matches)[0] ?? null;

export type Outcome = 'win' | 'draw' | 'loss';
export function outcome(m: Match): Outcome | null {
  if (!isResult(m) || !m.score) return null;
  if (m.score.for !== m.score.against) return m.score.for > m.score.against ? 'win' : 'loss';
  if (m.penalties) return m.penalties.for > m.penalties.against ? 'win' : 'loss';
  return 'draw';
}

/** Data is stale when the last sync failed or no sync has succeeded for this long. */
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;
export function isStale(snapshot: MatchSnapshot, now: Date): boolean {
  if (snapshot.sync.status === 'not-configured') return false;
  if (snapshot.sync.status === 'error') return true;
  return !snapshot.sync.lastSuccessAt || now.getTime() - Date.parse(snapshot.sync.lastSuccessAt) > STALE_AFTER_MS;
}

// --- Merging --------------------------------------------------------------------------------

export class SuspiciousDataError extends Error {}

const sameFixture = (a: Match, b: Match) =>
  a.date === b.date && a.venueType === b.venueType && a.competition.name === b.competition.name &&
  a.opponent.toLowerCase().replace(/[^a-z0-9]/g, '') === b.opponent.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Replaces one provider's matches with a fresh fetch. The provider is the source of
 * record, so corrected scores, new dates and status changes are taken as given, and a
 * match keeps its id when it is rearranged. Duplicates (same id, or the same fixture
 * listed twice under different ids) are collapsed. A fetch that loses most of the
 * matches previously held is treated as a faulty response and rejected.
 */
export function mergeProviderMatches(previous: Match[], fetched: Match[], provider: string) {
  const byId = new Map<string, Match>();
  for (const match of fetched) {
    if (match.provider !== provider) throw new Error(`Match ${match.id} is not from ${provider}`);
    byId.set(match.id, match);
  }
  const unique: Match[] = [];
  for (const match of byId.values()) {
    const twin = unique.findIndex((other) => sameFixture(other, match));
    if (twin === -1) unique.push(match);
    // Keep the more complete record: a result beats a fixture.
    else if (isResult(match) && !isResult(unique[twin])) unique[twin] = match;
  }

  const held = previous.filter((m) => m.provider === provider);
  if (held.length >= 6 && unique.length < held.length / 2) {
    throw new SuspiciousDataError(`${provider} returned ${unique.length} matches, down from ${held.length}; keeping the previous data.`);
  }

  const before = new Map(held.map((m) => [m.id, JSON.stringify(m)]));
  const changes = { added: 0, updated: 0, removed: 0 };
  for (const match of unique) {
    if (!before.has(match.id)) changes.added++;
    else if (before.get(match.id) !== JSON.stringify(match)) changes.updated++;
  }
  changes.removed = held.filter((m) => !byId.has(m.id)).length;

  const others = previous.filter((m) => m.provider !== provider);
  return { matches: [...others, ...unique].sort((a, b) => sortInstant(a) - sortInstant(b) || a.id.localeCompare(b.id)), changes };
}

/** A correction or an extra match entered by club staff in the CMS. */
export interface MatchOverride {
  /** CMS item id. */
  cmsId: string | number;
  /** `<provider>:<id>` of the imported match being corrected; null for a match the source does not list. */
  matchId: string | null;
  date?: string | null;
  kickoff?: string | null;
  competition?: Match['competition'] | null;
  venueType?: Match['venueType'] | null;
  opponent?: string | null;
  venue?: string | null;
  status?: MatchStatus | null;
  score?: Match['score'];
  note?: string | null;
}

const OVERRIDABLE = ['date', 'kickoff', 'competition', 'venueType', 'opponent', 'venue', 'status', 'score', 'note'] as const;

/**
 * Applies staff corrections on top of imported data at build time. Only the fields
 * staff filled in are replaced, and the match is marked as corrected. A club-entered
 * match without a source id is added as its own match. Invalid results are rejected.
 */
export function applyOverrides(matches: Match[], overrides: MatchOverride[]): { matches: Match[]; rejected: string[] } {
  const out = new Map(matches.map((m) => [m.id, m]));
  const rejected: string[] = [];
  for (const o of overrides) {
    const base = o.matchId ? out.get(o.matchId) : undefined;
    if (o.matchId && !base) {
      rejected.push(`CMS fixture ${o.cmsId}: no imported match ${o.matchId}`);
      continue;
    }
    const fields: string[] = OVERRIDABLE.filter((k) => o[k] !== undefined && o[k] !== null);
    if (base && fields.length === 0) continue;
    const candidate: Record<string, unknown> = {
      ...(base ?? {
        id: `club:${o.cmsId}`,
        provider: 'club',
        externalId: String(o.cmsId),
        kickoff: null,
        venue: null,
        score: null,
        penalties: null,
        note: null,
        sourceUrl: null,
        status: 'scheduled',
      }),
      ...Object.fromEntries(fields.map((k) => [k, o[k as keyof MatchOverride]])),
      override: base ? { fields, note: o.note ?? null } : null,
    };
    if (typeof candidate.kickoff === 'string' && !o.date) candidate.date = londonDate(candidate.kickoff);
    // A match that has not been completed shows no score (an abandoned match may keep the score at abandonment).
    if (!COMPLETE.includes(candidate.status as MatchStatus) && candidate.status !== 'abandoned' && candidate.status !== 'live') candidate.score = null;
    const parsed = matchSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push(`CMS fixture ${o.cmsId}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
      continue;
    }
    out.set(parsed.data.id, parsed.data);
  }
  return { matches: [...out.values()].sort((a, b) => sortInstant(a) - sortInstant(b) || a.id.localeCompare(b.id)), rejected };
}

/** An empty snapshot for a team whose source is not connected yet. */
export function emptySnapshot(team: TeamKey, season: string, source: MatchSnapshot['source']): MatchSnapshot {
  return {
    schemaVersion: 1,
    team,
    season,
    source,
    sync: { status: 'not-configured', lastAttemptAt: null, lastSuccessAt: null, lastError: null, consecutiveFailures: 0 },
    matches: [],
    table: null,
  };
}
