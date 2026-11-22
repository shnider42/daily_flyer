# Pocket Volleyball

A standalone Daily Flyer beach volleyball game: two players per side, a clear view of the whole court, and short bump–set–spike rallies. Tideline and Sunbreak can play solo, on one screen, or in a private two-person online room. The artwork is drawn with Canvas 2D; sound effects are synthesized after a user gesture. There are no external art downloads or music tracks.

## Play

| Mode | Players and teammates |
| --- | --- |
| Solo | You control Tideline with an AI partner against two AI opponents. Control follows the useful receiver, with a manual switch available. |
| Local versus | Two people on one screen control opposing teams, each with an AI partner. Use a shared keyboard or gamepads. |
| Local co-op | Two people control one Tideline player each against the AI. Player ownership stays fixed. |
| Online versus | Two devices join the same room and control opposing teams, each with an AI partner. |
| Online co-op | Two devices control one Tideline player each against the AI. |

For online play, create a room, share its link or six-character code, and have the second player join. Player 1 starts the match and can request a rematch. Separate phones work through the online modes; shared-screen keyboard and gamepad controls support local two-player play.

Matches are best of three sets. Choose **11 points** (the default) or **21 points**; every set requires a two-point margin. A deciding third set is always to 11. Either team can win a point on any rally, and the point winner serves next. A point has a brief reset; sets advance automatically after a short break.

### On the court

- **Pass / Set** serves, receives the first touch, sets the second, and sends a third touch over the net. Holding the action prepares the contact, so a perfectly timed tap is unnecessary.
- **Spike** serves harder or attacks the opposing court. Movement direction at contact influences placement; releasing the stick allows an open-court target.
- **Dive / Block** stretches for a low save or jumps to block when near the net and a high incoming ball.
- **Switch** changes your active teammate in solo or versus. Co-op keeps each person on their own player.

The ball shadow and landing ring make its height and destination readable. Each team has up to three touches. A grounded ball, an out ball, a shot into the net, or an illegal fourth touch ends the rally. The arcade contact system prevents a repeated touch by the same player and accidental extra contact with an outgoing shot.

Choose **Chill**, **Club**, or **Pro** opponents. Difficulty changes movement, reactions, shot placement, and defensive mistakes; stronger opponents also use occasional planned blocks.

## Controls

| Action | Player 1 / online player | Local Player 2 | Gamepad |
| --- | --- | --- | --- |
| Move | WASD; arrow keys also work outside local two-player play | Arrow keys | Left stick |
| Pass, set, serve | J or Space | Comma or Numpad 1 | A |
| Spike / power serve | K | Period or Numpad 2 | B |
| Dive / block | L | Slash or Numpad 3 | X |
| Switch teammate | Q; I also works | Right Shift or Numpad 0 | Y |
| Pause | Escape or the on-screen pause button | On-screen pause button | On-screen pause button |

On touchscreens, use the left thumbstick and right action buttons. The court turns vertically in portrait orientation; movement follows the screen orientation. Controls occupy their own space beneath the court, with safe-area spacing. Landscape uses the wider court view.

**Simple** guidance shows contextual instructions, landing help, and forgiving assisted contacts. **Moderate** reduces the instructions while retaining assistance. **Expert** hides the landing help and uses manual contact rules in local play. Online matches use the same assisted rules for both players; each person can still choose how much guidance to display.

Sound effects can be switched off. There is no music.

## Pausing, reconnecting, and storage

Local matches pause from the menu or when the page loses focus. A local match exists only in the open page: reloading or restarting starts a new match. Difficulty, match length, guidance, and sound preferences are saved in this browser's `localStorage`.

Online matches pause when a participant disconnects or the server stops receiving that participant's input updates for 1.5 seconds. Both players must choose **Ready** before play resumes. Stale held movement is cleared after 250 ms. A disconnected seat is reserved for 90 seconds; a private reconnect credential in `sessionStorage` restores the same seat after a brief interruption or refresh. The invitation link contains only the room code, never that credential.

Online rooms and match state are held in server memory. A server restart or deployment ends active rooms; abandoned rooms expire. A room code is an invitation mechanism, so someone with a valid code can fill an available seat. This version has no accounts, email collection, chat, analytics scripts, or persistent player records.

## Run locally

Requires Node.js 22 or newer. From the Daily Flyer repository root:

```sh
npm ci --prefix games/pocket-volleyball
npm test --prefix games/pocket-volleyball
node games/pocket-volleyball/server.mjs
```

Open `http://localhost:3000`. The server binds `0.0.0.0`, reads `PORT`, and defaults to port `3000`.

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Game and local-play interface |
| `GET /health` | Bounded readiness summary, version, room count, and simulation rates |
| `/ws` | Same-origin WebSocket room, input, and match-state protocol |

## Architecture

- `public/sim.mjs` owns the deterministic, DOM-free rules and physics. Local play steps the same simulation that the multiplayer server uses.
- `server.mjs` owns online room membership, authority, reconnect credentials, pause agreement, and input validation. It runs the simulation at 60 Hz and sends snapshots at 20 Hz. Clients send inputs at 30 Hz, with short taps buffered until the next update; they never supply authoritative positions or scores.
- `public/app.mjs` manages menus, keyboard/touch/gamepad input, preferences, online sessions, and interpolated presentation.
- `public/renderer.mjs` draws the court, players, ball height, effects, and responsive orientation. Canvas sizing uses the current CSS dimensions and bounded device density rather than repeatedly scaling an existing buffer.
- `public/audio.mjs` supplies optional synthesized effects.

The server bounds room and connection counts, message size and rates, input sequences, static-file paths, and socket backpressure. Online rooms use one server process; adding instances would require shared room routing and authority.

## Verification

The 18 focused automated tests cover simulation outcomes and real HTTP/WebSocket sessions: controller ownership, movement, serving, bump–set–spike flow, assistance, dives and blocks, scoring faults, win-by-two and match progression, deterministic snapshots, complete AI matches, human-controller rally play, room creation/joining, shared state, pause/resume, reconnect credentials, input validation, and request boundaries.

Browser checks have exercised solo play, touch serving, desktop and portrait/landscape layouts, and two online clients sharing a rally. A physical iPhone/Safari session and physical gamepad verification remain outstanding. Production deployment verification is a separate release step.

## Render deployment target

This game belongs to `shnider42/daily_flyer` on its dedicated `feat/pocket-volleyball` branch. It is a native Render web service, independent of the other DFE game entry points.

| Setting | Value |
| --- | --- |
| Service name | `dfe-pocket-volleyball` |
| Runtime | Node |
| Branch | `feat/pocket-volleyball` |
| Build command | `npm ci --prefix games/pocket-volleyball && npm test --prefix games/pocket-volleyball` |
| Start command | `node games/pocket-volleyball/server.mjs` |
| Health endpoint | `/health` |
| Region | Virginia |
| Compute plan | Free |
| Instances | One |

Confirm the deployed commit, terminal deployment status, health response, and public game behavior before marking a release live.
