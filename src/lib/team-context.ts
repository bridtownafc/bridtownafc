import { DEFAULT_TEAM, TEAM_IDS, linkFor, type LinkTarget, type Section, type TeamId } from '@/data/teams';

/**
 * Which team a page is rendered for. Team pages take it from their URL (`/mens/…`, `/womens/…`).
 * Shared pages (Club, Commercial, Contact) are rendered once for the default team; a small
 * header script then applies `?team=` or the remembered choice to their team-aware links.
 */
export interface TeamContext {
  team: TeamId;
  shared: boolean;
  section?: Section;
}

export const sharedContext: TeamContext = { team: DEFAULT_TEAM, shared: true };

/** `href` for the current team, plus every team's variant on shared pages for the header script. */
export const teamLink = (ctx: TeamContext, target: LinkTarget) => ({
  href: linkFor(ctx.team, target),
  'data-team-hrefs': ctx.shared ? JSON.stringify(Object.fromEntries(TEAM_IDS.map((id) => [id, linkFor(id, target)]))) : undefined,
});

/** Text that differs per team, swapped by the header script on shared pages. */
export const teamText = (ctx: TeamContext, values: Record<TeamId, string>) => ({
  text: values[ctx.team],
  attrs: { 'data-team-text': ctx.shared ? JSON.stringify(values) : undefined },
});
