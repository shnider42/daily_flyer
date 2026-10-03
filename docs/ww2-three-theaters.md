# Three theater playtests and shared order explanations

Baseline: `d304cd1530fd3beaa0346a0f8d8e323857b7683b` on `feat/ww2-tactics`.

This release retains server-authoritative per-order validation, fog, AP, random rolls, reactions, persistence and the replay-compaction / retained-render work from that baseline. It does not reinstate the reverted visibility-footprint algorithm or speculative movement preview. There is no Render configuration change, database migration, replacement of existing matches, or turn-end batching.

## What Observe, Share sightings and the danger warning mean

Observe already had a gameplay effect: eligible scouts, radio teams, mountain troops and pathfinders spend 1 AP to extend sight by 2 hexes, not weapon range. Normal terrain, smoke and concealment still apply. Movement, attacking, boarding, or the next friendly turn ends observation. This release exposes its active status and nominal sight / weapon ranges in the order explanation, with an observing counter marker. It does not alter that sight rule.

“Radio update” is now displayed as **Share sightings**. Radio teams spend 1 AP to share their own platoon's recent dated reports; commanders spend 2 AP to share recent reports across friendly platoons. It is once per round, and received reports remain through the following round. Reports do not track the enemy's new location or authorize direct fire at an unseen target. They can provide a mortar aiming coordinate. No recent contacts means nothing to transmit. Only a coarse radio-activity sector is announced to the opponent.

On platoon-intelligence maps such as Fubar, a firing-lane warning is an inference from a currently spotted enemy, its possible weapon reach, and line of fire. It is **not** confirmation of hidden Overwatch, readiness, or an imminent shot. Unmarked ground is not certified safe. Older maps retain their versioned warning rules. Tests check that toggling secret readiness or moving an unseen enemy does not change the public warning preview.

Mortar teams start with three shells. An indirect-fire order costs 2 AP and one shell, once per round, at range 2–8. It requires local platoon sight or a received radio report, resolves after the enemy turn, and can harm friendly infantry or collapse buildings. Its rifle and Overwatch are separate. The army's off-map **Call mortars** support is a separate limited resource, not the team's shell inventory.

## Finite supply squads

Supply is version-gated to newly created Kharkov, Relay Crossing and Dunkirk battles. Old saves, including a current Fubar game, do not gain logistics rules or new units.

Each unarmed supply squad has three nonregenerating packs. **Resupply** costs 2 supplier AP plus one pack. Choose an adjacent active friendly mortar or engineer below its starting capacity. A delivery restores up to two mortar shells, or one engineer repair kit. A recipient may receive a delivery once per round. It does not heal a unit, restore AP, reset the mortar's firing cooldown, refill off-map support, or grant bridge kits, smoke or grenades. Resource transfers use the existing reversible order journal; redo preserves exact results. Supplies and remaining inventory are shown in tap-accessible explanations.

## New scenarios

All three are DSL-only, explicitly marked playtests. Their map geometry, force ratios, ranges, timers and equipment values are fictional game-design choices, not historical reconstructions.

### Kharkov · Steel Counterstroke

24×20 hexes; 38 units including two round-four flank reserves. Soviets have four faster T-34/76s and a slow KV-1; Germany has four medium Panzers and a slow, long-ranged Tiger. Infantry, scouts, engineers, radio, mortar, AT gun, commander and finite supply support the armor.

Capture Fuel yard (1), Rail junction (2), or Repair works (1) with tanks or fighting infantry. Each occupied flag scores at its owner's turn end. First to 10 wins. At the end of round 18, the higher score wins; an exact tie goes to Germany. Flag ownership is public mission information, not a scan of nearby troops. Named facilities are landmarks, not free resupply or healing stations. A flank tank arrives for each army from round four; an obstructed entry waits.

### Relay Crossing

9×11 hexes (99, versus Village Crossing's 63); 22 units. One fighting platoon and HQ per army, with a tank, AT team, scout, engineer, radio, mortar and supply. Two river bridges, a tower, hedgerow and compact cover bring the ground mechanics back to a small battlefield.

It keeps the familiar objective: Americans hold the relay square at the end of two consecutive friendly turns; Germans prevent that through round 12. This is a compact ground laboratory, not an attempt to cram aircraft, warships and all Fubar roles into a tiny board.

### Dunkirk · The Last Boat

18×20 hexes; 31 units. Eight marked British infantry units must escape in three one-passenger rescue boats while French rearguards and a slow Matilda delay the German advance.

Load adjacent RESCUE infantry (1 infantry AP), sail to any water hex on the top sea edge, then **Evacuate** (1 boat AP). Each rescue saves one whole marked unit and empties the boat, which can return. Rescue six of eight by the end of round 14. Germany wins if six becomes impossible, every rescue boat is destroyed, or the deadline expires. Other units can fight but do not count as rescued objectives. Army elimination and resignation also still end a match.

Evacuation commits earlier takebacks, preventing rescue-score farming. Only the rescued total is public; the enemy does not receive the individual survivors' manifest or strengths. The boat AI routes around the mole using known coast geometry and own occupancy, never hidden enemy positions. Recorded mission counters and public flag ownership follow the actual replay frame, rather than inheriting a later game's score.

Historical background, not a claim of reconstruction:
- English Heritage, Dunkirk / Fall of France: https://www.english-heritage.org.uk/visit/places/dover-castle/history-and-stories/fall-of-france/
- Hoover Institution, Battles of Kharkov: https://www.hoover.org/research/battles-kharkov

## Consistent Experience levels

The same three-level visual key appears at Home and in the battle View controls:

- **I · Simple · Essentials:** purpose, AP cost, availability, mission and danger; full order explanations remain accessible on demand.
- **II · Moderate · Tactical detail:** adds useful odds, ranges and unit mechanics.
- **III · Expert · Full accounting:** adds exact dice, modifiers and detailed reports.

Experience changes information detail only. It does not change game rules, difficulty, selectable orders, fog or legal actions. Layout and Large text remain separate preferences. The new **?** button opens a readable order sheet by touch, mouse or keyboard, with the selected unit's current AP, inventory, observation status, explanations and disabled reasons. Inspecting a control sends no order. Mobile does not require hover or a long press.

## Validation and limits

The rules regression suite includes preexisting concurrency, stale-revision, privacy, replay, undo/redo and save/restore checks plus targeted tests for the new maps, supply, observation, warnings and evacuation. Browser checks exercise real controls, mission descriptions, Experience switching, mobile hit areas, replay, retained map behavior and saved-game resume. Release evidence is recorded in the isolated validation workflow before promotion to production.

Passing tests is not human balance testing, physical iPhone performance verification, or a guarantee of uptime. Kharkov and Dunkirk should be treated as experimental first-play balance. Existing large-map computation costs and the earlier 502 root-cause uncertainty have not been reclassified as solved by this release.

Reload the site to obtain the new controls. Existing games remain resumable; start a new solo/multiplayer battle or use a consensual rematch to select a new map. Preserve a checkpoint before any future rollback: old code predating these versioned scenarios cannot be expected to play newly created theater saves correctly.
