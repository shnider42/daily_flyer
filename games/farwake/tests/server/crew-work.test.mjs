import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { Game } from '../../dist/engine.mjs';
import { cabinLayout } from '../../dist/interior-layouts.mjs';
import { crewTaskDefinition } from '../../dist/crew-work.mjs';
import { InteriorPresentation } from '../../dist/interior-presentation.mjs';
import { isWalkable } from '../../dist/surface.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const storage = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
async function fixture(seed = 'crew-work-four', count = 1) {
  const realm = new Realm({ id: 'CREWWORK', seed, persistence: storage() }), captains = [];
  for (let index = 0; index < count; index++) {
    const { captain } = await realm.createCaptain(`Working captain ${index + 1}`, { startMode: 'hardcore' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
  }
  const room = realm._room('hearth');
  for (const field of ['enemies', 'bullets', 'signals', 'pickups']) room.runtime[field] = [];
  return { realm, captains, room };
}
function tick(realm, count = 1) { for (let index = 0; index < count; index++) { const at = Date.now(); realm.step(.1, realm.tick + 1, at, at); } }
function contract(captain) { return captain.game.state.npcContract; }
function vessel(realm, captain) { return realm.vessels.get(contract(captain).vesselId); }
function offer(captain, familyId) {
  const value = captain.game.npcContractOffers().find(value => value.familyId === familyId);
  assert.ok(value, `${familyId} is on this seeded board.`); return value;
}
async function hire(realm, captain, familyId) {
  const selected = offer(captain, familyId);
  ok(await realm.command(captain, 'acceptNpcContract', { roleId: selected.roleId, offerId: selected.offerId }));
  assert.equal(contract(captain).version, 2); return selected;
}
function task(captain) { return crewTaskDefinition(contract(captain)); }
function standAtTask(realm, captain, definition = task(captain)) {
  assert.ok(definition);
  const surface = realm._surface(captain);
  const point = definition.station === 'eva' ? surface.entities.find(entity => entity.id === 'eva:repair') : cabinLayout(vessel(realm, captain).ship.classId).stations[definition.station];
  assert.ok(point, `Physical ${definition.station} work point exists.`);
  Object.assign(captain.game.state.person, { x: point.x, y: point.y }); return definition;
}
function solve(realm, captain) {
  const definition = standAtTask(realm, captain);
  return realm._command(captain, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution });
}
function until(realm, predicate, maxTicks = 5000) {
  for (let index = 0; index < maxTicks && !predicate(); index++) tick(realm);
  assert.ok(predicate(), 'The actual NPC-piloted route reaches its expected phase.');
}

test('the authority accepts its generated work order once and rejects forged or stale offers', async () => {
  const { realm, captains: [captain] } = await fixture();
  const selected = offer(captain, 'freight'), credits = captain.game.state.credits;
  assert.equal(captain.game.npcContractOffers().length, 8);
  assert.equal((await realm.command(captain, 'acceptNpcContract', { roleId: 'cargo', offerId: 'invented', reward: 999999, cost: -99999 })).ok, false);
  assert.equal(captain.game.state.credits, credits); assert.equal(realm.vessels.size, 0);
  const accepted = ok(await realm.command(captain, 'acceptNpcContract', { roleId: selected.roleId, offerId: selected.offerId, reward: 999999, cost: -99999 }, 'hire-once'));
  assert.equal(contract(captain).version, 2); assert.equal(contract(captain).reward, selected.reward);
  assert.equal(contract(captain).assignment.offerId, selected.offerId);
  assert.equal(captain.game.state.credits, credits); assert.equal(realm.vessels.size, 1);
  assert.deepEqual(ok(await realm.command(captain, 'acceptNpcContract', { roleId: selected.roleId, offerId: selected.offerId }, 'hire-once')), accepted);
  assert.equal(realm.vessels.size, 1);
  ok(await realm.command(captain, 'cancelNpcContract'));
  ok(await realm.command(captain, 'completeNpcContract'));
  assert.equal((await realm.command(captain, 'acceptNpcContract', { roleId: selected.roleId, offerId: selected.offerId })).ok, false, 'A settled order is not reissued under its old serial.');
  assert.equal(captain.game.state.credits, credits);
});

test('tasks require their real worker, current work order, station, answer and destination', async () => {
  const { realm, captains: [captain, stranger] } = await fixture('crew-work-four', 2); await hire(realm, captain, 'freight');
  const work = contract(captain), definition = task(captain), employer = vessel(realm, captain);
  const startingPose = { x: employer.ship.x, y: employer.ship.y };
  tick(realm, 100);
  assert.equal(work.phase, 'boarding'); assert.equal(work.assignment.tasks[0].done, false);
  assert.ok(Math.hypot(employer.ship.x - startingPose.x, employer.ship.y - startingPose.y) < 1, 'Departure waits for actual preparation.');
  Object.assign(captain.game.state.person, { x: 0, y: 0 });
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution, x: 999, y: 999 })).ok, false);
  assert.equal((await realm.command(stranger, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution, workerId: captain.id, vesselId: employer.id })).ok, false);
  standAtTask(realm, captain, definition);
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'task', taskId: 'another-watch:prep', solution: definition.solution })).ok, false);
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution.map(() => 'wrong') })).ok, false);
  const snapshot = realm.snapshotFor(captain, { drainEvents: false }), publicGame = Game.fromSave(snapshot.state);
  assert.equal(publicGame.npcContractStatus().activeTask.puzzle.solution, undefined);
  const solved = ok(await realm.command(captain, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution }, 'prep-once'));
  assert.deepEqual(ok(await realm.command(captain, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution }, 'prep-once')), solved);
  assert.equal(work.assignment.tasks.filter(value => value.done).length, 1);
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'task', taskId: definition.id, solution: definition.solution })).ok, false);
  const delivery = task(captain); standAtTask(realm, captain, delivery);
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'task', taskId: delivery.id, solution: delivery.solution, visitedDestination: true, done: true })).ok, false);
  assert.equal((await realm.command(captain, 'completeNpcContract', { reward: 999999 })).ok, false);
  assert.equal(work.assignment.delivered, false); assert.equal(captain.game.state.credits, 180);
});

test('four ordinary working voyages progress independently and pay only after their actual return', async () => {
  const { realm, captains } = await fixture('crew-work-four', 4), families = ['freight', 'passage', 'medical', 'survey'];
  for (let index = 0; index < 4; index++) await hire(realm, captains[index], families[index]);
  for (const captain of captains.slice(0, 3)) ok(solve(realm, captain));
  tick(realm, 100);
  assert.equal(contract(captains[3]).phase, 'boarding');
  assert.ok(captains.slice(0, 3).every(captain => contract(captain).phase !== 'boarding'));
  ok(solve(realm, captains[3]));
  for (let index = 0; index < 5000 && captains.some(captain => contract(captain).phase !== 'docked'); index++) {
    for (const captain of captains) if (contract(captain).phase === 'working' && !contract(captain).assignment.delivered) ok(solve(realm, captain));
    tick(realm);
  }
  assert.equal(new Set(captains.map(captain => captain.aboard)).size, 4);
  for (const captain of captains) {
    const work = contract(captain), employer = vessel(realm, captain);
    assert.equal(work.assignment.visitedDestination, true); assert.equal(work.assignment.delivered, true);
    assert.equal(work.assignment.complication.type, null, 'Ordinary jobs do not fabricate a crisis.');
    assert.equal(work.phase, 'docked'); assert.equal(work.work.done, true);
    assert.equal(employer.dockedAt, work.origin.bodyId);
    assert.equal(captain.game.state.credits, 180);
    const result = ok(await realm.command(captain, 'completeNpcContract', { wages: 999999 }, 'earned-once'));
    assert.equal(result.wages, work.reward); assert.equal(captain.game.state.credits, 180 + work.reward);
    ok(await realm.command(captain, 'completeNpcContract', {}, 'earned-once'));
    assert.equal((await realm.command(captain, 'completeNpcContract')).ok, false);
    assert.equal(captain.game.state.credits, 180 + work.reward); assert.equal(captain.ownedVesselId, null);
  }
  assert.equal(realm.vessels.size, 0); assert.equal(realm.onlineCount, 4);
});

test('a rare attack uses exterior bullets and sends the struck employer hull to its on-deck player', async () => {
  const { realm, captains: [captain], room } = await fixture('crew-work-evatest');
  await hire(realm, captain, 'escort'); ok(solve(realm, captain));
  until(realm, () => contract(captain).phase === 'working' && contract(captain).assignment.complication.started);
  const work = contract(captain), employer = vessel(realm, captain);
  assert.equal(work.assignment.complication.type, 'attack');
  const enemy = room.runtime.enemies.find(value => value.id === work.work.enemyId);
  assert.ok(enemy, 'The threat exists outside the ship.');
  Object.assign(enemy, { x: employer.ship.x + 140, y: employer.ship.y, cooldown: 0, active: true });
  employer.ship.shield = 0;
  const before = realm.snapshotFor(captain, { drainEvents: false }), hullBefore = employer.ship.hull;
  const presentation = new InteriorPresentation(); presentation.sample(before.state.ship, 0, { visible: true });
  tick(realm);
  assert.ok(room.runtime.bullets.some(bullet => bullet.ownerId === enemy.id && bullet.team === 'hostile'), 'An actual enemy projectile is launched.');
  until(realm, () => employer.ship.hull < hullBefore, 60);
  const after = realm.snapshotFor(captain, { drainEvents: false }), rendered = presentation.sample(after.state.ship, .2, { visible: true });
  assert.equal(after.state.mode, 'person'); assert.equal(after.state.ship.id, employer.id);
  assert.ok(after.state.ship.hull < hullBefore); assert.ok(after.state.ship.damageControl.serial > before.state.ship.damageControl.serial);
  assert.ok(rendered.fresh.length > 0); assert.ok(Math.abs(rendered.shake.x) + Math.abs(rendered.shake.y) > 0);
  assert.ok(after.events.some(event => event.type === 'hit' && event.vesselId === employer.id));
  assert.equal(captain.game.state.ship.unowned, true, 'The personal shipless record is not overwritten by the employer.');
});

test('EVA is an actual separate surface of the employer, retains its pose on restart and cannot operate inside consoles', async () => {
  let { realm, captains: [captain] } = await fixture('crew-work-evatest');
  await hire(realm, captain, 'hullwork'); ok(solve(realm, captain));
  until(realm, () => contract(captain).phase === 'working');
  let employer = vessel(realm, captain);
  Object.assign(captain.game.state.person, cabinLayout(employer.ship.classId).stations.medical);
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'enterEva' })).ok, false);
  const exit = realm._surface(captain).entities.find(entity => entity.type === 'exit'); assert.ok(exit);
  Object.assign(captain.game.state.person, { x: exit.x, y: exit.y });
  ok(await realm.command(captain, 'npcContractAction', { action: 'enterEva' }));
  const exterior = realm._surface(captain), point = exterior.entities.find(entity => entity.id === 'eva:repair');
  assert.equal(exterior.kind, 'eva'); assert.ok(point); assert.ok(isWalkable(exterior, point.x, point.y));
  Object.assign(captain.game.state.person, { x: point.x, y: point.y });
  const full = realm.snapshotFor(captain, { drainEvents: false });
  assert.equal(full.room.kind, 'eva'); assert.equal(full.state.ship.id, employer.id); assert.equal(full.state.multiplayer.aboardVesselId, employer.id);
  assert.equal(full.state.interior.location.vesselId, employer.id);
  assert.equal(realm._atStation(captain, 'engineering'), false);
  assert.equal((await realm.command(captain, 'repairFromStation')).ok, false);
  const actor = realm._actor(employer);
  assert.ok(actor._npcWorkers.includes(captain.game)); assert.equal(actor._damageHumans.includes(captain.game), false);
  const id = captain.id, pose = { x: captain.game.state.person.x, y: captain.game.state.person.y }, saved = realm.document();
  realm = new Realm({ id: realm.id, snapshot: saved, persistence: storage() }); captain = realm.captains.get(id); employer = vessel(realm, captain);
  ok(realm.attach(captain, { close() {} }));
  assert.equal(captain.game.state.interior.kind, 'eva'); assert.deepEqual({ x: captain.game.state.person.x, y: captain.game.state.person.y }, pose);
  const restored = realm.snapshotFor(captain, { drainEvents: false }), merged = mergeSnapshot(restored, realm.snapshotFor(captain, { compact: true, drainEvents: false }));
  assert.equal(merged.room.kind, 'eva'); assert.equal(merged.state.npcContract.assignment.eva.active, true);
  ok(solve(realm, captain));
  const airlock = realm._surface(captain).entities.find(entity => entity.id === 'eva:airlock');
  Object.assign(captain.game.state.person, { x: airlock.x, y: airlock.y });
  ok(await realm.command(captain, 'npcContractAction', { action: 'exitEva' }));
  assert.equal(captain.game.state.interior.kind, 'ship'); assert.equal(captain.aboard, employer.id);
  assert.equal(contract(captain).assignment.eva.active, false);
  until(realm, () => contract(captain).phase === 'docked');
  ok(await realm.command(captain, 'completeNpcContract')); assert.equal(captain.ownedVesselId, null);
});

test('an empty suit reserve and a cancelled exterior assignment both return the real worker inside', async () => {
  const { realm, captains: [captain] } = await fixture('crew-work-evatest');
  await hire(realm, captain, 'hullwork'); ok(solve(realm, captain));
  until(realm, () => contract(captain).phase === 'working');
  const employer = vessel(realm, captain), work = contract(captain);
  const enter = async () => {
    Object.assign(captain.game.state.person, cabinLayout(employer.ship.classId).spawn);
    ok(await realm.command(captain, 'npcContractAction', { action: 'enterEva' }));
  };
  await enter();
  work.assignment.eva.oxygen = .15;
  const health = captain.game.state.person.health;
  tick(realm, 3);
  assert.equal(captain.game.state.interior.kind, 'ship');
  assert.equal(work.assignment.eva.active, false); assert.equal(work.assignment.eva.emergency, true);
  assert.equal(captain.game.state.person.health, health - 18);
  assert.equal(captain.aboard, employer.id); assert.equal(realm.roomInfo(captain).kind, 'ship');
  assert.ok(isWalkable(realm._surface(captain), captain.game.state.person.x, captain.game.state.person.y));
  assert.equal(work.assignment.tasks[1].done, false, 'A tether recovery cannot complete exterior work.');
  assert.equal((await realm.command(captain, 'npcContractAction', { action: 'enterEva' })).ok, false, 'The actual depleted reserve must recharge.');
  tick(realm, 70); await enter();
  ok(await realm.command(captain, 'cancelNpcContract'));
  assert.equal(captain.game.state.interior.kind, 'ship'); assert.equal(work.assignment.eva.active, false);
  assert.equal(work.phase, 'returning'); assert.equal(captain.aboard, employer.id);
  until(realm, () => work.phase === 'docked');
  const result = ok(await realm.command(captain, 'completeNpcContract'));
  assert.ok(result.wages < work.reward, 'Unfinished work never pays the full delivery wage.');
  assert.equal(captain.ownedVesselId, null);
});
