/* Profile years are source labels, not official rookie-season classifications. */
const BowlingMath = (() => {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const mean = a => a.length ? a.reduce((s,n)=>s+n,0)/a.length : null;
  const workload = (player,row) => (player.dataset==='usbc'?row?.games:row?.events)??null;
  function anchor(player, threshold=10) {
    return player.seasons.find(s=>finite(workload(player,s)) && workload(player,s)>=Number(threshold))?.year ?? null;
  }
  function pair(player, metric, threshold=10) {
    const first=anchor(player,threshold), one=player.seasons.find(s=>s.year===first),
      two=first===null?null:player.seasons.find(s=>s.year===first+1);
    const a=one?.[metric]??null,b=two?.[metric]??null;
    return {first,one,two,a,b,delta:finite(a)&&finite(b)?b-a:null};
  }
  function eligible(players, state) {
    return players.filter(p=>{
      const q=pair(p,state.metric,state.threshold);
      return q.first!==null && (state.hand==='all'||p.hand===state.hand) &&
        (!state.division||state.division==='all'||p.division===state.division) &&
        (!state.qual2||(workload(p,q.two)??0)>=Number(state.threshold)) &&
        (!state.skip2020||(q.first!==2020&&q.first+1!==2020));
    });
  }
  function timeValue(point, state) {
    return state.timeline==='calendar'?point.year:point.x;
  }
  function timeDomain(points, state) {
    const values=points.map(p=>timeValue(p,state));
    const lo=values.length?Math.min(...values):state.timeline==='calendar'?2000:1;
    return {lo,hi:Math.max(lo+1,...values)};
  }
  function labelPositions(items, top, bottom, gap=22) {
    const sorted=items.map(item=>({...item})).sort((a,b)=>a.y-b.y);
    if(!sorted.length)return sorted;
    const spacing=Math.min(gap,(bottom-top)/Math.max(1,sorted.length-1));
    sorted.forEach((item,i)=>{item.labelY=Math.max(top,item.y,i?sorted[i-1].labelY+spacing:top);});
    sorted[sorted.length-1].labelY=Math.min(bottom,sorted[sorted.length-1].labelY);
    for(let i=sorted.length-2;i>=0;i--)sorted[i].labelY=Math.min(sorted[i].labelY,sorted[i+1].labelY-spacing);
    return sorted;
  }
  function ranked(players,state) {
    const lowerBetter=state.dataset==='usbc'&&['finish','ranking_points'].includes(state.metric);
    const sign=(state.selection==='declined'?-1:1)*(lowerBetter?-1:1);
    return eligible(players,state).map(p=>({p,q:pair(p,state.metric,state.threshold)}))
      .filter(({q})=>finite(q.delta)&&q.delta*sign>0)
      .sort((a,b)=>sign*(b.q.delta-a.q.delta)||a.p.name.localeCompare(b.p.name))
      .slice(0,state.count).map(({p})=>p.id);
  }
  function series(player,state) {
    const q=pair(player,state.metric,state.threshold);
    if(q.first===null)return [];
    const end=state.view==='pair'?q.first+1:Math.max(q.first+1,...player.seasons.map(s=>s.year));
    const result=[];
    for(let year=q.first;year<=end;year++) {
      const row=player.seasons.find(s=>s.year===year),raw=row?.[state.metric]??null;
      const value=state.normalize==='delta'?(finite(raw)&&finite(q.a)?raw-q.a:null):raw;
      result.push({year,x:year-q.first+1,raw,value,row});
    }
    return result;
  }
  function cohort(players,state,through) {
    const rows=[],excluded={pair:0,followup:0,missing:0};
    const candidates=eligible(players,state);
    for(const p of candidates) {
      const q=pair(p,state.metric,state.threshold);
      if(!finite(q.delta)){excluded.pair++;continue;}
      if(q.first+4>through){excluded.followup++;continue;}
      const future=[2,3,4].map(offset=>p.seasons.find(s=>s.year===q.first+offset)?.[state.outcome]);
      if(!future.every(finite)){excluded.missing++;continue;}
      rows.push({id:p.id,name:p.name,first:q.first,a:q.a,b:q.b,delta:q.delta,x:q[state.predictor],y:mean(future),source:p.source});
    }
    return {rows,excluded,candidates:candidates.length};
  }
  return {finite,mean,workload,anchor,pair,eligible,ranked,series,cohort,timeValue,timeDomain,labelPositions};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BowlingMath;
