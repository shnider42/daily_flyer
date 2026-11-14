# Corner Pocket

A two-player 3D eight-ball game in the DailyFlyer collection. A warm pool hall,
clear ball markings, a full-table camera, and controls that work with a mouse,
keyboard, or touch screen.

[Play Corner Pocket](https://dfe-corner-pocket.onrender.com/)

## Run

Node 22 or later. No package installation or external asset request is needed.
Three.js r160 is vendored with its MIT license.

```sh
node games/corner-pocket/server.mjs
```

Open `http://localhost:4182`. The service binds `0.0.0.0` and honors `PORT`.

## Play

- **Play a friend online:** enter a display name, create a private room, and share
  its invite link or six-character code. The host starts when both players are
  connected. Exactly two human seats are available.
- **Two players, one screen:** enter both names and alternate shots on the same
  device. All aiming and shooting controls are shared.
- **Practice:** control both sides, move the cue ball, and re-rack from the menu.
  The practice partner is another turn you control, not an AI opponent.

Click or touch the cloth to aim. Drag across the table to refine the direction,
set shot power, and press **Shoot**. A click on the table never shoots by itself.
The physical guide shows the first contact, ghost-ball position, and a short
projected path; it is an aid rather than a guarantee of a pot.

| Control | Action |
| --- | --- |
| Left / right arrows | Fine aim |
| Shift + left / right | Very small aim adjustments |
| Up / down arrows | Shot power |
| Space | Shoot |
| C | Angled / overhead view |
| G | Toggle guide |
| On-screen fine-aim arrows | Tap or hold to adjust |
| Cue spin | Draw / center / follow |

The opening shot defaults to 80% power. Regular shots default to 38%, which
leaves useful room for both touch shots and firm banks. In portrait orientation
the table turns vertically so the playable area remains large. Audio is optional
and begins only after a user gesture. Menus pause local play; online shots keep
running on the server.

## House eight-ball rules

The game states its house rules in **How to play**. It is a concise playable
ruleset rather than a claim of tournament certification.

1. Break the rack. Pocket an object ball or drive at least four distinct object
   balls to cushions. A successful potted break keeps the turn; a dry legal
   break passes it. Groups remain open after the break.
2. The first legal potted solid or stripe after the break assigns the groups.
   Pocketing your group on a legal shot keeps your turn.
3. Contact a legal target first. After that contact, a ball must be pocketed or
   a ball must reach a cushion. The 8 is not a legal first target on an open table.
4. Scratching, missing everything, striking the wrong group first, an insufficient
   break, or failing the after-contact cushion/pocket rule gives the opponent ball
   in hand. Place the cue ball on clear felt, then aim and shoot. Placement can be
   adjusted until the shot is taken.
5. Clear your group before taking the 8-ball shot. Call one of the six pockets,
   then pocket the 8 legally to win. An early 8, wrong called pocket, or foul with
   the 8 loses the rack. Clearing the last group ball and the 8 in one shot does
   not win. An 8 on the break is spotted instead of deciding the rack.

There is no shot clock. Rack scores carry through a rematch and the breaker
alternates. Online rematches require both players to agree.

## Physics and presentation

`public/engine.mjs` owns a 2.54 × 1.27 metre playfield, standard-sized balls,
six pocket mouths, and matching cushion segments. The simulation uses a fixed
240 Hz step with adaptive substeps for fast contacts, equal-mass ball collisions,
cushion restitution, cloth drag, bounded draw/follow, pocket detection, settling,
and rule resolution. Local and server play use the same engine.

The Three.js renderer uses generated felt and wood textures, numbered solid and
striped ball textures, rolling rotation, contact shadows, lamp reflections, cue
movement and pocket drops. It uses the engine's geometry and aim prediction.
The renderer caps resolution, uses a bounded shadow map and fits the entire
table in both camera modes. A playable Canvas view covers devices without WebGL.
Local physics keeps elapsed time separately from visual animation, so a slow
renderer does not slow down a shot. Hidden tabs and local dialogs reset that
clock, preserving a pause instead of catching up when the player returns.
This is planar pool: jump shots, elevated-cue masse shots, and side english are
not implemented. The draw/follow model is intentionally modest.

## Online architecture

One Node HTTP service serves the game and its same-origin JSON/SSE API. The
server owns the balls, contacts, groups, fouls, active player and result. Clients
send aim, power, spin and pocket calls; they cannot submit a score or a pot.
Snapshots arrive at up to 20 Hz while a shot moves and are interpolated for display.

Each seat has a separate opaque credential held in that browser tab's
`sessionStorage`, sent in an Authorization header. The invitation contains only
the room code. Sequence numbers plus rack and shot identities reject retries,
late actions and out-of-turn shots. Cosmetic aim traffic cannot block a shot.

A dropped connection does not cancel an accepted shot. The balls settle, then
both players must be connected before the next shot. Refreshing the same tab
reclaims its seat without resetting the table. After a 60-second absence, the
remaining player can claim the rack. Explicitly leaving an unfinished rack
awards it to the other player. A new person cannot replace an occupied seat.

Rooms are held in memory on one server instance. Restarting, redeploying, or a
hosting shutdown ends them; abandoned rooms expire. A new deployment should
therefore be treated as a break in active play. Horizontal scaling would require
room routing and shared authority before increasing the instance count.

The HTTP layer bounds room counts, request bodies, command rates, stream counts,
and stream buffers. It validates origins and serves only the public directory.
It supports compressed SSE, heartbeat/reconnection and graceful shutdown.

## Data

There is no account, email collection, analytics script, advertising, external
font request, or application database. The game holds display names, room state,
shot inputs and rack scores temporarily. The browser stores chosen names and
sound/view/guide preferences in `localStorage`; the seat credential is confined
to `sessionStorage`. Hosting infrastructure can keep normal HTTP access logs.
Clearing this site's browser storage removes the browser's saved settings and
room credential.

## Verification

```sh
node --test games/corner-pocket/tests/*.test.mjs
```

Tests cover physical breaks and all pocket openings, collision and cushion
behavior, frame-rate independence, draw/follow, first-contact and after-contact
rules, group assignment, ball-in-hand validation, 8-ball outcomes, room capacity,
authority, retry/sequence handling, reconnects, rematch voting, and actual
two-client HTTP/SSE play using the shipped online client.

The release passed 61 automated tests, including the same shot at 60 FPS and
1 FPS, pause/resume timing, and graphics-context loss. Live browser checks covered
two separate tabs joining a room, breaking, reconnecting, passing the turn and
leaving, plus same-screen play. The automated browser had WebGL disabled, so
those visual checks used the Canvas view; the 3D scene received structural,
camera-fit, inverse-aiming and resource checks rather than a hardware-rendered
visual inspection.

## Deployment

Dedicated repository branch: `feat/corner-pocket` in `shnider42/daily_flyer`.
Use one Node Render web service in Virginia, alongside the existing DFE games.

- Build: `node --test games/corner-pocket/tests/*.test.mjs`
- Start: `node games/corner-pocket/server.mjs`
- Health endpoint: `/health`
- Runtime: Node 22 or newer
- Single instance; no database or secrets required

The other DFE game services use their own branches and are unaffected by this
game's source and service.
