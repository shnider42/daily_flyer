import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../public/audio.mjs';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push(['target', value, time, duration]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); }
}
class Node {
  constructor() {
    this.connections = []; this.gain = new Param(); this.frequency = new Param(); this.Q = new Param();
    this.playbackRate = new Param(1); this.pan = new Param();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param();
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
  start(time = 0, offset = 0) { this.startedAt = time; this.offset = offset; }
  stop(time = 0) { this.stoppedAt = time; }
}
class Context {
  constructor() { this.sampleRate = 8000; this.currentTime = 0; this.state = 'suspended'; this.destination = new Node(); this.sources = []; this.listeners = new Map(); }
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createConvolver() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, duration: length / sampleRate, getChannelData: channel => data[channel] };
  }
  async decodeAudioData() { return this.createBuffer(1, 17600, this.sampleRate); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  async resume() { this.state = 'running'; this.listeners.get('statechange')?.(); }
}

function setup(t, { failedAssets = false } = {}) {
  const originalContext = globalThis.AudioContext, originalDocument = globalThis.document;
  const timers = new Map(), listeners = new Map(); let nextTimer = 0;
  const document = { hidden: false, documentElement: { dataset: {} }, addEventListener: (type, callback) => listeners.set(type, callback) };
  globalThis.AudioContext = Context; globalThis.document = document;
  t.mock.method(globalThis, 'setInterval', callback => { const id = ++nextTimer; timers.set(id, callback); return id; });
  t.mock.method(globalThis, 'clearInterval', id => timers.delete(id));
  t.mock.method(globalThis, 'fetch', async () => {
    if (failedAssets) throw new Error('Offline');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  const audio = new GameAudio();
  t.after(() => { audio.stop(); globalThis.AudioContext = originalContext; globalThis.document = originalDocument; });
  return { audio, timers, document,
    async unlock() { await audio.unlock(); await new Promise(resolve => setImmediate(resolve)); },
    advance(seconds) {
      audio.context.currentTime += seconds;
      for (const source of audio.context.sources) if (!source.disconnected && source.stoppedAt <= audio.context.currentTime) source.onended?.();
      for (const callback of [...timers.values()]) callback();
    },
    visibility(hidden) { document.hidden = hidden; listeners.get('visibilitychange')?.(); },
    contextState(state) { audio.context.state = state; audio.context.listeners.get('statechange')?.(); },
  };
}

test('menu waits for a gesture, opens with a recorded command, and stays sparse', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('menu');
  assert.equal(audio.context, null);
  assert.equal(h.timers.size, 0);
  await h.unlock();
  assert.equal(h.timers.size, 1);
  assert.ok(audio.loops.has('menu:wind'));
  h.advance(1.8);
  const voice = [...audio.voices].find(v => v.source.buffer === audio.samples.get('commandMove'));
  assert.ok(voice, 'the first voice is the complete move-out recording');
  assert.equal(voice.bus, 'menu');
  assert.equal(voice.priority, -2);
  assert.ok(voice.nodes.some(node => node?.connections.includes(audio.menuBus)));
  assert.ok(audio.menuBus.connections.includes(audio.ambienceBus));
  const scheduledAt = audio.menuSchedule.radioAt;
  audio.setScene('menu'); audio.setScene('menu');
  assert.equal(h.timers.size, 1, 'repeated scene selection does not create extra schedulers');
  assert.equal(audio.menuSchedule.radioAt, scheduledAt);
  assert.ok(scheduledAt - audio.context.currentTime >= 11);
  h.advance(3);
  assert.ok(audio.loops.has('menu:rotor'));
  assert.ok(audio.voices.size <= 3, 'opening speech is not a continuous chatter loop');
});

test('menu-to-mission crossfade cancels background scheduling and preserves effects routing', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('menu'); await h.unlock(); h.advance(1.8);
  const wind = audio.loops.get('menu:wind');
  audio.setScene('mission');
  assert.equal(h.timers.size, 0);
  assert.equal(audio.menuBus.gain.value, 0);
  assert.equal(audio.missionAmbienceBus.gain.value, 1);
  assert.ok(wind.source.stoppedAt > audio.context.currentTime, 'the outgoing loop gets a fade tail');
  assert.equal([...audio.voices].filter(v => v.bus === 'menu').length, 0);
  audio.click();
  assert.ok([...audio.voices].some(v => v.nodes.some(node => node?.connections.includes(audio.effectsBus))));
  audio.setScene('paused');
  assert.equal(audio.loops.size, 0); assert.equal(audio.voices.size, 0); assert.equal(h.timers.size, 0);
});

test('menu uses ambience volume independently of effects and respects mute', async t => {
  const h = setup(t), { audio } = h;
  audio.setLevels({ effects: 0, ambience: .4, master: .8 });
  audio.setScene('menu'); await h.unlock(); h.advance(1.8);
  assert.equal(audio.effectsBus.gain.value, 0); assert.equal(audio.ambienceBus.gain.value, .4);
  assert.ok([...audio.voices].some(v => v.source.buffer === audio.samples.get('commandMove')));
  audio.setLevels({ ambience: 0 });
  assert.equal(h.timers.size, 0); assert.equal(audio.loops.size, 0); assert.equal(audio.voices.size, 0);
  assert.equal(h.document.documentElement.dataset.audioLoops, '0');
  assert.equal(h.document.documentElement.dataset.audioMenuScheduler, 'stopped');
  audio.setLevels({ ambience: .4 }); assert.equal(h.timers.size, 1);
  assert.equal(h.document.documentElement.dataset.audioMenuScheduler, 'running');
  audio.setEnabled(false);
  assert.equal(audio.master.gain.value, 0); assert.equal(h.timers.size, 0); assert.equal(audio.loops.size, 0);
  audio.setEnabled(true); assert.equal(h.timers.size, 1);
});

test('hidden and suspended contexts stop all scheduling without automatically resuming a suspended context', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('menu'); await h.unlock(); h.advance(1.8);
  h.visibility(true);
  assert.equal(h.timers.size, 0); assert.equal(audio.loops.size, 0); assert.equal(audio.voices.size, 0);
  h.contextState('suspended'); h.visibility(false);
  assert.equal(h.timers.size, 0); assert.equal(audio.context.state, 'suspended');
  await h.unlock(); assert.equal(h.timers.size, 1);
  h.contextState('suspended');
  assert.equal(h.timers.size, 0); assert.equal(audio.loops.size, 0);
});

test('mission recordings follow movement radio calls and never contradict hold or casualty messages', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = { time: 0, status: 'playing', missionIndex: 1, playerId: 'hale', squad: [{ id: 'hale', x: 0, y: 0, hp: 100 }],
    radio: [], stats: { shots: 0 }, soundEvents: [], vehicles: [], world: { roads: [], buildings: [] } };
  audio.tick(state, .016);
  state.radio.push({ id: 1, text: 'Move to your marker.', speaker: 'HALE' }); audio.tick(state, .016);
  assert.ok([...audio.voices].some(v => v.source.buffer === audio.samples.get('commandMove') && v.priority === 3));
  h.advance(4);
  for (const [id, text] of [[2, 'Hold this position.'], [3, 'Webb down. Need help here.']]) {
    state.radio.push({ id, text }); audio.tick(state, .016);
    assert.equal([...audio.voices].filter(v => v.source.buffer === audio.samples.get('commandMove') || v.source.buffer === audio.samples.get('commandGo')).length, 0);
  }
  state.radio.push({ id: 4, text: 'Smoke out. Keep moving.' }); audio.tick(state, .016);
  assert.ok([...audio.voices].some(v => v.source.buffer === audio.samples.get('commandGo')));
});

test('missing recordings fall back quietly without blocking menu playback', async t => {
  const h = setup(t, { failedAssets: true }), { audio } = h;
  audio.setScene('menu'); await h.unlock(); h.advance(5.2);
  assert.equal(audio.sampleStatus.commandMove, 'fallback');
  assert.equal(audio.loops.get('menu:wind').buffer, audio.noise);
  assert.ok(audio.voices.size > 0 && audio.voices.size <= 8);
  assert.ok([...audio.voices].every(v => v.bus === 'menu' && v.priority === -2));
  assert.equal(h.timers.size, 1);
});

test('crossing a doorway softly muffles exterior ambience and adds restrained room reflections', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const player = { x: 99, y: 150 };
  const state = { time: 10, missionIndex: 0, world: { buildings: [{ x: 100, y: 100, w: 200, h: 200, enterable: true }] },
    vehicles: [{ id: 'convoy', x: 0, y: 150, active: true, kind: 'truck' }] };
  audio._ambience(state, player, .016);
  const outside = new Map(['wind', 'rotor', 'engine'].map(key => {
    const loop = audio.loops.get(key);
    return [key, { loop, gain: loop.volume.gain.value, cutoff: loop.low.frequency.value }];
  }));
  const outsideReflections = audio.reverbReturn.gain.value;
  player.x = 101; audio._ambience(state, player, .016);
  for (const [key, before] of outside) {
    const loop = audio.loops.get(key);
    assert.equal(loop, before.loop, `${key} keeps playing through the threshold`);
    assert.ok(loop.volume.gain.value < before.gain && loop.volume.gain.value > before.gain * .5, `${key} is attenuated, not silenced`);
    assert.ok(loop.low.frequency.value < before.cutoff, `${key} loses exterior high frequencies`);
    for (const param of [loop.volume.gain, loop.low.frequency]) {
      const event = param.events.at(-1);
      assert.equal(event[0], 'target'); assert.ok(event[3] >= .15, 'threshold transitions use a smooth audio ramp');
    }
  }
  assert.ok(audio.reverbReturn.gain.value > outsideReflections);
  assert.ok(audio.reverbReturn.gain.value <= outsideReflections + .045);
  assert.equal(audio.reverbReturn.gain.events.at(-1)[3], .3);
  player.x = 99; audio._ambience(state, player, .016);
  for (const [key, before] of outside) {
    assert.equal(audio.loops.get(key).volume.gain.value, before.gain);
    assert.equal(audio.loops.get(key).low.frequency.value, before.cutoff);
  }
  assert.equal(audio.reverbReturn.gain.value, outsideReflections);
});
