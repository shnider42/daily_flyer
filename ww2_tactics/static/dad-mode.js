/* Browser-local accessibility presentation; no game state or shared settings. */
'use strict';
(()=>{
 let enabled=false;try{enabled=localStorage.getItem('ww2-dad-mode')==='on';}catch{}
 const controls=[];
 const details=document.createElement('dialog');details.id='dadUnitDetails';details.setAttribute('aria-label','Unit close-up');document.body.append(details);
 function inspect(){
  const u=state?.units.find(u=>u.id===target&&u.hp>0)||state?.units.find(u=>u.id===selected);if(!u)return;
  const close=document.createElement('button');close.id='dadUnitDetailsClose';close.textContent='Back to battle';close.onclick=()=>details.close();
  const name=document.createElement('h2');name.textContent=unitName(u);
  const status=document.createElement('p');status.textContent=`${sideLabel(u.side)} · ${u.hp} ${state.naval_version&&u.kind!=='amphibious'?'hull':'strength'} · ${u.ap} AP${u.pinned?' · Pinned':''}${u.entrenched?' · Dug in':''}${u.overwatch?' · Overwatch':''}`;
  const role=document.createElement('p');role.textContent=unitRoleSummary(u);
  details.replaceChildren(close,name,makeUnitPortrait(u),status,role);
  if(!document.body.classList.contains('simple-play')){const stats=document.createElement('p');stats.textContent=`Weapon range: ${u.range} hexes${u.base_ap?` · Base actions: ${u.base_ap}`:''}${u.armor!==undefined?` · Armor: ${u.armor}`:''}`;details.append(stats);}
  details.showModal();
 }
 function sync(){document.body.classList.toggle('dad-mode',enabled);for(const b of controls){b.textContent=`Dad mode: ${enabled?'on':'off'}`;b.setAttribute('aria-pressed',String(enabled));}}
 function toggle(){details.close();enabled=!enabled;try{localStorage.setItem('ww2-dad-mode',enabled?'on':'off');}catch{}sync();if(state&&!lobbyMode)render();document.dispatchEvent(new Event('ww2:dad-mode'));}
 for(const [id,parent] of [['dadModeToggle',$('playTools')],['dadModeHome',document.querySelector('body>header')]]){
  const b=document.createElement('button');b.id=id;b.type='button';b.className='quiet';b.title='Larger text, unit close-ups and roomier controls';b.onclick=toggle;controls.push(b);parent.append(b);
 }
 window.ww2Dad={get enabled(){return enabled;},inspect};
 document.addEventListener('ww2:before-layout',()=>details.close());
 sync();if(state&&!lobbyMode)render();
})();
