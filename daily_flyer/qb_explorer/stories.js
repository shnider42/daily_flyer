/* Thin shortcuts over the existing film room and lab; no separate data pipeline. */
(() => {
  'use strict';
  const $=id=>document.getElementById('qb-'+id);
  const buttons=[...document.querySelectorAll('[data-story]')];
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const emit=(type,detail={})=>{document.dispatchEvent(new CustomEvent('qb:'+type,{detail}));return detail;};
  let before=null,active=null;
  const latest={};
  function clearGuide(){
    active=null;
    for(const mode of ['film','research'])$(mode+'-story').hidden=true;
    buttons.forEach(b=>b.setAttribute('aria-pressed','false'));
  }
  function choose(id){
    if(!buttons.some(b=>b.dataset.story===id))return;
    if(!before){
      before={film:emit('film-snapshot').value,research:emit('research-snapshot').value,
        disclosures:[...document.querySelectorAll('#qb-film details,#qb-research details')].map(el=>[el,el.open])};
      $('story-undo').hidden=false;
    }
    clearGuide();
    emit(['hall','rings'].includes(id)?'research-story':'film-story',{id});
  }
  document.addEventListener('qb:story-state',e=>{
    const {mode,signature}=e.detail;latest[mode]=signature;
    // Do not leave a canned conclusion attached to a manually changed cohort.
    if(active?.mode===mode&&active.signature!==signature)clearGuide();
  });
  document.addEventListener('qb:story-result',e=>{
    const {id,mode,title,takeaway,setup,reading}=e.detail;
    const panel=$(mode+'-story');
    panel.innerHTML=`<div class="qb-kicker">READY-MADE VIEW</div><h3>${esc(title)}</h3><p class="qb-story-takeaway">${esc(takeaway)}</p><p>${esc(reading)}</p><small>${esc(setup)}</small><a href="#qb-stories">Pick another story ↑</a>`;
    panel.hidden=false;
    active={id,mode,signature:latest[mode]};
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.story===id)));
    panel.focus({preventScroll:true});panel.scrollIntoView({block:'start'});
  });
  buttons.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.story)));
  $('story-undo').addEventListener('click',()=>{
    if(!before)return;
    const prior=before;before=null;clearGuide();
    emit('film-restore',prior.film);emit('research-restore',prior.research);
    prior.disclosures.forEach(([el,open])=>{el.open=open;});
    $('story-undo').hidden=true;
    const target=prior.research.mode==='research'?$('research').querySelector('h2'):$('view-question');
    target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});
  });
  document.addEventListener('keydown',e=>{
    if(!e.altKey||!e.shiftKey||e.ctrlKey||e.metaKey||e.repeat||e.isComposing)return;
    if(e.target.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
    const match=/^Digit([1-5])$/.exec(e.code);if(!match)return;
    e.preventDefault();choose(buttons[Number(match[1])-1].dataset.story);
  });
})();
