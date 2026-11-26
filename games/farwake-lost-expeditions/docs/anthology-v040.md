# Nightglass anthology 0.4.0

Implemented 2026-11-26 from the verified 0.3.3 branch head `30d0d388bf1c6d4b69cc9055d3890d1dc53eafe1`.

Three playable cases share the illustrated scene engine and have independent saves. Nightglass uses a radio-feed repair and outgoing checks; The Empty Track uses a limited heater/camera supply; No Arrival Logged uses an equalizer, mechanical latch and pressure-hold check. All end within the witness's perceptions. The cause, transmission history, exact sequence between chapters and Earth's later recoverability are not revealed.

Mara Venn, Ivo Hale and Sera Vale are fictional witnesses at their playable sites. This does not establish that they are the last people on their whole worlds. The later Farwake incident remains separate.

## Assets

The eight 0.3.3 Luna illustrations remain unchanged. Two new illustrations were generated with the built-in imagegen tool, visually inspected, then converted from their original 1672×941 PNGs to WebP at quality 90 without changing composition or dimensions. Only the WebP derivatives belong in the deployment.

- `dist/assets/mars-control.webp`: original Mars control room and west-facing window. The east camera covers the unseen side of the building.
- `dist/assets/outpost-cabin.webp`: original Callisto cabin, pressure door, desk and utility-room entrance. The pressure-door viewpoint reuses this fixed room image.

Existing windowless maintenance artwork serves the small workshops. These are fictional game illustrations, not authentic mission imagery. Neither new image depicts the unknown threat or establishes its identity.

## Mars control room

Built-in imagegen prompt:

> Use case: stylized-concept. Asset type: wide 16:9 illustrated background for an existing first-person point-and-click science-fiction mystery, with a grounded worn industrial retrofuturist style, high detail, realistic material texture, subdued cinematic lighting. Generate a Mars habitat control room, viewed from the seated-height first-person entrance, no person visible. Central broad reinforced window looks onto dim rust-red rocky Mars terrain and a dusty copper sky; NOTHING outside is a creature or person. A metal storm shutter is fully open above the window. Under the window is a worn desk with an external-camera monitor showing a dark screen, a small radio handset, a paper shift log and a used mug. On the left a rectangular wall electrical cabinet with three chunky switches, on the right a door to a narrow workshop. Muted copper, charcoal and warm ivory; functional lamp pools, believable inhabited workplace, quiet and unsettling but no overt horror. Clear physical objects and navigable architecture, room usable for clickable objects; keep important desk equipment in the middle two-thirds. No game UI, no letters or labels, no captions, no logos, no watermarks, no visible humans, no monsters, no gore. Wide landscape, consistent single perspective, not a collage.

## Callisto outpost cabin

Built-in imagegen prompt:

> Use case: stylized-concept. Asset type: wide 16:9 illustrated background for a first-person point-and-click science-fiction mystery, grounded worn industrial retrofuturist style with realistic material texture and subdued cinematic lighting. Generate the occupied cabin of a very small solitary deep-space outpost on an airless icy moon. First-person view inside a compact lived-in metal room: a sturdy closed pressure door centered slightly right, with a small dark square camera display and intercom to its left, a mechanical latch wheel and two small non-text status lights. On the left a modest work desk with an arrival ledger, radio, empty bowl and a folded wool sweater over a chair. A narrow side door far left leads to a utility compartment. A sealed frosted porthole reveals only blackness, no landscape or stars that identify a particular world. Muted slate blue, warm amber practical lamps, worn brass and painted steel. Clear readable architecture and large physical objects suitable for interactive hotspots, no hostile silhouettes and no threat shown. The occupant has just put dinner aside; ordinary human details, quiet loneliness, sober illustration. No game UI, no text, no labels, no logos, no captions, no visible people, no monsters, no gore. Wide landscape, consistent single perspective, not a collage.

## Verification boundary

The test suite exercises actual chapter progression, every required mobile action, save/load and reset, and the real app module through a minimal DOM contract. This proves event wiring, not rendering. Public deployment QA must still inspect desktop and mobile layouts and listen to the audio. The contributed music file is preserved byte for byte, with its existing credit.

