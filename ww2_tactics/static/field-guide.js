/* Shared plain-language action inspection and mission overlays. Public state only.
   Inspecting an order never issues it; all actual actions use the existing API. */
'use strict';
(()=>{
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text!==undefined)n.textContent=text;return n;};
 kinds.supply='Supply squad';unitCodes.supply='SUP';
 const namesByLevel={simple:'Simple',moderate:'Moderate',expert:'Expert'};
 const depth={simple:['I','Essentials','Purpose, AP cost, availability and danger. Inspect any order for its full explanation.'],moderate:['II','Tactical detail','Everything in Simple, plus useful odds, ranges and unit mechanics.'],expert:['III','Full accounting','Everything in Moderate, plus dice, modifiers and detailed battle reports.']};
 const shared='Same rules, same difficulty, same orders. Experience changes information detail only; Layout and Large text are separate.';
 const controls=[];
 for(const wrap of document.querySelectorAll('.experience-control')){
  const mark=node('p',null);mark.className='experience-mark';mark.setAttribute('aria-live','polite');
  const detail=node('details',null);detail.className='experience-compare';detail.append(node('summary',null,'What changes between Experiences?'));
  const cards=node('div',null);cards.className='experience-levels';
  for(const [level,[number,title,desc]] of Object.entries(depth)){
   const b=node('button',null);b.type='button';b.dataset.experienceChoice=level;
   b.append(node('strong',null,`${number} · ${namesByLevel[level]} — ${title}`),node('span',null,desc));
   b.onclick=()=>ww2Experience.set(level);cards.append(b);
  }
  detail.append(cards,node('p',null,shared));wrap.prepend(mark);wrap.append(detail);controls.push({wrap,mark,cards});
 }
 function syncExperience(){
  const level=window.ww2Experience?.level||'simple';
  for(const {mark,cards} of controls){
   const text=`${depth[level][0]} · ${namesByLevel[level]} · ${depth[level][1]}`;
   if(mark.textContent!==text)mark.textContent=text;mark.dataset.depth=level;
   for(const b of cards.children)b.setAttribute('aria-pressed',String(b.dataset.experienceChoice===level));
  }
  for(const p of document.querySelectorAll('[data-experience-note]'))p.textContent=depth[level][2];
  const note=$('experienceRulesNote');if(note)note.textContent=shared;
 }
 const dialog=node('dialog','orderGuide');dialog.setAttribute('aria-labelledby','orderGuideTitle');
 const close=node('button','orderGuideClose','Back to battle');close.type='button';close.onclick=()=>dialog.close();
 const heading=node('h2','orderGuideTitle','Orders explained'),status=node('p','orderGuideStatus'),depthNote=node('p','orderGuideDepth'),items=node('div','orderGuideItems');
 dialog.append(close,heading,depthNote,status,items);document.body.append(dialog);
 const help=node('button','orderGuideOpen','?');help.type='button';help.setAttribute('aria-label','Explain this unit’s orders');help.setAttribute('aria-haspopup','dialog');help.setAttribute('aria-controls','orderGuide');
 const helpHome=document.createComment('Order explanations home');$('selection').before(helpHome,help);
 const supplyDialog=node('dialog','supplyDialog');supplyDialog.setAttribute('aria-labelledby','supplyTitle');
 const supplyClose=node('button','supplyClose','Cancel');supplyClose.onclick=()=>supplyDialog.close();
 supplyDialog.append(supplyClose,node('h2','supplyTitle','Deliver supplies'),node('p',null,'2 AP and one finite pack. Choose an adjacent ally. No health, AP or firing cooldown is restored.'));
 const recipients=node('div','supplyRecipients');supplyDialog.append(recipients);document.body.append(supplyDialog);
 const resupply=node('button','resupply','Resupply · 2 AP'),evacuate=node('button','evacuate','Evacuate · 1 AP');
 resupply.hidden=evacuate.hidden=true;resupply.type=evacuate.type='button';$('nextUnit').before(resupply,evacuate);
 resupply.onclick=()=>{
  const uid=selected,revision=state.revision,code=state.code;
  recipients.replaceChildren();
  for(const c of state.legal[uid]?.resupply||[]){
   const u=state.units.find(v=>v.id===c.id),b=node('button',null,`${unitName(u)} · +${c.amount} ${c.resource==='shells'?'shells':'repair kit'}`);b.type='button';
   b.onclick=()=>{supplyDialog.close();if(state.code!==code||state.revision!==revision||selected!==uid){notify('The battle changed. Review the recipients again.');return;}act({kind:'resupply',unit:uid,target:c.id});};recipients.append(b);
  }
  if(recipients.children.length){for(const d of document.querySelectorAll('dialog[open]'))d.close();supplyDialog.showModal();}
 };
 evacuate.onclick=()=>{const uid=selected;if(confirm('Evacuate the marked passenger? This rescue is permanent and commits earlier takebacks. The empty boat can return.'))act({kind:'evacuate',unit:uid});};
 function detailedHelp(id,u,legal){
  const extra={
   observe:`Spend 1 AP to add 2 hexes to this unit’s sight, not its weapon range. ${legal?.observation?`Current nominal sight: ${legal.observation.sight}; weapon range: ${legal.observation.weapon_range}. `:''}Terrain, smoke and enemy concealment still matter. ${u.observing?'ACTIVE now. ':''}Moving, attacking, boarding or the next friendly turn ends observation. Pinned units must rally first.`,
   radioUpdate:`Share sightings (formerly “Radio update”) sends dated contact reports. ${u.kind==='radioman'?'This radio team spends 1 AP and shares only its own platoon’s reports.':'This commander spends 2 AP and shares recent reports from all friendly platoons.'} Once per round. Reports last through the following round; they do not follow the enemy. A reported hex can be aimed at by a mortar, but it does not become a live direct-fire target. The enemy hears only a broad sector alert. No recent contacts means nothing to share.`,
   mortarFire:`${u.shells||0}${u.max_shells?'/'+u.max_shells:''} shells left. Each fire order costs 2 AP and one shell, once per round, at range 2–${u.mortar_range||8}. Aim using this platoon’s sight or an already received radio report. The marked area resolves after the enemy turn. Friendly infantry can be hit too; buildings may collapse. Crew rifles and Overwatch are separate from indirect mortar fire. ${state.logistics_version?'An adjacent supply squad can replenish up to two shells, capped at starting capacity.':'This battle has no supply squads; mortar shells do not automatically refill.'}`,
   resupply:`${u.supply_packs||0} supply packs left. Spend 2 AP and one pack to give an adjacent friendly mortar up to 2 shells, or an engineer 1 repair kit, without exceeding starting capacity. Each recipient may receive supplies once per round. No health, AP, bridge kits, support calls, grenades or firing cooldowns are restored. Packs do not regenerate.`,
   evacuate:'Only on Dunkirk: carry marked RESCUE infantry to a water hex on the top sea edge, then spend 1 boat AP to rescue that whole unit. The boat stays and can return. Evacuation is permanent; earlier takebacks are committed. Six rescued units wins.',
   load:'Select this transport, then choose an adjacent friendly infantry unit. It spends 1 infantry AP to board; this does not cost the boat AP. One passenger at a time. For Dunkirk, choose a unit marked RESCUE: other passengers do not count toward the evacuation goal.',
   barrage:`This is the army’s off-map mortar support call, not a mortar team’s shell inventory. ${state.support?.[state.side]||0} calls remain. It resolves after the enemy turn and can hit friendly infantry. Supply squads do not replenish off-map support.`,
   overwatch:'Pay AP now for a reaction to a qualifying enemy move. A possible-firing-lane warning is not proof of hidden Overwatch. Mortar teams use their rifles for Overwatch, not mortar shells.'
  };
  return extra[id]||window.orderHelp?.(id,u,legal,false)||$(id)?.dataset.help||'Use the marked legal target or destination. The server confirms AP costs and the result.';
 }
 function unitStatus(u,legal){
  const parts=[`${u.hp}/${u.max_hp||u.hp} strength`,`${u.ap} AP`];
  if(u.observing)parts.push(`OBSERVING +2 sight${legal?.observation?' · sight '+legal.observation.sight:''} · weapon range unchanged`);
  if(u.mortar_range)parts.push(`${u.shells||0}${u.max_shells?'/'+u.max_shells:''} mortar shells`);
  if(u.kind==='supply')parts.push(`${u.supply_packs||0}/3 supply packs`);
  if(u.evacuee)parts.push(u.carrier_id?'RESCUE passenger aboard':'RESCUE: this unit counts toward six');
  if(u.pinned)parts.push('PINNED');
  return parts.join(' · ');
 }
 function fillGuide(){
  const u=state?.units.find(v=>v.id===selected&&v.side===state.side),legal=state?.legal[selected];
  heading.textContent=u?`${unitName(u)} · orders explained`:'Orders explained';
  depthNote.textContent=`${namesByLevel[ww2Experience.level]} Experience. Full explanations remain available in every Experience; opening this sheet does not spend AP.`;
  items.replaceChildren();status.textContent=u?unitStatus(u,legal):'Select one of your units, then open ? for its current orders.';
  if(!u)return;
  const safety=node('p',null,state.signals_version?'A possible firing lane is inferred from a currently spotted enemy’s weapon range and line of fire. It does not reveal secret Overwatch. Unmarked hexes may hide threats. Old radio markers are not live positions.':'Movement and combat are confirmed by the server. Fog may conceal enemy positions. Review visible targets and danger warnings before moving.');safety.className='guide-safety';items.append(safety);
  const caps=window.unitOrderCapabilities?.(u)||[];
  for(const id of caps){
   const b=id==='command'?$('commandOrders').querySelector('button'):$(id),section=node('section',null);section.className='guide-order';
   const raw=b?.dataset.orderLabel||b?.textContent||id;const title=b?.querySelector('.action-name')?.textContent||raw;
   const stateLine=b?.dataset.orderReason?`Unavailable: ${b.dataset.orderReason}`:'Available when its highlighted target is chosen';
   const chip=node('p',null,stateLine);chip.className=b?.dataset.orderReason?'guide-unavailable':'guide-ready';
   section.append(node('h3',null,title),node('p',null,detailedHelp(id,u,legal)),chip);items.append(section);
  }
  if(!caps.length)items.append(node('p',null,'This unit has no active orders here. It may be a passive installation, a casualty, or a unit using the classic ruleset.'));
 }
 help.onclick=()=>{fillGuide();for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();dialog.showModal();};
 function placeHelp(){
  const on=!!state&&!$('game').hidden&&!lobbyMode;help.hidden=!on;
  if(!on){dialog.close();supplyDialog.close();if(help.previousSibling!==helpHome)helpHome.after(help);return;}
  const head=$('mobileOrderHead');
  if(head){if(help.parentNode!==head)head.append(help);}
  else if(help.previousSibling!==helpHome)helpHome.after(help);
  help.disabled=!!playbackSession;
  if(dialog.open)fillGuide();
  syncExperience();
 }
 const terrainLabels={kharkov:'KHARKOV · ARMORED FLAGS',relay_crossing:'RELAY CROSSING · GROUND LAB',dunkirk:'DUNKIRK · RESCUE ROUTES'};
 function paintMission(svg,snapshot=state){
  const id=state.scenario.id,key=state.code+':'+state.battle_number+':'+id+':'+JSON.stringify(snapshot.front_control||[]);
  let layer=svg.querySelector('.front-objectives');
  if(!terrainLabels[id]){layer?.remove();return;}
  if(svg._frontKey!==key||!layer){
   layer?.remove();layer=element('g',{class:'front-objectives','aria-hidden':'true'});svg._frontKey=key;
   const points=state.front_mode==='armored_control'?snapshot.front_control:state.front_mode==='evacuation'?[...state.scenario.embarkation_points.map(pos=>({pos,name:'BOARD'})),...[3,9,15].map(x=>({pos:[x,0],name:'RESCUE EXIT'}))]:[{pos:state.scenario.objective,name:'RELAY'}];
   for(const p of points||[]){const [x,y]=center(...p.pos),g=element('g');g.append(element('circle',{cx:x,cy:y,r:25,class:`front-marker ${p.owner||'neutral'}`}));g.append(element('text',{x,y:y+34,'text-anchor':'middle',class:'front-marker-label'},p.points?`${p.name} +${p.points}`:p.name));layer.append(g);}
   const first=svg.querySelector('.unit');if(first)svg.insertBefore(layer,first);else svg.append(layer);
  }
 }
 window.renderNewFronts=(u,legal,svg)=>{
  resupply.hidden=!legal?.resupply?.length;resupply.disabled=busy||state.turn!==state.side;resupply.textContent='Resupply · 2 AP';
  evacuate.hidden=!legal?.evacuate;evacuate.disabled=busy||state.turn!==state.side;evacuate.textContent='Evacuate · 1 AP';
  if(document.body.dataset.operation!==state.scenario.id)document.body.dataset.operation=state.scenario.id;
  paintMission(svg);
  for(const v of (window.signalSnapshot?.(state)||state).units){
   const g=svg._counters?.get(v.id);if(!g)continue;
   const observing=v.side===state.side&&v.observing,rescue=v.side===state.side&&v.evacuee,label=rescue?'RESCUE':observing?'+2 SIGHT':'';
   if(g._guideTag!==label){g.querySelector('.unit-guide-tag')?.remove();if(label){const [x,y]=center(...v.pos);g.append(element('text',{x,y:y-25,'text-anchor':'middle',class:'unit-guide-tag','aria-hidden':'true'},label));}g._guideTag=label;}
   if(g.classList.contains('observing-unit')!==!!observing)g.classList.toggle('observing-unit',!!observing);
  }
  if(u?.kind==='supply')$('roleBrief').textContent=`Supply squad · ${u.supply_packs} finite packs · adjacent mortars or engineers · 2 AP per delivery`;
  if(state.front_mode==='armored_control'){
   $('objectiveName').textContent='KHARKOV · THREE FLAGS';$('objective').textContent=`Soviets ${state.front_score.us}/10 · Germans ${state.front_score.de}/10`;
   $('missionHint').textContent='Tanks and fighting infantry capture. Fuel 1 · Rail 2 · Works 1 per own turn end. First to 10.';
  }else if(state.front_mode==='evacuation'){
   $('objectiveName').textContent='DUNKIRK · EVACUATION';$('objective').textContent=`Rescued ${state.evacuated_count}/6 · deadline R${state.scenario.rounds}`;
   $('missionHint').textContent='Marked infantry → Load boat → top sea edge → Evacuate. Keep boats alive; rearguards buy time.';
  }
 };
 for(const event of ['ww2:render','ww2:layout','ww2:experience'])document.addEventListener(event,placeHelp);
 document.addEventListener('ww2:playback',()=>{const svg=$('playbackMap');if(svg&&playbackSession)paintMission(svg,playbackSession.frames[playbackSession.index][playbackSession.phase]);});
 document.addEventListener('DOMContentLoaded',syncExperience);
 new MutationObserver(placeHelp).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 syncExperience();
})();
