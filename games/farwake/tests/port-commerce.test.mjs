import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || result?.message); return result; };
function land(game, id) {
  const body = game.system.bodies.find(body => body.id === id);
  Object.assign(game.state.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
  ok(game.dock(id));
}
function funded(seed) {
  const game = new Game(seed);
  game.state.credits = 5000;
  game.state.cargo = { ore: 20, crystal: 4 };
  return game;
}

test('barren Tinbell rejects all port commerce without changing the captain, cargo, or ship', () => {
  const game = funded('uninhabited-commerce');
  land(game, 'morrow');
  ok(game.buyShip('mule')); ok(game.selectShip('sparrow'));
  const crew = ok(game.recruitCrew('engineer')).crew;
  crew.health -= 20;
  const contract = game.availableJobs().find(job => job.type === 'mining');
  ok(game.acceptJob(contract.id));
  ok(game.launch()); land(game, 'tinbell');
  Object.assign(game.state.ship, { hull: 20, fuel: 1 });
  game.state.person.health = 30;
  assert.equal(game.atInhabitedPort, false);
  assert.deepEqual(game.availableJobs(), []);
  assert.deepEqual(game.availableJobs('tinbell'), []);
  assert.equal(generateSurface(game.currentBody, game.state.seed).barren, true);
  const before = structuredClone(game.state);
  for (const attempt of [
    () => game.buyUpgrade('thrusters_1'), () => game.buyShip('kestrel'), () => game.selectShip('mule'),
    () => game.recruitCrew('medic'), () => game.dismissCrew(crew.id), () => game.healCrew(crew.id),
    () => game.acceptJob('hearth:tinbell:jobs:0:work'), () => game.turnInJob(contract.id),
    ...['repair', 'refuel', 'rest', 'sell', 'sellOre', 'sellCrystal', 'emergency'].map(action => () => game.service(action))
  ]) {
    assert.equal(attempt().code, 'mode');
    assert.deepEqual(game.state, before, 'A rejected remote purchase cannot spend or grant anything.');
  }
});

test('Morrow retains working upgrades, hull changes, crew care, trade, services, and paid contracts', () => {
  const game = funded('inhabited-commerce'); land(game, 'morrow');
  assert.equal(game.atInhabitedPort, true);
  ok(game.buyUpgrade('thrusters_1')); ok(game.buyShip('mule')); ok(game.selectShip('sparrow'));
  const crew = ok(game.recruitCrew('engineer')).crew;
  crew.health -= 20; ok(game.healCrew(crew.id)); assert.equal(crew.health, crew.maxHealth);
  ok(game.dismissCrew(crew.id)); assert.equal(game.livingCrew.length, 0);
  game.state.ship.hull -= 10; game.state.ship.fuel -= 5; game.state.person.health -= 20;
  for (const action of ['repair', 'refuel', 'rest']) {
    const before = game.state.credits, quote = game.serviceQuote(action);
    ok(game.service(action)); assert.equal(game.state.credits, before - quote.cost);
  }
  const cargoValue = game.serviceQuote('sell').value, credits = game.state.credits;
  ok(game.service('sell')); assert.equal(game.state.credits, credits + cargoValue); assert.equal(game.cargoUsed, 0);
  const work = game.availableJobs().find(job => job.type === 'work'); ok(game.acceptJob(work.id));
  for (let i = 0; i < 3; i++) ok(game.progressJob(work.id, 1, { token: 'morrow-panel-' + i }));
  const earned = game.state.credits; ok(game.turnInJob(work.id)); assert.equal(game.state.credits, earned + work.reward);
});

test('port status follows the actual body and matches barren surface kinds and biomes', () => {
  const game = new Game('port-kinds');
  assert.equal(game.atInhabitedPort, false);
  land(game, 'tinbell');
  const body = game.currentBody;
  for (const [kind, biome, inhabited] of [
    ['moon', 'barren', false], ['moon', 'rocky', false], ['asteroid', 'dust', false],
    ['moon', 'ice', true], ['planet', 'barren', true], ['station', 'station', true]
  ]) {
    Object.assign(body, { kind, biome });
    assert.equal(game.atInhabitedPort, inhabited, kind + ':' + biome);
    assert.equal(!!generateSurface(body, game.state.seed).barren, !inhabited, 'Rendered services and engine availability agree.');
  }
  game.state.interior = { kind: 'ship', location: { id: 'own-ship', kind: 'ship', biome: 'ship' } };
  assert.equal(game.atInhabitedPort, false);
  game.state.interior = null; game.state.locationId = 'missing-body';
  assert.equal(game.atInhabitedPort, false);
});

test('new delivery offers skip an uninhabited first destination', () => {
  const game = new Game('safe-contract-destination'); land(game, 'morrow');
  const order = ['tinbell', 'morrow', 'kettle'];
  game.system.bodies.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const delivery = game.availableJobs().find(job => job.type === 'delivery');
  assert.equal(delivery.targetBody, 'kettle');
  ok(game.acceptJob(delivery.id)); ok(game.launch()); land(game, 'kettle');
  const before = game.state.credits; ok(game.turnInJob(delivery.id));
  assert.equal(game.state.credits, before + delivery.reward);
});

test('old moon work relocates once on restore and can be finished for its original reward', () => {
  const game = new Game('legacy-moon-contract'); land(game, 'tinbell');
  const work = {
    ...game.availableJobs('kettle').find(job => job.type === 'work'),
    id: 'hearth:tinbell:jobs:0:work', originBody: 'tinbell', targetBody: 'tinbell',
    status: 'active', progress: 1, tokens: ['old-tinbell-panel'], reward: 173
  };
  game.state.missions.push(work);
  const credits = game.state.credits;
  let restored = Game.fromSave(game.save());
  let moved = restored.state.missions.find(job => job.id === work.id);
  assert.equal(moved.targetSystem, 'hearth'); assert.equal(moved.targetBody, 'kettle');
  assert.equal(moved.reward, 173); assert.equal(moved.progress, 1); assert.equal(moved.status, 'active');
  assert.deepEqual(moved.tokens, work.tokens); assert.deepEqual(moved.relocatedFrom, { systemId: 'hearth', bodyId: 'tinbell' });
  assert.match(moved.description, /Kettle Station/); assert.equal(restored.state.credits, credits);
  assert.equal(restored.state.journal.filter(entry => entry.title === 'Contract exchange moved').length, 1);
  restored = Game.fromSave(restored.save());
  assert.equal(restored.state.journal.filter(entry => entry.title === 'Contract exchange moved').length, 1);
  ok(restored.launch()); land(restored, 'kettle');
  ok(restored.progressJob(work.id, 1, { token: 'new-kettle-panel-1' }));
  ok(restored.progressJob(work.id, 1, { token: 'new-kettle-panel-2' }));
  const before = restored.state.credits; ok(restored.turnInJob(work.id));
  assert.equal(restored.state.credits, before + 173);
  assert.equal(restored.turnInJob(work.id).ok, false);
});

test('legacy deliveries return to their inhabited origin and fallback destinations stay in their recorded system', () => {
  const game = new Game('scoped-legacy-contracts');
  const base = game.availableJobs('kettle').find(job => job.type === 'delivery');
  const delivery = { ...base, id: 'legacy-delivery', originBody: 'morrow', targetBody: 'tinbell', status: 'ready', progress: 1, reward: 191, tokens: [] };
  const remote = { ...base, id: 'legacy-cairn', type: 'survey', originSystem: 'meridian', originBody: 'cairn', targetSystem: 'meridian', targetBody: 'cairn', status: 'active', goal: 2, progress: 1, reward: 209, tokens: ['old-survey'] };
  const completed = { ...remote, id: 'finished-cairn', status: 'completed', progress: 2 };
  const differentlyScoped = { ...remote, id: 'scoped-mismatch', targetBody: 'tinbell' };
  const unaffected = { ...delivery, id: 'normal-contract', targetBody: 'morrow' };
  game.state.missions = [delivery, remote, completed, differentlyScoped, unaffected];
  const restored = Game.fromSave(game.save());
  const [parcel, survey, paid, mismatch, normal] = restored.state.missions;
  assert.equal(parcel.targetBody, 'morrow'); assert.equal(parcel.targetSystem, 'hearth');
  assert.equal(parcel.reward, 191); assert.equal(parcel.progress, 1); assert.equal(parcel.status, 'ready');
  assert.match(parcel.title, /Morrow/); assert.match(parcel.description, /Morrow/);
  assert.equal(survey.targetSystem, 'meridian'); assert.equal(survey.targetBody, 'serein');
  assert.equal(survey.progress, 1); assert.equal(survey.reward, 209); assert.deepEqual(survey.tokens, ['old-survey']);
  assert.deepEqual(paid, completed); assert.deepEqual(mismatch, differentlyScoped); assert.deepEqual(normal, unaffected);
  land(restored, 'morrow'); const before = restored.state.credits;
  ok(restored.turnInJob(parcel.id)); assert.equal(restored.state.credits, before + 191);
});
