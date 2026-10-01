/* Pure presentation calculations over the existing, unchanged QB dataset. */
const QBPreviewMath = (() => {
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const metrics={
    rating:{name:'Passer rating',unit:'rating points',digits:1,direction:1,
      note:'Higher rating is better on this passing measure. It is not adjusted for era.',
      detail:'NFL passer rating combines completions, yards, touchdowns and interceptions per pass attempt. It excludes rushing and sacks. The chart axis runs from 0 to 160 to include the formula’s maximum of about 158.3.'},
    cmp_pct:{name:'Completion rate',unit:'%',changeUnit:'percentage points',digits:1,direction:1,
      note:'Percentage of passes completed. Higher means more completions per attempt, not necessarily better overall play.',
      detail:'Completions ÷ pass attempts × 100. A change from 60% to 65% is 5 percentage points, not 5 percent. This measure is not era-adjusted.'},
    int_pct:{name:'Interception rate',unit:'%',changeUnit:'percentage points',digits:1,direction:-1,
      note:'Percentage of attempts intercepted. Lower is better on this measure.',
      detail:'Interceptions ÷ pass attempts × 100. A lower interception rate is an improvement on this measure. It is not a complete measure of quarterback quality or adjusted for era.'},
    relative_anya:{name:'Passing efficiency vs. league',unit:'yards / dropback',digits:2,direction:1,
      note:'Zero is that season’s league baseline; above zero is better. Passing only, not rushing.',
      detail:'Adjusted net yards per attempt = (passing yards + 20 × touchdowns − 45 × interceptions − sack yards) ÷ (attempts + sacks). Subtract the same-season aggregate calculated from the snapshot. This is not PFR ANY/A+. The 2000 league baseline is unavailable.'}
  };
  function pair(p,key){
    const one=p.seasons.find(r=>r.year===p.first),two=p.seasons.find(r=>r.year===p.first+1),
      a=finite(one?.[key])?one[key]:null,b=finite(two?.[key])?two[key]:null;
    return {one,two,a,b,delta:!p.anchor_uncertain&&finite(a)&&finite(b)?b-a:null};
  }
  function series(p,key,end){
    return Array.from({length:end},(_,i)=>{
      const year=p.first+i,row=p.seasons.find(r=>r.year===year);
      return {x:i+1,year,row,value:finite(row?.[key])?row[key]:null};
    });
  }
  function niceAxis(values,key){
    if(key==='rating')return {lo:0,hi:160,ticks:[0,40,80,120,160]};
    if(key==='cmp_pct')return {lo:0,hi:100,ticks:[0,25,50,75,100]};
    const nums=values.filter(finite),lowest=Math.min(0,...nums),highest=Math.max(0,...nums);
    let lo=lowest,hi=highest;
    if(lo===hi){lo=key==='relative_anya'?-1:0;hi=1;}
    const rough=(hi-lo)/4,power=10**Math.floor(Math.log10(rough)),fraction=rough/power,
      step=([1,2,2.5,5,10].find(n=>n>=fraction)||10)*power;
    lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
    const ticks=Array.from({length:Math.round((hi-lo)/step)+1},(_,i)=>Number((lo+i*step).toPrecision(10)));
    return {lo,hi,ticks};
  }
  function direction(delta,key){
    if(!finite(delta))return 'Not comparable';
    if(delta===0)return 'Unchanged';
    return delta*metrics[key].direction>0?'Improved on this measure':'Declined on this measure';
  }
  function format(value,key,signed=false){
    if(!finite(value))return 'Unavailable';
    const d=metrics[key].digits,sign=value<0?'−':signed&&value>0?'+':'';
    const magnitude=Math.abs(value);
    return sign+(signed&&magnitude>0&&magnitude<10**-d?'<'+(10**-d).toFixed(d):magnitude.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}));
  }
  function warning(p,key,through){
    const q=pair(p,key),messages=[];
    if(p.anchor_uncertain)messages.push('Study start is uncertain: an earlier multi-team total lacks team splits. No year-two change is calculated.');
    if(!q.one||!finite(q.a))messages.push('Year-one value is unavailable; no change can be calculated.');
    if(!q.two)messages.push(p.first+1>through?'Year two is outside this snapshot; no result is implied.':'No year-two row; the next recorded season does not replace it.');
    else if(!finite(q.b))messages.push('Year-two value is unavailable; it is not treated as zero.');
    if(q.two&&!q.two.qualifies)messages.push(`Year two has ${q.two.gs??'unknown'} starts and ${q.two.att??'unknown'} attempts; it does not meet the same 12-start single-team rule.`);
    return messages.join(' ');
  }
  return {finite,metrics,pair,series,niceAxis,direction,format,warning};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=QBPreviewMath;
