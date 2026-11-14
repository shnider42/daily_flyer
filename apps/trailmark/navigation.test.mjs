import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitor, distanceMeters, nearestOnRoute, routeLength } from './navigation.mjs';

const origin = [-70.604, 41.719];
const latitudeMeter = 1 / 111195.08;
const longitudeMeter = latitudeMeter / Math.cos(origin[1] * Math.PI / 180);
const at = (east, north) => [origin[0] + east * longitudeMeter, origin[1] + north * latitudeMeter];
const coordinates = [at(0, 0), at(200, 0), at(400, 0)];
const start = 1000000;
function fix(east, north, elapsed = 0, accuracy = 8) {
  const [longitude, latitude] = at(east, north);
  return { longitude, latitude, accuracy, timestamp: start + elapsed };
}
const monitor = config => createMonitor({ coordinates, ...config });
const send = (m, east, north, elapsed = 0, accuracy = 8) => m.update(fix(east, north, elapsed, accuracy), start + elapsed);
const approx = (actual, expected, tolerance = 0.2) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

test('distance and projection use meters and GeoJSON coordinate order', () => {
  approx(distanceMeters(at(0, 0), at(0, 100)), 100);
  approx(routeLength(coordinates), 400);
  const result = nearestOnRoute(at(125, 40), coordinates);
  approx(result.distance, 40);
  approx(result.along, 125);
  approx(result.total, 400);
  assert.equal(result.index, 0);
  approx(distanceMeters(result.coordinate, at(125, 0)), 0);
});

test('projection clamps to endpoints and handles duplicate points', () => {
  const path = [at(0, 0), at(0, 0), at(200, 0)];
  const result = nearestOnRoute(at(-30, 40), path);
  approx(result.distance, 50);
  assert.equal(result.along, 0);
  approx(result.total, 200);
});

test('short segments crossing the dateline do not become world-spanning', () => {
  const result = nearestOnRoute([180, 0.001], [[179.999, 0], [-179.999, 0]]);
  approx(result.distance, 111.195, 0.02);
  approx(result.total, 222.39, 0.02);
  approx(result.along, 111.195, 0.02);
});

test('malformed and degenerate route data are rejected', () => {
  assert.throws(() => distanceMeters([NaN, 0], [0, 0]), TypeError);
  assert.throws(() => nearestOnRoute([0, 0], [[0, 0]]), TypeError);
  assert.throws(() => createMonitor({ coordinates: [[0, 0], [0, 0]] }), TypeError);
  assert.throws(() => createMonitor({ mapUncertaintyM: -1 }), TypeError);
});

test('an accurate near-route fix is proximity, and poor accuracy is never green', () => {
  const m = monitor();
  assert.equal(send(m, 50, 5).state, 'on-route');
  const weak = send(m, 50, 5, 5000, 100);
  assert.equal(weak.state, 'uncertain');
  assert.equal(weak.distance, null);
  assert.equal(weak.lastAssessment, 'on-route');
  assert.equal(weak.rejectedReason, 'poor-accuracy');
});

test('a single GPS spike does not create an off-route warning', () => {
  const m = monitor();
  send(m, 50, 0);
  const spike = send(m, 50, 200, 1000);
  assert.equal(spike.state, 'uncertain');
  assert.equal(spike.rejectedReason, 'position-jump');
  assert.equal(spike.candidateSamples, 0);
  const back = send(m, 52, 1, 2000);
  assert.equal(back.state, 'on-route');
  assert.equal(back.alert, null);
});

test('two agreeing distant fixes resolve a jump but do not bypass confirmation', () => {
  const m = monitor();
  send(m, 50, 0);
  assert.equal(send(m, 50, 200, 1000).rejectedReason, 'position-jump');
  const agreeing = send(m, 51, 201, 6000);
  assert.equal(agreeing.state, 'checking');
  assert.equal(agreeing.candidateSamples, 1);
  assert.equal(agreeing.alert, null);
});

test('off-route needs both three distinct samples and twelve elapsed seconds', () => {
  const m = monitor();
  assert.equal(send(m, 50, 80, 0).state, 'checking');
  assert.equal(send(m, 51, 80, 1000).state, 'checking');
  assert.equal(send(m, 52, 80, 2000).state, 'checking');
  assert.equal(send(m, 53, 80, 7000).state, 'checking');
  const result = send(m, 54, 80, 12000);
  assert.equal(result.state, 'off-route');
  assert.equal(result.alert, 'off-route');
  assert.equal(send(m, 55, 80, 18000).alert, null);
});

test('two samples even twelve seconds apart cannot confirm a departure', () => {
  const m = monitor({ maxSampleGapMs: 20000 });
  send(m, 50, 80, 0);
  assert.equal(send(m, 51, 80, 12000).state, 'checking');
});

test('duplicate, out-of-order, stale, and future fixes do not count as evidence', () => {
  const m = monitor();
  send(m, 50, 80, 0);
  let result = m.update(fix(50, 80, 0), start + 6000);
  assert.equal(result.rejectedReason, 'duplicate-fix');
  assert.equal(result.candidateSamples, 1);
  result = m.update(fix(50, 80, -1000), start + 6000);
  assert.equal(result.rejectedReason, 'out-of-order-fix');
  result = m.update(fix(50, 80, 100000), start + 6000);
  assert.equal(result.rejectedReason, 'future-fix');
  assert.equal(result.candidateSamples, 1);
  result = m.update(fix(50, 80, 1000), start + 20000);
  assert.equal(result.rejectedReason, 'stale-fix');
  assert.equal(result.state, 'stale');
  assert.equal(result.candidateSamples, 0);
});

test('confirmation restarts after a sampling gap or inaccurate fix', () => {
  const m = monitor();
  send(m, 50, 80, 0);
  send(m, 51, 80, 6000);
  let result = send(m, 52, 80, 17000);
  assert.equal(result.candidateSamples, 1);
  send(m, 53, 80, 20000, 80);
  result = send(m, 54, 80, 23000);
  assert.equal(result.candidateSamples, 1);
  assert.equal(result.state, 'checking');
});

test('map and position uncertainty widen the warning threshold', () => {
  const m = monitor({ mapUncertaintyM: 35 });
  let result = send(m, 50, 70, 0, 25);
  assert.equal(result.offThreshold, 80);
  assert.equal(result.state, 'uncertain');
  assert.equal(result.candidateSamples, 0);
  result = send(m, 51, 90, 6000, 25);
  assert.equal(result.state, 'checking');
});

test('poor accuracy preserves a previous off-route assessment without false recovery', () => {
  const m = monitor();
  send(m, 50, 80, 0);
  send(m, 51, 80, 6000);
  assert.equal(send(m, 52, 80, 12000).state, 'off-route');
  const weak = send(m, 52, 0, 18000, 100);
  assert.equal(weak.state, 'uncertain');
  assert.equal(weak.lastAssessment, 'off-route');
  assert.equal(weak.alert, null);
});

test('return to the route requires narrower hysteresis and two fixes over five seconds', () => {
  const m = monitor();
  send(m, 50, 80, 0);
  send(m, 51, 80, 6000);
  send(m, 52, 80, 12000);
  // Returning at walking speed avoids invoking the separate jump filter.
  assert.equal(send(m, 53, 40, 22000).state, 'off-route');
  assert.equal(send(m, 54, 10, 32000).state, 'checking');
  assert.equal(send(m, 55, 8, 35000).state, 'checking');
  const returned = send(m, 56, 7, 37000);
  assert.equal(returned.state, 'on-route');
  assert.equal(returned.alert, 'returned');
  assert.equal(send(m, 57, 6, 42000).alert, null);
});

test('stale timer removes reassuring route status without waiting for another callback', () => {
  const m = monitor();
  send(m, 50, 0, 0);
  const result = m.tick(start + 15001);
  assert.equal(result.state, 'stale');
  assert.equal(result.distance, null);
  assert.equal(result.lastAssessment, 'on-route');
});

test('pause and resume require new evidence and never count hidden time', () => {
  const m = monitor();
  send(m, 50, 80, 0);
  send(m, 51, 80, 6000);
  assert.equal(m.pause(start + 7000).state, 'paused');
  assert.equal(send(m, 52, 80, 20000).state, 'paused');
  assert.equal(m.resume(start + 30000).state, 'acquiring');
  assert.equal(m.update(fix(52, 80, 20000), start + 30000).rejectedReason, 'stale-fix');
  const result = send(m, 52, 80, 30000);
  assert.equal(result.state, 'checking');
  assert.equal(result.candidateSamples, 1);
  assert.equal(result.alert, null);
});

test('changing routes discards previous assessments and protects copied geometry', () => {
  const m = monitor();
  send(m, 50, 0);
  const replacement = [at(0, 100), at(400, 100)];
  assert.equal(m.setRoute(replacement).state, 'idle');
  replacement[0][1] = 0;
  const result = send(m, 50, 100);
  assert.equal(result.state, 'on-route');
  assert.equal(result.lastAssessment, 'on-route');
  assert.equal(m.setRoute(null).total, 0);
  assert.equal(send(m, 50, 100).rejectedReason, 'no-route');
});

test('invalid position updates cannot leave a green current status', () => {
  const m = monitor();
  send(m, 50, 0);
  const result = m.update({ ...fix(50, 0, 5000), accuracy: NaN }, start + 5000);
  assert.equal(result.state, 'uncertain');
  assert.equal(result.rejectedReason, 'invalid-fix');
  assert.equal(result.lastAssessment, 'on-route');
});
