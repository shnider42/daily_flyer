# BREACH private co-op

Version 0.7 offers private two-player rooms for three of the six solo missions:
Crosslink, a compact operation; The Underworks, a large exploration mission; and
The Glasshouse, a connected conservatory with new weapons and enemy roles.
Blacksite 07, Dead Relay, and Switchyard remain solo missions. See
[the Glasshouse update](breach-glasshouse-07.md) for release details and current
validation.

## Play together

Open Play with a friend, enter a display name, and create a room. Copy its invite
link to the second player. Both players select Ready, then the creator starts.
The room creator chooses Crosslink, The Underworks, or The Glasshouse. The two
players can use different control schemes and personal graphics/guidance
settings; the room creator selects the shared combat difficulty.

Keys, power, doors, relays, and extraction belong to the team. Both operatives
begin with a pistol and scattergun. Collecting a weapon rack equips both
inventories with that weapon and its starter ammunition once; only the collector
automatically switches to it. This also applies to the existing scattergun
pickups in Crosslink and The Underworks, which add shells to both inventories.
Loose ammunition, health and armor are collected once by the operative who takes
them. Each player spends their own ammunition and chooses their own weapon.
Friendly fire and teammate body blocking are disabled.

The Glasshouse adds the Rebound carbine and Thumper to the pistol, scattergun and
Arc caster arsenal. Rebound slugs reflect once from solid walls and stop at closed
doors. Thumper grenades bounce before their fuse expires; walls block splash.
Your grenade can hurt you but cannot hurt your teammate. Both new weapons require
deliberate firing. Select a carried weapon with its bottom inventory button or
desktop keys 1–5; Q and the mouse wheel still cycle carried weapons. Co-op confirms
each selection on the server, independently for each operative.

One downed operative waits until the surviving teammate activates the next team
checkpoint. A checkpoint revives downed teammates and replenishes supplies. If
both operatives fall, the creator can retry the team checkpoint or restart.

In The Underworks, upgrades unlock routes for both players, refuges can be reused
once nearby threats are cleared, and discovered transit pairs move only the
player using them. The expanded exploration map pauses the team; both players
resume when they are ready. See [The Underworks guide](breach-underworks.md).

In The Glasshouse, the two cultivation wings reconnect at the north gallery.
Bulwarks reduce damage from their covered front; flanking and their visible open
phase give better shots. Menders heal other living infestation creatures, with a
visible windup that damage can interrupt. Shields, healing, grenades and their
effects are shared server state, so both players see the same encounter.

Pausing or backgrounding the game deliberately pauses the room. Both players
must resume. A disconnected player has 60 seconds to reconnect with their
browser's session token. Invites contain only the room ID, never the reconnect
token. Explicitly leaving ends the private room for both players.

Clients advertise which missions their installed game assets support. Older
protocol-2 clients can still use Crosslink and The Underworks; Glasshouse requires
a client that advertises the new mission. A stale client receives a refresh
message before joining, including when reconnecting to an existing Glasshouse
room. This prevents loading a different facility's geometry into the shared run.

## Session limits

Rooms are held in server memory. A service deployment or restart ends active
rooms, with an explanation sent to connected players when possible. Rooms expire
after ten minutes of inactivity or two hours of total lifetime. The default
server limit is four simultaneous rooms. Reconnecting restores a room only
while that server process still has it.

Co-op does not use or overwrite the single-player save slot. A room is a shared
live session, not a cloud copy of a solo checkpoint. Display names are temporary;
there are no accounts or public room listings.

## Build and run

Node 22+ and Python 3.10+ are required for the combined room service. The browser
client still uses static ES modules; the room service's only npm dependency is
the pinned `ws` package. The existing Python exporter uses only the standard
library and the DFE theme contract.

```sh
npm ci --ignore-scripts
python3 scripts/build_breach.py
npm start
```

`npm run dev` exports the game then starts the same service, including WebSocket
rooms. Its default local port is 4173; `PORT` or `--port` chooses another port.
The service binds `0.0.0.0`. `/health` reports readiness and aggregate room counts.

The server serves `dist_breach` and injects `coopServer: "same-origin"` into its
game configuration. For an independently hosted static client, set the build
environment variable `BREACH_COOP_SERVER` to the room service's HTTPS URL. The
client derives the secure WebSocket endpoint `/ws` from that URL.

Render room-service configuration:

- Runtime: Node
- Repository: `shnider42/daily_flyer`
- Branch: `feat/breach-fps`
- Build: `npm ci --omit=dev --ignore-scripts && python3 scripts/build_breach.py`
- Start: `node server/breach-server.mjs`
- Environment: `NODE_VERSION=24`, `SKIP_INSTALL_DEPS=true`
- Environment: `BREACH_ALLOWED_ORIGINS=https://dfe-breach.onrender.com`
- Environment: `BREACH_MAX_ROOMS=4`
- One service instance; shared storage/room routing is required before scaling
  to several instances.

The initial sandbox can use Render's free compute plan. An idle free service
needs time to wake on a new connection; the client explains this and allows the
initial connection up to about 90 seconds. Paid compute can remove idle sleep
later if playtesting warrants it.

## Architecture and validation

`server/breach-rooms.mjs` owns room membership, ready/start/pause/resume, expiry,
input validation, and reconnect reservations. `server/breach-server.mjs` supplies
HTTP and WebSocket transport, origin checks, bounded message rates/sizes,
heartbeats, compression, and graceful shutdown.

The server advances `CoopGame` at 30 Hz and sends live state at 10 Hz. Browsers
predict local movement and smooth teammate motion; the server controls combat,
collisions, supply awards, and progression. Input expires after 300 ms without
fresh messages, and a 1.5-second control-stream stall pauses the room. Personal
events identify their player so a teammate's shot does
not recoil the local weapon or flash the local damage indicator.
Grenade hits and kills keep the throwing player's identity through delayed
detonation; explosion visuals are shared. Team checkpoints clear active
projectiles and effects before capturing the retry state.

See [the protocol](breach-coop-protocol.md) for exact messages and simulation API.
Run the focused suites with:

```sh
npm run test:breach
python -m unittest discover -s tests -p test_breach_export.py
```

For the 0.7 release's test commands, results and remaining checks, use
[the Glasshouse validation record](breach-glasshouse-07.md). This guide describes
the implemented contract and does not assert that CI or live checks have finished.

Real-device testing should pair a desktop and a phone on separate networks.
Exercise both relays, a contested pickup, individual and team deaths, a phone
background/return, a brief network interruption, checkpoint retry, and extraction.
Check smoothness and response time separately from shared-state correctness.
