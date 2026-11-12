import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { MILITARY_RECRUITER, militaryBranch, militaryMission } from '../../dist/military-content.mjs';
import { militaryServiceRank } from '../../dist/military-ranks.mjs';
import { sidearmAim } from '../../dist/combat.mjs';
import { isWalkable } from '../../dist/surface.mjs';
import { createPrivacyExport } from '../../server/privacy.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const storage = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
const place = (realm, captain, predicate) => { const entity = realm._surface(captain).entities.find(predicate); assert.ok(entity); Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity; };
const recruiter = (realm, captain) => place(realm, captain, entity => entity.id === MILITARY_RECRUITER.id);
async function fixture(id = 'SQUADARMY', regularLeader = false) {
  const realm = new Realm({ id, seed: 'shared-field-service', persistence: storage() }), captains = [];
  for (const name of ['Experienced soldier', 'New recruit', 'Observer']) {
    const { captain } = await realm.createCaptain(name, { startMode: regularLeader && !captains.length ? 'regular' : 'hardcore' }); ok(realm.attach(captain, { close() {} })); captains.push(captain);
    if(captain.ownedVesselId){const body=realm._room('hearth').runtime.bodies.find(body=>body.id==='morrow'),vessel=realm.vessels.get(captain.ownedVesselId);Object.assign(vessel.ship,{x:body.x+body.radius+80,y:body.y,vx:0,vy:0});ok(await realm.command(captain,'dock',{id:'morrow'}));}
    recruiter(realm, captain); ok(await realm.command(captain, 'militaryCareerAction', { action: 'join', branchId: 'army', entityId: MILITARY_RECRUITER.id }));
  }
  return { realm, captains };
}
function tick(realm, seconds = .1) {
  for (let time = 0; time < seconds - 1e-8; time += .1) {
    for (const captain of realm.captains.values()) if (captain.session) realm.acceptInput(captain, captain.inputSeq + 1, {});
    realm.step(.1, realm.tick + 1, Date.now());
  }
}
async function muster(realm, leader, recruit, missionId) {
  const operationId = ok(await realm.command(leader, 'militaryCareerAction', { action: 'createOperation', missionId })).operationId;
  ok(await realm.command(recruit, 'militaryCareerAction', { action: 'joinOperation', operationId }));
  ok(await realm.command(leader, 'militaryCareerAction', { action: 'launchOperation', operationId }));
  return operationId;
}
async function enter(realm, captain, siteId) {
  place(realm, captain, entity => entity.type === 'siteEntrance' && entity.data.siteId === siteId);
  ok(await realm.command(captain, 'enterSite', { siteId }));
}
function fire(realm, captain) {
  const encounter = captain.game.state.exploration.encounter, target = encounter.monsters.find(enemy => enemy.health > 0);
  if (!target) return;
  const surface = realm._surface(captain); let input;
  for (const radius of [96, 120, 72]) {
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, position = { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius }, candidate = { fire: true, aiming: true, aimX: -Math.cos(angle), aimY: -Math.sin(angle) };
      if (isWalkable(surface, position.x, position.y) && sidearmAim(position, encounter.monsters, candidate, surface.combatLayout).targetId === target.id) { Object.assign(captain.game.state.person, position); input = candidate; break; }
    }
    if (input) break;
  }
  assert.ok(input);
  for (const other of realm.captains.values()) if (other.session) realm.acceptInput(other, other.inputSeq + 1, other === captain ? input : {});
  realm.step(1 / 30, realm.tick + 1, Date.now());
}
async function leaveAndDebrief(realm, captain, mission) {
  place(realm, captain, entity => entity.type === 'siteExit'); ok(await realm.command(captain, 'exitSite', {}));
  if (mission.deployment) {
    const surface = realm._surface(captain); Object.assign(captain.game.state.person, surface.spawn);
    ok(await realm.command(captain, 'militaryCareerAction', { action: 'returnTransport' }));
  }
  recruiter(realm, captain); const before = captain.game.state.credits;
  const result = ok(await realm.command(captain, 'militaryCareerAction', { action: 'debrief', entityId: MILITARY_RECRUITER.id }));
  assert.equal(result.paid, mission.reward); assert.equal(captain.game.state.credits, before + mission.reward);
  assert.equal((await realm.command(captain, 'militaryCareerAction', { action: 'debrief', entityId: MILITARY_RECRUITER.id })).ok, false);
}

test('enrolled Army squad shares real target wounds and objective, but pays and promotes each present captain once', async () => {
  let { realm, captains: [leader, recruit, observer] } = await fixture();
  // A persisted veteran joins the same qualification exercise as a newcomer.
  leader.game.state.professions.careers.military.completed = 7;
  leader.game.state.militaryCareer.completed = militaryBranch('freewake', 'army').missions.map(mission => mission.id);
  const mission = militaryMission('freewake-army-range'), id = await muster(realm, leader, recruit, mission.id);
  await enter(realm, leader, mission.siteId); await enter(realm, recruit, mission.siteId);
  assert.equal(leader.game.state.exploration.encounter, recruit.game.state.exploration.encounter);
  assert.equal(realm.roomInfo(leader).id, realm.roomInfo(recruit).id);
  assert.ok(realm.snapshotFor(recruit).players.some(player => player.captainId === leader.id && player.military.rankIndex === 1));
  place(realm, observer, entity => entity.type === 'siteEntrance' && entity.data.siteId === mission.siteId);
  assert.equal((await realm.command(observer, 'enterSite', { siteId: mission.siteId, operationId: id })).ok, false);
  tick(realm, 16);
  for (let i = 0; i < 200 && !leader.game.state.exploration.encounter.cleared; i++) fire(realm, leader);
  assert.ok(leader.game.state.exploration.encounter.cleared);
  assert.equal(recruit.game.state.militaryCareer.active.evidence.hits.value, 3);
  assert.equal(recruit.game.state.militaryCareer.active.participation.damage, 0);
  const terminal = place(realm, leader, entity => entity.type === 'siteRecord' && entity.data.recordId === 'drill');
  ok(await realm.command(leader, 'siteAction', { entityId: terminal.id, action: 'inspect' })); tick(realm);
  assert.equal(leader.game.state.militaryCareer.active.phase, 'debrief'); assert.equal(recruit.game.state.militaryCareer.active.phase, 'debrief');
  const saved = realm.document(); realm = new Realm({ id: realm.id, snapshot: saved, persistence: storage() });
  [leader, recruit, observer] = [leader, recruit, observer].map(captain => realm.captains.get(captain.id));
  for (const captain of [leader, recruit, observer]) ok(realm.attach(captain, { close() {} }));
  assert.equal(realm.roomInfo(leader).id, realm.roomInfo(recruit).id); assert.equal(recruit.game.state.militaryCareer.active.phase, 'debrief');
  await leaveAndDebrief(realm, leader, mission); await leaveAndDebrief(realm, recruit, mission);
  assert.equal(leader.game.state.professions.careers.military.completed, 8); assert.equal(militaryServiceRank(leader.game).rankIndex, 2);
  assert.equal(recruit.game.state.professions.careers.military.completed, 1); assert.equal(militaryServiceRank(recruit.game).rankIndex, 0);
  assert.equal(observer.game.state.professions.careers.military.completed, 0);
  assert.equal(realm.militaryOperations.operations[id].phase, 'closed');
  const report = createPrivacyExport(realm, recruit, { sourceKind: 'live-authority' });
  assert.ok(report.sharedContributions.keyedRecords.some(record => record.path.includes('militaryOperations') && record.path.at(-1) === recruit.id));
});

test('remote Army watch is one shared clock; offline recruits earn no watch and return shuttle preserves their ships', async () => {
  let { realm, captains: [leader, recruit, observer] } = await fixture('WATCHARMY', true);
  const ownId=leader.ownedVesselId,ownShip=structuredClone(realm.vessels.get(ownId).ship),ownCargo=structuredClone(leader.game.state.cargo);
  leader.game.state.professions.careers.military.completed = 8;
  leader.game.state.militaryCareer.completed = militaryBranch('freewake', 'army').missions.map(mission => mission.id);
  const mission = militaryMission('freewake-army-border-watch'), id = await muster(realm, leader, recruit, mission.id);
  assert.equal(leader.game.state.systemId, 'meridian'); assert.equal(recruit.game.state.systemId, 'meridian'); assert.equal(observer.game.state.systemId, 'hearth');
  await enter(realm, leader, mission.siteId); await enter(realm, recruit, mission.siteId);
  const encounter = leader.game.state.exploration.encounter;
  tick(realm, 10); assert.ok(Math.abs(encounter.watch.elapsed - 10) < .11, 'the roster must not multiply watch time');
  const before = recruit.game.state.militaryCareer.active.participation.seconds; realm.detach(recruit, recruit.session); tick(realm, 2);
  assert.equal(recruit.game.state.militaryCareer.active.participation.seconds, before);
  const document = realm.document(); realm = new Realm({ id: realm.id, snapshot: document, persistence: storage() });
  [leader, recruit, observer] = [leader, recruit, observer].map(captain => realm.captains.get(captain.id));
  for (const captain of [leader, recruit, observer]) ok(realm.attach(captain, { close() {} }));
  assert.equal(leader.game.state.systemId, 'meridian'); assert.equal(recruit.game.state.exploration.key, leader.game.state.exploration.key);
  tick(realm, 15);
  for (let i = 0; i < 800 && leader.game.state.exploration.encounter.monsters.some(enemy => enemy.health > 0); i++) fire(realm, leader);
  tick(realm, 60);
  const terminal = place(realm, leader, entity => entity.type === 'siteRecord' && entity.data.recordId === 'log');
  ok(await realm.command(leader, 'siteAction', { entityId: terminal.id, action: 'inspect' })); tick(realm);
  assert.equal(leader.game.state.militaryCareer.active.phase, 'debrief'); assert.equal(recruit.game.state.militaryCareer.active.phase, 'debrief');
  await leaveAndDebrief(realm, leader, mission); await leaveAndDebrief(realm, recruit, mission);
  assert.equal(leader.game.state.systemId, 'hearth'); assert.equal(recruit.game.state.systemId, 'hearth');
  assert.deepEqual(realm.vessels.get(ownId).ship,ownShip);assert.deepEqual(leader.game.state.cargo,ownCargo);assert.equal(realm.vessels.get(ownId).systemId,'hearth');assert.equal(realm.vessels.get(ownId).dockedAt,'morrow');
  assert.equal(recruit.game.ownsShip, false); assert.equal(recruit.game.state.professions.careers.military.completed, 1);
  assert.equal(recruit.game.state.militaryCareer.completed.length, 0, 'supporting an advanced order does not skip the recruit’s own qualifications');
  assert.equal(realm.militaryOperations.operations[id].phase, 'closed');
});
