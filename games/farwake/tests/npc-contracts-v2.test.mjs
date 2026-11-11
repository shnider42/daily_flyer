import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { cabinLayout } from '../dist/interior-layouts.mjs';
import { generateSurface, evaLayout, isWalkable } from '../dist/surface.mjs';
import { crewTaskDefinition, crewWorkOffers, createWorkAssignment } from '../dist/crew-work.mjs';
import { createNpcContract, settleNpcContract } from '../dist/npc-contracts.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const make = (seed = 'v2-qa', startMode = 'regular') => new Game(seed, { openingMission: true, startMode });
const tick = (game, seconds, input = {}) => { for (let n = 0; n < Math.ceil(seconds * 10); n++) game.step(.1, input); };
const until = (game, predicate, seconds = 100, input = {}) => {
  for (let n = 0; n < seconds * 10 && !predicate(); n++) game.step(.1, input);
  assert.ok(predicate(), `Timed out in ${game.state.npcContract?.phase}: ${game.npcContractStatus()?.task}`);
};
const work = game => {
  const contract = game.state.npcContract, task = crewTaskDefinition(contract);
  assert.ok(task);
  Object.assign(game.state.person, task.station === 'eva' ? evaLayout(contract.classId).repair : cabinLayout(contract.classId).stations[task.station]);
  return { task, result: game.npcContractAction('task', { taskId: task.id, solution: task.solution }) };
};
const accept = (game, family) => {
  const offer = game.npcContractOffers().find(value => value.familyId === family); assert.ok(offer, family);
  ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId })); return game.state.npcContract;
};
function sample(family, type = null, startMode = 'regular') {
  for (let index = 0; index < 250; index++) {
    const game = make(`crew-check-${index}`, startMode), offer = crewWorkOffers(game).find(value => value.familyId === family);
    if (offer && createWorkAssignment(offer, 'sample').complication.type === type) return { game, offer };
  }
  throw new Error(`No sample for ${family}/${type}`);
}
function arrive(game) { ok(work(game).result); until(game, () => game.state.npcContract.phase === 'working'); }
function pay(game) { until(game, () => game.state.npcContract.phase === 'docked'); return ok(game.completeNpcContract()); }

test('the crew board posts eight concrete, stable offers and each role has a real job', () => {
  const game = make(), first = game.npcContractOffers();
  assert.equal(first.length, 8);
  assert.deepEqual(first, game.npcContractOffers());
  assert.equal(new Set(first.map(offer => offer.offerId)).size, 8);
  assert.equal(new Set(first.map(offer => offer.roleId)).size, 7);
  assert.ok(first.every(offer => offer.available && offer.cost === 0 && offer.title && offer.cargo && offer.destinationName && offer.routeName));
  assert.ok(first.filter(offer => ['freight', 'fragile', 'passage', 'medical', 'escort', 'construction'].includes(offer.familyId)).length >= 5);
  assert.ok(first.every(offer => !Object.hasOwn(offer, 'solution') && !Object.hasOwn(offer, 'complicationSeed') && !Object.hasOwn(offer, 'seed')));
});

test('quotes reject wrong roles, stale order IDs and arbitrary injected rewards before any ownership changes', () => {
  const game = make(), offer = game.npcContractOffers()[0], ship = game.state.ship, credits = game.state.credits;
  assert.equal(createNpcContract(game, 'medic', { offerId: offer.offerId }).code, 'offer');
  assert.equal(game.acceptNpcContract(offer.roleId, { offerId: 'made-up', reward: 100000 }).code, 'offer');
  assert.equal(game.state.ship, ship); assert.equal(game.state.credits, credits); assert.equal(game.state.npcContractSerial, 0);
  game.state.npcContractSerial++;
  assert.equal(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }).code, 'offer');
});

test('new work starts at the actual marked station before departure; remote or incorrect solutions cannot progress it', () => {
  const game = make(), c = accept(game, 'freight');
  const p = { x: game.state.ship.x, y: game.state.ship.y }, task = crewTaskDefinition(c);
  tick(game, 8); assert.equal(c.phase, 'boarding');
  assert.deepEqual({ x: game.state.ship.x, y: game.state.ship.y }, p);
  Object.assign(game.state.person, { x: -100, y: -100 });
  assert.equal(game.npcContractAction('task', { taskId: task.id, solution: task.solution }).code, 'distance');
  Object.assign(game.state.person, cabinLayout(c.classId).stations.engineering);
  assert.equal(game.npcContractAction('task', { taskId: task.id, solution: ['wrong', 'wrong'] }).code, 'solution');
  assert.equal(c.assignment.tasks[0].done, false);
  const status = game.npcContractStatus(); assert.equal(status.activeTask.ready, true); assert.equal(status.activeTask.puzzle.inputs.length, 2); assert.equal(Object.hasOwn(status.activeTask, 'solution'), false);
  ok(game.npcContractAction('task', { taskId: task.id, solution: task.solution }));
  assert.equal(game.npcContractAction('task', { taskId: task.id, solution: task.solution }).code, 'task');
  tick(game, 1); assert.equal(c.phase, 'outbound');
});

test('a receiving task needs a real destination visit and the physical ship on station', () => {
  const game = make(), c = accept(game, 'freight'); ok(work(game).result);
  const second = crewTaskDefinition(c);
  Object.assign(game.state.person, cabinLayout(c.classId).stations[second.station]);
  assert.equal(game.npcContractAction('task', { taskId: second.id, solution: second.solution }).code, 'route');
  c.phase = 'working'; c.assignment.visitedDestination = true;
  assert.equal(game.npcContractAction('task', { taskId: second.id, solution: second.solution }).code, 'route');
  c.phase = 'outbound'; c.assignment.visitedDestination = false;
  until(game, () => c.phase === 'working');
  assert.ok(Math.hypot(game.state.ship.x - c.workPoint.x, game.state.ship.y - c.workPoint.y) < 60);
  const destination = game.system.bodies.find(body => body.id === c.destination.bodyId);
  assert.ok(Math.hypot(c.workPoint.x - destination.x, c.workPoint.y - destination.y) <= destination.radius + 76);
  ok(work(game).result); assert.equal(c.phase, 'returning');
  assert.equal(game.completeNpcContract().code, 'docking');
});

test('all nine job families complete physical runs, keep private ownership, and pay exactly once', () => {
  const families = ['freight', 'fragile', 'passage', 'medical', 'maintenance', 'survey', 'construction', 'hullwork', 'escort'];
  const puzzleKinds = new Set();
  for (const family of families) {
    const { game, offer } = sample(family), own = game.state.ship, funds = game.state.credits, owned = [...game.state.fleet.owned];
    ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId })); const c = game.state.npcContract;
    puzzleKinds.add(crewTaskDefinition(c).puzzle.type); arrive(game);
    assert.equal(c.assignment.complication.started, false, `${family} should be an ordinary run`);
    assert.equal(game.system.enemies.filter(enemy => enemy.crewContractId === c.id).length, 0);
    if (family === 'hullwork') {
      Object.assign(game.state.person, cabinLayout(c.classId).spawn); ok(game.npcContractAction('enterEva'));
      assert.equal(game.state.interior.kind, 'eva'); assert.equal(c.assignment.eva.active, true);
    }
    puzzleKinds.add(crewTaskDefinition(c).puzzle.type); ok(work(game).result);
    if (family === 'hullwork') {
      assert.equal(c.phase, 'working'); assert.equal(c.work.done, false, 'The pilot waits until the worker is inside.');
      Object.assign(game.state.person, evaLayout(c.classId).spawn); ok(game.npcContractAction('exitEva'));
    }
    const settled = pay(game);
    assert.equal(settled.wages, offer.reward, family); assert.equal(game.state.credits, funds + offer.reward);
    assert.equal(game.state.ship, own); assert.deepEqual(game.state.fleet.owned, owned); assert.equal(game.state.npcContract, null);
    assert.equal(game.completeNpcContract().ok, false); assert.equal(game.state.credits, funds + offer.reward);
  }
  assert.ok(puzzleKinds.size >= 5);
});

test('complications are uncommon and seeded while load and instrument combinations vary', () => {
  const game = make(), combinations = new Set(); let total = 0, incidents = 0;
  for (let serial = 0; serial < 240; serial++) {
    game.state.npcContractSerial = serial;
    for (const offer of crewWorkOffers(game)) {
      total++; const assignment = createWorkAssignment(offer, 'test'); if (assignment.complication.type) incidents++;
      const c = { id: 'test', origin: { name: 'Kettle' }, assignment };
      const task = crewTaskDefinition(c);
      combinations.add(`${offer.familyId}|${offer.cargo}|${task.solution.join(',')}`);
    }
  }
  assert.ok(incidents / total >= .045 && incidents / total <= .115, `${incidents}/${total}`);
  assert.ok(combinations.size > 150, `Only ${combinations.size} distinct work orders`);
});

test('a rare escort attack creates real projectiles and requires the employee’s confirmed contribution', () => {
  const { game, offer } = sample('escort', 'attack'); ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }));
  const c = game.state.npcContract; arrive(game);
  const enemy = game.system.enemies.find(value => value.id === c.work.enemyId); assert.ok(enemy);
  assert.equal(game.npcContractStatus().complication.type, 'attack');
  const original = game.state.ship.shield;
  tick(game, 6); assert.ok(game.system.bullets.some(bullet => bullet.owner !== 'player') || game.state.ship.shield < original);
  Object.assign(game.state.person, cabinLayout(c.classId).stations.security);
  let sawShot = false;
  for (let n = 0; n < 600 && !c.assignment.complication.resolved; n++) { game.step(.1, { fire: true }); if (game.system.bullets.some(bullet => bullet.ownerId === game.playerId && bullet.vesselId === c.vesselId)) sawShot = true; }
  assert.ok(sawShot); assert.ok(c.work.damage >= 12); assert.ok(c.assignment.complication.resolved);
  if (!c.assignment.visitedDestination) until(game, () => c.assignment.visitedDestination && c.phase === 'working');
  ok(work(game).result); assert.equal(pay(game).wages, c.reward);
});

test('a rare illness is a real crew condition and a nonmedic can treat it at the medical station', () => {
  const { game, offer } = sample('freight', 'illness'); ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }));
  const c = game.state.npcContract; arrive(game);
  assert.equal(c.assignment.complication.started, true);
  const patient = game.state.crew.find(crew => crew.id === c.work.crewId); assert.ok(patient.health <= 38);
  assert.equal(game.npcContractStatus().complication.type, 'illness');
  assert.equal(work(game).result.code, 'incident');
  Object.assign(game.state.person, cabinLayout(c.classId).stations.medical);
  for (let n = 0; n < 15 && !c.assignment.complication.resolved; n++) { ok(game.npcContractAction('heal')); tick(game, 6.2); }
  assert.ok(c.assignment.complication.resolved); assert.ok(patient.health >= 90);
  ok(work(game).result); assert.equal(pay(game).wages, c.reward);
});

test('a rare fire uses real compartment damage and does not count passive burnout as employee work', () => {
  const { game, offer } = sample('maintenance', 'fire'); ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId }));
  const c = game.state.npcContract; arrive(game);
  const section = game.state.ship.damageControl.sections.find(value => value.id === c.work.sectionId); assert.ok(section.fire > 0);
  tick(game, 3); assert.equal(c.work.fireRemoved, 0);
  Object.assign(game.state.person, section);
  ok(game.npcContractAction('suppress')); tick(game, 1.3); ok(game.npcContractAction('suppress')); tick(game, 1.3); ok(game.npcContractAction('repair')); tick(game, .1);
  assert.ok(c.assignment.complication.resolved); assert.equal(section.fire, 0);
  ok(work(game).result); assert.equal(pay(game).wages, c.reward);
});

test('EVA requires the physical airlock and work panel; oxygen, recovery, save and collision remain real', () => {
  const { game, offer } = sample('hullwork'), own = game.state.ship; ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId })); const c = game.state.npcContract;
  arrive(game);
  Object.assign(game.state.person, { x: -100, y: -100 }); assert.equal(game.npcContractAction('enterEva').code, 'distance');
  Object.assign(game.state.person, cabinLayout(c.classId).spawn); assert.equal(game.npcContractStatus().eva.canEnter, true); ok(game.npcContractAction('enterEva'));
  const surface = generateSurface(game.currentBody, game.state.seed), exterior = evaLayout(c.classId);
  assert.equal(surface.kind, 'eva'); assert.ok(isWalkable(surface, game.state.person.x, game.state.person.y));
  assert.equal(isWalkable(surface, 0, 0), false);
  const task = crewTaskDefinition(c);
  assert.equal(game.npcContractAction('task', { taskId: task.id, solution: task.solution }).code, 'distance');
  tick(game, 10); assert.ok(c.assignment.eva.oxygen < 111 && c.assignment.eva.oxygen > 109);
  const restored = Game.fromSave(game.save()); assert.equal(restored.state.interior.kind, 'eva'); assert.equal(restored.state.ship.id, c.vesselId); assert.ok(restored.npcContractStatus().eva.active);
  Object.assign(restored.state.person, exterior.repair); assert.equal(restored.npcContractAction('exitEva').code, 'distance');
  const health = restored.state.person.health; tick(restored, 112);
  assert.equal(restored.state.interior.kind, 'ship'); assert.ok(restored.state.person.health < health); assert.equal(restored.state.npcContract.assignment.eva.active, false);
  assert.equal(restored.state.npcContract.work.done, false);
  assert.equal(game.state.npcContract.personal.ship, own);
});

test('a returning pilot never leaves their hired worker outside on the tether', () => {
  const { game, offer } = sample('hullwork'); ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId })); const c = game.state.npcContract; arrive(game);
  Object.assign(game.state.person, cabinLayout(c.classId).spawn); ok(game.npcContractAction('enterEva'));
  Object.assign(game.state.person, evaLayout(c.classId).repair); ok(game.cancelNpcContract());
  assert.equal(game.state.interior.kind, 'ship'); assert.equal(c.assignment.eva.active, false); assert.equal(c.phase, 'returning');
  const amount = pay(game).wages; assert.ok(amount >= 0 && amount < c.reward);
});

test('Hardcore employment can finish a modern freight watch while preserving the no-ship start', () => {
  const { game, offer } = sample('freight', null, 'hardcore'); ok(game.acceptNpcContract(offer.roleId, { offerId: offer.offerId })); arrive(game); ok(work(game).result); pay(game);
  assert.equal(game.ownsShip, false); assert.equal(game.state.ship.unowned, true); assert.deepEqual(game.state.fleet.owned, []);
});

test('legacy role-only watches remain version one and can still resume their original paid work', () => {
  for (const roleId of ['gunner', 'firehand', 'medic']) {
    const game = make(); ok(game.acceptNpcContract(roleId));
    assert.equal(game.state.npcContract.version, 1);
    const restored = Game.fromSave(game.save()); until(restored, () => restored.state.npcContract.phase === 'working');
    assert.equal(restored.state.npcContract.version, 1); assert.equal(restored.npcContractStatus().roleId, roleId);
  }
});

test('a fabricated docked phase cannot settle a modern assignment away from the origin', () => {
  const game = make(), c = accept(game, 'freight'); arrive(game); ok(work(game).result);
  c.phase = 'docked'; c.dockedAt = c.origin.bodyId;
  assert.equal(settleNpcContract(game).code, 'docking'); assert.equal(c.paid, false);
});
