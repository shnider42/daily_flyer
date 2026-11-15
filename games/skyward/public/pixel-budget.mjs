// Budget the drawing buffer in physical pixels without changing CSS geometry.
export function renderPixelRatio(width, height, ratioLimit, maxPixels = Infinity) {
  return Math.min(ratioLimit, Math.sqrt(maxPixels / (width * height)));
}

// Lowering resolution should be quick. Restoring it requires a sustained
// stretch of headroom, so a heavy pass or a display resize does not oscillate.
export class PixelBudget {
  constructor(levels) {
    this.levels = levels;
    this.reset();
  }

  get maxPixels() { return this.levels[this.level]; }

  clearSamples() {
    this.seconds = 0;
    this.frames = 0;
    this.fastWindows = 0;
  }

  reset() {
    this.level = this.levels.length - 1;
    this.clearSamples();
  }

  observe(dt, nativePixels) {
    if (!(dt > 0) || dt > .4) return false;
    this.seconds += dt;
    this.frames++;
    if (this.seconds < 1) return false;
    const fps = this.frames / this.seconds;
    this.seconds = this.frames = 0;
    const previous = this.level;
    if (fps < 38) {
      this.fastWindows = 0;
      // Skip tiers with an identical backing size on a smaller window.
      const effective = Math.min(nativePixels, this.maxPixels);
      if (this.levels[0] < effective) {
        while (this.level > 0 && this.levels[this.level] >= effective) this.level--;
        if (fps < 25 && this.level > 0) this.level--;
      }
    } else if (fps >= 53 && this.level < this.levels.length - 1) {
      if (++this.fastWindows >= 4) {
        this.fastWindows = 0;
        this.level++;
      }
    } else this.fastWindows = 0;
    return previous !== this.level;
  }
}
