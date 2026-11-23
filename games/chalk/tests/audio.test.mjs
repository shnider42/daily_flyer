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

test('launcher, blast, and sniper events remain spatial, bounded, and governed by mute', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const player = { id: 'mercer', x: 200, y: 200 };
  audio._event({ type:'shot', weapon:'sniper', actorId:'sniper', team:'enemy', x:780, y:200 },player);
  assert.ok([...audio.voices].some(v => v.source.buffer === audio.samples.get('hostile')),'sniper uses the opposing report recording');
  const before = audio.voices.size;
  audio._event({ type:'explosion', x:2000, y:2000 },player);
  assert.equal(audio.voices.size,before,'inaudibly distant blasts do not allocate voices');
  audio._event({ type:'grenade_launch', actorId:'mercer', x:200, y:200 },player);
  assert.ok(audio.voices.size > before);
  for (let i=0;i<25;i++) audio._event({ type:'explosion', x:320, y:200 },player);
  assert.ok(audio.voices.size <= 32,'burst events obey the existing audio voice cap');
  audio.setEnabled(false);
  audio._event({ type:'grenade_launch', actorId:'mercer', x:200, y:200 },player);
  audio._event({ type:'explosion', x:320, y:200 },player);
  assert.equal(audio.voices.size,0,'mute also governs the new weapons');
});

function missionState(extra = {}) {
  return { seed: 173, time: 1, status: 'playing', missionIndex: 1, playerId: 'hale',
    squad: [{ id: 'hale', x: 0, y: 0, hp: 100, alive: true, team: 'squad' }],
    radio: [], stats: { shots: 0 }, soundEvents: [], vehicles: [], world: { roads: [], buildings: [] }, ...extra };
}
const distressVoices = audio => [...audio.voices].filter(voice => voice.bus === 'distress');

test('hits layer recorded pain and local gear impact once, with per-actor voice spacing', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0]; audio.tick(state, .016);
  const hit = { type: 'victim_hit', actorId: player.id, victimId: player.id, x: 0, y: 0, team: 'squad', alive: true, damage: 15, cause: 'bullet' };
  audio._event(hit, player, state);
  assert.equal(audio.voices.size, 3, 'one cloth impact, one low impact, and one performed voice');
  const voice = distressVoices(audio)[0];
  assert.equal(voice.source.buffer, audio.samples.get('pain1'));
  assert.equal(voice.priority, 4, 'player pain can displace low-priority ambience');
  assert.ok(voice.nodes.some(node => node?.connections.includes(audio.distressBus)));
  assert.ok(audio.distressBus.connections.includes(audio.effectsBus));
  assert.ok(!voice.nodes.some(node => node?.connections.includes(audio.reverbInput)), 'distress cannot bypass its volume through reverb');
  audio._event(hit, player, state); assert.equal(audio.voices.size, 3, 'a burst does not duplicate the same immediate impact');
  h.advance(.2); audio._event(hit, player, state);
  assert.equal(distressVoices(audio).length, 1, 'rapid further wounds play foley without repeated cries');
  h.advance(2.2); audio._event(hit, player, state);
  assert.equal(distressVoices(audio)[0].source.buffer, audio.samples.get('pain2'), 'later wounds alternate performances');
});

test('fatal, stale, and inaudibly distant victims never call out', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = missionState({ enemies: [{ id: 'dead', alive: false, x: 40, y: 0 }] }), player = state.squad[0];
  const hit = { type: 'victim_hit', actorId: 'dead', victimId: 'dead', team: 'enemy', x: 40, y: 0, alive: true, damage: 12, cause: 'bullet' };
  audio._event(hit, player, state);
  assert.equal(distressVoices(audio).length, 0, 'current death state overrides an earlier living snapshot event');
  assert.equal(audio.voices.size, 2, 'impact foley remains audible at the moment of impact');
  h.advance(1);
  audio._event({ ...hit, victimId: 'fatal', actorId: 'fatal', alive: false }, player, state);
  assert.equal(distressVoices(audio).length, 0);
  const before = audio.voices.size;
  audio._event({ ...hit, victimId: 'far', actorId: 'far', x: 900, alive: true }, player, state);
  audio._event({ ...hit, type: 'civilian_fear', victimId: 'far', actorId: 'far', x: 900, alive: true }, player, state);
  assert.equal(audio.voices.size, before, 'unseen distant hits do not reveal victims through sound');
  audio._event({ type: 'civilian_fear', victimId: 'frightened', actorId: 'frightened', x: 30, y: 0, alive: true }, player, state);
  assert.equal(distressVoices(audio).length, 1);
  audio._event({ ...hit, victimId: 'frightened', actorId: 'frightened', alive: false }, player, state);
  assert.equal(distressVoices(audio).length, 0, 'a current cry ends promptly when that person dies');
});

test('fear is a sparse spatial response from living civilians and muffles across interiors', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0];
  const fear = { type: 'civilian_fear', victimId: 'civilian1', actorId: 'civilian1', alive: true, downed: false, team: 'civilian', x: 140, y: 0 };
  audio._event(fear, player, state);
  let voice = distressVoices(audio)[0]; assert.equal(voice.source.buffer, audio.samples.get('fear1'));
  const clearGain = voice.envelope.gain.events.find(event => event[0] === 'linear')[1];
  assert.ok(voice.nodes.some(node => node?.pan.value > 0), 'voice pans toward the person');
  audio._event({ ...fear, actorId: 'civilian2', victimId: 'civilian2' }, player, state);
  assert.equal(distressVoices(audio).length, 1, 'global spacing prevents a crowd scream loop');
  h.advance(5); audio._event(fear, player, state);
  assert.equal(distressVoices(audio).length, 0, 'the same civilian stays quiet through its own cooldown');
  state.world.buildings.push({ x: 100, y: -100, w: 200, h: 200, enterable: true });
  audio._event({ ...fear, actorId: 'civilian2', victimId: 'civilian2' }, player, state);
  voice = distressVoices(audio)[0]; assert.equal(voice.source.buffer, audio.samples.get('fear2'));
  assert.ok(voice.envelope.gain.events.find(event => event[0] === 'linear')[1] < clearGain * .55);
  assert.ok(voice.nodes.some(node => node?.type === 'lowpass' && node.frequency.value === 1350));
  h.advance(13);
  audio._event({ ...fear, alive: false }, player, state);
  audio._event({ ...fear, downed: true }, player, state);
  assert.equal(distressVoices(audio).length, 0, 'dead or downed people do not emit fear cries');
  assert.equal([...audio.loops.keys()].filter(key => /fear|pain/.test(key)).length, 0);
});

test('distress volume silences voices independently while preserving impact and commands', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0];
  audio._event({ type: 'civilian_fear', victimId: 'c', x: 100, y: 0, alive: true }, player, state);
  assert.equal(distressVoices(audio).length, 1);
  audio.setLevels({ distress: 0 }); assert.equal(audio.distressBus.gain.value, 0); assert.equal(distressVoices(audio).length, 0);
  audio._event({ type: 'victim_hit', victimId: player.id, x: 0, y: 0, alive: true, cause: 'bullet' }, player, state);
  assert.equal(audio.voices.size, 2); assert.equal(audio.effectsBus.gain.value, 1);
  audio._radio({ text: 'Move to your marker.' });
  assert.ok([...audio.voices].some(voice => voice.source.buffer === audio.samples.get('commandMove')));
  assert.equal(audio.setLevels({ distress: 4 }).distress, 1);
  assert.equal(audio.setLevels({ distress: NaN }).distress, 1);
  audio.setEnabled(false); assert.equal(audio.voices.size, 0);
});

test('repeated co-op snapshots and unmuting do not replay injury or fear events', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  let state = missionState();
  state.soundEvents = [{ id: 1, time: 1, type: 'victim_hit', victimId: 'hale', actorId: 'hale', x: 0, y: 0, alive: true, cause: 'bullet' }];
  audio.tick(state, .016);
  const before = audio.context.sources.length;
  state = structuredClone(state); state.time += .05; audio.tick(state, .05);
  assert.equal(audio.context.sources.length, before, 'same mission snapshots retain event cursor and loops');
  audio.setEnabled(false);
  state = structuredClone(state); state.time += .05;
  state.soundEvents.push({ id: 2, time: state.time, type: 'civilian_fear', victimId: 'c', x: 120, y: 0, alive: true });
  audio.tick(state, .05); assert.equal(audio.lastEventId, 2);
  audio.setEnabled(true); state = structuredClone(state); audio.tick(state, .016);
  assert.equal(distressVoices(audio).length, 0, 'events consumed while muted stay consumed');
  state.seed++; state.soundEvents = [{ id: 1, time: state.time, type: 'victim_hit', victimId: 'hale', actorId: 'hale', x: 0, y: 0, alive: true }];
  audio.tick(state, .016); assert.equal(distressVoices(audio).length, 1, 'a genuinely new mission resets the event cursor');
});

test('wreck ambience follows the actual crash, recedes at night, and gives way to commands', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = missionState({ vehicles: [{ id: 'crash', kind: 'helicopter', active: false, x: 140, y: 0 }] });
  const player = state.squad[0]; audio.tick(state, .016);
  assert.ok(audio.loops.has('wreck-fire'));
  const fire = audio.loops.get('wreck-fire'), gain = fire.volume.gain.value;
  state.missionIndex = 2; audio._ambience(state, player, .016);
  assert.ok(fire.volume.gain.value < gain, 'night ambient bed is more restrained');
  const nightGain = fire.volume.gain.value;
  audio._radio({ text: 'Move to your marker.' }); audio._ambience(state, player, .016);
  assert.ok(fire.volume.gain.value < nightGain * .7, 'ambient bed ducks during a human command');
  player.x = 800; audio._ambience(state, player, .016);
  assert.equal(audio.loops.has('wreck-fire'), false, 'a distant crash does not create a global fire loop');
  audio.setScene('paused'); assert.equal(audio.loops.size, 0); assert.equal(audio.voices.size, 0);
});
