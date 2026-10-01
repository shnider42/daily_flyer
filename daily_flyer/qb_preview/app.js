(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('qp-data').textContent),M=QBPreviewMath,
    $=id=>document.getElementById('qp-'+id),key='qb-comparison-preview-v1',pageSize=6,
    esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    clone=o=>JSON.parse(JSON.stringify(o)),known=new Map(data.players.map(p=>[p.id,p])),
    defaults={ids:['BradTo00','MannPe00'],metric:'rating',view:'pair',window:'5',display:'chart',page:0};
  function valid(input){
    const s={...defaults};if(!input||typeof input!=='object')return clone(s);
    if(Array.isArray(input.ids))s.ids=[...new Set(input.ids.filter(id=>known.has(id)))];
    if(Object.hasOwn(M.metrics,input.metric))s.metric=input.metric;
    for(const [k,choices] of Object.entries({view:['pair','career'],window:['5','10','all'],display:['chart','table']}))if(choices.includes(input[k]))s[k]=input[k];
    if(Number.isInteger(input.page)&&input.page>=0)s.page=input.page;
    return clone(s);
  }
  let state=clone(defaults),search='',lastWidth=0,frame;
  const inspectYears={};
  try{state=valid(JSON.parse(localStorage.getItem(key)||'null'));}catch(_){}
  const params=new URLSearchParams(location.search);
  if(['players','measure','view','window','display'].some(k=>params.has(k))){
    state=valid({ids:params.has('players')?params.get('players').split(','):defaults.ids,
      metric:params.get('measure'),view:params.get('view'),window:params.get('window'),display:params.get('display')});
  }
  const selected=()=>state.ids.map(id=>known.get(id)),metric=()=>M.metrics[state.metric],
    valueText=v=>M.format(v,state.metric)+(M.finite(v)&&state.metric.endsWith('_pct')?'%':''),
    changeUnit=()=>metric().changeUnit||metric().unit,
    changeText=p=>{const d=M.pair(p,state.metric).delta;return M.finite(d)?M.format(d,state.metric,true)+' '+changeUnit():'Not comparable';},
    endYear=()=>state.window==='all'?Math.max(2,...selected().map(p=>p.last-p.first+1)):Number(state.window),
    matches=()=>{const q=search.trim().toLowerCase();return data.players.filter(p=>!q||(p.name+' '+p.seasons.map(s=>s.teams.map(t=>t.team+' '+(data.teams[t.team]?.[0]||'')).join(' ')).join(' ')).toLowerCase().includes(q));};
  function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch(_){}$('share-box').hidden=true;}
  function roster(){
    const list=matches(),scroll=$('players').scrollTop,focused=document.activeElement?.dataset.player;
    $('match-count').textContent=`${list.length} matches. Search changes this list, not the comparison.`;
    $('players').innerHTML=list.map(p=>`<label class="qp-player"><input type="checkbox" data-player="${esc(p.id)}" ${state.ids.includes(p.id)?'checked':''}><span>${esc(p.name)}<small>Study years ${p.first} → ${p.first+1}</small></span></label>`).join('')||'<p>No matching quarterback. Try another name or team.</p>';
    $('players').scrollTop=scroll;
    if(focused)$('players').querySelector(`[data-player="${focused}"]`)?.focus({preventScroll:true});
  }
  function summary(){
    const list=selected(),pairs=list.map(p=>M.pair(p,state.metric)),measured=pairs.filter(p=>M.finite(p.delta)),
      better=measured.filter(p=>p.delta*metric().direction>0).length,worse=measured.filter(p=>p.delta*metric().direction<0).length;
    if(!list.length)return 'Choose quarterbacks to begin.';
    if(!measured.length)return 'No complete year-one/year-two comparison is available for these selections. Missing data is not a slump.';
    return `${measured.length} comparable quarterbacks: ${better} improved, ${worse} declined, ${measured.length-better-worse} unchanged on this measure.${list.length>measured.length?` ${list.length-measured.length} lack a comparable pair.`:''}`;
  }
  const diamond=(x,y,size=7)=>`M${x},${y-size} L${x+size},${y} L${x},${y+size} L${x-size},${y} Z`;
  function pairChart(p,axis,width){
    const q=M.pair(p,state.metric),left=24,right=25,y=30,
      x=v=>left+(v-axis.lo)/(axis.hi-axis.lo)*(width-left-right);
    let svg=`<svg viewBox="0 0 ${width} 112" role="img" aria-labelledby="qp-pair-${p.id}" data-lo="${axis.lo}" data-hi="${axis.hi}"><title id="qp-pair-${p.id}">${esc(p.name)}: ${esc(valueText(q.a))} in ${p.first}, ${esc(valueText(q.b))} in ${p.first+1}. ${esc(changeText(p))}.</title>`;
    for(const t of axis.ticks)svg+=`<line class="${t===0&&state.metric==='relative_anya'?'qp-zero':'qp-grid'}" x1="${x(t)}" x2="${x(t)}" y1="12" y2="51"/><text class="qp-axis" x="${x(t)}" y="75" text-anchor="middle">${t}</text>`;
    if(M.finite(q.a)&&M.finite(q.b))svg+=`<line x1="${x(q.a)}" x2="${x(q.b)}" y1="${y}" y2="${y}" stroke="#53656b" stroke-width="3"/>`;
    if(M.finite(q.a))svg+=`<circle cx="${x(q.a)}" cy="${y}" r="8" fill="#fffefa" stroke="#53656b" stroke-width="2.5"/>`;
    if(M.finite(q.b))svg+=`<path d="${diamond(x(q.b),y,6)}" fill="#00665c" stroke="#fffefa" stroke-width="1"/>`;
    svg+=`<text class="qp-axis-title" x="${width/2}" y="103" text-anchor="middle">${esc(metric().unit)} · ${metric().direction>0?'higher →':'← lower'} is better</text></svg>`;
    return svg;
  }
  function careerChart(p,axis,width,end){
    const left=48,right=20,top=30,height=260,bottom=54,w=width-left-right,h=height-top-bottom,
      x=v=>left+(v-1)/(end-1)*w,y=v=>top+(axis.hi-v)/(axis.hi-axis.lo)*h,points=M.series(p,state.metric,end);
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="qp-history-${p.id}" data-lo="${axis.lo}" data-hi="${axis.hi}" data-end="${end}"><title id="qp-history-${p.id}">${esc(p.name)}: ${esc(metric().name)} by study year. Diamond marks year two; gaps mean unavailable values. Exact values are in the season selector and table.</title>`;
    for(const t of axis.ticks)svg+=`<line class="${t===0?'qp-zero':'qp-grid'}" x1="${left}" x2="${width-right}" y1="${y(t)}" y2="${y(t)}"/><text class="qp-axis" x="${left-8}" y="${y(t)+4}" text-anchor="end">${t}</text>`;
    const ticks=end<=5?Array.from({length:end},(_,i)=>i+1):[...new Set([1,...(x(2)-x(1)>=24?[2]:[]),Math.round((end+1)/2),end])];
    for(const t of ticks)svg+=`<text class="qp-axis" x="${x(t)}" y="${height-29}" text-anchor="middle">${t}</text>`;
    svg+=`<line class="qp-zero" x1="${x(2)}" x2="${x(2)}" y1="${top}" y2="${height-bottom}"/><text class="qp-axis-title" x="${left}" y="16">${esc(metric().unit)}</text>`;
    let path='',last=false;
    for(const point of points){if(!M.finite(point.value)){last=false;continue;}path+=(last?'L':'M')+x(point.x)+','+y(point.value)+' ';last=true;}
    svg+=`<path class="qp-line" d="${path}"/>`;
    for(const point of points.filter(v=>M.finite(v.value))){
      if(point.x===2)svg+=`<path d="${diamond(x(point.x),y(point.value))}" fill="#00665c" stroke="#fffefa" stroke-width="1.5"/>`;
      else svg+=`<circle cx="${x(point.x)}" cy="${y(point.value)}" r="${point.x===1?5:3.5}" fill="${point.x===1?'#fffefa':'#00665c'}" stroke="#00665c" stroke-width="2"/>`;
    }
    return svg+`<text class="qp-axis-title" x="${left+w/2}" y="${height-5}" text-anchor="middle">Study year · year 1 = ${p.first}</text></svg>`;
  }
  function inspect(p){
    const year=Number(inspectYears[p.id]),r=p.seasons.find(r=>r.year===year),v=r?.[state.metric],
      unavailable=year>data.meta.through?'Outside snapshot':!r?'No season row':'Metric unavailable';
    return `${year}: ${M.finite(v)?valueText(v):unavailable} · ${r?.gs??'Unknown'} starts · ${r?.att??'Unknown'} attempts.`;
  }
  function table(){
    const list=selected(),career=state.view==='career';
    $('caption').textContent=`All ${list.length} selected quarterbacks · ${metric().name} (${metric().unit}) · ${career?'recorded history':'year one to year two'}`;
    $('thead').innerHTML='<tr>'+ (career?['Quarterback','Study year','Season','Value','Starts','Attempts','Coverage']:['Quarterback','Year 1','Year 1 value','Year 2','Year 2 value','Change','Year 2 starts / attempts','Context']).map(s=>`<th scope="col">${s}</th>`).join('')+'</tr>';
    $('tbody').innerHTML=list.map(p=>{
      if(career)return M.series(p,state.metric,endYear()).map(s=>`<tr><th scope="row">${esc(p.name)}</th><td>${s.x}</td><td>${s.year}</td><td>${valueText(s.value)}</td><td>${s.row?.gs??'Unavailable'}</td><td>${s.row?.att??'Unavailable'}</td><td>${s.year>data.meta.through?'Outside snapshot':!s.row?'No season row':!M.finite(s.value)?'Metric unavailable':s.row.qualifies?'12-start single-team threshold met':'Below 12-start single-team threshold'}</td></tr>`).join('');
      const q=M.pair(p,state.metric);
      return `<tr><th scope="row">${esc(p.name)}</th><td>${p.first}</td><td>${valueText(q.a)}</td><td>${p.first+1}</td><td>${valueText(q.b)}</td><td>${esc(changeText(p))}</td><td>${q.two?.gs??'Unavailable'} / ${q.two?.att??'Unavailable'}</td><td>${esc(M.warning(p,state.metric,data.meta.through)||'Measured in both seasons.')}</td></tr>`;
    }).join('');
  }
  function charts(){
    const list=selected(),career=state.view==='career',end=endYear(),maxPage=Math.max(0,Math.ceil(list.length/pageSize)-1);
    state.page=Math.min(state.page,maxPage);
    const page=list.slice(state.page*pageSize,(state.page+1)*pageSize),
      values=career?list.flatMap(p=>M.series(p,state.metric,end).map(s=>s.value)):list.flatMap(p=>{const q=M.pair(p,state.metric);return [q.a,q.b];}),axis=M.niceAxis(values,state.metric),
      columns=career&&innerWidth>700?2:1,width=Math.max(236,Math.floor(($('charts').clientWidth-(columns-1)*22)/columns));
    $('charts').classList.toggle('qp-history',career);
    $('charts').innerHTML=`<div class="${career?'qp-history-panels':'qp-pair-panels'}">`+page.map(p=>{
      const q=M.pair(p,state.metric),warning=M.warning(p,state.metric,data.meta.through),
        heading=`<div class="qp-panel-heading"><div><h3>${esc(p.name)}</h3><p>${p.first} → ${p.first+1}</p></div><div class="qp-change">${esc(M.format(q.delta,state.metric,true))}<small>${M.finite(q.delta)?esc(changeUnit()):'Change unavailable'}</small></div></div>`,
        values=`<div class="qp-values"><span>Year 1 · ${p.first} <b>${valueText(q.a)}</b></span><span>Year 2 · ${p.first+1} <b>${valueText(q.b)}</b></span></div>`;
      if(!career)return `<article class="qp-panel" data-player-panel="${p.id}">${heading}${values}${pairChart(p,axis,width)}${warning?`<p class="qp-row-warning">${esc(warning)}</p>`:''}</article>`;
      const rows=M.series(p,state.metric,end);if(!rows.some(s=>s.year===inspectYears[p.id]))inspectYears[p.id]=p.first+1;
      return `<article class="qp-panel" data-player-panel="${p.id}">${heading}${values}${careerChart(p,axis,width,end)}<div class="qp-season-inspect"><label for="qp-season-${p.id}">Inspect a season<select id="qp-season-${p.id}" data-inspect="${p.id}">${rows.map(s=>`<option value="${s.year}" ${s.year===inspectYears[p.id]?'selected':''}>Year ${s.x} · ${s.year}</option>`).join('')}</select></label><p id="qp-inspect-${p.id}" role="status">${esc(inspect(p))}</p></div>${warning?`<p class="qp-row-warning">${esc(warning)}</p>`:''}</article>`;
    }).join('')+'</div>';
    $('scope').textContent=list.length>pageSize&&state.display==='chart'?`Showing ${state.page*pageSize+1}–${Math.min((state.page+1)*pageSize,list.length)} of ${list.length} selected. Table and download include all ${list.length}.`:career?'All panels share scales. Gaps mean unavailable values.':'';
    $('scope').hidden=!$('scope').textContent;
    $('pagination').hidden=list.length<=pageSize||state.display!=='chart';
    $('previous').disabled=state.page===0;$('next').disabled=state.page===maxPage;
    $('page-count').textContent=`Page ${state.page+1} of ${maxPage+1}`;
    $('axis-note').textContent=`${state.metric==='relative_anya'?'Zero = same-season league baseline. ':''}Linear scale${career?'s':''}: ${axis.lo} to ${axis.hi} ${metric().unit}. ${career?'Study years align career stages, not calendar dates.':'These are each player’s own seasons, which can fall in different eras.'}`;
  }
  function render(){
    const list=selected();$('metric').value=state.metric;$('window').value=state.window;
    $('window-label').hidden=state.view!=='career';$('selection-count').textContent=`(${list.length})`;
    $('selected').textContent=list.length?'Selected: '+list.map(p=>p.name).join(' · '):'No quarterbacks selected';
    $('app').querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
    $('app').querySelectorAll('[data-display]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.display===state.display)));
    $('title').textContent=(state.view==='pair'?'Year-one to year-two ':'After year two: ')+metric().name.toLowerCase();
    $('metric-note').textContent=metric().note;$('definition').textContent=metric().detail;
    $('summary').textContent=summary();$('empty').hidden=list.length>0;
    $('charts').hidden=state.display!=='chart'||!list.length;
    $('table-wrap').hidden=state.display!=='table'||!list.length;
    $('key').hidden=state.display!=='chart'||!list.length;
    $('export').disabled=!list.length;
    roster();
    if(list.length){charts();if(state.display==='table')table();else $('tbody').innerHTML='';}
    else{$('charts').innerHTML='';$('tbody').innerHTML='';$('pagination').hidden=true;$('scope').textContent='';$('axis-note').textContent='';}
    save();
  }
  function reset(){state=clone(defaults);search='';$('search').value='';$('picker').open=false;render();}
  function csv(){
    const rows=[['Source',data.meta.title,'Through '+data.meta.through,'Selected players only','Source manifest',new URL('/daily_flyer/data/qb_sources.json',location.href).href],
      ['Quarterback','Player ID','Study year','Season','Metric','Value','Units','Starts','Attempts','Year-two change','Change units','Coverage']];
    for(const p of selected())for(const s of M.series(p,state.metric,state.view==='pair'?2:endYear())){
      rows.push([p.name,p.id,s.x,s.year,state.metric,s.value,metric().unit,s.row?.gs,s.row?.att,s.x===2?M.pair(p,state.metric).delta:null,changeUnit(),s.year>data.meta.through?'Outside snapshot':!s.row?'No season row':!M.finite(s.value)?'Metric unavailable':p.anchor_uncertain?'Study start uncertain':'Observed']);
    }
    return rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  }
  $('metric').innerHTML=Object.entries(M.metrics).map(([key,m])=>`<option value="${key}">${esc(m.name)}</option>`).join('');
  $('metric').onchange=()=>{state.metric=$('metric').value;render();};
  $('window').onchange=()=>{state.window=$('window').value;render();};
  $('search').oninput=()=>{search=$('search').value;roster();};
  $('players').onchange=e=>{const id=e.target.dataset.player;if(!known.has(id))return;state.ids=e.target.checked?[...new Set([...state.ids,id])]:state.ids.filter(x=>x!==id);state.page=0;render();};
  $('add-all').onclick=()=>{state.ids=[...new Set([...state.ids,...matches().map(p=>p.id)])];state.page=0;render();};
  $('clear').onclick=()=>{state.ids=[];state.page=0;render();};
  $('done').onclick=()=>{$('picker').open=false;$('comparison').focus();};
  $('reset').onclick=reset;$('empty-reset').onclick=reset;
  $('app').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;for(const k of ['view','display'])if(b.dataset[k]){state[k]=b.dataset[k];render();}});
  $('previous').onclick=()=>{state.page--;render();$('comparison').focus();};
  $('next').onclick=()=>{state.page++;render();$('comparison').focus();};
  $('charts').onchange=e=>{const id=e.target.dataset.inspect;if(!known.has(id))return;inspectYears[id]=Number(e.target.value);$('inspect-'+id).textContent=inspect(known.get(id));};
  $('share').onclick=()=>{
    const url=new URL(location.href);url.search='';url.hash='';
    for(const [k,v] of Object.entries({theme:'qb_year_two_preview',players:state.ids.join(','),measure:state.metric,view:state.view,window:state.window,display:state.display}))url.searchParams.set(k,v);
    $('share-url').value=url.href;$('share-box').hidden=false;$('share-url').focus();$('share-url').select();
  };
  $('export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([csv()],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download=state.view==='pair'?'qb-preview-comparison.csv':'qb-preview-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('years').textContent=`${data.meta.season_start}–${data.meta.through}`;
  $('coverage').textContent=`${data.players.length} quarterbacks; regular-season observations ${data.meta.season_start}–${data.meta.through}. Earlier history is used to identify study starts. ${data.meta.status}`;
  $('limitations').innerHTML=data.meta.limitations.filter(s=>!s.startsWith('Hall of Fame')&&!s.startsWith('Team colors')).map(s=>`<li>${esc(s)}</li>`).join('');
  $('sources').innerHTML=data.meta.sources.filter(s=>!s.label.startsWith('Pro Football Hall')).map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a> — ${esc(s.used)}</li>`).join('');
  $('build').textContent=`Comparison preview · v${data.build.version}${data.build.commit?' · '+data.build.commit.slice(0,7):''}`;
  window.addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const width=$('comparison').clientWidth;if(width===lastWidth)return;lastWidth=width;if(state.display==='chart'&&selected().length)charts();});});
  window.QBPreview={getState:()=>clone(state),defaults:clone(defaults),csv,valid};
  render();lastWidth=$('comparison').clientWidth;
})();
