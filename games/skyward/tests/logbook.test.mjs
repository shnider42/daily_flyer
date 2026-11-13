import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT } from '../public/campaign.mjs';
import { OPERATIONS } from '../public/operations.mjs';
import {
  LOGBOOK_KEY, LOGBOOK_LIMIT, RECORD_LIMIT, SEEN_RUN_LIMIT, createLogbook,
  normalizeLogbook, loadLogbook, saveLogbook, medalAssessment,
  buildSortieReport, recordSortie, operationRecord,
} from '../public/logbook.mjs';

const mission = () => structuredClone(OPERATIONS[0]);
const settings = { assist: 'assisted', autoLevel: true };
function simulation(overrides = {}) {
  const m = mission();
  return { mission: m, settings, player: { aircraft: m.aircraft, health: AIRCRAFT[m.aircraft].health, payload: 'conventional' },
    status: 'success', time: 250, score: 800,
    sortieStats: { airTime: 225, distance: 21000, damageTaken: 0, landings: 1, airKills: 0, groundKills: 0, gatesReached: 8,
      lastLanding: { sinkRate: -2.6, speed: 67, runwayIndex: 0, quality: 'smooth' } }, ...overrides };
}
function report(id = 'flight-1', overrides = {}, options = {}) {
  return buildSortieReport(simulation(overrides), { runId: id, endedAt: 1000, ...options });
}
function memoryStorage(entries = []) {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('operation medals require successful recovery and both authored time and health thresholds', () => {
  const medals = { gold: { time: 300, health: 85 }, silver: { time: 500, health: 55 } };
  const grade = (duration, health, extra = {}) => medalAssessment({ outcome: 'success', duration, health, medals, ...extra });
  assert.equal(grade(300, 85).medal, 'gold');
  assert.equal(grade(300.001, 85).medal, 'silver');
  assert.equal(grade(280, 84.99).medal, 'silver');
  assert.equal(grade(500, 55).medal, 'silver');
  assert.equal(grade(501, 100).medal, 'bronze');
  assert.equal(grade(100, 54.99).medal, 'bronze');
  assert.deepEqual(grade(501, 100).target, { medal: 'silver', time: 500, health: 55 });
  assert.deepEqual(grade(400, 100).target, { medal: 'gold', time: 300, health: 85 });
  assert.equal(grade(250, 100).target, null);
  for (const outcome of ['failed', 'ended']) assert.deepEqual(grade(100, 100, { outcome }), { medal: null, target: null, eligible: false });
  assert.equal(grade(100, 100, { recordEligible: false }).medal, null);
  assert.equal(grade(100, Infinity).medal, 'bronze', 'invalid health cannot earn a higher grade');
  assert.equal(medalAssessment({ outcome: 'success', duration: 90, health: 99 }).medal, 'bronze');
});

test('reports snapshot measured flight statistics, use percent health, and exclude shared flights', () => {
  const sim = simulation();
  sim.player.health *= .75;
  const result = buildSortieReport(sim, { runId: 'same-launch', endedAt: 14000 });
  assert.equal(result.health, 75);
  assert.equal(result.aircraftName, AIRCRAFT[sim.player.aircraft].name);
  assert.equal(result.stats.lastLanding.sinkRate, 2.6);
  assert.equal(result.medal, 'silver');
  assert.equal(result.outcome, 'success');
  assert.equal(result.recordReason, '');
  sim.sortieStats.distance = 99999; sim.mission.operation.medals.gold.time = 1;
  assert.equal(result.stats.distance, 21000);
  assert.equal(result.medalRules.gold.time, OPERATIONS[0].operation.medals.gold.time);
  assert.equal(buildSortieReport({ ...sim, multiplayer: { mode: 'squadron' } }, { runId: 'team' }), null);
  assert.equal(buildSortieReport({ ...sim, crew: {} }, { runId: 'crew' }), null);
  assert.equal(buildSortieReport(sim), null);
  assert.equal(report('ended', { status: 'flying' }).outcome, 'ended');
  assert.equal(report('override', {}, { outcome: 'ended' }).medal, null);
});

test('refreshing or saving the same debrief cannot add a second flight or inflate lifetime totals', () => {
  const original = createLogbook(), first = report();
  const recorded = recordSortie(original, first);
  assert.equal(recorded.added, true); assert.equal(recorded.newBest, true);
  assert.equal(original.flights.length, 0, 'recording does not mutate the caller log');
  const storage = memoryStorage();
  assert.equal(saveLogbook(recorded.logbook, storage), true);
  const loaded = loadLogbook(storage);
  const again = recordSortie(loaded, report('flight-1', { time: 12 }));
  assert.equal(again.added, false); assert.equal(again.newBest, false);
  assert.equal(again.logbook.totals.sorties, 1); assert.equal(again.logbook.totals.completed, 1);
  assert.equal(again.logbook.totals.airTime, 225); assert.equal(again.logbook.flights[0].duration, 250);
  assert.equal(again.logbook.aircraft[first.aircraft].landings, 1);
});

test('best records prefer a better medal, then faster time, then remaining airframe health', () => {
  let book = createLogbook();
  const record = (id, time, health) => {
    const sim = simulation({ time }); sim.player.health *= health / 100;
    const result = recordSortie(book, buildSortieReport(sim, { runId: id, endedAt: Number(id.slice(1)) * 1000 }));
    book = result.logbook; return result;
  };
  assert.equal(record('r1', 200, 60).newBest, true);
  assert.equal(record('r2', 280, 90).newBest, true, 'a recovered gold run beats a faster damaged silver run');
  assert.equal(record('r3', 270, 86).newBest, true);
  assert.equal(record('r4', 270, 88).newBest, true);
  assert.equal(record('r5', 270, 87).newBest, false);
  assert.equal(record('r6', 290, 100).newBest, false);
  const failed = recordSortie(book, report('failed', { status: 'failed', time: 10 }));
  book = failed.logbook;
  assert.equal(failed.newBest, false); assert.equal(failed.report.medal, null);
  assert.equal(operationRecord(book, mission(), settings).id, 'r4');
  assert.equal(book.records.length, 1); assert.equal(book.totals.sorties, 7); assert.equal(book.totals.failed, 1);
});

test('handling, aircraft, weather, payload and authored rule changes never share a best record', () => {
  const saved = recordSortie(createLogbook(), report()).logbook;
  const base = mission();
  assert.ok(operationRecord(saved, base, settings));
  assert.equal(operationRecord(saved, base, { ...settings, assist: 'expert' }), null);
  assert.equal(operationRecord(saved, base, { ...settings, autoLevel: false }), null);
  for (const changed of [
    { ...base, aircraft: 'f15' },
    { ...base, weather: { ...base.weather, wind: { x: 9, z: 0 } } },
    { ...base, weatherPreset: 'storm' },
    { ...base, payload: 'tsar' },
    { ...base, operation: { ...base.operation, version: 2 } },
    { ...base, operation: { ...base.operation, medals: { gold: { time: 100, health: 95 } } } },
  ]) assert.equal(operationRecord(saved, changed, settings), null);
  const sameWeatherReordered = { ...base, weather: { timeOfDay: base.weather.timeOfDay, fog: base.weather.fog, cloudTop: base.weather.cloudTop, cloudBase: base.weather.cloudBase, wind: { z: 0, x: 2 } } };
  assert.ok(operationRecord(saved, sameWeatherReordered, settings), 'property insertion order cannot split equivalent weather');
});

test('changed handling keeps a useful flight log but cannot earn medals or replace a record', () => {
  const result = report('changed', { time: 30 }, { recordEligible: false });
  assert.equal(result.recordEligible, false); assert.equal(result.recordReason, 'Handling changed during flight');
  assert.equal(result.medal, null); assert.equal(result.medalTarget, null);
  const saved = recordSortie(createLogbook(), result);
  assert.equal(saved.added, true); assert.equal(saved.newBest, false);
  assert.equal(saved.logbook.totals.completed, 1); assert.equal(saved.logbook.records.length, 0);
  assert.equal(loadLogbook(memoryStorage([[LOGBOOK_KEY, JSON.stringify(saved.logbook)]])).flights[0].recordEligible, false);
});

test('recent flights and run identities stay bounded while lifetime counts and best flights survive', () => {
  let book = createLogbook();
  for (let i = 0; i < 150; i++) book = recordSortie(book, report('run-' + i, { time: 250 + i }, { endedAt: i + 1 })).logbook;
  assert.equal(book.flights.length, LOGBOOK_LIMIT); assert.equal(book.seenIds.length, SEEN_RUN_LIMIT);
  assert.ok(book.records.length <= RECORD_LIMIT); assert.equal(book.records[0].id, 'run-0');
  assert.equal(book.flights[0].id, 'run-149'); assert.equal(book.flights.at(-1).id, 'run-126');
  assert.equal(book.totals.sorties, 150); assert.equal(book.totals.completed, 150);
  assert.equal(book.totals.airTime, 225 * 150); assert.equal(book.aircraft.f16.landings, 150);
  const storage = memoryStorage(); assert.equal(saveLogbook(book, storage), true);
  const restored = loadLogbook(storage);
  assert.deepEqual(restored.totals, book.totals); assert.equal(restored.records[0].id, 'run-0');
  assert.equal(recordSortie(restored, report('run-149')).added, false);
  assert.equal(recordSortie(restored, report('run-0')).added, false, 'a retained best flight stays deduplicated beyond the recent run window');
});

test('unavailable storage and corrupt files recover without touching existing campaign progress', () => {
  for (const raw of [null, '{', 'null', '[]', '42', '"flight"', '{"version":99}', 'x'.repeat(400001)]) {
    assert.deepEqual(loadLogbook({ getItem: () => raw }), createLogbook());
  }
  const broken = { getItem() { throw Error('Denied'); }, setItem() { throw Error('Quota'); } };
  assert.deepEqual(loadLogbook(broken), createLogbook());
  const inMemory = recordSortie(createLogbook(), report()).logbook;
  assert.equal(saveLogbook(inMemory, broken), false); assert.equal(inMemory.totals.sorties, 1);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('Blocked getter'); } });
  try { assert.deepEqual(loadLogbook(), createLogbook()); assert.equal(saveLogbook(inMemory), false); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
  const campaign = JSON.stringify({ completed: { training: { score: 50 } }, totalTime: 74 });
  const storage = memoryStorage([['dfe.skyward.logbook.v1', campaign]]);
  assert.deepEqual(loadLogbook(storage), createLogbook());
  assert.equal(saveLogbook(inMemory, storage), true);
  assert.equal(storage.values.get('dfe.skyward.logbook.v1'), campaign);
});

test('normalization repairs missing aggregates and discards invalid or duplicate flights', () => {
  const valid = report();
  const raw = { flights: [valid, { ...valid }, { ...valid, id: 'unknown-aircraft', aircraft: '__proto__' }, { ...valid, id: '', duration: -4 }],
    totals: { sorties: -5, airTime: Infinity }, aircraft: { unknown: { sorties: 20 } } };
  const normalized = normalizeLogbook(raw);
  assert.equal(normalized.flights.length, 1); assert.equal(normalized.totals.sorties, 1);
  assert.equal(normalized.totals.airTime, 225); assert.equal(normalized.aircraft.f16.sorties, 1);
  assert.equal(Object.hasOwn(normalized.aircraft, 'unknown'), false);
  assert.equal(normalized.records.length, 1, 'recent completed flights reconstruct missing record indexes');
  const malformed = recordSortie(createLogbook(), { ...valid, title: 'x'.repeat(10000), duration: 100, score: Infinity,
    stats: { airTime: 300, distance: -1, damageTaken: NaN, landings: 4.5, lastLanding: { sinkRate: Infinity, speed: 40 } } }).report;
  assert.equal(malformed.title.length, 120); assert.equal(malformed.stats.airTime, 100);
  assert.equal(malformed.stats.distance, 0); assert.equal(malformed.stats.damageTaken, 0);
  assert.equal(malformed.stats.landings, 4); assert.equal(malformed.stats.lastLanding, null); assert.equal(malformed.score, 0);
  assert.equal(recordSortie(createLogbook(), { ...valid, outcome: 'victory' }).added, false);
});

test('campaign and ended free flights add flight time without operation medals or records', () => {
  const campaign = simulation(); delete campaign.mission.operation;
  campaign.mission.id = 'training'; campaign.mission.title = 'First Light';
  const first = buildSortieReport(campaign, { runId: 'campaign', endedAt: 1000 });
  assert.equal(first.operationId, null); assert.equal(first.medal, null);
  let book = recordSortie(createLogbook(), first).logbook;
  const free = simulation({ mission: { ...campaign.mission, id: 'free', kind: 'free', title: 'Free flight' }, status: 'flying', time: 90 });
  const second = buildSortieReport(free, { runId: 'free', endedAt: 2000 });
  book = recordSortie(book, second).logbook;
  assert.equal(second.outcome, 'ended'); assert.equal(second.medal, null); assert.equal(second.stats.airTime, 90);
  assert.equal(book.totals.sorties, 2); assert.equal(book.totals.completed, 1); assert.equal(book.totals.ended, 1);
  assert.equal(book.totals.airTime, 315); assert.equal(book.records.length, 0);
});
