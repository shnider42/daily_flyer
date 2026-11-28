import test from 'node:test';
import assert from 'node:assert/strict';
import { HoopsAudio, DEFAULT_AUDIO_MIX, normalizeAudioMix } from '../public/audio.js';
import { createThemePCM, createCrowdBedPCM, createCrowdReactionPCM, THEME_SECONDS } from '../public/audio-score.js';

class Surface {
  constructor() { this.hidden = false; this.listeners = new Map(); }
  addEventListener(name, listener) { const entries = this.listeners.get(name) || []; entries.push(listener); this.listeners.set(name, entries); }
  emit(name, event = {}) { for (const listener of this.listeners.get(name) || []) listener({ isTrusted: true, ...event }); }
}
class Param {
  constructor(value = 1) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push({ type: 'set', value, time }); }
  setTargetAtTime(value, time, constant) { this.value = value; this.events.push({ type: 'target', value, time, constant }); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ type: 'linear', value, time }); }
  exponentialRampToValueAtTime(value, time) { assert.ok(value > 0); this.value = value; this.events.push({ type: 'exponential', value, time }); }
  cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); }
}
class Node {
  constructor() { this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
}
class Source extends Node {
  constructor(ctx, oscillator = false) {
    super(); this.ctx = ctx; this.oscillator = oscillator; this.frequency = new Param();
    this.loop = false; this.startAt = Infinity; this.stopAt = Infinity; this.offset = 0; this.ended = false;
  }
  start(at = 0, offset = 0) { this.startAt = at; this.offset = offset; }
  stop(at = this.ctx.currentTime) { this.stopAt = at; if (at <= this.ctx.currentTime) this.finish(); }
  finish() { if (!this.ended) { this.ended = true; this.onended?.(); } }
}
class FakeContext {
  constructor() {
    this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 22050;
    this.destination = new Node(); this.sources = []; this.pending = []; this.autoResume = true;
  }
  createGain() { return Object.assign(new Node(), { gain: new Param() }); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(), Q: new Param() }); }
  createDynamicsCompressor() {
    return Object.assign(new Node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, new Param()])));
  }
  createBuffer(_channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  }
  createBufferSource() { const source = new Source(this); this.sources.push(source); return source; }
  createOscillator() { const source = new Source(this, true); this.sources.push(source); return source; }
  resume() {
    if (this.autoResume) { this.state = 'running'; return Promise.resolve(); }
    return new Promise(resolve => this.pending.push(resolve));
  }
  completeResume() { this.state = 'running'; for (const resolve of this.pending.splice(0)) resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of this.sources) {
      const naturalEnd = !source.loop && source.buffer ? source.startAt + source.buffer.duration - source.offset : Infinity;
      if (!source.ended && Math.min(source.stopAt, naturalEnd) <= this.currentTime) source.finish();
    }
  }
}
function harness() {
  const descriptors = new Map(['document', 'window', 'navigator', 'AudioContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const doc = new Surface(), win = new Surface(), contexts = [];
  for (const [key, value] of Object.entries({ document: doc, window: win, navigator: { userActivation: { isActive: false } },
    AudioContext: class extends FakeContext { constructor() { super(); contexts.push(this); } } }))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const audio = new HoopsAudio();
  return { audio, doc, win, contexts,
    enable(scene = 'game') { audio.setScene(scene); audio.setEnabled(true); doc.emit('pointerdown'); return contexts[0]; },
    restore() { audio.pause(); for (const [key, descriptor] of descriptors) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; },
  };
}
const game = () => ({ phase: 'live', period: 1, clock: 180, score: [0, 0], ball: { owner: null }, practice: false });
const tags = (audio, tag) => [...audio._sourceInfo.values()].filter(source => source.tag === tag);

test('audio mix normalizes persisted values, preserves zero and returns independent objects', () => {
  for (const value of [null, undefined, false, [], 'loud']) assert.deepEqual(normalizeAudioMix(value), DEFAULT_AUDIO_MIX);
  assert.deepEqual(normalizeAudioMix({ music: 0, crowd: 4, effects: -1 }), { music: 0, crowd: 1, effects: 0 });
  assert.deepEqual(normalizeAudioMix({ music: NaN, crowd: '0.5', effects: Infinity }), DEFAULT_AUDIO_MIX);
  const changed = normalizeAudioMix(); changed.music = 0;
  assert.equal(DEFAULT_AUDIO_MIX.music, .55); assert.ok(Object.isFrozen(DEFAULT_AUDIO_MIX));
});

test('sound stays opt-in and visibility or an untrusted event cannot create audio', () => {
  const h = harness();
  try {
    h.audio.setScene('menu'); h.audio.update(.1); assert.equal(h.contexts.length, 0);
    h.audio.setEnabled(true); assert.equal(h.contexts.length, 0);
    h.doc.hidden = true; h.doc.emit('visibilitychange'); h.doc.hidden = false; h.doc.emit('visibilitychange');
    h.doc.emit('pointerdown', { isTrusted: false }); assert.equal(h.contexts.length, 0);
    h.doc.emit('pointerdown');
    assert.equal(h.contexts.length, 1); assert.equal(h.audio.diagnostics().musicActive, true);
  } finally { h.restore(); }
});

test('menu and game scenes maintain one appropriate loop and silent replay stops all sources', () => {
  const h = harness();
  try {
    const ctx = h.enable('menu'), menuSource = h.audio._musicLoop;
    assert.ok(menuSource.loop && menuSource.buffer.duration > 16);
    for (let i = 0; i < 120; i++) { ctx.advance(1 / 60); h.audio.update(1 / 60); }
    assert.equal(h.audio._musicLoop, menuSource); assert.equal(h.audio._sources.size, 1);
    h.audio.setScene('game'); const bed = h.audio._crowdBed, match = game();
    assert.ok(menuSource.ended && bed.loop); assert.equal(h.audio._musicLoop, null);
    for (let i = 0; i < 120; i++) { ctx.advance(1 / 60); h.audio.update(1 / 60, match); }
    assert.equal(h.audio._crowdBed, bed); assert.equal(tags(h.audio, 'crowd-bed').length, 1);
    assert.equal(tags(h.audio, 'music-loop').length, 0);
    h.audio.setScene('silent'); h.audio.update(.1, match); h.audio.event({ type: 'score', team: 0, points: 3 }, match);
    assert.equal(h.audio._sources.size, 0); assert.equal(ctx.state, 'suspended');
  } finally { h.restore(); }
});

test('mixer channels route independently and zero stops current and scheduled sounds in that channel', () => {
  const h = harness();
  try {
    h.enable('game'); const match = game();
    h.audio.event({ type: 'score', team: 0, points: 3 }, match);
    h.audio.event({ type: 'tip' }, match);
    h.audio._tone(440, .2, .1, 'sine', 440, 8);
    assert.ok(tags(h.audio, 'effects').length && tags(h.audio, 'reaction').length && tags(h.audio, 'music-cue').length);
    h.audio.setMix({ effects: 0 });
    assert.equal(tags(h.audio, 'effects').length, 0); assert.ok(tags(h.audio, 'reaction').length);
    assert.equal(h.audio.mix.crowd, DEFAULT_AUDIO_MIX.crowd);
    h.audio.setMix({ crowd: 0 });
    assert.equal(tags(h.audio, 'reaction').length, 0); assert.equal(h.audio._crowdBed, null);
    h.audio.setMix({ music: 0 }); assert.equal(h.audio._sources.size, 0);
    h.audio.event({ type: 'score', team: 1, points: 2 }, match); assert.equal(h.audio._sources.size, 0);
    h.audio.setMix({ crowd: .3 }); assert.equal(tags(h.audio, 'crowd-bed').length, 1);
    assert.equal(h.audio.buses.crowd.gain.value, .3); assert.equal(h.audio.buses.effects.gain.value, 0);
    const diagnostics = h.audio.diagnostics(); diagnostics.mix.crowd = 99;
    assert.equal(h.audio.mix.crowd, .3);
  } finally { h.restore(); }
});

test('pause, hide and master mute stop even future notes and never replay old reactions', () => {
  const h = harness();
  try {
    const ctx = h.enable('game'), match = game();
    h.audio.event({ type: 'tip' }, match); h.audio.event({ type: 'score', team: 0, points: 2 }, match);
    h.audio._tone(440, .2, .1, 'sine', 440, 8);
    const scheduled = [...h.audio._sources];
    assert.ok(scheduled.some(source => source.startAt > ctx.currentTime));
    h.audio.pause();
    assert.equal(h.audio._sources.size, 0); assert.ok(scheduled.every(source => source.ended && source.disconnected));
    assert.equal(h.audio.master.gain.value, 0); assert.equal(ctx.state, 'suspended');
    h.audio.event({ type: 'timeout' }, match); h.audio.event({ type: 'score', team: 0 }, match);
    h.audio.resume(); h.audio.update(.1, match);
    assert.equal(tags(h.audio, 'music-cue').length, 0); assert.equal(h.audio.diagnostics().lastReaction, null);
    h.doc.hidden = true; h.doc.emit('visibilitychange'); assert.equal(h.audio._sources.size, 0);
    h.audio.update(.1, match); assert.equal(h.audio._sources.size, 0);
    h.doc.hidden = false; h.doc.emit('visibilitychange'); h.audio.update(.1, match);
    assert.equal(tags(h.audio, 'crowd-bed').length, 1);
    h.audio.setEnabled(false); h.audio.update(.1, match);
    assert.equal(h.audio._sources.size, 0); assert.equal(ctx.state, 'suspended');
  } finally { h.restore(); }
});

test('home allegiance follows engine event semantics and neutral out-of-bounds stays neutral', () => {
  const h = harness();
  try {
    const ctx = h.enable('game'), match = game();
    for (const [event, expected] of [
      [{ type: 'score', team: 0, points: 3 }, 'cheer'], [{ type: 'score', team: 1, points: 2 }, 'ah'],
      [{ type: 'miss', team: 0, playerId: 0 }, 'ah'], [{ type: 'miss', team: 1, playerId: 100 }, 'cheer'],
      [{ type: 'foul', team: 1, playerId: 0 }, 'boo'], [{ type: 'steal', team: 0 }, 'cheer'],
      [{ type: 'block', team: 1 }, 'ooh'], [{ type: 'turnover', team: 1 }, 'ah'],
      [{ type: 'pass', team: 0, style: 'lob' }, 'ooh'],
    ]) {
      ctx.advance(10); h.audio.event(event, match); assert.equal(h.audio.diagnostics().lastReaction.kind, expected);
    }
    const before = h.audio.diagnostics().lastReaction;
    ctx.advance(10); h.audio.event({ type: 'foul', team: 0, playerId: 100 }, match);
    h.audio.event({ type: 'out', team: 0 }, match);
    assert.deepEqual(h.audio.diagnostics().lastReaction, before);
  } finally { h.restore(); }
});

test('reaction priorities prevent a lob or whistle from drowning a basket and boos are restrained', () => {
  const h = harness();
  try {
    const ctx = h.enable('game'), match = game();
    h.audio.event({ type: 'score', team: 0, points: 2, shotType: 'alley-oop' }, match);
    const score = h.audio.diagnostics().lastReaction;
    h.audio.event({ type: 'pass', team: 0, style: 'lob' }, match);
    h.audio.event({ type: 'foul', team: 1, playerId: 0 }, match);
    assert.deepEqual(h.audio.diagnostics().lastReaction, score);
    ctx.advance(1); h.audio.event({ type: 'foul', team: 1, playerId: 0 }, match);
    const firstBoo = h.audio.diagnostics().lastReaction; assert.equal(firstBoo.kind, 'boo');
    ctx.advance(2); h.audio.event({ type: 'foul', team: 1, playerId: 1 }, match);
    assert.deepEqual(h.audio.diagnostics().lastReaction, firstBoo);
    ctx.advance(8); h.audio.event({ type: 'foul', team: 1, playerId: 1 }, match);
    assert.ok(h.audio.diagnostics().lastReaction.at > firstBoo.at);
  } finally { h.restore(); }
});

test('fresh restart cues survive asynchronous resume; pauses discard queued cues', async () => {
  const h = harness();
  try {
    const ctx = h.enable('game'), match = game(); ctx.autoResume = false;
    for (const name of ['tip', 'half', 'overtime', 'timeout']) {
      h.audio.pause(); h.audio.resume(); assert.equal(ctx.state, 'suspended');
      h.audio.event({ type: name }, match); assert.equal(tags(h.audio, 'music-cue').length, 0);
      ctx.completeResume(); await Promise.resolve(); h.audio.update(.01, match);
      assert.equal(tags(h.audio, 'music-cue').length, 1, `${name} plays once when resume completes`);
      const count = ctx.sources.length; h.audio.update(.01, match); assert.equal(ctx.sources.length, count);
    }
    h.audio.pause(); h.audio.resume(); h.audio.event({ type: 'timeout' }, match);
    h.audio.pause(); ctx.completeResume(); await Promise.resolve(); h.audio.update(.01, match);
    assert.equal(h.audio._sources.size, 0); assert.equal(h.audio._pendingCue, null);
  } finally { h.restore(); }
});

test('consecutive matches get fresh intros, ordinary resumes do not, and ending stings fit the presentation', () => {
  const h = harness();
  try {
    const ctx = h.enable('game'), first = game(), second = game();
    h.audio.event({ type: 'tip' }, first); assert.equal(tags(h.audio, 'music-cue').length, 1);
    ctx.advance(5); h.audio.pause(); h.audio.resume(); h.audio.update(.01, first);
    assert.equal(tags(h.audio, 'music-cue').length, 0);
    h.audio.event({ type: 'tip' }, second); assert.equal(tags(h.audio, 'music-cue').length, 1);
    ctx.advance(5); h.audio.event({ type: 'halftime' }, second);
    const ending = [...h.audio._sourceInfo].find(([, info]) => info.tag === 'music-cue')[0];
    assert.ok(ending.stopAt - ctx.currentTime <= 1);
    ctx.advance(1.15); assert.equal(tags(h.audio, 'music-cue').length, 0);
  } finally { h.restore(); }
});

test('miss emphasis requires the same shooter and cannot survive a silent interval', () => {
  const h = harness();
  try {
    const ctx = h.enable('game'), match = game();
    h.audio.event({ type: 'shot', team: 0, playerId: 4, shotType: 'alley-oop' }, match);
    ctx.advance(.8); h.audio.event({ type: 'miss', team: 0, playerId: 1 }, match);
    assert.equal(h.audio.diagnostics().lastReaction.intensity, .75);
    ctx.advance(2); h.audio.event({ type: 'shot', team: 0, playerId: 4, shotType: 'alley-oop' }, match);
    h.audio.pause(); h.audio.resume(); h.audio.event({ type: 'miss', team: 0, playerId: 4 }, match);
    assert.equal(h.audio.diagnostics().lastReaction.intensity, .75);
  } finally { h.restore(); }
});

test('close late games gently lift the same crowd bed and return to the ordinary level', () => {
  const h = harness();
  try {
    h.enable('game'); const match = game(), bed = h.audio._crowdBed;
    h.audio.update(.01, match); const base = h.audio._bedLevel;
    Object.assign(match, { period: 2, clock: 18, score: [40, 42] }); h.audio.update(.01, match);
    assert.ok(h.audio._bedLevel > base && h.audio._bedLevel < base * 1.3);
    assert.equal(h.audio._crowdBed, bed);
    match.score = [40, 60]; h.audio.update(.01, match); assert.equal(h.audio._bedLevel, base);
  } finally { h.restore(); }
});

test('original PCM assets are finite, bounded, deterministic and contain voiced vowel periodicity', () => {
  const theme = createThemePCM(8000);
  assert.ok(THEME_SECONDS > 16 && THEME_SECONDS < 17);
  assert.equal(theme.length, Math.ceil(THEME_SECONDS * 8000));
  assert.deepEqual(theme, createThemePCM(8000));
  const bed = createCrowdBedPCM(8000); assert.equal(bed.length, 48000);
  for (const kind of ['ooh', 'ah', 'boo', 'cheer']) {
    const pcm = createCrowdReactionPCM(kind, 8000);
    let squares = 0, peak = 0;
    for (const value of pcm) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); squares += value * value; }
    assert.ok(peak <= .851 && Math.sqrt(squares / pcm.length) > .1);
    let strongest = 0;
    for (let lag = 20; lag < 100; lag++) {
      let correlation = 0, left = 0, right = 0;
      for (let i = 1600; i < 4800; i++) { correlation += pcm[i] * pcm[i + lag]; left += pcm[i] ** 2; right += pcm[i + lag] ** 2; }
      strongest = Math.max(strongest, correlation / Math.sqrt(left * right));
    }
    assert.ok(strongest > .15, `${kind} contains an audible voiced structure instead of unvoiced noise alone`);
  }
  assert.ok([...theme, ...bed].every(Number.isFinite));
});
