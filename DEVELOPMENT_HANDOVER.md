# Development handover

Last updated: 21 November 2026.

## Repository

| | |
|---|---|
| Repository | https://github.com/bridtownafc/bridtownafc |
| Branch | `feature/site-completion` (not merged into `main`; `main` holds the baseline `3717b64`) |
| Code commit | `703b2da` "Simplify the staff admin, fix publishing triggers and polish match pages". This handover is in the commit after it. |

## Current status

- **Website** (Astro 5, static): built from published CMS content and served locally. **Not deployed.** https://bridtown.com is still the club's existing WordPress site and is not connected to this project.
- **Staff admin** (Directus 12.5 + PostgreSQL 17): runs natively on the Windows development laptop, bound to 127.0.0.1 (`docs/CMS.md`). Core licence tier (no key).
- **Match data**: Football Web Pages API connected for the men's team (team 288, competition 15); fixtures, results and the table appear on the local site. The women's team waits for FA Full-Time code snippets.
- **Production**: prepared in the repository only (`docs/PRODUCTION.md`). No hosting, DNS or deployment changes have been made.

## Confirmed working (local)

- **Publishing chain**: admin save → `brid-publishing` extension → rebuild listener (127.0.0.1:4400) → `cms:sync` + `astro build` → `dist/` → preview at http://localhost:4321. Only published content is used; a failed build keeps the previous site and notifies staff ("Website not updated").
- **Scheduled publishing (real event, fully automatic)**: article ID 1, "FA Trophy - Brid Town Face South Shields!", scheduled for 18 November 2026 12:00. At 12:00:00 the extension logged "1 scheduled item(s) due"; the listener started the build at 12:01:00 and it succeeded at 12:01:53. The article appeared in the men's news listing, its page (`/mens/news/the-next-chapter-for-bridlington-town-afc/`) and the men's homepage with no manual step. Note: article 1 is the club's genuine launch story overwritten with test text on 18 November (summary "Test Test…", body "dwedewdewdweew"); the original wording is in its revision history. Restoring it needs the club's decision.
- **Player publishing** (integration test, earlier run): drafts hidden; published players only on their own team; moving teams leaves nothing behind; missing optional details omitted; inactive, removed and past-leaving-date players hidden; failed builds preserve the site; a retry publishes and notifies.
- **Front end**: homepage and Match Centre at desktop and mobile widths with no page-wide horizontal overflow; CMS-backed build of 66 pages with 0 broken internal links or assets (21 November).
- **Local services**: `npm run cms:start` starts and tracks PostgreSQL, Mailpit, Directus, the rebuild listener, the match scheduler and the website preview, adopting running ones (verified with pid files removed: no duplicates).
- **Checks on 21 November**: 65 unit tests pass; `astro check` 0 errors, 0 warnings.

## Applied to the local CMS but not yet verified live

The admin simplification and the three admin fixes (names instead of ids, team carried into squad allocations, Website enquiries in the Club menu) were applied on 18 November after verified backups. The live checks did not run after that because the publishing extension had been silently unloaded (since fixed by restarting Directus and turning off auto-reload). Still to run, with one 2FA code:

```
npm run cms:admin -- --otp=123456 rebuild-check photos players simplify admin-check staff-check enquiry-check guide-shots players-test publishing
```

- `rebuild-check` proves an ordinary save triggers a rebuild (saves a draft only; publishes nothing). Not yet verified since the extension fix.
- `browser` (real Directus interface workflows) publishes a temporary test news article, so it is left out until the club approves it.

## Outstanding bugs and work

### 1. Women's team photographs missing (not fixed)

**Symptom:** the 8 women's players show their names but the club-badge placeholder instead of photos, on squad cards and profiles.

**Cause (investigated 18 and 21 November):** not asset paths or the build. The women's photos were added to the repository (`public/assets/teams/womens-first-team/squad/`, commit `e7389ab`) **after** the CMS was seeded, so they were never imported into Directus:
- all 8 women's profiles have `photo = null` in the CMS, with no photo history and no matching file records;
- `cms:sync` therefore exports them without photos, `public/media/cms/squad/womens/web/` is empty, and the build correctly shows the placeholder;
- the earlier local-content build used the repository files directly, which is why the photos "disappeared" when the preview became CMS-backed.

**Originals are safe**: 8 JPEG originals and their crops (`web/crops.json`) are committed in the repository.

**Fix (prepared, not run):** `npm run cms:admin -- --otp=123456 photos` (`cms/scripts/import-squad-photos.mjs`). It takes a verified backup, uploads each original to the "Squad photos" folder (reusing an identical library file if present), and links it with its crop to the matching profile. It only fills missing photos and never replaces one chosen in the CMS. The site then rebuilds automatically. Afterwards check `/womens/team/` and each profile on the preview.

### 2. Other open items

- Ground name: the API says "Mounting Systems Stadium"; the site keeps the club-configured "HDM Energies Stadium" until the club confirms.
- Women's FA Full-Time snippets (league table, fixtures/results) not supplied; the Match Centre links to the official pages instead.
- Squad numbers, positions, biographies, captains and player sponsors not entered for any player.
- Enquiry routing for Football Editors (football/matchday) and Media Editors (community) awaits confirmation; until then Club Admins (all) and Commercial Editors (commercial) handle enquiries. The website enquiry form is off (`PUBLIC_ENQUIRY_ENDPOINT` empty).
- Admin guide v2.0 is drafted (`tools/guide/build-guide-v2.cjs`) but needs new screenshots; `docs/` still holds v1.1.
- Production match-data workflow uses weekday cron rules (see `docs/PRODUCTION.md`).

## Local development startup

```powershell
npm ci                       # website dependencies
npm run cms:setup            # once per machine: portable PostgreSQL 17, Node 22, Mailpit, Directus (no admin rights)
npm run cms:env              # once: creates cms/.env with fresh secrets (only if you are starting a new CMS)
npm run cms:start            # everything, including automatic rebuilds and the preview
npm run cms:status
npm run cms:stop
```

| | |
|---|---|
| Staff admin | http://localhost:8055/admin |
| Local website preview | http://localhost:4321 |
| Local email inbox | http://localhost:8025 |
| Logs | `%LOCALAPPDATA%\BridTownCMS\logs` |

After changing `cms/extensions/brid-publishing`, restart Directus (`npm run cms:stop` then `npm run cms:start`): auto-reload is off on purpose.

## Not recoverable from GitHub alone

GitHub holds the code, configuration templates, schema definitions, CMS extension, tests, docs and the squad photo originals. **It does not hold the following, which exist only on the development laptop.** The project is **not fully backed up** until these are copied privately (never to GitHub):

| Item | Where | Why it matters |
|---|---|---|
| **CMS database** (all CMS content, users, roles, permissions, admin configuration, revision history) | `%LOCALAPPDATA%\BridTownCMS\pgdata`; verified dumps in `%LOCALAPPDATA%\BridTownCMS\backups` (latest made with `npm run cms:backup`) | Without it a new machine starts with an empty CMS. Restore a dump with `pg_restore` (`docs/PRODUCTION.md`). Re-seeding would recreate only the original sample content. |
| **CMS media uploads** (files uploaded through the admin, e.g. the hero image on article 1) | `%LOCALAPPDATA%\BridTownCMS\uploads` | Not in the database dump; copy alongside it. |
| **Secrets**: `cms/.env` (database password, Directus secret, Super Admin password, website and enquiry tokens, rebuild secret) and `.env` (Football Web Pages API key, team and competition IDs) | Project folder, git-ignored | The database dump only works with the matching `DB_PASSWORD`/`DIRECTUS_SECRET`. Transfer securely or regenerate (`cms:env`, `cms:bootstrap`) and request the API key again. |
| **Super Admin two-factor authentication** | The authenticator app on the owner's phone | Needed to sign in to the restored CMS. |
| Generated files (`dist/`, `src/data/cms/`, `public/media/cms/`, `.cache/`) and portable runtimes | Project folder / `%LOCALAPPDATA%\BridTownCMS` | Recreated by `cms:setup`, `cms:start` and the first rebuild; nothing to copy. |

To resume on another device with the same CMS: install as above, copy `cms/.env`, `.env`, the latest backup dump and the `uploads` folder privately, restore the dump, then `npm run cms:start`.

## Next development priorities

1. Run the `cms:admin` command above (one 2FA code): restore the women's photos and complete the live admin checks.
2. Decide on article 1: keep the test text or restore "The next chapter for Bridlington Town AFC".
3. Re-take screenshots and publish admin guide v2.0.
4. Club inputs: ground name, women's FA Full-Time snippets, squad details, enquiry routing.
5. Production decisions in `docs/PRODUCTION.md` (hosting, CMS address, SMTP, backups, Directus licence), then a separately approved deployment.
