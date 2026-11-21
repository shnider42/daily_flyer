# Mobile messages and guidance

The world must remain visible while the captain moves, fights or explores. Use short notices and a clear current action. Full explanations remain available through the existing notebook, action help, field guide and recovery report. This is a presentation change; it must not alter mission progress, rewards, permissions, damage, encounter timing or learned controls.

## Notices and their history

The notice controller owns a bounded local history of up to 60 messages. `noticeHistory()` supplies newest-first immutable entries with `{ id, text, type, count, time }`. Repeated messages retain the complete text and a repeat count. Changing the current save, captain or isolated test scope clears the previous scope's notices. This history describes the current visit, not a durable multiplayer record.

`appendNoticeHistory()` in `dist/notice-history-ui.mjs` renders full text in a collapsible section of the existing **Voyage log**. Opening a notice or **Recent messages** expands that section; an ordinary visit to the journal leaves it folded. **Recent messages** in the game menu opens that same destination; do not add a separate notebook tab or permanent HUD panel. The renderer preserves line breaks, uses text nodes for public strings, and can mark a requested message without moving focus automatically. It does not write to the game's journal or change any authority state.

The authoritative voyage journal and recovered lore remain their existing systems. Many ordinary event receipts are not journal entries. Do not claim that an abbreviated notice was saved permanently or direct the player to a record that does not exist.

Only archive receipts after their existing visibility and redaction checks. A hidden actor, distant battle or unshown ambient line must not become discoverable through message history. Ambient dialogue enters recent messages only when it was actually shown. Keep storage bounded and isolated; do not copy network credentials, private state or unrevealed encounter data into notices.

## Priorities and screen space

An urgent local danger message must retain its useful response when routine receipts arrive. Incoming fire needs a movement instruction; a boarding alarm needs its immediate context. Repeated notices should coalesce instead of filling the screen or resurfacing stale messages when a newer timer expires. A long notice can have a compact presentation when the complete text remains accessible.

Keep failed actions explicit. A rejected action must not produce a success receipt, and an error already presented in a dialog should not create a second interruption. Suppressing a toast must still allow audio, music classification, combat effects, guidance evidence and event deduplication to run.

Preserve touch targets, keyboard access, polite announcements, text scaling and safe-area spacing. Check portrait and landscape. Later rules in `mobile.css`, `situation.css`, `gunnery.css` and `recovery.css` can override earlier sizing; a single generic CSS rule does not establish the final mobile layout.

## Guidance and recovery remain actionable

Simple guidance retains a short actual next step, including with Compact tips enabled. Moderate offers brief unfamiliar-action help; expanding it requests the complete explanation and stops its automatic timeout. Expert suppresses automatic teaching while retaining orders, hazards, permissions and full help when requested. Reading, expanding or dismissing guidance never earns practice credit.

The mobile layout hides the desktop objective card. Do not remove the only current instruction while shrinking the coach. Relay Nine must still explain its next physical interaction and, during escape, the green return route and entry door control. Visible combat and an occupied gun station take priority over peaceful tasks; hidden encounters never generate advice.

Recovery uses a persistent personal route and a separate report. Keep the real pickup marker, free evacuation action, passenger duty and destination airlock discoverable. Reports wait until medical recovery ends and existing menus close. Their full named outcomes and review history must not be reduced to transient notices.

## Focused verification

Protect notice priority, coalescing, expiry, full-text recovery and scope isolation. Exercise the actual event handlers so visibility filtering, alerts and guidance evidence still run. Existing `app-guidance`, `guidance`, `opening-ui`, `quiet-earth-lighting-route`, `recovery-ui` and `recovery-report-ui` tests cover the related semantic contracts. Browser checks should include a long error, a routine receipt during danger, expanded requested help, large text and both phone orientations.
