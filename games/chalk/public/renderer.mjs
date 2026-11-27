import { traceAim } from './desktop-input.mjs';
import { roleProfile } from './squad-roles.mjs';
import { enemyInSharedSight, squadCanSeePoint, rayWallDistance, SharedSightLayer } from './visibility.mjs';
import { getSolidWalls } from './building-geometry.mjs';
import { flashIntensity } from './hand-grenades.mjs';
import { personAppearance } from './person-appearance.mjs';
import { GunplayPresentation, GUNPLAY_LIMITS, flashVariation, projectileStreak } from './gunplay-visuals.mjs';

const TAU = Math.PI * 2;
const COLORS = {
  sand: '#817359', road: '#55534a', ally: '#84c7b6', player: '#c4efda',
  enemy: '#db735b', objective: '#e9b969', civilian: '#c5c4dc', ink: '#151d1b'
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const MUZZLE_PROFILES = Object.freeze({
  rifle: Object.freeze({ duration: .11, length: 21, width: 10, radius: 62, nightRadius: 88, offset: 4 }),
  hostile: Object.freeze({ duration: .11, length: 23, width: 11, radius: 66, nightRadius: 92, offset: 4 }),
  support: Object.freeze({ duration: .135, length: 29, width: 13, radius: 78, nightRadius: 106, offset: 10 }),
  hostile_support: Object.freeze({ duration: .135, length: 29, width: 13, radius: 78, nightRadius: 106, offset: 10 }),
  sniper: Object.freeze({ duration: .15, length: 34, width: 11, radius: 86, nightRadius: 118, offset: 12 }),
});
export function missionLighting(state) {
  return state?.mission?.lighting || (state?.missionIndex === 2 ? 'night' : state?.missionIndex === 3 ? 'dawn' : state?.missionIndex === 1 ? 'late-afternoon' : 'day');
}
export function muzzleProfile(weapon) { return MUZZLE_PROFILES[weapon] || MUZZLE_PROFILES.rifle; }

/** Keep the visual muzzle at the visible barrel end without crossing cover. */
export function muzzleOrigin(event, world) {
  const angle = finite(event.angle), dx = Math.cos(angle), dy = Math.sin(angle), profile = muzzleProfile(event.weapon);
  let offset = profile.offset;
  for (const wall of getSolidWalls(world || {})) {
    const hit = rayWallDistance(event.x, event.y, dx, dy, wall, offset + .5);
    if (hit <= offset) offset = Math.max(0, hit - .4);
  }
  return { x: event.x + dx * offset, y: event.y + dy * offset };
}

/** A short light fan is computed once per actual shot and geometry revision. */
export function muzzleLightPolygon(world, source, radius) {
  const walls = getSolidWalls(world || {}).filter(wall => {
    const x = clamp(source.x, wall.x, wall.x + wall.w), y = clamp(source.y, wall.y, wall.y + wall.h);
    return (x - source.x) ** 2 + (y - source.y) ** 2 <= radius * radius;
  });
  const angles = [];
  for (let i = 0; i < 24; i++) angles.push(i * TAU / 24);
  for (const wall of walls) for (const x of [wall.x, wall.x + wall.w]) for (const y of [wall.y, wall.y + wall.h]) {
    if ((x - source.x) ** 2 + (y - source.y) ** 2 > radius * radius) continue;
    const angle = Math.atan2(y - source.y, x - source.x);
    for (const delta of [-.0002, 0, .0002]) angles.push((angle + delta + TAU) % TAU);
  }
  angles.sort((a, b) => a - b);
  return angles.map(angle => {
    const dx = Math.cos(angle), dy = Math.sin(angle); let reach = radius;
    for (const wall of walls) reach = rayWallDistance(source.x, source.y, dx, dy, wall, reach);
    return { x: source.x + dx * Math.max(0, reach - .3), y: source.y + dy * Math.max(0, reach - .3) };
  });
}
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

const portalCache = new WeakMap();
/** Joined doors and breaches form one approach; cache the small interval merge
 * until damage changes rather than reopening an artificial jamb every frame. */
function housePortals(building) {
  const doors = building.doors, breaches = building.breaches, revision = finite(building.wallRevision);
  const cached = portalCache.get(building);
  if (cached && cached.doors === doors && cached.breaches === breaches && cached.revision === revision && cached.count === (doors?.length || 0) + (breaches?.length || 0)) return cached.portals;
  const spans = [];
  for (const portal of [...(doors || []), ...(breaches || [])]) {
    if (!['north', 'south', 'east', 'west'].includes(portal.side) || !Number.isFinite(portal.x) || !Number.isFinite(portal.y) || !(portal.width > 0)) continue;
    const vertical = portal.side === 'east' || portal.side === 'west', center = vertical ? portal.y : portal.x;
    spans.push({ side: portal.side, vertical, normal: vertical ? portal.x : portal.y, from: center - portal.width / 2, to: center + portal.width / 2 });
  }
  spans.sort((a, b) => a.side.localeCompare(b.side) || a.normal - b.normal || a.from - b.from);
  const portals = [];
  for (const span of spans) {
    const previous = portals.at(-1);
    if (previous && previous.side === span.side && Math.abs(previous.normal - span.normal) < .001 && span.from <= previous.to + .001) previous.to = Math.max(previous.to, span.to);
    else portals.push({ ...span });
  }
  for (const portal of portals) {
    const center = (portal.from + portal.to) / 2;
    portal.x = portal.vertical ? portal.normal : center; portal.y = portal.vertical ? center : portal.normal; portal.width = portal.to - portal.from;
  }
  portalCache.set(building, { doors, breaches, revision, count: (doors?.length || 0) + (breaches?.length || 0), portals });
  return portals;
}

/** Roof removal is a viewing aid, never a source of enemy visibility. */
export function houseRevealed(building, state, view = {}) {
  if (!building.enterable || view.menu) return false;
  const squad = state.squad || [];
  // Keep a separated teammate, including someone waiting for aid, readable.
  if (squad.some(actor => actor.alive !== false && insideBuilding(building, actor))) return true;
  if ((state.survivors || []).some(actor => actor.stabilized && actor.alive !== false && insideBuilding(building, actor))) return true;
  const player = squad.find(actor => view.followActorId && actor.id === view.followActorId) || squad.find(actor => actor.id === state.playerId) || squad[0];
  if (!player || player.alive === false) return false;
  // Approach through the actual opening. Walking alongside a solid wall does
  // not expose its rooms, and hostile/civilian occupants cannot lift a roof.
  const approach = door => {
    const vertical = door.side === 'east' || door.side === 'west';
    const normal = vertical ? player.x - door.x : player.y - door.y;
    const outward = normal * (door.side === 'south' || door.side === 'east' ? 1 : -1);
    const across = vertical ? player.y - door.y : player.x - door.x;
    return outward >= -12 && outward <= 72 && Math.abs(across) <= Math.max(12, door.width / 2 - 5);
  };
  return housePortals(building).some(approach);
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
    this.visibleAllies = [];
    this.actorBuffer = [];
    this.sprites = new Map();
    this.atmosphereCache = null;
    this.sharedSight = new SharedSightLayer();
    this.muzzleFlashes = [];
    this.muzzleCursor = 0;
    this.muzzleScene = null;
    this.muzzleStateTime = null;
    this.gunplay = new GunplayPresentation();
    this.projectileStateTime = null; this.projectileFrameAt = null;
    this.flashMasks = new Map(); this.flashWorld = null;
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

  muzzleSprite(weapon) {
    const family = weapon === 'sniper' ? 'sniper' : weapon === 'support' || weapon === 'hostile_support' ? 'support' : 'rifle';
    const key = `muzzle:${family}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const sprite = newCanvas(96, 48), ctx = sprite.getContext('2d');
    ctx.translate(18, 24);
    const length = family === 'sniper' ? 59 : family === 'support' ? 53 : 45;
    ctx.fillStyle = 'rgba(255,163,66,.82)';
    ctx.beginPath(); ctx.moveTo(-7, 0);
    if (family === 'sniper') {
      ctx.lineTo(9, -5); ctx.lineTo(27, -9); ctx.lineTo(20, -3); ctx.lineTo(length, 0);
      ctx.lineTo(22, 3); ctx.lineTo(32, 7); ctx.lineTo(9, 5);
    } else if (family === 'support') {
      ctx.lineTo(5, -9); ctx.lineTo(21, -16); ctx.lineTo(18, -5); ctx.lineTo(35, -6); ctx.lineTo(length, 0);
      ctx.lineTo(29, 5); ctx.lineTo(23, 14); ctx.lineTo(11, 8); ctx.lineTo(2, 11);
    } else {
      ctx.lineTo(8, -9); ctx.lineTo(15, -17); ctx.lineTo(21, -6); ctx.lineTo(length, 0);
      ctx.lineTo(24, 6); ctx.lineTo(15, 15); ctx.lineTo(8, 7);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe9ad'; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(9, -6); ctx.lineTo(length * .75, 0); ctx.lineTo(9, 6); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff8d8'; ctx.beginPath(); ctx.ellipse(4, 0, 11, 3, 0, 0, TAU); ctx.fill();
    if (family === 'support') { line(ctx, 20, -14, 29, -18, '#eeb776', 1.6); line(ctx, 26, 11, 34, 15, '#eeb776', 1.4); }
    this.sprites.set(key, sprite); return sprite;
  }

  muzzleVisible(state, flash, view = {}) {
    if (view.menu || view.showMap || view.paused || !this.inView(flash.x, flash.y, 100) || this.houseVisibility(flash, view) < .9) return false;
    // A distant night source may be briefly visible along an open street, but
    // it does not reveal the shooter, their marker, or remembered terrain.
    const night = missionLighting(state) === 'night', limit = night ? 900 : 600;
    const witnesses = (state.squad || []).filter(actor => actor.alive !== false && !actor.downed && distance(actor, flash) <= limit);
    return witnesses.length > 0 && squadCanSeePoint({ ...state, squad: witnesses }, flash, { ignoreRange: night });
  }

  updateMuzzleFlashes(state, view = {}) {
    const now = finite(view.time, finite(state.time)), gameTime = finite(state.time), night = missionLighting(state) === 'night';
    const baseScene = `${state.seed}:${state.missionIndex}`, scene = `${baseScene}:${view.effectEpoch ?? ''}`;
    const rewound = this.muzzleStateTime !== null && gameTime < this.muzzleStateTime - .001;
    const reset = this.muzzleScene !== scene || rewound;
    if (reset) {
      this.muzzleFlashes.length = 0;
      if (this.muzzleBaseScene !== baseScene || rewound || gameTime < .25) this.muzzleCursor = 0;
      this.muzzleScene = scene; this.muzzleBaseScene = baseScene;
    }
    this.muzzleStateTime = gameTime;
    const events = state.soundEvents || [];
    if (view.menu || view.showMap || view.paused || state.status && state.status !== 'playing') {
      this.muzzleFlashes.length = 0;
      for (const event of events) this.muzzleCursor = Math.max(this.muzzleCursor, finite(event.id));
      return;
    }
    this.muzzleFlashes = this.muzzleFlashes.filter(flash => now >= flash.born && now - flash.born < flash.profile.duration);
    for (const event of events) {
      if (!Number.isFinite(event.id) || event.id <= this.muzzleCursor) continue;
      this.muzzleCursor = event.id;
      if (event.type !== 'shot' || !Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
      const sourceTime = finite(event.sourceTime, finite(event.time, gameTime)), age = gameTime - sourceTime;
      if (age < -.05 || age > .22) continue;
      const profile = muzzleProfile(event.weapon), source = muzzleOrigin(event, state.world);
      const flash = { ...source, actorId: event.actorId, weapon: event.weapon, angle: finite(event.angle), profile, variation: flashVariation(event.id),
        born: now - Math.min(Math.max(0, age), profile.duration - .045), geometryRevision: finite(state.world.geometryRevision),
        lightRadius: night ? profile.nightRadius : profile.radius };
      if (!this.muzzleVisible(state, flash, view)) continue;
      // Successive rounds from one automatic weapon share a single local light.
      this.muzzleFlashes = this.muzzleFlashes.filter(previous => previous.actorId !== flash.actorId);
      flash.polygon = muzzleLightPolygon(state.world, flash, flash.lightRadius);
      this.muzzleFlashes.push(flash);
      if (this.muzzleFlashes.length > 24) this.muzzleFlashes.shift();
    }
  }

  drawMuzzleFlashes(ctx, state, view = {}) {
    if (!this.muzzleFlashes.length || view.menu || view.showMap || view.paused) return;
    const now = finite(view.time, finite(state.time)), night = missionLighting(state) === 'night';
    for (const flash of this.muzzleFlashes) {
      if (!this.muzzleVisible(state, flash, view)) continue;
      const life = clamp(1 - (now - flash.born) / flash.profile.duration, 0, 1);
      if (!life) continue;
      const profile = flash.profile, lightRadius = night ? profile.nightRadius : profile.radius;
      const brightNight = night && !view.reducedMotion;
      // Hold a clear peak for the first few frames, then decay within the
      // original shot lifetime. Small mobile sprites remain legible without
      // lengthening automatic fire into a continuous light or a screen flash.
      const pulse = brightNight ? Math.sqrt(Math.min(1, life / .62)) : Math.sqrt(life);
      const revision = finite(state.world.geometryRevision);
      if (!flash.polygon || flash.geometryRevision !== revision || flash.lightRadius !== lightRadius) {
        flash.polygon = muzzleLightPolygon(state.world, flash, lightRadius); flash.geometryRevision = revision; flash.lightRadius = lightRadius;
      }
      const points = flash.polygon;
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < points.length; i++) { const point = points[i]; if (i) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); }
      ctx.closePath(); ctx.clip();
      // The bright core and surrounding light both stop at masonry and roofs.
      ctx.beginPath(); ctx.rect(flash.x - lightRadius, flash.y - lightRadius, lightRadius * 2, lightRadius * 2);
      for (const house of this.houseCutaways) {
        const b = house.building;
        if (house.amount >= .9 || b.x > flash.x + lightRadius || b.y > flash.y + lightRadius || b.x + b.w < flash.x - lightRadius || b.y + b.h < flash.y - lightRadius) continue;
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.clip('evenodd');
      if (brightNight) {
        const radius = lightRadius * (this.quality === 'performance' ? .8 : 1);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .9 * pulse;
        ctx.drawImage(this.radialSprite('muzzle-light', [[0, 'rgba(255,216,151,.96)'], [.22, 'rgba(255,184,90,.66)'], [.58, 'rgba(245,149,57,.22)'], [1, 'rgba(230,141,50,0)']]), flash.x - radius, flash.y - radius, radius * 2, radius * 2);
        ctx.restore();
      }
      const variation = flash.variation || { length: 1, width: 1, angle: 0 };
      ctx.save(); ctx.translate(flash.x, flash.y); ctx.rotate(flash.angle + (view.reducedMotion ? 0 : variation.angle));
      ctx.globalAlpha = (view.reducedMotion ? .65 : 1) * pulse;
      if (brightNight) ctx.globalCompositeOperation = 'screen';
      const length = profile.length * (brightNight ? Math.max(1, variation.length) : variation.length) * (brightNight ? 1.65 : night ? 1 : .86), width = profile.width * variation.width * (brightNight ? 1.45 : night ? 1 : .85);
      ctx.drawImage(this.muzzleSprite(flash.weapon), -length * .22, -width, length * 1.25, width * 2);
      ctx.restore(); ctx.restore();
    }
  }

  gunplayVisible(state, point, view = {}) {
    return !view.menu && !view.showMap && !view.paused && this.inView(point.x, point.y, 45) &&
      this.houseVisibility(point, view) > .9 && squadCanSeePoint(state, point);
  }

  updateGunplay(state, view = {}) {
    this.gunplay.update(state, view, point => this.gunplayVisible(state, point, view));
    if (this.projectileStateTime !== state.time) {
      this.projectileStateTime = state.time; this.projectileFrameAt = finite(view.time, finite(state.time));
    }
  }

  clipGunplay(ctx, effect, state, radius = 40) {
    const revision = finite(state.world.geometryRevision);
    if (!effect.polygon || effect.geometryRevision !== revision) {
      effect.polygon = muzzleLightPolygon(state.world, effect, radius); effect.geometryRevision = revision;
    }
    ctx.beginPath();
    effect.polygon.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath(); ctx.clip();
    ctx.beginPath(); ctx.rect(effect.x - radius, effect.y - radius, radius * 2, radius * 2);
    for (const house of this.houseCutaways) {
      const b = house.building;
      if (house.amount >= .9 || b.x > effect.x + radius || b.y > effect.y + radius || b.x + b.w < effect.x - radius || b.y + b.h < effect.y - radius) continue;
      ctx.rect(b.x, b.y, b.w, b.h);
    }
    ctx.clip('evenodd');
  }

  drawProjectileStreak(ctx, state, streak, view = {}, alpha = 1) {
    const tail = { x: streak.tailX, y: streak.tailY }, middle = { x: (tail.x + streak.x) / 2, y: (tail.y + streak.y) / 2 };
    if (!this.gunplayVisible(state, streak, view) || !this.gunplayVisible(state, tail, view) || !squadCanSeePoint(state, middle)) return false;
    const width = (view.reducedMotion ? .95 : 1.25) / this.camera.zoom;
    ctx.save(); ctx.globalAlpha = alpha * (view.reducedMotion ? .55 : .9);
    if (this.quality !== 'performance' && !view.reducedMotion) line(ctx, tail.x, tail.y, streak.x, streak.y, 'rgba(227,173,96,.24)', width * 2.6);
    // A tapered core is readable at phone zoom without painting a laser from
    // the muzzle to its destination or advertising a hidden shooter's team.
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(streak.x - streak.ux * 3 - streak.uy * width, streak.y - streak.uy * 3 + streak.ux * width);
    ctx.lineTo(streak.x, streak.y);
    ctx.lineTo(streak.x - streak.ux * 3 + streak.uy * width, streak.y - streak.uy * 3 - streak.ux * width);
    ctx.closePath(); ctx.fillStyle = '#f4dfb0'; ctx.fill(); ctx.restore();
    return true;
  }

  drawGunplay(ctx, state, time, view = {}) {
    if (view.menu || view.showMap || view.paused) return;
    for (const effect of this.gunplay.remnants) {
      if (!this.gunplayVisible(state, effect, view)) continue;
      const age = Math.max(0, time - effect.born), life = clamp(1 - age / effect.duration, 0, 1);
      if (!life) continue;
      if (effect.type === 'shot') {
        if (view.reducedMotion) continue;
        ctx.save(); this.clipGunplay(ctx, effect, state);
        const dx = Math.cos(effect.angle), dy = Math.sin(effect.angle), drift = 3 + age * 12;
        // One small puff and one casing per actual shot, with a short global
        // budget. No accumulating decals, smoke volumes, or light emitters.
        if (age < effect.profile.smoke) {
          const fade = 1 - age / effect.profile.smoke, radius = 2.5 + age * 13;
          ctx.globalAlpha = .22 * fade;
          ctx.translate(effect.x + dx * drift, effect.y + dy * drift);
          ctx.rotate(effect.angle);
          ctx.fillStyle = '#b8b5a5'; ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.5, radius * .7, 0, 0, TAU); ctx.fill();
          ctx.restore(); ctx.save(); this.clipGunplay(ctx, effect, state);
        }
        const toss = Math.min(1, age / .22), side = 5 + 17 * toss, back = 9 + age * 13;
        const lift = Math.sin(toss * Math.PI) * 4.5;
        const x = effect.x - dx * back - dy * side, y = effect.y - dy * back + dx * side;
        ctx.globalAlpha = life * .75;
        ctx.fillStyle = 'rgba(31,32,23,.4)'; ctx.fillRect(x, y + 1, 2.6, 1.4);
        ctx.translate(x, y - lift); ctx.rotate(effect.angle + age * 19 + effect.id);
        ctx.fillStyle = '#c2a666'; ctx.fillRect(-1.8, -.65, 3.6, 1.3); ctx.restore();
        continue;
      }
      if (age < .06 && effect.segmentStart && effect.segmentEnd) {
        const streak = projectileStreak({ ...effect.segmentEnd, px: effect.segmentStart.x, py: effect.segmentStart.y, weapon: effect.weapon }, view.reducedMotion);
        // Terminate just before the solid face so its point visibility is
        // meaningful. The stroke still uses only the actual collision segment.
        if (streak && streak.length > .8) {
          const end = { x: streak.x - streak.ux * .8, y: streak.y - streak.uy * .8 };
          const clipped = projectileStreak({ ...end, px: streak.tailX, py: streak.tailY, weapon: effect.weapon }, view.reducedMotion);
          if (clipped) this.drawProjectileStreak(ctx, state, clipped, view, life * .7);
        }
      }
      ctx.save(); this.clipGunplay(ctx, effect, state);
      const style = effect.style;
      ctx.translate(effect.x, effect.y); ctx.rotate(effect.angle);
      if (view.reducedMotion) {
        ctx.globalAlpha = life * .65;
        circle(ctx, 1.5, 0, style.kind === 'metal' ? 2.6 : 3.8, style.color);
        ctx.restore(); continue;
      }
      if (style.kind !== 'metal') {
        const radius = 2.5 + (1 - life) * (style.kind === 'sand' ? 11 : 8);
        ctx.globalAlpha = life * .28; ctx.fillStyle = style.dust;
        ctx.beginPath(); ctx.ellipse(2 + (1 - life) * 6, 0, radius, radius * .7, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = life * .85;
      circle(ctx, .4, 0, 1.3 + life * 1.1, style.kind === 'metal' && age < .045 ? '#fff2c7' : '#6e6754');
      const count = this.quality === 'performance' ? Math.min(3, style.particles) : style.particles;
      for (let i = 0; i < count; i++) {
        const spread = (hash(effect.id + i * 19) - .5) * 2.5;
        const reach = 2 + Math.sqrt(1 - life) * style.reach * (.5 + hash(effect.id * 2 + i) * .5);
        const x = Math.cos(spread) * reach, y = Math.sin(spread) * reach;
        if (style.kind === 'metal') line(ctx, x * .55, y * .55, x, y, style.color, (life > .6 ? 1.3 : .8) / this.camera.zoom);
        else if (style.kind === 'wood') line(ctx, x - Math.cos(spread) * 3.4, y - Math.sin(spread) * 3.4, x, y, style.color, 1.2);
        else { ctx.fillStyle = style.color; ctx.fillRect(x - 1.1, y - .7, 2.2, 1.5); }
      }
      ctx.restore();
    }
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

  bloodSprite(variant = 0) {
    const variation = Math.abs(Math.trunc(finite(variant))) % 4, key = `blood:${variation}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const sprite = newCanvas(64, 48), ctx = sprite.getContext('2d');
    ctx.translate(32, 24);
    // A few irregular, dried marks read at phone scale without a glossy pool
    // or a separate particle simulation. These four small textures are reused.
    ctx.fillStyle = 'rgba(126,45,38,.9)';
    ctx.beginPath(); ctx.ellipse(-3, 0, 14, 7, -.25 + variation * .17, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const seed = variation * 31 + i * 7, angle = hash(seed + 4) * TAU, reach = 8 + hash(seed + 9) * 17;
      circle(ctx, Math.cos(angle) * reach, Math.sin(angle) * reach * .61, 1 + hash(seed + 12) * 2.7, i % 3 ? 'rgba(135,43,36,.9)' : 'rgba(156,53,43,.83)');
    }
    this.sprites.set(key, sprite); return sprite;
  }

  breachSprite(variant = 0) {
    const variation = Math.abs(Math.trunc(finite(variant))) % 3, key = `breach:${variation}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const sprite = newCanvas(128, 64), ctx = sprite.getContext('2d');
    ctx.translate(64, 16);
    ctx.fillStyle = 'rgba(167,150,115,.24)'; ctx.beginPath(); ctx.ellipse(0, 13, 49, 18, 0, 0, TAU); ctx.fill();
    // Most of the masonry falls beside the usable center of the passage.
    for (let i = 0; i < 16; i++) {
      const seed = variation * 23 + i * 11, side = i % 2 ? 1 : -1;
      const x = side * (30 + hash(seed + 3) * 21), y = -1 + hash(seed + 7) * 25;
      ctx.save(); ctx.translate(x, y); ctx.rotate(hash(seed + 9) * Math.PI);
      ctx.fillStyle = 'rgba(38,40,30,.35)'; ctx.fillRect(-2, -1, 5 + hash(seed) * 4, 5);
      ctx.fillStyle = i % 3 ? '#a99a78' : '#c0ae87'; ctx.fillRect(-3, -3, 4 + hash(seed) * 4, 4);
      ctx.restore();
    }
    for (let i = 0; i < 7; i++) {
      const x = (hash(i + variation * 17) - .5) * 51, y = 8 + hash(i + 31) * 26;
      ctx.fillStyle = '#93876b'; ctx.fillRect(x, y, 2, 2);
    }
    this.sprites.set(key, sprite); return sprite;
  }

  bodySprite(body) {
    const team = body.team === 'allied' ? 'squad' : ['squad', 'civilian', 'survivor'].includes(body.team) ? body.team : 'enemy';
    const kit = team === 'squad' && ['leader', 'medic', 'support', 'grenadier'].includes(body.role) ? body.role : ['sniper', 'gunner', 'flanker'].includes(body.kind) ? body.kind : 'rifleman';
    const pose = Math.abs(Math.trunc(finite(body.pose))) % 3, key = `body:${team}:${kit}:${pose}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const sprite = newCanvas(64, 48), ctx = sprite.getContext('2d');
    const civilian = team === 'civilian', uniform = team === 'squad' ? '#788062' : civilian ? '#91889b' : team === 'survivor' ? '#938e6d' : '#866b4f';
    const gear = team === 'squad' ? '#414b38' : '#514c3b', bend = [-1, 1, .35][pose];
    ctx.translate(32, 24); ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(23,27,21,.38)'; ctx.beginPath(); ctx.ellipse(-1, 3, 24, 10, .1, 0, TAU); ctx.fill();
    // Relaxed, uneven limbs and a dropped weapon distinguish a true death
    // from the tidy casualty pose, aid ring and HELP badge of a living soldier.
    line(ctx, -9, -3, -18, -5 - bend * 3, uniform, 5);
    line(ctx, -18, -5 - bend * 3, -25, -2 - bend * 5, gear, 4);
    line(ctx, -9, 4, -19, 6 + bend * 3, uniform, 5);
    line(ctx, -19, 6 + bend * 3, -23, 10 + bend * 2, gear, 4);
    line(ctx, 4, -5, 1 - bend * 4, -12, uniform, 4);
    line(ctx, 1 - bend * 4, -12, 8, -15 + bend * 2, civilian ? '#6c5649' : '#8a8464', 3);
    line(ctx, 4, 5, 10, 11 + bend, uniform, 4);
    line(ctx, 10, 11 + bend, 17, 9 + bend * 3, civilian ? '#6c5649' : '#8a8464', 3);
    roundRect(ctx, -12, -6, 22, 12, 4, uniform, 'rgba(37,42,31,.5)');
    if (!civilian) {
      roundRect(ctx, -7, -5, kit === 'grenadier' ? 13 : kit === 'flanker' ? 6 : 10, 10, 2, gear);
      line(ctx, -5, -3, -5, 3, '#9d9673', 1);
      if (kit === 'medic') {
        ctx.fillStyle = '#aeb698'; ctx.fillRect(-10, -6, 5, 5);
        line(ctx, -7.5, -5, -7.5, -2, '#5c6b51', 1); line(ctx, -9, -3.5, -6, -3.5, '#5c6b51', 1);
      }
    }
    circle(ctx, 13, bend, 4.7, civilian ? '#695449' : '#908767', 'rgba(40,43,32,.55)', 1);
    if (!civilian) {
      ctx.fillStyle = team === 'squad' ? '#808568' : '#8d7d5d';
      ctx.beginPath(); ctx.ellipse(14, bend - 1, 4.5, 3.5, -.2, 0, TAU); ctx.fill();
      if (team !== 'survivor') {
        const beltFed = kit === 'support' || kit === 'gunner', length = beltFed || kit === 'sniper' ? 26 : kit === 'flanker' ? 18 : 20;
        line(ctx, -3, 16, -3 + length, 13, '#30382b', beltFed ? 3 : 2);
        line(ctx, 0, 15.6, 6, 15, '#5e6148', 3.5);
        if (beltFed) { ctx.fillStyle = '#626546'; ctx.fillRect(4, 16, 5, 3); }
      }
    }
    this.sprites.set(key, sprite); return sprite;
  }

  drawBloodstains(ctx, state, view = {}) {
    if (view.menu || view.bloodEffects === false) return;
    for (const stain of state.bloodstains || []) {
      if (!stain.seen || !Number.isFinite(stain.x) || !Number.isFinite(stain.y) || !this.inView(stain.x, stain.y, 35)) continue;
      const visibility = this.houseVisibility(stain, view);
      if (visibility <= .01) continue;
      const width = 32 + clamp(finite(stain.amount, .5), 0, 1) * 18;
      ctx.save(); ctx.globalAlpha = Math.min(1, visibility); ctx.translate(stain.x, stain.y); ctx.rotate(finite(stain.angle));
      // Land slightly beyond the impact so the mark can be read beside a
      // standing actor rather than disappearing entirely under their uniform.
      ctx.drawImage(this.bloodSprite(stain.seed), -width / 2 + 8, -width * .375, width, width * .75); ctx.restore();
    }
  }

  drawBodies(ctx, state, view = {}) {
    if (view.menu) return;
    for (const body of state.bodies || []) {
      if (!body.seen || !Number.isFinite(body.x) || !Number.isFinite(body.y) || !this.inView(body.x, body.y, 40)) continue;
      const visibility = this.houseVisibility(body, view);
      if (visibility <= .01) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, visibility); ctx.translate(body.x, body.y); ctx.rotate(finite(body.angle));
      if (view.bloodEffects !== false) ctx.drawImage(this.bloodSprite(body.pose), -31, -12, 58, 44);
      ctx.drawImage(this.bodySprite(body), -32, -24); ctx.restore();
    }
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
    for (const district of world.districts || []) this.drawDistrict(ctx, district);
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
      this.houseCutaways.push({building, canvas:patch, amount:0, wallRevision:finite(building.wallRevision)});
    }
    // Uneven edge establishes the playable district without a bright game-board border.
    ctx.strokeStyle = 'rgba(35,34,27,.55)'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, w, h);
    this.mapCache = cache; this.mapIdentity = world; this.mapMission = missionIndex;
    this.mapLayoutVersion = world.layoutVersion; this.mapLayoutSeed = world.layoutSeed;
    this.geometryWorld = world; this.mapGeometryRevision = finite(world.geometryRevision);
  }

  drawDistrict(ctx, district) {
    const { x, y, w, h, kind } = district, tone = finite(district.tone, .5);
    ctx.save();
    ctx.fillStyle = kind === 'workshop' ? 'rgba(64,68,58,.10)' : kind === 'market' ? 'rgba(185,153,104,.10)' : kind === 'courtyard' ? 'rgba(165,160,126,.08)' : 'rgba(150,137,108,.05)';
    ctx.fillRect(x, y, w, h);
    if (kind === 'courtyard') {
      const px = x + w * .32, py = y + h * .25, pw = w * .36, ph = h * .5;
      ctx.fillStyle = 'rgba(170,165,137,.12)'; ctx.fillRect(px, py, pw, ph);
      for (let xx = px + 20; xx < px + pw; xx += 20) line(ctx, xx, py, xx, py + ph, 'rgba(63,65,51,.12)');
      for (let yy = py + 20; yy < py + ph; yy += 20) line(ctx, px, yy, px + pw, yy, 'rgba(63,65,51,.10)');
    } else if (kind === 'workshop') {
      ctx.setLineDash([12, 5, 22, 8]);
      for (const offset of [0, 12]) line(ctx, x + 18 + offset, y + 24, x + w * (.65 + tone * .2) + offset, y + h - 20, 'rgba(46,49,40,.10)', 3);
    } else if (kind === 'market') {
      for (let i = 0; i < 5; i++) {
        const px = x + 14 + hash(x + i * 7) * (w - 40), py = y + 12 + hash(y + i * 11) * (h - 28);
        ctx.fillStyle = 'rgba(207,173,116,.065)'; ctx.fillRect(px, py, 22 + tone * 24, 10);
      }
    }
    // Worn access paths and patches differ by neighbourhood, while navigation
    // still follows the shared road geometry. All marks are baked just once.
    if (district.surface === 'rutted') {
      for (const offset of [0, 11]) {
        ctx.setLineDash([18, 4, 7, 13]);
        line(ctx, x + 5 + offset, y + 22, x + 17 + offset, y + h - 18, 'rgba(48,47,36,.22)', 2);
      }
    } else if (district.surface === 'patched') {
      ctx.fillStyle = 'rgba(57,59,49,.15)'; ctx.fillRect(x - 8, y + h * .3, 27, 66);
      ctx.fillStyle = 'rgba(181,156,111,.15)'; ctx.fillRect(x + w - 15, y + 32, 27, 52);
    }
    ctx.restore();
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
    const seed = x * 1.32 + y * 2.71 + finite(b.tone) * 13 + finite(b.variation) * 37;
    const palette = b.style === 'workshop' ? ['#8b8c78', '#92947f', '#878876', '#9b9981'] : b.style === 'masonry' ? ['#a18e71', '#aa9478', '#97856c', '#af9a7c'] : ['#a29579', '#b09c79', '#958772', '#b5a284', '#a3977d', '#9b8d70'];
    const concrete = b.color || colorPick(palette, seed);
    ctx.fillStyle = '#4c4c3e'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = concrete; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = 'rgba(233,216,174,.22)'; ctx.fillRect(x + 3, y + 3, w - 6, 4); ctx.fillRect(x + 3, y + 7, 3, h - 10);
    ctx.fillStyle = 'rgba(48,46,34,.28)'; ctx.fillRect(x + 7, y + h - 9, w - 10, 6); ctx.fillRect(x + w - 8, y + 7, 5, h - 12);
    // Concrete slabs and weather stains.
    for (let i = 1; i < Math.ceil(w / 58); i++) line(ctx, x + i * 58, y + 9, x + i * 58, y + h - 10, 'rgba(67,61,47,.09)');
    for (let i = 1; i < Math.ceil(h / 63); i++) line(ctx, x + 9, y + i * 63, x + w - 10, y + i * 63, 'rgba(67,61,47,.055)');
    if (b.style === 'workshop') {
      for (let xx = x + 11; xx < x + w - 9; xx += 8) {
        line(ctx, xx, y + 9, xx, y + h - 11, 'rgba(49,58,49,.14)');
        line(ctx, xx + 2, y + 9, xx + 2, y + h - 11, 'rgba(200,203,169,.12)');
      }
    } else if (b.style === 'masonry') {
      for (let xx = x + 15; xx < x + w - 12; xx += 19) {
        line(ctx, xx, y + h - 9, xx, y + h - 4, 'rgba(55,47,34,.22)');
      }
    }
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

  refreshHouseGeometry(world) {
    const revision = finite(world.geometryRevision);
    if (this.geometryWorld === world && this.mapGeometryRevision === revision) return;
    this.geometryWorld = world; this.mapGeometryRevision = revision;
    for (const house of this.houseCutaways) {
      // A restart or fresh co-op object may retain the same layout texture.
      // Rebind the small cutaways without keeping damaged building references.
      house.building = (world.buildings || []).find(building => building.id === house.building.id) || house.building;
      const building = house.building, wallRevision = finite(building.wallRevision);
      if (finite(house.wallRevision) === wallRevision) continue;
      const ctx = house.canvas.getContext('2d', { alpha: false });
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#777762'; ctx.fillRect(0, 0, house.canvas.width, house.canvas.height);
      ctx.translate(-building.x, -building.y); this.drawInterior(ctx, building);
      house.wallRevision = wallRevision;
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

  drawBreaches(ctx, state, view = {}) {
    if (view.menu) return;
    for (const building of state.world?.buildings || []) for (const breach of building.breaches || []) {
      if (!this.inView(breach.x, breach.y, 90)) continue;
      const half = finite(breach.width, 80) / 2, thickness = finite(breach.thickness, 10);
      const vertical = breach.side === 'east' || breach.side === 'west', center = vertical ? breach.y : breach.x;
      const portal = housePortals(building).find(portal => portal.side === breach.side && Math.abs(portal.normal - (vertical ? breach.x : breach.y)) < .001 && portal.from <= center && portal.to >= center);
      const joinedFrom = portal && portal.from < center - half - .001, joinedTo = portal && portal.to > center + half + .001;
      const reversed = breach.side === 'north' || breach.side === 'east';
      const joinedLeft = reversed ? joinedTo : joinedFrom, joinedRight = reversed ? joinedFrom : joinedTo;
      ctx.save(); ctx.translate(breach.x, breach.y); ctx.rotate(finite(breach.angle));
      // This small sill covers the old roof edge; the rest of the roof and
      // building footprint remain intact. The house patch supplies the room.
      ctx.fillStyle = '#777762'; ctx.fillRect(-half, -thickness - 11, half * 2, thickness + 16);
      // Remove the old doorway post and folded leaf baked into the district
      // cache where this cut now joins it, retaining the worn threshold step.
      for (const edge of [joinedLeft ? -half : null, joinedRight ? half : null]) if (edge !== null) {
        ctx.fillStyle = '#777762'; ctx.fillRect(edge - 8, -thickness - 15, 16, thickness + 28);
        ctx.fillStyle = '#a59b7c'; ctx.fillRect(edge - 8, 1, 16, 8);
        ctx.fillStyle = '#b7ad8c'; ctx.fillRect(edge - 8, 1, 16, 2);
        ctx.fillStyle = 'rgba(55,53,40,.35)'; ctx.fillRect(edge - 8, 9, 16, 3);
      }
      if (!joinedLeft) {
        line(ctx, -half, -thickness - 8, -half, 4, '#474b3a', 3);
        line(ctx, -half - 2, -thickness - 6, -half + 3, -thickness + 3, '#b6a680', 4);
      }
      if (!joinedRight) {
        line(ctx, half, -thickness - 8, half, 4, '#474b3a', 3);
        line(ctx, half - 3, -thickness + 2, half + 2, -thickness - 7, '#b6a680', 4);
      }
      ctx.drawImage(this.breachSprite(breach.from), -64, -16); ctx.restore();
    }
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
    } else if (type === 'oil-stain') {
      ctx.fillStyle = 'rgba(42,43,33,.19)'; ctx.beginPath(); ctx.ellipse(1, -3, w * .42, h * .32, -.15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(47,46,35,.16)'; ctx.beginPath(); ctx.ellipse(-3, h * .2, w * .31, h * .25, .2, 0, TAU); ctx.fill();
      for (let i = 0; i < 6; i++) circle(ctx, (hash(x + i) - .5) * w, (hash(y + i) - .5) * h, 1.5 + hash(x + y + i) * 2, 'rgba(40,42,33,.15)');
    } else if (['car', 'pickup', 'van', 'wreck', 'wrecked-car'].includes(type)) {
      // Old yard decoration used a vertical width/height convention. Real
      // parked cover uses its longitudinal body dimensions and an exact angle.
      if (h > w) ctx.rotate(Math.PI / 2);
      this.drawCivilianVehicle(ctx, p, Math.max(w, h), Math.min(w, h));
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
      for (const xx of [-w / 2 + 2, w / 2 - 2]) for (const yy of [-h / 2 + 2, h / 2 - 2]) circle(ctx, xx, yy, 1.8, '#514934');
      ctx.fillStyle = 'rgba(228,207,161,.25)'; ctx.fillRect(-w / 2 + 2, -h / 2 + 1, w - 4, 2);
    } else if (type === 'handcart') {
      ctx.fillStyle = 'rgba(31,32,25,.24)'; ctx.fillRect(-w / 2 + 4, -h / 2 + 6, w - 6, h);
      for (const yy of [-h / 2, h / 2 - 4]) { ctx.fillStyle = '#34372d'; ctx.fillRect(-w * .12, yy, 11, 4); }
      ctx.fillStyle = '#8d7957'; ctx.fillRect(-w / 2, -h / 2 + 3, w - 9, h - 6);
      for (let xx = -w / 2 + 4; xx < w / 2 - 10; xx += 7) line(ctx, xx, -h / 2 + 3, xx, h / 2 - 3, '#b3a079', 1.2);
      line(ctx, w / 2 - 11, -h / 2 + 4, w / 2, -h / 2 + 4, '#5b523c', 2);
      line(ctx, w / 2 - 11, h / 2 - 4, w / 2, h / 2 - 4, '#5b523c', 2);
      for (let i = 0; i < 3; i++) circle(ctx, -w / 2 + 6 + i * 6, 1, 3.5, ['#8c8151', '#a38f5d', '#8b7650'][i], '#665b3d');
    } else if (type === 'materials') {
      ctx.fillStyle = 'rgba(28,30,24,.28)'; ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
        const px = -w / 2 + col * w / 4, py = -h / 2 + row * h / 3;
        ctx.fillStyle = (row + col) % 3 ? '#aaa28b' : '#8e8b78'; ctx.fillRect(px, py, w / 4 - 1, h / 3 - 1);
        ctx.fillStyle = '#6e7060'; ctx.fillRect(px + 3, py + 2, 2, 2); ctx.fillRect(px + 7, py + 2, 2, 2);
      }
      line(ctx, -w * .25, -h / 2, -w * .25, h / 2, '#625d48', 1.4);
    } else if (type === 'tires') {
      for (let i = 0; i < 3; i++) {
        const px = (i % 2 - .5) * 12, py = i < 2 ? -4 : 5;
        circle(ctx, px + 3, py + 4, 7, 'rgba(26,29,23,.3)');
        circle(ctx, px, py, 7, '#3f4439', '#696956', 1.4); circle(ctx, px, py, 3, '#80765a', '#292f27');
      }
    } else if (type === 'barrels') {
      for (let i = 0; i < 2; i++) {
        const px = (i - .5) * 10, py = i ? 4 : -4;
        circle(ctx, px + 3, py + 4, 7, 'rgba(27,29,24,.3)');
        circle(ctx, px, py, 7, i ? '#8b6951' : '#6d7b72', '#3f4a40', 1.5);
        circle(ctx, px, py, 5, null, '#a09a78'); circle(ctx, px + 2, py - 2, 1, '#424b3b');
      }
    } else if (type === 'sacks' || type === 'jars') {
      for (let i = 0; i < 3; i++) {
        const px = (i - 1) * w * .27, py = i % 2 ? -h * .15 : h * .12;
        if (type === 'jars') { circle(ctx, px + 2, py + 3, 5, 'rgba(40,34,23,.25)'); circle(ctx, px, py, 5, '#ad8b64', '#695d42'); circle(ctx, px, py, 2, '#615c43'); }
        else { roundRect(ctx, px - 5, py - 6, 10, 13, 4, '#b2a47d', '#796e50'); line(ctx, px - 3, py - 3, px + 3, py - 3, '#d0c29a'); }
      }
    } else if (type === 'washline') {
      line(ctx, -w / 2 + 2, -h / 2 + 4, w / 2 - 2, -h / 2 + 4, '#4c5142', .9);
      for (const xx of [-w / 2 + 2, w / 2 - 2]) circle(ctx, xx, -h / 2 + 4, 2, '#726a4d');
      for (let i = 0; i < 4; i++) {
        const xx = -w * .35 + i * w * .2;
        ctx.fillStyle = 'rgba(27,31,25,.15)'; ctx.fillRect(xx + 3, 0, 8, 6);
        ctx.fillStyle = colorPick(['#bcb197', '#8b9b8c', '#a68c79', '#b2ae91'], x + i * 13);
        ctx.fillRect(xx, -h / 2 + 2, 8, 8 + i % 2 * 2);
        line(ctx, xx + 1, -h / 2 + 3, xx + 1, h / 2 - 2, 'rgba(240,223,182,.3)', .7);
      }
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

  drawCivilianVehicle(ctx, prop, w, h) {
    const burned = prop.condition === 'burned' || ['wreck', 'wrecked-car'].includes(prop.type);
    const paint = burned ? '#696653' : prop.paint || colorPick(['#87958c', '#b4a583', '#92745e', '#909388'], prop.x + prop.y);
    if (burned) {
      ctx.fillStyle = 'rgba(34,33,27,.40)'; ctx.beginPath(); ctx.ellipse(0, 0, w * .67, h * .8, .14, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(24,29,24,.35)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
    for (const xx of [-w * .31, w * .28]) for (const yy of [-h / 2, h / 2 - 4]) {
      roundRect(ctx, xx - 5, yy, 11, 4, 1, '#282e28');
    }
    roundRect(ctx, -w / 2, -h / 2 + 2, w, h - 4, prop.type === 'van' ? 3 : 5, paint, '#454c40');
    line(ctx, -w / 2 + 5, -h / 2 + 3, w / 2 - 5, -h / 2 + 3, burned ? '#8c8468' : '#c7c2a7', 1.5);
    for (const xx of [-w / 2 + 1, w / 2 - 2]) { ctx.fillStyle = '#7f8270'; ctx.fillRect(xx, -h / 2 + 4, 2, h - 8); }
    if (prop.type === 'pickup') {
      ctx.fillStyle = burned ? '#45483d' : '#666e5d'; ctx.fillRect(-w / 2 + 5, -h / 2 + 5, w * .42, h - 10);
      for (let xx = -w / 2 + 9; xx < -w * .08; xx += 6) line(ctx, xx, -h / 2 + 6, xx, h / 2 - 6, '#8f9276');
      ctx.fillStyle = '#3a514d'; ctx.fillRect(w * .10, -h / 2 + 4, w * .08, h - 8);
      ctx.fillStyle = paint; ctx.fillRect(-w * .02, -h / 2 + 4, w * .12, h - 8);
      ctx.strokeStyle = '#545d4d'; ctx.lineWidth = 1; ctx.strokeRect(-w * .02, -h / 2 + 4, w * .20, h - 8);
      line(ctx, w * .29, -h / 2 + 4, w * .29, h / 2 - 4, '#5e6654');
    } else if (prop.type === 'van') {
      roundRect(ctx, -w / 2 + 6, -h / 2 + 5, w * .68, h - 10, 2, burned ? '#74725b' : paint, '#68715e');
      for (let xx = -w / 2 + 11; xx < w * .15; xx += 13) line(ctx, xx, -h / 2 + 7, xx, h / 2 - 7, 'rgba(218,214,184,.24)');
      ctx.fillStyle = '#3f5753'; ctx.fillRect(w * .23, -h / 2 + 4, w * .10, h - 8);
      line(ctx, w * .36, -h / 2 + 4, w * .36, h / 2 - 4, '#737b65');
    } else {
      ctx.fillStyle = '#3d524d'; ctx.fillRect(-w * .23, -h / 2 + 5, w * .48, h - 10);
      roundRect(ctx, -w * .14, -h / 2 + 6, w * .26, h - 12, 2, paint, '#727965');
      line(ctx, w * .29, -h / 2 + 4, w * .29, h / 2 - 4, '#666f5a');
      line(ctx, -w * .31, -h / 2 + 4, -w * .31, h / 2 - 4, '#666f5a');
    }
    for (const yy of [-h / 2 + 4, h / 2 - 8]) {
      ctx.fillStyle = burned ? '#78775b' : '#d0c79c'; ctx.fillRect(w / 2 - 4, yy, 3, 4);
      ctx.fillStyle = '#815546'; ctx.fillRect(-w / 2 + 1, yy, 2, 4);
    }
    if (prop.condition === 'damaged' || burned) {
      line(ctx, w * .18, -h * .25, w * .05, h * .18, '#a5aa92', .9);
      line(ctx, w * .07, -h * .06, w * .22, h * .14, '#a5aa92', .8);
      line(ctx, -w * .30, h / 2 - 2, -w * .10, h / 2 - 4, '#645541', 2);
    }
    if (burned) {
      circle(ctx, w * .3, 0, h * .37, 'rgba(28,31,26,.78)');
      line(ctx, w * .20, -h / 2 + 3, w * .38, h / 2 - 4, '#3b4034', 2);
    }
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

  drawAmbientFires(ctx, state, time, view = {}) {
    if (view.showMap || view.menu) return;
    const world = state.world;
    if (this.ambientFireWorld !== world || this.ambientFireRevision !== world.geometryRevision) {
      this.ambientFireWorld = world; this.ambientFireRevision = world.geometryRevision;
      this.ambientFireMasks = new Map();
    }
    // Three sources per authored world at most. No per-frame particle array,
    // allocation, unbounded emitter, or additional full-screen render layer.
    const fires = world.ambientFires || [];
    for (let index = 0; index < Math.min(fires.length, 4); index++) {
      const fire = fires[index];
      if (!this.inView(fire.x, fire.y, 110) || !squadCanSeePoint(state, fire)) continue;
      let polygon = this.ambientFireMasks.get(fire.id);
      if (!polygon) {
        polygon = muzzleLightPolygon(world, fire, 110);
        this.ambientFireMasks.set(fire.id, polygon);
      }
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < polygon.length; i++) {
        const point = polygon[i]; if (i) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y);
      }
      ctx.closePath(); ctx.clip();
      const animation = (view.reducedMotion ? 0 : time) + finite(fire.phase), strength = clamp(finite(fire.intensity, .6), .2, 1);
      this.drawFire(ctx, fire.x, fire.y, animation, 8 + strength * 7);
      const plume = this.radialSprite('street-plume', [[0, 'rgba(48,46,36,.8)'], [1, 'rgba(48,46,36,0)']]);
      const count = this.quality === 'performance' ? 2 : 4;
      for (let i = 0; i < count; i++) {
        const drift = ((animation * 5 + i * 23) % 83), r = 9 + drift * .20;
        const x = fire.x + drift * .30, y = fire.y - drift * .57;
        ctx.globalAlpha = (.30 + strength * .12) * (1 - drift / 100);
        ctx.drawImage(plume, x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
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
    return enemyInSharedSight(state, actor);
  }

  drawActor(ctx, actor, state, time, view) {
    if (actor.alive === false) return;
    const isPlayer = actor.id === state.playerId, squadmate = actor.team === 'squad', alliedPatrol = actor.team === 'allied', ally = squadmate || alliedPatrol, civilian = actor.team === 'civilian', survivor = actor.team === 'survivor';
    const radius = Math.max(7, finite(actor.radius, 10)), profile = ally ? roleProfile(actor) : null;
    const appearance = personAppearance(actor);
    const angle = finite(actor.angle), pulse = .5 + Math.sin(time * 4) * .5;
    const flinch = this.gunplay.flinch(actor.id, time, view.reducedMotion || view.menu);
    ctx.save(); ctx.translate(actor.x + flinch.x, actor.y + flinch.y);
    if (!view.menu && isPlayer) {
      const ringRadius = radius + (view.touch ? 5 : 7);
      ctx.fillStyle = 'rgba(133,205,175,.08)'; ctx.beginPath(); ctx.arc(0, 0, ringRadius + 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(12,25,20,.72)'; ctx.lineWidth = 4 / this.camera.zoom; ctx.beginPath(); ctx.arc(0, 0, ringRadius, .15, TAU - .15); ctx.stroke();
      ctx.strokeStyle = COLORS.player; ctx.lineWidth = 1.7 / this.camera.zoom; ctx.beginPath(); ctx.arc(0, 0, ringRadius, .15, TAU - .15); ctx.stroke();
      ctx.save(); ctx.rotate(angle); ctx.fillStyle = COLORS.player; ctx.beginPath(); ctx.moveTo(radius + 13, 0); ctx.lineTo(radius + 7, -3.5); ctx.lineTo(radius + 7, 3.5); ctx.fill(); ctx.restore();
    } else if (!view.menu && ally) {
      ctx.strokeStyle = actor.downed ? '#e2a16c' : alliedPatrol ? 'rgba(147,185,205,.7)' : 'rgba(135,202,180,.65)'; ctx.lineWidth = 1.4 / this.camera.zoom;
      if (alliedPatrol) ctx.setLineDash([5 / this.camera.zoom, 4 / this.camera.zoom]);
      ctx.beginPath(); ctx.arc(0, 0, radius + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    } else if (!view.menu && (civilian || survivor)) {
      ctx.strokeStyle = 'rgba(206,204,231,.45)'; ctx.lineWidth = 1 / this.camera.zoom;
      ctx.beginPath(); ctx.moveTo(0, -radius - 5); ctx.lineTo(radius + 5, 0); ctx.lineTo(0, radius + 5); ctx.lineTo(-radius - 5, 0); ctx.closePath(); ctx.stroke();
    }
    ctx.save(); ctx.rotate(angle);
    const frightened = civilian && !actor.downed && (['sheltered', 'cowering'].includes(actor.civilianState) || finite(actor.panicked) > 0);
    if (frightened) ctx.scale(.88, .86);
    const uniform = appearance.uniform, gear = appearance.gear;
    if (actor.downed) {
      ctx.fillStyle = 'rgba(21,27,22,.45)'; ctx.beginPath(); ctx.ellipse(4, 5, 17, 9, 0, 0, TAU); ctx.fill();
      roundRect(ctx, -13, -5, 24, 10, 4, uniform);
      circle(ctx, 12, 0, 5, appearance.headwear === 'helmet' ? uniform : appearance.skin);
      line(ctx, -13, -3, -20, -6, gear, 4); line(ctx, -13, 3, -19, 8, gear, 4);
    } else {
      ctx.fillStyle = view.touch ? 'rgba(17,22,18,.56)' : 'rgba(21,27,22,.4)'; ctx.beginPath(); ctx.ellipse(5, 6, 12, 9, -.2, 0, TAU); ctx.fill();
      const walk = actor.moving || Math.hypot(actor.vx || 0, actor.vy || 0) > 3;
      const braced = actor.kind === 'gunner' && actor.braced || (ally && actor.role === 'support' && !walk && actor.tactic === 'contact'), cowering = frightened && !walk;
      const animationTime = view.reducedMotion ? 0 : time;
      const stride = !view.reducedMotion && walk && !braced ? Math.sin(animationTime * (frightened ? 20 : 16) + appearance.phase) * 3.1 : 0;
      const breath = !walk && !view.reducedMotion ? Math.sin(animationTime * 2.8 + appearance.phase) * .28 : 0;
      line(ctx, -5, -4, (braced ? -14 : cowering ? -7 : -10) + stride, braced ? -8 : cowering ? -8 : -5, '#494b36', 4);
      line(ctx, -5, 4, (braced ? -14 : cowering ? -7 : -10) - stride, braced ? 8 : cowering ? 8 : 5, '#494b36', 4);
      // Separate boots, shoulder seams and worn cloth keep the silhouettes
      // legible at normal zoom; the simulation still uses the same radius.
      line(ctx, -10 + stride, -5, -12 + stride, -5.5, '#30382d', 3.3);
      line(ctx, -10 - stride, 5, -12 - stride, 5.5, '#30382d', 3.3);
      ctx.translate(breath, 0);
      ctx.fillStyle = uniform; ctx.beginPath(); ctx.ellipse(-1, 0, 8, 10 * appearance.width, 0, 0, TAU); ctx.fill();
      if (view.touch) { ctx.strokeStyle = 'rgba(24,31,24,.8)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      line(ctx, -4, -8, 2, -8, '#c2b697', .8); line(ctx, -4, 8, 2, 8, '#625e49', .8);
      if (appearance.pack) roundRect(ctx, -11, -5.5, 6, 11, 1.7, gear, '#3f4938');
      if (!civilian) {
        ctx.fillStyle = gear; ctx.fillRect(-6, -6, actor.kind === 'flanker' ? 4 : 7, 12);
        if (actor.kind === 'gunner') { ctx.fillStyle = '#6c6a4c'; ctx.fillRect(-10, -7, 4, 6); ctx.fillRect(-10, 2, 4, 6); }
        if (profile?.id === 'grenadier') { ctx.fillStyle = '#596445'; ctx.fillRect(-11, -8, 7, 16); line(ctx, -9, -6, -9, 5, '#aaa37a', 2); }
        ctx.fillStyle = '#b4ad83'; ctx.fillRect(-5, -5, 2, 3); ctx.fillRect(-5, 2, 2, 3);
        line(ctx, -5, -7, 5, 5, '#3f4635', 1.1);
        if (ally && (profile?.id === 'leader' || alliedPatrol && actor.role === 'leader')) {
          ctx.fillStyle = '#384734'; ctx.fillRect(-7, -8, 3, 5); line(ctx, -7, -8, -12, -14, '#28392c', .9);
        }
      }
      if (!civilian && !survivor) {
        const reloading = finite(actor.reloadTimer) > 0;
        const kick = reloading ? 0 : this.gunplay.kick(actor.id, time, view.reducedMotion || view.menu);
        ctx.save(); ctx.translate(-kick, 0); ctx.rotate(-kick * .009);
        const reloadReach = reloading ? 5 + (!view.reducedMotion ? Math.sin(time * 7 + appearance.phase) * 1.5 : 0) : 11;
        line(ctx, 2, -6, 10, -3, uniform, 4); line(ctx, 2, 6, reloadReach, 3, uniform, 4);
        circle(ctx, 10, -3, 1.8, appearance.skin); circle(ctx, reloadReach, 3, 1.8, appearance.skin);
        if (profile?.id === 'grenadier' && actor.observing) {
          // Slung launcher and raised binoculars, rather than a second HUD panel.
          line(ctx, 0, 8, 18, 8, '#29392e', 3);
          ctx.fillStyle = '#25362c'; ctx.fillRect(8, -6, 8, 4); ctx.fillRect(8, 2, 8, 4);
          line(ctx, 11, -2, 11, 2, '#8d9d83', 2);
        } else {
          const beltFed = profile?.id === 'support' || actor.kind === 'gunner';
          const barrel = beltFed ? 30 : actor.kind === 'sniper' ? 32 : actor.kind === 'flanker' ? 21 : 24;
          line(ctx, 4, 2, barrel, 2, '#202d25', beltFed ? 3.8 : 3);
          ctx.fillStyle = '#48513c'; ctx.fillRect(10, 0, 5, 5);
          if (beltFed) {
            ctx.fillStyle = '#6f7550'; ctx.fillRect(10, 4, 8, 6);
            const spread = actor.kind === 'gunner' ? 2 + clamp(finite(actor.braceProgress), 0, 1) * 4 : 5;
            line(ctx, 24, 2, 27, 2 - spread, '#293a2d', 1.5); line(ctx, 24, 2, 27, 2 + spread, '#293a2d', 1.5);
          } else if (profile?.id === 'grenadier') line(ctx, 10, 6, 22, 6, '#556047', 4);
          else if (actor.kind === 'sniper') { ctx.fillStyle = '#3b493a'; ctx.fillRect(12, -1, 8, 3); }
          if (view.touch) line(ctx, 15, 1, barrel - 1, 1, '#8b9078', .7);
        }
        ctx.restore();
      } else if (frightened) {
        // Bent shoulders and empty hands close to the head distinguish a
        // person seeking cover without adding another tactical label.
        line(ctx, -1, -7, 6, -6, uniform, 3.5); line(ctx, 6, -6, 7, -2, '#806957', 2.4);
        line(ctx, -1, 7, 6, 6, uniform, 3.5); line(ctx, 6, 6, 7, 2, '#806957', 2.4);
      } else {
        line(ctx, 0, -7, 8, -8, uniform, 3.5); line(ctx, 0, 7, 8, 8, uniform, 3.5);
      }
      circle(ctx, 3.5, 0, 4.8, appearance.skin);
      if (appearance.headwear === 'helmet') {
        circle(ctx, 1, 0, 6.2, uniform, gear, 1.2);
        line(ctx, 0, -3, 6, -3, '#c0b997', 1.1); circle(ctx, -2, 1, 2, '#747b59');
        line(ctx, -1, 4, 5, 4, '#4b523e', .8);
      } else if (appearance.headwear === 'wrap') {
        circle(ctx, 1.5, 0, 5.6, '#b7ad91', gear, .7);
        line(ctx, -2, -3, 5, -2, '#84785c', 1); line(ctx, -2, 3, 4, 3, '#d0c5a5', .8);
      } else {
        circle(ctx, 1, 0, 4.6, appearance.headwear === 'cap' ? gear : appearance.hair);
        if (appearance.headwear === 'cap') line(ctx, 4, -3, 7, 3, gear, 2.3);
      }
      if (profile?.id === 'medic' || actor.kind === 'medic') {
        ctx.fillStyle = '#d6ddbd'; ctx.fillRect(-7, -9, 6, 6);
        line(ctx, -4, -8, -4, -4, '#66765b', 1.2); line(ctx, -6, -6, -2, -6, '#66765b', 1.2);
      } else if (profile?.id === 'leader') {
        line(ctx, -4, -7, -1, -9, '#d4d2a6', 1); line(ctx, -1, -9, 2, -7, '#d4d2a6', 1);
      }
      if (actor.team === 'enemy' && actor.kind === 'sniper' && actor.aimCharge > .1 && !view.menu) {
        // Called only for a currently sighted actor: the glint cannot reveal a
        // gunman through masonry or smoke, including stale network snapshots.
        const charge = clamp(actor.aimCharge, 0, 1), size = 2.5 + charge * 2;
        ctx.save(); ctx.globalAlpha = .35 + charge * .6;
        circle(ctx, 17, -1, size * .55, '#f0d4a0');
        line(ctx, 17 - size, -1, 17 + size, -1, '#f5dca8', .8);
        line(ctx, 17, -1 - size, 17, -1 + size, '#f5dca8', .8); ctx.restore();
      }
    }
    ctx.restore(); ctx.restore();
    if (actor.downed && !view.menu) {
      const p = this.worldToScreen(actor.x, actor.y - 22);
      this.screenBadge(p.x, p.y, ally ? 'HELP' : 'WOUNDED', '#edb37b', .8 + pulse * .2);
    } else if (squadmate && this.camera.zoom > .65 && !view.menu) {
      const hp = clamp(actor.hp / (actor.maxHp || 100), 0, 1);
      if (hp < .85) {
        const p = this.worldToScreen(actor.x, actor.y - 24);
        this.ctx.save(); this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.fillStyle = 'rgba(17,25,21,.8)'; this.ctx.fillRect(p.x - 15, p.y, 30, 4);
        this.ctx.fillStyle = hp < .35 ? '#d98869' : '#8bbba2'; this.ctx.fillRect(p.x - 15, p.y, 30 * hp, 4); this.ctx.restore();
      }
      if (!isPlayer && !(view.touch && view.guidance !== 'simple')) {
        const name = (actor.name || '').split(' ').at(-1).toUpperCase();
        this.worldLabel(actor.x, actor.y + 25, `${name}${name ? ' · ' : ''}${profile.shortLabel}`, '#c3d5be', 10);
      }
    } else if (alliedPatrol && actor.role === 'leader' && this.camera.zoom > .65 && !view.menu && !view.touch) {
      this.worldLabel(actor.x, actor.y + 25, actor.callsign || 'FRIENDLY PATROL', '#acc8d3', 10);
      if (view.guidance === 'simple' && actor.assignment) this.worldLabel(actor.x, actor.y + 39, actor.assignment, '#acbdb4', 9);
    }
  }

  worldLabel(x, y, text, color = '#dedbc5', fontSize = 12) {
    if (!text || this.menuView || this.touchView && this.guidanceView === 'expert') return;
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
      // Routine labels are expendable when a nearby soldier or object would
      // place text across the controlled soldier's body or aiming origin.
      if (this.focusScreen && Math.abs(p.x - this.focusScreen.x) < half + 24 && Math.abs(p.y - this.focusScreen.y) < 30) { ctx.restore(); return; }
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
    if (['interact', 'recon', 'deliver', 'escort'].includes(o.kind)) {
      const target = o.actionTarget || o, x = finite(target.x, o.x), y = finite(target.y, o.y);
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = COLORS.objective; ctx.lineWidth = 1.5 / this.camera.zoom;
      if (o.kind === 'recon') {
        const angle = o.lookAt ? Math.atan2(o.lookAt.y - o.y, o.lookAt.x - o.x) : 0;
        ctx.save(); ctx.rotate(angle); ctx.strokeStyle = 'rgba(230,186,115,.36)';
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.arc(0, 0, 55, -.3, .3); ctx.closePath(); ctx.stroke(); ctx.restore();
        circle(ctx, -4, 0, 4, 'rgba(25,35,28,.8)', COLORS.objective, 1.2); circle(ctx, 4, 0, 4, 'rgba(25,35,28,.8)', COLORS.objective, 1.2);
        line(ctx, -2, -3, 2, -3, COLORS.objective, 1.4);
      } else if (o.kind === 'escort') {
        for (const at of [-5, 5]) { ctx.beginPath(); ctx.moveTo(-6, at + 4); ctx.lineTo(0, at - 2); ctx.lineTo(6, at + 4); ctx.stroke(); }
      } else {
        const gap = 17;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath(); ctx.moveTo(sx * gap, sy * (gap - 6)); ctx.lineTo(sx * gap, sy * gap); ctx.lineTo(sx * (gap - 6), sy * gap); ctx.stroke();
        }
      }
      if (o.progress > 0) {
        ctx.fillStyle = 'rgba(27,35,27,.8)'; ctx.fillRect(-20, 23, 40, 4);
        ctx.fillStyle = COLORS.objective; ctx.fillRect(-20, 23, 40 * clamp(o.progress, 0, 1), 4);
      }
      ctx.restore();
      if (this.camera.zoom > .55 && view.guidance !== 'expert') this.worldLabel(x, y - 32, (o.title || o.interactionLabel || 'OBJECTIVE').toUpperCase(), COLORS.objective, 11);
      return;
    }
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

  drawOperationObjects(ctx, state, view = {}) {
    if (view.menu) return;
    const operation = state.operation;
    if (!operation) return;
    const draw = (object, carried = false) => {
      if (!Number.isFinite(object.x) || !Number.isFinite(object.y) || !this.inView(object.x, object.y, 60) || this.houseVisibility(object, view) < .9 || !squadCanSeePoint(state, object)) return;
      ctx.save(); ctx.translate(object.x, object.y); if (carried) ctx.scale(.65, .65);
      ctx.globalAlpha = object.completed ? .7 : 1;
      ctx.fillStyle = 'rgba(20,25,19,.35)'; ctx.beginPath(); ctx.ellipse(2, 4, 17, 10, 0, 0, TAU); ctx.fill();
      if (object.kind === 'radio') {
        roundRect(ctx, -14, -9, 28, 19, 3, '#444f40', '#96977a');
        ctx.fillStyle = '#273a31'; ctx.fillRect(-9, -5, 11, 8);
        line(ctx, -7, -1, -4, 1, '#acbc8b', 1); line(ctx, -4, 1, -1, -3, '#acbc8b', 1);
        circle(ctx, 8, -3, 2.3, '#b3ad85'); circle(ctx, 8, 5, 1.3, object.completed ? '#94b78a' : '#d7b36c');
        line(ctx, 11, -8, 15, -29, '#b0ac83', 1.7); line(ctx, -11, 11, -17, 15, '#485442', 2);
      } else if (object.kind === 'evac') {
        roundRect(ctx, -16, -9, 32, 18, 3, '#8b9176', '#3a4838');
        line(ctx, -23, -7, 23, -7, '#a1a384', 2); line(ctx, -23, 7, 23, 7, '#a1a384', 2);
        ctx.fillStyle = '#d2d5b7'; ctx.fillRect(-3, -6, 6, 12); ctx.fillRect(-7, -2, 14, 4);
      } else {
        const medical = object.kind === 'medical';
        roundRect(ctx, -11, -8, 22, 16, 3, medical ? '#798468' : '#4d594c', '#b4b493');
        ctx.fillStyle = '#3c4938'; ctx.fillRect(-3, -10, 6, 3); ctx.fillRect(-2, -8, 4, 16);
        if (medical) { ctx.fillStyle = '#dedfc5'; ctx.fillRect(-1, -4, 3, 8); ctx.fillRect(-4, -1, 9, 3); }
        else { circle(ctx, -7, -4, 1.3, '#c0b276'); circle(ctx, 7, -4, 1.3, '#c0b276'); line(ctx, -6, 3, 6, 3, '#9da58a', 1); }
      }
      ctx.restore();
    };
    for (const object of operation.objects || []) draw(object);
    for (const item of operation.items || []) {
      if (item.status === 'ground') draw(item);
      else if (item.status === 'carried') {
        const carrier = (state.squad || []).find(actor => actor.id === item.carrierId && actor.alive !== false);
        if (carrier) draw({ ...item, x: carrier.x - Math.cos(finite(carrier.angle)) * 16, y: carrier.y - Math.sin(finite(carrier.angle)) * 16 }, true);
      }
    }
  }

  drawStoryOpportunities(state, view = {}) {
    if (view.menu) return;
    const player = (state.squad || []).find(actor => actor.id === (view.followActorId || state.playerId));
    const ctx = this.ctx, size = 11 / this.camera.zoom;
    for (const opportunity of state.story?.opportunities || []) {
      if (!opportunity.revealed || opportunity.status !== 'available' || !Number.isFinite(opportunity.x) || !Number.isFinite(opportunity.y) || !this.inView(opportunity.x, opportunity.y, 45) || this.houseVisibility(opportunity, view) <= .05) continue;
      ctx.save(); ctx.translate(opportunity.x, opportunity.y);
      circle(ctx, 0, 0, size, 'rgba(25,36,33,.55)', 'rgba(175,196,202,.8)', 1 / this.camera.zoom);
      line(ctx, -size * .4, 0, size * .4, 0, '#bdcdd1', 1.5 / this.camera.zoom);
      line(ctx, 0, -size * .4, 0, size * .4, '#bdcdd1', 1.5 / this.camera.zoom);
      if (opportunity.progress > 0) {
        ctx.strokeStyle = '#bfdbd8'; ctx.lineWidth = 2 / this.camera.zoom;
        ctx.beginPath(); ctx.arc(0, 0, size + 4 / this.camera.zoom, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(opportunity.progress, 0, 1)); ctx.stroke();
      }
      ctx.restore();
      if (view.guidance !== 'expert' && player && distance(player, opportunity) < 185 && this.camera.zoom > .55) this.worldLabel(opportunity.x, opportunity.y - size - 12 / this.camera.zoom, 'AID', '#bdcdd1', 10);
    }
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
        if (!previous || previous.world !== state.world || previous.geometryRevision !== finite(state.world.geometryRevision) || Math.abs(from.x-previous.from.x) + Math.abs(from.y-previous.from.y) + Math.abs(target.x-previous.target.x) + Math.abs(target.y-previous.target.y) > .5) {
          this.aimTrace = {world:state.world, geometryRevision:finite(state.world.geometryRevision), from, target, result:traceAim(state.world,from,target)};
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
    if (view.menu) return;
    const quick = view.quickOrder;
    if (quick?.active && Number.isFinite(quick.point?.x) && Number.isFinite(quick.point?.y)) {
      const { x, y } = quick.point, ctx = this.ctx;
      const pulse = view.reducedMotion ? .4 : (time * 1.8) % 1, size = (17 + pulse * 10) / this.camera.zoom;
      ctx.save();
      circle(ctx, x, y, size, 'rgba(153,220,194,.08)', `rgba(174,231,207,${.75 - pulse * .4})`, 1.5 / this.camera.zoom);
      line(ctx, x, y - 25 / this.camera.zoom, x, y - 8 / this.camera.zoom, '#c3eed9', 2 / this.camera.zoom);
      ctx.fillStyle = '#c3eed9'; ctx.beginPath(); ctx.moveTo(x, y - 4 / this.camera.zoom);
      ctx.lineTo(x - 4 / this.camera.zoom, y - 10 / this.camera.zoom); ctx.lineTo(x + 4 / this.camera.zoom, y - 10 / this.camera.zoom); ctx.fill();
      ctx.restore();
    }
    const order = state.order;
    if (!order || !Number.isFinite(order.x) || !Number.isFinite(order.y) || order.type === 'follow') return;
    const ctx = this.ctx; ctx.save();
    const size = 16 / this.camera.zoom; ctx.strokeStyle = '#9fd7c2'; ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.beginPath(); ctx.moveTo(order.x - size, order.y - size / 2); ctx.lineTo(order.x - size, order.y - size); ctx.lineTo(order.x - size / 2, order.y - size);
    ctx.moveTo(order.x + size / 2, order.y - size); ctx.lineTo(order.x + size, order.y - size); ctx.lineTo(order.x + size, order.y - size / 2);
    ctx.moveTo(order.x + size, order.y + size / 2); ctx.lineTo(order.x + size, order.y + size); ctx.lineTo(order.x + size / 2, order.y + size);
    ctx.moveTo(order.x - size / 2, order.y + size); ctx.lineTo(order.x - size, order.y + size); ctx.lineTo(order.x - size, order.y + size / 2); ctx.stroke();
    ctx.restore();
    if (this.camera.zoom > .5 && !(view.touch && view.guidance === 'expert')) this.worldLabel(order.x, order.y + size + 14 / this.camera.zoom, (order.label || order.type).toUpperCase(), '#a9d6c4', 10);
  }

  drawPings(state, view) {
    if (view.menu) return;
    const ctx=this.ctx,zoom=this.camera.zoom,color='#99cdf4';
    for (const ping of (state.pings||[]).slice(-4)) {
      if (!Number.isFinite(ping.x)||!Number.isFinite(ping.y)||!(ping.expiresAt>state.time)||!this.inView(ping.x,ping.y,40)) continue;
      const remaining=ping.expiresAt-state.time,age=Math.max(0,state.time-ping.createdAt),size=(view.guidance==='simple'?10:8)/zoom;
      ctx.save();ctx.globalAlpha=clamp(remaining,0,1);ctx.translate(ping.x,ping.y);
      if (!view.reducedMotion&&age<.8) circle(ctx,0,0,(12+age*25)/zoom,null,`rgba(153,205,244,${.6*(1-age/.8)})`,1.5/zoom);
      ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size,0);ctx.lineTo(0,size);ctx.lineTo(-size,0);ctx.closePath();
      ctx.fillStyle='#14283be8';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2/zoom;ctx.stroke();
      circle(ctx,0,0,2/zoom,color);ctx.restore();
      this.worldLabel(ping.x,ping.y+size+15/zoom,`PING · ${ping.name.toUpperCase()}`,color,view.guidance==='simple'?14:view.guidance==='moderate'?12:11);
    }
  }

  drawPingIndicator(state, view) {
    if (view.menu||view.showMap) return;
    // The latest offscreen ping gets one edge cue; the map retains every marker.
    const bounds=this.markerBounds(view),ping=(state.pings||[]).findLast(item=>{
      if (!(item.expiresAt>state.time)||!Number.isFinite(item.x)||!Number.isFinite(item.y)) return false;
      const p=this.worldToScreen(item.x,item.y);
      return p.x<bounds.left||p.x>bounds.right||p.y<bounds.top||p.y>bounds.bottom;
    });
    if (!ping) return;
    const point=this.worldToScreen(ping.x,ping.y),ctx=this.ctx,color='#99cdf4';
    let {x,y}=this.edgePoint(point,bounds);
    const objective=this.objectiveIndicator;
    if (objective&&Math.hypot(x-objective.x,y-objective.y)<60) {
      if (y<bounds.bottom-62) y+=62;
      else if (y>bounds.top+62) y-=62;
      else x=clamp(x+(x<this.width/2?70:-70),bounds.left,bounds.right);
    }
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(point.y-y,point.x-x));
    circle(ctx,0,0,15,'#14283be8',color,1.5);ctx.beginPath();ctx.moveTo(-4,-5);ctx.lineTo(4,0);ctx.lineTo(-4,5);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();ctx.restore();
    const label=`PING · ${ping.name.toUpperCase()}`;
    ctx.save();ctx.font=`600 ${view.guidance==='simple'?13:11}px ui-monospace, monospace`;ctx.textAlign='center';ctx.textBaseline='top';
    const half=ctx.measureText(label).width/2+7,labelX=clamp(x,half,this.width-half);
    ctx.strokeStyle='#102018';ctx.lineWidth=3;ctx.strokeText(label,labelX,y+19);ctx.fillStyle=color;ctx.fillText(label,labelX,y+19);ctx.restore();
  }

  drawSmoke(ctx, s, time) {
    const r = finite(s.radius, 90), opacity = clamp(finite(s.ttl, 10) / 2, 0, 1), extent = r * 1.28;
    ctx.save(); ctx.globalAlpha = opacity; ctx.translate(s.x, s.y); ctx.rotate(time * .1);
    ctx.drawImage(this.smokeSprite(), -extent, -extent, extent * 2, extent * 2);
    ctx.restore();
  }

  drawEffects(ctx, state, time, view = {}) {
    for (const grenade of state.grenades || []) {
      if (!this.inView(grenade.x, grenade.y, 35) || this.houseVisibility(grenade, view) <= .05) continue;
      const hand = grenade.kind === 'hand' || grenade.weapon === 'frag' || grenade.weapon === 'flashbang';
      if (hand && (view.menu || view.showMap || !squadCanSeePoint(state, grenade))) continue;
      const progress = clamp(finite(grenade.progress), 0, 1), lift = grenade.landed ? 0 : Math.sin(progress * Math.PI) * (hand ? 30 : 22);
      circle(ctx, grenade.x + 2, grenade.y + 3, 3.5, 'rgba(24,30,22,.35)');
      if (!grenade.landed) line(ctx, finite(grenade.px, grenade.x), finite(grenade.py, grenade.y) - lift, grenade.x, grenade.y - lift, 'rgba(205,186,130,.55)', 1.3 / this.camera.zoom);
      circle(ctx, grenade.x, grenade.y - lift, hand ? 3.7 : 2.8, grenade.weapon === 'flashbang' ? '#bdc9c4' : hand ? '#737b43' : '#c2b27e', '#293d30', 1);
      if (hand) line(ctx, grenade.x - 2, grenade.y - lift - 3, grenade.x + 2, grenade.y - lift - 3, '#d4d3b6', 1.4);
    }
    let streaks = 0;
    const freshness = this.projectileFrameAt === null ? 1 : clamp(1 - Math.max(0, time - this.projectileFrameAt - .045) / .075, 0, 1);
    if (!view.menu && !view.showMap && !view.paused && freshness > 0) for (const b of state.bullets || []) {
      if (streaks >= GUNPLAY_LIMITS.streaks) break;
      if (!this.inView(b.x, b.y, 30)) continue;
      const streak = projectileStreak(b, view.reducedMotion);
      if (streak && this.drawProjectileStreak(ctx, state, streak, view, freshness)) streaks++;
    }
    this.drawGunplay(ctx, state, time, view);
    for (const e of state.effects || []) {
      // The shot event ring survives simulation catch-up and co-op snapshots;
      // those flashes are composited after the atmosphere below.
      if (e.type === 'muzzle' && Array.isArray(state.soundEvents)) continue;
      if (e.type === 'dust' && Array.isArray(state.soundEvents)) continue;
      if (!this.inView(e.x, e.y, 50) || this.houseVisibility(e, view) <= .05) continue;
      // A revealed floor plan does not expose a gunman behind its partition.
      if (e.type === 'muzzle' && e.team === 'enemy' && !this.visibleEnemies.some(actor => actor.id === e.actorId)) continue;
      if (e.type === 'muzzle' && e.team === 'allied' && !this.visibleAllies.some(actor => actor.id === e.actorId)) continue;
      if (e.type === 'blood' && (view.menu || view.bloodEffects === false || view.reducedMotion || !e.seen || !squadCanSeePoint(state, e, { ignoreRange: e.farWitness === true }))) continue;
      if (e.type === 'breach' && (view.menu || view.reducedMotion || !e.seen || !squadCanSeePoint(state, e))) continue;
      if (e.type === 'flashbang' && (view.menu || view.showMap || !squadCanSeePoint(state, e))) continue;
      const life = clamp(e.ttl / (e.maxTtl || .3), 0, 1);
      ctx.save(); ctx.globalAlpha = life;
      if (e.type === 'muzzle') {
        ctx.translate(e.x, e.y); ctx.rotate(finite(e.angle)); ctx.fillStyle = '#ffd88c'; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(10, 0); ctx.lineTo(0, 3); ctx.lineTo(3, 0); ctx.fill();
      } else if (e.type === 'blood') {
        const travel = (1 - life) * (11 + finite(e.amount, .5) * 12);
        ctx.translate(e.x, e.y); ctx.rotate(finite(e.angle));
        for (let i = 0; i < 5; i++) {
          const spread = (hash(finite(e.seed) + i * 7) - .5) * 1.8, reach = travel * (.5 + i * .15);
          circle(ctx, Math.cos(spread) * reach, Math.sin(spread) * reach, 1.2 + (i % 3) * .45, i % 2 ? '#963b32' : '#782a29');
        }
      } else if (e.type === 'breach') {
        const dust = this.radialSprite('breach-dust', [[0,'rgba(181,164,130,.6)'], [1,'rgba(174,158,126,0)']]);
        const radius = 20 + (1 - life) * 35;
        ctx.translate(e.x, e.y); ctx.rotate(finite(e.angle));
        ctx.drawImage(dust, -radius * 1.25, -radius * .5, radius * 2.5, radius * 1.5);
      } else if (e.type === 'flashbang') {
        // One brief bloom, clipped to actual masonry. No repeating flash,
        // fire plume, fragments, or persistent lethal-explosion decal.
        if (this.flashWorld !== state.world) { this.flashMasks.clear(); this.flashWorld = state.world; }
        const radius = Math.min(110, finite(e.radius, 240) * .4);
        const key = `${state.world.geometryRevision || 0}:${e.x}:${e.y}:${radius}`;
        if (!this.flashMasks.has(key)) {
          if (this.flashMasks.size >= 16) this.flashMasks.delete(this.flashMasks.keys().next().value);
          this.flashMasks.set(key, muzzleLightPolygon(state.world, e, radius));
        }
        const polygon = this.flashMasks.get(key);
        ctx.beginPath(); ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
        ctx.closePath(); ctx.clip();
        if (!view.reducedMotion) {
          const glow = this.radialSprite('flashbang-bloom', [[0, 'rgba(237,239,220,.88)'], [.25, 'rgba(222,230,218,.32)'], [1, 'rgba(218,226,216,0)']]);
          ctx.drawImage(glow, e.x - radius, e.y - radius, radius * 2, radius * 2);
        }
        circle(ctx, e.x, e.y, view.reducedMotion ? 7 : 7 + life * 9, view.reducedMotion ? 'rgba(187,202,191,.45)' : 'rgba(236,236,211,.8)');
      } else if (e.type === 'explosion') {
        if (e.weapon === 'grenade' || e.radius) {
          const reach = clamp(finite(e.radius, 76), 24, 110), spread = Math.sqrt(1 - life), radius = 7 + spread * reach * .72;
          circle(ctx, e.x, e.y, radius, 'rgba(192,170,127,.22)', 'rgba(205,182,138,.4)', 2.5);
          if (life > .66) circle(ctx, e.x, e.y, 8 + life * 9, '#f4d19a');
          for (let i = 0; i < 7; i++) {
            const angle = i * 2.4 + e.x, end = radius * (1 + hash(i + e.y) * .3);
            line(ctx, e.x + Math.cos(angle) * radius * .55, e.y + Math.sin(angle) * radius * .55, e.x + Math.cos(angle) * end, e.y + Math.sin(angle) * end, '#cdb78e', 1.4);
          }
        } else this.drawFire(ctx, e.x, e.y, time, 10 + (1 - life) * 25);
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
    const lighting = missionLighting(state);
    if (lighting === 'night') {
      ctx.fillStyle = 'rgba(9,24,26,.42)'; ctx.fillRect(0, 0, w, h);
      // A limited pool of practical light follows each teammate through the night.
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const actor of state.squad || []) {
        if (actor.alive === false || actor.downed || !this.inView(actor.x, actor.y, 160)) continue;
        const p = this.worldToScreen(actor.x, actor.y), r = 165 * this.camera.zoom;
        const light = this.radialSprite('night-light', [[0,'rgba(191,194,148,.08)'], [1,'rgba(191,194,148,0)']], 4);
        ctx.drawImage(light, p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.restore();
    } else if (lighting === 'dawn') {
      ctx.fillStyle = 'rgba(166,157,144,.09)'; ctx.fillRect(0, 0, w, h);
    } else if (lighting === 'late-afternoon') {
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

  drawObservation(state, view) {
    if (view.menu || view.showMap) return;
    const player = (state.squad || []).find(actor => actor.id === (view.followActorId || state.playerId));
    if (!player || player.role !== 'grenadier' || player.downed || player.alive === false || !(player.observing || view.observing)) return;
    const ctx = this.ctx, x = this.safeRect.cx, y = view.touch ? this.safeRect.top + (this.height > this.width ? 49 : 17) : 84;
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '600 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = 'BINOCULARS · SHARED SIGHT', width = ctx.measureText(label).width + 36;
    roundRect(ctx, x - width / 2, y - 12, width, 24, 4, 'rgba(20,31,24,.72)', 'rgba(158,195,165,.28)');
    ctx.fillStyle = '#bfd1b7'; ctx.fillText(label, x + 9, y);
    const gx = x - width / 2 + 13;
    circle(ctx, gx - 3, y + 1, 2.7, null, '#bfd1b7', 1); circle(ctx, gx + 3, y + 1, 2.7, null, '#bfd1b7', 1);
    line(ctx, gx - 1, y - 2, gx + 1, y - 2, '#bfd1b7', 1);
    // Open corner marks suggest glass without masking the battlefield in black.
    const reach = Math.min(this.safeRect.width * .24, 160), cy = this.safeRect.cy;
    ctx.strokeStyle = 'rgba(187,213,184,.23)'; ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      const bx = x + side * reach;
      ctx.beginPath(); ctx.moveTo(bx - side * 12, cy - 42); ctx.lineTo(bx, cy - 42); ctx.lineTo(bx, cy - 29);
      ctx.moveTo(bx, cy + 29); ctx.lineTo(bx, cy + 42); ctx.lineTo(bx - side * 12, cy + 42); ctx.stroke();
    }
    ctx.restore();
  }

  drawThrowableAim(state, view) {
    const target = view.throwableAim, player = state.squad?.find(actor => actor.id === state.playerId);
    if (view.menu || view.showMap || !player?.alive || player.downed || !Number.isFinite(target?.x) || !Number.isFinite(target?.y)) return;
    const trace = traceAim(state.world, player, target), landing = trace?.point || target;
    const a = this.worldToScreen(player.x, player.y), b = this.worldToScreen(landing.x, landing.y), ctx = this.ctx;
    ctx.save(); ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
    ctx.strokeStyle = trace?.blocked ? '#dca780' : target.type === 'flashbang' ? '#d5e4db' : '#e2cc97';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 26, b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    circle(ctx, b.x, b.y, 8, 'rgba(20,31,23,.35)', ctx.strokeStyle, 1.5);
    circle(ctx, b.x, b.y, 2, ctx.strokeStyle); ctx.restore();
  }

  drawFlashExposure(state, view = {}) {
    if (view.menu) return;
    const player = state.squad?.find(actor => actor.id === state.playerId);
    if (!player || player.alive === false || player.downed) return;
    const intensity = flashIntensity(player, state.time);
    if (intensity <= .001) return;
    const ctx = this.ctx;
    ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // A single smooth recovery veil also covers the map, so opening it cannot
    // reveal threats while blinded. HUD buttons remain usable above the canvas.
    ctx.globalAlpha = intensity * .96;
    ctx.fillStyle = view.reducedMotion ? '#17201f' : '#dfded0';
    ctx.fillRect(0, 0, this.width, this.height); ctx.restore();
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

  centerTouchCamera(state, view) {
    if (!view.touch || view.menu || view.showMap || !this.safeRect) return;
    const squad = state.squad || [];
    const player = squad.find(actor => view.followActorId && actor.id === view.followActorId) || squad.find(actor => actor.id === state.playerId) || squad[0];
    if (!player) return;
    this.camera.x = player.x - (this.safeRect.cx - this.width / 2) / this.camera.zoom;
    this.camera.y = player.y - (this.safeRect.cy - this.height / 2) / this.camera.zoom;
    this.focusScreen = this.worldToScreen(player.x, player.y);
  }

  updateCamera(state, view = {}) {
    if (!state || !state.world) return;
    const world = state.world, time = finite(view.time, state.time || 0), now = globalThis.performance?.now() ?? Date.now();
    const delta = Math.min(.06, Math.max(.001, (now - this.lastRender) / 1000 || 1 / 60)); this.lastRender = now;
    if (this.mapIdentity !== world || !this.mapCache || this.mapMission !== state.missionIndex || this.mapLayoutVersion !== world.layoutVersion || this.mapLayoutSeed !== world.layoutSeed) {
      const sameLayout = this.mapCache && Number.isFinite(state.seed) && this.mapSeed === state.seed && this.mapMission === state.missionIndex && this.mapLayoutVersion === world.layoutVersion && this.mapLayoutSeed === world.layoutSeed && this.mapCache.width === world.width && this.mapCache.height === world.height;
      if (sameLayout) this.mapIdentity = world;
      else { this.makeMap(world, state.missionIndex); this.mapSeed = state.seed; this.cameraReady = false; }
    }
    const player = (state.squad || []).find(s => view.followActorId && s.id === view.followActorId) || (state.squad || []).find(s => s.id === state.playerId) || state.squad?.[0] || { x: world.width / 2, y: world.height / 2 };
    this.touchView = !!view.touch; this.mapView = !!view.showMap; this.menuView = !!view.menu; this.guidanceView = view.guidance;
    this.safeRect = this.playableRect(view);
    const safe = this.safeRect;
    let zoom = (view.touch ? (this.height > this.width ? 1.1 : 1.04) : this.width < 600 ? 1.02 : this.width < 1000 ? 1.08 : 1.2) * clamp(finite(view.zoom, 1), view.touch ? .6 : .8, view.touch ? 1.25 : 1.4);
    const observing = player.role === 'grenadier' && !player.downed && player.alive !== false && (player.observing || view.observing) && !view.menu && !view.showMap;
    if (observing) zoom *= .76;
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
    if (observing && !view.touch) {
      const ahead = 190;
      tx += Math.cos(finite(player.angle)) * ahead; ty += Math.sin(finite(player.angle)) * ahead;
    }
    const halfW = this.width / zoom / 2, halfH = this.height / zoom / 2;
    const centeredTouch = view.touch && !view.menu && !view.showMap;
    if (!view.showMap && !centeredTouch) {
      // A small amount of outside-map framing prevents the boundary from pinning soldiers beneath HUD panels.
      const edgeAllowance = view.menu ? 0 : 40 / zoom;
      tx = world.width <= halfW * 2 ? world.width / 2 : clamp(tx, halfW - edgeAllowance, world.width - halfW + edgeAllowance);
      ty = world.height <= halfH * 2 ? world.height / 2 : clamp(ty, halfH - edgeAllowance, world.height - halfH + edgeAllowance);
    }
    const layoutKey = `${this.width}:${this.height}:${safe.left}:${safe.top}:${safe.right}:${safe.bottom}:${!!view.touch}`;
    const snap = !this.cameraReady || this.lastPlayerId !== state.playerId || view.showMap || this.lastMapView !== !!view.showMap || this.lastMenuView !== !!view.menu || this.lastLayoutKey !== layoutKey;
    const smoothing = snap || view.reducedMotion ? 1 : 1 - Math.exp(-delta * (view.touch ? 12 : 18));
    this.camera.x += (tx - this.camera.x) * smoothing; this.camera.y += (ty - this.camera.y) * smoothing; this.camera.zoom += (zoom - this.camera.zoom) * smoothing;
    if (centeredTouch) {
      // World edges do not pin the view. Derive translation from the actual
      // eased zoom so movement, observation, and zoom changes all retain the
      // controlled soldier at the center between the HUD and thumb controls.
      this.centerTouchCamera(state, view);
    }
    // Apply the visibility constraint after smoothing so it cannot interpolate
    // through a HUD panel. Input mapping then uses this exact camera all frame.
    if (!view.touch && !view.menu && !view.showMap) this.keepDesktopActorClear(player,world,view.desktopObstacles);
    this.focusScreen = !view.menu && !view.showMap ? this.worldToScreen(player.x, player.y) : null;
    this.cameraReady = true; this.lastPlayerId = state.playerId; this.lastMapView = !!view.showMap; this.lastMenuView = !!view.menu;
    this.lastLayoutKey = layoutKey;
  }

  render(state, view = {}) {
    if (!state?.world) return;
    if (!view.cameraPrepared || !this.cameraReady) this.updateCamera(state, view);
    // Touch aiming is directional. Follow post-step movement without changing
    // the prepared zoom; desktop cursor/world mapping retains its full frame.
    if (view.cameraPrepared) this.centerTouchCamera(state, view);
    const world = state.world, time = finite(view.time, state.time || 0), zoom = this.camera.zoom, safe = this.safeRect;
    this.quality = ['performance','balanced','high'].includes(view.quality) ? view.quality : 'balanced';
    this.refreshHouseGeometry(world);
    this.updateHouseCutaways(state, view, time);
    this.updateMuzzleFlashes(state, view);
    this.updateGunplay(state, view);
    const ctx = this.ctx;
    ctx.imageSmoothingQuality = this.quality === 'high' ? 'high' : 'low';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = view.showMap ? '#101b17' : '#252f28'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save(); ctx.translate(this.width / 2, this.height / 2); ctx.scale(this.camera.zoom, this.camera.zoom); ctx.translate(-this.camera.x, -this.camera.y);
    // Matching ground fills the camera margin when touch follow looks beyond
    // the district boundary. The cropped map remains bounded to real terrain.
    const overscan = view.touch ? Math.max(this.width, this.height) / zoom : Math.max(80, this.width / zoom / 2 - this.camera.x, this.camera.x + this.width / zoom / 2 - world.width, this.height / zoom / 2 - this.camera.y, this.camera.y + this.height / zoom / 2 - world.height);
    if (!view.showMap) { ctx.fillStyle = '#6d6550'; ctx.fillRect(-overscan, -overscan, world.width + overscan * 2, world.height + overscan * 2); }
    // Bound the source work to the visible district instead of resampling the whole city.
    const left = clamp(Math.floor(this.camera.x - this.width / zoom / 2) - 1, 0, world.width);
    const top = clamp(Math.floor(this.camera.y - this.height / zoom / 2) - 1, 0, world.height);
    const right = clamp(Math.ceil(this.camera.x + this.width / zoom / 2) + 1, 0, world.width);
    const bottom = clamp(Math.ceil(this.camera.y + this.height / zoom / 2) + 1, 0, world.height);
    if (right > left && bottom > top) ctx.drawImage(this.mapCache, left, top, right-left, bottom-top, left, top, right-left, bottom-top);
    this.drawHouseCutaways(ctx, view, {left, top, right, bottom});
    this.drawBreaches(ctx, state, view);
    // Inert, previously observed ground details sit under the sight overlay.
    // New deaths are discovered by simulation sight, never by map exploration.
    this.drawBloodstains(ctx, state, view); this.drawBodies(ctx, state, view);
    // Ambient flames and smoke share the same terrain occlusion as a person.
    // Cached light fans keep their glow out of intact buildings and unseen rooms.
    this.drawAmbientFires(ctx, state, time, view);
    if (!view.menu) {
      this.sharedSight.update(state, time);
      this.sharedSight.draw(ctx, {left, top, right, bottom}, {night:missionLighting(state) === 'night', map:view.showMap});
    }
    if (view.showMap) { ctx.strokeStyle = '#718272'; ctx.lineWidth = 1 / this.camera.zoom; ctx.strokeRect(0, 0, world.width, world.height); }
    for (const prop of world.props || []) if (this.isDynamicProp(prop) && this.inView(prop.x, prop.y, 150)) this.drawProp(ctx, prop, time, true);
    this.drawOperationObjects(ctx, state, view);
    this.drawObjective(state, time, view); this.drawStoryOpportunities(state, view); this.drawOrder(state, time, view);
    for (const v of state.vehicles || []) if (this.inView(v.x, v.y, 140)) this.drawVehicle(ctx, v, time);
    this.visibleEnemies.length = 0;
    for (const actor of state.enemies || []) if (actor.alive !== false && this.inView(actor.x, actor.y, 65) && this.houseVisibility(actor, view) > .01 && this.actorVisible(state, actor)) this.visibleEnemies.push(actor);
    this.visibleAllies.length = 0;
    for (const actor of state.allies || []) if (actor.alive !== false && this.inView(actor.x, actor.y, 65) && this.houseVisibility(actor, view) > .01 && this.actorVisible(state, actor)) this.visibleAllies.push(actor);
    const actors = this.actorBuffer; actors.length = 0;
    for (const group of [state.civilians, state.survivors, this.visibleEnemies, this.visibleAllies, state.squad]) for (const actor of group || []) if (actor.alive !== false && this.inView(actor.x, actor.y, 65)) actors.push(actor);
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
    // An annotation sits above fog and effects, but grants no terrain or actor sight.
    this.drawPings(state, view);
    ctx.restore();
    if (!view.showMap) this.drawAtmosphere(state, time, view);
    if (this.muzzleFlashes.length) {
      ctx.save(); ctx.translate(this.width / 2, this.height / 2); ctx.scale(this.camera.zoom, this.camera.zoom); ctx.translate(-this.camera.x, -this.camera.y);
      this.drawMuzzleFlashes(ctx, state, view); ctx.restore();
    }
    this.drawTouchAim(state, view); this.drawObjectiveIndicator(state, view); this.drawLeaderIndicator(state, view); this.drawPingIndicator(state, view);
    this.drawDesktopAim(state, view);
    this.drawObservation(state, view);
    this.drawThrowableAim(state, view);
    if (view.showMap) {
      ctx.fillStyle = '#e2d9bb'; ctx.font = '600 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('DISTRICT MAP', safe.cx, view.touch ? safe.top + 5 : 22);
      ctx.fillStyle = '#b9c7ad'; ctx.font = '11px ui-monospace, monospace';
      if (view.mapHint !== false) ctx.fillText(view.mapHint || (view.touch ? (view.placingOrder ? 'Tap a street or room to set the destination' : 'Squad and objective positions') : state.role === 'leader' ? 'Select MOVE, then a street or room • M to close' : 'Stay with the marked squad • M to close'), safe.cx, view.touch ? safe.bottom - 4 : this.height - 22);
      if (!view.touch || safe.height > 190) {
        ctx.fillStyle = '#9eae98'; ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(view.mapLegend || 'Bright: squad sight · Dim: explored · Dark: unseen · Blue: ping', safe.cx, view.touch ? safe.top + 21 : 39, Math.max(1, safe.width - 12));
      }
    }
    this.drawFlashExposure(state, view);
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
    const visible = enemyInSharedSight(state, a);
    if (visible) circle(ctx, a.x, a.y, 1.5 / scale, '#d57e62');
  }
  for (const a of state.squad || []) if (a.alive !== false) circle(ctx, a.x, a.y, (a.id === state.playerId ? 3.2 : 2) / scale, a.downed ? '#e8ad6d' : a.id === state.playerId ? '#e0efd6' : '#88c2aa');
  for (const a of state.allies || []) if (a.alive !== false && enemyInSharedSight(state, a)) circle(ctx, a.x, a.y, 1.8 / scale, '#9cbfce');
  for (const ping of (state.pings||[]).slice(-4)) {
    if (!Number.isFinite(ping.x)||!Number.isFinite(ping.y)||!(ping.expiresAt>state.time)) continue;
    const size=3.8/scale;ctx.beginPath();ctx.moveTo(ping.x,ping.y-size);ctx.lineTo(ping.x+size,ping.y);ctx.lineTo(ping.x,ping.y+size);ctx.lineTo(ping.x-size,ping.y);ctx.closePath();
    ctx.fillStyle='#14283b';ctx.fill();ctx.strokeStyle='#99cdf4';ctx.lineWidth=1.2/scale;ctx.stroke();
  }
  if (options.camera && options.viewport) {
    const c = options.camera, v = options.viewport, w = v.width / c.zoom, h = v.height / c.zoom;
    ctx.strokeStyle = 'rgba(200,215,180,.35)'; ctx.lineWidth = .8 / scale; ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
  }
  ctx.restore();
  ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = '#bdc7a9'; ctx.textAlign = 'right'; ctx.fillText('N', width - 7, 12);
  line(ctx, width - 10, 25, width - 10, 16, '#bdc7a9', 1); line(ctx, width - 10, 16, width - 13, 20, '#bdc7a9', 1); line(ctx, width - 10, 16, width - 7, 20, '#bdc7a9', 1);
}
