// Authored surprises in Tomorrow. The server owns reveals, hatch warnings and
// chutes; clients only render the shared state. Blue refuges never use this art.
import { describeRoom } from './room-catalog.mjs';
export const TOMORROW_HATCH_WARNING = 1;
export const TOMORROW_DROP_DURATION = .8;
export const TOMORROW_DROP_DAMAGE = 10;
export const TOMORROW_MIMICS = Object.freeze([
  Object.freeze({ id: 'mimic-wardrobe', enemyId: 'mimic-wardrobe-body', x: 24.5, z: 50.5,
    zoneId: 'wardrobe', mimicKind: 'cabinet', health: 108, roomTypes: ['cache'],
    label: 'Search the breathing cabinet', tell: 'A loose handle pulses like a throat. The cabinet has no dust beneath it.' }),
  Object.freeze({ id: 'mimic-museum', enemyId: 'mimic-museum-body', x: 23.5, z: 19.5,
    zoneId: 'museum', mimicKind: 'exhibit', health: 120, roomTypes: ['archive'],
    label: 'Inspect the exhibit that follows your hands', tell: 'The display glass bends inward. Something behind the label is breathing.' }),
]);
export const TOMORROW_TRAPDOORS = Object.freeze([
  Object.freeze({ id: 'trapdoor-museum', x: 15.5, z: 20.5, zoneId: 'museum', roomTypes: ['traversal'],
    label: 'Inspect the museum maintenance hatch', landing: Object.freeze({ x: 9.5, z: 24.5, angle: Math.PI / 2 }) }),
  Object.freeze({ id: 'trapdoor-weather', x: 80.5, z: 20.5, zoneId: 'weather', roomTypes: ['traversal'],
    label: 'Inspect the weather service hatch', landing: Object.freeze({ x: 67.5, z: 23.5, angle: Math.PI / 2 }) }),
]);

const copy = value => JSON.parse(JSON.stringify(value));
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const live = actor => actor && actor.alive !== false && actor.health > 0;
const actors = game => Object.values(game.state.players || { solo: game.state.player }).filter(live);
const features = state => state?.interactables || [];
const hatchItems = state => features(state).filter(item => item.tomorrowAction === 'trapdoor');
const mimicItems = state => features(state).filter(item => item.tomorrowAction === 'mimic');
const within = (point, item, margin = 0) => point.x >= item.x1 - margin && point.x <= item.x2 + margin
  && point.z >= item.z1 - margin && point.z <= item.z2 + margin;
const personal = player => player?.id ? { playerId: player.id } : {};
const permitted = (game, item) => {
  const room = describeRoom(game.level, item.x, item.z);
  return item.tomorrowAction === 'mimic' ? room?.permitsMimic === true : room?.permitsTrapdoor === true;
};

export function authorTomorrowHazards({ item, foe, notice }) {
  for (const mimic of TOMORROW_MIMICS) {
    item(mimic.id, 'tomorrow-mimic', mimic.x - .5, mimic.z - .5, mimic.label, {
      introducedRevision: 2, tomorrowAction: 'mimic', mimicId: mimic.enemyId, mimicKind: mimic.mimicKind,
      tell: mimic.tell, zoneId: mimic.zoneId, roomTypes: [...mimic.roomTypes],
    });
    // Dead dormant bodies neither attract fire/infighting nor block refuge use.
    // The object and this already-authored ID are activated together on reveal.
    foe(mimic.enemyId, 'lantern-maw', mimic.x - .5, mimic.z - .5, 0, {
      introducedRevision: 2, maxHealth: mimic.health, alive: false, dormant: true, mimicSource: mimic.id,
      mimicKind: mimic.mimicKind, zoneId: mimic.zoneId,
    });
  }
  for (const hatch of TOMORROW_TRAPDOORS) {
    item(hatch.id, 'tomorrow-trapdoor', hatch.x - .5, hatch.z - .5, hatch.label, {
      introducedRevision: 2, tomorrowAction: 'trapdoor', repeatable: true, zoneId: hatch.zoneId,
      roomTypes: [...hatch.roomTypes], width: 1.6, depth: 1.6,
      x1: hatch.x - .8, x2: hatch.x + .8, z1: hatch.z - .8, z2: hatch.z + .8,
      landing: { ...hatch.landing },
    });
  }
  notice?.('museum-hatch-notice', 16, 26.98, 'SERVICE FLOOR / LISTEN FOR THE LATCH',
    'SCORED SQUARES OPEN AFTER A WARNING / STEP OFF OR TAKE THE LONG WAY', { dz: 1 });
  notice?.('wardrobe-mimic-notice', 26.98, 50, 'STORAGE DOES NOT BREATHE',
    'WATCH THE HANDLES / A SHOT CAN WAKE A FALSE CABINET', { dx: -1, dz: 0 });
  return { mimics: TOMORROW_MIMICS, traps: TOMORROW_TRAPDOORS };
}

export function initializeTomorrowHazards(game) {
  if (!game.level?.tomorrow) return;
  game.state.tomorrowHazards = {
    version: 1,
    hatches: hatchItems(game.state).map(item => ({ id: item.id, phase: item.used ? 'spent' : 'armed', remaining: 0 })),
  };
}

function runtime(game) {
  if (!game.state.tomorrowHazards || game.state.tomorrowHazards.version !== 1) initializeTomorrowHazards(game);
  return game.state.tomorrowHazards;
}

export function tomorrowHatchVisual(state, item) {
  if (item.used) return 'spent';
  return state?.tomorrowHazards?.hatches?.find(hatch => hatch.id === item.id)?.phase === 'warning' ? 'warning' : 'closed';
}

function reveal(game, item, player, reason) {
  if (!item || item.used || game.state.status !== 'playing' || !permitted(game, item)) return false;
  const body = game.state.enemies.find(enemy => enemy.id === item.mimicId);
  if (!body || !body.dormant || body.alive) return false;
  item.used = true;
  Object.assign(body, { x: item.x, z: item.z, alive: true, health: body.maxHealth,
    active: true, dormant: false, revealed: true, shadowPhase: 'revealed', shadowTimer: 0,
    shadowCycle: 0, telegraph: null, attackCooldown: 1.2, hitTimer: 0, killedByPlayer: false });
  if (player) body.angle = Math.atan2(player.x - body.x, body.z - player.z);
  game._events.push({ type: 'mimic-reveal', id: body.id, objectId: item.id, kind: item.mimicKind,
    reason, x: body.x, z: body.z, ...personal(player) },
  { type: 'enemy-warning', kind: 'maw-reveal', id: body.id, x: body.x, z: body.z },
  { type: 'message', text: `${item.mimicKind === 'exhibit' ? 'The exhibit' : 'The cabinet'} unfolds its teeth. Move back; the false room has found you.`, ...personal(player) });
  game._pathTimer = 0;
  game._syncPermanentProgress?.();
  return true;
}

function beginWarning(game, item, player) {
  const hatch = runtime(game)?.hatches.find(entry => entry.id === item.id);
  if (!hatch || item.used || hatch.phase !== 'armed' || !permitted(game, item)) return false;
  hatch.phase = 'warning'; hatch.remaining = TOMORROW_HATCH_WARNING;
  game._events.push({ type: 'trapdoor-warning', id: item.id, x: item.x, z: item.z,
    duration: TOMORROW_HATCH_WARNING, width: item.width, depth: item.depth },
  { type: 'message', text: 'The floor latch clicks. Step off the scored square!', ...personal(player) });
  return true;
}

export function tomorrowHazardInteractionInfo(game, item) {
  if (!['mimic', 'trapdoor'].includes(item?.tomorrowAction)) return null;
  const active = game.state.status === 'playing' && live(game.state.player) && !game.state.player.jump && permitted(game, item);
  if (item.tomorrowAction === 'mimic') return { text: item.used ? 'The false cabinet is exposed.' : item.tell,
    label: item.used ? 'EXPOSED' : 'INSPECT', canUse: active && !item.used };
  const mode = tomorrowHatchVisual(game.state, item);
  return { text: mode === 'spent' ? 'The hatch is spent. Its safety grille holds the floor.'
    : mode === 'warning' ? 'The hatch is opening. Step off the scored square!'
      : 'Scored seams mark a maintenance chute. Trip the latch from here, then keep clear of the square.',
  label: mode === 'spent' ? 'SAFE' : mode === 'warning' ? 'STEP OFF' : 'TRIP', canUse: active && mode === 'closed' };
}

export function useTomorrowHazardInteraction(game, item) {
  const info = tomorrowHazardInteractionInfo(game, item);
  if (!info?.canUse) {
    if (info) game._events.push({ type: 'message', text: info.text, ...personal(game.state.player) });
    return false;
  }
  game.state.tutorial.interacted = true;
  return item.tomorrowAction === 'mimic' ? reveal(game, item, game.state.player, 'inspect') : beginWarning(game, item, game.state.player);
}

// Only call for an actual fired trace, after ammo/cooldown and aim correction.
// A nearer body intercepts the probe just as it intercepts the resulting shot.
export function probeTomorrowMimics(game, origin, angle, range, { pierce = 1 } = {}) {
  if (!game.level?.tomorrow || game.state.status !== 'playing' || !finite(angle, -1000, 1000) || !finite(range, 0, 100)) return 0;
  const along = point => (point.x - origin.x) * Math.sin(angle) - (point.z - origin.z) * Math.cos(angle);
  const across = point => Math.abs((point.x - origin.x) * Math.cos(angle) + (point.z - origin.z) * Math.sin(angle));
  const blockers = (game._weaponTargets?.() || game.state.enemies).filter(actor => actor !== origin && live(actor)
    && along(actor) > 0 && across(actor) < (actor.type === 'brute' ? .4 : .28)
    && game.hasLineOfSight(origin.x, origin.z, actor.x, actor.z));
  const candidates = mimicItems(game.state).filter(item => !item.used && along(item) > 0 && along(item) < range
    && across(item) < .5 && game.hasLineOfSight(origin.x, origin.z, item.x, item.z)).sort((a, b) => along(a) - along(b));
  let count = 0;
  for (const item of candidates) {
    if (blockers.filter(actor => along(actor) < along(item)).length + count >= Math.max(1, pierce)) continue;
    count += Number(reveal(game, item, origin, 'shot'));
  }
  return count;
}

export function revealTomorrowMimicsInBlast(game, shot, radius) {
  if (!game.level?.tomorrow || game.state.status !== 'playing') return 0;
  const player = shot.ownerId === 'player' ? game.state.player : game.state.players?.[shot.ownerId];
  let count = 0;
  for (const item of mimicItems(game.state)) if (!item.used && distance(item, shot) < radius
    && game.hasLineOfSight(shot.x, shot.z, item.x, item.z)) count += Number(reveal(game, item, player, 'blast'));
  return count;
}

function zoneFor(game, item) {
  return game.level.zones?.find(zone => zone.id === item.zoneId);
}

function clearLanding(game, point, player, reserved = [], item) {
  if (!point || !game._clearCircle(point.x, point.z, .28)) return false;
  const zone = item && zoneFor(game, item);
  if (zone && (point.x <= zone.x1 + .3 || point.x >= zone.x2 - .3 || point.z <= zone.z1 + .3 || point.z >= zone.z2 - .3)) return false;
  if (actors(game).some(other => other !== player && (distance(point, other) < .8
    || other.jump?.kind === 'trap-drop' && distance(point, { x: other.jump.targetX, z: other.jump.targetZ }) < .8))) return false;
  if (reserved.some(other => distance(point, other) < .8)) return false;
  if (game.state.enemies.some(enemy => live(enemy) && !enemy.dormant && distance(point, enemy) < 3
    && game.hasLineOfSight(point.x, point.z, enemy.x, enemy.z))) return false;
  if (game.state.projectiles.some(shot => shot.life > 0 && distance(point, shot) < 4
    && game.hasLineOfSight(point.x, point.z, shot.x, shot.z))) return false;
  if ((game.state.shadowHazards || []).some(area => area.remaining > 0 && distance(point, area) < area.radius + 1.2)) return false;
  return !hatchItems(game.state).some(hatch => !hatch.used && within(point, hatch, .35));
}

function nearbyLanding(game, anchor, player, reserved, item) {
  if (!anchor || !finite(anchor.x, 1, game.level.width - 1) || !finite(anchor.z, 1, game.level.height - 1)) return null;
  if (clearLanding(game, anchor, player, reserved, item)) return { x: anchor.x, z: anchor.z, angle: anchor.angle || 0 };
  // Bound the search to a small connected patch in the same authored district.
  // It cannot cross a closed progression gate or escape through another room.
  const queue = [[Math.floor(anchor.x), Math.floor(anchor.z)]], seen = new Set();
  for (let n = 0; n < queue.length; n++) {
    const [x, z] = queue[n], key = `${x},${z}`, point = { x: x + .5, z: z + .5, angle: anchor.angle || 0 };
    if (seen.has(key)) continue;
    seen.add(key);
    if (distance(point, anchor) > 4.2 || game._wall(point.x, point.z)) continue;
    if (clearLanding(game, point, player, reserved, item)) return point;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push([x + dx, z + dz]);
  }
  return null;
}

function sourceAnchor(player, item) {
  const previous = player.trapSafeGround;
  return previous && distance(previous, item) < 5 && !within(previous, item, .3)
    ? previous : { x: item.x, z: item.z + 1.6, angle: player.angle };
}

function beginDrop(game, item, player, reserved) {
  const entry = sourceAnchor(player, item);
  const landing = nearbyLanding(game, item.landing, player, reserved, item)
    || nearbyLanding(game, entry, player, reserved, item);
  if (!landing) {
    game._events.push({ type: 'message', text: 'The chute is obstructed. Your tether catches the safety grille.', ...personal(player) });
    return false;
  }
  reserved.push(landing);
  player.jump = { kind: 'trap-drop', trapId: item.id, x: player.x, z: player.z,
    targetX: landing.x, targetZ: landing.z, landingAngle: landing.angle,
    returnX: entry.x, returnZ: entry.z, t: 0, duration: TOMORROW_DROP_DURATION };
  player.elevation = 0; player.moving = false;
  // This is a fixed impact, not a combat hit. It never takes the final HP and
  // never becomes lethal through the selected combat difficulty or team size.
  const damage = Math.min(TOMORROW_DROP_DAMAGE, Math.max(0, player.health - 1));
  player.health -= damage;
  if (damage) game._events.push({ type: 'hurt', damage, source: 'trapdoor', x: item.x, z: item.z, ...personal(player) });
  game._events.push({ type: 'trapdoor-drop', id: item.id, x: item.x, z: item.z,
    targetX: landing.x, targetZ: landing.z, damage, ...personal(player) },
  { type: 'message', text: 'The floor files you through a maintenance chute. Follow the room signs to regroup.', ...personal(player) });
  return true;
}

export function updateTomorrowPlayerTraversal(game, dt) {
  if (!game.level?.tomorrow || game.state.status !== 'playing') return false;
  const player = game.state.player;
  if (!live(player)) return false;
  const jump = player.jump;
  if (jump?.kind !== 'trap-drop') {
    if (!jump && hatchItems(game.state).every(hatch => !within(player, hatch, .4))
      && game._clearCircle(player.x, player.z, .28)) player.trapSafeGround = { x: player.x, z: player.z, angle: player.angle };
    return false;
  }
  if (!finite(dt, 0, 1)) return true;
  jump.t = Math.min(jump.duration, jump.t + Math.min(dt, .1));
  const progress = jump.t / jump.duration;
  player.elevation = -.82 * Math.sin(Math.PI * progress); player.moving = false;
  if (progress < 1) return true;
  const item = features(game.state).find(feature => feature.id === jump.trapId);
  const landing = nearbyLanding(game, { x: jump.targetX, z: jump.targetZ, angle: jump.landingAngle }, player, [], item)
    || nearbyLanding(game, { x: jump.returnX, z: jump.returnZ, angle: player.angle }, player, [], item);
  // A dynamically blocked chute returns to its original, now spent floor tile.
  // It never pushes an operator into a wall or strands them below the map.
  player.x = landing?.x ?? jump.x; player.z = landing?.z ?? jump.z;
  if (landing) player.angle = landing.angle;
  player.jump = null; player.elevation = 0; game._pathTimer = 0;
  game._events.push({ type: 'trapdoor-land', id: jump.trapId, x: player.x, z: player.z,
    returned: !landing, ...personal(player) });
  return true;
}

export function updateTomorrowHazards(game, dt) {
  if (!game.level?.tomorrow || game.state.status !== 'playing' || !finite(dt, 0, 1)) return;
  dt = Math.min(dt, .1);
  const living = actors(game);
  for (const item of mimicItems(game.state)) {
    if (item.used) continue;
    const player = living.filter(actor => !actor.jump && distance(actor, item) < 1.1
      && game.hasLineOfSight(actor.x, actor.z, item.x, item.z)).sort((a, b) => distance(a, item) - distance(b, item))[0];
    if (player) reveal(game, item, player, 'proximity');
  }
  for (const item of hatchItems(game.state)) {
    const hatch = runtime(game)?.hatches.find(entry => entry.id === item.id);
    if (!hatch) continue;
    if (item.used) { hatch.phase = 'spent'; hatch.remaining = 0; continue; }
    if (hatch.phase === 'armed') {
      const occupant = living.find(player => !player.jump && within(player, item));
      if (occupant) beginWarning(game, item, occupant);
      continue;
    }
    if (hatch.phase !== 'warning') continue;
    hatch.remaining = Math.max(0, hatch.remaining - dt);
    if (hatch.remaining > 1e-8) continue;
    hatch.remaining = 0; hatch.phase = 'spent'; item.used = true;
    const reserved = [], victims = living.filter(player => !player.jump && within(player, item));
    for (const player of victims) beginDrop(game, item, player, reserved);
    game._events.push({ type: 'trapdoor-open', id: item.id, x: item.x, z: item.z, caught: victims.length });
    game._syncPermanentProgress?.();
  }
}

export function snapshotTomorrowHazards(game) {
  return { version: 1, hatches: hatchItems(game.state).map(item => ({ id: item.id,
    phase: item.used ? 'spent' : 'armed', remaining: 0 })) };
}

export function restoreTomorrowHazards(game) {
  if (!game.level?.tomorrow) return;
  initializeTomorrowHazards(game);
  for (const player of Object.values(game.state.players || { solo: game.state.player })) {
    if (player.jump?.kind !== 'trap-drop') continue;
    player.x = player.jump.x; player.z = player.jump.z;
    player.jump = null; player.elevation = 0; player.moving = false;
  }
}

export function syncTomorrowHazards(game, saved) {
  if (!game.level?.tomorrow || !saved) return;
  for (const item of [...mimicItems(game.state), ...hatchItems(game.state)]) {
    const old = features(saved).find(feature => feature.id === item.id);
    if (!old || !item.used) continue;
    old.used = true;
    if (!item.mimicId) continue;
    const enemy = game.state.enemies.find(body => body.id === item.mimicId), previous = saved.enemies?.find(body => body.id === item.mimicId);
    if (!enemy || !previous) continue;
    if (enemy.killedByPlayer === true && previous.killedByPlayer !== true) saved.kills++;
    Object.assign(previous, copy(enemy));
  }
  saved.tomorrowHazards = { version: 1, hatches: hatchItems(game.state).map(item => ({ id: item.id,
    phase: features(saved).find(feature => feature.id === item.id)?.used ? 'spent' : 'armed', remaining: 0 })) };
}

export function validTomorrowHazardsSnapshot(snapshot, level) {
  if (!level?.tomorrow) return true;
  const data = snapshot?.tomorrowHazards;
  const expectedHatches = (level.interactables || []).filter(item => item.tomorrowAction === 'trapdoor');
  if (!data || data.version !== 1 || !Array.isArray(data.hatches) || data.hatches.length !== expectedHatches.length
    || new Set(data.hatches.map(hatch => hatch?.id)).size !== expectedHatches.length) return false;
  for (const item of expectedHatches) {
    const hatch = data.hatches.find(entry => entry?.id === item.id), saved = features(snapshot).find(feature => feature.id === item.id);
    if (!hatch || !saved || !['armed', 'warning', 'spent'].includes(hatch.phase) || !finite(hatch.remaining, 0, TOMORROW_HATCH_WARNING)
      || (hatch.phase === 'spent') !== saved.used || hatch.phase === 'warning' && hatch.remaining <= 0
      || hatch.phase !== 'warning' && hatch.remaining !== 0) return false;
  }
  for (const item of (level.interactables || []).filter(feature => feature.tomorrowAction === 'mimic')) {
    const saved = features(snapshot).find(feature => feature.id === item.id), body = snapshot.enemies?.find(enemy => enemy.id === item.mimicId);
    if (!saved || !body) return false;
    if (!saved.used) {
      if (body.alive || body.health !== 0 || !body.dormant || body.revealed !== false || body.active
        || body.shadowPhase !== 'disguised' || body.x !== item.x || body.z !== item.z || body.killedByPlayer) return false;
    } else if (body.dormant || body.revealed !== true || body.shadowPhase === 'disguised') return false;
  }
  return true;
}
