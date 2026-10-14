// Generates web-optimised 4:5 portrait copies of each team's squad photos.
// Originals in public/assets/teams/<team>/squad/ are only read, never modified.
// Files are named <player-slug>-<camera reference>.jpg, e.g. ahmed-salam-IMG_7935.jpg.
// Usage: npm run images:squad
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const TEAMS_DIR = 'public/assets/teams';
const WIDTHS = [400, 800, 1200];
const RATIO = 5 / 4; // height / width

// Crops are full width and anchored to the top of the backdrop by default.
// Players framed smaller in the original are zoomed in: `zoom` is the share of the
// image width kept, `centreX` the horizontal focal point (0–1). Each was checked visually.
const FRAMING = {
  'ben-tweed': { zoom: 0.74, centreX: 0.51 },
  'casey-stewart': { zoom: 0.7, centreX: 0.5 },
  'joe-pratley': { zoom: 0.8, centreX: 0.5 },
};

// Several green-screen originals show the studio's grey/black backdrop edge along the
// top; start the crop below the last row that is mostly not green.
async function stripDepth(file) {
  const { data, info } = await sharp(file).resize({ width: 200 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const nonGreenShare = (y) => {
    let count = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (!(data[i + 1] > data[i] + 25 && data[i + 1] > data[i + 2] + 15)) count++;
    }
    return count / info.width;
  };
  if (nonGreenShare(Math.round(info.height * 0.3)) > 0.8) return 0; // not a green-screen photo
  let row = 0;
  while (row < info.height * 0.15 && nonGreenShare(row) >= 0.45) row++;
  // Allow for the soft edge below the strip.
  return row === 0 ? 0 : (row + 3) / info.height;
}

async function cropFor(file, slug) {
  const { width, height } = await sharp(file).metadata();
  const top = Math.round((await stripDepth(file)) * height);
  const { zoom = 1, centreX = 0.5 } = FRAMING[slug] ?? {};
  const cropWidth = Math.floor(Math.min(width * zoom, (height - top) / RATIO));
  const cropHeight = Math.floor(cropWidth * RATIO);
  const left = Math.round(Math.max(0, Math.min(width - cropWidth, width * centreX - cropWidth / 2)));
  return { left, top, width: cropWidth, height: cropHeight };
}

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
    const region = await cropFor(source, slug);
    const pipeline = sharp(source).rotate().extract(region);
    for (const w of WIDTHS) {
      const resized = pipeline.clone().resize({ width: w, height: Math.round(w * RATIO) });
      await resized.clone().webp({ quality: 78 }).toFile(path.join(OUTPUT_DIR, `${slug}-${w}.webp`));
      await resized.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(path.join(OUTPUT_DIR, `${slug}-${w}.jpg`));
    }
    manifest[slug] = { source: file, crop: region };
    console.log(slug.padEnd(18), JSON.stringify(region));
  }
  await writeFile(path.join(OUTPUT_DIR, 'crops.json'), JSON.stringify(manifest, null, 2) + '\n');
}
