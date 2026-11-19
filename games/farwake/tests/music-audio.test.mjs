import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundscape } from '../dist/audio.mjs';
import { MUSIC_CUES, THEME_ID } from '../dist/music-catalog.mjs';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
}
class MediaDouble extends Events {
  constructor(src) { super(); this.src = src; this.paused = true; this.currentTime = 0; this.readyState = 4; this.duration = 197.625; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  setAttribute() {}
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
  createMediaElementSource(media) { const node = this.node('media-element'); node.media = media; return node; }
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
  const originals = new Map(['document', 'window', 'AudioContext', 'Audio'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const document = new Events(); document.hidden = false;
  const window = new Events();
  Object.assign(globalThis, { document, window, AudioContext: AudioContextDouble, Audio: MediaDouble });
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

test('the Bellwether scream is one bounded effects cue with gentle attack and normal cleanup', () => {
  const b = boundary({ sound: true, music: false });
  try {
    b.audio.unlock(); b.audio.play('bellwetherScream');
    const voices = [...b.audio.effects];
    assert.equal(voices.length, 3, 'one scream uses three short voices, with no echo timers or loop');
    assert.ok(voices.every(voice => voice.started === 0 && voice.stops.length === 1 && voice.stops[0] <= 1));
    const envelopes = voices.map(voice => [...voice.connections][0].gain.events);
    assert.ok(envelopes.every(events => events.some(([kind, value, at]) => kind === 'linear' && value <= .15 && at >= .06)), 'the entry has a bounded, gentle volume ramp');
    b.audio.play('bellwetherScream'); assert.equal(b.audio.effects.size, 3, 'a duplicate callback cannot layer another scream');
    for (const voice of voices) voice.onended();
    assert.equal(b.audio.effects.size, 0); assert.ok(voices.every(voice => voice.disconnected));
  } finally { b.restore(); }
});

test('the scream respects sound mute, hidden documents and effects interruption independently of music', () => {
  const b = boundary({ sound: false, music: true });
  try {
    b.audio.unlock(); b.audio.play('bellwetherScream'); assert.equal(b.audio.effects.size, 0);
    b.settings.sound = true; b.audio.mute(); b.audio.last.bellwetherScream = -Infinity;
    b.document.hidden = true; b.audio.play('bellwetherScream'); assert.equal(b.audio.effects.size, 0);
    b.document.hidden = false; b.audio.last.bellwetherScream = -Infinity;
    b.audio.play('bellwetherScream'); assert.equal(b.audio.effects.size, 3);
    b.audio.suspend(); assert.equal(b.audio.effects.size, 0);
    b.audio.unlock(); assert.equal(b.audio.effects.size, 0, 'returning to the foreground cannot resume an abandoned scream');
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

test('rapid musical transitions retain at most a current and retiring score and stop superseded players', async () => {
  const b = boundary();
  b.audio.director.cues = MUSIC_CUES.filter(cue => cue.family !== 'combat' || cue.id === 'morrow-flightline-loop');
  try {
    b.audio.unlock(); b.audio.updateMusic({ scene: 'menu' }, 0); const theme = b.audio.score;
    // A streamed theme becomes audible after play() settles; an unstarted request is stopped immediately.
    await Promise.resolve();
    b.audio.musicEvent('combat', 1, 'incoming-hit');
    b.audio.ctx.currentTime = 1;
    b.audio.updateMusic({ scene: 'exploration' }, 1); const combat = b.audio.score;
    // Combat may also select a streamed recording; allow its play() to settle.
    await Promise.resolve();
    assert.ok(b.audio.retiringScore === theme, 'the already-playing theme fades out during the transition');
    b.audio.ctx.currentTime = 1.1;
    b.audio.updateMusic({ scene: 'exploration', silence: true }, 1.1);
    assert.equal(theme.status().disposed, true);
    assert.ok(b.audio.retiringScore === combat, 'the already-playing recording fades out during silence');
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
    assert.doesNotThrow(() => b.audio.updateMusic({ scene: 'exploration' }, 0));
    assert.equal(b.audio.musicStatus().state, 'unavailable');
    assert.equal(b.audio.musicBus.gain.value, 0);
    assert.equal(b.audio.score, null);
    assert.equal(b.audio.director.current, null);
    for (let now = 1; now <= 60; now++) b.audio.updateMusic({ scene: 'exploration' }, now);
    assert.equal(warnings.length, 1, 'No failure/retry storm on every animation frame.');
    b.audio.tone(440); assert.equal(b.audio.effects.size, 1);
  } finally { console.warn = warn; b.restore(); }
});

test('Soundscape auditions a non-theme cue through its real director and reports pending then playing status', () => {
  const b = boundary({ sound: false, music: true });
  try {
    const id = 'lamps-in-the-cabin';
    assert.equal(b.audio.requestCue(id, 0), true);
    assert.equal(b.audio.musicStatus().requestedCueId, id);
    assert.equal(b.audio.musicStatus().previewCueId, null);
    assert.equal(b.settings.sound, false); assert.equal(b.settings.music, true);
    const decision = b.audio.updateMusic({ scene: 'exploration', menuOpen: true, paused: true }, 0);
    assert.equal(decision.cueId, id); assert.equal(decision.preview, true);
    const status = b.audio.musicStatus();
    assert.equal(status.state, 'running'); assert.equal(status.title, MUSIC_CUES.find(cue => cue.id === id).title);
    assert.equal(status.theme, false); assert.equal(status.preview, true);
    assert.equal(status.previewCueId, id); assert.equal(status.requestedCueId, null);
    assert.equal(b.audio.score.status().currentCue, id); assert.ok(b.audio.score.playing);
    assert.equal(b.audio.master.gain.value, 0, 'Auditioning music does not enable effects.');
    assert.equal(b.audio.requestCue('missing-piece', .1), false);
    assert.equal(b.audio.musicStatus().previewCueId, id, 'An invalid request cannot interrupt the current performance.');
    b.audio.ctx.currentTime = 1; b.audio.stopPreview(1);
    assert.equal(b.audio.updateMusic({ scene: 'exploration', menuOpen: true, paused: true }, 1).cueId, null);
    assert.equal(b.audio.musicStatus().preview, false);
  } finally { b.restore(); }
});

test('Soundscape interrupts a real audition for observed danger, requeues it safely, and cancels only the audition', async () => {
  const b = boundary(), flight = { scene: 'exploration', paletteKey: 'outside', tags: ['ship', 'flight'] };
  b.audio.director.cues = MUSIC_CUES.filter(cue => cue.family !== 'combat' || cue.id === 'morrow-flightline-loop');
  const at = now => { b.audio.ctx.currentTime = now; return b.audio.updateMusic(flight, now); };
  try {
    const id = 'rain-on-the-transit-line';
    assert.equal(b.audio.requestCue(id, 0), true); at(0);
    const preview = b.audio.score;
    b.audio.musicEvent('combat', 1, 'actual-targeted-volley');
    const battle = at(1), battlePlayer = b.audio.score;
    await Promise.resolve();
    assert.equal(battle.mood, 'combat'); assert.equal(battle.preview, false);
    assert.equal(b.audio.musicStatus().requestedCueId, id);
    assert.equal(b.audio.musicStatus().previewCueId, null);
    assert.equal(b.audio.retiringScore, preview);
    assert.equal(at(5).token, battle.token, 'A pending audition cannot repeatedly restart battle music.');
    const resumed = at(16);
    assert.equal(resumed.previewCueId, id); assert.equal(b.audio.musicStatus().requestedCueId, null);
    assert.ok(preview.status().disposed); assert.notEqual(b.audio.score, preview);
    assert.ok(b.audio.retiringScore === battlePlayer, 'the already-playing recording fades when the audition returns');
    b.audio.musicEvent('combat', 17, 'renewed-local-fire'); const renewed = at(17), renewedPlayer = b.audio.score;
    await Promise.resolve();
    assert.equal(b.audio.musicStatus().requestedCueId, id);
    b.audio.stopPreview(18);
    assert.equal(at(18).token, renewed.token); assert.equal(b.audio.score, renewedPlayer);
    assert.equal(b.audio.musicStatus().requestedCueId, null); assert.equal(b.audio.musicStatus().preview, false);
    assert.equal(at(32).mood, 'recovery');
    assert.notEqual(b.audio.musicStatus().previewCueId, id, 'A cancelled audition does not return after the battle.');
  } finally { b.restore(); }
});

test('Soundscape refuses auditions while music is disabled without unmuting or creating a pending request', () => {
  const b = boundary({ sound: true, music: false });
  try {
    assert.equal(b.audio.requestCue('after-hours-on-glimmer', 0), false);
    assert.equal(b.settings.music, false); assert.equal(b.audio.ctx, null);
    assert.equal(b.audio.musicStatus().requestedCueId, null); assert.equal(b.audio.director.previewRequested, false);
    b.audio.unlock(); b.audio.tone(440);
    assert.equal(b.audio.effects.size, 1, 'Enabled effects retain their independent audio path.');
    assert.equal(b.audio.requestCue('under-the-service-lights', 1), false);
    assert.equal(b.audio.updateMusic({ scene: 'exploration' }, 1).cueId, null);
    assert.equal(b.audio.musicBus.gain.value, 0); assert.equal(b.audio.musicStatus().requestedCueId, null);
  } finally { b.restore(); }
});

test('Soundscape default theme toggle distinguishes another queued audition from the queued theme', () => {
  const b = boundary(), flight = { scene: 'exploration', tags: ['ship', 'flight'] };
  try {
    b.audio.unlock(); b.audio.musicEvent('combat', 0, 'incoming');
    const battle = b.audio.updateMusic(flight, 0), player = b.audio.score;
    assert.equal(b.audio.requestCue('after-hours-on-glimmer', 1), true);
    assert.equal(b.audio.musicStatus().requestedCueId, 'after-hours-on-glimmer');
    assert.equal(b.audio.toggleTheme(), true, 'A different pending piece is replaced by the requested theme.');
    assert.equal(b.audio.musicStatus().requestedCueId, THEME_ID);
    b.audio.ctx.currentTime = 1;
    assert.equal(b.audio.updateMusic(flight, 1).token, battle.token);
    assert.equal(b.audio.toggleTheme(), false, 'Toggling a second time cancels the queued theme.');
    b.audio.ctx.currentTime = 2;
    assert.equal(b.audio.updateMusic(flight, 2).token, battle.token);
    assert.equal(b.audio.score, player); assert.equal(b.audio.musicStatus().requestedCueId, null);
  } finally { b.restore(); }
});

test('death cuts scheduled music and effects immediately and wake restores existing preferences',()=>{
 const b=boundary();try{
  const a=b.audio;a.unlock();a.updateMusic({scene:'menu'},0);a.play('fire');assert.ok(a.score);
  const ctx=a.ctx,settings={...b.settings};a.setRecoveryMuted(true);
  assert.equal(a.score,null);assert.equal(a.retiringScore,null);assert.equal(a.effects.size,0);
  assert.equal(a.master.gain.value,0);assert.equal(a.musicBus.gain.value,0);assert.equal(ctx.state,'running');
  const nodes=ctx.nodes.length;a.unlock();a.play('fire');a.updateMusic({scene:'menu'},1);a.mute();assert.equal(ctx.nodes.length,nodes);assert.equal(a.musicBus.gain.value,0);
  a.setRecoveryMuted(false);assert.equal(a.ctx,ctx);assert.deepEqual(b.settings,settings);ctx.currentTime=10;a.tone(440);assert.ok(a.effects.size>0);
 }finally{b.restore();}
});
