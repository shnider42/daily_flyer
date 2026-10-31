# BREACH 0.8.0 — The Hollow

A seventh operation (`hollow-19`) adds an abandoned listening complex, a reversible
containment-routing mechanic, and optional environmental horror lore. It is
available solo and in private two-player co-op. Existing missions, the five-gun
inventory, safe touch firing, and the removal of the phone SWAP button are preserved.

## Scale and routes

The authored grid is 129 × 113, with 9,234 walkable cells across twelve sectors.
That is approximately 6.9 times the Glasshouse's walkable area and 2.6 times the
Underworks'. Fifty enemies are distributed among quiet arrival spaces, mixed
encounters, optional detours, a neutral-security skirmish, and the choir vault.
The new pale Echo artwork is a variant of the existing phase stalker, not a new
AI archetype. The Choir Keeper uses the established guardian charge/volley and
exposure cycle with authored cover and supporting enemies.

The intake dock leads to the resonance exchange. Restore the isolation grid,
then reach the west repeater and empty observatory in either order. Both unlock
the choir vault; defeat its keeper, collect the lift key, and return to intake.
Two broad cross-facility ring corridors and vertical connecting passages provide
looping routes. Shortcuts never remove their longer bypass. The archive uses
staggered tape shelves with exterior lanes; the wards use abandoned sleep pods;
the reservoir, freight depot and listening arrays have distinct physical cover.

Six refuges provide repeatable checkpoints after nearby threats are cleared.
Three pairs of discoverable transit terminals reduce return walking. Activate
both ends of a pair to travel; only the operative using a transit is moved.
No objective requires simultaneous switches or a mandatory split-up. The route
is fully traversable by one player. Stairs/elevation are not part of this update.

## New mechanic: containment routing

Three numbered pairs of routing cabinets connect to matching two-cell shutters.
They use the existing USE / E interaction, without another phone control.

- **Field on:** after global power is restored, the closed shortcut powers its
  local cyan containment ring. Ordinary infestation movement and attack timers
  run at 35% speed inside its effective area. Phase windups are interrupted and
  phase arrivals cannot land inside it.
- **Route open:** diverting the same circuit raises the shutter but disables
  that containment field. Either side's cabinet can restore it.

The power source, radius and line of sight determine the effective field. Solid
walls block it. Players, neutral security and the guardian are not slowed.
Incoming plasma remains dangerous; the ring is not an invulnerability zone.
The field ring, affected-enemy tint, switch lever, numbered lamps and shutter
position show the shared state. Simple guidance explains the trade-off,
Moderate reduces directions, and Expert retains the environmental presentation.
The game's progression and difficulty do not change with guidance.

Shutters will not close through a living operative, enemy or active grenade.
Every controlled route retains a bypass, including with all three shortcuts shut.
The server owns the state in co-op. One operative can operate a cabinet while
the other takes the route or fights within the field, but that is a choice.

## Horror without interrupting play

The complex's recorders began answering before their operators spoke. Intake
counts do not match; empty ward monitors still register breathing; the final
transmission insists the building is empty. Six optional tape terminals reveal
short records. Discoveries go into **Pause → Field records**, and only discovered
text is shown. Reading uses the existing interaction; it does not freeze combat
or force a modal on the teammate. The normal team pause makes journal reading safe.

Original in-world placards, sealed crates, sleep pods, tape cabinets, listening
arrays and pale Echo silhouettes support the story. The renderer supplies all
art locally. Short synthesized recording/routing tones accompany interactions.
There is no microphone access, speech imitation, mandatory cutscene, sanity meter,
or randomized jump-scare overlay. Sound is not required to solve the operation.

## Saves and co-op limitations

Discovery, equipment, relay progress and checkpoint state use existing save and
room systems. Solo saves also preserve the current reversible circuit state;
restoring a save after opening and then closing a shortcut is supported. Permanent
route validation now excludes controlled shutters instead of incorrectly treating
an intentionally reclosed shortcut as corrupt progress. Other maps retain their
existing geometry and legacy-save checks.

Co-op discovery and progression are shared. Weapon selection and loose-ammunition
collection remain personal, and friendly fire/body blocking remain disabled.
Downed operatives return at a shared checkpoint. A reconnect retains the same
in-memory expedition, subject to the existing reconnect window.

**Co-op is still a temporary live room, not a durable saved campaign.** Explicit
Leave, room expiry or service restart ends it. This release does not claim
cross-session co-op saves. Solo continuation remains stored on the playing device.

## Verification scope

The new simulation tests cover live-enemy safe arrival, both relay orders and
extraction, a live guardian fight without ammunition injection, circuit bypasses,
closure occupancy, slowed movement, blocked phase arrival, projectile danger,
shared records, room compatibility, checkpoint persistence and invalid saves.
Full-route tests disable ordinary enemies to isolate traversal and progression;
they are not an all-enemy encounter-balance playthrough.

Renderer tests exercise both WebGL scene construction and Canvas drawing, including
physical prop footprints, field-state feedback, distinct routing lever positions,
and bounded frame work. The software low-quality frame remains below 64,000 pixels,
with capped ray steps; the WebGL path culls distant batches and actors. These are
structural checks, not physical-iPhone GPU benchmarks.

`scripts/breach-hollow-browser.mjs` walks the real early route using browser controls
with a normal WebSocket teammate, then checks shared routing, discovered-only journal
text, phone layouts, large-map access, and reconnect preservation. It observes the
authoritative state for timing without injecting equipment, positions or progress.
The release workflow also retains the older networking, Switchyard and Glasshouse
browser checks. Full-length two-person pacing and physical-iPhone responsiveness
still require hands-on playtesting.
