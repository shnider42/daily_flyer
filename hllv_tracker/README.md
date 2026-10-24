# Infierno Liberado

A public evidence ledger for Hell Let Loose: Vietnam bugs, features, changing functionality and moderated community ideas.

## Features & changes

The `#features` section tracks current behavior separately from a feature's latest
development direction, with individual source dates, history, planned release targets
and related bug records. `#feature/HLLV-F008` is an example of a plan revised after
community feedback. The first feature review covers 14 selected topics from Community
Feedback 6–8 and Patch 1.6, reviewed October 16, 2026.

`data/features.json` is the editable ledger; the live page reads a content-addressed
snapshot. `.github/hllv-features/README.md` documents review and publishing. Automatic
announcement matches flag possible updates for review; they never change status.
Existing Suggestion Box approval and account permissions remain separate. These
feature records are curated through the repository, not a new moderator dashboard.

The current tracker contains 103 issue dossiers and 33 feature topics. The October 21 Patch 1.7 review updates 15 existing dossiers, adds 19 scoped release-documented defects, updates five feature topics and adds 17 functionality/content topics. Voice-volume scaling and manual-exit boat shutdown have release evidence; broader replication, persistence and rendering issues are not automatically closed. Khe Sanh and ANZAC remain future 2.0 content; base-PS5 QSSR has no stated release date. Coverage and limits are in `reviews/2026-10-21-patch-1-7-review.json`.

The October 20 review added a qualified settings-persistence report, two older Support follow-ups, and Clan Tags/rank emblems as tracked requests. Original evidence dates and that review remain in `reviews/2026-10-20-official-response-review.json`.

The October 16 bug review refreshed 14 dossiers and added 8 separately scoped issues. Its historical coverage is retained in `reviews/2026-10-16-bug-evidence-review.json`. The ledger distinguishes support reports, official acknowledgement, reproduction, released changes, post-fix monitoring, and root-cause certainty.

## Review workflow preview

`/review-preview.html` replays six Patch 1.7 examples with before/after comparisons,
source evidence, editable proposals, practice decisions, and retained local history.
It is a browser-local demonstration; approval does not publish or change tracker
records. `.github/hllv-review-preview/README.md` documents its scope and the remaining
requirements for real moderator publication.

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

## Suggestion Box pilot

The original Suggestion Box pilot was closed by default and invitation-only. UI assets are content-addressed. Its separate Supabase schema, permissions, tests and activation checklist live in `suggestion_box/`; no private submissions or reviewer correspondence belong in this repository. The original pilot requires the external connection, reviewer authorization and privacy settings before activation. The current community UI is covered by the later community modules and workflows. The existing game evidence is not refreshed by this feature.

## Catch Up gameplay guide

`/#catch-up` is linked from the homepage introduction and the top navigation. It
offers ten reviewed returning-player briefings with independent date, familiarity
and optional role controls. Three reading levels present factual comparisons,
current rules, official sources and related bug records. Every level preserves
access to all reviewed facts; Catch Up does not provide tactical advice. It covers
selected October 7–21, 2026 changes, reviewed October 23; it is not a complete
tutorial. Filtered briefings and expanded topics are shareable through the URL.

Source, review locks and maintenance instructions are in `.github/hllv-catch-up/`.
Run `.github/hllv-homepage/publish.py` to publish the guide and shared assets
together. Changes to a linked live rule or cited source require another factual
review. Automatic announcement collection can flag review needs but cannot publish
new explanations. The guide has no account or database writes.
