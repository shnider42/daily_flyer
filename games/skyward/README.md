# SKYWARD · A Century of Flight

A new standalone game in the Daily Flyer collection, on the isolated `feat/skyward-flight` branch. SKYWARD follows pilots' logbooks across eighteen sorties, from an unarmed Avro 504 to a fictional future B-2 finale. All aircraft are also available in free flight. The historical aircraft and settings provide context; flight performance, routes, weapons, radar, and procedures are simplified game systems.

## Run

Node 22 or later. Dependencies are vendored with their licenses; no package installation or external asset service is required.

```sh
node games/skyward/server.mjs
node --test games/skyward/tests/*.test.mjs
```

The same server serves the browser app and squadron WebSocket endpoint. It listens on `0.0.0.0`, uses `PORT` when present, and otherwise uses port 3000. `/health` reports server readiness. The dedicated Render service uses this branch and directory; other Daily Flyer games are unchanged.

## Campaign

| Sortie | Aircraft | Flight problem |
| --- | --- | --- |
| First Light | Avro 504 | Cold start, takeoff, wind, cloud, and a landing at another field |
| New Teeth | Sopwith Camel | Armed training and practice balloons |
| Paper Wings | Sopwith Camel | Protect a reconnaissance aircraft |
| The Glass Eye | Sopwith Camel | Observation balloon, a defending fighter, and flak |
| Home Before Dusk | Sopwith Camel | Dogfight in fading light |
| Faster Than Thought | Spitfire Mk I | Faster-aircraft conversion and landing |
| Sky Over London | Spitfire Mk I | Daylight bomber interception in September 1940 |
| Heavy Weather | B-17 | Heavy-aircraft handling and a bombing run |
| The Longest Minute | C-47 Dakota | Market Garden paratrooper drop |
| Blue Water | F6F Hellcat | Pacific carrier operation |
| The Missile Age | F-4E Phantom II | Vietnam air combat and missile locks |
| Low Cloud | F-4E Phantom II | Conventional bombing sortie |
| A Very Small Runway | Sea Harrier FRS.1 | Falklands carrier launch and hover recovery |
| Sand and Thunder | A-10A | Desert Storm ground attack |
| Clear the Sky | F-15C | Desert Storm air superiority |
| Broken Cloud | F-16C | A 1999 air campaign inspired multirole sortie |
| The Silent Ridge | F-22 | Fictional future conflict: terrain, radar, and SAMs |
| Last Light | B-2 | Fictional high-altitude nuclear mission, with release and abort endings |

Each briefing includes a short historical note and links to museum, military-history, or NATO sources. Distances and engagement behavior are intentionally compressed; this is an approachable game, not flight or weapons training.

## Controls

On a phone, each thumb controls the same pair of flight axes as one hand on the default keyboard layout:

| Thumb | Horizontal drag | Vertical drag |
| --- | --- | --- |
| Left | Yaw left / right | Up adds thrust; down reduces thrust |
| Right | Roll left / right | Down raises the nose; up lowers the nose |

Touching either pad starts neutral; move relative to where your thumb landed. Releasing the left pad centers yaw and **holds the selected thrust**, so it is safe to move that thumb to **FIRE** while the right thumb keeps flying. Thrust adjustment uses the same rate as W/S. There is no look stick; the camera follows the aircraft, and the camera button cycles the available views.

**AIRCRAFT** opens a compact tray for gear, flaps, brake, and hover. It opens automatically when a cold start finishes so the brake-release step is visible. **LEVEL** remains available beside the flight controls. Engine startup and contextual targeting/weapon buttons remain separate. **Setup → Touch** can swap the two thumbs and FIRE, change the pitch direction, and adjust pad/button sizes, spacing, height, sensitivity, dead zone, and opacity. Restore touch defaults leaves keyboard bindings and other preferences unchanged. Old look-stick preferences migrate to the desktop-style pull-down-to-pitch-up default.

| Keyboard | Action |
| --- | --- |
| Down / Up arrow | Pitch up / pitch down |
| Left / Right arrow | Roll left / roll right |
| A / D | Yaw left / yaw right; ground steering |
| W / S | Increase / decrease thrust (throttle) |
| Enter | Next engine-start step |
| G / F / B | Gear / flaps / brake |
| L | Level recovery |
| Space | Hold guns |
| T | Select target |
| M | Missile |
| V | Payload release |
| X | Countermeasures |
| R | Radar toggle |
| H | Hover mode where supported |
| C | Cycle chase, cockpit, and cinematic cameras |
| Escape / P | Pause |

**Setup → Keyboard** lets you remap every keyboard action. Select an action’s key button and press a replacement; if that key is already assigned, the two actions swap keys. Escape cancels a key change and always remains available to pause in flight. Restore default keys resets only the keyboard layout. Key labels in the cockpit and action tooltips update with your assignments. Pitch-up/pitch-down keys always perform their named action; the touch pitch-direction setting only changes the touch pad. Browser shortcuts and typing in form fields do not fly the plane.

The interface starts in **Night** mode, including the hangar, mission lists, squadron panels, settings and debrief. The header appearance button or **Setup → Sound & view → Interface appearance** switches between Night and Day. This setting changes the interface, while each mission keeps its own sky and time of day. Theme and keyboard preferences survive reloads on the same browser. For actual night flying, Free flight → Conditions also offers Night sky; this uses the existing night scenery and stays separate from the interface theme.

Setup is available from the hangar and pause menu. Preferences also include assistance, guidance, units, sound mix, captions, reduced motion, high contrast, larger guidance text, and graphics quality. Preferences save separately from campaign progress. Free flight does not complete campaign sorties.

## Flight movement

Pitch, yaw and roll are angular rates around the aircraft's own axes in every handling mode. The simulation stores a normalized quaternion rather than integrating ground-relative heading and elevation. Pulling back at a quarter bank turns the nose sideways; pulling back while inverted rotates it toward the ground. Right yaw turns toward the pilot's right, and right roll lowers the pilot's right wing. Holding a control can carry the aircraft through a complete roll or loop without a pitch/bank clamp or a discontinuity at vertical flight.

Forward airspeed follows that same rotated nose direction on all three world axes. Gravity stays world-down, while simplified lift rotates with the wings; loss of lift adds a separate settling velocity. Coordinated bank turning remains a game assist. Hover thrust follows aircraft-up, so half thrust holds height only while upright. These remain approachable flight approximations, not a full aerodynamic simulator.

**Setup → Flying → Auto-level when you release flight controls** enables optional recovery only while all pitch, roll and yaw inputs are released. Any attitude input takes priority. Turn it off to stop automatic leveling after release. **LEVEL** starts a smooth recovery toward upright flight and yields immediately to a flight-control input. Ground steering and the simplified takeoff procedure remain separate from airborne body-axis rotation.

## Audio and accessibility

Audio is generated locally with Web Audio: propeller/jet engines, wind, gunfire, explosions, missile release, and warning tones. The browser starts sound after a user gesture. All necessary warnings and orders have visual equivalents. Browser visibility changes pause a solo sortie and clear held inputs. Each mobile pad and FIRE independently owns its pointer, so a second thumb or unrelated release cannot steal a held control. Pause, blur, interrupted touches, resize, and orientation changes release held input. Mobile layouts account for safe-area insets in both portrait and landscape.

Reduced motion steadies the camera, removes the menu's aircraft bobbing, and reduces effect opacity. Graphics settings cap rendering resolution and scene detail for mobile devices.

## Graphics and compatibility

WebGL is the default renderer. The locally bundled Three.js renderer provides the detailed aircraft, shaded terrain, cloud banks, water, runway and carrier geometry, effects, and three camera views. Static aircraft parts are combined by material; repeated scenery, clouds, projectiles, effects, and parachutes use instancing. Pixel density is capped to avoid rendering every physical display pixel on a high-density phone.

The simulation and input advance together at 60 fixed steps per second. Rendered aircraft, targets and effects interpolate between those steps; aircraft attitude uses quaternion interpolation through rolls, loops and vertical flight. Camera translation follows that rendered pose, with matching damping for the chase position and look direction. Cockpit position, forward and up directions follow the airframe directly, including when inverted; reduced motion does not lock the cockpit to the horizon. Both the detailed and compatibility renderers use the same body-frame camera helper. Pausing discards pending time. A long frame has a bounded catch-up budget, so returning from a stalled tab cannot trigger an unlimited batch of simulation work.

World materials and the custom water shader use the same logarithmic depth encoding. The apron meets the runway without overlapping coplanar faces; runway number decals have an explicit depth bias. Water detail fades when its frequency becomes smaller than a pixel, and cloud lobes write depth instead of relying on an unsorted transparent instance batch. Unrelated preference changes no longer resize or clear the graphics buffer.

If a browser cannot create a WebGL context, the app automatically uses `SoftwareFlightRenderer`. This is a perspective 3D renderer built on Canvas 2D, with the same flight simulation, terrain collisions, controls, missions, camera positions, and screen projection API. It projects the detailed player aircraft and a smaller terrain mesh on the CPU, and uses simpler distant aircraft, scenery, cloud shapes, and effects. Setup identifies when simplified 3D graphics are active. No network asset or installation is needed for either renderer.

The compatibility renderer uses explicit terrain, airfield, and aircraft drawing passes, polygon clipping, backface removal and view-distance culling. Its cached terrain tiles are disjoint and share boundary vertices across detail levels. A small coverage stroke on opaque ground faces prevents Canvas antialiasing from exposing the sky between adjoining triangles. Projected draw records are reused; complete visible faces are drawn rather than dropping arbitrary faces when a global draw limit is reached. Mountains hide distant actors through sampled terrain line-of-sight checks; their visual occlusion is approximate rather than a per-pixel depth buffer. It provides playable compatibility, not identical visual quality or a promise of the same frame rate as WebGL. Both renderers sample the simulation terrain; WebGL uses a small rendering-only skirt at airfields and the compatibility renderer draws the airfield after its terrain pass.

**Setup → Sound & view** reports the graphics backend and the most recent flight frame rate. Read-only diagnostics are also exposed as `SKYWARD.status` and the canvas's `data-renderer`, `data-fps`, `data-frame-work-ms` and `data-version` attributes. Frame rate uses actual elapsed display time; it does not infer FPS from the capped physics interval.

## Private squadron co-op

Two to four pilots join a six-character room and mark themselves ready. The flight lead starts a shared mission. Each aircraft is simulated locally so steering never waits for a round trip. Player poses are sent at up to 15 Hz and sampled with 100 ms of interpolation and at most 150 ms of extrapolation. The existing validated Euler pose format remains on the wire; remote clients reconstruct quaternions for interpolation and bounded angular prediction, avoiding Euler branch changes at vertical flight. The flight lead supplies the mission world at up to 10 Hz and processes guest combat requests. RTT is visible in flight.

The relay validates identity, room membership, sequencing, message sizes, finite coordinate bounds, readiness, and host-only operations. It does not provide competitive anti-cheat. A private reconnect token reserves a seat briefly, and a replacement tab closes the older connection. Host loss pauses the room and ends the sortie if recovery fails. There is no host migration. Solo progress is browser-local; active rooms are server-memory-only and end when the process restarts. Use one server process for this version. Future scale requires shared room coordination.

## Code boundaries

- `public/campaign.mjs`: aircraft profiles, mission content, historical notes and source links.
- `public/sim.mjs`: flight, terrain collision, combat, mission objectives, host snapshots.
- `public/orientation.mjs`: shared aircraft attitude, body axes and quaternion rotation/interpolation.
- `public/camera-pose.mjs`: aircraft-relative cockpit eye, forward and up directions.
- `public/presentation.mjs`: fixed simulation clock and render-only pose interpolation.
- `public/renderer.mjs` and `public/models.mjs`: Three.js scene, terrain, aircraft, effects, cameras.
- `public/software.mjs`, `public/software-terrain.mjs`: automatic perspective 3D Canvas 2D compatibility renderer and shared-edge terrain mesh.
- `public/controls.mjs`: touch and keyboard input with pointer cancellation.
- `public/audio.mjs`: gesture-unlocked procedural audio.
- `public/settings.mjs`: bounded, fault-tolerant preferences and local progress.
- `public/app.mjs`, `index.html`, `style.css`: hangar, campaign, HUD, briefings, settings and integration.
- `public/network.mjs`, `server.mjs`: room transport, interpolation, relay and static hosting.

## Verification and limits

Focused Node tests cover simulation/objective behavior, control cancellation and simultaneous pointers, storage failure, real WebSocket room/protocol cases, render interpolation, and flight/input equivalence at 15, 30, 60, 120 and 144 Hz. Flight regressions check banked/inverted pitch and yaw, pilot-right roll, full loops and rolls in every handling mode, gravity and rotated hover thrust, smooth recovery, and vertical remote weapons. Graphics regressions cover the same body axes in both cockpit cameras, inverted sky/terrain rendering, attitude interpolation through the vertical poles, terrain boundaries, runway geometry, terrain-only edge coverage and buffer resizing. Offline checks compiled and linked the expanded sky/water shaders on Mesa in GLSL ES 100 and 300, including fragment-depth and vertex-depth paths; native Canvas raster checks verified shared terrain edges without background leakage and an inverted cockpit with terrain above the sky. Browser checks cover the real interface, responsive phone-sized layouts and playable startup using the software renderer: the available test browser reports hardware graphics as disabled and cannot create a WebGL context. Actual browser GPU output, sustained hardware performance and physical iPhone/Safari performance still need hardware testing. Browser checks also do not replace independent internet-connection co-op testing.

This first release uses stylized procedural scenery, simplified cockpit systems and flight dynamics, a trusted flight lead, and browser-local campaign progress. It is designed to grow into richer terrain, more detailed handling, stronger mission scripting and more robust multiplayer without replacing the whole game.

## Third-party licenses

Three.js r160.1: MIT, `public/vendor/THREE-LICENSE.txt`.

ws 8.18.3: MIT, `vendor/ws/LICENSE`.
