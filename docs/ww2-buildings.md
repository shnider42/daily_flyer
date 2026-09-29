# DSL building conditions

New DSL matches save `building_version: 1`, a `buildings` condition dictionary
keyed by `x,y`, and separate `building_intel` memories for each army. Existing
matches and ASL/classic games keep their saved rules. No database migration is
required. Start a new battle to use these rules.

The base terrain remains `building`. The shared overlay applies across every
map, including island outposts and future scenarios. It never changes on reload.
Stalingrad shuffles approximately 60% intact, 30% damaged and 10% destroyed
buildings once at creation. Occupied starts are intact; roads, bridges, water
and objective tiles are untouched. Other maps start with intact buildings.
Scenario metadata (`building_conditions`, percentage per condition) controls the
initial distribution; combat never branches on a scenario name.

| Condition | Entry | Terrain cover | Sight |
| --- | --- | --- | --- |
| Intact | 2 AP for eligible ground units | +1 hit threshold | Blocks intervening sight; normal building concealment |
| Damaged | 2 AP for eligible ground units | +0 hit threshold | Unchanged |
| Destroyed | No ground entry, unloading or bailout | Building terrain retained | Unchanged |

Existing restrictions still apply: tanks/half-tracks cannot enter buildings.
Aircraft can fly overhead. Dug-in cover remains a separate +1 bonus.

## Structural hits

A successful primary hit from tank AP/HE, an AT shell/rocket, heavy naval guns,
bombs, carrier strike ordnance or heavy artillery advances a building one state.
Weapon profiles expose a `structural` capability for future weapons. Light ship
guns, small arms, MGs, aircraft guns, flak, hand grenades and adjacent fragments
do not damage masonry. Empty aimed buildings take the same structural damage
from a successful bombardment/artillery strike as occupied ones.

Intact → damaged still applies the normal weapon damage to the target.
Damaged → destroyed eliminates **all ground occupants**, including friendly
units and passengers, without a bailout. Flying aircraft are unaffected.

Mortars retain automatic infantry fragment damage across their marked area.
If that area contains building terrain, roll **one additional d6 per barrage**:
5–6 advances every building in the area one state. A lower structural roll does
not cancel the infantry damage. Heavy artillery damages only its primary
building; neighboring infantry takes the existing fragment damage.

## Information and continuity

Both armies know the starting terrain survey. Subsequent changes are shown only
when observed. Unseen bombardment does not disclose collapse or casualties.
Movement, transport and computer route choices respect ruins; the computer plans
from remembered conditions and avoids unstable cover threatened by known weapons.

Combat reports list observed terrain changes and the separate mortar structural
roll. Replays use each frame's remembered terrain. Save codes preserve actual
conditions and both memories. Undo/redo restores the same terrain, casualties and
dice; newly scouted damage commits earlier orders, like a new enemy sighting.

Both Basic and Detailed styles distinguish intact roofs, cracked roofs with an
amber warning and rubble with an ×. Desktop hover explains entry/cover. Selecting
troops inside damaged buildings shows a warning in the existing phone action
hint, without adding another map overlay or changing the map viewport.

## Future concept: Operation Market Garden (not implemented)

Keep bridges, airborne deployment, observation points and faction differences
together in a future scenario rather than add disconnected units to Stalingrad.

- **Bridges:** multiple linked objectives and alternate approaches, with bridge
  control determining reinforcement routes. Separate bridge integrity rules from
  buildings; wrecked bridges need their own crossing and repair design.
- **Airborne forces:** Allied reserves deploy onto scouted open landing zones;
  mobile German reinforcements contest the crossings. Balance arrival timing and
  AP budgets before simply increasing unit counts.
- **Sniper:** a small, fragile infantry team with accurate single-target fire,
  limited shots/AP and no splash. Firing should risk revealing its position;
  suppression, smoke and flanking should provide counterplay. No final numbers yet.
- **Clock tower / observation post:** an enterable elevated structure. Recon and
  snipers could gain sight range, with a separate decision about firing range.
  Extra range should not automatically grant vision through intervening buildings
  or smoke. Its visibility advantage trades against exposure and structural
  collapse risk. Use terrain capabilities rather than map-name checks.
- **Playtest:** check bridge stalemates, airborne landing safety, sniper dominance,
  tower spotting and equal chances to react to reinforcements. Keep saved-match
  versioning and per-side fog memory when implementing these capabilities.

## Verification

`python -m ww2_tactics.devtools test` includes `test_ww2_buildings.py` for structural
effects, movement/transport, fog privacy, AI knowledge, legacy compatibility,
takebacks and API save restoration. `tests/ww2-buildings-browser.cjs` uses an
isolated local database for phone/desktop artwork, warnings, tooltips and replay
checks. No production match is modified by these checks.

Release verification: 215 Python tests passed. Buildings and weapons browser
suites passed at 320, 390 and 1440 pixels, including both terrain styles, map
continuity, desktop hover, and before/after terrain replay. Screenshots were
reviewed. These are Chromium touch-emulation checks, not an on-device Safari test.
