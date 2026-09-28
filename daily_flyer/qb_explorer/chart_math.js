/* Dependency-free chart calculations, shared by the browser and Node checks. */
const QBChartMath = (() => {
  'use strict';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function series(player, metric, mode) {
    const numbers = player.seasons.map(r => r[metric]).filter(finite);
    const anchor = player.seasons.find(r => r.year === player.first)?.[metric];
    let reason = '', mean = 0, deviation = 0;
    if (mode === 'delta' && (player.anchor_uncertain || !finite(anchor))) reason = 'Year-one baseline unavailable or uncertain';
    if (mode === 'zscore') {
      mean = numbers.reduce((a,b) => a+b, 0) / numbers.length;
      deviation = Math.sqrt(numbers.reduce((s,v) => s+(v-mean)**2, 0) / numbers.length);
      if (numbers.length < 2 || !finite(deviation) || deviation < 1e-12) reason = 'Career normalization needs two values and nonzero variation';
    }
    const value = row => {
      const raw = row[metric];
      if (!finite(raw) || reason) return null;
      return mode === 'delta' ? raw-anchor : mode === 'zscore' ? (raw-mean)/deviation : raw;
    };
    return {value, reason};
  }
  function axis(numbers, options = {}) {
    const values = numbers.filter(finite), notes = [];
    let scale = options.scale || 'linear';
    const customLow = options.min === '' ? NaN : Number(options.min);
    const customHigh = options.max === '' ? NaN : Number(options.max);
    const custom = options.range === 'custom' && Number.isFinite(customLow) && Number.isFinite(customHigh) && customLow < customHigh;
    if (options.range === 'custom' && !custom) notes.push('Enter a minimum below the maximum. Showing fitted bounds until both are valid.');
    if (scale === 'log' && (values.some(v => v <= 0) || options.range === 'zero' || (custom && customLow <= 0))) {
      scale = 'symlog';
      notes.push('Signed log is in use: logarithmic scales cannot include zero or negative values. All observations are retained.');
    }
    const transform = scale === 'log' ? Math.log10 : scale === 'symlog' ? v => Math.sign(v)*Math.log1p(Math.abs(v)) : v => v;
    const inverse = scale === 'log' ? v => 10**v : scale === 'symlog' ? v => Math.sign(v)*Math.expm1(Math.abs(v)) : v => v;
    let low = values.length ? Math.min(...values) : scale === 'log' ? 1 : 0;
    let high = values.length ? Math.max(...values) : scale === 'log' ? 10 : 1;
    if (options.range === 'zero') { low = Math.min(0, low); high = Math.max(0, high); }
    let a = transform(low), b = transform(high);
    const pad = Math.max((b-a)*.08, a === b ? Math.max(Math.abs(a)*.08, .5) : 1e-6);
    a -= pad; b += pad;
    if (options.range === 'zero' && low === 0) a = 0;
    if (options.range === 'zero' && high === 0 && low < 0) b = 0;
    if (custom) { a = transform(customLow); b = transform(customHigh); }
    if (!Number.isFinite(b-a) || b <= a || !Number.isFinite(1/(b-a))) {
      a = 0; b = 1;
      notes.push('These bounds exceed the supported numeric range. Showing a default range.');
    }
    low = inverse(a); high = inverse(b);
    let ticks = [];
    if (scale === 'linear') {
      const raw = (b-a)/5, base = 10**Math.floor(Math.log10(raw)), ratio = raw/base;
      const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10)*base;
      for (let n=Math.ceil(a/step)*step, i=0; n<=b+step*1e-8 && i<12; n+=step,i++) ticks.push(Math.abs(n)<step*1e-8?0:n);
    } else if (scale === 'log') {
      for (let e=Math.floor(a); e<=Math.ceil(b); e++) for (const factor of [1,2,5]) {
        const v=factor*10**e; if (v>=low && v<=high) ticks.push(v);
      }
      if (ticks.length>9) ticks=ticks.filter(v=>Math.abs(Math.log10(v)-Math.round(Math.log10(v)))<1e-8);
    }
    if (ticks.length<2) ticks=Array.from({length:6},(_,i)=>inverse(a+(b-a)*i/5));
    if (scale==='symlog' && low<0 && high>0) {
      ticks=ticks.filter(v=>Math.abs((transform(v)-transform(0))/(b-a))>.05); ticks.push(0); ticks.sort((x,y)=>x-y);
    }
    return {scale, low, high, ticks, notes, unit:v=>(transform(v)-a)/(b-a),
      clipped:values.filter(v=>v<low-1e-9 || v>high+1e-9).length};
  }
  return {series, axis};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = QBChartMath;
