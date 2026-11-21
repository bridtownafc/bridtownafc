export type TeamId = 'mens' | 'womens';

/** Team-specific sections. Every team exposes the same set so the switch can map between them. */
export type Section = 'home' | 'matches' | 'team' | 'news';

/** A link that is either inside a team section or to a shared club page (e.g. `/club/`). */
export type LinkTarget = { section: Section } | { shared: string; hash?: string };

export interface SquadPhoto {
  /** Original file supplied by the club, preserved untouched. */
  original: string;
  /** Description of the image for alt text. */
  description: string;
}

export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'] as const;
export type Position = (typeof POSITIONS)[number];

export interface Player {
  slug: string;
  name: string;
  /** Absent until an approved photo is supplied; the club logo is shown instead. */
  photo?: SquadPhoto;
  /** Squad number, position and biography: shown only when the club has entered them in the CMS. */
  number?: number;
  position?: Position;
  /** Markdown. */
  biography?: string;
  captaincy?: 'captain' | 'vice_captain';
  /** The player's sponsor; the link is shown only for a full web address. */
  sponsor?: { name: string; url?: string };
}

export interface Story {
  category: string;
  title: string;
  summary: string;
  link: LinkTarget;
  /** Full articles (from the CMS) have a slug and a Markdown body, and get their own page. */
  slug?: string;
  body?: string;
  publishedAt?: string;
  image?: { src: string; alt: string; width: number; height: number };
}

export interface Team {
  id: TeamId;
  /** Label used in the team switch. */
  label: string;
  /** Full display name, e.g. "Men's First Team". */
  name: string;
  /** Lower-case form for running text and alt text. */
  phrase: string;
  basePath: string;
  photoDir: string;
  players: Player[];
  /** Unnamed "Player to be confirmed" cards shown after the named players. Never linked. */
  placeholderCards: number;
  news: Story[];
  home: { introduction: string };
  squad: { introduction: string; emptyTitle: string; emptyText: string };
  matches: { introduction: string };
  newsPage: { introduction: string; emptyTitle: string; emptyText: string };
}
