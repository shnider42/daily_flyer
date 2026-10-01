# DSL: support, observation and airborne operations

For the later commander-directed drop rules, see [Operation Iron Lantern](ww2-iron-lantern.md). The reserve rules below remain in effect on the earlier maps.


New DSL battles save `tactics_version: 1`. Existing battles keep their saved
rules; there is no database migration or live-match rewrite. Classic is unchanged.
Start a new battle, or agree to a rematch, to use these additions.

## Shared balance rules

| Capability | Cost / limits | Effect |
| --- | --- | --- |
| Commander artillery and recon | 2 AP, two charges each; independent cooldowns | Used in R1 → unavailable R2 → ready R3. Existing range, delay and recon duration remain. |
| Engineer tank repair | 2 engineer AP, one of three kits, adjacent friendly tank; once per tank per round | +1 strength up to original maximum and repairs tracks. No tank AP cost, overhealing or reviving wrecks. |
| Explosive area fire | 2 AP; bomber also spends a bomb load | Any marked hex, occupied or empty. 5+ lands; the one-hex speculative fringe needs 6. |
| Tower observation | 2 AP entry, infantry only | Recon/sniper sight 12, other occupants 8; concealed spotting 6. Tower occupants can also be spotted from 12. |
| Snipe | 3 AP, visible infantry and clear firing lane | Base 3+, cover and dug-in each add 1; 1 damage and pin. A miss does not pin. No armor damage. |

Area fire is a weapon-profile capability (`area_fire`), not a scenario or unit
name check. Tanks retain loaded AP/HE effects. AT weapons and naval guns use the
same resolver. Bombers retain their existing one-hex bombing radius, without an
extra fringe. Future explosive weapons can opt in through their profiles.
Surface shots cannot pass through intervening terrain or smoke. Normal direct-hit
cover/armor thresholds also apply to unit damage; aiming at a hex is not a way to
ignore protection. A successful structural round damages the aimed structure
even when it misses a sheltered unit. Damaged buildings/towers collapse and kill
all ground occupants, including friendlies. Splash still obeys weapon protection
and friendly-fire rules. Hidden occupancy never changes legal aiming previews
or reveals casualties in combat reports.

Towers are base terrain `tower`, use the shared building condition system, and
start intact. Observation to/from a tower can look over one intervening wood or
building, not two, another tower or smoke. Direct shots still need ordinary clear
LOS. Intact cover is +1; damaged cover is +0; destroyed towers prohibit ground
entry. Infantry in towers is exposed rather than concealed. Existing adjacent
spotting rules still apply.

Sniper teams have 2 strength, two personnel, rifle range 4 and ground sight 8.
The US-side roster pattern (including British/Soviet teams) has 3 base AP and
aimed range 6. German teams have 2 base AP and aimed range 7: bank 1 AP or receive
command support before aiming. Towers add 2 to aimed range, never to recon rifles.
Any sniper shot, including ordinary fire/reaction, exposes the team through the
following enemy turn. New sightings commit earlier orders. Otherwise undo/redo
restores the exact dice, cooldowns, kits, tracks, exposure and building conditions.
Snipers can ride half-tracks, but cannot spot or attack while aboard.

The computer uses repairs, aimed shots and observed/remembered area targets;
low-AP snipers bank for a useful aimed shot instead of automatically walking
forward. It does not inspect hidden targets for these decisions.

## Operations

| Map | Size / forces / limit | Playtest identity |
| --- | --- | --- |
| Carentan | 18×22, 14 units per army, 24 rounds | US airborne approach from the north, two flooded causeways, a defended town, church towers, airborne reserves and an armored linkup. German MGs, AT gun and half-track defend the junction. |
| Market Garden | 22×28, 20 units per army, 34 rounds | Forward US/British airborne pockets, British armored relief from the south, two river belts and three bridge routes. An amphibious section offers another crossing option. |
| Stalingrad update | Existing dimensions and unit count | One sniper team per army replaces one rifle squad; two towers create observation contests amid the existing randomized building damage. |

These are deliberately compressed, fictional tactical layouts. The historical
inspiration is the airborne/causeway fighting around Carentan and the airborne
landings plus armored relief corridor of Market Garden—not a claimed historical
order of battle. German airborne troops at Carentan are represented as ground
defenders; Germans do not gain the airborne drop action.

US infantry accuracy and German suppression advantages remain. British infantry
has no US accuracy modifier and suppresses on 4+, between German 3+ and US 5+.
One British Firefly-style tank trades the normal Allied 3 AP/range 6 for 2 AP/range
8; German tanks retain their extra strength. Balance numbers are a first playtest
pass, not a claim of equal win rates. Both new maps use the existing capture-and-
hold objective. Bridge destruction, multiple chained objectives, bomber variants
and a separate howitzer unit remain future work.

Historical context:

- [National WWII Museum: the 101st at Carentan](https://www.nationalww2museum.org/war/articles/101st-airborne-carentan-mitch-yockelson)
- [RAF Museum: Operation Market Garden](https://cms.rafmuseum.org.uk/blog/the-royal-air-force-and-operation-market-garden-chapter-5/)

## Interface and testing

Cooldown buttons remain visible and show the ready round. Repair and snipe use
marked map targets; choosing them hides movement destinations to prevent an
accidental move. Explosive aiming is separate from ordinary target fire.
Simple/full view, both terrain styles, illustrated/classic counters, Dad mode and
the existing fixed mobile map layout remain available. Full names replace role
codes in selection details. Blue dots show sight-only hexes, red bars potential
rifle/aimed lanes; outlines mark their boundaries. Concealment, AP and target type
still determine actual attacks. Disable these guides in Battle options.

`tests/test_ww2_operations.py` covers versioning, cooldowns for both armies, repair
limits, fog-safe area previews/reports, exact-roll redo, bomb/ship capabilities,
tower geometry, sniper exposure, transport, both new rosters/routes, AI choices,
save-code restoration and multiplayer seat filtering. The normal full gate is
`python -m ww2_tactics.devtools test`.

`tests/ww2-operations-browser.cjs` uses an isolated local database and tests real
actions at 320, 390 and 1440 pixels. It checks map continuity, unclipped action
buttons, both terrain styles, illustrated snipers, range guides and local
selection reuse. Browser tests use Chromium touch emulation, not physical Safari.

Release verification: 234 Python regressions passed. Operations, buildings,
weapons, campaigns and Dad mode browser suites passed, including 320/390/1440px
checks. Both new maps completed a full computer turn with valid nonnegative AP.
Selection reused existing map/terrain nodes; the fixture's median local render
was about 3 ms (not a claim about network latency or physical iPhone performance).

## Sniper artwork provenance

Asset: `ww2_tactics/static/unit-images/sniper-v1.webp` (384×384 with transparency),
generated with the built-in image-generation tool, then resized and encoded as
WebP. No artwork was extracted from the user's commercial-pack screenshot.
The clock-tower terrain extends the existing code-native SVG terrain system.

Prompt:

> Use case: stylized-concept. Asset type: illustrated unit counter for an existing WWII hex tactics web game, readable at 36 pixels and enlarged in unit details. Create a single original WWII sniper-team illustration: one kneeling or low crouched marksman holding a long wood-stock bolt-action rifle with a clearly visible period optical scope, compact silhouette, three-quarter side view. Muted olive and brown uniform, netted helmet, subtle worn cloth and metal texture, painterly scale-model rendering with clear warm highlights and dark edge definition. Center the entire person and rifle with generous transparent margins on all sides, roughly square composition. True transparent background, no environment, no base or ground plane, no flag, no text, no badges, no modern accessories, no gore. The scope and aiming posture must immediately distinguish this unit from ordinary infantry. Suitable as a faction-neutral sniper icon; the game supplies faction-colored counter backgrounds. Return a project-consumable image asset.
