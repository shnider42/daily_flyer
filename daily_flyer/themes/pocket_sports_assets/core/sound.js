import { playbackSession, bindAudioActivation } from "./device-audio.js";
export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.last = 0;
    bindAudioActivation(() => this.unlock(), { enabled: () => settings.sound });
  }
  unlock() {
    if (!this.settings.sound) return;
    try {
      playbackSession();
      if (!this.ctx)
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    } catch {}
  }
  tone(f, d = 0.08, type = "sine", volume = 0.08, slide = f) {
    if (!this.settings.sound || !this.ctx || this.ctx.state !== "running")
      return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(20, slide),
      c.currentTime + d,
    );
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + d + 0.01);
  }
  event(type, sport) {
    if (type === "goal") {
      [0, 0.15, 0.3].forEach((t, i) =>
        setTimeout(
          () =>
            this.tone(
              sport === "hockey" ? 220 + i * 55 : 440 + i * 110,
              0.45,
              "triangle",
              0.1,
            ),
          t * 1000,
        ),
      );
      return;
    }
    if (type === "shot") this.tone(130, 0.1, "triangle", 0.08, 60);
    if (type === "pass") this.tone(240, 0.04, "triangle", 0.035, 90);
    if (type === "tackle") this.tone(70, 0.14, "sawtooth", 0.05, 25);
    if (type === "save") this.tone(160, 0.14, "triangle", 0.08, 60);
    if (type === "restart" || type === "break" || type === "finished")
      this.tone(1700, 0.2, "sine", 0.035, 1400);
    if (type === "board" && performance.now() - this.last > 120) {
      this.last = performance.now();
      this.tone(330, 0.04, "triangle", 0.035, 120);
    }
  }
}
