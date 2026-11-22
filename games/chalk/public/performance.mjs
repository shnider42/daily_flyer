const FRAME_LIMITS = new Set([0, 15, 30, 60, 120]);
const SAMPLE_LIMIT = 120;
const DISCONTINUITY_MS = 1000;

export class FramePacer {
  constructor() { this.reset(); }

  reset() {
    this.lastFrame = null;
    this.deadline = null;
    this.limit = null;
  }

  // Timestamps are milliseconds; accepted simulation deltas are seconds.
  // Advancing a deadline retains fractional time across skipped RAF callbacks.
  next(now, limit = 60) {
    if (!Number.isFinite(now)) return null;
    limit = FRAME_LIMITS.has(limit) ? limit : 60;
    const interval = limit ? 1000 / limit : 0;
    if (this.lastFrame === null || now < this.lastFrame) {
      this.lastFrame = now;
      this.deadline = now + interval;
      this.limit = limit;
      return 0;
    }
    if (limit !== this.limit) {
      this.limit = limit;
      this.deadline = this.lastFrame + interval;
    }
    if (now === this.lastFrame) return null;
    // RAF timestamps can land just before a 60/120 Hz boundary. A small
    // tolerance avoids unnecessarily dropping an entire refresh in that case.
    const tolerance = Math.min(1, interval * .12);
    if (interval && now + tolerance < this.deadline) return null;
    const elapsed = Math.min(.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (interval) {
      const periods = Math.max(1, Math.floor((now + tolerance - this.deadline) / interval) + 1);
      this.deadline += periods * interval;
    } else this.deadline = now;
    return elapsed;
  }
}

export class FrameMeter {
  constructor() { this.reset(); }

  reset() {
    this.lastFrame = null;
    this.frames = [];
    this.work = [];
    this.cursor = 0;
  }

  // Call once per rendered frame, even when FPS display is hidden. Work is
  // measured separately so a frame cap does not look like slow renderer work.
  record(now, workMS) {
    if (!Number.isFinite(now)) return;
    if (this.lastFrame === null) { this.lastFrame = now; return; }
    const elapsed = now - this.lastFrame;
    if (elapsed === 0) return;
    this.lastFrame = now;
    // Paused/background tabs start a fresh window; sub-second stalls count.
    if (elapsed < 0 || elapsed >= DISCONTINUITY_MS) {
      this.frames.length = 0; this.work.length = 0; this.cursor = 0;
      return;
    }
    this.frames[this.cursor] = elapsed;
    this.work[this.cursor] = Number.isFinite(workMS) && workMS >= 0 ? workMS : 0;
    this.cursor = (this.cursor + 1) % SAMPLE_LIMIT;
  }

  sample() {
    const samples = this.frames.length;
    if (!samples) return { fps: 0, frameMS: 0, p95: 0, workMS: 0, samples: 0 };
    const frameMS = this.frames.reduce((sum, value) => sum + value, 0) / samples;
    const workMS = this.work.reduce((sum, value) => sum + value, 0) / samples;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(samples * .95) - 1];
    return { fps: 1000 / frameMS, frameMS, p95, workMS, samples };
  }
}
