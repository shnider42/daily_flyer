# The Underworks

BREACH's fourth mission is a large interconnected exploration facility, available
solo or in a private two-player room. Its mission ID is `underworks-13` and its
level ID is `underworks-13-v1`.

The authored 81×81 layout contains 3,504 walkable tiles across nine sectors,
40 enemies, 19 gates, eight refuges, and four paired transit routes. The sectors
are the arrival freight terminal, central exchange, industrial foundry, conduit
pump works, flood reserve, old workers’ quarters, rail crown, mnemonic archives,
and reactor crown.

## Explore, upgrade, return

The central hub connects several named sectors. Early visits reveal barriers
that remain useful landmarks: a sealed grille can become a return shortcut, and
a hazardous conduit can lead to a later branch or an optional supply cache.
The mission's three permanent upgrades open routes throughout the facility:

| Upgrade | New access | Control |
| --- | --- | --- |
| Industrial cutter | Sealed grilles and cuttable service passages | Use the highlighted interaction |
| Conduit insulator | Hazardous conduit routes and electrical barriers | Use the highlighted interaction |
| Phase module | Phase barriers and routes back into earlier sectors | Use the highlighted interaction |

There are no additional movement buttons. The existing Move, Aim, Fire, and
Interact controls remain sufficient on desktop and touch devices. Upgrades are
part of the mission's permanent saved progression; co-op acquisition grants the
capability to the whole team.

Both late relay branches must be completed, in either order. The reactor guardian
protects the final access item. Extraction returns the player to the arrival
lift, giving earlier shortcuts and transit links a purpose after the final fight.

## Refuges, transit, and optional rewards

Refuge stations replenish supplies and capture a checkpoint once nearby threats
are cleared. They can be used again on later visits. In co-op, a refuge also
revives a downed teammate at that checkpoint.

Transit endpoints must be discovered and activated at both ends before travel
is available. Travel moves the player who used the station; it does not pull a
living teammate out of another sector. This preserves room for splitting up
while reducing the time spent retracing cleared corridors.

Upgrade-gated optional routes contain supply caches and an optional +25 maximum
health expansion in the medical annex. The expansion applies to both co-op
operators. These rewards encourage returning to remembered barriers. Cleared
encounters and opened shortcuts remain cleared in the current run and its save.

## Navigation

The expanded mission map offers local inspection and a whole-facility overview,
with zoom, pan controls, sector names, discovered gate/station markers, and an
exploration readout. Unvisited areas remain hidden. Simple guidance routes around
barriers that the current upgrades cannot open.

Opening this expanded map pauses solo play. In a co-op room it pauses the whole
team, using the existing shared pause rule; both players choose Resume afterward.
The three smaller missions retain their quick minimap.

## Integration contract

`level.exploration` identifies the large exploration mission. Zones retain
`x1,x2,z1,z2` and carry stable `id` and `palette` metadata. Runtime state adds
`upgrades: {cutter,insulator,phase}` and `healthBonus`, with an optional
`player.maxHealth`. Door kinds are `grille`, `hazard`, `phase`, and `shortcut`;
their normal `open` flag remains the collision authority in both the browser
prediction and the server simulation.

New interactables use `type: 'upgrade'|'refuge'|'transit'`. Upgrade consoles name
their `upgrade`; refuges and transit endpoints are `repeatable`. Transit pairs
use a `destination` ID and safe `landing` coordinates. Their `used` flags record
discovery/activation in the normal saved interactable array.

Core helpers `canOpenDoor`, `canTraverseDoor`, `getExplorationProgress`, and
`getMapInfo` expose the progression rules to the interface. The `fight` objective
action identifies the guardian encounter. Upgrade acquisition and refuges use
the existing checkpoint event, so the browser saves them without a second save
system. Co-op state is still separate from solo saves.

Network protocol 2 prevents an older client from joining a room whose mission
geometry and progression it cannot render. Both Render services deploy from the
same sandbox branch, `feat/breach-fps`.

## Layout validation

An independent tile traversal, allowing each gate only when its requirement is
available, finds 696 reachable tiles at arrival, 1,122 after power, 2,309 after
the cutter, 2,978 after the insulator, and 3,410 after the phase module. Both
relays open the inner reactor; its guardian protects the key needed for the
arrival lift. The remaining optional maintenance chamber is a separate secret.
This checks that each upgrade adds connected, useful space and that sector
seams do not bypass the intended progression. Combat and interactive progression
are exercised separately by the simulation suites.
