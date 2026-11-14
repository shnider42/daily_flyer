import { obstaclePose } from './holes.mjs';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const hex = (value, fallback = '#4d805c') => typeof value === 'number' ? '#' + value.toString(16).padStart(6, '0') : value || fallback;

/** Lightweight isometric presentation when WebGL is unavailable. Same course and aim coordinates. */
export class CanvasGolfRenderer {
  constructor(canvas) {
    this.kind = 'canvas'; this.canvas = canvas;
    this.surface = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) {
      // A failed WebGL initialization can own the original context; keep the original
      // input element in place and draw in an inert overlay at precisely the same rect.
      this.surface = document.createElement('canvas');
      this.surface.setAttribute('aria-hidden', 'true');
      this.surface.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      canvas.parentElement.append(this.surface);
      this.ctx = this.surface.getContext('2d');
    }
    this.cameraMode = 'follow'; this.rotation = .20; this.center = { x: 0, z: 0 }; this.offsetX = this.offsetY = 0;
    this.width = this.height = 0; this.scale = 20;
    this.resize();
  }

  setHole(hole) {
    this.hole = hole;
    this.center = { x: (hole.bounds.minX + hole.bounds.maxX) / 2, z: (hole.bounds.minZ + hole.bounds.maxZ) / 2 };
    this.baseCenter = { ...this.center };
    this.updateScale();
  }

  updateScale() {
    if (!this.hole) return;
    const b = this.hole.bounds, w = b.maxX - b.minX + 4, d = b.maxZ - b.minZ + 5;
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    this.scale = Math.min(this.width / (w * c + d * Math.abs(s)) / 1.1, this.height / ((w * Math.abs(s) + d * c) * .75 + 4) / 1.1);
  }

  screen(x, z, y = 0) {
    x -= this.center.x; z -= this.center.z;
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    return { x: this.width / 2 + this.offsetX + (x * c - z * s) * this.scale, y: this.height / 2 + this.offsetY + (x * s + z * c) * this.scale * .75 - y * this.scale };
  }

  polygon(points, fill, stroke, width = 1) {
    const ctx = this.ctx; ctx.beginPath();
    points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  rect(x, z, w, d, y = 0, fill, stroke, angle = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    this.polygon([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => this.screen(x + px * c - pz * s, z + px * s + pz * c, y)), fill, stroke);
  }

  circle(x, z, r, y, fill, stroke, width = 1) {
    const p = this.screen(x, z, y), ctx = this.ctx;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r * this.scale, r * this.scale * .75, -this.rotation, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  line(a, b, color, width) {
    const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  render(snapshot, view = {}, dt = 1 / 60) {
    if (!this.hole) return;
    this.resize(); this.updateScale(); const ctx = this.ctx, hole = this.hole, time = snapshot?.time || 0;
    this.offsetX = view.menu && this.width > 800 ? this.width * .23 : 0;
    this.offsetY = view.menu && this.width <= 580 ? -this.height * .22 : 0;
    const watching = snapshot?.players?.find(player => player.id === view.playerId);
    const overview = view.overview ?? this.cameraMode === 'overview';
    const target = { ...this.baseCenter };
    if (!overview && watching?.ball && !watching.ball.holed && snapshot.phase === 'playing') {
      target.x = this.baseCenter.x * .32 + (watching.ball.x * .72 + hole.cup.x * .28) * .68;
      target.z = this.baseCenter.z * .32 + (watching.ball.z * .72 + hole.cup.z * .28) * .68;
      this.scale *= 1.2;
    }
    const blend = view.reducedMotion ? 1 : 1 - Math.exp(-Math.max(.001, dt) * 4.2);
    this.center.x += (target.x - this.center.x) * blend; this.center.z += (target.z - this.center.z) * blend;
    const palette = hole.palette || {};
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.fillStyle = hex(palette.ground, '#c6c3a1'); ctx.fillRect(0, 0, this.width, this.height);
    const turf = hex(palette.turf, '#4b845b');
    const bounds = hole.bounds;
    // Unobtrusive park details outside the actual collision surface.
    for (let i = 0; i < 11; i++) {
      const x = (i % 2 ? bounds.minX - 3 : bounds.maxX + 3) + Math.sin(i) * .6;
      const z = bounds.minZ + (bounds.maxZ - bounds.minZ) * i / 10;
      const p = this.screen(x, z, .5), r = (1 + Math.sin(i * 8) * .2) * this.scale;
      ctx.fillStyle = 'rgba(42,60,40,.15)'; ctx.beginPath(); ctx.ellipse(p.x + 5, p.y + 15, r, r * .6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7c9462'; ctx.beginPath(); ctx.arc(p.x, p.y - 10, r * .8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#96a777'; ctx.beginPath(); ctx.arc(p.x - r * .2, p.y - r * .45, r * .55, 0, Math.PI * 2); ctx.fill();
    }
    for (const platform of hole.platforms) {
      this.rect(platform.x, platform.z, platform.w + .15, platform.d + .15, -.5, '#836b4d');
      this.rect(platform.x, platform.z, platform.w, platform.d, 0, turf, '#344f3d');
      for (let x = -platform.w / 2; x < platform.w / 2; x += 2) this.rect(platform.x + x + .5, platform.z, Math.min(1, platform.w / 2 - x), platform.d, .002, 'rgba(255,255,255,.035)');
    }
    const zoneColors = { sand: '#d9bd80', ice: '#92d5df', water: '#439ba8', lava: '#dc673b', boost: '#d4ae49', conveyor: '#345153', portal: '#9980cb', wind: '#8cb99f', magnet: '#71889b', ramp: '#ba9756' };
    for (const zone of hole.zones || []) {
      this.rect(zone.x, zone.z, zone.w || 2, zone.d || 2, .02, zoneColors[zone.type] || '#a2a17b');
      if (zone.type === 'portal') {
        this.circle(zone.x, zone.z, Math.min(zone.w, zone.d) * .4, .05, null, '#e2c9ff', 3);
        if (zone.to) this.circle(zone.to.x, zone.to.z, .6, .05, null, '#adf0cf', 3);
      }
      if (['boost', 'conveyor', 'ramp', 'wind'].includes(zone.type)) {
        const a = zone.angle || 0, dx = Math.sin(a), dz = -Math.cos(a);
        const length = Math.min(zone.w, zone.d) * .33;
        const begin = this.screen(zone.x - dx * length, zone.z - dz * length, .06), end = this.screen(zone.x + dx * length, zone.z + dz * length, .06);
        this.line(begin, end, '#f1e6b9', 3);
        for (const side of [-1, 1]) this.line(end, this.screen(zone.x + dx * (length - .35) + side * dz * .25, zone.z + dz * (length - .35) - side * dx * .25, .06), '#f1e6b9', 3);
      }
      if (zone.type === 'magnet') for (let i = 1; i < 4; i++) this.circle(zone.x, zone.z, Math.min(zone.w, zone.d) * .12 * i, .04, null, '#b8d7df', 1);
    }
    for (const rail of hole.rails || []) {
      this.line(this.screen(rail.ax, rail.az, .12), this.screen(rail.bx, rail.bz, .12), '#7b654d', this.scale * .26);
      this.line(this.screen(rail.ax, rail.az, .38), this.screen(rail.bx, rail.bz, .38), '#c2a681', this.scale * .16);
    }
    for (const obstacle of hole.obstacles || []) {
      const p = obstaclePose(obstacle, time), h = obstacle.height || .8;
      if (['post', 'bumper'].includes(obstacle.type)) {
        this.circle(p.x, p.z, obstacle.r || .6, .02, '#415749');
        this.circle(p.x, p.z, obstacle.r || .6, h, obstacle.type === 'bumper' ? hex(palette.accent, '#dc7657') : '#c3b38b', '#f0d69f', 2);
      } else {
        this.rect(p.x, p.z, obstacle.w || 3, obstacle.d || .5, .05, '#5d6250', null, p.angle);
        this.rect(p.x, p.z, obstacle.w || 3, obstacle.d || .5, h, hex(palette.accent, '#db7d4d'), '#f3d59e', p.angle);
      }
    }
    this.circle(hole.cup.x, hole.cup.z, hole.cup.r || .48, .03, '#172823', '#e7d8ac', 2);
    const flagBase = this.screen(hole.cup.x, hole.cup.z), flagTop = this.screen(hole.cup.x, hole.cup.z, 2.0);
    this.line(flagBase, flagTop, '#f5e9ca', 2);
    this.polygon([flagTop, { x: flagTop.x + this.scale * .7, y: flagTop.y + this.scale * .2 }, { x: flagTop.x, y: flagTop.y + this.scale * .43 }], hex(palette.accent, '#d27051'));
    for (const player of snapshot?.players || []) {
      const ball = player.ball; if (!ball || ball.holed) continue;
      const point = this.screen(ball.x, ball.z, ball.y || .22), r = Math.max(3, .22 * this.scale);
      this.circle(ball.x, ball.z, .40, .02, 'rgba(18,35,26,.23)');
      if (player.id === view.playerId) this.circle(ball.x, ball.z, .55, .03, null, hex(player.color, '#eacb64'), 2);
      ctx.fillStyle = hex(player.color, '#edce74'); ctx.strokeStyle = '#f7efd8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(point.x, point.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff9e2'; ctx.beginPath(); ctx.arc(point.x - r * .25, point.y - r * .3, r * .25, 0, Math.PI * 2); ctx.fill();
    }
    const local = snapshot?.players?.find(player => player.id === view.playerId);
    if (local?.ball && !local.ball.moving && !local.ball.holed && view.aiming !== false && snapshot.phase === 'playing') {
      const ball = local.ball, a = view.angle || 0, length = 1.8 + clamp(view.power || .4, .05, 1) * 10;
      const end = this.screen(ball.x + Math.sin(a) * length, ball.z - Math.cos(a) * length, .05);
      ctx.setLineDash([4, 6]); this.line(this.screen(ball.x, ball.z, .05), end, '#fff1bc', 2); ctx.setLineDash([]);
      ctx.strokeStyle = '#fff1bc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(end.x, end.y, 5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height; this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.surface.width = Math.round(width * this.pixelRatio); this.surface.height = Math.round(height * this.pixelRatio);
    this.updateScale();
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.width / 2 - this.offsetX) / this.scale, z = (clientY - rect.top - this.height / 2 - this.offsetY) / (this.scale * .75);
    const c = Math.cos(this.rotation), s = Math.sin(this.rotation);
    return { x: x * c + z * s + this.center.x, z: -x * s + z * c + this.center.z };
  }

  setCamera(mode) { this.cameraMode = mode; }
  rotate(delta) { this.rotation = clamp(this.rotation + delta, -.7, .7); this.updateScale(); }
  dispose() { if (this.surface !== this.canvas) this.surface.remove(); }
}
