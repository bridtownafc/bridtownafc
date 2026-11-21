// Directus settings for the native Windows setup (docs/CMS.md). Secrets come from
// cms/.env; everything here is non-secret. Every service binds to 127.0.0.1.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CMS_DIR = fileURLToPath(new URL('..', import.meta.url));

export const PORTS = { directus: 8055, postgres: 5433, smtp: 1025, mailpit: 8025, rebuild: 4400 };

/** @param {Record<string, string | undefined>} secrets values from cms/.env  @param {string} runtimeDir */
export function directusEnv(secrets, runtimeDir) {
  const need = (key) => {
    if (!secrets[key]) throw new Error(`${key} is missing from cms/.env. Run \`npm run cms:env\`.`);
    return secrets[key];
  };
  return {
    HOST: '127.0.0.1',
    PORT: String(PORTS.directus),
    PUBLIC_URL: `http://localhost:${PORTS.directus}`,
    SECRET: need('DIRECTUS_SECRET'),
    ...(secrets.DIRECTUS_LICENSE_KEY ? { LICENSE_KEY: secrets.DIRECTUS_LICENSE_KEY } : {}),
    TELEMETRY: 'false',
    LOG_LEVEL: 'info',
    LOG_STYLE: 'raw',

    DB_CLIENT: 'pg',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(PORTS.postgres),
    DB_DATABASE: 'directus',
    DB_USER: 'directus',
    DB_PASSWORD: need('DB_PASSWORD'),

    // First start only: creates the initial Super Admin account.
    ADMIN_EMAIL: need('ADMIN_EMAIL'),
    ADMIN_PASSWORD: need('ADMIN_PASSWORD'),

    // Sessions and abuse protection
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL: '7d',
    SESSION_COOKIE_TTL: '12h',
    RATE_LIMITER_ENABLED: 'true',
    RATE_LIMITER_STORE: 'memory',
    RATE_LIMITER_POINTS: '50',
    RATE_LIMITER_DURATION: '1',
    CORS_ENABLED: 'false',
    WEBSOCKETS_ENABLED: 'false',
    CACHE_ENABLED: 'false',

    // Uploads: images and PDFs only, 25 MB maximum, stored outside the repository
    STORAGE_LOCATIONS: 'local',
    STORAGE_LOCAL_ROOT: path.join(runtimeDir, 'uploads'),
    FILES_MAX_UPLOAD_SIZE: '25mb',
    FILES_MIME_TYPE_ALLOW_LIST: 'image/jpeg,image/png,image/webp,image/avif,image/svg+xml,application/pdf',

    // Email goes to Mailpit only
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_FROM: 'cms@example.com',
    EMAIL_SMTP_HOST: '127.0.0.1',
    EMAIL_SMTP_PORT: String(PORTS.smtp),
    EMAIL_SMTP_SECURE: 'false',
    EMAIL_SMTP_IGNORE_TLS: 'true',
    PASSWORD_RESET_URL_ALLOW_LIST: `http://localhost:${PORTS.directus}/admin/reset-password`,
    USER_INVITE_URL_ALLOW_LIST: `http://localhost:${PORTS.directus}/admin/accept-invite`,

    // Extensions from the repository; brid-publishing calls the local rebuild listener.
    EXTENSIONS_PATH: path.join(CMS_DIR, 'extensions'),
    // Off: a live reload re-reads index.js but not the rules.js it imports, so a change could
    // silently unload the publishing rules. Restart Directus after changing the extension.
    EXTENSIONS_AUTO_RELOAD: 'false',
    REBUILD_HOOK_URL: `http://127.0.0.1:${PORTS.rebuild}/rebuild`,
    REBUILD_HOOK_SECRET: need('REBUILD_HOOK_SECRET'),
    // Which website a successful rebuild updates, named in staff notifications. This
    // setup only ever updates the local preview; production sets "production".
    WEBSITE_ENVIRONMENT: secrets.WEBSITE_ENVIRONMENT || 'local',
  };
}
