# SKYWARD module contract · v0.5.0

Shared source: `games/skyward/public`. ES modules (`.mjs`), no build step; Three.js r160.1 is vendored at `vendor/three.module.js`. Units are meters, seconds, radians and meters/second. All ranges and flight performance are game abstractions.

## Coordinates and content

Aircraft models use **+Z forward, +Y up, pilot-right −X and port/left +X**. Heading zero points +Z. Positive legacy heading turns toward +X; positive pitch raises the nose; positive legacy roll banks left. Legacy pose fields encode Euler YXZ rotation `(-pitch,heading,-roll)`. The normalized `orientation` quaternion is authoritative. Use `orientation.mjs` helpers (`orientationOf`, `basis`, `deriveEuler`, `integrateBodyRotation`, `slerp`) rather than reconstructing axes. Named positive flight inputs mean pitch up, yaw right and roll right around aircraft-local axes.

`campaign.mjs` exports `AIRCRAFT` (keyed object), `MISSIONS` (ordered 18-sortie campaign), `SPECIAL_MISSIONS`, `getMission(id)` and `getAircraft(id)`. `getMission` resolves special-operation IDs as well as campaign IDs/numbers. Mission shape: `{id,number?,title,year,era,location,aircraft,kind,biome,description,briefing:[strings],lesson,duration,weather:{wind,cloudBase,cloudTop,fog,timeOfDay},start:{x,y,z,heading,speed,airborne},runways:[{x,z,y,length,width,heading,label,carrier}],waypoints:[{x,y,z,radius,label}],enemies:[{id,type,aircraft,x,y,z,heading,speed,health}],targets:[{id,type,x,y,z,health,label}],goal:{...},historicalNote,sources:[urls]}`.

`gunship-nightwatch` is Nightwatch Basin: `kind:'gunship'`, `aircraft:'ac130'`, one pilot and one gunner, eight ground objectives, night weather. Its `orbit:{x,z,radius,altitude,direction}` supplies the basin marker. Special missions have no campaign number and do not alter campaign progress. The AC-130 also supports ordinary free-flight handling; its shared weapon stations belong to the crew operation.

Aircraft shape: {id,name,shortName,era,model,color,accent,maxSpeed,cruise,stallSpeed,acceleration,turnRate,climbRate,rollRate,health,gun,missiles,bombs,radar,stealth,vtol,role,summary}. Numeric speeds are simulation m/s.

## Simulation

`sim.mjs` exports `FlightSimulation`, `terrainHeight(x,z,mission)` and `advancePlayer(player,input,dt,aircraft,mission,settings)`. `new FlightSimulation(mission,settings)` accepts an object or ID. `.player` carries quaternion `orientation`, position, Euler pose, speed, throttle, health, fuel, gear/flaps/brake, engine/startup state, aircraft ID, vertical speed, stall state and stores. `.step(dt,{roll,pitch,yaw,throttle,fire})` advances flight. `.action(name)` supports startup, gear, flaps, brake, level, target, missile, payload, fire, countermeasure, radar, hover and abort.

World properties: `.enemies`, `.targets`, `.projectiles`, `.effects`, `.paratroopers`, `.waypointIndex`, `.status` (`flying`/`success`/`failed`), `.objective`, `.hint`, `.progress`, `.time`, `.score`, `.events`, `.targetId`, `.lockProgress`, `.radarOn`, `.threat`. `.getSnapshot()` serializes the host world. Ordinary squadron `.applySnapshot(snapshot)` preserves the guest's own plane; `.remotePlayers` and `.applyRemoteAction(action,pose)` support host arbitration of independent guest aircraft.

### Shared crew state

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
  gunner: { seat: '25mm', yaw: 0, pitch: 0, zoom: false }
})
```

Both expose `resize()`, `setSettings(settings)`, `project(x,y,z)` (screen pixels and `visible`), `renderMenu(time,aircraft)` and `dispose()`. WebGL construction may throw; the app then uses Canvas rendering. Gunner mode uses the shared station helper and first-person panels. `gunship-views.mjs` and `gunship-scenery.mjs` supply station interiors and the compound. `presentation.mjs` handles fixed-step render interpolation; `camera-pose.mjs` handles the normal cockpit frame.

## Input and room transport

`controls.mjs` owns pilot input. `gunner-controls.mjs` exports `GunnerControls`; `.read(dt)` returns `{seat,yaw,pitch,fire,zoom}`. Only the role's controller is active. `setActive`, `clear`, `reset`, `selectSeat`, `toggleZoom` and `recenter` manage state. Zoom stays local.

Desktop gunner defaults: mouse or arrows aim, primary mouse button/Space fire, 1/2/3 select stations, Z zooms, C centres, T marks the next target, Escape/P pauses. `settings.gunnerBindings` is independently remappable from pilot `keyBindings` in Setup → Keyboard. Touch defaults: left AIM, right FIRE; releasing AIM holds the sight. Swap thumbs reverses those sides. Visible tools are `25 MM`, `40 MM`, `105 MM`, `ZOOM`, `CENTRE`, `NEXT TARGET`. Pointer cancellation, blur, resize, visibility loss and pause clear held input.

`network.mjs` exports `SquadronClient({onStatus,onRoster,onStart,onWorld,onAction,onCrewInput,onEnd,url?})`.

- Methods: `create(name,missionId)`, `join(code,name)`, `ready(bool)`, `setMission(id)`, `start(id)`, `sendPose(player)`, `sendWorld(snapshot)`, `sendAction(action)`, `sendCrewInput(input,{reset:false})`, `samplePlayers()`, `samplePilot()`, `leave()`. The crew input options object is optional.
- Properties include `code`, `id`, `isHost`, `connected`, `latency`, `roster`, `mode` (`squadron`/`crew`), `role` (`pilot`/`gunner`), `maxPlayers`, `hostId`, `missionId`.
- Callbacks include `onStart({missionId,seed,mode,role})`, `onWorld(snapshot)`, `onAction({action,playerId,player})`, `onCrewInput({playerId,input,seq,reset})`, `onEnd(message)`, `onStatus(status,message)`.

Campaign squadron rooms support 2–4 independent pilots. Crew rooms need two connected, ready members: creator pilots, guest guns. The server derives roles from mission/membership; only the host sends start/world updates. Crew guests cannot send aircraft poses or legacy combat actions. `samplePlayers()` returns no extra aircraft in crew mode; the guest uses `samplePilot()` for its shared rendered pose.

Poses and sustained crew inputs send at up to 15 Hz; trigger edges send promptly. Host worlds send at up to 10 Hz. Crew packets carry a per-sortie run ID and monotonic sequence; the relay validates identity, role, seat, finite bounded angles, boolean fire and rate, and strips unrelated fields. Pose sampling uses 100 ms interpolation delay and at most 150 ms extrapolation.

Ordinary trigger release sends `fire:false` without reset, preserving one brief click until the next host physics tick. Pause, blur, pointer cancellation and controller deactivation send `sendCrewInput({...input,fire:false},{reset:true})`; reset is valid only with `fire:false`. Cancellation bypasses client aim coalescing. The relay prioritizes one cancellation after an accepted press, including after its normal release, and rate-limits repeated resets. The host forwards the callback flag through `sim.applyCrewInput(input,playerId,{reset})`, cancelling both held fire and an unticked click. Server-originated disconnect, replacement and pilot-pause stops also set `reset:true`.

Pilot pause pauses both crew members; gunner pause stops their guns while the pilot continues. Reconnect tokens reserve seats briefly. Pause/disconnect/replacement resets fire; interruption requires a released trigger before shooting resumes. Host loss pauses the room and ends it if recovery fails. No host migration or public listing. Rooms live in server memory; use one server process. The flight lead remains trusted for world simulation.
