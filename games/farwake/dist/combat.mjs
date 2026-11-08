/** Shared sidearm aim and wall tracing. No UI or authority state is changed here. */
import { cabinLayout, isCabinWalkable } from './interior-layouts.mjs';

export const SIDEARM = Object.freeze({
  id: 'pulse-sidearm', name: 'Pulse sidearm', range: 172, damage: 24,
  cooldown: .32, shotDuration: .22, targetRadius: 9,
  description: 'Standard airlock safety kit. Its cell recharges between pulses.'
});
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const layouts = new Map();
const resolveLayout = value => {
  if (value?.walkable) return value;
  const key = typeof value === 'string' ? value : value?.shipClass || value?.classId || 'sparrow';
  if (!layouts.has(key)) layouts.set(key, cabinLayout(key));
  return layouts.get(key);
};
export const facingAngle = facing => ({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[facing] ?? -Math.PI / 2);
export function ensureSidearm(person) {
  person.weapon = SIDEARM.id;
  if (!Number.isFinite(person.aimAngle)) person.aimAngle = facingAngle(person.facing);
  return person;
}
export function clearSidearmSight(layoutOrClass, from, to) {
  const layout = resolveLayout(layoutOrClass), length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / 3));
  for (let i = 1; i < steps; i++) if (!isCabinWalkable(layout, from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, 1)) return false;
  return true;
}
function wallTrace(layout, from, angle, range) {
  const vx = Math.cos(angle), vy = Math.sin(angle);
  let end = { ...from };
  for (let step = 2; step <= range + 2; step += 2) {
    const distance = Math.min(step, range), point = { x: from.x + vx * distance, y: from.y + vy * distance };
    if (!isCabinWalkable(layout, point.x, point.y, 1)) return { point: end, distance: Math.max(0, distance - 2), blocked: true };
    end = point;
  }
  return { point: end, distance: range, blocked: false };
}

/** The reticle and authoritative shot use exactly the same target/occlusion rule. */
export function sidearmAim(person, enemies = [], input = {}, layoutOrClass = 'sparrow') {
  const layout = resolveLayout(layoutOrClass), from = { x: finite(person?.x), y: finite(person?.y) };
  const range = SIDEARM.range;
  const aimX = clamp(finite(input.aimX), -1, 1), aimY = clamp(finite(input.aimY), -1, 1);
  const manual = input.aiming === true && Math.hypot(aimX, aimY) > .05;
  const live = enemies.filter(enemy => enemy && enemy.health > 0 && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
  const assisted = !manual ? live.filter(enemy => Math.hypot(enemy.x - from.x, enemy.y - from.y) <= range && clearSidearmSight(layout, from, enemy))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y) || String(a.id).localeCompare(String(b.id)))[0] : null;
  const angle = manual ? Math.atan2(aimY, aimX) : assisted ? Math.atan2(assisted.y - from.y, assisted.x - from.x) : facingAngle(person?.facing);
  const wall = wallTrace(layout, from, angle, range), vx = Math.cos(angle), vy = Math.sin(angle);
  const hits = live.map(target => {
    const dx = target.x - from.x, dy = target.y - from.y, along = dx * vx + dy * vy, cross = Math.abs(dx * vy - dy * vx);
    const radius = SIDEARM.targetRadius;
    return { target, along, cross, entry: along - Math.sqrt(Math.max(0, radius * radius - cross * cross)) };
  }).filter(hit => hit.along >= 0 && hit.along <= range && hit.cross <= SIDEARM.targetRadius && hit.entry <= wall.distance && clearSidearmSight(layout, from, hit.target))
    .sort((a, b) => a.entry - b.entry || String(a.target.id).localeCompare(String(b.target.id)));
  const target = hits[0]?.target || null, to = target ? { x: target.x, y: target.y } : wall.point;
  return { angle, manual, targetId: target?.id || null, target, from, to, x: from.x, y: from.y, targetX: to.x, targetY: to.y,
    blocked: !target && wall.blocked, hit: !!target, range, weaponId: SIDEARM.id };
}
