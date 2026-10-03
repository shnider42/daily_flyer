/* Presentation preferences and mobile layout; all orders use the live rules engine. */
'use strict';
(()=>{
 const key='ww2-play-preferences';
 const levels=['simple','moderate','expert'],layouts=['map-first','panels'];
 let prefs={version:2,experience:'simple',layout:'map-first',simple:true};
 try{const saved=JSON.parse(localStorage.getItem(key));
  if(saved?.version===2){prefs.experience=levels.includes(saved.experience)?saved.experience:'simple';prefs.layout=layouts.includes(saved.layout)?saved.layout:'map-first';}
  else if(saved&&(typeof saved.simple==='boolean'||['on','off','experimental'].includes(saved.mode))){const mode=['on','off','experimental'].includes(saved.mode)?saved.mode:saved.simple?'on':'off';prefs.experience=mode==='off'?'expert':'simple';prefs.layout=mode==='experimental'?'map-first':'panels';}
 }catch{}
 prefs.simple=prefs.experience!=='expert';
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}};
 // Distinct silhouettes and plain-language effects supplement color, including on touch screens.
 const actionDesign={
  resupply:['green','Deliver finite mortar shells or repair kits','M4 6h16v15H4ZM4 6l8-4 8 4M12 2v19M4 12h16'],
  evacuate:['teal','Rescue one marked infantry passenger','M3 15h18l-4 6H7ZM12 15V3M7 8l5-5 5 5'],
  callAirborne:['teal','Call one finite reserve squad to any hex','M3 10a9 9 0 0 1 18 0H3ZM3 10l9 9 9-9M12 10v9M9 19h6v3H9Z'],
  markLZ:['amber','Reduce nearby drop scatter','M12 2v20M4 20h16M12 3q9 1 9 9M12 7q5 1 5 5'],
  radioUpdate:['teal','Share dated contact reports','M6 20V8h12v12H6ZM10 8V2M9 12h6M9 16h2M15 16h1M15 3q7 2 6 8'],
  observe:['blue','Extend sight, not weapon range','M3 19V8h6v11H3ZM15 19V8h6v11h-6ZM9 12h6M6 8V5M18 8V5'],
  conceal:['earth','Hide in cover until moving or firing','M3 18l7-13 4 6 4-4 3 11H3ZM9 18v-5M15 18v-4'],
  mortarFire:['indigo','Delayed fire on spotted or reported ground','M5 20h14M8 18l8-13 3 2-8 13M16 3l4 2M4 9h3'],
  demolition:['orange','Limited anti-armor charge, adjacent only','M5 9h14v12H5ZM8 9V5h8v4M12 9v12M16 4q-1-4 4-3'],
  breach:['earth','Open a hedgerow for vehicles and fire','M3 4v16M21 4v16M3 12h6M15 12h6M9 8l6 8M15 8l-6 8'],
  clearWreck:['amber','Clear a collapsed building','M3 19h18M5 17l5-8 8 8M14 3l6 6M17 6L9 14'],
  bridgeGap:['blue','Bridge one hex of water','M3 20V8M21 20V8M3 12h18M7 12v7M17 12v7M3 8Q12 2 21 8'],
  areaFire:['orange','Aim at an empty or occupied hex','M12 2v5M12 17v5M2 12h5M17 12h5M5 5h14v14H5Z'],
  repairTank:['green','Restore tank strength and movement','M3 9h18v10H3ZM7 5h10M12 6v11M8 13h8'],
  snipe:['red','Accurate shot; exposes your team','M12 2v5M12 17v5M2 12h5M17 12h5M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M12 10v4M10 12h4'],
  loadAP:['indigo','Pierce armor','M5 20V7l4-4 4 4v13H5ZM5 14h8M17 6v14M16 7h4'],
  loadHE:['orange','Blast infantry; nearby troops at risk','M5 20V7l4-4 4 4v13H5ZM5 14h8M18 6v5M16 9h5M16 16l5 4M21 16l-5 4'],
  repairTracks:['green','Restore movement; gun stays operational','M4 7h16v11H4ZM7 7v11M17 7v11M9 12h6M12 9v6'],
  bombard:['rust','Fire at an unseen hex','M3 18l13-9 3 3-13 9M15 4h6M18 1v6M4 10l4 3'],
  artillery:['orange','Long-range delayed strike','M3 18l13-9 3 3-13 9M15 3l5 4M5 4v5M2 7h6'],
  fieldRecon:['teal','Reveal a distant area','M3 12l7-2 2-7 2 7 7 2-7 2-2 7-2-7-7-2Z'],
  rearm:['green','Reload bombs and repair at a friendly airfield','M4 7h16v12H4ZM8 3v4M16 3v4M8 13h8M12 9v8'],
  load:['blue','Board one friendly infantry unit; costs infantry AP','M3 7h11v13H3ZM17 5l4 4-4 4M10 9h11'],
  unload:['teal','Disembark onto adjacent land; costs infantry AP','M3 7h11v13H3ZM17 12l4 4-4 4M10 16h11'],
  recon:['teal','Reveal nearby sea contacts','M3 12l7-2 2-7 2 7 7 2-7 2-2 7-2-7-7-2Z'],
  airstrike:['red','Attack a spotted ship','M3 5l9 5 9-5-5 9-4-2-4 2-5-9ZM12 15v6M9 19l3 3 3-3'],
  torpedo:['indigo','Heavy anti-ship attack','M3 10h13l5 2-5 2H3v-4ZM6 8v8M1 9v6'],
  repair:['green','Restore damaged hull','M5 3l5 5-2 3 10 10 3-3-10-10 1-3-7-2Z'],
  airdrop:['teal','Deploy airborne reserve','M3 10a9 8 0 0 1 18 0H3ZM3 10l7 9h4l7-9M12 10v9M9 21h6'],
  dig:['earth','Gain cover','M4 18h16M8 18v-5l5-8 4 3-5 8H8M12 6l2-3 4 3-2 3'],
  smoke:['slate','Block sight','M7 18h10a4 4 0 0 0 1-8 6 6 0 0 0-11-2 5 5 0 0 0 0 10M9 4l1-2M15 4l1-2'],
  overwatch:['amber','Shoot moving enemies','M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12ZM12 9v6M9 12h6'],
  fire:['red','Shoot selected enemy','M12 2v5M12 17v5M2 12h5M17 12h5M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0'],
  assault:['rust','Risky close attack','M5 3l13 13M3 5l13 13M14 19l5-5M17 17l4 4M19 3L6 16M3 17l4 4'],
  grenade:['orange','Blast · damage + pin','M9 7h6l3 5-1 7H7l-1-7 3-5ZM10 7V4h6l3 3M9 12h6M9 16h6'],
  suppress:['violet','Pin · no damage','M4 6h16M7 10h10M10 14h4M12 14v7M9 18l3 3 3-3'],
  rally:['green','Remove this unit’s pin','M12 20V4M6 10l6-6 6 6M4 20h16'],
  inspire:['teal','Unpin nearby allies','M12 4v9M8 8l4-4 4 4M4 17h6M14 17h6M7 14v6M17 14v6'],
  barrage:['indigo','Delayed area pin','M4 4l8 8M8 3l6 6M12 17l2-4 3-1M7 20l3-3M16 20l-1-3M21 15l-3 1M20 8l-3 3'],
  command:['blue','Give nearby troops AP','M4 9h5l10-5v16L9 15H4V9ZM7 15l2 6h4l-2-5']
 };
 function styleActions(){
  const buttons=Object.keys(actionDesign).filter(id=>id!=='command').map(id=>[$(id),id]);
  for(const b of $('commandOrders').querySelectorAll('button'))buttons.push([b,'command']);
  for(const [b,id] of buttons){
   if(!b||b.hidden)continue;
   const raw=b.querySelector('.action-copy')?b.dataset.orderLabel:b.textContent;
   b.dataset.orderLabel=raw;
   const cancel=raw.startsWith('Cancel'),[tone,purpose,path]=actionDesign[id];
   b.classList.add('tactical-action');b.dataset.tone=cancel?'slate':tone;
   b.classList.toggle('cancel-order',cancel);
   const cost=raw.match(/ · (\d+) (?:actions?|AP)$/);
   const title=cost?raw.slice(0,cost.index):raw;
   const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
   icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('action-icon');
   const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d',cancel?'M5 5l14 14M19 5L5 19':path);icon.append(shape);
   const copy=node('span');copy.className='action-copy';
   const unit=state?.units.find(u=>u.id===selected),legal=state?.legal[selected];
   const shortNames={command:'Give actions',inspire:'Rally allies',recon:'Air search',repair:'Repair hull',airdrop:'Land troops',barrage:'Mortars',grenade:'Grenade',fire:'Fire at unit',assault:'Close assault',load:'Load troops',unload:'Unload',overwatch:'Overwatch',dig:'Dig in'};
   if(state?.air_version||state?.joint_ops_version&&['fighter','bomber','aa_gun'].includes(unit?.kind)){shortNames.overwatch=unit?.kind==='aa_gun'?'AA cover':'Intercept';shortNames.fire=unit?.kind==='bomber'?'Bomb':'Fire';shortNames.rearm='Service';}
   if(state?.joint_ops_version)shortNames.airstrike='Carrier strike';
   const heading=node('span',null,cancel?title:shortNames[id]||title);heading.className='action-name';
   const description=window.orderHelp?.(id,unit,legal,prefs.experience==='simple')||purpose;
   const effect=node('span',null,cancel?'Return to orders':description);effect.className='action-purpose';copy.append(heading,effect);
   if(b.dataset.orderReason){const reason=node('span',null,b.dataset.orderReason);reason.className='action-reason';copy.append(reason);}
   b.replaceChildren(icon,copy);
   if(cost){const badge=node('span',null,`${cost[1]} ${id==='load'||id==='unload'?'infantry ':''}AP`);badge.className='action-cost';b.append(badge);}
   b.setAttribute('aria-label',`${raw}. ${effect.textContent}${b.dataset.orderReason?'. Unavailable: '+b.dataset.orderReason:''}`);
  }
 }
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 $('selection').after(node('p','unitPurpose','Select a unit to see its name and role'));
 let dock=null,screen=null,anchors=[],sheets=[],lastSimple=null,oldNext=null,noticeKey=null,wasPlaying=false,dadOrdersAnchor=null;
 function restoreDadOrders(){if(dadOrdersAnchor){dadOrdersAnchor.replaceWith($('orders'));dadOrdersAnchor=null;}$('dadOrders')?.close();}
 function move(n,to){const anchor=document.createComment('mobile orders anchor');n.before(anchor);anchors.push([n,anchor]);to.append(n);}
 function openSheet(id){if(playbackSession){playbackSession.paused=true;clearTimeout(playbackTimer);$('pausePlayback').textContent='Resume';}for(const sheet of sheets)if(sheet.id!==id)sheet.close();const sheet=$(id);if(sheet&&!sheet.open)sheet.showModal();}
 function sheet(id,title){const d=node('dialog',id);d.className='mobile-battle-sheet';d.setAttribute('aria-label',title);const h=node('div');h.className='mobile-sheet-heading';const close=node('button',id+'Close','Back to battle');close.onclick=()=>d.close();h.append(node('h2',null,title),close);d.append(h);document.body.append(d);sheets.push(d);return d;}
 function unmount(){
  restoreDadOrders();
  for(const s of sheets)s.close();
  if(oldNext){$('nextUnit').onclick=oldNext;oldNext=null;$('nextUnit').textContent='Next unit →';$('nextUnit').removeAttribute('aria-label');}
  for(const [n,a] of anchors)a.replaceWith(n);anchors=[];
  for(const s of sheets)s.remove();sheets=[];screen?.remove();screen=null;dock=null;
  document.body.classList.remove('mobile-battle','mobile-replaying');
 }
 function focusMobile(unit){
  if(!dock||!unit)return;
  const wrap=$('mapWrap'),svg=$('playbackMap')||$('map'),matrix=svg.getScreenCTM();if(!matrix)return;
  const [x,y]=center(...unit.pos),point=new DOMPoint(x,y).matrixTransform(matrix),r=wrap.getBoundingClientRect();
  wrap.scrollBy({left:point.x-r.left-wrap.clientWidth/2,top:point.y-r.top-wrap.clientHeight/2,behavior:'auto'});
 }
 function cycleUnit(direction){
  if(busy||playbackSession)return;
  const alive=state.units.filter(u=>u.side===state.side&&u.hp>0);
  const ready=alive.filter(u=>Object.values(state.legal[u.id]||{}).some(v=>Array.isArray(v)?v.length:v===true));
  const pool=ready.length?ready:alive;if(!pool.length)return;
  const index=pool.findIndex(u=>u.id===selected),unit=pool[(index<0?(direction>0?0:pool.length-1):(index+direction+pool.length)%pool.length)];
  smokeMode=false;barrageMode=false;combatMode=null;chooseUnit(unit);focusMobile(unit);
 }
 window.ww2Mobile={get active(){return !!dock;},focus:focusMobile,openMenu:()=>openSheet('mobileBattleMenu'),openGuide:()=>openSheet('mobileGuide'),openSheet};
 function mount(){
  if(dock)return;
  document.body.classList.add('mobile-battle');
  screen=node('section','mobileBattleScreen');screen.setAttribute('aria-label','Battle screen');$('game').append(screen);
  const top=node('header','mobileBattleTop'),menu=node('button','mobileMenuOpen','Battle'),status=node('div','mobileBattleStatus');
  menu.setAttribute('aria-controls','mobileBattleMenu');menu.setAttribute('aria-haspopup','dialog');
  status.setAttribute('role','status');menu.onclick=()=>openSheet('mobileBattleMenu');top.append(status,menu);screen.append(top);
  move($('orderHistory'),top);
  move($('mapWrap'),screen);
  dock=node('section','mobileOrderDock');dock.setAttribute('aria-label','Selected unit orders');
  const head=node('div','mobileOrderHead'),toggle=node('button','mobileOrderToggle','Select a unit');
  toggle.setAttribute('aria-controls','mobileUnitDetails');toggle.setAttribute('aria-haspopup','dialog');toggle.title='Unit details and odds';toggle.onclick=()=>{if(window.ww2Dad?.enabled)window.ww2Dad.inspect();else openSheet('mobileUnitDetails');};head.append(toggle);
  const body=node('div','mobileOrderBody');dock.append(head,body);screen.append(dock);
  move($('end'),head);move($('orders'),body);
  const dadOpen=node('button','dadOrdersOpen','Orders');dadOpen.hidden=true;dadOpen.setAttribute('aria-controls','dadOrders');dadOpen.setAttribute('aria-haspopup','dialog');dadOpen.onclick=()=>openSheet('dadOrders');body.append(dadOpen);
  const dadOrders=sheet('dadOrders','Unit orders');
  dadOrders.addEventListener('click',event=>{if(event.target.closest('#orders button:not(:disabled):not([aria-disabled="true"])'))dadOrders.close();},true);
  move($('hint'),body);body.prepend($('hint'));
  const detail=sheet('mobileUnitDetails','Unit details');detail.append(node('h2','unitDetailTitle','Unit details & odds'));
  for(const id of ['unitPurpose','roleBrief','unitMechanics','odds','simpleOutcome'])move($(id),detail);
  const nav=node('nav','mobileUnitNav');nav.setAttribute('aria-label','Unit and map navigation');screen.append(nav);
  const prev=node('button','previousUnit','‹'),roster=node('button','mobileRosterOpen','Your units');prev.setAttribute('aria-label','Previous ready unit');prev.onclick=()=>cycleUnit(-1);roster.onclick=()=>openSheet('mobileRoster');
  roster.setAttribute('aria-controls','mobileRoster');roster.setAttribute('aria-haspopup','dialog');
  nav.append(prev,roster);move($('nextUnit'),nav);oldNext=$('nextUnit').onclick;$('nextUnit').onclick=()=>cycleUnit(1);
  move($('findUnit'),nav);move($('zoom'),nav);screen.append(nav);
  const troops=sheet('mobileRoster','Your units');move($('platoonFilters'),troops);move($('roster'),troops);
  const settings=sheet('mobileBattleMenu','Battle & reports');
  for(const selector of ['.game-title','.status-line','#turnBanner','.mission','#missionHint','#waiting','#incoming','#signalNotice','#airliftReport','#battleReport','#rematchProposal','#battleOptions','#replayTurn','#supportStatus','.team-legend','.terrain-legend','#combat','#computerReview','.journal','#seriesScore'])move(document.querySelector(selector),settings);
  $('battleOptions').open=true;
  const guideSheet=sheet('mobileGuide','Field coach');move($('tutorialCoach'),guideSheet);
  move($('playbackPanel'),screen);
  requestAnimationFrame(()=>{if(dock)focusMobile(state?.units.find(u=>u.id===selected)||state?.units.find(u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id));});
 }
 function sync(){
  document.body.classList.toggle('simple-play',prefs.simple);
  document.body.classList.toggle('experimental-play',prefs.layout==='map-first');
  document.body.dataset.experience=prefs.experience;
  if(lastSimple===null){$('battleOptions').open=!!dock||!prefs.simple;lastSimple=prefs.simple;}
  for(const select of document.querySelectorAll('[data-experience-select]'))select.value=prefs.experience;
  $('battleLayout').value=prefs.layout;
  for(const note of document.querySelectorAll('[data-experience-note]'))note.textContent={simple:'Basic instructions, one decision at a time. All orders stay available.',moderate:'DSL tactics explained as you go, with attack odds and status detail.',expert:'Exact rules, modifiers and interactions for experienced players.'}[prefs.experience];
  if(!state||$('game').hidden){unmount();return;}
  // Desktop restores its anchors before mobile is allowed to move the same controls.
  if(!matchMedia('(min-width:1100px)').matches&&window.ww2Desktop?.active)return;
  const mobile=!matchMedia('(min-width:1100px)').matches&&state.ruleset==='dsl';
  if(mobile){mount();dock.hidden=!!playbackSession;dock.inert=!!playbackSession;document.body.classList.toggle('mobile-replaying',!!playbackSession);
   const dad=!!window.ww2Dad?.enabled,sheetOrders=dad||prefs.layout==='map-first';$('dadOrdersOpen').hidden=!sheetOrders;
   if(sheetOrders&&!dadOrdersAnchor){dadOrdersAnchor=document.createComment('Dad orders anchor');$('orders').before(dadOrdersAnchor);$('dadOrders').append($('orders'));}
   if(!sheetOrders)restoreDadOrders();
   const unit=state.units.find(u=>u.id===selected&&u.hp>0);
   const title=node('strong',null,unit?unitTypeName(unit):'Select a unit');title.className='selected-unit-name';
   const meta=node('span',null,unit?`${unit.platoon?unit.platoon+unit.number+' · ':''}${unit.hp}${unit.max_hp?'/'+unit.max_hp:''} ${state.naval_version?'HP':'strength'} · ${unit.ap} AP${unit.carrier_id?' · ABOARD':unit.reserve?(unit.arrival_round?' · ARRIVES R'+unit.arrival_round:' · RESERVE'):unit.immobilized?' · TRACKS DISABLED':unit.pinned?' · PINNED':''}${unit.ammo?' · '+unit.ammo.toUpperCase()+' loaded':''}`:'Tap the map or open Your units');meta.className='selected-unit-meta';
   $('mobileOrderToggle').replaceChildren(title,meta);
   if(dad){const inspected=state.units.find(u=>u.id===target&&u.hp>0)||unit;if(inspected){const portrait=window.makeUnitPortrait?.(inspected);if(portrait)$('mobileOrderToggle').prepend(portrait);if(inspected!==unit){title.textContent=`Target: ${unitTypeName(inspected)}`;meta.textContent=`${sideLabel(inspected.side)} · ${inspected.hp} ${state.naval_version?'HP':'strength'} · your unit: ${unit?unitTypeName(unit):'none'}`;}}}
   $('unitDetailTitle').textContent=unit?unitName(unit):'Unit details & odds';
   $('mobileOrderToggle').setAttribute('aria-label',`${!dad&&unit?unitName(unit)+'. ':''}${$('mobileOrderToggle').textContent}. ${dad?'Open enlarged unit picture and details':'Open unit details and odds'}`);
   $('mobileOrderToggle').disabled=!unit&&!(dad&&state.units.some(u=>u.id===target));
   $('mobileOrderToggle').setAttribute('aria-controls',dad?'dadUnitDetails':'mobileUnitDetails');
   $('dadOrders').querySelector('h2').textContent=unit?unitName(unit):'Select your unit';
   // The fixed mobile grid never scrolls horizontally. Writing scrollLeft here
   // forced layout halfway through updating a large SVG battlefield.
   $('nextUnit').textContent='›';$('nextUnit').setAttribute('aria-label','Next ready unit');
   $('previousUnit').disabled=$('nextUnit').disabled=busy||!!playbackSession||!state.units.some(u=>u.side===state.side&&u.hp>0);
   $('mobileRosterOpen').disabled=!!playbackSession;$('findUnit').textContent='Find';$('findUnit').hidden=false;$('findUnit').disabled=!unit||!!playbackSession;
   $('zoom').textContent=$('mapWrap').classList.contains('enlarged')?'Fit map':'Detail';
   if(!window.ww2Briefing)$('mobileBattleStatus').replaceChildren(node('strong',null,playbackSession?'Computer replay':state.winner?`${sideLabel(state.winner)} win`:!state.ready?'Waiting for opponent':state.turn===state.side?'Your turn':'Opponent’s turn'),node('span',null,`${sideLabel(state.side)} · Round ${$('round').textContent}`));
  }else unmount();
  if(prefs.simple){
   for(const [id,label] of [['fire','Fire'],['assault','Assault'],['grenade','Frag']])if(!$(id).hidden)$(id).textContent=`${label} · 2 actions`;
   if($('hint').textContent.startsWith('Fire at '))$('hint').textContent='Target in sight. Choose an available attack.';
  }
  $('simpleOutcome').hidden=!prefs.simple||!state.last_combat||!!playbackSession;
  styleActions();
  if(dock){
   const columns=innerWidth<360?2:3,buttons=[...$('orders').querySelectorAll('button')].filter(b=>!b.hidden&&!b.closest('[hidden]'));
   const ready=buttons.filter(b=>!b.disabled&&b.getAttribute('aria-disabled')!=='true').length;
   $('dadOrdersOpen').disabled=!!playbackSession||!buttons.length;$('dadOrdersOpen').textContent=buttons.length?`Orders · ${ready} ready / ${buttons.length}`:'Select a unit for orders';
   // Reserve the army's largest role, even before selection. Revealing orders
   // never changes the map's height or pushes it away from a player's finger.
   const capacity=window.unitOrderCapabilities?Math.max(0,...state.units.filter(u=>u.side===state.side).map(u=>unitOrderCapabilities(u).length)):0;
   const rows=String(Math.max(columns===2?4:3,Math.ceil(Math.max(buttons.length,capacity)/columns)));
   if(screen.style.getPropertyValue('--order-rows')!==rows)screen.style.setProperty('--order-rows',rows);
   if(state.last_combat?.revision===state.revision&&!smokeMode&&!barrageMode&&!combatMode&&!target&&!state.units.find(u=>u.id===selected)?.immobilized&&!$('hint').classList.contains('building-warning')&&!$('hint').textContent.startsWith('Tap a marked'))$('hint').textContent=state.last_combat.result;
  }
  $('simpleOutcome').textContent=state.last_combat?.result||'';
  if(dock){
   const key=`${session.code}:${state.battle_number||1}`;
   const notice=`${key}:${state.winner||''}:${JSON.stringify(state.rematch||null)}:${state.ready}`;
   if(notice!==noticeKey){noticeKey=notice;if(state.rematch||!state.ready&&state.deployment?.phase!=='planning')openSheet('mobileBattleMenu');}
   if(playbackSession&&!wasPlaying)for(const s of sheets)s.close();
   wasPlaying=!!playbackSession;
  }
 }
 function applyPreferences(){
  prefs.simple=prefs.experience!=='expert';save();
  if(playbackSession){sync();drawPlayback();}else if(state&&!$('game').hidden)render();else sync();
  document.dispatchEvent(new Event('ww2:experience'));
 }
 window.ww2Experience={get level(){return prefs.experience;},get layout(){return prefs.layout;},set(level){if(!levels.includes(level))return;prefs.experience=level;applyPreferences();},setLayout(layout){if(!layouts.includes(layout))return;prefs.layout=layout;applyPreferences();}};
 // Compatibility for existing integrations; no old mode labels in the UI.
 window.ww2ViewMode={get mode(){return prefs.layout==='map-first'?'experimental':prefs.simple?'on':'off';},set(mode){if(!['on','off','experimental'].includes(mode))return;prefs.experience=mode==='off'?'expert':'simple';prefs.layout=mode==='experimental'?'map-first':'panels';applyPreferences();}};
 for(const select of document.querySelectorAll('[data-experience-select]'))select.onchange=()=>ww2Experience.set(select.value);
 $('battleLayout').onchange=()=>ww2Experience.setLayout($('battleLayout').value);
 document.addEventListener('ww2:before-layout',unmount);
 document.addEventListener('ww2:render',sync);
 document.addEventListener('ww2:playback',sync);
 matchMedia('(min-width:1100px)').addEventListener('change',sync);
 window.addEventListener('resize',()=>{if(dock)sync();});
 new MutationObserver(()=>{if($('game').hidden)unmount();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 $('roster').addEventListener('click',event=>{if(dock&&event.target.closest('button')){$('mobileRoster').close();focusMobile(state.units.find(u=>u.id===selected));}});
 sync();
})();
