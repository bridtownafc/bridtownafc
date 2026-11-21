// Database backup before admin changes: pg_dump (custom format) to
// %LOCALAPPDATA%\BridTownCMS\backups, then checked by listing it with pg_restore. Throws
// (so the caller changes nothing) if either step fails. Returns the backup's path.
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function backupDatabase(env, reason) {
  const home = env.BRIDTOWN_CMS_HOME ?? path.join(process.env.LOCALAPPDATA ?? '', 'BridTownCMS');
  const dir = path.join(home, 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(dir, `directus-${stamp}-${reason}.dump`);
  const run = (exe, args) => spawnSync(path.join(home, 'pgsql', 'bin', exe), args, { env: { ...process.env, PGPASSWORD: env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const dump = run('pg_dump.exe', ['-h', '127.0.0.1', '-p', '5433', '-U', 'directus', '-d', 'directus', '-Fc', '-f', file]);
  if (dump.status !== 0) throw new Error(`Backup failed, nothing changed: ${dump.error?.message ?? dump.stderr}`);
  const list = run('pg_restore.exe', ['--list', file]);
  const tables = (list.stdout ?? '').split('\n').filter((line) => / TABLE DATA public /.test(line)).length;
  if (list.status !== 0 || tables < 10) throw new Error(`Backup ${file} could not be verified, nothing changed: ${list.error?.message ?? list.stderr ?? `${tables} tables`}`);
  return { file, kb: Math.round(statSync(file).size / 1024), tables };
}
