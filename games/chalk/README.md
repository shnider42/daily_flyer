# CHALK

Version 1.5 adds enterable houses, wider mobile framing, a compact mobile HUD, and a layered ambient soundscape in this standalone Daily Flyer top-down squad game inspired by the Battle of Mogadishu, 3–4 October 1993. Play four short missions alone or with a friend. Either person can lead the four-person fictional squad; computer-controlled soldiers fill every remaining position. The setting and mission structure are historically inspired, while the characters and gameplay are fictional.

## Play

For solo play, select any mission and choose **Lead the squad** or **Follow the leader**. Solo play continues to run locally without a multiplayer connection. Story, Standard, and Veteran change combat pressure; Simple, Moderate, and Expert change guidance. Simple adds a small directional aim assist to touch controls. Mission completions and preferences are stored locally in this browser. Reloading restarts a solo mission; an online session attempts to reconnect to its room.

| Mission | Objective flow |
| --- | --- |
| Cordon | Reach the rally, hold a collection point, and extract with the squad. |
| First Crash | Reach a helicopter wreck, stabilize two crew members, and escort them to safety. |
| Night Relief | Meet the relief vehicles, accompany them past two route obstructions, and cover casualty loading. The final phase requires every living squad member present and standing. |
| Dawn Mile | Move through three rally positions and bring the surviving squad to the aid station. |

The missions share a compact city street layout, with varying blocks, landmarks, objectives, and afternoon/night/dawn lighting. They are intentionally short; an efficient route takes roughly one to two minutes, with human play varying by exploration and combat. Vehicles follow a route and wait for the squad. They do not have a damage model in this version.

## Houses, mobile framing, and ambience: version 1.5

Every ordinary house is enterable: walk through an open doorway without an interaction button. Roofs lift on a doorway approach or friendly occupancy and close after the squad leaves. Interiors contain masonry walls, wider houses have two connected rooms, and small furnishings are decorative. Doors and internal passages are wide enough for the complete squad and rescued crew. The overview map shows floor plans and the minimap shows the openings.

Movement, AI navigation, bullets, sight lines, aim obstruction cues, and co-op prediction share the same deterministic wall geometry. Walls also prevent reviving or rescuing someone from the other side. Doorways remain exposed. Both the frontend and authoritative co-op server require this release; the network protocol remains unchanged.

Mobile now defaults to **75% camera zoom**, **85% HUD size**, and **Compact** detail. These preferences are independent of desktop settings and are added automatically to existing saves. Camera zoom ranges from 60% to 125%, and mobile HUD size from 75% to 115%. Compact keeps the current objective, mission stage, squad health, and ammunition. Touch buttons and thumbsticks retain their full hit areas. The camera safe area follows the smaller panels and the contextual Assist control in portrait and landscape.

The menu uses a sparse ambient scene: recorded wind, moving helicopter passes, filtered human radio fragments, short performed commands, and distant synthesized impact/rumble tails. The first click or tap enables browser audio; **Enable sound** also starts it directly. Voices have gaps between them and lower the menu wind/rotor bed while they play. There is no continuous music bed. The scene crossfades into mission audio, stops on pause or a hidden tab, and respects mute and the Ambience slider. Entering a house smoothly softens outdoor wind, rotors, and engine noise, with a restrained increase in room reflections.

During a mission, existing movement and regroup radio events can play a recorded move-out call, and smoke/route-open movement events can play a short Go call. Hold and casualty messages do not trigger contradictory movement speech. These calls are a small initial voice vocabulary, not a full voiced dialogue system. Action volume controls nearby effects and squad calls; Ambience controls the background mix. Recordings and their edits are credited in `public/audio/CREDITS.txt`; none is presented as archival audio from the battle.

Browser checks for this release covered walking into and out of a house with the squad, menu audio assets loading, scene transitions, volume controls, and mobile layouts at 390 × 844 and 844 × 390, including the largest mobile HUD setting. In a foreground Linux Chromium Cordon scene, Balanced Auto measured about 60 FPS at 1280 × 720 (1280 × 720 buffer) and 59 FPS at 2560 × 1440 (1920 × 1080 buffer). These are checks in the test environment, not guarantees for a particular phone or desktop. Physical mobile speaker/headphone and Safari testing remain separate.

Roofs remain baked into the district cache. Only revealed houses add small cached interior patches, so entering a house does not rebuild the map. The wider mobile camera retains the existing bounded render resolution and fixed simulation step.

## Desktop update: version 1.4

The camera is prepared before mouse coordinates are converted into the world, and drawing uses that same transform. Human weapon spread affects the projectile without moving the soldier's requested facing. There is one custom reticle; the native cursor returns in menus and on interface controls. Immediate Regroup, Hold, and Assist commands preserve held movement and fire. Camera lookahead defaults off. Near map edges, the followed soldier is kept clear of the desktop HUD with bounded extra framing.

**Settings** is available in field orders, the desktop top bar, and the pause/field menu. Changes apply immediately and persist on this device. Reset retains mission completion, role, difficulty, and callsign.

| Category | Controls |
| --- | --- |
| Video | Performance / Balanced / High effects; Automatic / 75% / 100% rendering; 60 / 120 / uncapped frame limit; camera zoom; reduced motion; performance display |
| Aim & controls | Camera lookahead; cross / ring / dot reticle; reticle size and color; optional wall obstruction cue; reload on empty; touch controls |
| Audio | Separate master, effects, and ambience levels; the Sound switch mutes without losing the mix |
| HUD | HUD size from 85% to 130%; Standard / Compact detail; guidance level |

The aim path uses the simulation's solid-wall intersection math. It indicates cover, not hit probability, bullet range, or actor hits. Disabling **Reload when empty** stops the client from requesting an idle reload; pressing R or firing an empty magazine still starts a reload. Input is absolute mouse aim, so there is no artificial mouse-sensitivity multiplier or smoothing slider.

**F3** toggles actual rendered FPS, frame time, p95 frame time, the Canvas 2D backend, and backing-buffer dimensions. The frame cap does not change the simulation's fixed step or the co-op server's timing. Menus and paused rendering are capped at 30 FPS, and hidden-page drawing stops. A lower canvas resolution does not lower HUD text resolution or change cursor-to-world mapping.

Automatic rendering limits the pixel budget to about 1.6 million in Performance, 2.07 million in Balanced, or 5.3 million in High. At a 2560 × 1440 viewport and device-pixel ratio 1, Balanced Auto draws a 1920 × 1080 battlefield; 100% draws the full 2560 × 1440. The effects quality and explicit resolution controls are independent. Native DPR is bounded at 2, and the minimum render density is 0.5.

Rendering reuses the baked district, samples only the visible map rectangle, caches smoke and light textures, and reduces decorative particles by quality. Full-screen CSS grain compositing and backdrop blur were removed. Squad rows are retained, and unchanged HUD text and health values no longer rebuild the panel. Smoke visibility, night visibility, injury cues, actors, and objectives remain at every quality.

### Desktop verification

The 1.4 pass was compared with the published 1.3 build in the same foreground Linux Chromium test browser, using a Cordon/Story/leader scene with audio off. The 2560 × 1440 iframe had a genuine 2560 × 1440 layout and was scaled for inspection; the 1280 × 720 iframe was unscaled. These are browser-environment measurements, not a benchmark of the user's computer. Samples were taken after loading and settling; ordinary variation is expected.

| Viewport | Build / settings | Actual canvas buffer | Observed FPS |
| --- | --- | --- | --- |
| 2560 × 1440 | 1.3 baseline | 2560 × 1440 | 14.2 |
| 2560 × 1440 | 1.4 Balanced, full resolution | 2560 × 1440 | 30.1 |
| 2560 × 1440 | 1.4 Balanced, 75% (same density as new Auto) | 1920 × 1080 | 50.7 |
| 2560 × 1440 | 1.4 Performance, Auto | 1687 × 949 | 60.0 |
| 1280 × 720 | 1.3 baseline | 1280 × 720 | 54.5 |
| 1280 × 720 | 1.4 Balanced, Auto | 1280 × 720 | 60.0 |

Browser checks also covered scaled/compact HUD layout, changing settings and resetting them, mouse aiming and firing, holding movement while issuing Regroup, and portrait/landscape touch layouts. The desktop test does not establish high-refresh performance on a physical 120 Hz display or Internet co-op latency.

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
| F3 | Toggle frame-rate and render-resolution display |

Touch uses a full-screen battlefield with translucent controls. The left stick anchors near your thumb; drag gently to walk and to the outer edge to sprint. A light right-stick drag aims, and pushing farther fires. Sprint stops while aiming or assisting. By default, an empty magazine reloads automatically when ammunition remains; Settings can disable the idle reload request. Smoke and reload sit between the sticks; the contextual assistance button appears for nearby wounded people, rescue work, route obstructions, or self-bandaging. The Squad / Radio button opens a compact command panel; Move opens the district map with a visible Cancel action. Opening the map or field menu, changing touch mode, and rotating the phone release held input. The field menu can enable touch controls manually. Landscape and portrait layouts are supported. Reduce motion suppresses the drifting atmosphere.

Audio starts only after a user gesture, and can be disabled. Rifle and opposing-fire reports use distinct recorded samples, processed for distance and stereo position. A helicopter pass fades after the Cordon insertion. Recorded wind, footsteps, reload handling, and convoy engines remain quieter than nearby shots. Samples total approximately 530 KB and load asynchronously, with procedural fallback.

Squad members navigate around buildings and through open doorways, fire at visible armed opponents, and help downed teammates. The medic can recover either human player. Ammunition, smoke, and bandages are limited. Squad members who are down for too long can be lost. In solo, an unrecoverable player ends the mission; in co-op, the surviving player can continue after the other is lost. The shared mission fails when the whole squad is incapacitated or neither playable soldier can recover. Mission results emphasize survival, rescues, civilian harm, and completion time rather than kills.

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

The static `build` checks browser-module syntax and runs the simulation, input, renderer, settings, frame-pacing, and client tests. It deliberately excludes the server tests and does not require installing the server's `ws` dependency. `npm test` runs the complete 107-test suite, including actual WebSocket connections. `test:server` runs the backend and simulation regression tests used by the backend deployment.

The simulation is deterministic and independent of the DOM. The suite contains 19 original solo simulation tests, 11 co-op simulation tests, seven touch-input tests, ten client tests, 12 server tests, seven desktop-input/aim tests, nine renderer/camera tests, seven settings tests, seven frame-pacing/meter tests, 11 building/interior tests, and seven audio scene tests. Coverage includes all four mission routes, independent human movement, two remaining AI squad mates, command permissions, role exchange, AI recovery of either human, shared interaction progress, cohesion and extraction, disconnect takeover, authenticated reconnect, host promotion, expired rooms, stale controls, one-shot actions, snapshot recovery, and WebSocket/HTTP boundaries. Release browser checks cover two separate sessions creating and joining a room, four-person rosters, a member hosting while their friend leads, role swaps, local field menus, invite links, reload recovery, and mobile layouts at 390 × 844 and 844 × 390. The deployed WebSocket service was also checked with two real clients. These checks do not include a physical iPhone/Safari session.

## Farwake reuse and networking

The co-op transport reuses code from Daily Flyer's `feat/farwake-galaxy` branch at [commit `756fee9ba7456b028fda0dc714829edf33a713ed`](https://github.com/shnider42/daily_flyer/commit/756fee9ba7456b028fda0dc714829edf33a713ed):

- `public/snapshot-delta.mjs` reuses Farwake's lossless snapshot-delta codec.
- `server/timing.mjs` reuses Farwake's fixed-step scheduler.
- The room server adapts Farwake's authoritative simulation, authenticated session recovery, command validation, bounded input handling, and backpressure rules to private two-person CHALK rooms. A skipped send does not advance a client's delta baseline.
- The client adapts input coalescing, bounded local movement prediction, remote interpolation, and full-snapshot recovery to CHALK's movement, mission state, and role changes.

The server advances the shared simulation at 30 Hz, accepts controls at 30 Hz, and sends snapshots at 10 Hz. Combat, ammunition, AI, objectives, and role assignments remain server-owned; local prediction only smooths movement. Static city geometry is generated from the shared mission seed, while snapshots carry the current actors, objectives, and mutable world props. Online rooms are temporary and limited to two humans; public matchmaking, voice/text chat, and persistent remote saves are outside this version.

Files:

- `public/sim.mjs`: collision, navigation, combat, squad AI, civilians, and mission progression.
- `public/building-geometry.mjs`: deterministic doorways, walls, rooms, and shared solid geometry.
- `public/renderer.mjs`: original Canvas 2D artwork, cached city/interiors, roof cutaways, camera, effects, and map.
- `public/app.mjs`, `touch-input.mjs`, `desktop-input.mjs`, `index.html`, `style.css`: menus, input, HUD, and debrief.
- `public/settings.mjs`, `performance.mjs`: validated local preferences, rendering budgets, frame pacing, and diagnostics.
- `public/audio.mjs`: menu/mission audio scenes, recorded rifle, helicopter, wind and command/radio samples, with procedural foley and distant impacts. Source credits and CC0 licenses are in `public/audio/CREDITS.txt`.
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
