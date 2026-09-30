/* Pure baseball study logic. Shared generic statistics come from QBResearch. */
const BaseballResearch = (() => {
  'use strict';
  const S = typeof module !== 'undefined' && module.exports ? require('../qb_explorer/research_math.js') : QBResearch;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const definitions = {
    job: {name:'A substantial season in year three', horizon:1, binary:true, event:'Reached 300 PA / 50 IP in year three'},
    durable: {name:'Staying power in years 3–7', horizon:5, binary:true, event:'At least three substantial seasons in years 3–7'},
    future: {name:'Same statistic in years 3–7', horizon:5, binary:false, event:'Mean across at least three observed seasons'},
    stars: {name:'All-Star selections in the next 10 years', horizon:10, binary:false, event:'At least one later All-Star selection'},
    awards: {name:'MVP / Cy Young in the next 10 years', horizon:10, binary:true, event:'At least one later MVP or Cy Young award'},
    hof: {name:'Hall induction within 25 years', horizon:25, binary:true, event:'Inducted as a player within 25 years after year two'}
  };
  function pair(p, metric) {
    const one=p.seasons.find(s=>s.year===p.first), two=p.seasons.find(s=>s.year===p.first+1);
    const a=one?.[metric],b=two?.[metric];
    return {one,two,a:finite(a)?a:null,b:finite(b)?b:null,delta:finite(a)&&finite(b)?b-a:null};
  }
  function filtered(players, state, teams={}) {
    const query=state.search.trim().toLowerCase();
    return players.filter(p=>{
      const codes=p.teams || [...new Set(p.seasons.flatMap(s=>s.team.split(' / ')))];
      return (state.era==='all'||Math.floor(p.first/10)*10===Number(state.era)) &&
        (state.team==='all'||codes.includes(state.team)) &&
        (state.hof==='all'||(state.hof==='yes'?!!p.hof:!p.hof)) &&
        (!state.qual2||!!pair(p,state.metric).two?.qualifies) &&
        (!state.skip2020||(p.first!==2019&&p.first!==2020)) &&
        (!query||(p.name+' '+codes.map(c=>c+' '+(teams[c]||'')).join(' ')).toLowerCase().includes(query));
    });
  }
  function cohort(players, state, meta) {
    const def=definitions[state.outcome], rows=[],excluded={pair:0,followup:0,outcome:0};
    const cut=state.outcome==='hof'?meta.hof_through:meta.through;
    for(const p of players){
      const {one,two,a,b,delta}=pair(p,state.metric);
      if(!finite(a)||!finite(b)){excluded.pair++;continue;}
      const year2=p.first+1,end=year2+def.horizon;
      // The same completed window is required for successes and failures.
      if(end>cut){excluded.followup++;continue;}
      const later=p.seasons.filter(s=>s.year>year2&&s.year<=end);
      let y=null,event=null;
      if(state.outcome==='job')y=Number(later.some(s=>s.year===year2+1&&s.qualifies));
      if(state.outcome==='durable')y=Number(later.filter(s=>s.qualifies).length>=3);
      if(state.outcome==='hof')y=Number(!!p.hof&&p.hof>year2&&p.hof<=end);
      if(state.outcome==='awards')y=Number(p.awards.some(year=>year>year2&&year<=end));
      if(state.outcome==='stars')y=p.stars.filter(year=>year>year2&&year<=end).length;
      if(state.outcome==='future'){
        const values=later.map(s=>s[state.metric]).filter(finite);
        if(values.length>=3)y=S.mean(values);
      }
      if(!finite(y)){excluded.outcome++;continue;}
      if(state.outcome!=='future')event=state.outcome==='stars'?Number(y>0):y;
      rows.push({id:p.id,name:p.name,first:p.first,year2,end,a,b,delta,y,event,hof:p.hof,one,two});
    }
    return {rows,excluded,candidates:players.length,cut,def};
  }
  function correlation(rows, x='b', bootstrap=false) {
    const a=rows.map(r=>r[x]),b=rows.map(r=>r.y);
    return {pearson:S.pearson(a,b),spearman:S.spearman(a,b),interval:bootstrap?S.interval(a,b):null};
  }
  function linearFit(rows,keys) {
    // Standardized ridge least squares, solved by Gaussian elimination.
    const means=keys.map(k=>S.mean(rows.map(r=>r[k]))),sds=keys.map((k,j)=>Math.sqrt(S.mean(rows.map(r=>(r[k]-means[j])**2)))||1);
    const features=r=>[1,...keys.map((k,j)=>(r[k]-means[j])/sds[j])],n=keys.length+1;
    const matrix=Array.from({length:n},()=>Array(n+1).fill(0));
    for(const r of rows){const x=features(r);for(let i=0;i<n;i++){for(let j=0;j<n;j++)matrix[i][j]+=x[i]*x[j]/rows.length;matrix[i][n]+=x[i]*r.y/rows.length;}}
    for(let i=1;i<n;i++)matrix[i][i]+=.02;
    for(let i=0;i<n;i++){
      let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(matrix[j][i])>Math.abs(matrix[pivot][i]))pivot=j;
      [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];
      const divisor=matrix[i][i];if(Math.abs(divisor)<1e-12)return null;
      for(let k=i;k<=n;k++)matrix[i][k]/=divisor;
      for(let j=0;j<n;j++)if(j!==i){const factor=matrix[j][i];for(let k=i;k<=n;k++)matrix[j][k]-=factor*matrix[i][k];}
    }
    const weights=matrix.map(r=>r[n]);
    return {predict:r=>features(r).reduce((s,x,i)=>s+x*weights[i],0)};
  }
  function validate(rows, continuous=false) {
    if(!continuous){
      const result=S.validate(rows);
      if(result.error)result.error=result.error.replaceAll('QBs','players');
      return {...result,kind:'binary'};
    }
    const {train,test,boundary}=S.split(rows);
    if(train.length<40||test.length<12)return {error:'Need 40 earlier and 12 later players. Widen the filters.',train,test,boundary,kind:'continuous'};
    const baseline=linearFit(train,['a','first']),full=linearFit(train,['a','b','first']);
    if(!baseline||!full)return {error:'Not enough variation to fit this comparison.',train,test,boundary};
    const mse=model=>S.mean(test.map(r=>(r.y-model.predict(r))**2));
    return {train,test,boundary,kind:'continuous',baseMSE:mse(baseline),fullMSE:mse(full),nullMSE:S.mean(test.map(r=>(r.y-S.mean(train.map(t=>t.y)))**2))};
  }
  return {definitions,pair,filtered,cohort,correlation,validate,linearFit,finite};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BaseballResearch;
