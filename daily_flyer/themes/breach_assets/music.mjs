/** Restrained, original combat music. Reuses the game's unlocked audio context. */
const CUE_URL = new URL('./music/containment-pulse.mp3', import.meta.url);
const GRACE = 18, PRESSURE_HOLD = 2.5, QUIET_HOLD = 5, COOLDOWN = 120, MAX_CUE_SECONDS = 40;
const DUCK_EVENTS = new Set(['enemy-warning', 'enemy-shot', 'hurt', 'explosion', 'teleport', 'provoked', 'boss-phase']);
const RELIEF_EVENTS = new Set(['refuge', 'transit', 'transit-activated', 'checkpoint', 'relay', 'power']);
const LOCAL_EVENTS = new Set(['record', 'hurt', 'refuge', 'transit']);
const level = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export class BreachMusic {
  constructor({ enabled = true, volume = .45, fetcher = globalThis.fetch } = {}) {
    this.enabled = !!enabled; this.volume = level(volume, .45); this.fetcher = fetcher;
    this.context = null; this.output = null; this.playing = false;
    this.time = 0; this.graceUntil = GRACE; this.cooldownUntil = 0;
    this.suppressedUntil = 0; this.duckUntil = 0; this.pressureTime = 0; this.quietTime = 0;
    this.armed = true;
    this._buffer = null; this._pending = null; this._active = null; this._sources = new Set(); this._generation = 0;
  }

  // This module never creates or resumes an AudioContext, including while loading.
  attach(context, output) {
    if (context === this.context && output === this.output) return;
    this._interrupt();
    if (context !== this.context) {
      this._buffer = null;
      // A discarded/closed context may never dispatch its scheduled onended.
      for (const cue of this._sources) {
        cue.source.onended = null;
        try { cue.source.stop(); } catch (_) { /* Already stopped. */ }
        try { cue.source.disconnect(); cue.gain.disconnect(); } catch (_) { /* Already disconnected. */ }
      }
      this._sources.clear();
    }
    this.context = context || null; this.output = output || null;
  }

  configure({ enabled = this.enabled, volume = this.volume } = {}) {
    const wasAudible = this.enabled && this.volume > 0;
    this.enabled = !!enabled; this.volume = level(volume, this.volume);
    if (!this.enabled || !this.volume) {
      if (wasAudible || this._active || this._pending) this._interrupt();
      this.pressureTime = 0;
    } else if (this._active) this._setLevel(.15);
  }

  setPlaying(value) {
    this.playing = !!value;
    if (!this.playing) { this._interrupt(); this.pressureTime = 0; }
  }

  // A mission/retry gets silence first, but cannot reset the session cooldown.
  reset() {
    this._interrupt(); this.graceUntil = this.time + GRACE;
    this.pressureTime = 0; this.quietTime = 0; this.suppressedUntil = this.time; this.duckUntil = this.time;
  }

  events(events, listener = null) {
    if (!Array.isArray(events)) return;
    for (const event of events) {
      if (!event || typeof event.type !== 'string') continue;
      if (LOCAL_EVENTS.has(event.type) && event.playerId && listener?.id && event.playerId !== listener.id) continue;
      const spatial = listener && Number.isFinite(listener.x) && Number.isFinite(listener.z) && Number.isFinite(event.x) && Number.isFinite(event.z);
      if (spatial && Math.hypot(event.x - listener.x, event.z - listener.z) > 14) continue;
      if (event.type === 'record' || RELIEF_EVENTS.has(event.type)) {
        this.suppressedUntil = Math.max(this.suppressedUntil, this.time + (event.type === 'record' ? 12 : 8));
        this.pressureTime = 0; this._interrupt();
      } else if (DUCK_EVENTS.has(event.type)) {
        this.duckUntil = Math.max(this.duckUntil, this.time + 1.2);
        if (this._active) this._setLevel(.035);
      }
    }
  }

  update({ dt = 0, pressure = 0, alive = true, blocked = false } = {}) {
    // Optional sound must never escape into the main frame's fatal-error handler.
    try {
      if (!this.playing || blocked || !alive) { this._interrupt(); this.pressureTime = 0; return; }
      // Hidden-tab catch-up is not evidence of sustained visible combat.
      const delta = Number.isFinite(dt) ? Math.max(0, Math.min(.5, dt)) : 0;
      this.time += delta;
      const combat = Number.isFinite(pressure) && pressure >= 2;
      if (!combat) {
        this.pressureTime = 0; this.quietTime += delta;
        // An asynchronously decoded cue must not arrive after combat has left.
        if (this._pending) this._interrupt();
        if (this.quietTime >= QUIET_HOLD) {
          if (this._active) this._interrupt();
          this.armed = true;
        }
      } else {
        this.quietTime = 0;
        if (this.time >= this.graceUntil && this.time >= this.suppressedUntil) this.pressureTime += Math.min(delta, this.time - Math.max(this.graceUntil, this.suppressedUntil));
        else this.pressureTime = 0;
      }
      if (this._pending && !this._readyContext()) this._interrupt();
      if (this._active) {
        if (this.context?.state !== 'running') this._interrupt();
        else if (this._active.ducked !== (this.time < this.duckUntil)) this._setLevel(.3);
      }
      if (!combat || !this.enabled || !this.volume || !this.armed || this._pending || this._active || this._sources.size) return;
      if (this.time < this.graceUntil || this.time < this.suppressedUntil || this.time < this.cooldownUntil || this.pressureTime < PRESSURE_HOLD) return;
      if (!this._readyContext() || typeof this.fetcher !== 'function') return;
      this._requestCue();
    } catch (_) { this._interrupt(); }
  }

  _readyContext() {
    return this.context?.state === 'running' && this.output && typeof this.context.createBufferSource === 'function' && typeof this.context.createGain === 'function' && typeof this.context.decodeAudioData === 'function';
  }

  _currentRequest(request) {
    return this._pending === request && request.generation === this._generation && request.context === this.context && this.playing && this.enabled && this.volume > 0 && this._readyContext() && this.quietTime === 0;
  }

  _requestCue() {
    const request = { generation: ++this._generation, context: this.context, abort: typeof AbortController === 'function' ? new AbortController() : null };
    this.armed = false; this.pressureTime = 0; this._pending = request;
    // No preload: even the first fetch happens only after an eligible encounter.
    Promise.resolve().then(async () => {
      if (!this._currentRequest(request)) return;
      let buffer = this._buffer;
      if (!buffer) {
        const response = await this.fetcher(CUE_URL, { credentials: 'same-origin', mode: 'same-origin', ...(request.abort ? { signal: request.abort.signal } : {}) });
        if (!this._currentRequest(request)) return;
        if (!response?.ok) throw new Error('Music unavailable');
        const bytes = await response.arrayBuffer();
        if (!this._currentRequest(request)) return;
        buffer = await request.context.decodeAudioData(bytes);
        if (!this._currentRequest(request)) return;
        if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid music');
        this._buffer = buffer;
      }
      if (!this._currentRequest(request)) return;
      this._pending = null;
      this._start(buffer);
    }).catch(() => {
      if (this._pending === request) {
        this._pending = null; this.cooldownUntil = Math.max(this.cooldownUntil, this.time + COOLDOWN);
      }
    });
  }

  _start(buffer) {
    let source = null, gain = null, cue = null;
    try {
      const c = this.context, at = c.currentTime;
      source = c.createBufferSource(); gain = c.createGain();
      source.buffer = buffer; source.loop = false; gain.gain.setValueAtTime(0, at);
      source.connect(gain); gain.connect(this.output);
      cue = { source, gain, ducked: this.time < this.duckUntil, stopped: false };
      this._active = cue; this._sources.add(cue);
      source.onended = () => {
        this._sources.delete(cue);
        if (this._active === cue) this._active = null;
        this.cooldownUntil = Math.max(this.cooldownUntil, this.time + COOLDOWN);
        try { source.disconnect(); gain.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      };
      gain.gain.linearRampToValueAtTime(this.volume * (cue.ducked ? .25 : 1), at + .8);
      source.start(at); source.stop(at + Math.min(buffer.duration, MAX_CUE_SECONDS));
    } catch (_) {
      if (cue) { this._sources.delete(cue); if (this._active === cue) this._active = null; }
      try { source?.stop(); } catch (_) { /* A source may not have started. */ }
      try { source?.disconnect(); gain?.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      this.cooldownUntil = Math.max(this.cooldownUntil, this.time + COOLDOWN);
    }
  }

  _setLevel(seconds) {
    const cue = this._active;
    if (!cue || !this.context) return;
    try {
      const at = this.context.currentTime, param = cue.gain.gain;
      cue.ducked = this.time < this.duckUntil;
      param.cancelScheduledValues(at); param.setValueAtTime(param.value, at);
      param.linearRampToValueAtTime(this.volume * (cue.ducked ? .25 : 1), at + seconds);
    } catch (_) { this._interrupt(); }
  }

  _interrupt() {
    ++this._generation;
    const pending = this._pending; this._pending = null;
    if (pending) { try { pending.abort?.abort(); } catch (_) { /* Fetch may already have finished. */ } }
    const cue = this._active; this._active = null;
    if (pending || cue) { this.armed = false; this.cooldownUntil = Math.max(this.cooldownUntil, this.time + COOLDOWN); }
    if (!cue || cue.stopped) return;
    cue.stopped = true;
    try {
      const at = this.context?.currentTime || 0, param = cue.gain.gain;
      param.cancelScheduledValues(at); param.setValueAtTime(param.value, at); param.linearRampToValueAtTime(0, at + .3);
      cue.source.stop(at + .3);
    } catch (_) {
      this._sources.delete(cue);
      try { cue.source.disconnect(); cue.gain.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
    }
  }
}
