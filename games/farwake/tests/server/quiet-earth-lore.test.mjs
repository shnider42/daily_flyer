import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { QUIET_EARTH_FRAGMENT_RECORDS } from '../../dist/quiet-earth-lore.mjs';

const ok = value => { assert.equal(value?.ok, true, value?.reason); return value; };

function approach(realm, captain, type, id) {
  const target = realm._surface(captain).entities.find(item => item.type === type &&
    (item.data?.recordId === id || item.data?.siteId === id));
  assert.ok(target, `Expected ${type}: ${id}`);
  Object.assign(captain.game.state.person, { x: target.x, y: target.y });
  return target;
}

test('shared record receipts do not grant another captain a personal copy, including after restart', async () => {
  const persistence = { kind: 'memory', version: 0, snapshot: null, async save(_id, version, snapshot) {
    this.version = version + 1; this.snapshot = structuredClone(snapshot); return { version: this.version };
  } };
  let realm = new Realm({ id: 'LORE001', seed: 'quiet-earth-shared-evidence', persistence });
  const captains = [];
  for (let i = 0; i < 2; i++) {
    const { captain } = await realm.createCaptain(`Evidence reader ${i + 1}`, { startMode: 'casual', startSystemId: 'hearth' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.signals = [];
    const body = room.runtime.bodies.find(item => item.id === 'morrow'), vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    ok(await realm.command(captain, 'dock', { id: body.id }));
    approach(realm, captain, 'siteEntrance', 'relay-nine');
    ok(await realm.command(captain, 'enterSite', { siteId: 'relay-nine' }));
  }
  const fragment = QUIET_EARTH_FRAGMENT_RECORDS.find(record => record.id === 'collective-copy');
  const target = approach(realm, captains[0], 'siteRecord', fragment.id);
  const answer = ok(await realm.command(captains[0], 'siteAction', { entityId: target.id, action: 'inspect' }));
  assert.equal(answer.loreId, fragment.loreId);
  assert.ok(captains[0].game.state.knownLore.includes(fragment.loreId));
  assert.ok(!captains[1].game.state.knownLore.includes(fragment.loreId));
  assert.ok(captains[1].game.state.exploration.encounter.story.readRecords.includes(fragment.id),
    'The site receipt is shared, while the collected copy is personal.');

  realm.markDirty(); await realm.flush();
  realm = new Realm({ id: realm.id, seed: realm.seed, version: persistence.version,
    snapshot: structuredClone(persistence.snapshot), persistence });
  const restored = captains.map(original => realm.captains.get(original.id));
  for (const captain of restored) ok(realm.attach(captain, { close() {} }));
  assert.ok(restored[0].game.state.knownLore.includes(fragment.loreId));
  assert.ok(!restored[1].game.state.knownLore.includes(fragment.loreId));
  const secondRead = approach(realm, restored[1], 'siteRecord', fragment.id);
  ok(await realm.command(restored[1], 'siteAction', { entityId: secondRead.id, action: 'inspect' }));
  assert.ok(restored[1].game.state.knownLore.includes(fragment.loreId), 'A second physical reader can keep their own copy.');
});
