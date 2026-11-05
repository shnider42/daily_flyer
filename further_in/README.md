# FURTHER IN — DailyFlyer

A three-floor first-person psychological horror prototype. Recovered from an interrupted build and completed for independent floor testing.

## Run and publish

This is a buildless static site. Render deploys `further_in/dist` from the `feat/further-in` branch of `shnider42/daily_flyer`. The build command is `node --test further_in/tests/*.test.mjs`. Set `SKIP_INSTALL_DEPS=true`: the game is self-contained and does not use the repository’s unrelated Python dependencies. No start command or backend is required. Automatic deployments are enabled for this branch.

For local work, run a static file server with `further_in/dist` as its document root. Paths below are relative to `further_in` unless noted.

The vendored Three.js runtime is included with its license. No runtime CDN, external media, backend, analytics, or paid API is required by the game. Progress, medals, and settings use browser-local storage. The Render version is publicly accessible and does not require a ChatGPT login.

## Play

- **Desktop:** WASD move, mouse or drag to look, arrow keys turn, E interact, Shift run, Space pulse, X turn around, F hand lamp, Escape pause.
- **Phone:** left side moves, edge of stick runs, right side drags the view; USE interacts, TURN faces behind, PULSE uses the collected resonator. Settings include sensitivity, brightness, control size, field of view, quality, lamp, captions, walking motion, and automatic/manual touch UI.
- The public title and pause menus contain no floor selector, testing shortcuts, or solution notes. Players begin normally or continue their own campaign.
- Playtest controls live at `/admin.html`. Enter the configured four-digit code to reveal floor selection, shortcuts, optional telemetry, and solution notes. The page has no link from the public menus. Use **Lock admin** when finished.
- Admin links launch in the same tab and prepare a one-tap entry button so sound begins with a player gesture. Test progress and medals use separate session storage and never overwrite campaign saves.
- Legacy `?level=1`, `?level=2`, and `?level=3` links work only in an unlocked admin session. Without one, all testing URL options are discarded and the ordinary game opens. Opening the ordinary URL runs the campaign even if admin is unlocked.

## Admin access

The code gate is a client-side, per-tab convenience to prevent accidental spoilers; it is not server authentication. There are no private data or privileged server operations. Spoiler controls are inserted into the admin page only after unlock and cleared before back/forward caching. The game rechecks the session before entering or resuming a test.

## Structure

- `dist/core.mjs` — seeded simulation, collision, connectivity/pathfinding, entities, transitions, and endings; independent of DOM and audio.
- `dist/app.mjs` — public UI, gated test launches, input ownership, storage, lifecycle, settings, and animation loop.
- `dist/admin.html`, `dist/admin.mjs`, `dist/admin.css` — code-entry page and unlocked testing panel.
- `dist/admin-session.mjs` — session gate, validated test links, and separate campaign/test persistence.
- `dist/renderer.mjs` — Three.js rendering with instanced rooms and procedural textures.
- `dist/software.mjs` — Canvas ray-casting fallback sharing the simulation and map.
- `dist/audio.mjs` — original synthesized ambience and effects; tracks/stops transient voices on chapter reset.
- `tests/` — deterministic Node tests for gameplay and audio lifecycle.

Renderers rebuild on both simulation identity and scene revision. Chapter changes do not wait on an audio-resume promise. Inputs clear on cancellation, visibility changes, pauses, and restarts; pointer-lock changes do not themselves pause the game.

## Verification

```sh
node --test tests/*.test.mjs
node --check dist/admin.mjs
node --check dist/admin-session.mjs
node --check dist/app.mjs
node --check dist/renderer.mjs
node --check dist/software.mjs
```

The 29 tests cover admin gating, legacy URL handling, shortcut validation, campaign/test save isolation, spoiler-free initial markup, pattern progress, one-off glimpse behavior, connectivity and drop-test placement across 200 maze seeds, pursuit timing and collision, resonator behavior, door progression, every ending, stale transition interruption, and audio reset/suspension/cleanup. The recovered build received browser inspection in desktop and phone-sized portrait/landscape layouts. The cloud browser uses the software renderer; this does not verify real iPhone Safari/WebGL frame rate or the subjective sound mix. Test those on the target device before describing them as verified.
