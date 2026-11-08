import { screenToWorld } from "./math.js";
import { SPORTS } from "../sports/rules.js";
const TAU = Math.PI * 2;
export class Arena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.rules = SPORTS.hockey;
    this.trail = [];
    this.spark = [];
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    this.width = r.width;
    this.height = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.rotated = r.width / Math.max(1, r.height) > 1.25;
    const { width: pitchWidth, height: pitchHeight } = this.rules;
    this.scale = Math.max(
      0.01,
      this.rotated
        ? Math.min(
            (r.width - 30) / (pitchHeight + 110),
            (r.height - 30) / (pitchWidth + 80),
          )
        : Math.min(
            (r.width - 30) / (pitchWidth + 80),
            (r.height - 30) / (pitchHeight + 110),
          ),
    );
    this.x = this.rotated
      ? (r.width + pitchHeight * this.scale) / 2
      : (r.width - pitchWidth * this.scale) / 2;
    this.y = this.rotated
      ? (r.height - pitchWidth * this.scale) / 2
      : (r.height - pitchHeight * this.scale) / 2;
  }
  toWorld(input) {
    return screenToWorld(input, this.rotated);
  }
  draw(
    game,
    { guide = true, preview = false, replay = null, reduced = false } = {},
  ) {
    if (this.rules !== game.rules) {
      this.rules = game.rules;
      this.trail = [];
      this.resize();
    }
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    if (!w || !h) return;
    const hockey = game.sport === "hockey",
      r = SPORTS[game.sport],
      state = replay || game;
    ctx.fillStyle = hockey ? "#111f2c" : "#102922";
    ctx.fillRect(0, 0, w, h);
    // Stadium seating stays quiet around the playing surface.
    const glow = ctx.createRadialGradient(
      w / 2,
      h / 2,
      0,
      w / 2,
      h / 2,
      w * 0.72,
    );
    glow.addColorStop(0, hockey ? "#254355" : "#174839");
    glow.addColorStop(1, hockey ? "#0b1521" : "#091b19");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hockey ? "#49657b44" : "#67877133";
    for (let row = 0; row < 4; row++)
      for (let j = 0; j < Math.ceil(h / 13); j++) {
        ctx.fillRect(5 + row * 8, j * 13 + (row % 2) * 6, 4, 5);
        ctx.fillRect(w - 9 - row * 8, j * 13 + (row % 2) * 6, 4, 5);
      }
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.rotated) ctx.rotate(Math.PI / 2);
    ctx.scale(this.scale, this.scale);
    if (hockey) this.ice(ctx);
    else {
      ctx.save();
      ctx.scale(r.width / 680, r.height / 1080);
      this.pitch(ctx);
      ctx.restore();
    }
    if (!hockey && game.restartData && !replay) {
      const spot = game.restartData;
      ctx.strokeStyle = "#e3fa85";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 28, 0, TAU);
      ctx.stroke();
    }
    // Ball path is short and disappears on possession changes.
    if (!replay && !reduced) {
      this.trail.push({ x: state.ball.x, y: state.ball.y });
      if (this.trail.length > 7) this.trail.shift();
    }
    if (state.ball.owner === null && !reduced) {
      ctx.strokeStyle = hockey ? "#3f697855" : "#ffffff44";
      ctx.lineWidth = hockey ? 5 : 4;
      ctx.beginPath();
      this.trail.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.stroke();
    }
    if (guide && !preview && !replay) {
      const p = state.players[state.controlled];
      if (p && game.hasBall) {
        const mates = state.players
          .filter((q) => q.side === 0 && q.id !== p.id && !q.keeper)
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.y - p.y) -
              Math.hypot(b.x - p.x, b.y - p.y),
          )
          .slice(0, 2);
        ctx.save();
        ctx.setLineDash([7, 14]);
        ctx.strokeStyle = hockey ? "#1b8aa744" : "#f0ffc555";
        ctx.lineWidth = 2;
        mates.forEach((q) => {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        });
        ctx.restore();
      }
    }
    const b = state.ball;
    if (!hockey && guide && b.z > 8 && b.airTarget) {
      ctx.save();
      ctx.strokeStyle = "#f8edb79c";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.ellipse(b.airTarget.x, b.airTarget.y, 21, 15, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    state.players.forEach((p) =>
      this.player(
        ctx,
        p,
        game.teams[p.side],
        p.id === state.controlled,
        hockey,
        game.time,
        preview,
      ),
    );
    const height = hockey ? 0 : Math.max(0, b.z || 0);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = height > 8 ? "#06101860" : "#06101844";
    ctx.beginPath();
    ctx.ellipse(2, 4, hockey ? 8 : 10 + height * 0.035, 5, 0, 0, TAU);
    ctx.fill();
    // Height always lifts the ball toward the top of the screen, including
    // the rotated landscape pitch. The shadow marks its actual ground path.
    ctx.translate(this.rotated ? -height : 0, this.rotated ? 0 : -height);
    if (height) {
      const airScale = 1 + Math.min(0.3, height / 300);
      ctx.scale(airScale, airScale);
    }
    ctx.fillStyle = hockey ? "#071521" : "#fffdf0";
    ctx.strokeStyle = hockey ? "#ffffff" : "#163a25";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, hockey ? 7 : 8, hockey ? 5 : 8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (!hockey) {
      ctx.fillStyle = "#183d2a";
      ctx.beginPath();
      ctx.arc(1, -1, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    if (!preview) {
      ctx.textAlign = "center";
      ctx.fillStyle = hockey ? "#a5bccb" : "#c7d9b7";
      ctx.font = "600 10px system-ui";
      ctx.fillText(this.rotated ? "ATTACK →" : "ATTACK ↑", w / 2, 13);
    }
  }
  ice(c) {
    c.shadowColor = "#0009";
    c.shadowBlur = 35;
    c.fillStyle = "#0d111b";
    this.round(c, -29, -28, 738, 1136, 110);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "#e5f0f1";
    c.strokeStyle = "#adc3ce";
    c.lineWidth = 10;
    this.round(c, -7, -7, 694, 1094, 92);
    c.fill();
    c.stroke();
    c.save();
    this.round(c, 0, 0, 680, 1080, 85);
    c.clip();
    const ice = c.createLinearGradient(0, 0, 680, 1080);
    ice.addColorStop(0, "#eff6f5");
    ice.addColorStop(0.5, "#ccdde3");
    ice.addColorStop(1, "#e3eef1");
    c.fillStyle = ice;
    c.fillRect(0, 0, 680, 1080);
    c.strokeStyle = "#9cbac330";
    c.lineWidth = 1;
    for (let i = 0; i < 80; i++) {
      const x = (i * 117) % 680,
        y = (i * 173) % 1080;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + ((i % 5) - 2) * 39, y + 60);
      c.stroke();
    }
    c.fillStyle = "#376da3";
    c.fillRect(0, 355, 680, 9);
    c.fillRect(0, 716, 680, 9);
    c.fillStyle = "#d03a4b";
    c.fillRect(0, 538, 680, 4);
    c.fillRect(0, 68, 680, 3);
    c.fillRect(0, 1009, 680, 3);
    c.strokeStyle = "#ba5c6a";
    c.lineWidth = 3;
    for (const y of [220, 860])
      for (const x of [165, 515]) {
        c.beginPath();
        c.arc(x, y, 76, 0, TAU);
        c.stroke();
        c.fillStyle = "#b94657";
        c.beginPath();
        c.arc(x, y, 5, 0, TAU);
        c.fill();
      }
    c.strokeStyle = "#5185ad";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(340, 540, 91, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(340, 540, 7, 0, TAU);
    c.fillStyle = "#5185ad";
    c.fill();
    c.save();
    c.translate(340, 540);
    c.rotate(-Math.PI / 2);
    c.font = "900 52px system-ui";
    c.textAlign = "center";
    c.fillStyle = "#274e6b18";
    c.fillText("POCKET HOCKEY", 0, 17);
    c.restore();
    for (const y of [0, 1080]) {
      c.fillStyle = "#71a9d169";
      c.beginPath();
      c.ellipse(340, y, 82, 77, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "#c44151";
      c.lineWidth = 4;
      c.stroke();
    }
    c.restore();
    this.net(c, 138, true);
    c.save();
    c.fillStyle = "#6d8b9b";
    c.font = "800 15px system-ui";
    c.textAlign = "center";
    c.translate(-15, 540);
    c.rotate(-Math.PI / 2);
    c.fillText("DAILY FLYER  /  ICE DIVISION", 0, 0);
    c.restore();
  }
  pitch(c) {
    c.shadowColor = "#0008";
    c.shadowBlur = 35;
    c.fillStyle = "#153b2d";
    c.fillRect(-24, -32, 728, 1144);
    c.shadowBlur = 0;
    c.fillStyle = "#286243";
    c.fillRect(0, 0, 680, 1080);
    for (let j = 0; j < 12; j++) {
      c.fillStyle = j % 2 ? "#2b6948" : "#2f704c";
      c.fillRect(0, j * 90, 680, 90);
    }
    c.strokeStyle = "#e5f5d1a8";
    c.lineWidth = 3;
    c.strokeRect(3, 3, 674, 1074);
    c.beginPath();
    c.moveTo(0, 540);
    c.lineTo(680, 540);
    c.stroke();
    c.beginPath();
    c.arc(340, 540, 92, 0, TAU);
    c.stroke();
    for (const y of [0, 1080]) {
      const d = y ? -1 : 1;
      c.strokeRect(143, y, 394, d * 170);
      c.strokeRect(245, y, 190, d * 65);
      c.beginPath();
      c.arc(340, y + d * 118, 4, 0, TAU);
      c.fillStyle = "#e5f5d1";
      c.fill();
      c.beginPath();
      c.arc(
        340,
        y + d * 118,
        90,
        y ? Math.PI * 1.19 : Math.PI * 0.19,
        y ? Math.PI * 1.81 : Math.PI * 0.81,
      );
      c.stroke();
    }
    c.fillStyle = "#e5f5d1";
    c.beginPath();
    c.arc(340, 540, 4, 0, TAU);
    c.fill();
    this.net(c, (this.rules.goal * 680) / this.rules.width, false);
    c.fillStyle = "#09281c28";
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(680, 0);
    c.lineTo(680, 200);
    c.lineTo(0, 40);
    c.fill();
  }
  net(c, width, hockey) {
    for (const y of [0, 1080]) {
      const d = y ? 1 : -1;
      c.fillStyle = hockey ? "#d7e6e6" : "#d8e5d622";
      c.fillRect(340 - width / 2, y, width, d * 29);
      c.strokeStyle = hockey ? "#a4424f" : "#f5f6dc";
      c.lineWidth = 5;
      c.strokeRect(340 - width / 2, y, width, d * 29);
      c.strokeStyle = hockey ? "#8c9ba577" : "#e6efc866";
      c.lineWidth = 1;
      for (let x = 340 - width / 2 + 8; x < 340 + width / 2; x += 9) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + d * 29);
        c.stroke();
      }
    }
  }
  player(c, p, team, selected, hockey, time, preview) {
    const [primary, secondary] = team.colors;
    const jersey = p.side ? "#f0eee5" : primary;
    const trim = p.side ? primary : secondary;
    const run =
      Math.sin(time * 13 + p.id) * Math.min(7, Math.hypot(p.vx, p.vy) / 27);
    c.save();
    c.translate(p.x, p.y);
    if (!hockey) c.scale(1.12, 1.12);
    c.fillStyle = "#00121a30";
    c.beginPath();
    c.ellipse(3, 8, 17, 9, 0, 0, TAU);
    c.fill();
    if (selected && !preview) {
      c.strokeStyle = hockey ? "#1682a6" : "#e0ff8a";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, 2, 25, 24, 0, 0, TAU);
      c.stroke();
      c.fillStyle = hockey ? "#167998" : "#e3fa85";
      c.beginPath();
      c.moveTo(-6, -34);
      c.lineTo(6, -34);
      c.lineTo(0, -26);
      c.fill();
    }
    if (!hockey && (p.containing || p.keeperRushing) && !preview) {
      c.strokeStyle = p.keeperRushing ? "#f5c76a" : "#9de5d7";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 2, 29, Math.PI * 0.12, Math.PI * 0.88);
      c.stroke();
    }
    const sliding = !hockey && p.slideTimer > 0;
    if (sliding) {
      const direction = p.slideDir || { x: p.fx, y: p.fy };
      c.save();
      c.rotate(Math.atan2(direction.y, direction.x));
      c.fillStyle = "#00121a38";
      c.beginPath();
      c.ellipse(0, 4, 31, 11, 0, 0, TAU);
      c.fill();
      c.strokeStyle = p.side ? primary : "#eee8d9";
      c.lineWidth = 8;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(0, -4);
      c.lineTo(23, -8);
      c.moveTo(0, 5);
      c.lineTo(12, 13);
      c.lineTo(26, 12);
      c.stroke();
      c.fillStyle = "#14261f";
      c.fillRect(22, -12, 8, 6);
      c.fillRect(24, 9, 8, 6);
      c.fillStyle = jersey;
      c.strokeStyle = p.side ? primary : "#081622";
      c.lineWidth = 2;
      this.round(c, -21, -11, 25, 23, 6);
      c.fill();
      c.stroke();
      c.fillStyle = trim;
      c.fillRect(-18, -10, 4, 21);
      c.fillStyle = "#c79b78";
      c.beginPath();
      c.arc(-26, 0, 7, 0, TAU);
      c.fill();
      if (p.sliding) {
        c.strokeStyle = "#d3ddaf70";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-37, -7);
        c.lineTo(-49, -9);
        c.moveTo(-38, 7);
        c.lineTo(-53, 11);
        c.stroke();
      }
      c.restore();
    } else {
      if (hockey) {
        c.strokeStyle = "#172b39";
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(-7, 13);
        c.lineTo(-11 - run, 21);
        c.moveTo(7, 13);
        c.lineTo(11 + run, 21);
        c.stroke();
        c.strokeStyle = "#2e2a22";
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(12, 0);
        c.lineTo(22 + p.fx * 12, 23 + p.fy * 10);
        c.lineTo(32 + p.fx * 12, 21 + p.fy * 10);
        c.stroke();
      } else {
        c.fillStyle = p.side ? primary : "#eee8d9";
        c.fillRect(-10, -2, 8, 18 + run);
        c.fillRect(2, -2, 8, 18 - run);
        c.fillStyle = "#14261f";
        c.fillRect(-11, 14 + run, 9, 5);
        c.fillRect(2, 14 - run, 9, 5);
      }
      c.fillStyle = p.keeper ? (hockey ? jersey : "#e4ab56") : jersey;
      c.strokeStyle = p.side ? primary : "#081622";
      c.lineWidth = 2;
      this.round(c, -14, -12, 28, 28, hockey ? 7 : 5);
      c.fill();
      c.stroke();
      c.fillStyle = trim;
      c.fillRect(-13, 5, 26, hockey ? 5 : 3);
      if (hockey && p.keeper) {
        c.fillStyle = "#f1f2e6";
        c.fillRect(-16, 9, 12, 17);
        c.fillRect(4, 9, 12, 17);
      }
      c.fillStyle = hockey ? (p.side ? "#f6f3e7" : primary) : "#c79b78";
      c.strokeStyle = "#192b30";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, -15, hockey ? 9 : 7, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = p.side ? primary : "#ffffff";
      c.font = "bold 12px system-ui";
      c.textAlign = "center";
      c.save();
      if (this.rotated) c.rotate(-Math.PI / 2);
      c.fillText(String(p.number), 0, 3);
      c.restore();
    }
    if (selected && !preview) {
      if (this.rotated) c.rotate(-Math.PI / 2);
      c.textAlign = "center";
      const surname = p.name.split(" ").slice(-1)[0];
      c.font = "bold 16px system-ui";
      const width = c.measureText(surname).width + 16;
      c.fillStyle = hockey ? "#082334e8" : "#0a281fe8";
      this.round(c, -width / 2, 31, width, 24, 5);
      c.fill();
      c.fillStyle = "#f1f8ed";
      c.fillText(surname, 0, 49);
    }
    c.restore();
  }
  round(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }
}
