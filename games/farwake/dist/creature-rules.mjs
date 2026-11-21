/** Shared, deterministic wildlife combat. Rendering never advances these phases. */
import { creatureProfile } from './creature-catalog.mjs';
import { clearSidearmSight } from './combat.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';
import { canSeeConcealedActor } from './site-visibility.mjs';

const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const point = target => target.person || target;
const living = target => point(target).health > 0 && !point(target).down && point(target).status !== 'dead';
const angleDifference = (one, two) => Math.atan2(Math.sin(one - two), Math.cos(one - two));
const ids = values => [...new Set((Array.isArray(values) ? values : []).filter(id => typeof id === 'string' && id.length <= 160))].slice(0, 32);
const common = { armor: 0, range: 30, fireDelay: 1.3, windupDuration: .65, recoveryDuration: .55, attackKind: 'melee',
  attackShape: 'cone', attackReach: 36, attackRadius: 0, attackInnerRadius: 0, attackWidth: 12, attackArc: 1.1, attackSpread: 0,
  strikeDuration: 0, chargeSpeed: 0, preferredRange: 0, sightRange: 300 };

/** Numerical defaults are separate from ecology and never assign hostility. */
export const CREATURE_COMBAT = Object.freeze(Object.fromEntries(Object.entries({
  stoneback: { health: 96, speed: 42, damage: 16, range: 30, windupDuration: .55, recoveryDuration: .25, fireDelay: 1.15, attackReach: 36, attackArc: 1.15 },
  skitter: { health: 48, speed: 94, damage: 6, range: 26, windupDuration: .38, recoveryDuration: .48, fireDelay: 1.25, attackReach: 30, attackArc: .8 },
  reedstalker: { health: 70, speed: 78, damage: 13, range: 85, windupDuration: .65, recoveryDuration: .75, fireDelay: 1.6, attackShape: 'lunge', attackReach: 100, attackWidth: 12, chargeSpeed: 190 },
  'mire-spitter': { health: 68, speed: 47, damage: 12, range: 200, windupDuration: .85, recoveryDuration: .45, fireDelay: 2.2, attackKind: 'ranged', attackShape: 'line', attackReach: 200, attackWidth: 12, preferredRange: 140 },
  shardling: { health: 56, speed: 58, damage: 8, range: 165, windupDuration: .9, recoveryDuration: .65, fireDelay: 2.1, attackKind: 'ranged', attackShape: 'fan', attackReach: 165, attackWidth: 7, attackSpread: .32, preferredRange: 115 },
  sporeback: { health: 120, speed: 29, damage: 13, range: 74, windupDuration: 1.05, recoveryDuration: .5, fireDelay: 3.3, attackShape: 'cloud', attackRadius: 76, attackReach: 76, strikeDuration: 1.7 },
  glassmaw: { health: 114, speed: 65, damage: 21, range: 80, windupDuration: .85, recoveryDuration: 1.05, fireDelay: 1.8, attackShape: 'line', attackReach: 88, attackWidth: 15 },
  'ember-mite': { health: 34, speed: 82, damage: 22, range: 44, windupDuration: 1.2, recoveryDuration: 0, fireDelay: 3, attackShape: 'burst', attackRadius: 58, attackReach: 58 },
  rimehorn: { health: 148, speed: 49, damage: 25, armor: 4, range: 185, windupDuration: 1.05, recoveryDuration: 1.45, fireDelay: 2.4, attackShape: 'lunge', attackReach: 240, attackWidth: 17, chargeSpeed: 245 },
  tidebell: { health: 78, speed: 54, damage: 15, range: 112, windupDuration: 1.05, recoveryDuration: .6, fireDelay: 2.5, attackShape: 'ring', attackRadius: 116, attackInnerRadius: 36, attackReach: 116, preferredRange: 88 },
  coilworm: { health: 100, speed: 40, damage: 19, range: 105, windupDuration: .95, recoveryDuration: 1.1, fireDelay: 2.2, attackShape: 'lunge', attackReach: 120, attackWidth: 13, chargeSpeed: 205 },
  'kiln-crab': { health: 130, speed: 50, damage: 17, armor: 2, range: 46, windupDuration: .75, recoveryDuration: .9, fireDelay: 1.7, attackShape: 'cone', attackReach: 54, attackArc: 1.6 },
  veilwing: { health: 72, speed: 83, damage: 15, range: 135, windupDuration: .7, recoveryDuration: 1.5, fireDelay: 2.3, attackShape: 'lunge', attackReach: 165, attackWidth: 11, chargeSpeed: 250 },
  'root-snare': { health: 94, speed: 0, damage: 18, range: 122, windupDuration: 1, recoveryDuration: .65, fireDelay: 2.2, attackShape: 'burst', attackRadius: 29, attackReach: 122 }
}).map(([id, profile]) => [id, Object.freeze({ ...common, ...profile })])));

export const usesCreatureRules = unit => !!unit && Object.hasOwn(CREATURE_COMBAT, unit.species) && unit.attackKind !== 'none' && !unit.trainingTarget;
const statLimits = { health: [1, 5000], maxHealth: [1, 5000], speed: [0, 400], damage: [0, 150], armor: [0, 100], range: [8, 400],
  fireDelay: [.2, 8], windupDuration: [.25, 4], recoveryDuration: [.1, 4], sightRange: [48, 600], preferredRange: [0, 350] };

/** Authored numerical difficulty overrides defaults; identity/disposition stay authored. */
export function configureCreature(base, explicit = {}) {
  const profile = creatureProfile(base?.species), combat = CREATURE_COMBAT[base?.species];
  if (!profile || !combat || base.trainingTarget || base.attackKind === 'none') return base;
  const configured = { ...base, ...combat, creatureBehavior: profile.behavior, creatureVersion: 1,
    color: base.color || profile.color, maxHealth: combat.health, phase: 'idle', recovery: 0, strikeRemaining: 0, chargeRemaining: 0,
    attackHitIds: [], burstRemaining: 0, attackX: finite(base.x), attackY: finite(base.y), attackTargetX: finite(base.x), attackTargetY: finite(base.y), aimAngle: 0 };
  for (const [key, [low, high]] of Object.entries(statLimits)) if (Number.isFinite(explicit[key])) configured[key] = clamp(explicit[key], low, high);
  if (Number.isFinite(explicit.health) && !Number.isFinite(explicit.maxHealth)) configured.maxHealth = configured.health;
  configured.health = Math.min(configured.health, configured.maxHealth);
  // Harmless presentation actors and mission-owned posture are never armed by a species default.
  if (base.attackKind === 'none') configured.attackKind = 'none';
  if (base.stationary === true) configured.stationary = true;
  if (base.species === 'root-snare') configured.stationary = true;
  return configured;
}

export function interruptCreature(unit, recovery = 0) {
  if (!usesCreatureRules(unit)) return;
  Object.assign(unit, { phase: unit.health <= 0 ? 'dead' : recovery > 0 ? 'recovery' : 'idle', windup: 0, recovery,
    strikeRemaining: 0, chargeRemaining: 0, attackHitIds: [], burstRemaining: 0, attackUntil: 0, moving: false });
}

/** Saved attacks retain their locked direction and already-hit set, never their stats. */
export function restoreCreatureState(base, raw = {}, time = 0) {
  if (!usesCreatureRules(base)) return base;
  const result = { ...base }, active = raw.creatureVersion === 1 && raw.creatureBehavior === base.creatureBehavior;
  if (!active || base.health <= 0 || base.pacified || base.quietEarthDormant) { interruptCreature(result); return result; }
  const phases = ['idle', 'windup', 'strike', 'recovery'];
  result.phase = phases.includes(raw.phase) ? raw.phase : 'idle';
  result.aimAngle = angleDifference(finite(raw.aimAngle), 0);
  result.aimTargetId = typeof raw.aimTargetId === 'string' ? raw.aimTargetId.slice(0, 160) : null;
  result.windup = result.phase === 'windup' ? clamp(finite(raw.windup), .01, base.windupDuration) : 0;
  result.recovery = result.phase === 'recovery' ? clamp(finite(raw.recovery), 0, base.recoveryDuration) : 0;
  result.strikeRemaining = result.phase === 'strike' && base.attackShape === 'cloud' ? clamp(finite(raw.strikeRemaining), 0, base.strikeDuration) : 0;
  result.chargeRemaining = result.phase === 'strike' && base.attackShape === 'lunge' ? clamp(finite(raw.chargeRemaining), 0, base.attackReach) : 0;
  result.attackHitIds = result.phase === 'strike' ? ids(raw.attackHitIds) : [];
  result.burstRemaining = base.species === 'skitter' ? clamp(Math.floor(finite(raw.burstRemaining)), 0, 1) : 0;
  // A charging body can be at most one reach from its original attack position.
  const ox = finite(raw.attackX, base.x), oy = finite(raw.attackY, base.y), offset = Math.hypot(ox - base.x, oy - base.y);
  result.attackX = result.phase === 'strike' && offset <= base.attackReach + 8 ? ox : base.x;
  result.attackY = result.phase === 'strike' && offset <= base.attackReach + 8 ? oy : base.y;
  const reach = clamp(Math.hypot(finite(raw.attackTargetX, base.x) - result.attackX, finite(raw.attackTargetY, base.y) - result.attackY), 0, base.attackReach);
  result.attackTargetX = result.attackX + Math.cos(result.aimAngle) * reach;
  result.attackTargetY = result.attackY + Math.sin(result.aimAngle) * reach;
  result.attackUntil = time + (result.windup || result.strikeRemaining || result.chargeRemaining / Math.max(1, base.chargeSpeed));
  result.moving = false;
  if (result.phase === 'strike' && !result.strikeRemaining && !result.chargeRemaining) interruptCreature(result, base.recoveryDuration);
  return result;
}

/** Armor has an observable facing/opening; it never makes a hit completely immune. */
export function creatureDamageTaken(unit, attacker, damage) {
  if (!(damage > 0) || !usesCreatureRules(unit)) return damage;
  if (unit.species === 'veilwing' && unit.phase === 'recovery') return damage * 1.3;
  if (unit.species !== 'kiln-crab' && !(unit.species === 'stoneback' && unit.phase === 'windup')) return damage;
  if (unit.phase === 'recovery') return damage;
  const front = Math.abs(angleDifference(Math.atan2(attacker.y - unit.y, attacker.x - unit.x), finite(unit.aimAngle))) < Math.PI * .36;
  return Math.max(1, damage * (front ? unit.species === 'kiln-crab' ? .45 : .65 : 1));
}

function turn(unit, target) {
  const dx = target.x - unit.x, dy = target.y - unit.y;
  unit.facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down';
}

/** Narrow rays stop on the first solid tile; charges separately test their whole body. */
function rayEnd(layout, from, angle, reach) {
  let to = { x: from.x, y: from.y };
  for (let distance = Math.min(3, reach); distance <= reach + 3; distance += 3) {
    const d = Math.min(distance, reach), next = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d };
    if (!isCabinWalkable(layout, next.x, next.y, 1)) return { to, reach: Math.hypot(to.x - from.x, to.y - from.y), blocked: true };
    to = next; if (d === reach) break;
  }
  return { to, reach, blocked: false };
}

function beginAttack(unit, target, layout, time, followup = false) {
  const person = point(target);
  if (!followup) {
    unit.aimAngle = Math.atan2(person.y - unit.y, person.x - unit.x);
    unit.aimTargetId = target.id; unit.attackX = unit.x; unit.attackY = unit.y;
    let reach = unit.attackReach;
    if (unit.species === 'root-snare') reach = Math.min(reach, Math.hypot(person.x - unit.x, person.y - unit.y));
    if (unit.species === 'coilworm') reach = Math.min(reach, Math.hypot(person.x - unit.x, person.y - unit.y) + 12);
    const end = rayEnd(layout, unit, unit.aimAngle, reach);
    unit.attackTargetX = end.to.x; unit.attackTargetY = end.to.y;
    unit.burstRemaining = unit.species === 'skitter' ? 1 : 0;
  }
  unit.phase = 'windup'; unit.windup = followup ? .26 : unit.windupDuration;
  unit.attackUntil = time + unit.windup; unit.attackHitIds = []; unit.moving = false; turn(unit, person);
}

function recover(unit) {
  unit.phase = 'recovery'; unit.recovery = unit.recoveryDuration; unit.cooldown = unit.fireDelay;
  unit.windup = 0; unit.strikeRemaining = 0; unit.chargeRemaining = 0; unit.attackUntil = 0; unit.moving = false;
}

function damageTarget(state, unit, target, event, shot) {
  if (!living(target) || unit.attackHitIds.includes(target.id)) return;
  unit.attackHitIds.push(target.id); unit.attackHitIds = unit.attackHitIds.slice(-32);
  const person = point(target), armor = target.person ? 0 : finite(person.armor) * .5;
  const damage = creatureDamageTaken(person, unit, Math.max(1, unit.damage - armor)) * (target.person ? clamp(finite(target.damageTakenMultiplier, 1), .4, 2) : 1);
  person.health = Math.max(0, person.health - damage); person.hitUntil = state.time + .24;
  if (!target.person) { person.lastHitBy = unit.id; person.alert = true; }
  const impact = { ...shot, id: `${shot.id}:hit:${target.id}`, damage, hit: true, targetId: target.id, targetName: target.name || 'Captain',
    x: person.x, y: person.y, to: { x: person.x, y: person.y }, health: person.health, maxHealth: person.maxHealth || 100 };
  event('person-hit', impact);
  if (person.health <= 0) {
    person.down = true; person.status = 'dead'; person.windup = 0; person.moving = false; interruptCreature(person);
    event(target.person ? 'person-down' : 'boarder-down', { ...impact, id: `${shot.id}:down:${target.id}`, actorId: target.id, text: `${unit.name} brought down ${target.name || 'a captain'}.` });
  }
}

function shotRecord(state, unit, to, suffix = '') {
  const from = { x: unit.x, y: unit.y };
  return { id: `${state.id}:creature:${++state.shotSerial}${suffix}`, team: unit.team || 'hostile', factionId: unit.factionId || null,
    attackerId: unit.id, actorName: unit.name, weaponId: unit.species === 'mire-spitter' ? 'acid-spit' : unit.species === 'shardling' ? 'shard-fan' : 'wildlife-claws',
    angle: unit.aimAngle, from, to, x: from.x, y: from.y, targetX: to.x, targetY: to.y, intendedTargetId: unit.aimTargetId,
    targetId: null, hit: false, damage: 0, blocked: false, until: state.time + .26 };
}

function strikeLines(state, unit, targets, layout, event) {
  const spread = unit.attackShape === 'fan' ? [-unit.attackSpread, 0, unit.attackSpread] : [0];
  for (const offset of spread) {
    const angle = unit.aimAngle + offset, ray = rayEnd(layout, unit, angle, unit.attackReach), hits = [];
    for (const target of targets) {
      const person = point(target), dx = person.x - unit.x, dy = person.y - unit.y;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle), cross = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
      if (along >= 0 && along <= ray.reach + 5 && cross <= unit.attackWidth && clearSidearmSight(layout, unit, person)) hits.push({ target, along });
    }
    hits.sort((a, b) => a.along - b.along || String(a.target.id).localeCompare(String(b.target.id)));
    const target = hits[0]?.target, to = target ? { x: point(target).x, y: point(target).y } : ray.to;
    const shot = { ...shotRecord(state, unit, to), angle, targetId: target?.id || null, hit: !!target, damage: target ? unit.damage : 0, blocked: !target && ray.blocked };
    unit.lastShot = shot;
    if (unit.attackKind === 'ranged') event('person-shot', shot);
    if (target) damageTarget(state, unit, target, event, shot);
  }
}

function strikeArea(state, unit, targets, layout, event) {
  const center = unit.species === 'root-snare' ? { x: unit.attackTargetX, y: unit.attackTargetY } : { x: unit.attackX, y: unit.attackY };
  for (const target of targets) {
    if (unit.attackHitIds.includes(target.id)) continue;
    const person = point(target), dx = person.x - center.x, dy = person.y - center.y, distance = Math.hypot(dx, dy);
    const inside = unit.attackShape === 'cone' ? distance <= unit.attackReach && Math.abs(angleDifference(Math.atan2(dy, dx), unit.aimAngle)) <= unit.attackArc :
      distance <= unit.attackRadius && distance >= unit.attackInnerRadius;
    if (!inside || !clearSidearmSight(layout, center, person) || !clearSidearmSight(layout, unit, person)) continue;
    const shot = shotRecord(state, unit, { x: person.x, y: person.y });
    damageTarget(state, unit, target, event, shot);
  }
}

function chargeHits(state, unit, targets, from, to, layout, event) {
  const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
  for (const target of targets) {
    if (unit.attackHitIds.includes(target.id)) continue;
    const person = point(target), t = length2 ? clamp(((person.x - from.x) * dx + (person.y - from.y) * dy) / length2, 0, 1) : 0;
    if (Math.hypot(person.x - from.x - dx * t, person.y - from.y - dy * t) > unit.attackWidth || !clearSidearmSight(layout, unit, person)) continue;
    damageTarget(state, unit, target, event, shotRecord(state, unit, { x: person.x, y: person.y }));
  }
}

function stepCharge(state, unit, targets, delta, layout, event) {
  let travel = Math.min(unit.chargeRemaining, unit.chargeSpeed * delta);
  chargeHits(state, unit, targets, unit, unit, layout, event);
  while (travel > 1e-7) {
    const stride = Math.min(4, travel), next = { x: unit.x + Math.cos(unit.aimAngle) * stride, y: unit.y + Math.sin(unit.aimAngle) * stride };
    if (!isCabinWalkable(layout, next.x, next.y, 6)) { recover(unit); return; }
    const from = { x: unit.x, y: unit.y }; unit.x = next.x; unit.y = next.y;
    travel -= stride; unit.chargeRemaining = Math.max(0, unit.chargeRemaining - stride);
    chargeHits(state, unit, targets, from, next, layout, event);
  }
  unit.moving = true;
  if (unit.chargeRemaining <= 1e-7) recover(unit);
}

function moveToward(unit, target, delta, layout, at, walk, visible) {
  if (unit.stationary || unit.species === 'root-snare') { unit.moving = false; return; }
  const person = point(target), dx = person.x - unit.x, dy = person.y - unit.y, distance = Math.max(1, Math.hypot(dx, dy));
  const side = (unit.formationIndex || 0) % 2 ? -1 : 1;
  let destination = person;
  if (visible && unit.preferredRange && distance < unit.preferredRange * .72) destination = { x: unit.x - dx / distance * 54, y: unit.y - dy / distance * 54 };
  else if (unit.species === 'reedstalker' && distance > 65) destination = { x: person.x - dy / distance * side * 64, y: person.y + dx / distance * side * 64 };
  else if (unit.species === 'veilwing' && visible && distance < 220) destination = { x: person.x - dx / distance * 85 - dy / distance * side * 60, y: person.y - dy / distance * 85 + dx / distance * side * 60 };
  else if (unit.species === 'kiln-crab' && visible && distance < 130) destination = { x: person.x - dy / distance * side * 40, y: person.y + dx / distance * side * 40 };
  if (!isCabinWalkable(layout, destination.x, destination.y, 6)) destination = person;
  walk(unit, destination, delta, layout, at); unit.aimAngle = Math.atan2(dy, dx);
  if (unit.species === 'kiln-crab') turn(unit, person);
}

function chooseTarget(unit, targets, layout) {
  let nearest = null, nearestDistance = Infinity, seen = null, seenDistance = Infinity;
  for (const target of targets) {
    const person = point(target), distance = Math.hypot(person.x - unit.x, person.y - unit.y);
    if (distance < nearestDistance) { nearest = target; nearestDistance = distance; }
    if (distance >= seenDistance || !unit.alert && distance > unit.sightRange) continue;
    if (clearSidearmSight(layout, unit, person) && (target.person ? canSeeConcealedActor(layout, person, unit) : canSeeConcealedActor(layout, unit, person))) {
      seen = target; seenDistance = distance;
    }
  }
  return { target: seen || nearest, visible: !!seen, distance: seen ? seenDistance : nearestDistance };
}

/** Targets are already hostility-filtered by the caller; no faction rules are inferred here. */
export function stepCreatureEncounter(state, unit, candidates, delta, layout, event, walk) {
  const dt = clamp(finite(delta), 0, .25), at = state.time;
  if (!dt || unit.health <= 0 || unit.pacified || unit.hidden || unit.quietEarthDormant) { interruptCreature(unit); return; }
  const targets = candidates.filter(living), { target, visible, distance } = chooseTarget(unit, targets, layout);
  unit.cooldown = Math.max(0, finite(unit.cooldown) - dt);
  if (!target) {
    interruptCreature(unit); unit.targetId = null;
    if (unit.hostileToPlayer === false && !unit.stationary && unit.species !== 'root-snare') {
      const offsets = [[30, 0], [0, 24], [-30, 0], [0, -24]], offset = offsets[(Math.floor(at / 4) + (unit.formationIndex || 0)) % 4];
      const destination = { x: finite(unit.originX, unit.x) + offset[0], y: finite(unit.originY, unit.y) + offset[1] };
      if (isCabinWalkable(layout, destination.x, destination.y, 6)) walk(unit, destination, dt, layout, at);
    }
    return;
  }
  const person = point(target);
  unit.targetId = target.id;
  if (!unit.alert && (!visible || distance > unit.sightRange)) { unit.moving = false; return; }
  unit.alert = true;
  if (unit.phase === 'strike') {
    if (unit.attackShape === 'lunge') stepCharge(state, unit, targets, dt, layout, event);
    else if (unit.attackShape === 'cloud') { strikeArea(state, unit, targets, layout, event); unit.strikeRemaining = Math.max(0, unit.strikeRemaining - dt); if (!unit.strikeRemaining) recover(unit); }
    else recover(unit);
    return;
  }
  if (unit.phase === 'recovery') {
    unit.moving = false; unit.recovery = Math.max(0, unit.recovery - dt);
    if (!unit.recovery) unit.phase = 'idle';
    return;
  }
  if (unit.windup > 0) {
    unit.phase = 'windup'; unit.windup = Math.max(0, unit.windup - dt); unit.moving = false;
    if (unit.windup > 0) return;
    if (unit.attackShape === 'lunge') {
      unit.phase = 'strike'; unit.chargeRemaining = Math.min(unit.attackReach, Math.hypot(unit.attackTargetX - unit.attackX, unit.attackTargetY - unit.attackY));
      unit.attackUntil = at + unit.chargeRemaining / unit.chargeSpeed; stepCharge(state, unit, targets, dt, layout, event); return;
    }
    if (unit.attackShape === 'line' || unit.attackShape === 'fan') strikeLines(state, unit, targets, layout, event);
    else strikeArea(state, unit, targets, layout, event);
    if (unit.species === 'ember-mite') {
      unit.health = 0; unit.status = 'dead'; interruptCreature(unit);
      event('boarder-down', { ...shotRecord(state, unit, { x: unit.x, y: unit.y }), actorId: unit.id, targetId: unit.id, health: 0, text: `${unit.name} burns out.` }); return;
    }
    if (unit.attackShape === 'cloud') { unit.phase = 'strike'; unit.strikeRemaining = unit.strikeDuration; unit.attackUntil = at + unit.strikeDuration; return; }
    if (unit.burstRemaining > 0) { unit.burstRemaining--; beginAttack(unit, target, layout, at, true); return; }
    recover(unit); return;
  }
  if (visible && distance <= unit.range && unit.cooldown === 0) { beginAttack(unit, target, layout, at); return; }
  if (distance > unit.range || !visible || unit.preferredRange || unit.species === 'veilwing' || unit.species === 'kiln-crab') moveToward(unit, target, dt, layout, at, walk, visible);
  else { unit.moving = false; unit.aimAngle = Math.atan2(person.y - unit.y, person.x - unit.x); turn(unit, person); }
}
