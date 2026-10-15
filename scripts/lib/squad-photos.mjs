// Shared squad-photo pipeline: 4:5 portrait crops in three widths, WebP and JPEG.
// Used by scripts/optimise-squad-photos.mjs (photos kept in the repo) and by
// cms/scripts/sync.mjs (photos uploaded through the CMS). Sources are only read.
import path from 'node:path';
import sharp from 'sharp';

// sharp's cache keeps files open, which stops Windows renaming or deleting their folder.
sharp.cache(false);

export const WIDTHS = [400, 800, 1200];
export const RATIO = 5 / 4; // height / width

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

/**
 * Crops are full width and anchored to the top of the backdrop by default.
 * `zoom` is the share of the image width kept, `centreX` the horizontal focal point (0–1).
 */
export async function cropFor(file, { zoom = 1, centreX = 0.5 } = {}) {
  const { width, height } = await sharp(file).metadata();
  const top = Math.round((await stripDepth(file)) * height);
  const cropWidth = Math.floor(Math.min(width * zoom, (height - top) / RATIO));
  const cropHeight = Math.floor(cropWidth * RATIO);
  const left = Math.round(Math.max(0, Math.min(width - cropWidth, width * centreX - cropWidth / 2)));
  return { left, top, width: cropWidth, height: cropHeight };
}

/** Writes `<slug>-<width>.webp` and `.jpg` for every width into `outputDir`. */
export async function writeVariants(source, region, outputDir, slug) {
  const pipeline = sharp(source).rotate().extract(region);
  for (const w of WIDTHS) {
    const resized = pipeline.clone().resize({ width: w, height: Math.round(w * RATIO) });
    await resized.clone().webp({ quality: 78 }).toFile(path.join(outputDir, `${slug}-${w}.webp`));
    await resized.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(path.join(outputDir, `${slug}-${w}.jpg`));
  }
}
