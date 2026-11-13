/** Station neighborhoods, shared by the chart and authoritative simulation.
 * Catalog coordinates use the legacy frame. Public relationships and migration
 * points below use current system metres, just like flight and docking.
 */
import { SYSTEM_SPACE_SCALE, WORLD_RADIUS, systemBodyPosition } from './system-space.mjs';
import { bodyVisualRadius, stationTypeFor } from './world-types.mjs';
import { systemCosmicBodies } from './galaxy-expansion.mjs';

export const STATION_GEOGRAPHY_VERSION = 1;
export const STATION_NEIGHBORHOOD_GAP = 1400;
const TAU = Math.PI * 2;
const hash = value => {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15;
  return (n ^ n >>> 16) >>> 0;
};
const unit = key => hash(key) / 4294967296;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const world = body => body.kind === 'planet' || body.kind === 'moon';
const names = bodies => bodies.length < 3 ? bodies.map(body => body.name).join(' and ') : `${bodies[0].name}, ${bodies[1].name} and ${bodies[2].name}`;
const byDistance = point => (a, b) => distance(point, a) - distance(point, b) || String(a.id).localeCompare(String(b.id));

// These established ports sit on authored routes. Describe their actual jobs
// without relocating campaign rendezvous or pretending they orbit a close world.
const authoredReasons = {
  kettle: ['transfer', 'passenger-interchange', 'A transfer junction for Morrow and Tinbell. Long-haul ships unload here; local ferries make the separate planetary approaches.'],
  weighhouse: ['transfer', 'agricultural-transfer', 'Orchard grain is consolidated here for outbound convoys. Bulk freighters wait clear of the agricultural landing traffic.'],
  ledger: ['transfer', 'freight-exchange', 'A customs and freight exchange serving Serein and Cairn. Cargo is cleared here before carriers enter either planetary approach.'],
  listening: ['deep-space', 'quiet-observatory', 'The radio telescopes stand away from Lilt and its busy approaches so local transmissions do not drown out distant signals.'],
  bastion: ['transfer', 'medical-checkpoint', 'A patrol, hospital and customs stop on the route to Ward. Arriving crews are screened here before they continue planetward.'],
  patchwork: ['deep-space', 'salvage-yard', 'A mobile salvage anchorage outside Kiln’s approach. Its separable docks leave room to tow damaged hulls without blocking settlement traffic.'],
  blindpost: ['deep-space', 'quiet-observatory', 'A detached research watch for Palimpsest. Instruments and quarantine rooms remain separated from the planetary settlement.'],
  checkpoint: ['transfer', 'customs-checkpoint', 'An outer inspection point for Tallow. Cargo queues and armed inspections are kept outside the inhabited landing approach.'],
  porch: ['transfer', 'frontier-waystation', 'The last repair and supply stop on Newshore’s outward route. It catches departing ships before they leave the settled lanes.'],
  census: ['deep-space', 'communications-relay', 'A remote registry relay for Stillwater. It continues counting and forwarding signals without depending on a staffed planetary port.'],
  threshold: ['deep-space', 'quarantine-watch', 'The quarantine gate stands clear of Earth and Luna. Ships wait here while their approach to the silent homeworld is decided.'],
  door: ['deep-space', 'communications-relay', 'An old long-range relay serves the routes beyond Wide. Its detached position belongs to the transmission network it was built to join.'],
  'glass-harbor': ['transfer', 'passenger-interchange', 'An orbital transfer harbor for Chora. Separate atmosphere locks let arriving crews prepare before a ferry takes them to the inhabited reefs.'],
  'umbra-watch': ['deep-space', 'stellar-observatory', 'A detached observatory monitors the Threadwell while supply traffic comes from Moth. Its instruments need an uninterrupted view of the remnant.'],
  'ravel-market': ['transfer', 'freight-exchange', 'An independent freight market off Tessera’s approach. Cargo can change carriers here without entering the disputed planetary landing claims.'],
  'still-berth': ['deep-space', 'rescue-waystation', 'A rescue waystation on the route to Low Water. Relief crews wait beyond the moon so they can answer ships arriving from the outer lanes.'],
  'brass-customs': ['transfer', 'customs-checkpoint', 'An inspection and transfer stop for the Brassfall Works and Hadrun. Freight queues remain outside the working planetary approaches.'],
  'kindred-port': ['transfer', 'refuge-reception', 'A reception point for Kindred Landing and Avel. Incoming families are assigned onward passage before the ships reach either settlement.'],
  'lacuna-observatory': ['deep-space', 'stellar-observatory', 'A detached observatory listens toward Hollow Crown. Noonless supplies its crews, while the instrument decks stay away from settlement interference.'],
  'greenwake-depot': ['transfer', 'agricultural-transfer', 'A freight transfer point for Ochre Garden. Survey traffic stays clear of Reedbank, whose river towns have no spaceport.'],
  'common-watch': ['deep-space', 'naval-anchorage', 'A convoy assembly anchorage for Orchard’s food lanes. Military musters and repair work are kept clear of civilian arrivals.'],
  'bastion-yard': ['deep-space', 'naval-anchorage', 'A separate fleet yard serving Bastion Three and Ward. Restricted warship berths do not share the public hospital approach.'],
  'combine-garrison': ['deep-space', 'naval-anchorage', 'A guarded fleet anchorage supporting the Tallow refinery lanes. Escorts assemble outside the civilian inspection queue.'],
  'lantern-guard': ['deep-space', 'naval-anchorage', 'An outer escort anchorage for Listening House and Lilt. Survey convoys muster here without crossing the archive station’s telescope field.'],
  'ember-muster': ['deep-space', 'naval-anchorage', 'A defense muster outside Kiln’s civilian approach. Salvage tenders can supply the armed hulls without entering a public passenger berth.']
};

// Isolation is a consequence of a station's work, not an arbitrary placement
// roll shared by hospitals, homes and factories alike. Most of these types also
// have ordinary near-world installations.
const detachedRoles = {
  'relay-spindle': ['communications-relay', 30],
  'telescope-crescent': ['quiet-observatory', 28],
  'survey-sphere': ['quiet-observatory', 12],
  'refinery-cross': ['ore-belt', 16],
  'freight-trident': ['ore-belt', 13],
  'forge-hammer': ['ore-belt', 13],
  'salvage-stack': ['salvage-yard', 18],
  'repair-horseshoe': ['salvage-yard', 14],
  'rescue-fork': ['rescue-waystation', 20],
  'customs-diamond': ['customs-checkpoint', 8],
  'archive-arc': ['quiet-archive', 10],
  'frontier-triangle': ['frontier-waystation', 10],
  'tether-spine': ['construction-yard', 14]
};

function detachedPurpose(body, system, key) {
  if (stationTypeFor(body).id === 'hospital-octagon' && system.systemTypeId === 'quarantine' && hash(`${key}:quarantine`) % 100 < 50) return 'quarantine-watch';
  const role = detachedRoles[stationTypeFor(body).id];
  return role && hash(`${key}:detached`) % 100 < role[1] ? role[0] : null;
}

function localReason(body, anchor, nearby) {
  const destination = names(nearby.length ? nearby : [anchor]), type = stationTypeFor(body).id;
  const job = {
    'agricultural-ladder': 'Food shipments and settlement ferries', 'greenhouse-clover': 'Greenhouse supplies and settlement ferries',
    'hospital-octagon': 'Patient transfers and medical supplies', 'rescue-fork': 'Rescue launches and medical transfers',
    'refinery-cross': 'Ore tenders and refinery crews', 'forge-hammer': 'Fabrication freight and factory crews',
    'freight-trident': 'Freight shuttles and cargo transfers', 'tether-spine': 'Construction crews and maintenance tenders',
    'survey-sphere': 'Surface survey teams and sample couriers', 'telescope-crescent': 'Local survey teams and telescope maintenance',
    'archive-arc': 'Archive couriers and visiting researchers', 'relay-spindle': 'Local communications and dispatch crews',
    'salvage-stack': 'Recovery tugs and reclaimed parts', 'repair-horseshoe': 'Repair tenders and arriving work crews',
    'customs-diamond': 'Cargo inspection and cleared planetary arrivals', 'embassy-pentagon': 'Visiting delegations and civilian ferries'
  }[type] || 'Passenger ferries, supplies and local freight';
  return `A short crossing from ${destination}${anchor.kind === 'moon' ? ', the local moon' : ''}. ${job} use this station; the approach leaves room for incoming ships.`;
}

function detachedReason(purpose, worlds) {
  const destination = names(worlds.slice(0, 3)) || 'the inhabited routes';
  return {
    'communications-relay': `A long-range relay on the outer transit lane. It passes signals between arriving ships and ${destination}, clear of the planetary approach traffic.`,
    'quiet-observatory': `A quiet observatory beyond the planetary approaches. Its instruments need dark sky and distance from the radio traffic around ${destination}.`,
    'ore-belt': `A working station at the edge of an ore field. Tenders unload beside the deposits instead of hauling every load back to ${destination}.`,
    'salvage-yard': `A recovery yard beside the working resource field. Damaged hulls and recovered machinery can be handled clear of ${destination} and its passenger approaches.`,
    'rescue-waystation': `A rescue watch on the outer transit lane. Crews intercept damaged arrivals before they attempt the crossing to ${destination}.`,
    'customs-checkpoint': `An inspection point on the outer transit lane. Arrivals clear their cargo here before entering the approaches to ${destination}.`,
    'quiet-archive': `A detached archive on a quiet outer approach. Records and receiving instruments are kept separate from the dense traffic serving ${destination}.`,
    'frontier-waystation': `A supply stop on the outer transit lane. Departing crews can refuel and repair here before leaving the route to ${destination}.`,
    'construction-yard': `An assembly yard outside the inhabited approaches. Large unfinished hulls and construction tenders have room to work clear of ${destination}.`,
    'quarantine-watch': `A quarantine watch outside the inhabited approaches. Arriving patients and suspect cargo are screened before a transfer to ${destination}.`
  }[purpose] || `A communications and emergency supply point on the outer transit lane, beyond ${destination}.`;
}

function safePosition(point, body, others, hazards) {
  const radius = bodyVisualRadius(body);
  return Math.hypot(point.x, point.y) + radius + 420 < WORLD_RADIUS &&
    others.every(other => distance(point, other) >= radius + bodyVisualRadius(other) + 350) &&
    hazards.every(other => distance(point, other) >= other.warningRadius + radius + 350);
}

function orbitalPosition(body, anchor, others, hazards, key) {
  const start = unit(`${key}:bearing`) * TAU;
  for (let ring = 0; ring < 5; ring++) {
    const gap = 420 + unit(`${key}:gap`) * 330 + ring * 25;
    const radius = bodyVisualRadius(body) + bodyVisualRadius(anchor) + gap;
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = start + attempt * 2.399963229728653;
      const point = {x:anchor.x + Math.cos(angle) * radius, y:anchor.y + Math.sin(angle) * radius};
      if (safePosition(point, body, others, hazards)) return point;
    }
  }
  return null;
}

function detachedPosition(body, purpose, worlds, others, hazards, key) {
  const belt = ['ore-belt', 'salvage-yard'].includes(purpose);
  if (belt) {
    // These are the real, released resource-field centers in engine.mjs. An
    // installation sits outside the field's maximum 1,410 m spread so its
    // docking corridor does not swallow or overwrite persistent mined rocks.
    const fields = [{x:-1920,y:1980}, {x:3750,y:1680}, {x:-3990,y:-2640}];
    const offset = 1410 + bodyVisualRadius(body) + 250;
    for (let index = 0; index < fields.length; index++) {
      const field = fields[(index + hash(`${key}:field`)) % fields.length];
      const outward = Math.atan2(field.y, field.x);
      for (const turn of [0,.4,-.4,.8,-.8,1.2,-1.2]) {
        const point = {x:field.x + Math.cos(outward + turn) * offset, y:field.y + Math.sin(outward + turn) * offset};
        if (safePosition(point, body, others, hazards) && worlds.every(candidate => distance(point, candidate) - bodyVisualRadius(body) - bodyVisualRadius(candidate) > STATION_NEIGHBORHOOD_GAP + 250)) return {...point, resourceField:{...field,radius:1410}};
      }
    }
    return null;
  }
  const start = unit(`${key}:outer-bearing`) * TAU;
  const orbit = ['quiet-observatory','quiet-archive'].includes(purpose) ? 6000 : 5350;
  for (let attempt = 0; attempt < 48; attempt++) {
    const angle = start + attempt * 2.399963229728653;
    const point = {x:Math.cos(angle) * orbit, y:Math.sin(angle) * orbit};
    if (safePosition(point, body, others, hazards) && worlds.every(candidate => distance(point, candidate) - bodyVisualRadius(body) - bodyVisualRadius(candidate) > STATION_NEIGHBORHOOD_GAP + 250)) return point;
  }
  return null;
}

/** Pure and idempotent. Independent hashes never consume a released RNG draw. */
export function decorateStationGeography(galaxy, seed = 'farwake') {
  return galaxy.map(system => {
    const original = system.bodies.map((body, index) => ({...body, ...systemBodyPosition(body, index, system.id)}));
    const worlds = original.filter(world), occupied = original.filter(body => body.kind !== 'station');
    const hazards = systemCosmicBodies(system, seed).map(body => ({...body, x:body.x * SYSTEM_SPACE_SCALE, y:body.y * SYSTEM_SPACE_SCALE}));
    const bodies = system.bodies.map((body, index) => {
      if (body.kind !== 'station') return body;
      const prior = original[index];
      if (Number(body.stationGeography?.version) >= STATION_GEOGRAPHY_VERSION) { occupied.push(prior); return body; }
      const key = `${seed}:${system.id}:${body.id}:station-geography-v1`;
      const orderedWorlds = [...worlds].sort(byDistance(prior));
      let position = prior, kind, purpose, reason, anchor, resourceField;
      if (system.authored) {
        const authored = authoredReasons[body.id];
        [kind, purpose, reason] = authored || ['transfer','frontier-waystation',`A transfer and supply point serving ${names(orderedWorlds.slice(0,3)) || 'the outer routes'}. Arriving ships wait here before entering the inhabited approaches.`];
      } else {
        purpose = detachedPurpose(body, system, key);
        if (purpose) {
          const detached = detachedPosition(body, purpose, worlds, occupied, hazards, key);
          if (detached) { position = detached; resourceField = detached.resourceField; kind = 'deep-space'; }
          else purpose = null;
        }
        if (!purpose && worlds.length) {
          const preferred = worlds.filter(candidate => candidate.kind === 'planet');
          const candidates = preferred.length ? preferred : worlds;
          const order = hash(`${key}:world`) % candidates.length;
          for (let offset = 0; offset < candidates.length; offset++) {
            const candidate = candidates[(order + offset) % candidates.length];
            const near = orbitalPosition(body, candidate, occupied, hazards, key);
            if (near) { position = near; anchor = candidate; kind = 'orbital'; purpose = 'planetary-service'; break; }
          }
        }
        if (!kind) { kind = 'deep-space'; purpose = 'communications-relay'; position = detachedPosition(body, purpose, worlds, occupied, hazards, key) || prior; }
      }
      const nearby = worlds.filter(candidate => distance(position,candidate) - bodyVisualRadius(body) - bodyVisualRadius(candidate) <= STATION_NEIGHBORHOOD_GAP).sort(byDistance(position)).slice(0,3);
      if (kind === 'orbital') reason = localReason(body, anchor, nearby);
      else if (!reason) reason = detachedReason(purpose, orderedWorlds);
      const geography = {
        version:STATION_GEOGRAPHY_VERSION, kind, purpose,
        anchorBodyIds:kind === 'orbital' ? [anchor.id] : [], nearbyBodyIds:nearby.map(candidate => candidate.id),
        servedBodyIds:kind === 'orbital' ? nearby.map(candidate => candidate.id) : orderedWorlds.slice(0,3).map(candidate => candidate.id),
        reason, legacyPosition:{x:prior.x,y:prior.y}, ...(resourceField ? {resourceField} : {})
      };
      const moved = distance(prior, position) > .001;
      const result = {...body, ...(moved ? {x:position.x / SYSTEM_SPACE_SCALE,y:position.y / SYSTEM_SPACE_SCALE} : {}), stationGeography:geography};
      occupied.push({...result,x:position.x,y:position.y});
      return result;
    });
    return {...system,bodies};
  });
}

/** Explicit old/new positions for one-time save migration; all units are metres. */
export function stationRelocations(system) {
  return (system?.bodies || []).flatMap((body, index) => {
    const from = body.stationGeography?.legacyPosition;
    if (body.kind !== 'station' || !Number.isFinite(from?.x) || !Number.isFinite(from?.y)) return [];
    const to = systemBodyPosition(body,index,system.id);
    return distance(from,to) > .001 ? [{bodyId:body.id,from:{...from},to,radius:bodyVisualRadius(body),legacyRadius:bodyVisualRadius(body)}] : [];
  });
}

/** Preserve a berth-relative pose, then clear any newly occupied station hull.
 * Caller supplies its persisted version guard; surface coordinates never enter.
 */
export function migrateStationPose(pose, relocations = [], {bodyId = null, nearby = true, clearance = 90} = {}) {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return pose;
  const candidates = bodyId ? relocations.filter(move => move.bodyId === bodyId) : relocations;
  const old = candidates.filter(move => (!nearby && bodyId) || (nearby && distance(pose,move.from) <= move.legacyRadius + 260)).sort((a,b) => distance(pose,a.from)-distance(pose,b.from))[0];
  let next = old ? {...pose,x:pose.x + old.to.x - old.from.x,y:pose.y + old.to.y - old.from.y} : pose;
  for (const move of relocations) {
    const required = move.radius + Math.max(0,clearance), current = distance(next,move.to);
    if (current >= required) continue;
    const angle = current > .001 ? Math.atan2(next.y-move.to.y,next.x-move.to.x) : Math.PI / 2;
    next = {...next,x:move.to.x+Math.cos(angle)*required,y:move.to.y+Math.sin(angle)*required};
  }
  return next === pose ? pose : {...next,vx:0,vy:0,angularVelocity:0};
}
