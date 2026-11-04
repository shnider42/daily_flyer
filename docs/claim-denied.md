# Claim Denied — 0.1.1

An original DailyFlyer house-defense FPS for solo play and private 2–4-player
co-op. Everwell Assurance and its undead board are fictional. The game contains
no real executives, likenesses, company marks, or references to real attacks.

## Play

Choose **Defend the house**, or **Play with friends**. A host creates a room and
shares its invite/code. Two to four players mark ready; the host starts.

- WASD move; mouse look; click fire; Shift sprint; R reload; E use/hold;
  1/2/3 select pistol/shotgun/carbine; Esc pause. Arrow keys also move/turn and Space fires without pointer lock.
- Phone: left joystick moves, right-side drag looks, separate FIRE, USE and
  RELOAD controls. Looking never fires. Landscape is recommended. Numbered
  weapon buttons select carried weapons. `?controls=touch` forces touch controls.
- Shoot through the six windows before approaching enemies reach the boards.
  Each window has three boards (120 total durability). Enemies damage these,
  spend 1.5 seconds climbing, and navigate the interior to reach survivors.
- Hold USE beside damaged windows to restore one board per 0.85 seconds.
  Repairs are free; credit awards are capped at 180 per player per wave.
- Hold USE beside a downed teammate for three seconds. Bleedout takes 28 seconds.
  Eliminated teammates return after a cleared wave. A complete team down ends
  the run immediately. Friendly fire is off.
- Buy at the marked stations: ammo 120, first aid 200, shotgun 600, carbine 1000.
  The starter pistol receives reserve ammunition between waves, with 22 seconds
  to regroup. Health slowly regenerates after eight seconds without damage.
- Fast-track VPs join on wave 3; Senior Auditors on wave 4; a Chairman appears
  every fifth wave. Enemy numbers scale with the party; health and speed rise
  with wave count. Active enemies are capped at 40 to bound client/server load.

## DFE integration

`daily_flyer/themes/claim_denied.py` implements DFE's standalone `PageContext`
theme contract. Select `claim_denied` through the existing theme loader. Export:

```sh
npm ci --omit=dev --ignore-scripts
python3 scripts/build_claim_denied.py
node server/claim-server.mjs
```

The server binds `0.0.0.0:$PORT` (default 4173), serves the exported game and
`/health`, and upgrades same-origin `/ws`. One Node service hosts both frontend
and multiplayer. No database, external assets, external paid generation service,
or new runtime dependency is needed. Three.js and its license are copied from
Breach's existing vendor directory at export. All music/Foley is original Web
Audio synthesis. The game uses WebGL with a Canvas software fallback for the
same geometry. Best wave is browser-local; runs themselves are not durable.

## Shared architecture and isolation

The branch starts from Breach `c454d3b`. Breach's code and live branch are
unchanged. `claim-rooms.mjs` and `claim-server.mjs` adapt its room lifecycle and
transport: authoritative 30 Hz simulation, 10 Hz snapshots, sequenced and
bounded inputs, single-use firing pulse, heartbeat/backpressure/rate limits,
cryptographic reconnect token, 60-second reservation and protective shared pause.
The protocol is isolated as `game: claim-denied`, protocol 1, mission
`everwell-house`; Breach clients cannot enter these rooms. Gameplay state is
owned by the server. Clients cannot submit position, health, credits or kills.

`core.mjs` is a deterministic, renderer-independent simulation used by solo and
the server. Geometry definitions are shared with rendering, collision and
ballistics. Interior navigation uses a small bounded grid around the furniture.
The original Three.js renderer provides warm lamps, cool streets, procedural
household props, rain, animated suits, weapon recoil and paper-burst defeats.

Private rooms are in memory: server restarts erase them. A disconnected or
stalled player holds the run; everyone must resume. Explicitly leaving ends
the room. Late joins after start are disabled. The initial hosting configuration
has four simultaneous rooms and a two-hour room lifetime. Free hosting may
need time to wake after inactivity.

## Validation

```sh
node --test tests/claim-*.test.mjs
node --test tests/breach-*.test.mjs
python3 -m unittest discover -s tests -p test_claim_export.py -v
```

Claim tests exercise deterministic waves, all six breach routes, board repair,
line-of-sight shooting, collisions, weapons, purchases, down/revive/team wipe,
wave rewards, pathfinding, four-player rooms, input validation, disconnect and
token resume. The server integration test uses four real WebSocket clients,
checks served assets and health, and reconnects the fourth player.

Browser verification used the Canvas fallback because the available QA browser
disables WebGL. Desktop menu/game/pause/room creation and portrait controls are
checked. Hardware WebGL, physical iPhone multitouch, and four human players on
different real networks still need playtesting; automated co-op checks do not
substitute for that experience.

## 0.1.1 controls and stability

- Mobile has a labeled 128px LOOK pad, a separate 94px gold FIRE button, and
  64px USE/RELOAD targets. Portrait and landscape use distinct layouts with
  safe-area offsets. Each surface owns its pointer; aiming never fires.
- Desktop retains WASD/mouse, click fire, R/E, Shift, 1–3, and Escape. Touchscreen
  laptops with a primary mouse no longer default to touch-only controls. Failed
  mouse capture does not trigger a false pause. Actual capture loss still pauses.
- Browser focus changes alone no longer pause. Hiding/leaving the page still
  pauses and clears held controls. Co-op controls send at 30Hz independently of
  rendering. The server neutralizes stale controls after 300ms and pauses after
  five seconds of sustained silence. Resume grants a fresh snapshot grace period;
  duplicate pause requests cannot reset already-ready teammates.
- Exterior trim is raised clear of wall faces, floor joints no longer overlap,
  and intersecting sofa/body faces are inset to remove depth-buffer fighting.

Validation: 53 JavaScript tests and two DFE export tests, including desktop
input, multitouch ownership, liveness/resume, geometry and four real WebSocket
clients. Portrait controls were visually inspected in the software-rendered
preview. The QA browser became unavailable before desktop/landscape playtesting
could finish; hardware WebGL and physical phone multitouch remain unverified.
