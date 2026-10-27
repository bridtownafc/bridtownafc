import { rm } from 'node:fs/promises';
import { defineConfig, envField } from 'astro/config';
import { mensFirstTeamPlayers } from './src/data/teams/mens-first-team.ts';

// Squad photos synced from the CMS live in public/media/cms (git-ignored). Builds from
// src/data never reference them, so leave them out of those builds.
const cmsMediaOnlyInCmsBuilds = {
  name: 'cms-media-only-in-cms-builds',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      if (process.env.CONTENT_SOURCE !== 'directus') await rm(new URL('media/cms/', dir), { recursive: true, force: true });
    },
  },
};

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
  integrations: [cmsMediaOnlyInCmsBuilds],
  env: {
    schema: {
      // `directus` builds from the snapshot written by `npm run cms:sync` (see docs/CMS.md).
      CONTENT_SOURCE: envField.enum({ context: 'server', access: 'public', values: ['local', 'directus'], default: 'local' }),
      // Address of the enquiry relay (cms/scripts/enquiry-relay.mjs). Without it, forms show the club's phone number instead.
      PUBLIC_ENQUIRY_ENDPOINT: envField.string({ context: 'client', access: 'public', optional: true, url: true }),
    },
  },
});
