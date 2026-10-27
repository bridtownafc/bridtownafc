// Pulls published content from Directus with the read-only website token and writes
// the snapshot the site is built from (src/data/cms/content.json), plus squad photo
// crops in public/media/cms/. Nothing is replaced unless the whole sync succeeds.
// Usage: npm run cms:sync
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteContentSchema } from '../../src/lib/cms/schema.ts';
import sharp from 'sharp';
import { cropFor, writeVariants } from '../../scripts/lib/squad-photos.mjs';
import { londonDate } from '../../src/lib/matches/model.ts';
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

const [teams, memberships, articles, packages, sponsors, settings, fixtures, tables] = await Promise.all([
  api.get('/items/teams' + q({ ...all, fields: 'id,key,placeholder_cards,fulltime_fixtures_code,fulltime_results_code,fulltime_table_code', sort: 'sort' })),
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
    fields: 'title,slug,category,summary,body,link,published_at,date_created,team.key,hero_image_alt,' +
      'hero_image.id,hero_image.type,hero_image.filename_download,hero_image.modified_on',
    sort: 'sort,-published_at',
  })),
  // Prices (price_label, price_amount) are internal and never requested.
  api.get('/items/sponsorship_packages' + q({ ...all, filter: published, fields: 'title,category,detail', sort: 'sort' })),
  api.get('/items/sponsors' + q({
    ...all,
    filter: { _and: [published, { _or: [{ starts_on: { _null: true } }, { starts_on: { _lte: today } }] }, { _or: [{ ends_on: { _null: true } }, { ends_on: { _gte: today } }] }] },
    fields: 'name,tier,website_url,description,logo.id,logo.type,logo.filename_download,logo.modified_on',
    sort: 'sort,name',
  })),
  api.get('/items/site_settings' + q({ fields: 'ground_name,address,contact_email,contact_phone,facebook_url,instagram_url,x_url,youtube_url' })),
  api.get('/items/fixtures' + q({
    ...all,
    filter: published,
    fields: 'id,team.key,competition.name,opponent,venue_type,venue,kickoff,match_status,score_for,score_against,source_match_id,public_note',
    sort: 'kickoff',
  })),
  api.get('/items/league_tables' + q({
    ...all,
    filter: published,
    fields: 'id,team.key,competition.name,season.name,effective_at,source,rows.position,rows.club_name,rows.is_bridlington,rows.played,rows.won,rows.drawn,rows.lost,rows.goals_for,rows.goals_against,rows.points',
    sort: '-effective_at',
  })),
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

/** Resized copies of a CMS image in staging; returns the website path of the JPEG/PNG (a WebP sits beside it). */
async function webImage(file, dir, name, { width, keepAlpha = false }) {
  const source = await original(file);
  const outDir = path.join(staging, dir);
  await mkdir(outDir, { recursive: true });
  const base = sharp(source).rotate().resize({ width, withoutEnlargement: true });
  const ext = keepAlpha ? 'png' : 'jpg';
  const encoded = keepAlpha ? base.clone().png({ compressionLevel: 9 }) : base.clone().flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true });
  const info = await encoded.toFile(path.join(outDir, `${name}.${ext}`));
  await base.clone().webp({ quality: 82 }).toFile(path.join(outDir, `${name}.webp`));
  return { src: `${MEDIA_URL}/${dir}/${name}.${ext}`, width: info.width, height: info.height };
}

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
    news: [],
  };
}

// Articles: a story with a body gets its own page. Images are processed once per article.
for (const a of articles) {
  const story = { category: a.category, title: a.title, summary: a.summary, link: LINKS[a.link] ?? LINKS.news };
  if (a.body?.trim()) {
    story.slug = a.slug;
    story.body = a.body;
    story.publishedAt = new Date(a.published_at ?? a.date_created).toISOString();
    if (a.hero_image && PHOTO_TYPES.includes(a.hero_image.type)) {
      story.image = { ...(await webImage(a.hero_image, 'news', a.slug, { width: 1600 })), alt: a.hero_image_alt?.trim() ?? '' };
    }
  }
  for (const team of teams) if (!a.team || a.team.key === team.key) teamContent[team.key].news.push(story);
}

const sponsorList = [];
for (const s of sponsors) {
  const name = s.name.trim();
  const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sponsor';
  const logo = s.logo && PHOTO_TYPES.includes(s.logo.type)
    ? { ...(await webImage(s.logo, 'sponsors', file, { width: 480, keepAlpha: true })), alt: `${name} logo` }
    : null;
  const url = /^https?:[/][/]/.test(s.website_url ?? '') ? s.website_url : null;
  sponsorList.push({ name, tier: s.tier, logo, websiteUrl: url, description: s.description?.trim() || null });
}

const blank = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const siteSettings = settings && {
  groundName: blank(settings.ground_name),
  address: blank(settings.address),
  contactEmail: blank(settings.contact_email),
  contactPhone: blank(settings.contact_phone),
  social: { facebook: blank(settings.facebook_url), instagram: blank(settings.instagram_url), x: blank(settings.x_url), youtube: blank(settings.youtube_url) },
};

// Match corrections and club-entered matches; the latest published table per team.
const STATUS = { scheduled: 'scheduled', live: 'live', full_time: 'finished', postponed: 'postponed', abandoned: 'abandoned', cancelled: 'cancelled' };
const kindOf = (name = '') => (/friendly/i.test(name) ? 'friendly' : /cup|trophy|vase|shield/i.test(name) ? 'cup' : /league|division/i.test(name) ? 'league' : 'other');
const matchData = {};
for (const team of teams) {
  const overrides = fixtures.filter((f) => f.team?.key === team.key).map((f) => {
    const scored = Number.isInteger(f.score_for) && Number.isInteger(f.score_against);
    const kickoff = f.kickoff ? new Date(f.kickoff).toISOString() : null;
    return {
      cmsId: f.id,
      matchId: blank(f.source_match_id),
      date: kickoff ? londonDate(kickoff) : null,
      kickoff,
      competition: f.competition?.name ? { name: f.competition.name, kind: kindOf(f.competition.name) } : null,
      venueType: f.venue_type ?? null,
      opponent: blank(f.opponent),
      venue: blank(f.venue),
      status: STATUS[f.match_status] ?? null,
      score: scored ? { for: f.score_for, against: f.score_against } : null,
      note: blank(f.public_note),
    };
  });
  const table = tables.find((t) => t.team?.key === team.key && t.rows?.length >= 2);
  matchData[team.key] = {
    overrides,
    table: table ? {
      competition: table.competition?.name ?? 'League table',
      season: table.season?.name ?? '',
      effectiveAt: table.effective_at ? new Date(table.effective_at).toISOString() : null,
      source: blank(table.source),
      rows: [...table.rows].sort((a, b) => a.position - b.position).map((r) => ({
        position: r.position, team: r.club_name, played: r.played ?? 0, won: r.won ?? 0, drawn: r.drawn ?? 0, lost: r.lost ?? 0,
        goalsFor: r.goals_for ?? 0, goalsAgainst: r.goals_against ?? 0, goalDifference: (r.goals_for ?? 0) - (r.goals_against ?? 0),
        points: r.points ?? 0, isClub: r.is_bridlington === true,
      })),
    } : null,
    fulltimeCodes: { fixtures: team.fulltime_fixtures_code ?? '', results: team.fulltime_results_code ?? '', table: team.fulltime_table_code ?? '' },
  };
}

const content = siteContentSchema.parse({
  schemaVersion: 1,
  source: 'directus',
  generatedAt: now,
  teams: teamContent,
  commercialOptions: packages.map((p) => ({ title: p.title, detail: p.detail, category: p.category })),
  sponsors: sponsorList,
  siteSettings,
  matchData,
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
console.log(`Synced from ${url}: men's ${count('mens')}; women's ${count('womens')}; ${content.commercialOptions.length} packages; ` +
  `${sponsorList.length} sponsors; ${fixtures.length} fixture corrections or club-entered matches.`);
