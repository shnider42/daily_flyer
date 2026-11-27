// Bounded AI-operated armor. Public vehicle poses live in s.vehicles; routes,
// target selection and weapon timers live only in the private s.armorControl.
import { getMovementSolids, getSolidWalls } from './building-geometry.mjs';
import { missionLayoutDefinition } from './mission-layouts.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const standing = actor => actor?.alive && !actor.downed;
const activeHull = vehicle => vehicle && vehicle.collidable !== false && ['tank', 'apc', 'truck'].includes(vehicle.kind);
const shapes = {
  tank: { hullLength: 94, hullWidth: 56, maxHp: 420, speed: 43, armored: true },
  apc: { hullLength: 82, hullWidth: 44, maxHp: 260, speed: 49, armored: true },
  truck: { hullLength: 76, hullWidth: 40, maxHp: 180, speed: 55, armored: false },
};
export const ARMOR_LIMITS = Object.freeze({ maxIndependent: 2, cannonRange: 820, mgRange: 580, repairDuration: 6, repairRange: 112 });

function localPoint(vehicle, point) {
  const dx = point.x - vehicle.x, dy = point.y - vehicle.y, angle = vehicle.angle || 0;
  return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
}
function dimensions(vehicle) {
  const shape = shapes[vehicle.kind] || shapes.truck;
  return { length: vehicle.hullLength || shape.hullLength, width: vehicle.hullWidth || shape.hullWidth };
}
function segmentBoxEntry(a, b, box, padding = 0) {
  let low = 0, high = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x + padding], [dx, box.x + box.w + padding - a.x], [-dy, a.y - box.y + padding], [dy, box.y + box.h + padding - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return Infinity; }
    else { const t = q / p; if (p < 0) low = Math.max(low, t); else high = Math.min(high, t); if (low > high) return Infinity; }
  }
  return low;
}

/** Conservative world-space AABB of the oriented physical hull, suitable for
 * render culling. Segment/point helpers below test the actual oriented hull. */
export function vehicleHull(vehicle) {
  const { length, width } = dimensions(vehicle), angle = vehicle.angle || 0;
  const w = Math.abs(Math.cos(angle)) * length + Math.abs(Math.sin(angle)) * width;
  const h = Math.abs(Math.sin(angle)) * length + Math.abs(Math.cos(angle)) * width;
  return { x: vehicle.x - w / 2, y: vehicle.y - h / 2, w, h, vehicleId: vehicle.id, material: 'metal', kind: 'vehicle-hull' };
}

export function segmentVehicleEntry(vehicle, from, to, padding = 0) {
  if (!activeHull(vehicle)) return Infinity;
  const { length, width } = dimensions(vehicle);
  return segmentBoxEntry(localPoint(vehicle, from), localPoint(vehicle, to), { x: -length / 2, y: -width / 2, w: length, h: width }, padding);
}

export function pointBlockedByVehicle(state, x, y, radius = 13, ignoreId = null) {
  const point = { x, y };
  return (state.vehicles || []).some(vehicle => vehicle.id !== ignoreId && activeHull(vehicle) && segmentVehicleEntry(vehicle, point, point, radius) === 0);
}

/** A firing/visibility ray originating inside its own hull may leave it. Other
 * hulls, including wrecks, still block the ray. The optional id is explicit. */
export function vehiclesBlockLine(state, from, to, ignoreId = null) {
  return (state.vehicles || []).some(vehicle => vehicle.id !== ignoreId && activeHull(vehicle) &&
    segmentVehicleEntry(vehicle, from, from) !== 0 && Number.isFinite(segmentVehicleEntry(vehicle, from, to)));
}

/** Convoy identity is captured before independent armor is added. Never infer
 * followers from positions in the heterogeneous vehicles array. */
export function convoyVehicles(state) {
  return (state.convoyVehicleIds || []).map(id => (state.vehicles || []).find(vehicle => vehicle.id === id)).filter(Boolean);
}
export function convoyLead(state) { return convoyVehicles(state)[0] || null; }
export function findArmoredVehicle(state, id) { return (state.vehicles || []).find(vehicle => vehicle.id === id || vehicle.armorKey === id) || null; }

function normalizeVehicle(vehicle) {
  if (!activeHull(vehicle)) return;
  const shape = shapes[vehicle.kind];
  vehicle.team ||= 'ally'; vehicle.name ||= vehicle.kind === 'truck' ? 'Transport' : 'Escort carrier';
  vehicle.hullLength ||= shape.hullLength; vehicle.hullWidth ||= shape.hullWidth;
  vehicle.w = vehicle.hullLength; vehicle.h = vehicle.hullWidth;
  vehicle.armored = shape.armored; vehicle.maxHp ||= vehicle.hp > 0 ? Math.max(vehicle.hp, shape.maxHp) : shape.maxHp;
  vehicle.hp = Number.isFinite(vehicle.hp) ? Math.max(0, vehicle.hp) : vehicle.maxHp;
  vehicle.maxMobility ||= 100; vehicle.mobility = vehicle.disabled ? 0 : Number.isFinite(vehicle.mobility) ? vehicle.mobility : vehicle.maxMobility;
  vehicle.disabled = vehicle.mobility <= 0; vehicle.wreck = vehicle.hp <= 0; vehicle.destroyed = vehicle.wreck;
  vehicle.turretAngle = Number.isFinite(vehicle.turretAngle) ? vehicle.turretAngle : vehicle.angle || 0;
  vehicle.ammo ||= { cannon: 0, mg: vehicle.kind === 'apc' ? 72 : 0 };
  vehicle.preparing = false; vehicle.preparingUntil = 0; vehicle.holdPosition ||= false;
  vehicle.repairProgress = 0; vehicle.repairLocked ||= false;
  vehicle.visible = vehicle.team !== 'enemy';
}

function controller(vehicle, definition = {}) {
  return { vehicleId: vehicle.id, route: (definition.route || []).map(point => ({ ...point })), routeIndex: 0,
    loop: !!definition.loop, active: definition.active !== false, locked: definition.active === false,
    convoy: !!definition.convoy, targetId: null, targetType: null, planIn: .2 + (vehicle.id % 5) * .07,
    cannonIn: vehicle.team === 'enemy' ? 7 : 4, mgIn: 1.2, warmup: 0, burst: 0,
    speed: shapes[vehicle.kind]?.speed || 45 };
}

export function initializeArmoredVehicles(state) {
  state.vehicles ||= [];
  // Idempotent initialization is useful for old replays/hydration, without
  // copying hidden controllers into client prediction state.
  if (state.armorControl?.version === 1) return;
  state.convoyVehicleIds ||= state.convoyRoute ? state.vehicles.filter(vehicle => activeHull(vehicle) && !vehicle.armorKey).map(vehicle => vehicle.id) : [];
  state.armorControl = { version: 1, units: [] };
  for (const vehicle of state.vehicles) {
    normalizeVehicle(vehicle);
    if (vehicle.kind === 'apc' && !vehicle.wreck) state.armorControl.units.push(controller(vehicle, { convoy: state.convoyVehicleIds.includes(vehicle.id), active: true }));
  }
  const definitions = missionLayoutDefinition(state.missionIndex)?.armor || [];
  for (const definition of definitions.slice(0, ARMOR_LIMITS.maxIndependent)) {
    const vehicle = { id: ++state.nextId, kind: definition.kind, armorKey: definition.key, name: definition.name,
      team: definition.team, x: definition.x, y: definition.y, angle: definition.angle || 0,
      disabled: !!definition.disabled, active: definition.active !== false, hp: shapes[definition.kind].maxHp,
      ammo: { cannon: definition.cannonAmmo || 0, mg: definition.mgAmmo || 0 }, convoy: !!definition.convoy };
    normalizeVehicle(vehicle); state.vehicles.push(vehicle);
    const control = controller(vehicle, definition);
    vehicle.repairLocked = control.locked;
    state.armorControl.units.push(control);
    if (definition.convoy) {
      state.convoyVehicleIds.push(vehicle.id);
      state.convoyRoute = definition.route.map(point => ({ ...point }));
      state.convoyIndex = 0; state.convoyClear = 0; state.convoyCleared = [];
    }
  }
}

// Exact separating-axis overlap between an oriented vehicle and a world AABB.
function hullOverlapsRect(vehicle, obstacle, padding = 0) {
  const { length, width } = dimensions(vehicle), angle = vehicle.angle || 0;
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: Math.cos(angle), y: Math.sin(angle) }, { x: -Math.sin(angle), y: Math.cos(angle) }];
  const delta = { x: obstacle.x + obstacle.w / 2 - vehicle.x, y: obstacle.y + obstacle.h / 2 - vehicle.y };
  const along = axes[2], across = axes[3];
  return axes.every(axis => {
    const vehicleRadius = Math.abs(axis.x * along.x + axis.y * along.y) * (length / 2 + padding) + Math.abs(axis.x * across.x + axis.y * across.y) * (width / 2 + padding);
    const obstacleRadius = Math.abs(axis.x) * obstacle.w / 2 + Math.abs(axis.y) * obstacle.h / 2;
    return Math.abs(delta.x * axis.x + delta.y * axis.y) < vehicleRadius + obstacleRadius;
  });
}

// Both vehicles can be turning. Testing the other's enclosing AABB invents
// solid corners and can stop two non-touching carriers forever at a junction.
function hullOverlapsHull(vehicle, other, padding = 0) {
  const a = dimensions(vehicle), b = dimensions(other), angleA = vehicle.angle || 0, angleB = other.angle || 0;
  const alongA = { x: Math.cos(angleA), y: Math.sin(angleA) }, acrossA = { x: -alongA.y, y: alongA.x };
  const alongB = { x: Math.cos(angleB), y: Math.sin(angleB) }, acrossB = { x: -alongB.y, y: alongB.x };
  const dx = other.x - vehicle.x, dy = other.y - vehicle.y;
  const dot = (axis, basis) => Math.abs(axis.x * basis.x + axis.y * basis.y);
  return [alongA, acrossA, alongB, acrossB].every(axis => {
    const radiusA = dot(axis, alongA) * (a.length / 2 + padding) + dot(axis, acrossA) * (a.width / 2 + padding);
    const radiusB = dot(axis, alongB) * b.length / 2 + dot(axis, acrossB) * b.width / 2;
    return Math.abs(dx * axis.x + dy * axis.y) < radiusA + radiusB;
  });
}

/** Use for convoy movement too. The caller supplies the proposed pose; this
 * checks hull geometry, other hulls and all living people, including casualties. */
export function vehiclePoseClear(state, vehicle, pose) {
  const proposed = { ...vehicle, ...pose }, bounds = vehicleHull(proposed);
  if (bounds.x < 4 || bounds.y < 4 || bounds.x + bounds.w > state.world.width - 4 || bounds.y + bounds.h > state.world.height - 4) return false;
  if (getMovementSolids(state.world).some(obstacle => hullOverlapsRect(proposed, obstacle, 3))) return false;
  for (const other of state.vehicles || []) if (other.id !== vehicle.id && activeHull(other) && hullOverlapsHull(proposed, other, 5)) return false;
  for (const actor of [...(state.squad || []), ...(state.allies || []), ...(state.enemies || []), ...(state.civilians || []), ...(state.survivors || [])]) {
    // Use the same physical radius as infantry collision. Extra invisible
    // padding here would deadlock a carrier beside a legally standing escort.
    if (actor.alive && segmentVehicleEntry(proposed, actor, actor, actor.radius || 13) === 0) return false;
  }
  return true;
}

function moveAlongRoute(state, vehicle, control, dt) {
  if (control.convoy || !control.active || control.locked || vehicle.holdPosition || vehicle.disabled || vehicle.wreck || !control.route.length) return;
  let target = control.route[control.routeIndex];
  if (distance(vehicle, target) < 5) {
    if (control.routeIndex + 1 < control.route.length) control.routeIndex++;
    else if (control.loop) control.routeIndex = 0;
    else { control.active = false; vehicle.active = false; vehicle.moving = false; return; }
    target = control.route[control.routeIndex];
  }
  moveVehicleToward(state, vehicle, target, control.speed, dt);
}

/** Shared route/convoy movement. Advances in short physical steps, turns only
 * when its hull fits, and yields to people; never teleports or crushes actors. */
export function moveVehicleToward(state, vehicle, target, speed, dt) {
  if (!activeHull(vehicle) || vehicle.disabled || vehicle.wreck || vehicle.holdPosition || !target || !Number.isFinite(dt) || dt <= 0) {
    if (vehicle) vehicle.moving = false; return false;
  }
  const before = { x: vehicle.x, y: vehicle.y };
  const desired = Math.atan2(target.y - vehicle.y, target.x - vehicle.x);
  const turn = clamp(angleDelta(vehicle.angle || 0, desired), -.72 * dt, .72 * dt);
  const pose = { x: vehicle.x, y: vehicle.y, angle: (vehicle.angle || 0) + turn };
  if (vehiclePoseClear(state, vehicle, pose)) vehicle.angle = pose.angle;
  if (Math.abs(angleDelta(vehicle.angle, desired)) > .18) { vehicle.moving = false; return false; }
  const travel = Math.min(distance(vehicle, target), Math.max(0, speed) * dt), steps = Math.max(1, Math.ceil(travel / 4));
  vehicle.moving = false;
  for (let index = 0; index < steps; index++) {
    const next = { x: vehicle.x + Math.cos(desired) * travel / steps, y: vehicle.y + Math.sin(desired) * travel / steps, angle: vehicle.angle };
    if (!vehiclePoseClear(state, vehicle, next)) break;
    vehicle.x = next.x; vehicle.y = next.y; vehicle.moving = true;
  }
  return distance(before, vehicle) > .001;
}

function muzzle(vehicle, angle = vehicle.turretAngle, weapon = 'tank-cannon') {
  const { length, width } = dimensions(vehicle), relative = angle - (vehicle.angle || 0);
  const edge = Math.min(length / 2 / Math.max(.00001, Math.abs(Math.cos(relative))), width / 2 / Math.max(.00001, Math.abs(Math.sin(relative))));
  const reach = weapon === 'vehicle-mg' ? edge + 5 : length / 2 + 15;
  return { x: vehicle.x + Math.cos(angle) * reach, y: vehicle.y + Math.sin(angle) * reach };
}
function visibleTarget(state, vehicle, target, hooks) {
  const angle = Math.atan2(target.y - vehicle.y, target.x - vehicle.x), start = muzzle(vehicle, angle);
  let end = target;
  if (activeHull(target)) {
    const entry = segmentVehicleEntry(target, start, target), length = Math.max(1, distance(start, target));
    if (Number.isFinite(entry)) end = { x: start.x + (target.x - start.x) * Math.max(0, entry - 3 / length), y: start.y + (target.y - start.y) * Math.max(0, entry - 3 / length) };
  }
  // Include the path to the muzzle: a barrel close to a wall must not spawn a
  // round through the wall simply because its drawn tip extends beyond it.
  return !getSolidWalls(state.world).some(obstacle => Number.isFinite(segmentBoxEntry(vehicle, end, obstacle))) &&
    !vehiclesBlockLine(state, vehicle, end, vehicle.id) && (!hooks.combatLOS || hooks.combatLOS(state, vehicle, end));
}
function opposingActors(state, vehicle) { return vehicle.team === 'enemy' ? [...(state.squad || []), ...(state.allies || [])] : state.enemies || []; }
function selectTarget(state, vehicle, hooks) {
  const candidates = [...opposingActors(state, vehicle).filter(standing), ...(state.vehicles || []).filter(other => activeHull(other) && !other.wreck && other.hp > 0 && (other.team === 'enemy') !== (vehicle.team === 'enemy'))];
  const range = vehicle.ammo.cannon > 0 ? ARMOR_LIMITS.cannonRange : ARMOR_LIMITS.mgRange;
  return candidates.filter(target => distance(vehicle, target) <= range && visibleTarget(state, vehicle, target, hooks))
    .sort((a, b) => distance(vehicle, a) - distance(vehicle, b) + (activeHull(a) ? -140 : 0) - (activeHull(b) ? -140 : 0))[0] || null;
}
function safeCannonTarget(state, vehicle, target) {
  if (distance(vehicle, target) < 190) return false;
  const friendly = vehicle.team === 'enemy' ? state.enemies || [] : [...(state.squad || []), ...(state.allies || []), ...(state.survivors || [])];
  return ![...friendly, ...(state.civilians || [])].some(actor => actor.alive && distance(actor, target) < 150) &&
    !(state.vehicles || []).some(other => other !== vehicle && other.team === vehicle.team && !other.wreck && distance(other, target) < 165);
}

/** Fire hook contract: fire(state, vehicle, target, {weapon,x,y,angle,speed,
 * damage,range,blastRadius}). It must create a real projectile in the common
 * combat pipeline; the controller never applies remote target damage. */
export function updateArmoredVehicles(state, dt, hooks = {}) {
  if (!state.armorControl || !Number.isFinite(dt) || dt <= 0) return;
  for (const control of state.armorControl.units) {
    const vehicle = findArmoredVehicle(state, control.vehicleId);
    if (!vehicle || vehicle.wreck || vehicle.hp <= 0) continue;
    moveAlongRoute(state, vehicle, control, dt);
    control.cannonIn = Math.max(0, control.cannonIn - dt); control.mgIn = Math.max(0, control.mgIn - dt); control.planIn -= dt;
    if (control.planIn <= 0) {
      const target = selectTarget(state, vehicle, hooks);
      control.targetId = target?.id ?? null; control.targetType = target && activeHull(target) ? 'vehicle' : 'actor';
      control.planIn = .42 + (vehicle.id % 4) * .04;
    }
    const target = control.targetType === 'vehicle' ? findArmoredVehicle(state, control.targetId) : opposingActors(state, vehicle).find(actor => actor.id === control.targetId && standing(actor));
    if (!target || target.wreck || !visibleTarget(state, vehicle, target, hooks)) { control.warmup = 0; vehicle.preparing = false; continue; }
    const desired = Math.atan2(target.y - vehicle.y, target.x - vehicle.x);
    vehicle.turretAngle += clamp(angleDelta(vehicle.turretAngle, desired), -1.05 * dt, 1.05 * dt);
    if (Math.abs(angleDelta(vehicle.turretAngle, desired)) > .12) { control.warmup = 0; vehicle.preparing = false; continue; }
    const cannon = vehicle.ammo.cannon > 0 && control.cannonIn <= 0 && safeCannonTarget(state, vehicle, target);
    if (cannon) {
      const warmup = vehicle.team === 'enemy' ? 1.35 : .85;
      control.warmup += dt; vehicle.preparing = true; vehicle.preparingUntil = state.time + Math.max(0, warmup - control.warmup);
      if (control.warmup < warmup) continue;
      const origin = muzzle(vehicle); vehicle.ammo.cannon--; vehicle.shotAt = state.time; vehicle.lastWeapon = 'tank-cannon'; vehicle.preparing = false;
      control.cannonIn = vehicle.team === 'enemy' ? 10 : 8; control.warmup = 0;
      hooks.fire?.(state, vehicle, target, { weapon: 'tank-cannon', ...origin, angle: vehicle.turretAngle, speed: 1150, damage: 145, range: 1100, blastRadius: 112 });
    } else if (vehicle.ammo.mg > 0 && control.mgIn <= 0 && distance(vehicle, target) <= ARMOR_LIMITS.mgRange && !activeHull(target)) {
      const origin = muzzle(vehicle, vehicle.turretAngle, 'vehicle-mg'); vehicle.ammo.mg--; vehicle.shotAt = state.time; vehicle.lastWeapon = 'vehicle-mg';
      control.burst = (control.burst + 1) % 4; control.mgIn = control.burst ? .15 : 2.2;
      hooks.fire?.(state, vehicle, target, { weapon: 'vehicle-mg', ...origin, angle: vehicle.turretAngle, speed: 900, damage: vehicle.team === 'enemy' ? 12 : 18, range: 850, blastRadius: 0 });
    } else { control.warmup = 0; vehicle.preparing = false; }
  }
}

/** Physical hull hit. The caller still emits its normal metal impact. Small
 * arms cannot chip a tank to death; explosive hits can damage tracks. */
export function damageVehicle(state, vehicle, hit = {}) {
  const rejected = { accepted: false, damage: 0, mobilityDamage: 0, disabled: !!vehicle?.disabled, destroyed: !!vehicle?.wreck };
  if (!activeHull(vehicle) || vehicle.wreck || vehicle.hp <= 0 || !Number.isFinite(hit.damage) || hit.damage <= 0) return rejected;
  const kind = hit.kind || (hit.weapon === '40mm' ? '40mm' : hit.weapon === 'tank-cannon' ? 'cannon' : 'bullet');
  const factors = vehicle.armored ? { bullet: vehicle.kind === 'tank' ? 0 : .025, fragment: .04, '40mm': .48, cannon: 1, demolition: 1.3 } : { bullet: .45, fragment: .55, '40mm': .9, cannon: 1.2, demolition: 1.3 };
  const factor = factors[kind]; if (factor === undefined) return rejected;
  const damage = Math.max(0, hit.damage * factor);
  const mobilityDamage = ['40mm', 'cannon', 'demolition'].includes(kind) ? hit.damage * (kind === '40mm' ? .75 : .55) : kind === 'fragment' ? hit.damage * .08 : 0;
  vehicle.hp = Math.max(0, vehicle.hp - damage); vehicle.mobility = Math.max(0, vehicle.mobility - mobilityDamage);
  vehicle.disabled = vehicle.mobility <= 0; vehicle.wreck = vehicle.hp <= 0; vehicle.destroyed = vehicle.wreck;
  vehicle.lastHitAt = state.time; vehicle.preparing = false;
  if (vehicle.disabled || vehicle.wreck) vehicle.moving = false;
  if (vehicle.wreck) { vehicle.disabled = true; vehicle.mobility = 0; vehicle.active = false; }
  return { accepted: true, damage, mobilityDamage, disabled: vehicle.disabled, destroyed: vehicle.wreck };
}

export function vehicleRepairTarget(state, actor) {
  if (!standing(actor)) return null;
  const vehicle = (state.vehicles || []).filter(item => activeHull(item) && item.team !== 'enemy' && item.disabled && !item.wreck && !item.repairLocked && distance(actor, item) <= ARMOR_LIMITS.repairRange)
    .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
  if (!vehicle) return null;
  // The interaction location stays on the actor's side, beyond the hull.
  const { length, width } = dimensions(vehicle);
  const angle = Math.atan2(actor.y - vehicle.y, actor.x - vehicle.x), reach = Math.hypot(length, width) / 2 + 20;
  return { id: vehicle.id, vehicleId: vehicle.id, x: vehicle.x + Math.cos(angle) * reach, y: vehicle.y + Math.sin(angle) * reach,
    label: `Repair ${vehicle.name.toLowerCase()}`, duration: ARMOR_LIMITS.repairDuration, radius: ARMOR_LIMITS.repairRange, available: true };
}

export function repairVehicle(state, id) {
  const vehicle = findArmoredVehicle(state, id);
  if (!vehicle || vehicle.wreck || vehicle.team === 'enemy' || !activeHull(vehicle)) return false;
  vehicle.mobility = vehicle.maxMobility || 100; vehicle.disabled = false;
  // Repairs restore mobility, not an inexhaustible pool of armor hit points.
  vehicle.repairedAt = state.time; vehicle.repairProgress = 0;
  return true;
}

export function releaseVehicle(state, id) {
  const vehicle = findArmoredVehicle(state, id), control = state.armorControl?.units.find(unit => unit.vehicleId === vehicle?.id);
  if (!vehicle || !control || vehicle.wreck) return false;
  control.locked = false; control.active = true; vehicle.active = true; vehicle.holdPosition = false; vehicle.repairLocked = false;
  return true;
}

export function issueArmorOrder(state, order, id = null) {
  if (!['hold', 'advance'].includes(order)) return false;
  let changed = false;
  for (const control of state.armorControl?.units || []) {
    const vehicle = findArmoredVehicle(state, control.vehicleId);
    if (!vehicle || vehicle.team === 'enemy' || vehicle.wreck || id !== null && vehicle.id !== id && vehicle.armorKey !== id) continue;
    if (order === 'advance' && control.locked) continue;
    vehicle.holdPosition = order === 'hold'; control.active = order === 'advance'; vehicle.active = control.active; changed = true;
  }
  return changed;
}

/** Explicit network whitelist. Visibility is decided by the caller; no routes,
 * targets, search timers or other armorControl fields can leak through it. */
export function publicVehicleView(vehicle) {
  const view = {};
  for (const key of ['id', 'kind', 'armorKey', 'name', 'team', 'x', 'y', 'angle', 'turretAngle', 'hp', 'maxHp', 'mobility', 'maxMobility',
    'disabled', 'wreck', 'destroyed', 'armored', 'hullLength', 'hullWidth', 'w', 'h', 'collidable', 'active', 'convoy', 'holdPosition', 'moving', 'visible',
    'waiting', 'preparing', 'preparingUntil', 'shotAt', 'lastWeapon', 'muzzleUntil', 'lastHitAt', 'repairedAt', 'repairProgress', 'repairLocked']) if (vehicle[key] !== undefined) view[key] = vehicle[key];
  if (vehicle.ammo) view.ammo = { cannon: vehicle.ammo.cannon, mg: vehicle.ammo.mg };
  return view;
}
