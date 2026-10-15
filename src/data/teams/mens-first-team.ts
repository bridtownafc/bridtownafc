// Men's first-team squad. Kept separate from the women's team data (womens-team.ts).
// Only verified information is recorded here: names as supplied by the club and the
// matching squad photograph. Position, squad number, biography and statistics are
// intentionally absent until they are supplied and verified.
import type { Player, Story } from './types';

/** Originals and generated web copies (scripts/optimise-squad-photos.mjs). */
export const mensPhotoDir = '/assets/teams/mens-first-team/squad';

/** Unnamed "Player to be confirmed" cards shown after the named players. */
export const mensPlaceholderCards = 3;

export const mensTeamNews: Story[] = [
  {
    category: 'Club news',
    title: 'The next chapter for Bridlington Town AFC',
    summary: 'A new digital home is being built for supporters, partners and the wider Bridlington community.',
    link: { section: 'news' },
  },
  {
    category: 'Commercial',
    title: 'Put your business on the touchline',
    summary: 'Discover year-round visibility through perimeter advertising at the Hudgell Solicitor Stadium.',
    link: { shared: '/commercial/' },
  },
  {
    category: 'Community',
    title: 'More than ninety minutes',
    summary: 'The club is creating more ways for local people, organisations and supporters to be involved.',
    link: { shared: '/club/' },
  },
];

const redShirt = 'squad portrait in the red club shirt';

export const mensFirstTeamPlayers: Player[] = [
  { slug: 'ahmed-salam', name: 'Ahmed Salam', photo: { original: 'ahmed-salam-IMG_7935.jpg', description: redShirt } },
  { slug: 'alex-baird', name: 'Alex Baird', photo: { original: 'alex-baird-IMG_8288.jpg', description: 'squad portrait in a lime-green club shirt' } },
  { slug: 'alex-huntsman', name: 'Alex Huntsman', photo: { original: 'alex-huntsman-IMG_8186.jpg', description: redShirt } },
  { slug: 'alex-markham', name: 'Alex Markham', photo: { original: 'alex-markham-IMG_9163.jpg', description: redShirt } },
  { slug: 'ben-tweed', name: 'Ben Tweed', photo: { original: 'ben-tweed-IMG_8125.jpg', description: redShirt } },
  { slug: 'ben-whelan', name: 'Ben Whelan', photo: { original: 'ben-whelan-IMG_8355.jpg', description: redShirt } },
  { slug: 'bill-marshall', name: 'Bill Marshall', photo: { original: 'bill-marshall-IMG_8713.jpg', description: redShirt } },
  { slug: 'casey-stewart', name: 'Casey Stewart', photo: { original: 'casey-stewart-IMG_9065.jpg', description: redShirt } },
  { slug: 'charley-whight', name: 'Charley Whight', photo: { original: 'charley-whight-IMG_9252.jpg', description: redShirt } },
  { slug: 'charlie-birdsall', name: 'Charlie Birdsall', photo: { original: 'charlie-birdsall-IMG_8941.jpg', description: redShirt } },
  { slug: 'destiny', name: 'Destiny', photo: { original: 'destiny-IMG_8436.jpg', description: redShirt } },
  { slug: 'eddie-kettlewell', name: 'Eddie Kettlewell', photo: { original: 'eddie-kettlewell-IMG_8582.jpg', description: redShirt } },
  { slug: 'fanning', name: 'Fanning', photo: { original: 'fanning-IMG_8217.jpg', description: redShirt } },
  { slug: 'joe-batty', name: 'Joe Batty', photo: { original: 'joe-batty-IMG_8083.jpg', description: redShirt } },
  { slug: 'joe-pratley', name: 'Joe Pratley', photo: { original: 'joe-pratley-IMG_8003.jpg', description: redShirt } },
  { slug: 'liam-tibbett', name: 'Liam Tibbett', photo: { original: 'liam-tibbett-IMG_9005.jpg', description: redShirt } },
  { slug: 'luca-bolino', name: 'Luca Bolino', photo: { original: 'luca-bolino-IMG_8644.jpg', description: redShirt } },
  { slug: 'riley-cooper', name: 'Riley Cooper', photo: { original: 'riley-cooper-IMG_8507.jpg', description: redShirt } },
  { slug: 'toby-marriot', name: 'Toby Marriot', photo: { original: 'toby-marriot-IMG_8865.jpg', description: redShirt } },
  { slug: 'tom-allan', name: 'Tom Allan', photo: { original: 'tom-allan-IMG_8784.jpg', description: redShirt } },
];
