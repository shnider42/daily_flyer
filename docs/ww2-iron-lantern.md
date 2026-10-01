# Operation Iron Lantern — airborne playtest

Start a **new DSL battle → Iron Lantern · airborne**. The 30×34 board has
24 Allied units (including three off-map reserves), 22 Germans, and 32 rounds.
The Allies must garrison the canal command post and either northern canal exit
with infantry at two consecutive turn endings. The Germans must break that
link or outlast the clock. Flags are public; surrounding enemy positions are not.

This is a fictional Low Countries operation inspired by autumn 1944. US airborne
troops and British armor face a German battle group. It reuses platoon-local
spotting, AP radio reports, mortar crews, engineer work and retained SVG terrain.
The three road axes and two canals create choices for infantry, tanks, scouts,
transport, fire support and airborne reserves. No additional terrain type was
needed: existing water, bridges, hedges, woods, buildings and towers do the work.

## Commander-directed airlifts

Only the Allied airborne commander can call these reserves. The capability is
available to a US or British commander carrying the scenario trait; it is not
a global order added to commanders on older maps.

- **3 commander AP**, one lift per army per round, three finite reserve squads.
- Aim at **any map hex**, regardless of sight. Previewing a hex never consults
  hidden occupants or Flak. A normal confirmation explains risks before spending.
- Roll one d6. A natural **1 destroys the squad before it becomes an observer**.
- For 2–5, a second die chooses one of six scatter directions. Distance follows
  the table below. A 6 lands on the aim if it is clear.
- An occupied or obstructed resolved hex diverts to the first available adjacent
  landing in the scatter direction's rotation. Mountains, towers, bunkers and
  collapsed buildings cannot receive a drop. All six blocked means a loss.
  Scattering off the board also loses the squad.
- The reserve activates only at its final surviving landing hex. The intended
  hex and flight path never reveal ground contacts. Ground overwatch may react
  after a successful landing.
- Each drop consumes the reserve even when it fails. Airlifts commit undo; they
  cannot be rerolled. Beacons also commit undo because they disclose a signal.

| Natural roll | Scatter | With an active beacon near the aim |
| --- | --- | --- |
| 1 | Squad lost before spotting | Still lost |
| 2 | 3 hexes | 2 hexes |
| 3 | 2 hexes | 1 hex |
| 4–5 | 1 hex | Exact if clear |
| 6 | Exact if clear | Exact if clear |

An enemy **20 mm Flak team within four hexes of the resolved landing** gets a
separate interception check. On 1–2 the transport is lost before spotting. Only
one gun attempts per drop; coverage does not stack. Each gun attempts at most
once per round. It must be alive, deployed and unpinned. This models fire against
the descending transport, so ground line of sight and an overwatch order are not
required. Ground fire does not spend its interception attempt.

Unopposed transport survival is 5/6 before terrain hazards. Covered survival is
5/6 × 4/6 = 5/9 before terrain hazards. These are deliberate playtest numbers,
not historical loss rates. Pinning, destroying or avoiding Flak gives counterplay.
The server consumes the secondary approach die after every non-1, even without
an eligible gun. Gun identity, position, count, readiness and approach die are
never included in an enemy-facing preview or loss report. A failed approach can
suggest air defense in the area; it cannot identify its hex.

Enemies hear only a broad nine-sector transport warning, including on a natural
1. The owner receives the landing die, scatter, final position if any, and result.
The opposing seat and its computer replay never receive the private aim or report.

## Pathfinders and landing consequences

The US **Pathfinder team** is a fragile scout with 2 strength, 3 base AP and sight
9. It can Observe and gains the normal scout tower sight. **Mark LZ** costs 2 AP
and its one beacon. Aims within two hexes of the operator scatter one less hex
while it survives, remains deployed and is not pinned. Moving, boarding or firing
ends the beacon permanently. Pinning disables it until rallied. It cannot prevent
a natural 1 or Flak interception. Enemy wireless warnings give only a sector.

A surviving reserve gets **1 AP** on arrival, with no AP banking or officer AP
grants that turn. It returns to its usual 3 base AP next friendly turn. Ordinary
land movement still uses existing terrain and road rules. A landing in woods,
buildings, hedges, ridges, wadis, oases or marsh costs 1 strength.

Water is a legal landing. Afloat troops cannot attack, but can swim one adjacent
hex per AP or board an adjacent friendly transport by selecting the carrier.
They lose **2 strength at each own turn end**, including the arrival turn, until
ashore or aboard. Thus a 3-strength squad survives one turn afloat and dies on
its next own turn end unless rescued. Mountains, towers, bunkers and collapsed
structures cannot be used as swim exits. Passengers do not spot or take water loss.

## Asymmetric equipment

| Unit | Advantage | Tradeoff |
| --- | --- | --- |
| German Tiger I, one | 6 strength, armor 3, range 9, armor-piercing hit deals 3 | Each legal move costs at least 3 AP; no free road step. Its 3 base AP cannot fund movement and fire together. |
| British Sherman Firefly, one | Range 8; 17-pounder AP hit deals 3 | 4 strength, armor 2, 2 base AP. HE deals only 1 infantry damage and has no splash. |
| British Sherman | 3 base AP, normal road mobility | Normal 4-strength Sherman protection and gun; shorter range than the Tiger. |
| German light Flak, two | Automatic airlift defense; light gun can pin and hurt infantry/light vehicles | Fixed position; pinning disables air defense; cannot penetrate tanks or garrison objectives. |
| German Pioneers | Two adjacent anti-armor demolition charges per team | Must close to adjacent spotted armor and spend 2 AP per attempt. |
| US Pathfinder | Scout spotting and one beacon | Fragile, must remain in place; cannot eliminate drop or interception risk. |

The Firefly's weaker HE and the Tiger's AP movement cost are game balance
choices. They do not assert a precise real-world speed or lethality ratio.
British PIAT teams, Commandos, radio teams, mortar crews and a half-track add
alternatives to a tank duel. Infantry still has to secure the mission link.

## Shared implementation and future rollout

`airborne_version=1` is initialized only for new Iron Lantern games. Existing
maps, ongoing saves and their reserve deployment keep their previous rules.
Movement costs, arrival AP caps, weapon profiles, sight, history commits, public
reports, save/restore, computer choices and replay filtering use shared modules.
Later maps can opt in through scenario and unit data after balance review.

The interface keeps on/off/experimental presentation modes. Targeting reuses the
existing hex nodes and terrain symbols; it does not build another full-map SVG
layer. It also works over occupied counters and through keyboard hex activation.
Unavailable orders retain readable costs and reasons. The desktop header now
wraps its toolbar without squeezing a long scenario title into a narrow column.
Ammunition help reads variant damage and splash values instead of assuming all
tanks have the same gun. These interface fixes benefit older maps too.

## Validation and next playtests

`tests/test_ww2_airborne.py` covers all roll/direction combinations, hidden Flak,
occupied/blocked/off-map drops, beacon counterplay, AP caps, water/rescue timing,
reactions, faction gates, finite reserves, irreversible history, heavy armor,
mobile-unit routes, computer privacy, both API seats and checkpoint restoration.
`tests/ww2-airborne-browser.cjs` uses real HTTP orders and checks phone targeting,
confirm/cancel, occupied counters, keyboard hexes, reserve/AP costs, persistence,
art, briefings, and 320/390/430-wide and landscape layouts.

Computer opening turns complete legally for both armies; the Allied computer
uses the airlift and can prioritize swimming ashore. This validates completion,
not competitive balance. Next human sessions should record drop outcomes by
coverage, beacon use, reserve survival, rounds to each linked hold, Tiger turns
spent moving versus firing, Firefly survival and victory rates when sides swap.
Tune this map's supplies, AA radius or rosters before enabling these rules on
Market Garden or the earlier theaters.

Historical inspiration:
- [National Army Museum — Operation Market Garden](https://www.nam.ac.uk/explore/market-garden):
  US/British airborne forces, armored relief, bridge objectives and communications
  difficulties inform the scenario's broad roles.
- [National Army Museum — Sherman Firefly collection entry](https://collection.nam.ac.uk/detail.php?acc=1975-03-63-20-153):
  supports the 17-pounder Firefly as an appropriate British anti-tank counterpart
  in north-west Europe in 1944.

The map, roster allocations, dice odds, ranges, strength and AP are game design.

Release verification: **286 Python tests passed**, alongside order discovery on
all 16 maps and real airborne browser orders. Existing Tidal Gate navigation was
checked under 4× CPU throttling: retained terrain after orders, zero redundant
full-state GETs, stable camera, touch pan/pinch and correct fog. Local movement
round-trips were about 0.46 seconds on phone emulation and 0.33 seconds on desktop;
these are environment measurements, not production or physical-phone promises.
Screenshots were inspected at phone and desktop sizes. Human balance and the
live hosting deployment remain separate checks.
