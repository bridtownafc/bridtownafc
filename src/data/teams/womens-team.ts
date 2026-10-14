// Women's first-team data. Kept separate from the men's first team (mens-first-team.ts).
// Only verified information is recorded: names as supplied by the club. Positions, squad
// numbers, biographies and statistics are intentionally absent until supplied and verified.
// No women's fixtures, league details or news have been supplied yet.
//
// Photos: originals go in public/assets/teams/womens-first-team/squad/ and web copies are
// generated with `npm run images:squad`. A player without `photo` shows the club logo.
// Requested photo references from the club are noted beside each player; none of the
// files were present when this list was created, so no photo is mapped yet.
import type { Player, Story } from './types';

export const womensPhotoDir = '/assets/teams/womens-first-team/squad';

export const womensFirstTeamPlayers: Player[] = [
  { slug: 'brooke-stephenson', name: 'Brooke Stephenson' }, // requested EC_6318 — not yet found by the club
  { slug: 'jess-corner', name: 'Jess Corner' }, // EC_6339
  { slug: 'jordan-stephenson', name: 'Jordan Stephenson' }, // EC_6500
  { slug: 'kate-bowers', name: 'Kate Bowers' }, // EC_6596
  { slug: 'macy-crabtree', name: 'Macy Crabtree' }, // EC_6417
  { slug: 'naomi-mainprize', name: 'Naomi Mainprize' }, // EC_6327
  { slug: 'piper-robinson', name: 'Piper Robinson' }, // EC_6433
  { slug: 'rene-carmichael', name: 'Rene Carmichael' }, // EC_6403
];

export const womensTeamNews: Story[] = [];
