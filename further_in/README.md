# FURTHER IN — DailyFlyer

A three-floor first-person psychological horror prototype. Recovered from an interrupted build and completed for independent floor testing.

## Run and publish

This is a buildless static site. Render deploys `further_in/dist` from the `feat/further-in` branch of `shnider42/daily_flyer`. The build command is `node --test further_in/tests/*.test.mjs`. Set `SKIP_INSTALL_DEPS=true`: the game is self-contained and does not use the repository’s unrelated Python dependencies. No start command or backend is required. Automatic deployments are enabled for this branch.

For local work, run a static file server with `further_in/dist` as its document root. Paths below are relative to `further_in` unless noted.

The vendored Three.js runtime is included with its license. No runtime CDN, external media, backend, analytics, or paid API is required by the game. Progress, medals, and settings use browser-local storage. The Render version is publicly accessible and does not require a ChatGPT login.

## Play

- **Desktop:** WASD move, mouse or drag to look, arrow keys turn, E interact, Shift run, Space pulse, X turn around, F hand lamp, Escape pause.
- **Phone:** left side moves, edge of stick runs, right side drags the view; USE interacts, TURN faces behind, PULSE uses the collected resonator. Settings include sensitivity, brightness, control size, field of view, quality, lamp, captions, walking motion, and automatic/manual touch UI.
- Choose any floor from the title screen or from **Pause → Floor testing**. The spoiler section also offers the last pattern step, pursuit trigger, a position near the drop, and the final ghost.
- `?level=1`, `?level=2`, and `?level=3` prepare a one-tap entry button for that floor. Audio is unlocked by the visitor's tap.

## Floor rules (spoilers)

1. **The same way out:** repeating service corridors. Door marks correspond to the remembered rhythm 1 → 2 → 3 → 1. Wrong choices loop; there is no lethal enemy. One brief distant glimpse may occur in an attempt, with sparse distant noises.
2. **The lights are still on:** connected yellow rooms and fluorescent hum. The pursuit starts after a seeded variable delay. The hole is selected from reachable candidates and appears with the chase. A resonator can briefly interrupt the entity if aimed in range without intervening walls. Repeated effective pulses shorten the stun and increase pursuit speed. Walking into the hole advances to the next floor.
3. **Somewhere beautiful:** a brief garden, blackout, then rebuilt dark hallway layouts after each door. Every available door advances progress. Whispers begin after the third choice. A ghost appears after 7, 8, or 9 door choices. Staying still and looking at it for 4.5 seconds wins; fleeing eventually loses; sprinting into it awards a persistent medal and still loses. Retry restarts the current floor.

## Structure

- `dist/core.mjs` — seeded simulation, collision, connectivity/pathfinding, entities, transitions, and endings; independent of DOM and audio.
- `dist/app.mjs` — UI, input ownership, storage, lifecycle, settings, and animation loop.
- `dist/renderer.mjs` — Three.js rendering with instanced rooms and procedural textures.
- `dist/software.mjs` — Canvas ray-casting fallback sharing the simulation and map.
- `dist/audio.mjs` — original synthesized ambience and effects; tracks/stops transient voices on chapter reset.
- `tests/` — deterministic Node tests for gameplay and audio lifecycle.

Renderers rebuild on both simulation identity and scene revision. Chapter changes do not wait on an audio-resume promise. Inputs clear on cancellation, visibility changes, pauses, and restarts; pointer-lock changes do not themselves pause the game.

## Verification

```sh
node --test tests/core.test.mjs tests/audio.test.mjs
node --check dist/app.mjs
node --check dist/renderer.mjs
node --check dist/software.mjs
```

The 20 tests cover pattern progress, one-off glimpse behavior, connectivity and drop-test placement across 200 maze seeds, pursuit timing and collision, resonator behavior, door progression, every ending, stale transition interruption, and audio reset/suspension/cleanup. The recovered build received browser inspection in desktop and phone-sized portrait/landscape layouts. The cloud browser uses the software renderer; this does not verify real iPhone Safari/WebGL frame rate or the subjective sound mix. Test those on the target device before describing them as verified.
