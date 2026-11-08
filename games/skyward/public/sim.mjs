import { getAircraft, getMission } from './campaign.mjs';
import { normalizeArenaConfig, spawnForPlayer, prepareMissionStarts, ARENA_RESPAWN_DELAY, MISSION_RESPAWN_DELAY } from './arena.mjs';
import { terrainHeight, surfaceHeight, runwayAt, runwayCoordinates, segmentTerrainTime, lineOfSight, terrainClearance, carrierObstacleTime } from './terrain.mjs';
export { terrainHeight, surfaceHeight, runwayAt, runwayCoordinates, segmentTerrainTime, lineOfSight, terrainClearance, carrierObstacleTime } from './terrain.mjs';
import { orientationFromEuler, orientationOf, basis, deriveEuler, slerp, isOrientation, normalizeOrientation, multiplyOrientations, integrateBodyRotation } from './orientation.mjs';
import { GUNSHIP_STATIONS, GUNSHIP_INPUT_TIMEOUT, clampCrewInput, createGunshipCrewState, getGunshipStation, gunshipStationPose } from './gunship.mjs';

const TAU = Math.PI * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const angle = n => ((n + Math.PI) % TAU + TAU) % TAU - Math.PI;
const mix = (a, b, f) => a + (b - a) * clamp(f, 0, 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = value => JSON.parse(JSON.stringify(value));
const attitudes = new WeakMap();
const attitudeFields = ['heading', 'pitch', 'roll'];
const quaternionFields = ['x', 'y', 'z', 'w'];
// Legacy callers may still edit Euler pose fields (mission setup, old network
// packets, and tools). Import those edits once; all actual flight integrates q.
function readAttitude(p) {
  const last = attitudes.get(p);
  const eulerChanged = last && attitudeFields.some(key => p[key] !== last[key]);
  const quaternionChanged = !last || !isOrientation(p.orientation)
    || quaternionFields.some(key => p.orientation[key] !== last.orientation[key]);
  return eulerChanged && !quaternionChanged ? orientationFromEuler(p.heading, p.pitch, p.roll) : orientationOf(p);
}
function setAttitude(p, orientation) {
  p.orientation = normalizeOrientation(orientation);
  Object.assign(p, deriveEuler(p.orientation));
  attitudes.set(p, { heading: p.heading, pitch: p.pitch, roll: p.roll, orientation: { ...p.orientation } });
  return basis(p.orientation);
}
const direction = p => basis(readAttitude(p)).forward;
const living = o => o && o.health > 0 && o.alive !== false && !o.escaped;
const assisted = settings => settings?.assist !== 'expert';

function advanceAttitude(p, input, dt, a, damageFactor, settings) {
  // The touch controller already applies its dead zone. Even a fine analog
  // correction must not be opposed by a separate world-leveling rotation.
  const active = input.pitch !== 0 || input.roll !== 0 || input.yaw !== 0;
  if (active) p.levelAssist = 0;
  let orientation = integrateBodyRotation(p.orientation, {
    pitch: input.pitch * 0.55 * damageFactor,
    roll: input.roll * a.rollRate * damageFactor,
    yaw: input.yaw * (p.hover ? 0.65 : a.turnRate * 0.28) * damageFactor,
  }, dt);
  // Assistance is hands-off recovery, never a bank/pitch limit. Holding any
  // attitude control keeps its local axis authoritative even when inverted.
  if (!active && (p.levelAssist > 0 || settings.autoLevel !== false)) {
    const recover = p.levelAssist > 0;
    const targetPitch = !recover && p.takeoffAssist > 0 && !p.hover ? 0.12 : 0;
    const rate = recover ? 3 : settings.assist === 'expert' ? 0.6 : settings.assist === 'standard' ? 1.2 : 2.2;
    const target = orientationFromEuler(deriveEuler(orientation).heading, targetPitch, 0);
    orientation = slerp(orientation, target, 1 - Math.exp(-rate * dt));
  }
  return setAttitude(p, orientation);
}

function segmentSphereTime(from, to, center, radius) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const ox = from.x - center.x, oy = from.y - center.y, oz = from.z - center.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz;
  const discriminant = b * b - a * c;
  if (a < 1e-12 || discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / a;
  return time >= 0 && time <= 1 ? time : null;
}

/** Mutates one pilot-owned plane; crew guests receive its shared pose instead. */
export function advancePlayer(player, input = {}, dt = 1 / 60, aircraft = getAircraft(player.aircraft), mission = {}, settings = {}) {
  const p = player, a = aircraft;
  dt = clamp(finite(dt, 1 / 60), 0, 0.05);
  if (!dt || p.crashed || p.health <= 0) return p;
  const rollInput = clamp(finite(input.roll), -1, 1), pitchInput = clamp(finite(input.pitch), -1, 1), yawInput = clamp(finite(input.yaw), -1, 1);
  let frame = setAttitude(p, readAttitude(p));
  const attitudeInput = { pitch: pitchInput, roll: rollInput, yaw: yawInput };
  if (Number.isFinite(input.throttle)) p.throttle = clamp(input.throttle, 0, 1);
  p.throttle = clamp(finite(p.throttle), 0, 1);
  if (a.fixedGear) p.gear = true;
  if (a.hasFlaps === false) p.flaps = false;
  p.flightTime = finite(p.flightTime) + dt;
  p.levelAssist = Math.max(0, finite(p.levelAssist) - dt);
  p.takeoffAssist = Math.max(0, finite(p.takeoffAssist) - dt);
  p.fuel = Math.max(0, finite(p.fuel, 100) - (p.engine ? (0.002 + p.throttle * 0.005) * dt : 0));
  if (p.fuel <= 0) p.engine = false;
  const hp = clamp(p.health / a.health, 0, 1), damageFactor = 0.72 + hp * 0.28;
  const stallSpeed = a.stallSpeed * (p.flaps ? 0.84 : 1);
  const wind = mission.weather?.wind || {};
  const gust = Math.sin(p.flightTime * 0.43 + p.z / 1300) * 0.7;
  const windX = finite(wind.x) + gust, windZ = finite(wind.z);
  const beforeY = p.y, beforePosition = { x: p.x, y: p.y, z: p.z, orientation: { ...p.orientation } }, wasOnGround = p.onGround;
  const previousRunway = mission.runways?.[runwayAt(p.x, p.z, mission, 3)];

  if (p.hover && a.vtol) {
    if (p.onGround) frame = setAttitude(p, orientationFromEuler(p.heading - yawInput * 0.65 * dt, 0, 0));
    else frame = advanceAttitude(p, attitudeInput, dt, a, damageFactor, settings);
    // Nozzles act along aircraft up; gravity remains world-down. Upright, the
    // original half-throttle hover and gentle deck-descent rates are unchanged.
    const hoverThrust = p.engine ? p.throttle * 90 : 0;
    p.vx = mix(finite(p.vx, frame.forward.x * p.speed), frame.up.x * hoverThrust + windX * 0.2, dt * 1.4);
    p.vz = mix(finite(p.vz, frame.forward.z * p.speed), frame.up.z * hoverThrust + windZ * 0.2, dt * 1.4);
    p.hoverForward = p.vx * frame.forward.x + p.vz * frame.forward.z;
    p.speed = Math.hypot(p.vx, p.vz);
    p.verticalSpeed = mix(finite(p.verticalSpeed), p.engine ? (p.throttle * 2 * frame.up.y - 1) * 27.5 : -18, dt * 1.8);
    p.settlingSpeed = 0;
    if (p.onGround && p.verticalSpeed > 1) { p.onGround = false; p.everAirborne = true; }
    if (!p.onGround) { p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.verticalSpeed * dt; }
    p.stalled = false;
  } else {
    const gearDrag = p.gear && !a.fixedGear ? 0.86 : 1, flapDrag = p.flaps ? 0.76 : 1;
    const targetSpeed = p.engine ? a.maxSpeed * Math.pow(p.throttle, 0.68) * gearDrag * flapDrag * damageFactor : 0;
    const thrust = clamp((targetSpeed - p.speed) * 0.23, -a.acceleration * 0.65, a.acceleration * damageFactor);
    const launchAssist = p.onGround && previousRunway?.carrier && p.carrierLaunch && !p.brake && p.throttle > 0.8 ? a.acceleration * 0.55 : 0;
    p.speed = Math.max(0, p.speed + (thrust + launchAssist - frame.forward.y * 9.81) * dt);
    if (p.onGround) {
      p.pitch = mix(p.pitch, Math.max(0, pitchInput) * 0.16, dt * 3);
      p.roll = mix(p.roll, 0, dt * 6);
      p.heading = angle(p.heading - (yawInput + rollInput * 0.65) * a.turnRate * Math.min(p.speed / 15, 1) * dt);
      if (p.brake) p.speed = Math.max(0, p.speed - (a.acceleration * 2.3 + 10) * dt);
      const lift = p.speed > stallSpeed * 1.12 && pitchInput > 0.13;
      const autoLift = assisted(settings) && p.speed > stallSpeed * 1.32 && pitchInput > -0.2;
      if (!p.brake && (lift || autoLift)) {
        p.onGround = false; p.everAirborne = true;
        p.takeoffAssist = assisted(settings) ? 7 : 0;
        p.pitch = Math.max(p.pitch, assisted(settings) ? 0.14 : 0.08);
        p.verticalSpeed = Math.max(3, p.speed * Math.sin(p.pitch));
      }
      frame = setAttitude(p, orientationFromEuler(p.heading, p.pitch, p.roll));
      p.settlingSpeed = 0;
    } else {
      frame = advanceAttitude(p, attitudeInput, dt, a, damageFactor, settings);
      const speedTurnFactor = clamp(Math.pow(a.cruise / Math.max(stallSpeed, p.speed), 0.4), 0.65, 1.25);
      const lift = clamp(p.speed / stallSpeed, 0, 1) ** 2;
      // Coordinated banking is a lift/gravity aid, not a world-space control.
      // The right wing's world height is continuous even at vertical attitudes.
      const turn = frame.right.y * a.turnRate * speedTurnFactor * lift * dt;
      frame = setAttitude(p, multiplyOrientations(orientationFromEuler(turn, 0, 0), p.orientation));
      p.stalled = p.speed < stallSpeed;
      const gravityAcceleration = (lift * frame.up.y - 1) * 9.81;
      const settlingDecay = Math.exp(-0.35 * dt);
      p.settlingSpeed = finite(p.settlingSpeed) * settlingDecay + gravityAcceleration / 0.35 * (1 - settlingDecay);
      // Forward airspeed follows the same nose used by the camera and weapons.
      // A separate world-down slip supplies lost lift in a bank or stall; never
      // clamp just world Y, which would make the nose and flight path disagree.
      p.verticalSpeed = frame.forward.y * p.speed + p.settlingSpeed;
    }
    p.vx = frame.forward.x * p.speed + (p.onGround ? 0 : windX);
    p.vz = frame.forward.z * p.speed + (p.onGround ? 0 : windZ);
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.onGround && previousRunway?.carrier && runwayAt(p.x, p.z, mission, 3) < 0) {
      // Retain deck height when rolling beyond its end; falling toward the sea
      // is physical flight, never an instant snap to the water surface.
      p.onGround = false; p.y = beforeY; p.verticalSpeed = -3; p.settlingSpeed = -3;
    } else if (p.onGround) p.y = surfaceHeight(p.x, p.z, mission) + 3;
    else p.y += finite(p.verticalSpeed) * dt;
  }

  const carrierHit = carrierObstacleTime(beforePosition, p, a, mission);
  if (carrierHit !== null) {
    p.x = mix(beforePosition.x, p.x, carrierHit); p.y = mix(beforePosition.y, p.y, carrierHit); p.z = mix(beforePosition.z, p.z, carrierHit);
    p.health = 0; p.crashed = true; p.crashCause = 'The wing or airframe struck the carrier island.';
  }
  if (!p.crashed && !wasOnGround && !p.onGround) {
    const swept = segmentTerrainTime(beforePosition, p, mission, 3, true);
    if (swept !== null && swept < 0.999 && p.y > surfaceHeight(p.x, p.z, mission) + 3) {
      p.x = mix(beforePosition.x, p.x, swept); p.z = mix(beforePosition.z, p.z, swept);
      p.y = surfaceHeight(p.x, p.z, mission) + 3; p.health = 0; p.crashed = true;
      p.crashCause = 'The aircraft struck the terrain.';
    }
  }
  const ground = surfaceHeight(p.x, p.z, mission);
  if (!p.crashed && !p.onGround && p.y <= ground + 3) {
    const runwayIndex = runwayAt(p.x, p.z, mission, assisted(settings) ? 16 : 2);
    const runway = mission.runways?.[runwayIndex];
    const alignment = !runway || p.hover || Math.abs(Math.sin(p.heading - runway.heading)) < (assisted(settings) ? 0.75 : 0.4);
    const speedSafe = p.hover ? p.speed < 28 : p.speed < stallSpeed * (assisted(settings) ? 2.05 : 1.65);
    const sinkSafe = p.verticalSpeed > (p.hover ? -12 : assisted(settings) ? -12 : -6.5);
    const gearSafe = p.gear || p.hover;
    const dry = terrainHeight(p.x, p.z, mission) >= 0 || runway?.carrier && runwayAt(p.x, p.z, mission, 3) >= 0;
    const upright = frame.up.y > Math.cos(assisted(settings) ? 0.65 : 0.4);
    if (speedSafe && sinkSafe && gearSafe && upright && Math.abs(p.roll) < (assisted(settings) ? 0.5 : 0.25) && alignment && dry) {
      p.onGround = true; p.y = ground + 3; p.verticalSpeed = 0; p.settlingSpeed = 0;
      frame = setAttitude(p, orientationFromEuler(p.heading, 0, 0));
      p.lastLanding = { runwayIndex, safe: true, speed: p.speed, time: p.flightTime };
      p.landings = finite(p.landings) + 1;
      if (p.hover) { p.speed = 0; p.brake = true; }
    } else {
      p.y = ground + 3; p.health = 0; p.crashed = true;
      p.crashCause = !dry ? 'The aircraft ditched in the water.' : !gearSafe ? 'The landing gear was retracted.' : !sinkSafe ? 'The descent was too steep at touchdown.' : !speedSafe ? 'The approach was too fast.' : 'The aircraft hit the terrain.';
    }
  }
  // A rolling aircraft cannot drive off a carrier and stay attached to the sea.
  if (p.onGround && terrainHeight(p.x, p.z, mission) < 0 && runwayAt(p.x, p.z, mission, 4) < 0) {
    p.onGround = false; p.verticalSpeed = -3;
  }
  p.agl = p.y - Math.max(0, terrainHeight(p.x, p.z, mission));
  p.verticalSpeed = p.onGround ? 0 : finite(p.verticalSpeed, (p.y - beforeY) / dt);
  return p;
}

function createPilot(aircraft, start = {}, id = 'local', lifeId = 1) {
  const a = getAircraft(aircraft), s = start;
  const p = {
    id, lifeId, alive: true, x: finite(s.x), y: finite(s.y, 500), z: finite(s.z), heading: finite(s.heading), pitch: 0, roll: 0,
    speed: finite(s.speed), throttle: s.cold ? 0.08 : s.airborne ? Math.pow(a.cruise / a.maxSpeed, 1 / 0.68) : 0.1,
    health: a.health, fuel: 100, gear: a.fixedGear || (s.gear ?? !s.airborne), flaps: false, brake: !s.airborne,
    engine: !s.cold, startupStep: s.cold ? 0 : 4, onGround: !s.airborne, aircraft: a.id,
    verticalSpeed: 0, settlingSpeed: 0, stalled: false, ammo: a.gun?.ammo || 0, missiles: a.missiles, bombs: a.bombs,
    hover: false, troopers: a.id === 'c47' ? 24 : 0, dropsRemaining: a.id === 'c47' ? 2 : 0,
    gunHeat: 0, flightTime: 0, everAirborne: !!s.airborne, landings: 0, vx: Math.sin(finite(s.heading)) * finite(s.speed), vz: Math.cos(finite(s.heading)) * finite(s.speed),
    carrierLaunch: !!s.carrierLaunch,
  };
  setAttitude(p, orientationFromEuler(p.heading, p.pitch, p.roll));
  return p;
}

export class FlightSimulation {
  constructor(mission, settings = {}) {
    this.mission = typeof mission === 'string' ? getMission(mission) : mission;
    this.settings = { assist: 'assisted', guidance: 'guided', autoLevel: true, ...settings };
    this.aircraft = getAircraft(this.mission.aircraft);
    const m = this.mission, a = this.aircraft, s = m.start || {};
    this.player = createPilot(a.id, s, settings.playerId || 'local');
    this.enemies = copy(m.enemies || []).map((e, i) => ({ ...e, alive: true, active: true, pitch: 0, roll: 0, initialHealth: e.health, fireTimer: 1.5 + i * 0.7, missileTimer: 8 + i * 3, age: 0 }));
    this.targets = copy(m.targets || []).map(t => ({ ...t, y: ['balloon', 'city'].includes(t.type) ? t.y : Math.max(0, terrainHeight(t.x, t.z, m)) + 5, alive: true, active: true, initialHealth: t.health, fireTimer: 7 }));
    this.projectiles = []; this.effects = []; this.paratroopers = []; this.remotePlayers = [];
    this.waypointIndex = 0; this.status = 'flying'; this.phase = m.start?.cold ? 'startup' : m.start?.airborne ? 'flight' : 'takeoff';
    this.objective = ''; this.hint = ''; this.progress = 0; this.time = 0; this.score = 0; this.events = []; this.navigationTarget = null;
    this.targetId = null; this.lockProgress = 0; this.radarOn = a.radar; this.threat = 0;
    this.defense = 100; this.escortTime = 0; this.dropsLanded = 0; this.ending = null; this.endingText = '';
    this.gunCooldown = 0; this.payloadCooldown = 0; this.countermeasureCooldown = 0; this.countermeasureTime = 0;
    this.egressTime = 0; this.worldAuthority = true; this.remoteWeapons = new Map(); this.remoteDamage = {};
    this.crew = m.kind === 'gunship' ? createGunshipCrewState() : null;
    this._crewInputTime = -Infinity; this._pendingCrewPress = null;
    this.multiplayer = null; this.participants = new Map(); this.round = null; this._seenActions = new Set();
    this._eventId = 0; this._entityId = 0; this._lastLandingCount = 0; this._warnedStall = false; this._rng = (m.number || 1) * 19937;
    this._chooseTarget(); this._updateBombAim(); this._updateObjective(0);
  }

  configureMultiplayer({ mode, config = {}, players = [], playerId, hostId, runId } = {}) {
    const options = normalizeArenaConfig({ ...config, mode: mode || config.mode || 'squadron' });
    this.multiplayer = { ...options, runId: runId || null, hostId: hostId || playerId || this.player.id };
    // The AC-130 is one shared aircraft. Its death may end that sortie, while
    // the room itself remains available for another crew flight.
    if (options.mode === 'crew' || this.crew) return this;
    this.mission = prepareMissionStarts(this.mission, players);
    this.worldAuthority = !hostId || (playerId || this.player.id) === hostId;
    const localId = playerId || this.player.id;
    const roster = players.length ? players : [{ id: localId, aircraft: this.mission.aircraft, name: 'Pilot' }];
    this.participants.clear(); this.remoteWeapons.clear(); this._seenActions.clear();
    this.round = { duration: options.mode === 'dogfight' ? options.durationSeconds : null,
      elapsed: 0, remaining: options.mode === 'dogfight' ? options.durationSeconds : null, ended: false };
    roster.forEach((entry, index) => {
      const aircraft = getAircraft(entry.aircraft || this.mission.aircraft).id;
      const startMode = entry.startMode || (this.mission.start?.airborne ? 'airborne' : 'mission');
      const spawn = spawnForPlayer(this.mission, aircraft, index, startMode, 1);
      const pose = createPilot(aircraft, spawn, entry.id, 1);
      const record = { id: entry.id, name: entry.name || `Pilot ${index + 1}`, aircraft, startMode, index,
        lifeId: 1, alive: true, health: pose.health, livesRemaining: ['freeflight', 'dogfight'].includes(options.mode) ? null : options.lives,
        kills: 0, deaths: 0, damageId: 0, respawnAt: null, connected: entry.connected !== false,
        spawn, pose, invulnerableUntil: 0, lastPoseTime: this.time, lockProgress: 0, lockTargetId: null };
      this.participants.set(record.id, record);
      if (entry.id === localId) { this.player = pose; this.aircraft = getAircraft(aircraft); this.radarOn = this.aircraft.radar; }
    });
    this.remotePlayers = [...this.participants.values()].filter(record => record.id !== localId).map(record => record.pose);
    this.player.targetId = this.targetId; this.player.radarOn = this.radarOn;
    this._chooseTarget(); this._updateObjective(0);
    return this;
  }

  get localParticipant() { return this.participants.get(this.player.id) || null; }
  get scoreboard() {
    return [...this.participants.values()].map(({ id, name, aircraft, kills, deaths, alive, livesRemaining, connected }) => ({
      id, name, aircraft, kills, deaths, alive, livesRemaining, connected, kd: deaths ? kills / deaths : kills,
    })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
  }
  get canRespawn() {
    const record = this.localParticipant;
    return !!record && !record.alive && this.status === 'flying' && (record.livesRemaining === null || record.livesRemaining > 0)
      && this.time >= record.respawnAt;
  }

  updateRoster(players = []) {
    for (const record of this.participants.values()) {
      const row = players.find(player => player.id === record.id);
      record.connected = !!row && row.connected !== false;
      if (row?.name) record.name = row.name;
    }
  }

  setRemotePlayers(poses = []) {
    if (!this.participants.size) { this.remotePlayers = poses; return; }
    for (const pose of poses) {
      const record = this.participants.get(pose?.id);
      if (!record || record.id === this.player.id || pose.lifeId !== record.lifeId || !record.alive) continue;
      if (!['x', 'y', 'z', 'heading'].every(key => Number.isFinite(pose[key]))) continue;
      const a = getAircraft(record.aircraft), previous = record.pose;
      const elapsed = Math.max(1 / 15, Math.min(2, this.time - record.lastPoseTime));
      // Clients own prediction, but a pose cannot teleport a gun across a map,
      // switch airframes, change stores or heal damage on the authority.
      if (this.worldAuthority && (dist(previous, pose) > a.maxSpeed * 1.75 * elapsed + 95
        || finite(pose.speed) > a.maxSpeed * 1.75 || Math.abs(pose.y) > 60000)) continue;
      const wasOnGround = previous.onGround;
      const terrainHit = this.worldAuthority && !wasOnGround && segmentTerrainTime(previous, pose, this.mission, 1.8, true);
      const carrierHit = this.worldAuthority ? carrierObstacleTime(previous, pose, record.aircraft, this.mission) : null;
      const before = { x: previous.x, y: previous.y, z: previous.z };
      const stores = { ammo: previous.ammo, missiles: previous.missiles, bombs: previous.bombs,
        troopers: previous.troopers, dropsRemaining: previous.dropsRemaining, gunHeat: previous.gunHeat };
      Object.assign(previous, pose, stores, { id: record.id, lifeId: record.lifeId, aircraft: record.aircraft,
        health: record.health, alive: record.alive, crashed: false, type: 'player', label: record.name });
      setAttitude(previous, orientationOf(pose));
      const ground = surfaceHeight(previous.x, previous.z, this.mission);
      previous.onGround = !!pose.onGround && Math.abs(previous.y - ground - 3) < 5;
      previous.everAirborne ||= !previous.onGround;
      if (previous.onGround && !wasOnGround) {
        previous.lastLanding = { runwayIndex: runwayAt(previous.x, previous.z, this.mission, 3), safe: true, speed: previous.speed, time: this.time };
        previous.landings = finite(previous.landings) + 1;
      }
      record.lastPoseTime = this.time;
      if (carrierHit !== null) {
        previous.x = mix(before.x, previous.x, carrierHit); previous.y = mix(before.y, previous.y, carrierHit); previous.z = mix(before.z, previous.z, carrierHit);
        this._killParticipant(record, null, 'Carrier island collision');
      } else if (terrainHit !== false && terrainHit !== null && terrainHit !== undefined) this._killParticipant(record, null, 'Terrain collision');
      else if (this.worldAuthority && (previous.y < ground + 1.8 || (!wasOnGround || pose.crashed)
        && previous.y <= ground + 3.1 && this._validatedCrash(previous, !!pose.crashed))) this._killParticipant(record, null, 'Aircraft lost on landing');
    }
    this.remotePlayers = [...this.participants.values()].filter(record => record.id !== this.player.id)
      .map(record => Object.assign(record.pose, { alive: record.alive, health: record.health, connected: record.connected,
        friendly: this.multiplayer.mode !== 'dogfight', label: record.name, type: 'player' }));
  }

  _validatedCrash(pose, claimed = false) {
    if (carrierObstacleTime(pose, pose, pose.aircraft, this.mission) !== null) return true;
    const ground = surfaceHeight(pose.x, pose.z, this.mission);
    if (pose.y > ground + 3.5) return false;
    const a = getAircraft(pose.aircraft), runway = this.mission.runways?.[runwayAt(pose.x, pose.z, this.mission, claimed ? 2 : 16)];
    const water = terrainHeight(pose.x, pose.z, this.mission) < 0 && !runway?.carrier;
    const stall = a.stallSpeed * (pose.flaps ? 0.84 : 1), attitude = deriveEuler(orientationOf(pose));
    // Personal assistance can be stricter than the host's. A declared crash
    // still needs actual ground contact and a landing failure under a supported
    // assistance mode; a pilot cannot report somebody else's destruction.
    const speedUnsafe = pose.speed >= (pose.hover ? 28 : stall * (claimed ? 1.65 : 2.05));
    const sinkUnsafe = finite(pose.verticalSpeed) <= (pose.hover ? -12 : claimed ? -6.5 : -12);
    const alignmentUnsafe = runway && !pose.hover && Math.abs(Math.sin(attitude.heading - runway.heading)) >= (claimed ? 0.4 : 0.75);
    return water || !pose.gear && !pose.hover || speedUnsafe || sinkUnsafe || alignmentUnsafe
      || basis(orientationOf(pose)).up.y <= Math.cos(claimed ? 0.4 : 0.65)
      || Math.abs(attitude.roll) >= (claimed ? 0.25 : 0.5) || pose.y < ground + 1.8;
  }

  _participantTargets(shooterId) {
    if (this.multiplayer?.mode !== 'dogfight') return [];
    return [...this.participants.values()].filter(record => record.id !== shooterId && record.alive && record.connected)
      .map(record => Object.assign(record.pose, { type: 'player', label: record.name, health: record.health, alive: record.alive }));
  }

  _killParticipant(record, attackerId = null, reason = 'Aircraft destroyed') {
    if (!this.worldAuthority || !record?.alive) return false;
    if (!attackerId && this.time - finite(record.lastDamageAt, -Infinity) < 12) attackerId = record.lastAttackerId;
    record.alive = false; record.health = 0; record.deaths++; record.damageId++;
    if (record.livesRemaining !== null) record.livesRemaining = Math.max(0, record.livesRemaining - 1);
    record.respawnAt = this.time + (['freeflight', 'dogfight'].includes(this.multiplayer.mode) ? ARENA_RESPAWN_DELAY : MISSION_RESPAWN_DELAY);
    Object.assign(record.pose, { health: 0, alive: false, crashed: true });
    record.lockProgress = 0; record.lockTargetId = null;
    if (record.id === this.player.id) { this.lockProgress = 0; this.targetId = null; }
    const attacker = this.participants.get(attackerId);
    if (this.multiplayer.mode === 'dogfight' && attacker && attacker !== record) attacker.kills++;
    this._effect('explosion', record.pose.x, record.pose.y, record.pose.z, 105, 5);
    this._event('destroyed', attacker && attacker !== record ? `${attacker.name} downed ${record.name}` : `${record.name} · ${reason}`);
    return true;
  }

  _damageParticipant(record, amount, attackerId, weapon) {
    if (!this.worldAuthority || !record?.alive || this.time < record.invulnerableUntil || amount <= 0) return false;
    if (attackerId && this.participants.has(attackerId) && this.multiplayer.mode !== 'dogfight') return false;
    if (attackerId && attackerId !== record.id && this.participants.has(attackerId)) { record.lastAttackerId = attackerId; record.lastDamageAt = this.time; }
    record.health = Math.max(0, record.health - amount); record.damageId++;
    record.pose.health = record.health;
    this._effect('impact', record.pose.x, record.pose.y, record.pose.z, 22, 0.45);
    if (!record.health) this._killParticipant(record, attackerId, weapon || 'Aircraft destroyed');
    return true;
  }

  requestRespawn(playerId = this.player.id) {
    const record = this.participants.get(playerId);
    if (!this.worldAuthority || this.status !== 'flying' || !record || record.alive
      || record.livesRemaining !== null && record.livesRemaining <= 0 || this.time < record.respawnAt) return false;
    record.lifeId++; record.alive = true; record.health = getAircraft(record.aircraft).health; record.damageId++;
    record.spawn = spawnForPlayer(this.mission, record.aircraft, record.index, record.startMode, record.lifeId);
    record.pose = createPilot(record.aircraft, record.spawn, record.id, record.lifeId);
    record.respawnAt = null; record.invulnerableUntil = this.time + 3; record.lastPoseTime = this.time;
    record.lockProgress = 0; record.lockTargetId = null; record.lastAttackerId = null; record.lastDamageAt = null; this.remoteWeapons.delete(record.id);
    if (record.id === this.player.id) {
      this.player = record.pose; this.gunCooldown = 0; this.missileCooldown = 0; this.payloadCooldown = 0;
      this.countermeasureCooldown = 0; this.countermeasureTime = 0; this._lastLandingCount = 0;
      this.radarOn = this.aircraft.radar; this._chooseTarget();
    }
    this.setRemotePlayers([]); this._event('respawn', `${record.name} returned to flight`);
    return true;
  }

  _advanceMultiplayer(dt) {
    if (!this.participants.size || !this.worldAuthority) return;
    const local = this.localParticipant;
    if (local?.alive) {
      local.health = Math.min(local.health, this.player.health); local.pose = this.player;
      if (this.player.crashed || this.player.health <= 0) this._killParticipant(local, null, this.player.crashCause || 'Aircraft lost');
    }
    for (const record of this.participants.values()) {
      if (!record.alive || record.id === this.player.id) continue;
      const p = record.pose, a = getAircraft(record.aircraft);
      const target = [...this.enemies, ...this.targets, ...this._participantTargets(p.id)]
        .find(candidate => candidate.id === p.targetId && living(candidate) && !candidate.friendly);
      if (record.lockTargetId !== target?.id) { record.lockProgress = 0; record.lockTargetId = target?.id || null; }
      const d = target ? dist(p, target) : Infinity, forward = direction(p);
      const dot = target ? ((target.x - p.x) * forward.x + (target.y - p.y) * forward.y + (target.z - p.z) * forward.z) / Math.max(1, d) : 0;
      const clear = !!target && lineOfSight(p, target, this.mission);
      if (a.radar && p.radarOn !== false && d <= a.missileRange && dot > 0.8 && clear)
        record.lockProgress = Math.min(1, record.lockProgress + dt / a.lockTime);
      else record.lockProgress = clear ? Math.max(0, record.lockProgress - dt * 1.1) : 0;
    }
    if (!this._wallClockRounds) this.round.elapsed = this.time;
    this._checkRoundEnd();
    if (this.multiplayer.mode === 'squadron' && [...this.participants.values()].filter(record => record.connected)
      .every(record => !record.alive && record.livesRemaining === 0)) this._finish(false, 'The squadron has exhausted its aircraft.');
  }

  advanceRoundTime(elapsedSeconds) {
    if (!this.worldAuthority || this.multiplayer?.mode !== 'dogfight' || this.status !== 'flying') return false;
    this._wallClockRounds = true;
    this.round.elapsed += Math.max(0, finite(elapsedSeconds));
    this._checkRoundEnd();
    return true;
  }

  _checkRoundEnd() {
    if (!this.round || this.round.duration === null) return;
    this.round.remaining = Math.max(0, this.round.duration - this.round.elapsed);
    if (this.round.remaining <= 0 && !this.round.ended) {
      this.round.elapsed = this.round.duration; this.round.ended = true;
      this.status = 'success'; this.phase = 'complete'; this.progress = 1;
      this.objective = 'Dogfight complete · final standings'; this.hint = 'The scoreboard is final. Regroup to fly another round.';
      this._event('success', 'Round complete');
    }
  }

  _updateThreat() {
    this.threatWarning = '';
    if (this._trackedThreat > 0 && this.threat <= this._trackedThreat + 1e-9) this.threat = 0;
    this._trackedThreat = 0;
    if (!living(this.player)) { this.threat = 0; return; }
    const incoming = this.projectiles.some(projectile => projectile.type === 'missile' && projectile.life > 0
      && (projectile.targetPlayerId === this.player.id || projectile.owner === 'enemy' && projectile.targetId === 'player' && !projectile.targetPlayerId)
      && (projectile.targetLifeId === undefined || projectile.targetLifeId === this.player.lifeId));
    const locks = [...this.participants.values()].filter(record => record.id !== this.player.id && record.alive
      && record.lockTargetId === this.player.id && record.lockProgress > 0.05 && lineOfSight(record.pose, this.player, this.mission));
    if (incoming) { this._trackedThreat = 1; this.threat = 1; this.threatWarning = 'MISSILE INCOMING · USE TERRAIN OR COUNTERMEASURES'; }
    else if (locks.some(record => record.lockProgress >= 0.98)) { this._trackedThreat = 0.8; this.threat = Math.max(this.threat, 0.8); this.threatWarning = 'RADAR LOCK · BREAK LINE OF SIGHT'; }
    else if (locks.length) { this._trackedThreat = 0.45; this.threat = Math.max(this.threat, 0.45); this.threatWarning = 'RADAR TRACK · ENEMY ACQUIRING'; }
  }

  get selectedTarget() { return [...this.enemies, ...this.targets, ...this._participantTargets(this.player.id)].find(t => t.id === this.targetId && living(t)) || null; }
  _random() { this._rng = (this._rng * 1664525 + 1013904223) >>> 0; return this._rng / 4294967296; }
  _id(prefix) { return `${prefix}-${++this._entityId}`; }
  _event(kind, text) {
    this.events.push({ id: ++this._eventId, kind, text });
    if (this.events.length > 32) this.events.splice(0, this.events.length - 32);
  }
  _effect(type, x, y, z, radius = 35, life = 1.4) { this.effects.push({ id: this._id('effect'), type, x, y, z, radius, age: 0, life }); }
  _hostiles(shooterId = this.player.id) { return [...this.enemies, ...this.targets, ...this._participantTargets(shooterId)].filter(t => living(t) && !t.friendly && !t.narrative && t.type !== 'dropzone'); }
  _chooseTarget(cycle = false) {
    const list = this._hostiles().filter(t => t.detected !== false).sort((a, b) => {
      const score = t => flatDist(this.player, t) + Math.abs(angle(Math.atan2(t.x - this.player.x, t.z - this.player.z) - this.player.heading)) * 3500;
      return score(a) - score(b);
    });
    if (!list.length) { this.targetId = null; this.lockProgress = 0; return; }
    const index = list.findIndex(t => t.id === this.targetId);
    const next = cycle && index >= 0 ? list[(index + 1) % list.length] : list[0];
    if (next.id !== this.targetId) this.lockProgress = 0;
    this.targetId = next.id; this.player.targetId = next.id;
  }

  action(name) {
    if (name && typeof name === 'object') name = name.name || name.action || name.type;
    if (name === 'respawn') return this.requestRespawn();
    if (this.participants.size && (!this.localParticipant?.alive || this.player.crashed || this.player.health <= 0)) return false;
    if (this.status !== 'flying' || (this.crew && !this.worldAuthority)) return false;
    const p = this.player, a = this.aircraft;
    switch (name) {
      case 'startup': {
        if (p.engine) { this.hint = 'Engine running. Release the brake and increase throttle.'; return false; }
        const labels = ['Fuel valve open', 'Magnetos on', 'Engine primed', 'Propeller turning · engine running'];
        this._event('startup', labels[Math.min(p.startupStep, 3)]);
        p.startupStep = Math.min(4, p.startupStep + 1);
        if (p.startupStep === 4) { p.engine = true; this.phase = 'takeoff'; }
        this._updateObjective(0); return true;
      }
      case 'gear':
        if (a.fixedGear) { this._event('info', 'Fixed landing gear · this aircraft keeps its wheels down'); return false; }
        if (p.onGround && p.gear) { this._event('info', 'Keep the gear down while on the ground.'); return false; }
        p.gear = !p.gear; this._event('control', `Landing gear ${p.gear ? 'down' : 'up'}`); return true;
      case 'flaps':
        if (a.hasFlaps === false) { this._event('info', 'This biplane has no landing flaps. Control the approach with throttle and pitch.'); return false; }
        p.flaps = !p.flaps; this._event('control', `Flaps ${p.flaps ? 'extended' : 'retracted'}`); return true;
      case 'brake': p.brake = !p.brake; this._event('control', `Wheel brake ${p.brake ? 'set' : 'released'}`); return true;
      case 'level': p.levelAssist = 4; this._event('control', 'Level recovery engaged'); return true;
      case 'target': this._chooseTarget(true); return true;
      case 'radar':
        if (!a.radar) return false;
        this.radarOn = !this.radarOn; this.player.radarOn = this.radarOn; this.lockProgress = 0; this._event('control', `Radar ${this.radarOn ? 'on' : 'off'}`); return true;
      case 'missile': return this._launchMissile(p, this.selectedTarget, false);
      case 'payload': return this._payload(p, false);
      case 'fire': return this._shoot(p, false);
      case 'countermeasure': {
        if (!a.radar || this.countermeasureCooldown > 0) return false;
        this.countermeasureCooldown = 6; this.countermeasureTime = 3.5; this.threat *= 0.2;
        for (const projectile of this.projectiles) {
          if ((projectile.owner === 'enemy' || projectile.targetPlayerId === p.id) && projectile.type === 'missile' && dist(projectile, p) < 2800) { projectile.life = 0; this._effect('flash', projectile.x, projectile.y, projectile.z, 55, 0.5); }
        }
        this._effect('flare', p.x, p.y, p.z, 60, 2.2); this._event('countermeasure', 'Countermeasures released · incoming track disrupted'); return true;
      }
      case 'hover':
        if (!a.vtol) return false;
        if (!p.hover && p.speed > 130) { this._event('info', 'Reduce speed below 130 m/s before selecting hover.'); return false; }
        p.hover = !p.hover;
        if (p.hover) {
          const frame = setAttitude(p, readAttitude(p));
          p.gear = true; p.throttle = 0.5; p.brake = false; p.verticalSpeed = 0; p.settlingSpeed = 0; p.hoverForward = p.speed;
          p.vx = frame.forward.x * p.speed; p.vz = frame.forward.z * p.speed;
        }
        this._event('control', p.hover ? 'Hover mode · half throttle holds height while upright' : 'Forward flight mode'); return true;
      case 'abort':
        if (this.mission.goal?.type === 'decision') {
          this.ending = 'abort'; this.endingText = 'The weapon remains aboard. You turn away from Vesper. The last page of the logbook records a choice to return.';
          this._finish(true, 'Mission aborted · weapon unreleased'); return true;
        }
        this._finish(false, 'Sortie ended. You can try again from the mission briefing.'); return true;
      default: return false;
    }
  }

  step(dt, input = {}) {
    if (this.status !== 'flying') return;
    // A gunner shares the host aircraft. Ordinary squadron members retain their
    // independently simulated player, but a crew guest never flies a second one.
    if (this.crew && !this.worldAuthority) return;
    dt = clamp(finite(dt, 1 / 60), 0, 0.05);
    this.time += dt;
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.missileCooldown = Math.max(0, finite(this.missileCooldown) - dt);
    this.payloadCooldown = Math.max(0, this.payloadCooldown - dt);
    this.countermeasureCooldown = Math.max(0, this.countermeasureCooldown - dt);
    this.countermeasureTime = Math.max(0, this.countermeasureTime - dt);
    this.player.gunHeat = Math.max(0, this.player.gunHeat - dt * 0.22);
    this.threat = Math.max(0, this.threat - dt * 0.12);
    const active = !this.participants.size || this.localParticipant?.alive;
    if (active) advancePlayer(this.player, input, dt, this.aircraft, this.mission, this.settings);
    if (this.player.crashed || this.player.health <= 0) {
      this.player.alive = false;
      if (!this.participants.size) {
        this._effect('explosion', this.player.x, this.player.y, this.player.z, 90, 4);
        this._finish(false, this.player.crashCause || 'The aircraft could not continue.'); return;
      }
    }
    this._advanceMultiplayer(dt);
    if (this.status !== 'flying') return;
    if (this.player.landings > this._lastLandingCount) { this._lastLandingCount = this.player.landings; this._event('landing', 'Safe touchdown'); }
    if (this.player.stalled && !this._warnedStall) { this._warnedStall = true; this._event('warning', 'Low airspeed · lower the nose and increase throttle'); }
    if (!this.player.stalled) this._warnedStall = false;
    if (input.fire && active && this.player.health > 0) this._shoot(this.player, false);
    if (active && this.player.health > 0) this._updateLock(dt);
    this.player.targetId = this.targetId; this.player.radarOn = this.radarOn;
    if (this.localParticipant && this.worldAuthority) { this.localParticipant.lockTargetId = this.targetId; this.localParticipant.lockProgress = this.lockProgress; }
    this._updateBombAim();
    if (this.worldAuthority) {
      this._advanceCrewWeapons(dt);
      this._advanceEnemies(dt); this._advanceHazards(dt); this._advanceProjectiles(dt); this._advanceParatroopers(dt); this._advanceWaypoints(); this._updateObjective(dt);
    } else {
      // Predicted shots are cosmetic; the host resolves shared hits and goals.
      this._advanceProjectiles(dt, true);
    }
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(e => e.age < e.life);
    this.projectiles = this.projectiles.filter(p => p.life > 0);
    this._updateThreat();
  }

  _advanceWaypoints() {
    const waypoint = this.mission.waypoints?.[this.waypointIndex];
    const pilots = this.participants.size ? [...this.participants.values()].filter(record => record.alive && record.connected).map(record => record.pose) : [this.player];
    if (waypoint && pilots.some(pilot => dist(pilot, waypoint) < waypoint.radius)) {
      this.waypointIndex++; this.score += 75; this._event('waypoint', waypoint.label || 'Waypoint reached');
    }
  }

  _updateLock(dt) {
    const previousTarget = this.selectedTarget;
    const terrainMasked = previousTarget && !lineOfSight(this.player, previousTarget, this.mission);
    for (const e of [...this.enemies, ...this._participantTargets(this.player.id)]) {
      const visible = lineOfSight(this.player, e, this.mission), distance = dist(this.player, e);
      e.radarVisible = this.radarOn && distance < this.aircraft.missileRange * 1.8 && visible;
      e.detected = !this.aircraft.radar || e.friendly || (distance < 2800 && visible) || e.radarVisible;
    }
    if (!living(this.selectedTarget) || this.selectedTarget?.detected === false) this._chooseTarget();
    const target = this.selectedTarget;
    if (!this.aircraft.radar || !this.radarOn || !target) {
      this.lockReason = terrainMasked ? 'Terrain masks the contact' : !this.radarOn && this.aircraft.radar ? 'Radar is off' : 'Select a visible contact';
      this.lockProgress = terrainMasked ? 0 : Math.max(0, this.lockProgress - dt * 2); return;
    }
    const p = this.player, d = dist(p, target), dir = direction(p);
    const dot = ((target.x - p.x) * dir.x + (target.y - p.y) * dir.y + (target.z - p.z) * dir.z) / Math.max(1, d);
    const visible = lineOfSight(p, target, this.mission);
    this.lockReason = !visible ? 'Terrain masks the contact' : d > this.aircraft.missileRange ? 'Outside game missile range' : dot < 0.8 ? 'Point the nose toward the contact' : 'Acquiring track';
    if (d <= this.aircraft.missileRange && dot > 0.8 && visible) this.lockProgress = Math.min(1, this.lockProgress + dt / this.aircraft.lockTime);
    else this.lockProgress = visible ? Math.max(0, this.lockProgress - dt * 1.1) : 0;
  }

  _shoot(p, remote = false) {
    const a = getAircraft(p.aircraft), gun = a.gun;
    const state = remote ? this._remoteState(p) : this;
    if (!living(p) || !gun || (state.gunCooldown || 0) > 0 || p.ammo <= 0 || p.gunHeat > 0.98) return false;
    state.gunCooldown = 1 / gun.rate;
    p.ammo--; p.gunHeat = finite(p.gunHeat) + 0.045;
    const dir = direction(p), cone = gun.cone * (this.settings.assist === 'expert' ? 0.65 : 1.3);
    let best = null, bestScore = Infinity;
    for (const target of this._hostiles(p.id)) {
      const distance = dist(p, target);
      if (distance > gun.range || distance < 2) continue;
      const alignment = ((target.x - p.x) * dir.x + (target.y - p.y) * dir.y + (target.z - p.z) * dir.z) / distance;
      const tolerance = cone + (target.type === 'balloon' ? 0.05 : target.type === 'bomber' ? 0.04 : 0);
      if (alignment > Math.cos(tolerance) && lineOfSight(p, target, this.mission)) {
        const score = (1 - alignment) * 15000 + distance;
        if (score < bestScore) { best = target; bestScore = score; }
      }
    }
    this.projectiles.push({ id: this._id('bullet'), type: 'bullet', x: p.x, y: p.y, z: p.z, vx: dir.x * 1000, vy: dir.y * 1000, vz: dir.z * 1000, life: 0.48, owner: remote ? p.id : 'player', cosmetic: true });
    if (best && this.worldAuthority) this._damage(best, gun.damage, 'gun', p.id);
    return true;
  }

  applyCrewInput(input, playerId = null, { reset = false } = {}) {
    if (!this.crew || !this.worldAuthority || this.status !== 'flying') return false;
    if (reset) { this._pendingCrewPress = null; this.crew.fire = false; }
    const clean = clampCrewInput(input);
    if (!clean) return false;
    if (reset) clean.fire = false;
    // A short click can arrive and be released between two fixed steps. Keep
    // one press, with its original station/aim, instead of losing that edge or
    // accumulating a firing queue. Pause/disconnect resets deliberately cancel it.
    if (clean.fire && !this.crew.fire && !this._pendingCrewPress) this._pendingCrewPress = { ...clean, at: this.time };
    Object.assign(this.crew, clean);
    this.crew.gunnerId = typeof playerId === 'string' ? playerId : this.crew.gunnerId;
    this._crewInputTime = this.time;
    return true;
  }

  _advanceCrewWeapons(dt) {
    if (!this.crew) return;
    for (const state of Object.values(this.crew.stations)) state.cooldown = Math.max(0, state.cooldown - dt);
    // Missing release packets, a paused tab or a disconnected gunner must stop
    // firing without depending on the next network message arriving.
    if (this.time - this._crewInputTime > GUNSHIP_INPUT_TIMEOUT) this.crew.fire = false;
    const press = this._pendingCrewPress; this._pendingCrewPress = null;
    const fired = press && this.time - press.at <= GUNSHIP_INPUT_TIMEOUT && this._shootCrew(press);
    if (this.crew.fire && !fired) this._shootCrew();
  }

  _shootCrew(input = this.crew) {
    if (!this.crew || !this.worldAuthority || this.status !== 'flying' || !living(this.player)) return false;
    const station = getGunshipStation(input.seat), state = this.crew.stations[station.id];
    if (!state || state.ammo <= 0 || state.cooldown > 1e-9) return false;
    const { origin, direction: aim } = gunshipStationPose(this.player, station.id, input);
    state.ammo--; state.cooldown = 1 / station.rate; state.shots++;
    const id = this._id('crew-shell');
    this.projectiles.push({ id, type: 'shell', seat: station.id, owner: 'crew',
      x: origin.x, y: origin.y, z: origin.z, vx: aim.x * station.speed, vy: aim.y * station.speed, vz: aim.z * station.speed,
      gravity: station.gravity, life: station.range / station.speed, damage: station.damage, radius: station.radius });
    this.crew.lastShot = { id, seat: station.id, at: this.time };
    this._effect('flash', origin.x, origin.y, origin.z, station.id === '105mm' ? 7 : station.id === '40mm' ? 4 : 1.8, 0.12);
    return true;
  }

  _impactCrewShell(projectile, point, directTarget = null) {
    projectile.life = 0;
    Object.assign(projectile, point);
    this._effect('explosion', point.x, point.y, point.z, projectile.radius * 0.7, projectile.seat === '105mm' ? 2.3 : 1.2);
    for (const target of this.targets) {
      if (!living(target) || target.narrative || ['dropzone', 'balloon'].includes(target.type)) continue;
      const distance = dist(point, target);
      if (target !== directTarget && distance > projectile.radius) continue;
      const damage = projectile.damage * (target === directTarget ? 1 : 1 - distance / projectile.radius * 0.7);
      this._damage(target, damage, projectile.seat);
      if (this.crew) this.crew.lastHit = { at: this.time, targetId: target.id, seat: projectile.seat };
    }
  }

  _launchMissile(p, target, remote = false) {
    const a = getAircraft(p.aircraft);
    if (!living(p) || !a.radar || p.missiles <= 0 || !living(target)) { if (!remote) this._event('info', p.missiles <= 0 ? 'No missiles remaining. Guns are still available.' : 'Select a target first.'); return false; }
    const state = remote ? this._remoteState(p) : this;
    if ((state.missileCooldown || 0) > 0) return false;
    if (remote && this.participants.size) {
      const record = this.participants.get(p.id);
      if (!record || record.lockTargetId !== target.id || record.lockProgress < 0.98 || p.radarOn === false) return false;
    }
    if (!remote && (this.lockProgress < 0.98 || !this.radarOn)) { this._event('info', 'Hold the target in front of the aircraft until LOCK is full.'); return false; }
    if (dist(p, target) > a.missileRange || !lineOfSight(p, target, this.mission)) return false;
    const owner = this.participants.size ? p.id : remote ? p.id : 'player';
    if (this.projectiles.some(projectile => projectile.type === 'missile' && projectile.owner === owner && projectile.targetId === target.id && projectile.life > 0)) {
      if (!remote) this._event('info', 'A missile is already tracking that contact. Select another target or wait for the result.');
      return false;
    }
    if (remote) {
      const d = dist(p, target), forward = direction(p);
      if (((target.x - p.x) * forward.x + (target.y - p.y) * forward.y + (target.z - p.z) * forward.z) / Math.max(1, d) < 0.8) return false;
    }
    state.missileCooldown = 0.7; p.missiles--;
    const dir = direction(p), speed = Math.max(460, p.speed + 360);
    this.projectiles.push({ id: this._id('missile'), type: 'missile', x: p.x, y: p.y - 2, z: p.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, speed, life: 24, owner, ownerLifeId: p.lifeId, targetId: target.id, targetPlayerId: this.participants.has(target.id) ? target.id : undefined, targetLifeId: target.lifeId, damage: a.missileDamage });
    if (!remote) this._event('missile', 'Missile away');
    return true;
  }

  _updateBombAim() {
    const p = this.player, velocity = direction(p), gravity = 28;
    let t = Math.sqrt(Math.max(0, p.y - Math.max(0, terrainHeight(p.x, p.z, this.mission))) * 2 / gravity);
    for (let i = 0; i < 3; i++) {
      const x = p.x + (p.vx || velocity.x * p.speed) * t, z = p.z + (p.vz || velocity.z * p.speed) * t;
      const height = Math.max(0, p.y - Math.max(0, terrainHeight(x, z, this.mission)));
      const vy = finite(p.verticalSpeed);
      t = (vy + Math.sqrt(vy * vy + 2 * gravity * height)) / gravity;
    }
    const x = p.x + (p.vx || velocity.x * p.speed) * t, z = p.z + (p.vz || velocity.z * p.speed) * t;
    this.bombAim = { x, y: Math.max(0, terrainHeight(x, z, this.mission)) + 2, z, timeToImpact: t };
  }

  _payload(p, remote = false) {
    if (!living(p)) return false;
    const payloadState = remote ? this._remoteState(p) : this;
    if (payloadState.payloadCooldown > 0) return false;
    const goal = this.mission.goal || {};
    if (goal.type === 'decision') {
      if (remote) return false;
      const zone = this.targets.find(t => t.id === goal.zoneId);
      if (this.waypointIndex < this.mission.waypoints.length || flatDist(p, zone) > goal.releaseRadius || p.y < goal.minimumAltitude) { this._event('info', 'Follow the high-altitude route to the final decision marker, or choose ABORT.'); return false; }
      if (p.bombs <= 0) return false;
      p.bombs = 0; this.ending = 'strike';
      this.endingText = 'The weapon leaves the aircraft. A distant white light fills the horizon. The radio falls silent. The last page of the logbook contains no victory tally.';
      this._effect('flash', zone.x, 350, zone.z, 2600, 7);
      this._finish(true, 'Last Light · the order was carried out'); return true;
    }
    if (getAircraft(p.aircraft).id === 'c47' || goal.type === 'drop') {
      const zone = this.targets.find(t => t.id === goal.zoneId);
      if (!zone || p.troopers <= 0) return false;
      const agl = p.y - Math.max(0, terrainHeight(p.x, p.z, this.mission));
      if (flatDist(p, zone) > goal.dropRadius || agl < goal.minimumAltitude || agl > goal.maximumAltitude || p.speed > goal.maximumSpeed || Math.abs(p.roll) > 0.32) {
        if (!remote) this._event('info', 'Drop window: inside the zone, 250–900 m above terrain, below 105 m/s, and wings level.'); return false;
      }
      payloadState.payloadCooldown = 2.5;
      const count = Math.min(12, p.troopers); p.troopers -= count; p.dropsRemaining = Math.max(0, finite(p.dropsRemaining) - 1);
      for (let i = 0; i < count; i++) this.paratroopers.push({ id: this._id('trooper'), x: p.x + (i % 3 - 1) * 25, y: p.y - 8 - (i % 4) * 5, z: p.z - Math.floor(i / 3) * 30, vx: Math.sin(p.heading) * p.speed * 0.28, vz: Math.cos(p.heading) * p.speed * 0.28, landed: false, safe: false, life: 100 });
      this._event('drop', `${count} parachutes away · keep the aircraft safe`); return true;
    }
    const a = getAircraft(p.aircraft);
    if (p.bombs <= 0) { if (!remote) this._event('info', 'No bombs remaining. Use available guns or missiles on the objectives.'); return false; }
    p.bombs--; payloadState.payloadCooldown = 0.45;
    const dir = direction(p);
    this.projectiles.push({ id: this._id('bomb'), type: 'bomb', x: p.x, y: p.y - 4, z: p.z, vx: p.vx || dir.x * p.speed, vy: finite(p.verticalSpeed), vz: p.vz || dir.z * p.speed, life: 40, owner: remote ? p.id : 'player', damage: a.bombDamage, radius: a.bombRadius });
    this._event('payload', 'Payload released'); return true;
  }

  _damage(target, amount, weapon, attackerId = null) {
    const participant = this.participants.get(target?.id);
    if (participant) return this._damageParticipant(participant, amount, attackerId, weapon);
    if (!living(target)) return;
    target.health = Math.max(0, target.health - amount);
    if (target.health > 0) { this._effect('impact', target.x, target.y, target.z, 15, 0.3); return; }
    target.alive = false; target.active = false;
    // Squadron AIR kills count hostile aircraft, while ground objectives keep
    // contributing the existing shared mission points. A defeated entity is
    // no longer living, so repeated damage or an old projectile cannot score it.
    const attacker = this.participants.get(attackerId === 'player' ? this.player.id : attackerId);
    if (attacker && this.enemies.includes(target) && !target.friendly && !target.escaped) attacker.kills++;
    this.score += target.friendly ? -150 : target.type === 'bomber' ? 200 : 125;
    this._effect('explosion', target.x, target.y, target.z, target.type === 'balloon' ? 130 : 80, 2.1);
    this._event('destroyed', `${target.label || 'Target'} ${target.friendly ? 'lost' : 'neutralized'}`);
    if (target.id === this.targetId) this._chooseTarget();
  }

  _advanceEnemies(dt) {
    for (const state of this.remoteWeapons.values()) {
      state.gunCooldown = Math.max(0, state.gunCooldown - dt); state.missileCooldown = Math.max(0, state.missileCooldown - dt);
      state.payloadCooldown = Math.max(0, state.payloadCooldown - dt);
      state.countermeasureCooldown = Math.max(0, finite(state.countermeasureCooldown) - dt);
      state.gunHeat = Math.max(0, state.gunHeat - dt * 0.22);
    }
    const pilots = this.participants.size ? [...this.participants.values()].filter(record => record.alive && record.connected).map(record => record.pose)
      : [this.player, ...this.remotePlayers].filter(pilot => living(pilot));
    for (const e of this.enemies) {
      if (!living(e)) continue;
      const a = getAircraft(e.aircraft); e.age += dt;
      if (e.friendly) {
        e.x += Math.sin(e.heading) * e.speed * dt; e.z += Math.cos(e.heading) * e.speed * dt;
        e.y = Math.max(e.y, terrainHeight(e.x, e.z, this.mission) + 180); continue;
      }
      let victim = pilots[0];
      const escort = this.enemies.find(o => o.friendly && living(o));
      if (escort && e.id.endsWith('2')) victim = escort;
      for (const remote of pilots) if (!victim || flatDist(e, remote) + 300 < flatDist(e, victim)) victim = remote;
      if (!victim) {
        e.x += Math.sin(e.heading) * e.speed * dt; e.z += Math.cos(e.heading) * e.speed * dt;
        e.y = Math.max(e.y, terrainHeight(e.x, e.z, this.mission) + 180); continue;
      }
      if (e.type === 'bomber') {
        e.heading = mix(e.heading, Math.PI, dt * 0.2); e.pitch = 0;
      } else {
        // Propeller fighters occasionally extend straight before turning back.
        // This creates readable firing openings instead of endless matched circles.
        const extend = a.maxSpeed < 180 && flatDist(e, victim) < 1600 && e.age % 18 < 3.2;
        const desired = extend ? e.heading : Math.atan2(victim.x - e.x, victim.z - e.z);
        const delta = angle(desired - e.heading), turning = clamp(delta, -a.turnRate * 0.72 * dt, a.turnRate * 0.72 * dt);
        e.heading = angle(e.heading + turning); e.roll = mix(e.roll, clamp(delta, -1, 1) * 0.75, dt * 3);
        const desiredPitch = clamp(Math.atan2(victim.y - e.y, Math.max(100, flatDist(e, victim))), -0.24, 0.24);
        e.pitch = mix(e.pitch, desiredPitch, dt * 1.2);
      }
      const d = direction(e); e.vx = d.x * e.speed; e.vy = d.y * e.speed; e.vz = d.z * e.speed;
      e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
      e.y = Math.max(e.y, terrainHeight(e.x, e.z, this.mission) + 180);
      const distance = dist(e, victim), dot = ((victim.x - e.x) * d.x + (victim.y - e.y) * d.y + (victim.z - e.z) * d.z) / Math.max(1, distance);
      e.fireTimer -= dt; e.missileTimer -= dt;
      if (e.fireTimer <= 0 && distance < 1700 && dot > 0.86 && lineOfSight(e, victim, this.mission)) {
        e.fireTimer = this.settings.assist === 'expert' ? 1.1 : 1.9;
        const aim = { x: (victim.x - e.x) / distance, y: (victim.y - e.y) / distance, z: (victim.z - e.z) / distance };
        this.projectiles.push({ id: this._id('enemy-bullet'), type: 'bullet', x: e.x, y: e.y, z: e.z, vx: aim.x * 850, vy: aim.y * 850, vz: aim.z * 850, life: 2.7, owner: 'enemy', targetId: victim === escort ? victim.id : 'player', targetPlayerId: victim.id, targetLifeId: victim.lifeId, damage: this.settings.assist === 'expert' ? 9 : 5 });
        this.threat = Math.max(this.threat, 0.35);
      }
      if (e.missiles && e.missileTimer <= 0 && distance > 1200 && distance < 6000 && dot > 0.75 && lineOfSight(e, victim, this.mission)) {
        e.missileTimer = 17;
        this._enemyMissile(e, victim); this._event('warning', 'Missile warning · turn and use countermeasures');
      }
      if (this.mission.goal?.type === 'intercept' && e.type === 'bomber' && e.z < this.mission.goal.defenseLine) {
        e.escaped = true; e.alive = false; e.health = 0; this.defense -= 50; this._event('warning', 'A bomber reached the defended area');
      }
    }
  }

  _enemyMissile(origin, victim) {
    const distance = Math.max(1, dist(origin, victim)), speed = 430;
    this.projectiles.push({ id: this._id('enemy-missile'), type: 'missile', x: origin.x, y: origin.y + 8, z: origin.z, vx: (victim.x - origin.x) / distance * speed, vy: (victim.y - origin.y) / distance * speed, vz: (victim.z - origin.z) / distance * speed, speed, life: 18, owner: 'enemy', targetId: 'player', targetPlayerId: victim.id, targetLifeId: victim.lifeId, damage: this.settings.assist === 'expert' ? 45 : 25 });
    this.threat = 1;
  }

  _advanceHazards(dt) {
    const pilots = this.participants.size ? [...this.participants.values()].filter(record => record.alive && record.connected).map(record => record.pose) : [this.player].filter(living);
    for (const target of this.targets) {
      if (!target.hazard || !living(target)) continue;
      target.fireTimer -= dt;
      const p = pilots.filter(pilot => !pilot.onGround).sort((a, b) => flatDist(a, target) - flatDist(b, target))[0];
      if (!p) continue;
      const distance = flatDist(p, target), range = target.radius || 1200;
      if (distance > range) continue;
      const a = getAircraft(p.aircraft), exposure = a.stealth ? (p === this.player ? this.radarOn : p.radarOn) ? 1 : 0.3 : 1;
      this.threat = Math.max(this.threat, (1 - distance / range) * exposure * 0.7);
      if (target.fireTimer <= 0) {
        target.fireTimer = target.type === 'sam' ? 13 / exposure : 3.3;
        if (target.type === 'sam' && lineOfSight({ ...target, y: target.y + 20 }, p, this.mission)) {
          this._enemyMissile(target, p); this._event('warning', 'SAM warning · terrain and countermeasures can break the track');
        } else if (target.type === 'flak') {
          const burst = { x: p.x + (this._random() - 0.5) * 220, y: p.y + (this._random() - 0.5) * 180, z: p.z + (this._random() - 0.5) * 220 };
          this._effect('smoke', burst.x, burst.y, burst.z, 90, 3);
          if (dist(p, burst) < 90) {
            const amount = this.settings.assist === 'expert' ? 11 : 5, participant = this.participants.get(p.id);
            if (participant) this._damageParticipant(participant, amount, null, 'Flak');
            else p.health = Math.max(1, p.health - amount);
          }
        }
      }
    }
  }

  _advanceProjectiles(dt, cosmeticWorld = false) {
    for (const projectile of this.projectiles) {
      if (projectile.life <= 0) continue;
      const before = { x: projectile.x, y: projectile.y, z: projectile.z };
      projectile.life -= dt;
      if (projectile.life <= 0) continue;
      let target;
      if (projectile.type === 'missile') {
        if (projectile.targetPlayerId) {
          const participant = this.participants.get(projectile.targetPlayerId);
          target = participant ? participant.alive && (projectile.targetLifeId === undefined || projectile.targetLifeId === participant.lifeId) ? participant.pose : null
            : projectile.targetPlayerId === this.player.id ? this.player : this.remotePlayers.find(p => p.id === projectile.targetPlayerId);
        } else if (projectile.owner === 'enemy') target = this.player;
        else target = [...this.enemies, ...this.targets].find(t => t.id === projectile.targetId && living(t));
        if (!living(target)) target = null;
        if (target === this.player && this.countermeasureTime > 0) { projectile.life = 0; continue; }
        // A seeker does not steer toward a target through a mountain. The
        // missile carries its existing momentum, then strikes the actual wall.
        if (target && !lineOfSight(projectile, target, this.mission, 3)) projectile.seekerLost = true;
        if (target && !projectile.seekerLost) {
          const distance = Math.max(1, dist(projectile, target)), steer = projectile.owner === 'enemy' ? 1.9 : 4.8, speed = projectile.speed || 650;
          projectile.vx = mix(projectile.vx, (target.x - projectile.x) / distance * speed, dt * steer);
          projectile.vy = mix(projectile.vy, (target.y - projectile.y) / distance * speed, dt * steer);
          projectile.vz = mix(projectile.vz, (target.z - projectile.z) / distance * speed, dt * steer);
        }
      }
      if (projectile.type === 'bomb') projectile.vy -= 28 * dt;
      if (projectile.type === 'shell') projectile.vy -= finite(projectile.gravity, 9) * dt;
      projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.z += projectile.vz * dt;
      if (cosmeticWorld) continue;
      const terrainHit = segmentTerrainTime(before, projectile, this.mission, 3, true);
      if (projectile.type === 'shell') {
        let fraction = terrainHit, direct = null;
        for (const candidate of this.targets) {
          if (!living(candidate) || candidate.narrative || ['dropzone', 'balloon'].includes(candidate.type)) continue;
          const hit = segmentSphereTime(before, projectile, candidate, finite(candidate.hitRadius, candidate.type === 'depot' ? 32 : 18));
          if (hit !== null && (fraction === null || hit < fraction)) { fraction = hit; direct = candidate; }
        }
        if (fraction !== null) this._impactCrewShell(projectile, {
          x: mix(before.x, projectile.x, fraction), y: mix(before.y, projectile.y, fraction), z: mix(before.z, projectile.z, fraction),
        }, direct);
        continue;
      }
      let victim = null;
      if (projectile.owner === 'enemy') {
        victim = projectile.targetId !== 'player' ? this.enemies.find(e => e.id === projectile.targetId)
          : target || (projectile.targetPlayerId && projectile.targetPlayerId !== this.player.id ? this.remotePlayers.find(p => p.id === projectile.targetPlayerId) : this.player);
      } else if (projectile.type === 'missile') victim = target;
      if (victim && projectile.targetLifeId !== undefined && victim.lifeId !== projectile.targetLifeId) victim = null;
      const hit = living(victim) ? segmentSphereTime(before, projectile, victim, projectile.type === 'missile' ? 65 : 38) : null;
      // Terrain is ordered against the swept proximity hit. End-point checks
      // alone let a fast missile cross a wall and damage the pilot behind it.
      if (hit !== null && (terrainHit === null || hit < terrainHit)) {
        projectile.life = 0;
        const participant = this.participants.get(victim.id);
        if (participant) this._damageParticipant(participant, projectile.damage, projectile.owner === 'enemy' ? null : projectile.owner, projectile.type);
        else if (victim === this.player) {
          this.player.health = Math.max(0, this.player.health - projectile.damage);
          this._effect('impact', victim.x, victim.y, victim.z, 40, 0.4); this._event('hit', 'Aircraft hit');
        } else if (victim.friendly || projectile.owner !== 'enemy') this._damage(victim, projectile.damage, projectile.type, projectile.owner);
        else if (victim.id) this.remoteDamage[victim.id] = finite(this.remoteDamage[victim.id]) + projectile.damage;
        if (projectile.type === 'missile') this._effect('explosion', victim.x, victim.y, victim.z, 65, 2.8);
      } else if (terrainHit !== null) {
        projectile.x = mix(before.x, projectile.x, terrainHit); projectile.y = mix(before.y, projectile.y, terrainHit); projectile.z = mix(before.z, projectile.z, terrainHit);
        projectile.life = 0;
        if (projectile.type === 'bomb') {
          this._effect('explosion', projectile.x, projectile.y + 5, projectile.z, projectile.radius * 0.45, 4.2);
          const blast = { x: projectile.x, y: projectile.y + 6, z: projectile.z };
          for (const t of [...this.targets, ...this._participantTargets(projectile.owner === 'player' ? this.player.id : projectile.owner)]) {
            if (!living(t) || t.narrative || t.type === 'dropzone' || t.type === 'balloon') continue;
            const distance = dist(blast, t);
            if (distance < projectile.radius && lineOfSight(blast, t, this.mission, 0))
              this._damage(t, projectile.damage * (0.5 + 0.5 * (1 - distance / projectile.radius)), 'bomb', projectile.owner === 'player' ? this.player.id : projectile.owner);
          }
        } else if (projectile.type === 'missile') {
          this._effect('explosion', projectile.x, projectile.y + 3, projectile.z, 70, 3.5);
          this._event('terrain', 'Missile intercepted by terrain');
        } else this._effect('impact', projectile.x, projectile.y, projectile.z, 10, 0.35);
      }
    }
  }

  _advanceParatroopers(dt) {
    const zone = this.targets.find(t => t.id === this.mission.goal?.zoneId), wind = this.mission.weather?.wind || {};
    for (const trooper of this.paratroopers) {
      if (trooper.landed) continue;
      trooper.life -= dt; trooper.vx *= Math.max(0, 1 - dt * 0.45); trooper.vz *= Math.max(0, 1 - dt * 0.45);
      trooper.x += (trooper.vx + finite(wind.x) * 0.65) * dt;
      trooper.z += (trooper.vz + finite(wind.z) * 0.65) * dt; trooper.y -= 23 * dt;
      const ground = Math.max(0, terrainHeight(trooper.x, trooper.z, this.mission));
      if (trooper.y <= ground + 2) {
        trooper.y = ground + 2; trooper.landed = true;
        trooper.safe = !!zone && flatDist(trooper, zone) < (zone.radius || this.mission.goal.dropRadius) && terrainHeight(trooper.x, trooper.z, this.mission) >= 0;
        if (trooper.safe) this.dropsLanded++;
      }
    }
  }

  _missionPilots() { return this.participants.size ? [...this.participants.values()].filter(record => record.alive && record.connected).map(record => record.pose) : [this.player].filter(living); }
  _missionPilot() { return this._missionPilots().find(pilot => this.mission.goal?.type === 'drop' && pilot.aircraft === 'c47') || this._missionPilots()[0] || this.player; }

  _navigationHint(point) {
    const p = this._missionPilot(), distance = flatDist(p, point), delta = angle(Math.atan2(point.x - p.x, point.z - p.z) - p.heading);
    const turn = Math.abs(delta) > 0.2 ? `Bank ${delta > 0 ? 'left' : 'right'} toward the marker.` : 'Keep the marker ahead.';
    const altitude = point.y - p.y;
    return `${turn} ${Math.abs(altitude) > 100 ? altitude > 0 ? 'Raise the nose gently.' : 'Lower the nose gently.' : 'Hold your altitude.'} ${(distance / 1000).toFixed(1)} km to go.`;
  }

  _landingHint(runway) {
    if (!runway) return 'Find a clear runway and land with the gear down.';
    const p = this._missionPilot();
    if (p.onGround) return p.lastLanding?.runwayIndex === this.mission.goal.destinationRunway ? 'Throttle idle and set the brake to finish the landing.' : 'This is not the destination. Take off and follow the destination marker.';
    if (getAircraft(p.aircraft).vtol) return `Return to ${runway.label} · ${(flatDist(p, runway) / 1000).toFixed(1)} km. ${p.hover ? 'Half throttle holds height while upright; use less to descend. Pitch and roll tilt the aircraft to move across the deck.' : 'Reduce speed below 130 m/s, select HOVER, then settle gently onto the deck.'}`;
    if (!p.gear) return 'Extend the landing gear before your approach.';
    if (p.speed > getAircraft(p.aircraft).stallSpeed * 1.85) return getAircraft(p.aircraft).hasFlaps === false ? 'Reduce throttle for landing. This biplane has fixed gear and no flaps.' : 'Reduce throttle for landing. Flaps lower the stall speed and add drag.';
    return `Line up with ${runway.label} · ${(flatDist(p, runway) / 1000).toFixed(1)} km. Aim for the near end, descend gently, and keep wings level. Brake after touchdown.`;
  }

  _updateObjective(dt) {
    if (this.status !== 'flying') return;
    const m = this.mission, g = m.goal || {}, p = this._missionPilot();
    this.navigationTarget = null;
    if (g.protectIds?.some(id => !living(this.targets.find(t => t.id === id)))) { this._finish(false, 'A protected friendly unit was lost. Check the target markings before firing.'); return; }
    if (this.multiplayer?.mode === 'dogfight') {
      this.objective = `Dogfight · ${Math.ceil(this.round.remaining / 60)} min remaining`;
      this.hint = this.localParticipant?.alive ? 'Select a contact, build a lock or close to gun range. Mountains block radar and intercept missiles.' : this.canRespawn ? 'A new aircraft is ready. Respawn or keep spectating.' : 'Spectating while your next aircraft is prepared.';
      this.progress = this.round.duration ? this.round.elapsed / this.round.duration : 0; return;
    }
    if (m.kind === 'free') { this.objective = 'Free flight · explore at your own pace'; this.hint = p.onGround ? p.brake ? 'Release the brake and raise throttle to take off.' : 'Build airspeed, then raise the nose gently.' : p.stalled ? 'Lower the nose and add throttle to recover airspeed.' : 'Explore the terrain. Pause to change aircraft or return to the hangar.'; this.progress = 0; return; }
    if (!p.engine) { this.phase = 'startup'; this.objective = `Start the engine · ${p.startupStep}/4`; this.hint = ['Open the fuel valve. Tap START to begin the simplified checklist.', 'Switch on the magnetos. Tap START again.', 'Prime the engine. Tap START again.', 'Turn the propeller. Tap START once more.'][Math.min(3, p.startupStep)]; this.progress = p.startupStep * 0.025; return; }
    if (!p.everAirborne) {
      this.phase = 'takeoff'; this.objective = 'Take off from the runway'; this.progress = Math.max(this.progress, 0.1);
      this.hint = p.brake ? 'Release the wheel brake, then increase throttle.' : p.throttle < 0.65 ? 'Raise throttle above 65%. Keep the nose along the runway.' : p.speed < this.aircraft.stallSpeed * 1.2 ? 'Building airspeed. Keep straight; the assisted plane will lift when ready.' : 'Raise the nose gently. Retract the gear once safely airborne.'; return;
    }
    if (p.stalled) this.hint = 'STALL · lower the nose and increase throttle. LEVEL can help restore the attitude.';
    const deadAir = this.enemies.filter(e => !e.friendly && e.health <= 0 && !e.escaped).length;
    const resolvedAir = this.enemies.filter(e => !e.friendly && (e.health <= 0 || e.escaped)).length;
    const targetList = g.targetIds ? this.targets.filter(t => g.targetIds.includes(t.id)) : this.targets.filter(t => !t.friendly && !t.hazard && !t.narrative);
    const deadGround = targetList.filter(t => t.health <= 0).length;
    let goalMet = false;
    if (g.type === 'gunship') {
      this.phase = 'combat';
      this.objective = `Nightwatch Basin · ${deadGround}/${g.count} ground targets`;
      this.progress = Math.min(1, deadGround / g.count) * 0.85;
      this.navigationTarget = { x: m.orbit.x, y: m.orbit.altitude, z: m.orbit.z, label: 'BASIN · keep to your left' };
      if (!p.stalled) this.hint = 'Pilot: keep the basin off the left wing. Gunner: switch stations, aim and fire at the marked ground targets.';
      if (deadGround >= g.count) {
        this.phase = 'egress'; this.egressTime += dt;
        this.objective = 'Ground objectives cleared · fly the crew home';
        this.hint = 'Keep the aircraft clear of the terrain while the crew finishes the sortie.';
        this.progress = 0.85 + Math.min(1, this.egressTime / (g.egress || 5)) * 0.15;
        if (this.egressTime >= (g.egress || 5)) this._finish(true, 'Nightwatch complete · all eight ground objectives cleared');
      } else if (this.crew && Object.values(this.crew.stations).every(state => state.ammo <= 0)
        && !this.projectiles.some(projectile => projectile.type === 'shell' && projectile.life > 0)) {
        this._finish(false, 'All cannon ammunition expended before the ground objectives were cleared.');
      }
      return;
    }
    if (g.type === 'land') {
      if (this.waypointIndex < (m.waypoints || []).length) {
        this.phase = 'route'; const waypoint = m.waypoints[this.waypointIndex];
        this.objective = `Follow the flight route · ${this.waypointIndex}/${m.waypoints.length} rings`;
        this.hint = this._navigationHint(waypoint); this.progress = 0.15 + this.waypointIndex / m.waypoints.length * 0.55;
      } else {
        this.phase = 'landing'; const runway = m.runways[g.destinationRunway];
        this.navigationTarget = { x: runway.x, y: runway.y + 35, z: runway.z, label: `LAND · ${runway.label}` };
        this.objective = `Land at ${runway.label}, then slow to a stop`; this.hint = this._landingHint(runway); this.progress = 0.78;
        if (this._missionPilots().some(pilot => pilot.onGround && pilot.lastLanding?.runwayIndex === g.destinationRunway && pilot.speed < (g.stopSpeed || 12))) this._finish(true, 'Flight complete · safe arrival');
      }
      return;
    }
    if (g.type === 'escort') {
      const escort = this.enemies.find(e => e.id === g.protectId);
      if (!living(escort)) { this._finish(false, 'The reconnaissance aircraft was lost. Stay close enough to protect it.'); return; }
      const close = this._missionPilots().some(pilot => flatDist(pilot, escort) < g.escortRadius);
      this.navigationTarget = { x: escort.x, y: escort.y, z: escort.z, label: 'RECON · protect the crew' };
      if (close) this.escortTime += dt;
      this.phase = 'escort'; this.progress = this.escortTime / g.duration;
      this.objective = `Protect the reconnaissance crew · ${Math.min(100, Math.floor(this.progress * 100))}% home`;
      this.hint = close ? `Stay within ${(g.escortRadius / 1000).toFixed(1)} km of the blue aircraft. Crew integrity ${Math.ceil(escort.health / escort.initialHealth * 100)}%.` : 'Return to the blue reconnaissance aircraft. Escort progress pauses while you are too far away.';
      if (this.escortTime >= g.duration) this._finish(true, 'The reconnaissance crew reached friendly airspace'); return;
    }
    if (g.type === 'drop') {
      this.phase = 'drop'; this.progress = Math.max(this.waypointIndex / Math.max(1, m.waypoints.length) * 0.35, this.dropsLanded / g.count);
      const zone = this.targets.find(t => t.id === g.zoneId), distance = flatDist(p, zone);
      if (this.waypointIndex >= m.waypoints.length) this.navigationTarget = { x: zone.x, y: zone.y + 550, z: zone.z, label: 'PARATROOPER DROP ZONE' };
      this.objective = `Deliver paratroopers safely · ${this.dropsLanded}/${g.count} landed`;
      this.hint = this.paratroopers.some(t => !t.landed) ? 'Parachutes descending. Keep your aircraft safe while they reach the ground.' : distance > g.dropRadius ? `Fly to the blue drop zone · ${(distance / 1000).toFixed(1)} km. Stay 250–900 m above terrain.` : 'Wings level, speed below 105 m/s, altitude 250–900 m above terrain. Press PAYLOAD to release the paratroopers.';
      if (this.dropsLanded >= g.count) this._finish(true, 'The paratroopers landed safely in the zone');
      else if (!this._missionPilots().some(pilot => pilot.troopers > 0) && ![...this.participants.values()].some(record => record.aircraft === 'c47' && record.livesRemaining > 1) && this.paratroopers.length && this.paratroopers.every(t => t.landed)) this._finish(false, 'Too few parachutes reached the zone. Try releasing closer to its center.');
      return;
    }
    if (g.type === 'decision') {
      const zone = this.targets.find(t => t.id === g.zoneId);
      if (this.waypointIndex < m.waypoints.length) {
        this.phase = 'route'; this.objective = 'Follow the high-altitude approach'; this.hint = `${this._navigationHint(m.waypoints[this.waypointIndex])} ABORT remains available.`;
        this.progress = 0.15 + this.waypointIndex / m.waypoints.length * 0.45;
      } else {
        this.phase = 'decision'; this.objective = 'Final decision · release the weapon or abort';
        this.navigationTarget = { x: zone.x, y: 3900, z: zone.z, label: 'VESPER · final decision' };
        this.hint = flatDist(p, zone) <= g.releaseRadius && p.y >= g.minimumAltitude ? 'Decision window open. PAYLOAD carries out the fictional strike. ABORT returns with the weapon aboard.' : `Continue toward Vesper above 2,600 m · ${(flatDist(p, zone) / 1000).toFixed(1)} km. ABORT ends the mission with the weapon unreleased.`;
        this.progress = 0.8;
      }
      return;
    }
    if (g.type === 'carrier' && deadAir >= g.count) {
      const runway = m.runways[g.destinationRunway];
      this.navigationTarget = { x: runway.x, y: runway.y + 30, z: runway.z, label: 'CARRIER · hover recovery' };
      this.phase = 'landing'; this.progress = 0.8; this.objective = 'Return to the carrier and land in hover'; this.hint = this._landingHint(m.runways[g.destinationRunway]);
      if (this._missionPilots().some(pilot => pilot.onGround && pilot.lastLanding?.runwayIndex === g.destinationRunway && pilot.speed < g.stopSpeed)) this._finish(true, 'Task force protected · safe carrier recovery'); return;
    }
    this.phase = 'combat';
    if (g.type === 'targets') { this.objective = `Complete the strike · ${deadGround}/${g.count} objectives`; this.progress = deadGround / g.count * 0.85; goalMet = deadGround >= g.count; }
    else if (g.type === 'mixed') { this.objective = `Clear the sector · aircraft ${deadAir}/${g.air} · ground ${deadGround}/${g.ground}`; this.progress = (Math.min(deadAir, g.air) + Math.min(deadGround, g.ground)) / (g.air + g.ground) * 0.85; goalMet = deadAir >= g.air && deadGround >= g.ground; }
    else if (g.type === 'intercept') {
      this.objective = `Stop the raid · ${resolvedAir}/${g.count} resolved · defense ${this.defense}%`; this.progress = resolvedAir / g.count * 0.85; goalMet = resolvedAir >= g.count;
      if (this.defense <= 0) { this._finish(false, 'The bomber formation reached the defended area. Prioritize the bombers.'); return; }
    } else { this.objective = `Defeat the attackers · ${deadAir}/${g.count || 1}`; this.progress = deadAir / (g.count || 1) * 0.85; goalMet = deadAir >= (g.count || Infinity); }
    const selected = this.selectedTarget;
    if (!p.stalled) {
      if (selected && this.aircraft.radar && p.missiles > 0) this.hint = !this.radarOn ? 'Radar is off. Turn it on to locate contacts and acquire a missile lock.' : this.lockProgress >= 0.98 ? 'LOCK complete. Fire a missile or close to gun range.' : `${this.lockReason || 'Point the nose toward the selected target'}. ${(dist(p, selected) / 1000).toFixed(1)} km to selected target.`;
      else if (selected && this.aircraft.gun) {
        const targetAngle = Math.abs(angle(Math.atan2(selected.x - p.x, selected.z - p.z) - p.heading));
        this.hint = dist(p, selected) > this.aircraft.gun.range ? `Close to ${(this.aircraft.gun.range / 1000).toFixed(1)} km gun range. Keep the selected target near the nose.` : targetAngle > 0.5 && dist(p, selected) < 950 ? 'The target is inside your turn. Reduce throttle toward 55% and bank to bring the nose around.' : 'Hold FIRE with the selected target close to the nose. Short bursts keep the guns cool.';
      }
      else this.hint = 'Place the predicted impact marker over a marked target, then press PAYLOAD. Leave room to recover.';
    }
    if (goalMet) {
      this.phase = 'egress'; this.egressTime += dt; this.objective = 'Objectives complete · fly clear'; this.hint = 'Hold a safe altitude and course while your flight clears the area.';
      this.progress = 0.85 + Math.min(1, this.egressTime / (g.egress || 5)) * 0.15;
      if (this.egressTime >= (g.egress || 5)) this._finish(true, 'Sortie complete · objectives achieved');
    }
  }

  _finish(success, message) {
    this.status = success ? 'success' : 'failed'; this.phase = 'complete'; this.objective = message;
    this.hint = success ? this.crew ? 'Crew sortie complete. Return to the hangar to fly again.' : 'Review the logbook, then continue to the next chapter.' : 'Retry the sortie, or adjust flight assistance in settings.';
    if (this.crew) { this.crew.fire = false; this._pendingCrewPress = null; }
    if (success) { this.progress = 1; this.score += Math.max(100, Math.round(this.player.health / this.aircraft.health * 250)); }
    this._event(success ? 'success' : 'failed', message);
  }

  _remoteState(p) {
    const id = p.id || p.playerId || 'teammate';
    if (!this.remoteWeapons.has(id)) {
      const a = getAircraft(p.aircraft);
      this.remoteWeapons.set(id, { ammo: a.gun?.ammo || 0, missiles: a.missiles, bombs: a.bombs, troopers: a.id === 'c47' ? 24 : 0, dropsRemaining: 2, gunHeat: 0, gunCooldown: 0, missileCooldown: 0, payloadCooldown: 0 });
    }
    return this.remoteWeapons.get(id);
  }

  applyRemoteAction(action, pose, metadata = {}) {
    if (this.crew || !this.worldAuthority || this.status !== 'flying' || !pose || ![pose.x, pose.y, pose.z, pose.heading].every(Number.isFinite)) return false;
    const name = typeof action === 'string' ? action : action?.name || action?.action || action?.type;
    let p;
    if (this.participants.size) {
      const record = this.participants.get(pose.id);
      const lifeId = metadata.lifeId ?? action?.lifeId ?? pose.lifeId;
      const runId = metadata.runId ?? action?.runId;
      const actionId = metadata.actionId ?? action?.actionId;
      if (!record || record.id === this.player.id || lifeId !== record.lifeId || !record.connected
        || runId && runId !== this.multiplayer.runId) return false;
      if (actionId && this._seenActions.has(actionId)) return false;
      if (actionId) { this._seenActions.add(actionId); if (this._seenActions.size > 2000) this._seenActions.delete(this._seenActions.values().next().value); }
      if (name === 'respawn') return this.requestRespawn(record.id);
      if (!record.alive) return false;
      this.setRemotePlayers([pose]);
      if (!record.alive) return name === 'crash';
      p = record.pose;
      if (name === 'crash') return this._validatedCrash(p, true) ? this._killParticipant(record, null, 'Terrain collision') : false;
    } else p = { ...pose, aircraft: this.mission.aircraft, health: finite(pose.health, getAircraft(this.mission.aircraft).health), alive: pose.alive !== false };
    const state = this._remoteState(p);
    setAttitude(p, orientationOf(p));
    Object.assign(p, { ammo: state.ammo, missiles: state.missiles, bombs: state.bombs, troopers: state.troopers, dropsRemaining: state.dropsRemaining, gunHeat: state.gunHeat });
    const chosen = this._hostiles(p.id).find(t => t.id === (action?.targetId || p.targetId)) || (this.participants.size ? null : this.selectedTarget);
    let result = false;
    if (name === 'fire') result = this._shoot(p, true);
    else if (name === 'missile') result = this._launchMissile(p, chosen, true);
    else if (name === 'payload') result = this._payload(p, true);
    else if (name === 'countermeasure') {
      if (!getAircraft(p.aircraft).radar || state.countermeasureCooldown > 0) return false;
      state.countermeasureCooldown = 6;
      for (const projectile of this.projectiles) if (projectile.type === 'missile' && projectile.targetPlayerId === p.id && dist(projectile, p) < 2800) projectile.life = 0;
      this._effect('flare', p.x, p.y, p.z, 60, 2.2); result = true;
    }
    for (const key of ['ammo', 'missiles', 'bombs', 'troopers', 'dropsRemaining', 'gunHeat']) state[key] = p[key];
    return result;
  }

  getSnapshot() {
    const weaponStores = {};
    for (const [id, stores] of this.remoteWeapons) weaponStores[id] = { ammo: stores.ammo, missiles: stores.missiles, bombs: stores.bombs, troopers: stores.troopers, dropsRemaining: stores.dropsRemaining };
    return copy({ version: this.participants.size ? 2 : 1, runId: this.multiplayer?.runId, missionId: this.mission.id, time: this.time, enemies: this.enemies, targets: this.targets, projectiles: this.projectiles.slice(-180), effects: this.effects.slice(-60), paratroopers: this.paratroopers, waypointIndex: this.waypointIndex, navigationTarget: this.navigationTarget, status: this.status, phase: this.phase, objective: this.objective, hint: this.hint, progress: this.progress, score: this.score, defense: this.defense, escortTime: this.escortTime, dropsLanded: this.dropsLanded, ending: this.ending, endingText: this.endingText, events: this.events.slice(-12), remoteDamage: this.remoteDamage, weaponStores,
      ...(this.participants.size ? { participants: [...this.participants.values()].map(record => ({ ...record, pose: { ...record.pose }, stores: { ammo: record.pose.ammo, missiles: record.pose.missiles, bombs: record.pose.bombs, troopers: record.pose.troopers, dropsRemaining: record.pose.dropsRemaining } })), round: this.round } : {}),
      ...(this.crew ? { player: this.player, crew: this.crew } : {}) });
  }

  applySnapshot(snapshot) {
    if (!snapshot || snapshot.missionId !== this.mission.id || !Array.isArray(snapshot.enemies) || !Array.isArray(snapshot.targets)) return false;
    if (this.crew && (!snapshot.player || !['x', 'y', 'z', 'health'].every(key => Number.isFinite(snapshot.player[key]))
      || !snapshot.crew || !clampCrewInput(snapshot.crew)
      || !GUNSHIP_STATIONS.every(station => Number.isFinite(snapshot.crew.stations?.[station.id]?.ammo)))) return false;
    if (this.participants.size && snapshot.runId && this.multiplayer.runId && snapshot.runId !== this.multiplayer.runId) return false;
    if (this.participants.size && finite(snapshot.time) < finite(this._lastSnapshotTime, -Infinity)) return false;
    this.worldAuthority = false;
    for (const key of ['enemies', 'targets', 'projectiles', 'effects', 'paratroopers', 'events']) if (Array.isArray(snapshot[key])) this[key] = copy(snapshot[key]);
    for (const key of ['waypointIndex', 'navigationTarget', 'phase', 'objective', 'hint', 'progress', 'score', 'defense', 'escortTime', 'dropsLanded', 'ending', 'endingText']) if (snapshot[key] !== undefined) this[key] = snapshot[key];
    if (this.crew) {
      Object.assign(this.player, copy(snapshot.player), { aircraft: this.mission.aircraft });
      setAttitude(this.player, orientationOf(this.player));
      this.crew = copy(snapshot.crew); this.time = finite(snapshot.time, this.time);
      this.status = snapshot.status;
      return true;
    }
    if (this.participants.size && Array.isArray(snapshot.participants)) {
      this.time = finite(snapshot.time, this.time); this._lastSnapshotTime = this.time;
      for (const incoming of snapshot.participants) {
        const record = this.participants.get(incoming.id);
        if (!record || !Number.isInteger(incoming.lifeId) || incoming.lifeId < record.lifeId || incoming.damageId < record.damageId) continue;
        const newLife = incoming.lifeId > record.lifeId;
        const local = incoming.id === this.player.id;
        const predicted = local ? this.player : record.pose;
        Object.assign(record, copy(incoming));
        if (local) {
          if (newLife) {
            this.player = createPilot(record.aircraft, record.spawn, record.id, record.lifeId);
            if (record.pose) Object.assign(this.player, copy(record.pose));
            setAttitude(this.player, orientationOf(this.player));
            this._receivedDamage = 0; this.gunCooldown = 0; this.missileCooldown = 0; this.payloadCooldown = 0;
            this.countermeasureCooldown = 0; this.countermeasureTime = 0; this._lastLandingCount = 0;
            this.radarOn = this.aircraft.radar; this.lockProgress = 0; this.targetId = null;
          } else this.player = predicted;
          Object.assign(this.player, { lifeId: record.lifeId, health: record.health, alive: record.alive,
            aircraft: record.aircraft, crashed: record.alive ? this.player.crashed : true });
          for (const key of ['ammo', 'missiles', 'bombs', 'troopers', 'dropsRemaining'])
            if (Number.isFinite(record.stores?.[key])) this.player[key] = Math.max(0, record.stores[key]);
          record.pose = this.player;
        }
      }
      if (snapshot.round) this.round = copy(snapshot.round);
      this.status = snapshot.status;
      this.setRemotePlayers([]); this._updateThreat();
      return true;
    }
    if (this.player.health > 0 && !this.player.crashed) this.status = snapshot.status;
    const stores = snapshot.weaponStores?.[this.player.id];
    if (stores) for (const key of ['ammo', 'missiles', 'bombs', 'troopers', 'dropsRemaining']) if (Number.isFinite(stores[key])) this.player[key] = Math.max(0, stores[key]);
    const totalDamage = finite(snapshot.remoteDamage?.[this.player.id]);
    if (totalDamage > finite(this._receivedDamage)) { this.player.health = Math.max(0, this.player.health - (totalDamage - finite(this._receivedDamage))); this._receivedDamage = totalDamage; }
    return true;
  }
}
