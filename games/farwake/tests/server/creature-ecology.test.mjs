import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { buildGalaxy } from '../../dist/engine.mjs';
import { explorationSites } from '../../dist/exploration.mjs';
import { storyThreats } from '../../dist/expedition-story-rules.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';
import { isWalkable } from '../../dist/surface.mjs';

const seed = 'shared-creature-ecology';
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message || `${actual} differs from ${expected}`);
const memory = () => ({ kind: 'memory', version: 0, snapshot: null, async save(id, version, snapshot) {
  this.snapshot = structuredClone(snapshot); this.version = version + 1; return { version: this.version };
} });
const pose = captain => ({ x: captain.game.state.person.x, y: captain.game.state.person.y });
const geometry = surface => ({ tiles: surface.tiles, spawn: surface.spawn, exit: surface.exit, family: surface.cavernFamily,
  entities: surface.entities.map(({ id, type, x, y }) => ({ id, type, x, y })) });
const attack = unit => Object.fromEntries(['species', 'creatureBehavior', 'phase', 'windup', 'aimAngle', 'attackX', 'attackY', 'attackTargetX', 'attackTargetY'].map(key => [key, unit[key]]));

function findCavern(predicate) {
  for (const system of buildGalaxy(seed)) for (const body of system.bodies) {
    const site = explorationSites(body, seed).find(item => item.cavern && predicate(item));
    if (site) return { systemId: system.id, bodyId: body.id, siteId: site.id, site };
  }
  assert.fail('The generated galaxy must expose the requested cavern ecology.');
}
function placeAt(realm, captain, type, id) {
  const entity = realm._surface(captain).entities.find(item => item.type === type && (!id ||
    ['recordId', 'choiceId', 'cacheId', 'siteId'].some(key => item.data?.[key] === id)));
  assert.ok(entity, `Missing ${type} ${id || ''}`);
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity;
}
async function fixture(predicate) {
  const where = findCavern(predicate), persistence = memory(), realm = new Realm({ id: 'ECOLOGY1', seed, persistence }), captains = [];
  for (let index = 0; index < 2; index++) {
    const { captain } = await realm.createCaptain(`Ecology surveyor ${index + 1}`, { startMode: 'casual', startSystemId: where.systemId });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    const room = realm._room(where.systemId); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.signals = [];
    const body = room.runtime.bodies.find(item => item.id === where.bodyId), vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    ok(await realm.command(captain, 'dock', { id: body.id }));
    placeAt(realm, captain, 'siteEntrance', where.siteId);
    ok(await realm.command(captain, 'enterSite', { siteId: where.siteId }));
  }
  return { realm, captains, persistence, where };
}
async function interact(realm, captain, type, id, action, optionId) {
  const entity = placeAt(realm, captain, type, id);
  return realm.command(captain, 'siteAction', { entityId: entity.id, action, ...(optionId ? { optionId } : {}) });
}
async function restart(f) {
  f.realm.markDirty(); await f.realm.flush();
  const realm = new Realm({ id: f.realm.id, version: f.persistence.version, snapshot: structuredClone(f.persistence.snapshot), persistence: f.persistence });
  const captains = f.captains.map(captain => realm.captains.get(captain.id));
  for (const captain of captains) ok(realm.attach(captain, { close() {} }));
  return { ...f, realm, captains };
}

test('generated cave geometry and creature preparation share one authority for two captains and survive restart', async () => {
  let f = await fixture(site => site.hostile && site.hostiles.some(unit => unit.species === 'coilworm'));
  const [one, two] = f.captains, shared = one.game.state.exploration.encounter, surface = f.realm._surface(one);
  assert.equal(shared, two.game.state.exploration.encounter);
  assert.deepEqual(geometry(surface), geometry(f.realm._surface(two)));
  assert.equal(surface.cavernFamily, f.where.site.cavernFamily);
  const unit = shared.monsters.find(monster => monster.species === 'coilworm');
  assert.ok(unit?.creatureBehavior, 'A generated creature reaches the real shared behavior implementation.');
  unit.cooldown = 2;
  const beforeTime = shared.time;
  f.realm._stepExplorations(f.captains, .2);
  near(shared.time, beforeTime + .2, 'A site advances once even when two captains occupy it.');
  near(unit.cooldown, 1.8, 'Its creature advances once, rather than once per captain.');

  const target = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(angle => ({ x: unit.x + Math.cos(angle) * 32, y: unit.y + Math.sin(angle) * 32 }))
    .find(point => isWalkable(surface, point.x, point.y));
  assert.ok(target);
  Object.assign(one.game.state.person, target, { health: 90, down: false });
  Object.assign(unit, { cooldown: 0, phase: 'idle', alert: true });
  f.realm._stepExplorations(f.captains, .1);
  assert.equal(unit.phase, 'windup', 'The live encounter begins a readable, locked attack.');
  const beforeAttack = attack(unit), beforeGeometry = geometry(surface), beforePositions = f.captains.map(pose);
  const full = f.realm.snapshotFor(one, { drainEvents: false });
  const merged = mergeSnapshot(f.realm.snapshotFor(two, { drainEvents: false }), f.realm.snapshotFor(two, { compact: true, drainEvents: false }));
  for (const packet of [full, merged]) assert.deepEqual(attack(packet.state.exploration.encounter.monsters.find(monster => monster.id === unit.id)), beforeAttack);

  f = await restart(f);
  const restored = f.captains[0].game.state.exploration.encounter, live = restored.monsters.find(monster => monster.id === unit.id);
  assert.equal(restored, f.captains[1].game.state.exploration.encounter);
  assert.deepEqual(geometry(f.realm._surface(f.captains[0])), beforeGeometry);
  assert.deepEqual(f.captains.map(pose), beforePositions, 'Each captain resumes their own saved position.');
  assert.deepEqual(attack(live), beforeAttack);
  f.realm._stepExplorations(f.captains, .1);
  near(live.windup, beforeAttack.windup - .1);
  assert.equal(f.captains[0].game.state.person.health, 90, 'Restoring preparation cannot turn it into an immediate hit.');

  assert.ok(storyThreats(restored).length);
  placeAt(f.realm, f.captains[0], 'siteExit');
  ok(await f.realm.command(f.captains[0], 'exitSite'));
  assert.equal(f.captains[0].game.state.exploration, null, 'A living threat never seals the optional escape.');
  assert.equal(f.captains[1].game.state.exploration.encounter, restored);
});

test('quiet generated fauna stay neutral and evidence, casualties and paid survey claims persist together', async () => {
  let f = await fixture(site => site.hostiles.length >= 2 && site.hostiles.every(unit => unit.hostileToPlayer === false));
  const [one, two] = f.captains, shared = one.game.state.exploration.encounter, animal = shared.monsters[0];
  assert.equal(shared, two.game.state.exploration.encounter);
  for (const [index, captain] of f.captains.entries()) {
    Object.assign(captain.game.state.person, { x: animal.x + (index ? -24 : 24), y: animal.y, health: 70, down: false });
    captain.game.events = [];
  }
  for (let step = 0; step < 8; step++) f.realm._stepExplorations(f.captains, .2);
  assert.deepEqual(f.captains.map(captain => captain.game.state.person.health), [70, 70]);
  assert.equal(storyThreats(shared).length, 0);
  assert.ok(shared.monsters.every(unit => unit.hostileToPlayer === false && !unit.aggressors?.length && unit.phase === 'idle'));
  assert.ok(f.captains.every(captain => !captain.game.events.some(event => event.type === 'person-hit')));

  assert.equal((await interact(f.realm, one, 'siteChoice', 'survey-complete', 'choose', 'record')).ok, false);
  ok(await interact(f.realm, one, 'siteRecord', 'survey', 'inspect'));
  ok(await interact(f.realm, two, 'siteRecord', 'ecology', 'inspect'));
  const beforeCredits = f.captains.map(captain => captain.game.state.credits);
  ok(await interact(f.realm, one, 'siteCache', 'survey-kit', 'collect'));
  assert.equal(one.game.state.person.health, 100);
  const paid = ok(await interact(f.realm, two, 'siteChoice', 'survey-complete', 'choose', 'record'));
  assert.equal(one.game.state.credits, beforeCredits[0]);
  assert.equal(two.game.state.credits, beforeCredits[1] + paid.credits);

  // Seed a casualty and a wounded survivor at the persistence boundary; combat
  // attack semantics are covered separately by the shared creature-rule tests.
  Object.assign(shared.monsters[0], { health: 0, status: 'dead', phase: 'dead' });
  shared.monsters[1].health = Math.floor(shared.monsters[1].maxHealth / 2);
  const surface = f.realm._surface(one);
  Object.assign(one.game.state.person, { x: surface.spawn.x + 24, y: surface.spawn.y });
  Object.assign(two.game.state.person, { x: surface.spawn.x, y: surface.spawn.y - 24 });
  assert.ok(f.captains.every(captain => isWalkable(surface, captain.game.state.person.x, captain.game.state.person.y)));
  const beforePositions = f.captains.map(pose), beforeGeometry = geometry(surface);
  const beforePopulation = shared.monsters.map(({ id, species, health, x, y }) => ({ id, species, health, x, y }));
  const beforeWallets = f.captains.map(captain => ({ credits: captain.game.state.credits, cargo: structuredClone(captain.game.state.cargo) }));
  f = await restart(f);
  const resumed = f.captains[0].game.state.exploration.encounter;
  assert.equal(resumed, f.captains[1].game.state.exploration.encounter);
  assert.deepEqual(geometry(f.realm._surface(f.captains[0])), beforeGeometry);
  assert.deepEqual(f.captains.map(pose), beforePositions);
  assert.deepEqual(resumed.monsters.map(({ id, species, health, x, y }) => ({ id, species, health, x, y })), beforePopulation);
  assert.equal(resumed.monsters[0].status, 'dead');
  assert.equal(storyThreats(resumed).length, 0);
  assert.deepEqual(new Set(resumed.story.readRecords), new Set(['survey', 'ecology']));
  assert.equal(resumed.choices['survey-complete'], 'record');
  assert.ok(resumed.collected.includes('survey-kit'));
  assert.equal((await interact(f.realm, f.captains[0], 'siteCache', 'survey-kit', 'collect')).ok, false);
  assert.equal((await interact(f.realm, f.captains[0], 'siteChoice', 'survey-complete', 'choose', 'record')).ok, false);
  assert.deepEqual(f.captains.map(captain => ({ credits: captain.game.state.credits, cargo: captain.game.state.cargo })), beforeWallets);
});

test('defending against one mixed-cave species does not recruit its neutral neighbor', async () => {
  let f = await fixture(site => site.hostiles.some(unit => unit.hostileToPlayer === false) && site.hostiles.some(unit => unit.hostileToPlayer === true));
  const [one] = f.captains, shared = one.game.state.exploration.encounter, surface = f.realm._surface(one);
  const neutral = shared.monsters.find(unit => unit.hostileToPlayer === false), target = shared.monsters.find(unit => unit.hostileToPlayer === true);
  const from = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(angle => ({ x: target.x + Math.cos(angle) * 32, y: target.y + Math.sin(angle) * 32 }))
    .find(point => isWalkable(surface, point.x, point.y));
  assert.ok(from);
  Object.assign(one.game.state.person, from);
  const before = { target: target.health, neutral: neutral.health };
  one.appliedInput = { fire: true, aiming: true, aimX: target.x - from.x, aimY: target.y - from.y };
  f.realm._stepExplorations(f.captains, .05);
  one.appliedInput = {};
  assert.ok(target.health < before.target, 'The real shared sidearm path hits the hostile animal.');
  assert.ok(target.aggressors.includes(one.id));
  assert.equal(neutral.health, before.neutral);
  assert.deepEqual(neutral.aggressors, []);
  assert.equal(neutral.phase, 'idle');
  assert.equal(storyThreats(shared).some(unit => unit.id === neutral.id), false);

  f = await restart(f);
  const restored = f.captains[1].game.state.exploration.encounter;
  assert.ok(restored.monsters.find(unit => unit.id === target.id).aggressors.includes(one.id));
  const neighbor = restored.monsters.find(unit => unit.id === neutral.id);
  assert.equal(neighbor.hostileToPlayer, false);
  assert.deepEqual(neighbor.aggressors, []);
  assert.equal(storyThreats(restored).some(unit => unit.id === neutral.id), false);
});
