# Patch summaries on Overview

The bottom of Overview contains native HTML details/summary disclosures, one per reviewed release, newest first. All begin collapsed. Official links and the summaries remain readable without JavaScript. Related-issue links use the existing bug tracker; a patch mention never changes the linked issue status.

Initial coverage: eight releases represented in the existing ledger, Patch 1.2 through Patch 1.6. This is selected coverage, not a claim of a complete launch-to-current archive. Do not include community feedback posts, preview videos or announced targets as released patches. Dates distinguish publication from live announcements where those differ. The initial summaries for 1.2, 1.3 and 1.4 reuse the ledger's previously reviewed release evidence; a fresh link check is not a new full-source audit.

## Deliberate future updates

Current coverage is nine releases through Patch 1.7 (October 21). The guarded `.github/hllv-refresh-20261021/review.py` reuses the native-disclosure renderer while preserving the later date-order control, developer-update disclosure and existing layout. The original archive builder is a historical migration with eight-release/date assumptions; do not rerun its main entry point against the expanded archive without reconciling them.

Edit `patch_notes` inside `data/issues.json`, preserving source URLs, precise dates, release scope and caveats. Set `patch_notes_reviewed_at` only after review and `page_updated_at` on deliberate publication. Preserve the static archive and date-order integration, then run the current review tests and `.github/hllv-homepage/publish.py` so the HTML, timestamp and content-addressed data agree. Do not bump bug-evidence dates for a UI-only edit or change old immutable snapshots.

The GitHub workflow is an on-change test-and-publication job, not a recurring news scraper. The separate ChatGPT daily watch sends alerts only; it does not edit or deploy the site.
