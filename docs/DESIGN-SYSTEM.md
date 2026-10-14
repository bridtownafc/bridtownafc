# Design System Direction

## Visual thesis

**Matchday urgency, Yorkshire confidence, community warmth.** The site should feel like a modern football publication and matchday companion rather than a generic sports template.

## Identity

The required identity is **red, white and black**:

- Club red is the dominant action and feature colour.
- Near-black provides authority and strong match graphics.
- White provides clarity, breathing room and readable editorial surfaces.
- Neutral greys may support borders and secondary information only.

Exact colour values, fonts, photography treatment and official crest variants remain provisional until the club supplies and approves its assets. The current public CSS exposes `#a81c2c` as a red token, but this is evidence, not final brand approval.

Never invent, trace or substitute the club crest. Do not generate fake players or team imagery. Until approved assets arrive, use labelled neutral aspect-ratio placeholders in design work only.

## Provisional tokens

| Token | Provisional value | Purpose |
| --- | --- | --- |
| `club-red` | `#A81C2C` | Primary actions and feature bands; confirm from official artwork |
| `club-red-dark` | `#78121E` | Hover/pressed states |
| `ink` | `#111111` | Headlines and black surfaces |
| `paper` | `#FFFFFF` | Main content surface |
| `mist` | `#F3F3F3` | Secondary surface |
| `line` | `#D7D7D7` | Dividers and quiet borders |

White text on the provisional red and near-black must pass WCAG AA for normal text. Red text is not used for long body copy. Status must never be expressed by colour alone.

## Typography

- Display: condensed, bold football/editorial face; exact family pending licensing and approval.
- Body/UI: highly legible sans serif with clear numerals.
- Match scores use tabular numerals.
- Body copy minimum 1rem with generous line height.
- Headlines are assertive but never compressed to the point of impaired readability.

The current public site loads Big Shoulders Display and Public Sans. They are candidates for evaluation, not assumed final choices.

## Layout and components

- 4/8 px spacing rhythm, strong vertical sections and intentional asymmetry.
- Square or lightly rounded cards; avoid soft generic app styling.
- Edge-to-edge red/black feature bands contrasted with white editorial sections.
- Components: masthead, mobile match strip, score card, fixture card, table row, news card, player card, partner card, opportunity card, event card, breadcrumbs, filters, enquiry form and sponsor placements.
- Photography should show real club, crowd, town and matchday energy, with consistent crops and focal points.
- Motion is brief and functional; reduced-motion preferences are honoured.

## Responsive behaviour

- Mobile navigation prioritises Matches, News, Team, Matchday and Commercial.
- Match cards retain both team names, status and venue without horizontal scrolling.
- League tables use a compact essential view on small screens with accessible expansion for full statistics.
- Tap targets are at least 44 by 44 CSS pixels.
- Sponsor logos retain clear space and are never distorted or recoloured without permission.

## Asset intake

Request: official crest files (SVG/PNG and usage rules), home/away variants, team group images, player portraits, stadium and supporter photography, sponsor logos, photographer credits and usage rights. Record source, owner, licence/permission, expiry, alt text, focal point and approved crops for every asset.

