// Original Pocket Sports score and crowd synthesis. No samples or melodies
// from broadcasts are used. Mono 22.05kHz buffers keep mobile playback cheap.
export const AUDIO_SAMPLE_RATE = 22050;
export const THEME_BPM = 118;
export const THEME_BEATS = 32;
export const THEME_SECONDS = THEME_BEATS * 60 / THEME_BPM;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rate = value => clamp(Math.round(Number(value) || AUDIO_SAMPLE_RATE), 8000, 48000);
const midi = note => 440 * 2 ** ((note - 69) / 12);
const rng = seed => { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; };

function add(data, sampleRate, start, duration, synth, level = 1) {
  const from = Math.max(0, Math.floor(start * sampleRate));
  const count = Math.min(Math.ceil(duration * sampleRate), data.length - from);
  for (let i = 0; i < count; i++) data[from + i] += synth(i / sampleRate, i, duration) * level;
}
function finish(data, sampleRate, peak = .88, room = false) {
  if (room) {
    // Finite taps supply a little arena depth without a running effect graph.
    const dry = data.slice();
    for (const [seconds, gain] of [[.073, .1], [.137, .065], [.223, .035]]) {
      const delay = Math.round(seconds * sampleRate);
      for (let i = delay; i < data.length; i++) data[i] += dry[i - delay] * gain;
    }
  }
  let max = .001;
  for (let i = 0; i < data.length; i++) { data[i] = Math.tanh(data[i] * 1.1); max = Math.max(max, Math.abs(data[i])); }
  const gain = peak / max, fade = Math.max(1, Math.round(sampleRate * .009));
  for (let i = 0; i < data.length; i++) data[i] *= gain * Math.min(1, i / fade, (data.length - 1 - i) / fade);
  return data;
}
function brass(data, sampleRate, at, note, duration, level) {
  const frequency = midi(note);
  add(data, sampleRate, at, duration, (t, _i, length) => {
    const envelope = Math.min(1, t / .025) * Math.min(1, (length - t) / .11) * (.8 + .2 * Math.exp(-t * 9));
    const phase = TAU * frequency * t + Math.sin(t * TAU * 4.9) * .013;
    const bright = .25 + .35 * Math.exp(-t * 7);
    return envelope * (Math.sin(phase) + Math.sin(phase * 1.004) * .24
      + Math.sin(phase * 2) * bright + Math.sin(phase * 3) * .14 + Math.sin(phase * 4) * .045);
  }, level);
}
function bass(data, sampleRate, at, note, duration, level) {
  const frequency = midi(note);
  add(data, sampleRate, at, duration, (t, _i, length) => Math.min(1, t / .008)
    * Math.min(1, (length - t) / .07) * Math.exp(-t * 2)
    * (Math.sin(TAU * frequency * t) + .22 * Math.sin(TAU * frequency * 2 * t)), level);
}
function kick(data, sampleRate, at, level) {
  add(data, sampleRate, at, .21, t => Math.sin(TAU * (45 * t + 7 * (1 - Math.exp(-t * 28)))) * Math.exp(-t * 22), level);
}
function snare(data, sampleRate, at, level, random) {
  let previous = 0;
  add(data, sampleRate, at, .19, t => {
    const noise = random() * 2 - 1, high = noise - previous * .7; previous = noise;
    return (high * .65 + Math.sin(TAU * 181 * t) * .2) * Math.exp(-t * 23) * Math.min(1, t / .003);
  }, level);
}
function hat(data, sampleRate, at, open, level, random) {
  let previous = 0;
  add(data, sampleRate, at, open ? .18 : .065, t => {
    const noise = random() * 2 - 1, high = noise - previous; previous = noise;
    return high * Math.exp(-t * (open ? 26 : 68));
  }, level);
}

/** Eight original bars: bright brass/synth, syncopated bass, drums and fills. */
export function createThemePCM(requestedRate = AUDIO_SAMPLE_RATE) {
  const sampleRate = rate(requestedRate), beat = 60 / THEME_BPM;
  const data = new Float32Array(Math.ceil(THEME_SECONDS * sampleRate)), random = rng(20040917);
  const harmony = [[50, 62, 65, 69], [46, 58, 62, 65], [53, 60, 65, 69], [48, 60, 64, 67],
    [43, 58, 62, 67], [46, 58, 62, 65], [45, 57, 62, 64], [50, 62, 65, 69]];
  const melody = [
    [[0,62,.7],[1.5,69,.28],[2.25,67,.46],[3,65,.65]],
    [[0,72,.6],[1,69,.38],[2.5,64,.27],[3.25,65,.42]],
    [[.5,70,.45],[1.5,74,.33],[2.25,72,.42],[3.25,67,.48]],
    [[0,69,1.15],[2,76,.38],[3,72,.7]],
    [[0,74,.5],[.75,69,.45],[2,77,.4],[2.75,76,.25],[3.25,74,.5]],
    [[.5,67,.48],[1.25,70,.4],[2.25,74,.6],[3.25,72,.4]],
    [[0,76,.7],[1.5,74,.4],[2.25,69,.48],[3.5,67,.25]],
    [[0,65,.48],[.75,64,.25],[1.5,69,.4],[2.25,72,.48],[3.25,74,.5]],
  ];
  for (let bar = 0; bar < 8; bar++) {
    const start = bar * 4 * beat, [root, ...chord] = harmony[bar];
    for (const offset of [0, 2.75]) for (const note of chord)
      brass(data, sampleRate, start + offset * beat, note, beat * .62, .055);
    for (const [offset, note, length] of melody[bar])
      brass(data, sampleRate, start + offset * beat, note, length * beat, .135);
    for (const [offset, note] of [[0,root-12],[.75,root-12],[1.75,root],[2.5,root-5],[3.25,root-12]])
      bass(data, sampleRate, start + offset * beat, note, beat * .49, .24);
    for (const offset of [0, 1.5, 2, ...(bar % 2 ? [3.25] : [])]) kick(data, sampleRate, start + offset * beat, .42);
    for (const offset of [1, 3]) snare(data, sampleRate, start + offset * beat, .2, random);
    for (let eighth = 0; eighth < 8; eighth++)
      hat(data, sampleRate, start + eighth * beat / 2, eighth === 7 && bar % 2 === 1, eighth % 2 ? .035 : .05, random);
    if (bar === 3 || bar === 7) for (const [offset, frequency] of [[2.5,160],[2.75,132],[3.5,100]])
      add(data, sampleRate, start + offset * beat, .19, t => Math.sin(TAU * frequency * t * (1 - t * .3)) * Math.exp(-t * 15), .16);
  }
  return finish(data, sampleRate, .86, true);
}

const VOWELS = {
  oo: [[360, 105, 1], [900, 160, .8], [2250, 280, .3]],
  ah: [[740, 145, 1], [1240, 200, .72], [2600, 300, .3]],
};
function voiceTable(frequency, vowel) {
  const table = new Float32Array(1024), formants = VOWELS[vowel];
  for (let harmonic = 1; harmonic <= 28; harmonic++) {
    const pitch = harmonic * frequency;
    if (pitch > 6500) break;
    const amplitude = .045 / harmonic + formants.reduce((sum, [center, width, gain]) =>
      sum + Math.exp(-.5 * ((pitch - center) / width) ** 2) * gain, 0) / Math.sqrt(harmonic);
    for (let i = 0; i < table.length; i++) table[i] += Math.sin(TAU * harmonic * i / table.length) * amplitude;
  }
  let peak = .001; for (const value of table) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < table.length; i++) table[i] /= peak;
  return table;
}
function voice(data, sampleRate, at, duration, frequency, kind, level, random) {
  const oo = voiceTable(frequency, 'oo'), ah = voiceTable(frequency, 'ah');
  const vibrato = 3.3 + random() * 2.2, phaseOffset = random() * TAU;
  let phase = random() * 1024, breath = 0;
  add(data, sampleRate, at, duration, (t, _i, length) => {
    const u = t / length;
    const envelope = Math.min(1, t / (kind === 'boo' ? .16 : .11)) * Math.min(1, (length - t) / .3);
    const bend = kind === 'ooh' ? 1 + .14 * Math.sin(Math.PI * u)
      : kind === 'ah' ? 1.08 - .27 * u : kind === 'boo' ? 1 - .1 * u : 1 + .18 * Math.sin(Math.PI * u * 1.4);
    phase = (phase + frequency * bend * (1 + Math.sin(t * TAU * vibrato + phaseOffset) * .009) / sampleRate * 1024) % 1024;
    const index = Math.floor(phase), fraction = phase - index, next = (index + 1) % 1024;
    const mouth = kind === 'ah' ? .8 : kind === 'cheer' ? .25 + .65 * Math.sin(Math.PI * u) : .04;
    const closed = oo[index] + (oo[next] - oo[index]) * fraction;
    const open = ah[index] + (ah[next] - ah[index]) * fraction;
    breath = breath * .65 + (random() * 2 - 1) * .35;
    return envelope * ((closed * (1 - mouth) + open * mouth) * .94 + breath * .06);
  }, level);
}

/** Collective vowels are voiced harmonic sources; noise is only a soft layer. */
export function createCrowdReactionPCM(kind, requestedRate = AUDIO_SAMPLE_RATE) {
  const sampleRate = rate(requestedRate), name = ['ooh', 'ah', 'boo', 'cheer'].includes(kind) ? kind : 'ooh';
  const duration = { ooh: 1.18, ah: 1.32, boo: 1.85, cheer: 2.05 }[name];
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  const random = rng({ ooh: 1703, ah: 3217, boo: 9221, cheer: 7321 }[name]);
  const count = name === 'cheer' ? 8 : 6;
  for (let i = 0; i < count; i++) {
    const at = random() * .11, length = duration - at - .08 - random() * .2;
    const frequency = name === 'boo' ? 92 + random() * 55 : name === 'cheer' ? 160 + random() * 150 : 125 + random() * 95;
    voice(data, sampleRate, at, length, frequency, name, .5 / Math.sqrt(count), random);
  }
  if (name === 'cheer') for (const at of [.12,.24,.39,.54,.72,.91,1.13,1.4])
    snare(data, sampleRate, at, .09, random);
  return finish(data, sampleRate, .85, true);
}

export function createCrowdBedPCM(requestedRate = AUDIO_SAMPLE_RATE) {
  const sampleRate = rate(requestedRate), data = new Float32Array(sampleRate * 6), random = rng(43581);
  let low = 0, mid = 0;
  for (let i = 0; i < data.length; i++) {
    const white = random() * 2 - 1;
    low = low * .985 + white * .015; mid = mid * .72 + white * .28;
    data[i] = (low * 1.7 + mid * .16) * (.85 + .15 * Math.sin(i / sampleRate * TAU / 6));
  }
  // Quiet overlapping conversations make the texture feel populated instead
  // of using a loud unvoiced hiss as a substitute for people.
  for (let i = 0; i < 13; i++) {
    const start = .1 + i * .38;
    voice(data, sampleRate, start, .55 + random() * .25, 105 + random() * 130,
      i % 3 ? 'ooh' : 'ah', .022, random);
  }
  return finish(data, sampleRate, .65);
}
