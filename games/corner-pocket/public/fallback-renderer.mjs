import { TABLE, predictAim } from './engine.mjs';

const COLORS = ['#f6f0df', '#e6b51e', '#275db0', '#b8342e', '#75428d', '#dd7023', '#216546', '#792f38', '#171d19'];

/** A complete playable overhead view for devices without WebGL. */
export class CanvasPoolRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.kind = 'canvas'; this.view = 'overhead'; this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('This browser could not create a table view.');
    this.width = 0; this.height = 0; this.resize();
  }

  setView(view) { this.view = view === 'table' ? 'table' : 'overhead'; }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || 960), h = Math.max(1, rect.height || 560);
    if (this.width === w && this.height === h) return;
    this.width = w; this.height = h; this.portrait = w / h < .92;
    this.dpr = Math.min(globalThis.devicePixelRatio || globalThis.window?.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.scale = Math.min(w / (this.portrait ? TABLE.height + .43 : TABLE.width + .43), h / (this.portrait ? TABLE.width + .43 : TABLE.height + .43)) * .96;
  }

  screen(x, z) { return { x: this.width / 2 + (this.portrait ? z : x) * this.scale, y: this.height / 2 + (this.portrait ? -x : z) * this.scale }; }

  screenToTable(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect(), sx = (clientX - rect.left - this.width / 2) / this.scale, sy = (clientY - rect.top - this.height / 2) / this.scale;
    return this.portrait ? { x: -sy, z: sx } : { x: sx, z: sy };
  }

  _circle(x, z, r, fill, stroke = null, width = 1) {
    const p = this.screen(x, z), ctx = this.ctx; ctx.beginPath(); ctx.arc(p.x, p.y, r * this.scale, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  _line(a, b, stroke, width = 1, dash = []) {
    if (!a || !b) return; const p = this.screen(a.x, a.z), q = this.screen(b.x, b.z), ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }

  _rect(x, z, w, h, fill, radius = 0) {
    const a = this.screen(x - w / 2, z - h / 2), b = this.screen(x + w / 2, z + h / 2), ctx = this.ctx;
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.roundRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), radius); ctx.fill();
  }

  render(state, options = {}) {
    if (!state) return; this.resize(); const ctx = this.ctx, s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    const background = ctx.createRadialGradient(this.width * .5, this.height * .46, 20, this.width / 2, this.height / 2, Math.max(this.width, this.height) * .7);
    background.addColorStop(0, '#33362b'); background.addColorStop(1, '#171b18'); ctx.fillStyle = background; ctx.fillRect(0, 0, this.width, this.height);
    const grain = Math.max(15, s * .13);
    for (let y = 0; y < this.height; y += grain) { ctx.strokeStyle = 'rgba(174,142,98,.04)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 14;
    this._rect(0, .015, TABLE.width + .34, TABLE.height + .34, '#231b14', .055 * s);
    ctx.shadowBlur = ctx.shadowOffsetY = 0;
    this._rect(0, 0, TABLE.width + .32, TABLE.height + .32, '#714f31', .045 * s);
    this._rect(0, 0, TABLE.width + .26, TABLE.height + .26, '#523922', .035 * s);
    this._rect(0, 0, TABLE.width + .09, TABLE.height + .09, '#254d35', .012 * s);
    const cloth = ctx.createLinearGradient(0, 0, this.width, this.height); cloth.addColorStop(0, '#1c735b'); cloth.addColorStop(1, '#13573f');
    this._rect(0, 0, TABLE.width, TABLE.height, cloth);
    // Fine fixed weave stays stable when balls move, avoiding visual shimmer.
    const a = this.screen(-TABLE.halfW, -TABLE.halfH), b = this.screen(TABLE.halfW, TABLE.halfH);
    ctx.save(); ctx.beginPath(); ctx.rect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y)); ctx.clip();
    ctx.fillStyle = 'rgba(220,244,204,.025)';
    for (let y = Math.min(a.y,b.y); y < Math.max(a.y,b.y); y += 4) for (let x = Math.min(a.x,b.x) + (Math.round(y) % 3); x < Math.max(a.x,b.x); x += 5) ctx.fillRect(x, y, 1, 1);
    ctx.restore();
    for (const rail of TABLE.rails || []) {
      this._line(rail.a, rail.b, '#245d43', .024 * s);
      this._line(rail.a, rail.b, 'rgba(10,37,24,.65)', Math.max(1, .003 * s));
    }
    for (const side of [-1, 1]) {
      for (const x of [-.9525, -.635, -.3175, .3175, .635, .9525]) this._diamond(x, side * (TABLE.halfH + .092));
      for (const z of [-.3175, 0, .3175]) this._diamond(side * (TABLE.halfW + .092), z);
    }
    TABLE.pockets.forEach(p => {
      this._circle(p.x, p.z, TABLE.pocketRadius + .017, '#836b42');
      this._circle(p.x, p.z, TABLE.pocketRadius + .010, '#302b20');
      this._circle(p.x, p.z, TABLE.pocketRadius, '#080d09');
      if (options.calledPocket === p.id || options.selectingPocket) {
        this._circle(p.x, p.z, .096, null, options.calledPocket === p.id ? '#f4d385' : '#aeb99b', options.calledPocket === p.id ? 3 : 1.5);
        const label = this.screen(p.x ? p.x - Math.sign(p.x) * .12 : 0, p.z - Math.sign(p.z) * (p.x ? .12 : .17));
        ctx.beginPath(); ctx.arc(label.x, label.y, 9, 0, Math.PI * 2); ctx.fillStyle = '#18231b'; ctx.fill();
        ctx.strokeStyle = options.calledPocket === p.id ? '#f4d385' : '#b5b28c'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#f3e4b8'; ctx.font = '700 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.id + 1), label.x, label.y + .5);
      }
    });
    for (const x of [-TABLE.halfW / 2, TABLE.halfW / 2]) this._circle(x, 0, .003, '#b7c8a1');
    const cue = state.balls?.find(b => b.id === 0), aiming = state.phase === 'aiming' && cue && !cue.pocketed;
    if (aiming && options.showGuide !== false && !options.placement) {
      const guide = predictAim(state, Number.isFinite(options.aim) ? options.aim : 0);
      this._line(guide.start, guide.end, 'rgba(239,244,214,.75)', 1.2, [5, 4]);
      if (guide.ghost) this._circle(guide.ghost.x, guide.ghost.z, TABLE.radius, null, '#e5d9b3', 1.2);
      const target = state.balls.find(b => b.id === guide.hitId);
      this._line(target || guide.ghost, guide.objectEnd, '#e4c278', 1.4);
      this._line(guide.ghost, guide.cueEnd, 'rgba(225,233,206,.5)', 1.1);
    }
    for (const ball of state.balls || []) {
      if (ball.pocketed) continue;
      const p = this.screen(ball.x, ball.z), r = TABLE.radius * s, color = COLORS[ball.id > 8 ? ball.id - 8 : ball.id];
      this._circle(ball.x + .007, ball.z + .008, TABLE.radius * 1.05, 'rgba(0,12,5,.45)');
      ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = ball.id > 8 ? '#eee8d4' : color; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      if (ball.id > 8) { ctx.fillStyle = color; ctx.fillRect(p.x - r, p.y - r * .54, r * 2, r * 1.08); }
      const shade = ctx.createRadialGradient(p.x - r * .35, p.y - r * .45, r * .04, p.x, p.y, r);
      shade.addColorStop(0, 'rgba(255,255,255,.36)'); shade.addColorStop(.45, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,.32)'); ctx.fillStyle = shade; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.restore();
      if (ball.id) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r * .53, 0, Math.PI * 2); ctx.fillStyle = '#f1ecd8'; ctx.fill();
        ctx.fillStyle = '#182019'; ctx.font = `700 ${Math.max(6, r * .83)}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(ball.id), p.x, p.y + .4);
      } else this._circle(ball.x + .006, ball.z - .005, .003, '#a34a3c');
    }
    if (aiming && options.showCue !== false && !options.placement) {
      const angle = Number.isFinite(options.aim) ? options.aim : 0, dx = Math.cos(angle), dz = Math.sin(angle), gap = .055 + Math.max(0, options.power || .5) * .09;
      const tip = { x: cue.x - dx * gap, z: cue.z - dz * gap }, butt = { x: cue.x - dx * (gap + .78), z: cue.z - dz * (gap + .78) };
      this._line(tip, butt, '#b28a53', Math.max(2, .012 * s));
      this._line(tip, { x: tip.x - dx * .015, z: tip.z - dz * .015 }, '#70a2a6', Math.max(2, .013 * s));
    }
    if (options.placement && state.ballInHand) {
      const p = options.placement; this._circle(p.x, p.z, TABLE.radius, p.valid ? 'rgba(222,244,202,.6)' : 'rgba(226,109,89,.6)', p.valid ? '#d3e7b7' : '#e67562', 2);
    }
  }

  _diamond(x, z) {
    const p = this.screen(x, z), size = .009 * this.scale, ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - size); ctx.lineTo(p.x + size * .65, p.y); ctx.lineTo(p.x, p.y + size); ctx.lineTo(p.x - size * .65, p.y); ctx.closePath(); ctx.fillStyle = '#c9bc8d'; ctx.fill();
  }
  dispose() {}
}
