# SALTBOUND · DailyFlyer Games

Top-down Caribbean extraction game. Version 0.2.0.

## Playable scope

- One 8,200 × 6,200 sea, thirteen island outlines with seeded loot, palms, villages, ruins, forts, and a volcanic island.
- Sloop spawn; steer, accelerate, drift, land, walk, collect shared cargo, and board at the anchor marker.
- Port/starboard broadsides with independent reloads; seven roaming hostile ships, raiders, marksmen, crabs, and captains.
- Flintlock, blunderbuss, rifle, carbine, twin pistols, cutlass, medicine, planks, crew revival, cargo capacity, 12–22 minute voyages, three extraction passages.
- Stationary ten-second extraction; incoming hull damage resets progress. Living crew must be aboard. Sinking, crew wipe, or storm expiry loses unsecured loot.
- Local vault and idempotent extraction receipts; eight hulls, recovered weapons/attire, hull/cannon upgrades. A free sloop and flintlock always remain available.
- Solo and code/invite-link based 2–4 player cooperative PvE, no friendly fire. Everyone shares the vessel and cargo. Active helm ownership, independent shore movement, reconnect tokens and 90-second slot reservation.
- Desktop mouse/keyboard and mobile two-thumb controls. Right thumb holds aim/fire without moving to a separate fire button. Contextual action, repair/heal, separate broadside buttons, adjustable controls/zoom, three guidance levels and five difficulties.
- Procedural sea ambience, original instrumental loop, weapon and loot sounds. Audio starts after a gesture.

## Crew campaigns

Each charter has a stable ID, a six-chapter journal and separate personal wallets keyed by browser pirate and charter. The original shared browser save supplies the solo vault. The host outfits the crew ship from their campaign wallet, and each guest brings their own gear from the same charter. A short-lived invite opens the current voyage. Returning players can host the charter from their local log. Two connected pirates are required for time, combat and extraction to advance.

Boarding order assigns Helm, Guns, Damage control and Mast. The Stations control (V on desktop) switches directly to a vacant station. Holding always accepts another pirate. A medic can plug a leak with a plank, treat an injured sailor, or scoop and throw a bucket in the gauge’s green band. A lookout can cycle contacts within the hull’s mast range and publish a temporary position and bearing for the crew. Smaller hulls let the helmsman cover an empty gun station. Solo helm retains access to ship functions.

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

## 0.1.1 freeze correction

Impact, ship-sinking, and enemy-defeat effects now use one shared fade lifetime for both opacity and particle radius. Previously they stayed visible for 1.1 seconds but their radius reached zero after 1.0 second, producing a Canvas `IndexSizeError` and terminating the animation callback chain. Degenerate ellipses are skipped, failed rendering resets the canvas state, and the next frame is scheduled in a `finally` block. Browser data/progression keys are unchanged. Regression coverage exercises the complete effect lifetime and 3,600 phone-sized combat render frames.
