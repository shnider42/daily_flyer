# Faction supercapitals

The five existing factions each have one original supercapital class and one named physical flagship in a seeded galaxy. Their exterior lengths are 1,800–2,200 game units, compared with the Judicator’s 500 and the Sparrow’s 64. This is a visible and physical scale difference; the release does not attach a conflicting real-world kilometre figure to it.

| Faction | Class | Named flagship | Anchorage |
| --- | --- | --- | --- |
| Terran Continuity | Bastion | TCS Last Accord | Sol |
| Freewake Union | Commonwealth | FWS Common Cause | Brindle or Farwake |
| Meridian Combine | Dominion | MCS Long Dividend | Meridian or Sable |
| Lantern Assembly | Palimpsest | LAS Unbroken Record | Vesper or Hush |
| Cinder Clans | Crucible | CCS Firekeeper | Cinder Reach or Afterlight |

The four variable placements come from the galaxy seed. Reentry and restoration preserve each flagship’s identity and state. Hearth and Crosswind keep their existing traffic and encounters. These ships do not introduce attacks on ordinary travelers: their defensive batteries respond only to a confirmed attack by an identified physical hull.

## Working hulls

Each class has its own exterior outline, propulsion and resource statistics, native equipment, and connected working deck. Forty-eight playable berths represent the inhabited operational deck available to the captain and crew. The normal ten-human shared-realm limit remains unchanged. Medical, navigation, engineering, security, records, quarters and hangar spaces use the existing cabin and station systems.

The classes can be commissioned through the existing shipyard after owning a Horizon, fitting Fold Drive III and earning the existing expedition alliance milestone. They cost 175,000–210,000 credits and 120 ore. Large holds and heavy weapons come with slow acceleration, slow turning and high fuel and reactor costs. The ordinary starter choices and the civilian casual-crew selection remain unchanged.

All five outlines are original. The Bastion has a long command spine and broad engine citadel; the Commonwealth carries paired inhabited shoulders; the Dominion has staggered asymmetric freight bastions; the Palimpsest connects two archive drums; the Crucible has an open recovery cradle between its working arms. Collision and deck geometry use those same outlines. A shot can strike a long bow outside the old circular combat radius, and a shot can pass through the Crucible’s empty cradle.

## Sol’s physical flagship

Last Accord has the stable identity `sol:supercapital:concord`. Its initial station is Earth plus `(2100, 850)`, facing toward the inner system. The complete hull clears Earth, Luna, Threshold and the early arrival point. Its recovery anchor is attached to the actual hull and rotates or moves with that hull. At the initial pose the anchor is `(1660, 1074)` relative to Earth’s origin.

The brig descriptor identifies a small 14 by 22 tile secured section of Last Accord, with stable host, cell, console and release identities. Detention must use this section of the real flagship, rather than relabeling the prisoner’s own cabin. The full working cabin does not need to be generated for a prisoner in the holding section. The root custody rules own detention, recovery, release and the captured ship’s state; the flagship module supplies the physical host and anchor.

## Integration and persistence

`dist/faction-supercapitals.mjs` installs each flagship directly into `world.traffic`, tagged `factionSupercapital: true`. This is the canonical object used by rendering, hail, projectile collisions and custody. There is no second display-only flagship array. Ordinary traffic advancement leaves its held anchorage alone.

`supercapitalHullHit` tests the full rotated outline for any living hull in the five new classes, including a player-commissioned ship. Bow and stern hits beyond the center collision circle still strike armor; the Crucible’s open cradle remains empty space. `factionSupercapitalHit` adds the canonical traffic-contact check for NPC damage and retaliation. Existing hull classes keep their existing collision rules.

`record.factionSupercapitals` stores hull and shield damage, pose, destroyed state, current defensive attack phase, locked aim, target hull and attack serial. Restoration accepts only the seed’s expected flagship identities. A destroyed flagship remains a wreck and cannot act as a live captor. Empty rooms do not advance combat warnings.

Defensive shots use native physical muzzle positions. A 1.8-second acquisition warning precedes each locked volley; the next cycle includes 2.8 seconds of recovery. Projectiles belong to the actual flagship and identify their target hull. The collision authority must enforce that identity so a neutral neighbor is not hit by another captain’s provoked encounter. Leaving the flagship’s defense range cancels an armed volley; a new target receives a fresh warning.

`dist/faction-supercapital-content.mjs` holds shared hull facts and outlines. `dist/faction-supercapital-cabins.mjs` constructs bounded connected decks, while `dist/faction-supercapital-art.mjs` paints the original native silhouettes. Existing hull and surface revisions are retained; new classes do not remap a captain already standing on an older deck.

## Verification

`tests/faction-supercapitals.test.mjs` exercises paid commissioning and saving, deterministic faction presence, harmless visits, Sol anchor and brig identity, visible-outline collision, shield and hull damage, warned targeted retaliation, exact next-attack restoration, permanent destruction, working berths and unclipped distinct artwork. Existing hull-layout tests check every new floor tile against the same pressure-hull mask and verify that all stations, bunks and corridors are reachable.
