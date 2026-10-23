# Catch Up: returning-player guide

Public route: `/#catch-up`. The homepage introduction and top navigation link here.
Ten curated topics interpret released mechanics from the content ledger. The guide
is partial coverage of October 7–21, 2026, reviewed October 23. It is not a complete
tutorial, tactical ranking, or independent gameplay test.

An optional `since=YYYY-MM-DD` includes release events on that calendar date and
later. Role filtering includes shared topics. Current rules always describe the
latest reviewed baseline, even when earlier changes are filtered out. Dates before
coverage and dates after the latest reviewed release have explicit limitations.
No matching records is never presented as proof that the game has not changed.

The URL preserves date, role and an expanded topic. Copy-link has a selectable-text
fallback when clipboard permission is unavailable. There is no account storage,
publication action, gameplay tracking or network write.

Edit `topics.json` for guidance. `build.py` imports the current live baseline,
official sources and related bug summaries. `review-lock.json` pins the reviewed
feature `current` objects and source text hashes. A changed baseline or cited
source stops publication until the advice is re-reviewed and the lock deliberately
updated. Do not regenerate locks blindly. The SHA-256 feature hash is canonical
JSON with sorted keys, UTF-8, ensure_ascii=False and separators=(',', ':').

The existing announcement collector supplies review flags only. New posts and
changed cited source text display a notice; candidate feature matches can flag a
specific topic. No collected text is turned into advice automatically. New guide
topics and revisions use the existing repository editorial process; the separate
moderation practice preview is not a real publishing backend.

Publish through `.github/hllv-homepage/publish.py`. It emits immutable CSS, JS and
data files and includes them in `deployment-manifest.json`. Run `test_data.py` for
review-boundary checks and `test_browser.cjs` in the existing browser QA workflow.
