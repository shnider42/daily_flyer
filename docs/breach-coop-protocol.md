# BREACH co-op implementation contract (0.3)

The first release uses private two-player rooms and a server-authoritative
simulation over WebSocket. The compact third mission is Crosslink (`crosslink-11`).
Solo saves remain owned by the existing single-player flow.

## Ownership

- Core: `core.mjs`, new `coop-core.mjs`, gameplay tests; Crosslink level data.
- Interface: `app.mjs`, new `coop-client.mjs`, `index.html`, `style.css`.
- Renderer: `renderer.mjs` only; teammate visuals in WebGL and Canvas.
- Root: room server, package/build configuration, protocol, integration tests,
  documentation, publication and QA.

## Shared simulation API

`coop-core.mjs` exports `CoopGame` with constructor
`new CoopGame({mission:'crosslink-11',difficulty:'standard',seed:1,players:['p1','p2']})`.
It exposes `level`, `options`, `state`, `start()`, `pause()`, `resume()`, `restart()`,
`restartCheckpoint()`, `update(dt, inputsByPlayerId)`, `interact(playerId)`,
`switchWeapon(playerId)`, `drainEvents()`, and `networkSnapshot()`.

`state.players` is an object keyed by player ID. Each value includes normal
player fields plus `id`, `alive` and a personal `tutorial`. `state.player` may be
an internal compatibility alias but is omitted from the network snapshot.
`networkSnapshot()` returns a JSON-safe live state including players, enemies,
doors, pickups, interactables, projectiles, effects, power, secretFound, time,
kills, shots, hits, checkpoint, status. This is separate from solo save/restore.

Inputs use `{forward,strafe,angle,fire,aimAssist?}`. `angle` is an absolute facing angle;
the server owns movement speed, elapsed time, ammunition, damage, and all world
changes. Input consumption never runs the world more than once per server tick.
Personal events carry `playerId` (`shot`, `hit`, `hurt`, `pickup`, `death`/`downed`).
Shared events such as `door`, `relay`, `power`, `checkpoint`, `win` remain shared.

Power, key, doors, and relays are team progress. Health/ammo/weapons are personal;
pickups are awarded once. Both players begin with pistol and scattergun in co-op
so the original single weapon pickup cannot lock out a teammate. Friendly fire
and player body blocking are off. One downed player waits for the next shared
checkpoint, which revives the team; both down ends the attempt and exposes a
shared checkpoint retry. Extraction completes for the team.

## Connection and messages

Endpoint: `/ws`. Client connects using the configured co-op service URL (convert
https to wss), or current origin on the standalone room service. Protocol is 1.
Maximum two players per room. IDs are `p1`/`p2`; the server returns unguessable
reconnect tokens, never included in invite links or broadcast room records.

Client -> server:

```
{type:'create',protocol:1,name,mission:'crosslink-11',difficulty:'standard'}
{type:'join',protocol:1,roomId,name,token?}
{type:'ready',ready:true}
{type:'start'}                         // owner only; both ready and connected
{type:'input',seq,forward,strafe,angle,fire,aimAssist?}
{type:'interact'}
{type:'weapon'}
{type:'pause',reason:'menu'|'background'}
{type:'resume'}                        // marks this player ready to resume
{type:'restart',checkpoint:true}       // owner only
{type:'leave'}
{type:'ping',sentAt}
```

Server -> client:

```
{type:'welcome',protocol:1,roomId,selfId,ownerId,token}
{type:'room',room:{id,mission,difficulty,status,ownerId,players:[
  {id,name,connected,ready}
],pauseReason,maxPlayers:2}}
{type:'state',tick,ackByPlayer:{p1:seq,p2:seq},state,events}
{type:'error',code,message}             // human-readable recoverable error
{type:'closed',message}                 // room ended; return to room UI
{type:'pong',sentAt}
```

Room status is `lobby`, `playing`, `paused`, `dead`, or `won`. State status uses
the existing core values. Initial join sends the current full state. Simulation
is fixed at 30 Hz; snapshots at 10 Hz with per-message compression. Inputs expire
after 300 ms. Client sends a regular held-input stream, independent of change.
Room pauses deliberately when either player pauses, backgrounds, or disconnects;
all connected players must Resume. Disconnects reserve the slot for 60 seconds.
Explicit Leave ends the private room, with an explanation to the other player.
Rooms live in process memory and expire; service shutdown sends `closed`.

## Client and renderer projection

The client keeps a `Game` view for existing read-only helpers and renders the
latest room snapshot. Set `view.state.player = view.state.players[selfId]` and
`view.state.localPlayerId = selfId`; keep `view.state.players` available.
Send interaction/weapon requests over the socket instead of local mutations.
Local camera look responds immediately. Smooth remote positions between snapshots
and predict local movement with collision, correcting from acknowledged inputs.
Do not feed received state through solo `restore()`.

Renderer draws all living players other than `localPlayerId`, with distinct
teammate colors. Local camera/weapon use `state.player`. The app filters personal
events for local damage flashes, recoil, tutorial, and pickup feedback. Room
messages show teammate status and explain pause/reconnect/room expiration.

Configuration: `breach-config.coopServer` contains the full HTTP(S) base URL for
the room service, or `same-origin`. An empty value hides/disables room entry until
the service is configured. `?room=CODE` opens Join. Invites retain the public game
origin and include only the room ID. Reconnect tokens use sessionStorage per room.
