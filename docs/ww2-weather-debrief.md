# Forecast weather and after-battle debrief

## Weather rollout

Weather applies to newly created **Midway 2.0** and **Battle of Britain 2.0**
matches. Other maps and existing saves retain their existing weather rules.
Rematches on either supported map receive a new schedule.

Both armies receive the same current conditions and a **confirmed two-round
forecast**. Conditions change at full-round boundaries. The first two rounds
are clear. Subsequent blocks are drawn independently of combat dice with
clear/haze/rain weights 4/3/3 and a duration of one or two rounds. After rain,
the next block is clear. Adjacent clear or haze blocks can merge into longer
spells. Rain never lasts more than two consecutive rounds.

The private schedule is saved once. Reconnects, save restoration and takebacks
cannot reroll it. Public responses and replay frames reveal only the current
round and next two rounds. The computer uses only that announced window when
budgeting the return trip; it receives no extra forecast advantage.

| Condition | Effects |
|---|---|
| Clear | Normal rules |
| Haze | Visual spotting −2 hexes, minimum 1; radar range unchanged |
| Rain | Haze spotting, flight legs −1 hex (minimum 1), bomber hit threshold +1, one launch per carrier/field per own turn |

Weather itself never damages aircraft. Landing, servicing, deck/runway cycle
costs and fuel costs retain their normal rules. Shorter flight legs can still
require more fuel to cover the same route. Launch limits are per base, including
co-op; a different base keeps its own allocation. Forecasts remain visible during
computer replay with the conditions at the time of each recorded frame.

Command center shows the forecast above the map. Phone and desktop Map-first
show the current weather on the Battle button, with the full forecast and rules
near the top of Battle & reports. Launch panels show the rain allocation and
explain disabled launches. Field coach includes weather at all three Experience
levels. Light and dark appearance use the existing theme.

## Debrief

Every new battle records factual, army-specific accounting. At battle end,
**After-battle debrief** is available from the result dialog and battle report.
It includes surviving force, combat/fuel/aboard losses, aircraft operations,
strength restored, tracked consumables spent, successful attack rolls, public
objective checkpoints, weather changes and loss/score highlights.

Each viewer gets their own army's statistics and public objective counters.
Enemy hidden resources and private highlights remain private, even at battle
end. Counts are unit counters, not inferred individual aircraft or soldiers.
Evacuated troops are reported as rescued, never destroyed. Mortar and other
delayed impacts count as combat, including friendly fire. Attack rolls meeting
the threshold do not imply a destruction. Preparation is excluded from active
battle accounting; its final force becomes the baseline.

Undo restores the ledger; redo restores the resolved result without counting
twice. Highlights are capped at 40 per army and objective checkpoints at 100.
The retained latest computer turn can be replayed from the debrief where
available; this is not a full-battle replay.

Ongoing old saves start a labeled partial record with their next order.
Finished old saves have no reconstructed event history; the report says so
and shows only their final surviving force.

## Related corrections

- Destroying a Britain 2.0 airfield now correctly destroys grounded flights.
  The generic transport bailout had incorrectly freed them before the map's
  existing grounded-loss rule could run. Airborne flights remain eligible to divert.
- Britain 2.0 replay objective text now uses the existing nine-point raid goal.

## Validation

Focused engine/API checks cover shared forecasts, hidden future privacy, legacy
saves, flight legality, radar, bombing odds, launch/recovery cycles, co-op,
undo/redo, loss causes, evacuation, preparation, delayed impacts, replay snapshots,
AI forecast access, stale revision rejection and reload persistence.
The final focused run passed 56 checks: 18 new weather/debrief cases, 36 existing
Britain/Midway cases and the two compatibility cases described below.

The 574-test existing regression suite was exercised; its two failures were
corrected and rerun: pre-snapshot legacy boards use their existing fallback,
and the unchanged gameplay fingerprint fixture now ignores the new private
accounting metadata. No gameplay fingerprint fixture was regenerated.

DOM tests use the actual Flask API and disposable SQLite at 1440 and 390 widths,
both layouts, light/dark appearance and all Experience levels. They check forecast
placement, rain launch limits, result/debrief/reload flows and older records.
These are integration checks, not browser screenshot or real-device visual QA.

These are initial weather balance values. Human playtesting is still needed to
assess bomber tempo, radar advantage and runway pressure across both armies.
