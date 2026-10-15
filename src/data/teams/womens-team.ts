// Women's first-team data. Kept separate from the men's first team (mens-first-team.ts).
// Only verified information is recorded: names as supplied by the club. Positions, squad
// numbers, biographies and statistics are intentionally absent until supplied and verified.
// No women's fixtures, league details or news have been supplied yet.
//
// Photos: originals from the club's "Headshots" Google Drive folder (one sub-folder per
// player), kept unmodified in public/assets/teams/womens-first-team/squad/. Web copies are
// generated with `npm run images:squad`. A player without `photo` shows the club crest.
// Brooke Stephenson's requested EC__6318 is not in the Drive; EC__6549 from her folder is
// used instead, as the one shot matching the squad set (red home shirt, facing camera).
//
// When the site is built from Directus (CONTENT_SOURCE=directus) the CMS is the source of
// truth and this list is not used; it is the default build's content and the seed for the CMS.
import type { Player, Story } from './types';

export const womensPhotoDir = '/assets/teams/womens-first-team/squad';

/** Unnamed "Player to be confirmed" cards shown after the named players. */
export const womensPlaceholderCards = 4;

const redShirt = 'squad portrait in the red club shirt';

export const womensFirstTeamPlayers: Player[] = [
  { slug: 'brooke-stephenson', name: 'Brooke Stephenson', photo: { original: 'brooke-stephenson-EC__6549.jpg', description: redShirt } },
  { slug: 'jess-corner', name: 'Jess Corner', photo: { original: 'jess-corner-EC__6339.jpg', description: redShirt } },
  { slug: 'jordan-stephenson', name: 'Jordan Stephenson', photo: { original: 'jordan-stephenson-EC__6500.jpg', description: redShirt } },
  { slug: 'kate-bowers', name: 'Kate Bowers', photo: { original: 'kate-bowers-EC__6596.jpg', description: redShirt } },
  { slug: 'macy-crabtree', name: 'Macy Crabtree', photo: { original: 'macy-crabtree-EC__6417.jpg', description: redShirt } },
  { slug: 'naomi-mainprize', name: 'Naomi Mainprize', photo: { original: 'naomi-mainprize-EC__6327.jpg', description: redShirt } },
  { slug: 'piper-robinson', name: 'Piper Robinson', photo: { original: 'piper-robinson-EC__6433.jpg', description: redShirt } },
  { slug: 'rene-carmichael', name: 'Rene Carmichael', photo: { original: 'rene-carmichael-EC__6403.jpg', description: redShirt } },
];

export const womensTeamNews: Story[] = [];
