// Optional, original procedural prison audio. No puzzle information is encoded in
// these sounds, and no AudioContext is created before an explicit user gesture.
const clamp = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
const MAX_VOICES = 12;
const MAX_SOURCES = 24;
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
    this.room = id; this._resetStride(); this._stopAmbient();
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
    this._master = context.createGain(); this._master.gain.value = 0;
    this._effects = context.createGain(); this._effects.gain.value = 1; this._effects.connect(this._master);
    this._atmosphere = context.createGain(); this._atmosphere.gain.value = this.atmosphere; this._atmosphere.connect(this._master);
    this._compressor = context.createDynamicsCompressor();
    this._compressor.threshold.value = -18; this._compressor.knee.value = 18; this._compressor.ratio.value = 4;
    this._compressor.attack.value = .006; this._compressor.release.value = .2;
    this._master.connect(this._compressor); this._compressor.connect(context.destination);
    this._noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this._rand(-1, 1);
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

  _createEcho() {
    const c = this.context, send = c.createGain(), ambientSend = c.createGain();
    const delay = c.createDelay(.8), filter = c.createBiquadFilter(), feedback = c.createGain(), wet = c.createGain();
    send.gain.value = .45; ambientSend.gain.value = .08; filter.type = 'lowpass'; filter.frequency.value = 1900;
    this._effects.connect(send); this._atmosphere.connect(ambientSend); send.connect(delay); ambientSend.connect(delay);
    delay.connect(filter); filter.connect(feedback); feedback.connect(delay); filter.connect(wet); wet.connect(this._master);
    this._echo = { send, ambientSend, delay, filter, feedback, wet }; this._configureEcho();
  }
  _configureEcho() {
    if (!this._echo) return;
    const profile = ROOMS[this.room];
    this._ramp(this._echo.delay.delayTime, profile.echo, .08);
    this._ramp(this._echo.feedback.gain, profile.feedback, .08);
    this._ramp(this._echo.wet.gain, profile.wet, .08);
  }
  _destroyEcho() {
    if (!this._echo) return;
    try { this._effects.disconnect(this._echo.send); } catch { /* Already detached. */ }
    try { this._atmosphere.disconnect(this._echo.ambientSend); } catch { /* Already detached. */ }
    Object.values(this._echo).forEach(disconnect); this._echo = null;
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
  _voice(kind, duration, { ambient = false, pan = 0, sources = 1, gain = 1 } = {}) {
    if (!this._canPlay() || (ambient && this.atmosphere <= 0)) return null;
    this._prune();
    const sourceCount = [...this._voices].reduce((sum, voice) => sum + voice.sources.length, 0);
    if (this._voices.size >= MAX_VOICES || sourceCount + sources > MAX_SOURCES) return null;
    const c = this.context, output = c.createGain(); output.gain.value = gain;
    const nodes = [output], bus = ambient ? this._atmosphere : this._effects;
    if (typeof c.createStereoPanner === 'function') {
      const panner = c.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, pan));
      output.connect(panner); panner.connect(bus); nodes.push(panner);
    } else output.connect(bus);
    const voice = { kind, output, nodes, sources: [], ambient, done: false, ended: 0, end: c.currentTime + duration + .08 };
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
  _noise(voice, duration, level, frequency, { delay = 0, type = 'lowpass', q = .7 } = {}) {
    const c = this.context, at = c.currentTime + delay, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = this._noiseBuffer; filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    this._envelope(gain.gain, at, duration, level, .006);
    source.connect(filter); filter.connect(gain); gain.connect(voice.output); this._source(voice, source, [filter, gain]);
    source.start(at, this._rand(0, Math.max(0, source.buffer.duration - duration - .05))); source.stop(at + duration + .02);
  }

  _startBed() {
    if (this._bed || !this._canPlay() || this.atmosphere <= 0) return;
    const c = this.context, profile = ROOMS[this.room], voice = this._voice('bed', Infinity, { ambient: true, sources: 3 });
    if (!voice) return;
    this._bed = voice; voice.output.gain.setValueAtTime(0, c.currentTime); voice.output.gain.linearRampToValueAtTime(1, c.currentTime + 1.2);
    for (const [frequency, level] of [[profile.hum, profile.level], [profile.hum * 2.003, profile.level * .17]]) {
      const source = c.createOscillator(), gain = c.createGain(); source.type = 'sine'; source.frequency.value = frequency; gain.gain.value = level;
      source.connect(gain); gain.connect(voice.output); this._source(voice, source, [gain]); source.start();
    }
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = this._noiseBuffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = profile.cutoff; gain.gain.value = profile.air;
    source.connect(filter); filter.connect(gain); gain.connect(voice.output); this._source(voice, source, [filter, gain]); source.start(c.currentTime, this._rand(0, 1));
    this._nextAmbient = c.currentTime + this._rand(4, 8);
  }
  _step(crouch) {
    const c = this.context;
    if (c.currentTime - this._lastStepAt < (crouch ? .2 : .15)) return false;
    const floor = ROOMS[this.room].floor, voice = this._voice('step', .24, { sources: 2, gain: crouch ? .34 : 1, pan: this._foot ? .12 : -.12 });
    if (!voice) return false;
    this._lastStepAt = c.currentTime; this._foot ^= 1;
    this._tone(voice, this._rand(85, 105), 43, .15, .14);
    this._noise(voice, crouch ? .14 : .1, floor === 'metal' ? .105 : .08,
      (floor === 'tile' ? 1600 : floor === 'metal' ? 1150 : 800) * (crouch ? .7 : 1), { type: 'bandpass', q: .65 });
    return true;
  }
  update({ dt = 0, pose, room } = {}) {
    if (this._disposed) return 0;
    if (room) this.setRoom(room);
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) { this._resetStride(); return 0; }
    const previous = this._lastPose;
    this._lastPose = { x: pose.x, z: pose.z };
    if (!this._canPlay()) { this._stride = 0; return 0; }
    this._prune();
    if (this.atmosphere > 0) {
      this._startBed();
      if (this.context.currentTime >= this._nextAmbient) {
        const interval = ROOMS[this.room].interval;
        this._nextAmbient = this.context.currentTime + this._rand(...interval);
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
    const voice = this._voice(kind, kind === 'door' ? .65 : .6, { sources: kind === 'error' ? 1 : kind === 'success' ? 2 : 3 });
    if (!voice) return false;
    this._lastCue.set(kind, now);
    try {
      if (kind === 'key') {
        this._tone(voice, 1500, 1310, .16, .075); this._tone(voice, 2180, 2030, .21, .047, { delay: .045 });
        this._noise(voice, .04, .045, 3200, { type: 'highpass' });
      } else if (kind === 'door') {
        this._noise(voice, .55, .18, 420); this._tone(voice, 76, 36, .28, .14);
        this._tone(voice, 232, 173, .44, .035, { delay: .09, type: 'triangle', attack: .05 });
      } else if (kind === 'mechanism') {
        this._noise(voice, .25, .13, 750); this._tone(voice, 140, 90, .42, .095);
        this._tone(voice, 340, 260, .25, .035, { delay: .18, type: 'triangle' });
      } else if (kind === 'success') {
        this._tone(voice, 262, 262, .35, .065, { attack: .03 }); this._tone(voice, 393, 393, .47, .045, { delay: .1, attack: .03 });
      } else this._tone(voice, 160, 120, .13, .065);
      return true;
    } catch { this._finish(voice); return false; }
  }
  _ambientEvent() {
    const profile = ROOMS[this.room], choice = this._rand();
    if (choice >= profile.drip && choice < profile.drip + profile.chatter) { this._murmur(); return; }
    const drip = choice < profile.drip;
    const voice = this._voice(drip ? 'drip' : 'pipe', .5, { ambient: true, sources: 2, pan: this._rand(-.7, .7) });
    if (!voice) return;
    if (drip) {
      this._tone(voice, this._rand(1100, 1450), 620, .17, .06);
      this._tone(voice, 840, 520, .12, .023, { delay: .13 });
    } else {
      this._tone(voice, this._rand(160, 230), 91, .29, .075);
      this._noise(voice, .055, .045, 1800, { type: 'bandpass' });
    }
  }
  _murmur() {
    const c = this.context;
    if (this._chatterBuffer) {
      const duration = Math.min(3.8, this._chatterBuffer.duration);
      const voice = this._voice('chatter', duration, { ambient: true, sources: 1, pan: this._rand(-.65, .65) });
      if (!voice) return;
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = this._chatterBuffer; filter.type = 'lowpass'; filter.frequency.value = 1050; gain.gain.value = 0;
      const at = c.currentTime; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.075, at + Math.min(.5, duration / 4));
      gain.gain.linearRampToValueAtTime(.055, at + duration * .65); gain.gain.linearRampToValueAtTime(0, at + duration);
      source.connect(filter); filter.connect(gain); gain.connect(voice.output); this._source(voice, source, [filter, gain]);
      source.start(at, this._rand(0, Math.max(0, source.buffer.duration - duration))); source.stop(at + duration); return;
    }
    // Quiet formant-filtered syllables suggest people beyond a wall. There are
    // no intelligible words, instructions, or hidden answers in this fallback.
    const duration = 2.4, voice = this._voice('chatter', duration, { ambient: true, sources: 2, pan: this._rand(-.65, .65) });
    if (!voice) return;
    for (let i = 0; i < 2; i++) {
      const at = c.currentTime, source = c.createOscillator(), formant = c.createBiquadFilter(), lowpass = c.createBiquadFilter(), gain = c.createGain();
      source.type = 'sawtooth'; source.frequency.value = i ? 151 : 103;
      formant.type = 'bandpass'; formant.frequency.value = i ? 730 : 480; formant.Q.value = .65;
      lowpass.type = 'lowpass'; lowpass.frequency.value = 1050; gain.gain.setValueAtTime(0, at);
      for (let syllable = 0; syllable < 6; syllable++) {
        const start = at + .09 + syllable * .36 + i * .09, level = this._rand(.009, .018);
        gain.gain.linearRampToValueAtTime(0, start); gain.gain.linearRampToValueAtTime(level, start + .07);
        gain.gain.linearRampToValueAtTime(level * .4, start + .18); gain.gain.linearRampToValueAtTime(0, start + .28);
        source.frequency.linearRampToValueAtTime((i ? 151 : 103) + this._rand(-11, 11), start + .16);
      }
      source.connect(formant); formant.connect(lowpass); lowpass.connect(gain); gain.connect(voice.output);
      this._source(voice, source, [formant, lowpass, gain]); source.start(at); source.stop(at + duration);
    }
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
    this._chatterAbort?.abort(); this._chatterBuffer = this._noiseBuffer = null;
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
