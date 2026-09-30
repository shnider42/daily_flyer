/* Baseball UI. Football has its own DOM, data, presets and saved view. */
(() => {
  'use strict';
  const config=JSON.parse(document.getElementById('bb-data').textContent),R=BaseballResearch,S=QBResearch,C=QBChartMath;
  const $=id=>document.getElementById('bb-'+id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=x=>JSON.parse(JSON.stringify(x)),finite=R.finite,storageKey='baseball-year-two-v1';
  const palette=['#16654e','#aa412f','#305da5','#814285','#946216','#097c89','#bd3d70','#53603b'];
  const roleDefaults=role=>({...clone(config.defaults),role,metric:role==='batting'?'ops':'era',ids:role==='batting'?['ortizda01','bettsmo01','troutmi01','judgeaa01']:['martipe02','johnsra05','riverma01','ohtansh01']});
  let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch(_){}
  let state={...roleDefaults(saved.state?.role==='pitching'?'pitching':'batting'),...saved.state},views=saved.views||{},players=[],byId=new Map(),playerIndex=new Map(),focus=saved.focus||null;
  const cache=new Map(),requests=new Map();let generation=0,presetIntent=0,activePreset=null,undo=null,study=null,visibleRows=[],lastWidth=0;
  let presets=clone(config.presets.presets),busy=false;
  function clean(s){
    const def=roleDefaults(s.role==='pitching'?'pitching':'batting');
    s={...def,...Object.fromEntries(Object.keys(def).filter(k=>Object.hasOwn(s,k)).map(k=>[k,s[k]]))};
    if(!config.metrics[s.role]?.[s.metric])s.metric=def.metric;
    for(const [k,choices] of Object.entries({role:['batting','pitching'],mode:['compare','research','scan'],outcome:Object.keys(R.definitions),x:['a','b','delta'],view:['pair','career','span'],window:['5','10','all'],normalize:['raw','delta','zscore'],scale:['linear','density','log','symlog'],layout:['overlay','separate'],colors:['player','team','hof'],selection:['fixed','all','improved','declined'],sort:['name','improved','declined','newest','oldest','span'],hof:['all','yes','no'],era:['all','1950','1960','1970','1980','1990','2000','2010','2020']}))if(!choices.includes(s[k]))s[k]=def[k];
    s.search=typeof s.search==='string'?s.search.slice(0,100):'';s.qual2=s.qual2===true;s.skip2020=s.skip2020===true;
    if(!['25','50','100','250','500','all'].includes(s.display))s.display='all';
    const maximum=config.meta.counts[s.role].players;
    s.count=Number.isInteger(s.count)&&s.count>=1&&s.count<=maximum?s.count:4;s.ids=Array.isArray(s.ids)?[...new Set(s.ids.filter(x=>typeof x==='string'))].slice(0,maximum):def.ids;
    if(s.team!=='all'&&!Object.hasOwn(config.teams,s.team))s.team='all';return s;
  }
  state=clean(state);
  function save(){views[state.role]=clone(state);try{localStorage.setItem(storageKey,JSON.stringify({state,views,focus}));}catch(_){} }
  function fmt(v,metric=state.metric,signed=false){if(!finite(v))return '—';const digits=config.metrics[state.role][metric]?.digits??2;return (signed&&v>0?'+':'')+v.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
  const num=(v,d=2)=>finite(v)?v.toFixed(d):'—';
  const measure=()=>config.metrics[state.role][state.metric];
  const workload=s=>!s?'No season record':state.role==='batting'?(finite(s.pa)?s.pa.toLocaleString()+' PA':'PA unavailable'):(finite(s.ip)?num(s.ip)+' IP':'IP unavailable');
  const pair=p=>R.pair(p,state.metric);
  async function loadRole(role){
    if(cache.has(role))return cache.get(role);
    if(requests.has(role))return requests.get(role);
    const request=(async()=>{const response=await fetch('/api/baseball-data/'+role,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('The scorebook could not be loaded.');const packed=await response.json();
      const result=packed.players.map(p=>{const seasons=p.seasons.map(row=>Object.fromEntries(packed.columns.map((key,i)=>[key,row[i]])));return {...p,seasons,teams:[...new Set(seasons.flatMap(s=>s.team.split(' / ')))]};});cache.set(role,result);return result;
    })();requests.set(role,request);try{return await request;}finally{requests.delete(role);}
  }
  async function activate(next,keepFocus=false){
    const token=++generation;busy=true;$('load').textContent='Loading '+(next.role==='batting'?'hitters':'pitchers')+'…';$('workspace').hidden=true;
    try{const list=await loadRole(next.role);if(token!==generation)return;state=clean(next);players=list;byId=new Map(players.map(p=>[p.id,p]));playerIndex=new Map(players.map((p,i)=>[p.id,i]));state.ids=state.ids.filter(id=>byId.has(id));if(!keepFocus||!byId.has(focus?.id))focus=null;
      $('workspace').hidden=false;$('load').textContent='';busy=false;sync();render();lastWidth=Math.round($('workspace').getBoundingClientRect().width);return true;
    }catch(error){if(token!==generation)return false;busy=false;$('load').innerHTML='<span class="bb-error">The baseball data did not load. Your saved view is safe.</span> <button id="bb-retry">Retry</button>';$('retry').onclick=()=>activate(next,keepFocus);return false;}
  }
  function metricOptions(role,selected){
    return ['Rates','Counting','Fielding'].map(group=>'<optgroup label="'+group+'">'+Object.entries(config.metrics[role]).filter(([,m])=>m.group===group).map(([key,m])=>`<option value="${key}" ${key===selected?'selected':''}>${esc(m.name)}</option>`).join('')+'</optgroup>').join('');
  }
  const formKeys=['search','era','team','hof','qual2','skip2020','sort','metric','window','normalize','scale','layout','colors','display','outcome','x'];
  function sync(){
    $('metric').innerHTML=metricOptions(state.role,state.metric);
    for(const key of formKeys){if(['qual2','skip2020'].includes(key))$(key).checked=state[key];else $(key).value=state[key];}
    $('scan-target').value=state.outcome;
    document.querySelectorAll('[data-role]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.role===state.role)));
    document.querySelectorAll('[data-mode]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.mode===state.mode)));
    document.querySelectorAll('[data-view]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.view===state.view)));
    for(const mode of ['compare','research','scan'])$(mode).hidden=state.mode!==mode;
    $('metric-note').textContent=measure().note+(measure().direction===0?' Higher or lower is not inherently better.':'')+(measure().group==='Fielding'?' All positions combined; role and fielding chances affect comparisons.':'');
    $('role-note').textContent=(state.role==='batting'?'Year 1 = first 300-PA season.':'Year 1 = first 50-IP season; starters and relievers.')+' Two-way players have independent clocks.';
    $('normalize').disabled=$('scale').disabled=$('layout').disabled=state.view==='span';
  }
  function filtered(){return R.filtered(players,state,config.teams);}
  function filterReading(){
    const active=[state.search&&'search: '+state.search,state.era!=='all'&&'entry decade: '+state.era,state.team!=='all'&&'team: '+(config.teams[state.team]||state.team),state.hof!=='all'&&'Hall status: '+state.hof,state.qual2&&'substantial year-two workload required',state.skip2020&&'2020 pairs excluded'].filter(Boolean);
    return (active.length?'Active filters: '+active.join('; ')+'. ':'No cohort filters applied. ')+(state.qual2?'The workload filter leaves out players who lost playing time. ':'')+(state.team!=='all'||state.hof!=='all'?'Team / Hall filters use later-career information; these groups are not prospective forecasts. ':'');
  }
  function sorted(list){return [...list].sort((a,b)=>{
    if(state.sort==='newest')return b.first-a.first||a.name.localeCompare(b.name);
    if(state.sort==='oldest')return a.first-b.first||a.name.localeCompare(b.name);
    if(state.sort==='span')return (b.last-b.first)-(a.last-a.first)||a.name.localeCompare(b.name);
    if(['improved','declined'].includes(state.sort)){const x=pair(a).delta,y=pair(b).delta;if(!finite(x)||!finite(y))return finite(x)?-1:finite(y)?1:a.name.localeCompare(b.name);return (y-x)*(measure().direction||1)*(state.sort==='declined'?-1:1)||a.id.localeCompare(b.id);}
    return a.name.localeCompare(b.name);
  });}
  function clearStory(){presetIntent++;activePreset=null;$('story').hidden=true;document.querySelectorAll('[data-story]').forEach(e=>e.setAttribute('aria-pressed','false'));}
  function changed(){clearStory();sync();render();}
  function toggle(id){state.ids=state.ids.includes(id)?state.ids.filter(x=>x!==id):[...state.ids,id];if(focus?.id===id&&!state.ids.includes(id))focus=null;changed();}
  function render(){
    const list=sorted(filtered());visibleRows=list;$('found').textContent=list.length.toLocaleString()+' players';
    // Render player options only as needed; the full table/export still includes every match.
    $('players').innerHTML=list.slice(0,300).map(p=>`<label class="bb-player"><input type="checkbox" data-player="${esc(p.id)}" ${state.ids.includes(p.id)?'checked':''}><span><strong>${esc(p.name)}${p.hof?' ★':''}</strong><small>Year 1: ${p.first} → Year 2: ${p.first+1}</small></span></label>`).join('')+(list.length>300?'<p class="bb-small">Showing the first 300 matches. Search or filter to find any player; the table and export include all matches.</p>':'');
    $('players').querySelectorAll('input').forEach(e=>e.onchange=()=>toggle(e.dataset.player));
    if(state.mode==='compare')renderCompare(list);
    if(state.mode==='research')renderResearch(list);
    if(state.mode==='scan')renderScan(list);
    save();
  }
  function hashColor(value){let hash=0;for(const c of value)hash=(hash*31+c.charCodeAt(0))>>>0;return `hsl(${hash%360} 52% 34%)`;}
  function color(p,season){return state.colors==='hof'?(p.hof?'#986817':'#246780'):state.colors==='team'?hashColor(season?.team||p.seasons[0].team):palette[playerIndex.get(p.id)%palette.length];}
  const NS='http://www.w3.org/2000/svg';
  function svg(tag,attrs={},text=''){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));e.textContent=text;return e;}
  function pin(p,year){focus={id:p.id,year};applyFocus();inspect(p,year);save();}
  function applyFocus(){
    $('charts').querySelectorAll('[data-series]').forEach(e=>e.style.opacity=focus&&focus.id!==e.dataset.series?'.16':'1');
    if(focus)$('charts').querySelectorAll('[data-series]').forEach(e=>{if(e.dataset.series===focus.id)e.parentElement.append(e);});
    $('legend').querySelectorAll('button').forEach(e=>e.setAttribute('aria-pressed',String(focus?.id===e.dataset.pin)));
    $('pinned').textContent=focus&&byId.has(focus.id)?byId.get(focus.id).name+' pinned · tap another season to inspect':'Tap or focus a season to inspect it.';$('unpin').hidden=!focus;
  }
  function inspect(p,year){
    const {one,two,a,b,delta}=pair(p),row=p.seasons.find(s=>s.year===year),d=measure().direction;
    let reading=!finite(delta)?'No measured year-one / year-two pair.':delta===0?'No measured change in year two.':d===0?'Year-two change: '+fmt(delta,state.metric,true)+'.':(delta*d>0?'Improved':'Declined')+' in year two by '+fmt(Math.abs(delta))+'.';
    if(two&&!two.qualifies)reading+=' Year-two workload is below the study threshold; treat the change cautiously.';
    const link=p.bref&&/^[a-zA-Z0-9]+$/.test(p.bref)?`<a href="https://www.baseball-reference.com/players/${p.bref[0]}/${p.bref}.shtml" target="_blank" rel="noopener">Read ${esc(p.name)}’s Baseball-Reference page ↗</a>`:'';
    $('inspect').innerHTML=`<b>${esc(p.name)} · ${esc(measure().name)}</b><br>Year 1 (${p.first}): <b>${fmt(a)}</b> · ${workload(one)} &nbsp; → &nbsp; Year 2 (${p.first+1}): <b>${fmt(b)}</b> · ${workload(two)}<br>${esc(reading)}${row&&year!==p.first&&year!==p.first+1?`<br>Selected season: ${year}, ${esc(row.team)} · ${fmt(row[state.metric])} · ${workload(row)}`:''}<br>${link}`;
  }
  let pointer=null,dragged=false;
  $('charts').addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};dragged=false;},{passive:true});
  $('charts').addEventListener('pointermove',e=>{if(pointer&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>10)dragged=true;},{passive:true});
  $('charts').addEventListener('pointercancel',()=>{dragged=true;pointer=null;},{passive:true});
  function renderCompare(list){
    $('question').textContent=state.view==='pair'?'Did performance rise or fall in year two?':state.view==='career'?'What happened after the second season?':'How long did the observed career continue?';
    $('purpose').textContent=state.view==='pair'?'Each line joins year one to the very next calendar season. The larger second marker is year two.':state.view==='career'?'Follow the career from its first substantial season. Gaps stay visible, and year two keeps the larger marker.':'Calendar span since the first substantial season. Gaps count in the span; active careers are unfinished. This is descriptive, not the prediction outcome.';
    renderCharts(list);
    const pairs=list.map(pair).filter(r=>finite(r.delta)),direction=measure().direction||1,up=pairs.filter(r=>r.delta*direction>0).length,down=pairs.filter(r=>r.delta*direction<0).length;
    const selected=list.filter(p=>state.ids.includes(p.id)),drawn=state.display==='all'?selected:selected.slice(0,Number(state.display)),m=measure();
    YearTwoView.explain('yt-bb-compare',{
      title:state.view==='span'?'A longer career is not automatically a better career.':m.name+': what changed in year two?',
      takeaway:YearTwoView.comparison(drawn.map(pair),m.direction),
      reading:state.view==='span'?'Each bar shows a player’s observed calendar span, not how well they played. The orange marker is year two. Gaps count; active careers are unfinished.':(state.view==='pair'?'Follow each line from year one to year two. ':'Follow each career over time; the larger marker is year two. ')+(m.direction===0?'Higher or lower is not inherently better for this measure. ':m.direction<0?'Down is an improvement for this measure. ':'Up is an improvement for this measure. ')+(state.normalize==='zscore'?'Values are relative to each player’s own career, not a ranking of ability. ':state.normalize==='delta'?'Zero is each player’s year-one baseline. ':'')+(state.scale==='density'?'Rank spacing spreads crowded values; distances are not equal numerical changes. ':state.scale!=='linear'?'The axis compresses large values; read the tick labels, not just the slope. ':''),
      caution:filterReading()+'Small workloads can produce big-looking changes. Totals also reflect playing time. A missing season is not zero performance. These selected careers do not establish predictive value.',
      terms:m.note+(m.group==='Fielding'?' Fielding totals combine positions; chances and role affect comparisons.':'')+' PA means plate appearances; IP means innings pitched. Year two is the next calendar year after the first 300-PA hitting or 50-IP pitching season, not necessarily the second MLB season.'
    });
    $('summary').innerHTML=`<div><strong>${pairs.length.toLocaleString()}</strong><span>measured year-one / year-two pairs</span></div><div><strong>${pairs.length?num(100*up/pairs.length,1)+'%':'—'}</strong><span>${measure().direction===0?'rose numerically':'improved'} · ${up} players</span></div><div><strong>${down.toLocaleString()}</strong><span>${measure().direction===0?'fell numerically':'declined'} · ${pairs.length-up-down} unchanged · ${list.length-pairs.length} missing pairs</span></div>`;
    $('table').innerHTML=list.map(p=>{const q=pair(p);return `<tr class="${state.ids.includes(p.id)?'bb-selected':''}"><td><button data-toggle="${esc(p.id)}">${esc(p.name)}${p.hof?' ★':''}</button></td><td>${p.first}</td><td>${fmt(q.a)}</td><td>${fmt(q.b)}</td><td>${fmt(q.delta,state.metric,true)}</td><td>${workload(q.two)}${q.two&&!q.two.qualifies?' · small sample':''}</td></tr>`;}).join('');
    $('table').querySelectorAll('button').forEach(e=>e.onclick=()=>toggle(e.dataset.toggle));
  }
  function renderCharts(list){
    const ids=new Set(state.ids),selected=list.filter(p=>ids.has(p.id)),drawn=state.display==='all'?selected:selected.slice(0,Number(state.display));$('charts').replaceChildren();$('charts').classList.toggle('bb-separated',state.layout==='separate'&&state.view!=='span');
    $('selection-count').textContent=`${state.ids.length.toLocaleString()} selected · ${drawn.length.toLocaleString()} shown${state.ids.length>selected.length?' · '+(state.ids.length-selected.length).toLocaleString()+' outside current filters':''}`;
    $('show-all').hidden=drawn.length===selected.length;
    $('legend').innerHTML=drawn.map(p=>`<button data-pin="${esc(p.id)}" aria-pressed="false"><i style="background:${color(p)}"></i>${esc(p.name)}${p.hof?' ★':''}</button>`).join('');
    $('legend').querySelectorAll('button').forEach(e=>e.onclick=()=>pin(byId.get(e.dataset.pin),byId.get(e.dataset.pin).first+1));
    if(!drawn.length){$('charts').textContent='No selected players match these filters. Choose players or open a story.';$('inspect').textContent='';$('graph-note').textContent='';applyFocus();return;}
    if(focus&&!drawn.some(p=>p.id===focus.id))focus=null;
    const maxYear=state.view==='pair'?2:state.window==='all'?Math.max(2,...drawn.map(p=>p.last-p.first+1)):Number(state.window);
    const series=drawn.map(p=>({p,transform:C.series(p,state.metric,state.normalize),rows:p.seasons.filter(s=>s.year-p.first+1<=maxYear)}));
    const numbers=series.flatMap(s=>s.rows.map(s.transform.value)).filter(finite),axis=C.axis(numbers,{scale:state.scale});
    let note=selected.length>drawn.length?`Showing the first ${drawn.length} of ${selected.length} selected matches in the current sort order. Choose “All selected players” to show the rest. `:'';
    note+=state.view==='span'?'Orange marker = year two; endpoint = last recorded season, not necessarily retirement.':state.normalize==='delta'?'Y-axis: change from each player’s year-one value.':state.normalize==='zscore'?'Y-axis: deviations from each player’s own observed-career mean.':'Y-axis: actual '+measure().name+'.';
    if(state.view!=='span'&&axis.scale==='density')note+=' Rank spacing: distances are NOT equal numerical differences.';
    if(state.view!=='span')note+=' '+axis.notes.join(' ');
    const small=drawn.filter(p=>pair(p).two&&!pair(p).two.qualifies).length,missing=drawn.filter(p=>!pair(p).two).length;
    if(small)note+=` ${small} selected player(s) have year-two workload below ${state.role==='batting'?'300 PA':'50 IP'}; inspect the sample before interpreting a slump.`;
    if(missing)note+=` ${missing} selected player(s) have no year-two season record.`;
    const omitted=series.filter(s=>s.transform.reason||!s.rows.some(r=>finite(s.transform.value(r))));if(omitted.length&&state.view!=='span')note+=` ${omitted.length} selected player(s) have no plottable values for this setting.`;
    $('graph-note').textContent=note;
    const width=Math.max(260,Math.floor($('charts').getBoundingClientRect().width/(state.layout==='separate'&&innerWidth>1050?2:1))-(state.layout==='separate'&&innerWidth>1050?8:0));
    function panel(items){
      const wrapper=document.createElement('div');wrapper.className='bb-chart-panel';if(state.layout==='separate'&&state.view!=='span'){const title=document.createElement('h3');title.textContent=items[0].p.name;wrapper.append(title);}
      const height=state.view==='span'?Math.max(180,items.length*42+60):320,left=57,right=28,top=24,bottom=46;
      const chart=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${measure().name}: ${items.map(s=>s.p.name).join(', ')}`}),plotW=width-left-right,plotH=height-top-bottom;
      const end=state.view==='span'?Math.max(2,...items.map(s=>s.p.last-s.p.first+1)):maxYear;
      const x=n=>left+(n-1)/(end-1)*plotW,y=v=>top+(1-axis.unit(v))*plotH;
      if(state.view!=='span')axis.ticks.forEach(t=>{const yy=y(t);chart.append(svg('line',{x1:left,x2:width-right,y1:yy,y2:yy,class:'bb-gridline'}),svg('text',{x:left-8,y:yy+4,'text-anchor':'end',class:'bb-graph-axis'},state.normalize==='zscore'?num(t,1):fmt(t)));});
      const ticks=end===2?[1,2]:[1,2,...Array.from({length:Math.floor(end/5)},(_,i)=>(i+1)*5)].filter(v=>v<=end);
      for(const n of ticks){if(n===2&&end>15&&width<500)continue;chart.append(svg('text',{x:x(n),y:height-23,'text-anchor':'middle',class:'bb-graph-axis'},'Y'+n));}
      chart.append(svg('text',{x:left+plotW/2,y:height-5,'text-anchor':'middle',class:'bb-graph-axis'},'Calendar year since first substantial season'));
      items.forEach((item,i)=>{
        const {p,rows,transform}=item,g=svg('g',{'data-series':p.id,class:'bb-series'});
        if(state.view==='span'){
          const yy=top+i*42+12;g.append(svg('line',{x1:x(1),x2:x(p.last-p.first+1),y1:yy,y2:yy,stroke:color(p),'stroke-width':5}),svg('circle',{cx:x(2),cy:yy,r:6,fill:'#ba4e32'}),svg('text',{x:x(1)+4,y:yy-10,class:'bb-graph-axis'},p.name+' · '+(p.last-p.first+1)+' years'+(p.last===config.meta.through?' · through 2025':'')));
          g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',p.name+' career span');g.onclick=e=>{if(!dragged||e.detail===0)pin(p,p.first+1);};g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pin(p,p.first+1);}};
        }else{
          let previous=null;
          rows.forEach(row=>{const value=transform.value(row);if(!finite(value)){previous=null;return;}const xx=x(row.year-p.first+1),yy=y(value);
            if(previous&&row.year===previous.year+1){const d=`M${previous.x},${previous.y}L${xx},${yy}`;g.append(svg('path',{d,stroke:color(p,row),class:'bb-trace'}));const hit=svg('path',{d,class:'bb-line-hit'});hit.onclick=e=>{if(!dragged||e.detail===0)pin(p,row.year);};g.append(hit);}
            const dot=svg('circle',{cx:xx,cy:yy,r:row.year===p.first+1?6:3.7,fill:row.year===p.first+1?color(p,row):'#fffdf6',stroke:color(p,row),class:'bb-dot',tabindex:0,role:'button','aria-label':`${p.name}, year ${row.year-p.first+1}, ${row.year}, ${measure().name} ${fmt(row[state.metric])}`});
            dot.onclick=e=>{if(!dragged||e.detail===0)pin(p,row.year);};dot.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pin(p,row.year);}};dot.onmouseenter=()=>{if(!focus&&matchMedia('(hover: hover)').matches)inspect(p,row.year);};g.append(dot);previous={x:xx,y:yy,year:row.year};});
        }chart.append(g);
      });wrapper.append(chart);$('charts').append(wrapper);
    }
    if(state.layout==='separate'&&state.view!=='span')series.forEach(s=>panel([s]));else panel(series);
    applyFocus();if(focus)inspect(byId.get(focus.id),focus.year);else $('inspect').textContent='Tap a season or a player name above to see year one, year two and the playing time behind both.';
  }
  function outcomeNote(){const d=R.definitions[state.outcome];let note=d.name+'. Everyone needs '+d.horizon+' completed '+(d.horizon===1?'season':'years')+' after year two. ';
    if(state.outcome==='future')note+='Unweighted mean of this statistic across recorded years 3–7, requiring three measured seasons. This excludes early exits and describes survivors; totals and rates both use annual means.';
    if(['job','durable'].includes(state.outcome))note+='Substantial means '+(state.role==='batting'?'300 PA':'50 IP')+'. No season record counts as no qualifying season, not zero performance.';
    if(state.outcome==='stars')note+='Distinct AL/NL All-Star selection seasons, including selected players who did not appear. The model tests any selection.';
    if(state.outcome==='awards')note+='Any MVP or Cy Young award in the follow-up window. Earlier awards do not count.';
    if(state.outcome==='hof')note+='HOF status is frozen at the 2025 release. Later-entry players are excluded equally, even if already inducted.';return note;}
  function renderResearch(list){
    study=R.cohort(list,state,config.meta);const {rows,excluded,def}=study,c=R.correlation(rows,state.x);
    $('outcome-note').textContent=outcomeNote();
    $('research-summary').innerHTML=`<div><strong>${rows.length.toLocaleString()}</strong><span>eligible ${state.role==='batting'?'hitters':'pitchers'}</span></div><div><strong>${num(c.spearman)}</strong><span>rank correlation (ρ)</span></div><div><strong>${state.outcome==='future'?fmt(S.mean(rows.map(r=>r.y))):rows.filter(r=>r.event===1).length.toLocaleString()}</strong><span>${state.outcome==='future'?'mean later-season value':'players with the later outcome'}</span></div>`;
    const sign=c.spearman>0?'Higher':'Lower',strength=Math.abs(c.spearman);
    const predictor=(state.x==='a'?'year-one values':state.x==='b'?'year-two values':'year-one-to-two changes')+' in '+measure().name;
    YearTwoView.explain('yt-bb-research',{
      title:'A relationship is a clue—not a forecast.',
      takeaway:YearTwoView.relationship(c.spearman,predictor,def.name.toLowerCase()),
      reading:`Each dot is a player. Left to right: ${predictor}. Bottom to top: the later outcome. All ${rows.length.toLocaleString()} eligible ${state.role==='batting'?'hitters':'pitchers'} in the filtered group count, not just selected chart lines.`,
      caution:filterReading()+`${study.candidates-rows.length} players lack the measurements or follow-up required. `+'This is a pattern, not a cause or a player forecast. Injuries, era, opportunity and chance can affect it.',
      terms:'Correlation describes whether players with higher values of one number also tend to have higher (positive correlation) or lower (negative correlation) values of another. Near zero means little of this kind of relationship, not no possible relationship. The prediction test learns from earlier careers, then checks later players. Lower Brier error or squared error means fewer errors in that test; it is not a guarantee.'
    });
    $('verdict').textContent=!finite(c.spearman)?'This cohort has too few observations or too little variation to estimate a relationship.':strength<.1?'There is little rank relationship in this cohort. The prediction test below checks whether year two adds anything beyond year one.':`${sign} ${state.x==='delta'?'year-one-to-two changes':state.x==='a'?'year-one values':'year-two values'} tended to accompany higher later outcomes (ρ = ${num(c.spearman)}). That relationship alone does not show that year two adds predictive value.`;
    $('exclusions').textContent=`${study.candidates} filtered candidates: ${excluded.pair} lack a measured Y1/Y2 pair; ${excluded.followup} lack a complete follow-up window; ${excluded.outcome} lack enough later performance measurements. ${rows.length} remain. The snapshot ends in ${study.cut}.`;
    $('uncertainty').textContent=`Pearson r = ${num(c.pearson)}; Spearman ρ = ${num(c.spearman)}. Calculate a deterministic 400-resample 95% bootstrap interval for Pearson r if you want a closer look.`;
    $('model-result').replaceChildren();$('bootstrap').disabled=rows.length<8;$('model').disabled=rows.length<1;
    renderScatter(rows);
    const patterns=S.patterns(rows,measure().direction||1);$('patterns').innerHTML=patterns.groups.map(g=>{
      const title=measure().direction===0?g.name.replaceAll('Strong','High').replaceAll('strong','high').replaceAll('Weak','Low').replaceAll('weak','low'):g.name;
      const events=g.rows.filter(r=>r.event===1).length,val=state.outcome==='future'?fmt(S.mean(g.rows.map(r=>r.y))):g.rows.length?num(100*events/g.rows.length,1)+'%':'—';
      return `<div><b>${esc(title)}</b><strong>${val}</strong><small>${g.rows.length} players · ${state.outcome==='future'?'mean later statistic':events+' with the outcome'}</small></div>`;
    }).join('')+`<p class="bb-small">${patterns.mixed} middle / mixed cases remain in the full analysis.</p>`;
    $('research-table').innerHTML=rows.map(r=>`<tr><td><button data-research-player="${esc(r.id)}">${esc(r.name)}</button></td><td>${fmt(r.a)}</td><td>${fmt(r.b)}</td><td>${fmt(r.delta,state.metric,true)}</td><td>${state.outcome==='future'?fmt(r.y):r.y}</td><td>${r.year2+1}–${r.end}</td></tr>`).join('');
    $('research-table').querySelectorAll('button').forEach(e=>e.onclick=()=>describePoint(rows.find(r=>r.id===e.dataset.researchPlayer)));
  }
  function describePoint(r){if(!r)return;$('scatter-detail').textContent=`${r.name}: Year 1 (${r.first}) ${fmt(r.a)} → Year 2 (${r.year2}) ${fmt(r.b)} · ${workload(r.two)}. Later outcome: ${state.outcome==='future'?fmt(r.y):r.y} in ${r.year2+1}–${r.end}.`;}
  function renderScatter(rows){
    $('scatter').replaceChildren();$('scatter-detail').textContent='Tap a point to identify a player. Use the cohort table below for keyboard access to every player.';
    if(!rows.length){$('scatter').textContent='No eligible player pairs for this question. Try broader filters or a shorter future window.';return;}
    const width=Math.max(270,Math.floor($('scatter').getBoundingClientRect().width)),height=350,left=50,top=22,right=25,bottom=55;
    const ax=C.axis(rows.map(r=>r[state.x])),ay=C.axis(rows.map(r=>r.y)),x=v=>left+ax.unit(v)*(width-left-right),y=v=>top+(1-ay.unit(v))*(height-top-bottom);
    const chart=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${rows.length} players: ${measure().name} versus ${R.definitions[state.outcome].name}`});
    ay.ticks.forEach(t=>{chart.append(svg('line',{x1:left,x2:width-right,y1:y(t),y2:y(t),class:'bb-gridline'}),svg('text',{x:left-7,y:y(t)+4,'text-anchor':'end',class:'bb-graph-axis'},num(t,state.outcome==='future'?measure().digits:1)));});
    ax.ticks.filter((t,i)=>width>500||i%2===0).forEach(t=>chart.append(svg('text',{x:x(t),y:height-33,'text-anchor':'middle',class:'bb-graph-axis'},fmt(t))));
    rows.forEach(r=>{const circle=svg('circle',{cx:x(r[state.x]),cy:y(r.y),r:3.6,fill:r.hof?'#a67418':'#246b62','fill-opacity':.46,'data-player':r.id});circle.append(svg('title',{},r.name));circle.onclick=()=>describePoint(r);chart.append(circle);});
    chart.append(svg('text',{x:left+(width-left-right)/2,y:height-10,'text-anchor':'middle',class:'bb-graph-axis'},(state.x==='a'?'Year one':state.x==='b'?'Year two':'Y2 − Y1')+' · '+measure().name));$('scatter').append(chart);
  }
  function renderScan(list){
    $('scan-outcome').textContent=R.definitions[state.outcome].name;$('scan-target').value=state.outcome;
    const results=Object.entries(config.metrics[state.role]).map(([key,m])=>{const {rows}=R.cohort(list,{...state,metric:key},config.meta);return {key,m,n:rows.length,a:R.correlation(rows,'a').spearman,b:R.correlation(rows,'b').spearman,d:R.correlation(rows,'delta').spearman};}).sort((a,b)=>(Math.abs(b.b??-0)-Math.abs(a.b??-0))||b.n-a.n);
    YearTwoView.explain('yt-bb-scan',{
      title:'Three questions to explore next',
      takeaway:'These measures have the largest observed year-two rank relationships in the current scan. That makes them leads to investigate, not proven predictors.',
      reading:'Open a question below to see the players behind it. Compare year one with year two, then run the prediction test. Full detail keeps the complete side-by-side table.',
      caution:filterReading()+'Each statistic may have a different sample. '+(state.outcome==='future'?'“Same statistic” also changes the later outcome for every row, so the rows are not testing one shared target. ':'')+'Scanning many measures increases the risk of chance findings.',
      terms:'A correlation near +1 means players tend to keep the same numerical order; near −1 means the order tends to reverse. Near zero means little rank relationship. The sign is not a good / bad grade. A high year-two correlation can simply repeat what year one already tells us.'
    });
    $('scan-picks').innerHTML=results.filter(r=>finite(r.b)).slice(0,3).map(r=>`<article><button data-stat="${r.key}">Explore ${esc(r.m.name)} →</button><p>${esc(YearTwoView.relationship(r.b,'year-two '+r.m.name,R.definitions[state.outcome].name.toLowerCase()))}</p><small>${r.n.toLocaleString()} eligible players · ${Math.abs(r.a)>Math.abs(r.b)?'The year-one relationship is at least as large.':'Check whether year two adds anything beyond year one.'}</small></article>`).join('')||'<p>No measures have enough comparable data for this outcome and these filters.</p>';
    $('scan-table').innerHTML=results.map(r=>`<tr><td><button data-stat="${r.key}">${esc(r.m.name)}</button></td><td>${r.n}</td><td>${num(r.a)}</td><td>${num(r.b)}</td><td>${num(r.d)}</td></tr>`).join('');
    $('scan-table').querySelectorAll('button').forEach(e=>e.onclick=()=>{state.metric=e.dataset.stat;state.mode='research';changed();$('research').scrollIntoView({block:'start'});});
    $('scan-picks').querySelectorAll('button').forEach(e=>e.onclick=()=>{state.metric=e.dataset.stat;state.mode='research';changed();$('research').scrollIntoView({block:'start'});});
  }
  function renderModel(result){
    if(result.error){$('model-result').textContent=result.error;return;}
    const continuous=result.kind==='continuous',base=continuous?result.baseMSE:result.baseScore.brier,full=continuous?result.fullMSE:result.fullScore.brier,better=full<base,score=continuous?'Mean squared error':'Brier score';
    $('model-result').innerHTML=`<h3>${better?'Adding year two improved':'Adding year two did not improve'} this held-out test.</h3><p>${result.train.length} earlier players trained the models. ${result.test.length} players entering in ${result.boundary} or later tested them. Both include entry year; neither uses future achievements as an input.</p><div class="bb-table-wrap"><table><thead><tr><th>Model</th><th>${score} ↓</th>${continuous?'':'<th>AUC ↑</th>'}</tr></thead><tbody><tr><td>Year one + entry year</td><td>${num(base,4)}</td>${continuous?'':`<td>${num(result.baseScore.auc,3)}</td>`}</tr><tr><td>Year one + year two + entry year</td><td>${num(full,4)}</td>${continuous?'':`<td>${num(result.fullScore.auc,3)}</td>`}</tr><tr><td>Training-average baseline</td><td>${num(continuous?result.nullMSE:result.nullBrier,4)}</td>${continuous?'':'<td>—</td>'}</tr></tbody></table></div><p>${continuous?'Squared error is in the square of this statistic’s units.':`Test events: ${result.testEvents} / ${result.test.length}. Brier score measures probability error; lower is better. AUC measures ranking; 0.5 is chance.`} ${!continuous&&(result.testEvents<10||result.test.length-result.testEvents<10)?'<b>Few test events or non-events: this result is especially unstable; AUC is undefined if either class is absent.</b>':''}</p><p class="bb-small">This is one chronological split, not cross-validation. No confidence interval for the score difference is claimed. A small improvement can be unstable. Changing filters or repeatedly scanning metrics can favor chance results; this is exploratory evidence, not a player forecast.</p>`;
  }
  function download(name,rows){const safe=v=>{let value=v==null?'':String(v);if(/^[=+@]/.test(value)||(/^[-]/.test(value)&&!/^-[\d.]+$/.test(value)))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};const csv=rows.map(r=>r.map(safe).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('csv').onclick=()=>download('baseball-year-two-'+state.role+'.csv',[
    ['player_id','name','role','metric','year_one','year_two','year_one_value','year_two_value','change','year_two_workload','year_two_qualifies','source','license'],
    ...visibleRows.map(p=>{const q=pair(p);return [p.id,p.name,state.role,state.metric,p.first,p.first+1,q.a,q.b,q.delta,state.role==='batting'?q.two?.pa:q.two?.ip,q.two?.qualifies??'',config.meta.source,config.meta.license];})]);
  $('research-csv').onclick=()=>download('baseball-research-'+state.role+'.csv',[
    ['player_id','name','metric','outcome','year_one','year_one_value','year_two_value','change','future_outcome','event','followup_start','followup_end','source','license'],
    ...study.rows.map(r=>[r.id,r.name,state.metric,state.outcome,r.first,r.a,r.b,r.delta,r.y,r.event,r.year2+1,r.end,config.meta.source,config.meta.license])]);
  $('bootstrap').onclick=async()=>{const button=$('bootstrap'),signature=JSON.stringify(state),rows=study.rows,x=state.x;button.disabled=true;$('uncertainty').textContent='Calculating 400 resamples…';await new Promise(requestAnimationFrame);await new Promise(resolve=>setTimeout(resolve,0));const ci=R.correlation(rows,x,true).interval;if(signature===JSON.stringify(state))$('uncertainty').textContent=ci?`95% percentile bootstrap interval for Pearson r: ${num(ci[0])} to ${num(ci[1])}. ${ci[0]<=0&&ci[1]>=0?'It includes zero.':'It excludes zero in this resampling procedure.'} This does not account for multiple testing, era clustering or omitted factors.`:'Not enough varying observations to estimate a reliable bootstrap interval.';button.disabled=false;};
  $('model').onclick=async()=>{const button=$('model'),signature=JSON.stringify(state),rows=study.rows,continuous=state.outcome==='future';button.disabled=true;$('model-result').textContent='Training on earlier players and testing on later players…';await new Promise(resolve=>setTimeout(resolve,30));const result=R.validate(rows,continuous);if(signature===JSON.stringify(state))renderModel(result);button.disabled=false;};
  async function applyPreset(p,preview=false){
    const intent=++presetIntent;
    if(!undo)undo={state:clone(state),focus:clone(focus)};
    const next=clean(p.settings),list=await loadRole(next.role);if(intent!==presetIntent)return;
    if(next.selection==='all')next.ids=R.filtered(list,next,config.teams).map(p=>p.id);
    else if(next.selection!=='fixed'){
      const direction=config.metrics[next.role][next.metric].direction||1;
      next.ids=R.filtered(list,next,config.teams).filter(q=>finite(R.pair(q,next.metric).delta)).sort((a,b)=>{const delta=(R.pair(b,next.metric).delta-R.pair(a,next.metric).delta)*direction;return (next.selection==='declined'?-delta:delta)||a.id.localeCompare(b.id);}).slice(0,next.count).map(p=>p.id);
    }
    const activated=await activate(next);if(!activated||intent!==presetIntent)return;activePreset=p.id;$('undo').hidden=false;
    $('story').hidden=false;let takeaway='';
    if(state.mode==='compare'){
      const chosen=filtered().filter(p=>state.ids.includes(p.id)),p0=chosen[0],q=p0?pair(p0):null;
      takeaway=p0?`${chosen.length} selected players. ${p0.name}: ${fmt(q.a)} in ${p0.first} → ${fmt(q.b)} in ${p0.first+1} (${workload(q.two)}). ${q.two&&!q.two.qualifies?'That second season is below the workload threshold. ':''}Inspect a season to read the change, then follow the career or test the larger cohort.`:'No players match this preset. Widen its filters or choose a different statistic.';
    }else if(state.mode==='research')takeaway=$('verdict').textContent+' '+study.rows.length+' players have the required measured pair and completed future window.';
    else takeaway='Every metric is checked against this outcome. Open a row to examine its sample and test what year two adds.';
    $('story').innerHTML=`<div class="bb-kicker">${preview?'DRAFT PREVIEW':'READY-MADE VIEW'}</div><h2>${esc(p.title)}</h2><p>${esc(takeaway)}</p>${p.note?'<p>'+esc(p.note)+'</p>':''}${preview?'<button id="bb-back-editor">Back to preset editor</button>':''}`;
    if(preview)$('back-editor').onclick=()=>$('admin').scrollIntoView({block:'start'});
    document.querySelectorAll('[data-story]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.story===p.id)));$('story').focus({preventScroll:true});$('story').scrollIntoView({block:'start'});
  }
  function storyButtons(){ $('stories').innerHTML=presets.map((p,i)=>`<button data-story="${p.id}" aria-pressed="false" aria-keyshortcuts="Alt+Shift+${i+1}"><small>0${i+1} / OPEN STORY</small>${esc(p.label)}</button>`).join('');$('stories').querySelectorAll('button').forEach(e=>e.onclick=()=>applyPreset(presets.find(p=>p.id===e.dataset.story)).catch(()=>{$('load').textContent='Could not open this story. Please retry.';})); }
  $('undo').onclick=async()=>{if(!undo)return;const previous=undo;undo=null;clearStory();focus=previous.focus;await activate(previous.state,true);$('undo').hidden=true;};
  for(const key of formKeys)$(key).addEventListener(key==='search'?'input':'change',()=>{state[key]=['qual2','skip2020'].includes(key)?$(key).checked:$(key).value;changed();});
  document.querySelectorAll('[data-role]').forEach(e=>e.onclick=async()=>{if(e.dataset.role===state.role||busy)return;save();clearStory();await activate(views[e.dataset.role]||roleDefaults(e.dataset.role));});
  document.querySelectorAll('[data-mode]').forEach(e=>e.onclick=()=>{if(busy)return;state.mode=e.dataset.mode;changed();});
  document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>{state.view=e.dataset.view;changed();});
  $('study').onclick=()=>{state.mode='research';changed();$('research').scrollIntoView({block:'start'});};
  $('scan-target').onchange=()=>{state.outcome=$('scan-target').value;changed();};
  $('select').onclick=()=>{state.ids=visibleRows.map(p=>p.id);changed();};$('clear').onclick=()=>{state.ids=[];focus=null;changed();};
  $('show-all').onclick=()=>{state.display='all';changed();};
  $('unpin').onclick=()=>{focus=null;applyFocus();$('inspect').textContent='Tap a season to inspect its numbers.';save();};
  document.addEventListener('keydown',e=>{if(e.repeat||e.isComposing||e.target.closest('input,select,textarea,[contenteditable=true]'))return;if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey){const n=Number(e.code.replace('Digit',''))-1;if(n>=0&&n<5){e.preventDefault();applyPreset(presets[n]).catch(()=>{$('load').textContent='Could not open this story. Please retry.';});}}});
  let resizeTimer;window.addEventListener('resize',()=>{const width=Math.round($('workspace').getBoundingClientRect().width);if(width===lastWidth)return;lastWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(busy)return;if(state.mode==='compare')renderCharts(visibleRows);if(state.mode==='research'&&study)renderScatter(study.rows);},150);});
  document.addEventListener('yt:layout',()=>{if(busy)return;if(state.mode==='compare')renderCharts(visibleRows);if(state.mode==='research'&&study)renderScatter(study.rows);});
  $('team').innerHTML='<option value="all">All teams</option>'+Object.entries(config.teams).sort((a,b)=>a[1].localeCompare(b[1])).map(([code,name])=>`<option value="${esc(code)}">${esc(name)} (${esc(code)})</option>`).join('');
  $('scan-target').innerHTML=$('outcome').innerHTML;$('selection').open=innerWidth>760;$('version').textContent='v'+config.build.version;$('total').textContent=(config.meta.counts.batting.players+config.meta.counts.pitching.players).toLocaleString();
  window.BaseballApp={config,clone,esc,loadRole,metricOptions,getState:()=>clone(state),applyPreset,updatePresets:next=>{presets=clone(next);clearStory();storyButtons();},getPlayers:()=>players,defaults:roleDefaults};
  storyButtons();activate(state,true);
})();
