/** Small, gesture-unlocked synthesized effects. No downloaded audio or music assets. */
export class AudioBus {
  constructor({ enabled = true, volume = .3 } = {}) { this.enabled = enabled; this.volume = volume; this.ctx = null; this.last = {}; this.ambient = null; }
  unlock() {
    try {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
        this.master.gain.value = this.enabled ? this.volume : 0;
        const size = this.ctx.sampleRate * 2, buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate), d = buffer.getChannelData(0);
        let previous = 0; for (let i = 0; i < size; i++) { previous = (previous + (Math.random() * 2 - 1) * .025) / 1.025; d[i] = previous * 3; }
        this.noiseBuffer = buffer;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  set(enabled, volume = this.volume) { this.enabled = enabled; this.volume = Math.max(0, Math.min(1, volume)); if (this.master) this.master.gain.setTargetAtTime(enabled ? this.volume : 0, this.ctx.currentTime, .06); }
  tone(frequency, end, duration, type = 'sine', level = .2, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(level, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + duration + .02); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  noise(duration = .1, frequency = 600, level = .18) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime, source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(level, t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(t); source.stop(t + duration + .01);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  play(type) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime; if (now - (this.last[type] ?? -10) < .09) return; this.last[type] = now;
    if (type === 'hit') { this.noise(.07, 650, .45); this.tone(100, 45, .08, 'triangle', .25); }
    else if (type === 'hurt') { this.noise(.16, 400, .5); this.tone(85, 34, .2, 'sine', .3); }
    else if (type === 'swing') { this.noise(.12, 1600, .36); this.tone(190, 70, .1, 'triangle', .07); }
    else if (type === 'arrow') { this.noise(.06, 2600, .2); this.tone(580, 210, .07, 'sine', .1); }
    else if (type === 'spell') { this.tone(280, 90, .24, 'sine', .18); this.noise(.13, 1800, .15); }
    else if (type === 'skill') { this.tone(110, 38, .38, 'triangle', .26); this.noise(.25, 1200, .4); }
    else if (type === 'dodge') this.noise(.2, 1200, .3);
    else if (type === 'loot') { this.tone(523, 523, .12, 'sine', .13); this.tone(784, 784, .22, 'sine', .1, .07); }
    else if (type === 'heal') { this.tone(260, 520, .4, 'sine', .12); this.tone(390, 780, .45, 'sine', .06, .06); }
    else if (type === 'level') { [261, 329, 392, 523].forEach((f, i) => this.tone(f, f, .45, 'sine', .1, i * .09)); }
    else if (type === 'boss') { this.tone(65, 55, 1.5, 'sine', .28); this.tone(98, 82, 1.3, 'triangle', .08, .1); }
    else if (type === 'click') this.tone(310, 230, .06, 'sine', .09);
  }
}
