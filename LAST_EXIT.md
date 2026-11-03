# LAST EXIT — v0.5

Original DailyFlyer game influenced by Driver 2 on PS1, with street takeovers inspired by later driving games. Port Meridian, three timed jobs, free driving, traffic, police and on-foot exploration. Original procedural assets/audio; no paid services or runtime downloads.

## This release

- Soft chase follows the vehicle while holding pedals. Deliberate looking temporarily overrides follow; walking also gets gentle follow with a stable movement direction. Exiting/entering recenters the camera, and on-foot orbits retract before nearby cars.
- Quieter HUD with a small local map, compact speed/condition display and a contextual entry/exit button. Pause contains recovery, controls and settings. Full-map landmark buttons set a destination.
- 113 occupied traffic vehicles across seven silhouettes: sedan, coupe, wagon, hatchback, pickup, delivery van and taxi. Vehicle sizes, weights and performance differ. Traffic can make curved turns at junctions; distant cars use lightweight geometry.
- Safari gesture protection uses non-passive native touch handlers on Pointer Event game surfaces during play, in addition to CSS touch-action. Quick pedal taps produce 120 ms pulses; swipes cannot trigger them. Menu/settings scrolling and pinch zoom remain available outside play. Physical iPhone Safari verification is still required.
- Police track observed positions, search the last sighting, add backup during prolonged pursuit and return to patrol after escape. The second cruiser can lead a visible moving car. Full-body collisions damage cruisers; engine-disabled units cannot chase, spot or arrest. Siren volume follows distance. This is an initial arcade pursuit system, without roadblocks or officers leaving cars.
- Up to ten persistent localized dents distinguish corner strikes from centered impacts. Severe side damage can bend wheels, squash their lower profile and remove sedan-family mirrors. Loose bumper ends move with driving. Body and mechanical damage remain separate.

- Floating left-thumb stick and free right-thumb yaw/pitch camera. Outer stick runs on foot. A swipe that starts on a pedal or interaction button remains a look gesture. Pedals engage after a 140 ms stationary hold and can then be held while looking. Tap-release interaction, per-pointer capture, and clearing on pause/blur/rotation prevent stuck or accidental input. Desktop drag and keyboard camera alternatives remain available.
- Occupied traffic cars can be taken at a side door while slow/stopped. A 1.1 second door interaction can be cancelled by moving. The driver leaves and reports the theft. Vehicle body/mechanical damage persists across ownership changes. Cars brake for traffic signals, people, and vehicles ahead.
- Seven distinct original landmarks: Clock Square, Union Depot, Iron Quay, Palm Court Motel, Mercer Gardens, Bayline Service and Foundry Row. The new forecourt and market alley have matching collision openings. A real diagonal Meridian Avenue cuts two blocks, with matching pavement openings and collision clearance. The full city map labels landmarks and marks the player, police, empty cars and job destination.
- Shared terrain heights drive the road mesh, wheels, shoes and camera. Two broad hills affect acceleration and walking speed. Three striped speed humps move damped suspension; crests can briefly unload the tyres. Forty-four pedestrians use sidewalk and crossing routes, move away from fast cars, and stumble or fall after a vehicle impact. The stationary on-foot player can also be hit, knocked back and briefly stunned before recovering. Swept car contact catches crossings between simulation positions; raised floors are excluded.
- Clock Square has twelve shallow steps and a 1.8 m terrace. Walking can climb the steps, cannot enter through the tall terrace side, and falls back to the ground when leaving an edge. Cars collide with the stair/terrace solids. Verticality is limited to this outdoor route; interiors and a citywide network of elevated paths are not implemented.
- Car contacts use oriented footprints and bilateral separation, momentum transfer and oblique yaw response. Traffic and parked vehicles can be pushed and damaged, including AI-to-AI contacts. This remains an arcade rigid-body approximation, not a full vehicle simulator.
- More severe directional crumpling, folded bonnet/boot, deep side dents, exposed metal, sagging bumpers, broken lights, cracked glass and smoke. Body condition is separate from engine/alignment condition: a battered car can still run. Hard front hits can make an engine sputter or stall; coupes are more vulnerable than wagons. Side impacts can pull the steering. Missions fail for a disabled engine, not cosmetic damage alone. Free-drive Recover repairs the current car.

## Controls

Desktop: WASD/arrows drive or walk; drag the view to look; Shift runs; Space handbrake; E exit/enter/take car; C recenter; V near/wide chase; J/L and I/K rotate camera; M map; R recover; Esc pause. Stop before exiting. Brake reverses after stopping.

Phone: lower-left floating stick steers or walks, outer edge runs. Tap GAS / BRAKE / DRIFT for a short pulse, or hold while driving. Drag the right side to look. Tap GET OUT, ENTER CAR or TAKE CAR as appropriate. The circular arrow recenters. Tap the minimap for the street guide and destinations. Pause saves sensitivity, inverted vertical look, compact/roomy thumb spacing, wide camera and audio options. Both portrait and landscape are supported.

Mission checkpoints require a vehicle. Police pursue on foot too. Stay unseen eight seconds to lose them. Recover costs eight seconds in timed jobs. Focus loss pauses and clears input. Settings/records use localStorage with safe fallback. Audio unlocks on a user gesture.

## Source and validation

`dist/engine.js`: fixed-step simulation and collisions. `vehicles.js`: vehicle dimensions and handling profiles. `terrain.js`: shared ground, walk heights and suspension. `landmarks.js`: district meshes and traversal surfaces. `models.js`: vehicles, deformation and people. `textures.js`: deterministic atlas. `render.js`: WebGL and textured software fallback. `controls.js`: pure pointer and camera state. `game.js`: UI and lifecycle. `audio.js`: Web Audio.

`npm test` covers steering, missions, localized damage, finite geometry, Safari gesture guards, held-pedal chase, walking follow, takeovers, signals, junction turns, bilateral impacts, player/NPC contact, police search/disabled units, engine failures, hills, suspension and stairs. Render adds a public-file server check including every game module. GLES 2 shaders compile/link. Browser checks cover desktop and 430×832 portrait / 896×414 landscape layouts, pedal swipes, on-foot view, pause/settings and landmark navigation. The cloud browser disables WebGL, so native GPU performance, simultaneous physical multitouch and physical iPhone Safari remain unverified.

## Deployment

GitHub `shnider42/daily_flyer`, branch `feat/last-exit-driving`. Assets: `daily_flyer/themes/last_exit_assets/`; Flask route `/last-exit/`, theme `last_exit`. The existing free Render Node service runs `server/last-exit/server.mjs`; build `node --test tests/last_exit/*.test.mjs`. It only serves the named game assets and `/health`. The private Sites mirror contains the same game. No additional services or paid resources.
