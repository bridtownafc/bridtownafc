# SEO and Migration

## Current evidence

Read-only inspection on 21 September 2026 identified WordPress and these published paths: `/`, `/news/`, `/club/`, `/club/about/`, `/club/history/`, `/club/stadium/`, `/club/staff/`, `/club/contact/`, `/club/policies/`, `/community/` and a duplicate `/about/`. The API exposes additional structured types for matches, competitions, events, players, sponsors, staff and teams.

The homepage response contained `noindex, nofollow` and an empty HTML title at inspection time. Confirm whether this is temporary or site-wide immediately, but do not change production during development.

## SEO architecture

- Unique title, description, canonical and index directive per route.
- Open Graph/X metadata from approved content; no fabricated images.
- `SportsOrganization`/`SportsTeam`, `SportsEvent`, `NewsArticle`, `Event` and `BreadcrumbList` JSON-LD where facts support them.
- XML sitemap split by content type; exclude previews, admin, searches and filtered duplicates.
- Semantic landmarks, one meaningful H1, descriptive links, alt text and accessible breadcrumbs.
- Stable, human-readable URLs; season/filter query parameters canonicalise to the intended index page.
- Optimised responsive images, explicit dimensions and strong internal links among matches, reports, players and sponsors.

## Migration process

1. Export a complete URL inventory from WordPress, XML sitemap, analytics, Search Console and backlink data.
2. Crawl production and record status, canonical, title, description, indexability, content type and traffic/value.
3. Map every valuable legacy URL to a new equivalent using a version-controlled redirect register.
4. Migrate content and media with rights, credits, alt text, publish dates and authors.
5. Resolve duplicate `/about/` routes to one canonical destination.
6. Test representative and high-value redirects; avoid redirect chains and broad homepage fallbacks.
7. Before cutover, compare old/new inventories, structured data, canonicals, sitemaps and robots rules.
8. At controlled launch, enable indexing only after the production domain is verified, submit sitemaps and monitor 404s, coverage and rankings.

Redirects should normally be permanent 301/308 responses and remain for at least 12 months, preferably indefinitely for valuable links.

## URL register fields

Legacy URL, new URL, content owner, content type, action (migrate/merge/retire), redirect status, priority, inbound links, traffic, validation result and notes.

## Measurement

Define consent and privacy approach before analytics. Track useful outcomes—matchday directions, ticket/admission clicks and commercial enquiries—without collecting unnecessary personal data.

