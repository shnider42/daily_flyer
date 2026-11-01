# People, factions, and rooms that lie — 0.12.0

This update expands The Wrong Side of Tomorrow with people, rival factions and
optional room hazards, and establishes a shared functional room catalog. The
mission remains playable solo or in private rooms of two to four operators.
Tomorrow now uses world revision **2**; the room protocol remains **3**.

## Establishing the room types

The catalog contains 13 functional archetypes: Arrival, Training, Hub, Transit,
Combat, Control, Equipment, Refuge, Archive, Cache, Traversal, Boss arena and
Extraction / decision. These describe a space's purpose independently of its
visual theme and occupants.

Across the nine missions there are still **82 named zone rectangles**. Tomorrow
has **nine districts and 37 overlapping semantic regions**: nine district bases,
24 protected subareas and four optional surprise areas. These counts do not
represent 37 newly constructed chambers. Older maps retain their named zones
without receiving invented room boundaries or implicit hazard permissions.
The [room inventory](breach-room-types.md) lists concrete examples, district
functions and the exact placement rules.

## Nine people, three named characters

The added human roster consists of **three named NPCs, four faction combatants
and two conditional escorts**. They have distinct person artwork and visible
hostility states. The Civic Wardens and the Unfiled fight in the southern
Wardrobe; both oppose the infestation, called the Unfinished in this mission.
Faction combat waits for an observer. Neutral people do not attract aim assist,
but deliberate hits can provoke them.

| Person | Help and consequence |
| --- | --- |
| **Mara Venn — Museum** | Recover her catalogue card from the Wardrobe and return it. Each operator gains 12 cells. While alive and loyal, Mara supplies one living memory: Rewrite accepts two anchors plus Mara, as well as the existing guardian, pass, registers and Null-projector requirements. |
| **Bailiff Rook — Sunday** | Repair his radio for 12 pistol rounds. Wardens and Unfiled stop fighting one another, and two armed escorts enter Sunday against the infestation. |
| **Clerk Twice — Exchange** | Pay 20 pistol rounds for 20 shells and up to 20 armor per operator. After both registers answer, Twice either keeps the bargain or warns before betraying the team. Museum staff-register evidence can expose the deception before the betrayal completes. |

The clerk's disposition is fixed for the run. Aid, survival and betrayal can
change the ending text; Mara also changes a concrete ending prerequisite. All
three original endings remain available through their original requirements,
and betrayal does not take away the departure pass or memories. These are
authored relationships and consequences, without a general reputation meter.

## Two mimics and two hatches

The Wardrobe supply cabinet is a Cache mimic; the Museum exhibit is an Archive
mimic. Both have readable tells and reveal through close approach, inspection
or a real attack. Their object disguise disappears when the enemy unfolds.
The existing Lantern Maw retains its separate light-fixture disguise behavior.

The Museum and Weather service hatches occupy small Traversal areas. Their
physical floor panels measure 1.6 by 1.6 units. A one-second warning lets a player
step away; anyone remaining on the panel takes a short chute to a checked landing
in the same district. Drop damage is capped at ten health and cannot take the
last hit point. Landing checks account for other operators, hostile actors and
active hazards, with a return position if the route is obstructed. Spent panels
show a safety grille and do not retrigger.

Only Archive and Cache classifications permit new mimics; only Traversal permits
trapdoors. Protected arrival vestibules, blue refuges, progression controls,
memories, fold landings and ending points override those permissions. Protection
governs surprise placement; ordinary combat and friendly fire still apply.

## Shared play and persistence

The server owns NPC favors and costs, faction targets, betrayal timing, mimic
reveals, hatch warnings, damage and landings for all four identities. Any operator
may perform an available favor once for the team. The interacting operator pays
the pistol-ammunition cost; Mara and Twice's supplies go to every operator.
Only operators still standing on a triggered hatch are moved. A teammate can
intercept a manual shot intended to probe a mimic when friendly fire is enabled.

The live snapshot includes `tomorrowSociety` and `tomorrowHazards`, alongside the
shared actor and interaction records. Clients display this state rather than
independently choosing outcomes. See [private co-op](breach-multiplayer.md) and
[the protocol contract](breach-coop-protocol.md).

Valid revision-1 saves from 0.11.0 migrate after the original authored roster is
validated. Migration adds the new people and hazards while preserving earned
equipment, permanent shortcuts, memories, checkpoints and completed endings.
Unknown revisions and inconsistent progress are rejected. NPC decisions,
revealed mimics and spent hatches survive checkpoint retry. Solo saves cancel
pending hatch warnings and normalize interrupted drops to avoid replaying a
fall on resume. Live room snapshots remain separate from browser-local solo
saves; room sessions are still temporary server memory.

## Validation and release status

The final regression gate passed **457 JavaScript tests** and **three Python
export tests**. Coverage includes room-policy boundaries, faction combat and
neutral targeting, NPC costs and rewards, both clerk outcomes, Mara's alternate
Rewrite route, genuine 0.11.0 save migration, four-player authority, mimic shot
occlusion, hatch timing and landings, checkpoint persistence and version checks.

Browser checks inspected the actual software-renderer presentation. Automated
renderer checks cover distinct people, disguise/reveal selection, horizontal
GPU hatch geometry and closed/warning/spent software floor projection. The GPU
tests use scene geometry and artwork-selection instrumentation; they are not
real GPU screenshots. Physical-device performance was not established by these
checks. This validation record describes the implementation before deployment
and does not assert that a live 0.12.0 service has been verified.

The [0.11.0 mission release note](breach-tomorrow-0110.md) remains the historical
record for the original Tomorrow map, score, split arrivals and three endings.
