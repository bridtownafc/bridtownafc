// Checks website enquiry delivery end to end on this computer: the real relay code with the
// create-only ENQUIRY_FORM_TOKEN, on a temporary local port, receives a test submission and a
// spam-trap submission. The genuine one must arrive in the CMS inbox as New, with the right
// fields; the spam one must store nothing. Both are local; no email or external message is
// sent. The test enquiry is deleted at the end.
//
// Run with one Super Admin 2FA code:  npm run cms:admin -- --otp=123456 enquiry-check
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createHandler } from '../scripts/enquiry-relay.mjs';
import { client, loadEnv, login, q } from '../scripts/lib/directus.mjs';

const { url, env } = loadEnv();
assert.ok(env.ENQUIRY_FORM_TOKEN, 'ENQUIRY_FORM_TOKEN is empty in cms/.env (run cms:bootstrap)');
const admin = await login(url, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, process.argv.find((a) => a.startsWith('--otp='))?.slice(6));
const formToken = client(url, env.ENQUIRY_FORM_TOKEN);
const tag = `eq${randomBytes(3).toString('hex')}`;
const origin = 'http://localhost:4321';

const server = createServer(createHandler({ store: (enquiry) => formToken.post('/items/enquiries', enquiry), allowedOrigins: [origin], siteOrigin: origin, log: {} }));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const relay = `http://127.0.0.1:${server.address().port}/enquiry`;
const send = (fields) => fetch(relay, { method: 'POST', headers: { origin, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
const base = { topic: 'commercial', name: `Test sender ${tag}`, organisation: 'Test organisation', email: `${tag}@example.com`, phone: '01262 000000', consent: 'yes', return: '/commercial/', started: String(Date.now() - 60_000) };

let failure = null;
try {
  const ok = await send({ ...base, message: `Temporary delivery test ${tag}. Please ignore.` });
  assert.equal(ok.status, 201, `relay answered ${ok.status}`);
  const spam = await send({ ...base, message: `Spam-trap test ${tag}. Please ignore.`, website: 'http://spam.example' });
  assert.equal(spam.status, 200, 'spam should look successful to the sender');
  const tooQuick = await send({ ...base, message: `Too-quick test ${tag}. Please ignore.`, started: String(Date.now()) });
  assert.equal(tooQuick.status, 200);
  await refusedRead();

  const stored = await admin.get('/items/enquiries' + q({ filter: { email: { _eq: `${tag}@example.com` } }, fields: 'id,topic,handling,name,organisation,email,phone,message,consent,page', limit: '-1' }));
  assert.equal(stored.length, 1, `expected 1 stored enquiry, found ${stored.length}`);
  const [e] = stored;
  assert.deepEqual([e.topic, e.handling, e.consent, e.page], ['commercial', 'new', true, '/commercial/']);
  assert.match(e.message, /Temporary delivery test/);
  console.log('  PASS a website enquiry reached the CMS inbox as New, with topic, contact details, consent and page');
  console.log('  PASS spam-trap and too-quick submissions looked successful but stored nothing');
  console.log('  PASS the form token can create enquiries but not read them');
} catch (error) {
  failure = error;
} finally {
  server.close();
  const left = await admin.get('/items/enquiries' + q({ filter: { email: { _eq: `${tag}@example.com` } }, fields: 'id', limit: '-1' }));
  if (left.length) await admin.del('/items/enquiries', left.map((x) => x.id));
  console.log('  test enquiries removed');
}
if (failure) {
  console.error(`\nFAILED: ${failure.message}`);
  process.exit(1);
}
console.log('\nEnquiry delivery: all checks passed.');

async function refusedRead() {
  const response = await formToken.raw('GET', '/items/enquiries');
  assert.ok([401, 403].includes(response.status), `the form token could read enquiries (${response.status})`);
}
