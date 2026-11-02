# PGI private 1v1

This optional service runs the existing PGI game with one human on each team. The
Flask `/gridiron/` route still runs solo locally and never opens a room connection.

Run with Node 22 or later:

```sh
npm ci --prefix server/pgi
node server/pgi/server.mjs
```

Open `http://localhost:4173` in two separate browsers. Create a room, share its
invite, and have both players choose Ready. The host chooses the two teams and
match length; the guest plays the away team. Both call their own plays. The
offense snaps after both calls are set, while the defense can select and move a
defender. Kicks, turnovers and penalty decisions belong to the appropriate team.

The server runs the shared game at 30 Hz and sends snapshots at 15 Hz. Clients
predict their own movement, reconcile acknowledged inputs, and ease remote
players toward authoritative positions. Prediction history is time-bounded to
1.5 seconds, independent of screen refresh rate. Scores, catches, collisions and
the game clock remain server decisions.

Held controls expire after 300 ms without a fresh input. A stalled connection
pauses the shared match after 1.5 seconds. Reconnecting requires the private pass
kept in that tab's session storage; the player's place is reserved for 60 seconds.
Both players choose Resume. Rooms exist in memory and end on service restart.
Deploy as one instance, with no database or sticky-session assumptions.

Pregame and halftime are shared breaks, capped at 45 seconds when both players
are connected. Live instant replays are disabled in 1v1; the halftime and
postgame highlight reels remain available. A 25-second play clock supplies
missing calls and snaps to keep a match moving. Online lineups use the bundled
roster; solo roster choices, settings and AI difficulty remain unchanged.

Render: Node runtime, free plan, build
`npm ci --prefix server/pgi --omit=dev --ignore-scripts`, start
`node server/pgi/server.mjs`. Set `NODE_VERSION=24` and `SKIP_INSTALL_DEPS=true`.
`PORT` is provided by Render. Optional `PGI_DUEL_MAX_ROOMS` defaults to 4;
`PGI_DUEL_ALLOWED_ORIGINS` accepts comma-separated additional browser origins.
`GET /health` reports readiness and room capacity without exposing room codes.

Validation: `node --test tests/gridiron/*.test.mjs` and
`python -m unittest tests.test_pocket_gridiron`.
