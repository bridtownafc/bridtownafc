// Verified club details used across the site. Only facts confirmed from an official
// source are recorded here; anything else stays out until the club supplies it.
// When the site is built from Directus, Site settings in the CMS take precedence.
import { cmsContent } from '@/lib/cms';
import type { TeamId } from './teams/types';

/** Official ticket portal (supplied by the club, 27 Oct 2026). */
export const TICKETS_URL = 'https://bridtownafc.ktckts.com/';

/**
 * Teams whose home matches show a "Buy tickets" action. The portal sells "Match Tickets"
 * but does not list individual matches publicly, so every ticket link goes to the portal
 * home and no match-specific link is invented. Women's tickets are not shown until the
 * club confirms they are sold there. Away tickets are never offered.
 */
export const TICKETED_TEAMS: TeamId[] = ['mens'];

/**
 * From the ticket portal's published organisation details (schema.org data on
 * bridtownafc.ktckts.com, read 27 Oct 2026).
 */
const verified = {
  groundName: 'Mounting Systems Stadium',
  address: 'Mounting Systems Stadium, Bridlington, East Yorkshire, YO16 7LN',
  postcode: 'YO16 7LN',
  contactPhone: '01262 606879',
  contactEmail: null as string | null,
};

const settings = cmsContent?.siteSettings;

export const club = {
  name: 'Bridlington Town AFC',
  groundName: settings?.groundName ?? verified.groundName,
  address: settings?.address ?? verified.address,
  postcode: verified.postcode,
  contactPhone: settings?.contactPhone ?? verified.contactPhone,
  contactEmail: settings?.contactEmail ?? verified.contactEmail,
  social: settings?.social ?? { facebook: null, instagram: null, x: null, youtube: null },
};

export const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '').replace(/^0/, '+44')}`;
export const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.address)}`;
