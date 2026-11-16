// A bounded, local-only window of actual presentation intervals. No telemetry.
export class FrameStats {
  constructor(size = 180) {
    this.intervals = new Float32Array(size);
    this.work = new Float32Array(size);
    this.reset();
  }

  reset() { this.count = 0; this.index = 0; }

  record(intervalMs, workMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(workMs)) return;
    this.intervals[this.index] = intervalMs;
    this.work[this.index] = Math.max(0, workMs);
    this.index = (this.index + 1) % this.intervals.length;
    this.count = Math.min(this.count + 1, this.intervals.length);
  }

  summary() {
    if (!this.count) return null;
    let elapsed = 0, work = 0, worst = 0, slow = 0;
    for (let i = 0; i < this.count; i++) {
      const ms = this.intervals[i];
      elapsed += ms; work += this.work[i]; worst = Math.max(worst, ms);
      if (ms > 50) slow++;
    }
    return { frames: this.count, fps: this.count * 1000 / elapsed,
      averageMs: elapsed / this.count, workMs: work / this.count, worstMs: worst, slowFrames: slow };
  }
}
