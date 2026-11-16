import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { questThread } from '../../dist/quest-content.mjs';
import { localCharterSupport } from '../../dist/local-campaigns.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const persistence = { kind: 'aftermath-memory', async save(_id, version) { return { version: version + 1 }; } };
const step = (captain, id) => questThread(id).stages[captain.game.state.narrative.quests[id].stage];
const act = (realm, captain, id, action, extra = {}) => realm.command(captain, 'threadAction', { threadId: id, action, ...extra });
const completedOriginal = (captain, id, choices) => {
  captain.game.state.narrative.quests[id] = { status: 'completed', stage: questThread(id).stages.length, choices, solved: [], rewardQuote: questThread(id).reward, startedAt: 1, finishedAt: 2, targetId: null, huntOutcome: null, shipId: null, evacuated: false, outcome: 'The original report was handed over.' };
};
function walk(realm, captain, id) {
  const entity = realm._surface(captain).entities.find(value => value.id === id); assert.ok(entity, id);
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity;
}
async function launch(realm, captain) {
  if (captain.game.state.exploration) { walk(realm, captain, realm._surface(captain).entities.find(entity => entity.type === 'siteExit').id); ok(await realm.command(captain, 'exitSite')); }
  if (captain.game.state.mode === 'ship') return;
  walk(realm, captain, realm._surface(captain).entities.find(entity => entity.type === 'exit').id); ok(await realm.command(captain, 'launch'));
}
async function land(realm, captain, bodyId) {
  if (captain.game.state.mode === 'person' && !captain.game.state.interior && captain.game.state.locationId === bodyId) return;
  await launch(realm, captain);
  const vessel = realm.vessels.get(captain.ownedVesselId), body = realm._room('hearth').runtime.bodies.find(value => value.id === bodyId);
  Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 }); ok(await realm.command(captain, 'dock', { id: bodyId }));
}
async function go(realm, captain, target) {
  if (!target.bodyId) { await launch(realm, captain); const ship = realm.vessels.get(captain.ownedVesselId).ship; Object.assign(ship, { x: target.x, y: target.y, vx: 0, vy: 0 }); return; }
  await land(realm, captain, target.bodyId);
  if (target.siteId) { const entrance = realm._surface(captain).entities.find(entity => entity.type === 'siteEntrance' && entity.data.siteId === target.siteId); walk(realm, captain, entrance.id); ok(await realm.command(captain, 'enterSite', { siteId: target.siteId })); }
  if (target.entityId) walk(realm, captain, target.entityId);
}
async function accept(realm, captain, id) { await go(realm, captain, questThread(id).stages[0].at); return ok(await act(realm, captain, id, 'accept', { entityId: questThread(id).stages[0].at.entityId })); }
async function advance(realm, captain, id, choices = {}) {
  const current = step(captain, id), view = captain.game.narrativeBoard().active.find(value => value.id === id);
  await go(realm, captain, current.kind === 'ship-scan' ? view.target : current.at);
  return ok(await act(realm, captain, id, current.kind === 'puzzle' ? 'solve' : current.kind === 'choice' ? 'choose' : 'advance', {
    entityId: current.at.entityId, solution: current.puzzle?.solution, choiceId: choices[current.id] || current.options?.[0].id,
  }));
}
async function until(realm, captain, id, stageId, choices = {}) { while (step(captain, id).id !== stageId) await advance(realm, captain, id, choices); }
async function fixture(seed) {
  const realm = new Realm({ id: 'AFTER123', seed, persistence });
  const a = (await realm.createCaptain('Returning captain')).captain, b = (await realm.createCaptain('Other captain')).captain;
  for (const captain of [a, b]) { ok(realm.attach(captain, { close() {} })); captain.game.state.credits = 1000; captain.game.state.cargo.ore = 30; }
  return { realm, a, b };
}
function restore(realm, a, b) {
  const next = new Realm({ id: realm.id, snapshot: realm.document(), persistence });
  const first = next.captains.get(a.id), second = next.captains.get(b.id);
  ok(next.attach(first, { close() {} })); ok(next.attach(second, { close() {} }));
  return { realm: next, a: first, b: second };
}

test('shared spare handover requires the owner’s real docked supply hull and keeps each captain’s aftermath separate', async () => {
  let { realm, a, b } = await fixture('shared-aftercare-parts');
  for (const captain of [a, b]) { completedOriginal(captain, 'cold_chain', { agreement: 'care' }); await accept(realm, captain, 'cold_chain_aftercare'); }
  await until(realm, a, 'cold_chain_aftercare', 'support'); await go(realm, a, step(a, 'cold_chain_aftercare').at);
  const own = realm.vessels.get(a.ownedVesselId), other = realm.vessels.get(b.ownedVesselId); assert.equal(other.dockedAt, 'morrow');
  own.dockedAt = 'kettle'; const before = JSON.stringify(a.game.state.narrative), ore = a.game.state.cargo.ore;
  const denied = await act(realm, a, 'cold_chain_aftercare', 'choose', { choiceId: 'spares', entityId: 'quest:mara-reed' });
  assert.equal(denied.ok, false); assert.match(denied.reason, /ship|vessel|port/i); assert.equal(a.game.state.cargo.ore, ore);
  assert.equal(JSON.stringify(a.game.state.narrative), before);
  own.dockedAt = 'morrow'; await advance(realm, a, 'cold_chain_aftercare', { support: 'spares' });
  assert.equal(a.game.state.cargo.ore, ore - 3); assert.equal(b.game.state.cargo.ore, 30);
  const credits = a.game.state.credits, reward = a.game.state.narrative.quests.cold_chain_aftercare.rewardQuote;
  while (a.game.state.narrative.quests.cold_chain_aftercare.status === 'active') await advance(realm, a, 'cold_chain_aftercare');
  assert.equal(a.game.state.credits, credits + reward); assert.equal(a.game.narrativeServiceBenefit('repair').multiplier, .78);
  assert.equal(a.game.narrativeServiceBenefit('rest').multiplier, .75); assert.equal(b.game.narrativeServiceBenefit('repair'), null);
  const objectAt = questThread('cold_chain_aftercare').stages.find(value => value.id === 'check-handover').at;
  await go(realm, a, objectAt); await go(realm, b, objectAt);
  assert.match(ok(await realm.command(a, 'inspectQuestObject', { entityId: objectAt.entityId })).object.text, /22%/);
  assert.match(ok(await realm.command(b, 'inspectQuestObject', { entityId: objectAt.entityId })).object.text, /new handover note/);
  ({ realm, a, b } = restore(realm, a, b));
  assert.equal(a.game.state.narrative.quests.cold_chain_aftercare.status, 'completed'); assert.equal(b.game.state.narrative.quests.cold_chain_aftercare.stage, 1);
  assert.equal(a.game.state.credits, credits + reward);
  assert.equal((await act(realm, a, 'cold_chain_aftercare', 'advance', { entityId: 'quest:mara-reed' })).code, 'duplicate');
});

test('shared named booking survives a realm reload and only its authoritative delivery approves that captain’s follow-up', async () => {
  let { realm, a, b } = await fixture('shared-aftercare-passenger');
  for (const captain of [a, b]) {
    completedOriginal(captain, 'fair_departure', { charter: 'courier' }); await accept(realm, captain, 'departure_aftercare');
    await until(realm, captain, 'departure_aftercare', 'trial', { reserve: 'shared' });
  }
  await go(realm, a, step(a, 'departure_aftercare').at);
  assert.equal((await act(realm, a, 'departure_aftercare', 'advance', { entityId: 'quest:len-vale', receipt: true })).code, 'requirements');
  walk(realm, a, 'quest:passage-desk:kettle'); const offer = a.game.passengerOffers()[0];
  assert.equal(offer.name, 'Eda Moss'); assert.equal(offer.targetBody, 'morrow'); assert.equal(offer.charterBonus, undefined);
  ok(await realm.command(a, 'acceptPassenger', { offerId: offer.id, entityId: offer.sourceEntityId }));
  ({ realm, a, b } = restore(realm, a, b));
  assert.equal(a.game.state.narrative.passenger.aftermathId, 'departure_aftercare'); assert.equal(a.game.state.narrative.passenger.fare, offer.fare);
  assert.equal((await realm.command(a, 'deliverPassenger', { entityId: offer.targetEntityId })).ok, false);
  await land(realm, a, 'morrow'); walk(realm, a, offer.targetEntityId);
  assert.equal(ok(await realm.command(a, 'deliverPassenger', { entityId: offer.targetEntityId })).paid, offer.fare + offer.bonus);
  assert.equal(a.game.hasFlag('thread:departure_aftercare_trial_complete'), true); assert.equal(b.game.hasFlag('thread:departure_aftercare_trial_complete'), false);
  const credits = a.game.state.credits, reward = a.game.state.narrative.quests.departure_aftercare.rewardQuote;
  await advance(realm, a, 'departure_aftercare'); await advance(realm, a, 'departure_aftercare');
  assert.equal(a.game.state.credits, credits + reward); assert.equal(localCharterSupport(a.game, 'hearth', 'patient').bonus, 4);
  assert.equal(localCharterSupport(b.game, 'hearth', 'patient'), null); assert.equal(localCharterSupport(b.game, 'hearth', 'courier').bonus, 8);
  await go(realm, b, step(b, 'departure_aftercare').at);
  assert.equal((await act(realm, b, 'departure_aftercare', 'advance', { entityId: 'quest:len-vale' })).code, 'requirements');
  assert.equal((await act(realm, a, 'departure_aftercare', 'advance', { entityId: 'quest:len-vale' })).code, 'duplicate');
  assert.equal(a.game.state.credits, credits + reward);
});

test('shared second reference spends actual helm charge and leaves other captains and the earlier publication unchanged', async () => {
  const { realm, a, b } = await fixture('shared-aftercare-signal');
  for (const captain of [a, b]) { completedOriginal(captain, 'clear_signal', { publication: 'open' }); await accept(realm, captain, 'signal_aftercare'); }
  await until(realm, a, 'signal_aftercare', 'independent-reading', { record: 'consent' });
  const target = a.game.narrativeBoard().active.find(value => value.id === 'signal_aftercare').target; await go(realm, a, target);
  const vessel = realm.vessels.get(a.ownedVesselId); vessel.ship.energy = 20; vessel.helmOwner = b.id;
  assert.equal((await act(realm, a, 'signal_aftercare', 'advance')).code, 'helm'); assert.equal(vessel.ship.energy, 20);
  vessel.helmOwner = a.id; ok(await act(realm, a, 'signal_aftercare', 'advance')); assert.equal(vessel.ship.energy, 14);
  assert.equal(b.game.state.narrative.quests.signal_aftercare.stage, 1);
  assert.equal((await act(realm, a, 'signal_aftercare', 'advance')).code, 'action'); assert.equal(vessel.ship.energy, 14);
  while (a.game.state.narrative.quests.signal_aftercare.status === 'active') await advance(realm, a, 'signal_aftercare');
  assert.equal(a.game.narrativeScanCost({ kind: 'survey' }), 5); assert.equal(b.game.narrativeScanCost({ kind: 'survey' }), 6);
  assert.equal(a.game.narrativeScanCost({ story: true }), 8); assert.deepEqual(a.game.state.narrative.quests.clear_signal.choices, { publication: 'open' });
  await launch(realm, a); const signal = { id: 'shared-aftercare-survey', name: 'Ordinary survey', kind: 'survey', x: vessel.ship.x, y: vessel.ship.y, radius: 15, resolved: false, scanned: false };
  realm._room('hearth').runtime.signals.push(signal); vessel.ship.energy = 5; ok(await realm.command(a, 'scan', { id: signal.id })); assert.equal(vessel.ship.energy, 0);
});
