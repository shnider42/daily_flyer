# Battle of Britain 2.0

A separate Current scenario, `current:britain_2`, on a fixed 24×20 daytime map.
The original Battle of Britain, Midway 2.0 and saved-match rules are unchanged.
Uses the existing aircraft art and icon system.

## Mission and forces

The Luftwaffe wins immediately at **9 raid damage**, or by destroying both RAF
sector stations. The RAF wins when all four bombers are lost, or by keeping raid
damage below 9 through the end of round 18. The central star is a landmark.

Raid damage is each RAF station/radar site's greatest damage sustained during
the battle, summed across the four sites. Repairing a station never removes
scored damage; re-inflicting already scored damage never awards it twice.

| Aircraft | Flights | Strength | AP | Hexes / leg | Fuel | Bomb loads | Attack |
|---|---:|---:|---:|---:|---:|---:|---|
| Spitfire Mk I | 2 | 3 | 4 | 4 | 12 | 0 | 4+, 1 damage against aircraft |
| Hurricane Mk I | 4 | 3 | 4 | 3 | 12 | 0 | 3+ vs bombers, 5+ vs fighters; 1 damage |
| Bf 109E-3 | 6 | 3 | 3 | 4 | 10 | 0 | 4+, 2 damage against aircraft |
| Heinkel He 111 | 2 | 6 | 4 | 2 | 18 | 2 | 3+, 2 damage against surface units |
| Dornier Do 17 | 1 | 5 | 4 | 3 | 18 | 1 | 3+, 2 damage against surface units |
| Junkers Ju 88 | 1 | 5 | 4 | 3 | 18 | 1 | 3+, 3 damage against surface units |

Fighters have range 3; bombers range 1. Firing and preparing interception cost
2 AP. Fighter reactions add +1 to the required die roll. Each side also has
two fixed AA batteries: range 3, 2 damage, 4+ vs bombers / 5+ vs fighters.

The RAF has Kenley and Biggin Hill sector stations, each with one Spitfire and
two Hurricanes, plus Chain Home radar at Rye and Dover. Germany has two
Pas-de-Calais dispersals, each with three escorts and two bombers. Flight
callsigns distinguish individual finite units. Destroyed flights never respawn.

## Network and escort decisions

- A living Chain Home site sees aircraft within 7 hexes. When a target is
  tracked and the firing RAF fighter is within 8 hexes of a surviving RAF
  station, its hit threshold is reduced by 1, including interceptions.
- A living airborne fighter within 2 hexes of a bomber raises incoming fighter
  hit thresholds by 1. Close escort does not stack, affect AA or work from the
  ground. Radar guidance and escort protection can cancel each other.
- RAF fighters have more AP and faster repairs. German escorts hit harder but
  have shorter endurance. Bomber speed, durability, loads and damage differ.

## Fuel and airfields

All aircraft begin on the ground. Select an airfield and open **Airfield · launch
& service**. Select an airborne flight for **Land / airfield recovery**. Grounded
flights do not spot, fight or appear as transport passengers on the map.

Every field has 8 strength, 3 AP, six berths and three runway cycles per own
turn. At half strength or lower it has only one cycle. Launch, landing, service
and station repair each use a cycle. Repairing does not reset cycles already used.

| Order | Cost | Result |
|---|---|---|
| Launch | 1 field AP + 1 flight AP + 1 fuel + 1 cycle | Choose a clear adjacent takeoff hex; requires at least 2 fuel |
| Fly | 1 flight AP + 1 fuel | Up to the aircraft's flight distance; visible and hidden interception still apply |
| Land | 1 flight AP + 1 cycle | Within 1 hex of a friendly field, with clear airspace and a free berth |
| Service | 1 field AP + 1 store + 1 cycle | Refill fuel/bombs; repair up to 2 RAF or 1 German strength |
| Repair station | 2 field AP + 1 store + 1 cycle | Restore 2 station strength, without erasing raid damage |

Each airborne own-turn ending consumes another fuel. Reaching zero then loses
the flight. A flight reaching zero during movement can still land if within
range and with an AP/cycle available. Landing itself consumes no fuel and does
not automatically repair, refuel or rearm.

Landing or service prevents another takeoff until the next own turn. Each
flight can be serviced once per own turn. RAF fields have eight stores each;
German fields ten. A destroyed field cannot be repaired and loses its grounded
flights. Airborne survivors can divert to either friendly field in solo play;
co-op flights must use a field in their own command group.

## Integration and privacy

Server legal orders validate every resource, approach and command restriction.
Enemy ground manifests, fuel, runway use, stores and interception readiness are
private. Threat overlays describe observed possible firing lanes, not hidden
interception orders. Target landmarks, total raid damage and destroyed objective
sites are public. Saved matches retain the versioned rules. Replays carry public
raid progress and redacted units; ordinary undo/redo captures the finite resources.

The computer launches escorts with raids, prioritizes objective damage, returns
for fuel/ordnance/repairs and reserves cycles for nearby low-fuel arrivals. It
uses observed enemies, its own resources and public target locations. It does
not receive extra fuel, AP, aircraft, service stores or favorable dice.

## Historical grounding and deliberate abstractions

This is a composite summer-1940 operation, not an exact dated order of battle.
The network theme draws on Chain Home, sector control and the Dowding system,
as described by the [RAF](https://www.raf.mod.uk/what-we-do/our-history/anniversaries/battle-of-britain/).
The Bf 109's limited time over Britain is reflected in shorter game endurance;
see the [RAF Museum's Bf 109E-3 account](https://www.rafmuseum.org.uk/research/collections/messerschmitt-bf-109e-3/).

Geography, flight callsigns, base assignments, flight counts, AP, damage, repair
rates and fuel units are game abstractions. The escort modifier represents
protection in formation, not literal armor. The aircraft selection avoids
claiming these composite flights are specific historical squadrons.

## Validation and balance status

- Focused rules/API tests cover finite aircraft, launch and recovery, cooldowns,
  fuel exhaustion/emergency landing, stores, damaged runways, field loss and
  diversion, raid anti-farming and victory boundaries, radar/escort modifiers,
  interception, privacy, co-op ownership, computer orders/replay and saved state.
- The full DSL regression suite passed 574 tests. After the final raid-target
  adjustment, all 18 focused tests and the DOM/API integration test passed. The latter exercises both armies at 1440 and 390 CSS pixels, all
  three Experience levels, launch/land/service/relaunch, fuel text, mission
  lessons, and transitions to Midway 2.0 and the original Britain map.
- DOM checks are not device or browser visual QA. No icon/art assets are changed.
- Seeded computer self-play is a diagnostic, not evidence of human win rates.
  Initial passes exposed excessive RAF advantage and avoidable fuel losses;
  bomber endurance, escort usefulness, AI return planning and the raid target
  were adjusted. The final eight seeded runs produced five RAF wins and three German wins
  (German wins in rounds 14, 15 and 18). This small deterministic sample is
  not a claim of competitive balance; playing both armies should guide further
  changes. The first release remains a playtest.
