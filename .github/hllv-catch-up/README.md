# Catch Up: returning-player guide

Public route: `/#catch-up`. The homepage introduction and top navigation link here.
Nineteen curated topics describe released mechanics from the content ledger. The guide
is partial coverage of October 7–21, 2026, reviewed November 9. It is not a complete
tutorial, tactical ranking, or independent gameplay test.

The November 9 review adds graphics/display options, server-browser persistence,
Vote Kick, the Official Server inactivity timer, menus/tutorial labels, Unit naming,
vehicle impacts, Commander indicators and Tunnel-collapse timing. The latter two
retain the earlier Patch 1.6 documentation where Patch 1.7 repeats a rule. Existing
live baseline hashes remain unchanged; newly included baselines were checked
against the released notes before adding their locks.

An optional `since=YYYY-MM-DD` includes release events on that calendar date and
later. Role filtering includes shared topics. Current rules always describe the
latest reviewed baseline, even when earlier changes are filtered out. Dates before
coverage and dates after the latest reviewed release have explicit limitations.
No matching records is never presented as proof that the game has not changed.

Familiarity is self-selected, independent of time away and optional role filtering:

- `depth=overview` / **A little**: short, plain-language summaries, additions first.
- `depth=refresher` / **The basics**: before-and-after release comparisons (default).
- `depth=detailed` / **Very well**: all topics listed, current rules and related fixes
  expanded inside each opened topic.

All tiers contain the same reviewed topics, comparisons and sources. Overview and
refresher disclose additional detail on demand. Hours played are not inferred or
collected. Switching familiarity preserves date, role and the open topic. Comparisons
describe a single release; the separately labelled current rules describe the latest
reviewed version. Earlier patch history still needs backfilling.

The URL preserves date, role, familiarity and an expanded topic. Copy-link has a selectable-text
fallback when clipboard permission is unavailable. There is no account storage,
publication action, gameplay tracking or network write.

Edit `topics.json` for factual summaries, context and sourced before/after descriptions.
Never infer an unrecorded earlier numeric value. The former tactical `guidance` field
is rejected by the build. `build.py` imports the current live baseline,
official sources and related bug summaries. `review-lock.json` pins the reviewed
feature `current` objects and source text hashes. A changed baseline or cited
source stops publication until the facts are re-reviewed and the lock deliberately
updated. Do not regenerate locks blindly. The SHA-256 feature hash is canonical
JSON with sorted keys, UTF-8, ensure_ascii=False and separators=(',', ':').

`reviewed_source_ids` records newer official announcements that were checked but
did not release new gameplay rules. The November 6 Community Feedback #9 is pinned
by source identity and content hash for that purpose. It is included in the built
source list so the browser does not flag an already-reviewed announcement again;
it does not extend `coverage_through`, add a release comparison or promote a future
feature into a live baseline. Edited known sources and newer announcements still
require review. Source publication/review dates and the review lock are validated.

The existing announcement collector supplies review flags only. New posts and
changed cited source text display a notice; candidate feature matches can flag a
specific topic. No collected text is published as a factual revision automatically. New guide
topics and revisions use the existing repository editorial process; the separate
moderation practice preview is not a real publishing backend.

Publish through `.github/hllv-homepage/publish.py`. It emits immutable CSS, JS and
data files and includes them in `deployment-manifest.json`. Run `test_data.py` for
review-boundary checks and `test_browser.cjs` in the existing browser QA workflow.
