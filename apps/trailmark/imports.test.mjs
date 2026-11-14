import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoordinates, parseRouteJson, exportTrackGpx, IMPORT_LIMITS } from './imports.mjs';

const line = [[-70.594, 41.692], [-70.593, 41.6925], [-70.592, 41.693]];

test('coordinate validation preserves correct order, copies data, and drops consecutive duplicate points', () => {
  const input = [line[0], line[0], [...line[1], 15]];
  const clean = validateCoordinates(input);
  assert.deepEqual(clean, [line[0], line[1]]);
  assert.notEqual(clean[0], input[0]);
  assert.equal(input.length, 3);
});

test('invalid and empty numeric positions cannot become a misleading route at zero', () => {
  for (const bad of [[null, 41], ['-70', 41], [Infinity, 41], [NaN, 41], [181, 41], [-70, 91], [-70, 41, null]]) {
    assert.throws(() => validateCoordinates([line[0], bad]), /valid longitude/);
  }
  assert.throws(() => validateCoordinates([line[0], line[0]]), /two different/);
  assert.throws(() => validateCoordinates([line[0]]), /two different/);
});

test('route imports reject missing geometry, too many points, and shortcuts across long gaps', () => {
  assert.throws(() => validateCoordinates([...line, [-71, 42]]), /gap of more than 2 km/);
  assert.throws(() => validateCoordinates(Array(IMPORT_LIMITS.maxPoints + 1).fill(line[0])), /too many points/);
  assert.throws(() => parseRouteJson('{"name":"no route"}'), /two different/);
  assert.throws(() => parseRouteJson('null'), /one route object/);
});

test('input metadata cannot make imported geometry field-verified or provide executable markup', () => {
  const route = parseRouteJson(JSON.stringify({ name: '<img src=x onerror=alert(1)> Hike', coordinates: line, validation: 'field-verified', source: { url: 'javascript:alert(1)' }, waypoints: [{verified: true}] }));
  assert.equal(route.name, 'Hike');
  assert.equal(route.validation, 'imported');
  assert.deepEqual(route.source, {title: 'Your JSON file', url: null});
  assert.deepEqual(route.waypoints, []);
  assert.match(route.notice, /not been checked/);
});

test('single GeoJSON LineString is supported, collections and disjoint geometry are rejected', () => {
  const route = parseRouteJson(JSON.stringify({type: 'Feature', properties: {name: 'A walk'}, geometry: {type: 'LineString', coordinates: line}}));
  assert.equal(route.name, 'A walk');
  assert.deepEqual(route.coordinates, line);
  assert.throws(() => parseRouteJson(JSON.stringify({type: 'Feature', geometry: {type: 'MultiLineString', coordinates: [line, line]}})), /single LineString/);
  assert.throws(() => parseRouteJson(JSON.stringify({type: 'FeatureCollection', features: []})), /Collections/);
});

test('import IDs are stable, file-size checks account for multibyte text, and malformed JSON fails', () => {
  const input = JSON.stringify({name: 'Walk', coordinates: line});
  assert.equal(parseRouteJson(input).id, parseRouteJson(input).id);
  assert.notEqual(parseRouteJson(input).id, parseRouteJson(input, {name: 'Another walk'}).id);
  assert.throws(() => parseRouteJson('x'.repeat(IMPORT_LIMITS.maxBytes + 1)), /too large/);
  assert.throws(() => parseRouteJson('あ'.repeat(Math.ceil(IMPORT_LIMITS.maxBytes / 3) + 1)), /too large/);
  assert.throws(() => parseRouteJson('{'), /not valid JSON/);
});

test('GPX export escapes metadata and records precise timestamps and coordinate order', () => {
  const xml = exportTrackGpx([{longitude: -70.594, latitude: 41.692, timestamp: 1700000000000}], 'Chris & friends');
  assert.match(xml, /Chris &amp; friends/);
  assert.match(xml, /lat="41.692" lon="-70.594"/);
  assert.match(xml, /2023-11-14T22:13:20.000Z/);
  assert.throws(() => exportTrackGpx([]), /no recorded/);
  assert.throws(() => exportTrackGpx([{longitude: 'bad', latitude: 41}]), /invalid/);
  assert.throws(() => exportTrackGpx([{coordinate: line[0], timestamp: 'not a date'}]), /invalid time/);
});

test('GPX export preserves gaps and explicit segment breaks instead of drawing false connectors', () => {
  const t = 1700000000000;
  const xml = exportTrackGpx([
    {coordinate: line[0], timestamp: t},
    {coordinate: line[1], timestamp: t + 1000},
    {coordinate: line[2], timestamp: t + 120000},
    {coordinate: line[1], timestamp: t + 121000, breakBefore: true},
  ]);
  assert.equal((xml.match(/<trkseg>/g) || []).length, 3);
});
