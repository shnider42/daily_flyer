# Pocket Hockey + Pocket Soccer

Two DailyFlyer games with a shared, headless JavaScript simulation, mobile input,
roster provider, browser saves and match events. The live browser build is in
`dist/`; a Flask backend is available in `backend/` and integrates into DailyFlyer
as a blueprint. No build step or paid API is needed for the playable client.

- Hockey: 6 players per side, all 32 NHL clubs, momentum, rebounds, checking,
  goalie saves, three periods and golden-goal overtime.
- Soccer: 11 players per side, the completed 2025/26 Champions League round of 16,
  dribbling, passes, tackles, throw-ins, corners, goal kicks, two halves and overtime.
- Both: Quick play, unlimited practice, a four-round arcade cup saved between
  matches, difficulty settings, adjustable match length, goal replays and results.
- Mobile: left movement thumb, right contextual pass/shoot/burst cluster; sizes,
  sensitivity, shot assistance and handedness are adjustable while paused.
- Desktop: WASD/arrows, J pass, hold/release Space shoot, K burst, Q switch;
  actions are remappable. P/Esc pauses.

The NHL lineups use a **2025-10-07 opening-roster snapshot** (including some
injured-list players), not live November 2026 rosters. The soccer XIs are
representative selections from official March 2026 R16 match squads. Sources and
snapshot dates travel with each JSON catalogue and appear in the lineup dialog.
There are 192 hockey and 176 soccer player entries; full benches are not modeled.
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
| `core/input.js` | Pointer ownership, cancellation, held inputs, charge/release, action remapping |
| `core/engine.js` | Seeded simulation, CPU positioning, possession, physical passes/shots, match lifecycle, event stream |
| `sports/rules.js` | Sport dimensions, movement coefficients, formations, period counts and documented rules |
| `core/math.js` | Fixed-step clock and swept collision helpers |
| `core/catalogue.js` | Validated provider loading and static snapshot fallback |
| `core/storage.js` | Versioned browser settings, cup progress and recent results |
| `core/view.js` | Sport-specific procedural rink/pitch and players; no downloaded artwork |
| `backend/catalog.py` | Flask route registry and versioned, ETag-aware roster API |

`Match.step(1/60, {x, y, sprint})` and `Match.action(name, vector, power)` are
DOM-free and can run in Node. `snapshot()` is a render/replay snapshot, **not** a
complete authoritative save/restore protocol. Network multiplayer would still
need authority, reconciliation, input history, rooms and disconnect policy.

The DFE branch makes PGI's existing `controls.js` and `device-audio.js` re-export
these shared modules. Football-specific `primaryCommand` stays in PGI. Existing
PGI import paths and function signatures remain compatible. Thus shared input
fixes already have one source on that branch rather than three copied patches.

## Run and validate

Serve `dist/` using any static host. For Flask:

```
python -m pip install -r requirements.txt
gunicorn backend.app:app
node --test tests/*.test.mjs
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
