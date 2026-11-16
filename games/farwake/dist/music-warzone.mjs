/**
 * Three original, instrumental metal pieces for Crosswind.
 *
 * Each has a written riff, contrasting middle, returning hook and an ending.
 * Thrash picking, displaced low-string accents and harmonized leads are broad
 * musical influences; no borrowed recording, melody or lyric is used here.
 * Performance variation belongs to the score renderer, never to the notes.
 */

const piece = (id, title, bars, bpm, tags, intensity, build) => Object.freeze({
  id, title, family: 'combat', bars, bpm, cooldownSeconds: 300,
  tags: Object.freeze(['combat', 'crosswind', 'ship', 'ground', ...tags]), intensity, build,
});

const DRUM = Object.freeze({
  metalKick: [36, .12, 0], metalSnare: [38, .16, -.08], metalHat: [42, .055, .27],
  metalCrash: [49, .8, -.32], metalTom: [45, .23, .15],
});
function drum(s, beat, instrument, velocity = .68, pan) {
  const [midi, duration, position] = DRUM[instrument];
  s.note(beat, duration, midi, instrument, velocity, pan ?? position, 'rhythm');
}
function bass(s, beat, root, offsets = [0, 1, 2, 3], velocity = .66) {
  offsets.forEach((offset, index) => s.note(beat + offset, .32, root - 12,
    'metalBass', velocity * (index ? .89 : 1), 0, 'bass'));
}
function riff(s, beat, root, notes, level = .72, fifths = true) {
  for (const [offset, duration, interval = 0, accent = false] of notes) {
    s.note(beat + offset, duration, root + interval, 'metalChug', level * (accent ? 1 : .84), -.31, 'riff');
    if (accent && fifths) s.note(beat + offset + .012, duration, root + interval + 7,
      'metalChug', level * .65, .34, 'accompaniment');
  }
}
function lead(s, beat, notes, velocity = .66, transpose = 0, pan = .12, part = 'melody') {
  s.phrase(beat, notes, 'metalLead', velocity, transpose, pan, part);
}
function fill(s, beat, level = .58) {
  drum(s, beat + 2.75, 'metalSnare', level * .75);
  drum(s, beat + 3.25, 'metalTom', level, -.18);
  drum(s, beat + 3.5, 'metalTom', level * .9, .12);
  drum(s, beat + 3.75, 'metalSnare', level);
}

// Four short figures make the E-pedal riff legible at speed. The flat second
// and tritone answer it; their placement and the turnarounds are fully authored.
const THRASH_A = [[0,.16,0,true],[.25,.14,0],[.5,.16,0],[.75,.14,1],
  [1,.16,0,true],[1.25,.14,0],[1.5,.2,6],[2,.16,0,true],[2.25,.14,0],
  [2.5,.16,0],[2.75,.14,5],[3,.2,3,true],[3.5,.16,1],[3.75,.14,0]];
const THRASH_B = [[0,.36,0,true],[.75,.2,3],[1,.16,0],[1.25,.16,0],
  [1.5,.3,1,true],[2.25,.2,6],[2.5,.16,5],[3,.3,3,true],[3.5,.2,1]];
const THRASH_STOP = [[0,.42,0,true],[1.5,.25,0,true],[2.25,.2,6],[3.5,.26,1,true]];
const CORRIDOR_HOOK = [[0,.28,76],[.5,.23,77],[.75,.35,70],[1.5,.42,71],
  [2.5,.25,74],[3,.6,76],[4,.38,79],[4.75,.26,77],[5.25,.48,76],[6.5,.3,74],[7,.6,70],
  [8,.26,76],[8.5,.25,77],[9,.55,79],[10,.3,82],[10.75,.45,79],[12,.5,77],
  [13,.3,74],[13.75,.25,71],[14.5,.7,76]];
const CORRIDOR_ANSWER = [[0,.5,71],[1,.3,74],[1.75,.3,77],[2.5,.6,76],
  [4,.3,70],[4.5,.3,71],[5.25,.55,74],[6.5,.75,77],[8,.3,79],[8.5,.3,82],
  [9.25,.3,81],[10,.5,77],[11,.4,76],[12,.25,74],[12.5,.25,71],[13,.25,70],[14,.9,64]];

function killCorridor(s) {
  for (let bar = 0; bar < 96; bar++) {
    const beat = bar * 4, suspended = bar >= 48 && bar < 56, ending = bar >= 92;
    const turnaround = bar >= 24 && bar < 32 || bar >= 88 && bar < 92;
    const root = suspended ? 40 : bar >= 32 && bar < 48 ? [40,43,38,41,40,46,43,41][bar % 8]
      : [40,40,41,40,40,43,46,41][bar % 8];
    const figure = ending ? [[0,bar === 95 ? 2.8 : .5,bar === 95 ? 0 : bar % 2 ? 1 : 0,true],
      ...(bar === 95 ? [] : [[2,.25,0,true],[3,.2,0]])] : suspended ? THRASH_STOP : turnaround ? THRASH_B : THRASH_A;
    riff(s, beat, ending ? 40 : root, figure, ending ? .69 : .74);
    bass(s, beat, ending ? 40 : root, ending ? [0] : suspended ? [0,1.5,3.5] : [0,1,2,3], .67);
    if (ending) {
      drum(s, beat, 'metalKick', .7); if (bar < 95) drum(s, beat + 2, 'metalSnare', .72);
    } else if (suspended) {
      for (const offset of [0,1.5,2.25,3.5]) drum(s, beat + offset, 'metalKick', .72);
      drum(s, beat + 2, 'metalSnare', .79);
      for (const offset of [.5,2.5]) drum(s, beat + offset, 'metalTom', .48, offset < 2 ? -.2 : .2);
    } else {
      for (const offset of [0,.5,1.5,2,2.5,3.5]) drum(s, beat + offset, 'metalKick', offset % 1 ? .57 : .73);
      for (const offset of [1,3]) drum(s, beat + offset, 'metalSnare', .72);
      for (let index = 0; index < 8; index++) drum(s, beat + index * .5, 'metalHat', index % 2 ? .36 : .44);
      if (bar % 8 === 7 && bar < 88) fill(s, beat, .54);
    }
    if ([0,8,24,32,48,56,72,88,95].includes(bar)) drum(s, beat + .035, 'metalCrash', .48);
  }
  lead(s, .5, CORRIDOR_HOOK, .63);
  for (const beat of [32,64,288,320]) lead(s, beat, CORRIDOR_HOOK, .68);
  for (const beat of [128,160]) lead(s, beat, CORRIDOR_ANSWER, .66);
  lead(s, 216, [[0,.35,70],[.75,.35,71],[1.5,.35,74],[3,.8,76]], .58);
  const solo = [[0,.2,76],[.25,.2,79],[.5,.2,77],[.75,.2,76],[1,.4,74],[2,.3,77],
    [2.5,.3,79],[3,.65,82],[4,.22,83],[4.5,.22,82],[5,.25,79],[5.5,.25,77],
    [6,.8,76],[8,.3,74],[8.5,.25,77],[9,.3,76],[9.5,.25,71],[10,.5,70],[11,.3,71],
    [12,.35,74],[12.75,.3,77],[13.5,.3,79],[14.5,.85,76]];
  lead(s, 224, solo, .7, 0, -.12); lead(s, 256, CORRIDOR_ANSWER, .69, 0, .24);
  lead(s, 352, [[0,.35,79],[.75,.35,77],[1.5,.6,76],[4,.3,74],[5,.4,71],[6.5,.65,70],
    [8,.6,76],[10,.5,77],[12,1.25,76]], .65);
  lead(s, 372, [[0,.4,70],[1,.4,71],[2,.7,76],[8,3.1,64]], .62);
}

// C is the low anchor. The 3+3+2 accents, rests and delayed snare give this
// piece its own lurch; a melodic answer briefly opens above the heavy pulse.
const TEETH_A = [[0,.2,0,true],[.25,.15,0],[.75,.3,0],[1.5,.2,0,true],
  [1.75,.14,0],[2.5,.3,1],[3.25,.2,0,true],[3.5,.2,6]];
const TEETH_B = [[0,.5,0,true],[1,.22,3],[1.75,.28,1,true],[2.5,.3,0],[3.25,.42,6,true]];
const TEETH_BREAK = [[0,.4,0,true],[1.25,.18,0],[1.5,.18,0],[2.75,.38,1,true]];
const TEETH_HOOK = [[0,.55,60],[1.5,.35,61],[2.25,.65,67],[4,.45,63],[5.5,.45,60],
  [7,.75,58],[8,.55,60],[9.5,.3,61],[10.25,.65,66],[12,.45,63],[13,.35,61],[14.5,.85,60]];
const TEETH_ANSWER = [[0,.65,72],[1.5,.4,75],[3,.7,73],[4.5,.55,70],[6,.9,67],
  [8,.45,66],[9,.45,70],[10.5,.65,73],[12,.5,72],[13.5,1.2,67]];

function ironTeeth(s) {
  for (let bar = 0; bar < 80; bar++) {
    const beat = bar * 4, broken = bar >= 40 && bar < 48, machinery = bar >= 48 && bar < 56;
    const wide = bar >= 24 && bar < 40 || bar >= 64 && bar < 76, ending = bar >= 76;
    const root = wide ? [36,39,37,42,36,41,39,37][bar % 8] : [36,36,36,37,36,36,42,37][bar % 8];
    riff(s, beat, ending ? 36 : root, ending ? [[0,bar === 79 ? 2.9 : .4,0,true],
      ...(bar === 79 ? [] : [[1.5,.3,1,true],[3,.3,0]])] : broken ? TEETH_BREAK : wide ? TEETH_B : TEETH_A, .76);
    bass(s, beat, ending ? 36 : root, ending ? [0] : broken ? [0,2.75] : [0,1.5,3.25], .7);
    const kick = ending ? [0] : broken ? [0,1.25,1.5,2.75] : machinery ? [0,.75,1.5,2.5,3.25,3.5] : [0,.25,1.5,1.75,3.25];
    for (const offset of kick) drum(s, beat + offset, 'metalKick', offset === 0 ? .77 : .63);
    if (bar < 79) drum(s, beat + 2, 'metalSnare', .8);
    if (!broken && !ending) for (let index = 0; index < 8; index++) drum(s, beat + index * .5,
      'metalHat', index % 3 === 0 ? .43 : .32);
    if ((machinery || bar % 4 === 3) && !ending) {
      drum(s, beat + 1, 'metalTom', .48, -.24); drum(s, beat + 3, 'metalTom', .55, .24);
    }
    if (bar % 8 === 7 && bar < 72 && !broken) fill(s, beat, .55);
    if ([0,8,24,40,48,56,64,76,79].includes(bar)) drum(s, beat + .04, 'metalCrash', .52);
  }
  lead(s, .75, TEETH_HOOK, .62, 0, -.15);
  for (const beat of [32,64,256,288]) lead(s, beat, TEETH_HOOK, .67, 0, -.12);
  for (const beat of [96,128]) lead(s, beat, TEETH_ANSWER, .68, 0, .2);
  lead(s, 176, [[0,.3,60],[1.25,.3,61],[2.75,.45,66],[4,.3,60],[5.5,.3,61],[7,1.1,60]], .59);
  lead(s, 192, [[0,.2,72],[.75,.2,73],[1.5,.2,78],[3,.7,75],[4,.25,72],[4.75,.25,73],
    [5.5,.35,75],[7,.75,70],[8,.3,72],[9.5,.3,78],[10.5,.6,73],[12,1,67]], .66);
  lead(s, 224, TEETH_ANSWER, .69);
  lead(s, 304, [[0,.55,66],[1.5,.5,63],[3,.6,61],[4,.8,60],[6,.6,58],[8,.8,61],[12,3.2,60]], .65);
}

// D minor carries a separate, singable lead over a galloping rhythm. Written
// harmony notes answer in thirds/sixths; they do not continuously double every
// lead, leaving the breakdown and the two short solos distinct in texture.
const ORBIT_GALLOP = [[0,.18,0,true],[.5,.16,0],[.75,.14,0],[1,.35,7],
  [1.75,.16,3],[2,.18,0,true],[2.5,.16,0],[2.75,.14,0],[3,.3,5],[3.5,.2,3]];
const ORBIT_OPEN = [[0,.65,0,true],[1,.28,7],[1.75,.3,0],[2.5,.6,3,true],[3.5,.26,5]];
const ORBIT_BREAK = [[0,.4,0,true],[1.5,.2,0,true],[2,.2,1],[3,.25,0,true],[3.5,.2,0]];
const ORBIT_HOOK = [[0,.5,74],[.75,.3,77],[1.5,.6,76],[2.5,.35,72],[3.25,.5,69],
  [4,.5,72],[5,.7,74],[6.25,.35,77],[7,.65,81],[8,.65,79],[9,.3,77],
  [9.75,.4,76],[10.5,.75,72],[12,.4,74],[12.75,.35,73],[13.5,.6,69],[14.5,1.1,74]];
const ORBIT_HARMONY = [[0,.5,69],[.75,.3,74],[1.5,.6,72],[2.5,.35,67],[3.25,.5,65],
  [4,.5,67],[5,.7,69],[6.25,.35,74],[7,.65,77],[8,.65,76],[9,.3,74],
  [9.75,.4,72],[10.5,.75,67],[12,.4,69],[12.75,.35,69],[13.5,.6,64],[14.5,1.1,69]];
const ORBIT_ANSWER = [[0,.6,81],[1,.35,79],[1.75,.5,77],[3,.7,74],[4.5,.45,76],
  [5.25,.4,79],[6,1,82],[8,.3,81],[8.75,.4,77],[9.5,.8,76],[11,.3,73],
  [12,.5,74],[13,.4,77],[14,1.3,81]];

function ashesInOrbit(s) {
  for (let bar = 0; bar < 96; bar++) {
    const beat = bar * 4, broken = bar >= 48 && bar < 56, solo = bar >= 56 && bar < 72;
    const broad = bar >= 32 && bar < 48 || bar >= 88 && bar < 92, ending = bar >= 92;
    const root = broken || ending ? 38 : (broad ? [43,46,38,45,43,41,46,45] : [38,46,41,36,38,43,46,45])[bar % 8];
    riff(s, beat, root, ending ? [[0,bar === 95 ? 2.9 : .5,0,true],
      ...(bar === 95 ? [] : [[2,.4,0,true],[3,.3,7]])] : broken ? ORBIT_BREAK : broad ? ORBIT_OPEN : ORBIT_GALLOP, .72);
    bass(s, beat, root, ending ? [0] : broken ? [0,1.5,3] : [0,2,3.5], .67);
    for (const offset of ending ? [0] : broken ? [0,1.5,2,3,3.5] : [0,.5,.75,2,2.5,2.75]) drum(s, beat + offset, 'metalKick', offset % 1 ? .54 : .7);
    for (const offset of ending ? bar === 95 ? [] : [2] : broken ? [2] : [1,3]) drum(s, beat + offset, 'metalSnare', broken ? .79 : .7);
    if (!ending) for (let index = 0; index < (broken ? 4 : 8); index++) drum(s, beat + index * (broken ? 1 : .5), 'metalHat', index % 2 ? .32 : .42);
    if (bar % 8 === 7 && !broken && bar < 88) fill(s, beat, .53);
    if (solo && bar % 4 === 3) drum(s, beat + 3.25, 'metalTom', .49, .2);
    if ([0,8,24,32,48,56,64,72,88,95].includes(bar)) drum(s, beat + .035, 'metalCrash', .49);
  }
  lead(s, .5, ORBIT_HOOK, .65, 0, -.14);
  for (const beat of [32,64,96,288,320]) {
    lead(s, beat, ORBIT_HOOK, .69, 0, -.19);
    if (beat !== 64) lead(s, beat + .02, ORBIT_HARMONY, .46, 0, .25, 'answer');
  }
  for (const beat of [128,160]) lead(s, beat, ORBIT_ANSWER, .7, 0, .17);
  lead(s, 208, [[0,.3,74],[1.5,.35,73],[3,.6,69],[4,.4,70],[5.5,.3,73],[7,.7,74]], .61);
  const soloA = [[0,.22,74],[.5,.22,77],[1,.22,81],[1.5,.3,79],[2,.45,77],
    [3,.4,76],[4,.25,73],[4.5,.25,76],[5,.25,79],[5.5,.35,82],[6.25,.8,81],
    [8,.3,86],[8.75,.3,84],[9.5,.4,81],[10.25,.35,79],[11,.5,77],
    [12,.3,76],[12.75,.3,73],[13.5,.45,69],[14.5,.9,74]];
  lead(s, 224, soloA, .71, 0, -.24);
  lead(s, 256, ORBIT_ANSWER, .69, 0, .2);
  lead(s, 256.02, [[0,.6,77],[1,.35,76],[1.75,.5,74],[3,.7,69],
    [8,.3,77],[8.75,.4,74],[9.5,.8,72],[11,.3,69],[12,.5,69],[13,.4,74],[14,1.3,77]], .45, 0, -.2, 'answer');
  lead(s, 352, [[0,.5,81],[1,.4,79],[2,.6,77],[4,.5,76],[5.5,.4,73],[7,.8,74],
    [8,.6,77],[9.5,.5,76],[11,.5,73],[12,1.7,74]], .67);
  lead(s, 372, [[0,.5,77],[1,.5,76],[2,.8,73],[8,3.1,74]], .65);
}

export const WARZONE_COMPOSITIONS = Object.freeze([
  piece('crosswind-kill-corridor', 'Kill Corridor', 96, 178, ['thrash', 'chromatic', 'metal'], .95, killCorridor),
  piece('crosswind-iron-teeth', 'Iron Teeth', 80, 142, ['groove', 'syncopated', 'metal'], .92, ironTeeth),
  piece('crosswind-ashes-in-orbit', 'Ashes in Orbit', 96, 166, ['melodic-metal', 'harmonized-leads', 'metal'], .93, ashesInOrbit),
]);

export const WARZONE_CUE_IDS = Object.freeze(WARZONE_COMPOSITIONS.map(cue => cue.id));
