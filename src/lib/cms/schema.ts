// Shape of the content snapshot the website is built from. Written by
// cms/scripts/sync.mjs (from Directus) or cms/scripts/export-local-content.mjs
// (from src/data), and checked again by the site before any page uses it.
// Plain Node also imports this file (type stripping), so keep it free of path
// aliases and relative imports.
import { z } from 'astro/zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lower-case words separated by hyphens');

const linkTarget = z.union([
  z.object({ section: z.enum(['home', 'matches', 'team', 'news']) }).strict(),
  z.object({ shared: z.string().regex(/^\/[a-z0-9/-]*\/$/), hash: z.string().regex(/^[a-z0-9-]+$/).optional() }).strict(),
]);

const player = z
  .object({
    slug,
    name: z.string().trim().min(1),
    photo: z.object({ original: z.string().min(1), description: z.string().trim().min(1) }).strict().optional(),
    number: z.number().int().min(1).max(99).optional(),
    position: z.enum(['Goalkeeper', 'Defender', 'Midfielder', 'Forward']).optional(),
    /** Markdown. */
    biography: z.string().trim().min(1).optional(),
    captaincy: z.enum(['captain', 'vice_captain']).optional(),
    sponsor: z.object({ name: z.string().trim().min(1), url: z.string().regex(/^https?:\/\/\S+$/).optional() }).strict().optional(),
  })
  .strict();

const image = z.object({ src: z.string().regex(/^\/[A-Za-z0-9/_.-]+$/), alt: z.string().trim(), width: z.number().int().positive(), height: z.number().int().positive() }).strict();

const story = z
  .object({
    category: z.string().trim().min(1),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    link: linkTarget,
    /** Present for full articles: the article page is /<team>/news/<slug>/. */
    slug: slug.optional(),
    /** Markdown. */
    body: z.string().optional(),
    publishedAt: z.string().datetime().optional(),
    image: image.optional(),
  })
  .strict();

const teamContent = z
  .object({
    photoDir: z.string().regex(/^\/[A-Za-z0-9/_-]+$/),
    placeholderCards: z.number().int().min(0).max(24),
    players: z.array(player).superRefine((players, ctx) => {
      const seen = new Set<string>();
      for (const [index, { slug }] of players.entries()) {
        if (seen.has(slug)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'slug'], message: `duplicate player slug "${slug}"` });
        seen.add(slug);
      }
    }),
    news: z.array(story),
  })
  .strict();

// Sponsorship opportunities. Prices are deliberately not part of the website's content:
// visitors are asked to contact the club instead.
const commercialOption = z
  .object({
    title: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    category: z.string().trim().min(1),
  })
  .strict();

const sponsor = z
  .object({
    name: z.string().trim().min(1),
    tier: z.string().trim().min(1),
    logo: image.nullable(),
    websiteUrl: z.string().url().nullable(),
    description: z.string().nullable(),
  })
  .strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const goals = z.number().int().min(0).max(99);

/** A correction to an imported match, or a match the source does not list (MatchOverride in src/lib/matches/model.ts). */
const matchOverride = z
  .object({
    cmsId: z.union([z.string(), z.number()]),
    matchId: z.string().nullable(),
    date: isoDate.nullable(),
    kickoff: z.string().datetime().nullable(),
    competition: z.object({ name: z.string().min(1), kind: z.enum(['league', 'cup', 'friendly', 'other']) }).strict().nullable(),
    venueType: z.enum(['home', 'away', 'neutral']).nullable(),
    opponent: z.string().min(1).nullable(),
    venue: z.string().nullable(),
    status: z.enum(['scheduled', 'live', 'finished', 'postponed', 'cancelled', 'abandoned', 'awarded', 'void']).nullable(),
    score: z.object({ for: goals, against: goals }).strict().nullable(),
    note: z.string().nullable(),
  })
  .strict();

const tableRow = z
  .object({
    position: z.number().int().min(1), team: z.string().min(1), played: z.number().int(), won: z.number().int(), drawn: z.number().int(), lost: z.number().int(),
    goalsFor: z.number().int(), goalsAgainst: z.number().int(), goalDifference: z.number().int(), points: z.number().int(), isClub: z.boolean(),
  })
  .strict();

/** A league table entered by club staff. Shown only where no automatic table exists, and labelled as such. */
const manualTable = z
  .object({ competition: z.string().min(1), season: z.string().min(1), effectiveAt: z.string().datetime().nullable(), source: z.string().nullable(), rows: z.array(tableRow).min(2) })
  .strict();

const teamMatchData = z
  .object({
    overrides: z.array(matchOverride),
    table: manualTable.nullable(),
    fulltimeCodes: z.object({ table: z.string(), fixturesResults: z.string(), fixtures: z.string(), results: z.string() }).strict(),
  })
  .strict();

const siteSettings = z
  .object({
    groundName: z.string().nullable(),
    address: z.string().nullable(),
    contactEmail: z.string().email().nullable(),
    contactPhone: z.string().nullable(),
    social: z.object({ facebook: z.string().url().nullable(), instagram: z.string().url().nullable(), x: z.string().url().nullable(), youtube: z.string().url().nullable() }).strict(),
  })
  .strict();

export const siteContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(['local', 'directus']),
    generatedAt: z.string().datetime(),
    teams: z.object({ mens: teamContent, womens: teamContent }).strict(),
    commercialOptions: z.array(commercialOption),
    sponsors: z.array(sponsor).optional(),
    siteSettings: siteSettings.nullable().optional(),
    matchData: z.object({ mens: teamMatchData, womens: teamMatchData }).strict().optional(),
  })
  .strict();

export type SiteContent = z.infer<typeof siteContentSchema>;
export type TeamContent = SiteContent['teams']['mens'];
export type Sponsor = z.infer<typeof sponsor>;
export type SiteSettings = z.infer<typeof siteSettings>;
export type TeamMatchData = z.infer<typeof teamMatchData>;
export type ManualTable = z.infer<typeof manualTable>;
