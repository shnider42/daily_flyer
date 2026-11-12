# Farwake multiplayer: operation and implementation

Public game: https://dfe-farwake.onrender.com/

Authority and direct game: https://dfe-farwake-universe.onrender.com/

Farwake supports a shared invitation realm with up to **ten simultaneously connected captains**. A captain can explore a separate system, work on a planet, or join a permitted friend's ship. Hull capacity ranges from one to twenty-four berths; living hired NPC crew, rescued passengers, and human crew share those places. The realm still permits at most ten online human captains. The server maintains one vessel and one world simulation, regardless of how many people are aboard.

This is a small-group authoritative multiplayer implementation. It is not a distributed MMO service. The current deployment model is one Node process, with durable realm records behind an authenticated storage gateway.

## Playing together

Open **Crew / Online**, create a realm, and share its invitation code. A joining player receives a separate captain and starter ship. Joining does not import or overwrite a solo save.

For a new Regular galaxy, **Start together** opens a departure lobby at Kettle. Connected waiting captains unlock Lark at two, Puffin at four, and Osprey at seven. The selected hull must have room for the entire connected departure crew. Each guest marks Ready; changing the selection clears guest readiness. The host's **Board together** action places everyone on one docked vessel, with personal piloting/station grants and installed bunks. A pilot then launches through the existing deck controls. Guest compact hulls remain docked at Kettle.

The start is optional and one-time. Its status, hull choice, and participants are persisted, and the authority counts current authenticated sessions. Offline passports, client-provided party counts, late arrivals, and progressed captains cannot create another grant. Offline waiting captains remain ashore when the crew boards. Leaving the lobby keeps that captain's own ship; the host can close the group departure for everyone. Existing realms without a departure record retain their original behavior. A stored waiting captain returns to the lobby after a restart, without a gameplay recovery penalty.

The browser stores a **captain passport** containing the realm code, captain identifier, and a random authentication token. Export that passport before changing browser, clearing site data, or moving to another device. Importing it resumes that captain. Treat its file as a credential: anyone with the token can operate that captain. The authority stores only its SHA-256 hash. There is no email account, password reset, or external identity provider in this release.

Only ten passports can be online in one realm at the same time. More captains can have saved records and play at different times. A second connection using the same passport replaces its earlier connection rather than creating a duplicate character.

### Shared ships and stations

The owner can open general boarding or grant individual access. General boarding permits ordinary crew work; **helm access requires a personal grant**. Boarding requires a shared port or a close, slow approach in space. Transfers are blocked during an immediate attack. A guest's owned ship is parked at a port while the guest serves aboard another vessel.

Walk to a console to take its station. One captain controls the helm. Other humans can move independently around the crew deck and use their permitted station:

| Station | Server action |
| --- | --- |
| Helm | Fly, dock, jump, and use the ship's primary weapons/mining beam. |
| Gunnery / security console | Fire the canonical vessel's weapons while another captain pilots. |
| Engineering | Spend 18 reactor energy to restore 8 hull, with a four-second cooldown. |
| Navigation / scanner | Scan the nearest unresolved signal in the vessel's actual scanner range. |
| Medical | Spend 15 reactor energy to treat injured living people on the friendly deck and living hired crew, with a six-second cooldown. |

Station permission and proximity are checked by the authority. Changing a browser variable does not grant a role or move a vessel. The owner can revoke access; an occupant already in space becomes a passenger and can disembark at a port.

NPC grapples start a shared defensive boarding fight. The helmsman is brought onto the actual crew deck, where the humans and hired crew fight the same hostile actors. A disabled enemy ship can be assaulted by the helmsman's boarding party; other people remaining on the friendly deck do not appear on that enemy deck or shoot its enemies remotely. A boarding leader can retreat through the entry airlock. Incapacitated humans cannot move; they recover when the boarding outcome resolves. Hired crew deaths and the vessel's memorial remain recorded.

### Military careers, ranks, and shared operations

The Morrow recruiter offers the authored Freewake Navy and Army careers. Each branch has four introductory assignments plus six standing deployments. Navy deployments visit Brindle, Meridian, and Sable; Army deployments use actual sites on Serein and Tallow. Other factions retain ordinary enlistment and service work; this release does not author their separate career campaigns.

`militaryCareerAction` accepts named service actions, including `createOperation`, `joinOperation`, `leaveOperation`, and `launchOperation`. Recruitment, muster, assignment, retry, and debrief validate the acting captain at the real recruiter. Departure rechecks the live roster, health, faction, branch, standing, rank, and physical presence. A player can join a muster before departure. Operation identifiers include the owning realm and cannot enroll a captain from another galaxy. Client messages cannot submit field evidence, arbitrary rank, elapsed watch time, or sortie receipts.

Rank belongs to `professions.careers.military` and derives from completed military assignments, using cumulative milestones **0 / 3 / 8 / 16 / 28**. The branch titles are:

| Completed assignments | Navy | Army |
| ---: | --- | --- |
| 0 | Recruit | Recruit |
| 3 | Able crew | Private |
| 8 | Petty officer | Corporal |
| 16 | Chief petty officer | Sergeant |
| 28 | Lieutenant | Lieutenant |

Existing pre-0.14 records retain an earned legacy tier through a one-time migration; later XP alone cannot bypass the completed-assignment milestones. Same-faction military dialogue uses the acting captain’s own service record. A new captain joining a progressed realm receives their own rank and clearance. The highest-ranking enrolled member leads a shared deployment, and mission-specific lead requirements control which orders that captain may authorize. Lower ranks may join an eligible leader as crew. Navy grants are personal: weapons duty is available to enrolled recruits, scanner duty begins at rank index 1, and engineering at rank index 2. Neither rank nor operation leadership grants the NPC helm, the employer’s hull, or access to another player’s personal ship.

The realm persists a canonical `militaryOperations` registry containing operation identity, mission, faction, branch, leader, members, lifecycle phase, and the Navy contract/vessel binding where applicable. The captain’s `militaryCareer` stores their branch, introductory chapter progress, attempt serial, active operation, participation evidence, and debrief ledger. A captain helping with a later chapter gains verified service credit without skipping that captain’s unfinished introductory chapters. Compact snapshots carry the current career, sanitized operation view, and exterior-view flag. Personal data exports include the captain’s own career; the operation registry and room records remain shared-world data rather than being misclassified as that captain’s personal history.

#### One Army encounter for the section

Enrolled teammates enter the same operation-specific interior, with one canonical combat clock, infantry state, watch clock, and objective state. Separate operations keep separate encounter identities. The Morrow training sites remain in the shared surface world; later operation entrances are on Serein and Tallow. Ordinary exploration sites keep their existing shared identities and behavior.

The authority steps `stepSiteEncounter` once for the occupied operation, then records individual presence only for healthy, online, enrolled captains in that actual site. Verified team hits, the cleared threat, and a physically activated objective can satisfy the section’s objectives. A shared introductory or combat assignment also requires the captain’s own **15 seconds of field presence or a verified hit**. This avoids requiring every recruit to destroy the same finite set of training targets while preventing remote or absent members from claiming the work.

Watch postings begin with no hostile actors. Their delayed contact decision belongs to the operation and is stable across restoration; it is not announced in the briefing. An actual attack spawns the authored infantry and uses normal cover, aim tells, damage, and recovery. A quiet watch still requires the full personal watch duration before the field log can be signed. The watch clock does not advance from an empty site, and offline time does not supply personal participation. Returning by service shuttle requires the captain to leave the site and reach the real surface landing. Early return fails that individual attempt without pay. Personal ships stay at their original berths.

#### One Navy carrier in the shared star system

A Navy operation creates one employer-owned Leviathan and one canonical contract with a separate duty record for each enrolled captain. Commander Isen has the helm. Shared members occupy that same carrier and operate permitted physical stations. The captain remains in person mode inside the cabin while `stationView` is `gunnery`; that flag projects the actual exterior system through the gun console.

The authority rechecks membership, carrier identity, station grant, health, docking/boarding state, and console proximity before accepting fire or projecting the exterior view. Helm and movement inputs are masked while using the display. Aim and fire use the vessel’s real weapons, power, range, firing arc, and shared cooldown. Leaving the display, docking, disconnecting, or losing access removes the view without changing ownership. Reconnects require a fresh valid station-view grant.

Standing orders let the NPC pilot transfer the canonical carrier and its occupants into the assigned system and return to Morrow. Escorts place a real freighter in that system. A delayed interception creates actual hostile ships and projectiles there. Other captains in the same system’s space view—including civilians outside the operation—see these objects through ordinary shared-world snapshots. The engagement is not duplicated for each participant or hidden in a private mission simulation. Bystander visibility does not confer service membership or rewards.

Each participant keeps their own on-station time, shots, damage, and settlement receipt. Shared introductory sorties accept the completed team target objective plus **15 seconds of personal station duty or the required personal gun contribution**. Extended patrols and escorts require the full personal watch duration and the completed operation, whether the route stays quiet or becomes a battle. Legacy solo introductory sorties retain their individual per-target qualification rules.

Settlement is individual. The physical docked airlock remains available, personal inventory is restored, and campaign carrier work awards zero ordinary crew wages. A qualifying return to Morrow enables one recruiter payment and one completed military assignment for that captain. Another member can remain aboard and settle separately; one debrief never grants everyone a promotion. Cancelled, interrupted, withdrawn, or unqualified service cannot award completion. Failed or orphaned assignments recover through the existing recruiter/return paths, while reconnect and process restoration preserve the canonical operation and each member’s actual record.

### Homes, logout, and asynchronous play

| Home | Cost | Where it can be registered |
| --- | --- | --- |
| Standing room lease | 50 credits | An inhabited station or planetary/moon settlement. It does not expire. |
| Surface outpost | 180 credits and 12 ore | A planet or moon visited in person. |
| Fitted ship bunk | 60 credits and 4 ore per additional fitted bunk | Installed by the owner aboard their ship; claiming requires a free fitted bunk and permission. |

The starter ship has one fitted owner bunk. Additional physical berths follow the hull's capacity. A room or outpost records its owner, system, location, and valid surface position. These are persistent home registrations and visible location markers, not a freeform construction editor. A registered bunk travels with its vessel. A returning captain cannot exceed the combined human/NPC berth limit; an unavailable bunk falls back to a safe port.

Closing a menu never pauses the shared simulation. A disconnected captain supplies zero input for a **30-second grace period**, while other people continue playing. A live crew can keep operating its vessel after the owner's departure. An abandoned or endangered captain is recovered to their registered home or a safe starter port when the grace expires. Combat disconnection can incur an emergency-tow charge of 15% of credits and 20% of ore; normal ship destruction has the engine's separate recovery rules. Disconnecting is not an instant shield against an ongoing fight.

The WebSocket transport sends raw ping frames every 15 seconds and terminates a connection that misses the following check. This detects dead network sessions independently from application latency messages. The disconnection grace starts when the authority detects the closed/dead connection.

Resources, ships, hired crew, permissions, home leases, personal campaign decisions, and shared physical world changes are saved. Another captain can visit later and see depleted mining fields or a defeated local ship. **Story choices and faction reputation belong to the individual captain**; they do not silently rewrite every other player's campaign. Authored encounters use deterministic game rules and explicit choices, not runtime-generated AI dialogue.

## Simulation and transport

The server is authoritative. A browser sends inputs and named commands, never an arbitrary character/world snapshot.

| Timing | Rate / bound |
| --- | --- |
| Fixed authority simulation | 30 Hz |
| Client input transmission | 20 Hz |
| Motion/world snapshots | 10 Hz |
| Full metadata snapshots | About 1 Hz, immediately on room changes, and with command results |
| Remote interpolation | Starts at 100 ms; adapts to jitter up to 220 ms |
| Maximum extrapolation | 250 ms |
| Stale input cutoff | 500 ms |
| Periodic durable save | Every 7 seconds by default; successful commands also await a save |

Each input carries a monotonically increasing sequence number. Snapshots acknowledge the latest applied sequence. Local ship rendering predicts with the same pure flight function as the server, then reconciles from authority and replays unacknowledged input. A correction is smoothed over subsequent frames. Remote players interpolate their own recent snapshots. A delayed player does not establish a barrier for other players, and the server never waits for all clients to acknowledge a tick.

Motion packets contain the current ship/person, combat actors, projectiles, resource totals, and compact asteroid state. Journals, full static asteroid geometry, realm rosters, and other slower metadata travel in the full snapshots. `network.mjs` merges these into the same full snapshot object before notifying the app. Reliable ordered WebSocket delivery plus periodic full snapshots make room transitions and reconnections explicit. Congested sockets drop superseded snapshots rather than delaying simulation.

Interest management is by star system and by character location/interior. Space views receive ships in that star system. A crew deck receives its local people and combat actors; it does not receive another deck's detailed character movement. Realm-wide presence is coarse: names, online state, system, room, and vessel. It does not contain remote surface coordinates. No public chat is implemented.

One `Game` vessel actor advances each physical vessel. A separate system coordinator calls `stepWorld` **once per occupied star system**, with all physical vessels as targets and individual captains as reward recipients. Ten humans on one capital therefore do not advance NPCs or projectiles ten times. Their person movement remains independent.

Empty systems sleep after ten seconds. On waking, traffic receives at most fifteen seconds of harmless movement catch-up. Combat and all 300 systems do not continue running unattended. Persistent world records restore mining depletion, resolved signals, enemies, and other saved changes when a room wakes.

## Running locally

Requires Node 22 or later.

```sh
npm ci
npm test
npm run dev -- --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. The same process serves the game, HTTP endpoints, and `/ws`. In development, atomic JSON realm files are written to `.farwake-data`, or to `FARWAKE_DATA_DIR` if set. This local adapter uses a write/flush/rename sequence and a version check. It is a development convenience, not a promise of persistent storage on an ephemeral production host.

The static game can still be served separately for solo play. For a separate frontend, configure the browser's `FARWAKE_SERVER_URL` through its server-config script and allow that exact origin in the authority environment. An HTTPS frontend requires an HTTPS/WSS backend.

## Production environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Refuses startup unless durable gateway configuration exists. |
| `PORT` | Listening port supplied by the host. Defaults to 3000 locally. |
| `HOST` | Bind address. Defaults to `0.0.0.0`. |
| `FARWAKE_STORAGE_URL` | HTTPS URL for the server-only persistence gateway. |
| `FARWAKE_STORAGE_KEY` | Secret bearer credential for that gateway. Never put it in `dist`, browser config, a passport, or source control. |
| `FARWAKE_ALLOWED_ORIGINS` | Comma-separated exact frontend origins, in addition to the service's own origin. |
| `RENDER_EXTERNAL_URL` | When present, its origin is accepted as the hosted service's own origin. |
| `FARWAKE_DATA_DIR` | Development JSON directory; not a production durability substitute. |

On Render, use `npm ci && npm test` as the build command, `npm start` as the start command, and `/healthz` as the health check. The service must support WebSockets and remain a **single authority process** for this release. The database gateway can outlive process replacements. Multiple independent authority instances are not a supported scaling arrangement: compare-and-swap protects persistence but does not provide cross-process room coordination.

The configured deployment uses an isolated private Farwake schema behind a Supabase Edge gateway. Only the gateway holds database service credentials. The Node authority needs the gateway URL and its own bearer secret; the game browser needs neither. This adapter does not depend on the Supabase JavaScript SDK.

### Persistence gateway contract

All operations are JSON `POST` requests with `Authorization: Bearer <FARWAKE_STORAGE_KEY>`.

```json
{ "op": "ping" }
{ "op": "load", "realmId": "ABCDEF12" }
{ "op": "save", "realmId": "ABCDEF12", "expectedVersion": 7, "snapshot": {} }
```

Responses:

```json
{ "ok": true }
{ "ok": true, "version": 7, "snapshot": null }
{ "ok": true, "version": 8 }
```

A stale save returns HTTP 409 with `{ "ok": false, "conflict": true, "version": 8 }`. The authority refuses to overwrite the winning revision, closes that realm's sessions, and reloads the durable record on reconnect. There is no last-writer-wins fallback. A storage outage blocks new mutations and stops the affected realm's simulation until a confirmed flush can recover. Successful command responses are sent only after the applicable revision has been durably accepted. A simulation exception also closes the affected realm and restores from its last durable state rather than persisting partially failed state.

`SIGTERM` and `SIGINT` stop simulation, close sessions, and await a final flush. An abrupt process loss can still lose up to the periodic-save interval of movement/combat; already acknowledged actions have passed the persistence gate. Browser command timeouts explicitly report that the action was not confirmed; replaying the same request identifier uses the saved result and does not duplicate a reward.

## HTTP and command interface

`GET /healthz` exposes service status, durability mode, online count, and active room count without credentials or saved game data. `GET /api/config` exposes protocol/rate/capacity information.

`POST /api/realms` accepts `action: create`, `join`, or `resume`. Creation/join accepts a display name and returns a passport. Resume accepts that passport. The WebSocket authenticates with its first `hello` packet; credentials do not appear in its URL.

New galaxy creation also accepts the strictly boolean `openingMission` preference. It is persisted as `realm.settings.openingMission`; absent legacy values are false. Join requests cannot override it. Captain-local opening state is part of ordinary durable saves and compact state updates, but never copied into a vessel simulation actor or another captain. `openingAction` accepts only the authored `accept`, `finish`, or `skip` operation, with contact identity validated for acceptance/payment. Progress comes from verified repair, personal mining, and paid travel; replayed commands and terminal mission state cannot pay twice. A new regular captain with the opening selected is ashore at Kettle, with their actual owned hull docked and its helm vacant. Hardcore creates no hull.

The browser API is `new FarwakeNetwork({url, onSnapshot, onStatus})`, followed by `connect({create, realmCode, name, realmName, passport, openingMission})`. It provides `setInput(input)`, `predictShip(dt,input)`, `sampleRemotes()`, `command(name,args)`, `disconnect()`, and `exportPassport()`. A command resolves to `{ok,result,state,world,room,events,...}`.

Authority commands include flight transitions (`dock`, `launch`, `travel`), interactions (`scan`, `salvage`, `surfaceAction`), cabin/boarding transitions (`enterCabin`, `leaveInterior`, `boardDerelict`, `boardEnemy`, `retreatBoarding`, `attackBoarder`), jobs/services/upgrades/crew, authored encounter selection/choice, permissions and stations (`setCrewAccess`, `boardShip`, `takeStation`, `leaveCrew`, `returnToShip`, `crewAction`), homes (`setHome`, `installBunk`), and display-name changes. Each command validates its own mode, ownership, role, range, requirements, and resource cost. There is deliberately no `patchState` or world upload endpoint. A legacy solo-save import into a realm is not implemented.

## Code map and verification

| File | Responsibility |
| --- | --- |
| `server/index.mjs` | HTTP/static serving, WS sessions, heartbeat, fixed tick scheduling, compact snapshots, lifecycle. |
| `server/realm.mjs` | Captain/vessel authority, canonical rooms, permissions, surface validation, homes, command persistence. |
| `server/military-operations.mjs` | Realm-owned musters, rank-aware leadership, shared deployments, canonical carrier contracts, per-captain settlement. |
| `server/persistence.mjs` | Versioned development files and authenticated gateway adapter. |
| `server/protocol.mjs` | Protocol constants, input sanitization, random credentials, token hashing, rate limits. |
| `dist/network.mjs` | Browser transport, passport storage, reconciliation, interpolation, compact snapshot reconstruction. |
| `dist/engine.mjs`, `dist/fleet.mjs` | Shared game rules, per-vessel simulation, once-per-system world simulation, pure flight physics. |
| `dist/surface.mjs`, `dist/interior-layouts.mjs` | Shared collision and authoritative entity/console/bunk coordinates. |
| `dist/military-career.mjs`, `dist/military-content.mjs`, `dist/military-sites.mjs` | Authored career/standing orders, personal evidence and debriefs, Army sites and transport. |
| `dist/military-ranks.mjs`, `dist/navy-service.mjs` | Individual service ranks and permissions; per-member Navy duty and receipt rules. |
| `tests/server/network.test.mjs` | Real headless WebSocket integration and durability tests. |

Run the complete suite with `npm test`, just the server suite with `npm run test:network`, and syntax checks with `npm run check`. Top-level tests intentionally do not require the `ws` dependency, so the separate static-site build can run `node --test tests/*.test.mjs`.

The integration suite exercises ten simultaneous clients in separate systems, ten occupants on one capital, a client with an injected 200 ms delay, one shared-world tick, permission/proximity/puzzle checks, nonduplicated rewards, restart persistence, boarding and retreat, downed human recovery, offline helm expiry, full bunk capacity, dead TCP detection, CAS conflict, and acknowledgment timing. It reports local serialized snapshot sizes. These are functional local tests, not a production concurrency, latency, or mobile-bandwidth benchmark. Internet routing, host cold starts, device rendering, and real-world jitter require deployment observation.
