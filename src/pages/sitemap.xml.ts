// sitemap.xml: every public page. Redirect-only addresses (old routes, the team chooser)
// are left out. Built with the site, so new players and articles are included automatically.
import type { APIRoute } from 'astro';
import { TEAM_IDS, profileHref, sectionHref, storyHref, teams } from '@/data/teams';

export const GET: APIRoute = ({ site }) => {
  const paths = new Set<string>(['/club/', '/commercial/', '/contact/']);
  for (const id of TEAM_IDS) {
    for (const section of ['home', 'matches', 'team', 'news'] as const) paths.add(sectionHref(id, section));
    for (const player of teams[id].players) paths.add(profileHref(id, player));
    // Club-wide articles appear under both teams; only the canonical (first team listing it) is listed.
    for (const story of teams[id].news) {
      if (!story.slug || !story.body) continue;
      const owner = TEAM_IDS.find((t) => teams[t].news.some((s) => s.slug === story.slug));
      if (owner === id) paths.add(storyHref(id, story));
    }
  }
  const urls = [...paths].sort().map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
