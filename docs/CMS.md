# Staff Admin CMS (Directus)

**Status:** local development only. Nothing here is deployed, and the live site at bridtown.com is untouched.

## How it fits together

```
Staff (browser) ──► Directus Studio :8055 ──► PostgreSQL
                         │  brid-publishing extension
                         │   • enforces approval rules on every write
                         │   • POSTs to the rebuild hook when site content changes
                         ▼
               rebuild listener :4400 (production: host deploy hook)
                         │  npm run build:cms
                         ▼
   cms:sync (read-only token, published content only)
     → src/data/cms/content.json + public/media/cms/   (validated, swapped in atomically)
   astro build (CONTENT_SOURCE=directus) → dist/  (static site; no CMS calls from browsers)
```

- The public website never talks to Directus. It is a static build, and the CMS can sit on a private address.
- `npm run build` (the default) still builds from `src/data`. `CONTENT_SOURCE=directus` builds from the synced snapshot.
- If a sync fails or the snapshot is invalid, the build stops and the previous site stays as it is.

## What the CMS manages

| On the website now | Collections |
|---|---|
| Squads and player photos | `people`, `squad_memberships`, `teams.placeholder_cards` |
| Team news cards | `articles` |
| Sponsorship packages | `sponsorship_packages` |

These are ready for staff, but the website **doesn't show them yet**. Each needs its own approved design change: `fixtures`, `league_tables`/`league_table_rows`, `competitions`, `seasons`, `announcements`, `sponsors`, `events`, `pages` and `site_settings`.

Club copy that's still in code (team introductions, Club page, homepage text) moves to `pages`/`site_settings` in a later phase.

Every publishable item has a **status**: Draft → In review → Published → Archived. Only Published items, plus scheduled articles whose time has passed, reach the website. Directus records **activity and revisions** for every change, and supports **content versions** for proposing edits to live items.

## Roles

| Role | Can manage | Publishes directly | Needs Club Admin approval |
|---|---|---|---|
| **Super Admin** | Everything, including staff accounts, roles, settings | Yes | — |
| **Club Admin** | All content; approves others' changes; activity log | Yes | — |
| **Media Editor** | Articles, announcements, events, media library | Routine news, articles, events, routine announcements | **Major announcements** |
| **Football Editor** | People, squads, fixtures, results, league tables, seasons, competitions, match reports/previews | Yes | — |
| **Commercial Editor** | Sponsors, sponsorship packages, commercial pages | No | **Publishing, changing or removing anything live** |
| Website (API only) | Read published content | — | Not a person; no Studio access, no seat |

- **2FA:** required for Super Admin and Club Admin, and recommended for everyone.
- **Passwords:** at least 12 characters. An account locks after 5 failed sign-ins.
- **Password reset:** by email. Locally the emails go to Mailpit at http://localhost:8025.

### Approval workflow
1. **Editor drafts** a change and sets it to **In review**. Commercial Editors can't set Published.
2. **Changing something already live:** the editor opens the item and **creates a version** with their changes, so the live item is left untouched.
3. **Club Admin reviews:** they open the item or version and publish it (or promote the version). The website then rebuilds.

### Defence in depth
The rules are enforced twice:
1. **Directus permissions**, in `cms/schema/access.mjs`.
2. **The `brid-publishing` extension**, in `cms/extensions/brid-publishing/rules.js`. It blocks a non-approver from publishing, editing or deleting approval-only content that's live. It also keeps Football Editors to match articles and Commercial Editors to commercial pages.

Item-level permission rules are licence-gated in Directus 12, so the extension keeps the approval rules working whatever the licence state. Bootstrap refuses to run if the extension isn't loaded.

### Without a licence key (Core tier)
Directus 12 **refuses** permissions that contain item rules, validation, presets or a field subset. It returns `403 RESOURCE_RESTRICTED` rather than ignoring them, which was tested on 12.5.0.

In that case bootstrap falls back to collection-level permissions (all fields) and prints a warning. Re-running it after adding a licence key restores the full rules.

| In Core mode | Still enforced? |
|---|---|
| Which collections each role can use | Yes |
| Approvals; the Football and Commercial scope rules | Yes, by the extension |
| Only approvers delete live items | Yes, by the extension |
| Editors change only their own uploads | Yes, by the extension |
| Website sync requests published content and named fields only | Yes |
| Read limits inside a collection | **No.** Commercial Editors see every page, and the website token could read drafts and internal notes, although the sync never asks for them. |
| Field limits | **No.** Staff can see colleagues' email addresses. |
| Version and comment ownership | **No.** |

## Publishing and matchday updates

- **Normal edits:** batched into one rebuild, at most 60 seconds after the first change.
- **Urgent changes:** fixtures, scores, league tables and announcements rebuild within about 5 seconds, plus build time (about 10–20 seconds for this site).
- **Concurrency:** only one build runs at a time. Changes made during a build trigger one more build.
- **Production:** the listener is replaced by the hosting provider's deploy hook. The CMS (`REBUILD_HOOK_URL`) needs no other change.

## Local setup (native Windows, no Docker)

This needs no administrator rights and installs nothing system-wide. Portable copies of everything go in `%LOCALAPPDATA%\BridTownCMS`, outside the repository:

| Folder | Contents |
|---|---|
| `pgsql\` | PostgreSQL 17.11 (EDB zip binaries) |
| `node22\` | Node.js 22.23.3, used only to run Directus |
| `mailpit\` | Mailpit 1.31.5, the local email inbox |
| `pgdata\` | The database (persistent) |
| `uploads\` | Media library files (persistent) |
| `logs\`, `run\` | Service logs and process ids |

- **Why Node 22:** Directus needs `isolated-vm`, which only has prebuilt Windows binaries for Node 22. Building it for Node 24 would need Visual Studio. The website and the CMS scripts keep using your normal Node 24.
- **Setup steps:** `setup-cms.ps1` downloads each component and checks it against a pinned SHA-256 hash. It then installs Directus into `cms/server/node_modules` from `package-lock.json`, and creates the database cluster with scram-sha-256 password login, listening on 127.0.0.1:5433 only.

```powershell
npm run cms:setup      # once (re-runnable): portable PostgreSQL/Node 22/Mailpit, Directus, database
npm run cms:start      # PostgreSQL, Mailpit, Directus; checks every port is bound to 127.0.0.1
npm run cms:bootstrap  # collections, roles, permissions, website token (re-runnable)
npm run cms:seed       # imports today's site content, photos and crops (re-runnable)
npm run cms:status     # which services are running, and on which address
npm run cms:stop       # stops everything; content is kept
npm run cms:listen     # rebuild listener (separate terminal)
npm run build:cms      # manual sync + build from the CMS
```

| Service | Address (this computer only) |
|---|---|
| Staff dashboard | http://localhost:8055/admin |
| Email inbox (Mailpit) | http://localhost:8025 |
| PostgreSQL | 127.0.0.1:5433, user `directus`, password `DB_PASSWORD` in `cms/.env` |

- **Sign-in:** the initial Super Admin email and password are in `cms/.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). Studio asks for 2FA setup at first sign-in. API logins aren't asked for a code until 2FA is enabled on the account.
- **Settings:** Directus's settings are in `cms/server/directus-env.mjs`. It binds to 127.0.0.1 explicitly; Directus's default is 0.0.0.0.
- **Logs:** in `%LOCALAPPDATA%\BridTownCMS\logs`.
- **Removing everything:** run `npm run cms:stop`, then delete `%LOCALAPPDATA%\BridTownCMS`. That also deletes the local content.
- **Docker alternative:** `cms/docker-compose.yml` is an equivalent Docker setup for machines that can run Docker. It isn't used on the development PC.

## Licence (Directus 12, MSCL)

- **Core tier (no key):** 3 Studio seats, 25 collections, 5 flows. Custom permission rules are licence-gated.
- **Open Innovation Grant:** under $5M revenue and fewer than 50 employees. It removes those limits at no cost. The **club** applies as the end user at https://directus.com/oig.
- **Key:** set `DIRECTUS_LICENSE_KEY` in `cms/.env`. A key covers 5 activations (local, staging, production, spare). It renews yearly, and the instance revalidates at least every 12 hours.
- **This model:** uses 15 collections and no flows, so it also fits Core's limits. API-only users don't count as seats.

## Not yet done

- Integration tests against the running Directus: 2FA, password reset, the full permission matrix, approvals and versions, uploads, drafts never reaching the build. Sign-in, startup, bootstrap, seed and a build from the CMS are verified. Testing all five roles in the Studio needs more than Core's 3 seats, so it needs the licence key.
- Website designs for fixtures, tables, sponsors, announcements, events and pages (each needs approval).
- Production hosting, email (SMTP), backups, monitoring and domain. None are configured.
