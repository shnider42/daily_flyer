import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENT, makeAssets, sampleFor, waveFor, SAMPLE_CACHE_LIMIT, SAMPLE_CACHE_BYTES } from '../dist/music-instruments.mjs';
import { MUSIC_CUES, scoreEvents } from '../dist/music-score.mjs';

function context(sampleRate = 48000) {
  return { sampleRate,
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate: rate, duration: length / rate, numberOfChannels: channels, getChannelData: channel => data[channel] };
    },
    createPeriodicWave(real, imaginary) { return { real, imaginary }; },
  };
}

const sustained = new Set(['pad', 'organ', 'bowed', 'reed', 'analog']);
function brightness(buffer) {
  const data = buffer.getChannelData(0), length = Math.min(data.length, buffer.sampleRate * .2);
  let energy = 0, changes = 0;
  for (let i = 1; i < length; i++) { energy += data[i] ** 2; changes += (data[i] - data[i - 1]) ** 2; }
  return changes / energy;
}

test('sampled instruments produce finite, bounded audio with quiet edges and no sustained DC', () => {
  const ctx = context(), assets = makeAssets(ctx);
  for (const instrument of Object.keys(INSTRUMENT).filter(name => !sustained.has(name))) {
    for (const midi of ['piano', 'felt', 'guitar', 'pluck', 'mallet', 'bass', 'metalChug', 'metalLead', 'metalBass'].includes(instrument) ? [36, 60, 84] : [60]) {
      const { buffer, rate } = sampleFor(ctx, assets, instrument, midi, .76), data = buffer.getChannelData(0);
      assert.ok(rate > 0 && Number.isFinite(rate), instrument);
      assert.equal(Math.abs(data[0]), 0, `${instrument}: quiet attack edge`);
      assert.equal(Math.abs(data.at(-1)), 0, `${instrument}: quiet sample tail`);
      let peak = 0, dc = 0, energy = 0;
      for (const value of data) {
        assert.ok(Number.isFinite(value), instrument);
        peak = Math.max(peak, Math.abs(value)); dc += value; energy += value * value;
      }
      assert.ok(peak > .5 && peak < .96, `${instrument}: normalized headroom`);
      assert.ok(Math.abs(dc / data.length) < .001, `${instrument}: no DC buildup`);
      assert.ok(energy / data.length > .00001, `${instrument}: audible signal`);
    }
  }
});

test('soft and strong keyboard/string articulation changes tone without new pitch or unbounded caching', () => {
  const ctx = context(), assets = makeAssets(ctx);
  for (const instrument of ['piano', 'felt', 'guitar']) {
    const soft = sampleFor(ctx, assets, instrument, 60, .4), strong = sampleFor(ctx, assets, instrument, 60, .8);
    assert.equal(soft.rate, strong.rate, `${instrument}: articulation keeps tuning`);
    assert.notEqual(soft.buffer, strong.buffer, `${instrument}: distinct articulation`);
    assert.ok(brightness(strong.buffer) > brightness(soft.buffer) * 1.08, `${instrument}: stronger touch has more upper energy`);
    assert.equal(sampleFor(ctx, assets, instrument, 60, .81).buffer, strong.buffer, `${instrument}: nearby velocities reuse a layer`);
  }
});

test('browsing the entire score shares a bounded sample bank and native-rate room impulses', () => {
  const ctx = context(44100), assets = makeAssets(ctx);
  assert.equal(makeAssets(ctx), assets);
  assert.equal(assets.impulse.sampleRate, 44100);
  assert.equal(assets.roomImpulse.sampleRate, 44100);
  assert.equal(assets.impulse.numberOfChannels, 2);
  assert.ok(assets.roomImpulse.duration < assets.impulse.duration);
  for (const cue of MUSIC_CUES) for (const event of scoreEvents(cue.id).events) {
    assert.ok(INSTRUMENT[event.instrument], `${cue.id}: known voice`);
    if (sustained.has(event.instrument)) waveFor(ctx, assets, event.instrument);
    else sampleFor(ctx, assets, event.instrument, event.midi, event.velocity);
    assert.ok(assets.samples.size <= SAMPLE_CACHE_LIMIT);
    assert.ok(assets.sampleBytes <= SAMPLE_CACHE_BYTES);
  }
  const calculated = [...assets.samples.values()].reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0);
  assert.equal(assets.sampleBytes, calculated, 'evictions retain accurate memory accounting');
  assert.ok(assets.sampleBytes > 1_000_000, 'the check exercised a real bank');
  assert.equal(assets.waves.size, sustained.size);
});

test('Crosswind strings keep sharp rhythm gates, sustained leads and touch-dependent bite', () => {
  const ctx = context(), assets = makeAssets(ctx);
  const energy = (buffer, start, end) => {
    const data = buffer.getChannelData(0), first = Math.floor(start * buffer.sampleRate), last = Math.floor(end * buffer.sampleRate);
    let sum = 0;
    for (let i = first; i < last; i++) sum += (data[i] || 0) ** 2;
    return sum / (last - first);
  };
  const chug = sampleFor(ctx, assets, 'metalChug', 38, .8), lead = sampleFor(ctx, assets, 'metalLead', 62, .8);
  const remaining = sample => energy(sample.buffer, .5, .65) / energy(sample.buffer, .02, .1);
  assert.ok(remaining(chug) < .12, 'palm damping removes the long ringing rhythm tail');
  assert.ok(remaining(lead) > .5, 'the lead can hold a melody above the short chugs');
  assert.ok(INSTRUMENT.metalChug.release <= .055 && INSTRUMENT.metalBass.release <= .07,
    'fast riff releases fit between alternate-picked notes');
  assert.ok(INSTRUMENT.metalLead.release <= .15, 'lead overlaps remain bounded');
  for (const instrument of ['metalChug', 'metalLead']) {
    const midi = instrument === 'metalChug' ? 38 : 74;
    const soft = sampleFor(ctx, assets, instrument, midi, .4), strong = sampleFor(ctx, assets, instrument, midi, .8);
    assert.equal(soft.rate, strong.rate, `${instrument}: harder picking keeps the pitch`);
    assert.ok(brightness(strong.buffer) > brightness(soft.buffer) * 1.08, `${instrument}: accents add bite`);
    assert.equal(sampleFor(ctx, assets, instrument, midi, .85).buffer, strong.buffer, `${instrument}: shared touch layer`);
    const semitone = sampleFor(ctx, assets, instrument, midi + 1, .8);
    assert.equal(semitone.buffer, strong.buffer, `${instrument}: adjacent notes share a pitch zone`);
    assert.ok(Math.abs(semitone.rate / strong.rate - 2 ** (1 / 12)) < 1e-12, `${instrument}: semitone tuning`);
  }
});

test('Crosswind drum voices have separate attacks and tom fills share one tunable sample', () => {
  const ctx = context(), assets = makeAssets(ctx), samples = new Map();
  for (const [instrument, midi] of [['metalKick', 36], ['metalSnare', 38], ['metalHat', 42], ['metalCrash', 49], ['metalTom', 45]]) {
    const sample = sampleFor(ctx, assets, instrument, midi, .8);
    samples.set(instrument, sample.buffer);
    assert.equal(sampleFor(ctx, assets, instrument, midi, .5).buffer, sample.buffer,
      `${instrument}: dense percussion reuses the same source buffer`);
    assert.ok(INSTRUMENT[instrument].echo === 0, `${instrument}: rapid hits do not grow an echo train`);
  }
  assert.equal(new Set(samples.values()).size, 5, 'kick, snare, hat, crash and tom are distinct sounds');
  assert.ok(samples.get('metalHat').duration < .15, 'closed hat remains tight');
  assert.ok(samples.get('metalCrash').duration > 1, 'crash has a real cymbal decay');
  const low = sampleFor(ctx, assets, 'metalTom', 43), high = sampleFor(ctx, assets, 'metalTom', 48);
  assert.equal(low.buffer, high.buffer);
  assert.ok(Math.abs(high.rate / low.rate - 2 ** (5 / 12)) < 1e-12, 'five-semitone tom fill is tuned');
});
