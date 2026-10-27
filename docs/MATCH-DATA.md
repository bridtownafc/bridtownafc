# Fixtures, results and league tables

Each team has its own source, its own snapshot (`src/data/matches/<team>.json`) and its own pages. The two teams' data is never combined.

## Sources (checked 27 October 2026)

| | Men's first team | Women's first team |
|---|---|---|
| Competition | Northern Premier League East Division 2026/27, plus cup ties (e.g. FA Trophy) | **Not yet verified** (see below) |
| Source | [Football Web Pages](https://www.footballwebpages.co.uk/bridlington-town) | [FA Full-Time](https://fulltime.thefa.com/displayTeam.html?id=65157437) |
| Method | **API**: `https://api.footballwebpages.co.uk/v2/` (`fixtures-results.json`, `league-table.json`) | **Official embed**: Full-Time's "Code for your website" widget (`cs1.js`) |
| Permission | Free for a non-league club's official website, on request by email. Key sent in the `FWP-API-Key` header. 10 requests a minute (a sync uses 2). | Provided by the FA for club and league websites. |
| Refresh | Every 15 minutes, 12:00 to 23:00 UK time, on a day the team has a fixture; otherwise every 6 hours | Live from Full-Time whenever the page is opened |
| Status | **Built and tested; waiting for an API key** | **Built; waiting for widget codes** |

### Why these sources

- **Men's.** The Northern Premier League publishes no API. Football Web Pages documents an API and offers it free to non-league clubs for their official site, which covers league and cup matches and the table. Its public pages were used only to confirm the team, competition and season. They are not scraped.
- **Women's.** FA Full-Time puts every page, including `robots.txt`, behind a Cloudflare challenge (`HTTP 403`, `cf-mitigated: challenge`). The FA publishes no public API, so a scheduled server fetch is neither available nor permitted, and no attempt is made to get round the challenge. The FA's supported route for websites is the Full-Time widget, which the visitor's browser loads. Because the challenge also blocked this check, **team ID 65157437 and its competition could not be confirmed**. Someone with a browser must open the page and confirm it is Bridlington Town's women's first team and the current 2026/27 competition.

## What still has to happen

1. **Men's: API key.** Email Football Web Pages from a club address to request access for the club's official website. Put the key in `.env` as `FWP_API_KEY`, run `npm run matches:discover` to find the team ID, and set `FWP_TEAM_ID`.
2. **Men's: confirm the response format.** Football Web Pages documents its endpoints but not its JSON field names. The adapter (`scripts/matches/providers/football-web-pages.mjs`) validates every response against an expected shape and refuses anything else. Run `npm run matches:sync -- --save-raw` once, compare `.cache/matches/raw/` with `RESPONSE_SHAPE`, adjust if needed, then set `SHAPE_VERIFIED = true`. Until then, nothing unverified can reach the site; a mismatch shows as "may be out of date".
3. **Women's: widget codes.** In Full-Time, open the team's fixtures, results and league table, choose "Code for your website" for each, and copy the number in `var lrcode = '…'`. Enter the three numbers in the CMS (Teams, Women's First Team) or in `WOMENS_FULLTIME_CODES` in `src/lib/matches/sources.ts`. Check the pages in a browser afterwards, because this could not be tested here.

## How data reaches the website

```
source ──► npm run matches:sync ──► validate ──► merge with last good snapshot ──► src/data/matches/<team>.json
                                                                                      │
CMS fixtures (corrections, extra matches) ──► npm run cms:sync ──► content.json ──────┤
                                                                                      ▼
                                                             astro build: corrections applied, pages rendered
```

- **Locally:** `npm run matches:watch` runs the schedule. When what the site shows changes (and at least every 6 hours, so "last updated" stays current), it asks the CMS rebuild listener (`npm run cms:listen`) to rebuild, or runs `astro build` itself (`MATCHES_REBUILD` in `.env`).
- **Production:** `.github/workflows/match-data.yml` runs the same sync on the same schedule. It commits changed snapshots, which become the last good data, and calls the host's deploy hook. Secrets: `FWP_API_KEY`, `FWP_TEAM_ID`, `DEPLOY_HOOK_URL`.

## Rules the code enforces

- **Results need confirmation.** A match moves from fixtures to results only when the source marks it finished and gives both scores. A fixture whose kick-off has passed stays a fixture and shows "Awaiting result". An unrecognised status is treated as a fixture.
- **Corrections and rearrangements.** Each sync replaces that source's matches with what the source now says. Corrected scores, new dates, postponements and cancellations update the same match, because the match ID stays the same.
- **No duplicates.** Matches are keyed by source ID. The same fixture listed twice is collapsed, keeping the result.
- **Postponed** matches stay in fixtures, marked "new date to be confirmed". **Cancelled, abandoned and void** matches are listed separately and are never shown as results.
- **Time.** Kick-offs are stored in UTC, converted from UK local time with British Summer Time handled, and shown in UK time.
- **Failures.** If a source is unreachable, answers in an unexpected format, loses most of its matches, or sends a table without Bridlington Town, the previous matches and table are kept exactly. The page then says the details may be out of date and links to the source.
- **Not live.** Pages say when data was last updated and never claim live scores.

## Staff corrections (CMS)

Football Editors and Club Admins use **Fixtures** in the CMS:

- **Correct an imported match:** create a fixture with the match's reference (shown as "Ref …" under each match in the Match Centre) in *Source match id*, fill in the correct details and publish. Those details replace the source's and the match is marked "Updated by the club". It rebuilds within seconds. Remove the correction once the source catches up.
- **Add a match the source does not list,** such as a friendly: create a fixture without a source id.
- **League tables:** a published CMS table is shown **only** when the team has no automatic table, and it is labelled "Entered by the club. Not updated automatically."

## Commands

| Command | What it does |
|---|---|
| `npm run matches:sync` | One sync for both teams (`-- --team mens`, `--save-raw`, `--dry-run`) |
| `npm run matches:watch` | Scheduler with automatic rebuilds |
| `npm run matches:discover` | Finds Bridlington Town's Football Web Pages IDs |
| `npm run test:matches` | 23 tests: UK time, status rules, merging, failures, team separation, corrections, schedule |
