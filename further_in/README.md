# FURTHER IN — DailyFlyer

A six-floor first-person psychological horror game. Version 0.2 expands the descent before the original finale, gives the title screen a restrained survival-horror identity, and saves progress within floors.

## Run and publish

This is a buildless static site. Render deploys `further_in/dist` from the `feat/further-in` branch of `shnider42/daily_flyer`. The build command is `node --test further_in/tests/*.test.mjs`. Set `SKIP_INSTALL_DEPS=true`: the game is self-contained and does not use the repository’s unrelated Python dependencies. No start command or backend is required. Automatic deployments are enabled for this branch.

For local work, run a static file server with `further_in/dist` as its document root. Paths below are relative to `further_in` unless noted.

The vendored Three.js runtime and self-hosted Open Sans Condensed title font are included with their licenses. No runtime CDN, external media, backend, analytics, or paid API is required by the game. Progress, medals, and settings use browser-local storage. The Render version is publicly accessible and does not require a ChatGPT login.

## Play

- **Desktop:** WASD move, mouse or drag to look, arrow keys turn, E interact, Shift run, Space pulse, X turn around, F hand lamp, Escape pause.
- **Phone:** left side moves, edge of stick runs, right side drags the view; USE interacts, TURN faces behind, PULSE uses the collected resonator. Settings include sensitivity, brightness, control size, field of view, quality, lamp, captions, walking motion, and automatic/manual touch UI.
- The public title and pause menus contain no floor selector, testing shortcuts, or solution notes. Players begin normally or continue their own campaign.
- Playtest controls live at `/admin.html`. Enter the configured four-digit code to reveal floor selection, shortcuts, optional telemetry, and solution notes. The page has no link from the public menus. Use **Lock admin** when finished.
- Admin links launch in the same tab and prepare a one-tap entry button so sound begins with a player gesture. Test progress and medals use separate session storage and never overwrite campaign saves.
- All `?level=` links work only in an unlocked admin session. Stable IDs are ordered **1, 2, 4, 5, 6, 3**. Existing ID3 links and saves still target the original finale, now displayed as floor 06. Without one, all testing URL options are discarded and the ordinary game opens. Opening the ordinary URL runs the campaign even if admin is unlocked.

## Progress and retries

The campaign saves the current seed, map, puzzle steps, gates, equipment, position, and random-generator state every eight seconds, at puzzle/refuge checkpoints, and when pausing or leaving. Continue restores a validated snapshot; old floor-only saves still start the corresponding floor. Invalid snapshots fall back to a fresh copy of the saved floor. The final encounter retries at the encounter entrance rather than repeating its preceding doors. The earlier chase grants three seconds to regain your bearings after resuming. Restart floor keeps the current layout seed and collected equipment. A new descent begins fresh. Campaign and admin progress remain separate.

## Expanded descent (design notes; spoilers)

| Displayed floor | Stable ID | Place and purpose |
| --- | --- | --- |
| 01 | 1 | Original repeating service corridors and remembered knock pattern. |
| 02 | 2 | Original yellow rooms, pursuit, resonator, and drop. |
| 03 | 4 | Drainage: quiet recovery, three valves, receding water, one contextual glimpse. |
| 04 | 5 | Records: move under generator noise, wait or shelter in quiet, restore two breakers in either order. |
| 05 | 6 | Last service: short inspection-light crossings and refuge checkpoints before the finale. |
| 06 | 3 | Original garden, changing corridors, and ghost encounter. |

The new floors avoid another lethal pursuit. Timing mistakes return the player to a reached refuge while preserving puzzle progress. Light cues accompany sound cues. Inspection pools use the same coordinates in both renderers and the simulation.

## Admin access

The code gate is a client-side, per-tab convenience to prevent accidental spoilers; it is not server authentication. There are no private data or privileged server operations. Spoiler controls are inserted into the admin page only after unlock and cleared before back/forward caching. The game rechecks the session before entering or resuming a test.

## Structure

- `dist/core.mjs` — seeded simulation, collision, connectivity/pathfinding, entities, transitions, and endings; independent of DOM and audio.
- `dist/savegame.mjs` — versioned snapshot encoding, validation, and safe restoration.
- `dist/app.mjs` — public UI, gated test launches, input ownership, storage, lifecycle, settings, and animation loop.
- `dist/admin.html`, `dist/admin.mjs`, `dist/admin.css` — code-entry page and unlocked testing panel.
- `dist/admin-session.mjs` — session gate, validated test links, and separate campaign/test persistence.
- `dist/renderer.mjs` — Three.js rendering with instanced rooms and procedural textures.
- `dist/software.mjs` — Canvas ray-casting fallback sharing the simulation and map.
- `dist/audio.mjs` — original synthesized ambience and effects; tracks/stops transient voices on chapter reset.
- `tests/` — deterministic Node tests for gameplay and audio lifecycle.

Renderers rebuild on both simulation identity and scene revision. Chapter changes do not wait on an audio-resume promise. Inputs clear on cancellation, backgrounding, pauses, and restarts. Foreground touch focus changes and the TURN action preserve the other finger’s held input; pointer-lock changes do not themselves pause the game. Menu camera drift respects reduced-motion/walking-motion settings.

## Verification

```sh
node --test tests/*.test.mjs
node --check dist/admin.mjs
node --check dist/admin-session.mjs
node --check dist/app.mjs
node --check dist/renderer.mjs
node --check dist/software.mjs
```

The 52 tests cover admin gating, legacy URL handling, shortcut validation, campaign/test save isolation, spoiler-free initial markup, pattern progress, one-off glimpse behavior, connectivity and drop-test placement across 200 maze seeds, pursuit timing and collision, resonator behavior, door progression, every ending, stale transition interruption, audio reset/suspension/cleanup, actual walking routes through the new floors, nonlethal retreats, physical gate integrity, exact seeded save restoration, corrupt saves, equipment, and encounter retries. The cloud browser uses the software renderer; this does not verify real iPhone Safari/WebGL frame rate or the subjective sound mix. Test those on the target device before describing them as verified.
