/** One-time station relocation. Deck coordinates, cargo and earned progress never move. */
import { STATION_GEOGRAPHY_VERSION, stationRelocations, migrateStationPose } from './station-geography.mjs';
import { SYSTEM_SPACE_SCALE, WORLD_RADIUS, systemBodyPosition } from './system-space.mjs';
import { bodyVisualRadius, applySystemActivity } from './world-types.mjs';
import { systemContext } from './encounter-context.mjs';
import { systemCosmicBodies } from './galaxy-expansion.mjs';
import { createSystemTraffic, restoreTraffic, captureTraffic } from './traffic.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const point = value => object(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
const values = value => object(value) ? Object.values(value) : [];
const rows = value => Array.isArray(value) ? value : [];
const current = value => Number(value?.stationGeographyVersion) >= STATION_GEOGRAPHY_VERSION;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const oldSystems = new WeakMap();

/** Earlier space/size migrations must see the stations that existed in that save. */
export function legacyStationGeography(systems = []) {
  if (oldSystems.has(systems)) return oldSystems.get(systems);
  const previous = systems.map(system => {
    const moved = new Map(stationRelocations(system).map(entry => [entry.bodyId, entry]));
    if (!moved.size) return system;
    return { ...system, bodies: system.bodies.map(body => {
      const relocation = moved.get(body.id);
      return relocation ? { ...body, x: relocation.from.x / SYSTEM_SPACE_SCALE, y: relocation.from.y / SYSTEM_SPACE_SCALE } : body;
    }) };
  });
  oldSystems.set(systems, previous);
  return previous;
}

function migration({ systems = [], seed = 'farwake' } = {}) {
  const systemMap = new Map(systems.map(system => [system.id, system]));
  const relocations = new Map(), geometry = new Map(), traffic = new WeakMap();
  const nodes = new Map(), references = new WeakMap(), contracts = new WeakSet(), records = new WeakSet(), recordsBySystem = new Map();
  let serial = 0;
  const moves = systemId => {
    if (!relocations.has(systemId)) relocations.set(systemId, stationRelocations(systemMap.get(systemId) || { bodies: [] }));
    return relocations.get(systemId);
  };
  const key = (systemId, id) => `${systemId || 'hearth'}\0${id}`;
  function add(value, systemId, id = value?.id, priority = 0) {
    if (!point(value)) return null;
    if (references.has(value)) return references.get(value);
    const name = key(systemId, id || `point:${++serial}`);
    let node = nodes.get(name);
    if (!node) { node = { systemId, references: [], priority: -1, pose: null, anchor: null, parent: null }; node.parent = node; nodes.set(name, node); }
    node.references.push({ value, x: value.x, y: value.y }); references.set(value, node);
    if (priority > node.priority) { node.priority = priority; node.pose = { x: value.x, y: value.y, radius: value.radius, renderLength: value.renderLength, renderWidth: value.renderWidth }; }
    return node;
  }
  const get = (systemId, id) => id ? nodes.get(key(systemId, id)) : null;
  const root = node => { if (node && node.parent !== node) node.parent = root(node.parent); return node?.parent; };
  function link(one, two) {
    if (!one || !two || one.systemId !== two.systemId) return;
    const a = root(one), b = root(two); if (a !== b) b.parent = a;
  }
  function anchor(node, from, to, priority) {
    if (!node || !point(from) || !point(to) || node.anchor && node.anchor.priority >= priority) return;
    node.anchor = { x: to.x - from.x, y: to.y - from.y, priority };
  }
  function berth(node, systemId, bodyId, priority = 100) {
    const relocation = moves(systemId).find(value => value.bodyId === bodyId);
    if (relocation) anchor(node, relocation.from, relocation.to, priority);
  }
  function nearby(node) {
    if (!node || node.anchor || !node.pose) return;
    const relocation = moves(node.systemId).filter(value => distance(node.pose, value.from) <= (value.legacyRadius || value.radius) + 260)
      .sort((a, b) => distance(node.pose, a.from) - distance(node.pose, b.from))[0];
    if (relocation) anchor(node, relocation.from, relocation.to, 50);
  }
  function hull(value, systemId, id, priority = 0, bodyId = value?.dockedAt || value?.bodyId) {
    const node = add(value, systemId, id, priority);
    berth(node, systemId, bodyId); nearby(node); return node;
  }
  function trafficGeometry(systemId) {
    if (geometry.has(systemId)) return geometry.get(systemId);
    const system = systemMap.get(systemId); if (!system || !moves(systemId).length) return null;
    const moved = new Map(moves(systemId).map(value => [value.bodyId, value]));
    const bodies = system.bodies.map((body, index) => ({ ...body, ...systemBodyPosition(body, index, systemId), radius: bodyVisualRadius(body), faction: body.faction || system.faction }));
    bodies.push(...systemCosmicBodies(system, seed).map(body => ({ ...body, x: body.x * SYSTEM_SPACE_SCALE, y: body.y * SYSTEM_SPACE_SCALE })));
    const priorBodies = bodies.map(body => moved.has(body.id) ? { ...body, ...moved.get(body.id).from } : body);
    const count = applySystemActivity(system, systemContext(system)).trafficCount;
    const priorSystem = { ...system, bodies: system.bodies.map(body => moved.has(body.id)
      ? { ...body, x: moved.get(body.id).from.x / SYSTEM_SPACE_SCALE, y: moved.get(body.id).from.y / SYSTEM_SPACE_SCALE } : body),
      spatialScale: SYSTEM_SPACE_SCALE, radius: WORLD_RADIUS };
    const result = { system: { ...system, spatialScale: SYSTEM_SPACE_SCALE, radius: WORLD_RADIUS }, priorSystem, count, bodies, priorBodies };
    geometry.set(systemId, result); return result;
  }
  function trafficPhases(saved, systemId) {
    if (!Array.isArray(saved) || !saved.length) return null;
    if (traffic.has(saved)) return traffic.get(saved);
    const layout = trafficGeometry(systemId); if (!layout) return null;
    const before = restoreTraffic(createSystemTraffic({ seed, system: layout.priorSystem, bodies: layout.priorBodies, count: layout.count }), saved);
    const after = createSystemTraffic({ seed, system: layout.system, bodies: layout.bodies, count: layout.count });
    const beforeById = new Map(before.map(contact => [contact.id, contact])), afterById = new Map(after.map(contact => [contact.id, contact]));
    const defaults = new Map(captureTraffic(after).map(row => [row.id, row]));
    const mapped = saved.map(row => {
      const oldContact = beforeById.get(row.id), newContact = afterById.get(row.id);
      const a = oldContact?._trafficLane, b = newContact?._trafficLane;
      if (!a || !b || !Number.isFinite(row.routeTime)) return row;
      const oldKey = row.routeKey === a.key || row.routeKey === oldContact._legacyTrafficContact?.()?._trafficLane?.key;
      if (!oldKey) return row;
      if (oldContact.classId !== newContact.classId || a.origin.id !== b.origin.id || a.destination.id !== b.destination.id) return defaults.get(row.id) || row;
      let time = ((oldContact._trafficTime % a.period) + a.period) % a.period, routeTime;
      if (time < a.travel) routeTime = time / a.travel * b.travel;
      else if ((time -= a.travel) < a.dwellB) routeTime = b.travel + time / a.dwellB * b.dwellB;
      else if ((time -= a.dwellB) < a.travel) routeTime = b.travel + b.dwellB + time / a.travel * b.travel;
      else routeTime = b.travel * 2 + b.dwellB + (time - a.travel) / a.dwellA * b.dwellA;
      return { ...row, routeKey: b.key, routeTime };
    });
    restoreTraffic(after, mapped);
    const result = { before: beforeById, after: afterById, mapped };
    traffic.set(saved, result); return result;
  }
  function world(record, systemId) {
    if (!object(record) || records.has(record)) return;
    records.add(record); recordsBySystem.set(systemId, record);
    for (const [id, ship] of Object.entries(object(record.enemyStates) ? record.enemyStates : {})) hull(ship, systemId, id, 10);
    for (const ship of rows(record.spawned)) hull(ship, systemId, ship.id, 5);
    for (const ship of rows(record.parkedShips)) hull(ship, systemId, ship.id, 20);
    for (const [id, ship] of Object.entries(object(record.encounterContacts) ? record.encounterContacts : {})) {
      // Signal-bound wrecks are anchored to unchanged beacons, not local ports.
      const node = add(ship, systemId, ship.id || id, 12); if (!ship.signalId) nearby(node);
    }
    const phases = trafficPhases(record.trafficStates, systemId);
    if (phases) record.trafficStates = phases.mapped;
  }
  function endpoint(value, systemId) {
    if (!point(value)) return;
    const node = add(value, value.systemId || systemId, null, 2);
    node.endpoint = true; berth(node, value.systemId || systemId, value.bodyId);
  }
  function contract(job, currentSystemId, parkedSystemId = null) {
    if (!object(job) || contracts.has(job)) return;
    contracts.add(job);
    const originSystem = job.origin?.systemId || currentSystemId, route = job.navy?.route;
    const destinationSystem = job.destination?.systemId || route?.destinationSystemId || currentSystemId || originSystem;
    const workSystem = route?.remote && !route.reached ? originSystem : destinationSystem;
    endpoint(job.origin, originSystem); endpoint(job.destination, destinationSystem);
    const dock = add(job.dockPoint, originSystem); berth(dock, originSystem, job.origin?.bodyId); nearby(dock);
    const work = add(job.workPoint, workSystem); berth(work, workSystem, route?.remote && !route.reached ? job.origin?.bodyId : job.destination?.bodyId); nearby(work);
    const personal = job.personal?.ship;
    hull(personal, parkedSystemId || originSystem, personal?.id, 30, job.origin?.bodyId);
    const employer = get(currentSystemId, job.vesselId);
    if (job.dockedAt) berth(employer, currentSystemId, job.dockedAt);
    if (job.phase === 'working' && employer && work && distance(employer.pose, work.pose) < 120) link(employer, work);
    if (route) {
      const home = add(route.homeGate, originSystem), remote = add(route.remoteGate, destinationSystem);
      nearby(home); nearby(remote);
    }
    const escort = hull(job.navy?.escort, destinationSystem, job.navy?.escort?.id, 25);
    if (escort && work && distance(escort.pose, work.pose) < 1000) link(escort, work);
    for (const contact of rows(job.navy?.operation?.contacts)) {
      const node = hull(contact, destinationSystem, contact.id, 25); if (node && work) link(node, work);
    }
    const target = get(currentSystemId, job.work?.enemyId), complication = job.assignment?.complication;
    const attack = job.version === 2 ? complication?.type === 'attack' && complication.started && !complication.resolved : job.roleId === 'gunner' && job.incidentStarted;
    const record = recordsBySystem.get(currentSystemId);
    if (job.active && !job.aborted && job.phase === 'working' && attack && !job.work?.done && !job.work?.targetDisabled && target
      && !rows(record?.defeated).includes(job.work.enemyId) && !(Number.isFinite(record?.enemyHealth?.[job.work.enemyId]) && record.enemyHealth[job.work.enemyId] <= 0)
      && target.references.some(({ value }) => value.crewContractId === job.id && value.professionJobId === job.id)
      && !target.references.some(({ value }) => value.disabled || value.capturedBy || value.promotedVesselId || value.canonicalVesselId || Number.isFinite(value.hp) && value.hp <= 0)) link(employer, target);
  }
  function state(value, { shipSystemId = value.systemId, shipId = value.ship?.id, activeSystemId = value.systemId, activeId = value.ship?.id, worlds = value.worlds, trafficBySystem = null } = {}) {
    const savedTraffic = trafficBySystem || Object.fromEntries(Object.entries(object(worlds) ? worlds : {}).map(([systemId, record]) => [systemId, record?.trafficStates]));
    for (const [systemId, record] of Object.entries(object(value.worlds) ? value.worlds : {})) world(record, systemId);
    const ship = hull(value.ship, shipSystemId, shipId, 40);
    const parked = value.livelihoods?.parkedShip;
    hull(parked, parked?.systemId || shipSystemId, parked?.vesselId || parked?.id, 35, parked?.bodyId);
    const active = get(activeSystemId, activeId) || ship;
    const returnShip = add(value.interior?.returnShip, activeSystemId); link(active, returnShip);
    const targetId = value.boarding?.targetVesselId || value.boarding?.targetId;
    if (targetId) link(active, get(activeSystemId, targetId));
    const pending = value.pendingEncounter;
    if (pending?.sourceType === 'traffic') {
      const saved = savedTraffic[activeSystemId];
      const phases = trafficPhases(saved, activeSystemId), id = pending.sourceId || pending.vesselId;
      const before = phases?.before.get(id), after = phases?.after.get(id);
      if (before && after) {
        anchor(active, before, after, 80);
        const position = add(pending, activeSystemId); if (position) anchor(position, before, after, 80);
      }
    }
    if (value.interior?.kind === 'derelict') link(active, get(activeSystemId, `contact:${value.interior.signalId}`));
    contract(value.npcContract, activeSystemId, parked?.systemId || shipSystemId);
    value.stationGeographyVersion = STATION_GEOGRAPHY_VERSION;
  }
  function finish() {
    for (const node of nodes.values()) for (const { value } of node.references) {
      for (const id of [value.boardingOriginId, value.canonicalVesselId, value.promotedVesselId]) link(node, get(node.systemId, id));
    }
    const groups = new Map();
    for (const node of nodes.values()) { const owner = root(node); if (!groups.has(owner)) groups.set(owner, []); groups.get(owner).push(node); }
    for (const members of groups.values()) {
      const lead = [...members].sort((a, b) => b.priority - a.priority)[0];
      const fixed = members.map(node => node.anchor).filter(Boolean).sort((a, b) => b.priority - a.priority)[0];
      let dx = fixed?.x || 0, dy = fixed?.y || 0, stopped = false;
      if (!lead.endpoint) {
        // The move may place a station over an unrelated flying ship. Clear only
        // that new overlap; a valid ship elsewhere keeps its exact saved pose.
        const before = { ...lead.pose, x: lead.pose.x + dx, y: lead.pose.y + dy };
        const clearance = Math.max(90, (Number.isFinite(lead.pose.radius) ? lead.pose.radius : 0) + 16);
        const safe = migrateStationPose(before, moves(lead.systemId), { nearby: false, clearance });
        if (safe !== before) { dx += safe.x - before.x; dy += safe.y - before.y; stopped = true; }
      }
      if (!dx && !dy) continue;
      for (const node of members) for (const entry of node.references) {
        entry.value.x = entry.x + dx; entry.value.y = entry.y + dy;
        if (stopped && !node.endpoint) for (const field of ['vx', 'vy', 'angularVelocity']) if (Object.hasOwn(entry.value, field)) entry.value[field] = 0;
      }
    }
  }
  return { add, get, link, berth, hull, world, state, contract, trafficPhases, finish };
}

export function migrateGameStationGeography(state, { systems = [] } = {}) {
  if (!object(state) || current(state)) return state;
  const plan = migration({ systems, seed: state.seed }); plan.state(state); plan.finish(); return state;
}

/** Includes canonical hulls and unloaded rooms, which never pass through Game.fromSave. */
export function migrateRealmStationGeography(snapshot, { systems = [] } = {}) {
  if (!object(snapshot) || current(snapshot)) return snapshot;
  const next = structuredClone(snapshot), plan = migration({ systems, seed: next.seed });
  const vessels = object(next.vessels) ? next.vessels : {}, recordsBySystem = {}, trafficBySystem = {};
  for (const [systemId, world] of Object.entries(object(next.worlds) ? next.worlds : {})) {
    if (!object(world)) continue;
    recordsBySystem[systemId] = world.record; trafficBySystem[systemId] = world.traffic || world.record?.trafficStates;
    plan.world(world.record, systemId);
    for (const field of ['enemies', 'parkedShips']) for (const ship of rows(world[field])) plan.hull(ship, systemId, ship.id, 22);
    const phases = plan.trafficPhases(world.traffic, systemId); if (phases) world.traffic = phases.mapped;
  }
  for (const vessel of values(vessels)) {
    const node = plan.hull(vessel.ship, vessel.systemId, vessel.id, 60, vessel.dockedAt || vessel.ship?.dockedAt);
    if (vessel.npcEnemyId) plan.link(node, plan.get(vessel.systemId, vessel.npcEnemyId));
    plan.link(node, plan.add(vessel.combatInterior?.returnShip, vessel.systemId));
  }
  for (const captain of values(next.captains)) {
    const game = captain.game; if (!object(game)) continue;
    const own = vessels[captain.ownedVesselId], active = vessels[captain.aboard];
    plan.state(game, { shipSystemId: own?.systemId || game.systemId, shipId: own?.id || game.ship?.id, activeSystemId: active?.systemId || game.systemId, activeId: active?.id || game.ship?.id, worlds: recordsBySystem, trafficBySystem });
    if (active) plan.link(plan.get(active.systemId, active.id), plan.get(active.systemId, captain.returnVesselId));
  }
  for (const vessel of values(vessels)) {
    const node = plan.get(vessel.systemId, vessel.id);
    for (const id of [vessel.boarding?.originVesselId, vessel.boarding?.targetVesselId, vessel.pvp?.originVesselId]) plan.link(node, plan.get(vessel.systemId, id));
  }
  for (const operation of values(next.militaryOperations?.operations)) {
    const vessel = vessels[operation.vesselId], owner = next.captains?.[operation.ownerId];
    plan.contract(operation.contract, vessel?.systemId || owner?.game?.systemId || operation.contract?.origin?.systemId);
  }
  plan.finish(); next.stationGeographyVersion = STATION_GEOGRAPHY_VERSION; return next;
}
