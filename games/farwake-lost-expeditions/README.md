# Farwake: Lost Expeditions

## Nightglass · 0.3.3

A standalone, scene-by-scene first-person mystery for DailyFlyer, set in the existing Farwake universe. The first case adapts the Nightglass listening-shaft incident on Luna. Future anthology destinations remain unimplemented.

You are a recovery operator investigating an earlier expedition. Retrieve its field recorder, upload the evidence and a warning at the surface beacon, then return to the airlock to finish. The earlier crew’s departure was never logged; the station is still repeating a call.

### Explore and investigate

`index.html` is the player entry point. Eight distinct illustrated views cover the approach, airlock, junction, survey room, service bay, listening shaft, lower landing, and surface beacon. The lower landing and beacon now have their own artwork.

Tap direction arrows in the illustration to move between scenes. Left, right, forward, down, and return arrows follow each view’s geography. Phone controls use small visible arrows and dots with generous touch targets. A compact **Task** strip shows the next lead; expand it for the assignment, object actions, help, and **List of exits** text alternative. It closes when moving to another scene. Phones use a full-viewport scene viewer with a slim header and docked Task strip. The complete illustration stays visible in both orientations; portrait adds a subdued decorative backdrop derived from the same image. Navigation stays visible when object markers are off, and a blocked direction explains what is needed. A short movement guard prevents a repeated tap from skipping through the next scene. Tap a scene marker or its text action to inspect something. The magnifier (**Look closer**) opens the scene’s objects and optional details in the same reader used for records. All required actions remain available as text controls when scene markers are off or outside the visible image. Desktop keeps its labelled controls and expanded assignment.

The investigation includes:

- Six recoverable records and fourteen optional observations of the abandoned workplace. Optional details never gate the recovery or grant required clues.
- A service-circuit inspection showing the receiver, inspection lights, and independent return supply.
- An evidence comparison with two conclusions to choose. All four original clues are still required; an incorrect conclusion gives feedback without a penalty or state change.
- Both receiver resolutions: mute the call or redirect it into the side shaft. Either preserves the green return lights.
- A readable warning draft before transmission, followed by the final airlock check-in and downloadable field report.
- A notebook with recovered records, known connections, and the route back. Short scene observations and useful guidance update as the investigation changes.

All sound clues have written equivalents. Desktop supports keyboard focus and activation, J for the notebook, H for help, M for sound, and Escape to close a panel. Wide views can be dragged sideways when cropped. Reduced-motion support remains available.

### Music and silence

The title uses the exact **Farwake menu theme** recording from the live main game. **Listen to theme** starts the complete recording and loops it on the title screen; **Stop theme** stays stopped until music is enabled again. Beginning an expedition fades the theme out. Returning to the title can resume music if the saved sound and music settings permit it. Nothing plays or downloads on the initial menu before an audio gesture.

The recording retains its existing credit: **Original music contributed by a friend of Farwake.** The contributor's preferred artist name has not been provided, so the filename is not used as an artist credit. See `dist/music/README.md` for source commit and asset provenance.

Nightglass's investigation stays unscored. The receiver packet, machinery, independent return lights, and the audible change after mute or redirect carry the atmosphere. No location, dark passage, or deduction triggers battle music. A newly completed airlock check-in earns a quieter, once-only playback of the full theme after the recovery cue. Reopening a report or loading an already completed save does not retrigger it.

**Settings → All sound / Master volume** control the complete mix. **Music / Music level** can reduce or silence the theme without removing station effects. Existing muted settings remain muted. Hidden pages pause the media and audio context; an already unlocked session can resume on return. The recording is a bundled same-origin asset, with no streaming service, analytics, or microphone permission.

For later expeditions, audition complete environmental compositions from Farwake after a first meaningful scenic arrival, with long quiet intervals and no restart on backtracking. Candidates include *Small Sky on a Moon*, *The Tide Keeps Time*, *Roads of Violet Dust*, and *The White Distance*. *Carry the Light* is a candidate for a shorter closing composition. These are future listening candidates, not additional imported tracks. Evidence playback should take priority. Morrow Flightline and V33B remain outside this case; Nightglass has no authored combat or boss encounter.

### Saves and scope

The deterministic state, existing v1 save format, and both endings are preserved. Existing progress from the earlier scene or 3D version continues in the illustrated game in the same browser. Saves and preferences remain local; clearing site data removes them. There are no accounts, analytics, external fonts, or online save sync.

The old `explore.html` URL redirects to `index.html`. The 3D source and its regression tests remain parked in the repository; the player menu no longer offers a 3D mode. This release adds no further 3D development.

### Run and validate

Serve `dist/` with a static HTTP server. Native ES modules require HTTP rather than opening files directly from disk. There is no bundling or dependency installation step.

```sh
cd games/farwake-lost-expeditions
npm run check
npm test
```

The release gate includes the 39 existing state, save, ending, guidance, mobile-action, investigation, and parked 3D tests, plus focused audio transport checks. Investigation coverage checks earned clue visibility, missing prerequisites, incorrect conclusions, both receiver resolutions, immutable optional observations, and accurate text on revisits. Audio coverage checks one media player, interrupted starts, mute and volume, mode transitions, failed playback, and earned report playback.

Browser QA must also check the opening, narrow portrait and landscape layouts, readable panels, action and exit reachability, and a complete recovery. Phone-sized browser checks do not establish physical iPhone/Safari behavior or performance; device testing remains a separate check.

For audio changes, verify Listen/Stop, leaving and returning to the menu, hidden-page suspension, saved mute and volume, and a new completion. A verified media transport and matching asset bytes do not establish physical iPhone speaker, Bluetooth, or interruption behavior.

### Render deployment

- Repository: `shnider42/daily_flyer`
- Branch: `feat/farwake-lost-expeditions`
- Service type: Static Site
- Build command: `cd games/farwake-lost-expeditions && npm run check && npm test`
- Publish directory: `games/farwake-lost-expeditions/dist`
- Environment: `SKIP_INSTALL_DEPS=true`

Keep this deployment separate from the existing Farwake game and universe services. This directory does not modify their code or saves. Do not publish preview helpers or `.openai/` metadata.

### Source map

| File | Purpose |
| --- | --- |
| `dist/content.mjs` | Scene, record, and ending text |
| `dist/state.mjs` | Pure transitions, gates, objectives, and save normalization |
| `dist/mission.mjs` | Briefing and contextual next-step guidance |
| `dist/investigation.mjs` | Optional observations, arrival prose, earned evidence, and conclusion assessment |
| `dist/app.mjs`, `dist/index.html` | Scene interaction, equipment and evidence panels, notebook, and local save |
| `dist/mobile-actions.mjs` | Action presentation filters and short marker labels |
| `dist/audio.mjs` | Web Audio atmosphere, interaction cues, and menu/report music modes |
| `dist/menu-theme.mjs`, `dist/music/` | Imported Farwake recording, contributor credit, and one reusable media transport |
| `dist/style.css`, `dist/scene.css`, `dist/mobile.css` | Shared, scene, and phone presentation |
| `dist/assets/` | Eight fictional WebP scene illustrations |
| `dist/explore.html` | Compatibility redirect to the illustrated game |
| `dist/explore.mjs`, `dist/explore.css`, `dist/world3d.mjs`, `dist/world-layout.mjs`, `dist/software3d.mjs` | Parked 3D prototype source |
| `dist/vendor/` | Parked Three.js r170 module and its MIT license |
| `tests/` | Release regression coverage |

### Narrative boundaries

Nightglass adapts the existing `nightglass-listening` case in `games/farwake/dist/expedition-stories.mjs`. Consult `games/farwake/AGENTS.md` and `games/farwake/docs/quiet-earth-canon.md` before extending its connection to the wider story.

The local case concerns an animal imitating a damaged survey call and a faulty receiver. The return lamps have an independent supply. Muting or redirecting the receiver preserves that route. The case does not determine the animal’s origin or the earlier crew’s later movements, and adds no definitive explanation for Earth’s wider history. Optional observations and early evidence questions must not disclose discoveries the player has yet to earn.

The scene art is generated fictional artwork, not authentic lunar photography. Station effects are synthesized locally; the contributed Farwake menu recording is packaged with its existing credit. Future cases may use properly attributed real mission imagery as references, with archival material clearly distinguished from fiction. The parked renderer retains the official Three.js r170 module and its license at `dist/vendor/THREE-LICENSE.txt`.

### Accepted direction · 2026-11-25

The user chose to focus on the older Myst-style, scene-by-scene experience, clarifying that the 3D version needs more time than they have available. Develop the illustrated expedition’s scenes, physical clues, atmosphere, navigation, and mobile usability. Keep the 3D experiment parked unless the user explicitly reopens that direction.
