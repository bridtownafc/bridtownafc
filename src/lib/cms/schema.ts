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
  })
  .strict();

const story = z
  .object({
    category: z.string().trim().min(1),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    link: linkTarget,
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

const commercialOption = z
  .object({
    title: z.string().trim().min(1),
    price: z.string().trim().min(1),
    detail: z.string().trim().min(1),
    category: z.string().trim().min(1),
  })
  .strict();

export const siteContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(['local', 'directus']),
    generatedAt: z.string().datetime(),
    teams: z.object({ mens: teamContent, womens: teamContent }).strict(),
    commercialOptions: z.array(commercialOption),
  })
  .strict();

export type SiteContent = z.infer<typeof siteContentSchema>;
export type TeamContent = SiteContent['teams']['mens'];
