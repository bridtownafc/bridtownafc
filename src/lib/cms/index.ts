import { CONTENT_SOURCE } from 'astro:env/server';
import { siteContentSchema, type SiteContent } from './schema';

export type { SiteContent, TeamContent } from './schema';

/** Snapshot written by `npm run cms:sync`; absent until a sync has run. */
const SNAPSHOT = '/src/data/cms/content.json';
const snapshots = import.meta.glob<unknown>('/src/data/cms/content.json', { eager: true, import: 'default' });

function loadSnapshot(): SiteContent {
  if (!(SNAPSHOT in snapshots)) {
    throw new Error(`[cms] CONTENT_SOURCE=directus but ${SNAPSHOT} is missing. Run \`npm run build:cms\`, which syncs before building.`);
  }
  const result = siteContentSchema.safeParse(snapshots[SNAPSHOT]);
  if (!result.success) {
    throw new Error(`[cms] ${SNAPSHOT} failed validation:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  return result.data;
}

/**
 * Content managed in Directus, or null when the site is built from the files in src/data
 * (the default). Anything the CMS does not manage yet keeps coming from src/data.
 */
export const cmsContent: SiteContent | null = CONTENT_SOURCE === 'directus' ? loadSnapshot() : null;
