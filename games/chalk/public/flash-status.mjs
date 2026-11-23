const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Shared by simulation, sight, screen veil and hearing recovery. Hold the
 * strongest part briefly, then recover without a hard timer cutoff. */
export function flashIntensity(actor, time) {
  if (!actor || !Number.isFinite(time) || !Number.isFinite(actor.flashStartedAt) || !Number.isFinite(actor.flashUntil) ||
      time < actor.flashStartedAt || time >= actor.flashUntil) return 0;
  const strength = clamp(Number(actor.flashStrength) || 0, 0, 1), duration = actor.flashUntil - actor.flashStartedAt;
  if (duration <= 0 || strength <= 0) return 0;
  const hold = Math.min(duration * .3, .18 + strength * .5), elapsed = time - actor.flashStartedAt;
  return strength * Math.pow(clamp((duration - Math.max(elapsed, hold)) / (duration - hold), 0, 1), 1.3);
}
