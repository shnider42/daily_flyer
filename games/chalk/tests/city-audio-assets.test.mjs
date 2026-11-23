import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Inspect the actual shipped samples. AudioContext mocks cannot detect truncated
// WAVs, stereo banks, clipped contacts, repeated takes, or a neighbouring step
// accidentally audible because a supposedly silent slot has residual content.
function readPCM(file) {
  const bytes = readFileSync(new URL(`../public/audio/${file}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${file}: RIFF size matches the complete file`);
  let format, payload, position = 12;
  while (position + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', position, position + 4), length = bytes.readUInt32LE(position + 4);
    assert.ok(position + 8 + length <= bytes.length, `${file}: ${kind} chunk has not been truncated`);
    const chunk = bytes.subarray(position + 8, position + 8 + length);
    if (kind === 'fmt ') {
      assert.ok(length >= 16);
      format = { encoding: chunk.readUInt16LE(0), channels: chunk.readUInt16LE(2), rate: chunk.readUInt32LE(4),
        byteRate: chunk.readUInt32LE(8), alignment: chunk.readUInt16LE(12), bits: chunk.readUInt16LE(14) };
    }
    if (kind === 'data') payload = chunk;
    position += 8 + length + length % 2;
  }
  assert.equal(position, bytes.length, `${file}: no partial or dangling chunk header`);
  assert.deepEqual(format, { encoding: 1, channels: 1, rate: 22050, byteRate: 44100, alignment: 2, bits: 16 });
  assert.ok(payload?.length > 0 && payload.length % 2 === 0);
  const samples = Float32Array.from({ length: payload.length / 2 }, (_, index) => payload.readInt16LE(index * 2) / 32768);
  assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= .681), `${file}: meaningful headroom, no clipping`);
  assert.ok(Math.abs(samples[0]) < 1 / 32768 && Math.abs(samples.at(-1)) < 1 / 32768, `${file}: starts and ends at silence`);
  return { samples, rate: format.rate, payload };
}

const peak = samples => samples.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
const rms = samples => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length));

for (const material of ['dirt', 'stone']) {
  test(`${material} footstep bank has six complete distinct contacts with silent slot boundaries`, () => {
    const { samples, rate, payload } = readPCM(`footsteps-${material}-bank.wav`), slotFrames = rate / 2;
    assert.equal(samples.length, slotFrames * 6, 'six complete half-second slots, no missing final take');
    const signatures = new Set();
    for (let index = 0; index < 6; index++) {
      const take = samples.subarray(index * slotFrames, (index + 1) * slotFrames), loudest = peak(take);
      assert.ok(loudest > .2, `slot ${index}: audible recorded contact`);
      assert.ok(rms(take) > .01 && rms(take) < .2, `slot ${index}: useful quiet texture without a sustained loud wash`);
      const onset = take.findIndex(value => Math.abs(value) > loudest * .02);
      assert.ok(onset >= 0 && onset / rate < .025, `slot ${index}: prompt contact, not a delayed scuff`);
      assert.equal(take[0], 0);
      assert.ok(take.subarray(Math.round(.46 * rate)).every(value => value === 0), `slot ${index}: at least 40ms of silence before next contact`);
      assert.ok(rms(take.subarray(Math.round(.2 * rate), Math.round(.44 * rate))) > .0001, `slot ${index}: natural tail retained beyond 200ms`);
      signatures.add(createHash('sha256').update(payload.subarray(index * slotFrames * 2, (index + 1) * slotFrames * 2)).digest('hex'));
    }
    assert.equal(signatures.size, 6, 'alternation draws on six actual takes rather than waveform copies');
  });
}

test('the sparse dog effect is the complete short mono fragment with clean boundaries', () => {
  const { samples, rate } = readPCM('ambient-dog.wav');
  assert.equal(samples.length, 44951, 'the 2.04-second credited fragment has not been cut or repeated');
  assert.ok(peak(samples) > .5);
  assert.ok(rms(samples) > .02 && rms(samples) < .15);
  assert.ok(rms(samples.subarray(-Math.round(.003 * rate))) < rms(samples) * .25, 'the short exit fade removes a hard end click');
});
