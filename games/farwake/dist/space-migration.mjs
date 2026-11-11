/** One-time migration of space positions. Decks, people and velocities use other units. */
import { SYSTEM_SPACE_VERSION, SYSTEM_SPACE_SCALE, LEGACY_WORLD_RADIUS, WORLD_RADIUS, systemBodyPosition } from './system-space.mjs';
import { systemCosmicBodies } from './galaxy-expansion.mjs';
import { systemContext } from './encounter-context.mjs';
import { createSystemTraffic, restoreTraffic } from './traffic.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const rows = value => Array.isArray(value) ? value : [];
const values = value => object(value) ? Object.values(value) : [];
const point = value => object(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
const legacy = value => object(value) && !(Number(value.spaceVersion) >= SYSTEM_SPACE_VERSION);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const scaled = value => ({ x: value.x * SYSTEM_SPACE_SCALE, y: value.y * SYSTEM_SPACE_SCALE });
const radius = body => body.kind === 'planet' ? 122 : body.kind === 'moon' ? 76 : 70;

/** Collect first, then move: shared aliases and boarding tethers get one coherent translation. */
function migration({ systems = [], seed = 'farwake' } = {}) {
  const nodes = new Map(), references = new WeakMap(), records = new Set(), states = new Set(), bodyCache = new Map(), trafficCache = new Map();
  let serial = 0;
  const key = (systemId, id) => `${systemId || 'hearth'}\0${id}`;
  function add(value, systemId, id = null, priority = 0) {
    if (!point(value)) return null;
    if (references.has(value)) return references.get(value).node;
    const idKey = key(systemId, id || `migration-point:${++serial}`);
    let node = nodes.get(idKey);
    if (!node) { node = { id: idKey, systemId, references: [], parent: null, priority: -1, pose: null, anchor: null }; node.parent = node; nodes.set(idKey, node); }
    const saved = { value, before: { x: value.x, y: value.y }, node };
    references.set(value, saved); node.references.push(saved);
    if (!node.pose || priority > node.priority) { node.pose = saved.before; node.priority = priority; }
    return node;
  }
  const get = (systemId, id) => id ? nodes.get(key(systemId, id)) : null;
  const root = node => { if (node && node.parent !== node) node.parent = root(node.parent); return node?.parent; };
  function link(one, two) {
    if (!one || !two || one.systemId !== two.systemId) return;
    const a = root(one), b = root(two); if (a !== b) b.parent = a;
  }
  function anchor(node, before, after, priority) {
    if (!node || !point(before) || !point(after)) return;
    if (!node.anchor || priority > node.anchor.priority) node.anchor = { before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y }, priority };
  }
  function bodies(systemId) {
    if (!bodyCache.has(systemId)) {
      const system = systems.find(value => value.id === systemId);
      const ordinary = (system?.bodies || []).map((body, index) => ({ ...body, radius: radius(body), before: systemBodyPosition(body, index, systemId, 1), after: systemBodyPosition(body, index, systemId) }));
      const cosmic = system ? systemCosmicBodies(system, seed).map(body => ({ ...body, before: { x: body.x, y: body.y }, after: scaled(body) })) : [];
      bodyCache.set(systemId, [...ordinary, ...cosmic]);
    }
    return bodyCache.get(systemId);
  }
  function berth(node, systemId, bodyId, priority = 100) {
    const body = bodies(systemId).find(value => value.id === bodyId);
    if (body) anchor(node, body.before, body.after, priority);
  }
  function nearby(node) {
    if (!node) return;
    const candidates = bodies(node.systemId).filter(body => distance(node.pose, body.before) <= (body.kind === 'blackhole' ? body.warningRadius : body.radius + 160));
    candidates.sort((a, b) => distance(node.pose, a.before) - distance(node.pose, b.before));
    const body = candidates[0]; if (body) anchor(node, body.before, body.after, body.kind === 'blackhole' ? 65 : 70);
  }
  function trafficPosition(systemId, id, saved) {
    if (!trafficCache.has(systemId)) {
      const system = systems.find(value => value.id === systemId);
      if (!system) return null;
      const geometry = bodies(systemId), count = systemContext(system).trafficCount;
      const make = (scale, field, worldRadius) => restoreTraffic(createSystemTraffic({ seed, system: { ...system, spatialScale: scale, radius: worldRadius }, bodies: geometry.map(body => ({ ...body, ...body[field] })), count }), saved);
      trafficCache.set(systemId, { before: make(1, 'before', LEGACY_WORLD_RADIUS), after: make(SYSTEM_SPACE_SCALE, 'after', WORLD_RADIUS) });
    }
    const traffic = trafficCache.get(systemId), before = traffic.before.find(value => value.id === id), after = traffic.after.find(value => value.id === id);
    return before && after ? { before, after } : null;
  }
  function world(record, systemId) {
    if (!legacy(record) || records.has(record)) return;
    records.add(record);
    for (const [id, value] of Object.entries(object(record.enemyStates) ? record.enemyStates : {})) add(value, systemId, id, 8);
    for (const value of rows(record.spawned)) add(value, systemId, value.id, 3);
    for (const value of rows(record.pickups)) add(value, systemId);
    for (const value of rows(record.parkedShips)) { const node = add(value, systemId, value.id, 12); nearby(node); }
    for (const [id, value] of Object.entries(object(record.encounterContacts) ? record.encounterContacts : {})) {
      const node = add(value, systemId, value.id || id, 10);
      // These hulls belong to regenerated, fixed signal markers.
      if (value.signalId && point(value)) anchor(node, value, scaled(value), 90);
    }
  }
  function contract(state, systemId, record) {
    const job = state.npcContract;
    if (!object(job)) return;
    const originSystem = job.origin?.systemId || systemId, destinationSystem = job.destination?.systemId || originSystem;
    const originBefore = point(job.origin) ? { x: job.origin.x, y: job.origin.y } : null;
    const destinationBefore = point(job.destination) ? { x: job.destination.x, y: job.destination.y } : null;
    add(job.origin, originSystem); add(job.destination, destinationSystem);
    const dock = add(job.dockPoint, originSystem);
    if (originBefore) anchor(dock, originBefore, scaled(originBefore), 100);
    const work = add(job.workPoint, destinationSystem);
    if (destinationBefore) anchor(work, destinationBefore, scaled(destinationBefore), 100);
    const personal = add(job.personal?.ship, state.livelihoods?.parkedShip?.systemId || originSystem, job.personal?.ship?.id, 20);
    if (personal) berth(personal, personal.systemId, state.livelihoods?.parkedShip?.bodyId || job.origin?.bodyId);
    const employer = get(systemId, job.vesselId);
    if (job.dockedAt) berth(employer, systemId, job.dockedAt);
    else if (job.phase === 'working' && employer && work && distance(employer.pose, work.pose) < 120) link(employer, work);
    // An escort can stop for a real attack well before its destination. Its
    // interceptor shares the employer's local combat space, not the waypoint.
    const target = get(systemId, job.work?.enemyId), complication = job.assignment?.complication;
    const attack = job.version === 2 ? complication?.type === 'attack' && complication.started && !complication.resolved : job.roleId === 'gunner' && job.incidentStarted;
    if (job.active && !job.aborted && job.phase === 'working' && attack && !job.work?.done && !job.work?.targetDisabled && target
      && !rows(record?.defeated).includes(job.work.enemyId) && !(Number.isFinite(record?.enemyHealth?.[job.work.enemyId]) && record.enemyHealth[job.work.enemyId] <= 0)
      && target.references.some(({ value }) => value.crewContractId === job.id && value.professionJobId === job.id)
      && !target.references.some(({ value }) => value.disabled || value.capturedBy || value.promotedVesselId || Number.isFinite(value.hp) && value.hp <= 0)) link(employer, target);
  }
  function state(value, { shipSystemId = value.systemId, shipVesselId = value.ship?.id, activeSystemId = value.systemId, activeVesselId = value.ship?.id, worlds = value.worlds } = {}) {
    if (!legacy(value) || states.has(value)) return;
    states.add(value);
    for (const [systemId, record] of Object.entries(object(value.worlds) ? value.worlds : {})) world(record, systemId);
    const ship = add(value.ship, shipSystemId, shipVesselId, 30); nearby(ship);
    const parked = value.livelihoods?.parkedShip;
    if (point(parked)) { const node = add(parked, parked.systemId || shipSystemId, parked.vesselId || parked.id, 20); berth(node, parked.systemId || shipSystemId, parked.bodyId); }
    const active = get(activeSystemId, activeVesselId) || ship;
    const returnPose = add(value.interior?.returnShip, activeSystemId); link(active, returnPose);
    const record = worlds?.[activeSystemId];
    const targetId = value.boarding?.targetVesselId || value.boarding?.targetId;
    if (targetId) link(active, get(activeSystemId, targetId));
    if (value.returnVesselId) link(active, get(activeSystemId, value.returnVesselId));
    const pending = value.pendingEncounter;
    if (pending && ['signal', 'traffic'].includes(pending.sourceType)) {
      const contact = get(activeSystemId, pending.vesselId) || get(activeSystemId, `contact:${pending.sourceId}`);
      if (contact) link(active, contact);
      const savedSource = add(pending, activeSystemId);
      let source = null;
      if (!contact && pending.sourceType === 'traffic') source = trafficPosition(activeSystemId, pending.sourceId || pending.vesselId, record?.trafficStates);
      if (!source && point(pending)) source = { before: pending, after: scaled(pending) };
      if (source) { anchor(savedSource, source.before, source.after, 95); link(active, savedSource); }
    }
    // Derelict interiors keep a saved return pose but their person coordinates
    // are an unrelated tile map. Move the hull beside its same physical signal.
    if (value.interior?.kind === 'derelict') link(active, get(activeSystemId, `contact:${value.interior.signalId}`));
    contract(value, activeSystemId, record);
  }
  function finish() {
    // Tether metadata may refer to a hull collected later (another captain or
    // an unloaded room), so resolve it only after all canonical hulls exist.
    for (const node of nodes.values()) for (const { value } of node.references) {
      for (const id of [value.boardingOriginId, value.canonicalVesselId, value.promotedVesselId]) link(node, get(node.systemId, id));
    }
    const groups = new Map();
    for (const node of nodes.values()) { const id = root(node); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(node); }
    for (const members of groups.values()) {
      const fixed = members.map(value => value.anchor).filter(Boolean).sort((a, b) => b.priority - a.priority)[0];
      const lead = [...members].sort((a, b) => b.priority - a.priority)[0];
      const offset = fixed ? { x: fixed.after.x - fixed.before.x, y: fixed.after.y - fixed.before.y } : members.length > 1 ? { x: lead.pose.x * (SYSTEM_SPACE_SCALE - 1), y: lead.pose.y * (SYSTEM_SPACE_SCALE - 1) } : null;
      for (const node of members) for (const entry of node.references) {
        entry.value.x = offset ? entry.before.x + offset.x : entry.before.x * SYSTEM_SPACE_SCALE;
        entry.value.y = offset ? entry.before.y + offset.y : entry.before.y * SYSTEM_SPACE_SCALE;
      }
    }
    for (const record of records) record.spaceVersion = SYSTEM_SPACE_VERSION;
    for (const value of states) value.spaceVersion = SYSTEM_SPACE_VERSION;
  }
  return { add, get, link, anchor, nearby, berth, world, state, finish };
}

/** Migrate a world record without touching its traffic clocks or local decks. */
export function migrateWorldSpace(record) {
  if (!legacy(record)) return record;
  const plan = migration(); plan.world(record, null); plan.finish(); return record;
}

/** Migrate an imported/local voyage before any range checks or world materialization. */
export function migrateGameSpace(state, { systems = [] } = {}) {
  if (!legacy(state)) return state;
  const plan = migration({ systems, seed: state.seed }); plan.state(state); plan.finish(); return state;
}

/** Migrate the authority document, including unloaded rooms and remote owned hulls. */
export function migrateRealmSpace(snapshot, { systems = [] } = {}) {
  if (!legacy(snapshot)) return snapshot;
  const plan = migration({ systems, seed: snapshot.seed }), records = {};
  for (const [systemId, world] of Object.entries(object(snapshot.worlds) ? snapshot.worlds : {})) {
    records[systemId] = world.record;
    plan.world(world.record, systemId);
    if (legacy(world)) {
      for (const enemy of rows(world.enemies)) plan.add(enemy, systemId, enemy.id, 9);
      world.spaceVersion = SYSTEM_SPACE_VERSION;
    }
  }
  const vessels = object(snapshot.vessels) ? snapshot.vessels : {};
  for (const vessel of values(vessels)) {
    const node = plan.add(vessel.ship, vessel.systemId, vessel.id, 50); plan.nearby(node);
    if (vessel.dockedAt) plan.berth(node, vessel.systemId, vessel.dockedAt);
    if (vessel.npcEnemyId) plan.link(node, plan.get(vessel.systemId, vessel.npcEnemyId));
    plan.link(node, plan.add(vessel.combatInterior?.returnShip, vessel.systemId));
  }
  for (const captain of values(snapshot.captains)) {
    const game = captain.game; if (!object(game)) continue;
    const owned = vessels[captain.ownedVesselId], occupied = vessels[captain.aboard];
    plan.state(game, { shipSystemId: owned?.systemId || game.systemId, shipVesselId: owned?.id || game.ship?.id, activeSystemId: occupied?.systemId || game.systemId, activeVesselId: occupied?.id || game.ship?.id, worlds: records });
    if (occupied) plan.link(plan.get(occupied.systemId, occupied.id), plan.get(occupied.systemId, captain.returnVesselId));
  }
  for (const vessel of values(vessels)) {
    const node = plan.get(vessel.systemId, vessel.id), boarding = vessel.boarding;
    for (const id of [boarding?.originVesselId, boarding?.targetVesselId, vessel.pvp?.originVesselId]) plan.link(node, plan.get(vessel.systemId, id));
  }
  plan.finish(); snapshot.spaceVersion = SYSTEM_SPACE_VERSION; return snapshot;
}
