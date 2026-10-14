/** Logo for unnamed placeholder cards and players awaiting a photo. */
export const PLACEHOLDER_LOGO = '/assets/brand/brid-town-placeholder-logo.png';
const CLUB_BADGE = '/assets/brand/brid-town-badge-black.png';

// Resolved at build time, so adding the placeholder logo file needs no code change.
const hasPlaceholderLogo = Object.keys(import.meta.glob('/public/assets/brand/brid-town-placeholder-logo.png')).length > 0;
if (!hasPlaceholderLogo) {
  console.warn(`[brand] ${PLACEHOLDER_LOGO} not found; using ${CLUB_BADGE} until it is added.`);
}

export const squadLogo = hasPlaceholderLogo ? PLACEHOLDER_LOGO : CLUB_BADGE;
