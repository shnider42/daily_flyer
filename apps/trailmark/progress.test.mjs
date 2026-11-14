import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProgress } from './progress.mjs';
import { distanceMeters, routeLength } from './navigation.mjs';

const origin = [-70.604, 41.719];
const latitudeMeter = 1 / 111195.08;
const longitudeMeter = latitudeMeter / Math.cos(origin[1] * Math.PI / 180);
const at = (east, north) => [origin[0] + east * longitudeMeter, origin[1] + north * latitudeMeter];
const time = 1000000;
const line = { coordinates: [at(0, 0), at(100, 0), at(200, 0), at(300, 0), at(400, 0)], waypoints: [{ id: 'turn', coordinate: at(100, 0), routeIndex: 1 }] };
const lollipop = {
  coordinates: [at(0, 0), at(100, 0), at(200, 0), at(400, 0), at(400, 200), at(200, 200), at(200, 0), at(100, 0), at(0, 0)],
  waypoints: [
    { id: 'entry', coordinate: at(200, 0), routeIndex: 2 },
    { id: 'far-turn', coordinate: at(400, 200), routeIndex: 4 },
    { id: 'return', coordinate: at(200, 0), routeIndex: 6 }
  ]
};
function fix(coordinate, elapsed, accuracy = 8) {
  return { longitude: coordinate[0], latitude: coordinate[1], timestamp: time + elapsed, accuracy };
}
function update(progress, coordinate, elapsed, accuracy = 8) {
  return progress.update(fix(coordinate, elapsed, accuracy), time + elapsed);
}
function pointAlong(route, target) {
  let distance = 0;
  for (let i = 0; i < route.coordinates.length - 1; i++) {
    const a = route.coordinates[i];
    const b = route.coordinates[i + 1];
    const length = distanceMeters(a, b);
    if (target <= distance + length) {
      const f = length ? (target - distance) / length : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    distance += length;
  }
  return route.coordinates.at(-1);
}
function walk(progress, route, from, to, startElapsed = 0, step = 10) {
  let result;
  for (let d = from; d <= to; d += step) {
    result = update(progress, pointAlong(route, d), startElapsed + (d - from) / 2.5 * 1000);
  }
  return result;
}

test('starting mid-route does not assume a start or skip checkpoints', () => {
  const progress = createProgress(line);
  const result = update(progress, at(200, 0), 0);
  assert.equal(result.started, false);
  assert.equal(result.along, 0);
  assert.equal(result.nextIndex, 0);
  assert.equal(result.nearStart, false);
  assert.equal(result.positionConfirmed, false);
});

test('a precise position near the start begins ordered guidance', () => {
  const progress = createProgress(line);
  const result = update(progress, at(10, 0), 0);
  assert.equal(result.started, true);
  assert.equal(result.nearStart, true);
  assert.equal(result.positionConfirmed, true);
  assert.ok(result.along >= 9 && result.along <= 11);
});

test('a waypoint is approached first and advances only on a later fix beyond 25 meters', () => {
  const progress = createProgress(line);
  walk(progress, line, 0, 100);
  assert.equal(progress.getSnapshot().atCheckpoint, true);
  assert.equal(progress.getSnapshot().nextIndex, 0);
  let result = update(progress, at(120, 0), 48000);
  assert.equal(result.nextIndex, 0);
  result = update(progress, at(140, 0), 56000);
  assert.equal(result.nextIndex, 1);
});

test('a checkpoint is not auto-passed if its approach was never observed', () => {
  const progress = createProgress(line);
  update(progress, at(0, 0), 0);
  update(progress, at(60, 0), 24000);
  // The wider accuracy corridor still allows a route match, but this
  // observation is outside the checkpoint's actual approach radius.
  let result = update(progress, at(120, 31), 48000, 25);
  assert.equal(result.nextIndex, 0);
  assert.equal(result.atCheckpoint, false);
  result = update(progress, at(160, 0), 64000);
  assert.equal(result.nextIndex, 0);
  assert.match(result.reason, /not observed on approach/);
  assert.equal(result.positionConfirmed, false);
});

test('bad accuracy, stale fixes, duplicate timestamps, and future fixes do not advance', () => {
  const progress = createProgress(line);
  update(progress, at(0, 0), 0);
  update(progress, at(20, 0), 8000);
  const before = progress.getSnapshot().along;
  assert.equal(update(progress, at(50, 0), 20000, 100).along, before);
  assert.equal(progress.update(fix(at(50, 0), 21000), time + 50000).along, before);
  assert.equal(progress.update(fix(at(50, 0), 90000), time + 50000).along, before);
  assert.equal(progress.update(fix(at(50, 0), 8000), time + 9000).along, before);
  assert.equal(progress.getSnapshot().nextIndex, 0);
});

test('a fast GPS jump or remote route section cannot skip progress', () => {
  const progress = createProgress(line);
  update(progress, at(0, 0), 0);
  let result = update(progress, at(60, 0), 1000);
  assert.equal(result.along, 0);
  assert.equal(result.positionConfirmed, false);
  result = update(progress, at(300, 0), 60000);
  assert.equal(result.along, 0);
  assert.equal(result.nextIndex, 0);
  assert.equal(result.positionConfirmed, false);
});

test('the outbound shared connector never matches its later return occurrence', () => {
  const progress = createProgress(lollipop);
  const result = walk(progress, lollipop, 0, 240);
  assert.ok(result.along < 250);
  assert.equal(result.nextIndex, 1);
  assert.equal(result.complete, false);
});

test('a complete lollipop walk resolves the return connector and all ordered checkpoints', () => {
  const progress = createProgress(lollipop);
  const total = routeLength(lollipop.coordinates);
  walk(progress, lollipop, 0, total);
  const result = update(progress, lollipop.coordinates.at(-1), total / 2.5 * 1000 + 5000);
  assert.equal(result.nextIndex, 3);
  assert.equal(result.complete, true);
  assert.ok(result.along > total - 15);
});

test('a full Four Ponds simulation handles both occurrences of the loop entry', () => {
  const area = JSON.parse(readFileSync(new URL('./data/area.json', import.meta.url), 'utf8'));
  const route = area.routes[0];
  const progress = createProgress(route);
  const total = routeLength(route.coordinates);
  let atFirstConnector;
  for (let d = 0; d <= total; d += 8) {
    const result = update(progress, pointAlong(route, d), d / 2.5 * 1000);
    if (d === 320) atFirstConnector = result;
  }
  const result = update(progress, route.coordinates.at(-1), total / 2.5 * 1000 + 5000);
  assert.equal(atFirstConnector.nextIndex, 1);
  assert.ok(atFirstConnector.along < 340);
  assert.equal(result.nextIndex, route.waypoints.length);
  assert.equal(result.complete, true);
  assert.ok(result.along > total - 15);
});

test('explicit demo seeking supports a return checkpoint without polluting reset', () => {
  const progress = createProgress(lollipop);
  const result = progress.seek(990);
  assert.equal(result.demoSeek, true);
  assert.equal(result.started, true);
  assert.equal(result.nextIndex, 2);
  assert.equal(result.along, 990);
  assert.equal(result.positionConfirmed, true);
  assert.equal(progress.reset().started, false);
  assert.equal(progress.getSnapshot().demoSeek, false);
  assert.equal(progress.getSnapshot().positionConfirmed, false);
  assert.equal(progress.getSnapshot().nextIndex, 0);
});

test('invalid checkpoint order and invalid demo seek are rejected', () => {
  assert.throws(() => createProgress({ ...line, waypoints: [
    { coordinate: at(200, 0), routeIndex: 2 },
    { coordinate: at(100, 0), routeIndex: 1 }
  ] }), TypeError);
  assert.throws(() => createProgress(line).seek(-1), TypeError);
  assert.throws(() => createProgress(line).seek(10000), TypeError);
});

test('rejected observations explicitly invalidate displayed checkpoint position', () => {
  for (const rejected of [
    { input: fix(at(20, 0), 8000, 100), now: time + 8000 },
    { input: fix(at(20, 0), 8000), now: time + 40000 },
    { input: fix(at(20, 0), 80000), now: time + 8000 },
    { input: fix(at(20, 0), 0), now: time + 8000 },
    { input: { ...fix(at(20, 0), 8000), longitude: NaN }, now: time + 8000 }
  ]) {
    const progress = createProgress(line);
    assert.equal(update(progress, at(0, 0), 0).positionConfirmed, true);
    const result = progress.update(rejected.input, rejected.now);
    assert.equal(result.positionConfirmed, false);
    assert.equal(result.along, 0);
  }
});
