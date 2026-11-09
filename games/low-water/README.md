# LOW WATER

An original DailyFlyer first-person game set in Bellwether Station, a coastal tidal-power and acoustic research facility. Five authored chapters build a complete journey with environmental puzzles, industrial spaces, restrained threats and a return through the altered opening area.

## Run and deploy

This is a self-contained static application. Serve `dist/` from any HTTP server. The vendored Three.js r160 module means the game has no CDN or package-install dependency at runtime.

From this directory, run `npm test` (or `node --test tests/*.test.mjs`). Render configuration for the DailyFlyer repository:

- Branch: `feat/low-water`
- Build command: `node --test games/low-water/tests/*.test.mjs`
- Publish directory: `games/low-water/dist`
- Service type: static site

## Campaign

| Chapter | Environment | Working system |
| --- | --- | --- |
| Night Shift | Arrival concourse, security, lockers, electrical services and observation | Isolate gantry standby, then route the limited supply to the freight gate |
| Below the Mark | Pump gallery, flooded crossing, inspection and bypass | Close the intake and open the discharge; the basin drains |
| Dead Load | Tall turbine hall, tool workshop, ramp and mezzanine | Dock at the tool bay, collect the arc driver, then position the physical research bridge |
| The Listening Room | Separate observation cells and a resonance chamber | Match three dampers to physical calibration plates |
| Return Tide | Changed arrival area and evacuation route | Seal the intake and reach the evacuation lift |

The visual inspiration is environmental, industrial first-person storytelling. Names, dialogue, layouts, characters, geometry, textures and sounds are original; no Half-Life assets are included.

## Controls

Touch uses independent movement, look and action pointers. The left stick floats to the initial thumb position. The right area controls looking and cannot fire. USE and PULSE are separate. RUN and CROUCH toggle so the movement thumb can stay on its stick. Size sliders independently adjust the movement stick and action buttons. Left-handed layout swaps the touch sides. An explicit input-layout option can override automatic device detection.

Desktop: WASD or arrows move; mouse looks; E interacts; F toggles the torch; Shift runs; C toggles crouch; Space jumps; Q or locked left mouse pulses the earned arc driver; J opens the journal; M opens the station plan; Escape pauses. Drag look remains available if pointer lock is denied. The click that captures the pointer does not also fire.

## Comfort and guidance

Simple, Moderate and Expert change objective and hint presentation, not the available content or enemy damage. Simple includes a destination marker and explicit next step. Moderate gives short objectives with requested clues. Expert relies on environmental signs and calibration plates. All essential clues are visible and recorded notes can be reread.

Controls include field of view, horizontal and vertical sensitivity, invert Y, brightness, volume, sound captions, lower rendering resolution and optional camera motion. Camera motion is off by default. Sound begins only after a user gesture and uses original synthesized machinery, water, footsteps and positional cues.

Progress and settings are stored locally in the current browser. Puzzle checkpoints and chapter starts are recoverable from the pause menu; unlocked chapters can be replayed. This version is single-player. No login, server, analytics, personal information or external media request is required.

## Architecture

- `levels.mjs`: authored rooms, solid props, interactions, gate requirements, physical ramp/bridge floors and collision.
- `core.mjs`: puzzle state, progression, guidance, serializable saves and chapter transitions.
- `world.mjs`: detailed WebGL geometry, material batches, procedural textures and machinery animation.
- `software.mjs`: perspective-projected Canvas compatibility renderer for browsers without WebGL.
- `input.mjs`: independent pointer ownership, desktop input and focus-loss cleanup.
- `audio.mjs`: gesture-unlocked Web Audio soundscape with bounded ambient mixing and node cleanup.
- `main.mjs`: first-person movement, interaction targeting, threats, UI, checkpoints and integration.

Only the current chapter is loaded. The detailed scenes contain approximately 19–22k triangles with material-batched static geometry, shared procedural textures and three local lights. Device pixel ratio is capped on touch devices. The compatibility renderer uses the same simulation and level data with simplified visuals.

## Verification and limits

Automated checks cover traversable routes to each control and exit, locked-route bypass prevention, ramp ascent, real bridge absence/presence, all five causal puzzle sequences, recoverable incorrect inputs, tool acquisition, note persistence and saved-state restoration. Browser checks cover start, movement, interaction, pause, settings, plan and local checkpoint recovery where supported.

The cloud test browser has WebGL disabled. Its rendered checks use the software compatibility renderer; actual GPU rendering and physical iPhone/Safari performance still require device verification. World construction, finite geometry, animation and disposal were separately checked for every detailed scene. No performance claim for a physical phone is implied.
