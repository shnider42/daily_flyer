import { SoftCamera, easeValue } from "./camera.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// This adapter keeps camera coordinates in pitch/rink space. Only projection
// rotates, so the existing directional input and simulation stay unchanged.
export class SportsCamera {
  constructor() {
    this.follow = new SoftCamera();
    this.width = 0;
    this.height = 0;
    this.scale = 0;
    this.center = { x: 0, y: 0 };
  }
  resize(width, height, rules) {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.rules = rules;
    this.rotated = width / Math.max(1, height) > 1.25;
    this.scale = 0;
    this.follow.reset();
  }
  update({ game, state = game, settings = {}, dt = 1 / 60, preview = false,
    reduced = false, replay = false }) {
    const r = this.rules;
    const across = this.rotated ? this.height : this.width;
    const along = this.rotated ? this.width : this.height;
    this.fullScale = Math.max(0.01, Math.min(
      (across - 30) / (r.width + 80),
      (along - 30) / (r.height + 110),
    ));
    const mode = preview ? "full" : settings.mode || "full";
    const zoom = clamp(Number(settings.zoom) || 1, 1, 2.2);
    const targetScale = mode === "fit"
      ? Math.max(this.fullScale, (across - 24) / (r.width + 44))
      : this.fullScale * (mode === "follow" ? zoom : 1);
    const cut = this.game !== game || this.replay !== replay;
    if (cut) this.follow.reset();
    this.game = game;
    this.replay = replay;
    this.scale = !this.scale || cut || reduced
      ? targetScale
      : easeValue(this.scale, targetScale, dt, 0.22);
    this.viewWidth = across / this.scale;
    this.viewHeight = along / this.scale;
    const ball = state.ball || { x: r.width / 2, y: r.height / 2 };
    const selected = state.players?.[state.controlled];
    let target = { x: ball.x, y: ball.y };
    if (settings.focus === "player" && selected) {
      target = { x: selected.x, y: selected.y };
    } else if (settings.focus !== "ball" && selected) {
      // Keep the play near the ball while allowing a little space toward the
      // controlled defender. A distant selected player cannot drag play away.
      target.x += clamp(selected.x - ball.x, -this.viewWidth * 0.35, this.viewWidth * 0.35) * 0.24;
      target.y += clamp(selected.y - ball.y, -this.viewHeight * 0.35, this.viewHeight * 0.35) * 0.24;
    }
    if (mode === "full") {
      this.center = { x: r.width / 2, y: r.height / 2 };
      this.follow.reset();
    } else {
      if (mode === "fit") target.x = r.width / 2;
      const center = this.follow.update({
        x: target.x + 22,
        y: target.y + 36,
        dt,
        viewWidth: this.viewWidth,
        viewHeight: this.viewHeight,
        worldWidth: r.width + 44,
        worldHeight: r.height + 72,
        steady: reduced,
      });
      this.center = { x: center.x - 22, y: center.y - 36 };
    }
    this.zoomed = this.viewWidth < r.width - 4 || this.viewHeight < r.height - 4;
    this.x = this.rotated
      ? this.width / 2 + this.center.y * this.scale
      : this.width / 2 - this.center.x * this.scale;
    this.y = this.rotated
      ? this.height / 2 - this.center.x * this.scale
      : this.height / 2 - this.center.y * this.scale;
    return this;
  }
  project(point) {
    return this.rotated
      ? { x: this.x - point.y * this.scale, y: this.y + point.x * this.scale }
      : { x: this.x + point.x * this.scale, y: this.y + point.y * this.scale };
  }
  edge(point) {
    const p = this.project(point),
      w = this.width,
      h = this.height;
    if (p.x >= 14 && p.x <= w - 14 && p.y >= 24 && p.y <= h - 24) return null;
    const dx = p.x - w / 2,
      dy = p.y - h / 2,
      t = Math.min(
        Math.max(1, w / 2 - 28) / Math.max(0.01, Math.abs(dx)),
        Math.max(1, h / 2 - 42) / Math.max(0.01, Math.abs(dy)),
      );
    return { x: w / 2 + dx * t, y: h / 2 + dy * t, angle: Math.atan2(dy, dx) };
  }
}
