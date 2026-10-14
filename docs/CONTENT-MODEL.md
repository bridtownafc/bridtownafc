# Content Model

## Common fields

All publishable records use: stable ID, title/name, slug, status, summary, body where relevant, SEO title/description, social image, canonical override, created/updated timestamps, publish date, author/editor, revision history and relationships. Media includes alt text, caption, credit, rights, focal point and crop variants.

## Core records

| Type | Important fields and relationships |
| --- | --- |
| Site settings | Club name, contact points, ground, social links, emergency banner, default SEO, navigation |
| Season | Name, start/end, active flag |
| Competition | Name, governing body, logo permission, data source |
| Team | Name, category, active seasons, manager, players, fixtures |
| Person | Name, biography, image, socials; specialised as player or staff |
| Player season | Team, season, squad number, position, appearances, starts, goals, assists, cards, sponsor |
| Fixture/match | Teams, competition, season, round, date/time, venue, status, score, attendance, officials, sponsors, report |
| Match event | Minute/additional time, type, team, player, related player, notes, source |
| Line-up | Match, team, starters, substitutes, formation, captain |
| Table snapshot | Competition, season, effective time, ordered table rows, source |
| Article | Type/category, tags, author, published date, image, related match/player/partner/event |
| Event | Type, dates, venue, capacity, booking link, organiser, sponsors; deliberately separate from fixtures |
| Venue | Name, address, map coordinates, directions, accessibility, facilities |
| Partner | Company, tier, sponsored asset, website, copy, logo, dates, featured flag |
| Opportunity | Category, price or POA, availability, duration, benefits, inventory relationship, CTA |
| Inventory item | Asset, capacity, reserved/sold status, period, partner relationship |
| Enquiry | Type, contact details, organisation, message, consent, source, status, assignee, timestamps |
| Policy/page | Page type, owner, review date, attachments, revision |

## Taxonomies

- Article categories: club news, preview, report, player, commercial, community, events, statement.
- Teams: first team initially; extensible to reserves, youth/academy and women’s teams.
- Opportunity categories and partner tiers are managed records rather than fixed code enums.
- Event types are independent from competitions and match types.

## Editorial roles

- Administrator: configuration and access.
- Editor: publish and manage all content.
- Football editor: fixtures, results, line-ups and statistics.
- Commercial editor: partners, opportunities and enquiries.
- Contributor: create drafts only.
- Safeguarding/policy owner: controlled policy review and publication.

High-impact changes such as published scores, commercial pricing, sponsor status and policies should retain an audit trail and optional approval step.

## Lifecycle rules

- Content states: draft, in review, scheduled, published, archived.
- A postponed match retains identity and original date history.
- A player record is not deleted when they leave; the team-season relationship closes.
- Expired partnerships stop promotional placement but retain historical attribution where contractually appropriate.
- Prices may be numeric, ranged or price-on-application; never embed them only in page copy.

