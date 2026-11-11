/** New-captain choices and appearance editing. Drafts never mutate a live voyage. */
import { STARTER_SHIPS, normalizeStarterShip } from './fleet.mjs';
import { drawShip } from './space-art.mjs';
import {
  CHARACTER_TRAITS, MAX_TRAITS, SKIN_TONES, SUIT_COLORS, HAIR_COLORS, HAIR_STYLES,
  normalizeCharacter, appearancePalette, characterModifiers, drawCaptainPortrait
} from './character.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SHIP_NOTES={
  sparrow:{role:'A little of everything',benefit:'A reserve bus recovers reactor charge faster between bursts.',cost:'Balanced engines and weapons; a modest cargo hold.',color:'#b7c8bc'},
  kestrel:{role:'Go farther. Find more.',benefit:'Stronger vector BOOST and a longer-range scanner.',cost:'Light armor and a smaller hold.',color:'#92b8c4'},
  mule:{role:'Make a living in the belt',benefit:'A long-reach tractor rig, faster mining, and more cargo.',cost:'Slower engines and turning.',color:'#c2ab7e'}
};
const options=(items,current)=>items.map(item=>`<option value="${esc(item.id)}"${item.id===current?' selected':''}>${esc(item.name)}</option>`).join('');
const traitName=id=>CHARACTER_TRAITS.find(trait=>trait.id===id)?.name||'';
const percent=value=>`${value>=1?'+':'−'}${Math.round(Math.abs(value-1)*100)}%`;

/**
 * onComplete may return false / {ok:false, reason} or throw to retain the draft.
 * New captains lock their choice (including no traits); old captains opt in once.
 */
export function openCaptainSetup(dialog,{
  mode='create',character={},locked=false,starterShip='sparrow',startMode='regular',
  openingMission=false,openingPolicy='choose',
  onComplete=()=>{},onCancel=()=>{}
}={}) {
  const creating=mode!=='edit',original=normalizeCharacter(character),draft=normalizeCharacter(character);
  const chooseOpening=creating&&openingPolicy!=='realm';
  let selectedShip=normalizeStarterShip(starterShip),selectedStart=startMode==='hardcore'?'hardcore':'regular',selectedOpening=openingMission===true,step=creating?'ship':'captain',chooseTraits=creating,busy=false,finished=false,error='';
  const previousClose=dialog.onClose,closeButton=dialog.el?.querySelector('#closeModal');
  const previousCloseDisabled=closeButton?.disabled||false;
  const stopDismiss=e=>{
    if(!busy)return;
    if(e.type==='keydown'&&e.key==='Escape'||e.type==='click'&&e.target===dialog.backdrop){e.preventDefault();e.stopImmediatePropagation();}
  };
  function cleanup(){
    if(dialog.onClose===closeHandler)dialog.onClose=previousClose;
    dialog.el?.classList.remove('captain-setup-dialog');
    dialog.el?.removeEventListener('keydown',stopDismiss,true);
    dialog.backdrop?.removeEventListener('click',stopDismiss,true);
    if(closeButton)closeButton.disabled=previousCloseDisabled;
  }
  function cancel(){
    if(busy||finished)return;
    finished=true;cleanup();
    if(dialog.kind==='captain-setup')dialog.close();
    onCancel();
  }
  function closeHandler(kind){
    previousClose?.call(dialog,kind);
    if(kind==='captain-setup'&&!busy&&!finished)cancel();
  }
  dialog.onClose=closeHandler;
  dialog.el?.addEventListener('keydown',stopDismiss,true);
  dialog.backdrop?.addEventListener('click',stopDismiss,true);
  function selection(){
    const profile=normalizeCharacter(draft);
    if(!creating&&(!chooseTraits||locked))profile.traits=[...original.traits];
    return {starterShip:selectedShip,startMode:selectedStart,character:profile,chooseTraits:creating||(!locked&&chooseTraits),...(chooseOpening?{openingMission:selectedOpening}:{})};
  }
  async function submit(){
    if(busy||finished)return;
    busy=true;error='';
    const root=dialog.body.querySelector('.captain-setup');
    root?.setAttribute('aria-busy','true');
    root?.querySelectorAll('button,input,select').forEach(control=>{control.disabled=true;});
    if(closeButton)closeButton.disabled=true;
    const submitButton=root?.querySelector('[data-captain-submit]');if(submitButton)submitButton.textContent=creating?'Preparing your voyage…':'Saving your captain…';
    const status=root?.querySelector('[data-captain-error]');if(status)status.textContent='';
    try{
      const result=await onComplete(selection());
      if(result===false||result?.ok===false)throw new Error(result?.reason||result?.message||'That could not be saved. Please try again.');
      finished=true;busy=false;cleanup();
      if(dialog.kind==='captain-setup')dialog.close();
    }catch(cause){
      busy=false;
      error=cause?.message||'That could not be saved. Please try again.';
      if(closeButton)closeButton.disabled=previousCloseDisabled;
      if(dialog.opened&&dialog.kind==='captain-setup')render();else cleanup();
    }
  }
  function render(){
    if(finished)return;
    const isShip=step==='ship';
    dialog.open(isShip?'Where does your story begin?':creating?'Make this captain yours':'Your captain','captain-setup',{
      eyebrow:creating?`NEW VOYAGE / ${isShip?'1 · YOUR START':'2 · YOUR CAPTAIN'}`:'CAPTAIN’S LOCKER',wide:true
    });
    dialog.el?.classList.add('captain-setup-dialog');
    dialog.html(`<section class="captain-setup" aria-label="${creating?'New captain setup':'Customize your captain'}">
      ${creating?`<ol class="captain-steps" aria-label="Setup progress"><li${isShip?' aria-current="step"':''}><span>01</span> Starting life</li><li${!isShip?' aria-current="step"':''}><span>02</span> Captain</li></ol>`:''}
      ${isShip?shipMarkup():captainMarkup()}
      <p class="captain-error" role="alert" data-captain-error>${esc(error)}</p>
      <div class="captain-actions">
        <button type="button" class="captain-cancel" data-captain-cancel>Cancel</button>
        ${creating&&!isShip?'<button type="button" class="button-secondary" data-captain-back>← Starting life</button>':''}
        <button type="button" class="button-primary" ${isShip?'data-captain-next':'data-captain-submit'}>${isShip?'Make your captain →':creating?'Begin voyage →':'Save captain'}</button>
      </div>
    </section>`);
    const root=dialog.body.querySelector('.captain-setup');
    root.querySelector('[data-captain-cancel]').onclick=cancel;
    if(isShip)bindShips(root);else bindCaptain(root);
    root.querySelector('[data-captain-next]')?.addEventListener('click',()=>{step='captain';error='';render();});
    root.querySelector('[data-captain-back]')?.addEventListener('click',()=>{step='ship';error='';render();});
    root.querySelector('[data-captain-submit]')?.addEventListener('click',submit);
  }
  function openingMarkup(){
    if(!chooseOpening)return '<p class="captain-opening-inherited">New captains follow this galaxy’s opening-mission setting.</p>';
    return `<label class="captain-opening"><input type="checkbox" data-opening-mission${selectedOpening?' checked':''}><span><strong>Begin with a short opening mission</strong><small>A small paid job introduces life on foot and in space before you set your own course.</small></span></label>`;
  }
  function shipMarkup(){
    const origin=`<div class="captain-origins" role="group" aria-label="Starting mode"><button type="button" class="captain-origin${selectedStart==='regular'?' selected':''}" data-start-mode="regular" aria-pressed="${selectedStart==='regular'}"><strong>Regular</strong><span>A small ship and 180 CR. Pick your first hull below.</span></button><button type="button" class="captain-origin${selectedStart==='hardcore'?' selected':''}" data-start-mode="hardcore" aria-pressed="${selectedStart==='hardcore'}"><strong>Hardcore · start on foot</strong><span>No ship. 180 CR in your pocket on Morrow. Earn your way into space.</span></button></div><p class="captain-note">The starting ship is the only difference. Jobs, paid passage, crew contracts, combat, and recovery rules are the same in both modes.</p>${openingMarkup()}`;
    if(selectedStart==='hardcore')return `${origin}<div class="captain-included"><span>YOUR FIRST MORNING / MORROW</span><strong>Find work. Book a passage. Earn your own ship.</strong><p>Take a local maintenance shift or sign aboard an NPC vessel as a gunner, firehand, or medic. Passenger services charge a fare. Your first ship is bought with credits at the shipwright.</p></div>`;
    return `${origin}<p class="captain-intro">Three compact working ships. A cockpit, a berth, and room to begin.</p>
      <p class="captain-included"><span>DEPARTURE GRANT</span> Your first ship is included. <strong>Cost: 0 CR</strong></p>
      <div class="captain-ships" role="group" aria-label="Choose your starter ship">${STARTER_SHIPS.map(hull=>{
        const note=SHIP_NOTES[hull.id];
        return `<button type="button" class="captain-ship${hull.id===selectedShip?' selected':''}" data-starter-ship="${esc(hull.id)}" aria-pressed="${hull.id===selectedShip}">
          <span class="captain-ship-head"><strong>${esc(hull.name)}</strong><span class="captain-selected">${hull.id===selectedShip?'SELECTED':'CHOOSE'}</span></span>
          <span class="captain-ship-type">${esc(hull.subtitle)}</span>
          <canvas width="288" height="112" data-ship-preview="${esc(hull.id)}" aria-label="${esc(hull.name)} exterior"></canvas>
          <strong class="captain-ship-role">${esc(note.role)}</strong>
          <span class="captain-ship-benefit">${esc(note.benefit)}</span>
          <span class="captain-ship-cost">${esc(note.cost)}</span>
          <span class="captain-ship-spec">${hull.berths} ${hull.berths===1?'berth':'berths'} <span>·</span> ${hull.stats.cargoCap} cargo <span>·</span> ${hull.stats.maxHull} hull</span>
        </button>`;
      }).join('')}</div>
      <p class="captain-note">All three have a small walkable cabin. Larger quarters and more crew come with ships you earn later.</p>`;
  }
  function bindShips(root){
    for(const button of root.querySelectorAll('[data-start-mode]'))button.onclick=()=>{selectedStart=button.dataset.startMode;render();};
    root.querySelector('[data-opening-mission]')?.addEventListener('change',event=>{selectedOpening=event.target.checked;});
    for(const canvas of root.querySelectorAll('[data-ship-preview]')){
      const compact=canvas.getBoundingClientRect().width<150,id=canvas.dataset.shipPreview,height=compact?288:112;
      canvas.width=288;canvas.height=height;const ctx=canvas.getContext('2d');
      ctx.imageSmoothingEnabled=false;ctx.fillStyle='#0a1824';ctx.fillRect(0,0,288,height);
      ctx.fillStyle='#1c343e';for(let x=16;x<288;x+=32)ctx.fillRect(x,0,1,height);for(let y=8;y<height;y+=24)ctx.fillRect(0,y,288,1);
      ctx.fillStyle='#30444b';ctx.fillRect(40,height-20,208,1);
      drawShip(ctx,144,compact?140:53,0,SHIP_NOTES[id].color,compact?2.7:1.75,false,0,false,{shipClass:id});
    }
    for(const button of root.querySelectorAll('[data-starter-ship]'))button.onclick=()=>{
      selectedShip=normalizeStarterShip(button.dataset.starterShip);
      for(const other of root.querySelectorAll('[data-starter-ship]')){
        const selected=other.dataset.starterShip===selectedShip;
        other.classList.toggle('selected',selected);other.setAttribute('aria-pressed',String(selected));other.querySelector('.captain-selected').textContent=selected?'SELECTED':'CHOOSE';
      }
    };
  }
  function captainMarkup(){
    const appearance=draft.appearance,canChoose=creating||!locked;
    return `<div class="captain-identity">
      <div class="captain-portrait"><canvas width="128" height="128" data-captain-portrait aria-label="Your captain’s appearance"></canvas><span data-captain-look></span></div>
      <div class="captain-identity-copy"><p class="captain-intro">A face for the places you’ll go.</p><p class="captain-note">Your appearance is yours to change. It has no effect on your abilities.</p>
        <div class="captain-appearance-fields">
          <label>Skin tone<select data-appearance="skin">${options(SKIN_TONES,appearance.skin)}</select></label>
          <label>Suit color<select data-appearance="suit">${options(SUIT_COLORS,appearance.suit)}</select></label>
          <label>Hair color<select data-appearance="hair">${options(HAIR_COLORS,appearance.hair)}</select></label>
          <label>Head style<select data-appearance="style">${options(HAIR_STYLES,appearance.style)}</select></label>
        </div>
      </div>
    </div>
    <section class="captain-traits" aria-label="Captain traits">
      <div class="captain-traits-heading"><h3>What shaped you?</h3><span data-trait-count>${draft.traits.length} / ${MAX_TRAITS}</span></div>
      ${canChoose?`<p class="captain-note">Choose up to two optional traits. Every advantage comes with a drawback. Choosing none gives you balanced abilities.</p>
        ${!creating?`<label class="captain-finalize"><input type="checkbox" data-finalize-traits${chooseTraits?' checked':''}><span><strong>Choose my traits now</strong><small>This is a one-time choice. Leave this off to change only your appearance.</small></span></label>`:''}
        <div class="captain-trait-grid" data-trait-grid${!creating&&!chooseTraits?' hidden':''}>${CHARACTER_TRAITS.map(trait=>`<button type="button" class="captain-trait${draft.traits.includes(trait.id)?' selected':''}" data-trait="${esc(trait.id)}" aria-pressed="${draft.traits.includes(trait.id)}">
          <span class="captain-trait-top"><strong>${esc(trait.name)}</strong><span class="captain-trait-mark" aria-hidden="true">${draft.traits.includes(trait.id)?'✓':'+'}</span></span>
          <span class="captain-trait-description">${esc(trait.description)}</span>
          <span class="captain-trait-benefit"><b>Gain</b> ${esc(trait.benefit)}</span><span class="captain-trait-cost"><b>Tradeoff</b> ${esc(trait.cost)}</span>
        </button>`).join('')}</div>
        <p class="captain-trait-hint" data-trait-hint aria-live="polite"></p>`:
        `<p class="captain-note">Your traits were chosen at departure. Appearance can still be changed.</p><div class="captain-locked-traits">${original.traits.length?original.traits.map(id=>{const trait=CHARACTER_TRAITS.find(value=>value.id===id);return `<div><strong>${esc(trait.name)}</strong><span>${esc(trait.benefit)}</span><span class="captain-trait-cost">${esc(trait.cost)}</span></div>`;}).join(''):'<p>No traits · balanced abilities.</p>'}</div>`}
    </section>
    <div class="captain-summary" aria-live="polite"><strong>${creating?(selectedStart==='hardcore'?'Morrow · 180 CR · no ship':`${esc(STARTER_SHIPS.find(hull=>hull.id===selectedShip).name)} · 180 CR · ready when you are`):'Your captain’s abilities'}</strong><span data-captain-summary></span>${creating?`<span data-opening-summary>${chooseOpening?(selectedOpening?'Opening mission included':'Start freely'):'Opening mission follows this galaxy’s setting.'}</span>`:''}</div>
    ${creating?'<p class="captain-note">Traits are fixed after departure. Your ship choice and appearance do not lock you out of the story.</p>':''}`;
  }
  function bindCaptain(root){
    const portrait=root.querySelector('[data-captain-portrait]'),ctx=portrait.getContext('2d');
    const updateLook=()=>{
      drawCaptainPortrait(ctx,draft.appearance,{size:128});
      const palette=appearancePalette(draft.appearance);
      root.querySelector('.captain-portrait').style.setProperty('--captain-suit',palette.suit);
      root.querySelector('[data-captain-look]').textContent=SUIT_COLORS.find(color=>color.id===draft.appearance.suit).name;
    };
    for(const select of root.querySelectorAll('[data-appearance]'))select.onchange=()=>{draft.appearance[select.dataset.appearance]=select.value;updateLook();};
    function updateTraits(){
      const active=creating||(!locked&&chooseTraits),chosen=active?draft.traits:original.traits;
      root.querySelector('[data-trait-count]').textContent=locked?'FIXED':active?`${chosen.length} / ${MAX_TRAITS}`:'LATER';
      const grid=root.querySelector('[data-trait-grid]');if(grid)grid.hidden=!active;
      for(const button of root.querySelectorAll('[data-trait]')){
        const selected=draft.traits.includes(button.dataset.trait);
        button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=!selected&&draft.traits.length>=MAX_TRAITS;
        button.querySelector('.captain-trait-mark').textContent=selected?'✓':'+';
      }
      const hint=root.querySelector('[data-trait-hint]');if(hint)hint.textContent=!active?'Appearance only. You can choose traits when you’re ready.':chosen.length>=MAX_TRAITS?'Two traits selected. Remove one to choose a different trait.':chosen.length?'One trait selected. You can choose one more, or leave it here.':'No traits selected. A balanced captain is a complete choice.';
      const modifiers=characterModifiers({traits:chosen}),names={walkSpeed:'walking speed',maxHealth:'maximum health',sidearmDamage:'sidearm damage',sidearmCooldown:'shot delay',mining:'mining rate',jobRewards:'job credits',serviceCost:'service costs'};
      const effects=Object.entries(modifiers).filter(([,value])=>value!==1).map(([key,value])=>`${percent(value)} ${names[key]}`);
      root.querySelector('[data-captain-summary]').textContent=chosen.length?`${chosen.map(traitName).join(' + ')} · ${effects.join(' · ')}`:'No traits · standard health, movement, combat, and earnings.';
    }
    for(const button of root.querySelectorAll('[data-trait]'))button.onclick=()=>{
      const id=button.dataset.trait,index=draft.traits.indexOf(id);
      if(index>=0)draft.traits.splice(index,1);else if(draft.traits.length<MAX_TRAITS)draft.traits.push(id);
      updateTraits();
    };
    root.querySelector('[data-finalize-traits]')?.addEventListener('change',event=>{chooseTraits=event.target.checked;updateTraits();});
    updateLook();updateTraits();
  }
  render();
  return {cancel,getSelection:selection};
}
