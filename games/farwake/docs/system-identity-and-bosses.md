# The compact chart: local identities and optional ship bosses

The 26 systems keep their existing worlds, settlements, quests, and exploration sites. `dist/system-identity.mjs` supplies each system with a plain-language purpose, two or more activities at real retained body IDs, and a local traffic and incident mix. The chart and navigation can show these public facts without revealing the Earth investigation's conclusions.

## Local play

| System | Main reason to visit |
| --- | --- |
| Hearth | Fit out a ship, help Morrow, and investigate Tinbell. |
| Brindle | Food production, pump repairs, farms, and the Floodworks. |
| Meridian | Water contracts, freight, and disputes over essential supplies. |
| Vesper | Archives, Lilt's communities, and Lantern assignments. |
| Nacre | Hospital work, relief shipping, and the fleet yard. |
| Cinder | Salvage claims, foundries, and Cinder assignments. |
| Hush | Old relay orders and surviving witnesses' records. |
| Sable | Inspections, refinery work, and contested outer shipping lanes. |
| Farwake | Supply and explore a settlement still being built. |
| Witness | Recover climate observations and prepare an approach to Sol. |
| Sol | Cross the cordon and conduct the Earth investigation. |
| Afterlight | A remote port, performance spaces, and a storm market. |
| Chorus | Translation, exchange, and Choral communal life. |
| Umbra | Gravity surveys, isolated shelters, and rescue. |
| Ravel | Unofficial trade, debts, and nightlife. |
| Cairnsea | Winter relief, shelters, and evacuation records. |
| Brassfall | Parts, industrial repairs, and Hadrun's repair courts. |
| Kindred | Arrival work, resettlement, and relief negotiations. |
| Lacuna | Observatory work and keeping thermal refuges operating. |
| Greenwake | Living gardens, research camps, and careful contact. |
| Voltage | City districts, freight, power, water, and nightlife. |
| Crosswind | A continuing fleet and ground war with personal allegiance. |
| Alpha Centauri | Settlement shipping, Haven's communities, and Shelf's glacial caves. |
| Epsilon Eridani | Industrial work, Forge's lava passages, and Bough's rooted caverns. |
| Tau Ceti | Survey work through tidal and limestone caverns. |
| Sirius | Long-route transfer work and harsh-world settlements. |

The lane profiles change actual traffic counts, background hostile counts, and the relative chances of physical rescue and derelict contacts. Incident multipliers change the existing director's eligible mix: Cairnsea and Nacre favor rescue, Cinder and Ravel favor raids, and Sable favors clashes. A multiplier cannot revive an incident excluded by regional policy. Core hubs keep their prohibition on background random attacks; Crosswind uses its existing war simulation, and Sol uses the authored cordon and campaign rather than generic incident substitution.

These profiles point to existing work and places. They do not invent a new quest merely by naming an activity, add star systems, or make unrelated local wildlife part of the infestation.

## Three optional heavy contacts

`dist/ship-bosses.mjs` selects one system for each of three mechanical archetypes using the galaxy seed. There are at most three of these encounters in the entire chart. Visiting, saving, or changing a view never rerolls them. Their disjoint placement pools exclude Hearth, Sol, Crosswind, and the busiest settled hubs. Each contact is placed outside ordinary arrival corridors and away from the ports; local navigation can track its physical hull.

| Contact | Possible systems | What the player must do |
| --- | --- | --- |
| Deadweight, a siege monitor | Sable, Sirius, Brassfall | Move across a locked cannon lane during its 2.2-second warning. Attack its open armor during the 3.1-second cooldown. |
| Breakwater, a heavy ram tug | Cinder, Ravel, Epsilon Eridani | Leave the marked charge path during its 1.7-second warning. The tug commits to a straight run and then spends 2.7 seconds braking. |
| Second Crown, a screen carrier | Witness, Cairnsea, Umbra, Lacuna | Destroy two physical screen relays before damaging the carrier. Its six-shot spread has a fixed aim and gaps between the marked lanes. |

The main hulls remain combat actors below the ordinary NPC disable threshold. They cannot be converted into routine boarding captures. Relays are unmanned objectives, grant no bounty or loot, and never regenerate after destruction. The carrier cannot leave live relays behind after its destruction. Only the primary hull grants the ordinary kill credit and its one salvage pickup.

All three encounters can be left. A captain beyond the local pursuit limit cancels the armed attack; the boss returns toward its original area. Damage and destroyed relays remain. No boss locks the fold drive or closes a port by adding a special travel restriction. A projectile already fired remains an ordinary physical projectile until it expires or hits something.

## Shared simulation and saving

The engine installs one encounter in the shared world and steps it once through `Game.stepWorld`. Participants are eligible physical vessels. Several captains aboard one ship do not create several targets or multiply a ram impact; each charge can damage a vessel once. Parked empty ships and docked ships do not activate a boss.

`record.shipBosses` stores the encounter identity, exact living actor positions and health, the attack phase and remaining time, committed aim, target, attempt and attack counters, and destroyed objectives. `captureShipBosses` snapshots this state without mutating it. Loading reconstructs only known actor IDs for the seed's encounter. A destroyed primary remains destroyed. An empty room does not simulate unattended boss combat or advance the warning clock during absence.

Warnings use the same locked angle, travel distance, and physical objectives as the attack rules. `dist/ship-boss-art.mjs` draws them without changing simulation state. Reduced motion retains the entire warning geometry and text. Boss music requires the player's actually engaged vessel; an unrelated captain elsewhere in the system receives no boss score.

## Tinbell's optional physical clue

Tinbell Hollow also holds a small observation defined in `dist/tinbell-evidence.mjs`: silver, black, and amber bands inside sealed old beacon insulation. Reading the physical record seals a sample and records the spacing. The field scanner cannot identify it, and the record does not claim that it caused the Bellwether's behavior.

The stable record/evidence ID is `bellwether-residue`; the physical-source-only collected lore ID is `tinbell-layered-sample`. The late Earth investigation may compare this sample with independently established evidence. The sample is optional corroboration, never a requirement that a captain defeat the early boss to complete the main campaign. It neither changes Bellwether combat nor identifies the creature as an infestation avatar.

## Verification

- `tests/system-identity.test.mjs` checks all 26 identities and actual body references, meaningful local mixes, protected core policy, and the unaltered Bellwether actor.
- `tests/ship-bosses.test.mjs` exercises deterministic bounded placement, warning and recovery windows, locked aim, dodgeable ram collision, one impact per vessel, physical shield objectives, exact next-attack restoration, retreat, permanent defeat, and local music/render state.
- `tests/ship-boss-engine.test.mjs` runs the real bullet damage and solo save pipeline, including shield enforcement, no ordinary disable/boarding conversion, no relay bounty, and a single permanent primary payout.
- `tests/server/ship-bosses.test.mjs` checks one world clock for two captains, the full/compact warning snapshots, and exact shared-realm restoration.
