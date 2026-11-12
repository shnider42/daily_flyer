import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MUSIC_CUES, THEME_ID, scoreEvents, ScorePlayer, SCORE_LOOKAHEAD, SCORE_MAX_VOICES } from '../dist/music-score.mjs';

class Parameter {
  constructor(value = 0) { this.value = value; this.automation = []; }
  setValueAtTime(value, time) { this.value = value; this.automation.push(['set', value, time]); return this; }
  linearRampToValueAtTime(value, time) { this.automation.push(['ramp', value, time]); return this; }
  cancelScheduledValues(time) { this.automation.push(['cancel', time]); return this; }
  cancelAndHoldAtTime(time) { this.automation.push(['hold', time]); return this; }
}

class AudioNode {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.connections = new Set(); this.disconnected = false;
    for (const name of ['gain', 'pan', 'frequency', 'detune', 'playbackRate', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new Parameter(name === 'playbackRate' ? 1 : 0);
    if (kind === 'Convolver') Object.defineProperty(this, 'buffer', {
      get() { return this._buffer; },
      set(value) {
        if (value && value.sampleRate !== ctx.sampleRate) throw new Error('NotSupportedError: convolver buffer sample rate must match AudioContext');
        this._buffer = value;
      },
    });
  }
  connect(destination) { this.connections.add(destination); return destination; }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  setPeriodicWave(wave) { this.wave = wave; }
  start(time) {
    this.startedAt = time; this.ctx.sourceStarts.push({ node: this, at: time, requestedAt: this.ctx.currentTime });
    this.ctx.sources.add(this);
  }
  stop(time) { this.stoppedAt = time; }
}

function audioContext({ sampleRate = 24000 } = {}) {
  const ctx = {
    currentTime: 0, state: 'running', sampleRate, sources: new Set(), sourceStarts: [], nodes: [],
    createBuffer(channels, length, sampleRate) {
      const arrays = Array.from({ length: channels }, () => new Float32Array(length));
      return { duration: length / sampleRate, length, sampleRate, numberOfChannels: channels, getChannelData: index => arrays[index] };
    },
    createPeriodicWave(real, imaginary) { return { real, imaginary }; },
    advance(now) {
      this.currentTime = now;
      for (const source of this.sources) {
        const naturalEnd = source.buffer ? source.startedAt + source.buffer.duration / source.playbackRate.value : Infinity;
        if (Math.min(source.stoppedAt ?? Infinity, naturalEnd) <= now) {
          this.sources.delete(source); source.onended?.();
        }
      }
    },
  };
  for (const kind of ['Gain', 'BiquadFilter', 'Delay', 'Convolver', 'StereoPanner', 'DynamicsCompressor', 'BufferSource', 'Oscillator']) {
    ctx[`create${kind}`] = () => { const node = new AudioNode(ctx, kind); ctx.nodes.push(node); return node; };
  }
  ctx.destination = ctx.createGain();
  return ctx;
}

test('the score catalog has authored contrast and a full original theme', () => {
  assert.equal(MUSIC_CUES.length, 37);
  assert.equal(new Set(MUSIC_CUES.map(cue => cue.id)).size, MUSIC_CUES.length);
  assert.deepEqual(new Set(MUSIC_CUES.map(cue => cue.family)), new Set(['theme', 'exploration', 'social', 'discovery', 'tension', 'combat', 'recovery', 'terror', 'cave', 'planet']));
  assert.equal(MUSIC_CUES.filter(cue => cue.family === 'combat').length, 11);
  assert.equal(MUSIC_CUES.filter(cue => cue.family === 'cave').length, 5);
  assert.equal(MUSIC_CUES.filter(cue => cue.family === 'planet').length, 10);
  assert.ok(MUSIC_CUES.filter(cue => cue.family === 'exploration').length >= 3);
  assert.ok(MUSIC_CUES.filter(cue => cue.family === 'social').length >= 2);
  assert.ok(MUSIC_CUES.some(cue => cue.family === 'social' && cue.tags.includes('whimsical')));
  const metadata = MUSIC_CUES.find(cue => cue.id === THEME_ID), theme = scoreEvents(THEME_ID);
  assert.equal(metadata.bars, 64); assert.equal(theme.bpm, 78); assert.equal(theme.beats, 256);
  assert.ok(metadata.durationSeconds > 190 && metadata.durationSeconds < 205);
  assert.deepEqual(theme.events.filter(event => event.part === 'melody').slice(0, 8).map(event => event.midi), [62, 69, 67, 64, 65, 64, 60, 62]);
  assert.ok(theme.events.find(event => event.part === 'melody').beat * 60 / theme.bpm < 1, 'The hook arrives at the start, not after a long drone.');
  assert.equal(theme.events.filter(event => event.beat < 31 && event.part === 'rhythm').length, 0);
  assert.ok(theme.events.some(event => event.beat > 192 && event.beat < 224 && event.instrument === 'guitar' && event.part === 'melody'), 'The full tune returns after the B section.');
  assert.ok(theme.events.some(event => event.beat > 248 && event.instrument === 'piano' && event.part === 'melody'), 'The ending is an intimate reprise.');
  const terror = scoreEvents('a-room-without-an-answer');
  assert.ok(terror.events.length <= 12, 'Terror is a sparse authored exception, not a continuous horror pulse.');
});

test('the complete original main theme preserves every authored note and performance parameter', () => {
  const score = scoreEvents(THEME_ID, { seed: 'farwake-theme-preservation' });
  assert.equal(score.events.length, 888);
  assert.equal(createHash('sha256').update(JSON.stringify(score)).digest('hex'),
    '52892c51b20a51506eebe29bbca828e114b6367f4f74b782e92083c68199d3bd');
});

test('all scores are finite, ordered and reproducible; seeds change performance rather than composition', () => {
  for (const cue of MUSIC_CUES) {
    const first = scoreEvents(cue.id, { seed: 'a-home-system' }), same = scoreEvents(cue.id, { seed: 'a-home-system' });
    const other = scoreEvents(cue.id, { seed: 'a-different-system' });
    assert.deepEqual(first, same, cue.id);
    assert.equal(first.events.length, other.events.length, cue.id);
    const signature = score => score.events.map(event => `${event.instrument}:${event.midi}:${event.duration}:${event.part}`).sort();
    assert.deepEqual(signature(first), signature(other), `${cue.id}: authored notes remain recognizable across seeds`);
    assert.notDeepEqual(first.events, other.events, `${cue.id}: small performance variation exists`);
    for (let i = 0; i < first.events.length; i++) {
      const event = first.events[i];
      for (const name of ['beat', 'duration', 'midi', 'velocity', 'pan']) assert.ok(Number.isFinite(event[name]), `${cue.id} ${name}`);
      assert.ok(event.beat >= 0 && event.beat < first.beats, cue.id);
      assert.ok(event.duration > 0 && event.duration <= first.beats, cue.id);
      assert.ok(Number.isInteger(event.midi) && event.midi >= 24 && event.midi <= 96, cue.id);
      assert.ok(event.velocity > 0 && event.velocity < 1 && Math.abs(event.pan) <= 1, cue.id);
      if (i) assert.ok(event.beat >= first.events[i - 1].beat, cue.id);
    }
  }
  assert.throws(() => scoreEvents('unknown-piece'), RangeError);
});

test('the renderer schedules a short window and skips missed notes after a stalled frame', () => {
  const ctx = audioContext(), player = new ScorePlayer(ctx, ctx.destination);
  player.play('keep-her-together', { fadeIn: .1 });
  assert.ok(ctx.sourceStarts.length > 0);
  assert.ok(ctx.sourceStarts.every(source => source.at <= SCORE_LOOKAHEAD + .005));
  assert.ok(player.status().nextEventIndex < 12, 'The whole score is not scheduled at once.');
  const first = ctx.sourceStarts.length;
  ctx.advance(22); player.update();
  const resumed = ctx.sourceStarts.slice(first);
  assert.ok(resumed.length < 16, 'Missed bars are skipped rather than replayed as a burst.');
  assert.ok(resumed.every(source => source.at >= 22 && source.at <= 22 + SCORE_LOOKAHEAD + .005));
  player.dispose();
  assert.equal(player.playing, false); assert.equal(player.ended, true); assert.equal(player.status().activeVoices, 0);
});

test('all 37 complete pieces keep active notes and their releases within the voice budget', () => {
  for (const { id, family } of MUSIC_CUES) {
    const ctx = audioContext(), player = new ScorePlayer(ctx, ctx.destination);
    player.play(id, { fadeIn: .3 });
    let maximum = 0;
    for (let time = .05; time < player.duration + 1; time += .05) {
      ctx.advance(time); player.update(); maximum = Math.max(maximum, player.status().activeVoices);
      assert.ok(player.status().activeVoices <= SCORE_MAX_VOICES, id);
    }
    assert.ok(maximum > (family === 'combat' ? 5 : 0), `${id}: actual playback occurred`);
    assert.equal(player.playing, false, id); assert.equal(player.ended, true, id);
    assert.equal(player.status().activeVoices, 0, id);
    assert.ok(ctx.sourceStarts.every(({ node }) => node.disconnected), `${id}: all completed source nodes disconnect`);
    player.dispose();
    assert.ok(ctx.nodes.slice(1).every(node => node.disconnected), `${id}: the effect graph also disconnects`);
  }
});

test('a fade stops scheduling immediately and suspension can force a fade to finish', () => {
  const ctx = audioContext(), player = new ScorePlayer(ctx, ctx.destination);
  player.play(THEME_ID);
  ctx.advance(.5); player.update();
  player.stop(4); const count = ctx.sourceStarts.length;
  ctx.advance(1); player.update();
  assert.equal(ctx.sourceStarts.length, count, 'An outgoing cue schedules no additional notes.');
  assert.equal(player.playing, true, 'Existing notes may finish beneath the fade.');
  player.suspend();
  assert.equal(player.playing, false); assert.equal(player.ended, true); assert.equal(player.status().activeVoices, 0);
  player.play('glass-on-the-windows', { volume: .5 });
  assert.equal(player.ended, false);
  ctx.state = 'suspended'; const before = ctx.sourceStarts.length;
  ctx.advance(1.4); player.update();
  assert.equal(ctx.sourceStarts.length, before, 'A suspended context does not accumulate new sources.');
  player.dispose();
  assert.throws(() => player.play(THEME_ID), /disposed/);
});

test('user volume automation is independent of the natural cue envelope', () => {
  const ctx = audioContext(), player = new ScorePlayer(ctx, ctx.destination);
  player.play('first-blue-morning', { volume: .6 });
  const fadeAutomation = structuredClone(player._fade.gain.automation);
  ctx.advance(4); player.setVolume(.2, .4);
  assert.equal(player.volume, .2);
  assert.deepEqual(player._fade.gain.automation, fadeAutomation, 'Ducking must not remove the authored ending fade.');
  assert.deepEqual(player.outputGain.gain.automation.at(-1), ['ramp', .2, 4.4]);
  player.dispose();
});

test('native 44.1 and 48 kHz contexts receive matching reverb impulses while instrument samples stay compact', () => {
  for (const sampleRate of [44100, 48000]) {
    const ctx = audioContext({ sampleRate }), player = new ScorePlayer(ctx, ctx.destination);
    assert.equal(player.assets.impulse.sampleRate, sampleRate);
    assert.equal(player.assets.impulse.numberOfChannels, 2);
    assert.equal(player.assets.impulse.duration, 2.5);
    assert.doesNotThrow(() => player.play(THEME_ID));
    assert.ok(player.assets.samples.size > 0, 'The regression exercises actual source creation.');
    for (const buffer of player.assets.samples.values()) assert.equal(buffer.sampleRate, 24000, 'Pitched source buffers remain capped at 24 kHz.');
    const secondPlayer = new ScorePlayer(ctx, ctx.destination);
    assert.equal(secondPlayer.assets, player.assets, 'Crossfading players share the native impulse and instrument buffers.');
    secondPlayer.dispose(); player.dispose();
  }
});
