# Beneath The Shadow — 0.10.0

The buried city now contains four additional enemy types, two staged optional
crossing puzzles, more varied architecture, and a fourth combat difficulty.
The expedition remains playable alone or in a private two-person room.

## Four different threats

| Enemy | Behavior | Counterplay |
| --- | --- | --- |
| Cinder Sower | Marks a position for 1.25 seconds, then strikes and leaves a short-lived burning area. | Leave the ring; cover stops bombardment and splash. Jumping above a fire patch avoids its ground damage. |
| Tether Widow | Warns for one second, establishes a visible tether, then grants another 0.65 seconds before its first damage tick. | Break line of sight, get beyond its reach, or interrupt with Null. A tether always retains the operator it warned. |
| Glass Skimmer | Hovers across gaps and strafes sideways, then stops during its 0.95-second warning. Alternates an aimed bolt with a two-bolt fan. | Dodge the shown volley and shoot during its stationary warning/recovery. Solid walls still stop it. |
| Lantern Maw | Poses as an irregular lantern, revealing when approached or hit. Winds up for 1.1 seconds before lunging. | Notice the different silhouette/pulse and sidestep its fixed attack direction. It cannot steer the lunge onto another player. |

Nine placements introduce and later combine these roles: the first Sower in the
rivet works, Widow in Lantern quarter, Skimmer in the conservatory, and Maw in the
House of Echoes. The first optional platform course has no authored enemies.
Null cancels the new enemies' pending attacks and prevents new attacks during its
eight-second suppression window; movement continues. Existing hydra suppression
and its finite seven-root early route remain available.

The music threat detector and automatic firing do not identify a disguised Maw.
Simple guidance explains a new counter only when the player observes its tell;
Moderate uses short sensory hints, while Expert relies on the audiovisual cues.
Refuges account for the longer attack ranges and lingering fire, including an
attack threatening the other co-op operator.

## Two distinct crossings

### Suspended street

The initial crossing remains available as a safe teaching jump. Its first
control restores the launch feed and stabilizes the middle island. A second
control restores the street's return walkway. The completed route awards
25 armor and 12 cells to each operator once. Light traces, stage indicators and
the visible walkway change show what each action accomplished.

### Tidal aqueduct

An entry flow control starts the cycling island. The launch prompt checks the
arrival window, while the island's counterweight holds it when an operator is
arriving or standing on it. The middle pressure latch makes that island
permanent; the far sluice control restores the return walkway and awards
35 armor and 12 slugs to each operator once. A Skimmer and the existing
emplacement add pressure to this later course.

All controls use the existing USE action. A usable nearby puzzle control takes
priority over a jump back to the previous island, so landing next to a control
does not force a search for a tiny activation spot. No new phone button or
simultaneous teammate action is required. The original walking route reaches
every mandatory weapon, bell, boss gate and exit without entering either course.

Controls, platforms and the restored walkways use the same authoritative state
in solo simulation, co-op, WebGL and software rendering. Completed puzzle flags
and their once-only rewards survive the team's checkpoint retry.

## Ten district identities

| District | Visual identity |
| --- | --- |
| Falling road | Rust, counterweights and a strip of daylight around the suspended lift. |
| Under the city | Warm lantern circuits and the civic switching obelisk. |
| Rivet works | Furnace teeth, heavy press frames and hot iron. |
| Still laboratory | A cold glass conservatory, pale cultivation beds, violet irrigation and framed skylights. |
| Lantern quarter | House fronts, repeating windows and an abandoned street stage. |
| Suspended street | Cool suspension frames, broken islands and visibly repaired routes. |
| House of Echoes | A drowned orchard with roots, runoff, glass chambers and a fractured growing-house roof. |
| Chapel of the absent | Tall blue ribs, a blind window and the western bell. |
| Broken aqueduct | Turquoise channels, pressure pumps, sluice machinery and a counterweighted crossing. |
| Buried sun | Amber reservoirs, radial machinery and the captive solar core. |

The conservatory and drowned orchard reinterpret the Glasshouse's glass,
cultivation, irrigation and skylight vocabulary in different states of decay.
New solid props have matching collision geometry. Platforms distinguish gaps,
timed surfaces, held surfaces and permanently restored paths.

## Insane in the Membrane

| Tier | Enemy health | Incoming damage | Movement speed | Recovery/cooldown rate |
| --- | ---: | ---: | ---: | ---: |
| Relaxed | 0.8× | 0.55× | 0.85× | 1× |
| Standard | 1× | 1× | 1× | 1× |
| Hard | 1.2× | 1.35× | 1.1× | 1× |
| Insane in the Membrane | 1.4× | 1.7× | 1.2× | 1.22× |

This is available before starting any solo mission and when creating a co-op
room. The previous three tiers retain their factors. Insane reduces attack
cooldowns and recovery durations; it leaves warning duration and countdown
unchanged. Since warnings remain fixed, the complete attack cycle is not
uniformly 22 percent faster. Combat difficulty remains separate from guidance.

The full difficulty name wraps onto its own touch-friendly row in the solo
selector and appears in the team selector and room summary. It persists in
settings and saves. The final Shadow guardian's 1,036 health on Insane is valid
save data, while health beyond the selected tier's maximum is rejected.

## Music

Iron Teeth now starts the mission. The city rotation includes Iron Teeth,
Blacksite Stomp, Ash Cathedral and Shadow Running. Blacksite Stomp also appears
in the rivet works and suspended street; Iron Teeth leads the aqueduct and Warden
rotations; Ash Cathedral leads the hydra and Umbra Engine rotations. Glass Teeth
connects the two conservatory-inspired areas to the Glasshouse's musical palette.

The slower lantern, laboratory and chapel choices, one-time chapel hush,
crossfades, warning ducking and local co-op listening behavior remain. Returning
from a saved run continues its current score rather than replaying the arrival.
The menu still alternates Containment Pulse and Lanterns Below.

## Continuity and validation

The mission's stable IDs remain intact. An explicit migration recognizes the
complete 0.9.4 content set, validates it against its original geometry, and adds
the new enemies and untouched controls. A player inside a newly added prop moves
to nearby valid floor. A pending attack newly obstructed by that prop is safely
cancelled. Earned weapons, root generations, story records, secrets, boss progress
and checkpoints persist. Missing entities, corrupt attacks, future revisions and
impossible puzzle prerequisites are rejected without modifying the active run.
Shadow co-op handshakes carry the content revision in both directions. Older
tabs or an older room service receive a clear refresh message before they can
join or replace an operator using different geometry; other missions keep their
existing compatibility behavior.

Focused coverage exercises enemy attacks and counters, actual Null shots,
co-op target identity and hazard timing, mid-warning saves, old-save migration,
required walking routes, complete puzzle stages, safe timed landings, one-time
rewards, difficulty and observed guidance. The static export checks the complete
local module/resource graph. The Shadow browser regression exercises real UI
inputs and phone layouts against the authoritative local room server.

Release verification: 365 JavaScript tests and all three Python export tests
passed. Eight real-browser integration checks passed at a 926×428 touch viewport,
covering Insane selection, shared equipment, both complete puzzle routes,
checkpoint retry, all four enemy warnings and room cleanup. Six WebGL scenes and
nine software scenes were inspected without browser errors. Phone sizing was
tested in headless Chromium; this is not a physical iOS performance measurement.
