# Village Crossing — expanded rules

## DSL v1 and ruleset selection

New-battle screens default to **DSL v1 — Double Secret Probation Squad Leader**.
**Classic** keeps the existing simplified rules. **ASL-inspired** is a reserved, visibly
unavailable future track, not a claim that Classic implements ASL. The server rejects
unavailable/unknown profiles. Rules identities (`ruleset`, `ruleset_version`) are distinct
from the older feature/schema `rules_version`. Missing identities always mean Classic;
loading a pre-DSL match or save never upgrades its mechanics.

- **Base AP:** rifles and MG teams get 2; LTs get 3.
- **Banking:** at the end of your army's turn, living units bank unused AP up to 1, or 2
  for an LT. On that army's next turn, AP resets to base plus that reserve. Reserves do not
  accumulate beyond these limits, and the second army gets no free bank on its first turn.
  Pinning does not erase a reserve; rally still costs 1 AP.
- **Received AP limit:** rifles/MGs may receive at most 3 total AP over their entire turn;
  LTs at most 5. `ap_received` counts base, carried and granted actions. Spending actions
  never resets it. UI meters show remaining AP, carried AP, and the received limit.
- **On your feet:** an unpinned LT spends 2 AP to grant 1 to every eligible adjacent
  unpinned rifle/MG in his own platoon. Units already at the received limit, other LTs,
  and other platoons are ineligible. One order per platoon per turn, shared by any leaders
  in that platoon. Small scenarios count as one platoon. The order previews recipients.
  Classic's original single-recipient Riverfront order remains unchanged.
- **Road bonus:** a paid road-to-road move earns one immediate extra adjacent road/bridge
  step for 0 AP, once per unit per turn. Both tiles must be unoccupied. Select each hex
  separately; overwatch resolves at both. A pin prevents continuation. A different action
  by that unit, leaving the road, or ending its turn discards the pending step. This is
  one extra hex, not doubled road speed. Free steps remain usable at 0 AP. Gold dashed
  hexes mark the bonus; an overwatch threat retains the orange warning.

Choose DSL using **Plan next battle** to switch from a current Classic game. Multiplayer
proposals explicitly show the proposed ruleset and require the other commander to accept.
Solo rematches can switch immediately. Save codes preserve exact profiles, banked/received
AP and pending road bonuses. Old API clients that omit a ruleset still create Classic games;
rematch requests that omit it retain the current profile. Render settings do not change.

The computer uses the same legal options and caps, issues group orders, can bank instead
of spending on low-value actions, and has a bounded action budget that includes reserves,
command grants and free road steps. This is an initial playtest balance, not a difficulty
upgrade or a claim that either side is competitively balanced.

## Recorded battlefield effects

Grenades and arriving mortars record explosion locations; smoke deployment records a smoke
bloom. Effects are presentation-only SVG animations with no extra dice or game actions.
The persistent smoke marker remains after the deployment effect ends. Live effects are
shown once for new events; reconnecting does not replay old explosions. Computer frames
carry their effects so pause/step/replay use recorded locations and outcomes. Reduced-motion
users receive static short-lived markers. These visuals also work with Classic games.

`tests/test_ww2_dsl.py` checks AP banking/caps, first turns, road interruption and reuse,
leadership eligibility, legacy compatibility, effects, save/restore and rematch consent.
`tests/ww2-dsl-browser.cjs` covers DSL setup, AP previews/orders, roads, AI playback, restoring
on desktop, Classic rematches, actual effects and reduced-motion read-only replay.

The next DSL stages remain: army asymmetry and a commander, then stationary guns, tanks
with infantry anti-tank counters, paratroopers and amphibious transport. No such units or
bonuses are included in DSL v1. Traditional ASL-style phases and morale need a separate
implementation and are likewise not enabled by selecting DSL.

## Desktop command table

At viewport widths of 1100px and above the interface uses a desktop layout:

- Left: platoon filters and unit roster, with role, strength, and coordinates.
- Center: mission, an expanding battlefield viewport, camera controls, and terrain key.
- Right: the existing orders, dice/results, battle log, and computer playback controls.
  Next unit and End turn stay in a fixed action dock beneath the scrolling orders panel.
- Desktop map: drag to pan, use + / − or Fit map to zoom, and Find selected to recenter.
  Focus the map viewport for keyboard + / − / 0 and arrow-key navigation. Dragging does
  not issue orders. Selecting counters and legal hexes uses the original action handlers.
- The landing page separates briefing, battlefield selection, and saved/invited battles.

`desktop.css` applies only above the breakpoint. `desktop.js` relocates the existing DOM
controls and restores their original positions below it, including on window resize.
There are no duplicate orders or changes to game rules, odds, saved state, or turn flow.
Mobile retains its original stylesheet and controls. The desktop browser check compares
320px, 390px, and 768px screenshots byte-for-byte against commit `c77ca989` and exercises
laptop/desktop layouts, zoom and pan without POSTs, orders, playback, saves, and breakpoint
roundtrips. Run `node tests/ww2-desktop-browser.cjs` with the existing Playwright setup.

## Independent battles, device transfer, and save codes

Each new solo or two-player battle now has its own database record. Anyone can start a
computer game while other matches are running. **Battles / load code** opens the lobby,
where this browser remembers its battles using localStorage. Starting another solo game
keeps the previous match and invitation intact. No cookies or account are required;
if browser storage is blocked, play still works in memory for that tab.

- **Continue on another device** creates a private `MOVE-…` code. Open this same site
  on the other device and paste it into **Load code**. The code works once within 15 minutes.
  Both devices then control the same live seat; normal revision checks prevent duplicate
  orders. Transfers follow that player through army swaps, and reset revokes old access.
  Either human seat can transfer; this also works in solo mode.
- **Generate save code** captures the current solo battle in an immutable checkpoint.
  Copy the private `SAVE-…` code into Notes before closing a private browser. Paste it into
  **Load code** on any device to create a separate solo match at that exact moment.
  The original game and saved checkpoint remain unchanged. A save can be loaded repeatedly,
  does not expire, and keeps the player's army, rules version, board, resources, pending
  smoke/mortars, log, action/combat history, victories, and latest computer-turn playback.
  Restore never runs AI or rerolls dice. Generate a new code to capture later progress.
- Codes are unguessable random references to data on **this server's persistent disk**,
  not self-contained compressed boards. They require the same site and its retained database.
  Anyone holding a code has access to that seat/checkpoint; only code hashes are stored.
  Keep the existing `WW2_DB_PATH` and persistent disk. No new Render configuration is needed.
- Startup atomically migrates the old singleton table while retaining the existing match,
  invitation, and player keys. Logs and combat history are no longer trimmed to 40 entries;
  structured human/computer move history is retained from this update forward. Previously
  discarded history cannot be reconstructed. Rematches still begin a new battle history.

`tests/test_ww2_portability.py` covers isolation, exact restore, migration, concurrency,
seat transfer, expiry/reuse, credential boundaries, army swaps, and server restarts.
`tests/ww2-portability-browser.cjs` checks phone-to-PC transfer, independent sessions,
storage-disabled play/save/restore, immutable checkpoints, local reconnection, and layouts.

## Riverfront Offensive

An optional one-off 18×18 battlefield: 324 hexes, exactly four times Orchard Road's
81 hexes (the previous largest map). Select it when creating a match or planning
the next battle. Existing matches and the original three scenarios keep their forces.

Each army has three platoons—Alpha, Bravo and Charlie—with three rifle squads,
one leader and one MG each: 15 individually controlled units per army. Each unit
still receives two AP. Mortar support remains one shared call per army.
Three river bridges create west, center and east approaches; lateral roads allow
forces to shift between crossings, with woods and farm buildings providing cover.
Americans must hold the north-bank rail junction through two American turn endings;
Germans must prevent that through round 24. Balance is provisional pending playtests.

Large maps open in a scrollable detail view. Drag/pan the map, use platoon filters
to jump between formations, or choose Overview to inspect the whole battlefield.
Counters and combat results carry platoon/unit IDs. Next unit cycles within the
selected platoon; All shows the entire army. Find selected returns to your unit.
Computer playback follows the acting unit and returns to the previous map position.
The computer's action guard scales to the larger army's AP budget.

Platoon counters use three subtle shades of their army's blue/rust, repeated in
roster and platoon-filter accents and playback. A/B/C labels remain visible.
Riverfront LTs rally only adjacent pinned members of their own platoon. They can
also use **On your feet**: spend 2 actions to restore 1 action to an adjacent,
unpinned rifle squad or MG in their platoon, capped at 2. Select the LT and choose
the named recipient. Each platoon gets one use per army turn; that limit persists
across reconnects and resets when the army's next turn starts. Leaders cannot
receive the order. Mortars and the normal shooting bonus retain their existing rules.
The computer can issue the order and playback displays the actual AP changes.
Refresh after deployment to use this in an existing Riverfront match; no reset is
needed. The original smaller scenarios retain their existing leader abilities.

## Computer turn playback

New computer turns record a bounded sequence of before/after board snapshots and actual
combat results. Playback starts automatically after the turn resolves. The acting unit,
movement/target line, dice and resulting unit changes are shown on the board. Pause,
advance one step, or skip directly to the live board. **Replay computer turn** watches
the most recent recording again, including after reconnecting.

This is presentation only: the complete turn still commits atomically on the server.
Playback sends no game actions and never rerolls dice. Live orders are blocked while
watching. Completion/skip restores the authoritative board; reloading during playback
returns directly to it. The last recording persists with the match in SQLite and is
replaced on the next computer turn. Old matches need no migration or new battle: refresh
and finish a turn to create the first recording. Older turns cannot be reconstructed.

## Visible dice and mechanics

Presentation update only: no rule, odds, computer decision, action cost or turn-flow changes.
Refresh to use it in an existing match; no rematch is required.

- Attack previews show all six die faces, highlight successful rolls, and show the hit
  percentage and actual modifiers. Optional comparisons show grenade and assault odds.
- Combat results show the actual server roll, required threshold, hit/miss and effect.
  Suppression and mortars explicitly say they are automatic and do not roll dice.
- An expandable history retains combat results, including every separate
  overwatch reaction and computer attack. Names, coordinates and modifiers are recorded
  at resolution time, so later movement does not change the explanation. Old saves work;
  detailed history begins with new combat after this update. Existing text logs remain.
- Selected units show strength/action meters. Optional terrain/status explanations cover
  cover, movement cost, range, pins, digging in, smoke and overwatch without a tutorial.

## Solo play

Choose **Play against the computer** on the landing page, or **Play computer** in an
existing match. Choose a battlefield and start as the Americans. Starting solo from an
existing match creates a separate battle; the previous match remains available in this
browser’s battle list. Multiple independent matches can run on the same instance.

The computer automatically completes its turn when you end yours. Open **Computer's last
turn** to review its orders; combat details remain in the battle log. Refreshing reconnects
without repeating its turn. **Plan next battle** starts immediately in solo mode and lets
you swap armies; the computer takes the opening American turn when you choose the Germans.
**New invitation** returns to two-player mode. Computer seats cannot be claimed by joining.

This is a local heuristic practice opponent, not a hosted language model. It uses legal
engine actions, normal server dice and the same open information as the human. It routes
around rivers toward the objective, holds it, prioritizes attacks/rallies, and considers
suppression, overwatch, grenades, smoke and mortar support. It is an early tactical opponent,
not a claim of expert play. No difficulty selector, external API, keys or new dependencies.
Turns are bounded and committed with the player's action in the existing SQLite transaction;
revision checks reject duplicate requests. Render configuration stays the same.

## Role abilities and mortar support

New battles now use rules version 4. Start a connected rematch to activate the new rules;
existing saved battles retain their previous mechanics. The saturated team colors and
US/DE counter labels remain. No Render settings, packages or database migration change.

- **Rifle squads — frag grenade:** 2 actions, one per squad, separate from smoke. Visible
  enemy within 2 hexes; hits on 4+, or 5+ in woods/buildings/objective. Deals 2 strength and
  pins, with no advance or failure damage. Digging in and leader bonuses do not change
  grenade odds. Misses consume the grenade. Smoke blocks targeting.
- **MG — suppress:** 2 actions; guaranteed pin on an unpinned visible enemy within 4 hexes.
  Cancels overwatch but deals no damage. Cover does not prevent suppression; sight blockers do.
- **Leader — rally nearby:** 1 action removes pins from every adjacent friendly unit,
  preserving their actions. The leader must be unpinned. Normal shooting support remains.
- **Leader — call mortars:** 2 actions, once per army. Choose a visible hex within 6 hexes.
  Both screens mark it and neighboring hexes. The opponent gets one turn to escape; impact
  occurs at the end of that turn. All units remaining in the marked area are pinned and
  lose overwatch and dug-in cover, including friendly units. No strength damage. The strike
  still lands if the leader is eliminated. Pinned units can continue holding the objective.
- Contextual role descriptions, ability buttons, mortar availability, incoming alerts,
  marked blast zones, and end-turn warnings for troops caught in an imminent barrage.

Role choices are returned by the same pure legal-action engine used to validate human
and computer orders.

## Battlefields and overwatch expansion

This expansion introduced rules version 3. Existing saved battles retain their rules and map until
both players accept a next-battle proposal, or the American player creates a new invitation.
No database migration or Render configuration change is needed.

- Choose Village Crossing (7×9, 8 rounds), Orchard Road (9×9, 10 rounds), or Stonebridge
  (7×11, 12 rounds). Each has a preview and briefing. Stonebridge water is impassable;
  cross at the two bridges. Americans must hold the marked objective for two turns.
- **Overwatch:** spend 2 actions to prepare one reaction shot at a visible enemy moving
  into range. Adds +1 to the normal required roll. Smoke blocks it; pinning cancels it.
  Unused overwatch expires at the start of your next turn. Orange movement highlights
  warn about enemy overwatch, with confirmation before entering a threatened hex.
- **Plan next battle:** propose a battlefield and optional army swap. Your opponent must
  accept. Both browsers keep their existing player keys and invitation. Accepting during
  a battle abandons it without a win. Decline/cancel preserves the current battle.
- Battle reports, battle numbering, and session victories by army carry across rematches.
  Scores follow the Americans/Germans, not individual players when armies are swapped.
- **New invitation** replaces the shared match and player keys; use this to invite a new
  opponent. Connected rematches are the normal way to keep playing together.

## Earlier smoke and assault expansion

Rules version 2 introduced these actions, also available in version 3:

- **Smoke:** each rifle squad has one grenade per match. Costs 1 action; place in your own or
  an adjacent hex. Blocks shooting into, out of, and through that hex until the end of the
  opponent's turn. Movement and assaults still work through smoke.
- **Dig in:** costs 2 actions, adds +1 to incoming fire's required roll. Stacks with terrain
  cover and lasts until the unit moves or assaults. Does not protect against assaults.
- **Close assault:** an unpinned squad/leader with 2 actions can attack an adjacent enemy.
  Hits on 4+, or 3+ if the defender is pinned. Success removes 2 strength and pins; elimination
  advances the attacker into the defender's hex. Failure removes 1 attacker strength and pins
  the attacker. MG teams cannot initiate assaults. Terrain/digging-in do not modify assaults.
- Mobile roster with action status, next-unit cycling, scrollable enlarged map, firing line,
  modifier breakdown, combat-result panel, army counts, and contextual objective reminders.
- Scenario balance still needs playtesting.

The same build/start commands below apply. Refresh both phones after deployment. A persistent
disk is still required to retain the database through deployments.

Original simplified WWII tactics for two mobile browsers. Independent solo and shared matches on one service.
Built from `staging` commit `2a053196d33f6b50299b8c342cc2316960314e21` on
`feat/ww2-tactics`. No existing Daily Flyer routes or themes were modified.
This is not an official Squad Leader/ASL implementation; the scenario, art and rules are original.

## New Render service (do not repoint existing services)

- Repository: `shnider42/daily_flyer`
- Branch: `feat/ww2-tactics`
- Runtime: Python; Python 3.11+.
- Root directory: leave blank.
- Build: `pip install -r requirements-ww2.txt`
- Start: `gunicorn ww2_web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`
- Health check: `/healthz`
- Environment: `WW2_DB_PATH=/var/data/ww2.sqlite3`
- Attach a persistent disk mounted at `/var/data` if matches must survive deployments/restarts.
- No API keys, external feeds, Redis, or additional database service.
- Do not set the database path to `/var/data` unless that mount exists and is writable.

Without a persistent disk, omit `WW2_DB_PATH`; the app uses `instance/ww2.sqlite3`.
This is fine for disposable playtests, but filesystem replacement/redeploy may lose the match.
Single-instance SQLite only: do not scale to multiple service instances with independent filesystems.
Render-account deployment has to be performed separately; creating this branch does not deploy it.

## Play

1. First player chooses a battlefield and **Command the Americans**.
2. Share the invitation with the second phone. That player taps **Join** to command the Germans.
3. Tap a friendly counter. Green hexes are legal moves. Tap an enemy to preview odds, then **Fire**.
4. **End turn** hands control to the other player. Both screens refresh automatically.
5. Refresh/reopen the same browser to reconnect. Player keys are saved in localStorage.
6. Either player can **Plan next battle**; both must agree. Only the current American player
   can create a **New invitation**, which replaces the match and invalidates old player keys.

The invitation lets someone claim the unoccupied German seat; share it privately.
The per-player bearer keys are never in invitation URLs or state responses; only their hashes are
stored in SQLite. Clearing browser site data loses locally remembered seats. Before leaving a
private browser, save a solo checkpoint or transfer the live seat to another device. Without
a retained seat or save code, there is no account-based recovery; a new independent match
can still be started. The service has no signup, public match directory, or spectator mode.

## Rules

Offset hex maps; Americans advance from the bottom, Germans from the top.
Each side has three rifle squads, one leader and one MG. Both sides see all units.
Units get two actions at the start of their side's turn; unused actions do not carry over.

- Move one adjacent hex: 1 action; entering a building or woods: 2 actions. One unit per hex.
- Fire: 2 actions. Range: squad 4, leader 3, MG 6. Intervening woods/buildings block LOS;
  the destination terrain does not. The square provides cover without blocking sight.
- A d6 hits on 4+. Add 1 for target cover (woods/building/square); add 1 beyond range 3.
  Subtract 1 for an adjacent friendly leader (including a firing leader itself); subtract 1 for MG.
  Minimum threshold 2+. Dice are rolled server-side. In expanded games, digging in adds 1;
  any threshold above 6 is impossible (the UI disables that shot).
- A hit removes one strength and pins the target. Zero strength removes it from the board.
- Pinned units cannot move/fire. Rally costs 1 action, always succeeds, removes the pin.
- Americans win by occupying the marked objective at the end of two consecutive American turns.
  Moving off or losing the occupying unit interrupts the hold. Pinned units can hold.
- Germans win at the scenario's round limit if the Americans have not won.
- Eliminating all enemies wins immediately. Expanded games include close assaults as described
  above; no tanks or fog of war yet.

The armies are mechanically symmetric for the first playtest. Historical asymmetry and scenario
balance are future iterations, not claims made by this prototype.

## Architecture and verification

`ww2_web.py` is a separate Flask entry point using the existing Python/Gunicorn stack;
`web.py` still serves Daily Flyer unchanged. `ww2_tactics/engine.py` holds pure rules.
SVG/CSS/JS are served locally (no CDNs or build pipeline). Polling is every 1.8 seconds while visible.
SQLite `BEGIN IMMEDIATE` serializes writes. Revision checks reject stale/repeated actions.
The client renders legal options returned by the server; the server validates every action again.

```sh
pip install -r requirements-ww2.txt
python -m unittest discover -s tests -p 'test_ww2*.py' -v
gunicorn ww2_web:app --bind 127.0.0.1:8000 --workers 1 --threads 4
```

Use two separate browsers or browser profiles for local testing (two tabs in the same browser
share a player key and are not two independent players).

### Verification

- 82 rules/API tests pass, including concurrent seat claims, duplicate move rejection,
  persistence, reset, original-rules compatibility, smoke expiration/LOS, digging-in protection,
  assault successes/failures, combat and victory conditions, all battlefield objectives and
  round limits, river traversal, overwatch/expiry/cancellation, rematch consent, army swaps,
  stale proposals, reconnection and score carryover.
- Role tests cover grenade cover/damage/resources, suppression, adjacent leader rally,
  sight/range/pin/action restrictions, barrage delay/escape/friendly effects, caller death,
  one-call limits, legacy rules and immutable inputs.
- Solo tests cover complete games on every battlefield, both armies, objective occupation,
  river routing, bounded turns, group rally, automatic turns, locked computer seats,
  stale actions, reconnection, army swaps, and replacement/revocation between game modes.
- Combat-display tests verify actual dice/modifier snapshots, separate reaction rolls,
  retained history, immutable inputs, and automatic no-roll effects. Role browser checks
  also verify die previews, actual result faces, and expandable previous results.
- Playback tests verify frame continuity, exact final boards, single actual dice rolls,
  bounded non-nested snapshots and replacement on the next turn. Solo browser tests verify
  automatic playback, pause/step/skip/replay and blocked live orders. The dedicated
  `tests/ww2-playback-browser.cjs` checks actual die/health/pin rendering, automatic
  completion, reload during playback, zero POSTs and unchanged server state.
- `tests/ww2-solo-browser.cjs` uses a disposable server/database to verify solo creation,
  automatic turns, order review, reload, army swaps, return to multiplayer, switching an
  existing match to solo, and phone layout widths.
- `tests/ww2-role-browser.cjs` seeds its own disposable SQLite database and exercises the
  role abilities through two mobile browsers, including visible danger zones on both screens,
  delayed impact, leader rally, reload persistence, and mobile page overflow checks.
- JavaScript syntax check passes; Gunicorn boots successfully.
- Riverfront tests verify exact area, forces, bridge connectivity, objective access,
  full computer action budget and round limit. `tests/ww2-riverfront-browser.cjs`
  checks 324 hexes/30 counters, platoon navigation, overview/detail, mobile widths,
  playback, reconnect and a rematch back to the original force size.
- Two independent DOM clients exercised real HTTP against Gunicorn: smoke, digging in, turn
  handoff, smoke expiration, roster controls, zoom toggle, next unit, reconnect and invitation
  screen persistence. This verifies interactions, not browser layout or rendering.
- Existing full repository suite has 3 failures, reproduced on the untouched base commit:
  birthday realistic-data rendering, Irish visual-lab style switcher, Nissan Z rendering.
- `tests/ww2-battlefields-browser.cjs` passes in Chromium with two independent mobile browser
  contexts: scenario previews, overwatch and expiry, turn handoff, consenting rematches,
  army swaps, preserved player keys, reload, zoom, battle reports and scores. No page errors
  or horizontal page overflow at widths 320–1280px. Phone screenshots visually inspected.
  Run against a fresh disposable database; requires Playwright (or playwright-core with
  `WW2_PLAYWRIGHT=playwright-core WW2_PACKAGED_CHROMIUM=1` and @sparticuz/chromium).
# DSL learning and compact controls

- Mobile selection preserves the map's screen position and manual pan. The orders header
  has a fixed height; its dropdown floats over the board rather than pushing it down.
  Selecting counters no longer automatically recenters an enlarged map. Use Find selected,
  zoom, or platoon navigation to deliberately move the camera. Rendering keeps the current
  viewport except when starting a new battle; desktop camera behavior is unchanged.

- On phones/tablets below 1100px, DSL unit selection opens a sticky orders dropdown above
  the battlefield. Its header retains unit name, hex, AP and pin status alongside End turn.
  Actions scroll inside a floating panel capped at 20% of screen height, up to 180px.
  Unit details and odds are expandable in full view. Moving/spending actions collapses the
  panel; smoke and mortar targeting also collapse it so the map stays accessible. Tap the
  header or select a unit again to reopen. Playback temporarily hides live orders.
- **Simple view** is a reversible browser preference. It hides odds, dice, modifiers,
  detailed stats and logs, while retaining legal actions, AP, strength/pin markers, round,
  turn, objective, danger warnings and plain-language combat outcomes. Battle options and
  save codes remain available in an expandable section. It never changes the rules or rolls.
- **Start guided practice** creates a separate Village Crossing solo DSL battle in Simple
  view, preserving existing matches. **Learn as you play** opens eight short lessons in
  the current DSL battle without resetting it. Selection and movement lessons advance on
  actual play; other tips have explicit Back/Next/Show me/Exit controls. No scripted orders
  are issued. Players can skip any lesson, even when no enemy is in range.
- Preferences and current lesson are remembered locally when storage is available. Private
  browsing without storage still works for the current page; UI preferences are not part of
  SAVE codes. Existing save/reconnect mechanics and Classic game rules are unchanged.
- `tests/ww2-learning-browser.cjs` covers independent practice, local persistence, blocked
  storage, capped mobile orders, smoke targeting, lesson progression, zero state changes
  from presentation toggles, responsive resizing and replay. The desktop browser test now
  verifies mobile controls/overflow rather than comparing pixels to the old mobile UI.
