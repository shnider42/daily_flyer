import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GameAudio } from '../public/audio.mjs';
import { VOICE_LINES } from '../public/squad-voice-lines.mjs';
import { FIELD_RADIO_SPEAKER } from '../public/squad-voice.mjs';
import { reverbImpulseData, environmentAt, eventEnvironment, acousticLineBlocked } from '../public/audio-environments.mjs';
import { prepareBuildingInteriors } from '../public/building-geometry.mjs';
import { SQUAD_ROLES } from '../public/squad-roles.mjs';
import { WORLD_UNITS_PER_METRE, SOUND_SPEED_MPS, MAX_PENDING_ARRIVALS, acousticTravelDelay,
  acousticSourceTime, acousticArrivalTime, acousticHearingRange, reportProfile } from '../public/acoustics.mjs';

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
  async decodeAudioData(bytes) { return this.createBuffer(1, bytes.byteLength === 16 ? 240000 : 17600, this.sampleRate); }
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
  t.mock.method(globalThis, 'fetch', async url => {
    if (failedAssets) throw new Error('Offline');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer((String(url).includes('squad-voice-bank') || String(url).includes('field-radio-bank')) ? 16 : 8) };
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

test('room response starts densely while the street response has separated later reflections', () => {
  const room=reverbImpulseData(8000,'room'),street=reverbImpulseData(8000,'street');
  const energy=(data,from,to)=>data.slice(Math.floor(from*8000),Math.floor(to*8000)).reduce((sum,v)=>sum+v*v,0);
  assert.ok(energy(room[0],0,.06)>.35);
  assert.equal(energy(street[0],0,.06),0);
  assert.ok(energy(street[0],.14,.6)>energy(room[0],.14,.6)*5);
  assert.ok(street[0].length>room[0].length);
  assert.notDeepEqual(room[0],room[1], 'stereo responses do not collapse to identical channels');
  assert.deepEqual(room,reverbImpulseData(8000,'room'));
  for(const data of [...room,...street]) assert.ok(data.every(value=>Number.isFinite(value)&&Math.abs(value)<.8));
});

test('the established room and indirect response waveforms remain unchanged', () => {
  // Captured from the published response generator before adding the exterior
  // layer: preserving these mixes is an explicit constraint of this change.
  const expected = {
    8000: { room: '92dc67e5990feb7e6b871e6ec8c3d1be69d9bcec0134d13aac8284819698cf74', street: '245b940ec855d837021aa43d60394161e59661509695e4c54d639c1ffd2bbdd3' },
    48000: { room: '079097c05effd72f5f9695c307b42a86b2ecbe6a360cc264a84eefbb256cb055', street: 'd9369cc17a83b29098d97f642c12bafb6448be320c756a7875313be1fdb04773' },
  };
  for (const rate of [8000, 48000]) for (const kind of ['room', 'street']) {
    const bytes = Buffer.concat(reverbImpulseData(rate, kind).map(channel => Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected[rate][kind], `${kind}/${rate} retains its original response`);
  }
});

test('the cached exterior response has a bounded diffuse tail beyond the old street response', () => {
  const lateEnergies = [];
  for (const rate of [8000, 48000]) {
    const channels = reverbImpulseData(rate, 'exterior'), previousLength = reverbImpulseData(rate, 'street')[0].length;
    assert.equal(channels.length, 2);
    assert.ok(channels[0].length > previousLength && channels[0].length <= rate * 4, 'the longer response retains a bounded allocation');
    assert.deepEqual(channels, reverbImpulseData(rate, 'exterior'), 'the shared response is deterministic');
    assert.notDeepEqual(channels[0], channels[1], 'the diffuse tail has stereo variation');
    const energy = data => data.reduce((sum, value) => sum + value * value, 0);
    for (const data of channels) {
      assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) < .8));
      assert.equal(energy(data.subarray(0, Math.floor(rate * .06))), 0, 'the extra tail cannot blur the direct attack');
      const late = energy(data.subarray(previousLength)), early = energy(data.subarray(0, previousLength));
      assert.ok(late > early * .005 && late < early * .25, 'there is a meaningful, decaying tail after the earlier response has ended');
      assert.ok(energy(data.subarray(-Math.floor(rate * .1))) < late * .01, 'the response fades before its allocation ends');
    }
    lateEnergies.push(energy(channels[0].subarray(previousLength)));
  }
  assert.ok(Math.abs(lateEnergies[0] / lateEnergies[1] - 1) < .15, 'device sample rate does not substantially change late-tail energy');
});

test('real doorways transmit direct sound while perimeter and partition walls muffle it', () => {
  const world={buildings:[{id:'house',x:100,y:100,w:260,h:220,tone:.5}]};prepareBuildingInteriors(world);
  const b=world.buildings[0],door=b.doors[0],outside=door.outside,inside=door.inside;
  assert.equal(acousticLineBlocked(world,outside,inside),false);
  assert.equal(eventEnvironment(world,outside,inside).occluded,false);
  assert.equal(acousticLineBlocked(world,{x:70,y:170},{x:140,y:170}),true);
  const partition=b.walls.find(w=>w.kind==='partition');
  assert.equal(acousticLineBlocked(world,{x:partition.x+12,y:partition.y-25},{x:partition.x+12,y:partition.y+25}),true);
  const before=environmentAt(world,{x:140,y:150});
  b.breaches=[{x:100,y:170},{x:360,y:170}];
  const after=environmentAt(world,{x:140,y:150});
  assert.ok(after.enclosure<before.enclosure, 'opened perimeter reduces enclosed room response');
});

test('source location selects room or street response and reflections never bypass the effects bus', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const world={buildings:[{id:'room',x:100,y:100,w:180,h:200,tone:.3}]};prepareBuildingInteriors(world);
  const player={id:1,x:170,y:180,hp:100},state={time:1,seed:1,missionIndex:4,mission:{lighting:'night'},world,vehicles:[]};
  audio._ambience(state,player,.016);
  audio._shot({id:1,type:'shot',actorId:1,x:170,y:180,weapon:'rifle',team:'squad'},player,state);
  let report=[...audio.voices].find(v=>v.source.buffer===audio.samples.get('rifle'));
  assert.ok(report.space.room>report.space.street);
  assert.ok(report.nodes.some(node=>node?.connections.includes(audio.reverbBanks.room.input)));
  for(const bank of Object.values(audio.reverbBanks))assert.ok(bank.output.connections.includes(audio.effectsBus));
  h.advance(2);player.x=50;player.y=180;audio._ambience(state,player,.016);
  audio._shot({id:2,type:'shot',actorId:1,x:50,y:180,weapon:'rifle',team:'squad'},player,state);
  report=[...audio.voices].find(v=>v.source.buffer===audio.samples.get('rifle'));
  assert.ok(report.space.street>report.space.room);
  assert.ok(report.nodes.some(node=>node?.connections.includes(audio.reverbBanks.street.input)));
});

test('only unobstructed outdoor gun reports gain the new exterior send', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const world = prepareBuildingInteriors({ buildings: [
    { id: 'left', x: 100, y: 100, w: 260, h: 700 }, { id: 'right', x: 600, y: 100, w: 260, h: 700 },
  ] });
  const door = world.buildings[0].doors[0], source = { x: 480, y: 440 }, listener = { x: 480, y: 520 };
  const player = { id: 'listener', hp: 100 }, state = { time: 10, seed: 1, missionIndex: 0, world, vehicles: [] };
  const sendTo = (voice, kind) => voice.nodes.filter(node => node?.connections.includes(audio.reverbBanks[kind].input));
  const cases = [
    { name: 'clear street', source, listener, exterior: true, legacy: [0, 1] },
    { name: 'outdoor source through an open door', source: door.outside, listener: door.inside, exterior: false, legacy: [.17095833333333335, .6360250000000001] },
    { name: 'indoor source through an open door', source: door.inside, listener: door.outside, exterior: false, legacy: [.7922916666666666, .3641916666666667] },
    { name: 'obstructed street', source, listener, exterior: false, legacy: [0, 1], blocked: true },
  ];
  for (const item of cases) {
    audio._stopVoices();
    if (item.blocked) world.walls.push({ id: 'obstruction', x: 450, y: 470, w: 60, h: 8 });
    Object.assign(player, item.listener); audio._ambience(state, player, .016);
    audio._shot({ type: 'shot', actorId: 'shooter', weapon: 'rifle', team: 'squad', ...item.source }, player, state);
    const report = [...audio.voices].find(voice => voice.kind === 'report'); assert.ok(report, item.name);
    assert.equal(report.space.occluded, Boolean(item.blocked), `${item.name} keeps the established obstruction result`);
    assert.equal(sendTo(report, 'exterior').length, item.exterior ? 1 : 0, item.name);
    assert.equal(report.space.exterior > 0, item.exterior, item.name);
    for (const [index, kind] of ['room', 'street'].entries()) {
      assert.ok(Math.abs(report.space[kind] - item.legacy[index]) < 1e-12, `${item.name} retains its ${kind} mix`);
      const sends = sendTo(report, kind);
      assert.equal(sends.length, item.legacy[index] ? 1 : 0);
      if (sends.length) assert.ok(Math.abs(sends[0].gain.value - reportProfile('rifle').wet * item.legacy[index]) < 1e-12);
    }
  }
  assert.ok(audio.reverbBanks.exterior.output.connections.includes(audio.effectsBus), 'the new return remains governed by effects and master volume');
  world.walls.pop(); Object.assign(player, listener); audio._ambience(state, player, .016);
  const space = eventEnvironment(world, source, listener); assert.ok(space.exterior > 0);
  for (const [kind, bus] of [['impact', 'effects'], ['street-echo', 'reflection'], ['distress', 'distress']]) {
    const voice = audio._voice({ buffer: audio.noise, duration: .1, wet: .5, space, kind, bus });
    assert.equal(sendTo(voice, 'exterior').length, 0, `${kind} cannot feed the new report-only response`);
  }
  const unspecified = audio._voice({ buffer: audio.noise, duration: .1, wet: .5, kind: 'report' });
  assert.equal(sendTo(unspecified, 'exterior').length, 0, 'a missing source classification does not assume clear outdoor hearing');
});

test('reflections volume can be muted without changing the dry weapon report or retaining an old tail', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const player={id:1,x:10,y:10,hp:100},state={time:0,missionIndex:0,world:{buildings:[]},vehicles:[]};
  audio._ambience(state,player,.016);const buffers={...audio.reverbBuffers},oldBanks={...audio.reverbBanks};
  audio.setLevels({reflections:0});
  audio._shot({type:'shot',actorId:1,x:10,y:10,weapon:'rifle',team:'squad'},player,state);
  const voice=[...audio.voices].find(v=>v.source.buffer===audio.samples.get('rifle'));
  assert.ok(voice);assert.ok(voice.nodes.some(n=>n?.connections.includes(audio.effectsBus)));
  for (const bank of Object.values(oldBanks)) {
    assert.ok(!voice.nodes.some(n=>n?.connections.includes(bank.input)));
    assert.equal(bank.output.gain.value,0);
  }
  audio.setLevels({reflections:.8});audio._ambience(state,player,.016);
  for (const kind of ['room', 'street', 'exterior']) {
    assert.notEqual(audio.reverbBanks[kind].convolver,oldBanks[kind].convolver);
    assert.equal(audio.reverbBuffers[kind],buffers[kind],'clearing a tail reuses the cached response');
    assert.ok(oldBanks[kind].convolver.disconnected);
  }
  const resumed={...audio.reverbBanks};
  audio.setScene('paused');audio.setScene('mission');audio._ambience(state,player,.016);
  for (const kind of ['room', 'street', 'exterior']) assert.notEqual(audio.reverbBanks[kind].convolver,resumed[kind].convolver,'quick pause cannot replay the previous tail');
});

test('running into a house preserves an outdoor tail and muffles its still-pending echoes', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const world = prepareBuildingInteriors({ buildings: [{ id: 'house', x: 100, y: 100, w: 260, h: 220, tone: .5 }] });
  const door = world.buildings[0].doors[0], player = { id: 'listener', hp: 100, ...door.outside };
  const state = { time: 10, seed: 1, missionIndex: 0, world, vehicles: [] };
  audio._ambience(state, player, .016);
  const original = { ...audio.reverbBanks }, exteriorBuffer = audio.reverbBuffers.exterior;
  assert.ok(original.exterior.output.gain.value > 0);
  const outsideGain = original.exterior.output.gain.value, outsideCutoff = original.exterior.listeningFilter.frequency.value;
  const echo = audio._voice({ buffer: audio.samples.get('rifle'), duration: .1, delay: .5, bus: 'reflection', kind: 'street-echo', priority: 0 });
  audio.nextStreetEchoAt = audio.context.currentTime + .24;
  Object.assign(player, door.inside); audio._ambience(state, player, .016);
  assert.ok(original.exterior.output.gain.value > 0 && original.exterior.output.gain.value < outsideGain);
  assert.ok(audio.voices.has(echo) && echo.source.stoppedAt > echo.start, 'the outdoor return still arrives after crossing the threshold');
  assert.equal(audio.nextStreetEchoAt, .24, 'crossing does not reset the density limiter');
  assert.ok(original.exterior.listeningFilter.frequency.value < outsideCutoff, 'already buffered energy loses high frequencies');
  assert.ok(audio.reflectionListeningGain.gain.value < 1 && audio.reflectionListeningGain.gain.value > 0);
  for (const param of [original.exterior.output.gain, original.exterior.listeningFilter.frequency, audio.reflectionListeningGain.gain])
    assert.ok(param.events.at(-1)[3] >= .18, 'listener transfer changes smoothly');
  for (const kind of ['room', 'street', 'exterior']) assert.equal(audio.reverbBanks[kind], original[kind], 'all existing responses keep running');
  h.advance(.15); audio._ambience(state, player, .15);
  assert.equal(audio.reverbBanks.exterior, original.exterior, 'remaining indoors does not allocate replacement convolvers each update');
  Object.assign(player, door.outside); audio._ambience(state, player, .016);
  assert.equal(audio.reverbBanks.exterior, original.exterior);
  assert.ok(!original.exterior.convolver.disconnected);
  assert.equal(audio.reverbBuffers.exterior, exteriorBuffer, 'returning outdoors keeps the same decay in progress');
  assert.equal(original.exterior.output.gain.value, outsideGain);
  for (const kind of ['room', 'street']) assert.equal(audio.reverbBanks[kind], original[kind]);
  const resumed = audio.reverbBanks.exterior;
  h.advance(.15); audio._ambience(state, player, .15);
  assert.equal(audio.reverbBanks.exterior, resumed, 'ordinary outdoor updates retain the same shared convolver');
});

test('menu waits for a gesture, uses background radio without movement orders, and stays sparse', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('menu');
  assert.equal(audio.context, null);
  assert.equal(h.timers.size, 0);
  await h.unlock();
  assert.equal(h.timers.size, 1);
  assert.ok(audio.loops.has('menu:wind'));
  h.advance(1.8);
  const voice = [...audio.voices].find(v => v.source.buffer === audio.samples.get('radio'));
  assert.ok(voice, 'the first voice is background radio, not an order to move out');
  assert.ok(![...audio.voices].some(v => ['commandMove', 'commandGo'].some(key => v.source.buffer === audio.samples.get(key))));
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
  assert.ok([...audio.voices].some(v => v.source.buffer === audio.samples.get('radio')));
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

test('routine orders share a minute of silence while urgent casualty speech remains contextual', async t => {
  const h = setup(t), { audio } = h;
  audio.setScene('mission'); await h.unlock();
  const state = missionState(); audio.tick(state, .016);
  const say = (id, text) => { state.radio.push({ id, text, speaker: 'HALE' }); audio.tick(state, .016); };
  say(1, 'Move to your marker.');
  const first = audio.activeSpeech;
  assert.ok(first && first.line.categories.includes('move'));
  assert.equal(first.route.mode, 'local', 'own voice is never an earpiece transmission');
  h.advance(4); say(2, 'Hold this position.');
  assert.equal(audio.activeSpeech, null, 'a second routine order is silent');
  say(3, 'Hale down. Need help here.');
  assert.equal(audio.activeSpeech.line.id, 'medic', 'a real help call can take a separate opportunity');
  h.advance(4); say(4, 'Smoke out. Keep moving.');
  assert.equal(audio.activeSpeech, null, 'smoke cannot bypass the routine-order cooldown');
  h.advance(53); say(5, 'Move to your marker.');
  assert.ok(audio.activeSpeech && audio.activeSpeech.line.id !== first.line.id);
  assert.ok(![...audio.voices].some(v => ['commandMove','commandGo'].some(key => v.source.buffer === audio.samples.get(key))), 'old movement clips are retired from play');
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

test('crossing a doorway fades exterior ambience and exchanges street reflections for a denser room response', async t => {
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
  const streetReflections = audio.reverbBanks.street.output.gain.value;
  const roomKernel = audio.reverbBanks.room.convolver;
  const streetKernel = audio.reverbBanks.street.convolver;
  player.x = 101; audio._ambience(state, player, .016);
  for (const [key, before] of outside) {
    const loop = audio.loops.get(key);
    assert.equal(loop, before.loop, `${key} keeps playing through the threshold`);
    assert.ok(loop.volume.gain.value < before.gain && loop.volume.gain.value > before.gain * .2, `${key} is attenuated, not silenced, including wall obstruction`);
    assert.ok(loop.low.frequency.value < before.cutoff, `${key} loses exterior high frequencies`);
    for (const param of [loop.volume.gain, loop.low.frequency]) {
      const event = param.events.at(-1);
      assert.equal(event[0], 'target'); assert.ok(event[3] >= .15, 'threshold transitions use a smooth audio ramp');
    }
  }
  assert.ok(audio.reverbReturn.gain.value > outsideReflections);
  assert.ok(audio.reverbReturn.gain.value > outsideReflections * 3, 'entering a house has a clearly different reverberant balance');
  assert.ok(audio.reverbBanks.street.output.gain.value < streetReflections);
  assert.equal(audio.reverbReturn.gain.events.at(-1)[3], .16);
  assert.equal(audio.reverbBanks.room.convolver, roomKernel, 'crossing does not rebuild impulse responses');
  assert.equal(audio.reverbBanks.street.convolver, streetKernel);
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

test('a hidden hostile alarm uses a real spatial event without an actor lookup, friendly words, or a radio route', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ coop: true, enemies: [], time: 10 }), player = state.squad[0];
  const event = { id: 1, type: 'hostile_shout', time: 10, sourceTime: 10, actorId: 'unseen', team: 'enemy',
    x: 500, y: 0, alive: true, variant: 1 };
  audio._event(event, player, state);
  const voice = [...audio.voices].find(value => value.kind === 'hostile-shout');
  assert.ok(voice); assert.equal(voice.source.buffer, audio.samples.get('fear2'));
  assert.equal(voice.bus, 'distress'); assert.equal(voice.priority, 1);
  assert.ok(voice.nodes.some(node => node?.pan.value > 0));
  assert.equal(audio.activeSpeech, null); assert.deepEqual(state.enemies, []);
  audio._event({ ...event, id: 2, actorId: 'other' }, player, state);
  assert.equal([...audio.voices].filter(value => value.kind === 'hostile-shout').length, 1, 'global spacing prevents a shout loop');
  h.advance(10); audio._event(event, player, state);
  assert.equal([...audio.voices].filter(value => value.kind === 'hostile-shout').length, 0, 'the same actor has a longer cooldown');
});

test('hostile alarms obey occlusion, source death, mute and unavailable recordings without synthetic voices', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0];
  const event = { type: 'hostile_shout', time: 1, actorId: 'enemy', team: 'enemy', x: 500, y: 0, alive: true, variant: 0 };
  state.world.buildings.push({ x: 100, y: -100, w: 200, h: 200, enterable: true });
  audio._event(event, player, state); assert.equal(audio.voices.size, 0, 'walls shorten the audible voice range');
  audio._event({ ...event, x: 140 }, player, state);
  const voice = [...audio.voices].find(value => value.kind === 'hostile-shout');
  assert.ok(voice.nodes.some(node => node?.type === 'lowpass' && node.frequency.value === 1350));
  h.advance(43); state.world.buildings = [];
  state.soundEvents = [{ type: 'victim_hit', actorId: event.actorId, time: 1.1, alive: false }];
  audio._event(event, player, state); assert.equal(audio.voices.size, 0, 'a later observed death cancels the obsolete source');
  state.soundEvents = []; audio.setLevels({ distress: 0 });
  audio._event(event, player, state); assert.equal(audio.voices.size, 0);
  audio.setLevels({ distress: 1 }); audio.samples.delete('fear1');
  audio._event(event, player, state); assert.equal(audio.voices.size, 0, 'missing performances remain silent');
});

test('co-op hostile alarms travel from hidden sources and duplicate snapshots never replay them', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ coop: true, time: 10, enemies: [] });
  state.soundEvents = [{ id: 1, type: 'hostile_shout', time: 10, sourceTime: 10, actorId: 'unseen', team: 'enemy',
    x: 700, y: 0, alive: true, variant: 0 }];
  audio.tick(state, .016);
  assert.equal(audio.pendingArrivals.length, 1); assert.equal(audio.voices.size, 0);
  h.advance(.3); state.time += .3; audio.tick(state, .3);
  assert.equal([...audio.voices].filter(value => value.kind === 'hostile-shout').length, 1);
  const count = audio.context.sources.length;
  state.soundEvents = structuredClone(state.soundEvents); audio.tick(state, 0);
  assert.equal(audio.context.sources.length, count);
  h.advance(2); audio.setLevels({ effects: 0 }); state.time += 2;
  state.soundEvents.push({ ...state.soundEvents[0], id: 2, time: state.time, sourceTime: state.time });
  audio.tick(state, .1); audio.setLevels({ effects: 1 }); audio.tick(state, .1);
  assert.equal([...audio.voices].filter(value => value.kind === 'hostile-shout').length, 0);
});

test('actual cannon shots use a deep cached report, propagate across the district and survive busy rifle admission', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0];
  state.world.width = 2400; state.world.height = 1900;
  audio.shotBudget = audio.distantShotBudget = audio.threatShotBudget = 0;
  const event = { id: 1, type: 'shot', sourceTime: 10, time: 10, actorId: 'tank', team: 'allied', weapon: 'tank-cannon', x: 1900, y: 0 };
  audio._queueEvent(event, player, state, 10);
  assert.equal(audio.pendingArrivals.length, 1); assert.equal(audio.pendingArrivals[0].priority, 3);
  assert.ok(audio.pendingArrivals[0].arrival > 10.6);
  audio._shot(event, player, state);
  const voice = [...audio.voices].find(value => value.kind === 'report');
  assert.ok(voice); assert.equal(voice.source.buffer, audio.fallbackReports.get('tank-cannon'));
  assert.ok(voice.end - voice.start > .75); assert.equal(voice.priority, 3);
  assert.equal(audio.lastReport.weapon, 'tank-cannon'); assert.equal(audio.lastReport.earlyReflections, 0);
  audio._shot({ ...event, sourceTime: 10.1 }, player, state);
  assert.equal([...audio.voices].filter(value => value.kind === 'report').length, 1, 'one source cannot become a rapid cannon loop');
  assert.ok(audio.voices.size <= 32); assert.ok(audio.pendingArrivals.length <= MAX_PENDING_ARRIVALS);
});

test('vehicle machine guns reuse bounded support takes and player fallback reports follow the selected role', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0];
  audio._shot({ type: 'shot', actorId: 'apc', team: 'allied', weapon: 'vehicle-mg', x: 100, y: 0 }, player, state);
  assert.equal([...audio.voices].find(value => value.kind === 'report').source.buffer, audio.samples.get('support'));
  player.role = 'sniper'; delete state.soundEvents;
  audio.tick(state, .016); state.stats.shots++; state.time += .1;
  audio.tick(state, .1);
  assert.equal(audio.lastReport.weapon, SQUAD_ROLES.sniper.weapon);
});

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
  audio._radio({ text: 'Move to your marker.', speaker: 'HALE' }, player, state);
  assert.ok([...audio.voices].some(voice => voice.kind === 'squad-speech'));
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
  audio._radio({ text: 'Move to your marker.', speaker: 'HALE' }, player, state); audio._ambience(state, player, .016);
  assert.ok(audio.missionAmbienceBus.gain.value < .7, 'all ambience ducks during a human command');
  player.x = 800; audio._ambience(state, player, .016);
  assert.equal(audio.loops.has('wreck-fire'), false, 'a distant crash does not create a global fire loop');
  audio.setScene('paused'); assert.equal(audio.loops.size, 0); assert.equal(audio.voices.size, 0);
});

test('acoustic timing uses the displayed metre scale and the source timestamp', () => {
  assert.equal(WORLD_UNITS_PER_METRE, 8); assert.equal(SOUND_SPEED_MPS, 343);
  assert.equal(acousticTravelDelay(800), 100 / 343);
  assert.equal(acousticTravelDelay(-20), 0); assert.equal(acousticTravelDelay(NaN), 0);
  assert.equal(acousticSourceTime({ time: 12, sourceTime: 11.9 }), 11.9);
  assert.equal(acousticArrivalTime({ x: 0, y: 0, time: 12, sourceTime: 11.9 }, { x: 800, y: 0 }), 11.9 + 100 / 343);
  assert.equal(acousticArrivalTime({ type: 'near_pass', time: 12, missDistance: 16 }, { x: 800, y: 0 }), 12 + 2 / 343);
});

test('a nearby impact arrives before the remote muzzle report that caused it', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }); state.squad[0].x = 800;
  state.soundEvents = [{ id: 1, type: 'shot', time: 10, sourceTime: 10, actorId: 'enemy', team: 'enemy', weapon: 'hostile', x: 0, y: 0 }];
  audio.tick(state, .016);
  assert.equal(audio.pendingArrivals.length, 1); assert.equal(audio.voices.size, 0, 'a distant report is still travelling');
  h.advance(.125); state.time += .125;
  state.soundEvents.push({ id: 2, type: 'impact', time: state.time, sourceTime: 10.125, actorId: 'enemy', x: 792, y: 0, material: 'concrete' });
  audio.tick(state, .125);
  assert.equal(audio.arrivalTrace[0].type, 'impact');
  const impactStart = Math.min(...[...audio.voices].map(v => v.start));
  assert.ok(Math.abs(impactStart - (.125 + 1 / 343)) < 1e-8);
  assert.ok(![...audio.voices].some(v => v.source.buffer === audio.samples.get('hostile')));
  h.advance(.12); state.time += .12; audio.tick(state, .12);
  const report = [...audio.voices].find(v => v.source.buffer === audio.samples.get('hostile'));
  assert.ok(report); assert.ok(Math.abs(report.start - 100 / 343) < 1e-8);
  assert.ok(report.start - impactStart > .15);
  assert.deepEqual(audio.arrivalTrace.map(event => event.type), ['impact', 'shot']);
});

test('late-discovered remote reports subtract travel already elapsed in co-op', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ coop: true, time: 10.4 }); state.squad[0].x = 1440;
  state.soundEvents = [{ id: 1, type: 'shot', time: 10, sourceTime: 10, actorId: 'enemy', weapon: 'hostile', x: 0, y: 0 }];
  audio.tick(state, .016, { presentationTime: 10.45, epoch: 'room:1' });
  const report = [...audio.voices].find(v => v.source.buffer === audio.samples.get('hostile'));
  assert.ok(report, 'an event older than0.3s can still have an upcoming arrival');
  assert.ok(Math.abs(report.start - (180 / 343 - .45)) < 1e-8);
  const sources = audio.context.sources.length;
  audio.tick(structuredClone(state), .016, { presentationTime: 10.46, epoch: 'room:1' });
  assert.equal(audio.context.sources.length, sources, 'same snapshot cannot schedule the report twice');
  state.soundEvents.push({ id: 2, type: 'shot', time: 8, sourceTime: 8, actorId: 'old', weapon: 'hostile', x: 0, y: 0 });
  audio.tick(state, .016, { presentationTime: 10.47, epoch: 'room:1' });
  assert.equal(audio.context.sources.length, sources); assert.ok(audio.propagationStats.late > 0);
});

test('only the actual controlled listener hears a supersonic near-pass crack', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0];
  const pass = { id: 1, type: 'near_pass', time: 10, sourceTime: 10, victimId: player.id, actorId: player.id,
    sourceActorId: 'enemy', bulletId: 20, speedMps: 800, missDistance: 24, x: 0, y: 24, closestX: 0, closestY: 24 };
  state.soundEvents = [pass]; audio.tick(state, .016);
  const crack = [...audio.voices].find(v => v.source.buffer === audio.crack);
  assert.ok(crack); assert.ok(Math.abs(crack.start - 3 / 343) < 1e-8);
  h.advance(.2); state.time += .2;
  state.soundEvents.push({ ...pass, id: 2, time: state.time, sourceTime: state.time, victimId: 'someone-else' },
    { ...pass, id: 3, time: state.time, sourceTime: state.time, speedMps: 300 });
  audio.tick(state, .2);
  assert.ok(![...audio.voices].some(v => v.source.buffer === audio.crack), 'other listeners and subsonic fixtures get no sonic crack');
});

for (const [name, cancel] of [
  ['pause', h => h.audio.setScene('paused')], ['mute', h => h.audio.setEnabled(false)],
  ['hidden tab', h => h.visibility(true)], ['suspension', h => h.contextState('suspended')],
  ['effects volume', h => h.audio.setLevels({ effects: 0 })], ['master volume', h => h.audio.setLevels({ master: 0 })],
]) test(`${name} cancels both pending and already-scheduled arrivals`, async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 });
  state.soundEvents = [160, 1600].map((x, i) => ({ id: i + 1, type: 'shot', time: 10, sourceTime: 10,
    actorId: `enemy${i}`, team: 'enemy', weapon: 'hostile', x, y: 0 }));
  audio.tick(state, .016);
  assert.equal(audio.pendingArrivals.length, 1);
  const scheduled = [...audio.voices].find(v => v.start > audio.context.currentTime); assert.ok(scheduled);
  const echo = audio._voice({ buffer: audio.samples.get('rifle'), duration: .1, delay: .5, bus: 'reflection', kind: 'street-echo', priority: 0 });
  assert.ok(echo); audio.nextStreetEchoAt = audio.context.currentTime + .24;
  cancel(h);
  assert.equal(audio.pendingArrivals.length, 0); assert.equal(audio.voices.size, 0);
  assert.ok(scheduled.source.stoppedAt < scheduled.start, 'a scheduled report is stopped before it can start');
  assert.ok(echo.source.stoppedAt < echo.start, 'a long outdoor echo is cancelled before it can start');
  assert.equal(audio.nextStreetEchoAt, 0);
  for (const bank of Object.values(audio.reverbBanks)) assert.equal(bank.output.gain.value, 0, 'all shared response tails are muted');
});

test('resume, role changes, stale snapshots, and short restarts never replay the old ring', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ coop: true, time: 10 }); state.squad.push({ id: 'mercer', x: 20, y: 0, hp: 100, alive: true });
  state.soundEvents = [{ id: 40, type: 'shot', time: 10, sourceTime: 10, actorId: 'enemy', weapon: 'hostile', x: 1600, y: 0 }];
  audio.tick(state, .016, { epoch: 'room:1' }); assert.equal(audio.pendingArrivals.length, 1);
  audio.setScene('paused'); h.advance(.1); state.time += .1;
  state.soundEvents.push({ ...state.soundEvents[0], id: 41, time: state.time, sourceTime: state.time });
  audio.setScene('mission'); audio.tick(state, .1, { epoch: 'room:1' });
  assert.equal(audio.pendingArrivals.length, 0); assert.equal(audio.lastEventId, 41);
  state.playerId = 'mercer'; state.time += .1;
  audio.tick(structuredClone(state), .1, { epoch: 'room:2' });
  assert.equal(audio.lastEventId, 41); assert.equal(audio.pendingArrivals.length, 0);
  const stale = structuredClone(state); stale.time = 9;
  audio.tick(stale, .016, { epoch: 'room:2' }); assert.equal(audio.lastEventId, 41); assert.equal(audio.lastStateTime, state.time);
  const restart = missionState({ time: .3, seed: 174 });
  restart.soundEvents = [{ id: 50, type: 'shot', time: .3, actorId: 'enemy', weapon: 'hostile', x: 1600, y: 0 }];
  audio.tick(restart, .016); assert.equal(audio.pendingArrivals.length, 1);
  restart.time = .05; restart.soundEvents = [{ id: 1, type: 'shot', time: .05, actorId: 'hale', weapon: 'rifle', x: 0, y: 0 }];
  audio.tick(restart, .016);
  assert.equal(audio.lastEventId, 1); assert.equal(audio.pendingArrivals.length, 0);
  assert.ok([...audio.voices].some(v => v.source.buffer === audio.samples.get('rifle')));
});

test('arrival storms stay bounded and an actual breach alone adds its debris tail', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 });
  state.soundEvents = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, type: 'shot', time: 10, sourceTime: 10,
    actorId: i + 1000, team: 'enemy', weapon: 'hostile_support', x: 1600, y: 0 }));
  audio.tick(state, .016); assert.equal(audio.pendingArrivals.length, MAX_PENDING_ARRIVALS);
  assert.equal(audio.propagationStats.dropped, 120 - MAX_PENDING_ARRIVALS);
  h.advance(.55); state.time += .55; audio.tick(state, .25);
  assert.equal(audio.pendingArrivals.length, 0); assert.ok(audio.voices.size <= 32);
  audio._stopVoices();
  audio._event({ type: 'explosion', x: 50, y: 0 }, state.squad[0], state);
  const plain = audio.voices.size; audio._stopVoices();
  audio._event({ type: 'explosion', x: 50, y: 0, breached: true, breachCount: 2 }, state.squad[0], state);
  assert.equal(audio.voices.size, plain + 2, 'one restrained debris tail per actual blast breach');
  const before = audio.voices.size; audio._event({ type: 'breach', x: 50, y: 0 }, state.squad[0], state);
  assert.equal(audio.voices.size, before, 'cosmetic breach/dust effects do not duplicate the blast');
});


test('SAW bursts use a dedicated recorded bank, vary real takes, and stay inside each source slot', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:10}),player=state.squad[0],offsets=[];
  for(let round=0;round<6;round++) {
    audio._shot({id:round+1,type:'shot',actorId:player.id,weapon:'support',x:player.x,y:player.y,team:'squad'},player,state);
    const voices=[...audio.voices],report=voices.find(v=>v.kind==='report');
    assert.equal(voices.length,1,'each open-ground shot has one complete report, without added mechanical noise layers');
    assert.equal(report.source.buffer,audio.samples.get('support'));
    assert.notEqual(report.source.buffer,audio.samples.get('rifle'));
    offsets.push(report.source.offset);
    const segmentEnd=reportProfile('support').offsets.find(offset=>offset>report.source.offset)??report.source.buffer.duration;
    assert.ok(report.source.offset+(report.source.stoppedAt-report.start)*report.source.playbackRate.value<segmentEnd,'playback cannot reach the next take');
    h.advance(.5);
  }
  assert.equal(new Set(offsets.slice(0,3)).size,3);
  assert.deepEqual(offsets.slice(0,3),offsets.slice(3));
});

test('facade taps follow the direct arrival once and the reflections slider cancels them without muting reports', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const world=prepareBuildingInteriors({buildings:[{id:'left',x:100,y:100,w:260,h:700},{id:'right',x:600,y:100,w:260,h:700}]});
  const state=missionState({time:10});state.world=world;const player=state.squad[0];Object.assign(player,{x:480,y:440});
  audio._ambience(state,player,.016);audio.eventDelay=.05;
  audio._shot({id:1,type:'shot',actorId:player.id,weapon:'rifle',x:480,y:440,team:'squad'},player,state);audio.eventDelay=0;
  const dry=[...audio.voices].find(v=>v.kind==='report'),taps=[...audio.voices].filter(v=>v.kind==='street-reflection');
  assert.equal(dry.start,.05);assert.equal(taps.length,2);
  for(const tap of taps) {
    assert.ok(Math.abs(tap.start-(.05+240/8/343))<1e-8,'the tap adds only its extra facade path');
    assert.ok(tap.priority<dry.priority);
    assert.ok(tap.nodes.some(node=>node?.connections.includes(audio.earlyReflectionBus)));
    assert.ok(!tap.nodes.some(node=>node?.connections.includes(audio.effectsBus)),'a facade return cannot bypass its own level control');
  }
  assert.ok(audio.earlyReflectionBus.connections.includes(audio.reflectionListeningFilter));
  assert.ok(audio.reflectionListeningFilter.connections.includes(audio.reflectionListeningGain));
  assert.ok(audio.reflectionListeningGain.connections.includes(audio.effectsBus));
  audio.setLevels({reflections:0});
  assert.equal(audio.earlyReflectionBus.gain.value,0);
  assert.ok(audio.voices.has(dry));assert.ok(taps.every(tap=>!audio.voices.has(tap)&&tap.source.stoppedAt<tap.start));
  h.advance(1);audio._shot({id:2,type:'shot',actorId:player.id,weapon:'rifle',x:480,y:440,team:'squad'},player,state);
  assert.equal([...audio.voices].filter(v=>v.kind==='report').length,1);
  assert.equal([...audio.voices].filter(v=>v.bus==='reflection').length,0);
});

test('long echoes stay occasional and capped while every SAW round retains its direct report', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  // A broad facade at this distance produces a real return long enough for
  // two pending echoes to overlap across several 95 ms automatic rounds.
  const world = prepareBuildingInteriors({ buildings: [{ id: 'far', x: 740, y: -200, w: 180, h: 400, tone: .4 }] });
  const player = { id: 'gunner', x: 0, y: 60, hp: 100 }, state = { time: 10, seed: 1, missionIndex: 0, world, vehicles: [] };
  const emissions = []; let maximum = 0, capacitySuppressed = false;
  audio._ambience(state, player, .016);
  for (let round = 0; round < 20; round++) {
    if (round) h.advance(SQUAD_ROLES.support.fireInterval);
    const before = new Set(audio.voices), pending = [...before].filter(voice => voice.kind === 'street-echo');
    audio.eventDelay = .05;
    const atCapacity = pending.length === 2 && audio.context.currentTime + audio.eventDelay >= audio.nextStreetEchoAt;
    audio._shot({ type: 'shot', actorId: player.id, team: 'squad', weapon: 'support', x: player.x, y: player.y }, player, state);
    audio.eventDelay = 0;
    const added = [...audio.voices].filter(voice => !before.has(voice)), reports = added.filter(voice => voice.kind === 'report');
    assert.equal(reports.length, 1, 'a queued outdoor echo cannot suppress the controlled player’s next round');
    const echoes = added.filter(voice => voice.kind === 'street-echo');
    assert.ok(echoes.length <= 1);
    assert.ok(added.filter(voice => voice.bus === 'reflection').length <= 3, 'all reflection types share a bounded per-shot allocation');
    for (const echo of echoes) {
      emissions.push(reports[0].start);
      assert.ok(Math.abs(echo.start - reports[0].start - 1480 / WORLD_UNITS_PER_METRE / SOUND_SPEED_MPS) < 1e-8, 'the return adds only the actual extra facade travel');
      assert.ok(echo.priority < reports[0].priority);
      assert.ok(echo.nodes.some(node => node?.connections.includes(audio.earlyReflectionBus)));
      assert.ok(!echo.nodes.some(node => Object.values(audio.reverbBanks).some(bank => node?.connections.includes(bank.input))), 'a late echo cannot create another reverberant tail');
    }
    const count = [...audio.voices].filter(voice => voice.kind === 'street-echo').length;
    maximum = Math.max(maximum, count); assert.ok(count <= 2, 'both waiting and sounding long echoes count toward the cap');
    if (atCapacity) { assert.equal(echoes.length, 0); capacitySuppressed = true; }
    assert.ok(audio.voices.size <= 32);
  }
  assert.equal(maximum, 2); assert.ok(capacitySuppressed, 'the fixture exercises the pending-echo cap separately from the cooldown');
  assert.ok(emissions.length >= 3 && emissions.length < 10, 'a burst has occasional echoes rather than one echo per round');
  for (let index = 1; index < emissions.length; index++) assert.ok(emissions[index] - emissions[index - 1] >= .24 - 1e-8);
});

test('direct shots displace facade returns at the voice limit and failed recordings use one cached fallback', async t => {
  const h=setup(t,{failedAssets:true}),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:10}),player=state.squad[0];
  for(let i=0;i<32;i++) audio._voice({buffer:audio.noise,duration:.15,gain:.01,bus:'reflection',priority:0,kind:'street-reflection'});
  audio._shot({type:'shot',actorId:player.id,weapon:'support',x:0,y:0,team:'squad'},player,state);
  assert.equal(audio.voices.size,32);
  const report=[...audio.voices].find(v=>v.kind==='report');assert.ok(report);
  assert.equal(report.source.buffer,audio.fallbackReports.get('support'));
  h.advance(1);
  audio._shot({type:'shot',actorId:player.id,weapon:'support',x:0,y:0,team:'squad'},player,state);
  assert.equal(audio.voices.size,1);assert.equal([...audio.voices][0].source.buffer,report.source.buffer,'fallback is generated once, not rebuilt in the firing path');
});

test('footsteps use one quiet recorded contact, alternate real takes, and stop for dead actors', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0];
  state.world.roads = [{x:0,y:0,w:800,h:120}];
  const bank = audio.context.createBuffer(1, 24000, 8000); audio.samples.set('footStone', bank);
  audio._movement(state, player, true);
  const offsets = [];
  for (let i = 0; i < 6; i++) {
    h.advance(.55); player.x += 44; audio._movement(state, player, true);
    const steps = [...audio.voices].filter(v => v.kind === 'footstep');
    assert.equal(steps.length, 1, 'there is no second synthetic scuff over a contact');
    const step = steps[0]; offsets.push(step.source.offset); assert.equal(step.source.buffer, bank);
    const gain = step.envelope.gain.events.find(e => e[0] === 'linear')[1];
    assert.ok(gain <= .0125 && gain < reportProfile('rifle').gain / 70);
    assert.ok(step.source.offset + step.source.stoppedAt - step.start - .015 < step.source.offset + .5, 'a contact stops before the adjacent take');
  }
  assert.deepEqual(offsets, [0,.5,1,1.5,2,2.5]);
  h.advance(1); player.alive = false; player.x += 50; audio._movement(state, player, true);
  assert.equal([...audio.voices].filter(v=>v.kind==='footstep').length, 0);
});

test('distant city activity reserves voices for real weapons and obeys ambience independently', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time:10 }), player = state.squad[0];
  const event = { kind:'metal', variant:'shutter', seed:17, intensity:1, x:500, y:0 };
  for (let i=0;i<8;i++) audio._cityEvent(event,player,state);
  assert.equal([...audio.voices].filter(v=>v.bus==='ambience').length,8);
  assert.ok([...audio.voices].every(v=>v.priority===-2 && v.nodes.some(n=>n?.connections.includes(audio.missionAmbienceBus))));
  for (let i=0;i<24;i++) audio._voice({buffer:audio.noise,duration:1,gain:.01,priority:0});
  assert.equal(audio.voices.size,32);
  audio._shot({type:'shot',actorId:player.id,x:0,y:0,weapon:'rifle',team:'squad'},player,state);
  assert.ok([...audio.voices].some(v=>v.kind==='report'),'the controlled weapon takes priority over a background burst');
  assert.ok(audio.voices.size<=32);
  audio.setLevels({ambience:0}); audio._cityEvent(event,player,state);
  assert.equal([...audio.voices].filter(v=>v.bus==='ambience').length,0);
  assert.ok([...audio.voices].some(v=>v.kind==='report'),'ambience mute does not silence gunfire');
});

test('city fires stay attached to visible world props and role changes cannot strand pass loops', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({time:10}); state.world.ambientFires=[{id:'car',x:90,y:0,intensity:.8}];
  state.squad.push({id:'other',x:40,y:0,hp:100,alive:true});
  audio.tick(state,.016); assert.ok(audio.loops.has('city-fire:car'));
  audio._cityEvent({kind:'engine',id:1,seed:1,x:100,y:0,toX:200,toY:0,intensity:1,duration:6},state.squad[0],state);
  state.time+=.5;audio.tick(state,.5);assert.ok(audio.loops.has('city-pass:engine:1'));
  state.playerId='other';state.time+=.05;audio.tick(state,.05);
  assert.equal(audio.cityPasses.length,0);assert.equal(audio.loops.has('city-pass:engine:1'),false);
  state.squad[1].x=900;state.time+=.05;audio.tick(state,.05);
  assert.equal(audio.loops.has('city-fire:car'),false,'a fire is local, not a global crackle bed');
  audio.setScene('paused');assert.equal(audio.loops.size,0);assert.equal(audio.cityDirector,null);
});

for (const control of ['master','ambience']) test(`${control} mute immediately discards city passes and delayed bursts before a quick unmute`, async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:10}),player=state.squad[0];audio.tick(state,.016);
  audio._cityEvent({kind:'engine',id:1,x:100,y:0,toX:200,toY:0,intensity:1,duration:6},player,state);
  audio._cityEvent({kind:'metal',variant:'shutter',seed:17,intensity:1,x:90,y:0},player,state);
  state.time+=.2;audio.tick(state,.2);assert.ok(audio.cityPasses.length&&audio.voices.size);
  audio.setLevels({[control]:0});audio.setLevels({[control]:1});
  assert.equal(audio.cityDirector,null);assert.equal(audio.cityPasses.length,0);
  assert.ok(![...audio.loops.keys()].some(key=>!key.startsWith('menu:')));
  assert.ok(![...audio.voices].some(v=>v.bus==='ambience'));
  state.time+=.01;audio.tick(state,.01);assert.ok(![...audio.voices].some(v=>v.bus==='ambience'));
});

test('one spoken source smoothly crosses local and radio paths without restarting its words', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0];
  const speaker = { id: 'webb', name: 'Webb', x: 110, y: 0, alive: true, team: 'squad' }; state.squad.push(speaker);
  audio.tick(state, .016); assert.equal(audio._say('frag', speaker, player, state), true);
  const speech = audio.activeSpeech, source = speech.voice.source, began = source.startedAt;
  assert.equal(speech.route.mode, 'local'); assert.ok(speech.pan.pan.value > 0);
  assert.equal(speech.radioGain.gain.value, 0);
  state.world.walls = [{ id: 'test-wall', x: 55, y: -50, w: 8, h: 100 }];
  h.advance(.2); state.time += .2; audio._updateSpeech(state, player);
  assert.equal(audio.activeSpeech.voice.source, source); assert.equal(source.startedAt, began);
  assert.equal(speech.route.mode, 'radio'); assert.equal(speech.localGain.gain.value, 0);
  assert.ok(speech.radioGain.gain.value > 0);
  assert.ok(speech.localGain.gain.events.some(e => e[0] === 'target' && e[3] >= .09));
  state.world.walls = []; h.advance(.2); state.time += .2; audio._updateSpeech(state, player);
  assert.equal(speech.route.mode, 'local'); assert.equal(speech.voice.source, source);
  assert.equal([...audio.voices].filter(v => v.kind === 'squad-speech').length, 1);
  assert.ok(speech.sends.street.connections.includes(audio.speechReverbBanks.street.input));
  assert.ok(audio.speechReverbBanks.street.output.connections.includes(audio.squadBus));
});

test('squad voice mute and reflection mute clear their histories without silencing gunfire', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0]; audio.tick(state, .016);
  audio._say('move', player, player, state); const speech = audio.activeSpeech;
  const oldRoom = audio.speechReverbBanks.room.convolver;
  audio.setLevels({ reflections: 0 });
  assert.equal(audio.activeSpeech.voice.source, speech.voice.source, 'wet mute leaves the direct phrase running');
  assert.notEqual(audio.speechReverbBanks.room.convolver, oldRoom);
  const mutedRoom = audio.speechReverbBanks.room.convolver;
  audio.setLevels({ reflections: .8 });
  assert.notEqual(audio.speechReverbBanks.room.convolver, mutedRoom, 'audio accumulated during wet mute cannot reappear');
  assert.ok(speech.sends.room.connections.includes(audio.speechReverbBanks.room.input));
  audio._shot({ type:'shot', actorId:player.id, x:0, y:0, weapon:'rifle', team:'squad' }, player, state);
  audio.setLevels({ squad:0 });
  assert.equal(audio.activeSpeech, null); assert.equal(audio.squadBus.gain.value, 0);
  assert.ok([...audio.voices].some(v => v.kind === 'report'), 'squad slider does not mute the rifle');
  assert.equal([...audio.voices].filter(v => v.bus === 'squad').length, 0);
  audio.setLevels({ squad: .85 }); audio.tick(state, .016);
  assert.equal(audio.activeSpeech, null, 'unmute does not replay the consumed order');
});

test('flash hearing recovers even with effects muted and ringing has its own level', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState(), player = state.squad[0]; audio.tick(state, .016);
  Object.assign(player, { flashStartedAt: state.time, flashUntil: state.time + 3.5, flashStrength: 1 });
  audio.tick(state, .016);
  assert.ok(audio.hearingFilter.frequency.value < 2000); assert.ok(audio.hearingGain.gain.value < .5);
  assert.equal([...audio.voices].filter(v => v.kind === 'flash-ringing').length, 1);
  audio.tick(state, .016); assert.equal([...audio.voices].filter(v => v.kind === 'flash-ringing').length, 1, 'snapshot does not repeat ring');
  audio.setLevels({ ringing: 0 }); assert.equal([...audio.voices].filter(v => v.kind === 'flash-ringing').length, 0);
  assert.ok(audio.hearingFilter.frequency.value < 2000, 'ringing preference does not remove the hearing gameplay effect');
  audio.setLevels({ effects: 0 }); h.advance(4); state.time += 4; audio.tick(state, .016);
  assert.equal(audio.hearingFilter.frequency.value, 20000); assert.equal(audio.hearingGain.gain.value, 1);
  assert.equal(audio.effectsBus.gain.value, 0); assert.ok(audio.ambienceBus.gain.value > 0);
  audio.setLevels({ effects: 1, ringing: .35 }); audio.tick(state, .016);
  assert.equal([...audio.voices].filter(v => v.kind === 'flash-ringing').length, 0);
});

test('listener switches discard old speech and flash ringing without resetting the order cooldown', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ coop: true }), player = state.squad[0];
  state.squad.push({ id:'webb', x:80, y:0, alive:true, team:'squad', hp:100 });
  audio.tick(state, .016, {epoch:1}); audio._say('move', player, player, state);
  const spokenAt = audio.voiceDirector.lastSpokeAt;
  state.playerId = 'webb'; state.time += .05; audio.tick(state, .05, {epoch:2});
  assert.equal(audio.activeSpeech, null); assert.equal(audio.voiceDirector.lastSpokeAt, spokenAt);
  assert.equal(audio._say('move', state.squad[1], state.squad[1], state), false);
  assert.equal(audio.hearingGain.gain.value, 1);
});

test('real offscreen squad shots cross the whole district with travel delay and no sight reveal', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:30}),player=state.squad[0];
  state.world.width=2400;state.world.height=1900;
  const ally={id:'distant-ally',team:'allied',x:2350,y:1850,alive:true,visible:false};state.allies=[ally];
  assert.ok(acousticHearingRange('shot',state.world)>Math.hypot(ally.x,ally.y));
  state.soundEvents=[{...ally,id:1,type:'shot',actorId:ally.id,weapon:'rifle',sourceTime:30}];
  audio.tick(state,.016);assert.equal(audio.pendingArrivals.length,1);
  assert.equal([...audio.voices].filter(v=>v.kind==='report').length,0);
  for(let i=0;i<22;i++){h.advance(.05);state.time+=.05;audio.tick(state,.05);}
  const report=[...audio.voices].find(v=>v.kind==='report');assert.ok(report);
  assert.ok(Math.abs(report.start-acousticTravelDelay(Math.hypot(ally.x,ally.y)))<1e-7);
  assert.equal(ally.visible,false,'audio never writes visibility');
  assert.equal(report.nodes.find(n=>n?.type==='lowpass').frequency.value<1000,true);
  assert.equal([...audio.voices].filter(v=>v.kind==='street-echo'||v.kind==='street-reflection').length,0);
  assert.ok(report.nodes.some(n=>n?.connections.includes(audio.reverbBanks.street.input)),'shared street tail remains');
});

test('distant firefights cannot consume the nearby shot budget and synthetic battles are retired', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:30}),player=state.squad[0];state.world.width=2400;state.world.height=1900;
  audio.tick(state,.016);const before=audio.shotBudget;
  for(let i=0;i<12;i++)audio._shot({type:'shot',x:1200,y:0,actorId:`far-${i}`,team:'enemy',weapon:'hostile'},player,state);
  assert.equal([...audio.voices].filter(v=>v.kind==='report').length,4);
  assert.equal(audio.shotBudget,before);
  audio._shot({type:'shot',x:20,y:0,actorId:'close',team:'enemy',weapon:'hostile'},player,state);
  audio._shot({type:'shot',x:0,y:0,actorId:player.id,team:'squad',weapon:'rifle'},player,state);
  assert.equal([...audio.voices].filter(v=>v.kind==='report').length,6);
  const voiceCount=audio.voices.size;
  audio._cityEvent({kind:'battle',variant:'automatic',x:100,y:0,intensity:1,seed:1},player,state);
  assert.equal(audio.voices.size,voiceCount);
});

test('weapon body comes from one filtered recording and continuing SAW rounds keep attacks without building a loud tail', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0], reports = [];
  for (let round = 0; round < 5; round++) {
    if (round) h.advance(.095);
    const before = new Set(audio.voices);
    audio._shot({ type: 'shot', actorId: player.id, team: 'squad', weapon: 'support', x: 0, y: 0, sourceTime: 10 + round * .095 }, player, state);
    const added = [...audio.voices].filter(voice => !before.has(voice));
    assert.equal(added.length, 1, 'the direct round adds no synthetic mechanism/body source');
    const report = added[0]; reports.push(report);
    assert.equal(report.source.buffer, audio.samples.get('support'));
    assert.equal(report.nodes.find(node => node?.type === 'peaking').frequency.value, 460);
    assert.equal(report.nodes.find(node => node?.type === 'lowpass').frequency.value, 8800);
    assert.ok(Math.abs(report.end - report.start - reportProfile('support').duration) < 1e-9, 'continuing rounds retain their complete source duration');
  }
  const send = voice => voice.nodes.find(node => node?.connections.includes(audio.reverbBanks.street.input)).gain.value;
  assert.ok(reports[3].gain < reports[0].gain && reports[3].gain > reports[0].gain * .9);
  assert.ok(send(reports[3]) < send(reports[0]) * .7, 'only new energy feeding the tail is reduced');
  assert.equal(audio.lastReport.continuation, 4);
  h.advance(.5);
  audio._shot({ type: 'shot', actorId: player.id, team: 'squad', weapon: 'support', x: 0, y: 0, sourceTime: 11 }, player, state);
  assert.equal(audio.lastReport.continuation, 0, 'the first round after a pause regains its full report');
  const support = [...audio.voices].find(voice => voice.kind === 'report');
  audio._shot({ type: 'shot', actorId: 'other', team: 'squad', weapon: 'rifle', x: 20, y: 0, sourceTime: 11 }, player, state);
  const rifle = [...audio.voices].find(voice => voice.actorId === 'other');
  assert.notEqual(rifle.nodes.find(node => node?.type === 'peaking').frequency.value, support.nodes.find(node => node?.type === 'peaking').frequency.value);
});

test('close hostile reports have reserved capacity and controlled rounds never consume either shared firing budget', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0];
  audio.shotBudget = 0; audio.distantShotBudget = 0;
  audio._shot({ type: 'shot', actorId: 'enemy', team: 'enemy', weapon: 'hostile', x: 80, y: 0 }, player, state);
  assert.ok([...audio.voices].some(voice => voice.actorId === 'enemy' && voice.kind === 'report'));
  assert.equal(audio.threatShotBudget, 3);
  for (let round = 0; round < 4; round++) audio._shot({ type: 'shot', actorId: player.id, team: 'squad', weapon: 'support', x: 0, y: 0, sourceTime: 10 + round * .095 }, player, state);
  assert.equal([...audio.voices].filter(voice => voice.actorId === player.id && voice.kind === 'report').length, 4,
    'every controlled round in a batched update remains represented');
  assert.equal(audio.shotBudget, 0); assert.equal(audio.distantShotBudget, 0); assert.equal(audio.threatShotBudget, 3);
});

test('voice admission protects nearby reports before distant low-priority sources regardless of insertion order', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const nearby = audio._voice({ buffer: audio.noise, duration: 1, gain: .2, priority: 2, kind: 'report' });
  for (let i = 0; i < 31; i++) audio._voice({ buffer: audio.noise, duration: 1, gain: .01, priority: 1, kind: 'report' });
  const state = missionState({ time: 10 }), player = state.squad[0];
  audio._shot({ type: 'shot', actorId: player.id, team: 'squad', weapon: 'rifle', x: 0, y: 0 }, player, state);
  assert.ok(audio.voices.has(nearby), 'the older nearby source keeps its natural decay');
  assert.equal([...audio.voices].filter(voice => voice.priority === 1).length, 30);
  assert.equal(audio.voices.size, 32);
});

test('surface contacts use one cached material take at the impact location and remain bounded in cover fire', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0], buffers = [];
  for (const material of ['concrete', 'stone', 'metal', 'wood', 'rubber']) {
    audio._stopVoices();
    audio._event({ id: 3, type: 'impact', material, x: 70, y: 0, actorId: player.id }, player, state);
    assert.equal(audio.voices.size, 1, 'debris lives inside the surface take instead of adding another voice');
    const voice = [...audio.voices][0]; buffers.push(voice.source.buffer);
    assert.equal(voice.source.buffer, audio.impactBuffers.get(`${material}:0`));
    assert.equal(voice.kind, `${material}-impact`);
    assert.ok(voice.nodes.some(node => node?.pan.value > 0), 'player-fired rounds still pan to the surface they actually hit');
    assert.ok(!voice.nodes.some(node => node?.connections.includes(audio.reverbBanks.exterior.input)), 'impacts do not acquire a gunshot exterior tail');
  }
  assert.equal(new Set(buffers).size, 5);
  audio._stopVoices();
  for (let i = 0; i < 20; i++) audio._event({ id: i, type: 'impact', material: 'concrete', x: 500 - i * 20, y: 0 }, player, state);
  assert.equal([...audio.voices].filter(voice => voice.surfaceImpact).length, 8);
  assert.ok([...audio.voices].every(voice => voice.impactDistance <= 260), 'near contacts displace farther debris');
  audio.setLevels({ effects: 0 });
  audio._event({ type: 'impact', material: 'metal', x: 20, y: 0 }, player, state);
  assert.equal(audio.voices.size, 0);
});

test('a near-pass has readable lateral placement and can displace all lower-priority gunfire', async t => {
  const h = setup(t), { audio } = h; audio.setScene('mission'); await h.unlock();
  const state = missionState({ time: 10 }), player = state.squad[0];
  for (let i = 0; i < 32; i++) audio._voice({ buffer: audio.noise, duration: 1, gain: .01, priority: 3, kind: 'report' });
  audio._event({ type: 'near_pass', victimId: player.id, speedMps: 800, missDistance: 24, closestX: -24, closestY: 0 }, player, state);
  const crack = [...audio.voices].find(voice => voice.kind === 'near-pass'); assert.ok(crack);
  assert.ok(crack.nodes.some(node => node?.pan.value < -.5));
  assert.equal(audio.voices.size, 32);
});

test('nearby independent allies speak physically then fade instead of switching to the player radio', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:30}),player=state.squad[0];
  const ally={id:'raven',name:'Raven',x:100,y:0,alive:true,team:'allied'};state.allies=[ally];
  audio.tick(state,.016);audio._event({type:'field_voice',actorId:ally.id,category:'backup',x:100,y:0},player,state);
  assert.equal(audio.activeSpeech?.line.text,'Call for backup!');
  const speech=audio.activeSpeech,source=speech.voice.source;
  assert.equal(speech.route.mode,'local');assert.equal(speech.radioGain.gain.value,0);
  h.advance(.1);ally.x=400;audio._updateSpeech(state,player);
  assert.equal(speech.voice.source,source);assert.equal(speech.route.mode,'inaudible');
  assert.equal(speech.radioGain.gain.value,0);assert.equal(speech.localGain.gain.value,0);
  ally.alive=false;audio._updateSpeech(state,player);assert.equal(audio.activeSpeech,null);
});

test('additional dispatch performances use one radio-only source and share the established speech budget', async t => {
  const h=setup(t),{audio}=h;audio.setScene('mission');await h.unlock();
  const state=missionState({time:30}),player=state.squad[0];audio.tick(state,.016);
  assert.equal(audio._say('dispatch_ammo',player,player,state),false,'processed recordings cannot masquerade as nearby clean speech');
  assert.equal(audio._say('dispatch_ammo',FIELD_RADIO_SPEAKER,player,state),true);
  const speech=audio.activeSpeech;
  assert.equal(speech.line.text,'Watch your ammo.');assert.equal(speech.route.mode,'radio');
  assert.equal(speech.localGain.gain.value,0);assert.ok(speech.radioGain.gain.value>0);
  assert.equal(audio._say('move',player,player,state),false,'no overlapping intelligible sentence');
  h.advance(.5);audio._updateSpeech(state,player);assert.equal(audio.activeSpeech,speech);
  assert.equal(speech.route.mode,'radio');
});
