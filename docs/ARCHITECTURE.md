# Bridlington Town AFC Website V1 — Architecture

## Status and evidence

Phase 1 defines the target architecture only. The repository was empty at discovery and contained no application, framework, documentation or deployment configuration. The public site was inspected read-only on 21 September 2026. It is a WordPress site hosted through WordPress.com infrastructure and exposes structured types including matches, competitions, players, teams, staff, sponsors and events. Published routes observed include `/`, `/news/`, `/club/`, `/club/about/`, `/club/history/`, `/club/stadium/`, `/club/staff/`, `/club/contact/`, `/club/policies/` and `/community/`.

The public site returned a `noindex, nofollow` directive during inspection. This must be investigated before migration because it can prevent search indexing. No production setting was changed.

## Recommended stack

- **Frontend:** Astro with TypeScript, using server-rendered or hybrid pages only where needed.
- **CMS:** Sanity as the preferred structured headless CMS, subject to cost and editor trial in Phase 2. Directus is the preferred self-hosted alternative; retained WordPress headless is the lowest-change fallback.
- **Styling:** design tokens plus scoped component CSS; minimal client JavaScript.
- **Validation:** Zod schemas at CMS/data boundaries.
- **Forms:** server-side endpoint with schema validation, rate limiting, honeypot/Turnstile and auditable delivery.
- **Media:** CMS asset pipeline with responsive AVIF/WebP derivatives and focal-point crops.
- **Hosting:** provider decision deferred. The application must support immutable builds, previews, CDN caching, secrets management and rollback.

Astro fits a content-heavy football site because it produces fast semantic HTML while allowing interactive islands for filters, live scores and future ticketing. The CMS remains independent, so normal club updates do not require a developer.

## Application shape

```text
CMS / approved data sources
        |
        v
Typed content access layer
        |
        +-- build-time pages: club, policies, evergreen content
        +-- refreshed pages: news, squad, sponsors, fixtures
        +-- future live layer: score and match events
        |
        v
Astro routes and components -> CDN/edge -> supporters
        |
        +-- form service -> categorised commercial enquiries
        +-- analytics -> privacy-conscious reporting
```

The content access layer isolates CMS queries and football-data providers from UI components. Provider adapters return a canonical internal model so a manual feed can later be replaced by an official integration without rebuilding pages.

## Proposed routes

| Area | Routes |
| --- | --- |
| Home | `/` |
| Match Centre | `/matches/`, `/matches/[season]/`, `/match/[slug]/`, `/table/` |
| Team | `/teams/`, `/teams/[team]/`, `/players/[slug]/`, `/staff/[slug]/` |
| News | `/news/`, `/news/[category]/`, `/news/[slug]/` |
| Club | `/club/`, `/club/history/`, `/club/stadium/`, `/club/directions/`, `/club/officials/`, `/club/honours/`, `/club/policies/`, `/club/accessibility/`, `/contact/` |
| Community | `/community/`, `/events/`, `/events/[slug]/` |
| Commercial | `/commercial/`, `/commercial/opportunities/`, `/commercial/opportunities/[slug]/`, `/partners/`, `/partners/[slug]/`, `/commercial/enquire/` |

## Implemented team routes

The site has two team sections built from one set of templates (`src/pages/[team]/`) with separate data (`src/data/teams/`):

| Area | Men's | Women's |
| --- | --- | --- |
| Home | `/mens/` | `/womens/` |
| Match Centre | `/mens/matches/` | `/womens/matches/` |
| Squad | `/mens/team/` | `/womens/team/` |
| Player profile | `/mens/team/[slug]/` | `/womens/team/[slug]/` (once players exist) |
| News | `/mens/news/` | `/womens/news/` |

- The active team comes from the URL. The header switch links to the equivalent page of the other team; a player profile links to the other team's squad.
- `/` opens the last team chosen in this browser (localStorage key `bta:team`), defaulting to the men's team. A remembered choice never overrides an explicit team URL.
- `/club/`, `/commercial/` and `/contact/` are shared. They read `?team=`, then the remembered choice, then the default, and keep the selected team in the header and footer links.
- Legacy `/team/`, `/matches/`, `/news/` and `/team/mens-first-team/[slug]/` redirect to the men's equivalents.

## Homepage priority

On mobile, the first viewport should expose the next fixture or latest result, a direct Match Centre link and an urgent matchday action such as tickets/admission or directions. Below it: league position, latest news, matchday information, featured commercial opportunity, partners, community and newsletter/social links. Editorial and commercial content must remain clearly differentiated.

## Boundaries and principles

- Read operations are separate from admin/editorial operations.
- No component queries a third-party provider directly.
- Manual overrides are supported and carry provenance, author and timestamp.
- Draft/preview and published content remain distinct.
- Future ticketing, shop, CRM and live-data services integrate through adapters or outbound links, not tightly coupled page logic.
- Club, competition, season and team identifiers are stable IDs rather than display names.
- UK dates, time zone and match postponement/abandonment states are first-class.

## Non-functional goals

- Mobile-first and resilient on poor connectivity.
- WCAG 2.2 AA target.
- Core Web Vitals targets: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 at the 75th percentile.
- Progressive enhancement; essential information remains available without client JavaScript.
- Structured logging and error monitoring without collecting unnecessary personal data.

