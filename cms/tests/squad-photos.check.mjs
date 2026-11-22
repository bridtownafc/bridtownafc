// Checks that each player's photo on the running local website (npm run preview) is the right
// person: every photo served on the squad card and the profile page is compared with all the
// team's repository originals (cropped as recorded in web/crops.json) using a small greyscale
// fingerprint. It must match its own player's original closely, and better than anyone else's.
// Needs no sign-in. Usage: node cms/tests/squad-photos.check.mjs [womens|mens]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { localContent } from '../scripts/export-local-content.mjs';

const SITE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4321';
const teamKey = process.argv[2] ?? 'womens';
const team = localContent().teams[teamKey];
const sourceDir = path.join('public', team.photoDir);
const crops = JSON.parse(readFileSync(path.join(sourceDir, 'web', 'crops.json'), 'utf8'));

/** 12 x 15 greyscale fingerprint, normalised for brightness and contrast. */
async function fingerprint(input, crop) {
  let image = sharp(input).rotate();
  if (crop) image = image.extract(crop);
  const { data } = await image.resize(12, 15, { fit: 'cover', position: 'top' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const values = [...data];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}
const distance = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0) / a.length);

const originals = new Map();
for (const player of team.players.filter((p) => p.photo)) {
  originals.set(player.slug, await fingerprint(readFileSync(path.join(sourceDir, player.photo.original)), crops[player.slug]?.crop));
}
const html = async (route) => { const r = await fetch(SITE + route); assert.ok(r.ok, `${route}: ${r.status}`); return r.text(); };
const squad = await html(`/${teamKey}/team/`);

let failures = 0;
for (const player of team.players.filter((p) => p.photo)) {
  for (const [view, page] of [['squad card', squad], ['profile', await html(`/${teamKey}/team/${player.slug}/`)]]) {
    // The photo is the <img> whose file name starts with the player's web address.
    const src = [...page.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).find((s) => s.includes(`/web/${player.slug}-`));
    if (!src) { console.log(`  FAIL ${player.name}: no photo on the ${view} (placeholder shown)`); failures += 1; continue; }
    const response = await fetch(SITE + src);
    if (!response.ok) { console.log(`  FAIL ${player.name}: ${src} answers ${response.status}`); failures += 1; continue; }
    const served = await fingerprint(Buffer.from(await response.arrayBuffer()));
    const ranked = [...originals].map(([slug, print]) => ({ slug, d: distance(served, print) })).sort((a, b) => a.d - b.d);
    const own = ranked.find((r) => r.slug === player.slug);
    const ok = ranked[0].slug === player.slug && own.d < 0.45;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${player.name.padEnd(18)} ${view.padEnd(10)} ${src}  match ${own.d.toFixed(2)}, next best ${ranked.find((r) => r.slug !== player.slug).d.toFixed(2)} (${ranked[0].slug === player.slug ? 'correct player' : `looks like ${ranked[0].slug}`})`);
  }
}
if (failures) { console.error(`\n${failures} photo check(s) failed.`); process.exit(1); }
console.log(`\nAll ${team.players.filter((p) => p.photo).length} ${teamKey} players show their own photo on the squad card and profile.`);
