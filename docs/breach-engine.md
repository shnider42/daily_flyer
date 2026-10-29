# BREACH implementation contract

An original retro first-person game delivered through DailyFlyer's custom theme hook.
Blacksite 07 introduces power, access keys, extraction, a secret, and a checkpoint.
Dead Relay adds a separate facility with two relay branches that unlock a data
vault before the return to extraction.

## Modules and ownership

- `daily_flyer/themes/breach_assets/core.mjs`: deterministic simulation and level data.
- `daily_flyer/themes/breach_assets/renderer.mjs`: Three.js renderer and original procedural pixel art.
- `daily_flyer/themes/breach_assets/app.mjs`, `index.html`, `style.css`: interface, input, sound and lifecycle.
- Python theme, export builder, deployment, integration verification: parent agent.

## Shared contract

Coordinates are `{x,z}` in world units. One map cell equals one world unit. Cells
are indexed `grid[z][x]`; `#` is solid and every other character is walkable,
subject to doors. Cell centers are at `x+.5,z+.5`. Player angle 0 faces north (-z),
positive angles turn right: forward is `(sin(angle),-cos(angle))`. Three.js camera
rotation around Y is `-angle`. Wall height is approximately 2.5, eye height 1.25.

`core.mjs` exports `LEVEL` (the original Blacksite default), `LEVELS`, `MISSIONS`,
`getLevel(id)`, and `Game`. Mission ids are `blacksite-07` and `relay-09`.
`MISSIONS` provides the menu's `id,levelId,name,number,subtitle,briefing,steps`.

`LEVEL`: `{id,name,width,height,grid,spawn,doors,interactables,pickups,enemies,zones}`.
Spawn is `{x,z,angle}`. Doors have `{id,x,z,axis,requires,open}` where `x,z` are
cell-center world positions, axis is `x` or `z` (long dimension), requires is null,
`key`, `power`, or `relays`. Interactables have `{id,type,x,z,label}` with type
`power`, `exit`, `secret`, or `relay`. Relay progress uses their existing `used`
flags. Pickups have `{id,type,x,z,amount}` with type `ammo`,
`shells`, `health`, `armor`, `shotgun`, or `key`. Enemies have
`{id,type,x,z,health,maxHealth,alive}`; types are `runner`, `spitter`, `brute`.
Zones have `{name,x1,x2,z1,z2}`.

`new Game({mission:'blacksite-07',difficulty:'standard',guidance:'simple',aimAssist:true,seed:1})`.
`game.level` contains the selected level, including `missionId`. `game.state` contains:

```
status: 'ready'|'playing'|'paused'|'dead'|'won'
player: {x,z,angle,health,armor,ammo:{pistol,shells},weapon:'pistol'|'shotgun',hasShotgun,key}
enemies, pickups, doors, interactables, projectiles, effects
power: boolean, secretFound: boolean, time: seconds, kills, shots, hits
```

Arrays are mutable runtime copies; entities retain stable ids. Pickups carry
`collected`, enemies `alive`, doors `open` booleans. Projectiles have `{id,x,z}`.
Renderer must be resilient to optional additional fields. Effects may be empty.

Methods:
- `start()`, `pause()`, `resume()`, `restart()`.
- `update(dt,input)`, with dt in seconds, input `{forward,strafe,turn,fire}`:
  forward/strafe in [-1,1], turn radians added that frame. Fire true while held.
  update clamps unreasonable dt and does nothing outside playing.
- `interact()` activates nearest reachable feature within ~1.6 units.
- `switchWeapon()` toggles available weapons.
- `getObjective()` -> `{title,detail,x,z,action,stage}` (guidance target).
- `getPrompt()` -> string (current nearby interaction, or empty).
- `getInteractionInfo()` -> `null` or `{text,label,canUse}`. Labels identify
  OPEN, POWER, LINK, EXTRACT, INSPECT, OFFLINE, or LOCKED; availability matches the
  existing interaction requirements and active-play state.
- Active objectives include `action:'interact'` or `action:'collect'` so hints
  distinguish doors/terminals from walk-over key collection.
- `getZone()` -> string.
- `getMissionProgress()` -> `{missionId,relaysUsed,relaysTotal}`.
- `drainEvents()` -> events `{type,...}` for `shot`, `hit`, `hurt`, `kill`,
  `pickup`, `door`, `power`, `relay`, `secret`, `checkpoint`, `message`, `win`, `death`.
  Shot event includes weapon. Message events include text.
- `serialize()` -> JSON-compatible checkpoint/current save.
- `restore(data)` -> boolean; validate version, level id, data before accepting.
- `restartCheckpoint()` -> boolean; restart from stored checkpoint if available.
- `hasLineOfSight(x1,z1,x2,z2)` -> boolean for aim assistance and minimap.

`renderer.mjs` exports `BreachRenderer`:
- `new BreachRenderer(canvas, game, {quality:'auto',fov:null,reducedMotion:false})`
- `resize()` uses canvas CSS bounds.
- `quality` accepts `auto`, `low`, or `high`. `fov` is vertical degrees, bounded
  to 60–100; null or zero preserves the automatic landscape/portrait view.
  Assign options and call `resize()` to apply without rebuilding the renderer.
- `render(dt)` draws state including weapon; called in menu as well.
- `handleEvents(events)` accepts same events the interface consumes.
- `dispose()`.
Renderer imports local `./vendor/three.module.js`, supplied by parent.
Menu may use ready-state camera animation; playing and paused respect player view.

UI owns requestAnimationFrame, audio, localStorage (guard all storage errors),
event consumers and save persistence. Checkpoint and page-hide/pause trigger saves.
Do not save dead/won states over resumable progress. Pause on blur/visibility,
pointer lock loss. Touch needs simultaneous movement and drag-to-aim fire control.
There is one current-run save. Browsing mission briefings never overwrites it;
starting a new mission explicitly replaces it. Restore the saved mission before
creating its renderer. Original Blacksite saves without a mission option remain
valid, resolved through their saved level id.
Guidance (`simple`,`moderate`,`expert`) is independent of combat difficulty
(`relaxed`,`standard`,`hard`). Defaults: simple + standard, aim assist enabled on
touch, sound on after explicit Start, and reduced motion respects system setting.

Source index.html must include `<base href="__BREACH_BASE__">` and
`<script id="breach-config" type="application/json">__BREACH_CONFIG__</script>`.
Builder fills these for static and Flask delivery. All assets use relative paths.
No remote runtime resources, no analytics, no external accounts. No build framework.
All code and artwork is original except the MIT-licensed vendored Three.js.
