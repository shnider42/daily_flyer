# Learning Empires without Civilization experience

The October 2026 iPhone feedback exposed two related gaps: prettier counters
did not explain the map, and Simple shortened text without teaching how to
make decisions. Empires must teach its own rules without assuming experience
with Civilization. This is a first guided learning loop, not a full strategy
course. The principles to carry into DSL are recorded in
[Learning experience principles](learning-experience-principles.md).

## Default behavior

Simple includes guided learning by default. Opening a campaign introduces the
guide once per browser; the persistent **Learn** button shows the next lesson.
**Back to map** closes the sheet temporarily while the prompt remains available.
Only **Ignore tutorial** opts out while retaining Simple. The menu then offers
**Resume tutorial**. Switching Experience, changing artwork, ending a turn,
finishing the seven lessons or resuming a campaign does not silently opt out.

Progress is per campaign and side. The explicit opt-out and introductory welcome
are browser preferences, separate from Experience and saved game rules.
`empires-learning-v1` remembers at most 30 campaigns. Storage failures retain
preferences for the current page session. This preference is not account-synced;
another browser starts with guidance. Existing games can use the guide immediately.

## The first loop

1. **Understand the goal.** Lead cities and units. Develop your score over 40
   rounds, or capture the opposing capital. War is optional.
2. **Read land.** Food grows population, production builds projects, gold pays
   upkeep or rushes production. Cities and discoveries produce knowledge.
3. **Explore.** Select a Scout, inspect its AP and take a legal neighboring step.
4. **Give a city a job.** Review the actual current project or choose one.
   The initial Granary is already queued; reviewing it sends no redundant order.
5. **Improve land.** Find Builders and inspect their real available orders.
   A farm or mine increases yield; a road helps movement. Each costs 2 AP and
   one charge, with terrain, city-range and territory restrictions.
6. **Choose research.** Review the selected technology or choose another.
   Selecting it spends no unit AP; its progress happens at turn end.
7. **End turn and read the result.** The guide reports actual stored knowledge,
   discoveries and population changes, then points back to city progress.

Lessons link to current units, cities and orders rather than a separate demo.
Missing units, spent AP or waiting for another player do not trap the player:
**I've read this · next lesson** permits review without claiming an order was
performed. The progress label says **reviewed or practiced**. Actual practice
advances only after a confirmed response or a confirming recovery read. Failed
and pending requests never count as completed practice.

After the first lessons, Simple keeps a next-decision prompt for research,
idle cities, shaken units, useful Builder orders or ending a turn. The player
can restart the lessons. This is contextual guidance, not an optimal AI plan;
settlement strategy, trade and warfare need later teaching iterations.

## A map that explains itself

**Inspect hex** is an explicit no-order mode. Tapping terrain, units or cities
opens an explanation without moving anything or spending AP. A player may
then choose a separately labelled **Move … here · N AP** button. Selecting a
unit normally exits inspection and retains the existing tap-to-move behavior.

The inspector explains:

- Potential food, production and gold, with numbers and words, using the
  player's discoveries. Standing a unit on land does not collect these yields.
- Whether a currently visible hex is worked by one of the player's cities,
  within city range but not worked, or outside working range. Each citizen
  automatically works one tile within two hexes; only its nearest city can
  claim it. The city center provides separate base income.
- Grain, iron, ruins, farms, mines and roads. Recurring yield, a one-time
  exploration reward and a movement benefit are distinct concepts.
- Terrain movement costs, cover and sight obstruction; current selected-unit
  restrictions and legal actions. The server's legal moves remain authoritative.
- Actual city totals, including food surplus after population consumption,
  with a route to production Orders. Rival economic choices remain private.

Simple defaults to a **yields** map lens. It adds small resource symbols and
numbers plus a citizen marker on visible worked tiles. **Map: land / yields**
is a separate saved presentation choice; it never submits an order or resets
the camera. Basic/Detailed artwork, Experience and map zoom remain independent.
Zoom changes size; the inspector supplies the meaning at a readable size.

The API computes `land_yields` with the same helper used for city output, from
remembered terrain and the requesting player's technologies only. Unknown
hexes expose no yields. Remembered hexes are labelled as last-seen information;
they do not claim current occupancy or citizen activity. No new private rival
data is exposed and no yield or balance rule is changed.

## Verification and next playtest

`tests/empires-learning-dom.cjs` runs the real first-turn sequence through Flask
requests, including default welcome, safe inspection, failed/pending orders,
review of already selected production/research, actual farm and turn results,
fog labels, preference isolation, phone control placement, explicit opt-out,
reload, resume and separate campaign progress. `tests/test_empires.py` verifies
that map help agrees with city output and hidden world changes cannot leak into
remembered yields. Existing game, Experience, research and artwork checks
remain part of the regression gate.

These are DOM/API checks, not rendered Safari tests. The next actual iPhone
playtest should ask a new player to explain one hex, move one Scout, improve
one worked tile and predict what End turn will do. Observe where the player
gets stuck instead of treating lesson clicks as proof of understanding.
