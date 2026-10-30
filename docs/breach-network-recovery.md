# BREACH 0.4.1 — connection recovery

This patch improves intermittent connections; it does not establish that Wi-Fi
caused a particular playtest failure. It changes no mission layouts or combat
rules and does not change the Render compute plan.

## What players see

The teammate HUD now includes a server round-trip indicator. Room and pause
screens show round-trip time and its variation. These are application-level
connection measurements, not Wi-Fi signal strength or a packet-loss estimate.
Pause offers **Reconnect without leaving**, which keeps the player identity and
live room instead of sending the room-ending Leave command.

When live updates stop for about 1.2 seconds, the client stops held input,
requests a shared pause, and displays the interruption. After about 4.5 seconds
without replies (or live snapshots while the room claims to be playing), it
replaces the connection and authenticates back into the same player slot. A
shorter interruption can recover on the existing socket; the team remains
paused until both players choose Resume. Background pages do not reconnect in a
loop. Returning to the page or receiving an online event checks the connection.

## Networking details

A per-player reconnect token plus an explicit `replace: true` flag allows the
server to replace an old, apparently-open socket. The token is validated first;
room codes alone never authorize eviction. The old peer is detached before the
new peer is attached. Old inputs, delayed messages, error events, and close
callbacks cannot act on the replacement. Ordinary duplicate joins without the
flag still receive ALREADY_CONNECTED. This is an additive protocol-2 extension.

Movement prediction retains up to 1.5 seconds of input rather than 36 render
frames. At 240 Hz the old limit retained only 0.15 seconds, causing large backward
corrections when delayed snapshots arrived. Reconciliation distinguishes a true
authoritative teleport/restart from ordinary lag behind locally predicted motion.
Input sends are skipped when more than 8 KiB is already queued, instead of
continuing to add stale movement. The server still owns damage and progression,
stops stale controls after 300 ms, and pauses for a stalled control stream.

## Limits

Both users should reload after this deployment, then create a fresh test room.
Deployments and server restarts still end in-memory rooms. A disconnect reservation
still lasts 60 seconds, idle rooms 10 minutes, and total room lifetime two hours.
This is not durable cloud saving and cannot recover a room that no longer exists.
High latency, congested wireless links, and device rendering performance still
need real-device testing. No hosting upgrade was made.

## Checks

Run `npm run test:breach` and the Python export suite. The focused recovery suite
adds one-way timeout, authenticated replacement, stale old-socket events,
backpressure, 30/60/120/240 Hz prediction, and diagnostics checks. The browser
integration script `scripts/breach-network-browser.mjs` uses a local WebSocket
proxy to mute replies while deliberately leaving the upstream socket open,
then exercises both automatic and manual reconnect with a second network client.
It checks the same Underworks run, activated transit, shared pause, and cleanup.
