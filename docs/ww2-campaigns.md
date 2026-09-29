# New theaters and the home-page refresh

This release adds three **fictional tactical scenarios**, not geographically or
historically exact reconstructions. Choose them in solo, multiplayer or rematch.
All three require DSL. Existing battles keep their saved maps, armies and rules.
No database migration or Render configuration change is required.

New DSL battles now use the shared [weapons and armor rules](ww2-weapons.md).
The theater movement and victory rules below remain; weapon effects are shared
across land, naval and air scenarios. Bombed AA crews can now be pinned and rally
for 1 AP, while aircraft and installations cannot be pinned.

## Home

The home page uses a map-table masthead, neutral sans-serif typography, a compact
operation briefing and direct links to new battles and the multiplayer directory.
The slogan is removed. New-theater shortcuts sit beneath the battlefield picker.
The existing commander sign-in, named games, recovery and saved sessions remain.

Two slow CSS-only ambient effects run on the home page. They stop during battles
and in background tabs. The footer switch persists locally; the operating system's
reduced-motion setting always takes precedence. No animation loop or third-party
font requests are added. Mobile battle layout, Dad mode, Simple view and separate
terrain/unit-style preferences remain intact.

## Scenarios

| Scenario | Size / limit | Forces and objective |
| --- | --- | --- |
| Stalingrad | 18×20 / 22 rounds | Soviets vs Germans. Engineers, rifle teams, MGs, scouts, AT teams, commanders and tanks. Soviets capture the factory command post and hold for two turn endings. |
| Omaha Beach | 18×20 / 24 rounds | Americans vs Germans. Four boats carry separate infantry units; amphibious sections and armor support the landing against prepared MG and AT positions. Capture the beach exit and hold twice. |
| Battle of Britain | 22×18 / 18 rounds | RAF vs Luftwaffe. Four RAF fighters, radar, two AA guns and two sector stations against three escort fighters and three bombers. Germany must destroy both RAF stations; RAF wins by preserving one through the limit or eliminating all bombers. |

Stalingrad has dense building blocks separated by vehicle corridors. Soviet
infantry does not inherit the American accuracy bonus. Soviet suppression is 4+
versus German 3+; Soviet engineers carry three smoke and three frag grenades.

Omaha's landing craft have 5 strength, 3 AP, two smoke screens and no weapons.
They move only on water and carry one friendly infantry unit. Boarding/unloading
costs the infantry 1 AP, not the craft. Passengers cannot fight, spot, command or
hold objectives. Unloading onto adjacent empty land can trigger overwatch. Sunk
craft permit a pinned, wounded escape only onto adjacent free land; otherwise
their passengers are lost. The separate amphibious sections retain their existing
self-contained land/water movement. Midway's landing sections keep their movement,
but use infantry protection rules in new battles: small arms cannot harm warships
and pins require a 1-AP rally.

## Air playtest v1

The dedicated `air_version: 1` rules isolate this experiment from ground combat
and Midway's abstract carrier sorties. Seat IDs remain `us` and `de` internally;
all player-facing faction labels use the scenario's actual armies.

| Unit | AP / strength | Movement and role |
| --- | --- | --- |
| RAF fighter | 4 / 3 | Up to 3 hexes per 1-AP flight leg; anti-air range 3. |
| German fighter | 3 / 3 | Same flight/weapon rules; escorts bombers. |
| German bomber | 3 / 4 | Up to 2 hexes per leg; bomb ground targets within 1 hex. Two bomb loads. |
| AA gun | 2 / 3 | Fixed; anti-air range 5, starts covering the Channel. |
| Radar | 0 / 3 | Automatic aircraft spotting to 10 hexes; no distant ground spotting. |
| Airfield | 0 / 4 | Fixed; adjacent friendly aircraft can repair/reload here. RAF stations are victory targets. |

Attacks cost 2 AP. Fighters hit bombers on 4+, other fighters on 5+, for 1 damage.
AA uses the same thresholds for 2 damage. Bombers hit ground targets on 3+ for 2
damage and expend one load. No infantry pins, terrain cover or terrain sight
obstructions apply. Radar detects aircraft; planes detect ground installations
within 4 hexes. Losing radar/airfields removes their spotting/service.

**Intercept / AA cover** costs 2 AP and reserves one reaction until the next
friendly turn. Each intervening hex is checked, not just the destination.
Fighter reactions add +1 to the threshold; AA reactions do not. Known threats
warn the player before flight; hidden enemies cannot leak into legal-move hints.
Flight paths cannot pass through another aircraft or finish on any occupied hex.
Hidden obstruction interrupts flight without permitting stacked counters.

**Service** costs 2 AP beside a surviving friendly airfield, once per turn:
repair 1 strength and restore a bomber to two loads. Aircraft/AA can bank 1 AP.
Station locations and destruction are public mission information; hidden health
and positions are not. Passing sightings become last-known contacts and commit
undo; combat redo restores the exact result without rerolling.

This is deliberately an approachable sandbox: **no altitude, fuel, heading,
mandatory forward movement, dogfight locking or campaign logistics yet**.
No claim of final balance is made. The next useful playtest questions are whether
escorts can protect bombers, whether AA coverage feels avoidable and readable,
and whether radar/service targets create meaningful choices.

## Art provenance and assets

Original raster artwork was generated with the **built-in image generation tool**,
not the CLI, external stock downloads or a traced commercial icon sheet. Existing
unit artwork and user-requested insignia remain available. Generated source art
was inspected, then resized/encoded with ImageMagick without altering composition.
Transparent sprite regions are clipped in SVG so the existing counter hit targets,
statuses, selection styling and Dad-mode close-ups still work.

| Repo asset | Generation prompt / direction |
| --- | --- |
| `ww2_tactics/static/operations/command-table-v1.webp` | Wide original WWII operations-desk photograph treatment: English Channel map, restrained map counters, binoculars and archival print edges; muted warm gray/tan, soft light, dark left negative space for HTML title; no legible words, slogans or insignia. Opaque masthead. |
| `ww2_tactics/static/unit-images/air-atlas-v1.webp` | Transparent 3×2 atlas, separated high-contrast painted-model silhouettes. Top: Spitfire, Bf 109, He 111. Bottom: cruciform AA gun, radar tower, Higgins-style LCVP. Muted olive/gray, readable at counter size, consistent illumination; no words, labels, borders or emblems. |
| `ww2_tactics/static/unit-images/airfield-v1.webp` | Transparent compact painted-model WWII airfield: control tower, low hangar and small grass-strip base; three-quarter view, muted olive/stone, strong readable silhouette; no typography or surrounding scene. |

The generated imagery is illustrative, not archival evidence or exact equipment
identification. Total new raster payload is about 280 KB, cached under versioned
filenames. No web fonts or additional application dependencies are required.

## Verification and local reproduction

Run `python -m ww2_tactics.devtools test` for the complete isolated regression
suite. `tests/test_ww2_campaigns.py` covers rosters, terrain, faction modifiers,
transport survival, flight paths, intermediate AA, role-specific attacks, rearm,
radar, transient sightings, deterministic redo, wins, AI and save restoration.

With Playwright and a Chromium executable installed, run the existing home/lobby
browser suites plus `tests/ww2-campaigns-browser.cjs`. The campaign suite starts
its own disposable local server/database and checks 320/390/1440-pixel layouts,
reduced motion, all three map pickers, original art, phone map continuity, Dad mode
and desktop flight previews. It does not connect to production matches.

Release checks: **184 Python tests passed**. The home, multiplayer-lobby and
campaign browser suites passed in headless Chromium, including phone-sized touch
emulation. Screenshots were reviewed at phone and desktop sizes. This is not a
claim of an on-device Safari test or a completed Render deployment.

General inspiration (not a simulation specification):

- [RAF: Battle of Britain](https://www.raf.mod.uk/what-we-do/our-history/anniversaries/battle-of-britain/) — radar and coordinated interception.
- [RAF Museum: The Hardest Day](https://www.rafmuseum.org.uk/research/online-exhibitions/history-of-the-battle-of-britain/the-hardest-day) — escorted bomber attacks and station targets.
- [National WWII Museum: Higgins Boats](https://www.nationalww2museum.org/students-teachers/student-resources/research-starters/research-starters-higgins-boats) — landing-craft context.

Follow [the operations workflow](ww2-operations.md) for Render deployment checks,
version verification and credential-free local reproductions. Refresh the browser
after deployment; start a new battle to use a new scenario.
