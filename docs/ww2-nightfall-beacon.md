# Nightfall Beacon · Current DSL

Choose **Current → Nightfall Beacon**. This fictional 1944 operation uses a
30×26 board (780 hexes) and supports solo, two army commanders, and platoon co-op.
The default co-op layout is two Allied platoons against two German platoons.
Unclaimed groups use the existing computer opponent and durable background queue.

Each Allied platoon has nine counters: two Mosquito night fighters, one Lancaster
heavy bomber, one Halifax tactical bomber, one Mosquito Pathfinder, one Dakota
transport, its two British airborne squads, and a service strip. Each German
platoon has ten: one Messerschmitt Bf 110 night fighter, heavy and light Flak,
two Spotlights, a mission radar site, two rifle squads, one machine gun, and a
service field. There are 38 counters including the four embarked reserve squads.
Aircraft silhouettes distinguish the profiles; Spotlight and transport are new
unit classes. Hex ranges and dice probabilities are game balance values.

Allies must destroy **both radar sites**, then hold the **signals station** with
an unpinned, landed paratrooper for **two consecutive Allied turn endings**.
Any German infantry within one hex contests the station; losing control or
pinning its holder resets progress. Bombing alone cannot win. Germans win if no
viable airborne squad remains, or if the raid has not succeeded after both turns
of round 24. Enemy elimination does not bypass these mission conditions.

## Darkness and illumination

Ordinary aircraft see two air hexes; Mosquito escorts see four, Bf 110s five, and
radar sites six. Ground sight is shorter and respects terrain concealment. Radar
detects aircraft without revealing distant ground troops. Enemy interception
readiness and embarked cargo remain private.

**Aim spotlight** costs 1 AP and searches a narrow air corridor to an aim within
eight hexes, with a one-hex focus radius. It reveals aircraft to both sides and
exposes the Spotlight's own position. It does not reveal unlit ground troops.
The beam lasts through the opposing turn, clearing at the next German turn.
Destroying the emitter removes its light immediately.

**Drop flare** costs 2 AP. Each Pathfinder has two charges and can aim within
five hexes. A radius-two patch reveals air and ground to both armies through the
opposing turn. A friendly flare reduces drop scatter by one hex, while also
making aircraft easier for German Flak to target.

Darkness adds one to normal attack thresholds and two to Flak thresholds.
Illumination removes that penalty; the resulting threshold is capped at six.
Gunfire briefly exposes the shooter at its firing position. Moving or beginning
its next turn clears the flash. Preview and resolution use the same modifiers.
These rules affect detection and combat, alongside the darker map presentation.

## Dakota drops and dice

Fly the actual Dakota **within one hex of the intended drop aim**, then use
**Drop paratroopers** for 3 AP. Each Dakota carries two specific squads and may
drop once per round. Aircraft and cargo share their owner in both platoon and
individual-unit co-op. Reserve squads cannot use the older map-wide drop action.

| Natural d6 | Result before hazards |
| --- | --- |
| 1 | Squad lost; no landing position or new sight. |
| 2 | Scatter three hexes. |
| 3 | Scatter two hexes. |
| 4–5 | Scatter one hex. |
| 6 | Exact landing if legal. |

Scatter uses a separate direction roll. A friendly flare or an airborne beacon
reduces scatter by one, preserving the natural-one loss. Flak approach coverage
is two hexes in darkness and the battery's listed range under illumination.
An approach roll of one or two loses the squad; each battery reacts to one drop
per round. Reports do not expose hidden battery identities or occupancy checks.

Survivors arrive with one AP, cannot bank arrival AP, and regain their normal
three AP on their next turn. Rough landings cost one strength. Water landings
cost two strength at each own turn end until ashore. Destroying a Dakota removes
only its undropped cargo. Searchlights, flares, drops and dice results commit
order history so undo cannot fish for new information or reroll outcomes.

Lancasters carry three heavy loads (three damage); Halifaxes carry two tactical
loads (two damage); Pathfinders have two light loads (one damage). Field service
costs two aircraft AP, once per turn, within one hex of that aircraft's own
platoon's surviving field. It repairs one strength and restores ordnance and
flares to the correct profile capacity. Each field has six finite stores.

## Validation

All 508 Python rule/API regressions pass, including 17 Nightfall cases and Legacy
fingerprints. The four-seat Chromium desktop/phone harness passes actual flight,
Spotlight detection, shared flares, guided transport drops, arrival ownership/AP,
radar bombing, mission text, all Experience levels, and asset/page-error checks.
Crosswind's four-seat browser regression also passes. Computer replay frames
retain the recorded illumination and objective state. Physical Safari and human
balance playtests remain; the operation is marked as a playtest.

```sh
python -m unittest discover -s tests -p 'test_ww2*.py'
node tests/ww2-nightfall-browser.cjs
node tests/ww2-crosswind-browser.cjs
```

The browser harness uses a disposable local database and forces sixes only in
its own test server to verify a successful drop and two actual bombing orders.
Production dice remain server-rolled. `CHROMIUM_EXECUTABLE_PATH` can specify an
existing Chromium installation.
