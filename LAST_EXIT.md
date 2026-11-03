# LAST EXIT — v0.3

Original DailyFlyer driving game influenced by Driver 2 on PS1. Fictional Port Meridian, three jobs, free driving, traffic, police pursuit, on-foot exploration and parked-car switching. Original procedural assets and audio; no paid services or runtime network dependencies.

## v0.3 graphics and damage rebuild

- Replaced box-built vehicles and character with shaped low-poly geometry: curved body sections, open wheel arches, circular tyres/rims, sloped glass, trim, mirrors and proportioned articulated limbs. Sedan, coupe and wagon retain distinct rooflines.
- New 1024x1024 original texture atlas: masonry facades, windows, shop fronts, signage, asphalt and paving. Perspective-correct texture sampling in both WebGL and the software fallback. Removed screen-space grain, color crushing and vertex snapping.
- Higher internal render resolution: WebGL 540p landscape / 720p portrait; software fallback 360p / 480p. Three batched render passes at most (world, vehicles, translucent effects).
- Directional impact damage follows the struck panel. Body sections and bumpers crumple, hood/trunk buckle, lamps break, glass cracks and side panels scrape. Damage remains with each vehicle after switching cars. Engine smoke and brief impact sparks reflect damage.
- Full oriented vehicle footprints replace circular vehicle collisions, preventing the long nose from passing through a wall before the centre hits it. Camera retracts smoothly around buildings; no overhead teleport. Sealed mesh joins and separated decorative layers address holes and depth flicker.
- A totaled car remains damaged in free drive until recovered or abandoned. Recovery repairs only the current vehicle. Driving jobs retain the existing wreck failure.
- On-foot CAM/C rotates the view; button pointer captures reset on pause. HUD includes numeric damage.

## Controls

WASD/arrows drive; Space handbrake; E get out/enter nearby parked car; C camera; R recover; Escape pause. Brake reverses after stopping. You must stop before getting out. On foot, WASD/arrows move relative to the camera and Shift runs.

On phones, drag the left pad to steer, hold GAS, use BRAKE to stop/reverse and DRIFT for the handbrake. Stop and tap GET OUT. The left stick then moves in all directions; hold RUN and use ENTER CAR beside a parked vehicle. CAM rotates the walking view. Landscape provides the widest view.

- Free drive: no clock. Explore, change cars, and practice. Hard traffic collisions can attract a patrol.
- The pickup: stop at the motel, lose two cruisers, reach the waterfront garage (3 minutes).
- Heat check: stay unseen for eight seconds, then reach the garage (2:30).
- Last delivery: four checkpoints in order (1:50).

Mission checkpoints require a vehicle. Police continue pursuing on foot. Recovery costs eight seconds on timed jobs. Tab hiding or focus loss pauses and clears input. Settings and best times use localStorage with a safe fallback. Audio starts inside a user gesture; original procedural music, engine, tyres, collisions, footsteps and siren.

## Source and verification

- `dist/engine.js`: fixed-step driving/walking simulation, directional damage, oriented contacts, camera clearance, missions and pursuit.
- `dist/models.js`: original vehicle and character geometry, deformation and details.
- `dist/textures.js`: deterministic original atlas generated locally at startup.
- `dist/render.js`: native WebGL, textured depth-buffered Canvas fallback, camera and effects.
- `dist/controls.js`: pure joystick coordinates and steering normalization.
- `dist/game.js`: UI, input, minimap, lifecycle and local records.
- `dist/audio.js`: gesture-unlocked Web Audio.

`npm test`: 39 checks including steering signs, safe car entry/exit, walking/collision, damage direction and persistence, wreck behavior, full vehicle contacts, camera retraction, and finite model geometry at extreme damage. The DailyFlyer deployment adds a file-server check (40 total), including all imported JavaScript modules.

Browser checks covered textured fallback rendering, collision-damage scenes, clean/wrecked comparisons, walking, exit/re-entry, camera rotation, pause, and 430x832 portrait / 896x414 landscape layouts. Vertex/fragment shaders compiled and linked under GLES 2. The cloud browser disables WebGL; physical iPhone Safari, native WebGL visual output/performance and simultaneous physical multi-touch remain unverified.

## Integration and scope

GitHub `shnider42/daily_flyer`, branch `feat/last-exit-driving`. Canonical assets are `daily_flyer/themes/last_exit_assets/`; Flask route `/last-exit/`, theme `last_exit`. The private Sites project mirrors the same static game.

The existing public free Render Node web service uses `server/last-exit/server.mjs`. Build: `node --test tests/last_exit/*.test.mjs`. Start: `node server/last-exit/server.mjs`. It serves only ten known public assets and `/health`; free-service cold starts apply.

This is still a solo prototype with a flat city. Car switching supports parked cars; traffic follows the grid. No moving traffic hijacking, interiors, jumping, replays or multiplayer.
