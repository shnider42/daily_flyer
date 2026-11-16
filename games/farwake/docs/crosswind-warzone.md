# Crosswind warzone — 0.27.0

Crosswind adds a persistent Freewake–Meridian fleet battle near Hearth, an infantry front on Vey, and civilian work whose consequences can be revisited. The military simulation is shared; allegiance, sortie credit, relief stories, and their rewards belong to each captain. The existing Hearth system is preserved.

Version 0.26.0 also added three optional return campaigns at Hearth's original contacts. Their choices, actual tasks, personal benefits, and save rules are documented in [campaign-aftermaths.md](campaign-aftermaths.md).

## Location and authored places

Crosswind is the chart entry `crosswind`, at `(4.2, -0.8)`, reachable from Hearth with Fold I. Its opponents are selected from the two nearest **distinct factions with authored territorial anchors**: Freewake at Brindle and Meridian at Meridian in the current galaxy. This calculation does not use nearby transient ships or scattered generated faction labels. The current personal and ground-war rules support the Freewake–Meridian pairing; changing the authored anchors to produce another pair requires updating those rules as well as the fleet styling.

The system is appended after the existing galaxy's metadata and geography are generated. Its decorators run only on the addition, preserving released systems' positions and generated results.

| Place | Implemented role |
| --- | --- |
| **Vey** (`crosswind-vey`) | Industrial planet and the main battleground. Landing directly activates **Ashfall Front** (`ashfall-front`) on the outdoor surface, beside the covered southern approach. Vey has no ordinary port services. |
| **Orsa** (`crosswind-orsa`) | Ice-world refuge outside the main firing lanes. **Thawline Refuge Reception** (`thawline-reception`) is a compact, peaceful authored interior with an arrivals board, staff, and return visits to the rescued tenants. |
| **Lorn** (`crosswind-lorn`) | Desert supply world. **Cistern Nine Dispatch** (`fuel-dispatch`) is a compact, peaceful authored interior with a civilian power-cell allocation choice and persistent staff responses. |
| **Third Light** (`crosswind-third-light`) | Relief station deliberately placed near Orsa and its evacuation approach. Its geography metadata names Orsa as its anchor and records the reason for that placement. |

There are exactly **three planets**, plus Third Light station. Orsa and Lorn have distinct authored support rooms; Ashfall is the full infantry battlefield. The outer approach is a route away from the main engagement, not a guarantee that a ship cannot encounter danger.

## Fleet composition and spatial behavior

The first visit creates **56 military ships: 28 per faction**. They use faction-specific capital classes plus screens and escorts with military profiles and roles. Carrier-launched fighters join this initial force as hangars cycle.

| Size | Per faction | Starting classes per faction |
| --- | ---: | --- |
| Small | 12 | 8 Kestrels, 4 Sparrows |
| Medium | 8 | 4 Martens, 2 Quills, 2 Petrels |
| Large | 6 | 4 Frigates, 2 Bulwarks |
| Massive | 2 | Freewake: 1 Horizon carrier, 1 Judicator. Meridian: 1 Ark carrier, 1 Confluence cruiser. |
| **Total** | **28** | **56 across both factions** |

The factions retain a restrained military hull palette, with Freewake's green split markings and Meridian's amber bar markings providing readable distinctions. The silhouettes also differ: Freewake fields the wedge-shaped Judicator and twin-panel Needle interceptor; Meridian fields the lobed Confluence, asymmetric Ark and four-foil Kite strike fighter. Each side has a real medium picket, **Watchknife**, for arrival contact. If the original picket has been lost, arrival can use another suitable surviving ship or the channel's fallback identity.

Ships fight across three sectors around Vey: the northern battery lane, freight crossing, and evacuation approach edge. Size affects speed, weapon range, and preferred distance. Separation and planetary obstruction checks help keep the engagement distributed; capitals do not use the same movement profile as screens.

The fleet continues fighting other fleet units when a captain arrives. Deliberate assignments against player hulls have two limits: a global budget of approximately 28% of available combatants, with a minimum budget of one when forces are very small, and a physical hull's mass limits its own assignments to **2, 3, 5, or 7**. Larger ships also receive a stronger targeting score and a larger acquisition reach. These are targeting limits, not a limit on stray projectiles or a guarantee of survival. Neutral ships are not deliberately acquired without hostile evidence, but they can cross an existing shot's path.

Tactical target selection runs at 0.45-second intervals. Positions and projectiles continue advancing between decisions.

### Hangars, fighter sorties and batteries

Each faction can maintain two active NPC carrier controllers. Capital and Ark carriers have six fighter slots each; Judicator and Confluence line ships have four. Fighters launch from a physical hangar mouth, accelerate clear of their parent, make attack passes, and return when ammunition, damage, sortie duration or a resupply phase requires it. A returned fighter frees its active hull slot while its carrier rearms the sortie. Parent loss can rehome surviving fighters to a suitable allied carrier or make them disengage. Captured or promoted carriers leave the NPC launch controller, preserving ordinary player-vessel authority.

The battle allows at most **24 active carrier fighters, 12 per faction**, within the overall **80 NPC hull** limit. Ordinary line replacements have a separate 60-hull bound so waves and sorties share capacity without unlimited growth. Current ready, deployed and rearming counts are observable; future launch schedules remain private to the authority.

Heavy ships turn to present a port or starboard battery. Each cannon uses its own hull-relative muzzle, a real half-arc of about 38 degrees and a staggered volley cadence. Forward-armed escorts and fighters use approach, pass and break maneuvers. A ship facing the wrong way must turn before that bank can hit its intended target. Gun stations on player-controlled capitals use these same side-mount positions and arcs; helm fire retains the hull's forward equipment behavior.

Hull-scaled explosion effects have a short flash, expanding shock front, asymmetric fragments, drifting smoke and embers. Fighter departures and recoveries have their own brief hangar effects. Effects are bounded, deterministic from their observed event data and read-only during rendering; reduced motion retains a quieter aftermath.


## Ebb, replacement, and bounded state

The battle cycles through crossfire, western and eastern pushes, a resupply lull, and counterattack. Relative surviving forces can influence the next push; otherwise phase choice and duration vary. Ordinary phases last roughly 62–144 seconds, while lulls use roughly 36–78 seconds after selection. Front positions and firing cadence change with the phase.

Each faction has its own randomized reinforcement schedule. Initial waves are scheduled 36–72 seconds ahead. Subsequent checks generally occur after 26–62 seconds, after 16–36 seconds when a side is depleted, or after 45–95 seconds during a lull when it is not depleted. A check can produce no new ships if the desired force is already present or the room has reached its cap. These ranges describe the authority's scheduling, not a countdown shown to players.

Waves arrive on different lanes and can include heavier ships. Destroying every current opponent leaves the next replacement schedule intact. The battle has no fleet-wipe victory transition. Disabled unoccupied NPC hulls can eventually withdraw; boarding, capture, and canonical player-vessel ownership prevent the fleet controller from silently deleting an occupied prize.

| Fleet limit | Current bound |
| --- | ---: |
| NPC fleet hulls managed by the battle | 80 |
| Ordinary line hulls | 60, within the 80-hull total |
| Carrier fighters | 24 total, 12 per faction, within the 80-hull total |
| Fleet projectiles | 160 |
| Fleet visual effects | 48 |
| Recent loss IDs | 64 |
| Empty-room catch-up | 90 simulated seconds per catch-up |

Promoted or captured canonical player vessels are managed by the ordinary vessel authority, separate from active NPC fleet population. The 80-hull limit is not a promise that the entire realm contains at most 80 ships. Replenishment does not append an unbounded list of ordinary pirate defeats, bounty rewards, or enemy-state records. Fleet kills record war losses without paying the normal raider bounty.

## Arrival, service, and the immediate sortie

An unaligned arrival receives a warning to leave or use the outer relief approach. The captain may remain unaligned, or explicitly support Freewake or Meridian through the warzone briefing. Local support commits that captain in Crosswind; it does not enroll them in the military profession.

Existing military service with either participating faction takes precedence over a new local selection. Clearance requires an enlisted career and faction standing above −25. Reputation alone, without service or a local commitment, does not assign a side. A suspended participating service must be resolved through the service system; it cannot be bypassed by choosing the same or opposing color in the briefing. The local commitment and assigned sortie prevent switching sides midway through this campaign.

Affiliated arrivals receive **Keep the relief approach open** immediately; unaligned captains receive it when choosing a side. It requires both:

1. **45 accumulated seconds within 1,200 units of Vey**, aboard a live, undocked physical vessel in Crosswind.
2. **180 confirmed hull damage to the opposing faction's warships** while the sortie is active and the captain's affiliation matches it.

The two counters are cumulative; damage need not occur during the same 45 seconds or within the approach radius. Shield-only hits, invented command arguments, and shots at the captain's own faction do not satisfy the opposing-hull requirement. Progress survives departure and return. Completion pays **220 cr once**, adds **2 faction standing**, and saves a completed mission. The acknowledgement about a convoy is an authored narrative result; this sortie does not create a separately simulated convoy escort or end the war.

### Physical ship and crew authority

In shared play, the actual helm/controller identifies the vessel's affiliation. A passenger's private ship and personal service do not replace the carrier's physical location or clearance. Personal commitments remain separate from the carrier's persistent hostile evidence.

Confirmed weapon hits credit the firing captain's own damage. The actual commander also receives crew damage when online and physically aboard. An owner ashore does not receive the borrowed hull's duty time or a guest gunner's completion payment, including when the helm is vacant. A captain appears only once in a room's duty accounting, so the ship actor and that captain's personal record cannot double-count the same tick.

Firing on a faction records hostility for the relevant attacking captain and source hull. Changing pilots does not erase the hull's hostile evidence. The same rules apply when an enemy has been promoted into a canonical boarded vessel: damage follows the real hull and still credits the actual attacker. Boarding and joining a boarding party also record the crossing captain's aggression and the source hull's hostility. This does not automatically change another captain's chosen side.

## Rare boarding opportunities

Enemy boarding is conditional and infrequent. The room considers opportunities at randomized intervals; after its initial delay, the current schedule is 55–125 seconds between checks, with a 13% opportunity roll. That is a room-level opportunity, not a per-frame or per-player chance and not a promise that boarding will occur.

A successful candidate still needs a hostile, active, boardable attacker close to a boardable player hull; low enough player shields; no existing boarding fight or pending transmission; and an eligible exposed vessel. A four-second grapple warning gives the crew time to restore shields or leave range. A failed condition cancels the run, and cooldowns separate repeat attempts. Once the grapples attach, the existing boarding authority handles the physical deck and military defenders.

Player boarding remains available for eligible disabled hulls through the actual helm or entry airlock. Shared crew can cross from the ship they are aboard; the source ship and the captured hull remain separate physical vessels. Capture, deck casualties, hull damage, return tethers, and ownership use the established persistent vessel system.

## Ashfall's infantry war

Ashfall is a **96 × 68 tile** authored district with three connected combat lanes: Rail Yard, Central Works, and Tram Street. Loading roads and a central service spine connect the lanes. Ruined blocks and staggered cover leave routes around the fighting. A covered southern aid passage links the central landing shuttle, western clinic, and eastern apartment shelter, with deliberate openings into the combat streets. Both armies and their effects are on this same surface. The state retains the canonical Ashfall encounter key while the captain has Vey as their location and no site interior. Earlier indoor saves migrate to this outdoor representation, preserving personal story outcomes and valid coordinates.

Each faction has **18 persistent infantry slots**, arranged as three six-person squads: leader, medic, support gunner, rifle trooper, marksman and grenadier. The **36 shared slots** are replaced in bounded waves instead of accumulating new soldiers forever. Each role has its own weapon range, windup, burst length, spread, damage and cooldown. Fireteams alternate bounds and covering fire; troops relocate after bursts, use flanking routes, withdraw when wounded or suppressed, and dodge warned blast areas. Medics seek wounded squadmates and leader loss affects coordination. Infantry acquires hostile captains selectively while continuing the faction battle. Neutral captains can still be struck by crossfire or artillery.

Ground phases include contested streets, a Union advance, artillery exchange, a Combine counterattack, and an uneasy resupply lull. Replacement waves restore roughly 3–6 casualties at a time; schedules vary, with shorter intervals during resupply. Artillery and lobbed grenades display impact warnings before damaging exposed units. Layered blast flashes, shock rings, fragments, smoke and craters make impacts readable at both early and late stages. Its scheduled impact grid covers the combat lanes, leaving the southern aid passage outside that grid. Cover and line-of-sight still matter. The passage is a sheltered route, not an invulnerability toggle.

The site never becomes permanently cleared. Persistent visual scars are limited to 32, active mortar/grenade warnings to 10, and cached route fields to 72 per layout. Deaths, replacements, phases, and random state persist within the shared encounter. The civilian rooms on Orsa and Lorn do not instantiate Ashfall's infantry simulation.

## Civilian stories and return visits

The battlefield and infantry casualties are shared. Each captain's civilian actions, decisions, escorts, acknowledgements, and rewards are personal. Viewing another captain's completed ward or refuge must not grant progress or remove one's own unfinished task.

| Story | Actual work and choice | Personal outcome |
| --- | --- | --- |
| **Dr Elian's emergency power** | Accept at the clinic, recover the sealed regulator from the tram depot, and fit it at the physical generator. Choose the operating theatre or triage/evacuation lighting, then debrief. | **180 cr once**, a changed ward and patient response. Triage power increases this captain's escorted group speed from 48 to 58 units per second; the theatre choice retains a different patient outcome. |
| **Asha's evacuation** | Accept the three-seat assignment, reach Siv, Oren, and Mara at the apartment shelter, and physically walk near them to guide them to the clinic. Return to Asha after arrival. | **220 cr once**, cleared shelter bedding, and a saved arrival record. After registration, the three tenants and their responses appear in this captain's Orsa reception follow-up. |
| **Nera's missing-persons record** | Recover both the school register and rail-post identity packets. Choose a public verified memorial or private family notices. | **160 cr once**, a changed memorial and continuing dialogue that acknowledges the cost of either decision. |
| **Lorn's civilian dispatch** | At Cistern Nine's priority ledger, assign the one spare power-cell shipment to Orsa's refuge heating or a cooperative hauler. | A saved `warzoneStories.dispatch.decision`, changed local staff and Orsa heating responses. The hauler branch pays **90 cr once**; the relief-heating branch has no credit payment. |

The escort waits if the captain moves too far away or its route encounters an active shell warning. Arrival requires the group's actual movement, followed by registration at Asha's desk. Disconnecting or advancing NPC-only catch-up cannot escort the group automatically.

Orsa's arrivals board, Tavi Esher, Bren Lo, and the rescued tenants provide return callbacks. Lorn's Edda Kest and Rafi Senn retain both the selected benefit and the unmet request. The dispatch and reception consequences are authored personal scene changes: this release does not simulate the shipment's flight, household wages, station-wide fuel accounts, or an economic effect on every other captain. The hospital choice likewise does not end civilian casualties or alter the shared battle's outcome.

## Persistence, presentation, and maintenance boundaries

An occupied system advances the fleet once per authoritative room tick, regardless of the number of captains. Captains at Ashfall share one ground encounter and its clock. Empty rooms and sites store their current state. Re-entry can catch up **at most 90 seconds of NPC-only simulation**, rather than replaying every second of a long absence. This produces changed fronts and replacement activity without an unbounded restart cost. Player ships, mission duty, and civilian escorts do not gain progress from that catch-up.

Fleet random state, replacement schedules, live hulls, losses, phase state, hangar slots, fighter sorties, battery cooldowns and maneuvers are saved. The v2 fleet record migrates earlier unoccupied Meridian capital NPCs to their faction silhouettes while retaining hull identity and damage fraction; occupied/captured prizes and hulls with a saved deck or damage-control interior keep their actual class. Transient fleet projectiles and effects are not accumulated in save history. Full and compact observations show the current battle while withholding future random state and wave, phase, and boarding schedules. Ground observations retain already visible artillery warnings but strip future battle rolls. Canonical captured vessels remain in the realm's vessel records instead of being duplicated into an ordinary NPC contact.

The briefing shows affiliation, current force counts, phase, sortie progress, and routes to Vey, Orsa, and Hearth. Its live counters refresh within the existing dialog, and menu-session guards reject stale replies after a menu or connection changes. Since 0.26.1, the actual Crosswind location selects three original synthesized heavy battle pieces in a shuffled rotation throughout the system. Peaceful music resumes after departure. See [music direction](music-direction.md).

| Module | Responsibility |
| --- | --- |
| `dist/warzone-content.mjs` | Additive system, territorial-neighbor selection, planet/station identities, faction markings. |
| `dist/warzone-space.mjs` | Fleet simulation, target budgets, waves, phases, projectiles, boarding opportunities, bounded persistence and public view. |
| `dist/warzone-rules.mjs` | Personal affiliation, service checks, confirmed sortie progress and once-only payment. |
| `dist/warzone-ground.mjs` | Shared infantry encounter, authored sites, personal relief/dispatch records, and return-scene views. |
| `dist/warzone-ui.mjs` | Guarded briefing and live counters. |
| `dist/engine.mjs`, `server/realm.mjs`, `server/boarding.mjs` | Actual ship collision, helm/crew attribution, shared clocks, canonical hulls, and physical boarding authority. |

## Focused verification and measured performance

The warzone regression files exercise these behaviors:

- `tests/warzone-space.test.mjs`: composition, geometry preservation, faction selection, replacement after losses, target budgets, rare boarding conditions, state bounds, rendering, and catch-up.
- `tests/server/warzone-space.test.mjs`: one shared simulation for one or ten captains, observed damage in full/compact snapshots, withheld future rolls, restart/revisit continuity, and canonical captured hulls.
- `tests/warzone-integration.test.mjs`: Fold I reachability, picket warning, military clearance, confirmed opposing hull damage, fleet losses without pirate payouts, once-only sortie payment, and military boarding.
- `tests/server/warzone-credit.test.mjs`: borrowed-helm attribution, separate gunner contributions, one duty tick per physical captain, absent-owner exclusions, canonical target damage, and payment replay protection across restart.
- `tests/warzone-ground.test.mjs` and `tests/server/warzone-ground.test.mjs`: connected routes, active armies and replacement, neutral/friendly behavior, medics, physical relief stages, escort movement, Orsa's named arrivals, Lorn's personal dispatch choice, separate captain progress, restart, and NPC-only catch-up.

Before this update, one local synthetic run of the 0.26.0 shared fleet test measured approximately **0.628 ms per ten-captain room tick** and **0.742 ms per captain's compact snapshot**. The test starts with 56 NPC warships fighting normally and ten online captains in separate neutral ships, with no input, positioned away from the engagement. After a 300-tick one-versus-ten-captain comparison, it times 300 further `Realm.step(1/30)` calls. Snapshot timing uses 200 `snapshotFor({ compact: true, drainEvents: false })` calls in 20 batches of ten.

Those older values are a baseline from this Node workspace and do not measure the new carrier or tactical behavior. They are not production budgets or browser frame-time guarantees. They exclude network serialization and sending, browser rendering, and active ten-player close combat or infantry fighting. The test emits fresh timing diagnostics on each run; a deployment or rendering performance claim needs measurements in that environment. Fleet and ground population limits bound work but do not replace those measurements.

Release verification should use the recorded test results for the candidate revision and include real browser and multiplayer playtests for readability, pacing, arrival safety, rare boarding frequency, and civilian-story clarity.
