# Farwake: Lost Expeditions

## Nightglass · first release 0.1.0

A standalone first-person expedition mystery for DailyFlyer, set in the existing Farwake universe. The first case adapts the Nightglass listening-shaft incident on Luna into an explorable recovery mission. It is a complete small case and a foundation for an anthology, not the full planned collection.

The survey is over. The receiver is still answering. Follow photographs, maintenance records, and the rooms left behind; recover the lower field recorder, identify the repeated call, and leave a useful warning.

### Playable now

- Eight viewpoints built from six scene illustrations.
- Six recoverable records, a field notebook, and a record of visited locations.
- A circuit investigation and evidence comparison, followed by two receiver resolutions.
- A stable route home, optional hints, and a completed field report that can be downloaded.
- Local progress and settings, synthesized ambient sound, written sound clues, keyboard controls, and responsive layouts.

Mouse/touch: select markers or the actions below the view. Drag across a cropped scene to look sideways. Every route is available below the scene even when its edge is offscreen.

Keyboard: Tab, Enter, and Space operate controls. J opens the notebook; H shows a lead; M toggles sound. Left/right pan. Escape closes a panel.

Progress is stored only in this browser. Clearing site data removes it. There are no accounts, analytics, external fonts, online saves, or network dependencies after the local assets load.

### Run and validate

Serve `dist/` with a static HTTP server. Native ES modules require HTTP rather than opening `index.html` directly from disk. There is no bundling or dependency installation step.

```sh
cd games/farwake-lost-expeditions
npm run check
npm test
```

Tests exercise both complete endings, evidence prerequisites, incorrect circuit feedback, return-route reachability, save hydration, malformed save recovery, and completed-state stability.

### Render deployment

- Repository: `shnider42/daily_flyer`
- Branch: `feat/farwake-lost-expeditions`
- Service type: Static Site
- Build command: `cd games/farwake-lost-expeditions && npm run check && npm test`
- Publish directory: `games/farwake-lost-expeditions/dist`
- Environment: `SKIP_INSTALL_DEPS=true` (this game has no dependencies)

Keep this deployment separate from the existing Farwake game and universe services. This directory does not modify their code or saves.

### Source map

| File | Purpose |
| --- | --- |
| `dist/content.mjs` | Scene, record, and ending text |
| `dist/state.mjs` | Pure state transitions, gates, objectives, and save normalization |
| `dist/app.mjs` | Viewpoints, markers, panels, local save, and interaction wiring |
| `dist/audio.mjs` | Web Audio atmosphere and interaction cues |
| `dist/style.css` | Desktop, phone, and reduced-motion presentation |
| `dist/assets/` | Six optimized WebP scene illustrations |
| `tests/state.test.mjs` | State and completion regression tests |

### Narrative boundaries

Nightglass is an adaptation of the existing `nightglass-listening` case in `games/farwake/dist/expedition-stories.mjs`. Consult `games/farwake/AGENTS.md` and `games/farwake/docs/quiet-earth-canon.md` before extending its connection to the wider story.

The local case concerns an animal imitating a damaged survey call and a faulty receiver. The return lamps have an independent supply. Muting or redirecting the receiver preserves that route. The case does not determine the animal's origin or the earlier crew's later movements, and adds no definitive explanation for Earth's wider history.

The scene art is generated fictional artwork, not authentic lunar photography. Audio is synthesized locally. Future cases may use properly attributed real mission imagery as references, with a clear distinction between archival material and fiction.

### Next design question

Test whether observing and comparing views feels satisfying before adding more destinations. The current case establishes atmosphere, navigation, persistence, and an ending. A subsequent pass should deepen direct visual manipulation and photographic comparison. Deep sea Earth, Mars, Europa, and other anthology destinations remain unimplemented.
