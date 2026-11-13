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
const DEFAULT_START_SYSTEM={id:'hearth',name:'Hearth',factionName:'Freewake Union',danger:1,description:'The settled starting system, with work and guidance close at hand.',portName:'Kettle Station'};
const dangerLabel=value=>['Low','Guarded','Hazardous','High','Extreme'][Math.max(0,Math.min(4,Number(value)-1))]||'Unknown';

/**
 * onComplete may return false / {ok:false, reason} or throw to retain the draft.
 * New captains lock their choice (including no traits); old captains opt in once.
 */
export function openCaptainSetup(dialog,{
  mode='create',character={},locked=false,starterShip='sparrow',startMode='regular',
  startSystemId='hearth',startSystems=[],
  openingMission=false,openingPolicy='choose',groupStartPolicy='none',startTogether=true,
  onComplete=()=>{},onCancel=()=>{}
}={}) {
  const creating=mode!=='edit',original=normalizeCharacter(character),draft=normalizeCharacter(character);
  const chooseOpening=creating&&openingPolicy!=='realm',chooseGroupStart=creating&&groupStartPolicy==='choose';
  const systems=Array.isArray(startSystems)?startSystems.filter(system=>system&&typeof system.id==='string'&&typeof system.name==='string').map(system=>({...system})):[];
  if(!systems.some(system=>system.id==='hearth'))systems.unshift({...DEFAULT_START_SYSTEM});
  const validSystem=id=>systems.some(system=>system.id===id)?id:'hearth';
  let selectedTogether=startTogether!==false;
  let selectedShip=normalizeStarterShip(starterShip),selectedStart=['casual','hardcore'].includes(startMode)?startMode:'regular',selectedOpening=openingMission===true,step=creating?'ship':'captain',chooseTraits=creating,busy=false,finished=false,error='';
  let selectedSystemId=validSystem(startSystemId),systemSearch='';
  const selectedSystem=()=>systems.find(system=>system.id===selectedSystemId)||DEFAULT_START_SYSTEM;
  const remoteStart=()=>selectedStart==='casual'&&selectedSystemId!=='hearth';
  const canGather=()=>selectedStart!=='hardcore'&&!remoteStart();
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
    return {starterShip:selectedShip,startMode:selectedStart,character:profile,chooseTraits:creating||(!locked&&chooseTraits),...(creating&&selectedStart==='casual'?{startSystemId:selectedSystemId}:{}),...(chooseOpening?{openingMission:selectedOpening&&!remoteStart()}:{}),...(chooseGroupStart?{startTogether:canGather()&&selectedTogether}:{})};
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
    if(remoteStart())return '<p class="captain-opening-inherited">The short opening mission takes place in Hearth. This beginning starts freely in your chosen system.</p>';
    if(!chooseOpening)return '<p class="captain-opening-inherited">New captains follow this galaxy’s opening-mission setting.</p>';
    return `<label class="captain-opening"><input type="checkbox" data-opening-mission${selectedOpening?' checked':''}><span><strong>Begin with a short opening mission</strong><small>A small paid job introduces life on foot and in space before you set your own course.</small></span></label>`;
  }
  function groupMarkup(){
    if(!creating||groupStartPolicy==='none')return '';
    if(remoteStart())return '<p class="captain-note" data-start-group-note>You will begin independently in this system. To gather in the departure lobby with friends, choose Hearth.</p>';
    if(selectedStart==='hardcore')return '<p class="captain-note">A shipless beginning starts independently on Morrow. Crew departures are available with Regular or Casual in Hearth.</p>';
    const equipment=selectedStart==='casual'?'<p class="captain-note">The shared ship uses the host’s starting equipment. If your host is Regular, your own fold-equipped ship waits at Kettle.</p>':'';
    if(groupStartPolicy==='realm')return `<p class="captain-note">If the host is gathering a crew, Regular and Casual captains starting in Hearth meet at Kettle. Larger ships become available with 2, 4, or 7 connected captains. You can leave the lobby to begin independently.</p>${equipment}`;
    return `<label class="captain-opening"><input type="checkbox" data-start-together${selectedTogether?' checked':''}><span><strong>Gather a crew before departure</strong><small>Share your galaxy code, then choose a ship together at Kettle. Larger choices unlock with 2, 4, or 7 connected captains. You can still depart alone.${selectedStart==='casual'?' Your fold drive stays fitted on the shared ship.':''}</small></span></label>`;
  }
  function matchingSystems(){
    const query=systemSearch.trim().toLocaleLowerCase();
    return systems.filter(system=>!query||[system.name,system.factionName,system.portName,system.id,system.typeName,system.placeTypes].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
  }
  function systemOptions(){
    const matches=matchingSystems(),visible=matches.some(system=>system.id===selectedSystemId)?matches:[selectedSystem(),...matches];
    return visible.map(system=>`<option value="${esc(system.id)}"${system.id===selectedSystemId?' selected':''}>${esc(system.name)} · danger ${esc(system.danger??'?')}/5</option>`).join('');
  }
  function systemSearchStatus(){
    if(!systemSearch.trim())return `${systems.length} ${systems.length===1?'system':'systems'} available`;
    const matches=matchingSystems();
    return `${matches.length} ${matches.length===1?'match':'matches'}${matches.some(system=>system.id===selectedSystemId)?'':' · your current choice stays selected'}`;
  }
  function systemMarkup(){
    if(selectedStart!=='casual')return '';
    const system=selectedSystem();
    return `<section class="captain-start-system" aria-label="Casual starting system">
      <div class="captain-start-heading"><strong>Choose your starting system</strong><span>CASUAL</span></div>
      <div class="captain-system-fields">${systems.length>12?`<label>Find a system<input type="search" data-start-system-search value="${esc(systemSearch)}" placeholder="Name, faction, station, or type" autocomplete="off" aria-describedby="captain-system-count"></label>`:''}
        <label>Starting system<select data-start-system aria-describedby="captain-system-detail captain-system-risk">${systemOptions()}</select></label>
      </div>
      ${systems.length>12?`<p class="captain-system-count" id="captain-system-count" data-start-system-count aria-live="polite">${esc(systemSearchStatus())}</p>`:''}
      <div class="captain-system-detail" id="captain-system-detail" aria-live="polite"><strong>${esc(system.name)} · ${esc(system.factionName||'Unclaimed space')}</strong><span class="captain-system-danger${Number(system.danger)>=4?' high':''}">${esc(dangerLabel(system.danger))} danger · ${esc(system.danger??'?')}/5</span><span>Starting port: ${esc(system.portName||'a civilian station')}.</span>${system.description?`<p>${esc(system.description)}</p>`:''}</div>
      <p class="captain-system-risk" id="captain-system-risk">Choose at your own risk. Local enemies, faction restrictions, and recovery rules still apply.</p>
    </section>`;
  }
  function shipMarkup(){
    const origin=`<div class="captain-origins" role="group" aria-label="Starting mode"><button type="button" class="captain-origin${selectedStart==='casual'?' selected':''}" data-start-mode="casual" aria-pressed="${selectedStart==='casual'}"><strong>Casual</strong><span>A ship, 180 CR, and a fitted fold drive. Choose your starting system and explore sooner.</span></button><button type="button" class="captain-origin${selectedStart==='regular'?' selected':''}" data-start-mode="regular" aria-pressed="${selectedStart==='regular'}"><strong>Regular</strong><span>A small ship and 180 CR in Hearth. Earn your fold drive as you go.</span></button><button type="button" class="captain-origin${selectedStart==='hardcore'?' selected':''}" data-start-mode="hardcore" aria-pressed="${selectedStart==='hardcore'}"><strong>Hardcore · start on foot</strong><span>No ship. 180 CR in your pocket on Morrow. Earn your way into space.</span></button></div><p class="captain-note">Choose your beginning. Combat, jobs, faction permissions, and recovery follow the same rules in every mode.</p>${systemMarkup()}${openingMarkup()}${groupMarkup()}`;
    if(selectedStart==='hardcore')return `${origin}<div class="captain-included"><span>YOUR FIRST MORNING / MORROW</span><strong>Find work. Book a passage. Earn your own ship.</strong><p>Work on the docks or join a paid crew for freight, repairs, survey, care, or security. Passenger tickets and your first ship cost credits.</p></div>`;
    return `${origin}<p class="captain-intro">Three compact working ships. A cockpit, a berth, and room to begin.</p>
      <p class="captain-included"><span>DEPARTURE GRANT</span> ${selectedStart==='casual'?'Your first ship includes Fold Drive I, Vector thrusters, and an Echo scanner. <strong>5 ly fold range · Cost: 0 CR</strong>':'Your first ship is included. <strong>Cost: 0 CR</strong>'}</p>
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
      <p class="captain-note">${chooseGroupStart||groupStartPolicy==='realm'?'These are your personal ships, each with a small walkable cabin. If you gather a crew before departure, larger shared ships become available at Kettle with 2, 4, or 7 connected captains.':'All three have a small walkable cabin. Larger quarters and more crew come with ships you earn later.'}</p>`;
  }
  function bindShips(root){
    for(const button of root.querySelectorAll('[data-start-mode]'))button.onclick=()=>{selectedStart=button.dataset.startMode;render();};
    root.querySelector('[data-start-system]')?.addEventListener('change',event=>{
      const scrollTop=dialog.body.scrollTop;
      selectedSystemId=validSystem(event.target.value);render();
      dialog.body.scrollTop=scrollTop;
      dialog.body.querySelector('[data-start-system]')?.focus?.({preventScroll:true});
    });
    root.querySelector('[data-start-system-search]')?.addEventListener('input',event=>{
      systemSearch=event.target.value;
      const select=root.querySelector('[data-start-system]');select.innerHTML=systemOptions();select.value=selectedSystemId;
      root.querySelector('[data-start-system-count]').textContent=systemSearchStatus();
    });
    root.querySelector('[data-opening-mission]')?.addEventListener('change',event=>{selectedOpening=event.target.checked;});
    root.querySelector('[data-start-together]')?.addEventListener('change',event=>{selectedTogether=event.target.checked;});
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
    const startSummary=selectedStart==='hardcore'?'Hardcore · Morrow · 180 CR · no ship':selectedStart==='casual'?`Casual · ${selectedSystem().name} · ${STARTER_SHIPS.find(hull=>hull.id===selectedShip).name} · 180 CR · Fold Drive I fitted`:`Regular · Hearth · ${STARTER_SHIPS.find(hull=>hull.id===selectedShip).name} · 180 CR`;
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
    <div class="captain-summary" aria-live="polite"><strong>${creating?esc(startSummary):'Your captain’s abilities'}</strong><span data-captain-summary></span>${creating?`<span data-opening-summary>${remoteStart()?'Start freely · the opening mission is in Hearth':chooseOpening?(selectedOpening?'Opening mission included':'Start freely'):'Opening mission follows this galaxy’s setting.'}</span>`:''}</div>
    ${creating&&chooseGroupStart&&canGather()&&selectedTogether?'<p class="captain-note">Next: share the galaxy code and gather your crew at Kettle before choosing a larger departure ship.</p>':''}
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
