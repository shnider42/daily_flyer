# Farwake: compact universe and Sol access

Status: design checkpoint, not a runtime release. Recorded 2026-11-26.
Source audited: shnider42/daily_flyer, feat/farwake-galaxy, commit 756fee9ba7456b028fda0dc714829edf33a713ed.

## User decisions and intent

The user wants 30 total playable star systems or fewer, with meaningful systems and stories retained and repetitive systems removed. Hearth, Sol, and Crosswind (the persistent war system) are explicitly protected. Some recognizable, astronomically grounded stellar settings are wanted. The exact final list and new star additions have not been approved individually.

The user is exploring whether every major faction obstructs return to Sol for different reasons, including institutional habit and inherited orders. This is a proposal, not an established conspiracy, final access mechanic, or selection of the disaster's cause.

The preceding story clarification governs this work: Earth's crisis was roughly ninety years before the game (the existing exact anchor is 93); competing faction accounts conceal an ultimately discoverable historical truth; hope of saving Earth is credible for much of the campaign; Earth ultimately cannot be restored as the home people hope to recover. The physical cause and allocation of responsibility remain undecided. The user wants to be surprised by the explanation.

Use plain language in dialogue, evidence, and objectives. Distinguish missing information from unclear wording. Preserve the reality and consequences of rescues and community work; revise older narration that presents lasting planetary recovery as a settled conclusion.

## Verified catalog

The current generator builds 902 systems:
- 12 original named systems.
- 288 generated sector systems.
- 8 authored frontier systems and 592 generated frontier systems.
- Voltage and Crosswind, appended after the 900-system expansion.

There are 22 authored systems, 880 generated systems, and 59 bodies in the authored systems. All 20 quest threads and their explicit destinations fit inside the 22 authored systems. The inventory also found all 28 authored military missions and all 49 added expedition showcase archetypes on retained authored destinations. The original Hearth cavern family also survives.

A 22-system baseline therefore preserves the authored story map. A proposed 26-system version could add four real-star settings if each receives a distinct role. Thirty is a ceiling, not a quota.

## Protected authored map

Keep stable system and body identifiers. Redesigning the travel chart does not require renaming the places or resetting their local geometry.

| System | Existing places and principal reason to retain |
| --- | --- |
| Hearth | Kettle Station, Morrow, Tinbell; opening, recurring cast, local campaigns, Northwatch, Relay Nine, Bellwether. |
| Sol | Earth, Luna, Threshold Station; central Earth investigation, survivors, return permissions, Nightglass. |
| Crosswind | Vey, Orsa, Lorn, Third Light; persistent fleet war, ground combat, civilian and medical stories. |
| Brindle | Orchard Nine, Weighhouse, Common Watch; agriculture, relief investigations, Floodworks, Freewake base. |
| Meridian | Serein, Ledger Ring, Cairn; political and economic disputes, water contracts, Earth ledger, field work. |
| Vesper | Lilt, Listening House, Lantern Guard; archives, census, voice investigation, reef communities. |
| Nacre | Ward, Bastion Three, Bastion Fleet Yard; hospital, refugees, rescues, under-ice expeditions. |
| Cinder Reach | Kiln, Patchwork Anchorage, Ember Muster; salvage communities, foundry and power disputes, naval base. |
| Hush | Palimpsest, Blindpost; old orders, testimony, Borrowed Voice, armistice and dead-letter investigations. |
| Sable | Tallow, Checkpoint Sable, Combine Garrison; refinery, checkpoint rescue and escort, military deployments. |
| Farwake | Newshore, The Porch; settlement, lichen, pollinator and spore stories. |
| Witness | Stillwater, Census Relay; climate archive, approach records, Earth investigation and defense. |
| Afterlight | The Wide, Open Door; Oru performance, storm market, distant relay. |
| Chorus | Glass Harbor, Chora; Choral first contact, Vey, garden community, witness and translation stories. |
| Umbra | Umbra Watch, Moth; delayed rescue, Threadwell stellar black hole, observatory and warning stories. |
| Ravel | Night Market, Tessera; debt and underworld stories, Small Mercy, recurring residents. |
| Cairnsea | Still Berth, Low Water; isolated cold stations and Empty Ward expedition. |
| Brassfall | Brass Customs, Brassfall Works, Hadrun; Keth homeworld, workers, repair court, furnace strike. |
| Kindred | Kindred Port, Kindred Landing, Avel; resettlement, Vaeli homeworld, arrivals, relief and clinic stories. |
| Lacuna | Observatory, Noonless; Hollow Crown stellar black hole, thermal refuge, apartments and research. |
| Greenwake | Depot, Ochre Garden, Reedbank; Choral gardens, first inhabitants, preflight culture and council stories. |
| Voltage | Crown Exchange, Glimmer, Kilowatt, Reservoir; city districts, two quest threads and recurring cast. |

No authored quest destination was found outside this list. This does not mean procedural locations contain no player history.

## Content that requires deliberate placement

Removing the generated chart also removes eligibility for content currently tied to generated IDs. Preserve the useful content by assigning it to appropriate retained or proposed locations:

- Five cavern families: limestone, root grotto, tidal, glacial, lava tube.
- Seven small social-place variants: The Last Cup, The Borrowed Hour, Rainbreak Park, The Upstairs Rooms, The Small Watch House, A Farm at the Bend, The Sevenfold Door.
- Some stellar, planet and station appearance types currently occur only in generated space.

Do not create new systems merely to preserve every template as a separate destination. A meaningful system may contain several different worlds, stations, caves and communities. Avoid transferring hundreds of procedural worlds into a few huge systems; that would preserve the repetition under another heading.

## Real-star settings: candidates, not committed additions

Suggested maximum of four additions: Alpha Centauri, Epsilon Eridani, Tau Ceti, Sirius.

Use real broad stellar properties, with fictional Farwake settlements, inhabited planets, institutions and events. The chart is a gameplay travel map; its units and all fictional locations are not a claim of measured astronomical geography. In particular, the existing Umbra and Lacuna black holes are fictional.

- Alpha Centauri: triple star system, with A/B and the distant red dwarf Proxima. Possible role: old departure infrastructure or a monitored Sol approach.
- Epsilon Eridani: nearby debris-disk system. Possible role: a deliberately authored belt, salvage and working-port region.
- Tau Ceti: nearby star. Possible role: long-established colony or observatory with its own history.
- Sirius: binary with white dwarf Sirius B. Possible role: distinctive stellar environment and specialized observation.

These possible game roles are proposals. Do not describe invented inhabited worlds as confirmed exoplanets.

Primary references:
- https://www.nasa.gov/image-article/alpha-centauri-triple-star-system-about-4-light-years-from-earth/
- https://science.nasa.gov/universe/exoplanets/sofia-confirms-nearby-planetary-system-is-similar-to-our-own/
- https://science.nasa.gov/exoplanets/target-star-catalog/
- https://science.nasa.gov/missions/hubble/astronomers-use-hubble-to-weigh-dog-stars-companion/

## Travel feasibility

Filtering the current chart to authored systems without changing coordinates leaves:
- 9 of 22 reachable from Hearth with Fold I range 5.
- 14 of 22 reachable with Fold II range 9.
- 14 of 22 reachable even with Fold III range 15.

All eight authored frontier systems lose their stepping stones. A new chart must therefore be authored alongside the reduction.

A feasibility check kept the original 12 systems, Voltage, and Crosswind in place and assigned the following candidate chart coordinates to the eight frontier systems:

| System | gx | gy |
| --- | ---: | ---: |
| Chorus | -13 | 8 |
| Umbra | 16 | -7 |
| Ravel | 17 | 6 |
| Cairnsea | -7 | -8 |
| Brassfall | 12 | 0 |
| Kindred | 0 | 15 |
| Lacuna | -16 | 0 |
| Greenwake | -8 | 12 |

This provisional arrangement makes 11 systems reachable with Fold I and all 22 with Fold II. It is a connectivity proof, not a final map or balance decision. Fold III must retain useful routing benefits. Proposed real stars still need deliberate placement.

Chart position currently affects encounter security and distance classifications. Preserve intended local threat and traffic behavior through explicit metadata or equivalent separation before compressing coordinates.

Crosswind chooses opposing factions from nearby anchors. Preserve its established Freewake/Meridian conflict when changing nearby chart positions or adding new systems.

## Existing saves and shared galaxies

Changing the count constant is insufficient: the base generator creates 300 systems before expansion. The current invalid-system fallback moves a captain toward Hearth without repairing every dependent reference.

Required migration scope:
- Current captain and location, interiors, active expeditions and return routes.
- Occupied, owned, parked, captured and employer vessels.
- Crew, passengers, rescue groups, cargo, equipment and hull condition.
- Active generic job endpoints, profession contracts and their agreed terms.
- Paid homes, leases, bunk ownership and recovery destinations.
- Discovered/visited history and expedition evidence/reward receipts.
- Shared worlds, sites, vessels, military operations and world events.

Retain authored IDs and progress. Interpret old saves using the legacy chart before applying a versioned compact-map migration. Migrate an entire shared realm coherently before constructing individual captain games; passengers and their ship must move together.

Keep an exact recoverable pre-migration save or realm snapshot. Validate active references and ownership before atomically accepting the replacement. The multiplayer content version must prevent old and new clients from using different maps in the same realm.

Procedural retirement policy remains to be implemented:
- Existing authored stories and their state remain in place.
- Generic endpoints can move to compatible retained destinations with identifiers, agreed pay and progress preserved.
- Retired-location history should remain historical, not be relabeled as if it occurred on a different planet.
- A partially explored retired procedural site cannot automatically be merged into an existing showcase. Either transfer the relevant instance with its identity and geometry, or archive its progress and safely extract its occupants. Make that policy explicit; do not silently reset it.
- Avoid generic recursive replacement of location strings: historical records, receipts and unrelated identifiers have different meanings.

## Proposed Sol obstruction

The user is considering shared obstruction by all major factions. Different motives and practical mechanisms are essential. Possible directions:

| Faction | Possible reason | Possible obstruction |
| --- | --- | --- |
| Terran Continuity | Inherited emergency authority; fear of repeating the disaster | Patrols, quarantine orders, exclusion zones |
| Meridian Combine | Liability, commercial arrangements, withheld support | Fuel and transport contracts, docking support, navigation infrastructure |
| Lantern Assembly | Unresolved risk; institutional reluctance to authorize a test | Restricted archives, instruments, survey permissions |
| Freewake Union | Refusal to sacrifice present communities for another Earth project | Crews, port cooperation, public supplies and funding |
| Cinder Clans | Inherited warnings, selective secrets, competing clan interests | Guides, unofficial routes, intimidation or selective smuggling |

These are proposals, not proof of culpability. No faction should become a single mind. Include dissent, local discretion, sincere belief and limited knowledge. An institution can enforce a rule whose original reason its current officers do not understand.

Do not turn access into five mandatory permission errands. The eventual design should define what concretely prevents a ship from returning, how that restriction interacts with fold travel, and what alternative forms of assistance or access exist.

Current Earth landing permissions are not a blanket Sol blockade. Keep already-earned progress valid during a topology migration; story access changes require their own explicit design.

Nightglass takes place on Luna. A stronger Sol restriction requires clear chronology or an explanation of the recovery operator's exceptional access. Do not silently turn it into a prequel or establish a secret route.

## Meaningful systems

Every system needs an identifiable purpose, reason to revisit, and relationship to neighboring places. It does not need an Earth clue. Crosswind can matter through war and civilians; a farming system can matter through who it feeds; an alien homeworld can matter through its inhabitants.

The design target is fewer repetitive destinations and stronger continuity between visits. Retaining 22 authored systems is a preservation baseline, not a claim that all 22 already have equal depth.

## Implementation order

1. Finalize a chart of at most 30 systems; use the protected 22 as the baseline.
2. Assign generated-only content worth keeping to deliberate homes.
3. Implement legacy interpretation and explicit solo/shared migration together with compact chart generation.
4. Verify story destinations, route progression, shared ownership, occupied locations and reward receipts.
5. Rework Sol access and contradictory Earth conclusions as a separate narrative change, using the clarified tragedy and plain-language standard.
6. Add a real-star setting only when it has a specific role; do not fill unused slots merely to hit a count.

This checkpoint changes documentation only. No runtime systems, live saves, campaign gates or deployments were changed.
