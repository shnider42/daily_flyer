(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('qb-data').textContent),M=QBResearch;
  const $=id=>document.getElementById('qr-'+id),q=id=>document.getElementById('qb-'+id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=x=>typeof x==='number'&&Number.isFinite(x),fmt=(n,d=2)=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d}):'—',pct=n=>finite(n)?(100*n).toFixed(1)+'%':'—';
  const state={metric:'relative_anya',outcome:'hof',x:'b',era:'all'};
  let current=null,model=null,mode='film',selectedId='';
  const NS='http://www.w3.org/2000/svg';
  function svg(tag,attrs={},text=''){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;return el;}
  const metricName=()=>$('metric').selectedOptions[0].textContent;
  const outcomeValue=r=>current.def.binary?(r.y?'Yes':'No'):state.outcome==='sb'?String(r.y)+' wins':fmt(r.y)+' ANY/A vs. league';
  function inspect(r){
    selectedId=r.id;
    $('inspect').innerHTML=`<b>${esc(r.name)} ${r.hof?'◆ HOF '+r.hof:'● Not inducted'}</b><br>${r.first}: ${fmt(r.a)} → ${r.year2}: ${fmt(r.b)} · change ${fmt(r.delta)} · ${r.y2starts??'unknown'} year-two starts<br><b>${esc(outcomeValue(r))}</b> · ${esc(current.def.name)} · window ends ${r.end} · <a href="https://www.pro-football-reference.com/players/${esc(r.id[0])}/${esc(r.id)}.htm" target="_blank" rel="noopener noreferrer">PFR ↗</a>`;
    $('chart').querySelectorAll('[data-qb]').forEach(el=>el.setAttribute('stroke-width',el.dataset.qb===r.id?3:1));
  }
  function chart(){
    const chart=$('chart');chart.replaceChildren();
    const rows=current.rows.filter(r=>r.hof?$('hof').checked:$('field').checked),all=current.rows;
    const width=Math.max(290,chart.parentElement.clientWidth),height=window.innerWidth<=760?350:420,left=55,right=20,top=25,bottom=58;
    chart.setAttribute('width',width);chart.setAttribute('height',height);chart.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const xs=all.map(r=>r[state.x]),ys=all.map(r=>r.y),xlo=xs.length?Math.min(...xs):0,xhi=xs.length?Math.max(...xs):1;
    const xp=Math.max((xhi-xlo)*.07,.1),low=xlo-xp,high=xhi+xp;
    let yl=current.def.binary?-.25:Math.min(0,...ys),yh=current.def.binary?1.25:Math.max(1,...ys);
    if(!current.def.binary){const pad=(yh-yl)*.1;yl-=pad;yh+=pad;}
    const X=v=>left+(v-low)/(high-low)*(width-left-right),Y=v=>top+(yh-v)/(yh-yl)*(height-top-bottom);
    for(let i=0;i<=5;i++){const n=low+(high-low)*i/5;chart.append(svg('text',{x:X(n),y:height-bottom+23,'text-anchor':'middle',class:'qb-axis'},fmt(n,1)));}
    const ticks=current.def.binary?[0,1]:Array.from({length:5},(_,i)=>yl+(yh-yl)*i/4);
    for(const n of ticks){chart.append(svg('line',{x1:left,y1:Y(n),x2:width-right,y2:Y(n),class:'qb-grid'}));chart.append(svg('text',{x:left-10,y:Y(n)+4,'text-anchor':'end',class:'qb-axis'},current.def.binary?(n?'Yes':'No'):fmt(n,1)));}
    chart.append(svg('text',{x:width/2,y:height-10,'text-anchor':'middle',class:'qb-axis'},$('x').selectedOptions[0].textContent));
    rows.sort((a,b)=>Number(!!a.hof)-Number(!!b.hof)).forEach(r=>{
      let hash=0;for(const ch of r.id)hash=(hash*31+ch.charCodeAt(0))>>>0;
      const jitter=(current.def.binary||state.outcome==='sb')?((hash%101)/100-.5)*.14:0;
      const px=X(r[state.x]),py=Y(r.y+jitter),color=r.hof?'#9b6208':'#156b93',radius=r.hof?6:4;
      const dot=r.hof?svg('path',{d:`M ${px} ${py-radius} l ${radius} ${radius} l ${-radius} ${radius} l ${-radius} ${-radius} Z`}):svg('circle',{cx:px,cy:py,r:radius});
      Object.entries({fill:color,stroke:r.hof?'#432f05':'#fff',opacity:r.hof?1:.65,tabindex:0,role:'button','data-qb':r.id,'aria-label':`${r.name}, ${metricName()}, year one ${fmt(r.a)}, year two ${fmt(r.b)}, ${current.def.name}: ${outcomeValue(r)}`}).forEach(([k,v])=>dot.setAttribute(k,v));
      dot.append(svg('title',{},r.name+' · '+outcomeValue(r)));
      dot.addEventListener('click',()=>inspect(r));dot.addEventListener('focus',()=>inspect(r));dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(r);}});
      chart.append(dot);
    });
    if(!rows.length)chart.append(svg('text',{x:width/2,y:height/2,'text-anchor':'middle',class:'qb-axis'},all.length?'Enable a group above to show its quarterbacks.':'No eligible QBs. Try all cohorts or another outcome.'));
    $('chart-title').textContent=$('x').selectedOptions[0].textContent+' → '+current.def.name;
    $('plot-help').textContent=`${rows.length} of ${all.length} eligible quarterbacks plotted. X: ${metricName()}. Y: ${current.def.name}.${current.def.binary||state.outcome==='sb'?' Slight vertical jitter separates markers; exact outcomes are in the inspection and table.':''} Hall markers reflect current induction status, not induction timing within the outcome window.`;
    const selected=rows.find(r=>r.id===selectedId);if(selected)inspect(selected);else{selectedId='';$('inspect').textContent='Tap or focus a quarterback to inspect its seasons and outcome.';}
  }
  function renderPatterns(){
    const direction=['int','int_pct'].includes(state.metric)?-1:1,{groups,cut,mixed}=M.patterns(current.rows,direction);
    $('pattern-rule').textContent=`Strong = top third; weak = bottom third of this eligible cohort, separately in each year (${direction<0?'lower':'higher'} is better on this measure). ${mixed} middle/mixed cases are not in the four groups. Year-one cutoffs: ${fmt(finite(cut.aLow)?cut.aLow*direction:null)} / ${fmt(finite(cut.aHigh)?cut.aHigh*direction:null)}; year-two cutoffs: ${fmt(finite(cut.bLow)?cut.bLow*direction:null)} / ${fmt(finite(cut.bHigh)?cut.bHigh*direction:null)}. Rates are descriptive, not predictions.`;
    $('patterns').innerHTML=groups.map(g=>{
      const n=g.rows.length,k=g.rows.filter(r=>r.event===1).length,ci=M.wilson(k,n),avg=M.mean(g.rows.map(r=>r.y));
      return `<article class="qb-pattern qb-pattern-${g.key}"><h4>${g.name}</h4><strong>${state.outcome==='efficiency'?fmt(avg):n?pct(k/n):'—'}</strong><span>${state.outcome==='efficiency'?'mean future ANY/A vs. league':esc(current.def.event)}</span><p>${n} QBs${state.outcome!=='efficiency'?' · '+k+' events':''}${ci&&state.outcome!=='efficiency'?'<br>95% interval '+pct(ci[0])+'–'+pct(ci[1]):''}${state.outcome==='sb'&&n?'<br>'+fmt(avg)+' mean wins':''}</p></article>`;
    }).join('');
  }
  function modelPanel(){
    model=null;$('scenario').hidden=true;$('prediction').replaceChildren();
    if(state.outcome==='efficiency'){$('model').innerHTML='<p class="qb-research-note">This continuous outcome has correlation analysis above. The experimental probability model supports Hall induction, a Super Bowl win, and a year-three starting job.</p>';return;}
    model=M.validate(current.rows);
    if(model.error){$('model').innerHTML='<p class="qb-research-note">'+esc(model.error)+'</p>';return;}
    const {train,test,boundary,full,fullScore,baseScore,nullBrier,testEvents}=model;
    const improvement=baseScore.brier-fullScore.brier;
    $('model').innerHTML=`<div class="qb-model-verdict"><b>${improvement>0?'Year two helped on this holdout.':'Year two did not help on this holdout.'}</b><span>${Math.abs(improvement).toFixed(4)} ${improvement>0?'lower':'higher'} Brier error than the year-one-only model. This is one historical split, not proof of a general forecasting advantage.</span></div><p class="qb-small">Training: ${train.length} QBs (${Math.min(...train.map(r=>r.first))}–${Math.max(...train.map(r=>r.first))}), ${model.positives} events. Held out: ${test.length} QBs (${boundary}–${Math.max(...test.map(r=>r.first))}), ${testEvents} events. Outcome: ${esc(current.def.event)}. Calendar year is included in both fitted models.</p><div class="qb-table-scroll"><table><thead><tr><th>Held-out comparison</th><th>Brier ↓</th><th>AUC ↑</th></tr></thead><tbody><tr><td>Training event-rate baseline</td><td>${nullBrier.toFixed(4)}</td><td>${testEvents===0||testEvents===test.length?'—':'0.50'}</td></tr><tr><td>Year one + calendar year</td><td>${baseScore.brier.toFixed(4)}</td><td>${fmt(baseScore.auc)}</td></tr><tr><td>Year one + year two + calendar year</td><td>${fullScore.brier.toFixed(4)}</td><td>${fmt(fullScore.auc)}</td></tr></tbody></table></div><p class="qb-small">Lower Brier is better; 0 is perfect. AUC measures ranking, not calibrated probabilities. ${testEvents<5?'Fewer than five held-out events: these scores are especially unstable. ':''}${fullScore.brier>=nullBrier?'The two-year model does not beat the simple event-rate baseline on Brier error. ':''}Exploration across measures is not adjusted for multiple testing.</p>`;
    $('scenario').hidden=false;
    $('input-a').value=M.quantile(train.map(r=>r.a),.5).toFixed(2);$('input-b').value=M.quantile(train.map(r=>r.b),.5).toFixed(2);$('input-first').value=Math.round(M.quantile(train.map(r=>r.first),.5));
  }
  function render(){
    current=M.cohort(data,state);const {rows,excluded:e,cut,def}=current;
    const xs=rows.map(r=>r[state.x]),ys=rows.map(r=>r.y),r=M.pearson(xs,ys),rho=M.spearman(xs,ys),ci=M.interval(xs,ys),hall=rows.filter(r=>r.hof).length;
    $('cohort-note').textContent=`${rows.length} eligible of ${current.candidates} cohort candidates. Same ${def.horizon}-${state.outcome==='hof'?'year':'season'} follow-up for everyone; outcomes start AFTER year two. Excluded: ${e.anchor} pre-1970/uncertain anchors, ${e.pair} missing year-one/two measures, ${e.followup} incomplete follow-up windows, ${e.outcome} unavailable outcomes. Outcome cutoff: ${cut}. Year-two seasons with fewer than 12 starts remain included.`;
    $('stats').innerHTML=`<div><span>ELIGIBLE QBs</span><strong>${rows.length}</strong><small>${hall} Hall · ${rows.length-hall} not inducted</small></div><div><span>PEARSON r</span><strong>${fmt(r)}</strong><small>${ci?'95% bootstrap '+fmt(ci[0])+' to '+fmt(ci[1]):'Interval unavailable / too few values'}</small></div><div><span>SPEARMAN ρ</span><strong>${fmt(rho)}</strong><small>Rank association · ties retained</small></div>`;
    renderPatterns();modelPanel();chart();
    $('table').innerHTML=rows.map(r=>`<tr><td>${esc(r.name)} ${r.hof?'◆':''}</td><td>${r.first}</td><td>${fmt(r.a)}</td><td>${fmt(r.b)}</td><td>${fmt(r.delta)}</td><td>${esc(outcomeValue(r))}</td><td>${r.end}</td></tr>`).join('')||'<tr><td colspan="7">No eligible quarterbacks.</td></tr>';
  }
  function predict(){
    if(!model?.full)return;
    const a=$('input-a').value.trim(),b=$('input-b').value.trim(),first=$('input-first').value.trim(),r={a:Number(a),b:Number(b),first:Number(first)};
    if(!a||!b||!first||!Object.values(r).every(Number.isFinite)||!Number.isInteger(r.first)||r.first<1970||r.first>data.meta.through){$('prediction').textContent='Enter finite values and a first qualifying season from 1970 through '+data.meta.through+'.';return;}
    const extreme=model.full.keys.some((k,j)=>Math.abs((r[k]-model.full.means[j])/model.full.sds[j])>6);
    if(extreme){$('prediction').textContent='This profile is too far outside the training distribution for a useful estimate (more than six training standard deviations).';return;}
    const out=model.full.keys.some(k=>r[k]<Math.min(...model.train.map(t=>t[k]))||r[k]>Math.max(...model.train.map(t=>t[k])));
    $('prediction').innerHTML=`<strong>${pct(model.full.predict(r))}</strong> estimated probability of <b>${esc(current.def.event.toLowerCase())}</b>.<br>Year-one-only model: ${pct(model.baseline.predict(r))}. Training event rate: ${pct(model.full.prevalence)}.<p class="qb-small">${out?'Outside at least one training range: this is extrapolation. ':''}Experimental estimate from earlier historical cohorts, not a calibrated forecast for an individual player. No team, coaching, rushing, injury or draft information is included.</p>`;
  }
  for(const key of ['metric','outcome','x','era'])$(key).addEventListener('change',()=>{state[key]=$(key).value;selectedId='';render();});
  for(const key of ['hof','field'])$(key).addEventListener('change',()=>chart());
  $('predict').addEventListener('click',predict);
  $('export').addEventListener('click',()=>{
    const rows=[['quarterback','pfr_id','metric','outcome','year_1_season','year_2_season','year_1_value','year_2_value','change','outcome_value','model_event','window_end','hall_induction','performance_through','hall_as_of']];
    current.rows.forEach(r=>rows.push([r.name,r.id,state.metric,state.outcome,r.first,r.year2,r.a,r.b,r.delta,r.y,r.event,r.end,r.hof,data.meta.through,data.meta.hof_as_of]));
    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='sophmore-slump-research-'+state.outcome+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('sources').innerHTML=data.super_bowls.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a> — ${esc(s.used)}</li>`).join('');
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    mode=button.dataset.mode;q('film').hidden=mode!=='film';q('research').hidden=mode!=='research';
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    if(mode==='research'){if(!current)render();else chart();}else document.dispatchEvent(new Event('qb:layout'));
  }));
  let resize,width=window.innerWidth;
  window.addEventListener('resize',()=>{if(width===window.innerWidth)return;width=window.innerWidth;clearTimeout(resize);resize=setTimeout(()=>{if(mode==='research'&&current)chart();},150);});
})();
