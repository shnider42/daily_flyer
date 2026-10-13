# Smooth movement and the next detailed-art direction

Movement update for `feat/ww2-tactics`. The richer Detailed artwork below remains
a proposal; this update does not replace the icon set.

## Movement

The live renderer replaced the entire counter whenever its position/AP changed,
so a successful move jumped to its destination. Replay also recentered the camera
between the before/result views of an order. A newly displayed combat report
instantly resized the phone/map-first playing surface.

The prepared change interpolates a counter's visual wrapper for 170–260 ms after
the server confirms movement. Its input target and rule state stay at the confirmed
hex. It never waits for the animation before accepting the next order, and does
not move a unit optimistically while the request is still pending.

Artwork, strength/AP and status marks move together. A second render preserves
the current visual position instead of restarting at the origin. A later order
can interrupt the motion and continue from that position. Own aircraft can follow
the confirmed legal flight legs, and shared-hex offsets compose with movement.
Keyboard focus is preserved when a selected counter is replaced.

Newly spotted units, arrivals from reserve/transport, hidden routes and discontinuous
snapshots appear at their confirmed positions. Enemy motion requires sight of the
entire interpolated corridor in both snapshots. Reduced-motion preference makes
movement immediate. Replay animates the forward before/result change only and
keeps the camera steady across those phases.

The result strip now opens and closes over 180 ms using consistent grid tracks.
It returns its space to the map when dismissed, reserves no empty result slot,
and never covers the hexes. The responsive base layout is cached during ordinary
renders so repeated updates do not restart the transition. Reduced motion keeps
the panel resize immediate. Phone, landscape, Dad, map-first and replay layouts
retain their own navigation and order capacities.

Desktop holds its chosen pixel scale and scroll position during a result-panel
height transition. It no longer refits zoom and recenters the selected unit on
each resize frame. Explicit zoom, Find and window resizing keep their existing
behavior.

## Recommendation for Detailed icons

Keep **Basic** as the current coherent recognition silhouettes. Build **Detailed**
as a separate, complete family of illustrated cutouts: natural proportions,
readable silhouettes, restrained texture, and consistent muted military colors,
ivory highlights and dark outlines. Use the same artist/style references, framing,
lighting, scale and facing for every unit.

The richer infantry/Lancaster/Sherman/Spotlight concept shown in chat demonstrates
the proposed direction. It is a style preview, not an integrated production atlas
or a replacement for any current icon.

Generate a few representative pilot assets first and inspect them at the actual
counter size and on both daylight/night maps. Detail should improve recognition
at playable zoom; an enlarged unit card can show the full illustration. A small
role mark and the existing faction/AP/status overlays should remain separate from
the artwork so their clarity does not depend on the image.

After choosing the style, produce each unit/profile with the same approved
references. Check silhouettes and important distinguishing equipment, give every
asset a transparent background, and export bounded images with consistent padding.
Avoid another mixed collection of independently styled illustrations. The whole
Detailed family should be ready together before switching it into the game.

SVG can render cleanly at different sizes; the current simplicity comes from the
authored drawings rather than a format-imposed detail ceiling. Illustrated raster
assets are a practical way to get the painted texture shown in the concept.
References: [SVG overview](https://developer.mozilla.org/en-US/docs/Web/SVG),
[image formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types).

## Validation

Focused browser checks cover actual HTTP orders/AP/revisions, frame continuity,
redraws, interrupted movement, shared-hex offsets, fog privacy, reduced motion,
mobile/desktop cameras, replay and result-row interpolation. Existing artwork,
retained-map, playback and result-feedback browser checks pass. No backend or dice
rules are modified.

Five browser harnesses pass: `ww2-motion-regression-browser.cjs`,
`ww2-unit-art-browser.cjs`, `ww2-retained-map-browser.cjs`,
`ww2-playback-browser.cjs` and `ww2-result-feedback-browser.cjs`.

The older large-map performance test's assertion that every move keeps the exact
viewport height also fails on unchanged `8b9b1c2` when reaction fire opens a report.
That report deliberately occupies space. The prepared change smooths its resize
rather than hiding it or permanently reserving a blank slot. Camera scroll,
authoritative position/AP, retained terrain/fog and no extra full-state fetch
checks pass. The tracked test's stricter height assertion was not weakened.
