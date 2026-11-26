# Farwake: Lost Expeditions

## 0.4.0 · Three final viewpoints

A standalone illustrated puzzle anthology for DailyFlyer, set **93 years before Farwake**. You inhabit the person still at each site as ordinary work becomes an emergency. The characters can establish what their instruments and senses show. They do not explain the disaster's origin or diagnose Earth's permanent condition.

All three chapters are playable and selectable from the opening menu:

| Chapter | Witness and location | Actual puzzle | Ending scope |
| --- | --- | --- | --- |
| **Nightglass** | Mara Venn, communications operator on Luna | Diagnose a failed antenna feed, identify independent supplies, isolate the radio, replace a damaged coupler, restore power, and verify the local radio and dish. | A working channel, an overdue relief shift, and no identifiable reply from Earth. |
| **The Empty Track** | Ivo Hale, maintenance technician at Aster Station on Mars | Use a limited backup supply for the lens heater, complete de-icing, transfer power to the camera, and verify a live picture. | Movement outside and a scream. The witness does not identify what moved. |
| **No Arrival Logged** | Sera Vale, caretaker at Latchkey Outpost on Callisto | Check arrival and pressure records, close an equalizer, seat a latch, prove the seal, and inspect the live camera and intercom without opening either door. | A secured access, an empty compartment, and knocking at a nearer door. |

The anthology contains 13 navigable viewpoints, 18 readable records, optional personal observations, and three different final scenes. The eight original Luna illustrations are retained; two new illustrations establish Mars and the outpost. Windowless maintenance views are reused where their physical contents fit.

### What changed from 0.3.3

The later recovery operator, recorder retrieval, animal diagnosis, warning upload and successful return endings have been replaced by the first-person crisis chapters. This is a new story and progression model, not a date changed on the old recovery mission. Correct local repairs demonstrably work even when they cannot make someone answer.

The current scenes remain stable. Every required operation and exit is available through the action controls, including when image hotspots are cropped or disabled. The Task panel gives the current physical objective; more specific help is optional. Notes record the current witness's observations. There are no timed reading challenges or required unsafe-door choices.

### Saves and settings

Each chapter keeps independent local progress, notes and completion. You can switch chapters, reload, finish another chapter, or restart just one without erasing the others.

Version 0.4 uses save version 2 at `farwake.lost-expeditions.chapters.v2`. The old `farwake.lost-expeditions.nightglass.v1` recovery record is left unused. If that old record is detected, the menu explains why these chapters start fresh. Sound and display preferences retain their existing key and values. Existing WIP save compatibility was explicitly waived for the revised story.

Saves and preferences remain browser-local. There are no accounts, analytics, external fonts, or online save sync. Clearing the site's browser data removes the progress.

### Music and sound

The complete, unmodified **Farwake menu theme** recording remains bundled. Its credit is **Original music contributed by a friend of Farwake.** See [`dist/music/README.md`](dist/music/README.md) for provenance and the preserved Git blob hash.

The title theme starts after an explicit audio gesture and fades when entering a chapter. The final viewpoints use restrained station sound and silence; the old successful-recovery reprise does not play over them. Returning to the chapter menu restores the theme. Music and effects retain independent controls, master volume, visibility suspension and saved preferences.

All sound information is also written. The Mars scream is presented in text, without a synthesized imitation of a human voice. There is no recurring survey-call imitation in these chapters. The music transport still retains its legacy report mode for the parked code, but the released app never selects it.

### Controls and accessibility

- Tap a scene direction to move, or use the list of exits in Task.
- Dots mark equipment and records; Task retains every action when dots are hidden.
- Look closer provides optional personal and physical details.
- Tab, Enter and Space operate controls. J opens the notebook, H opens help, M toggles sound, and Escape closes a panel.
- The illustrated desktop view can pan where the image is cropped. Phone views retain the complete scene image and a collapsible Task area.
- Reduced motion, readable transcripts, optional hints and sound-off play remain supported.

The old `explore.html` URL still redirects to `index.html`. The unreleased 3D experiment remains parked. Its geometry and clipping regression tests are retained independently of the retired recovery progression; this release adds no 3D mode.

### Run and validate

Serve `dist/` over HTTP. There is no bundling or dependency installation step.

```sh
cd games/farwake-lost-expeditions
npm run check
npm test
```

The tests run every chapter to completion with save/load between each action, reject premature or cross-chapter progress, verify the distinct repair prerequisites, preserve a return route through each reachable pre-ending location, and retain every required mobile action. A minimal DOM fixture executes the real app module to check chapter selection, actions, endings, independent restart and legacy-save notices. It does not render browser layout or certify device audio.

The sound tests cover gesture activation, mute and volume, one reusable recording, interrupted playback, visibility, and absence of the old repeating survey call. Parked geometry and near-plane clipping tests remain in the full gate.

Browser QA should cover desktop and phone layouts, scrolling, readable panels, action reachability, chapter switching, a complete chapter, sound controls and reload. Real phone/Safari speaker, Bluetooth and interruption behavior require physical-device listening. Local browser access was unavailable in the authoring environment; rendered browser QA belongs to the deployment check.

### Deployment

- Repository: `shnider42/daily_flyer`
- Branch: `feat/farwake-lost-expeditions`
- Implementation base: `30d0d388bf1c6d4b69cc9055d3890d1dc53eafe1` (0.3.3)
- Service type: Static Site
- Build command: `cd games/farwake-lost-expeditions && npm run check && npm test`
- Publish directory: `games/farwake-lost-expeditions/dist`
- Environment: `SKIP_INSTALL_DEPS=true`

Keep deployment separate from the Farwake game and universe services. This directory does not change their runtime or saves. Do not publish local preview helpers, source-comparison manifests or `.openai/` metadata.

### Source map

| File | Purpose |
| --- | --- |
| `dist/content.mjs` | Chapter catalog, scenes, records, physical actions and prerequisites, tasks and endings |
| `dist/state.mjs` | Deterministic transitions, chapter save normalization and collection persistence |
| `dist/mission.mjs` | Current task, optional specific hint and reachable route guidance |
| `dist/investigation.mjs` | Optional observations and earned notebook entries |
| `dist/app.mjs`, `dist/index.html` | Chapter selection, scene interaction, notebook, endings and browser storage |
| `dist/mobile-actions.mjs` | Action presentation without progression changes |
| `dist/audio.mjs` | Local station atmosphere and restrained interaction cues |
| `dist/menu-theme.mjs`, `dist/music/` | Preserved contributed recording and media transport |
| `dist/style.css`, `dist/scene.css`, `dist/mobile.css`, `dist/anthology.css` | Existing responsive scene interface plus chapter menu and ending presentation |
| `docs/anthology-v040.md` | Authoring boundaries and new illustration provenance |

### Narrative boundary

These are the final viewpoints at the playable sites, not an omniscient census of Luna, Mars or Callisto. The chronology between individual chapters is not established beyond the shared crisis period 93 years before Farwake. A channel opening does not establish transmission of an organism. A local repair or live picture does not establish an incoming person's identity. The anthology supplies neither a final origin explanation nor Earth's later prognosis.

The later Farwake Nightglass encounter is a separate incident and must be reconciled deliberately in its own source. Consult the parent Farwake `AGENTS.md`, `docs/quiet-earth-canon.md`, and `docs/nightglass-sol-direction.md` before extending the connection.
