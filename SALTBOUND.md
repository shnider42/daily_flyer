# SALTBOUND · DailyFlyer Games

Top-down Caribbean extraction game. Version 0.1.0.

## Playable scope

- One 8,200 × 6,200 sea, ten handcrafted island outlines with seeded loot, palms, villages, ruins, forts, and a volcanic island.
- Sloop spawn; steer, accelerate, drift, land, walk, collect shared cargo, and board at the anchor marker.
- Port/starboard broadsides with independent reloads; seven roaming hostile ships, raiders, marksmen, crabs, and captains.
- Flintlock, blunderbuss, rifle, cutlass, medicine, planks, crew revival, cargo capacity, 18-minute voyages, three extraction passages.
- Stationary ten-second extraction; incoming hull damage resets progress. Living crew must be aboard. Sinking, crew wipe, or storm expiry loses unsecured loot.
- Local vault and idempotent extraction receipts; three purchasable ships, recovered weapons/attire, hull/cannon upgrades. A free sloop and flintlock always remain available.
- Solo and code/invite-link based 2–4 player cooperative PvE, no friendly fire. Everyone shares the vessel and cargo. Active helm ownership, independent shore movement, reconnect tokens and 90-second slot reservation.
- Desktop mouse/keyboard and mobile two-thumb controls. Right thumb holds aim/fire without moving to a separate fire button. Contextual action, repair/heal, separate broadside buttons, adjustable controls/zoom, three guidance levels and three difficulties.
- Procedural sea ambience, original instrumental loop, weapon and loot sounds. Audio starts after a gesture.

## DFE integration and running

The theme lives in `daily_flyer/themes/saltbound.py` and `saltbound_assets/`. Flask routes `/?theme=saltbound` and `/saltbound/` provide the solo frontend. The dedicated Node server hosts the same assets and the `/crew` WebSocket endpoint on one origin; use Node for multiplayer.

```
npm test
npm start
```

No runtime package installation is required. The server reuses DFE Last Exit's vendored MIT-licensed `ws` transport. Shared engine logic follows the recent DFE split between simulation, renderer, input/UI, and authoritative server rooms. Other themes and service branches remain independent.

## Deployment

GitHub: `shnider42/daily_flyer`, branch `feat/saltbound-extraction`.

Render Node web service: build `node --test tests/saltbound/*.test.mjs`, start `node server/saltbound/server.mjs`. Binds `0.0.0.0:$PORT`; HTTP readiness endpoint `/health`. Single instance, free plan, Virginia. Graceful SIGTERM closes sockets with a restart code and stops the server.

## Networking and boundaries

30 Hz authoritative simulation, 15 Hz rounded snapshots, input normalization and freshness deadlines, sequence checks, client interpolation/local movement prediction, per-socket backpressure, payload and message limits, same-origin WebSocket checks, random room/reconnect tokens, room cap, and idle cleanup. Open menus neutralize that player's input; they never pause an active co-op crew. Entirely disconnected rooms suspend their simulation while reserving slots.

This release is a cooperative prototype, not a competitive economy. The server validates in-voyage actions, but starting gear and the persistent vault are browser-owned. Clearing site data loses the vault. There is no cross-device account sync, authoritative durable inventory, matchmaking, hostile player teams, monetization, or public PvP. A Render restart loses active rooms; the browser vault remains. Public PvP should add authenticated players, durable inventory/transaction receipts, server-authoritative provisioning and spending, opposing crew/team rules, reconnect-safe raid outcomes, and load/latency testing first.

## Verification

Run the core, room lifecycle, and actual HTTP/WebSocket tests in `tests/saltbound/`. They cover deterministic loot/reachability, ship/shore collisions, a full land-loot-board-extract-bank loop, duplicate payout prevention, extraction crew and movement constraints, damage resets, defeat, capacity, cooldowns, combat, revival, repairs, upgrades, input validation, storm timeout, stamina, four-player admission, token reconnect/replacement, idle cleanup, stale controls, duplicate chest collection, static route allowlisting, and two connected clients sharing/moving the same ship.

Real iPhone Safari touch feel and real-world cellular/Wi-Fi latency still require device playtesting. Browser QA covers the visible flow; it is not a claim of a completed four-human raid.
