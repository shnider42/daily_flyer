# Farwake project continuity

Farwake is an existing DailyFlyer game with solo saves and server-authoritative shared galaxies. Extend its current systems before adding parallel ones.

## Read before changing these areas

- Quiet Earth, Morrow's Relay Nine, corridor missions, The Collective, or the Earth mystery: read `docs/quiet-earth-canon.md`, then the relevant `quiet-earth-*` modules and tests.
- Nightglass chronology, Sol quarantine, or ring habitats: read `docs/nightglass-sol-direction.md`. Nightglass is now explicitly a 93-year prequel; Sol's infestation cordon is accepted direction, with its runtime enforcement still pending. Distinguish these accepted premises from proposed chapter beats, ring placements and the unresolved origin.
- Music or danger detection: read `docs/music-direction.md`. Keep the contributed title recording, its credit, and the Morrow Flightline quiet corridor recording intact unless the user requests an edit to them.
- Expedition content: read `docs/frontier-expeditions.md`. Reuse expedition sites, physical records, interaction prerequisites, saved receipts, and the existing personal Lore archive.
- Biological creatures, caverns or sight conditions: read `docs/creature-ecology.md`. Use habitat-aware catalogs and shared combat rules; darkness, species and hostility are separate facts.
- Mobile messages, guidance or notification history: read `docs/mobile-presentation.md`. Keep the current action clear and full notices accessible without obscuring play or changing authority state.
- Shared-world changes: read `docs/multiplayer.md`. Solo and shared authority must derive the same geometry and consequences from the same galaxy seed.

## Preserve established decisions

- The current playable chart has 26 systems. See `docs/compact-universe-direction.md` for its retained stories, deliberate placements and unresolved story proposals. Do not restore the retired procedural lattice to satisfy old catalog-count fixtures.
- Version 0.38 deliberately begins a new solo/shared galaxy epoch. The user waived compatibility with existing WIP saves and invitation codes; that waiver also permits a fresh start when a later story revision requires it. Reject incompatible records clearly, and save and restore supported voyages correctly. Do not delete historical remote records as part of a reset.
- A frightening atmosphere does not establish actual danger. Harmless effects, empty-hall gunfire, and unrevealed future enemies must not start battle music.
- Corridor exploration uses visible environmental events, stretches of quiet, staged light restoration, and clear nearby guidance. Required actions must remain reachable. Optional investigation can deepen the story without blocking ordinary exploration.
- New galaxy seeds may change routes and optional details. Reentry, loading, and multiplayer synchronization must not reroll an existing galaxy. Preserve released interaction IDs, reward claims, lit relays, and occupied walkable positions.
- The Earth mystery unfolds through evidence and attributed interpretations. Keep author-only revelations out of early player-facing records, UI, music labels, and guidance. Preserve the people rescued and choices already made in the earlier campaigns.
- The Earth campaign ends in Earth's irreversible loss followed by recognition of humanity's worthwhile future elsewhere. It is a long main campaign interwoven with independent stories, not an extinction ending for the setting. Earn its metaphor through concrete relationships and consequences; keep ordinary dialogue and objectives clear, and let play continue after its conclusion.
- Use short, plain instructions on mobile. Navigation can be uncertain; the player's current objective and available action should be understandable.
- Validate the behaviors changed, including save and server boundaries when affected. Use the existing release gates; avoid adding redundant tests that only restate implementation constants.

Record new accepted design decisions in the relevant project document so later work can continue from them.
