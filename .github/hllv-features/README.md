# Features and functionality tracking

Infierno Liberado now keeps `hllv_tracker/data/features.json` alongside the existing
bug ledger. It records current live behavior separately from the status of a proposed
or released change. A live system can have a further improvement under consideration.

## Editorial publication

1. Read the primary source in full. Preserve its original publication date and the
   distinction between a request, intention, implementation, testing and release.
2. Update the topic's current baseline only when supported by release evidence.
   Append a dated history event; do not overwrite earlier plans when direction changes.
3. Record source identity, direct links, the Steam announcement ID and its normalized
   content SHA-256, using the same normalization as `nightly.py`. Review dates describe
   editorial review, never the time a visitor opened the page. Source review covers
   selected feature statements only, not every bug claim in a post.
4. Link an existing issue only when relevant. Public suggestion links require an
   explicitly reviewed connection and published wording; never copy private submissions
   or moderator correspondence into the repository. There are no automatic or inferred
   suggestion-to-roadmap promotions.
5. Run `python .github/hllv-features/test_features.py`, then
   `python .github/hllv-features/publish.py`. Publish the source JSON, immutable data,
   scripts, CSS, HTML and deployment manifest together after browser verification.

Feature publication currently uses the tracker’s existing repository editorial process.
It does not introduce a new moderator dashboard or grant developer authority to site
moderators. Existing Suggestion Box authorization, review, accounts and conversations
continue through their established backend.

## Automatic collection

The existing nightly entry point reads feature monitor terms and adds
`candidate_feature_ids` to collected announcements. These are wording matches only.
The collector asserts that both reviewed ledgers remain unchanged. New announcements
within the stated coverage window, and edited previously reviewed source hashes, appear
as review leads. Changed sources can flag a topic even if their new wording no longer
matches its terms. A failed/overdue feed does not clear the need for review or renew dates.
Staff-response monitoring remains separately visible on the Overview; feature matching
currently applies to publisher announcements, not automatically to individual replies.

The first release reviews selected topics from Community Feedback 6–8 and Patch 1.6;
it is not a complete roadmap. No sample community submissions are seeded. Official
announcement connections link directly to feature dossiers. Related bug dossiers link
back to feature records without inheriting their status.

## Verification

`test_features.py` checks schema rejection, source hashes, collector preservation and
matching. `test_browser.cjs` uses the real published local assets, with synthetic external
account responses: list/detail navigation, search, filtering, history, both themes,
mobile widths, new/edited source review, failures, retry and related bug navigation.
It creates no accounts, suggestions, votes or messages.

Serve `hllv_tracker` on port 8765, then run:

```
node .github/hllv-features/test_browser.cjs
```

The test accepts `HLLV_TEST_URL`, `HLLV_BROWSER_EXECUTABLE` and optional
`HLLV_CHROMIUM_ARGS_JSON`. Production verification separately checks that normal URLs
match the committed bytes. Test screenshots are temporary artifacts.
