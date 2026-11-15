/**
 * Six original pieces for life aboard ship, the field expeditions and Voltage.
 *
 * The written phrases are fixed. The score renderer supplies the instruments
 * and small performance variations; no gameplay state or audio objects belong
 * here. Sparse voicings leave room for footsteps, machinery and conversation.
 */

const piece = (id, title, family, bars, bpm, cooldownSeconds, tags, intensity, build) =>
  Object.freeze({ id, title, family, bars, bpm, cooldownSeconds,
    tags: Object.freeze(tags), intensity, build });

function twoTones(s, beat, h, instrument, velocity, duration = 3.2, pan = -.22) {
  s.chord(beat, duration, [h.notes[0], h.notes[2]], instrument, velocity, pan, .055);
}

// A small D-major song for a room that is temporarily home. The first and last
// statements belong to the felt piano; a breathy middle answers from a little
// farther away. There is no engine pulse or compulsory beat in this room.
function lampsInTheCabin(s, H) {
  const harmony = ['d', 'bm', 'g', 'a', 'd', 'em', 'g', 'a', 'd', 'd'];
  harmony.forEach((name, index) => {
    const beat = index * 8, h = H[name], ending = index >= 9;
    twoTones(s, beat, h, 'guitar', ending ? .15 : .23, ending ? 5 : 3.4, -.28);
    if (index > 0 && index < 9) s.note(beat + .2, 3.2, h.bass + 12, 'felt', .27, -.18, 'bass');
    if ([2, 5, 7].includes(index)) s.note(beat + 4.5, 1.7, h.notes[1] + 12, 'mallet', .19, .3, 'answer');
  });
  const home = [[0, 1.4, 66], [2, 1, 69], [4, 1.8, 64], [7, 1, 62],
    [9, .8, 66], [10.5, 2.2, 64], [14, 1.5, 61]];
  s.phrase(1.5, [[0, 1.1, 66], [2.5, 1.6, 69]], 'felt', .41, 0, .08);
  s.phrase(9, home, 'felt', .49, 0, .1);
  s.phrase(33, [[0, 2, 71], [3.5, 1.5, 74], [6, 2.2, 73], [10, 1.3, 69],
    [12.5, 2.8, 67], [17, 2.3, 66]], 'reed', .4, 0, .16);
  s.phrase(56, home.slice(0, 6), 'felt', .45, 0, .08);
  s.phrase(73, [[0, 1.5, 66], [3, 2.6, 62]], 'felt', .3, 0, -.02);
}

// The working site has an uneven, low mallet figure. It suggests hands finding
// a route through an old machine rather than treating the whole site as combat.
// The central open passage removes that figure and lets a new phrase breathe.
function underTheServiceLights(s, H) {
  const harmony = ['em', 'em', 'c', 'am', 'em', 'g', 'bm', 'em',
    'c', 'c', 'am', 'g', 'd', 'bm', 'em', 'em', 'c', 'am', 'bm', 'em', 'em', 'em'];
  harmony.forEach((name, bar) => {
    const beat = bar * 4, h = H[name], open = bar >= 9 && bar < 14, ending = bar >= 20;
    if (bar % 2 === 0) s.note(beat + .2, ending ? 3.3 : 2.5, h.bass, 'bass', ending ? .24 : .34, 0, 'bass');
    if (!open && !ending) {
      s.note(beat + .75, .65, h.notes[0], 'mallet', .26, -.27, 'accompaniment');
      if (bar % 3 !== 1) s.note(beat + 2.5, .7, h.notes[2], 'mallet', .22, -.21, 'accompaniment');
      if (bar > 2 && bar < 19 && bar % 2 === 1) s.note(beat + 3.25, .12, 38, 'rim', .17, .24, 'rhythm');
    }
    if ([3, 10, 16].includes(bar)) twoTones(s, beat + .3, h, 'organ', .2, 5.8, -.1);
  });
  const work = [[0, .8, 64], [1.5, 1.1, 71], [4, .7, 66], [5.5, 1.8, 67],
    [9, 1, 64], [11, .6, 62], [13, 2.1, 64]];
  s.phrase(2, work, 'mallet', .45, 0, .19);
  s.phrase(22, [[0, 1.2, 67], [2, 1, 71], [5, 1.4, 69], [8.5, 2.5, 66]], 'felt', .44, 0, .06);
  s.phrase(39, [[0, 2, 72], [3.5, 1.4, 71], [7, 1.2, 67], [9.5, 2.5, 69],
    [14, 1.8, 66]], 'reed', .36, 0, .17);
  s.phrase(60, work, 'mallet', .43, 0, .16);
  s.phrase(80, [[0, 1.1, 67], [2, 1, 66], [4, 2.5, 64]], 'felt', .3, 0, .08);
}

// The workshop's rising fifth becomes a compressed question in the machine
// bay. The score never pretends to synchronize with the Foreman's game clock:
// the warning lane and machine sounds remain the source of timing information.
function theForemanCycle(s, H) {
  const harmony = ['em', 'em', 'c', 'bm', 'em', 'am', 'c', 'bm',
    'em', 'g', 'c', 'c', 'am', 'bm', 'em', 'em', 'c', 'am', 'em', 'bm', 'c', 'bm', 'em', 'em'];
  harmony.forEach((name, bar) => {
    const beat = bar * 4, h = H[name], open = bar >= 10 && bar < 14, ending = bar >= 22;
    s.note(beat, ending ? 2.6 : open ? 1.7 : .6, h.bass, 'bass', ending ? .31 : .54, 0, 'bass');
    if (!open && !ending) {
      s.note(beat + 1.5, .45, h.fifth, 'bass', .4, 0, 'bass');
      s.note(beat + 3, .5, h.bass + 12, 'bass', .37, 0, 'bass');
      twoTones(s, beat + .75, h, 'mallet', .28, .42);
    }
    if (bar < 22) {
      s.note(beat + .04, .2, 36, 'kick', open ? .22 : .42, 0, 'rhythm');
      s.note(beat + (bar % 2 ? 2.75 : 1.5), .13, 38, 'rim', open ? .2 : .39, -.16, 'rhythm');
      if (!open && bar > 1) s.note(beat + 3, .2, 38, 'snare', .27, .1, 'rhythm');
      if (bar % 4 === 3 && !open) s.note(beat + 3.6, .12, 42, 'hat', .16, .3, 'rhythm');
    }
    if ([10, 12].includes(bar)) twoTones(s, beat + .25, h, 'organ', .24, 3, -.08);
  });
  const machine = [[0, .55, 64], [1, .5, 71], [2.25, .75, 66], [4, 1.1, 67],
    [6, .6, 64], [7.5, .5, 62], [8.5, 1, 64], [11, .65, 67], [12.5, 1.8, 66]];
  s.phrase(.5, [[0, .5, 64], [1, .7, 71], [2.5, .65, 66]], 'analog', .52, 0, .11);
  s.phrase(8, machine, 'analog', .61, 0, .12);
  s.phrase(26, [[0, .7, 67], [1.5, .7, 69], [3, 1.3, 71], [6, .8, 69],
    [8, 1.4, 66], [10.5, 1, 64]], 'mallet', .5, 0, .2);
  s.phrase(42, [[0, 1.8, 72], [3, 1.2, 71], [5, 1.5, 67], [8, .8, 66],
    [10, 1.7, 69], [13, 1.7, 66]], 'felt', .53, 0, .06);
  s.phrase(64, machine, 'analog', .63, 0, .12);
  s.phrase(83, [[0, 1.1, 71], [2, 1, 67], [4.5, 1.2, 66], [7.5, 2.8, 64]], 'felt', .4, 0, .06);
}

// Relief without a victory fanfare. This tune can accompany someone walking
// out under their own strength; the final unhurried answer makes room for the
// subsequent quiet interval instead of demanding another piece immediately.
function carryTheLight(s, H) {
  for (const [beat, name, duration] of [[0, 'f9', 6], [8, 'am', 5.5], [16, 'bb', 5.5],
    [24, 'gm', 5.5], [32, 'c', 5.5], [40, 'f9', 6], [48, 'f', 6]]) {
    const h = H[name], ending = beat >= 48;
    twoTones(s, beat, h, 'felt', ending ? .16 : .23, duration, -.23);
    if (beat > 0 && beat < 48) s.note(beat + 1.2, 2.8, h.bass + 12, 'guitar', .25, -.12, 'bass');
  }
  const light = [[0, 1.5, 65], [2.5, 1, 72], [4.5, 1.5, 70], [7.5, 1, 69],
    [9.5, 1, 67], [12, 2.2, 69]];
  s.phrase(2, light, 'reed', .4, 0, .15);
  s.phrase(22, [[0, 1.5, 70], [3, 1.1, 74], [5.5, 1.8, 72], [9, 1.3, 67],
    [12, 2.2, 65]], 'felt', .42, 0, .08);
  s.phrase(40, light.slice(0, 4), 'reed', .35, 0, .15);
  s.phrase(51, [[0, 1.2, 67], [2, 2.4, 65]], 'felt', .29, 0, .02);
  s.note(18.5, 1.6, 77, 'mallet', .17, .27, 'answer');
  s.note(37.5, 1.4, 76, 'mallet', .16, .24, 'answer');
}

// A late, companionable E-minor groove: the mallet head and the analog answer
// trade places over a moving bass. The middle drops the kit and changes the
// harmony before the room settles into a shorter, quieter final statement.
function afterHoursOnGlimmer(s, H) {
  const harmony = ['em', 'em', 'am', 'bm', 'em', 'g', 'c', 'bm',
    'em', 'am', 'c', 'd', 'g', 'g', 'am', 'bm', 'em', 'em', 'c', 'bm', 'em', 'am', 'em', 'em'];
  harmony.forEach((name, bar) => {
    const beat = bar * 4, h = H[name], open = bar >= 12 && bar < 16, ending = bar >= 22;
    s.note(beat + .05, ending ? 2.8 : 1.15, h.bass, 'bass', ending ? .26 : .43, 0, 'bass');
    if (!ending && bar > 1) {
      s.note(beat + 1.75, .65, h.fifth, 'bass', .32, 0, 'bass');
      if (!open) s.note(beat + 3.25, .5, h.bass + 12, 'bass', .3, 0, 'bass');
    }
    twoTones(s, beat + (ending ? .25 : .75), h, 'piano', ending ? .16 : .25, ending ? 3 : 1.1, -.29);
    if (!open && !ending && bar > 2) {
      s.note(beat, .16, 36, 'kick', .27, 0, 'rhythm');
      s.note(beat + 1.1, .26, 38, 'brush', .28, -.18, 'rhythm');
      s.note(beat + 3.1, .15, 38, 'rim', .22, -.12, 'rhythm');
      if (bar % 2 === 0) s.note(beat + 2.5, .1, 42, 'hat', .16, .27, 'rhythm');
    }
    if ([7, 13, 19].includes(bar)) s.note(beat + 2.5, 1, h.notes[2] + 12, 'felt', .24, -.1, 'answer');
  });
  const night = [[0, .7, 64], [1.25, .6, 67], [2.5, 1, 71], [4.5, .7, 74],
    [6, .5, 71], [7.25, 1, 69], [9.5, .7, 67], [11, .6, 66], [12.5, 2, 64]];
  s.phrase(1, [[0, .9, 64], [2.25, 1.3, 67]], 'mallet', .42, 0, .15);
  s.phrase(9, night, 'mallet', .51, 0, .16);
  s.phrase(29, [[0, 1.4, 71], [2.5, .8, 69], [4, 1.1, 67], [7, .7, 66],
    [8.5, 1.4, 64], [12, 2, 62]], 'analog', .39, 0, .1);
  s.phrase(49, [[0, 1, 74], [2, .7, 76], [3.5, 1.7, 71], [7, 1.1, 69],
    [9.5, .7, 67], [11, 2.3, 66]], 'felt', .46, 0, .07);
  s.phrase(68, night, 'mallet', .48, 0, .16);
  s.phrase(88, [[0, .9, 67], [2, 1, 66], [4, 2.5, 64]], 'mallet', .31, 0, .08);
}

// The city outdoors keeps its rhythm at a distance. Wide B-minor harmonies
// accompany a falling piano line; the middle looks upward, then returns with
// fewer attacks. The small pluck answers are notes, not synthetic rain effects.
function rainOnTheTransitLine(s, H) {
  const harmony = ['bm', 'g', 'd', 'a', 'bm', 'em', 'g', 'a', 'bm', 'g', 'a', 'bm'];
  harmony.forEach((name, index) => {
    const beat = index * 8, h = H[name], ending = index >= 11;
    twoTones(s, beat, h, 'pad', ending ? .13 : .19, ending ? 6 : 5.8, -.1);
    if (index > 0 && index < 11) s.note(beat + .4, 2.6, h.bass + 12, 'felt', .26, -.28, 'bass');
    if (![0, 6, 7, 11].includes(index)) {
      s.note(beat + 3, .8, h.notes[1] + 12, 'pluck', .21, .24, 'answer');
      s.note(beat + 5.5, 1, h.notes[2] + 12, 'pluck', .17, .3, 'answer');
    }
    if ([3, 5, 9].includes(index)) s.note(beat + 2.5, .25, 38, 'brush', .13, -.18, 'rhythm');
  });
  const rain = [[0, 1.7, 74], [3, 1.1, 73], [5.5, 1.8, 69], [9, .9, 66],
    [11, 2.3, 67], [15, 1.8, 66]];
  s.phrase(2, rain, 'felt', .46, 0, .05);
  s.phrase(25, [[0, 1.7, 69], [3.5, 1, 71], [6, 1.4, 73], [9, 1.1, 74],
    [12, 2.5, 71]], 'analog', .32, 0, .13);
  s.phrase(47, [[0, 1.5, 76], [3, 1.2, 74], [5.5, 1.6, 71], [9, 1.4, 69],
    [12.5, 2.2, 67]], 'felt', .44, 0, .05);
  s.phrase(68, rain.slice(0, 5), 'felt', .41, 0, .05);
  s.phrase(88, [[0, 1.6, 66], [3.5, 2.5, 62]], 'felt', .28, 0, -.03);
}

export const PLACE_COMPOSITIONS = Object.freeze([
  piece('lamps-in-the-cabin', 'Lamps in the Cabin', 'exploration', 20, 60, 480,
    ['ship', 'cabin', 'home', 'quiet'], .12, lampsInTheCabin),
  piece('under-the-service-lights', 'Under the Service Lights', 'exploration', 22, 76, 420,
    ['fieldwork', 'floodworks', 'machinery', 'ground'], .2, underTheServiceLights),
  piece('the-foreman-cycle', 'The Foreman Cycle', 'combat', 24, 108, 180,
    ['combat', 'foreman', 'machinery', 'fieldwork', 'ground'], .72, theForemanCycle),
  piece('carry-the-light', 'Carry the Light', 'recovery', 14, 64, 300,
    ['recovery', 'rescue', 'safe-return', 'fieldwork'], .16, carryTheLight),
  piece('after-hours-on-glimmer', 'After Hours on Glimmer', 'social', 24, 88, 420,
    ['nightlife', 'city', 'voltage', 'tavern'], .3, afterHoursOnGlimmer),
  piece('rain-on-the-transit-line', 'Rain on the Transit Line', 'exploration', 24, 70, 480,
    ['city', 'voltage', 'rain', 'planet'], .18, rainOnTheTransitLine),
]);
