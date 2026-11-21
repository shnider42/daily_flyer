# Source context and evidence limits

The Sources view now distinguishes publisher release records, official updates and plans, historical known issues, developer answers/hypotheses, support acknowledgment, and player observations. These are scoped evidence roles, not numerical site trust scores. They interpret the existing ledger and do not constitute a new full-source or gameplay audit.

## Invariants

This presentation update does not change `data/issues.json`, issue status, original claims, source links, timelines, incidents or the evidence snapshot date. Repeated references and distinct URLs are counted separately; neither is a count of independent confirmations. Official channels repeating the same statement are not independent corroboration.

The visible Supports text is the exact stored `source.claim`. Known topic-only descriptions are flagged as Claim needs detail, including on official sources. Do not replace a vague historical citation with a newer issue summary: reread the specific source, record the supporting passage or exact reply, and update that citation deliberately.

Publication date (`source_published_at`), evidence date (`date`), full-source review date (`source_reviewed_at`), issue review (`last_reviewed`) and URL accessibility (`link_checked_at`) are separate. Missing fields display Not separately recorded. A successful HTTP check is not claim validation. This push creates none of those review dates.

## Independent outcome checks

No outcome verification is inferred from a shipped status, an official badge, a review date, or a working link. A future source may carry `outcome_verification` with `independent: true`, `result: verified | not_resolved | mixed`, an ISO `date`, HTTPS evidence `url`, a nonempty `method` and a nonempty `scope`. All fields are required before a result is displayed. The summary only reports that outcome evidence is linked, never that the whole issue is resolved. These fields require editorial verification; the UI cannot authenticate a test by itself.

## Testing and deployment

`node --test .github/hllv-evidence/test_evidence.cjs` exercises the actual dataset plus adverse fixtures. `.github/hllv-evidence/test_browser.py` checks all issue/source renderings, navigation, disclosure controls, mobile overflow and missing-module fallback. The narrowly scoped install workflow runs local tests before committing generated HTML/assets and then compares production bytes and tests the deployed site. It is not a recurring evidence collector or a replacement for the game-evidence review.

Rollback baseline for this presentation: `f7341a74d56ba8900d3becee15f07b6e82e613bf`. The existing Render service, branch and no-build static hosting remain unchanged.
