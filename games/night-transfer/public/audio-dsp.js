// Small, deterministic offline sound generators. Samples are created on demand,
// cached by the audio engine and reused; none of this runs in an audio callback.
const TAU = Math.PI * 2;
const limit = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// The receiver and its labelled calibration buttons use exactly these same
// mono samples. Pitch carries the signal; stereo placement and volume do not.
export const PUZZLE_TONE_FREQUENCIES = Object.freeze({ low: 330, mid: 550, high: 880 });
export const PUZZLE_TONE_DURATION = .4;
export function synthPuzzleTone(rate, tone) {
  if (!Number.isFinite(rate) || rate < 8000 || rate > 192000 || !Object.hasOwn(PUZZLE_TONE_FREQUENCIES, tone)) {
    throw new RangeError('Unsupported receiver tone or sample rate');
  }
  const frequency = PUZZLE_TONE_FREQUENCIES[tone], data = new Float32Array(Math.round(rate * PUZZLE_TONE_DURATION));
  const attack = Math.round(rate * .015), release = Math.round(rate * .04);
  for (let i = 0; i < data.length; i++) {
    const phase = TAU * frequency * i / rate;
    const edge = Math.min(1, i / attack, (data.length - 1 - i) / release);
    const envelope = Math.sin(Math.max(0, edge) * Math.PI / 2) ** 2;
    data[i] = (Math.sin(phase) + .1 * Math.sin(phase * 2) + .025 * Math.sin(phase * 3)) * .44 * envelope;
  }
  return data;
}

export function randomFor(seed = 1) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
const range = (random, min, max) => min + random() * (max - min);
const envelope = (t, start, attack, decay) => t < start ? 0 : (1 - Math.exp(-(t - start) / attack)) * Math.exp(-(t - start) / decay);

function finish(data, rate, rmsTarget, peakLimit = .72, fade = .006) {
  let previous = 0, high = 0, energy = 0, peak = 0;
  const pole = Math.exp(-TAU * 28 / rate), edge = Math.max(1, Math.round(rate * fade));
  for (let i = 0; i < data.length; i++) {
    const input = data[i]; high = input - previous + pole * high; previous = input;
    const window = Math.min(1, i / edge, (data.length - 1 - i) / edge);
    data[i] = high * Math.max(0, window); energy += data[i] ** 2; peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = Math.min(rmsTarget / (Math.sqrt(energy / data.length) || 1), peakLimit / (peak || 1));
  for (let i = 0; i < data.length; i++) data[i] *= scale;
  return data;
}
function lowpass(data, rate, frequency) {
  const amount = 1 - Math.exp(-TAU * Math.min(frequency, rate * .42) / rate); let value = 0;
  for (let i = 0; i < data.length; i++) { value += amount * (data[i] - value); data[i] = value; }
  return data;
}
function resonator(rate, frequency, q) {
  const omega = TAU * Math.min(frequency, rate * .42) / rate, alpha = Math.sin(omega) / (2 * q), denominator = 1 + alpha;
  const b0 = alpha / denominator, b2 = -b0, a1 = -2 * Math.cos(omega) / denominator, a2 = (1 - alpha) / denominator;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

export function synthFootstep(rate, material = 'stone', variant = 0) {
  const random = randomFor(8009 + variant * 7919 + (material === 'tile' ? 20011 : material === 'metal' ? 40009 : 0));
  const metal = material === 'metal', tile = material === 'tile';
  const data = new Float32Array(Math.ceil(rate * (metal ? .43 : .36)));
  const toe = range(random, .078, .13), pitch = range(random, .92, 1.07);
  const modes = metal ? [[91, .045, .55], [283, .09, .2], [491, .071, .15], [827, .045, .09]]
    : tile ? [[104, .035, .6], [341, .025, .14], [1170, .013, .07]] : [[76, .041, .64], [163, .03, .15], [276, .02, .07]];
  const phases = modes.map(() => range(random, -.2, .2));
  const grains = Array.from({ length: 4 }, () => ({ at: toe + range(random, .015, .11), level: range(random, .025, .075), decay: range(random, .008, .022) }));
  const cutoff = tile ? 2300 : metal ? 1650 : 950, coefficient = 1 - Math.exp(-TAU * Math.min(cutoff, rate * .4) / rate);
  let noiseLow = 0, scuffLow = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, white = random() * 2 - 1;
    noiseLow += coefficient * (white - noiseLow); scuffLow += .1 * (white - scuffLow);
    let sample = 0;
    for (let m = 0; m < modes.length; m++) {
      const [frequency, decay, level] = modes[m], f = frequency * pitch;
      sample += Math.sin(TAU * f * t + phases[m]) * envelope(t, .006, .0017, decay) * level;
      if (t > toe) sample += Math.sin(TAU * f * 1.12 * (t - toe)) * envelope(t, toe, .0025, decay * .62) * level * .42;
    }
    sample += noiseLow * (envelope(t, .004, .001, .013) * .45 + envelope(t, toe, .003, .024) * .2);
    let scrape = 0; for (const grain of grains) scrape += envelope(t, grain.at, .003, grain.decay) * grain.level;
    sample += (white - scuffLow) * scrape * (tile ? .72 : .42);
    data[i] = sample;
  }
  return finish(data, rate, .115, .7, .003);
}

export function synthMurmur(rate, variant = 0) {
  const random = randomFor(43067 + variant * 15427), segments = [];
  let time = range(random, .08, .2), phase = 0;
  const formants = [[430, 1050, 2300], [330, 1590, 2400], [610, 1210, 2600], [390, 870, 2150], [490, 1420, 2450]];
  const phrases = random() < .48 ? 2 : 3;
  for (let phrase = 0; phrase < phrases; phrase++) {
    const count = 2 + Math.floor(random() * 3), pitch = range(random, phrase % 2 ? 130 : 91, phrase % 2 ? 174 : 126);
    for (let syllable = 0; syllable < count; syllable++) {
      const duration = range(random, .105, .27), kind = syllable && random() < .27 ? 'breath' : 'voiced';
      segments.push({ at: time, duration, kind, pitch: pitch * (1 - syllable * .025), vowel: formants[Math.floor(random() * formants.length)], level: range(random, .5, 1) });
      time += duration + range(random, .012, .085);
    }
    time += range(random, .23, .63);
  }
  const data = new Float32Array(Math.ceil(rate * Math.min(4.7, time + .1)));
  for (const segment of segments) {
    const first = Math.floor(segment.at * rate), length = Math.floor(segment.duration * rate);
    const filters = segment.vowel.map((frequency, i) => resonator(rate, frequency * range(random, .94, 1.06), [3.2, 5, 7][i]));
    let breath = 0, jitter = 1;
    const fricative = resonator(rate, range(random, 1100, 2050), .8);
    for (let i = 0; i < length && first + i < data.length; i++) {
      const fraction = i / length, white = random() * 2 - 1;
      const f0 = segment.pitch * (1 - .07 * fraction + .013 * Math.sin(fraction * 5.1)) * jitter;
      phase += f0 / rate;
      if (phase >= 1) { phase -= 1; jitter = range(random, .975, 1.025); }
      // A rounded, asymmetric glottal pulse, with breath mixed before the vocal
      // resonances, avoids the buzzy regular sawtooth used by the old effect.
      const pulse = phase < .42 ? Math.sin(Math.PI * phase / .42) ** 2 : -.18 * Math.sin(Math.PI * (phase - .42) / .58) ** 2;
      breath += .22 * (white - breath);
      const source = pulse * .8 + breath * .075;
      let value = filters[0](source) + filters[1](source) * .55 + filters[2](source) * .18;
      if (segment.kind === 'breath') value = fricative(white) * .2;
      else value += fricative(white) * .018 * (1 - fraction);
      const edge = Math.min(1, fraction / .16, (1 - fraction) / .22);
      data[first + i] += value * Math.sin(Math.max(0, edge) * Math.PI / 2) ** 2 * segment.level;
    }
  }
  lowpass(data, rate, 1450); lowpass(data, rate, 1500);
  return finish(data, rate, .075, .52, .025);
}

function seamless(data, rate) {
  const overlap = Math.min(Math.floor(rate * .18), Math.floor(data.length / 8)), result = data.slice(0, data.length - overlap);
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap * Math.PI / 2;
    result[i] = data[data.length - overlap + i] * Math.cos(t) + data[i] * Math.sin(t);
  }
  return result;
}

export function synthTexture(rate, kind = 'vent', seed = 1, seconds = 7.3, hum = 52) {
  const random = randomFor(seed), data = new Float32Array(Math.ceil(rate * seconds));
  let low = 0, deep = 0, movement = .6, target = .6, next = 0, phase = random() * TAU;
  const cutoff = kind === 'steam' ? 1900 : kind === 'water' ? 1150 : kind === 'wind' ? 700 : 460;
  const coefficient = 1 - Math.exp(-TAU * Math.min(cutoff, rate * .4) / rate);
  const drift = 1 - Math.exp(-1 / (rate * .6));
  for (let i = 0; i < data.length; i++) {
    const time = i / rate, white = random() * 2 - 1;
    if (i >= next) { target = range(random, .35, .95); next = i + Math.floor(rate * range(random, .7, 2.9)); }
    movement += (target - movement) * drift;
    low += coefficient * (white - low); deep += .006 * (white - deep);
    let sample;
    if (kind === 'machine') {
      phase += TAU * hum * (1 + .0012 * (movement - .6)) / rate;
      sample = (Math.sin(phase) * .62 + Math.sin(phase * 2.001) * .1 + Math.sin(phase * 3.019) * .045) * (.65 + movement * .3) + low * .07;
    } else if (kind === 'water') sample = low * (movement * .8 + .2) + deep * 1.2;
    else if (kind === 'steam') sample = (white - low * .7) * (.2 + movement * .8);
    else if (kind === 'wind') sample = low * movement + deep * (1.5 + movement * 2);
    else sample = low * (.65 + movement * .4) + deep * .7;
    data[i] = sample;
  }
  finish(data, rate, kind === 'machine' ? .2 : .15, .66, 0);
  return seamless(data, rate);
}

export function synthEvent(rate, kind = 'pipe', variant = 0) {
  const random = randomFor(19001 + variant * 13007 + kind.length * 109);
  const duration = kind === 'hiss' || kind === 'water' ? 1.8 + random() * .8 : kind === 'door' ? .95 : .68 + random() * .28;
  const data = new Float32Array(Math.ceil(rate * duration)), impacts = [];
  if (!['hiss', 'water'].includes(kind)) {
    const count = kind === 'drip' ? 1 + Math.floor(random() * 3) : kind === 'keys' ? 3 : kind === 'chain' ? 4 : 2;
    let at = .008;
    for (let i = 0; i < count; i++) {
      const frequency = kind === 'drip' ? range(random, 760, 1300) : kind === 'keys' || kind === 'chain' ? range(random, 1200, 2350) : range(random, 94, 195);
      impacts.push({ at, frequency, level: (i ? .5 : 1) * range(random, .7, 1), decay: kind === 'drip' ? .032 : kind === 'keys' ? .065 : .09 });
      at += kind === 'keys' ? range(random, .035, .095) : range(random, .11, .25);
    }
  }
  let low = 0, high = 0;
  const alpha = 1 - Math.exp(-TAU * Math.min(kind === 'water' ? 600 : kind === 'hiss' ? 1600 : 1150, rate * .4) / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, white = random() * 2 - 1;
    low += alpha * (white - low); high += .08 * (white - high);
    let value = 0;
    for (const hit of impacts) if (t >= hit.at) {
      const elapsed = t - hit.at, env = envelope(t, hit.at, .0015, hit.decay) * hit.level;
      const phase = kind === 'drip' ? TAU * hit.frequency * .032 * (1 - Math.exp(-elapsed / .032)) : TAU * hit.frequency * elapsed;
      value += (Math.sin(phase) * .6 + Math.sin(phase * 2.73) * .18 + Math.sin(phase * 4.16) * .08) * env;
      value += low * envelope(t, hit.at, .001, .008) * .18;
    }
    if (kind === 'hiss' || kind === 'water') {
      const env = Math.sin(Math.PI * t / duration) ** 2;
      value = low * env * (.68 + .2 * Math.sin(t * 9.3) + .12 * Math.sin(t * 17.1));
    } else if (kind === 'door' || kind === 'settle' || kind === 'pipe') {
      const env = envelope(t, .12, .05, kind === 'door' ? .24 : .09);
      value += (white - high) * env * .13 * (.4 + .6 * Math.sin(t * 63 + Math.sin(t * 21)) ** 2);
    }
    data[i] = value;
  }
  return finish(data, rate, ['hiss', 'water'].includes(kind) ? .12 : .085, .64, .004);
}

const SPACES = {
  cell: { decay: .7, size: 1, bright: 2350 }, tile: { decay: 1.02, size: 1.12, bright: 3200 },
  office: { decay: .43, size: .83, bright: 1800 }, plant: { decay: .84, size: 1.2, bright: 2250 },
  exterior: { decay: .2, size: .75, bright: 1550 },
};
export function synthRoomImpulse(rate, space = 'cell') {
  const profile = SPACES[space] || SPACES.cell, duration = profile.decay * 1.25 + .09;
  const channels = [new Float32Array(Math.ceil(rate * duration)), new Float32Array(Math.ceil(rate * duration))];
  channels.forEach((data, channel) => {
    const random = randomFor(79039 + channel * 7919 + Math.round(profile.decay * 10000));
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      if (t < .03) continue;
      const damping = profile.bright * Math.exp(-t / (profile.decay * .7)) + 230;
      const alpha = 1 - Math.exp(-TAU * Math.min(damping, rate * .42) / rate);
      filtered += alpha * (random() * 2 - 1 - filtered);
      const build = Math.min(1, (t - .03) / .05), decay = Math.exp(-6.91 * t / profile.decay);
      data[i] = filtered * build * decay * .014 * Math.sqrt(24000 / rate);
    }
    [.013, .023, .037, .054, .079, .111].forEach((time, index) => {
      const at = Math.round((time * profile.size + (channel ? .0019 * (index % 3 + 1) : 0)) * rate);
      const amplitude = [.25, .18, .14, .1, .075, .045][index] * (channel ? [1, .7, 1.15][index % 3] : 1);
      const length = Math.max(2, Math.round(rate * .0003));
      let sum = 0; for (let j = 0; j < length; j++) sum += Math.exp(-j / (length * .3));
      for (let j = 0; j < length && at + j < data.length; j++) data[at + j] += amplitude * Math.exp(-j / (length * .3)) / sum;
    });
    const fade = Math.max(1, Math.round(rate * .02));
    for (let i = data.length - fade; i < data.length; i++) data[i] *= (data.length - 1 - i) / fade;
  });
  return channels;
}

export function spatialMix(listener, anchor) {
  const dx = anchor.x - (listener?.x || 0), dz = anchor.z - (listener?.z || 0), distance = Math.hypot(dx, dz), yaw = listener?.yaw || 0;
  const right = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(.1, distance);
  return { pan: limit(right * .88, -.88, .88), gain: limit(1 / Math.sqrt(1 + (distance / 5) ** 2), .32, 1), distance };
}
