// Writes the content currently kept in src/data as a CMS snapshot, in the same
// shape cms/scripts/sync.mjs produces from Directus. Used to seed Directus and to
// prove the CMS build path renders the site identically.
// Usage: node cms/scripts/export-local-content.mjs [output.json]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteContentSchema } from '../../src/lib/cms/schema.ts';
import { mensFirstTeamPlayers, mensPhotoDir, mensPlaceholderCards, mensTeamNews } from '../../src/data/teams/mens-first-team.ts';
import { womensFirstTeamPlayers, womensPhotoDir, womensPlaceholderCards, womensTeamNews } from '../../src/data/teams/womens-team.ts';
import { commercialOptions } from '../../src/data/site.ts';

const output = process.argv[2] ?? 'src/data/cms/content.json';

const content = siteContentSchema.parse({
  schemaVersion: 1,
  source: 'local',
  generatedAt: new Date().toISOString(),
  teams: {
    mens: { photoDir: mensPhotoDir, placeholderCards: mensPlaceholderCards, players: mensFirstTeamPlayers, news: mensTeamNews },
    womens: { photoDir: womensPhotoDir, placeholderCards: womensPlaceholderCards, players: womensFirstTeamPlayers, news: womensTeamNews },
  },
  commercialOptions,
});

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(content, null, 2) + '\n');
console.log(`Exported ${content.teams.mens.players.length + content.teams.womens.players.length} players, ` +
  `${content.teams.mens.news.length + content.teams.womens.news.length} stories and ${content.commercialOptions.length} packages to ${output}`);
