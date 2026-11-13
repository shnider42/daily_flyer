# Pocket Baseball — version 0.5

A solo and private-room 1v1 baseball game in the Daily Flyer repository, inspired
by the readable pitching, timing and broadcast presentation of early-2000s
baseball games. Original fictional clubs: Boston Harbor and Brooklyn Foundry.

## Play

Serve `public/` with any static HTTP host. For local development:

```sh
node games/pocket-baseball/server.mjs
```

Open `http://localhost:4173`. The default is a three-inning exhibition, with the
human playing the visiting team. Six- and nine-inning games and batting practice
are also available. Tied games continue into extra innings. Baserunning practice
starts with runners on first and third so leads, steals and tag-ups are available
immediately. Choose **Play a friend** for an online match.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Aim bat / locate pitch | Left pad | Arrows or WASD |
| Contact swing | SWING | Space |
| Power swing | POWER | Shift |
| Choose pitch | Current pitcher's repertoire buttons | 1–4 |
| Pitch meter | Tap PITCH, then RELEASE in gold | Space twice |
| Throw / queue a throw | 1ST, 2ND, 3RD, HOME diamond | 1–4 (4 is home) |
| Try an extra base | GO 2ND / GO 3RD / GO HOME | E / Space |
| Hold at next reachable bag | HOLD | Q |
| Return to last touched bag | RETURN | B |
| Select another runner | Runner chips | R |
| Extend / shorten a lead | LEAD + / BACK before the delivery | X / Z |
| Queue or cancel a steal | STEAL before the windup; send during delivery | C |
| Pick off a runner | Base buttons in HOLD THE RUNNERS | Touch or mouse |
| Tag up after a fly catch | TAG UP / TAG & GO | E / Space |
| Next pitch / change sides | Result card button | Enter / Space |
| Pause | Pause button | Escape |

Rookie, Club and Pro change timing forgiveness and CPU skill. Simple, Moderate
and Expert change guidance only. These settings are intentionally independent.
Simple shows a timing cue and strike zone; Moderate removes the timing cue;
Expert minimizes explanatory overlays.

## Ballparks

The **Ballpark** selector changes the menu preview and the actual field in
exhibitions, both practice modes, and private 1v1. **Fenway-inspired** is the new
default; **Harbor Field** retains the original park. The room creator chooses
the park for both online players, and reconnecting restores that same field.

The Fenway-inspired field uses the Red Sox's published distance markers:

| Landmark | Distance from home |
| --- | --- |
| Left-field line | 310 ft |
| Left-center | 379 ft |
| Center | 390 ft |
| Deep-center triangle | 420 ft |
| Deep right | 380 ft |
| Right-field line | 302 ft |

The straight left-field wall is 37 ft 2 in high, with a manual-scoreboard style
face and seats above it. Center-field walls reach 17 ft; the bullpen fence is
5 ft and the short right-field section is 3 ft. The outfield is asymmetric and
has actual corners, including the deep-center triangle. The outline between
the published markers is a playable approximation, not a surveyed reproduction
of Fenway Park. The fictional clubs and original game branding remain.

`public/parks.mjs` is the common source for field dimensions, wall segments,
and heights. Both renderers and the authoritative simulation use it. A drive
below the Monster's top rebounds into play; a ball must clear the local wall
height to become a home run. Wall rebounds use the struck wall's direction,
including at the angled center-field boundary. Fielders stay inside the chosen
park's boundary. Park selection does not change batting timing or contact power.
Fair balls that bounce over a low fence receive a ground-rule double, with
runners awarded two bases from their original positions. An airborne carom
from above a lower wall can clear that lower wall for a home run; an escape
after striking a lower wall and clearing a higher one receives two bases.

Dimension references: [Red Sox facts and figures](https://www.mlb.com/redsox/ballpark/facts-figures),
[Fenway information guide](https://www.mlb.com/redsox/ballpark/information/guide),
and [Fenway tours](https://www.mlb.com/redsox/ballpark/tours) for the more precise
37 ft 2 in Monster height. Boundary awards follow the relevant
[MLB ground rules](https://www.mlb.com/official-information/umpires/ground-rules).

## Pitchers and pitch balance

Choose **Your pitcher** and **Opponent** before an exhibition. Batting practice
uses the chosen opponent. Both clubs now have named nine-player batting orders
and eight-pitcher staffs. These are original fictional players with deliberately
balanced ratings, not current MLB rosters or measured professional pitching data.

| Profile | Repertoire | Tradeoff |
| --- | --- | --- |
| Balanced | Four-seam, changeup, curveball, slider | Original familiar mix and dependable command |
| Power | Four-seam, slider, cutter, splitter | Higher velocity with less forgiving command |
| Movement | Sinker, changeup, curveball, cutter | More movement and changes of shape |
| Knuckleball | Knuckleball, four-seam, changeup | Three pitches, an approximately 82 mph fastball, and imperfect knuckleball command |
| 104 mph | Four-seam, slider, splitter | A fresh, well-released fastball can reach 104 mph; weaker command and short relief stamina |
| Southpaw | Four-seam, two-seam, sweeper, changeup | Left-handed release with a high leg kick |
| Sidearm | Two-seam, slider, slurve, changeup | Lower arm slot and a different approach angle |
| Finesse | Eephus, screwball, curveball, four-seam | Left-handed submarine delivery; changing speeds instead of overpowering hitters |

Knuckleball flutter is generated once from the seeded pitch state. Rendering
does not invent movement or consume random values. Even a well-executed knuckler
has some control uncertainty; poor releases make a flat, hanging pitch more
likely. The hanging state is not announced before the batter must decide.
Sinkers, cutters and splitters have different speeds, break directions and late
movement, rather than being renamed copies of the original pitches.

The familiar batting timing and aiming controls remain. Individual batting
ratings apply modest contact and power differences, and runner speed follows the
player. Early/late pull direction mirrors for left-handed batters. Switch hitters
take the opposite side against the current pitcher's throwing hand.

## Rosters and pitching changes

Open **Rosters** from the home screen or the team control during a game to inspect
either club's batting order and bullpen. Each player has a name, jersey number,
position and batting/throwing hand. The bullpen shows pitch selection, delivery,
pitch count and remaining energy. Starting pitcher choices are saved; each fresh
game begins with a rested staff.

Pitching changes are available at a dead ball: before a delivery, on the result
card, or between halves. The replacement keeps the current count, outs, runners
and score. A removed pitcher cannot return. You can also prepare your own next
inning's pitcher while your team is batting. There is no warm-up delay or
three-batter minimum in this arcade implementation. Opening the roster calls time;
closing it only resumes a pause that the roster itself requested.

Pitch counts reduce energy, then velocity and command. The CPU also uses its
bullpen as a pitcher tires. Batting practice keeps the opponent fresh so it
remains useful for learning a specific repertoire. The two 104 mph specialists
are **Jace Navarro** for Boston and **Troy Vance** for Brooklyn. The top velocity
is a ceiling, not a promise for every release.

Five deliveries have different poses, release heights and windup lengths:
classic windup, high leg kick, compact stretch, sidearm and submarine. A lefty
mirrors the throwing arm, glove, release position and lateral pitch movement.
The ball leaves the rendered throwing hand at the simulated release time.

## Hit by pitch

Pitch location now reaches the batter's box, so an inside miss can hit the batter.
The engine checks the ball's swept path against the batter's body on either side
of the plate, including at 104 mph. The batter recoils and the ball becomes dead.
An awarded hit-by-pitch sends the batter to first, advances only forced runners,
and can force in a run or end a walkoff. It does not add a hit.

A swing or a strike takes precedence over an award. Even in that case the body
contact stops a concurrent steal, rather than letting a dead ball become a live
catcher's throw. The bounded input allowance remains open for valid delayed swing
messages before the final call. Injuries and ejections are not simulated.
Rule reference: [MLB hit-by-pitch glossary](https://www.mlb.com/glossary/standard-stats/hit-by-pitch).

## Decisions while the ball is in play

**Running:** the batter initially heads for first. Tap **GO 2ND** immediately
after fair contact to try for a double; it can be queued before reaching first.
The selected runner and destination are shown above the buttons. Another press
adds the next base. **HOLD** stops at the next reachable bag, and **RETURN** goes
back to the last touched bag when legal. Select a runner chip when several
runners are aboard. Running past first is a risk: throws, tags and runner travel
are resolved in the same simulation.

**Defense:** fielders move to the ball automatically. Choose any of the four
bases while they are gathering it. The choice queues a physical throw; selecting
another base while the ball is already traveling queues the following throw.
It never changes a ball's destination in midair. Simple guidance suggests a play
without overriding the player's choice. Forces require the appropriate runner
to be forced; other outs require a tag. A relay can produce another out when the
timing allows it.

**Leads and steals:** the ON BASE card selects a runner and shows their lead.
LEAD + and BACK move between on-base, normal and aggressive leads. These are
physical offsets of zero, 2.4 or 4.8 metres. A longer lead helps the runner's jump
but increases both the distance and automatic reaction time needed to return.
STEAL queues a jump on the delivery; a second press before the windup cancels it.
The runner can also be sent during the delivery. Slow pitches provide more
running time. A lead runner must be going before a trailing runner can steal
into their occupied bag. The catcher then uses the same physical throw and tag
system as other fielding plays. A steal does not create a hit or consume the
batter. With runners aboard, the CPU leaves four seconds to make a choice before
pitching; the original empty-base pace is preserved.

**Pickoffs:** choose an occupied base before delivering a pitch. The pitcher
throws over, the receiver covers the bag, and the runner returns physically.
RETURN can react faster than the automatic return from an aggressive lead. An
explicit arcade rule allows **two pickoff attempts per batter**. This is not an
implementation of professional disengagement/balk rules.

**Tag-ups:** catching a fly or foul fly records the batter's out and keeps the
play live for the remaining runners. A runner who left the bag returns to touch
it after the catch. TAG & GO queues an advance after that retouch; TAG UP sends
a runner who has already retouched. The defense can double off an early runner
at the original base. Legal scoring fly outs produce sacrifice-fly results.
Third-out catches cancel the run; third-out retouch/tag plays use the appropriate
time of the home crossing.

## Private 1v1

Choose your pitcher, then **Play a friend**. The creator shares a six-character
room code and plays Boston Harbor; the guest brings their own pitcher and plays
Brooklyn Foundry. The creator's innings and difficulty apply to both teams.
Each player can retain their preferred presentation guidance. Both press READY
to start and acknowledge the result/half-inning card before the next play.

The server owns the simulation, score, bases, counts, catches and calls. Either
player can call time. A manual pause must be cleared by the player who called
it; a disconnected player gets 120 seconds to reconnect to the same seat.
**Rejoin your match** recovers the saved seat after a refresh in the same tab.
Leaving explicitly ends the room. Rooms are temporary and do not survive server
restarts. There are no accounts, public room directory or matchmaking.

Pitching staffs, pitch counts and substitutions also belong to the server.
Managers can change only their own pitchers, including during their own time-out;
the change does not clear either player's pause. Pitch and play identifiers reject
stale changes, and reconnecting restores the current pitcher and used bullpen.

The browser previews the swing immediately and extrapolates movement briefly.
Official contact and scoring wait for the server. The transport validates room
generation, side, pitch identity and monotonically increasing action sequence;
identical retries do not repeat an action. Connection timing is measured by a
server challenge, with accepted swing rewind bounded to at most 200 ms.
Inputs outside the connection window are rejected rather than moving a past
pitch into a later play. This is a casual private-room implementation, not an
anti-cheat competitive service: clients receive reproducible pitch trajectories
and submit their release-meter quality.

## Implemented baseball

- Balls, strikes, swings and misses, takes, two-strike fouls, strikeouts, walks and hit-by-pitches.
- Forced walk advancement, hits, base occupancy, runs, outs, lineup rotation,
  half innings, skipped final home halves, walkoffs and extra innings.
- Thirteen pitch types across eight distinct repertoires. Pitch-meter execution
  affects location and effectiveness, including knuckleball control and hang risk.
- Named lineups and bullpens, left/right/switch batting, left/right pitching,
  five deliveries, pitcher fatigue, CPU pitching changes and a 104 mph specialist.
- Contact and power swings, timing-dependent spray, spatial bat aim, grounders,
  line drives, fly balls, physical catches, ground pickups, throws to every base,
  wall rebounds, and fair home runs.
- Articulated player rigs, coordinated deliveries and throwing motions, runner
  movement and slides, broadcast camera transitions, a physical park
  scoreboard, pitch/contact feedback, bat/glove/crowd sounds and organ accents.
- Physical lead-offs, queued steals, catcher throws, bounded pickoff attempts,
  tag-up retouching, doubling off, sacrifice flies and a baserunning practice mode.
- Private authoritative two-player rooms, shared readiness and pauses, bounded
  swing compensation, and temporary same-tab rejoin.

### Current limits

Field movement remains assisted; baserunning destinations and throw choices are
player decisions. It does not yet implement bunts,
pinch hitters, defensive substitutions, balks,
dropped-third-strike advances, infield fly, or a complete appeal
system. Ball four awards mandatory walk advancement and ends a concurrent steal;
optional further advances on a live walk are not simulated. Tag-up controls
automatically enforce retouching instead of allowing intentional missed-base
appeals. This remains an arcade game rather than a full professional rules
simulator. The clubs use fictional players, without real-world roster or rating claims.

Pitch speed labels describe the pitch profiles; visible pitch flight is slowed
for readable arcade timing. Ball size is modestly exaggerated for phone screens.
Neither presentation choice changes the simulation's collision radius.

## Engine and rendering

`public/engine.mjs` is a headless, seeded, fixed-step 120 Hz simulation. It has no
DOM, audio, rendering or networking dependency. The client issues commands;
rules own the outcomes. `snapshot()` / `restore()` preserve simulation, random
state and clock remainder. Events drive presentation without feeding it back
into physics.

`public/renderer.mjs` uses the vendored Three r160 runtime already used by DFE
Skyward. The same fence-radius function drives the park and collisions. Ball
presentation interpolates prior/current positions, while swept collision and
analytic pitch timing avoid fast-ball tunneling. Fixed field textures, shared
geometry, an instanced crowd, cached scoreboard textures, capped device pixel
ratio and adaptive resolution keep GPU work bounded. The drawing buffer is only
resized when dimensions or pixel ratio actually change.

Player detail is grouped into joint meshes to keep draw calls bounded. The
strike zone uses quieter thirds and clearer corner markers. A pitch-location
mark appears only after the pitch resolves; it does not reveal the target or
announce ball/strike while the ball is in flight.

The version 0.3 park adds dugout benches, rails and coolers, brickwork, a backstop,
grandstand entrances, a batter's eye, lit skyline windows, flags and stadium-light
glow. Architecture is batched and repeated seats, crowd heads and windows are
instanced. Player silhouettes and shading are more rounded, with uniform detail,
glove lacing, lead-off stances, receiving poses and eased animation recovery.
Small slide/run dust effects use fixed presentation-only pools. Both renderers
share the same motion sampler and preserve the pitch sightline.

When hardware graphics are unavailable, the client replaces the drawing canvas
and uses `fallback-renderer.mjs`: a perspective Canvas renderer of the same world
coordinates. It keeps the game playable with simpler geometry and shading.
`?software=1` selects this path explicitly. The condensed display font is a local
Latin subset of Open Sans Condensed Bold; its Apache 2.0 license is included.

Phone input follows the corrected DFE touch behavior: distinct pointer ownership
for aiming/actions, swing registration on pointerdown, independent cancellation,
safe-area layout, and no pause from ordinary foreground Safari focus churn.
Actual visibility loss pauses play. Audio starts only after user interaction.

Local solo play accepts at most 100 ms of input delay and rejects out-of-window
timestamps. Input timestamps account for the rendered interpolation delay.
Online uses the separately bounded server-measured connection budget described
above. High latency still matters; compensation does not make a slow connection
equivalent to a local game.

## Online architecture

The headless engine, command entry point, stable pitch identity, seeded pitch
parameters, event stream and serializable snapshots form the reusable boundary.
`multiplayer.mjs` provides the in-memory room authority. `server.mjs` serves the
API and static files using Node's built-in HTTP server. `public/online.mjs`
provides a browser session with authenticated fetch/SSE and one stable game view.
There are no package dependencies. Seat credentials use Authorization headers
and never appear in room URLs. Active state packets are sent at most 20 times a
second; inactive rooms receive one per second plus immediate changes. SSE is
gzip-compressed with synchronous flushing; recent events are sent incrementally.
There is an eight-room capacity limit, bounded requests and stream buffering,
and automatic expiry of abandoned seats.

Cancellation generation checks prevent a late create/join response reopening a
hidden game after the user leaves. `leave()` ends the room and clears the saved
seat; `disconnect()` / `dispose()` preserve the seat for recovery after temporary
connection failure. Prediction cannot publish a speculative score or called pitch.

## Verification

```sh
node --test games/pocket-baseball/tests/*.test.mjs
```

The tests cover deterministic 30/60/120 Hz frame partitioning, snapshot replay,
count rules, forced walks, two-strike fouls, inning endings, walkoffs, home runs,
fence rebounds, swept collision, rolling friction, physical base arrival,
repertoires, knuckleball replay, force/tag plays, runner decisions, throw relays,
third-out scoring, and bounded swing input. Added tests cover leads, steals,
pickoff races, tag-up retouching, sacrifice flies, third-out combinations, both
human sides, room lifecycle, sequence/role/pitch validation, delayed swings,
prediction boundaries, compressed HTTP/SSE convergence and cancellation races.
Roster checks cover substitution ownership and reentry, fatigue and practice
stamina, both pitching hands, switch hitters, the 104 mph ceiling, body sweeps,
forced HBP awards, dead-ball swinging strikes, delayed inputs and contact behind
the plate. Online tests also change pitchers across two real HTTP/SSE clients.
Rendering contracts check every delivery's release alignment in both hands, hidden endpoint markers, visible
lead runners and finite, non-mutating pose samples. The first-pass batting
contract is also checked against recorded contact results. A browser check is needed for rendering, input,
sound unlock and responsive layout; headless simulation tests do not measure
real iPhone GPU performance or real network multiplayer behavior.

`?debug=1` enables the explicit developer inspection hook. It is absent from
ordinary sessions and is not an authorization boundary. Online commands are
validated at the match server regardless of the local view.

## Hosting and data

Deploy branch `feat/pocket-baseball` from `shnider42/daily_flyer` as a Render Static
Site, publishing `games/pocket-baseball/public`. Build command:

```sh
node --test games/pocket-baseball/tests/*.test.mjs
```

Set `SKIP_INSTALL_DEPS=true`: there is no install or external asset step. Solo
gameplay remains local and works without the match server. All runtime assets
are included. The optional web service uses the same branch and build command,
with start command `node games/pocket-baseball/server.mjs`. It listens on `PORT`
at `0.0.0.0`. `BASEBALL_ALLOWED_ORIGINS` lists trusted frontend origins. Health
endpoints are `/api/health` and `/health`.

The existing static game remains at `https://dfe-pocket-baseball.onrender.com/`.
Its public match endpoint is configured in `public/online-config.mjs` as
`https://dfe-baseball-matches.onrender.com`. Local previews use their own origin.
The match server uses Render's Free compute plan in Virginia; an initial online
connection may take about a minute after it has spun down. The solo game does
not have that startup dependency. A match server restart ends in-memory rooms.

Preferences are saved in browser localStorage. Online stores a random room/seat
credential in sessionStorage for same-tab recovery. Solo matches stay in the
browser; online matches stay in server memory and expire. There is no game
analytics, account data, persistent match database, telemetry API, cookie
identifier or third-party font/asset request. Online play sends game inputs,
state and connection checks to the dedicated match server. Hosting infrastructure
can still process normal request metadata.

## DFE provenance

The new isolated branch starts from Pocket Sports commit
`b2067c82307f01fcb4d4331b443e3d3a617a95fc`; existing theme files are untouched.
Three.js and its MIT license come from Skyward commit
`419bb35ec855714e0d1289ade2f5a4ff8f2c10e6`. Rendering/timing patterns were checked
against `games/skyward/public/presentation.mjs` and `renderer.mjs`; touch pause
behavior was checked against current Further In `further_in/dist/app.mjs`.
The game has original procedural visuals and synthesized audio.
