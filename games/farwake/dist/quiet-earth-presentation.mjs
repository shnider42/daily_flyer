/** Small, local scene effects. Nothing in this module discovers or moves an actor. */
import { isQuietEarth } from './quiet-earth-content.mjs';
import { pixelRect as pixel, pixelLine } from './pixel-art.mjs';

const SITE = 'morrow:site:relay-nine', TILE = 24;
const durations = Object.freeze({ 'pressure-vent': 2.4, 'service-cart': 3.2, ambush: 3.6, escaped: 1.2 });
const EMPTY = Object.freeze({ events: Object.freeze([]) });
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const vent = Object.freeze({ x: 41 * TILE, y: 70 * TILE + 3, w: 72, h: 29 });
const cart = Object.freeze({ x: 59 * TILE, y: 43 * TILE + 8, w: 57, h: 32, travel: 48 });
const halls = Object.freeze([
  { x: 24 * TILE, y: 70 * TILE, w: 92 * TILE, h: 7 * TILE, direction: -1 },
  { x: 14 * TILE, y: 43 * TILE, w: 102 * TILE, h: 7 * TILE, direction: 1 },
  { x: 14 * TILE, y: 17 * TILE, w: 93 * TILE, h: 7 * TILE, direction: -1 }
]);

/** Network receipts are deduplicated; animations cannot follow the captain outside. */
export function createQuietEarthPresentation() {
  const seen = new Set(), events = [], frame = { events };
  return {
    receive(event, now = 0) {
      if (event?.type !== 'quiet-earth-beat' || !Object.hasOwn(durations, event.beatId) || !Number.isFinite(now)) return false;
      const eventSite = event.siteId || (typeof event.id === 'string' && event.id.startsWith(SITE + ':quiet-earth:') ? SITE : null);
      if (eventSite !== SITE || typeof event.id !== 'string' || seen.has(event.id)) return false;
      seen.add(event.id); while (seen.size > 32) seen.delete(seen.values().next().value);
      events.push({ id: event.id, beatId: event.beatId, siteId: SITE, start: now,
        duration: durations[event.beatId], age: 0 });
      while (events.length > 4) events.shift();
      return true;
    },
    sample(now = 0, { siteId = null } = {}) {
      if (siteId !== SITE || !Number.isFinite(now)) { events.length = 0; return EMPTY; }
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i]; event.age = Math.max(0, now - event.start);
        if (event.age >= event.duration || now < event.start) events.splice(i, 1);
      }
      return events.length ? frame : EMPTY;
    },
    reset() { seen.clear(); events.length = 0; }
  };
}

function eventFor(presentation, id) {
  return presentation?.events?.find(event => event.siteId === SITE && event.beatId === id) || null;
}

function inView(rect, view, margin = 0) {
  return rect.x + rect.w > view.cameraX - margin && rect.x < view.cameraX + view.width + margin &&
    rect.y + rect.h > view.cameraY - margin && rect.y < view.cameraY + view.height + margin;
}

function drawDeepWalls(ctx, surface, view) {
  if (!Array.isArray(surface.tiles)) return;
  // TILE.WALL is 2 in surface.mjs. Importing the renderer here would create a cycle.
  // Preserve a complete boundary tile (including corners); only solid wall interior
  // disappears into shadow. The camera never turns a distant wall into another floor.
  const wall = 2, tiles = surface.tiles;
  const minX = Math.max(0, Math.floor(view.cameraX / TILE)), maxX = Math.min(surface.cols, Math.ceil((view.cameraX + view.width) / TILE));
  const minY = Math.max(0, Math.floor(view.cameraY / TILE)), maxY = Math.min(surface.rows, Math.ceil((view.cameraY + view.height) / TILE));
  const deep = (x, y) => {
    if (tiles[y]?.[x] !== wall) return false;
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx >= 0 && yy >= 0 && xx < surface.cols && yy < surface.rows && tiles[yy]?.[xx] !== wall) return false;
    }
    return true;
  };
  // Merge each visible row into spans instead of issuing a rectangle per wall tile.
  for (let y = minY; y < maxY; y++) {
    let start = -1;
    for (let x = minX; x <= maxX; x++) {
      if (x < maxX && deep(x, y)) { if (start < 0) start = x; }
      else if (start >= 0) { pixel(ctx, '#08141b', start * TILE, y * TILE, (x - start) * TILE, TILE); start = -1; }
    }
  }
}

function drawVent(ctx, opened, event, motion) {
  const { x, y, w, h } = vent;
  const travel = event && motion ? smooth(event.age / .25) : opened ? 1 : 0;
  // The grille physically drops to expose a black pressure duct; it is never a doorway.
  pixel(ctx, '#0b1d23', x - 3, y - 4, w + 6, h + 8);
  pixel(ctx, '#587371', x, y - 4, w, 4);
  pixel(ctx, '#14272d', x + 4, y + 2, w - 8, h - 2);
  pixel(ctx, '#71817d', x + 2, y + Math.round(travel * 22), w - 4, 9);
  for (let i = 0; i < 6; i++) pixel(ctx, '#344b4f', x + 7 + i * 10, y + 2 + Math.round(travel * 22), 6, 4);
  pixel(ctx, opened ? '#c6ad80' : '#91b2a5', x + w - 5, y + h - 2, 3, 3);
  if (opened) {
    pixel(ctx, '#8c9c8c', x + 7, y + h + 8, 11, 3);
    pixel(ctx, '#667e76', x + 23, y + h + 11, 8, 2);
  }
}

function drawCart(ctx, moved, event, motion) {
  const progress = event && motion ? smooth(event.age / 1.15) : moved ? 1 : 0;
  const wobble = event && motion && event.age > 1.15 && event.age < 1.5 ? Math.sin(event.age * 50) * (1.5 - event.age) * 7 : 0;
  const x = cart.x + Math.round(cart.travel * progress + wobble), y = cart.y;
  // Empty wheel tracks remain after the cart has rolled; the change survives a reconnect.
  if (moved || progress > 0) {
    pixel(ctx, '#536963', cart.x + 5, y + 33, Math.max(2, x - cart.x + 6), 1);
    pixel(ctx, '#536963', cart.x + 5, y + 38, Math.max(2, x - cart.x + 6), 1);
  }
  ctx.globalAlpha = .22; pixel(ctx, '#050e15', x + 3, y + 27, 59, 15); ctx.globalAlpha = 1;
  pixel(ctx, '#263d43', x + 4, y + 8, 52, 23);
  pixel(ctx, '#a4b3a2', x + 1, y + 4, 54, 5);
  pixel(ctx, '#789087', x + 5, y + 9, 48, 14);
  pixel(ctx, '#243e44', x + 8, y + 10, 42, 9);
  pixel(ctx, '#c9c4a2', x + 11, y + 11, 8, 4);
  pixel(ctx, '#536e70', x + 54, y - 5, 3, 30);
  pixel(ctx, '#a0b0a2', x + 49, y - 6, 10, 3);
  for (const dx of [10, 43]) {
    pixel(ctx, '#0b1920', x + dx - 2, y + 28, 8, 9);
    pixel(ctx, '#80938a', x + dx, y + 30, 4, 5);
    pixel(ctx, '#243a3c', x + dx + (Math.floor(progress * 12) % 2), y + 32, 3, 1);
  }
  pixel(ctx, '#a1a78c', cart.x + cart.travel + 62, y + 23, 4, 17);
}

function drawLightPools(ctx, view, escaping, powered) {
  for (let row = 0; row < halls.length; row++) {
    const hall = halls[row]; if (!inView(hall, view)) continue;
    const lowPower = row === 1 && !powered;
    for (let offset = 48; offset < hall.w - 80; offset += 288) {
      const x = hall.x + offset;
      if (x + 130 < view.cameraX || x > view.cameraX + view.width) continue;
      ctx.globalAlpha = lowPower ? .045 : escaping ? .055 : .09;
      pixel(ctx, escaping ? '#b99468' : '#b8c5a7', x, hall.y + 10, 92, 110);
      ctx.globalAlpha *= .6;
      pixel(ctx, escaping ? '#b99468' : '#b8c5a7', x - 16, hall.y + 37, 124, 80);
      ctx.globalAlpha = .16;
      pixel(ctx, '#05141d', x + 140, hall.y + 10, 80, 109);
      ctx.globalAlpha = 1;
      // Physical ribs give long passages a rhythm and a scale; the floor route stays open.
      pixel(ctx, '#45625f', x + 131, hall.y + 1, 7, 15);
      pixel(ctx, '#192d35', x + 136, hall.y + 4, 4, 22);
      if (escaping) {
        pixel(ctx, '#201f22', x + 3, hall.y + 2, 12, 6);
        pixel(ctx, '#d1a36c', x + 6, hall.y + 3, 6, 3);
      }
    }
  }
}

function drawAir(ctx, view, scene, event, motion, time) {
  if (event && inView({ x: vent.x - 25, y: vent.y, w: 130, h: 140 }, view) && motion) {
    // Deterministic puffs spread into the hall, then dissipate. No screen-wide flash.
    for (let i = 0; i < 15; i++) {
      const age = event.age - i * .045; if (age < 0 || age > 1.65) continue;
      const spread = Math.sin(i * 2.39) * 26, size = 5 + age * 12;
      ctx.globalAlpha = .22 * (1 - age / 1.65);
      pixel(ctx, '#b7c7ba', vent.x + 34 + spread * age - size / 2, vent.y + 22 + age * 47, size, size * .55);
    }
    ctx.globalAlpha = 1;
  }
  if (motion) for (let i = 0; i < 9; i++) {
    // Low-density dust lives in the world, not in a camera-following particle sheet.
    const x = 24 * TILE + i * 251 + Math.sin(time * .15 + i) * 9;
    const hall = halls[i % 3], y = hall.y + 30 + (i * 31 % 90) + Math.sin(time * .11 + i * 3) * 7;
    if (x < view.cameraX || x > view.cameraX + view.width || y < view.cameraY || y > view.cameraY + view.height) continue;
    ctx.globalAlpha = .14; pixel(ctx, '#bec5ac', x, y, 2, 1);
  }
  ctx.globalAlpha = 1;
  const powerEvent = scene.powerEvent;
  if (powerEvent && motion) {
    // One failing bank travels across the receiver room. Green evacuation markers never go out.
    const phase = clamp(powerEvent.age / 1.4), x = 108 * TILE, y = 7 * TILE;
    if (inView({ x, y, w: 16 * TILE, h: 25 * TILE }, view)) {
      ctx.globalAlpha = .18 * Math.sin(clamp(powerEvent.age / 3.6) * Math.PI);
      pixel(ctx, '#06131d', x, y, 16 * TILE * phase, 12 * TILE); ctx.globalAlpha = 1;
      for (let i = 0; i < 5; i++) if (phase > i / 5) pixel(ctx, '#b69569', x + 32 + i * 60, y + 4, 7, 3);
    }
  }
}

/** Draw with the caller's world transform, before fog and labels; no authority mutation. */
export function drawQuietEarthPresentation(ctx, surface, options = {}) {
  if (!isQuietEarth(surface?.site) && !(surface?.quietEarth && surface.id === SITE)) return;
  const exploration = options.exploration || {}, cues = exploration.quietEarth?.cues || [];
  const presentation = options.presentation || EMPTY, choices = exploration.choices || {};
  const motion = options.reduceMotion !== true, escaping = choices.receiver === 'copy' && choices.evacuate !== 'seal';
  const ventEvent = eventFor(presentation, 'pressure-vent'), cartEvent = eventFor(presentation, 'service-cart');
  const view = { cameraX: options.cameraX || 0, cameraY: options.cameraY || 0,
    width: options.width || ctx.canvas?.width || 480, height: options.height || ctx.canvas?.height || 320 };
  ctx.save();
  if (options.layer === 'floor') {
    drawDeepWalls(ctx, surface, view);
    drawLightPools(ctx, view, escaping, choices.breaker === 'restore');
    if (inView(vent, view, 32)) drawVent(ctx, cues.includes('pressure-vent') || !!ventEvent, ventEvent, motion);
    if (inView({ ...cart, w: cart.w + cart.travel }, view, 24)) drawCart(ctx, cues.includes('service-cart') || !!cartEvent, cartEvent, motion);
  } else if (options.layer === 'air') {
    // A dropped mug, a still-wet ring and one chair pulled away: ordinary work interrupted.
    const tableX = 17 * TILE, tableY = 31 * TILE;
    if (inView({ x: tableX, y: tableY, w: 120, h: 100 }, view)) {
      pixel(ctx, '#b9bda1', tableX + 21, tableY + 10, 7, 7);
      pixel(ctx, '#384b48', tableX + 23, tableY + 11, 3, 4);
      pixel(ctx, '#b9bda1', tableX + 27, tableY + 12, 3, 3);
      pixelLine(ctx, tableX + 39, tableY + 73, tableX + 51, tableY + 78, '#b9bda1', 2);
      pixel(ctx, '#263f40', tableX + 49, tableY + 79, 10, 3);
      pixel(ctx, '#9d997c', tableX + 45, tableY + 74, 5, 5);
    }
    drawAir(ctx, view, { powerEvent: eventFor(presentation, 'ambush') }, ventEvent, motion, options.time || 0);
  }
  ctx.restore();
}
