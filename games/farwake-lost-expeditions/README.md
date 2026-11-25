# Farwake: Lost Expeditions

## Nightglass · 0.2.0

A standalone first-person expedition mystery for DailyFlyer, set in the existing Farwake universe. The first case adapts the Nightglass listening-shaft incident on Luna into a small recovery mission. Future anthology destinations remain unimplemented.

You are a recovery operator investigating an earlier expedition. Retrieve its field recorder, upload the evidence and a warning at the surface beacon, then return to the airlock to finish the recovery. The earlier crew’s departure was never logged; the station is still repeating a call.

### Two ways to explore the same case

**3D exploration preview** (`explore.html`) is a connected station with free movement, real doorways, physical equipment, a descending listening-shaft ramp, and an outdoor beacon. It is an experiment in movement and spatial understanding, with simplified procedural artwork. It is not a finished high-detail replacement for the illustrated scenes.

On touch screens, drag to look and tap the floor or a doorway to walk. Tap equipment to approach and inspect it. The optional arrow control walks forward while held. The **Nearby** button provides named equipment and connected destinations as an alternative to aiming at the scene. Reading a record stops movement. There is no head bob or required pointer lock. A Stop control appears during automatic walking. Browsers without WebGL2 use a simpler Canvas renderer of the same 3D geometry; this mode is labelled Basic graphics.

On desktop, use W/A/S/D or the arrow keys to walk, drag to look, and E to interact. Clicking the floor and using Nearby work here too. J opens the notebook; H opens the assignment. Escape closes a record or menu.

**Snapshot version** (`index.html`) retains the six original illustrations and eight viewpoints. On a phone it now uses one scrolling page with the picture, visible task explanation, room actions, and exits. There are no Inspect/Move tabs, automatic tab changes, separate reading pane, or expanded-image mode. Records open in a consistent notebook sheet. The recorder and beacon have distinct close framing; the reference evidence is presented as the crew’s annotations, rather than implying a visual difference between identical images.

Both versions use the same deterministic game state and browser save. Switching versions keeps recovered records and mission progress; free movement resumes at a safe position in the saved room. Existing v0.1 saves remain valid. Clearing browser site data removes the save. There are no accounts, analytics, external fonts, or online save sync.

### Mission and interaction

- A visible briefing establishes the role, recovery target, warning, and final check-in. The first step is entering the airlock; the physical dispatch is an optional record.
- Guidance adapts to the room and the next useful local action, including visits made out of order. It does not add progression gates.
- Six recoverable records, a field notebook, circuit investigation, evidence comparison, and two receiver resolutions remain available.
- The independent green exit lights preserve the route home. All sound clues also have written equivalents.
- The case ends with an accurate, downloadable field report. The fate of the earlier crew and the animal’s origin remain unresolved.
- Every required action is available through text controls as well as scene interaction. 3D has collision, locked access gates, and a visible tap-to-walk destination marker.

### Run and validate

Serve `dist/` with a static HTTP server. Native ES modules require HTTP rather than opening the files directly from disk. There is no bundling or package installation step.

```sh
cd games/farwake-lost-expeditions
npm run check
npm test
```

Regression coverage includes both endings, evidence prerequisites, wrong-circuit feedback, return routes, malformed and existing saves, presented mobile actions, local mission guidance, physical doorway connectivity, gated movement, furniture and wall collision, navigation paths, and safe room spawns. Browser QA must separately verify the beginning of the mission, actual touch-style interactions, modal pausing, and a complete recovery. Phone-sized Chrome checks do not substitute for a physical iPhone/Safari playtest.

### Render deployment

- Repository: `shnider42/daily_flyer`
- Branch: `feat/farwake-lost-expeditions`
- Service type: Static Site
- Build command: `cd games/farwake-lost-expeditions && npm run check && npm test`
- Publish directory: `games/farwake-lost-expeditions/dist`
- Environment: `SKIP_INSTALL_DEPS=true` (the renderer is vendored; no package installation is needed)

Keep this deployment separate from the existing Farwake game and universe services. This directory does not modify their code or saves.

### Source map

| File | Purpose |
| --- | --- |
| `dist/content.mjs` | Scene, record, and ending text |
| `dist/state.mjs` | Pure state transitions, gates, objectives, and save normalization |
| `dist/mission.mjs` | Shared mission briefing and contextual next-step guidance |
| `dist/explore.html`, `dist/explore.css`, `dist/explore.mjs` | 3D HUD, touch/keyboard input, panels, local saves, and sound integration |
| `dist/world3d.mjs` | Three.js station geometry, rendering, picking, camera, and physical interactions |
| `dist/software3d.mjs` | Basic Canvas renderer used when WebGL2 is unavailable |
| `dist/world-layout.mjs` | Pure room layout, collision, gates, and tap navigation paths |
| `dist/app.mjs` | Illustrated viewpoints, markers, actions, notebook, and local save |
| `dist/mobile-actions.mjs` | Presentation filters and short marker labels |
| `dist/audio.mjs` | Web Audio atmosphere and interaction cues |
| `dist/style.css`, `dist/mobile.css` | Snapshot desktop and phone presentation |
| `dist/assets/` | Six optimized fictional WebP scene illustrations |
| `dist/vendor/` | Official Three.js r170 module and MIT license |
| `tests/` | State, guidance, action presentation, and physical-layout regression tests |

### Narrative boundaries

Nightglass is an adaptation of the existing `nightglass-listening` case in `games/farwake/dist/expedition-stories.mjs`. Consult `games/farwake/AGENTS.md` and `games/farwake/docs/quiet-earth-canon.md` before extending its connection to the wider story.

The local case concerns an animal imitating a damaged survey call and a faulty receiver. The return lamps have an independent supply. Muting or redirecting the receiver preserves that route. The case does not determine the animal's origin or the earlier crew's later movements, and adds no definitive explanation for Earth's wider history.

The scene art is generated fictional artwork, not authentic lunar photography. Audio is synthesized locally. Future cases may use properly attributed real mission imagery as references, with a clear distinction between archival material and fiction.

### Third-party renderer

The 3D preview vendors the official `build/three.module.min.js` from [Three.js r170](https://github.com/mrdoob/three.js/tree/r170), renamed locally to `three.module.js`. Its MIT license is preserved in `dist/vendor/THREE-LICENSE.txt`. It is served from the same site; no runtime CDN dependency is required.

### Next design question

Evaluate whether freely walking through the station makes the case more understandable and engaging on a real phone. Keep the existing snapshot version available while deciding. Deeper physical puzzles, richer photographic comparison, final 3D art, and additional expeditions are later work.
