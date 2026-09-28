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
    metric:'relative_anya', colors:'team', window:'5', view:'performance',
    scale:'linear', normalize:'raw', layout:'overlay', range:'fit', ymin:'', ymax:'', points:'auto', opacity:75, height:'normal', focus:'', ids:['BradTo00','MannPe00','YounSt00','FitzRy00']};
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
  const graphKeys = ['scale','normalize','layout','range','ymin','ymax','points','opacity','height'];
  function syncGraphControls() {
    graphKeys.forEach(k => { $(k).value = String(state[k]); });
    $('opacity-value').textContent = state.opacity+'%';
    $('ymin-label').hidden = $('ymax-label').hidden = state.range !== 'custom';
    const career = state.view === 'career';
    $('normalize').disabled = $('layout').disabled = career;
    $('normalize').title = $('layout').title = career ? 'Available in performance and year-one-to-two views.' : '';
  }
  function applyFocus(transient = '') {
    const id = transient || state.focus;
    $('charts').querySelectorAll('[data-series]').forEach(g => {
      const active = id === g.dataset.series;
      g.style.opacity = id ? active ? '1' : '.13' : String(Number(state.opacity)/100);
      g.classList.toggle('qb-focused', active);
    });
    $('charts').querySelectorAll('[data-end-label]').forEach(t => {
      t.style.opacity = id && id !== t.dataset.endLabel ? '.2' : '1';
    });
    $('selected').querySelectorAll('[data-spotlight]').forEach(b => b.setAttribute('aria-pressed', String(state.focus === b.dataset.spotlight)));
  }
  function setFocus(id) {
    state.focus = id; $('focus').value = id; applyFocus(); save();
  }
  function renderChart(players) {
    syncGraphControls();
    const career = state.view === 'career', separate = !career && state.layout === 'separate';
    const mode = career ? 'raw' : state.normalize;
    const normTitle = mode === 'delta' ? 'Change from year one' : mode === 'zscore' ? 'Relative to own career (standard deviations)' : metrics[state.metric][0];
    $('window-label').hidden = state.view !== 'performance';
    $('selected-count').textContent = `${players.length} quarterbacks · ${separate?'shared axes':'one graph'}`;
    $('chart-title').textContent = career ? 'Years since the first full season' : normTitle;
    $('chart-kicker').textContent = career ? 'THE CAREER TIMELINE' : mode !== 'raw' ? metrics[state.metric][0].toUpperCase() : state.view === 'year2' ? 'THE NEXT SEASON' : 'THE DEVELOPMENT CURVE';
    $('chart-help').textContent = career ? 'X: quarterback · Y: starter year. Year 1 is the first 12-start season. Career gaps remain gaps.' :
      `X: starter year · Y: ${normTitle.toLowerCase()}. ${separate?'Every panel uses the same scales.':'Hover a line or spotlight a name to follow one career.'} Hollow markers: fewer than 12 starts. Diamonds: multi-team totals.`;
    $('metric-help').textContent = metrics[state.metric][3] + (state.metric==='relative_anya' && data.meta.missing_baseline_years.length ? ` League baseline unavailable for ${data.meta.missing_baseline_years.join(', ')} because source sack fields are incomplete; use raw ANY/A or passer rating to inspect those seasons.` : '');
    if (!players.some(p=>p.id===state.focus)) state.focus='';
    $('focus').innerHTML='<option value="">All selected quarterbacks</option>'+players.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
    $('focus').value=state.focus;
    $('selected').innerHTML = players.map(p=>`<span class="qb-chip"><button type="button" data-spotlight="${escape(p.id)}" aria-pressed="${state.focus===p.id}" aria-label="Spotlight ${escape(p.name)}"><i style="background:${color(p,p.seasons[0])}"></i>${escape(p.name)}${p.hof?' ★':''}</button><button type="button" data-remove="${escape(p.id)}" aria-label="Remove ${escape(p.name)}">×</button></span>`).join('');
    $('selected').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>toggle(b.dataset.remove)));
    $('selected').querySelectorAll('[data-spotlight]').forEach(b=>b.addEventListener('click',()=>setFocus(state.focus===b.dataset.spotlight?'':b.dataset.spotlight)));
    const maxWindow = state.view === 'year2' ? 2 : (state.window === 'all' || career) ? Infinity : Number(state.window);
    const shown = players.map(p=>{
      const normalized=QBChartMath.series(p,state.metric,mode);
      return {p, rows:p.seasons.filter(r=>r.starter_year<=maxWindow), reason:normalized.reason,
        value:career?r=>r.starter_year:normalized.value};
    });
    const allRows=shown.flatMap(s=>s.rows), values=shown.flatMap(s=>s.rows.map(s.value)).filter(exists);
    const axis=QBChartMath.axis(values,{scale:state.scale,range:state.range,min:state.ymin,max:state.ymax});
    const scaleName={linear:'Linear',log:'Logarithmic',symlog:'Signed log'}[axis.scale];
    const normNote=mode==='delta'?'Zero = that quarterback’s year-one value; differences keep the original units.' : mode==='zscore'?'Zero = that quarterback’s observed career mean; +1 = one standard deviation above it. Full available careers set the baseline, even in a shorter window.' : 'Actual values; no normalization.';
    const skipped=shown.filter(s=>s.reason).length;
    const messages=[`${scaleName} scale · ${career?'Starter years':normNote}`, ...axis.notes];
    if(skipped) messages.push(`${skipped} ${skipped===1?'quarterback has':'quarterbacks have'} no usable normalization baseline. Their lines are unavailable.`);
    if(axis.clipped) messages.push(`${axis.clipped} observations outside the Y bounds are clipped. Widen the bounds to see them.`);
    if(players.length>12 && !separate) messages.push('Many lines selected. Try Separate quarterbacks or use the spotlight to reduce overlap.');
    if(separate && players.length>8) messages.push('Scroll inside the chart area to browse every selected quarterback; all panels share the same axes.');
    if(!career && state.points==='auto' && players.length>12 && !separate) messages.push('Automatic markers emphasize year two; other seasons appear on hover, focus or spotlight.');
    if(career) messages.push('Normalization and separate panels apply only to performance views.');
    $('display-note').textContent=messages.join(' ');
    $('display-note').classList.toggle('qb-has-warning',axis.notes.length>0||axis.clipped>0);
    $('empty').hidden=values.length>0;
    $('empty').textContent=players.length?'No plottable observations. Try actual values, a different metric, or the full observed career.':'Select a quarterback to draw a line.';
    const charts=$('charts');charts.replaceChildren(); charts.classList.toggle('qb-separated',separate);
    charts.classList.toggle('qb-many-panels',separate && players.length>8);
    charts.hidden = !players.length;
    charts.tabIndex = separate && players.length>8 ? 0 : -1;
    charts.setAttribute('aria-label','Quarterback charts; scroll for additional panels when many are selected');
    const maxYear=Math.max(2,...allRows.map(r=>r.starter_year));
    const xMax=Math.min(maxYear,Number.isFinite(maxWindow)?maxWindow:maxYear);
    const tickLabel=n=>Math.abs(n)>=100000 || (n!==0 && Math.abs(n)<.001) ? n.toExponential(1) : n.toLocaleString('en-US',{maximumFractionDigits:Math.abs(axis.high-axis.low)<1?3:Math.abs(axis.high-axis.low)<20?2:1});
    const plottedFmt=v=>mode==='zscore'?v.toFixed(2)+' SD':fmt(v,mode==='delta');
    function inspect(p,row,v) {
      const starts=row.gs===null?'unknown':row.gs, multiple=/^\dTM$|^TOT$/.test(row.team);
      $('tooltip').innerHTML=`<b>${escape(p.name)}</b> · ${row.year} · Starter year ${row.starter_year} · ${escape(teamName(row.team))}<br><b>${fmt(value(row))}</b> ${escape(metrics[state.metric][0])}${mode!=='raw'?' · Plotted: <b>'+escape(plottedFmt(v))+'</b> '+escape(normTitle):''} · ${starts} starts / ${row.g??'unknown'} games${multiple?' · Season total; individual team values are not plotted':''} · ${p.hof?'Hall of Fame '+p.hof:'Not inducted'} · <a href="https://www.pro-football-reference.com/players/${escape(p.id[0])}/${escape(p.id)}.htm" target="_blank" rel="noopener noreferrer">PFR player record ↗</a>`;
    }
    const panels=separate?shown.map(s=>[s]):[shown];
    // Create every panel before measuring: CSS grid must know the full column count.
    const containers=panels.map((group,i)=>{
      const panel=document.createElement('section');panel.className='qb-chart-panel';
      if(separate){const h=document.createElement('h3');h.id='qb-panel-title-'+i;h.textContent=group[0].p.name+(group[0].p.hof?' ★':'');panel.append(h);}
      const scroll=document.createElement('div');scroll.className='qb-chart-scroll';scroll.tabIndex=0;scroll.setAttribute('aria-label',(separate?group[0].p.name+' — ':'')+'Scrollable interactive graph');
      const chart=svg('svg',{id:i===0?'qb-chart':'qb-chart-'+i,role:'img','aria-labelledby':separate?'qb-panel-title-'+i+' qb-chart-help':'qb-chart-title qb-chart-help'});
      scroll.append(chart);panel.append(scroll);charts.append(panel);return {panel,scroll,chart};
    });
    panels.forEach((group,panelIndex)=>{
      const {scroll,chart}=containers[panelIndex];
      const width=Math.max(separate?290:650,scroll.clientWidth||650,career?players.length*100+140:0);
      const height=separate?{compact:220,normal:285,tall:380}[state.height]:{compact:330,normal:440,tall:600}[state.height];
      const endLabels=!separate&&!career&&players.length>0&&players.length<=8;
      const left=62,right=endLabels?125:22,top=34,bottom=career?115:48;
      chart.setAttribute('width',width);chart.setAttribute('height',height);chart.setAttribute('viewBox',`0 0 ${width} ${height}`);
      chart.dataset.scale=axis.scale;chart.dataset.normalization=mode;chart.dataset.yLow=axis.low;chart.dataset.yHigh=axis.high;
      const x=n=>career?(players.length===1?(width-left-right)/2+left:left+n/Math.max(1,players.length-1)*(width-left-right)):left+(n-1)/Math.max(1,xMax-1)*(width-left-right);
      const y=n=>top+(1-axis.unit(n))*(height-top-bottom);
      const defs=svg('defs'),clip=svg('clipPath',{id:'qb-clip-'+panelIndex});clip.append(svg('rect',{x:left-6,y:top-1,width:width-left-right+12,height:height-top-bottom+2}));defs.append(clip);chart.append(defs);
      if(!career){chart.append(svg('rect',{x:x(2)-10,y:top,width:20,height:height-top-bottom,fill:'#e6eadb'}));chart.append(svg('text',{x:x(2),y:20,'text-anchor':'middle',class:'qb-axis'},'YEAR 2'));}
      axis.ticks.forEach(n=>{
        const yy=y(n);chart.append(svg('line',{x1:left,y1:yy,x2:width-right,y2:yy,class:n===0?'qb-zero':'qb-grid'}));
        chart.append(svg('text',{x:left-9,y:yy+4,'text-anchor':'end',class:'qb-axis'},tickLabel(n)));
      });
      if(career) players.forEach((p,i)=>chart.append(svg('text',{x:x(i),y:height-bottom+20,transform:`rotate(-42 ${x(i)} ${height-bottom+20})`,'text-anchor':'end',class:'qb-axis'},p.name)));
      else {
        for(let n=1;n<=xMax;n++)if(n===1||n===2||n===xMax||xMax<=8||n%(separate?5:2)===0)chart.append(svg('text',{x:x(n),y:height-bottom+20,'text-anchor':'middle',class:'qb-axis'},String(n)));
        chart.append(svg('text',{x:(width+left-right)/2,y:height-6,'text-anchor':'middle',class:'qb-axis'},'Starter year · year 1 = first 12-start season'));
      }
      const labels=[];
      group.forEach((entry,index)=>{
        const {p,rows}=entry;
        const g=svg('g',{'data-series':p.id,'clip-path':`url(#qb-clip-${panelIndex})`,class:'qb-series'});
        const hideMarkers=state.points==='year2'||(state.points==='auto'&&players.length>12&&!separate);
        g.classList.toggle('qb-reduce-markers',hideMarkers);
        g.addEventListener('mouseenter',()=>applyFocus(p.id));g.addEventListener('mouseleave',()=>applyFocus());
        g.addEventListener('focusin',()=>applyFocus(p.id));g.addEventListener('focusout',()=>applyFocus());
        chart.append(g);
        let previous=null,last=null;
        rows.forEach(row=>{
          const v=entry.value(row);if(!exists(v)){previous=null;return;}
          const px=x(career?index:row.starter_year),py=y(v),c=color(p,row);
          if(!Number.isFinite(py)){previous=null;return;}
          const attrs={class:'qb-trace',stroke:c};if(state.colors==='hof'&&!p.hof)attrs['stroke-dasharray']='5 3';
          if(previous&&row.year===previous.row.year+1){
            const mx=(previous.x+px)/2,my=(previous.y+py)/2;
            g.append(svg('path',{...attrs,d:`M ${previous.x} ${previous.y} L ${mx} ${my}`,stroke:previous.c}),svg('path',{...attrs,d:`M ${mx} ${my} L ${px} ${py}`}));
            const hit=svg('path',{d:`M ${previous.x} ${previous.y} L ${px} ${py}`,class:'qb-line-hit'});
            hit.addEventListener('mouseenter',()=>{$('tooltip').textContent=p.name+' · Choose a season marker for exact values, or spotlight this name above.';});g.prepend(hit);
          }
          if(v>=axis.low-1e-9&&v<=axis.high+1e-9){
            const multiple=/^\dTM$|^TOT$/.test(row.team),radius=row.starter_year===2?4.8:3.3;
            const dot=multiple?svg('path',{d:`M ${px} ${py-radius-1} l ${radius+1} ${radius+1} l ${-radius-1} ${radius+1} l ${-radius-1} ${-radius-1} Z`}):svg('circle',{cx:px,cy:py,r:radius});
            const aria=`${p.name}, ${row.year}, starter year ${row.starter_year}, ${teamName(row.team)}, ${row.gs??'unknown'} starts, ${metrics[state.metric][0]} ${fmt(value(row))}${mode!=='raw'?', '+normTitle+' '+plottedFmt(v):''}`;
            Object.entries({class:'qb-dot'+(row.starter_year===2?' qb-year-two-dot':''),fill:(row.gs||0)>=12?c:'#f6f4ec',stroke:c,tabindex:0,'aria-label':aria,'data-value':v,'data-year':row.year}).forEach(([k,v])=>dot.setAttribute(k,v));dot.append(svg('title',{},aria));
            for(const event of ['mouseenter','focus','click'])dot.addEventListener(event,()=>{applyFocus(p.id);inspect(p,row,v);});
            g.append(dot);last={x:px,y:py,c,p};
          }
          previous={x:px,y:py,c,row};
        });
        if(endLabels&&last)labels.push(last);
        if(separate&&!rows.some(r=>exists(entry.value(r))))chart.append(svg('text',{x:width/2,y:height/2,'text-anchor':'middle',class:'qb-axis'},entry.reason?'Normalization unavailable':'No values in this window'));
      });
      labels.sort((a,b)=>a.y-b.y);
      labels.forEach((l,i)=>{l.ly=Math.max(l.y,i?labels[i-1].ly+17:top+4);});
      for(let i=labels.length-1;i>=0;i--)labels[i].ly=Math.min(labels[i].ly,i<labels.length-1?labels[i+1].ly-17:height-bottom-3);
      labels.forEach(l=>{
        chart.append(svg('path',{d:`M ${l.x+5} ${l.y} L ${width-right+8} ${l.ly}`,fill:'none',stroke:l.c,'stroke-opacity':'.35'}));
        const label=svg('text',{x:width-right+12,y:l.ly+3,class:'qb-end-label',fill:l.c,'data-end-label':l.p.id},l.p.name);label.append(svg('title',{},l.p.name));chart.append(label);
      });
    });
    let legend;
    if(state.colors==='hof')legend=[['Hall of Fame (solid)','#A37818'],['Not inducted (dashed)','#357B83']];
    else if(state.colors==='team')legend=[...new Set(allRows.map(r=>r.team))].sort().map(t=>[teamName(t),teamColor(t)]);
    else legend=players.map(p=>[p.name,color(p,p.seasons[0])]);
    $('legend').innerHTML=legend.map(([name,c])=>`<span><i style="background:${c}"></i>${escape(name)}</span>`).join('');
    $('tooltip').textContent='Hover, tap, or focus a season for raw and plotted values. Use the spotlight to keep one quarterback emphasized.';
    applyFocus();
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
  for (const key of graphKeys) {
    $(key).value=String(state[key]);
    if ($(key).tagName==='SELECT' && !$(key).value) state[key]=defaults[key];
    $(key).addEventListener(key==='opacity'?'input':'change',()=>{
      state[key]=$(key).value;
      render();
    });
  }
  if (!Number.isFinite(Number(state.opacity)) || Number(state.opacity)<15 || Number(state.opacity)>100) state.opacity=defaults.opacity;
  $('focus').addEventListener('change',()=>setFocus($('focus').value));
  $('clear-focus').addEventListener('click',()=>setFocus(''));
  $('reset-chart').addEventListener('click',()=>{graphKeys.forEach(k=>state[k]=defaults[k]);state.focus='';render();});
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
    graphKeys.forEach(k=>state[k]=defaults[k]);state.focus='';
    if(state.view==='career')state.view='performance';
    if(b.dataset.preset==='growth'){state.normalize='delta';state.layout='separate';}
    if(b.dataset.preset==='patterns'){state.normalize='zscore';state.layout='separate';state.view='performance';state.window='all';$('window').value='all';}
    render();
  }));
  const build=data.build || {};
  $('version').textContent='v'+(build.version || 'unknown');
  if(build.commit){
    const link=document.createElement('a');link.href='https://github.com/shnider42/daily_flyer/commit/'+build.commit;link.textContent=build.commit.slice(0,7);link.title='Deployed commit '+build.commit;link.target='_blank';link.rel='noopener noreferrer';
    $('version').append(document.createTextNode(' · '),link);
  }else $('version').append(document.createTextNode(' · local build'));
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
