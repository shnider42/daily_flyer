import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameStats } from '../public/frame-stats.mjs';

test('frame report measures real intervals and retains a long hitch without clamping it', () => {
  const stats = new FrameStats();
  for (let i = 0; i < 59; i++) stats.record(1000 / 60, 4);
  stats.record(200, 80);
  const result = stats.summary();
  assert(Math.abs(result.fps - 60_000 / (59 * 1000 / 60 + 200)) < .001);
  assert.equal(result.slowFrames, 1);
  assert.equal(result.worstMs, 200);
  assert(result.workMs > 5);
});

test('frame history remains bounded and a new match starts with no stale measurements', () => {
  const stats = new FrameStats(120);
  stats.record(500, 300);
  for (let i = 0; i < 120; i++) stats.record(1000 / 60, 3);
  assert.equal(stats.summary().frames, 120);
  assert.equal(stats.summary().slowFrames, 0);
  assert(Math.abs(stats.summary().fps - 60) < .001);
  stats.reset();
  stats.record(0, 0); stats.record(NaN, 0); stats.record(16, Infinity);
  assert.equal(stats.summary(), null);
});
