import test from "node:test";
import assert from "node:assert/strict";
import { Sound } from "../../daily_flyer/themes/pocket_sports_assets/core/sound.js";

class Events {
  constructor() { this.listeners = new Map(); this.hidden = false; }
  addEventListener(type, fn) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(fn);
    this.listeners.set(type, listeners);
  }
  fire(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn({ isTrusted: true, ...event });
  }
}
class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class Node {
  constructor(type) {
    this.kind = type;
    this.connections = [];
    this.gain = new Param(1);
    this.frequency = new Param();
    this.Q = new Param();
    this.pan = new Param();
    this.playbackRate = new Param(1);
    this.delayTime = new Param();
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
  start(time = 0) { this.started = time; }
  stop(time) { this.stopped = time; }
}
function fixture(t, supplied = {}) {
  const originals = new Map(["window", "document", "navigator"].map(key => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]));
  const document = new Events(), window = new Events(), contexts = [];
  class Context {
    constructor() {
      this.currentTime = 0;
      this.state = "running";
      this.destination = new Node("destination");
      this.nodes = [];
      this.resumeCalls = 0;
      contexts.push(this);
    }
    node(type) { const node = new Node(type); this.nodes.push(node); return node; }
    createGain() { return this.node("gain"); }
    createBufferSource() { return this.node("buffer-source"); }
    createBiquadFilter() { return this.node("filter"); }
    createStereoPanner() { return this.node("pan"); }
    createDelay() { return this.node("delay"); }
    createOscillator() { return this.node("oscillator"); }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, getChannelData: channel => data[channel] };
    }
    resume() { this.resumeCalls++; this.state = "running"; return Promise.resolve(); }
  }
  window.AudioContext = Context;
  const navigator = { audioSession: { type: "ambient" }, mediaDevices: new Events() };
  for (const [key, value] of Object.entries({ window, document, navigator }))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    for (const [key, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  const settings = { sound: true, crowd: 0.55, ...supplied };
  const sound = new Sound(settings);
  const game = {
    sport: "hockey", phase: "play", rules: { height: 1400 },
    ball: { x: 440, y: 700, vx: 0, vy: 0 },
  };
  return { sound, settings, game, contexts, document, window, navigator };
}

test("crowd waits for audio activation and uses one context and two reusable beds", t => {
  const { sound, game, contexts, document, navigator } = fixture(t);
  sound.update(game);
  assert.equal(contexts.length, 0);
  document.fire("pointerdown", { isTrusted: false });
  assert.equal(contexts.length, 0, "synthetic gestures cannot start sound");
  document.fire("touchend");
  assert.equal(contexts.length, 1);
  assert.equal(navigator.audioSession.type, "playback");
  const context = contexts[0];
  assert.equal(context.nodes.filter(n => n.kind === "buffer-source" && n.loop).length, 2);
  for (let i = 0; i < 150; i++) {
    context.currentTime += 1 / 60;
    sound.update(game);
    if (i % 30 === 0) sound.unlock();
  }
  assert.equal(contexts.length, 1);
  assert.equal(context.nodes.filter(n => n.kind === "buffer-source" && n.loop).length, 2);
  assert.ok(sound.crowd.bus.gain.value > 0);
  for (const source of sound.crowd.sources) {
    assert.equal(source.buffer.numberOfChannels, 2);
    const left = source.buffer.getChannelData(0), right = source.buffer.getChannelData(1);
    assert.ok(left.every(Number.isFinite));
    assert.ok(left.some(value => Math.abs(value) > 0.02));
    assert.ok(left.some((value, i) => value !== right[i]), "crowd has stereo width");
  }
});

test("pause, menus, sound-off and tab hiding silence the existing crowd", t => {
  const { sound, settings, game, document } = fixture(t);
  sound.update(game);
  sound.unlock();
  assert.equal(sound.master.gain.value, 1);
  sound.update(game, { paused: true });
  assert.equal(sound.master.gain.value, 0);
  assert.equal(sound.crowd.bus.gain.value, 0);
  sound.update(game, { menu: true });
  assert.equal(sound.master.gain.value, 0);
  sound.update(game);
  assert.equal(sound.master.gain.value, 1);
  settings.sound = false;
  sound.update(game);
  assert.equal(sound.master.gain.value, 0);
  settings.sound = true;
  sound.update(game);
  document.hidden = true;
  document.fire("visibilitychange");
  assert.equal(sound.master.gain.value, 0, "background silence does not need another animation frame");
  assert.equal(sound.crowd.bus.gain.value, 0);
});

test("zero crowd volume leaves game effects usable and creates no crowd loops", t => {
  const { sound, game, contexts } = fixture(t, { crowd: 0 });
  sound.update(game);
  sound.unlock();
  sound.event("shot", "hockey");
  assert.equal(sound.crowd, null);
  assert.equal(contexts[0].nodes.filter(n => n.kind === "buffer-source").length, 0);
  assert.equal(contexts[0].nodes.filter(n => n.kind === "oscillator").length, 1);
});

test("crowd cheers rise on a goal and settle while scheduled effects clean up", t => {
  const { sound, game, contexts } = fixture(t);
  sound.update(game);
  sound.unlock();
  const context = contexts[0], quiet = sound.crowd.voices.gain.value;
  sound.event("goal", "hockey");
  const cheer = sound.crowd.voices.gain.value;
  assert.ok(cheer > quiet * 2);
  assert.equal(context.nodes.filter(n => n.kind === "oscillator").length, 3);
  const claps = context.nodes.filter(n => n.kind === "buffer-source" && !n.loop);
  assert.equal(claps.length, 3);
  for (const node of [...claps, ...context.nodes.filter(n => n.kind === "oscillator")]) {
    assert.ok(node.stopped > node.started);
    node.onended();
    assert.equal(node.disconnected, true);
  }
  for (let i = 0; i < 600; i++) {
    context.currentTime += 1 / 60;
    sound.update(game);
  }
  assert.ok(sound.crowd.voices.gain.value < cheer / 2);
});

test("soccer keeps its effects without the new hockey crowd", t => {
  const { sound, game, contexts } = fixture(t);
  game.sport = "soccer";
  sound.update(game);
  sound.unlock();
  sound.event("goal", "soccer");
  assert.equal(sound.crowd, null);
  assert.equal(contexts[0].nodes.filter(n => n.kind === "oscillator").length, 3);
  game.sport = "hockey";
  sound.update(game);
  assert.ok(sound.crowd);
  game.sport = "soccer";
  sound.update(game);
  assert.equal(sound.crowd.bus.gain.value, 0);
});

test("a suspended mobile audio route resumes the same context on another trusted touch", async t => {
  const { sound, game, contexts, document } = fixture(t);
  sound.update(game);
  document.fire("touchend");
  const context = contexts[0];
  context.state = "suspended";
  document.fire("touchend");
  await Promise.resolve();
  assert.equal(contexts.length, 1);
  assert.equal(context.resumeCalls, 1);
  assert.equal(context.state, "running");
  assert.equal(sound.master.gain.value, 1);
  assert.equal(context.nodes.filter(n => n.kind === "buffer-source" && n.loop).length, 2);
});
