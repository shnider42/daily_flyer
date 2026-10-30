# BREACH implementation contract

An original retro first-person game delivered through DailyFlyer's custom theme hook.
There are six solo missions; Crosslink, The Underworks, and The Glasshouse also
support private two-player co-op.
Blacksite 07 introduces power, access keys, extraction, a secret, and a checkpoint.
Dead Relay adds a separate facility with two relay branches that unlock a data
vault before the return to extraction.
Crosslink adds a compact third facility for solo play and private two-player co-op.
The Underworks adds a large interconnected facility with permanent upgrades,
return shortcuts, refuges, and transit links in both solo and co-op.
Switchyard adds a compact fifth solo mission with reversible shutters, a staged
faction encounter, and the Arc caster; see [the 0.6.0 notes](breach-switchyard-06.md).
The Glasshouse adds a sixth solo/co-op facility, Rebound and Thumper weapons,
bulwarks, and menders; see [the 0.7.0 notes](breach-glasshouse-07.md) for release
details and the current validation record.

## Modules and ownership

- `daily_flyer/themes/breach_assets/core.mjs`: deterministic simulation, weapon
  metadata, and the first three levels. `underworks.mjs`, `switchyard.mjs`, and
  `glasshouse.mjs` supply the later authored levels.
- `renderer.mjs`: WebGL and Canvas renderers, including original procedural art.
- `app.mjs`, `index.html`, `style.css`: interface, input integration and lifecycle.
  `guidance.mjs` filters presentation; `touch-controls.mjs` owns touch gestures;
  `audio.mjs` synthesizes audio from game events.
- `daily_flyer/themes/breach.py` and `scripts/build_breach.py`: the DFE theme
  contract and static export. The exporter copies all local assets and hashes
  them in `build-manifest.json`.
- `coop-core.mjs`, `coop-client.mjs`, and `server/`: private-room simulation,
  browser projection, and server lifecycle; see [the room protocol](breach-coop-protocol.md).

## Shared contract

Coordinates are `{x,z}` in world units. One map cell equals one world unit. Cells
are indexed `grid[z][x]`; `#` is solid and every other character is walkable,
subject to doors. Cell centers are at `x+.5,z+.5`. Player angle 0 faces north (-z),
positive angles turn right: forward is `(sin(angle),-cos(angle))`. Three.js camera
rotation around Y is `-angle`. Wall height is approximately 2.5, eye height 1.25.

`core.mjs` exports `LEVEL` (the original Blacksite default), `LEVELS`, `MISSIONS`,
`getLevel(id)`, `WEAPONS`, `ownedWeapons(player)`, and `Game`. Mission ids are
`blacksite-07`, `relay-09`, and `crosslink-11`.
The fourth mission ID is `underworks-13`; its extended map/progression contract is
documented in [The Underworks](breach-underworks.md).
The fifth is `switchyard-15`, defined in `switchyard.mjs`.
The sixth is `glasshouse-17`, defined in `glasshouse.mjs`.
`MISSIONS` provides the menu's `id,levelId,name,number,subtitle,briefing,steps`.

`LEVEL`: `{id,name,width,height,grid,spawn,doors,interactables,pickups,enemies,zones}`.
Spawn is `{x,z,angle}`. Doors have `{id,x,z,axis,requires,open}` where `x,z` are
cell-center world positions, axis is `x` or `z` (long dimension), requires is null,
`key`, `power`, `relays`, or a mission capability. Reversible shutters also carry
`controlledBy`; their repeatable switches use `doorIds` and synchronize `used`
with the connected doors' `open` state. Interactables have `{id,type,x,z,label}`
with types including `power`, `exit`, `secret`, `relay`, `upgrade`, `refuge`,
`transit`, and `shutter-switch`. Relay progress uses their existing `used` flags.
Pickups have `{id,type,x,z,amount}`. Weapon types match `WEAPONS` ids; loose
ammunition uses `ammo`, `shells`, `cells`, `slugs`, or `grenades`. Other types
include `health`, `armor`, `key`, and `healthExpansion`. Enemies have
`{id,type,x,z,health,maxHealth,alive}`; types are `runner`, `spitter`, `brute`,
`sentry`, `stalker`, `bulwark`, and `mender`. Guardians are `brute` actors with
`guardian:true`.
Security sentries are neutral to players until damaged by a player; use
`game.isHostileToPlayer(enemy)` rather than treating every living actor as hostile.
Zones have `{name,x1,x2,z1,z2}`.

`new Game({mission:'blacksite-07',difficulty:'standard',guidance:'simple',aimAssist:true,seed:1})`.
`game.level` contains the selected level, including `missionId`. `game.state` contains:

```
status: 'ready'|'playing'|'paused'|'dead'|'won'
player: {x,z,angle,health,armor,ammo:{pistol,shells,cells,slugs,grenades},
         weapon:'pistol'|'shotgun'|'arc'|'ricochet'|'grenade',
         hasShotgun,hasArc,hasRicochet,hasGrenade,key}
enemies, pickups, doors, interactables, projectiles, effects
power: boolean, secretFound: boolean, time: seconds, kills, shots, hits
```

Arrays are mutable runtime copies; entities retain stable ids. Pickups carry
`collected`, enemies `alive`, doors `open` booleans. Renderer must be resilient to
optional additional fields. Effects may be empty.

`WEAPONS` is the shared metadata source for simulation, inventory and guidance.
`ownedWeapons(player)` returns the ordered ids whose `ownershipKey` flag is true;
the pistol has no ownership flag and is always available.

| Weapon id | Display name | Ownership flag | Ammo key |
| --- | --- | --- | --- |
| `pistol` | Pistol | None | `pistol` |
| `shotgun` | Scattergun | `hasShotgun` | `shells` |
| `arc` | Arc caster | `hasArc` | `cells` |
| `ricochet` | Rebound carbine | `hasRicochet` | `slugs` |
| `grenade` | Thumper | `hasGrenade` | `grenades` |

Metadata also defines range, aim-assist range, cooldown, damage, pellet count and
automatic-fire eligibility. Rebound and Thumper have `autoFire:false`. Rebound
traces at most one wall reflection, ends at closed doors, and uses the final
segment's origin when testing a directional shield. Thumper projectiles carry
`{id,type:'grenade',x,z,dx,dz,life,fuse,ownerId,ownerKind:'player',bounces}`.
They bounce with energy loss and detonate after their fuse. Splash uses distance
falloff and line of sight; only the throwing player can take self-splash.
Damage and kill events retain that player's identity even after the co-op
`state.player` alias changes. Teammates never take grenade damage.

Methods:

- `start()`, `pause()`, `resume()`, `restart()`.
- `update(dt,input)`, with dt in seconds, input `{forward,strafe,turn,fire}`:
  forward/strafe in [-1,1], turn radians added that frame. Fire true while held.
  update clamps unreasonable dt and does nothing outside playing.
- `interact()` activates nearest reachable feature within ~1.6 units.
- `selectWeapon(id)` selects an owned weapon; `switchWeapon(id?)` selects that
  owned id or cycles `ownedWeapons(player)` when the id is omitted.
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
  Shot events include the weapon. Message events include text. Encounter feedback
  also includes `ricochet`, `explosion`, `shield-hit`, `shield-open`, `heal`, and
  `heal-interrupt`; renderers consume the corresponding live effects/telegraphs.
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

Renderer imports the vendored local `./vendor/three.module.js`.
Menu may use ready-state camera animation; playing and paused respect player view.

UI owns requestAnimationFrame, audio, localStorage (guard all storage errors),
event consumers and save persistence. Checkpoint and page-hide/pause trigger saves.
Do not save dead/won states over resumable progress. Pause on blur/visibility,
pointer lock loss. Touch supports simultaneous movement, looking and deliberate fire.
There is one current-run save. Browsing mission briefings never overwrites it;
starting a new mission explicitly replaces it. Restore the saved mission before
creating its renderer. Original Blacksite saves without a mission option remain
valid, resolved through their saved level id.

The version-1 solo save format accepts earlier missing weapon fields with safe
defaults. New saves retain active grenades, their fuse/owner data, and the entity
serial counter; transient effects and enemy plasma are not restored. Co-op uses
full live snapshots instead of solo `serialize()`/`restore()`. Team checkpoints
clear active projectiles and effects before capturing the retry state.

Guidance (`simple`,`moderate`,`expert`) is independent of combat difficulty
(`relaxed`,`standard`,`hard`). Defaults: simple + standard, aim assist enabled on
touch, sound on after explicit Start, and reduced motion respects system setting.

As of 0.5.0, `guidance.mjs` owns presentation filtering: Simple keeps explicit
requirements, Moderate gives sensory hints, and Expert shows interactions only
when usable. Progression rules remain in `Game`. Unknown equipment and objective
locations must not leak through alternate HUD, map, accessibility, or toast paths.
`touch-controls.mjs` resolves Compact/Standard/Large presets and scales joystick
travel to the actual pad bounds. Phone presets do not change desktop controls.

As of 0.6.0, the same module owns `TouchFireGestures`, used by the actual pointer
handlers. Safe touch Fire classifies an immediate drag as look-only, a tap as a
single shot on release, and a stationary hold as continuous firing. Pointer
ownership is stable; cancellation and lifecycle changes clear pending fire.
Classic immediate fire-and-drag is an explicit saved alternative.

Encounter state, telegraphs, save compatibility, and render/audio events are
specified in [the 0.5.0 gameplay notes](breach-gameplay-05.md).

The 0.7.0 additions use simulation-owned fields: bulwarks expose
`shieldPhase:'guard'|'windup'|'exposed'`, `shieldTimer`, and their facing `angle`.
Their front shield reduces damage while covered; flanking or an exposed phase
removes that reduction. Rendered front/back/open art follows the same facing and
phase. Menders use `healCooldown` and `telegraph.kind:'heal'` with a stable ally id.
They heal living, injured infestation allies within range and sight, excluding
themselves, guardians and security. Damage interrupts the windup. Healing cues
follow the real target and stop when the heal is cancelled; art does not create
combat state. See [the Glasshouse notes](breach-glasshouse-07.md) for details.

Source index.html must include `<base href="__BREACH_BASE__">` and
`<script id="breach-config" type="application/json">__BREACH_CONFIG__</script>`.
Builder fills these for static and Flask delivery. All assets use relative paths.
Solo uses local runtime resources. Optional co-op connects to the configured room
service. No analytics or external accounts. No build framework.
Artwork and gameplay code are original. Third-party code is limited to the
MIT-licensed vendored Three.js and the room server's MIT-licensed `ws` package.
