/** Put confirmed evacuees beside their actual clinic, using real walkable space. */
import { isWalkable } from './surface.mjs';
import { normalizeSpecies } from './species.mjs';

const plans = new WeakMap();
const distance = (one, two) => Math.hypot(one.x - two.x, one.y - two.y);
const living = person => person && person.health > 0 && person.status !== 'dead' && !person.dead;
const bodyOf = state => state.exploration?.bodyId || state.locationId;
const cap = 64;

function anchorFor(surface, game, member) {
  const report = game.recoveryReport?.(member.incidentId);
  const faction = report?.recoveryDestination?.bodyId === surface.id ? report.recoveryDestination.factionId : null;
  const medics = surface.entities.filter(entity => entity.type === 'medic' && !entity.hidden);
  return medics.find(entity => faction && entity.data?.factionId === faction) || medics[0] || null;
}

function placesNear(surface, anchor, occupied, count) {
  const size = surface.tileSize || 24, startX = Math.floor(anchor.x / size), startY = Math.floor(anchor.y / size);
  const first = startY * surface.cols + startX, seen = new Set([first]), queue = [first], found = [];
  const maxRadius = size * 16;
  for (let read = 0; read < queue.length && found.length < count; read++) {
    const cell = queue[read], x = cell % surface.cols, y = Math.floor(cell / surface.cols);
    const point = { x: (x + .5) * size, y: (y + .5) * size };
    if (distance(point, anchor) > maxRadius || !isWalkable(surface, point.x, point.y, 7)) continue;
    if (distance(point, anchor) >= 42 && !occupied.some(other => distance(point, other) < 34)) {
      found.push(point); occupied.push(point);
    }
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= surface.cols || ny >= surface.rows) continue;
      const next = ny * surface.cols + nx;
      if (seen.has(next)) continue;
      const px = (nx + .5) * size, py = (ny + .5) * size;
      if (!isWalkable(surface, (point.x + px) / 2, (point.y + py) / 2, 7)) continue;
      seen.add(next); queue.push(next);
    }
  }
  return found;
}

/** Idempotent for cached render and authoritative interaction surfaces. */
export function syncRecoveredCrewSurface(surface, game) {
  if (!surface?.entities || !game?.state) return surface;
  const state = game.state, here = bodyOf(state);
  const eligible = state.mode === 'person' && !state.interior && ['planet', 'station'].includes(surface.kind)
    && surface.id === here && (!surface.systemId || surface.systemId === state.systemId);
  const members = eligible ? (game.recoveredCrewAt?.(here, state.systemId) || []).filter(living).slice(0, cap) : [];
  const key = members.map(member => `${member.id}:${member.recoveryGroupId}:${member.incidentId}`).join('|');
  let plan = plans.get(surface);
  if (!plan || plan.key !== key) {
    surface.entities = surface.entities.filter(entity => !entity.data?.recoveredCrew);
    const occupied = [surface.spawn, surface.exit, ...surface.entities].filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
    const byAnchor = new Map(), positions = new Map();
    for (const member of members) {
      const anchor = anchorFor(surface, game, member);
      if (!anchor) continue;
      if (!byAnchor.has(anchor.id)) byAnchor.set(anchor.id, { anchor, members: [] });
      byAnchor.get(anchor.id).members.push(member);
    }
    for (const { anchor, members: group } of byAnchor.values()) {
      const places = placesNear(surface, anchor, occupied, group.length);
      group.forEach((member, index) => { if (places[index]) positions.set(member.id, places[index]); });
    }
    plan = { key, positions }; plans.set(surface, plan);
  }
  const existing = new Map(surface.entities.filter(entity => entity.data?.recoveredCrew).map(entity => [entity.data.crewId, entity]));
  for (const member of members) {
    const point = plan.positions.get(member.id);
    if (!point) continue;
    const hurt = member.health < (member.maxHealth || 100);
    const greeting = hurt ? 'I made it out, captain. I’m recovering here. Check the crew report before we leave.'
      : 'Captain. I’m here with the recovery party. We need a ship with room for us before we can sail again.';
    const update = { id: `recovered-crew:${member.id}`, type: 'npc', name: member.name, role: member.role || 'crewmate',
      species: normalizeSpecies(member.species), ...point, color: member.color || '#9fbaae', facing: 'down', moving: false,
      hidden: false, disabled: false, text: greeting, life: { activity: 'resting', label: hurt ? 'Recovering from injuries' : 'Waiting with the survivors' },
      data: { recoveredCrew: true, fixedPost: true, crewId: member.id, recoveryGroupId: member.recoveryGroupId,
        incidentId: member.incidentId, bodyId: here, systemId: state.systemId, health: member.health, maxHealth: member.maxHealth || 100,
        status: member.status, species: normalizeSpecies(member.species), roleLabel: hurt ? 'Your crew · Recovering' : 'Your crew · Evacuated', greeting } };
    if (existing.has(member.id)) Object.assign(existing.get(member.id), update);
    else surface.entities.push(update);
  }
  return surface;
}
