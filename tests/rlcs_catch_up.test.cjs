const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validDay, relativeDay, normalize, selectStories, safeURL} = require('../static/rlcs_catch_up/app.js');
const data = require('../daily_flyer_v2/data/rlcs_catch_up.json');
const choose = raw => selectStories(data.stories, normalize(raw, '2026-10-26')).map(s => s.id);

test('custom date includes that day; watched-event checkpoint starts afterward', () => {
  assert(choose({since: '2025-09-14', mode: 'custom'}).includes('nrg-2025'));
  assert(!choose({since: '2025-09-14', mode: 'event', exclusive: true}).includes('nrg-2025'));
  assert(choose({since: '2025-09-14', mode: 'event', exclusive: true}).includes('worlds-2026'));
});

test('depth changes explanations without changing eligible stories', () => {
  const filter = {since: '2021-01-01', region: 'EU', q: 'vitality'};
  assert.deepEqual(choose({...filter, depth: 'overview'}), choose({...filter, depth: 'detailed'}));
  assert(choose(filter).includes('vitality-2023'));
  assert(!choose(filter).includes('nrg-madrid'));
  assert(choose({region: 'SSA'}).includes('open-circuit'));
});

test('sorting, recent gaps, and era intersections are real filters', () => {
  assert.equal(choose({order: 'oldest'})[0], 'cloud9-worlds');
  assert.equal(choose({order: 'newest'})[0], 'club-championship');
  assert.deepEqual(choose({since: '2026-10-01'}), []);
  assert.deepEqual(choose({since: '2025-01-01', era: '2018–2019'}), []);
});

test('malformed saved choices cannot break date selection', () => {
  for (const raw of [null, [], 'invalid', false]) assert.equal(normalize(raw).mode, 'all');
  assert(!validDay('2025-02-29'));
  assert(!validDay('2026-13-01'));
  assert(validDay('2024-02-29'));
  assert.equal(normalize({since: '2999-01-01'}).since, '');
  assert.equal(normalize({q: 'a'.repeat(200)}).q.length, 80);
  assert.equal(normalize({region: 'unknown', depth: 'unknown'}).depth, 'refresher');
});

test('relative dates clamp month ends and leap years', () => {
  assert.equal(relativeDay('month', new Date(2026, 2, 31, 12)), '2026-02-28');
  assert.equal(relativeDay('year', new Date(2024, 1, 29, 12)), '2023-02-28');
});

test('source URLs accept only the reviewed HTTPS publishers', () => {
  assert.equal(safeURL('javascript:alert(1)'), '');
  assert.equal(safeURL('https://blast.tv.evil.example/'), '');
  assert.equal(safeURL('https://user:pass@blast.tv/'), '');
  assert.equal(safeURL('http://blast.tv/'), '');
  for (const source of data.sources) assert.equal(safeURL(source.url), source.url);
});
