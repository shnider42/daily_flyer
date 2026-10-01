/* The same statistical and plotting rules apply to every sport adapter. */
const YearTwoChartMath = (() => {
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
  function median(values){const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return !a.length?null:a.length%2?a[i]:(a[i-1]+a[i])/2;}
  function series(player,metric,settings){
    if(!Number.isInteger(player.first))return [];
    const last=Math.max(player.first+1,...player.seasons.map(s=>s.year)),end=settings.window==='all'?last:Math.min(last,player.first+Number(settings.window)-1),
      rows=new Map(player.seasons.map(r=>[r.year,r])),baseline=rows.get(player.first)?.[metric];
    const points=[];
    for(let year=player.first;year<=end;year++){
      const row=rows.get(year),raw=finite(row?.[metric])?row[metric]:null;
      points.push({year,studyYear:year-player.first+1,x:settings.timeline==='calendar'?year:year-player.first+1,raw,
        y:settings.normalize==='delta'?(finite(raw)&&finite(baseline)&&!player.anchor_uncertain?raw-baseline:null):raw,row});
    }
    return points;
  }
  function trend(points){
    const p=points.filter(p=>finite(p.x)&&finite(p.y)),n=p.length;
    if(n<3)return {reason:'Needs at least 3 measured years.'};
    const mx=mean(p.map(p=>p.x)),my=mean(p.map(p=>p.y)),xx=p.reduce((s,p)=>s+(p.x-mx)**2,0);
    if(xx===0)return {reason:'Needs different years.'};
    const slope=p.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/xx,predict=x=>my+slope*(x-mx),
      residual=p.reduce((s,p)=>s+(p.y-predict(p.x))**2,0),total=p.reduce((s,p)=>s+(p.y-my)**2,0),
      lo=Math.min(...p.map(p=>p.x)),hi=Math.max(...p.map(p=>p.x));
    return {n,slope,intercept:my-slope*mx,r2:total>0?Math.max(0,Math.min(1,1-residual/total)):null,
      points:[{x:lo,y:predict(lo)},{x:hi,y:predict(hi)}]};
  }
  function movingAverage(points,window=3){
    return points.map((p,i)=>{
      const a=points.slice(i-window+1,i+1),complete=i>=window-1&&a.length===window&&a.every((q,j)=>finite(q.y)&&(!j||q.x===a[j-1].x+1));
      return {...p,y:complete?mean(a.map(q=>q.y)):null};
    });
  }
  function overlays(points,settings){
    const measured=points.filter(p=>finite(p.y)),result=[],info=[];
    if(settings.trend){const t=trend(points);if(t.reason)info.push(t.reason);else{result.push({kind:'trend',label:'Linear trend',points:t.points,fit:t});info.push(`Trend: ${t.n} measured years; slope ${t.slope.toPrecision(4)} per year; R² ${t.r2===null?'undefined (constant values)':t.r2.toFixed(3)}.`);}}
    if(settings.moving){const p=movingAverage(points);if(p.some(p=>finite(p.y)))result.push({kind:'moving',label:'3-year trailing mean',points:p});else info.push('Moving average needs 3 consecutive measured years.');}
    for(const kind of ['mean','median'])if(settings[kind]&&measured.length){const y=kind==='mean'?mean(measured.map(p=>p.y)):median(measured.map(p=>p.y));result.push({kind,label:kind==='mean'?'Mean of shown years':'Median of shown years',points:[{x:measured[0].x,y},{x:measured.at(-1).x,y}]});}
    return {lines:result,info};
  }
  function axis(numbers,zero=false){
    const values=numbers.filter(finite);let lo=values.length?values.reduce((a,b)=>Math.min(a,b),Infinity):0,hi=values.length?values.reduce((a,b)=>Math.max(a,b),-Infinity):1;
    if(zero){lo=Math.min(0,lo);hi=Math.max(0,hi);}
    const padding=lo===hi?Math.max(Math.abs(lo)*.05,1):(hi-lo)*.06;lo-=padding;hi+=padding;
    const rough=(hi-lo)/4,power=10**Math.floor(Math.log10(rough)),fraction=rough/power,
      step=([1,2,2.5,5,10].find(n=>n>=fraction)||10)*power;
    lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
    return {lo,hi,ticks:Array.from({length:Math.round((hi-lo)/step)+1},(_,i)=>Number((lo+i*step).toPrecision(10)))};
  }
  function path(points,x,y,continuous=false){let d='',last=null;for(const p of points){if(!finite(p.y)){last=null;continue;}d+=(last&&(continuous||p.x===last.x+1)?'L':'M')+x(p.x)+','+y(p.y)+' ';last=p;}return d;}
  function labels(items,top,bottom,gap=20){
    const sorted=items.map(p=>({...p})).sort((a,b)=>a.y-b.y);
    sorted.forEach((p,i)=>p.labelY=Math.max(top,p.y,i?sorted[i-1].labelY+gap:top));
    if(sorted.length){sorted.at(-1).labelY=Math.min(bottom,sorted.at(-1).labelY);for(let i=sorted.length-2;i>=0;i--)sorted[i].labelY=Math.min(sorted[i].labelY,sorted[i+1].labelY-gap);}
    return sorted;
  }
  return {finite,mean,median,series,trend,movingAverage,overlays,axis,path,labels};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=YearTwoChartMath;
