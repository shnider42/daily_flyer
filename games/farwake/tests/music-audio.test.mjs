import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundscape } from '../dist/audio.mjs';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
}
class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, ramp) { this.value = value; this.events.push(['target', value, time, ramp]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
}
class Node {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.connections = new Set(); this.stops = [];
    for (const key of ['gain', 'frequency', 'detune', 'playbackRate', 'pan', 'delayTime', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param();
  }
  connect(node) { this.connections.add(node); return node; }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  setPeriodicWave() {}
  start(time = this.ctx.currentTime) { this.started = time; }
  stop(time = this.ctx.currentTime) { this.stops.push(time); if (time <= this.ctx.currentTime) this.onended?.(); }
}
class AudioContextDouble extends Events {
  static instances = [];
  constructor() {
    super(); this.currentTime = 0; this.sampleRate = 16000; this.state = 'running'; this.nodes = [];
    this.destination = new Node(this, 'destination'); AudioContextDouble.instances.push(this);
  }
  node(kind) { const node = new Node(this, kind); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createOscillator() { return this.node('oscillator'); }
  createBufferSource() { return this.node('buffer-source'); }
  createBiquadFilter() { return this.node('filter'); }
  createDelay() { return this.node('delay'); }
  createConvolver() { return this.node('convolver'); }
  createStereoPanner() { return this.node('panner'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createPeriodicWave() { return {}; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, duration: length / sampleRate, sampleRate, numberOfChannels: channels, getChannelData: channel => data[channel] };
  }
  resume() { this.state = 'running'; this.emit('statechange'); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; this.emit('statechange'); return Promise.resolve(); }
  interrupt() { this.state = 'interrupted'; this.emit('statechange'); }
}

function boundary({ sound = true, music = true } = {}) {
  const originals = new Map(['document', 'window', 'AudioContext'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const document = new Events(); document.hidden = false;
  const window = new Events();
  Object.assign(globalThis, { document, window, AudioContext: AudioContextDouble });
  AudioContextDouble.instances = [];
  const settings = { sound, music, volume: .5, presence: 'balanced' };
  const audio = new Soundscape(() => settings.sound, { musicEnabled: () => settings.music, musicVolume: () => settings.volume, musicPresence: () => settings.presence });
  return { audio, settings, document, restore() {
    audio.suspend();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  } };
}

test('audio construction stays silent until trusted activation and does not activate when both controls are off', () => {
  const b = boundary({ sound: false, music: false });
  try {
    assert.equal(AudioContextDouble.instances.length, 0);
    b.document.emit('pointerdown', { isTrusted: true });
    assert.equal(AudioContextDouble.instances.length, 0);
    b.settings.music = true;
    b.document.emit('pointerdown', { isTrusted: false });
    assert.equal(AudioContextDouble.instances.length, 0);
    b.document.emit('touchend', { isTrusted: true });
    assert.equal(AudioContextDouble.instances.length, 1);
    assert.equal(b.audio.ctx.state, 'running');
  } finally { b.restore(); }
});

test('music works with effects disabled and muting music leaves effect playback available', () => {
  const b = boundary({ sound: false, music: true });
  try {
    b.audio.unlock();
    const decision = b.audio.updateMusic({ scene: 'menu' }, 0);
    assert.equal(decision.theme, true);
    assert.ok(b.audio.score?.playing);
    assert.equal(b.audio.master.gain.value, 0);
    b.audio.tone(440); assert.equal(b.audio.effects.size, 0);
    const score = b.audio.score;
    b.settings.music = false; b.settings.sound = true; b.audio.mute();
    assert.equal(score.status().disposed, true);
    assert.equal(b.audio.score, null);
    assert.equal(b.audio.musicBus.gain.value, 0);
    b.audio.tone(440); assert.equal(b.audio.effects.size, 1);
    assert.ok(b.audio.master.gain.value > 0);
  } finally { b.restore(); }
});

test('backgrounding stops active notes and effects so a return cannot resume stale shots', () => {
  const b = boundary();
  try {
    b.audio.unlock(); b.audio.updateMusic({ scene: 'exploration', paletteKey: 'hearth' }, 10);
    const score = b.audio.score;
    b.audio.tone(440, 2); const effect = [...b.audio.effects][0];
    assert.ok(effect); assert.ok(score);
    b.document.hidden = true; b.document.emit('visibilitychange');
    assert.equal(b.audio.ctx.state, 'suspended');
    assert.equal(score.status().disposed, true);
    assert.equal(b.audio.effects.size, 0);
    assert.ok(effect.disconnected);
    assert.ok(effect.stops.some(time => time <= b.audio.ctx.currentTime));
    assert.equal(b.audio.director.current, null);
    b.document.hidden = false; b.document.emit('touchend', { isTrusted: true });
    assert.equal(b.audio.ctx.state, 'running');
    assert.equal(b.audio.updateMusic({ scene: 'exploration' }, 200).cueId, null);
    assert.equal(b.audio.score, null, 'Resuming allows a quiet interval rather than restarting the abandoned cue.');
  } finally { b.restore(); }
});

test('external audio interruption clears the director and resumes without replaying the abandoned phrase', () => {
  const b = boundary();
  try {
    b.audio.unlock(); b.audio.updateMusic({ scene: 'exploration' }, 1);
    const score = b.audio.score;
    b.audio.tone(220, 1); b.audio.ctx.interrupt();
    assert.equal(score.status().disposed, true);
    assert.equal(b.audio.effects.size, 0);
    assert.equal(b.audio.director.current, null);
    assert.equal(b.audio.musicDecision, null);
    b.document.emit('touchend', { isTrusted: true });
    assert.equal(b.audio.ctx.state, 'running');
    assert.equal(b.audio.updateMusic({ scene: 'exploration' }, 30).cueId, null);
  } finally { b.restore(); }
});

test('rapid musical transitions retain at most a current and retiring score and stop superseded players', () => {
  const b = boundary();
  try {
    b.audio.unlock(); b.audio.updateMusic({ scene: 'menu' }, 0); const theme = b.audio.score;
    b.audio.musicEvent('combat', 1, 'incoming-hit');
    b.audio.ctx.currentTime = 1;
    b.audio.updateMusic({ scene: 'exploration' }, 1); const combat = b.audio.score;
    assert.equal(b.audio.retiringScore, theme);
    b.audio.ctx.currentTime = 1.1;
    b.audio.updateMusic({ scene: 'exploration', silence: true }, 1.1);
    assert.equal(theme.status().disposed, true);
    assert.equal(b.audio.retiringScore, combat);
    assert.equal(b.audio.score, null);
    b.audio.ctx.currentTime = 1.2;
    b.audio.updateMusic({ scene: 'exploration' }, 1.2);
    assert.equal(combat.status().disposed, true);
    assert.ok(b.audio.score);
    assert.equal(b.audio.retiringScore, null);
  } finally { b.restore(); }
});

test('an unavailable music graph fails quiet without throwing into the game loop or disabling effects', () => {
  const b = boundary(), warn = console.warn, warnings = [];
  try {
    console.warn = (...args) => warnings.push(args);
    b.audio.unlock();
    b.audio.ctx.createConvolver = () => { throw new Error('Unsupported test reverb'); };
    assert.doesNotThrow(() => b.audio.updateMusic({ scene: 'menu' }, 0));
    assert.equal(b.audio.musicStatus().state, 'unavailable');
    assert.equal(b.audio.musicBus.gain.value, 0);
    assert.equal(b.audio.score, null);
    assert.equal(b.audio.director.current, null);
    for (let now = 1; now <= 60; now++) b.audio.updateMusic({ scene: 'menu' }, now);
    assert.equal(warnings.length, 1, 'No failure/retry storm on every animation frame.');
    b.audio.tone(440); assert.equal(b.audio.effects.size, 1);
  } finally { console.warn = warn; b.restore(); }
});
