/**
 * Scheduled local traffic. One deterministic lane belongs to one contact; a
 * server advances its clock, not a second full ship/crew simulation. Lane math
 * is kept off network snapshots and rebuilt from the galaxy seed on restore.
 */
import { getShipClass, enemyHullProfile } from './fleet.mjs';
import { portProfile, chooseTrafficHull, trafficHullWeights, canHullUsePort } from './port-traffic.mjs';
import { createPeacekeeper, isPeacekeeper, advancePeacekeeper, restorePeacekeeper } from './peacekeeper.mjs';

const TAU = Math.PI * 2;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const wrapTime = (time, period) => { const local = time % period; return local < 0 ? local + period : local; };
const hash = value => {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h ^ h >>> 16) >>> 0;
};
const random = (seed, key) => hash(`${seed}:${key}`) / 4294967296;
const smooth = t => t * t * (3 - 2 * t);
const smoothRate = t => 6 * t * (1 - t);
const names = ['Long Weekend', 'Little Promise', 'Fifth Wind', 'Ordinary Miracle', 'Good Company', 'Early Light', 'Home Before Rain', 'Common Ground', 'One More Turn', 'Open Hands', 'Kind Weather', 'Morning Bell', 'The Long Way', 'Another Tuesday', 'Safe Arrival', 'Last Lantern'];
const factionColors = { concord:'#89a9d0', freewake:'#78bca8', meridian:'#c4a36d', lantern:'#aa9cc8', cinder:'#ba8f80' };
export const TRAFFIC_ROLE_LABELS = Object.freeze({ utility:'Port service', courier:'Dispatch service', freight:'Freight service', passenger:'Passenger service', survey:'Survey vessel', salvage:'Salvage service', miner:'Ore carrier', medical:'Medical transport', escort:'Convoy escort', patrol:'Fleet patrol', carrier:'Fleet carrier', tender:'Fleet support tender', destroyer:'Line destroyer', peacekeeper:'Naval peacekeeper' });
const militaryRoles = new Set(['escort', 'patrol', 'carrier', 'destroyer']);
const weighted = (items, value, weight) => {
  let left = value * items.reduce((sum, item) => sum + weight(item), 0);
  return items.find(item => (left -= weight(item)) < 0) || items.at(-1);
};

function dockPoint(body, other, hull, side, reservations) {
  // A berth belongs to a route, even while its ship is away. Bounding the full
  // sprite diagonal also leaves room for the slow turn before departure.
  const footprint = Math.hypot(hull.stats.renderLength, hull.stats.renderWidth) * .5;
  const heading = Math.atan2(other.y - body.y, other.x - body.x) + side * .04;
  const occupied = [...reservations.values()].flat();
  for (let ring = 0; ring < 6; ring++) {
    const clearance = finite(body.radius, 70) + footprint + 34 + ring * (footprint * 2 + 28);
    for (const offset of [0, .3, -.3, .6, -.6, .9, -.9, 1.16, -1.16]) {
      const angle = heading + offset;
      const point = { x:body.x + Math.cos(angle) * clearance, y:body.y + Math.sin(angle) * clearance, footprint };
      if (Math.abs(point.x) > 2500 || Math.abs(point.y) > 2500) continue;
      if (occupied.every(berth => Math.hypot(point.x - berth.x, point.y - berth.y) >= footprint + berth.footprint + 16)) return point;
    }
  }
  return null;
}

function pointAt(lane, u, reverse = false) {
  const a = reverse ? lane.b : lane.a, b = reverse ? lane.a : lane.b;
  const direction = reverse ? -1 : 1, bow = Math.sin(Math.PI * u) * direction;
  return { x: a.x + (b.x - a.x) * u + lane.bend.x * bow, y: a.y + (b.y - a.y) * u + lane.bend.y * bow };
}

function tangentAt(lane, u, reverse = false) {
  const a = reverse ? lane.b : lane.a, b = reverse ? lane.a : lane.b;
  const bow = Math.PI * Math.cos(Math.PI * u) * (reverse ? -1 : 1);
  return { x: b.x - a.x + lane.bend.x * bow, y: b.y - a.y + lane.bend.y * bow };
}

function clearLane(lane, bodies, hull) {
  for (const reverse of [false, true]) {
   let previous = pointAt(lane, 0, reverse);
   for (let i = 0; i <= 32; i++) {
    const point = pointAt(lane, i / 32, reverse);
    if (Math.abs(point.x) > 2600 || Math.abs(point.y) > 2600) return false;
    for (const body of bodies) {
      const safe = body.kind === 'blackhole' ? finite(body.gravityRadius, finite(body.tideRadius, finite(body.radius, 160) * 1.8)) : finite(body.radius, 70);
      // Check the space BETWEEN samples too. A long freighter leg must not cut
      // through a small station that happened to lie between two sample poses.
      const dx = point.x - previous.x, dy = point.y - previous.y;
      const fraction = clamp(((body.x - previous.x) * dx + (body.y - previous.y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
      if (Math.hypot(previous.x + dx * fraction - body.x, previous.y + dy * fraction - body.y) < safe + hull.stats.radius + 12) return false;
    }
    previous = point;
   }
  }
  return true;
}

function laneFor(seed, home, destination, hull, bodies, reservations) {
  const slot = random(seed, 'berth') * 4 - 2;
  const a = dockPoint(home.body, destination.body, hull, slot, reservations);
  const b = destination.gate ? {x:destination.body.x, y:destination.body.y} : dockPoint(destination.body, home.body, hull, -slot, reservations);
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.max(1, Math.hypot(dx, dy));
  const side = random(seed, 'lane-side') < .5 ? -1 : 1;
  const baseBow = 48 + random(seed, 'lane-width') * 110;
  const lane = { a, b, bend:{x:0, y:0} };
  // Both halves use separate sides of a lane. Only generation checks clearance;
  // active rooms evaluate a constant-size curve with no pathfinding every tick.
  for (const amount of [baseBow, baseBow + 150, baseBow + 300, baseBow + 460, 0]) {
    lane.bend = { x:-dy / length * amount * side, y:dx / length * amount * side };
    if (clearLane(lane, bodies, hull)) { lane.clear = true; break; }
  }
  const cruise = 67 + 37 / Math.sqrt(hull.stats.mass) + random(seed, 'cruise') * 12;
  let curveLength = 0, last = lane.a;
  for (let i = 1; i <= 16; i++) { const p = pointAt(lane, i / 16); curveLength += Math.hypot(p.x - last.x, p.y - last.y); last = p; }
  lane.travel = Math.max(12, curveLength * 1.62 / cruise);
  lane.dwellA = 10 + hull.stats.mass * .9 + random(seed, 'loading') * 14;
  lane.dwellB = destination.gate ? 8 + hull.stats.mass * .8 : 10 + hull.stats.mass * .9 + random(seed, 'unloading') * 14;
  lane.period = lane.travel * 2 + lane.dwellA + lane.dwellB;
  lane.origin = {id:home.body.id, name:home.body.name};
  lane.destination = {id:destination.body.id, name:destination.body.name};
  lane.key = hash(JSON.stringify([home.body.id, destination.body.id, hull.id, lane.a, lane.b, lane.bend, lane.travel])).toString(36);
  return lane;
}

function setPose(contact, time) {
  const lane = contact._trafficLane;
  if (!lane) return;
  let local = wrapTime(time, lane.period);
  const reverse = local >= lane.travel + lane.dwellB;
  if (reverse) local -= lane.travel + lane.dwellB;
  const travelling = local < lane.travel, from = reverse ? lane.destination : lane.origin, to = reverse ? lane.origin : lane.destination;
  contact.originId = from.id; contact.destinationId = to.id;
  contact.originName = from.name; contact.destinationName = to.name;
  if (travelling) {
    const t = local / lane.travel, u = smooth(t), rate = smoothRate(t) / lane.travel;
    const point = pointAt(lane, u, reverse), tangent = tangentAt(lane, u, reverse);
    contact.x = point.x; contact.y = point.y;
    contact.vx = tangent.x * rate; contact.vy = tangent.y * rate;
    contact.angle = Math.atan2(tangent.y, tangent.x);
    const curveRate = -Math.PI * Math.PI * Math.sin(Math.PI * u) * (reverse ? -1 : 1);
    const ddx = lane.bend.x * curveRate, ddy = lane.bend.y * curveRate;
    contact.angularVelocity = (tangent.x * ddy - tangent.y * ddx) / Math.max(1, tangent.x ** 2 + tangent.y ** 2) * rate;
    contact.trafficStatus = t < .18 ? 'Departing' : t > .8 ? 'On approach' : 'In transit';
  } else {
    const point = reverse ? lane.a : lane.b, dwell = reverse ? lane.dwellA : lane.dwellB;
    const t = clamp((local - lane.travel) / dwell, 0, 1);
    const incoming = tangentAt(lane, 1, reverse), outgoing = tangentAt(lane, 0, !reverse);
    const heading = Math.atan2(incoming.y, incoming.x), turn = angleDelta(heading, Math.atan2(outgoing.y, outgoing.x));
    contact.x = point.x; contact.y = point.y; contact.vx = 0; contact.vy = 0;
    contact.angle = heading + turn * smooth(t); contact.angularVelocity = turn * smoothRate(t) / dwell;
    contact.trafficStatus = to.id.startsWith('lane:') ? 'Lane clearance' : 'At berth';
  }
  contact.speed = Math.hypot(contact.vx, contact.vy);
}

/** The configured traffic count is a ceiling, including systems without a port. */
export function createSystemTraffic({seed = 'farwake', system, bodies = system?.bodies || [], count = 0} = {}) {
  if (!system) return [];
  const ports = bodies.map(body => ({body, profile:portProfile(system, body)})).filter(port => port.profile && Number.isFinite(port.body.x) && Number.isFinite(port.body.y));
  if (!ports.length) return [];
  const budget = clamp(Math.floor(finite(count)), 0, 32);
  const keeper = budget ? createPeacekeeper({seed, system, bodies}) : null;
  // One watch ship occupies one traffic slot; a second captain never creates a
  // second ship, and new voyages do not increase the system's simulation budget.
  const contacts = keeper ? [keeper] : [], reservations = new Map();
  for (let i = 0; i < budget - (keeper ? 1 : 0); i++) {
    const id = `${system.id}:traffic:${i}`, key = `${seed}:${id}:lanes-v1`;
    const home = weighted(ports, random(key, 'home'), port => port.profile.trafficWeight);
    const classId = chooseTrafficHull(seed, id, home.profile), hull = getShipClass(classId);
    const role = trafficHullWeights(home.profile).find(row => row.classId === classId)?.role || 'utility';
    const candidates = ports.filter(port => port !== home && canHullUsePort(classId, port.profile) && (!port.profile.restricted || home.profile.restricted && home.profile.faction === port.profile.faction || militaryRoles.has(role) && home.profile.faction === port.profile.faction));
    let destination = candidates.length && random(key, 'local-run') < .68 ? weighted(candidates, random(key, 'destination'), port => port.profile.trafficWeight) : null;
    let lane = destination ? laneFor(key, home, destination, hull, bodies, reservations) : null;
    // Inter-system ships arrive at an outer lane. Try several bearings rather
    // than sending an enormous liner through a nearby planet or a black hole.
    if (!lane?.clear) for (let attempt = 0; attempt < 12; attempt++) {
      const angle = random(key, 'gate-bearing') * TAU + attempt * TAU / 12;
      destination = {gate:true,body:{id:`lane:${system.id}:${i % 4}`,name:'Outer transit lane',x:Math.cos(angle) * 2350,y:Math.sin(angle) * 2350}};
      lane = laneFor(key, home, destination, hull, bodies, reservations);
      if (lane?.clear) break;
    }
    // Unusual authored geometry may leave no safe path. Do not manufacture a
    // scheduled route through a celestial body just to fill the traffic quota.
    if (!lane?.clear) continue;
    // Failed approaches reserve nothing. Only the two endpoints of the route
    // that actually survived celestial clearance occupy the port's berth map.
    for (const [body, point] of [[home.body,lane.a], ...(destination.gate ? [] : [[destination.body,lane.b]])]) {
      if (!reservations.has(body.id)) reservations.set(body.id, []);
      reservations.get(body.id).push(point);
    }
    const prefix = role === 'patrol' ? 'Watch' : role === 'escort' ? 'Escort' : role === 'medical' ? 'Relief' : '';
    const title = names[(i + hash(`${seed}:${system.id}:traffic-names`) % names.length) % names.length];
    const contact = {id, name:prefix ? `${prefix} ${title}` : title, faction:home.profile.faction, ...enemyHullProfile(classId), trafficRole:role, homePortId:home.body.id, color:role === 'medical' ? '#b5c9c1' : militaryRoles.has(role) ? factionColors[home.profile.faction] || '#9ba9ad' : '#8fa8ad'};
    // Curves and phase stay on the simulation side. Snapshots need only poses,
    // role and route labels; each contact has no hidden NPC population/timers.
    Object.defineProperties(contact, {_trafficLane:{value:lane, writable:true}, _trafficTime:{value:random(key, 'phase') * lane.period, writable:true}});
    setPose(contact, contact._trafficTime); contacts.push(contact);
  }
  return contacts;
}

export function advanceTraffic(traffic, seconds) {
  const dt = Math.max(0, finite(seconds));
  if (!dt) return traffic;
  for (const contact of traffic || []) {
    if (isPeacekeeper(contact)) { advancePeacekeeper(contact, dt); continue; }
    if (contact.contact) continue;
    if (contact.directorEventId) {
      // A physical event owns its support craft. Preserve its existing patrol
      // behavior instead of treating it as a passenger arrival or teleporting
      // it to a generated berth when a player changes perspective.
      contact.vx = Math.cos(finite(contact.angle)) * finite(contact.speed);
      contact.vy = Math.sin(finite(contact.angle)) * finite(contact.speed);
      contact.x += contact.vx * dt; contact.y += contact.vy * dt;
      if (Math.abs(contact.x) > 2300 || Math.abs(contact.y) > 2300) contact.angle += Math.PI;
      continue;
    }
    if (!contact._trafficLane) continue;
    contact._trafficTime = (contact._trafficTime + dt) % contact._trafficLane.period;
    setPose(contact, contact._trafficTime);
  }
  return traffic;
}

export function captureTraffic(traffic) {
  return (traffic || []).filter(contact => (contact._trafficLane || contact._peacekeeperPatrol) && !contact.contact && !contact.directorEventId).map(contact => ({id:contact.id, routeKey:(contact._trafficLane || contact._peacekeeperPatrol).key, routeTime:contact._trafficTime, ...(isPeacekeeper(contact) ? {defenseCooldown:contact._defenseCooldown} : {})}));
}

export function restoreTraffic(traffic, saved) {
  const phases = new Map((Array.isArray(saved) ? saved : []).filter(row => row && typeof row.id === 'string').slice(0, 64).map(row => [row.id, row]));
  for (const contact of traffic || []) {
    const lane = contact._trafficLane, prior = phases.get(contact.id);
    if (isPeacekeeper(contact)) { restorePeacekeeper(contact, prior); continue; }
    // Old straight-line traffic saves have no route identity. Discard only
    // those obsolete poses rather than restoring them onto an unrelated lane.
    if (!lane || !prior || prior.routeKey !== lane.key || !Number.isFinite(prior.routeTime)) continue;
    contact._trafficTime = wrapTime(prior.routeTime, lane.period);
    setPose(contact, contact._trafficTime);
  }
  return traffic;
}

/** Empty systems catch up harmless traffic only, bounded to fifteen seconds. */
export const catchUpTraffic = (traffic, elapsed) => advanceTraffic(traffic, clamp(finite(elapsed), 0, 15));
