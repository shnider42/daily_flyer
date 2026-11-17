import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface, isWalkable, nearestEntity } from '../dist/surface.mjs';
import { updateNpcLife } from '../dist/npc-life.mjs';
import { syncRecoveredCrewSurface } from '../dist/survivor-surface.mjs';
import { liveInteractionSurface } from '../dist/live-surface.mjs';

function scene(systemId = 'crosswind', bodyId = 'crosswind-vey', factionId = 'freewake') {
  const game = new Game('survivors-ashore', { startContext: 'solo', startMode: 'casual', casualCrewCount: 8, starterShip: 'osprey' });
  const members = structuredClone(game.state.crew).map(member => ({ ...member, status: 'recovered', recoveryGroupId: 'crew-recovery:1', incidentId: 'incident:1' }));
  members[0].health = 37;
  game.state.systemId = systemId; game._loadSystem(systemId);
  game._arriveAsPassenger(game.system.bodies.find(body => body.id === bodyId));
  game.recoveredCrewAt = (body, system) => body === bodyId && system === systemId ? members : [];
  game.recoveryReport = () => ({ id: 'incident:1', recoveryDestination: { systemId, bodyId, factionId }, crew: members });
  const surface = generateSurface(game.currentBody, game.state.seed, game.state.flags);
  return { game, members, surface };
}
const survivors = surface => surface.entities.filter(entity => entity.data?.recoveredCrew);
function reachable(surface, start, target) {
  const tile = surface.tileSize, key = point => `${Math.floor(point.x / tile)},${Math.floor(point.y / tile)}`;
  const queue = [start], seen = new Set([key(start)]), wanted = key(target);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const point = queue[cursor]; if (key(point) === wanted) return true;
    for (const [dx, dy] of [[-tile, 0], [tile, 0], [0, -tile], [0, tile]]) {
      const next = { x: point.x + dx, y: point.y + dy }, id = key(next);
      if (seen.has(id) || !isWalkable(surface, next.x, next.y, 7) || !isWalkable(surface, point.x + dx / 2, point.y + dy / 2, 7)) continue;
      seen.add(id); queue.push(next);
    }
  }
  return false;
}

for (const factionId of ['freewake', 'meridian']) test(`eight real evacuees are visible and reachable at the ${factionId} aid post`, () => {
  const { game, members, surface } = scene('crosswind', 'crosswind-vey', factionId);
  syncRecoveredCrewSurface(surface, game);
  const people = survivors(surface), medic = surface.entities.find(entity => entity.id === `field-medic:${factionId}`);
  assert.equal(people.length, 8); assert.deepEqual(people.map(person => person.data.crewId), members.map(person => person.id));
  assert.equal(new Set(people.map(person => `${person.x}:${person.y}`)).size, 8);
  for (const person of people) {
    assert.ok(isWalkable(surface, person.x, person.y, 7));
    assert.ok(Math.hypot(person.x - medic.x, person.y - medic.y) < 240);
    assert.ok(reachable(surface, medic, person)); assert.equal(nearestEntity(surface, person, 1)?.id, person.id);
  }
  assert.equal(people[0].data.health, 37);
  const poses = people.map(({ x, y }) => [x, y]); updateNpcLife(surface, 800);
  assert.deepEqual(people.map(({ x, y }) => [x, y]), poses, 'ambient schedules cannot move injured people away from their aid post');
  syncRecoveredCrewSurface(surface, game); assert.equal(survivors(surface).length, 8);
});

test('home-port survivors use the clinic and disappear from a stale cached surface after rejoining', () => {
  const { game, members, surface } = scene('hearth', 'morrow', null);
  syncRecoveredCrewSurface(surface, game); assert.equal(survivors(surface).length, 8);
  const medic = surface.entities.find(entity => entity.type === 'medic');
  assert.ok(survivors(surface).every(person => reachable(surface, medic, person)));
  members.splice(0); syncRecoveredCrewSurface(surface, game);
  assert.equal(survivors(surface).length, 0);
});

test('dead people, virtual reserves and a different port do not become survivor actors', () => {
  const { game, members, surface } = scene(); members[0].health = 0; members[0].status = 'dead';
  syncRecoveredCrewSurface(surface, game); assert.equal(survivors(surface).length, 7);
  assert.ok(survivors(surface).every(person => person.data.health > 0));
  game.state.locationId = 'morrow'; game.state.exploration = null;
  syncRecoveredCrewSurface(surface, game); assert.equal(survivors(surface).length, 0);
});

test('interaction fallback contains the same survivors as the visible clinic', () => {
  const { game, surface } = scene();
  const authoritative = liveInteractionSurface(game, surface);
  assert.equal(survivors(authoritative).length, 8);
  assert.equal(survivors(authoritative)[0].data.recoveryGroupId, 'crew-recovery:1');
});
