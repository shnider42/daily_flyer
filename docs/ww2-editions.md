# Legacy and Current DSL

The Home, Solo and Rematch operation selectors have two separate DSL catalogs.
**Legacy** retains all 24 original scenario IDs, force definitions, terrain,
missions and opt-in rules. It remains the initial selection so the existing
creation workflow stays familiar. **Current** offers a counterpart of every map
under `current:<original-id>`, using the common ground policy below. Current is
still DSL, not a third ruleset. Classic and the planned ASL profile are unchanged.

An ongoing battle never changes edition. Its board, units, resources, rules and
co-op ownership stay in its saved state. A rematch changes edition only when the
next battle is accepted. Solo SAVE restoration copies the exact checkpoint.
Current and Legacy Journey chapters keep separate browser progress and resumes.
The command room, recruitment, multiplayer directory, saved shortcuts and battle
badge identify the edition. No database reset, migration or match conversion is
part of this update.

## Common policy, specialized missions

`editions.py` is the creation policy. It builds isolated Current scenario copies
and saves `edition=current`, `edition_version=1` and a `rule_manifest`. Existing
shared modules implement actions from unit equipment, role, terrain and saved
system versions. Loading and public projection do not run the creation policy.
Original scenario definitions are the frozen Legacy source. Future balancing or
new mechanics belong in Current configuration and versioned shared systems;
they must not edit the Legacy baseline or silently reinterpret older saves.

| System | Current behavior | Deliberate limits |
| --- | --- | --- |
| Ground occupancy | Two friendly ground units per land hex; at most one vehicle, fixed gun or installation. Each keeps its AP, platoon and controller. | Enemy ground units cannot share. Dead counters, reserves and embarked passengers occupy no slot. Ships, landing craft and amphibious boats at sea remain separate. |
| Air occupancy | One aircraft independently of ground capacity, including above two ground units. | Flight cannot finish on or pass through another aircraft. Air spotting, interception and target domains retain their existing rules. |
| Ground intelligence | Fog and local platoon spotting on every ground operation. Army overview is for inspection. | A different platoon's observation never unlocks direct fire. Compact infantry maps have one explicit platoon and their original five-unit force. |
| Radio | Commanders gather recent platoon reports; radiomen relay their own group. | Dated positions, finite duration and coarse enemy alerts; no live health, readiness or tracking. Ships and the air-defense scenario keep fleet/air intelligence. |
| Recon direction | Observe costs 1 AP; Spot for fire another 1 AP. Same-platoon tanks/AT guns gain −1 threshold at the fixed observed hex. | No stacking or tracking. An extra range hex cancels the accuracy benefit. Direct guns still require a clear firing lane and capable ammunition. Loss of observation interrupts live guidance. |
| Mortars | Aim at hex is indirect, 2 AP and one finite shell, once per round. Resolves after the enemy turn on 5+, or 4+ when guided. | Local ground sight or a dated radio report is required. Minimum two hexes; each crew keeps its authored range and shell count. Misses spend the shell. Friendly infantry is at risk; armor ignores fragments. |
| Combat and structures | Shared weapon/protection, cover, digging, suppression, smoke, ammunition and track rules. Hex fire checks every ground occupant; each retains its protection. | Direct fire/Snipe chooses one target. Explosive splash may hit both. One structural step per shell; collapse affects all ground occupants. Aircraft are unaffected by ground collapse. |
| Specialists and terrain | Engineers, snipers, mountain troops, Commandos, Patriots, Pathfinders and Flak retain their shared capabilities. Towers and churches use shared elevated-observation rules. | A map gets the capabilities of its actual roster and terrain. No new unit, church, tower, airplane or support budget is inserted merely to make every map identical. |
| Logistics | Existing supply teams deliver finite supplies to eligible mortar/engineer recipients. Repair/supply/officer support can reach a co-occupant. | No infinite packs, HP/AP refill or cooldown bypass. Authored support restrictions, including Ethiopia's lack of heavy off-map support, remain. |
| Entry and transport | Movement, preparation, reserves, spotted-hex drops, airlift diversions, unloading and bailout use the same capacity checks. Half-tracks can unload into their own free ground slot. | Boats still need legal water and land routes. Older spotted-hex reserve drops require their own platoon's observation in Current. New commander drops retain scatter, Flak and arrival limits. |
| Co-op and computer groups | Host keeps their selected group and army commander. Every other player keeps their own claimed group; unclaimed groups use locked Easy/Standard settings. | A preloaded commander and their boat stay with the host in Current. Transport consent, army finish coordination, fog-filtered replay, authority and turn budgets remain enforced. |
| Objectives | Original mission, clock, capture eligibility, scores, objective positions and reinforcement schedule. | Two occupants never multiply a flag's score. Aircraft do not capture ground flags. Assault advances only when the last defending ground unit is cleared. |

Current computer orders use the same role rules and legal previews. A hidden
contact can reject a move, disembarkation or old-style landing, just as it does
for a human. The Current planner remembers that failed destination for its turn
and tries another order without consulting the concealed unit, spending AP or
rolling combat dice. Retry memory carries across bounded co-op batches. This
handling is gated to Current; the Legacy planner remains unchanged.

## All 24 counterparts

| Map or family | Preserve | Backport in Current |
| --- | --- | --- |
| Village Crossing, Orchard Road, Stonebridge | Five infantry units per army; original approaches and attack/defend clock. | One explicit platoon, fog and shared ground capacity; ordinary infantry/officer rules. No artificial specialist expansion. |
| Riverfront Offensive | Three infantry platoons, bridge lanes and depot mission. | Local platoon sight and shared capacity. Its roster remains infantry. |
| Operation Long Reach | Armor, scouts, engineers, reserves and amphibious routes. | Radio-enabled commanders, recon direction, shared ground capacity and local reserve-drop observation. |
| Stalingrad | Soviet/German equipment, smoke/suppression differences, random building conditions and street routes. | Local spotting, recon direction, engineering/demolition and shared occupancy. Snipers and towers keep their existing roles. |
| Omaha Beach | Loaded boats, prepared German weapons, beach-exit objective and asymmetric force. | Common ground intelligence, shared shore capacity and engineering. Boats and passenger consent remain distinct. |
| Carentan, Market Garden | Forward airborne forces, bridges, relief column, British equipment and reserves. | Local intelligence, recon support, shared capacity and consistent spotted-hex drop validation. |
| Tidal Gate | Multiple linked infantry objectives, coast, causeways, engineers and scheduled reserves. | Local intelligence, recon direction and common capacity at crossings, unloading and reserve entries. |
| Apennine Relay, Desert Signal, Amba Dawn | Mountain/desert terrain, trained infantry, mobility/firepower differences and authored supplies. | Common recon direction, mortar Aim at hex, finite logistics for present units and shared capacity. Original equipment restrictions remain. |
| Iron Lantern | Commander airlifts, Pathfinder beacons, Flak, heavy armor and canal-link mission. | Recon direction, mortar/supply policy and capacity-aware arrivals/diversions. Existing drop hazards and arrival AP remain. |
| Kharkov | T-34/KV versus Panzer/Tiger tradeoffs, weighted flags and counterstroke reserves. | Recon-assisted tank fire, indirect mortar aiming and shared capacity, including reserve entry. |
| Relay Crossing | Compact specialist lab, two bridges and tower. | Shared fire direction, indirect mortar aiming and ground capacity without growing the roster. |
| Dunkirk | Eight marked evacuees, six-rescue goal, rearguard, boat count and deadline. | Ground capacity, recon/mortar policy and consistent embarkation/unloading. Rescue scoring and irreversible evacuation remain. |
| Shingle Cove, Breakwater | Private deployment, bunker/fire budgets, landing zones and suppression-only opening bombardment. | Capacity-aware defender placement, consistent post-landing rules and commander/boat co-op ownership. |
| Vire Crossroads, Belfry Valley | Two/three platoons respectively, 17/22 units per army, doctrine, weighted flags and observation terrain. | The same shared ground policy as every other Current map. Legacy Vire remains one unit per hex; Legacy Belfry retains its existing two-unit experiment. |
| Midway | Ships, asymmetric naval weapons, carrier searches, escorts, sea-control and island objectives. | Two amphibious infantry ashore; ships and integral amphibious boats at sea stay separate. No ground-radio or mortar rules imposed on fleet control. |
| Battle of Britain | Airframes, radar/AA, flight legs, bombing, service and station-defense victory. | Aircraft can end above ground installations, independently of ground occupancy. No ground platoon fire-direction system imposed on air combat. |
| Fubar | Every existing role, air/sea/land target domains, finite reserves and three-zone mission. | Common ground intelligence, recon/mortar/logistics policy and two ground occupants plus one independent aircraft. Naval spacing and air hazards remain. |

The force sizes, unit statistics, ammunition, terrain, objectives and clocks are
preserved. Shared occupancy and newer observation/fire rules can change balance;
human playtests should guide Current force and mission tuning. Passing tests
establishes rule consistency and compatibility, not equal win rates or fun.

## Verification

- The full 433-test Python rule/API suite, including `test_ww2_editions.py`.
- Twenty edition tests cover both catalogs, all rosters and authored stats,
  original terrain/mission parameters, every map at both co-op command sizes,
  bounded computer orders, recon/mortar backports, air/sea exceptions,
  preparation, arrivals, transport, hidden-contact retry, rematches and saves.
- `tests/fixtures/ww2-legacy-v1.json` contains rule-state SHA-256 fingerprints
  generated from commit `49b750d133b3be81fd4a64ecbcb4bf5b2b63c3bb`, before this
  overhaul. They compare initialization, a complete army round and shared lobby
  start for all 24 Legacy maps, plus the four playable Classic maps. Random
  building conditions use a fixed seed only in this test.
- The Journey DOM/API harness covers 48 edition/maps × two armies × three
  Experience levels, with actual server snapshots and role-appropriate topics.
- `tests/ww2-editions-browser.cjs` uses real Chromium desktop/phone controls for
  catalog switching, Current co-op, recon fire direction, separate player
  ownership, reload/resume, three occupants across ground/air, Legacy Vire and
  independent Journey progress. Existing stacking/fire-direction/Fubar browser
  harnesses check Legacy regressions separately.

All test matches, commanders and databases are disposable local fixtures.
