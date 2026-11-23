# CHALK

Version 1.9 expands CHALK into six operations with physical mission equipment, reconnaissance, casualty escorts, authored enemy encounters, improved navigation, night muzzle flashes, and room/street acoustics. CHALK is a standalone Daily Flyer top-down squad game inspired by the Battle of Mogadishu, 3–4 October 1993. Play alone or with a friend: either person can lead the four-person fictional squad, and computer-controlled soldiers fill every remaining position. Four chronological campaign chapters sit alongside two clearly fictional standalone operations. The setting is historically informed; the characters, dialogue, maps, and gameplay are invented or compressed.

## Play

For solo play, select any mission and choose **Lead the squad** or **Follow the leader**. Solo play continues to run locally without a multiplayer connection. Story, Standard, and Veteran change combat pressure; Simple, Moderate, and Expert change guidance. Simple adds a small directional aim assist to touch controls. Mission completions and preferences are stored locally in this browser. Reloading restarts a solo mission; an online session attempts to reconnect to its room.

| Operation | Place in the game | Objective flow |
| --- | --- | --- |
| Cordon | Campaign · afternoon | Retrieve an interior field radio, observe the market approach, cover collection, guide the loaded transport, and deliver the radio before extraction. |
| First Crash | Campaign · late afternoon | Inspect the wreck approach, stabilize two crew members, escort them along the west route, and observe the pickup street before withdrawing together. |
| Night Relief | Campaign · night | Observe a junction, accompany the relief vehicles, clear an obstruction, restart the stalled lead carrier, reconnect the loading-point radio, and cover casualty loading. |
| Dawn Mile | Campaign · dawn | Observe the route, retrieve a medical satchel, escort two stragglers through covered stops, deliver the supplies, and reach extraction. |
| Signal House | Fictional standalone · night | Retrieve a battery, inspect the avenue, reconnect an isolated radio, and withdraw while its transmission finishes. |
| Courtyard Evacuation | Fictional standalone · late afternoon | Stabilize residents in two separate houses and escort both through sheltered crossings to collection. |

The operations use a compact city with seeded variation in blocks, alleys, courtyards, and frontage. Their longer stage sequences combine movement and observation with physical work, transport, and protection. Holding an area remains part of collection or casualty loading. Vehicles follow authored routes and wait for the squad; Night Relief includes a contextual carrier restart. General combat damage, towing, and free vehicle control are not implemented.

**Continue operation** follows Cordon → First Crash → Night Relief → Dawn Mile, carrying bounded consequences between those four chapters. The campaign ends after Dawn Mile. Signal House and Courtyard Evacuation are independent fictional situations, not additional claims about the historical sequence.

## Operations, navigation, and atmosphere: version 1.9

### Work with people and objects in the world

Field radios, a medical satchel, and a replacement battery occupy actual positions inside buildings. Hold **E / Assist** beside an item to collect it, then bring its carrier to the receiving point. The bag follows that soldier. If the carrier is incapacitated, the item drops at their position and another standing squad member can recover it. Delivery checks the actual carrier; changing the selected soldier does not teleport the equipment. AI leadership can perform the core mission work while the human stays with the squad.

Reconnaissance asks the squad to reach a useful vantage and look toward a particular approach, with a clear line of sight. Face the indicated sector and hold **E / Assist**, or observe with Mercer's binoculars. Rescued crew and residents then have to move through the route with the squad. Night Relief's restart is an authored interruption: hold **E / Assist** beside the stalled lead carrier while the others provide cover. It does not imply a general vehicle damage simulation.

### Encounters at recognizable approaches

Enemies come from finite groups assigned to mission stages and places. They no longer replenish from a random ring around the player. Groups retain population and role budgets, minimum separation, and actual sight checks; unsafe placements are delayed or skipped rather than moved to an arbitrary angle. Clearing an approach has a lasting effect within that operation.

First Crash, Dawn Mile, and Signal House include deliberate sniper encounters. The existing aimed-shot warning, one-sniper cap, slower shot cycle, and ability to interrupt aim with walls or smoke remain. A sniper is an encounter the player can identify and respond to, not a promise of an unavoidable shot.

### Routes and civilian reactions

Squad mates, rescued people, and civilians use clearance-aware routes through doorways, room openings, and breaches. Reachable destinations, route recovery, and local movement handling address doorway jams and followers stranded on the wrong side of a wall. Nearby shots, incoming fire, and explosions cause mobile civilians to seek reachable shelter and remain there while the danger persists. Injured residents who cannot move cower instead. Their bent or crouched posture remains visibly unarmed.

### Muzzle light and environmental sound

Rifle, SAW/support, and sniper shots produce brief flashes at the weapon's actual muzzle. At night the flash adds a small local light patch; support fire and sniper reports have distinct shapes and timing. Walls, roofs, and smoke gate the effect. An observable distant source may flash without revealing its owner's silhouette or adding a contact marker. Cached sprites, bounded effect counts, and geometry computed for each shot avoid a full-screen lighting pass. **Reduce motion** keeps a dimmer muzzle core and removes the surrounding glow.

The sound mixer now separates compact room reflections from the later, more widely spaced returns of an urban street. Both the source and the listener affect the result: firing indoors, hearing a shot from another room, and listening from an open street can produce different balances. Doors and explosive openings change the geometry used by that approximation. The two reusable stereo responses are procedurally designed, not measurements of historical buildings, and the mixer does not trace every sound wave.

**Settings → Audio → Room & street reflections** controls the reflected layer independently. At zero, direct shots and other dry effects remain audible. Propagation delay, near-pass cracks, impacts, existing command/rotor/radio ambience, and the separate distress mix remain. No earlier recording or music asset has been removed.

### A clearer mobile view

During live touch play, the controlled soldier stays centered in the usable area between the HUD and thumb controls, including at the map edges, during zoom changes, and while using binoculars. The camera can extend beyond the map into a matching ground margin. The overview map retains its fitted view, and desktop camera behavior remains unchanged.

On touch, healthy name and role labels appear only in **Simple** guidance. **Moderate** and **Expert** use the squad cards for that information; **Expert** also removes routine objective labels and coaching. Necessary target markers, actionable Assist, and critical casualty cues remain. Routine labels near the controlled body are suppressed across touch guidance levels.

Version 1.9 validation: **255 automated tests** pass, and the static build passes syntax checks and **237 selected regression tests**. Coverage includes physical pickup/delivery and casualty drops, campaign boundaries, authored encounters, civilian shelter/navigation, source-aware room/street audio, muzzle visibility, and mobile camera behavior. Browser checks also confirmed an AI-carried item can be handed over through Assist and that the authored eight-second carrier restart resumes convoy movement.

Version 1.9 browser checks in foreground Linux Chromium, Standard Cordon, Canvas 2D, Balanced/Auto with audio running measured **59 FPS at a 1280 × 720 viewport/buffer** and **46 FPS at a 2560 × 1440 viewport / 1920 × 1080 buffer**. These are measurements of that environment and scene, not a guarantee for another device. A real-shot night fixture showed the muzzle core and local light; all 11 audio samples loaded; room/street transitions and a zero-reflections mix were checked. At **390 × 844** and **844 × 390**, actual Expert-touch movement to map edges preserved centering and removed routine world labels. Physical phones, multitouch hardware, and headphone tuning remain untested.

**Client and authoritative server now use protocol 5.** Refresh both players before joining or continuing an online room. Private co-op remains two humans in a four-person squad, with two AI squad mates when both humans are connected.

## Breaches, sound propagation, and enemy variety: version 1.8

Mercer's **V / 40 mm** launcher can now open a soldier-wide gap in a qualifying section of a house's perimeter. The opening changes movement, AI routes, bullet collision, line of sight, the aim obstruction cue, and co-op prediction. Approach it to lift the roof, then walk through normally. Broken edges and persistent rubble mark the opening; only the affected house texture is refreshed. Initial blast damage uses the wall that existed at detonation, then the new geometry applies to subsequent movement and fire.

There are at most **two openings per house**. Corners, fixed doors, interior partitions, and remaining walls stay intact. Short or obstructed sections are deliberately left solid when they cannot produce a usable passage. This is local gameplay destruction; structural collapse and arbitrary whole-building demolition are future work.

Combat sounds now have source times and positions. Muzzle reports, real projectile near-passes, impacts, and detonations arrive separately using a reference **343 m/s at eight world units per metre**. Game-tuned bullets travel faster than sound while retaining their existing finite ranges. A distant nearby strike can therefore arrive before its muzzle report. Only a real, sufficiently close supersonic trajectory generates the listener's pass sound. Weapon-specific recording/procedural mixes distinguish the carbine, SAW, opposing support gun, sniper, and launcher. Existing recordings and music assets remain; the credits identify reused samples and synthesized layers.

Sound still uses a bounded approximation: stereo direction, distance attenuation, high-frequency roll-off, and building/interior muffling. It does not trace every acoustic reflection or model weather. Pending arrivals cap at 96 and active voices at 32. Pause, mute, hidden tabs, mission resets, and transport changes clear obsolete playback. Co-op uses authoritative source times and a bounded presentation-time estimate; real network latency still limits exact timing.

| Enemy | Behavior |
| --- | --- |
| Rifleman | Short bursts and ordinary advance/fire behavior. |
| Support gunner | Braces before longer suppressive bursts, pauses between bursts, and reloads a larger magazine. Suppression and lost sight interrupt the firing position. |
| Flanker | Chooses reachable lateral positions, moves faster, pauses to fire, and pursues only observed or briefly remembered positions. |
| Sniper | Existing deliberate aimed shot and visible warning, with one active sniper at a time. |

Live enemy limits are **10 / 16 / 20** for Story / Standard / Veteran, with additional weighted threat and role caps. Reinforcements avoid actual squad sight, including binoculars and newly opened walls, and maintain minimum separation. Target checks and path replanning are staggered. Persistent bodies do not consume live encounter slots.

The authoritative server sends the stable breach records; clients reconstruct geometry before predicting movement. Restarting the mission restores the original walls. **Both players should refresh for the current protocol 5.** The current room still supports two humans and two AI squad mates; four-human co-op is a separate proposed expansion.

Version 1.8 validation: **219 automated tests** pass, and the static build passes syntax checks and **202 regression tests**. Coverage includes real launcher collision and damage ordering, movement/LOS/aim agreement, AI passage through rebuilt navigation, co-op reconnect/restart and hydration order, enemy behavior and spawn limits, range-clipped projectile timestamps, and bounded/cancelled audio arrivals. Browser QA confirmed a visible launcher-made opening, actual passage, automatic roof cutaway, and the localized blast sound arriving through the scheduler. Foreground Linux Chromium, Balanced/Auto with sound on, measured 60 FPS at a 1280 × 720 viewport/buffer and approximately 42–48 FPS in the Standard Cordon scene at a 2560 × 1440 viewport / 1920 × 1080 buffer. These are environment-specific measurements, not a 60 FPS guarantee on every desktop. Physical phone/headphone calibration and high-latency co-op listening remain untested.

See [EXPANSION.md](EXPANSION.md) for the proposed next systems: casualty dragging/carrying, nearby supply handoffs, bounding pairs, a carefully telegraphed rocket threat, uncertain route reports, general vehicle damage and towing, richer interiors, and four-human co-op. These are a design roadmap, not shipped features.

## Decisions, consequences, and casualties: version 1.7

The four chapters now reveal changing orders through radio updates. The raid begins with a planned ground pickup; helicopter losses and blocked routes change the operation. The squad, dialogue, decision points, resident encounters, compressed geography, and outcomes are fictional composites. The historical context panel distinguishes that fiction from the real battle and links to Army accounts of the original extraction plan and multinational relief.

| Chapter | Decision and concrete effects |
| --- | --- |
| Cordon | Keep the original, farther pickup and add one fatigue step for later chapters, or hold eight seconds longer while vehicles move to a closer street. |
| First Crash | Preserve smoke for withdrawal, or expend one actual squad round on a twenty-second screen at the wreck. Visibility changes for both sides. |
| Night Relief | Keep the assigned load, or take two additional wounded residents with twelve more seconds of exposed loading and added fatigue. The debrief reports how many actually survived to board. |
| Dawn Mile | Use the shorter market route with more corners, or the longer, open eastern avenue. The choice changes a real rally position; approaching the eastern route can itself communicate the request. |

Open the compact **Radio** chip or press **C**, then choose **Z / X**. The mission continues. The standing plan takes effect if nobody answers before the displayed deadline. A controlled squad mate can recommend; a human leader retains the final decision, and an AI leader acknowledges an accepted recommendation. Dead and incapacitated soldiers cannot issue story choices. The leader card shows a partner's current recommendation.

Each chapter includes an injured resident near the route. Squad sight discovers the opportunity; it is not marked across unexplored streets. Move within reach and hold **E / Assist** to provide aid. It takes one of that soldier's finite medical supplies and six seconds (4.5 for the medic), with nearby downed squad mates and core rescue/route work taking priority. Helping allows the resident to reach cover; it does not guarantee intelligence or a combat advantage. Passing them leaves their later condition uncertain. Civilian harm quiets distant calls for help and requires closer observation; it does not summon extra enemies as a punishment.

After a win, **Continue operation** carries bounded medical/smoke supply costs, fatigue, and civilian consequences to the next chronological chapter. Fatigue adds two seconds per level to later regroup stages. The carry is capped and validated, and affects actual supplies and durations. Solo continuation is saved on this device; a separately selected mission can still start independently. **Start this mission fresh** clears the saved carry. Replaying uses the chapter's initial carry, so failed attempts do not stack penalties. Each chapter creates a fresh actor state; this is not continuous soldier permadeath or a mid-mission save system. In co-op, only the host can continue, the server computes the carry, and the two human seats remain assigned. Both clients should refresh for the current protocol 5.

True deaths now leave stable prone bodies, with distinct poses and dropped equipment, for the rest of that mission. Living casualties keep their aid indicators and can still be recovered. Dead soldiers are labelled Lost. Bodies do not block movement or hold roofs open; unknown deaths remain hidden until actual squad sight discovers them. Previously observed bodies remain as inert terrain memory. A new mission or restart clears the remains.

Bullet and blast damage produces a short blood spurt and a small persistent ground mark; bodies have restrained side pools. No dismemberment is depicted. Blood respects walls, smoke, sight, and roof visibility. **Settings → Video → Blood marks** hides blood while retaining bodies. **Reduce motion** suppresses the animated spurt while retaining static stains. Ground marks merge by cell and cap at 512; bodies remain for the full mission. Cached sprites and viewport culling keep these details cheap to draw.

Performed pain reactions and fear/startle calls use four short CC0 recordings by EZduzziteh and HaelDB. **Settings → Audio → Distress voices** starts at 65% and controls those voices without muting the physical impact layer or commands. Pain and fear react to actual simulation events, with per-person and global spacing, distance/panning, interior muffling, and no speech from the dead. Wreck-fire ambience follows the crash location, night ambience is reduced, and commands and hits briefly lower the ambient bed. Existing recordings and any music assets are retained. These are edited game performances, not recordings of the historical battle.

Version 1.7 validation: the complete suite passes **185 tests** and the static build passes syntax validation and **169 regression tests**. Foreground Linux Chromium Cordon/Story checks with sound enabled measured approximately **60 FPS** at a **1280 × 720 viewport and buffer**, and **51 FPS** at a **2560 × 1440 viewport / 1920 × 1080 buffer**, using Canvas 2D, Balanced/Auto. These are environmental measurements, not guarantees for a particular device. Radio choices and blood/body settings were checked visually; phone-layout checks at 390 × 844 and 844 × 390 confirmed the expanded decision panel leaves the thumb controls accessible. Two local browser clients verified a member recommendation appearing on the leader’s card, the leader selecting a different option, synchronized resolution, exactly two AI squad mates, and all 11 audio samples loading. Physical multi-touch and mobile Safari remain untested.

## Squad and field control: version 1.6

| Soldier | Specialty | Gameplay difference |
| --- | --- | --- |
| Hale | Squad lead | Gives Move, Regroup, Hold, and Assist orders. AI Hale leads toward objectives when a different soldier is selected. |
| Mercer | Grenadier | Carbine, four launcher rounds, and binoculars. Moves at 80% of baseline speed; observation slows movement further and prevents firing. |
| Ames | Medic | Carbine, six medical supplies, and a 2.6-second revive versus the ordinary 4-second revive. |
| Webb | Machine gunner | M249 SAW, a 100-round belt, and sustained suppressive fire. Reloads take longer. |

These are fictional gameplay loadouts and balance values, not a reconstruction of an actual four-man team. In solo, click or tap a soldier's HUD card or use **1–4** to take control immediately. The pause menu also has a four-soldier picker. The soldier retains health, ammunition, equipment, and position; the previous soldier returns to AI. Downed or lost soldiers cannot be selected. If your controlled soldier is incapacitated, select another standing squad member to continue.

On mobile, **tap visible ground as Hale to move the squad there**. No map or command menu is required. A tap is separate from the joystick pointers, and immediate ground orders leave held movement intact. Drags, long holds, and cancelled touches do not place destinations. **Regroup** and **Hold** are always one tap away; other soldiers have immediate Ready and Wait requests. The map remains available for distant destinations, and the Squad/Radio panel retains additional commands.

As Mercer, use **B** or **Binos** to observe, and **V** or **40 mm** to launch toward the current aim. The launcher is manually controlled, consumes finite ammunition, has a reload interval, and does not fire while binoculars are raised. The blast can harm squad members and civilians; walls block its reach. Binoculars extend sight in the facing direction, with a wider camera view and unobtrusive framing. They do not reveal enemies through buildings or smoke. The medic and machine gunner use their specialties under AI as well as human control.

Squad spacing is wider on open streets and compresses inside buildings. Paths use reachable navigation points on the actor's side of a wall, which prevents the wider formation from pulling followers through blocked corners. The full squad and rescued crew still need to reach mission/extraction areas together.

Each mission starts with a fresh deterministic layout seed. Residential frontage, alleys, courtyards, building setbacks, footprints, and decorative district details vary, while main roads, mission anchors, convoy paths, and the first Cordon doorway remain stable. Co-op clients rebuild the same layout from the authoritative seed.

Occasional enemy snipers have a slower shot cycle and a visible aim-charge glint when the squad has a clear sight line. Only one can be active at a time. Their aim resets when sight is broken; walls and smoke remain useful cover. The sniper's sound has a distinct opposing-fire report and tail.

Shared squad sight now has a light terrain overlay that distinguishes current observation from remembered and unseen terrain. Daylight terrain remains readable. Walls, doors, and smoke shape visibility, and out-of-sight enemies are hidden rather than frozen in place on the map. The overlay uses cached, low-resolution masks refreshed at 8 Hz; drawing still uses the existing bounded Canvas 2D buffer. Night retains its existing darker treatment.

The co-op seats remain Hale and Mercer, with Ames and Webb under AI control when both humans are connected. Solo selection does not steal a partner's soldier. Protocol 5 includes the map, movement, narrative, remains, destruction, and physical mission-object contract: after the update, both people should refresh before joining the same room. Existing music and all earlier audio assets are retained; new launcher/blast cues use the existing bounded audio mixer.

Foreground Linux Chromium checks of Cordon/Story with audio off measured approximately 60 FPS at a 1280 × 720 viewport and buffer, and 53 FPS at a 2560 × 1440 viewport with a 1920 × 1080 buffer, using Balanced/Auto. These are measurements of this browser environment, not guarantees for a physical desktop or phone. F3 exposes the same diagnostics during play.

## Houses, mobile framing, and ambience: version 1.5

Every ordinary house is enterable: walk through an open doorway without an interaction button. Roofs lift on a doorway approach or friendly occupancy and close after the squad leaves. Interiors contain masonry walls, wider houses have two connected rooms, and small furnishings are decorative. Doors and internal passages are wide enough for the complete squad and rescued crew. The overview map shows floor plans and the minimap shows the openings.

Movement, AI navigation, bullets, sight lines, aim obstruction cues, and co-op prediction share the same deterministic wall geometry. Walls also prevent reviving or rescuing someone from the other side. Doorways remain exposed. Both the frontend and authoritative co-op server require this release; the current network protocol is 5.

Mobile now defaults to **75% camera zoom**, **85% HUD size**, and **Compact** detail. These preferences are independent of desktop settings and are added automatically to existing saves. Camera zoom ranges from 60% to 125%, and mobile HUD size from 75% to 115%. Compact keeps the current objective, mission stage, squad health, and ammunition. Touch buttons and thumbsticks retain their full hit areas. The camera safe area follows the smaller panels and the contextual Assist control in portrait and landscape.

The menu uses a sparse ambient scene: recorded wind, moving helicopter passes, filtered human radio fragments, short performed commands, and distant synthesized impact/rumble tails. The first click or tap enables browser audio; **Enable sound** also starts it directly. Voices have gaps between them and lower the menu wind/rotor bed while they play. There is no continuous music bed. The scene crossfades into mission audio, stops on pause or a hidden tab, and respects mute and the Ambience slider. Entering a house smoothly softens outdoor wind, rotors, and engine noise, with a restrained increase in room reflections.

During a mission, existing movement and regroup radio events can play a recorded move-out call, and smoke/route-open movement events can play a short Go call. Hold and casualty messages do not trigger contradictory movement speech. These calls are a small initial voice vocabulary, not a full voiced dialogue system. Action volume controls nearby effects and squad calls; Ambience controls the background mix. Recordings and their edits are credited in `public/audio/CREDITS.txt`; none is presented as archival audio from the battle.

Browser checks for this release covered walking into and out of a house with the squad, menu audio assets loading, scene transitions, volume controls, and mobile layouts at 390 × 844 and 844 × 390, including the largest mobile HUD setting. In a foreground Linux Chromium Cordon scene, Balanced Auto measured about 60 FPS at 1280 × 720 (1280 × 720 buffer) and 59 FPS at 2560 × 1440 (1920 × 1080 buffer). These are checks in the test environment, not guarantees for a particular phone or desktop. Physical mobile speaker/headphone and Safari testing remain separate.

Roofs remain baked into the district cache. Only revealed houses add small cached interior patches, so entering a house does not rebuild the map. The wider mobile camera retains the existing bounded render resolution and fixed simulation step.

## Desktop update: version 1.4

The camera is prepared before mouse coordinates are converted into the world, and drawing uses that same transform. Human weapon spread affects the projectile without moving the soldier's requested facing. There is one custom reticle; the native cursor returns in menus and on interface controls. Immediate Regroup, Hold, and Assist commands preserve held movement and fire. Camera lookahead defaults off. Near map edges, the followed soldier is kept clear of the desktop HUD with bounded extra framing.

**Settings** is available in field orders, the desktop top bar, and the pause/field menu. Changes apply immediately and persist on this device. Reset retains mission completion, role, difficulty, and callsign.

| Category | Controls |
| --- | --- |
| Video | Performance / Balanced / High effects; Automatic / 75% / 100% rendering; 60 / 120 / uncapped frame limit; camera zoom; reduced motion; blood marks; performance display |
| Aim & controls | Camera lookahead; cross / ring / dot reticle; reticle size and color; optional wall obstruction cue; reload on empty; touch controls |
| Audio | Separate master, effects, ambience, distress-voice, and room/street-reflection levels; the Sound switch mutes without losing the mix |
| HUD | HUD size from 85% to 130%; Standard / Compact detail; guidance level |

The aim path uses the simulation's solid-wall intersection math. It indicates cover, not hit probability, bullet range, or actor hits. Disabling **Reload when empty** stops the client from requesting an idle reload; pressing R or firing an empty magazine still starts a reload. Input is absolute mouse aim, so there is no artificial mouse-sensitivity multiplier or smoothing slider.

**F3** toggles actual rendered FPS, frame time, p95 frame time, the Canvas 2D backend, and backing-buffer dimensions. The frame cap does not change the simulation's fixed step or the co-op server's timing. Menus and paused rendering are capped at 30 FPS, and hidden-page drawing stops. A lower canvas resolution does not lower HUD text resolution or change cursor-to-world mapping.

Automatic rendering limits the pixel budget to about 1.6 million in Performance, 2.07 million in Balanced, or 5.3 million in High. At a 2560 × 1440 viewport and device-pixel ratio 1, Balanced Auto draws a 1920 × 1080 battlefield; 100% draws the full 2560 × 1440. The effects quality and explicit resolution controls are independent. Native DPR is bounded at 2, and the minimum render density is 0.5.

Rendering reuses the baked district, samples only the visible map rectangle, caches smoke and light textures, and reduces decorative particles by quality. Full-screen CSS grain compositing and backdrop blur were removed. Squad rows are retained, and unchanged HUD text and health values no longer rebuild the panel. Smoke visibility, night visibility, injury cues, actors, and objectives remain at every quality.

### Desktop verification

The 1.4 pass was compared with the published 1.3 build in the same foreground Linux Chromium test browser, using a Cordon/Story/leader scene with audio off. The 2560 × 1440 iframe had a genuine 2560 × 1440 layout and was scaled for inspection; the 1280 × 720 iframe was unscaled. These are browser-environment measurements, not a benchmark of the user's computer. Samples were taken after loading and settling; ordinary variation is expected.

| Viewport | Build / settings | Actual canvas buffer | Observed FPS |
| --- | --- | --- | --- |
| 2560 × 1440 | 1.3 baseline | 2560 × 1440 | 14.2 |
| 2560 × 1440 | 1.4 Balanced, full resolution | 2560 × 1440 | 30.1 |
| 2560 × 1440 | 1.4 Balanced, 75% (same density as new Auto) | 1920 × 1080 | 50.7 |
| 2560 × 1440 | 1.4 Performance, Auto | 1687 × 949 | 60.0 |
| 1280 × 720 | 1.3 baseline | 1280 × 720 | 54.5 |
| 1280 × 720 | 1.4 Balanced, Auto | 1280 × 720 | 60.0 |

Browser checks also covered scaled/compact HUD layout, changing settings and resetting them, mouse aiming and firing, holding movement while issuing Regroup, and portrait/landscape touch layouts. The desktop test does not establish high-refresh performance on a physical 120 Hz display or Internet co-op latency.

## Private two-player co-op

1. Choose **Create co-op squad** and enter a callsign.
2. Share the six-character room code or use **Copy invite link**. Your friend opens the link or chooses **Join squad** and enters the code.
3. In the briefing, the room host chooses the mission and difficulty. Use **Swap player roles** to decide who leads, then choose **Deploy squad**.

The squad always contains exactly four soldiers:

| Soldier | Role | With two connected players |
| --- | --- | --- |
| Hale | Squad leader | Human; gives squad orders |
| Mercer | Grenadier | Human; moves and fights independently; launcher and binoculars |
| Ames | Medic | Computer-controlled |
| Webb | Machine gunner / M249 SAW | Computer-controlled |

The room host manages deployment, mission settings, restarts, and role swaps. Hosting is separate from leading: the host can play Mercer while the invited player controls Hale. **Swap player roles** is available to the host in the briefing and the mission's field menu, and changes the assigned soldiers without restarting the mission. Squad-command permissions follow Hale, regardless of who hosts.

A room can deploy with one person, and a friend can join an available seat during the mission. AI fills an unoccupied Hale or Mercer position, so there are three computer-controlled soldiers with one human and two with both humans connected. Rally progression and convoy movement account for both living human players; extraction still requires the surviving squad to assemble. Either human can stabilize crew or clear an obstruction.

### Connection recovery and room lifetime

Once the server detects a disconnection, AI takes over that soldier with the same health, ammunition, and position. The disconnected player's seat is reserved for **30 seconds**, during which the client attempts to reconnect with its saved session credentials. After the reservation expires, the player must join again using the room code if a seat is available. Stale movement and fire inputs become neutral after 500 ms, even before the connection is declared lost.

If the host disconnects, the remaining player becomes host after **5 seconds** without changing their squad role. These timers start when the server detects the disconnect. Explicitly leaving releases the seat immediately and promotes the remaining player immediately.

Rooms exist only in server memory. With no connected humans, mission simulation stops; a disconnected empty room expires after one minute, and inactive rooms expire after 15 minutes. Explicitly leaving the final seat closes the room. A server restart also clears rooms, so reconnecting is temporary session recovery, not a saved mission checkpoint. Session credentials are kept in the current browser tab's session storage; no account is required.

**Opening the field menu, map, or help does not pause an online mission.** Local held input is released while the other player and the shared world continue. Solo pause retains its existing behavior.

## Roles and controls

As **Hale**, command Move, Regroup, Hold, and Assist. As any other soldier, request Ready, Wait, or Need help. When Hale is computer-controlled, he navigates mission objectives and waits if you fall behind; with a human Hale, that person leads. Solo players select any standing soldier from the HUD or pause menu without restarting. In co-op, the room host swaps the two players' assignments from the briefing or field menu.

| Input | Action |
| --- | --- |
| WASD or arrows | Move |
| Mouse / left button | Aim / fire |
| Shift | Sprint; firing is disabled while sprinting |
| E, held | Assist, stabilize, clear an obstruction, or bandage yourself |
| R | Reload |
| G | Throw smoke toward your aim |
| 1–4 | Select Hale / Mercer / Ames / Webb in solo |
| B / V | Mercer: toggle binoculars / launch a grenade toward aim |
| Right click or T | Place a squad destination in leader mode |
| Q / H / F | Regroup / Hold / Assist; member mode uses Ready / Wait / Need help |
| M | Battlefield map |
| Escape | Pause in solo; open the field menu in co-op |
| F3 | Toggle frame-rate and render-resolution display |

Touch uses a full-screen battlefield with translucent controls. The left stick anchors near your thumb; drag gently to walk and to the outer edge to sprint. A light right-stick drag aims, and pushing farther fires. Sprint stops while aiming or assisting. By default, an empty magazine reloads automatically when ammunition remains; Settings can disable the idle reload request. Smoke and reload sit between the sticks; the contextual assistance button appears for nearby wounded people, rescue work, route obstructions, or self-bandaging. As Hale, tap ground directly for a move order; Regroup and Hold need one tap. The Squad / Radio button opens additional commands, and the map remains optional for distant movement. Mercer also has Binos and 40 mm controls. Opening the map or field menu, changing touch mode, rotating the phone, or switching soldier releases held input. The field menu can enable touch controls manually. Landscape and portrait layouts are supported. Reduce motion suppresses the drifting atmosphere.

Audio starts only after a user gesture, and can be disabled. Rifle and opposing-fire reports use distinct recorded samples, processed for distance and stereo position. A helicopter pass fades after the Cordon insertion. Recorded wind, footsteps, reload handling, and convoy engines remain quieter than nearby shots. Samples total approximately 530 KB and load asynchronously, with procedural fallback.

Squad members navigate around buildings and through open doorways, fire at visible armed opponents, and help downed teammates. The medic can recover either human player. Ammunition, launcher rounds, smoke, and bandages are limited. Squad members who are down for too long can be lost. In solo, a standing teammate remains selectable after your current soldier is lost; in co-op, the surviving player can continue after the other is lost. The shared mission fails when the whole squad is incapacitated or neither co-op player soldier can recover. Mission results emphasize survival, rescues, civilian harm, and completion time rather than kills.

## Historical framing

The setting is grounded in the October 1993 battle and its shift from raid to rescue. Names, dialogue, squad composition, maps, compressed timing, and outcomes are fictional. The game acknowledges U.S., Malaysian, and Pakistani participation in the relief effort and distinguishes Somali civilians from armed fighters. Civilians are unarmed, seek shelter, are excluded from AI targets, and can be injured by player fire; that harm is recorded in the debrief. No film dialogue, likenesses, music, or art is used.

Primary references are included in the game's **Historical context** panel:

- [U.S. Army Center of Military History: The U.S. Army in Somalia, 1992–1994](https://history.army.mil/portals/143/Images/Publications/catalog/70-81-1.pdf)
- [U.S. Army veteran accounts of the Mogadishu rescue](https://www.army.mil/article/113311/we_didnt_leave_anybody_behind_10th_mountain_division_veterans_reflect_on_mogadishu_rescue_missi)
- [U.S. Army: veterans reflect on the raid plan and battle](https://www.army.mil/article/156778/veterans_reflect_on_battle_of_mogadishu)
- [U.S. Department of State: Somalia, 1992–1993](https://history.state.gov/milestones/1993-2000/somalia)

## Run and validate

Requires Node 22 or later. Install the locked dependencies before starting the development server or running the complete test suite:

```sh
npm ci --prefix games/chalk --ignore-scripts
npm start --prefix games/chalk
```

Both `npm start` and `npm run dev` use `server/index.mjs`, which serves the browser assets and the WebSocket endpoint together. The local server defaults to port 3000, accepts `PORT` or `--port`, and supports `--host`. Local browser sessions connect to the same server's `/ws` endpoint. Use separate browser sessions to exercise two independent players; refreshing an existing tab resumes its saved session where possible.

Validation commands, run from the repository root:

```sh
npm run build --prefix games/chalk
npm test --prefix games/chalk
npm run test:server --prefix games/chalk
```

The static `build` checks browser-module syntax, including the five added operation, encounter, civilian, and acoustic modules, and runs the simulation, operations, navigation/civilian, input, renderer, settings, frame-pacing, and client tests. It deliberately excludes the server tests and does not require installing the server's `ws` dependency. `npm test` runs the complete suite, including actual WebSocket connections. `test:server` runs the backend and simulation regression tests used by the backend deployment.

The simulation is deterministic and independent of the DOM. The suite covers solo and co-op simulation, role/combat behavior, touch and desktop input, client and server transport, renderer/camera behavior, shared visibility, world variation, settings, frame pacing, building interiors, narrative consequences, casualty persistence, blood, and audio scenes. Coverage includes the six operation definitions, physical equipment and delivery, reconnaissance, escorted residents, campaign boundaries, civilian shelter behavior, doorway navigation, independent human movement, two remaining AI squad mates, command permissions, role exchange, AI recovery of either human, shared interaction progress, cohesion and extraction, disconnect takeover, authenticated reconnect, host promotion, expired rooms, stale controls, one-shot actions, snapshot recovery, and WebSocket/HTTP boundaries. Earlier co-op release checks covered two separate browser sessions, four-person rosters, a member hosting while their friend leads, role swaps, field menus, invite links, reload recovery, and the deployed service with two real clients. Version 1.6 adds automated protocol, finite launcher ownership, observation cancellation, and seeded map reconstruction checks. Two separate browser tabs also verified the local current-version service: a grenadier host and leader guest, exactly two AI soldiers, binocular controls, launcher ammunition changing from four to three, and a role exchange retaining those three rounds. Browser QA covers direct ground orders, all four solo selections, binocular/launcher controls, and portrait/landscape layouts at 390 × 844 and 844 × 390. These checks do not include physical multi-touch hardware or iPhone/Safari.

## Farwake reuse and networking

The co-op transport reuses code from Daily Flyer's `feat/farwake-galaxy` branch at [commit `756fee9ba7456b028fda0dc714829edf33a713ed`](https://github.com/shnider42/daily_flyer/commit/756fee9ba7456b028fda0dc714829edf33a713ed):

- `public/snapshot-delta.mjs` reuses Farwake's lossless snapshot-delta codec.
- `server/timing.mjs` reuses Farwake's fixed-step scheduler.
- The room server adapts Farwake's authoritative simulation, authenticated session recovery, command validation, bounded input handling, and backpressure rules to private two-person CHALK rooms. A skipped send does not advance a client's delta baseline.
- The client adapts input coalescing, bounded local movement prediction, remote interpolation, and full-snapshot recovery to CHALK's movement, mission state, and role changes.

The server advances the shared simulation at 30 Hz, accepts controls at 30 Hz, and sends snapshots at 10 Hz. Combat, ammunition, AI, objectives, and role assignments remain server-owned; local prediction only smooths movement. Static city geometry is generated from the shared mission seed, while snapshots carry the current actors, objectives, and mutable world props. Online rooms are temporary and limited to two humans; public matchmaking, voice/text chat, and persistent remote saves are outside this version.

Files:

- `public/sim.mjs`: collision, navigation, combat, squad AI, and mission progression.
- `public/mission-definitions.mjs`, `operations.mjs`: six operation sequences, campaign boundaries, physical cargo, observation, and mission interactions.
- `public/encounters.mjs`: finite authored enemy groups and deliberate sniper positions.
- `public/civilian-behavior.mjs`: civilian danger reactions, reachable shelter, cowering, and shelter retention.
- `public/building-geometry.mjs`: deterministic doorways, walls, rooms, and shared solid geometry.
- `public/world-variation.mjs`: deterministic district footprints, alleys, courtyards, and decoration.
- `public/squad-roles.mjs`: shared role loadouts, movement, and directional observation ranges.
- `public/visibility.mjs`: wall/smoke sight polygons, shared contact checks, and cached terrain memory.
- `public/renderer.mjs`: original Canvas 2D artwork, cached city/interiors, roof cutaways, camera, effects, and map.
- `public/app.mjs`, `touch-input.mjs`, `desktop-input.mjs`, `index.html`, `style.css`: menus, input, HUD, and debrief.
- `public/settings.mjs`, `performance.mjs`: validated local preferences, rendering budgets, frame pacing, and diagnostics.
- `public/audio.mjs`: menu/mission audio scenes, recorded rifle, helicopter, wind and command/radio samples, with procedural foley and distant impacts. Source credits and CC0 licenses are in `public/audio/CREDITS.txt`.
- `public/audio-environments.mjs`: cached procedural room/street responses and bounded source/listener geometry for reflection routing.
- `public/coop-client.mjs`: client connection, session recovery, state hydration, movement prediction, and interpolation.
- `public/destruction.mjs`, `combat-profiles.mjs`, `acoustics.mjs`: deterministic wall damage, shared threat/ballistic profiles, and propagation timing.
- `public/coop-protocol.mjs`, `snapshot-delta.mjs`: shared wire contract, input cleaning, and snapshot codec.
- `public/network-config.mjs`: same-origin local WebSocket selection and the production backend address.
- `server/index.mjs`: combined local HTTP/WebSocket server and production backend entry point.
- `server/rooms.mjs`, `protocol.mjs`, `timing.mjs`: room lifecycle, authoritative simulation, session verification, and scheduling.
- `server.mjs`: legacy static preview server; the package scripts now use `server/index.mjs`.

No accounts, analytics, chat, user uploads, or durable remote saved games are used.

## Deployment

Repository: `shnider42/daily_flyer`, dedicated branch `feat/chalk-mogadishu`.

The existing `dfe-chalk` static site serves the browser game. The separate `dfe-chalk-coop` Node web service runs private rooms on Render's free plan in Virginia. Keep unrelated DFE branches and services unchanged.

| Setting | Static frontend | Co-op backend |
| --- | --- | --- |
| Service | `dfe-chalk` | `dfe-chalk-coop` |
| Branch | `feat/chalk-mogadishu` | `feat/chalk-mogadishu` |
| Build command | `npm run build --prefix games/chalk` | `npm ci --prefix games/chalk --ignore-scripts && npm run test:server --prefix games/chalk` |
| Publish directory | `games/chalk/public` | — |
| Start command | — | `node games/chalk/server/index.mjs` |
| Health endpoint | — | `/health` |
| Node version | `NODE_VERSION=22` | `NODE_VERSION=22` |
| Automatic dependency installation | `SKIP_INSTALL_DEPS=true` | `SKIP_INSTALL_DEPS=true`; the build command installs explicitly |

Set `CHALK_ALLOWED_ORIGINS=https://dfe-chalk.onrender.com` on the backend. The browser's configured production endpoint is `wss://dfe-chalk-coop.onrender.com/ws`; solo play does not depend on this service. Render supplies `PORT`, and the server binds to `0.0.0.0`. Deploy compatible client and server protocol versions together. Rooms are held in one process, so restarts clear them and additional backend instances require a shared room-routing design.
