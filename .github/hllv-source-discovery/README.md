# Bounded Steam discovery and selected affiliate-directory verification

This extends the existing reply monitor; it does not change reviewed game statuses,
curated patch summaries, accounts, roles, moderation, votes or private conversations.

## Active scope
The existing issue-source threads are scanned first. The same anonymous HTTP client
and shared budget (100 requests / 300 seconds, one-second minimum spacing, explicit
robots checks and stop-on-access-restriction behavior) then reads the first two
recently active listing pages of Report a Problem and General Discussions. At most
24 discovered discussions are scanned per pass, including later comment pages.
A previously created discussion that becomes active can be discovered. Last-poster
names, titles and hover text are leads only; original replies still require the
reviewed exact account ID and a current Steam developer marker.

Discovery is bounded, not exhaustive. It monitors replies, not opening posts.
Zero-reply leads are listed as not scanned for replies. New or older active topics
outside the selected listing window can be missed. Retained candidates rotate by
oldest scan attempt; previously discovered staff threads continue to be followed
when they leave the front pages. Unqualified leads expire after 30 days or a 150-lead
cap; established staff-response evidence and identity-review gaps are retained.
The output states the number of candidates awaiting a first complete scan and those
not fully rescanned this pass. A green workflow is not full coverage.

## Evidence boundaries
Results live under official-feed.json.response_monitor.discovery. The existing
response_monitor.threads remains the separate reviewed-source set. Discovered
threads have no automatic issue ID assignment. Changes use original dates and
stable reply IDs/hashes. The first pass is baseline; subsequently found old replies
are historical discoveries. Missing pages keep the last complete scan and prior
evidence, while unobserved replies are marked not reverified. Whole player posts and
whole staff responses are not republished. The latest excerpt plus discovered topic
title is capped at 24 words per thread. Source-identity and content-review holds are
separate and remain enforced. Duplicate or shifting listing pages are incomplete.

## Affiliate status — not active content collection
The release checks exact named SoulSniper and Gebatron channel links on the official
War Correspondent directory. It does not fetch YouTube videos, comments or replies,
and it does not use API credentials. `affiliate_monitor` always explicitly reports
`content_collection_enabled=false` / `not_connected`. A failed directory check does
not claim partnership was revoked. Partnership does not establish authority to
speak for Team17.

To activate content monitoring, use supported YouTube Data API access with verified
channel IDs and complete reply pagination, together with refreshable/deletable
storage, privacy disclosures and error reporting. Do not archive YouTube API comment
bodies in permanent public Git history. Do not ask creators for passwords or use
undocumented scraping to work around missing API access. An API key alone does not
activate an unimplemented collector. This part remains a separate integration.

Reference API docs: https://developers.google.com/youtube/v3/docs/channels/list,
https://developers.google.com/youtube/v3/docs/commentThreads/list,
https://developers.google.com/youtube/v3/docs/comments/list,
https://developers.google.com/youtube/terms/developer-policies.

## Deployment and tests
`install.py` makes guarded integration edits and reuses the existing content-addressed
publisher. Initial work is committed without changing the site; the release job runs
unit/browser tests and a real collection before committing generated site assets.
Existing-source, discovery and affiliate coverage remain separate. The nightly entry
point runs enrich.py; no extra schedule or database changes are introduced.

Unit fixtures never contact sources. Browser tests simulate data and accounts and
never submit real suggestions or votes. Real public-source collection is a separate
step. Ordinary live URLs must match committed assets before declaring deployment.
The first successful release does not prove the next unattended scheduled run.
