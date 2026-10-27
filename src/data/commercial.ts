import { cmsContent } from '@/lib/cms';
import type { Sponsor } from '@/lib/cms/schema';
import { commercialOptions as localCommercialOptions } from './site';

/** Sponsorship opportunities: from the CMS snapshot when built from Directus, otherwise src/data/site.ts. No prices. */
export const commercialOptions = cmsContent?.commercialOptions ?? localCommercialOptions;

/** Current, published club partners. Only the CMS supplies these; none are recorded locally. */
export const sponsors: Sponsor[] = cmsContent?.sponsors ?? [];
