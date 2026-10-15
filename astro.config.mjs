import { defineConfig, envField } from 'astro/config';
import { mensFirstTeamPlayers } from './src/data/teams/mens-first-team.ts';

// Earlier public routes were all men's first-team content; keep them working.
const legacyRedirects = {
  '/team/': '/mens/team/',
  '/team/mens-first-team/': '/mens/team/',
  '/matches/': '/mens/matches/',
  '/news/': '/mens/news/',
  ...Object.fromEntries(
    mensFirstTeamPlayers.map((player) => [`/team/mens-first-team/${player.slug}/`, `/mens/team/${player.slug}/`]),
  ),
};

export default defineConfig({
  site: 'https://bridtown.com',
  output: 'static',
  trailingSlash: 'always',
  redirects: legacyRedirects,
  env: {
    schema: {
      // `directus` builds from the snapshot written by `npm run cms:sync` (see docs/CMS.md).
      CONTENT_SOURCE: envField.enum({ context: 'server', access: 'public', values: ['local', 'directus'], default: 'local' }),
    },
  },
});
