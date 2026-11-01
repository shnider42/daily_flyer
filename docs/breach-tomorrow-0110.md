# The Wrong Side of Tomorrow — 0.11.0

Mission 009 (`wrong-side-of-tomorrow`) is an impossible municipal building that
has borrowed a day from people who do not exist yet. It supports solo play and
private rooms of two to four operators. The mission uses world revision 1 and
co-op protocol 3.

## Places and progression

The 91 × 91 map contains nine districts joined by walking loops: the Teeth
Orchard, Inverted Waiting Room, Aquarium of Hours, Wardrobe of Other People,
Exchange for Lost Tomorrows, Sunday That Never Was, Museum of Misremembered
Doors, Court of the Unborn Sun, and Weather Inside Your Head.

Wake the central exchange, restore the Names and Hours registers, and recover
the departure pass. Either register can be approached first. The restored
registers open permanent shortcuts and change the folded doors' destinations.
The interaction prompt names each door's current destination. A fold transports
only its user and refuses an unsafe landing; normal walking routes remain open
for the team to reunite.

The newest enemy types return: Cinder Sower, Tether Widow, Glass Skimmer and
Lantern Maw. The Unfinished Tomorrow guards the court. The map has 19 authored
enemies, 27 interactables and 60 pickups, including earned weapons, shared
refuges and three optional memories.

## Three endings

Each ending has a different prerequisite, title, result text and terminal color.
Choosing one ends the run for the entire team.

| Ending | Requirements | Consequence |
| --- | --- | --- |
| I — An Unfinished Escape | Power, both registers and departure pass | Leave through the southern lift while the anomaly continues. The guardian can remain alive. |
| II — The Last Ordinary Day | Escape requirements and guardian defeated | Use the cyan terminal to seal the anomaly. The lost remain lost. |
| III — A Door for Everyone | Seal requirements, all three memories and the Null projector | Use the violet terminal to return the stolen day and its people. |

Ending choices and their prerequisites use persisted interaction state. Save
validation rejects inconsistent results. Both normal saves and shared checkpoints
preserve earned equipment, memories and permanent routes.

## Four operators and friendly fire

All supported co-op maps now allow two to four players. Tomorrow enables
friendly fire by default. Existing operations default to friendly fire off.
Teammates take 50% of base weapon damage, with armor applied normally; combat
difficulty does not amplify friendly damage. Direct shots, shotgun pellets,
ricochets, beams and grenade splash can hit allies. Enemy aim assistance never
selects teammates. Automatic fire waits when an ally is in the line of fire;
deliberate manual shots can still hit them. Friendly hits warn the shooter and
victim.

Operators have stable P1–P4 identities, colors and sprite numbers. The HUD shows
the other three operators' health and status. All present operators must be
ready to start or resume. Reconnection restores the correct slot, and stale
socket input is rejected. A fifth player cannot enter.

Tomorrow selects one of three deterministic arrival patterns from the room
seed: together, two pairs, or separated. Every arrival has a walkable reunion
route and a personal location message directing the operator to the exchange.
Enemy health scales by `1 + 0.30 × (players − 1)` for this mission. Warning
windows and attack timing retain their authored behavior. Checkpoint restoration
preserves the selected arrival and scaling state without applying health scaling
twice.

## Art and score

All nine districts have distinct wall, floor, ceiling and landmark palettes.
Shared procedural art supplies inverted benches, a crown of teeth, clock-fish,
suspended faces, impossible stairs, an indoor neighborhood, nested doors, a
broken orbital sun and bottled weather. The two registers visibly transform
their districts. WebGL adds geometric stair and orbital structures; the software
fallback keeps the same scenery identities, transformations, consoles and team
colors. Reduced Motion disables the continuous decorative movement.

The opening sequence is Iron Teeth → Blacksite Stomp → Ash Cathedral, including
separated co-op arrivals. Local boss exposure may temporarily interrupt it; any
remaining introduction resumes afterward. District rotations follow the finite
opening sequence. Music progress survives continuation and retries.

This release uses the available committed recordings, approximately 47.5, 48.3
and 49.2 seconds. The earlier reported longer sample-based arrangements were not
published and could not be recovered. No new composition, paid asset service or
Runway work is represented by this release. Playback uses the decoded track's
actual duration rather than a fixed 56-second cap.

## Verification

The final regression run passed all 417 JavaScript tests and all three Python
export tests. The clean export contains 71 assets.

The automated coverage checks map connectivity from all arrival patterns,
prerequisites and all three endings, shared memory progress, safe folds, save
validation, checkpoint permanence, four-player readiness and reconnects,
friendly damage for every weapon family, and music ordering and persistence.
Renderer checks cover all nine palettes, solid landmark alignment, console
states, four teammate identities and visible transformed scenery in both paths.

A live movement-and-combat controller completed the Standard Seal route with
every authored enemy active, using ordinary movement, pickups, refuges and
weapons. Seed 73 reached the ending after 177.6 simulated seconds, nine kills,
103 shots and 45 incoming damage, with 82 HP remaining. No health, ammunition,
kills or player teleports were injected. The completed save restored correctly.
This establishes route and resource feasibility, not subjective human difficulty.

Browser inspection verified the actual menu, mission launch, software-rendered
scenery and teammates, and responsive co-op lobby at phone-sized landscape and
portrait viewports. The cloud browser has no working WebGL context, so real GPU
performance and physical iPhone behavior remain unverified. WebGL construction
and transforms are covered by the renderer harness.
