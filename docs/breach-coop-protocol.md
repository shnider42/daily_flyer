# BREACH co-op implementation contract (0.7)

Private two-player rooms use a server-authoritative simulation over WebSocket.
Four of the seven solo missions support co-op: Crosslink (`crosslink-11`),
The Underworks (`underworks-13`), The Glasshouse (`glasshouse-17`), and The Hollow (`hollow-19`). Protocol
remains 2; the 0.7 client additionally advertises its locally supported mission
ids before joining the new map. Solo saves remain owned by the single-player
flow. Release details and current validation are in
[the Glasshouse notes](breach-glasshouse-07.md).

## Ownership

- `core.mjs` and the level modules own gameplay rules and authored geometry.
  `coop-core.mjs` applies independent player inputs to one shared world.
- `server/breach-rooms.mjs` authenticates player slots and validates room actions;
  `server/breach-server.mjs` supplies HTTP/WebSocket transport and tick scheduling.
- `coop-client.mjs` projects authoritative snapshots into the local `Game` view;
  `app.mjs`, `index.html`, and `style.css` own the interface.
- `renderer.mjs` draws players, projectiles and encounter state in WebGL and
  Canvas. `audio.mjs` consumes event feedback; neither changes simulation state.

## Shared simulation API

`coop-core.mjs` exports `CoopGame` with constructor
`new CoopGame({mission:'crosslink-11',difficulty:'standard',seed:1,players:['p1','p2']})`.
It exposes `level`, `options`, `state`, `start()`, `pause()`, `resume()`, `restart()`,
`restartCheckpoint()`, `update(dt, inputsByPlayerId)`, `interact(playerId)`,
`switchWeapon(playerId, weaponId?)`, `drainEvents()`, and `networkSnapshot()`.
An omitted weapon id cycles carried weapons. An explicit id selects only a
weapon returned by `ownedWeapons(player)`; it cannot grant equipment.

`state.players` is an object keyed by player ID. Each value includes normal
player fields plus `id`, `alive` and a personal `tutorial`. Weapon ids are
`pistol`, `shotgun`, `arc`, `ricochet`, and `grenade`. Ownership flags are
`hasShotgun`, `hasArc`, `hasRicochet`, and `hasGrenade`; ammunition keys are
`pistol`, `shells`, `cells`, `slugs`, and `grenades`. Use the exported `WEAPONS`
metadata and `ownedWeapons(player)` helper rather than a two-weapon toggle.
`state.player` may be an internal compatibility alias but is omitted from the
network snapshot.
`networkSnapshot()` returns a JSON-safe live state including players, enemies,
doors, pickups, interactables, projectiles, effects, power, secretFound, time,
kills, shots, hits, checkpoint, status. This is separate from solo save/restore.

Inputs use `{forward,strafe,angle,fire,aimAssist?}`. `angle` is an absolute facing angle;
the server owns movement speed, elapsed time, ammunition, damage, and all world
changes. Input consumption never runs the world more than once per server tick.
Personal events carry `playerId` (`shot`, `hit`, `kill`, `hurt`, `pickup`,
`death`/`downed`, `revive`).
Shared events such as `door`, `relay`, `power`, `checkpoint`, `win` remain shared.

Power, key, doors, relays, and Underworks upgrades are team progress. The
Underworks health expansion increases both players' maximum health. Each newly
collected weapon rack grants both operatives its ownership flag and that rack's
starter ammunition once. The collector equips it; the teammate's selection stays
unchanged. This rule applies to every co-op mission, including the original
scattergun pickups in Crosslink and The Underworks. Both players still begin
with pistol and scattergun, so those pickups add shells to both inventories.
Loose ammunition, health and armor go only to their collector and are consumed
once. Ammunition expenditure and equipped weapons remain personal. Friendly fire
and player body blocking are off. One downed player waits for the next shared
checkpoint, which revives the team; both down ends the attempt and exposes a
shared checkpoint retry. Extraction completes for the team.

The Underworks adds shared `upgrades: {cutter,insulator,phase}` and `healthBonus`
state. Refuge and transit discovery uses interactable `used` flags. Refuges are
repeatable checkpoints after nearby enemies are cleared; transit moves only the
operative who activated it. See [The Underworks](breach-underworks.md).

Grenades retain the throwing player's stable `ownerId` through their fuse and
bounces. Enemy damage and kills are attributed to that owner; splash can hurt
the thrower but never the other operative. World snapshots include active
grenades and transient ricochet/explosion effects. Shared `explosion` events
include `ownerId`; personal `hit`, `kill`, and `hurt` events retain `playerId`.
Team checkpoint creation clears projectiles and effects before saving the
shared retry state. Solo saves use their separate validated grenade format.

Bulwark shields and mender healing also run on the server. Snapshots carry
shield facing/phase and healing telegraphs with stable target ids. Clients draw
those fields and the corresponding interruption/impact effects; they do not
resolve shield damage, healing, grenade travel or splash independently.

## Connection and messages

Endpoint: `/ws`. Client connects using the configured co-op service URL (convert
https to wss), or current origin on the standalone room service. Protocol is 2.
Maximum two players per room. IDs are `p1`/`p2`; the server returns unguessable
reconnect tokens, never included in invite links or broadcast room records.

The client sends `supportedMissions`, an array derived from its local `MISSIONS`,
on create, join and reconnect. It must include the requested room mission.
For backward compatibility, omission is accepted for Crosslink and The
Underworks only. Glasshouse requests without support return `VERSION_MISMATCH`
before a room is created or a player is attached, including token-based rejoin.
The client also rejects a room whose mission is absent from its local level data.

Client -> server:

```
{type:'create',protocol:2,name,mission:'glasshouse-17',difficulty:'standard',supportedMissions}
{type:'join',protocol:2,roomId,name,supportedMissions,token?,replace?}
{type:'ready',ready:true}
{type:'start'}                         // owner only; both ready and connected
{type:'input',seq,forward,strafe,angle,fire,aimAssist?}
{type:'interact'}
{type:'weapon',weapon?}                // omitted: cycle; explicit: carried id
{type:'pause',reason:'menu'|'background'|'network'}
{type:'resume'}                        // marks this player ready to resume
{type:'restart',checkpoint:true}       // owner only
{type:'leave'}
{type:'ping',sentAt}
```

`weapon` accepts one of the five `WEAPONS` ids. Unknown or malformed selectors
return `INVALID_WEAPON`; a valid but unowned weapon leaves the inventory and
selection unchanged. Actions always use the authenticated socket's player id,
regardless of any client-supplied `playerId`. The old `{type:'weapon'}` command
continues to cycle. A reconnect may send `replace:true` with its valid token to
replace the previous socket without abandoning the room.

Server -> client:

```
{type:'welcome',protocol:2,roomId,selfId,ownerId,token,resumed}
{type:'room',room:{id,mission,difficulty,status,ownerId,players:[
  {id,name,connected,ready}
],pauseReason,maxPlayers:2}}
{type:'state',tick,ackByPlayer:{p1:seq,p2:seq},state,events}
{type:'error',code,message}             // human-readable error; code sets recovery
{type:'closed',message}                 // room ended; return to room UI
{type:'pong',sentAt}
```

Room status is `lobby`, `playing`, `paused`, `dead`, or `won`. State status uses
the existing core values. Initial join sends the current full state. Simulation
is fixed at 30 Hz; snapshots at 10 Hz with per-message compression. Inputs expire
after 300 ms. Client sends a regular held-input stream, independent of change.
An accepted fire pulse survives a later release packet until the next simulation
step, where it is consumed once. The pulse expires after 300 ms independently of
fresh movement packets, and pause, restart or reconnection clears it.
Room pauses deliberately when either player pauses, backgrounds, or disconnects;
an input-stream stall of 1.5 seconds also pauses the room. Both connected players
must Resume. Disconnects reserve the slot for 60 seconds.
Explicit Leave ends the private room, with an explanation to the other player.
Rooms live in process memory and expire; service shutdown sends `closed`.

## Client and renderer projection

The client keeps a `Game` view for existing read-only helpers and renders the
latest room snapshot. Set `view.state.player = view.state.players[selfId]` and
`view.state.localPlayerId = selfId`; keep `view.state.players` available.
Send interaction/weapon requests over the socket instead of local mutations.
`CoopClient.weapon(id?)` forwards an exact selection or the legacy cycle command;
weapon buttons and hotkeys wait for authoritative state to show the selection.
Local camera look responds immediately. Smooth remote positions between snapshots
and predict local movement with collision, correcting from acknowledged inputs.
Do not feed received state through solo `restore()`.

Renderer draws operatives other than `localPlayerId`, with distinct teammate
colors and downed states. Local camera/weapon use `state.player`. The app filters personal
events for local damage flashes, recoil, tutorial, and pickup feedback. Room
messages show teammate status and explain pause/reconnect/room expiration.

Configuration: `breach-config.coopServer` contains the full HTTP(S) base URL for
the room service, or `same-origin`. An empty value hides/disables room entry until
the service is configured. `?room=CODE` opens Join. Invites retain the public game
origin and include only the room ID. Reconnect tokens use sessionStorage per room.

Hollow uses the same protocol and required supported-mission handshake. Routing
cabinet `used` and door `open` values, containment definitions, enemy `contained`
feedback and record discovery are included in the shared snapshot. No new
network command or client-side field simulation is required.
