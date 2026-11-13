# Patch-review workflow preview

Open `/review-preview.html` on the existing Infierno Liberado site. It replays six
selected examples from the completed October 21 Patch 1.7 review. The before
snapshot is `0b0d84b467f774e3b51107bdf8ed8f948c782039`; the reviewed snapshot is
`2d33453fc5b5f4ae526dfb0c459582fe81505058`. Source summaries are paraphrases.

This is a public demonstration with browser-local drafts and decisions. It does
not authenticate moderators, generate proposals, change ledger JSON, call an
account service, or publish decisions. The examples are already reflected in the
public tracker. The page states this before any review actions and uses noindex.

Approve, edit, reject with a reason, reopen, filter, and export the practice review.
Saved drafts and decisions retain their text and note in local history. Navigating
between examples saves valid edits; leaving with unsaved edits triggers the native
warning. Storage errors explicitly fall back to this session. Clearing browser
storage removes practice history; export preserves a copy. Multiple browser tabs
are not a coordinated review system.

Run the existing `.github/hllv-homepage/publish.py` to publish shared styles and this
preview together. `review-preview-manifest.json` lists the actual deployed assets.
No new dependency is needed at runtime. The preview is linked directly for review,
not added to the main visitor navigation.

Before real moderation, implement server-enforced reviewer authorization, shared
proposal storage, source and record version checks, an approval audit, and a
publication transaction. Existing suggestion permissions do not automatically
grant the authority to publish tracker records.
