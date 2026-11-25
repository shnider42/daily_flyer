import test from 'node:test';
import assert from 'node:assert/strict';
import { NightglassAudio } from '../dist/audio.mjs';
import { MENU_THEME } from '../dist/menu-theme.mjs';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class Param {
  constructor(value = 0) { this.value = value; this.ramps = []; }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); }
}

class Node {
  constructor() {
    for (const key of ['gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param();
  }
  connect(node) { return node; }
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onended?.(); }
}

function environment(t) {
  const previous = new Map(['Audio', 'AudioContext', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const env = { media: [], contexts: [], plans: [], clients: [] };
  class FakeAudio extends EventTarget {
    constructor() {
      super(); this.paused = true; this.ended = false; this.currentTime = 0;
      this.loop = false; this.error = null; this.playCalls = 0; this.src = ''; this.readyState = 4;
      env.media.push(this);
    }
    setAttribute() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    play() {
      this.playCalls++; this.paused = false; this.ended = false;
      return env.plans.length ? env.plans.shift()(this) : Promise.resolve();
    }
    pause() { this.paused = true; }
    load() { this.paused = true; this.error = null; }
    remove() { this.isConnected = false; }
    finish() { this.ended = true; this.paused = true; this.dispatchEvent(new Event('ended')); }
  }
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 100; this.destination = new Node(); env.contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return new Node(); }
    createDynamicsCompressor() { return new Node(); }
    createOscillator() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createBufferSource() { return new Node(); }
    createStereoPanner() { return new Node(); }
    createMediaElementSource() { return new Node(); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  }
  const document = new EventTarget();
  document.hidden = false;
  document.body = { appendChild: media => { media.isConnected = true; } };
  Object.assign(globalThis, { Audio: FakeAudio, AudioContext: FakeContext, document });
  env.create = options => {
    const audio = new NightglassAudio(options); env.clients.push(audio); return audio;
  };
  env.visibility = hidden => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  t.after(() => {
    for (const client of env.clients) client.dispose();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return env;
}

test('menu audio is gesture-created, streams without blocking start, and reuses one looping source', async t => {
  const env = environment(t), play = deferred();
  env.plans.push(() => play.promise);
  const audio = env.create({ volume: 0.5 });
  audio.setScene('survey'); audio.setMode('menu');
  assert.equal(env.media.length, 0, 'construction and rendering must not fetch a recording');
  assert.equal(audio.musicStatus().status, 'ready');
  assert.equal(await audio.start(), true, 'start does not await the held media promise');
  assert.equal(env.media.length, 1);
  const media = env.media[0];
  assert.equal(media.id, 'farwake-theme-audio');
  assert.equal(media.preload, 'none');
  assert.ok(media.isConnected);
  assert.equal(audio.musicStatus().status, 'loading');
  play.resolve(); await settle();
  assert.equal(audio.musicStatus().status, 'playing');
  assert.equal(media.loop, true);
  assert.equal(audio._musicBus.gain.value, 0.5 * 0.65 * 0.9, 'recording uses the shared volume without the effects ceiling');
  assert.equal(audio._master.gain.value, 0.5 * 0.28, 'procedural effects retain their existing ceiling');
  const calls = media.playCalls;
  for (let i = 0; i < 5; i++) { audio.setMode('menu'); audio.setScene('airlock'); audio._tick(); }
  assert.equal(media.playCalls, calls);
  assert.equal(env.media.length, 1);
  assert.equal(audio._humGain.gain.value, 0);
  assert.equal(audio._airGain.gain.value, 0);
  assert.equal(audio._transient.size, 0, 'menu must not emit receiver or machinery cues');
  assert.equal(audio.musicStatus().credit, MENU_THEME.credit);
});

test('master-off, master-zero, music-off and music-zero never create or prime media', async t => {
  const env = environment(t);
  for (const options of [{ enabled: false }, { volume: 0 }, { musicEnabled: false }, { musicVolume: 0 }]) {
    const audio = env.create(options);
    await audio.start(); await settle();
    assert.equal(env.media.length, 0);
    assert.ok(['off', 'muted'].includes(audio.musicStatus().status));
    audio.dispose();
  }
});

test('expedition primes silently; earned report waits, plays once, and never restarts from scene updates', async t => {
  const env = environment(t), audio = env.create();
  audio.setMode('expedition');
  await audio.start(); await settle();
  const media = env.media[0], ctx = audio.context;
  assert.equal(media.playCalls, 1);
  assert.equal(media.paused, true);
  assert.equal(media.currentTime, 0);
  assert.equal(audio.musicStatus().unlocked, true);
  assert.equal(audio.musicStatus().status, 'quiet');
  audio.cue('complete');
  const completionNodes = audio._transient.size;
  audio.setMode('report');
  assert.equal(audio._transient.size, completionNodes, 'the completion cue must finish before the report theme');
  ctx.currentTime = 1.9; audio._tick();
  assert.equal(media.playCalls, 1);
  assert.equal(audio.musicStatus().status, 'waiting');
  ctx.currentTime = 2.1; audio._tick(); await settle();
  assert.equal(media.playCalls, 2);
  assert.equal(media.loop, false);
  assert.equal(audio.musicStatus().status, 'playing');
  assert.equal(audio._musicBus.gain.value, audio.volume * audio.musicVolume * 0.45);
  for (let i = 0; i < 4; i++) { audio.setMode('report'); audio.setScene('airlock', { completed: true }); audio._tick(); }
  assert.equal(media.playCalls, 2);
  media.finish(); audio._tick();
  assert.equal(audio.musicStatus().status, 'ended');
  audio.setMode('report'); audio._tick();
  assert.equal(media.playCalls, 2);
});

test('leaving the menu fades its player and exploration cannot restart the recording', async t => {
  const env = environment(t), audio = env.create();
  await audio.start(); await settle();
  const media = env.media[0], calls = media.playCalls, ctx = audio.context;
  audio.setMode('expedition');
  assert.equal(audio._musicPlayer._stoppingAt, 1.2);
  assert.equal(audio._theme.gain.gain.ramps.at(-1).value, 0);
  ctx.currentTime = 1.3; audio._tick();
  assert.equal(media.paused, true);
  for (let i = 0; i < 4; i++) { audio.setScene('shaft', { flags: {} }); audio._tick(); }
  assert.equal(media.playCalls, calls);
  assert.equal(audio.musicStatus().status, 'quiet');
});

test('late accepted playback cannot revive disabled, hidden or disposed music', async t => {
  const env = environment(t);
  for (const interruption of ['disabled', 'hidden', 'disposed']) {
    const pending = deferred(); env.plans.push(() => pending.promise);
    const audio = env.create(); await audio.start();
    const media = env.media.at(-1);
    if (interruption === 'disabled') audio.setMusicEnabled(false);
    if (interruption === 'hidden') env.visibility(true);
    if (interruption === 'disposed') audio.dispose();
    media.paused = false; // Simulate a late browser acceptance of the earlier play().
    pending.resolve(); await settle();
    assert.equal(media.paused, true, interruption);
    assert.equal(audio.musicStatus().playing, false, interruption);
    audio.dispose(); env.visibility(false);
  }
});

test('visibility and volume pauses preserve position, while explicit Stop stays stopped', async t => {
  const env = environment(t), audio = env.create();
  await audio.start(); await settle();
  const media = env.media[0];
  media.currentTime = 42;
  env.visibility(true);
  assert.equal(media.paused, true);
  assert.equal(audio.musicStatus().status, 'paused');
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.equal(audio.context.state, 'suspended');
  env.visibility(false); await settle();
  assert.equal(media.paused, false);
  assert.equal(media.currentTime, 42);
  audio.setVolume(0); await settle();
  assert.equal(media.paused, true);
  assert.equal(audio.musicStatus().status, 'muted');
  assert.equal(audio._musicBus.gain.value, 0);
  audio.setVolume(0.5); await settle();
  assert.equal(media.paused, false);
  assert.equal(media.currentTime, 42);
  assert.equal(audio._musicBus.gain.value, 0.5 * audio.musicVolume * 0.9);
  audio.setMusicEnabled(false);
  const calls = media.playCalls;
  env.visibility(true); env.visibility(false); await audio.resume(); await settle();
  assert.equal(media.playCalls, calls);
  assert.equal(audio.musicStatus().status, 'off');
  assert.equal(env.media.length, 1);
});

test('rejected and failed media have explicit status and retry only after a gesture', async t => {
  const env = environment(t), audio = env.create();
  env.plans.push(() => Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' })));
  assert.equal(await audio.start(), true, 'a rejected recording must not disable the environmental graph');
  await settle();
  const media = env.media[0], calls = media.playCalls;
  assert.equal(audio.musicStatus().status, 'blocked');
  for (let i = 0; i < 4; i++) audio._tick();
  assert.equal(media.playCalls, calls);
  await audio.start(); await settle();
  assert.equal(audio.musicStatus().status, 'playing');
  media.error = { code: 2 }; media.dispatchEvent(new Event('error'));
  assert.equal(audio.musicStatus().status, 'error');
  assert.equal(audio.musicStatus().error, 'Recording could not load');
  const failedCalls = media.playCalls;
  audio._tick(); audio.setScene('survey');
  assert.equal(media.playCalls, failedCalls);
  await audio.start(); await settle();
  assert.equal(audio.musicStatus().status, 'playing');
});
