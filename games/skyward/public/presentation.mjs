// Keep simulation at a fixed cadence and interpolate only the view. Rendering
// must never move the authoritative aircraft or change collision/weapon state.
export const FIXED_STEP = 1 / 60;
const MAX_FRAME = .25;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const poseFields = ['x', 'y', 'z', 'heading', 'pitch', 'roll', 'speed', 'verticalSpeed', 'vx', 'vy', 'vz', 'age'];
const angles = new Set(['heading', 'pitch', 'roll']);
const groups = ['enemies', 'targets', 'projectiles', 'effects', 'paratroopers'];

export class FixedStepClock {
  constructor() { this.reset(); }
  reset() { this.accumulator = 0; }
  get alpha() { return clamp(this.accumulator / FIXED_STEP, 0, 1); }
  advance(elapsed, step) {
    this.accumulator += Number.isFinite(elapsed) ? clamp(elapsed, 0, MAX_FRAME) : 0;
    let count = 0;
    // A backgrounded tab is paused by the app. Bound catch-up after a one-off
    // stall so a debugger pause or a lost frame cannot cause a spiral of work.
    while (this.accumulator + 1e-10 >= FIXED_STEP && count < 15) {
      step(FIXED_STEP);
      this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      count++;
    }
    return count;
  }
}

function record(source) {
  return { source, previous: {}, view: {}, stamp: -1 };
}

function capture(record, source, stamp) {
  for (const field of poseFields) record.previous[field] = source[field];
  record.stamp = stamp;
}

function sample(record, source, alpha, stamp) {
  if (record.source !== source) {
    for (const key of Object.keys(record.view)) if (!(key in source)) delete record.view[key];
    record.source = source;
  }
  Object.assign(record.view, source);
  const previous = record.previous;
  // Snap corrections/respawns instead of drawing a flight across the map.
  const jump = Math.hypot(source.x - previous.x, source.y - previous.y, source.z - previous.z);
  const interpolate = record.stamp === stamp && jump < Math.max(150, (source.speed || 0) * FIXED_STEP * 8);
  for (const field of poseFields) {
    const current = source[field], before = previous[field];
    if (!Number.isFinite(current)) { delete record.view[field]; continue; }
    let difference = current - before;
    if (angles.has(field)) difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    record.view[field] = interpolate && Number.isFinite(before) ? before + difference * alpha : current;
  }
  return record.view;
}

export class FlightPresentation {
  constructor(sim) { if (sim) this.reset(sim); }
  reset(sim) {
    this.sim = sim;
    this.view = Object.create(sim);
    this.player = record(sim.player);
    this.records = Object.fromEntries(groups.map(group => [group, new Map()]));
    for (const group of groups) this.view[group] = [];
    this.stamp = 0;
    this.capture(sim);
  }
  capture(sim = this.sim) {
    if (sim !== this.sim) { this.reset(sim); return; }
    const stamp = ++this.stamp;
    capture(this.player, sim.player, stamp);
    for (const group of groups) {
      const records = this.records[group];
      for (const source of sim[group] || []) {
        const key = source.id ?? source;
        let entry = records.get(key);
        if (!entry) records.set(key, entry = record(source));
        capture(entry, source, stamp);
      }
      for (const [key, entry] of records) if (entry.stamp !== stamp) records.delete(key);
    }
  }
  sample(alpha = 1) {
    alpha = clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1);
    this.view.player = sample(this.player, this.sim.player, alpha, this.stamp);
    for (const group of groups) {
      const output = this.view[group], records = this.records[group];
      let count = 0;
      for (const source of this.sim[group] || []) {
        const key = source.id ?? source;
        let entry = records.get(key);
        if (!entry) records.set(key, entry = record(source));
        output[count++] = sample(entry, source, alpha, this.stamp);
      }
      output.length = count;
    }
    return this.view;
  }
}
