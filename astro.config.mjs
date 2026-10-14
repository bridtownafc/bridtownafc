import { defineConfig } from 'astro/config';
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
});
