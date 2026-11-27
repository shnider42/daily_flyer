# CHALK

Version 1.18.0 makes the mobile HUD minimal and gives the right thumbstick more room to aim before firing. CHALK is a standalone Daily Flyer top-down squad game inspired by the Battle of Mogadishu, 3–4 October 1993. The four-person squad, missions, dialogue, and outcomes are fictionalized; the six standalone operations are explicitly fictional scenarios.

## Minimal mobile HUD and deliberate aiming: version 1.18

Mobile soldier cards now live in **Squad** / **Radio**, alongside orders, pings and relief support. They no longer occupy the top of the battlefield. The same roster remains permanently visible on desktop, and switching touch controls restores it to the correct location. The mobile panel remains available when the current soldier is wounded, so a standing, unclaimed soldier can still be selected. Current health and ammunition stay visible in a small equipment panel; objective details expand on demand and radio messages remain transient.

**Regroup** has a dedicated compact button beside Reload. It becomes **Ready** when following the leader. Leaders can still tap visible battlefield ground to move the squad immediately; the overview map and explicit Ping command continue to mark locations without changing orders. The two thumbsticks retain their existing footprints and actual-touch pickup origins.

The right stick keeps its 12% aiming dead zone. Firing now starts at 88% of travel rather than 56%, with a visible boundary and distinct AIM / FIRE feedback. After firing starts, easing back below 78% stops it; the gap prevents small thumb movements from repeatedly switching the trigger. **Settings → Aim & controls → Distance to fire** adjusts the start point from 72% to 96% and is saved independently of HUD size and desktop preferences. Releasing or cancelling the gesture, opening a blocking panel, changing soldiers or resizing clears the held input. No separate fire button or extra finger is required.

Version 1.18 validation: **485 full-suite tests**, **458 frontend build tests**, and **253 authoritative server tests** pass (the suites overlap). Browser layout checks covered **375 × 667 portrait**, **812 × 375 landscape**, and **1280 × 720 desktop**, including the compact roster tray, role switching, direct Ready control, saved firing-distance setting, and restoration of the desktop roster. Automated tests execute the shipped gesture handlers with independent pointers and verify hysteresis, release/cancel, blocked input, resize, and role-aware commands. Physical-phone multitouch and mobile Safari remain untested.

## Reserve staging repair: version 1.17.1

Relief starts at real rear-western positions selected for free space, separation from the opening defenders, no unobstructed hostile firing exposure, and a navigable route out. The actors, home posts, staging point, and return route use those same selected positions. The reserve can be visible near CHALK at the start through the ordinary sight rules. It remains vulnerable once the operation develops. This fixes layouts where the backup team became unavailable within the first few seconds. A repeated 24-seed, 15-second Standard Cordon opening check went from three early unavailable reserves to zero; this is an opening-availability check, not a full-mission survival result. Mobile help now names **Radio** when following Hale and describes explicit Move targeting correctly.

Version 1.17.1 validation: **475 full-suite tests**, **448 frontend build tests**, and **250 authoritative server tests** pass (the suites overlap). A separate initial-placement check found all three reserve members present across 66 combinations of seed and difficulty. The opening fire observation keeps all initial combatants durable so NPC casualties cannot truncate its firing checks; the original shot thresholds and separate exact firing-cadence tests remain intact.

## Support and gunplay: version 1.17

**Cordon** now has a three-person **Relief** detachment, including a medic, stationed in the western staging area. This brings that operation to eight independent friendlies; the other missions retain five. Open **Squad** on mobile (**Radio** when following Hale) or use the desktop orders panel, choose **Request support here**, and select a location on the map. Relief physically travels to a reachable position near the request, covers the area and helps nearby wounded, then returns to staging. One support deployment is available for the operation; a friendly squad's emergency request can claim the same reserve. Reports describe acceptance, delay, arrival, withdrawal and completion. Eligibility depends on the detachment's actual health and available people. Ordinary pings continue to leave orders unchanged.

Independent friendly casualties now have a 70-second recovery opportunity. A suitable buddy can approach under cover and use a finite medical supply; the player can hold **Assist** near a visible wounded ally. Treatment takes three seconds for a medic or 4.5 seconds for another soldier, restores partial health, and sends the recovered ally back with their group. Each group has a limited smoke opportunity for casualty aid: a real canister travels, collides and waits for its fuse before creating the shared smoke obstruction. Supplies do not replenish automatically. These soldiers remain separate from the four playable squad members and the extraction requirements.

Friendly groups reconsider their assignment after critical wounds, casualties or sustained suppression. Fallback selection checks reachable cover and previously reached stops against recent known threats. Groups can bandage, regroup and resume, or return to an on-map staging position. Raven finishes one route check and returns instead of repeating it indefinitely. Later enemy placement also respects independent allies' occupied positions and unobstructed sight. Neither this placement rule nor support reports grants player vision; co-op exposes only visible allied actors and a compact public support status.

**Gunplay visuals** use actual shot, projectile, impact and victim-hit events. Weapon families have distinct flashes and brief shoulder recoil; short tapered streaks stay within actual projectile travel. Concrete chips, metal sparks, wood splinters and softer dust use the struck surface and direction. Small casing and powder effects have fixed budgets and short lifetimes. Effects respect current sight, smoke, walls and roofs, and repeated co-op packets cannot replay them. Reduce motion retains quieter muzzle and impact information while suppressing the added weapon/body animation, casings and powder motion. This is presentation feedback: mobile aim/fire mapping, thumbstick pickup and desktop aiming are unchanged.

**Gunfire audio** retains the existing credited recordings and applies broad playback EQ to distinguish weapon families. Continuing automatic rounds retain their recorded attacks and duration, with restrained gain and reflection-feed changes to limit buildup. Own fire and close incoming reports receive priority when several groups fight. Actual supersonic near passes retain their collision-derived timing and gain a clearer lateral cue. Cached procedural surface contacts distinguish concrete, stone, metal, wood and rubber, with a legacy body-contact fallback; each contact uses one bounded voice. These effects do not add projectile ricochet physics. Source timestamps, distance propagation, obstruction and existing room/street responses remain in use. No new recorded material is introduced; attribution and processing notes remain in `public/audio/CREDITS.txt`.

Bounded visual checks used the production renderer and actual simulation-derived rifle/concrete and SAW/metal contacts at **390 × 844**, **844 × 390** and **2560 × 1440**, plus a magnified inspection crop. The backend was a native Canvas2D CPU rasterizer. These establish rendered appearance, not physical-phone behavior or hardware frame rates. Automated coverage includes effect bounds and expiry, visibility clipping, unchanged aim coordinates, finite aid and support, actual smoke flight/fuse, and solo/co-op consistency.

Version 1.17 validation: **474 full-suite tests**, **447 frontend build tests**, and **249 authoritative server tests** pass (the suites overlap). Browser layout checks exercised the support tray and map targeting at 375 × 667 portrait and 844 × 390 landscape; duplicate map instructions were removed. Protocol **11** carries the finite support request and public report and requires both clients and the service to update together. Physical-phone multitouch, frame rate, and speaker/headphone balance remain separate checks.

## Mobile HUD repair: version 1.16.1

A portrait-only CSS regression in 1.16 placed both visible thumbsticks 50 CSS pixels above and to the left of their touch pads. The old phone media rule and the new shared touch rule each applied centering. The redundant rule is removed, and portrait/landscape now share one explicit center calculation. The objective remains in its own grid row. A second obsolete high-specificity landscape rule was covering the Throw button with grenade-type controls for soldiers without specialist gear; removing it restores separate, reachable Gear columns. Optional FPS diagnostics now sit above Reload instead of covering it.

Both sticks begin neutral where the thumb lands. Their visual centers remain inside the touch pads, and movement/aim continue to use the original pickup point for the whole gesture. Releasing, cancellation, pausing, or resizing clears the held input. This repair does not change desktop bindings, combat, squad AI, sound rules, or the co-op protocol.

The stylesheet and changed entrypoint are versioned so a returning browser requests this repair. `public/layout-check.html` is an unlinked developer fixture for viewing the actual game at 375/390/430 px portrait, 812/844/932 px landscape, and 1280 × 720 desktop viewports. It preserves the running mission when resized. It checks browser layout and single-pointer controls; it does not simulate physical phone hardware, safe-area insets, or multitouch.

## A living district: version 1.16

Two independent friendly groups, **Raven** and **Hammer**, can patrol the north route and relieve an eastern crossing. Their five soldiers remain separate from the player's four-person chalk. Up to six additional hostile patrol and building-guard members use the existing difficulty budget; this does not increase the overall hostile cap. Story missions can omit extra groups when their opening threats already fill that budget.

These groups follow their own routes, halt, regroup when scattered, react to current contacts or nearby actual reports, and return to their assignments after losing contact. Heavy losses can make a mobile group withdraw. Cohesion varies between groups and seeds: some hostile groups are loose, while building defenders can hold their approaches effectively. The implementation is a bounded assignment system, not a strategic campaign or a simulation of the historical units.

Building guards begin at real interior posts connected to actual doorways. They occupy different sides of rooms and use the existing navigation, sight, cover, suppression, reload and projectile rules. Independent squads can fight each other before the player arrives. A field group has at most one automatic frag opportunity, requiring a current close contact, clear travel and safe distance from bystanders. Casualties persist through the existing body system. These troops never add an extraction requirement or a kill-all objective. Their offscreen kills and accidental civilian damage do not become the player's statistics or campaign penalties; harm caused by the playable chalk still counts.

Independent friendlies do **not** contribute to shared sight. They render only while the playable squad can see them, with a muted blue broken ring distinct from the squad's green rings. Desktop leader labels show a callsign and, in Simple guidance, the current assignment. Co-op sends only visible allied actors and strips private routes, posts, targets and navigation fields. Client terrain reconstruction also discards locally seeded field orders. Protocol **10** requires both clients and the service to update together.

### Hearing the district

Mission battle sounds now come from real simulation events. Random background gunfire/explosions have been retired; ordinary city ambience remains. Shots and explosions are audible across the district with travel delay, distance filtering, cover attenuation and the established room/street responses. Beyond 650 world units, a separate distant-shot budget permits a four-shot burst and refills at eight shots per second. Nearby reports retain priority, so several remote automatic weapons cannot drown out immediate danger or grow an unbounded audio queue.

There are **25 complete human voice recordings**, up from 14: 15 clean recordings and 10 additional radio-only performances. The new radio bank covers contextual ammunition, contact, movement, perimeter and extraction calls. Its baked-in radio treatment is used only for actual radio traffic. Independent friendly speech is physical sound at the soldier, with no fallback onto the player's radio if they are distant or blocked. Short field callout text varies with moving, contact, holding, regrouping and withdrawal. Nearby NPC footsteps use the existing surface and priority rules.

The shared **60-second routine-order cooldown**, **180-second ordinary phrase cooldown**, single intelligible phrase limit, natural nearby squad speech, seamless same-recording local/radio transitions, separate voice volume and existing music remain. The retired “All right, let's move out” recording stays excluded. Asset sources, license terms and reproducible preparation steps are in `public/audio/CREDITS.txt` and `tools/prepare-field-radio.py`.

### People and mobile handling

People have stable variations in clothing, headwear, skin, gear and build, with clearer boots, shoulder seams, hands, packs, radios and role equipment. Gait phases vary by person; stationary actors no longer walk in place simply because they have a movement-speed statistic. Small idle motion and reload gestures respect Reduce motion. Cosmetic variation changes no collision or combat statistics.

Mobile now keeps a compact **Squad / Gear** dock alongside the thumb controls. Reload stays immediately reachable; Assist appears when relevant. Gear opens grenade selection and deliberate drag-to-throw, plus the grenadier's binoculars and launcher. The equipment tray clears during the drag and closes after a completed throw. Squad, Gear and expanded radio panels close each other. The closed control band is 140 CSS pixels plus the safe bottom inset in portrait, or 124 in short landscape.

The objective title/progress remain compact, with an expansion button for the full explanation. **Squad → Ping a place**, or a tap on the overview map, marks a place for either role without moving the squad. Leader battlefield taps retain movement orders. Touch destinations require a completed tap, and the aiming stick starts where the thumb actually lands, avoiding an aim/fire jump on off-center pickup. Settings and help remain in the pause menu. Desktop bindings and the existing Simple/Moderate/Expert guidance remain available.

Version 1.16 validation: **433 full-suite tests**, **408 frontend build tests**, and **232 authoritative server tests** pass (the suites overlap). Coverage includes independent combat and collateral attribution, all mission/difficulty population budgets and usable building posts, fog and private co-op state, finite NPC grenades, speech and distant-report budgets, real asset boundaries, mobile destination cancellation, thumb pickup, pings and panel lifecycle. The production Canvas renderer was inspected at 2560 × 1440, 390 × 844 and 844 × 390 using a native CPU rasterizer; those are rendering checks, not physical-device frame-rate measurements.

## Guidance, controls, and field operations: version 1.15

**Simple** uses larger desktop type and plain explanations across the objective, squad, health, ammunition, orders, radio, settings, and field guide. A six-step introduction teaches actual movement, safe aiming, a ping, opening/closing the map, regrouping or readying, and reading the current objective. No shooting or grenade throw is required. Steps can be skipped, revisited, dismissed, or replayed from Settings. Completion and dismissal are saved separately from mission progress. **Moderate** keeps readable labels and concise contextual help; **Expert** remains compact. Guidance is independent of Story/Standard/Veteran combat difficulty.

Context help prioritizes wounded soldiers, flash recovery, low health, reloading, ammunition, suppression, nearby interactions, and radio choices. The current objective is explained without revealing later stages. Stored key bindings are used everywhere in the desktop help, tutorial, equipment prompts, map instructions, and order buttons.

**Middle mouse or P** places a tactical ping on the battlefield or map. Pings are blue, named, visible to both humans, and expire after eight seconds. Each soldier can have one marker, with a short cooldown. A ping does not change orders, paths, AI targets, or fog visibility. It remains usable while another mouse button is held to fire. Right mouse/T still give movement orders by default.

In **Settings → Aim & controls**, any gameplay action accepts up to two keyboard or mouse shortcuts. Conflicts identify the action that would lose the binding and require an explicit replacement. Clear individual slots or restore all default controls. Escape always remains available for cancel/menu, even when that action is rebound. Input is neutralized before editing, switching soldiers, pausing, losing focus, or reconnecting.

The mission catalog now contains **ten missions**: the unchanged four-chapter campaign and six standalone operations. The additions are:

| Standalone operation | Setting | Different objective rhythm |
| --- | --- | --- |
| Lantern Search | Night | Search separate interiors, follow clues, stabilize a missing courier, then escort them back south. |
| Dead Engine | Late afternoon | Restart a stalled two-truck convoy, escort its route, clear a later obstruction, and protect loading. |
| Crossing Guard | Day | Observe and cover a crossing, call three healthy residents out of shelter, then escort the slower group through covered stops. |
| Watchline | Dawn | Observe three approaches, transmit the route report, and withdraw along another route. No kill-all gate. |

Each operation has its own seeded district identity, authored route, and finite encounter groups. Clues appear only after the relevant search is completed. Gathered residents remain vulnerable people in the world; they are not inventory. Campaign continuation still ends at Dawn Mile.

**Co-op soldier selection** works directly in the briefing roster, live squad cards, pause picker, and the same rebound soldier shortcuts. Each human can choose any standing unclaimed soldier. The other person’s soldier is labelled and reserved even during a reconnect window. Health, ammunition, inventory, position, and mission state remain intact when control changes. AI takes over the released soldier; delayed input from the previous assignment is discarded. Room-host privileges remain separate from Hale’s squad-command role.

**Fog of war** now clearly separates current shared sight, remembered terrain, and unseen ground. A cool charcoal overlay shades remembered terrain by about 31% in daytime and unseen ground by about 63%; the district map uses 34% and 70%. Night keeps its own balanced treatment. Doorways and corners shape the visible area, while squad and known objective markers remain readable. The change retains the existing three low-resolution masks, 8 Hz sight refresh, and single cropped fog composite per frame. It adds no blur or extra sight rays.

Both the frontend and authoritative co-op service use **protocol 9**. Both players should refresh after the update.

Version 1.15 validation: the static build passes syntax checks and **382 tests**; the authoritative server suite passes **220 tests** (the suites overlap). Coverage includes binding conflicts and persistence, simultaneous desktop mouse buttons, accepted-action tutorial progression, pings independent of orders, arbitrary co-op soldier assignments, and all ten missions. Each new mission also completes through real navigation and interaction without teleporting or skipping objectives. Native Canvas checks cover day and night fog at 1280 × 720 and 2560 × 1440, plus the overview map; these are rendering checks, not hardware frame-rate measurements.

Live desktop browser checks at **1363 × 936** covered the six-step introduction, middle-mouse battlefield and map pings, keyboard and mouse rebinding with conflict confirmation, saved bindings after reload, Moderate help, and co-op soldier selection from the briefing, live cards, shortcuts, and field menu. Two real production clients also verified occupied/reserved soldier rejection, ammunition and mission continuity through reassignment, shared pings without changed orders, eight-second marker expiry, and authenticated reconnect. The map hides battlefield panels to leave more terrain visible and includes a plain explanation of its three sight states. Tutorial layout keeps the optional frame-rate readout clear of the coach.

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
| Lantern Search | Fictional standalone · night | Search three interiors, follow the clues, stabilize the courier, and escort them back south. |
| Dead Engine | Fictional standalone · late afternoon | Restart and accompany a two-truck convoy, clear a later obstruction, and protect loading. |
| Crossing Guard | Fictional standalone · day | Observe a crossing, gather three sheltered residents, and escort them through covered stops to the aid point. |
| Watchline | Fictional standalone · dawn | Observe three approaches, transmit the report, and withdraw along a different route. |

The operations use a compact city with seeded variation in blocks, alleys, courtyards, and frontage. Their longer stage sequences combine movement and observation with physical work, transport, and protection. Holding an area remains part of collection or casualty loading. Vehicles follow authored routes and wait for the squad; Night Relief includes a contextual carrier restart. General combat damage, towing, and free vehicle control are not implemented.

**Continue operation** follows Cordon → First Crash → Night Relief → Dawn Mile, carrying bounded consequences between those four chapters. The campaign ends after Dawn Mile. The six standalone operations are independent fictional situations, not additional claims about the historical sequence.

## Squad speech and hand grenades: version 1.14

The repeated **“All right, let’s move out”** clip is retained as a source asset but is no longer selected in missions or on the menu. Fourteen complete human performances provide movement, hold, cover, reload, medic, suppression, contact, sniper, frag, and general warning cues. These are licensed game performances, not historical recordings. The menu keeps its background radio texture.

**Routine orders share a 60-second speech cooldown.** Changing from Move to Hold, Regroup, Assist, or a smoke movement call cannot bypass it; the command itself executes immediately. Three actual movement recordings rotate, and ordinary exact phrases rest for at least 180 seconds. Urgent warnings have separate bounded opportunities. Only one intelligible squad phrase plays at a time. Narrative radio text is not replaced with a generic line that might contradict it. A separate **Squad voices** slider can silence spoken cues without affecting orders or gunfire.

Nearby squad speech is positioned at the speaker and feeds the existing room/street acoustic responses. Clear speech enters local hearing within roughly 30 game metres, with a wider leave threshold to prevent mode chatter at the boundary. A short actual doorway path can carry softer, filtered speech. Distant or blocked squadmates use radio. A **single running recording crossfades** between the two paths as either soldier moves; it does not start the sentence again. Speech reverberation has its own volume path so muting voices does not cut weapon tails. Death, pause, backgrounding, and listener changes discard stale speech.

Each soldier carries **two frags and two flashbangs**, separate from smoke and Mercer's four 40 mm launcher rounds. Hand grenades travel in a short arc, stop at solid cover, settle, and finish their fuse. Exposed squadmates, civilians, and survivors can be harmed by a frag; walls shield blast damage. Hand frags do not cut masonry. The existing 40 mm remains the tool for localized wall openings. Bounce and roll physics are not implemented.

Flashbangs do **no direct health, blood, death, or structural damage**. Actual clear line of sight and distance determine exposure; a clear shared room receives a stronger effect. Walls and closed corners shield it, and teammates and the thrower can be affected. Strongly blinded AI stops firing and moving; its aim recovers continuously. Affected soldiers stop contributing fresh shared sight until they recover, while unaffected squadmates still share what they can see. Previously explored terrain remains remembered.

The controlled soldier receives one smooth visual veil, muffled sound, and brief restrained ringing. **Reduce motion** uses a dark veil instead of the bright wash, without rapid strobing. **Flashbang ringing** has its own slider, including zero; vision and gameplay impairment remain. Hearing recovery continues even if Effects is muted during the flash.

| Platform | Controls |
| --- | --- |
| Desktop | Select **Frag / Flash / Smoke** in the equipment panel, or cycle with **Y**. Aim and press **N** to throw. **G** still throws smoke; **V** still fires Mercer's 40 mm. |
| Mobile | Tap the grenade type to cycle; **drag Throw to aim and release to throw**. Returning to the button or cancelling the gesture does not throw. Quick squad orders remain available. |

Both players must refresh for **protocol 8**. The authoritative server owns inventory and flash exposure. Each pending throwable retains its own release aim through network backpressure and packet coalescing. Pause/input cancellation explicitly discards pending throws; a later aim update cannot redirect a grenade already released. Two humans still leave two AI squadmates.

Version 1.14 validation: the required static build passes syntax checks and **330 tests**; the authoritative server suite passes **194 tests** (the suites overlap). New checks cover nonlethal LOS flash exposure, original-wall blast shielding, finite inventories, AI recovery and shared sight, captured mobile gestures, co-op per-action aim preservation/cancellation, sixty-second speech suppression, line rotation, local/radio routing, and audio lifecycle cleanup. Browser checks exercised the actual desktop throw key, flash veil and hearing, plus the real app at **414 × 896 portrait** and **896 × 414 landscape**. A tap did not throw; a captured drag consumed one flashbang and left the squad order unchanged.

Five actual Chromium OfflineAudioContext fixtures rendered **48 kHz stereo PCM** for local→radio→local speech, indoor speech, outdoor speech, mixed rifle/speech/flash audio, and hearing recovery with Effects muted. All checks passed; all 16 loaded audio assets were ready, all output was finite, and there were no full-scale samples. The highest measured sample magnitude was **0.504**. The transition used the same continuous recording source. These are integration and signal checks; they do not replace physical headphone, speaker, or phone listening. The remote browser's frame scheduling remained variable, so this release makes no new hardware frame-rate claim.

## A fuller city and less isolated fighting: version 1.13

The six mission seeds now produce distinct district arrangements. Parked sedans, pickups and vans, damaged finishes, handcarts, laundry, workshop freight, cinderblock stacks, tires and smaller household details break up the streets. Vehicles and material stacks supply actual collision and cover shared by movement, bullets, sight, AI navigation and co-op prediction. Road centers, doors, casualty access and at least one usable side breach approach per house remain clear. Static detail is baked into the existing map cache. At most three positioned ambient fires use bounded flames/smoke, wall-clipped cached light fans and the existing fog overlay. Cars remain static; this does not add driving, general vehicle damage or whole-building collapse.

Authored encounters now concentrate finite groups around connected approaches instead of scattering a few solitary actors across several blocks. The next approach can populate before its objective is reached, with independent placement retries and a short expiration window; it cannot spawn onto observed ground or turn into an endless ring of reinforcements. Support gunners and the AI SAW use bounded 12-round strings, weapon cadence, pauses and reloads. AI soldiers use local building/vehicle cover and reload refuges; nearby group contact reports expire. Squad followers take wider travel-oriented positions and stagger movement, with explicit move/regroup orders staying responsive. AI squad shots recheck clear sight and a civilian-safe dispersion corridor before firing. Followers must clear a doorway before settling on an exterior position, including after the movement that first reaches the arrival radius.

Daytime sound adds a stronger city horizon, spatial distant battle clusters and rumbles, intermittent helicopter and transport passes, occasional work-yard metal, sparse residential dogs and local fire crackle. The night everyday bed is 42% of the day bed, with different timing and filtering; actual combat reports keep their level. The director has its own seeded state, uses real district/map-edge anchors, and never spawns actors or causes damage. Ambient one-shots occupy at most eight of the shared 32 voices and yield to actual combat. Commands and the controlled weapon briefly duck the ambience. Pause, mute, backgrounding and role changes discard stale activity.

Footsteps now use six recorded stone and six recorded sand contacts by Fantozzi (CC0), one quiet source per contact, rather than paired synthetic clicks. Other soldiers' feet are limited to nearby listening range and filtered by actual walls. Offline fallbacks remain cached and quiet. The dog recording is by Brandon Morris (submitted by HaelDB), used under CC0; these generic contemporary effects are not claimed to be historical recordings. Full licensing and editing notes are in `public/audio/CREDITS.txt`; all previous recordings and music remain.

An outdoor shot no longer loses its echo when the listener crosses a doorway. The same exterior convolver and pending facade returns continue, with smooth attenuation and a low-pass filter **after** convolution so sound already in flight becomes muffled. New indoor shots keep the established room/indirect response. Deliberate pause, mute and listener changes still clear history to prevent stale replay.

Client and authoritative server use **protocol 7**, because older clients would otherwise predict movement through the new parked cover. Both players should refresh before joining. The playable squad remains four people, with two AI members when two humans connect. The broader soundscape and finite encounters present this fictional element within a larger battle; they do not claim to simulate the complete historical force. A U.S. Army veterans' account describes separate elements, obstructed streets, vehicles, intense building/alley fire, and helicopter support through the night: [Mogadishu rescue reflections](https://www.army.mil/article/113311/we_didnt_leave_anybody_behind_10th_mountain_division_veterans_reflect_on_mogadishu_rescue_missi).

Version 1.13 validation: the required static build passes syntax checks and **295 tests**; the authoritative server suite passes **169 tests** (the suites overlap). Coverage includes coherent finite encounters, sustained bursts, civilian-safe firing, real parked-cover collision/LOS/navigation, all six missions’ stage/convoy/door/room/alleys, co-op reconstruction, every house retaining a usable side breach, and full-party doorway clearance. Asset preparation reproduces the shipped WAVs byte for byte.

Browser PCM checks at 48 kHz confirmed the doorway tail remains after crossing without changing the direct-shot peak. A six-contact stone-footstep capture fell from 0.012627 to 0.005263 peak and from 0.000538 to 0.000317 overall RMS relative to 1.12. The busy 35-second day/night captures each included 27 actual weapon reports, loaded all 15 recordings, and produced no clipped or invalid samples (peaks below 0.541). These measure signals, not physical headphone/speaker quality. Day and night visuals were inspected at actual Canvas 2D buffers of **1366×900** and **2560×1440**. The remote browser’s animation-frame scheduling was heavily throttled and is not a credible hardware FPS benchmark; no desktop frame-rate guarantee is inferred from the much shorter measured game work.

## Longer outdoor resonance and contextual echoes: version 1.12

Clear outdoor gunfire now feeds a separate **2.8-second diffuse response**, with its level shaped by the buildings around the source and listener. Built-up streets retain a softer ring after the report; empty open ground gets no added exterior layer. The existing room and indirect-street responses remain unchanged. The original 1.12 release cleared that outdoor tail at a doorway; version 1.13 replaces the cutoff with continuous, smoothly muffled decay.

A clear outgoing and return path to a sufficiently large, more distant facade can also produce **one distinct late echo**, arriving 0.18–0.55 seconds after the direct report. Wall position determines its timing and direction. Open doors, blast openings, and intervening walls affect eligibility. Up to two early reflections remain; the combined facade plan is capped at three returns. The late return is quieter and darker, with a shared 0.24-second spacing and at most two pending/active late-echo voices so sustained SAW fire cannot reserve the mix for delayed echoes.

**Settings → Audio → Room & street reflections** controls both additions. Direct reports, weapon recordings, indoor balance, sound-travel timing, and the 32-voice limit remain. This is a bounded game-acoustics model; it does not claim to reconstruct the actual city's sound field.

Version 1.12 validation: the static build passes syntax checks and **266 regression tests**. Tests preserve the previous room/street waveform hashes, verify selective doorway flushing, and exercise late-echo geometry, actual breach removal, cancellation, spacing, and the two-voice pending cap. Deterministic Chromium audio renders confirmed the longer exterior tail and a separate approximately 459 ms facade return on a real First Crash layout. Indoor and obstructed renders matched 1.11 within floating-point rounding. A 36-shot, four-weapon mix at maximum reflections stayed at 25 active voices with no clipped or invalid samples. These are signal and integration checks, not physical headphone or speaker calibration.

## Recorded weapon reports and street echoes: version 1.11

The SAW and carbine now use separately shaped banks of three recorded single shots, with short lead-ins and controlled decay. Both banks adapt Baelphazoar's M249 range recording under **CC BY 4.0**. The carbine treatment uses the same source with different filtering and envelope shaping; it is not a separately recorded M16. The prior additional mechanical and synthetic body-noise layers have been removed from recorded gunfire. All earlier recordings and music assets remain. [Full sound credits and processing notes](public/audio/CREDITS.txt) identify the source, license, and adaptations.

Clear outdoor shots can produce up to **two early facade echoes**. Their paths use remaining exterior wall sections, so wall position, obstructions, doorways, and explosive openings affect the result. Each return has its own travel delay, direction, level, and filtering, supplementing the existing later street response. This is a bounded approximation of the district's geometry, not measured historical acoustics or a full sound-wave simulation.

The existing room response, indirect hearing, distance filtering, and source-to-listener sound delay remain. **Settings → Audio → Room & street reflections** still controls the reflected layer independently of direct gunfire. The mixer retains its **32 active-voice budget**; the new returns have lower priority than direct shots. Missing recordings use a cached procedural fallback.

Version 1.11 validation: the static build passes syntax checks and **257 regression tests**, including actual PCM bank boundaries, prompt attacks, decay between SAW rounds, reflection geometry, cancellation, and voice priority. Chromium OfflineAudioContext renders of sustained SAW fire, a four-weapon mix, street, room, obstructed, and distant reports produced finite output without full-scale samples. The busiest checked mix used 25 voices. A playable mission check confirmed the recorded SAW bank and all 12 audio assets loading. These are signal and integration checks; listening on physical headphones, speakers, and phones remains part of further balance work.

## More breachable walls and stronger night flashes: version 1.10

Explosives can open more of the existing district. Smaller houses and shallow rooms can accept narrower, soldier-clear side-wall gaps; suitable north/south frontage sections can break into an existing doorway to widen it. Each blast opens at most one section, with up to **four localized cuts per building**. Isolated openings use 80, 56, or 48 world units; doorway extensions remove 36–80 units when they retain a usable passage. Corner supports, interior partitions, remaining walls, and roofs remain. Whole-building collapse is still outside this model.

In a fixed seed-17 coverage sweep across all six operations, buildings with a usable sampled breach increased from **125/148 to 148/148**, and breachable exterior faces from **228/592 to 360/592**. North/south frontages increased from **0/296 to 86/296**. These figures describe that sampled layout set; very short jambs and obstructed sections remain solid. All generated passages in the sweep cleared the full 17-unit soldier radius. Navigation, sight, aiming, projectiles, acoustics, roof approaches, and co-op prediction continue to use the resulting wall geometry.

Night shots now have a **1.65× longer, 1.45× wider muzzle core** and a brighter warm local light pool. A short full-intensity peak survives the first few frames, then decays within the existing rifle/support/sniper shot lifetime. The brighter cue remains visible at the default 75% mobile zoom. Daylight tuning stays as before; **Reduce motion** retains the gentler core without surrounding light. Shot events drive the effect, one light per actor and at most 24 active lights, with cached sprites and walls/roofs/smoke still limiting visibility.

Version 1.10 validation: **262 automated tests** pass; the static build passes syntax checks and **244 regression tests**. New checks exercise actual AI passage through a narrow opening, late-join reconstruction and prediction, a real authoritative launcher impact into a new frontage, reconnect/restart, canonical-data rejection, continuous roof approaches, and night/reduced-motion flash behavior. Browser checks confirmed a real launcher-made frontage opening, changed sight, actual walk-through, and continuous doorway artwork with the roof closed or open. Side-by-side actual-shot renders confirmed stronger night flashes at desktop scale and a 390 × 844 mobile view at 75% zoom.

Foreground Linux Chromium, Standard Cordon, Canvas 2D and Balanced/Auto with audio enabled measured approximately **60 FPS at 1280 × 720 viewport/buffer** and **51 FPS at 2560 × 1440 viewport / 1920 × 1080 buffer**. These are scene-specific environment checks, not a hardware benchmark or a guaranteed frame rate.

**Client and authoritative server use protocol 7** so an older client cannot join and reconstruct the new openings as intact walls. Both players should refresh before creating or joining a room. Private co-op remains two humans and two AI squad mates.

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

**The current client and authoritative server use protocol 8.** Refresh both players before joining or continuing an online room. Private co-op remains two humans in a four-person squad, with two AI squad mates when both humans are connected.

## Breaches, sound propagation, and enemy variety: version 1.8

Mercer's **V / 40 mm** launcher can now open a soldier-wide gap in a qualifying section of a house's perimeter. The opening changes movement, AI routes, bullet collision, line of sight, the aim obstruction cue, and co-op prediction. Approach it to lift the roof, then walk through normally. Broken edges and persistent rubble mark the opening; only the affected house texture is refreshed. Initial blast damage uses the wall that existed at detonation, then the new geometry applies to subsequent movement and fire.

The original 1.8 release allowed at most **two openings per house**; version 1.10 expands this to four localized cuts and permits suitable frontage sections to widen existing doors. Corner supports, interior partitions, and remaining walls stay intact. Short or obstructed sections remain solid when they cannot produce a usable passage. This is local gameplay destruction; structural collapse and arbitrary whole-building demolition are future work.

Combat sounds now have source times and positions. Muzzle reports, real projectile near-passes, impacts, and detonations arrive separately using a reference **343 m/s at eight world units per metre**. Game-tuned bullets travel faster than sound while retaining their existing finite ranges. A distant nearby strike can therefore arrive before its muzzle report. Only a real, sufficiently close supersonic trajectory generates the listener's pass sound. Weapon-specific recording/procedural mixes distinguish the carbine, SAW, opposing support gun, sniper, and launcher. Existing recordings and music assets remain; the credits identify reused samples and synthesized layers.

Sound still uses a bounded approximation: stereo direction, distance attenuation, high-frequency roll-off, and building/interior muffling. It does not trace every acoustic reflection or model weather. Pending arrivals cap at 96 and active voices at 32. Pause, mute, hidden tabs, mission resets, and transport changes clear obsolete playback. Co-op uses authoritative source times and a bounded presentation-time estimate; real network latency still limits exact timing.

| Enemy | Behavior |
| --- | --- |
| Rifleman | Short bursts and ordinary advance/fire behavior. |
| Support gunner | Braces before longer suppressive bursts, pauses between bursts, and reloads a larger magazine. Suppression and lost sight interrupt the firing position. |
| Flanker | Chooses reachable lateral positions, moves faster, pauses to fire, and pursues only observed or briefly remembered positions. |
| Sniper | Existing deliberate aimed shot and visible warning, with one active sniper at a time. |

Live enemy limits are **10 / 16 / 20** for Story / Standard / Veteran, with additional weighted threat and role caps. Reinforcements avoid actual squad sight, including binoculars and newly opened walls, and maintain minimum separation. Target checks and path replanning are staggered. Persistent bodies do not consume live encounter slots.

The authoritative server sends the stable breach records; clients reconstruct geometry before predicting movement. Restarting the mission restores the original walls. **Both players should refresh for the current protocol 8.** The current room still supports two humans and two AI squad mates; four-human co-op is a separate proposed expansion.

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

After a win, **Continue operation** carries bounded medical/smoke supply costs, fatigue, and civilian consequences to the next chronological chapter. Fatigue adds two seconds per level to later regroup stages. The carry is capped and validated, and affects actual supplies and durations. Solo continuation is saved on this device; a separately selected mission can still start independently. **Start this mission fresh** clears the saved carry. Replaying uses the chapter's initial carry, so failed attempts do not stack penalties. Each chapter creates a fresh actor state; this is not continuous soldier permadeath or a mid-mission save system. In co-op, only the host can continue, the server computes the carry, and the two human seats remain assigned. Both clients should refresh for the current protocol 8.

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

The co-op seats remain Hale and Mercer, with Ames and Webb under AI control when both humans are connected. Solo selection does not steal a partner's soldier. Protocol 7 includes the map, movement, narrative, remains, destruction, and physical mission-object contract: after the update, both people should refresh before joining the same room. Existing music and all earlier audio assets are retained; new launcher/blast cues use the existing bounded audio mixer.

Foreground Linux Chromium checks of Cordon/Story with audio off measured approximately 60 FPS at a 1280 × 720 viewport and buffer, and 53 FPS at a 2560 × 1440 viewport with a 1920 × 1080 buffer, using Balanced/Auto. These are measurements of this browser environment, not guarantees for a physical desktop or phone. F3 exposes the same diagnostics during play.

## Houses, mobile framing, and ambience: version 1.5

Every ordinary house is enterable: walk through an open doorway without an interaction button. Roofs lift on a doorway approach or friendly occupancy and close after the squad leaves. Interiors contain masonry walls, wider houses have two connected rooms, and small furnishings are decorative. Doors and internal passages are wide enough for the complete squad and rescued crew. The overview map shows floor plans and the minimap shows the openings.

Movement, AI navigation, bullets, sight lines, aim obstruction cues, and co-op prediction share the same deterministic wall geometry. Walls also prevent reviving or rescuing someone from the other side. Doorways remain exposed. Both the frontend and authoritative co-op server require this release; the current network protocol is 7.

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

Touch uses a full-screen battlefield with translucent controls. Both sticks begin neutral where the thumb lands. Drag the left stick gently to walk and farther to sprint. A light right-stick drag aims, and pushing farther fires. Sprint stops while aiming or assisting. By default, an empty magazine reloads automatically when ammunition remains; Settings can disable the idle reload request. Reload stays above the movement stick. **Gear** opens grenades and specialist equipment; contextual **Assist** appears for nearby wounded people, rescue work, route obstructions, or self-bandaging. As Hale, tap visible ground to move the squad; the dedicated **Regroup** button brings them back. **Squad** opens soldier selection, Move targeting, Hold, Assist, pings, and support. When following Hale, the dedicated button becomes **Ready** and the menu is named **Radio**, with Ready, Wait, and Need help requests. **Ping a place**, or a normal overview-map tap, marks a location without changing movement orders. Mercer also has Binos and 40 mm controls. Opening the map or field menu, changing touch mode, rotating the phone, or switching soldier releases held input. The field menu can enable touch controls manually. Landscape and portrait layouts are supported. Reduce motion suppresses the drifting atmosphere.

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

The static `build` checks browser-module syntax and runs the simulation, operations, navigation/civilian, input, guidance, renderer, settings, frame-pacing, client, and server-assignment tests. It excludes actual WebSocket transport tests and does not require installing the server's `ws` dependency. `npm test` runs the complete suite, including actual WebSocket connections. `test:server` runs the backend and simulation regression tests used by the backend deployment.

The simulation is deterministic and independent of the DOM. The suite covers solo and co-op simulation, role/combat behavior, touch and desktop input, client and server transport, renderer/camera behavior, shared visibility, world variation, settings, frame pacing, building interiors, narrative consequences, casualty persistence, blood, and audio scenes. Coverage includes all ten operation definitions, physical equipment and delivery, reconnaissance, escorted residents, campaign boundaries, civilian shelter behavior, doorway navigation, independent human movement, two remaining AI squad mates, command permissions, role exchange, AI recovery of either human, shared interaction progress, cohesion and extraction, disconnect takeover, authenticated reconnect, host promotion, expired rooms, stale controls, one-shot actions, snapshot recovery, and WebSocket/HTTP boundaries. Earlier co-op release checks covered two separate browser sessions, four-person rosters, a member hosting while their friend leads, role swaps, field menus, invite links, reload recovery, and the deployed service with two real clients. Version 1.6 adds automated protocol, finite launcher ownership, observation cancellation, and seeded map reconstruction checks. Two separate browser tabs also verified the local current-version service: a grenadier host and leader guest, exactly two AI soldiers, binocular controls, launcher ammunition changing from four to three, and a role exchange retaining those three rounds. Browser QA covers direct ground orders, all four solo selections, binocular/launcher controls, and portrait/landscape layouts at 390 × 844 and 844 × 390. These checks do not include physical multi-touch hardware or iPhone/Safari.

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
