import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_COMPOSITIONS } from '../dist/music-places.mjs';
import { MUSIC_CUES, SCORE_MAX_VOICES, scoreEvents } from '../dist/music-score.mjs';

// Conservative release allowances include instrument tails after written note
// ends, so a full arrangement can play without the scheduler dropping a voice.
const releases = { piano: .7, guitar: .7, pluck: .28, bell: .8, bass: .14,
  pad: 1.2, organ: .4, bowed: 1.3, kick: .05, snare: .06, hat: .035,
  brush: .08, rim: .035, shimmer: .4, felt: 1.3, mallet: 1.3, reed: 1.3, analog: 1.3 };
const windows = (values, length) => Array.from({ length: Math.max(0, values.length - length + 1) },
  (_, index) => values.slice(index, index + length).join(','));
function peakVoices(score) {
  const seconds = 60 / score.bpm;
  const edges = score.events.flatMap(event => [[event.beat * seconds, 1],
    [(event.beat + event.duration) * seconds + releases[event.instrument], -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, peak = 0;
  for (const [, change] of edges) { active += change; peak = Math.max(peak, active); }
  return peak;
}

test('six place compositions are integrated and retain their specific musical situations', () => {
  const expected = new Map([
    ['lamps-in-the-cabin', ['exploration', 'cabin']],
    ['under-the-service-lights', ['exploration', 'fieldwork']],
    ['the-foreman-cycle', ['combat', 'foreman']],
    ['carry-the-light', ['recovery', 'rescue']],
    ['after-hours-on-glimmer', ['social', 'nightlife']],
    ['rain-on-the-transit-line', ['exploration', 'city']],
  ]);
  assert.equal(PLACE_COMPOSITIONS.length, expected.size);
  assert.equal(new Set(PLACE_COMPOSITIONS.map(cue => cue.id)).size, expected.size);
  for (const cue of PLACE_COMPOSITIONS) {
    const [family, tag] = expected.get(cue.id) || [];
    assert.equal(cue.family, family, cue.id);
    assert.ok(cue.tags.includes(tag), cue.id);
    const published = MUSIC_CUES.find(entry => entry.id === cue.id);
    assert.ok(published, `${cue.id}: registered for actual playback`);
    assert.equal(published.title, cue.title);
    assert.equal(published.bpm, cue.bpm);
    assert.equal(published.family, family);
    assert.ok(published.durationSeconds >= 45 && published.durationSeconds <= 100, cue.id);
    assert.ok(cue.cooldownSeconds >= published.durationSeconds * 2, cue.id);
    assert.ok(!cue.tags.includes('authored-terror'), 'a working site or city does not imply hidden horror');
  }
});

test('new scores use finite, supported performance events and preserve their written identity across seeds', () => {
  const instruments = new Set();
  for (const cue of PLACE_COMPOSITIONS) {
    const score = scoreEvents(cue.id, { seed: 'place-performance-a' });
    const alternate = scoreEvents(cue.id, { seed: 'place-performance-b' });
    assert.ok(score.events.length > 35, `${cue.id}: both a melody and an arrangement`);
    const identity = value => value.events.map(event => `${event.midi}:${event.instrument}:${event.part}`).sort();
    assert.deepEqual(identity(score), identity(alternate), `${cue.id}: articulation varies, composition stays written`);
    for (const event of score.events) {
      assert.ok(Object.hasOwn(releases, event.instrument), `${cue.id}: ${event.instrument}`);
      instruments.add(event.instrument);
      for (const key of ['beat', 'duration', 'midi', 'velocity', 'pan']) assert.ok(Number.isFinite(event[key]), `${cue.id}: ${key}`);
      assert.ok(event.beat >= 0 && event.beat < score.beats, cue.id);
      assert.ok(event.duration > 0 && event.beat + event.duration <= score.beats + .02, cue.id);
      assert.ok(event.midi >= 24 && event.midi <= 90, `${cue.id}: playable register`);
      assert.ok(event.velocity >= .05 && event.velocity <= .95, cue.id);
      assert.ok(Math.abs(event.pan) <= .7, cue.id);
    }
  }
  for (const instrument of ['felt', 'mallet', 'reed', 'analog']) assert.ok(instruments.has(instrument), instrument);
});

test('each place piece develops a distinct tune, recalls it later and ends with a quieter coda', () => {
  const identities = new Set();
  for (const cue of PLACE_COMPOSITIONS) {
    const score = scoreEvents(cue.id, { seed: 'place-form' });
    const lead = score.events.filter(event => event.part === 'melody');
    assert.ok(lead.length >= 16, `${cue.id}: an authored melodic line`);
    assert.ok(lead[0].beat * 60 / cue.bpm <= 3, `${cue.id}: a recognizable opening gesture`);
    const opening = lead.filter(event => event.beat < score.beats * .4).map(event => event.midi);
    const middle = lead.filter(event => event.beat >= score.beats * .4 && event.beat < score.beats * .64).map(event => event.midi);
    const returning = lead.filter(event => event.beat >= score.beats * .64 && event.beat < score.beats - 8).map(event => event.midi);
    const statements = new Set(windows(opening, 4));
    assert.ok(windows(returning, 4).some(window => statements.has(window)), `${cue.id}: the tune comes home`);
    assert.ok(windows(middle, 4).some(window => !statements.has(window)), `${cue.id}: the middle develops beyond a repeating four-bar loop`);
    const coda = lead.filter(event => event.beat >= score.beats - 12);
    assert.ok(coda.length >= 2, `${cue.id}: an explicit ending`);
    const average = events => events.reduce((sum, event) => sum + event.velocity, 0) / events.length;
    assert.ok(average(coda) < average(lead.filter(event => event.beat >= 8 && event.beat < score.beats * .65)), `${cue.id}: a settled ending`);
    identities.add(lead.slice(0, 12).map((event, index, line) => index ? event.midi - line[index - 1].midi : 0).join(','));
    let widestBreath = 0;
    for (let index = 1; index < lead.length; index++) widestBreath = Math.max(widestBreath,
      (lead[index].beat - lead[index - 1].beat - lead[index - 1].duration) * 60 / cue.bpm);
    assert.ok(widestBreath >= 1.5, `${cue.id}: the lead leaves room for the world`);
  }
  assert.equal(identities.size, PLACE_COMPOSITIONS.length, 'the new tunes have different melodic contours');
});

test('new arrangements remain below the existing voice budget including release tails', () => {
  for (const cue of PLACE_COMPOSITIONS) {
    const score = scoreEvents(cue.id, { seed: 'place-mix' });
    assert.ok(peakVoices(score) <= SCORE_MAX_VOICES, `${cue.id}: no score voice needs culling`);
    const firstQuarterSecond = score.events.filter(event => event.beat * 60 / score.bpm < .25);
    assert.ok(firstQuarterSecond.length <= 5, `${cue.id}: no full-band attack on arrival`);
  }
});
