/* Shared chart UI. Sport adapters supply records, units and study-start rules. */
(() => {
  'use strict';
  const M=YearTwoChartMath,instances=new Map(),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    palette=['#00665c','#99401d','#305da5','#814285','#79600a','#9e3569','#286d86','#52632b'],
    defaults={layout:'overlay',timeline:'career',window:'5',height:'normal',normalize:'raw',focus:[],colorOrder:[],context:40,markers:'auto',trend:false,moving:false,mean:false,median:false,zero:false,target:'',targetOn:false,scope:'focused',display:'chart'};
  const clone=o=>JSON.parse(JSON.stringify(o));
  if(new URLSearchParams(location.search).get('classic')==='1'){
    document.querySelectorAll('.yt-sports a').forEach(a=>{const url=new URL(a.href);url.searchParams.set('classic','1');a.href=url.pathname+url.search;});
    const link=document.createElement('a'),url=new URL(location.href);url.searchParams.delete('classic');link.href=url.href;link.textContent='Return to the shared chart workspace →';link.className='yt-classic-return';document.querySelector('.yt-sports')?.after(link);
  }
  function valid(raw){
    const s=clone(defaults);if(!raw||typeof raw!=='object')return s;
    for(const [k,choices] of Object.entries({layout:['overlay','separate'],timeline:['career','calendar'],window:['2','5','10','all'],height:['compact','normal','tall'],normalize:['raw','delta'],markers:['auto','all','none'],scope:['focused','all'],display:['chart','table']}))if(choices.includes(raw[k]))s[k]=raw[k];
    for(const k of ['trend','moving','mean','median','zero','targetOn'])s[k]=raw[k]===true;
    if(Array.isArray(raw.focus))s.focus=[...new Set(raw.focus.filter(v=>typeof v==='string'))];
    if(Array.isArray(raw.colorOrder))s.colorOrder=[...new Set(raw.colorOrder.filter(v=>typeof v==='string'))];
    if(Number.isFinite(raw.context))s.context=Math.max(20,Math.min(80,raw.context));
    if(typeof raw.target==='string'&&raw.target.length<=24)s.target=raw.target;
    return s;
  }
  function mount(adapter){
    if(new URLSearchParams(location.search).get('classic')==='1')return;
    const host=document.querySelector(adapter.host);if(!host)return;
    const root=document.createElement('section');root.className='yt-chart';root.id='yt-chart-'+adapter.id;root.setAttribute('aria-label','Shared sports chart workspace');
    [...host.children].forEach(el=>el.classList.add('yt-original'));
    host.classList.add('yt-modern-host');host.prepend(root);
    const app=document.querySelector(adapter.app);app.classList.add('yt-modern-comparison');
    const id=name=>root.id+'-'+name,$=name=>root.querySelector('[data-ui="'+name+'"]');
    const select=(name,label,options)=>`<label for="${id(name)}">${label}<select id="${id(name)}" data-ui="${name}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
    const check=(name,label)=>`<label class="yt-check"><input type="checkbox" data-ui="${name}">${label}</label>`;
    root.innerHTML=`<header class="yt-chart-head"><div><p class="yt-chart-eyebrow">COMPARE THE SAME WAY · EVERY SPORT</p><h2 data-ui="title"></h2></div><a data-ui="classic">Previous chart workspace ↗</a></header>
      <p class="yt-chart-note" data-ui="clock"></p>
      <div class="yt-chart-primary"><details data-ui="picker"><summary>Add / remove players <span data-ui="count"></span></summary><div class="yt-picker-body"><label for="${id('search')}">Find a player</label><input id="${id('search')}" data-ui="search" type="search" placeholder="Name" maxlength="100"><div class="yt-chart-actions"><button data-action="add">Add all matches</button><button data-action="clear">Clear selection</button></div><p data-ui="matches" role="status"></p><div data-ui="players" class="yt-picker-list"></div><button data-action="more" hidden>Show more matches</button><button data-action="done">Done choosing</button></div></details>${select('metric','Measure',[])}</div>
      <div class="yt-chart-grid">${select('layout','Compare players',[['overlay','One shared graph'],['separate','Separate graphs']])}${select('timeline','Time along the bottom',[['career','Study years'],['calendar','Calendar years']])}${select('window','Years to show',[['2','Year 1 → 2'],['5','First 5 years'],['10','First 10 years'],['all','Full career']])}${select('height','Graph height',[['compact','Compact'],['normal','Regular'],['tall','Tall']])}</div>
      <p class="yt-chart-note" data-ui="measure-note"></p>
      <div class="yt-chart-folds"><details><summary>Highlight &amp; reduce clutter</summary><p>Highlight several names to compare them. Other selected lines stay on the graph.</p><div class="yt-chart-grid">${select('markers','Season markers',[['auto','Automatic'],['all','All measured seasons'],['none','Year two only']])}<label for="${id('context')}">Other-line visibility <span data-ui="context-value"></span><input id="${id('context')}" data-ui="context" type="range" min="20" max="80" step="10"></label>${select('normalize','Values',[['raw','Actual values'],['delta','Change from year one']])}</div><button data-action="unfocus">Clear highlights</button></details>
      <details data-ui="analysis"><summary>Add trend &amp; reference lines <span data-ui="line-count"></span></summary><div class="yt-overlay-options">${check('trend','Linear trend')}${check('moving','3-year moving average')}${check('mean','Mean of shown years')}${check('median','Median of shown years')}${check('zero','Zero reference')}${check('targetOn','Custom reference')}</div><div class="yt-chart-grid">${select('scope','Add player lines for',[['focused','Highlighted players'],['all','Everyone selected']])}<label for="${id('target')}">Custom reference value<input id="${id('target')}" data-ui="target" type="number" step="any" placeholder="Value in axis units"></label></div><p class="yt-chart-note">With no highlights, added player lines apply to everyone. Dashed = trend; long dash = moving average; dotted = mean; dash-dot = median. Original observations stay visible.</p><p class="yt-chart-note">Fits use the shown years, one equally weighted value per measured year. A trend needs 3 measured years; smoothing needs 3 consecutive years. Neither is a forecast.</p><button data-action="remove-lines">Remove added lines</button></details></div>
      <div class="yt-chart-bar"><p data-ui="population" role="status"></p><div role="group" aria-label="Display format"><button data-display="chart">Chart</button><button data-display="table">Table</button></div></div>
      <p class="yt-chart-note" data-ui="focus-note"></p><div data-ui="legend" class="yt-chart-legend" aria-label="Highlight selected players"></div>
      <p class="yt-chart-key">Solid lines = recorded values · diamond = study year two · gaps = unavailable values</p>
      <div data-ui="overlay-key" class="yt-overlay-key" aria-label="Added line styles" hidden></div>
      <div data-ui="plot" class="yt-chart-plot" tabindex="-1"></div><div data-ui="table" class="yt-chart-table" tabindex="0" role="region" aria-label="Scrollable selected data table" hidden></div>
      <nav data-ui="pages" class="yt-chart-actions" aria-label="Player panels" hidden><button data-action="previous">← Previous</button><span data-ui="page-label"></span><button data-action="next">Next →</button></nav>
      <div class="yt-chart-inspect">${select('inspect-player','Inspect a player',[])}${select('inspect-year','Inspect a season',[])}<p data-ui="readout" role="status"></p></div>
      <p class="yt-chart-note" data-ui="bounds"></p><p class="yt-chart-warning" data-ui="warnings" role="status"></p>
      <details data-ui="calculations"><summary>Added-line values &amp; method</summary><div data-ui="line-info"></div><p class="yt-chart-note">Linear trend minimizes squared vertical errors over observed points and stops at the first/last measured year. R² describes this straight-line fit, not statistical significance or predictive accuracy. The trailing mean averages the current and previous two consecutive years. Mean and median lines summarize each player’s shown years, not a league or pooled-player average. Missing years are never replaced by zero.</p><p class="yt-chart-note"><a href="https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm" target="_blank" rel="noopener">NIST: least squares</a> · <a href="https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc42.htm" target="_blank" rel="noopener">NIST: moving averages</a></p></details>
      <p class="yt-chart-note" data-ui="source"></p><div class="yt-chart-actions"><button data-action="download">Download shown data</button><button data-action="reset">Reset graph options</button></div>`;
    const classic=new URL(location.href);classic.searchParams.set('classic','1');$('classic').href=classic.href;
    let model=null,state=clone(defaults),scope='',metricKey='',settingsStamp='',query='',limit=100,page=0,inspectId='',inspectYear=null,prepared=[],bounds,lastWidth=0,frame;
    const storeKey=()=>`year-two-chart-v1:${scope}`;
    const save=()=>{try{localStorage.setItem(storeKey(),JSON.stringify(state));}catch(_){} };
    const selected=()=>model.players.filter(p=>model.ids.includes(p.id));
    const metric=()=>model.metrics[model.metric];
    const fmt=n=>M.finite(n)?n.toLocaleString('en-US',{minimumFractionDigits:metric().digits??2,maximumFractionDigits:metric().digits??2}):'Unavailable';
    const rawUnits=()=>metric().unit||metric().name;
    const units=()=>state.normalize==='delta'?(metric().changeUnit||(rawUnits()==='%'?'percentage points':rawUnits())):rawUnits();
    const number=n=>!M.finite(n)?'Unavailable':Math.abs(n)>=10000?n.toLocaleString('en-US',{maximumFractionDigits:0}):Number(n.toPrecision(5)).toString();
    const tick=n=>Math.abs(n)>=10000?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n):n!==0&&Math.abs(n)<.001?n.toExponential(1):number(n);
    const matches=()=>(model.available||model.players).filter(p=>!query||p.name.toLowerCase().includes(query.toLowerCase()));
    function picker(){
      const list=matches(),scroll=$('players').scrollTop,focus=document.activeElement?.dataset.pick;
      $('matches').textContent=`${list.length} matches. Search changes this list only.`;
      $('players').innerHTML=list.slice(0,limit).map(p=>`<label><input type="checkbox" data-pick="${esc(p.id)}" ${model.ids.includes(p.id)?'checked':''}><span>${esc(p.name)}<small>${Number.isInteger(p.first)?'Study start '+p.first:'No qualifying study start'}</small></span></label>`).join('')||'<p>No matching names.</p>';
      root.querySelector('[data-action="more"]').hidden=list.length<=limit;$('players').scrollTop=scroll;
      if(focus)$('players').querySelector(`[data-pick="${focus}"]`)?.focus({preventScroll:true});
    }
    function makeData(){
      const chosen=selected();state.colorOrder=[...new Set([...state.colorOrder,...chosen.map(p=>p.id)])];const colors=new Map(state.colorOrder.map((id,i)=>[id,palette[i%palette.length]]));
      prepared=chosen.map(p=>{const points=M.series(p,model.metric,state),included=state.scope==='all'||!state.focus.length||state.focus.includes(p.id),added=M.overlays(points,included?state:{});return {p,points,color:colors.get(p.id),added};});
      const target=state.target.trim()===''?null:Number(state.target),values=prepared.flatMap(s=>[...s.points.map(p=>p.y),...s.added.lines.flatMap(l=>l.points.map(p=>p.y))]);
      if(state.targetOn&&M.finite(target))values.push(target);
      bounds=M.axis(values,state.zero||state.normalize==='delta');
      const xvals=prepared.flatMap(s=>s.points.map(p=>p.x));bounds.xlo=xvals.length?xvals.reduce((a,b)=>Math.min(a,b),Infinity):state.timeline==='calendar'?model.through:1;bounds.xhi=xvals.reduce((a,b)=>Math.max(a,b),bounds.xlo+1);
    }
    function plot(group,width,height,separate){
      const top=34,left=58,right=18,bottom=54,w=width-left-right,h=height-top-bottom,x=v=>left+(v-bounds.xlo)/(bounds.xhi-bounds.xlo)*w,y=v=>top+(bounds.hi-v)/(bounds.hi-bounds.lo)*h;
      const clip=`${root.id}-clip-${separate?group[0].p.id:'all'}`,unitTitle=(state.normalize==='delta'?'Change · ':'')+units();
      let out=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metric().name)} over time. ${group.length} selected players. Exact data is available in the table and season inspector." data-low="${bounds.lo}" data-high="${bounds.hi}" data-xlow="${bounds.xlo}" data-xhigh="${bounds.xhi}"><defs><clipPath id="${clip}"><rect x="${left-6}" y="${top-8}" width="${w+12}" height="${h+16}"/></clipPath></defs><text class="yt-axis-title" x="${left}" y="16">${esc(unitTitle)}</text>`;
      for(const t of bounds.ticks)out+=`<line class="yt-grid" x1="${left}" x2="${width-right}" y1="${y(t)}" y2="${y(t)}"/><text class="yt-axis" x="${left-7}" y="${y(t)+4}" text-anchor="end">${esc(tick(t))}</text>`;
      const count=Math.max(1,Math.floor(w/(state.timeline==='calendar'?68:48))),ticks=[...new Set(Array.from({length:count+1},(_,i)=>Math.round(bounds.xlo+(bounds.xhi-bounds.xlo)*i/count)))];
      for(const t of ticks)out+=`<text class="yt-axis" x="${x(t)}" y="${height-29}" text-anchor="middle">${t}</text>`;
      out+=`<text class="yt-axis-title" text-anchor="middle" x="${left+w/2}" y="${height-7}">${state.timeline==='calendar'?'Calendar year':'Year from study start'}</text>`;
      const references=[];if(state.zero)references.push({value:0,label:'Zero'});if(state.targetOn&&state.target.trim()!==''&&M.finite(Number(state.target)))references.push({value:Number(state.target),label:'Custom reference'});
      for(const r of references)out+=`<line class="yt-reference" data-reference="${r.label}" x1="${left}" x2="${width-right}" y1="${y(r.value)}" y2="${y(r.value)}"/><text class="yt-reference-label" x="${left+4}" y="${y(r.value)-6}">${r.label}: ${esc(number(r.value))}</text>`;
      const endpoints=[],ordered=[...group].sort((a,b)=>Number(state.focus.includes(a.p.id))-Number(state.focus.includes(b.p.id)));
      for(const s of ordered){
        const focused=state.focus.includes(s.p.id),fade=!separate&&state.focus.length&&!focused?state.context/100:1,validPoints=s.points.filter(p=>M.finite(p.y));
        out+=`<g data-series="${esc(s.p.id)}" style="opacity:${fade}" clip-path="url(#${clip})"><path class="yt-raw-line" data-line="raw" d="${M.path(s.points,x,y)}" stroke="${s.color}" stroke-width="${focused?3.4:group.length>12?1.35:2.3}"/>`;
        const markers=state.markers==='all'||focused||state.markers==='auto'&&group.length<=12;
        for(const p of validPoints){const xx=x(p.x),yy=y(p.y);if(p.studyYear===2)out+=`<path class="yt-point" data-point="${esc(s.p.id)}" data-year="${p.year}" d="M${xx},${yy-5}L${xx+5},${yy}L${xx},${yy+5}L${xx-5},${yy}Z" fill="${s.color}" stroke="#fffdf7"><title>${esc(s.p.name)} · ${p.year} · ${esc(fmt(p.y))}</title></path>`;else if(markers||validPoints.length===1)out+=`<circle class="yt-point" data-point="${esc(s.p.id)}" data-year="${p.year}" cx="${xx}" cy="${yy}" r="3.2" fill="#fffdf7" stroke="${s.color}" stroke-width="1.8"><title>${esc(s.p.name)} · ${p.year} · ${esc(fmt(p.y))}</title></circle>`;}
        for(const line of s.added.lines){out+=`<path class="yt-added-line" data-line="${line.kind}" d="${M.path(line.points,x,y,line.kind!=='moving')}" stroke="${s.color}" stroke-dasharray="${{trend:'8 4',moving:'14 5',mean:'2 5',median:'9 3 2 3'}[line.kind]}" stroke-width="${line.kind==='moving'?3:2}"/>`;const last=line.points.filter(p=>M.finite(p.y)).at(-1);if(line.kind==='moving'&&last&&line.points.filter(p=>M.finite(p.y)).length===1)out+=`<rect x="${x(last.x)-4}" y="${y(last.y)-4}" width="8" height="8" fill="${s.color}"/>`;}
        out+='</g>';
        if(validPoints.length)endpoints.push({id:s.p.id,name:s.p.name,color:s.color,x:x(validPoints.at(-1).x),y:y(validPoints.at(-1).y)});
      }
      const candidates=endpoints.length<=Math.floor(h/24)?endpoints:endpoints.filter(p=>state.focus.includes(p.id));
      if(candidates.length<=Math.floor(h/24))for(const p of M.labels(candidates,top+12,height-bottom-9,22))out+=`<g class="yt-end-label" pointer-events="none"><path d="M${p.x},${p.y}L${width-right-3},${p.labelY-4}" stroke="${p.color}" stroke-width="1" fill="none"/><text text-anchor="end" x="${width-right-5}" y="${p.labelY}" fill="${p.color}">${esc(p.name)}</text></g>`;
      return out+'</svg>';
    }
    function draw(){
      const list=prepared,height={compact:280,normal:400,tall:660}[state.height],separate=state.layout==='separate',perPage=6,max=Math.max(0,Math.ceil(list.length/perPage)-1);page=Math.min(page,max);
      const shown=separate?list.slice(page*perPage,(page+1)*perPage):list,groups=separate?shown.map(s=>[s]):[shown],columns=separate&&root.clientWidth>800?2:1,width=Math.max(232,Math.floor((root.clientWidth-(columns-1)*20)/columns));
      $('plot').classList.toggle('yt-panels',separate);$('plot').innerHTML=!list.length?'<p>No players selected. Open Add / remove players to choose names.</p>':groups.map(g=>`<article>${separate?`<h3>${esc(g[0].p.name)}</h3>`:''}${plot(g,width,height,separate)}</article>`).join('');
      $('pages').hidden=!separate||list.length<=perPage||state.display==='table';$('page-label').textContent=`${page*perPage+1}–${Math.min((page+1)*perPage,list.length)} of ${list.length}`;
      root.querySelector('[data-action="previous"]').disabled=page===0;root.querySelector('[data-action="next"]').disabled=page===max;
      const drawn=list.filter(s=>s.points.some(p=>M.finite(p.y))).length;
      $('population').textContent=`${list.length} selected · ${drawn} with measured values${!separate?' · all on this graph':` · panels ${page*perPage+1}–${Math.min((page+1)*perPage,list.length)}`}. No selection cap.`;
      $('bounds').textContent=`Shared linear scale: ${number(bounds.lo)} to ${number(bounds.hi)} ${units()}. ${state.normalize==='delta'?'Zero is each player’s year-one value. ':''}${state.timeline==='career'?'Study years align stages, not calendar dates. ':''}All selected players are included in the table and download.`;
    }
    function inspection(){
      if(!prepared.some(s=>s.p.id===inspectId))inspectId=state.focus.find(id=>prepared.some(s=>s.p.id===id))||prepared[0]?.p.id||'';
      $('inspect-player').innerHTML=prepared.map(s=>`<option value="${esc(s.p.id)}">${esc(s.p.name)}</option>`).join('');$('inspect-player').value=inspectId;
      const s=prepared.find(s=>s.p.id===inspectId);if(!s){$('inspect-year').innerHTML='';$('readout').textContent='Choose a player to inspect exact values.';return;}
      if(!s.points.some(p=>p.year===inspectYear))inspectYear=s.points.find(p=>p.studyYear===2)?.year??s.points[0]?.year;
      $('inspect-year').innerHTML=s.points.map(p=>`<option value="${p.year}">${p.year} · year ${p.studyYear}</option>`).join('');$('inspect-year').value=String(inspectYear);
      const point=s.points.find(p=>p.year===inspectYear);
      $('readout').textContent=point?`${s.p.name} · ${point.year}: ${fmt(point.raw)} ${rawUnits()}${state.normalize==='delta'?' · plotted change '+fmt(point.y)+' '+units():''}. ${model.context(s.p,point.row,point.year)}`:'No qualifying study start for this player.';
      if(model.info){const info=model.info(s.p,point?.row);if(info.text)$('readout').append(document.createTextNode(' '+info.text));for(const item of info.links||[]){if(!/^(https?:\/\/|\/)/.test(item.url))continue;const a=document.createElement('a');a.href=item.url;a.textContent=item.label;a.target='_blank';a.rel='noopener';$('readout').append(document.createElement('br'),a);}}
    }
    function rows(){return prepared.flatMap(s=>{const moving=new Map(s.added.lines.find(l=>l.kind==='moving')?.points.map(p=>[p.year,p.y])||[]),trend=s.added.lines.find(l=>l.kind==='trend'),mean=s.added.lines.find(l=>l.kind==='mean')?.points[0].y,median=s.added.lines.find(l=>l.kind==='median')?.points[0].y;return s.points.map(p=>[s.p.name,s.p.id,p.year,p.studyYear,model.metric,p.raw,rawUnits(),p.y,units(),trend&&p.x>=trend.points[0].x&&p.x<=trend.points.at(-1).x?trend.fit.intercept+trend.fit.slope*p.x:null,moving.get(p.year),mean,median,model.context(s.p,p.row,p.year),new URL(s.p.source||model.sourceUrl,location.href).href]);});}
    const headers=['Player','Player ID','Season','Study year','Measure','Recorded value','Recorded units','Graph value','Graph units','Linear trend value','3-year moving average','Mean of shown years','Median of shown years','Context','Source'];
    function table(){if(state.display!=='table'){$('table').innerHTML='';return;}$('table').innerHTML=`<table><caption>All selected players · ${esc(metric().name)} · ${state.normalize==='delta'?'year-one changes':'actual values'}</caption><thead><tr>${headers.map(s=>`<th scope="col">${s}</th>`).join('')}</tr></thead><tbody>${rows().map(r=>'<tr>'+r.map((v,i)=>`<${i===0?'th scope="row"':'td'}>${esc(v??'Unavailable')}</${i===0?'th':'td'}>`).join('')+'</tr>').join('')}</tbody></table>`;}
    function render(){
      if(!model)return;
      state.focus=state.focus.filter(id=>model.ids.includes(id));
      $('title').textContent=metric().name+' over time';$('clock').textContent=model.clock;
      $('count').textContent=`(${selected().length})`;
      $('metric').innerHTML=Object.entries(model.metrics).map(([k,m])=>`<option value="${k}">${esc(m.name)}</option>`).join('');$('metric').value=model.metric;
      for(const k of ['layout','timeline','window','height','normalize','markers','context','scope','target'])$(k).value=String(state[k]);
      for(const k of ['trend','moving','mean','median','zero','targetOn'])$(k).checked=state[k];
      $('target').disabled=!state.targetOn;$('context-value').textContent=state.context+'%';
      $('measure-note').textContent=metric().note||'';
      const count=['trend','moving','mean','median','zero','targetOn'].filter(k=>state[k]).length;$('line-count').textContent=count?'('+count+')':'';
      $('overlay-key').hidden=!count;$('overlay-key').innerHTML=[['trend','Linear trend','8 4'],['moving','3-year moving average','14 5'],['mean','Mean','2 5'],['median','Median','9 3 2 3'],['zero','Zero','5 5'],['targetOn','Custom reference','5 5']].filter(([k])=>state[k]).map(([,name,dash])=>`<span><svg width="42" height="12" aria-hidden="true"><line x1="0" x2="42" y1="6" y2="6" stroke="#203b38" stroke-width="2" stroke-dasharray="${dash}"/></svg>${name}</span>`).join('');
      root.querySelectorAll('[data-display]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.display===state.display)));
      $('plot').hidden=state.display!=='chart';$('table').hidden=state.display!=='table';
      picker();makeData();
      const legendScroll=$('legend').scrollTop,legendFocus=document.activeElement?.dataset.highlight;
      $('legend').innerHTML=prepared.map(s=>`<button data-highlight="${esc(s.p.id)}" aria-pressed="${state.focus.includes(s.p.id)}"><i style="background:${s.color}"></i>${esc(s.p.name)}${s.points.some(p=>M.finite(p.y))?'':' · no values'}</button>`).join('');$('legend').scrollTop=legendScroll;
      if(legendFocus)$('legend').querySelector(`[data-highlight="${legendFocus}"]`)?.focus({preventScroll:true});
      $('focus-note').textContent=state.focus.length?`Highlighted: ${prepared.filter(s=>state.focus.includes(s.p.id)).map(s=>s.p.name).join(', ')}. Other lines remain visible at ${state.context}%.`:'Tap names to highlight several players. All selected lines remain visible.';
      draw();inspection();table();
      const messages=[];
      for(const s of prepared){const q=s.points.find(p=>p.studyYear===2);if(!s.points.some(p=>M.finite(p.y)))messages.push(`${s.p.name}: no measured values in this view.`);else if(!q||!M.finite(q.raw))messages.push(`${s.p.name}: year two unavailable.`);if(s.p.anchor_uncertain)messages.push(`${s.p.name}: study start uncertain.`);if(q?.row&&model.small(s.p,q.row))messages.push(`${s.p.name}: smaller year-two workload (${model.context(s.p,q.row,q.year)}).`);}
      const skipped=prepared.filter(s=>s.added.info.some(n=>n.startsWith('Needs')||n.startsWith('Moving average needs')));
      if(skipped.length)messages.push(`Added lines unavailable for ${skipped.length} player(s): choose more years. See Added-line values & method.`);
      if(state.targetOn&&(state.target.trim()===''||!M.finite(Number(state.target))))messages.push('Enter a finite custom reference value in the displayed units.');
      $('warnings').textContent=messages.slice(0,5).join(' ')+(messages.length>5?` ${messages.length-5} more notices; use the table and inspector for each player.`:'');$('warnings').hidden=!messages.length;
      $('line-info').innerHTML=prepared.filter(s=>s.added.info.length||s.added.lines.length).map(s=>`<h3>${esc(s.p.name)}</h3><p>${esc(s.added.info.join(' '))}</p>${s.added.lines.filter(l=>['mean','median'].includes(l.kind)).map(l=>`<p>${l.label}: ${esc(number(l.points[0].y))} ${esc(units())}</p>`).join('')}`).join('')||'<p>No player interpretation lines added.</p>';
      $('source').textContent=`Source: ${model.source}. ${model.coverage} ${state.window==='2'?'The next calendar season is year two, even when no row exists.':''}`;
      save();lastWidth=root.clientWidth;
    }
    function update(){
      const next=adapter.model();if(!next)return;app.classList.toggle('yt-modern-comparison',next.active!==false);model=next;
      const nextScope=adapter.id+':'+(model.dataset||'default');
      if(scope!==nextScope){scope=nextScope;state=valid({...defaults,...model.settings});try{const saved=JSON.parse(localStorage.getItem(storeKey())||'null');if(saved)state=valid(saved);}catch(_){}page=0;query='';$('search').value='';settingsStamp=JSON.stringify(model.settings);metricKey=model.metric;}
      else {const stamp=JSON.stringify(model.settings);if(settingsStamp!==stamp){if(model.settings.normalize&&model.settings.normalize!==state.normalize){state.target='';state.targetOn=false;}state=valid({...state,...model.settings});settingsStamp=stamp;page=0;}if(metricKey!==model.metric){state.target='';state.targetOn=false;metricKey=model.metric;}}
      render();
    }
    function options(){const requested=clone(state);save();adapter.set({layout:state.layout,height:state.height,window:state.window,normalize:state.normalize,timeline:state.timeline});state=requested;update();}
    root.addEventListener('change',e=>{
      const t=e.target,k=t.dataset.ui;
      if(t.dataset.pick){const ids=new Set(model.ids);t.checked?ids.add(t.dataset.pick):ids.delete(t.dataset.pick);adapter.set({ids:[...ids]});update();return;}
      if(k==='metric'){adapter.set({metric:t.value});update();return;}
      if(k==='inspect-player'){inspectId=t.value;inspectYear=null;inspection();return;}
      if(k==='inspect-year'){inspectYear=Number(t.value);inspection();return;}
      if(!Object.hasOwn(defaults,k))return;
      if(k==='normalize'&&state.normalize!==t.value){state.target='';state.targetOn=false;}
      state[k]=t.type==='checkbox'?t.checked:k==='context'?Number(t.value):t.value;page=0;
      if(['layout','height','window','normalize','timeline'].includes(k))options();else render();
    });
    $('search').addEventListener('input',e=>{query=e.target.value;limit=100;picker();});
    root.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;const action=b.dataset.action;
      if(b.dataset.highlight){const id=b.dataset.highlight;state.focus=state.focus.includes(id)?state.focus.filter(x=>x!==id):[...state.focus,id];inspectId=id;render();return;}
      if(b.dataset.display){state.display=b.dataset.display;render();return;}
      if(action==='add')adapter.set({ids:[...new Set([...model.ids,...matches().map(p=>p.id)])]});
      if(action==='clear')adapter.set({ids:[]});
      if(action==='done'){$('picker').open=false;$('plot').focus({preventScroll:true});return;}
      if(action==='more'){limit+=100;picker();return;}
      if(action==='unfocus')state.focus=[];
      if(action==='remove-lines')for(const k of ['trend','moving','mean','median','zero','targetOn'])state[k]=false;
      if(action==='reset'){state=valid(defaults);page=0;options();return;}
      if(action==='previous'||action==='next'){page+=action==='next'?1:-1;draw();$('plot').focus({preventScroll:true});return;}
      if(action==='download'){
        const safe=v=>{let s=String(v??'');if(/^[=+@]/.test(s)||/^-\D/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';},
          csv=[['Source',model.source,new URL(model.sourceUrl,location.href).href],['Graph values',state.normalize,'Window',state.window,'Timeline',state.timeline],['Added player lines',['trend','moving','mean','median'].filter(k=>state[k]).join('; '),'Scope',state.scope,'Highlighted IDs',state.focus.join('; '),'Zero reference',state.zero,'Custom reference',state.targetOn?state.target:''],headers,...rows()].map(r=>r.map(safe).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
        a.href=url;a.download=adapter.id+'-selected-graph.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
      }
      update();
    });
    let touch=null,drag=false;
    $('plot').addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY};drag=false;},{passive:true});
    $('plot').addEventListener('pointermove',e=>{if(touch&&Math.hypot(touch.x-e.clientX,touch.y-e.clientY)>10)drag=true;},{passive:true});
    $('plot').addEventListener('pointercancel',()=>{drag=true;},{passive:true});
    $('plot').addEventListener('click',e=>{const p=e.target.closest('[data-point]');if(p&&!drag){inspectId=p.dataset.point;inspectYear=Number(p.dataset.year);inspection();}});
    const redraw=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(root.clientWidth>0&&root.clientWidth!==lastWidth){lastWidth=root.clientWidth;draw();}});};
    window.addEventListener('resize',redraw);document.addEventListener('yt:layout',redraw);
    instances.set(adapter.id,{update,getState:()=>clone(state),getData:()=>prepared,root});update();
  }
  window.YearTwoCharts={register:mount,refresh:id=>instances.get(id)?.update(),get:id=>instances.get(id),valid};
})();
