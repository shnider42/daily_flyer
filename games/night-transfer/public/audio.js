import { synthFootstep, synthMurmur, synthTexture, synthEvent, synthRoomImpulse, spatialMix } from './audio-dsp.js';

// Optional, original procedural prison audio. No puzzle information is encoded in
// these sounds, and no AudioContext is created before an explicit user gesture.
const clamp = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
const MAX_VOICES = 12;
const MAX_SOURCES = 24;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const CUE_GAP = { key: .14, door: .4, mechanism: .35, success: .65, error: .3 };
const ROOMS = {
  holding: { hum: 52, level: .035, air: .016, cutoff: 650, echo: .15, wet: .26, feedback: .22, drip: .2, chatter: .24, interval: [8, 17], floor: 'stone' },
  washroom: { hum: 59, level: .015, air: .014, cutoff: 1100, echo: .19, wet: .4, feedback: .29, drip: .7, chatter: .08, interval: [5, 12], floor: 'tile' },
  records: { hum: 47, level: .018, air: .009, cutoff: 550, echo: .11, wet: .17, feedback: .15, drip: .05, chatter: .53, interval: [10, 21], floor: 'stone' },
  laundry: { hum: 72, level: .028, air: .026, cutoff: 420, echo: .16, wet: .28, feedback: .23, drip: .24, chatter: .16, interval: [7, 16], floor: 'tile' },
  watchroom: { hum: 55, level: .019, air: .008, cutoff: 900, echo: .1, wet: .16, feedback: .14, drip: .04, chatter: .55, interval: [11, 22], floor: 'stone' },
  dispatch: { hum: 49, level: .025, air: .013, cutoff: 600, echo: .17, wet: .3, feedback: .24, drip: .12, chatter: .3, interval: [8, 18], floor: 'stone' },
  boiler: { hum: 43, level: .048, air: .035, cutoff: 450, echo: .16, wet: .25, feedback: .21, drip: .15, chatter: .07, interval: [6, 14], floor: 'metal' },
  sluice: { hum: 60, level: .022, air: .036, cutoff: 1000, echo: .23, wet: .42, feedback: .3, drip: .74, chatter: .05, interval: [5, 13], floor: 'metal' },
  quay: { hum: 38, level: .005, air: .043, cutoff: 1600, echo: .08, wet: .07, feedback: .1, drip: .1, chatter: .14, interval: [9, 20], floor: 'stone' },
};
const CHARACTER = {
  holding: { space: 'cell', air: 'vent', detail: 'vent', event: 'settle', drip: [3.4, -3.2], pipe: [-3.8, 1.8], chatter: [0, -6.4] },
  washroom: { space: 'tile', air: 'vent', detail: 'water', event: 'water', drip: [3.3, -2.7], pipe: [3.8, 1.2], chatter: [0, 6.5] },
  records: { space: 'office', air: 'vent', detail: 'vent', event: 'settle', drip: [3.6, 3], pipe: [-3.8, -1.4], chatter: [-5.8, 2.3] },
  laundry: { space: 'tile', air: 'vent', detail: 'steam', event: 'hiss', drip: [3.5, -3.8], pipe: [-3.3, 2], chatter: [0, -6.4] },
  watchroom: { space: 'office', air: 'vent', detail: 'vent', event: 'settle', drip: [3.7, 3.6], pipe: [-3.8, 1.4], chatter: [0, 6.6] },
  dispatch: { space: 'cell', air: 'vent', detail: 'vent', event: 'chain', drip: [3.5, -3.6], pipe: [-3.5, 2.7], chatter: [5.8, 1] },
  boiler: { space: 'plant', air: 'vent', detail: 'steam', event: 'hiss', drip: [3.1, -3], pipe: [-3.7, 2.7], chatter: [0, 6.7] },
  sluice: { space: 'plant', air: 'water', detail: 'water', event: 'water', drip: [2.8, -3.7], pipe: [-3.7, -2.7], chatter: [0, 6.8] },
  quay: { space: 'exterior', air: 'wind', detail: 'water', event: 'chain', drip: [0, -8.5], pipe: [3.5, -4.2], chatter: [0, 7.5] },
};
const noop = () => {};
const stop = source => { try { source.stop(); } catch { /* A finished source is already silent. */ } };
const disconnect = node => { try { node.disconnect(); } catch { /* A closed context needs no cleanup. */ } };

export class PrisonAudio {
  constructor({ onStatus = noop, enabled = false, volume = .6, atmosphere = .55, chatterUrl = null,
    contextFactory, document = globalThis.document, window = globalThis.window,
    random = Math.random, fetch = globalThis.fetch?.bind(globalThis) } = {}) {
    this.enabled = !!enabled; this.volume = clamp(volume, .6); this.atmosphere = clamp(atmosphere, .55);
    this.active = false; this.room = 'holding'; this.context = null;
    this._document = document; this._window = window; this._random = random; this._fetch = fetch;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext || window?.AudioContext || window?.webkitAudioContext;
    this._supported = !!contextFactory || typeof AudioContext === 'function';
    this._factory = contextFactory || (() => new AudioContext({ latencyHint: 'interactive' }));
    this._onStatus = typeof onStatus === 'function' ? onStatus : noop;
    this._hidden = !!document?.hidden; this._disposed = false; this._unlocked = false;
    this._resumeTicket = 0; this._resumePending = null; this._suspendPending = null; this._lastStatus = '';
    this._voices = new Set(); this._bed = null; this._echo = null;
    this._buffers = new Map(); this._bufferBytes = 0; this._variantBags = new Map(); this._lastVariants = new Map();
    this._listener = { x: 0, z: 3.2, yaw: 0 }; this._nextSpatial = 0; this._nextBedDrift = Infinity;
    this._duckUntil = 0; this._nextMix = 0; this._lastAmbientKind = '';
    this._lastPose = null; this._stride = 0; this._foot = 0; this._lastStepAt = -Infinity;
    this._lastCue = new Map(); this._nextAmbient = Infinity;
    this._chatterUrl = null; this._chatterBuffer = null; this._chatterPending = null; this._chatterAbort = null;
    this._visibility = () => {
      this._hidden = !!this._document?.hidden; this._resetStride(); this._sync();
    };
    this._pageHide = () => { this._hidden = true; this._resetStride(); this._sync(); };
    this._pageShow = () => { this._hidden = !!this._document?.hidden; this._resetStride(); this._sync(); };
    this._gesture = event => {
      if (event?.isTrusted === false || event?.ctrlKey || event?.metaKey || event?.altKey) return;
      if (this.enabled && this.active && !this._hidden && this.context?.state !== 'running') this.unlock();
    };
    document?.addEventListener('visibilitychange', this._visibility);
    document?.addEventListener('click', this._gesture, { passive: true });
    document?.addEventListener('keydown', this._gesture, { passive: true });
    window?.addEventListener('pagehide', this._pageHide);
    window?.addEventListener('pageshow', this._pageShow);
    if (chatterUrl) this.setChatterSource(chatterUrl);
  }

  getStatus() {
    const state = this._disposed ? 'closed' : this.context?.state || (this._supported ? 'locked' : 'unavailable');
    const ready = state === 'running';
    const playing = this._canPlay();
    const needsGesture = !this._disposed && this.enabled && this._supported && !this._hidden
      && (!this._unlocked || (this.active && this.volume > 0 && !ready));
    const message = this._disposed ? 'Sound closed.' : !this.enabled ? 'Sound off.'
      : !this._supported ? 'Sound is unavailable in this browser.' : this.volume === 0 ? 'Volume is at zero.'
      : !this.active || this._hidden ? 'Sound paused.' : !ready ? 'Tap Sound to start or resume audio.' : 'Sound on.';
    return { enabled: this.enabled, volume: this.volume, atmosphere: this.atmosphere, active: this.active,
      hidden: this._hidden, supported: this._supported, unlocked: this._unlocked,
      ready, playing, state, needsGesture, message };
  }
  _emit() {
    const status = this.getStatus(), key = JSON.stringify(status);
    if (key === this._lastStatus) return;
    this._lastStatus = key;
    try { this._onStatus(status); } catch { /* A UI callback must not break the audio lifecycle. */ }
  }
  _wanted() { return !this._disposed && this.enabled && this.active && !this._hidden && this.volume > 0; }
  _canPlay() { return this._wanted() && this._unlocked && this.context?.state === 'running'; }
  _rand(min = 0, max = 1) { return min + Math.max(0, Math.min(.999999, Number(this._random()) || 0)) * (max - min); }
  _resetStride() { this._lastPose = null; this._stride = 0; this._lastStepAt = -Infinity; }
  _ramp(param, value, seconds = .05) {
    const at = this.context.currentTime;
    param.cancelScheduledValues(at); param.setTargetAtTime(value, at, Math.max(.005, seconds));
  }

  setEnabled(value) { if (this._disposed) return; this.enabled = !!value; this._resetStride(); this._sync(); }
  setVolume(value) { if (this._disposed) return; this.volume = clamp(value, this.volume); this._sync(); }
  setAtmosphere(value) {
    if (this._disposed) return;
    this.atmosphere = clamp(value, this.atmosphere);
    if (!this.atmosphere) this._stopAmbient();
    this._sync();
  }
  setActive(value) {
    if (this._disposed) return;
    value = !!value;
    if (value !== this.active) this._resetStride();
    this.active = value; this._sync();
  }
  setRoom(id) {
    if (this._disposed) return;
    id = Object.hasOwn(ROOMS, id) ? id : 'holding';
    if (id === this.room) return;
    this.room = id; this._resetStride(); this._stopAmbient(); this._lastAmbientKind = '';
    if (this._canPlay()) { this._configureEcho(); this._startBed(); }
  }

  // Call directly inside a click/tap handler, before awaiting other work. Both
  // context creation and resume() happen synchronously in this method's stack.
  unlock() {
    if (this._disposed || !this.enabled || this._hidden || !this._supported) { this._emit(); return Promise.resolve(false); }
    try {
      if (!this.context || this.context.state === 'closed') this._createContext();
      return this._resume(true);
    } catch {
      this._emit(); return Promise.resolve(false);
    }
  }
  _createContext() {
    this._stopAll(); this._destroyEcho();
    const context = this._factory();
    if (!context) throw new Error('AudioContext unavailable');
    this.context = context; this._unlocked = false; this._suspendPending = null; this._lastCue.clear();
    this._buffers.clear(); this._bufferBytes = 0; this._sampleRate = Math.min(context.sampleRate, 24000);
    this._master = context.createGain(); this._master.gain.value = 0;
    this._effects = context.createGain(); this._effects.gain.value = 1; this._effects.connect(this._master);
    this._atmosphere = context.createGain(); this._atmosphere.gain.value = this.atmosphere; this._atmosphere.connect(this._master);
    this._compressor = context.createDynamicsCompressor();
    this._compressor.threshold.value = -18; this._compressor.knee.value = 18; this._compressor.ratio.value = 4;
    this._compressor.attack.value = .006; this._compressor.release.value = .2;
    this._master.connect(this._compressor); this._compressor.connect(context.destination);
    context.onstatechange = () => {
      if (this.context !== context || this._disposed) return;
      if (context.state === 'running') this._unlocked = true;
      this._sync(false);
    };
  }
  _resume(gesture = false) {
    const context = this.context;
    if (!context || this._disposed) return Promise.resolve(false);
    if (context.state === 'running') { this._unlocked = true; this._sync(false); return Promise.resolve(true); }
    if (this._resumePending && !gesture) return this._resumePending;
    const ticket = ++this._resumeTicket;
    let resumed;
    try { resumed = context.resume(); } catch { this._emit(); return Promise.resolve(false); }
    const job = Promise.resolve(resumed).then(() => {
      if (this._disposed || this.context !== context || ticket !== this._resumeTicket) return false;
      this._resumePending = null;
      if (context.state === 'running') this._unlocked = true;
      this._sync(false);
      return this._unlocked;
    }, () => {
      if (this.context === context && ticket === this._resumeTicket) { this._resumePending = null; this._emit(); }
      return false;
    });
    this._resumePending = job; this._emit(); return job;
  }
  _sync(resume = true) {
    if (this._disposed) return;
    const context = this.context;
    if (!this._wanted()) {
      this._stopAll(); this._destroyEcho(); this._nextAmbient = Infinity;
      if (context && context.state !== 'closed') {
        this._master.gain.cancelScheduledValues(context.currentTime); this._master.gain.setValueAtTime(0, context.currentTime);
        if (context.state !== 'suspended' && !this._suspendPending) {
          ++this._resumeTicket; this._resumePending = null;
          try {
            const pending = Promise.resolve(context.suspend()).catch(noop).then(() => {
              if (this.context !== context || this._suspendPending !== pending) return;
              this._suspendPending = null;
              // A quick tab/menu return can arrive before suspend resolves. The
              // latest visibility and play request must win that race.
              if (this._wanted() && this._unlocked) this._resume(false);
            });
            this._suspendPending = pending;
          } catch { /* Muted output already prevents sound. */ }
        }
      }
      this._emit(); return;
    }
    if (context?.state === 'running' && this._unlocked) {
      this._ramp(this._master.gain, .7 * this.volume ** 1.35, .045);
      this._ramp(this._atmosphere.gain, this.atmosphere ** 1.2, .12);
      if (!this._echo) this._createEcho();
      this._startBed(); this._loadChatter();
    } else {
      this._stopAll(); this._destroyEcho();
      if (resume && context && context.state !== 'closed' && this._unlocked) this._resume(false);
    }
    this._emit();
  }

  _cached(key, build, rate = this._sampleRate) {
    key = rate + ':' + key;
    const existing = this._buffers.get(key);
    if (existing) { this._buffers.delete(key); this._buffers.set(key, existing); return existing.buffer; }
    const generated = build(), channels = Array.isArray(generated) ? generated : [generated];
    const buffer = this.context.createBuffer(channels.length, channels[0].length, rate);
    channels.forEach((data, index) => buffer.getChannelData(index).set(data));
    const bytes = channels.reduce((sum, data) => sum + data.byteLength, 0);
    while (this._buffers.size && (this._bufferBytes + bytes > MAX_BUFFER_BYTES || this._buffers.size >= 48)) {
      const first = this._buffers.keys().next().value;
      this._bufferBytes -= this._buffers.get(first).bytes; this._buffers.delete(first);
    }
    if (bytes <= MAX_BUFFER_BYTES) { this._buffers.set(key, { buffer, bytes }); this._bufferBytes += bytes; }
    return buffer;
  }
  _variant(family, count = 6) {
    let bag = this._variantBags.get(family);
    if (!bag?.length) {
      bag = Array.from({ length: count }, (_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(this._rand(0, i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag.at(-1) === this._lastVariants.get(family)) [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]];
      this._variantBags.set(family, bag);
    }
    const value = bag.pop(); this._lastVariants.set(family, value); return value;
  }
  _createEcho() {
    const c = this.context;
    if (typeof c.createConvolver !== 'function') return; // Dry effects still work on unusual implementations.
    const send = c.createGain(), ambientSend = c.createGain(), convolver = c.createConvolver();
    const damping = c.createBiquadFilter(), wet = c.createGain();
    send.gain.value = 1; ambientSend.gain.value = .25; wet.gain.value = 0;
    damping.type = 'lowpass'; damping.frequency.value = 3100;
    // The generated impulse has a calibrated gain. Browser normalization would
    // amplify its quiet diffuse tail and make room changes alter the mix level.
    convolver.normalize = false;
    this._effects.connect(send); this._atmosphere.connect(ambientSend);
    send.connect(convolver); ambientSend.connect(convolver); convolver.connect(damping); damping.connect(wet); wet.connect(this._master);
    this._echo = { send, ambientSend, convolver, damping, wet, space: '' }; this._configureEcho();
  }
  _configureEcho() {
    if (!this._echo) return;
    const space = CHARACTER[this.room].space;
    if (this._echo.space !== space) {
      const rate = this.context.sampleRate;
      const buffer = this._cached('impulse:' + space, () => synthRoomImpulse(rate, space), rate);
      if (this._echo.space) {
        // Fade only the wet return before swapping its response. The normal
        // update loop completes this; there is no timer that can outlive mute.
        this._echo.pending = { space, buffer, at: this.context.currentTime + .06 };
        this._ramp(this._echo.wet.gain, 0, .009); return;
      }
      this._echo.convolver.buffer = buffer; this._echo.space = space;
    }
    this._echo.pending = null;
    this._ramp(this._echo.wet.gain, ROOMS[this.room].wet, .16);
  }
  _advanceRoomResponse() {
    const pending = this._echo?.pending;
    if (!pending || this.context.currentTime < pending.at) return;
    this._echo.convolver.buffer = pending.buffer; this._echo.space = pending.space; this._echo.pending = null;
    const now = this.context.currentTime, gain = this._echo.wet.gain;
    gain.cancelScheduledValues(now); gain.setValueAtTime(0, now); gain.linearRampToValueAtTime(ROOMS[this.room].wet, now + .1);
  }
  _destroyEcho() {
    if (!this._echo) return;
    try { this._effects.disconnect(this._echo.send); } catch { /* Already detached. */ }
    try { this._atmosphere.disconnect(this._echo.ambientSend); } catch { /* Already detached. */ }
    for (const node of Object.values(this._echo)) if (typeof node?.disconnect === 'function') disconnect(node);
    this._echo = null;
  }
  _anchor(kind) {
    const character = CHARACTER[this.room];
    const point = character[kind === 'chatter' ? 'chatter' : kind === 'drip' || kind === 'water' ? 'drip' : 'pipe'];
    return { x: point[0], z: point[1], room: this.room };
  }
  _spatialUpdate() {
    const now = this.context.currentTime;
    if (now < this._nextSpatial) return;
    this._nextSpatial = now + .06;
    for (const voice of this._voices) if (voice.anchor && voice.spatialGain) {
      const mix = spatialMix(this._listener, voice.anchor);
      this._ramp(voice.spatialGain.gain, mix.gain, .045);
      if (voice.panner) this._ramp(voice.panner.pan, mix.pan, .045);
    }
  }
  _duck(seconds = .25) {
    this._duckUntil = Math.max(this._duckUntil, this.context.currentTime + seconds); this._nextMix = 0;
    this._mixDynamics();
  }
  _mixDynamics() {
    const now = this.context.currentTime;
    if (now < this._nextMix) return;
    this._nextMix = now + .1;
    this._ramp(this._atmosphere.gain, this.atmosphere ** 1.2 * (now < this._duckUntil ? .83 : 1), now < this._duckUntil ? .06 : .32);
    if (this._bed?.parts && now >= this._nextBedDrift) {
      this._nextBedDrift = now + this._rand(2.6, 5.7);
      for (const part of this._bed.parts) this._ramp(part.gain.gain, part.level * this._rand(.75, 1.12), this._rand(1.1, 2.8));
    }
  }
  _finish(voice) {
    if (!voice || voice.done) return;
    voice.done = true;
    for (const source of voice.sources) { source.onended = null; stop(source); }
    voice.nodes.forEach(disconnect); this._voices.delete(voice);
    if (this._bed === voice) this._bed = null;
  }
  _stopAll() { for (const voice of [...this._voices]) this._finish(voice); this._bed = null; }
  _stopAmbient() { for (const voice of [...this._voices]) if (voice.ambient) this._finish(voice); this._nextAmbient = Infinity; }
  _prune() {
    const now = this.context.currentTime;
    for (const voice of this._voices) if (voice.end <= now) this._finish(voice);
  }
  _voice(kind, duration, { ambient = false, pan = 0, sources = 1, gain = 1, anchor = null } = {}) {
    if (!this._canPlay() || (ambient && this.atmosphere <= 0)) return null;
    this._prune();
    const sourceCount = [...this._voices].reduce((sum, voice) => sum + voice.sources.length, 0);
    if (this._voices.size >= MAX_VOICES || sourceCount + sources > MAX_SOURCES) return null;
    const c = this.context, output = c.createGain(); output.gain.value = gain;
    const nodes = [output], bus = ambient ? this._atmosphere : this._effects;
    let end = output, spatialGain = null, panner = null;
    const mix = anchor ? spatialMix(this._listener, anchor) : { pan, gain: 1 };
    if (anchor) { spatialGain = c.createGain(); spatialGain.gain.value = mix.gain; end.connect(spatialGain); end = spatialGain; nodes.push(spatialGain); }
    if (typeof c.createStereoPanner === 'function') {
      panner = c.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, mix.pan));
      end.connect(panner); end = panner; nodes.push(panner);
    }
    end.connect(bus);
    const voice = { kind, output, nodes, sources: [], ambient, anchor, spatialGain, panner, done: false, ended: 0, end: c.currentTime + duration + .08 };
    this._voices.add(voice); return voice;
  }
  _source(voice, source, nodes = []) {
    voice.sources.push(source); voice.nodes.push(source, ...nodes);
    source.onended = () => { if (!voice.done && ++voice.ended === voice.sources.length) this._finish(voice); };
  }
  _envelope(param, at, duration, level, attack = .008) {
    param.setValueAtTime(0, at); param.linearRampToValueAtTime(level, at + Math.min(attack, duration / 3));
    param.exponentialRampToValueAtTime(.00001, at + duration); param.setValueAtTime(0, at + duration + .01);
  }
  _tone(voice, frequency, end, duration, level, { delay = 0, type = 'sine', attack = .008 } = {}) {
    const c = this.context, at = c.currentTime + delay, source = c.createOscillator(), gain = c.createGain();
    source.type = type; source.frequency.setValueAtTime(frequency, at); source.frequency.exponentialRampToValueAtTime(end, at + duration);
    this._envelope(gain.gain, at, duration, level, attack);
    source.connect(gain); gain.connect(voice.output); this._source(voice, source, [gain]);
    source.start(at); source.stop(at + duration + .02);
  }
  _sample(voice, buffer, { level = 1, rate = 1, loop = false, offset = 0, filter = 0 } = {}) {
    const c = this.context, source = c.createBufferSource(), gain = c.createGain(), nodes = [gain];
    source.buffer = buffer; source.playbackRate.value = rate; source.loop = loop; gain.gain.value = level;
    let end = source;
    if (filter) { const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = filter; source.connect(low); end = low; nodes.push(low); }
    end.connect(gain); gain.connect(voice.output); this._source(voice, source, nodes);
    source.start(c.currentTime, Math.min(offset, Math.max(0, buffer.duration - .001)));
    if (!loop) source.stop(c.currentTime + (buffer.duration - offset) / rate + .005);
    return { source, gain, level };
  }
  _startBed() {
    if (this._bed || !this._canPlay() || this.atmosphere <= 0) return;
    const c = this.context, profile = ROOMS[this.room], character = CHARACTER[this.room];
    const voice = this._voice('bed', Infinity, { ambient: true, sources: 3 });
    if (!voice) return;
    this._bed = voice; voice.parts = [];
    voice.output.gain.setValueAtTime(0, c.currentTime); voice.output.gain.linearRampToValueAtTime(1, c.currentTime + 1.2);
    const seed = 37 + Object.keys(ROOMS).indexOf(this.room) * 103;
    const layers = [['machine', 2.93, profile.level * 2.4], [character.air, 7.13, profile.air * 1.25], [character.detail, 10.87, profile.air * .6]];
    layers.forEach(([kind, seconds, level], index) => {
      const buffer = this._cached('room:' + this.room + ':' + index, () => synthTexture(this._sampleRate, kind, seed + index * 173, seconds, profile.hum));
      voice.parts.push(this._sample(voice, buffer, { loop: true, level, offset: this._rand(0, buffer.duration * .8), rate: index ? this._rand(.975, 1.02) : 1 }));
    });
    this._nextBedDrift = c.currentTime + this._rand(2.5, 4.5);
    this._nextAmbient = c.currentTime + this._rand(4, 8);
  }
  _step(crouch) {
    const c = this.context;
    if (c.currentTime - this._lastStepAt < (crouch ? .2 : .15)) return false;
    const floor = ROOMS[this.room].floor, variant = this._variant('step:' + floor);
    const buffer = this._cached('step:' + floor + ':' + variant, () => synthFootstep(this._sampleRate, floor, variant));
    const voice = this._voice('step', buffer.duration / .94, { sources: 1, gain: crouch ? .34 : 1, pan: this._foot ? .09 : -.09 });
    if (!voice) return false;
    this._lastStepAt = c.currentTime; this._foot ^= 1;
    this._sample(voice, buffer, { rate: this._rand(.965, 1.035), level: this._rand(.162, .181), filter: crouch ? 1200 : 0 });
    this._duck(.14); return true;
  }
  update({ dt = 0, pose, room } = {}) {
    if (this._disposed) return 0;
    if (room) this.setRoom(room);
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) { this._resetStride(); return 0; }
    const previous = this._lastPose;
    this._lastPose = { x: pose.x, z: pose.z };
    this._listener = { x: pose.x, z: pose.z, yaw: Number.isFinite(pose.yaw) ? pose.yaw : this._listener.yaw };
    if (!this._canPlay()) { this._stride = 0; return 0; }
    this._prune(); this._advanceRoomResponse(); this._spatialUpdate(); this._mixDynamics();
    if (this.atmosphere > 0) {
      this._startBed();
      if (this.context.currentTime >= this._nextAmbient) {
        const interval = ROOMS[this.room].interval;
        this._nextAmbient = this.context.currentTime + interval[0] + this._rand() ** 1.6 * (interval[1] - interval[0]) * 1.35;
        try { this._ambientEvent(); } catch { /* An optional effect must never interrupt movement. */ }
      }
    }
    if (!previous) return 0;
    const distance = Math.hypot(pose.x - previous.x, pose.z - previous.z);
    // Ignore teleports, stale frames and jitter. Held movement keys never enter
    // this calculation: only the collision-checked final position creates steps.
    if (!Number.isFinite(dt) || dt <= 0 || dt > .75 || distance > Math.max(1.2, Math.min(dt, .25) * 5 + .1)) {
      this._stride = 0; return 0;
    }
    if (distance < .001) return 0;
    const stride = pose.crouch ? .64 : .8;
    this._stride += distance;
    if (this._stride < stride) return 0;
    this._stride %= stride;
    try { return this._step(!!pose.crouch) ? 1 : 0; } catch { return 0; }
  }

  cue(kind) {
    if (kind === 'pickup') kind = 'key';
    if (!this._canPlay() || !Object.hasOwn(CUE_GAP, kind)) return false;
    const now = this.context.currentTime;
    if (now - (this._lastCue.get(kind) ?? -Infinity) < CUE_GAP[kind]) return false;
    const sampled = !['success', 'error'].includes(kind), sound = kind === 'key' ? 'keys' : kind === 'mechanism' ? 'chain' : kind;
    let buffer;
    if (sampled) {
      const variant = this._variant('cue:' + sound, 4);
      buffer = this._cached('event:' + sound + ':' + variant, () => synthEvent(this._sampleRate, sound, variant));
    }
    const voice = this._voice(kind, sampled ? buffer.duration / .95 : .6, { sources: kind === 'success' ? 2 : 1 });
    if (!voice) return false;
    this._lastCue.set(kind, now);
    try {
      if (sampled) this._sample(voice, buffer, { rate: this._rand(.975, 1.025), level: kind === 'door' ? .23 : kind === 'key' ? .15 : .19 });
      else if (kind === 'success') {
        this._tone(voice, 262, 262, .35, .065, { attack: .03 }); this._tone(voice, 393, 393, .47, .045, { delay: .1, attack: .03 });
      } else this._tone(voice, 160, 120, .13, .065);
      this._duck(.48); return true;
    } catch { this._finish(voice); return false; }
  }
  _ambientEvent() {
    const profile = ROOMS[this.room], character = CHARACTER[this.room], rest = 1 - profile.drip - profile.chatter;
    const choices = [['drip', profile.drip], ['chatter', profile.chatter], ['pipe', rest * .55], [character.event, rest * .45]]
      .filter(([kind, weight]) => kind !== this._lastAmbientKind && weight > 0);
    let draw = this._rand(0, choices.reduce((sum, entry) => sum + entry[1], 0)), kind = choices.at(-1)[0];
    for (const choice of choices) { draw -= choice[1]; if (draw <= 0) { kind = choice[0]; break; } }
    this._lastAmbientKind = kind;
    if (kind === 'chatter') { this._murmur(); return; }
    const variant = this._variant('ambient:' + kind, 4);
    const buffer = this._cached('event:' + kind + ':' + variant, () => synthEvent(this._sampleRate, kind, variant));
    const voice = this._voice(kind, buffer.duration / .95, { ambient: true, sources: 1, anchor: this._anchor(kind) });
    if (!voice) return;
    this._sample(voice, buffer, { rate: this._rand(.97, 1.025), level: kind === 'hiss' || kind === 'water' ? .1 : .13 });
  }
  _murmur() {
    const c = this.context;
    if (this._chatterBuffer) {
      const duration = Math.min(3.8, this._chatterBuffer.duration);
      const voice = this._voice('chatter', duration, { ambient: true, sources: 1, anchor: this._anchor('chatter') });
      if (!voice) return;
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = this._chatterBuffer; filter.type = 'lowpass'; filter.frequency.value = 1050; gain.gain.value = 0;
      const at = c.currentTime; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.075, at + Math.min(.5, duration / 4));
      gain.gain.linearRampToValueAtTime(.055, at + duration * .65); gain.gain.linearRampToValueAtTime(0, at + duration);
      source.connect(filter); filter.connect(gain); gain.connect(voice.output); this._source(voice, source, [filter, gain]);
      source.start(at, this._rand(0, Math.max(0, source.buffer.duration - duration))); source.stop(at + duration); return;
    }
    const variant = this._variant('murmur', 6);
    const buffer = this._cached('murmur:' + variant, () => synthMurmur(this._sampleRate, variant));
    const voice = this._voice('chatter', buffer.duration / .94, { ambient: true, sources: 1, anchor: this._anchor('chatter') });
    if (voice) this._sample(voice, buffer, { rate: this._rand(.96, 1.025), level: .115 });
  }

  // Optional same-origin short sample. Synthesis remains available if the file
  // is missing, offline, unsupported, or has not finished decoding.
  setChatterSource(url) {
    this._chatterAbort?.abort(); this._chatterAbort = null; this._chatterPending = null; this._chatterBuffer = null; this._chatterUrl = null;
    if (!url || this._disposed) return false;
    try {
      const parsed = new URL(url, import.meta.url), base = new URL(import.meta.url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== base.origin) return false;
      this._chatterUrl = parsed.href; this._loadChatter(); return true;
    } catch { return false; }
  }
  _loadChatter() {
    if (!this._chatterUrl || this._chatterBuffer || this._chatterPending || !this._unlocked || !this._canPlay() || this.atmosphere <= 0 || !this._fetch) return;
    const context = this.context, url = this._chatterUrl, abort = new AbortController(); this._chatterAbort = abort;
    const job = Promise.resolve().then(() => this._fetch(url, { signal: abort.signal, cache: 'force-cache' }))
      .then(response => { if (!response.ok) throw new Error('Audio sample unavailable'); return response.arrayBuffer(); })
      .then(bytes => { if (bytes.byteLength > 4_000_000) throw new Error('Audio sample is too large'); return context.decodeAudioData(bytes); })
      .then(buffer => {
        if (!this._disposed && this.context === context && this._chatterUrl === url && !abort.signal.aborted
          && buffer.duration > 0 && buffer.duration <= 60 && buffer.numberOfChannels <= 2) this._chatterBuffer = buffer;
      }).catch(noop);
    this._chatterPending = job;
  }
  dispose() {
    if (this._disposed) return;
    this.active = false; this._stopAll(); this._destroyEcho(); this._resetStride();
    this._chatterAbort?.abort(); this._chatterBuffer = null; this._buffers.clear(); this._bufferBytes = 0;
    this._variantBags.clear(); this._lastVariants.clear();
    this._document?.removeEventListener('visibilitychange', this._visibility);
    this._document?.removeEventListener('click', this._gesture);
    this._document?.removeEventListener('keydown', this._gesture);
    this._window?.removeEventListener('pagehide', this._pageHide); this._window?.removeEventListener('pageshow', this._pageShow);
    this._disposed = true; ++this._resumeTicket; this._resumePending = this._suspendPending = null;
    if (this.context) {
      this.context.onstatechange = null;
      for (const node of [this._master, this._effects, this._atmosphere, this._compressor]) if (node) disconnect(node);
      try { Promise.resolve(this.context.close()).catch(noop); } catch { /* Already closed. */ }
    }
    this._emit();
  }
}
