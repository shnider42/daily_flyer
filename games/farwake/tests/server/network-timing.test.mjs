import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepClock } from '../../server/timing.mjs';
import { Realm } from '../../server/realm.mjs';
import { compactSnapshot } from '../../server/index.mjs';
import { mergeSnapshot } from '../../dist/network.mjs';

const storage = () => ({ kind: 'test-memory', save: async (_id, version) => ({ version: version + 1 }) });
async function captainFixture() {
  const realm = new Realm({ id: 'TIMING12', persistence: storage() });
  const { captain } = await realm.createCaptain('Timing captain');
  realm.attach(captain, { send() {}, close() {} });
  return { realm, captain };
}

test('an early timer wakes at the remaining fixed-step deadline instead of waiting another 33ms', () => {
  const clock = new FixedStepClock({ now: 0 }), ticks = [];
  assert.equal(clock.advance(33, (...args) => ticks.push(args)), 0);
  assert.equal(clock.nextDelay(33), 1);
  assert.equal(clock.advance(34, (...args) => ticks.push(args)), 1);
  assert.equal(ticks[0][0], 1 / 30);
  assert.equal(clock.nextDelay(34), 33);

  const regular = new FixedStepClock({ now: 0 }), at = [];
  let time = 0;
  while (time < 10000) {
    time += regular.nextDelay(time);
    regular.advance(time, () => at.push(time));
    time += .15; // Account for completed simulation/snapshot work before choosing the next deadline.
  }
  const intervals = at.slice(1).map((value, index) => value - at[index]);
  assert.ok(Math.max(...intervals) < 36, 'Timer quantization must not create a 66ms missed-step interval.');
  assert.ok(at.length >= 299 && at.length <= 301, 'Deadline correction preserves the original 30Hz rate.');
});

test('bounded catch-up exposes the physics timestamp and promptly schedules remaining work', () => {
  const clock = new FixedStepClock({ now: 0 }), represented = [];
  const steps = clock.advance(217, (dt, tick, remaining) => represented.push({ dt, tick, at: 217 - remaining * 1000 }));
  assert.equal(steps, 6); assert.equal(clock.tick, 6);
  for (let i = 0; i < represented.length; i++) assert.ok(Math.abs(represented[i].at - (i + 1) * 1000 / 30) < .001);
  assert.equal(clock.nextDelay(220), 14);
  const second = clock.advance(2000, () => {});
  assert.equal(second, 6, 'A long suspension cannot create unbounded catch-up work.');
  assert.equal(clock.nextDelay(2000), 1, 'Remaining catch-up is not delayed by a full simulation interval.');
});

test('direct motion snapshots match the established compact protocol in space and on a crew deck', async t => {
  const { realm, captain } = await captainFixture();
  const stamp = Date.now() - 12;
  realm.step(1 / 30, 17, Date.now(), stamp);
  // Both encodings describe the same observation time. Resident routines carry
  // a wall-clock sample alongside the existing packet timestamp.
  const snapshotAt = Date.now(); t.mock.method(Date, 'now', () => snapshotAt);
  const vessel = realm.vessels.get(captain.ownedVesselId), locationForVessel = realm._locationForVessel.bind(realm);
  let locationProjections = 0;
  realm._locationForVessel = (...args) => { locationProjections++; return locationForVessel(...args); };
  for (const view of ['space', 'cabin', 'refitted-cabin']) {
    if (view === 'cabin') realm._cabin(captain, vessel);
    if (view === 'refitted-cabin') {
      // A refit can occur without advancing the simulation tick. Both packet
      // shapes must replace the old stored deck descriptor immediately.
      captain.game.state.ship.classId = 'hauler'; captain.game._updateStats(false);
      vessel.name = 'Refitted test vessel';
    }
    locationProjections = 0;
    const full = realm.snapshotFor(captain, { drainEvents: false });
    const fullProjections = locationProjections;
    locationProjections = 0;
    const motion = realm.snapshotFor(captain, { drainEvents: false, compact: true });
    assert.equal(fullProjections, locationProjections, 'Full metadata must not rebuild a deck descriptor that the common snapshot projection replaces.');
    const oldShape = compactSnapshot(full); oldShape.serverTime = motion.serverTime;
    assert.deepEqual(motion, oldShape);
    if (view !== 'space') {
      assert.equal(full.state.interior.location.shipClassId, vessel.ship.classId);
      assert.equal(full.state.interior.location.vesselName, vessel.name);
    }
    assert.equal(motion.simulatedAt, stamp); assert.ok(motion.simulatedAt <= motion.serverTime);
    assert.equal(motion.state.journal, undefined); assert.equal(motion.state.worlds, undefined);
    assert.equal(motion.fleet, undefined); assert.equal(motion.presence, undefined);
  }
});

test('both compact encodings retain the occupied Sol visit and clear the cordon after departure', async t => {
  const { realm, captain } = await captainFixture(), vessel = realm.vessels.get(captain.ownedVesselId);
  captain.game.state.upgrades.fold_3 = 1; captain.game._updateStats();
  vessel.ship = captain.game.state.ship; vessel.ship.fuel = vessel.ship.maxFuel;
  Object.assign(vessel, { systemId: 'witness', dockedAt: null, helmOwner: captain.id, actor: null });
  captain.aboard = vessel.id; captain.crewRole = 'helm';
  Object.assign(captain.game.state, { systemId: 'witness', mode: 'ship', locationId: null, interior: null, pendingEncounter: null });
  realm._room('witness').runtime.enemies = []; realm._bindCaptain(captain);
  const jump = realm._command(captain, 'travel', { id: 'sol' }); assert.equal(jump.ok, true, jump.reason);
  const sol = realm._room('sol'), cordon = sol.runtime.solCordon;
  cordon.visits['other-hull'] = { originSystemId: 'hearth', elapsed: 50, approach: true, aggressive: true };
  const battery = sol.runtime.enemies.find(enemy => enemy.solCordon && enemy.cordonRole === 'battery');
  battery.hp = 0; sol.coordinator._defeat(battery, captain.game);
  const snapshotAt = Date.now(); t.mock.method(Date, 'now', () => snapshotAt);
  const paired = () => {
    const full = realm.snapshotFor(captain, { drainEvents: false });
    const direct = realm.snapshotFor(captain, { drainEvents: false, compact: true, worldViews: new Map() });
    const converted = compactSnapshot(full);
    assert.deepEqual(direct, converted, 'Both network entry points publish the same public protocol.');
    return { full, direct };
  };
  let lastSol;
  for (const view of ['space', 'cabin']) {
    if (view === 'cabin') realm._cabin(captain, vessel);
    const { full, direct } = paired();
    assert.deepEqual(Object.keys(direct.world.solCordon.visits), [vessel.id], 'Another hull’s visit stays private in either encoding.');
    assert.equal(direct.world.solCordon.visits[vessel.id].originSystemId, 'witness');
    assert.deepEqual(direct.world.solCordon.destroyedBatteryIds, [battery.id]);
    cordon.visits[vessel.id].elapsed += .25;
    const update = paired().direct;
    assert.deepEqual(mergeSnapshot(full, update).world.solCordon, update.world.solCordon, 'A motion update replaces the previous visit on the client.');
    lastSol = full;
  }
  Object.assign(captain.game.state, { mode: 'ship', locationId: null, interior: null, pendingEncounter: null });
  captain.crewRole = 'helm'; vessel.helmOwner = captain.id; realm._bindCaptain(captain);
  const retreat = realm._command(captain, 'travel', { id: 'witness' }); assert.equal(retreat.ok, true, retreat.reason);
  const { direct } = paired();
  assert.equal(direct.world.solCordon, null, 'Departure explicitly clears Sol state instead of omitting the field.');
  assert.equal(mergeSnapshot(lastSol, direct).world.solCordon, null);
});

test('snapshots and durable documents do not traverse discarded per-captain world histories', async () => {
  const { realm, captain } = await captainFixture();
  let historyReads = 0;
  Object.defineProperty(captain.game.state.worlds, 'far-away-record', { enumerable: true, configurable: true, get() { historyReads++; return { depleted: ['distant-rock'] }; } });
  realm.snapshotFor(captain, { compact: true });
  const full = realm.snapshotFor(captain);
  const document = realm.document();
  assert.equal(historyReads, 0, 'Off-system records must not be cloned before being dropped from a personal snapshot.');
  assert.deepEqual(Object.keys(full.state.worlds), ['hearth']);
  assert.deepEqual(document.captains[captain.id].game.worlds, {});
  assert.ok(document.worlds.hearth.record, 'The canonical shared record is still persisted.');
});

test('frequent motion snapshots do not materialize journals, home rosters, or the full fleet', async () => {
  const { realm, captain } = await captainFixture();
  let journalReads = 0, fleetReads = 0;
  Object.defineProperty(captain.game.state, 'journal', { enumerable: true, configurable: true, get() { journalReads++; return []; } });
  const publicVessel = realm._publicVessel.bind(realm);
  realm._publicVessel = (...args) => { fleetReads++; return publicVessel(...args); };
  realm.snapshotFor(captain, { compact: true });
  assert.equal(journalReads, 0); assert.equal(fleetReads, 0);
  realm.snapshotFor(captain);
  assert.ok(journalReads > 0); assert.ok(fleetReads > 0, 'The full metadata snapshot still includes the owned fleet.');
});
