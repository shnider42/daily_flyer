# Private hockey rooms

The Flask blueprint in `daily_flyer/sports_rooms.py` lazily starts `worker.mjs`
as a child process. That worker runs the same JavaScript `Match` engine as solo
hockey at 60 simulation steps per second. JSON-line RPC stays on private process
pipes; it does not expose another listening port. Render's native runtimes,
including Python, provide Node during both build and runtime:
<https://render.com/docs/native-runtimes>.

## Deployment boundary

Use the existing **one Gunicorn worker, four threads, one service instance**
deployment. The bridge serializes RPC calls across its threads. Rooms live in
that worker's memory, so deploying or restarting the service ends them. Scaling
Gunicorn to multiple workers or the service to multiple instances requires a
shared room authority and routing; it is not supported by this implementation.
No extra Python/npm dependency or separately billed service is required.

The default limit is eight rooms, each with up to four seats. Set
`HOCKEY_MAX_ROOMS` only after load testing; accepted values are 1–16. Room codes
are invitations to the lobby, not reconnect credentials. Each seat also has a
private random token stored in that browser tab's session storage. The token is
sent in POST bodies and never appears in public room or game snapshots.

## Supported play

Each side can have one controller that switches between available skaters,
plus controllers locked to individual skaters. Two or more skater locks can
cooperate against AI, play on opposing teams, or mix with team controllers.
Human-controlled skaters are exclusive, and goalkeepers remain AI-controlled.
The host starts after at least two players have joined and everybody is ready.

Clients poll combined input/snapshot requests up to 13 times per second. Only
bounded movement, held-button state, and sequenced action names reach the
simulation. The authority owns puck contact, scoring, penalties, fight timing,
and charge duration. Clients predict their own skater's movement and reconcile
with acknowledged snapshots; other movement is smoothed. They never advance
match logic or author puck possession. Round-trip time is available in the HUD.

Movement and holds expire after 350 ms without fresh input. After a connection
has stalled for three seconds, play pauses for everybody. A disconnected seat
is reserved for 60 seconds, with its token required for reconnecting. Everyone
must explicitly resume before play continues. Leaving a running match ends the
room; leaving its lobby transfers host to the next player. Idle and abandoned
rooms are pruned, and all rooms have a two-hour lifetime limit.

## API

- `GET /api/v1/hockey/rooms/health`: protocol, engine version, capacity, authority.
- `POST /api/v1/hockey/rooms/create`: `homeTeamId`, `awayTeamId`, `difficulty`,
  `duration`, and optional seat `name`, `side`, `mode`, `playerId`.
- `POST /api/v1/hockey/rooms/join`: `code`, optional `name`/seat configuration;
  include the private `token` to reconnect to an existing seat.
- `POST /api/v1/hockey/rooms/<code>`: private `token` plus `op` of `configure`,
  `ready`, `start`, `pause`, `resume`, `leave`, or `poll`.
- `poll` sends an increasing input `seq`, `input`, and optional sequenced
  `actions`. Responses carry `ack` (last simulated input), `actionAck`,
  `replySeq`, `tick`, the public `room`, and the full authoritative `state`.

`HockeyNetwork` in the browser wraps that API and hydrates a renderable Match
without running client game logic. `onUpdate` receives
`{room, game, seatId, rtt, connected}`. Call `setInput()` and `step(dt)` from the
render loop; call `clearInput()` on focus loss and menu interruptions.

## Regression checks

```sh
node --test tests/pocket-sports/hockey-network.test.mjs
python -m unittest discover -s tests -p test_hockey_rooms.py -v
```

The Python tests include a real subprocess handshake and shared match startup,
as well as HTTP validation. The Node tests cover room combinations, token
privacy, bounds, input/action replay, charging, pauses, reconnects, and client
prediction/reconciliation boundaries.
