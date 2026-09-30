(() => {
  'use strict';
  const config=JSON.parse(document.getElementById('bw-data').textContent),M=BowlingMath,
    $=id=>document.getElementById('bw-'+id),clone=v=>JSON.parse(JSON.stringify(v)),
    esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    key='bowling-year-two-v1',colors=['#644b8c','#007a80','#b14a2c','#437a3e','#956315','#ad467c','#305aac','#64574a'];
  let state=clone(config.defaults),focus={id:'',year:null},presets=clone(config.presets.presets),active='rivals',undo=null;
  const known=new Map(config.players.map(p=>[p.id,p]));
  function valid(s){
    if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid view');
    const result=clone(config.defaults);
    for(const k of Object.keys(result)){
      const v=s[k];
      if(config.choices[k]){if(!config.choices[k].includes(v))throw Error('Invalid '+k);result[k]=v;}
      else if(k==='ids'){if(!Array.isArray(v)||v.some(id=>!known.has(id)))throw Error('Unknown bowler');result[k]=[...new Set(v)];}
      else if(k==='count'){if(!Number.isInteger(v)||v<1||v>known.size)throw Error('Invalid count');result[k]=v;}
      else if(k==='search'){if(typeof v!=='string'||v.length>100)throw Error('Invalid search');result[k]=v;}
      else {if(typeof v!=='boolean')throw Error('Invalid filter');result[k]=v;}
    }
    return result;
  }
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){state=valid(saved.state);focus=known.has(saved.focus?.id)?saved.focus:focus;active='';}else state=valid(presets[0].settings);}catch(_){state=clone(config.defaults);active='rivals';}
  function persist(){try{localStorage.setItem(key,JSON.stringify({state,focus}));}catch(_){}}
  function fmt(value,metric=state.metric,sign=false){
    if(!M.finite(value))return 'Unavailable';
    const m=config.metrics[metric],number=Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:m.digits,maximumFractionDigits:m.digits});
    return (value<0?'−':sign&&value>0?'+':'')+(metric.startsWith('earnings')?'$':'')+number+(metric==='cash_rate'?'%':'');
  }
  function delta(value){return state.metric==='cash_rate'?fmt(value,state.metric,true).replace('%','')+' percentage points':fmt(value,state.metric,true)+' '+config.metrics[state.metric].unit;}
  function color(id){let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;return colors[h%colors.length];}
  const filtered=()=>M.eligible(config.players,state);
  const selected=()=>{const ids=new Set(state.ids);return filtered().filter(p=>ids.has(p.id)).sort((a,b)=>state.ids.indexOf(a.id)-state.ids.indexOf(b.id));};
  function materialize(s){const value=valid(s);if(value.selection!=='fixed')value.ids=M.ranked(config.players,value);return value;}
  function snapshot(){return clone({state,focus,active});}
  function apply(s,title,note,id=''){
    if(!undo){undo=snapshot();$('undo').hidden=false;}
    state=materialize(s);focus={id:'',year:null};active=id;
    render();if(!id){$('story-title').textContent=title||'Draft preview';$('story-note').textContent=note||'';}
  }
  function story(id){const p=presets.find(p=>p.id===id);if(p)apply(p.settings,p.title,p.note,id);}
  function manual(){active='';state.selection='fixed';}
  function storyButtons(){
    $('stories').innerHTML=presets.map(p=>{
      const s=p.settings,who=s.mode==='research'?'Full filtered cohort':s.selection==='fixed'?s.ids.map(id=>known.get(id)?.name).filter(Boolean).join(', '):`Top ${s.count} ${s.selection==='declined'?'drops':'gains'} among qualifying profiles`;
      return `<button data-story="${p.id}" aria-pressed="${active===p.id}"><strong>${esc(p.label)}</strong><span>${esc(p.title)}</span><small>${esc(config.metrics[s.metric].name)} · ${esc(who)}</small></button>`;
    }).join('');
  }
  function controls(){
    for(const k of ['metric','threshold','hand','height','layout','normalize','predictor','outcome','search'])$(k).value=state[k];
    for(const k of ['qual2','skip2020'])$(k).checked=state[k];
    document.querySelectorAll('#bw-app [data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    document.querySelectorAll('#bw-app [data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
    $('compare').hidden=state.mode!=='compare';$('research').hidden=state.mode!=='research';
    $('metric-note').textContent=config.metrics[state.metric].note;
    $('clock-one').textContent=`First listed year with at least ${state.threshold} profile events. This is our study baseline, not an official rookie designation.`;
  }
  function roster(){
    const list=filtered(),ids=new Set(state.ids);
    $('selection-count').textContent=`${list.length} matching bowlers · ${list.filter(p=>ids.has(p.id)).length} selected here · ${state.ids.length} selected overall. No display cap.`;
    $('players').innerHTML=list.map(p=>`<label class="bw-player"><input type="checkbox" data-player="${p.id}" ${ids.has(p.id)?'checked':''}><span>${esc(p.name)}<small>Baseline ${M.anchor(p,state.threshold)} · ${esc(p.hand||'Hand unlisted')} · ${esc(p.hometown)}</small></span></label>`).join('')||'<p>No profiles match these filters.</p>';
  }
  function pairReadout(p){
    const q=M.pair(p,state.metric,state.threshold),sample=q.two&&q.two.events<Number(state.threshold),missing=!M.finite(q.delta);
    return `<div class="bw-pair"><div><span>YEAR 1 · ${q.first}</span><strong>${fmt(q.a)}</strong><small>${q.one.events??'Unknown'} events</small></div><div><span>YEAR 2 · ${q.first+1}</span><strong>${fmt(q.b)}</strong><small>${q.two?(q.two.events??'Unknown')+' events':'No profile row'}</small></div></div><p class="bw-delta">${missing?'No measured year-one / year-two change.':delta(q.delta)+' from year one.'}</p>${sample?'<p class="bw-warning">Smaller year-two workload: below the selected event threshold.</p>':''}`;
  }
  function scale(values){
    const nums=values.filter(M.finite);let lo=nums.length?Math.min(...nums):0,hi=nums.length?Math.max(...nums):1;
    const pad=hi===lo?Math.max(1,Math.abs(lo)*.03):(hi-lo)*.08;
    lo-=pad;hi+=pad;return {lo,hi};
  }
  function seasonText(p,s){
    const first=M.anchor(p,state.threshold);
    return `${p.name} · ${s.year} (year ${s.x}) · ${config.metrics[state.metric].name}: ${fmt(s.raw)} · ${s.row?.events??'Unknown'} events`+(s.year===first+1?' · Year two':'');
  }
  function pin(id,year=null){focus={id:focus.id===id&&year===null?'':id,year};persist();highlight();}
  function highlight(){
    const list=selected();if(!list.some(p=>p.id===focus.id)){focus={id:'',year:null};}
    $('highlight').value=focus.id;
    document.querySelectorAll('#bw-charts [data-series]').forEach(g=>g.style.opacity=state.layout==='overlay'&&focus.id&&g.dataset.series!==focus.id?'0.15':'1');
    document.querySelectorAll('#bw-legend button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pin===focus.id)));
    const p=known.get(focus.id),s=p&&M.series(p,state).find(s=>s.year===focus.year&&M.finite(s.value));
    $('inspect').textContent=s?seasonText(p,s):p?`${p.name} highlighted. Tap a season for its value.`:'Tap or focus a point to inspect that season.';
    document.querySelectorAll('.bw-panel-inspect').forEach(el=>el.textContent=s&&el.dataset.inspect===p.id?seasonText(p,s):'Tap a point for its season and event count.');
  }
  function graph(list,bounds,maxX,width,height,separate){
    const left=64,right=20,top=32,bottom=45,w=width-left-right,h=height-top-bottom,
      x=v=>left+(v-1)/Math.max(1,maxX-1)*w,y=v=>top+(bounds.hi-v)/(bounds.hi-bounds.lo)*h;
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(config.metrics[state.metric].name)} by ${separate?'profile year':'year from baseline'}"><title>${esc(config.metrics[state.metric].name)}. Orange is year two. Missing years break the line.</title>`;
    for(let i=0;i<5;i++){const v=bounds.lo+(bounds.hi-bounds.lo)*i/4;svg+=`<line class="bw-grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="bw-axis" text-anchor="end" x="${left-8}" y="${y(v)+4}">${esc(fmt(v))}</text>`;}
    const xs=[...new Set([1,2,...Array.from({length:4},(_,i)=>Math.round(1+(maxX-1)*(i+1)/4))])].sort((a,b)=>a-b);
    // Avoid overlapping adjacent end labels on narrow phone graphs.
    const ticks=[];
    for(const v of xs){if(v===1&&x(2)-x(1)<38)continue;if(v===2||ticks.every(t=>Math.abs(x(v)-x(t))>38))ticks.push(v);}
    for(const v of ticks){const year=separate?M.anchor(list[0],state.threshold)+v-1:'Y'+v;if(separate&&year>Math.max(...list[0].seasons.map(s=>s.year)))continue;svg+=`<text class="bw-axis" text-anchor="middle" x="${x(v)}" y="${height-24}">${year}</text>`;}
    svg+=`<line class="bw-y2-rule" x1="${x(2)}" x2="${x(2)}" y1="${top}" y2="${height-bottom}"/><text class="bw-y2-label" text-anchor="${maxX===2?'end':'start'}" x="${x(2)+(maxX===2?-5:5)}" y="18">YEAR 2</text>`;
    for(const p of list){
      const points=M.series(p,state);let path='',last=false;
      for(const s of points){if(!M.finite(s.value)){last=false;continue;}path+=(last?'L':'M')+x(s.x)+','+y(s.value)+' ';last=true;}
      svg+=`<g data-series="${p.id}"><path class="bw-trace" stroke="${color(p.id)}" d="${path}"/>`;
      for(const s of points.filter(s=>M.finite(s.value))){
        const fill=s.x===2?'#c45325':color(p.id),hollow=(s.row?.events??0)<Number(state.threshold);
        svg+=`<circle class="bw-dot" data-point="${p.id}" data-year="${s.year}" cx="${x(s.x)}" cy="${y(s.value)}" r="${s.x===2?6:4.5}" fill="${hollow?'#fffcf6':fill}" stroke="${fill}" tabindex="0" role="button" aria-label="${esc(seasonText(p,s))}"><title>${esc(seasonText(p,s))}</title></circle>`;
      }
      svg+='</g>';
    }
    return svg+'</svg>';
  }
  function compare(){
    const list=selected(),pairs=list.map(p=>M.pair(p,state.metric,state.threshold)),measured=pairs.filter(q=>M.finite(q.delta)),ups=measured.filter(q=>q.delta>0).length,downs=measured.filter(q=>q.delta<0).length;
    $('takeaway').textContent=list.length?`${measured.length} of ${list.length} selected bowlers have both years measured: ${ups} rose, ${downs} fell and ${measured.length-ups-downs} stayed level in ${config.metrics[state.metric].name.toLowerCase()}. ${list.length-measured.length} lack a comparison. These changes describe this selection, not why it happened.`:'No selected bowlers match. Pick a story, or use Guided to choose bowlers.';
    $('chart-title').textContent=config.metrics[state.metric].name+' · '+(state.view==='pair'?'the first two years':'what came next');
    $('chart-note').textContent=`${config.metrics[state.metric].note} ${state.normalize==='delta'?'Graph values are changes from each bowler’s first substantial year.':'Graph values are actual profile statistics.'} ${state.layout==='separate'?'All panels share value bounds and years-from-baseline spacing; labels show the actual source years.':'X = years from each bowler’s baseline, not shared calendar dates.'} Hollow dots indicate fewer than ${state.threshold} events.`;
    const noRow=pairs.filter(q=>!q.two).length,low=pairs.filter(q=>q.two&&q.two.events<Number(state.threshold)).length;
    $('warning').textContent=`${noRow} selected bowlers have no next-year row; ${low} have a smaller year-two workload. Missing data never becomes zero, and lines stop at gaps. Profile figures are not national Tour-only rankings.`;
    $('legend').innerHTML=list.map(p=>`<button data-pin="${p.id}" aria-pressed="false"><i style="background:${color(p.id)}"></i>${esc(p.name)}</button>`).join('');
    $('highlight').innerHTML='<option value="">Everyone</option>'+list.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const chart=$('charts');chart.classList.toggle('bw-separated',state.layout==='separate');
    if(!list.length){chart.innerHTML='<p>No bowlers selected for these filters. Open Guided to select matching players.</p>';$('table').innerHTML='';highlight();return;}
    const all=list.flatMap(p=>M.series(p,state)),bounds=scale(all.map(s=>s.value)),maxX=Math.max(2,...all.map(s=>s.x)),separate=state.layout==='separate',
      columns=separate&&innerWidth>1000?2:1,width=Math.max(260,Math.floor((chart.clientWidth-(columns-1)*20)/columns)),height={compact:210,normal:310,tall:550}[state.height];
    const groups=separate?list.map(p=>[p]):[list];
    chart.innerHTML=groups.map(group=>{
      const p=group[0],points=group.flatMap(p=>M.series(p,state)).filter(s=>M.finite(s.value));
      return `<article class="bw-panel" data-panel="${separate?p.id:'overlay'}"><div class="bw-panel-header"><h3>${separate?esc(p.name):list.length+' bowlers · shared axes'}</h3>${separate?`<a href="${esc(p.source)}" target="_blank" rel="noopener">PBA profile ↗</a>`:''}</div>${points.length?graph(group,bounds,maxX,width,height,separate):'<p class="bw-warning">No measured values in this window. Choose another statistic or view.</p>'}${separate?pairReadout(p):''}${separate?`<p class="bw-panel-inspect" data-inspect="${p.id}"></p>`:''}</article>`;
    }).join('');
    $('table').innerHTML=list.flatMap(p=>M.series(p,state).map(s=>`<tr><td>${esc(p.name)}</td><td>${s.year}</td><td>${s.row?.events??'Unavailable'}</td><td>${esc(config.metrics[state.metric].name)}</td><td>${fmt(s.raw)}</td><td><a href="${esc(p.source)}" target="_blank" rel="noopener">PBA</a></td></tr>`)).join('');
    highlight();
  }
  const predictorName=()=>({a:'year-one value',b:'year-two value',delta:'year-two change'}[state.predictor]);
  function research(){
    const c=M.cohort(config.players,state,config.meta.through),{rows}=c,xs=rows.map(r=>r.x),ys=rows.map(r=>r.y),rho=QBResearch.spearman(xs,ys),pearson=QBResearch.pearson(xs,ys);
    $('research-reading').textContent=rows.length<3?'Too few complete profiles to describe a relationship. Widen the filters or choose another measure.':!M.finite(rho)?'These values have too little variation to calculate a rank relationship.':`Among these ${rows.length} complete profiles, ${Math.abs(rho)<.1?'there is little rank relationship':`higher ${predictorName()} tended to accompany ${rho>0?'higher':'lower'} later values`}. That association does not establish cause or show that year two improves predictions beyond year one.`;
    $('cohort-note').textContent=`${rows.length} complete profiles from ${c.candidates} matching candidates. Excluded: ${c.excluded.pair} missing first/second-year values; ${c.excluded.followup} without a full follow-up window through ${config.meta.through}; ${c.excluded.missing} missing at least one of years 3–5. All three later years must be recorded.`;
    $('research-axes').textContent=`Across → ${predictorName()} in ${config.metrics[state.metric].name.toLowerCase()}. Up ↑ mean ${config.metrics[state.outcome].name.toLowerCase()} in years 3–5. One dot = one bowler.`;
    $('research-numbers').textContent=`Spearman rank correlation: ${M.finite(rho)?rho.toFixed(3):'unavailable'} · Pearson correlation: ${M.finite(pearson)?pearson.toFixed(3):'unavailable'} · n = ${rows.length}. Values near ±1 show stronger association; near zero does not rule out nonlinear patterns.`;
    if(!rows.length){$('scatter').innerHTML='<p>No complete profiles meet these filters.</p>';return;}
    const width=Math.max(270,$('scatter').clientWidth),height=360,left=68,right=20,top=24,bottom=55,bx=scale(xs),by=scale(ys),
      x=v=>left+(v-bx.lo)/(bx.hi-bx.lo)*(width-left-right),y=v=>top+(by.hi-v)/(by.hi-by.lo)*(height-top-bottom);
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(predictorName())} versus later ${esc(config.metrics[state.outcome].name)}"><title>Each point is a complete profile; descriptive association only.</title>`;
    for(let i=0;i<5;i++){const vx=bx.lo+(bx.hi-bx.lo)*i/4,vy=by.lo+(by.hi-by.lo)*i/4;svg+=`<line class="bw-grid" x1="${left}" x2="${width-right}" y1="${y(vy)}" y2="${y(vy)}"/><text class="bw-axis" text-anchor="end" x="${left-8}" y="${y(vy)+4}">${fmt(vy,state.outcome)}</text><text class="bw-axis" text-anchor="${i===4?'end':'middle'}" x="${x(vx)}" y="${height-30}">${fmt(vx)}</text>`;}
    for(const r of rows){const text=`${r.name} · ${predictorName()}: ${fmt(r.x)} · years 3–5: ${fmt(r.y,state.outcome)}`;svg+=`<circle class="bw-research-dot" cx="${x(r.x)}" cy="${y(r.y)}" r="6" fill="${color(r.id)}" stroke="#fff5e5" stroke-width="1.5" tabindex="0" role="button" data-research="${r.id}" aria-label="${esc(text)}"><title>${esc(text)}</title></circle>`;}
    $('scatter').innerHTML=svg+'</svg>';
    $('research-inspect').textContent='Tap or focus a dot to see the bowler.';
  }
  function render(){
    controls();roster();storyButtons();
    const p=presets.find(p=>p.id===active);
    $('story-title').textContent=p?.title||(state.mode==='compare'?'Your bowling comparison':'Your later-career question');
    $('story-note').textContent=(p?.note?p.note+' ':'')+`${config.metrics[state.metric].name} · baseline ${state.threshold}+ events · ${state.mode==='research'?'full filtered cohort':state.view==='career'?'full recorded career from baseline':'year one to year two'}.`;
    if(state.mode==='compare')compare();else research();persist();
  }
  function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function csv(rows){return rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}
  $('metric').innerHTML=Object.entries(config.metrics).map(([key,m])=>`<option value="${key}">${esc(m.name)}</option>`).join('');
  for(const k of ['metric','threshold','hand','height','layout','normalize','predictor','outcome','qual2','skip2020'])$(k).addEventListener('change',()=>{state[k]=['qual2','skip2020'].includes(k)?$(k).checked:$(k).value;manual();render();});
  $('search').addEventListener('input',()=>{state.search=$('search').value;manual();render();});
  $('highlight').onchange=()=>{focus={id:$('highlight').value,year:null};persist();highlight();};
  $('select-all').onclick=()=>{state.ids=[...new Set([...state.ids,...filtered().map(p=>p.id)])];manual();render();};
  $('clear').onclick=()=>{state.ids=[];manual();render();};
  $('undo').onclick=()=>{if(!undo)return;({state,focus,active}=clone(undo));undo=null;$('undo').hidden=true;render();};
  $('players').onchange=e=>{const id=e.target.dataset.player;if(!id)return;state.ids=e.target.checked?[...new Set([...state.ids,id])]:state.ids.filter(p=>p!==id);manual();render();};
  $('app').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.story)story(b.dataset.story);
    if(b.dataset.mode){state.mode=b.dataset.mode;manual();render();}
    if(b.dataset.view){state.view=b.dataset.view;manual();render();}
    if(b.dataset.pin)pin(b.dataset.pin);
  });
  // A scrolling gesture must not pin a season on touch screens.
  let down=null;
  $('charts').addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,id:e.pointerId};});
  $('charts').addEventListener('pointercancel',()=>{down=null;});
  $('charts').addEventListener('pointerup',e=>{const dot=e.target.closest('[data-point]');if(dot&&down&&down.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<10)pin(dot.dataset.point,Number(dot.dataset.year));down=null;});
  $('charts').addEventListener('keydown',e=>{const dot=e.target.closest('[data-point]');if(dot&&['Enter',' '].includes(e.key)){e.preventDefault();pin(dot.dataset.point,Number(dot.dataset.year));}});
  $('charts').addEventListener('focusin',e=>{const dot=e.target.closest('[data-point]');if(dot){const p=known.get(dot.dataset.point),s=M.series(p,state).find(s=>s.year===Number(dot.dataset.year));$('inspect').textContent=seasonText(p,s);}});
  function inspectResearch(e){const dot=e.target.closest('[data-research]');if(dot)$('research-inspect').textContent=dot.getAttribute('aria-label');}
  $('scatter').addEventListener('click',inspectResearch);$('scatter').addEventListener('focusin',inspectResearch);
  $('scatter').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();inspectResearch(e);}});
  $('csv').onclick=()=>download('pba-profile-seasons.csv',csv([
    ['Source','PBA.com Career Stats tables','Profile scope; not national Tour-only','Snapshot through '+config.meta.through],
    ['Bowler','Profile year','Study year','Events','Metric','Raw value','Graph value','Source URL'],
    ...selected().flatMap(p=>M.series(p,state).map(s=>[p.name,s.year,s.x,s.row?.events,state.metric,s.raw,s.value,p.source]))]),'text/csv;charset=utf-8');
  $('research-csv').onclick=()=>download('pba-profile-research.csv',csv([
    ['Source','PBA.com profiles','Complete-case years 3–5; survivor-biased, descriptive cohort'],
    ['Bowler','Baseline year','Metric','Year 1','Year 2','Change','Predictor','X','Later metric','Mean years 3–5','Source URL'],
    ...M.cohort(config.players,state,config.meta.through).rows.map(r=>[r.name,r.first,state.metric,r.a,r.b,r.delta,state.predictor,r.x,state.outcome,r.y,r.source])]),'text/csv;charset=utf-8');
  document.addEventListener('keydown',e=>{if(!e.altKey||!e.shiftKey||e.repeat||e.isComposing||e.target.closest('input,textarea,select,[contenteditable=true]'))return;const n=Number(e.code.replace('Digit',''));if(n>=1&&n<=5){e.preventDefault();story(presets[n-1].id);}});
  let lastWidth=0,frame;
  function redraw(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const width=$('main')?.clientWidth||document.querySelector('.bw-main').clientWidth;if(width===lastWidth)return;lastWidth=width;state.mode==='compare'?compare():research();});}
  window.addEventListener('resize',redraw);document.addEventListener('yt:layout',()=>{lastWidth=0;redraw();});
  $('version').textContent='v'+config.build.version+(config.build.commit?' · '+config.build.commit.slice(0,7):'');
  $('coverage').textContent=`${config.meta.players} bowlers · ${config.meta.season_count} profile seasons · through ${config.meta.through}`;
  $('source-summary').textContent=`Retrieved ${config.meta.retrieved_at.slice(0,10)}. ${config.meta.directory_count} directory profiles checked; ${config.meta.directory_count-config.meta.players} had no usable season rows. ${config.meta.refresh}`;
  if(innerWidth>760)$('selection').open=true;
  window.BowlingApp={config,clone,esc,valid,download,apply,getState:()=>clone(state),updatePresets(value){presets=clone(value);storyButtons();},summary:s=>`${config.metrics[s.metric].name} · ${s.threshold}+ events · ${s.mode} · ${s.view} · ${s.layout} · ${s.height} · ${s.ids.map(id=>known.get(id)?.name).join(', ')}`};
  render();lastWidth=document.querySelector('.bw-main').clientWidth;
})();
