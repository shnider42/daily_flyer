# Empires landscape artwork

The terrain pass gives the existing hex map a miniature tabletop landscape:
tree clusters, rounded hills, angular mountain ridges, water, timber bridges,
farm plots, mine entrances and ruined columns. It is native SVG artwork, with
reusable drawings and restrained shading rather than a downloaded terrain atlas.
An [offline artwork proof](previews/empires-terrain-v1.svg) shows the drawings at
large and normal map sizes. It is not a browser or iPhone screenshot.

## Reading and interacting with the map

All three Experiences use the same terrain. Unit Basic/Detailed, the land/yields
lens, tutorial preference and game rules retain their existing meanings. There
is no new display setting. The muted landscape colors work with the existing
night and daylight interface palettes.

Grassland has low-detail patches and tufts. Forests combine conifers and broadleaf
trees; small edge clusters connect adjacent woods. Hills are rounded, mountains
are sharp and rocky, and water has quiet wave marks. Farms show cultivated rows
and a small hut; mines show an opening and excavated rock. These features still
have the existing inspectable symbols and plain-language explanations.

Sandy shores are drawn only where known land meets known water. Roads connect
known road hexes, with subdued edges and a pale center. Bridges remain recognizable
as timber crossings. Four deterministic variants per terrain keep landmarks
stable while avoiding an identical stamp on every tile.

Rendering order is landscape, roads, hex outlines, labels, cities, then units.
Legal-move outlines and selected hexes stay above the scenery. Yield numbers
have compact dark backings; resource and worked-land symbols have small light
backings. Decorative layers ignore pointer input. The existing hex buttons and
unit nodes retain tap and keyboard behavior, including safe inspection and the
pan-versus-move guard. No landscape animation is added.

The hex outlines now meet exactly for the existing 52-by-49 projection. Centers,
coordinates, server geometry and movement costs are unchanged.

## Fog and performance

`empires-terrain.js` consumes only the fog-filtered public map. Unknown hexes
have no landscape or shoreline hints. Remembered terrain and roads are dimmed;
they do not imply a current report. Neighbor-dependent artwork is invalidated
when remembered terrain changes, including newly revealed water or woods.

SVG definitions are created once per opened campaign. Tile drawings are cached
separately from labels and move highlights. Roads are also reused until known
roads or visibility changes. Changing Experience, selecting a unit and opening
help do not redraw the landscape, mutate game state or submit orders. This is
structural caching, not a measured Safari frame-rate claim.

## Validation

`tests/empires-terrain-dom.cjs` verifies fog-safe coastlines, stable drawing
variants, cache reuse, layer order, retained tile input, keyboard focus, actual
move/AP resolution, safe inspection and Experience/camera isolation against the
real Flask API. Its `--proof` option writes the SVG artwork proof and temporary
PNG renders for visual inspection; it additionally renders a crop of the actual
game with the detailed unit atlas and yield overlays.

Existing Empires game, learning and artwork suites exercise phone reparenting,
orientation changes, movement, saves, explicit tutorial opt-out and shared unit
preferences. No engine or balance change is part of this terrain update.

Managed preview lacked the required browser-control capability during this
change, so verification consists of DOM/API tests and offline SVG inspection.
Physical iPhone Safari readability, scrolling and rendering speed remain a
playtest check. The work uses the existing branch and Render URL.
