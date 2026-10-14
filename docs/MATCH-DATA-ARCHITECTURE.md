# Match Data Architecture

## Canonical model

The website owns a provider-neutral match model containing competition, season, stage/round, home and away teams, kick-off in UTC plus local display zone, venue, status, score, attendance, report, line-ups, incidents, officials, media and sponsor relationships. Each imported field records source, external ID, retrieved time and optional manual override.

## Source strategy

1. **Phase 1–initial launch: managed CMS data.** Authorised club staff enter and verify fixtures, results and table snapshots. This is dependable when ownership and operating procedure are clear.
2. **Preferred automation: official competition/governing-body feed or licensed service.** Confirm availability, rights, coverage, update frequency, identifiers, SLA and cost before selection.
3. **Third-party sports data:** acceptable only with an explicit licence, reliable non-league coverage and a provider adapter.
4. **Public social posts or page scraping:** not a source of record. Do not build fragile or unlicensed scraping.

The Northern Premier League and FA competition channels should be approached to confirm an authorised feed or integration route. No provider is assumed approved at this stage.

## Import and override flow

```text
Approved source -> provider adapter -> validation -> staging comparison
                                               -> publish/sync
CMS manual entry ------------------------------> canonical records
Editor override -------------------------------> displayed value + audit trail
```

Imports must be idempotent. External IDs map to internal IDs. Validation rejects impossible scores, unknown teams, duplicates and invalid dates. Conflicts are presented to an editor rather than silently overwriting manual corrections.

## Match states

Scheduled, time TBC, delayed, live, half-time, finished, postponed, cancelled, abandoned and awarded. State controls display, not assumptions based only on time. Live support is future scope; the schema is ready now.

## League table

Each snapshot stores rows with played, won, drawn, lost, goals for/against, goal difference, points and recent form, plus effective time and provenance. Do not derive the official table when deductions or competition decisions may apply; display the authorised source and last-updated time.

## Operations

- Named football-data owner and matchday deputy.
- Pre-match verification, post-match result sign-off and weekly table check.
- Clear stale-data indicator if a feed fails.
- Cache last known valid data; never replace it with an empty failed response.
- Logs and alerts for import failure, schema drift and delayed updates.

