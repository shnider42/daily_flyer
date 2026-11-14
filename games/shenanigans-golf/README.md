# Shenanigans Golf

An original DFE 3D minigolf game: eighteen authored holes, four permanent golfer
slots, and a course that starts in a garden and ends somewhere the planning
committee definitely did not approve.

## Play

Run with Node 22 or later. All game assets, including Three.js, are vendored;
there are no install-time packages or third-party runtime requests.

```sh
node games/shenanigans-golf/server.mjs
```

Open `http://localhost:4178`. The server binds `0.0.0.0` and honors `PORT`.

- **Play a full round** starts immediately in the browser against three CPUs.
- **Host friends** opens a private four-seat room. Share its link or six-character
  code. The host can tee off immediately with computer-filled seats.
- **Join a room** takes an unclaimed computer seat. Mid-round joiners inherit
  that seat's scorecard and ball; joining does not erase a bad hole.
- **Practice a hole** opens any one of the eighteen holes for a fresh attempt.

Click or touch the turf to aim, move the power slider, and press **Putt**.
Desktop controls: left/right arrows fine-tune aim, up/down arrows change power,
Space putts, G aims toward the cup, C switches between follow and course views.
The large arrow buttons offer touch fine-tuning. Tap a golfer's standings row
to watch their ball, then aim or putt to return to your own.

Sound is optional and begins only after a user gesture. Solo rounds pause when
a dialog opens or the tab becomes hidden. Online rounds continue for the group.

## The round

Everyone plays concurrently. Balls pass through other players' balls so results
depend on the course and their own shots. Hazards and timing are shared online.
Computers choose and execute real shots through the same physics as humans;
their difficulty adjusts shot accuracy, not scoring or collision rules.

**Stroke play:** lowest total over eighteen holes wins.

**Points per hole:** places earn 4, 3, 2, and 1 points. Ties share the average of
the occupied places. Highest total wins. A tied overall result is a shared win.

Water, lava, and out-of-bounds balls cost one penalty stroke and return to the
last safe lie. There is a twelve-stroke cap and a shared 150-second hole clock.
Unfinished balls score twelve at the deadline. After everyone finishes, an
eight-second result card precedes the next hole. The host can advance this
completed-hole interval early; unfinished holes cannot be skipped. At the end,
the scorecard ranks all four golfers and permits a new round.

| Hole | Course | Par | Main challenge |
| --- | --- | --- | --- |
| 1 | A Nice Little Putt | 2 | Learn power on a straight green |
| 2 | The Flower Bed | 3 | Bank around landscaping and sand |
| 3 | The Garden Path | 3 | An L-shaped green |
| 4 | Sprinkler Incident | 3 | Sideways spray and a puddle |
| 5 | Windmill Warranty | 3 | A rotating windmill obstacle |
| 6 | Shortcut Pending | 3 | Safe bridge or a pond jump |
| 7 | Factory Settings | 4 | Loading-bay slalom |
| 8 | Belt and Braces | 3 | Opposing conveyor belts |
| 9 | Pinball Etiquette | 3 | Active bumpers and ice |
| 10 | Rush Hour | 4 | Three independently moving gates |
| 11 | Portal Maintenance | 3 | Disconnected portal islands |
| 12 | Wrong Way River | 4 | A narrow bridge and current |
| 13 | Moonlighting | 3 | Low-gravity ramps and a bridge |
| 14 | Weather Advisory | 4 | Alternating crosswinds |
| 15 | Reactor Inspection | 4 | Magnetic fields and a rotor |
| 16 | The Floor Is Lava | 4 | Lava, jumps, and a spinning bridge |
| 17 | Everything, Everywhere | 4 | Portals, bumpers, ice, magnets, lava |
| 18 | The Last Reasonable Putt | 5 | A risky central launch or outside route |

Total par: 62. Every hole's physical platforms, rails, hazards, and moving
obstacle poses come from the same course definitions used by the renderer.

## Online architecture

One Node HTTP service hosts static assets, commands, and authenticated SSE.
The server owns the physics, computer players, scores, timing, and progression.
The host has lobby controls, not authority to submit results or other shots.
The frontend smooths server snapshots for display and sends aim/power commands.

Each room has four permanent seats with separate human credentials. An absent
human receives a ten-second grace period, then a computer covers the seat.
Rejoining the same browser tab reclaims it without resetting the score. If the
ball is already moving, that shot finishes before human control resumes. Host
controls transfer when the host leaves or remains disconnected. Explicit leave
revokes the seat credential and frees the seat for a new person. A fifth player
cannot replace an occupied human seat.

Bearer tokens stay in that tab's `sessionStorage`; invitations contain only
the room code. Input sequences, round IDs, and hole IDs prevent duplicate or
delayed packets from producing extra shots. Requests validate finite numeric
aim/power, authenticated seat identity, phase, and host-only actions.

Rooms are held in server memory and are not durable accounts. Restarting or
redeploying the service ends live rooms. Abandoned rooms expire. Bounded rooms,
streams, request sizes and rates prevent unbounded resource use. Same-origin
API access, public-directory-only static serving, opaque credentials, stream
backpressure, gzip snapshots, and graceful shutdown are included.

## Data

The game uses a chosen display name, settings, transient room/shot state, and
scores. The browser stores preferences and local best round records in
`localStorage`; a room token lives in `sessionStorage`. No account, email,
analytics script, tracking pixel, external font, or advertising integration is
required. The application does not persist room data to a database. Hosting
infrastructure may keep normal HTTP access logs; room tokens are sent in an
Authorization header rather than a URL. Clearing this site's browser storage
removes saved preferences, local records, and room credentials.

## Files

- `public/holes.mjs`: authored course geometry and shared moving obstacle poses.
- `public/engine.mjs`: deterministic physical steps, shot search, rules, scoring.
- `public/renderer.mjs`: Three.js presentation and camera.
- `public/fallback-renderer.mjs`: playable Canvas view if WebGL is unavailable.
- `public/app.mjs`: accessible lobby, controls, scorecards, practice and solo flow.
- `public/online.mjs`: authenticated streaming, command sequencing and reconnection.
- `public/audio.mjs`: original procedural shot and result sounds.
- `multiplayer.mjs`: server-owned rooms, human occupancy, reconnection and commands.
- `server.mjs`: static assets, HTTP/SSE endpoints and lifecycle.

## Verification

```sh
node --test games/shenanigans-golf/tests/*.test.mjs
```

The 36-test suite checks physical collisions and hazards, honest scoring and
completion, computer rounds, four-human capacity, bot substitution, preserved
late-join scores, reconnects, duplicate/stale command handling, client lifecycle,
and real HTTP/SSE authorization and payload boundaries. Structural rendering
checks cover all 18 scenes and screen-to-world aiming. Live desktop/mobile
browser checks of menus, controls, and online room flow remain part of deployment
verification; the current execution environment cannot launch Chromium or expose
its local server to the available browser.

## Deployment

Use a single Node web service on the dedicated `feat/shenanigans-golf` branch.

- Build: `node --test games/shenanigans-golf/tests/*.test.mjs`
- Start: `node games/shenanigans-golf/server.mjs`
- Health: `/health`
- Region: Virginia, alongside the DFE flight and baseball multiplayer services.

The game requires a single server instance because room state is in memory.
Horizontal scaling would require a room router/shared authoritative state.
Three.js retains its MIT notice in `public/vendor/THREE-LICENSE.txt`.

The source is maintained on the dedicated `feat/shenanigans-golf` branch in
`shnider42/daily_flyer`. Its Node service serves the course and multiplayer from
one origin, without changing the other DFE game services.
