/** Procedural ballpark audio. A gesture creates the graph; gameplay owns no audio state. */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
export class BallparkAudio {
  constructor(enabled = true) {
    this.enabled = !!enabled; this.context = null; this.master = null;
    this.effects = null; this.crowdBus = null; this.music = null;
    this.noiseBuffers = new Map(); this.sources = new Set(); this.cooldowns = new Map();
    this.ambient = null; this.active = false; this.paused = false;
    this.lastStep = -Infinity; this.lastTime = 0;
    this.lastAmbientUpdate = -Infinity; this.lastAmbientPhase = null;
  }
  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = this.context = new AudioContext();
        this.master = ctx.createGain(); this.master.gain.value = .56;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 14;
        limiter.ratio.value = 5; limiter.attack.value = .003; limiter.release.value = .19;
        this.master.connect(limiter); limiter.connect(ctx.destination);
        this.effects = ctx.createGain(); this.effects.gain.value = .9; this.effects.connect(this.master);
        this.crowdBus = ctx.createGain(); this.crowdBus.gain.value = .7; this.crowdBus.connect(this.master);
        this.music = ctx.createGain(); this.music.gain.value = .6; this.music.connect(this.master);
        this._noiseBuffer('white'); this._noiseBuffer('pink');
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio availability must never interrupt play. */ }
  }
  get ready() { return this.enabled && this.context?.state === 'running' && !this.paused; }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? .56 : 0, this.context.currentTime, .04);
    if (!enabled) this._stopSources(); else this.unlock();
  }
  _noiseBuffer(kind = 'white') {
    if (this.noiseBuffers.has(kind)) return this.noiseBuffers.get(kind);
    const ctx = this.context, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 3), ctx.sampleRate), data = buffer.getChannelData(0);
    let smooth = 0, seed = kind === 'pink' ? 7919 : 2003;
    for (let i = 0; i < data.length; i++) {
      // Presentation randomness never consumes the simulation's seeded RNG.
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      smooth = .975 * smooth + .025 * white;
      data[i] = kind === 'pink' ? clamp(smooth * 5, -1, 1) : white;
    }
    this.noiseBuffers.set(kind, buffer); return buffer;
  }
  _track(source, nodes = []) {
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source); for (const node of [source, ...nodes]) { try { node.disconnect(); } catch {} } };
    return source;
  }
  _connect(node, bus = 'effects', pan = 0) {
    const target = this[bus] || this.master;
    if (pan && this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner(); panner.pan.value = clamp(pan, -1, 1);
      node.connect(panner); panner.connect(target); return panner;
    }
    node.connect(target); return null;
  }
  _allow(key, interval) {
    if (!this.ready) return false;
    const now = this.context.currentTime;
    if (now - (this.cooldowns.get(key) ?? -Infinity) < interval) return false;
    this.cooldowns.set(key, now); return true;
  }
  tone(frequency, duration = .12, volume = .1, type = 'sine', delay = 0, endFrequency = frequency, bus = 'effects') {
    if (!this.ready) return;
    const ctx = this.context, t = ctx.currentTime + Math.max(0, delay), d = Math.max(.015, duration);
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(Math.max(20, frequency), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + d);
    gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(clamp(volume, .0001, .8), t + Math.min(.006, d / 3));
    gain.gain.exponentialRampToValueAtTime(.0001, t + d);
    osc.connect(gain); gain.connect(this[bus] || this.effects); this._track(osc, [gain]);
    osc.start(t); osc.stop(t + d + .02);
  }
  noise(duration, volume, { frequency = 1500, type = 'bandpass', delay = 0, attack = .003, endFrequency = frequency, pan = 0, bus = 'effects', color = 'white' } = {}) {
    if (!this.ready) return;
    const ctx = this.context, t = ctx.currentTime + Math.max(0, delay), d = Math.max(.018, duration);
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this._noiseBuffer(color); source.loop = true;
    filter.type = type; filter.frequency.setValueAtTime(Math.max(30, frequency), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), t + d); filter.Q.value = .65;
    gain.gain.setValueAtTime(.0001, t); gain.gain.linearRampToValueAtTime(clamp(volume, .0001, .8), t + Math.min(attack, d * .5));
    gain.gain.exponentialRampToValueAtTime(.0001, t + d);
    source.connect(filter); filter.connect(gain); const panner = this._connect(gain, bus, pan);
    this._track(source, [filter, gain, ...(panner ? [panner] : [])]);
    source.start(t, (ctx.currentTime * .371) % 2); source.stop(t + d + .025);
  }
  bat(quality = .6) {
    const q = clamp(quality, 0, 1);
    this.noise(.028, .22 + q * .16, { frequency: 2200 + q * 2100, type: 'highpass' });
    this.noise(.09, .13 + q * .08, { frequency: 1750, endFrequency: 700 });
    this.tone(480 + q * 160, .085, .12, 'triangle', 0, 290);
    this.tone(1140 + q * 340, .055, .045, 'sine', .003, 930);
    this.tone(175 + q * 70, .14, .11, 'sine', 0, 72);
    this.noise(.19, .032, { frequency: 1100, delay: .065, color: 'pink' });
  }
  glove(hard = true) {
    if (!this._allow('glove', .07)) return;
    this.noise(.035, hard ? .25 : .14, { frequency: 1700, type: 'lowpass' });
    this.tone(hard ? 155 : 115, .09, hard ? .15 : .085, 'sine', 0, 58);
    this.noise(.12, .055, { frequency: 650, color: 'pink', delay: .018 });
  }
  whoosh(power = false) { if (this._allow('whoosh', .1)) this.noise(power ? .19 : .135, power ? .12 : .075, { frequency: 1150, endFrequency: 3300, attack: .035 }); }
  footstep(hard = false, pan = 0) {
    this.noise(.045, hard ? .06 : .035, { frequency: 750, type: 'lowpass', pan });
    this.noise(.08, hard ? .032 : .018, { frequency: 2300, delay: .013, pan });
  }
  slide() {
    if (!this._allow('slide', .5)) return;
    this.noise(.38, .10, { frequency: 2100, endFrequency: 550, attack: .025 });
    this.tone(90, .09, .045, 'sine', .18, 42);
  }
  crowd(big = false) {
    if (!this._allow(big ? 'crowd-big' : 'crowd-small', big ? .9 : 1.7)) return;
    const duration = big ? 3 : 1.25, gain = big ? .13 : .047;
    this.noise(duration, gain, { frequency: 950, endFrequency: 650, attack: big ? .35 : .17, color: 'pink', bus: 'crowdBus', pan: -.28 });
    this.noise(duration * .8, gain * .6, { frequency: 1800, endFrequency: 1150, delay: .08, attack: .25, color: 'pink', bus: 'crowdBus', pan: .35 });
    if (big) {
      for (let i = 0; i < 5; i++) this.noise(.045, .018, { frequency: 3200, delay: .3 + i * .19, bus: 'crowdBus', pan: i % 2 ? -.6 : .6 });
      this.tone(1370, .42, .006, 'sine', .6, 1600, 'crowdBus');
      this.tone(1850, .35, .004, 'sine', 1.03, 1550, 'crowdBus');
    }
  }
  organ() {
    if (!this._allow('organ', 4.5)) return;
    const phrases = [[261.63, 329.63, 392, 523.25, 440, 523.25], [392, 329.63, 349.23, 392, 523.25]];
    const notes = phrases[Math.floor(this.context.currentTime / 8) % phrases.length];
    notes.forEach((n, i) => { this.tone(n, .23, .055, 'triangle', i * .15, n, 'music'); this.tone(n * 2, .20, .012, 'sine', i * .15, n * 2, 'music'); this.tone(n / 2, .22, .018, 'sine', i * .15, n / 2, 'music'); });
  }
  whistle() {
    if (!this._allow('whistle', .8)) return;
    this.tone(2300, .16, .027, 'sine', 0, 2200); this.tone(2350, .24, .022, 'sine', .20, 2180);
    this.noise(.38, .016, { frequency: 3500, attack: .02 });
  }
  _ambient() {
    if (!this.ready || this.ambient) return;
    const ctx = this.context, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this._noiseBuffer('pink'); source.loop = true;
    filter.type = 'bandpass'; filter.frequency.value = 740; filter.Q.value = .5; gain.gain.value = .0001;
    source.connect(filter); filter.connect(gain); gain.connect(this.crowdBus);
    this._track(source, [filter, gain]); source.start(); this.ambient = { source, filter, gain };
    this.lastAmbientUpdate = -Infinity; this.lastAmbientPhase = null;
  }
  event(event, state = null) {
    if (!event || !this.ready) return;
    const type = event.type;
    if (type === 'contact') {
      if(event.bunt){this.noise(.03,.065,{frequency:1350,type:'lowpass'});this.tone(340,.065,.055,'triangle',0,180);}
      else this.bat(event.quality ?? .6);
    }
    else if (type === 'swing' && !event.bunt) this.whoosh(event.power);
    else if (type === 'pitch' && this._allow('pitch', .25)) this.noise(.15, .016, { frequency: 1100, endFrequency: 2400, attack: .04 });
    else if (type === 'hit-by-pitch') {
      this.noise(.09, .15, { frequency: 480, type: 'lowpass' }); this.tone(88, .11, .075, 'sine', 0, 43); this.crowd(false);
    } else if (type === 'catch' || type === 'fielded') this.glove(type === 'catch');
    else if (type === 'throw') this.noise(.11, .05, { frequency: 850, endFrequency: 2500, attack: .025 });
    else if (type === 'bounce' && this._allow('bounce', .08)) {
      const speed = state ? Math.hypot(state.ball?.vx || 0, state.ball?.vz || 0) : 15;
      this.noise(.045, clamp(speed / 400, .01, .07), { frequency: 800, type: 'lowpass' });
    } else if (type === 'wall' && this._allow('wall', .2)) {
      this.tone(95, .22, .13, 'triangle', 0, 45); this.noise(.16, .12, { frequency: 800, type: 'lowpass' }); this.crowd(false);
    } else if (type === 'run' || type === 'hit' && event.homeRun) this.crowd(true);
    else if (type === 'safe') this.slide();
    else if (type === 'out') { if (!['catch', 'strikeout'].includes(event.kind)) this.glove(false); if (event.outs >= 3) this.crowd(false); }
    else if (type === 'result' && ['strike', 'ball', 'strikeout', 'walk'].includes(event.kind) && !state?.pitch?.deadBall) this.glove();
    else if (type === 'pitching-change') { this.footstep(); this.crowd(false); }
    else if (type === 'mound-warning' || type === 'mound-offer') this.crowd(false);
    else if (type === 'mound-charge') { this.crowd(true); this.noise(.25, .045, { frequency: 1700, endFrequency: 650 }); }
    else if (type === 'fight-action') {
      if (event.action === 'jab') this.whoosh();
      else if (event.action === 'dodge') this.noise(.16, .055, { frequency: 2000, endFrequency: 900, attack: .03 });
      else this.noise(.075, .022, { frequency: 1200 });
    } else if (type === 'fight-hit' && !event.dodged) {
      this.noise(.065, event.blocked ? .065 : .12, { frequency: event.blocked ? 950 : 400, type: 'lowpass' });
      this.tone(event.blocked ? 155 : 90, .10, event.blocked ? .045 : .075, 'sine', 0, 48);
    } else if (type === 'fight-end') { this.whistle(); this.crowd(false); }
    else if (type === 'final') { this.organ(); this.crowd(true); }
    else if (type === 'half') this.organ();
  }
  update(state, { active = true, paused = false } = {}) {
    const stopped = (!active || paused) && this.active && !this.paused;
    this.active = !!active; this.paused = !!paused;
    if (!this.context) return;
    if (stopped) this._stopSources();
    const time = state?.time || 0;
    if (time < this.lastTime - .5) { this.lastStep = -Infinity; this.cooldowns.clear(); }
    this.lastTime = time;
    if (!active || paused || !this.enabled) {
      if (this.ambient) { try { this.ambient.source.stop(); } catch {} this.ambient = null; }
      return;
    }
    this._ambient();
    const audioTime = this.context.currentTime;
    // The crowd envelope changes slowly. Send automation at 10 Hz instead of
    // rescheduling it on every display frame; play-state changes still react now.
    if (this.ambient && (state?.phase !== this.lastAmbientPhase || audioTime - this.lastAmbientUpdate >= .1 - 1e-6 || audioTime < this.lastAmbientUpdate)) {
      const drama = state?.phase === 'brawl' ? .022 : state?.phase === 'live' ? .012 : .007;
      const gain = this.ambient.gain.gain;
      gain.cancelAndHoldAtTime?.(audioTime);
      gain.setTargetAtTime(drama * (.9 + Math.sin(time * .19) * .1), audioTime, .3);
      this.lastAmbientUpdate = audioTime; this.lastAmbientPhase = state?.phase;
    }
    const charging = state?.phase === 'brawl' && state.brawl?.stage === 'charge';
    const running = state?.phase === 'live' && state.runners?.some(r => !r.out && !r.scored && r.targetBase > (r.pathPosition ?? r.fromBase));
    if ((charging || running) && time - this.lastStep > (charging ? .17 : .26)) { this.lastStep = time; this.footstep(charging, Math.sin(time * 13) * .12); }
  }
  _stopSources() {
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear(); this.ambient = null;
  }
  reset() { this._stopSources(); this.cooldowns.clear(); this.lastStep = -Infinity; this.lastTime = 0; this.paused = false; }
  suspend() { this._stopSources(); if (this.context?.state === 'running') this.context.suspend().catch(() => {}); }
}
