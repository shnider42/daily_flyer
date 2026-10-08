# Worlds Collide · Current DSL

`current:worlds_collide` is a new Current-only operation. The 24 Legacy scenarios
and their IDs remain frozen; this map is not available through an unprefixed ID.

The fictional 64×56 board has 3,584 hexes, more than twice Tidal Gate's area.
It connects an open ocean, offshore islands, landing coast, desert/oasis routes,
city blocks, a bridged river and mountain passes. All 20 original terrain types
plus engineer-cleared rubble are placed on the authored board.

Five selectable platoons per coalition use the existing command system:

| Platoon | Command |
| --- | --- |
| A | Coastal infantry, scouts, snipers, mortar, engineer, supply and transport |
| B | Armor families, AT guns/teams, recon, engineers and supplies |
| C | Mountain/desert specialists, concealed infantry, radio and AT rifles |
| D | Fleet, landing craft, their passengers and shore support |
| E | Movable fighters/bombers, radar, airfields, AA and airborne forces |

The 77 Allied and 75 Axis counters include all 32 previously implemented unit
classes. Americans/British oppose Germans/Japanese. Allied Commandos, resistance
mountain scouts, Pathfinders and paratroopers face German Pioneers, mountain
troops, auxiliary mountain squads and Flak. Captured T-34, KV-1, M13/40 and L3
hulls retain the existing equipment profiles; Sherman, Firefly, Matilda,
Crusader, Panzer III/IV and Tiger profiles are included too. These coalitions and
equipment combinations are a fictional sandbox, not a historical order of battle.

The army commander remains an additional host-owned command seat, separate from
the five selectable platoons. New co-op games default to platoon control; the
existing individual unit control remains available. Four finite Allied reserves (two US, two British)
stay with that commander. Axis has no paratrooper drops. Unclaimed platoons use
the existing bounded computer-order batches and difficulty settings. Boat and
passenger ownership remains together; cross-player transport consent remains.

Six equally weighted control zones span two sea lanes, the island, harbor
causeway, city square and mountain crossing. Ships capture sea zones; existing
infantry capture land flags. Each uncontested zone earns one point at its army's
turn end. First to 40 wins; after round 64 higher score wins, Axis wins a tie.
Aircraft and armor provide support without capturing flags. Capture scores once
per zone, irrespective of two occupants. Carrier or airfield destruction does
not trigger another map's victory condition.

Current's shared systems apply: two friendly ground occupants (at most one
vehicle/fixed gun/installation), one independent aircraft, separate ship/boat
spaces, local platoon intelligence, radio reports, recon fire direction,
indirect finite mortars, engineering, finite supplies, airborne scatter and
Flak, and saved rule manifests. No global rule or original roster is replaced.

Validation includes complete roster/terrain coverage, legal starts and movement,
all five command groups, passengers and commander-owned reserves, scoring and
deadline outcomes, both coalitions' bounded AI, fog-filtered API snapshots and
checkpoint restoration. Desktop/phone checks cover catalog discovery, co-op
ownership, movement, layers, map navigation and mission labels. The existing
Legacy fingerprints and full rule/API suite must also pass. Balance remains a
human playtest question.

An operation-specific, read-scoped observer index reduces the large board's
visibility cost. It considers only nearby friendly observers, then executes the
original exact sight test. Landmark sight uses the full scan. Comparisons cover
every land/air hex and legal order for both armies, with towers, concealment,
smoke and recon. Original maps use their original scan; no cache survives a
read scope, an order or a concurrent request.
