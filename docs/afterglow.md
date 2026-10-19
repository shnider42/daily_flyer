# Afterglow — a live-music journey

A separate DFE theme for artist following, show planning and personal memories. Starts with Above & Beyond, ilan Bluestone and Oliver Smith. Built on `agent/garage-recovery` commit `94709698c8e614c1f53a94d4a47cef07c9441e14` in branch `feat/afterglow-live-music`.

## Run and deploy

- Repository: `https://github.com/shnider42/daily_flyer`
- Branch: `feat/afterglow-live-music`
- Render service: new Python web service, proposed name `dfe-afterglow`
- Root directory: repository root (leave blank)
- Build: `pip install -r requirements.txt`
- Start: `gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`
- Environment: `DEFAULT_THEME=afterglow`, `PYTHON_VERSION=3.11.11`
- Proposed compute: Free for the initial trial; no database or paid service provisioned.
- Auto-deploy: Yes, on the new branch only.
- Region: resolve from the confirmed Render workspace before creation.
- Default TCP health check is sufficient; no new health endpoint is added.

The Render account is connected. No workspace was selected. The returned workspace is **My Workspace**. Creation is pending user confirmation of that workspace, as required by Render access guidance. Do not create a duplicate service on resume; check the confirmed workspace first.

Local run: `DEFAULT_THEME=afterglow flask --app web run`.
Explicit theme URL: `/?theme=afterglow`.

## What is implemented

- Responsive dark editorial layout; touch-sized controls, focus states and a short first-use guide.
- Three starter artist profiles with official source/tour links, follow/unfollow and custom artist entry.
- Curated show discovery by city/text, region and followed/specific artist.
- Interested / Going / I was there states; saved show snapshots; editable venue, city and lineup.
- Memory timeline, personal rating, companions, standout track/moment and notes.
- Custom shows and past nights; link artists to history for unique-artist counts.
- Date-only `.ics` reminders with exclusive next-day end dates and UTF-8 line folding.
- Browser-local persistence under `dfe.afterglow.v1`, JSON export, validated import with replacement confirmation.
- Explicit failures for unavailable storage; no success indication when a write fails. Invalid saved data is retained rather than overwritten.
- Form and imported strings are escaped. External links allow HTTP/HTTPS only.

## Data and limits

The six starter listings were reviewed on **October 19, 2026** using official artist and promoter pages. Each record has a source URL, checked date and caveat. ABGT700.2 is marked sold out at review. Past dates leave discovery automatically based on the visitor's local calendar date; a plan never becomes an attended night automatically.

This is a manually curated snapshot, not live inventory or a complete event calendar. Following an artist does not subscribe to notifications. There are no accounts, cloud sync, background refresh jobs, ticket purchases, travel-time estimates or claimed set times. Local data survives a service redeploy while the same browser and origin are retained, but not cleared browser storage; exported backups provide portability. A downloaded preview and the deployed site have separate storage origins.

Do not claim superiority to Songkick's event coverage. The differentiator being tested is the complete personal journey from discovery to planning to a meaningful memory. A later release should add a permitted event-provider integration with stable artist/event IDs, deduplication, cancellation handling, retrieval timestamps and an explicit refresh policy. Accounts and a durable per-user store should precede multi-device sync or shared planning.

## DFE reuse and scope

Uses the existing theme loader, theme validation, `build_theme_page` entry point, `PageContext`/`CardItem`, renderer and Flask delivery. CSS, JavaScript, catalog and shell live in `daily_flyer/themes/afterglow_assets`; the theme inlines them through DFE metadata. No shared engine, Garage/Instrument state, existing theme file, existing Render service or default branch is changed. No new runtime dependency is added.

## Verification

Run `python -m unittest discover -s tests -p test_afterglow.py`.
Run `node --check daily_flyer/themes/afterglow_assets/app.js`.
Generate a page through DFE, then run `NODE_PATH=<jsdom node_modules> node tools/test_afterglow_dom.cjs <rendered.html>`.

Functional DOM checks use jsdom. Real browser rendering, iPhone layout and live Render verification remain outstanding until supported preview/deployment access is available. The HTML preview is generated from the same DFE rendering pipeline, not a separate mock implementation.
