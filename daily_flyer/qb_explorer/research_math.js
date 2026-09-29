/* Pure research calculations. No fitted inputs use future outcomes or HOF status. */
const QBResearch = (() => {
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  const quantile=(a,q)=>{const s=[...a].sort((x,y)=>x-y),p=(s.length-1)*q,i=Math.floor(p);return s.length?s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(p-i):null;};
  const definitions={
    hof:{name:'Hall of Fame induction within 25 years',horizon:25,binary:true,event:'Inducted within 25 years after year two'},
    sb:{name:'Super Bowl wins in the next 10 seasons',horizon:10,binary:false,event:'At least one Super Bowl win in the next 10 seasons'},
    job:{name:'A 12-start season in year three',horizon:1,binary:true,event:'12 starts for one team in year three'},
    efficiency:{name:'Mean efficiency in years 3–7',horizon:5,binary:false,event:null}
  };
  function cohort(data,{metric='relative_anya',outcome='hof',era='all'}={}){
    const def=definitions[outcome],rows=[],excluded={anchor:0,pair:0,followup:0,outcome:0};
    const cut=outcome==='hof'?Number(data.meta.hof_as_of.slice(0,4)):outcome==='sb'?Math.min(data.meta.through,data.super_bowls.through_season):data.meta.through;
    let candidates=0;
    for(const p of data.players){
      if(era!=='all'&&Math.floor(p.first/10)*10!==Number(era))continue;
      candidates++;
      if(p.first<1970||p.anchor_uncertain){excluded.anchor++;continue;}
      const one=p.seasons.find(r=>r.year===p.first),two=p.seasons.find(r=>r.year===p.first+1);
      if(!finite(one?.[metric])||!finite(two?.[metric])){excluded.pair++;continue;}
      const year2=p.first+1,end=year2+def.horizon;
      if(end>cut){excluded.followup++;continue;}
      let y=null,event=null;
      if(outcome==='hof')y=Number(!!p.hof&&p.hof>year2&&p.hof<=end);
      if(outcome==='sb')y=data.super_bowls.wins.filter(w=>w.pfr_id===p.id&&w.season>year2&&w.season<=end).length;
      if(outcome==='job'){
        const next=p.seasons.find(r=>r.year===year2+1);
        if(next&&finite(next.gs)&&!next.unresolved_split)y=Number(next.qualifies);
      }
      if(outcome==='efficiency'){
        const future=p.seasons.filter(r=>r.year>year2&&r.year<=end&&finite(r.relative_anya));
        if(future.length>=3)y=mean(future.map(r=>r.relative_anya));
      }
      if(!finite(y)){excluded.outcome++;continue;}
      if(outcome!=='efficiency')event=outcome==='sb'?Number(y>0):y;
      rows.push({id:p.id,name:p.name,hof:p.hof,first:p.first,year2,end,a:one[metric],b:two[metric],delta:two[metric]-one[metric],y,event,y2starts:two.gs});
    }
    return {rows,excluded,candidates,cut,def};
  }
  function pearson(x,y){
    if(x.length<3||x.length!==y.length)return null;
    const a=mean(x),b=mean(y);let cross=0,vx=0,vy=0;
    for(let i=0;i<x.length;i++){cross+=(x[i]-a)*(y[i]-b);vx+=(x[i]-a)**2;vy+=(y[i]-b)**2;}
    return vx>0&&vy>0?Math.max(-1,Math.min(1,cross/Math.sqrt(vx*vy))):null;
  }
  function ranks(a){
    const sorted=a.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),result=[];
    for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&sorted[j].v===sorted[i].v)j++;for(let k=i;k<j;k++)result[sorted[k].i]=(i+j-1)/2;i=j;}return result;
  }
  const spearman=(x,y)=>pearson(ranks(x),ranks(y));
  function interval(x,y){
    if(x.length<8)return null;
    let seed=42;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;},estimates=[];
    for(let b=0;b<400;b++){const a=[],c=[];for(let i=0;i<x.length;i++){const j=Math.floor(random()*x.length);a.push(x[j]);c.push(y[j]);}const r=pearson(a,c);if(finite(r))estimates.push(r);}
    return estimates.length>=300?[quantile(estimates,.025),quantile(estimates,.975)]:null;
  }
  function wilson(k,n){
    if(!n)return null;const z=1.96,p=k/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [center-h,center+h];
  }
  function patterns(rows,direction=1){
    const a=rows.map(r=>r.a*direction),b=rows.map(r=>r.b*direction);
    const cut={aLow:quantile(a,1/3),aHigh:quantile(a,2/3),bLow:quantile(b,1/3),bHigh:quantile(b,2/3)};
    const groups=[{key:'HH',name:'Strong → strong'},{key:'HL',name:'Strong → weak'},{key:'LH',name:'Weak → strong'},{key:'LL',name:'Weak → weak'}].map(g=>({...g,rows:[]}));
    const level=(v,lo,hi)=>lo===hi?'M':v>=hi?'H':v<=lo?'L':'M';
    for(const r of rows){const key=level(r.a*direction,cut.aLow,cut.aHigh)+level(r.b*direction,cut.bLow,cut.bHigh);groups.find(g=>g.key===key)?.rows.push(r);}
    return {groups,cut,mixed:rows.length-groups.reduce((s,g)=>s+g.rows.length,0)};
  }
  function split(rows){
    const sorted=[...rows].sort((a,b)=>a.first-b.first||a.id.localeCompare(b.id));
    if(!sorted.length)return {train:[],test:[],boundary:null};
    const boundary=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.75))].first;
    return {train:sorted.filter(r=>r.first<boundary),test:sorted.filter(r=>r.first>=boundary),boundary};
  }
  const sigmoid=z=>1/(1+Math.exp(-Math.max(-35,Math.min(35,z))));
  function fit(rows,keys){
    const means=keys.map(k=>mean(rows.map(r=>r[k]))),sds=keys.map((k,j)=>Math.sqrt(mean(rows.map(r=>(r[k]-means[j])**2)))||1);
    const features=r=>[1,...keys.map((k,j)=>(r[k]-means[j])/sds[j])],xs=rows.map(features);
    const prevalence=mean(rows.map(r=>r.event)),w=[Math.log((prevalence+.001)/(1-prevalence+.001)),...keys.map(()=>0)],lambda=.02;
    for(let step=0;step<1800;step++){
      const grad=w.map(()=>0);
      rows.forEach((r,i)=>{const error=sigmoid(xs[i].reduce((s,v,j)=>s+v*w[j],0))-r.event;xs[i].forEach((v,j)=>grad[j]+=error*v/rows.length);});
      for(let j=1;j<w.length;j++)grad[j]+=lambda*w[j];
      for(let j=0;j<w.length;j++)w[j]-=.2*grad[j];
      if(Math.max(...grad.map(Math.abs))<1e-7)break;
    }
    return {predict:r=>sigmoid(features(r).reduce((s,v,j)=>s+v*w[j],0)),means,sds,weights:w,keys,prevalence};
  }
  function auc(actual,predicted){
    let wins=0,pairs=0;
    actual.forEach((a,i)=>{if(a===1)actual.forEach((b,j)=>{if(b===0){pairs++;wins+=predicted[i]>predicted[j]?1:predicted[i]===predicted[j]?.5:0;}});});
    return pairs?wins/pairs:null;
  }
  const brier=(y,p)=>mean(y.map((v,i)=>(v-p[i])**2));
  function validate(rows){
    const {train,test,boundary}=split(rows),positives=train.filter(r=>r.event===1).length;
    const result={train,test,boundary,positives};
    if(train.length<40||test.length<12||positives<5||train.length-positives<5)return {...result,error:'Need at least 40 earlier QBs (5 events and 5 non-events) and 12 later QBs. Widen the cohort or choose another outcome.'};
    const baseline=fit(train,['a','first']),full=fit(train,['a','b','first']),y=test.map(r=>r.event);
    const evaluate=model=>{const p=test.map(model.predict);return {brier:brier(y,p),auc:auc(y,p),predictions:p};};
    return {...result,baseline,full,baseScore:evaluate(baseline),fullScore:evaluate(full),nullBrier:brier(y,test.map(()=>full.prevalence)),testEvents:y.reduce((s,v)=>s+v,0)};
  }
  return {definitions,cohort,mean,quantile,pearson,spearman,interval,wilson,patterns,split,fit,auc,brier,validate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=QBResearch;
