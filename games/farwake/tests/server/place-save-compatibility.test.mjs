import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { isWalkable } from '../../dist/surface.mjs';

const persistence = () => ({ kind: 'memory', save: async (_id, version) => ({ version: version + 1 }) });
const pose = person => ({ x: person.x, y: person.y });
const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };

test('a returning captain uses the rebuilt station entrance and the authoritative pose remains stable', async () => {
  const realm = new Realm({ id: 'SHAPE123', seed: 'place-reconnect', persistence: persistence() });
  const { captain } = await realm.createCaptain('Station visitor');
  realm._landCharacter(captain, 'vesper', 'listening');
  const saved = realm.document(), old = saved.captains[captain.id];
  delete old.game.person.surfaceLayoutVersion;
  Object.assign(old.game.person, { x: 400, y: 360, health: 73 });
  const restored = new Realm({ id: realm.id, snapshot: saved, persistence: persistence() });
  const returning = restored.captains.get(captain.id);
  // A recent reconnect keeps this exact port instead of invoking long-absence recovery.
  returning.lastSeen = Date.now(); returning.needsRestoration = false;
  ok(restored.attach(returning, { close() {} }));
  const surface = restored._surface(returning);
  assert.equal(surface.placeTypeId, 'archive-arc');
  assert.equal(isWalkable(surface, returning.game.state.person.x, returning.game.state.person.y), true);
  assert.deepEqual(pose(returning.game.state.person), pose(surface.spawn));
  assert.equal(returning.game.state.person.health, 73);
  const version = returning.game.state.person.surfaceLayoutVersion;
  const packet = restored.snapshotFor(returning, { drainEvents: false });
  assert.equal(packet.state.person.surfaceLayoutVersion, version);
  assert.deepEqual(pose(packet.state.person), pose(returning.game.state.person));
  restored._ensurePersonPosition(returning);
  assert.deepEqual(pose(returning.game.state.person), pose(surface.spawn));
  assert.equal(saved.captains[captain.id].game.person.surfaceLayoutVersion, undefined, 'The stored document was not mutated during restoration.');
});
