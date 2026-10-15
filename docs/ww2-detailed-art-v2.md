# Detailed unit artwork v2

This is a presentation-only replacement for Detailed mode. Basic symbols,
counter hit targets, faction colours, names, AP/strength, status markers, saved
battles and all gameplay rules are unchanged. In particular, no Midway 2.0
mechanics, scenario data or balance have been edited. The user approved this
direction and inclusion of Midway 2.0 on October 14, 2026. Carrier air-group
manifests now show aircraft thumbnails too, using the same Basic/Detailed
preference. This is a visual change only; existing deck-order buttons remain.

## Art direction and provenance

48 original hand-painted-style military miniatures were generated with the
built-in image-generation tool, as four transparent atlases. This follows the
earlier request for a grounded military-miniature feel and a genuinely richer
Detailed setting, rather than adding a few lines to Basic's silhouettes. The
older v1 illustrations are retained in the repository, unchanged.

Production files are in `ww2_tactics/static/unit-images/`:

| File | Miniatures | Dimensions | Size |
| --- | ---: | --- | ---: |
| detailed-infantry-v2.webp | 16 | 1254 × 1254 | 402,280 bytes |
| detailed-armour-v2.webp | 12 | 1448 × 1086 | 367,386 bytes |
| detailed-air-v2.webp | 12 | 1448 × 1086 | 334,156 bytes |
| detailed-naval-v2.webp | 8 | 1774 × 887 | 355,078 bytes |

The generated PNGs were encoded as WebP at quality 88, retaining full-quality
alpha. No external commercial art was copied. Images use versioned URLs to
respect the application's immutable artwork cache policy. All four total about
1.46 MB; only atlases needed for visible Detailed units are requested. Basic
does not create image elements or request these assets.

## Generation prompt set

The following records the production brief and exact row-major subject orders
used for the four built-in generation calls. There were no edit-model passes.

Shared direction: a production transparent sprite atlas for Detailed icons in
an established WWII hex strategy game. Grounded hand-painted military
miniatures / polished historical strategy-game portraits, realistic proportions,
sculpted fabric folds, worn leather, convincing steel construction, crisp dark
navy contours and warm ivory edge highlights. Muted olive, khaki, field grey,
slate blue and restrained earth tones. Coherent soft upper-left lighting,
readable silhouettes at 40 pixels and richer material detail at 160 pixels.
Not flat symbols, cartoons or chibi figures. Complete isolated silhouettes,
equal cells, 10–12% transparent margins. No grid lines, labels, typography,
frames, scenery, ground shadows, smoke or explosions; true alpha transparency.

Infantry: square 4 × 4 grid; compact kneeling/crouching figures generally facing
right in three-quarter view, except commander and parachutist.

1. American helmeted rifleman aiming a Garand; German field-grey rifleman with
   distinctive helmet aiming a bolt-action rifle; helmeted lieutenant holding
   map and pointing; peaked-cap senior commander holding binoculars at chest.
2. Scout looking through binoculars; engineer with broad entrenching shovel;
   kneeling bazooka soldier; sniper with clearly scoped rifle and foliage helmet.
3. Radio operator with backpack radio, antenna and handset; mortar crewman
   operating elevated tube on baseplate; green-beret commando with submachine
   gun; mountain infantryman with wool cap, rope and ice axe on pack.
4. Civilian resistance fighter in flat cap and brown jacket; East African
   colonial infantryman in khaki shorts, puttees and red fez, dignified depiction;
   airborne pathfinder tuning a beacon radio with parachute harness; entire
   round cream parachute, suspension lines and descending soldier.

Armour/equipment: 4 × 3 grid, slightly overhead three-quarter side view, guns
and vehicle fronts generally right. Moderately light surfaces on navy counters.

1. Sherman medium tank with rounded turret; boxy Tiger I with broad tracks;
   Sherman Firefly with extra-long slender barrel; Soviet KV-1 with tall boxy turret.
2. Matilda II with riveted track skirts; M3-style half-track with rubber front
   wheel and rear track; towed shielded anti-tank gun; belt-fed tripod machine
   gun with perforated barrel and ammunition box, no crew.
3. Supply handcart with crates, packs, jerrycan and blankets; light 20 mm AA gun
   on small cruciform mount; heavy 88 mm AA gun with long elevated barrel and
   large cruciform carriage; large circular searchlight on wheeled carriage,
   without an emitted beam.

Aircraft: 4 × 3 grid, consistent three-quarter overhead angle with noses toward
lower right, entire wings, propellers and tails visible. Restrained panel detail,
glass canopies and weathered metal; no text or political emblems.

1. Spitfire with elliptical wings and olive/brown camouflage; grey/yellow-nose
   Bf 109; chunky blue-grey F4F Wildcat; slender light-grey A6M Zero with subtle
   circular red wing roundels.
2. Twin-engine B-25-inspired medium bomber with glazed nose and twin tail;
   blue-grey SBD Dauntless with perforated dive brakes; olive B5N Kate with long
   cockpit and visible torpedo; olive C-47 Dakota transport with cabin windows.
3. Four-engine twin-fin Lancaster; four-engine broad-fuselage Halifax;
   twin-engine smooth-fuselage Mosquito; twin-engine Bf 110 night fighter with
   nose radar antenna prongs.

Naval/installations: 4 × 2 landscape grid, slightly overhead three-quarter side
view, bows right, no waves/wakes or extreme foreshortening, light slate steel
and muted timber decks.

1. Yorktown-inspired US carrier with island and small blue aircraft;
   Akagi-inspired Japanese carrier with different island/funnel arrangement,
   light-grey aircraft and red deck circle; heavy battleship with large turrets
   and stepped bridge; slender three-funnel cruiser.
2. Low destroyer with two funnels and torpedo tubes; open troop-well landing
   craft with raised loading ramp; rectangular wire-mesh radar on braced tower
   with small equipment cabin; corrugated hangar, control tower and short
   concrete runway apron, no surrounding landscape.

## Mapping and limitations

`unit-art-illustrations.js` maps every one of the 34 current unit kinds and the
16 named variants. US/Japanese carriers, four fighter profiles, five tank
profiles and specialist infantry are differentiated. Mosquito fighter and
Pathfinder share the same airframe with a Pathfinder mark. AA and torpedo
cruisers share the cruiser model with distinct role marks. Rank marks remain
visible for lieutenant/commander. Amphibious units switch between landing craft
and infantry according to terrain. Units without a dedicated national model
use the generic role illustration; these are recognition aids, not claims of
exact historical unit equipment or ship class. Generated fine details should
not be treated as historical references.

Each unit keeps its deterministic SVG symbol until its illustration loads.
An image error leaves the symbol visible. Explicit source clipping prevents
neighbouring atlas cells from leaking through aspect-ratio letterboxing. Map,
unit close-ups, carrier/reserve portraits and replay all use the same renderer.

## Verification and preview

- `node --check` passes for both artwork scripts.
- `tests/ww2-unit-art-dom.cjs`: 34 kinds, 16 variants, faction mapping,
  land/water change, image load/error paths, every source clip, preserved input
  and status, Basic/Detailed persistence, close-ups, reserves and replay at
  2560/390 viewport widths. JSON battle state is unchanged after toggling.
- `tests/ww2-gameplay-backports-dom.cjs`: full application script boot and real
  Flask test-client gameplay checks at both widths pass with the new renderer;
  Midway's four-flight manifest, correct aircraft portraits and style toggling
  without changes to battle state are covered.
- `--preview` creates the self-contained `artifacts/unit-art-v2-preview.html`.
- `--render` produces an offline SVG-rendered counter proof, not a browser
  screenshot. `--all` includes every test entry. These proofs were inspected
  and used to correct atlas source clipping.
- Full live-browser visual QA remains pending: the browser could not connect
  to the local preview server. Do not represent the DOM tests as browser QA.

Local test command (with jsdom available on NODE_PATH):

```sh
node tests/ww2-unit-art-dom.cjs --preview
node tests/ww2-gameplay-backports-dom.cjs
```

Offline proofs additionally require Sharp and ImageMagick. The browser harness
`tests/ww2-unit-art-browser.cjs` was updated for Detailed image loading, but was
not run in this pass.
