import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepClock } from '../../server/timing.mjs';
import { Realm } from '../../server/realm.mjs';
import { compactSnapshot } from '../../server/index.mjs';

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

test('direct motion snapshots match the established compact protocol in space and on a crew deck', async () => {
  const { realm, captain } = await captainFixture();
  const stamp = Date.now() - 12;
  realm.step(1 / 30, 17, Date.now(), stamp);
  for (const cabin of [false, true]) {
    if (cabin) realm._cabin(captain, realm.vessels.get(captain.ownedVesselId));
    const full = realm.snapshotFor(captain, { drainEvents: false });
    const motion = realm.snapshotFor(captain, { drainEvents: false, compact: true });
    const oldShape = compactSnapshot(full); oldShape.serverTime = motion.serverTime;
    assert.deepEqual(motion, oldShape);
    assert.equal(motion.simulatedAt, stamp); assert.ok(motion.simulatedAt <= motion.serverTime);
    assert.equal(motion.state.journal, undefined); assert.equal(motion.state.worlds, undefined);
    assert.equal(motion.fleet, undefined); assert.equal(motion.presence, undefined);
  }
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
