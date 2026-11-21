import { performance } from 'node:perf_hooks';

const rounded = value => Math.round(value * 100) / 100;
const distribution = values => {
  if (!values.length) return { mean: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    p95: rounded(sorted[Math.ceil(sorted.length * .95) - 1]), max: rounded(sorted.at(-1)) };
};

/** Bounded process-wide timings. Never records captains, realms, inputs, or saves. */
export class AuthorityPerformance {
  constructor({ now = () => performance.now(), windowMs = 10000, capacity = 2400 } = {}) {
    this.now = now; this.windowMs = windowMs; this.capacity = capacity; this.startedAt = now();
    this.ticks = []; this.snapshots = []; this.skips = []; this.scheduleDelays = [];
  }
  _record(list, value) {
    const at = this.now(); list.push({ at, ...value });
    while (list.length > this.capacity || list[0]?.at < at - this.windowMs) list.shift();
  }
  tick(durationMs) { this._record(this.ticks, { durationMs }); }
  snapshot(bytes, durationMs) { this._record(this.snapshots, { bytes, durationMs }); }
  skip() { this._record(this.skips, {}); }
  schedule(delayMs) { this._record(this.scheduleDelays, { durationMs: Math.max(0, delayMs) }); }
  summary() {
    const at = this.now(), current = list => list.filter(sample => sample.at >= at - this.windowMs);
    const ticks = current(this.ticks), snapshots = current(this.snapshots), skips = current(this.skips);
    const seconds = Math.max(.001, Math.min(this.windowMs, at - this.startedAt) / 1000);
    const tickSpan = ticks.length > 1 ? ticks.at(-1).at - ticks[0].at : 0;
    return {
      windowSeconds: rounded(seconds),
      simulationHz: tickSpan > 0 ? rounded((ticks.length - 1) * 1000 / tickSpan) : 0,
      tickMs: distribution(ticks.map(sample => sample.durationMs)),
      snapshotMs: distribution(snapshots.map(sample => sample.durationMs)),
      scheduleDelayMs: distribution(current(this.scheduleDelays).map(sample => sample.durationMs)),
      snapshotBytesPerSecond: Math.round(snapshots.reduce((sum, sample) => sum + sample.bytes, 0) / seconds),
      snapshotsSent: snapshots.length,
      congestedSnapshotsSkipped: skips.length,
    };
  }
}
