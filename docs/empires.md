# Empires: Riverlands first playable

Empires lives in the existing `ww2_web:app` deployment. The home screen's
Squad Leader / Empires selector changes the visible game without navigation,
changing the URL, or changing another player's selection. Existing DSL links,
matches and saves remain valid. The selection is a browser preference; match
ownership is independently validated on the server.

## Playable scope

- One seeded 16 × 12 map, two civilizations, a 40-round campaign.
- Solo against a bounded rules-based opponent, or a human opponent joining by
  campaign code on the same site. Both factions are selectable.
- Cities, population, food, production, gold, military upkeep, eight technologies,
  six unit roles, five buildings, farms, mines and roads.
- Peace, mutually accepted trade (+3 gold each turn), declarations of war and
  peace offers. An accepted trade treaty makes the initial AI prefer peace.
- Win by capturing the opposing capital, or development score at round 40:
  4 per city + population + 3 per technology + 1 per ruin. Equal scores draw.
- Automatic server saves, browser resume shortcuts and optional linking to the
  existing commander identity for cross-device resume.

This is a first playable ruleset, not a claim of finished human-tested balance.
Two heuristic AIs completed four seeded development games with scores 64–64,
62–64, 65–65 and 64–65. That checks gross economic asymmetry only, not military
balance or the quality of decisions. Later development can plateau once cities
and research reach their caps; human pacing and victory scoring need playtests.

## Display and phone controls

Empires has a midnight-blue and brass night palette, with a slate/parchment
daylight alternative. The shared appearance preference remains the same across
both games; selecting Empires changes its palette and browser theme color.

Below 1100px, campaigns use DSL's map-first interaction pattern: a fixed dynamic
viewport, safe-area padding, compact resources, previous/next units with AP,
centering/fit controls, selected-unit status, quick orders and End turn. Landscape
phones place orders beside the map. Research, diplomacy, city production, the
roster and campaign menu use native modal sheets with a Back to map control.
Selecting an own unit leaves the map usable for movement; selecting a city or
rival opens its details. The roster includes cities, including those under units.

These are the existing map and controls moved between layout anchors, not a
second campaign state. Sheet navigation does not change the camera or send an
order; resizing restores the same controls. Quick orders and the full Orders
panel use one action-button builder and the server's legal actions. An already
fortified unit cannot waste AP repeating Fortify through either UI. A pointer
drag is suppressed as a map click, preventing an accidental move on release.

The Empires phone shell is independent of DSL's layout manager because their
unit, city and turn states differ. Hex geometry and movement animation remain
shared. This does not claim parity with every DSL display option or gesture.

## Deliberately shared

`hex_geometry.py` contains the exact former DSL odd-row cube conversion,
distance and line interpolation. DSL re-exports those functions through its
existing imports. Empires uses them directly, so coordinate fixes apply to both.

Empires uses DSL's `center()` projection and `ww2Motion` counter renderer.
The renderer accepts an explicit game context while preserving its existing
DSL live/replay default. Confirmed moves animate on the independent counter
overlay; animation does not delay another order. Fog checks use the supplied
game's side and visible hexes. AI batches are not presented as invented visible
paths through fog.

Rule similarities are intentional: terrain-dependent AP, banking at most one
unused AP, one road bonus per turn, two friendly units per hex, 2-AP attacks,
cover-dependent d6 hit thresholds, fortification and 1-AP rally after a hit.
These rules are implemented independently; changing civilization balance must
not silently alter saved DSL battles. Full DSL combat, co-op, air operations,
replay and undo are not claimed as Empires features in this release.

## Ownership and persistence

`empires.web.install()` adds routes under `/api/empires/games` to the same Flask
app and uses its existing connection factory and commander-session validation.
It creates only additive, namespaced tables:

- `empires_games`: opaque invitation ID, hashed seat tokens, optional commander
  IDs, versioned game state, timestamps.
- `empires_commands`: per-campaign, per-side command IDs and request bodies for
  idempotency. Retrying the same order returns the current state; reusing an ID
  for a different body is rejected.

State changes use `BEGIN IMMEDIATE`, an expected revision and a unique command
ID. The solo AI runs within the same committed turn, bounded to 72 unit orders.
The browser recovers uncertain network results with a GET, never blind retries.
There are no new dependencies, Render resources, hostnames or database paths.

Fog-filtered responses contain remembered terrain and city reports, currently
visible opponents, the requesting side's economy and legal orders. Random seeds,
opposing economics, hidden production/research and private journal entries stay
on the server. `empires-sessions` is separate from all `ww2-*` seat storage.

## Validation

Run with the dependencies from `requirements-ww2.txt`:

```sh
python -m unittest discover -s tests -p 'test_empires.py' -v
python -m unittest discover -s tests -p 'test_ww2.py' -q
python -m unittest discover -s tests -p 'test_ww2_dsl.py' -q
node tests/empires-dom.cjs
node tests/ww2-ground-roles-dom.cjs
```

DOM checks require `jsdom`. They exercise the full application document against
real Flask test-client requests, including unchanged URL, move/AP, research,
AI turns, saved resume, human invitations, theme changes and returning to DSL.
They also cover phone control placement, quick orders, sheets, camera/selection
preservation, city access, pan-versus-tap handling and resize restoration through
320px portrait, small/large phone landscape and desktop viewport settings.
They do not validate rendered browser layout. Real phone/desktop playtesting,
Safari motion inspection and military balance remain important follow-up work.

The pre-Empires source baseline was
`c27d6e2f8b3498e62d6f84c432a407bc1fd0ddb9`. Its entry HTML matched the deployed
DSL HTML before this change. Rolling source back does not require dropping
Empires tables or touching existing DSL saves.
