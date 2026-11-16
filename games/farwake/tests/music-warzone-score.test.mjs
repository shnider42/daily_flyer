import test from 'node:test';
import assert from 'node:assert/strict';
import { WARZONE_COMPOSITIONS, WARZONE_CUE_IDS } from '../dist/music-warzone.mjs';
import { MUSIC_CUES, SCORE_LOOKAHEAD, SCORE_MAX_VOICES, scoreEvents } from '../dist/music-score.mjs';
import { INSTRUMENT } from '../dist/music-instruments.mjs';

function peakScheduledVoices(score) {
  const seconds = 60 / score.bpm;
  // A source counts against the real player's limit from when it is scheduled,
  // including its future lookahead window and the complete instrument release.
  const edges = score.events.flatMap(event => [
    [event.beat * seconds - SCORE_LOOKAHEAD, 1],
    [(event.beat + event.duration) * seconds + INSTRUMENT[event.instrument].release, -1],
  ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0, peak = 0;
  for (const [, delta] of edges) { current += delta; peak = Math.max(peak, current); }
  return peak;
}
const windows = values => new Set(values.slice(0, -4).map((_, index) => values.slice(index, index + 5).join(',')));

test('Crosswind has exactly three complete metal tracks with equal location eligibility', () => {
  assert.equal(WARZONE_COMPOSITIONS.length, 3);
  assert.equal(new Set(WARZONE_CUE_IDS).size, 3);
  assert.equal(MUSIC_CUES.filter(cue => cue.tags.includes('crosswind')).length, 3);
  for (const source of WARZONE_COMPOSITIONS) {
    const cue = MUSIC_CUES.find(entry => entry.id === source.id);
    assert.ok(cue); assert.equal(cue.family, 'combat');
    assert.ok(cue.durationSeconds >= 120 && cue.durationSeconds <= 155, cue.id);
    for (const tag of ['crosswind', 'ship', 'ground', 'metal']) assert.ok(cue.tags.includes(tag), `${cue.id}: ${tag}`);
    assert.ok(!cue.tags.includes('authored-terror'));
  }
  assert.equal(new Set(WARZONE_COMPOSITIONS.map(cue => cue.bpm)).size, 3);
});

test('each battle song starts heavy, develops its own hook, and returns to it before a written ending', () => {
  const riffIdentities = new Set(), melodyIdentities = new Set(), rhythmIdentities = new Set();
  for (const cue of WARZONE_COMPOSITIONS) {
    const score = scoreEvents(cue.id, { seed: 'crosswind-written-form' }), seconds = 60 / score.bpm;
    for (const part of ['riff', 'bass', 'rhythm', 'melody']) {
      assert.ok(score.events.some(event => event.part === part && event.beat * seconds < 1), `${cue.id}: immediate ${part}`);
    }
    const line = score.events.filter(event => event.part === 'melody');
    const opening = line.filter(event => event.beat < score.beats * .35).map(event => event.midi);
    const middle = line.filter(event => event.beat >= score.beats * .4 && event.beat < score.beats * .67).map(event => event.midi);
    const returnLine = line.filter(event => event.beat >= score.beats * .72 && event.beat < score.beats - 16).map(event => event.midi);
    const statements = windows(opening);
    assert.ok([...windows(returnLine)].some(value => statements.has(value)), `${cue.id}: return of the opening hook`);
    assert.ok([...windows(middle)].some(value => !statements.has(value)), `${cue.id}: a different middle phrase`);
    assert.ok(line.some(event => event.beat > score.beats - 6), `${cue.id}: a deliberate last phrase`);
    assert.ok(score.events.some(event => event.instrument === 'metalCrash' && event.beat > score.beats - 6), `${cue.id}: full-band ending`);
    riffIdentities.add(score.events.filter(event => event.part === 'riff' && event.beat < 16).map(event => `${Math.round(event.beat * 4)}:${event.midi}`).join(','));
    melodyIdentities.add(line.slice(0, 12).map(event => event.midi).join(','));
    rhythmIdentities.add(score.events.filter(event => event.part === 'rhythm' && event.beat < 4).map(event => `${Math.round(event.beat * 4)}:${event.instrument}`).join(','));
  }
  assert.equal(riffIdentities.size, 3); assert.equal(melodyIdentities.size, 3); assert.equal(rhythmIdentities.size, 3);
});

test('fast guitars, drum fills and harmonized leads fit the real scheduling budget without dropped notes', () => {
  for (const cue of WARZONE_COMPOSITIONS) {
    for (const seed of ['crosswind-voice-a', 'crosswind-voice-b']) {
      const score = scoreEvents(cue.id, { seed });
      for (const event of score.events) {
        assert.ok(INSTRUMENT[event.instrument], `${cue.id}: supported ${event.instrument}`);
        assert.ok(event.instrument.startsWith('metal'), `${cue.id}: no calm substitute timbres`);
        assert.ok(event.midi >= 24 && event.midi <= 96);
        assert.ok(event.duration > 0 && event.beat + event.duration <= score.beats + .02);
      }
      assert.ok(peakScheduledVoices(score) <= SCORE_MAX_VOICES, `${cue.id}: complete arrangement fits, including scheduler lookahead`);
    }
  }
  const melodic = scoreEvents('crosswind-ashes-in-orbit');
  assert.ok(melodic.events.filter(event => event.part === 'answer' && event.instrument === 'metalLead').length > 40,
    'The melodic piece contains an actual written second-guitar line.');
});
