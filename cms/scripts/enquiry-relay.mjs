// Enquiry relay: receives the website's enquiry form and stores each message in the CMS
// (`enquiries`), where Club Admins (and Commercial Editors, for commercial enquiries) read
// them. The public site never talks to Directus directly; this small service sits between
// them and holds only a create-only token (ENQUIRY_FORM_TOKEN from `npm run cms:bootstrap`).
//
// Protection: field validation and length limits, required consent, a hidden spam-trap field,
// a minimum time to fill the form, a per-address rate limit, a body size limit, and CORS
// limited to the website's own origins (ENQUIRY_ALLOWED_ORIGINS).
//
// Usage: npm run cms:enquiries        (listens on 127.0.0.1:4410 by default)
// Local website: set PUBLIC_ENQUIRY_ENDPOINT=http://127.0.0.1:4410/enquiry in .env.
import { createServer } from 'node:http';
import { client, loadEnv } from './lib/directus.mjs';

export const TOPICS = ['commercial', 'matchday', 'football', 'community', 'general'];
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const MIN_FILL_MS = 3000;
const MAX_BODY = 20_000;

/**
 * Checks a submission. Returns { enquiry } to store, { spam: true } to drop silently,
 * or { error } to show the visitor.
 */
export function validate(fields, { now = Date.now() } = {}) {
  const text = (name, max) => (typeof fields[name] === 'string' ? fields[name].trim().slice(0, max + 1) : '');
  if (text('website', 200)) return { spam: true };
  const started = Number(fields.started);
  if (Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS) return { spam: true };

  const enquiry = {
    topic: TOPICS.includes(fields.topic) ? fields.topic : 'general',
    name: text('name', 120),
    organisation: text('organisation', 160) || null,
    email: text('email', 200).toLowerCase(),
    phone: text('phone', 40) || null,
    message: text('message', 5000),
    consent: fields.consent === 'yes' || fields.consent === 'on' || fields.consent === true,
    page: /^\/[A-Za-z0-9/_-]*$/.test(fields.return ?? '') ? fields.return : null,
  };
  if (!enquiry.name || enquiry.name.length > 120) return { error: 'Please enter your name.' };
  if (!EMAIL.test(enquiry.email) || enquiry.email.length > 200) return { error: 'Please enter a valid email address.' };
  if (enquiry.phone && !/^[0-9+() .-]{6,40}$/.test(enquiry.phone)) return { error: 'Please enter a valid phone number, or leave it empty.' };
  if (enquiry.message.length < 10) return { error: 'Please add a little more detail to your message.' };
  if (enquiry.message.length > 5000 || (enquiry.organisation?.length ?? 0) > 160) return { error: 'Your message is too long.' };
  if (!enquiry.consent) return { error: 'Please confirm the club may use your details to reply.' };
  return { enquiry };
}

/** Allows `limit` requests per key in a sliding window. */
export function rateLimiter({ limit = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

async function readBody(req) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
  }
  if ((req.headers['content-type'] ?? '').includes('application/json')) return JSON.parse(body || '{}');
  return Object.fromEntries(new URLSearchParams(body));
}

/** Creates the HTTP handler; `store` saves an enquiry (Directus in production, a stub in tests). */
export function createHandler({ store, allowedOrigins, siteOrigin, limiter = rateLimiter(), log = console }) {
  return async (req, res) => {
    const origin = req.headers.origin;
    const cors = origin && allowedOrigins.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {};
    const wantsJson = (req.headers.accept ?? '').includes('application/json');
    const reply = (status, body, returnPath) => {
      if (!wantsJson && returnPath !== undefined && siteOrigin) {
        const target = new URL(returnPath || '/contact/', siteOrigin);
        target.searchParams.set('enquiry', status < 300 ? 'sent' : 'error');
        target.hash = 'enquire';
        res.writeHead(303, { location: target.toString(), ...cors });
        return res.end();
      }
      res.writeHead(status, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(origin && cors['access-control-allow-origin'] ? 204 : 403, { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, accept', 'access-control-max-age': '600' });
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/health') return reply(200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/enquiry') return reply(404, { error: 'Not found.' });
    if (origin && !cors['access-control-allow-origin']) return reply(403, { error: 'This form cannot be sent from here.' });

    const address = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!limiter(address)) return reply(429, { error: 'Too many enquiries from this connection. Please try again later, or call the club.' });

    let fields;
    try {
      fields = await readBody(req);
    } catch (error) {
      return reply(error.status ?? 400, { error: 'The enquiry could not be read.' });
    }
    const returnPath = /^\/[A-Za-z0-9/_-]*$/.test(fields.return ?? '') ? fields.return : '/contact/';
    const result = validate(fields);
    if (result.spam) return reply(200, { ok: true }, returnPath); // look successful; store nothing
    if (result.error) return reply(422, { error: result.error }, returnPath);
    try {
      await store(result.enquiry);
      log.log?.(`[enquiry] ${result.enquiry.topic} enquiry stored`);
      return reply(201, { ok: true }, returnPath);
    } catch (error) {
      log.error?.(`[enquiry] storing failed: ${error.message}`);
      return reply(502, { error: 'Sorry, your enquiry could not be sent just now. Please try again later, or call the club.' }, returnPath);
    }
  };
}

if (process.argv[1]?.endsWith('enquiry-relay.mjs')) {
  const { url, env } = loadEnv();
  if (!env.ENQUIRY_FORM_TOKEN) throw new Error('ENQUIRY_FORM_TOKEN is empty in cms/.env. Run `npm run cms:bootstrap` first.');
  const api = client(url, env.ENQUIRY_FORM_TOKEN);
  const allowedOrigins = (env.ENQUIRY_ALLOWED_ORIGINS ?? 'http://localhost:4321,http://127.0.0.1:4321').split(',').map((o) => o.trim()).filter(Boolean);
  const host = env.ENQUIRY_LISTEN_HOST || '127.0.0.1';
  const port = Number(env.ENQUIRY_LISTEN_PORT || 4410);
  const handler = createHandler({ store: (enquiry) => api.post('/items/enquiries', enquiry), allowedOrigins, siteOrigin: allowedOrigins[0] });
  createServer(handler).listen(port, host, () => console.log(`Enquiry relay on http://${host}:${port}/enquiry (origins: ${allowedOrigins.join(', ')})`));
}
