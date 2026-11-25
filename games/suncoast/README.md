# SUNCOAST

![SUNCOAST preview](preview.jpg)

An original Daily Flyer top-down city game. Play Lucía Reyes, a 32-year-old Cuban mechanic and recovery driver returning to Bahía Lucero, a fictional Miami-inspired coastal city.

SUNCOAST includes a solo story and a separate two-to-four-player co-op campaign. The city is a story sandbox with three islands, eighteen authored missions, enterable buildings, vehicles, police attention, persistent choices, and recovery after arrest or injury. It uses original procedural Canvas 2D artwork and synthesized audio. There are no external art/audio assets, accounts, analytics scripts, or paid APIs. The multiplayer server uses the `ws` WebSocket library.

## Play with friends — 0.2.0

Open **Play with friends**, enter a name, and choose **Host new crew**. The city starts immediately; the **Crew** menu shows a six-character room code and a copyable invitation link. Friends open the link or enter the code and choose **Join crew**. A room holds up to four players and supports late joining.

Co-op is a separate campaign. Joining a room never imports, replaces, or writes to the solo story. The host selects story jobs and narrative choices, while any crew member can complete physical objectives such as reaching a destination, entering a building, collecting a vehicle, or speaking to a mission contact. Everyone receives completed-mission rewards once. Story completion, reputation, choices and island access belong to the shared campaign; bodies, cash, ammunition, side work, health, police attention and recovery belong to individual members.

### Moving together

- Every player has a colored character, a name label and map markers. Indoor crew appear at the correct building door on city maps.
- Cars, traffic, residents, police and projectiles exist in one shared city. A vehicle has exactly one driver. Most vehicles hold four people; sports cars hold two and motorcycles hold one.
- Interact beside an occupied car to ride as a passenger. Stop before entering or exiting. Passengers follow the driver's car and cannot steer it. If the driver leaves, an eligible passenger receives control of the stopped car with a short input reset.
- Friendly gunfire and punches do not damage crew members. Police, swimming, vehicle damage and other world hazards still matter.
- **G** or the middle mouse button places a shared ping on desktop. The Crew menu has **Ping my location** on touch. On the full map, select a waypoint and use **Share pin with crew**. Pings last eighteen seconds.
- Nearby shared gunfire and explosions use distance attenuation and stereo positioning. Building context prevents sounds in one interior appearing in another; outside walls soften those effects.

### Menus, recovery and reconnecting

The shared city keeps running while an individual opens a phone, map, conversation or menu. Held controls clear and the vehicle brakes when controls are blocked. A player being arrested or hospitalized does not reset a teammate, erase another pursuit, or rewind shared story progress. Co-op recovery continues the shared mission; the solo-only checkpoint-retry button is hidden.

A lost connection immediately releases the player's controls and safely clears their vehicle seat. The private reconnect token is stored only in that tab's session storage. The server reserves the character for sixty seconds and transfers hosting after five seconds if the host is absent. Reconnecting recovers the same character while the reservation remains. Explicitly leaving releases the seat immediately and transfers hosting when necessary. A room code invites a new player; it cannot claim someone else's character.

### Crew checkpoints

The current host automatically requests a separate browser-local crew checkpoint during play and after important transitions, with a ten-second rate limit. **Save crew checkpoint** requests one immediately. **Leave crew** waits for a final checkpoint acknowledgement, with a bounded timeout and a visible failure message when it cannot be confirmed. Closing the browser cannot guarantee that an additional asynchronous save completes, so use the explicit save/leave controls when finishing a session.

Use **Host saved crew story** to reopen the shared campaign and city in a new room. The host returns from the saved checkpoint; friends join as fresh crew members. This is different from reconnecting to a still-running room, which restores an existing character. Crew checkpoints use `dfe.suncoast.crew.checkpoint.v1`; reconnect credentials use the separate per-tab `dfe.suncoast.crew.session.v1` key. Solo saves remain under `dfe.suncoast.save.v1`.

Rooms live in server memory and can end on a restart or deployment. They are not permanent hosted worlds or cloud saves. Empty rooms and disconnected reservations expire. No account or text/voice chat is required; names and gameplay are shared with the other room members. The service receives normal connection information, but tokens and private member records are excluded from gameplay snapshots and public health output.

### Networking choices carried over from Farwake and CHALK

The server advances one city at 30 Hz, receives current controls at 20 Hz, and sends snapshots at 10 Hz. Browsers predict only their own movement, reconcile acknowledged controls and interpolate other moving entities. Interior changes, vehicle changes and large corrections reset smoothing rather than drawing a character through unrelated spaces.

Old snapshots are skipped before projection when a connection is congested. Inputs retain the latest steering, a short attack tap survives packet coalescing, and explicit input cancellation removes queued attacks. Expired inputs brake after 500 ms. Named actions carry bounded idempotency receipts so retries cannot duplicate a choice, purchase or reward. Snapshots omit distant traffic and residents, private actor state and server-only AI fields. One slow connection does not pause the other three.

## The city and story

Twelve main missions follow a neighborhood acquisition scheme through Santa Elena, Cayo Espejo and Puerto Umbral. Six optional missions follow Tomi’s repair business, Inés’s neighbors, and Voss’s driving/coastal work. Public exposure, a negotiated future, and private control offer three endings. Side stories never block main progress.

| Island | Character | Access |
| --- | --- | --- |
| Santa Elena | Cafés, neighborhood streets, repair shops, clinic, docks | Open from the start |
| Cayo Espejo | Hotel, Art Deco nightlife, marina, municipal records | Opens after **Open Water**, main mission four |
| Puerto Umbral | Container terminal, private estate, Suncoast headquarters | Opens after **Customs and Favors**, main mission eight |

The islands are physically connected. Reaching restricted land early, including arriving by water, triggers six stars. Leaving the restriction lets the ordinary pursuit/search rules take over. No invisible story wall prevents exploration.

### Your first job

**Before the Coffee Gets Cold** begins at Café Inés. Enter, speak to Inés, collect the clinic delivery, walk to Tomi’s garage, take a loaner, drive to the clinic, park, enter, deliver, choose whether to keep a fee, and go home. The tutorial teaches actions reused throughout the story. It does not force a crime or a kill.

### Optional personal stories

| Contact | First story | Follow-up |
| --- | --- | --- |
| Tomi | Not Scrap Yet | Parts Unknown |
| Inés | After Hours | Leave a Light On |
| Voss | Three Stops, No Excuses | Low Tide, High Price |

There are 110 authored steps and eighteen decisions with thirty-seven selectable outcomes across the main and optional missions. Choices affect cash, reputation, wanted levels, persistent flags, contact reactions, and the ending. The missions share a core progression path; choices do not generate an unlimited branching campaign. Every main story can be completed without a mandatory kill.

## Play

Use the gold objective marker and the short instruction panel. Open **Phone** to select a story job, find paid work, read contacts, or revisit decisions. Open **Map** to see the islands and set a personal waypoint. Gold business markers identify the sixteen named interiors; three additional shops can also be entered.

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk / swim | WASD or arrow keys | Left stick |
| Drive | W/S accelerate and reverse; A/D steer | Point left stick in desired direction |
| Brake / reverse | Space brakes; S reverses | Hold Brake / Reverse to stop and back up |
| Interact / enter / exit | E | Gold Use button; label changes with context |
| Sprint | Shift | Run button |
| Aim / attack | Mouse + left button, or F | Hold Fire / Punch; assisted aim |
| Draw / holster | Q | Draw / Holster button |
| Phone | Tab | Phone button |
| Map | M | Map button |
| Pause | Escape | Pause button |

Stop a vehicle before getting out. Small cars, sedans, sports cars, pickups, vans, motorcycles, boats, and police vehicles have different speed, acceleration, turning and durability. Vehicles can be damaged or disabled. Tomi handles repairs, paint, and recovery.

Simple guidance explains actions in plain language. On phones, tap Help beside the objective to expand its full guidance. Moderate shortens hints; Expert retains objectives. Camera zoom, sound, optional quiet instrumental radio, touch controls and reduced interface motion are adjustable. Solo play pauses in menus, conversations, and when the page is hidden. Portrait and landscape layouts are supported.

## Police attention

Unwitnessed minor crimes do not automatically create a wanted level. Nearby civilians can report crimes after a short delay; patrols can witness them directly. Noise from gunfire is easier to notice. Officers pursue a visible player and otherwise search around the last known position. Building geometry blocks sight and projectiles.

| Stars | Response |
| --- | --- |
| 1–2 | Local patrols attempt arrest when close on foot |
| 3 | Armed response |
| 4 | Tactical units and police-car roadblocks |
| 5 | Helicopter support |
| 6 | Maximum response; restricted islands sustain it until you leave |

Break sight and stay hidden to reduce stars over time. A respray can help after sight is broken at lower wanted levels. It cannot erase a restricted-island violation or serious charges. Pause includes a surrender action while wanted.

Police movement is a lightweight, collision-aware pursuit model. It does not yet simulate full road-network dispatch or room-by-room interior raids. Entering while visibly pursued at three or more stars is blocked; lower-level indoor hiding takes time.

## Hospitalization and arrest

Hospitalization costs up to the greater of $40 or 8% of cash, capped by available cash. Lucía keeps her ammunition. Arrest costs up to the greater of $70 or 12% of cash, capped by available cash; it confiscates her pistol and ammunition and impounds the current vehicle.

Both outcomes preserve completed missions, choices, reputation and island access. Continue at the clinic/precinct, or restart the active job at its checkpoint. Previous decisions remain binding when a job is retried, and their rewards cannot be collected twice. Recovery fees cannot put the player into debt. Vehicle recovery is available at the garage or precinct.

Contacts acknowledge selected story decisions, hospital visits, arrests and the ending when Lucía returns.

## Work and reputation

Five repeatable activities supplement the authored stories:

| Activity | Start | Base reward |
| --- | --- | --- |
| Taxi fare | Café / garage | $100 |
| Courier delivery | Market / depot | $120 |
| Harbor delivery | Docks / marina | $160 |
| Three-checkpoint circuit, 110-second limit | Garage | $220 |
| Medical pickup and delivery | Clinic | $140 and one community reputation |

Visit a business and talk inside to accept work. Complete the active story job before taking a paid side job.

Community reputation of at least three reduces repair/respray prices by 30%; at least four reduces treatment to $15. Underworld reputation of at least three adds $30 to taxi, courier and harbor rewards. Truth reputation of at least four reduces arrest fines by 35%. These values are independent, so Lucía can build mixed relationships rather than being forced into a single alignment meter.

## Saves and privacy

The complete solo story is stored in this browser under `dfe.suncoast.save.v1`, with settings stored separately. Autosaving runs during play, on important transitions, and when pausing or leaving. Export and import JSON backups from Pause to move a story to another device. Starting a new story explicitly replaces the current local save.

Solo mode has no account, chat, cloud save, tracking library, or backend player database. Co-op uses a separate temporary room server, with privacy and checkpoint behavior described above. The hosting provider receives ordinary web requests. Browser storage can be cleared by the user or browser; export a backup for a separate copy.

## Mobile fixes in 0.1.1

A hidden minimap previously multiplied its existing backing size by device pixel ratio on each HUD update. On high-density landscape phones this could grow without bound, exhaust canvas memory, and break rendering. Hidden/zero-size canvases now skip allocation and drawing; resize calls are idempotent. The world and terrain cache now render at phone pixel density instead of enlarging undersized bitmaps.

Phone HUD controls have at least 44px targets, safe-area offsets, separated landscape positions, expandable objective help, and no full-screen backdrop blur. Menus and dialogue hide and disable gameplay controls. Rotation and visual viewport changes resize the renderer and clear held inputs. The mobile interior camera follows Lucía so room edges and doors cannot move her behind touch controls. The stick has a small dead zone and ignores a second pointer until the current one releases.

The touch Brake / Reverse control now stops forward movement, then backs up. Saved games resume with the occupied vehicle stationary. Existing story saves and decisions remain compatible.

Focused regressions cover repeated hidden-map drawing, 3× portrait/landscape buffers, allocation budgets, backing-store release, braking/reversing out of a wall, and safe vehicle resume. The development server exposes `/__qa/mobile` for narrow and landscape layout checks; this page is outside the production assets and does not emulate physical Safari or device pixel density.

## Development and deployment

Node 22 or newer. The static client and pure simulation tests need no installed dependencies. The multiplayer server needs the pinned `ws` package:

```sh
npm ci --prefix games/suncoast --ignore-scripts
npm test --prefix games/suncoast
npm run test:server --prefix games/suncoast
npm run dev --prefix games/suncoast
```

`server.mjs` serves the game, room WebSockets at `/ws`, and aggregate health at `/healthz`. Production keeps the existing `public/` static site and adds a separate Node web service. The original frontend URL is retained so browser-local solo saves remain on their existing origin.

- Source: `shnider42/daily_flyer`, branch `feat/suncoast`
- Render build: `node --test games/suncoast/tests/*.test.mjs`
- Publish directory: `games/suncoast/public`
- Game URL: `https://dfe-suncoast.onrender.com/`
- Multiplayer backend: `https://dfe-suncoast-coop.onrender.com`
- Backend build: `npm ci --prefix games/suncoast --ignore-scripts && npm test --prefix games/suncoast && npm run test:server --prefix games/suncoast`
- Backend start: `node games/suncoast/server.mjs`
- Backend runtime: Node, one free instance in Virginia, `NODE_ENV=production`
- Public health: `/healthz` (no room codes, identities or reconnect tokens)

The first connection can take time while the free service wakes. The UI reports connecting and reconnecting states. `PORT` is honored, the server binds to `0.0.0.0`, and production accepts WebSocket origins only from the two configured Suncoast hosts. Localhost development is allowed outside production. Additional first-party hosts can be declared with `SUNCOAST_ALLOWED_ORIGINS`. The development-only `/__qa/mobile` route is disabled in production.

The existing DFE Flask entry point and other deployed games are not changed by this new branch.

### Architecture

`world.mjs` owns city geometry, named places and vehicle definitions. `content.mjs` owns authored missions, contact text and endings. `sim.mjs` is a DOM-free simulation, stepped at 60 Hz with bounded catch-up. `renderer.mjs` uses culled, cached terrain chunks and uses native screen density up to 3× within a 4-million-pixel main-canvas budget. Maps stay within 2 million pixels; terrain rasterizes at camera density with a 48 MiB cache budget. `app.mjs` owns responsive UI, input and local persistence. `audio.mjs` creates original effects after a user gesture. `coop-game.mjs` adapts the solo rules to personal actors and one shared world, `coop-client.mjs` owns transport and prediction, and `server/rooms.mjs` owns membership, authority and room lifecycle.

### Verification and current limits

Focused behavioral tests exercise every authored mission, island order and early entry, world collision, witnesses and search decay, death versus arrest, checkpoint choice/reward persistence, saves, boat deliveries, races, medical transport, services and impound access. Geometry checks verified that every named building is reachable and every enterable exit is clear.

A real Chromium browser pass exercised the opening, interiors, dialogue, driving/braking, a witnessed incident, police search decay, phone-sized layout, on-screen stick movement, and touch interaction. This is not a physical iPhone/Safari performance certification. A large procedurally reactive population, advanced traffic navigation, and authored interior combat encounters remain outside this release.

### Multiplayer verification in 0.2.0

Focused co-op rules checks cover one shared city clock, four independently controlled actors, driver/passenger races and handover, all eighteen authored missions with a guest completing physical objectives, current dialogue IDs, personal arrests and recovery, independent services, interior damage isolation, no crew-friendly gunfire, separate checkpoints and malformed checkpoint rejection. Existing solo missions, branching choices, recovery, mobile reverse/braking and high-density canvas allocation checks remain passing.

Real Node WebSocket integration tests exercise four clients, a rejected fifth seat, reconnect identity and bad tokens, host transfer, short attack taps, stale-input braking, action deduplication, checkpoint restore, congestion isolation, HTTP/origin boundaries and the actual browser client module with an injected WebSocket implementation. Separate client tests cover ACK replay, scene-transition resets, input coalescing, resume-token retention and solo-save isolation.

The available preview browser failed during its own initialization before it could open this release. Consequently the new UI has source/layout review and automated integration coverage, but this release does **not** claim a fresh visual browser playtest, physical iPhone/Safari validation, or measured four-player Internet latency. The pre-existing solo browser pass described above belongs to 0.1.1.
