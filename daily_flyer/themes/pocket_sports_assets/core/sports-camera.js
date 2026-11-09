import { SoftCamera, easeValue, clampCameraCenter } from "./camera.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Landscape controls can extend into the playing-area rectangle at custom
// sizes. Place the map against their measured bounds, preferring its bottom
// edge before trying a higher row; leave the game and control layout untouched.
export function placeSportsMinimap(stage, size, controls, gap = 8) {
  const right = stage.left + stage.width, bottom = stage.top + stage.height;
  const minX = stage.left + 8, maxX = Math.max(minX, right - 8 - size.width);
  const minY = stage.top + 8, maxY = Math.max(minY, bottom - 10 - size.height);
  const obstacles = controls.filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ left: r.left, right: r.left + r.width,
      top: r.top, bottom: r.top + r.height }));
  const xs = [maxX, minX, ...obstacles.map((r) => r.left - gap - size.width)]
    .filter((x) => x >= minX && x <= maxX).sort((a, b) => b - a);
  const ys = [maxY, minY, ...obstacles.map((r) => r.top - gap - size.height)]
    .filter((y) => y >= minY && y <= maxY).sort((a, b) => b - a);
  let fallback = { x: maxX, y: minY, overlap: Infinity };
  for (const y of ys) for (const x of xs) {
    const overlap = obstacles.reduce((sum, r) => sum +
      Math.max(0, Math.min(x + size.width, r.right + gap) - Math.max(x, r.left - gap)) *
      Math.max(0, Math.min(y + size.height, r.bottom + gap) - Math.max(y, r.top - gap)), 0);
    if (overlap < fallback.overlap) fallback = { x, y, overlap };
    if (overlap === 0) return { right: right - x - size.width, bottom: bottom - y - size.height };
  }
  return { right: right - fallback.x - size.width, bottom: bottom - fallback.y - size.height };
}

// This adapter keeps camera coordinates in pitch/rink space. Only projection
// rotates, so the existing directional input and simulation stay unchanged.
export class SportsCamera {
  constructor() {
    this.follow = new SoftCamera();
    this.width = 0;
    this.height = 0;
    this.scale = 0;
    this.center = { x: 0, y: 0 };
    this.manualCenters = { live: null, replay: null };
  }
  resize(width, height, rules) {
    if (this.rules && this.rules !== rules) this.clearManualViews();
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
    this.mode = mode;
    const zoom = clamp(Number(settings.zoom) || 1, 1, 2.2);
    const targetScale = mode === "fit"
      ? Math.max(this.fullScale, (across - 24) / (r.width + 44))
      : this.fullScale * (mode === "follow" ? zoom : 1);
    const newMatch = this.game !== game;
    const cut = newMatch || this.replay !== replay;
    if (newMatch) this.clearManualViews();
    else if (replay && !this.replay) this.manualCenters.replay = null;
    if (cut) this.follow.reset();
    this.game = game;
    this.replay = replay;
    this.scale = !this.scale || cut || reduced
      ? targetScale
      : easeValue(this.scale, targetScale, dt, 0.22);
    this.viewWidth = across / this.scale;
    this.viewHeight = along / this.scale;
    const ball = state.ball || { x: r.width / 2, y: r.height / 2 };
    const candidate = state.players?.[state.controlled];
    const selected = candidate?.offIce ? null : candidate;
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
    } else if (this.manualCenter) {
      // A minimap gesture owns the view until Follow play is chosen. Keep the
      // requested world position across layout changes; clamp only its visible
      // framing so turning the phone cannot move the view beyond the field.
      this.center = this.clampCenter(this.manualCenter);
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
  get manualCenter() {
    return this.manualCenters[this.replay ? "replay" : "live"];
  }
  get manual() {
    return this.mode !== "full" && !!this.manualCenter;
  }
  clampCenter(point) {
    return {
      x: clampCameraCenter(point.x + 22, this.viewWidth, this.rules.width + 44) - 22,
      y: clampCameraCenter(point.y + 36, this.viewHeight, this.rules.height + 72) - 36,
    };
  }
  setManualCenter(point) {
    if (!this.game || this.mode === "full" || !this.zoomed ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const center = this.clampCenter(point);
    this.manualCenters[this.replay ? "replay" : "live"] = center;
    this.center = { ...center };
    return true;
  }
  followPlay() {
    this.manualCenters[this.replay ? "replay" : "live"] = null;
    // Begin following from the current view rather than teleporting on release.
    if (this.rules && this.viewWidth && this.viewHeight) {
      this.follow.update({
        x: this.center.x + 22, y: this.center.y + 36,
        viewWidth: this.viewWidth, viewHeight: this.viewHeight,
        worldWidth: this.rules.width + 44, worldHeight: this.rules.height + 72,
        snap: true,
      });
    }
  }
  clearManualViews() {
    this.manualCenters = { live: null, replay: null };
  }
  minimapLayout(width, height) {
    const r = this.rules;
    const scale = Math.max(0.001, Math.min(
      (width - 12) / (this.rotated ? r.height : r.width),
      (height - 12) / (this.rotated ? r.width : r.height),
    ));
    const pitchWidth = (this.rotated ? r.height : r.width) * scale;
    const pitchHeight = (this.rotated ? r.width : r.height) * scale;
    return { width, height, scale, pitchWidth, pitchHeight,
      x: (width - pitchWidth) / 2, y: (height - pitchHeight) / 2 };
  }
  minimapProject(point, layout) {
    return this.rotated
      ? { x: layout.x + (this.rules.height - point.y) * layout.scale,
        y: layout.y + point.x * layout.scale }
      : { x: layout.x + point.x * layout.scale, y: layout.y + point.y * layout.scale };
  }
  minimapUnproject(point, layout) {
    const across = (point.x - layout.x) / layout.scale;
    const down = (point.y - layout.y) / layout.scale;
    return this.rotated
      ? { x: clamp(down, 0, this.rules.width), y: clamp(this.rules.height - across, 0, this.rules.height) }
      : { x: clamp(across, 0, this.rules.width), y: clamp(down, 0, this.rules.height) };
  }
  minimapViewRect(layout) {
    const a = this.minimapProject({ x: this.center.x - this.viewWidth / 2,
      y: this.center.y - this.viewHeight / 2 }, layout);
    const b = this.minimapProject({ x: this.center.x + this.viewWidth / 2,
      y: this.center.y + this.viewHeight / 2 }, layout);
    return { x: Math.min(a.x, b.x) / layout.width,
      y: Math.min(a.y, b.y) / layout.height,
      width: Math.abs(b.x - a.x) / layout.width,
      height: Math.abs(b.y - a.y) / layout.height };
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
