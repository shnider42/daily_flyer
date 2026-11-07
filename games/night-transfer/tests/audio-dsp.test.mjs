import test from 'node:test';
import assert from 'node:assert/strict';
import { synthFootstep, synthMurmur, synthTexture, synthEvent, synthRoomImpulse, spatialMix,
  synthPuzzleTone, PUZZLE_TONE_FREQUENCIES, PUZZLE_TONE_DURATION } from '../public/audio-dsp.js';

const RATE = 24000;
function measure(data) {
  let peak = 0, sum = 0, energy = 0, difference = 0;
  for (let i = 0; i < data.length; i++) {
    assert(Number.isFinite(data[i]), 'generated PCM must remain finite');
    peak = Math.max(peak, Math.abs(data[i])); sum += data[i]; energy += data[i] ** 2;
    if (i) difference += (data[i] - data[i - 1]) ** 2;
  }
  return { peak, rms: Math.sqrt(energy / data.length), mean: sum / data.length, energy, brightness: difference / energy, deltaRms: Math.sqrt(difference / data.length) };
}
function energy(data, start, end, rate = RATE) {
  let value = 0;
  for (let i = Math.floor(start * rate); i < Math.min(data.length, Math.floor(end * rate)); i++) value += data[i] ** 2;
  return value;
}
function correlation(a, b) {
  let aa = 0, bb = 0, ab = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { aa += a[i] ** 2; bb += b[i] ** 2; ab += a[i] * b[i]; }
  return ab / Math.sqrt(aa * bb);
}

test('offline footsteps have distinct heel/toe energy, floor colour and bounded varied takes', () => {
  const floors = {};
  for (const material of ['stone', 'tile', 'metal']) {
    const takes = Array.from({ length: 6 }, (_, index) => synthFootstep(RATE, material, index));
    for (const data of takes) {
      const result = measure(data);
      assert(result.peak <= .701); assert(result.rms > .06 && result.rms < .12); assert(Math.abs(result.mean) < .0001);
      assert(data[0] === 0 && data.at(-1) === 0);
      assert(energy(data, .075, .19) > energy(data, 0, .075) * .04, 'the toe/scuff layer is not just silence after the heel');
    }
    assert.deepEqual(takes[0], synthFootstep(RATE, material, 0), 'variants are deterministic cacheable samples');
    assert(takes.slice(1).some(data => Math.abs(correlation(takes[0], data)) < .8), 'a variant changes the waveform, not just its volume');
    floors[material] = takes[0];
  }
  assert(measure(floors.tile).brightness > measure(floors.stone).brightness * 2, 'tile has a brighter contact than concrete');
  assert(energy(floors.metal, .18, .4) > energy(floors.stone, .18, .4) * 2, 'metal has a longer resonant decay');
});

test('offline distant speech textures have uneven phrases, pauses and quiet bounded signals', () => {
  const durations = new Set();
  for (let variant = 0; variant < 6; variant++) {
    const data = synthMurmur(RATE, variant), result = measure(data); durations.add(data.length);
    assert(result.peak <= .521); assert(result.rms > .04 && result.rms <= .076); assert(Math.abs(result.mean) < .0001);
    assert(data.length / RATE > 2 && data.length / RATE < 4.8);
    let longestGap = 0, run = 0;
    const width = Math.round(RATE * .025);
    for (let i = Math.round(RATE * .3); i < data.length - Math.round(RATE * .5); i += width) {
      const window = data.subarray(i, i + width);
      if (measure(window).rms < .007) { run += .025; longestGap = Math.max(longestGap, run); } else run = 0;
    }
    assert(longestGap >= .125, 'there are actual pauses between irregular phrases');
  }
  assert.equal(durations.size, 6, 'murmurs are not equal-length regular syllable trains');
});

test('generated room responses have no dry impulse, independent stereo reflections and a decaying tail', () => {
  for (const rate of [16000, 48000]) for (const space of ['cell', 'tile', 'office', 'plant', 'exterior']) {
    const [left, right] = synthRoomImpulse(rate, space);
    assert.equal(left.length, right.length); assert(left.length / rate < 1.5);
    assert.equal(energy(left, 0, .009, rate), 0, 'the wet path contains reflections, not a second dry source');
    assert(Math.abs(correlation(left, right)) < .2, 'stereo reflections are decorrelated');
    assert(energy(left, .1, .25, rate) > energy(left, .35, .6, rate), 'reflection energy dies away');
    assert(measure(left).peak < .2); assert(measure(right).peak < .2);
  }
  assert(synthRoomImpulse(RATE, 'tile')[0].length > synthRoomImpulse(RATE, 'office')[0].length);
});

// An offline FFT convolution verifies the actual generated wet signal and mix
// headroom without requiring a browser, audio hardware or a Web Audio mock.
function fft(real, imag, inverse = false) {
  const length = real.length;
  for (let i = 1, j = 0; i < length; i++) {
    let bit = length >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; } j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let width = 2; width <= length; width *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / width, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < length; start += width) {
      let ur = 1, ui = 0;
      for (let i = 0; i < width / 2; i++) {
        const a = start + i, b = a + width / 2, tr = real[b] * ur - imag[b] * ui, ti = real[b] * ui + imag[b] * ur;
        real[b] = real[a] - tr; imag[b] = imag[a] - ti; real[a] += tr; imag[a] += ti;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < length; i++) { real[i] /= length; imag[i] /= length; }
}
function convolve(source, impulse) {
  const count = source.length + impulse.length - 1, length = 2 ** Math.ceil(Math.log2(count));
  const ar = new Float64Array(length), ai = new Float64Array(length), br = new Float64Array(length), bi = new Float64Array(length);
  ar.set(source); br.set(impulse); fft(ar, ai); fft(br, bi);
  for (let i = 0; i < length; i++) { const real = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = real; }
  fft(ar, ai, true); return ar.subarray(0, count);
}
test('offline convolved footfalls retain headroom and produce a quiet audible-space tail', () => {
  const rate = 16000, foot = synthFootstep(rate, 'tile', 0), responses = synthRoomImpulse(rate, 'tile');
  for (const response of responses) {
    const wet = convolve(foot, response), mix = Float32Array.from(wet, (sample, i) => ((foot[i] || 0) + sample * .4) * .175);
    const ratio = Math.sqrt(measure(wet).energy * .4 ** 2 / measure(foot).energy);
    assert(ratio > .04 && ratio < .35, 'room response stays below the direct footfall');
    assert(measure(mix).peak < .16, 'the room effect does not turn up or clip the transient');
    assert(energy(mix, .4, .8, rate) > .000001, 'the generated room tail continues after the foot sample ends');
  }
});

test('room textures loop without an exceptional edge click and retain room-specific variation', () => {
  for (const kind of ['machine', 'vent', 'steam', 'water', 'wind']) {
    const data = synthTexture(RATE, kind, 73, 7.13, 52), result = measure(data);
    assert(result.peak < .9); assert(result.rms > .1 && result.rms < .22); assert(Math.abs(result.mean) < .001);
    assert(Math.abs(data[0] - data.at(-1)) < result.deltaRms * 4, 'the wrap edge is no larger than ordinary texture changes');
    const other = synthTexture(RATE, kind, 293, 7.13, 52);
    assert(!data.every((value, i) => value === other[i]));
  }
  for (const kind of ['keys', 'door', 'chain', 'pipe', 'drip', 'hiss', 'water', 'settle']) {
    const result = measure(synthEvent(RATE, kind, 0)); assert(result.peak <= .641); assert(Math.abs(result.mean) < .001);
  }
});

test('spatial mapping follows the game yaw convention and attenuates distant sources gently', () => {
  const ahead = { x: 0, z: -6 }, right = { x: 4, z: 0 };
  assert.equal(spatialMix({ x: 0, z: 0, yaw: 0 }, ahead).pan, 0);
  assert(spatialMix({ yaw: Math.PI / 2 }, ahead).pan > .8);
  assert(spatialMix({ yaw: -Math.PI / 2 }, ahead).pan < -.8);
  assert(spatialMix({ yaw: 0 }, right).pan > .8);
  assert(spatialMix({ yaw: Math.PI }, right).pan < -.8);
  assert(spatialMix({ x: 0, z: 0 }, { x: 0, z: -12 }).gain < spatialMix({ x: 0, z: 0 }, ahead).gain);
});

test('receiver references use three clear stable pitches with smooth edges and equal bounded mono levels', () => {
  assert.deepEqual(PUZZLE_TONE_FREQUENCIES, { low: 330, mid: 550, high: 880 });
  const spectralAmplitude = (data, frequency, rate) => {
    let real = 0, imaginary = 0;
    const first = Math.round(rate * .06), last = Math.round(rate * .32);
    for (let i = first; i < last; i++) {
      const phase = 2 * Math.PI * frequency * i / rate;
      real += data[i] * Math.cos(phase); imaginary += data[i] * Math.sin(phase);
    }
    return 2 * Math.hypot(real, imaginary) / (last - first);
  };
  for (const rate of [8000, 24000, 48000]) {
    const levels = [];
    for (const [tone, frequency] of Object.entries(PUZZLE_TONE_FREQUENCIES)) {
      const data = synthPuzzleTone(rate, tone), result = measure(data); levels.push(result.rms);
      assert.equal(data.length, Math.round(rate * PUZZLE_TONE_DURATION));
      assert(result.peak < .51 && result.rms > .27 && result.rms < .32);
      assert(Math.abs(result.mean) < .0001); assert(data[0] === 0 && data.at(-1) === 0);
      assert(energy(data, 0, .01, rate) < energy(data, .1, .11, rate) * .5, 'the attack avoids an edge click');
      assert(spectralAmplitude(data, frequency, rate) > .42, 'the labelled reference dominates its spectrum');
      for (const other of Object.values(PUZZLE_TONE_FREQUENCIES)) if (other !== frequency) {
        assert(spectralAmplitude(data, other, rate) < .025, 'no other reference pitch is disguised in the same tone');
      }
      assert.deepEqual(data, synthPuzzleTone(rate, tone), 'replays and calibration can reuse identical PCM');
    }
    assert(Math.max(...levels) / Math.min(...levels) < 1.01, 'loudness does not encode a second signal');
  }
  for (const [rate, tone] of [[0, 'low'], [Infinity, 'mid'], [24000, 'unknown'], [24000, '__proto__']]) {
    assert.throws(() => synthPuzzleTone(rate, tone), RangeError);
  }
});
