# CHALK

Version 1.3 adds private two-player co-op to this standalone Daily Flyer top-down squad game inspired by the Battle of Mogadishu, 3–4 October 1993. Play four short missions alone or with a friend. Either person can lead the four-person fictional squad; computer-controlled soldiers fill every remaining position. The setting and mission structure are historically inspired, while the characters and gameplay are fictional.

## Play

For solo play, select any mission and choose **Lead the squad** or **Follow the leader**. Solo play continues to run locally without a multiplayer connection. Story, Standard, and Veteran change combat pressure; Simple, Moderate, and Expert change guidance. Simple adds a small directional aim assist to touch controls. Mission completions and preferences are stored locally in this browser. Reloading restarts a solo mission; an online session attempts to reconnect to its room.

| Mission | Objective flow |
| --- | --- |
| Cordon | Reach the rally, hold a collection point, and extract with the squad. |
| First Crash | Reach a helicopter wreck, stabilize two crew members, and escort them to safety. |
| Night Relief | Meet the relief vehicles, accompany them past two route obstructions, and cover casualty loading. The final phase requires every living squad member present and standing. |
| Dawn Mile | Move through three rally positions and bring the surviving squad to the aid station. |

The missions share a compact city street layout, with varying blocks, landmarks, objectives, and afternoon/night/dawn lighting. They are intentionally short; an efficient route takes roughly one to two minutes, with human play varying by exploration and combat. Vehicles follow a route and wait for the squad. They do not have a damage model in this version.

## Private two-player co-op

1. Choose **Create co-op squad** and enter a callsign.
2. Share the six-character room code or use **Copy invite link**. Your friend opens the link or chooses **Join squad** and enters the code.
3. In the briefing, the room host chooses the mission and difficulty. Use **Swap player roles** to decide who leads, then choose **Deploy squad**.

The squad always contains exactly four soldiers:

| Soldier | Role | With two connected players |
| --- | --- | --- |
| Hale | Squad leader | Human; gives squad orders |
| Mercer | Rifleman / squad member | Human; moves and fights independently |
| Ames | Medic | Computer-controlled |
| Webb | Support | Computer-controlled |

The room host manages deployment, mission settings, restarts, and role swaps. Hosting is separate from leading: the host can play Mercer while the invited player controls Hale. **Swap player roles** is available to the host in the briefing and the mission's field menu, and changes the assigned soldiers without restarting the mission. Squad-command permissions follow Hale, regardless of who hosts.

A room can deploy with one person, and a friend can join an available seat during the mission. AI fills an unoccupied Hale or Mercer position, so there are three computer-controlled soldiers with one human and two with both humans connected. Rally progression and convoy movement account for both living human players; extraction still requires the surviving squad to assemble. Either human can stabilize crew or clear an obstruction.

### Connection recovery and room lifetime

Once the server detects a disconnection, AI takes over that soldier with the same health, ammunition, and position. The disconnected player's seat is reserved for **30 seconds**, during which the client attempts to reconnect with its saved session credentials. After the reservation expires, the player must join again using the room code if a seat is available. Stale movement and fire inputs become neutral after 500 ms, even before the connection is declared lost.

If the host disconnects, the remaining player becomes host after **5 seconds** without changing their squad role. These timers start when the server detects the disconnect. Explicitly leaving releases the seat immediately and promotes the remaining player immediately.

Rooms exist only in server memory. With no connected humans, mission simulation stops; a disconnected empty room expires after one minute, and inactive rooms expire after 15 minutes. Explicitly leaving the final seat closes the room. A server restart also clears rooms, so reconnecting is temporary session recovery, not a saved mission checkpoint. Session credentials are kept in the current browser tab's session storage; no account is required.

**Opening the field menu, map, or help does not pause an online mission.** Local held input is released while the other player and the shared world continue. Solo pause retains its existing behavior.

## Roles and controls

As **Hale**, command Move, Regroup, Hold, and Assist. As **Mercer**, request Ready, Wait, or Need help. When Hale is computer-controlled, he navigates mission objectives and waits if you fall behind; with a human Hale, that person leads. Solo players can switch roles from pause without restarting. In co-op, the room host swaps the players' assignments from the briefing or field menu.

| Input | Action |
| --- | --- |
| WASD or arrows | Move |
| Mouse / left button | Aim / fire |
| Shift | Sprint; firing is disabled while sprinting |
| E, held | Assist, stabilize, clear an obstruction, or bandage yourself |
| R | Reload |
| G | Throw smoke toward your aim |
| Right click or T | Place a squad destination in leader mode |
| Q / H / F | Regroup / Hold / Assist; member mode uses Ready / Wait / Need help |
| M | Battlefield map |
| Escape | Pause in solo; open the field menu in co-op |

Touch uses a full-screen battlefield with translucent controls. The left stick anchors near your thumb; drag gently to walk and to the outer edge to sprint. A light right-stick drag aims, and pushing farther fires. Sprint stops while aiming or assisting. An empty magazine reloads automatically when ammunition remains. Smoke and reload sit between the sticks; the contextual assistance button appears for nearby wounded people, rescue work, route obstructions, or self-bandaging. The Squad / Radio button opens a compact command panel; Move opens the district map with a visible Cancel action. Opening the map or field menu, changing touch mode, and rotating the phone release held input. The field menu can enable touch controls manually. Landscape and portrait layouts are supported. Reduce motion suppresses the drifting atmosphere.

Audio starts only after a user gesture, and can be disabled. Rifle and opposing-fire reports use distinct recorded samples, processed for distance and stereo position. A helicopter pass fades after the Cordon insertion. Recorded wind, footsteps, reload handling, and convoy engines remain quieter than nearby shots. Samples total approximately 250 KB and load asynchronously, with procedural fallback.

Squad members navigate around buildings, fire at visible armed opponents, and help downed teammates. The medic can recover either human player. Ammunition, smoke, and bandages are limited. Squad members who are down for too long can be lost. In solo, an unrecoverable player ends the mission; in co-op, the surviving player can continue after the other is lost. The shared mission fails when the whole squad is incapacitated or neither playable soldier can recover. Mission results emphasize survival, rescues, civilian harm, and completion time rather than kills.

## Historical framing

The setting is grounded in the October 1993 battle and its shift from raid to rescue. Names, dialogue, squad composition, maps, compressed timing, and outcomes are fictional. The game acknowledges U.S., Malaysian, and Pakistani participation in the relief effort and distinguishes Somali civilians from armed fighters. Civilians are unarmed, seek shelter, are excluded from AI targets, and can be injured by player fire; that harm is recorded in the debrief. No film dialogue, likenesses, music, or art is used.

Primary references are included in the game's **Historical context** panel:

- [U.S. Army Center of Military History: The U.S. Army in Somalia, 1992–1994](https://history.army.mil/portals/143/Images/Publications/catalog/70-81-1.pdf)
- [U.S. Army veteran accounts of the Mogadishu rescue](https://www.army.mil/article/113311/we_didnt_leave_anybody_behind_10th_mountain_division_veterans_reflect_on_mogadishu_rescue_missi)
- [U.S. Department of State: Somalia, 1992–1993](https://history.state.gov/milestones/1993-2000/somalia)

## Run and validate

Requires Node 22 or later. Install the locked dependencies before starting the development server or running the complete test suite:

```sh
npm ci --prefix games/chalk --ignore-scripts
npm start --prefix games/chalk
```

Both `npm start` and `npm run dev` use `server/index.mjs`, which serves the browser assets and the WebSocket endpoint together. The local server defaults to port 3000, accepts `PORT` or `--port`, and supports `--host`. Local browser sessions connect to the same server's `/ws` endpoint. Use separate browser sessions to exercise two independent players; refreshing an existing tab resumes its saved session where possible.

Validation commands, run from the repository root:

```sh
npm run build --prefix games/chalk
npm test --prefix games/chalk
npm run test:server --prefix games/chalk
```

The static `build` checks browser-module syntax and runs the simulation, touch-input, and client tests. It deliberately excludes the server tests and does not require installing the server's `ws` dependency. `npm test` runs the complete 59-test suite, including actual WebSocket connections. `test:server` runs the backend and simulation regression tests used by the backend deployment.

The simulation is deterministic and independent of the DOM. The suite contains 19 original solo simulation tests, 11 co-op simulation tests, seven touch-input tests, ten client tests, and 12 server tests. Coverage includes all four mission routes, independent human movement, two remaining AI squad mates, command permissions, role exchange, AI recovery of either human, shared interaction progress, cohesion and extraction, disconnect takeover, authenticated reconnect, host promotion, expired rooms, stale controls, one-shot actions, snapshot recovery, and WebSocket/HTTP boundaries. Release browser checks cover two separate sessions creating and joining a room, four-person rosters, a member hosting while their friend leads, role swaps, local field menus, invite links, reload recovery, and mobile layouts at 390 × 844 and 844 × 390. The deployed WebSocket service was also checked with two real clients. These checks do not include a physical iPhone/Safari session.

## Farwake reuse and networking

The co-op transport reuses code from Daily Flyer's `feat/farwake-galaxy` branch at [commit `756fee9ba7456b028fda0dc714829edf33a713ed`](https://github.com/shnider42/daily_flyer/commit/756fee9ba7456b028fda0dc714829edf33a713ed):

- `public/snapshot-delta.mjs` reuses Farwake's lossless snapshot-delta codec.
- `server/timing.mjs` reuses Farwake's fixed-step scheduler.
- The room server adapts Farwake's authoritative simulation, authenticated session recovery, command validation, bounded input handling, and backpressure rules to private two-person CHALK rooms. A skipped send does not advance a client's delta baseline.
- The client adapts input coalescing, bounded local movement prediction, remote interpolation, and full-snapshot recovery to CHALK's movement, mission state, and role changes.

The server advances the shared simulation at 30 Hz, accepts controls at 30 Hz, and sends snapshots at 10 Hz. Combat, ammunition, AI, objectives, and role assignments remain server-owned; local prediction only smooths movement. Static city geometry is generated from the shared mission seed, while snapshots carry the current actors, objectives, and mutable world props. Online rooms are temporary and limited to two humans; public matchmaking, voice/text chat, and persistent remote saves are outside this version.

Files:

- `public/sim.mjs`: collision, navigation, combat, squad AI, civilians, and mission progression.
- `public/renderer.mjs`: original Canvas 2D artwork, city cache, camera, effects, and map.
- `public/app.mjs`, `touch-input.mjs`, `index.html`, `style.css`: menus, input, HUD, local preferences, and debrief.
- `public/audio.mjs`: spatial playback of recorded rifle, helicopter, and wind samples, with procedural foley and fallback. Source credits and CC0 licenses are in `public/audio/CREDITS.txt`.
- `public/coop-client.mjs`: client connection, session recovery, state hydration, movement prediction, and interpolation.
- `public/coop-protocol.mjs`, `snapshot-delta.mjs`: shared wire contract, input cleaning, and snapshot codec.
- `public/network-config.mjs`: same-origin local WebSocket selection and the production backend address.
- `server/index.mjs`: combined local HTTP/WebSocket server and production backend entry point.
- `server/rooms.mjs`, `protocol.mjs`, `timing.mjs`: room lifecycle, authoritative simulation, session verification, and scheduling.
- `server.mjs`: legacy static preview server; the package scripts now use `server/index.mjs`.

No accounts, analytics, chat, user uploads, or durable remote saved games are used.

## Deployment

Repository: `shnider42/daily_flyer`, dedicated branch `feat/chalk-mogadishu`.

The existing `dfe-chalk` static site serves the browser game. The separate `dfe-chalk-coop` Node web service runs private rooms on Render's free plan in Virginia. Keep unrelated DFE branches and services unchanged.

| Setting | Static frontend | Co-op backend |
| --- | --- | --- |
| Service | `dfe-chalk` | `dfe-chalk-coop` |
| Branch | `feat/chalk-mogadishu` | `feat/chalk-mogadishu` |
| Build command | `npm run build --prefix games/chalk` | `npm ci --prefix games/chalk --ignore-scripts && npm run test:server --prefix games/chalk` |
| Publish directory | `games/chalk/public` | — |
| Start command | — | `node games/chalk/server/index.mjs` |
| Health endpoint | — | `/health` |
| Node version | `NODE_VERSION=22` | `NODE_VERSION=22` |
| Automatic dependency installation | `SKIP_INSTALL_DEPS=true` | `SKIP_INSTALL_DEPS=true`; the build command installs explicitly |

Set `CHALK_ALLOWED_ORIGINS=https://dfe-chalk.onrender.com` on the backend. The browser's configured production endpoint is `wss://dfe-chalk-coop.onrender.com/ws`; solo play does not depend on this service. Render supplies `PORT`, and the server binds to `0.0.0.0`. Deploy compatible client and server protocol versions together. Rooms are held in one process, so restarts clear them and additional backend instances require a shared room-routing design.
