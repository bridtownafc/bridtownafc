// Generates web-optimised 4:5 portrait copies of each team's squad photos.
// Originals in public/assets/teams/<team>/squad/ are only read, never modified.
// Files are named <player-slug>-<camera reference>.jpg, e.g. ahmed-salam-IMG_7935.jpg.
// Usage: npm run images:squad
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { cropFor, writeVariants } from './lib/squad-photos.mjs';

const TEAMS_DIR = 'public/assets/teams';

// Players framed smaller in the original are zoomed in. Each was checked visually.
const FRAMING = {
  'ben-tweed': { zoom: 0.74, centreX: 0.51 },
  'casey-stewart': { zoom: 0.7, centreX: 0.5 },
  'joe-pratley': { zoom: 0.8, centreX: 0.5 },
};

for (const team of (await readdir(TEAMS_DIR)).sort()) {
  const SOURCE_DIR = path.join(TEAMS_DIR, team, 'squad');
  if (!(await stat(SOURCE_DIR).catch(() => null))?.isDirectory()) continue;
  const OUTPUT_DIR = path.join(SOURCE_DIR, 'web');
  const files = (await readdir(SOURCE_DIR)).filter((f) => /\.jpe?g$/i.test(f)).sort();
  if (!files.length) continue;
  console.log(`\n${team}`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const manifest = {};
  for (const file of files) {
    // Slug is everything before the camera reference (IMG_1234, EC_1234, …).
    const slug = file.replace(/-[A-Z]+_\d+\.jpe?g$/i, '');
    const source = path.join(SOURCE_DIR, file);
    const region = await cropFor(source, FRAMING[slug]);
    await writeVariants(source, region, OUTPUT_DIR, slug);
    manifest[slug] = { source: file, crop: region };
    console.log(slug.padEnd(18), JSON.stringify(region));
  }
  await writeFile(path.join(OUTPUT_DIR, 'crops.json'), JSON.stringify(manifest, null, 2) + '\n');
}
