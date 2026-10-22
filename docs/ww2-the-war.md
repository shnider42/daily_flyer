# The War 1.0

Current-only scenario: `current:the_war_1`. Existing scenario snapshots, artwork,
and Legacy catalog entries remain intact. This is a fictional combined-theater
playtest, not a historical order of battle.

## Force and geography

- 80 × 48 hexes; all 20 authored terrain types plus rubble.
- 146 unit counters: 74 Allied, 72 Axis, including passengers, grounded aircraft,
  airborne reserves and scheduled reinforcements. All 34 existing unit classes.
- Seven selectable command groups per army, plus host-controlled army HQ:
  coral coast, Stonehaven infantry, desert armor, high passes, naval task force,
  air bridge, and strike command.
- Full inherited armor families, asymmetric naval weapons, carrier dive/torpedo
  bombers, Britain interceptor/bomber profiles, night fighters, Pathfinders,
  troop transports, fixed AA, and specialist ground teams.
- Roads connect the fronts laterally. A one-hex river supports alternate engineer
  crossings. Sea lanes remain navigable around the islands. Starting formations
  are close enough to contest objectives without crossing the full map first.

## Campaign score

First to 70 points. Otherwise, higher score after round 48; Axis wins a tie.

| Source | Points | Eligibility |
| --- | ---: | --- |
| Stonehaven city flag | 2 per own turn end | Infantry |
| Five other land flags | 1 each per own turn end | Infantry; tanks also capture the desert flag |
| Two sea lanes | 1 each per own turn end | Uncontested warship within 1 hex |
| City plus mountain crossing | 1 extra per own turn end | Both flags owned |
| Enemy airfield destroyed | 3 once per field | Any damaging attack; 2 fields per army |
| Marked shore team evacuated | 2 once per team | Landing craft at own rear buoy; 1 boat AP; 2 teams per army |

Aircraft, passengers and reserves cannot capture. Separate Midway carrier-loss,
Britain raid-damage, Nightfall airborne-hold and Dunkirk rescue instant wins do
not run in this campaign. Their equipment and actions feed the shared score.

## Integration inventory

| System | Campaign use |
| --- | --- |
| Shared weapons and terrain | Protection, penetration, ammo switching, suppression, smoke/frags, assault, overwatch, tracks, structural damage, collapse and rubble |
| Infantry roles | Rifle/leader/scout/MG/mortar saved capability lists; MG 42 suppression only at 2–6, base sight 4; other specialist roles retain their tools |
| Officer recovery | Captain radius 1 in platoon; major radius 2 across groups; full-own-turn pinned recovery for teams without self-rally |
| Spotting and signals | Local platoon live sight, radio reports, Observe, camouflage, tower observation, snipers, recon-guided gunfire and mortars |
| Off-map support | HQ artillery/recon charges and cooldowns; Stonehaven captains can spend the army's two mortar-support calls |
| Engineering and logistics | Hedge breach, rubble clearing, one-hex bridge kits, armor/track repair, demolition, finite repair kits, mortar shells and supply packs |
| Small-front mechanics | Eight medical supplies per army; three Axis cave galleries; Allied engineer sealing |
| Naval warfare | Hull repair, gunfire, bombardment, finite torpedoes, escort AA/interception, amphibious infantry and landing-craft passengers |
| Carrier decks | One carrier per side; 4 Allied / 3 Axis finite flights, 2 cycles per turn, 1 at half hull; recover and service aboard |
| Airfield turnaround | Two fields per army, six berths each, eight stores, 3 cycles per turn, 1 at half strength; launch, land, service, station repair |
| Flight endurance | Fuel on every actual flight, including transports and carrier planes; 1 per launch/leg/airborne own-turn end; zero at turn end loses the flight |
| Air combat | Britain aircraft profiles, Allied radar guidance, close fighter escort, flight-path interception; heavy land-based aircraft cannot land on carriers |
| Airborne | Two transport-carried squads per army; two separate Allied HQ reserves; one glider reserve per army; beacon/flare guidance, scatter, Flak, rough landings and water losses |
| Scheduled reserves | One tank and rifle section per army in round 4; blocked entry waits |
| Night operations | Four daytime rounds then two night rounds, repeating; short night sight, searchlights, flares and gun flashes; slight saved radar-position variation in rear search sectors |
| Weather | Independent saved semi-random forecast; opening two rounds clear; next two confirmed; rain launch limits cover both carriers and airfields |
| Private deployment | Legal defaults; reposition only inside each group's assembly area and domain; two Axis bunkers / two Allied naval preparation aims |
| Shared application features | Solo AI, unit/platoon co-op, consent/ownership, undo/redo boundaries, save/resume, fog-filtered playback, factual after-battle debrief, desktop/mobile layouts and existing illustrated insignia |

Launch, recovery and servicing retain the source systems' AP/cycle costs.
Service now restores fuel and, for Pathfinders, flares. Landing/servicing impose
next-turn readiness. Rain does not close recovery. Co-op uses existing command
ownership for both aircraft and bases. Carrier search/strike abstractions are
replaced by the finite movable flights in this scenario.

## Implementation and validation

`the_war.py` owns the opt-in map, roster, integration rules, scoring and AI domain
choices. The saved `war_version` gate prevents new rules from attaching to older
matches. Existing authority checks, combat dice, weather persistence and order
journals remain the source of truth.

`tests/test_ww2_the_war.py` exercises deployment, cargo ownership, aircraft cycles,
fuel, forecast limits, daylight/night drops, cave/aid/role interactions, scoring,
privacy, light visibility and result/debrief behavior. `tests/ww2-the-war-dom.cjs`
uses the full app with real Flask requests at 1440 and 390 widths. It is DOM
integration coverage, not a real-browser visual assessment.

Local profiling of bounded computer batches after setup: daytime 12 orders in
about 6.8 seconds; after caching public night emitters, subsequent night batches
of two orders took about 1.3 seconds. The first night batch took about 2.2 seconds,
including path setup. Production timing and long-campaign balance require play.
The existing persisted background computer pipeline continues to publish small
increments, avoiding a single full-army HTTP request.
