// Checks the CMS database with the cms/.env credentials, creating the `directus`
// database if it is missing. Replaces psql.exe/createdb.exe, which Windows Smart
// App Control blocks. Prints the PostgreSQL version. Used by start-cms.ps1.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { PORTS } from './directus-env.mjs';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (!existsSync(envFile)) throw new Error('cms/.env not found. Run `npm run cms:env` first.');
const { DB_PASSWORD } = parseEnv(readFileSync(envFile, 'utf8'));
const connect = async (database) => {
  const client = new pg.Client({ host: '127.0.0.1', port: PORTS.postgres, user: 'directus', password: DB_PASSWORD, database });
  await client.connect();
  return client;
};

const admin = await connect('postgres');
try {
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'directus'");
  if (rowCount === 0) {
    await admin.query("CREATE DATABASE directus ENCODING 'UTF8'");
    console.error('created database "directus"');
  }
} finally { await admin.end(); }

const db = await connect('directus');
try {
  console.log((await db.query('SHOW server_version')).rows[0].server_version);
} finally { await db.end(); }
