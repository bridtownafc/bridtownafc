// Full-page screenshots of the local website at desktop and mobile widths, via headless Chrome,
// plus an overflow report (elements wider than the viewport, and page-wide horizontal scroll).
// Usage: node site-shots.mjs <outdir> <path> [<path> ...]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [outArg, ...routes] = process.argv.slice(2);
const OUT = path.resolve(HERE, outArg);
const BASE = process.env.SITE ?? 'http://127.0.0.1:4321';
const PROFILE = path.join(HERE, 'chrome-site');
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
try {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 1; const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = id++; waiting.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  await send('Page.enable');
  const report = [];
  for (const [label, width, height, mobile] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    for (const route of routes) {
      await send('Page.navigate', { url: BASE + route });
      await sleep(1800);
      const info = await evaluate(`(() => {
        const vw = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= vw + 1) return false;
          for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; }
          return true;
        }).slice(0, 5).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' ' + Math.round(el.getBoundingClientRect().right));
        return { scrollW: document.documentElement.scrollWidth, vw, height: document.documentElement.scrollHeight, wide };
      })()`);
      const h = Math.min(info.height, 9000);
      await send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 1, mobile });
      await sleep(400);
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const name = `${label}-${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}.png`;
      writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      report.push(`${label.padEnd(8)}${route.padEnd(24)} page ${info.scrollW}/${info.vw}px${info.scrollW > info.vw ? ' OVERFLOW' : ''}  ${info.wide.join(', ')}  -> ${name}`);
    }
  }
  console.log(report.join('\n'));
  ws.close();
} finally {
  chrome.kill();
  await sleep(800);
  rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
