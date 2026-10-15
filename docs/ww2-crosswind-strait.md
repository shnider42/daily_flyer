# Crosswind Strait · Current DSL

Choose **Current → Crosswind Strait → Co-op & teams**. Platoon control is the
default: two Allied and two Axis groups, up to four human commanders. Two friends
can command the Allies against two computer platoons, or players can occupy all
four groups for 2v2. Unclaimed platoons use the existing Easy/Standard AI and
durable background queue. Solo and ordinary two-player army control also work.

The fictional 24×20 board has 480 hexes, three sea lanes and two island obstacles.
Every platoon has seven counters: one fleet carrier, one specialist cruiser,
two destroyers, two fighters and one naval strike bomber. There are 14 units per
side, 28 total. Each platoon owns both its aircraft and its ships.

| New unit profile | Side | Distinct role |
| --- | --- | --- |
| AA escort cruiser | Allies | 3-hex AA; 2 damage to aircraft. Weaker, range-5 surface guns. |
| Dive bomber | Allies | Two ordnance loads; range 1; hits ships on 3+ for 3 hull damage. |
| Torpedo cruiser | Axis | Three torpedo salvos; range 5; hits ships on 4+ for 4 hull damage. |
| Torpedo bomber | Axis | One ordnance load; range 2; hits ships on 4+ for 4 hull damage, or 5+ against destroyers. |

These are new saved equipment variants of existing cruiser/bomber classes,
consistent with the tank profile system. They have separate names, silhouettes,
stats and capabilities. Original maps, saved fleets and aircraft keep their
existing profiles. This is a fictional game layout, not a historical battle.

Ships can set **AA interception** for 2 AP. One reaction fires along an enemy
aircraft's flight path; moving or firing the ship cancels readiness. The Allied
escort deals 2 damage within 3 hexes. Other ships deal 1 within 1 hex. Fighters
retain their interception order. Ship AA can also fire directly at spotted
aircraft for 2 AP; surface weapons and torpedoes cannot target aircraft.
Enemy interception readiness is private. Aircraft and ships occupy separate
layers, with one counter per layer per hex. Islands block surface movement,
guns and ship torpedoes; aircraft can fly above them.

New matches use Midway 2.0-derived **carrier deck orders**. The existing three
flights per platoon still start airborne; no units are added. Recover within
one hex of the platoon's carrier for 1 aircraft AP. Service aboard costs 1
carrier AP and one finite store, restores 1 strength and reloads that bomber's
full capacity. Relaunch costs 1 carrier AP plus 1 aircraft AP. Each order uses
one deck cycle: two per own turn, reduced to one at half hull or below.
Recovered/serviced flights cannot relaunch until their next turn.
With individual-unit command, each carrier and its three flights stay under
one controller; platoon command remains unchanged.

Each carrier has three berths and six service stores. No regeneration,
replacement aircraft, teammate-carrier access or abstract search/attack
sorties; scout with actual aircraft. Sinking a carrier destroys only flights
still aboard, not airborne aircraft. The **Air group** panel shows deck cycles,
stores, lost/airborne/aboard flights and launch/service controls. Select an
airborne plane to open **Land / carrier recovery**.

Existing saves without `carrier_decks_version=1` keep their original rules:
airborne service for 2 aircraft AP within one hex, and carrier searches.

Each sea lane earns one point at an army's turn end if a ship is within one hex
and no enemy ship contests it. Multiple friendly ships score only once.
Aircraft cannot capture or contest lanes. First to 12 wins; after both turns
of round 18, higher score wins and Axis wins a tie. Eliminating the whole enemy
force also wins. Losing all carriers alone does not end the battle.

**Finish my orders** locks only that player's orders; their teammate continues.
The army changes turn after both players and any computer groups finish.
Carrier stores, torpedoes, bomb loads, ownership and rules remain in saves.

Validation: new rule/API tests cover every mixed platoon, all four new profiles,
legal starts, layer capacity, island routing, aircraft-only AA reactions,
finite carrier service, private interception state, victory, bounded AI on both
sides, four-player authority/shared turns and snapshot restoration. All 491
Python regressions pass, including the existing Legacy fingerprints. The
Chromium desktop/phone-emulation harness passes discovery, four-player
recruitment, actual orders, service, unit art, layers, mission text, all three
Experience coaching levels and page overflow. Two human platoons versus two
computer platoons also completed a background turn using both domains without
browser requests. Physical iPhone/Safari and human balance playtests remain.

Run:

```sh
python -m unittest discover -s tests -p 'test_ww2*.py'
node tests/ww2-crosswind-browser.cjs
```

The browser harness uses development-only Playwright and a local disposable
database; `CHROMIUM_EXECUTABLE_PATH` can specify an existing Chromium binary.
