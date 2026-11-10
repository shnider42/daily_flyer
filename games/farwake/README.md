# FARWAKE — The Quiet Earth

**Version 0.5.2 · DailyFlyer · Solo voyages and persistent shared galaxies for up to 10 online captains**

[Play Farwake](https://dfe-farwake.onrender.com/) · [Multiplayer service and direct game](https://dfe-farwake-universe.onrender.com/)

You begin beside Kettle Station in **Cinder**, your choice of a balanced Sparrow, a quick Kestrel scout, or a cargo-focused Mule tug, with 180 credits and no fold drive. Earth has been silent for generations. Local jobs, old transmissions, and competing accounts of the evacuation gradually lead beyond your home system.

Farwake combines real-time ship flight with exploration and combat on foot. The browser uses Canvas 2D and native ES modules. Solo play runs locally; shared galaxies use a Node WebSocket authority and persistent storage. Players can explore separately, meet on a planet, or work stations aboard the same vessel. There is no runtime AI service: the story, characters, and branching encounters are authored.

## Direct perspective controls · 0.5.2

A persistent action button replaces the passive perspective label. **Walk deck** enters the current ship; **Take helm** returns to piloting it from anywhere on a cleared crew deck. At an outdoor landing, **Return to ship** uses the actual locally parked permitted vessel and launches. A docked crew deck shows **Launch ship**. Sites and active boarding keep their physical entrances and tether rules; the shortcut marks the required exit and explains what is blocking it.

Mobile gameplay places this button at the top left beside **View** and **Menu**, using the old Crew slot. **Menu → Crew** retains the multiplayer and boarding controls. The floating layout keeps its world space, scales with text settings, and supports narrow portrait and short landscape screens. Practice retains a compact **TEST** badge; exercise controls remain in Menu. Desktop uses the same direct action in the former mode badge position.

Shared commands determine the occupied or parked hull on the server. A visitor with helm access pilots that friend's ship, while another pilot's station, active boarders, contested control, incapacity, and capture requirements remain enforced. Cleared prize ships use their own helm and normal port departure. Switching preserves live hull momentum, damage, and identity; movement and fire inputs clear before and after an acknowledgement. Repeated taps wait for the first command, and failed actions restore availability with an explanation. Each perspective retains its own saved camera setting. Simple guidance teaches the helm button through two confirmed uses.

## Quiet lanes, physical encounters · 0.5.1

Hearth starts at the galactic center as a busy, serviced home system: 22 civilian traffic ships, navigation beacons, and no guaranteed ambient raiders, lifeboats, or abandoned freighters. Regional context controls traffic, rare distress contacts, and incident selection. Protected core and settled lanes cannot receive random convoy raids or border battles. Remote and dangerous systems have fewer ordinary ships and a greater, still limited, chance of a stranded vessel. Existing damaged, boarded, and captured ships are retained.

Personal ship encounters no longer use a repeating pop-up timer. Approach and investigate a real signal or hail the appropriate actual ship. Ordinary survey and navigation signals cannot fall back to unrelated emergencies. A toll refusal or false distress call turns the visible contact into a persistent armed ship; damage comes from its actual projectiles. The world director schedules a galaxy-wide opportunity after 15–22 minutes, then at irregular 12–25 minute intervals with a 25% quiet outcome and separate regional cooldowns. Those are opportunities across the whole galaxy, not a promise of an event near each captain. Existing active incidents and their participation records survive the pacing update.

Walking aboard a solo ship now leaves its actual hull coasting in the shared space simulation. Person controls do not operate its thrusters. Outside attacks damage that same hull, and returning to the helm resumes its live position, heading, and momentum. Existing shared vessel simulation retains one authoritative update per hull. Time spent on foot and repeated view changes cannot generate overdue encounter pop-ups.

Rescuing a lifeboat brings two named occupants aboard; evacuating a freighter brings three. They occupy actual free berths alongside humans, specialists, fares, and patients, appear on the carrier's deck, and remain attached to that hull across saves, crew changes, and capture. Their manifest shows the people being carried. Docking that carrier at an inhabited port transfers peaceful survivors ashore. Evacuated wrecks remain physical empty ships and do not regenerate their survivor.

Each rescued group has a saved, source-specific **10% chance** of being pirates. A concealed group can reveal itself after 30–75 seconds aboard, using the same people's names, positions, and health as actual armed boarding actors. The timer advances once per hull, independent of perspective and online crew count; reloading or changing views does not reroll it. An active hijack must be resolved before docking, and the actual fight remains on the actual carrier even when its owner is elsewhere. Defeat, lost hulls, and recapture preserve passenger and combat outcomes rather than moving people into replacement ships.

Protected ports stop offering impossible ambient-pirate bounties. Already accepted protected-system bounties retain their pay and progress but credit genuine frontier hostile-ship defeats, with payment at the original port. New frontier bounties remain local and require real ship-defeat evidence.

## People, professions, and a living frontier · 0.5.0

The chart now contains **900 systems**, including eight additional authored frontier systems. The original 300 retain their identifiers, coordinates, body definitions, and generation order. Existing saves retain their routes, visited places, owned ships, and decisions. Black holes are nonlandable hazards with visible warning contours, gradual gravity, bounded tidal damage, and matching client prediction; the slowest industrial hull can still escape under thrust.

**31 additional enterable places across 16 worlds** add markets, clinics, laboratories, conservatories, theatres, Choral rooms, hostile sites, and deliberately quiet rooms. Twenty neighborhood/interior residents add context. Original Morrow landing geometry, its first six interiors, and recovered-item identifiers remain unchanged. New Choral contacts have a distinct world sprite and matching dialogue portrait.

The captain’s notebook connects **11 authored threads (nine longer stories and two passing encounters), 45 stages, 13 recurring contacts, and 11 physical story objects**. Threads include passenger work, specific bounty investigations, gangster obligations, scarce medical supplies, unsettling recordings, alien contact, and rescue decisions. Choices alter money, faction standing, NPC trust, remembered conversations, later invitations, and subsequent debriefs. Signal sequencing, circuit dials, and evidence matching use visible clues without reaction-time requirements. Only discovered or locally available leads appear in the notebook.

Passage desks offer repeatable fares between inhabited ports. Accepted prices and the assigned hull persist; a passenger uses a real spare berth and requires physical pickup and drop-off. An optional smooth-passage tip is lost on actual hull damage, even if repaired later. Story passengers, patients, hired crew, and human crew share the same capacity. Faction liaisons accept local pledges; switching has a quoted cost and cooldown, and work can affect rival standing.

### Public services and careers

Approach the **Public services** contact beside a port clinic, or use **Log → Work & service → Find the public-services desk**. Enrollment is free. Each accepted shift shows its supply cost, current funds, and expected pay before confirmation. One assignment is active at a time; four careers retain experience, rank, completed shifts, and pay bonuses.

- **Paramedic:** Leave the dispatching hospital, fly to another port, physically collect a patient, and return for admission. The patient reserves a berth on the assigned hull. A lost carrier ends the assignment without pay and transfers the patient to emergency care, including when its owner was safely aboard another ship.
- **Doctor:** Complete three clinic scanner/triage puzzles under the duty supervisor. Correct completion pays once. Medical credentials work at other inhabited clinics, including Earth after lawful landing, and the local clinic receives the standing benefit.
- **Law enforcement:** Enroll with a local faction, investigate a complaint at another port, and choose civilian protection or enforcement. An arrest requires actual combat participation, disabled engines, a close approach, and a living surrender. A fatal outcome has a different report, payment, and reputation consequence.
- **Military:** Join a faction’s service and undertake a named patrol or assist a live engagement. Combat contribution is recorded; payment requires a return debrief. Employer ports issue faction work, and rival standing changes with service.

### Events continue without intervention

A persisted world director schedules rescue calls, convoy raids, clinic overloads, and border clashes. Incidents move from warning to active response to a recorded outcome. Interventions through completed care actions or actual combat change that outcome. Unassisted incidents resolve through local crews and leave shortages, clinic strain, or inspections; successful relief leaves its own favorable condition. Temporary conditions affect repair, refueling, and infirmary prices.

Solo incidents advance with play time and pause with solo menus. Shared galaxies use **one clock for the entire realm**, independent of online captain count. Elapsed time catches up after server downtime; processing, histories, and conditions are bounded. Active systems instantiate real hostile and watch ships, while unattended systems resolve at the event level rather than continuously simulating every projectile in 900 systems. Damaged, boarded, captured, and promoted vessels persist separately from incident expiration.

Rewards require recorded individual participation and cannot be claimed twice. Personal stories and relationships belong to each captain; incidents, local conditions, physical ships, and existing site claims are shared. A boarded bounty hull’s destruction produces the same persistent wreck evidence as an ordinary NPC hull, without duplicating salvage rewards. Flight readings use the actual vessel at the helm, and custody/patient delivery requires the actual carrier at port.

The notebook places the next objective, destination, and affordable choices together. Active duties appear first; career ranks, completed shifts, and event history can be folded away. Mobile navigation and controls retain their existing full-screen layout and independent zoom defaults.

## Beyond the landing zone · 0.4.0

Outdoor planet and moon surfaces are **108 × 80 tiles**, five times the previous 48 × 36 area. Landing zones, existing services, and story contacts retain their positions. Morrow adds six enterable sites connected by trails. Other worlds have seeded cave, shelter/igloo, and relay variants; barren moons have sparse landing areas instead of copied storefronts. Ship-mode body sizes are unchanged.

Sites include hostile wildlife, readable environmental records, one-time supplies, persistent local choices, and intentionally empty rooms with sparse atmospheric sounds. The standard Pulse sidearm is explicitly introduced at entry. Desktop uses WASD to move, mouse/arrows to aim, and Click/Space to fire. Touch uses WALK plus AIM/FIRE. Entrances remain usable during combat. A field defeat returns the captain to the planetary landing zone at 35% vitality, costs 10% of credits, and leaves the ship parked where it was.

Solo saves retain each site's creatures, recovered supplies, and decisions. Shared galaxies simulate an occupied site once for all captains there, with shared wounds and one-time rewards; separate sites remain independent. Server restarts and reconnects retain those records. Wildlife uses the same snapshot interpolation as boarding actors, with immediate damage/death feedback. The local chart draws directly from tile runs into a bounded 720px canvas instead of allocating an entire world raster.

Five additional ship classes bring the fleet to nine. New solo and shared captains choose **Sparrow / Kestrel / Mule** at no cost. Later hulls offer surveying, escort, or industrial specializations, with matching exterior scale, cabin capacity, stations, handling, and progression requirements. New designs appear in appropriate traffic and hostile groups. Starting menus expose only the three choices; the shipyard introduces later designs when their progression requirements are met, and practice still limits opponents to the smaller half of hulls. Existing captains and owned fleets remain intact.

Captain creation provides skin, suit, hair, and head-style choices plus up to two optional traits. Choosing none is valid. Trait benefits and drawbacks affect actual walking, vitality, sidearm damage/cooldown, mining rate, job pay, or port service costs. **Ship → Your captain** (also in Settings) edits appearance. Pre-0.4 captains get one optional trait-selection opportunity there; traits are fixed after confirmation, while appearance remains editable in a safe location. Appearance and traits are included in solo exports and shared captain persistence. Accepted contracts keep their agreed pay.

Shipyard purchases, crew hiring, medical/port services, home/bunk costs, and paid story choices show cost alongside current funds/resources. Purchase cards show the remainder or exact shortfall. Funds and requirements are still checked by the authoritative rules when the action is performed.

## Wider default cameras · 0.3.4

New captains and **Reset view** start with ship zoom at **25%**, the widest available view, and person zoom at **80%**. Existing saved camera choices are preserved; use **View → Reset view** to adopt the new defaults. Zoom ranges and the meaning of each percentage are unchanged.

## Clear zoom-out and saved cameras · 0.3.3

**View** and **Settings** now have independent **Ship zoom (25–160%)** and **Person zoom (50–160%)** controls. Both use 5% slider steps. Switching between flying, landing, and boarding restores that mode's camera. At 25%, the ship camera spans four times the width and height of its 100% view; small hulls retain heading brackets, readable shots, and contact cues. Text, buttons, physics, and interaction distances stay independent of zoom.

Below 100%, the world renders directly to the physical display grid, with nearest-neighbor sprite sampling. This avoids throwing detail away in a coarse intermediate canvas before enlarging it. Native buffers are bounded by the physical viewport; an extra full-resolution copy is skipped. Camera picking, labels, markers, and combat cues use the same density-aware transform. The established 100% and zoom-in rendering remains unchanged.

Shared camera settings are private to the authenticated **captain**, saved durably on the galaxy server and restored through that captain's existing passport on another device. **CREW → Captain passport** downloads the private identity backup; restore it to resume the same captain. On a new device, a galaxy invitation code alone creates a different captain. Camera preferences do not belong to a ship or helmsman role and are not sent to other crew members. Updates are debounced, versioned, and acknowledged after storage; a slow camera save never pauses other players.

Solo cameras travel in the existing voyage save/export format. Old browser `worldZoom` settings migrate into both modes once. Practice camera changes last only for that test session and restore the normal cameras on exit. Device-specific text size, thumb controls, handedness, and HUD toggles keep their existing browser preferences. Unsent shared edits can retry from a browser-local draft for the same captain and server revision; newer settings saved by another device take priority.

## Mobile world view · 0.3.2

Mobile gameplay now fills the available viewport behind floating controls by default. The header, status, and thumb controls no longer reserve solid bands. Their translucent surfaces keep the world visible while text stays opaque. Safe areas, compact action tips, narrow screens, landscape, enlarged accessibility settings, and left-handed controls remain supported. Desktop keeps its established layout and default camera scale.

**View** opens a small camera panel with a **60–160% world zoom** slider and plus/minus buttons. Zoom changes the field of view in space and on foot; it does not scale text, buttons, interaction ranges, or physics. Pointer aiming, contact selection, and destination markers use the actual camera transform. Surface zoom uses a reusable nearest-neighbor pixel layer to avoid smoothing its pixel edges.

The panel offers independent **Fill the screen**, **See-through controls**, and **Compact action tips** toggles, all on by default. Turning off Fill the screen restores the framed cockpit. Compact tips retain the immediate instruction and expand with +. **Reset view** restores only camera and view defaults; existing text size, thumb size, guidance, and save data remain intact. Preferences persist in the existing settings record, and older settings receive the new defaults without a voyage reset. View is also available from the captain’s menu; its controls never send gameplay commands or pause a shared galaxy.

## Mobile clarity and action guidance · 0.3.1

Mobile now uses a compact status strip and one captain's menu. The full mission, cargo, contacts, and systems remain available without permanently covering the world. A context action appears only when there is something to use; a single contextual teaching card replaces stacked instructions. Narrow portrait, landscape, left-handed controls, safe areas, and enlarged text/control settings have their own layout rules. Desktop keyboard flight is unchanged.

The **left STEER stick points toward a world heading and adds analog thrust** as the bow turns into alignment. A hull-aware damped controller supplies ordinary turn input to the existing angular physics; it never snaps orientation or replaces velocity. The small **right STRAFE stick is horizontal only**, relative to the bow. **FIRE** is a separate button above it; **BRAKE** slows the ship. **Tools** opens held mining and boost controls. Person combat retains independent walking and aim/fire sticks.

**Simple** teaches the first two confirmed uses of flight, walking, docking, interaction, work, mining, combat, boarding, and helm actions. Control progress is separate for keyboard and touch. Lessons advance on real movement or acknowledged results, not elapsed time, button presses against a wall, or another crew member's actions. Menus offer Action help, Repeat the last action tip, and Settings → Replay action tips. Moderate shows requested hints; Expert stays silent. Guidance is stored separately per solo save/shared captain, and exercises keep their learning only in memory.

Pixel-art rendering uses one snapped camera raster origin while simulation stays continuous. The viewport aligns to whole device pixels; mobile expands a reusable logical canvas into a native-resolution presentation canvas with smoothing disabled. World labels remain independently drawn at native text resolution and follow text size. This removes avoidable CSS upscaling, but physical iOS Safari timing/compositor behavior still needs device testing. Test coverage includes DPR 1/1.25/2/3, fractional origins, viewport changes, exact picking, independent pointers, prediction, confirmed action learning, and existing persistent boarding behavior.

## Combat, boarding, and isolated practice · 0.3.0

Every captain carries a **Pulse sidearm** as standard airlock equipment. In boarding combat, **WASD moves, the mouse or arrow keys aim, and left-click or Space fires**. Touch players move with the left stick and aim/fire with the right. With no manual aim, a visible bracket identifies the assisted target. Muzzle flashes, shots, wall impacts, confirmed damage, sounds, and attacker-attributed casualties make the action readable. A shot can miss; walls block it. The weapon never fires automatically for the player.

Boarding takes place on the **target vessel's persistent deck**. Its exterior scale follows its interior class. Wounded defenders, hull damage, location, and occupation survive retreat and return. The source and target remain separate exposed hulls; a third party can attack either. Return through the entry airlock while the origin is in tether range, or clear the deck and use the target helm. Taking a captured NPC ship leaves the surviving old ship at its original location. Shared player ships retain their legal owner; hostile control is temporary commandeering rather than silently deleting ownership or progression.

Hostile occupation blocks recovery into that vessel, including bunk respawns. Defeated captains recover at a safe port; if their owned ship is occupied or destroyed, recovery uses a separate basic hull. This does not repair, teleport, or reclaim the occupied target. Ordinary friendly crew are protected. A player must explicitly **declare hostility** before ship-versus-player damage or forced boarding; both sides can then fight. Friendly-fire balance remains deliberately limited to that rule in this release.

**Test mode** is at the bottom of the main menu; enter **123**. Choose ship combat, boarding a disabled target, person combat, or pirate raid defense. Only the smallest half of hulls by exterior size are offered as enemy choices. The player starts with the same cutter, no allied gunners, and no story/progression rewards. Exercises are separate unsavable sessions: retry, switch exercises, or exit without changing a solo voyage or joining a shared galaxy.

The top-right **CREW** label remains visible after connecting. To board a friend's ship, the owner grants access in **CREW → Shared ship & stations**; the friend selects the vessel in CREW and uses **Board with permission**. Meet at the same port or within 220 metres in space at low speed, with a spare berth and no immediate fight. A nearby ship also exposes its boarding/crew actions through the context button. The menu identifies its captain so two ships named Cinder are distinguishable.

## Smoothness update · 0.2.1

Shared play now replays the actual elapsed input timeline when reconciling with the server. Position and heading corrections preserve the previously displayed pose and ease back toward the authoritative result. Physics and presentation remain separate: visual smoothing cannot change collision, interaction range, damage, or authority. Neutral input keeps online coasting smooth while a menu is open. Old prediction is bounded during a connection interruption, and room changes, recovery, and teleports clear the old visual history.

Moving NPC ships, traffic, and boarding actors render between server updates. The server still simulates at 30 Hz and publishes motion at 10 Hz, but now schedules each simulation deadline instead of occasionally skipping an early interval. Snapshots avoid cloning every visited system before discarding that data. HUD elements are updated only when their values change, and world-label layout measurements are cached until the layout changes.

In **Settings → Show performance**, enable an optional FPS / ping display. **Settings → Performance & connection** has a copyable report with frame intervals and incoming update gaps. FPS measures browser rendering; ping measures network round-trip time; the 10 server updates per second are independent of the display frame rate. A hidden tab is excluded from frame-rate measurements. Reports contain no captain passport or galaxy access code.

Local real-WebSocket measurements with one connected captain reduced the 99th-percentile simulation gap from 65.9 ms to 35.0 ms and snapshot gap from 132.1 ms to 102.6 ms, without increasing the tick or packet rate. These are controlled local comparisons, not a promise of a particular FPS or ping on a player's device. A slow peer never pauses the galaxy for other players.

A deterministic local simulation checks client prediction at **60 and 120 FPS**, with **60, 120, and 200 ms round-trip latency**, variable packet delays, a 30 Hz authority, 20 Hz input transmission, and 10 Hz snapshots. In the 60 FPS maneuver case with 120 ms nominal latency and up to 23 ms of delay variation per network leg, RMS correction per rendered frame fell from **0.920 to 0.059 world units**; the largest frame correction fell from **4.259 to 0.468 units**. Reconciliation-induced position and heading discontinuities fell to zero in the tested traces, including a previous 4.97° heading jump. Steady coasting stayed within 0.002 world units RMS of the authority across all tested frame rates and latency cases. These figures measure the local prediction simulation.

## What is in this release

| Content | Current scope |
| --- | --- |
| Galaxy | **900 systems:** 20 authored hubs and 880 procedural systems |
| Campaign | Eight linked chapters involving both gameplay modes |
| Factions | Five, with persistent reputation and an authored alliance decision |
| Encounters | 25 authored choice events, including conditional follow-ups |
| Ship equipment | 16 upgrades, including three fold-drive tiers |
| Fleet | Nine hull classes, three included starter choices, and distinct 3–10-berth interiors |
| Crew | Seven NPC specialist roles, shared human/NPC capacity, injuries, and persistent memorials |
| Boarding | Assault disabled ships or defend your own deck against pirate boarders |
| Lore | 14 collectible records, plus location descriptions and NPC conversations |
| Local activities | Larger planetary maps, enterable settlements and wilderness sites, wildlife combat, persistent supplies and decisions, plus contract work, repairs, freight, surveys, trade and recruitment |
| Stories and relationships | 11 additional threads, 45 stages, recurring contacts, remembered choices, clue-based puzzles, and faction pledges |
| Professions | Paramedic, doctor, faction law enforcement, and military service with persistent ranks and paid assignments |
| Living frontier | Shared rescue calls, raids, outbreaks, and border clashes that resolve with or without player participation |
| Captain | Appearance choices and six optional traits; choose up to two with explicit benefits and drawbacks |
| Shared play | Up to 10 simultaneous captains per galaxy, independent travel, shared vessels, and persistent homes |

The procedural systems supply seeded places, encounters, resources, traffic, and threats around reusable surface layouts. They are not 880 separate handcrafted campaigns. The original campaign and encounters are authored in [dist/content.mjs](dist/content.mjs); the additional threads and recurring contacts are in [dist/quest-content.mjs](dist/quest-content.mjs).

### How the dynamic story works

Encounter eligibility depends on mode, location, resources, previous choices, and campaign flags. Eligible random encounters are selected using the game's saved pseudorandom state. Each option has explicit, deterministic costs and effects: credits, cargo, fuel, hull, reputation, lore, and persistent flags. Those flags can unlock later responses or encounters.

Dialogue and outcomes are not generated by a language model during play. The story is a finite set of authored branches whose availability changes with the voyage. The galaxy remains available for exploration after the campaign.

## Playing

### Ship mode

Pilot Cinder through a local system, fire at hostile ships, mine nearby asteroids, investigate signals, collect salvage, and hail passing traffic. Forward thrust, sideways jets, and rotation are independent. Strafing does not turn the hull; turning does not immediately change its direction of travel. Angular momentum continues after the turn control is released, with damping determined by the hull and flight-assist setting.

The mining beam selects a nearby rock in range. Shields recharge after a period without damage. Larger ships carry more and withstand more punishment, but take longer to accelerate, brake, and turn.

Approach a station, planet, or moon until the context button offers docking or landing. Use that prompt to enter person mode. Some derelict signals also offer boarding. You can enter your ship's crew deck from the ship controls and return through its helm. Your hull keeps its saved position, facing, and momentum across the transition; in a shared galaxy, another permitted helmsman can continue flying while you walk aboard.

Fold travel is selected on the starmap and requires a drive with sufficient range and enough fuel. Local flight does not consume jump fuel. Ports provide repairs, refueling, trading, and emergency assistance; ship destruction uses a recovery penalty rather than deleting the voyage.

### Person mode

Walk through stations, settlements, your cabin, and boardable derelicts. Approach an NPC or workstation and use **Talk / Use**. Available activities include conversations, contract collection, carrying a crate to a loading pad, collecting field samples, and calibrating maintenance relays with a small conductor puzzle.

Contract payment is collected at the stated destination's job board after the requirements are met. A maintenance contract requires three distinct repairs. Return to a landing shuttle, airlock, or helm to resume ship mode.

Every ship class has a walkable interior with a helm, engineering, medical, navigation, security, and bunks. Engineering spends reactor charge to repair the hull; medical spends charge to treat injured captains and living crew. In shared play, station permissions let one person fly while others operate weapons, sensors, and support systems.

### Boarding and crew survival

Damaged enemies can become disabled. Stop firing if you want to take them intact, approach until **Board** appears, and enter their deck. Move with WASD, aim with the mouse or arrows, and left-click or hold Space to fire. A visible target bracket shows aim assist when no manual direction is held. Your NPC crew can fight alongside you. An assault can be abandoned by returning to its entry point.

Pirates can also grapple your ship when your shields are weak. A warning precedes the boarding attempt; create distance or recover shields to break it. If they reach the deck, the encounter becomes a live fight. Crew and hostiles move through the same doors and corridors you use, and walls block their shots.

**NPC crew deaths are permanent for that voyage.** Casualties come from damage during the fight, are recorded in the memorial, and remove that specialist's contribution. Treatment helps living crew; it does not resurrect the dead. Recruit a replacement at an inhabited port when a berth is available. Ship defeat and captain recovery apply penalties rather than deleting the campaign.

### A useful opening route

1. Dock at Kettle Station and meet Iona at the shipyard.
2. Take a maintenance shift from the contract exchange. Repair the three marked relays and return for payment.
3. Launch, mine six ore, and investigate the old evacuation beacon. The journal and local map can track objectives.
4. Earn and fit Vector thrusters and an Echo scanner, then buy Fold Drive I. Its calibration also requires the local beacon chapter.
5. Follow the next campaign destination or take more local work before leaving.

The first two prerequisite upgrades and the drive cost **500 credits and 12 ore combined**: 85/2 for the thrusters, 95/2 for the scanner, and 320/8 for the drive. Fold-drive ranges are 5, 9, and 15 light-years. Optional equipment improves cargo capacity, hull, shields, weapons, mining, fuel capacity, and handling.

The campaign requires actions and decisions, not just arrival at a destination. Later objectives remain in the journal without revealing their outcomes here.

### Building a fleet

Commission hulls from an inhabited port's shipyard after earning their preceding class, equipment, and campaign milestone. Equipment upgrades carry forward. Owned hulls remain available to activate at a port, subject to cargo and crew capacity; changing hulls is not a free repair.

| Hull | Total berths | Commission cost | Progression requirement | Character |
| --- | ---: | --- | --- | --- |
| **Sparrow** utility cutter | 4 | Starting ship | None | Compact deck, quick acceleration and turning |
| **Wayfarer** long-haul freighter | 6 | 1,150 credits + 20 ore | Sparrow, Fold I, first-fold chapter | Cargo spine, larger hold, heavier handling |
| **Peregrine** expedition frigate | 8 | 2,900 credits + 38 ore | Wayfarer, Fold II, archive chapter | Protected operations deck and stronger defenses |
| **Horizon** expedition carrier | 10 | 6,400 credits + 60 ore | Peregrine, Fold III, alliance chapter | Separate wings, greatest capacity, slowest angular response |

Berths count **everyone aboard, including the captain**. The starter ship can carry its captain and three NPCs; a Horizon can carry ten human players if no NPCs occupy those places. Engineers, navigators, medics, gunners, security officers, scientists, and quartermasters offer different ship benefits and boarding support. The crew manifest shows health, vacancies, and the memorial. Dismiss living specialists at a port to free space for other crew.

## Controls

### Keyboard

| Input | Action |
| --- | --- |
| **W** or **↑** | Apply forward thrust in ship mode |
| **S** or **↓** | Decelerate the ship; this does not apply reverse thrust |
| **A / D** | Strafe left / right relative to the ship's facing |
| **← / →** | Apply rotational acceleration left / right |
| **WASD**, on foot | Walk; outside combat, arrow keys also walk |
| **Mouse / arrow keys**, during boarding | Aim independently of movement |
| **Left-click**, during boarding | Fire the sidearm toward your aim |
| **E** | Context action: dock, land, talk, use, collect, or investigate |
| **Space** | Hold to fire; during boarding, shoot on foot; otherwise interact on foot |
| **R** | Hold to mine in ship mode; open the mission log on foot |
| **Shift** | Boost in ship mode; run on foot |
| **X** | Brake the ship |
| **F** | Scan a nearby signal |
| **M** | Open the map; on foot it starts with the local view |
| **J** | Open the journal |
| **I** | Open ship and cargo information |
| **C** | Enter Cinder's cabin while in ship mode |
| **Esc** or **P** | Open settings or close a menu; pauses solo play only |

The turn keys build angular velocity rather than snapping the ship toward a direction. Release them early as the nose approaches your heading. **X** applies a strong brake to translation and rotation. Flight assist provides additional damping; disabling it allows longer coasting.

On the galaxy map, drag to pan, select a star to inspect it, and use the wheel or **+ / −** buttons to zoom. Search accepts system names. Selecting a destination does not jump immediately: use **Engage fold drive** when the range and fuel checks permit it.

### Touch

The two sticks and held buttons own their touches independently:

- **Left stick — STEER:** point toward the direction you want to fly. The bow turns with angular inertia, and thrust builds as it lines up. Release to coast.
- **Right stick — STRAFE:** slide left/right relative to the ship's bow. Vertical movement has no effect and never fires.
- **FIRE:** hold the separate button above STRAFE to fire ship pulses.
- **BRAKE:** hold to slow the ship; larger hulls take longer.
- **Tools:** open the tray to hold MINE or BOOST.
- **Person mode:** WALK moves your captain. In combat the other stick becomes a full two-axis AIM / FIRE control; the separate FIRE button uses the marked assisted target when no manual aim is held. RUN is available beside the walking controls. The world action button talks, uses a workstation, or returns through an airlock.

The header's **Menu** opens the map, log, ship, contacts, action help, and settings. **CREW** stays visible for shared-galaxy access. The compact status strip opens full ship details. Settings can enlarge controls and swap their physical positions without reversing their axes. Menus, focus loss, orientation changes, and pointer cancellation release the relevant input; a harmless viewport resize does not interrupt another held control.

## Shared galaxies

### Joining and returning

1. From the title, choose **Create a shared galaxy** and enter a captain and galaxy name. Use **Join with a galaxy code** to enter an existing one. The **CREW** panel offers the same paths during a solo voyage.
2. Share the **galaxy code** from CREW with friends. Each new join creates a distinct captain with their own progression and starting ship. The galaxy allows up to ten captains online at once.
3. Use **Return to your galaxy** or your saved captain entry to resume that identity. Players can return at different times; everyone does not need to be online together.
4. Open **CREW → Captain passport → Download captain passport** to back up your identity. On another device, choose **Restore a captain passport** and paste that JSON.

The invitation code and passport have different purposes. **Share the galaxy code; keep the captain passport private.** The passport grants access to the same captain and is stored on the current device for convenient return. A solo save is not an online passport, and importing solo JSON does not upload its resources to a shared galaxy.

### Sharing a vessel

CREW shows captain presence, current systems, and nearby vessels. Meet at the same port or approach a vessel in space, obtain boarding permission, and choose its **Board** action. Your own ship remains where you left it.

The owner uses **Shared ship & stations** to open general boarding or grant individual access. Helm access is assigned separately from general boarding. Visit a console to take its role: the helm flies, the security console offers ship weapons, navigation offers scanners, and engineering and medical provide support. Only one captain holds the helm at a time. Human players and NPC specialists share the hull's berth limit.

Captains can travel independently in their own ships, or stay aboard a crewed vessel as it moves between systems. An owner walking elsewhere does not freeze a ship being flown by an authorized crewmate. At a port, guests can disembark and arrange passage back to their parked vessel.

### Homes and asynchronous progress

**CREW → Home berth & recovery** records a persistent recovery destination:

| Home | Cost and requirements |
| --- | --- |
| Kettle recovery berth | Starting fallback |
| Port room | 50 credits at an inhabited port; the lodging registration does not expire |
| Surface outpost | 180 credits + 12 ore on a planet or moon |
| Ship bunk | Owner fits each additional bunk for 60 credits + 4 ore; an allowed captain visits an unclaimed fitted bunk to register it |

A ship home travels with the vessel. Bunk assignment, boarding permissions, hull survival, and hostile occupation are checked when a captain returns; an unavailable or contested berth falls back to a safe port. Rooms and outposts are persistent location registrations and recovery points. They are not a separate construction or decoration system.

Use **Sign off safely** from CREW to leave. Online menus release your controls but **do not pause the shared galaxy**. Other captains keep moving; a connection loss is not an immediate escape from combat. The server has a short disconnect grace period, then handles recovery and any applicable penalty. Empty systems retain their recorded state without running unattended combat.

The authority validates movement, proximity, resources, station ownership, contracts, and one-time rewards. Shared mining, salvage, hostiles, vessel state, homes, and individual progress are saved on the server. The browser predicts movement for responsiveness and reconciles to server snapshots. See [docs/multiplayer.md](docs/multiplayer.md) for the protocol, persistence setup, recovery rules, and deployment details.

## Solo saves and restoration

Solo play uses **one local save slot per browser origin**. Progress is stored in `localStorage`, with automatic saves roughly every 12 seconds of active play, after many actions and menu transitions, and when the page is hidden or left. Solo menus pause the simulation.

Use **Continue solo voyage** to restore the current local save. Starting a fresh solo voyage replaces that slot after a confirmation. Different domains or ports have separate browser storage. Shared captains use server saves and passports instead; connecting to a shared galaxy keeps the solo voyage separate.

To move a voyage between devices or keep a backup:

1. Open **Pause → Export / import save → Download save**. This downloads `farwake-voyage.json`.
2. On the destination browser, begin or continue a voyage and open the same save panel.
3. Open the exported JSON as text, paste its contents into the import box, and choose **Check and import save**. Import replaces the current local voyage.

The save includes the galaxy seed, pseudorandom state, hull class and fleet, ship position and angular momentum, crew health and memorials, active boarding, resources, contracts, decisions, campaign progress, discoveries, and recorded changes to visited systems. Restoration rebuilds the seeded galaxy and reapplies its saved changes. A seed by itself reproduces the base world; the full save is needed to restore the player's history.

Settings are stored separately and are not included in the voyage export. The current engine save format is **version 4**. Earlier saves acquire starter-class and angular-motion defaults without discarding their existing crew or progress. The solo browser storage keys retain their existing names:

- Voyage: `dfe.farwake.save.v1`
- Preferences: `dfe.farwake.settings.v1`

Saved multiplayer passports use `farwake.multiplayer.passport.v1`. Their backups restore access to server state, rather than containing the whole shared world.

The HUD reports **Save unavailable** if browser storage cannot be written. The export action is available from the save panel independently of that local-storage write.

## Settings and audio

Settings provide guidance selection (**Simple**, **Moderate**, or **Expert**), touch-control size from 80–120%, **text size from 100–160%**, flight assist, swapped thumb controls, sound effects, ambient music, and reduced motion.

The world art retains its pixel presentation. Menus and HUD use normal browser text, and world labels are drawn on a separate display-resolution canvas so enlarging the text does not enlarge blurry art-layer letters. The text setting also applies to navigation labels.

Flight assist damps linear and angular drift when input is released; disabling it allows more coasting. Larger hulls still need more time to change course. Expert guidance hides the detailed objective hint and route markers. Reduced motion starts from the browser's preference and can be changed in the game.

Audio is synthesized locally with Web Audio. It starts after a browser-accepted user gesture. The ambient score has its own switch, but the current sound-enable setting also acts as the audio master: sound must be enabled for the score to play.

## Running locally

`dist/` contains the editable browser source; `server/` contains the multiplayer authority. There is no bundler or asset build step. Use **Node 22 or newer** for the server and automated suite.

### Full game with local multiplayer

From the project directory:

```sh
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). This serves both the game and its WebSocket endpoint. Development saves use atomic, versioned JSON files in `.farwake-data/` by default; `FARWAKE_DATA_DIR` selects another directory. Separate browser profiles can join the same local galaxy to exercise distinct captains.

Production requires the configured durable persistence gateway. Startup refuses `NODE_ENV=production` without `FARWAKE_STORAGE_URL` and `FARWAKE_STORAGE_KEY`; do not rely on an ephemeral deployment filesystem for shared progress. Keep storage credentials server-side. The gateway and schema are under [deployment/](deployment/), with setup described in [docs/multiplayer.md](docs/multiplayer.md).

### Solo-only static hosting

To run solo play without the server dependency:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) in a browser with JavaScript enabled. Serve the files over HTTP instead of opening `index.html` through a `file:` URL, so browser module loading works consistently.

For solo-only static hosting, publish the **contents of `dist/`** with `index.html` at the site root. Keep relative module paths intact and serve `.mjs` files with a JavaScript MIME type. Shared-galaxy actions require the HTTP/WebSocket authority and durable storage described above.

## Source map

| File | Responsibility |
| --- | --- |
| [dist/index.html](dist/index.html) | Page structure, HUD, controls, title screen, and modal container |
| [dist/style.css](dist/style.css) | Responsive layout, scalable text, dual touch controls, safe-area spacing, and reduced-motion styles |
| [dist/app.mjs](dist/app.mjs) | Browser entry point, game loop, modes, menus, online action routing, crisp label overlay, and save orchestration |
| [dist/engine.mjs](dist/engine.mjs) | DOM-free rules: seeded galaxy, combat, mining, contracts, fleet, boarding, campaign gates, and save restoration |
| [dist/fleet.mjs](dist/fleet.mjs) | Hull and crew definitions; pure body-relative flight integration used by server and browser prediction |
| [dist/interior-layouts.mjs](dist/interior-layouts.mjs) | Shared walkable geometry, stations, bunks, and combat spawn points for all four hull classes |
| [dist/content.mjs](dist/content.mjs) | Original factions, authored hubs, NPC dialogue, lore, encounters, chapters, and equipment definitions |
| [dist/surface.mjs](dist/surface.mjs) | Seeded walkable maps, collision, interaction entities, location-specific residents, and surface drawing |
| [dist/space-art.mjs](dist/space-art.mjs) | Procedural planets, ships, stations, rocks, effects, camera, and radar drawing |
| [dist/input.mjs](dist/input.mjs) | Separate walking and flight axes, independent dual-stick ownership, held fire, and input cancellation |
| [dist/network.mjs](dist/network.mjs) | Passports, WebSocket transport, sequenced input, prediction/reconciliation, and remote interpolation |
| [dist/ui.mjs](dist/ui.mjs) | Dialog focus handling, reusable UI utilities, settings, storage, toasts, and procedural portraits |
| [dist/audio.mjs](dist/audio.mjs) | Synthesized effects and ambient score |
| [dist/shared/pgi-controls.mjs](dist/shared/pgi-controls.mjs) | Shared DailyFlyer/DFE joystick and game-surface input helpers |
| [dist/shared/device-audio.mjs](dist/shared/device-audio.mjs) | Shared DailyFlyer/DFE gesture activation and device-audio routing helpers |
| [server/index.mjs](server/index.mjs) | Static HTTP service, realm entry, WebSocket sessions, simulation clock, and health endpoint |
| [server/realm.mjs](server/realm.mjs) | Authoritative rooms, captains, vessels, command validation, station permissions, homes, and recovery |
| [server/protocol.mjs](server/protocol.mjs) | Protocol limits, input validation, passport secrets, and rate limits |
| [server/persistence.mjs](server/persistence.mjs) | Versioned development files and durable production gateway adapter |
| [deployment/](deployment/) | Persistence gateway implementation and database schema |
| [docs/multiplayer.md](docs/multiplayer.md) | Shared-world architecture, protocol, operational setup, and persistence behavior |
| [tests/](tests/) | Engine, physics, input, surface, multiplayer, and persistence regressions |

The engine exposes action methods such as `dock`, `travel`, `scan`, `buyUpgrade`, `buyShip`, `boardEnemy`, `attackBoarder`, `triggerEncounter`, and `applyChoice`. Actions return structured results, while `drainEvents()` supplies notifications to the browser layer. `save()` returns a plain save object, `serialize()` returns JSON, and `Game.fromSave()` restores it. Shared play separates `stepPilot()` for each vessel from a single `stepWorld()` per active system, so adding captains does not multiply NPC or projectile updates.

When changing narrative content, keep IDs and flags stable where existing saves refer to them. Resource costs belong in both choice conditions and negative effects. Story interactions use authored encounters; keep their flags aligned with chapter conditions and engine gates. Re-run progression tests after changing prerequisites, rewards, or destinations.

## Tests and release checks

Run the automated suite from the project directory:

```sh
npm test
```

`npm test` runs the full browser-rule and server suite. `npm run check` performs syntax checks on the main browser, engine, surface, network, and server modules. `npm run test:network` runs the network-focused server tests.

Meaningful cases include galaxy determinism and connectivity, all eight earned campaign stages, economic and reward guards, abandoned/reaccepted contracts, independent translation and rotation, matching flight behavior across frame rates, saved angular momentum, fleet prerequisites and capacity, real boarding damage and permanent casualties, interior restoration, dual-stick ownership, surface reachability and collision, shared-world updates once per system, concurrent mining and kill credit, authoritative actions, reconnects, and persistence restoration.

For a release, also exercise the browser: start and restore a solo voyage; dock, work, and launch; make an encounter choice; export/import a save and a passport; join the same galaxy in separate sessions; share a vessel and take different stations; enter and leave an actual boarding fight; reconnect from a home berth; and resize the interface at 160% text. Check simultaneous two-thumb flight/fire, audio activation, and touch cancellation on the intended physical devices. Automated rules and emulated phone viewports do not establish physical-device compatibility on their own.

## Art and shared-code provenance

Farwake's pixel-style planets, ships, stations, characters, terrain, rooms, and portraits are original drawings produced by the code in this project. The application does not load an external sprite pack or recorded music library. Its effects and ambient notes are generated with Web Audio.

The two files under `dist/shared/` are reused DailyFlyer/DFE helpers. Farwake-specific input and sound behavior lives in `input.mjs` and `audio.mjs`; the shared helpers retain the existing project's multi-touch and device-audio handling.
