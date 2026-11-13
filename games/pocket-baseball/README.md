# Pocket Baseball — first pitch edition

A complete single-player 3D baseball game in the Daily Flyer repository, inspired
by the readable pitching, timing and broadcast presentation of early-2000s
baseball games. Original fictional clubs: Boston Harbor and Brooklyn Foundry.

## Play

Serve `public/` with any static HTTP host. For local development:

```sh
node games/pocket-baseball/server.mjs
```

Open `http://localhost:4173`. The default is a three-inning exhibition, with the
human playing the visiting team. Six- and nine-inning games and batting practice
are also available. Tied games continue into extra innings.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Aim bat / locate pitch | Left pad | Arrows or WASD |
| Contact swing | SWING | Space |
| Power swing | POWER | Shift |
| Choose pitch | Four pitch buttons | 1–4 |
| Pitch meter | Tap PITCH, then RELEASE in gold | Space twice |
| Early throw to first | THROW TO 1ST when available | Space |
| Next pitch / change sides | Result card button | Enter / Space |
| Pause | Pause button | Escape |

Rookie, Club and Pro change timing forgiveness and CPU skill. Simple, Moderate
and Expert change guidance only. These settings are intentionally independent.
Simple shows a timing cue and strike zone; Moderate removes the timing cue;
Expert minimizes explanatory overlays.

## Implemented baseball

- Balls, strikes, swings and misses, takes, two-strike fouls, strikeouts and walks.
- Forced walk advancement, hits, base occupancy, runs, outs, lineup rotation,
  half innings, skipped final home halves, walkoffs and extra innings.
- Four-seam fastball, changeup, curveball and slider with different flight times
  and breaking paths. Pitch-meter execution affects location and effectiveness.
- Contact and power swings, timing-dependent spray, spatial bat aim, grounders,
  line drives, fly balls, physical catches, ground pickups, first-base throws,
  wall rebounds, and fair home runs.
- Animated fielders and runners, broadcast camera transitions, a physical park
  scoreboard, pitch/contact feedback, bat/glove/crowd sounds and organ accents.

### Deliberate first-version limits

Field movement and baserunning are assisted. Defense resolves catches and forces
at first; it does not yet implement choosing other throw bases, tag plays,
double plays, steals, pickoffs, bunts, substitutions, pitcher fatigue, balks,
hit-by-pitch, dropped-third-strike advances, infield fly, or a complete appeal
system. Runners hold on caught fly balls (no sacrifice/tag-up system). This is
an arcade first pass, not a full professional rules simulator. The clubs use
balanced fictional players, without real-world roster or rating claims.

Pitch speed labels describe the pitch profiles; visible pitch flight is slowed
for readable arcade timing. Ball size is modestly exaggerated for phone screens.
Neither presentation choice changes the simulation's collision radius.

## Engine and rendering

`public/engine.mjs` is a headless, seeded, fixed-step 120 Hz simulation. It has no
DOM, audio, rendering or networking dependency. The client issues commands;
rules own the outcomes. `snapshot()` / `restore()` preserve simulation, random
state and clock remainder. Events drive presentation without feeding it back
into physics.

`public/renderer.mjs` uses the vendored Three r160 runtime already used by DFE
Skyward. The same fence-radius function drives the park and collisions. Ball
presentation interpolates prior/current positions, while swept collision and
analytic pitch timing avoid fast-ball tunneling. Fixed field textures, shared
geometry, an instanced crowd, cached scoreboard textures, capped device pixel
ratio and adaptive resolution keep GPU work bounded. The drawing buffer is only
resized when dimensions or pixel ratio actually change.

Phone input follows the corrected DFE touch behavior: distinct pointer ownership
for aiming/actions, swing registration on pointerdown, independent cancellation,
safe-area layout, and no pause from ordinary foreground Safari focus churn.
Actual visibility loss pauses play. Audio starts only after user interaction.

The engine accepts at most 100 ms of local input delay and rejects out-of-window
timestamps. Input timestamps account for the rendered interpolation delay. This
is local input scheduling, **not a claim of tested online latency compensation**.

## Future 1v1 boundary

The headless engine, command entry point, stable pitch identity, seeded pitch
parameters, event stream and serializable snapshots form the reusable boundary.
An eventual authoritative host/server should schedule pitch release on a shared
clock, validate player/side, match generation, pitch ID and monotonically
increasing action sequence, bound the accepted input rewind, and publish contact
and scoring outcomes. Clients can render the same trajectory immediately and
reconcile against those outcomes. A presentation frame must never directly
change score, bases or random state.

There are no rooms, accounts, matchmaking or remote opponents in this release.
Online synchronization, reconnect and fairness testing remain future work.

## Verification

```sh
node --test games/pocket-baseball/tests/*.test.mjs
```

The tests cover deterministic 30/60/120 Hz frame partitioning, snapshot replay,
count rules, forced walks, two-strike fouls, inning endings, walkoffs, home runs,
fence rebounds, swept collision, rolling friction, physical first-base arrival,
and bounded swing input. A browser check is also needed for rendering, input,
sound unlock and responsive layout; headless simulation tests do not measure
real iPhone GPU performance or real network multiplayer behavior.

`?debug=1` enables the explicit developer inspection hook. It is absent from
ordinary sessions and is not a security boundary for this local-only game.

## Hosting and data

Deploy branch `feat/pocket-baseball` from `shnider42/daily_flyer` as a Render Static
Site, publishing `games/pocket-baseball/public`. Build command:

```sh
node --test games/pocket-baseball/tests/*.test.mjs
```

Set `SKIP_INSTALL_DEPS=true`: the first version has no install or external asset
step. Serving the client statically avoids a server round trip on gameplay input.
All runtime assets are included. The optional `server.mjs` is for local preview
or a later web-service host; production v1 needs no runtime server or database.

Only preferences are saved in browser localStorage. Matches are kept in memory;
refreshing leaves the current game. There is no game analytics, account data,
telemetry API, cookie identifier or third-party font/asset request. Hosting
infrastructure can still process normal request metadata.

## DFE provenance

The new isolated branch starts from Pocket Sports commit
`b2067c82307f01fcb4d4331b443e3d3a617a95fc`; existing theme files are untouched.
Three.js and its MIT license come from Skyward commit
`419bb35ec855714e0d1289ade2f5a4ff8f2c10e6`. Rendering/timing patterns were checked
against `games/skyward/public/presentation.mjs` and `renderer.mjs`; touch pause
behavior was checked against current Further In `further_in/dist/app.mjs`.
The game has original procedural visuals and synthesized audio.
