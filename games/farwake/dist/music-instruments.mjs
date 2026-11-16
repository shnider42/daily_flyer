/** Compact, shared instrument bank for Farwake’s authored score. */
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

// Samples and periodic waves are shared between crossfading players in one
// AudioContext. New compositions reuse the existing instrument samples and
// native-rate stereo reverb. Two players crossfading in that context share
// those buffers; the catalog does not create a separate bank for each piece.
const ASSETS = new WeakMap();
export const SAMPLE_CACHE_LIMIT = 48;
export const SAMPLE_CACHE_BYTES = 20 * 1024 * 1024;
const midiHz = midi => 440 * 2 ** ((midi - 69) / 12);
const INSTRUMENT = Object.freeze({
  piano: { gain: .135, release: .7, reverb: .17, echo: .065, cutoff: 6300 },
  felt: { gain: .15, release: .85, reverb: .21, echo: .025, cutoff: 4600 },
  guitar: { gain: .175, release: .7, reverb: .18, echo: .13, cutoff: 5100 },
  pluck: { gain: .12, release: .28, reverb: .12, echo: .035 },
  mallet: { gain: .105, release: .75, reverb: .18, echo: .065, cutoff: 6500 },
  bell: { gain: .095, release: .8, reverb: .22, echo: .07 },
  bass: { gain: .18, release: .14, reverb: .015, echo: 0, cutoff: 1800 },
  pad: { gain: .038, release: 1.2, reverb: .25, echo: .02, cutoff: 2800 },
  organ: { gain: .06, release: .4, reverb: .17, echo: .03, cutoff: 3800 },
  bowed: { gain: .05, release: 1.3, reverb: .3, echo: .06, cutoff: 3400 },
  reed: { gain: .085, release: .38, reverb: .19, echo: .045, cutoff: 3300 },
  analog: { gain: .072, release: .45, reverb: .15, echo: .12, cutoff: 2900 },
  kick: { gain: .18, release: .05, reverb: .015, echo: 0 },
  snare: { gain: .095, release: .06, reverb: .08, echo: 0 },
  hat: { gain: .056, release: .035, reverb: .06, echo: 0 },
  brush: { gain: .1, release: .08, reverb: .09, echo: 0 },
  rim: { gain: .085, release: .035, reverb: .075, echo: 0 },
  shimmer: { gain: .075, release: .4, reverb: .4, echo: .025 },
  // Short gates keep fast alternate-picked notes separate inside the existing
  // voice budget. These voices belong to the Crosswind arrangements only.
  metalChug: { gain: .16, release: .045, reverb: .025, echo: 0, cutoff: 5600 },
  metalLead: { gain: .105, release: .13, reverb: .105, echo: .035, cutoff: 6500 },
  metalBass: { gain: .18, release: .055, reverb: .008, echo: 0, cutoff: 2200 },
  metalKick: { gain: .22, release: .035, reverb: .008, echo: 0, cutoff: 7200 },
  metalSnare: { gain: .14, release: .065, reverb: .07, echo: 0, cutoff: 7900 },
  metalHat: { gain: .04, release: .025, reverb: .025, echo: 0, cutoff: 9100 },
  metalCrash: { gain: .052, release: .16, reverb: .09, echo: 0, cutoff: 8700 },
  metalTom: { gain: .125, release: .075, reverb: .065, echo: 0, cutoff: 5400 },
});

function makeBuffer(ctx, duration, fill, channels = 1, nativeRate = false) {
  // AudioBufferSourceNode resamples its buffer, but ConvolverNode requires an
  // impulse whose sample rate matches its AudioContext exactly.
  const sampleRate = nativeRate ? (ctx.sampleRate || 24000) : Math.min(ctx.sampleRate || 24000, 24000);
  const buffer = ctx.createBuffer(channels, Math.ceil(duration * sampleRate), sampleRate);
  for (let channel = 0; channel < channels; channel++) fill(buffer.getChannelData(channel), sampleRate, channel);
  return buffer;
}

function normalize(data, peak = .86, edgeFrames = 240) {
  const edge = Math.min(edgeFrames, Math.floor(data.length / 4));
  let highest = .0001, mean = 0, weights = 0;
  for (let i = 0; i < data.length; i++) {
    const weight = Math.min(1, i / edge, (data.length - 1 - i) / edge);
    mean += data[i] * weight; weights += weight;
  }
  mean /= weights;
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] - mean) * Math.min(1, i / edge, (data.length - 1 - i) / edge);
    highest = Math.max(highest, Math.abs(data[i]));
  }
  const scale = peak / highest;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}

// Modal oscillators advance by a recurrence: sample preparation does not need
// an expensive sine/exponential evaluation for every partial of every frame.
function modalTone(data, sr, frequency, modes, { attack = .004, tremolo = 0, noise = 0, seed = 1 } = {}) {
  const partials = modes.filter(([ratio]) => frequency * ratio < sr * .44).map(([ratio, amplitude, seconds]) => {
    const step = 2 * Math.PI * frequency * ratio / sr;
    return { current: 0, previous: -Math.sin(step), coefficient: 2 * Math.cos(step), amplitude, decay: Math.exp(-1 / (sr * seconds)) };
  });
  let onset = 1, hammer = 0, hammerEnvelope = noise;
  const attackDecay = Math.exp(-1 / (sr * attack)), hammerDecay = Math.exp(-1 / (sr * .028)), random = randomFor(seed);
  const pulseStep = 2 * Math.PI * 4.6 / sr, pulseCoefficient = 2 * Math.cos(pulseStep);
  let pulse = 1, priorPulse = Math.cos(pulseStep);
  for (let i = 0; i < data.length; i++) {
    let value = 0;
    for (let n = 0; n < partials.length; n++) {
      const part = partials[n], current = part.current;
      value += current * part.amplitude;
      part.current = part.coefficient * current - part.previous; part.previous = current; part.amplitude *= part.decay;
    }
    if (noise && hammerEnvelope > .000001) { hammer = hammer * .76 + (random() * 2 - 1) * .24; value += hammer * hammerEnvelope; hammerEnvelope *= hammerDecay; }
    const nextPulse = pulseCoefficient * pulse - priorPulse; priorPulse = pulse; pulse = nextPulse;
    data[i] = value * (1 - onset) * (1 - tremolo + tremolo * pulse); onset *= attackDecay;
  }
}

function electricPiano(ctx, midi, bright = false) {
  return makeBuffer(ctx, 4.8, (data, sr) => {
    modalTone(data, sr, midiHz(midi), [
      [1, 1, 1.85], [1.0007, .17, 2.1], [2, .13, .75],
      [2.002, bright ? .2 : .08, .35], [3.006, bright ? .19 : .085, .42], [5.011, bright ? .04 : .015, .12]
    ], { attack: .0035, tremolo: .025 });
    normalize(data, .87);
  });
}

function feltPiano(ctx, midi, bright = false) {
  return makeBuffer(ctx, 4.6, (data, sr) => {
    const amplitudes = [1, .42, .22, .11, .065, .032, .018, .009];
    const modes = amplitudes.map((amplitude, n) => [(n + 1) * Math.sqrt(1 + .000055 * (n + 1) ** 2), amplitude * (n ? bright ? 1 : .7 : 1), 2.05 / (1 + n * .72)]);
    modes.push([1.0009, .12, 1.85]);
    modalTone(data, sr, midiHz(midi), modes, { attack: .004, noise: .035, seed: `felt:${midi}` });
    normalize(data, .85);
  });
}

function pluckedString(ctx, midi, soft = false, bright = false) {
  const frequency = midiHz(midi), random = randomFor(midi * 31 + (soft ? 5 : 1));
  return makeBuffer(ctx, soft ? 2.8 : 5.8, (data, sr) => {
    // Karplus–Strong string with a fractional-delay all-pass correction. The
    // filter's half-sample delay is included to avoid sharp high-register notes.
    const exact = sr / frequency - .5, length = Math.floor(exact), fraction = exact - length;
    const ring = new Float32Array(length), coefficient = (1 - fraction) / (1 + fraction);
    let smooth = 0;
    for (let i = 0; i < length; i++) { smooth = smooth * (bright ? .35 : .62) + (random() * 2 - 1) * (bright ? .65 : .38); ring[i] = smooth * .54 + .32 * Math.sin(2 * Math.PI * i / length); }
    let cursor = 0, priorInput = 0, priorOutput = 0, lastRead = ring[length - 1];
    const step = 2 * Math.PI * frequency / sr, coefficient1 = 2 * Math.cos(step), coefficient2 = 2 * Math.cos(step * 2);
    let fundamental = 0, priorFundamental = -Math.sin(step), overtone = 0, priorOvertone = -Math.sin(step * 2);
    let stringEnvelope = 1, sustainEnvelope = 1;
    const stringDecay = Math.exp(-1 / (sr * (soft ? 1.1 : 4.1))), sustainDecay = Math.exp(-1 / (sr * 2.6));
    for (let i = 0; i < data.length; i++) {
      const current = ring[cursor], filtered = (current + lastRead) * .4993;
      lastRead = current;
      const delayed = coefficient * filtered + priorInput - coefficient * priorOutput;
      priorInput = filtered; priorOutput = delayed; ring[cursor] = delayed; cursor = (cursor + 1) % length;
      const t = i / sr, attack = Math.min(1, t / .003);
      // A little sustaining fundamental is characteristic of an amplified clean
      // string, and prevents the upper melody turning into a tiny percussion hit.
      const sustain = soft ? 0 : (.17 * fundamental + .038 * overtone) * sustainEnvelope;
      const nextFundamental = coefficient1 * fundamental - priorFundamental, nextOvertone = coefficient2 * overtone - priorOvertone;
      priorFundamental = fundamental; fundamental = nextFundamental; priorOvertone = overtone; overtone = nextOvertone;
      // Gentle pickup saturation fills out a sustained clean-string melody.
      const string = current * stringEnvelope + sustain, driven = string * 1.3, square = driven * driven;
      data[i] = attack * (soft ? string : driven * (27 + square) / (27 + 9 * square) / 1.3);
      stringEnvelope *= stringDecay; sustainEnvelope *= sustainDecay;
    }
    normalize(data, .85);
  });
}

function malletBuffer(ctx, midi) {
  return makeBuffer(ctx, 3.6, (data, sr) => {
    modalTone(data, sr, midiHz(midi), [[1, 1, 1.7], [4.002, .12, .24], [9.8, .035, .055]], { tremolo: .03 });
    normalize(data, .83);
  });
}

function bellBuffer(ctx) {
  return makeBuffer(ctx, 3.2, (data, sr) => {
    modalTone(data, sr, midiHz(72), [[1, 1, .95], [2.754, .2, .32], [5.02, .08, .14]], { attack: .002 });
    normalize(data, .82);
  });
}

function bassBuffer(ctx, midi = 40) {
  return makeBuffer(ctx, 3.8, (data, sr) => {
    modalTone(data, sr, midiHz(midi), [[1, 1, 1.95], [2, .29, .568], [3, .11, .318]], { attack: .008 });
    normalize(data, .9);
  });
}

function saturated(value) {
  const x = Math.max(-3, Math.min(3, value)), square = x * x;
  return x * (27 + square) / (27 + 9 * square);
}

/** Original pickup/amp voices, generated once per pitch zone and touch layer.
 * Twice-rate drive followed by a two-pole cabinet low-pass avoids turning the
 * strong upper harmonics into brittle foldover at the bank's 24 kHz rate. */
function metalString(ctx, midi, muted, bright) {
  return makeBuffer(ctx, muted ? .8 : 3.5, (data, sr) => {
    const workRate = sr * 2, driven = new Float32Array(data.length * 2), frequency = midiHz(midi);
    const modes = Array.from({ length: muted ? 14 : 12 }, (_, index) => {
      const harmonic = index + 1, pickup = harmonic % 2 ? 1 : .68;
      return [harmonic * Math.sqrt(1 + .000008 * harmonic * harmonic),
        pickup / harmonic ** .94, (muted ? .2 : 3.1) / (1 + index * (muted ? .19 : .11))];
    });
    modes.push([1.0015, .13, muted ? .115 : 2.2]);
    modalTone(driven, workRate, frequency, modes,
      { attack: muted ? .0009 : .0025, noise: bright ? .13 : .055, seed: `metal:${midi}:${muted}` });
    const preHighpass = Math.exp(-2 * Math.PI * (muted ? 48 : 70) / workRate);
    const cabinet = 1 - Math.exp(-2 * Math.PI * (bright ? muted ? 5400 : 6200 : muted ? 4200 : 5100) / workRate);
    let previousInput = 0, high = 0, first = 0, second = 0;
    const drive = muted ? bright ? 6.2 : 4.3 : bright ? 4.9 : 3.6;
    for (let i = 0; i < driven.length; i++) {
      const input = driven[i]; high = preHighpass * (high + input - previousInput); previousInput = input;
      const clipped = saturated(high * drive);
      first += cabinet * (clipped - first); second += cabinet * (first - second);
      if (i % 2) data[i >> 1] = second;
    }
    normalize(data, muted ? .87 : .85, Math.max(8, Math.floor(sr * .0008)));
  });
}

function metalBass(ctx, midi) {
  return makeBuffer(ctx, 2.5, (data, sr) => {
    modalTone(data, sr, midiHz(midi), [[1, 1, 1.35], [2, .34, .58], [3, .16, .3], [4, .07, .12]],
      { attack: .0015, noise: .018, seed: `metal-bass:${midi}` });
    let low = 0;
    const cabinet = 1 - Math.exp(-2 * Math.PI * 2300 / sr);
    for (let i = 0; i < data.length; i++) { low += cabinet * (saturated(data[i] * 2.3) - low); data[i] = low; }
    normalize(data, .89, Math.max(8, Math.floor(sr * .001)));
  });
}

function metalPercussion(ctx, kind) {
  const duration = { metalKick: .42, metalSnare: .34, metalHat: .12, metalCrash: 1.8, metalTom: .65 }[kind];
  const random = randomFor(kind);
  return makeBuffer(ctx, duration, (data, sr) => {
    let phase = 0, low = 0, prior = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr, noise = random() * 2 - 1;
      low = .78 * low + .22 * noise;
      const high = noise - low, edge = noise - prior; prior = noise;
      if (kind === 'metalKick') {
        phase += 2 * Math.PI * (49 + 138 * Math.exp(-t / .014)) / sr;
        data[i] = saturated(Math.sin(phase) * 1.7) * Math.exp(-t / .082)
          + (.2 * high + .16 * Math.sin(2 * Math.PI * 2580 * t)) * Math.exp(-t / .0045);
      } else if (kind === 'metalSnare') {
        const body = .42 * Math.sin(2 * Math.PI * 212 * t) + .16 * Math.sin(2 * Math.PI * 343 * t);
        data[i] = .76 * high * Math.exp(-t / .067) + saturated(body * 1.8) * Math.exp(-t / .043)
          + .13 * edge * Math.exp(-t / .007);
      } else if (kind === 'metalHat') {
        data[i] = (.42 * edge + .22 * high + .1 * Math.sin(2 * Math.PI * 4613 * t)
          + .08 * Math.sin(2 * Math.PI * 7019 * t)) * Math.exp(-t / .022);
      } else if (kind === 'metalCrash') {
        const metal = Math.sin(2 * Math.PI * 3191 * t) * .11 + Math.sin(2 * Math.PI * 4703 * t) * .09
          + Math.sin(2 * Math.PI * 6299 * t) * .07 + Math.sin(2 * Math.PI * 8461 * t) * .045;
        data[i] = (.65 * high + .19 * edge + metal) * Math.exp(-t / .39)
          + .12 * low * Math.exp(-t / .11);
      } else {
        phase += 2 * Math.PI * (104 + 64 * Math.exp(-t / .023)) / sr;
        data[i] = (Math.sin(phase) + .3 * Math.sin(phase * 1.51)) * Math.exp(-t / .14)
          + .18 * high * Math.exp(-t / .012);
      }
      data[i] *= Math.min(1, (duration - t) / .012);
    }
    normalize(data, kind === 'metalHat' ? .66 : kind === 'metalCrash' ? .74 : .88,
      Math.max(8, Math.floor(sr * .0006)));
  });
}

function percussion(ctx, kind) {
  const duration = { kick: .48, snare: .29, hat: .14, brush: .4, rim: .1, shimmer: 2.2 }[kind];
  const random = randomFor(kind), buffer = makeBuffer(ctx, duration, (data, sr) => {
    let phase = 0, low = 0, previous = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr, noise = random() * 2 - 1;
      low = .82 * low + .18 * noise;
      const high = noise - low, difference = noise - previous; previous = noise;
      if (kind === 'kick') {
        phase += 2 * Math.PI * (43 + 116 * Math.exp(-t / .023)) / sr;
        data[i] = Math.sin(phase) * Math.exp(-t / .105) + .028 * high * Math.exp(-t / .007);
      } else if (kind === 'snare') {
        data[i] = .66 * high * Math.exp(-t / .062) + .28 * Math.sin(2 * Math.PI * 182 * t) * Math.exp(-t / .044);
      } else if (kind === 'hat') {
        data[i] = (.5 * difference + .08 * Math.sin(2 * Math.PI * 7142 * t)) * Math.exp(-t / .026);
      } else if (kind === 'brush') {
        data[i] = (.6 * high + .3 * low) * (1 - Math.exp(-t / .012)) * Math.exp(-t / .095);
      } else if (kind === 'rim') {
        data[i] = (.6 * Math.sin(2 * Math.PI * 1080 * t) + .3 * Math.sin(2 * Math.PI * 1810 * t) + .1 * high) * Math.exp(-t / .014);
      } else {
        data[i] = (high * .6 + .08 * Math.sin(2 * Math.PI * 3412 * t)) * (1 - Math.exp(-t / .09)) * Math.exp(-t / .45);
      }
      data[i] *= Math.min(1, (duration - t) / .012);
    }
    normalize(data, kind === 'hat' || kind === 'shimmer' ? .65 : .84);
  });
  return buffer;
}

function makeAssets(ctx) {
  let assets = ASSETS.get(ctx);
  if (assets) return assets;
  const impulse = makeBuffer(ctx, 2.5, (data, sr, channel) => {
    const random = randomFor(1917 + channel * 173), delay = Math.floor(sr * (.024 + .006 * channel));
    let low = 0, envelope = 1, onset = 1;
    const decay = Math.exp(-3.1 / sr), rise = Math.exp(-45 / sr);
    for (let i = delay; i < data.length; i++) {
      low = .62 * low + .38 * (random() * 2 - 1);
      data[i] = low * envelope * (1 - onset); envelope *= decay; onset *= rise;
    }
    for (const [time, gain] of [[.047, .35], [.083, .22], [.131, .13]]) data[Math.floor(sr * (time + channel * .009))] += gain;
  }, 2, true);
  const roomImpulse = makeBuffer(ctx, .72, (data, sr, channel) => {
    const random = randomFor(439 + channel * 67);
    const first = Math.floor(sr * .012), decay = Math.exp(-9 / sr);
    let low = 0, envelope = Math.exp(-9 * first / sr);
    for (let i = first; i < data.length; i++) {
      const t = i / sr; low = .7 * low + .3 * (random() * 2 - 1);
      data[i] = low * envelope * Math.min(1, t * 45); envelope *= decay;
    }
    for (const [time, gain] of [[.019, .24], [.037, .14], [.065, .09]]) data[Math.floor(sr * (time + channel * .003))] += gain;
  }, 2, true);
  assets = { impulse, roomImpulse, samples: new Map(), waves: new Map(), sampleBytes: 0 };
  ASSETS.set(ctx, assets);
  return assets;
}

function sampleFor(ctx, assets, instrument, midi, velocity = .6) {
  let key, base, make;
  const bright = velocity >= .64;
  if (instrument === 'piano' || instrument === 'felt') {
    base = midi < 58 ? 48 : midi < 70 ? 60 : 72; key = `${instrument}:${base}:${bright ? 1 : 0}`;
    make = () => instrument === 'felt' ? feltPiano(ctx, base, bright) : electricPiano(ctx, base, bright);
  } else if (instrument === 'guitar' || instrument === 'pluck') {
    // Three zones preserve both string attack and body without a unique large
    // sample for every note. Pitch shifting stays within roughly half an octave.
    base = midi < 55 ? 50 : midi < 64 ? 59 : midi < 73 ? 68 : 77;
    key = `${instrument}:${base}:${instrument === 'guitar' && bright ? 1 : 0}`; make = () => pluckedString(ctx, base, instrument === 'pluck', instrument === 'guitar' && bright);
  } else if (instrument === 'mallet') {
    base = midi < 66 ? 60 : 72; key = `mallet:${base}`; make = () => malletBuffer(ctx, base);
  } else if (instrument === 'bell') {
    key = 'bell'; base = 72; make = () => bellBuffer(ctx);
  } else if (instrument === 'bass') {
    base = midi < 38 ? 31 : 43; key = `bass:${base}`; make = () => bassBuffer(ctx, base);
  } else if (instrument === 'metalChug' || instrument === 'metalLead') {
    const muted = instrument === 'metalChug';
    base = muted ? midi < 43 ? 38 : midi < 55 ? 50 : 62 : midi < 69 ? 62 : midi < 81 ? 74 : 86;
    key = `${instrument}:${base}:${bright ? 1 : 0}`; make = () => metalString(ctx, base, muted, bright);
  } else if (instrument === 'metalBass') {
    base = midi < 34 ? 28 : midi < 46 ? 40 : 52; key = `${instrument}:${base}`; make = () => metalBass(ctx, base);
  } else if (instrument.startsWith('metal')) {
    base = instrument === 'metalTom' ? 45 : midi; key = instrument; make = () => metalPercussion(ctx, instrument);
  } else {
    key = instrument; base = midi; make = () => percussion(ctx, instrument);
  }
  let buffer = assets.samples.get(key);
  if (buffer) assets.samples.delete(key);
  else { buffer = make(); assets.sampleBytes += buffer.length * buffer.numberOfChannels * 4; }
  assets.samples.set(key, buffer);
  while (assets.samples.size > SAMPLE_CACHE_LIMIT || assets.sampleBytes > SAMPLE_CACHE_BYTES) {
    const oldest = assets.samples.keys().next().value, expired = assets.samples.get(oldest);
    assets.samples.delete(oldest); assets.sampleBytes -= expired.length * expired.numberOfChannels * 4;
  }
  return { buffer, rate: 2 ** ((midi - base) / 12) };
}

function waveFor(ctx, assets, instrument) {
  if (assets.waves.has(instrument)) return assets.waves.get(instrument);
  const amplitudes = instrument === 'organ' ? [0, 1, .42, .19, .12, .06, .025]
    : instrument === 'reed' ? [0, 1, .1, .34, .055, .11, .025, .035]
    : instrument === 'analog' ? [0, 1, .38, .22, .13, .075, .035]
    : instrument === 'bowed' ? [0, 1, .22, .2, .07, .075, .025] : [0, 1, .19, .09, .045, .02];
  const real = new Float32Array(amplitudes.length), imaginary = Float32Array.from(amplitudes);
  const wave = ctx.createPeriodicWave(real, imaginary, { disableNormalization: false });
  assets.waves.set(instrument, wave);
  return wave;
}

/** The room belongs to the piece; alarms and other effects bypass this mix. */
function roomForCue(cue = {}) {
  const tags = new Set(cue.tags || []);
  if (tags.has('crosswind')) return { room: 'short', reverb: .38, echo: .3, brightness: 1, width: 1, gain: .9 };
  if (cue.family === 'combat' || tags.has('foreman')) return { room: 'short', reverb: .62, echo: .42, brightness: 1.08, width: .85, gain: .95 };
  if (tags.has('cabin')) return { room: 'short', reverb: .72, echo: .55, brightness: .86, width: .7, gain: 1 };
  if (tags.has('nightlife')) return { room: 'short', reverb: .8, echo: .9, brightness: .95, width: .9, gain: .98 };
  if (tags.has('fieldwork') || tags.has('machinery')) return { room: 'short', reverb: .85, echo: .7, brightness: .9, width: .82, gain: 1 };
  if (cue.family === 'cave') return { room: 'long', reverb: 1.1, echo: .95, brightness: .82, width: 1.1, gain: .97 };
  if (cue.family === 'theme') return { room: 'long', reverb: .92, echo: 1.05, brightness: 1, width: 1, gain: 1 };
  return { room: 'long', reverb: .88, echo: tags.has('flight') ? 1.1 : .8, brightness: .94, width: 1, gain: 1 };
}


// Trims were matched to existing calm, port and combat mixes. They follow
// compression, preserving the sparse arrangement's own dynamic shape.
const CUE_TRIM = Object.freeze({
  'lamps-in-the-cabin': 1.10,
  'under-the-service-lights': 1.20,
  'the-foreman-cycle': 1.85,
  'carry-the-light': 1.15,
  'after-hours-on-glimmer': 1.50,
  'rain-on-the-transit-line': 1.35,
});
export function mixForCue(cue = {}) { return { ...roomForCue(cue), trim: CUE_TRIM[cue.id] || 1 }; }

export { INSTRUMENT, makeAssets, sampleFor, waveFor, midiHz };
