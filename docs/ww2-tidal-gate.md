# Operation Tidal Gate

A fictional Normandy-inspired DSL operation: **36×44 hexes (1,584), 64 units,
14 roles, 44 rounds**. This is 2.75 times Long Reach's area and just over twice
Midway's area. The geography, unit allocation, combat values, reinforcement
rounds and turn duration are gameplay abstractions, not a reconstruction of a
named battle. Choose **Tidal Gate · huge** on the home screen or select it for a
solo game, multiplayer game or rematch. Classic and the planned ASL track are
separate. Existing battles keep their saved map and rules.

## Five fronts on one board

| Sector | Tactical problem | Useful roles |
| --- | --- | --- |
| Beachhead | Four loaded boats must put separate troops ashore. Protect disembarkation and organize the two landing groups. | Landing craft, rifle squads, engineers, LTs, MGs, amphibious sections |
| Flooded fields | Marsh excludes tanks and half-tracks. Three exposed raised roads cross the flooded belt; two lead to required beach exits. | Smoke, MG suppression, AT teams, amphibious movement, armor on roads |
| Airborne pockets | Ten troops already operate inland. Two more US airborne units can land on spotted open ground using existing 2-AP deployment. | Paratroopers, recon, snipers, LTs, AT teams |
| Bocage and river | Hedges interrupt observation and vehicle movement. Existing bridges are usable immediately; engineers can open extra routes. | Engineers, tanks, scouts, half-tracks, stationary AT guns |
| Inland town | Hold the command post while keeping a beach exit garrisoned. Buildings may be damaged or collapsed; towers improve observation. | Infantry, commanders, artillery and recon calls, engineers, snipers |

The American army has 36 counters including passengers and reserves; Germany
has 28. Unit strength is staying power, not a literal troop count. The full set
is rifle squad, lieutenant, MG, recon, sniper, engineer, AT team, commander,
tank, AT gun, amphibious section, landing craft, paratrooper and half-track.
Existing US accuracy/mobility and German suppression/range tradeoffs remain.
All support uses the existing shared weapon, sight, smoke, repair, command and
cooldown rules. Aircraft support remains abstract Commander sorties; this
scenario does not merge the separate air and fleet rule engines.

## Linked victory

Americans must simultaneously garrison **the inland command post and either
causeway exit** at the end of two consecutive American turns. Both exits are
optional alternatives: choosing one front is enough. Losing either required
link resets progress immediately, including during the defending turn.

Only active infantry can garrison: rifles, MGs, recon, snipers, engineers,
paratroopers, AT teams and officers. Pins do not remove occupation. Vehicles,
stationary guns, amphibious sections, boats, passengers and off-map reserves
do not garrison. Germany wins at the end of its round 44 if the Americans have
not already won. Elimination of every enemy unit, including reserves, and
resignation retain their existing outcomes.

The three objective flags are intentionally **public mission information**.
They report only the side of an infantry garrison, without exposing its identity,
strength, neighboring enemies or firing opportunities. This is an abstract
reporting rule. The mission panel explains this exception to fog explicitly.
It also provides five sector buttons, so a phone player can jump to a front
without searching the entire map. Normal selection still preserves the camera.

## Scheduled reserves

| Side | Arrival | Units and entry |
| --- | --- | --- |
| Americans | Start of their round 5 | Tank at R35; engineer at T35, on the beach assembly line |
| Germans | Start of their round 6 | Tank at S3; half-track at U3, on the northern approach |

These units cannot act, spot, garrison or use airborne deployment before arrival.
An occupied entry delays that individual unit to a later friendly turn start;
there is no stacking, relocation or deletion. Arrival grants base AP only and
can trigger enemy overwatch. Timings are public; concealed arrival details
remain hidden. Timed reserves are separate from the two player-directed airborne
reserves. Match snapshots and SAVE codes preserve both types.

## Shared terrain and engineering

| Terrain | Movement | Cover and sight |
| --- | --- | --- |
| Beach | 1 AP | No cover |
| Flooded field / marsh | Infantry 2 AP; amphibious 1; tanks, half-tracks and boats blocked | No cover |
| Bocage | Infantry 2 AP; vehicles blocked | +1 cover, infantry concealment and intervening sight blocked |
| Concrete strongpoint / bunker | Infantry 2 AP | Intact +2 cover; damaged +1; blocks intervening sight; heavy hits damage and then collapse it |
| Raised causeway | Road movement and existing road bonuses | No cover |
| Cleared rubble | Infantry/vehicles 2 AP | +1 cover; sight can pass through |

An observation tower can see over one intervening bocage/wood/building hex,
as with existing low obstacles; it cannot see through a bunker, another tower
or smoke. Seeing farther never grants a longer direct-fire weapon range.

Engineers in **new DSL ground battles on every existing map** gain:

- **Breach hedge, 2 AP:** change adjacent bocage into exposed ground. This opens
  a vehicle route and a firing lane; it can help the enemy too.
- **Clear rubble, 2 AP:** reopen an adjacent collapsed building, tower or bunker.
  The result is rubble, not a restored building. Intact/damaged structures cannot
  be cleared with this order. Existing repair-tank kits are unaffected.
- **Build bridge, 3 AP and one bridge kit:** span one water hex with firm ground
  directly opposite on both banks. One kit per engineer per battle. Bank an AP
  or receive officer support. Broad flooded belts and open sea cannot be bridged.

These are distinct from the existing tank-repair order. Pinning, being aboard
transport, reserve status, turn ownership and AP all gate engineering. The UI
shows unavailable orders and their reasons, using the existing order layout.
Changes outside observation are remembered only after scouting. Replays use
terrain known at each frame, not the final map. A newly discovered route commits
undo; otherwise quiet engineering supports undo/redo with its AP and kit restored.

## How improvements carry back

`fieldworks.py` supplies shared movement and versioned engineering rather than
branching on the scenario name. New ground matches opt into `fieldworks_version`;
loading an old match does not initialize or upgrade it. Stalingrad benefits from
clearing collapsed streets; Market Garden gains alternative narrow river
crossings; other ground maps can reuse the same terrain and engineer abilities
when their scenario data supplies the opportunity. Older map layouts and victory
conditions are unchanged.

`linked_front.py` reads objective roles and reinforcement traits from scenario
and unit data. Another operation can opt into linked objectives without copying
the resolver. Guidance, public status, AI assignment, replay and save behavior
must be included with any new objective family. The computer splits formations
across the two exits and town, can use engineering, and bases route planning on
its own remembered terrain. It remains a practice opponent, not a proven strong
opponent for a 64-unit operation.

Wider maps now label columns **AA–AJ** correctly in controls, reports, logs and
replays. The existing full unit names, illustrated art, platoon highlighting,
Simple view, Dad mode, stable mobile camera, turn signals and guest-only learning
are retained. New guest lessons cover engineering and linking the fronts.

## Playtest questions

Record the scenario, side, round and match code with observations. Use the
existing private diagnostic export when reproducing a rules issue locally.
No additional analytics or background reporting is introduced.

1. Can a new player explain the two-part win condition after opening the mission?
2. Does each landing reach its exit soon enough to help the airborne troops?
3. Do hedge gaps and new crossings create choices, or one dominant route?
4. Can defenders counterattack without abandoning every useful gun position?
5. Are R5/R6 reserves timely, and are blocked entry explanations understandable?
6. Does the phone retain enough map area when an engineer's full orders are shown?
7. Are US mobility and German defensive advantages competitive from both seats?

Tune scenario positions, roster values, round limit and arrival rounds before
changing shared combat rules. Carry a shared rule improvement back only with
old-map regression coverage. Do not silently rebalance saved games. Balance
requires human playtesting; automated checks establish rule and UI behavior.

## Historical grounding

The setting combines documented themes from the Normandy campaign: airborne
forces securing exits behind Utah, movement channeled by flooded terrain,
engineering work to open routes, and coordinated seaborne/ground support.
The map is an original compressed composite; a causeway, bunker or bridge hex
is not a claim about a precise real location or construction time.

- [US Army, D-Day history](https://www.army.mil/d-day/history.html?from=dday):
  airborne operations and flooded terrain around the Utah sector.
- [Army University Press, Normandy airborne staff ride](https://www.armyupress.army.mil/Portals/7/educational-services/staff-rides/VSR/Normandy/Airborne-Assault/Normandy_Airborne_Walk_Book.pdf):
  marshland, causeways and river-crossing context.
- [US Army Corps of Engineers, Normandy landing](https://www.usace.army.mil/Media/Fact-Sheets/Fact-Sheets-View/Article/4465625/086-army-engineers-made-key-contributions-during-the-normandy-landing-and-beyon/):
  engineer contributions to clearing obstacles and opening movement routes.
- [Naval History and Heritage Command, D-Day](https://www.history.navy.mil/our-collections/photography/wars-and-events/world-war-ii/d-day.html):
  landing craft, airborne operations and naval support context.

## Verification

Run `python -m ww2_tactics.devtools test` and the browser suites with Playwright
and a local Chromium executable. `test_ww2_tidal_gate.py` covers the linked win,
terrain, bridge constraints, actual vehicle/boat routes, reserves, fog redaction,
engineering, save round trips and takebacks. `ww2-tidal-gate-browser.cjs` exercises
live creation, wider coordinates, sectors, both mission perspectives, lessons,
320/390/1440-pixel layouts, real engineering orders, undo/redo and historical
terrain rendering. Existing capabilities and guest-learning suites protect the
shared controls. These are local Chromium checks, not physical iPhone Safari
certification. No new dependencies, database migration or Render settings.

Release verification: **250 Python tests passed**, plus Tidal Gate, capabilities
on all 12 maps, and guest-learning browser suites. A full initial computer
turn completed in about 18 seconds locally. Screenshots were reviewed at phone
and desktop sizes. Human balance testing and the Render deployment are separate
from these local results.
