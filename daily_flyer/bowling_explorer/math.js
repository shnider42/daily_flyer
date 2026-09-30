/* Profile years are source labels, not official rookie-season classifications. */
const BowlingMath = (() => {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const mean = a => a.length ? a.reduce((s,n)=>s+n,0)/a.length : null;
  function anchor(player, threshold=10) {
    return player.seasons.find(s=>finite(s.events) && s.events>=Number(threshold))?.year ?? null;
  }
  function pair(player, metric, threshold=10) {
    const first=anchor(player,threshold), one=player.seasons.find(s=>s.year===first),
      two=first===null?null:player.seasons.find(s=>s.year===first+1);
    const a=one?.[metric]??null,b=two?.[metric]??null;
    return {first,one,two,a,b,delta:finite(a)&&finite(b)?b-a:null};
  }
  function eligible(players, state) {
    const query=state.search.trim().toLowerCase();
    return players.filter(p=>{
      const q=pair(p,state.metric,state.threshold);
      return q.first!==null && (state.hand==='all'||p.hand===state.hand) &&
        (!query||(p.name+' '+p.hometown).toLowerCase().includes(query)) &&
        (!state.qual2||(q.two?.events??0)>=Number(state.threshold)) &&
        (!state.skip2020||(q.first!==2020&&q.first+1!==2020));
    });
  }
  function ranked(players,state) {
    const sign=state.selection==='declined'?-1:1;
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
  return {finite,mean,anchor,pair,eligible,ranked,series,cohort};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BowlingMath;
