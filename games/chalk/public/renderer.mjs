import { hasLineOfSight } from './sim.mjs';
import { traceAim } from './desktop-input.mjs';

const TAU = Math.PI * 2;
const COLORS = {
  sand: '#817359', road: '#55534a', ally: '#84c7b6', player: '#c4efda',
  enemy: '#db735b', objective: '#e9b969', civilian: '#c5c4dc', ink: '#151d1b'
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function hash(n) { n = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return n - Math.floor(n); }
function colorPick(list, n) { return list[Math.floor(hash(n) * list.length)]; }
function circle(ctx, x, y, radius, fill, stroke, line = 1) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, radius), 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function newCanvas(width, height) {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width; canvas.height = height; return canvas;
}

function insideBuilding(building, point) {
  return point && point.x >= building.x && point.x <= building.x + (building.w ?? building.width) &&
    point.y >= building.y && point.y <= building.y + (building.h ?? building.height);
}

/** Roof removal is a viewing aid, never a source of enemy visibility. */
export function houseRevealed(building, state, view = {}) {
  if (!building.enterable || view.menu) return false;
  const squad = state.squad || [];
  // Keep a separated teammate, including someone waiting for aid, readable.
  if (squad.some(actor => (actor.alive !== false || actor.downed) && insideBuilding(building, actor))) return true;
  if ((state.survivors || []).some(actor => actor.stabilized && actor.alive !== false && insideBuilding(building, actor))) return true;
  const player = squad.find(actor => view.followActorId && actor.id === view.followActorId) || squad.find(actor => actor.id === state.playerId) || squad[0];
  if (!player) return false;
  // Approach through the actual opening. Walking alongside a solid wall does
  // not expose its rooms, and hostile/civilian occupants cannot lift a roof.
  return (building.doors || []).some(door => {
    const vertical = door.side === 'east' || door.side === 'west';
    const normal = vertical ? player.x - door.x : player.y - door.y;
    const outward = normal * (door.side === 'south' || door.side === 'east' ? 1 : -1);
    const across = vertical ? player.y - door.y : player.x - door.x;
    return outward >= -12 && outward <= 72 && Math.abs(across) <= Math.max(12, door.width / 2 - 5);
  });
}

/** Draws the battlefield at native map resolution once, then composites dynamic units. */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = Math.max(1, canvas.clientWidth || 960);
    this.height = Math.max(1, canvas.clientHeight || 640);
    this.dpr = 1;
    this.camera = { x: 1200, y: 950, zoom: 1 };
    this.mapCache = null;
    this.mapIdentity = null;
    this.houseCutaways = [];
    this.lastHouseTime = null;
    this.lastPlayerId = null;
    this.lastRender = 0;
    this.cameraReady = false;
    this.visibleEnemies = [];
    this.actorBuffer = [];
    this.sprites = new Map();
    this.atmosphereCache = null;
    this.dust = Array.from({length:32}, (_, i) => ({x:hash(i+2), y:hash(i+23), speed:4+hash(i+99)*8, alpha:.07+hash(i+35)*.08, size:1+hash(i+56)*2, phase:i}));
    this.resize(this.width, this.height, globalThis.devicePixelRatio || 1);
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.dpr = clamp(finite(dpr, 1) || 1, .5, 2);
    const bw = Math.round(this.width * this.dpr), bh = Math.round(this.height * this.dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw; this.canvas.height = bh;
    }
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'low';
  }

  screenToWorld(x, y) {
    return { x: (x - this.width / 2) / this.camera.zoom + this.camera.x, y: (y - this.height / 2) / this.camera.zoom + this.camera.y };
  }

  worldToScreen(x, y) {
    return { x: (x - this.camera.x) * this.camera.zoom + this.width / 2, y: (y - this.camera.y) * this.camera.zoom + this.height / 2 };
  }

  inView(x, y, padding = 100) {
    const p = this.worldToScreen(x, y);
    return p.x >= -padding && p.y >= -padding && p.x <= this.width + padding && p.y <= this.height + padding;
  }

  playableRect(view = {}) {
    if (!view.touch) return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height, cx: this.width / 2, cy: this.height / 2 };
    const insets = view.safeInsets || {};
    const portrait = this.height > this.width;
    const left = clamp(finite(insets.left, 12), 0, Math.max(0, this.width - 180));
    const right = this.width - clamp(finite(insets.right, 12), 0, Math.max(0, this.width - left - 180));
    const top = clamp(finite(insets.top, portrait ? 140 : 96), 0, Math.max(0, this.height - 96));
    const bottom = this.height - clamp(finite(insets.bottom, portrait ? 180 : 130), 0, Math.max(0, this.height - top - 96));
    return { left, top, right, bottom, width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  markerBounds(view) {
    if (view.touch) {
      const r = this.safeRect || this.playableRect(view);
      return { left: r.left + 25, right: r.right - 25, top: r.top + 23, bottom: r.bottom - 35, cx: r.cx, cy: (r.top + r.bottom - 12) / 2 };
    }
    const top = this.width < 600 ? 130 : 100;
    return { left: 44, right: this.width - 44, top, bottom: Math.max(top + 35, this.height - 125), cx: this.width / 2, cy: (top + Math.max(top + 35, this.height - 125)) / 2 };
  }

  edgePoint(point, bounds) {
    const dx = point.x - bounds.cx, dy = point.y - bounds.cy;
    const tx = (dx < 0 ? bounds.cx - bounds.left : bounds.right - bounds.cx) / Math.max(.001, Math.abs(dx));
    const ty = (dy < 0 ? bounds.cy - bounds.top : bounds.bottom - bounds.cy) / Math.max(.001, Math.abs(dy));
    const scale = Math.max(0, Math.min(tx, ty));
    return { x: clamp(bounds.cx + dx * scale, bounds.left, bounds.right), y: clamp(bounds.cy + dy * scale, bounds.top, bounds.bottom) };
  }

  radialSprite(key, stops, inner = 0) {
    if (this.sprites.has(key)) return this.sprites.get(key);
    const size = 128, sprite = newCanvas(size, size), ctx = sprite.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
    this.sprites.set(key, sprite); return sprite;
  }

  smokeSprite() {
    if (this.sprites.has('smoke')) return this.sprites.get('smoke');
    const sprite = newCanvas(256, 256), ctx = sprite.getContext('2d');
    // Bake the seven overlapping puffs as a single texture. Rotation keeps the
    // same slow drift without seven newly rasterized radial gradients per frame.
    ctx.globalAlpha = .75;
    for (let i = 0; i < 7; i++) {
      const x = 128 + Math.cos(i * 2.4) * 33, y = 128 + Math.sin(i * 2.4) * 33;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 80);
      gradient.addColorStop(0, 'rgba(171,170,151,.55)'); gradient.addColorStop(.5, 'rgba(156,158,145,.35)'); gradient.addColorStop(1, 'rgba(145,150,139,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x - 80, y - 80, 160, 160);
    }
    this.sprites.set('smoke', sprite); return sprite;
  }

  atmosphereSprites() {
    const key = `${this.width}:${this.height}`;
    if (this.atmosphereCache?.key === key) return this.atmosphereCache;
    const ratio = Math.min(1, 512 / Math.max(this.width, this.height));
    const w = Math.max(1, Math.round(this.width * ratio)), h = Math.max(1, Math.round(this.height * ratio));
    const make = (inner, outer, color) => {
      const sprite = newCanvas(w, h), ctx = sprite.getContext('2d');
      const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w,h) * inner, w / 2, h / 2, Math.hypot(w,h) * outer);
      gradient.addColorStop(0, `rgba(${color},0)`); gradient.addColorStop(1, `rgba(${color},1)`);
      ctx.fillStyle = gradient; ctx.fillRect(0,0,w,h); return sprite;
    };
    this.atmosphereCache = {key, vignette:make(.3,.57,'11,20,16'), damage:make(.25,.6,'102,47,28')};
    return this.atmosphereCache;
  }

  makeMap(world, missionIndex) {
    const w = finite(world.width, 2400), h = finite(world.height, 1900);
    const cache = newCanvas(w, h), ctx = cache.getContext('2d', {alpha:false});
    ctx.fillStyle = COLORS.sand; ctx.fillRect(0, 0, w, h);
    // Large faded patches break the uniform ground without a noisy per-frame filter.
    for (let i = 0; i < 220; i++) {
      const x = hash(i * 4 + 5) * w, y = hash(i * 4 + 6) * h;
      ctx.fillStyle = i % 3 ? 'rgba(209,184,135,.045)' : 'rgba(45,42,33,.035)';
      ctx.beginPath(); ctx.ellipse(x, y, 20 + hash(i) * 130, 8 + hash(i + 1) * 50, hash(i + 3) * TAU, 0, TAU); ctx.fill();
    }
    for (const road of world.roads || []) this.drawRoad(ctx, road);
    // Dust, grit and old tire marks are all baked into the ground layer.
    for (let i = 0; i < 7800; i++) {
      const x = hash(i + 44) * w, y = hash(i + 155) * h;
      ctx.fillStyle = i % 2 ? 'rgba(24,26,20,.12)' : 'rgba(238,212,163,.12)';
      ctx.fillRect(x, y, 1 + hash(i + 9) * 2.4, .6 + hash(i + 21) * 1.5);
    }
    for (const building of world.buildings || []) this.drawBuildingShadow(ctx, building);
    for (const prop of world.props || []) {
      if (!this.isDynamicProp(prop)) this.drawProp(ctx, prop, 0, false);
    }
    this.houseCutaways.length = 0;
    this.lastHouseTime = null;
    for (const building of world.buildings || []) {
      this.drawBuilding(ctx, building);
      if (!building.enterable) continue;
      this.drawDoorways(ctx, building);
      // Closed roofs remain part of the single district texture. Only these
      // small, opaque room patches need compositing when a house opens.
      const patch = newCanvas(Math.ceil(building.w), Math.ceil(building.h));
      const roomCtx = patch.getContext('2d', {alpha:false});
      roomCtx.translate(-building.x, -building.y);
      this.drawInterior(roomCtx, building);
      this.houseCutaways.push({building, canvas:patch, amount:0});
    }
    // Uneven edge establishes the playable district without a bright game-board border.
    ctx.strokeStyle = 'rgba(35,34,27,.55)'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, w, h);
    this.mapCache = cache; this.mapIdentity = world; this.mapMission = missionIndex;
  }

  drawRoad(ctx, road) {
    const { x, y } = road, w = road.w ?? road.width ?? 100, h = road.h ?? road.height ?? 100;
    ctx.fillStyle = '#6c6655'; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
    ctx.fillStyle = '#56564e'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(219,195,145,.12)';
    if (w > h) {
      ctx.fillRect(x, y, w, 8); ctx.fillRect(x, y + h - 8, w, 8);
      line(ctx, x, y + 16, x + w, y + 16, 'rgba(32,33,29,.16)', 5);
      line(ctx, x, y + h - 16, x + w, y + h - 16, 'rgba(32,33,29,.16)', 5);
      for (let k = 28; k < w; k += 90) { ctx.fillStyle = 'rgba(212,195,153,.12)'; ctx.fillRect(x + k, y + h / 2 - 1, 32, 2); }
    } else {
      ctx.fillRect(x, y, 8, h); ctx.fillRect(x + w - 8, y, 8, h);
      line(ctx, x + 16, y, x + 16, y + h, 'rgba(32,33,29,.16)', 5);
      line(ctx, x + w - 16, y, x + w - 16, y + h, 'rgba(32,33,29,.16)', 5);
      for (let k = 28; k < h; k += 90) { ctx.fillStyle = 'rgba(212,195,153,.12)'; ctx.fillRect(x + w / 2 - 1, y + k, 2, 32); }
    }
    for (let i = 0; i < 15; i++) {
      const seed = x * .2 + y * .3 + i * 32;
      const px = x + hash(seed) * w, py = y + hash(seed + 1) * h;
      ctx.strokeStyle = 'rgba(28,31,26,.14)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + hash(seed + 3) * 25 - 12, py + 10); ctx.lineTo(px - 6, py + 21); ctx.stroke();
    }
  }

  drawBuildingShadow(ctx, b) {
    const w = b.w ?? b.width, h = b.h ?? b.height;
    if (!w || !h) return;
    ctx.fillStyle = 'rgba(29,30,25,.32)';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + w, b.y); ctx.lineTo(b.x + w + 18, b.y + 27);
    ctx.lineTo(b.x + w + 18, b.y + h + 27); ctx.lineTo(b.x + 18, b.y + h + 27); ctx.lineTo(b.x, b.y + h); ctx.closePath(); ctx.fill();
  }

  drawBuilding(ctx, b) {
    const { x, y } = b, w = b.w ?? b.width, h = b.h ?? b.height;
    if (!w || !h) return;
    const seed = x * 1.32 + y * 2.71 + finite(b.tone) * 13;
    const concrete = b.color || colorPick(['#a29579', '#b09c79', '#958772', '#b5a284', '#a3977d', '#9b8d70'], seed);
    ctx.fillStyle = '#4c4c3e'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = concrete; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = 'rgba(233,216,174,.22)'; ctx.fillRect(x + 3, y + 3, w - 6, 4); ctx.fillRect(x + 3, y + 7, 3, h - 10);
    ctx.fillStyle = 'rgba(48,46,34,.28)'; ctx.fillRect(x + 7, y + h - 9, w - 10, 6); ctx.fillRect(x + w - 8, y + 7, 5, h - 12);
    // Concrete slabs and weather stains.
    for (let i = 1; i < Math.ceil(w / 58); i++) line(ctx, x + i * 58, y + 9, x + i * 58, y + h - 10, 'rgba(67,61,47,.09)');
    for (let i = 1; i < Math.ceil(h / 63); i++) line(ctx, x + 9, y + i * 63, x + w - 10, y + i * 63, 'rgba(67,61,47,.055)');
    for (let i = 0; i < 18; i++) {
      const px = x + 8 + hash(seed + i * 7) * Math.max(1, w - 20), py = y + 9 + hash(seed + i * 7 + 1) * Math.max(1, h - 20);
      ctx.fillStyle = 'rgba(59,53,39,.09)'; ctx.fillRect(px, py, 3 + hash(seed + i * 8) * 14, 2);
    }
    if (w > 70 && h > 55) {
      // Roof access shed with a deep doorway and a separate shadow.
      const sx = x + w - 38, sy = y + 15;
      ctx.fillStyle = 'rgba(32,33,26,.24)'; ctx.fillRect(sx + 5, sy + 7, 25, 30);
      ctx.fillStyle = '#777565'; ctx.fillRect(sx, sy, 25, 29);
      ctx.fillStyle = '#aaa28a'; ctx.fillRect(sx, sy, 25, 5);
      ctx.fillStyle = '#343c33'; ctx.fillRect(sx + 8, sy + 22, 10, 7);
      if (hash(seed) > .27) {
        const tx = x + 25, ty = y + h - 28;
        circle(ctx, tx + 6, ty + 7, 13, 'rgba(35,36,29,.24)');
        circle(ctx, tx, ty, 12, '#64695e', '#4f554c', 2);
        circle(ctx, tx - 3, ty - 3, 6, '#8b8d76');
        ctx.fillStyle = '#555b4f'; ctx.fillRect(tx - 4, ty - 13, 8, 4);
      }
      if (w > 110 && h > 85) {
        const ax = x + w * .5 - 14, ay = y + h * .45 - 10;
        ctx.fillStyle = 'rgba(35,36,29,.22)'; ctx.fillRect(ax + 5, ay + 7, 29, 22);
        ctx.fillStyle = '#6e7569'; ctx.fillRect(ax, ay, 27, 21);
        for (let k = 4; k < 24; k += 5) line(ctx, ax + k, ay + 3, ax + k, ay + 18, '#a0a393', 2);
      }
      if (hash(seed + 22) > .55) {
        const dx = x + w * .6, dy = y + h - 18;
        line(ctx, dx, dy + 6, dx, dy - 11, '#454a40', 2);
        ctx.save(); ctx.translate(dx, dy - 7); ctx.rotate(-.65); ctx.fillStyle = '#c1bfa1'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    if (hash(seed + 2) > .62 && w > 60) {
      // Canvas shade along a street-facing wall.
      const aw = Math.min(w - 12, 65), ax = x + 6, ay = y + h;
      ctx.fillStyle = 'rgba(31,33,29,.2)'; ctx.fillRect(ax + 5, ay + 3, aw, 16);
      ctx.fillStyle = colorPick(['#6b7f72', '#aa7453', '#8e8059', '#9b9a7b'], seed + 8); ctx.fillRect(ax, ay - 2, aw, 13);
      for (let k = 0; k < aw; k += 13) { ctx.fillStyle = 'rgba(234,224,181,.16)'; ctx.fillRect(ax + k, ay - 2, 5, 13); }
      line(ctx, ax, ay + 11, ax + aw, ay + 11, '#494e41', 2);
    }
    // Small air vents, roof masonry chips and occasional repaired corner.
    ctx.fillStyle = '#605f50'; ctx.fillRect(x + 10, y + 12, 12, 5);
    if (hash(seed + 4) > .72) {
      ctx.fillStyle = '#7b725d'; ctx.beginPath(); ctx.moveTo(x + w, y + h - 25); ctx.lineTo(x + w - 14, y + h - 18); ctx.lineTo(x + w - 23, y + h); ctx.lineTo(x + w, y + h); ctx.fill();
      for (let k = 0; k < 5; k++) { ctx.fillStyle = '#8d846b'; ctx.fillRect(x + w + hash(seed + k) * 13, y + h + hash(seed + k + 6) * 10, 4, 3); }
    }
  }

  drawDoorways(ctx, building) {
    const thickness = finite(building.wallThickness, 10);
    for (const door of building.doors || []) {
      ctx.save(); ctx.translate(door.x, door.y);
      if (door.side === 'north') ctx.rotate(Math.PI);
      else if (door.side === 'east') ctx.rotate(-Math.PI / 2);
      else if (door.side === 'west') ctx.rotate(Math.PI / 2);
      const half = door.width / 2;
      // A recessed opening, worn step and masonry jambs read as part of the
      // street, including at a small phone zoom. No floating entrance icon.
      ctx.fillStyle = '#323d33'; ctx.fillRect(-half, -thickness - 6, door.width, thickness + 7);
      ctx.fillStyle = '#a59b7c'; ctx.fillRect(-half - 1, 1, door.width + 2, 8);
      ctx.fillStyle = '#b7ad8c'; ctx.fillRect(-half + 5, 1, door.width - 10, 2);
      ctx.fillStyle = 'rgba(55,53,40,.35)'; ctx.fillRect(-half - 3, 9, door.width + 6, 3);
      ctx.fillStyle = '#b6aa8a'; ctx.fillRect(-half - 4, -thickness, 5, thickness + 12); ctx.fillRect(half - 1, -thickness, 5, thickness + 12);
      // Open timber leaves fold back beside the passage rather than crossing it.
      ctx.fillStyle = '#5c6451'; ctx.fillRect(-half - 7, -thickness - 14, 4, 23);
      line(ctx, -half - 5, -thickness - 12, -half - 5, 5, '#8b8f6f', 1);
      ctx.restore();
    }
  }

  drawInterior(ctx, building) {
    const {x, y, w, h} = building, seed = x * 1.32 + y * 2.71;
    ctx.fillStyle = '#777762'; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < (building.rooms || [building.interior]).length; i++) {
      const room = (building.rooms || [building.interior])[i];
      if (!room) continue;
      ctx.fillStyle = colorPick(['#767862', '#827d65', '#777a68', '#837a64'], seed + i * 11);
      ctx.fillRect(room.x, room.y, room.w, room.h);
      // Worn cement tiles and low-contrast dirt are baked once, not sampled
      // from noise on every frame. Their scale survives the wider mobile view.
      for (let xx = room.x + 30; xx < room.x + room.w; xx += 30) line(ctx, xx, room.y, xx, room.y + room.h, 'rgba(40,47,36,.13)');
      for (let yy = room.y + 30; yy < room.y + room.h; yy += 30) line(ctx, room.x, yy, room.x + room.w, yy, 'rgba(40,47,36,.13)');
      ctx.strokeStyle = 'rgba(36,44,34,.22)'; ctx.lineWidth = 7; ctx.strokeRect(room.x + 3, room.y + 3, room.w - 6, room.h - 6);
    }
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(37,43,32,.09)' : 'rgba(204,196,155,.12)';
      ctx.fillRect(x + 12 + hash(seed + i * 7) * (w - 25), y + 12 + hash(seed + i * 7 + 1) * (h - 25), 2 + hash(seed + i) * 7, 1.5);
    }
    for (const furniture of building.furniture || []) this.drawFurnishing(ctx, furniture);
    for (const wall of building.walls || []) {
      ctx.fillStyle = 'rgba(30,37,29,.32)'; ctx.fillRect(wall.x + 3, wall.y + 5, wall.w, wall.h);
    }
    for (const wall of building.walls || []) {
      ctx.fillStyle = '#484f40'; ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = wall.kind === 'partition' ? '#b5aa87' : '#bcb08e'; ctx.fillRect(wall.x + 1, wall.y + 1, Math.max(1, wall.w - 2), Math.max(1, wall.h - 3));
      ctx.fillStyle = '#d0c3a0'; ctx.fillRect(wall.x + 1, wall.y + 1, Math.max(1, wall.w - 2), 2);
    }
    // The same geometry supplies the exterior steps and the now-open sill.
    for (const door of building.doors || []) {
      const t = finite(building.wallThickness, 10);
      ctx.fillStyle = '#9d9476';
      if (door.side === 'north' || door.side === 'south') ctx.fillRect(door.x - door.width / 2, door.y - (door.side === 'south' ? t : 0), door.width, t);
      else ctx.fillRect(door.x - (door.side === 'east' ? t : 0), door.y - door.width / 2, t, door.width);
    }
  }

  drawFurnishing(ctx, item) {
    const {x, y, w, h} = item, seed = x + y + finite(item.tone) * 100;
    if (item.type === 'mat' || item.type === 'rug') {
      ctx.fillStyle = 'rgba(28,34,27,.2)'; ctx.fillRect(x + 2, y + 3, w, h);
      ctx.fillStyle = colorPick(['#976b4e', '#727d62', '#a08c61', '#6c8073'], seed); ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#b3a079'; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      for (let yy = y + 7; yy < y + h - 4; yy += 5) line(ctx, x + 5, yy, x + w - 5, yy, 'rgba(225,207,157,.13)');
      // Rolled bedding makes these homes feel occupied without filling the
      // navigable central lane with furniture that has no collision body.
      ctx.fillStyle = '#a7a78a'; ctx.fillRect(x + 5, y + 5, Math.max(7, w - 10), 7);
      line(ctx, x + 6, y + 11, x + w - 6, y + 11, '#646f58', 2);
    } else {
      ctx.fillStyle = 'rgba(25,34,26,.35)'; ctx.fillRect(x - 3, y + 3, w + 3, h);
      ctx.fillStyle = '#554f3b'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#8c8260'; ctx.fillRect(x + 1, y + 1, w - 2, h - 3);
      for (let yy = y + 9; yy < y + h - 2; yy += 10) line(ctx, x + 1, yy, x + w - 1, yy, '#555b44', 1.5);
      ctx.fillStyle = '#b9ac82'; ctx.fillRect(x + 2, y + 3, Math.max(2, w - 4), 4);
      if (h > 25) { ctx.fillStyle = '#647d70'; ctx.fillRect(x + 2, y + h - 11, Math.max(2, w - 4), 6); }
    }
  }

  updateHouseCutaways(state, view, time) {
    const delta = this.lastHouseTime === null ? 1 / 60 : clamp(time - this.lastHouseTime, 0, .08);
    this.lastHouseTime = time;
    for (const house of this.houseCutaways) {
      const target = houseRevealed(house.building, state, view) ? 1 : 0;
      house.amount = view.reducedMotion ? target : target ? Math.min(1, house.amount + delta / .18) : Math.max(0, house.amount - delta / .22);
    }
  }

  houseVisibility(point, view = {}) {
    if (view.showMap) return 1;
    for (const house of this.houseCutaways) if (insideBuilding(house.building, point)) return view.menu ? 0 : house.amount;
    return 1;
  }

  drawHouseCutaways(ctx, view, bounds) {
    if (view.menu) return;
    for (const house of this.houseCutaways) {
      const b = house.building, alpha = view.showMap ? 1 : house.amount;
      if (alpha <= 0 || b.x > bounds.right || b.x + b.w < bounds.left || b.y > bounds.bottom || b.y + b.h < bounds.top) continue;
      ctx.globalAlpha = alpha; ctx.drawImage(house.canvas, b.x, b.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;
  }

  isDynamicProp(p) { return ['crash', 'helicopter', 'barricade', 'barrier', 'fire', 'checkpoint'].includes(p.type); }

  drawProp(ctx, p, time = 0, dynamic = true) {
    if (p.cleared || p.removed || p.active === false && p.type === 'barricade') return;
    const x = finite(p.x), y = finite(p.y), w = finite(p.w, 30), h = finite(p.h, 20), type = p.type || p.kind || 'rubble';
    ctx.save(); ctx.translate(x, y); ctx.rotate(finite(p.angle));
    if (type === 'stadium') {
      ctx.fillStyle = '#56604a'; ctx.fillRect(0, 0, w, h);
      roundRect(ctx, 12, 11, w - 24, h - 22, 35, '#9b8968', '#71664c');
      roundRect(ctx, 23, 19, w - 46, h - 38, 27, '#767d58', '#c5b48c');
      for (let i = 0; i < 4; i++) {
        line(ctx, 17, 5 + i * 3, w - 17, 5 + i * 3, '#8b9277', 1);
        line(ctx, 17, h - 5 - i * 3, w - 17, h - 5 - i * 3, '#8b9277', 1);
      }
      ctx.strokeStyle = 'rgba(227,225,191,.5)'; ctx.lineWidth = 1; ctx.strokeRect(41, 27, w - 82, h - 54);
      line(ctx, w / 2, 27, w / 2, h - 27, 'rgba(227,225,191,.5)'); circle(ctx, w / 2, h / 2, 12, null, 'rgba(227,225,191,.5)');
      // Aid tents beside the stand identify the final safe area without adding signage to combat streets.
      ctx.fillStyle = '#bdb99a'; ctx.fillRect(-53, h - 36, 43, 32); ctx.fillRect(-53, h - 79, 43, 32);
      line(ctx, -31, h - 36, -31, h - 4, '#777b62', 2); line(ctx, -31, h - 79, -31, h - 47, '#777b62', 2);
      ctx.fillStyle = '#5c7058'; ctx.fillRect(-40, h - 25, 16, 6); ctx.fillRect(-35, h - 30, 6, 16);
    } else if (type === 'car' || type === 'wreck' || type === 'wrecked-car') {
      ctx.fillStyle = 'rgba(25,28,23,.3)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 7, w, h);
      for (const yy of [-h / 2 - 2, h / 2 - 2]) { ctx.fillStyle = '#252c26'; ctx.fillRect(-w / 2 + 6, yy, 9, 4); ctx.fillRect(w / 2 - 15, yy, 9, 4); }
      roundRect(ctx, -w / 2, -h / 2, w, h, 3, colorPick(['#7d8a7d', '#b4a583', '#896d56', '#84857b'], x + y), '#494d40');
      ctx.fillStyle = '#414d49'; ctx.fillRect(-w * .12, -h / 2 + 3, w * .23, h - 6);
      ctx.fillStyle = 'rgba(213,203,163,.21)'; ctx.fillRect(w / 2 - 10, -h / 2 + 3, 6, h - 6);
      if (type !== 'car') { line(ctx, -w / 2, -h / 2, w / 3, h / 3, '#4a4536', 3); circle(ctx, -w * .3, 0, h * .48, 'rgba(29,30,24,.65)'); }
    } else if (type === 'tree' || type === 'palm') {
      ctx.save(); ctx.translate(8, 10); this.drawPalm(ctx, .4, '#3c4530'); ctx.restore();
      this.drawPalm(ctx, .9, '#63714a');
      circle(ctx, 0, 0, 4, '#7f7850');
    } else if (type === 'market' || type === 'stall') {
      ctx.fillStyle = 'rgba(25,29,23,.23)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
      ctx.fillStyle = '#6d5f41'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = colorPick(['#a9895e', '#738975', '#ad7758'], x * 3 + y); ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
      for (let i = -w / 2; i < w / 2; i += 11) { ctx.fillStyle = 'rgba(245,222,171,.15)'; ctx.fillRect(i, -h / 2 - 2, 5, h + 4); }
      line(ctx, -w / 2, 0, w / 2, 0, 'rgba(42,44,32,.3)');
    } else if (type === 'sandbag' || type === 'sandbags' || type === 'barricade' || type === 'barrier') {
      ctx.fillStyle = 'rgba(26,29,24,.28)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
      for (let i = -w / 2; i < w / 2; i += 13) {
        roundRect(ctx, i, -h / 2, Math.min(14, w / 2 - i), h, 4, type.startsWith('barr') ? '#8a7150' : '#9c9270', '#655f47');
        line(ctx, i + 5, -h / 2 + 2, i + 4, h / 2 - 2, 'rgba(204,191,144,.3)');
      }
      if (type === 'barricade' && dynamic) {
        ctx.strokeStyle = 'rgba(233,185,105,.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10); ctx.setLineDash([]);
      }
    } else if (type === 'crate' || type === 'supply') {
      ctx.fillStyle = 'rgba(26,29,24,.25)'; ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
      ctx.fillStyle = '#827858'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#b0a47c'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
      line(ctx, -w / 2 + 2, -h / 2 + 2, w / 2 - 2, h / 2 - 2, '#5a5941', 2);
    } else if (type === 'crash' || type === 'helicopter') {
      this.drawHelicopter(ctx, 0, 0, 0, false, time);
    } else if (type === 'fire') {
      this.drawFire(ctx, 0, 0, time, 18);
    } else if (type === 'lamp') {
      circle(ctx, 0, 0, 4, '#484f42'); line(ctx, 0, 0, -6, -8, '#40493d', 3); circle(ctx, -6, -8, 3, '#d9c58e');
    } else {
      for (let i = 0; i < 7; i++) {
        const dx = (hash(x + y + i) - .5) * w, dy = (hash(x - y + i + 77) - .5) * h;
        ctx.save(); ctx.translate(dx, dy); ctx.rotate(hash(i + x) * TAU);
        ctx.fillStyle = '#555644'; ctx.fillRect(-3 + 2, -3 + 3, 7, 5);
        ctx.fillStyle = colorPick(['#a4997a', '#8e866a', '#b3a58a'], i + x); ctx.fillRect(-3, -3, 7, 5); ctx.restore();
      }
    }
    ctx.restore();
  }

  drawPalm(ctx, alpha, color) {
    ctx.save(); ctx.globalAlpha *= alpha;
    for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i * TAU / 7 + .25); ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -12, 30, -3); ctx.quadraticCurveTo(15, -1, 0, 0); ctx.fill();
      line(ctx, 3, -2, 28, -3, '#79835b', .7); ctx.restore();
    }
    ctx.restore();
  }

  drawHelicopter(ctx, x, y, angle = 0, flying = false, time = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    if (!flying) {
      ctx.fillStyle = 'rgba(27,28,23,.65)'; ctx.beginPath(); ctx.ellipse(0, 0, 76, 45, -.2, 0, TAU); ctx.fill();
      for (let i = 0; i < 19; i++) { const a = hash(i + 6) * TAU, r = 22 + hash(i + 17) * 61; ctx.fillStyle = i % 2 ? '#4d5144' : '#79715b'; ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * .55, 5 + hash(i) * 8, 4); }
    }
    ctx.fillStyle = flying ? '#3d4940' : '#424b3e';
    ctx.beginPath(); ctx.moveTo(-45, -7); ctx.lineTo(-8, -14); ctx.lineTo(20, -13); ctx.quadraticCurveTo(42, -12, 43, 0); ctx.quadraticCurveTo(42, 14, 20, 14); ctx.lineTo(-8, 14); ctx.lineTo(-45, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#73806a'; ctx.fillRect(-13, -12, 33, 24);
    ctx.fillStyle = '#283831'; ctx.beginPath(); ctx.moveTo(23, -10); ctx.lineTo(33, -8); ctx.lineTo(38, 0); ctx.lineTo(23, 0); ctx.fill(); ctx.fillRect(23, 3, 12, 7);
    ctx.fillStyle = '#38463a'; ctx.fillRect(-79, -4, 45, 8);
    ctx.fillStyle = '#56624e'; ctx.fillRect(-78, -17, 10, 34);
    line(ctx, -22, -20, 25, -20, '#262e27', 3); line(ctx, -22, 20, 25, 20, '#262e27', 3);
    for (const yy of [-20, 20]) { line(ctx, -10, yy, -6, Math.sign(yy) * 12, '#3d4839', 3); line(ctx, 18, yy, 14, Math.sign(yy) * 12, '#3d4839', 3); }
    ctx.save(); ctx.rotate(flying ? time * 22 : -.42);
    if (flying) { circle(ctx, 0, 0, 64, 'rgba(51,60,48,.13)'); ctx.globalAlpha = .6; }
    ctx.fillStyle = '#2b362e'; ctx.fillRect(-64, -3, 128, 6); ctx.fillRect(-3, -64, 6, flying ? 128 : 109); ctx.restore();
    circle(ctx, 0, 0, 6, '#8a8c70', '#3e493b', 2);
    if (!flying) { circle(ctx, -20, 0, 16, 'rgba(21,26,20,.7)'); this.drawFire(ctx, -21, -3, time, 13); }
    ctx.restore();
  }

  drawFire(ctx, x, y, time, size) {
    const pulse = .8 + Math.sin(time * 16 + x) * .12;
    const glow = this.radialSprite('fire', [[0,'rgba(235,145,57,.38)'], [1,'rgba(214,97,31,0)']]);
    ctx.drawImage(glow, x - size * 2.3, y - size * 2.3, size * 4.6, size * 4.6);
    for (let i = 0; i < 5; i++) {
      const dx = Math.sin(time * 7 + i * 3) * size * .35, dy = Math.cos(time * 9 + i * 2) * size * .3;
      circle(ctx, x + dx, y + dy, size * (.55 - i * .075) * pulse, ['#9d542e', '#cc7534', '#e29c47', '#ecc372', '#f4dda1'][i]);
    }
  }

  drawVehicle(ctx, v, time) {
    if (v.kind === 'helicopter' || v.kind === 'crash') { this.drawHelicopter(ctx, v.x, v.y, finite(v.angle), false, time); return; }
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(finite(v.angle));
    const w = finite(v.w, 64), h = finite(v.h, 34), apc = v.kind === 'apc';
    ctx.fillStyle = 'rgba(19,26,21,.37)'; ctx.fillRect(-w / 2 + 7, -h / 2 + 8, w, h);
    for (const yy of [-h / 2 - 4, h / 2 - 1]) {
      ctx.fillStyle = '#262d27'; ctx.fillRect(-w / 2 + 7, yy, apc ? w - 14 : 13, 6);
      if (!apc) ctx.fillRect(w / 2 - 17, yy, 11, 6);
    }
    roundRect(ctx, -w / 2, -h / 2, w, h, apc ? 5 : 2, apc ? '#818a70' : '#8e9277', '#414e3e');
    ctx.fillStyle = '#a7ac90'; ctx.fillRect(-w / 2 + 4, -h / 2 + 3, w - 8, 3);
    ctx.fillStyle = '#4e6055'; ctx.fillRect(w / 2 - 18, -h / 2 + 4, 8, h - 8);
    if (apc) {
      circle(ctx, -3, 0, 11, '#6a795e', '#3b4a38', 2);
      line(ctx, 0, 0, 30, 0, '#334131', 5);
      for (let k = 0; k < 3; k++) { ctx.strokeStyle = '#56664c'; ctx.strokeRect(-w / 2 + 6 + k * 8, -h / 2 + 7, 5, h - 14); }
    } else {
      ctx.fillStyle = '#71785f'; ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w * .57, h - 8);
      for (let xx = -w / 2 + 8; xx < w * .1; xx += 12) line(ctx, xx, -h / 2 + 5, xx, h / 2 - 5, '#a8a58a', 1.3);
    }
    // Generic UN vehicle identification references the multinational relief, not a specific unit.
    if (apc) { ctx.save(); ctx.rotate(-Math.PI / 2); ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#e8e5d7'; ctx.textAlign = 'center'; ctx.fillText('UN', 0, -w / 2 + 11); ctx.restore(); }
    ctx.fillStyle = '#d0c696'; ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 6); ctx.fillRect(w / 2 - 2, h / 2 - 9, 3, 6);
    if ((v.hp ?? 1) <= 0) { ctx.globalAlpha = .8; circle(ctx, 0, 0, h * .65, '#343b2d'); }
    ctx.restore();
    if (v.waiting && this.camera.zoom > .55) this.worldLabel(v.x, v.y - 34, typeof v.waiting === 'string' ? v.waiting : 'CONVOY WAITING', '#e1c798', 11);
  }

  actorVisible(state, actor) {
    if (typeof actor.visible === 'boolean') return actor.visible;
    for (const ally of state.squad || []) {
      if (ally.alive !== false && !ally.downed && distance(ally, actor) < (state.missionIndex === 2 ? 440 : 560) && hasLineOfSight(state, ally, actor)) return true;
    }
    return false;
  }

  drawActor(ctx, actor, state, time, view) {
    if (actor.alive === false && !actor.downed) return;
    const isPlayer = actor.id === state.playerId, ally = actor.team === 'squad', civilian = actor.team === 'civilian', survivor = actor.team === 'survivor';
    const radius = Math.max(7, finite(actor.radius, 10));
    const angle = finite(actor.angle), pulse = .5 + Math.sin(time * 4) * .5;
    ctx.save(); ctx.translate(actor.x, actor.y);
    if (!view.menu && isPlayer) {
      const ringRadius = radius + (view.touch ? 5 : 7);
      ctx.fillStyle = 'rgba(133,205,175,.08)'; ctx.beginPath(); ctx.arc(0, 0, ringRadius + 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(12,25,20,.72)'; ctx.lineWidth = 4 / this.camera.zoom; ctx.beginPath(); ctx.arc(0, 0, ringRadius, .15, TAU - .15); ctx.stroke();
      ctx.strokeStyle = COLORS.player; ctx.lineWidth = 1.7 / this.camera.zoom; ctx.beginPath(); ctx.arc(0, 0, ringRadius, .15, TAU - .15); ctx.stroke();
      ctx.save(); ctx.rotate(angle); ctx.fillStyle = COLORS.player; ctx.beginPath(); ctx.moveTo(radius + 13, 0); ctx.lineTo(radius + 7, -3.5); ctx.lineTo(radius + 7, 3.5); ctx.fill(); ctx.restore();
    } else if (!view.menu && ally) {
      ctx.strokeStyle = actor.downed ? '#e2a16c' : 'rgba(135,202,180,.65)'; ctx.lineWidth = 1.4 / this.camera.zoom;
      ctx.beginPath(); ctx.arc(0, 0, radius + 4, 0, TAU); ctx.stroke();
    } else if (!view.menu && (civilian || survivor)) {
      ctx.strokeStyle = 'rgba(206,204,231,.45)'; ctx.lineWidth = 1 / this.camera.zoom;
      ctx.beginPath(); ctx.moveTo(0, -radius - 5); ctx.lineTo(radius + 5, 0); ctx.lineTo(0, radius + 5); ctx.lineTo(-radius - 5, 0); ctx.closePath(); ctx.stroke();
    }
    ctx.save(); ctx.rotate(angle);
    const uniform = ally ? '#8e9770' : civilian ? '#b3a8c0' : survivor ? '#b2ac85' : '#a37f58';
    const gear = ally ? '#4c5a40' : '#615d44';
    if (actor.downed) {
      ctx.fillStyle = 'rgba(21,27,22,.45)'; ctx.beginPath(); ctx.ellipse(4, 5, 17, 9, 0, 0, TAU); ctx.fill();
      roundRect(ctx, -13, -5, 24, 10, 4, uniform);
      circle(ctx, 12, 0, 5, ally ? '#9b9f7b' : '#b29c76');
      line(ctx, -13, -3, -20, -6, gear, 4); line(ctx, -13, 3, -19, 8, gear, 4);
    } else {
      ctx.fillStyle = view.touch ? 'rgba(17,22,18,.56)' : 'rgba(21,27,22,.4)'; ctx.beginPath(); ctx.ellipse(5, 6, 12, 9, -.2, 0, TAU); ctx.fill();
      const walk = actor.moving || actor.speed > 1 || Math.hypot(actor.vx || 0, actor.vy || 0) > 3;
      const stride = walk ? Math.sin(time * 16 + finite(actor.id?.length)) * 2.5 : 0;
      line(ctx, -5, -4, -10 + stride, -5, '#494b36', 4); line(ctx, -5, 4, -10 - stride, 5, '#494b36', 4);
      ctx.fillStyle = uniform; ctx.beginPath(); ctx.ellipse(-1, 0, 8, 10, 0, 0, TAU); ctx.fill();
      if (view.touch) { ctx.strokeStyle = 'rgba(24,31,24,.8)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (!civilian) { ctx.fillStyle = gear; ctx.fillRect(-6, -6, 7, 12); ctx.fillStyle = '#b4ad83'; ctx.fillRect(-5, -5, 2, 3); ctx.fillRect(-5, 2, 2, 3); }
      if (!civilian && !survivor) {
        line(ctx, 2, -6, 10, -3, uniform, 4); line(ctx, 2, 6, 11, 3, uniform, 4);
        line(ctx, 4, 2, 24, 2, '#202d25', 3); ctx.fillStyle = '#48513c'; ctx.fillRect(10, 0, 5, 5);
        if (view.touch) line(ctx, 15, 1, 23, 1, '#8b9078', .7);
      } else {
        line(ctx, 0, -7, 8, -8, uniform, 3.5); line(ctx, 0, 7, 8, 8, uniform, 3.5);
      }
      circle(ctx, 2, 0, civilian ? 5 : 6.2, civilian ? '#695449' : ally ? '#a0a380' : '#b49a70', civilian ? null : gear, 1.2);
      if (ally) { line(ctx, 0, -3, 6, -3, '#bfbe93', 1.1); circle(ctx, -2, 1, 2, '#747b59'); }
      if (actor.role === 'medic' || actor.kind === 'medic') { ctx.fillStyle = '#d6ddbd'; ctx.fillRect(-4, -8, 5, 4); line(ctx, -1.5, -7.5, -1.5, -4.5, '#66765b', 1); }
    }
    ctx.restore(); ctx.restore();
    if (actor.downed && !view.menu) {
      const p = this.worldToScreen(actor.x, actor.y - 22);
      this.screenBadge(p.x, p.y, ally ? 'HELP' : 'WOUNDED', '#edb37b', .8 + pulse * .2);
    } else if (ally && this.camera.zoom > .65 && !view.menu) {
      const hp = clamp(actor.hp / (actor.maxHp || 100), 0, 1);
      if (hp < .85) {
        const p = this.worldToScreen(actor.x, actor.y - 24);
        this.ctx.save(); this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.fillStyle = 'rgba(17,25,21,.8)'; this.ctx.fillRect(p.x - 15, p.y, 30, 4);
        this.ctx.fillStyle = hp < .35 ? '#d98869' : '#8bbba2'; this.ctx.fillRect(p.x - 15, p.y, 30 * hp, 4); this.ctx.restore();
      }
      if (!isPlayer) this.worldLabel(actor.x, actor.y + 25, (actor.name || '').split(' ').at(-1).toUpperCase(), '#c3d5be', view.touch ? 11 : 10);
    }
  }

  worldLabel(x, y, text, color = '#dedbc5', fontSize = 12) {
    if (!text || this.menuView) return;
    const p = this.worldToScreen(x, y), ctx = this.ctx;
    const bounds = this.touchView && !this.mapView ? this.safeRect : null;
    if (bounds && (p.y < bounds.top + 7 || p.y > bounds.bottom - 7 || p.x < bounds.left || p.x > bounds.right)) return;
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bounds) {
      const maxWidth = Math.min(270, bounds.width - 20);
      if (ctx.measureText(text).width > maxWidth) {
        while (text.length > 3 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
        text += '…';
      }
      const half = ctx.measureText(text).width / 2 + 5;
      p.x = clamp(p.x, bounds.left + half, bounds.right - half);
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(23,31,25,.8)'; ctx.strokeText(text, p.x, p.y); ctx.fillStyle = color; ctx.fillText(text, p.x, p.y); ctx.restore();
  }

  screenBadge(x, y, text, color, alpha = 1) {
    if (this.menuView) return;
    if (this.touchView && !this.mapView && (y < this.safeRect.top + 8 || y > this.safeRect.bottom - 8)) return;
    const ctx = this.ctx; ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = alpha;
    ctx.font = '700 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 12;
    roundRect(ctx, x - w / 2, y - 8, w, 16, 2, 'rgba(20,28,22,.9)'); ctx.fillStyle = color; ctx.fillText(text, x, y + .5); ctx.restore();
  }

  drawObjective(state, time, view) {
    const o = state.objective;
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y) || view.menu) return;
    const ctx = this.ctx, r = finite(o.radius, 45), pulse = view.reducedMotion ? 0 : (time * .38) % 1;
    ctx.save(); ctx.translate(o.x, o.y);
    ctx.fillStyle = 'rgba(232,179,97,.065)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(237,193,124,.55)'; ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.setLineDash([8 / this.camera.zoom, 7 / this.camera.zoom]); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (pulse > 0) { ctx.strokeStyle = `rgba(237,193,124,${.22 * (1 - pulse)})`; ctx.beginPath(); ctx.arc(0, 0, r + pulse * 18, 0, TAU); ctx.stroke(); }
    ctx.lineWidth = 2 / this.camera.zoom; ctx.strokeStyle = COLORS.objective;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0); ctx.closePath(); ctx.stroke();
    if (o.progress > 0) { ctx.lineWidth = 4 / this.camera.zoom; ctx.beginPath(); ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(o.progress, 0, 1)); ctx.stroke(); }
    ctx.restore();
    if (this.camera.zoom > .55 && view.guidance !== 'expert') this.worldLabel(o.x, o.y - r - 16, (o.title || 'OBJECTIVE').toUpperCase(), COLORS.objective, 11);
  }

  drawObjectiveIndicator(state, view) {
    this.objectiveIndicator = null;
    const o = state.objective;
    if (!o || view.menu || view.showMap || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
    const p = this.worldToScreen(o.x, o.y), bounds = this.markerBounds(view);
    if (p.x > bounds.left && p.x < bounds.right && p.y > bounds.top && p.y < bounds.bottom) return;
    const { x, y } = this.edgePoint(p, bounds);
    this.objectiveIndicator = { x, y };
    const ctx = this.ctx, angle = Math.atan2(p.y - y, p.x - x), player = (state.squad || []).find(s => s.id === state.playerId);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = 'rgba(24,31,24,.86)'; circle(ctx, 0, 0, 17, 'rgba(24,31,24,.86)', 'rgba(237,193,124,.5)', 1);
    ctx.strokeStyle = COLORS.objective; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, 0); ctx.lineTo(-4, 6); ctx.stroke(); ctx.restore();
    ctx.font = `600 ${view.touch ? 11 : 10}px ui-monospace, monospace`; ctx.fillStyle = '#f0cd92'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const label = player ? `${Math.round(distance(player, o) / 8)} m` : 'OBJECTIVE';
    ctx.strokeStyle = 'rgba(15,28,23,.95)'; ctx.lineWidth = 3; ctx.strokeText(label, x, y + 22); ctx.fillText(label, x, y + 22);
  }

  drawLeaderIndicator(state, view) {
    if (state.role !== 'member' || view.menu || view.showMap) return;
    const player = (state.squad || []).find(a => a.id === state.playerId);
    const leader = (state.squad || []).find(a => a.role === 'leader' && a.alive !== false && !a.downed && a.id !== state.playerId)
      || (state.squad || []).find(a => a.alive !== false && !a.downed && a.id !== state.playerId);
    if (!player || !leader) return;
    const p = this.worldToScreen(leader.x, leader.y);
    let bounds = this.markerBounds(view);
    if (!view.touch) {
      const portrait = this.width < 700 && this.height > this.width, compact = this.height < 400;
      const top = portrait ? Math.min(264, this.height * .38) : compact ? Math.min(125, this.height * .42) : 205;
      const bottom = Math.max(top + 35, this.height - (compact ? 65 : 130));
      bounds = { left: 42, right: this.width - 42, top, bottom, cx: this.width / 2, cy: (top + bottom) / 2 };
    }
    if (p.x > bounds.left && p.x < bounds.right && p.y > bounds.top && p.y < bounds.bottom) return;
    let { x, y } = this.edgePoint(p, bounds);
    // Keep the squad marker distinct when the leader and mission destination share a bearing.
    const other = this.objectiveIndicator;
    if (other && Math.hypot(x - other.x, y - other.y) < 62) {
      if (y > bounds.top + 57) y -= 57;
      else if (y < bounds.bottom - 57) y += 57;
      else x = clamp(x + (x < this.width / 2 ? 72 : -72), bounds.left, bounds.right);
    }
    const ctx = this.ctx, angle = Math.atan2(p.y - y, p.x - x);
    ctx.save(); ctx.translate(x, y);
    circle(ctx, 0, 0, 16, 'rgba(15,31,25,.94)', '#87c3ad', 1.5);
    ctx.rotate(angle); ctx.strokeStyle = '#a5e1c8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, 0); ctx.lineTo(-4, 6); ctx.stroke(); ctx.restore();
    const label = `${(leader.name || 'LEADER').split(' ').at(-1).toUpperCase()} · ${Math.round(distance(player, leader) / 8)} m`;
    ctx.save(); ctx.font = `600 ${view.touch ? 11 : 10}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const halfLabel = ctx.measureText(label).width / 2 + 8;
    const labelX = clamp(x, halfLabel, this.width - halfLabel);
    ctx.strokeStyle = 'rgba(15,28,23,.95)'; ctx.lineWidth = 3; ctx.strokeText(label, labelX, y + 22);
    ctx.fillStyle = '#b3e1cb'; ctx.fillText(label, labelX, y + 22); ctx.restore();
  }

  drawTouchAim(state, view) {
    if (!view.touch || !view.aim || view.menu || view.showMap) return;
    const player = (state.squad || []).find(a => a.id === state.playerId);
    if (!player || player.downed || player.alive === false || !Number.isFinite(view.aim.x) || !Number.isFinite(view.aim.y)) return;
    const start = this.worldToScreen(player.x, player.y), target = this.worldToScreen(view.aim.x, view.aim.y);
    const dx = target.x - start.x, dy = target.y - start.y, distance = Math.hypot(dx, dy);
    if (distance < 30) return;
    const ux = dx / distance, uy = dy / distance, r = this.safeRect;
    const tx = (ux < 0 ? start.x - r.left - 10 : r.right - start.x - 10) / Math.max(.001, Math.abs(ux));
    const ty = (uy < 0 ? start.y - r.top - 10 : r.bottom - start.y - 10) / Math.max(.001, Math.abs(uy));
    const length = Math.min(distance, this.width < 600 ? 112 : 140, tx, ty);
    if (length < 35) return;
    const x = start.x + ux * length, y = start.y + uy * length, ctx = this.ctx;
    const color = view.aim.firing ? '#e9c48a' : '#c5e5d4';
    ctx.save();
    const fade = ctx.createLinearGradient(start.x + ux * 25, start.y + uy * 25, x, y);
    fade.addColorStop(0, view.aim.firing ? 'rgba(233,196,138,.16)' : 'rgba(197,229,212,.14)');
    fade.addColorStop(1, view.aim.firing ? 'rgba(233,196,138,.64)' : 'rgba(197,229,212,.5)');
    ctx.setLineDash([3, 5]); line(ctx, start.x + ux * 25, start.y + uy * 25, x, y, fade, 1.2); ctx.setLineDash([]);
    circle(ctx, x, y, 5.5, 'rgba(18,26,21,.15)', color, 1.2);
    circle(ctx, x, y, view.aim.firing ? 1.5 : .9, color);
    ctx.restore();
  }

  drawDesktopAim(state, view) {
    if (view.touch || !view.pointer || view.menu || view.showMap || view.paused) return;
    const {x,y} = view.pointer, player = state.squad?.find(actor => actor.id === state.playerId);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !player?.alive || player.downed) return;
    const ctx = this.ctx, scale = clamp(finite(view.crosshairScale,1), .75, 1.5);
    const color = {white:'#eff2df', amber:'#edbd72', teal:'#9de4d5'}[view.aimColor] || '#eff2df';
    const spread = (player.moving ? 2 : 0) + clamp(finite(player.suppression),0,1) * 5;
    ctx.save();
    if (view.aimLine) {
      const target = this.screenToWorld(x,y), dx = target.x-player.x, dy = target.y-player.y, length = Math.hypot(dx,dy);
      if (length > 26) {
        const from = {x:player.x+dx/length*20, y:player.y+dy/length*20};
        const previous = this.aimTrace;
        if (!previous || previous.world !== state.world || Math.abs(from.x-previous.from.x) + Math.abs(from.y-previous.from.y) + Math.abs(target.x-previous.target.x) + Math.abs(target.y-previous.target.y) > .5) {
          this.aimTrace = {world:state.world, from, target, result:traceAim(state.world,from,target)};
        }
        const trace = this.aimTrace.result, start = this.worldToScreen(from.x,from.y);
        const end = trace ? this.worldToScreen(trace.point.x,trace.point.y) : {x,y};
        ctx.globalAlpha = .6; ctx.setLineDash([3,6]);
        line(ctx,start.x,start.y,end.x,end.y,trace?.blocked ? '#e5a078' : color,1);
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        if (trace?.blocked) {
          circle(ctx,end.x,end.y,5*scale,'rgba(24,29,22,.8)');
          line(ctx,end.x-3*scale,end.y-3*scale,end.x+3*scale,end.y+3*scale,'#f1ad82',1.5);
          line(ctx,end.x+3*scale,end.y-3*scale,end.x-3*scale,end.y+3*scale,'#f1ad82',1.5);
        }
      }
    }
    const style = ['cross','ring','dot'].includes(view.crosshair) ? view.crosshair : 'cross';
    if (style === 'ring') {
      circle(ctx,x,y,(6+spread)*scale,null,'rgba(14,23,18,.9)',3.5);
      circle(ctx,x,y,(6+spread)*scale,null,color,1.3);
    } else if (style === 'cross') {
      const gap = (4+spread)*scale, outer = gap+6*scale;
      for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        line(ctx,x+dx*gap,y+dy*gap,x+dx*outer,y+dy*outer,'rgba(14,23,18,.9)',3.5);
        line(ctx,x+dx*gap,y+dy*gap,x+dx*outer,y+dy*outer,color,1.3);
      }
    }
    circle(ctx,x,y,(style === 'dot' ? 2.2 : 1.25)*scale,color,'rgba(14,23,18,.9)',1.2);
    ctx.restore();
  }

  drawOrder(state, time, view) {
    const order = state.order;
    if (view.menu || !order || !Number.isFinite(order.x) || !Number.isFinite(order.y) || order.type === 'follow') return;
    const ctx = this.ctx; ctx.save();
    const size = 16 / this.camera.zoom; ctx.strokeStyle = '#9fd7c2'; ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.beginPath(); ctx.moveTo(order.x - size, order.y - size / 2); ctx.lineTo(order.x - size, order.y - size); ctx.lineTo(order.x - size / 2, order.y - size);
    ctx.moveTo(order.x + size / 2, order.y - size); ctx.lineTo(order.x + size, order.y - size); ctx.lineTo(order.x + size, order.y - size / 2);
    ctx.moveTo(order.x + size, order.y + size / 2); ctx.lineTo(order.x + size, order.y + size); ctx.lineTo(order.x + size / 2, order.y + size);
    ctx.moveTo(order.x - size / 2, order.y + size); ctx.lineTo(order.x - size, order.y + size); ctx.lineTo(order.x - size, order.y + size / 2); ctx.stroke();
    ctx.restore();
    if (this.camera.zoom > .5) this.worldLabel(order.x, order.y + size + 14 / this.camera.zoom, (order.label || order.type).toUpperCase(), '#a9d6c4', 10);
  }

  drawSmoke(ctx, s, time) {
    const r = finite(s.radius, 90), opacity = clamp(finite(s.ttl, 10) / 2, 0, 1), extent = r * 1.28;
    ctx.save(); ctx.globalAlpha = opacity; ctx.translate(s.x, s.y); ctx.rotate(time * .1);
    ctx.drawImage(this.smokeSprite(), -extent, -extent, extent * 2, extent * 2);
    ctx.restore();
  }

  drawEffects(ctx, state, time, view = {}) {
    for (const b of state.bullets || []) {
      if (!this.inView(b.x, b.y, 30) || this.houseVisibility(b, view) <= .05) continue;
      const px = Number.isFinite(b.px) ? b.px : b.x - finite(b.vx) * .013, py = Number.isFinite(b.py) ? b.py : b.y - finite(b.vy) * .013;
      line(ctx, px, py, b.x, b.y, b.team === 'squad' ? 'rgba(255,225,151,.85)' : 'rgba(246,161,102,.82)', 1.3 / this.camera.zoom);
      circle(ctx, b.x, b.y, 1.5 / this.camera.zoom, '#fff0ba');
    }
    for (const e of state.effects || []) {
      if (!this.inView(e.x, e.y, 50) || this.houseVisibility(e, view) <= .05) continue;
      // A revealed floor plan does not expose a gunman behind its partition.
      if (e.type === 'muzzle' && e.team === 'enemy' && !this.visibleEnemies.some(actor => actor.id === e.actorId)) continue;
      const life = clamp(e.ttl / (e.maxTtl || .3), 0, 1);
      ctx.save(); ctx.globalAlpha = life;
      if (e.type === 'muzzle') {
        ctx.translate(e.x, e.y); ctx.rotate(finite(e.angle)); ctx.fillStyle = '#ffd88c'; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(10, 0); ctx.lineTo(0, 3); ctx.lineTo(3, 0); ctx.fill();
      } else if (e.type === 'explosion') {
        this.drawFire(ctx, e.x, e.y, time, 10 + (1 - life) * 25);
      } else {
        const radius = 3 + (1 - life) * 13;
        circle(ctx, e.x, e.y, radius, e.type === 'hit' ? 'rgba(217,177,123,.5)' : 'rgba(193,177,139,.4)');
        for (let i = 0; i < 4; i++) { const a = i * 2.4 + e.x; line(ctx, e.x + Math.cos(a) * radius * .7, e.y + Math.sin(a) * radius * .7, e.x + Math.cos(a) * radius, e.y + Math.sin(a) * radius, '#d0bd8a', 1); }
      }
      ctx.restore();
    }
  }

  drawAtmosphere(state, time, view) {
    const ctx = this.ctx, w = this.width, h = this.height;
    if (state.missionIndex === 2) {
      ctx.fillStyle = 'rgba(9,24,26,.42)'; ctx.fillRect(0, 0, w, h);
      // A limited pool of practical light follows each teammate through the night.
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const actor of state.squad || []) {
        if (actor.alive === false || !this.inView(actor.x, actor.y, 160)) continue;
        const p = this.worldToScreen(actor.x, actor.y), r = 165 * this.camera.zoom;
        const light = this.radialSprite('night-light', [[0,'rgba(191,194,148,.08)'], [1,'rgba(191,194,148,0)']], 4);
        ctx.drawImage(light, p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.restore();
    } else if (state.missionIndex === 3) {
      ctx.fillStyle = 'rgba(166,157,144,.09)'; ctx.fillRect(0, 0, w, h);
    } else if (state.missionIndex === 1) {
      ctx.fillStyle = 'rgba(133,75,35,.06)'; ctx.fillRect(0, 0, w, h);
    }
    if (!view.reducedMotion && this.quality !== 'performance') {
      // The particles retain their seeded appearance without hashing each frame.
      const count = this.quality === 'high' ? 32 : 12;
      ctx.fillStyle = '#dfcb9e';
      for (let i = 0; i < count; i++) {
        const dust = this.dust[i];
        const x = (dust.x * w + time * dust.speed) % (w + 60) - 30;
        const y = (dust.y * h + Math.sin(time * .3 + dust.phase) * 8) % h;
        ctx.globalAlpha = dust.alpha; ctx.fillRect(x, y, dust.size, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (view.menu || this.quality !== 'performance') {
      ctx.globalAlpha = view.menu ? .48 : this.quality === 'high' ? .3 : .22;
      ctx.drawImage(this.atmosphereSprites().vignette, 0, 0, w, h); ctx.globalAlpha = 1;
    }
    const player = (state.squad || []).find(s => s.id === state.playerId);
    if (player && !view.menu) {
      const pressure = clamp(finite(player.suppression), 0, 1);
      const injured = 1 - clamp(player.hp / (player.maxHp || 100), 0, 1);
      if (pressure > .1 || injured > .5) {
        // Health/suppression feedback stays present at every graphics level.
        ctx.globalAlpha = Math.max(pressure * .25, (injured - .5) * .5);
        ctx.drawImage(this.atmosphereSprites().damage, 0, 0, w, h); ctx.globalAlpha = 1;
      }
    }
  }

  keepDesktopActorClear(player, world, obstacles) {
    if (!Array.isArray(obstacles) || !obstacles.length) return;
    const margin = 32, width = this.width, height = this.height, zoom = this.camera.zoom;
    // The app measures HUD geometry outside the rendering loop and replaces
    // this array when it changes. The renderer never asks the DOM for layout.
    if (this.desktopObstacleSource !== obstacles || this.desktopObstacleWidth !== width || this.desktopObstacleHeight !== height) {
      this.desktopObstacleSource = obstacles; this.desktopObstacleWidth = width; this.desktopObstacleHeight = height;
      this.desktopObstacles = obstacles.filter(r => r && [r.left,r.top,r.right,r.bottom].every(Number.isFinite) && r.right > r.left && r.bottom > r.top && r.right > 0 && r.bottom > 0 && r.left < width && r.top < height)
        .map(r => ({left:Math.max(-margin,r.left-margin),top:Math.max(-margin,r.top-margin),right:Math.min(width+margin,r.right+margin),bottom:Math.min(height+margin,r.bottom+margin)}));
    }
    const blocked = this.desktopObstacles;
    if (!blocked.length) return;
    const point = this.worldToScreen(player.x, player.y), halfW = width / zoom / 2, halfH = height / zoom / 2;
    // Keep extra framing bounded even if panels leave no fully clear position.
    const extraX = Math.min(360, width * .35) / zoom, extraY = Math.min(360, height * .35) / zoom;
    const minCameraX = (world.width <= halfW * 2 ? world.width / 2 : halfW) - extraX;
    const maxCameraX = (world.width <= halfW * 2 ? world.width / 2 : world.width - halfW) + extraX;
    const minCameraY = (world.height <= halfH * 2 ? world.height / 2 : halfH) - extraY;
    const maxCameraY = (world.height <= halfH * 2 ? world.height / 2 : world.height - halfH) + extraY;
    const left = Math.max(margin, (player.x - maxCameraX) * zoom + width / 2);
    const right = Math.min(width - margin, (player.x - minCameraX) * zoom + width / 2);
    const top = Math.max(margin, (player.y - maxCameraY) * zoom + height / 2);
    const bottom = Math.min(height - margin, (player.y - minCameraY) * zoom + height / 2);
    if (right < left || bottom < top) return;
    const obstructed = (x,y) => blocked.some(r => x > r.left && x < r.right && y > r.top && y < r.bottom);
    let x = clamp(point.x,left,right), y = clamp(point.y,top,bottom);
    if (obstructed(x,y)) {
      // The nearest clear point around a union of rectangles lies on one of
      // their edges (or the original axis). Checking both axes also handles
      // stacked and overlapping panels without alternating between them.
      const xs = [x,left,right], ys = [y,top,bottom];
      for (const rect of blocked) { xs.push(clamp(rect.left,left,right),clamp(rect.right,left,right)); ys.push(clamp(rect.top,top,bottom),clamp(rect.bottom,top,bottom)); }
      let best = Infinity, bestX, bestY;
      for (const cx of xs) for (const cy of ys) {
        const cost = (cx-point.x)**2 + (cy-point.y)**2;
        if (cost < best && !obstructed(cx,cy)) { best=cost; bestX=cx; bestY=cy; }
      }
      if (!Number.isFinite(best)) return;
      x=bestX; y=bestY;
    }
    this.camera.x += (point.x-x) / zoom;
    this.camera.y += (point.y-y) / zoom;
  }

  updateCamera(state, view = {}) {
    if (!state || !state.world) return;
    const world = state.world, time = finite(view.time, state.time || 0), now = globalThis.performance?.now() ?? Date.now();
    const delta = Math.min(.06, Math.max(.001, (now - this.lastRender) / 1000 || 1 / 60)); this.lastRender = now;
    if (this.mapIdentity !== world || !this.mapCache || this.mapMission !== state.missionIndex) {
      const sameLayout = this.mapCache && Number.isFinite(state.seed) && this.mapSeed === state.seed && this.mapMission === state.missionIndex && this.mapCache.width === world.width && this.mapCache.height === world.height;
      if (sameLayout) this.mapIdentity = world;
      else { this.makeMap(world, state.missionIndex); this.mapSeed = state.seed; this.cameraReady = false; }
    }
    const player = (state.squad || []).find(s => view.followActorId && s.id === view.followActorId) || (state.squad || []).find(s => s.id === state.playerId) || state.squad?.[0] || { x: world.width / 2, y: world.height / 2 };
    this.touchView = !!view.touch; this.mapView = !!view.showMap; this.menuView = !!view.menu;
    this.safeRect = this.playableRect(view);
    const safe = this.safeRect;
    let zoom = (view.touch ? (this.height > this.width ? 1.1 : 1.04) : this.width < 600 ? 1.02 : this.width < 1000 ? 1.08 : 1.2) * clamp(finite(view.zoom, 1), view.touch ? .6 : .8, view.touch ? 1.25 : 1.4);
    let tx = player.x, ty = player.y;
    // Keep the soldier in the usable battlefield between the HUD and thumb controls.
    if (!view.menu && !view.showMap) {
      if (view.touch) {
        tx -= (safe.cx - this.width / 2) / zoom;
        ty -= (safe.cy - this.height / 2) / zoom;
      } else {
        const portrait = this.width < 700 && this.height > this.width;
        const compactLandscape = this.height < 400;
        const focusOffset = portrait ? Math.min(42, this.height * .065) : compactLandscape ? Math.min(24, this.height * .08) : 0;
        ty -= focusOffset / zoom;
      }
    }
    if (view.showMap) {
      zoom = Math.min((safe.width - 36) / world.width, (safe.height - (view.touch ? 30 : 72)) / world.height);
      tx = world.width / 2 - (safe.cx - this.width / 2) / zoom;
      ty = world.height / 2 - (safe.cy - this.height / 2) / zoom;
    } else if (view.menu) {
      zoom = Math.max(this.width / world.width, this.height / world.height) * 1.3;
      tx = world.width * .55 + (view.reducedMotion ? 0 : Math.sin(time * .025) * 140);
      ty = world.height * .48 + (view.reducedMotion ? 0 : Math.cos(time * .023) * 80);
    }
    if (!view.touch && !view.menu && !view.showMap && view.pointer && finite(view.lookahead) > 0) {
      const amount = clamp(finite(view.lookahead), 0, 1);
      tx += clamp((view.pointer.x - this.width / 2) / this.width, -.5, .5) * 240 / zoom * amount;
      ty += clamp((view.pointer.y - this.height / 2) / this.height, -.5, .5) * 160 / zoom * amount;
    }
    const halfW = this.width / zoom / 2, halfH = this.height / zoom / 2;
    if (!view.showMap) {
      // A small amount of outside-map framing prevents the boundary from pinning soldiers beneath HUD panels.
      const edgeAllowance = view.menu ? 0 : 40 / zoom;
      tx = world.width <= halfW * 2 ? world.width / 2 : clamp(tx, halfW - edgeAllowance, world.width - halfW + edgeAllowance);
      ty = world.height <= halfH * 2 ? world.height / 2 : clamp(ty, halfH - edgeAllowance, world.height - halfH + edgeAllowance);
      if (view.touch && !view.menu) {
        // At the map edge, allow only the extra framing needed to keep the soldier clear of controls.
        const margin = Math.min(36, safe.height * .3);
        tx = clamp(tx, player.x - (safe.right - margin - this.width / 2) / zoom, player.x - (safe.left + margin - this.width / 2) / zoom);
        ty = clamp(ty, player.y - (safe.bottom - margin - this.height / 2) / zoom, player.y - (safe.top + margin - this.height / 2) / zoom);
      }
    }
    const layoutKey = `${this.width}:${this.height}:${safe.left}:${safe.top}:${safe.right}:${safe.bottom}:${!!view.touch}`;
    const snap = !this.cameraReady || this.lastPlayerId !== state.playerId || view.showMap || this.lastMapView !== !!view.showMap || this.lastMenuView !== !!view.menu || this.lastLayoutKey !== layoutKey;
    const smoothing = snap || view.reducedMotion ? 1 : 1 - Math.exp(-delta * (view.touch ? 12 : 18));
    this.camera.x += (tx - this.camera.x) * smoothing; this.camera.y += (ty - this.camera.y) * smoothing; this.camera.zoom += (zoom - this.camera.zoom) * smoothing;
    // Apply the visibility constraint after smoothing so it cannot interpolate
    // through a HUD panel. Input mapping then uses this exact camera all frame.
    if (!view.touch && !view.menu && !view.showMap) this.keepDesktopActorClear(player,world,view.desktopObstacles);
    this.cameraReady = true; this.lastPlayerId = state.playerId; this.lastMapView = !!view.showMap; this.lastMenuView = !!view.menu;
    this.lastLayoutKey = layoutKey;
  }

  render(state, view = {}) {
    if (!state?.world) return;
    if (!view.cameraPrepared || !this.cameraReady) this.updateCamera(state, view);
    const world = state.world, time = finite(view.time, state.time || 0), zoom = this.camera.zoom, safe = this.safeRect;
    this.quality = ['performance','balanced','high'].includes(view.quality) ? view.quality : 'balanced';
    this.updateHouseCutaways(state, view, time);
    const ctx = this.ctx;
    ctx.imageSmoothingQuality = this.quality === 'high' ? 'high' : 'low';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = view.showMap ? '#101b17' : '#252f28'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save(); ctx.translate(this.width / 2, this.height / 2); ctx.scale(this.camera.zoom, this.camera.zoom); ctx.translate(-this.camera.x, -this.camera.y);
    // A muted strip of ground fills the limited camera overscan; the dark perimeter still marks the map edge.
    const overscan = view.touch ? Math.max(this.width, this.height) / zoom : Math.max(80, this.width / zoom / 2 - this.camera.x, this.camera.x + this.width / zoom / 2 - world.width, this.height / zoom / 2 - this.camera.y, this.camera.y + this.height / zoom / 2 - world.height);
    if (!view.showMap) { ctx.fillStyle = '#6d6550'; ctx.fillRect(-overscan, -overscan, world.width + overscan * 2, world.height + overscan * 2); }
    // Bound the source work to the visible district instead of resampling the whole city.
    const left = clamp(Math.floor(this.camera.x - this.width / zoom / 2) - 1, 0, world.width);
    const top = clamp(Math.floor(this.camera.y - this.height / zoom / 2) - 1, 0, world.height);
    const right = clamp(Math.ceil(this.camera.x + this.width / zoom / 2) + 1, 0, world.width);
    const bottom = clamp(Math.ceil(this.camera.y + this.height / zoom / 2) + 1, 0, world.height);
    if (right > left && bottom > top) ctx.drawImage(this.mapCache, left, top, right-left, bottom-top, left, top, right-left, bottom-top);
    this.drawHouseCutaways(ctx, view, {left, top, right, bottom});
    if (view.showMap) { ctx.strokeStyle = '#718272'; ctx.lineWidth = 1 / this.camera.zoom; ctx.strokeRect(0, 0, world.width, world.height); }
    for (const prop of world.props || []) if (this.isDynamicProp(prop) && this.inView(prop.x, prop.y, 150)) this.drawProp(ctx, prop, time, true);
    this.drawObjective(state, time, view); this.drawOrder(state, time, view);
    for (const v of state.vehicles || []) if (this.inView(v.x, v.y, 140)) this.drawVehicle(ctx, v, time);
    this.visibleEnemies.length = 0;
    for (const actor of state.enemies || []) if (actor.alive !== false && this.inView(actor.x, actor.y, 65) && this.houseVisibility(actor, view) > .01 && this.actorVisible(state, actor)) this.visibleEnemies.push(actor);
    const actors = this.actorBuffer; actors.length = 0;
    for (const group of [state.civilians, state.survivors, this.visibleEnemies, state.squad]) for (const actor of group || []) if (this.inView(actor.x, actor.y, 65)) actors.push(actor);
    actors.sort((a, b) => a.y - b.y);
    for (const actor of actors) {
      const visibility = this.houseVisibility(actor, view);
      if (visibility <= .01) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, visibility * 1.5);
      this.drawActor(ctx, actor, state, time, view); ctx.restore();
    }
    this.drawEffects(ctx, state, time, view);
    for (const smoke of state.smokes || []) if (this.inView(smoke.x, smoke.y, finite(smoke.radius, 90) * 1.5)) this.drawSmoke(ctx, smoke, time);
    // The wreck's rising plume stays separate from gameplay smoke and drifts with the wind.
    const wrecks = (state.vehicles || []).filter(v => v.kind === 'helicopter' || v.kind === 'crash');
    for (const wreck of wrecks) if (this.inView(wreck.x, wreck.y, 220)) {
      for (let i = 0; i < 5; i++) {
        const drift = ((time * 8 + i * 27) % 140), r = 11 + drift * .21, x = wreck.x - 18 + drift * .35, y = wreck.y - drift * .6;
        const plume = this.radialSprite('wreck-plume', [[0,'rgba(34,37,30,1)'], [1,'rgba(34,37,30,0)']]);
        ctx.globalAlpha = .28 * (1 - drift / 150); ctx.drawImage(plume, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    if (!view.showMap) this.drawAtmosphere(state, time, view);
    this.drawTouchAim(state, view); this.drawObjectiveIndicator(state, view); this.drawLeaderIndicator(state, view);
    this.drawDesktopAim(state, view);
    if (view.showMap) {
      ctx.fillStyle = '#e2d9bb'; ctx.font = '600 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('DISTRICT MAP', safe.cx, view.touch ? safe.top + 5 : 22);
      ctx.fillStyle = '#b9c7ad'; ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(view.touch ? (view.placingOrder ? 'Tap a street or room to set the destination' : 'Squad and objective positions') : state.role === 'leader' ? 'Select MOVE, then a street or room • M to close' : 'Stay with the marked squad • M to close', safe.cx, view.touch ? safe.bottom - 4 : this.height - 22);
    }
  }

  renderMinimap(canvas, state) { return renderMinimap(canvas, state, { camera: this.camera, viewport: { width: this.width, height: this.height } }); }
}

/** A compact tactical map. Does not reveal enemies beyond the squad's line of sight. */
export function renderMinimap(canvas, state, options = {}) {
  if (!canvas || !state?.world) return;
  const ctx = canvas.getContext('2d'), width = canvas.width, height = canvas.height, world = state.world;
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min((width - 12) / world.width, (height - 12) / world.height);
  const ox = (width - world.width * scale) / 2, oy = (height - world.height * scale) / 2;
  ctx.fillStyle = '#18251f'; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.fillStyle = '#394439'; ctx.fillRect(0, 0, world.width, world.height);
  for (const r of world.roads || []) { ctx.fillStyle = '#465245'; ctx.fillRect(r.x, r.y, r.w ?? r.width, r.h ?? r.height); }
  for (const b of world.buildings || []) {
    ctx.fillStyle = b.enterable ? '#4b5645' : '#72806a'; ctx.fillRect(b.x, b.y, b.w ?? b.width, b.h ?? b.height);
    if (!b.enterable) continue;
    ctx.fillStyle = '#859075';
    for (const wall of b.walls || []) ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    for (const door of b.doors || []) {
      const half = door.width / 2 - 5, thickness = Math.max(5, .6 / scale);
      if (door.side === 'north' || door.side === 'south') line(ctx, door.x - half, door.y, door.x + half, door.y, '#9baf8c', thickness);
      else line(ctx, door.x, door.y - half, door.x, door.y + half, '#9baf8c', thickness);
    }
  }
  for (const v of state.vehicles || []) { ctx.fillStyle = '#b7c5a1'; ctx.fillRect(v.x - 3 / scale, v.y - 1.5 / scale, 6 / scale, 3 / scale); }
  const o = state.objective;
  if (o && Number.isFinite(o.x)) { circle(ctx, o.x, o.y, 5 / scale, 'rgba(237,191,112,.2)', COLORS.objective, 1.4 / scale); }
  for (const a of state.enemies || []) {
    if (a.alive === false) continue;
    const visible = typeof a.visible === 'boolean' ? a.visible : (state.squad || []).some(s => s.alive !== false && !s.downed && distance(a, s) < 500 && hasLineOfSight(state, a, s));
    if (visible) circle(ctx, a.x, a.y, 1.5 / scale, '#d57e62');
  }
  for (const a of state.squad || []) if (a.alive !== false || a.downed) circle(ctx, a.x, a.y, (a.id === state.playerId ? 3.2 : 2) / scale, a.downed ? '#e8ad6d' : a.id === state.playerId ? '#e0efd6' : '#88c2aa');
  if (options.camera && options.viewport) {
    const c = options.camera, v = options.viewport, w = v.width / c.zoom, h = v.height / c.zoom;
    ctx.strokeStyle = 'rgba(200,215,180,.35)'; ctx.lineWidth = .8 / scale; ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
  }
  ctx.restore();
  ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = '#bdc7a9'; ctx.textAlign = 'right'; ctx.fillText('N', width - 7, 12);
  line(ctx, width - 10, 25, width - 10, 16, '#bdc7a9', 1); line(ctx, width - 10, 16, width - 13, 20, '#bdc7a9', 1); line(ctx, width - 10, 16, width - 7, 20, '#bdc7a9', 1);
}
