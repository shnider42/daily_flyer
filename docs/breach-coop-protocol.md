# BREACH co-op implementation contract (0.12.0)

Private rooms run a server-authoritative simulation over WebSocket for **two to
four players**. Protocol **3** is required. Six of the nine solo missions support
co-op: Crosslink (`crosslink-11`), The Underworks (`underworks-13`), The Glasshouse
(`glasshouse-17`), The Hollow (`hollow-19`), Beneath The Shadow
(`beneath-the-shadow`), and The Wrong Side of Tomorrow (`wrong-side-of-tomorrow`).
Solo saves remain separate from live room state. This document describes the
current source contract; historical release notes retain their original scope.

## Ownership

- `core.mjs` and the level modules own gameplay rules and authored geometry.
  `coop-core.mjs` applies independent player inputs to one shared world.
- `room-catalog.mjs` resolves functional room and protection metadata.
  `tomorrow-society.mjs` and `tomorrow-hazards.mjs` own Tomorrow's faction,
  favor, betrayal, mimic and hatch rules; they run in the authoritative world.
- `server/breach-rooms.mjs` authenticates player slots and validates room actions;
  `server/breach-server.mjs` supplies HTTP/WebSocket transport and tick scheduling.
- `coop-client.mjs` projects authoritative snapshots into the local `Game` view;
  `app.mjs`, `index.html`, and `style.css` own the interface.
- `renderer.mjs` draws players, projectiles, and encounters in WebGL and Canvas.
  Audio and rendering consume state and events without resolving combat locally.

## Shared simulation API

`coop-core.mjs` exports `CoopGame`, `COOP_PLAYER_IDS` (`p1` through `p4`), and
`FRIENDLY_FIRE_SCALE` (`0.5`). A four-player construction is:

```js
new CoopGame({
  mission: 'wrong-side-of-tomorrow', difficulty: 'standard', seed: 1,
  players: ['p1', 'p2', 'p3', 'p4']
})
```

The class accepts one to four distinct valid IDs for simulation/testing; the
room service requires at least two players to start. It exposes `level`,
`options`, `state`, `start()`, `pause()`, `resume()`, `restart()`,
`restartCheckpoint()`, `update(dt, inputsByPlayerId)`, `interact(playerId)`,
`switchWeapon(playerId, weaponId?)`, `drainEvents()`, and `networkSnapshot()`.
An omitted weapon ID cycles carried weapons. An explicit ID selects only a
weapon returned by `ownedWeapons(player)` and cannot grant equipment.

`state.players` is keyed by stable player ID. Each player has normal gameplay
fields plus `id`, `alive`, `moving`, and a personal `tutorial`. The eight weapon
IDs are `pistol`, `shotgun`, `arc`, `ricochet`, `grenade`, `repeater`, `nullgun`,
and `lance`. Their ownership and ammunition fields come from `WEAPONS` metadata.
Ammunition keys are `pistol`, `shells`, `cells`, `slugs`, and `grenades`.

`networkSnapshot()` returns a detached, JSON-safe live state containing players,
enemies, doors, pickups, interactables, projectiles, effects, `shadowHazards`,
Tomorrow's `tomorrowSociety` and `tomorrowHazards`, progress, status, counters,
and the room-specific fields `friendlyFire`,
`friendlyHits`, `partyScale`, and `spawnVariant`. `state.player` and
`state.tutorial` are compatibility aliases and are omitted from the network
snapshot. Co-op `serialize()` is deliberately unavailable; received room state
must not enter solo save/restore.

Inputs are `{forward,strafe,angle,fire,aimAssist?}`. Facing `angle` is absolute;
the server owns movement speed, elapsed time, ammunition, damage, and world
changes. The shared world advances once per tick regardless of party size.
Personal events carry `playerId`; world events such as `door`, `relay`, `power`,
`checkpoint`, and `win` are shared. Arrival messages identify the receiving
operator and their actual starting zone once per fresh mission start.

## Equipment, damage, and checkpoints

Power, keys, doors, relays, permanent upgrades, discoveries, and endings are team
progress. A health expansion updates every operator's maximum health. A weapon
rack grants its ownership flag and starter ammunition to every operator once;
only the collector automatically equips it. Loose ammunition, health, and armor
belong to the collector and are consumed once. Expenditure and weapon selection
remain personal. Beneath The Shadow and Tomorrow start with a pistol; the other
co-op missions also provide the starting scattergun. Player body blocking is off.

Friendly fire defaults **on for Tomorrow** and **off for earlier missions**.
An optional boolean `friendlyFire` on room creation overrides that default; the
server validates and records it before play. There is no mid-run toggle command.
With friendly fire enabled:

- Direct fire, shotgun pellets, reflected carbine shots, and piercing lance
  shots can hit living teammates. Teammates are physical shot targets; they are
  never added to the enemy list or selected by aim assist.
- Teammate damage is half the weapon's base damage, rounded after scaling.
  Normal armor absorption applies, but the combat-difficulty damage multiplier
  does not. Null and arc shots do damage without giving players enemy-only
  suppression or stun state.
- Grenade teammate splash uses half the weapon's distance-adjusted blast damage
  and requires line of sight. The grenade retains its stable throwing `ownerId`.
  The thrower's existing self-splash is handled separately and is not applied
  twice. Downed teammates do not block shots or take additional friendly damage.
- A `friendly-fire` event has the shooter's `playerId`/`sourceId`, the victim's
  `targetId`, weapon, and impact coordinates. The victim's `hurt` event carries
  their `playerId`, `friendlyFire:true`, and `sourceId`. Friendly downs do not
  count as enemy kills. `friendlyHits` counts resolved friendly-damage hits.

One or more downed operators wait for a living teammate to activate a shared
checkpoint. Checkpoints revive downed operators near the activating player,
replenish supplies, and clear active projectiles, effects, and lingering fire
before capturing retry state. All operators down ends the attempt. The owner
may restore the team checkpoint or restart; all connected players then resume.
Checkpoint retry restores saved positions rather than selecting new arrivals.
Extraction or a chosen Tomorrow ending completes the run for the entire team.

## Tomorrow society and hazard state

Tomorrow includes these versioned state blocks in its live snapshots:

```text
tomorrowSociety: {
  version:1, clerkDisposition, clerkOutcome, warningRemaining
}
tomorrowHazards: {
  version:1, hatches:[{id,phase:'armed'|'warning'|'spent',remaining}]
}
```

Favors and evidence use the shared `interactables[].used` records. NPC and mimic
bodies remain in `enemies`, including role, faction, provocation, life and dormant
state. A player in a hatch chute has `jump.kind:'trap-drop'`, its authoritative
source/target and timing fields, and `elevation`. These are outputs from the
server, never client-authored commands. `networkSnapshot()` copies live hatch
warnings and drops; it does not apply solo-save normalization.

An authenticated `interact` can perform an available NPC favor once for the
team. The interacting operator pays any pistol-ammunition cost. Mara's cells
and Twice's shells/armor are awarded to every operator. Rook's help ends the
Warden–Unfiled opposition and activates two escorts. The server fixes the clerk's
disposition for the run, resolves the warning and betrayal, and applies evidence
that exposes the deception. Mara counts as one memory for Rewrite only while
helped, alive and loyal; two anchors plus Mara satisfy the three-memory gate,
with the other ending prerequisites still required.

The server resolves mimic proximity, inspection and weapon probes against actual
shots and occluding bodies. Hatches share one warning clock; only operators on
the footprint when it opens are dropped. Landing candidates account for other
operators and current threats. Drop damage is capped at ten health and never
takes the last hit point. Spent hatches, revealed mimics and NPC decisions are
retained through checkpoint retry; recovery clears interrupted drops.

World feedback includes `tomorrow-npc`, `tomorrow-betrayal`, `mimic-reveal`,
`trapdoor-warning` and `trapdoor-open`. Per-operator drop/landing and hurt feedback
carry `playerId`. The renderer consumes the shared state to select neutral or
hostile person art, concealed or revealed mimic art, and closed/warning/spent
hatch art; it does not advance these systems.

## Tomorrow arrivals and party size

Tomorrow exports `TOMORROW_WORLD_REVISION = 2`. Its three authored
`coopSpawnVariants` support a shared arrival, west/east pairs, or scattered
arrivals. The server selects `_runSeed % variants.length`, so the same run seed
restarts into the same layout. Starting positions have clear floor and routes to
the common exchange without late-game equipment. Each operator receives their
own identity, zone, rendezvous direction, and friendly-fire status at arrival.

Only Tomorrow applies `partyScale = 1 + 0.30 * (playerCount - 1)` to enemy current
and maximum health after difficulty scaling: 1.3 for two players, 1.6 for three,
and 1.9 for four. Warning durations, attack timing, movement, and damage tuning
are unchanged by party size. Checkpoint state retains the scaled values; a full
restart rebuilds and scales once. Existing missions keep `partyScale:1`.

## Connection and admission

Endpoint: `/ws`. The client derives it from its configured HTTP(S) co-op service
base, or the current origin on the standalone room service. Protocol **3** is
required on create and join, including authenticated reconnects. Protocol-2 tabs
receive `VERSION_MISMATCH` and must refresh.

A room has at most four stable slots (`p1`, `p2`, `p3`, `p4`). The server supplies
an unguessable reconnect token for each player; tokens never appear in invite
links or broadcast room records. New players can join only in the lobby. A
valid token restores a reserved slot in an existing run.

Create, join, and reconnect advertise `supportedMissions`, derived from local
`MISSIONS`. The requested mission must be included. Omission is accepted only
for Crosslink and The Underworks, and still requires protocol 3. Content revisions
are also checked before allocation, attachment, or replacement:

| Mission | Required request and room-record field |
| --- | --- |
| Beneath The Shadow | `shadowRevision:2` |
| The Wrong Side of Tomorrow | `tomorrowRevision:2` |
| Other supported missions | No mission-specific revision field |

The current client sends both revision fields on every handshake; each mission
validates the field relevant to it. Clients also reject unavailable missions or
mismatched room revisions before projecting a view. A protocol-3 client carrying
Tomorrow revision 1 must refresh before creating, joining or reconnecting to a
revision-2 room. This live admission rule is separate from the supported
revision-1-to-2 migration of browser-local solo saves.

## Messages

The following are message shapes; optional properties use `?` notation.

Client to server:

```text
{type:'create',protocol:3,name,mission,difficulty,supportedMissions,
 shadowRevision?,tomorrowRevision?,friendlyFire?}
{type:'join',protocol:3,roomId,name,supportedMissions,
 shadowRevision?,tomorrowRevision?,token?,replace?}
{type:'ready',ready:true}
{type:'start'}                         // owner; 2–4 players, everyone ready/connected
{type:'input',seq,forward,strafe,angle,fire,aimAssist?}
{type:'interact'}
{type:'weapon',weapon?}                // omitted: cycle; explicit: carried ID
{type:'menu',open:true|false}           // local menu; pause when all menus are open
{type:'pause',reason:'menu'|'background'|'network'}
{type:'resume'}                        // marks this operator ready to resume
{type:'restart',checkpoint:true|false} // owner only
{type:'leave'}
{type:'ping',sentAt}
```

The four combat difficulty IDs are `relaxed`, `standard`, `hard`, and `insane`.
Weapon selectors accept the eight `WEAPONS` IDs. Unknown or malformed selectors
return `INVALID_WEAPON`; a valid unowned selection leaves inventory unchanged.
Actions always belong to the authenticated socket, regardless of a supplied
`playerId`. A valid reconnect token with `replace:true` invalidates the previous
socket before attaching its replacement, so late input or close callbacks from
the old connection cannot control the reserved operator.

Server to client:

```text
{type:'welcome',protocol:3,roomId,selfId,ownerId,token,resumed}
{type:'room',room:{id,mission,difficulty,status,ownerId,players:[
  {id,name,connected,ready,menu}
],pauseReason,pauseKind,maxPlayers:4,friendlyFire,
shadowRevision?,tomorrowRevision?}}
{type:'state',tick,ackByPlayer:{p1:seq,p2:seq,p3?:seq,p4?:seq},state,events}
{type:'error',code,message}
{type:'closed',message}
{type:'pong',sentAt}
```

`ackByPlayer` includes only allocated players. Room status is `lobby`, `playing`,
`paused`, `dead`, or `won`. `pauseKind` is `menus`, `safety`, or `null`. Joining
or reconnecting to an existing simulation sends its current full state.

Simulation runs at 30 Hz; snapshots are sent at 10 Hz and immediately for
relevant room actions. Inputs expire after 300 ms. An accepted fire pulse survives
a release packet until the next simulation step, then is consumed once; it
expires independently of fresh movement packets. Pause, restart, and reconnect
clear pending controls.

An individual menu holds that operator's controls while others keep playing.
When all connected operators have menus open, the room pauses; one returning to
play resumes a menu-only pause. The co-op field map remains live. An explicit
pause, backgrounding, disconnect, or a 1.5-second input-stream stall instead
creates a safety pause requiring every allocated player to be connected and to
resume explicitly. A menu action cannot bypass a safety pause.

Disconnects reserve their slot for 60 seconds. Explicit Leave ends the private
room for everyone. Default limits are four simultaneous rooms, ten minutes of
inactivity outside active play, and two hours total room lifetime. Rooms are held
in process memory; service shutdown sends `closed` when possible.

## Client and renderer projection

The client keeps a `Game` view for read-only helpers. It copies the authoritative
snapshot directly, sets `view.state.player = view.state.players[selfId]` and
`view.state.localPlayerId = selfId`, and retains all player records. This same
state feeds WebGL and Canvas, including server-scaled enemy `maxHealth`.
`_stateFromSnapshot()` reconstructs solo saves and must not reconstruct room
state. Interaction and weapon changes travel over the socket.

Camera look responds immediately. The client predicts local movement with
collision, replays unacknowledged inputs, corrects from server acknowledgements,
and smooths remote positions. It never predicts damage, pickups, progression,
NPC disposition, mimic reveals or hatch outcomes. An authoritative jump/drop
clears pending local movement prediction until normal movement can resume.
The renderer shows the other operators with distinct numbers, colors, and downed
states. Personal feedback is filtered by `playerId`; world effects stay shared.

`breach-config.coopServer` is a full HTTP(S) service base or `same-origin`; an
empty value disables room entry. `?room=CODE` opens Join. Invites retain the
public game origin and include only the room ID. Reconnect tokens are kept in
sessionStorage per room and do not make a room durable across service restarts.

## Validation record

The 0.12.0 gate passed **457 JavaScript tests** and **three Python export tests**.
This includes real WebSocket transport checks and bounded four-player tests of
shared aid, hazard state, authority and recovery. Browser checks inspected the
actual software-renderer presentation. Automated GPU checks cover scene geometry
and artwork selection; no real GPU screenshot or physical-device performance
claim follows from them. This is a source and local validation record, not
confirmation of a live deployed 0.12.0 service. The health endpoint reports
`version:'0.12.0'`, `protocol:3` and `maxPlayersPerRoom:4` in this source version.
