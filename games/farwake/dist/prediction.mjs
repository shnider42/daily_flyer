/** DOM-free input history and pose correction shared by ship and walking clients. */
export const MAX_PREDICTION_MS = 250;
export const INPUT_HISTORY_MS = 2000;
export const CORRECTION_RATE = 14;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const axes = ['x', 'y', 'thrust', 'strafe', 'turn', 'aimX', 'aimY'];
const buttons = ['fire', 'mine', 'boost', 'brake', 'aiming'];

export function predictionInput(input = {}) {
  const value = {};
  for (const key of axes) value[key] = clamp(finite(input[key]), -1, 1);
  for (const key of buttons) value[key] = !!input[key];
  value.flightAssist = input.flightAssist !== false;
  return value;
}

const sameInput = (a, b) => axes.every(key => a[key] === b[key]) && buttons.every(key => a[key] === b[key]) && a.flightAssist === b.flightAssist;

/** Timestamped control changes, independent of how often a packet is sent. */
export class InputTimeline {
  constructor(at = 0, input = {}) { this.reset(at, input); }
  reset(at, input = {}) { this.entries = [{ at: finite(at), input: predictionInput(input) }]; }
  record(input, at, now = at) {
    at = finite(at); now = finite(now, at);
    const value = predictionInput(input), entries = this.entries;
    // A render frame describes its just-elapsed interval. Its edge can precede
    // a visibility/menu event observed since the preceding render frame.
    while (entries.length > 1 && entries.at(-1).at >= at) entries.pop();
    if (entries[0].at > at) entries.length = 0;
    if (!entries.length || !sameInput(entries.at(-1).input, value)) entries.push({ at, input: value });
    const cutoff = now - INPUT_HISTORY_MS;
    while (entries.length > 1 && entries[1].at <= cutoff) entries.shift();
    if (entries.length > 512) entries.splice(0, entries.length - 512);
  }
  frames(from, to, maxMs = MAX_PREDICTION_MS) {
    from = finite(from); to = finite(to, from);
    if (to <= from) return [];
    from = Math.max(from, to - Math.max(0, maxMs));
    const frames = [], entries = this.entries;
    let cursor = from, input = entries[0]?.input || predictionInput();
    for (const edge of entries) {
      if (edge.at <= from) { input = edge.input; continue; }
      if (edge.at >= to) break;
      if (edge.at > cursor) frames.push({ from: cursor, to: edge.at, dt: (edge.at - cursor) / 1000, input });
      cursor = edge.at; input = edge.input;
    }
    if (to > cursor) frames.push({ from: cursor, to, dt: (to - cursor) / 1000, input });
    return frames;
  }
}

export const shortestAngle = value => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));

/** Keeps correction outside the simulated ship; angular correction uses the short arc. */
export function correctedPose(ship, correction = {}, radius = 2700) {
  return {
    ...ship,
    x: clamp(finite(ship.x) + finite(correction.x), -radius, radius),
    y: clamp(finite(ship.y) + finite(correction.y), -radius, radius),
    angle: shortestAngle(finite(ship.angle) + finite(correction.angle))
  };
}

export function poseCorrection(displayed, simulated) {
  return { x: finite(displayed.x) - finite(simulated.x), y: finite(displayed.y) - finite(simulated.y), angle: shortestAngle(finite(displayed.angle) - finite(simulated.angle)) };
}

export function decayCorrection(correction, elapsedMs) {
  const decay = Math.exp(-Math.max(0, finite(elapsedMs)) / 1000 * CORRECTION_RATE);
  return { x: finite(correction.x) * decay, y: finite(correction.y) * decay, angle: finite(correction.angle) * decay };
}
