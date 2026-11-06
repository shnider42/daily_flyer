import { getAircraft, getMission } from './campaign.mjs';

const TAU = Math.PI * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const angle = n => ((n + Math.PI) % TAU + TAU) % TAU - Math.PI;
const mix = (a, b, f) => a + (b - a) * clamp(f, 0, 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = value => JSON.parse(JSON.stringify(value));
const direction = p => ({ x: Math.sin(p.heading) * Math.cos(p.pitch || 0), y: Math.sin(p.pitch || 0), z: Math.cos(p.heading) * Math.cos(p.pitch || 0) });
const living = o => o && o.health > 0 && o.alive !== false && !o.escaped;
const assisted = settings => settings?.assist !== 'expert';

function runwayCoordinates(x, z, runway) {
  const dx = x - runway.x, dz = z - runway.z;
  return { across: dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading), along: dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading) };
}

function runwayAt(x, z, mission, margin = 0) {
  return (mission.runways || []).findIndex(runway => {
    const q = runwayCoordinates(x, z, runway);
    return Math.abs(q.across) <= runway.width / 2 + margin && Math.abs(q.along) <= runway.length / 2 + margin;
  });
}

/** Shared terrain; negative values are open water, sea level is zero. */
export function terrainHeight(x, z, mission = {}) {
  x = finite(x); z = finite(z);
  let height;
  const biome = typeof mission === 'string' ? mission : mission.biome;
  if (biome === 'pacific' || biome === 'south_atlantic') {
    const islandA = 1 - Math.hypot((x - 6500) / 3300, (z - 7000) / 4300);
    const islandB = 1 - Math.hypot((x + 7000) / 2200, (z - 13500) / 2900);
    const island = Math.max(islandA, islandB);
    height = island > 0 ? 4 + Math.pow(island, 1.3) * (biome === 'pacific' ? 550 : 360) : -8;
  } else if (biome === 'channel' && z > 3400 && z < 11500) {
    height = -8;
  } else if (biome === 'coast' && x > 2600 + Math.sin(z / 2500) * 500) {
    height = -8;
  } else if (biome === 'mountains') {
    height = 45 + Math.pow(Math.max(0, Math.sin((x + z * 0.32) / 1700)), 2) * 1100
      + Math.pow(Math.max(0, Math.cos((z - x * 0.22) / 2400)), 2) * 620;
  } else if (biome === 'jungle') {
    height = 35 + Math.pow(Math.sin(x / 1600 + z / 2800), 2) * 135 + Math.pow(Math.sin(z / 1900), 2) * 95;
  } else if (biome === 'desert') {
    height = 18 + Math.sin(x / 650) * 6 + Math.cos(z / 930) * 7 + Math.max(0, Math.abs(x) - 6000) * 0.035;
  } else if (biome === 'night') {
    height = 19 + Math.sin(x / 2400) * 7 + Math.cos(z / 3100) * 8;
  } else {
    height = Math.max(2, 20 + Math.sin(x / 1800) * 12 + Math.sin(z / 2300) * 15 + Math.sin((x + z) / 3400) * 8);
  }
  if (typeof mission === 'object') {
    for (const runway of mission.runways || []) {
      if (runway.carrier) continue;
      const q = runwayCoordinates(x, z, runway);
      const outside = Math.max(Math.abs(q.across) - runway.width * 1.1, Math.abs(q.along) - runway.length * 0.56, 0);
      if (outside < 250) height = mix(runway.y, height, outside / 250);
    }
  }
  return height;
}

function surfaceHeight(x, z, mission) {
  const index = runwayAt(x, z, mission, 3);
  return index >= 0 ? Math.max(0, terrainHeight(x, z, mission), mission.runways[index].y) : Math.max(0, terrainHeight(x, z, mission));
}

function lineOfSight(a, b, mission) {
  for (let i = 1; i < 15; i++) {
    const f = i / 15;
    if (mix(a.y, b.y, f) < Math.max(0, terrainHeight(mix(a.x, b.x, f), mix(a.z, b.z, f), mission)) + 9) return false;
  }
  return true;
}

/** Mutates one local plane. Network snapshots deliberately never replace it. */
export function advancePlayer(player, input = {}, dt = 1 / 60, aircraft = getAircraft(player.aircraft), mission = {}, settings = {}) {
  const p = player, a = aircraft;
  dt = clamp(finite(dt, 1 / 60), 0, 0.05);
  if (!dt || p.crashed || p.health <= 0) return p;
  const rollInput = clamp(finite(input.roll), -1, 1), pitchInput = clamp(finite(input.pitch), -1, 1), yawInput = clamp(finite(input.yaw), -1, 1);
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
  const beforeY = p.y;

  if (p.hover && a.vtol) {
    p.pitch = mix(p.pitch, pitchInput * 0.18, dt * 3);
    p.roll = mix(p.roll, rollInput * 0.2, dt * 3);
    p.heading = angle(p.heading + yawInput * 0.65 * dt);
    p.hoverForward = mix(finite(p.hoverForward, p.speed), -pitchInput * 45, dt * 1.4);
    p.speed = Math.abs(p.hoverForward);
    const sideways = rollInput * 35;
    p.vx = Math.sin(p.heading) * p.hoverForward + Math.cos(p.heading) * sideways + windX * 0.2;
    p.vz = Math.cos(p.heading) * p.hoverForward - Math.sin(p.heading) * sideways + windZ * 0.2;
    p.verticalSpeed = mix(finite(p.verticalSpeed), p.engine ? (p.throttle - 0.5) * 55 : -18, dt * 1.8);
    if (p.onGround && p.verticalSpeed > 1) { p.onGround = false; p.everAirborne = true; }
    if (!p.onGround) { p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.verticalSpeed * dt; }
    p.stalled = false;
  } else {
    const gearDrag = p.gear && !a.fixedGear ? 0.86 : 1, flapDrag = p.flaps ? 0.76 : 1;
    const targetSpeed = p.engine ? a.maxSpeed * Math.pow(p.throttle, 0.68) * gearDrag * flapDrag * damageFactor : 0;
    const thrust = clamp((targetSpeed - p.speed) * 0.23, -a.acceleration * 0.65, a.acceleration * damageFactor);
    p.speed = Math.max(0, p.speed + (thrust - Math.sin(finite(p.pitch)) * 2.2) * dt);
    if (p.onGround) {
      p.pitch = mix(p.pitch, Math.max(0, pitchInput) * 0.16, dt * 3);
      p.roll = mix(p.roll, 0, dt * 6);
      p.heading = angle(p.heading + (yawInput + rollInput * 0.65) * a.turnRate * Math.min(p.speed / 15, 1) * dt);
      if (p.brake) p.speed = Math.max(0, p.speed - (a.acceleration * 2.3 + 10) * dt);
      const lift = p.speed > stallSpeed * 1.12 && pitchInput > 0.13;
      const autoLift = assisted(settings) && p.speed > stallSpeed * 1.32 && pitchInput > -0.2;
      if (!p.brake && (lift || autoLift)) {
        p.onGround = false; p.everAirborne = true;
        p.takeoffAssist = assisted(settings) ? 7 : 0;
        p.pitch = Math.max(p.pitch, assisted(settings) ? 0.14 : 0.08);
        p.verticalSpeed = Math.max(3, p.speed * Math.sin(p.pitch));
      }
    } else {
      const recover = p.levelAssist > 0;
      if (settings.assist === 'expert' && !recover) {
        p.roll = angle(p.roll + rollInput * a.rollRate * damageFactor * dt);
        p.pitch = clamp(p.pitch + pitchInput * 0.55 * dt, -1.05, 1.05);
        if (settings.autoLevel && Math.abs(rollInput) < 0.01) p.roll = mix(p.roll, 0, dt * 0.7);
        if (settings.autoLevel && Math.abs(pitchInput) < 0.01) p.pitch = mix(p.pitch, 0, dt * 0.5);
      } else {
        const bankLimit = settings.assist === 'standard' ? 1.15 : 0.87;
        if (settings.autoLevel === false && !recover) p.roll = clamp(p.roll + rollInput * a.rollRate * damageFactor * dt, -bankLimit, bankLimit);
        else p.roll = mix(p.roll, recover ? 0 : rollInput * bankLimit, dt * a.rollRate * 2.2 * damageFactor);
        if (settings.autoLevel !== false || settings.assist === 'assisted' || recover) {
          const takeoffPitch = p.takeoffAssist > 0 && pitchInput > -0.2 ? 0.12 : 0;
          p.pitch = mix(p.pitch, recover ? 0 : Math.max(pitchInput * 0.42, takeoffPitch || -1), dt * 2.7);
        }
        else p.pitch = clamp(p.pitch + pitchInput * 0.46 * dt, -0.75, 0.75);
      }
      const speedTurnFactor = clamp(Math.pow(a.cruise / Math.max(stallSpeed, p.speed), 0.4), 0.65, 1.25);
      p.heading = angle(p.heading + (Math.sin(p.roll) * a.turnRate * speedTurnFactor + yawInput * a.turnRate * 0.28) * dt);
      p.stalled = p.speed < stallSpeed;
      let vertical = clamp(p.speed * Math.sin(p.pitch), -a.maxSpeed * 0.65, a.climbRate);
      if (p.stalled) {
        vertical -= 3 + (stallSpeed - p.speed) * 0.75;
        p.pitch = mix(p.pitch, -0.12, dt * (assisted(settings) ? 0.8 : 0.35));
      }
      p.verticalSpeed = mix(finite(p.verticalSpeed), vertical, dt * 4);
    }
    const heading = direction(p);
    p.vx = heading.x * p.speed + (p.onGround ? 0 : windX);
    p.vz = heading.z * p.speed + (p.onGround ? 0 : windZ);
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.onGround) p.y = surfaceHeight(p.x, p.z, mission) + 3;
    else p.y += finite(p.verticalSpeed) * dt;
  }

  const ground = surfaceHeight(p.x, p.z, mission);
  if (!p.onGround && p.y <= ground + 3) {
    const runwayIndex = runwayAt(p.x, p.z, mission, assisted(settings) ? 16 : 2);
    const runway = mission.runways?.[runwayIndex];
    const alignment = !runway || p.hover || Math.abs(Math.sin(p.heading - runway.heading)) < (assisted(settings) ? 0.75 : 0.4);
    const speedSafe = p.hover ? p.speed < 28 : p.speed < stallSpeed * (assisted(settings) ? 2.05 : 1.65);
    const sinkSafe = p.verticalSpeed > (p.hover ? -12 : assisted(settings) ? -12 : -6.5);
    const gearSafe = p.gear || p.hover;
    const dry = terrainHeight(p.x, p.z, mission) >= 0 || runway?.carrier;
    if (speedSafe && sinkSafe && gearSafe && Math.abs(p.roll) < (assisted(settings) ? 0.5 : 0.25) && alignment && dry) {
      p.onGround = true; p.y = ground + 3; p.verticalSpeed = 0; p.pitch = 0; p.roll = 0;
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

export class FlightSimulation {
  constructor(mission, settings = {}) {
    this.mission = typeof mission === 'string' ? getMission(mission) : mission;
    this.settings = { assist: 'assisted', guidance: 'guided', autoLevel: true, ...settings };
    this.aircraft = getAircraft(this.mission.aircraft);
    const m = this.mission, a = this.aircraft, s = m.start || {};
    this.player = {
      id: settings.playerId || 'local', x: finite(s.x), y: finite(s.y, 500), z: finite(s.z), heading: finite(s.heading), pitch: 0, roll: 0,
      speed: finite(s.speed), throttle: s.cold ? 0.08 : s.airborne ? Math.pow(a.cruise / a.maxSpeed, 1 / 0.68) : 0.1,
      health: a.health, fuel: 100, gear: a.fixedGear || (s.gear ?? !s.airborne), flaps: false, brake: !s.airborne,
      engine: !s.cold, startupStep: s.cold ? 0 : 4, onGround: !s.airborne, aircraft: a.id,
      verticalSpeed: 0, stalled: false, ammo: a.gun?.ammo || 0, missiles: a.missiles, bombs: a.bombs,
      hover: false, troopers: a.id === 'c47' ? 24 : 0, dropsRemaining: a.id === 'c47' ? 2 : 0,
      gunHeat: 0, flightTime: 0, everAirborne: !!s.airborne, landings: 0, vx: 0, vz: s.speed || 0,
    };
    this.enemies = copy(m.enemies || []).map((e, i) => ({ ...e, alive: true, active: true, pitch: 0, roll: 0, initialHealth: e.health, fireTimer: 1.5 + i * 0.7, missileTimer: 8 + i * 3, age: 0 }));
    this.targets = copy(m.targets || []).map(t => ({ ...t, y: ['balloon', 'city'].includes(t.type) ? t.y : Math.max(0, terrainHeight(t.x, t.z, m)) + 5, alive: true, active: true, initialHealth: t.health, fireTimer: 7 }));
    this.projectiles = []; this.effects = []; this.paratroopers = []; this.remotePlayers = [];
    this.waypointIndex = 0; this.status = 'flying'; this.phase = m.start?.cold ? 'startup' : m.start?.airborne ? 'flight' : 'takeoff';
    this.objective = ''; this.hint = ''; this.progress = 0; this.time = 0; this.score = 0; this.events = []; this.navigationTarget = null;
    this.targetId = null; this.lockProgress = 0; this.radarOn = a.radar; this.threat = 0;
    this.defense = 100; this.escortTime = 0; this.dropsLanded = 0; this.ending = null; this.endingText = '';
    this.gunCooldown = 0; this.payloadCooldown = 0; this.countermeasureCooldown = 0; this.countermeasureTime = 0;
    this.egressTime = 0; this.worldAuthority = true; this.remoteWeapons = new Map(); this.remoteDamage = {};
    this._eventId = 0; this._entityId = 0; this._lastLandingCount = 0; this._warnedStall = false; this._rng = (m.number || 1) * 19937;
    this._chooseTarget(); this._updateBombAim(); this._updateObjective(0);
  }

  get selectedTarget() { return [...this.enemies, ...this.targets].find(t => t.id === this.targetId && living(t)) || null; }
  _random() { this._rng = (this._rng * 1664525 + 1013904223) >>> 0; return this._rng / 4294967296; }
  _id(prefix) { return `${prefix}-${++this._entityId}`; }
  _event(kind, text) {
    this.events.push({ id: ++this._eventId, kind, text });
    if (this.events.length > 32) this.events.splice(0, this.events.length - 32);
  }
  _effect(type, x, y, z, radius = 35, life = 1.4) { this.effects.push({ id: this._id('effect'), type, x, y, z, radius, age: 0, life }); }
  _hostiles() { return [...this.enemies, ...this.targets].filter(t => living(t) && !t.friendly && !t.narrative && t.type !== 'dropzone'); }
  _chooseTarget(cycle = false) {
    const list = this._hostiles().filter(t => t.detected !== false).sort((a, b) => {
      const score = t => flatDist(this.player, t) + Math.abs(angle(Math.atan2(t.x - this.player.x, t.z - this.player.z) - this.player.heading)) * 3500;
      return score(a) - score(b);
    });
    if (!list.length) { this.targetId = null; this.lockProgress = 0; return; }
    const index = list.findIndex(t => t.id === this.targetId);
    const next = cycle && index >= 0 ? list[(index + 1) % list.length] : list[0];
    if (next.id !== this.targetId) this.lockProgress = 0;
    this.targetId = next.id;
  }

  action(name) {
    if (name && typeof name === 'object') name = name.name || name.action || name.type;
    if (this.status !== 'flying') return false;
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
      case 'level': p.levelAssist = 4; p.pitch = 0; p.roll = 0; this._event('control', 'Level recovery engaged'); return true;
      case 'target': this._chooseTarget(true); return true;
      case 'radar':
        if (!a.radar) return false;
        this.radarOn = !this.radarOn; this.lockProgress = 0; this._event('control', `Radar ${this.radarOn ? 'on' : 'off'}`); return true;
      case 'missile': return this._launchMissile(p, this.selectedTarget, false);
      case 'payload': return this._payload(p, false);
      case 'fire': return this._shoot(p, false);
      case 'countermeasure': {
        if (!a.radar || this.countermeasureCooldown > 0) return false;
        this.countermeasureCooldown = 6; this.countermeasureTime = 3.5; this.threat *= 0.2;
        for (const projectile of this.projectiles) {
          if (projectile.owner === 'enemy' && projectile.type === 'missile' && dist(projectile, p) < 2800) { projectile.life = 0; this._effect('flash', projectile.x, projectile.y, projectile.z, 55, 0.5); }
        }
        this._effect('flare', p.x, p.y, p.z, 60, 2.2); this._event('countermeasure', 'Countermeasures released · incoming track disrupted'); return true;
      }
      case 'hover':
        if (!a.vtol) return false;
        if (!p.hover && p.speed > 130) { this._event('info', 'Reduce speed below 130 m/s before selecting hover.'); return false; }
        p.hover = !p.hover;
        if (p.hover) { p.gear = true; p.throttle = 0.5; p.brake = false; p.verticalSpeed = 0; p.hoverForward = p.speed; }
        this._event('control', p.hover ? 'Hover mode · half throttle holds altitude' : 'Forward flight mode'); return true;
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
    dt = clamp(finite(dt, 1 / 60), 0, 0.05);
    this.time += dt;
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.missileCooldown = Math.max(0, finite(this.missileCooldown) - dt);
    this.payloadCooldown = Math.max(0, this.payloadCooldown - dt);
    this.countermeasureCooldown = Math.max(0, this.countermeasureCooldown - dt);
    this.countermeasureTime = Math.max(0, this.countermeasureTime - dt);
    this.player.gunHeat = Math.max(0, this.player.gunHeat - dt * 0.22);
    this.threat = Math.max(0, this.threat - dt * 0.12);
    advancePlayer(this.player, input, dt, this.aircraft, this.mission, this.settings);
    if (this.player.crashed || this.player.health <= 0) {
      this._effect('explosion', this.player.x, this.player.y, this.player.z, 90, 3);
      this._finish(false, this.player.crashCause || 'The aircraft could not continue.'); return;
    }
    if (this.player.landings > this._lastLandingCount) { this._lastLandingCount = this.player.landings; this._event('landing', 'Safe touchdown'); }
    if (this.player.stalled && !this._warnedStall) { this._warnedStall = true; this._event('warning', 'Low airspeed · lower the nose and increase throttle'); }
    if (!this.player.stalled) this._warnedStall = false;
    if (input.fire) this._shoot(this.player, false);
    this._updateLock(dt);
    this._updateBombAim();
    if (this.worldAuthority) {
      this._advanceEnemies(dt); this._advanceHazards(dt); this._advanceProjectiles(dt); this._advanceParatroopers(dt); this._advanceWaypoints(); this._updateObjective(dt);
    } else {
      // Predicted shots are cosmetic; the host resolves shared hits and goals.
      this._advanceProjectiles(dt, true);
    }
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(e => e.age < e.life);
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  _advanceWaypoints() {
    const waypoint = this.mission.waypoints?.[this.waypointIndex];
    if (waypoint && dist(this.player, waypoint) < waypoint.radius) {
      this.waypointIndex++; this.score += 75; this._event('waypoint', waypoint.label || 'Waypoint reached');
    }
  }

  _updateLock(dt) {
    for (const e of this.enemies) {
      const visible = lineOfSight(this.player, e, this.mission), distance = dist(this.player, e);
      e.radarVisible = this.radarOn && distance < this.aircraft.missileRange * 1.8 && visible;
      e.detected = !this.aircraft.radar || e.friendly || (distance < 2800 && visible) || e.radarVisible;
    }
    if (!living(this.selectedTarget) || this.selectedTarget?.detected === false) this._chooseTarget();
    const target = this.selectedTarget;
    if (!this.aircraft.radar || !this.radarOn || !target) { this.lockProgress = Math.max(0, this.lockProgress - dt * 2); return; }
    const p = this.player, d = dist(p, target), dir = direction(p);
    const dot = ((target.x - p.x) * dir.x + (target.y - p.y) * dir.y + (target.z - p.z) * dir.z) / Math.max(1, d);
    const visible = lineOfSight(p, target, this.mission);
    this.lockReason = !visible ? 'Terrain masks the contact' : d > this.aircraft.missileRange ? 'Outside game missile range' : dot < 0.8 ? 'Point the nose toward the contact' : 'Acquiring track';
    if (d <= this.aircraft.missileRange && dot > 0.8 && visible) this.lockProgress = Math.min(1, this.lockProgress + dt / this.aircraft.lockTime);
    else this.lockProgress = Math.max(0, this.lockProgress - dt * 1.1);
  }

  _shoot(p, remote = false) {
    const a = getAircraft(p.aircraft), gun = a.gun;
    const state = remote ? this._remoteState(p) : this;
    if (!gun || (state.gunCooldown || 0) > 0 || p.ammo <= 0 || p.gunHeat > 0.98) return false;
    state.gunCooldown = 1 / gun.rate;
    p.ammo--; p.gunHeat = finite(p.gunHeat) + 0.045;
    const dir = direction(p), cone = gun.cone * (this.settings.assist === 'expert' ? 0.65 : 1.3);
    let best = null, bestScore = Infinity;
    for (const target of this._hostiles()) {
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
    if (best && this.worldAuthority) this._damage(best, gun.damage, 'gun');
    return true;
  }

  _launchMissile(p, target, remote = false) {
    const a = getAircraft(p.aircraft);
    if (!a.radar || p.missiles <= 0 || !living(target)) { if (!remote) this._event('info', p.missiles <= 0 ? 'No missiles remaining. Guns are still available.' : 'Select a target first.'); return false; }
    const state = remote ? this._remoteState(p) : this;
    if ((state.missileCooldown || 0) > 0) return false;
    if (!remote && (this.lockProgress < 0.98 || !this.radarOn)) { this._event('info', 'Hold the target in front of the aircraft until LOCK is full.'); return false; }
    if (dist(p, target) > a.missileRange || !lineOfSight(p, target, this.mission)) return false;
    const owner = remote ? p.id : 'player';
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
    this.projectiles.push({ id: this._id('missile'), type: 'missile', x: p.x, y: p.y - 2, z: p.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, speed, life: 24, owner, targetId: target.id, damage: a.missileDamage });
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

  _damage(target, amount, weapon) {
    if (!living(target)) return;
    target.health = Math.max(0, target.health - amount);
    if (target.health > 0) { this._effect('impact', target.x, target.y, target.z, 15, 0.3); return; }
    target.alive = false; target.active = false;
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
    const p = this.player;
    for (const e of this.enemies) {
      if (!living(e)) continue;
      const a = getAircraft(e.aircraft); e.age += dt;
      if (e.friendly) {
        e.x += Math.sin(e.heading) * e.speed * dt; e.z += Math.cos(e.heading) * e.speed * dt;
        e.y = Math.max(e.y, terrainHeight(e.x, e.z, this.mission) + 180); continue;
      }
      let victim = p;
      const escort = this.enemies.find(o => o.friendly && living(o));
      if (escort && e.id.endsWith('2')) victim = escort;
      for (const remote of this.remotePlayers) {
        if (remote && Number.isFinite(remote.x) && Number.isFinite(remote.y) && flatDist(e, remote) + 300 < flatDist(e, victim)) victim = remote;
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
        this.projectiles.push({ id: this._id('enemy-bullet'), type: 'bullet', x: e.x, y: e.y, z: e.z, vx: aim.x * 850, vy: aim.y * 850, vz: aim.z * 850, life: 2.7, owner: 'enemy', targetId: victim === escort ? victim.id : 'player', targetPlayerId: victim.id, damage: this.settings.assist === 'expert' ? 9 : 5 });
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
    this.projectiles.push({ id: this._id('enemy-missile'), type: 'missile', x: origin.x, y: origin.y + 8, z: origin.z, vx: (victim.x - origin.x) / distance * speed, vy: (victim.y - origin.y) / distance * speed, vz: (victim.z - origin.z) / distance * speed, speed, life: 18, owner: 'enemy', targetId: 'player', targetPlayerId: victim.id, damage: this.settings.assist === 'expert' ? 45 : 25 });
    this.threat = 1;
  }

  _advanceHazards(dt) {
    const p = this.player;
    for (const target of this.targets) {
      if (!target.hazard || !living(target)) continue;
      target.fireTimer -= dt;
      const distance = flatDist(p, target), range = target.radius || 1200;
      if (distance > range || p.onGround) continue;
      const exposure = this.aircraft.stealth ? this.radarOn ? 1 : 0.3 : 1;
      this.threat = Math.max(this.threat, (1 - distance / range) * exposure * 0.7);
      if (target.fireTimer <= 0) {
        target.fireTimer = target.type === 'sam' ? 13 / exposure : 3.3;
        if (target.type === 'sam' && lineOfSight({ ...target, y: target.y + 20 }, p, this.mission)) {
          this._enemyMissile(target, p); this._event('warning', 'SAM warning · terrain and countermeasures can break the track');
        } else if (target.type === 'flak') {
          const burst = { x: p.x + (this._random() - 0.5) * 220, y: p.y + (this._random() - 0.5) * 180, z: p.z + (this._random() - 0.5) * 220 };
          this._effect('smoke', burst.x, burst.y, burst.z, 90, 3);
          if (dist(p, burst) < 90) p.health = Math.max(1, p.health - (this.settings.assist === 'expert' ? 11 : 5));
        }
      }
    }
  }

  _advanceProjectiles(dt, cosmeticWorld = false) {
    for (const projectile of this.projectiles) {
      if (projectile.life <= 0) continue;
      projectile.life -= dt;
      let target;
      if (projectile.type === 'missile') {
        if (projectile.owner === 'enemy') {
          target = projectile.targetPlayerId && projectile.targetPlayerId !== this.player.id ? this.remotePlayers.find(p => p.id === projectile.targetPlayerId) || this.player : this.player;
          if (this.countermeasureTime > 0 && target === this.player) { projectile.life = 0; continue; }
        } else target = [...this.enemies, ...this.targets].find(t => t.id === projectile.targetId && living(t));
        if (target) {
          const distance = Math.max(1, dist(projectile, target)), steer = projectile.owner === 'enemy' ? 1.9 : 4.8, speed = projectile.speed || 650;
          projectile.vx = mix(projectile.vx, (target.x - projectile.x) / distance * speed, dt * steer);
          projectile.vy = mix(projectile.vy, (target.y - projectile.y) / distance * speed, dt * steer);
          projectile.vz = mix(projectile.vz, (target.z - projectile.z) / distance * speed, dt * steer);
        }
      }
      if (projectile.type === 'bomb') projectile.vy -= 28 * dt;
      projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.z += projectile.vz * dt;
      if (cosmeticWorld) continue;
      if (projectile.owner === 'enemy') {
        const victim = projectile.targetId !== 'player' ? this.enemies.find(e => e.id === projectile.targetId) : target || (projectile.targetPlayerId && projectile.targetPlayerId !== this.player.id ? this.remotePlayers.find(p => p.id === projectile.targetPlayerId) : this.player);
        if (victim && dist(projectile, victim) < (projectile.type === 'missile' ? 65 : 38)) {
          projectile.life = 0;
          if (victim === this.player) {
            this.player.health = Math.max(0, this.player.health - projectile.damage);
            this._effect('impact', victim.x, victim.y, victim.z, 40, 0.4); this._event('hit', 'Aircraft hit');
          } else if (victim.friendly) this._damage(victim, projectile.damage, 'enemy');
          else if (victim.id) this.remoteDamage[victim.id] = finite(this.remoteDamage[victim.id]) + projectile.damage;
        }
      } else if (projectile.type === 'missile' && target && dist(projectile, target) < 85) {
        projectile.life = 0; this._damage(target, projectile.damage, 'missile');
      }
      const ground = Math.max(0, terrainHeight(projectile.x, projectile.z, this.mission));
      if (projectile.y <= ground + 3) {
        projectile.life = 0;
        if (projectile.type === 'bomb') {
          this._effect('explosion', projectile.x, ground + 8, projectile.z, projectile.radius * 0.45, 2.6);
          for (const t of this.targets) {
            if (!living(t) || t.narrative || t.type === 'dropzone' || t.type === 'balloon') continue;
            const distance = flatDist(projectile, t);
            if (distance < projectile.radius) this._damage(t, projectile.damage * (0.5 + 0.5 * (1 - distance / projectile.radius)), 'bomb');
          }
        }
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

  _navigationHint(point) {
    const p = this.player, distance = flatDist(p, point), delta = angle(Math.atan2(point.x - p.x, point.z - p.z) - p.heading);
    const turn = Math.abs(delta) > 0.2 ? `Bank ${delta > 0 ? 'right' : 'left'} toward the marker.` : 'Keep the marker ahead.';
    const altitude = point.y - p.y;
    return `${turn} ${Math.abs(altitude) > 100 ? altitude > 0 ? 'Raise the nose gently.' : 'Lower the nose gently.' : 'Hold your altitude.'} ${(distance / 1000).toFixed(1)} km to go.`;
  }

  _landingHint(runway) {
    if (!runway) return 'Find a clear runway and land with the gear down.';
    const p = this.player;
    if (p.onGround) return p.lastLanding?.runwayIndex === this.mission.goal.destinationRunway ? 'Throttle idle and set the brake to finish the landing.' : 'This is not the destination. Take off and follow the destination marker.';
    if (this.aircraft.vtol) return `Return to ${runway.label} · ${(flatDist(p, runway) / 1000).toFixed(1)} km. ${p.hover ? 'Half throttle holds height; use less to descend. Pitch and roll translate across the deck.' : 'Reduce speed below 130 m/s, select HOVER, then settle gently onto the deck.'}`;
    if (!p.gear) return 'Extend the landing gear before your approach.';
    if (p.speed > this.aircraft.stallSpeed * 1.85) return this.aircraft.hasFlaps === false ? 'Reduce throttle for landing. This biplane has fixed gear and no flaps.' : 'Reduce throttle for landing. Flaps lower the stall speed and add drag.';
    return `Line up with ${runway.label} · ${(flatDist(p, runway) / 1000).toFixed(1)} km. Aim for the near end, descend gently, and keep wings level. Brake after touchdown.`;
  }

  _updateObjective(dt) {
    if (this.status !== 'flying') return;
    const m = this.mission, g = m.goal || {}, p = this.player;
    this.navigationTarget = null;
    if (g.protectIds?.some(id => !living(this.targets.find(t => t.id === id)))) { this._finish(false, 'A protected friendly unit was lost. Check the target markings before firing.'); return; }
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
    if (g.type === 'land') {
      if (this.waypointIndex < (m.waypoints || []).length) {
        this.phase = 'route'; const waypoint = m.waypoints[this.waypointIndex];
        this.objective = `Follow the flight route · ${this.waypointIndex}/${m.waypoints.length} rings`;
        this.hint = this._navigationHint(waypoint); this.progress = 0.15 + this.waypointIndex / m.waypoints.length * 0.55;
      } else {
        this.phase = 'landing'; const runway = m.runways[g.destinationRunway];
        this.navigationTarget = { x: runway.x, y: runway.y + 35, z: runway.z, label: `LAND · ${runway.label}` };
        this.objective = `Land at ${runway.label}, then slow to a stop`; this.hint = this._landingHint(runway); this.progress = 0.78;
        if (p.onGround && p.lastLanding?.runwayIndex === g.destinationRunway && p.speed < (g.stopSpeed || 12)) this._finish(true, 'Flight complete · safe arrival');
      }
      return;
    }
    if (g.type === 'escort') {
      const escort = this.enemies.find(e => e.id === g.protectId);
      if (!living(escort)) { this._finish(false, 'The reconnaissance aircraft was lost. Stay close enough to protect it.'); return; }
      const close = flatDist(p, escort) < g.escortRadius;
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
      else if (p.troopers === 0 && this.paratroopers.length && this.paratroopers.every(t => t.landed)) this._finish(false, 'Too few parachutes reached the zone. Try releasing closer to its center.');
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
      if (p.onGround && p.lastLanding?.runwayIndex === g.destinationRunway && p.speed < g.stopSpeed) this._finish(true, 'Task force protected · safe carrier recovery'); return;
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
    this.hint = success ? 'Review the logbook, then continue to the next chapter.' : 'Retry the sortie, or adjust flight assistance in settings.';
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

  applyRemoteAction(action, pose) {
    if (!this.worldAuthority || this.status !== 'flying' || !pose || ![pose.x, pose.y, pose.z, pose.heading].every(Number.isFinite)) return false;
    const name = typeof action === 'string' ? action : action?.name || action?.action || action?.type;
    // A squadron sortie uses its assigned aircraft; a pose cannot grant stores.
    const p = { ...pose, aircraft: this.mission.aircraft, pitch: clamp(finite(pose.pitch), -1.5, 1.5) }, state = this._remoteState(p);
    Object.assign(p, { ammo: state.ammo, missiles: state.missiles, bombs: state.bombs, troopers: state.troopers, dropsRemaining: state.dropsRemaining, gunHeat: state.gunHeat });
    const chosen = [...this.enemies, ...this.targets].find(t => t.id === action?.targetId && living(t) && !t.friendly) || this.selectedTarget;
    let result = false;
    if (name === 'fire') result = this._shoot(p, true);
    else if (name === 'missile') result = this._launchMissile(p, chosen, true);
    else if (name === 'payload') result = this._payload(p, true);
    else if (name === 'countermeasure') {
      if (state.countermeasureCooldown > 0) return false;
      state.countermeasureCooldown = 6;
      for (const projectile of this.projectiles) if (projectile.owner === 'enemy' && projectile.targetPlayerId === p.id && dist(projectile, p) < 2800) projectile.life = 0;
      this._effect('flare', p.x, p.y, p.z, 60, 2.2); result = true;
    }
    for (const key of ['ammo', 'missiles', 'bombs', 'troopers', 'dropsRemaining', 'gunHeat']) state[key] = p[key];
    return result;
  }

  getSnapshot() {
    const weaponStores = {};
    for (const [id, stores] of this.remoteWeapons) weaponStores[id] = { ammo: stores.ammo, missiles: stores.missiles, bombs: stores.bombs, troopers: stores.troopers, dropsRemaining: stores.dropsRemaining };
    return copy({ version: 1, missionId: this.mission.id, time: this.time, enemies: this.enemies, targets: this.targets, projectiles: this.projectiles.slice(-180), effects: this.effects.slice(-60), paratroopers: this.paratroopers, waypointIndex: this.waypointIndex, navigationTarget: this.navigationTarget, status: this.status, phase: this.phase, objective: this.objective, hint: this.hint, progress: this.progress, score: this.score, defense: this.defense, escortTime: this.escortTime, dropsLanded: this.dropsLanded, ending: this.ending, endingText: this.endingText, events: this.events.slice(-12), remoteDamage: this.remoteDamage, weaponStores });
  }

  applySnapshot(snapshot) {
    if (!snapshot || snapshot.missionId !== this.mission.id || !Array.isArray(snapshot.enemies) || !Array.isArray(snapshot.targets)) return false;
    this.worldAuthority = false;
    for (const key of ['enemies', 'targets', 'projectiles', 'effects', 'paratroopers', 'events']) if (Array.isArray(snapshot[key])) this[key] = copy(snapshot[key]);
    for (const key of ['waypointIndex', 'navigationTarget', 'phase', 'objective', 'hint', 'progress', 'score', 'defense', 'escortTime', 'dropsLanded', 'ending', 'endingText']) if (snapshot[key] !== undefined) this[key] = snapshot[key];
    if (this.player.health > 0 && !this.player.crashed) this.status = snapshot.status;
    const stores = snapshot.weaponStores?.[this.player.id];
    if (stores) for (const key of ['ammo', 'missiles', 'bombs', 'troopers', 'dropsRemaining']) if (Number.isFinite(stores[key])) this.player[key] = Math.max(0, stores[key]);
    const totalDamage = finite(snapshot.remoteDamage?.[this.player.id]);
    if (totalDamage > finite(this._receivedDamage)) { this.player.health = Math.max(0, this.player.health - (totalDamage - finite(this._receivedDamage))); this._receivedDamage = totalDamage; }
    return true;
  }
}
