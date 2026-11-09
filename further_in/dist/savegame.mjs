import {createGame, finalHall, validLevel, openAt} from './core.mjs';

const SCHEMA = 1;
// Explicit fields keep saved data out of functions and transient UI/audio events.
const FIELDS = new Set(`phase time phaseTime loops pattern choices ghostDoor flash glimpse
glimpseUntil nextNoise tool cooldown stunCount stamina medal moving run step hasNote settle
map player doors items props hole chaseAt explored chasing entity path pathClock roomVariant
closedDoorTimer stare chargeDistance recentCharge gate puzzle waterAreas quietHall refuges
checkpoint checkpointIndex inspections exposure disturbance disturbanceUsed`.split(/\s+/));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const point = p => p && finite(p.x) && finite(p.z);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const inRange = (value, min, max) => finite(value) && value >= min && value <= max;
const integerRange = (value, min, max) => Number.isInteger(value) && inRange(value, min, max);
const pose = p => point(p) && finite(p.yaw) && inRange(p.pitch, -.8, .8);

function safeData(value, depth = 0) {
  if (depth > 10) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 6000;
  if (Array.isArray(value)) return value.length <= 2500 && value.every(item => safeData(item, depth + 1));
  if (!record(value)) return false;
  return Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && safeData(item, depth + 1));
}

export function serializeGame(state) {
  if (!state || state.status !== 'playing' || state.transition || state.phase === 'blackout') return null;
  const data = {};
  for (const key of FIELDS) if (state[key] !== undefined) data[key] = state[key];
  return JSON.parse(JSON.stringify({schema: SCHEMA, level: state.level, seed: state.seed, randomState: state.random.getState(), data}));
}

function validSnapshot(save) {
  if (!record(save) || save.schema !== SCHEMA || !validLevel(save.level)) return false;
  if (!Number.isInteger(save.seed) || !inRange(save.seed, 0, 0xffffffff) || !Number.isInteger(save.randomState) || !inRange(save.randomState, 0, 0xffffffff)) return false;
  const s = save.data;
  if (!record(s) || !safeData(s) || JSON.stringify(s).length > 100000) return false;
  if (!pose(s.player)) return false;
  if (!inRange(s.time, 0, 1e8) || !inRange(s.phaseTime, 0, 1e8) || !inRange(s.stamina, 0, 1)) return false;
  if (!['explore', 'garden', 'doors', 'ghost'].includes(s.phase)) return false;
  if (save.level !== 3 && s.phase !== 'explore') return false;
  const map = s.map;
  if (!Array.isArray(map) || map.length < 3 || map.length > 160 || !Array.isArray(map[0]) || map[0].length < 3 || map[0].length > 100) return false;
  if (!map.every(row => Array.isArray(row) && row.length === map[0].length && row.every(cell => cell === 0 || cell === 1))) return false;
  if (!openAt(map, s.player.x, s.player.z)) return false;
  const initial = createGame(save.level, save.seed);
  for (const [key, value] of Object.entries(initial)) {
    if (FIELDS.has(key) && ['boolean', 'number', 'string'].includes(typeof value) && typeof s[key] !== typeof value) return false;
  }
  for (const key of ['doors', 'items', 'props']) if (!Array.isArray(s[key]) || s[key].length > 200 || !s[key].every(point)) return false;
  if (s.entity != null && !point(s.entity)) return false;
  if (!integerRange(s.pattern, 0, 4) || !integerRange(s.choices, 0, 9) || !integerRange(s.ghostDoor, 7, 9)) return false;
  if (s.gate !== undefined && (!Array.isArray(s.gate) || !s.gate.every(cell => integerRange(cell.x, 1, map[0].length - 2) && integerRange(cell.z, 1, map.length - 2)))) return false;
  if (save.level === 2 && (!point(s.hole) || !finite(s.chaseAt) || (s.chasing && !point(s.entity)))) return false;
  if (save.level === 3 && s.phase === 'ghost' && !point(s.entity)) return false;
  if (save.level >= 4) {
    if (!record(s.puzzle) || typeof s.puzzle.solved !== 'boolean') return false;
    if (save.level <= 5 && JSON.stringify(s.gate)!==JSON.stringify(initial.gate)) return false;
    const controls=s.items.filter(item=>item.kind==='control');
    if (save.level === 4 && (s.puzzle.kind !== 'drain' || !integerRange(s.puzzle.progress, 0, 3) || !inRange(s.puzzle.water, 0, 1) || !Array.isArray(s.waterAreas) || !s.waterAreas.every(area=>point(area)&&inRange(area.width,.1,200)&&inRange(area.depth,.1,200)))) return false;
    if (save.level <= 5 && (controls.length !== (save.level===4?3:2) || !controls.every(item=>integerRange(item.id,1,controls.length)&&typeof item.active==='boolean'))) return false;
    if (save.level === 5) {
      const h=s.quietHall,q=s.puzzle;
      if(q.kind !== 'quiet' || !integerRange(q.breakers,0,2) || !inRange(q.awareness,0,1) || !inRange(q.cycle,0,11) || typeof q.hum!=='boolean' || typeof q.warning!=='boolean')return false;
      if(!record(h)||![h.minX,h.maxX,h.minZ,h.maxZ].every(finite)||h.minX>=h.maxX||h.minZ>=h.maxZ)return false;
    }
    if (save.level === 6 && (s.puzzle.kind !== 'inspection' || !integerRange(s.puzzle.cleared, 0, 3) || !Array.isArray(s.inspections) || s.inspections.length !== 3 || !s.inspections.every((light,index) => point(light) && light.index===index && inRange(light.period,1,60) && inRange(light.offset,0,60) && inRange(light.onDuration,.1,light.period) && inRange(light.width,.1,200) && inRange(light.depth,.1,200) && typeof light.active==='boolean' && typeof light.warning==='boolean' && typeof light.passed==='boolean'))) return false;
    if (save.level >= 5 && (!pose(s.checkpoint) || !openAt(map,s.checkpoint.x,s.checkpoint.z) || !Array.isArray(s.refuges) || !integerRange(s.checkpointIndex,0,s.refuges.length-1) || !s.refuges.every((r,index)=>point(r)&&r.index===index&&inRange(r.radius,.1,20)&&openAt(map,r.x,r.z)))) return false;
  }
  return true;
}

export function restoreGame(snapshot, {safe = true} = {}) {
  try {
    if (!validSnapshot(snapshot)) return null;
    const state = createGame(snapshot.level, snapshot.seed);
    const data = JSON.parse(JSON.stringify(snapshot.data));
    for (const key of FIELDS) if (data[key] !== undefined) state[key] = data[key];
    state.random.setState(snapshot.randomState);
    state.status = 'playing';
    state.transition = null;
    state.events = [];
    state.run = false;
    state.moving = 0;
    state.flash = 0;
    state.revision++;
    if (safe) {
      // Returning players get their bearings; the ending always retries its encounter.
      if (state.level === 3 && state.phase === 'ghost') {
        finalHall(state);
        state.events = [];
        state.stunCount = 0;
        state.cooldown = 0;
      } else {
        state.settle = 2.5;
        if (state.entity) state.entity.stunned = Math.max(3, state.entity.stunned || 0);
        if (state.puzzle?.kind === 'quiet') state.puzzle.awareness = 0;
        if (state.level === 6) state.exposure = 0;
      }
    }
    return state;
  } catch {
    return null;
  }
}
