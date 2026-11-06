# LOCKSTEP

A standalone DailyFlyer prison escape: three wings, nine explorable room scenes, single-player local saves, and private teams of up to four. All mechanics are visual; this release has no audio dependency.

## Run

```sh
node games/lockstep/server.mjs
```

The server listens on `0.0.0.0:$PORT` (3000 by default), serves `public/`, exposes `/health`, and upgrades `/ws` for co-op. `--port` also works for development previews. No package installation or asset build is required; the pinned WebSocket implementation and its license are included under `vendor/ws/`.

## Verify

```sh
node --test games/lockstep/tests/*.test.mjs
```

Tests exercise a full legal campaign, visual clue consistency, impossible actions, fair red herrings, per-level hint limits, two physical conduit solutions, four real network clients, capacity, shared progress, reconnect identity and duplicate-action recovery.

## Implementation

- `public/world.mjs`: serializable state, level definitions, legal actions, contextual hints, visible surveillance clock, conduit connectivity. Browser and server share the same rules.
- `public/art.js`: responsive procedural isometric room renderer. Nine environments, no external graphics or GPU dependency, pixel ratio capped at 1.6.
- `public/app.js`: room inspection, visual clue panels, tactile puzzles, notebook, inventory, local solo saves, accessibility, and co-op interface.
- `public/network.js`: immediate local inspection, shared action transport, server clock estimate, automatic reconnect, and connection feedback.
- `server.mjs`: authoritative in-memory rooms, authenticated seat recovery, action deduplication, static serving, and bounded WebSocket transport.

Co-op shares keys, clues, unlocked doors, hints, and chapter progress. Viewpoints and unsent puzzle attempts stay on the individual client. Every submitted action is checked against server state. The scene-based design does not need Breach's continuous movement prediction or interpolation; it reuses the same principles of authoritative state, reconnect identity, stale-socket rejection, and latency-conscious local presentation.

Solo progress stays in this browser under `lockstep.solo.v1`. A separate `sessionStorage` entry holds each co-op seat. Co-op does not overwrite a solo save. Disconnected seats are held for 90 seconds. Rooms are in memory and do not survive server deployment/restart. No account, database, voice, microphone, or external API is required.

## Deployment

Independent branch `feat/lockstep-escape` in `shnider42/daily_flyer`. Render Node web service, Virginia, free plan, one instance. Build command: `node --test games/lockstep/tests/*.test.mjs`. Start command: `node games/lockstep/server.mjs`. Existing DFE game services are unaffected.

## Content expansion

Add rooms, objects, visual clues and action validation in `world.mjs`, give new props an art treatment in `art.js`, and add inspection controls in `app.js` when introducing a new puzzle type. Keep sound optional until a level explicitly introduces an accessible visual equivalent. Public landing-page copy deliberately contains no solutions or level selectors.
