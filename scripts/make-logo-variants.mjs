// Builds the club logo variants from the official crest, which is never modified.
//
// The crest's "BRIDLINGTON TOWN A.F.C." lettering is black on a transparent background,
// so it disappears on the site's black surfaces. The dark-background variant recolours
// only that lettering to white. Everything else (supporters, crown, shield, ribbons and
// their colours) is left pixel-for-pixel as supplied.
//
// The lettering is found as the dark, neutral connected regions that lie entirely within
// the scroll at the bottom of the crest. The shield's black quarter and the supporters'
// black markings also reach into that area, but they start higher up, so they are kept.
//
// Outputs (public/assets/brand/):
//   brid-town-badge-on-dark.png            full-size dark-background master
//   brid-town-badge-{light,dark}-{w}.png    web copies for light and dark backgrounds
//   brid-town-badge-{light,dark}-{w}.webp
// Usage: npm run images:logo
import path from 'node:path';
import sharp from 'sharp';

const DIR = 'public/assets/brand';
const SOURCE = path.join(DIR, 'brid-town-badge-black.png');
export const LOGO_WIDTHS = [160, 320, 640];

/** Fraction of the crest's height where the scroll lettering begins. Checked visually. */
const SCROLL_TOP = 0.69;

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// Dark, near-neutral, visible pixels: the lettering's ink and its anti-aliased edges.
const dark = new Uint8Array(width * height);
for (let i = 0; i < width * height; i++) {
  const o = i * 4;
  const [r, g, b, a] = [data[o], data[o + 1], data[o + 2], data[o + 3]];
  const max = Math.max(r, g, b);
  if (a >= 8 && max <= 150 && max - Math.min(r, g, b) <= 40) dark[i] = 1;
}

// Connected regions (8-neighbour); keep those wholly inside the scroll.
const label = new Int32Array(width * height);
const keep = [false];
const scrollTop = Math.round(height * SCROLL_TOP);
let next = 1;
const stack = [];
for (let start = 0; start < width * height; start++) {
  if (!dark[start] || label[start]) continue;
  const id = next++;
  let top = height;
  label[start] = id;
  stack.push(start);
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (y < top) top = y;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (dark[n] && !label[n]) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
  }
  keep[id] = top >= scrollTop;
}

// Lettering mask, grown by 2 px so the outermost anti-aliased edge is included.
const mask = new Uint8Array(width * height);
for (let i = 0; i < width * height; i++) if (label[i] && keep[label[i]]) mask[i] = 1;
const grown = new Uint8Array(mask);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) grown[ny * width + nx] = 1;
      }
    }
  }
}

// Invert the lightness of neutral pixels in the mask: black ink becomes white, grey
// edges stay proportionate, alpha is unchanged. Coloured pixels (the yellow scroll) are skipped.
const out = Buffer.from(data);
let changed = 0;
for (let i = 0; i < width * height; i++) {
  if (!grown[i]) continue;
  const o = i * 4;
  const [r, g, b] = [out[o], out[o + 1], out[o + 2]];
  if (Math.max(r, g, b) - Math.min(r, g, b) > 40) continue;
  out[o] = 255 - r;
  out[o + 1] = 255 - g;
  out[o + 2] = 255 - b;
  changed++;
}
if (changed < 5000) throw new Error(`Only ${changed} lettering pixels found; the crest may have changed. Check SCROLL_TOP.`);

const darkMaster = path.join(DIR, 'brid-town-badge-on-dark.png');
await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(darkMaster);

for (const [variant, source] of [['light', SOURCE], ['dark', darkMaster]]) {
  for (const w of LOGO_WIDTHS) {
    const base = path.join(DIR, `brid-town-badge-${variant}-${w}`);
    await sharp(source).resize({ width: w }).png({ compressionLevel: 9, palette: false }).toFile(`${base}.png`);
    await sharp(source).resize({ width: w }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${base}.webp`);
  }
}
console.log(`Recoloured ${changed} lettering pixels; wrote ${darkMaster} and ${LOGO_WIDTHS.length * 4} web copies.`);
