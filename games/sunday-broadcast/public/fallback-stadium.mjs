import { TEAMS, WIDTH, clamp } from './football.mjs?v=4';

const css = color => '#' + color.toString(16).padStart(6, '0');
const jerseys = TEAMS.map(team => ({ uniform: css(team.color), trim: css(team.trim), helmet: css(team.helmet) }));

export class FallbackStadium {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    if (!this.context) throw new Error('Canvas is unavailable.');
    this.container = container;
    this.focus = null;
    this.desktop = globalThis.matchMedia?.('(min-width: 1080px) and (pointer: fine)');
    container.replaceChildren(this.canvas);
    this.desktop?.addEventListener?.('change', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    this.width = this.container.clientWidth || 1;
    this.height = this.container.clientHeight || 1;
    this.horizontal = Boolean(this.desktop?.matches && this.width / this.height >= 1.15);
    this.ratio = Math.min(globalThis.devicePixelRatio || 1, 1.6, Math.sqrt(2000000 / (this.width * this.height)));
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
  }

  point(x, y) {
    if (this.horizontal) return [
      this.width / 2 + (y - this.focus.y) * this.scale,
      this.height / 2 + (x - this.focus.x) * this.scale
    ];
    return [
      this.width / 2 + (x - this.focus.x) * this.scale,
      this.height / 2 - (y - this.focus.y) * this.scale
    ];
  }

  screen(player) {
    const [x, y] = this.point(player.x, player.y);
    return {
      x: x / this.width * 100,
      y: (y - Math.max(8, this.scale * 1.5)) / this.height * 100,
      visible: x > 12 && x < this.width - 12 && y > 18 && y < this.height - 10
    };
  }

  rect(x, y, width, height, color) {
    this.context.fillStyle = color;
    const [left, top] = this.point(x, this.horizontal ? y : y + height);
    this.context.fillRect(left, top, (this.horizontal ? height : width) * this.scale, (this.horizontal ? width : height) * this.scale);
  }

  line(x1, y1, x2, y2, color, width) {
    const g = this.context;
    g.beginPath();
    g.moveTo(...this.point(x1, y1));
    g.lineTo(...this.point(x2, y2));
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
  }

  disk(x, y, radius, color) {
    const g = this.context;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  }

  drawSidelines() {
    this.rect(-60, -33, 120, 166, '#222a2b');
    this.rect(-34, -17, 68, 134, '#364d3c');
    for (const side of [-1, 1]) {
      const box = (from, to, y, length, color) =>
        this.rect(side < 0 ? -to : from, y, to - from, length, color);
      box(29, 32, 7, 86, '#263934');
      for (const y of [18, 35, 58, 75]) {
        box(30, 31.1, y, 7, '#85928b');
        box(31.1, 32.4, y - .5, 8, '#192728');
      }
      box(34, 35, -13, 126, '#788078');
      box(35, 38, -18, 136, '#363d3e');
      for (let row = 0; row < 12; row++) {
        const edge = 38 + row * 1.75;
        const [, screenY] = this.point(side * edge, 0);
        if (screenY < -2 * this.scale || screenY > this.height + 2 * this.scale) continue;
        box(edge, edge + 1.35, -18, 136, row % 2 ? '#333a3d' : '#2c3437');
        for (let y = -16; y < 117; y += 3.5) {
          if (Math.floor((y + 18) / 3.5) % 9 === 0) continue;
          box(edge + .32, edge + .83, y + (row % 2 ? 1.25 : 0), 2.15,
            (row + Math.floor(y)) % 4 === 0 ? '#586364' : '#454f51');
        }
      }
    }
  }

  drawField(possession) {
    const g = this.context, half = WIDTH / 2;
    if (this.horizontal) this.drawSidelines();
    else this.rect(-33, -14, 66, 128, '#264737');
    for (let y = 0; y < 100; y += 5) this.rect(-half, y, WIDTH, 5, y % 10 ? '#48734d' : '#406b46');

    const endZones = possession === 1 ? [1, 0] : [0, 1];
    for (let i = 0; i < 2; i++) {
      const side = endZones[i], start = i === 0 ? -10 : 100;
      this.rect(-half, start, WIDTH, 10, side === 0 ? '#20466a' : '#8a432c');
      const [x, y] = this.point(0, start + 5);
      g.fillStyle = '#fff0cb';
      g.font = '900 ' + Math.max(9, this.scale * 3.2) + 'px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.translate(x, y);
      if (this.horizontal) g.rotate(-Math.PI / 2);
      g.fillText(TEAMS[side].name.split(' ')[0].toUpperCase(), 0, 0, WIDTH * this.scale * .85);
      g.restore();
    }
    for (let y = 0; y <= 100; y++) {
      if (y % 5 === 0) this.line(-half, y, half, y, '#ece8ca', y % 10 ? 1 : 1.5);
      else for (const x of [-23, -3.1, 3.1, 23]) this.line(x - .35, y, x + .35, y, '#e6e5c4', 1);
      if (y > 0 && y < 100 && y % 10 === 0) {
        g.fillStyle = '#ede9d2';
        g.font = '700 ' + Math.max(8, this.scale * 1.35) + 'px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const x of [-20, 20]) g.fillText(Math.min(y, 100 - y), ...this.point(x, y + (this.horizontal ? 1.65 : 0)));
      }
    }
    for (const x of [-half, half]) this.line(x, -10, x, 110, '#ede9cc', 2);
    for (const y of [-10, 110]) this.line(-half, y, half, y, '#ede9cc', 2);
    for (const x of [-30, 30]) {
      this.line(x, -11, x, 111, '#adab94', 1);
      if (this.horizontal) {
        for (let y = 10; y < 100; y += 10) this.rect(x - .75, y - .25, 1.5, .5, '#7c8981');
      } else {
        for (let y = 4; y < 100; y += 4) this.rect(x - .75, y, 1.5, 1.55, '#4e5960');
      }
    }
  }

  drawRoute(points) {
    const g = this.context;
    const projected = points.map(([x, y]) => this.point(clamp(x, -26.4, 26.4), clamp(y, -9.8, 109.8)));
    const tail = projected.at(-2), end = projected.at(-1);
    g.beginPath();
    g.moveTo(...projected[0]);
    for (const p of projected.slice(1)) g.lineTo(...p);
    g.strokeStyle = '#a8eeff';
    g.lineWidth = Math.max(1.5, this.scale * .28);
    g.stroke();
    const a = Math.atan2(end[1] - tail[1], end[0] - tail[0]), tip = Math.max(5, this.scale);
    g.beginPath();
    g.moveTo(...end);
    for (const turn of [-.5, .5]) g.lineTo(end[0] - tip * Math.cos(a + turn), end[1] - tip * Math.sin(a + turn));
    g.fillStyle = '#a8eeff';
    g.fill();
  }

  drawPlayer(player, active) {
    const g = this.context, [x, y] = this.point(player.x, player.y);
    const color = jerseys[player.team], r = clamp(this.scale * .81, 3, 14);
    this.disk(x + 1.2, y + 2, r * 1.2, '#15251f8a');
    if (active) {
      this.disk(x, y, r + 4, '#241d18');
      this.disk(x, y, r + 3, '#ffce68');
    }
    g.save();
    g.translate(x, y);
    g.rotate((player.facing || 0) + (this.horizontal ? Math.PI / 2 : 0));
    const lean = player.down ? r * .54 : r;
    g.beginPath();
    g.ellipse(0, 0, r, lean * .78, 0, 0, Math.PI * 2);
    g.fillStyle = color.uniform;
    g.fill();
    g.lineWidth = Math.max(1, r * .15);
    g.strokeStyle = color.trim;
    g.stroke();
    this.disk(0, -lean * .49, r * .44, color.helmet);
    g.restore();
    if (r >= 5.8) {
      g.font = '700 ' + Math.min(12, r * 1.14) + 'px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff4de';
      g.fillText(player.num, x, y + r * .16);
    }
  }

  render(frame, mode, dt, menu = false, replay = false, presentation = {}) {
    const g = this.context, ball = frame.ball;
    const pin = menu || replay ? null : presentation.pin;
    const active = (frame.offenseHuman ? frame.off : frame.def)[frame.active];
    const zoom = menu || replay ? 1 : clamp(presentation.zoom ?? 1, .7, 1.45);
    const playingX = active && !frame.offenseHuman ? ball.x * .67 + active.x * .33 : ball.x * .55;
    const playingY = active && !frame.offenseHuman ? ball.y * .75 + active.y * .25 : ball.y;
    const target = pin || (menu ? { x: 0, y: 50 } : { x: playingX, y: clamp(playingY + (replay ? 0 : 5), 1, 99) });
    const wide = presentation.play || presentation.showReceivers || mode === 1;
    const viewWidth = this.horizontal
      ? menu ? 132 : replay ? 64 : wide ? 81 : mode === 2 ? 61 : 74
      : menu ? 76 : replay ? 42 : wide ? 61 : mode === 2 ? 42 : 53;
    const viewHeight = this.horizontal
      ? menu ? 67 : replay ? 42 : wide ? 59 : mode === 2 ? 45 : 54
      : menu ? 131 : replay ? 49 : wide ? 59 : mode === 2 ? 40 : 53;
    this.scale = Math.min(this.width / viewWidth, this.height / viewHeight) * zoom;
    if (this.horizontal && !menu && !pin) {
      const halfLength = Math.min(66, this.width / (this.scale * 2));
      target.y = clamp(target.y, -16 + halfLength, 116 - halfLength);
    }
    if (!this.focus || this.menu !== menu) this.focus = { ...target };
    const blend = 1 - Math.exp(-dt * 7);
    this.focus.x += (target.x - this.focus.x) * blend;
    this.focus.y += (target.y - this.focus.y) * blend;
    this.menu = menu;

    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    g.fillStyle = '#1e2b36';
    g.fillRect(0, 0, this.width, this.height);
    this.drawField(menu ? 0 : frame.possession);
    if (menu) return;

    this.line(-WIDTH / 2, frame.spot, WIDTH / 2, frame.spot, '#77c6fa', 1.5);
    this.line(-WIDTH / 2, frame.marker, WIDTH / 2, frame.marker, '#f5c363', 2);
    const play = replay ? null : presentation.play;
    if (play?.routes) play.routes.forEach((route, i) => {
      const p = frame.off[7 + i];
      this.drawRoute([[p.x, p.y], ...route.map(([x, y]) => [p.x + x, frame.spot + y])]);
    });
    else if (Number.isFinite(play?.lane)) {
      const rb = frame.off[6];
      this.drawRoute([[rb.x, rb.y], [play.lane * .5, frame.spot - 3], [play.lane, frame.spot + 3], [play.lane, frame.spot + 11]]);
    }

    const players = [...frame.off, ...frame.def];
    for (const player of players) if (player !== active) this.drawPlayer(player, false);
    if (active) this.drawPlayer(active, !replay);
    const [x, y] = this.point(ball.x, ball.y);
    if (frame.flight) {
      const height = ball.h * this.scale * .5;
      this.disk(x, y, 3, '#192920aa');
      g.strokeStyle = '#ffd99a9c';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - height);
      g.stroke();
      this.disk(x, y - height, 4.2, '#f9dea8');
      this.disk(x, y - height, 2.7, '#98512e');
      if (!replay && !frame.flight.kick) {
        const [tx, ty] = this.point(frame.flight.to.x, frame.flight.to.y);
        g.beginPath();
        g.arc(tx, ty, Math.max(5, this.scale * .9), 0, Math.PI * 2);
        g.strokeStyle = '#ffe5a5';
        g.lineWidth = 1.7;
        g.stroke();
      }
    } else {
      this.disk(x + 3, y + 2, 2.7, '#f9dea8');
      this.disk(x + 3, y + 2, 1.7, '#98512e');
    }
  }
}
