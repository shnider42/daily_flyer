# Breach room types

## Inventory in 0.12.0

The current inventory has three different counts:

- **13 functional archetypes** describe what a space is for. They are categories,
  not a count of physical rooms.
- **82 named zone rectangles across nine missions** identify existing areas and
  districts. Their dimensions and names do not imply 82 enclosed rooms.
- **Tomorrow has nine districts and 37 authored semantic regions**: nine district
  bases, 24 protected subareas and four optional surprise areas. These regions
  overlap deliberately; they do not add 37 new chambers or collision boundaries.

Room function, visual identity and occupants are separate parts of the design.
A room can have one principal purpose, several secondary activities, and a
district theme. Its occupants may change while its purpose remains legible.

The functional catalog is implemented in
[`room-catalog.mjs`](../daily_flyer/themes/breach_assets/room-catalog.mjs).
Tomorrow has explicit authored regions. Older missions retain their existing
named zones; their names and color palettes do not silently become gameplay
classifications.

## What existed in 0.11.0

The nine maps contained **82 named zone rectangles**, not 82 individual enclosed
rooms. Some zones described chambers, some described corridors, and the larger
maps used them for entire districts. Their mechanical roles came from doors,
interactables, pickups, hazards, enemies and optional platform courses. There
was no shared `roomType` field or generic room generator.

| Mission | Named zones | Existing spatial pattern |
| --- | ---: | --- |
| Blacksite 07 | 7 | Arrival, concourse, generator, laboratory, quarantine, cache and extraction |
| Dead Relay | 11 | Four ring galleries connecting power, two relays, a vault and extraction |
| Crosslink | 7 | A compact power hub with two relay branches, a vault and optional cache |
| The Underworks | 9 | Connected industrial sectors, permanent upgrades, refuges and return transit |
| Switchyard | 8 | An observed faction battle, a service bypass, workshop and two gallery branches |
| The Glasshouse | 9 | A practice bay, central atrium, cultivation wings, research and guardian chamber |
| The Hollow | 12 | A looping facility with containment routing, records and linked transit |
| Beneath The Shadow | 10 | City districts, three boss groups, two optional traversal courses and return loops |
| The Wrong Side of Tomorrow | 9 | Nine main chambers, protected arrival vestibules and changing folded doors |

The first three maps are authored in
[`core.mjs`](../daily_flyer/themes/breach_assets/core.mjs). The other maps have
their own modules: [Underworks](../daily_flyer/themes/breach_assets/underworks.mjs),
[Switchyard](../daily_flyer/themes/breach_assets/switchyard.mjs),
[Glasshouse](../daily_flyer/themes/breach_assets/glasshouse.mjs),
[Hollow](../daily_flyer/themes/breach_assets/hollow.mjs),
[Shadow](../daily_flyer/themes/breach_assets/shadow.mjs), and
[Tomorrow](../daily_flyer/themes/breach_assets/tomorrow.mjs).

Tomorrow's visible water, garden patches and floating architecture in 0.11.0
were scenery. Its `hazards` and `platformRooms` arrays were empty. Folded doors
were real transport interactions; there were no falling-floor trap doors.

## Thirteen functional types

These roles formalize behavior already represented in Breach. They are not a
claim that every earlier named zone has complete room metadata.

| Type | Player-facing purpose | Existing examples |
| --- | --- | --- |
| **Arrival** | Get oriented, collect initial supplies and find a reunion route | Blacksite Arrival bay; Hollow Intake dock; Tomorrow split-arrival vestibules |
| **Training** | Learn a rule with readable space and controlled pressure | Glasshouse Ballistics practice bay; Shadow's first Suspended street crossing |
| **Hub** | Regroup, restore central systems and choose a branch | Crosslink Power hub; Underworks Central exchange; Tomorrow Exchange |
| **Transit** | Move between places, flank or return through an understood route | Dead Relay ring galleries; Underworks transit platforms; Tomorrow folded doors |
| **Combat** | Read occupants, cover and firing lanes | Blacksite Quarantine hall; Switchyard Freight battle yard; Tomorrow Orchard |
| **Control** | Operate infrastructure or solve a route-changing mechanism | Relay rooms; Switchyard shutters; Hollow routing cabinets; Tomorrow registers |
| **Equipment** | Recover an earned weapon or permanent capability | Switchyard Arc workshop; Shadow Still laboratory; Underworks upgrade sites |
| **Refuge** | Clear nearby danger, then recover and establish a checkpoint | Underworks shelters; Hollow isolation refuges; Tomorrow blue waiting lights |
| **Archive** | Read records, recover memories or inspect exhibits | Hollow Cold archive; Tomorrow Museum and memory anchors |
| **Cache** | Investigate an optional supply or secret area | Blacksite Maintenance cache; Crosslink Supply cache; Shadow's hidden panels |
| **Traversal** | Read the floor, crossing or hazard before committing | Underworks conduits; Hollow flood areas; Shadow's gantry and tidal courses |
| **Boss arena** | Confront a guardian with room to read its attacks | Glasshouse Propagation chamber; Hollow Choir vault; Tomorrow Court |
| **Extraction / decision** | Choose departure or a final outcome for the team | Mission lifts and uplinks; Tomorrow's three ending points |

A refuge is a recovery facility, not unconditional invulnerability. Existing
simulation rules refuse rest when hostile fire, a nearby threatening enemy or
lingering fire endangers a living operator. The protected classification means
that its recovery controls and approach will not themselves become a mimic or
trapdoor.

## Tomorrow's room functions

The nine district bases retain their existing architecture and visual motifs.
The other 28 semantic regions override their functional classification at
specific controls, refuges, arrivals and optional areas.

| District | Primary type | Existing activities | Additions in 0.12.0 |
| --- | --- | --- | --- |
| **Inverted Waiting Room** | Arrival | Orientation, shotgun, refuge, first record, folded door and Escape ending | Protected arrival, refuge and ending classifications |
| **Teeth Orchard** | Combat | Gardener memory, Rivet repeater and sheltered west arrival | Protected memory and arrival classifications |
| **Aquarium of Hours** | Combat | Clockmaker memory, Rebound carbine and sheltered east arrival | Protected memory and arrival classifications |
| **Wardrobe of Other People** | Control | Names register, combat, Thumper, refuge and permanent shortcut | Warden–Unfiled skirmish, Mara's missing catalogue card and cabinet mimic |
| **Exchange for Lost Tomorrows** | Hub | Main power, departure pass, refuge and progression record | Clerk Twice's bargain and credential challenge |
| **Sunday That Never Was** | Equipment | Health expansion, combat, refuge, folded door and sheltered separated arrival | Bailiff Rook and two escorts activated by repairing his radio |
| **Museum of Misremembered Doors** | Archive | Null projector, third memory, combat, refuge and folded door | Mara Venn, staff-register evidence, exhibit mimic and service hatch |
| **Court of the Unborn Sun** | Boss arena | Guardian fight, supporting enemies, Seal and Rewrite decisions | Mara's living-memory alternative for Rewrite; NPC consequences in ending text |
| **Weather Inside Your Head** | Control | Hours register, combat, Breach lance, shortcut and folded door | Service hatch |

These main chambers are joined by walking loops. A functional subarea does not
mean a new enclosed chamber or a newly constructed wall. Floor markings,
objects, signs and the room readout can identify the smaller area.

The four optional classifications contain the implemented surprises:

| Area ID | Center | Type | Authored object | Placement permission |
| --- | --- | --- | --- | --- |
| `wardrobe-cabinet` | `(24.5, 50.5)` | Cache | `mimic-wardrobe` | Cache mimic permitted |
| `museum-exhibit` | `(23.5, 19.5)` | Archive | `mimic-museum` | Exhibit mimic permitted |
| `museum-hatch` | `(15.5, 20.5)` | Traversal | `trapdoor-museum` | Trapdoor permitted |
| `weather-hatch` | `(80.5, 20.5)` | Traversal | `trapdoor-weather` | Trapdoor permitted |

Each area spans three units by three units. Leaving it returns to the district's
base classification, unless a protected subarea takes precedence. The two
actual hatch footprints are only **1.6 by 1.6 units** within their semantic
areas. This does not turn an entire museum or weather district into a falling
floor. A permission makes an area eligible; it does not automatically fill all
eligible floor space with traps or mimics.

Both mimics have visible tells and can reveal on close approach, inspection or
a real attack. The cabinet and exhibit conceal dormant enemies until that
reveal; they do not replace required supplies or memory controls. A hatch gives
a one-second warning before routing anyone still standing on it through a
short maintenance chute. Its drop inflicts at most ten health damage and cannot
take the final hit point. The nominal landings remain in the same district:
`(9.5, 24.5)` in the Museum and `(67.5, 23.5)` in Weather. Occupancy and danger
checks select a clear nearby landing or a return position. A spent hatch shows
a safety grille and does not retrigger. These mechanics live in
[`tomorrow-hazards.mjs`](../daily_flyer/themes/breach_assets/tomorrow-hazards.mjs).

## Factions and mimics already had a starting point

Before this formalization, neutral **security** sentries already fought the
**infestation** in Dead Relay, Underworks, Switchyard, Glasshouse and Hollow.
Security ignores players until provoked. Authored encounters wait for an
observer instead of resolving out of sight across the map. These mechanics
live in `core.mjs`, especially `_encounterDefaults`, `_combatTarget`,
`isHostileToPlayer` and `_damageEnemy`.

The **Lantern Maw** already disguises itself as a light fixture, reveals on a
close visible approach or when hit, and telegraphs its subsequent attack.
That existing enemy behavior lives in
[`shadow-enemies.mjs`](../daily_flyer/themes/breach_assets/shadow-enemies.mjs).
The new cache/exhibit placement policy is separate from that established
combat enemy. The baseline did not contain help contracts, authored betrayal
consequences, generic cache/exhibit mimics or trapdoor landings.

## NPCs and faction outcomes in 0.12.0

Tomorrow adds **three named people, four rival combatants and two conditional
escorts**. The Civic Wardens and the Unfiled fight in the southern Wardrobe;
both oppose the infestation, called the Unfinished in this mission. Municipal
Clerks are a separate faction. Helping Rook stops Warden–Unfiled combat, while
a betrayed clerk becomes hostile. Friendly fire and provocation still matter.

| Person and location | What helping them does | Consequence for the run |
| --- | --- | --- |
| **Mara Venn**, Museum, near the southern refuge | Return her catalogue card from the southern Wardrobe; each operator receives 12 cells | While alive and loyal, Mara counts as one living memory. Rewrite can use two anchors plus Mara instead of all three anchors. Her survival and relationship also affect ending text. |
| **Bailiff Rook**, southern Sunday | Spend 12 pistol rounds to repair his radio | Wardens and Unfiled stop fighting one another. Two escorts enter Sunday to fight the infestation. Helping him and his survival can change the epilogue. |
| **Clerk Twice**, Exchange | Spend 20 pistol rounds; each operator receives 20 shells and up to 20 armor | After both registers answer, the clerk either keeps the deal or announces a betrayal before becoming hostile. Inspecting the Museum's staff register and challenging the credentials before betrayal completes can expose the deception. |

These conversations require central power. The clerk's disposition is fixed
for the run; taking a different route does not reroll it. The Museum evidence
gives the team a way to investigate the bargain before its consequence.

NPC help is optional. Escape, Seal and Rewrite remain the three ending choices;
their existing power, register, pass, guardian and equipment requirements still
apply as appropriate. Mara supplies an alternative for one memory requirement,
not a replacement for the Null projector or guardian fight. A clerk betrayal
does not confiscate the pass or memories and does not close the original ending
routes. These are authored favors, faction relations and consequences, rather
than a general reputation meter. Implementation and ending summaries live in
[`tomorrow-society.mjs`](../daily_flyer/themes/breach_assets/tomorrow-society.mjs)
and [Tomorrow](../daily_flyer/themes/breach_assets/tomorrow.mjs).

## Placement rules in 0.12.0

The catalog supplies two explicit placement permissions:

- **`permitsMimic`** is true only for Archive and Cache areas.
- **`permitsTrapdoor`** is true only for Traversal areas.
- **Protected areas override both permissions to false**, including when a
  smaller or higher-priority surprise area accidentally overlaps them.
- Missing or unrecognized room metadata grants neither permission.

Protected Tomorrow regions cover every authored arrival vestibule, all five
blue refuges, the power control and both registers, the departure pass, the
Null projector, all three memories, all folded-door sources and landings, and
all three ending points. These protect the required interactions and reunion
routes from becoming deceptive obstacles. They do not suppress ordinary
combat damage or friendly fire.

NPC and faction placement is authored separately from these two permissions.
The current placements use the hub, archive and arrival-adjacent areas for
conversation and a contested Wardrobe subarea for faction crossfire. A room
label by itself does not create an NPC, reputation system or ending branch.
NPC favors, betrayal, mimic revelation and spent hatches belong to the shared
authoritative simulation and its save/checkpoint rules.

## Catalog API

`ROOM_TYPES` is a frozen object keyed by the thirteen type IDs. Each entry has
`id`, `name`, `description`, `permitsMimic` and `permitsTrapdoor`.
`roomTypeInfo(id)` returns that entry or `null` for an unknown ID.

`authorTomorrowRooms(zones)` is pure and returns a fresh list of semantic
regions for the supplied Tomorrow districts: 37 regions for the complete
current map. Integration assigns that result to `level.rooms`. It never alters
the input zones or collision grid.

`describeRoom(level, x, z)` returns the resolved region and its type information:

```js
{
  id: 'wardrobe-cabinet',
  name: 'Wardrobe supply cabinet',
  roomType: 'cache',
  primaryType: 'cache',
  type: ROOM_TYPES.cache,
  activities: [],
  theme: 'The Wardrobe of Other People',
  zoneId: 'wardrobe',
  protected: false,
  permitsMimic: true,
  permitsTrapdoor: false,
  source: 'authored',
  authored: true,
  // x1, z1, x2, z2, priority and visual motif are also retained.
}
```

Bounds are half-open, matching existing zone lookup. Overlap precedence is:
protected area, higher explicit priority, smaller region, then stable lexical
ID. Input array order therefore does not alter the selected region.

An old zone with no explicit primary type returns its name and theme with
`type: null`, `roomType: null`, and `source: 'zone'`. Explicit zone metadata can
return `source: 'zone-metadata'`. Space outside named regions is described as
Transit with `source: 'corridor'`. Invalid or out-of-map coordinates return
`null`. This fallback describes location; it does not claim that older maps
have received a full room-boundary authoring pass.

## Verification

[`breach-room-catalog.test.mjs`](../tests/breach-room-catalog.test.mjs) checks
the stable taxonomy, real district floor coverage, all arrival/progression
protections, the four optional areas, overlap precedence, half-open bounds,
legacy-map behavior and pure input handling. The tests use the real Tomorrow
map's spawn points, refuges, memories, controls and endings so a later placement
change cannot silently leave them unprotected.

The [society tests](../tests/breach-tomorrow-society.test.mjs) cover NPC favors,
faction relationships, memory substitution and betrayal outcomes. The
[hazard tests](../tests/breach-tomorrow-hazards.test.mjs) cover mimic reveals,
warned drops, safe landings, shared play and persistence. The
[renderer tests](../tests/breach-tomorrow-renderer.test.mjs) check separate person
artwork, concealed/revealed mimic presentation, and all three hatch phases in
the GPU geometry and software floor-projection paths.
