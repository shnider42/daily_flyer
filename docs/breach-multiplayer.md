# BREACH private co-op — 0.11.0

Private co-op supports **two to four players** across six missions. Blacksite 07,
Dead Relay, and Switchyard remain solo missions.

| Mission | Co-op focus | Default friendly fire |
| --- | --- | --- |
| Crosslink | Compact power-and-relay operation | Off |
| The Underworks | Exploration, permanent upgrades, refuges, and transit | Off |
| The Glasshouse | Connected conservatory, bank shots, shields, and healers | Off |
| The Hollow | Containment routing, long loops, and field records | Off |
| Beneath The Shadow | Buried-city expedition, earned weapons, puzzles, and multiple bosses | Off |
| The Wrong Side of Tomorrow | Strange arrivals, changing door destinations, and three endings | **On** |

## Play together

Open **Play with friends**, enter a display name, and create a room. Share its
invite with up to three other players. A team can start with two, three, or four
operators: everyone currently in the room selects Ready, then the creator
starts. The creator chooses the mission and combat difficulty, including
**Insane in the Membrane**. Controls, graphics, guidance, and weapon selections
remain personal.

Each operator has a persistent number from P1 to P4 and a distinct marker color.
The roster shows every teammate. Invites contain only the room ID; each player's
private reconnect pass stays in their browser session.

Keys, power, doors, relays, permanent upgrades, discoveries, and the mission's
ending belong to the team. A weapon rack supplies every operator with that
weapon and its starter ammunition once; only its collector automatically equips
it. Loose ammunition, health, and armor are consumed once by whoever picks them
up. Each operator spends their own ammunition.

Beneath The Shadow and Tomorrow start with the pistol and require the team to
find the heavier weapons. Earlier co-op missions also provide the starting
scattergun. The current arsenal includes the pistol, Scattergun, Arc caster,
Rebound carbine, Thumper, Rivet repeater, Null projector, and Breach lance. Use
the bottom inventory buttons or desktop weapon keys for carried weapons; Q and
the mouse wheel still cycle. The server confirms each operator's selection.

## Tomorrow: arrivals, pressure, and endings

A new Tomorrow room may place the team together, on two separated arrival
platforms, or at scattered entrances. These are authored starting positions,
with open routes toward the central exchange. Each player receives a brief
arrival message identifying their operator number and actual zone. Follow the
signs and numbered teammate markers to reunite. Retrying a checkpoint restores
that checkpoint's positions; a full restart uses the same seeded arrival layout.

Enemy health responds modestly to party size in this mission: 1.3 times the
selected difficulty's health for two players, 1.6 for three, and 1.9 for four.
Additional players do not shorten attack warnings or increase enemy damage or
movement speed. Earlier missions retain their existing tuning.

The Cinder Sower, Tether Widow, Glass Skimmer, and Lantern Maw all appear in the
new mission. Their warnings and counters carry over from Beneath The Shadow.
Doors can change destinations as the registers are restored; room signs and
interaction prompts show the current route. The main mission remains possible
alone, and no simultaneous partner-only switch is required.

Reconnect the names and hours registers to print the departure pass. The team
can escape, continue to defeat the guardian and seal the anomaly, or recover the
three memories and complete the restoration ending. A terminal's prompt explains
its commitment; activating an ending completes the shared run for everyone.

## Friendly fire

Tomorrow enables friendly fire by default. Earlier missions keep it disabled.
The room summary and in-game badge show the active rule; operator numbers and
colors identify real teammates even in the stranger environments.

Friendly bullets, shotgun pellets, bank shots, lance shots, and grenade splash
can injure teammates. Friendly damage is **50% of normal weapon damage**, with
normal armor absorption and no additional combat-difficulty multiplier. Grenade
splash falls off with distance, and walls block it. The thrower's existing
self-damage remains separate. Null and Arc hits hurt teammates but do not give
them the suppression or stun effects used for enemies.

A teammate in front of an enemy can stop a direct shot; the lance can pierce
multiple bodies. Aim assist never targets teammates, and optional automatic fire
holds when an ally is in its firing lane. Manual firing remains your decision.
A friendly hit warns the shooter and identifies the injured operator. Player
body blocking remains disabled, so teammates can pass each other in narrow paths.

## Downed players, checkpoints, and pause

A downed operator waits until a surviving teammate activates a shared checkpoint
or safe refuge. The checkpoint revives downed operators near its activating
player and replenishes team supplies. If everyone falls, the room creator can
retry the checkpoint or restart the mission. Checkpoint retries restore
positions and supplies while retaining the permanent progress defined by the
mission. After a
shared retry, everyone explicitly resumes.

Transit and fold doors move the operator who uses them. Shared doors, shutters,
puzzles, and ending decisions use one authoritative world. In the older maps,
this includes Underworks upgrades, Glasshouse shields and healing, Hollow
containment routing, and the Shadow's earned weapons and crossing puzzles.

The co-op field map stays **live**. Opening a personal menu holds that player's
controls while the others continue; when everyone has a menu open, the room
pauses. Returning from one menu resumes this menu-only pause. An explicit team
pause, backgrounding the app, a connection loss, or a stale control stream
instead pauses the room for safety. Every allocated operator must be connected
and select Resume before that pause ends.

A disconnected player has 60 seconds to reconnect to the same reserved identity.
The reconnect action keeps the room instead of leaving it, and a replacement
connection invalidates the old socket. Explicitly leaving ends the private room
for the whole team.

## Versions and session limits

The room service and browser use **protocol 3**. Refresh old tabs before joining;
protocol-2 tabs receive a version-mismatch explanation. Clients advertise their
available missions, and mission-specific revisions must also match: Beneath The
Shadow uses revision 2, and Tomorrow uses revision 1. The checks apply before
creating, joining, or replacing a connection to an existing room.

Rooms live in server memory. A deployment or service restart ends active rooms,
with an explanation sent to connected players when possible. Defaults are four
simultaneous rooms, ten minutes of inactivity outside active play, and two hours
total room lifetime. A reconnect works only while the same server process still
holds the room. An idle room service may take time to wake; the client explains
this during the initial connection attempt.

Co-op does not use or overwrite the single-player save slot. Display names are
temporary; there are no accounts or public room listings.

## Build and run

The combined service uses Node 22+ and Python 3.10+. The browser uses static ES
modules; the room service's only npm dependency is the pinned `ws` package. The
Python exporter uses the standard library and DFE's theme contract.

```sh
npm ci --ignore-scripts
python3 scripts/build_breach.py
npm start
```

`npm run dev` exports the game and starts the service. Its default local port is
4173; `PORT` or `--port` selects another port. The service binds `0.0.0.0`.
`/health` reports readiness, v0.11.0, protocol 3, aggregate room counts, and
`maxPlayersPerRoom:4`.

The service serves `dist_breach` and injects `coopServer:"same-origin"` into its
game configuration. For an independent static client, set `BREACH_COOP_SERVER`
to the room service's HTTPS URL at build time. The client derives `/ws` from it.

Existing Render deployment pattern:

- Runtime: Node; repository `shnider42/daily_flyer`; branch `feat/breach-fps`.
- Build: `npm ci --omit=dev --ignore-scripts && python3 scripts/build_breach.py`.
- Start: `node server/breach-server.mjs`.
- Environment: `NODE_VERSION=24`, `SKIP_INSTALL_DEPS=true`.
- Environment: `BREACH_ALLOWED_ORIGINS=https://dfe-breach.onrender.com`.
- Environment: `BREACH_MAX_ROOMS=4`.
- One service instance; persistent shared room state and routing would be needed
  before distributing the same rooms across several instances.

## Architecture and validation

`server/breach-rooms.mjs` owns membership, readiness, pause/resume, expiry, input
validation, and reconnect reservations. `server/breach-server.mjs` supplies HTTP
and WebSocket transport, origin checks, bounded messages, heartbeats, compression,
and shutdown handling. See [the protocol](breach-coop-protocol.md) for the exact
message shapes and simulation API.

The server advances `CoopGame` at 30 Hz and sends snapshots at 10 Hz. Browsers
predict local movement and smooth teammate motion; damage, collisions, supply
awards, and progression remain authoritative. Inputs expire after 300 ms, and a
1.5-second control-stream stall pauses the room. Feedback events identify their
player so another operator's shot does not recoil the local weapon. Grenade
attribution survives delayed detonation. Network snapshots retain scaled enemy
health and maximum health for both WebGL and software rendering.

Relevant checks include the four-player and real WebSocket suites:

```sh
node tests/breach-four-player.test.mjs
node tests/breach-server.test.mjs
npm run test:breach
python -m unittest discover -s tests -p test_breach_export.py
```

Automated checks exercise two-, three-, and four-player starts, a rejected fifth
player, friendly damage and cover, each arrival variant, shared checkpoints,
identity-preserving reconnects, and client projection. They do not establish
physical iPhone performance. Device playtesting should include separate networks,
split arrivals, contested supplies, friendly downs, background/return, a brief
connection interruption, checkpoint retry, and an ending. Assess response time
and visual smoothness separately from shared-state correctness.
