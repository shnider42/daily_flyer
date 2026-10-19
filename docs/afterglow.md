# Afterglow — a live-music journey

A separate DFE theme for artist following, show planning and personal memories. Features Above & Beyond, ilan Bluestone, Oliver Smith, FKJ, GRiZ, Muse, The Wonder Years, Four Year Strong and August Burns Red. Built on `agent/garage-recovery` commit `94709698c8e614c1f53a94d4a47cef07c9441e14` in branch `feat/afterglow-live-music`.

## Run and deploy

- Repository: `https://github.com/shnider42/daily_flyer`
- Branch: `feat/afterglow-live-music`
- Render service: `dfe-afterglow` (Python web service)
- Root directory: repository root (leave blank)
- Build: `pip install -r requirements.txt`
- Start: `gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`
- Environment: `DEFAULT_THEME=afterglow`, `PYTHON_VERSION=3.11.11`
- Compute: Free; no database or paid service provisioned.
- Auto-deploy: Yes, on the new branch only.
- Region: Virginia, matching the other DFE services.
- Default TCP health check is sufficient; no new health endpoint is added.

Live service: https://dfe-afterglow.onrender.com

The user confirmed **My Workspace** and the Free plan on October 19, 2026. The service was created with auto-deploy on commit. Initial application commit: `234982357ba4807f56dc02ff02f61fee73a58cfd`; Render reported it live on October 19, 2026. Dashboard: https://dashboard.render.com/web/srv-dbb85r3rjlhs73cqbrg0. Reuse this service for future theme updates.

Local run: `DEFAULT_THEME=afterglow flask --app web run`.
Explicit theme URL: `/?theme=afterglow`.

## What is implemented

- Responsive dark editorial layout; touch-sized controls, focus states and a short first-use guide.
- Nine artist profiles with official source/tour links, individual visual accents, follow/unfollow and custom artist entry. The Anjunabeats connection diagram is limited to the original three connected artists.
- Curated show discovery by city/text, region and followed/specific artist.
- Interested / Going / I was there states; saved show snapshots; editable venue, city and lineup.
- Memory timeline, personal rating, companions, standout track/moment and notes.
- Custom shows and past nights; link artists to history for unique-artist counts.
- Date-only `.ics` reminders, including multi-day events, with exclusive next-day end dates and UTF-8 line folding.
- Browser-local persistence under `dfe.afterglow.v1`, JSON export, validated import with replacement confirmation.
- Explicit failures for unavailable storage; no success indication when a write fails. Invalid saved data is retained rather than overwritten.
- Form and imported strings are escaped. External links allow HTTP/HTTPS only.

## Data and limits

The show proof of concept adds **14 manually reviewed public listings** on October 19, 2026: 3 FKJ, 3 GRiZ, 2 Muse, 1 The Wonder Years, 2 Four Year Strong and 3 August Burns Red. Together with the six original entries, the preview contains 20 events across all nine artists. This is a bounded sample, not full tour coverage. Sources are Ticketmaster artist listings (FKJ, Four Year Strong, August Burns Red), AXS (GRiZ), The O2 (Muse) and the Emo’s Not Dead organizer (The Wonder Years). Every new record links to its source, carries a review date and avoids live availability claims. Only basic event facts are transcribed; descriptions are written for this preview.

The catalog uses `dataMode: reviewed-snapshot` and per-artist `coverage` with status `partial`, source and review date. The app displays counts on artist cards, a coverage disclosure in discovery and original source links beside events. Missing imported dates and filters with no matches are explicitly distinguished from proof that no shows exist. Existing journal identifiers and browser storage key remain unchanged.

The Wonder Years cruise is January 22–26, 2027 on Norwegian Joy, departing Miami. These are event dates, not the band's confirmed performance date. Optional inclusive `endDate` is shown in discovery, details, plans and memories; calendar exports end the day after the final event day. Ongoing events stay in discovery until that end date. Journal saves, edits, imports and exports preserve and validate the range.

No unattended crawler, third-party widget, paid resource, API key or background process was added. Public sources were read for this one-time review; the deployed app serves the checked-in snapshot and makes no requests to those providers. This proves the user journey with real sample listings, not automated ingestion. A future provider integration needs permitted API access and durable refresh state.
The six starter listings were reviewed on **October 19, 2026** using official artist and promoter pages. Each record has a source URL, checked date and caveat. ABGT700.2 is marked sold out at review. Past events leave discovery automatically after their final date, based on the visitor's local calendar date; a plan never becomes an attended night automatically.

This is a manually curated snapshot, not live inventory or a complete event calendar. Following an artist does not subscribe to notifications. There are no accounts, cloud sync, background refresh jobs, ticket purchases, travel-time estimates or claimed set times. Local data survives a service redeploy while the same browser and origin are retained, but not cleared browser storage; exported backups provide portability. A downloaded preview and the deployed site have separate storage origins.

Do not claim superiority to Songkick's event coverage. The differentiator being tested is the complete personal journey from discovery to planning to a meaningful memory. A later release should add a permitted event-provider integration with stable artist/event IDs, deduplication, cancellation handling, retrieval timestamps and an explicit refresh policy. Accounts and a durable per-user store should precede multi-device sync or shared planning.

## DFE reuse and scope

Uses the existing theme loader, theme validation, `build_theme_page` entry point, `PageContext`/`CardItem`, renderer and Flask delivery. CSS, JavaScript, catalog and shell live in `daily_flyer/themes/afterglow_assets`; the theme inlines them through DFE metadata. No shared engine, Garage/Instrument state, existing theme file, existing Render service or default branch is changed. No new runtime dependency is added.

## Verification

Run `python -m unittest discover -s tests -p test_afterglow.py`.
Run `node --check daily_flyer/themes/afterglow_assets/app.js`.
Generate a page through DFE, then run `NODE_PATH=<jsdom node_modules> node tools/test_afterglow_dom.cjs <rendered.html>`.

Functional DOM checks use jsdom. Render reports the initial deploy live and runtime logs show successful HTTP responses. Real browser rendering and iPhone layout remain unverified. The HTML preview is generated from the same DFE rendering pipeline, not a separate mock implementation.
