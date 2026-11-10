# SKYWARD module contract · v0.7.0

Shared source: `games/skyward/public`. ES modules (`.mjs`), no build step; Three.js r160.1 is vendored at `vendor/three.module.js`. Units are meters, seconds, radians and meters/second. All ranges and flight performance are game abstractions.

## Coordinates and content

Aircraft models use **+Z forward, +Y up, pilot-right −X and port/left +X**. Heading zero points +Z. Positive legacy heading turns toward +X; positive pitch raises the nose; positive legacy roll banks left. Legacy pose fields encode Euler YXZ rotation `(-pitch,heading,-roll)`. The normalized `orientation` quaternion is authoritative. Use `orientation.mjs` helpers (`orientationOf`, `basis`, `deriveEuler`, `integrateBodyRotation`, `slerp`) rather than reconstructing axes. Named positive flight inputs mean pitch up, yaw right and roll right around aircraft-local axes.

`campaign.mjs` exports `AIRCRAFT` (keyed object), `MISSIONS` (ordered 18-sortie campaign), `SPECIAL_MISSIONS`, `getMission(id)` and `getAircraft(id)`. `getMission` resolves special-operation IDs as well as campaign IDs/numbers. Mission shape: `{id,number?,title,year,era,location,aircraft,kind,biome,description,briefing:[strings],lesson,duration,weather:{wind,cloudBase,cloudTop,fog,timeOfDay},start:{x,y,z,heading,speed,airborne},runways:[{x,z,y,length,width,heading,label,carrier}],waypoints:[{x,y,z,radius,label}],enemies:[{id,type,aircraft,x,y,z,heading,speed,health}],targets:[{id,type,x,y,z,health,label}],goal:{...},historicalNote,sources:[urls]}`.

`gunship-nightwatch` is Nightwatch Basin: `kind:'gunship'`, `aircraft:'ac130'`, one pilot and one gunner, eight ground objectives, night weather. Its `orbit:{x,z,radius,altitude,direction}` supplies the basin marker. Special missions have no campaign number and do not alter campaign progress. The AC-130 also supports ordinary free-flight handling; its shared weapon stations belong to the crew operation.

Aircraft shape: {id,name,shortName,era,model,color,accent,maxSpeed,cruise,stallSpeed,acceleration,turnRate,climbRate,rollRate,health,gun,missiles,bombs,radar,stealth,vtol,role,summary}. Numeric speeds are simulation m/s. There are fourteen flyable profiles; the additional enemy model types do not become selectable aircraft. Independent multiplayer accepts every flyable profile without changing its performance or adding equipment. An unarmed profile stays unarmed; the AC-130's three gun stations require crew mode.

## Arena and launch construction

`arena.mjs` exports:

| Export | Contract |
| --- | --- |
| `ARENA_MAPS` | `canyon` / Razorback Canyons and `islands` / Open Ocean Islands |
| `ROUND_DURATIONS` | `[300,600,1200]` seconds |
| `ARENA_RESPAWN_DELAY`, `MISSION_RESPAWN_DELAY` | Four and five simulation seconds respectively |
| `normalizeArenaConfig(config)` | Bounded local defaults for `{mode,mapId,durationSeconds,lives}` |
| `createArenaMission(config,aircraft='f16')` | A deterministic mission with ID `arena-canyon` or `arena-islands`; both maps include a runway and carrier |
| `prepareMissionStarts(mission,players)` | Returns a cloned mission with carrier infrastructure where selected starts require it |
| `ensureCarrier(mission)` | Convenience wrapper adding carrier infrastructure |
| `spawnForPlayer(mission,aircraft,index=0,startMode='airborne',lifeId=1)` | Deterministic initial/respawn position and startup state for the selected aircraft |
| `carrierCompatibility(aircraft,runway={width:40,length:310})` | Warning metadata, including `{level,label,warning,supported,allowed:true,assisted,takeoffSpeed,deckLength,halfSpan,laneClearance,wingClearance,oversized}`; never an aircraft-selection gate |
| `aircraftChoice(id)` | A known flyable aircraft ID, with the arena fallback for an unknown value |

Room modes are `squadron`, `crew`, `freeflight`, and `dogfight`. Independent modes accept 2–4 players; crew accepts exactly two. `mapId` is `canyon` or `islands`; dogfight duration is 300, 600 or 1200 seconds; ordinary mission `lives` is 1, 3 or 5, default 3. The server rejects invalid settings rather than relying on the local normalizer. Accepted server config uses `durationSeconds:0` outside dogfight; simulation rounds use `duration:null` / `remaining:null` when untimed.

Each independent roster entry carries `aircraft` and `startMode:'airborne'|'high'|'runway'|'carrier'`, and `payload:'conventional'|'atomic'|'hydrogen'|'tsar'`. The accepted choices apply to ordinary missions as well as arena modes and remain fixed until another sortie. High starts are 6,500 game metres AGL at the normal airborne horizontal spawn. Multiplayer runway starts are hot; solo free-flight setup can request a cold runway start. `lifeId` changes deterministic respawn placement and separates a replacement from its predecessor. Carrier compatibility describes modeled assistance and risk; all fourteen aircraft remain allowed to attempt a departure.

## Simulation

`sim.mjs` exports `FlightSimulation`, `advancePlayer(player,input,dt,aircraft,mission,settings)` and re-exports `terrainHeight`, `surfaceHeight`, `runwayAt`, `runwayCoordinates`, `segmentTerrainTime`, `lineOfSight`, `terrainClearance` and `carrierObstacleTime` from the shared terrain module. `new FlightSimulation(mission,settings)` accepts an object or ID. `.player` carries quaternion `orientation`, position, Euler pose, speed, throttle, health, fuel, gear/flaps/brake, engine/startup state, aircraft ID, vertical speed, stall state and stores. Multiplayer adds `lifeId`, `alive`, `targetId` and `radarOn`. `.step(dt,{roll,pitch,yaw,throttle,fire})` advances flight. `.action(name)` supports startup, gear, flaps, brake, level, target, missile, payload, fire, countermeasure, radar, hover, abort and respawn.

World properties: `.enemies`, `.targets`, `.projectiles`, `.effects`, `.paratroopers`, `.waypointIndex`, `.status` (`flying`/`success`/`failed`), `.objective`, `.hint`, `.progress`, `.time`, `.score`, `.events`, `.targetId`, `.lockProgress`, `.radarOn`, `.threat` and `.threatWarning`. `.getSnapshot()` serializes the host world. Legacy unconfigured squadron `.applySnapshot(snapshot)` preserves the guest's own plane and applies shared damage/stores. Configured multiplayer uses the participant contract below.

### Handling and nuclear payloads

Aircraft profiles expose dimensionless `handlingSize`, `pitchRate`, `rollRate`, `attitudeResponse` and `recoveryScale`. Pilot angular rates ease toward input using time-based response, then integrate around the aircraft's body axes. Heavy airframes turn and recover more slowly; no bank or pitch clamp is added. Transient angular rates live outside serialized poses and reset for new aircraft/ground handling.

`payloads.mjs` exports `NUCLEAR_PAYLOADS`, `getNuclearPayload`, `normalizePayload`, `nuclearDamageAtDistance` and `expandingBlastTime`. Nuclear payloads are B-2 only. Their profile values are fictional game balance. Selection travels as `mission.payload`, roster/participant `payload`, and `player.payload`. The relay accepts only supported loadouts and freezes them during flight, overriding pose/action payload claims with accepted roster data. Last Light requires a nuclear payload and falls back to Atomic.

A nuclear release checks actual terrain AGL and stores before creating a `type:'bomb'` projectile with `payload`, owner/life identity and the eligible life IDs captured at release. Its terrain collision creates a `type:'nuclear'` effect with shared profile radius, age/life and the same identity data. Only the host resolves the expanding wave using swept aircraft positions and a once-per-life hit set. Self-blast remains dangerous in peaceful modes, while peer damage follows existing dogfight-only rules. New lives never inherit earlier hazards. Guests receive projectiles/effects and authoritative damage through normal snapshots.

`sim.nuclearThreat` returns the most relevant hazard as `{phase:'falling'|'blast',payload,distance,radius,remaining,escaped,waveRadius?}` or null. The HUD uses this for always-visible escape warnings. `nuclearRelease` records Last Light's release, detonation and original pilot life in snapshots. Release does not immediately finish the mission; the aircraft remains controllable during the escape. Abort cannot undo an already released bomb.

The shared effect sampler derives fireball, wave, ground dust, stem and canopy layers under the existing fixed budgets. Both renderers use `age × waveSpeed` for the pressure front. Combat feedback owns nuclear sound timing: `processEvents` must not directly play the `nuclear` event, because the delayed wave cue supplies the boom and reduced-motion-aware camera response.

### Independent multiplayer state

Before the first pose or world update, call:

```js
sim.worldAuthority = team.isHost;
sim.configureMultiplayer({
  mode, config, players, playerId: team.id, hostId, runId
});
```

Use a fresh simulation for each `onStart`. Crew mode retains its shared-aircraft path and does not create an independent participant map. For other modes, accepted roster choices initialize `.participants` as a `Map` keyed by server-assigned player ID. A public participant snapshot contains at least:

```js
{
  id, name, aircraft, payload, startMode,
  lifeId, alive, health,
  livesRemaining,             // null for unlimited, otherwise remaining aircraft
  kills, deaths, damageId,    // damageId is monotonic, including across respawn
  lastDamage,               // latest life-scoped feedback receipt, or null
  respawnAt,                 // simulation time, or null while alive
  spawn, pose, connected,
  stores: { ammo, missiles, bombs, troopers, dropsRemaining }
}
```

`lifeId` starts at 1 and increases on each accepted respawn. `.localParticipant`, `.canRespawn` and `.scoreboard` expose local availability and standings. `.updateRoster(players)` updates connection/name state without granting new aircraft. `.setRemotePlayers(poses)` updates accepted remote poses; the host checks movement bounds and terrain/deck crashes and retains authoritative health and stores. Do not replace `.remotePlayers` directly when using configured multiplayer.

The host resolves guest intents through `.applyRemoteAction(action,pose,metadata)`, where metadata includes `{runId,lifeId,actionId,seq,playerId}` from the relay. Weapon actions use the accepted aircraft's equipment and host cooldowns. Radar acquisition accumulates on the host from the pilot's target, attitude, range, radar state and terrain visibility. An action cannot supply damage, stores or kill credit. `crash` is advisory and must pass the host's collision check. `respawn` calls `.requestRespawn(playerId)`, which succeeds only for a dead participant with a remaining life and an elapsed cooldown. Replaying an action identity or damage against an already-dead life cannot add another kill/death.

Each aircraft loss consumes a mission life, including the initial aircraft. Arena lives are unlimited. Free flight suppresses player-versus-player damage; dogfight credits a weapon kill to the other participating attacker. Terrain losses count as deaths without a weapon kill. A dead host continues ticking the authoritative world while respawning or spectating. Ordinary missions retain their objective rules and end for aircraft exhaustion only when every connected participant is dead with no remaining lives. Crew aircraft death can still end its shared operation.

Ordinary squadron AIR kills/deaths/K/D credits a hostile AI aircraft kill exactly once to the participant responsible for its final damage; ground-target destruction adds shared mission points without increasing participant air kills.

Configured snapshots have `version:2`, `runId`, `participants:[]` and `round:{duration,elapsed,remaining,ended}`, alongside existing world fields. Guests preserve prediction for the current living local aircraft, apply authoritative damage/stores, and replace it with the host's spawn/pose when `lifeId` increases. New-life application resets weapon/recovery state; the app clears held input and presentation interpolation. Host snapshots must reach the relay before guest poses for a new generation are accepted. Publish immediately after a respawn.

### Damage feedback receipts

Accepted aircraft damage emits an event with `{id,kind:'damage',text,targetId,targetLifeId,damageId,damage,health,maxHealth,weapon,source,position,at}`. `damage` is the health actually removed, including clamped overkill; `source` and `position` are copied `{x,y,z}` points, with `source:null` when unknown. `at` is simulation time. Gun sources use the shooter position, incoming bullet/missile sources use their pre-impact position, and flak/bombs use their blast position. Rejected PvP, invulnerability, cosmetic prediction and zero damage do not emit a receipt. Solo flak retains its existing one-health floor.

`participant.lastDamage` and `player.lastDamage` retain the same event plus `eventId:id`, allowing the UI to recover a hit after it leaves the snapshot's short event tail. This metadata never reapplies damage. Respawn clears the receipt, and local snapshot reconciliation copies it onto the predicted player. For both AC-130 seats, address feedback to `sim.player.id` and `sim.player.lifeId`: the gunner's crew snapshot copies the pilot's shared aircraft identity, which differs from the gunner's transport identity. The old untargeted solo `hit` cue is not emitted alongside the addressed event.

### Round clock

The browser host calls `.advanceRoundTime(elapsedSeconds)` once per display frame with actual elapsed time while a connected dogfight is running. This clock is separate from `.step()` and its bounded fixed-step catch-up budget. Once wall-clock mode is enabled, physics steps do not advance the round again. Direct simulation callers that do not enable it retain simulation-time timing. `advanceRoundTime` returns false for guests, untimed modes or finished rounds.

At expiry, elapsed time clamps to the selected duration, remaining reaches zero, `ended` becomes true and the simulation publishes final standings with `status:'success'`. Arena menus, score viewing and spectating do not pause the round. A browser stall can delay publication, but accumulated elapsed time is reconciled when the connected host runs again. A network connection hold is distinct from an arena menu pause; no server timer or host migration is implied.

## Shared terrain and clearance

`terrain.mjs` is the shared authority for flight, weapons, radar and rendering. It exports `TERRAIN_CELL_SIZE` (64 metres), `terrainGridHeight(x,z,mission)`, `terrainHeight(x,z,mission)`, `surfaceHeight(x,z,mission)`, `runwayCoordinates(x,z,runway)`, `runwayAt(x,z,mission,margin=0)`, `segmentTerrainTime(from,to,mission,clearance=3,includeDecks=false)`, `lineOfSight(a,b,mission,clearance=2)` and `terrainClearance(player,mission,lookAheadSeconds=2.5)`.

`terrainGridHeight` gives height at a procedural node; arbitrary canyon positions must use `terrainHeight`, which interpolates the fixed 64-metre triangles. Both near rendering meshes use the same diagonal. Negative terrain height denotes open water. `surfaceHeight` includes sea level and runway/carrier decks. Swept segment queries return the first hit fraction or `null`; water is included, and `includeDecks:true` also includes deck surfaces. Canyon queries split the segment at cell boundaries and diagonals; other biomes use bounded samples.

Radar and gun visibility require terrain line of sight. A missile loses its seeker when terrain masks the target and then follows its existing momentum. Swept terrain collision is ordered against swept target/proximity collision, so a hit behind an earlier mountain intersection cannot damage the target. Projectiles aimed at an old `targetLifeId` cannot retarget the replacement aircraft.

`terrainClearance` returns `{agl,minClearance,timeToImpact,pullUp}` from the actual velocity and a forward surface query. The HUD displays AGL rather than sea-level altitude, including deck clearance, with a clearance bar and terrain-ahead/pull-up warnings. It also distinguishes radar acquisition, completed lock and incoming missile alerts. These warnings are game aids; they do not override control input.

### Carrier obstacle geometry

`terrain.mjs` also exports `carrierLaunchLane(runway)`, `carrierIslandParts(runway)` and `carrierObstacleTime(from,to,aircraft,mission)`. The launch lane is a runway-local lateral offset, defaulting to `-0.12 * runway.width`. Island parts are deck-local records `{id,x,y,z,width,height,length,material}` shared by flight collision, WebGL and Canvas. The island, bridge, glazing, mast and radar therefore have the same placement and dimensions in the rendered scene and collision inputs.

New carrier infrastructure uses a 310-by-40-metre deck with `launchLaneX:-4.8`; existing mission carriers retain their authored dimensions. `carrierCompatibility` uses the supplied runway's lane-to-island distance and modeled half-span to report `wingClearance` and `oversized`. Pass the actual mission runway when one already exists; otherwise the default describes the newly added carrier. An overlap warning describes a physical obstacle and does not alter selection permissions or acceleration.

`airframes.mjs` exports `AIRFRAME_BOUNDS` and `modeledAirframeBounds(aircraft)`. These `{min,max}` records describe the generated game models in their aircraft-local frame, not operational aircraft measurements. `carrierObstacleTime` transforms that envelope through the aircraft attitude into the runway frame, expands the shared solid boxes by the envelope, and returns the earliest swept hit fraction or `null`. It is a conservative envelope collision, not a per-triangle airframe simulation. A stationary spawn does not fail merely because the chosen plane is large; an actual intersection on a roll, taxi or flight path causes the collision. The normal performance profile remains unchanged, with Hellcat launch assistance and Harrier hover handled by their existing flight rules.

## Shared crew state

Gunship missions add `.crew`:

```js
{
  seat: '25mm', yaw: 0, pitch: 0, fire: false, gunnerId: null,
  stations: {
    '25mm':  { ammo, cooldown, shots },
    '40mm':  { ammo, cooldown, shots },
    '105mm': { ammo, cooldown, shots }
  },
  lastShot: { id, seat, at },       // present after firing
  lastHit: { at, targetId, seat }   // present after a hit
}
```

The host calls `.applyCrewInput({seat,yaw,pitch,fire},playerId,{reset:false})`. It owns aircraft movement, gun cadence, ammunition, physical shells, swept target/terrain collisions, splash damage and objectives. Switching stations preserves ammunition and cooldown. A rising trigger retains at most one pending press, so a click released between physics steps still fires once when ready; a tap during reload never queues a later shot. Pass `{reset:true}` on pause/disconnect/forced stop to cancel pending fire. Held fire expires after `GUNSHIP_INPUT_TIMEOUT` (0.35 simulation seconds) without fresh input.

Gunship snapshots additionally contain the canonical `player` and `crew`. The guest applies the shared aircraft pose, health, stores and mission state. It never predicts a second plane: its `step`, flight actions and crew firing have no authority. Crew mode rejects legacy remote aircraft weapon actions.

## Gun stations and rendering

`gunship.mjs` exports `GUNSHIP_SEATS`, `GUNSHIP_STATIONS`, `GUNSHIP_AIM_LIMITS`, `GUNSHIP_INPUT_TIMEOUT`, `GUNSHIP_BASE_ELEVATION`, `getGunshipStation(id)`, `clampCrewInput(input)`, `createGunshipCrewState()` and `gunshipStationPose(plane,seat,aim,groundOffset=0)`.

Station IDs are `'25mm'`, `'40mm'`, `'105mm'`. Definitions hold labels, role, local mount, barrel length, normal/zoom FOV and game ammunition/cadence/damage/splash/ballistic values. Local input clamps yaw to `[-0.6,0.6]` and pitch to `[-0.6,0.55]` radians. Positive sight yaw moves screen-right toward the nose; positive pitch raises the sight above its default −0.43-radian local elevation. Network validation rejects malformed or out-of-range values instead of clamping them.

`gunshipStationPose` returns `{station,mount,origin,eye,position,target,direction,up,fov,yaw,pitch}`. `position` aliases the eye; `origin` is the muzzle. Both follow the aircraft quaternion. `aim.zoom` selects the configured FOV. The optional visual ground offset matches model/camera placement; authoritative shells omit it.

`renderer.mjs` exports `FlightRenderer`; `software.mjs` exports compatible `SoftwareFlightRenderer`. Both support:

```js
new FlightRenderer(canvas, settings)
renderer.loadMission(mission, aircraft)
renderer.render(sim, dt, {
  camera: 'gunner', // also 'chase', 'cockpit' or 'cinematic'
  lookX, lookY, remotePlayers: [],
  gunner: { seat: '25mm', yaw: 0, pitch: 0, zoom: false },
  player, playerId, // optional spectator focus pose and identity
  combatKick: { pitch, yaw, roll, x, y } // optional local presentation offset
})
```

Both expose `resize()`, `setSettings(settings)`, `project(x,y,z)` (screen pixels and `visible`), `renderMenu(time,aircraft)` and `dispose()`. WebGL construction may throw; the app then uses Canvas rendering. Gunner mode uses the shared station helper and first-person panels. `gunship-views.mjs` and `gunship-scenery.mjs` supply station interiors and the compound. `presentation.mjs` handles fixed-step render interpolation; `camera-pose.mjs` handles the normal cockpit frame.

When `options.player` is supplied, both renderers focus that pose instead of `sim.player`; `playerId` resets camera tracking when the watched pilot changes. The renderer selects the watched aircraft's model and cockpit while leaving simulation ownership untouched. Remote/dead-aircraft filtering remains the caller's responsibility. Returning to local flight omits the override and resets presentation interpolation after a new life.

### Terrain streaming and effect presentation

`terrain-visuals.mjs` exports `terrainMeshSettings(mission,quality,software)`, `buildSceneTerrain({x,z,mission,quality,software,radius,sampleHeight})`, `terrainColor(...)`, `packTerrainGeometry(mesh,mission,palette)`, `colorSoftwareTerrain(mesh,mission,palette)`, `sceneryClearance(...)`, `groundDetails(...)` and `aircraftGroundShadow(player,modelMetadata,sampleSurface)`.

`buildSceneTerrain` returns `{anchorX,anchorZ,cell,focusStep,radius,vertices,tiles,triangles,bounds}`. Near canyon faces use the authoritative cell diagonal; farther cells coarsen with distance. LOD edges share boundary vertices instead of overlapping geometry. Presentation applies small depth offsets to avoid airfield/terrain z-fighting; distant coarse faces remain an approximation of the authoritative surface. `packTerrainGeometry` produces typed `positions`, `normals`, `colors` and `indices` buffers for WebGL. Ground details are decorative scale references, not replacement collision geometry. The ground shadow samples the actual ground/deck surface.

`terrain-stream.mjs` exports `TerrainStream(WorkerClass=globalThis.Worker)` with `request(job)`, `take()` and `dispose()`. Jobs carry `{key,x,z,mission,quality,software,radius,palette}`. `request` returns false when no worker is available, allowing synchronous generation. At most one job runs and one latest pending job is retained. `take` returns the completed result once. `terrain-worker.mjs` uses the same terrain/mesh builders, returns `{key,quality,mesh,geometry?}`, and transfers GPU buffer ownership for WebGL jobs. Renderers keep their current mesh while a nearby replacement is prepared; initial terrain, large moves and worker failure have a synchronous fallback. The stream does not own terrain collision or round timing.

`combat-visuals.mjs` exports `EFFECT_BUDGET`, `sampleCombatEffects(effects,options,out)`, `sortEffectLayers(layers,eye,forward)`, `DamageSmokeTrails` and `effectViewAlpha(layer,eye)`. Effects are presentation-only and derive deterministically from each ID/seed and age. A bounded reused layer array describes crisp cores, fire lobes, dark rising smoke, impact sparks, outward embers/debris and shock rings. New explosions and impacts take priority over older smoke. `DamageSmokeTrails.sample(sim,options,out)` emits bounded world-space puffs from damaged living aircraft and clears a source across life changes. WebGL batches layers with per-instance opacity and a fixed nearby-blast light pool; Canvas draws the same recipe with depth ordering and terrain occlusion approximations. `effectViewAlpha` thins very near particles when the camera sits inside an effect. Reduced motion attenuates bright expanding elements and lowers smoke emission. Rendering never adds damage or secondary physics particles.

### Combat feedback, camera and sound

`combat-feedback.mjs` exports `CombatFeedback`, `combatDirection(source,listener,camera)` and `explosionStrength(effect,listener)`. A controller supports `reset(sim)` and `update(sim,elapsed,{listener,camera,suspended,spectating,reducedMotion})`, returning `{hit,blast,visible,title,detail,bearing,angle,critical,kick,cues}`. Consume its cue list during that update. Hits are filtered by aircraft/life identity and deduplicated across the event and retained receipt; stale receipts older than 1.5 simulation seconds are ignored. Sortie or life changes reset feedback. Camera world axes supply bearings when available, otherwise normalized aircraft axes do; inverted and side-facing views must keep their own right/up/forward directions.

Fresh explosion IDs generate distance-scaled audio and nearby concussion; old smoke-phase effects do not replay. Overlapping bursts coalesce, and at most three new explosion cues are produced per update. A nearby explosion by itself does not produce a received-damage notice. Paused or connection-held feedback is consumed silently, preventing a burst on resume. Spectator cameras receive no kick, while the own-aircraft destruction sound can still play during the transition to a watched pilot.

`combat-camera.mjs` applies `{pitch,yaw,roll,x,y}` after the normal camera calculation in both renderers. Angular values are radians and offsets are camera-local. Every frame starts from the base camera, so the reaction cannot accumulate or modify simulation movement, targeting, aiming or collision. Reduced motion zeroes the kick and attenuates hit/blast flashes while retaining warning text, bearings and audio. The app displays an edge flash, directional mark, weapon-specific hit notice and remaining airframe percentage; critical health also emphasizes the health readout. These cues are independent of radio-caption and sound preferences.

`FlightAudio.cue(kind,details={})` accepts hit/explosion details including `{intensity,pan,weapon,distance,radius}`. `combat-audio.mjs` synthesizes and caches separate layered hit, heavy-hit, explosion and weapon buffers once per audio context. Sharp midrange impact transients, metallic debris, low body and rolling tails feed a compressed effects bus; engine/wind ambience ducks briefly during major sounds. Voice and cadence limits bound concurrent playback, and muting stops active effects. Existing master/effects/engine settings and gesture-unlock requirements apply. **Setup → Sound & view → Test hit & explosion sounds** previews a bullet hit and then an explosion using those settings.

If destruction ends the local sortie (`status:'failed'` and a crashed/dead player), the app disables controls and keeps the flight view visible for 1.25 seconds before debrief. Effect age advances for presentation during that interval and behind the debrief; authoritative simulation time and failure rules do not change. Independent multiplayer death with the shared world still flying retains the immediate spectator/respawn flow.

## Input and room transport

`controls.mjs` owns pilot input. `gunner-controls.mjs` exports `GunnerControls`; `.read(dt)` returns `{seat,yaw,pitch,fire,zoom}`. Only the role's controller is active. `setActive`, `clear`, `reset`, `selectSeat`, `toggleZoom` and `recenter` manage state. Zoom stays local.

Desktop gunner defaults: mouse or arrows aim, primary mouse button/Space fire, 1/2/3 select stations, Z zooms, C centres, T marks the next target, Escape/P pauses. `settings.gunnerBindings` is independently remappable from pilot `keyBindings` in Setup → Keyboard. Touch defaults: left AIM, right FIRE; releasing AIM holds the sight. Swap thumbs reverses those sides. Visible tools are `25 MM`, `40 MM`, `105 MM`, `ZOOM`, `CENTRE`, `NEXT TARGET`. Pointer cancellation, blur, resize, visibility loss and pause clear held input.

`network.mjs` exports `SquadronClient({onStatus,onRoster,onStart,onWorld,onAction,onCrewInput,onLobby,onEnd,url?})`.

| Method | Purpose |
| --- | --- |
| `create(name,missionId,options={})` | Creates a room; options accept `{mode,mapId,durationSeconds,lives,aircraft,startMode,payload}` or a nested `config` plus loadout |
| `join(code,name,options={})` | Joins a lobby with optional `{aircraft,startMode,payload}` |
| `configure(config)` | Host-only lobby configuration; include `missionId` for an atomic mode/mission change |
| `setMission(id)` | Legacy host lobby mission selection |
| `setLoadout(aircraft,startMode,payload)` | Changes the caller's lobby selection; an equivalent object argument is accepted |
| `ready(bool=true)` | Guest readiness in the lobby; the host remains ready |
| `start(id=this.missionId)` | Host starts/replays a sortie with a new run ID |
| `returnToLobby()` | Host returns all members to the same lobby without closing the room |
| `sendPose(player)`, `sendWorld(snapshot)` | Bounded pose and host snapshot publishing |
| `sendAction(action)` | Guest independent-aircraft intent; accepts a name string or `{name,targetId}` |
| `sendCrewInput(input,{reset:false})` | Guest gunner intent; options are optional |
| `samplePlayers()`, `samplePilot()` | Interpolated independent aircraft or the crew's shared pilot pose |
| `leave()` | Leaves the room; explicit host departure ends it |

Properties include `code`, `id`, `isHost`, `connected`, `latency`, `roster`, `mode`, `role` (`pilot`/`gunner`), `maxPlayers`, `hostId`, `missionId`, `config`, `aircraft`, `startMode`, `payload`, `roomState`, `paused` and `hostStale`. A roster entry is `{id,name,isHost,role,ready,connected,aircraft,startMode,payload}`; private reconnect tokens never appear in the roster.

Callbacks are:

```js
onStart({ missionId, seed, runId, mode, role, config, players, hostId })
onRoster(players)
onWorld(snapshot)
onAction({ action, playerId, player, runId, lifeId, actionId, seq })
onCrewInput({ playerId, input, seq, reset })
onLobby({ missionId, mode, config, players, hostId })
onEnd(message)
onStatus(status, message)
```

Read local identity from `team.id`. On the host, forward `onAction` as `sim.applyRemoteAction(data.action,data.player,data)`; spreading `data.action` is incorrect because a valid action can be a string. Guests apply host snapshots. `onLobby` tears down the current simulation/UI and displays the room; `onStart` builds a fresh simulation from accepted config and roster. Use `configure({...config,missionId})` when switching into or out of the fixed AC-130 operation.

All independent rooms need 2–4 connected, ready pilots to start. Crew rooms need exactly two: creator pilots, guest guns. The server derives crew roles and fixed AC-130 loadout from mission/membership; only the host starts a sortie or supplies world updates. Crew guests cannot send aircraft poses or independent combat actions. `samplePlayers()` returns no extra aircraft in crew mode; the guest uses `samplePilot()` for its shared rendered pose.

Poses and sustained crew inputs send at up to 15 Hz; crew trigger edges send promptly. Host worlds send at up to 10 Hz, with a queued final update flushed even when the render loop stops publishing. Pose sampling uses 100 ms interpolation delay and at most 150 ms extrapolation. Quaternion reconstruction keeps interpolation and bounded angular prediction continuous through vertical attitudes. Pose fields include `lifeId`, target/radar state, ground/gear/hover/brake state and the validated movement/store shape; identity and accepted aircraft come from the connection/roster, not the pose.

Modern clients advertise `flightProtocol:2` alongside the existing hello protocol version. A modern/configured room requires its `runId`, per-pilot `lifeId` and monotonic pose/action/world sequences regardless of a guest's claimed capabilities. Compatibility omission is restricted to old, unconfigured rooms. Crew input always requires its current run ID and sequence. The relay assigns each accepted independent action a unique `actionId` derived from the run and server counter, strips unrelated fields and never accepts guest world/score updates. Host participant snapshots validate roster identity and nondecreasing life/damage/score state; a new generation clears the previous stored pose. Client interpolation also drops old-generation history.

Ordinary trigger release sends `fire:false` without reset, preserving one brief click until the next host physics tick. Pause, blur, pointer cancellation and controller deactivation send `sendCrewInput({...input,fire:false},{reset:true})`; reset is valid only with `fire:false`. Cancellation bypasses client aim coalescing. The relay prioritizes one cancellation after an accepted press, including after its normal release, and rate-limits repeated resets. The host forwards the callback flag through `sim.applyCrewInput(input,playerId,{reset})`, cancelling both held fire and an unticked click. Server-originated disconnect, replacement and pilot-pause stops also set `reset:true`.

### Room lifecycle and pause

Pilot pause pauses both crew members; gunner pause stops their guns while the pilot continues. Independent arena menus do not pause flight or the dogfight timer. An ordinary mission's living host can pause the shared world, while a dead/spectating host keeps ticking. Local aircraft death is a participant state change, never a transport leave or room-end operation. Guests with no remaining lives stay connected and can spectate another living, connected pilot.

Host replay creates a fresh `runId`, clears previous poses/world/action state and resets lives/score through the new simulation. `returnToLobby()` clears the active run and world, preserves room membership and loadout choices, keeps the host ready and makes guests unready. The client suspends flight traffic and cancels pending old-world sends during an outbound replay/lobby transition. A successful `start`/`lobby` acknowledgment, or an error, resolves the transition. Late fresh joins are rejected while flying; return to the lobby before adding another pilot.

The host can regroup during any mode through **Regroup in squadron room** in the pause menu, including untimed free flight. After the result screen it can replay or return the squadron to the lobby. During an active independent-aircraft sortie, guests stay in the flight/spectator flow until the host regroups them; changing to a lobby screen must not leave a frozen guest aircraft behind. The existing crew gunner's return-to-room view remains available because that role does not own an independent aircraft.

Authenticated reconnect retains accepted loadout, life generation, sequence floors and the latest host world. The default grace period is 20 seconds. A host disconnect pauses the room; failed host recovery ends it. A guest disconnect stops crew fire where applicable and updates connected state. A replacement connection closes the older connection. Crew pause/disconnect/replacement resets fire, and interruption requires a released trigger before shooting resumes. There is no host migration or public room listing.

Rooms live in one server process's memory, expire after 90 minutes and disappear on process restart. The relay bounds messages, rates and identity but does not independently simulate the host's combat or wall clock. This is private casual play with a trusted host; validated guest intentions and generation checks do not constitute competitive anti-cheat.

### Multiplayer UI helpers

`multiplayer-ui.mjs` exports `formatRoundTime`, `formatKD`, `rankedPilots`, `scoreboardMarkup`, `spectatorCandidates`, `chooseSpectator` and `aircraftLoadoutNote`. Standings sort by kills descending, deaths ascending, then callsign; the displayed K/D is a dash for zero deaths. HTML score rows escape pilot-supplied text. Spectator candidates exclude self, disconnected pilots and dead aircraft. Equipment notes describe each profile's actual weapons and warn about mission payload requirements without forbidding a selection. Carrier warning text likewise does not disable launch or modify a selected profile.

## Verification boundary

Run `node --test games/skyward/tests/*.test.mjs` from the repository root. The suites cover the campaign and crew regressions alongside arena equipment, terrain cover, collision, elapsed round time, lives/respawns, model and effect geometry, worker behavior, and input/UI contracts. Combat coverage includes addressed receipts, event-tail fallback, life/run deduplication, camera-relative directions, reduced-motion reactions, effect/smoke budgets, audio synthesis/mixing limits and the actual app's fatal-destruction display before debrief. Real WebSocket tests include actual host/guest simulations, weapon attribution, host death, authenticated recovery, room replay and old-run/old-life rejection.

Canvas/native raster checks and browser smoke tests can verify the software path when WebGL is unavailable. They do not establish actual GPU output, sustained device performance, physical iPhone/Safari input behavior, speaker loudness/reproduction, or independent internet-connection multiplayer quality. Keep those hardware and deployment checks separate from passing source-level tests; do not infer a frame-rate promise from simulation frequency or synthetic timing.
