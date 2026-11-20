/**
 * No Way Back — an original, guitar-free pressure piece for Quiet Earth.
 *
 * The recorded title theme's C-centred minor/modal colour is the reference,
 * not the older D-minor synthesized menu tune. The melody below is newly
 * written; neither contributed recording is sampled or changed. A four-note
 * rising question is answered by a descending phrase, then returns under a
 * tighter bass pulse. Every layer shares the same beat grid.
 *
 * This is a score, not a danger detector. The existing music director grants
 * it only after encountered combat/emergency; an unsettling room is not enough.
 */

export const QUIET_EARTH_DANGER_ID = 'no-way-back';

const HARMONY = Object.freeze({
  cm: { bass: 36, notes: [55, 60, 62, 63] },
  ab: { bass: 32, notes: [55, 60, 63, 67] },
  eb: { bass: 39, notes: [55, 58, 62, 67] },
  bb: { bass: 34, notes: [53, 58, 60, 65] },
  fm: { bass: 29, notes: [53, 60, 63, 67] },
  gs: { bass: 31, notes: [55, 60, 62, 65] },
  g: { bass: 31, notes: [55, 59, 62, 65] },
});
const OPENING = ['cm', 'cm', 'ab', 'ab', 'eb', 'bb', 'fm', 'gs'];
const PRESSURE = ['fm', 'ab', 'cm', 'cm', 'bb', 'fm', 'gs', 'g'];

// A deliberate mid-register line: intensity comes from rhythm and harmony,
// without a shrill lead, a rising siren, or an ear-piercing guitar replacement.
const QUESTION = [
  [0, .7, 60], [1, .45, 62], [1.75, 1.1, 63], [3.25, .55, 67],
  [4.25, 1.4, 65], [6.25, 1.2, 62],
  [8, .7, 60], [9.25, .45, 63], [10, 1.2, 67], [12, 1.4, 65],
  [14, 1.35, 63],
  [16, .65, 67], [17, .45, 65], [17.75, 1.25, 62], [19.5, .65, 58],
  [21, 1.15, 60], [23, .55, 62],
  [24, 1.2, 63], [26, .7, 62], [27.25, .65, 60], [29, 2.4, 55],
];
const ANSWER = [
  [0, 1.1, 65], [1.75, .65, 67], [3, 1.4, 68], [5, .8, 67], [6.5, .9, 63],
  [8, 1.2, 67], [10, .75, 65], [11.25, 1.45, 62], [14, 1.4, 60],
  [16, .7, 65], [17.25, .55, 67], [18.25, 1.4, 70], [20.5, .75, 68],
  [22, 1.4, 67], [24, 1.2, 65], [26, .65, 62], [27.25, .7, 59], [29, 2.4, 62],
];

function rhythm(s, beat, bar, level, held) {
  const kick = held ? [0, 2.75] : bar % 2 ? [0, 1.75, 2.5] : [0, 1.5, 2.75];
  for (const [i, offset] of kick.entries()) s.note(beat + offset, .16, 36, 'kick', level * (i ? .78 : 1), 0, 'rhythm');
  for (const offset of held ? [2] : [1, 3]) s.note(beat + offset, .17, 38, 'snare', level * .62, -.12, 'rhythm');
  if (!held) for (const offset of [.5, 1.5, 2.5, 3.5]) s.note(beat + offset, .1, 42, 'hat', level * .28, .22, 'rhythm');
  // Toms belong to phrase endings; an eight-bar answer has a recognizable
  // landing instead of a different random fill on each performance.
  if (bar % 8 === 7 && bar < 60) {
    s.note(beat + 2.5, .18, 45, 'metalTom', level * .48, -.2, 'rhythm');
    s.note(beat + 3.5, .22, 41, 'metalTom', level * .6, .16, 'rhythm');
  }
}

function noWayBack(s) {
  for (let bar = 0; bar < 64; bar++) {
    const beat = bar * 4, intro = bar < 4, breathing = bar >= 20 && bar < 28 || bar >= 44 && bar < 52;
    const final = bar >= 60, developed = bar >= 28 && bar < 44;
    const h = HARMONY[(developed || bar >= 60 ? PRESSURE : OPENING)[bar % 8]];
    const bass = breathing || final ? [[0, 1.25, 0], [2.5, .8, 7]]
      : [[0, .6, 0], [.75, .35, 12], [1.5, .55, 7], [2.5, .6, 0], [3.5, .3, 7]];
    for (const [offset, length, interval] of bass) s.note(beat + offset, length, h.bass + interval, 'bass', intro ? .51 : .65, 0, 'bass');
    rhythm(s, beat, bar, intro ? .43 : breathing ? .4 : final ? .42 : .59, breathing || final);

    // Short keyboard strokes and a restrained two-voice bed leave the centre
    // free for weapons, dialogue and the tune. No new instrument bank is needed.
    if (!intro && !breathing && !final) {
      s.chord(beat + .75, .42, [h.notes[0], h.notes[2]], 'felt', .3, -.24, .018);
      if (bar % 2) s.note(beat + 2.75, .55, h.notes[1], 'felt', .27, -.2, 'answer');
    }
    if (bar % 2 === 0) s.chord(beat + .2, breathing ? 5.8 : 5.2,
      [h.notes[0], h.notes[3]], breathing ? 'bowed' : 'pad', breathing ? .27 : .3, -.12, .018);
    if (developed && bar % 4 === 2) s.note(beat + 1.5, 1.4, h.notes[1], 'analog', .28, .25, 'answer');
  }

  s.phrase(.25, QUESTION.slice(0, 6), 'piano', .63, 0, .12);
  s.phrase(16, QUESTION, 'piano', .71, 0, .12);
  s.phrase(48, QUESTION, 'analog', .62, 0, .08);
  // Pressure briefly becomes a lower, wider answer. The pulse stays audible:
  // musical breathing space never tells the player an ongoing fight is over.
  s.phrase(82, [[0, 2.2, 55], [4, 2.5, 60], [8, 1.5, 63], [11, 2.8, 62],
    [16, 2.1, 58], [20, 1.5, 60], [23, 2.8, 59]], 'organ', .48, 0, .1);
  s.phrase(112, ANSWER, 'piano', .72, 0, .1);
  s.phrase(144, ANSWER, 'analog', .63, 0, .08);
  s.phrase(178, [[0, 2.4, 60], [4, 2, 62], [8, 2.5, 63], [12, 2.2, 55],
    [16, 1.2, 58], [18.5, 1.2, 60], [21, 1.8, 62], [25, 2.5, 59]], 'felt', .57, 0, .12);
  s.phrase(208, QUESTION, 'piano', .74, 0, .1);
  s.phrase(240, [[0, .8, 63], [1.5, .65, 62], [3, 1.4, 60], [5.5, 1.3, 55],
    [8, 1.5, 59], [10.5, 1.4, 62], [13, 2.5, 60]], 'piano', .59, 0, .12);
}

export const QUIET_EARTH_COMPOSITIONS = Object.freeze([
  Object.freeze({ id: QUIET_EARTH_DANGER_ID, title: 'No Way Back', family: 'combat',
    bars: 64, bpm: 118, cooldownSeconds: 260,
    tags: Object.freeze(['combat', 'ground', 'quiet-earth']), intensity: .8, build: noWayBack }),
]);
