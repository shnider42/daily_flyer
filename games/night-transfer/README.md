# NIGHT TRANSFER

A separate first-person prison escape in the Daily Flyer collection. Built as nine walkable 3D rooms across three acts: environmental observation, visual surveillance, and mechanical pressure control. Solo play saves locally; private co-op supports up to four people. Every required clue and warning is visual. The game has no audio dependency, remote asset dependency, or account requirement.

## Play

On a phone, move with the left thumb stick and swipe the scene to look. Approach an object and tap **Inspect**, or tap the nearby object itself. On a computer, use **WASD**, drag to look, and press **E** to inspect; arrow keys also move and turn. **C** toggles crouching. Notes retain inspected clues, matching keys are used automatically, and each act has three optional hints. Brightness and look sensitivity are available in Settings.

Choose **Escape Together** to create a private team or join with a six-character code. Room views and movement are independent; puzzle progress and the hint allowance are shared. The new game lives entirely under `games/night-transfer`; it does not replace LOCKSTEP.

## Run and verify

Run from this directory with Node 22 or later:

```sh
npm run dev
npm test
node server.mjs --port 3000
```

The server serves `public/` and `/ws` on the same origin, listens on `0.0.0.0`, and accepts `PORT` or `--port`. `/health` reports readiness. There are no package installs: the included `ws` package carries its MIT license.

## Browser interface

```js
import { CoopClient } from './network.js';
const team = new CoopClient({
  onState(state, meta) {},
  onStatus(status, detail) {},
  onRoster(roster) {},
  onMessage(message) {},
  onPoses(poses, meta) {},
});
```

- `create(name)` and `join(code, name)` start asynchronous connections. Team codes have six characters.
- `reconnect()` resumes the saved seat. `leave()` releases it; `destroy()` also removes browser listeners.
- `sendAction(action)` returns its action ID, or `null` when it could not be sent. `onMessage` receives `{type:'action-result', actionId, ok, message, revision}`. Keep pending UI keyed by action ID.
- `presence({room, x, z, yaw, crouch})` accepts the latest locally simulated position and coalesces updates to at most ten per second. A room ID string is also accepted.
- Getters: `connected`, `code`, `roomCode`, `playerId`, `session`, `resumeInfo`, `serverNow`, `latency`. `serverNow` is synchronized epoch milliseconds; `session` exposes `{code,id,name}` without its reconnect token.
- `onState` metadata includes `initial`, `revision`, `serverTime`, and for changes `actorId`, `event`, `message`.
- Roster entries: `{id,name,slot,connected,room}`. Slots are 1–4.
- Position entries: `{id,room,x,z,yaw,crouch,serverTime}`. `onPoses` receives the current connected players with known positions. It never carries puzzle state.
- `samplePoses()` returns interpolated remote positions using two snapshots and a 100 ms interpolation delay. It omits the local player. Call from the render loop, or handle interpolation in the renderer using `onPoses`.

Movement and each player's camera remain local. Shared inventory, clues, hints and puzzle progression are changed only by the server reducer. Pending actions reuse their IDs after reconnect and are deduplicated. Seats remain reserved for 90 seconds after a disconnect. No player has special host privileges; any teammate can continue after another leaves.

Active rooms are kept in server memory. A process restart ends co-op runs. Rooms expire after one hour without activity or six hours total. Use one service process for this version; multiple instances would need shared room storage and routing. Solo saves belong to the app and are never touched by this transport.
