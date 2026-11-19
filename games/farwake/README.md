# FARWAKE — The Quiet Earth

**Version 0.34.0 · DailyFlyer · Solo voyages and persistent shared galaxies for up to 10 online captains**

[Play Farwake](https://dfe-farwake.onrender.com/) · [Multiplayer service and direct game](https://dfe-farwake-universe.onrender.com/)

## 0.34.1 — Armed exploration and corridor presence

The personal weapon stays available throughout on-foot exploration, including quiet or cleared sites and peaceful decks and ports. Mouse/arrows and the right thumb stick aim; click, Space, or FIRE shoots in the chosen direction. Shots outside active encounters are harmless to residents, hit the actual walls, and use the normal recharge. Ship gun stations retain their existing controls.

Relay Nine now carries its quieter moments through moving equipment, local steam, deeper wall shadows, restrained pools of light, and persistent changes in the room. Footsteps and gunfire have short room reflections. Sparse sound effects leave real silence between them and share the existing mute/background cleanup. The supplied Morrow Flightline track remains in the score; firing into an empty hall does not announce combat through the music.

Once an actual threat is present, a confirmed hit briefly interrupts its pursuit. Running remains useful and escape never requires clearing the room. Hidden future interaction text and map markers appear only when their prerequisites are met. The existing route, saved records, rewards and exit remain intact. Reduced motion keeps the visible end states without sliding equipment or sweeping lights. World content revision **9** keeps the client and shared authority aligned.

## 0.34.0 — Quiet Earth: The Silent Mile

The first guided corridor mission is playable at **Hearth → Morrow → Relay Nine**. Open **Captain’s menu → Quiet Earth** to mark the route; the Galaxy map and notebook’s Missions page also link to it. No enlistment or previous campaign completion is required.

Relay Nine now contains three long service halls, an abandoned shift room, and a deep receiver. Check in, follow short changing objectives, restore the far breaker, and copy the receiver recording. Two harmless environmental scares interrupt the quiet buildup. Copying the recording triggers an ambush and a clear return objective. Follow the green return lights and seal the intake door; killing the pursuing creatures is optional. The 380-tile outward route uses real collision and shared encounter state. Morrow Flightline supplies the corridor cue, with ordinary danger scoring after the revealed trap.

The receiver action returns control immediately, and the shared ambush alert closes a teammate’s open menu so everyone can move. Progress, the one-time completion reward, and cue receipts persist in solo and shared saves. Captains already inside the old Relay Nine resume once at the new intake; previously recovered signal-buffer supplies remain claimed. Other Morrow geography and sites, Kettle, and Tinbell are preserved.

This release delivers the new campaign opening. Later chapters and the final Earth revelation are not included; the existing Long Silence campaign remains available.

## 0.33.1 — Morrow Flightline corridor and danger music

The supplied guitar-free **Morrow Flightline Loop** now plays in the Floodworks service gallery and its opened entry passage, and joins the regular ground and space danger rotation. The corridor cue follows the player's position without treating the area itself as an attack. It fades when leaving the passage and yields to encountered danger. Settings → Music & listening also makes the recording available on demand.

The 2:22 cue streams as AAC using the existing volume, mute, browser activation, and interruption handling. The recorded menu theme and Crosswind's dedicated battle rotation retain their existing roles. This release scores the existing Floodworks corridor; it does not add new Earth-campaign rooms.

## 0.33.0 — Plain guidance and consistent allegiance

Simple guidance on phones now keeps a short instruction visible even when Compact tips is enabled. A persistent **Your side** button identifies the captain’s faction, Army/Navy branch and rank, with named enemies in Crosswind. It opens the relevant briefing and current choices. Shared crew see their personal service separately from the occupied ship’s allegiance and attack record. Friendly and neutral fleet contacts no longer suppress useful guidance as if they were incoming enemies.

The service panel explains available and locked rank permissions, remaining promotion progress, and the difference between recruiter assignments and Crosswind’s ongoing war. The war briefing puts Vey, Orsa and the route back to Hearth before optional detail. “Who is on my side?” is searchable in the field guide. Reading or changing guidance does not change rank, allegiance, mission progress, or game difficulty.

Ordinary ship fire now protects unprovoked allied military hulls, matching ground weapon behavior. Allied infantry bullets no longer hit their own affiliated captains; marked explosions and neutral crossfire remain dangerous. Army/Navy membership does not authorize assault boarding a friendly military hull. Existing saves with their own side recorded as hostile can explicitly request a ceasefire at **Orsa’s outdoor landing**, preserving rank, missions and opposing hostility. The shared server applies this only to the requester and their eligible docked hulls.

The recorded **Farwake menu theme** has a visible title-screen and listening-panel credit: “Original music contributed by a friend of Farwake.” The contributor’s preferred name has not been supplied. Update `MENU_THEME.artist` and `MENU_THEME.credit` once confirmed; the title is not an artist attribution. Audio playback and the recording are unchanged.

Validation focuses on mobile Simple presentation, twelve-mission Army continuity, personal versus shared-ship allegiance, friendly fire, explicit ceasefire repair, boarding authority, and music credits. The existing deployment test gates still run on Render.

## 0.32.1 — Recorded menu theme

The title screen now plays **Farwake menu theme**, the supplied 3:18 recording, and loops it until the voyage begins. It fades into the voyage score when entering solo or shared play and returns when going back to the title. Listen / Stop, saved music volume, mute, hidden-tab suspension, and death silence use the existing audio lifecycle. The recording streams from the game’s own assets; it is not decoded into a full-song Web Audio buffer. Its AAC audio is unchanged, with container metadata moved forward for streaming.

Settings → Music & listening includes the recording and the original synthesized **The Long Way Home**. Requesting the new theme during a voyage plays it once, subject to the existing danger and Crosswind priorities.

## 0.32.0 — The people who came back

Medical recovery now keeps a personal incident record: the known cause, boarding outcome, incident vessel, actual losses, named crew outcomes, treatment destination, and military return orders. The report opens after the captain finishes waking. Its next action appears before the crew list and remains available on the recovery HUD. An enlisted casualty at Vey can see the pickup, destination, and **0 CR** fare, then board the existing physical evacuation service directly when nearby.

Personal ship loss preserves living crew and their wounds in an evacuation manifest. Confirmed deaths remain casualties. The **Crew → Your crew & their whereabouts** view separates a captain's personal crew, a Navy vessel's company, survivors awaiting reunion, and memorial records. Crew left aboard a berthed personal ship during Navy duty retain that actual location; they are not reported as participants in a service-ship casualty.

Recovered personal crew appear as named people beside the correct clinic or field hospital. A return transport takes the actual survivors waiting at its pickup and selects a hull with real berths for its passengers. Eight survivors travel with the captain and a pilot aboard an Osprey; the largest transport carries fourteen survivors, with any additional people explicitly recorded as waiting at the pickup. Their identities and injuries survive a save or shared-world restart during passage. After physical arrival and disembarkation, survivors wait beside the destination clinic. They can rejoin an owned ship at that port when there is a real berth for each person. Casual reserves remain compact, and human occupants keep priority over NPC stations and berths.

Returning to the home posting produces a debrief with the known crew outcomes and a durable acknowledgment. Treating medics, recovered crewmates, the captain's own service desk, and familiar people at home react to the recorded incident. Strangers and distant ports do not acquire private casualty knowledge. Survival does not award another mission payment or promotion: existing assignment results, injuries, destroyed property, and confirmed casualties remain the basis for consequences.

Hostile boarding briefings show the actual allied NPC party, the origin ship's hull condition, its continued exposure to outside fire, and the route back through the entry airlock. A captain who falls before the allies secure the target receives a report that preserves both events.

The latest twelve recovery reports remain available in the voyage log. Existing saves retain their progress and receive a limited report from any older recovery receipt. Facts the old save never retained—such as a cleared crew manifest or the exact attacking source—are explicitly left unknown. The update does not invent replacement survivors or reset the voyage.

World content revision **7** keeps the published client and shared authority aligned. Validation covers the eight-person Navy/evacuation/Morrow journey, physical shuttle capacity, wounded and dead passengers, boarding outcomes, save/restart persistence, personal versus service ownership, human station priority, dialogue knowledge boundaries, and reachable survivor placement.

## 0.31.1 — Solo Casual ships that fit the crew

Solo Casual now chooses from working hulls with room for the captain and the requested NPC crew. Selecting eight NPCs defaults to **Osprey** and also offers Atlas, Cairn, Horizon and Leviathan. All eight are physically aboard these hulls. Setup updates the ship list as the count changes and shows the exact **aboard / reserve** split on the selected ship, each card and the final review. Larger ship previews fit their full silhouettes on desktop and mobile.

The largest available working hull, Leviathan, carries the captain and fifteen NPCs. Larger requested rosters keep their excess in reserve. A shared departure still uses its actual connected-captain requirements; the authority supplies the shared context itself.

The Crew menu shows the hull's berths and actual roster split, with **Walk aboard** available from the helm. NPCs are visible throughout the ship interior; they do not appear as people in the exterior flight view or accompany the captain ashore.

An affected existing Solo Casual voyage can use **Crew → Choose a ship for this crew** at an inhabited port. This free, one-time adjustment applies while its original compact starter remains its only owned hull and it has no hull-change history. The captain explicitly chooses the replacement. Credits, cargo, voyage progress, crew identities and injuries are preserved; hull condition is carried across. The offer accounts for released crew, hired specialists and passengers before showing how many NPCs will be aboard.

World content revision 6 keeps published clients and the shared authority on the same release.

## 0.31.0 — Fifty kinds of expedition

The repeated frontier cave, empty hut, and repair relay now give way to **49 authored encounter types**, alongside the preserved Hearth cavern family for **50 types in total**. They occupy existing planets and moons: no chart coordinates, shared galaxy codes, or ship ownership are reset. Curated destinations put every new type somewhere on the normal chart; other worlds draw a stable, biome-appropriate selection from the same catalog. Existing authored quest sites, Hearth, Glimmer, preflight cultures, and Crosswind retain their established content.

These encounters use sixteen distinct physical layouts: bridge approaches, trenches, crash fields, tidal islands, quarries, fungal groves, courtyards, archive yards, power works, clinic camps, nests, ice fissures, antenna arrays, flooded ruins, observatories, and convoy roads. Outdoor trails lead into open terrain rather than another enclosed cave. Roads, water, cover, and sightlines are shared by drawing and combat.

Tasks include comparing witness records, safe equipment sequences, treatment and evacuation decisions, custody disputes, ecological interventions, and local skirmishes. Evidence and prior work gate later actions. Outcomes, collected rewards, wounded or dead combatants, and resolved choices persist in solo saves and shared galaxies. The same final decision or cache cannot pay two captains. Existing captains saved inside an old generic site can still finish and leave it.

Eight new creature or machine silhouettes use fast melee, ranged spit, armored sentinel, pack movement, and armed-combatant behavior. Local faction fighters can attack one another while leaving neutral visitors alone. Assisted aim respects neutrality; a deliberate shot can turn the struck faction's local troops against that captain. Peaceful residents remain people to talk to, not automatic targets.

The chart's **On the surface** section previews local leads. Site briefings, the field objective, and **Mark next step** on the local chart identify the relevant physical evidence or control. Named residents discuss their own situation and the recorded outcome. Occasional recruitment-film satire, notices, and off-duty exchanges add camp without replacing urgent dialogue or Hearth's authored voices.

The original frontier entrance coordinates remain the same, keeping settlement services and paid homes in place. Content revision 5 asks older clients to refresh before rejoining the shared authority. See [the expedition catalog](docs/frontier-expeditions.md) for the full list and implementation notes.

## 0.30.0 — A ship for two, a crew that makes room

Three new shared-departure hulls unlock with two connected captains. Each has its own exterior, walkable deck, reachable working stations, and equipment that changes the simulation. They are also available through ordinary shipyards.

| Ship | Two-person work | Strengths and limits | Berths |
| --- | --- | --- | ---: |
| Swift | Pilot plus navigation/scanning | Fast twin-boom courier; efficient boost and cheaper fold travel, with light armor and a small hold. | 4 |
| Kingfisher | Pilot plus weapons/engineering | Compact escort with paired pulse shots and quicker shield recovery; high weapons draw and limited fuel/cargo. | 4 |
| Lamprey | Pilot plus salvage/medical | Recovery tug with a long-reach tractor, stronger repair/treatment tools, and a large hold; slow handling and a light gun. | 6 |

In **Casual** captain setup, choose the number of starting NPC crew with a numeric field or quick presets. There is no gameplay roster cap. Only a working watch occupies spare berths and contributes ship effects; the rest wait in a compact reserve. A very large requested roster does not create an equally large crowd of simulated people.

Players take priority over the starting NPC watch. Late arrivals reclaim NPC berths, and an NPC specialist stands down when an authorized human takes the corresponding station. NPC coverage returns when the space and role are free, while brief disconnects preserve the human's place. Existing human occupants and station permissions still apply. Wounds, released crew, casualties, personal ships, and the shared hull's roster survive reconnects and saved-world restoration. Reserve replacements do not appear in an active boarding fight.

To start together: create a shared galaxy, choose **Casual**, set the NPC count, keep **Gather a crew before departure** enabled, and start in **Hearth**. Share the galaxy code. With two captains connected, choose Swift, Kingfisher, or Lamprey; the guest readies and the host selects **Board together**. The host's Casual equipment and NPC roster transfer to the departure ship. Other captains retain their own ships and rosters at Kettle. Existing voyages receive no new crew or reset.

## 0.29.1 — Evacuation from Vey

Enlisted survivors recovered at Vey’s field hospitals now receive free evacuation orders. **Leave Vey** appears in the recovery panel and, for stranded captains, the normal ship/person control. Port services and the objective also lead to the evacuation menu. The menu marks the actual hospital pickup point and books the existing NPC passenger shuttle once the captain is awake and nearby. The shuttle flies to the captain’s home posting; disembark through its entry airlock or the passage menu after docking.

Existing Vey casualty saves gain the missing orders on loading without moving the captain, resetting battlefield progress, or altering credits, rank, surviving ship ownership, or remote berths. Medical evacuation remains available to suspended casualties without restoring their duty clearance. Vey stays a battlefield with field hospitals, rather than gaining ordinary commercial port services.

Validation covers both factions, solo and shared casualty recovery, legacy saves, multiple survivors, physical departure and arrival, pickup directions, and visible desktop/touch actions.

## 0.29.0 — Infantry arms and reactor priorities

Freewake and Meridian each issue a distinct service rifle on enlistment, plus a support repeater after two military assignments and a precision rifle after five. Existing enlisted captains receive their basic rifle on loading without replacing an advanced equipped weapon. Service weapons are free, personal, and persistent. Support pulses lose force at range; precision weapons trade cadence for reach and penetration. Weapon silhouettes, tracer colors, and firing sounds reflect the equipped class. Requisition and change equipment at your service desk, outfitter, or the new friendly armory beside Vey’s field hospital.

Reactor power is available through the ship menu or the engineering console. Balanced, thrusters, guns, and shields use only fitted systems. Focusing power improves that system at the expense of the others: flight acceleration, gun cycle rate, and delayed shield regeneration change in the real solo/shared simulation. No setting refills resources or resets existing gun cycles. Routing has a two-second settling time, persists on the physical hull, and requires the actual pilot or a permitted engineer; Navy duty rank still applies. Mobile controls stay in the existing menu.

Fresh impacts produce stronger bounded cabin shudders, a brief edge cue, lighting dips, falling dust, and larger spark showers even when the struck bulkhead is off camera. Shield absorption has its own blue cue and muffled sound. Actual fires and breaches remain tied to real damage. Repeated snapshots do not replay impacts; reduced motion removes the shake, flash, and falling debris.

## 0.28.0 — Lost in Space

Death immediately silences the score and sound effects and covers the game with black and only “Lost in Space.” Once the authority confirms medical recovery, a slow eyelid opening reveals the hospital. Controls, HUD, dialogues, and held firing inputs stay suppressed through the transition. Reduced motion uses a steady fade of the same duration; audio preferences remain unchanged and music resumes through the normal director after waking.

Civilian casualties wake beside a medic at the local clinic or nearest inhabited medical body. Crosswind casualties are evacuated to Union or Combine field hospitals behind Vey’s southern aid wall. Explicit affiliation wins; unaffiliated characters use relative reputation, with a random rescue team when both sides are equal (including zero/zero). The faction is chosen once per rescue and survives reconnects. Both posts have beds, equipment, duty medics, and working treatment services without turning Vey into a trading port.

A saved recovery receipt keeps solo and shared transitions consistent even when destruction and recovery occur between frames. Survivors are protected while waking. Existing loss of a destroyed hull, surviving property, military service, battlefield state, and discoveries persist. Existing captivity outside Crosswind takes place in a guarded hospital ward, with its established release and repatriation rules. Reconnecting cannot teleport a recovered patient home or charge the recovery fee twice.

Validation: casualty destination and faction policy, protected medical placement, persistence, solo/shared ship loss and ground/interior/boarding casualties, immediate audio cutoff and preference restoration, transition timing, repeated snapshots, reduced motion, and mobile portrait/landscape browser checks.

## 0.27.1 — Mobile gun stations

The left thumbstick now aims the selected gun without firing. Hold the separate FIRE control on the right to shoot. Fore, Port, Stbd (starboard), and Aft remain one tap away in a 54-pixel-high row above AIM, with readiness markers and the selected mount highlighted. The left-handed setting mirrors both controls and the battery row. Single-battery hulls do not show a redundant selector.

A compact status strip shows readiness, the selected battery, and off-arc guidance; its help button explains the controls. Back to deck remains at the top left. Repeated battery-selection toasts no longer cover the mobile battle. Keyboard/mouse controls and ship/infantry movement retain their existing mappings.

Validation: input separation and pointer-release tests, existing local/shared gunnery tests, field-guide tests, and browser checks at 428-pixel portrait, 780-pixel landscape, 320-pixel small-phone width, maximum text size, mirrored controls, and desktop.

## 0.27.0 — The battle is outside

**Landing on Vey now places you directly on Ashfall's outdoor battlefield.** The covered landing sits beside the fighting, with the clinic to the west and shelter to the east. There is no separate battle entrance. The map marks connected streets, relief work and the landing shuttle; boarding or departing requires returning to that physical landing. Earlier Ashfall saves migrate outdoors and retain relief decisions, encounter progress and valid positions.

Each six-person squad now has a **leader, rifle trooper, support gunner, marksman, grenadier and medic**. Their weapons have different ranges, bursts, accuracy, windups and recharge times. Fireteams alternate movement and covering fire, seek flanking routes, relocate after bursts, fall back under pressure and avoid warned blast zones. Medics move to wounded squadmates. Mortars and lobbed grenades leave layered flashes, shock rings, fragments, dust and craters. Nearby blast warnings share one readable notice; distant grenades do not flood the HUD.

| Faction | Carrier fighter | Capital fleet |
| --- | --- | --- |
| **Freewake Union** | **Needle**, a compact interceptor between two armored panels | **Horizon** carrier and wedge-shaped **Judicator** line destroyer |
| **Meridian Combine** | **Kite**, a four-foil strike fighter | **Ark**, an asymmetric fleet carrier, and **Confluence**, a broad lobed cruiser |

Capital ships launch their faction's fighters from physical hangar mouths. Fighters make attack passes, break away, return to a carrier to rearm, and launch again. Sorties and replacement waves share bounded populations. Capitals and heavy escorts turn to present port or starboard cannon batteries, whose individual mounts fire within actual arcs. Gun stations aboard owned or captured capitals use the same broadside geometry. The four new hulls have authored interiors, normal ship stats and equipment profiles. Find them with their faction’s Crosswind fleet; Needle and Kite are also available in isolated ship-combat practice. The single-seat fighters retain the ordinary restriction against boarding parties.

Fleet explosions now scale with the lost hull: a short core flash, expanding shock front, asymmetric fragments, drifting smoke and fading embers. Muzzle flashes come from the firing battery. Reduced-motion presentation keeps useful impact aftermath without the fast flare and debris motion.

This release retains the **three Crosswind battle tracks** described below. Hearth's authored geography and existing surface layouts remain preserved. See [the updated battle notes](docs/crosswind-warzone.md) for mechanics, persistence and bounds.

## 0.26.1 — A score for the warzone

Crosswind now immediately replaces peaceful travel music with a dedicated rotation of **three original heavy battle pieces**. The rotation continues through fleet lulls, crew decks and planetary visits while your captain remains in the system. Each shuffled set plays all three pieces before refilling, with no immediate repeat. Leaving Crosswind returns to the voyage's ordinary music rules.

| Piece | Character | Length |
| --- | --- | ---: |
| **Kill Corridor** | Fast thrash, clipped low riffs and double-kick passages · 178 BPM | 2:09 |
| **Iron Teeth** | Heavy syncopated groove, tom accents and a half-time middle · 142 BPM | 2:15 |
| **Ashes in Orbit** | Melodic metalcore, harmonized guitar responses and a full-band return · 166 BPM | 2:19 |

All three begin with the band in motion. Eight new synthesized guitar, bass and drum voices give the parts a heavier attack and a short, dry room sound. Their melodies, riffs and arrangements are original. The previous 43 compositions and their instrument sounds are unchanged; the catalog now contains **46 pieces**.

Find the new category under **Settings → Music & listening → Crosswind warzone**. You can request any of its three tracks while there; a peaceful audition waits until you leave the system. Music enable, volume, hidden-tab suspension and conversation ducking still apply. The change follows your actual location without marking a neutral captain as personally under attack. See [music direction](docs/music-direction.md).

## 0.26.0 — Crosswind and the lives afterward

**Crosswind** is one Fold I jump from Hearth. The two closest authored territorial factions, **Freewake and Meridian**, are fighting around its three planets. Arrival puts you on an outer approach and a medium military picket hails you: leave the main battle lanes, remain unaligned, or commit to a side. Existing service with either faction takes precedence and immediately assigns a relief-approach sortie. The briefing is available through the objective arrow, flight menu, Settings, and chart.

The initial engagement has **56 military ships, 28 per faction**: screens, medium escorts, frigates, heavy hulls, carriers and Judicators. Green split markings and amber bars distinguish the two fleets. Ships fight one another across three lanes, maneuver around planets, take damage and withdraw. Pushes, counterattacks, resupply lulls and randomized replacement waves keep the battle changing. A fleet wipe does not end it. Larger player hulls attract more deliberate attackers, with targeting budgets that keep the other fleet as the main enemy. Unaligned ships can still be struck by crossfire. Enemy boarding is a rare, conditional opportunity with a visible grapple warning and a chance to escape.

| Destination | What is there | What your captain can leave behind |
| --- | --- | --- |
| **Vey · Ashfall Front** | Three infantry lanes, cover, ruined homes, warned artillery and 18 soldiers per army in coordinated squads. A sheltered southern passage links the clinic and apartment shelter. | Restore theatre or triage power; physically escort **Siv, Oren and Mara** to the clinic; recover missing-person records and choose public memorials or private family notices. |
| **Orsa · Thawline Refuge Reception** | A quiet reception ward, staff, an arrivals board and the nearby **Third Light** relief station. | The tenants your captain rescued reappear here, with named follow-up. A later fuel allocation changes the refuge's heating and conversations. |
| **Lorn · Cistern Nine Dispatch** | A civilian power-cell shipment with two competing requests. | Heat Orsa's sleeping hall, or restart a cooperative hauler and earn 90 cr. The unmet need remains in the local record. |

Military service and voluntary support determine personal relations. Deliberate attacks and boarding also mark the actual attacking hull as hostile; changing pilots does not erase that evidence. The opening sortie needs **45 accumulated seconds near Vey and 180 confirmed opposing hull damage**, paying **220 cr once**. Crew contributions follow the real firing captain and physically present commander, including borrowed and boarded ships.

The battle has bounded ship, projectile and infantry populations. Saved encounters continue on return, with up to **90 seconds of NPC-only catch-up**. Captains, escorts and rewards do not advance while absent. This is a persistent local battle; its fleets do not simulate an unlimited off-screen interstellar war.

### Return to the people in Hearth

Each of the three early campaigns now has an optional follow-up at its original contact. The follow-ups remember the first decision, require new physical work, and change the records and conversations you can revisit.

| Follow-up | The problem after the original success | Lasting agreement after completion |
| --- | --- | --- |
| **The Next Shift** · Mara Reed | A repaired clinic needs a handover the next attendant can actually use. Test the alarm, fund a rota or supply a spare, and verify the case. | **35% total Morrow infirmary discount** or **22% total Morrow hull-repair discount**; the other original agreement remains. |
| **The People in the Margin** · Len Vale | The new timetable still excludes someone. Investigate their rejected booking and carry the named traveler on a real Kettle–Morrow fare. | An open-seat reserve adds **4 cr** to previously uncovered fare types, or a narrower charter adds **2 cr more** to its original eligible type. Existing accepted quotes stay intact. |
| **A Warning People Can Use** · Ada Finch | The published signal report has a different weakness depending on who received it. Agree on usable evidence, fly another reading and verify it at Northwatch. | Ordinary scans use **5 reactor charge** after final handover. The earlier publication and its consequences remain recorded. |

Relief decisions retain their contact, menu frame and next physical task instead of changing to an unrelated discovery receipt. Shared snapshots expose the visible fight and this captain's own stories, without future reinforcement timers or other captains' private outcomes. **Hearth's authored geography and exact existing surface baselines remain unchanged.**

See [Crosswind's simulation and authority notes](docs/crosswind-warzone.md) and [campaign aftermaths](docs/campaign-aftermaths.md) for the complete mechanics, costs, limits and verification scope.

## 0.25.0 — Steadier menus, stories closer to home

**Stories & campaigns, Missions & contracts, People, Factions, Work & service, Voyage log, and Archive** now share one notebook navigation. Refreshing the same menu keeps its width, scroll position, expanded details, and keyboard focus. Purchases keep the outfitter tabs visible; treatment keeps you with the doctor; story decisions show their result and next step inside the current conversation. A late reply cannot replace a newer menu.

Conversations offer named topics you can choose. An unchanged mission update can become a shorter greeting, with the full reminder still available on request. Local chatter remembers recently heard lines and can leave a quiet interval instead of immediately repeating them. Existing authored dialogue remains part of the game; this pass reduces specific repetition rather than claiming every conversation is unique.

Open **Log → Stories & campaigns** to find three connected campaigns available from the beginning. They use the people and places already in **Hearth**, with no fold drive required.

| Campaign | What you do | What remains afterward |
| --- | --- | --- |
| **Night Shift, No Backup** · 8 steps | Diagnose Morrow’s clinic supply, pay for or supply parts, test the regulator, and verify the medicine case with Mara Reed. | Choose a personal agreement: **25% off infirmary treatment at Morrow** or **15% off hull repairs at Morrow**. |
| **A Fair Departure** · 7 steps | Investigate conflicting departure times, negotiate a timetable, then complete an actual Hearth passenger fare before Len Vale approves the charter. | New eligible Hearth fares include the chosen supplement: **10 cr for patients**, **6 cr for commuters**, or **8 cr for couriers**. |
| **The Signal We Can Trust** · 8 steps | Compare dispatch records, fly to the marked reference point, verify a receiver correction, and decide who receives the report. | Ordinary ship scans use **6 reactor charge instead of 8**. Publication choices also affect trust, faction standing, and the recorded outcome. |

Agreements activate after the campaign is completed and belong to your captain. They do not change another player’s prices or rewrite a fare already accepted. Passenger and flight stages require the appropriate real ship, position, and completed journey; reading the notebook does not satisfy those tasks. Hearth’s custom layout and existing places are retained.

The direction is **deeper use of familiar places, clearer choices, and room for quiet travel**. These are bounded local campaigns, alongside the longer Earth investigation. See [UI and campaign notes](docs/ui-and-campaigns.md) for the interaction contract, implementation, and verification scope.

## 0.24.0 — Music for the voyage

Farwake now has **43 original, locally synthesized pieces**. The written notes, harmony, tempo and form of **The Long Way Home** remain intact, with a richer performance from the updated instrument bank.

Open **Settings → Music & listening** to browse by situation, see each piece's length, and choose something to hear once. **Return to voyage music** resumes the adaptive score. A requested listen waits during real danger; an audition interrupted by danger is queued again. Browsing alone does not start playback.

| New piece | Where it belongs |
| --- | --- |
| Lamps in the Cabin | Quiet time on a ship's crew deck, away from the helm. |
| Under the Service Lights | Floodworks and the field expeditions. |
| The Foreman Cycle | An active Foreman encounter inside its machine bay. |
| Carry the Light | Relief after field rescue and the Foreman's shutdown. |
| After Hours on Glimmer | Nearby nightlife and table venues in Voltage. |
| Rain on the Transit Line | Glimmer's streets. |

Keyboard and string sounds respond more clearly to note strength. Soft felt piano, warm mallets, a breathy reed and a rounded analog lead join the score. Cabins, machinery and close danger use a shorter room sound; travel, caves and the theme keep more space and echo. The new pieces are balanced against the existing calm, social and combat music.

The score follows **your actual location and experience**. A teammate starting the Foreman elsewhere in Floodworks does not turn the workshop into a battle scene. Local repairs, a stopped machine and nearby rescue arrivals can change the music; repeated inspections do not repeatedly announce a discovery. Music remains personal in a shared galaxy.

Music has its own **enable switch, volume and More quiet / Balanced / More music** setting. Quiet intervals leave effects and local ambience audible. Playback uses the game's local synthesizer, with no runtime music service or streamed soundtrack. **Hearth, world layouts, save formats and shared passports are unchanged.** See [music direction and implementation](docs/music-direction.md) for the full score catalog and technical notes.

## 0.23.0 — Floodworks and field careers

**Floodworks 6** is an authored expedition on **Orchard Nine, Brindle**. Its intake workshop, service gallery, pump room, Foreman machine bay, recovery ward and maintenance archive have distinct layouts and connected routes. Find it from **Menu → Field expeditions & work**, **Log → Missions**, or the Floodworks entry on the galaxy chart. The notebook marks the next physical task on the chart or local walking map.

Each captain can collect a reusable **field cutter** and **portable power bridge** from the intake workshop. Cut marked service seams, bridge an isolated pump supply, drain a crossing, open the archive, and unlock a permanent return shortcut. Changes persist in the shared site; personal tool ownership remains with the captain who collected the equipment. Other crews can inspect and verify completed repairs for their own assignments.

The **Foreman** is a machinery boss with a visible amber warning lane, a moving sweep, and a blue recovery window. Its two interlocks must be physically released during recovery. Each interlock stays latched through a retreat, so one captain can solve the encounter across multiple cycles; a crew can cover both controls. The machine stops after both interlocks are latched and the recovery ward opens. An abandoned unfinished attempt resets its live attack cycle while preserving tools, routes, interlocks and rescue progress. In solo play, close an unsafe console panel to let the paused simulation advance to the next recovery window.

**Mara and Ivo** need assessment, stabilization and a walking escort to the intake aid point. Survivors use the actual open corridors, stop if their escort disconnects or becomes incapacitated, and do not teleport to a ship. The receiving team records handover after arrival. A later responder can perform and record follow-up care at the aid point, without receiving credit for another captain's evacuation.

Two smaller sites reuse the field tools in other settings: **West Condenser Annex on Serein, Meridian**, and **Tide Library Annex on Lilt, Vesper**. The condenser has a blocked service route and an isolated supply; the library has a flooded reading room and a third survivor, Lin.

### Engineering and rescue qualifications

The field notebook offers three staged assignments for each career. Accept and debrief at a physical field desk or aid point. Verified work performed before accepting an assignment still counts; another captain's actions do not automatically complete your checklist. Payment is issued once per captain and remains settled after save, reconnect and server restart.

| Career | Assignment | Payment | Qualification |
| --- | --- | ---: | --- |
| Engineering | Make the service passage safe | 145 CR | Field technician |
| Engineering | Restore the Serein condenser annex | 225 CR | Systems technician |
| Engineering | Sign off the Floodworks machinery | 290 CR | Commissioning specialist |
| Rescue | Bring Mara to the aid point | 150 CR | Field responder |
| Rescue | Clear Ivo's way out | 220 CR | Rescue technician |
| Rescue | Relief at the Lilt archive annex | 275 CR | Relief specialist |

### Dipper lander

The **Dipper** is a six-berth field-support hull with its own broad landing frame, aft decontamination entry and separate equipment bay. It costs **2,240 CR and 30 ore**, and becomes available with **Fold Drive I** and the **first-fold story milestone**. Its native equipment repairs 12 hull integrity for 20 charge; medical treatment restores 18 vitality to conscious captains and 12 to living crew or rescued passengers for 15 charge, with a five-second treatment cooldown. Damage-control work is 25% faster. Modest weapons and deliberate handling make it a support choice; its equipment does not provide remote immunity to expedition hazards.

**Hearth is preserved.** Regression snapshots compare the existing system, outdoor tiles and entities, exploration content and interiors against 0.22.0. Starter choices and Hearth traffic selection remain unchanged. Existing voyages and shared passports continue without a reset. This release also retains Voltage and its table games. The shared world-content revision is **3**; refresh all players' clients before reconnecting.

## 0.22.0 — Voltage after hours

**Voltage is one additional authored system.** Existing 900-system charts retain their IDs, coordinates, geography and saved visits. Existing captains can find **Voltage** or **Glimmer** with the starmap search; **Nightlife & tables** in the menu also links directly to its chart. Casual captains may choose Voltage when starting a new voyage. The shared client/server world-content revision is now 2; refresh both clients after the update.

**Glimmer** is a large city planet with a custom, walkable 140-by-104-tile landing region. Dock Nine, Lantern Row, Chrome Ward, the Glass Mile, the Undergrid and Rustline have distinct streets, buildings, signs, services and residents. Wet pavement, rain, traffic props, corporate towers and the Low Orbit gaming room use Farwake’s existing pixel-art renderer. Rain stays outside interiors and respects reduced motion. Crown Exchange handles the city’s orbital arrivals; Kilowatt supplies its power cells and Reservoir its clean water and clinic coolant.

### Three playable games

- **Texas Hold’em:** one heads-up hand with a local NPC, check/call/raise/fold, four betting streets, proper best-five hands, all-ins and split pots. The selected stake is the maximum hand budget; unspent chips return when folding.
- **Eight-ball pool:** aim with a pointer or touch, fine-adjust with arrows, set power and shoot. Balls collide, rebound and fall into six pockets. Includes open-table group assignment, scratches, wrong first contact, ball in hand, turn continuation and legal/early-eight outcomes. Both the captain and the NPC use the same simulation; accepted shots have a skippable replay.
- **Blackjack:** hit, stand and double; dealer stands on all 17s, naturals pay 3:2 and ties push. Twice the wager is reserved to cover a possible double; unused reserve returns. Splitting and insurance are not part of these house rules.

Tables use **10, 20, 50 or 100 Farwake credits**. The buy-in screen states the wager, reserved amount and current purse. The Low Orbit room on Glimmer, Crown Exchange and Kettle have all three games; other civilian station common rooms each offer one of the three games. Walk to a table and interact. Games against NPCs work in solo and shared galaxies. Human-versus-human table matchmaking is not exposed in this release.

Closing the table window keeps an unfinished round. Explicitly leaving folds a poker hand, concedes a pool match, or stands and resolves blackjack. Wagers, positions/cards and payout receipts persist. Shared games validate the captain’s actual table and available personal funds on the authority; request IDs and session revisions reject duplicated wagers and stale actions. Hidden cards and deck/random state stay on the authority, while replay frames are sent once and omitted from repeated motion packets and durable command history. The last 16 personal receipts and public current-round state are included in the existing account-data export.

### Two district stories

**After the lights go out** follows a scheduled blackout from Lantern Row to Kilowatt and the corporate ledger. Investigate the load record, balance the clinic’s emergency power, and choose a public report, a worker-run reserve or a negotiated correction. **Borrowed skin** follows a leased implant’s monitoring channel through Chrome Ward and Reservoir. Choose a documented privacy patch, independent clinic stock or a charter challenge. Each has five physical stages, three endings, faction/trust consequences, persistent choice flags and a one-time credit reward. Neither requires gambling.

Choose **Casual** to begin with a fold-equipped Sparrow, Kestrel, or Mule and your choice of starting system; **Regular** to begin beside Kettle Station with a small ship and earn its fold drive; or **Hardcore** to begin on foot at Morrow without a ship. All three start with **180 credits**. Jobs, passenger services, crew work, prices, character options, combat, and recovery follow the same rules. Earth has been silent for generations. Local jobs, old transmissions, and competing accounts of the evacuation gradually lead beyond your home system.

Farwake combines real-time ship flight with exploration and combat on foot. The browser uses Canvas 2D and native ES modules. Solo play runs locally; shared galaxies use a Node WebSocket authority and persistent storage. Players can explore separately, meet on a planet, or work stations aboard the same vessel. There is no runtime AI service: the story, characters, and branching encounters are authored.

## Cooperative boarding and airlocks · 0.21.1

Every conscious occupant of a normal player carrier can board from its actual entry airlock without helm permission. Press **E** at the airlock, or open **Crew → Use airlock**, then choose **Board [ship]**. A pilot can still initiate boarding directly from the nearby contact. If a teammate is already fighting aboard a disabled raider, the action becomes **Join boarding of [ship]**. Each person crosses separately; a pilot who stays aboard keeps control of the carrier.

The contact panel and airlock use the server's current target, distance, speed, permission and door checks. A person away from the door can mark the entry airlock. Buttons update as conditions change, including compact multiplayer updates, docking and lost targets. Friendly invitations remain separate from hostile boarding, and paid NPC crew watches retain their existing return-to-port rules.

A previously boarded NPC hull remains engine-disabled while its hull is damaged, even after its shields recharge. Returning to it preserves the same guards, wounds, loot state and physical ship. One person retreating does not end the assault for teammates still aboard. Cooperative victory retains the actual boarding party as permitted security crew on the captured NPC ship; it does not grant unrelated captains helm or bunk access. Player-controlled hostile ships retain explicit hostility and their hull/shield requirements.

Solo voyages can also board a disabled enemy from their own entry airlock. Existing voyages and passports continue without a reset.

## Planet layouts and station neighborhoods · 0.21.0

Inhabited worlds beyond Morrow now use nine regional settlement plans: **river towns, island causeways, coastal harbors, canyon terraces, oasis courtyards, thermal compounds, works districts, woodland villages, and crater rims**. A planet's terrain type selects appropriate plans; its seed controls orientation, reflection, and individual building positions. Landing pads, service buildings, roads, crossings, and surrounding landforms change together. Visiting another world of the same type can produce a different settlement. Barren survey landings have their own sparse arrangement and do not gain civilian services.

Morrow's established landing and opening route remain familiar, and Reedbank retains its preflight settlement. Other authored worlds retain their exact story contacts, exploration entrances, quest IDs and rewards within the new geography. Region sizes still follow the world's size class. The local walking map names the settlement plan, and the ship's local chart previews what to expect on the ground.

Most stations now sit near a planet or moon. Across five independent galaxy seeds, **85.7–87.5% of stations** are in a planetary neighborhood; the `farwake` seed has **792 of 905**. Procedural station placements leave **420–750 metres between physical surfaces** for docking and traffic. Neighborhood metadata names up to three worlds when they are actually close enough; it does not invent additional planets or claim distant worlds are nearby.

Detached stations have a reason and matching placement. Ore processors and salvage yards use the margins of real resource fields. Relays, quiet observatories, rescue watches and other specialist facilities use outer approaches. Existing authored station coordinates stay fixed for campaign and tutorial continuity, with individual explanations of their transfer, scientific, quarantine, or military purpose. The local chart and first-docking journal entry explain each station's location.

Existing voyages adapt once. Docked and nearby vessels follow relocated stations with their berth offsets; distant flight positions remain intact. Shared canonical ships, remote owners, boarding links, parked ships, NPC work routes, and traffic records receive the same migration. Captains saved on a changed planet return to its safe landing point. Paid homes and outposts keep their ownership and contents, with inaccessible markers moved to reachable ground. Current saves then retain their positions normally. Shared play checks that the browser and server use the same world layout before registration or connection; an outdated tab receives a clear refresh message.

The existing **900-system chart, planetary positions, progression, and Earth campaign** remain in place. This release changes geography and settlement layouts; local service and contract systems still provide the underlying activities.

## Places with identity and Earth: The Long Silence · 0.20.0

The existing **900-system chart stays intact**. Its names, IDs, coordinates, factions, authored story gates, and established routes remain stable. It now contains **25 station types, 25 planet types, and 25 system types**. That is **15,625 theoretical combinations** of the three categories, not 15,625 new or hand-authored destinations. All 25 of each category occur in generated galaxies. System purpose influences the mix of places and also changes stellar appearance, working traffic, resource density, field shape, crystal yields, and instrument signals. Normal geographic security and encounter protections still apply.

Station geometry is shared between the orbital drawing and the walkable interior: a ring has a central well, a circular station has a circular floor, and branching docks retain their arms. The 25 forms also differ in capacity, service zoning, palette, furnishing, and staff density. Greenhouses, wards, archives, laboratories, cargo decks, and passenger lounges reinforce their purpose. Their type appears on the local chart. Kettle retains its familiar service positions inside a square outline.

Planet types share their terrain and color vocabulary between orbital art and the landing region. Moons use **76 × 56** regions; dwarf worlds **92 × 68**; terrestrial worlds **108 × 80**; super-Earths **140 × 104**; and supermassive worlds **178 × 132**. The largest local region has over **5.5 times** a moon's playable area. These are explorable landing regions, not simulations of an entire planetary surface. Orbital radius grows with the same size class. Morrow keeps its original region size and authored routes.

The Galaxy chart and Casual starting-system search now accept type names as well as system names, making it possible to look for a habitat ring, city world, binary system, or other environment.

### The three type catalogs

| Station type | Planet type | System type |
| --- | --- | --- |
| Civic concourse | Garden world | Settled crossroads |
| Habitat ring | Prairie world | Agricultural circuit |
| Survey sphere | Twilight world | Industrial foundry system |
| Refinery cross | Supercontinent world | Research enclave |
| Relay spindle | Canopy world | Naval staging system |
| Twin harbor | Fungal world | Salvage convergence |
| Frontier triangle | Mangrove world | Nebular veil |
| Trade hexagon | Dune world | Contested crossing |
| Hospital octagon | Salt-flat world | Pilgrim route |
| Orbital wheel | Canyon world | Ship graveyard |
| Telescope crescent | Obsidian world | Quarantine watch |
| Repair horseshoe | Lava world | Beacon chain |
| Freight trident | Ashfall world | Close binary |
| Naval star fort | Glacier world | Red-dwarf enclave |
| Agricultural ladder | Tundra world | Blue-giant frontier |
| Forge hammer | Frozen ocean | White-dwarf remnant |
| Customs diamond | Archipelago world | Young stellar cluster |
| Greenhouse clover | Reef world | Mineral belt system |
| Transfer hub | Storm ocean | Ocean-world confluence |
| Archive arc | Forge world | Cryogenic frontier |
| Rescue fork | City world | Refuge settlement chain |
| Tether spine | Reclaimed world | Archive constellation |
| Hive habitat | Cratered world | Frontier transfer route |
| Embassy pentagon | Rust world | Stellar-remnant observatory |
| Salvage stack | Crystal world | Garden-world chain |

### Earth: The Long Silence

Open **Menu → Log → Stories → Earth: The Long Silence**, or meet **Ines Calder on Morrow** or **Oren Vale at Kettle**. A remote comms lead makes the campaign discoverable from a Casual origin elsewhere in the galaxy. Accepting it grants no story evidence or landing clearance: the existing evacuation beacon, archive, faction, Witness, and Threshold mechanics remain part of the route.

The original campaign has **16 numbered missions across 29 actionable steps**, with **three named survivor rescue and delivery chains**, **four defense or escort operations**, **six evidence puzzles**, and **three consequential choices**. Nine contacts and seven investigation objects carry the story across nine named systems. It expands the existing Earth mystery and preserves established decisions and canon. PS2 *Defender* inspired the rescue-and-defense structure: endangered people must reach real receiving places, and survivors' support helps later defenses. The characters, factions, conflict, and resolution belong to Farwake.

A survivor occupies a real berth on the physical carrying ship. An authorized guest can use a friend's hull, including a captain who owns no ship; delivery requires that same hull docked at the receiving port. Defenses require time on watch, proximity, contact integrity, and actual disabled or destroyed attackers. The moving escort covers roughly 1,954 m, so remaining at its starting point cannot complete the watch. There are ten attacking waves with fourteen physical hostile hulls across the campaign. The notebook and tracked objective show mission progress and live contact integrity.

Solo and shared galaxies use the same mission rules. Other captains can see and fight the same attackers without automatically receiving someone else's personal investigation progress. Individual choices and progress survive reconnects. Interrupted rescue passages arrange a fresh pickup, and failed operations use new encounter identities so retries cannot reuse destroyed-wave credit or duplicate stipends. Loss of a parked personal ship does not invalidate passengers aboard a different carrier.

### Existing saves and next design question

Old saves receive one-time repairs for ships that overlap newly enlarged bodies and for normal-port walking positions whose floor plans changed. Current poses then remain stable. Canonical shared hulls, passengers, NPC watches, military route points, and unloaded systems receive the same geometry migration without changing damage, resources, pay, or earned progression.

**Design note:** the player's concern about empty space and repeated activities remains a density/content issue to revisit. This release improves environmental variety and adds an authored campaign; the system count remains 900, and generated ports still share some underlying services and contract mechanics. Reducing or restructuring the galaxy is intentionally deferred.

## Casual beginnings and a choice of home system · 0.19.3

Choose **Casual** on the first new-captain screen in a solo voyage or shared galaxy. Your selected compact ship includes **Fold Drive I, Vector thrusters, and an Echo scanner**, giving **5 ly fold range** immediately. Open the Galaxy chart to choose an in-range destination. Fuel and normal travel conditions still apply; this is a saved voyage and needs no test password.

Casual also offers a searchable picker for all **900 systems** in the actual galaxy, showing the selected system’s faction, danger rating, and civilian departure station. Hearth remains the default. Other origins place you in flight beside that system’s public station, with its real hazards and access restrictions intact. Starting far from Hearth skips the local opening favor and starts independently of Kettle’s crew departure lobby. The main campaign, military service, and faction permissions still require their normal progress.

For a shared departure in Hearth, a Casual host’s drive stays fitted when the group chooses a larger ship. The host’s equipment determines the shared ship’s equipment; a Casual guest joining a Regular host keeps their own fitted compact ship at Kettle. A remote Casual captain joins the same galaxy and can meet other players there, but is never pulled back to the lobby. New shared galaxies retain the exact seed previewed during setup, and invited captains load that galaxy’s chart before choosing their origin.

These grants and origin choices apply once, at captain creation. Loading a save or resuming a passport preserves the current system, ship losses, equipment, fuel, and progress. Regular remains the default and keeps its existing progression. Simple, Moderate, and Expert guidance remain independent settings available to every mode.

## Test the fold drive yourself · 0.19.2

On the title screen, open **Test mode**, enter **123**, choose **Fold-drive proving ground**, and begin. The default **Jump out and return** setup has Fold Drive I fitted and enough fuel. Try the four-light-year crossing to Nearpoint and return to the Proving Ground, either from the test controls or the ordinary Galaxy chart.

Seven resettable setups cover the round trip, fitting a first drive, no installed drive, missing story calibration, insufficient fuel, an out-of-range destination, and trying to jump while still docked. The installation setup provides **500 test credits, 12 ore, and explicit test calibration**; fit Vector thrusters, an Echo scanner, and Fold Drive I through the real purchase rules. This does not complete the campaign chapter on a regular captain.

Each actual command produces an expected-versus-observed result and checks its effect on fuel, credits, ore, equipment, or arrival. A deliberately blocked jump can pass its test when the correct rule refuses it without spending resources. Merely reading the panel does not complete any checks. Expand **Test report** to inspect attempts or copy the report. **Reset this setup** restores the fixture; **Choose another setup** returns to the selector. After closing the panel, **Menu → Exercise** reopens the controls.

The exercise has three private, peaceful training systems and an unsavable game instance. It cannot visit the normal galaxy, grant voyage equipment or rewards, or issue commands to a shared server. Sign off from a shared galaxy before starting the local exercise. Exiting restores the previous voyage and its cameras. Existing combat, boarding, and damage-control exercises retain their restrictions.

## Equipment requirements that explain the next step · 0.19.1

**Your first fold drive** now has a personal checklist, reachable from the outfitter, Ship, the first three story chapters in **Log → Missions**, and a blocked jump on the Galaxy chart. The searchable Captain’s field guide includes a new **Installing your first fold drive** topic; searches such as “rules to install the fold drive,” “Something in the belt,” and “calibration” lead to its instructions. The topic can open the live checklist during a voyage.

Every uninstalled upgrade has a folded **Requirements & help** section showing access, named prerequisite equipment, story conditions, credits, and ore together. The fold-drive checklist separately explains meeting Iona, collecting a local job’s payment, personally mining six ore, investigating the **Tinbell evacuation beacon** from the ship, fitting Vector thrusters and an Echo scanner, and spending **320 credits plus 8 ore** on the drive. The whole equipment chain costs **500 credits plus 12 ore** before rewards; remaining totals exclude installed parts. Lifetime mining progress is distinct from spendable cargo. Beacon calibration is recorded automatically by completing the chapter.

**Show me where to go** follows the next unfinished step. It marks the actual workshop, a reachable local contract, mining rock, or beacon. A captain on their docked deck is sent through the airlock for the local workshop; mining and beacon work direct them to the Helm. Shared captains ashore first return to their ship, and the real contact is marked only after the ship scanner is available. Remote jobs do not send an unprepared captain toward an unavailable jump. Deferred guidance cancels when the captain or selected route changes.

The checklist reads current progress without buying equipment or changing story flags. Shared clicks recheck the current situation, and **Refresh my checklist** rereads progress. Shipless starts, employer duty, borrowed vessels, ships parked at another port, and full holds have specific explanations. Unknown personal inventory is not inferred from a borrowed vessel. All requested instructions and purchase rules remain available at every guidance level; this adds no permanent HUD panel and changes no save format, game prices, ownership, or server purchase checks.

## Guidance that grows with the player · 0.19.0

**Simple**, **Moderate**, and **Expert** now have distinct teaching behavior across flight, on-foot actions, work, navigation, shared crews, military musters, Navy orders, gunnery, and recovery. Choose a level from the title screen, **Menu → Guidance**, or Settings. This is a personal presentation setting: combat, rewards, ranks, permissions, and the galaxy simulation are identical at every level.

| Level | Automatic help | Requested help |
| --- | --- | --- |
| Simple | One contextual explanation at a time, control highlights, and practice reminders through two confirmed successful uses. Personal enlistment is learned once. Crew and service panels show short current-state steps. | Full explanation, common blockers, and a marked next action. |
| Moderate | A concise first-use tip for about nine seconds, then no repeat of that topic. Routine movement drills stay hidden. Crew and service panels show one next-action sentence with details folded. | Expanding a tip pins its full explanation while the context remains relevant. |
| Expert | Automatic coaching and suggested routes stay off. Status, hazards, fire orders, permissions, and live roster facts remain. | The same contextual assistance and complete field guide, whenever requested. |

The **Captain’s field guide** contains **23 searchable topics**, with practical steps, explanations, common blockers, and related topics. Search naturally for a problem such as “how do I get off the ship,” “same crew,” or “turret.” Instructions reflect keyboard or touch controls and swapped thumbs. The guide recommends topics relevant to the current activity. All explanations remain available in Expert.

A folded **Your practice** section records confirmed actions for the current captain and input layout. Reading, dismissing, waiting, failed commands, NPC gunfire, or another player’s actions never complete a lesson. Relearn one skill group or all reminders without changing the voyage or its guidance level. Existing practice records migrate; solo captains, shared captains, and isolated test sessions retain separate records. These reminders are stored on this browser, separately from the game save and passport.

Visible combat and gun stations take precedence over basic movement teaching. Guidance uses public crew locations and the player’s visible contacts; it does not disclose creatures behind fog. A hull walk remains outside the ship. Requested muster and Navy help refreshes when actual leadership, readiness, access, or order state changes, while ordinary countdown ticks do not interrupt reading. On phones, the existing compact tip strip remains the default; full instructions are available by tapping the tip or **+**.

## Playing together on phones · 0.18.0

The phone header now keeps **Crew** beside the perspective switch and **Menu**. It shows **Crew 2** when two connected human captains share a vessel; NPC sailors do not inflate the count. The **Play together** panel starts with your friends, their exact public place or ship, and whether you share a port, ship, or military deployment. A hull walk is identified as outside the ship. Joining the same galaxy, boarding the same ship, and joining a military unit are shown as distinct steps.

Both players receive the same suggested meeting ship. Its owner can choose **Allow [friend] aboard**, and the friend sees **Board [ship]** with the specific reason when boarding is unavailable. The narrow invitation preserves existing permissions without granting Helm, a bunk, ownership, or military clearance. Boarding keeps a docked ship docked. Its airlock remains available to disembark regardless of Helm permission; permanent permission explanations and detailed ship management are folded away. An open panel refreshes when a friend grants access, boards, disembarks, or changes deployment, while retaining expanded sections and scroll position.

**Serve together** opens the selected friend's current military roster. It shows each person's own rank, their readiness or location, who authorizes departure, and the next legitimate action. New recruits are directed to Sergeant Venn on Morrow to choose the same branch. The default **Open or join a muster** action reuses a matching gathering, including when two captains request it at once. Deliberately separate musters remain available, and moving between them requires explicitly leaving the first. Faction, branch, location, personal rank, and already-departed restrictions remain authoritative. Solo players retain the same Navy and Army assignments and may depart alone.

Mobile Compact tips now show a short current-action strip. Tap its title or **+** for the explanation; requesting Action help opens it immediately. Health and shields remain in a compact status line, camera controls are under **Menu → View**, and the menu uses simpler rows. Four capital batteries and their directional limits remain visible in gunnery. Large text, swapped thumb controls, saved cameras, and the option for full tips remain supported.

## A working Navy ship and broader fleet duties · 0.17.0

**FWS Steadfast now carries a permanent company of 20 named Navy personnel.** Bridge, weapons, deck, engineering, medical, and mess staff have individual duties, activities, and rank-aware dialogue. Nineteen make short rounds along real compartment routes; Commander Isen remains at the **Helm**. Sailors near the quarterdeck and battery compartment make the ship feel staffed as soon as you arrive. Nearby comments refer to current conditions without revealing future attacks. Crew conversations, the company roster, and current orders are accessible from the deck.

The company belongs to the actual carrier in both modes. Its identities, positions, injuries, and deaths persist, and every shared participant sees the same people. The permanent establishment does not consume the ten players’ shared berths or provide hired-specialist bonuses. Existing Navy saves receive the company once; recorded casualties are never replaced or revived, and the sailors do not transfer into a player's personal crew on disembarking.

The opening campaign now includes real protected freighters during the escort and final patrol. Its distress sortie has a damaged civilian tender and ordered rescue work: resolve the distress bearing, prepare casualty reception at medical, and account for the people received at the airlock. The marked attackers must be cleared before casualties can be transferred. Existing in-progress sorties retain the objectives with which they started; the expanded procedures apply to new attempts.

**Eight additional standing Navy missions** extend the existing six patrols and escorts to **14 Navy deployments**. Army retains its six deployments. The new duties are search and rescue, traffic identification, navigation survey, engineering assistance, fleet replenishment, civilian evacuation, fleet exercise, and a border stand-off. Each has a physical objective vessel and an authored sequence of orders, with station attendance and recorded outcomes. Repairs restore the disabled tender's hull; rescues and evacuations record the completed transfer; a lost protected vessel fails its operation. Quiet watches still count, and some deployments develop into attacks.

The duty panel shows the current order, its workstation, the bridge report, fire orders, personal watch progress, the operation sequence, and a bridge log. Identification and stand-off decisions depend on the observed reply: an incomplete transponder is not itself permission to shoot. The authority enforces weapons hold before identification, with defensive fire available against a confirmed incoming attack. Only reported information is exposed; encounter rolls remain private.

Recruits carry out supervised assistance at the manifest, medical, airlock, and gun stations. This does not grant the scanner or engineering permissions reserved for higher ranks. Work advances while an eligible player actually remains at its station, pauses when that station is unattended, and survives saving or reconnecting. Mission credit still requires the individual's recorded duty and a return for debrief. Solo and multiplayer use the same procedures, physical vessels, and personal rank rules.

## Capital batteries and the journey after ship loss · 0.16.0

The **Leviathan carrier, capital hull, and Judicator line destroyer** now have four selectable gun batteries: **1 Fore**, **2 Port (left)**, **3 Starboard (right)**, and **4 Aft (rear)**. Select a battery with its number key or a visible button in the exterior gunner view. Each has its own physical mounts, 120-degree firing arc, and recharge cycle; all draw from the same reactor. The selected mount and firing arc are shown outside the ship. Aiming beyond an arc identifies the battery covering that direction. Smaller hulls clearly list their single forward battery.

The Navy commander keeps flying while the gunner aims. Authorized crew aboard ordinary ships can also use the physical gun console; an unpiloted personal ship coasts instead of gaining an automatic pilot. Separate human gunners may operate different batteries concurrently, while a battery's shared cooldown prevents multiple operators from multiplying its firing rate. Navy shots remain available throughout an underway sortie, and mission credit still requires verified contributions to the actual operation. Existing personal ranks and station permissions remain authoritative.

**Ship destruction now leaves survivors on foot at the nearest space station in that system.** A destroyed personal hull loses its registration, with no replacement cutter or restored hull. Shared wrecks remain in the galaxy. An intact personal ship parked elsewhere stays at its original berth when its owner loses an employer vessel or Navy carrier. Recovery, saving, reconnecting, and purchasing a later replacement preserve these ownership distinctions. Players ashore are not transported merely because an unattended ship was lost elsewhere.

Military survivors receive personal **repatriation orders**. Port services can verify their own faction clearance and book **Homeward Passage** for **0 credits**. Captain Vale flies a real NPC transport out of port, folds to the home system when needed, and docks at the faction posting. The passenger leaves through the airlock. The transport does not become a personal ship, grant a helm or gun role, copy another player's rank, or award mission-completion pay.

Military personnel incapacitated in rival territory are held in a station cell for **five minutes of active play**. The remaining term belongs to that captain and persists across saves, reconnects, and server restarts. Logging out pauses the term. The cell has no exit, and the server rejects departure, boarding, work, and other bypass actions until automatic release. Solo players can read their log and custody orders while the term advances; the pause menu still pauses solo play. Release returns the survivor to the station landing with their personal repatriation clearance. Civilians do not acquire military detention or travel entitlements simply by sharing the casualty.

## Music for danger, caves, and worlds · 0.15.0

The original score now contains **37 authored pieces**: the previous twelve plus **ten new danger compositions, five cave compositions, and ten planetary compositions**. The main theme, **The Long Way Home**, keeps its complete melody and arrangement. Settings shows the current piece beneath the theme control.

Danger follows actual targeted hostile fire, confirmed outgoing ship hits, active pursuit, boarding, and occupied-hull emergencies. A Navy gunner, an ordinary crew member inside a shared ship, and its pilot hear the same immediate danger from their own perspective. Dodging an infantry shot still counts as being fired upon. The presence of disabled enemies or harmless target frames does not itself create danger. Planned ambushes, hidden cave creatures, distant unrelated battles, and a parked personal ship do not create false danger.

The director promptly fades peaceful music when danger appears, sustains urgency through short gaps in gunfire, and lets the captain recover after the threat ends. Five cave pieces use sparse mallets, piano, and sustained textures. Planetary selections follow the actual world’s terrain and culture, including temperate, forest, desert, ocean, ice, volcanic, industrial, barren, ruin, and alien homeworld palettes. Entering a different environment allows a gentle transition within six seconds instead of waiting several minutes for the earlier piece to finish. Ordinary dialogue and small movements do not restart the score.

All of this uses the same local audio path in solo and shared play, preserves independent music volume and mute preferences, and retains intentional quiet between peaceful pieces. See [the full composition catalog and musical direction](docs/music-direction.md).

## The same career in solo and shared play · 0.14.1

**Both modes offer the full Freewake Navy and Army campaign, all 12 standing deployments, the same promotions, rank dialogue, rewards, and service equipment.** A solo captain takes the briefing at Morrow and serves aboard the NPC-piloted carrier or travels by Army shuttle. A shared captain can assemble a human roster for those same orders. Each mode uses the same mission definitions and personal service record rules.

Navy introductory sorties now use one completion rule in both modes: finish the carrier’s marked target objective, personally serve **15 seconds at an authorized station or contribute the required verified gun damage**, return aboard the carrier, and debrief. A target destroyed by another participant does not invalidate the captain’s recorded service. Standing patrols and escorts still require the full authored watch. Valid receipts earned under the earlier solo rules remain loadable.

Promoted Navy captains can actually operate the support consoles in either mode: **Able crew** unlocks the navigation console’s scanner, and **Petty officer** unlocks engineering repairs. The same personal faction, standing, rank, health, carrier identity, and console-distance checks apply. Support actions use the actual carrier’s systems and cooldowns, and qualified time at the selected scanner or engineering station contributes to the personal watch. Gunnery remains available from Recruit; the NPC commander retains the helm.

The modes share the larger systems, obtainable hulls, port traffic, Resolute patrol, Tinbell creature, and docked-airlock behavior. The earlier party departure grant still offers Lark at two connected players, Puffin at four, and Osprey at seven; all three hulls can also be bought during a solo voyage. Solo play saves locally and pauses in menus. Shared galaxies save on the server and keep running while menus are open.

## Military careers together · 0.14.0

**Sergeant Sera Venn**, the Freewake recruiter, waits beside Morrow’s landing. Joining is optional and works for Casual, Regular, and shipless Hardcore captains. Choose **Navy** or **Army**, then follow one current assignment. The journal keeps the service record and a folded deployment board. Taking leave hides guidance and preserves the assignment; an underway vessel or live fight continues under the normal simulation rules.

### Personal rank and shared deployments

Promotions now depend on **verified, completed military assignments**, including debriefed campaign deployments and ordinary military service. They occur at cumulative milestones, with several assignments between promotions:

| Completed assignments | Navy rank | Army rank |
| ---: | --- | --- |
| 0 | Recruit | Recruit |
| 3 | Able crew | Private |
| 8 | Petty officer | Corporal |
| 16 | Chief petty officer | Sergeant |
| 28 | Lieutenant | Lieutenant |

Rank, faction membership, pay, and completion history belong to each captain. A new player joining an established galaxy starts with their own recruit record. Serving with a veteran does not copy that veteran’s rank or clearance. Military colleagues and the recruiter address the acting captain according to that captain’s rank and faction. Pre-0.14 saves retain their previously earned service tier when the record is migrated.

At Morrow, **muster a squad**, let other players in the **same galaxy, faction, and branch** sign on, then depart with the roster. Players join before departure. The highest-ranking enrolled member leads the operation; a lower-ranking recruit can accompany that leader on orders the recruit could not authorize alone. Routine standing orders open at the first promotion; more demanding orders require later ranks. Navy recruits receive weapons-station duty, the first promotion adds scanner permission, and the second adds engineering permission. Military rank never grants the NPC helm, employer-ship ownership, or authority over another captain’s personal vessel.

A shared Army operation uses one actual interior and encounter for its enrolled section. A shared Navy operation uses one actual carrier. Each member still has individual participation, return, and debrief requirements. A captain helping with a later assignment earns service credit without skipping their own unfinished qualification chapters. Separate operations keep distinct identities and progress. Every completed deployment pays each qualified captain once through their own recruiter debrief.

### Qualification campaign

The first authored story follows the effort to keep Morrow’s Rainline supply route open. Each branch retains its four introductory assignments:

| Deployment | Freewake Navy | Freewake Army |
| --- | --- | --- |
| Qualification | Work FWS Steadfast’s gun console and neutralize two harmless practice hulls. | Move through the service range, hit three harmless target frames, and register at its terminal. |
| First field assignment | Escort the merchant lane and help disable two armed cutters. | Clear the Rainline relay annex and restore its emergency channel. |
| Relief operation | Answer a relief ship’s distress call and help stop three raiders. | Secure Eastbank Aid Post and call a shuttle for two trapped clinic workers. |
| Final deployment | Break the heavier raiding group pressing the relief corridor. | Clear the beacon station and transmit the convoy’s safe landing corridor. |

**Navy service uses the Leviathan carrier FWS Steadfast.** Commander Isen flies the ship out and back. At the physical gun console, open **Gunnery view** to see the system outside, aim within the battery’s firing arc, and fire the carrier’s real weapons. The player remains aboard the crew deck. **Back to deck** restores the person view at the same console. Shots use the ship’s energy, range, cooldown, actual target hull damage, and individual contribution records. Training targets cannot shoot back. On return to Morrow, leave through the docked airlock and report to Venn.

**Army service uses the captain’s own equipment.** The standard pulse sidearm is sufficient for the introductory assignments. Human infantry use collision cover and lock their aim before firing, allowing a sideways dodge or a wall to stop a shot. Objectives require physically reaching the assigned console after securing the site. The workers leave the aid post after its evacuation signal. Every entrance remains available for retreat, and normal field recovery still applies.

Introductory Army rewards are **100 / 200 / 300 / 450 cr**; Navy rewards are **100 / 225 / 325 / 450 cr**. The existing **1 / 1 / 2 / 4 service XP** awards remain in the record, but a fresh recruit’s promotions follow the completed-assignment milestones above. Finishing four introductory assignments therefore earns the first promotion, not an immediate veteran tier. Carrier campaign watches award no separate ordinary crew wages for the same work. Existing commissioned hulls, faction clearance, personal gear, and unrelated jobs are retained. The escort entitlement counts debriefed military assignments; collecting an earned hull remains an explicit action at the faction’s public-services desk.

### Standing orders beyond Hearth

The deployment board adds **12 repeatable assignments: six Navy and six Army**. Most take place in Meridian or Sable, both claimed by the rival Meridian Combine. Each operation has a new identity, so revisiting the same posting begins a new watch or encounter.

| Navy posting | System | Army posting | System / world |
| --- | --- | --- | --- |
| Meridian border watch | Meridian | Serein border watch | Meridian / Serein |
| The Orchard grain convoy | Brindle | Restore the violet condenser | Meridian / Serein |
| Cairn supply escort | Meridian | Supply depot night shift | Meridian / Serein |
| Sable outer patrol | Sable | Bring the refinery shift home | Sable / Tallow |
| The Tallow relief passage | Sable | A quiet fuel line | Sable / Tallow |
| Ledger evacuation screen | Meridian | Open the Sable relief corridor | Sable / Tallow |

Navy standing orders take the NPC-piloted carrier to the assigned system and back. Escorts include an actual freighter to protect. Patrols and escorts can remain uneventful, or hostile contacts can appear after a period on watch. A quiet operation still requires the full personal station watch and a successful return. The briefing does not announce the future encounter outcome. The carrier, freighter, interceptors, and projectiles are part of the shared system simulation: **a civilian captain in the same system’s space view can see the operation and its battle**, even without enlisting or joining the mission. Watching a battle does not grant military rewards or permissions.

Army service shuttles take the section to Serein or Tallow while personal ships remain at their own berths. Field assignments include relay restoration, civilian evacuation, and securing a relief corridor. Watch assignments begin quietly and can stay quiet or produce a delayed infantry attack. Completion requires the captain’s own watch time, a secure position, and the actual field log. The return shuttle waits at the surface landing; leaving early ends that attempt without service pay or promotion.

Operations, memberships, canonical encounters, and individual duty records persist across saves, reconnects, and server restoration. Offline time does not count as personal watch time. One participant leaving or debriefing does not settle everyone else’s service. The existing physical airlock rules remain in force.

The definitions are keyed by faction and branch. **This release authors Freewake’s career, beginning in Hearth and extending into other systems.** Other factions retain their enlistment, bases, rank records, and ordinary service assignments; their distinct military career stories are not authored yet.

## Docked airlocks · 0.12.1

A docked ship’s entry airlock leads to the station or planet where that ship is actually parked. Disembarking does not require piloting permission, ownership, a nearby original ship, or clearing an old boarding tether. The dock takes priority over unrelated crew-duty and boarding state. The captain must reach the physical airlock; the perspective shortcut marks it when they are farther away. Taking the helm and launching remain separate actions at the helm.

Passengers already aboard receive the current docking location as the ship arrives, including compact multiplayer updates. Stepping ashore remembers that crew ship for reboarding while preserving the captain’s own vessel. Boarding and piloting still use their existing permissions.

Leaving an NPC employer through a docked airlock ends only the current watch and settles the work already earned under the existing full or partial wage rules. It lands the captain at the actual dock, preserves personal equipment and unrelated jobs, and leaves their own ship where it was parked.

## Something in Tinbell’s cave · 0.12.0

Tinbell’s existing Basalt Hollow now contains one unique creature, **The Bellwether**. It waits beyond the first bend, concealed by the cave’s fog and rock walls. It cannot acquire a captain through a wall. First contact produces an authoritative scream with an on-screen caption; a newly joining client does not replay an old scream. The creature’s name, health, targeting and map marker remain subject to the observing captain’s line of sight.

The Bellwether is an optional return-later challenge. Its heavy shell greatly reduces the starting Pulse sidearm’s damage, and its attacks can down an unprepared captain in two hits. A marked windup precedes its committed lunge; moving aside and using the recovery window matters. The entrance stays usable. If every living participant withdraws or is downed, an unbeaten Bellwether resets for another attempt. A surviving participant keeps the shared fight active; a defeated Bellwether stays dead.

This is new content in the existing cave, including previously visited Tinbell saves. The unique creature replaces the generic cave wildlife; existing survey-cache claims and story progress remain recorded. Tinbell’s evacuation beacon and the main story do not require the fight.

### Personal weapons

Outfitters now sell two later personal weapons. Purchases use the requesting captain’s credits and require a healthy captain physically beside a mechanic. They do not require ship ownership or use a borrowed vessel’s cargo. Buying a weapon equips it; previously owned weapons can be equipped again without another charge. Personal ownership and the equipped weapon persist with the captain, including while serving aboard someone else’s ship.

| Weapon | Price | Experience required | Systems explored | Damage | Cycle | Range | Armor penetration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pulse sidearm | Starting equipment | — | — | 24 | 0.32 s | 172 | 0 |
| Field carbine | 1,400 cr | 6 completed jobs or service assignments | 3 | 38 | 0.36 s | 210 | 5 |
| Breach rifle | 4,200 cr | 18 completed jobs or service assignments | 8 | 72 | 0.65 s | 230 | 20 |

System progress counts distinct charted star systems, not additional landings in the same system. The shop shows the current progress toward each requirement. These are earned progression gates, not a real-time waiting period. The existing character damage and firing-cycle traits still apply. The same equipped-weapon rules govern the reticle and real player shots in caves, boarding combat and shared encounters; NPCs retain their authored equipment.

Against the Bellwether’s 20-point shell, the unmodified weapons deal 4, 23 and 72 damage per hit respectively. The later rifle’s advantage comes largely from penetrating armor, so ordinary unarmored wildlife does not need inflated health. The server validates purchases and equipped ownership instead of accepting client-supplied damage or weapon statistics.

## Room between destinations · 0.11.0

The 0.11.1 follow-up keeps interrupted escort targets beside their employer during migration and lets an active hired gunner’s pilot close the distance to a target outside firing range, including already expanded voyages. It preserves the target’s damage and the existing job clock.

Space inside every system is three times wider and taller: the flight boundary grows from ±2,700 to ±8,100 world metres, for nine times the navigable area. Existing planet, station, moon, asteroid, signal, and ordinary enemy placements spread across that larger space. The galaxy chart still has the same 900 systems and the same interstellar distances; all content identities, populations, ore, quests, and ship statistics remain intact.

Ships, body silhouettes, hazard radii, docking clearances, weapons, scanners, mining reach, and on-foot areas keep their existing physical scale. The camera keeps its current zoom, so the world feels more spacious instead of fitting the whole expansion back into one view. Radar coverage grows with the system, while the local chart reports the actual new travel distances. Passage fares and seeded crew wages retain their previous balance; flying an existing route takes longer, and a paid crew's work window still begins on arrival.

The save format records the system-space revision. Existing solo voyages and shared galaxies migrate once, including unloaded rooms, parked and occupied vessels, physical encounter contacts, and hired-crew routes. Docked vessels retain their local berth offset; attached ships, returning boarders, and open nearby transmissions stay together. People inside cabins, settlements, caves, and other interiors keep their exact local coordinates. Progress, damage, cargo, credits, social history, and elapsed time are preserved.

NPC routes and the Resolute patrol use the expanded space at their existing physical speeds. Route restoration translates saved progress to the new route lengths, keeping traffic counts and behavior consistent. Spatial mission markers follow their actual landmarks, including Tinbell's evacuation beacon and Umbra's safe reading point.

## A shared departure and the harbor watch · 0.10.0

A new Regular or Hearth-based Casual shared galaxy offers **Start together**. Captains gather at Kettle Station before the first voyage, share the galaxy code, choose a vessel, and mark themselves ready. The host can choose a larger beginning from actual connected participants:

| Connected departure crew | Additional choice | Total berths |
| --- | --- | ---: |
| 2 or more | **Lark**, cooperative launch | 4 |
| 4 or more | **Puffin**, working transport | 7 |
| 7 or more | **Osprey**, expedition launch | 10 |

The chosen ship must fit everyone boarding. Guests confirm readiness again if the host changes the hull. **Board together** puts the crew inside the same docked vessel, with working stations, piloting permission, and a fitted bunk each. Take the helm and launch when ready. Guest captains keep their personal compact ships docked at Kettle. The host retains the original hull class in their fleet.

The authority counts live sessions, validates the untouched departure state, and records the launch once. Disconnected captains do not unlock larger hulls or move with the departing crew; they return to Kettle with their own ship. A guest can leave the lobby to begin independently; when the host closes it, everyone keeps their compact vessel. Old galaxies, late arrivals after departure, solo voyages, and Hardcore origins keep their existing starts. Larger launch hulls preserve the host’s starting equipment, including a Casual host’s fold drive, and grant no extra credits, ore, reputation, or campaign flags.

### Five additional playable hulls

| Hull | Berths | Exterior length | Working character |
| --- | ---: | ---: | --- |
| **Lark** | 4 | 92 | Economical engineering and medical service; light protection and a single pulse mount |
| **Puffin** | 7 | 124 | Passenger space, faster reactor recovery, and modest medical support; light shields |
| **Osprey** | 10 | 166 | Field repairs and damage control for a full crew; heavier turning and ordinary weapons |
| **Leviathan** | 16 | 330 | Large salvage and support tender, long-reach cutters, stronger repairs, and slow industrial handling |
| **Judicator** | 24 | 500 | Huge wedge-shaped line destroyer, four pulses from actual flank batteries, heavy shields, and very slow acceleration and turning |

Lengths are the game's common world units. Every hull has its own exterior, matching walkable interior, physical bunks, and crew stations. All five can be commissioned through the shipyard; the two largest retain equipment, fleet, and story prerequisites. Larger hulls still share the existing **ten online human captains per galaxy** limit, with additional room for NPC crew and passengers. Traffic profiles include fitting new hulls at appropriate ports; small docks retain their size restrictions.

### FWS Resolute

Exactly one **FWS Resolute**, a Freewake Judicator, keeps a slow watch in the starting system. It has a stable identity and saved patrol phase, including in existing voyages. Ordinary starting-system traffic cannot generate more Judicators. Other systems can show rare capital traffic where port scale and military context fit.

A civilian hail receives a firm instruction to clear the patrol lane. Actual Freewake military service in good standing earns a formal acknowledgment; another faction's uniform or a friendly ship owner's credentials do not confer clearance. The watch ship provides no civilian news encounter, shop, boarding invitation, or free rewards. Hailing distance follows the visible hull edge, so a captain can contact it without flying through its bow.

Its local point defence can intercept an imminent hostile shot aimed at a nearby active player, with a bounded firing cycle. It does not destroy enemy ships, resolve encounters, pay bounties, or claim a captain's patrol credit. The authority advances the watch once per active system; adding players does not add watch ships or multiply its simulation.

## People and working lanes · 0.9.0

Scheduled NPC traffic can use every player-obtainable hull, with weighted acquisition rarity and port-specific roles. Major terminals favor passenger transports and freighters, industrial yards favor working tugs and large mining/salvage ships, research outposts favor survey craft, and military bases favor patrols and escorts. Small docks only receive hulls that fit. Later hulls remain uncommon outside the places that need them; the starter menu and isolated test catalog are unchanged.

Five separate faction bases extend existing systems without closing public hospitals or story ports. Military enlistment grants that faction’s base clearance while standing stays above −25. Passenger ferries and home leases enforce the same access rule. A serving helmsman can escort a crew into a base; guests cannot independently book military passage or claim a base home without their own clearance. Civilian work boards avoid inaccessible destinations.

At the employer faction’s public-services desk, a shipless recruit can explicitly request a one-time small patrol cutter. Three verified military service assignments, each returned and debriefed, earn an escort commission. Owners keep their other commissioned hulls. Issuing a ship grants no cash, ore, fold drive, or extra story flags; repeat claims cannot heal, refill, or duplicate it. Authority checks protect borrowed hulls and reserve berths for everyone returning aboard.

Traffic follows obstacle-checked approaches, slows into compatible berths, waits, turns, and departs. Heavier ships take longer. Each contact has a persistent route phase; solo saves and authority restarts restore it, and inactive systems use bounded catch-up. Route curves remain off network snapshots. Existing population counts, encounter frequencies, asteroid fields, enemy generation, and story signals remain unchanged. Hailing an observed ship shows its work, hull and actual route without exposing the fleet catalog.

### People of the lanes

The Choral are joined by Vaeli, Keth, and Oru residents, visitors, hired specialists, employer crews, and rescued passengers. Most ordinary generated populations target 92% human; Hearth targets 98%. Exact homeworld profiles provide rare local exceptions. Two new bodies are appended to existing distant systems, so all 900 existing systems and every released body retain their chart data. Their communities include named residents, peaceful enterable places, environmental records, and small civic choices. Local speakers acknowledge the advice actually recorded there, including after save/load, without pretending an entire building project has been completed.

World sprites and portraits share each person's persistent identity. Nonhuman people retain distinct silhouettes while walking, sleeping, carrying tools, being injured, fighting, or lying dead. Species stays with a crew member through recruitment, an employer vessel, rescue, boarding, saved games, and the memorial. Hiring cards show the advertised person's name and species before payment. Optional background questions keep the main conversation short. Peaceful interiors begin with the sidearm holstered.

### Engine boundaries strengthened

- `species.mjs` contains a closed, immutable catalog and versioned identity streams. Species, culture, faction, job, and hostile intent are separate facts. Species currently grants no combat or economic modifiers.
- Existing named human characters and stored legacy crew are preserved. Missing or invalid saved species safely resolves to human; explicit valid identities never roll again on load. Surface generation uses a separate random stream and does not consume flight, asteroid, encounter, or loot randomness.
- Canonical hiring is resolved by the server; client-supplied species, health, and identities cannot replace the advertised person. Four actual WebSocket clients, late arrivals, and restarted realms are covered by regression tests.
- Sentient character rendering is separate from the explicit wildlife catalog. Boarding wrappers cannot change the underlying character's markings. No additional population simulation or species catalog is sent on each motion tick.
- `local-site-dialogue.mjs` is a bounded content hook for actual recorded choices. It checks the current body, room, record, and option before producing a response; urgent situations and active missions retain priority.

### Direction for subsequent work

Add small content packs around these shared rules: residents, places, work, and local consequences. Prefer new combinations and authored specifics to more frequent interruptions. Keep culture local; a homeworld can contain disagreements, human neighborhoods, and people belonging to different factions. Player captains remain human in this release; this is a population and NPC identity foundation.

The next engine priorities are a common entity identity contract across residents, employees, passengers, and combat; explicit versioned migrations; and durable world facts that can drive room changes and later dialogue without replaying rewards. Keep deterministic shared routines and server-owned decisions, profile the active 3–4-player scenarios before increasing simulation breadth, and expand toward ten players after those paths remain reliable. These are follow-on engineering priorities, not claims of work already completed.

## An original adaptive score · 0.8.1

Farwake now has 37 authored pieces and a music director that follows the local captain's actual situation. **The Long Way Home** is the complete main theme: a recurring piano/guitar melody, moving bass, warm organ, restrained percussion, a brighter middle passage, and a full return. Use **Listen to the theme** on the title screen or in Settings to hear it.

Exploration has distinct piano, electronic-travel, and guitar palettes. Inhabited places can feel companionable or gently whimsical. Perceived danger brings tension; incoming fire, real boarding, and occupied-ship emergencies bring urgency. A recovery passage and a quiet interval follow. A rare authored terror treatment needs a reveal the captain has actually reached. Enemy counts, darkness, low health, and unrelated ships do not select horror or combat music.

Settings now separate **Sound effects** and **Music**, with music volume and **More quiet / Balanced / More music**. Existing mute preferences are preserved. The score leaves deliberate gaps, ducks for conversation, does not restart on every menu, and clears its scheduled voices when the app is hidden. Everything plays locally; no music account, runtime generation, or listening analytics are involved.

See [the musical direction and expansion guide](docs/music-direction.md) for composition intent, priority rules, quiet intervals, cue extension, local data behavior, and verification limits.

## Established voyages · 0.7.1

Recurring characters’ new projects have a saved introduction clock. Existing solo saves and shared galaxies begin those projects when the feature arrives, rather than consuming every update from the voyage’s previous age. Their daily schedules retain the existing local clock; late joins and server restarts preserve shared project progress.

## Quiet lives and working passages · 0.7.0

Residents now follow collision-safe daily routines: work, errands, meals, rest, and sleep. Nearby people carry work props, face their activity, and pause briefly when spoken to. Essential shipwright, medical, and mission interactions remain reachable. Generic passage and public-service counters are visibly automated consoles rather than people standing permanently behind a desk.

Conversations respond to the local time, the resident’s current activity, actual mission progress, relationship history, and relevant local consequences. The interface uses a concise portrait conversation, short choices, and a compact activity cue. Longer notebook material stays separate. No runtime text-generation service is required. Shared galaxies use one persisted clock and the same physical NPC positions for every captain; a bounded recent-position allowance handles ordinary moving-contact latency without accepting distant interactions.

Beyond the starter system, a few authored social places and sparse frontier venues add everyday life, cultural differences, readable objects, benign animals, and quiet rooms. Some contain only an optional detail or decision. The procedural social-venue chance is 1 in 25 eligible frontier planets, with at most one added venue per body. The new preflight settlement has its own village, fields, meeting place, and local language conventions; it does not have modern port services or public dispatch jobs. Existing Hearth content remains unchanged by this placement pass.

Three recurring people have distinct ongoing projects. One remains at home; two travel between fixed destinations with real entry and departure paths and gaps between appearances. Their projects advance on the shared world clock, while each captain remembers previous meetings separately. Ambient exchanges require nearby, awake people and occur only in sparse time windows; lines fade after seven seconds. There is a minimum four-minute gap, a longer gap for direct addresses, and no new ambient chatter in Hearth. These are optional observations, not popup quests.

**Port services → Join a paid crew** now offers eight work orders drawn from nine authored job families: freight, fragile loads, passenger care, clinic supply runs, maintenance, surveys, construction deliveries, exterior repairs, and insured valuable shipments. Seven roles and seeded cargo, quantities, routes, puzzle settings, and pay create variation. This is a reusable work-order system, not hundreds of individually authored stories. The security assignment guards cargo aboard the employer vessel; it does not escort a second independent NPC ship.

Every new watch begins with a marked physical workstation and a departure check. The pilot waits for that check, flies the actual ship to the named receiving point, waits for the assigned work, and returns to the hiring port before paying. Mini-games include manifests, load balance, seal order, cabin preparation, medical observations, coolant allocation, instrument calibration, signal comparison, rigging, and assembly. Full wages require completed work and physical return; early return pays only the recorded fraction, and a payment cannot be replayed. Your own ship and ownership stay separate from the employer’s ship.

About 8% of generated work orders contain a complication. A hostile incident creates a real attacker and real exterior shots. Fire and illness affect the actual compartment or crewmate. The work panel and markers switch to the emergency, and the assigned worker receives the temporary access needed to respond. Small real impacts now remain visible at the default person zoom, with bounded camera shake, existing damage cues, and the Reduce Motion preference preserved.

Exterior repair work uses the actual employer hull’s shape and a separate walkable exterior surface. Suit up at its real entry airlock, reach the marked fitting, complete the locking check, and return through that airlock. The 120-second air reserve and automatic emergency tether return remain active; exhaustion injures the worker and does not complete the work or award full pay. The physical ship remains exposed to outside fire, and the pilot waits for the worker to return inside. EVA pose, employer association, work progress, and suit state survive shared-server restoration.

Old saved watches and role-only older-client requests retain their original watch rules. New menu selections send a specific work-order identifier and use the new system. The current acceptance target remains three to four captains: checks include four independent working ships, four real WebSocket clients sharing NPC schedules, real exterior-hit propagation, forged-request rejection, and restart persistence. Ten-player capacity is not a claim of ten-player load validation.

## An optional first favor · 0.6.2

When creating a solo voyage or shared galaxy, select **Begin with a short opening mission** in the starting-life setup. It is unchecked by default. A shared galaxy keeps its creation preference, and each new captain gets independent saved progress, including late arrivals. Existing saves and galaxies keep their current starts.

The opening is a modest paid job in the ordinary Hearth system. Regular captains begin on foot at Kettle with their chosen starter genuinely docked there: meet a local contact, calibrate a real maintenance relay, fly their own ship beyond the docking lights to mine two ore at the marked belt, and return for payment. Hardcore captains begin shipless on Morrow, repair a relay, and carry a service note to Kettle using the ordinary priced passenger service. The relay pays the usual 12 CR; the finished favor pays 35 CR once. The opening does not grant a larger ship, drive, equipment, or story progression unrelated to the completed work.

The existing objective, world marker, compact action hint, and contact dialogue guide one immediate action at a time. **Menu → A small favor**, the objective details, or **Journal → Missions** can resume guidance or leave the opening job. Finishing or leaving it returns to the existing voyage without relocating the captain. There are no party checkpoints or mandatory opening battles. If the marked belt has already been exhausted, the dockworker accepts the verified relay report instead.

Current multiplayer acceptance work focuses on three to four independent captains: separate progress, host-policy inheritance, joining later, physical starter berths, reward replay, and restoration. Ten online captains remains the capacity and longer-term performance target; these checks are not a ten-person load certification.

## Shared boarding and visible pilots · 0.6.1

**CREW** opens a named crew and boarding panel. On mobile, use **Menu → Crew**. Owners can turn **Allow aboard** and **Allow piloting** on separately for each captain. Ship cards show the actual location, occupied and available berths, people aboard, and the current pilot. Visitors see which permissions they have and why a boarding or helm action is unavailable.

At a port in a shared galaxy, **Board ship** enters the chosen vessel's deck while it stays docked. **Launch ship** is a separate action. Both captains can disembark and reboard the same hull in either order, including when a guest piloted it to the station or someone stayed aboard. The port shortcut retains the arriving permitted vessel for passengers with boarding access as well as pilots, across reconnects and server restoration. Privately owned ships parked elsewhere stay where they were left; berth limits still include human crew, hired crew, and passengers.

Before departure, the game names online crewmates from that vessel who are still ashore at the same port. The pilot can wait for them or explicitly choose to depart without them. The check affects departure only; offline players and people at other destinations do not hold up the ship or pause the galaxy.

Taking the helm keeps the pilot's person physically at the console. Crewmates on deck see their character and **Name · Piloting**, and the helm controls identify who is using it. The same physical position is used for damage aboard. Walking away clears the piloting cue, and people on other ships or planets do not appear on this deck.

## Privacy and data access

Open **Privacy & data** from the title screen or Settings. A browser-data report covers recognized Farwake storage on that device; a separate server-data report covers the selected shared captain whose passport proves access. Neither report contains recovery credentials or grants access to a captain. The existing save and captain-passport backups retain their recovery purpose.

The [public privacy notice](https://dfe-farwake.onrender.com/privacy.html) explains storage, shared visibility, retention, export limits, and manual requests through the existing public Holtsnider Tech contact. Farwake uses a nickname and captain passport, not an email-based account. Exporting does not require joining a galaxy or creating a new identity, and the server does not retain generated export files.

See [the data-access implementation notes](docs/privacy-data.md) before changing stored fields, authentication, providers, or report coverage. Meaningful export tests cover credential exclusion, selected-captain isolation, malformed data, and read-only operation. Device settings are restricted to recognized fields, outgoing passport payloads contain only their three required fields, and temporary request-limit address records expire after ten minutes of inactivity.

## Small beginnings and paid passage · 0.6.0

The three starter interiors are small working cabins: **Sparrow has two berths, Kestrel one, and Mule two**, counting the captain. Their revised footprints are 71–79% smaller than before, with compact stations and fold-down bunks. Five additional earned hulls bring the fleet to **14 classes**, with distinct exterior shapes, matching decks, equipment, handling, and tradeoffs. Later shipyard choices appear as their progression requirements are met. Starting choices still show only the three starters, and practice exposes only the smaller half of the fleet; boarding exercises filter out hulls too small for an assault.

**Hardcore is a shipless origin, not a separate difficulty ruleset.** It begins on Morrow with the same 180 credits, traits, health, and economy as Regular. It does not grant an invisible vessel, a free replacement, or ownership of a ship visited as a crewmate. Earning a first hull opens the normal ship campaign. Existing voyages keep their ships, progress, passengers, and crew; revised cabins relocate people to safe floor and map existing compartment damage into the corresponding smaller deck.

At an inhabited port, use **Port services** or **Menu → Port services**. Every captain can:

- **Find local work:** the contract exchange always offers a repeatable three-relay maintenance shift without a ship or entry fee. Repair three distinct marked relays and collect the contract payment at the board.
- **Buy passenger passage:** pay for travel to another eligible inhabited planet or station in the current system. The panel shows the fare, current balance, and balance after purchase. Arrival is on foot, quarantine restrictions still apply, and any privately owned ship stays at its actual berth.
- **Sign on as paid crew:** serve as a gunner, fire crew member, or ship medic aboard an employer's actual vessel. Sign-on is free, and the employer provides its ship and supplies.
- **Buy a first ship:** used starter hulls cost **420 / 420 / 480 credits** for Sparrow / Kestrel / Mule, with no ore requirement for the first purchase. A first hull must be bought at the shipwright; visiting or working aboard another ship does not satisfy that milestone.

Crew contracts use a real NPC captain, real flight, and physical stations. A gunner operates the ship's exterior guns against a marked raider; fire crew suppress and repair a compartment incident; a medic treats the injured worker aboard. **Crew duty → Mark my duty location** points to the appropriate station or compartment. Full base pay is **210 / 170 / 180 credits**, respectively, before applicable character-trait adjustments. The captain returns to the hiring port after completion or an early-return request. Pay requires recorded work and physical docking, pays only once, and grants no wages for idle or interrupted service. Partial completed work can earn a reduced payment on an early return.

These are three bounded local service runs, not a simulation of every NPC captain's career. Ordinary civilian passenger tickets connect ports within one system; assigned military transport can cross systems. The same services and ownership checks run in solo and shared play. Shared contracts retain their physical vessel, crew, progress, and ownership across reconnects and server restoration; a parked personal ship remains separate from the employer's hull.

## Hull identity and damage aboard · 0.5.3

All hulls have authored, bow-up deck footprints based on their exterior silhouettes, with their own compartments, passages, stations, fixtures, and berth placement. Open salvage cradles are actual void, not walkable floor. Boarding, crew movement, bullets, local repairs, and rendering share the same collision geometry. Old valid positions remain; positions invalidated by a revised deck move to nearby safe floor on the actual occupied hull.

Each class has native equipment with real effects and a tradeoff, shown in its existing ship panel and eligible shipyard card. The starter Sparrow has a faster-recharging reserve bus; the Kestrel has a stronger, more energy-hungry boost; the Mule has a longer-reaching mining and salvage tractor. Later hulls add their own propulsion, shield, survey, weapon, workshop, or medical specialization. Starting choices and practice opponents retain their discovery limits. Client boost prediction uses the same energy rules as authority.

Actual outside hits map into compartments according to the hull's heading and the incoming projectile. Shield absorption gives a light deck impulse. Penetrating damage leaves persistent scars and can start localized fires or pressure breaches. People near the affected point can be hurt, including captains, visitors, sleeping players, hired crew, boarders, and rescued people; intact bulkheads block exposure. Crew casualties remain permanent. Fires exhaust their fuel slowly; breaches persist until patched. Each physical hull advances once regardless of its online occupant count, and damage stays on that hull across retreat, capture, reconnect, and server restart. Empty rooms keep the existing dormant simulation policy; they do not apply retroactive offline casualties.

Person view presents brief bounded impact shake, a quiet two-tone alarm, pixel flames, venting, scorch marks, and injured-crew health bars. Reduced motion removes shake and flashes, and the existing sound setting controls the alarm. Repeated snapshots and changing perspective do not replay old hits. Mobile uses its existing status line, contextual action, and Simple guide rather than adding another permanent bar.

Approach a marked compartment and use **Damage control**, or find it through **Menu / Ship → Damage control**. Nearby consoles and people remain usable beside damage. Suppression costs 2 reactor charge; patching costs 3 charge and 1 ore; compartment repairs cost 4 charge and 1 ore. Panels show costs alongside current supplies. Actual range, intervening walls, tool cooldown, resources, and shared engineering/helm permissions are checked on the authority. Compartment repairs restore local equipment condition; engineering repairs global hull integrity, and paid port repairs also restore compartments. Noncombat interior incapacitation has a short recovery path that preserves ship damage, hazards, and casualties.

**Test mode → password 123 → Damage control** starts inside the starter cutter. One ordinary external projectile arrives after a brief delay, causing a real fire and breach. Six ore cover the repair exercise. No repeated attack, story rewards, saved progression, or additional hull previews are introduced. Completion requires suppressing, patching, and repairing the actual affected compartment.

## Direct perspective controls · 0.5.2

A persistent action button replaces the passive perspective label. **Walk deck** enters the current ship; **Take helm** returns to piloting it from anywhere on a cleared crew deck. In solo play, **Return to ship** at an outdoor landing uses the actual locally parked permitted vessel and launches. Shared play now uses **Board ship** first, as described above. A docked crew deck shows **Launch ship**. Sites and active boarding keep their physical entrances and tether rules; the shortcut marks the required exit and explains what is blocking it.

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

Captain creation provides skin, suit, hair, and head-style choices plus up to two optional traits. Choosing none is valid. Perks cover movement and combat on foot, fold travel and salvage, crew station work, and the port economy. A Core Sampler can recover crystal from the first scan of a derelict. A Triage Medic gives extra treatment to patients below half health, including rescued passengers. On shared ships, the captain operating the station supplies the perk. **Ship → Your captain** (also in Settings) edits appearance. Pre-0.4 captains get one optional trait-selection opportunity there; traits are fixed after confirmation, while appearance remains editable in a safe location. Appearance and traits are included in solo exports and shared captain persistence. Accepted contracts keep their agreed pay.

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

**Test mode** is at the bottom of the main menu; enter **123**. Choose ship combat, boarding a disabled target, person combat, pirate raid defense, or damage control. Only the smallest half of hulls by exterior size are offered as enemy choices; boarding-related exercises require a boardable target. Most exercises use the starter cutter; raid defense lends a small three-berth vessel so the boarding can physically take place. There are no allied gunners or story/progression rewards. Exercises are separate unsavable sessions: retry, switch exercises, or exit without changing a solo voyage or joining a shared galaxy.

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
| Fleet | 14 hull classes, three included starter choices, and distinct 1–10-berth interiors |
| Crew | Seven NPC specialist roles, shared human/NPC capacity, injuries, and persistent memorials |
| Boarding | Assault disabled ships or defend your own deck against pirate boarders |
| Lore | 14 collectible records, plus location descriptions and NPC conversations |
| Local activities | Larger planetary maps, enterable settlements and wilderness sites, wildlife combat, persistent supplies and decisions, plus contract work, repairs, freight, surveys, trade and recruitment |
| Stories and relationships | 11 additional threads, 45 stages, recurring contacts, remembered choices, clue-based puzzles, and faction pledges |
| Professions | Paramedic, doctor, faction law enforcement, and military service with persistent ranks and paid assignments |
| Civilian travel and crew work | Paid local passenger tickets, repeatable work without a ship, and gunner/fire crew/medic contracts aboard NPC-piloted vessels |
| Living frontier | Shared rescue calls, raids, outbreaks, and border clashes that resolve with or without player participation |
| Captain | Appearance choices and fourteen optional traits; choose up to two with explicit benefits and drawbacks |
| Starting origins | Casual with a fold-equipped ship and selectable system; Regular with a small ship; Hardcore on foot; all begin with 180 credits |
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

Contract payment is collected at the stated destination's job board after the requirements are met. A maintenance contract requires three distinct repairs. Return to a landing shuttle, airlock, or helm to resume ship mode when a usable ship is present. Without a local ship, **Port services** offers work, paid passage, and crew contracts instead.

Every ship class has a walkable interior with a helm, engineering, medical, navigation, security, and bunks. Engineering spends reactor charge to repair the hull; medical spends charge to treat injured captains and living crew. In shared play, station permissions let one person fly while others operate weapons, sensors, and support systems.

### Boarding and crew survival

Damaged enemies can become disabled. Boardable targets have at least three berths; tiny one- and two-berth craft do not produce impossible boarding interiors. Stop firing if you want to take a suitable target intact, approach until **Board** appears, and enter its deck. Move with WASD, aim with the mouse or arrows, and left-click or hold Space to fire. A visible target bracket shows aim assist when no manual direction is held. Your NPC crew can fight alongside you. An assault can be abandoned by returning to its entry point.

Pirates can also grapple your ship when your shields are weak. A warning precedes the boarding attempt; create distance or recover shields to break it. If they reach the deck, the encounter becomes a live fight. Crew and hostiles move through the same doors and corridors you use, and walls block their shots.

**NPC crew deaths are permanent for that voyage.** Casualties come from damage during the fight, are recorded in the memorial, and remove that specialist's contribution. Treatment helps living crew; it does not resurrect the dead. Recruit a replacement at an inhabited port when a berth is available. Ship defeat and captain recovery apply penalties rather than deleting the campaign.

### A useful opening route

For a shipless beginning, take maintenance shifts or paid crew work at Morrow, then visit the shipwright when you can afford a used starter. Paid passenger passage offers another way to reach Kettle and its jobs. Your first hull opens the same opening route as Regular:

1. Dock at Kettle Station and meet Iona at the shipyard.
2. Take a maintenance shift from the contract exchange. Repair the three marked relays and return for payment.
3. Launch, mine six ore, and investigate the old evacuation beacon. The journal and local map can track objectives.
4. Earn and fit Vector thrusters and an Echo scanner, then buy Fold Drive I. Its calibration also requires the local beacon chapter.
5. Follow the next campaign destination or take more local work before leaving.

The first two prerequisite upgrades and the drive cost **500 credits and 12 ore combined**: 85/2 for the thrusters, 95/2 for the scanner, and 320/8 for the drive. Fold-drive ranges are 5, 9, and 15 light-years. Optional equipment improves cargo capacity, hull, shields, weapons, mining, fuel capacity, and handling.

The campaign requires actions and decisions, not just arrival at a destination. Later objectives remain in the journal without revealing their outcomes here.

### Building a fleet

Commission hulls from an inhabited port's shipyard after earning their preceding class, equipment, and campaign milestone. Equipment upgrades carry forward. Owned hulls remain available to activate at a port, subject to cargo and crew capacity; changing hulls is not a free repair.

| Starter hull | Total berths | Used first-hull price | Character |
| --- | ---: | ---: | --- |
| **Sparrow** utility cutter | 2 | 420 credits | Shared cockpit and work bay, balanced handling |
| **Kestrel** scout courier | 1 | 420 credits | Narrow solo cabin, fast thrust, small hold |
| **Mule** salvage tug | 2 | 480 credits | Cramped working cabin, greater mining reach and cargo room |

Regular and Casual include one of these three as a personal hull at creation; a shared departure can additionally choose the Lark, Puffin, or Osprey once enough captains are connected. A captain without an owned hull pays the listed first-hull price with no ore requirement. Subsequent commissions use the shipyard's normal resource and progression requirements. Sixteen other designs range from modest working vessels to a twenty-four-berth destroyer and introduce their abilities as you progress.

Berths count **everyone aboard, including the captain**. Sparrow and Mule each have room for one additional person; Kestrel is a solo craft. Large ten-berth vessels can carry ten human players if no NPCs occupy those places. Engineers, navigators, medics, gunners, security officers, scientists, and quartermasters offer different ship benefits and boarding support. The crew manifest shows health, vacancies, and the memorial. Dismiss living specialists at a port to free space for other crew. Older saves keep existing crew and passengers even if their reduced starter cabin is already over capacity; that does not create spare berths for new recruits.

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
2. Share the **galaxy code** from CREW with friends. Each new join creates a distinct captain with their own progression and selected Casual, Regular, or Hardcore origin. The galaxy allows up to ten captains online at once.
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
| Port recovery berth | Starting fallback at the chosen civilian station for Casual, Kettle for Regular, or Morrow for a shipless origin |
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

The save includes the galaxy seed, pseudorandom state, starting origin and actual ship ownership, hull class and fleet, parked-ship location, paid passenger journeys, active NPC crew contracts, ship position and angular momentum, crew health and memorials, active boarding, resources, contracts, decisions, campaign progress, discoveries, and recorded changes to visited systems. Restoration rebuilds the seeded galaxy and reapplies its saved changes. A seed by itself reproduces the base world; the full save is needed to restore the player's history.

Settings are stored separately and are not included in the voyage export. The current engine save format is **version 4**. Earlier saves acquire starter-class and angular-motion defaults without discarding their existing crew or progress. The solo browser storage keys retain their existing names:

- Voyage: `dfe.farwake.save.v1`
- Preferences: `dfe.farwake.settings.v1`

Saved multiplayer passports use `farwake.multiplayer.passport.v1`. Their backups restore access to server state, rather than containing the whole shared world.

The HUD reports **Save unavailable** if browser storage cannot be written. The export action is available from the save panel independently of that local-storage write.

## Settings and audio

Settings provide guidance selection (**Simple**, **Moderate**, or **Expert**), touch-control size from 80–120%, **text size from 100–160%**, flight assist, swapped thumb controls, sound effects, adaptive music, music volume and presence, and reduced motion.

The world art retains its pixel presentation. Menus and HUD use normal browser text, and world labels are drawn on a separate display-resolution canvas so enlarging the text does not enlarge blurry art-layer letters. The text setting also applies to navigation labels.

Flight assist damps linear and angular drift when input is released; disabling it allows more coasting. Larger hulls still need more time to change course. Expert guidance hides the detailed objective hint and route markers. Reduced motion starts from the browser's preference and can be changed in the game.

Audio is synthesized locally with Web Audio after a browser-accepted user gesture. Sound effects and music now have independent buses and switches. The authored score has separate volume and presence controls; the theme can be heard from the title screen or Settings. Prior effective mute preferences are retained during migration. Hidden pages stop scheduled sources, and iOS interruption states are handled through the existing gesture activation path. See [music direction](docs/music-direction.md).

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
| [dist/opening-mission.mjs](dist/opening-mission.mjs) | Optional captain-local opening job, real-action evidence, targets, and one-time payment |
| [dist/opening-ui.mjs](dist/opening-ui.mjs) | Opening contact dialogue, journal entry, and single-action guidance |
| [dist/engine.mjs](dist/engine.mjs) | DOM-free rules: seeded galaxy, combat, mining, contracts, fleet, boarding, campaign gates, and save restoration |
| [dist/fleet.mjs](dist/fleet.mjs) | Hull and crew definitions; pure body-relative flight integration used by server and browser prediction |
| [dist/interior-layouts.mjs](dist/interior-layouts.mjs) | Shared walkable geometry, stations, bunks, and combat spawn points for all hull classes |
| [dist/livelihoods.mjs](dist/livelihoods.mjs) | Shipless origin, actual ownership and parked-ship checks, paid passenger routes, and first-hull purchases |
| [dist/livelihood-ui.mjs](dist/livelihood-ui.mjs) | Contextual port services, fare quotes, paid crew offers, and duty guidance |
| [dist/npc-contracts.mjs](dist/npc-contracts.mjs) | NPC-piloted service runs, actual station work, incident progress, return navigation, and wage settlement |
| [dist/content.mjs](dist/content.mjs) | Original factions, authored hubs, NPC dialogue, lore, encounters, chapters, and equipment definitions |
| [dist/surface.mjs](dist/surface.mjs) | Seeded walkable maps, collision, interaction entities, location-specific residents, and surface drawing |
| [dist/space-art.mjs](dist/space-art.mjs) | Procedural planets, ships, stations, rocks, effects, camera, and radar drawing |
| [dist/input.mjs](dist/input.mjs) | Separate walking and flight axes, independent dual-stick ownership, held fire, and input cancellation |
| [dist/network.mjs](dist/network.mjs) | Passports, WebSocket transport, sequenced input, prediction/reconciliation, and remote interpolation |
| [dist/ui.mjs](dist/ui.mjs) | Dialog focus handling, reusable UI utilities, settings, storage, toasts, and procedural portraits |
| [dist/audio.mjs](dist/audio.mjs) | Independent effects/music buses and browser audio lifecycle |
| [dist/music-score.mjs](dist/music-score.mjs) | Original authored pieces, instrument voices, and bounded note transport |
| [dist/music-danger.mjs](dist/music-danger.mjs) | Ten additional authored combat and pursuit compositions |
| [dist/music-environments.mjs](dist/music-environments.mjs) | Five cave and ten planetary compositions |
| [dist/music-director.mjs](dist/music-director.mjs) | Musical priorities, transitions, repeat memory, and deliberate quiet |
| [dist/music-context.mjs](dist/music-context.mjs) | Local, observed gameplay evidence for the score |
| [dist/shared/pgi-controls.mjs](dist/shared/pgi-controls.mjs) | Shared DailyFlyer/DFE joystick and game-surface input helpers |
| [dist/shared/device-audio.mjs](dist/shared/device-audio.mjs) | Shared DailyFlyer/DFE gesture activation and device-audio routing helpers |
| [server/index.mjs](server/index.mjs) | Static HTTP service, realm entry, WebSocket sessions, simulation clock, and health endpoint |
| [server/realm.mjs](server/realm.mjs) | Authoritative rooms, captains, vessels, command validation, station permissions, homes, and recovery |
| [server/livelihoods.mjs](server/livelihoods.mjs) | Shared passenger travel, employer vessel custody, crew wages, and creation of a paid first hull |
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

The 0.6.0 regressions also cover both origin choices through the HTTP entry points, shipless access without a phantom vessel, repeatable land-based earnings, credit-only first purchases, fare validation and quarantine, parked-ship custody, permitted visits to friends' ships, reduced-cabin migration without losing people or damage, and actual NPC work before payment. Shared contract checks include ten independent watches in separate systems and ten watches in one system, plus reconnect and restart restoration.

For a release, also exercise the browser: start and restore a solo voyage; dock, work, and launch; make an encounter choice; export/import a save and a passport; join the same galaxy in separate sessions; share a vessel and take different stations; enter and leave an actual boarding fight; reconnect from a home berth; and resize the interface at 160% text. Check simultaneous two-thumb flight/fire, audio activation, and touch cancellation on the intended physical devices. Automated rules and emulated phone viewports do not establish physical-device compatibility on their own.

## Art and shared-code provenance

Farwake's pixel-style planets, ships, stations, characters, terrain, rooms, and portraits are original drawings produced by the code in this project. The application does not load an external sprite pack or recorded music library. Its effects and 37 authored musical pieces are synthesized with Web Audio. The score contains original melodies; it does not sample commercial recordings.

The two files under `dist/shared/` are reused DailyFlyer/DFE helpers. Farwake-specific input and sound behavior lives in `input.mjs` and `audio.mjs`; the shared helpers retain the existing project's multi-touch and device-audio handling.
