# BREACH — DailyFlyer Arcade

An original retro first-person game built on DailyFlyer, with nine solo missions
and six operations available in private two-to-four-player co-op. Solo play runs in the
browser; co-op uses an authoritative room server.

## 0.12.0 — People, factions, and rooms that lie

Breach now has a shared catalog of **13 functional room types**. Tomorrow's nine
districts contain 37 overlapping semantic regions for arrivals, controls,
refuges, optional discoveries and endings. These classifications describe the
existing floor plan; the nine missions still have 82 named zone rectangles.
See [the room inventory and placement rules](breach-room-types.md).

Tomorrow adds nine human NPC bodies: Mara Venn, Bailiff Rook and Clerk Twice,
four rival faction combatants, and two conditional escorts. Returning Mara's
catalogue can supply one living memory for Rewrite; repairing Rook's radio ends
the Warden–Unfiled feud; Twice's bargain may lead to loyalty or a warned betrayal.
Two disguised mimics and two marked maintenance hatches occupy optional areas,
while arrivals, refuges and required controls reject those placements.

NPC decisions, faction fighting, reveals and drops use the same authoritative
world for up to four operators. Valid 0.11.0 Tomorrow saves migrate with earned
progress intact. Co-op remains protocol 3 and now requires Tomorrow revision 2.
The implementation passed 457 JavaScript tests, three Python export tests and
browser checks of the software-renderer presentation. See
[the release and validation notes](breach-society-0120.md) for scope and limits.

## 0.11.0 — The Wrong Side of Tomorrow

Mission 009 is an impossible civic building with nine connected districts, three
distinct endings, the latest four Shadow enemy types, and an unfinished-sun
guardian. Floating teeth, clock-fish, borrowed faces, inverted benches and a
staircase that returns to itself give the new map its own visual language. Both
renderers use the same original procedural artwork.

Iron Teeth, Blacksite Stomp and Ash Cathedral play first, in that order, before
district and boss rotations take over. These are the available committed
recordings (roughly 48 seconds each); this release does not include the previously
reported, unrecoverable longer sample-based arrangements.

Private rooms now support two to four operators. Tomorrow enables friendly fire
at half base weapon damage, identifies all four operators by color and number,
and can start a team together, in pairs, or separated across safe arrival points.
Its enemy health scales with party size. Walking routes always permit reunion;
restored registers also change the folded-door destinations. Existing co-op maps
keep friendly fire off by default.

See [the mission, endings, and validation notes](breach-tomorrow-0110.md) and the
[current co-op protocol](breach-coop-protocol.md).

## 0.10.0 — The city changes shape

Beneath The Shadow gains four distinct enemy types, nine new authored placements,
shared street-restoration and aqueduct puzzles, and a separate visual identity
for every district. The still laboratory becomes a cold glass conservatory; the
House of Echoes becomes a flooded orchard beneath a fractured growing-house roof.
Both WebGL and software rendering show the new architecture, enemy tells and
actual platform state.

Iron Teeth now opens the mission. All three new Doom II-influenced tracks appear
throughout its authored region and boss rotations. Insane in the Membrane is a
fourth solo/co-op combat tier: stronger pursuit, more damage and shorter recovery,
with the full warning windows retained. Existing Shadow saves migrate while
preserving earned equipment, root generations, records and checkpoints.
See [the expanded Shadow design and validation](breach-shadow-0100.md).

## 0.9.4 — Three heavier signals

Three new original tracks bring a stronger Doom II influence to the nineteen-cue
soundtrack: Iron Teeth (168 BPM), Blacksite Stomp (124 BPM) and Ash Cathedral
(142 BPM). Their guitar riffs, bass grooves and organ-led pressure have distinct
phrases, contrasting sections and written endings. Each is available as rendered
audio and editable MIDI in the listening room.

Iron Teeth joins Blacksite quarantine, Underworks rail, and Shadow's aqueduct and
Warden rotations. Blacksite Stomp joins the Blacksite facility, Switchyard yard
and Hollow freight. Ash Cathedral joins the Choir Keeper, hydra and Umbra Engine
boss rotations. Existing opening cues, menu alternation, crossfades, local music
settings and brief quiet beats retain their behavior. Composition and rendering
instructions are in `daily_flyer/themes/breach_assets/music/README.md`.

## 0.9.3 — Centered weapon default

Weapon horizontal position now defaults to 50%. Reset Weapon View uses this
centered position; saved custom positions remain intact.

## 0.9.2 — Music throughout the missions

All eight maps now have recurring authored rotations, including unnamed corridors,
backtracking, cleared rooms and extraction approaches. Ordinary region changes wait
for the current phrase; 1.2-second crossfades connect tracks. Boss rotations begin
after 1.5 seconds of local exposure, continue through cover, and end after defeat
or leaving the arena. Music never signals an unseen teammate’s encounter.

Six one-time quiet beats remain: Relay arrival (6 seconds), Underworks quarters (8),
Glasshouse practice (6), Hollow dock (8) and listening gallery (10), Shadow chapel
(10). Danger ends them early. Ordinary records, checkpoints, power and transit duck
the music rather than stopping it. Live co-op maps keep their score. Settings,
backgrounding, death and results still stop it. Continue, retries and old saves
resume the current rotation without a fresh arrival cue. Menu alternation remains.

Validation includes every traversable cell having a score and complete district
routes with more than 93% music-source coverage in deterministic audio simulations,
plus bounded decoding, stale-load cancellation and local/co-op threat tests.

## 0.9.1 — Menu rotation and weapon framing

After an audio-unlocking tap, the menu continuously alternates Containment Pulse
and Lanterns Below with a 1.2-second crossfade. Settings keep the music running;
the audio test, mute, backgrounding and mission start fade it out. Mission scoring
and intentional silences stay unchanged. Failed loads retry at most every 15 seconds.

Held guns default to 70% size, farther right and lower. Settings → Weapon view
adds saved size, horizontal-position and lowering sliders plus a reset button.
Portrait views leave clearance above the bottom HUD.
These preferences apply to every gun on both renderers and only affect the local
view, leaving aim and co-op simulation unchanged.

## 0.9.0 — Beneath The Shadow

A standalone buried-city expedition adds three bosses, a finite multiplying
hydra, three earned weapons, two optional gantry courses, three secrets and
three original tracks. The score follows authored places and silences. Co-op
maps remain live; both operators in menus pause the world. See the
[mission, soundtrack and co-op rules](breach-shadow-090.md).

## 0.8.4 — Authored musical placement

The menu has an explicit theme control. Mission openings and later sections
now have fixed cues, including three deliberately silent arrivals. Enemy counts
no longer choose tracks. See [the placement map and playback rules](breach-score-084.md).
Weapon discovery and campaign progression remain the next design pass.

## 0.8.3 — Music checks and visibility

Settings now includes a short Test music control using the game audio path.
The menu links to the soundtrack and clearly labeled campaign proposal.
First-cue preparation, missed-download cooldown and interrupted audio recovery
are corrected. See [the audio follow-up](breach-audio-083.md).

## 0.8.2 — Thirteen Signals

Twelve further original MIDI cues, restrained mission/zone placement and a
listening room expand the score. Settings links to all thirteen auditions and
a seven-chapter campaign concept. See [soundtrack behavior](breach-music-082.md)
and the [campaign proposal](breach-campaign.md). The proposal does not yet add
a persistent campaign mode or an ending choice.

## 0.8.1 — Occasional music

An original MIDI composition, Containment Pulse, now appears as a single-pass
cue during sustained nearby combat, with long quiet intervals and its own
toggle/volume. It yields to enemy warnings, tapes, maps, and regrouping. See
[music placement and playback](breach-music-081.md).

## 0.8.0 — The Hollow

The seventh mission is a larger solo/co-op listening-facility expedition with
reversible containment routing, optional tapes, Echo stalkers, and the Choir
Keeper. See [the Hollow update](breach-hollow-08.md).

## 0.7.0 — The Glasshouse

The sixth mission supports solo and co-op play through a connected research
conservatory. It adds the Rebound carbine, Thumper grenade launcher, shielded
bulwarks, healing menders, and conservatory artwork in both rendering paths.
Weapon racks now equip both co-op operatives, while ammunition use and weapon
selection remain personal. See [the Glasshouse update](breach-glasshouse-07.md)
for the release details and current validation record.

## 0.6.0 — Switchyard and deliberate touch controls

A compact fifth solo mission, reversible shutters, the Arc caster, and a default
phone gesture that separates aiming from firing are documented in
[the Switchyard update](breach-switchyard-06.md).

## 0.5.0 — Read the facility

Environmental equipment cues, discovery-focused guidance, staged faction and
phase encounters, a patterned reactor guardian, and compact phone controls are
documented in [the gameplay update](breach-gameplay-05.md).

## Run and publish

Requires Python 3.10+ to build. The static build uses only the standard library;
no npm or pip install is needed. Three.js 0.180.0 is vendored with its MIT license.

```sh
python scripts/build_breach.py
python -m http.server 8000 --directory dist_breach
```

The first command loads and validates the `breach` DFE theme and uses DFE's HTML
renderer. It exports the generated document and assets into `dist_breach`.
Open `http://localhost:8000` in a browser. A file:// URL is not suitable for ES modules.

For the existing Flask application, install `requirements.txt` and use
`DEFAULT_THEME=breach` or `/?theme=breach`. The exact same source assets are served
through DFE's existing `/daily_flyer/` route.

Render Static Site settings:

- Repository: `shnider42/daily_flyer`
- Branch: `feat/breach-fps`
- Build: `python3 scripts/build_breach.py`
- Publish directory: `dist_breach`
- Environment: `SKIP_INSTALL_DEPS=true`
- Automatic deployment: on commit

## Play

Select an operation from the mission briefing. Blacksite 07 introduces power,
security keys, and extraction. Dead Relay is a second facility: restore ring
power, activate western and eastern relays, enter the communications vault, and
recover its key before returning to extraction control. Both operations include
supplies, an optional secret, and checkpoints. Guidance level and combat difficulty
are separate settings.

Crosslink is a compact third mission with a power hub and two relay branches.
It supports solo play and is the first operation available in private two-to-four-player
co-op. Choose Play with friends to create or join a room; see
[private co-op](breach-multiplayer.md) for joining, shared pause, and checkpoint rules.

The Underworks is a large fourth operation, playable solo or in co-op. Explore
nine connected sectors, recover three permanent traversal tools, return through
newly opened shortcuts, and reconnect the reactor before returning to the
arrival lift. See [The Underworks](breach-underworks.md) for its exploration,
refuges, transit links, and expanded map.

Switchyard is the fifth solo mission: choose a freight-yard or service approach,
operate reversible shutters, recover the Arc caster, reconnect two gallery
relays, and return past the guardian to the freight lift.

The Glasshouse is the sixth mission and third co-op operation. Explore the
ballistics practice bay, restore the planted atrium, follow either cultivation
wing to its relay, defeat the propagation guardian, and open the direct route
back to the laboratory lift. Bulwarks expose their shields between attacks;
menders can be interrupted while healing other creatures.

The current arsenal has eight weapons: pistol, Scattergun, Arc caster, Rebound
carbine, Thumper, Rivet repeater, Null projector and Breach lance. Availability
depends on the mission and weapons recovered. The Rebound reflects once from a solid wall; closed doors absorb
its slug. Thumper grenades bounce and detonate after a fuse, with splash blocked
by walls. Your own grenade can hurt you, and friendly fire allows its splash to
hurt teammates in Tomorrow. Rebound and Thumper require deliberate firing even
when automatic fire is enabled.

Desktop uses WASD movement, mouse look (or click-and-drag when pointer lock is
unavailable), firing, E interaction, and the pause menu. The game displays its
current control bindings. Touch uses the left movement pad and right-side aiming.
Safe fire controls are the default: drag to look, tap Fire for one shot on release,
or hold it still briefly to fire continuously. An immediate drag starting on Fire
becomes look-only. Classic immediate fire-and-drag remains selectable in Settings.

Desktop also supports F for fullscreen, 1–8 for direct weapon selection, and Q or
the mouse wheel to cycle acquired weapons. The bottom inventory selects a carried
weapon directly on phone or desktop. Settings offer automatic, wide, or wider
field of view and automatic, performance, or sharp graphics. Fullscreen is available when the browser supports
the API; ordinary windowed play remains available. Graphics remain deliberately
pixelated, with bounded render sizes in both WebGL and the software fallback.

Saves and preferences are browser-local and do not sync between devices. Clearing
website data clears progress. Private browsing or blocked storage may prevent
persistence; gameplay continues without requiring storage. The game pauses when
the page loses focus or becomes hidden.

There is one current-run save. Selecting another mission's briefing does not
replace it; Continue identifies the saved mission. Starting a new run replaces
the current save. Blacksite saves from 0.1.x remain compatible. A mission link,
such as `?mission=relay-09`, selects its briefing without starting it.

## Validation

The current 0.12.0 regression gate passed **457 JavaScript tests** and **three
Python export tests**. Browser inspection checked the actual software-renderer
presentation; automated rendering tests also cover GPU scene geometry and art
selection. This does not establish real GPU screenshot quality, physical-device
performance or a live deployed 0.12.0 service. See
[the current validation record](breach-society-0120.md).

The historical release records below retain their original results and scope.

```sh
npm run test:breach
python -m unittest discover -s tests -p test_breach_export.py
```

Initial 0.1.0 release checks completed on 2026-10-29:

- **18 core tests passed:** mission routing and gates, movement and collisions,
  weapon damage, projectile and enemy behavior, secrets, checkpoints, save
  validation, and persistence of the active run's difficulty. The complete route
  test disables enemies to isolate navigation; a separate live-combat test clears
  the first three enemies using normal standard-difficulty pistol damage.
- **3 export tests passed:** DFE theme integration, complete local resources and
  module imports, and preservation of ordinary DFE card rendering.
- Flask route checks passed for the game document and its assets.
- Cloud browser checks exercised movement, firing, saving, and resuming with the
  Canvas fallback renderer. WebGL was unavailable in that QA browser, so the
  WebGL rendering path remains unverified there.

The user has completed an initial phone playtest and reported that it works,
with some rough edges. This is informal feedback rather than a device benchmark;
touch aiming, simultaneous controls, and sustained performance still need focused
real-device checks. The broader legacy
`test_theme_platform` suite has three pre-existing failures on the base branch;
the focused BREACH suites above pass.

## 0.1.1 — Phone guidance and actions

This small follow-up concentrates on reading and using the existing mission:

- Compact touch guidance sits near the objective, leaving the aiming area clear.
  Nearby interaction feedback takes priority over the tutorial, and the firing
  lesson waits until a hostile is in view.
- Touch interaction controls show the available action, such as OPEN, POWER, or
  EXTRACT. Unmet requirements show OFFLINE or LOCKED with an explanation. The
  interaction prompt can also be tapped; weapon swapping appears after acquisition.
- Simple guidance correctly tells the player to walk over the security key,
  instead of asking for a USE prompt that cannot appear.

The simulation, combat balance, level, save format, and aiming sensitivity remain
compatible with 0.1.0. Focused core coverage now includes 20 passing tests.
All three export tests also pass. Browser checks at 375×667, 393×852, and
852×393 confirmed the guidance stays above the aim point, arrival-door prompts
open the door when tapped, offline controls stay disabled with an explanation,
the nearby key hint uses collection wording, and tutorial dismissal still works.
These layout checks use desktop browser viewports with the touch UI enabled;
they do not measure physical-device touch latency or frame rate.

## 0.2.0 — Dead Relay and desktop play

- Added a second authored 35×33 facility, with a ring layout, 20 enemies, two relay
  branches, a gated central vault, an extraction uplink, and a service cache.
- Relay consoles require power. Both must be activated before the vault unlocks.
  The second relay refreshes the checkpoint so the completed circuit is saved.
- Added mission selection, mission-specific briefings and progress, and a next
  mission action on successful extraction.
- Gave Dead Relay its own blue concrete, relay hardware, zone signs, and console
  status visuals in both rendering paths, plus a relay activation sound.
- Added fullscreen, wheel-based weapon switching, field-of-view choices, and
  graphics presets for desktop play. Phone guidance and touch controls remain
  available for either mission.
- Kept the desktop launch menu within an 810px-tall viewport, including both
  mission choices, Continue, settings, and the full briefing.
- Restarting a continued mission preserves its saved difficulty and seed.

Validation: all **27 core tests** and **3 export tests** pass. New coverage checks
the complete Dead Relay route with real movement, both relay orders, vault/key
requirements, the second-relay checkpoint, mission isolation, legacy saves,
and an opening live-combat encounter. Route tests disable enemies to isolate
navigation; they do not establish combat balance for the entire mission.

Browser checks exercised the mission selector, preserved Continue across mission
selection, a genuine 0.1.1 Blacksite save, desktop E interaction and mouse-wheel
weapon switching, field-of-view/quality controls, and fullscreen rejection in an
embedded view. At 393×852 and 852×393, touch controls linked the second relay,
showed 2/2 progress and a checkpoint, and completed extraction. Completing
Blacksite exposed the Next: Dead Relay action, which started the correct new
mission. The desktop menu fits 1440×810 without scrolling. These checks use the Canvas fallback because
the QA browser disables WebGL; actual GPU performance and physical-device touch
latency still need playtesting.

## 0.3.0 — Crosslink and private co-op

- Added Crosslink, a 23×21 third facility with eight enemies, two short relay
  branches, a gated key vault, extraction, a secret, and two checkpoint moments.
- Added private two-player rooms with invite links, readiness, shared start,
  shared pause, a 60-second reconnect window, and team checkpoint retry.
- The server owns movement, enemy targeting, damage, pickups, and mission
  progression. Clients predict local movement and smooth teammate motion.
- Teammates appear in both the WebGL and software renderers, with directional
  weapon poses, distinct uniforms, and downed/revived states.
- Each player retains personal controls and guidance. Room sessions have a
  separate live-state protocol and never overwrite a solo save.

The first co-op release is deliberately limited to Crosslink and two players.
Rooms are temporary and end on a server restart or deployment. Full operational
details and validation commands are in [breach-multiplayer.md](breach-multiplayer.md).

Validation: 69 focused JavaScript tests and three Python export tests pass. The
JavaScript suites cover the original missions, complete solo/team Crosslink
routes, authored live combat, independent combat inputs, shared pickups and
objectives, checkpoint revival/retry, transport privacy, real two-client
WebSockets, pause/resume, disconnects, and reconnect lifecycle. Browser QA covers
room creation/readiness/start, a rendered teammate, shared airlock interaction,
pause/resume, same-tab reload/rejoin, room closure, and preservation of an
existing solo Continue record. Portrait 393×852 and landscape 852×393 layouts
were inspected with touch controls. These browser checks use the software
renderer; physical-device latency and WebGL performance still need playtesting.

## 0.4.0 — The Underworks

- Added an authored 81×81 exploration world with nine connected sectors,
  3,504 walkable tiles, 40 enemies, and a reactor guardian.
- Added permanent cutter, insulator, and phase upgrades that open several
  routes each, including return shortcuts and optional supply caches.
- Added eight reusable refuge checkpoints, four paired transit routes, and a
  hidden +25 maximum-health expansion. Transit moves only its acting operator;
  upgrades and the health expansion benefit the whole co-op team.
- Added a paused, zoomable map with local and facility views, sector navigation,
  discovered landmarks, upgrade markers, and survey progress. Opening the large
  map pauses the team in co-op; both operators resume together afterward.
- Added distinct sector palettes and station artwork to both rendering paths.
  The large map uses exposed wall faces, spatial rendering batches, and bounded
  distant-enemy work to keep its larger footprint practical.
- Added Underworks room selection and protocol 2, so a cached older client
  cannot join a mission whose geometry it does not recognize.

Validation: **89 JavaScript tests and three Python export tests pass**. New
coverage walks the entire Underworks in both relay orders, including the
upgrade-gated return loops, health annex, a live standard-difficulty guardian,
transit back to arrival, and extraction. Ordinary enemies are disabled in those
route checks; separate authored opening encounters exercise normal solo and
two-player combat. Tests also cover permanent progress after retry/restore,
rejection of inconsistent saves, shared health and equipment, actor-only transit,
refuge revival, and refusing refuge use while either operator faces a ranged
attack or an incoming projectile. Renderer tests inspect actual Three.js geometry
and state changes in both paths without claiming a measured GPU frame rate.

Browser QA at 393×852 and 852×393 verifies the map, sector navigation, zoom/pan,
phase-module acquisition, reusable refuge healing to 125 HP, reactor-return
transit, lift unlock, and extraction using validated local test saves. A desktop
room check with a real WebSocket teammate verifies Underworks selection/start,
shared transit activation, map pause, both-player resume, and solo-save isolation.
These checks use the software renderer. Physical-phone input latency, sustained
GPU performance, and the full expedition's combat pacing still need playtesting.

## Scope

The game contains nine authored missions, an expanding earned arsenal, distinct
enemy roles and guardian encounters, power/key progression, relay objectives,
optional secrets, checkpoints and branching results. Private two-to-four-player
co-op is available for Crosslink, The Underworks, The Glasshouse, The Hollow,
Beneath The Shadow and The Wrong Side of Tomorrow. Shared
leaderboards, accounts, public matchmaking, and a procedural campaign would
require separate design and validation.

The renderer, textures, enemy artwork, interface, and synthesized sounds are
original project code. Three.js is distributed under `vendor/THREE-LICENSE.txt`.
The room server uses the MIT-licensed `ws` package. No original Doom game assets
are included.
