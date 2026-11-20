import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { Game } from '../../dist/engine.mjs';
import { explorationLocation } from '../../dist/exploration.mjs';
import { generateSurface } from '../../dist/surface.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const memory = () => ({ kind: 'memory', version: 0, snapshot: null,
  async save(_id, version, snapshot) { this.snapshot = structuredClone(snapshot); this.version = version + 1; return { version: this.version }; } });
const at = (realm, captain, predicate) => {
  const target = realm._surface(captain).entities.find(predicate); assert.ok(target);
  Object.assign(captain.game.state.person, { x: target.x, y: target.y }); return target;
};

test('captains share seeded physical passages and saved cues through a realm restart', async () => {
  const persistence = memory(), seed = 'annex-shared-archive', realm = new Realm({ id: 'ANNEX01', seed, persistence }), captains = [];
  for (let i = 0; i < 2; i++) {
    const { captain } = await realm.createCaptain(`Archive crew ${i}`, { startMode: 'casual', startSystemId: 'hearth' });
    ok(realm.attach(captain, { close() {} })); captains.push(captain);
    const room = realm._room('hearth'); room.runtime.enemies = []; room.runtime.bullets = []; room.runtime.signals = [];
    const body = room.runtime.bodies.find(item => item.id === 'morrow'), vessel = realm.vessels.get(captain.ownedVesselId);
    Object.assign(vessel.ship, { x: body.x, y: body.y + body.radius + 60, vx: 0, vy: 0 });
    ok(await realm.command(captain, 'dock', { id: body.id }));
    at(realm, captain, item => item.type === 'siteEntrance' && item.data?.siteId === 'relay-nine');
    ok(await realm.command(captain, 'enterSite', { siteId: 'relay-nine' }));
  }
  const [one, two] = captains, first = realm._surface(one), second = realm._surface(two);
  assert.deepEqual(first.tiles, second.tiles);
  const solo = new Game(seed), body = solo.system.bodies.find(item => item.id === 'morrow');
  assert.deepEqual(first.tiles, generateSurface(explorationLocation(body, 'relay-nine', seed), seed).tiles);
  const entry = at(realm, one, item => item.data?.choiceId === 'check-in');
  ok(await realm.command(one, 'siteAction', { entityId: entry.id, action: 'choose', optionId: 'begin' }));
  const cue = first.site.corridorPlan.cues[0]; Object.assign(one.game.state.person, { x: cue.x, y: cue.y });
  realm._stepExplorations(captains, .1);
  assert.ok(one.game.state.exploration.encounter.quietEarth.cues.includes(cue.id));
  realm.markDirty(); await realm.flush();
  const restored = new Realm({ id: realm.id, seed, version: persistence.version, snapshot: structuredClone(persistence.snapshot), persistence });
  const restoredOne = restored.captains.get(one.id), restoredTwo = restored.captains.get(two.id);
  for (const captain of [restoredOne, restoredTwo]) ok(restored.attach(captain, { close() {} }));
  assert.deepEqual(restored._surface(restoredOne).tiles, first.tiles);
  assert.deepEqual(restored._surface(restoredTwo).tiles, first.tiles);
  assert.equal(restoredOne.game.state.person.x, cue.x); assert.equal(restoredOne.game.state.person.y, cue.y);
  assert.ok(restoredOne.game.state.exploration.encounter.quietEarth.cues.includes(cue.id));
  assert.ok(restoredTwo.game.state.exploration.encounter.quietEarth.cues.includes(cue.id));
});
