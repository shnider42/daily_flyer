# RLCS Catch Up

An independent DFE product modeled on Infierno Liberado's dynamic Catch Up:
choose where you left off, then adjust depth without changing the period.
The first edition contains 16 reviewed milestones spanning November 2018 to
September 20, 2026. It is a curated starting point, not a complete event archive
or an automatically refreshed news feed.

## Run and publish

- Existing Flask app: `/v2?product=rlcs_catch_up` (hyphens also accepted).
- To make it the Flask root product, set `ROOT_PRODUCT=rlcs_catch_up` and ensure
  `F9_ROOT_PRODUCT` is unset; that existing setting takes precedence.
- Export: `python scripts/build_rlcs_catch_up.py` after installing `requirements.txt`.
- Static output: `rlcs_catchup/index.html`. Commit the regenerated output with
  every source change. The HTML includes its CSS, JavaScript and reviewed data;
  it needs no external assets, API keys, runtime service or account.
- Render static site: branch `feat/rlcs-catch-up`, publish directory
  `rlcs_catchup`, build command `test -s rlcs_catchup/index.html`.
- Checks: `python -m pytest tests/test_rlcs_catch_up.py tests/test_f9_engine_v2_from_staging.py`
  and `node --test tests/rlcs_catch_up.test.cjs`.

The source of truth is `daily_flyer_v2/data/rlcs_catch_up.json`; the product and
renderer register alongside F9 in DFE v2. Existing products retain their routes.
The new static site is independent of existing Render services.

## Reader behavior

The page starts with three useful stories. Dates, featured team/player names,
regions, topics and eras intersect. An event checkpoint excludes that event's
completion date; a custom starting date includes it. Regions refer to featured
teams, not the venue, and include global format changes. Name search is literal
and limited to the people and teams tagged in this edition.

Reading depth controls explanation density; Detailed also expands all matching
stories. Essentials order is an editorial priority, independent of date order.
Spoilers start hidden, including result-bearing source titles. Revealing one
result does not reveal the others. Non-result stories with a result-bearing
source warn before displaying that link. External pages can still contain
other outcomes. Turning results off conceals all result stories again.

Preferences stay in optional local storage. Share links use a URL fragment and
never enable spoilers for a recipient. There are no tracking scripts. If
JavaScript is unavailable, three sourced, spoiler-safe announcements remain
readable. Recent periods outside coverage explicitly show the coverage gap.

## Editorial updates

1. Open the primary announcement, organizer record or team statement. Verify
   dates, names, scores and what the source actually establishes. Preserve the
   source's publication date separately from the event date and review date.
2. Add a source with a stable id, HTTPS URL, publisher, kind, publication date
   (or null if unavailable), checked date and spoiler flag. New publisher hosts
   must be added to the JS allowlist and publication test.
3. Write a story with explicit before/after facts, context, editorial meaning,
   evidence ids, scope tags and a dated visual. Keep historical rosters labeled
   as historical. Don't infer a current roster from an old result.
4. Supply a genuinely outcome-free safe title and summary for result stories.
   Check source pages for spoilers even when the story itself is not a result.
5. Update coverage bounds to reflect the included stories, then the review date
   only after review. Update the edition description in the HTML when its
   coverage changes. A review date never implies complete coverage.
6. Rebuild the static export, run checks, and inspect desktop/mobile filters,
   spoiler gates and source links. The export equality test catches stale HTML.

Missing regional tournaments, most transfers, intermediate majors and 1v1/2v2
results need future backfilling. A collector, scheduled review queue and review
dashboard are future work; no live ingestion is connected in this release.
