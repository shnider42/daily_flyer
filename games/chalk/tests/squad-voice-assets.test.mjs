import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { VOICE_LINES, VOICE_SAMPLE_FILES } from '../public/squad-voice-lines.mjs';

// Check the shipped PCM and playback spans together: a correct-looking catalog
// cannot protect the listener against a truncated phrase or next-line bleed.
function pcm(file) {
  const bytes = readFileSync(new URL(`../public/audio/${file}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  let format, payload, cursor = 12;
  while (cursor + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', cursor, cursor + 4), length = bytes.readUInt32LE(cursor + 4);
    assert.ok(cursor + 8 + length <= bytes.length, `${kind} is complete`);
    const body = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (kind === 'fmt ') format = [body.readUInt16LE(0), body.readUInt16LE(2), body.readUInt32LE(4), body.readUInt16LE(14)];
    if (kind === 'data') payload = body;
    cursor += 8 + length + length % 2;
  }
  assert.equal(cursor, bytes.length);
  assert.deepEqual(format, [1, 1, 22050, 16], 'mono 22.05 kHz PCM16');
  assert.ok(payload?.length > 0 && payload.length % 2 === 0);
  const samples = Float32Array.from({ length: payload.length / 2 }, (_, i) => payload.readInt16LE(i * 2) / 32768);
  return { rate: format[2], samples, payload };
}

test('squad speech bank has complete distinct natural performances and safe playback boundaries', () => {
  const { samples, rate, payload } = pcm(VOICE_SAMPLE_FILES.squadVoice), signatures = new Set();
  const lines = VOICE_LINES.filter(line => line.sample === 'squadVoice');
  assert.equal(lines.length, 15);
  assert.equal(new Set(VOICE_LINES.map(line => line.id)).size, VOICE_LINES.length);
  assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= .681), 'quiet headroom without clipped samples');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], start = Math.round(line.offset * rate), end = Math.round((line.offset + line.duration) * rate);
    const next = i + 1 < lines.length ? Math.round(lines[i + 1].offset * rate) : samples.length;
    assert.equal(line.sample, 'squadVoice');
    assert.ok(start >= 0 && end > start && end <= samples.length, `${line.id}: entire recording is present`);
    assert.ok(line.duration >= .5 && line.duration < 1.5, `${line.id}: short, complete tactical phrase`);
    assert.ok(next - end >= rate * .099, `${line.id}: silent guard before next phrase`);
    assert.ok(samples.subarray(end, next).every(value => value === 0), `${line.id}: no next-phrase bleed`);
    assert.equal(samples[start], 0, `${line.id}: clean onset`);
    assert.equal(samples[end - 1], 0, `${line.id}: clean closing edge`);
    const take = samples.subarray(start, end);
    const rms = Math.sqrt(take.reduce((sum, value) => sum + value * value, 0) / take.length);
    assert.ok(rms > .08 && rms <= .151, `${line.id}: comparable intelligible phrase levels`);
    signatures.add(createHash('sha256').update(payload.subarray(start * 2, end * 2)).digest('hex'));
  }
  assert.equal(signatures.size, lines.length, 'variety comes from different recordings, not waveform copies');
});

test('additional radio recordings are complete distinct takes and remain confined to radio categories', () => {
  const { samples, rate, payload } = pcm(VOICE_SAMPLE_FILES.fieldRadio), signatures = new Set();
  const lines = VOICE_LINES.filter(line => line.sample === 'fieldRadio');
  assert.equal(lines.length, 10); assert.equal(VOICE_LINES.length, 25);
  for (const [i, line] of lines.entries()) {
    const start = Math.round(line.offset * rate), end = Math.round((line.offset + line.duration) * rate);
    const next = i + 1 < lines.length ? Math.round(lines[i + 1].offset * rate) : samples.length;
    assert.ok(line.radioOnly && line.categories.every(category => category.startsWith('dispatch_')));
    assert.ok(start >= 0 && end > start && end <= samples.length);
    assert.ok(line.duration > 2 && line.duration < 3.5, `${line.id} keeps the full performance`);
    assert.ok(next - end >= rate * .119 && samples.subarray(end, next).every(value => value === 0));
    assert.equal(samples[start], 0); assert.equal(samples[end - 1], 0);
    const take = samples.subarray(start, end);
    assert.ok(take.every(value => Math.abs(value) <= .601));
    assert.ok(Math.sqrt(take.reduce((sum,value) => sum + value * value, 0) / take.length) > .04);
    signatures.add(createHash('sha256').update(payload.subarray(start * 2, end * 2)).digest('hex'));
  }
  assert.equal(signatures.size, lines.length);
});

test('voice categories preserve what was actually said and omit the retired movement line', () => {
  for (const category of ['move', 'hold', 'cover', 'warning', 'reload', 'help', 'suppression', 'frag', 'contact', 'sniper']) {
    assert.ok(VOICE_LINES.some(line => line.categories.includes(category)), `${category} has a real recording`);
  }
  assert.equal(VOICE_LINES.filter(line => line.categories.includes('move')).length, 3, 'three actual movement phrases');
  assert.ok(!VOICE_LINES.some(line => /alright|let.s move out|target destroyed|mission complete|you win/i.test(line.text)));
  const frag = VOICE_LINES.find(line => line.categories.includes('frag'));
  assert.equal(frag.text, 'Fire in the hole!');
  assert.ok(!frag.categories.includes('flash'), 'flash warning is not mislabeled lethal blast speech');
  assert.ok(VOICE_LINES.filter(line => line.categories.includes('flash')).every(line => ['Look out!', 'Get down!'].includes(line.text)),
    'generic flash warnings do not pretend to say an unrecorded phrase');
});
