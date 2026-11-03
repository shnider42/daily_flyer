# LAST EXIT

Original DailyFlyer driving prototype, influenced by the city-chase feel of PS1-era Driver. Fictional Port Meridian, 1978; no copied assets or soundtrack. One original rear-wheel-drive coupe, a 36-block city and waterfront, traffic, two camera distances, momentum and handbrake grip loss, body damage, pursuit with building occlusion, keyboard and multi-touch inputs.

## Play

- Free drive: explore, learn the handling, recover to repair. Hard traffic collisions can attract a patrol.
- The pickup: stop at the motel, lose two cruisers, stop at the waterfront garage (3 minutes).
- Heat check: break sight for eight seconds and reach the garage (2:30).
- Last delivery: four checkpoints, in order (1:50).

WASD/arrows drive; Space handbrake; C camera; R recovery; Escape pause. Brake becomes reverse when stopped. Touch: horizontal steering pad plus separate gas, brake/reverse and drift buttons. Street handling has more rear grip; Raw has less. Recovery costs 8 seconds in a timed job. Tab hiding/window blur pauses the simulation and clears inputs. Best successful times and audio/handling settings use localStorage, with safe fallback when unavailable.

Audio starts inside a user gesture. Original procedural 108 BPM groove, engine, tyres, collisions and siren. Music and effects are independently switchable in Pause. No paid services, CDN scripts, downloaded models, remote fonts or runtime network dependency.

## Architecture and verification

- `dist/engine.js`: deterministic fixed-step simulation, no DOM/audio dependencies. Isolated for future authoritative networking; no multiplayer is implemented in this release.
- `dist/render.js`: native WebGL renderer; a depth-buffered Canvas renderer is available when WebGL is unavailable. Procedural flat-shaded geometry; no external assets.
- `dist/game.js`: UI, touch pointers, pause lifecycle, local records, minimap and frame loop.
- `dist/audio.js`: Web Audio original music/effects, gesture unlock and mute state.
- Run `npm test` (Node built-in test runner). 11 focused simulation checks.
- Browser QA covers fallback rendering, menu/start/pause/resume, job selection, keyboard and touch acceleration, and 430x832 portrait / 896x414 landscape layouts. The test browser has WebGL disabled; real iPhone Safari/WebGL performance and physical multi-touch need device testing.

## DailyFlyer integration

GitHub: `shnider42/daily_flyer`, branch `feat/last-exit-driving`.
Assets live in `daily_flyer/themes/last_exit_assets/`, metadata in `daily_flyer/themes/last_exit.py`, Flask route `/last-exit/`, theme `last_exit`. Static Render publish directory is the assets directory, with `node --test tests/last_exit/*.test.mjs` as build command. Existing game branches are unchanged.

This is a solo first slice: one car, one flat city, three jobs. Traffic drives straight across the grid; pursuit uses road nodes and sight checks. No ramps, traffic lights, replays, additional cars or multiplayer yet. Next work should follow actual phone handling feedback, then street variety and more nuanced pursuit.
