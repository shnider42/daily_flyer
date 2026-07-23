# Hell Let Loose Field Brief theme

## Purpose

`hell_let_loose` is a Daily Flyer theme centered on the qualities that distinguish Hell Let Loose from a conventional first-person shooter:

- leadership and commander's intent
- squad and command-channel communication
- player-built spawn infrastructure
- logistics and combined arms
- historical context for represented battlefields and equipment
- community humor that reinforces useful habits

The theme is unofficial and does not use or ship copyrighted game artwork.

## Run locally

```bash
python app.py --theme hell_let_loose --date 2026-07-23 --seed 7
```

Web route:

```text
/?theme=hell-let-loose&date=2026-07-23&seed=7
```

`web.py` normalizes hyphens to underscores, so both `hell-let-loose` and `hell_let_loose` resolve to the same module.

## Render configuration

```text
Root Directory: [blank]
Build Command: pip install -r requirements.txt
Start Command: gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60
DEFAULT_THEME: hell_let_loose
```

## Card cadence

Daily, deterministic by date and optional seed:

- Commander's Intent
- Map of the Day
- Game Mechanic of the Day
- Weapon of the Day
- Radio Discipline
- Community After-Action Note

Stable for the ISO week:

- Class of the Week
- Squad Loadout of the Week

Stable for the calendar month:

- This Month in Hell Let Loose History

Each daily category uses its own deterministic random stream. Adding an item to one pool will not reshuffle unrelated categories for the same date.

## Visual direction

The theme deliberately avoids the default glass-card appearance. It uses:

- khaki field-order paper over a dark tactical grid
- clipped rectangular panels rather than rounded cards
- stencil-style headings and military abbreviations
- map-grid and range-ring decoration
- rust and hazard-stripe accents
- responsive layouts for desktop, tablet, and mobile

All visual changes are contained in the theme's `extra_css` and `extra_js`; the shared renderer is unchanged.

## Content maintenance

Current game additions should be verified against official Hell Let Loose changelogs before editing the pools. Update 20 material includes Juno Beach, Canadian forces, and armor changes. Update 19 material includes Smolensk, artillery squads, and self-propelled artillery.

Historical summaries should stay short, non-graphic, and tied directly to the represented battlefield or equipment. Prefer official museums, military history institutions, national parks, or the game's own historical development briefs.
