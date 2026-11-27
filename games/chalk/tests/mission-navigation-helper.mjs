// A human-style test driver: follow actual nav routes, walk around physical
// vehicle hulls, and stand beside transport instead of steering into its center.
import { findPath, segmentRectEntry } from '../public/sim.mjs';
import { getMovementSolids } from '../public/building-geometry.mjs';
import { convoyLead, segmentVehicleEntry, pointBlockedByVehicle } from '../public/armored-vehicles.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sideChoices = new WeakMap();
const yieldChoices = new WeakMap();
const clearPoint = (state, point, radius = 15) => point.x >= radius && point.y >= radius && point.x <= state.world.width - radius && point.y <= state.world.height - radius &&
  !getMovementSolids(state.world).some(rect => Number.isFinite(segmentRectEntry(point, point, rect, radius))) && !pointBlockedByVehicle(state, point.x, point.y, radius);
const clearLine = (state, from, to, radius = 13) => getMovementSolids(state.world).every(rect => !Number.isFinite(segmentRectEntry(from, to, rect, radius))) &&
  state.vehicles.every(vehicle => !Number.isFinite(segmentVehicleEntry(vehicle, from, to, radius)));

// A person following Hale should step out of a carrier's immediate turn, just
// as a real player can. This only supplies ordinary input; it never moves the
// controlled actor or changes the vehicle's physical collision rules.
function rightOfWayInput(state, actor) {
  const radius = actor.radius || 13, old = yieldChoices.get(actor);
  const toward = point => {
    const length = distance(actor, point);
    return length > 1 ? { moveX: (point.x - actor.x) / length, moveY: (point.y - actor.y) / length } : null;
  };
  if (old && state.time < old.until && distance(actor, old.point) > 3 && clearPoint(state, old.point, radius) && clearLine(state, actor, old.point, radius)) return toward(old.point);
  yieldChoices.delete(actor);
  const ids = state.convoyVehicleIds || [], convoy = state.stages[state.stageIndex]?.kind === 'convoy';
  for (const vehicle of state.vehicles) {
    if (vehicle.team === 'enemy' || vehicle.disabled || vehicle.wreck || vehicle.holdPosition || vehicle.repairLocked || distance(actor, vehicle) > 145) continue;
    let target = null;
    const index = ids.indexOf(vehicle.id), control = state.armorControl?.units.find(unit => unit.vehicleId === vehicle.id);
    if (convoy && index >= 0 && !vehicle.waiting) {
      if (index === 0) target = state.convoyRoute?.[state.convoyIndex + 1];
      else {
        const front = state.vehicles.find(other => other.id === ids[index - 1]);
        if (!front || distance(vehicle, front) <= 113) continue;
        const routeIndex = Math.min(vehicle.routeIndex ?? -1, state.convoyIndex), waypoint = state.convoyRoute?.[routeIndex + 1];
        target = waypoint && routeIndex < state.convoyIndex ? waypoint : front;
      }
    } else if (control?.active && !control.locked && !control.convoy) target = control.route[control.routeIndex];
    if (!target || distance(vehicle, target) < 5) continue;
    const angle = vehicle.angle || 0, desired = Math.atan2(target.y - vehicle.y, target.x - vehicle.x);
    const difference = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle));
    const turning = { ...vehicle, angle: angle + Math.max(-.024, Math.min(.024, difference)) };
    const next = { ...turning, x: vehicle.x + Math.cos(desired) * 3, y: vehicle.y + Math.sin(desired) * 3 };
    if (!Number.isFinite(segmentVehicleEntry(turning, actor, actor, radius)) &&
      !(Math.abs(difference) <= .18 && Number.isFinite(segmentVehicleEntry(next, actor, actor, radius)))) continue;
    const c = Math.cos(angle), sn = Math.sin(angle), along = (actor.x - vehicle.x) * c + (actor.y - vehicle.y) * sn;
    const across = -(actor.x - vehicle.x) * sn + (actor.y - vehicle.y) * c;
    const halfLength = (vehicle.hullLength || vehicle.w || 80) / 2 + radius, halfWidth = (vehicle.hullWidth || vehicle.h || 40) / 2 + radius;
    for (const margin of [30, 16, 8, 3]) {
      const end = Math.sign(along || 1) * (halfLength + margin), side = Math.sign(across || 1) * (halfWidth + margin);
      const ends = { x: vehicle.x + c * end - sn * across, y: vehicle.y + sn * end + c * across };
      const sides = { x: vehicle.x + c * along - sn * side, y: vehicle.y + sn * along + c * side };
      const candidates = Math.abs(along) - halfLength > Math.abs(across) - halfWidth ? [ends, sides] : [sides, ends];
      for (const point of candidates) {
        if (!clearPoint(state, point, radius) || !clearLine(state, actor, point, radius)) continue;
        const input = toward(point); if (!input) continue;
        yieldChoices.set(actor, { point, until: state.time + .8 }); return input;
      }
    }
  }
  return null;
}

// A single cheapest corner can lead back to itself at the next tick. A small
// visibility graph evaluates the complete route around the physical column,
// including a second truck and the nav path's existing building corners.
function hullDetour(state, actor, route) {
  const nodes = [actor, ...route], goal = nodes.length - 1, radius = actor.radius || 13;
  for (const vehicle of state.vehicles) {
    if (!Number.isFinite(segmentVehicleEntry(vehicle, vehicle, vehicle))) continue;
    const angle = vehicle.angle || 0;
    // Tight legal corners matter in the old kerbside parking lanes. Wider
    // candidates offer a natural route where the surrounding street permits it.
    for (const margin of [.5, 3, 19]) for (const x of [-1, 1]) for (const y of [-1, 1]) {
      const along = (vehicle.hullLength || vehicle.w || 80) / 2 + radius + margin, across = (vehicle.hullWidth || vehicle.h || 40) / 2 + radius + margin;
      const point = { x: vehicle.x + Math.cos(angle) * along * x - Math.sin(angle) * across * y,
        y: vehicle.y + Math.sin(angle) * along * x + Math.cos(angle) * across * y };
      if (clearPoint(state, point, radius)) nodes.push(point);
    }
  }
  const costs = Array(nodes.length).fill(Infinity), previous = Array(nodes.length).fill(-1), visited = new Set();
  costs[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let index = -1;
    for (let candidate = 0; candidate < nodes.length; candidate++) if (!visited.has(candidate) && (index < 0 || costs[candidate] < costs[index])) index = candidate;
    if (index < 0 || !Number.isFinite(costs[index])) break;
    if (index === goal) {
      let next = goal;
      while (previous[next] > 0) next = previous[next];
      return previous[next] === 0 ? nodes[next] : null;
    }
    visited.add(index);
    for (let candidate = 1; candidate < nodes.length; candidate++) {
      if (visited.has(candidate)) continue;
      const cost = costs[index] + distance(nodes[index], nodes[candidate]);
      if (cost >= costs[candidate] || !clearLine(state, nodes[index], nodes[candidate], radius)) continue;
      costs[candidate] = cost; previous[candidate] = index;
    }
  }
  return null;
}

export function missionNavigationTarget(state, actor, objective = state.objective) {
  const convoy = state.stages[state.stageIndex]?.kind === 'convoy' && objective.kind === 'convoy' ? convoyLead(state) : null;
  const vehicle = convoy || state.vehicles.find(vehicle => segmentVehicleEntry(vehicle, objective, objective, actor.radius || 13) === 0);
  if (!vehicle) return objective;
  const side = (vehicle.hullWidth || vehicle.h || 40) / 2 + (objective.kind === 'repair' ? 45 : 65), angle = vehicle.angle || 0;
  const choices = [1, -1].map(sign => ({ x: vehicle.x - Math.sin(angle) * side * sign, y: vehicle.y + Math.cos(angle) * side * sign, sign })).filter(point => clearPoint(state, point));
  const old = sideChoices.get(state), chosen = choices.find(point => old?.id === vehicle.id && old.sign === point.sign) || choices.sort((a, b) => distance(actor, a) - distance(actor, b))[0];
  if (chosen) { sideChoices.set(state, { id: vehicle.id, sign: chosen.sign }); return chosen; }
  return objective;
}

export function navigationInput(state, actor, objective = state.objective, { stopDistance = 16 } = {}) {
  const input = { interact: true, ...(objective.lookAt ? { aimX: objective.lookAt.x, aimY: objective.lookAt.y } : {}) };
  const yielding = rightOfWayInput(state, actor);
  if (yielding) return { ...input, ...yielding };
  const goal = missionNavigationTarget(state, actor, objective);
  if (distance(actor, goal) <= stopDistance) return input;
  const route = findPath(state, actor, goal);
  let next = route[0];
  if (!next) return input;
  const obstacle = state.vehicles.filter(vehicle => Number.isFinite(segmentVehicleEntry(vehicle, actor, next, 17)))
    .sort((a, b) => distance(actor, a) - distance(actor, b))[0];
  if (obstacle) {
    const detour = hullDetour(state, actor, route);
    if (detour) next = detour;
    else return input;
  }
  const dx = next.x - actor.x, dy = next.y - actor.y, length = Math.hypot(dx, dy);
  if (length > 0) { input.moveX = dx / length; input.moveY = dy / length; }
  return input;
}

export function quietMission(state) {
  state.enemies = []; state.allies = []; state.maxEnemies = 0;
  for (const vehicle of state.vehicles) if (vehicle.ammo) vehicle.ammo = { cannon: 0, mg: 0 };
  return state;
}
