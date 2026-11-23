# CHALK: expanding the field experience

This is a working design direction for the fictional game, informed by the user's request for a larger, more convincing squad experience. It distinguishes the implemented 1.8 pass from proposed future systems. The existing historical-context panel remains the authority on what the game represents: an invented squad and compressed encounters in a documented historical setting.

## The experience to build toward

The player should be trying to keep four people together while a plan changes around them. Threats should have identifiable behavior; cover should matter; sounds should help explain events the player cannot see; and decisions should leave practical and human consequences. Uncertainty should come from incomplete information, changing routes, and limited resources. Controls and feedback still need to be clear enough to make a deliberate choice.

The strongest additions connect several systems. A launcher round opening a wall can create a route, expose the medic, draw attention, put residents at risk, and give a distant squad mate a different sequence of sounds. That is more useful than a larger explosion that changes only the picture.

## Current foundation: 1.7

- Four specialized squad members, direct ground orders, quick solo switching, two-human co-op, enterable houses, seeded map variation, and shared squad sight.
- Field radio decisions in all four chapters; optional resident aid; explicit supply/time costs; bounded consequences carried through Continue operation.
- Persistent dead bodies, separate recoverable casualties, blood impacts and ground marks, and independent blood/distress settings.
- Performed pain and fear recordings, spatial impact layers, contextual wreck ambience, and audio priority for useful nearby events.

## Implemented in 1.8

### Threat variety with encounter limits

| Type | Intended encounter role | Readable behavior |
| --- | --- | --- |
| Rifleman | General street and doorway opposition | Short fire opportunities and ordinary movement between positions. |
| Support gunner | Holds an approach and makes crossing dangerous | Braces before sustained bursts, has a larger weapon silhouette, pauses between bursts, and can be disrupted by suppression or loss of sight. |
| Flanker | Pressures a static or tightly grouped squad | Moves through reachable side routes, repositions between firing opportunities, and has lighter equipment. Route decisions must use known or recently observed positions. |
| Sniper | Occasional long-range threat | Slower aimed shot with the existing visible warning when observed; one active sniper at a time. |

Increase the live enemy budget conservatively while also limiting expensive or dangerous role combinations. A count limit alone allows an unpleasant all-sniper or all-machine-gun encounter. Keep the population, role counts, path replanning, and reinforcement intervals bounded. Reinforcements must enter outside actual squad sight and at a reasonable separation, including when binoculars or a new breach extend that sight.

Threat recognition should come from observed weapons and actions. Unarmed residents remain civilians. Avoid adding combat labels that reveal people through walls or turn their appearance into a reliable friend-or-foe signal.

### Sound that arrives from its source

Treat a shot as several events with different origins:

1. A muzzle report originates at the weapon when it fires.
2. A supersonic pass originates along the projectile's actual nearby trajectory.
3. A ground, wall, equipment, or body impact originates at the collision.
4. A detonation has its own source time and position, followed by its debris and low-frequency tail.

The map's displayed scale is eight world units per metre. Use a reference sound speed of 343 metres per second and explicitly game-tuned supersonic projectile profiles. Preserve weapon ranges independently of projectile speed. These values are a simulation convention, not a claim to reconstruct every weapon, cartridge, weather condition, or historical engagement.

For an illustrative 100-metre shot at 800 metres per second, the projectile takes about 125 milliseconds, while the muzzle report takes about 292 milliseconds at the reference sound speed. A nearby strike can therefore precede the report by about 167 milliseconds. At close distances the separation becomes small without an arbitrary distance threshold.

Sound speed varies with the medium and temperature; the reference value avoids pretending that the game models the day's complete atmosphere. NASA's [speed-of-sound explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/speed-of-sound-interactive/) and [Mach-angle explanation](https://www.grc.nasa.gov/www/k-12/airplane/machang.html) describe the underlying relationships. The game uses a bounded approximation with a moving listener, finite network delay, and simplified buildings.

The audible result also needs progressive loss of high-frequency detail, source direction, distance attenuation, and wall/interior filtering. A distant rifle should sound different from the same rifle nearby. The machine gun, rifle, sniper, launcher, and explosion should have different mixes. Recordings and procedural layers must be described honestly in the credits.

Queue arrivals as small data records and allocate sound nodes only near their playback time. Retain the active-voice cap. Clear pending arrivals on pause, mute, restart, or a hidden page; do not play a backlog after reconnecting. A role switch must not leave the player hearing near-pass events addressed to the previous soldier.

### Localized wall breaches

The first destruction model opens a limited, navigable section of a house's perimeter after a nearby explosive impact. Keep the footprint, roof, existing doors, interior partitions, corners, and remaining masonry. Limit the number of openings per house so the geometry stays predictable and the visual model stays understandable.

A successful breach must update all of these together:

- Player and AI collision, including rescued crew.
- Bullet paths and the desktop aiming obstruction cue.
- Shared sight and contact visibility.
- Roof approach/cutaway rules and the affected room texture.
- Navigation paths that were planned before the hole existed.
- Co-op prediction, late-join reconstruction, and authoritative state.

The initial explosion should resolve damage against the wall that existed at detonation; the resulting opening affects subsequent movement and fire. This avoids retroactively treating the wall as absent for the blast that broke it. Use a small persistent rubble patch and broken edges to communicate the gap, with a brief dust event. Rubble should not accidentally plug the new passage.

This first pass is localized gameplay destruction. Structural collapse, arbitrary mesh damage, multi-storey demolition, deformable rubble, and fully simulated acoustics require separate work and validation.

## Next additions worth prioritizing

| Priority | Concept | What it adds | Dependency or constraint |
| --- | --- | --- | --- |
| 1 | Casualty dragging and two-person carry | A wounded soldier changes movement and protection decisions; a partner can cover or help carry. | Clear solo AI assistance, mobile hold/release control, and co-op ownership. Avoid trapping a player in a long animation. |
| 2 | Finite smoke, ammunition, and medical handoffs | Squad roles matter when somebody runs dry, and assistance costs another person something real. | One nearby contextual action, server-owned transfers, and readable counts. |
| 3 | Coordinated bounding movement | Send one pair to cover while the other moves; useful for both AI leadership and human squad command. | Build on the existing ground tap and formation system. Keep an immediate cancel/regroup command. |
| 4 | Rocket threat | A slower, clearly telegraphed attack can damage cover and force relocation. | Distinct visible preparation, finite ammunition, long recovery, reliable line of fire, and a separate role budget. No instant unseen lethal shot. |
| 5 | Route intelligence with uncertainty | A report might be old, incomplete, or contradictory; reaching a junction can confirm what is actually there. | Separate reported conditions from observed facts. Give the player an intelligible reason when orders change. |
| 6 | Convoy damage and recovery | A disabled vehicle changes the evacuation plan, available seats, and the route. | First give vehicles coherent damage, collision, boarding, and evacuation rules; cosmetic smoke alone is insufficient. |
| 7 | Local fire and secondary hazards | A burning room or vehicle can obscure or block a route and endanger residents. | Bounded propagation, strong warning cues, and a usable alternative. Avoid uncontrolled fire across the whole map. |
| 8 | Limited communication | Distance, obstruction, or radio trouble creates coordination pressure; nearby voice commands remain useful. | Text accessibility and solo AI must keep the mission understandable. Do not turn this into random input failure. |
| 9 | Richer house interiors | Courtyards, broken furnishings, distinct shops, and alternate entries make streets and buildings memorable. | Reuse cached art; preserve readable exits and sufficient clearance for the entire squad. |
| 10 | Four-human co-op | Each player can own a specialist role. | Generalize existing two-slot assumptions, invitations, reconnect, transfers, and command authority before increasing room size. |

## Mission situations to explore

### A report that has gone stale

The radio directs the squad toward a pickup street. Reaching a vantage point reveals an obstruction that the report did not include. The squad can inspect a longer approach, open a local passage, or hold while the convoy revises its route. Time and exposure change; the correct route is not announced in advance.

### A resident behind damaged cover

A breach reveals an injured resident inside the next building. A direct route now exists, but the new opening also exposes the room. Help costs time and supplies. Leaving does not produce a theatrical punishment wave; later radio or the debrief can acknowledge that the resident's condition remains unknown.

### Two demands on one medic

The medic is stabilizing a crew member when a squad mate goes down elsewhere. The player can move the medic, have another soldier begin slower first aid, or use smoke and carry the casualty toward cover. The difficulty comes from time, distance, and protection rather than a dialogue option labelled good or bad.

### The wrong side of a new opening

An explosion creates a passage the squad intended to use, but opposing fighters can now see through it too. A nearby gunner changes position and a flanker can exploit the opening. The same geometry rules should apply to everyone.

### Capacity at the collection point

Vehicle space, able-bodied escorts, and loading time matter. The squad may be able to take more wounded at the cost of a longer perimeter hold or a longer movement on foot later. Keep uncertain outcomes uncertain, and show the people who were actually loaded rather than only changing a score.

## Sound production beyond this pass

Build a small, curated sound library before increasing the number of simultaneous layers. Priorities are clean weapon identities, convincing near/far variants, surface impacts, gear movement, and a larger set of performed squad calls. Use short contextual calls such as contact, covering, moving, reloading, casualty, and hold. Caption useful commands and avoid random speech that contradicts the current order.

The ambient scene can include sparse rotors, engines, distant reports, dogs, metal shutters, footsteps inside nearby rooms, and wind around open streets. A sound should have a plausible place and reason. Quiet periods matter; constant maximum combat noise would erase the contrast between a nearby threat, a distant fight, and a moment to assess the squad.

Keep menu music assets that already exist, while retaining the requested ambient radio/rotor/distant-impact menu mix. No real injury recordings or historical-victim impersonation are needed for immersion.

## Visual direction

Strengthen materials and silhouettes before adding expensive full-screen effects: uneven plaster, chipped corners, local dust, small rubble, dropped kit, signs of habitation, different roof finishes, and vehicle condition. Make friendly role equipment legible at normal zoom. Maintain a subtle difference between observed ground and terrain memory; an environment can feel uncertain without becoming unreadable.

Persistent bodies and blood should remain restrained and useful to understanding what happened. A person still needing help must remain visually distinct from someone who has died. Carry those rules into new enemy types and damaged interiors.

## Acceptance before adding more

- All four missions remain completable with AI leadership and solo role switching.
- Touch movement, immediate squad commands, and Assist remain usable without opening multiple panels.
- A new wall opening agrees across collision, sight, aiming, AI navigation, and both co-op clients.
- A distant report is delayed because of distance and source time; nearby impact and pass events come from actual projectile travel.
- Snapshot recovery, pause, mute, and mission restart do not duplicate sounds or damage.
- Higher enemy counts retain explicit population, role, pathfinding, particle, and audio budgets.
- Test desktop rendering at 1280 × 720 and 2560 × 1440 and phone layouts in both orientations. Report viewport, actual render buffer, and Canvas backend alongside any frame-rate measurement.
- Distinguish shipped behavior, prototypes, and future proposals in release notes.

