/* Labels and tick placement only. Never changes observations or shared chart bounds. */
const BaseballChartGuide = (() => {
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function ticks(axis){
    if(axis.scale!=='linear'||axis.ticks.length>=4)return axis.ticks;
    const target=(axis.high-axis.low)/5,base=10**Math.floor(Math.log10(target));
    const step=[1,2,2.5,5,10].map(n=>n*base).find(n=>n>=target)||10*base;
    const result=[];
    for(let n=Math.ceil(axis.low/step)*step; n<=axis.high+step*1e-8&&result.length<12;n+=step)result.push(Math.abs(n)<step*1e-8?0:n);
    return result.length>=3?result:axis.ticks;
  }
  function years(end,width,last=end){
    if(end===2)return [1,2];
    const chosen=[2],candidates=[Math.min(end,last),1,...Array.from({length:Math.floor(end/5)},(_,i)=>(i+1)*5)];
    for(const n of candidates)if(n>=1&&n<=last&&!chosen.includes(n)&&chosen.every(v=>Math.abs(n-v)/(end-1)*width>=52))chosen.push(n);
    return chosen.sort((a,b)=>a-b);
  }
  function meaning(key,role,metric){
    const common={ops:'OPS combines getting on base with hitting for power.',relative_ops:'OPS vs. league compares that hitting measure with the same-season league average.',era:'ERA is earned runs allowed per nine innings.',whip:'WHIP is walks plus hits allowed per inning.',avg:'Batting average is the share of at-bats that become hits.',obp:'On-base percentage measures how often a hitter reaches base.',slg:'Slugging measures total bases per at-bat, giving extra-base hits more weight.',iso:'Isolated power isolates extra bases per at-bat.',relative_era:'This is league ERA minus the pitcher’s ERA; a positive number is better than the league.'};
    return (common[key]||metric.note)+' '+(metric.direction===0?'Higher or lower is not inherently better.':metric.direction<0?'Lower is better on this measure.':'Higher is better on this measure.');
  }
  function change(delta,direction){
    return !finite(delta)?'No comparable pair':delta===0?'No change':direction===0?'Numerical change':delta*direction>0?'Improved in year two':'Declined in year two';
  }
  return {ticks,years,meaning,change};
})();
if(typeof module!=='undefined')module.exports=BaseballChartGuide;
