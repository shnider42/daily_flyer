# Patch summaries on Overview

The bottom of Overview contains native HTML details/summary disclosures, one per reviewed release, newest first. All begin collapsed. Official links and the summaries remain readable without JavaScript. Related-issue links use the existing bug tracker; a patch mention never changes the linked issue status.

Initial coverage: eight releases represented in the existing ledger, Patch 1.2 through Patch 1.6. This is selected coverage, not a claim of a complete launch-to-current archive. Do not include community feedback posts, preview videos or announced targets as released patches. Dates distinguish publication from live announcements where those differ. The initial summaries for 1.2, 1.3 and 1.4 reuse the ledger's previously reviewed release evidence; a fresh link check is not a new full-source audit.

## Deliberate future updates

Edit `patch_notes` inside `data/issues.json`, preserving source URLs, precise dates, release scope and caveats. Set `patch_notes_reviewed_at` only after reviewing the summaries and `page_updated_at` when deliberately publishing a page update. Do not bump bug-evidence dates for a UI-only edit. Run `.github/hllv-patches/build.py`, then the existing and archive tests. The builder invokes `publish_assets.py` so the rendered archive, page timestamp and content-addressed data are deployed together. Update the coverage assertion/caption when expanding beyond the initial eight releases. Never change old immutable snapshots.

The GitHub workflow is an on-change test-and-publication job, not a recurring news scraper. The separate ChatGPT daily watch sends alerts only; it does not edit or deploy the site.
