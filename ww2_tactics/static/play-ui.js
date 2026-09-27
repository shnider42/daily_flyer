/* Presentation preferences and opt-in coaching; all orders still use the live rules engine. */
'use strict';
(()=>{
 const key='ww2-play-preferences';
 let prefs={simple:true,guide:null};
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&typeof saved.simple==='boolean')prefs={simple:saved.simple,guide:saved.guide};}catch{}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}};
 // Distinct silhouettes and plain-language effects supplement color, including on touch screens.
 const actionDesign={
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
   const shortNames={command:'Give actions',inspire:'Rally allies',recon:'Air search',repair:'Repair',airdrop:'Land troops',barrage:'Mortars',grenade:'Grenade',fire:'Fire',assault:'Assault',load:'Load troops',unload:'Unload',overwatch:'Overwatch',dig:'Dig in'};
   const heading=node('span',null,cancel?title:shortNames[id]||title);heading.className='action-name';
   const unit=state?.units.find(u=>u.id===selected),legal=state?.legal[selected];
   const description=window.orderHelp?.(id,unit,legal,prefs.simple)||purpose;
   const effect=node('span',null,cancel?'Return to orders':description);effect.className='action-purpose';copy.append(heading,effect);
   b.replaceChildren(icon,copy);
   if(cost){const badge=node('span',null,`${cost[1]} ${id==='load'||id==='unload'?'infantry ':''}AP`);badge.className='action-cost';b.append(badge);}
   b.setAttribute('aria-label',`${raw}. ${effect.textContent}`);
  }
 }
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 $('selection').after(node('p','unitPurpose','Select a unit to see its name and role'));
 let dock=null,screen=null,anchors=[],sheets=[],lastSimple=null,oldNext=null,guidePresented=null,noticeKey=null,wasPlaying=false,dadOrdersAnchor=null;
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
  smokeMode=false;barrageMode=false;chooseUnit(unit);focusMobile(unit);
 }
 window.ww2Mobile={get active(){return !!dock;},focus:focusMobile,openMenu:()=>openSheet('mobileBattleMenu')};
 function mount(){
  if(dock)return;
  document.body.classList.add('mobile-battle');
  screen=node('section','mobileBattleScreen');screen.setAttribute('aria-label','Battle screen');$('game').append(screen);
  const top=node('header','mobileBattleTop'),menu=node('button','mobileMenuOpen','Battle ☰'),status=node('div','mobileBattleStatus'),guide=node('button','mobileGuideOpen','Learn');
  menu.setAttribute('aria-controls','mobileBattleMenu');menu.setAttribute('aria-haspopup','dialog');guide.setAttribute('aria-controls','mobileGuide');guide.setAttribute('aria-haspopup','dialog');
  status.setAttribute('role','status');menu.onclick=()=>openSheet('mobileBattleMenu');guide.onclick=()=>openSheet('mobileGuide');top.append(status,guide,menu);screen.append(top);
  move($('orderHistory'),top);top.insertBefore($('orderHistory'),guide);
  move($('mapWrap'),screen);
  dock=node('section','mobileOrderDock');dock.setAttribute('aria-label','Selected unit orders');
  const head=node('div','mobileOrderHead'),toggle=node('button','mobileOrderToggle','Select a unit');
  toggle.setAttribute('aria-controls','mobileUnitDetails');toggle.setAttribute('aria-haspopup','dialog');toggle.title='Unit details and odds';toggle.onclick=()=>{if(window.ww2Dad?.enabled)window.ww2Dad.inspect();else openSheet('mobileUnitDetails');};head.append(toggle);
  const body=node('div','mobileOrderBody');dock.append(head,body);screen.append(dock);
  move($('end'),head);move($('orders'),body);
  const dadOpen=node('button','dadOrdersOpen','Orders');dadOpen.hidden=true;dadOpen.setAttribute('aria-controls','dadOrders');dadOpen.setAttribute('aria-haspopup','dialog');dadOpen.onclick=()=>openSheet('dadOrders');body.append(dadOpen);
  const dadOrders=sheet('dadOrders','Unit orders');
  dadOrders.addEventListener('click',event=>{if(event.target.closest('#orders button:not(:disabled)'))dadOrders.close();},true);
  move($('hint'),body);body.prepend($('hint'));
  const detail=sheet('mobileUnitDetails','Unit details');detail.append(node('h2','unitDetailTitle','Unit details & odds'));
  for(const id of ['unitPurpose','roleBrief','unitMechanics','odds','simpleOutcome'])move($(id),detail);
  const nav=node('nav','mobileUnitNav');nav.setAttribute('aria-label','Unit and map navigation');screen.append(nav);
  const prev=node('button','previousUnit','‹'),roster=node('button','mobileRosterOpen','Your units');prev.setAttribute('aria-label','Previous ready unit');prev.onclick=()=>cycleUnit(-1);roster.onclick=()=>openSheet('mobileRoster');
  roster.setAttribute('aria-controls','mobileRoster');roster.setAttribute('aria-haspopup','dialog');
  nav.append(prev,roster);move($('nextUnit'),nav);oldNext=$('nextUnit').onclick;$('nextUnit').onclick=()=>cycleUnit(1);
  move($('findUnit'),nav);move($('zoom'),nav);screen.append(nav);
  const troops=sheet('mobileRoster','Your units');move($('platoonFilters'),troops);move($('roster'),troops);
  const settings=sheet('mobileBattleMenu','Battle & settings');
  for(const selector of ['.game-title','.status-line','#turnBanner','.mission','#missionHint','#waiting','#incoming','#battleReport','#rematchProposal','#playTools','#battleOptions','#replayTurn','#rulesButton','#homeBattles','#supportStatus','.team-legend','.terrain-legend','#combat','#computerReview','.journal','#seriesScore'])move(document.querySelector(selector),settings);
  $('battleOptions').open=true;
  const guideSheet=sheet('mobileGuide','Learn as you play');move($('tutorialCoach'),guideSheet);
  move($('playbackPanel'),screen);
  requestAnimationFrame(()=>{if(dock)focusMobile(state?.units.find(u=>u.id===selected)||state?.units.find(u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id));});
 }
 const lessons=[
  ['Your mission','Find the ★ objective. Americans win by holding it at the end of two consecutive American turns. Germans must prevent that until the final round. Either army can also win by eliminating the enemy.','.mission'],
  ['Choose your unit','Tap one of your counters on the map, or open Your units. Its name and all available actions stay beside the map. The arrows find your next ready unit. Tap the unit name for details. AP means action points.','#map'],
  ['Move into position','With your unit selected, tap a highlighted neighboring hex to move. Woods and buildings cost more but offer cover. Orange move hexes warn of enemy overwatch. Connected roads can grant one extra hex each turn.','#map'],
  ['Spend actions, not dice','Squads and MGs start with 2 AP; lieutenants start with 3. Available orders are shown for your selected unit. Select an enemy to see attacks. You can learn the flow without reading the dice math.','#orders'],
  ['Cover and attacks','Fire costs 2 AP and may miss. Cover makes units harder to hit; smoke blocks shots. An MG can suppress to pin a visible enemy without damage. Pinned troops must rally before moving or attacking. If no attack is available, keep advancing or skip this tip.','#orders'],
  ['Watch the other side','End turn when ready. In solo play the computer responds, then you can pause, step through, or skip its replay. In DSL, unused AP can carry over: up to 1 per unit, or 2 for a lieutenant.','#end'],
  ['Your specialist tools','Squads carry smoke and a frag grenade. Lieutenants can rally nearby troops, call delayed mortars, or spend 2 AP on “On your feet” for eligible adjacent squad/MG units in their platoon. Incoming mortars threaten both armies: move clear!','#orders'],
  ['You are in command','Keep checking the objective, not just enemy losses. In the Battle menu, turn Simple view off whenever you want odds, modifiers and logs. The menu also holds terrain and unit styles, save codes and this guide. Finish to keep playing normally.','#simpleToggle']
 ];
 function guideActive(){return prefs.guide?.code===session?.code&&prefs.guide?.battle===(state?.battle_number||1)&&Number.isInteger(prefs.guide.step)&&prefs.guide.step>=0&&prefs.guide.step<lessons.length;}
 function startGuide(){prefs.guide={code:session.code,battle:state.battle_number||1,step:0,since:state.revision};save();sync();}
 function clearFocus(){document.querySelectorAll('.lesson-focus').forEach(n=>n.classList.remove('lesson-focus'));}
 function sync(){
  document.body.classList.toggle('simple-play',prefs.simple);
  if(lastSimple!==prefs.simple){$('battleOptions').open=!!dock||!prefs.simple;lastSimple=prefs.simple;}
  $('simpleToggle').textContent=`Simple view: ${prefs.simple?'on':'off'}`;$('simpleToggle').setAttribute('aria-pressed',String(prefs.simple));
  if(!state||$('game').hidden){unmount();return;}
  // Desktop restores its anchors before mobile is allowed to move the same controls.
  if(!matchMedia('(min-width:1100px)').matches&&window.ww2Desktop?.active)return;
  const mobile=!matchMedia('(min-width:1100px)').matches&&state.ruleset==='dsl';
  if(mobile){mount();dock.hidden=!!playbackSession;dock.inert=!!playbackSession;document.body.classList.toggle('mobile-replaying',!!playbackSession);
   const dad=!!window.ww2Dad?.enabled;$('dadOrdersOpen').hidden=!dad;
   if(dad&&!dadOrdersAnchor){dadOrdersAnchor=document.createComment('Dad orders anchor');$('orders').before(dadOrdersAnchor);$('dadOrders').append($('orders'));}
   if(!dad)restoreDadOrders();
   const unit=state.units.find(u=>u.id===selected&&u.hp>0);
   const title=node('strong',null,unit?unitTypeName(unit):'Select a unit');title.className='selected-unit-name';
   const meta=node('span',null,unit?`${unit.platoon?unit.platoon+unit.number+' · ':''}${unit.hp}${unit.max_hp?'/'+unit.max_hp:''} ${state.naval_version?'HP':'strength'} · ${unit.ap} AP${unit.carrier_id?' · ABOARD':unit.reserve?' · RESERVE':unit.pinned?' · PINNED':''}`:'Tap the map or open Your units');meta.className='selected-unit-meta';
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
   $('mobileBattleStatus').replaceChildren(node('strong',null,playbackSession?'Computer replay':state.winner?`${sideLabel(state.winner)} win`:!state.ready?'Waiting for opponent':state.turn===state.side?'Your turn':'Opponent’s turn'),node('span',null,`${sideLabel(state.side)} · Round ${$('round').textContent}`));
  }else unmount();
  if(prefs.simple){
   for(const [id,label] of [['fire','Fire'],['assault','Assault'],['grenade','Frag']])if(!$(id).hidden)$(id).textContent=`${label} · 2 actions`;
   if($('hint').textContent.startsWith('Fire at '))$('hint').textContent='Target in sight. Choose an available attack.';
  }
  $('simpleOutcome').hidden=!prefs.simple||!state.last_combat||!!playbackSession;
  styleActions();
  if(dock){
   const columns=innerWidth<360?2:3,buttons=[...$('orders').querySelectorAll('button')].filter(b=>!b.hidden&&!b.closest('[hidden]'));
   $('dadOrdersOpen').disabled=!!playbackSession||!buttons.length;$('dadOrdersOpen').textContent=buttons.length?`Orders · ${buttons.length} available`:'Select a unit for orders';
   const rows=String(Math.max(columns===2?4:3,Math.ceil(buttons.length/columns)));
   if(screen.style.getPropertyValue('--order-rows')!==rows)screen.style.setProperty('--order-rows',rows);
   if(state.last_combat?.revision===state.revision&&!smokeMode&&!barrageMode&&!target&&!$('hint').textContent.startsWith('Tap a marked'))$('hint').textContent=state.last_combat.result;
  }
  $('simpleOutcome').textContent=state.last_combat?.result||'';
  $('guideToggle').hidden=state.ruleset!=='dsl'||!!state.naval_version;
  const active=guideActive();
  if(active&&!playbackSession){const g=prefs.guide;
   if(g.step===2&&(state.action_history||[]).some(h=>h.revision>g.since&&h.side===state.side&&h.action.kind==='move')){g.step++;g.since=state.revision;clearFocus();save();}
  }
  $('guideToggle').setAttribute('aria-pressed',String(active));$('guideToggle').textContent=active?'Hide learning guide':'Learn as you play';
  $('tutorialCoach').hidden=!active||!!playbackSession;
  if(active){const step=prefs.guide.step,[title,text]=lessons[step];$('lessonCount').textContent=`FIELD TRAINING · ${step+1} / ${lessons.length}`;$('lessonTitle').textContent=title;$('lessonText').textContent=text;$('lessonBack').disabled=step===0;$('lessonNext').textContent=step===lessons.length-1?'Finish guide':'Next tip →';}
  if(dock){
   $('mobileGuideOpen').hidden=!active||!!playbackSession;$('mobileGuideOpen').textContent=active?`Learn ${prefs.guide.step+1}/${lessons.length}`:'Learn';
   if(!active)$('mobileGuide').close();
   const key=`${session.code}:${state.battle_number||1}`;
   if(active&&guidePresented!==key&&!playbackSession){guidePresented=key;openSheet('mobileGuide');}
   const notice=`${key}:${state.winner||''}:${JSON.stringify(state.rematch||null)}:${state.ready}`;
   if(notice!==noticeKey){noticeKey=notice;if(state.winner||state.rematch||!state.ready)openSheet('mobileBattleMenu');}
   if(playbackSession&&!wasPlaying)for(const s of sheets)s.close();
   wasPlaying=!!playbackSession;
  }
 }
 $('simpleToggle').onclick=()=>{prefs.simple=!prefs.simple;save();if(playbackSession){sync();drawPlayback();}else render();};
 $('guideToggle').onclick=()=>{clearFocus();if(guideActive()){prefs.guide=null;save();sync();}else{startGuide();if(dock)openSheet('mobileGuide');}};
 $('lessonNext').onclick=()=>{if(!guideActive())return;clearFocus();prefs.guide.since=state.revision;if(++prefs.guide.step===lessons.length){prefs.guide=null;notify('Training complete. Keep playing—and reopen the guide any time.');}save();sync();};
 $('lessonBack').onclick=()=>{if(!guideActive())return;clearFocus();prefs.guide.since=state.revision;prefs.guide.step=Math.max(0,prefs.guide.step-1);save();sync();};
 $('lessonExit').onclick=()=>{clearFocus();prefs.guide=null;save();sync();};
 $('lessonShow').onclick=()=>{if(!guideActive())return;clearFocus();const selector=lessons[prefs.guide.step][2];const target=document.querySelector(dock&&selector==='#map'?'#mapWrap':selector);target?.classList.add('lesson-focus');if(dock){$('mobileGuide').close();if(target?.closest('#mobileBattleMenu'))openSheet('mobileBattleMenu');else if(target?.closest('#dadOrders'))openSheet('dadOrders');}else target?.scrollIntoView({block:'center',behavior:'auto'});};
 $('learnStart').onclick=()=>run(async()=>{remember(await api('/api/match',{ruleset:'dsl',opponent:'computer',scenario:'village'}));prefs.simple=true;prefs.guide={code:session.code,battle:1,step:0,since:0};save();});
 document.addEventListener('ww2:before-layout',unmount);
 document.addEventListener('ww2:render',sync);
 document.addEventListener('ww2:selection',()=>{if(selected&&!playbackSession){if(guideActive()&&prefs.guide.step===1){prefs.guide.step=2;prefs.guide.since=state.revision;clearFocus();save();sync();}}});
 document.addEventListener('ww2:playback',sync);
 matchMedia('(min-width:1100px)').addEventListener('change',sync);
 window.addEventListener('resize',()=>{if(dock)sync();});
 new MutationObserver(()=>{if($('game').hidden)unmount();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 $('roster').addEventListener('click',event=>{if(dock&&event.target.closest('button')){$('mobileRoster').close();focusMobile(state.units.find(u=>u.id===selected));}});
 sync();
})();
