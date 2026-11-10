# SKYWARD · A Century of Flight

A standalone game in the Daily Flyer collection, on the isolated `feat/skyward-flight` branch. SKYWARD follows pilots' logbooks across eighteen sorties, from an unarmed Avro 504 to a fictional future B-2 finale. **v0.7.0 clears the mobile cockpit, gives larger airframes slower pitch/roll response, and adds three B-2 nuclear game payloads with a real escape phase.** The flight-selection homepage and browsable hangar show all 14 actual aircraft, with a locally served condensed typeface, direct menu labels, and desktop/phone framing.

The v0.6.1 combat feedback (directional hit warnings, impact/explosion audio, camera reactions and damage smoke) and v0.6 multiplayer modes remain available: dogfights, shared free flight, campaign squadrons, the two-person AC-130 operation, carrier starts and Razorback Canyons terrain cover. Historical aircraft and settings provide context; flight performance, routes, weapons, radar, and procedures are simplified game systems.

## Run

Node 22 or later. Dependencies are vendored with their licenses; no package installation or external asset service is required.

```sh
node games/skyward/server.mjs
node --test games/skyward/tests/*.test.mjs
```

The same server serves the browser app and squadron WebSocket endpoint. It listens on `0.0.0.0`, uses `PORT` when present, and otherwise uses port 3000. `/health` reports server readiness. The dedicated Render service uses this branch and directory; other Daily Flyer games are unchanged.

## Mobile cockpit and B-2 payloads

The default phone view keeps airspeed, heading, terrain clearance and airframe health above the flight scene. Two translucent corner pads retain their full touch areas. **NAV** reveals mission orders, radar, fuel/stores and scores; **SYSTEMS** reveals weapons, gear, flaps, brake and hover. Both trays close after use or when pausing, changing screens or resizing. FIRE remains available on armed fighters; bombers have a direct **DROP** button. LEVEL remains beside the pads. Critical warnings always remain visible. These rules also cover left-handed controls and the shared AC-130 cockpit.

Larger game airframes have slower pitch and roll, slower buildup/reversal of rotation, and gentler leveling recovery. Existing local aircraft axes and independent pitch/roll/yaw controls are retained. The B-2, B-17, C-47 and AC-130 require deliberate turns; light aircraft respond sooner.

Select **B-2 → Payload** in Free flight or an independent multiplayer room. Choices are Conventional, Atomic (Hiroshima class), Hydrogen and Tsar Bomba class. Last Light offers the three nuclear choices in its briefing. Payload selection is fixed for the sortie and retained across replacement aircraft. **High altitude** is an explicit airborne start at 6,500 game metres above the terrain, available in solo and multiplayer setup.

The three nuclear tiers have progressively higher AGL release floors and larger, more damaging blast waves. The displayed release floor only unlocks the bomb; it does not promise survival. A rejected low release keeps ammunition aboard. A release creates a falling bomb, followed by an expanding wave: nearby aircraft are destroyed, aircraft near the outer edge take less damage, and turning clear while the bomb falls can make the difference. The largest tier can still destroy an aircraft that starts high and flies straight. Damage is applied once per aircraft life, and replacement aircraft do not inherit an old blast. Peaceful free flight and campaign co-op retain protection from other pilots, while the releasing pilot remains vulnerable to their own bomb. Dogfight permits blast damage to opponents and normal kill/death credit.

Last Light stays playable after release through detonation and escape. Other campaign successes also wait for an outstanding nuclear hazard, and a replacement aircraft cannot count as the original releasing crew surviving. Abort remains available until release. The effects have a single flash, rising fireball, expanding terrain dust front, mushroom stem/canopy and lingering cloud; sound and camera concussion arrive with the wave. Reduced motion suppresses broad flashes and camera shake. All altitudes, distances, timing, handling and damage are fictional arcade rules, not real weapon or aircraft specifications.

## Fly together

**Fly together** offers four private room modes:

| Mode | Players | Flight plan and aircraft losses |
| --- | --- | --- |
| Dogfight | 2–4 independent pilots | Every pilot for themselves; 5, 10, or 20 minutes, unlimited replacement aircraft, live and final kills/deaths/K/D |
| Free flight | 2–4 independent pilots | Untimed, no player-versus-player damage, unlimited replacement aircraft |
| Mission squadron | 2–4 independent pilots | Shared campaign objectives; 1, 3, or 5 lives per pilot, default 3; spectate when lives run out |
| AC-130 crew | Exactly 2 | One pilot and one gunner share Nightwatch's aircraft, weapons and mission result |

1. Choose the mode. For dogfight/free flight, choose **Razorback Canyons** or **Open Ocean Islands**. Set the dogfight round length or the mission squadron's lives as appropriate.
2. Each independent pilot chooses an aircraft and **Already in the air**, **High altitude**, **Runway · engine running**, or **Aircraft carrier · attempt any aircraft**. Create a squadron, then share its six-character code or invite link.
3. Guests join and mark themselves ready. A changed aircraft, payload or launch choice clears that guest's readiness; changing the shared flight plan clears guest readiness. The host launches when everyone is connected and ready.
4. In flight, **SCORES** shows the standings. After a loss, watch another surviving pilot with the spectator controls and select **Return to the sky →** once a replacement is available. Arena replacements have a four-second delay; mission replacements have a five-second delay. Each aircraft loss consumes one mission life, with the initial aircraft included in the selected allowance.
5. During any shared flight, the host can open the pause menu and choose **Regroup in squadron room** to change the setup without closing the room; this also gives untimed free flight a way back to its lobby. After a round, the host can **Fly again with squadron** using the same setup, or **Return to squadron** to change the map, mode, duration, aircraft or launch choices. Guests remain attached to the same room. Returning the room to its lobby also permits new pilots to join.

All **14 flyable aircraft** are available for independent flight: Avro 504, Sopwith Camel, Spitfire, B-17, C-47, AC-130, Hellcat, F-4, Sea Harrier, A-10, F-15, F-16, F-22 and B-2. Each retains its own speed, handling, health and equipment. Selecting an unarmed trainer or transport does not add a gun or missiles, and selecting the AC-130 here does not add a gunner seat. Mission equipment still matters: a paratrooper mission needs a C-47, and a bombing objective needs an aircraft carrying bombs. The lobby explains these limitations without locking the aircraft choice.

The scoreboard ranks kills first, then fewer deaths, then callsign. K/D displays a dash while deaths are zero. A terrain crash counts as a death without giving another pilot a weapon kill. Scores survive respawns and authenticated reconnects during the same round; a replay starts fresh.

In mission squadron mode, AIR kills/deaths/K/D credits each hostile AI aircraft destroyed to the pilot who dealt the final damage; ground targets contribute shared mission points without increasing air kills.

Dogfight time follows actual elapsed host time, separately from the bounded physics catch-up budget. Opening the arena pause menu, viewing scores or spectating does not stop the countdown. A connected host tab that stalls reconciles elapsed time when it runs again; clients can only receive the result when the host resumes publishing. Connection recovery is a separate shared hold. These private rooms use the host's simulation rather than a dedicated competitive game server.

### Carrier departures

Carrier starts are available in solo free flight and independent multiplayer modes. The game labels the Hellcat's assisted deck launch and the Sea Harrier's VTOL departure as supported; other aircraft display experimental or high-risk warnings. **Every aircraft may still select the carrier and attempt departure.** The warning never disables the launch button or substitutes better performance. A short deck, the aircraft's takeoff speed and its normal acceleration affect the takeoff attempt.

The newly added carrier has a 310-by-40-metre deck with a visible launch lane and island superstructure. Aircraft collision uses the modeled airframe's envelope against the same island blocks drawn by both renderers. A large wingspan can hit the island during a straight takeoff roll; moving toward the clear side of the deck can change that outcome. The warning reports an overlap when the selected wingspan exceeds clearance on the launch lane. The risk comes from the attempted path, aircraft size and flight behavior. Selecting an aircraft does not trigger an automatic failure or secretly reduce its acceleration. Existing campaign carriers retain their authored deck sizes.

For the Harrier, engage **HOVER**, release the brake and add thrust. For ordinary deck takeoffs, release the brake and build airspeed. A failed launch is resolved by the same flight, deck and water collisions as the rest of the game. Multiplayer runway starts have their engines running; solo free flight retains its optional cold runway start.

### Terrain cover and ground clearance

Razorback Canyons has a low, winding main ravine, branching routes and steep enclosing ridges. Radar acquisition and gun visibility test the shared terrain surface. A mountain between a missile and its target breaks the missile's steering track; it continues on its existing trajectory and can strike the mountain. Collision checks sweep the missile's movement between steps, so a fast projectile cannot simply skip a wall and damage the aircraft behind it. Terrain is useful cover, but neither losing a lock nor entering a canyon guarantees survival.

The HUD altitude is explicitly **metres/feet above ground level (AGL)**, including the carrier deck under the aircraft. A clearance bar changes with ground distance, and a velocity-based look-ahead produces **PULL UP · TERRAIN AHEAD** with an estimated impact time when available. Radar tracking, completed locks and incoming missiles have separate visible warnings. Rock strata, nearby rocks or trees, ground shadows and distinct canyon floors add scale and motion cues in both graphics backends. These are game aids, not navigation or collision-avoidance instruments.

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

## Nightwatch Basin · AC-130 crew

Nightwatch is a separate, fictional night operation with eight ground objectives. It is available immediately under **Fly together**, outside the eighteen-sortie campaign; completing it does not change campaign progress.

1. Open **Fly together**, select **AC-130 crew · pilot + gunner** under **Mode**, and choose **Create a squadron**. The creator is the pilot.
2. Use **Copy invite** or share the six-character squadron code. The second player joins as gunner and selects **Ready for the gunner seat**.
3. The pilot selects **Launch AC-130 crew →**. Both players begin aboard the same airborne aircraft.

The compound starts off the aircraft's left wing, near the default gun sight. The pilot uses the existing flight controls and camera choices to fly a gentle left orbit around the basin. The gunner stays in first person and switches between three port-side stations:

| Station | Default key | Game behavior |
| --- | --- | --- |
| 25 MM | 1 | Rapid cannon with a large ammunition supply and a small blast |
| 40 MM | 2 | Slower cannon with a stronger hit and a medium blast |
| 105 MM | 3 | Heavy shell with a broad blast and a longer reload |

Every station retains its own ammunition and reload timer when you switch. Shells travel through the world, hit terrain and damage ground targets; choosing **NEXT TARGET** only changes the marked objective. The guns and sight turn with the aircraft, so the pilot's bank and heading determine what the gunner can reach. **AIM LIMIT · ASK PILOT TO TURN** indicates a traverse limit.

### Gunner controls

| Input | Action |
| --- | --- |
| Move mouse over the view, or arrow keys | Aim the selected station |
| Hold primary mouse button or Space | Fire; a short click fires once when the station is ready |
| 1 / 2 / 3 | Switch 25 mm / 40 mm / 105 mm station |
| Z / **ZOOM** | Toggle sight zoom |
| C / **CENTRE** | Centre the sight relative to the aircraft |
| T / **NEXT TARGET** | Mark the next ground objective |
| Escape / P | Pause the gun station |

**Setup → Keyboard → AC-130 gunner controls** remaps the gunner keys separately from pilot keys. An assignment can be reused across the two roles. **Restore pilot keys** and **Restore gunner keys** reset only their respective layouts.

On a phone, the **left thumb aims** and the **right thumb holds FIRE**. Releasing AIM holds the selected sight angle. The station buttons remain above the thumb controls. NAV reveals ZOOM, CENTRE and NEXT TARGET. **Setup → Touch → Swap the two thumbs** also reverses the gunner controls. This role has no flight pads or separate look stick.

Aircraft health, station ammunition, target damage and mission results are shared. Pilot pause pauses the aircraft and mission for both crew members; gunner pause stops their guns while the pilot continues flying. A lost gunner connection stops firing; a lost pilot connection pauses the room during its reconnect window. Release and press FIRE again after an interruption. The AC-130 in ordinary free flight is for handling practice; the crew operation supplies the gunner stations and ground objectives.

## Controls

On a phone, each thumb controls the same pair of flight axes as one hand on the default keyboard layout:

| Thumb | Horizontal drag | Vertical drag |
| --- | --- | --- |
| Left | Yaw left / right | Up adds thrust; down reduces thrust |
| Right | Roll left / right | Down raises the nose; up lowers the nose |

Touching either pad starts neutral; move relative to where your thumb landed. Releasing the left pad centers yaw and **holds the selected thrust**, so it is safe to move that thumb to **FIRE** while the right thumb keeps flying. Thrust adjustment uses the same rate as W/S. There is no look stick; the camera follows the aircraft, and the camera button cycles the available views.

**SYSTEMS** opens a compact tray for weapons, gear, flaps, brake, and hover. **NAV** shows mission orders and navigation details. It opens automatically when a cold start finishes so the brake-release step is visible. **LEVEL** remains available beside the flight controls. Engine startup appears only while needed; secondary weapon controls stay in SYSTEMS on phones. **Setup → Touch** can swap the two thumbs and FIRE, change the pitch direction, and adjust pad/button sizes, spacing, height, sensitivity, dead zone, and opacity. Restore touch defaults leaves keyboard bindings and other preferences unchanged. Old look-stick preferences migrate to the desktop-style pull-down-to-pitch-up default.

| Pilot keyboard | Action |
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

**Setup → Keyboard** lets you remap every keyboard action. Select an action’s key button and press a replacement; if that key is already assigned within the same role, the two actions swap keys. Escape cancels a key change and always remains available to pause in flight. **Restore pilot keys** resets only the pilot keyboard layout. Key labels in the cockpit and action tooltips update with your assignments. Pitch-up/pitch-down keys always perform their named action; the touch pitch-direction setting only changes the touch pad. Browser shortcuts and typing in form fields do not fly the plane.

The interface starts in **Night** mode, including the hangar, mission lists, squadron panels, settings and debrief. The header appearance button or **Setup → Sound & view → Interface appearance** switches between Night and Day. This setting changes the interface, while each mission keeps its own sky and time of day. Theme and keyboard preferences survive reloads on the same browser. For actual night flying, Free flight → Conditions also offers Night sky; this uses the existing night scenery and stays separate from the interface theme.

Setup is available from the hangar and pause menu. Preferences also include assistance, guidance, units, sound mix, captions, reduced motion, high contrast, larger guidance text, and graphics quality. Preferences save separately from campaign progress. Free flight does not complete campaign sorties.

## Flight movement

Pitch, yaw and roll are angular rates around the aircraft's own axes in every handling mode. The simulation stores a normalized quaternion rather than integrating ground-relative heading and elevation. Pulling back at a quarter bank turns the nose sideways; pulling back while inverted rotates it toward the ground. Right yaw turns toward the pilot's right, and right roll lowers the pilot's right wing. Holding a control can carry the aircraft through a complete roll or loop without a pitch/bank clamp or a discontinuity at vertical flight.

Forward airspeed follows that same rotated nose direction on all three world axes. Gravity stays world-down, while simplified lift rotates with the wings; loss of lift adds a separate settling velocity. Coordinated bank turning remains a game assist. Hover thrust follows aircraft-up, so half thrust holds height only while upright. These remain approachable flight approximations, not a full aerodynamic simulator.

**Setup → Flying → Auto-level when you release flight controls** enables optional recovery only while all pitch, roll and yaw inputs are released. Any attitude input takes priority. Turn it off to stop automatic leveling after release. **LEVEL** starts a smooth recovery toward upright flight and yields immediately to a flight-control input. Ground steering and the simplified takeoff procedure remain separate from airborne body-axis rotation.

## Combat feedback

An accepted hit on your aircraft produces a red edge flash, a direction indicator, a brief camera reaction, and an explicit **AIRFRAME HIT**, **MISSILE HIT** or **FLAK HIT** notice with the remaining airframe percentage. Incoming direction follows the current view, including an inverted cockpit or a side-facing AC-130 gun station. The health display emphasizes recent damage and critical health. These cues remain available with sound muted and with radio captions disabled.

The simulation identifies the aircraft and life that received each hit. The interface combines the shared event with a retained `lastDamage` receipt, so a busy multiplayer event stream can still report the latest hit without playing it twice. Repeated snapshots, old lives, invulnerable hits and another pilot's damage do not trigger your own hit warning. Both AC-130 seats observe damage to their one shared aircraft. Camera reactions affect presentation only; they do not move the aircraft or alter collision, weapon aim or flight controls.

Nearby explosions add a brief warm flash and concussion; their sound and camera reaction weaken with distance. A nearby explosion alone does not claim that your aircraft was damaged. Explosions have a bright initial core, irregular flame, dark rising smoke and outward debris, while damaged aircraft leave smoke trails. When a local destruction ends the sortie, the flight view remains visible for **1.25 seconds** with controls disabled before the debrief, allowing the impact and burst to register. Multiplayer losses that leave the shared sortie running keep the existing spectator and respawn flow.

## Audio and accessibility

Audio is generated locally with Web Audio: propeller/jet engines, wind, gunfire, explosions, missile release, and warning tones. Combat sounds use cached, layered waveforms: sharp metallic bullet strikes, heavier concussion hits, and explosions with a crack, low body, rolling tail and debris. Midrange transients convey the impact without depending entirely on deep bass. Stereo direction and distance filtering place the sound, while brief engine/wind ducking makes an impact stand out. Compression, voice limits and short repeat guards bound busy firefights. Master, engine/wind and effects volume controls remain independent, and muting stops active effects.

The browser starts sound after a user gesture. **Setup → Sound & view → Test hit & explosion sounds** previews a bullet hit followed by an explosion at the current sound settings. All necessary warnings and orders have visual equivalents. Browser visibility changes pause a solo sortie and clear held inputs. Each mobile pad and FIRE independently owns its pointer, so a second thumb or unrelated release cannot steal a held control. Pause, blur, interrupted touches, resize, and orientation changes release held input. Mobile layouts account for safe-area insets in both portrait and landscape.

Reduced motion removes combat camera kicks, steadies the camera, removes the menu's aircraft bobbing, and reduces bright flashes and smoke emission. It retains directional warnings, hit labels and sound. Graphics settings cap rendering resolution and scene detail for mobile devices.

## Graphics and compatibility

WebGL is the default renderer. The locally bundled Three.js renderer provides the detailed aircraft, shaded terrain, cloud banks, water, runway and carrier geometry, effects, and three camera views. Static aircraft parts are combined by material; repeated scenery, clouds, projectiles, effects, and parachutes use instancing. Pixel density is capped to avoid rendering every physical display pixel on a high-density phone.

### Aircraft and cockpit models

The sixteen original airframe types have distinct modeled construction. The classic set includes the long tandem-cockpit Avro 504, compact Camel, elliptical-wing Spitfire, radial-engine Hellcat, narrow Bf 109, four-engine B-17, C-47 transport and glazed-nose He 111. The modern set separates the F-4, F-15, F-16, F-22, Sea Harrier, A-10, B-2 and MiG-21 by their fuselage sections, wing planforms, intake arrangements and tail geometry. Campaign aircraft names and the existing enemy aliases are unchanged.

The AC-130 adds a seventeenth airframe: a broad high wing, four independently animated turboprops, a tall tail, landing-gear sponsons, sensors and three port-side gun assemblies. Both renderers support the same aircraft-relative gun sights, three first-person station interiors and shared ammunition/reload displays. Nightwatch's compound has service roads and distinct depot, relay, vehicle and flak structures. Its scenery and station fittings are stylized rather than exact reproductions of operational systems.

Curved airfoil sections replace flat wing slabs. Smooth lofted skins, canopy frames, open biplane cockpits, radial engine detail, recessed jet ducts, nozzle petals, wheel hubs, undercarriage braces, stores and restrained panel/marking geometry make the models readable at close range. The F-22 uses rectangular exhausts, the Harrier has four side nozzles, and the A-10, Harrier and B-2 have no afterburner flame. Afterburning jets show their exhaust effect only at high thrust. Broad markings evoke an aircraft family rather than claiming an exact squadron, production block or museum restoration.

Paint, fabric, rubber, metal and glazing have separate surface responses. Rounded surfaces use smooth normals; deliberately angular surfaces retain their facets. A locally generated 256×128 sky/ground environment map gives WebGL paint and canopies soft reflections, with the appropriate day/night atmosphere. It is prefiltered once by Three.js, without a per-frame reflection camera or downloaded texture asset.

Five cockpit families replace the shared generic dashboard: open wood/leather WWI cockpits, framed analog WWII fighters, broad bomber/transport panels, early jet analog panels, and modern MFD/HUD panels. WebGL uses physical dashboard/coaming/frame geometry, raised bezels and moving needles. The compatibility renderer caches the same instrument layout. Airspeed, altitude, fuel, thrust and climb indications use the current flight state; small MFD textures update at most ten times per second. These remain simplified family interiors, not reproductions of every real cockpit system.

Static fittings are batched by material inside each moving assembly as well as across the airframe. Identical transformed vertices share an index; clones reuse geometry and materials while retaining independent propeller/gear/effect state. Detailed aircraft stay under 23,000 triangles and 30 model draw calls; opposing aircraft omit small details while retaining the same proportions. Wheel contact uses each model's undercarriage dimensions. Flight physics and aircraft-relative controls are unchanged by the model rebuild.

### Rendering behavior

The simulation and input advance together at 60 fixed steps per second. Rendered aircraft, targets and effects interpolate between those steps; aircraft attitude uses quaternion interpolation through rolls, loops and vertical flight. Camera translation follows that rendered pose, with matching damping for the chase position and look direction. Cockpit position, forward and up directions follow the airframe directly, including when inverted; reduced motion does not lock the cockpit to the horizon. Both the detailed and compatibility renderers use the same body-frame camera helper. A physics pause discards pending simulation time. A long frame has a bounded catch-up budget, so returning from a stalled tab cannot trigger an unlimited batch of physics work. The multiplayer dogfight countdown uses elapsed real time on a separate clock and is not slowed by that budget.

World materials and the custom water shader use the same logarithmic depth encoding. The apron meets the runway without overlapping coplanar faces; runway number decals have an explicit depth bias. Water detail fades when its frequency becomes smaller than a pixel, and cloud lobes write depth instead of relying on an unsorted transparent instance batch. Unrelated preference changes no longer resize or clear the graphics buffer.

Terrain drawing now uses a shared, world-aligned mesh builder for WebGL and Canvas. Nearby canyon faces use the same 64-metre grid and diagonal as the collision surface, with small presentation depth offsets. More distant faces use coarser detail, and adjacent levels share boundary vertices instead of overlapping patches. Broad slope colors and rock strata establish scale; WebGL adds world-space ground grain that fades as it becomes smaller than a pixel. Nearby trees or rocks stay anchored in the world, and the aircraft shadow follows the ground or carrier deck instead of floating at a fixed altitude.

Routine terrain regeneration runs in a module worker. The current mesh remains visible while a replacement sector is prepared; requests coalesce to the latest sector, and WebGL receives transferable geometry buffers. Initial terrain, a large position jump, an unavailable worker or a failed worker uses the synchronous path. The worker reduces work during normal movement; it does not make terrain generation free or establish a device-independent performance guarantee.

Explosions share a deterministic visual recipe across both renderers: a crisp bright core, irregular fire lobes, dark wind-drifted smoke, outward embers and debris, and a fading shock ring. Aircraft impacts add short sparks; damaged aircraft emit bounded world-space smoke puffs that follow their traveled path. Recent bursts and impacts take precedence over old smoke within the effect budget. WebGL adds a fixed small pool of nearby blast lights. Effects derive from identity and age, with bounded layer pools and no extra simulated damage particles. Very near particles become more transparent so a camera inside a blast retains a view. Flash intensity responds to reduced-motion settings; the blast's visual radius does not change combat rules. Spectating switches the displayed airframe, cockpit and camera to the selected surviving pilot without moving or reviving the local aircraft.

If a browser cannot create a WebGL context, the app automatically uses `SoftwareFlightRenderer`. This is a perspective 3D renderer built on Canvas 2D, with the same flight simulation, terrain collisions, controls, missions, camera positions, and screen projection API. It projects the detailed player aircraft and a smaller terrain mesh on the CPU, and uses simpler distant aircraft, scenery, cloud shapes, and effects. Setup identifies when simplified 3D graphics are active. No network asset or installation is needed for either renderer.

The compatibility renderer uses explicit terrain, airfield, and aircraft drawing passes, polygon clipping, backface removal and view-distance culling. Its cached terrain tiles are disjoint and share boundary vertices across detail levels. A small coverage stroke on opaque ground faces prevents Canvas antialiasing from exposing the sky between adjoining triangles. The detailed player/menu aircraft uses a cropped, reusable depth/color buffer with bounded supersampling, smooth skin lighting, opaque depth tests and a depth-tested transparency pass. This prevents wings, fuselages, ducts and conformal markings from cutting through one another as they rotate. Terrain, distant actors and effects retain the lighter painter; mountains hide distant actors through sampled terrain line-of-sight checks, so world-to-actor occlusion remains approximate. Projected draw records are reused and complete visible faces are drawn. The compatibility renderer provides playable fallback graphics, not identical visual quality or a promise of the same frame rate as WebGL. Both renderers sample the simulation terrain; small visual depth offsets keep terrain below airfield paint, and the compatibility renderer draws the airfield after its terrain pass.

**Setup → Sound & view** reports the graphics backend and the most recent flight frame rate. Read-only diagnostics are also exposed as `SKYWARD.status` and the canvas's `data-renderer`, `data-fps`, `data-frame-work-ms` and `data-version` attributes. Frame rate uses actual elapsed display time; it does not infer FPS from the capped physics interval.

## Multiplayer authority and continuity

In independent flight modes, each pilot predicts their own aircraft so steering never waits for a round trip. Player poses are sent at up to 15 Hz and sampled with 100 ms of interpolation and at most 150 ms of extrapolation. The validated Euler pose format remains on the wire; remote clients reconstruct quaternions for interpolation and bounded angular prediction, avoiding Euler branch changes at vertical flight. The host supplies the shared world at up to 10 Hz and resolves guest combat. RTT is visible in flight.

The accepted lobby roster fixes each pilot's aircraft and start for a sortie. The relay takes identity from the connection, replaces claimed aircraft metadata with that selection, and assigns identities to accepted weapon actions. Modern rooms bind pose, action and world messages to the sortie's `runId`; independent pilots also carry an authoritative `lifeId`, which increases on respawn. Monotonic sequences and life checks reject delayed shots or positions from an old aircraft or round. Host snapshots own participant health, stores, deaths, kills and respawn availability; a guest crash report is only an advisory request that the host validates against terrain. The guest cannot award itself a kill or bypass the respawn delay.

Losing the host's **aircraft** does not remove the host from the room. Its simulation continues objectives, enemy activity, combat, the round timer and snapshots while the pilot respawns or spectates. In mission squadron mode, a pilot with no remaining lives can watch connected survivors; the mission fails for aircraft exhaustion only when no connected pilot has a living aircraft or remaining life. An objective can still succeed or fail according to its own rules. The shared AC-130 remains one aircraft: losing it can end Nightwatch, while the room stays available to replay.

Nightwatch uses a two-seat crew room. The pilot owns the only aircraft simulation, shell collisions and shared mission world. The gunner sends station, aim and trigger inputs at up to 15 Hz, with prompt trigger-edge delivery, and renders the interpolated pilot pose. Station inputs are bounded, sequenced and tied to the current sortie; they cannot supply aircraft positions, target damage or ammunition. A short press/release between physics steps is retained as one pending shot, and missing input stops held fire after 0.35 simulation seconds. Explicit pause/disconnect resets cancel pending fire.

Losing the host's **connection** pauses shared play during its reconnect grace period. Authenticated recovery preserves the current round, lives and score; failed recovery ends the room. A private reconnect token reserves a seat briefly, and a replacement connection closes the older one. There is no host migration, public matchmaking or fresh join during an active sortie. The host can return everyone to the same lobby to change the flight plan and accept new members. Opening an arena menu does not pause the shared round; an ordinary mission's live host can pause that mission, while a spectating host continues serving it.

The relay validates identity, membership, readiness, finite coordinate bounds, message size/rate, generations and host-only operations. This is **private casual multiplayer with a trusted host**, not competitive anti-cheat: the server relays bounded host-authored outcomes rather than rerunning combat independently. Solo progress is browser-local; active rooms are server-memory-only, have a 90-minute maximum lifetime and end when the process restarts. Use one server process for this version. Future scale requires shared room coordination.

## Code boundaries

- `public/campaign.mjs`: aircraft profiles, mission content, historical notes and source links.
- `public/arena.mjs`: room configuration defaults, map construction, per-player spawns and carrier compatibility warnings.
- `public/airframes.mjs`: precomputed game-model bounds used for carrier obstacle clearance without loading rendering code into physics.
- `public/sim.mjs`: flight, combat, participants/lives, mission objectives, elapsed round time and host snapshots.
- `public/terrain.mjs`: shared surface heights, runway/deck lookup, swept collision, radar line of sight and ground-clearance prediction.
- `public/terrain-visuals.mjs`, `public/terrain-stream.mjs`, `public/terrain-worker.mjs`: shared terrain mesh and colors, ground references/shadows, coalesced worker jobs and geometry transfer.
- `public/combat-visuals.mjs`: bounded, deterministic visual effect layers and damaged-aircraft smoke used by both renderers.
- `public/combat-feedback.mjs`, `public/combat-camera.mjs`, `public/combat-feedback.css`: addressed-hit deduplication, directional HUD, distance-scaled blast feedback and presentation-only camera reactions.
- `public/multiplayer-ui.mjs`, `public/arena.css`: score formatting, spectator selection, equipment notes and multiplayer presentation.
- `public/gunship.mjs`: shared station definitions, bounded crew input and quaternion-based sight/muzzle frames.
- `public/gunner-controls.mjs`: independent gunner keyboard, mouse and two-thumb input.
- `public/gunship-views.mjs`, `public/gunship-scenery.mjs`: first-person station interiors and shared compound geometry.
- `public/orientation.mjs`: shared aircraft attitude, body axes and quaternion rotation/interpolation.
- `public/camera-pose.mjs`: aircraft-relative cockpit eye, forward and up directions.
- `public/presentation.mjs`: fixed simulation clock and render-only pose interpolation.
- `public/renderer.mjs`: Three.js scene, terrain, effects and cameras.
- `public/models.mjs`, `public/aircraft-classic.mjs`, `public/aircraft-modern.mjs`, `public/aircraft-gunship.mjs`: aircraft model selection, distinct airframe builders and animation.
- `public/model-parts.mjs`, `public/model-batching.mjs`, `public/aircraft-lighting.mjs`: reusable geometry, material/vertex batching and generated surface reflections.
- `public/cockpit-models.mjs`: shared cockpit layouts, physical dashboards, cached instrument art and live telemetry.
- `public/software.mjs`, `public/software-terrain.mjs`, `public/software-aircraft.mjs`: automatic Canvas 2D compatibility renderer, shared-edge terrain mesh and bounded depth-buffered aircraft rasterizer.
- `public/controls.mjs`: touch and keyboard input with pointer cancellation.
- `public/audio.mjs`, `public/combat-audio.mjs`: gesture-unlocked audio, cached layered combat sounds, stereo placement, ducking and bounded voice mixing.
- `public/settings.mjs`: bounded, fault-tolerant preferences and local progress.
- `public/app.mjs`, `index.html`, `style.css`: hangar, campaign, HUD, briefings, settings and integration.
- `public/network.mjs`, `server.mjs`: room transport, interpolation, relay and static hosting.

## Verification and limits

Focused Node tests cover simulation/objective behavior, control cancellation and simultaneous pointers, storage failure, real WebSocket room/protocol cases, render interpolation, and flight/input equivalence at different frame rates. Flight regressions check banked/inverted pitch and yaw, pilot-right roll, full loops and rolls, gravity and rotated hover thrust, smooth recovery, and vertical remote weapons. Graphics regressions cover both cockpit cameras, terrain boundaries and shared canyon diagonals, runway/deck geometry, effect lifetime/budgets, worker request coalescing, coverage and buffer resizing. Model and cockpit/raster tests cover finite geometry, independent animation, wheel contact, open intake cavities, live telemetry, intersecting surfaces, transparent occlusion, near clipping and bounded reusable buffers.

Arena tests exercise per-aircraft equipment, permitted carrier attempts, terrain-masked radar and missiles, ground collision, host death with continuing play, per-pilot mission lives, respawn generations, duplicate damage protection and final standings. Real WebSocket integration runs actual guest gunfire through the host simulation, confirms kill/death attribution and both pilots' respawns, preserves score during authenticated recovery, and rejects old-run or old-life messages. Timer regressions distinguish elapsed round time from capped physics stepping. Lobby coverage includes all flyable aircraft, all three supported round lengths, readiness changes, same-room replay and return to lobby.

Combat-feedback regressions cover addressed damage receipts, event-tail recovery, duplicate and old-life suppression, shared AC-130 identity, inverted and camera-relative bearings, distance attenuation, reduced motion, noncumulative camera kicks, bounded smoke/effect pools, and audio waveform/mixing limits. App-level checks exercise the actual damage HUD and the brief fatal-destruction interval before debrief. These checks do not establish loudness, speaker reproduction or sustained rendering performance on a particular device.

Browser checks in an environment without a WebGL context exercise the real interface and the software renderer, including phone-sized portrait/landscape layouts; they do not verify the WebGL image. Geometry, shader-compilation and Canvas tests also do not establish sustained GPU performance. Actual GPU output, extended hardware sessions, physical iPhone/Safari controls and performance, and multiplayer over independent internet connections still require device testing. The diagnostics report the active backend and measured session frame rate rather than promising a fixed frame rate.

Gunship regressions additionally cover station/body-frame alignment through inversion, initial target visibility, independent cadence/stores, swept shell hits, terrain occlusion, bounded subframe presses, interruption safety, shared snapshots and an entire eight-target mission flown with continuous pilot controls and physical shells. Real WebSocket tests cover crew capacity/roles, input validation, authority, replay/reconnect handling and shared damage.

This release uses stylized procedural scenery, simplified cockpit systems and flight dynamics, a trusted flight lead, and browser-local campaign progress. It is designed to grow into richer terrain, more detailed handling, stronger mission scripting and more robust multiplayer without replacing the whole game.

## Third-party licenses

Three.js r160.1: MIT, `public/vendor/THREE-LICENSE.txt`.

ws 8.18.3: MIT, `vendor/ws/LICENSE`.
