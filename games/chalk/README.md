# CHALK

A standalone Daily Flyer top-down squad game inspired by the Battle of Mogadishu, 3–4 October 1993. Lead a four-person fictional squad or play alongside its computer-controlled leader. This is a playable single-player campaign with four short missions, not a historical reconstruction or a film adaptation.

## Play

Select any mission and choose **Lead the squad** or **Follow the leader**. Story, Standard, and Veteran change combat pressure; Simple, Moderate, and Expert change guidance. Simple adds a small directional aim assist to touch controls. Mission completions and preferences are stored locally in this browser. Reloading restarts an in-progress mission.

| Mission | Objective flow |
| --- | --- |
| Cordon | Reach the rally, hold a collection point, and extract with the squad. |
| First Crash | Reach a helicopter wreck, stabilize two crew members, and escort them to safety. |
| Night Relief | Meet the relief vehicles, accompany them past two route obstructions, and cover casualty loading. The final phase requires every living squad member present and standing. |
| Dawn Mile | Move through three rally positions and bring the surviving squad to the aid station. |

The missions share a compact city street layout, with varying blocks, landmarks, objectives, and afternoon/night/dawn lighting. They are intentionally short; an efficient route takes roughly one to two minutes, with human play varying by exploration and combat. Vehicles follow a route and wait for the squad. They do not have a damage model in this version.

## Roles and controls

As **Hale**, command Move, Regroup, Hold, and Assist. As **Mercer**, Hale navigates mission objectives and waits if you fall behind; request Ready, Wait, or Need help. Switch roles from pause without restarting the mission.

| Input | Action |
| --- | --- |
| WASD or arrows | Move |
| Mouse / left button | Aim / fire |
| Shift | Sprint; firing is disabled while sprinting |
| E, held | Assist, stabilize, clear an obstruction, or bandage yourself |
| R | Reload |
| G | Throw smoke toward your aim |
| Right click or T | Place a squad destination in leader mode |
| Q / H / F | Regroup / Hold / Assist; member mode uses Ready / Wait / Need help |
| M | Battlefield map |
| Escape | Pause |

Touch uses a left movement stick, a right aim/fire stick, and separate action buttons below the battlefield. The pause menu can enable touch controls manually. Landscape and portrait layouts are supported. Audio starts only after a user gesture, and can be disabled. Reduce motion suppresses the drifting atmosphere.

Squad members navigate around buildings, fire at visible armed opponents, and help downed teammates. The medic can recover the player. Ammunition, smoke, and bandages are limited. Squad members who are down for too long can be lost; the entire squad being incapacitated or the player being unrecoverable ends the mission. Mission results emphasize survival, rescues, civilian harm, and completion time rather than kills.

## Historical framing

The setting is grounded in the October 1993 battle and its shift from raid to rescue. Names, dialogue, squad composition, maps, compressed timing, and outcomes are fictional. The game acknowledges U.S., Malaysian, and Pakistani participation in the relief effort and distinguishes Somali civilians from armed fighters. Civilians are unarmed, seek shelter, are excluded from AI targets, and can be injured by player fire; that harm is recorded in the debrief. No film dialogue, likenesses, music, or art is used.

Primary references are included in the game's **Historical context** panel:

- [U.S. Army Center of Military History: The U.S. Army in Somalia, 1992–1994](https://history.army.mil/portals/143/Images/Publications/catalog/70-81-1.pdf)
- [U.S. Army veteran accounts of the Mogadishu rescue](https://www.army.mil/article/113311/we_didnt_leave_anybody_behind_10th_mountain_division_veterans_reflect_on_mogadishu_rescue_missi)
- [U.S. Department of State: Somalia, 1992–1993](https://history.state.gov/milestones/1993-2000/somalia)

## Run and validate

Requires Node 22 or later; no package installation is needed.

```sh
npm start --prefix games/chalk
npm run build --prefix games/chalk
```

The local server defaults to port 3000, accepts `PORT` or `--port`, and supports the managed preview's `--host` option. Production is a static site with `games/chalk/public` as its publish directory.

The simulation is deterministic and independent of the DOM. Fourteen focused tests cover mission routes, commander/member role differences, cohesion, ammunition, smoke, recovery of a downed player, civilian targeting, all four AI-led mission progressions, loss states, recovered crew, and actor/wall collision ordering. Browser QA covers desktop controls, role switching, pause, mission selection, and portrait/touch layout. A physical iPhone/Safari session is not included in this verification.

Files:

- `public/sim.mjs`: collision, navigation, combat, squad AI, civilians, and mission progression.
- `public/renderer.mjs`: original Canvas 2D artwork, city cache, camera, effects, and map.
- `public/app.mjs`, `index.html`, `style.css`: menus, input, HUD, local preferences, and debrief.
- `public/audio.mjs`: bounded original WebAudio effects and ambience.
- `server.mjs`: development preview only; production needs no game server.

No accounts, analytics, chat, user uploads, or remote saved games are used. Multiplayer and mid-mission saved checkpoints are outside this first version.

## Deployment

Repository: `shnider42/daily_flyer`, dedicated branch `feat/chalk-mogadishu`.

Render static site: `dfe-chalk`. Build command: `npm run build --prefix games/chalk`. Publish directory: `games/chalk/public`. Set `SKIP_INSTALL_DEPS=true` because there are no dependencies. Keep unrelated DFE branches and services unchanged.
