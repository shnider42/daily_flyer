import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { NAMED_SYSTEMS, STORY_CHAPTERS } from '../dist/content.mjs';
import { FRONTIER_SYSTEMS, systemCosmicBodies } from '../dist/galaxy-expansion.mjs';
import { COMPACT_SYSTEM_COUNT, REAL_STAR_SYSTEMS } from '../dist/compact-galaxy.mjs';
import { NEON_SYSTEM } from '../dist/neon-content.mjs';
import { FACTION_PORTS } from '../dist/port-content.mjs';
import { nearestWarzoneFactions } from '../dist/warzone-content.mjs';
import { QUEST_CONTACTS, QUEST_OBJECTS, QUEST_THREADS } from '../dist/quest-content.mjs';
import { MILITARY_MISSIONS } from '../dist/military-content.mjs';
import { EXPEDITION_SHOWCASES } from '../dist/expedition-stories.mjs';
import { SPECIES_HOMEWORLDS } from '../dist/species-content.mjs';
import { systemContext } from '../dist/encounter-context.mjs';
import { portProfile } from '../dist/port-traffic.mjs';
import { systemTypeFor } from '../dist/world-types.mjs';
import { generateSurface } from '../dist/surface.mjs';

function routesFromHearth(galaxy, range) {
  const previous = new Map([['hearth', null]]), queue = [galaxy.find(system => system.id === 'hearth')];
  for (const current of queue) for (const next of galaxy) {
    if (previous.has(next.id) || Math.hypot(next.gx - current.gx, next.gy - current.gy) > range) continue;
    previous.set(next.id, current.id);
    queue.push(next);
  }
  return previous;
}

test('the actual chart contains the 22 established destinations and four deliberate additions', () => {
  const catalogs = [NAMED_SYSTEMS, FRONTIER_SYSTEMS, NEON_SYSTEM, REAL_STAR_SYSTEMS];
  const before = structuredClone(catalogs);
  for (const seed of ['farwake', 'quiet-earth', 'compact-chart']) {
    const galaxy = buildGalaxy(seed), bodyIds = galaxy.flatMap(system => system.bodies.map(body => body.id));
    assert.equal(galaxy.length, COMPACT_SYSTEM_COUNT);
    assert.equal(galaxy.length, 26);
    assert.equal(new Set(galaxy.map(system => system.id)).size, galaxy.length);
    assert.deepEqual(galaxy.slice(0, 22).map(system => system.id), [...NAMED_SYSTEMS, ...FRONTIER_SYSTEMS, NEON_SYSTEM].map(system => system.id).concat('crosswind'));
    assert.deepEqual(galaxy.slice(22).map(system => system.id), REAL_STAR_SYSTEMS.map(system => system.id));
    assert.ok(galaxy.every(system => system.authored && !/^(?:sector|frontier)-/.test(system.id)));
    assert.equal(new Set(bodyIds).size, bodyIds.length);
    assert.equal(bodyIds.length, 71);
    for (const source of [...NAMED_SYSTEMS, ...FRONTIER_SYSTEMS, NEON_SYSTEM]) {
      const current = galaxy.find(system => system.id === source.id);
      assert.deepEqual(current.bodies.slice(0, source.bodies.length).map(body => body.id), source.bodies.map(body => body.id));
      for (let index = 0; index < source.bodies.length; index++) {
        const original = source.bodies[index], body = current.bodies[index];
        for (const key of ['id', 'name', 'kind', 'biome', 'lore', 'x', 'y']) if (Object.hasOwn(original, key)) assert.deepEqual(body[key], original[key], `${source.id}/${body.id}: ${key}`);
      }
    }
    for (const port of FACTION_PORTS) assert.ok(galaxy.find(system => system.id === port.systemId).bodies.some(body => body.id === port.id));
    assert.deepEqual(buildGalaxy(seed), galaxy);
  }
  assert.deepEqual(catalogs, before, 'building a chart leaves the shared catalogs untouched');
});

test('every authored campaign, character, deployment and expedition destination still exists', () => {
  const galaxy = buildGalaxy('story-retention'), byId = new Map(galaxy.map(system => [system.id, system]));
  const requireDestination = (systemId, bodyId, label) => {
    const system = byId.get(systemId);
    assert.ok(system, `${label}: missing system ${systemId}`);
    if (bodyId) assert.ok(system.bodies.some(body => body.id === bodyId), `${label}: missing body ${bodyId}`);
  };
  for (const entry of [...QUEST_CONTACTS, ...QUEST_OBJECTS]) requireDestination(entry.systemId, entry.bodyId, entry.id);
  for (const thread of QUEST_THREADS) for (const stage of thread.stages) if (stage.at) requireDestination(stage.at.systemId, stage.at.bodyId, `${thread.id}/${stage.id}`);
  for (const chapter of STORY_CHAPTERS) requireDestination(chapter.targetSystem, chapter.targetBody, chapter.id);
  for (const mission of MILITARY_MISSIONS) {
    requireDestination(mission.systemId, mission.bodyId, mission.id);
    if (mission.deployment) requireDestination(mission.deployment.systemId, mission.deployment.bodyId, `${mission.id}/deployment`);
  }
  const bodyIds = new Set(galaxy.flatMap(system => system.bodies.map(body => body.id)));
  for (const bodyId of Object.keys(EXPEDITION_SHOWCASES)) assert.ok(bodyIds.has(bodyId), `expedition home ${bodyId}`);
  assert.equal(new Set(Object.values(EXPEDITION_SHOWCASES).flat()).size, 49);
  for (const home of SPECIES_HOMEWORLDS) requireDestination(home.systemId, home.body.id, home.body.homeworldOf);
  assert.ok(byId.get('greenwake').bodies.some(body => body.id === 'reedbank' && body.techLevel === 'preflight'));
});

test('fold upgrades open useful regions without stranding the first campaign or its outfitting route', () => {
  const galaxy = buildGalaxy('fold-routes');
  const first = routesFromHearth(galaxy, 5), second = routesFromHearth(galaxy, 9), third = routesFromHearth(galaxy, 15);
  for (const id of ['hearth', 'vesper', 'meridian', 'brindle', 'nacre', 'cinder', 'voltage', 'crosswind', 'epsilon-eridani']) assert.ok(first.has(id), `${id} is reachable with Fold Drive I`);
  for (const chapter of STORY_CHAPTERS.slice(0, 6)) assert.ok(first.has(chapter.targetSystem), `${chapter.id} is available before the Sol upgrade`);
  assert.equal(first.size, 12);
  assert.equal(second.size, 23);
  assert.deepEqual(galaxy.filter(system => !second.has(system.id)).map(system => system.id).sort(), ['cairnsea', 'lacuna', 'umbra']);
  assert.equal(third.size, galaxy.length);
  assert.ok(!first.has('sol') && second.has('sol'), 'the second drive makes the homeward route possible');

  const game = new Game('fold-routes');
  for (const [upgrade, routes] of [['fold_1', first], ['fold_2', second], ['fold_3', third]]) {
    game.state.upgrades[upgrade] = 1;
    game._updateStats();
    for (const [id, from] of routes) {
      if (!from) continue;
      game.state.systemId = from;
      game._loadSystem(from);
      game.state.pendingEncounter = null;
      game.state.ship.fuel = game.state.ship.maxFuel;
      const quote = game.travelInfo(id);
      assert.equal(quote.ok, true, `${upgrade}: ${from} → ${id}: ${quote.reason}`);
      assert.ok(quote.fuelCost <= game.state.ship.maxFuel, 'each route leg fits a starter ship’s fuel tank');
      assert.ok(byPublicPort(game.galaxy.find(system => system.id === id)), `${id} has a public resupply stop`);
    }
  }
});

const byPublicPort = system => system.bodies.some(body => {
  const profile = portProfile(system, body);
  return profile && !profile.restricted;
});

test('compressed chart coordinates retain remote security policies and Crosswind’s established sides', () => {
  const galaxy = buildGalaxy('compact-security');
  const expected = { chorus: 'frontier', umbra: 'deep', ravel: 'frontier', cairnsea: 'frontier', brassfall: 'frontier', kindred: 'frontier', lacuna: 'deep', greenwake: 'deep' };
  for (const [id, region] of Object.entries(expected)) assert.equal(systemContext(galaxy.find(system => system.id === id)).region, region, id);
  assert.equal(systemContext(galaxy.find(system => system.id === 'epsilon-eridani')).region, 'frontier', 'a nearby working frontier does not silently become a high-security core');
  const hearth = systemContext(galaxy[0]);
  assert.equal(hearth.region, 'core');
  assert.equal(hearth.backgroundHostileCount, 0);
  const crosswind = galaxy.find(system => system.id === 'crosswind');
  assert.deepEqual(crosswind.warzoneFactions, ['freewake', 'meridian']);
  assert.deepEqual(nearestWarzoneFactions(galaxy).map(side => [side.id, side.systemId]).sort(), [['freewake', 'brindle'], ['meridian', 'meridian']]);
});

test('stellar identities survive activity decoration, runtime loading and renderer lookup', () => {
  const game = new Game('stellar-identities');
  for (const source of REAL_STAR_SYSTEMS) {
    const chart = game.galaxy.find(system => system.id === source.id);
    game.state.systemId = chart.id;
    game._loadSystem(chart.id);
    assert.deepEqual(chart.stellar, source.stellarProfile);
    assert.deepEqual(game.system.stellar, source.stellarProfile);
    assert.deepEqual(systemTypeFor(game.system).stellar, source.stellarProfile, 'the sky renderer uses the actual stellar profile');
    assert.deepEqual(systemCosmicBodies(chart, game.state.seed), [], 'a white dwarf is not a black-hole flight hazard');
  }
  const tau = game.galaxy.find(system => system.id === 'tau-ceti'), sirius = game.galaxy.find(system => system.id === 'sirius');
  assert.equal(tau.systemTypeId, 'research');
  assert.equal(tau.stellar.companions, 0);
  assert.equal(sirius.systemTypeId, 'crossroads');
  assert.equal(sirius.stellar.companions, 1);
});

test('new settlements and residents retain their own system identity on the surface', () => {
  const game = new Game('compact-residents');
  for (const source of REAL_STAR_SYSTEMS) {
    game.state.systemId = source.id;
    game._loadSystem(source.id);
    for (const body of [...source.bodies, ...game.system.bodies]) {
      const surface = generateSurface(body, game.state.seed);
      assert.equal(surface.systemId, source.id, body.id);
      assert.equal(surface.systemName, source.name, body.id);
      assert.equal(surface.faction, source.faction, body.id);
      const residents = surface.entities.filter(entity => entity.data?.systemName);
      assert.ok(residents.length, `${body.id} has local residents`);
      assert.ok(residents.every(entity => entity.data.systemId === source.id && entity.data.systemName === source.name));
      assert.ok(residents.every(entity => !entity.text?.includes('Uncharted Reach')));
      if (body.kind === 'station') {
        const merchant = surface.entities.find(entity => entity.id === `${body.id}:trader`);
        assert.ok(merchant, `${body.id} has a local merchant`);
        assert.ok(merchant.text.includes(source.name), merchant.text);
      }
    }
  }
});
