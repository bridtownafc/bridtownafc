// Imports the website's current content (src/data) into the local Directus as
// published items, so a CMS build starts identical to today's site. Squad photo
// originals are uploaded with the crops recorded in each team's web/crops.json.
// Skips anything that already exists (matched by slug or title). Local use only.
// Usage: npm run cms:seed [-- --otp=123456]
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { localContent } from './export-local-content.mjs';
import { loadEnv, login, q } from './lib/directus.mjs';

const { url, env } = loadEnv();
const otp = process.argv.find((a) => a.startsWith('--otp='))?.slice(6);
const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, otp);
const content = localContent();
const log = (...args) => console.log(' ', ...args);

const findOne = async (collection, filter) => (await api.get(`/items/${collection}` + q({ filter, fields: 'id', limit: '1' })))[0];
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SHARED_LINKS = { '/club/': 'club', '/commercial/': 'commercial', '/contact/': 'contact' };
const linkValue = (link) => ('section' in link ? link.section : SHARED_LINKS[link.shared] ?? 'news');

const [squadFolder] = await api.get('/folders' + q({ filter: { name: { _eq: 'Squad photos' } }, fields: 'id' }));
if (!squadFolder) throw new Error('Run `npm run cms:bootstrap` first.');

for (const [teamKey, team] of Object.entries(content.teams)) {
  const teamRecord = await findOne('teams', { key: { _eq: teamKey } });
  if (!teamRecord) throw new Error(`Team ${teamKey} missing. Run \`npm run cms:bootstrap\` first.`);
  await api.patch(`/items/teams/${teamRecord.id}`, { placeholder_cards: team.placeholderCards });
  console.log(`${teamKey}: ${team.placeholderCards} placeholder cards`);

  const sourceDir = path.join('public', team.photoDir);
  const cropsFile = path.join(sourceDir, 'web', 'crops.json');
  const crops = existsSync(cropsFile) ? JSON.parse(await readFile(cropsFile, 'utf8')) : {};

  for (const [index, player] of team.players.entries()) {
    let person = await findOne('people', { slug: { _eq: player.slug } });
    if (!person) {
      let photo = null;
      if (player.photo) {
        const form = new FormData();
        form.append('folder', squadFolder.id);
        form.append('title', player.name);
        form.append('description', player.photo.description);
        const bytes = await readFile(path.join(sourceDir, player.photo.original));
        form.append('file', new Blob([bytes], { type: 'image/jpeg' }), player.photo.original);
        photo = (await api.post('/files', form)).id;
      }
      person = await api.post('/items/people', {
        status: 'published',
        display_name: player.name,
        slug: player.slug,
        photo,
        photo_description: player.photo?.description ?? null,
        photo_crop: player.photo ? crops[player.slug]?.crop ?? null : null,
      });
      log(`+ ${player.name}${photo ? ' (photo)' : ''}`);
    }
    if (!(await findOne('squad_memberships', { _and: [{ person: { _eq: person.id } }, { team: { _eq: teamRecord.id } }] }))) {
      await api.post('/items/squad_memberships', { status: 'published', team: teamRecord.id, person: person.id, kind: 'player', sort: index + 1 });
    }
  }

  for (const [index, story] of team.news.entries()) {
    const slug = slugify(story.title);
    if (await findOne('articles', { slug: { _eq: slug } })) continue;
    await api.post('/items/articles', {
      status: 'published', title: story.title, slug, category: story.category, team: teamRecord.id,
      summary: story.summary, link: linkValue(story.link), sort: index + 1,
    });
    log(`+ article: ${story.title}`);
  }
}

for (const [index, option] of content.commercialOptions.entries()) {
  if (await findOne('sponsorship_packages', { title: { _eq: option.title } })) continue;
  const amount = Number(option.price.replace(/[^0-9.]/g, ''));
  await api.post('/items/sponsorship_packages', {
    status: 'published', title: option.title, category: option.category, price_label: option.price,
    price_amount: Number.isFinite(amount) && amount > 0 ? amount : null, detail: option.detail, sort: index + 1,
  });
  log(`+ package: ${option.title}`);
}

console.log('Seed complete.');
