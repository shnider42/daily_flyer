/** Restrained original score. Silence and local gameplay sounds have priority. */
import { CUES_BY_ID, chooseCue } from './music-cues.mjs';
const GRACE = 18, PRESSURE_HOLD = 2.5, QUIET_HOLD = 5, COOLDOWN = 120, MAX_CUE_SECONDS = 40;
const DUCK_EVENTS = new Set(['enemy-warning', 'enemy-shot', 'hurt', 'explosion', 'teleport', 'provoked', 'boss-phase', 'shield-open', 'shield-hit', 'heal', 'heal-interrupt', 'ricochet']);
const RELIEF_EVENTS = new Set(['refuge', 'transit', 'transit-activated', 'checkpoint', 'relay', 'power']);
const LOCAL_EVENTS = new Set(['record', 'hurt', 'refuge', 'transit']);
const level = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export class BreachMusic {
  constructor({ enabled = true, volume = .45, fetcher = globalThis.fetch?.bind(globalThis) } = {}) {
    this.enabled = !!enabled; this.volume = level(volume, .45); this.fetcher = fetcher;
    this.context = null; this.output = null; this.playing = false;
    this.time = 0; this.graceUntil = GRACE; this.cooldownUntil = 0;
    this.suppressedUntil = 0; this.duckUntil = 0; this.pressureTime = 0; this.quietTime = 0;
    this.armed = true;
    this.recent = []; this.seenMoments = new Set(); this._moment = null; this._scene = {};
    this.silentTime = 0; this.guardianTime = 0; this.hadCombat = false;
    this._buffers = new Map(); this._loads = new Map();
    this._buffer = null; this._pending = null; this._active = null; this._sources = new Set(); this._generation = 0;
  }

  // This module never creates or resumes an AudioContext, including while loading.
  attach(context, output) {
    if (context === this.context && output === this.output) return;
    this._interrupt();
    if (context !== this.context) {
      this._buffer = null; this._buffers.clear(); this._loads.clear();
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
      this.pressureTime = 0; this._moment = null;
    } else if (this._active) this._setLevel(.15);
  }

  setPlaying(value) {
    this.playing = !!value;
    if (!this.playing) { this._interrupt(); this.pressureTime = 0; this._moment = null; }
  }

  // A mission/retry gets silence first, but cannot reset the session cooldown.
  reset() {
    this._interrupt(); this.graceUntil = this.time + GRACE;
    this.seenMoments.clear(); this._moment = null; this._scene = {};
    this.silentTime = 0; this.guardianTime = 0; this.hadCombat = false;
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

  update({ dt = 0, pressure = 0, guardian = false, scene = {}, alive = true, blocked = false } = {}) {
    try {
      this._scene = scene;
      if (!this.playing || blocked || scene.silence || !alive) {
        // A passed story moment is never queued behind a menu, death or map.
        if (this.playing) this._observeMoment(scene, true);
        this._moment = null; this._interrupt(); this.pressureTime = 0; this.guardianTime = 0; return;
      }
      const delta = Number.isFinite(dt) ? Math.max(0, Math.min(.5, dt)) : 0;
      this.time += delta;
      const combat = Number.isFinite(pressure) && pressure >= 2;
      this.silentTime = pressure === 0 ? this.silentTime + delta : 0;
      this.guardianTime = guardian && combat ? this.guardianTime + delta : 0;
      if (!combat) {
        this.pressureTime = 0; this.quietTime += delta;
        if (this._pending?.kind === 'combat') this._interrupt();
        if (this.quietTime >= QUIET_HOLD) {
          if (this._active?.kind === 'combat') this._interrupt();
          this.armed = true;
        }
      } else {
        this.quietTime = 0;
        if (this.time >= this.graceUntil && this.time >= this.suppressedUntil) this.pressureTime += Math.min(delta, this.time - Math.max(this.graceUntil, this.suppressedUntil));
        else this.pressureTime = 0;
        if (this.pressureTime >= PRESSURE_HOLD) this.hadCombat = true;
      }
      // Ambient music yields even to a single local threat and cannot follow us
      // out of its authored space. Quiet is never a promise that a room is safe.
      for (const cue of [this._pending, this._active]) {
        if (cue?.kind === 'ambient' && (pressure !== 0 || cue.zoneKey !== this._zoneKey(scene))) this._interrupt();
      }
      this._observeMoment(scene, false);
      if (pressure !== 0) this._moment = null;
      if (this._pending && !this._readyContext()) this._interrupt();
      if (this._active) {
        if (this.context?.state !== 'running') this._interrupt();
        else if (this._active.ducked !== (this.time < this.duckUntil)) this._setLevel(.3);
      }
      if (!this.enabled || !this.volume || this._pending || this._active || this._sources.size) return;
      if (this.time < this.graceUntil || this.time < this.suppressedUntil || this.time < this.cooldownUntil) return;
      if (!this._readyContext() || typeof this.fetcher !== 'function') return;
      if (combat && this.armed && this.pressureTime >= Math.max(PRESSURE_HOLD, scene.hold || 0)) {
        // Let the guardian's first visible attack cycles speak for themselves.
        if (guardian && this.guardianTime < 12) return;
        const pool = guardian ? ['weight-of-stone', ...(scene.pool || [])] : (scene.pool || ['containment-pulse']);
        this._moment = null;
        this._requestCue(chooseCue(pool, this.recent));
      } else if (this._moment && pressure === 0 && this.silentTime >= 12 && this.time - this._moment.at >= 12) {
        const id = this._moment.id; this._moment = null;
        this._requestCue(id);
      }
    } catch (_) { this._interrupt(); }
  }

  _zoneKey(scene) { return `${scene.mission || ''}:${scene.zone || ''}`; }

  _observeMoment(scene, blocked) {
    const id = scene.ambient, key = `${scene.mission || ''}:${id}`;
    if (this._moment && (this._moment.zoneKey !== this._zoneKey(scene) || this.time > this._moment.until)) this._moment = null;
    if (!id || this.seenMoments.has(key)) return;
    // A return to a hub is only a relief moment after a real local encounter.
    if (id === 'spare-air' && !this.hadCombat) return;
    if (id === 'the-room-replies' && !this.seenMoments.has('hollow-19:below-the-carrier')) return;
    this.seenMoments.add(key);
    if (blocked || !this.enabled || !this.volume || this._pending || this._active || this.time < this.cooldownUntil) return;
    if (CUES_BY_ID.get(id)?.kind !== 'ambient') return;
    this._moment = {id, zoneKey:this._zoneKey(scene), at:this.time, until:this.time + 26};
  }

  _readyContext() {
    return this.context?.state === 'running' && this.output && typeof this.context.createBufferSource === 'function' && typeof this.context.createGain === 'function' && typeof this.context.decodeAudioData === 'function';
  }

  _currentRequest(request) {
    return this._pending === request && request.generation === this._generation && request.context === this.context && this.playing && this.enabled && this.volume > 0 && this._readyContext() && (request.kind === 'combat' ? this.quietTime === 0 : this.silentTime >= 12 && request.zoneKey === this._zoneKey(this._scene));
  }

  // Loading and permission to play are separate. A missed fight can leave a
  // useful cached buffer, but can never leave a delayed musical surprise.
  prepare(id = 'containment-pulse') {
    const definition = CUES_BY_ID.get(id), context = this.context;
    if (this._buffers.has(id)) return Promise.resolve(this._buffers.get(id));
    if (this._loads.has(id)) return this._loads.get(id);
    if (!definition || !context || typeof this.fetcher !== 'function' || this._loads.size >= 2) return Promise.reject(new Error('Music unavailable'));
    const loading = Promise.resolve().then(async () => {
      const response = await this.fetcher(definition.url, {credentials:'same-origin',mode:'same-origin'});
      if (!response?.ok) throw new Error('Music unavailable');
      const bytes = await response.arrayBuffer();
      if (context !== this.context) throw new Error('Audio changed');
      const buffer = await context.decodeAudioData(bytes);
      if (context !== this.context || !buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid music');
      this._buffers.delete(id); this._buffers.set(id,buffer);
      while (this._buffers.size > 2) this._buffers.delete(this._buffers.keys().next().value);
      return buffer;
    }).finally(() => { if (this._loads.get(id) === loading) this._loads.delete(id); });
    this._loads.set(id,loading);
    return loading;
  }

  _requestCue(id = 'containment-pulse') {
    const definition = CUES_BY_ID.get(id);
    if (!definition) return;
    const request = { id, kind:definition.kind, cooldown:definition.cooldown, zoneKey:this._zoneKey(this._scene), generation: ++this._generation, context: this.context };
    this.armed = false; this.pressureTime = 0; this._pending = request;
    Promise.resolve().then(async () => {
      if (!this._currentRequest(request)) return;
      const buffer = await this.prepare(id);
      if (!this._currentRequest(request)) return;
      this._pending = null;
      this._start(buffer, request);
    }).catch(() => {
      if (this._pending === request) {
        this._pending = null; this.cooldownUntil = Math.max(this.cooldownUntil, this.time + COOLDOWN);
      }
    });
  }

  _start(buffer, request = {id:'containment-pulse',kind:'combat',cooldown:COOLDOWN}) {
    let source = null, gain = null, cue = null;
    try {
      const c = this.context, at = c.currentTime;
      source = c.createBufferSource(); gain = c.createGain();
      source.buffer = buffer; source.loop = false; gain.gain.setValueAtTime(0, at);
      source.connect(gain); gain.connect(this.output);
      cue = { id:request.id, kind:request.kind, cooldown:request.cooldown, zoneKey:request.zoneKey, source, gain, ducked: this.time < this.duckUntil, stopped: false };
      this._active = cue; this._sources.add(cue);
      source.onended = () => {
        this._sources.delete(cue);
        if (this._active === cue) this._active = null;
        this.cooldownUntil = Math.max(this.cooldownUntil, this.time + cue.cooldown);
        try { source.disconnect(); gain.disconnect(); } catch (_) { /* Optional audio cleanup. */ }
      };
      gain.gain.linearRampToValueAtTime(this.volume * (cue.ducked ? .25 : 1), at + .8);
      source.start(at); source.stop(at + Math.min(buffer.duration, MAX_CUE_SECONDS));
      this.recent.push(request.id); this.recent = this.recent.slice(-2);
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
    const cue = this._active; this._active = null;
    if (pending || cue) this.armed = false;
    // A download that never became audible has not spent the music budget.
    if (cue) this.cooldownUntil = Math.max(this.cooldownUntil, this.time + cue.cooldown);
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
