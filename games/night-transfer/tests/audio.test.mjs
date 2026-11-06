import test from 'node:test';
import assert from 'node:assert/strict';
import { PrisonAudio } from '../public/audio.js';

class Events {
  constructor() { this.listeners = new Map(); this.hidden = false; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatch(type, extra = {}) { for (const callback of [...this.listeners.get(type) || []]) callback({ type, ...extra }); }
  get count() { return [...this.listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0); }
}
class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  record(method, value, at, extra) {
    assert(Number.isFinite(value), method + ' value'); assert(Number.isFinite(at) && at >= 0, method + ' time');
    this.value = value; this.events.push({ method, value, at, extra });
  }
  setValueAtTime(value, at) { this.record('set', value, at); }
  setTargetAtTime(value, at, constant) { assert(constant > 0); this.record('target', value, at, constant); }
  linearRampToValueAtTime(value, at) { this.record('linear', value, at); }
  exponentialRampToValueAtTime(value, at) { assert(value > 0); this.record('exponential', value, at); }
  cancelScheduledValues(at) { assert(Number.isFinite(at)); }
}
class Node {
  constructor(context, type) {
    this.context = context; this.kind = type; this.connections = new Set(); this.disconnected = false;
    for (const param of ['gain', 'frequency', 'Q', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[param] = new Param(param === 'gain' ? 1 : 0);
    context.nodes.push(this);
  }
  connect(destination) { this.connections.add(destination); return destination; }
  disconnect(destination) { if (destination) this.connections.delete(destination); else { this.connections.clear(); this.disconnected = true; } }
}
class Source extends Node {
  start(at = this.context.currentTime, offset = 0) {
    assert(Number.isFinite(at) && at >= 0); assert(Number.isFinite(offset) && offset >= 0);
    if (this.buffer) assert(offset < this.buffer.duration);
    this.started = true; this.startedAt = at; this.stopAt = Infinity;
    this.context.started.push(this); this.context.live.add(this);
    this.context.peakSources = Math.max(this.context.peakSources, this.context.live.size);
  }
  stop(at = this.context.currentTime) {
    if (!this.started || this.ended) return;
    this.stopAt = at;
    if (at <= this.context.currentTime) this.end();
  }
  end() { if (this.ended) return; this.ended = true; this.context.live.delete(this); this.onended?.(); }
}
class Context {
  constructor() {
    this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000;
    this.nodes = []; this.started = []; this.live = new Set(); this.peakSources = 0;
    this.resumeCalls = 0; this.suspendCalls = 0; this.closeCalls = 0; this.destination = { kind: 'destination' };
    this.rejectResume = false; this.deferResume = false; this.pendingResumes = [];
  }
  createGain() { return new Node(this, 'gain'); }
  createBiquadFilter() { return new Node(this, 'filter'); }
  createDynamicsCompressor() { return new Node(this, 'compressor'); }
  createDelay() { return new Node(this, 'delay'); }
  createStereoPanner() { return new Node(this, 'panner'); }
  createOscillator() { return new Source(this, 'oscillator'); }
  createBufferSource() { return new Source(this, 'buffer'); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, sampleRate, numberOfChannels: channels, getChannelData: channel => data[channel] };
  }
  resume() {
    this.resumeCalls++;
    if (this.rejectResume) return Promise.reject(new Error('Gesture required'));
    if (this.deferResume) return new Promise(resolve => this.pendingResumes.push(() => { this.setState('running'); resolve(); }));
    return Promise.resolve().then(() => this.setState('running'));
  }
  suspend() { this.suspendCalls++; return Promise.resolve().then(() => this.setState('suspended')); }
  close() { this.closeCalls++; this.state = 'closed'; for (const source of [...this.live]) source.end(); return Promise.resolve(); }
  setState(state) { this.state = state; this.onstatechange?.(); }
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of [...this.live]) if (source.stopAt <= this.currentTime) source.end();
  }
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(t, options = {}) {
  const context = new Context(), document = new Events(), window = new Events(), statuses = [];
  let creations = 0, fetches = 0;
  const audio = new PrisonAudio({ document, window, contextFactory: () => { creations++; return context; },
    random: () => .5, fetch: () => { fetches++; return Promise.reject(new Error('Offline')); },
    onStatus: status => statuses.push(status), ...options });
  t.after(() => audio.dispose());
  return { audio, context, document, window, statuses, creations: () => creations, fetches: () => fetches };
}
async function play(fixture) {
  fixture.audio.setEnabled(true); fixture.audio.setActive(true);
  assert.equal(await fixture.audio.unlock(), true);
  assert.equal(fixture.audio.getStatus().playing, true);
}

test('audio is opt-in and never creates a context or fetches an asset during silent play', async t => {
  const f = fixture(t); f.audio.setActive(true);
  for (let i = 0; i < 100; i++) { f.audio.update({ dt: .1, pose: { x: i * .1, z: 0 }, room: 'boiler' }); assert.equal(f.audio.cue('door'), false); }
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.creations(), 0); assert.equal(f.fetches(), 0); assert.equal(f.context.started.length, 0);
  f.audio.setEnabled(true);
  assert.equal(f.creations(), 0, 'enabling the preference alone cannot autoplay');
  assert.equal(f.audio.getStatus().needsGesture, true);
  assert.equal(f.audio.cue('key'), false);
});

test('unlock creates and resumes the context synchronously inside the initiating gesture', async t => {
  const f = fixture(t, { enabled: true }); f.audio.setActive(true);
  const unlocked = f.audio.unlock();
  assert.equal(f.creations(), 1); assert.equal(f.context.resumeCalls, 1, 'resume is called before unlock returns');
  assert.equal(await unlocked, true); assert.equal(f.audio.getStatus().ready, true);
  assert(f.context.live.size > 0); assert.equal(f.fetches(), 0, 'procedural atmosphere needs no download');
  assert.equal(f.context.nodes.find(node => node.kind === 'compressor').ratio.value, 4);
});

test('holding a movement key against a wall stays silent; footsteps follow actual displacement', async t => {
  const f = fixture(t, { atmosphere: 0 }); await play(f);
  let steps = 0;
  f.audio.update({ dt: .1, pose: { x: 0, z: 0 }, room: 'holding' });
  for (let i = 0; i < 30; i++) { f.context.advance(.1); steps += f.audio.update({ dt: .1, pose: { x: 0, z: 0 }, moving: true }); }
  assert.equal(steps, 0); assert.equal(f.context.started.length, 0);
  for (let i = 1; i <= 20; i++) { f.context.advance(.1); steps += f.audio.update({ dt: .1, pose: { x: i * .1, z: 0 }, moving: false }); }
  assert.equal(steps, 2, 'two metres produce measured footfalls regardless of the attempted-movement flag');
  assert.equal(f.context.started.length, 4, 'each footfall has one body impact and one surface scuff');
});

test('room changes, teleports, hidden motion and stale frames never create catch-up footsteps', async t => {
  const f = fixture(t, { atmosphere: 0 }); await play(f);
  f.audio.update({ dt: .1, pose: { x: 0, z: 0 } });
  assert.equal(f.audio.update({ dt: .1, pose: { x: 3, z: -3 } }), 0);
  assert.equal(f.audio.update({ dt: .1, pose: { x: -3, z: 3 }, room: 'records' }), 0);
  assert.equal(f.audio.update({ dt: 4, pose: { x: -2, z: 3 } }), 0);
  f.document.hidden = true; f.document.dispatch('visibilitychange'); await settle();
  f.audio.update({ dt: .1, pose: { x: 0, z: 0 } });
  f.document.hidden = false; f.document.dispatch('visibilitychange'); await settle();
  assert.equal(f.audio.update({ dt: .1, pose: { x: 2, z: 2 } }), 0);
  assert.equal(f.context.started.length, 0);
});

test('crouching uses a substantially softer footfall at the same real displacement', async t => {
  const f = fixture(t, { atmosphere: 0 }); await play(f);
  const walk = crouch => {
    f.audio.setRoom(crouch ? 'washroom' : 'holding');
    f.audio.update({ dt: .1, pose: { x: 0, z: 0, crouch } });
    let steps = 0, gain;
    for (let i = 1; i <= 9; i++) {
      f.context.advance(.1); const count = f.audio.update({ dt: .1, pose: { x: i * .1, z: 0, crouch } }); steps += count;
      if (count) gain = [...f.audio._voices].find(voice => voice.kind === 'step')?.output.gain.value;
    }
    assert.equal(steps, 1); return gain;
  };
  const walkingGain = walk(false), crouchingGain = walk(true);
  assert(Number.isFinite(walkingGain) && Number.isFinite(crouchingGain));
  assert(crouchingGain < walkingGain * .5);
});

test('mute, zero volume and the title menu stop existing sources and gate future cues', async t => {
  const f = fixture(t); await play(f);
  assert.equal(f.audio.cue('door'), true); assert(f.context.live.size > 3);
  f.audio.setEnabled(false); await settle();
  assert.equal(f.context.live.size, 0); assert.equal(f.context.state, 'suspended'); assert.equal(f.audio.cue('key'), false);
  f.audio.setEnabled(true); await settle(); assert.equal(f.audio.getStatus().playing, true);
  f.audio.setVolume(0); await settle(); assert.equal(f.context.live.size, 0); assert.equal(f.audio.getStatus().playing, false);
  f.audio.setVolume(.7); await settle(); assert.equal(f.audio.cue('key'), true);
  f.audio.setActive(false); await settle(); assert.equal(f.context.live.size, 0); assert.equal(f.context.state, 'suspended');
  assert.equal(f.audio.cue('success'), false); assert.equal(f.audio.getStatus().message, 'Sound paused.');
});

test('atmosphere zero removes hum and distant voices while retaining interaction effects', async t => {
  const f = fixture(t); await play(f); assert.equal(f.context.live.size, 3);
  assert.equal(f.audio.cue('key'), true); f.audio.setAtmosphere(0);
  assert.equal(f.context.live.size, 3, 'only the three existing key components remain');
  f.context.advance(1); assert.equal(f.context.live.size, 0);
  for (let i = 0; i < 30; i++) { f.context.advance(10); f.audio.update({ dt: .1, pose: { x: 0, z: 0 } }); }
  assert.equal(f.context.live.size, 0);
  assert.equal(f.audio.cue('mechanism'), true);
});

test('hidden pages suspend completely and a visible interrupted iOS context can resume', async t => {
  const f = fixture(t); await play(f);
  f.document.hidden = true; f.document.dispatch('visibilitychange'); await settle();
  assert.equal(f.context.state, 'suspended'); assert.equal(f.context.live.size, 0); assert.equal(f.audio.getStatus().hidden, true);
  f.document.hidden = false; f.document.dispatch('visibilitychange'); await settle();
  assert.equal(f.audio.getStatus().playing, true); assert.equal(f.context.live.size, 3);
  f.context.setState('interrupted'); assert.equal(f.context.live.size, 0); assert.equal(f.audio.getStatus().needsGesture, true);
  assert.equal(await f.audio.unlock(), true); assert.equal(f.audio.getStatus().state, 'running'); assert.equal(f.context.live.size, 3);
  f.window.dispatch('pagehide'); await settle(); assert.equal(f.context.live.size, 0);
  f.window.dispatch('pageshow'); await settle(); assert.equal(f.audio.getStatus().playing, true);
});

test('a rejected resume remains optional and a later real gesture can recover without another context', async t => {
  const f = fixture(t, { enabled: true }); f.audio.setActive(true); f.context.rejectResume = true;
  assert.equal(await f.audio.unlock(), false); assert.equal(f.context.live.size, 0); assert.equal(f.audio.getStatus().needsGesture, true);
  assert.equal(f.audio.cue('key'), false); assert.equal(f.creations(), 1);
  f.context.rejectResume = false; assert.equal(await f.audio.unlock(), true);
  assert.equal(f.creations(), 1); assert.equal(f.audio.cue('key'), true);
});

test('a delayed resume cannot restart sound after mute or disposal', async t => {
  const f = fixture(t, { enabled: true }); f.audio.setActive(true); f.context.deferResume = true;
  const first = f.audio.unlock(); f.audio.setEnabled(false); f.context.pendingResumes.shift()();
  await first; await settle(); assert.equal(f.context.live.size, 0); assert.equal(f.audio.getStatus().playing, false);
  f.audio.setEnabled(true); await settle(); const second = f.audio.unlock();
  f.audio.dispose(); for (const finish of f.context.pendingResumes.splice(0)) finish();
  await second; await settle(); assert.equal(f.context.live.size, 0); assert.equal(f.audio.getStatus().state, 'closed');
  assert.equal(f.document.count, 0); assert.equal(f.window.count, 0); assert.equal(f.context.closeCalls, 1);
});

test('rapid cues have cooldowns and a strict simultaneous source cap with complete cleanup', async t => {
  const f = fixture(t); await play(f);
  assert.equal(f.audio.cue('door'), true); assert.equal(f.audio.cue('door'), false);
  assert.equal(f.audio.cue('unknown'), false);
  for (let tick = 0; tick < 300; tick++) {
    f.context.advance(.01);
    for (const cue of ['key', 'door', 'mechanism', 'success', 'error']) f.audio.cue(cue);
  }
  assert(f.context.peakSources <= 24, `peak ${f.context.peakSources}`);
  f.context.advance(2); assert.equal(f.context.live.size, 3, 'only the ambient bed persists');
  f.audio.setActive(false); await settle(); assert.equal(f.context.live.size, 0);
});

test('nine room profiles change the atmosphere without leaking beds or requiring samples', async t => {
  const f = fixture(t); await play(f); const pitches = new Set();
  for (const room of ['holding', 'washroom', 'records', 'laundry', 'watchroom', 'dispatch', 'boiler', 'sluice', 'quay']) {
    f.audio.setRoom(room); assert.equal(f.context.live.size, 3);
    pitches.add([...f.context.live].find(source => source.kind === 'oscillator').frequency.value);
    f.context.advance(30); f.audio.update({ dt: .1, pose: { x: 0, z: 0 }, room });
    assert(f.context.live.size <= 5, 'one occasional event is scheduled, without a catch-up burst');
  }
  assert(pitches.size >= 7); assert.equal(f.fetches(), 0);
  f.audio.dispose(); assert.equal(f.context.live.size, 0);
});


test('rapid hide/show and menu transitions settle in the most recent requested audio state', async t => {
  const f = fixture(t); await play(f);
  f.document.hidden = true; f.document.dispatch('visibilitychange');
  f.document.hidden = false; f.document.dispatch('visibilitychange');
  await settle(); assert.equal(f.audio.getStatus().playing, true, 'a late suspend must not override the visible state');
  f.audio.setActive(false); f.audio.setActive(true);
  await settle(); assert.equal(f.audio.getStatus().playing, true);
  f.audio.setActive(false); await settle(); assert.equal(f.context.live.size, 0);
});
