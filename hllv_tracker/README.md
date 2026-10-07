# HLLV Evidence Tracker

A public evidence ledger for Hell Let Loose: Vietnam issues and community-server incidents.

The current tracker contains 75 issue dossiers, 157 issue-linked source records and 34 distinct source URLs (reviewed 2026-10-07). It separates support reports, official acknowledgement, reproduction, released changes, post-fix monitoring, and root-cause certainty.

## Core rule

**Unknown is a valid result.**

The tracker records what was observed and who made each claim. It does not infer a root cause simply because a plausible explanation exists.

## Record types

- **Issue**: a canonical problem statement.
- **Observation**: one report or measurement tied to an issue.
- **Incident**: an operational event, especially for SoulSniper and other community servers.
- **Evidence**: a source and the exact claim it supports.
- **Hypothesis**: a proposed cause kept separate from a confirmed cause.

An official patch note is strong evidence that a defect class existed and that a change shipped. It does not prove that every historical incident with similar symptoms had that cause.

A Team17 Support reply confirms that Support received, investigated, or escalated a report. It does not automatically mean the development team reproduced the bug.

A SoulSniper outage can establish that the server became unavailable when operator telemetry supports it. It does not by itself distinguish a game-server crash from hosting, networking, backend connectivity, RCON behavior, or an administrative restart.

## Local preview

From the repository root:

```bash
python -m http.server 8000
```

Then open `/hllv_tracker/`.

## Deployment and evidence refresh

The existing Render static site is `hllv-bug-track`, service `srv-dac8c36k1f9s73dfq2cg`, in the approved My Workspace. It auto-deploys `feature/hllv-bug-evidence-tracker` from `hllv_tracker` with no build step. Do not create another service or change sibling Daily Flyer deployments.

The site reads the committed `data/issues.json`; a reload or deployment does not research new reports. The October 5 maintenance workflow is a guarded one-time migration, not a schedule or an unattended evidence classifier. Original issue dates, player observations and uncertainty are retained. `generated_at` identifies the snapshot review; `last_updated` identifies the most recent recorded issue evidence.

## Page-wide Last updated

The global header reads the saved UTC `page_updated_at` from `data/issues.json` and displays it in America/New_York time with its timezone. It changes only when the published tracker is deliberately updated, never on a visitor reload. `generated_at` remains the evidence-review date; issue and source dates retain their separate meanings. Missing/invalid timestamps display a date-only fallback or Not available, never the current time. The October 7 refresh is a one-time reviewed update, not a scheduler.

## Consistent static snapshots

The editable source remains `data/issues.json`. Published pages fetch a content-addressed `data/issues.<hash>.json`, and load a content-addressed evidence module. This prevents the new page from accidentally combining with an older cached data file or script. The deployment manifest records the actual application URLs. Tests exercise those exact URLs from the ordinary homepage, without test-only random cache-busting. Run `.github/hllv-evidence/publish_assets.py` after deliberate data or evidence-module changes, and publish the resulting HTML, manifest and immutable files together. The older dated migration workflows are not a general-purpose refresh pipeline; do not assume a data-only commit updates the snapshot referenced by the page. Old immutable snapshots are retained so already-open pages remain functional.
