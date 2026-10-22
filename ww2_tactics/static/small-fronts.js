/* Map-local infantry mechanics. Targets come only from server legality. */
'use strict';
(()=>{
 let mode=null;
 const defs=[['fieldAid','field_aid','Field aid'],['caveMove','cave_move','Cave route'],['sealCave','seal_cave','Seal cave']],buttons={};
 for(const [id,kind,label] of defs){
  const b=uiNode('button');b.id=id;b.type='button';b.hidden=true;buttons[kind]=b;$('nextUnit').before(b);
  b.onclick=()=>{if(kind==='field_aid'){act({kind,unit:selected});return;}
   const cancel=mode?.kind===kind;document.dispatchEvent(new Event('ww2:cancel-targeting'));
   smokeMode=false;barrageMode=false;combatMode=null;target=null;
   mode=cancel?null:{kind,unit:selected,revision:state.revision};render();};
 }
 const status=uiNode('p','small-front-status');status.id='smallFrontStatus';status.hidden=true;$('missionHint').after(status);
 const manual=uiNode('section');manual.id='smallFrontManual';manual.hidden=true;$('fieldworksManual').after(manual);
 document.addEventListener('ww2:cancel-targeting',()=>mode=null);
 window.smallFrontPicking=legal=>{if(mode&&(mode.unit!==selected||mode.revision!==state.revision||smokeMode||barrageMode||combatMode||!legal?.[mode.kind]?.length))mode=null;return !!mode;};
 const same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1];
 const caveOpen=p=>!state.sealed_caves?.includes(p.id);
 window.smallFrontReason=(id,u)=>{
  if(id==='fieldAid'){
   if(u.hp>=u.max_hp)return 'Already at full strength';
   if(u.aid_round===state.round)return 'Treated this round';
   if(!state.medical_supplies)return 'No medical supplies left';
   return 'Needs an uncontested own aid post within 1 hex';
  }
  if(id==='sealCave')return u.demolition_charges?'Needs an enemy-free open entrance within 1 hex':'No demolition charges left';
  if(id==='caveMove')return state.scenario.cave_entrances?.some(p=>same(p.pos,u.pos)&&caveOpen(p))?'No open exit with known space':'Move onto an open cave entrance';
  return null;
 };
 function markers(svg,snapshot=state){
  svg.querySelectorAll('.small-front-marker').forEach(n=>n.remove());
  svg.dataset.smallFront=state.scenario.source_id||'';
  const posts=state.scenario.aid_posts||[],caves=state.scenario.cave_entrances||[];
  for(const p of [...posts,...caves]){
   const [x,y]=center(...p.pos),sealed=snapshot.sealed_caves?.includes(p.id),aid=!!p.side;
   const g=element('g',{class:'small-front-marker '+(aid?'aid '+p.side:sealed?'sealed':'cave'),'aria-hidden':'true'});
   g.append(element('circle',{cx:x,cy:y,r:28}),element('text',{x,y:y-32,'text-anchor':'middle'},aid?(p.side===state.side?'＋ AID':'＋ ENEMY AID'):sealed?'× SEALED':p.id.toUpperCase()+' CAVE'));
   svg.append(g);
  }
 }
 window.renderSmallFronts=(u,legal,svg)=>{
  svg.querySelectorAll('.small-front-choice').forEach(n=>n.remove());
  for(const b of Object.values(buttons))b.hidden=true;
  const enabled=state.small_fronts_version===1,foy=!!state.scenario.aid_posts;
  status.hidden=manual.hidden=!enabled;
  markers(svg);
  if(!enabled){mode=null;return;}
  const stock=state.medical_supplies||0,open=(state.scenario.cave_entrances||[]).filter(caveOpen).length;
  status.textContent=(foy?`Aid posts · ${stock} medical supplies left for your army · restore 1 strength for 2 AP.`:'')+(state.war_version?' · ':'')+(!foy||state.war_version?`Cave network · ${open}/3 entrances open · ${state.side==='de'?'2 AP to relocate; ends this unit’s actions.':'Engineers seal entrances: 2 AP + 1 demolition charge.'}`:'');
  manual.replaceChildren(uiNode('h3','',foy?'Foy · Field aid':'Peleliu · Cave network'),uiNode('p','',foy?
   'Unpinned infantry within one hex of their own aid post can restore 1 strength for 2 AP and one shared medical supply, once per unit per round. The Americans start with four supplies, the Germans with three. Full-strength or destroyed units cannot be treated. Treatment does not refill ammunition or remove pinning. An enemy occupying the post or a collapsed aid building prevents treatment. Supplies never replenish.':
   'Japanese unpinned infantry on an open entrance can relocate to another open entrance for 2 AP; this ends all remaining actions and clears digging in, camouflage, observation and overwatch. Exit capacity uses normal stacking. An unseen enemy can block arrival, and normal reaction fire applies at the exit. American engineers within one hex can seal an enemy-free entrance for 2 AP and one demolition charge. Two engineers each carry one charge, also usable for their ordinary demolition order. Sealing does not harm units or block walking across the hex; the cave route closes permanently. Entrances and closures are public, but hidden troops and movements stay hidden.'));
  window.smallFrontPicking(legal);
  for(const [,kind,label] of defs){
   const b=buttons[kind],available=kind==='field_aid'?!!legal?.[kind]:!!legal?.[kind]?.length;
   b.hidden=!u||u.side!==state.side||!(kind==='field_aid'?foy:state.scenario.cave_entrances&&(kind==='cave_move'?u.side==='de':u.side==='us'&&u.kind==='engineer'));
   b.disabled=busy||!available;b.textContent=mode?.kind===kind?'Cancel '+label.toLowerCase():label+' · 2 AP';
  }
  if(u?.side===state.side)$('unitMechanics').append(uiNode('p','mechanics-caption',foy?`${stock} medical supplies shared by your army. Field aid restores strength, not ammunition.`:u.kind==='engineer'?`${u.demolition_charges||0} demolition charges. Sealing caves shares this supply with anti-armor demolition.`:'Cave routes cost 2 AP and end remaining actions. Use normal movement to reach an entrance.'));
  if(mode){
   svg.querySelectorAll('.move-beacon').forEach(n=>n.remove());
   const label=defs.find(d=>d[1]===mode.kind)[2];
   $('hint').textContent=label+': choose a marked entrance · 2 AP'+(mode.kind==='cave_move'?' · ends remaining actions; exit reaction fire applies.':' + 1 demolition charge.');
   for(const pos of legal[mode.kind]){
    const [cx,cy]=center(...pos),points=Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${cx+30*Math.cos(a)},${cy+30*Math.sin(a)}`;}).join(' ');
    const tile=element('polygon',{points,class:'small-front-choice',role:'button',tabindex:0,'aria-label':`${label} at ${hexColumn(pos[0])}${pos[1]+1}`});
    activate(tile,()=>{if(busy||playbackSession||!mode)return;const kind=mode.kind;mode=null;act({kind,unit:selected,pos});});svg.append(tile);
   }
  }
 };
 document.addEventListener('ww2:playback',()=>{const svg=$('playbackMap'),snapshot=playbackSession?.frames[playbackSession.index]?.[playbackSession.phase];if(svg&&snapshot)markers(svg,snapshot);});
 function placeStatus(){
  const menu=$('mobileBattleMenu')||$('experimentalBattle');
  const anchor=menu?menu.querySelector('.game-title'):document.querySelector('.desktop-battlefield .mission')||$('missionHint');
  if(anchor&&status.previousElementSibling!==anchor)anchor.after(status);
  status.hidden=!state?.small_fronts_version||$('game').hidden||lobbyMode;
  const snapshot=playbackSession?.frames[playbackSession.index]?.[playbackSession.phase];
  if(snapshot&&state?.small_fronts_version){
   status.textContent='REPLAY · '+(state.scenario.aid_posts?`${snapshot.medical_supplies||0} medical supplies remaining for your army.`:`${3-(snapshot.sealed_caves||[]).length}/3 cave entrances open.`);
  }
 }
 document.addEventListener('ww2:before-layout',()=>document.body.append(status));
 for(const event of ['ww2:render','ww2:playback','ww2:layout'])document.addEventListener(event,placeStatus);
})();
