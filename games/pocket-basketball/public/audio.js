import { bindAudioActivation, playbackSession } from './vendor/device-audio.js';

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Original synthesized court sounds. No downloads, background timers or autoplay. */
export class HoopsAudio {
  constructor() {
    this.enabled = false;
    this.paused = false;
    this.ctx = null;
    this._lastGesture = -Infinity;
    this._sources = new Set();
    this._lastEvent = new Map();
    this._dribbleTimer = 0;
    this._ambientTimer = 2;
    this._squeakTimer = 0;
    const doc = globalThis.document;
    if (doc?.addEventListener) {
      // Capture before the shared activation handler. Visibility alone cannot create audio.
      const rememberGesture = (event) => {
        if (event.isTrusted !== false && !doc.hidden) this._lastGesture = clock();
      };
      for (const name of ['pointerdown', 'touchend', 'keydown'])
        doc.addEventListener(name, rememberGesture, { capture: true, passive: true });
      bindAudioActivation(() => this.unlock(), { enabled: () => this.enabled && !this.paused });
      doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) this._silence();
        else if (this.enabled && !this.paused && this.ctx) this.unlock();
      });
      globalThis.window?.addEventListener('pagehide', () => this._silence());
    }
  }

  setEnabled(value) {
    this.enabled = !!value;
    if (this.enabled) this.unlock();
    else this._silence();
  }

  unlock() {
    if (!this.enabled || this.paused || globalThis.document?.hidden) return false;
    if (!this.ctx) {
      const userGesture = globalThis.navigator?.userActivation?.isActive || clock() - this._lastGesture < 700;
      if (!userGesture) return false;
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return false;
      try {
        playbackSession();
        this.ctx = new Audio({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.38;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 16;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.18;
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
        this._noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const samples = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
        return false;
      }
    }
    playbackSession();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.38, this.ctx.currentTime, 0.025);
    // Always enqueue resume: a previous suspend may still be settling.
    this.ctx.resume?.().catch?.(() => {});
    return true;
  }

  _ready() {
    return this.enabled && !this.paused && !globalThis.document?.hidden && this.ctx?.state === 'running';
  }

  _track(source, nodes) {
    this._sources.add(source);
    source.onended = () => {
      this._sources.delete(source);
      for (const node of [source, ...nodes]) { try { node.disconnect(); } catch { /* Disconnected. */ } }
    };
  }

  _tone(frequency, duration, volume, type = 'sine', end = frequency, delay = 0) {
    if (!this._ready()) return;
    const time = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + Math.min(0.012, duration / 5));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    this._track(oscillator, [gain]);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.025);
  }

  _noise(duration, volume, frequency, type = 'bandpass', delay = 0, attack = 0.012) {
    if (!this._ready()) return;
    const time = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this._noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = type === 'bandpass' ? 0.7 : 0.3;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + Math.min(attack, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    this._track(source, [filter, gain]);
    source.start(time, Math.random() * Math.max(0, 1.8 - duration));
    source.stop(time + duration + 0.025);
  }

  event(event) {
    if (!this._ready()) return;
    const name = typeof event === 'string' ? event : event?.type || event?.name;
    const aliases = { made: 'net', score: 'net', basket: 'net', shot_made: 'net', shotMade: 'net',
      miss: 'rim', shot_missed: 'rim', shotMissed: 'rim', foul: 'whistle', violation: 'whistle',
      halftime: 'buzzer', final: 'buzzer', finished: 'buzzer', gameover: 'buzzer',
      freeThrowMiss: 'rim', turnover: 'steal', rebound: 'catch' };
    const kind = aliases[name] || name;
    const cooldowns = { dribble: 0.23, squeak: 0.27, net: 0.2, rim: 0.16,
      whistle: 0.4, buzzer: 0.8, crowd: 1.4, pass: 0.12, catch: 0.12, steal: 0.2, block: 0.2 };
    if (!(kind in cooldowns)) return;
    const time = this.ctx.currentTime;
    if (time - (this._lastEvent.get(kind) ?? -100) < cooldowns[kind]) return;
    this._lastEvent.set(kind, time);

    switch (kind) {
      case 'dribble':
        this._tone(105 + Math.random() * 18, 0.14, 0.19, 'sine', 48);
        this._noise(0.065, 0.07, 360, 'lowpass');
        break;
      case 'squeak':
        this._tone(740 + Math.random() * 280, 0.11, 0.035, 'sine', 1600);
        this._tone(1750, 0.075, 0.014, 'triangle', 1100, 0.025);
        break;
      case 'net':
        this._noise(0.21, 0.19, 2800, 'highpass');
        this._tone(210, 0.07, 0.07, 'sine', 120, 0.045);
        this.event('crowd');
        break;
      case 'rim':
        this._tone(720, 0.22, 0.13, 'triangle', 620);
        this._tone(1320, 0.10, 0.06, 'sine', 1150);
        this._noise(0.055, 0.05, 1700, 'bandpass');
        break;
      case 'whistle':
        this._tone(2340, 0.22, 0.09, 'sine', 2260);
        this._tone(2650, 0.19, 0.035, 'sine', 2500, 0.025);
        break;
      case 'buzzer':
        this._tone(168, 0.6, 0.10, 'sawtooth', 166);
        this._tone(232, 0.58, 0.055, 'triangle', 230);
        break;
      case 'crowd':
        this._noise(1.45, 0.19, 950, 'bandpass', 0, 0.24);
        this._noise(1.05, 0.07, 2100, 'bandpass', 0.1, 0.18);
        break;
      case 'pass':
        this._noise(0.085, 0.045, 1400, 'bandpass');
        break;
      case 'catch':
      case 'steal':
      case 'block':
        this._noise(0.07, kind === 'block' ? 0.13 : 0.07, 900, 'lowpass');
        this._tone(180, 0.075, 0.07, 'sine', 95);
        break;
    }
  }

  update(dt, game) {
    if (!this._ready()) return;
    const step = clamp(Number(dt) || 0, 0, 0.1);
    const phase = game?.phase ?? game?.state;
    const live = ['live', 'play', 'playing'].includes(phase);
    if (!live) { this._dribbleTimer = 0; return; }
    this._dribbleTimer -= step;
    this._squeakTimer -= step;
    this._ambientTimer -= step;
    // Do not fall through from an explicitly loose ball to Match.carrier(), a method.
    const ball = game?.ball;
    const owner = ball && 'owner' in ball ? ball.owner
      : ball?.holder ?? ball?.carrier ?? (typeof game?.carrier === 'function' ? null : game?.carrier);
    if (owner !== null && owner !== undefined && this._dribbleTimer <= 0) {
      this.event('dribble');
      this._dribbleTimer = 0.43 + Math.random() * 0.07;
    }
    if (this._squeakTimer <= 0) {
      this.event('squeak');
      this._squeakTimer = 1.7 + Math.random() * 2.8;
    }
    if (this._ambientTimer <= 0) {
      this._noise(1.7, 0.019, 600, 'lowpass', 0, 0.4);
      this._ambientTimer = 4.5 + Math.random() * 2;
    }
  }

  _silence() {
    this._dribbleTimer = 0;
    this._ambientTimer = 2;
    this._squeakTimer = 1;
    this._lastEvent.clear();
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    for (const source of this._sources) { try { source.stop(); } catch { /* Already ended. */ } }
    this._sources.clear();
    this.ctx.suspend?.().catch?.(() => {});
  }

  pause() { this.paused = true; this._silence(); }
  resume() { this.paused = false; if (this.enabled) this.unlock(); }
}
