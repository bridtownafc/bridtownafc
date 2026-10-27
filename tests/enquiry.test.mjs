// Enquiry relay: validation, spam protection, rate limiting, CORS and both reply styles.
// Run: npm run test:enquiry
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createHandler, rateLimiter, validate } from '../cms/scripts/enquiry-relay.mjs';

const good = { topic: 'commercial', name: 'Sam Example', email: 'sam@example.com', message: 'We would like to sponsor a match.', consent: 'yes', started: '1', return: '/commercial/' };

test('a complete enquiry is accepted and normalised', () => {
  const { enquiry } = validate({ ...good, email: ' Sam@Example.com ', organisation: '' });
  assert.equal(enquiry.email, 'sam@example.com');
  assert.equal(enquiry.organisation, null);
  assert.equal(enquiry.topic, 'commercial');
  assert.equal(enquiry.page, '/commercial/');
});

test('missing name, bad email, short message or no consent are refused with a reason', () => {
  assert.match(validate({ ...good, name: ' ' }).error, /name/);
  assert.match(validate({ ...good, email: 'not-an-email' }).error, /email/);
  assert.match(validate({ ...good, message: 'Hi' }).error, /detail/);
  assert.match(validate({ ...good, consent: undefined }).error, /confirm/);
  assert.match(validate({ ...good, phone: 'call me' }).error, /phone/);
});

test('the spam trap and too-fast submissions are dropped silently', () => {
  assert.equal(validate({ ...good, website: 'http://spam.example' }).spam, true);
  assert.equal(validate({ ...good, started: String(Date.now()) }).spam, true);
});

test('unknown topics become general; unsafe return paths are ignored', () => {
  const { enquiry } = validate({ ...good, topic: 'admin', return: 'https://evil.example/' });
  assert.equal(enquiry.topic, 'general');
  assert.equal(enquiry.page, null);
});

test('rate limit: five per address in ten minutes', () => {
  const allow = rateLimiter();
  for (let i = 0; i < 5; i++) assert.equal(allow('1.2.3.4', i), true);
  assert.equal(allow('1.2.3.4', 10), false);
  assert.equal(allow('5.6.7.8', 10), true);
  assert.equal(allow('1.2.3.4', 10 * 60 * 1000 + 1), true);
});

async function withServer(options, fn) {
  const stored = [];
  const server = createServer(createHandler({ store: async (e) => { if (options.fail) throw new Error('down'); stored.push(e); }, allowedOrigins: ['http://localhost:4321'], siteOrigin: 'http://localhost:4321', log: {}, ...options }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, stored);
  } finally {
    server.close();
  }
}
const form = (fields) => new URLSearchParams(fields).toString();

test('JavaScript submissions get JSON; the enquiry is stored', async () => {
  await withServer({}, async (base, stored) => {
    const r = await fetch(`${base}/enquiry`, { method: 'POST', body: form(good), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', origin: 'http://localhost:4321' } });
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:4321');
    assert.equal(stored.length, 1);
    assert.equal(stored[0].name, 'Sam Example');
  });
});

test('plain form posts are redirected back to the page with the outcome', async () => {
  await withServer({}, async (base) => {
    const r = await fetch(`${base}/enquiry`, { method: 'POST', body: form(good), headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), 'http://localhost:4321/commercial/?enquiry=sent#enquire');
    const bad = await fetch(`${base}/enquiry`, { method: 'POST', body: form({ ...good, consent: '' }), headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    assert.equal(bad.headers.get('location'), 'http://localhost:4321/commercial/?enquiry=error#enquire');
  });
});

test('other websites cannot post; a storage failure is reported, not hidden', async () => {
  await withServer({}, async (base, stored) => {
    const r = await fetch(`${base}/enquiry`, { method: 'POST', body: form(good), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
    assert.equal(stored.length, 0);
  });
  await withServer({ fail: true }, async (base) => {
    const r = await fetch(`${base}/enquiry`, { method: 'POST', body: form(good), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' } });
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /could not be sent/);
  });
});
