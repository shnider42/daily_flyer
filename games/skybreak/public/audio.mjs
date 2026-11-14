/** Original procedural sound for SKYBREAK. No network requests or autoplay. */
import { terrainHeight, distanceToRoad, BUILDINGS, PROPS } from './world.mjs';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const MAX_VOICES = 24;
const GUNS = [
  { length: .25, body: 156, end: 61, crack: .051, tail: .11, bass: .57, brightness: .64, gain: .34 },
  { length: .16, body: 205, end: 94, crack: .024, tail: .055, bass: .34, brightness: .82, gain: .24 },
  { length: .53, body: 109, end: 42, crack: .066, tail: .24, bass: .78, brightness: .52, gain: .43 },
  { length: .61, body: 187, end: 47, crack: .035, tail: .29, bass: .70, brightness: .75, gain: .40 },
];

function inside(x, z, item, padding = 0) {
  const dx = x - item.x, dz = z - item.z;
  const c = Math.cos(item.yaw || 0), s = Math.sin(item.yaw || 0);
  return Math.abs(c * dx - s * dz) <= item.w / 2 + padding &&
    Math.abs(s * dx + c * dz) <= item.d / 2 + padding;
}
function surface(player) {
  const ground = terrainHeight(player.x, player.z);
  if (ground < .5) return 'water';
  if (player.y > ground + 1.4) {
    if (PROPS.some(prop => ['container', 'truck', 'car', 'crane'].includes(prop.kind) && inside(player.x, player.z, prop, .3))) return 'metal';
    return 'wood';
  }
  if (BUILDINGS.some(building => inside(player.x, player.z, building))) return 'wood';
  if (ground < 2.2) return 'sand';
  if (distanceToRoad(player.x, player.z) < -.2) return 'stone';
  return 'grass';
}

export class AudioDirector {
  constructor() {
    this.context = null;
    this.volume = .58;
    this.master = null;
    this.effects = null;
    this.compressor = null;
    this.buffers = new Map();
    this.voices = new Set();
    this.ambient = [];
    this.players = new Map();
    this.heard = new Set();
    this.heardShots = new Map();
    this.matchId = null;
    this.snapshot = null;
    this.localId = 0;
    this.listener = null;
    this.disposed = false;
    this.nextBird = 7;
    this.nextStormTone = 0;
    this.lastCombatAt = -100;
    this.lastAmbientAt = -1;
    this._visibility = () => {
      this._applyVolume();
      // Audio stays silent when the phone is backgrounded. A running context
      // is retained so returning does not require a second permission prompt.
      if (typeof document !== 'undefined' && document.hidden) this._stopTransients();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._visibility);
  }

  /** Call from a click/tap/key gesture. Returns false on browsers without audio. */
  async start() {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        try { this.context = new AudioContext({ latencyHint: 'interactive' }); }
        catch { this.context = new AudioContext(); }
        // Request resume while still in the user's gesture, before synthesis.
        const resumed = this.context.resume();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.effects = this.context.createGain();
        this.effects.gain.value = .86;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -15;
        this.compressor.knee.value = 14;
        this.compressor.ratio.value = 3;
        this.compressor.attack.value = .005;
        this.compressor.release.value = .19;
        this.effects.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.context.destination);
        this._buildSounds();
        this._startAmbience();
        await resumed;
      } else if (this.context.state === 'suspended') await this.context.resume();
      this._applyVolume();
      return this.context.state === 'running';
    } catch { return false; }
  }

  setVolume(value) {
    this.volume = clamp(finite(Number(value), this.volume), 0, 1);
    this._applyVolume();
  }
  _applyVolume() {
    if (!this.master || !this.context || this.context.state === 'closed') return;
    const muted = typeof document !== 'undefined' && document.hidden;
    const time = this.context.currentTime;
    this.master.gain.cancelScheduledValues(time);
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, time, .035);
  }

  _buffer(name, seconds, sample, channels = 1) {
    const rate = this.context.sampleRate, length = Math.ceil(seconds * rate);
    const buffer = this.context.createBuffer(channels, length, rate);
    for (let channel = 0; channel < channels; channel++) {
      const out = buffer.getChannelData(channel);
      const state = { low: 0, phase: 0, channel, random: (0x23514 ^ (channel + 1) * 0x48733) >>> 0 };
      const noise = () => {
        state.random ^= state.random << 13; state.random ^= state.random >>> 17; state.random ^= state.random << 5;
        return (state.random >>> 0) / 2147483648 - 1;
      };
      for (let i = 0; i < length; i++) out[i] = clamp(sample(i / rate, state, noise, 1 / rate), -.96, .96);
    }
    this.buffers.set(name, buffer);
    return buffer;
  }

  _buildSounds() {
    GUNS.forEach((gun, index) => {
      this._buffer(`gun${index}`, gun.length, (time, state, noise, dt) => {
        const white = noise(); state.low += (white - state.low) * gun.brightness;
        const frequency = gun.end + (gun.body - gun.end) * Math.exp(-time * 32);
        state.phase += TAU * frequency * dt;
        const attack = Math.min(1, time / .0015);
        const body = Math.sin(state.phase) * Math.exp(-time / (.035 + gun.tail * .48)) * gun.bass;
        const crack = (white - state.low * .3) * Math.exp(-time / gun.crack) * .54;
        const tail = state.low * Math.exp(-time / gun.tail) * .24;
        const metallic = Math.sin(time * TAU * (index === 3 ? 1137 : 670)) * Math.exp(-time * 70) * .09;
        return attack * (body + crack + tail + metallic) * .74;
      });
    });
    const feet = {
      grass: { length: .14, filter: .16, pitch: 96, ring: .03, hiss: .7 },
      sand: { length: .17, filter: .23, pitch: 82, ring: .025, hiss: .76 },
      stone: { length: .13, filter: .68, pitch: 153, ring: .085, hiss: .56 },
      wood: { length: .17, filter: .28, pitch: 125, ring: .18, hiss: .43 },
      metal: { length: .22, filter: .60, pitch: 357, ring: .19, hiss: .44 },
      water: { length: .25, filter: .25, pitch: 215, ring: .05, hiss: .85 },
    };
    for (const [name, foot] of Object.entries(feet)) {
      this._buffer(`foot-${name}`, foot.length, (time, state, noise) => {
        const white = noise(); state.low += (white - state.low) * foot.filter;
        const attack = Math.min(1, time / .004), envelope = Math.exp(-time * (name === 'water' ? 18 : 35));
        const scuff = state.low * foot.hiss * envelope;
        const body = Math.sin(TAU * foot.pitch * time) * Math.exp(-time * 27) * foot.ring;
        const heel = Math.sin(TAU * 71 * time) * Math.exp(-time * 65) * .21;
        return attack * (scuff + body + heel);
      });
    }
    this._buffer('cloth', .32, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .08;
      return s.low * Math.sin(Math.PI * t / .32) ** 2 * .6;
    });
    this._buffer('reload', .25, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .5;
      const click = Math.exp(-t * 95) + (t > .13 ? Math.exp(-(t - .13) * 90) * .65 : 0);
      return Math.min(1, t / .002) * (s.low * .51 + Math.sin(TAU * 392 * t) * .18) * click;
    });
    this._buffer('bolt', .13, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .7;
      return Math.min(1, t / .002) * (s.low * .58 + Math.sin(TAU * 780 * t) * .12) * Math.exp(-t * 48);
    });
    this._buffer('impact', .22, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .2;
      return Math.min(1, t / .003) * (s.low * .6 + Math.sin(TAU * (95 * t - 75 * t * t)) * .3) * Math.exp(-t * 23);
    });
    this._buffer('shield-hit', .28, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .2;
      return Math.min(1, t / .002) * (Math.sin(TAU * (780 * t - 340 * t * t)) * .19 +
        Math.sin(TAU * 1271 * t) * .11 + s.low * .35) * Math.exp(-t * 20);
    });
    this._buffer('hitmarker', .07, (t, s, noise) => Math.min(1, t / .001) *
      (Math.sin(TAU * 1640 * t) * .22 + noise() * .17) * Math.exp(-t * 87));
    this._buffer('build', .4, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .17;
      const second = t > .105 ? Math.exp(-(t - .105) * 34) : 0;
      return Math.min(1, t / .003) * (s.low * .42 * (Math.exp(-t * 20) + second * .6) +
        Math.sin(TAU * 83 * t) * Math.exp(-t * 22) * .26);
    });
    this._buffer('harvest', .3, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .43;
      return Math.min(1, t / .002) * (s.low * .57 + Math.sin(TAU * 201 * t) * .20) * Math.exp(-t * 26);
    });
    this._buffer('glider', .65, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .075;
      return s.low * Math.sin(Math.PI * t / .65) ** 1.6 * .9;
    });
    this._buffer('bird', .5, (t, s, noise, dt) => {
      const pulse = t < .16 ? t / .16 : t > .24 && t < .46 ? (t - .24) / .22 : -1;
      if (pulse < 0) return 0;
      const hz = 1950 + 750 * Math.sin(pulse * Math.PI) + 160 * Math.sin(pulse * 24);
      s.phase += TAU * hz * dt;
      return Math.sin(s.phase) * Math.sin(Math.PI * pulse) ** 2 * .27;
    });
    // A single inexpensive stereo noise bed feeds three differently filtered
    // layers. No oscillators run continuously, and all layers stay restrained.
    this._buffer('air-bed', 7, (t, s, noise) => {
      const n = noise(); s.low += (n - s.low) * .045;
      const swell = .7 + .18 * Math.sin(TAU * t / 7 + s.channel * 1.1) + .1 * Math.sin(TAU * t / 2.333);
      return (s.low * 1.5 + n * .13) * swell;
    }, 2);
  }

  _tone(frequency, duration, { gain = .11, delay = 0, pan = 0, end = frequency, priority = 2, bright = false } = {}) {
    const name = `tone:${frequency}:${end}:${duration}:${bright}`;
    if (!this.buffers.has(name)) this._buffer(name, duration, (t, state, noise, dt) => {
      const progress = t / duration;
      state.phase += TAU * (frequency + (end - frequency) * progress) * dt;
      const envelope = Math.min(1, t / .012) * (1 - progress) ** 2;
      return (Math.sin(state.phase) * .43 + Math.sin(state.phase * 2) * (bright ? .12 : .025)) * envelope;
    });
    this._play(name, { gain, delay, pan, priority });
  }

  _play(name, { gain = .15, pan = 0, rate = 1, lowpass = 18000, delay = 0, priority = 1 } = {}) {
    const ctx = this.context, buffer = this.buffers.get(name);
    if (!ctx || ctx.state !== 'running' || this.disposed || this.volume <= .001 || !buffer ||
        (typeof document !== 'undefined' && document.hidden) || gain < .0006) return;
    if (this.voices.size >= MAX_VOICES) {
      const oldest = [...this.voices].sort((a, b) => a.priority - b.priority || a.at - b.at)[0];
      if (!oldest || oldest.priority > priority) return;
      this._stopVoice(oldest);
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), output = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    source.buffer = buffer; source.playbackRate.value = clamp(rate, .5, 2);
    filter.type = 'lowpass'; filter.frequency.value = clamp(lowpass, 300, ctx.sampleRate * .48); filter.Q.value = .55;
    source.connect(filter);
    if (panner) { panner.pan.value = clamp(pan, -1, 1); filter.connect(panner); panner.connect(output); }
    else filter.connect(output);
    output.connect(this.effects);
    const at = ctx.currentTime + Math.max(0, delay), duration = buffer.duration / source.playbackRate.value;
    output.gain.setValueAtTime(0, at);
    output.gain.linearRampToValueAtTime(Math.max(0, gain), at + Math.min(.004, duration / 5));
    output.gain.setValueAtTime(Math.max(0, gain), at + Math.max(.006, duration - .025));
    output.gain.linearRampToValueAtTime(0, at + duration);
    const voice = { source, filter, panner, output, priority, at, end: at + duration, stopped: false };
    const cleanup = () => {
      this.voices.delete(voice);
      for (const node of [source, filter, panner, output]) try { node?.disconnect(); } catch {}
    };
    voice.cleanup = cleanup; source.onended = cleanup; this.voices.add(voice);
    source.start(at); source.stop(at + duration + .01);
    return voice;
  }
  _stopVoice(voice) {
    if (!voice || voice.stopped) return;
    voice.stopped = true; this.voices.delete(voice);
    const time = this.context.currentTime;
    try {
      voice.output.gain.cancelScheduledValues(time);
      voice.output.gain.setTargetAtTime(0, time, .003);
      voice.source.stop(time + .015);
    } catch { voice.cleanup(); }
  }
  _stopTransients() { for (const voice of [...this.voices]) this._stopVoice(voice); }

  _startAmbience() {
    const ctx = this.context;
    for (const [id, filterType, frequency, offset] of [
      ['surf', 'lowpass', 740, 0], ['wind', 'bandpass', 1370, 2.1], ['storm', 'lowpass', 125, 4.3],
    ]) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.buffers.get('air-bed'); source.loop = true;
      filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = .5;
      gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(this.master);
      source.start(ctx.currentTime, offset);
      this.ambient.push({ id, source, filter, gain });
    }
  }

  _space(event, range = 130) {
    const player = this.listener;
    if (!player) return { gain: .3, pan: 0, lowpass: 9000, distance: 0 };
    const source = this.snapshot?.players?.find(p => p.id === event.player);
    const x = finite(event.x, source?.x ?? player.x), z = finite(event.z, source?.z ?? player.z);
    const dx = x - player.x, dz = z - player.z, distance = Math.hypot(dx, dz);
    const right = dx * Math.cos(player.yaw || 0) - dz * Math.sin(player.yaw || 0);
    const pan = distance > .01 ? right / distance * Math.min(1, distance / 5) : 0;
    const gain = distance > range ? 0 : 1 / (1 + (distance / 22) ** 1.8) * (1 - .35 * distance / range);
    return { gain, pan: clamp(pan, -.95, .95), lowpass: 16000 / (1 + distance / 23), distance };
  }

  /** Optional direct entry; update() already handles the rolling engine events. */
  event(event, snapshot = this.snapshot, localId = this.localId) {
    if (!event || !snapshot) return;
    this.snapshot = snapshot; this.localId = localId;
    if (snapshot.id !== this.matchId) this._resetMatch(snapshot.id);
    const key = event.id ?? `${event.type}:${event.time}:${event.player}:${event.target}`;
    if (this.heard.has(key)) return;
    this.heard.add(key);
    if (this.heard.size > 192) this.heard.delete(this.heard.values().next().value);
    if (!this.context || this.context.state !== 'running') return;
    // A fresh connection should not replay the last thirty sounds from a match.
    if (finite(snapshot.time) - finite(event.time) > .65) return;
    const local = event.player === localId, received = event.target === localId;
    const space = this._space(event);
    if (event.type === 'shot') {
      const shotKey = `${event.player}:${Math.round(finite(event.time) * 1000)}`;
      if (this.heardShots.has(shotKey)) return;
      this.heardShots.set(shotKey, event.time);
      if (this.heardShots.size > 64) this.heardShots.delete(this.heardShots.keys().next().value);
      const weapon = Number.isInteger(event.weapon) ? clamp(event.weapon, 0, 3) : 0;
      if (local || space.distance < 35) this.lastCombatAt = finite(snapshot.time);
      this._play(`gun${weapon}`, { ...space, gain: GUNS[weapon].gain * (local ? 1 : space.gain * .8),
        pan: local ? .09 : space.pan, rate: .97 + Math.random() * .06, priority: local ? 5 : 2 });
      // Quiet surface strike, separate from the barrel report. No second gun
      // sound for the shotgun's extra visual tracer.
      if (event.target === null && Number.isFinite(event.toX)) {
        const impact = this._space({ x: event.toX, z: event.toZ }, 45);
        this._play('impact', { ...impact, gain: .065 * impact.gain, delay: Math.min(.16, space.distance / 340), priority: 0 });
      }
    } else if (event.type === 'hit') {
      if (local) this._play('hitmarker', { gain: event.headshot ? .23 : .15, rate: event.headshot ? 1.16 : 1, priority: 5 });
      if (received) {
        const own = snapshot.players.find(p => p.id === localId);
        const incoming = this._space({ player: event.player });
        this._play(own?.shield > 0 ? 'shield-hit' : 'impact', { gain: .38, pan: incoming.pan * .65, priority: 6 });
        this.lastCombatAt = finite(snapshot.time);
      }
    } else if (event.type === 'elimination') {
      if (local) {
        this._tone(659.25, .22, { gain: .18, priority: 5 });
        this._tone(987.77, .42, { gain: .16, delay: .10, priority: 5 });
      } else if (received) {
        this._tone(220, .75, { end: 110, gain: .20, priority: 6 });
        this._play('glider', { gain: .26, rate: .72, priority: 4 });
      }
    } else if (event.type === 'loot') {
      if (event.harvest) this._play('harvest', { ...space, gain: (local ? .21 : .12 * space.gain), priority: local ? 3 : 0 });
      else if (event.launch) this._play('glider', { gain: local ? .35 : .12 * space.gain, pan: space.pan, priority: 3 });
      else if (local) {
        const healed = /health|shield/i.test(event.text || '');
        this._tone(healed ? 523.25 : 880, .21, { gain: .12, priority: 3 });
        this._tone(healed ? 783.99 : 1174.66, .29, { gain: .09, delay: .075, priority: 3 });
      }
    } else if (event.type === 'build') {
      this._play('build', { ...space, gain: local ? .28 : .20 * space.gain, priority: local ? 3 : 1 });
      if (local) this._tone(293.66, .11, { gain: .07, delay: .09 });
    } else if (event.type === 'storm' && snapshot.phase === 'active') {
      this._tone(146.83, .9, { gain: .13, priority: 3 });
      this._tone(220, .7, { gain: .075, delay: .18, priority: 3 });
    } else if (event.type === 'win') {
      this._stopTransients();
      if (local) {
        // An original, brief six-note motif; room for the island to become quiet.
        const notes = [[293.66, 0], [440, .22], [493.88, .44], [587.33, .72], [554.37, 1.03], [587.33, 1.28]];
        notes.forEach(([frequency, delay], index) => this._tone(frequency, index === 5 ? 1.15 : .43,
          { gain: .19, delay, priority: 7, bright: true }));
        this._tone(146.83, 1.8, { gain: .11, delay: .72, priority: 7 });
        this._tone(220, 1.7, { gain: .075, delay: .72, priority: 7 });
      } else {
        this._tone(293.66, .7, { gain: .09, priority: 3 });
        this._tone(220, .8, { gain: .07, delay: .2, priority: 3 });
      }
    }
  }

  _resetMatch(id) {
    this.matchId = id; this.heard.clear(); this.heardShots.clear(); this.players.clear();
    this.lastCombatAt = -100; this.nextBird = 7 + Math.random() * 7; this.nextStormTone = 0;
    if (this.context) this._stopTransients();
  }

  update(snapshot, localId, dt, { menu = false, listenerId = localId } = {}) {
    if (!snapshot || this.disposed) return;
    if (snapshot.id !== this.matchId) this._resetMatch(snapshot.id);
    this.snapshot = snapshot; this.localId = localId;
    this.listener = snapshot.players?.find(player => player.id === listenerId) || snapshot.players?.[0] || null;
    const own = snapshot.players?.find(player => player.id === localId);
    const playing = !menu && ['drop', 'active'].includes(snapshot.phase);
    for (const event of snapshot.events || []) this.event(event, snapshot, localId);
    if (!this.context || this.context.state !== 'running') return;
    const time = finite(snapshot.time), listener = this.listener;
    for (const player of snapshot.players || []) {
      const previous = this.players.get(player.id), local = player.id === localId;
      const state = { x: player.x, y: player.y, z: player.z, grounded: player.grounded,
        gliding: player.gliding, weapon: player.weapon, reloading: player.reloading,
        using: player.using, carry: previous?.carry || 0 };
      if (previous && playing && player.alive) {
        const spatial = this._space(player, 22), traveled = Math.hypot(player.x - previous.x, player.z - previous.z);
        if (player.grounded && previous.grounded && traveled < 5 && traveled > .001) {
          state.carry += traveled;
          const speed = Math.hypot(player.vx || 0, player.vz || 0), stride = speed > 7 ? 2.35 : 1.70;
          if (state.carry >= stride && (local || spatial.distance < 22)) {
            state.carry %= stride;
            this._play(`foot-${surface(player)}`, { ...spatial, gain: (local ? .13 : .085 * spatial.gain) * (speed > 7 ? 1.13 : 1),
              rate: .94 + Math.random() * .14, pan: local ? (Math.random() - .5) * .13 : spatial.pan, priority: local ? 1 : 0 });
          }
        } else if (!player.grounded || traveled >= 5) state.carry = 0;
        if (local) {
          if (player.grounded && !previous.grounded) this._play(`foot-${surface(player)}`, { gain: .27, rate: .82, priority: 2 });
          if (player.gliding && !previous.gliding) this._play('glider', { gain: .21, priority: 2 });
          if (!player.gliding && previous.gliding) this._play('cloth', { gain: .18, priority: 2 });
          if (player.weapon !== previous.weapon) this._play('bolt', { gain: .13, rate: .92, priority: 3 });
          if (player.reloading > 0 && !(previous.reloading > 0)) this._play('reload', { gain: .25, priority: 3 });
          if (!(player.reloading > 0) && previous.reloading > 0 && previous.reloading < .45) this._play('bolt', { gain: .23, priority: 3 });
          if (player.using && player.using !== previous.using) {
            this._play('cloth', { gain: .27, priority: 3 });
            if (player.using === 'shield') this._tone(196, .9, { end: 392, gain: .105, priority: 3 });
          }
        }
      }
      this.players.set(player.id, state);
    }
    if (!listener) return;
    const storm = snapshot.storm;
    const outside = playing && listener.alive && storm && Math.hypot(listener.x - storm.x, listener.z - storm.z) > storm.radius;
    if (this.context.currentTime - this.lastAmbientAt > .18) {
      this.lastAmbientAt = this.context.currentTime;
      const coast = clamp((Math.hypot(listener.x, listener.z) - 75) / 50, 0, 1);
      const gliding = playing && listener.gliding;
      const targets = {
        surf: (menu ? .024 : .012 + coast * .038) * (outside ? .55 : 1),
        wind: gliding ? .12 : menu ? .008 : .008 + clamp(listener.y / 50, 0, 1) * .019,
        storm: outside ? .115 : playing && storm?.radius < 25 ? .016 : 0,
      };
      for (const bed of this.ambient) {
        bed.gain.gain.cancelScheduledValues(this.context.currentTime);
        bed.gain.gain.setTargetAtTime(targets[bed.id], this.context.currentTime, .32);
      }
    }
    if (outside && time > this.nextStormTone) {
      this._tone(73.42, 1.7, { end: 65.41, gain: .095, priority: 2 });
      this.nextStormTone = time + 10;
    }
    if (playing && snapshot.phase === 'active' && own?.alive && !outside && time > this.nextBird) {
      this.nextBird = time + 15 + Math.random() * 13;
      if (time - this.lastCombatAt > 3) this._play('bird', { gain: .055, pan: (Math.random() - .5) * 1.6, rate: .9 + Math.random() * .2, priority: 0 });
    }
    // onended normally handles this; prune a browser-delayed callback defensively.
    for (const voice of this.voices) if (voice.end < this.context.currentTime - .5) voice.cleanup();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibility);
    this._stopTransients();
    for (const bed of this.ambient) {
      try { bed.source.stop(); } catch {}
      for (const node of [bed.source, bed.filter, bed.gain]) try { node.disconnect(); } catch {}
    }
    this.ambient.length = 0;
    for (const node of [this.effects, this.master, this.compressor]) try { node?.disconnect(); } catch {}
    this.context?.close().catch(() => {});
    this.buffers.clear(); this.players.clear(); this.heard.clear(); this.heardShots.clear();
  }
}
