# Village Crossing — expanded rules

## Solo play

Choose **Play against the computer** on the landing page, or **Play computer** in an
existing match. Choose a battlefield and start as the Americans. Starting solo from an
existing match explicitly replaces its progress and invitation; both old player keys are
revoked. The setup dialog warns before you start. There is still one match per instance.

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

Original simplified WWII tactics for two mobile browsers. One shared match per service.
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
stored in SQLite. No login/recovery service yet. Clearing browser site data loses that player's key.
For a host-key loss, the service operator must deliberately archive the SQLite file and restart to
clear the occupied slot (all match progress will be lost). Do not expose this small private-playtest
service as a public lobby: there is no signup, abuse throttling or spectator mode in v1.

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

- 66 rules/API tests pass, including concurrent seat claims, duplicate move rejection,
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
- `tests/ww2-solo-browser.cjs` uses a disposable server/database to verify solo creation,
  automatic turns, order review, reload, army swaps, return to multiplayer, switching an
  existing match to solo, and phone layout widths.
- `tests/ww2-role-browser.cjs` seeds its own disposable SQLite database and exercises the
  role abilities through two mobile browsers, including visible danger zones on both screens,
  delayed impact, leader rally, reload persistence, and mobile page overflow checks.
- JavaScript syntax check passes; Gunicorn boots successfully.
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
