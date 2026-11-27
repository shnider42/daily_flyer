// A cached last-resort report when a recording cannot load. This is synthesized
// sound design, never a recording of a particular firearm. No per-shot noise
// generation or stacked oscillators are needed during a firefight.
export function fallbackReportData(sampleRate, weapon = 'rifle') {
  const rate = Math.max(8000, Math.min(96000, Number(sampleRate) || 44100));
  const cannon = weapon === 'tank-cannon';
  const support = weapon === 'support' || weapon === 'hostile_support' || weapon === 'vehicle-mg', heavy = weapon === 'sniper';
  const duration = cannon ? .86 : heavy ? .36 : support ? .23 : .29;
  const data = new Float32Array(Math.ceil(rate * duration));
  let seed = cannon ? 27479 : heavy ? 15131 : support ? 5471 : weapon === 'hostile' ? 9127 : 3169;
  let low = 0, previous = 0, peak = 0;
  const smooth = Math.exp(-2 * Math.PI * (cannon ? 330 : 950) / rate);
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1, time = i / rate;
    low = low * smooth + white * (1 - smooth);
    const crack = (white - previous * .65) * Math.exp(-time / (cannon ? .008 : .0038));
    const body = low * (cannon ? 2.6 : heavy ? 1.5 : 1.1) * Math.exp(-time / (cannon ? .12 : heavy ? .052 : .032));
    const pressure = Math.sin(2 * Math.PI * (cannon ? 58 : heavy ? 88 : support ? 126 : 142) * time) * (cannon ? .3 : .15) * Math.exp(-time / (cannon ? .1 : .026));
    const attack = Math.min(1, time / (cannon ? .0008 : .0003)), end = Math.min(1, (duration - time) / .025);
    data[i] = (crack * (cannon ? .32 : .55) + body + pressure) * attack * end;
    peak = Math.max(peak, Math.abs(data[i])); previous = white;
  }
  const scale = .82 / Math.max(.001, peak);
  for (let i = 0; i < data.length; i++) data[i] *= scale;
  data[data.length - 1] = 0;
  return data;
}

// Original procedural surface foley, not recorded impacts or ricochet physics.
// Three short variants per material are generated once when audio is unlocked.
// A single buffer contains its attack and small debris decay, so automatic
// fire does not allocate a second voice for every chip or cosmetic particle.
const impact = (material, duration, gain, highpass, lowpass, wet) => Object.freeze({ material, duration, gain, highpass, lowpass, wet });
export const IMPACT_PROFILES = Object.freeze({
  concrete: impact('concrete', .145, .15, 300, 5800, .12),
  stone: impact('stone', .13, .14, 380, 6200, .12),
  metal: impact('metal', .17, .17, 240, 7000, .1),
  wood: impact('wood', .12, .12, 160, 3600, .065),
  rubber: impact('rubber', .095, .1, 70, 1600, .025),
  body: impact('body', .09, .105, 140, 2400, .03),
});
export function impactProfile(material) { return Object.hasOwn(IMPACT_PROFILES, material) ? IMPACT_PROFILES[material] : IMPACT_PROFILES.concrete; }

export function impactReportData(sampleRate, material = 'concrete', variant = 0) {
  const rate = Math.max(8000, Math.min(96000, Number(sampleRate) || 44100));
  const p = impactProfile(material), turn = Number.isFinite(Number(variant)) ? Math.abs(Math.trunc(Number(variant))) % 3 : 0;
  const data = new Float32Array(Math.ceil(rate * p.duration));
  const soft = p.material === 'rubber' || p.material === 'body', wood = p.material === 'wood', metal = p.material === 'metal';
  const stone = p.material === 'stone', frequency = soft ? 380 : wood ? 850 : metal ? 1600 : 1350;
  const smooth = Math.exp(-2 * Math.PI * frequency / rate);
  const pitch = 1 + (turn - 1) * .025;
  const resonances = metal ? [[1643, .065, .025], [2869, .04, .018], [3911, .025, .012]]
    .filter(([hz]) => hz * pitch < rate * .46) : [];
  let seed = 1871 + turn * 7919 + Object.keys(IMPACT_PROFILES).indexOf(p.material) * 137, low = 0, previous = 0, peak = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1, time = i / rate;
    low = low * smooth + white * (1 - smooth);
    const snap = (white - previous * .55) * Math.exp(-time / (soft ? .0038 : .0022));
    let value = snap * (soft ? .11 : .6) + low * (soft ? 1.7 : wood ? 1.2 : .65) * Math.exp(-time / (wood ? .019 : soft ? .017 : .01));
    if (metal) {
      // Brief, inharmonic metal resonances, kept below the device Nyquist limit.
      for (const [hz, strength, decay] of resonances) value += Math.sin(2 * Math.PI * hz * pitch * time) * strength * Math.exp(-time / decay);
    } else if (!soft && !wood) {
      const chips = Math.exp(-(((time - .032 - turn * .003) / .008) ** 2)) + .55 * Math.exp(-(((time - .069) / .012) ** 2));
      value += (white - low * .5) * ((stone ? .16 : .12) * Math.exp(-time / .023) + .04 * chips);
    }
    value *= Math.min(1, time / .0004) * Math.min(1, (p.duration - time) / .018);
    data[i] = value; peak = Math.max(peak, Math.abs(value)); previous = white;
  }
  const scale = (soft ? .6 : .72) / Math.max(.001, peak);
  for (let i = 0; i < data.length; i++) data[i] *= scale;
  data[0] = data[data.length - 1] = 0;
  return data;
}
