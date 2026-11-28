// Procedural broadcast court. Simulation coordinates remain 500 × 940, +y down.
const W = 500, H = 940, MARGIN = 60;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;
const FONT = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const FLOOR_ROLES = ['PG', 'SG', 'SF', 'PF', 'C'];
const lastName = name => String(name || '').trim().split(' ').at(-1);
const activePlayers = game => (game?.players || []).filter(player => player.active);
function attackDir(game, team) {
  return typeof game.attackDir === 'function' ? game.attackDir(team)
    : game.attackDirs?.[team] ?? ((game.period === 1 ? 1 : -1) * (team === 0 ? -1 : 1));
}
function strokeText(ctx, text, x, y, color = '#fff8e8', size = 11) {
  ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#07131ee8'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function circle(ctx, x, y, radius, fill, stroke, width = 1) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(ctx, points, color, width = 2) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

export class CourtView {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0; this.height = 0; this.dpr = 1; this.scale = 1; this.rotated = false;
    this.center = { x: 250, y: 470 }; this.ready = false;
    this.arena = null; this.arenaKey = ''; this.flash = null; this.lastEventId = null;
    this.lastScore = null; this.screenPlayers = []; this.labels = []; this.labelSlots = new Map();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const width = rect.width, height = rect.height;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      this.width = width; this.height = height; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
    }
    this.rotated = width / height >= 1.15;
    this.ready = true; return true;
  }

  _point(x, y) {
    const dx = (x - this.center.x) * this.scale, dy = (y - this.center.y) * this.scale;
    return this.rotated ? { x: this.width / 2 - dy, y: this.height / 2 + dx }
      : { x: this.width / 2 + dx, y: this.height / 2 + dy };
  }

  // Input uses screen coordinates: right +x, down +y. Clockwise view is inverted.
  screenDirection(input = {}) {
    return this.rotated ? { ...input, x: input.y || 0, y: -(input.x || 0) } : { ...input };
  }

  worldPoint(clientX, clientY) {
    if (!this.ready) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.width / 2) / this.scale;
    const y = (clientY - rect.top - this.height / 2) / this.scale;
    return this.rotated ? { x: this.center.x + y, y: this.center.y - x }
      : { x: this.center.x + x, y: this.center.y + y };
  }

  hitPlayer(clientX, clientY, game) {
    if (!this.ready) return null;
    const rect = this.canvas.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
    const active = activePlayers(game);
    for (const label of this.labels) {
      if (x >= label.left && x <= label.right && y >= label.top && y <= label.bottom
        && active.some(p => p.id === label.id)) return label.id;
    }
    let nearest = null, best = 30;
    for (const p of active) {
      const screen = this._point(p.x, p.y), unit = this._spriteUnit(p);
      const distance = Math.hypot(x - screen.x, y - (screen.y - 11 * unit));
      if (distance < best) { nearest = p.id; best = distance; }
    }
    return nearest;
  }

  _worldTransform(ctx) {
    ctx.translate(this.width / 2, this.height / 2);
    if (this.rotated) ctx.rotate(Math.PI / 2);
    ctx.scale(this.scale, this.scale); ctx.translate(-this.center.x, -this.center.y);
  }

  _makeArena(team = {}) {
    const key = `${team.id}|${team.primary}|${team.secondary}|${team.name}`;
    if (this.arena && this.arenaKey === key) return;
    this.arenaKey = key;
    const canvas = this.canvas.ownerDocument?.createElement('canvas') || document.createElement('canvas');
    const resolution = 1.5;
    canvas.width = (W + MARGIN * 2) * resolution; canvas.height = (H + MARGIN * 2) * resolution;
    const c = canvas.getContext('2d'); c.scale(resolution, resolution); c.translate(MARGIN, MARGIN);
    const primary = team.primary || '#123457', accent = team.secondary || '#d6ac5f';
    c.fillStyle = '#101c28'; c.fillRect(-MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2);
    // The arena is deterministic and cached; seats never shimmer during play.
    const shirts = [primary, '#506475', '#9b7758', '#263e50', '#c8c4b8', primary, '#304c5e'];
    const person = (x, y, i) => {
      c.fillStyle = '#0a141d'; c.fillRect(x - 5, y + 1, 10, 12);
      c.fillStyle = shirts[i % shirts.length]; c.fillRect(x - 5, y - 1, 10, 7);
      c.fillStyle = ['#8b5b40', '#c28d67', '#e6b991', '#613f2d'][i % 4]; c.fillRect(x - 3, y - 5, 6, 6);
    };
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 49; i++) {
        const y = 12 + i * 19;
        if (y < 345 || y > 605) person(-31 - row * 19, y, i + row * 7);
        person(531 + row * 19, y, i + row * 11);
      }
      for (let i = 0; i < 28; i++) {
        person(-6 + i * 19, -31 - row * 18, i + row * 9);
        person(-6 + i * 19, 973 + row * 18, i + row * 5);
      }
    }
    // Scorer's table and benches sit off the playing surface.
    c.fillStyle = '#162a39'; c.fillRect(-58, 407, 32, 126);
    c.fillStyle = '#f1bf67'; c.fillRect(-30, 409, 3, 122);
    c.save(); c.translate(-43, 470); c.rotate(-Math.PI / 2); c.font = `900 11px ${FONT}`;
    c.textAlign = 'center'; c.fillStyle = '#f2d89d'; c.fillText('POCKET SPORTS', 0, 4); c.restore();
    c.fillStyle = '#35434c'; c.fillRect(-52, 340, 19, 55); c.fillRect(-52, 548, 19, 55);
    for (let i = 0; i < 3; i++) { person(-42, 350 + i * 16, i); person(-42, 557 + i * 16, i + 3); }
    // Crisp floor boundary with an understated edge shadow.
    c.fillStyle = '#0009'; c.fillRect(-17, -17, 534, 974);
    c.fillStyle = primary; c.fillRect(-13, -22, 526, 984);
    c.fillStyle = '#d6a86a'; c.fillRect(0, 0, W, H);
    const planks = ['#d2a468', '#dbaf73', '#d6a76a', '#dcb37a', '#d4a86e', '#d9ad72'];
    for (let x = 0, col = 0; x < W; x += 25, col++) {
      for (let y = -((col % 3) * 42); y < H; y += 126) {
        c.fillStyle = planks[(col * 3 + Math.floor((y + 126) / 126)) % planks.length];
        c.fillRect(x, Math.max(0, y), 25, Math.min(H, y + 126) - Math.max(0, y));
        c.fillStyle = '#744c2620'; c.fillRect(x, Math.max(0, y), 1, Math.min(H, y + 126) - Math.max(0, y));
        if (y > 0) c.fillRect(x, y, 25, .8);
        c.fillStyle = '#fff5d814'; c.fillRect(x + 5, Math.max(0, y + 18), 1, Math.min(78, H - Math.max(0, y + 18)));
      }
    }
    // Gentle center light, never a moving effect.
    const light = c.createLinearGradient(0, 0, W, H);
    light.addColorStop(0, '#fff5d321'); light.addColorStop(.45, '#fff5d300'); light.addColorStop(1, '#65402018');
    c.fillStyle = light; c.fillRect(0, 0, W, H);
    c.fillStyle = primary; c.fillRect(190, 0, 120, 190); c.fillRect(190, 750, 120, 190);
    c.fillStyle = '#ffffff0b'; c.fillRect(194, 0, 112, 188); c.fillRect(194, 752, 112, 188);
    const ink = '#fff8e9'; c.strokeStyle = ink; c.lineWidth = 2.1;
    c.strokeRect(1, 1, W - 2, H - 2); line(c, [[0, 470], [500, 470]], ink, 2);
    circle(c, 250, 470, 60, null, ink, 2); circle(c, 250, 470, 3, ink);
    c.save(); c.globalAlpha = .87; c.font = `950 ${String(team.short || 'PCH').length > 3 ? 40 : 54}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 5; c.strokeStyle = '#fff5dd';
    c.strokeText(team.short || 'PCH', 250, 470); c.fillStyle = primary; c.fillText(team.short || 'PCH', 250, 470); c.restore();
    for (const bottom of [false, true]) {
      c.save(); if (bottom) { c.translate(W, H); c.rotate(Math.PI); }
      c.strokeStyle = ink; c.lineWidth = 2;
      c.strokeRect(190, 0, 120, 190);
      c.beginPath(); c.arc(250, 190, 60, 0, Math.PI); c.stroke();
      c.save(); c.setLineDash([5, 7]); c.beginPath(); c.arc(250, 190, 60, Math.PI, TAU); c.stroke(); c.restore();
      // NCAA arc radius 22 ft 1¾ in; corner lines 21 ft 7¾ in from center.
      const radius = 221.4583, corner = 216.5, joinY = 52.5 + Math.sqrt(radius * radius - corner * corner);
      const angle = Math.acos(corner / radius);
      line(c, [[250 - corner, 0], [250 - corner, joinY]], ink, 2);
      line(c, [[250 + corner, 0], [250 + corner, joinY]], ink, 2);
      c.beginPath(); c.arc(250, 52.5, radius, angle, Math.PI - angle); c.stroke();
      c.beginPath(); c.arc(250, 52.5, 40, 0, Math.PI); c.stroke();
      line(c, [[210, 52.5], [210, 40]], ink, 2); line(c, [[290, 52.5], [290, 40]], ink, 2);
      for (const y of [72, 111, 141, 171]) {
        line(c, [[182, y], [190, y]], ink, 2); line(c, [[310, y], [318, y]], ink, 2);
      }
      c.font = `900 ${String(team.name || 'POCKET COLLEGE HOOPS').length > 15 ? 11 : 15}px ${FONT}`;
      c.fillStyle = '#fff3d5'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(team.name || 'POCKET COLLEGE HOOPS').toUpperCase(), 250, -11, 440);
      // Stanchion, glass backboard, and net; actual rim center is y=52.5.
      c.fillStyle = '#111d2b'; c.fillRect(239, -19, 22, 54); c.fillStyle = accent; c.fillRect(244, -13, 12, 20);
      c.fillStyle = '#cce9e3aa'; c.fillRect(218, 35, 64, 7);
      c.strokeStyle = '#eefcf6'; c.lineWidth = 2; c.strokeRect(218, 35, 64, 7);
      line(c, [[250, 42], [250, 46]], '#f1792d', 3);
      circle(c, 250, 52.5, 8, '#f9ffff80', '#ff7728', 3);
      line(c, [[245, 48], [253, 58], [255, 49], [247, 58]], '#fff6dba0', 1);
      c.restore();
    }
    this.arena = canvas;
  }

  _spriteUnit(player) {
    // Keep a readable ~15 × 29 px minimum without the previous 20 px-wide
    // mobile silhouette overwhelming a court that may scale to .45 px/unit.
    return Math.max(.84, clamp(this.scale * .98, .84, 1.5) * (1 + ((player.height || 79) - 79) * .006));
  }

  _drawPlayer(ctx, p, game, time, options) {
    const position = this._point(p.x, p.y), u = this._spriteUnit(p);
    const team = game.teams?.[p.team] || {}, selected = p.id === game.controlled;
    const speed = Math.hypot(p.vx || 0, p.vy || 0), running = Math.min(1, speed / 100);
    const stride = Math.sin(time * 17 + p.id * 1.9) * running;
    const jumping = Math.max(0, p.jump || 0), lift = Math.min(9, jumping * 19) * u;
    const shooting = ['jumper', 'dunk', 'layup', 'block'].includes(p.anim) && p.animTime > 0;
    const jersey = p.team === 0 ? (team.primary || '#103559') : '#f0eee5';
    const trim = p.team === 0 ? (team.secondary || '#eab76d') : (team.primary || '#2356a8');
    const number = p.team === 0 ? '#fffdf4' : '#192637';
    // Ground markings stay still beneath the player's jumping body.
    ctx.save(); ctx.translate(position.x, position.y);
    ctx.fillStyle = '#1d22194a'; ctx.beginPath(); ctx.ellipse(0, 2, 8.5 * u, 3.8 * u, 0, 0, TAU); ctx.fill();
    if (selected) {
      ctx.strokeStyle = '#0b1825'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.ellipse(0, 1, 10.5 * u, 5.8 * u, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffe060'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = '#ffe060'; ctx.beginPath(); ctx.moveTo(-3, 11 * u); ctx.lineTo(3, 11 * u); ctx.lineTo(0, 6 * u); ctx.fill();
    }
    ctx.translate(0, -lift); ctx.scale(u, u);
    const skin = p.skin || '#b78058';
    // Pixel-inspired silhouettes with independent legs, arms and a clear jersey.
    const armTop = shooting ? -29 : -21;
    ctx.beginPath();
    [[-5,-32],[5,-32],[5,-24],[7,-23],[9,armTop],[9,-10],[7,-9],[7,-4],[9,-2],[9,1],
      [2,1],[2,-5],[-2,-5],[-2,1],[-9,1],[-9,-2],[-7,-4],[-7,-9],[-9,-10],[-9,armTop],[-7,-23],[-5,-24]]
      .forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath(); ctx.lineJoin = 'round'; ctx.fillStyle = '#0a1721'; ctx.fill();
    ctx.strokeStyle = selected ? '#ffe49c' : '#0a1721'; ctx.lineWidth = selected ? 1.7 : 1.5; ctx.stroke();
    ctx.fillStyle = '#18202b'; ctx.fillRect(-7, -7 + stride * 2, 5, 7); ctx.fillRect(2, -7 - stride * 2, 5, 7);
    ctx.fillStyle = '#f3f0df'; ctx.fillRect(-8, -2 + stride * 2, 7, 3); ctx.fillRect(2, -2 - stride * 2, 7, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(-9, shooting ? -29 : -21 + stride * 2, 3, shooting ? 13 : 11);
    ctx.fillRect(6, shooting ? -29 : -21 - stride * 2, 3, shooting ? 13 : 11);
    ctx.fillStyle = '#111923'; ctx.fillRect(-8, -23, 16, 17);
    ctx.fillStyle = jersey; ctx.fillRect(-7, -23, 14, 14);
    ctx.fillRect(-7, -11, 6, 6); ctx.fillRect(1, -11, 6, 6);
    ctx.fillStyle = trim; ctx.fillRect(-7, -22, 2, 11); ctx.fillRect(5, -22, 2, 11);
    ctx.fillRect(-7, -10, 14, 2);
    ctx.fillStyle = '#ffffff16'; ctx.fillRect(-4, -22, 6, 10);
    ctx.fillStyle = skin; ctx.fillRect(-5, -31, 10, 9); ctx.fillRect(-3, -24, 6, 3);
    ctx.fillStyle = '#211b19'; ctx.fillRect(-5, -32, 10, 3); ctx.fillRect(-5, -31, 2, 4);
    ctx.fillStyle = '#f3cb9b55'; ctx.fillRect(-2, -28, 4, 2);
    ctx.font = `900 ${Math.max(8, 8 / u)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.2; ctx.strokeStyle = p.team === 0 ? '#07131c' : '#faf8ec';
    ctx.strokeText(String(p.number ?? p.slot + 1), 0, -16); ctx.fillStyle = number;
    ctx.fillText(String(p.number ?? p.slot + 1), 0, -16);
    ctx.restore();
  }

  _guidance(ctx, game, players, options) {
    if (options.preview || options.guidance === 'expert' || game.phase === 'finished') return;
    const controlled = players.find(p => p.id === game.controlled);
    const human = game.human < 0 ? game.possession : game.human;
    if (!controlled || game.possession !== human) return;
    const carrier = players.find(p => p.id === game.ball?.owner);
    if (carrier?.team !== human) return;
    const hoop = { x: 250, y: attackDir(game, human) < 0 ? 52.5 : 887.5 };
    if (options.charging) {
      const from = this._point(carrier.x, carrier.y), to = this._point(hoop.x, hoop.y);
      ctx.save(); ctx.setLineDash([4, 7]); ctx.strokeStyle = '#fff1bc88'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.setLineDash([]); circle(ctx, to.x, to.y, 13, null, '#ffe176aa', 2); ctx.restore();
    }
    if (options.guidance !== 'simple') return;
    // One unobtrusive early-possession diagram shows the current call's purpose.
    if ((game.playTime || 0) < 2.6 && game.phase === 'live') {
      const call = game.offense?.[human], dir = attackDir(game, human);
      const big = players.find(p => p.team === human && p.slot === 4);
      if (big && (call === 'pickroll' || call === 'post')) {
        const start = this._point(big.x, big.y);
        const target = call === 'pickroll' ? this._point(carrier.x + 27, carrier.y + dir * 25)
          : this._point(300, hoop.y - dir * 70);
        ctx.save(); ctx.setLineDash([3, 7]); line(ctx, [[start.x, start.y], [target.x, target.y]], '#fff4cc60', 1.3);
        ctx.setLineDash([]); circle(ctx, target.x, target.y, 7, null, '#fff4cc60', 1.2); ctx.restore();
      }
    }
  }

  _drawLabels(ctx, game, players, options) {
    this.labels = [];
    if (options.preview) return;
    const controlled = players.find(p => p.id === game.controlled), requests = [];
    if (controlled && options.showNames) requests.push({ player: controlled, text: lastName(controlled.name).toUpperCase(), selected: true });
    const human = game.human < 0 ? game.possession : game.human;
    const carrier = players.find(p => p.id === game.ball?.owner);
    if (options.guidance === 'simple' && game.phase !== 'finished' && carrier?.team === human) {
      const receivers = typeof game.receivers === 'function' ? game.receivers()
        : players.filter(p => p.team === human && p.id !== game.ball.owner).sort((a, b) => a.slot - b.slot);
      for (const player of receivers.slice(0, 4)) requests.push({ player, text: FLOOR_ROLES[player.slot] || player.position || 'P', selected: false });
    }
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (const { player, text, selected } of requests) {
      const sprite = this.screenPlayers.find(p => p.id === player.id);
      if (!sprite || sprite.x < -15 || sprite.x > this.width + 15 || sprite.y < -15 || sprite.y > this.height + 40) continue;
      const size = selected ? clamp(10 * sprite.unit, 10, 12) : 11;
      ctx.font = `800 ${size}px ${FONT}`;
      const width = Math.ceil(ctx.measureText(text).width) + 12, height = selected ? 19 : 18;
      const top = sprite.top - sprite.y, side = width / 2 + 13 * sprite.unit;
      const candidates = [[0,top-13],[side,top+13],[-side,top+13],[0,19],
        [side,top-10],[-side,top-10],[0,top-35],[side,22],[-side,22],[0,40],
        [side+24,top-32],[-side-24,top-32],[0,top-57]];
      let best = null, bestScore = Infinity;
      const key = `${selected ? 'name' : 'role'}:${player.id}`, previous = this.labelSlots.get(key);
      for (let index = 0; index < candidates.length; index++) {
        const [dx,dy] = candidates[index];
        const left = clamp(sprite.x + dx - width / 2, 4, Math.max(4, this.width - width - 4));
        const upper = clamp(sprite.y + dy - height / 2, 5, Math.max(5, this.height - height - 5));
        const box = { id: player.id, text, selected, left, right: left + width, top: upper, bottom: upper + height, size };
        let score = Math.hypot(dx, dy - top + 13) * .12 + (index === previous ? -2 : 0);
        for (const body of this.screenPlayers) score += overlap(box, body) * 3;
        for (const label of this.labels) score += overlap(box, label) * 40;
        if (score < bestScore) { bestScore = score; best = { ...box, index }; }
      }
      this.labelSlots.set(key, best.index);
      best.anchor = { x: sprite.x, y: sprite.top + 2 };
      best.end = { x: clamp(best.anchor.x, best.left + 3, best.right - 3), y: clamp(best.anchor.y, best.top + 2, best.bottom - 2) };
      this.labels.push(best);
    }
    // Draw all leaders underneath all labels, so a displaced teammate's line
    // cannot strike through the selected player's name or another role badge.
    for (const { anchor, end, selected } of this.labels) {
      if (Math.hypot(end.x - anchor.x, end.y - anchor.y) > 4) {
        line(ctx, [[anchor.x,anchor.y],[end.x,end.y]], '#092235c9', 3);
        line(ctx, [[anchor.x,anchor.y],[end.x,end.y]], selected ? '#ffe176c9' : '#d8e9d4a8', 1);
      }
    }
    for (const best of this.labels) {
      const { selected, text, size } = best, width = best.right - best.left, height = best.bottom - best.top;
      ctx.fillStyle = selected ? '#102638ef' : '#102b3ee8';
      ctx.fillRect(best.left, best.top, width, height);
      ctx.strokeStyle = selected ? '#ffe176' : '#b8d5d0'; ctx.lineWidth = 1;
      ctx.strokeRect(best.left + .5, best.top + .5, width - 1, height - 1);
      strokeText(ctx, text, (best.left + best.right) / 2, (best.top + best.bottom) / 2 + .5,
        selected ? '#ffe176' : '#fff1ce', size);
    }
  }

  _drawBall(ctx, game, time) {
    const ball = game.ball; if (!ball) return;
    const point = this._point(ball.x, ball.y), elevation = clamp((ball.z || 0) * this.scale * .58, 0, 105);
    const radius = clamp(6.7 * this.scale, 4.8, 9) * (1 + elevation / 420);
    ctx.fillStyle = '#24190955'; ctx.beginPath(); ctx.ellipse(point.x + 1, point.y + 3, radius * .9, radius * .43, 0, 0, TAU); ctx.fill();
    const x = point.x + (ball.owner !== null ? radius * .8 : 0), y = point.y - elevation - 4;
    if (ball.flight) {
      const f = ball.flight, heading = this._point(ball.x - (f.end.x - f.start.x) * .018, ball.y - (f.end.y - f.start.y) * .018);
      ctx.strokeStyle = '#ffdc8b42'; ctx.lineWidth = radius * 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(heading.x, heading.y - elevation - 4); ctx.lineTo(x, y); ctx.stroke(); ctx.lineCap = 'butt';
    }
    circle(ctx, x, y, radius + 1, '#1d1a19'); circle(ctx, x, y, radius, '#ee792d', '#ffd18c', .8);
    ctx.save(); ctx.translate(x, y); ctx.rotate(time * 5); ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.clip();
    line(ctx, [[-radius, 0], [radius, 0]], '#653212', 1);
    ctx.strokeStyle = '#653212'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, radius * .35, radius, 0, 0, TAU); ctx.stroke();
    ctx.restore(); circle(ctx, x - radius * .27, y - radius * .35, radius * .16, '#ffe09b90');
  }

  render(game, { dt = 1 / 60, time = 0, charge = 0, charging = false, guidance = 'simple', camera = 'full', showNames = true, preview = false } = {}) {
    if (!game || !this.ctx || !this._resize()) return;
    const ctx = this.ctx, players = activePlayers(game);
    const options = { charge, charging, guidance, camera, showNames, preview };
    this._makeArena(game.teams?.[0]);
    const fit = Math.min(this.width / (this.rotated ? H + MARGIN * 2 : W + MARGIN * 2),
      this.height / (this.rotated ? W + MARGIN * 2 : H + MARGIN * 2));
    this.scale = fit * (camera === 'follow' ? 1.35 : 1);
    if (camera === 'follow') {
      const controlled = players.find(p => p.id === game.controlled), ball = game.ball || { x: 250, y: 470 };
      const focus = controlled ? { x: ball.x * .65 + controlled.x * .35, y: ball.y * .65 + controlled.y * .35 } : ball;
      const halfWidth = (this.rotated ? this.height : this.width) / this.scale / 2;
      const halfHeight = (this.rotated ? this.width : this.height) / this.scale / 2;
      const x = halfWidth >= 310 ? 250 : clamp(focus.x, -60 + halfWidth, 560 - halfWidth);
      const y = halfHeight >= 530 ? 470 : clamp(focus.y, -60 + halfHeight, 1000 - halfHeight);
      const ease = 1 - Math.exp(-Math.min(.1, dt) * 8);
      this.center.x += (x - this.center.x) * ease; this.center.y += (y - this.center.y) * ease;
    } else { this.center.x = 250; this.center.y = 470; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.fillStyle = '#101c28'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save(); this._worldTransform(ctx);
    ctx.drawImage(this.arena, -MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2); ctx.restore();
    // A made basket briefly illuminates that rim, including during snapshot replay.
    const score = game.score || [0, 0], event = game.lastEvent;
    if (this.lastScore && (score[0] > this.lastScore[0] || score[1] > this.lastScore[1])) {
      this.flash = { team: score[0] > this.lastScore[0] ? 0 : 1, remaining: .55 };
    } else if (event?.type === 'score' && event.id !== this.lastEventId) this.flash = { team: event.team, remaining: .55 };
    this.lastScore = [score[0], score[1]]; this.lastEventId = event?.id;
    if (this.flash?.remaining > 0) {
      this.flash.remaining -= Math.max(0, dt);
      const hoop = this._point(250, attackDir(game, this.flash.team) < 0 ? 52.5 : 887.5);
      ctx.save(); ctx.globalAlpha = clamp(this.flash.remaining * 2, 0, 1);
      circle(ctx, hoop.x, hoop.y, (19 - this.flash.remaining * 12) * Math.max(.8, this.scale), null, '#fff4a9', 3); ctx.restore();
    }
    this.screenPlayers = players.map(player => {
      const point = this._point(player.x, player.y), unit = this._spriteUnit(player);
      const lift = Math.min(9, Math.max(0, player.jump || 0) * 19) * unit;
      return { id: player.id, ...point, unit, left: point.x - 10 * unit, right: point.x + 10 * unit,
        top: point.y - 33 * unit - lift, bottom: point.y + 3 * unit };
    });
    this._guidance(ctx, game, players, options);
    // Sort on screen-ground depth; player text always remains upright.
    players.sort((a, b) => this.rotated ? a.x - b.x : a.y - b.y);
    const animationTime = Number.isFinite(game.elapsed) ? game.elapsed : time;
    for (const player of players) this._drawPlayer(ctx, player, game, animationTime, options);
    this._drawBall(ctx, game, animationTime);
    // One final label pass separates role badges and the selected-player name.
    this._drawLabels(ctx, game, players, options);
    if (!preview && guidance !== 'expert' && this.width > 320) {
      const human = game.human < 0 ? game.possession : game.human;
      const hoop = this._point(250, attackDir(game, human) < 0 ? 52.5 : 887.5);
      if (hoop.x > 12 && hoop.x < this.width - 12 && hoop.y > 10 && hoop.y < this.height - 10) {
        const labelY = hoop.y + (this.rotated ? 18 : attackDir(game, human) < 0 ? -18 : 18);
        strokeText(ctx, 'ATTACK', hoop.x, labelY, '#fff0b799', 9);
      }
    }
  }
}
