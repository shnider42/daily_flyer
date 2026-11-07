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
    for (const param of ['gain', 'frequency', 'Q', 'pan', 'playbackRate', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[param] = new Param(param === 'gain' ? 1 : 0);
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
  createConvolver() { return new Node(this, 'convolver'); }
  createStereoPanner() { return new Node(this, 'panner'); }
  createOscillator() { return new Source(this, 'oscillator'); }
  createBufferSource() { return new Source(this, 'buffer'); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, duration: length / sampleRate, sampleRate, numberOfChannels: channels, getChannelData: channel => data[channel] };
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
  assert.equal(f.context.started.length, 2, 'heel, toe and scuff are mixed into one cached source per footfall');
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
  assert.equal(f.context.live.size, 1, 'only the existing key sound remains');
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

test('thirteen room profiles change the atmosphere without leaking beds or requiring samples', async t => {
  const f = fixture(t); await play(f); const signatures = new Set();
  for (const room of ['holding', 'washroom', 'records', 'laundry', 'watchroom', 'dispatch', 'boiler', 'sluice', 'quay',
    'annexArchive', 'annexRelay', 'annexListening', 'annexRelease']) {
    f.audio.setRoom(room); assert.equal(f.context.live.size, 3);
    assert.equal(f.audio.room, room);
    const bed = [...f.context.live][0].buffer.getChannelData(0);
    signatures.add(Array.from(bed.slice(100, 110)).join(','));
    f.context.advance(30); f.audio.update({ dt: .1, pose: { x: 0, z: 0 }, room });
    assert(f.context.live.size <= 5, 'one occasional event is scheduled, without a catch-up burst');
  }
  assert(signatures.size >= 11); assert.equal(f.fetches(), 0);
  assert(f.audio._bufferBytes <= 4 * 1024 * 1024, 'generated sample cache is bounded');
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


test('footstep variants are reused without consecutive repetition and keep the source budget small', async t => {
  const f = fixture(t, { atmosphere: 0 }); await play(f);
  f.audio.update({ dt: .1, pose: { x: 0, z: 0, yaw: 0 } });
  const heard = [];
  for (let i = 1; i <= 14; i++) {
    f.context.advance(.4);
    assert.equal(f.audio.update({ dt: .4, pose: { x: i * .81, z: 0, yaw: 0 } }), 1);
    heard.push(f.context.started.at(-1).buffer);
  }
  assert.equal(new Set(heard).size, 6, 'the six generated takes are cached, not rebuilt per step');
  for (let i = 1; i < heard.length; i++) assert.notStrictEqual(heard[i], heard[i - 1]);
  assert(f.context.peakSources <= 2);
});

test('distant voices stay anchored in the room as yaw changes', async t => {
  const f = fixture(t); await play(f);
  f.audio.update({ dt: .1, pose: { x: 0, z: 3.2, yaw: 0 }, room: 'holding' });
  f.audio._murmur();
  const voice = [...f.audio._voices].find(voice => voice.kind === 'chatter');
  assert(voice.anchor && voice.panner); assert(Math.abs(voice.panner.pan.value) < .01);
  f.context.advance(.1); f.audio.update({ dt: .1, pose: { x: 0, z: 3.2, yaw: Math.PI / 2 } });
  assert(voice.panner.pan.value > .8, 'a source ahead moves right when the player looks left');
  f.context.advance(.1); f.audio.update({ dt: .1, pose: { x: 0, z: 3.2, yaw: -Math.PI / 2 } });
  assert(voice.panner.pan.value < -.8);
  assert.equal(voice.anchor.z, -6.4, 'the source itself does not rotate with the listener');
});

test('room reflections use one calibrated short stereo response and clear on hide', async t => {
  const f = fixture(t); await play(f);
  const convolver = f.audio._echo.convolver;
  assert.equal(convolver.normalize, false); assert.equal(convolver.buffer.numberOfChannels, 2);
  assert.equal(convolver.buffer.sampleRate, f.context.sampleRate); assert(convolver.buffer.duration < 1.5);
  const initial = convolver.buffer; f.audio.setRoom('washroom');
  assert.strictEqual(convolver.buffer, initial, 'the old return fades before the response changes');
  assert.equal(f.audio._echo.wet.gain.value, 0);
  f.context.advance(.08); f.audio.update({ dt: .08, pose: { x: 0, z: 3.2, yaw: 0 } });
  assert.notStrictEqual(convolver.buffer, initial); assert(convolver.buffer.duration < 1.5);
  assert.equal(f.context.nodes.filter(node => node.kind === 'convolver' && !node.disconnected).length, 1);
  f.document.hidden = true; f.document.dispatch('visibilitychange'); await settle();
  assert.equal(f.audio._echo, null); assert.equal(convolver.disconnected, true);
});

test('environment choices and room texture drift remain bounded and do not repeat immediately', async t => {
  const f = fixture(t); await play(f); const heard = [];
  for (let i = 0; i < 12; i++) {
    f.context.advance(30); f.audio.update({ dt: .1, pose: { x: 0, z: 0, yaw: 0 } });
    heard.push(f.audio._lastAmbientKind);
    assert(f.context.live.size <= 4, 'a long frame schedules one environmental event, not a backlog');
  }
  assert(new Set(heard).size >= 2);
  for (let i = 1; i < heard.length; i++) assert.notEqual(heard[i], heard[i - 1]);
  assert(f.audio._bed.parts.every(part => part.gain.gain.events.some(event => event.method === 'target')));
  assert(f.audio._bufferBytes <= 4 * 1024 * 1024);
});

const receiverPackets = () => [
  { id: 'packet-1', symbol: '♦', label: 'Diamond', tones: ['low', 'high'] },
  { id: 'packet-2', symbol: '✚', label: 'Cross', tones: ['mid', 'low'] },
  { id: 'packet-3', symbol: '●', label: 'Circle', tones: ['high', 'mid'] },
  { id: 'packet-4', symbol: '▲', label: 'Triangle', tones: ['low', 'low'] },
  { id: 'packet-5', symbol: '■', label: 'Square', tones: ['mid', 'high'] },
];

test('receiver playback requires explicit enabled active audible sound and returns useful failures', async t => {
  const f = fixture(t, { atmosphere: 0 }); f.audio.setActive(true);
  assert.equal((await f.audio.playPuzzleSignal(receiverPackets())).reason, 'disabled');
  assert.equal(f.audio.enabled, false); assert.equal(f.creations(), 0);
  f.audio.setEnabled(true); f.audio.setActive(false);
  assert.equal((await f.audio.playPuzzleTone('low')).reason, 'inactive');
  f.audio.setActive(true); f.audio.setVolume(0);
  assert.equal((await f.audio.playPuzzleTone('low')).reason, 'volume-zero');
  f.audio.setVolume(.6); f.document.hidden = true; f.document.dispatch('visibilitychange');
  assert.equal((await f.audio.playPuzzleTone('low')).reason, 'hidden');
  assert.equal(f.creations(), 0, 'failed gates neither create a context nor auto-enable audio');
  f.document.hidden = false; f.document.dispatch('visibilitychange'); f.context.rejectResume = true;
  const failure = await f.audio.playPuzzleTone('low');
  assert.equal(failure.reason, 'resume-required'); assert.match(failure.message, /Play|visual/);
  assert.equal(f.context.live.size, 0);
  f.context.rejectResume = false;
  assert.equal((await f.audio.playPuzzleTone('low')).ok, true, 'a later deliberate gesture can recover');
  f.audio.dispose(); assert.equal((await f.audio.playPuzzleTone('high')).reason, 'closed');
  const unsupported = fixture(t, { contextFactory: null, enabled: true }); unsupported.audio.setActive(true);
  assert.equal((await unsupported.audio.playPuzzleTone('low')).reason, 'unavailable');
});

test('receiver validates bounded packet snapshots before creating audio', async t => {
  const f = fixture(t, { enabled: true, atmosphere: 0 }); f.audio.setActive(true);
  for (const packets of [null, [], new Array(5), Array(6).fill({ tones: ['low', 'mid'] }),
    [{ tones: new Array(2) }], [{ tones: ['low'] }], [{ tones: ['low', 'mid', 'high'] }],
    [{ tones: ['__proto__', 'high'] }], [{ tones: [330, 550] }]]) {
    assert.equal((await f.audio.playPuzzleSignal(packets)).reason, 'invalid-signal');
  }
  for (const packetIndex of [-1, 5, .5, NaN, '1']) {
    assert.equal((await f.audio.playPuzzleSignal(receiverPackets(), { packetIndex })).reason, 'invalid-signal');
  }
  assert.equal((await f.audio.playPuzzleTone('not-a-tone')).reason, 'invalid-signal');
  assert.equal(f.creations(), 0); assert.equal(f.context.started.length, 0);
});

test('receiver resumes in the gesture and schedules ten separated mono tones on the audio clock', async t => {
  const f = fixture(t, { enabled: true, atmosphere: 0 }); f.audio.setActive(true); f.audio.setRoom('annexListening');
  const packets = receiverPackets(), progress = [], ended = [];
  const playing = f.audio.playPuzzleSignal(packets, { onProgress: value => progress.push(value), onEnded: value => ended.push(value) });
  assert.equal(f.creations(), 1); assert.equal(f.context.resumeCalls, 1, 'resume happens before the method returns');
  packets[0].tones[0] = 'high'; packets.length = 0;
  const result = await playing; assert.equal(result.ok, true); assert(Math.abs(result.duration - 8.08) < .001);
  const voice = f.audio._signal.voice;
  assert.equal(voice.sources.length, 10); assert.equal(voice.panner, null);
  assert(voice.output.connections.has(f.audio._master), 'the mono receiver bypasses room echo and spatial pan');
  assert(!voice.output.connections.has(f.audio._effects));
  for (let i = 0; i < voice.sources.length; i++) {
    const source = voice.sources[i]; assert.equal(source.buffer.numberOfChannels, 1); assert.equal(source.playbackRate.value, 1);
    assert(Math.abs(source.buffer.duration - .4) < .001);
    if (i) {
      const expectedGap = i % 2 ? .24 : .7;
      assert(Math.abs(source.startedAt - (voice.sources[i - 1].startedAt + .4) - expectedGap) < .001);
    }
  }
  const first = voice.sources[0].buffer;
  await f.audio.playPuzzleTone('low');
  assert.strictEqual(f.audio._signal.voice.sources[0].buffer, first, 'calibration and a snapshotted packet use the identical cached tone');
  assert.deepEqual(ended, [{ reason: 'replaced' }]);
  assert(progress.every(value => Object.keys(value).sort().join(',') === 'packetIndex,phase,playing,toneIndex'));
  assert(!JSON.stringify(progress).match(/low|mid|high|Diamond|♦|330|550|880/));
});

test('single-packet replay preserves its transmission index and progress reveals no pitch content', async t => {
  const f = fixture(t, { atmosphere: 0 }); await play(f); const progress = [], ended = [];
  const result = await f.audio.playPuzzleSignal(receiverPackets(), { packetIndex: 2,
    onProgress: value => progress.push(value), onEnded: value => ended.push(value) });
  assert.equal(result.ok, true); assert(Math.abs(result.duration - 1.12) < .001);
  const sources = [...f.audio._signal.voice.sources]; assert.equal(sources.length, 2);
  f.context.advance(.1); f.audio.update();
  assert.deepEqual(progress.at(-1), { playing: true, packetIndex: 2, toneIndex: 0, phase: 'tone' });
  f.context.advance(.4); f.audio.update();
  assert.deepEqual(progress.at(-1), { playing: true, packetIndex: 2, toneIndex: null, phase: 'gap' });
  f.context.advance(.24); f.audio.update();
  assert.deepEqual(progress.at(-1), { playing: true, packetIndex: 2, toneIndex: 1, phase: 'tone' });
  f.context.advance(5); f.audio.update(); f.audio.update();
  assert.deepEqual(ended, [{ reason: 'completed' }]); assert.equal(f.audio._signal, null);
  assert.equal(progress.at(-1).playing, false); assert.equal(progress.at(-1).phase, 'ended');
  assert(sources.every(source => source.ended)); assert.equal(f.context.live.size, 0);
});

test('closing, changing rooms, pausing, muting, hiding and interruption cancel all scheduled receiver tones', async t => {
  const cases = [
    ['panel-closed', f => f.audio.stopPuzzleSignal('panel-closed')],
    ['room-changed', f => f.audio.setRoom('annexRelease')],
    ['inactive', f => f.audio.setActive(false)],
    ['disabled', f => f.audio.setEnabled(false)],
    ['volume-zero', f => f.audio.setVolume(0)],
    ['hidden', f => { f.document.hidden = true; f.document.dispatch('visibilitychange'); }],
    ['hidden', f => f.window.dispatch('pagehide')],
    ['interrupted', f => f.context.setState('interrupted')],
    ['disposed', f => f.audio.dispose()],
  ];
  for (const [reason, cancel] of cases) await t.test(reason, async child => {
    const f = fixture(child, { atmosphere: 0 }); await play(f); f.audio.setRoom('annexListening');
    const ended = []; await f.audio.playPuzzleSignal(receiverPackets(), { onEnded: value => ended.push(value) });
    const sources = [...f.audio._signal.voice.sources]; cancel(f); await settle();
    assert.equal(f.audio._signal, null); assert(sources.every(source => source.ended && source.disconnected));
    assert.deepEqual(ended, [{ reason }]);
    f.context.advance(20); f.audio.update(); await settle();
    assert.deepEqual(ended, [{ reason }]); assert.equal(f.context.live.size, 0);
    if (reason === 'hidden' || reason === 'interrupted') {
      f.document.hidden = false; f.document.dispatch('visibilitychange'); f.window.dispatch('pageshow'); await f.audio.unlock();
      assert.equal(f.audio._signal, null); assert.equal(f.context.live.size, 0, 'returning never resumes a cancelled signal');
    }
  });
});

test('pending receiver resumes resolve cancellation promptly and stale gestures cannot start old packets', async t => {
  const f = fixture(t, { enabled: true, atmosphere: 0 }); f.audio.setActive(true); f.context.deferResume = true;
  const ended = [];
  const cancelled = f.audio.playPuzzleSignal(receiverPackets(), { onEnded: value => ended.push(value) });
  f.audio.stopPuzzleSignal('panel-closed');
  assert.equal((await cancelled).reason, 'cancelled', 'closing does not wait for a possibly blocked native resume promise');
  f.context.pendingResumes.shift()(); await settle();
  assert.equal(f.context.live.size, 0); assert.deepEqual(ended, [{ reason: 'panel-closed' }]);

  f.context.setState('interrupted');
  const old = f.audio.playPuzzleTone('low'), latest = f.audio.playPuzzleTone('high');
  assert.equal((await old).reason, 'cancelled');
  for (const finish of f.context.pendingResumes.splice(0)) finish();
  assert.equal((await latest).ok, true); assert.equal(f.context.live.size, 1);
  const high = f.audio._signal.voice.sources[0].buffer;
  await f.audio.playPuzzleTone('high');
  assert.strictEqual(f.audio._signal.voice.sources[0].buffer, high);
  assert.equal(f.context.live.size, 1, 'only the latest request can retain a source');
});

test('a global gesture resume cannot reject the current receiver after the context has started', async t => {
  const f = fixture(t, { enabled: true, atmosphere: 0 }); f.audio.setActive(true);
  const playing = f.audio.playPuzzleTone('mid');
  const globalGesture = f.audio.unlock();
  assert.equal((await playing).ok, true); assert.equal(await globalGesture, true);
  assert.equal(f.context.live.size, 1); assert.equal(f.audio._signal.status, 'playing');
});

test('receiver ducks ambience, suppresses incidental cues and keeps replay source/cache budgets bounded', async t => {
  const f = fixture(t); await play(f); f.audio.setRoom('annexListening');
  const normalLevel = f.audio.atmosphere ** 1.2;
  f.audio.cue('door'); f.audio._murmur();
  for (let i = 0; i < 40; i++) {
    await f.audio.playPuzzleSignal(receiverPackets());
    assert.equal(f.audio._voices.size, 2, 'one ambient bed and one receiver voice');
    assert.equal(f.context.live.size, 13, 'three bed loops and at most ten scheduled tones');
    assert(f.audio._atmosphere.gain.value <= normalLevel * .13);
    assert.equal(f.audio.cue('key'), false); assert.equal(f.audio._step(false), false);
    f.audio._nextAmbient = 0;
    f.context.advance(.1); f.audio.update({ dt: .1, pose: { x: 0, z: 0 } });
    assert.equal(f.audio._voices.size, 2);
  }
  f.audio.setVolume(.7); assert(f.audio._atmosphere.gain.value <= normalLevel * .13, 'settings changes retain the receiver duck');
  f.audio.stopPuzzleSignal('panel-closed');
  assert.equal(f.context.live.size, 3); assert.equal(f.audio._atmosphere.gain.value, normalLevel);
  assert(f.context.peakSources <= 24); assert(f.audio._bufferBytes <= 4 * 1024 * 1024);
  assert.equal(f.fetches(), 0);
  await f.audio.playPuzzleSignal(receiverPackets()); f.audio.setAtmosphere(0);
  assert.equal(f.audio._signal.voice.sources.length, 10, 'the atmosphere slider cannot suppress the receiver');
  f.audio.stopPuzzleSignal(); assert.equal(f.context.live.size, 0);
});

test('receiver callback exceptions do not leak voices or break later playback', async t => {
  const f = fixture(t, { atmosphere: 0 }); await play(f);
  const options = { onProgress() { throw new Error('Panel disappeared'); }, onEnded() { throw new Error('Panel disappeared'); } };
  assert.equal((await f.audio.playPuzzleTone('mid', options)).ok, true);
  f.context.advance(1); f.audio.update();
  assert.equal(f.audio._signal, null); assert.equal(f.context.live.size, 0);
  assert.equal((await f.audio.playPuzzleTone('low')).ok, true); f.audio.stopPuzzleSignal();
  assert.equal(f.context.live.size, 0);
});
