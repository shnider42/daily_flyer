# Farwake creatures and cavern ecology

This is the implementation and continuity reference for biological ground creatures, contextual cavern variety and readable encounters. Use it with [frontier expeditions](frontier-expeditions.md) and [Quiet Earth](quiet-earth-canon.md). New art or combat work should extend these catalogs and shared rules rather than create a separate encounter engine.

## What the roster means

The catalog contains **15 biological creature types**, including the already authored Bellwether. The existing prism sentinel and sentry drone remain machines and do not inflate that count. Human, Choral, Vaeli, Keth and Oru characters remain people; their species never automatically decides hostility.

The existing nine biological IDs remain valid. Six additions fill different visual and behavioral roles. A species should be recognizable by its body shape, movement, attack preparation and recovery, not only by its color or health bar.

| Creature | Visual identity | Encounter distinction | Natural context |
| --- | --- | --- | --- |
| Stoneback | Low broad body and layered shell | Braces its front for a short slam; moving around the planted front matters. | Mineral seams and sheltered rock; can be unprovoked. |
| Cave skitter | Small body and many legs | Quick two-part bite; the first pause is not the recovery window. | Scavenging around roots, caves and service debris. |
| The Bellwether | Pale hooked limbs, a split stone crown and a hollow toothed throat | Committed charge, resonant shockwave and marked rockfall; its wounded phase opens the shell and adds pressure. | The named Tinbell encounter only. |
| Reedstalker | Long legs and a sensory crest | Approaches from the flank before a pounce. | Root corridors, wetlands and interrupted migration routes. |
| Mire spitter | Squat body and expanding throat sac | Aimed spit rewards moving sideways after it commits or using cover. | Still pools and damp feeding shelves. |
| Shardling | Angular mineral-crusted body | A spreading shard fan threatens more than one center line. | Crystal pockets in limestone or ice. |
| Sporeback | Broad cap over a low crawler | Stops to release a lingering cloud; stay away until it disperses. | Fungal growth in root grottos. |
| Glassmaw | Long low body with an oversized translucent jaw | A narrow extended snap, followed by a closing pause. | Confined passages and reverberating chambers. |
| Ember mite | Small segments and a bright heat sac | Swells before a final close heat rupture; distance is the response. | Warm vents, cable ducts and escaped terrariums. |
| Rimehorn | Heavy horned quadruped | Lowers its crown before a committed charge; dodge sideways. | Cold mineral thaw seams and glacial chambers. |
| Tidebell | Umbrella body and hanging cilia | Retreats and contracts into a short radial pulse. | Humid tidal and brine chambers. |
| Coilworm | Long linked segments that bunch into a coil | Lunges along a fixed narrow line, then pauses to recover. | Dry channels, cooled lava tubes and connected service passages. |
| Kiln crab | Wide shield and one oversized claw | Scuttles sideways, protects its front and sweeps its claw. | Cooled vent margins and broken basalt shelves. |
| Veilwing | Broad manta-like wings and a small body | Circles before a low swoop and a settling pause. | Skylights, broken canopy and sheltered roosts. |
| Root snare | Anchored crown with radial tendrils | Lashes a marked floor patch within reach; does not pursue through the level. | Wet root-rock boundaries and mangrove grottos. |

The catalog's `tell`, `counterplay` and `shortHint` describe implemented encounter behavior. Keep them aligned with the actual rules and rendered attack preparation. Do not promise a poison status, slow effect, damage type, climb, water traversal or real flight just because a name suggests one. A hovering sprite still respects the navigable floor and solid walls unless a distinct movement system has actually been implemented.

## Habitat families

Use the existing `planetTypeFor(body)` / `planetTypeId` context. It already distinguishes 25 planet types. Do not infer all ecology from whether a body's name sounds ominous, and do not consume the galaxy's other random streams to choose an animal.

| Cavern family | Planet context | Physical and visual vocabulary | Visibility intent |
| --- | --- | --- | --- |
| `limestone` | Canyon and dry or crystalline rock contexts; some prairie and reclaimed worlds | Broad chambers, dry channels, mineral pockets, occasional skylights | Daylit or softly lit sections are valid; deep sealed passages may need a lamp. |
| `root-grotto` | Canopy, fungal, mangrove and garden worlds; some prairie and reclaimed growth | Root partitions, fungal beds, wet alcoves, broken canopy | Canopy openings and luminous growth can make readable chambers; fog requires an actual dark condition. |
| `tidal` | Reef, archipelago and storm-ocean coasts | Brine pools, rock islands, shelves and connected dry walkways | Open coastal chambers need not be dark; enclosed recesses can be. |
| `glacial` | Glacier, tundra and frozen sea | Blue ice, thaw seams, cracks and connected ledges | Translucent or open ice can admit light. Being cold does not imply fog. |
| `lava-tube` | Lava, obsidian and ash | Cooled channels, warm vent margins, basalt shelves and sparse heat glow | Warm light can aid navigation; darkness and danger remain separate decisions. |

`service-tunnel` is a constrained compatibility pool for existing built interiors such as Relay Nine. It does not turn an ordinary port, clinic or inhabited service room into a random monster habitat. `tinbell-hollow` remains a named, authored exception, not a general population family.

Vary geography as well as palette: room proportions, bends, loops, shelves, water edges and optional recesses should change the route a player takes. Required objects, spawns and exits must still connect using real movement collision. Within the current galaxy version, keep entrances, interaction IDs, reward receipts and saved actors stable when a scene is loaded again.

### Permanent homes in the compact galaxy

The 26-system galaxy has one deliberate field cave for each geological family. Every one is present for every galaxy seed; finding a family no longer requires visiting a large procedural map or winning a distribution roll. These fictional worlds belong to systems named after real stars. Their inhabited surfaces and local ecology are setting inventions.

| System | World | Family | Visit |
| --- | --- | --- | --- |
| Alpha Centauri | Shelf (`alpha-centauri-shelf`) | `glacial` | Blue-Ice Fractures on an ice moon. |
| Epsilon Eridani | Forge (`epsilon-eridani-forge`) | `lava-tube` | Basalt Flow Tubes on a volcanic moon. |
| Epsilon Eridani | Bough (`epsilon-eridani-forest`) | `root-grotto` | Root Galleries below a fungal forest. |
| Tau Ceti | Tidemark (`tau-ceti-tide`) | `tidal` | Tidal Shelves on an ocean world. |
| Tau Ceti | Whitecliff (`tau-ceti-karst`) | `limestone` | Skylight Karst in dry canyon country. |

`COMPACT_CAVERN_HOMES` in `dist/cavern-content.mjs` owns that placement. A galaxy seed still changes the passages, entrance location, population and eligible lighting conditions. Entrances fit around existing sites and settlement buildings without moving them, and the surface path must connect each entrance to the landing. The named Hearth caves, Bellwether, expedition stories and their original interaction IDs remain in place.

The older procedural eligibility path remains available for standalone generation fixtures. It does not add systems or caves to the compact runtime roster.

## Restraint is part of the ecology

An animal's appearance, a dark passage and a hostile encounter are three different facts. A cavern can contain old tracks, empty nests, harmless animals, ordinary work equipment or a quiet survey record. Avoid making every entrance predict a fight.

The pure catalog marks some species as eligible for peaceful encounters. That is a selection aid, not an authority grant or a hostility flag. The site's actual authored or saved disposition decides whether a creature attacks. It must remain the same when the captain leaves, reloads or reconnects. Do not reroll a harmless animal into an ambush just because the player visited twice.

Use small, habitat-appropriate groups. A menu of fifteen species does not mean fifteen creatures in every room. Quiet and mixed sites should remain common enough that exploration retains uncertainty. The existing peaceful expedition stories and species communities should continue to exist and function.

The five field caves add visits to the worlds listed above; they do not replace existing stories or named Hearth places. A cave contains no animals, two unprovoked animals, a mixed group with one unprovoked neighbor, or two to three hostile animals. The five equally sized disposition buckets are empty, quiet, mixed, hostile and hostile. A mixed group's different species use separate local aggression groups: defending against one animal does not recruit every other animal in the cave. No population roll happens on reconnect. All fourteen ordinary species remain eligible in their actual habitats, but a single galaxy does not force all fourteen into its five caves. Population variety across new galaxy seeds preserves empty and peaceful visits.

No biological creature in this catalog is automatically a product, soldier or symptom of The Collective. The homeworld mystery remains an investigation. Ordinary predation, nesting, thermal attraction, migration and accidental human disturbance can explain a local encounter without a universal corruption explanation.

## Contextual sight

Keep the distinction between lighting and line of sight. A softly darkened cave palette is not the same as unexplored fog. A fogged site needs an explicit environmental reason, such as an unpowered facility or a deep lightless chamber, and its local visibility rules must be shared by target selection and presentation.

Tinbell's established sight range and Relay Nine's suit lamp, fog and restored light circuits remain meaningful exceptions. Do not replace them with a blanket rule that every cave, every alien planet or every interior must be fogged. Within a visibility-restricted site, lamps never reveal a room through a solid wall. Walls block gunfire everywhere.

Most new caves use clear visibility. Selected root grottos have a closed, misty canopy, and selected glacial caves have a deep shaft with failed survey lamps. Those conditions use local sight; they are selected independently of the population, so a restricted cave can also be empty or peaceful. Limestone skylights, tidal sea arches and lava-tube vent glow keep their current clear visibility.

The field guide explains how to react to visible attacks without listing undiscovered creatures or revealing an upcoming encounter. Simple guidance should clarify movement, available actions and an escape route, rather than requiring the player to read an encyclopedia during combat.

## Tinbell's Bellwether

The Bellwether remains one optional, authored predator in Tinbell Hollow. Its larger pale hooked silhouette, widening throat and splitting stone crown make its current action visible; they do not add creatures or enlarge the collision hull. The encounter still begins only when a living captain actually sees it through the existing fog and solid-rock sight checks. A shared first scream does not reveal its identity, health bar, attack labels or boss music to a captain who remains behind cover.

The encounter starts with two committed charges and then develops into a repeating charge, charge, shockwave and rockfall sequence. Each attack plants the creature during its warning and leaves a recovery window. The short guidance beside a visible creature states the needed movement.

| Attack | Readable warning | Response and recovery |
| --- | --- | --- |
| Committed charge | A crouch, low throat cue and wall-limited lane for 0.8 seconds | Move sideways after the direction locks. The charge stops at solid rock and leaves 1.1 seconds of recovery. |
| Resonant shockwave | A raised, widening throat and a marked 124-unit radius for 1.3 seconds | Get completely outside the ring or behind solid rock. The impact occurs once, followed by a brief visible ripple and 1.3 seconds of recovery. |
| Rockfall | Crown rattle, falling dust and a 30-unit circle fixed on the captain's position for 1.1 seconds | Move off the marked ground; it cannot follow the captain. The rubble impact occurs once and leaves 1.4 seconds of recovery. |

At 45% health, the shell opens, the creature pursues slightly faster, and rockfall can add one separated mark ahead of the original target when the floor and sight line allow it. The warning times remain unchanged. Overlapping marks can never hit the same captain twice in one attack. This is an escalation of the same creature, with no summoned animals or unavoidable damage pulse.

The existing health, armor and weapon progression remain: an early sidearm attempt is very difficult, while earned weapons substantially shorten the fight. Retreat is valid. Leaving, disconnecting or losing the last living participant resets an unfinished attempt; an ally still inside keeps it active. Active saves retain wounds, attack kind, committed targets and remaining phase time. A saved impact tail is presentation only and cannot apply damage again. Defeat remains permanent, and old cache claims cannot pay twice. Boss state version 2 adds these phases without replacing the actor or changing its stable encounter ID.

The same authority steps the encounter once for one or four captains. Attack cues have attempt-specific identities, are filtered by local visibility, and cannot build up for disconnected captains or survive a reset. Reduced motion retains the warning geometry while freezing decorative motion. See [music direction](music-direction.md) for the locally observed engagement and recorded boss score; music does not itself discover the creature.

The Bellwether and Floodworks Foreman retain their existing boss treatment. The compact story revision also adds three rare, optional heavy ship encounters with their own physical warning and objective rules; see [system identities and bosses](system-identity-and-bosses.md). These are ships, not additions to the biological catalog. Ordinary cavern wildlife, prism sentinels and Relay Nine's creatures keep their existing ecology and mission pacing.

Tinbell Hollow contains an optional physical record of silver, black, and amber bands inside old beacon insulation. The sealed sample can later corroborate independent Earth evidence. Its initial description identifies neither the deposit's origin nor a cause for the Bellwether's behavior. The creature's profile, attacks, reveal rules, and V33B recording remain unchanged; defeating it is never required to finish the Earth campaign.

## Relay Nine stays a paced mission

The corridor still begins with the existing Morrow Flightline recording, harmless false starts, quiet stretches, physical evidence and staged lights. A broader creature roster is not permission to populate the opening halls with attacks or switch to battle music on entry.

Variation belongs to a seeded, bounded ending composition and its approach, with the real danger transition controlled by the existing mission evidence and receiver action. Reuse the established actor slots and persistent encounter state. New galaxy seeds can change a composition; loading an existing scene must not replace injured actors, resurrect killed ones, change the current attack into a surprise strike or pay the escape reward twice. Preserve the physical exit and green return route. The objective remains getting out, not clearing every creature.

A creature's silhouette and name do not reveal why it is there. Do not casually identify it as a Collective unit or disclose the final Earth explanation in combat labels, score titles, map markers or a mission briefing.

## Implementation boundaries

| Concern | Reuse or extend |
| --- | --- |
| Biological identities, habitats, colors and field descriptions | `dist/creature-catalog.mjs` |
| Shared behavior, attack phases and numeric combat tuning | `dist/creature-rules.mjs` |
| Closed wildlife dispatch, distinct from sapient populations | `dist/species.mjs` |
| Biological silhouettes, attack tells and deterministic sprite caches | `dist/creature-art.mjs`, `dist/expedition-story-art.mjs` and `dist/surface.mjs` |
| Habitat site selection and persistent actors | `dist/cavern-content.mjs`, `dist/exploration.mjs`, existing expedition materializers and rules |
| Physical route geometry | `dist/cavern-layouts.mjs` through the existing surface and expedition layout builders |
| Local visibility and attack visibility | `dist/site-visibility.mjs` and existing combat sight checks |
| Relay Nine pacing, stored choices and actor slots | `dist/quiet-earth-content.mjs`, `dist/quiet-earth-rules.mjs`, `dist/quiet-earth-layouts.mjs` |
| Useful plain-language help | Existing `personal-combat` and `exploration` entries in `dist/field-guide.mjs` |
| Multiplayer authority | The same Game and encounter rules through `server/realm.mjs` |

`selectHabitatCreatures(habitat, seed, options)` uses a dedicated `creature-ecology-v1` deterministic stream. It returns unique compatible catalog entries, never the Bellwether and never a machine or a person. It does not set hostility, move an actor, create a reward or consume combat randomness. Scene authors choose the actual actor IDs, dispositions, positions and encounter limits.

## Verification targets

Check that every compact galaxy contains all five fixed cavern families and that representative galaxy seeds provide meaningful coverage of the fourteen ordinary biological types in reachable sites; a catalog entry alone is not playable content. `tests/cavern-ecology.test.mjs` checks the live compact catalog across 32 seeds, all five entrances on representative surfaces, unchanged existing story placements, and seeded geometry with reachable evidence, wildlife and exits. Matching galaxy seeds must produce matching habitat layouts and compositions; different seeds can vary them, and normal caves can be peaceful or visibly lit.

For behavior, verify each distinct attack has a preparation the player can perceive, a bounded range, wall-aware resolution and a useful escape or recovery window. Shared authority must apply a hit once, and a replay or reconnect must not multiply an attack. Preserve the Bellwether's separate boss behavior and Relay Nine's danger gate, music boundaries and old payment receipts. Change only the relevant tests unless another release gate requires broader verification.

`tests/server/creature-ecology.test.mjs` exercises two actual Realm captains entering the compact galaxy's cave entrances. The deterministic `shared-creature-ecology-1` fixture includes peaceful ice fauna and a mixed basalt-tube population with a coilworm. It checks shared geometry and one simulation step per site, attack preparation in full and compact snapshots, saved captain positions, neutral behavior, mixed-species aggression boundaries, evidence and survey claims, casualties and wounds across a flush/restart, and leaving while a threat remains alive.
