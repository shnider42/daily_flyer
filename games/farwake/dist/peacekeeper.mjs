/** One physical watch ship. Patrol geometry never enters a network snapshot. */
import { getShipClass, enemyHullProfile } from './fleet.mjs';
import { LEGACY_WORLD_RADIUS } from './system-space.mjs';

export const PEACEKEEPER_ID = 'hearth:peacekeeper:resolute';
export const PEACEKEEPER_SYSTEM = 'hearth';
export const PEACEKEEPER_FACTION = 'freewake';
export const PEACEKEEPER_HAIL_DISTANCE = 165;

const TAU = Math.PI * 2;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const wrap = (n, period) => ((n % period) + period) % period;
const hash = text => { let n = 2166136261; for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; };
export const isPeacekeeper = contact => contact?.id === PEACEKEEPER_ID && contact.peacekeeper === true;

/** Distance from a ship to the contact's visible footprint, rather than its centre. */
export function trafficHailDistance(contact, ship) {
  const angle = finite(contact?.angle), dx = finite(ship?.x) - finite(contact?.x), dy = finite(ship?.y) - finite(contact?.y);
  const along = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));
  const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  const halfLength = Math.max(finite(contact?.radius, 16), finite(contact?.renderLength, 32) / 2);
  const halfWidth = Math.max(8, finite(contact?.renderWidth, 24) / 2);
  return Math.max(0, Math.hypot(Math.max(0, along - halfLength), Math.max(0, across - halfWidth)) - Math.max(0, finite(ship?.radius, 21)));
}

function patrolPose(contact, time) {
  const patrol = contact._peacekeeperPatrol;
  if (!patrol) return;
  const angle = time / patrol.period * TAU, rate = TAU / patrol.period;
  contact.x = patrol.x + Math.cos(angle) * patrol.rx;
  contact.y = patrol.y + Math.sin(angle) * patrol.ry;
  contact.vx = -Math.sin(angle) * patrol.rx * rate;
  contact.vy = Math.cos(angle) * patrol.ry * rate;
  contact.angle = Math.atan2(contact.vy, contact.vx);
  contact.angularVelocity = patrol.rx * patrol.ry * rate / (patrol.rx ** 2 * Math.sin(angle) ** 2 + patrol.ry ** 2 * Math.cos(angle) ** 2);
  contact.speed = Math.hypot(contact.vx, contact.vy);
}

function safePatrol(bodies, footprint, scale, radius) {
  // A wide, slow watch outside the civilian berths. Validate the whole turn,
  // including the capital's stern, instead of merely clearing its centre.
  const candidates = [
    {x:-710,y:500,rx:280,ry:210}, {x:-870,y:180,rx:240,ry:190},
    {x:550,y:1080,rx:300,ry:230}, {x:-1450,y:560,rx:300,ry:210},
    {x:1500,y:900,rx:260,ry:220}, {x:-1700,y:1400,rx:240,ry:180}
  ].map(patrol => ({x:patrol.x * scale, y:patrol.y * scale, rx:patrol.rx * scale, ry:patrol.ry * scale}));
  const limit = radius * 2650 / LEGACY_WORLD_RADIUS;
  const clear = patrol => Array.from({length:96}, (_, i) => i * TAU / 96).every(angle => {
    const x = patrol.x + Math.cos(angle) * patrol.rx, y = patrol.y + Math.sin(angle) * patrol.ry;
    return Math.abs(x) + footprint < limit && Math.abs(y) + footprint < limit && bodies.every(body =>
      Math.hypot(x - finite(body.x), y - finite(body.y)) > finite(body.gravityRadius, finite(body.radius, 70)) + footprint + 35);
  });
  const preferred = candidates.find(clear);
  if (preferred) return preferred;
  // Appended scenery may close a preferred loop in an established galaxy.
  // Search a deterministic bounded set before giving up a physical watch:
  // narrow loops at the edge still leave the entire 500-metre hull clear.
  for (const [rx,ry] of [[240,180],[80,60]]) for (const distance of [1100,1450,1800,2050]) {
    for (let i=0;i<24;i++) {
      const angle=i*TAU/24,patrol={x:Math.cos(angle)*distance*scale,y:Math.sin(angle)*distance*scale,rx:rx*scale,ry:ry*scale};
      if(clear(patrol))return patrol;
    }
  }
  return null;
}

export function createPeacekeeper({seed = 'farwake', system, bodies = system?.bodies || []} = {}) {
  if (system?.id !== PEACEKEEPER_SYSTEM) return null;
  const hull = getShipClass('judicator');
  const scale = Math.max(1, finite(system?.spatialScale, 1));
  const radius = Math.max(1, finite(system?.radius, LEGACY_WORLD_RADIUS * scale));
  const geometry = safePatrol(bodies, Math.hypot(hull.stats.renderLength, hull.stats.renderWidth) / 2, scale, radius);
  if (!geometry) return null;
  // Stretch the watch period with its distance so a larger system does not
  // turn this slow capital ship into a fast-moving patrol boat. Keep the old
  // key intact in the old frame so saved watches can be verified and migrated.
  const period = 210 * scale;
  const key = scale === 1 ? `resolute-patrol-v1:${hash(JSON.stringify(geometry)).toString(36)}` : `resolute-patrol-v2:${hash(JSON.stringify({...geometry,period})).toString(36)}`;
  const patrol = {...geometry, period, key};
  const contact = {
    id:PEACEKEEPER_ID, name:'FWS Resolute', faction:PEACEKEEPER_FACTION,
    ...enemyHullProfile('judicator'), peacekeeper:true, boardable:false,
    trafficRole:'peacekeeper', trafficStatus:'Keeping the harbor watch',
    originId:'kettle', destinationId:'hearth:watch-perimeter',
    originName:'Kettle approaches', destinationName:'Hearth watch perimeter',
    homePortId:'common-watch', color:'#a7b7b5',
    hull:hull.stats.maxHull, maxHull:hull.stats.maxHull,
    shield:hull.stats.maxShield, maxShield:hull.stats.maxShield
  };
  Object.defineProperties(contact, {
    _peacekeeperPatrol:{value:patrol},
    _trafficTime:{value:hash(`${seed}:resolute-watch-v1`) / 4294967296 * patrol.period,writable:true},
    _defenseCooldown:{value:0,writable:true},
    _defenseSerial:{value:0,writable:true}
  });
  patrolPose(contact, contact._trafficTime);
  return contact;
}

export function advancePeacekeeper(contact, seconds) {
  if (!isPeacekeeper(contact) || !contact._peacekeeperPatrol) return;
  contact._trafficTime = wrap(contact._trafficTime + Math.max(0, finite(seconds)), contact._peacekeeperPatrol.period);
  patrolPose(contact, contact._trafficTime);
}

export function restorePeacekeeper(contact, saved, legacyContact) {
  const patrol = contact?._peacekeeperPatrol;
  if (!isPeacekeeper(contact) || !patrol || !Number.isFinite(saved?.routeTime)) return;
  let time = saved.routeTime;
  if (saved.routeKey !== patrol.key) {
    const legacy = legacyContact?._peacekeeperPatrol;
    if (!isPeacekeeper(legacyContact) || !legacy || saved.routeKey !== legacy.key) return;
    time = wrap(saved.routeTime, legacy.period) / legacy.period * patrol.period;
  }
  contact._trafficTime = wrap(time, patrol.period);
  contact._defenseCooldown = clamp(finite(saved.defenseCooldown), 0, .65);
  patrolPose(contact, contact._trafficTime);
}

/**
 * Local point defence only. It never kills ships, clears story encounters, pays
 * bounties or takes a captain's military credit. A room calls this once/tick.
 */
export function stepPeacekeeperDefense(runtime, delta, targets = [], emit = () => {}) {
  const contact = runtime?.traffic?.find(isPeacekeeper);
  if (!contact?._peacekeeperPatrol) return;
  const dt = clamp(finite(delta), 0, .1);
  contact._defenseCooldown = Math.max(0, contact._defenseCooldown - dt);
  if (!dt || contact._defenseCooldown > 0) return;
  const defended = targets.filter(game => game.hasActiveVessel && game.netTargetEligible !== false &&
    !game._parkedVessel && game.state?.ship?.hull > 0 && Math.hypot(game.state.ship.x - contact.x, game.state.ship.y - contact.y) <= 650);
  if (!defended.length) return;
  const shot = (runtime.bullets || []).find(bullet => {
    if (bullet.team !== 'hostile' || bullet.ttl <= 0 || bullet.cosmetic || Math.hypot(bullet.x - contact.x, bullet.y - contact.y) > 650) return false;
    const hostile = runtime.enemies?.find(enemy => enemy.id === bullet.ownerId && enemy.hp > 0 && enemy.active && !enemy.disabled && !enemy.capturedBy && !enemy.promotedVesselId && !enemy.canonicalVesselId);
    if (!hostile || Math.hypot(hostile.x - contact.x, hostile.y - contact.y) > 950) return false;
    const target = defended.find(game => game.playerId === bullet.targetId)?.state.ship;
    if (!target) return false;
    const vx = finite(bullet.vx), vy = finite(bullet.vy), speed2 = vx * vx + vy * vy;
    if (!speed2) return false;
    const arrival = ((target.x - bullet.x) * vx + (target.y - bullet.y) * vy) / speed2;
    return arrival >= 0 && arrival <= Math.min(1.2, bullet.ttl) &&
      Math.hypot(target.x - (bullet.x + vx * arrival), target.y - (bullet.y + vy * arrival)) <= target.radius + finite(bullet.radius, 4) + 8;
  });
  if (!shot) return;
  shot.ttl = 0;
  contact._defenseCooldown = .65;
  const dx = shot.x - contact.x, dy = shot.y - contact.y, distance = Math.hypot(dx, dy);
  runtime.bullets.push({
    id:`${PEACEKEEPER_ID}:intercept:${++contact._defenseSerial}`,
    x:contact.x,y:contact.y,vx:dx / Math.max(1,distance) * 1400,vy:dy / Math.max(1,distance) * 1400,
    ttl:Math.max(.04,distance / 1400),radius:3,damage:0,
    owner:PEACEKEEPER_ID,ownerId:PEACEKEEPER_ID,vesselId:PEACEKEEPER_ID,
    team:'peacekeeper',friendly:true,cosmetic:true
  });
  emit('peacekeeper-defense', {vesselId:PEACEKEEPER_ID, x:shot.x, y:shot.y, targetId:shot.targetId});
}
