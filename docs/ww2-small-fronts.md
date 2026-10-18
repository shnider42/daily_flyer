# Compact fronts: Foy and Peleliu

Two Current-only DSL playtests, available to new matches. Existing battles,
Midway 2.0, Britain 2.0, weather rules and unit artwork remain unchanged.
Both maps use ordinary daylight, platoon fog/intelligence, shared ground
stacking and the existing infantry combat/engineering rules. Neither adds
off-map support, new aircraft, vehicle classes, or a weather schedule.

| Map | Board | Force | Mission | Unique mechanic |
| --- | --- | --- | --- | --- |
| Foy · Winter Assault | 10×12 | 9 Americans / 8 Germans; two platoons each | Americans hold the village post for two consecutive turn endings; Germans hold out through round 12 | Finite aid posts |
| Peleliu · Coral Pocket | 12×12 | 10 Americans / 9 Japanese; two platoons each | Americans hold the ridge post for two consecutive turn endings; Japanese hold out through round 12 | Cave network with engineer sealing |

## Aid posts

Each army has one fixed, public post. The Americans have four medical supplies;
the Germans have three. An unpinned, living infantry unit within one hex of its
own usable post spends 2 AP and one supply to restore 1 strength, up to its
starting maximum, once per unit per round. Full-strength units cannot consume
supplies. No resurrection, ammunition refill or removal of pinning.

An enemy occupying the post prevents treatment. A destroyed aid building is
unusable until cleared through the existing engineering rules. Medical supplies
are an army-level shared pool and never regenerate. Only the owning army sees
remaining stock. Teammates may order only their assigned units; ordinary
revision checks prevent double-spending the shared pool.

## Cave routes

Three entrances form one connected, public network. Japanese unpinned infantry
standing on an open entrance can relocate to another open entrance for 2 AP.
This ends all remaining AP and clears overwatch, digging in, camouflage,
observation and fire marking. Normal ground stacking applies. Legality previews
use only known occupants; an unseen blocking enemy rejects arrival without
spending AP. Normal reaction fire applies at the exit, not underground.

American engineers within one hex of an enemy-free entrance can seal it for
2 AP and one demolition charge. Each of the two engineers has one charge,
shared with ordinary anti-armor demolition. Sealing permanently closes that
route but does not damage units or block surface movement. Closing two of the
three entrances disables transit. A closed entrance cannot be reopened.

Entrances and closures are public infrastructure, not hidden troop information.
Replays use the historical closure state, redact unseen actors/destinations and
never animate a fictional surface path for cave transit. Ordinary takeback
rules apply; new intelligence or shared-army orders remain committed.

## Implementation and compatibility

- `small_fronts_version=1` is initialized only on the two authored maps.
- Rules, rosters, aid stores and cave closures persist in the saved snapshot.
- All three orders are validated server-side, with normal ownership and AP gates.
- AI may withdraw critically wounded nearby troops for aid, use useful cave
  shortcuts, and send nearby engineers to seal entrances. It does not inspect
  unseen enemies to plan cave exits.
- Orders remain discoverable when unavailable, with reasons, field-manual
  guidance and lessons at every Experience level. Existing icons are reused.
- Army-specific debriefs count treatments, restored strength, cave relocations,
  sealed entrances and consumed medical supplies/demolition charges. Older
  ledgers accept the optional new counters without migration or invented history.

## Historical scope

The Foy setting draws on the 13 January 1945 assault from the Bois Jacques
woodline by the 506th Parachute Infantry Regiment. The aid posts, precise
positions, force strengths and action economy are game abstractions, not a
reconstruction of particular medical stations or an exact order of battle.

Peleliu is a small inland fight after the first wave has landed, inspired by
the island's coral ridges and prepared cave/tunnel defenses. Three entrances
stand in for a much more complex defensive system. Unit counters represent
teams/sections; health recovery is restored fighting effectiveness, not the
return of casualties from death.

Historical references consulted:

- https://www.liberationroute.com/en/pois/1165/the-attack-of-13-january-in-foy
- USMC, *Bloody Beaches: The Marines at Peleliu*, Gordon D. Gayle:
  https://www.npshistory.com/publications/wapa/npswapa/extContent/usmc/pcn-190-003137-00/sec2.htm

## Verification

Focused tests cover map registration/size, named forces, route reachability,
aid eligibility, finite supplies, destroyed posts, cave capacity, unseen
blocking contacts, reaction-fire dispatch, sealing, unchanged other maps,
AI decisions, per-army projections/replays, JSON persistence, undo/redo,
API stale revisions and shared-army control/supply exhaustion.

`tests/ww2-small-fronts-dom.cjs` loads the real app scripts and uses Flask orders
against disposable SQLite. It checks 1440- and 390-wide environments, both
layouts/themes, all Experiences, treatment, cave destination targeting/cancel
and keyboard activation, sealing, reload, debrief and cleanup on another map.
These are DOM integration checks, not real-browser visual rendering proof.

The full WWII regression run passed all 610 tests present at that run. The final
focused run passed 21 small-front tests, including three added afterward for
shared medical-stock ownership, actual overwatch damage and both victory paths.
The existing weather/debrief DOM integration suite also passed unchanged.

Seeded AI-v-AI smoke runs complete without illegal-order loops: Foy seeds 17/42
ended in American wins in rounds 5/8; Peleliu seeds 17/42 ended in Japanese
holdouts at round 12, with cave relocation and engineer sealing used. This
small sample establishes functional playthroughs, not proven balance.
