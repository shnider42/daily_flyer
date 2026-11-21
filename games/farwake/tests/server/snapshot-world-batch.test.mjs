import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';

async function fixture(count = 4) {
  const persistence = { kind: 'test-memory', async save(_id, version) { return { version: version + 1 }; } };
  const realm = new Realm({ id: 'WORLDBAT', seed: 'broadcast-world-views', persistence }), captains = [];
  for (let index = 0; index < count; index++) {
    const { captain } = await realm.createCaptain(`Captain ${index}`);
    assert.equal(realm.attach(captain, { close() {} }).ok, true);
    captains.push(captain);
  }
  return { realm, captains, runtime: realm._room('hearth').runtime };
}
const packet = (realm, captain, compact, worldViews = null) => realm.snapshotFor(captain, { drainEvents: false, compact, worldViews });

test('one broadcast copies neutral world actors once while keeping personal signal progress exact', async t => {
  const { realm, captains, runtime } = await fixture();
  const snapshotAt = Date.now(); t.mock.method(Date, 'now', () => snapshotAt);
  captains[0].game._flag('belt_signal_scanned'); captains[2].game._flag('belt_signal_scanned');
  const canonicalSignal = runtime.signals.find(signal => signal.id === 'hearth:story:tinbell');
  assert.ok(canonicalSignal);
  const signalBefore = structuredClone(canonicalSignal);
  let copies = 0;
  const actor = { id: 'broadcast-probe', x: 0, y: 0, hp: 100, active: false };
  Object.defineProperty(actor, 'projectionProbe', { enumerable: true, get() { copies++; return 'neutral'; } });
  runtime.enemies.push(actor);
  for (const compact of [false, true]) {
    const independent = captains.map(captain => packet(realm, captain, compact));
    copies = 0;
    const worldViews = new Map(), shared = captains.map(captain => packet(realm, captain, compact, worldViews));
    assert.equal(copies, 1, 'A common actor tree is copied once for this broadcast, not once per captain.');
    assert.deepEqual(shared, independent);
    assert.deepEqual(shared.map(snap => snap.world.signals.find(signal => signal.id === canonicalSignal.id).resolved), [true, false, true, false]);
    assert.deepEqual(canonicalSignal, signalBefore, 'A personal story flag cannot rewrite the shared signal.');
    assert.notEqual(shared[0].world.enemies.at(-1), actor, 'Wire actors never alias authoritative actors.');
    shared[0].world.enemies.at(-1).hp = 0;
    assert.equal(actor.hp, 100, 'Changing a detached output cannot damage the authority.');
  }
});

test('broadcast views keep exterior, interior and packet detail boundaries separate and refresh after commands', async t => {
  const { realm, captains, runtime } = await fixture(2);
  const snapshotAt = Date.now(); t.mock.method(Date, 'now', () => snapshotAt);
  const [pilot, crew] = captains;
  realm._cabin(crew, realm.vessels.get(crew.ownedVesselId));
  const worldViews = new Map();
  for (const compact of [true, false]) {
    for (const captain of captains) assert.deepEqual(packet(realm, captain, compact, worldViews), packet(realm, captain, compact));
    const exterior = packet(realm, pilot, compact, worldViews).world;
    const interior = packet(realm, crew, compact, worldViews).world;
    assert.ok(exterior.signals.length > 0); assert.equal(interior.signals.length, 0);
    assert.equal(interior.enemies.length, 0); assert.equal(interior.bullets.length, 0);
    if (compact) assert.equal(exterior.asteroids, undefined);
    else assert.ok(exterior.asteroids.length > 0);
  }
  const tick = realm.tick, signal = runtime.signals.find(value => value.id === 'hearth:story:tinbell');
  const before = packet(realm, pilot, true, worldViews);
  pilot.game._flag('belt_signal_scanned');
  signal.x += 50;
  const after = packet(realm, pilot, true, new Map());
  assert.equal(realm.tick, tick, 'Command-visible changes need not advance the fixed-step clock.');
  assert.equal(after.world.signals.find(value => value.id === signal.id).x, signal.x);
  assert.equal(after.world.signals.find(value => value.id === signal.id).resolved, true);
  assert.equal(before.world.signals.find(value => value.id === signal.id).resolved, false);
  assert.deepEqual(after, packet(realm, pilot, true), 'The next broadcast and standalone command projection observe the same fresh authority.');
});

test('opposing Crosswind captains retain their own allegiance and hostility inside one shared world batch', async t => {
  const { realm, captains } = await fixture(2), [one, two] = captains;
  const snapshotAt = Date.now(); t.mock.method(Date, 'now', () => snapshotAt);
  for (const captain of captains) {
    const vessel = realm.vessels.get(captain.ownedVesselId); vessel.systemId = 'crosswind'; realm._bindCaptain(captain);
  }
  assert.equal((await realm.command(one, 'warzoneAction', { action: 'join', factionId: 'freewake' })).ok, true);
  assert.equal((await realm.command(two, 'warzoneAction', { action: 'join', factionId: 'meridian' })).ok, true);
  one.game.recordWarzoneAggression('freewake', { ground: false });
  const runtime = realm._room('crosswind').runtime, authority = structuredClone(runtime.warzone);
  for (const compact of [false, true]) {
    const independent = captains.map(captain => packet(realm, captain, compact));
    const worldViews = new Map(), shared = captains.map(captain => packet(realm, captain, compact, worldViews));
    assert.deepEqual(shared, independent);
    assert.deepEqual(shared.map(snap => snap.world.warzone.viewerFaction), ['freewake', 'meridian']);
    assert.deepEqual(shared[0].world.warzone.hostileFactions, ['freewake', 'meridian']);
    assert.deepEqual(shared[1].world.warzone.hostileFactions, ['freewake']);
    assert.notEqual(shared[0].world.warzone, shared[1].world.warzone);
    assert.deepEqual(runtime.warzone, authority, 'Projection does not rewrite fleet-war state or future encounter rolls.');
  }
});
