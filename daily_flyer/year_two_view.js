/* Presentation only: never writes explorer state, selections, presets or model inputs. */
(() => {
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const comparison=(pairs,direction)=>{
    const measured=pairs.filter(p=>finite(p.delta)),up=measured.filter(p=>p.delta*(direction||1)>0).length,
      down=measured.filter(p=>p.delta*(direction||1)<0).length;
    if(!pairs.length)return 'No selected players match the current filters. Pick a story, or use Guided to choose players.';
    if(!measured.length)return 'These players have no comparable year-one / year-two values for this measure. Missing data is not a slump.';
    return `Of the ${measured.length} players in this chart selection with both seasons measured, ${up} ${direction===0?'rose numerically':'improved'}, ${down} ${direction===0?'fell numerically':'declined'} and ${measured.length-up-down} stayed level. ${pairs.length-measured.length?`${pairs.length-measured.length} others lack a comparable pair. `:''}That describes year two—not what caused it or what must happen next.`;
  };
  const relationship=(rho,predictor,outcome)=>!finite(rho)?'There is not enough comparable data or variation to describe a relationship.':Math.abs(rho)<.1?
    `There is little rank relationship between ${predictor} and ${outcome} in this group. This does not rule out other kinds of relationships.`:
    `Players with higher ${predictor} tended to have ${rho>0?'higher':'lower'} values for ${outcome}. Numerical direction is not a good / bad grade.`;
  const api={comparison,relationship};
  if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;
  const root=document.querySelector('#qb-app,#bb-app,#bw-app');if(!root)return;
  const key='year-two-detail-v1',levels=['simple','guided','full'];let level='simple';
  try{const saved=localStorage.getItem(key);if(levels.includes(saved))level=saved;}catch(_){}
  const descriptions={simple:'Stories, graphs and plain-English takeaways. Start with a story below.',guided:'Choose players and measures, with help reading each graph.',full:'Every filter, graph option, statistical result and export.'};
  const buttonRoot=document.getElementById('yt-levels');
  function setLevel(next,persist=true){
    if(!levels.includes(next))return;level=next;root.dataset.detail=level;
    buttonRoot.querySelectorAll('[data-detail-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.detailLevel===level)));
    document.getElementById('yt-level-status').textContent=descriptions[level]+' Your analysis and selections stay the same.';
    if(persist)try{localStorage.setItem(key,level);}catch(_){}
    // Redraw only the layout; do not rerun a study or discard a pin / story / model result.
    document.dispatchEvent(new Event('yt:layout'));
  }
  root.addEventListener('click',e=>{const button=e.target.closest('[data-detail-level]');if(!button)return;setLevel(button.dataset.detailLevel);if(!buttonRoot.contains(button))buttonRoot.querySelector(`[data-detail-level="${level}"]`).focus({preventScroll:true});});
  const mark=(selector,min)=>root.querySelectorAll(selector).forEach(el=>el.dataset.detailMin=min);
  mark('.qb-sidebar,.qb-chart-controls,.qb-quick-tools,#qb-selected-details,.bb-sidebar,.bb-measure,.bb-display-count>label','guided');
  mark('#qb-settings,#qr-stats,.qb-research-question,.qb-pattern-section,.qb-model-section,#bb-graph-settings,#bb-research-summary,#bb-verdict,#bb-patterns,#bb-scan>.bb-table-wrap,#bb-scan>.bb-small','full');
  const researchExport=document.getElementById('qr-export');if(researchExport)researchExport.closest('details').dataset.detailMin='full';
  mark('.qb-research-options','guided');
  mark('#qr-scenario','full');
  const insert=(id,anchor)=>{
    const el=root.querySelector(anchor);if(!el)return;
    const card=document.createElement('section');card.id=id;card.className='yt-explainer';card.setAttribute('aria-label','Plain-English guide');
    card.innerHTML='<div class="yt-eyebrow">THE PLAIN-ENGLISH VERSION</div><h3></h3><p class="yt-takeaway"></p><p class="yt-reading"></p><p class="yt-caution"></p><details class="yt-teaching"><summary>What do these statistics mean?</summary><p></p></details><div class="yt-actions"><button type="button" data-detail-level="guided">Choose players &amp; stats</button><button type="button" data-detail-level="full">Show all the numbers</button></div>';
    el.before(card);
  };
  insert('yt-qb-film','.qb-chart-controls');insert('yt-qb-research','#qr-stats');
  insert('yt-bb-compare','#bb-compare .bb-tabs');insert('yt-bb-research','#bb-research-summary');insert('yt-bb-scan','#bb-scan>.bb-table-wrap');
  function explain(id,{title,takeaway,reading,caution,terms}){
    const card=document.getElementById(id);if(!card)return;
    for(const [selector,text] of Object.entries({'h3':title,'.yt-takeaway':takeaway,'.yt-reading':reading,'.yt-caution':caution,'.yt-teaching p':terms}))card.querySelector(selector).textContent=text||'';
  }
  window.YearTwoView={...api,explain,get level(){return level;}};
  setLevel(level,false);
})();
