// Local stand-in for a hosting provider's deploy hook. Directus (brid-publishing
// extension) POSTs here when site content changes; this runs `npm run build:cms`.
// - Ordinary edits are batched: one build at most 60 s after the first change.
// - Matchday changes (fixtures, tables, announcements) build within 5 s.
// - One build at a time; changes made during a build trigger one more build.
// - A failed build leaves the last successful website in place (build-from-cms.mjs).
// - GET /status reports the latest build and, for a failure, its reason; the CMS extension
//   reads it to tell the member of staff whose change was not published.
// Requests must carry the shared secret from cms/.env. Listens on 127.0.0.1 only.
// Usage: npm run cms:listen [-- --dry-run]
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { loadEnv } from './lib/directus.mjs';

const { env } = loadEnv();
const SECRET = env.REBUILD_HOOK_SECRET;
if (!SECRET) throw new Error('REBUILD_HOOK_SECRET is empty in cms/.env. Run `npm run cms:env`.');
const PORT = Number(env.REBUILD_LISTEN_PORT || 4400);
const HOST = env.REBUILD_LISTEN_HOST || '127.0.0.1';
const BATCH_MS = Number(env.REBUILD_BATCH_SECONDS || 60) * 1000;
const URGENT_MS = Number(env.REBUILD_URGENT_SECONDS || 5) * 1000;
const DRY_RUN = process.argv.includes('--dry-run');

const digest = (value) => createHash('sha256').update(String(value)).digest();
const authorised = (header) => typeof header === 'string' && timingSafeEqual(digest(header), digest(SECRET));
const stamp = () => new Date().toLocaleTimeString('en-GB');

let timer = null;
let dueAt = 0;
let building = false;
let rerun = false;
let changes = [];
let lastBuild = null;
let lastSuccessAt = null;

function schedule(urgent) {
  const due = Date.now() + (urgent ? URGENT_MS : BATCH_MS);
  if (timer && dueAt <= due) return; // an earlier build is already planned
  clearTimeout(timer);
  dueAt = due;
  timer = setTimeout(startBuild, due - Date.now());
}

function startBuild() {
  timer = null;
  if (building) {
    rerun = true;
    return;
  }
  const batch = changes;
  changes = [];
  building = true;
  const startedAt = new Date();
  console.log(`[${stamp()}] build started for ${batch.length} change(s): ${[...new Set(batch)].join(', ')}`);
  const finish = (ok, reason = null) => {
    if (!building) return; // 'error' and 'exit' can both fire
    building = false;
    const finishedAt = new Date().toISOString();
    if (ok) lastSuccessAt = finishedAt;
    lastBuild = { startedAt: startedAt.toISOString(), finishedAt, ok, reason: ok ? null : reason ?? 'The website build failed.' };
    console.log(`[${stamp()}] build ${ok ? 'succeeded' : `FAILED; the previous build is unchanged. ${lastBuild.reason}`} (${Math.round((Date.now() - startedAt) / 1000)} s)`);
    if (rerun || changes.length) {
      rerun = false;
      schedule(true);
    }
  };
  if (DRY_RUN) return setTimeout(() => finish(true), 200);
  // Output is shown here as usual; the "PUBLISH FAILED:" line is kept as the reason for staff.
  let reason = null;
  const child = spawn(process.execPath, ['cms/scripts/build-from-cms.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.on('data', (chunk) => {
      out.write(chunk);
      const line = /PUBLISH FAILED: (.*)/.exec(String(chunk));
      if (line) reason = line[1].trim();
    });
  }
  child.on('error', (error) => finish(false, `The website build could not start: ${error.message}`));
  child.on('exit', (code) => finish(code === 0, reason));
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/status') return send(res, 200, { building, scheduled: Boolean(timer), lastBuild, lastSuccessAt });
  if (req.method !== 'POST' || req.url !== '/rebuild') return send(res, 404, { error: 'not found' });
  if (!authorised(req.headers['x-rebuild-secret'])) return send(res, 401, { error: 'unauthorised' });

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 10_000) req.destroy();
  });
  req.on('end', () => {
    let event;
    try {
      event = JSON.parse(body || '{}');
    } catch {
      return send(res, 400, { error: 'invalid JSON' });
    }
    const urgent = event.urgent === true;
    changes.push(String(event.collection ?? 'unknown'));
    schedule(urgent);
    console.log(`[${stamp()}] ${event.collection ?? 'change'} ${event.event ?? ''}${urgent ? ' (urgent)' : ''}: build in ${Math.round((dueAt - Date.now()) / 1000)} s`);
    send(res, 202, { scheduledInSeconds: Math.round((dueAt - Date.now()) / 1000) });
  });
}).listen(PORT, HOST, () => console.log(`Rebuild listener on http://${HOST}:${PORT}${DRY_RUN ? ' (dry run)' : ''}`));
