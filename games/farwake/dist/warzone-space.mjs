/** A bounded, persistent fleet war. The room authority calls this exactly once. */
import { getShipClass, enemyHullProfile } from './fleet.mjs';
import { CROSSWIND_SYSTEM_ID, CROSSWIND_ARRIVAL, WARZONE_FACTION_STYLE, isWarzoneSystem } from './warzone-content.mjs';

export const WARZONE_SPACE_VERSION = 1;
export const WARZONE_SPACE_LIMITS = Object.freeze({ initialPerSide: 28, ships: 80, projectiles: 160, effects: 48, recentLosses: 64, targetDecisionSeconds: .45, catchUpSeconds: 90 });
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const random = state => { state.rng = (state.rng + 0x6D2B79F5) >>> 0; let t = Math.imul(state.rng ^ state.rng >>> 15, state.rng | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const between = (state, low, high) => low + random(state) * (high - low);
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const validFaction = id => !!WARZONE_FACTION_STYLE[id];
const unit = value => value?.warzone === true && value.hp > 0 && !value.promotedVesselId && !value.canonicalVesselId;
const combatant = value => unit(value) && !value.disabled && !value.capturedBy && !value.boardingTargetId;
const participantId = value => String(value.vesselId || value.ship?.id || value.id || '');
const sideIds = runtime => Array.isArray(runtime.warzoneFactions) && runtime.warzoneFactions.length === 2 && runtime.warzoneFactions.every(validFaction) ? [...runtime.warzoneFactions] : ['freewake', 'meridian'];

const COMPOSITION = Object.freeze([
  ...Array.from({ length: 8 }, () => ({ classId: 'kestrel', size: 'small', role: 'screen' })),
  ...Array.from({ length: 4 }, () => ({ classId: 'sparrow', size: 'small', role: 'screen' })),
  ...Array.from({ length: 4 }, () => ({ classId: 'marten', size: 'medium', role: 'escort' })),
  ...Array.from({ length: 2 }, () => ({ classId: 'quill', size: 'medium', role: 'interceptor' })),
  ...Array.from({ length: 2 }, () => ({ classId: 'petrel', size: 'medium', role: 'sensor escort' })),
  ...Array.from({ length: 4 }, () => ({ classId: 'frigate', size: 'large', role: 'line frigate' })),
  ...Array.from({ length: 2 }, () => ({ classId: 'bulwark', size: 'large', role: 'battery ship' })),
  { classId: 'capital', size: 'massive', role: 'fleet carrier' }, { classId: 'judicator', size: 'massive', role: 'line destroyer' }
]);
const PROFILE_BY_CLASS = new Map(COMPOSITION.map(value => [value.classId, value]));
const TITLES = ['After Rain', 'Long Watch', 'Kept Promise', 'Low Lantern', 'Third Shift', 'Steady Hand', 'Way Through', 'Iron Orchard', 'Open Channel', 'Hold Fast', 'Rising Tide', 'Last Measure'];
const PHASES = Object.freeze({
  crossfire: { label: 'Crossfire over Vey', intensity: .86, shift: 0, cadence: 1 },
  'western-push': { label: 'Western fleet pushing', intensity: 1, shift: 420, cadence: .88 },
  'eastern-push': { label: 'Eastern fleet pushing', intensity: 1, shift: -420, cadence: .88 },
  'resupply-lull': { label: 'Lines withdrawing to resupply', intensity: .42, shift: 0, cadence: 1.6 },
  counterattack: { label: 'Fresh squadrons counterattacking', intensity: .96, shift: 0, cadence: .8 }
});

function sectorsFor(runtime) {
  const world = (runtime.bodies || []).find(body => body.id === 'crosswind-vey') || { x: 300, y: -450 };
  return [{ id: 'high-lane', name: 'Northern battery lane', x: world.x, y: world.y - 1100 },
    { id: 'freight-cut', name: 'Freight crossing', x: world.x + 120, y: world.y + 650 },
    { id: 'evacuation-edge', name: 'Evacuation approach edge', x: world.x - 250, y: world.y + 1780 }];
}

function profile(classId) {
  const source = PROFILE_BY_CLASS.get(classId) || COMPOSITION[0], hull = getShipClass(source.classId), stats = hull.stats;
  const factor = { small: 1.12, medium: 1.16, large: 1.22, massive: 1.28 }[source.size];
  return { ...source, hull, stats, maxHp: Math.round(stats.maxHull * factor), speed: stats.speed * ({ small: .72, medium: .61, large: .48, massive: .42 }[source.size]),
    damage: stats.damage * ({ small: .57, medium: .56, large: .54, massive: .58 }[source.size]), range: { small: 760, medium: 1050, large: 1400, massive: 1780 }[source.size],
    standoff: { small: 240, medium: 490, large: 920, massive: 1280 }[source.size] };
}

function makeShip(runtime, faction, template, { initial = false, slot = 0, lane = null, picket = false } = {}) {
  const state = runtime.warzone, source = profile(template.classId), sign = state.factions.indexOf(faction) ? 1 : -1, serial = ++state.serial;
  const sectorIndex = lane === null ? slot % state.sectors.length : lane, sector = state.sectors[sectorIndex], spread = { small: 660, medium: 1010, large: 1480, massive: 1980 }[source.size];
  const x = sector.x + sign * (initial ? spread + between(state, -180, 220) : between(state, 2850, 3500));
  const y = sector.y + between(state, -260, 260), style = WARZONE_FACTION_STYLE[faction], name = picket ? `${style.prefix} Watchknife` : `${style.prefix} ${TITLES[(serial + hash(faction)) % TITLES.length]} ${serial}`;
  const ship = { id: `${CROSSWIND_SYSTEM_ID}:fleet:${faction}:${serial}`, name, faction, warzone: true, warzoneSize: source.size, warzoneRole: source.role, warzoneLane: sectorIndex,
    ...enemyHullProfile(source.classId), classId: source.classId, x, y, vx: 0, vy: 0, angle: sign < 0 ? 0 : Math.PI,
    hp: source.maxHp, maxHp: source.maxHp, speed: source.speed, damage: source.damage, range: source.range, energy: source.stats.maxEnergy,
    maxEnergy: source.stats.maxEnergy, color: style.hull, factionColor: style.color, active: true, hostile: false,
    cooldown: between(state, .6, 2.8), boardingCooldown: 0, boardingCharge: 0, disabled: false, reward: 0,
    warzoneSpawnedAt: state.clock, warzoneNextDecision: 0, warzonePicket: picket, warzoneExitAt: null, targetId: null, targetVesselId: null, warzoneTargetKind: null,
    warzoneAim: { x: sector.x + sign * spread, y: sector.y }, warzoneSeparation: { x: 0, y: 0 }, warzoneLastHitAt: -1000 };
  if (picket) Object.assign(ship, { x: sign < 0 ? CROSSWIND_ARRIVAL.x + 150 : 1600, y: CROSSWIND_ARRIVAL.y - 200, warzoneLane: 2 });
  if (!initial) addEffect(state, { kind: 'warp-in', x: ship.x, y: ship.y, faction, size: source.stats.renderLength, duration: 2.2 });
  return ship;
}

const safeText = (value, max = 100) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').slice(0, max) : null;
function restoreShip(runtime, raw) {
  const state = runtime.warzone, match = typeof raw?.id === 'string' && /^crosswind:fleet:([a-z]+):(\d{1,10})$/.exec(raw.id);
  if (!match || !state.factions.includes(match[1]) || !PROFILE_BY_CLASS.has(raw.classId)) return null;
  const source = profile(raw.classId), serial = Number(match[2]); state.serial = Math.max(state.serial, serial);
  const style = WARZONE_FACTION_STYLE[match[1]], hp = clamp(finite(raw.hp, source.maxHp), 0, source.maxHp);
  if (hp <= 0) return null;
  const lane = clamp(Math.floor(finite(raw.warzoneLane)), 0, state.sectors.length - 1), sector = state.sectors[lane];
  return { id: raw.id, name: safeText(raw.name) || `${style.prefix} ${source.hull.name} ${serial}`, faction: match[1], warzone: true,
    warzoneSize: source.size, warzoneRole: source.role, warzoneLane: lane, ...enemyHullProfile(source.classId), classId: source.classId,
    x: clamp(finite(raw.x, sector.x), -7600, 7600), y: clamp(finite(raw.y, sector.y), -7600, 7600), vx: clamp(finite(raw.vx), -350, 350), vy: clamp(finite(raw.vy), -350, 350), angle: finite(raw.angle),
    hp, maxHp: source.maxHp, speed: source.speed, damage: source.damage, range: source.range, energy: clamp(finite(raw.energy, source.stats.maxEnergy), 0, source.stats.maxEnergy), maxEnergy: source.stats.maxEnergy,
    color: style.hull, factionColor: style.color, active: !raw.disabled, hostile: false, cooldown: clamp(finite(raw.cooldown), 0, 5), boardingCooldown: clamp(finite(raw.boardingCooldown), 0, 360), boardingCharge: 0,
    disabled: !!raw.disabled, reward: 0, warzoneSpawnedAt: Math.max(0, finite(raw.warzoneSpawnedAt)), warzoneNextDecision: 0, warzonePicket: !!raw.warzonePicket,
    warzoneExitAt: raw.warzoneExitAt === null ? null : clamp(finite(raw.warzoneExitAt, state.clock + 150), state.clock, state.clock + 180),
    targetId: null, targetVesselId: null, warzoneTargetKind: null, warzoneAim: { x: sector.x, y: sector.y }, warzoneSeparation: { x: 0, y: 0 }, warzoneLastHitAt: finite(raw.warzoneLastHitAt, -1000),
    ...(raw.damageControl && typeof raw.damageControl === 'object' ? { damageControl: clone(raw.damageControl) } : {}),
    ...(raw.deck && typeof raw.deck === 'object' ? { deck: clone(raw.deck) } : {}),
    ...Object.fromEntries(['capturedBy', 'promotedVesselId', 'canonicalVesselId', 'boardingTargetId', 'boardingOriginId'].filter(key => safeText(raw[key], 180)).map(key => [key, safeText(raw[key], 180)])),
    ...(raw.occupation && typeof raw.occupation === 'object' ? { occupation: clone(raw.occupation) } : {}) };
}

/** Install only in Crosswind. Saved empty rosters stay empty until their next wave. */
export function installWarzoneSpace(runtime, { seed = 'farwake', saved = null, elapsed = 0 } = {}) {
  if (!isWarzoneSystem(runtime)) return null;
  if (runtime.warzone?._installed === true) return runtime.warzone;
  const prior = saved?.version === WARZONE_SPACE_VERSION ? saved : null, factions = sideIds(runtime), clock = clamp(finite(prior?.clock), 0, 1e12);
  const state = { version: WARZONE_SPACE_VERSION, systemId: CROSSWIND_SYSTEM_ID, factions, clock, rng: Number.isInteger(prior?.rng) ? prior.rng >>> 0 : hash(`${seed}:crosswind:war-v1`), serial: Math.max(0, Math.floor(finite(prior?.serial))),
    phase: PHASES[prior?.phase] ? prior.phase : 'crossfire', nextPhaseAt: clamp(finite(prior?.nextPhaseAt, clock + 82), clock + .1, clock + 180), front: clamp(finite(prior?.front), -700, 700),
    nextDecisionAt: 0, nextBoardingAt: clamp(finite(prior?.nextBoardingAt, clock + 150), clock + .1, clock + 300), nextWaveAt: {}, waves: {}, casualties: {}, withdrawals: {}, projectiles: [], effects: [], recentLosses: [], sectors: sectorsFor(runtime),
    shotSerial: Math.max(0, Math.floor(finite(prior?.shotSerial))), effectSerial: Math.max(0, Math.floor(finite(prior?.effectSerial))) };
  Object.defineProperty(state, '_installed', { value: true }); runtime.warzone = state; runtime.warzoneFactions = factions;
  for (const faction of factions) {
    const nextWave = Number.isFinite(prior?.nextWaveAt?.[faction]) ? prior.nextWaveAt[faction] : clock + between(state, 36, 72);
    state.nextWaveAt[faction] = clamp(nextWave, clock + .1, clock + 120);
    for (const key of ['waves', 'casualties', 'withdrawals']) state[key][faction] = clamp(Math.floor(finite(prior?.[key]?.[faction])), 0, 1e9);
  }
  // Crosswind has a military population. Do not add ordinary Cinder raiders or
  // commute traffic, but preserve vessels already claimed by a captain.
  runtime.enemies = (runtime.enemies || []).filter(ship => !ship.warzone && (ship.capturedBy || ship.promotedVesselId || ship.canonicalVesselId));
  runtime.traffic = (runtime.traffic || []).filter(ship => ship.capturedBy || ship.promotedVesselId || ship.canonicalVesselId);
  if (prior) {
    const ids = new Set();
    for (const raw of (Array.isArray(prior.ships) ? prior.ships : []).slice(0, WARZONE_SPACE_LIMITS.ships)) {
      const ship = restoreShip(runtime, raw); if (!ship || ids.has(ship.id)) continue; ids.add(ship.id); runtime.enemies.push(ship);
    }
  } else for (const faction of factions) for (let i = 0; i < COMPOSITION.length; i++) runtime.enemies.push(makeShip(runtime, faction, COMPOSITION[i], { initial: true, slot: i, picket: i === 12 }));
  if (elapsed > 0) catchUpWarzoneSpace(runtime, elapsed);
  return state;
}

function addEffect(state, effect) {
  state.effects.push({ id: `crosswind:effect:${++state.effectSerial}`, at: state.clock, until: state.clock + (effect.duration || 1), ...effect });
  if (state.effects.length > WARZONE_SPACE_LIMITS.effects) state.effects.splice(0, state.effects.length - WARZONE_SPACE_LIMITS.effects);
}

/** Call before the ordinary bullet path removes a fleet hull killed by a player. */
export function notifyWarzoneDestroyed(runtime, ship, details = {}) {
  const state = runtime?.warzone;
  if (!state || !ship?.warzone || ship.warzoneDeathRecorded || !state.factions.includes(ship.faction) || state.recentLosses.includes(ship.id)) return false;
  ship.warzoneDeathRecorded = true;
  state.recentLosses.push(ship.id); state.recentLosses = state.recentLosses.slice(-WARZONE_SPACE_LIMITS.recentLosses);
  state.casualties[ship.faction]++; ship.hp = 0; ship.active = false;
  addEffect(state, { kind: 'explosion', x: ship.x, y: ship.y, size: ship.renderLength, faction: ship.faction, duration: ship.warzoneSize === 'massive' ? 2.7 : 1.3 });
  if (details.byPlayer) state.lastPlayerAction = { faction: ship.faction, at: state.clock, sourceId: safeText(details.sourceId, 100), kind: 'ship-destroyed' };
  return true;
}

/** Local damage evidence; declaring allegiance remains the captain authority's job. */
export function recordWarzoneAggression(runtime, participant, target) {
  if (!runtime?.warzone || !target?.warzone) return null;
  target.warzoneLastHitAt = runtime.warzone.clock;
  target.warzoneProvokedBy = safeText(typeof participant === 'string' ? participant : participantId(participant), 180);
  return { factionId: target.faction, targetId: target.id };
}

export function warzoneTargetLimit(ship = {}) {
  const mass = finite(ship.mass, getShipClass(ship.classId).stats.mass);
  return mass >= 30 ? 7 : mass >= 10 ? 5 : mass >= 4 ? 3 : 2;
}

function hostileTo(ship, participant) {
  return participant.hostileFactions?.includes(ship.faction) || validFaction(participant.factionId) && participant.factionId !== ship.faction;
}
function activeParticipants(participants) {
  const result = [], seen = new Set();
  for (const value of Array.isArray(participants) ? participants : []) {
    const id = participantId(value); if (!id || seen.has(id) || !value.ship || value.ship.hull <= 0 || value.ship.destroyed || value.targetEligible === false || !Number.isFinite(value.ship.x) || !Number.isFinite(value.ship.y)) continue;
    seen.add(id); result.push({ ...value, vesselId: id }); if (result.length === 20) break;
  }
  return result;
}

function chooseTargets(runtime, participants) {
  const state = runtime.warzone, ships = runtime.enemies.filter(combatant), claimed = new Map(), globalLimit = Math.max(1, Math.floor(ships.length * .28)); let playerAssignments = 0;
  // Rotating the start index prevents the first spawned wing monopolizing a captain.
  const offset = Math.floor(state.clock / WARZONE_SPACE_LIMITS.targetDecisionSeconds) % Math.max(1, ships.length);
  for (let index = 0; index < ships.length; index++) {
    const ship = ships[(index + offset) % ships.length], source = profile(ship.classId), sector = state.sectors[ship.warzoneLane], sign = state.factions.indexOf(ship.faction) ? 1 : -1;
    let target = null, best = Infinity;
    for (const other of ships) {
      if (other.faction === ship.faction) continue;
      const dist = distance(ship, other), lane = Math.abs(ship.warzoneLane - other.warzoneLane), value = dist + lane * 340 - (other.warzoneSize === 'massive' && ship.warzoneSize === 'massive' ? 200 : 0);
      if (value < best) { best = value; target = other; }
    }
    let player = null, playerScore = Infinity;
    if (playerAssignments < globalLimit) for (const person of participants) {
      if (!hostileTo(ship, person) || (claimed.get(person.vesselId) || 0) >= warzoneTargetLimit(person.ship)) continue;
      const dist = distance(ship, person.ship), mass = finite(person.ship.mass, getShipClass(person.ship.classId).stats.mass), reach = 820 + Math.min(700, Math.sqrt(Math.max(.5, mass)) * 110);
      if (dist > reach) continue;
      const score = dist / (1 + Math.min(1.5, Math.sqrt(Math.max(.5, mass)) * .2)) + 250;
      if (score < playerScore && (score < best * 1.05 || ship.warzoneProvokedBy === person.vesselId)) { playerScore = score; player = person; }
    }
    if (player) { ship.targetId = player.id; ship.targetVesselId = player.vesselId; ship.warzoneTargetKind = 'player'; claimed.set(player.vesselId, (claimed.get(player.vesselId) || 0) + 1); playerAssignments++; }
    else { ship.targetId = target?.id || null; ship.targetVesselId = target?.id || null; ship.warzoneTargetKind = target ? 'fleet' : null; }
    const retreat = ship.hp < ship.maxHp * .2 || state.phase === 'resupply-lull' && ['large', 'massive'].includes(ship.warzoneSize);
    const depth = retreat ? 2700 : source.standoff * .95 + (ship.warzoneSize === 'small' ? 230 : 80);
    ship.warzoneAim = { x: sector.x + state.front + sign * depth, y: sector.y + Math.sin(hash(ship.id) % 53) * 135 };
    ship.warzoneRetreating = retreat;
    let sx = 0, sy = 0;
    for (const other of ships) {
      if (other === ship) continue;
      const dx = ship.x - other.x, dy = ship.y - other.y, d = Math.hypot(dx, dy), clearance = ship.radius + other.radius + 75;
      if (d > 0 && d < clearance) { const force = (clearance - d) / clearance * 170; sx += dx / d * force; sy += dy / d * force; }
    }
    ship.warzoneSeparation = { x: sx, y: sy };
  }
  state.playerAssignments = playerAssignments;
}

function advancePhase(runtime, onEvent) {
  const state = runtime.warzone;
  if (state.clock < state.nextPhaseAt) return;
  const choices = Object.keys(PHASES).filter(id => id !== state.phase), own = runtime.enemies.filter(combatant);
  const west = own.filter(ship => ship.faction === state.factions[0]).length, east = own.length - west;
  state.phase = west < east * .6 ? 'eastern-push' : east < west * .6 ? 'western-push' : choices[Math.floor(random(state) * choices.length)];
  state.nextPhaseAt = state.clock + between(state, state.phase === 'resupply-lull' ? 36 : 62, state.phase === 'resupply-lull' ? 78 : 144);
  if (state.phase === 'counterattack') state.front = between(state, -350, 350);
  onEvent?.('warzone-phase', { systemId: CROSSWIND_SYSTEM_ID, phase: state.phase, text: PHASES[state.phase].label });
}

function advanceWaves(runtime, onEvent) {
  const state = runtime.warzone;
  for (const faction of state.factions) {
    if (state.clock < state.nextWaveAt[faction]) continue;
    const alive = runtime.enemies.filter(unit), count = alive.filter(ship => ship.faction === faction && !ship.capturedBy).length;
    const depleted = count < 20, lull = state.phase === 'resupply-lull';
    state.nextWaveAt[faction] = state.clock + between(state, depleted ? 16 : lull ? 45 : 26, depleted ? 36 : lull ? 95 : 62);
    const wanted = state.phase === 'resupply-lull' ? 25 : 29 + Math.floor(random(state) * 7), room = WARZONE_SPACE_LIMITS.ships - alive.length;
    const waveSize = Math.max(0, Math.min(room, wanted - count, (depleted ? 9 : 5) + Math.floor(random(state) * 7)));
    if (!waveSize) continue;
    const lane = Math.floor(random(state) * state.sectors.length), heavy = random(state) < .22; state.waves[faction]++;
    for (let i = 0; i < waveSize; i++) {
      const template = heavy && i === 0 ? COMPOSITION[24 + Math.floor(random(state) * 4)] : COMPOSITION[Math.floor(random(state) * 26)];
      runtime.enemies.push(makeShip(runtime, faction, template, { slot: i, lane }));
    }
    onEvent?.('warzone-reinforcement', { systemId: CROSSWIND_SYSTEM_ID, faction, count: waveSize, lane: state.sectors[lane].name, text: `${WARZONE_FACTION_STYLE[faction].short}: ${waveSize} fresh ships entering the ${state.sectors[lane].name.toLowerCase()}.` });
  }
}

function obstructed(runtime, from, to) {
  for (const body of runtime.bodies || []) if (body.kind === 'planet' && segmentDistance(body, from.x, from.y, to.x, to.y) < body.radius + 30) return true;
  return false;
}
function moveShip(runtime, ship, target, dt) {
  const state = runtime.warzone, source = profile(ship.classId), home = ship.warzoneAim || ship, retreat = ship.warzoneRetreating;
  let tx = home.x, ty = home.y;
  if (target && !retreat) {
    const dist = distance(ship, target), dx = dist > .01 ? (target.x - ship.x) / dist : 1, dy = dist > .01 ? (target.y - ship.y) / dist : 0;
    const hold = source.standoff * (state.phase === 'resupply-lull' ? 1.35 : 1), weight = ship.warzoneSize === 'massive' ? .3 : ship.warzoneSize === 'large' ? .56 : .85;
    const approachX = target.x - dx * hold, approachY = target.y - dy * hold;
    tx = home.x * (1 - weight) + approachX * weight; ty = home.y * (1 - weight) + approachY * weight;
    if (ship.warzoneSize === 'small' && dist < hold * 1.3) { const orbit = hash(ship.id) % 2 ? 1 : -1; tx += -dy * 180 * orbit; ty += dx * 180 * orbit; }
  }
  tx += ship.warzoneSeparation?.x || 0; ty += ship.warzoneSeparation?.y || 0;
  let dx = tx - ship.x, dy = ty - ship.y;
  for (const body of runtime.bodies || []) {
    const d = distance(ship, body), exclusion = finite(body.radius, 60) + ship.radius + (body.kind === 'planet' ? 165 : 70);
    if (d >= exclusion || d < .01) continue;
    dx += (ship.x - body.x) / d * (exclusion - d) * 7; dy += (ship.y - body.y) / d * (exclusion - d) * 7;
  }
  const aim = Math.atan2(dy, dx), turn = clamp(angleDelta(ship.angle, aim), -source.stats.maxAngularVelocity * .6 * dt, source.stats.maxAngularVelocity * .6 * dt);
  ship.angle += turn; ship.angularVelocity = dt ? turn / dt : 0;
  const remaining = Math.hypot(dx, dy), speed = source.speed * clamp(remaining / 160, .08, 1) * (state.phase === 'resupply-lull' && !retreat ? .8 : 1), acceleration = 1 - Math.exp(-dt * source.stats.thrustAcceleration / 80);
  ship.vx += (Math.cos(ship.angle) * speed - ship.vx) * acceleration; ship.vy += (Math.sin(ship.angle) * speed - ship.vy) * acceleration;
  ship.x += ship.vx * dt; ship.y += ship.vy * dt;
  // A navigation correction prevents heavy hulls from cutting through a planet
  // while their slower turn catches up. It never changes a player vessel.
  for (const body of runtime.bodies || []) {
    const min = finite(body.radius, 60) + ship.radius + 14, d = distance(ship, body);
    if (d >= min || d < .01) continue;
    const nx = (ship.x - body.x) / d, ny = (ship.y - body.y) / d; ship.x = body.x + nx * min; ship.y = body.y + ny * min;
    const inward = ship.vx * nx + ship.vy * ny; if (inward < 0) { ship.vx -= inward * nx; ship.vy -= inward * ny; }
  }
  ship.x = clamp(ship.x, -7600, 7600); ship.y = clamp(ship.y, -7600, 7600);
}

function fire(runtime, ship, target, kind) {
  const state = runtime.warzone, source = profile(ship.classId), phase = PHASES[state.phase];
  if (ship.cooldown > 0 || state.projectiles.length >= WARZONE_SPACE_LIMITS.projectiles || !target || distance(ship, target) > source.range || obstructed(runtime, ship, target)) return;
  const speed = ship.warzoneSize === 'massive' ? 590 : ship.warzoneSize === 'large' ? 520 : 440, dist = distance(ship, target), lead = Math.min(1.5, dist / speed) * .7;
  const aim = Math.atan2(target.y + finite(target.vy) * lead - ship.y, target.x + finite(target.vx) * lead - ship.x);
  if (Math.abs(angleDelta(ship.angle, aim)) > (['large', 'massive'].includes(ship.warzoneSize) ? Math.PI : .85)) return;
  const spread = (random(state) - .5) * (ship.warzoneSize === 'small' ? .12 : .065), angle = aim + spread, radius = ship.warzoneSize === 'massive' ? 6 : 3;
  const muzzle = Math.min(ship.radius + 8, ship.renderLength * .42), x = ship.x + Math.cos(angle) * muzzle, y = ship.y + Math.sin(angle) * muzzle;
  state.projectiles.push({ id: `crosswind:pulse:${++state.shotSerial}`, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl: source.range / speed + .15,
    damage: source.damage, radius, owner: ship.id, ownerId: ship.id, vesselId: ship.id, faction: ship.faction, color: WARZONE_FACTION_STYLE[ship.faction].color,
    targetId: ship.targetId, targetVesselId: ship.targetVesselId, targetKind: kind, warzone: true });
  ship.cooldown = between(state, ship.warzoneSize === 'small' ? 1.7 : 2.3, ship.warzoneSize === 'massive' ? 4.4 : 3.6) * phase.cadence;
  ship.lastShot = { until: state.clock + .16, angle }; ship.warzoneLastShotAt = state.clock;
}

function segmentDistance(point, x, y, endX, endY) {
  const dx = endX - x, dy = endY - y, length2 = dx * dx + dy * dy, t = length2 ? clamp(((point.x - x) * dx + (point.y - y) * dy) / length2, 0, 1) : 0;
  return Math.hypot(point.x - (x + dx * t), point.y - (y + dy * t));
}
function bucketsFor(ships, participants) {
  const buckets = new Map(), size = 420;
  const add = record => { const point = record.point, radius = finite(point.radius, 24) + 10;
    for (let x = Math.floor((point.x - radius) / size); x <= Math.floor((point.x + radius) / size); x++) for (let y = Math.floor((point.y - radius) / size); y <= Math.floor((point.y + radius) / size); y++) { const key = `${x}:${y}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(record); }
  };
  for (const ship of ships) add({ point: ship, ship }); for (const participant of participants) add({ point: participant.ship, participant });
  return { candidates(fromX, fromY, toX, toY) { const result = new Set(); for (let x = Math.floor(Math.min(fromX, toX) / size); x <= Math.floor(Math.max(fromX, toX) / size); x++) for (let y = Math.floor(Math.min(fromY, toY) / size); y <= Math.floor(Math.max(fromY, toY) / size); y++) for (const item of buckets.get(`${x}:${y}`) || []) result.add(item); return result; } };
}

function advanceProjectiles(runtime, dt, participants, options) {
  const state = runtime.warzone, buckets = bucketsFor(runtime.enemies.filter(unit), participants);
  for (const shot of state.projectiles) {
    const fromX = shot.x, fromY = shot.y, travel = Math.min(dt, Math.max(0, shot.ttl)); shot.x += shot.vx * travel; shot.y += shot.vy * travel; shot.ttl -= dt;
    if (!travel) continue;
    let first = null, nearest = Infinity;
    for (const record of buckets.candidates(fromX, fromY, shot.x, shot.y)) {
      if (record.ship && (record.ship.id === shot.ownerId || record.ship.faction === shot.faction || record.ship.capturedBy || record.ship.hp <= 0)) continue;
      // Friendly fleets do not shoot their own affiliated captains. A neutral
      // captain can still cross a real pulse's path without becoming its target.
      if (record.participant && (record.participant.ship.hull <= 0 || record.participant.factionId === shot.faction && !record.participant.hostileFactions?.includes(shot.faction))) continue;
      if (segmentDistance(record.point, fromX, fromY, shot.x, shot.y) > finite(record.point.radius, 24) + shot.radius) continue;
      const along = Math.hypot(record.point.x - fromX, record.point.y - fromY); if (along < nearest) { nearest = along; first = record; }
    }
    if (!first) continue; shot.ttl = 0;
    const details = { sourceId: shot.ownerId, sourceVesselId: shot.vesselId, faction: shot.faction, bullet: shot, x: first.point.x, y: first.point.y, warzone: true };
    if (first.participant) options.onPlayerHit?.(first.participant, shot.damage, details);
    else {
      const ship = first.ship, amount = Math.min(ship.hp, shot.damage); ship.hp = Math.max(0, ship.hp - amount); ship.warzoneLastHitAt = state.clock;
      options.onShipHit?.(ship, amount, details);
      if (ship.hp <= 0 && notifyWarzoneDestroyed(runtime, ship, { sourceId: shot.ownerId, sourceFaction: shot.faction })) options.onShipDestroyed?.(ship, details);
    }
    addEffect(state, { kind: 'impact', x: first.point.x, y: first.point.y, size: Math.min(90, first.point.radius || 24), faction: shot.faction, duration: .28 });
  }
  state.projectiles = state.projectiles.filter(shot => shot.ttl > 0).slice(-WARZONE_SPACE_LIMITS.projectiles);
}

function boardingPossible(ship, participant) {
  return combatant(ship) && participant.boardingEligible === true && !participant.boardingActive && !participant.pendingEncounter && !participant.parked && getShipClass(ship.classId).berths >= 3 && getShipClass(participant.ship.classId).berths >= 3 && hostileTo(ship, participant) && participant.ship.shield <= Math.max(4, finite(participant.ship.maxShield) * .2) && distance(ship, participant.ship) < 175 + finite(participant.ship.radius, 24) && !ship.boardingCooldown;
}
function advanceBoarding(runtime, participants, options) {
  const state = runtime.warzone;
  for (const ship of runtime.enemies) if (ship.warzoneBoarding) {
    const participant = participants.find(person => person.vesselId === ship.warzoneBoarding.vesselId);
    if (!participant || !boardingPossible(ship, participant)) { delete ship.warzoneBoarding; ship.boardingCharge = 0; continue; }
    ship.boardingCharge = Math.max(0, 4 - (ship.warzoneBoarding.until - state.clock));
    if (state.clock < ship.warzoneBoarding.until) continue;
    const result = options.onBoarding?.(ship, participant); ship.boardingCooldown = result === true || result?.ok ? 300 : 60; ship.boardingCharge = 0; delete ship.warzoneBoarding;
  }
  if (state.clock < state.nextBoardingAt || !options.onBoarding) return;
  state.nextBoardingAt = state.clock + between(state, 55, 125);
  // A grapple is a rare opportunity, not the default behavior of an exposed ship.
  if (random(state) >= .13) return;
  const possibilities = runtime.enemies.filter(combatant).flatMap(ship => participants.filter(participant => boardingPossible(ship, participant)).map(participant => ({ ship, participant })));
  if (!possibilities.length) return;
  const { ship, participant } = possibilities[Math.floor(random(state) * possibilities.length)];
  ship.warzoneBoarding = { vesselId: participant.vesselId, until: state.clock + 4 };
  options.onEvent?.('boarding-warning', { enemyId: ship.id, playerId: participant.id, vesselId: participant.vesselId, text: `${ship.name} is making a boarding run. Restore shields or boost clear of its grapples.` });
}

/** Movement stays smooth; expensive tactical selection runs only twice a second. */
export function stepWarzoneSpace(runtime, delta, options = {}) {
  const state = runtime?.warzone; if (!state?._installed || !isWarzoneSystem(runtime)) return null;
  const dt = clamp(finite(delta), 0, .25); if (!dt) return state;
  const participants = activeParticipants(options.participants); state.clock += dt;
  state.effects = state.effects.filter(effect => effect.until > state.clock);
  for (const ship of runtime.enemies) if (ship.warzone && ship.hp <= 0) notifyWarzoneDestroyed(runtime, ship);
  runtime.enemies = runtime.enemies.filter(ship => !ship.warzone || ship.hp > 0);
  advancePhase(runtime, options.onEvent); advanceWaves(runtime, options.onEvent);
  const desiredFront = PHASES[state.phase].shift; state.front += (desiredFront - state.front) * Math.min(1, dt * .025);
  if (state.clock >= state.nextDecisionAt) { chooseTargets(runtime, participants); state.nextDecisionAt = state.clock + WARZONE_SPACE_LIMITS.targetDecisionSeconds; }
  const ships = new Map(runtime.enemies.map(ship => [ship.id, ship])), people = new Map(participants.map(person => [person.vesselId, person]));
  for (const ship of runtime.enemies) {
    if (!unit(ship)) continue;
    ship.cooldown = Math.max(0, finite(ship.cooldown) - dt); ship.boardingCooldown = Math.max(0, finite(ship.boardingCooldown) - dt);
    if (!combatant(ship)) {
      ship.active = false; ship.vx = 0; ship.vy = 0;
      if (ship.disabled && !ship.capturedBy && !ship.boardingTargetId && !ship.deck?.occupation?.contested) {
        if (ship.warzoneExitAt === null) ship.warzoneExitAt = state.clock + between(state, 95, 170);
        if (state.clock >= ship.warzoneExitAt) { ship.warzoneWithdrawn = true; state.withdrawals[ship.faction]++; addEffect(state, { kind: 'warp-out', x: ship.x, y: ship.y, size: ship.renderLength, faction: ship.faction, duration: 1.5 }); }
      }
      continue;
    }
    ship.active = true;
    const participant = ship.warzoneTargetKind === 'player' ? people.get(ship.targetVesselId) : null;
    const candidate = participant?.ship || ships.get(ship.targetId), target = candidate && (participant ? hostileTo(ship, participant) : combatant(candidate) && candidate.faction !== ship.faction) ? candidate : null;
    moveShip(runtime, ship, target, dt);
    if (ship.hp < ship.maxHp * .2 && distance(ship, ship.warzoneAim) < 200 && state.clock - ship.warzoneLastHitAt > 8) { ship.warzoneWithdrawn = true; state.withdrawals[ship.faction]++; addEffect(state, { kind: 'warp-out', x: ship.x, y: ship.y, size: ship.renderLength, faction: ship.faction, duration: 1.5 }); continue; }
    fire(runtime, ship, target, participant ? 'player' : 'fleet');
  }
  advanceProjectiles(runtime, dt, participants, options); advanceBoarding(runtime, participants, options);
  runtime.enemies = runtime.enemies.filter(ship => !ship.warzone || ship.hp > 0 && !ship.warzoneWithdrawn);
  return state;
}

/** Empty-room catchup is bounded and never has player ships as targets. */
export function catchUpWarzoneSpace(runtime, elapsed) {
  const seconds = clamp(finite(elapsed), 0, WARZONE_SPACE_LIMITS.catchUpSeconds), steps = Math.ceil(seconds / .1);
  for (let i = 0; i < steps; i++) stepWarzoneSpace(runtime, Math.min(.1, seconds - i * .1));
  return runtime?.warzone;
}

export function captureWarzoneSpace(runtime) {
  const state = runtime?.warzone; if (!state?._installed) return null;
  const fields = ['id', 'name', 'faction', 'classId', 'warzoneLane', 'x', 'y', 'vx', 'vy', 'angle', 'hp', 'energy', 'cooldown', 'boardingCooldown', 'disabled', 'warzoneSpawnedAt', 'warzonePicket', 'warzoneExitAt', 'warzoneLastHitAt', 'damageControl', 'deck', 'capturedBy', 'promotedVesselId', 'canonicalVesselId', 'boardingTargetId', 'boardingOriginId', 'occupation'];
  return { version: WARZONE_SPACE_VERSION, clock: state.clock, rng: state.rng, serial: state.serial, shotSerial: state.shotSerial, effectSerial: state.effectSerial, phase: state.phase, nextPhaseAt: state.nextPhaseAt, front: state.front, nextWaveAt: { ...state.nextWaveAt }, nextBoardingAt: state.nextBoardingAt,
    waves: { ...state.waves }, casualties: { ...state.casualties }, withdrawals: { ...state.withdrawals },
    ships: runtime.enemies.filter(ship => ship.warzone && ship.hp > 0 && !ship.warzoneWithdrawn).slice(0, WARZONE_SPACE_LIMITS.ships).map(ship => Object.fromEntries(fields.filter(key => ship[key] !== undefined).map(key => [key, clone(ship[key])])))};
}

/** Public room data contains current observations, never future rolls or schedules. */
export function warzoneSpaceView(runtime, viewer = {}) {
  const state = runtime?.warzone; if (!state) return null;
  const ships = (runtime.enemies || []).filter(unit), factionId = typeof viewer === 'string' ? viewer : viewer.factionId || null;
  return { version: WARZONE_SPACE_VERSION, systemId: CROSSWIND_SYSTEM_ID, clock: state.clock, phase: state.phase, phaseLabel: PHASES[state.phase]?.label || 'Fleet action', intensity: PHASES[state.phase]?.intensity || .7,
    viewerFaction: state.factions.includes(factionId) ? factionId : null, hostileFactions: (Array.isArray(viewer.hostileFactions) ? viewer.hostileFactions : []).filter(id => state.factions.includes(id)),
    factions: state.factions.map(id => ({ id, name: WARZONE_FACTION_STYLE[id].name, short: WARZONE_FACTION_STYLE[id].short, color: WARZONE_FACTION_STYLE[id].color,
      ships: ships.filter(ship => ship.faction === id && !ship.capturedBy).length, fighting: ships.filter(ship => ship.faction === id && combatant(ship)).length, casualties: state.casualties[id], withdrawals: state.withdrawals[id] })),
    sectors: state.sectors.map(sector => ({ ...sector, x: sector.x + state.front })),
    projectiles: state.projectiles.map(({ id, x, y, vx, vy, ttl, radius, color, faction, ownerId, targetVesselId }) => ({ id, x, y, vx, vy, ttl, radius, color, faction, ownerId, targetVesselId })),
    effects: state.effects.map(({ id, kind, x, y, size, faction, at, until }) => ({ id, kind, x, y, size, faction, at, until })) };
}
