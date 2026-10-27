// Web copies of the "Pitching In, partners with Northern Premier League" banner for the
// footer. The supplied file (public/assets/partners/pitching-in-npl-logo.png) is kept
// unchanged. It has wide white margins around a red banner, which would show as a white
// box on the black footer, so the copies keep only the banner. Colours are not altered
// and the banner is only resized, never stretched.
// Usage: npm run images:partners
import sharp from 'sharp';

const SOURCE = 'public/assets/partners/pitching-in-npl-logo.png';
const OUT = 'public/assets/partners/pitching-in-npl';
export const WIDTHS = [400, 800];

const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const isRed = (x, y) => { const o = (y * width + x) * channels; return data[o] > 180 && data[o + 1] < 80 && data[o + 2] < 80; };
const rows = [];
for (let y = 0; y < height; y++) {
  let n = 0;
  for (let x = 0; x < width; x++) if (isRed(x, y)) n++;
  if (n > width / 2) rows.push(y);
}
if (rows.length < 50) throw new Error('Red banner not found; has the logo file changed?');
// One pixel inside each edge, so no pale anti-aliased line shows against black.
const top = rows[0] + 1;
const bannerHeight = rows.at(-1) - 1 - top + 1;
const banner = sharp(SOURCE).extract({ left: 0, top, width, height: bannerHeight });
for (const w of WIDTHS) {
  await banner.clone().resize({ width: w }).png({ compressionLevel: 9 }).toFile(`${OUT}-${w}.png`);
  await banner.clone().resize({ width: w }).webp({ quality: 90 }).toFile(`${OUT}-${w}.webp`);
}
console.log(`Banner ${width}x${bannerHeight} (rows ${top} to ${top + bannerHeight - 1}); wrote ${WIDTHS.length * 2} web copies.`);
