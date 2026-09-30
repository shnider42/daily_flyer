# Guest learning and battle briefing

Learning is optional and available only without a current commander login. A Commander unit on the map has no bearing on this check. `lobby.js` exposes the settled guest state and sends `ww2:commander` when identity changes; the home practice button, in-battle entry points and open guide all respond. A stored login remains excluded while it is being checked. An expired login becomes a guest after the server rejects it.

Guided practice creates a separate solo Village Crossing battle. It never replaces another battle. The guide also works inside every DSL scenario, including Midway and Battle of Britain. Simple view, terrain and unit illustration preferences remain independent.

## Lessons

The course covers victory, turns, unit selection, movement, AP and banking, unavailable orders, targeting, dice, terrain, fog, rallying, reactions, infantry tools, officers, support, armor and repairs, observation, transport, fleet roles, aircraft service, undo/redo, ending a turn and returning to a game. Only relevant chapters are included for that map and its saved rules: small-map infantry practice does not require a battleship lesson.

Each lesson has an explanation and a concrete task. Show me closes the guide and highlights the relevant control; it never issues an order. Selection, movement, attacks, rally and ending a turn can record a practiced task using the existing public action history. Reading ahead or skipping a task is allowed. Nothing awards AP, changes dice or alters visibility.

Progress is stored per browser, match code and battle number under `ww2-learning-v2`, for up to 16 battles. Closing the guide preserves progress; Pause guide hides it until reopened. A topic index allows direct review. Storage failures fall back to the current page’s memory. Signing in hides the guide immediately without changing the battle.

## Win and turn signals: everyone

`battle-briefing.js` shows the actual mission family, with a persistent button above the map and a full rules dialog:

| Family | Mission |
| --- | --- |
| Land | Attackers occupy the objective at two consecutive turn endings; losing it resets the hold. Defenders win at the final defending turn. Either army can also win by eliminating the other. |
| Midway | Reach six control points or destroy all enemy carriers. The dialog explains sea-zone/outpost scoring and the round-limit tiebreak. |
| Britain | RAF retain a sector station through the final round or destroy all bombers. Luftwaffe destroy both RAF sector stations. |

Progress uses only already-public values: hold count, control scores, destroyed RAF objectives and round. It never counts concealed enemies or forecasts targets from a future position. Victory remains decided by the server; this UI explains the existing rules.

The turn label distinguishes your turn, the opponent, waiting for a player, resolving an order, replay, mandatory redo and a finished battle. Page titles carry the same status. A polite screen-reader announcement and brief, reduced-motion-aware emphasis signal a newly actionable turn. Ordinary selections and orders do not repeatedly announce a new turn.

On phones the mission strip has reserved space; opening lessons uses a dismissible sheet. The map does not resize when selection or lesson content changes. Desktop learning opens in a dialog so long explanations do not squeeze the map.

## Verification

`tests/ww2-guest-learning-browser.cjs` exercises real guest practice, task recognition, persistence, login/logout, expired accounts, blocked browser storage, both mission perspectives, turn states, and desktop/phone/landscape layouts. `tests/ww2-learning-browser.cjs` retains the existing display, map, order and replay checks with the new explicit lesson navigation. The operations, capabilities and Dad-mode suites cover shared controls and selection responsiveness.

If introducing a new victory system, update `ww2Briefing.mission` alongside its resolver and add both player perspectives to the browser checks. New order families should add relevant lessons without teaching unsupported abilities in older saves.
