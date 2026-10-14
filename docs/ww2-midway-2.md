# Midway 2.0

New-match operation: **Current → Midway 2.0** (`current:midway_2`). The original
Midway and existing saves keep their existing rules. This is a 30×26 daylight
carrier battle with fixed deployments, ordinary spotting and last-known contacts,
not Nightfall darkness or randomized defense locations.

## Scaled asymmetric fleets

| Fleet | Carriers | Flights per carrier | Air-group mix per carrier | Carrier hull | Service stores |
| --- | ---: | ---: | --- | ---: | ---: |
| United States | Enterprise, Hornet, Yorktown (3) | 4 | Wildcat, 2 Dauntless, Devastator | 8 | 8 each |
| Japan | Akagi, Kaga, Soryu, Hiryu (4) | 3 | Zero, Val, Kate | 6 | 6 each |

Both fleets start with **12 finite aircraft counters**, **24 carrier hull**, and
**24 service stores**. A counter represents a small flight, not one literal
historical plane. US cruisers have stronger AA and aircraft service restores up
to 2 strength; Japan restores 1 but has more independent decks. Wildcats fly
3 hexes per movement AP with 4 base AP; Zeros fly 4 with 3 base AP. Each has
3 strength. Dive bombers and torpedo bombers fly 2 hexes per movement AP with
3 base AP and carry one attack load.

| Flight | Range | Hit threshold | Hull damage |
| --- | ---: | ---: | ---: |
| US Dauntless dive bomber | 1 | 3+ | 3 |
| US Devastator torpedo bomber | 2 | 5+ | 3 |
| Japanese Val dive bomber | 1 | 4+ | 3 |
| Japanese Kate torpedo bomber | 2 | 4+ | 4 |

Torpedo aircraft need one higher result against destroyers. US escorts are three
cruisers and three destroyers; Japan has two torpedo cruisers and four destroyers.
Cruiser AA reaches 2 hexes (US 2 damage, Japan 1); other ships have 1-hex,
1-damage AA. Interception costs 2 AP and reacts once to a qualifying takeoff,
flight leg or landing approach. Enemy readiness is private.

## Carrier workflow

Select a carrier and choose **Air group** (inside Orders on map-first phones).
The manifest lists named flights, strength, load, hangar/airborne/lost status,
remaining stores and deck cycles. It is available at every Experience level.

1. **Launch:** select a flight and a highlighted air hex on or adjacent to the
   carrier. Costs 1 carrier AP, 1 flight AP and one deck cycle. The existing
   aircraft becomes airborne; nothing is spawned. Airspace occupancy is checked
   by the server and interception may fire.
2. **Land:** select an airborne flight, then **Land / carrier recovery**.
   A surviving friendly carrier in the same command group must be within 1 hex,
   have a free berth and an unused deck cycle. Costs 1 flight AP and one deck
   cycle, not carrier AP. Recovery is interceptable. The aircraft becomes a
   passenger with zero AP and does not repair or reload automatically.
3. **Service:** select the carrier, open Air group, and service a damaged or
   empty flight aboard. Costs 1 carrier AP, one deck cycle and one finite store;
   restores up to 2 US / 1 Japanese strength and full ordnance. Does not repair
   destroyed flights. Each aircraft can be serviced only once per own turn.

Landing and servicing prevent launch until the next friendly turn. Aircraft
aboard follow the carrier but cannot move independently, attack, intercept, spot
or occupy airspace. Airborne aircraft cannot use Crosswind's nearby carrier
service. There are no abstract carrier searches or attack sorties: scout with
the real flights.

## Unique mechanic: deck tempo

Each undamaged carrier has **two deck cycles per own turn**, shared between
launches, landings and service. At half hull or below it has **one**. Hull repair
can restore throughput but does not erase already-used cycles. Cycles and
aircraft readiness reset only when that fleet's next turn starts.

The US can launch six flights across its decks per turn versus Japan's eight,
but has deeper individual air groups, stronger AA and repair support. Using all
cycles for launches leaves no recovery slot that turn. Sinking a carrier destroys
only its hangar occupants; airborne flights survive and can divert to a carrier
in their own command group with spare capacity. In unit-control co-op, carrier
and original air group are one ownership group; another player's deck is not
commandeered by diversion.

## Victory and persistence

Sink all opposing carriers, or score 12 points. Each of the three sea lanes gives
1 point at your fleet's turn end if a ship is within 1 hex and no enemy ship
contests it. Aircraft cannot capture or contest. At the end of round 24, higher
score wins; an exact tie goes to Japan. Solo, invitations and two-platoon-per-side
co-op use the same server rules. Saves retain aircraft IDs, passengers, damage,
ordnance, deck cycles, cooldowns and finite stores. The computer launches,
recovers and services real flights and does not know hidden enemy positions.

## Historical basis and deliberate abstractions

The three-versus-four carrier identities, US dive-bomber emphasis and weaker
Devastator attack are inspired by Midway, not presented as an exact order of
battle. Flight counters, escorts, atoll geography, surface-control victory,
deck limits and national repair bonuses are game abstractions. No fuel, altitude,
wind direction, individual pilot attrition or historical sortie timetable is
simulated. Initial numeric parity is not proof of balance; human playtesting is
still needed, particularly first-turn tempo and Japanese torpedo pressure.

Primary historical references:

- [Naval History and Heritage Command: Battle of Midway](https://www.history.navy.mil/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/midway.html)
- [NHHC H-006-1: Midway overview](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-006/h-006-1.html)
- [NHHC H-006-4: The victory](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-006/h-006-4.html)
- [USS Yorktown action report](https://www.history.navy.mil/research/archives/digital-exhibits-highlights/action-reports/wwii-battle-of-midway/uss-yorktown-action-report.html)

## Verification

`tests/test_ww2_midway2.py` covers catalog isolation, fixed daylight setup, both
rosters, launch/recovery/service validation and AP, shared deck limits, damage
control, own-turn reset, capacity and diversion, sinking, hangar privacy,
interception, finite attack loads, victory, computer orders, co-op ownership and
actual API save/restore. `tests/ww2-midway2-browser.cjs` uses actual pointer/touch
orders for both fleets on desktop/phone layouts, every Experience, 320–1440px,
modal cleanup, takeoff, landing, servicing and next-turn readiness. Browser
fixtures only prepare deterministic return/turn phases in a disposable local DB;
the tested orders all pass through the real HTTP API.
