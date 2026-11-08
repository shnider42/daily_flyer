# Pocket Hockey + Pocket Soccer

Two DailyFlyer games with a shared, headless JavaScript simulation, mobile input,
roster provider, browser saves and match events. The live browser build is in
`daily_flyer/themes/pocket_sports_assets/`; a Flask backend is available in `daily_flyer/sports.py` and integrates into DailyFlyer
as a blueprint. No build step or paid API is needed for the playable client.

- Hockey: 6 players per side, all 32 NHL clubs, momentum, rebounds, checking,
  goalie saves, three periods and golden-goal overtime.
- Soccer: 11 players per side, the completed 2025/26 Champions League round of 16,
  plus Borussia Dortmund current, 2013 Wembley-final XI and 2015/16 classics.
  Dribbling, passes, tackles, throw-ins, corners, goal kicks, two halves and overtime.
- Both: Quick play, unlimited practice, a four-round arcade cup saved between
  matches, difficulty settings, adjustable match length, goal replays and results.
- Mobile: left movement thumb, right contextual pass/shoot/burst cluster; sizes,
  sensitivity, shot assistance and handedness are adjustable while paused.
- Desktop: WASD/arrows, J pass, hold/release Space shoot, K burst, Q switch;
  actions are remappable. P/Esc pauses.

The NHL lineups use a **2025-10-07 opening-roster snapshot** (including some
injured-list players), not live November 2026 rosters. The original football XIs are
representative selections from official March 2026 R16 match squads. Dortmund has
separate dated records: 2026/27 (7 November 2026), the actual 25 May 2013 final
starting XI, and a representative 2015/16 XI. Classic teams do not change ratings. Sources and
snapshot dates travel with each JSON catalogue and appear in the lineup dialog.
There are 192 hockey and 209 football player entries; full benches are not modeled.
Player identities are factual, while behavior is balanced arcade behavior, not
official ratings or a real-world statistical model.

## Boundaries of this release

Solo vs CPU. Hockey does not yet enforce icing, offside or penalties. Soccer does
not yet implement offside, cards or substitutions. Cup ties are one-match arcade
rounds with golden goal, not the UEFA two-legged competition or NHL series.
Cup state and settings live in browser storage. There is no live roster refresh,
franchise economy, online leaderboard or multiplayer transport in this release.

## Shared implementation

| Module | Responsibility |
| --- | --- |
| `core/pgi-controls.js` | Extracted PGI button activation, radial dead zone, normalized movement, scoped Safari gesture protection |
| `core/device-audio.js` | PGI iPhone playback-session activation and route recovery |
| `core/input.js` | Independent pointer ownership, cancellation, held input continuity, charge/release, action remapping |
| `core/movement.js` | Shared acceleration, stamina and movement for live play and dead-ball marking |
| `core/engine.js` | Seeded simulation, CPU positioning, possession, physical passes/shots, match lifecycle, event stream |
| `sports/football.js` | Football-only set-piece preparation, taker selection, stationary restarts and swept boundary decisions |
| `sports/rules.js` | Sport dimensions, movement coefficients, formations, period counts and documented rules |
| `core/math.js` | Fixed-step clock and swept collision helpers |
| `core/catalogue.js` | Validated provider loading and static snapshot fallback |
| `core/storage.js` | Versioned browser settings, cup progress and recent results |
| `core/view.js` | Sport-specific procedural rink/pitch and players; no downloaded artwork |
| `daily_flyer/sports.py` | Flask route registry and versioned, ETag-aware roster API |

`Match.step(1/60, {x, y, sprint})` and `Match.action(name, vector, power)` are
DOM-free and can run in Node. `snapshot()` is a render/replay snapshot, **not** a
complete authoritative save/restore protocol. Network multiplayer would still
need authority, reconciliation, input history, rooms and disconnect policy.

The DFE branch makes PGI's existing `controls.js` and `device-audio.js` re-export
these shared modules. Football-specific `primaryCommand` stays in PGI. Existing
PGI import paths and function signatures remain compatible. Thus shared input
fixes already have one source on that branch rather than three copied patches.

## Run and validate

Serve `daily_flyer/themes/pocket_sports_assets/` using any static host. For Flask:

```
python -m pip install -r requirements.txt
gunicorn web:app
node --test tests/gridiron/*.test.mjs tests/pocket-sports/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
```

API: `GET /api/v1/sports`, `GET /api/v1/sports/hockey/teams`,
`GET /api/v1/sports/soccer/teams`. The client uses the API on DFE's `/sports/`
route with a validated bundled snapshot fallback; static hosting uses the same
bundled data directly. The API is public read-only catalogue data, with no user
records, credentials, runtime upstream scraping or write endpoints.

## Backport into DailyFlyer

Source branch: `feat/pocket-hockey-soccer`, based on PGI
`994ec5520dd44ff01f01028d57991cabe477a83d`.

1. Keep `daily_flyer/themes/pocket_sports_assets/core/` together with changes to
   the two PGI re-export files and the blueprint URL alias. Do not cherry-pick
   the re-export files alone. The blueprint serves `/pocket_sports_assets/` so
   browser-relative imports from `/gridiron/` resolve as they do on disk.
2. Register `daily_flyer.sports.create_sports_blueprint` with the asset directory.
3. Carry `tests/pocket-sports/` and `tests/test_pocket_sports.py` with the feature.
4. Run `node --test tests/gridiron/*.test.mjs tests/pocket-sports/*.test.mjs`.
5. Publish PGI only after deciding to adopt the branch; this work does not move
   the existing `feat/pocket-gridiron` deployment branch.

DFE routes: `/hockey/`, `/soccer/`, `/sports/`. DFE defaults recognize
`pocket_hockey`, `pocket_soccer` and `pocket_sports`.

## Football pacing and input update — engine 1.2.0

The pitch is 880 × 1400 world units (was 680 × 1080), about 68% more area.
Running speed is 150 (was 202), with gentler acceleration and slower passes.
Sprint is still available for short bursts. Camera fitting, goal mouths, CPU
positions and boundary detection use the sport dimensions; hockey coefficients
and rink dimensions are unchanged.

Football restarts have two states: `restart` during brief preparation, then
`restart_ready`. Minimum setup is 0.65 seconds for throw-ins, 0.9 for goal kicks
and corners, 0.6 for kick-offs, and 0.35 for goalkeeper distribution. The taker's
arrival takes at most 1.8 seconds; preparation no longer waits for every player
to settle. The CPU releases 0.25 seconds after readiness. Goal celebrations take
1.8 seconds and half-time takes 2 seconds before the next restart.

The human side aims with normal movement input and takes the restart with PASS
(or SHOOT for a kick). A command pressed during preparation is queued once and
uses the latest aim when ready. An idle human restart never releases itself.
Match time counts active play only. On opposition restarts, the controlled
player can move, sprint and switch defenders throughout preparation and release;
only restart-specific exclusion areas constrain movement. Throw-ins preserve
the existing team shape while nearby receivers move into position.

Automatic stoppages keep stick capture, heading, keyboard movement and sprint
held. Only stale shot charge is cancelled when play stops. Manual menus, tab
hiding and lost focus release controls. Each action surface owns its initiating
pointer, so another finger's release/cancel cannot cancel a held button; touch
and keyboard shot ownership are also separate.

Goal kicks use the goalkeeper, opponents clear the area, and the released ball
must travel to a recipient. Throw-ins have a short airborne phase, cannot score
directly, and cannot be recollected by the taker until another player touches
them. Controllable goalkeeper saves lead to held possession and distribution.
These are arcade approximations, not full IFAB enforcement: no referee, delayed
restart sanctions, indirect free kicks, offside or cards are modelled.

The 19-team catalogue keeps the original 16 sides in their dated Champions
League group, with current Dortmund and the two classics in separate groups.
Per-team metadata is optional and falls back to the catalogue season/date, so
older catalogues and hockey roster displays keep the same interface.

Backport this revision as a unit: engine, renderer, football restart module,
rules, app, catalogue JSON/validators, backend and tests. Football behavior
lives in `sports/football.js`; carry `core/movement.js` with the engine. PGI
input and device-audio exports are unchanged. The new `core/input.js` ownership
logic can be adopted independently by games that use that adapter.

Validation adds regression scenarios for restart timing and player authority,
goalkeeper distribution, both touchlines, direct throw-in goals, second touches,
corner crossings, close-range shots, second-half kick-off and Dortmund's final XI.

## Render deployment

Use the existing Flask application on branch `feat/pocket-hockey-soccer`:

- Runtime: Python; region: Virginia; instance: Free.
- Build: `pip install -r requirements.txt`
- Start: `gunicorn web:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60`
- Environment: `DEFAULT_THEME=pocket_soccer`
- Auto-deploy the branch. `/` opens football; `/hockey/` opens hockey.

Verify `/api/v1/sports` reports engine `1.2.0`, both catalogue routes return
teams, and the browser can start a match after a successful deploy. The service
needs no database, secrets, persistent disk or scheduled roster scraping.
