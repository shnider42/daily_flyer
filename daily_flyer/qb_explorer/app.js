(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('qb-data').textContent);
  const $ = id => document.getElementById('qb-' + id);
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const metrics = {
    relative_anya: ['Passing efficiency vs. league', 2, 1, 'Quarterback ANY/A minus the same-season league ANY/A calculated from these source rows. Zero = league baseline. Higher is better. This is not PFR ANY/A+.'],
    anya: ['Adjusted net yards / attempt', 2, 1, '(Passing yards + 20 × touchdowns − 45 × interceptions − sack yards) ÷ (attempts + sacks). Higher is better; rushing is excluded.'],
    rating: ['Passer rating', 1, 1, 'NFL passer rating, calculated from completions, attempts, yards, touchdowns and interceptions. Higher is better. Not adjusted for era.'],
    cmp_pct: ['Completion percentage', 1, 1, 'Completed passes ÷ attempts × 100. Changes are percentage points.'],
    ypg: ['Passing yards / game', 1, 1, 'Passing yards divided by games played, including appearances as a backup.'],
    td_pct: ['Touchdown percentage', 1, 1, 'Passing touchdowns ÷ attempts × 100. Changes are percentage points.'],
    int_pct: ['Interception percentage', 1, -1, 'Interceptions ÷ attempts × 100. Lower is better. Changes are percentage points.'],
    yards: ['Passing yards', 0, 1, 'Season total. Schedule length and games played affect this measure.'],
    td: ['Passing touchdowns', 0, 1, 'Season total. Schedule length and games played affect this measure.'],
    int: ['Interceptions', 0, -1, 'Season total. Fewer is better for this comparison, but fewer passing opportunities also reduce this total.'],
    gs: ['Games started', 0, 1, 'Regular-season starts across all teams that year. The qualification rule requires 12 starts for one team.']
  };
  const palette = ['#176651','#AC452D','#305CAB','#85652C','#773B85','#087E8B','#77602B','#B33168'];
  const defaults = {search:'', era:'all', hof:'all', team:'all', sort:'name', y2qual:false,
    metric:'relative_anya', colors:'team', window:'5', view:'performance', ids:['BradTo00','MannPe00','YounSt00','FitzRy00']};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('qb-year-two-v1') || '{}'); } catch (_) {}
  const state = {...defaults, ...saved};
  $('selection').open = window.innerWidth > 760;
  if (!Array.isArray(state.ids)) state.ids = defaults.ids;
  state.ids = new Set(state.ids.filter(id => data.players.some(p => p.id === id)));
  if (!metrics[state.metric]) state.metric = defaults.metric;
  if (!['performance','year2','career'].includes(state.view)) state.view = defaults.view;
  const exists = v => typeof v === 'number' && Number.isFinite(v);
  const value = row => row && exists(row[state.metric]) ? row[state.metric] : null;
  const fmt = (v, signed=false) => {
    if(!exists(v)) return '—';
    const digits=metrics[state.metric][1];
    if(signed && v!==0 && Math.abs(v)<10**-digits) return (v>0?'+':'−')+'<'+(10**-digits).toFixed(digits);
    return (signed && v>0?'+':'')+v.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  };
  const teamName = code => data.teams[code]?.[0] || code;
  const teamColor = code => data.teams[code]?.[1] || '#747A7A';
  const pair = p => {
    const one = p.seasons.find(s => s.year === p.first), two = p.seasons.find(s => s.year === p.first + 1);
    const a = value(one), b = value(two);
    return {one, two, a, b, delta: p.anchor_uncertain || !exists(a) || !exists(b) ? null : b - a};
  };
  function color(p, row) {
    if (state.colors === 'hof') return p.hof ? '#A37818' : '#357B83';
    if (state.colors === 'player') return palette[data.players.indexOf(p) % palette.length];
    return teamColor(row.team);
  }
  function filtered() {
    const query = String(state.search).trim().toLowerCase();
    const list = data.players.filter(p => {
      const codes = new Set(p.seasons.flatMap(s => [s.team, ...s.teams.map(t => t.team)]));
      const searchable = p.name + ' ' + Array.from(codes).map(c => c+' '+teamName(c)).join(' ');
      return (!query || searchable.toLowerCase().includes(query)) &&
        (state.hof === 'all' || (state.hof === 'yes' ? !!p.hof : !p.hof)) &&
        (state.era === 'all' || (state.era === 'pre1970' ? p.first < 1970 : Math.floor(p.first / 10) * 10 === Number(state.era))) &&
        (state.team === 'all' || codes.has(state.team)) &&
        (!state.y2qual || !!pair(p).two?.qualifies);
    });
    list.sort((a,b) => {
      if (state.sort === 'span') return b.span-a.span || a.name.localeCompare(b.name);
      if (state.sort === 'newest') return b.first-a.first || a.name.localeCompare(b.name);
      if (state.sort === 'oldest') return a.first-b.first || a.name.localeCompare(b.name);
      if (['improved','declined'].includes(state.sort)) {
        const x = pair(a).delta, y = pair(b).delta;
        if (!exists(x) || !exists(y)) return exists(x) ? -1 : exists(y) ? 1 : a.name.localeCompare(b.name);
        return (y-x) * metrics[state.metric][2] * (state.sort === 'declined' ? -1 : 1) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }
  function save() { try {localStorage.setItem('qb-year-two-v1', JSON.stringify({...state, ids:[...state.ids]}));} catch (_) {} }
  function toggle(id) { state.ids.has(id) ? state.ids.delete(id) : state.ids.add(id); render(); }
  function renderPlayers(list) {
    $('found').textContent = `${list.length} results`;
    $('players').innerHTML = list.map(p => `<label class="qb-player"><input type="checkbox" data-player="${escape(p.id)}" ${state.ids.has(p.id)?'checked':''}><span><strong>${escape(p.name)}${p.hof?'<span class="qb-hof-star" title="Hall of Fame"> ★</span>':''}</strong><small>First full season ${p.first}${p.anchor_uncertain?' · anchor uncertain':''}</small></span></label>`).join('') || '<p class="qb-small">No quarterbacks match these filters.</p>';
    $('players').querySelectorAll('input').forEach(input => input.addEventListener('change', () => toggle(input.dataset.player)));
  }
  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs={}, text='') {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
    if (text) el.textContent = text;
    return el;
  }
  function renderChart(players) {
    const chart = $('chart'); chart.replaceChildren();
    const career = state.view === 'career';
    $('window-label').hidden = state.view !== 'performance';
    $('selected-count').textContent = `${players.length} ${players.length===1?'line':'lines'} shown`;
    $('chart-title').textContent = career ? 'Years since the first full season' : metrics[state.metric][0];
    $('chart-kicker').textContent = career ? 'THE CAREER TIMELINE' : state.view === 'year2' ? 'THE NEXT SEASON' : 'THE DEVELOPMENT CURVE';
    $('chart-help').textContent = career ? 'X: quarterback · Y: starter year. Year 1 is the first 12-start season. Scroll sideways for more names. Career gaps remain gaps.' :
      'X: years since the first 12-start season · Y: selected measure. Hollow points: fewer than 12 starts. Diamonds: multi-team season totals. Scroll sideways on small screens.';
    $('metric-help').textContent = metrics[state.metric][3] + (state.metric==='relative_anya' && data.meta.missing_baseline_years.length ? ` League baseline unavailable for ${data.meta.missing_baseline_years.join(', ')} because source sack fields are incomplete; use raw ANY/A or passer rating to inspect those seasons.` : '');
    $('empty').hidden = players.length > 0;
    $('selected').innerHTML = players.map(p=>`<button class="qb-chip" data-remove="${escape(p.id)}" aria-label="Remove ${escape(p.name)}"><i style="background:${color(p,p.seasons[0])}"></i>${escape(p.name)}${p.hof?' ★':''} ×</button>`).join('');
    $('selected').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>toggle(b.dataset.remove)));
    const maxWindow = state.view === 'year2' ? 2 : (state.window === 'all' || career) ? Infinity : Number(state.window);
    const shown = players.map(p=>({p, rows:p.seasons.filter(r=>r.starter_year <= maxWindow)}));
    const points = shown.flatMap(s=>s.rows);
    const outerWidth = chart.parentElement.clientWidth || 850;
    const width = Math.max(650, outerWidth, career ? players.length * 100 + 120 : 0);
    const height = career ? 480 : 370;
    const left=62, right=25, top=35, bottom=career?120:50;
    chart.setAttribute('width', width); chart.setAttribute('height',height); chart.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const maxYear = Math.max(2, ...points.map(r=>r.starter_year));
    const xMax = career ? Math.max(1,players.length-1) : Math.min(maxYear, Number.isFinite(maxWindow)?maxWindow:maxYear);
    const values = points.map(r=>career?r.starter_year:value(r)).filter(exists);
    let low = career ? 0 : Math.min(0,...values), high = Math.max(career?maxYear:1,...values);
    if (!career) { const pad = Math.max((high-low)*.1, .5); low -= low<0?pad:0; high += pad; }
    const x = n => left+(n-(career?0:1))/Math.max(1, xMax-(career?0:1))*(width-left-right);
    const y = n => top+(high-n)/(high-low)*(height-top-bottom);
    if (!career) {
      chart.append(svg('rect',{x:x(2)-14,y:top,width:28,height:height-top-bottom,fill:'#e6eadb'}));
      chart.append(svg('text',{x:x(2),y:20,'text-anchor':'middle',class:'qb-axis'},'YEAR 2'));
    }
    const steps=5;
    for (let i=0;i<=steps;i++) {
      const n=low+(high-low)*i/steps, yy=y(n);
      chart.append(svg('line',{x1:left,y1:yy,x2:width-right,y2:yy,class:'qb-grid'}));
      chart.append(svg('text',{x:left-10,y:yy+4,'text-anchor':'end',class:'qb-axis'},career?n.toFixed(0):n.toLocaleString('en-US',{maximumFractionDigits:Math.abs(high-low)>20?0:1})));
    }
    if (low<0 && high>0) chart.append(svg('line',{x1:left,y1:y(0),x2:width-right,y2:y(0),class:'qb-zero'}));
    if (career) {
      players.forEach((p,i)=>chart.append(svg('text',{x:x(i),y:height-bottom+22,transform:`rotate(-42 ${x(i)} ${height-bottom+22})`,'text-anchor':'end',class:'qb-axis'},p.name)));
    } else {
      for(let n=1;n<=xMax;n++) if(n===1||n===2||n===xMax||xMax<=12||n%2===0) chart.append(svg('text',{x:x(n),y:height-bottom+22,'text-anchor':'middle',class:'qb-axis'},String(n)));
      chart.append(svg('text',{x:width/2,y:height-8,'text-anchor':'middle',class:'qb-axis'},'Starter year (calendar seasons; year 1 = first 12 starts for one team)'));
    }
    shown.forEach(({p,rows}, index)=> {
      let previous=null;
      rows.forEach(row=>{
        const v = career?row.starter_year:value(row);
        if (!exists(v)) {previous=null;return;}
        const px=x(career?index:row.starter_year), py=y(v), c=color(p,row);
        const lineAttrs = {class:'qb-trace','stroke-opacity':players.length>20?.32:.85};
        if(state.colors==='hof'&&!p.hof) lineAttrs['stroke-dasharray']='5 3';
        if(previous && row.year===previous.row.year+1) {
          const mx=(previous.x+px)/2, my=(previous.y+py)/2;
          chart.append(svg('path',{...lineAttrs,d:`M ${previous.x} ${previous.y} L ${mx} ${my}`,stroke:previous.c}));
          chart.append(svg('path',{...lineAttrs,d:`M ${mx} ${my} L ${px} ${py}`,stroke:c}));
        }
        const multiple=/^\dTM$|^TOT$/.test(row.team), radius=row.starter_year===2?5:3.5;
        const dot=multiple?svg('path',{d:`M ${px} ${py-radius-1} l ${radius+1} ${radius+1} l ${-radius-1} ${radius+1} l ${-radius-1} ${-radius-1} Z`}):svg('circle',{cx:px,cy:py,r:radius});
        const starts=row.gs===null?'unknown':row.gs;
        const aria=`${p.name}, ${row.year}, starter year ${row.starter_year}, ${teamName(row.team)}, ${starts} starts, ${metrics[state.metric][0]} ${fmt(value(row))}`;
        Object.entries({class:'qb-dot',fill:(row.gs||0)>=12?c:'#f6f4ec',stroke:c,tabindex:0,'aria-label':aria}).forEach(([k,v])=>dot.setAttribute(k,v));
        dot.append(svg('title',{},aria));
        const inspect=()=>{
          $('tooltip').innerHTML=`<b>${escape(p.name)}</b> · ${row.year} · Starter year ${row.starter_year} · ${escape(teamName(row.team))}<br><b>${fmt(value(row))}</b> ${escape(metrics[state.metric][0])} · ${starts} starts / ${row.g??'unknown'} games${multiple?' · Season total; individual team values are not plotted':''} · ${p.hof?'Hall of Fame '+p.hof:'Not inducted'} · <a href="https://www.pro-football-reference.com/players/${escape(p.id[0])}/${escape(p.id)}.htm" target="_blank" rel="noopener noreferrer">PFR player record ↗</a>`;
        };
        dot.addEventListener('mouseenter',inspect); dot.addEventListener('focus',inspect); dot.addEventListener('click',inspect);
        chart.append(dot); previous={x:px,y:py,c,row};
      });
    });
    if(players.length && !values.length) {
      $('empty').hidden=false;
      $('empty').textContent='No observations for these players in this view. Try the full observed career or another metric.';
    } else $('empty').textContent='Select a quarterback on the left to draw a line.';
    let legend;
    if(state.colors==='hof') legend=[['Hall of Fame (solid)','#A37818'],['Not inducted (dashed)','#357B83']];
    else if(state.colors==='team') legend=[...new Set(points.map(r=>r.team))].sort().map(t=>[teamName(t),teamColor(t)]);
    else legend=players.map(p=>[p.name,color(p,p.seasons[0])]);
    $('legend').innerHTML=legend.map(([name,c])=>`<span><i style="background:${c}"></i>${escape(name)}</span>`).join('');
    $('tooltip').textContent='Hover, tap, or focus a season to inspect its numbers. Team colors may repeat across quarterbacks.';
  }
  function unavailable(p,q) {
    if(p.anchor_uncertain) return 'Anchor uncertain';
    if(p.first<1970) return 'Anchor before 1970';
    if(p.first+1>data.meta.through) return 'Next season outside snapshot';
    if(!q.two) return 'No year-two observation';
    return 'Metric unavailable';
  }
  function renderTable(list) {
    const pairs=list.map(p=>({p,...pair(p)}));
    const comparable=pairs.filter(q=>exists(q.delta));
    const changes=comparable.map(q=>q.delta).sort((a,b)=>a-b);
    const mid=Math.floor(changes.length/2), median=changes.length?(changes.length%2?changes[mid]:(changes[mid-1]+changes[mid])/2):null;
    const improved=comparable.filter(q=>q.delta*metrics[state.metric][2]>0).length;
    $('summary').innerHTML=`<div class="qb-stat"><strong>${comparable.length}<small style="font:14px Arial"> / ${list.length}</small></strong><span>with comparable year-one and year-two values</span></div><div class="qb-stat"><strong>${comparable.length?Math.round(100*improved/comparable.length)+'%':'—'}</strong><span>improved on this measure (${improved} quarterbacks)</span></div><div class="qb-stat"><strong>${fmt(median,true)}</strong><span>median year-two change · ${metrics[state.metric][2]>0?'higher':'lower'} is better</span></div>`;
    $('table').innerHTML=pairs.map(q=>{
      const p=q.p, delta=q.delta, quality=exists(delta)?Math.sign(delta)*metrics[state.metric][2]:0;
      const note=exists(delta)?'':unavailable(p,q);
      return `<tr class="${state.ids.has(p.id)?'qb-row-selected':''}"><td><button data-table-player="${escape(p.id)}" aria-pressed="${state.ids.has(p.id)}">${escape(p.name)}${p.hof?' ★':''}</button>${note?'<br><small>'+escape(note)+'</small>':''}</td><td>${p.first}${p.anchor_uncertain?' ?':''}</td><td>${fmt(q.a)}</td><td>${fmt(q.b)}</td><td class="${quality>0?'qb-up':quality<0?'qb-down':''}">${fmt(delta,true)}</td><td>${q.two?.gs??'—'}</td></tr>`;
    }).join('') || '<tr><td colspan="6">No quarterbacks match these filters.</td></tr>';
    $('table').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>toggle(b.dataset.tablePlayer)));
  }
  function render() {
    const focus=document.activeElement, focusPlayer=focus?.dataset.player, focusTable=focus?.dataset.tablePlayer;
    const scroll=$('players').scrollTop;
    const list=filtered(); renderPlayers(list); renderChart(list.filter(p=>state.ids.has(p.id))); renderTable(list);
    $('players').scrollTop=scroll;
    if(focusPlayer) Array.from($('players').querySelectorAll('input')).find(n=>n.dataset.player===focusPlayer)?.focus({preventScroll:true});
    if(focusTable) Array.from($('table').querySelectorAll('button')).find(n=>n.dataset.tablePlayer===focusTable)?.focus({preventScroll:true});
    $('filter-warning').textContent=state.y2qual?'Only year-two 12-start survivors are included. This omits players who lost starts.':'Year two stays in the study even with fewer starts.';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
    save();
  }
  const teamCodes=[...new Set(data.players.flatMap(p=>p.seasons.flatMap(s=>[s.team,...s.teams.map(t=>t.team)])))].filter(t=>!/^\dTM$/.test(t)).sort((a,b)=>teamName(a).localeCompare(teamName(b)));
  $('team').innerHTML += teamCodes.map(t=>`<option value="${escape(t)}">${escape(teamName(t))}</option>`).join('');
  for(const key of ['search','era','hof','team','sort','metric','colors','window']) {
    $(key).value=String(state[key]);
    if($(key).tagName==='SELECT' && !$(key).value) {state[key]=defaults[key];$(key).value=state[key];}
    $(key).addEventListener(key==='search'?'input':'change',()=>{state[key]=$(key).value;render();});
  }
  $('y2qual').checked=!!state.y2qual;
  $('y2qual').addEventListener('change',()=>{state.y2qual=$('y2qual').checked;render();});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;render();}));
  $('select-all').addEventListener('click',()=>{filtered().forEach(p=>state.ids.add(p.id));render();});
  $('clear').addEventListener('click',()=>{state.ids.clear();render();});
  $('export').addEventListener('click',()=>{
    const table=[['quarterback','pfr_id','first_12_start_season','year_2_season','metric','year_1_value','year_2_value','change','year_2_starts','hall_of_fame_induction','status','data_through']];
    filtered().forEach(p=>{const q=pair(p);table.push([p.name,p.id,p.first,p.first+1,state.metric,q.a,q.b,q.delta,q.two?.gs,p.hof,exists(q.delta)?'paired':unavailable(p,q),data.meta.through]);});
    const csv=table.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='quarterback-year-two-'+state.metric+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('total').textContent=data.players.length;
  $('coverage').textContent=`1970—${data.meta.through}`;
  $('notice').textContent=`Historical snapshot through ${data.meta.through} · PFR-derived public archives, not a live PFR feed. Coverage has not been exhaustively reconciled. ${data.meta.through+1} onward is not included.`;
  $('hof-date').textContent=`Hall of Fame status checked through ${data.meta.hof_as_of}. ★ means inducted, not predicted to be inducted.`;
  $('limitations').innerHTML=data.meta.limitations.map(s=>'<li>'+escape(s)+'</li>').join('')+(data.meta.unresolved_players.length?'<li>Unresolved single-team qualification: '+escape(data.meta.unresolved_players.join(', '))+'. These players are not counted in the confirmed cohort.</li>':'');
  $('sources').innerHTML=data.meta.sources.map(s=>`<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)} ↗</a><br>${escape(s.used)}</li>`).join('');
  let resize;
  window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(()=>renderChart(filtered().filter(p=>state.ids.has(p.id))),150);});
  render();
})();
