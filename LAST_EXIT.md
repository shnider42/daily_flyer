# LAST EXIT — v0.4

Original DailyFlyer game influenced by Driver 2 on PS1, with street takeovers inspired by later driving games. Port Meridian, three timed jobs, free driving, traffic, police and on-foot exploration. Original procedural assets/audio; no paid services or runtime downloads.

## This release

- Floating left-thumb stick and free right-thumb yaw/pitch camera. Outer stick runs on foot. A swipe that starts on a pedal or interaction button remains a look gesture. Pedals engage after a 140 ms stationary hold and can then be held while looking. Tap-release interaction, per-pointer capture, and clearing on pause/blur/rotation prevent stuck or accidental input. Desktop drag and keyboard camera alternatives remain available.
- Occupied traffic cars can be taken at a side door while slow/stopped. A 1.1 second door interaction can be cancelled by moving. The driver leaves and reports the theft. Vehicle body/mechanical damage persists across ownership changes. Cars brake for traffic signals, people, and vehicles ahead.
- Five distinct original landmarks: Clock Square, Union Depot, Iron Quay, Palm Court Motel and Mercer Gardens. A real diagonal Meridian Avenue cuts two blocks, with matching pavement openings and collision clearance. The full city map labels landmarks and marks the player, police, empty cars and job destination.
- Shared terrain heights drive the road mesh, wheels, shoes and camera. Two broad hills affect acceleration and walking speed. Three striped speed humps move damped suspension; crests can briefly unload the tyres. Eighteen pedestrians follow perimeter sidewalk routes and move away from a fast nearby car.
- Clock Square has twelve shallow steps and a 1.8 m terrace. Walking can climb the steps, cannot enter through the tall terrace side, and falls back to the ground when leaving an edge. Cars collide with the stair/terrace solids. Verticality is limited to this outdoor route; interiors and a citywide network of elevated paths are not implemented.
- Car contacts use oriented footprints and bilateral separation, momentum transfer and oblique yaw response. Traffic and parked vehicles can be pushed and damaged, including AI-to-AI contacts. This remains an arcade rigid-body approximation, not a full vehicle simulator.
- More severe directional crumpling, folded bonnet/boot, deep side dents, exposed metal, sagging bumpers, broken lights, cracked glass and smoke. Body condition is separate from engine/alignment condition: a battered car can still run. Hard front hits can make an engine sputter or stall; coupes are more vulnerable than wagons. Side impacts can pull the steering. Missions fail for a disabled engine, not cosmetic damage alone. Free-drive Recover repairs the current car.

## Controls

Desktop: WASD/arrows drive or walk; drag the view to look; Shift runs; Space handbrake; E exit/enter/take car; C recenter; V near/wide chase; J/L and I/K rotate camera; M map; R recover; Esc pause. Stop before exiting. Brake reverses after stopping.

Phone: lower-left floating stick steers or walks, outer edge runs. Hold GAS / BRAKE / DRIFT while driving. Drag the right side to look. Tap GET OUT, ENTER CAR or TAKE CAR as appropriate. CAM recenters. Tap CITY MAP for the street guide. Pause saves sensitivity, inverted vertical look, compact/roomy thumb spacing, wide camera and audio options. Both portrait and landscape are supported.

Mission checkpoints require a vehicle. Police pursue on foot too. Stay unseen eight seconds to lose them. Recover costs eight seconds in timed jobs. Focus loss pauses and clears input. Settings/records use localStorage with safe fallback. Audio unlocks on a user gesture.

## Source and validation

`dist/engine.js`: fixed-step simulation and collisions. `terrain.js`: shared ground, walk heights and suspension. `landmarks.js`: district meshes and traversal surfaces. `models.js`: vehicles, deformation and people. `textures.js`: deterministic atlas. `render.js`: WebGL and textured software fallback. `controls.js`: pure pointer and camera state. `game.js`: UI and lifecycle. `audio.js`: Web Audio.

`npm test`: 65 tests covering steering, missions, damage, finite geometry, safe gestures, camera, takeovers, signals, bilateral impacts, engine failures, hills, suspension, stairs and pedestrians. Render adds a public-file server check. GLES 2 shaders compile/link. Browser checks cover desktop and 430×832 portrait / 896×414 landscape layouts, action-button swipes, on-foot camera, pause/settings, the city map and takeover scenes. The cloud browser disables WebGL, so native GPU performance, simultaneous physical multitouch and physical iPhone Safari remain unverified.

## Deployment

GitHub `shnider42/daily_flyer`, branch `feat/last-exit-driving`. Assets: `daily_flyer/themes/last_exit_assets/`; Flask route `/last-exit/`, theme `last_exit`. The existing free Render Node service runs `server/last-exit/server.mjs`; build `node --test tests/last_exit/*.test.mjs`. It only serves the named game assets and `/health`. The private Sites mirror contains the same game. No additional services or paid resources.
