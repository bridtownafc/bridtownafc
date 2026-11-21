// Links squad photo originals from the repository (public/<team photoDir>, as listed in
// src/data/teams) to CMS profiles that have no photo, with the crops in web/crops.json.
// Photos only: no other content is touched, and a photo already chosen in Directus is never
// replaced. A library file with the same name and size is reused rather than uploaded twice.
// Backs up and verifies the database first. Safe to re-run.
// Usage: npm run cms:admin -- --otp=123456 photos
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { localContent } from './export-local-content.mjs';
import { backupDatabase } from './lib/backup.mjs';
import { loadEnv, login, q } from './lib/directus.mjs';

const { url, env } = loadEnv();
const log = (...args) => console.log(' ', ...args);

console.log('Database backup');
const backup = backupDatabase(env, 'before-squad-photo-import');
log(`${backup.file} (${backup.kb} KB, ${backup.tables} tables, verified)`);

const api = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const [squadFolder] = await api.get('/folders' + q({ filter: { name: { _eq: 'Squad photos' } }, fields: 'id' }));
if (!squadFolder) throw new Error('The "Squad photos" folder is missing. Run `npm run cms:bootstrap` first.');

let linked = 0;
for (const [teamKey, team] of Object.entries(localContent().teams)) {
  console.log(`${teamKey}`);
  const sourceDir = path.join('public', team.photoDir);
  const cropsFile = path.join(sourceDir, 'web', 'crops.json');
  const crops = existsSync(cropsFile) ? JSON.parse(await readFile(cropsFile, 'utf8')) : {};
  for (const player of team.players.filter((p) => p.photo)) {
    const [person] = await api.get('/items/people' + q({ filter: { slug: { _eq: player.slug } }, fields: 'id,photo', limit: '1' }));
    if (!person) { log(`- ${player.name}: no CMS profile with web address ${player.slug}; skipped`); continue; }
    if (person.photo) continue;
    const original = path.join(sourceDir, player.photo.original);
    if (!existsSync(original)) { log(`- ${player.name}: original ${original} not found; skipped`); continue; }
    const bytes = await readFile(original);
    let [file] = await api.get('/files' + q({ filter: { _and: [{ filename_download: { _eq: player.photo.original } }, { filesize: { _eq: bytes.length } }] }, fields: 'id', limit: '1' }));
    if (!file) {
      const form = new FormData();
      form.append('folder', squadFolder.id);
      form.append('title', player.name);
      form.append('description', player.photo.description);
      form.append('file', new Blob([bytes], { type: 'image/jpeg' }), player.photo.original);
      file = await api.post('/files', form);
    }
    await api.patch(`/items/people/${person.id}`, { photo: file.id, photo_description: player.photo.description, photo_crop: crops[player.slug]?.crop ?? null });
    linked += 1;
    log(`+ ${player.name}: ${player.photo.original}`);
  }
}
console.log(`\n${linked} profile(s) given their photo. The website updates automatically.`);
