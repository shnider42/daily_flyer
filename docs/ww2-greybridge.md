# Operation Greybridge

Greybridge is a fictional 1944 linked operation in Current DSL. Start it from
the **Operation Greybridge** card on Home. One Allied commander plays three
missions against the German computer opponent. Mission accomplishments change
the next battle, and the crossing result chooses the final mission.

The first version deliberately uses compact infantry maps. Map dimensions and
unit counts are smaller; the existing rendered hex size, unit artwork, map
controls and combat rules remain in use.

## Missions

| Stage | Map | Forces | Deadline | Objective |
| --- | --- | --- | --- | --- |
| 1. Night Raid | 10 × 12, 120 hexes | 6 Allies / 6 Germans | End of round 10 | Extract 2 infantry teams; optionally disable the relay |
| 2. Dawn Crossing | 12 × 14, 168 hexes | 8 Allies / 6 Germans plus 2 reserves | End of round 12 | Occupy the north-bank depot with infantry at 2 consecutive Allied turn endings |
| 3A. Hold the Bridgehead | Same 12 × 14 valley | 8 Allies / 8 Germans | End of round 8 | Occupy the depot at 4 consecutive Allied turn endings |
| 3B. Fighting Withdrawal | Same 12 × 14 valley | 8 Allies / 8 Germans | End of round 10 | Extract 4 infantry teams at the south edge |

The raid begins with platoon command, two rifle sections, a scout, engineers
and an MG team. Later missions add a rifle section and mortar team. The same
named Allied formation receives a viable replenished force at each mission
start. Losses are recorded but do not permanently reduce the next roster.

The valley has two bridges, connected roads and cover on both banks. The
bridgehead defense begins at the captured crossing; the withdrawal starts
south of the river. Both reuse the crossing's terrain so a player can apply
what they learned about the ground.

### Raid actions and consequences

An unpinned Allied infantry unit on or adjacent to the relay can choose
**Disable relay · 2 AP**. The action can succeed only once. In the next mission,
the two German reserves enter in round **6** if the relay was disabled, or
round **4** if it remained operational. A blocked reserve entry waits for room.
Disabling the relay remains an accomplishment even if the raid is later lost
or conceded.

An unpinned infantry unit on a marked exit can choose **Extract unit · 1 AP**.
It leaves the battlefield and is counted as extracted, not destroyed. The raid
has two southeast exits; the withdrawal has two south-edge exits. Only
extracting the required number completes these missions. Eliminating all
enemies does not bypass the extraction objective.

Night sight in the raid is limited to three hexes, or four for scouts. Existing
terrain obstruction and fog rules still apply. The relay and exit locations
are public mission information; enemy positions are not revealed by them.

### Branch and final outcome

The raid always leads to Dawn Crossing. Winning Dawn Crossing leads to Hold
the Bridgehead; losing or conceding it leads to Fighting Withdrawal. Losing
required depot control resets consecutive hold progress.

Winning the bridgehead defense completes the operation successfully. A
successful withdrawal is a tactical success with the strategic bridge
objective unfulfilled. The result screen states both facts. A lost defense or
failed withdrawal also ends with the bridge objective unfulfilled.

## Progress, review and recovery

Each result explains **what happened**, **what changes**, and **your next task**.
**Continue operation** commits that result and opens the next mission.
**Retry this mission** starts again from the saved mission start, retaining
earlier mission consequences. Retrying a raid does not retain sabotage earned
only in the discarded attempt. The final mission can also be retried.

The operation record keeps each accepted prior result and a read-only final
board, viewed through the Allied fog of war. Dated contacts remain identified
as contacts. It also keeps an Allied force record: unit counters lost, units
remaining on the field, and units extracted. These are team/counter counts,
not estimates of individual soldiers. Enemy private statistics are excluded.

Ordinary save and recovery tools carry the whole operation:

- **SAVE** creates a checkpoint. Restoring it makes an independent operation
  with its own future, including the saved battlefield, accepted earlier
  results, inherited consequences and mission starts.
- **MOVE** provides access to the same live operation. It does not fork or
  duplicate the operation's outcomes.
- Signed-in commanders can resume their operations from Home on another
  browser. Restoring a SAVE while signed in links the new operation to that
  commander. An authenticated identity remains usable during the session even
  when local browser storage is blocked.
- Guests can use browser shortcuts and SAVE/MOVE codes. A shortcut to an old
  mission follows its accepted continuation without repeating the transition.

Sabotage, extraction and completed mission results commit the takeback
journal. A prior mission becomes read-only after Continue or Retry. Repeated
identical transition requests return the same successor; a conflicting choice
cannot create a second successor from that mission.

## Implementation boundaries

`ww2_tactics/greybridge.py` owns the opt-in scenarios, progress, actions,
deadlines and German geographic goals. `linked_operations.py` owns the saved
operation context, mission starts, accepted history and progression. The web
layer authorizes requests and commits both sides of a transition atomically.

Future mission starts, including both reserve schedules, are generated once
when an operation is created. Continuing and retrying use those saved starts;
they do not rebuild the next mission from a subsequently edited catalog.
Private future maps and rosters are removed from public state and playback.
The saved context is bounded to four mission variants and at most two prior
accepted reviews. It is excluded from per-order takeback copies.

The four Greybridge variants are operation-only and do not become standalone
catalog entries. Existing battles retain their saved rules and geography.
The initial release uses solo Allied command and replenished rosters; it has
no experience tree, persistent equipment economy or additional campaign mode.

## Validation

The focused engine and API tests cover mission legality, deadlines, reserve
timing, both branches, immutable reviews, own loss accounting, repeat and
conflicting transitions, authority, SAVE/MOVE, commander recovery, undo,
background computer work and private-state filtering. Run them with:

```sh
python -m unittest discover -s tests -p 'test_ww2_greybridge.py'
python -m unittest discover -s tests -p 'test_ww2_linked_operations.py'
```

The broader regression command is:

```sh
python -m unittest discover -s tests -p 'test_ww2*.py'
```

`tests/ww2-greybridge-browser.cjs` runs real Chromium against a disposable local
Flask server at desktop, 390-pixel and 320-pixel widths. It uses actual move,
sabotage, extraction, Continue, Retry, SAVE, sign-in and resume controls. It
checks both endings, guest checkpoint forks, signed-in checkpoint recovery
from a fresh browser, blocked-storage identity, asset loading and horizontal
overflow. Local database fixtures position units near objectives for transition
coverage; those fixtures do not establish difficulty or win rates.

```sh
node tests/ww2-greybridge-browser.cjs
```

The browser runner requires Playwright and a Python environment containing the
app dependencies. `DSL_TEST_PYTHON` and `CHROMIUM_EXECUTABLE_PATH` can select
installed executables. It creates a temporary database and screenshot folder,
and never uses the production database.

A separate legal scripted raid against the actual German AI disabled the relay
in round 3 and extracted two teams in round 6, using a fixed die result of 3
for reproducible movement and tempo validation. The crossing and withdrawal
routes also fit within their movement budgets. This establishes feasible
routes, not human balance. The first playtest should focus on pressure during
the four-turn bridgehead hold and whether delaying the reserve feels valuable.
