# Irish Today

The Flask service renders an eight-section cultural journal. `/?theme=irish_today`, the legacy improved/layout aliases and the CLI default all use the production edition. The visual lab is independently accessible with `?theme=irish_today_visual_lab`.

## Edition model

`daily_flyer/irish_edition/edition.py` assembles the feature, Gaeilge lesson, county, curiosity, challenge, sport, photograph and calendar note. The template and `GET /api/irish-today/edition` consume that same model. Use an ISO `date` and optional integer `seed` on either route to reproduce an edition against the same editorial catalog. The default date follows Europe/Dublin.

The archive reconstructs issues from the current catalog. Correcting an item updates the archived issues that include it. Weekly items change on Monday. The county cycle includes all 32 counties. Dates and content roles have independent selection rules. Saturday offers five-strike hurling with an untimed question as an alternative.

## Presentation

The masthead reuses the original Irish Today theme’s `header_title_image`. Night is the server-rendered default. The small appearance script in the document head restores an explicit paper or night preference before first paint. This preference is local to the browser and is independent of edition data and response caching.

Each editorial role has its own template under `daily_flyer/irish_edition/sections/`. The feature opens the page. The remaining roles follow `ROLES` order, with navigation drawn from the sections present. The county atlas and the daily challenge each carry their own interaction data and initialize independently.

## Editing an edition

`daily_flyer/irish_edition/content.json` holds attributed editorial copy, photograph credits, language examples and sources. Add `edition_dates` (an array of YYYY-MM-DD strings) to a feature to schedule a particular issue, or `anniversary` (MM-DD) to make it annual. An exact date takes priority over an anniversary and both take priority over normal rotation. Keep the referenced photograph and its two WebP sizes under `assets/`.

The county atlas reuses the county provider. Gaeilge uses the original word pool. The historical calendar uses sourced entries in the original Irish Today archive. All reading content and initial selections are rendered on the server. A request does not contact an external source. The hurling best, quiz answer and reading appearance live in the reader’s browser.

## Delivery and verification

Rendered HTML and JSON share a bounded per-worker response cache. Conditional requests use ETags. The shared cache lifetime is capped at five minutes or the next Dublin midnight. Photos, scripts, fonts and styles are served from the same origin.

Run `python -m unittest tests.test_irish_today_production`. Use a Friday and Saturday edition to check the quiz and hurling, and check plain HTML with scripting disabled. The source branch for Irish Today review is `staging`.
