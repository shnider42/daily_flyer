import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reportProfile } from '../public/acoustics.mjs';
import { fallbackReportData } from '../public/weapon-reports.mjs';
import { SQUAD_ROLES } from '../public/squad-roles.mjs';

// Inspect the shipped PCM, including its slot boundaries; a mocked decoder
// cannot catch a delayed attack, clipped source, duplicated take, or extra shot.
function readMonoPCM16(file) {
  const bytes = readFileSync(new URL(`../public/audio/${file}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let format, payload;
  for (let position = 12; position + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', position, position + 4), length = bytes.readUInt32LE(position + 4);
    assert.ok(position + 8 + length <= bytes.length, `${file} has a complete ${kind} chunk`);
    const chunk = bytes.subarray(position + 8, position + 8 + length);
    if (kind === 'fmt ') {
      assert.ok(length >= 16);
      format = { encoding: chunk.readUInt16LE(0), channels: chunk.readUInt16LE(2), rate: chunk.readUInt32LE(4), bits: chunk.readUInt16LE(14) };
    }
    if (kind === 'data') payload = chunk;
    position += 8 + length + length % 2;
  }
  assert.ok(format && payload?.length, `${file} has an audio format and PCM data`);
  assert.equal(format.encoding, 1, 'source banks use ordinary PCM');
  assert.equal(format.channels, 1, 'weapon sources remain mono for spatial placement');
  assert.equal(format.bits, 16);
  assert.ok(format.rate >= 22050 && format.rate <= 96000);
  assert.equal(payload.length % 2, 0);
  const data = Float32Array.from({ length: payload.length / 2 }, (_, index) => payload.readInt16LE(index * 2) / 32768);
  return { data, rate: format.rate };
}

const peak = data => data.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / Math.max(1, data.length));
const window = (data, rate, from, to) => data.subarray(Math.round(from * rate), Math.round(to * rate));
function correlation(a, b) {
  let product = 0, aEnergy = 0, bEnergy = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    product += a[index] * b[index]; aEnergy += a[index] ** 2; bEnergy += b[index] ** 2;
  }
  return product / Math.sqrt(aEnergy * bEnergy);
}

for (const [weapon, file] of [['rifle', 'rifle-report-bank.wav'], ['support', 'saw-report-bank.wav']]) {
  test(`${weapon} bank has three distinct prompt attacks, clean ends and silent slot separation`, () => {
    const { data, rate } = readMonoPCM16(file), profile = reportProfile(weapon), takes = [];
    assert.equal(profile.offsets.length, 3);
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) < .98), 'the edited source keeps headroom without clipped or nonfinite samples');
    for (let index = 0; index < profile.offsets.length; index++) {
      const start = profile.offsets[index], end = start + profile.duration, next = profile.offsets[index + 1] ?? data.length / rate;
      assert.ok(end + .01 <= next, 'the complete report ends before the next bank slot');
      const take = window(data, rate, start, end), loudest = peak(take);
      assert.ok(loudest > .1, 'the bank contains an audible report');
      const onset = take.findIndex(value => Math.abs(value) >= loudest * .02);
      assert.ok(onset >= 0 && onset / rate < .005, 'the attack is aligned within 5 ms of the selected offset');
      assert.ok(Math.abs(take[0]) <= 1 / 32768 && Math.abs(take.at(-1)) <= 1 / 32768, 'the edited report enters and leaves at silence');
      assert.ok(rms(window(take, rate, profile.duration - .01, profile.duration)) < rms(window(take, rate, 0, .025)) * .03, 'a faded tail prevents an abrupt end click');
      assert.ok(window(data, rate, end, next).every(value => Math.abs(value) <= 1 / 32768), 'no residual shot or noise sits between source slots');
      takes.push(take);
    }
    for (let first = 0; first < takes.length; first++) for (let second = first + 1; second < takes.length; second++) {
      assert.ok(Math.abs(correlation(takes[first], takes[second])) < .98, 'alternation selects different takes rather than copies of one waveform');
    }
  });
}

test('the SAW source decays before its next playable round instead of stacking loud plateaus', () => {
  const { data, rate } = readMonoPCM16('saw-report-bank.wav'), profile = reportProfile('support');
  for (const offset of profile.offsets) {
    const take = window(data, rate, offset, offset + profile.duration), interval = SQUAD_ROLES.support.fireInterval;
    const attack = rms(window(take, rate, 0, .025)), nextRound = rms(window(take, rate, interval - .02, interval));
    assert.ok(nextRound < attack * .5, 'there is at least 6 dB of decay before the next automatic round');
  }
});

test('cached fallback report data stays finite, bounded and decaying at low and common device rates', () => {
  for (const rate of [8000, 44100, 48000]) for (const weapon of ['rifle', 'support', 'hostile', 'hostile_support', 'sniper']) {
    const data = fallbackReportData(rate, weapon), duration = data.length / rate, loudest = peak(data);
    assert.ok(duration > .15 && duration < .5);
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) < .98));
    assert.ok(loudest > .1);
    assert.equal(Math.abs(data[0]), 0); assert.equal(Math.abs(data.at(-1)), 0);
    assert.ok(data.findIndex(value => Math.abs(value) > loudest * .02) / rate < .005);
    const attack = rms(window(data, rate, 0, .025)), tail = rms(window(data, rate, duration - .025, duration));
    assert.ok(tail < attack * .1, `${weapon}/${rate} fades instead of sustaining a noise bed`);
  }
});
