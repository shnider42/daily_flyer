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
    for (const midi of ['piano', 'felt', 'guitar', 'pluck', 'mallet', 'bass'].includes(instrument) ? [36, 60, 84] : [60]) {
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
