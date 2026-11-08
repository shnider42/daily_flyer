# Vineyard Table

A DailyFlyer vineyard worker-placement game inspired by Viticulture Essential
Edition. Built for a phone in portrait or landscape and a full desktop table.

## Play

Run `npm start`, then open the port printed by the server (default 3000).
No install step or external runtime dependencies are required. Node 24 is the
tested runtime. `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` supports
the managed preview environment.

Choose Play solo for one human and one to five strategic AI opponents. Host a
table opens a lobby; share the eight-character room code or its invitation link.
The host can start once there are at least two total estates, filling remaining
seats with AI if desired. The maximum is six estates.

Simple, Moderate, and Expert alter explanations and information density, never
game rules. Simple gives legal next-step suggestions, a vineyard journey, and
the reason behind the current season. Moderate retains seasonal context. Expert
keeps the compact table with help available on demand. Coaching can be hidden
independently. Day/night, control size, ambient audio, and motion are local
preferences. Inspecting an action does not commit it.

## This edition

Preserved core mechanics include spring wake-up order; summer/autumn/winter;
workers shared across the entire year; regular/grande placement; action-space
counts and bonuses; field capacities and vine prerequisites; buildings; field
trading; red/white harvests; storage collisions; cellar limits; wine blending;
aging; orders and recurring income; worker training; seven-card hand cleanup;
and completing the final year before scoring and tiebreaks.

The standard target is 20 victory points. The optional short game uses 12.

Original content and deliberate differences:

- A uniform starting estate with 5 coins, two regular workers, a grande worker,
  two basic vines, two approachable wine orders, and one visitor of each season.
- Ten original visitor types per season, with three copies of each.
- Twenty-two original wine order types, with two copies of each, plus starters.
- Forty-two vine deck cards, with additional basic starter vines per estate.
- Strategic AI opponents instead of the published solo Automa.
- Original artwork; no official card art or copied visitor text.
- Mama/Papa variable starting resources and expansion modules are not included.

Reference: the publisher's
[Viticulture Essential Edition page](https://store.stonemaiergames.com/products/viticulture-essential-edition)
and the official Essential Edition rulebook. The independent game credits Jamey
Stegmaier, Alan Stone, and Stonemaier Games in its About panel. This is not an
official digital edition.

## Architecture and reuse

`server/vineyard/engine.mjs` is a deterministic, serializable rules engine. It
enumerates complete legal choices and accepts only a currently legal opaque
action key. Applying an action clones the input; rejected actions leave the
original state untouched. Public views exclude opponent hands, decks, and PRNG
state. Rules, legal action previews, AI, and coaching use the same calculations.

`server/tabletop/rooms.mjs` is a reusable room manager with a game adapter. It
carries forward DFE's authenticated room/seat model, adding revision checks,
idempotent requests, encrypted snapshots, bounded bot turns, and recovery for
turn-based games. It has no vineyard-specific mechanics.

`server/vineyard/server.mjs` serves the static client and JSON API using Node's
HTTP, crypto, filesystem, and compression libraries. All gameplay is authoritative
on the server. Browsers poll while the page is visible; hidden tabs reduce traffic.
Every player's private view is generated separately. A player token never appears
in invitation URLs or in another player's response.

`daily_flyer/themes/vineyard_assets/` contains the lightweight browser client,
responsive styles, and original SVG artwork. No remote fonts or CDNs are needed.

## Recovery and deployment

Create one Render Node web service from branch `feat/vineyard-table` in
`shnider42/daily_flyer`. Root directory is the repository root.

- Build command: `npm run test:vineyard`
- Start command: `npm start`
- Compute plan: `free`
- Region: `virginia`
- Node version: 24.22.1 (matching the verified local runtime)
- Set `ROOM_SECRET` to a securely generated random value of at least 24 characters.
  Keep it stable across deployments and out of Git and logs.
- Optional `ROOM_DATA_DIR` defaults to `/tmp/dfe-vineyard-rooms`.
- Readiness endpoint: `/healthz` reports the source commit and recovery mode.

Only a single server instance is supported without a shared room repository.
The current implementation writes atomic encrypted snapshots locally and gives
each browser an encrypted recovery envelope after changes. Local browser storage
also retains that seat's bearer token. Private exported backup files contain both
the envelope and seat token and should be treated as credentials for that seat.

Render's free filesystem can disappear on idle spin-down, restarts, or deployment.
A stable ROOM_SECRET lets the original browser or an exported private backup
restore the room after such a reset. Recovery never overwrites an existing live
room. After total server-state loss, the restoring browser's last snapshot is the
recovery point; it cannot reconstruct turns that never reached that device.
Saved rooms/backups expire after 14 days. No persistent database has been added.

## Verification

Run `npm run test:vineyard`. The suite covers core rule invariants, complete
AI games for two through six estates, hidden information, rejected commands,
worker timing, wine recipes/cellar constraints, final-year scoring, authenticated
multiplayer, competing and duplicate requests, actual-engine HTTP integration,
encrypted recovery, restarts, and mixed human/AI matches.

Browser verification and the actual deployed commit are recorded in the release
summary. Layout testing in a Chromium mobile-sized viewport is distinct from
testing on a physical iPhone/Safari device.
