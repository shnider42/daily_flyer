# LAST EXIT — v0.2

Original DailyFlyer driving game inspired by Driver 2 on PS1. Explore fictional Port Meridian in a sedan, coupe or wagon, leave a stopped vehicle, walk or run through the city and enter parked cars. Cars stay where you leave them. Original geometry, procedural textures and audio; no copied game assets.

## Play

- Free drive: explore and switch cars; hard traffic collisions can attract a patrol.
- The pickup: stop at the motel, lose two cruisers, reach the waterfront garage (3 minutes).
- Heat check: break sight for eight seconds and reach the garage (2:30).
- Last delivery: four checkpoints in order (1:50).

Drive with WASD/arrows, Space for the handbrake, E to get out or enter a nearby parked car, C for camera, R to recover and Escape to pause. You must stop before getting out. On foot, WASD/arrows move relative to the camera and Shift runs. Mission driving checkpoints require a vehicle. Police keep tracking you on foot.

On phones, drag the left pad to steer and hold GAS. BRAKE reverses after stopping; DRIFT applies the handbrake. Tap GET OUT after stopping. The left stick then moves in all directions, RUN increases speed, and ENTER CAR appears near parked vehicles. Steering signs now match the chase camera: right input turns right. Pointer capture, cancellation and blur handling prevent held inputs after interruption. Landscape provides the widest view.

## Presentation

Muted brick and concrete facades, individual windows and storefronts, power lines, elevated rail girders, a water tower and boxy period cars. Low internal resolution, snapped projected vertices, coarse procedural materials, quantized color and short-distance fog provide the PS1 influence. The on-foot character has a simple walking animation. Audio is an original procedural groove with engine, tyre, collision, footstep and siren effects, unlocked by user input.

## Architecture and verification

- `dist/engine.js`: deterministic fixed-step driving/on-foot simulation, parked vehicles, collisions, missions and pursuit.
- `dist/controls.js`: pure joystick coordinates and steering normalization.
- `dist/render.js`: native WebGL rendering and a depth-buffered Canvas fallback.
- `dist/game.js`: UI, pointer/keyboard input, minimap, pause lifecycle and local settings/records.
- `dist/audio.js`: gesture-unlocked Web Audio effects and music.
- Run `npm test`: 28 gameplay/control checks, including both steering directions at four headings, phone-size joystick coordinates, safe exit, walking collisions, running, car switching and pursuit continuity.
- Browser QA: desktop and 430x832 portrait / 896x414 landscape layouts; start, exit, on-foot joystick movement, re-entry and pause. The cloud browser has WebGL disabled, so these visual checks used the Canvas fallback. Physical iPhone Safari, WebGL output/performance and simultaneous multi-touch still need device testing.

No paid services, CDN scripts, downloaded models, remote fonts or runtime network dependencies. This remains a solo prototype with a flat city and three jobs. Traffic follows the grid; car switching currently supports stopped parked vehicles. No moving traffic hijacking, interiors, jumping, replay or multiplayer.

## DailyFlyer integration

GitHub: `shnider42/daily_flyer`, branch `feat/last-exit-driving`.
The canonical DailyFlyer assets are in `daily_flyer/themes/last_exit_assets/`; the Flask route is `/last-exit/` and theme is `last_exit`. The private Sites project mirrors the static game from this checkout.

The public Render deployment uses the existing free Node web service with `server/last-exit/server.mjs`. Build: `node --test tests/last_exit/*.test.mjs`. Start: `node server/last-exit/server.mjs`. It serves only eight known public assets and `/health`; free-service cold starts apply. The DailyFlyer tests add a file-server check to the 28 gameplay/control checks.
