# Unit silhouettes, v1

The support/airborne update adds `sniper-v1.webp`, an original transparent 384×384
illustration generated with the built-in image tool. Its full prompt and
provenance are in [the update notes](../../../docs/ww2-support-and-airborne.md#sniper-artwork-provenance).

Original artwork generated with the built-in image-generation tool, guided by the
user's preference for bold military silhouettes. No images were extracted from the
commercial pack screenshot. The earlier faction rank insignia and MG references
remain in the code-native icon set. These illustrations are gameplay identifiers,
not claims of exact historical ship classes or vehicle specifications.

Production assets are the fourteen `*-v1.webp` files in this directory. They retain
transparency and are resized to fit within 256×256 pixels, preserving aspect ratio.
The browser displays them within the existing counter, with unchanged faction
colors, strength/AP, status overlays and input targets. Failed image requests
leave the previous symbol visible. Versioned URLs may be cached indefinitely;
future artwork changes must use a new filename/version.

## Prompt set

Shared direction: transparent raster game-counter icon; original WWII military
recognition illustration; bold ivory-white silhouette with sparse dark navy cutout
details; recognizable at 40 pixels; centered, filling 90% of the image; no scenery,
water, wake, shadow, frame, badge, labels, letters or insignia. Wide side profile
with a slight overhead angle for vehicles, bow/front pointing right. Square canvas
for people. Use the built-in tool with `transparent_background: true`.

| Asset | Subject prompt |
| --- | --- |
| carrier-v1.webp | Aircraft carrier with an unmistakable long flat flight deck, small island superstructure toward the rear and two small parked propeller aircraft. |
| battleship-v1.webp | Deep heavy hull, three massive twin-barrel turrets (two forward and one aft), tall stepped command tower and one thick funnel. |
| cruiser-v1.webp | Medium-weight hull, two medium gun turrets, three prominent funnels grouped in the middle and a compact bridge. |
| destroyer-v1.webp | Sleek thin hull, two simple gun mounts, two distinctive funnels and a low compact bridge. |
| paratrooper-v1.webp | One helmeted soldier with bent legs and a slung rifle descending under a broad round segmented canopy; thick simplified suspension-line groups. |
| tank-us-v1.webp | Sherman-inspired medium tank in three-quarter side view, rounded turret, long cannon and strong caterpillar tracks; few cutouts separating tracks, turret and hull. |
| tank-de-v1.webp | Simple ivory-white stencil of a Tiger-inspired tank: angular turret, boxy hull, broad tracks and long barrel pointing right. Pure flat shapes like a military pictogram cut from paper; five simple navy cutouts; no gradients, vignette, glow, shadow or fine texture. |
| landing-craft-v1.webp | Open-topped rectangular troop well, high squared loading ramp at right, small aft steering shelter at left; three helmet shapes inside; slightly overhead view. |
| landing-infantry-v1.webp | One helmeted infantryman kneeling with one knee down and one raised, aiming a shoulder-braced rifle right; natural full-body proportions, thick rifle silhouette and minimal interior details. |
| scout-v1.webp | One helmeted WWII scout crouching and looking right through large binoculars held to his eyes. Upper-body three-quarter profile with clearly readable two-lens binoculars and helmet. Square image. |
| engineer-v1.webp | One helmeted WWII combat engineer, waist-up three-quarter view, holding a substantial entrenching shovel diagonally across his body. Broad shovel blade visible beside his shoulder; rolled equipment pack on his back. Human silhouette, not a crossed-tools emblem. Square image. |
| halftrack-v1.webp | WWII half-track armored troop transport, side profile front pointing right, large front wheel, rear caterpillar track, sloping armored cab and open troop compartment. Broad simplified proportions, wide image. |
| at_gun-v1.webp | WWII stationary anti-tank field gun with a long cannon pointing right, large protective gun shield, two wheels and long split support trails. Slightly overhead side view. Wide image; single gun, no people. |
| at_team-v1.webp | WWII anti-tank soldier, crouched upper body wearing a helmet, aiming a large shoulder-fired bazooka tube right with both hands supporting it. Square image, compact pose. |

Two German tank generations with unwanted background haze were rejected in favor
of the final flat stencil. Only the selected production assets are included here.
