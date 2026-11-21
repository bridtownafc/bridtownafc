// Minimal Directus REST client for the CMS scripts. Reads cms/.env and refuses to
// talk to anything but a local Directus unless ALLOW_REMOTE_DIRECTUS=1 is set.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

export function loadEnv() {
  if (!existsSync(ENV_FILE)) throw new Error('cms/.env not found. Run `npm run cms:env` first.');
  process.loadEnvFile(ENV_FILE);
  const url = new URL(process.env.DIRECTUS_URL ?? 'http://localhost:8055');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) && process.env.ALLOW_REMOTE_DIRECTUS !== '1') {
    throw new Error(`Refusing to use ${url.origin}: these scripts are for the local CMS only.`);
  }
  return { url: url.origin, env: process.env };
}

/** Replaces (or appends) KEY=value in cms/.env without touching other lines. */
export async function setEnvValue(key, value) {
  const text = await readFile(ENV_FILE, 'utf8');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  await writeFile(ENV_FILE, pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`);
}

export class DirectusError extends Error {
  constructor(method, path, status, body) {
    const detail = body?.errors?.map((e) => e.message).join('; ') ?? JSON.stringify(body);
    super(`${method} ${path} -> ${status}: ${detail}`);
    this.status = status;
    this.body = body;
  }
}

/** Inside `npm run cms:admin`: asks the parent session for a fresh access token (steps can outlast one). */
function refreshFromParent() {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message?.type !== 'token') return;
      process.off('message', onMessage);
      if (message.token) resolve(message.token);
      else reject(new Error('the admin session could not be refreshed'));
    };
    process.on('message', onMessage);
    process.send({ type: 'refresh' });
  });
}

export function client(baseUrl, token, { renew = null } = {}) {
  async function request(method, path, body, options = {}, retried = false) {
    const { raw = false, headers = {} } = options;
    const isForm = body instanceof FormData;
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    if (response.status === 401 && renew && !retried) {
      token = await renew();
      return request(method, path, body, options, true);
    }
    if (raw) return response;
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (!response.ok) throw new DirectusError(method, path, response.status, json);
    return json?.data ?? json;
  }
  return {
    get: (path) => request('GET', path),
    post: (path, body, options) => request('POST', path, body, options),
    patch: (path, body) => request('PATCH', path, body),
    del: (path, body) => request('DELETE', path, body),
    raw: (method, path, body, options) => request(method, path, body, { ...options, raw: true }),
    withToken: (newToken) => client(baseUrl, newToken),
  };
}

export async function login(baseUrl, email, password, otp) {
  // Inside `npm run cms:admin`, the Super Admin is already signed in (with one 2FA code) and
  // the session token is passed down, so each step does not need a new code.
  if (process.env.DIRECTUS_ADMIN_SESSION && email === process.env.ADMIN_EMAIL) {
    return client(baseUrl, process.env.DIRECTUS_ADMIN_SESSION, { renew: process.send ? refreshFromParent : null });
  }
  const data = await client(baseUrl).post('/auth/login', { email, password, ...(otp ? { otp } : {}) });
  return client(baseUrl, data.access_token);
}

/** Encodes a filter object for a query string. */
export const q = (params) =>
  '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`).join('&');
