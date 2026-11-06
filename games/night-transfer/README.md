# NIGHT TRANSFER

A separate first-person prison escape in the Daily Flyer collection. Built as nine walkable 3D rooms across three acts: environmental observation, visual surveillance, and mechanical pressure control. Solo play saves locally; private co-op supports up to four people. Every required clue and warning is visual. Optional sound adds footsteps, echoes and activity beyond the room; sound starts off. The game has no audio dependency, remote asset dependency, or account requirement.

## Play

On a phone, use the **MOVE** stick with one thumb and drag the labeled **LOOK** pad with the other. Both controls work at the same time. A small stick movement walks slowly; moving it farther walks faster. You can also swipe the open scene to look. Approach an object and tap **Inspect**, or tap the nearby object itself. On a computer, use **WASD**, drag to look, and press **E** to inspect; arrow keys also move and turn. **C** toggles crouching. Notes retain inspected clues, matching keys are used automatically, and each act has three optional hints.

Choose **Escape Together** to create a private team or join with a six-character code. Room views and movement are independent; puzzle progress and the hint allowance are shared. The new game lives entirely under `games/night-transfer`; it does not replace LOCKSTEP.

## Phone setup and sound

Open **Setup** from the title screen or during an escape. The three tabs apply changes immediately:

| Tab | Available settings |
| --- | --- |
| **Controls** | Button size, movement-stick size, look sensitivity, control visibility, swapped thumb controls, look-guide visibility and inverted vertical look. |
| **Sound** | Optional prison sound, master volume, background-atmosphere level and a short door-echo preview. |
| **View** | Brightness and reduced motion. |

The default thumb layout puts movement on the left and looking on the right. **Swap thumb controls** reverses it. The movement stick defaults to 88 CSS pixels and can be adjusted from 84 to 124. Button size ranges from 85% to 135%, look sensitivity from 0.5× to 2×, and control visibility from 40% to 100%. **Reset controls** restores only the control preferences; it keeps sound and view choices.

The title screen, first-room introduction and game HUD offer a **Sound** toggle. Sound is off by default. Enabling it is an explicit choice; a browser gesture starts or resumes audio. If the browser requires another gesture, **Resume sound** is available in the Sound tab. Muting keeps the chosen volume and atmosphere mix for next time. Master volume defaults to 60% and background atmosphere to 55%; both can be reduced to zero.

Sound includes locally generated room ambience, footsteps based on actual movement, and optional interaction effects. No clue, camera interval, sequence or solution depends on hearing. Sound pauses on the title screen, in the pause menu, and when the page is hidden. The Sound tab can briefly preview a door echo from the title screen without starting an escape.

Preferences are stored independently from the solo save. Changing controls or muting does not use hints, alter keys, send co-op puzzle actions or replace an existing solo run. A team shares progress, while each player keeps their own controls and sound preferences. Saved settings from the original visual-only version receive the new defaults with sound still off.

The mobile layout targets a 428 × 926 CSS-pixel portrait viewport, with landscape support. The runtime uses safe-area insets and dynamic viewport units; browser UI and installed-home-screen modes can expose different usable areas.

## Run and verify

Run from this directory with Node 22 or later:

```sh
npm run dev
npm test
node server.mjs --port 3000
```

The server serves `public/` and `/ws` on the same origin, listens on `0.0.0.0`, and accepts `PORT` or `--port`. `/health` reports readiness. There are no package installs: the included `ws` package carries its MIT license.

Tests cover the full legal campaign, multiplayer state and reconnect behavior, actual movement-input handling, audio lifecycle, settings validation and controller integration. Controller tests execute the real app and settings functions with DOM, rendering, audio-output and transport stubs. They verify bounded slider values, preference reloads, touch-pad wiring, menu-safe settings closure, optional mute behavior and preservation of solo/co-op progress. They do not claim a physical iPhone or Safari rendering test.

## Preference and audio modules

`public/settings.js` exports `DEFAULT_SETTINGS`, `SETTING_RANGES`, `normalizeSettings(raw, reducedDefault)`, `loadSettings(storage, reducedDefault)` and `saveSettings(storage, value)`. Numeric values must be finite numbers and are clamped to their permitted ranges. Boolean options require actual booleans. Invalid or unavailable storage falls back to defaults; unsuccessful writes return `false`. The preference slot is `night-transfer.settings.v1`, separate from `night-transfer.solo.v1`.

`PrisonAudio` owns sound generation and browser-audio lifecycle, but does not read or write preferences. The app supplies `setEnabled`, `setVolume`, `setAtmosphere`, `setRoom` and `setActive` updates. `unlock()` is called directly from a user gesture. The game loop passes `update({dt, pose, room})`, and successful interactions can call `cue(kind)`. The `onStatus` callback reports availability and whether a new gesture is needed. No audio status changes the authoritative escape state.

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
