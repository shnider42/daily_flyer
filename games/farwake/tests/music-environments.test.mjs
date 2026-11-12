import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMED_SYSTEMS } from '../dist/content.mjs';
import { SPECIES_HOMEWORLDS } from '../dist/species-content.mjs';
import { ENVIRONMENT_COMPOSITIONS } from '../dist/music-environments.mjs';
import { MUSIC_CUES, SCORE_MAX_VOICES, scoreEvents } from '../dist/music-score.mjs';

// Include the renderer's full release tails. This conservative density check
// catches arrangements that would depend on the voice cap dropping their notes.
const RELEASE = {
  piano: .7, guitar: .7, pluck: .28, bell: .8, bass: .14, pad: 1.2,
  organ: .4, bowed: 1.3, kick: .05, snare: .06, hat: .035,
  brush: .08, rim: .035, shimmer: .4,
};

function peakVoices(score) {
  const boundaries = score.events.flatMap(event => [
    [event.beat * 60 / score.bpm, 1],
    [(event.beat + event.duration) * 60 / score.bpm + RELEASE[event.instrument] + .02, -1],
  ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, maximum = 0;
  for (const [, change] of boundaries) maximum = Math.max(maximum, active += change);
  return maximum;
}

test('five caves and ten planets are full-length authored additions using the real world palettes', () => {
  assert.equal(ENVIRONMENT_COMPOSITIONS.length, 15);
  assert.equal(ENVIRONMENT_COMPOSITIONS.filter(cue => cue.family === 'cave').length, 5);
  const planets = ENVIRONMENT_COMPOSITIONS.filter(cue => cue.family === 'planet');
  assert.equal(planets.length, 10);
  assert.equal(new Set(ENVIRONMENT_COMPOSITIONS.map(cue => cue.id)).size, 15);
  const paletteTags = new Set(planets.flatMap(cue => cue.tags));
  const actualBiomes = new Set(NAMED_SYSTEMS.flatMap(system => system.bodies)
    .filter(body => ['planet', 'moon'].includes(body.kind)).map(body => body.biome));
  for (const biome of actualBiomes) assert.ok(paletteTags.has(biome), `No planetary palette for ${biome}`);
  for (const { body } of SPECIES_HOMEWORLDS) {
    assert.ok(planets.some(cue => cue.tags.includes(body.culture)), `${body.name}: authored homeworld palette`);
    assert.ok(planets.some(cue => cue.tags.includes(body.biome)), `${body.name}: keeps its ordinary biome palette too`);
  }
  for (const cue of ENVIRONMENT_COMPOSITIONS) {
    const registered = MUSIC_CUES.find(entry => entry.id === cue.id);
    assert.ok(registered, `${cue.id}: included in the live score catalog`);
    assert.equal(registered.family, cue.family);
    assert.ok(registered.durationSeconds >= 55 && registered.durationSeconds <= 100, cue.id);
    assert.ok(cue.tags.includes(cue.family), cue.id);
    assert.ok(cue.cooldownSeconds >= 360, `${cue.id}: time between returns`);
    assert.ok(cue.intensity < .35, `${cue.id}: surroundings remain calm`);
  }
});

test('environment melodies and phrase rhythms are distinct and reproducible, not transposed copies', () => {
  const intervalSignatures = new Set();
  const rhythmSignatures = new Set();
  for (const cue of ENVIRONMENT_COMPOSITIONS) {
    const score = scoreEvents(cue.id, { seed: 'environment-authorship' });
    assert.deepEqual(score, scoreEvents(cue.id, { seed: 'environment-authorship' }), cue.id);
    const tune = score.events.filter(event => event.part === 'melody');
    assert.ok(tune.length >= 9, `${cue.id}: an authored tune, not a chord loop`);
    const intervals = tune.slice(1).map((event, i) => event.midi - tune[i].midi).join(',');
    const rhythm = tune.map((event, i) => [
      i ? Math.round((event.beat - tune[i - 1].beat) * 4) / 4 : 0,
      event.duration,
    ]).join(';');
    assert.ok(!intervalSignatures.has(intervals), `${cue.id}: copied interval sequence`);
    assert.ok(!rhythmSignatures.has(rhythm), `${cue.id}: copied phrase rhythm`);
    intervalSignatures.add(intervals); rhythmSignatures.add(rhythm);
    const other = scoreEvents(cue.id, { seed: 'a-second-performance' });
    const writtenNotes = value => value.events.map(({ instrument, midi, duration, part }) =>
      `${instrument}:${midi}:${duration}:${part}`).sort();
    assert.deepEqual(writtenNotes(score), writtenNotes(other), `${cue.id}: seed preserves the written piece`);
  }
});

test('quiet entries, breathing room and released endings leave the environment audible', () => {
  for (const cue of ENVIRONMENT_COMPOSITIONS) {
    const score = scoreEvents(cue.id, { seed: 'environment-dynamics' });
    const first = score.events.filter(event => event.beat < 2);
    assert.ok(first.length > 0 && first.every(event => event.velocity <= .35), `${cue.id}: restrained entry`);
    assert.ok(first.every(event => event.part !== 'rhythm'), `${cue.id}: no percussion accent on arrival`);
    const last = score.events.filter(event => event.beat >= score.beats - 8);
    assert.ok(last.every(event => event.velocity < .4 && event.part !== 'rhythm'), `${cue.id}: restrained departure`);
    assert.ok(Math.max(...score.events.map(event => event.beat + event.duration)) < score.beats - 1,
      `${cue.id}: written notes resolve before the end of the cue`);
    const melody = score.events.filter(event => event.part === 'melody');
    assert.ok(melody.some((event, i) => i && event.beat - (melody[i - 1].beat + melody[i - 1].duration) >= 3),
      `${cue.id}: the melody leaves a complete phrase breath`);
    if (cue.family === 'cave') {
      assert.ok(score.events.every(event => event.part !== 'rhythm'), `${cue.id}: caves have no continuous percussion`);
      assert.ok(score.events.every(event => event.velocity < .5), `${cue.id}: no stinger in ordinary cave music`);
    }
  }
});

test('all environment notes are renderable without hitting the voice-stealing limit', () => {
  for (const cue of ENVIRONMENT_COMPOSITIONS) {
    for (const seed of ['quiet-landfall', 'another-landfall']) {
      const score = scoreEvents(cue.id, { seed });
      for (const event of score.events) {
        assert.ok(Object.hasOwn(RELEASE, event.instrument), `${cue.id}: existing instrument ${event.instrument}`);
        for (const field of ['beat', 'duration', 'midi', 'velocity', 'pan']) assert.ok(Number.isFinite(event[field]), `${cue.id}: ${field}`);
        assert.ok(event.beat >= 0 && event.duration > 0 && event.beat + event.duration <= score.beats, cue.id);
        assert.ok(Number.isInteger(event.midi) && event.midi >= 24 && event.midi <= 96, cue.id);
        assert.ok(event.velocity > 0 && event.velocity < 1 && Math.abs(event.pan) <= 1, cue.id);
      }
      const maximum = peakVoices(score);
      assert.ok(maximum < SCORE_MAX_VOICES, `${cue.id}: ${maximum} simultaneous voices including release tails`);
      if (cue.family === 'cave') assert.ok(maximum <= 10, `${cue.id}: cave arrangement stays sparse (${maximum})`);
    }
  }
});
