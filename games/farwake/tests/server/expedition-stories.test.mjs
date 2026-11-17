import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { buildGalaxy } from '../../dist/engine.mjs';
import { explorationSites } from '../../dist/exploration.mjs';
import { storyStatus } from '../../dist/expedition-story-rules.mjs';
import { isWalkable } from '../../dist/surface.mjs';

const seed = 'shared-authored-expeditions';
const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };
const memory = () => ({ kind: 'memory', version: 0, snapshot: null, async save(id, version, snapshot) { this.snapshot = structuredClone(snapshot); this.version = version + 1; return { version: this.version }; } });
function findStory(archetypeId) {
  for (const system of buildGalaxy(seed)) for (const body of system.bodies) {
    const site = explorationSites(body, seed).find(item => item.archetypeId === archetypeId);
    if (site) return { systemId: system.id, bodyId: body.id, siteId: site.id, site };
  }
  assert.fail(`No world exposes ${archetypeId}.`);
}
function placeAt(realm, captain, type, id) {
  const entity = realm._surface(captain).entities.find(item => item.type === type && (!id || item.data.recordId === id || item.data.choiceId === id || item.data.siteId === id));
  assert.ok(entity, `Missing ${type} ${id || ''}`); Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity;
}
async function fixture(archetypeId) {
  const where = findStory(archetypeId), persistence = memory(), realm = new Realm({ id: 'STORY01', seed, persistence }), captains = [];
  for (let index = 0; index < 2; index++) {
    const { captain } = await realm.createCaptain(`Field researcher ${index + 1}`, { startMode: 'casual', startSystemId: where.systemId });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    assert.equal(captain.game.state.systemId, where.systemId);
    const room = realm._room(where.systemId); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.signals = [];
    const body = room.runtime.bodies.find(item => item.id === where.bodyId), vessel = realm.vessels.get(captain.ownedVesselId);
    assert.ok(body); Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    ok(await realm.command(captain, 'dock', { id: body.id }));
    placeAt(realm, captain, 'siteEntrance', where.siteId); ok(await realm.command(captain, 'enterSite', { siteId: where.siteId }));
  }
  return { realm, captains, persistence, where };
}
async function read(realm, captain, id) {
  const entity = placeAt(realm, captain, 'siteRecord', id);
  return ok(await realm.command(captain, 'siteAction', { entityId: entity.id, action: 'inspect' }));
}
async function choose(realm, captain, id, optionId, commandId) {
  const entity = placeAt(realm, captain, 'siteChoice', id);
  return realm.command(captain, 'siteAction', { entityId: entity.id, action: 'choose', optionId }, commandId);
}
async function restart(fixture) {
  fixture.realm.markDirty(); await fixture.realm.flush();
  const realm = new Realm({ id: fixture.realm.id, version: fixture.persistence.version, snapshot: structuredClone(fixture.persistence.snapshot), persistence: fixture.persistence });
  const captains = fixture.captains.map(original => realm.captains.get(original.id));
  for (const captain of captains) ok(realm.attach(captain, { close() {} }));
  return { ...fixture, realm, captains };
}

test('two captains share evidence and race one final authored decision, with one payment and durable aftermath', async () => {
  const f = await fixture('witness-archive'), { realm, captains: [one, two], where } = f;
  const shared = one.game.state.exploration.encounter;
  assert.equal(shared, two.game.state.exploration.encounter);
  assert.match((await choose(realm, two, 'archive', 'license')).reason, /Two clocks/);
  await read(realm, one, 'dock-account'); await read(realm, two, 'survey-account');
  assert.deepEqual(new Set(shared.story.readRecords), new Set(['dock-account', 'survey-account']));
  ok(await choose(realm, one, 'clock-test', 'align'));
  for(const captain of [one,two])Object.assign(captain.game.state.rep,{lantern:99,meridian:99});
  const before = [one, two].map(captain => ({ credits: captain.game.state.credits, rep: structuredClone(captain.game.state.rep) }));
  const first = placeAt(realm, one, 'siteChoice', 'archive'), second = placeAt(realm, two, 'siteChoice', 'archive');
  const results = await Promise.all([
    realm.command(one, 'siteAction', { entityId: first.id, action: 'choose', optionId: 'public' }, 'archive-final-one'),
    realm.command(two, 'siteAction', { entityId: second.id, action: 'choose', optionId: 'license' }, 'archive-final-two')
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  const index = results.findIndex(result => result.ok), winner = [one, two][index], loser = [one, two][1 - index], reward = results[index];
  assert.equal(winner.game.state.credits, before[index].credits + reward.credits);
  assert.equal(loser.game.state.credits, before[1 - index].credits);
  for (const [faction, delta] of Object.entries(reward.rep)) assert.equal(winner.game.state.rep[faction], before[index].rep[faction] + delta);
  assert.equal(reward.rep[index===0?'lantern':'meridian'],1,'The result reports the actual reputation change at the standing cap.');
  assert.deepEqual(loser.game.state.rep, before[1 - index].rep);
  assert.equal(storyStatus(shared, where.site).completed, true); assert.ok(storyStatus(shared, where.site).aftermath.length > 20);
  const winningOption = index === 0 ? 'public' : 'license', winningToken = index === 0 ? 'archive-final-one' : 'archive-final-two';
  ok(await choose(realm, winner, 'archive', winningOption, winningToken));
  assert.equal(winner.game.state.credits, before[index].credits + reward.credits, 'An acknowledged retry returns the original answer without another payment.');

  const returned = await restart(f), [resumedOne, resumedTwo] = returned.captains;
  const restored = resumedOne.game.state.exploration.encounter;
  assert.equal(restored, resumedTwo.game.state.exploration.encounter); assert.equal(restored.choices.archive, winningOption);
  assert.equal(storyStatus(restored, where.site).aftermath, storyStatus(shared, where.site).aftermath);
  assert.equal((await choose(returned.realm, returned.captains[1 - index], 'archive', 'public')).ok, false);
  assert.equal(returned.captains[index].game.state.credits, before[index].credits + reward.credits);
  assert.deepEqual(returned.captains[index].game.state.rep, winner.game.state.rep);
});

test('shared puzzle progress survives reconnect and only the completed repair releases the payment', async () => {
  let f = await fixture('tidal-intake');
  const before = f.captains.map(captain => captain.game.state.credits);
  await read(f.realm, f.captains[0], 'plate');
  const step = ok(await choose(f.realm, f.captains[0], 'isolate', 'stop')); assert.equal(step.completed, false);
  f = await restart(f);
  const [one, two] = f.captains;
  assert.deepEqual(two.game.state.exploration.encounter.story.puzzles.isolate, ['stop']);
  ok(await choose(f.realm, two, 'isolate', 'gate')); ok(await choose(f.realm, one, 'isolate', 'filter'));
  assert.equal(one.game.state.exploration.encounter.choices.isolate, 'complete');
  assert.deepEqual([one.game.state.credits, two.game.state.credits], before);
  ok(await choose(f.realm, one, 'restart', 'filter')); ok(await choose(f.realm, two, 'restart', 'gate'));
  const result = ok(await choose(f.realm, two, 'restart', 'run')); assert.equal(result.completed, true);
  assert.equal(one.game.state.credits, before[0]); assert.equal(two.game.state.credits, before[1] + result.credits);
  assert.equal((await choose(f.realm, one, 'restart', 'run')).ok, false);
});

test('a disconnected captain is excluded from authored threat targeting during reconnect grace', async () => {
  const { realm, captains: [observer, departing] } = await fixture('buried-armistice');
  const shared = observer.game.state.exploration.encounter, surface = realm._surface(observer), sentinel = shared.monsters[0];
  assert.equal(sentinel.combatProfile, 'sentinel');
  let near = null;
  for (let radius = 24; radius <= 96 && !near; radius += 24) for (let direction = 0; direction < 8; direction++) {
    const candidate = { x: sentinel.x + Math.cos(direction * Math.PI / 4) * radius, y: sentinel.y + Math.sin(direction * Math.PI / 4) * radius };
    if (isWalkable(surface, candidate.x, candidate.y)) { near = candidate; break; }
  }
  assert.ok(near); Object.assign(departing.game.state.person, near, { health: 80, down: false });
  Object.assign(observer.game.state.person, surface.spawn); sentinel.alert = true;
  realm.detach(departing, departing.session);
  for (let tick = 0; tick < 80; tick++) realm._stepExplorations([observer, departing], .1);
  assert.equal(departing.game.state.person.health, 80);
  assert.ok(shared.monsters.every(unit => unit.targetId !== departing.id));
  assert.equal(departing.game.events.some(event => event.type === 'person-hit' && event.targetId === departing.id), false);
});
