/** Pitch presentation and a hitter's read share the visible flight, not its destination. */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;

export function pitchMovement(pitch, progress) {
  const t = clamp(progress, 0, 1);
  const bend = Math.pow(t, pitch.shape === 'late' ? 3.4 : 2);
  const flutter = pitch.flutter, envelope = Math.sin(Math.PI * t / 2);
  const dx = flutter ? envelope * flutter.amplitude * (Math.sin(t * 8 * Math.PI + flutter.phaseX) * .72 + Math.sin(t * 13 * Math.PI + flutter.phaseY) * .28) : 0;
  const dy = flutter ? envelope * flutter.amplitude * (Math.sin(t * 7 * Math.PI + flutter.phaseY) * .55 + Math.sin(t * 11 * Math.PI + flutter.phaseX) * .25) : 0;
  return { x: bend * pitch.breakX + dx, y: -bend * pitch.breakY + dy + (pitch.lobArc || 0) * 4 * t * (1 - t) };
}

export function pitchPosition(pitch, absoluteTime) {
  const t = (absoluteTime - pitch.releaseAt) / pitch.duration;
  if (pitch.aimTarget) {
    const progress = clamp(t, 0, 1), movement = pitchMovement(pitch, progress);
    // Continue smoothly behind the plate; a pitch does not jump back onto its aim line.
    const late = Math.max(0, t - 1);
    const end = pitchMovement(pitch, 1), before = pitchMovement(pitch, .99);
    return {
      x: mix(pitch.start.x, pitch.aimTarget.x, t) + movement.x + late * (end.x - before.x) * 100,
      y: mix(pitch.start.y, pitch.aimTarget.y, t) + movement.y + late * (end.y - before.y) * 100,
      z: mix(pitch.start.z, 0, t),
    };
  }
  // Old snapshots and explicit contact fixtures retain their original trajectory.
  const progress = clamp(t, 0, 1), envelope = Math.sin(Math.PI * progress);
  const bend = envelope * (pitch.shape === 'late' ? .35 + .9 * progress : 1), flutter = pitch.flutter;
  const dx = flutter ? envelope * flutter.amplitude * (Math.sin(progress * 8 * Math.PI + flutter.phaseX) * .72 + Math.sin(progress * 13 * Math.PI + flutter.phaseY) * .28) : 0;
  const dy = flutter ? envelope * flutter.amplitude * (Math.sin(progress * 7 * Math.PI + flutter.phaseY) * .55 + Math.sin(progress * 11 * Math.PI + flutter.phaseX) * .25) : 0;
  return { x: mix(pitch.start.x, pitch.target.x, t) + bend * (pitch.breakX || 0) + dx,
    y: mix(pitch.start.y, pitch.target.y, t) + bend * (pitch.breakY || 0) + dy,
    z: mix(pitch.start.z, 0, t) };
}

/** Only positions already observed by the hitter enter this estimate. */
export function readVisiblePitch(samples) {
  if (samples.length < 3) return null;
  const a = samples.at(-3), b = samples.at(-2), c = samples.at(-1);
  const dt = c.time - a.time, recent = c.time - b.time, previous = b.time - a.time;
  if (Math.min(dt, recent, previous) <= 0) return null;
  const vz = (c.z - a.z) / dt;
  if (vz >= -.1) return null;
  const remaining = -c.z / vz;
  if (remaining < -.08 || remaining > 2.5) return null;
  const vx = (c.x - a.x) / dt, vy = (c.y - a.y) / dt;
  const ax = clamp(((c.x - b.x) / recent - (b.x - a.x) / previous) / (dt / 2), -6, 6);
  const ay = clamp(((c.y - b.y) / recent - (b.y - a.y) / previous) / (dt / 2), -7, 7);
  // A batter can recognize some curvature already seen, but cannot see future break.
  return { remaining, arrival: c.time + remaining, speed: -vz,
    x: c.x + vx * remaining + .35 * ax * remaining * remaining,
    y: c.y + vy * remaining + .35 * ay * remaining * remaining };
}
