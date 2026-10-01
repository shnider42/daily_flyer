# Signals & theaters expansion

Three fictional tactical engagements inspired by historical WWII theaters. They
are **balance playtests**, not reconstructions of particular battles. Unit traits
represent equipment, training and battlefield roles. No nationality receives an
inherent accuracy bonus.

Choose **Italy**, **North Africa**, or **Ethiopia** under Operations, or use the
normal solo, multiplayer and rematch selectors. Each requires DSL. The catalog
has 16 maps with the later [Iron Lantern airborne playtest](ww2-iron-lantern.md). Battles still have two player seats, one commander per army;
platoons are operational groups within that army, not extra human seats.

| Map | Board / forces | Asymmetric problem |
| --- | --- | --- |
| Apennine Relay · Italy, 1944 | 26×28 · 17 units per side · 28 rounds | British/Commonwealth smoke, Commandos and mountain troops against German suppression, mountain troops and a fixed gun. Armor follows the valley routes. |
| Desert Signal · North Africa, 1942 | 32×26 · 19 units per side · 26 rounds | Three faster, lighter British Crusaders and a transport against an Italian M13/40, a German Panzer III and two fixed guns. Dunes slow armor; wadis and oases shelter infantry. |
| Amba Dawn · Ethiopia, 1941 | 26×30 · 16 units per side · 30 rounds | Ethiopian Patriots and a liaison wireless team use mountain routes against an Italian colonial garrison, Eritrean Ascaris, MGs and an L3 tankette. No off-map heavy artillery or aircraft sorties. |

Attackers win by holding the objective through two of their turn endings;
defenders win when time runs out. All three maps have three connected valley or
road approaches. Every mobile unit has a legal terrain route to the objective.
The defended location, turn clock, force composition and terrain make the sides
deliberately unequal. Equal unit counts are not a claim of equal win rates.

## Platoon intelligence

These three battles and the later Iron Lantern playtest start with `signals_version=1`. Each platoon shares local
spotting for direct fire, suppression, grenades and reactions. Selecting a unit
shows its platoon's live enemies, sight and dated contacts. **Intelligence: army
overview** lets the human commander inspect the combined observations of their
own forces, but it does not change any unit's legal attacks.

An enemy outside a platoon's sight cannot become a live direct-fire target just
because a different platoon sees it. All friendly units remain selectable.
The server enforces these rules independently of the view toggle.

| New order | Cost and limits | Effect / counterplay |
| --- | --- | --- |
| Radio update | Commander: 2 AP; radio team: 1 AP. Once per round. Requires reports observed this round or last. | Commander gathers all platoons' reports; radio team relays its own platoon. Broadcasts immutable role, last position and observation round. Enemy hears only a broad wireless sector. |
| Observe | Scout, radio team or mountain infantry; 1 AP. | +2 normal and concealed spotting range, without extra weapon range. Ends on movement, attack or the next friendly turn. |
| Camouflage | Commandos or Patriots in cover; 2 AP. | Concealed spotting reach is reduced by one hex. Adjacent troops and aerial searches still detect them. Movement or attack breaks it. |
| Mortar fire | 2 AP + one shell; range 2–8; once per round. Three shells per crew, two in Ethiopia. | Aim at locally observed or radio-reported ground. Public impact area resolves after the enemy turn. All infantry there takes 1 damage and pins, including friendlies. Armor ignores fragments. Existing structural damage rules apply. |
| Demolition | Engineers or Commandos; 2 AP + one charge per team. | Adjacent spotted armor only: 4+ to hit for 2 damage. A short-range way to threaten armor, with limited supply and substantial exposure. |

Radio reports last through the following round, do not follow their targets, and
never reveal current health, AP, overwatch or survival. A receiving platoon that
searches a reported position clears its stale marker. Reports allow mortar aim,
not attacks on an unseen unit ID. Repeated broadcasts spend AP and disclose a
coarse sector. Ordinary local sighting history keeps the existing dated-contact
behavior. New sightings, observations and broadcasts commit prior undo history;
combat undo requires redoing the same dice.

Mortar **overwatch uses the crew's short-range rifles**, never indirect reaction
fire. Orange movement warnings in these maps identify possible lanes from
already spotted enemies regardless of their secret overwatch flag. They do not
announce hidden ambushes or guarantee that unmarked moves are safe. This also
applies to disembarkation warnings. Enemy snapshots hide overwatch readiness,
and the computer does not use that hidden flag to choose suppression targets.

Recon aircraft on ground and naval maps now give the opponent a nine-sector
direction (for example, northwest). Alerts never include the exact search center,
radius or sender ID. Enemy replays omit the aircraft's search coordinate too.

## Terrain and equipment

| Terrain | Foot movement | Armor | Other effect |
| --- | --- | --- | --- |
| Mountain | 3 AP; mountain-trained troops 1 AP | Impassable | +1 cover, concealment, blocks intervening sight |
| Ridge | 2 AP; mountain-trained troops 1 AP | Impassable | +1 cover, concealment, blocks intervening sight |
| Wadi | 2 AP; mountain-trained troops 1 AP | Impassable | +1 cover and concealment |
| Desert | 1 AP | 1 AP | Open ground |
| Dune | 1 AP | 2 AP | Movement obstacle, no automatic cover bonus |
| Oasis | 2 AP | Impassable | +1 cover, concealment, blocks ordinary intervening sight |

Mountains do not automatically grant the tower's elevated vision. Ordinary
two-AP infantry can bank an AP to enter a mountain hex. Fixed guns remain fixed.
The AI uses movement-profile-specific routes on these maps, so tanks plan along
passable valleys instead of trying to take infantry shortcuts.

North African anti-tank teams use anti-tank rifles, which threaten light vehicles
and infantry but cannot penetrate heavy tanks. The British Italian-theater team
uses a PIAT profile. The Ethiopian battle's Italian L3 has machine guns, light
armor and no AP/HE tank-gun ammunition. Commandos replace the proposed modern
Green Beret concept with a WWII-appropriate specialist role. The Ethiopian
Patriot campaign is set in **1941**, rather than moving the 1935 invasion into WWII.

## Experimental presentation and reuse

**Battle → Simple view** cycles **on → off → experimental → on**. The preference
is saved in the browser; old boolean preferences migrate to on or off. Existing
on/off layouts remain available. Experimental mobile play uses a compact top
bar with an always-visible DSL home control, a large map, stable unit navigation,
and an Orders sheet. Unavailable order names and costs are gray with readable
reasons; clicking them does not issue an order or close the explanation sheet.

The experimental mobile layout and gray order treatment work on older DSL maps
immediately. Coarse recon alerts apply to existing ground/naval battles. New
terrain, weapons, unit roles and action validation live in shared modules, so
future maps can reuse them. Existing saved armies and maps do not acquire new
units or platoon-intelligence rules. Adding the new rules to an older theater
should be a deliberate new-match configuration after playtesting, never a silent
mutation of an ongoing battle.

Static SVG terrain and symbols remain cached across orders and platoon changes.
The existing conditional polling, single response per order, request-scoped sight
cache and bounded geometry cache are retained. Private sight data is not cached
across players or mutable states.

## Validation and next balance questions

Automated checks cover spawn uniqueness, routes for every mobile role, terrain
costs, local fire legality, private immutable radio reports, expiry, overwatch
invariance, coarse recon alerts, observation/camouflage, mortar ammunition and
friendly fire, demolition dice/undo, inactive passengers, and AI orders.
Browser checks cover all 15 maps' order discovery, the new maps' real HTTP
orders, platoon fog, retained terrain, phone and landscape layouts, view-mode
persistence and desktop/mobile transitions. Existing Tidal Gate movement,
engineering, undo/replay and throttled browser performance checks also pass.

Deterministic opening runs of both sides check basic movement and action
completion, not statistical balance. Human playtests should measure attacker
capture rates, rounds to first contact, radio usage, mortar hit rates, and whether
the three valley approaches all remain useful. In particular, watch Ethiopian
mobility versus fixed firepower, desert gun lanes versus Crusader speed, and the
AP opportunity cost of communicating. Tune the new scenario rosters and supplies
before changing shared legacy rules.

## Historical grounding

- National Army Museum: [Italian campaign](https://www.nam.ac.uk/explore/italian-campaign)
  and [Commandos in WWII](https://www.nam.ac.uk/explore/commandos-WW2).
- National Army Museum: [North Africa, 1940–43](https://www.nam.ac.uk/explore/struggle-north-africa-1940-43)
  and [Italian M13/40 photograph](https://collection.nam.ac.uk/detail.php?acc=1975-03-63-7-104).
- National Army Museum: [Ethiopian irregular troops, 1941](https://collection.nam.ac.uk/detail.php?acc=1975-02-29-1)
  and [East African campaign collection](https://collection.nam.ac.uk/detail.php?acc=1996-08-388-25).

These establish theater, period and broad force roles. Map geography, unit
allocations, AP values, ranges, report expiry and combat effects are game design.
