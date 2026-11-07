# NIGHT TRANSFER

A separate first-person prison escape in the Daily Flyer collection. The original escape has nine walkable 3D rooms across three acts: environmental observation, visual surveillance, and mechanical pressure control. **Dead Air / Wing 04** adds an independently selectable four-room communications annex. Solo play saves locally; private co-op supports up to four people. The original escape and Dead Air's Simple and Moderate guidance tiers are fully playable without sound. Dead Air's optional Expert tier requires listening to the receiver clue. Environmental sound starts off; no remote assets or account are required.

## Play

On a phone, use the **MOVE** stick with one thumb and drag the labeled **LOOK** pad with the other. Both controls work at the same time. A small stick movement walks slowly; moving it farther walks faster. You can also swipe the open scene to look. Approach an object and tap **Inspect**, or tap the nearby object itself.

On a computer, use **WASD** to move and your mouse to look. Mouse capture is enabled by default: click the scene, click **Click to look**, or press **L** to begin looking freely. The first scene click only captures the mouse. Once captured, aim the center reticle at a nearby object and press **E** or left-click to inspect it. **Escape** opens the menu and frees the cursor.

| Key | Action |
| --- | --- |
| **WASD** | Move through the room. |
| **Arrow keys** | Up/down move; left/right turn. |
| **E** | Inspect the nearby object under the reticle. |
| **C** or **Space** | Toggle crouching. |
| **N** | Open field notes. |
| **I** | Open pockets. |
| **H** | Open hints. A hint is spent only by choosing **Reveal next hint**. |
| **M** | Toggle sound while exploring. |
| **O** | Open Setup. |
| **L** | Capture the mouse for free look. |
| **Escape** | Free the cursor/open the menu, or close an open panel. On the completion screen, return to the title. |

Notes, puzzles and other panels release the cursor. Closing a panel keeps it released; click the scene or press **L** to capture again. The first-room **Find a way out** and pause-menu **Return to the room** buttons also capture from that click on a mouse-driven desktop. If capture is unavailable or denied, hold and drag to look and use **E** to inspect; the game remains playable. **Retry mouse look** can retry a denied request. Turn off **Capture mouse for free look** in Setup to keep drag-look as your preference.

Notes retain inspected clues, matching keys are used automatically, and each act has three optional hints.

Choose **Escape Together** to create a private team or join with a six-character code. Room views and movement are independent; puzzle progress and the hint allowance are shared. The new game lives entirely under `games/night-transfer`; it does not replace LOCKSTEP.

## Dead Air / Wing 04

Choose **Dead Air** on the title screen, or open the app with `?chapter=dead-air` to go directly to its chapter setup. The original escape also offers Dead Air after completion. It is a separate campaign: entering the annex does not replace the original three-act run, and finishing the original escape does not automatically start it.

The annex links four rooms into one harder deduction chain:

| Room | Equipment and task |
| --- | --- |
| **Archive** | Compare the current routing orders, correction ledger and superseded paperwork. Reconstruct the five-call-sign route to open its cabinet. |
| **Relay chamber** | Work from the accepted route and shared wiring feeds. Six switches control coupled carrier lamps. |
| **Listening room** | Recover five labeled two-tone packets, apply the written recovery protocol and authenticate the resulting code. |
| **Perimeter release** | Reconcile the accepted route, relay positions, receiver receipt and archive seal on four labeled dials. Both retained keys are needed at the final gate. |

A new Dead Air run changes its route, wiring, transmission and final checks. Resuming preserves that case. There is no countdown, and incorrect submissions do not consume hints or keys. Three optional hints cover the whole wing. Inspected evidence stays in Field notes; private working notes and unfinished combinations help when moving between a puzzle and its references.

### Guidance and receiver sound

**Moderate** is the default. Choose a tier in the chapter setup, through the in-game **Guidance** button, or from Setup. A change preserves the case, progress and hints already used.

| Tier | Assistance | Sound requirement |
| --- | --- | --- |
| **Simple** | Direct next steps, related evidence, target relay lamps and a transmission worksheet with raw digits. The route and corrections still need to be worked out. | None. Tone pairs and raw readings are visible. |
| **Moderate** | Broader direction and related evidence, with the transmission's two-tone notation visible. | None. Audio is an optional way to read the same clue. |
| **Expert** | The current objective and the original written evidence. Receiver packet call signs remain visible, but their tones must be recovered by listening. | Required for the receiver clue. |

The receiver can replay all five packets, one packet, or the LOW/MID/HIGH reference tones. Compare against those references; no absolute-pitch knowledge is needed. Playback is repeatable and never times out. Its in-world lamps and reels do not encode the hidden tone answers. For a noisy venue, muted device or inaccessible audio, switch to Simple or Moderate at any point to obtain the visual equivalent without restarting. Environmental ambience remains optional in every tier.

### Separate saves and shared chapters

The original solo escape uses `night-transfer.solo.v1`; Dead Air uses `night-transfer.annex.solo.v1`. Each can be continued independently from the title screen. Starting a new transmission replaces only the saved Dead Air run after confirmation. Controls, sound and guidance remain local preferences in `night-transfer.settings.v1`.

Choose **Enter with a crew** from Dead Air, or select **Dead Air · Communications annex** when creating a team. Joining a room code uses that team's chapter and case. Up to four people share inventory, accepted puzzle records, progress and the three-hint allowance, while moving independently. Each player can choose a different guidance tier and audio setting. Co-op does not overwrite either solo save; the existing reconnect and server-memory lifetime rules below still apply.

## Controls and sound

Open **Setup** from the title screen or during an escape. The three tabs apply changes immediately:

| Tab | Available settings |
| --- | --- |
| **Controls** | Mouse capture, look sensitivity and inverted vertical look; touchscreen button size, movement-stick size, control visibility, swapped thumb controls and look-guide visibility. |
| **Sound** | Optional prison sound, master volume, background-atmosphere level and a short door-echo preview. |
| **View** | Brightness and reduced motion. |

Setup shows mouse controls first on a desktop and thumb controls first on a phone, with the other input settings available in an expandable section. The default thumb layout puts movement on the left and looking on the right. **Swap thumb controls** reverses it. The movement stick defaults to 88 CSS pixels and can be adjusted from 84 to 124. Button size ranges from 85% to 135%, look sensitivity from 0.5× to 2×, and control visibility from 40% to 100%. **Reset controls** restores only the control preferences, including mouse capture; it keeps sound and view choices.

The title screen, first-room introduction and game HUD offer a **Sound** toggle. Sound is off by default. Enabling it is an explicit choice; a browser gesture starts or resumes audio. If the browser requires another gesture, **Resume sound** is available in the Sound tab. Muting keeps the chosen volume and atmosphere mix for next time. Master volume defaults to 60% and background atmosphere to 55%; both can be reduced to zero.

Sound is generated locally. Footsteps follow actual movement and use six cached heel, toe and scuff variations for each stone, tile and metal floor; crouching softens and filters them. Three ambient layers have different loop lengths and slowly drifting levels. Short stereo reflections and a damped tail vary between cells, tiled rooms, offices, machinery spaces and outdoors. Distant murmurs use irregular phrases, breaths and pauses. Environmental events vary their samples and avoid repeating the same type consecutively. Distant events stay anchored in the room and pan as you turn your head.

Environmental sound contains no puzzle instructions. The original three acts remain fully visual, including every camera interval and sequence. Dead Air's receiver adds a repeatable signal: its Simple and Moderate tiers provide a visual equivalent, while Expert requires hearing the tones. Sound pauses on the title screen, in the pause menu, and when the page is hidden. Receiver playback also stops when its panel closes or the room changes. The Sound tab can briefly preview a door echo from the title screen without starting an escape.

Preferences are stored independently from the solo save. Changing controls or muting does not use hints, alter keys, send co-op puzzle actions or replace an existing solo run. A team shares progress, while each player keeps their own controls and sound preferences. Existing settings migrate in the same preference slot: saved phone, view and audio choices are retained, and the new mouse-capture preference defaults to on. Saved settings from the original visual-only version receive the new defaults with sound still off. A later choice to use drag-look is retained on reload.

The mobile layout targets a 428 × 926 CSS-pixel portrait viewport, with landscape support. The runtime uses safe-area insets and dynamic viewport units; browser UI and installed-home-screen modes can expose different usable areas.

## Run and verify

Run from this directory with Node 22 or later:

```sh
npm run dev
npm test
node server.mjs --port 3000
```

The server serves `public/` and `/ws` on the same origin, listens on `0.0.0.0`, and accepts `PORT` or `--port`. `/health` reports readiness. There are no package installs: the included `ws` package carries its MIT license.

Tests cover the full legal campaign, multiplayer state and reconnect behavior, actual movement-input handling, audio lifecycle, settings validation and controller integration. Controller tests execute the real app and settings functions with DOM, rendering, audio-output and transport stubs. They verify bounded slider values, preference migration/reloads, touch-pad wiring, desktop shortcut routing, mouse release on panels and completion, explicit recapture, drag-look fallback, optional mute behavior and preservation of solo/co-op progress. An integration case also runs the real controls module alongside the app to check pointer-unlock and Escape event order: one browser Escape cannot both open and dismiss Pause. Detailed input and pointer-lock lifecycle cases are covered separately by the controls tests. These tests do not claim a physical iPhone or Safari rendering test.

Dead Air adds tests for seeded cases, accepted records and guidance filtering. Scene tests build all thirteen rooms through the real Three.js scene graph and software-renderer geometry path; they verify collision-safe approaches and unobstructed inspection within 2.6 metres for all 23 annex objects. They also check accepted-state indicators and that Expert receiver art is independent of the case's hidden tones. Their drawing surface is stubbed, so these checks complement browser visual review rather than claiming to replace it.

## Preference, control and audio modules

`public/settings.js` exports `DEFAULT_SETTINGS`, `SETTING_RANGES`, `normalizeSettings(raw, reducedDefault)`, `loadSettings(storage, reducedDefault)` and `saveSettings(storage, value)`. Numeric values must be finite numbers and are clamped to their permitted ranges. Boolean options require actual booleans. Guidance accepts `simple`, `moderate` or `expert` and defaults to `moderate`. Invalid or unavailable storage falls back to defaults; unsuccessful writes return `false`. The preference slot is `night-transfer.settings.v1`, separate from both solo-save slots.

`FirstPersonControls` owns movement, touch input, keyboard shortcuts and mouse capture. The app supplies `onInteract`, `onPause`, `onShortcut` and `onMouseLook` callbacks. `setMouseLookEnabled(bool)` applies the preference, `requestMouseLook()` requests capture from a user gesture, `releaseMouseLook()` releases it, and `mouseLookLocked` reports whether this canvas owns the lock. Disabling controls releases capture and clears held input. A deliberate release for a panel does not open a second pause menu. The app retains responsibility for which panel a shortcut opens and for keeping hint use behind its explicit reveal button.

`PrisonAudio` owns sound generation and browser-audio lifecycle, but does not read or write preferences. The app supplies `setEnabled`, `setVolume`, `setAtmosphere`, `setRoom` and `setActive` updates. `unlock()` is called directly from a user gesture. The game loop passes `update({dt, pose, room})`; `pose.yaw` orients distant events relative to the listener. Successful interactions can call `cue(kind)`. The `onStatus` callback reports availability and whether a new gesture is needed. No audio status changes the authoritative escape state.

Receiver playback uses `playPuzzleSignal(packets, options)`, `playPuzzleTone(tone, options)` and `stopPuzzleSignal(reason)`. The app passes tone data only to audio; Expert presentation receives the filtered object view without tone labels or raw digits. `public/annex.mjs` generates the repeatable case and its public clue views; `world.mjs` remains authoritative for puzzle acceptance, keys and campaign progression. The first-person renderer keeps the original movement, focus and collision API and adds the four annex room themes and their procedural equipment.

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

- `create(name, {campaign})` and `join(code, name)` start asynchronous connections. Omit the options or use `campaign: 'escape'` for the original run; use `campaign: 'annex'` for Dead Air. The server chooses the new annex case. Team codes have six characters, and joining uses the existing team's campaign.
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
