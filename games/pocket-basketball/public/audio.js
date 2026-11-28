import { bindAudioActivation, playbackSession } from './vendor/device-audio.js';
import { AUDIO_SAMPLE_RATE, THEME_BPM, createThemePCM, createCrowdBedPCM, createCrowdReactionPCM } from './audio-score.js';

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const DEFAULT_AUDIO_MIX = Object.freeze({ music: .55, crowd: .65, effects: .8 });
export function normalizeAudioMix(value) {
  return Object.fromEntries(Object.entries(DEFAULT_AUDIO_MIX).map(([key, fallback]) => {
    const level = value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined;
    return [key, typeof level === 'number' && Number.isFinite(level) ? clamp(level, 0, 1) : fallback];
  }));
}

/** Original buffered broadcast music, voiced crowds and synthesized court FX.
 * Playback is gesture-activated and driven by the existing animation loop. */
export class HoopsAudio {
  constructor() {
    this.enabled = false; this.paused = false; this.scene = 'game'; this.ctx = null;
    this.mix = { ...DEFAULT_AUDIO_MIX };
    this._lastGesture = -Infinity; this._sources = new Set(); this._sourceInfo = new Map();
    this._lastEvent = new Map(); this._buffers = new Map(); this._lastGame = null;
    this._dribbleTimer = 0; this._squeakTimer = 0;
    this._musicLoop = null; this._crowdBed = null; this._bedLevel = null;
    this._reactionUntil = 0; this._reactionPriority = 0; this._lastReaction = null;
    this._pendingCue = null; this._lastShot = null;
    const doc = globalThis.document;
    if (doc?.addEventListener) {
      const rememberGesture = event => { if (event.isTrusted !== false && !doc.hidden) this._lastGesture = clock(); };
      for (const name of ['pointerdown', 'touchend', 'keydown'])
        doc.addEventListener(name, rememberGesture, { capture: true, passive: true });
      bindAudioActivation(() => this.unlock(), { enabled: () => this.enabled && !this.paused && this.scene !== 'silent' });
      doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) this._silence();
        else if (this.enabled && !this.paused && this.ctx) this.unlock();
      });
      globalThis.window?.addEventListener('pagehide', () => this._silence());
    }
  }

  setEnabled(value) { this.enabled = !!value; if (this.enabled) this.unlock(); else this._silence(); }
  setMix(value) {
    this.mix = normalizeAudioMix({ ...this.mix, ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) });
    for (const [bus, tags] of Object.entries({ music: ['music-loop', 'music-cue'], crowd: ['crowd-bed', 'reaction'], effects: ['effects'] }))
      if (this.mix[bus] === 0) for (const tag of tags) this._stopSources(tag);
    this._applyMix(); this._syncScene(); return { ...this.mix };
  }
  setScene(scene) {
    if (!['menu', 'game', 'silent'].includes(scene)) return false;
    if (scene !== this.scene) {
      this.scene = scene; this._stopSources(); this._pendingCue = null;
      this._lastEvent.clear(); this._lastShot = null; this._lastReaction = null;
      this._reactionUntil = 0; this._dribbleTimer = 0; this._squeakTimer = 0;
    }
    if (scene === 'silent') this._silence();
    else { this._applyMix(); this._syncScene(); }
    return true;
  }

  unlock() {
    if (!this.enabled || this.paused || this.scene === 'silent' || globalThis.document?.hidden) return false;
    if (!this.ctx) {
      const gesture = globalThis.navigator?.userActivation?.isActive || clock() - this._lastGesture < 700;
      if (!gesture) return false;
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return false;
      try {
        playbackSession(); this.ctx = new Audio({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain(); this.master.gain.value = .38;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -16; compressor.knee.value = 16; compressor.ratio.value = 3;
        compressor.attack.value = .004; compressor.release.value = .18;
        this.master.connect(compressor); compressor.connect(this.ctx.destination);
        this.buses = {};
        for (const name of ['music', 'crowd', 'effects']) {
          this.buses[name] = this.ctx.createGain(); this.buses[name].connect(this.master);
        }
        this._noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const noise = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
      } catch { this.ctx = null; return false; }
    }
    playbackSession();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(.38, this.ctx.currentTime, .025);
    this._applyMix();
    const resumed = this.ctx.resume?.();
    resumed?.then?.(() => this._syncScene()).catch?.(() => {});
    this._syncScene(); return true;
  }
  _ready() {
    return this.enabled && !this.paused && this.scene !== 'silent' && !globalThis.document?.hidden && this.ctx?.state === 'running';
  }
  _applyMix(game = this._lastGame) {
    if (!this.buses || !this.ctx) return;
    const music = this.scene === 'menu' ? .75 : game?.phase === 'live' ? .32 : .5;
    for (const key of ['music', 'crowd', 'effects']) {
      const gain = this.buses[key].gain, value = this.mix[key] * (key === 'music' ? music : 1);
      gain.cancelScheduledValues(this.ctx.currentTime); gain.setTargetAtTime(value, this.ctx.currentTime, .04);
    }
  }

  _track(source, nodes, tag = 'effects', gain = null) {
    this._sources.add(source); this._sourceInfo.set(source, { nodes, tag, gain });
    source.onended = () => {
      this._sources.delete(source); this._sourceInfo.delete(source);
      if (this._musicLoop === source) this._musicLoop = null;
      if (this._crowdBed === source) { this._crowdBed = null; this._bedLevel = null; }
      source.onended = null;
      for (const node of [source, ...nodes]) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
    };
    return source;
  }
  _stopSources(tag = null, fade = 0) {
    for (const source of [...this._sources]) {
      const info = this._sourceInfo.get(source);
      if (tag && info?.tag !== tag) continue;
      if (this._musicLoop === source) this._musicLoop = null;
      if (this._crowdBed === source) { this._crowdBed = null; this._bedLevel = null; }
      try {
        if (fade && info?.gain && this.ctx) {
          info.gain.gain.cancelScheduledValues(this.ctx.currentTime);
          info.gain.gain.setTargetAtTime(.0001, this.ctx.currentTime, fade / 3);
          source.stop(this.ctx.currentTime + fade);
        } else { source.stop(); source.onended?.(); }
      } catch { source.onended?.(); }
    }
  }
  _buffer(name) {
    if (this._buffers.has(name)) return this._buffers.get(name);
    if (!this.ctx?.createBuffer) return null;
    const pcm = name === 'theme' ? createThemePCM() : name === 'bed' ? createCrowdBedPCM() : createCrowdReactionPCM(name);
    const buffer = this.ctx.createBuffer(1, pcm.length, AUDIO_SAMPLE_RATE);
    buffer.getChannelData(0).set(pcm); this._buffers.set(name, buffer); return buffer;
  }
  _playBuffer(name, { volume = 1, loop = false, tag = 'reaction', bus = 'crowd', offset = 0, duration } = {}) {
    if (!this._ready() || !this.buses || this.mix[bus] <= 0) return null;
    const buffer = this._buffer(name); if (!buffer) return null;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), now = this.ctx.currentTime;
    source.buffer = buffer; source.loop = loop;
    const length = duration ?? buffer.duration;
    gain.gain.setValueAtTime(.0001, now); gain.gain.linearRampToValueAtTime(volume, now + (loop ? .45 : .025));
    if (!loop) {
      gain.gain.setValueAtTime(volume, now + Math.max(.03, length - .14));
      gain.gain.linearRampToValueAtTime(.0001, now + length);
    }
    source.connect(gain); gain.connect(this.buses[bus]); this._track(source, [gain], tag, gain);
    source.start(now, offset); if (!loop) source.stop(now + length + .02);
    return source;
  }
  _syncScene() {
    // A buffer-backed scene starts only after genuine context activation.
    if (!this._ready() || !this._noiseBuffer || !this.buses) return;
    if (this.scene === 'menu') {
      if (this.mix.music > 0 && !this._musicLoop)
        this._musicLoop = this._playBuffer('theme', { volume: 1, loop: true, tag: 'music-loop', bus: 'music' });
      if (this.mix.music <= 0) this._stopSources('music-loop');
      this._stopSources('crowd-bed');
    } else if (this.scene === 'game') {
      if (this.mix.crowd > 0 && !this._crowdBed)
        this._crowdBed = this._playBuffer('bed', { volume: .12, loop: true, tag: 'crowd-bed' });
      if (this.mix.crowd <= 0) this._stopSources('crowd-bed');
      this._stopSources('music-loop');
    }
  }
  _rememberGame(game) {
    if (!game || game === this._lastGame) return;
    this._lastGame = game; this._lastEvent.clear(); this._lastShot = null;
    this._lastReaction = null; this._reactionUntil = 0; this._pendingCue = null;
    this._dribbleTimer = 0; this._squeakTimer = 0;
    this._stopSources('music-cue'); this._stopSources('reaction');
  }
  _cue(name) {
    if (!this._ready() || this.mix.music <= 0) return false;
    const now = this.ctx.currentTime, key = `cue:${name}`;
    if (now - (this._lastEvent.get(key) ?? -100) < 1.5) return false;
    this._lastEvent.set(key, now); this._stopSources('music-cue', .035);
    const beat = 60 / THEME_BPM;
    const settings = name === 'tip' ? { offset: 0, duration: beat * 8 }
      : ['halftime', 'finished'].includes(name) ? { offset: beat * 30, duration: .92 }
        : { offset: beat * ({ half: 16, overtime: 24, timeout: 8 }[name] ?? 16), duration: beat * 3.5 };
    return !!this._playBuffer('theme', { ...settings, volume: .9, tag: 'music-cue', bus: 'music' });
  }
  _react(kind, intensity = 1, priority = 2) {
    if (!this._ready() || this.mix.crowd <= 0) return false;
    const now = this.ctx.currentTime, key = `reaction:${kind}`;
    const cooldown = { ooh: 1.3, ah: 1.45, boo: 9, cheer: 1.2 }[kind];
    if (cooldown === undefined || now - (this._lastEvent.get(key) ?? -100) < cooldown
      || (now < this._reactionUntil && priority < this._reactionPriority)) return false;
    this._lastEvent.set(key, now); this._reactionPriority = priority; this._reactionUntil = now + .65;
    this._stopSources('reaction', .05);
    const volume = { ooh: .35, ah: .35, boo: .35, cheer: .39 }[kind] * clamp(intensity, .25, 1.4);
    const source = this._playBuffer(kind, { volume, tag: 'reaction' });
    if (source) this._lastReaction = { kind, intensity, at: now };
    return !!source;
  }
  _reactionFor(event, game, name) {
    const team = event && typeof event === 'object' ? event.team : undefined;
    const home = team === 0;
    if (name === 'shot') {
      this._lastShot = { team, type: event.shotType, playerId: event.playerId, at: this.ctx.currentTime };
      if (['dunk', 'alley-oop'].includes(event.shotType)) this._react('ooh', .7, 1);
    } else if (name === 'pass' && event.style === 'lob') this._react('ooh', .65, 1);
    else if (['score', 'net', 'made', 'basket', 'shot_made', 'shotMade'].includes(name)) {
      const highlight = ['dunk', 'alley-oop'].includes(event?.shotType), three = event?.points === 3;
      this._react(team === 1 ? 'ah' : 'cheer', team === 1 ? .8 : highlight ? 1.35 : three ? 1.2 : event?.points === 1 ? .55 : 1, 4);
    } else if (['miss', 'freeThrowMiss', 'shot_missed', 'shotMissed', 'passMiss'].includes(name)) {
      const dramatic = this._lastShot?.team === team && this._lastShot.playerId === event?.playerId && this.ctx.currentTime - this._lastShot.at < 4
        && ['dunk', 'alley-oop'].includes(this._lastShot.type);
      this._react(team === 1 ? 'cheer' : 'ah', name === 'freeThrowMiss' || name === 'passMiss' ? .55 : dramatic ? 1 : .75, 2);
    } else if (name === 'foul' && team === 1) {
      // Engine foul.team is the awarded/victim team: this is a call against home.
      this._react('boo', .9, 3);
    } else if (name === 'block' || name === 'steal') this._react(home ? 'cheer' : 'ooh', name === 'block' ? 1 : .8, 3);
    else if (name === 'turnover') this._react(home ? 'cheer' : 'ah', .65, 2);
    else if (name === 'finished') this._react(home ? 'cheer' : 'ah', home ? 1.4 : 1, 5);
    else if (name === 'crowd') this._react('cheer', 1, 2);
    // Out-of-bounds alone does not prove a change of possession, so it stays neutral.
  }

  _tone(frequency, duration, volume, type = 'sine', end = frequency, delay = 0) {
    if (!this._ready() || this.mix.effects <= 0) return;
    const time = this.ctx.currentTime + delay, oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), time + duration);
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + Math.min(.012, duration / 5));
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(this.buses.effects); this._track(oscillator, [gain]);
    oscillator.start(time); oscillator.stop(time + duration + .025);
  }
  _noise(duration, volume, frequency, type = 'bandpass', delay = 0, attack = .012) {
    if (!this._ready() || this.mix.effects <= 0) return;
    const time = this.ctx.currentTime + delay, source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this._noiseBuffer; filter.type = type; filter.frequency.value = frequency;
    filter.Q.value = type === 'bandpass' ? .7 : .3;
    gain.gain.setValueAtTime(.0001, time); gain.gain.linearRampToValueAtTime(volume, time + Math.min(attack, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.buses.effects); this._track(source, [filter, gain]);
    source.start(time, Math.random() * Math.max(0, 1.8 - duration)); source.stop(time + duration + .025);
  }
  event(event, game) {
    this._rememberGame(game);
    const name = typeof event === 'string' ? event : event?.type || event?.name;
    const cue = ['tip', 'half', 'overtime', 'timeout', 'halftime', 'finished'].includes(name);
    if (!this._ready() || this.scene !== 'game') {
      // A trusted restart may still be completing resume(). Only a fresh cue
      // can wait one frame; paused/hidden events and old scores are never queued.
      if (['tip', 'half', 'overtime', 'timeout'].includes(name) && this.enabled && !this.paused
        && this.scene === 'game' && !globalThis.document?.hidden)
        this._pendingCue = { name, game, expires: clock() + 1200 };
      return false;
    }
    this._reactionFor(event, game, name); if (cue) this._cue(name);
    const aliases = { made: 'net', score: 'net', basket: 'net', shot_made: 'net', shotMade: 'net',
      miss: 'rim', shot_missed: 'rim', shotMissed: 'rim', foul: 'whistle', violation: 'whistle',
      halftime: 'buzzer', final: 'buzzer', finished: 'buzzer', gameover: 'buzzer',
      freeThrowMiss: 'rim', turnover: 'steal', rebound: 'catch' };
    const kind = aliases[name] || name;
    const cooldowns = { dribble: .23, squeak: .27, net: .2, rim: .16, whistle: .4, buzzer: .8,
      pass: .12, catch: .12, steal: .2, block: .2 };
    if (!(kind in cooldowns)) return cue;
    const now = this.ctx.currentTime;
    if (now - (this._lastEvent.get(kind) ?? -100) < cooldowns[kind]) return false;
    this._lastEvent.set(kind, now);
    switch (kind) {
      case 'dribble':
        this._tone(105 + Math.random() * 18, .14, .19, 'sine', 48); this._noise(.065, .07, 360, 'lowpass'); break;
      case 'squeak':
        this._tone(740 + Math.random() * 280, .11, .035, 'sine', 1600); this._tone(1750, .075, .014, 'triangle', 1100, .025); break;
      case 'net':
        this._noise(.21, .19, 2800, 'highpass'); this._tone(210, .07, .07, 'sine', 120, .045); break;
      case 'rim':
        this._tone(720, .22, .13, 'triangle', 620); this._tone(1320, .1, .06, 'sine', 1150); this._noise(.055, .05, 1700); break;
      case 'whistle':
        this._tone(2340, .22, .09, 'sine', 2260); this._tone(2650, .19, .035, 'sine', 2500, .025); break;
      case 'buzzer':
        this._tone(168, .6, .1, 'sawtooth', 166); this._tone(232, .58, .055, 'triangle', 230); break;
      case 'pass': this._noise(.085, .045, 1400); break;
      case 'catch': case 'steal': case 'block':
        this._noise(.07, kind === 'block' ? .13 : .07, 900, 'lowpass'); this._tone(180, .075, .07, 'sine', 95); break;
    }
    return true;
  }

  update(dt, game) {
    this._rememberGame(game);
    if (!this._ready()) return;
    this._syncScene();
    if (this.scene !== 'game') return;
    if (this._pendingCue) {
      const pending = this._pendingCue; this._pendingCue = null;
      if ((!pending.game || pending.game === game) && clock() <= pending.expires) this._cue(pending.name);
    }
    const phase = game?.phase ?? game?.state, live = ['live', 'play', 'playing'].includes(phase);
    if (phase !== this._lastMixPhase) { this._lastMixPhase = phase; this._applyMix(game); }
    const closeGame = game?.period >= 2 && !game.practice && Number.isFinite(game.clock) && game.clock < 30
      && Array.isArray(game.score) && Math.abs(game.score[0] - game.score[1]) <= 6;
    const bedLevel = closeGame && live ? .145 : phase === 'freeThrow' ? .09 : .12;
    const bedGain = this._sourceInfo.get(this._crowdBed)?.gain;
    if (bedGain && this._bedLevel !== bedLevel) {
      bedGain.gain.cancelScheduledValues(this.ctx.currentTime);
      bedGain.gain.setTargetAtTime(bedLevel, this.ctx.currentTime, 1.2); this._bedLevel = bedLevel;
    }
    if (!live) { this._dribbleTimer = 0; return; }
    const step = clamp(Number(dt) || 0, 0, .1);
    this._dribbleTimer -= step; this._squeakTimer -= step;
    const ball = game?.ball;
    const owner = ball && 'owner' in ball ? ball.owner
      : ball?.holder ?? ball?.carrier ?? (typeof game?.carrier === 'function' ? null : game?.carrier);
    if (owner !== null && owner !== undefined && this._dribbleTimer <= 0) {
      this.event('dribble'); this._dribbleTimer = .43 + Math.random() * .07;
    }
    if (this._squeakTimer <= 0) { this.event('squeak'); this._squeakTimer = 1.7 + Math.random() * 2.8; }
  }
  _silence() {
    this._dribbleTimer = 0; this._squeakTimer = 1; this._lastEvent.clear();
    this._pendingCue = null; this._lastReaction = null; this._lastShot = null; this._reactionUntil = 0;
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this._stopSources(); this.ctx.suspend?.().catch?.(() => {});
  }
  pause() { this.paused = true; this._silence(); }
  resume() { this.paused = false; if (this.enabled) this.unlock(); }
  diagnostics() {
    return { enabled: this.enabled, paused: this.paused, scene: this.scene,
      contextState: this.ctx?.state || 'not-created', activeSources: this._sources.size,
      mix: { ...this.mix }, musicActive: !!this._musicLoop || [...this._sourceInfo.values()].some(s => s.tag === 'music-cue'),
      crowdActive: !!this._crowdBed, lastReaction: this._lastReaction ? { ...this._lastReaction } : null };
  }
}
