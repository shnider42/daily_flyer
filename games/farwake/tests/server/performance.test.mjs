import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityPerformance } from '../../server/performance.mjs';

test('authority diagnostics distinguish tick work, delayed scheduling and congestion without identities', () => {
  let time = 0;
  const metrics = new AuthorityPerformance({ now: () => time });
  for (let i = 0; i < 31; i++) { time = i * 1000 / 30; metrics.tick(2); metrics.schedule(i === 30 ? 90 : 0); }
  metrics.snapshot(12000, 3); metrics.snapshot(8000, 1); metrics.skip();
  const result = metrics.summary();
  assert.equal(result.simulationHz, 30); assert.equal(result.tickMs.mean, 2);
  assert.equal(result.snapshotBytesPerSecond, 20000); assert.equal(result.snapshotMs.mean, 2);
  assert.equal(result.scheduleDelayMs.max, 90); assert.equal(result.congestedSnapshotsSkipped, 1);
  assert.equal(result.snapshotsSent, 2);
  assert.deepEqual(Object.keys(result).sort(), ['windowSeconds', 'simulationHz', 'tickMs', 'snapshotMs', 'scheduleDelayMs', 'snapshotBytesPerSecond', 'snapshotsSent', 'congestedSnapshotsSkipped'].sort());
});

test('authority measurements expire after the window and memory stays bounded while running', () => {
  let time = 0;
  const metrics = new AuthorityPerformance({ now: () => time, windowMs: 1000, capacity: 10 });
  for (let i = 0; i < 100; i++) { time = i; metrics.tick(1); metrics.snapshot(1000, 1); metrics.skip(); metrics.schedule(2); }
  assert.equal(metrics.ticks.length, 10); assert.equal(metrics.snapshots.length, 10);
  assert.equal(metrics.skips.length, 10); assert.equal(metrics.scheduleDelays.length, 10);
  time = 2000;
  const result = metrics.summary();
  assert.equal(result.simulationHz, 0); assert.equal(result.snapshotsSent, 0);
  assert.equal(result.snapshotBytesPerSecond, 0); assert.equal(result.congestedSnapshotsSkipped, 0);
  assert.equal(result.scheduleDelayMs.max, 0);
});
