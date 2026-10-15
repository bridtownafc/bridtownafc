// Creates cms/.env from cms/.env.example, replacing each __GENERATE__ with a fresh
// random secret. Refuses to overwrite an existing cms/.env and never prints secrets.
// Usage: npm run cms:env
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../.env', import.meta.url);
const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

const env = template.replaceAll('__GENERATE__', () => randomBytes(32).toString('base64url'));
try {
  await writeFile(target, env, { flag: 'wx', mode: 0o600 });
  console.log('Created cms/.env with new random secrets. Keep it private; it is ignored by Git.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('cms/.env already exists; left unchanged.');
}
