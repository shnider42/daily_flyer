import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { EARTH_CAMPAIGN, EARTH_CAMPAIGN_ID } from '../../dist/earth-campaign-content.mjs';
import { earthStageTarget } from '../../dist/earth-campaign-rules.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason || JSON.stringify(result)); return result; };
const persistence = () => ({ kind: 'memory', async save(_id, version) { return { version: version + 1 }; } });
const record = captain => captain.game.state.narrative.quests[EARTH_CAMPAIGN_ID];
const action = (realm, captain, name, extra = {}) => realm._command(captain, 'threadAction', { threadId: EARTH_CAMPAIGN_ID, action: name, ...extra });

async function fixture() {
  const realm = new Realm({ id: 'EARTH123', seed: 'earth-shared-authority', persistence: persistence() });
  const owner = (await realm.createCaptain('Ship owner')).captain;
  const guest = (await realm.createCaptain('Relief pilot', { startMode: 'hardcore' })).captain;
  for (const captain of [owner, guest]) ok(realm.attach(captain, { close() {} }));
  const carrier = realm.vessels.get(owner.ownedVesselId);
  owner.game.state.fleet.owned.push('tern'); owner.game._activateClass('tern', true);
  carrier.grants[guest.id] = { allowed: true, roles: ['helm', 'scanner'], allowBunk: true };
  ok(action(realm, guest, 'accept'));
  return { realm, owner, guest, carrier };
}

function positionFor(f, stageId) {
  const { realm, guest, carrier } = f, index = EARTH_CAMPAIGN.stages.findIndex(step => step.id === stageId);
  assert.ok(index >= 0); record(guest).stage = index;
  const step = EARTH_CAMPAIGN.stages[index]; carrier.systemId = step.at.systemId; carrier.dockedAt = null;
  realm._cabin(guest, carrier); carrier.helmOwner = guest.id; guest.crewRole = 'helm';
  Object.assign(guest.game.state, { mode: 'ship', locationId: null, interior: null });
  realm._bindCaptain(guest); guest.game.syncNarrativeWorld();
  const point = earthStageTarget(guest.game, step, record(guest));
  Object.assign(carrier.ship, { x: point.x, y: point.y, vx: 0, vy: 0 });
  // Remove unrelated ambient danger so each test isolates mission authority.
  guest.game.system.enemies = guest.game.system.enemies.filter(enemy => enemy.earthCampaign);
  return step;
}

test('a shipless permitted guest rescues into the actual borrowed hull and only that docked hull can deliver', async () => {
  const f = await fixture(), { realm, guest, carrier } = f;
  positionFor(f, 'tinbell-rescue');
  assert.equal(guest.ownedVesselId, null);
  ok(action(realm, guest, 'advance'));
  assert.equal(record(guest).earth.passenger.shipId, carrier.id);
  assert.equal(realm._passengerBerths(carrier).narrative, 1);
  assert.equal(record(guest).stage, EARTH_CAMPAIGN.stages.findIndex(step => step.id === 'kettle-drop'));
  realm._landCharacter(guest, 'hearth', 'kettle');
  const receiving = realm._surface(guest).entities.find(entity => entity.id === 'quest:earth-vale'); assert.ok(receiving);
  Object.assign(guest.game.state.person, { x: receiving.x, y: receiving.y });
  const before = guest.game.state.credits;
  assert.equal(action(realm, guest, 'advance', { entityId: receiving.id }).code, 'vessel');
  carrier.dockedAt = 'kettle';
  ok(action(realm, guest, 'advance', { entityId: receiving.id }));
  assert.equal(guest.game.state.credits, before + 100);
  assert.equal(record(guest).earth.passenger, null);
  assert.equal(realm._passengerBerths(carrier).narrative, 0);
  assert.equal(guest.ownedVesselId, null, 'Helping never grants ownership of the borrowed hull.');
  assert.equal(action(realm, guest, 'advance', { entityId: receiving.id }).ok, false);
  assert.equal(guest.game.state.credits, before + 100, 'A repeated delivery cannot pay twice.');
});

test('a borrowed-hull defense advances once per shared tick and its battle is visible to an uninvolved captain', async () => {
  const f = await fixture(), { realm, owner, guest, carrier } = f;
  positionFor(f, 'brindle-defense');
  realm._landCharacter(owner, 'brindle', 'weighhouse');
  ok(action(realm, guest, 'beginDefense'));
  assert.equal(record(guest).earth.operation.shipId, carrier.id);
  const op = record(guest).earth.operation, start = op.held;
  realm.step(.1, 1, Date.now());
  assert.ok(op.held > start && op.held <= start + .100001, 'Owner actor and visiting pilot do not double-count one watch.');
  const room = realm._room('brindle'), mission = room.runtime.enemies.filter(enemy => enemy.earthCampaign);
  assert.ok(mission.length > 0);
  assert.equal(owner.game.state.narrative.quests[EARTH_CAMPAIGN_ID], undefined);
  // An uninvolved captain flying a separate ship sees this same physical battle.
  const spectator = (await realm.createCaptain('Passing trader')).captain;
  ok(realm.attach(spectator, { close() {} }));
  realm.vessels.get(spectator.ownedVesselId).systemId = 'brindle'; realm._bindCaptain(spectator);
  const observer = realm.snapshotFor(spectator, { drainEvents: false });
  assert.ok(observer.world.enemies.some(enemy => enemy.id === mission[0].id));
  const packet = realm.snapshotFor(guest, { drainEvents: false, compact: true });
  assert.equal(packet.state.earthCampaignView.stageId, 'brindle-defense');
  assert.equal(packet.state.earthCampaignView.held, op.held);
  assert.equal(packet.state.earthCampaignView.operationId, guest.game.earthCampaignStatus().operationId);
});

test('flight intentions require the actual helm and shared reservations prevent a second rescue overbooking', async () => {
  const f = await fixture(), { realm, owner, guest, carrier } = f;
  positionFor(f, 'tinbell-rescue');
  carrier.helmOwner = owner.id;
  assert.equal(action(realm, guest, 'advance').code, 'helm');
  assert.equal(record(guest).earth.passenger, null);
  carrier.helmOwner = guest.id;
  ok(action(realm, owner, 'accept'));
  const ownerRecord = record(owner), rescueIndex = record(guest).stage;
  ownerRecord.stage = rescueIndex + 1;
  ownerRecord.earth.passenger = { id: 'engineer-aru', name: 'Aru Sen', shipId: carrier.id, pickupId: 'tinbell-rescue', pickupStage: rescueIndex };
  carrier.ship.berths = 2; // One actual pilot plus the owner's reserved survivor.
  assert.equal(action(realm, guest, 'advance').code, 'capacity');
  assert.equal(record(guest).earth.passenger, null);
});

test('destroying a borrowed carrier while its rescue captain is ashore rewinds pickup without a stipend', async () => {
  const f = await fixture(), { realm, guest, carrier } = f;
  positionFor(f, 'tinbell-rescue'); ok(action(realm, guest, 'advance'));
  const before = guest.game.state.credits;
  realm._landCharacter(guest, 'hearth', 'morrow');
  realm._destroyVessel(carrier);
  assert.equal(record(guest).earth.passenger, null);
  assert.equal(EARTH_CAMPAIGN.stages[record(guest).stage].id, 'tinbell-rescue');
  assert.equal(record(guest).earth.recoveries, 1);
  assert.equal(guest.game.state.credits, before);
  assert.equal(guest.game.state.locationId, 'morrow', 'An ashore guest is not moved with the lost hull.');
});

test('borrowed carrier and individual Earth progress survive a realm restart', async () => {
  const f = await fixture(), { realm, guest, carrier } = f;
  positionFor(f, 'brindle-defense'); ok(action(realm, guest, 'beginDefense'));
  realm.step(.1, 1, Date.now());
  const before = structuredClone(record(guest)), saved = realm.document();
  const restored = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  const captain = restored.captains.get(guest.id); ok(restored.attach(captain, { close() {} }));
  assert.equal(captain.aboard, carrier.id);
  assert.equal(record(captain).earth.operation.shipId, carrier.id);
  assert.equal(record(captain).earth.operation.held, before.earth.operation.held);
  assert.equal(record(captain).earth.key, before.earth.key);
  restored.step(.1, 2, Date.now());
  assert.ok(record(captain).earth.operation.held > before.earth.operation.held);
  assert.equal(restored.captains.get(f.owner.id).game.state.narrative.quests[EARTH_CAMPAIGN_ID], undefined);
});

test('a scanner console cannot bypass the helm requirement for a campaign rescue', async () => {
  const f = await fixture(), { realm, guest, carrier } = f;
  positionFor(f, 'tinbell-rescue');
  const marker = guest.game.system.signals.find(signal => signal.earthCampaign && signal.missionRole === 'rescue');
  assert.ok(marker); realm._cabin(guest, carrier); carrier.helmOwner = null; guest.crewRole = 'scanner';
  const console = realm._surface(guest).entities.find(entity => entity.data?.stationRole === 'navigation');
  assert.ok(console); Object.assign(guest.game.state.person, { x: console.x, y: console.y });
  assert.equal(realm._command(guest, 'scan', { id: marker.id }).code, 'helm');
  assert.equal(record(guest).earth.passenger, null);
});

test('losing an escort carrier in another system cleans the original battle and schedules a fresh rescue', async () => {
  const f = await fixture(), { realm, guest, carrier } = f;
  positionFor(f, 'sable-rescue'); ok(action(realm, guest, 'advance'));
  positionFor(f, 'sable-escort'); ok(action(realm, guest, 'beginDefense'));
  const battle = realm._room('sable'), key = record(guest).earth.key;
  assert.ok(battle.runtime.enemies.some(enemy => enemy.campaignKey === key));
  carrier.systemId = 'nacre'; realm._bindCaptain(guest);
  realm._destroyVessel(carrier);
  assert.equal(EARTH_CAMPAIGN.stages[record(guest).stage].id, 'sable-rescue');
  assert.equal(record(guest).earth.recoveries, 1);
  assert.equal(battle.runtime.enemies.some(enemy => enemy.campaignKey === key && !enemy.canonicalVesselId), false);
  assert.equal(battle.record.spawned.some(enemy => enemy.campaignKey === key && !enemy.canonicalVesselId), false);
  assert.equal(battle.runtime.signals.some(signal => signal.campaignKey === key), false);
});
