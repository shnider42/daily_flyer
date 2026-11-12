/**
 * Original, fixed compositions for Farwake's caves and planetary landscapes.
 *
 * These pieces have their own melodies, harmony, meter accents and departures;
 * the performance seed is applied later by the score renderer. Quiet openings,
 * rests between phrases and unaccented endings leave the place itself audible.
 * Cave music describes the room, never an undiscovered creature in that room.
 *
 * No audio resources are allocated here. The score adapter supplies its small
 * composer and concert-pitch harmony table, keeping the existing voice budget.
 */

const composition = (id, title, family, bars, bpm, cooldownSeconds, tags, intensity, build) =>
  Object.freeze({ id, title, family, bars, bpm, cooldownSeconds, tags: Object.freeze(tags), intensity, build });

// A low, dry two-note figure, answered much later by a soft piano. The middle
// section changes direction rather than filling every gap with another echo.
function underTheFirstRidge(s, H) {
  const beds = [[0, 'dm'], [4, 'bb'], [8, 'gm'], [12, 'dm']];
  for (const [bar, h] of beds) {
    s.chord(bar * 4, 9, [H[h].notes[0], H[h].notes[2]], 'bowed', bar === 0 ? .17 : .21, -.2, .06);
    if (bar > 0) s.note(bar * 4 + 1, 2.4, H[h].bass + 12, 'piano', .27, -.3, 'bass');
  }
  s.phrase(3, [[0, .6, 62], [1.5, .8, 69], [5, 1.1, 65], [10, 1.8, 62]], 'pluck', .4, 0, .19);
  s.phrase(20, [[0, 1.2, 65], [3, .7, 69], [4.5, 1.6, 62], [10, 2.2, 60]], 'piano', .41, 0, -.04);
  s.phrase(36, [[0, 1.4, 70], [2.5, .7, 69], [6, 1.7, 65], [10.5, 1.2, 62]], 'pluck', .38, 0, .16);
  s.note(9, 1.2, 74, 'bell', .17, -.32, 'answer');
  s.note(31.5, 1.6, 72, 'bell', .16, .32, 'answer');
  s.phrase(52, [[0, 1.3, 65], [3, 2.5, 62]], 'piano', .29, 0, -.12);
}

// Pairs of unevenly spaced drops pass between registers. The second phrase
// rises where the first falls; the final answer is left deliberately short.
function waterBetweenWalls(s, H) {
  for (const [bar, h] of [[0, 'f9'], [5, 'am'], [9, 'bb'], [13, 'c'], [17, 'f9']]) {
    s.chord(bar * 4, bar === 17 ? 6 : 10, [H[h].notes[0], H[h].notes[2]], 'pad', .18, -.18, .04);
  }
  s.phrase(4, [[0, .8, 76], [1.25, .6, 72], [4, 1.4, 69], [7.5, 1.1, 67], [11, 2, 64]], 'piano', .43, 0, -.16);
  s.phrase(22, [[0, 1.1, 67], [2.75, .8, 72], [6, 1.5, 76], [10.5, 2.2, 74]], 'bell', .28, 0, .27);
  s.phrase(40, [[0, .7, 77], [1.5, 1.2, 74], [5, .8, 72], [7.75, 1.8, 69], [12, 2.3, 65]], 'piano', .42, 0, -.1);
  s.phrase(59, [[0, 1.4, 67], [3.5, 1, 72], [8, 2, 69]], 'bell', .25, 0, .21);
  for (const [beat, midi] of [[8, 48], [26, 45], [44, 46], [61, 48]]) {
    s.note(beat, 2.1, midi, 'piano', .23, -.32, 'bass');
  }
  s.note(73, 2.5, 65, 'piano', .27, -.08, 'melody');
}

// Broad, consonant stone-colored intervals, with a four-note inscription that
// returns in a new register. This is spacious rather than a threat signal.
function basaltLetters(s, H) {
  for (const [bar, h] of [[0, 'em'], [4, 'g'], [8, 'd'], [12, 'em']]) {
    s.chord(bar * 4, 10.5, [H[h].bass + 12, H[h].fifth + 12], 'bowed', .2, -.12, .07);
    if (bar === 4 || bar === 8) s.note(bar * 4 + 6, 2.4, H[h].notes[1], 'organ', .17, .2);
  }
  s.phrase(5, [[0, .8, 64], [2, 1.3, 71], [5.5, 1.1, 66], [9, 2.4, 67]], 'pluck', .39, 0, -.22);
  s.phrase(22, [[0, 2, 71], [4, 1.4, 69], [7.5, 2, 67]], 'piano', .33, 0, .19);
  s.phrase(36, [[0, 1, 66], [1.75, .8, 69], [5, 1.3, 73], [9.5, 1.8, 71]], 'pluck', .37, 0, -.15);
  s.phrase(52, [[0, 1.3, 67], [3.5, 2.5, 64]], 'piano', .28, 0, .1);
}

// Warm fingerpicked fragments in a sheltered hollow. Three short phrases have
// different lengths; the broad bowed response arrives only in the middle.
function aLittleRoomBelow(s, H) {
  const harmony = ['f', 'am', 'bb', 'c', 'f', 'gm', 'bb', 'c', 'f', 'f'];
  harmony.forEach((h, index) => {
    const beat = index * 8;
    s.chord(beat, 3.2, H[h].notes.slice(0, 2), 'guitar', index === 0 || index >= 9 ? .2 : .27, -.22, .085);
    if (index > 0 && index < 9) s.note(beat + 3, .9, H[h].notes[2], 'pluck', .22, .24, 'answer');
  });
  s.phrase(3, [[0, 1, 69], [2, .5, 72], [3, 1.5, 69], [6, .8, 67], [8, 2, 65]], 'piano', .43, 0, .1);
  s.phrase(22, [[0, .75, 65], [1.25, .75, 69], [3, 1.25, 74], [5.5, 1, 72], [9, 2.3, 67]], 'guitar', .46, 0, .08);
  s.chord(35, 8, [58, 65], 'bowed', .18, -.08, .03);
  s.phrase(43, [[0, 1.4, 70], [2.5, .8, 69], [5, 1.6, 65], [8.5, .7, 67], [11, 2.3, 69]], 'piano', .42, 0, .14);
  s.phrase(62, [[0, 1.2, 67], [2.5, 1.8, 65], [7, 2.5, 60]], 'guitar', .34, 0, -.05);
}

// Long rests are part of this tune. Soft sustained thirds frame a small bell
// melody; no drums, sub-bass swell or horror interval announces hidden actors.
function theLongQuietSeam(s, H) {
  for (const [beat, h, duration] of [[0, 'd', 10], [20, 'bm', 11], [40, 'g', 11], [60, 'd', 9]]) {
    s.chord(beat, duration, [H[h].notes[0], H[h].notes[2]], 'organ', .16, -.18, .08);
  }
  s.phrase(6, [[0, 1.7, 69], [4.5, 2.1, 66], [10, 2.5, 64]], 'bell', .26, 0, .28);
  s.phrase(26, [[0, 2.1, 66], [5.5, 1.8, 74], [11, 2.5, 73]], 'piano', .34, 0, -.1);
  s.phrase(46, [[0, 2, 71], [5, 1.2, 69], [9, 3, 67]], 'bell', .25, 0, .24);
  s.phrase(65, [[0, 1.7, 66], [5, 3, 62]], 'piano', .26, 0, -.13);
  s.note(34, 3, 47, 'bowed', .19, -.24, 'bass');
  s.note(54, 3, 43, 'bowed', .18, -.24, 'bass');
}

// TEMPERATE: a walking tune in D, first on piano, then guitar. A separate
// middle eight opens upward before the last phrase settles close to the ground.
function rainOverMorrow(s, H) {
  const harmony = ['d', 'd', 'g', 'g', 'bm', 'a', 'g', 'd', 'g', 'a', 'bm', 'g',
    'em', 'g', 'a', 'a', 'd', 'g', 'bm', 'a', 'g', 'd', 'd', 'd'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4, quiet = bar < 2 || bar >= 21;
    if (bar % 2 === 0 || (bar >= 8 && bar < 16)) {
      s.chord(beat, quiet ? 3.5 : 3, H[h].notes.slice(0, 3), 'guitar', quiet ? .21 : .3, -.26, .07);
    }
    if (bar >= 3 && bar < 21) s.bass(bar, h, false, .32);
    if ([4, 8, 12, 16].includes(bar)) s.chord(beat + .2, 6.3, H[h].notes.slice(1, 3), 'pad', .18, -.07);
    if (bar >= 8 && bar < 20 && bar % 2 === 0) {
      s.note(beat + 1, .28, 38, 'brush', .15, -.2, 'rhythm');
      s.note(beat + 3, .28, 38, 'brush', .12, -.2, 'rhythm');
    }
  });
  const a = [[0, 1.2, 66], [1.5, .5, 69], [2.5, 1, 71], [4, 2, 69],
    [7, .75, 67], [8, 1.4, 66], [10, .75, 64], [12, 2.2, 62]];
  s.phrase(3, a, 'piano', .5, 0, .1);
  s.phrase(20, [[0, 1.2, 66], [2, .75, 69], [3.5, 1.5, 74], [6, 1.25, 73], [9, .75, 71], [11, 2, 69]], 'guitar', .54, 0, .12);
  s.phrase(36, [[0, 1.5, 71], [2, .75, 74], [3.5, 2, 76], [7, 1, 74], [9, 1.4, 71], [12, 2.4, 69]], 'piano', .51, 0, .1);
  s.phrase(52, [[0, 1, 67], [1.5, 1.4, 71], [4, 1.7, 69], [7, .75, 67], [9, 1.2, 64], [12, 2.1, 66]], 'guitar', .52, 0, .13);
  s.phrase(68, a, 'guitar', .48, 0, .1);
  s.phrase(86, [[0, 1.5, 66], [3, 2.8, 62]], 'piano', .34, 0, -.08);
}

// FOREST: an offbeat, gently skipping pluck line with a slower piano answer.
// The arrangement falls back to a single guitar before the last small refrain.
function orchardsInOrbit(s, H) {
  const harmony = ['f', 'f', 'c', 'am', 'bb', 'bb', 'c', 'f', 'am', 'am', 'gm', 'c',
    'bb', 'f', 'gm', 'c', 'f', 'am', 'bb', 'c', 'f', 'bb', 'f', 'f'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4;
    if (bar < 22) {
      s.note(beat + .5, .8, H[h].notes[0], 'guitar', bar < 2 ? .2 : .28, -.25);
      if (bar > 1 && bar < 20) s.note(beat + 2.5, .8, H[h].notes[2], 'guitar', .25, -.17);
    }
    if (bar >= 4 && bar < 20 && bar % 2 === 0) s.bass(bar, h, false, .29);
    if (bar >= 6 && bar < 18) {
      s.note(beat + 1, .13, 42, 'hat', .1, .23, 'rhythm');
      s.note(beat + 3.25, .15, 37, 'rim', .14, -.2, 'rhythm');
    }
    if (bar === 8 || bar === 12) s.chord(beat, 6, H[h].notes.slice(1, 3), 'organ', .16, -.08);
  });
  const a = [[0, .75, 72], [1.25, .5, 69], [2, .75, 67], [3.5, 1.1, 69],
    [6, .75, 65], [7.25, .5, 67], [8, 1.2, 72], [11, 1.8, 69]];
  s.phrase(3.5, a, 'pluck', .47, 0, .18);
  s.phrase(20, [[0, 1, 65], [2, 1.5, 69], [4.5, 1.5, 74], [8, 1.1, 72], [11, 2, 67]], 'piano', .46, 0, -.02);
  s.phrase(36, [[0, .5, 76], [1, .75, 72], [2.5, .75, 69], [4, 1.2, 67],
    [7, .75, 70], [8.25, .5, 69], [9, 1.1, 65], [12, 2, 67]], 'pluck', .49, 0, .2);
  s.phrase(54, [[0, 1.4, 70], [2.5, .8, 69], [5, 1.6, 65], [9, 2.3, 60]], 'guitar', .44, 0, .1);
  s.phrase(68, a, 'pluck', .44, 0, .16);
  s.chord(84, 3.2, [53, 60], 'guitar', .22, -.2, .07);
  s.phrase(85, [[0, 1.1, 69], [3, 2.5, 65]], 'piano', .33, 0, .08);
}

// DESERT: open fifths beneath a measured, uneven walking pattern. Long guitar
// notes cross the pulse, and the second half turns to a new rising melody.
function roadsOfVioletDust(s, H) {
  const harmony = ['em', 'em', 'g', 'g', 'd', 'a', 'em', 'em', 'am', 'am', 'em', 'g',
    'd', 'd', 'a', 'a', 'em', 'g', 'am', 'em', 'd', 'em', 'em', 'em'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4;
    if (bar % 2 === 0) s.chord(beat, bar >= 20 ? 4 : 5.3, [H[h].bass + 12, H[h].fifth + 12], 'pad', .19, -.15, .04);
    if (bar > 1 && bar < 20) {
      s.note(beat + .25, .7, H[h].notes[0], 'pluck', .23, -.25);
      s.note(beat + 1.75, .6, H[h].notes[2], 'pluck', .21, -.18);
      if (bar % 4 < 2) s.note(beat + 3, .7, H[h].notes[1], 'pluck', .2, -.23);
    }
    if (bar >= 6 && bar < 18 && bar % 2 === 0) s.note(beat + 2.5, .15, 37, 'rim', .17, .15, 'rhythm');
  });
  s.phrase(4, [[0, 2.4, 71], [3, .75, 67], [4.5, 1.7, 66], [8, 2.2, 64], [12, 1.5, 67]], 'guitar', .49, 0, .12);
  s.phrase(23, [[0, 2, 69], [3, 1.5, 66], [6, 1, 64], [8.5, 2.5, 62]], 'piano', .44, 0, .06);
  s.phrase(40, [[0, 1.5, 64], [2.5, 1, 67], [4, 2.5, 71], [8, 1.4, 74], [10.5, 2, 73]], 'guitar', .52, 0, .13);
  s.phrase(57, [[0, 1.2, 69], [2, 1.8, 71], [5.5, 2, 67], [9, 2.3, 64]], 'piano', .45, 0, .04);
  s.phrase(73, [[0, 1.5, 66], [2.5, 1, 69], [5, 2, 67], [9, 2.2, 64]], 'guitar', .43, 0, .11);
  s.note(89, 3, 64, 'piano', .3, -.05, 'melody');
}

// OCEAN: a six-note, three-against-two arpeggio ebbs out before each four-bar
// phrase ends. Its melody follows a longer wave than the accompaniment.
function theTideKeepsTime(s, H) {
  const harmony = ['f9', 'f9', 'c', 'c', 'bb', 'bb', 'f', 'f', 'am', 'am', 'gm', 'c',
    'bb', 'bb', 'c', 'c', 'f9', 'am', 'bb', 'c', 'f', 'f', 'f9', 'f9'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4;
    if (bar % 2 === 0) s.chord(beat, bar < 20 ? 6.5 : 4.5, H[h].notes.slice(0, 2), 'pad', .17, -.12);
    if (bar >= 2 && bar < 21 && bar % 4 !== 3) {
      [0, 2 / 3, 4 / 3, 2, 8 / 3, 10 / 3].forEach((offset, i) => {
        const pitches = [H[h].notes[0], H[h].notes[1], H[h].notes[2], H[h].notes[3], H[h].notes[2], H[h].notes[1]];
        s.note(beat + offset, .5, pitches[i], 'guitar', .22 + (i === 0 ? .04 : 0), -.28 + i * .035);
      });
    }
    if ([4, 8, 12, 16].includes(bar)) s.bass(bar, h, false, .27);
  });
  const a = [[0, 1.8, 69], [3, 1.1, 72], [5, 2.8, 76], [9, 1.2, 74], [11.5, 2, 72]];
  s.phrase(4, a, 'piano', .49, 0, .12);
  s.phrase(22, [[0, 1.6, 74], [3, 2, 69], [6, 1.2, 67], [9, 2.7, 65]], 'guitar', .48, 0, .18);
  s.phrase(40, [[0, 2.2, 72], [3.5, 1.2, 76], [6, 2.5, 77], [10, 1.7, 74]], 'piano', .51, 0, .13);
  s.phrase(57, [[0, 1.2, 72], [2.5, 1.7, 69], [6, 2, 67], [10, 2.4, 64]], 'guitar', .46, 0, .17);
  s.phrase(73, a.slice(0, 4), 'piano', .43, 0, .1);
  s.phrase(87, [[0, 1.3, 69], [3, 2.5, 65]], 'piano', .31, 0, -.02);
}

// ICE: piano and bells share a wide-spaced melody over slow suspended chords.
// The central phrase has a clear summit, followed by several beats of air.
function theWhiteDistance(s, H) {
  for (const [bar, h] of [[0, 'd'], [3, 'bm'], [6, 'g'], [9, 'a'], [12, 'em'], [15, 'g'], [18, 'd']]) {
    s.chord(bar * 4, bar === 18 ? 4.5 : 7.5, H[h].notes.slice(0, 3), 'bowed', .17, -.16, .06);
    if (bar > 0 && bar < 18) s.note(bar * 4 + 1, 2, H[h].bass + 12, 'piano', .24, -.3, 'bass');
  }
  s.phrase(4, [[0, 1.7, 74], [3.5, 1.2, 69], [6, 2.5, 66], [11, 2.2, 64]], 'piano', .4, 0, .05);
  s.phrase(21, [[0, 1.2, 71], [3, 1.5, 74], [7, 2.2, 78]], 'bell', .28, 0, .26);
  s.phrase(35, [[0, 1.4, 76], [2.5, 1, 78], [5, 2.7, 81], [10, 2.2, 76]], 'piano', .43, 0, .07);
  s.phrase(52, [[0, 2, 74], [4, 1.8, 71], [8, 2.8, 67]], 'bell', .27, 0, .2);
  s.phrase(67, [[0, 1.5, 69], [3, 2.7, 66]], 'piano', .31, 0, -.05);
}

// VOLCANIC: a restrained low pluck pulse gives the ground weight. Syncopated
// chords and a rising guitar line suggest movement without a combat ostinato.
function embersBelowTheRoad(s, H) {
  const harmony = ['dm', 'dm', 'bb', 'c', 'dm', 'gm', 'bb', 'c', 'f', 'f', 'bb', 'gm',
    'dm', 'c', 'bb', 'a7', 'dm', 'bb', 'gm', 'c', 'dm', 'dm', 'dm', 'dm'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4;
    if (bar % 2 === 0) s.chord(beat, bar >= 20 ? 4.5 : 5.8, [H[h].notes[0], H[h].notes[2]], 'organ', .19, -.14);
    if (bar >= 2 && bar < 20) {
      s.note(beat, 1, H[h].bass + 12, 'pluck', .28, -.2, 'bass');
      if (bar % 4 !== 3) s.note(beat + 2.75, .6, H[h].fifth + 12, 'pluck', .23, -.12, 'bass');
      if (bar % 2 === 1) s.chord(beat + 1.5, 1.5, H[h].notes.slice(1, 3), 'piano', .25, -.08, .04);
    }
    if (bar >= 6 && bar < 18) {
      s.note(beat + 1.5, .2, 38, 'brush', .17, .18, 'rhythm');
      if (bar % 2 === 1) s.note(beat + 3.5, .15, 37, 'rim', .15, .22, 'rhythm');
    }
  });
  s.phrase(4, [[0, 1, 62], [1.75, .75, 65], [3, 1.4, 69], [6, 2, 67], [10, 2.2, 65]], 'guitar', .5, 0, .13);
  s.phrase(21, [[0, 1.4, 69], [2.5, .75, 70], [4, 1.6, 74], [7, 1.5, 72], [10, 2, 67]], 'piano', .48, 0, .08);
  s.phrase(37, [[0, 1.1, 72], [2, 1.4, 69], [5, 1, 65], [7, 2.3, 70], [11, 2, 69]], 'guitar', .53, 0, .15);
  s.phrase(54, [[0, .75, 67], [1.25, 1.4, 65], [4, 2, 62], [8, 1.2, 64], [11, 2.4, 61]], 'piano', .46, 0, .06);
  s.phrase(71, [[0, 1.3, 62], [2, .8, 65], [4, 2, 69], [8, 2.3, 65]], 'guitar', .43, 0, .12);
  s.phrase(86, [[0, 1.4, 64], [3, 2.7, 62]], 'piano', .32, 0, -.02);
}

// INDUSTRIAL: an unhurried evening groove. A warm organ answers the piano;
// the little rim rhythm is absent at both ends so arrival remains unobtrusive.
function windowsAfterShift(s, H) {
  const harmony = ['am', 'am', 'f9', 'f9', 'c', 'g6', 'am', 'am', 'f9', 'c', 'gm', 'c',
    'f9', 'am', 'g6', 'g6', 'am', 'f9', 'c', 'g6', 'am', 'am', 'am', 'am'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4, quiet = bar < 3 || bar >= 20;
    if (bar % 2 === 0 || !quiet) s.chord(beat + (quiet ? 0 : .5), quiet ? 3 : 1.8, H[h].notes.slice(0, 3), 'piano', quiet ? .2 : .27, -.2, .04);
    if (!quiet) {
      s.bass(bar, h, false, .33);
      s.note(beat + 1, .15, 37, 'rim', .17, -.15, 'rhythm');
      s.note(beat + 3, .15, 37, 'rim', .14, -.15, 'rhythm');
      s.note(beat + 2.5, .1, 42, 'hat', .09, .2, 'rhythm');
    }
    if ([6, 10, 14, 18].includes(bar)) s.chord(beat + 2, 3.4, H[h].notes.slice(1, 3), 'organ', .19, -.03);
  });
  const a = [[0, .75, 64], [1.25, .5, 67], [2, 1.1, 69], [4.5, .75, 72],
    [6, 1.5, 67], [9, .75, 64], [10.5, 2, 60]];
  s.phrase(4, a, 'guitar', .49, 0, .14);
  s.phrase(21, [[0, 1.1, 67], [2, .75, 69], [3.5, 1, 72], [6, 1.5, 71], [9, 2, 67], [12, 1.2, 64]], 'piano', .5, 0, .05);
  s.phrase(38, [[0, .75, 69], [1.5, .75, 72], [3, 1.3, 76], [6, 1, 74], [8, 1.3, 72], [11, 2, 67]], 'guitar', .52, 0, .16);
  s.phrase(54, [[0, 1.4, 64], [2.5, .75, 67], [4, 1.7, 69], [8, 1, 67], [10.5, 2.1, 62]], 'piano', .47, 0, .08);
  s.phrase(70, a, 'guitar', .43, 0, .12);
  s.phrase(86, [[0, 1.2, 64], [2.5, 2.6, 60]], 'piano', .31, 0, -.02);
}

// BARREN: a lone guitar with isolated, low piano landmarks. Unlike the cave
// pieces the tune spans the open register and the middle briefly gains a pulse.
function smallSkyOnAMoon(s, H) {
  for (const [bar, h] of [[0, 'em'], [3, 'g'], [6, 'd'], [9, 'a'], [12, 'g'], [15, 'em'], [18, 'em']]) {
    s.note(bar * 4, 2.5, H[h].bass + 12, 'piano', .24, -.26, 'bass');
    s.chord(bar * 4 + 1, 4.8, [H[h].notes[0], H[h].notes[2]], 'pad', .16, -.12, .04);
  }
  s.phrase(4, [[0, 2.2, 64], [3.5, 1, 71], [6, 1.6, 67], [10, 2.2, 66]], 'guitar', .44, 0, .14);
  s.phrase(21, [[0, 1.6, 69], [3, 1.1, 74], [6, 2, 73], [10, 2.4, 69]], 'guitar', .46, 0, .12);
  for (const [beat, midi] of [[34, 55], [36.5, 62], [42, 57], [44.5, 64], [50, 55], [52.5, 62]]) {
    s.note(beat, .85, midi, 'pluck', .2, -.25);
  }
  s.phrase(38, [[0, 1.3, 71], [2.5, .75, 74], [4.5, 2.2, 76], [8.5, 1.5, 71], [12, 2.1, 67]], 'piano', .42, 0, .08);
  s.phrase(57, [[0, 1.5, 66], [3, 1.8, 67], [7, 2.6, 64]], 'guitar', .39, 0, .12);
  s.note(73, 2.8, 64, 'piano', .28, -.03, 'melody');
}

// RUIN: an old-sounding waltz impression, phrased across the four-beat score
// grid in three-beat cells. A new answering melody resolves the broken refrain.
function theGardenRemembers(s, H) {
  const harmony = ['dm', 'bb', 'f', 'c', 'gm', 'bb', 'dm', 'a7'];
  harmony.forEach((h, cell) => {
    const beat = cell * 9;
    s.note(beat, 2, H[h].bass + 12, 'piano', cell === 0 ? .22 : .28, -.28, 'bass');
    s.chord(beat + 1.5, 2.2, H[h].notes.slice(0, 3), 'guitar', .23, -.2, .07);
    if (cell > 0) s.chord(beat + 4.5, 2.1, H[h].notes.slice(1, 3), 'guitar', .2, -.14, .07);
    if ([1, 3, 5].includes(cell)) s.chord(beat, 7, [H[h].notes[0], H[h].notes[2]], 'bowed', .16, -.04);
  });
  s.phrase(4, [[0, 1.2, 69], [2, .7, 65], [3, 1.5, 62], [6, 1.3, 65],
    [8, .7, 69], [9, 2, 70], [12.5, 1, 69], [15, 2.2, 65]], 'piano', .45, 0, .1);
  s.phrase(26, [[0, 1.1, 67], [2, .8, 65], [3, 2, 64], [7, 1.4, 62], [10, 2.2, 65]], 'bell', .29, 0, .25);
  s.phrase(43, [[0, 1.5, 70], [2.5, 1, 74], [4, 2, 77], [7.5, 1.1, 74],
    [10, 1.4, 72], [13, 2.5, 69]], 'piano', .48, 0, .1);
  s.phrase(62, [[0, 1.4, 67], [2.5, .8, 65], [4, 2, 61], [8, 2.2, 64]], 'guitar', .41, 0, .13);
  s.chord(76, 5, [53, 57, 62], 'bowed', .17, -.1, .06);
  s.phrase(77, [[0, 1.3, 65], [2.5, 1.5, 69], [6, 2.8, 62]], 'piano', .35, 0, .06);
  s.note(89, 2.6, 62, 'guitar', .27, -.05, 'melody');
}

// ALIEN HOMEWORLDS: two interlocking but incomplete patterns find a shared
// refrain. It is a welcoming civic piece, not a caricature or a danger cue.
// Avel and Hadrun retain their ordinary ocean/desert music in the same pool.
function theCommonHorizon(s, H) {
  const harmony = ['eb', 'eb', 'gm', 'gm', 'bb', 'bb', 'f', 'f', 'eb', 'gm', 'bb', 'c',
    'f9', 'f9', 'bb', 'c', 'eb', 'gm', 'bb', 'f', 'eb', 'eb', 'eb', 'eb'];
  harmony.forEach((h, bar) => {
    const beat = bar * 4;
    if (bar % 2 === 0) s.chord(beat, bar < 20 ? 6.2 : 4, [H[h].notes[0], H[h].notes[2]], 'organ', .18, -.1);
    if (bar >= 2 && bar < 20 && bar % 4 !== 3) {
      s.note(beat + .5, .75, H[h].notes[1], 'pluck', .24, -.25);
      s.note(beat + 2, .65, H[h].notes[2], 'pluck', .22, -.18);
      s.note(beat + 3.25, .45, H[h].notes[0], 'guitar', .21, .2);
    }
    if ([4, 8, 12, 16].includes(bar)) s.note(beat, 2.5, H[h].bass, 'bass', .27, 0, 'bass');
    if (bar >= 8 && bar < 18 && bar % 2 === 0) s.note(beat + 2.75, .18, 37, 'rim', .12, .15, 'rhythm');
  });
  s.phrase(4, [[0, 1.1, 67], [2, .6, 70], [3.25, 1.5, 72], [6, 1.1, 67], [8.5, 2, 63]], 'piano', .45, 0, .08);
  s.phrase(20, [[0, 1.5, 65], [3, 1, 70], [5, 1.8, 74], [8.5, 1.1, 72], [11, 2, 69]], 'guitar', .47, 0, .18);
  s.phrase(37, [[0, 1.1, 70], [2, .75, 72], [3.5, 1.5, 75], [6.5, 1.3, 74], [9, 2.2, 70]], 'piano', .49, 0, .06);
  s.phrase(53, [[0, 1.2, 72], [2.25, .75, 76], [4, 1.8, 77], [7.5, 1.1, 74], [10, 2.2, 72]], 'guitar', .47, 0, .17);
  s.phrase(70, [[0, 1.2, 70], [2.5, 1, 67], [5, 1.7, 65], [8, 2.3, 63]], 'piano', .42, 0, .08);
  s.phrase(86, [[0, 1.4, 67], [3, 2.5, 63]], 'guitar', .3, 0, .1);
}

export const ENVIRONMENT_COMPOSITIONS = Object.freeze([
  composition('under-the-first-ridge', 'Under the First Ridge', 'cave', 16, 56, 420, ['cave', 'barren', 'stone'], .12, underTheFirstRidge),
  composition('water-between-walls', 'Water Between Walls', 'cave', 20, 64, 420, ['cave', 'ocean', 'water'], .15, waterBetweenWalls),
  composition('basalt-letters', 'Basalt Letters', 'cave', 16, 58, 420, ['cave', 'volcanic', 'stone'], .14, basaltLetters),
  composition('a-little-room-below', 'A Little Room Below', 'cave', 20, 72, 420, ['cave', 'temperate', 'forest'], .18, aLittleRoomBelow),
  composition('the-long-quiet-seam', 'The Long Quiet Seam', 'cave', 20, 60, 480, ['cave', 'ice', 'ruin'], .11, theLongQuietSeam),
  composition('rain-over-morrow', 'Rain Over Morrow', 'planet', 24, 72, 480, ['planet', 'temperate', 'warm'], .24, rainOverMorrow),
  composition('orchards-in-orbit', 'Orchards in Orbit', 'planet', 24, 80, 480, ['planet', 'forest', 'garden'], .26, orchardsInOrbit),
  composition('roads-of-violet-dust', 'Roads of Violet Dust', 'planet', 24, 76, 480, ['planet', 'desert', 'travel'], .25, roadsOfVioletDust),
  composition('the-tide-keeps-time', 'The Tide Keeps Time', 'planet', 24, 78, 480, ['planet', 'ocean', 'water'], .23, theTideKeepsTime),
  composition('the-white-distance', 'The White Distance', 'planet', 20, 62, 540, ['planet', 'ice', 'cold'], .16, theWhiteDistance),
  composition('embers-below-the-road', 'Embers Below the Road', 'planet', 24, 84, 480, ['planet', 'volcanic', 'stone'], .29, embersBelowTheRoad),
  composition('windows-after-shift', 'Windows After Shift', 'planet', 24, 88, 480, ['planet', 'industrial', 'settlement'], .28, windowsAfterShift),
  composition('small-sky-on-a-moon', 'Small Sky on a Moon', 'planet', 20, 66, 540, ['planet', 'barren', 'solitude'], .17, smallSkyOnAMoon),
  composition('the-garden-remembers', 'The Garden Remembers', 'planet', 24, 74, 540, ['planet', 'ruin', 'earth', 'ancient'], .21, theGardenRemembers),
  composition('the-common-horizon', 'The Common Horizon', 'planet', 24, 82, 480,
    ['planet', 'alien', 'homeworld', 'avel-tidewards', 'hadrun-courtyards'], .25, theCommonHorizon),
]);
