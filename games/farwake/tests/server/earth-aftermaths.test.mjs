import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { EARTH_CAMPAIGN, EARTH_CAMPAIGN_ID } from '../../dist/earth-campaign-content.mjs';
import { EARTH_EVIDENCE } from '../../dist/earth-investigation.mjs';
import { questThread } from '../../dist/quest-content.mjs';
import { earthStageTarget } from '../../dist/earth-campaign-rules.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason || JSON.stringify(value)); return value; };
const persistence = { kind: 'earth-aftermath-memory', async save(_id, version) { return { version: version + 1 }; } };
const quest = (captain, id) => captain.game.state.narrative.quests[id];
const command = (realm, captain, id, action = 'advance', extra = {}) => realm.command(captain, 'threadAction', { threadId: id, action, ...extra });
const completed = (captain, account = 'false-return', allegiance = 'rogue') => {
  captain.game.state.narrative.quests[EARTH_CAMPAIGN_ID] = { status: 'completed', stage: EARTH_CAMPAIGN.stages.length, choices: { 'earth-account': account, 'earth-allegiance': allegiance }, solved: [], rewardQuote: 900, startedAt: 1, finishedAt: 2, targetId: null, huntOutcome: null, shipId: captain.game.state.ship.id, evacuated: false, outcome: 'The Earth investigation is complete.' };
  captain.game.state.knownLore.push(...Object.keys(EARTH_EVIDENCE));
  for (const flag of ['vault_recovered', 'homeward_signal', 'threshold_answered', 'thread:earth_truth_verified', `thread:earth_account_${account.replaceAll('-', '_')}`, `thread:earth_allegiance_${allegiance}`]) captain.game._flag(flag);
};
function walk(realm, captain, entityId) {
  const entity = realm._surface(captain).entities.find(entity => entity.id === entityId); assert.ok(entity, entityId);
  Object.assign(captain.game.state.person, { x: entity.x, y: entity.y }); return entity;
}
function land(realm, captain, systemId, bodyId, entityId, { dock = true } = {}) {
  const vessel = realm.vessels.get(captain.ownedVesselId);
  if (dock && vessel) { vessel.systemId = systemId; vessel.dockedAt = bodyId; vessel.helmOwner = null; }
  realm._landCharacter(captain, systemId, bodyId); if (entityId) walk(realm, captain, entityId);
}
function fly(realm, captain, threadId, stageId) {
  const definition = questThread(threadId), record = quest(captain, threadId);
  if (stageId) record.stage = definition.stages.findIndex(step => step.id === stageId);
  const step = definition.stages[record.stage], vessel = realm.vessels.get(captain.ownedVesselId);
  vessel.systemId = step.at.systemId; vessel.dockedAt = null; realm._cabin(captain, vessel); vessel.helmOwner = captain.id; captain.crewRole = 'helm';
  Object.assign(captain.game.state, { mode: 'ship', locationId: null, interior: null }); realm._bindCaptain(captain);
  const point = earthStageTarget(captain.game, step, record); Object.assign(vessel.ship, { x: point.x, y: point.y, vx: 0, vy: 0, energy: vessel.ship.maxEnergy });
  captain.game.syncNarrativeWorld(); return vessel;
}
async function fixture(seed) {
  const realm = new Realm({ id: 'EARTHA39', seed, persistence });
  const a = (await realm.createCaptain('Returning captain')).captain, b = (await realm.createCaptain('Other captain')).captain;
  for (const captain of [a, b]) { ok(realm.attach(captain, { close() {} })); captain.game.state.credits = 2000; }
  return { realm, a, b };
}

test('authoritative final decisions belong to the acting captain and do not reveal the ending to a friend', async () => {
  const { realm, a, b } = await fixture('shared-final-account'); completed(a);
  const main = quest(a, EARTH_CAMPAIGN_ID); main.status = 'active'; main.stage = EARTH_CAMPAIGN.stages.findIndex(step => step.id === 'earth-account'); main.choices = {};
  land(realm, a, 'sol', 'earth', 'quest:earth-lio');
  const before = JSON.stringify(b.game.state.narrative), lore = [...b.game.state.knownLore], owned = b.ownedVesselId;
  a.game.state.person.x += 400;
  assert.equal((await command(realm, a, EARTH_CAMPAIGN_ID, 'choose', { entityId: 'quest:earth-lio', choiceId: 'false-return' })).code, 'distance');
  walk(realm, a, 'quest:earth-lio'); ok(await command(realm, a, EARTH_CAMPAIGN_ID, 'choose', { entityId: 'quest:earth-lio', choiceId: 'false-return' }));
  ok(await command(realm, a, EARTH_CAMPAIGN_ID, 'choose', { entityId: 'quest:earth-lio', choiceId: 'reservoir' }));
  ok(await command(realm, a, EARTH_CAMPAIGN_ID, 'advance', { entityId: 'quest:earth-lio' }));
  assert.equal(a.game.earthAftermathStatus().account.id, 'false-return'); assert.equal(a.game.earthAftermathStatus().allegiance.id, 'reservoir');
  assert.equal(JSON.stringify(b.game.state.narrative), before); assert.deepEqual(b.game.state.knownLore, lore); assert.equal(b.ownedVesselId, owned);
  assert.equal(b.game.earthAftermathStatus().truthKnown, false); assert.equal(b.game.earthAftermathStatus().allegiance, null);
  const next = new Realm({ id: realm.id, snapshot: realm.document(), persistence });
  assert.equal(next.captains.get(a.id).game.earthAftermathStatus().account.id, 'false-return'); assert.equal(next.captains.get(b.id).game.earthAftermathStatus().account, null);
});

test('a continuing convoy defense projects its own live counters without replacing another captain’s campaign', async () => {
  const { realm, a, b } = await fixture('shared-aftermath-live-counters'); completed(a); const id = 'earth_return_followup';
  land(realm, a, 'hearth', 'kettle', 'quest:silas-voss'); ok(await command(realm, a, id, 'accept', { entityId: 'quest:silas-voss' }));
  fly(realm, a, id, 'relay-watch'); ok(await command(realm, a, id, 'beginDefense'));
  const operation = quest(a, id).earth.operation;
  realm.step(.1, 1, Date.now());
  assert.ok(operation.held > 0 && operation.held <= .100001);
  const packet = realm.snapshotFor(a, { drainEvents: false, compact: true });
  assert.equal(packet.state.earthCampaignView.threadId, id);
  assert.equal(packet.state.earthCampaignView.stageId, 'relay-watch');
  assert.equal(packet.state.earthCampaignView.aftermath, true);
  assert.equal(packet.state.earthCampaignView.held, operation.held);
  assert.equal(packet.state.earthCampaignView.operationId, a.game.earthCampaignStatus(id).operationId);
  assert.equal(a.game.earthCampaignStatus().status, 'completed', 'The completed main campaign remains a separate record.');
  const other = realm.snapshotFor(b, { drainEvents: false, compact: true });
  assert.equal(other.state.earthCampaignView.threadId, EARTH_CAMPAIGN_ID);
  assert.equal(other.state.earthCampaignView.status, 'available');
  assert.equal(quest(b, id), undefined);
});

test('post-finale convoy scanning and rescue use actual helm authority, berths, carrier identity and durable delivery', async () => {
  let { realm, a, b } = await fixture('shared-aftermath-convoy'); completed(a); const id = 'earth_return_followup';
  land(realm, a, 'hearth', 'kettle', 'quest:silas-voss'); ok(await command(realm, a, id, 'accept', { entityId: 'quest:silas-voss' }));
  let carrier = fly(realm, a, id);
  carrier.helmOwner = b.id;
  assert.equal((await command(realm, a, id)).code, 'helm'); carrier.helmOwner = a.id;
  ok(await command(realm, a, id)); assert.equal(quest(a, id).stage, 2); assert.equal(quest(b, id), undefined);
  carrier = fly(realm, a, id, 'ira-pickup');
  carrier.ship.berths = 1; assert.equal((await command(realm, a, id)).code, 'capacity'); carrier.ship.berths = 4;
  ok(await command(realm, a, id)); assert.equal(quest(a, id).earth.passenger.id, 'convoy-ira'); assert.equal(realm._passengerBerths(carrier).narrative, 1);
  const next = new Realm({ id: realm.id, snapshot: realm.document(), persistence }); realm = next; a = realm.captains.get(a.id); b = realm.captains.get(b.id);
  ok(realm.attach(a, { close() {} })); ok(realm.attach(b, { close() {} })); carrier = realm.vessels.get(a.ownedVesselId);
  assert.equal(quest(a, id).earth.passenger.shipId, carrier.id); assert.equal(realm._passengerBerths(carrier).narrative, 1);
  land(realm, a, 'sol', 'threshold', 'quest:earth-sol', { dock: false }); const before = a.game.state.credits;
  assert.equal((await command(realm, a, id, 'advance', { entityId: 'quest:earth-sol' })).code, 'vessel'); assert.equal(a.game.state.credits, before);
  carrier.dockedAt = 'threshold'; ok(await command(realm, a, id, 'advance', { entityId: 'quest:earth-sol' }));
  assert.deepEqual(quest(a, id).earth.delivered, ['convoy-ira']); assert.equal(a.game.state.credits, before + 100); assert.equal(realm._passengerBerths(carrier).narrative, 0);
  ok(await command(realm, a, id, 'advance', { entityId: 'quest:earth-sol' })); const paid = a.game.state.credits;
  assert.equal((await command(realm, a, id, 'advance', { entityId: 'quest:earth-sol' })).code, 'duplicate'); assert.equal(a.game.state.credits, paid);
  assert.equal(quest(b, id), undefined); assert.equal(b.game.hasFlag('thread:earth_rescued:convoy-ira'), false);
});
