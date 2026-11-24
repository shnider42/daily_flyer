// Presentation-only city life. Gunfire and blasts come only from real simulated
// actors through soundEvents. This director never advances the simulation RNG,
// spawns actors, or places a sound relative to the listener.
const KINDS = ['rotor', 'engine', 'metal', 'domestic'];
const RECENT_DEADLINE = .45;
const MAX_CLOCK_GAP = 2;
const MAX_EVENTS = 2;

function profile(phase, bedGain, domesticGain, intervals) {
  for (const range of Object.values(intervals)) Object.freeze(range);
  return Object.freeze({ phase, bedGain, domesticGain, intervals: Object.freeze(intervals) });
}

const PROFILES = Object.freeze({
  day: profile('day', 1, 1, {
    rotor: [48, 85], engine: [24, 45], metal: [11, 24], domestic: [32, 65],
  }),
  dawn: profile('dawn', .66, .76, {
    rotor: [48, 82], engine: [32, 55], metal: [18, 36], domestic: [38, 74],
  }),
  night: profile('night', .42, .55, {
    // Night reduces everyday activity, not the level of an actual gun report.
    // The historical relief operation and helicopter support continued at night.
    rotor: [42, 78], engine: [48, 82], metal: [26, 48], domestic: [46, 88],
  }),
});

/** Gain multipliers and interval ranges in seconds; no audio nodes or side effects. */
export function cityAmbienceProfile(state) {
  const lighting = state?.mission?.lighting;
  if (lighting === 'night' || !lighting && state?.missionIndex === 2) return PROFILES.night;
  if (lighting === 'dawn' || !lighting && state?.missionIndex === 3) return PROFILES.dawn;
  return PROFILES.day;
}

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function random(director) {
  director.rngState = (director.rngState + 0x6d2b79f5) >>> 0;
  let value = Math.imul(director.rngState ^ director.rngState >>> 15, director.rngState | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function range(director, lo, hi) { return lo + random(director) * (hi - lo); }

/** Reset when starting a mission or changing the listener/transport epoch. */
export function createCityAmbience(seed = 1, missionIndex = 0, atTime = 0) {
  const mission = Math.max(0, Math.floor(finite(missionIndex)));
  return {
    seed: finite(seed, 1) >>> 0,
    missionIndex: mission,
    rngState: ((finite(seed, 1) >>> 0) ^ Math.imul(mission + 1, 0x9e3779b9) ^ 0x43495459) >>> 0,
    lastTime: Math.max(0, finite(atTime)),
    phase: null,
    channels: KINDS.map(kind => ({ kind, due: Infinity, lastAnchor: null })),
    anchors: null,
    sequence: 0,
    suspended: false,
  };
}

function arm(director, scene, atTime, initial = false) {
  const leadIn = { rotor: .42, engine: .4, metal: .2, domestic: .45 };
  for (const channel of director.channels) {
    const [lo, hi] = scene.intervals[channel.kind];
    channel.due = atTime + range(director, lo, hi) * (initial ? leadIn[channel.kind] : 1);
  }
  director.phase = scene.phase;
}

function worldAnchors(director, world) {
  if (!world || !Number.isFinite(world.width) || !Number.isFinite(world.height) || world.width <= 0 || world.height <= 0) return null;
  const cached = director.anchors;
  if (cached?.world === world && cached.width === world.width && cached.height === world.height && cached.districts === world.districts) return cached;
  const width = world.width, height = world.height;
  const margin = clamp(Math.min(width, height) * .055, 32, 140);
  const edges = [];
  for (let index = 0; index < 3; index++) {
    const fraction = [.22, .51, .79][index];
    edges.push(
      { id: `edge:north:${index}`, side: 'north', x: width * fraction, y: -margin },
      { id: `edge:east:${index}`, side: 'east', x: width + margin, y: height * fraction },
      { id: `edge:south:${index}`, side: 'south', x: width * fraction, y: height + margin },
      { id: `edge:west:${index}`, side: 'west', x: -margin, y: height * fraction },
    );
  }
  const districts = [];
  const source = Array.isArray(world.districts) && world.districts.length ? world.districts
    : Array.isArray(world.buildings) ? world.buildings : [];
  // Static layout is small; cap external/co-op fixtures rather than scanning an
  // unbounded collection on each sound. Normal frames reuse this cache entirely.
  for (const [index, block] of source.slice(0, 64).entries()) {
    if (!block || ![block.x, block.y, block.w, block.h].every(Number.isFinite) || block.w <= 0 || block.h <= 0) continue;
    districts.push({ id: `district:${block.id ?? index}`, kind: block.kind || block.districtKind || 'residential',
      x: clamp(block.x + block.w / 2, 0, width), y: clamp(block.y + block.h / 2, 0, height) });
  }
  if (!districts.length) for (let index = 0; index < 4; index++) {
    districts.push({ id: `block:${index}`, kind: index % 2 ? 'workshop' : 'residential',
      x: width * (index % 2 ? .7 : .3), y: height * (index < 2 ? .3 : .7) });
  }
  const homes = districts.filter(anchor => ['residential', 'courtyard'].includes(anchor.kind));
  const yards = districts.filter(anchor => ['workshop', 'market'].includes(anchor.kind));
  director.anchors = { world, width, height, districts: world.districts, edges,
    homes: homes.length ? homes : districts, yards: yards.length ? yards : districts };
  return director.anchors;
}

function chooseAnchor(director, channel, anchors) {
  const pool = channel.kind === 'domestic' ? anchors.homes : channel.kind === 'metal' ? anchors.yards : anchors.edges;
  let index = Math.floor(random(director) * pool.length);
  if (pool.length > 1 && pool[index].id === channel.lastAnchor) index = (index + 1) % pool.length;
  channel.lastAnchor = pool[index].id;
  return pool[index];
}

function describe(director, channel, scene, anchors, now) {
  const anchor = chooseAnchor(director, channel, anchors), kind = channel.kind;
  const event = { kind, x: anchor.x, y: anchor.y, anchorId: anchor.id,
    intensity: range(director, .62, 1), seed: (random(director) * 4294967296) >>> 0,
    duration: 1, variant: kind, time: now, id: ++director.sequence };
  if (kind === 'rotor') {
    event.variant = 'pass';
    event.duration = range(director, 10, 16);
    event.toX = anchor.side === 'east' || anchor.side === 'west' ? anchors.width - anchor.x : anchor.x;
    event.toY = anchor.side === 'north' || anchor.side === 'south' ? anchors.height - anchor.y : anchor.y;
  } else if (kind === 'engine') {
    event.variant = 'distant-transport';
    event.duration = range(director, 5, 9);
    // Adjacent streets outside the playable bounds: the cue does not suggest an
    // invisible vehicle driving straight through a visible building or civilian.
    const direction = random(director) < .5 ? -1 : 1;
    event.toX = anchor.x;
    event.toY = anchor.y;
    if (anchor.side === 'north' || anchor.side === 'south') event.toX = clamp(anchor.x + direction * anchors.width * .2, 0, anchors.width);
    else event.toY = clamp(anchor.y + direction * anchors.height * .2, 0, anchors.height);
  } else if (kind === 'metal') {
    event.variant = random(director) < .56 ? 'shutter' : 'loose-sheet';
    event.duration = range(director, .4, 1.4);
    event.intensity *= .7;
  } else {
    // A sparse distant dog, not a distressed-person recording recycled as crowd
    // ambience. No invented language, location claim, or continuous barking bed.
    event.variant = 'dog';
    event.duration = range(director, 1.1, 2.1);
    event.intensity *= scene.domesticGain;
  }
  return event;
}

/**
 * Returns at most two fresh descriptors per update. `state.time` is simulation
 * seconds; duplicate packets, paused clocks, stale cues and long snapshot gaps
 * never accumulate a burst of deferred ambience. Rendering chooses audibility
 * and uses the source position for distance, obstruction, and stereo bearing.
 */
export function advanceCityAmbience(director, state) {
  if (!director || !state || !Number.isFinite(state.time)) return [];
  const now = Math.max(0, state.time), elapsed = now - director.lastTime;
  if (elapsed < 0) return [];
  const scene = cityAmbienceProfile(state);
  if (state.paused || state.status && state.status !== 'playing') {
    director.lastTime = now;
    director.suspended = true;
    return [];
  }
  if (!director.phase) {
    arm(director, scene, now, true);
    director.lastTime = now;
    director.suspended = false;
    return [];
  }
  if (elapsed > MAX_CLOCK_GAP || director.suspended || director.phase !== scene.phase) {
    arm(director, scene, now);
    director.lastTime = now;
    director.suspended = false;
    return [];
  }
  if (!elapsed) return [];
  director.lastTime = now;
  const anchors = worldAnchors(director, state.world);
  if (!anchors) return [];
  const events = [];
  const due = director.channels.filter(channel => channel.due <= now).sort((a, b) => a.due - b.due);
  for (const channel of due) {
    if (now - channel.due <= RECENT_DEADLINE && events.length < MAX_EVENTS) events.push(describe(director, channel, scene, anchors, now));
    // Reschedule even a skipped cue: no backlog can leak into following frames.
    const [lo, hi] = scene.intervals[channel.kind];
    channel.due = now + range(director, lo, hi);
  }
  return events;
}
