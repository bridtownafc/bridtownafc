// Pulls published content from Directus with the read-only website token and writes
// the snapshot the site is built from (src/data/cms/content.json), plus squad photo
// crops in public/media/cms/. Nothing is replaced unless the whole sync succeeds.
// Usage: npm run cms:sync
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteContentSchema } from '../../src/lib/cms/schema.ts';
import { cropFor, writeVariants } from '../../scripts/lib/squad-photos.mjs';
import { client, loadEnv, q } from './lib/directus.mjs';

const SNAPSHOT = 'src/data/cms/content.json';
const MEDIA_DIR = 'public/media/cms';
const MEDIA_URL = '/media/cms';
const CACHE_DIR = '.cache/cms-media';
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const { url, env } = loadEnv();
if (!env.DIRECTUS_WEBSITE_TOKEN) throw new Error('DIRECTUS_WEBSITE_TOKEN is empty in cms/.env. Run `npm run cms:bootstrap` first.');
const api = client(url, env.DIRECTUS_WEBSITE_TOKEN);

const now = new Date().toISOString();
const today = now.slice(0, 10);
const published = { status: { _eq: 'published' } };
const all = { limit: '-1' };

const [teams, memberships, articles, packages] = await Promise.all([
  api.get('/items/teams' + q({ ...all, fields: 'id,key,placeholder_cards', sort: 'sort' })),
  api.get('/items/squad_memberships' + q({
    ...all,
    filter: { _and: [published, { kind: { _eq: 'player' } }, { person: published }, { _or: [{ left_on: { _null: true } }, { left_on: { _gt: today } }] }] },
    fields: 'sort,team.key,person.slug,person.display_name,person.photo_description,person.photo_crop,' +
      'person.photo.id,person.photo.type,person.photo.filename_download,person.photo.modified_on,person.photo.width,person.photo.height,person.photo.focal_point_x',
    sort: 'sort,person.display_name',
  })),
  api.get('/items/articles' + q({
    ...all,
    filter: { _and: [published, { _or: [{ published_at: { _null: true } }, { published_at: { _lte: now } }] }] },
    fields: 'title,category,summary,link,team.key',
    sort: 'sort,-published_at',
  })),
  api.get('/items/sponsorship_packages' + q({ ...all, filter: published, fields: 'title,category,price_label,detail', sort: 'sort' })),
]);

// --- Squad photos -------------------------------------------------------------------

const exists = (file) => existsSync(file);

/** Downloads an original once per upload/edit and keeps it in .cache. */
async function original(file) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error(`${file.filename_download}: ${file.type} is not a supported photo type`);
  const version = createHash('sha256').update(`${file.id}:${file.modified_on}`).digest('hex').slice(0, 16);
  const cached = path.join(CACHE_DIR, `${file.id}-${version}${path.extname(file.filename_download).toLowerCase() || '.jpg'}`);
  if (!exists(cached)) {
    const response = await api.raw('GET', `/assets/${file.id}`);
    if (!response.ok) throw new Error(`Downloading ${file.filename_download} failed: ${response.status}`);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(`${cached}.part`, Buffer.from(await response.arrayBuffer()));
    await rename(`${cached}.part`, cached);
  }
  return cached;
}

/** A stored crop is used when it fits the image; otherwise crop automatically around the focal point. */
async function regionFor(source, file, storedCrop) {
  const fits = storedCrop && ['left', 'top', 'width', 'height'].every((k) => Number.isInteger(storedCrop[k]) && storedCrop[k] >= 0) &&
    storedCrop.width > 0 && storedCrop.height > 0 &&
    (!file.width || storedCrop.left + storedCrop.width <= file.width) && (!file.height || storedCrop.top + storedCrop.height <= file.height);
  if (fits) return { left: storedCrop.left, top: storedCrop.top, width: storedCrop.width, height: storedCrop.height };
  return cropFor(source, { centreX: file.focal_point_x != null && file.width ? file.focal_point_x / file.width : 0.5 });
}

// Built outside public/ so a running dev server (which watches public/) never sees half a sync.
const staging = '.cache/cms-media-staging';
await rm(staging, { recursive: true, force: true });

const LINKS = { news: { section: 'news' }, matches: { section: 'matches' }, team: { section: 'team' }, club: { shared: '/club/' }, commercial: { shared: '/commercial/' }, contact: { shared: '/contact/' } };

const teamContent = {};
for (const team of teams) {
  const webDir = path.join(staging, 'squad', team.key, 'web');
  await mkdir(webDir, { recursive: true });
  const players = [];
  for (const { person, team: t } of memberships) {
    if (t?.key !== team.key) continue;
    const player = { slug: person.slug, name: person.display_name };
    if (person.photo) {
      const source = await original(person.photo);
      await writeVariants(source, await regionFor(source, person.photo, person.photo_crop), webDir, person.slug);
      player.photo = { original: person.photo.filename_download, description: person.photo_description?.trim() || 'squad portrait' };
    }
    players.push(player);
  }
  teamContent[team.key] = {
    photoDir: `${MEDIA_URL}/squad/${team.key}`,
    placeholderCards: team.placeholder_cards ?? 0,
    players,
    news: articles
      .filter((a) => !a.team || a.team.key === team.key)
      .map((a) => ({ category: a.category, title: a.title, summary: a.summary, link: LINKS[a.link] ?? LINKS.news })),
  };
}

const content = siteContentSchema.parse({
  schemaVersion: 1,
  source: 'directus',
  generatedAt: now,
  teams: teamContent,
  commercialOptions: packages.map((p) => ({ title: p.title, price: p.price_label, detail: p.detail, category: p.category })),
});

// --- Swap in the new snapshot and photos ---------------------------------------------

await mkdir(path.dirname(SNAPSHOT), { recursive: true });
await writeFile(`${SNAPSHOT}.part`, JSON.stringify(content, null, 2) + '\n');
// Folders are never renamed: on Windows a watched folder (dev server, indexer) cannot be.
// New photos are copied in first, then the snapshot that refers to them is replaced, and
// only then are photos no longer referenced removed, so the site never points at a missing file.

/** Windows can briefly lock files (antivirus, search indexer), so file operations are retried. */
async function retry(operation) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}

async function files(dir, base = dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

const fresh = await files(staging);
for (const relative of fresh) {
  await mkdir(path.dirname(path.join(MEDIA_DIR, relative)), { recursive: true });
  await retry(() => copyFile(path.join(staging, relative), path.join(MEDIA_DIR, relative)));
}
await retry(() => rename(`${SNAPSHOT}.part`, SNAPSHOT));
const keep = new Set(fresh);
for (const relative of await files(MEDIA_DIR)) {
  if (!keep.has(relative)) await retry(() => unlink(path.join(MEDIA_DIR, relative)));
}
await rm(staging, { recursive: true, force: true, maxRetries: 5 });

const count = (key) => `${content.teams[key].players.length} players, ${content.teams[key].news.length} stories`;
console.log(`Synced from ${url}: men's ${count('mens')}; women's ${count('womens')}; ${content.commercialOptions.length} packages.`);
