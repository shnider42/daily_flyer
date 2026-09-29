/* Thin shortcuts over the existing film room and lab; no separate data pipeline. */
(() => {
  'use strict';
  const $=id=>document.getElementById('qb-'+id);
  const buttons=[...document.querySelectorAll('[data-story]')];
  const data=JSON.parse(document.getElementById('qb-data').textContent);
  let presets=data.preset_config.presets;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const emit=(type,detail={})=>{document.dispatchEvent(new CustomEvent('qb:'+type,{detail}));return detail;};
  let before=null,active=null;
  const latest={};
  function clearGuide(){
    active=null;
    for(const mode of ['film','research'])$(mode+'-story').hidden=true;
    buttons.forEach(b=>b.setAttribute('aria-pressed','false'));
  }
  function choose(id,preview=null){
    if(!buttons.some(b=>b.dataset.story===id))return;
    const preset=preview||presets.find(p=>p.id===id);if(!preset)return;
    if(!before){
      before={film:emit('film-snapshot').value,research:emit('research-snapshot').value,
        disclosures:[...document.querySelectorAll('#qb-film details,#qb-research details')].map(el=>[el,el.open])};
      $('story-undo').hidden=false;
    }
    clearGuide();
    emit(preset.mode==='research'?'research-story':'film-story',{id,preset});
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
    if(!document.getElementById('qb-preset-admin').hidden){const link=document.createElement('a');link.href='#qb-preset-admin';link.textContent='Back to preset editor ↑';link.style.marginLeft='16px';panel.append(link);}
    active={id,mode,signature:latest[mode]};
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.story===id)));
    panel.focus({preventScroll:true});panel.scrollIntoView({block:'start'});
  });
  buttons.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.story)));
  function updateLabels(){
    buttons.forEach((b,i)=>{b.replaceChildren();const n=document.createElement('span');n.textContent=String(i+1);n.setAttribute('aria-hidden','true');b.append(n,document.createTextNode(' '+presets.find(p=>p.id===b.dataset.story).label));});
  }
  document.addEventListener('qb:presets-updated',e=>{presets=e.detail.presets;clearGuide();updateLabels();});
  document.addEventListener('qb:preview-preset',e=>choose(e.detail.preset.id,e.detail.preset));
  updateLabels();
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
