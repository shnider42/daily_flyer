/** Tinbell's lamplight is presentation state. It never discovers or moves an actor. */
import { isCabinWalkable } from './interior-layouts.mjs';

export const TINBELL_SIGHT_RANGE = 230;
const masks = new WeakMap(), memories = new WeakMap();
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const tileSize = layout => layout?.tileSize || layout?.tile || 24;
const cellIndex = (layout, point) => Math.floor(point.y / tileSize(layout)) * layout.cols + Math.floor(point.x / tileSize(layout));
const open = (layout, x, y) => x >= 0 && y >= 0 && x < layout.cols && y < layout.rows && !!layout.walkable[y * layout.cols + x];

export function isFoggedSite(surface) {
  return !!surface && (surface.id === 'tinbell:site:hollow' || surface.key === 'tinbell:site:hollow' ||
    (surface.parentId === 'tinbell' || surface.bodyId === 'tinbell') && (surface.siteId === 'hollow' || surface.id === 'hollow'));
}

/** Same narrow-footprint wall test as a personal weapon; no UI/authority imports. */
function clearSight(layout, from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.ceil(length / 3));
  for (let i = 1; i < steps; i++) if (!isCabinWalkable(layout,
    from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, 1)) return false;
  return true;
}

// A supercover tile ray includes its first opaque wall, but not the room behind it.
function tileSight(layout, fromX, fromY, toX, toY) {
  let x = fromX, y = fromY;
  const dx = toX - fromX, dy = toY - fromY, nx = Math.abs(dx), ny = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
  let ix = 0, iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      if (!open(layout, x + sx, y) || !open(layout, x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (x === toX && y === toY) return true;
    if (!open(layout, x, y)) return false;
  }
  return true;
}

/** Only the last 32 observer cells are retained per immutable layout. */
function sightMask(layout, observer) {
  const tile = tileSize(layout), cx = Math.floor(observer.x / tile), cy = Math.floor(observer.y / tile), key = `${cx}:${cy}`;
  let cache = masks.get(layout); if (!cache) { cache = new Map(); masks.set(layout, cache); }
  if (cache.has(key)) return cache.get(key);
  const visible = new Uint8Array(layout.cols * layout.rows), radius = Math.ceil(TINBELL_SIGHT_RANGE / tile);
  for (let y = Math.max(0, cy - radius); y <= Math.min(layout.rows - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(layout.cols - 1, cx + radius); x++) {
      if (Math.hypot(x - cx, y - cy) * tile <= TINBELL_SIGHT_RANGE + tile / 2 && tileSight(layout, cx, cy, x, y)) visible[y * layout.cols + x] = 1;
    }
  }
  cache.set(key, visible); while (cache.size > 32) cache.delete(cache.keys().next().value);
  return visible;
}

export function canSeeSitePoint(layout, observer, point, visible = null) {
  if (!layout?.walkable || !finitePoint(observer) || !finitePoint(point)) return false;
  visible ||= sightMask(layout, observer);
  return finitePoint(point) && point.x >= 0 && point.y >= 0 && point.x < layout.cols * tileSize(layout) && point.y < layout.rows * tileSize(layout) &&
    Math.hypot(point.x - observer.x, point.y - observer.y) <= TINBELL_SIGHT_RANGE &&
    !!visible[cellIndex(layout, point)] && clearSight(layout, observer, point);
}

/** Shared by aim authority and rendering. Global alert/reveal is not local sight. */
export function canSeeConcealedActor(layout, observer, actor) {
  if (!actor) return false;
  if (!actor.concealed) return actor.hidden !== true;
  if (actor.hidden || actor.revealed !== true || !layout?.walkable || !finitePoint(observer) || !finitePoint(actor)) return false;
  return canSeeSitePoint(layout, observer, actor);
}

/**
 * Tile masks are cached per player cell; moving actors still receive exact LOS.
 * Exploration memory belongs to this renderer/layout and captain, never a save.
 */
export function createSiteVisibility(surface, observer = surface?.spawn, { observerId = observer?.id || observer?.captainId || 'local' } = {}) {
  if (!isFoggedSite(surface) || !surface.combatLayout?.walkable || !finitePoint(observer)) return null;
  const layout = surface.combatLayout, visible = sightMask(layout, observer), key = String(observerId);
  let players = memories.get(layout); if (!players) { players = new Map(); memories.set(layout, players); }
  let memory = players.get(key);
  if (!memory) { memory = { explored: new Uint8Array(visible.length), lastMask: null }; players.set(key, memory); }
  if (memory.lastMask !== visible) {
    for (let i = 0; i < visible.length; i++) if (visible[i]) memory.explored[i] = 1;
    memory.lastMask = visible;
  }
  while (players.size > 12) players.delete(players.keys().next().value);
  const canSeePoint = point => canSeeSitePoint(layout, observer, point, visible);
  const canSeeActor = actor => !!actor && !actor.hidden && (!actor.concealed || actor.revealed === true) && canSeePoint(actor);
  const knowsPoint = point => finitePoint(point) && !!memory.explored[cellIndex(layout, point)];
  const knowsEntity = entity => entity?.type === 'siteExit' || entity?.type === 'exit' || knowsPoint(entity);
  return { active: true, siteId: surface.id, range: TINBELL_SIGHT_RANGE, tile: tileSize(layout), cols: layout.cols, rows: layout.rows,
    visible, explored: memory.explored, canSeePoint, canSeeActor, knowsPoint, knowsEntity };
}

export function visibleSiteHostiles(surface, observer, actors = [], options) {
  const view = createSiteVisibility(surface, observer, options);
  return actors.filter(actor => actor && !actor.hidden && (!view || view.canSeeActor(actor)));
}

/** A delayed visual pose cannot reveal a contact the current snapshot conceals. */
export function visibleSitePresentation(surface, observer, authoritative = [], presented = authoritative, options) {
  const view = createSiteVisibility(surface, observer, options);
  if (!view) return presented;
  const current = new Map(authoritative.map(actor => [actor.id, actor]));
  return presented.filter(actor => current.has(actor.id) && view.canSeeActor(current.get(actor.id)) && view.canSeeActor(actor));
}

/** Filter before audio, captions, score and retained effects, not just before pixels. */
export function visibleSiteCombatEvent(event, { surface, observer, actors = [], captainId = 'local', visibility = createSiteVisibility(surface, observer) } = {}) {
  if (!['person-shot', 'person-hit', 'boarder-down', 'person-down', 'crew-death', 'monster-revealed'].includes(event?.type)) return event;
  if (event.siteId && event.siteId !== surface?.id || event.type === 'monster-revealed' && !visibility) return null;
  if (!visibility) return event;
  if (event.siteId !== surface.id) return null;
  const actor = actors.find(value => value.id === (event.monsterId || event.attackerId || event.actorId));
  if (event.type === 'monster-revealed') {
    const seen = actor && visibility.canSeeActor(actor);
    return { ...event, text: seen ? 'The Bellwether opens its hollow throat and screams.' : 'A scream tears through the cavern.',
      actorName: seen ? actor.name : '', name: seen ? actor.name : '', visuallyRevealed: !!seen };
  }
  const target = actors.find(value => value.id === (event.targetId || event.actorId));
  const ownHit = event.targetId === captainId;
  if (target && !visibility.canSeeActor(target)) return null;
  const from = event.from || (event.type === 'person-shot' ? { x: event.x, y: event.y } : null);
  const to = event.to || { x: event.x ?? event.targetX, y: event.y ?? event.targetY };
  if (!ownHit && (!visibility.canSeePoint(to) || from && !visibility.canSeePoint(from))) return null;
  if (actor && !visibility.canSeeActor(actor)) {
    if (!ownHit) return null;
    return { ...event, actorName: 'Unseen movement', attackerName: 'Unseen movement', text: undefined };
  }
  return event;
}
