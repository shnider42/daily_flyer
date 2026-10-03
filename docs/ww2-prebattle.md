# Pre-battle landing playtests

Choose **Category → Pre-battle** on Home, Solo or Next battle. Start **Shingle
Cove** to learn the setup loop, or **Operation Breakwater** for a broader front.
Both are fictional Omaha-inspired settings; the existing Omaha Beach map stays
available with its original immediate-start rules.

| Operation | Size | Forces, including passengers | German bunkers | US naval missions | Deadline |
| --- | --- | --- | --- | --- | --- |
| Shingle Cove | 10×12 | 10 US / 6 German | 2 | 2 | Round 14 |
| Operation Breakwater | 22×22 | 18 US / 12 German | 4 | 4 | Round 24 |

The attacker wins by occupying the beach-exit command post at two consecutive
American turn endings. Germans win by preventing this through the deadline.
Existing elimination and resignation rules also apply. Balance is experimental;
these are compressed tactical maps, not historical reconstructions.

## Preparation

Both armies prepare independently. There is no alternating setup turn and no AP
cost. The host may begin planning before the guest joins. Existing legal default
positions mean players can immediately review and lock if they prefer.

- **Americans:** move loaded landing craft and amphibious sections within the sea
  deployment zone. The selector names each boat's passenger. Passengers move
  with their boat and cannot deploy independently. Mark optional inland naval
  targets without seeing German units or fortifications.
- **Germans:** arrange their fixed force within the inland deployment zone,
  including otherwise immobile anti-tank guns. Place optional bunkers on open
  ground; roads and the objective cannot be blocked. Bunkers must be at least
  two hexes apart. Infantry in bunkers starts dug in; MGs and anti-tank guns
  start on overwatch, subject to normal sight and firing rules.
- **Both:** use Place units or the second planning tab, then tap highlighted
  hexes. Tap a bunker/fire marker again to remove it. Reset my plan restores only
  your side's default positions and clears only its structures or targets.
  Review & lock opens an explanation and summary before the final Lock action.

Locking is final. The other side may continue arranging its own force. When both
plans are locked, the opening naval fire resolves once and Americans begin round
1 with their ordinary AP. Unused budgets are forfeited; no purchase economy or
random force generator is included. Normal unloading, smoke, combat, supply,
radio and victory rules apply after preparation.

## Naval preparation

Aim points must be at least three hexes apart. The server rolls one d6 per fire
mission: 3–6 lands on the aim point; 1–2 scatters one neighboring hex using a
second die. Edge scatter stays on the board. The impact and its adjacent hexes
receive the same suppression effect.

Exposed non-armored units lose one strength, are pinned and lose overwatch/dug-in
status. Preparation never reduces a unit below one strength. Units in an intact
placed bunker are pinned but lose no strength. Armor is unaffected. Preparation
does not destroy structures or trigger building-collapse casualties. This keeps
the opening gamble useful without an army-wiping roll before the first turn.

Public shell reports contain aim, impact and roll only. **Battle → mission**
lists these results, with no confirmation of unseen casualties or bunker hits.
Live spotting begins after both plans commit. Normal combat can subsequently
reveal or damage fortifications. Setup dice cannot be undone or rerolled by
repeating Lock, reconnecting, or restoring the resulting checkpoint.

## Privacy, compatibility and computer play

`deployment_version: 1` exists only on new matches created from these two maps.
Old saves and all other scenarios keep their prior rules. The extra public lobby
field is only `phase`; no plan, coordinates, seat keys or force details are added
to the game directory. No database migration or Render setting is required.

During planning, the server sends only the requesting army's units, legal setup
zones and its own bunker/fire plan. Enemy units, contacts, logs and setup orders
are excluded. Initial transient sightings are discarded. Bunkers are staged in
the private plan and do not alter the authoritative battlefield until both sides
lock. Once committed, they use the existing per-army remembered terrain system;
the base survey never contains the hidden placements. Private plans remain
absent from subsequent public snapshots.

Placement uses the existing seat authentication, serialized SQLite writes and
revision checks. Illegal positions, wrong-side edits, stacking, malformed
coordinates, over-budget plans and edits after locking are rejected server-side.
Ordinary combat and end-turn orders are rejected during preparation. Setup uses
no per-order undo snapshots: reposition/reset provides the reversible workflow
before lock, and committed naval results are irreversible.

Solo setup works for either human army, including rematches with swapped seats.
The computer uses only published map geometry and its own force. German AI
distributes bunkers along the defensive belt and positions MGs inside them; US
AI uses the default loaded approaches and dispersed blind fire aims. Neither
consults the other army's secret units, bunkers or targets. The usual computer
turn and fog-filtered replay resume after setup. SAVE checkpoints preserve a
partially prepared plan; MOVE and returning-browser sessions resume the same
live plan without generating new positions or dice.

## Presentation and artwork

The setup panel replaces the normal orders area while preserving a usable map
in phone portrait, landscape and desktop layouts. It supports all three
Experience levels, a full-name force selector, keyboard-activatable map targets,
tap-accessible explanations, and an explicit lock review. Map placement updates
reuse the existing terrain/counter renderer. Existing lag/stability work is
preserved; this release makes no promise of faster server order processing.

Nine specialist placeholders now use the original generated
`ww2_tactics/static/unit-images/specialists-atlas-v1.webp`: radio, mortar, supply,
commando, mountain infantry, resistance fighter, colonial infantry, airborne
pathfinder and flak. A single versioned transparent WebP is shared across the
map, close-ups and replay. Each nested SVG viewport clips only its own sprite;
the existing symbol remains until the image loads and survives asset failure.
Faction colors, strength/AP text, hit targets and status overlays remain separate
from the decorative art. Existing rank insignia and vehicle artwork are retained.

The atlas was generated with the built-in image tool, then converted from RGBA
PNG to WebP at quality 90, preserving alpha without resizing. It is 1254×1254
and approximately 444 KiB. It is game identification art, not a claim of exact
national uniforms for every faction that shares a role. No external reference
images or commercial art packs were copied.

Generation prompt:

> Use case: historical-scene. Asset type: ONE production sprite atlas for an existing WWII hex tactics game, a precise 3 column x 3 row grid of NINE distinct standalone unit/equipment illustrations on genuine transparent background, square canvas. No written labels, no borders, no scenery, no grid lines, no watermarks. Every cell same square size; each illustration centered INSIDE its cell with a generous 12 percent transparent margin all around, never crossing cells. Painterly realistic tabletop miniature artwork, strong clean silhouettes, olive drab/khaki/steel material colors, warm ivory edge light, readable at small game-counter size. Match WWII vehicle miniature cutout illustration aesthetic, natural proportions, detailed but bold. ROW 1 LEFT: WWII field radio backpack with long aerial, handset and a helmeted kneeling radio operator in three-quarter view. ROW 1 MIDDLE: WWII portable infantry mortar with angled barrel, baseplate, bipod and kneeling crew member. ROW 1 RIGHT: WWII supply handcart carrying stacked wooden ammunition crates, canvas packs and rolled tarp. ROW 2 LEFT: WWII commando crouching, green beret, compact submachine gun. ROW 2 MIDDLE: WWII mountain infantry with climbing rope coiled across backpack, pickaxe, wool cap and rifle. ROW 2 RIGHT: WWII resistance fighter in civilian jacket and flat cap with rifle. ROW 3 LEFT: East African WWII colonial infantry soldier with dark skin, khaki uniform and fez, holding rifle. ROW 3 MIDDLE: WWII airborne pathfinder kneeling beside a small radio beacon with antenna, parachute harness visible. ROW 3 RIGHT: WWII anti-aircraft flak cannon, angled long barrel with gun shield and cross-shaped ground mount. Consistent coherent style and object scale across all nine cells. Keep all artwork completely isolated on actual transparent background, no checkerboard painted into artwork.

## Validation

The dedicated Python suite covers both maps, legal defaults and connectivity,
free boat/passenger placement, fixed-gun deployment, budgets and spacing,
one-sided reset, strict public-view invariance under enemy setup edits, locking,
scatter, nonlethal suppression, bunker protection, no dice reroll, both AI seats,
revision conflicts, authentication, SAVE restore and swapped solo rematches.

The dedicated browser suite uses actual placement/lock controls on phone and
desktop, both armies in independent browsers, all Experience levels, reload and
resume, narrow portrait/landscape, both desktop layouts, image loading, normal
movement/unload after setup, and map-size stability during orders. Existing
battlefield tests now lock preparation before exercising combat turn limits and
victory; the lobby test still requires an exact summary-only schema including the
new phase string. Catalog tests expect 22 maps and Breakwater as the newest.

See `ww2-prebattle-validation.md` for final gate results. Physical iPhone
performance and human-versus-human balance remain playtest questions.
