// Field audio: CC0 recordings where available, with bounded procedural fallbacks.
// Source attribution and editing notes are in audio/CREDITS.txt.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SAMPLE_FILES = { rifle: 'rifle-shot.mp3', hostile: 'hostile-shot.mp3', rotor: 'rotor-loop.mp3', wind: 'wind.mp3' };

export class GameAudio {
  constructor() {
    this.enabled = true; this.context = null; this.master = null; this.noise = null;
    this.voices = new Set(); this.loops = new Map(); this.samples = new Map(); this.sampleStatus = {};
    this.unavailable = false; this.lastState = null; this.lastPlayerId = null; this.lastHealth = null;
    this.lastEventId = 0; this.seenEffects = new WeakSet(); this.effectIds = new Set();
    this.lastShots = 0; this.lastRadio = null; this.shotBudget = 8;
    this.footTravel = new Map(); this.vehiclePositions = new Map(); this.diagnosticTime = 0;
  }

  async unlock() {
    if (this.unavailable) return false;
    try {
      if (!this.context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) { this.unavailable = true; return false; }
        const context = this.context = new AudioContextClass({ latencyHint: 'interactive' });
        this.master = context.createGain(); this.master.gain.value = this.enabled ? .44 : 0;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 10;
        limiter.attack.value = .002; limiter.release.value = .16;
        this.master.connect(limiter); limiter.connect(context.destination);
        this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const noise = this.noise.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
        this._makeReflections(); this._makeEngine();
        void this._loadSamples();
      }
      if (this.context.state !== 'running' && this.context.state !== 'closed') await this.context.resume();
      this._diagnostics(); return this.context.state === 'running';
    } catch { this._diagnostics(); return false; }
  }

  async _loadSamples() {
    await Promise.all(Object.entries(SAMPLE_FILES).map(async ([key, file]) => {
      this.sampleStatus[key] = 'loading'; this._diagnostics();
      try {
        const response = await fetch(new URL(`./audio/${file}`, import.meta.url));
        if (!response.ok) throw new Error('Audio asset unavailable');
        const bytes = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(bytes);
        if (!buffer.length || !Number.isFinite(buffer.duration)) throw new Error('Invalid audio');
        this.samples.set(key, buffer); this.sampleStatus[key] = 'ready';
      } catch { this.sampleStatus[key] = 'fallback'; }
      this._diagnostics();
    }));
  }

  _diagnostics() {
    if (!globalThis.document?.documentElement) return;
    const data = document.documentElement.dataset;
    data.audioContext = this.context?.state || (this.unavailable ? 'unavailable' : 'locked');
    data.audioSamples = Object.keys(SAMPLE_FILES).map(k => `${k}:${this.sampleStatus[k] || 'pending'}`).join(',');
    data.audioVoices = String(this.voices.size);
    data.audioLoops = String(this.loops.size);
  }

  _makeReflections() {
    const c = this.context, length = Math.floor(c.sampleRate * .48), impulse = c.createBuffer(2, length, c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / c.sampleRate;
        data[i] = t < .037 ? 0 : (Math.random() * 2 - 1) * Math.exp(-t * 13) * .13;
      }
      for (const [time, level] of [[.047, .21], [.081, .13], [.133, .07]]) {
        const at = Math.floor((time + channel * .006) * c.sampleRate);
        for (let i = 0; i < 25; i++) data[at + i] += level * (1 - i / 25) * (i % 2 ? -.5 : 1);
      }
    }
    this.reverbInput = c.createGain(); this.reverbInput.gain.value = 1;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2400;
    const convolver = c.createConvolver(); convolver.buffer = impulse;
    this.reverbReturn = c.createGain(); this.reverbReturn.gain.value = 0;
    this.reverbInput.connect(filter); filter.connect(convolver); convolver.connect(this.reverbReturn); this.reverbReturn.connect(this.master);
  }

  _makeEngine() {
    const c = this.context, length = c.sampleRate * 2;
    this.engine = c.createBuffer(1, length, c.sampleRate);
    const data = this.engine.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate;
      data[i] = Math.sin(t * Math.PI * 2 * 48) * .3 + Math.sin(t * Math.PI * 2 * 96) * .13
        + Math.sin(t * Math.PI * 2 * 144) * .06 + (Math.random() * 2 - 1) * .045;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now); this.master.gain.setTargetAtTime(this.enabled ? .44 : 0, now, .018);
    if (!this.enabled) this.stop();
  }

  _ready() { return Boolean(this.enabled && this.context?.state === 'running'); }

  _voice({ buffer = null, duration = .1, gain = .08, frequency = 0, endFrequency,
    lowpass = 6500, highpass = 60, pan = 0, delay = 0, attack = .0015,
    rate = 1, wet = 0, priority = 0 } = {}) {
    if (!this._ready()) return;
    if (this.voices.size >= 32) {
      const victim = [...this.voices].find(v => v.priority < priority);
      if (!victim) return;
      const now = this.context.currentTime;
      victim.envelope.gain.cancelScheduledValues(now); victim.envelope.gain.setTargetAtTime(0, now, .0015);
      try { victim.source.stop(now + .008); } catch {}
      this.voices.delete(victim);
    }
    const c = this.context, start = c.currentTime + delay;
    const sample = Boolean(buffer); duration = Math.max(.015, sample ? Math.min(duration, buffer.duration / rate) : duration);
    gain = clamp(gain, 0, .55);
    const source = frequency ? c.createOscillator() : c.createBufferSource();
    const envelope = c.createGain(), low = c.createBiquadFilter(), high = c.createBiquadFilter();
    low.type = 'lowpass'; low.frequency.value = lowpass; low.Q.value = .55;
    high.type = 'highpass'; high.frequency.value = highpass; high.Q.value = .55;
    if (frequency) {
      source.type = 'sine'; source.frequency.setValueAtTime(frequency, start);
      if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    } else { source.buffer = buffer || this.noise; source.playbackRate.value = rate; }
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(gain, start + attack);
    if (sample) { envelope.gain.setValueAtTime(gain, start + Math.max(attack, duration - .035)); envelope.gain.linearRampToValueAtTime(0, start + duration); }
    else envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(high); high.connect(low); low.connect(envelope);
    let panner = null;
    if (c.createStereoPanner) { panner = c.createStereoPanner(); panner.pan.value = clamp(pan, -.9, .9); envelope.connect(panner); }
    const output = panner || envelope; output.connect(this.master);
    let send = null;
    if (wet && this.reverbInput) { send = c.createGain(); send.gain.value = wet; output.connect(send); send.connect(this.reverbInput); }
    const voice = { source, envelope, priority, nodes: [source, envelope, low, high, panner, send] };
    this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); for (const n of voice.nodes) if (n) { try { n.disconnect(); } catch {} } };
    if (frequency || sample) source.start(start); else source.start(start, Math.random() * .8);
    source.stop(start + duration + .015);
  }

  _loop(key, buffer, { gain = 0, lowpass = 1000, highpass = 40, pan = 0, rate = 1 } = {}) {
    if (!this._ready() || !buffer) return;
    let loop = this.loops.get(key);
    if (loop && loop.buffer !== buffer) { this._stopLoop(key); loop = null; }
    const c = this.context;
    if (!loop) {
      const source = c.createBufferSource(), volume = c.createGain(), low = c.createBiquadFilter(), high = c.createBiquadFilter();
      source.buffer = buffer; source.loop = true; source.playbackRate.value = rate;
      low.type = 'lowpass'; low.frequency.value = lowpass; high.type = 'highpass'; high.frequency.value = highpass;
      volume.gain.value = 0; source.connect(high); high.connect(low); low.connect(volume);
      let panner = null;
      if (c.createStereoPanner) { panner = c.createStereoPanner(); volume.connect(panner); panner.connect(this.master); }
      else volume.connect(this.master);
      loop = { buffer, source, volume, low, high, panner }; this.loops.set(key, loop);
      source.onended = () => { for (const node of [source, volume, low, high, panner]) if (node) { try { node.disconnect(); } catch {} } };
      source.start();
    }
    const now = c.currentTime;
    loop.volume.gain.setTargetAtTime(clamp(gain, 0, .15), now, .18);
    loop.low.frequency.setTargetAtTime(lowpass, now, .15);
    loop.source.playbackRate.setTargetAtTime(rate, now, .2);
    loop.panner?.pan.setTargetAtTime(clamp(pan, -.85, .85), now, .14);
  }

  _stopLoop(key) {
    const loop = this.loops.get(key); if (!loop) return;
    this.loops.delete(key); const now = this.context?.currentTime || 0;
    loop.volume.gain.cancelScheduledValues(now); loop.volume.gain.setTargetAtTime(0, now, .025);
    try { loop.source.stop(now + .13); } catch {}
  }

  _spatial(event, player) {
    const d = distance({ x: event.x ?? player.x, y: event.y ?? player.y }, player);
    return { d, gain: 1 / (1 + (d / 165) ** 1.25), pan: ((event.x ?? player.x) - player.x) / 390,
      lowpass: clamp(9000 / (1 + d / 155), 950, 9000) };
  }

  _shot(event, player) {
    if (!player) return;
    const spatial = this._spatial(event, player), own = event.actorId === player.id;
    if (spatial.d > 1200 || !own && this.shotBudget < 1) return;
    this.shotBudget = Math.max(0, this.shotBudget - 1);
    const weapon = event.weapon || (event.team === 'enemy' ? 'hostile' : 'rifle');
    const sample = this.samples.get(weapon === 'hostile' ? 'hostile' : 'rifle');
    const gain = own ? 1 : spatial.gain;
    const pan = own ? 0 : spatial.pan;
    const rate = (weapon === 'support' ? .91 : 1) * (.975 + Math.random() * .05);
    const priority = own ? 3 : event.team === 'squad' ? 2 : 1;
    const reportGain = own ? .46 : weapon === 'hostile' ? .47 : .36;
    if (sample) this._voice({ buffer: sample, duration: sample.duration / rate, gain: reportGain * gain,
      rate, highpass: 48, lowpass: own ? 10000 : spatial.lowpass, pan, wet: .12, priority });
    else {
      this._voice({ duration: weapon === 'hostile' ? .12 : .075, gain: .3 * gain, highpass: 650,
        lowpass: own ? 8500 : spatial.lowpass, pan, wet: .18, priority });
      this._voice({ duration: .16, gain: .2 * gain, highpass: 45, lowpass: weapon === 'hostile' ? 650 : 1100, pan, priority });
      this._voice({ duration: .085, gain: .075 * gain, frequency: weapon === 'support' ? 125 : 155, endFrequency: 52, highpass: 35, lowpass: 500, pan, priority });
    }
    if (own) this._voice({ duration: .045, gain: .027, highpass: 1800, lowpass: 5100, delay: .045, priority: 2 });
  }

  _event(event, player) {
    if (!player) return;
    if (event.type === 'shot') { this._shot(event, player); return; }
    const s = this._spatial(event, player); if (s.d > 500) return;
    const own = event.actorId === player.id, gain = own ? 1 : s.gain * .65;
    if (event.type === 'reload_start') {
      this._voice({ duration: .06, gain: .09 * gain, highpass: 650, lowpass: 3200, pan: s.pan, priority: own ? 2 : 0 });
      this._voice({ duration: .15, gain: .065 * gain, highpass: 300, lowpass: 1800, delay: .19, pan: s.pan });
      this._voice({ duration: .05, gain: .055 * gain, highpass: 950, lowpass: 3700, delay: .43, pan: s.pan });
    } else if (event.type === 'reload_end') {
      this._voice({ duration: .075, gain: .1 * gain, highpass: 500, lowpass: 4200, pan: s.pan, priority: own ? 2 : 0 });
      this._voice({ duration: .04, gain: .065 * gain, highpass: 1300, lowpass: 5100, delay: .07, pan: s.pan });
    } else if (event.type === 'smoke') {
      this._voice({ duration: .12, gain: .11 * s.gain, highpass: 80, lowpass: 1100, pan: s.pan, wet: .06 });
      this._voice({ duration: 1.2, gain: .035 * s.gain, highpass: 900, lowpass: 4000, delay: .08, pan: s.pan, attack: .07 });
    } else if (event.type === 'impact') {
      this._voice({ duration: event.material === 'concrete' ? .075 : .055, gain: .085 * s.gain,
        highpass: event.material === 'concrete' ? 1100 : 240, lowpass: 4500, pan: s.pan, wet: .04 });
    }
  }

  _radio() {
    this._voice({ duration: .07, gain: .045, highpass: 800, lowpass: 2500 });
    this._voice({ duration: .07, gain: .04, frequency: 920, endFrequency: 850, highpass: 300, lowpass: 1600, delay: .025 });
    this._voice({ duration: .05, gain: .025, highpass: 1200, lowpass: 2400, delay: .1 });
  }
  click() { this._voice({ duration: .035, gain: .035, highpass: 950, lowpass: 2000 }); }

  _movement(state, player, audible) {
    let played = 0;
    for (const actor of state.squad || []) {
      const previous = this.footTravel.get(actor.id);
      const moved = previous ? distance(previous, actor) : 0;
      let travel = (previous?.travel || 0) + (moved < 70 ? moved : 0);
      if (actor.downed || actor.alive === false) travel = 0;
      if (travel > 43) {
        travel %= 43;
        if (audible && played < 2 && distance(actor, player) < 200 && !actor.downed) {
          const road = state.world?.roads?.some(r => actor.x >= r.x && actor.x <= r.x + r.w && actor.y >= r.y && actor.y <= r.y + r.h);
          const s = this._spatial(actor, player), own = actor.id === player.id;
          this._voice({ duration: road ? .065 : .1, gain: (own ? .05 : .025) * s.gain,
            highpass: road ? 110 : 350, lowpass: road ? 1900 : 3100, pan: own ? 0 : s.pan });
          if (own) this._voice({ duration: .035, gain: .015, highpass: 1400, lowpass: 3500, delay: .025 });
          played++;
        }
      }
      this.footTravel.set(actor.id, { x: actor.x, y: actor.y, travel });
    }
  }

  _ambience(state, player, dt) {
    if (!this._ready() || !player) return;
    const wind = this.samples.get('wind');
    const breeze = .83 + Math.sin(state.time * .19) * .12 + Math.sin(state.time * .071) * .05;
    this._loop('wind', wind || this.noise, { gain: (wind ? .035 : .022) * breeze, lowpass: 1600, highpass: 85, rate: wind ? 1 : .7 });
    if (state.missionIndex === 0 && state.time < 20) {
      const rotor = this.samples.get('rotor');
      const pass = Math.sin(Math.PI * clamp(state.time / 20, 0, 1));
      if (rotor) this._loop('rotor', rotor, { gain: .085 * pass, lowpass: 2100, highpass: 45, pan: (state.time / 20 - .5) * 1.6, rate: 1 });
    } else this._stopLoop('rotor');
    const vehicles = (state.vehicles || []).filter(v => v.active && v.kind !== 'helicopter');
    const nearest = vehicles.sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (nearest && distance(nearest, player) < 650) {
      const previous = this.vehiclePositions.get(nearest.id), speed = previous && dt > 0 ? distance(previous, nearest) / dt : 0;
      const s = this._spatial(nearest, player);
      this._loop('engine', this.engine, { gain: .11 * s.gain, lowpass: clamp(700 - s.d, 180, 700), highpass: 35, pan: s.pan, rate: speed > 5 ? 1.08 : .77 });
    } else this._stopLoop('engine');
    for (const v of vehicles) this.vehiclePositions.set(v.id, { x: v.x, y: v.y });
    const density = (state.world?.buildings || []).filter(b => distance({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, player) < 310).length;
    this.reverbReturn?.gain.setTargetAtTime(.13 + Math.min(density, 5) * .035, this.context.currentTime, .3);
  }

  tick(state, dt = 0) {
    if (!state) return;
    const player = state.squad?.find(a => a.id === state.playerId);
    const fresh = state !== this.lastState;
    if (fresh) {
      this.stop(); this.lastState = state; this.lastEventId = 0; this.seenEffects = new WeakSet(); this.effectIds.clear();
      this.footTravel.clear(); this.vehiclePositions.clear(); this.lastShots = 0; this.lastRadio = state.radio?.at(-1)?.id;
      this.shotBudget = 8; this.lastPlayerId = null;
    }
    if (state.playerId !== this.lastPlayerId) { this.lastHealth = player?.hp ?? null; this.lastPlayerId = state.playerId; }
    const seconds = clamp(Number(dt) || 0, 0, .25), shots = Number(state.stats?.shots) || 0;
    this.shotBudget = Math.min(8, this.shotBudget + seconds * 24);
    const playing = state.status === 'playing', audible = playing && this._ready();
    if (audible) this._ambience(state, player, seconds); else if (this.loops.size || this.voices.size) this.stop();
    if (Array.isArray(state.soundEvents)) {
      const events = state.soundEvents.filter(e => Number.isFinite(e.id) && e.id > this.lastEventId);
      for (const event of events) this.lastEventId = Math.max(this.lastEventId, event.id);
      if (audible && player) {
        events.sort((a, b) => Number(b.actorId === player.id) - Number(a.actorId === player.id) || distance(a, player) - distance(b, player));
        for (const event of events) if (state.time - event.time < .3) this._event(event, player);
      }
    } else {
      // Compatibility with older simulations: consume each visual effect once, even while muted.
      let playerMuzzles = 0;
      for (const effect of state.effects || []) {
        if (!effect || typeof effect !== 'object') continue;
        const seen = effect.id != null ? this.effectIds.has(effect.id) : this.seenEffects.has(effect); if (seen) continue;
        if (effect.id != null) this.effectIds.add(effect.id); else this.seenEffects.add(effect);
        if (effect.type === 'muzzle' || effect.type === 'shot') {
          if (player && (effect.actorId === player.id || !effect.actorId && distance(effect, player) < 32)) playerMuzzles++;
          if (audible) this._shot(effect, player);
        } else if (audible && (effect.type === 'hit' || effect.type === 'dust' || effect.type === 'smoke')) {
          this._event({ ...effect, type: effect.type === 'smoke' ? 'smoke' : 'impact', material: effect.type === 'dust' ? 'concrete' : 'body' }, player);
        }
      }
      if (audible && player) for (let i = 0; i < Math.min(2, Math.max(0, shots - this.lastShots - playerMuzzles)); i++) this._shot({ ...player, actorId: player.id, weapon: player.role === 'support' ? 'support' : 'rifle' }, player);
      if (this.effectIds.size > 600) this.effectIds = new Set([...this.effectIds].slice(-300));
    }
    this._movement(state, player || { x: 0, y: 0 }, audible);
    const radio = state.radio?.at(-1), radioId = radio?.id ?? null;
    if (audible && radioId != null && radioId !== this.lastRadio) this._radio();
    if (audible && player && this.lastHealth != null && player.hp < this.lastHealth) {
      this._voice({ duration: .14, gain: .08, frequency: 76, endFrequency: 42, highpass: 20, lowpass: 300, priority: 2 });
      this._voice({ duration: .075, gain: .04, highpass: 300, lowpass: 1800, priority: 2 });
    }
    this.lastShots = shots; this.lastRadio = radioId; this.lastHealth = player?.hp ?? null;
    this.diagnosticTime += seconds;
    if (this.diagnosticTime > .5) { this.diagnosticTime = 0; this._diagnostics(); }
  }

  stop() {
    const now = this.context?.currentTime || 0;
    for (const key of [...this.loops.keys()]) this._stopLoop(key);
    if (this.reverbReturn) { this.reverbReturn.gain.cancelScheduledValues(now); this.reverbReturn.gain.setTargetAtTime(0, now, .015); }
    for (const voice of this.voices) {
      voice.envelope.gain.cancelScheduledValues(now); voice.envelope.gain.setTargetAtTime(0, now, .006);
      try { voice.source.stop(now + .03); } catch {}
    }
    this.voices.clear();
    this._diagnostics();
  }
}
