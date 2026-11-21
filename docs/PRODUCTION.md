# Production operation

**Status:** prepared in the repository only. Nothing is deployed, no hosting or DNS is configured, and bridtown.com is unchanged. Production activation needs the decisions in [What is needed before deployment](#what-is-needed-before-deployment) and the launch gates in `DEPLOYMENT-BOUNDARY.md`.

## What runs where

| Part | Locally today | In production |
|---|---|---|
| **Website** | Static files in `dist/`, built from published CMS content (`npm run build:cms`), shown by `npm run preview` | The same static files on the chosen static host |
| **Staff admin (Directus 12) + PostgreSQL 17** | Native Windows services on 127.0.0.1 (`npm run cms:start`) | A private server (or managed Postgres plus a Node host) with HTTPS. Never reachable by the public website's visitors except the admin sign-in. |
| **Media library** | `%LOCALAPPDATA%\BridTownCMS\uploads` | A persistent volume or object storage, included in backups |
| **Publishing** | `brid-publishing` extension → rebuild listener (`cms/scripts/rebuild-listener.mjs`, 127.0.0.1:4400) → `build:cms` | The extension posts to the host's **deploy hook** instead (`REBUILD_HOOK_URL`). The build there runs `npm run build:cms`, so it needs network access to the CMS and `DIRECTUS_WEBSITE_TOKEN`. |
| **Match data** | `scripts/matches/scheduler.mjs` (started by `cms:start`) | `.github/workflows/match-data.yml` on GitHub Actions: syncs, commits the snapshot, calls `DEPLOY_HOOK_URL` |
| **Enquiries** | Form switched off (`PUBLIC_ENQUIRY_ENDPOINT` empty): visitors phone or email. Relay tested locally (`enquiry-check`). | Optional: run `cms/scripts/enquiry-relay.mjs` behind HTTPS and set `PUBLIC_ENQUIRY_ENDPOINT`, `ENQUIRY_ALLOWED_ORIGINS` |
| **Email (password resets, invites)** | Mailpit, local inbox only | An SMTP provider, set in `cms/server/directus-env.mjs` |
| **Backups** | `npm run cms:backup` (verified `pg_dump`), plus automatic backups before admin changes | A scheduled `pg_dump` and media copy to separate storage, with a tested restore |

Staff notifications name the website they updated: set `WEBSITE_ENVIRONMENT=production` in the production CMS environment. Until then they say "the local preview website (not bridtown.com)".

## Secrets

Never commit these; `.env` and `cms/.env` are git-ignored, and none is sent to browsers (only `PUBLIC_ENQUIRY_ENDPOINT`, a URL, reaches the website).

| Secret | Used by | Where it goes in production |
|---|---|---|
| `FWP_API_KEY`, `FWP_TEAM_ID` (288), `FWP_COMPETITION_ID` (15) | Match data sync | GitHub Actions secrets |
| `DEPLOY_HOOK_URL` | Match data workflow | GitHub Actions secret, from the host |
| `DB_PASSWORD`, `DIRECTUS_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | CMS | The CMS server's environment |
| `REBUILD_HOOK_SECRET`, `REBUILD_HOOK_URL` | CMS → rebuild | CMS environment (the host's deploy hook URL) |
| `DIRECTUS_WEBSITE_TOKEN` | Website build (read-only, published content) | Host build environment |
| `ENQUIRY_FORM_TOKEN` | Enquiry relay (create-only) | Relay environment, if the form is switched on |
| `DIRECTUS_LICENSE_KEY` | CMS, once the club has an Open Innovation Grant key | CMS environment |

## Local startup and recovery (admin computer)

```powershell
npm run cms:start      # database, admin, local inbox, rebuild listener, match scheduler (adopts running ones)
npm run cms:status     # what is running; everything must say "this computer only"
npm run preview        # local website at http://localhost:4321 (the last successful CMS build)
npm run cms:stop       # stops everything; content is kept
```

- **A service stopped:** run `npm run cms:start` again. Logs are in `%LOCALAPPDATA%\BridTownCMS\logs` (`directus.log`, `rebuild-listener.log`, `match-scheduler.log`).
- **Admin changes (re-runnable, one 2FA code):** `npm run cms:admin -- --otp=123456 players simplify`, then the checks `admin-check staff-check enquiry-check players-test publishing`. Each change step backs up and verifies the database first.
- **A failed website build:** the previous `dist/` is kept and staff get "Website not updated". Fix the cause from `rebuild-listener.log`, then save the item again.
- **Restore the database** from a backup in `%LOCALAPPDATA%\BridTownCMS\backups` (this replaces all CMS content, so take a fresh `npm run cms:backup` first):

  ```powershell
  npm run cms:start     # PostgreSQL must be running
  # stop the admin only, so nothing writes during the restore:
  powershell -NoProfile -Command ". .\cms\scripts\windows\CmsCommon.ps1; Stop-TrackedProcess 'directus' $Node22"
  & "$env:LOCALAPPDATA\BridTownCMS\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -p 5433 -U directus -d directus --clean --if-exists "<backup file>"
  npm run cms:start
  ```

  `pg_restore` asks for the database password (`DB_PASSWORD` in `cms/.env`). Copy `uploads` back from the matching media backup.

## Match data in production

- The workflow runs every 6 hours, and every 15 minutes between 11:00 and 22:59 UTC on Tuesdays, Wednesdays and Saturdays. The local scheduler instead checks the actual fixture list (every 15 minutes from 12:00 to 23:00 UK time on any day with a fixture). The workflow's weekday rule misses matches on other days (for example bank holidays), and because cron runs in UTC its window starts and ends an hour earlier in UK winter time. Either accept that or replace the cron rule with a frequent trigger that checks the fixture list, as the scheduler does.
- Data is never live: results appear once Football Web Pages marks a match finished, and pages show when data was last updated. If the source fails, the last good data is kept.

## What is needed before deployment

1. **Hosting choice** for the static site (with a deploy hook) and for the CMS + PostgreSQL + media (private, HTTPS, persistent storage).
2. **CMS address** for staff and a way for the host's build to reach it (or move the CMS-backed build to a runner that can).
3. **SMTP provider** for password-reset and invitation emails.
4. **Backup destination and schedule**, and a restore test.
5. **Enquiry form:** keep phone/email only, or switch the online form on (relay hosting, HTTPS URL, allowed origins).
6. **Directus licence:** apply for the Open Innovation Grant (removes the 3-account limit and enables field and item permissions), then re-run bootstrap.
7. **GitHub:** push `main`, add the Actions secrets above.
8. **Content decisions:** ground name (HDM Energies Stadium or Mounting Systems Stadium), women's FA Full-Time snippets, enquiry topic routing.
9. The launch gates and migration/rollback plan in `DEPLOYMENT-BOUNDARY.md`.
