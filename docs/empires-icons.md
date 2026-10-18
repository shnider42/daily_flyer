# Empires unit artwork

Empires now uses the same Basic / Detailed approach as DSL, with a distinct
ancient-world family. All six unit roles, ordinary cities and walled cities have
painted miniatures and deterministic SVG silhouettes. The map, Units & cities,
phone selection control, Orders, target inspection and recognition guide use
one renderer. Full names remain beside portraits and in map accessibility labels.

On a phone, open **Menu → Units: detailed/basic**. Desktop has the same control
beside Refresh. Both games share DSL's existing `ww2-unit-style` preference;
switching it does not change Experience, campaign state, orders, selection or
camera position. This introduces a small `ww2UnitStyle` setter/getter around the
existing DSL preference, without replacing DSL artwork.

## Readability and behavior

- River League keeps blue, rounded counters; Highland Compact keeps rust,
  square counters. Color is not the only faction cue.
- HP and AP use a separate dark strip with bounded text. Enemy AP is never
  invented when it is absent from the public snapshot.
- Fortification, shaken status, capital crowns and selection brackets remain
  independent of image loading. All visible unit kinds have different silhouettes.
- Existing map input targets and retained counter nodes own interaction. Two
  units sharing a hex get smaller drawings within their existing offsets.
- The shared DSL movement renderer continues moving the art and status together.
- Image load errors leave the Basic silhouette visible. Atlas source clipping
  prevents neighboring sprites from leaking into a portrait's letterboxing.
- Basic creates no image elements. DSL-only visits do not request this atlas.

## Asset and provenance

The built-in image-generation tool produced one original eight-miniature atlas
on October 18, 2026. It was encoded as WebP at quality 88 with full-quality alpha,
without compositional changes. These are game recognition aids, not historical
equipment references.

Production asset: `ww2_tactics/static/unit-images/empires-miniatures-v1.webp`
(1774 × 887 pixels, 461,638 bytes, transparent). Source windows and fallback
drawings live in `ww2_tactics/static/empires-art.js`.

The versioned filename follows the existing immutable artwork cache policy.
All eight portraits share this one download. No external image service is
needed while playing.

The offline counter proof is `docs/previews/empires-icons-v1.png`. It shows
large portraits plus small Detailed and Basic counters on night/day surfaces;
it is not a browser or iPhone screenshot.

## Verification

`tests/empires-art-dom.cjs` checks the full application at phone width, all
Experience settings, shared preference persistence and switching from both
games, map/roster/order/guide consistency, image load/error behavior, city
variants, status markers, input ownership, a real move and AP expenditure,
shared-hex offsets, and desktop control restoration. Extra roles/statuses use
explicit local display fixtures, never writes to a live campaign.

Existing Empires gameplay, Experience and research DOM/API checks pass.
`tests/ww2-unit-art-dom.cjs` passes for DSL's 34 roles and 16 variants, including
reserves/replay, both styles and image fallback. Syntax and whitespace checks
also pass. Browser preview is unavailable in this environment; physical
iPhone/Safari layout and image-load behavior still need device playtesting.

To run the focused test with jsdom available:

```sh
node tests/empires-art-dom.cjs
```

Add `--proof` with Sharp available to regenerate the offline counter proof.

## Generation prompt

Use case: stylized-concept. Asset type: one production sprite atlas for Empires, an ancient-world hex strategy game related to a military-miniature board game. Create exactly EIGHT separate transparent cutout miniatures, in an exact regular 4-column by 2-row grid on a wide 2:1 canvas. Each equal square cell contains one entire isolated miniature, centered with at least 12% empty transparent padding on all four sides. Subjects must never touch or cross their cells. NO typography, labels, letters, numbers, frames, grid lines, UI, scenery, cast shadows, floating sparkles or backgrounds. True alpha transparent background, also between objects. Row 1 left to right: 1) ancient scout, cloaked crouching traveler in pale sage and brown, hand shading eyes, leather satchel and short walking staff, NO binoculars or modern gear; 2) bronze-age spearman with prominent long upright spear and large round bronze-edged shield, ivory tunic and bronze helmet; 3) ancient archer with a large clear curved wooden bow held ready, quiver, muted green tunic, no shield; 4) civilian builder in ochre linen, broad iron spade held diagonally in front and tool belt, no weapon. Row 2 left to right: 5) settlers represented by a compact two-wheeled wooden handcart loaded with rolled ivory bedding, baskets and travel bundles, accompanied by a walking civilian in a rust cloak; 6) ancient wooden galley with low long hull, visible bank of oars, ONE large cream square sail and simple bronze ram, entire sail and all oars included, no water or wake; 7) small ancient city cluster, three cream limestone buildings with terracotta roofs and one slightly taller square civic hall, no defensive walls; 8) a matching ancient city cluster encircled by clearly visible low pale-stone crenellated walls and gate, not a medieval castle. Style: grounded richly painted historical tabletop miniatures, natural proportions, sculpted cloth, convincing wood grain and worn bronze, crisp deep navy contours with warm ivory edge highlights, coherent soft upper-left lighting. Earthy ivory, muted sage, ochre, rust, slate and bronze; sufficiently bright to read on midnight navy counters. Three-quarter view, generally facing right, city/ship slightly overhead. Strong distinctive silhouettes that read at 36 pixels and attractive material detail at 120 pixels. No chibi or cartoon anatomy, no photoreal backdrop. All eight miniatures must be equally legible and consistently styled. This is a new original artwork asset; no logos or borrowed game UI.
