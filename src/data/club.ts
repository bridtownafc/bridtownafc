// Verified club details used across the site. Only facts confirmed by the club or an
// official source are recorded here; anything else stays out until the club supplies it.
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
 * Ground name and address confirmed by the club on 27 Oct 2026. (The ticket portal's own
 * organisation details still name the ground's former sponsor; that is for the club to update.)
 * Telephone from the ticket portal's published organisation details.
 */
export const VERIFIED_GROUND = {
  name: 'HDM Energies Stadium',
  street: 'Queensgate',
  town: 'Bridlington',
  postcode: 'YO16 7LN',
};
const verified = {
  groundName: VERIFIED_GROUND.name,
  addressLines: [VERIFIED_GROUND.name, VERIFIED_GROUND.street, VERIFIED_GROUND.town, VERIFIED_GROUND.postcode],
  contactPhone: '01262 606879',
  contactEmail: null as string | null,
};

const settings = cmsContent?.siteSettings;
/** CMS address: one line per row (or comma separated). */
const cmsLines = settings?.address?.split(/\r?\n|,\s*/).map((l) => l.trim()).filter(Boolean);

export const club = {
  name: 'Bridlington Town AFC',
  groundName: settings?.groundName ?? verified.groundName,
  addressLines: cmsLines?.length ? cmsLines : verified.addressLines,
  get address() { return this.addressLines.join(', '); },
  contactPhone: settings?.contactPhone ?? verified.contactPhone,
  contactEmail: settings?.contactEmail ?? verified.contactEmail,
  social: settings?.social ?? { facebook: null, instagram: null, x: null, youtube: null },
};

export const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '').replace(/^0/, '+44')}`;
/** Searches for the ground by name and full address, so the pin matches the directions given. */
export const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.address)}`;

/** schema.org data for the club and its ground, used on the Club and Contact pages. */
export const clubStructuredData = (site: URL) => ({
  '@context': 'https://schema.org',
  '@type': 'SportsTeam',
  name: club.name,
  sport: 'Football',
  url: new URL('/', site).toString(),
  logo: new URL('/assets/brand/brid-town-badge-black.png', site).toString(),
  telephone: club.contactPhone,
  ...(club.contactEmail ? { email: club.contactEmail } : {}),
  location: {
    '@type': 'StadiumOrArena',
    name: club.groundName,
    address: {
      '@type': 'PostalAddress',
      streetAddress: club.addressLines.slice(1, -2).join(', ') || VERIFIED_GROUND.street,
      addressLocality: VERIFIED_GROUND.town,
      postalCode: VERIFIED_GROUND.postcode,
      addressCountry: 'GB',
    },
  },
});
