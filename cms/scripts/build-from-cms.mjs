// Builds the website from Directus: sync published content, then `astro build` with
// CONTENT_SOURCE=directus into a staging folder outside the project. Only a complete,
// successful build replaces dist/; if anything fails, the last successful website is kept.
// A failure ends with one line starting "PUBLISH FAILED:" that the rebuild listener passes
// on to staff. Usage: npm run build:cms
//
// Replacing dist/: the quick way is to rename folders. On Windows a running dev server or
// file indexer can lock a folder against renaming, so if that is refused the new files are
// copied into dist/ instead (new and changed files first, then stale ones removed), after
// taking a copy of the current site to roll back to if copying fails.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DIST = 'dist';
// Outside the project, so the dev server's file watcher never holds it open.
const WORK = path.join(tmpdir(), 'bridtown-cms-build');
const NEXT = path.join(WORK, 'dist-next');
const PREVIOUS = path.join(WORK, 'dist-previous');
const UNCHANGED = 'The website has not changed.';

function fail(reason, outcome = UNCHANGED) {
  console.error(`PUBLISH FAILED: ${reason} ${outcome}`);
  process.exit(1);
}

const run = (args, env, reason) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) fail(reason);
};

const LOCKED = ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'];
/** Windows can briefly lock files (antivirus, indexer), so file operations are retried. */
async function retry(operation, attempts = 8) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!LOCKED.includes(error.code) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}

async function files(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

/** Makes `target` match `source` file by file: copy new and changed files, then remove stale ones. */
async function mirror(source, target) {
  const wanted = await files(source);
  for (const relative of wanted) {
    const from = path.join(source, relative);
    const to = path.join(target, relative);
    if (existsSync(to) && (await readFile(from)).equals(await readFile(to))) continue;
    await mkdir(path.dirname(to), { recursive: true });
    await retry(() => copyFile(from, to));
  }
  const keep = new Set(wanted);
  for (const relative of await files(target)) {
    if (!keep.has(relative)) await retry(() => unlink(path.join(target, relative)));
  }
}

/** Swaps by renaming. Returns false, with dist/ as it was, if Windows refuses a rename. */
async function swapByRename() {
  await rm(PREVIOUS, { recursive: true, force: true, maxRetries: 5 });
  try {
    if (existsSync(DIST)) await retry(() => rename(DIST, PREVIOUS), 3);
  } catch (error) {
    if (LOCKED.includes(error.code) || error.code === 'EXDEV') return false;
    throw error;
  }
  try {
    await retry(() => rename(NEXT, DIST), 3);
  } catch (error) {
    // Put the current site back before anything else. It is never deleted while dist/ is missing.
    if (existsSync(PREVIOUS) && !existsSync(DIST)) await retry(() => rename(PREVIOUS, DIST));
    if (LOCKED.includes(error.code) || error.code === 'EXDEV') return false;
    throw error;
  }
  await rm(PREVIOUS, { recursive: true, force: true, maxRetries: 5 });
  return true;
}

async function swapByCopy() {
  console.log('dist/ is in use (e.g. by a dev server), so the new build is copied into it.');
  if (!existsSync(DIST)) return mirror(NEXT, DIST); // nothing to protect
  await rm(PREVIOUS, { recursive: true, force: true, maxRetries: 5 });
  try {
    await cp(DIST, PREVIOUS, { recursive: true });
  } catch (error) {
    fail(`dist/ is in use and could not be backed up before updating it (${error.code ?? error.message}); close anything using the dist folder.`);
  }
  try {
    await mirror(NEXT, DIST);
  } catch (error) {
    try {
      await mirror(PREVIOUS, DIST);
    } catch {
      fail(`The new build could not be copied into dist/ (${error.code ?? error.message}), and restoring the previous version also failed.`,
        `The website may be partly updated; a copy of the previous version is in ${PREVIOUS}.`);
    }
    fail(`The new build could not be copied into dist/ (${error.code ?? error.message}); close anything using the dist folder.`);
  }
  await rm(PREVIOUS, { recursive: true, force: true, maxRetries: 5 });
}

await mkdir(WORK, { recursive: true });
await rm(NEXT, { recursive: true, force: true, maxRetries: 5 });
run(['cms/scripts/sync.mjs'], {}, 'Content could not be read from the CMS or did not pass the website checks (see the log above).');
run(['node_modules/astro/astro.js', 'build', '--outDir', NEXT], { CONTENT_SOURCE: 'directus' }, 'The website build failed (see the log above).');
if (!existsSync(path.join(NEXT, 'index.html'))) fail('The website build produced no home page.');

try {
  if (!(await swapByRename())) await swapByCopy();
} catch (error) {
  fail(`The new build could not replace the current one (${error.code ?? error.message}).`, existsSync(DIST) ? UNCHANGED : 'The website folder is missing; run `npm run build:cms` again.');
}
await rm(NEXT, { recursive: true, force: true, maxRetries: 5 });
console.log('Website rebuilt from the CMS.');
