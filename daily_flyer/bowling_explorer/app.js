(() => {
  'use strict';
  const config=JSON.parse(document.getElementById('bw-data').textContent),M=BowlingMath,
    $=id=>document.getElementById('bw-'+id),clone=v=>JSON.parse(JSON.stringify(v)),
    esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    key='bowling-year-two-v1',colors=['#644b8c','#007a80','#b14a2c','#437a3e','#956315','#ad467c','#305aac','#64574a'];
  let state=clone(config.defaults),focus={id:'',year:null},presets=clone(config.presets.presets),active='rivals',undo=null;
  const sourceFor=s=>s.dataset==='usbc'?config.usbc:config, data=()=>sourceFor(state),
    usbc=()=>state.dataset==='usbc', metricsFor=s=>sourceFor(s).metrics,
    unit=()=>usbc()?'verified games':'events', sourceName=()=>usbc()?'USBC Trials':'PBA profile',
    baseline=()=>usbc()?'first complete Trials entry in 2022–2026':`first ${state.threshold}-event season`,
    known=new Map([...config.players,...config.usbc.players].map(p=>[p.id,p]));
  const nameKey=n=>(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const p of config.players){const bio=config.usbc.profiles.find(b=>[b.name,b.roster_name].some(n=>nameKey(n)===nameKey(p.name)));if(bio)p.profile=bio;}
  const sourceViews={};
  function usbcView(division='men'){
    const names=division==='women'?['juliabond','breannaclemmer','shannonpluhowsky']:['andrewanderson','ryanbarnes','darrentang'];
    return {...clone(config.defaults),dataset:'usbc',threshold:'30',division,ids:names.map(n=>'usbc-'+division+'-'+n)};
  }
  function valid(s){
    if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid view');
    if(!Object.hasOwn(s,'timeline')){
      const i=config.legacy_factory.findIndex(p=>Object.keys(s).length===Object.keys(p.settings).length&&Object.keys(p.settings).every(k=>JSON.stringify(s[k])===JSON.stringify(p.settings[k])));
      s=i<0?{...s,timeline:'career'}:clone(config.factory[i].settings);
    }
    s={dataset:'pba',division:'all',...s};
    const result=clone(config.defaults),available=new Set(sourceFor(s).players.map(p=>p.id));
    for(const k of Object.keys(result)){
      const v=s[k];
      if(config.choices[k]){if(!config.choices[k].includes(v))throw Error('Invalid '+k);result[k]=v;}
      else if(k==='ids'){if(!Array.isArray(v)||v.some(id=>!available.has(id)))throw Error('Unknown bowler');result[k]=[...new Set(v)];}
      else if(k==='count'){if(!Number.isInteger(v)||v<1||v>available.size)throw Error('Invalid count');result[k]=v;}
      else if(k==='search'){if(typeof v!=='string'||v.length>100)throw Error('Invalid search');result[k]=v;}
      else {if(typeof v!=='boolean')throw Error('Invalid filter');result[k]=v;}
    }
    const metrics=metricsFor(result);
    if(!metrics[result.metric]||!metrics[result.outcome])throw Error('Statistic unavailable for this source');
    if(!(result.dataset==='usbc'?['30']:['5','10','15']).includes(result.threshold))throw Error('Invalid source workload');
    if(result.dataset==='pba'&&result.division!=='all')throw Error('Invalid division');
    return result;
  }
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved){state=valid(saved.state);focus=known.has(saved.focus?.id)?saved.focus:focus;active='';}else state=materialize(presets[0].settings);}catch(_){state=materialize(presets[0].settings);active='rivals';}
  function persist(){try{localStorage.setItem(key,JSON.stringify({state,focus}));}catch(_){}}
  function fmt(value,metric=state.metric,sign=false){
    if(!M.finite(value))return 'Unavailable';
    const m=data().metrics[metric],number=Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:m.digits,maximumFractionDigits:m.digits});
    return (value<0?'−':sign&&value>0?'+':'')+(metric.startsWith('earnings')?'$':'')+number+(metric==='cash_rate'?'%':'');
  }
  function delta(value){return state.metric==='cash_rate'?fmt(value,state.metric,true).replace('%','')+' percentage points':fmt(value,state.metric,true)+' '+data().metrics[state.metric].unit;}
  function color(id){const i=state.ids.indexOf(id);if(i>=0)return colors[i%colors.length];let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;return colors[h%colors.length];}
  const filtered=()=>M.eligible(data().players,state);
  const matches=()=>{const query=state.search.trim().toLowerCase();return filtered().filter(p=>!query||(p.name+' '+p.hometown).toLowerCase().includes(query));};
  const selected=()=>{const ids=new Set(state.ids);return filtered().filter(p=>ids.has(p.id)).sort((a,b)=>state.ids.indexOf(a.id)-state.ids.indexOf(b.id));};
  function materialize(s){const value=valid(s);if(value.selection!=='fixed')value.ids=M.ranked(sourceFor(value).players,value);return value;}
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
      return `<button data-story="${p.id}" aria-pressed="${active===p.id}"><strong>${esc(p.label)}</strong><span>${esc(p.title)}</span><small>${s.dataset==='usbc'?'USBC Trials':'PBA profiles'} · ${esc(metricsFor(s)[s.metric].name)} · ${s.mode==='research'?'Later-career study':s.layout==='overlay'?'One shared graph':'Separate graphs'} · ${esc(who)}</small></button>`;
    }).join('');
  }
  function controls(){
    $('dataset').value=state.dataset;$('division').value=state.division;
    $('usbc-options').hidden=!usbc();$('hand-label').hidden=usbc();
    $('threshold').innerHTML=(usbc()?['30']:['5','10','15']).map(n=>`<option value="${n}">${usbc()?'Complete 30-game Trials entry':'At least '+n+' events'}</option>`).join('');
    $('threshold-label').textContent=usbc()?'First complete Trials year':'First substantial year';
    $('metric').innerHTML=Object.entries(data().metrics).map(([k,m])=>`<option value="${k}">${esc(m.name)}</option>`).join('');
    $('outcome').innerHTML=(usbc()?Object.keys(data().metrics):['average','cash_rate','earnings_per_event']).map(k=>`<option value="${k}">Mean ${esc(data().metrics[k].name.toLowerCase())}</option>`).join('');
    $('timeline').options[1].textContent=usbc()?'Years from first complete Trials entry':'Years from first substantial season';
    $('workload-heading').textContent=usbc()?'Verified games':'Events';
    $('dataset-note').textContent=usbc()?`${config.usbc.meta.players} bowler records · ${config.usbc.meta.season_count} tournament entries · men and women, 2022–2026. Averages are verified from daily game scores. Each year is one Trials tournament; year one means the first complete entry in this snapshot, not a professional debut.`:'PBA Career Stats tables, through 2025. Profile seasons can include more than the national Tour. Switch to USBC to explore Team USA Trials results and a wider field.';
    for(const k of ['metric','threshold','hand','height','layout','normalize','predictor','outcome','search','timeline'])$(k).value=state[k];
    for(const k of ['qual2','skip2020'])$(k).checked=state[k];
    document.querySelectorAll('#bw-app [data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    document.querySelectorAll('#bw-app [data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
    $('compare').hidden=state.mode!=='compare';$('research').hidden=state.mode!=='research';
    $('metric-note').textContent=data().metrics[state.metric].note;
    $('clock-one').textContent=usbc()?'First complete 30-game Trials entry in this 2022–2026 snapshot. Earlier appearances may exist; this is not a debut.':`First listed year with at least ${state.threshold} profile events. This is our study baseline, not an official rookie designation.`;
  }
  function roster(){
    const list=matches(),ids=new Set(state.ids),scroll=$('players').scrollTop,focused=document.activeElement?.dataset.player;
    $('picker-count').textContent=`${selected().length} on graph · tap to choose`;
    $('selection-count').textContent=`${list.length} matching bowlers · ${state.ids.length} selected overall. ${filtered().length} of ${data().players.length} records meet the study filters. No display cap.`;
    $('players').innerHTML=list.map(p=>`<label class="bw-player"><input type="checkbox" data-player="${p.id}" ${ids.has(p.id)?'checked':''}><span>${esc(p.name)}<small>Baseline ${M.anchor(p,state.threshold)} · ${esc(usbc()?(p.division==='women'?'Women':'Men'):(p.hand||'Hand unlisted'))} · ${esc(p.hometown)}</small></span></label>`).join('')||'<p>No profiles match these filters.</p>';
    $('players').scrollTop=scroll;if(focused)$('players').querySelector(`[data-player="${focused}"]`)?.focus({preventScroll:true});
  }
  function pairReadout(p){
    const q=M.pair(p,state.metric,state.threshold),sample=q.two&&(M.workload(p,q.two)??0)<Number(state.threshold),missing=!M.finite(q.delta);
    return `<div class="bw-pair"><div><span>YEAR 1 · ${q.first}</span><strong>${fmt(q.a)}</strong><small>${M.workload(p,q.one)??'Unverified'} ${unit()}</small></div><div><span>YEAR 2 · ${q.first+1}</span><strong>${fmt(q.b)}</strong><small>${q.two?(M.workload(p,q.two)??'Unverified')+' '+unit():'No source row'}</small></div></div><p class="bw-delta">${missing?'No measured year-one / year-two change.':delta(q.delta)+' from year one.'}</p>${sample?'<p class="bw-warning">Smaller year-two workload: below the selected workload threshold.</p>':''}`;
  }
  function scale(values){
    const nums=values.filter(M.finite);let lo=nums.length?Math.min(...nums):0,hi=nums.length?Math.max(...nums):1;
    const pad=hi===lo?Math.max(1,Math.abs(lo)*.03):(hi-lo)*.08;
    lo-=pad;hi+=pad;return {lo,hi};
  }
  function seasonText(p,s){
    const first=M.anchor(p,state.threshold);
    return `${p.name} · ${s.year} (year ${s.x}) · ${data().metrics[state.metric].name}: ${fmt(s.raw)} · ${M.workload(p,s.row)??'Unverified'} ${unit()}${usbc()&&s.row?' · '+s.row.division+' · finish '+s.row.finish+' of '+s.row.field_size:''}`+(s.year===first+1?' · Year two':'');
  }
  function pin(id,year=null){focus={id:focus.id===id&&year===null?'':id,year};persist();highlight();}
  function highlight(){
    const list=selected();if(!list.some(p=>p.id===focus.id)){focus={id:'',year:null};}
    $('highlight').value=focus.id;
    document.querySelectorAll('#bw-charts [data-series]').forEach(g=>g.style.opacity=state.layout==='overlay'&&focus.id&&g.dataset.series!==focus.id?'0.15':'1');
    document.querySelectorAll('#bw-charts [data-line-label]').forEach(g=>{g.style.opacity=focus.id&&g.dataset.lineLabel!==focus.id?'0.15':'1';g.style.display=g.dataset.crowded==='true'&&focus.id!==g.dataset.lineLabel?'none':'';});
    document.querySelectorAll('#bw-legend button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pin===focus.id)));
    const p=known.get(focus.id),s=p&&M.series(p,state).find(s=>s.year===focus.year&&M.finite(s.value));
    $('inspect').textContent=s?seasonText(p,s):p?`${p.name} highlighted. Tap a season for its value.`:'Tap or focus a point to inspect that season.';
    playerInfo(p,s?.row);
    document.querySelectorAll('.bw-panel-inspect').forEach(el=>el.textContent=s&&el.dataset.inspect===p.id?seasonText(p,s):'Tap a point for its value and workload.');
  }
  function playerInfo(p,row){
    const el=$('player-info');el.hidden=!p;if(!p){el.innerHTML='';return;}
    const bio=p.profile,latest=p.seasons.at(-1),facts=[];
    if(p.dataset==='usbc')facts.push(['Competition',`Team USA Trials · ${p.division}`],['Recorded entries',`${p.seasons.length} in ${p.seasons[0].year}–${latest.year}`],['Hometown at latest entry',p.hometown]);
    else facts.push(['PBA membership year',p.joined||'Unlisted'],['Profile hometown',p.hometown],['Bowling hand',p.hand==='R'?'Right':p.hand==='L'?'Left':'Unlisted']);
    if(bio)for(const [key,label] of [['hometown','Team USA profile hometown'],['throws','Throws'],['college','College'],['team_usa_years','Years on Team USA'],['junior_team_usa_years','Years on Junior Team USA']])if(bio[key])facts.push([label,bio[key]]);
    if(p.dataset==='usbc'&&row)facts.push(['Selected entry',`${row.year} · finish ${row.finish} / ${row.field_size} · ${row.ranking_points} ranking points`],['Average coverage',row.average_status]);
    el.innerHTML=`<h3>${esc(p.name)}</h3><dl>${facts.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p>${bio?`<a href="${esc(bio.source)}" target="_blank" rel="noopener">USBC player biography ↗</a> · Profile snapshot ${config.usbc.meta.retrieved_at.slice(0,10)} · `:''}<a href="${esc(row?.source||p.source)}" target="_blank" rel="noopener">${p.dataset==='usbc'?'USBC official results':'PBA profile'} ↗</a></p>`;
  }
  function graph(list,bounds,time,width,height,separate){
    const left=72,right=22,top=38,bottom=58,w=width-left-right,h=height-top-bottom,
      x=v=>left+(v-time.lo)/(time.hi-time.lo)*w,y=v=>top+(bounds.hi-v)/(bounds.hi-bounds.lo)*h,
      timeTitle=state.timeline==='calendar'?`Year (${sourceName()})`:usbc()?'Years from first complete Trials entry':`Years from first ${state.threshold}-event season`,
      valueTitle=(state.normalize==='delta'?'Change in ':'')+data().metrics[state.metric].name+' ('+data().metrics[state.metric].unit+')';
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(valueTitle)} by ${esc(timeTitle)}"><title>One line per named bowler. Orange is study year two. Missing years break the line.</title><text class="bw-axis-title bw-y-title" text-anchor="middle" transform="translate(15 ${top+h/2}) rotate(-90)">${esc(valueTitle)}</text><text class="bw-axis-title bw-x-title" text-anchor="middle" x="${left+w/2}" y="${height-10}">${esc(timeTitle)}</text>`;
    for(let i=0;i<5;i++){const v=bounds.lo+(bounds.hi-bounds.lo)*i/4;svg+=`<line class="bw-grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="bw-axis" text-anchor="end" x="${left-8}" y="${y(v)+4}">${esc(fmt(v))}</text>`;}
    const n=Math.max(1,Math.min(5,Math.floor(w/52))),ticks=[...new Set(Array.from({length:n+1},(_,i)=>Math.round(time.lo+(time.hi-time.lo)*i/n)))];
    for(const v of ticks)svg+=`<text class="bw-axis bw-time-tick" text-anchor="middle" x="${x(v)}" y="${height-33}">${v}</text>`;
    if(state.timeline!=='calendar'||separate){const second=state.timeline==='calendar'?M.anchor(list[0],state.threshold)+1:2;if(second>=time.lo&&second<=time.hi)svg+=`<line class="bw-y2-rule" x1="${x(second)}" x2="${x(second)}" y1="${top}" y2="${height-bottom}"/>`;}
    svg+=`<text class="bw-y2-label" x="${left}" y="20">Orange points = study year 2</text>`;
    const endpoints=[];
    for(const p of list){
      const points=M.series(p,state);let path='',last=false;
      for(const s of points){if(!M.finite(s.value)){last=false;continue;}path+=(last?'L':'M')+x(M.timeValue(s,state))+','+y(s.value)+' ';last=true;}
      const dash=['','7 3','2 3'][Math.floor(Math.max(0,state.ids.indexOf(p.id))/colors.length)%3];
      svg+=`<g data-series="${p.id}"><path class="bw-trace" stroke="${color(p.id)}" stroke-dasharray="${dash}" d="${path}"/>`;
      for(const s of points.filter(s=>M.finite(s.value))){
        const fill=s.x===2?'#c45325':color(p.id),hollow=(M.workload(p,s.row)??0)<Number(state.threshold);
        svg+=`<circle class="bw-dot" data-point="${p.id}" data-year="${s.year}" cx="${x(M.timeValue(s,state))}" cy="${y(s.value)}" r="${s.x===2?6:4.5}" fill="${hollow?'#fffcf6':fill}" stroke="${fill}" tabindex="0" role="button" aria-label="${esc(seasonText(p,s))}"><title>${esc(seasonText(p,s))}</title></circle>`;
      }
      svg+='</g>';
      const end=points.filter(s=>M.finite(s.value)).at(-1);if(end)endpoints.push({id:p.id,name:p.name,x:x(M.timeValue(end,state)),y:y(end.value)});
    }
    if(!separate){
      const crowded=endpoints.length>Math.floor(h/24),positions=crowded?endpoints.map(p=>({...p,labelY:Math.max(top+14,Math.min(height-bottom-10,p.y-12))})):M.labelPositions(endpoints,top+14,height-bottom-10,24);
      for(const p of positions){const labelX=width-right-7;svg+=`<g data-line-label="${p.id}" data-crowded="${crowded}" class="bw-line-label" pointer-events="none"><path d="M${p.x},${p.y} L${labelX+3},${p.labelY-4}" fill="none" stroke="${color(p.id)}" stroke-width="1"/><text text-anchor="end" x="${labelX}" y="${p.labelY}" fill="${color(p.id)}">${esc(p.name)}</text></g>`;}
    }
    return svg+'</svg>';
  }
  function compare(){
    const list=selected(),pairs=list.map(p=>M.pair(p,state.metric,state.threshold)),measured=pairs.filter(q=>M.finite(q.delta)),ups=measured.filter(q=>q.delta>0).length,downs=measured.filter(q=>q.delta<0).length;
    $('takeaway').textContent=list.length?`${list.length} bowlers · ${data().metrics[state.metric].name.toLowerCase()}. ${measured.length} have a measured first-to-second-year comparison: ${ups} rose, ${downs} fell and ${measured.length-ups-downs} stayed level.`:'No selected bowlers match. Use Add / remove bowlers above to choose names.';
    $('reading').textContent=`Up the side: ${data().metrics[state.metric].name.toLowerCase()} (${data().metrics[state.metric].unit}). Along the bottom: ${state.timeline==='calendar'?`calendar years in ${sourceName()} results`:`years from each bowler’s ${baseline()}`}. ${state.layout==='overlay'?'Each named line is one bowler. Tap a name to highlight that line.':'Separate graphs share the same axes.'}`;
    $('chart-title').textContent=data().metrics[state.metric].name+' · '+(state.view==='pair'?'the first two years':'what came next');
    $('chart-note').textContent=`${data().metrics[state.metric].note} ${state.normalize==='delta'?'Graph values are changes from each bowler’s first substantial year.':'Graph values are actual source statistics.'} Hollow dots indicate fewer than ${state.threshold} ${unit()}. ${list.length>8?'For a crowded graph, highlight a bowler by name; all selected lines are still drawn.':''}`;
    const noRow=pairs.filter(q=>!q.two).length,low=list.filter(p=>{const q=M.pair(p,state.metric,state.threshold);return q.two&&(M.workload(p,q.two)??0)<Number(state.threshold);}).length;
    $('warning').textContent=`${noRow} selected bowlers have no next-year row; ${low} have a smaller year-two workload. Missing data never becomes zero, and lines stop at gaps. ${usbc()?'Trials finishes are within each division; lower finish and ranking points are better.':'Profile figures are not national Tour-only rankings.'}`;
    $('legend').innerHTML=list.map(p=>`<button data-pin="${p.id}" aria-pressed="false"><i style="background:${color(p.id)}"></i>${esc(p.name)}</button>`).join('');
    $('highlight').innerHTML='<option value="">Everyone</option>'+list.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const chart=$('charts');chart.classList.toggle('bw-separated',state.layout==='separate');
    if(!list.length){chart.innerHTML='<p>No bowlers selected for these filters. Use Add / remove bowlers to choose players.</p>';$('table').innerHTML='';highlight();return;}
    const all=list.flatMap(p=>M.series(p,state)),bounds=scale(all.map(s=>s.value)),time=M.timeDomain(all,state),separate=state.layout==='separate',
      columns=separate&&innerWidth>1000?2:1,width=Math.max(260,Math.floor((chart.clientWidth-(columns-1)*20)/columns)),height={compact:210,normal:310,tall:550}[state.height];
    const groups=separate?list.map(p=>[p]):[list];
    chart.innerHTML=groups.map(group=>{
      const p=group[0],points=group.flatMap(p=>M.series(p,state)).filter(s=>M.finite(s.value));
      return `<article class="bw-panel" data-panel="${separate?p.id:'overlay'}"><div class="bw-panel-header"><h3>${separate?esc(p.name):list.length+' bowlers · one graph'}</h3>${separate?`<a href="${esc(p.source)}" target="_blank" rel="noopener">${sourceName()} ↗</a>`:''}</div>${points.length?graph(group,bounds,time,width,height,separate):'<p class="bw-warning">No measured values in this window. Choose another statistic or view.</p>'}${separate?pairReadout(p):''}${separate?`<p class="bw-panel-inspect" data-inspect="${p.id}"></p>`:''}</article>`;
    }).join('');
    $('table').innerHTML=list.flatMap(p=>M.series(p,state).map(s=>`<tr><td>${esc(p.name)}</td><td>${s.year}</td><td>${M.workload(p,s.row)??'Unverified'}</td><td>${esc(data().metrics[state.metric].name)}</td><td>${fmt(s.raw)}</td><td><a href="${esc(s.row?.source||p.source)}" target="_blank" rel="noopener">${sourceName()}</a></td></tr>`)).join('');
    highlight();
  }
  const predictorName=()=>({a:'year-one value',b:'year-two value',delta:'year-two change'}[state.predictor]);
  function research(){
    const c=M.cohort(data().players,state,data().meta.through),{rows}=c,xs=rows.map(r=>r.x),ys=rows.map(r=>r.y),rho=QBResearch.spearman(xs,ys),pearson=QBResearch.pearson(xs,ys);
    $('research-reading').textContent=rows.length<3?'Too few complete profiles to describe a relationship. Widen the filters or choose another measure.':!M.finite(rho)?'These values have too little variation to calculate a rank relationship.':`Among these ${rows.length} complete profiles, ${Math.abs(rho)<.1?'there is little rank relationship':`higher ${predictorName()} tended to accompany ${rho>0?'higher':'lower'} later values`}. That association does not establish cause or show that year two improves predictions beyond year one.`;
    $('cohort-note').textContent=`${rows.length} complete profiles from ${c.candidates} matching candidates. Excluded: ${c.excluded.pair} missing first/second-year values; ${c.excluded.followup} without a full follow-up window through ${data().meta.through}; ${c.excluded.missing} missing at least one of years 3–5. All three later years must be recorded.`;
    $('research-axes').textContent=`Across → ${predictorName()} in ${data().metrics[state.metric].name.toLowerCase()}. Up ↑ mean ${data().metrics[state.outcome].name.toLowerCase()} in years 3–5. One dot = one bowler.`;
    $('research-numbers').textContent=`Spearman rank correlation: ${M.finite(rho)?rho.toFixed(3):'unavailable'} · Pearson correlation: ${M.finite(pearson)?pearson.toFixed(3):'unavailable'} · n = ${rows.length}. Values near ±1 show stronger association; near zero does not rule out nonlinear patterns.`;
    if(!rows.length){$('scatter').innerHTML='<p>No complete profiles meet these filters.</p>';return;}
    const width=Math.max(270,$('scatter').clientWidth),height=360,left=68,right=20,top=24,bottom=55,bx=scale(xs),by=scale(ys),
      x=v=>left+(v-bx.lo)/(bx.hi-bx.lo)*(width-left-right),y=v=>top+(by.hi-v)/(by.hi-by.lo)*(height-top-bottom);
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(predictorName())} versus later ${esc(data().metrics[state.outcome].name)}"><title>Each point is a complete profile; descriptive association only.</title>`;
    for(let i=0;i<5;i++){const vx=bx.lo+(bx.hi-bx.lo)*i/4,vy=by.lo+(by.hi-by.lo)*i/4;svg+=`<line class="bw-grid" x1="${left}" x2="${width-right}" y1="${y(vy)}" y2="${y(vy)}"/><text class="bw-axis" text-anchor="end" x="${left-8}" y="${y(vy)+4}">${fmt(vy,state.outcome)}</text><text class="bw-axis" text-anchor="${i===4?'end':'middle'}" x="${x(vx)}" y="${height-30}">${fmt(vx)}</text>`;}
    for(const r of rows){const text=`${r.name} · ${predictorName()}: ${fmt(r.x)} · years 3–5: ${fmt(r.y,state.outcome)}`;svg+=`<circle class="bw-research-dot" cx="${x(r.x)}" cy="${y(r.y)}" r="6" fill="${color(r.id)}" stroke="#fff5e5" stroke-width="1.5" tabindex="0" role="button" data-research="${r.id}" aria-label="${esc(text)}"><title>${esc(text)}</title></circle>`;}
    $('scatter').innerHTML=svg+'</svg>';
    $('research-inspect').textContent='Tap or focus a dot to see the bowler.';
  }
  function render(){
    controls();roster();storyButtons();
    const p=presets.find(p=>p.id===active);
    $('story-title').textContent=p?.title||(state.mode==='compare'?'Your bowling comparison':'Your later-career question');
    $('story-note').textContent=(p?.note?p.note+' ':'')+`${data().metrics[state.metric].name} · baseline ${state.threshold} ${unit()} · ${state.mode==='research'?'full filtered cohort':state.view==='career'?'recorded history from baseline':'year one to year two'}.`;
    if(state.mode==='compare')compare();else research();persist();
  }
  function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function csv(rows){return rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}
  $('dataset').onchange=()=>{
    sourceViews[state.dataset]=clone(state);const target=$('dataset').value;
    state=sourceViews[target]|| (target==='usbc'?usbcView():clone(config.defaults));focus={id:'',year:null};manual();render();
  };
  for(const division of ['men','women'])$('usbc-'+division).onclick=()=>apply(usbcView(division),`USBC Trials · ${division}’s scoring averages`,'A shared graph of the selected bowlers. Add more names below.');
  $('division').onchange=()=>{state.division=$('division').value;manual();render();};
  for(const k of ['metric','threshold','hand','height','layout','normalize','predictor','outcome','qual2','skip2020','timeline'])$(k).addEventListener('change',()=>{state[k]=['qual2','skip2020'].includes(k)?$(k).checked:$(k).value;manual();render();});
  $('search').addEventListener('input',()=>{state.search=$('search').value;roster();persist();});
  $('highlight').onchange=()=>{focus={id:$('highlight').value,year:null};persist();highlight();};
  $('select-all').onclick=()=>{state.ids=[...new Set([...state.ids,...matches().map(p=>p.id)])];manual();render();};
  $('clear').onclick=()=>{state.ids=[];manual();render();};
  $('undo').onclick=()=>{if(!undo)return;({state,focus,active}=clone(undo));undo=null;$('undo').hidden=true;render();};
  $('players').onchange=e=>{const id=e.target.dataset.player;if(!id)return;state.ids=e.target.checked?[...new Set([...state.ids,id])]:state.ids.filter(p=>p!==id);manual();render();};
  $('add-bowler').onclick=()=>{$('selection').open=true;$('selection').scrollIntoView({block:'start'});$('search').focus({preventScroll:true});};
  $('picker-done').onclick=()=>{$('selection').open=false;$('chart-title').scrollIntoView({block:'start'});$('add-bowler').focus({preventScroll:true});};
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
  $('csv').onclick=()=>download(usbc()?'usbc-trials-selected.csv':'pba-profile-seasons.csv',csv([
    ['Source',data().meta.source,'Snapshot through '+data().meta.through],
    usbc()?['Bowler','Year','Study year','Division','Verified games','Average','Scratch pins','Finish','Field size','Ranking points','Hometown at event','Source name','Average status','Metric','Raw value','Graph value','Source URL']:['Bowler','Profile year','Study year','Events','Metric','Raw value','Graph value','Source URL'],
    ...selected().flatMap(p=>M.series(p,state).map(s=>usbc()?[p.name,s.year,s.x,p.division,s.row?.games,s.row?.average,s.row?.pinfall,s.row?.finish,s.row?.field_size,s.row?.ranking_points,s.row?.hometown,s.row?.source_name,s.row?.average_status,state.metric,s.raw,s.value,s.row?.source||p.source]:[p.name,s.year,s.x,s.row?.events,state.metric,s.raw,s.value,p.source]))]),'text/csv;charset=utf-8');
  $('research-csv').onclick=()=>download(usbc()?'usbc-trials-research.csv':'pba-profile-research.csv',csv([
    ['Source',data().meta.source,'Complete-case years 3–5; survivor-biased, descriptive cohort'],
    ['Bowler','Baseline year','Metric','Year 1','Year 2','Change','Predictor','X','Later metric','Mean years 3–5','Source URL'],
    ...M.cohort(data().players,state,data().meta.through).rows.map(r=>[r.name,r.first,state.metric,r.a,r.b,r.delta,state.predictor,r.x,state.outcome,r.y,r.source])]),'text/csv;charset=utf-8');
  document.addEventListener('keydown',e=>{if(!e.altKey||!e.shiftKey||e.repeat||e.isComposing||e.target.closest('input,textarea,select,[contenteditable=true]'))return;const n=Number(e.code.replace('Digit',''));if(n>=1&&n<=5){e.preventDefault();story(presets[n-1].id);}});
  let lastWidth=0,frame;
  function redraw(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const width=$('main')?.clientWidth||document.querySelector('.bw-main').clientWidth;if(width===lastWidth)return;lastWidth=width;state.mode==='compare'?compare():research();});}
  window.addEventListener('resize',redraw);document.addEventListener('yt:layout',()=>{lastWidth=0;redraw();});
  $('version').textContent='v'+config.build.version+(config.build.commit?' · '+config.build.commit.slice(0,7):'');
  $('coverage').textContent=`PBA: ${config.meta.players} bowlers / ${config.meta.season_count} seasons through ${config.meta.through} · USBC: ${config.usbc.meta.players} bowler records / ${config.usbc.meta.season_count} entries, 2022–2026`;
  $('source-summary').textContent=`Retrieved ${config.meta.retrieved_at.slice(0,10)}. ${config.meta.directory_count} directory profiles checked; ${config.meta.directory_count-config.meta.players} had no usable season rows. ${config.meta.refresh} USBC: retrieved ${config.usbc.meta.retrieved_at.slice(0,10)}, ${config.usbc.meta.complete_averages} verified scoring averages and ${config.usbc.meta.profile_count} Team USA biographies.`;
  if(innerWidth>760)$('filters').open=true;
  window.BowlingApp={config,clone,esc,valid,download,apply,getState:()=>clone(state),updatePresets(value){presets=clone(value);storyButtons();},summary:s=>`${metricsFor(s)[s.metric].name} · ${s.dataset==='usbc'?'USBC Trials':'PBA profiles'} · ${s.threshold} ${s.dataset==='usbc'?'games':'events'} · ${s.division} · ${s.mode} · ${s.view} · ${s.timeline==='calendar'?'calendar years':'years from baseline'} · ${s.layout} · ${s.height} · ${s.ids.map(id=>known.get(id)?.name).join(', ')}`};
  render();lastWidth=document.querySelector('.bw-main').clientWidth;
})();
