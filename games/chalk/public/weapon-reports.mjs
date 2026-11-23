// A cached last-resort report when a recording cannot load. This is synthesized
// sound design, never a recording of a particular firearm. No per-shot noise
// generation or stacked oscillators are needed during a firefight.
export function fallbackReportData(sampleRate, weapon = 'rifle') {
  const rate = Math.max(8000, Math.min(96000, Number(sampleRate) || 44100));
  const support = weapon === 'support' || weapon === 'hostile_support', heavy = weapon === 'sniper';
  const duration = heavy ? .36 : support ? .23 : .29;
  const data = new Float32Array(Math.ceil(rate * duration));
  let seed = heavy ? 15131 : support ? 5471 : weapon === 'hostile' ? 9127 : 3169;
  let low = 0, previous = 0, peak = 0;
  const smooth = Math.exp(-2 * Math.PI * 950 / rate);
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1, time = i / rate;
    low = low * smooth + white * (1 - smooth);
    const crack = (white - previous * .65) * Math.exp(-time / .0038);
    const body = low * (heavy ? 1.5 : 1.1) * Math.exp(-time / (heavy ? .052 : .032));
    const pressure = Math.sin(2 * Math.PI * (heavy ? 88 : support ? 126 : 142) * time) * .15 * Math.exp(-time / .026);
    const attack = Math.min(1, time / .0003), end = Math.min(1, (duration - time) / .025);
    data[i] = (crack * .55 + body + pressure) * attack * end;
    peak = Math.max(peak, Math.abs(data[i])); previous = white;
  }
  const scale = .82 / Math.max(.001, peak);
  for (let i = 0; i < data.length; i++) data[i] *= scale;
  data[data.length - 1] = 0;
  return data;
}
