/**
 * Farwake's original score.
 *
 * These are composed phrases, not randomly selected scale notes. A seed only
 * changes performance (a few milliseconds, velocity and stereo position).
 * The director owns when a piece belongs; this module owns how it is played.
 * No network requests, timers, audio worklets or third-party recordings.
 */
import { DANGER_COMPOSITIONS } from './music-danger.mjs';
import { ENVIRONMENT_COMPOSITIONS } from './music-environments.mjs';
import { PLACE_COMPOSITIONS } from './music-places.mjs';
import { WARZONE_COMPOSITIONS } from './music-warzone.mjs';
import { QUIET_EARTH_COMPOSITIONS } from './music-quiet-earth.mjs';
import { INSTRUMENT, makeAssets, sampleFor, waveFor, midiHz, mixForCue } from './music-instruments.mjs';

export const THEME_ID = 'long-way-home';
export const SCORE_LOOKAHEAD = .18;
export const SCORE_MAX_VOICES = 20;
const TAIL_SECONDS = 3;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cue(id, title, family, bars, bpm, cooldownSeconds, tags, intensity) {
  return Object.freeze({ id, title, family, bars, bpm, cooldownSeconds,
    durationSeconds: bars * 4 * 60 / bpm, tags: Object.freeze(tags), intensity });
}

export const MUSIC_CUES = Object.freeze([
  cue(THEME_ID, 'The Long Way Home', 'theme', 64, 78, 900, ['menu', 'home', 'theme'], .45),
  cue('glass-on-the-windows', 'Glass on the Windows', 'exploration', 20, 62, 420, ['quiet', 'surface', 'piano', 'solitude'], .12),
  cue('a-current-between-stars', 'A Current Between Stars', 'exploration', 24, 76, 420, ['flight', 'travel', 'analog', 'wonder'], .25),
  cue('dust-and-daylight', 'Dust and Daylight', 'exploration', 20, 70, 420, ['surface', 'rural', 'guitar', 'warm'], .19),
  cue('low-lights-at-port', 'Low Lights at Port', 'social', 20, 86, 360, ['settlement', 'port', 'tavern', 'human'], .32),
  cue('apples-in-low-gravity', 'Apples in Low Gravity', 'social', 16, 98, 420, ['whimsical', 'garden', 'market', 'rural'], .36),
  cue('first-blue-morning', 'First Blue Morning', 'discovery', 12, 72, 540, ['discovery', 'awe', 'hope'], .4),
  cue('something-in-the-instruments', 'Something in the Instruments', 'tension', 16, 92, 160, ['perceived-danger', 'uncertainty'], .39),
  cue('keep-her-together', 'Keep Her Together', 'combat', 24, 112, 100, ['combat', 'pursuit', 'emergency'], .78),
  cue('after-the-static', 'After the Static', 'recovery', 12, 68, 240, ['recovery', 'breathing-room'], .15),
  cue('home-in-a-pocket', 'Home in a Pocket', 'recovery', 16, 70, 720, ['home', 'theme-reprise', 'safe-return'], .17),
  cue('a-room-without-an-answer', 'A Room Without an Answer', 'terror', 12, 58, 1200, ['authored-terror', 'sparse'], .24),
  ...[...DANGER_COMPOSITIONS, ...ENVIRONMENT_COMPOSITIONS, ...PLACE_COMPOSITIONS, ...WARZONE_COMPOSITIONS, ...QUIET_EARTH_COMPOSITIONS].map(({ id, title, family, bars, bpm, cooldownSeconds, tags, intensity }) =>
    cue(id, title, family, bars, bpm, cooldownSeconds, tags, intensity)),
]);

const CUES = new Map(MUSIC_CUES.map(entry => [entry.id, entry]));

// Concert pitches. Voicings intentionally leave room for the tune and bass.
const H = Object.freeze({
  dm: { bass: 38, notes: [53, 57, 60, 64], fifth: 45 },
  bb: { bass: 34, notes: [53, 57, 62, 65], fifth: 41 },
  fa: { bass: 33, notes: [53, 57, 60, 62], fifth: 40 },
  c: { bass: 36, notes: [55, 60, 62, 64], fifth: 43 },
  g6: { bass: 31, notes: [55, 59, 62, 64], fifth: 38 },
  asus: { bass: 33, notes: [55, 57, 62, 64], fifth: 40 },
  a7: { bass: 33, notes: [55, 57, 61, 64], fifth: 40 },
  gm: { bass: 31, notes: [53, 58, 62, 65], fifth: 38 },
  f: { bass: 29, notes: [53, 57, 60, 64], fifth: 36 },
  f9: { bass: 29, notes: [57, 60, 64, 67], fifth: 36 },
  em: { bass: 40, notes: [55, 59, 62, 66], fifth: 47 },
  g: { bass: 31, notes: [55, 59, 62, 69], fifth: 38 },
  am: { bass: 33, notes: [55, 60, 64, 67], fifth: 40 },
  d: { bass: 38, notes: [54, 57, 61, 64], fifth: 45 },
  a: { bass: 33, notes: [57, 61, 64, 71], fifth: 40 },
  bm: { bass: 35, notes: [54, 57, 62, 66], fifth: 42 },
  eb: { bass: 39, notes: [55, 58, 60, 63], fifth: 46 },
});

const THEME_HARMONY = ['dm', 'dm', 'bb', 'bb', 'fa', 'c', 'g6', 'asus'];
const THEME_A = [
  [0, 1.5, 62], [1.5, .5, 69], [2, 1, 67], [3, 1, 64],
  [4, 1, 65], [5, .5, 64], [5.5, .5, 60], [6, 2, 62],
  [8, 1.5, 65], [9.5, .5, 69], [10, 1, 72], [11, 1, 69],
  [12, 1.5, 67], [13.5, .5, 65], [14, 2, 64],
  [16, 1, 65], [17, 1, 69], [18, 1.5, 67], [19.5, .5, 65],
  [20, 1.5, 64], [21.5, .5, 62], [22, 2, 60],
  [24, 1.5, 59], [25.5, .5, 62], [26, 1, 64], [27, 1, 67],
  [28, 1.5, 64], [29.5, .5, 62], [30, 2, 62],
];

const THEME_B = [
  [0, 1, 69], [1, .5, 72], [1.5, .5, 74], [2, 2, 76],
  [4, 1.5, 74], [5.5, .5, 72], [6, 2, 69],
  [8, .75, 67], [8.75, .25, 69], [9, 1, 72], [10, 2, 74],
  [12, 1, 72], [13, 1, 69], [14, 1.5, 67],
  [16, 1.5, 65], [17.5, .5, 69], [18, 1, 72], [19, 1, 74],
  [20, 1.5, 72], [21.5, .5, 69], [22, 2, 65],
  [24, 1, 67], [25, 1, 71], [26, 1, 69], [27, 1, 67],
  [28, 1.5, 64], [29.5, .5, 61], [30, 2, 64],
];

function composer() {
  const events = [];
  function note(beat, duration, midi, instrument = 'piano', velocity = .6, pan = 0, part = 'accompaniment') {
    events.push({ beat, duration, midi, instrument, velocity, pan, part });
  }
  function chord(beat, duration, notes, instrument = 'piano', velocity = .42, pan = -.15, spread = .026) {
    notes.forEach((midi, index) => note(beat + index * spread, duration - index * spread, midi, instrument,
      velocity * (index === notes.length - 1 ? .87 : 1), pan + (index - 1.5) * .035));
  }
  function phrase(beat, notes, instrument = 'piano', velocity = .72, transpose = 0, pan = .12, part = 'melody') {
    notes.forEach(([offset, duration, midi], index) => note(beat + offset, duration, midi + transpose, instrument,
      velocity * (index % 4 === 0 ? 1 : .93), pan, part));
  }
  function bass(bar, harmony, active = false, volume = .65) {
    const { bass: root, fifth } = H[harmony], beat = bar * 4;
    note(beat, active ? 1.45 : 3.25, root, 'bass', volume, 0, 'bass');
    if (active) {
      note(beat + 2, .85, fifth, 'bass', volume * .78, 0, 'bass');
      note(beat + 3.25, .6, root + 12, 'bass', volume * .68, 0, 'bass');
    }
  }
  function drums(bar, level = .5, kind = 'brush', fill = false) {
    const beat = bar * 4;
    if (kind === 'brush') {
      note(beat, .18, 36, 'kick', level * .6, 0, 'rhythm');
      note(beat + 1.05, .3, 38, 'brush', level, -.18, 'rhythm');
      note(beat + 3.05, .3, 38, 'brush', level * .9, -.18, 'rhythm');
      [0, 1, 2, 3].forEach((offset, i) => note(beat + offset + .5, .12, 42, 'hat', level * (i % 2 ? .32 : .46), .25, 'rhythm'));
    } else {
      [0, 1.75, 2.5].forEach((offset, index) => note(beat + offset, .25, 36, 'kick', level * (index ? .8 : 1), 0, 'rhythm'));
      [1, 3].forEach(offset => note(beat + offset, .22, 38, 'snare', level * .8, -.1, 'rhythm'));
      for (let i = 0; i < 8; i++) note(beat + i * .5, .12, 42, 'hat', level * (i % 2 ? .25 : .4), .25, 'rhythm');
      if (fill) [2.75, 3.5, 3.75].forEach((offset, i) => note(beat + offset, .15, 38, 'snare', level * (.25 + .14 * i), -.1, 'rhythm'));
    }
  }
  return { events, note, chord, phrase, bass, drums };
}

function buildTheme(s) {
  for (let bar = 0; bar < 64; bar++) {
    const section = bar < 8 ? 'intro' : bar < 24 ? 'a' : bar < 32 ? 'bridge' : bar < 48 ? 'b' : bar < 56 ? 'return' : 'outro';
    const cycle = section === 'bridge' ? ['bb', 'bb', 'c', 'c', 'dm', 'dm', 'g6', 'a7']
      : section === 'b' ? ['f', 'f', 'c', 'c', 'bb', 'bb', 'g6', 'a7'] : THEME_HARMONY;
    const h = cycle[bar % 8], beat = bar * 4, quiet = section === 'intro' || section === 'outro';
    if (bar >= 4 && bar < 60) s.bass(bar, h, ['a', 'b', 'return'].includes(section), quiet ? .43 : .62);
    if (bar === 0 || bar === 2 || bar === 4 || bar === 6 || section === 'outro') {
      s.chord(beat, 3.5, H[h].notes.slice(0, 3), 'piano', section === 'intro' ? .27 : .23, -.26, .05);
    } else if (!quiet) {
      s.chord(beat + .035, 2.7, H[h].notes, 'piano', section === 'bridge' ? .3 : .34, -.28);
      if (bar % 2 === 1) s.chord(beat + 2.5, .9, H[h].notes.slice(1, 3), 'piano', .23, -.18);
    }
    if (bar >= 4 && bar < 60 && bar % 2 === 0) {
      s.chord(beat + .1, 7.5, [H[h].notes[0], H[h].notes[2]], section === 'return' ? 'organ' : 'pad', quiet ? .28 : .37, -.08, .02);
    }
    if ((bar >= 16 && bar < 24) || (bar >= 36 && bar < 56)) s.drums(bar, section === 'return' ? .6 : .45, 'brush');
    if (section === 'b' && bar % 2 === 1) {
      s.note(beat + 2.5, .6, H[h].notes[1] + 12, 'bell', .25, .4, 'answer');
      s.note(beat + 3.5, .45, H[h].notes[0] + 12, 'bell', .21, .35, 'answer');
    }
  }
  s.phrase(.6, THEME_A, 'piano', .7);
  s.phrase(32, THEME_A, 'guitar', .78);
  s.phrase(64, THEME_A, 'guitar', .8);
  // The bridge answers the tune, then leaves a full bar for the wider B section.
  s.phrase(96, [[0, 2, 65], [3, 1, 69], [4, 2, 72], [6.5, 1, 69], [8, 2, 67], [11, 1, 64],
    [12, 3, 62], [16, 2, 65], [19, 1, 64], [20, 2, 62], [24, 2, 59], [27, 1, 61]], 'piano', .64);
  s.phrase(128, THEME_B, 'guitar', .79);
  s.phrase(160, THEME_B, 'guitar', .84);
  s.phrase(192, THEME_A, 'guitar', .85);
  s.phrase(224, THEME_A.slice(0, 15), 'piano', .56);
  s.phrase(248, [[0, 1.5, 69], [1.5, .5, 67], [2, 1, 64], [3, 1, 65], [4, 3, 62]], 'piano', .49);
  s.chord(252.1, 3.6, [50, 57, 64, 65], 'pad', .27, 0);
}

function buildGlass(s) {
  const harmony = ['f9', 'f9', 'am', 'am', 'bb', 'bb', 'c', 'c'];
  for (let bar = 0; bar < 20; bar++) {
    const h = harmony[bar % 8];
    if (bar % 2 === 0) {
      s.chord(bar * 4, 6.4, H[h].notes.slice(0, 3), 'pad', .27, -.15);
      s.note(bar * 4 + .2, 3.5, H[h].bass + 12, 'piano', .35, -.32);
    }
    if (bar % 4 === 3) s.note(bar * 4 + 1.5, 2.5, H[h].notes[1] + 12, 'bell', .23, .4);
  }
  const a = [[0, 1.6, 69], [2.5, 1.3, 67], [4, 2, 64], [7, .75, 60], [8.5, 2, 62], [12, 2.8, 65]];
  const b = [[0, 1.3, 72], [2, 1, 69], [3.5, 2, 67], [8, 2, 64], [11, .8, 62], [12, 3, 60]];
  s.phrase(2, a, 'piano', .61, 0, .15);
  s.phrase(25, b, 'piano', .59, 0, .1);
  s.phrase(48, a, 'piano', .58, 0, -.05);
  s.phrase(70, [[0, 1.5, 67], [2.5, 1.8, 64], [5, 3.4, 65]], 'piano', .48);
}

function buildCurrent(s) {
  const harmony = ['em', 'em', 'g', 'g', 'd', 'd', 'a', 'a'];
  for (let bar = 0; bar < 24; bar++) {
    const h = harmony[bar % 8], beat = bar * 4;
    s.bass(bar, h, false, .48);
    if (bar % 2 === 0) s.chord(beat, 7.5, H[h].notes.slice(1, 3), 'pad', .37, -.15);
    // A composed, quiet three-note inner ostinato. Bars 6/7 breathe.
    if (bar % 8 < 6 && bar > 1 && bar < 21) {
      [0, 1.5, 3].forEach((offset, i) => s.note(beat + offset, .7, H[h].notes[[0, 2, 1][i]], 'pluck', .29, -.25 + i * .2));
    }
  }
  const a = [[0, 2, 71], [3, .75, 69], [4, 2, 67], [7, .8, 66], [8, 2, 67], [11, .8, 69], [12, 2.8, 66]];
  const b = [[0, 1.5, 74], [2, 1.5, 71], [4, 2, 69], [7, .8, 66], [8, 3, 64], [12, 3, 66]];
  s.phrase(8, a, 'guitar', .58);
  s.phrase(40, b, 'guitar', .6);
  s.phrase(72, a.slice(0, 6), 'piano', .56);
  s.note(92, 3, 64, 'guitar', .51, .12, 'melody');
}

function buildDust(s) {
  const harmony = ['d', 'd', 'g', 'g', 'bm', 'bm', 'a', 'a'];
  for (let bar = 0; bar < 20; bar++) {
    const h = harmony[bar % 8], beat = bar * 4;
    if (bar % 2 === 0) s.bass(bar, h, false, .4);
    if (bar < 18) [0, 1, 2.5].forEach((offset, i) => s.note(beat + offset, 1.15, H[h].notes[[0, 2, 1][i]], 'pluck', .39, -.3));
    if (bar % 8 === 4) s.chord(beat, 6.5, H[h].notes.slice(1, 3), 'organ', .23, 0);
  }
  const a = [[0, 1, 66], [1.5, 1, 69], [3, 1.4, 71], [5, 1, 69], [6.5, 1, 64], [8, 2.5, 62], [12, 2, 66]];
  const b = [[0, 1.5, 69], [2, .8, 66], [3, 1, 64], [5, 2, 62], [8, 1.5, 66], [10, 1, 64], [12, 2.5, 61]];
  s.phrase(1, a, 'guitar', .62, 0, .2);
  s.phrase(24, b, 'guitar', .59, 0, .17);
  s.phrase(48, a, 'guitar', .62, 0, .2);
  s.phrase(72, [[0, 1.5, 66], [2, 1.5, 64], [4, 3, 62]], 'guitar', .48);
}

function buildPort(s) {
  const harmony = ['bb', 'dm', 'eb', 'f', 'bb', 'gm', 'c', 'f'];
  for (let bar = 0; bar < 20; bar++) {
    const h = harmony[bar % 8], beat = bar * 4;
    s.bass(bar, h, bar > 3 && bar < 17, .49);
    s.chord(beat + .5, 1.8, H[h].notes.slice(0, 3), 'piano', .36, -.25, .04);
    if (bar % 2 === 1) s.chord(beat + 3, .75, H[h].notes.slice(1), 'piano', .26, -.2);
    if (bar > 3 && bar < 17) s.drums(bar, .36, 'brush');
  }
  const a = [[0, .75, 65], [1, .5, 69], [1.75, 1.5, 72], [4, 1, 69], [5.5, 1.6, 65], [8, .75, 67], [9, .5, 70], [10, 1.5, 72], [12, 1, 69], [13.5, 1.5, 65]];
  const b = [[0, 1, 74], [1.5, .5, 72], [2.25, 1.3, 69], [4, 1.5, 67], [6, .7, 65], [8, .7, 64], [9, 1.5, 67], [12, 2.8, 65]];
  s.phrase(1, a, 'guitar', .6, 0, .24);
  s.phrase(24, b, 'piano', .61);
  s.phrase(44, a, 'guitar', .6, 0, .23);
  s.phrase(68, [[0, 1.5, 69], [2, .7, 67], [3, 1, 65], [6, 3.4, 62]], 'piano', .5);
}

function buildApples(s) {
  const harmony = ['g', 'g', 'c', 'c', 'am', 'd', 'g', 'd'];
  for (let bar = 0; bar < 16; bar++) {
    const h = harmony[bar % 8], beat = bar * 4;
    s.note(beat, 1.3, H[h].bass, 'bass', .5, 0, 'bass');
    s.note(beat + 2.5, .7, H[h].fifth, 'bass', .41, 0, 'bass');
    s.chord(beat + 1, .7, H[h].notes.slice(0, 3), 'pluck', .41, -.24, .04);
    if (bar % 4 !== 3) s.chord(beat + 3, .7, H[h].notes.slice(1), 'pluck', .31, -.24, .04);
    if (bar > 1 && bar < 14) {
      s.note(beat + 1, .1, 38, 'rim', .28, -.25, 'rhythm');
      s.note(beat + 3, .1, 38, 'rim', .22, -.25, 'rhythm');
      s.note(beat + .5, .15, 42, 'hat', .21, .3, 'rhythm');
    }
  }
  const a = [[0, .75, 67], [1, .5, 74], [1.75, .75, 71], [3, .75, 69], [4, 1, 76], [5.5, .5, 74], [6.5, .5, 71], [7.25, .75, 67],
    [8, .75, 64], [9.25, .5, 67], [10, 1.25, 72], [12, .75, 71], [13, .75, 69], [14.5, 1, 67]];
  s.phrase(.5, a, 'bell', .52, 0, .2);
  s.phrase(24, [[0, .7, 69], [1, .7, 72], [2.5, 1, 74], [4, .75, 72], [5, .75, 69], [6.5, 1.2, 66]], 'piano', .55);
  s.phrase(33, a, 'bell', .53, 0, .23);
  s.phrase(56, [[0, .7, 74], [1, .7, 71], [2.5, 1, 69], [4, 2.8, 67]], 'piano', .49);
}

function buildDiscovery(s) {
  const harmony = ['bb', 'bb', 'c', 'c', 'dm', 'dm', 'g6', 'g6', 'f', 'c', 'dm', 'dm'];
  for (let bar = 0; bar < 12; bar++) {
    const h = harmony[bar], beat = bar * 4;
    s.bass(bar, h, false, .5);
    s.chord(beat + .1, 3.5, H[h].notes.slice(1), 'pad', .39, -.1, .03);
    if (bar > 1 && bar < 10) s.chord(beat + .5, 2, H[h].notes, 'piano', .31, -.25);
  }
  s.phrase(1, [[0, 2, 65], [3, 1, 69], [4, 2, 72], [7, 1, 74], [8, 3, 76], [12, 2, 74], [15, 1, 72],
    [16, 2, 69], [19, 1, 67], [20, 3, 65], [24, 1, 67], [25, 2, 71], [28, 3, 74],
    [32, 1.5, 72], [34, 1.5, 69], [36, 2, 67], [40, 1, 65], [42, 4, 62]], 'guitar', .7);
  [8, 24].forEach(beat => s.note(beat, 2.6, 84, 'shimmer', .36, .3));
}

function buildTension(s) {
  for (let bar = 0; bar < 16; bar++) {
    const beat = bar * 4, h = ['dm', 'dm', 'bb', 'asus'][Math.floor(bar / 2) % 4];
    s.note(beat, 1.4, H[h].bass, 'bass', .46, 0, 'bass');
    s.note(beat + 2.5, .7, H[h].fifth, 'bass', .32, 0, 'bass');
    [0, 1.5, 3].forEach((offset, i) => s.note(beat + offset, .45, [50, 57, 60][i], 'pluck', .28 + i * .025, -.25 + i * .2));
    if (bar % 4 === 0) s.chord(beat, 6.5, [H[h].notes[1], H[h].notes[2]], 'pad', .31, 0);
    if (bar % 2 === 1) s.note(beat + 3, .3, 38, 'brush', .35, -.1, 'rhythm');
  }
  s.phrase(8, [[0, 1.6, 64], [3, .8, 62], [5, 2, 60], [8, 2.5, 57]], 'guitar', .48);
  s.phrase(36, [[0, 1.3, 65], [2, 1.3, 64], [4, 1.5, 62], [7, 1.5, 61], [10, 2.4, 62]], 'guitar', .51);
}

function buildCombat(s) {
  const harmony = ['dm', 'dm', 'bb', 'bb', 'gm', 'gm', 'c', 'a7'];
  for (let bar = 0; bar < 24; bar++) {
    const h = harmony[bar % 8], root = H[h].bass, beat = bar * 4, last = bar >= 22;
    [[0, .45, root], [.5, .45, root + 12], [1.5, .45, root + 7], [2, .6, root], [2.75, .5, root + 12], [3.5, .4, root + 7]]
      .forEach(([offset, duration, midi]) => s.note(beat + offset, duration, midi, 'bass', .71, 0, 'bass'));
    s.chord(beat, 1.3, H[h].notes.slice(0, 3), 'organ', .46, -.2);
    s.chord(beat + 2.5, .85, H[h].notes.slice(1), 'piano', .42, -.25);
    s.drums(bar, last ? .53 : .65, 'kit', bar % 8 === 7);
    if (bar % 4 === 0) s.chord(beat, 6.5, [H[h].notes[0], H[h].notes[2]], 'pad', .28, .05);
  }
  const riff = [[0, .7, 62], [1, .45, 69], [1.75, .7, 67], [3, .7, 65], [4, 1.3, 64], [6, 1.3, 62],
    [8, .7, 65], [9, .45, 69], [9.75, .7, 72], [11, .7, 69], [12, 1.4, 67], [14, 1.4, 64]];
  s.phrase(8, riff, 'guitar', .77, 0, .25);
  s.phrase(40, riff, 'guitar', .82, 0, .25);
  s.phrase(72, riff, 'guitar', .79, 0, .25);
}

function buildRecovery(s, reprise = false) {
  const bars = reprise ? 16 : 12;
  for (let bar = 0; bar < bars; bar++) {
    const h = (reprise ? THEME_HARMONY : ['f', 'f', 'dm', 'dm', 'bb', 'bb', 'c', 'c'])[bar % 8];
    if (bar % 2 === 0) {
      s.chord(bar * 4, 6.2, H[h].notes.slice(0, 3), 'pad', .27, -.1);
      s.note(bar * 4 + .1, 3.7, H[h].bass + 12, 'piano', .3, -.3);
    }
  }
  if (reprise) {
    s.phrase(1, THEME_A, 'piano', .55);
    s.phrase(40, THEME_A.slice(0, 15), 'guitar', .47);
    s.note(60, 3.4, 62, 'piano', .43, .1, 'melody');
  } else {
    s.phrase(2, [[0, 2.5, 65], [4, 2, 64], [8, 3, 62], [16, 2, 65], [19, 1, 64], [21, 2.5, 60],
      [29, 2, 62], [32, 2, 64], [36, 2.5, 65], [41, 3, 65]], 'piano', .52);
  }
}

function buildTerror(s) {
  // No repeating heartbeat or jump-scare sting. The director must explicitly
  // authorize this piece after an encountered story event, never a hidden foe.
  s.note(1, 7.5, 38, 'bowed', .35, -.18);
  s.note(7.5, 4.5, 57, 'bowed', .24, .2);
  s.note(10, 2.5, 63, 'guitar', .27, -.32);
  s.note(16, 8, 50, 'bowed', .29, -.05);
  s.note(19.5, 5, 51, 'bowed', .19, .17);
  s.note(23.5, 1.1, 76, 'bell', .16, .35);
  s.note(28, 6, 45, 'bowed', .3, -.2);
  s.note(33, 3.2, 53, 'piano', .3, .15);
  s.note(39.5, 5.5, 50, 'bowed', .22, 0);
}

const BUILDERS = {
  [THEME_ID]: buildTheme,
  'glass-on-the-windows': buildGlass,
  'a-current-between-stars': buildCurrent,
  'dust-and-daylight': buildDust,
  'low-lights-at-port': buildPort,
  'apples-in-low-gravity': buildApples,
  'first-blue-morning': buildDiscovery,
  'something-in-the-instruments': buildTension,
  'keep-her-together': buildCombat,
  'after-the-static': s => buildRecovery(s),
  'home-in-a-pocket': s => buildRecovery(s, true),
  'a-room-without-an-answer': buildTerror,
  ...Object.fromEntries([...DANGER_COMPOSITIONS, ...ENVIRONMENT_COMPOSITIONS, ...PLACE_COMPOSITIONS, ...WARZONE_COMPOSITIONS, ...QUIET_EARTH_COMPOSITIONS].map(entry => [entry.id, s => entry.build(s, H)])),
};

function seedValue(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return (seed >>> 0) || 1;
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0 || 1;
}

function randomFor(seed) {
  let value = seedValue(seed);
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
}

/** Pure, deterministic score. Beat and duration are quarter-note beats. */
export function scoreEvents(cueId, { seed = 1 } = {}) {
  const metadata = CUES.get(cueId);
  if (!metadata) throw new RangeError(`Unknown Farwake music cue: ${cueId}`);
  const s = composer(), random = randomFor(seed), beats = metadata.bars * 4;
  BUILDERS[cueId](s);
  // Remove the synthetic guitar leads from danger arrangements. Keep this
  // after performance variation so every retained note keeps its exact timing
  // and mix. Low Crosswind rhythm guitars remain; uploaded recordings use
  // RecordedTheme and never pass through this score renderer.
  const danger = ['combat', 'tension', 'terror'].includes(metadata.family);
  const events = s.events.filter(event => event.beat < beats && event.duration > 0).map(event => {
    const timing = event.instrument === 'pad' || event.instrument === 'bowed' ? 0 : (random() - .5) * .018;
    return { ...event, beat: +clamp(event.beat + timing, 0, beats - .02).toFixed(5),
      duration: +Math.min(event.duration, beats - event.beat).toFixed(5),
      velocity: +clamp(event.velocity * (.965 + random() * .07), .05, .95).toFixed(5),
      pan: +clamp(event.pan + (random() - .5) * .045, -.7, .7).toFixed(5) };
  }).filter(event => !danger || !['guitar', 'metalLead'].includes(event.instrument))
    .sort((a, b) => a.beat - b.beat);
  return { bpm: metadata.bpm, beats, events };
}

function ramp(param, value, now, seconds = .2) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
  else { const prior = param.value; param.cancelScheduledValues(now); param.setValueAtTime(prior, now); }
  param.linearRampToValueAtTime(value, now + Math.max(.005, seconds));
}

/**
 * One complete cue. The music director may own one active and one retiring
 * player for crossfades. Call update from the existing animation tick; the
 * player deliberately creates no interval or timeout of its own.
 */
export class ScorePlayer {
  constructor(ctx, destination) {
    if (!ctx || !destination) throw new TypeError('ScorePlayer requires an AudioContext and destination');
    this.ctx = ctx; this.assets = makeAssets(ctx); this.playing = false; this.ended = true;
    this.currentCue = null; this.duration = 0; this.startedAt = 0; this.volume = 1;
    this._voices = new Set(); this._nodes = []; this._buses = new Map(); this._disposed = false;
    this._toneFilters = []; this._sceneMix = mixForCue();
    this._events = []; this._index = 0; this._stoppingAt = null; this._stopRequested = false;
    const node = value => { this._nodes.push(value); return value; };
    this.outputGain = node(ctx.createGain()); this.outputGain.gain.value = 1; this.outputGain.connect(destination);
    this._fade = node(ctx.createGain()); this._fade.gain.value = 0; this._fade.connect(this.outputGain);
    this._cueTrim = node(ctx.createGain()); this._cueTrim.gain.value = 1; this._cueTrim.connect(this._fade);
    this._mix = node(ctx.createGain()); this._mix.gain.value = .86;
    const highpass = node(ctx.createBiquadFilter()); highpass.type = 'highpass'; highpass.frequency.value = 32;
    this._mix.connect(highpass);
    if (ctx.createDynamicsCompressor) {
      const compressor = node(ctx.createDynamicsCompressor()); compressor.threshold.value = -13; compressor.knee.value = 12;
      compressor.ratio.value = 2.5; compressor.attack.value = .012; compressor.release.value = .19;
      highpass.connect(compressor); compressor.connect(this._cueTrim);
    } else highpass.connect(this._cueTrim);
    const reverb = node(ctx.createConvolver()); reverb.buffer = this.assets.impulse; reverb.normalize = true;
    const reverbReturn = node(ctx.createGain()); reverbReturn.gain.value = .8; reverb.connect(reverbReturn); reverbReturn.connect(this._mix);
    this._reverb = reverb; this._reverbReturn = reverbReturn;
    const echoFilter = node(ctx.createBiquadFilter()); echoFilter.type = 'lowpass'; echoFilter.frequency.value = 2800;
    const left = node(ctx.createDelay(2)), right = node(ctx.createDelay(2));
    const feedbackL = node(ctx.createGain()), feedbackR = node(ctx.createGain()); feedbackL.gain.value = .24; feedbackR.gain.value = .24;
    echoFilter.connect(left); left.connect(feedbackL); feedbackL.connect(right); right.connect(feedbackR); feedbackR.connect(echoFilter);
    const leftPan = node(this._panner(-.55)), rightPan = node(this._panner(.55)); left.connect(leftPan); right.connect(rightPan);
    const echoReturn = node(ctx.createGain()); echoReturn.gain.value = 1;
    leftPan.connect(echoReturn); rightPan.connect(echoReturn); echoReturn.connect(this._mix);
    this._echoReturn = echoReturn;
    this._echo = echoFilter; this._delays = [left, right];
  }

  _panner(value) {
    if (this.ctx.createStereoPanner) { const pan = this.ctx.createStereoPanner(); pan.pan.value = value; return pan; }
    return this.ctx.createGain();
  }

  _bus(instrument) {
    if (this._buses.has(instrument)) return this._buses.get(instrument);
    const profile = INSTRUMENT[instrument], bus = this.ctx.createGain(); bus.gain.value = 1;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.value = Math.min(this.ctx.sampleRate * .44, (profile.cutoff || 8200) * this._sceneMix.brightness);
    if (filter.Q) filter.Q.value = .5;
    bus.connect(filter); filter.connect(this._mix); this._nodes.push(bus, filter);
    this._toneFilters.push({ filter, cutoff: profile.cutoff || 8200 });
    for (const [amount, destination] of [[profile.reverb, this._reverb], [profile.echo, this._echo]]) {
      if (!amount) continue;
      const send = this.ctx.createGain(); send.gain.value = amount; filter.connect(send); send.connect(destination); this._nodes.push(send);
    }
    this._buses.set(instrument, bus); return bus;
  }

  play(cueId, { seed = 1, fadeIn = 2, volume = 1 } = {}) {
    if (this._disposed) throw new Error('Cannot reuse a disposed ScorePlayer');
    const score = scoreEvents(cueId, { seed });
    this._clearVoices();
    const now = this.ctx.currentTime;
    this._sceneMix = mixForCue(CUES.get(cueId));
    this._cueTrim.gain.setValueAtTime(this._sceneMix.trim, now);
    this._reverb.buffer = this._sceneMix.room === 'short' ? this.assets.roomImpulse : this.assets.impulse;
    this._reverbReturn.gain.setValueAtTime(.8 * this._sceneMix.reverb, now);
    this._echoReturn.gain.setValueAtTime(this._sceneMix.echo, now);
    this._mix.gain.setValueAtTime(.86 * this._sceneMix.gain, now);
    for (const { filter, cutoff } of this._toneFilters) filter.frequency.setValueAtTime(Math.min(this.ctx.sampleRate * .44, cutoff * this._sceneMix.brightness), now);
    this.currentCue = cueId; this._events = score.events; this._index = 0;
    this._beatSeconds = 60 / score.bpm; this.duration = score.beats * this._beatSeconds + TAIL_SECONDS;
    this.startedAt = now + .035; this._endsAt = this.startedAt + this.duration;
    this.playing = true; this.ended = false; this._stoppingAt = null; this._stopRequested = false;
    this.volume = clamp(Number.isFinite(volume) ? volume : 1, 0, 1.5);
    this.outputGain.gain.cancelScheduledValues(now); this.outputGain.gain.setValueAtTime(this.volume, now);
    this._delays.forEach((delay, index) => delay.delayTime.setValueAtTime(this._beatSeconds * (index ? .5 : .75), now));
    const fade = this._fade.gain;
    fade.cancelScheduledValues(now); fade.setValueAtTime(0, now);
    fade.linearRampToValueAtTime(1, this.startedAt + clamp(fadeIn, .025, 8));
    fade.setValueAtTime(1, this._endsAt - 5.5); fade.linearRampToValueAtTime(0, this._endsAt);
    this.update(now);
    return this;
  }

  update(now = this.ctx.currentTime) {
    if (this._disposed || !this.playing) return this.status();
    this._releaseFinished(now);
    if (now >= (this._stoppingAt ?? this._endsAt)) {
      this._clearVoices(); this.playing = false; this.ended = true; this._events = [];
      return this.status();
    }
    if (this.ctx.state && this.ctx.state !== 'running' || this._stopRequested) return this.status();
    const until = now + SCORE_LOOKAHEAD;
    while (this._index < this._events.length) {
      const event = this._events[this._index], start = this.startedAt + event.beat * this._beatSeconds;
      if (start > until) break;
      this._index++;
      // A stalled/hidden tab must never play a burst of missed notes on return.
      if (start < now - .09) continue;
      if (this._voices.size >= SCORE_MAX_VOICES) continue;
      this._voice(event, Math.max(start, now + .004), event.duration * this._beatSeconds);
    }
    return this.status();
  }

  _voice(event, start, duration) {
    const ctx = this.ctx, profile = INSTRUMENT[event.instrument];
    if (!profile) return;
    const gain = ctx.createGain(), pan = this._panner(event.pan * this._sceneMix.width), sources = [], nodes = [gain, pan];
    const sustained = ['pad', 'organ', 'bowed', 'reed', 'analog'].includes(event.instrument);
    const percussionVoice = ['kick', 'snare', 'hat', 'brush', 'rim', 'shimmer', 'metalKick', 'metalSnare', 'metalHat', 'metalCrash', 'metalTom'].includes(event.instrument);
    const end = Math.min(start + duration + profile.release, this._endsAt + .1);
    const peak = profile.gain * event.velocity;
    gain.gain.setValueAtTime(0, start);
    if (sustained) {
      const attack = Math.min(duration * .3, { organ: .06, reed: .085, analog: .04 }[event.instrument] || .62);
      gain.gain.linearRampToValueAtTime(peak, start + attack);
      gain.gain.setValueAtTime(peak * .92, Math.max(start + attack, end - profile.release));
      gain.gain.linearRampToValueAtTime(0, end);
      const wave = waveFor(ctx, this.assets, event.instrument), frequency = midiHz(event.midi);
      const count = ['organ', 'reed', 'analog'].includes(event.instrument) ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const oscillator = ctx.createOscillator(); oscillator.setPeriodicWave(wave);
        oscillator.frequency.setValueAtTime(frequency, start);
        const detune = count === 2 ? (i ? 2.5 : -2.5) : -.7;
        oscillator.detune.setValueAtTime(detune, start);
        if (['reed', 'bowed', 'pad'].includes(event.instrument) && duration > .6) {
          const period = event.instrument === 'reed' ? .13 : .9;
          const depth = event.instrument === 'reed' ? 5 : 1.2;
          for (let offset = .35, step = 0; offset < duration; offset += period, step++) {
            oscillator.detune.linearRampToValueAtTime(detune + (step % 2 ? -depth : depth), start + offset);
          }
        }
        oscillator.connect(gain); sources.push(oscillator); nodes.push(oscillator);
      }
    } else {
      const { buffer, rate } = sampleFor(ctx, this.assets, event.instrument, event.midi, event.velocity);
      const source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.setValueAtTime(rate, start);
      if ((event.instrument === 'guitar' || event.instrument === 'metalLead') && source.detune) {
        source.detune.setValueAtTime(-5, start); source.detune.linearRampToValueAtTime(0, start + .07);
        if (duration > .65) {
          for (let offset = .4, index = 0; offset < duration; offset += .11, index++) source.detune.linearRampToValueAtTime(index % 2 ? -3 : 3, start + offset);
        }
      }
      const attack = event.instrument === 'bass' ? .012 : .005;
      gain.gain.linearRampToValueAtTime(peak, start + attack);
      if (percussionVoice) gain.gain.setValueAtTime(peak, Math.max(start + attack, end - .025));
      else gain.gain.setValueAtTime(peak, Math.max(start + attack, end - profile.release));
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain); sources.push(source); nodes.push(source);
    }
    gain.connect(pan); pan.connect(this._bus(event.instrument));
    const voice = { sources, nodes, gain, end, finished: false };
    this._voices.add(voice);
    let remaining = sources.length;
    sources.forEach(source => {
      source.onended = () => { if (--remaining <= 0) this._finishVoice(voice); };
      source.start(start); source.stop(end + .015);
    });
  }

  _finishVoice(voice) {
    if (voice.finished) return;
    voice.finished = true; this._voices.delete(voice);
    for (const source of voice.sources) source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
  }

  _releaseFinished(now) {
    for (const voice of this._voices) if (voice.end + .05 < now) this._finishVoice(voice);
  }

  _clearVoices() {
    for (const voice of this._voices) {
      for (const source of voice.sources) { try { source.stop(this.ctx.currentTime); } catch {} }
      this._finishVoice(voice);
    }
  }

  setVolume(value, seconds = .2) {
    if (this._disposed) return;
    this.volume = clamp(Number.isFinite(value) ? value : 0, 0, 1.5);
    ramp(this.outputGain.gain, this.volume, this.ctx.currentTime, seconds);
  }

  stop(fadeOut = 2) {
    if (this._disposed || !this.playing) return;
    const now = this.ctx.currentTime, seconds = clamp(Number.isFinite(fadeOut) ? fadeOut : 2, 0, 12);
    // A page suspension or mute must be able to interrupt an existing fade.
    if (this._stopRequested && seconds > .001) return;
    this._stopRequested = true;
    this._stoppingAt = now + seconds;
    if (seconds <= .001) {
      this._fade.gain.cancelScheduledValues(now); this._fade.gain.setValueAtTime(0, now);
      this._clearVoices(); this.playing = false; this.ended = true; this._events = [];
    } else ramp(this._fade.gain, 0, now, seconds);
  }

  suspend() { this.stop(0); }

  dispose() {
    if (this._disposed) return;
    this._clearVoices(); this._events = [];
    for (const node of this._nodes) { try { node.disconnect(); } catch {} }
    this._nodes = []; this._buses.clear(); this._toneFilters = []; this.playing = false; this.ended = true; this._disposed = true;
  }

  status() {
    return { playing: this.playing, ended: this.ended, currentCue: this.currentCue, duration: this.duration,
      startedAt: this.startedAt, activeVoices: this._voices.size, nextEventIndex: this._index,
      stopping: this._stopRequested, disposed: this._disposed };
  }
}
