import { cmsContent } from '@/lib/cms';
import { commercialOptions as localCommercialOptions } from './site';

/** Sponsorship packages: from the CMS snapshot when built from Directus, otherwise src/data/site.ts. */
export const commercialOptions = cmsContent?.commercialOptions ?? localCommercialOptions;
