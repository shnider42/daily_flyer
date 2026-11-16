/** Shared sidearm aim and wall tracing. No UI or authority state is changed here. */
import { cabinLayout, isCabinWalkable } from './interior-layouts.mjs';
import { canSeeConcealedActor } from './site-visibility.mjs';

export const SIDEARM = Object.freeze({
  id: 'pulse-sidearm', name: 'Pulse sidearm', range: 172, damage: 24,
  cooldown: .32, shotDuration: .22, targetRadius: 9, armorPiercing: 0, cost: 0, requiredJobs: 0, requiredSystems: 0,
  description: 'Standard airlock safety kit. Its cell recharges between pulses.'
});
export const PERSONAL_WEAPONS = Object.freeze([
  SIDEARM,
  ...[
    {id:'union-service-rifle',name:'Union M4 service rifle',factionId:'freewake',serviceAssignments:0,range:242,damage:29,cooldown:.23,armorPiercing:6,color:'#a9dfc1',profile:'rifle',description:'Freewake standard issue. A quick, steady infantry rifle for moving between cover.'},
    {id:'union-support-repeater',name:'Union Bastion repeater',factionId:'freewake',serviceAssignments:2,range:220,damage:19,cooldown:.115,armorPiercing:2,color:'#86d8ab',profile:'support',falloff:.35,description:'Rapid sustained fire. Excellent up close; its light pulses lose 35% of their force at maximum range.'},
    {id:'union-longwatch',name:'Union Longwatch rifle',factionId:'freewake',serviceAssignments:5,range:375,damage:68,cooldown:.95,armorPiercing:16,color:'#b5d6ff',profile:'marksman',description:'Long-range overwatch with armor penetration. A missed shot leaves a long recharge window.'},
    {id:'combine-service-rifle',name:'Combine Vektor rifle',factionId:'meridian',serviceAssignments:0,range:258,damage:39,cooldown:.34,armorPiercing:9,color:'#e9bd8d',profile:'rifle',description:'Meridian standard issue. Slower, harder-hitting pulses penetrate light infantry armor.'},
    {id:'combine-storm',name:'Combine Storm repeater',factionId:'meridian',serviceAssignments:2,range:205,damage:26,cooldown:.17,armorPiercing:5,color:'#efac75',profile:'support',falloff:.3,description:'Close assault support. Heavy rapid pulses give up range and distant stopping power.'},
    {id:'combine-lance',name:'Combine Lance rifle',factionId:'meridian',serviceAssignments:5,range:340,damage:86,cooldown:1.25,armorPiercing:28,color:'#e8b6ed',profile:'marksman',description:'An anti-armor precision rifle. High penetration, deliberate aim, and a long charge between shots.'}
  ].map(weapon=>Object.freeze({shotDuration:weapon.profile==='marksman'?.3:.18,targetRadius:9,cost:0,requiredJobs:0,requiredSystems:0,...weapon})),
  Object.freeze({ id: 'field-carbine', name: 'Field carbine', range: 210, damage: 38, cooldown: .36, shotDuration: .22, targetRadius: 9, armorPiercing: 5,
    cost: 1400, requiredJobs: 6, requiredSystems: 3, description: 'A longer-reaching field weapon with a reinforced pulse cell. Its steady fire cuts through light protection.' }),
  Object.freeze({ id: 'breach-rifle', name: 'Breach rifle', range: 230, damage: 72, cooldown: .65, shotDuration: .26, targetRadius: 9, armorPiercing: 20,
    cost: 4200, requiredJobs: 18, requiredSystems: 8, description: 'A heavy, armor-piercing pulse for hardened targets. Powerful shots take longer to recharge; aim for a clear opening.' })
]);
export const personalWeaponById = id => weapons.get(id) || SIDEARM;
const weapons = new Map(PERSONAL_WEAPONS.map(weapon => [weapon.id, weapon]));
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
/** Ownership belongs to this person; borrowed hulls and NPC crews grant no gear. */
export function getPersonalWeapon(person) {
  return Array.isArray(person?.ownedWeapons) && person.ownedWeapons.includes(person.weapon) ? weapons.get(person.weapon) || SIDEARM : SIDEARM;
}
export function personalWeaponDamage(person, target, modifier = 1) {
  const weapon = getPersonalWeapon(person), armor = Math.max(0, finite(target?.armor));
  const distance=target&&Number.isFinite(target.x)&&Number.isFinite(target.y)?Math.hypot(target.x-finite(person.x),target.y-finite(person.y)):0;
  const falloff=1-(weapon.falloff||0)*Math.min(1,distance/weapon.range);
  return Math.max(1, weapon.damage * falloff * Math.max(0, finite(modifier, 1)) - Math.max(0, armor - weapon.armorPiercing));
}
export function ensureSidearm(person) {
  person.ownedWeapons = [...new Set([SIDEARM.id, ...(Array.isArray(person.ownedWeapons) ? person.ownedWeapons.filter(id => weapons.has(id)) : [])])];
  person.weapon = getPersonalWeapon(person).id;
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
  const weapon = getPersonalWeapon(person), range = weapon.range;
  const aimX = clamp(finite(input.aimX), -1, 1), aimY = clamp(finite(input.aimY), -1, 1);
  const manual = input.aiming === true && Math.hypot(aimX, aimY) > .05;
  const live = enemies.filter(enemy => enemy && enemy.health > 0 && Number.isFinite(enemy.x) && Number.isFinite(enemy.y) && canSeeConcealedActor(layout, from, enemy));
  const assisted = !manual ? live.filter(enemy => Math.hypot(enemy.x - from.x, enemy.y - from.y) <= range && clearSidearmSight(layout, from, enemy))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y) || String(a.id).localeCompare(String(b.id)))[0] : null;
  const angle = manual ? Math.atan2(aimY, aimX) : assisted ? Math.atan2(assisted.y - from.y, assisted.x - from.x) : facingAngle(person?.facing);
  const wall = wallTrace(layout, from, angle, range), vx = Math.cos(angle), vy = Math.sin(angle);
  const hits = live.map(target => {
    const dx = target.x - from.x, dy = target.y - from.y, along = dx * vx + dy * vy, cross = Math.abs(dx * vy - dy * vx);
    const radius = clamp(finite(target.hitRadius, weapon.targetRadius), 1, 64);
    return { target, along, cross, radius, entry: along - Math.sqrt(Math.max(0, radius * radius - cross * cross)) };
  }).filter(hit => hit.along >= 0 && hit.along <= range && hit.cross <= hit.radius && hit.entry <= wall.distance && clearSidearmSight(layout, from, hit.target))
    .sort((a, b) => a.entry - b.entry || String(a.target.id).localeCompare(String(b.target.id)));
  const target = hits[0]?.target || null, to = target ? { x: target.x, y: target.y } : wall.point;
  return { angle, manual, targetId: target?.id || null, target, from, to, x: from.x, y: from.y, targetX: to.x, targetY: to.y,
    blocked: !target && wall.blocked, hit: !!target, range, weaponId: weapon.id };
}
