import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { questThread } from '../../dist/quest-content.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const persistence = { kind: 'campaign-memory', async save(_id, version) { return { version: version + 1 }; } };
const step = (captain, id) => questThread(id).stages[captain.game.state.narrative.quests[id].stage];
const act = (realm, captain, id, action, extra = {}) => realm.command(captain, 'threadAction', { threadId: id, action, ...extra });
function walk(realm, captain, id) { const entity = realm._surface(captain).entities.find(value => value.id === id); assert.ok(entity, id); Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity; }
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
async function advance(realm, captain, id, choices = {}) {
  const current = step(captain, id), view = captain.game.narrativeBoard().active.find(value => value.id === id);
  await go(realm, captain, current.kind === 'ship-scan' ? view.target : current.at);
  return ok(await act(realm, captain, id, current.kind === 'puzzle' ? 'solve' : current.kind === 'choice' ? 'choose' : 'advance', {
    entityId: current.at.entityId, solution: current.puzzle?.solution, choiceId: choices[current.id] || current.options?.[0].id,
  }));
}
async function until(realm, captain, id, stageId, choices = {}) { while (step(captain, id).id !== stageId) await advance(realm, captain, id, choices); }
async function fixture(seed) {
  const realm = new Realm({ id: 'LOCAL123', seed, persistence });
  const a = (await realm.createCaptain('Repair captain')).captain, b = (await realm.createCaptain('Dispatch captain')).captain;
  for (const captain of [a, b]) { ok(realm.attach(captain, { close() {} })); captain.game.state.credits = 1000; captain.game.state.cargo.ore = 30; }
  return { realm, a, b };
}

test('shared repair decisions require the real supply ship and do not spend another captain’s cargo or grant their support', async () => {
  let { realm, a, b } = await fixture('shared-local-repair');
  ok(await act(realm, a, 'cold_chain', 'accept')); ok(await act(realm, b, 'cold_chain', 'accept'));
  await until(realm, a, 'cold_chain', 'parts'); await go(realm, a, step(a, 'cold_chain').at);
  const own = realm.vessels.get(a.ownedVesselId), originalOre = a.game.state.cargo.ore;
  own.dockedAt = 'kettle';
  const denied = await act(realm, a, 'cold_chain', 'choose', { choiceId: 'rebuild', entityId: 'quest:mara-reed' });
  assert.equal(denied.ok, false); assert.match(denied.reason, /ship|vessel|port/i); assert.equal(a.game.state.cargo.ore, originalOre);
  own.dockedAt = 'morrow'; await advance(realm, a, 'cold_chain', { parts: 'rebuild' });
  assert.equal(a.game.state.cargo.ore, originalOre - 4); assert.equal(b.game.state.cargo.ore, 30);
  while (a.game.state.narrative.quests.cold_chain.status === 'active') await advance(realm, a, 'cold_chain', { agreement: 'care' });
  assert.equal(b.game.state.narrative.quests.cold_chain.stage, 1); assert.equal(b.game.narrativeServiceBenefit('rest'), null);
  assert.equal(a.game.narrativeServiceBenefit('rest')?.multiplier, .75);
  const id = a.id, otherId = b.id, credits = a.game.state.credits;
  realm = new Realm({ id: realm.id, snapshot: realm.document(), persistence }); a = realm.captains.get(id); b = realm.captains.get(otherId);
  ok(realm.attach(a, { close() {} })); ok(realm.attach(b, { close() {} }));
  assert.equal(a.game.state.credits, credits); assert.equal(a.game.state.narrative.quests.cold_chain.status, 'completed');
  assert.equal((await act(realm, a, 'cold_chain', 'advance', { entityId: 'quest:mara-reed' })).code, 'duplicate');
  assert.equal(b.game.state.narrative.quests.cold_chain.status, 'active');
});

test('shared passenger trial requires authoritative pickup and delivery and rewards only the captain with the receipt', async () => {
  const { realm, a, b } = await fixture('shared-local-dispatch');
  for (const captain of [a, b]) { ok(await act(realm, captain, 'fair_departure', 'accept')); await until(realm, captain, 'fair_departure', 'trial', { charter: 'commute' }); }
  await go(realm, a, step(a, 'fair_departure').at);
  assert.equal((await act(realm, a, 'fair_departure', 'advance', { entityId: 'quest:len-vale', receipt: true })).code, 'requirements');
  walk(realm, a, 'quest:passage-desk:kettle'); const offer = a.game.passengerOffers()[0]; assert.ok(offer);
  ok(await realm.command(a, 'acceptPassenger', { offerId: offer.id, entityId: offer.sourceEntityId }));
  assert.equal((await realm.command(a, 'deliverPassenger', { entityId: offer.targetEntityId })).ok, false, 'the origin cannot deliver the passenger remotely');
  await land(realm, a, offer.targetBody); walk(realm, a, offer.targetEntityId); ok(await realm.command(a, 'deliverPassenger', { entityId: offer.targetEntityId }));
  assert.equal(a.game.hasFlag('thread:fair_departure_trial_complete'), true); assert.equal(b.game.hasFlag('thread:fair_departure_trial_complete'), false);
  const credits = a.game.state.credits, reward = a.game.state.narrative.quests.fair_departure.rewardQuote;
  await advance(realm, a, 'fair_departure'); await advance(realm, a, 'fair_departure'); assert.equal(a.game.state.credits, credits + reward);
  assert.equal((await act(realm, a, 'fair_departure', 'advance', { entityId: 'quest:len-vale' })).code, 'duplicate');
  await go(realm, b, step(b, 'fair_departure').at); assert.equal((await act(realm, b, 'fair_departure', 'advance', { entityId: 'quest:len-vale' })).code, 'requirements');
});

test('shared calibration reads the actual helm vessel and cannot be advanced by an off-helm captain', async () => {
  const { realm, a, b } = await fixture('shared-local-signal');
  for (const captain of [a, b]) ok(await act(realm, captain, 'clear_signal', 'accept'));
  await until(realm, a, 'clear_signal', 'flight-reference');
  const target = a.game.narrativeBoard().active.find(value => value.id === 'clear_signal').target; await go(realm, a, target);
  const vessel = realm.vessels.get(a.ownedVesselId); vessel.ship.energy = 20; vessel.helmOwner = b.id;
  assert.equal((await act(realm, a, 'clear_signal', 'advance')).code, 'helm'); assert.equal(vessel.ship.energy, 20);
  vessel.helmOwner = a.id; ok(await act(realm, a, 'clear_signal', 'advance')); assert.equal(vessel.ship.energy, 12);
  assert.equal(step(a, 'clear_signal').id, 'calibration'); assert.equal(b.game.state.narrative.quests.clear_signal.stage, 1);
  while (a.game.state.narrative.quests.clear_signal.status === 'active') await advance(realm, a, 'clear_signal', { publication: 'redacted' });
  assert.equal(a.game.narrativeScanCost({ kind: 'survey' }), 6); assert.equal(b.game.narrativeScanCost({ kind: 'survey' }), 8);
  await launch(realm,a);const signal={id:'shared-calibration-survey',name:'Ordinary survey',kind:'survey',x:vessel.ship.x,y:vessel.ship.y,radius:15,resolved:false,scanned:false};
  realm._room('hearth').runtime.signals.push(signal);vessel.ship.energy=6;ok(await realm.command(a,'scan',{id:signal.id}));assert.equal(vessel.ship.energy,0);
});
