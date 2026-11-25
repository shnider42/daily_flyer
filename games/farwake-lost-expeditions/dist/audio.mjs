/* Nightglass: restrained, local-only sound. A user gesture must call start(). */

const clamp = (value, fallback = 0.65) => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(1, Number(value))) : fallback;

const INTERIOR = {
  airlock: { hum: 0.09, air: 0.025, cutoff: 570, pitch: 58 },
  junction: { hum: 0.07, air: 0.019, cutoff: 740, pitch: 57.8 },
  survey: { hum: 0.065, air: 0.024, cutoff: 940, pitch: 58.3 },
  service: { hum: 0.095, air: 0.017, cutoff: 640, pitch: 59 },
  shaft: { hum: 0.045, air: 0.016, cutoff: 420, pitch: 56.8 },
  lower: { hum: 0.035, air: 0.014, cutoff: 330, pitch: 56.4 },
};

/**
 * No samples, speech services, tracking, or network requests. The repeating
 * three-note receiver packet is deliberately synthetic; captions carry the
 * recorded words. Unease never silently becomes combat music.
 */
export class NightglassAudio {
  constructor({ volume = 0.65, enabled = true } = {}) {
    this.enabled = Boolean(enabled);
    this.volume = clamp(volume);
    this.scene = 'approach';
    this.state = {};
    this.context = null;
    this._started = false;
    this._paused = false;
    this._disposed = false;
    this._visibilityPaused = Boolean(globalThis.document?.hidden);
    this._timer = null;
    this._suspendTimer = null;
    this._startPromise = null;
    this._continuous = [];
    this._transient = new Set();
    this._lastCue = new Map();
    this._tickCount = 0;
    this._nextPacket = 0;
    this._nextMechanical = 0;
    this._onVisibility = () => {
      this._visibilityPaused = Boolean(globalThis.document?.hidden);
      void this._syncTransport();
    };
  }

  /** Call from the Start, Resume, or sound-toggle click/tap handler. */
  async start() {
    if (this._disposed) return false;
    this._started = true;
    this._paused = false;
    if (!this.enabled) return false;
    if (this._startPromise) return this._startPromise;
    this._startPromise = this._start();
    try { return await this._startPromise; }
    finally { this._startPromise = null; }
  }

  async _start() {
    try {
      this._visibilityPaused = Boolean(globalThis.document?.hidden);
      if (!this.context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context({ latencyHint: 'interactive' });
        this._buildGraph();
        globalThis.document?.addEventListener('visibilitychange', this._onVisibility);
      }
      return await this._syncTransport();
    } catch {
      // Unsupported/rejected audio must never prevent playing the expedition.
      if (this.context && !this._master) {
        try { await this.context.close(); } catch { /* already closed */ }
        this.context = null;
      }
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this._disposed) return;
    if (this.enabled && this._started && !this.context && !this._paused) {
      void this.start();
    } else {
      void this._syncTransport();
    }
  }

  setVolume(volume) {
    this.volume = clamp(volume, this.volume);
    this._updateMaster();
  }

  /** Matches the state module's receiverMode and flags.inspectionPowered. */
  setScene(sceneId, state = {}) {
    this.scene = typeof sceneId === 'string' ? sceneId : 'approach';
    this.state = state && typeof state === 'object' ? state : {};
    this._applyScene();
  }

  pause() {
    this._paused = true;
    void this._syncTransport();
  }

  async resume() {
    if (this._disposed || !this._started) return false;
    this._paused = false;
    if (!this.context && this.enabled) return this.start();
    return this._syncTransport();
  }

  _canPlay() {
    return this._started && this.enabled && !this._paused &&
      !this._visibilityPaused && !this._disposed;
  }

  async _syncTransport() {
    const ctx = this.context;
    if (!ctx || this._disposed) return false;
    clearTimeout(this._suspendTimer);
    this._suspendTimer = null;
    if (!this._canPlay()) {
      clearInterval(this._timer);
      this._timer = null;
      this._updateMaster();
      // A short fade avoids an abrupt discontinuity when muting or opening a menu.
      this._suspendTimer = setTimeout(() => {
        if (!this._canPlay() && ctx.state !== 'closed') {
          void ctx.suspend().catch(() => {});
        }
      }, 90);
      return false;
    }
    try {
      if (ctx.state !== 'running') await ctx.resume();
      if (!this._canPlay() || ctx.state !== 'running') return false;
      this._applyScene();
      this._updateMaster();
      if (!this._timer) {
        this._nextPacket = ctx.currentTime + 3.2;
        this._nextMechanical = ctx.currentTime + 7.5;
        this._timer = setInterval(() => this._tick(), 500);
      }
      return true;
    } catch { return false; }
  }

  _buildGraph() {
    const ctx = this.context;
    this._master = ctx.createGain();
    this._master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -13;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.008;
    limiter.release.value = 0.2;
    this._master.connect(limiter);
    limiter.connect(ctx.destination);
    this._limiter = limiter;

    this._humGain = ctx.createGain();
    this._humGain.gain.value = 0;
    this._humGain.connect(this._master);
    this._hum = ctx.createOscillator();
    this._hum.type = 'sine';
    this._hum.frequency.value = 58;
    this._hum.connect(this._humGain);
    this._hum.start();

    this._lowGain = ctx.createGain();
    this._lowGain.gain.value = 0.035;
    this._lowGain.connect(this._master);
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 35.7;
    low.connect(this._lowGain);
    low.start();

    // Two seconds of seeded noise: tiny, repeatable, and inexpensive to loop.
    const length = Math.floor(ctx.sampleRate * 2);
    this._noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    let seed = 0x6e696768;
    for (let i = 0; i < length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 4294967295) * 2 - 1;
    }
    const seam = Math.floor(ctx.sampleRate * 0.02);
    for (let i = 0; i < seam; i++) {
      const blend = i / seam;
      data[length - seam + i] = data[length - seam + i] * (1 - blend) + data[i] * blend;
    }
    const air = ctx.createBufferSource();
    air.buffer = this._noiseBuffer;
    air.loop = true;
    this._airFilter = ctx.createBiquadFilter();
    this._airFilter.type = 'lowpass';
    this._airFilter.frequency.value = 500;
    this._airFilter.Q.value = 0.4;
    this._airGain = ctx.createGain();
    this._airGain.gain.value = 0;
    air.connect(this._airFilter);
    this._airFilter.connect(this._airGain);
    this._airGain.connect(this._master);
    air.start();
    this._continuous = [this._hum, low, air];
    this._applyScene();
  }

  _ramp(param, value, seconds = 0.3) {
    if (!this.context || this._disposed) return;
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  _updateMaster() {
    if (!this._master) return;
    // Low master ceiling; individual effects also use bounded envelopes.
    this._ramp(this._master.gain, this._canPlay() ? this.volume * 0.28 : 0, 0.07);
  }

  _applyScene() {
    if (!this.context || !this._humGain || this._disposed) return;
    const profile = INTERIOR[this.scene] || { hum: 0.04, air: 0.018, cutoff: 230, pitch: 54 };
    const lit = Boolean(this.state.flags?.inspectionPowered);
    this._ramp(this._humGain.gain, profile.hum + (lit ? 0.012 : 0), 0.7);
    this._ramp(this._airGain.gain, profile.air, 0.7);
    this._ramp(this._airFilter.frequency, profile.cutoff, 0.7);
    this._ramp(this._hum.frequency, profile.pitch, 0.7);
    this._ramp(this._lowGain.gain, this.scene === 'approach' || this.scene === 'beacon' ? 0.055 : 0.025, 0.7);
  }

  _tick() {
    if (!this._canPlay() || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    this._tickCount++;
    const nearReceiver = ['junction', 'survey', 'service', 'shaft', 'lower'].includes(this.scene);
    if (now >= this._nextPacket) {
      this._nextPacket = now + 9.6;
      if (nearReceiver && !this.state.receiverMode && !this.state.flags?.warningPublished) {
        const near = this.scene === 'service' || this.scene === 'shaft';
        this._packet(now + 0.04, near ? 0.075 : 0.033, -0.25);
      }
    }
    if (now >= this._nextMechanical) {
      this._nextMechanical = now + 13.5 + (this._tickCount % 3) * 1.1;
      if (INTERIOR[this.scene]) this._click(now, 0.022, 310 + (this._tickCount % 4) * 70);
    }
  }

  /** All cues are informational or restrained environmental responses. */
  cue(name) {
    if (!this._canPlay() || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    if (now - (this._lastCue.get(name) ?? -Infinity) < 0.14) return;
    this._lastCue.set(name, now);
    const t = now + 0.015;
    switch (name) {
      case 'step': case 'move': case 'door':
        this._click(t, 0.055, 220);
        this._click(t + 0.24, 0.032, 185);
        break;
      case 'inspect': case 'panel': case 'switch':
        this._click(t, 0.065, 850);
        this._tone(195, t + 0.03, 0.13, 0.045);
        break;
      case 'record': case 'pickup': case 'recover':
        this._click(t, 0.04, 1200);
        this._tone(392, t + 0.08, 0.22, 0.075);
        this._tone(493.88, t + 0.2, 0.3, 0.05);
        break;
      case 'power':
        this._tone(110, t, 0.7, 0.11);
        this._tone(220, t + 0.12, 0.45, 0.045);
        this._click(t + 0.48, 0.035, 700);
        break;
      case 'feedback': case 'receiver':
        this._packet(t, 0.09, -0.15);
        break;
      case 'diagnosis':
        this._tone(330, t, 0.25, 0.065);
        this._tone(440, t + 0.15, 0.3, 0.05);
        break;
      case 'mute':
        this._click(t, 0.07, 600);
        this._tone(165, t, 0.3, 0.06);
        break;
      case 'redirect':
        this._click(t, 0.05, 600);
        this._packet(t + 0.25, 0.055, 0.75);
        this._click(t + 0.95, 0.038, 190, 0.7);
        break;
      case 'reveal': case 'warning':
        this._tone(73.42, t, 1.4, 0.085);
        this._tone(77.8, t + 0.15, 1.1, 0.035);
        break;
      case 'transmit':
        this._packet(t, 0.085, 0);
        this._tone(523.25, t + 0.9, 0.5, 0.06);
        break;
      case 'complete':
        [293.66, 440, 369.99, 329.63].forEach((frequency, i) => {
          this._tone(frequency, t + i * 0.3, 1.3, 0.065);
        });
        break;
      default:
        break;
    }
  }

  _packet(time, gain, pan = 0) {
    // The same cadence each time gives players something recognizable to compare.
    this._tone(523.25, time, 0.12, gain, pan);
    this._tone(392, time + 0.24, 0.14, gain * 0.85, pan);
    this._tone(493.88, time + 0.51, 0.23, gain * 0.75, pan);
    this._click(time + 0.76, gain * 0.25, 1250, pan);
  }

  _tone(frequency, time, duration, gain, pan = 0) {
    if (!this.context || this._disposed || this._transient.size > 72) return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(Math.min(0.15, gain), time + Math.min(0.025, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    const nodes = [oscillator, envelope];
    this._connectEffect(envelope, pan, nodes);
    this._retain(oscillator, nodes);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  _click(time, gain, frequency, pan = 0) {
    if (!this.context || !this._noiseBuffer || this._disposed || this._transient.size > 72) return;
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(Math.min(0.1, gain), time + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    source.connect(filter);
    filter.connect(envelope);
    const nodes = [source, filter, envelope];
    this._connectEffect(envelope, pan, nodes);
    this._retain(source, nodes);
    source.start(time, 0.2);
    source.stop(time + 0.15);
  }

  _connectEffect(node, pan, nodes) {
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      panner.connect(this._master);
      nodes.push(panner);
    } else node.connect(this._master);
  }

  _retain(source, nodes) {
    for (const node of nodes) this._transient.add(node);
    source.onended = () => {
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* disposed */ }
        this._transient.delete(node);
      }
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    clearInterval(this._timer);
    clearTimeout(this._suspendTimer);
    this._timer = null;
    globalThis.document?.removeEventListener('visibilitychange', this._onVisibility);
    for (const node of [...this._continuous, ...this._transient]) {
      try { node.stop?.(); } catch { /* already ended */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this._transient.clear();
    this._continuous = [];
    for (const node of [this._master, this._limiter, this._humGain, this._lowGain, this._airGain, this._airFilter]) {
      try { node?.disconnect(); } catch { /* already disconnected */ }
    }
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null;
  }
}
