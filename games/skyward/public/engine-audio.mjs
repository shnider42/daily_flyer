const TAU = 2 * Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const ENGINE_SAMPLE_RATE = 24000;
export const ENGINE_LAYER_NAMES = Object.freeze(['core', 'rotor', 'air']);
const LOOP_SECONDS = 1.8;
const TABLE_SIZE = 1024;

// Arcade sound design values. The piston pulses, blades and turbine tones are
// separate acoustic sources, so thrust can change their balance independently.
const piston = (coreHz, bladeHz, cylinders, { engines = 1, bite = .6, sputter = .14, rasp = 950, idle = .52 } = {}) =>
  ({ family: 'piston', coreHz, bladeHz, cylinders, engines, bite, sputter, rasp, idle, spool: .32 });
const turbine = (coreHz, bladeHz, { engines = 1, bite = .52, rasp = 1950, idle = .52, spool = .72, bypass = .18 } = {}) =>
  ({ family: 'turbine', coreHz, bladeHz, cylinders: 0, engines, bite, sputter: .045, rasp, idle, spool, bypass });
const powertrains = {
  avro504: piston(133, 43, 9, { bite: .89, sputter: .57, rasp: 635, idle: .43 }),
  camel: piston(153, 50, 9, { bite: .95, sputter: .37, rasp: 915, idle: .49 }),
  spitfire: piston(124, 117, 12, { bite: .49, sputter: .09, rasp: 1510, idle: .6 }),
  hellcat: piston(160, 89, 18, { bite: .76, sputter: .22, rasp: 880 }),
  p38: piston(119, 98, 12, { engines: 2, bite: .57, sputter: .125, rasp: 1290, idle: .57 }),
  c47: piston(105, 78, 14, { engines: 2, bite: .78, sputter: .19, rasp: 800, idle: .53 }),
  b17: piston(134, 73, 18, { engines: 4, bite: .66, sputter: .20, rasp: 1060, idle: .55 }),
  ac130: { ...turbine(86, 69, { engines: 4, bite: .36, rasp: 1390, idle: .72, spool: .55 }), family: 'turboprop' },
  f4: turbine(84, 710, { engines: 2, bite: .92, rasp: 1670, idle: .43, spool: .7, bypass: .05 }),
  harrier: turbine(102, 1055, { bite: .83, rasp: 2400, idle: .54, spool: .46, bypass: .23 }),
  a10: turbine(69, 432, { engines: 2, bite: .38, rasp: 1250, idle: .61, spool: .82, bypass: .72 }),
  mig21: turbine(112, 1220, { bite: .98, rasp: 2830, idle: .46, spool: .46, bypass: .02 }),
  f14: turbine(75, 545, { engines: 2, bite: .80, rasp: 1780, idle: .47, spool: .95, bypass: .17 }),
  f15: turbine(96, 770, { engines: 2, bite: .66, rasp: 2310, idle: .54, spool: .66, bypass: .25 }),
  f16: turbine(108, 950, { bite: .76, rasp: 2750, idle: .54, spool: .51, bypass: .24 }),
  f18: turbine(89, 885, { engines: 2, bite: .71, rasp: 2020, idle: .58, spool: .53, bypass: .28 }),
  f22: turbine(77, 660, { engines: 2, bite: .52, rasp: 1800, idle: .57, spool: .58, bypass: .43 }),
  b2: turbine(61, 326, { engines: 4, bite: .32, rasp: 1030, idle: .62, spool: 1.15, bypass: .63 }),
  b767: turbine(54, 257, { engines: 2, bite: .20, rasp: 1180, idle: .61, spool: 1.26, bypass: .94 }),
  sr71: turbine(119, 467, { engines: 2, bite: 1, rasp: 2620, idle: .48, spool: 1.01, bypass: .03 }),
};

export function engineProfile(aircraft) {
  const id = typeof aircraft === 'string' ? aircraft : aircraft?.id;
  return Object.hasOwn(powertrains, id) ? powertrains[id] : powertrains.avro504;
}

function buildTable(wave) {
  return Float32Array.from({ length: TABLE_SIZE }, (_, i) => wave(i / TABLE_SIZE));
}

const sine = buildTable(t => Math.sin(t * TAU));
function readWave(table, position) {
  const index = Math.floor(position);
  const i = index & (TABLE_SIZE - 1);
  const a = table[i], b = table[(i + 1) & (TABLE_SIZE - 1)];
  return a + (b - a) * (position - index);
}

function randomFor(id) {
  let state = 2166136261;
  for (const letter of String(id)) state = Math.imul(state ^ letter.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2147483648 - 1;
  };
}

function normalizeLayer(samples, rms) {
  let mean = 0, square = 0, peak = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  for (const sample of samples) {
    const v = sample - mean;
    square += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const gain = Math.min(rms / Math.sqrt(square / samples.length || 1), .81 / (peak || 1));
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] - mean) * gain;
}

// All periodic frequencies close across the loop seam. A short overlap joins
// the irregular, filtered turbulence without a click or a regular silent gap.
export function synthesizeEngineLayers(aircraft, sampleRate = ENGINE_SAMPLE_RATE) {
  const p = engineProfile(aircraft);
  const rate = Math.round(clamp(finite(sampleRate, ENGINE_SAMPLE_RATE), 8000, 96000));
  const count = Math.round(LOOP_SECONDS * rate), overlap = Math.round(rate * .038);
  const core = new Float32Array(count), rotor = new Float32Array(count), air = new Float32Array(count);
  const random = randomFor(aircraft), turbineOnly = p.family === 'turbine', pistonOnly = p.family === 'piston';
  const coreWave = buildTable(t => {
    const a = t * TAU;
    if (pistonOnly) {
      const pulse = Math.exp(-(1 - Math.cos(a - .8)) * (2 + p.bite * 6.8));
      return pulse + .18 * Math.sin(a + .72) + .13 * (p.cylinders >= 14 ? Math.sin(a * 2 + .5) : -Math.cos(a * 2 + .3));
    }
    return Math.sin(a) * (1 - .19 * p.bite) + Math.sin(a * 2 + .7) * (.14 + p.bite * .22) + Math.sin(a * 3 - .39) * .15;
  });
  const rotorWave = buildTable(t => {
    const a = t * TAU;
    if (turbineOnly) return .74 * Math.sin(a) + .16 * Math.cos(2 * a + 1.25) + .07 * Math.sin(a * 3 - .32);
    return Math.sin(a - .5) + .36 * Math.sin(a * 2 + .45) + .18 * p.bite * Math.sin(a * 3 + 1.4);
  });
  const voices = Array.from({ length: p.engines }, (_, i) => ({
    coreRate: Math.round((p.coreHz + 1.15 * i) * LOOP_SECONDS) * TABLE_SIZE / count,
    rotorRate: Math.round((p.bladeHz + (turbineOnly ? 3.1 : 1.05) * i) * LOOP_SECONDS) * TABLE_SIZE / count,
    revolutionRate: Math.round((p.coreHz + 1.15 * i) / Math.max(1, p.cylinders) * LOOP_SECONDS) * TABLE_SIZE / count,
    phase: i * 275.4,
  }));
  const coefficient = hz => 1 - Math.exp(-TAU * hz / rate);
  const bass = coefficient(108), low = coefficient(pistonOnly ? 310 : 225), high = coefficient(p.rasp);
  const irregularRate = Math.round((2.5 + 7 * p.sputter) * LOOP_SECONDS) * TABLE_SIZE / count;
  const pulseRate = Math.round(p.bladeHz * LOOP_SECONDS) * TABLE_SIZE / count;
  const toneScale = 1 / Math.sqrt(p.engines);
  let deep = 0, lowpass = 0, hiss = 0;
  for (let i = 0; i < count + overlap; i++) {
    const white = random();
    deep += (white - deep) * bass;
    lowpass += (white - lowpass) * low;
    hiss += (white - hiss) * high;
    const irregular = readWave(sine, i * irregularRate);
    const rumble = (lowpass - deep) * (turbineOnly ? 2.4 : 1)
      + deep * (turbineOnly ? 2.7 : .8)
      + (hiss - lowpass) * (pistonOnly ? .84 + p.bite * .4 : .89)
      + (white - hiss) * (pistonOnly ? .085 : .09 + .09 * p.bite);
    const pressure = readWave(sine, i * pulseRate - 140);
    const airSample = rumble * (1 + irregular * .16 + pressure * (turbineOnly ? .05 : .18));
    if (i >= count) {
      const j = i - count, blend = (1 + Math.cos(Math.PI * j / overlap)) * .5;
      air[j] += (airSample - air[j]) * blend;
      continue;
    }
    air[i] = airSample;
    const breath = readWave(sine, i / count * TABLE_SIZE * 3);
    for (const voice of voices) {
      const phase = voice.coreRate * i + voice.phase + irregular * p.sputter * 54;
      const bladePhase = voice.rotorRate * i + voice.phase + breath * (turbineOnly ? 17 : 5.5);
      const throb = pistonOnly ? 1 + p.sputter * (.45 * irregular + .14 * readWave(sine, voice.revolutionRate * i + voice.phase)) : 1 + .20 * breath;
      core[i] += readWave(coreWave, phase) * throb * toneScale;
      const blade = readWave(rotorWave, bladePhase);
      rotor[i] += blade * (1 + (turbineOnly ? .18 : .28) * pressure + .13 * breath) * toneScale;
    }
  }
  normalizeLayer(core, pistonOnly ? .25 : .20);
  normalizeLayer(rotor, turbineOnly ? .15 : .21);
  normalizeLayer(air, .23);
  return { core, rotor, air, sampleRate: rate };
}

export function engineMix(profile, { power = 0, speed = 0, verticalSpeed = 0, health = 1, camera = 'chase' } = {}) {
  power = clamp(finite(power), 0, 1);
  const condition = clamp(finite(health, 1), 0, 1);
  const jet = profile.family === 'turbine', turboprop = profile.family === 'turboprop';
  const exterior = camera !== 'cockpit' && camera !== 'gunner';
  const cinematic = camera === 'cinematic';
  const skyLoad = clamp(finite(speed) / 400 + finite(verticalSpeed) / 240, 0, 1);
  const dry = clamp((power - .76) / .24, 0, 1) * (1 - (profile.bypass || 0));
  const pitch = profile.idle + power * (jet ? .72 : turboprop ? .34 : .58);
  const damage = 1 - (1 - condition) * .13;
  return {
    cutoff: exterior ? (cinematic ? 4700 : 6300) : jet ? 2050 : 1500,
    gain: (cinematic ? .78 : exterior ? 1 : .91) * (.53 + power * .47),
    core: { rate: pitch * damage, gain: (jet ? .32 + .14 * dry : turboprop ? .39 : .70 - .12 * power) * (exterior ? .92 : 1) },
    rotor: { rate: (jet ? .58 + power * .69 : profile.idle + .12 + power * (turboprop ? .24 : .42)) * damage,
      gain: (jet ? (.22 + power * .13 + (profile.bypass || 0) * .26) * (1 - dry * .25) : turboprop ? .84 : .40 + power * .30) * (exterior ? 1 : .62) },
    air: { rate: .87 + power * .23, gain: (jet ? .43 + power * .28 + dry * .39 : .22 + power * .28)
      * (exterior ? 1 : .54) * (.86 + skyLoad * .14) },
  };
}
