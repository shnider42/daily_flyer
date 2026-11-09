const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = Number.isFinite;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const poseFields = ['x', 'y', 'angle', 'vx', 'vy', 'speed', 'angularVelocity'];

function poses(entities) {
  const result = new Map();
  for (const entity of entities || []) {
    if (entity.id === undefined || !finite(entity.x) || !finite(entity.y)) continue;
    const pose = {};
    for (const field of poseFields) if (finite(entity[field])) pose[field] = entity[field];
    result.set(entity.id, pose);
  }
  return result;
}

function velocity(pose, previous, seconds) {
  if (finite(pose.vx) && finite(pose.vy)) return { vx: pose.vx, vy: pose.vy };
  if (finite(pose.speed) && finite(pose.angle)) return { vx: Math.cos(pose.angle) * pose.speed, vy: Math.sin(pose.angle) * pose.speed };
  if (previous && seconds > 0) return { vx: (pose.x - previous.x) / seconds, vy: (pose.y - previous.y) / seconds };
  return { vx: 0, vy: 0 };
}

/**
 * Visual poses only. Feed merged server snapshots, then sample with server epoch
 * milliseconds (Date.now() + network.clockOffset). Static world data and current
 * health/membership remain authoritative; no Game or snapshot object is changed.
 */
export class WorldPresentation {
  constructor({ delayMs = 100, maxExtrapolationMs = 150, teleportDistance = 280 } = {}) {
    this.delayMs = clamp(delayMs, 0, 250);
    this.maxExtrapolationMs = clamp(maxExtrapolationMs, 0, 250);
    this.teleportDistance = Math.max(24, teleportDistance);
    this.frames = [];
    this.latest = null;
    this.roomKey = null;
  }

  reset() { this.frames.length = 0; this.latest = null; this.roomKey = null; }

  push(snapshot, arrivalMs = Date.now()) {
    if (!snapshot?.world) return false;
    const roomKey = `${snapshot.room?.id || ''}:${snapshot.state?.systemId || snapshot.world.id || ''}`;
    if (roomKey !== this.roomKey) { this.reset(); this.roomKey = roomKey; }
    const time = finite(snapshot.simulatedAt) ? snapshot.simulatedAt : finite(snapshot.serverTime) ? snapshot.serverTime : arrivalMs;
    if (!finite(time) || this.frames.length && time < this.frames.at(-1).time) return false;
    const boarding = snapshot.state?.boarding;
    const actors = boarding?.phase === 'active' ? [...(boarding.enemies || []), ...(boarding.allies || [])] : [];
    const boardKey = boarding ? `${boarding.id}:${boarding.startedAt ?? ''}:${boarding.phase}` : '';
    const exploration = snapshot.state?.exploration;
    const explorationKey = exploration?.key ? `${roomKey}:${exploration.key}` : '';
    const explorationActors = explorationKey ? exploration.encounter?.monsters || [] : [];
    const frame = { time, enemies: poses(snapshot.world.enemies), traffic: poses(snapshot.world.traffic), boarders: poses(actors), explorers: poses(explorationActors), boardKey, explorationKey };
    if (this.frames.at(-1)?.time === time) this.frames[this.frames.length - 1] = frame;
    else this.frames.push(frame);
    if (this.frames.length > 8) this.frames.shift();
    this.latest = { world: snapshot.world, actors, boardKey, explorationActors, explorationKey, time };
    return true;
  }

  _pose(entity, kind, before, after, targetTime) {
    if (entity.dead || (entity.health ?? entity.hp ?? 1) <= 0) return entity;
    const scope = kind === 'boarders' ? 'boardKey' : kind === 'explorers' ? 'explorationKey' : null;
    if (scope && (before[scope] !== this.latest[scope] || after[scope] !== this.latest[scope])) return entity;
    const left = before[kind].get(entity.id), right = after[kind].get(entity.id);
    if (!left || !right) return entity;
    if (Math.hypot(right.x - left.x, right.y - left.y) > this.teleportDistance) return entity;
    if (after.time > before.time) {
      const fraction = clamp((targetTime - before.time) / (after.time - before.time), 0, 1);
      const result = { ...entity, x: left.x + (right.x - left.x) * fraction, y: left.y + (right.y - left.y) * fraction };
      if (finite(left.angle) && finite(right.angle)) result.angle = left.angle + angleDelta(left.angle, right.angle) * fraction;
      if (scope) Object.assign(result, velocity(right, left, (after.time - before.time) / 1000));
      return result;
    }
    const previousFrame = this.frames.length > 1 ? this.frames[this.frames.length - 2] : null;
    let previousPose = previousFrame?.[kind].get(entity.id);
    if (previousPose && (Math.hypot(right.x - previousPose.x, right.y - previousPose.y) > this.teleportDistance || scope && previousFrame[scope] !== this.latest[scope])) previousPose = null;
    const seconds = clamp(targetTime - after.time, 0, this.maxExtrapolationMs) / 1000;
    const motion = velocity(right, previousPose, previousFrame ? (after.time - previousFrame.time) / 1000 : 0);
    const result = { ...entity, x: right.x + motion.vx * seconds, y: right.y + motion.vy * seconds };
    if (finite(right.angle)) result.angle = right.angle + (right.angularVelocity || 0) * seconds;
    if (scope) Object.assign(result, motion);
    return result;
  }

  sample(serverTime = Date.now()) {
    if (!this.latest) return { world: null, boardingActors: [], explorationActors: [] };
    if (!finite(serverTime)) serverTime = this.latest.time;
    const targetTime = serverTime - this.delayMs;
    let before = this.frames[0], after = before;
    for (const frame of this.frames) {
      if (frame.time <= targetTime) before = frame;
      if (frame.time >= targetTime) { after = frame; break; }
      after = frame;
    }
    const interpolate = (entities, kind) => (entities || []).map(entity => this._pose(entity, kind, before, after, targetTime));
    // Enemy projectiles have no stable ID. Their authoritative velocity gives a
    // continuous pose without pairing unrelated shots by changing array indices.
    const age = Math.max(0, serverTime - this.latest.time) / 1000;
    const seconds = Math.min(age, this.maxExtrapolationMs / 1000);
    const bullets = (this.latest.world.bullets || []).filter(bullet => !finite(bullet.ttl) || bullet.ttl > age).map(bullet => ({
      ...bullet, x: bullet.x + (finite(bullet.vx) ? bullet.vx : 0) * seconds, y: bullet.y + (finite(bullet.vy) ? bullet.vy : 0) * seconds
    }));
    return {
      world: { ...this.latest.world, enemies: interpolate(this.latest.world.enemies, 'enemies'), traffic: interpolate(this.latest.world.traffic, 'traffic'), bullets },
      boardingActors: interpolate(this.latest.actors, 'boarders'),
      explorationActors: interpolate(this.latest.explorationActors, 'explorers')
    };
  }
}
