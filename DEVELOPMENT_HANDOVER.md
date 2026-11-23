# Development handover

Last updated: 23 November 2026.

## Repository

| | |
|---|---|
| Repository | https://github.com/bridtownafc/bridtownafc |
| Branch | `feature/site-completion` (not merged into `main`; `main` holds the baseline `3717b64`) |
| Latest commit | `git log -1 origin/feature/site-completion` (this handover is updated in that commit) |
| Push account | `bridtownafc`, through a repository-scoped Git credential. `credential.https://github.com.useHttpPath=true` is set in this repository, so other GitHub accounts stored on the laptop are never used. |

## Current status

- **Website** (Astro 5, static): built from published CMS content and served locally. **Not deployed.** https://bridtown.com is still the club's existing site (and its holding page) and is not connected to this project.
- **Staff admin** (Directus 12.5 + PostgreSQL 17): runs natively on the Windows development laptop, bound to 127.0.0.1 (`docs/CMS.md`). Core licence tier (no key).
- **Match data**: Football Web Pages API connected for the men's team (team 288, competition 15). The women's team waits for FA Full-Time code snippets.
- **Production**: prepared in the repository only (`docs/PRODUCTION.md`). No hosting, DNS or deployment changes have been made.

## Verified on 22–23 November 2026 (local, real interface)

Each check used clearly labelled temporary test content, removed afterwards and followed by a clean rebuild.

| Check | Result |
|---|---|
| **Women's squad photographs** | **Restored.** The 8 repository originals were linked to their CMS profiles with their recorded crops (`cms:admin photos`). `node cms/tests/squad-photos.check.mjs womens`: 8/8 players show **their own** photo on squad card and profile (men's 20/20). |
| **Browser workflows** (`cms:admin browser`: the real Directus screens in Chrome, as temporary Media and Football Editors, checked on the preview) | **14/14.** Men's and women's news published through the form appear in that team's news listing, homepage news section and article page only; an edit and unpublishing reach the site; a future-dated article stays hidden. New women's player from the squad list: placeholder on card and profile, then a photo uploaded in the player form, then replaced (served from a new URL; the original is kept). New men's player with a photo uploaded while creating them. Biography edit shown on the profile. New profiles start as hidden drafts. Settings out of reach. |
| Player admin (`players-test`) | 13/13 |
| Player publishing (`publishing`) | all passed, including failed-build safety and the retry notification |
| Staff roles (`staff-check`) | 13/13: permissions, enquiry access, duplicates refused, team settings and Match Centre references protected |
| Enquiry delivery, save triggers a rebuild, admin fixes | passed |
| Unit tests, type check, CMS-backed build | 65/65; 0 errors and 0 warnings; 66 pages with 0 broken internal links or assets |

**Fixed while testing on 22 November:**
- Adding a brand-new player from a squad list failed with a server error (the duplicate check).
- New news articles were ordered last and never reached the homepage's three latest stories.
- Generated photo, news-image and logo URLs did not change when the image did, so a replaced photo could stay cached. File names now carry a version.
- Team, competition and season pickers showed technical columns instead of names.

**Earlier and still true:**
- **Publishing chain**: admin save → `brid-publishing` extension → rebuild listener (127.0.0.1:4400) → `cms:sync` + `astro build` → `dist/` → preview at http://localhost:4321. Only published content is used. A failed build keeps the previous site and notifies staff.
- **Scheduled publishing** (a real event, fully automatic): article 1 was scheduled for 18 November 2026 12:00 and was live on the local preview at 12:01:53, with no manual step.
- **Local services**: `npm run cms:start` starts and tracks PostgreSQL, Mailpit, Directus, the rebuild listener, the match scheduler and the website preview, adopting ones already running.

## Outstanding

- **Team form layout:** the closed "Advanced: FA Full-Time snippets" group shows above the team name. This is fixed in `cms/schema/admin-simplify.mjs`; apply it with `npm run cms:admin -- --otp=123456 simplify` (about 10 seconds).
- **Article 1** is the club's genuine launch story overwritten with test text on 18 November (summary "Test Test…", body "dwedewdewdweew"). Restoring the original from its revision history needs the club's decision.
- **Ground name:** the API says "Mounting Systems Stadium"; the site keeps the club-configured "HDM Energies Stadium" until the club confirms.
- **Women's FA Full-Time snippets** (league table, fixtures/results) are not supplied; the Match Centre links to the official pages.
- **Squad details:** numbers, positions, biographies, captains and player sponsors are not entered for any player.
- **Enquiry routing** for Football Editors (football/matchday) and Media Editors (community) awaits confirmation. The website enquiry form is off (`PUBLIC_ENQUIRY_ENDPOINT` is empty).
- **Test accounts:** three temporary test accounts remain **suspended** (they cannot sign in). Directus keeps them because they appear in edit history.
- **Memory:** the laptop runs low on memory with many apps open, and Windows may stop long checks. Close unneeded apps first. `cms:admin cleanup` removes leftovers of any interrupted check.
- **Production match data:** the scheduled workflow uses weekday cron rules (see `docs/PRODUCTION.md`).
- **Academy section:** a separate project phase, not started.

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
| Staff guide | `docs/Brid_Town_Website_Admin_Guide.docx` (v2.0, 23 November 2026) |

After changing `cms/extensions/brid-publishing`, restart Directus (`npm run cms:stop`, then `npm run cms:start`): auto-reload is off on purpose.

**Admin steps and checks** run with one Super Admin 2FA code, for example `npm run cms:admin -- --otp=123456 simplify browser`. Steps are listed in `cms/scripts/admin-session.mjs`. The `browser` step publishes temporary test articles on the local preview and removes them.

## Not recoverable from GitHub alone

GitHub holds the code, configuration templates, schema definitions, CMS extension, tests, docs and the squad photo originals. **It does not hold the following, which exist only on the development laptop.** The project is **not fully backed up** until these are copied privately (never to GitHub):

| Item | Where | Why it matters |
|---|---|---|
| **CMS database** (all CMS content, users, roles, permissions, admin configuration, revision history, the women's photo links) | `%LOCALAPPDATA%\BridTownCMS\pgdata`; verified dumps in `%LOCALAPPDATA%\BridTownCMS\backups` (make a fresh one with `npm run cms:backup`) | Without it a new machine starts with an empty CMS. Restore a dump with `pg_restore` (`docs/PRODUCTION.md`). |
| **CMS media uploads** (files uploaded through the admin, including the imported women's photos and the hero image on article 1) | `%LOCALAPPDATA%\BridTownCMS\uploads` | Not in the database dump; copy alongside it. The squad originals can be re-imported from the repository with `cms:admin photos`. |
| **Secrets**: `cms/.env` (database password, Directus secret, Super Admin password, website and enquiry tokens, rebuild secret) and `.env` (Football Web Pages API key, team and competition IDs) | Project folder, git-ignored | The database dump only works with the matching `DB_PASSWORD`/`DIRECTUS_SECRET`. Transfer securely, or regenerate (`cms:env`, `cms:bootstrap`) and request the API key again. |
| **Super Admin two-factor authentication** | The authenticator app on the owner's phone | Needed to sign in to the restored CMS. |
| Generated files (`dist/`, `src/data/cms/`, `public/media/cms/`, `.cache/`) and portable runtimes | Project folder / `%LOCALAPPDATA%\BridTownCMS` | Recreated by `cms:setup`, `cms:start` and the first rebuild; nothing to copy. |

To resume on another device with the same CMS: install as above, copy `cms/.env`, `.env`, the latest backup dump and the `uploads` folder privately, restore the dump, then `npm run cms:start`.

## Next development priorities

1. Apply the team-form layout tweak (`cms:admin simplify`).
2. Decide on article 1: keep the test text or restore "The next chapter for Bridlington Town AFC" from its revision history.
3. Club inputs: ground name, women's FA Full-Time snippets, squad details, enquiry routing.
4. Production decisions in `docs/PRODUCTION.md` (hosting, CMS address, SMTP, backups, Directus licence), then a separately approved deployment. The public site and its holding page stay untouched until then.
5. The Academy section, as a separate phase.
