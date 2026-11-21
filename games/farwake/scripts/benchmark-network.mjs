/**
 * Reproducible synthetic four-client authority/transport benchmark.
 * Run: node scripts/benchmark-network.mjs [--repeats=3] [--samples=120]
 *      [--baseline-ref=<commit-before-transport-changes>]
 * Reports bytes and local CPU work; it does not measure Internet RTT or FPS.
 * No live service, credentials, player records or production saves are used.
 */
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Realm } from '../server/realm.mjs';
import { SnapshotDeltaEncoder } from '../dist/snapshot-delta.mjs';
import { createCasualCrewRoster } from '../dist/casual-crew.mjs';

const option = (name, fallback) => Number(process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1]) || fallback;
const samples = Math.max(20, Math.min(1000, option('samples', 120))), repeats = Math.max(1, Math.min(9, option('repeats', 3))), warmup = 30;
const baselineRef = process.argv.find(value => value.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length) || null;
let legacySnapshot = Realm.prototype.snapshotFor, temporaryBaseline = null;
if (baselineRef) {
  // Import the prior projection beside the real module so its relative imports
  // remain valid. This temporary file is never committed and is removed below.
  const root = fileURLToPath(new URL('../', import.meta.url));
  const commit = execFileSync('git', ['rev-parse', '--verify', `${baselineRef}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: root, encoding: 'utf8' }).trim();
  const source = execFileSync('git', ['show', `${commit}:${prefix}server/realm.mjs`], { cwd: root, encoding: 'utf8' });
  temporaryBaseline = new URL(`../server/.benchmark-realm-${process.pid}-${Date.now()}.mjs`, import.meta.url);
  await writeFile(temporaryBaseline, source, { flag: 'wx' });
  try { legacySnapshot = (await import(temporaryBaseline.href)).Realm.prototype.snapshotFor; }
  catch (error) { await unlink(temporaryBaseline); throw error; }
}
const persistence = { kind: 'benchmark-memory', save: async (_id, version) => ({ version: version + 1 }) };
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 100) / 100;

async function scene(name) {
  const realm = new Realm({ id: 'BENCH001', seed: 'farwake-latency-benchmark', persistence }), captains = [];
  for (let index = 0; index < 4; index++) {
    const { captain } = await realm.createCaptain(`Benchmark ${index}`);
    realm.attach(captain, { send() {}, close() {} });
    if (name === 'Crosswind') {
      const vessel = realm.vessels.get(captain.ownedVesselId);
      vessel.systemId = 'crosswind'; captain.game.state.systemId = 'crosswind'; realm._bindCaptain(captain);
    }
    captains.push(captain);
  }
  if (name === 'Shared capital') {
    const owner = captains[0], vessel = realm.vessels.get(owner.ownedVesselId);
    owner.game.state.fleet.owned.push('judicator'); owner.game._activateClass('judicator', true);
    vessel.ship = owner.game.state.ship; vessel.actor = null;
    vessel.ship.casualCrew = createCasualCrewRoster(100, 'benchmark-watch'); vessel.allowCrew = true;
    realm._syncCasualCrew(vessel);
    for (const captain of captains) realm._cabin(captain, vessel);
  }
  return { realm, captains };
}

async function run(name) {
  const { realm, captains } = await scene(name), encoders = captains.map(() => new SnapshotDeltaEncoder());
  const totals = { legacy: { bytes: 0, snapshotMs: 0, encodeMs: 0 }, delta: { bytes: 0, snapshotMs: 0, encodeMs: 0 } };
  let tick = 0, wallTime = Date.now();
  for (let sample = -warmup; sample < samples; sample++) {
    for (let step = 0; step < 3; step++) realm.step(1 / 30, ++tick, wallTime += 1000 / 30);
    const compact = (sample + warmup) % 10 !== 0;
    // Alternate order to avoid systematically favoring the warm second pass.
    for (const mode of sample % 2 ? ['legacy', 'delta'] : ['delta', 'legacy']) {
      const worldViews = mode === 'delta' ? new Map() : null;
      const deltaViews = mode === 'delta' ? new WeakMap() : null;
      for (let index = 0; index < captains.length; index++) {
        let started = performance.now();
        const project = mode === 'legacy' ? legacySnapshot : Realm.prototype.snapshotFor;
        const packet = { type: 'snapshot', ...project.call(realm, captains[index], { compact, drainEvents: false, worldViews }) };
        const snapshotMs = performance.now() - started;
        started = performance.now();
        let data;
        if (mode === 'delta') {
          const prepared = encoders[index].prepare(packet, { reset: (sample + warmup) % 50 === 0, shared: deltaViews });
          encoders[index].commit(prepared); data = prepared.data;
        } else data = JSON.stringify(packet);
        const encodeMs = performance.now() - started;
        if (sample >= 0) { totals[mode].snapshotMs += snapshotMs; totals[mode].encodeMs += encodeMs; totals[mode].bytes += Buffer.byteLength(data); }
      }
    }
  }
  const seconds = samples / 10;
  return Object.fromEntries(Object.entries(totals).map(([mode, value]) => [mode, {
    bytesPerSecond: value.bytes / seconds, snapshotMsPerSecond: value.snapshotMs / seconds,
    encodeMsPerSecond: value.encodeMs / seconds, totalMsPerSecond: (value.snapshotMs + value.encodeMs) / seconds
  }]));
}

try {
  console.log(JSON.stringify({ note: 'Synthetic four-client scenes. Medians of warmed repeats; 30Hz simulation,10Hz packets,1Hz full metadata,5s delta baseline reset. Legacy snapshots have no broadcast cache; delta snapshots share a per-broadcast public-world cache. With --baseline-ref, the prior snapshot projection runs against the same simulated state; other simulation helpers use the current checkout. Local processing only, excluding sockets, durability gateway, client rendering and Internet latency.', baselineRef, repeats, samplesPerRepeat: samples, node: process.version }));
  for (const name of ['Hearth', 'Crosswind', 'Shared capital']) {
    const results = [];
    for (let repeat = 0; repeat < repeats; repeat++) results.push(await run(name));
    const summaries = Object.fromEntries(['legacy', 'delta'].map(mode => [mode, Object.fromEntries(Object.keys(results[0][mode]).map(key => [key, round(median(results.map(result => result[mode][key])))]))]));
    console.log(JSON.stringify({ scene: name, ...summaries, bytesReductionPercent: round(100 * (1 - summaries.delta.bytesPerSecond / summaries.legacy.bytesPerSecond)), processingChangePercent: round(100 * (summaries.delta.totalMsPerSecond / summaries.legacy.totalMsPerSecond - 1)) }));
  }
} finally { if (temporaryBaseline) await unlink(temporaryBaseline); }
