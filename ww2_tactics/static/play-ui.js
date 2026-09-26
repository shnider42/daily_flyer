/* Presentation preferences and opt-in coaching; all orders still use the live rules engine. */
'use strict';
(()=>{
 const key='ww2-play-preferences';
 let prefs={simple:false,guide:null};
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&typeof saved.simple==='boolean')prefs={simple:saved.simple,guide:saved.guide};}catch{}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}};
 // Distinct silhouettes and plain-language effects supplement color, including on touch screens.
 const actionDesign={
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
   if(b.hidden)continue;
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
   const heading=node('span',null,title);heading.className='action-name';
   const effect=node('span',null,cancel?'Return to normal orders':purpose);effect.className='action-purpose';copy.append(heading,effect);
   b.replaceChildren(icon,copy);
   if(cost){const badge=node('span',null,`${cost[1]} AP`);badge.className='action-cost';b.append(badge);}
   b.setAttribute('aria-label',`${raw}. ${effect.textContent}`);
  }
 }
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 let dock=null,anchors=[],expanded=false,lastSelection=null,lastTarget=null,lastRevision=null,lastSimple=null;
 function move(n,to){const anchor=document.createComment('mobile orders anchor');n.before(anchor);anchors.push([n,anchor]);to.append(n);}
 function unmount(){for(const [n,a] of anchors)a.replaceWith(n);anchors=[];$('mobileUnitDetails')?.remove();dock?.remove();dock=null;lastSelection=null;lastTarget=null;lastRevision=null;}
 function open(value){expanded=value;if(!dock)return;$('mobileOrderBody').hidden=!value;$('mobileOrderToggle').setAttribute('aria-expanded',String(value));}
 function mount(){
  if(dock)return;
  dock=node('section','mobileOrderDock');dock.setAttribute('aria-label','Selected unit orders');
  const head=node('div','mobileOrderHead'),toggle=node('button','mobileOrderToggle','Select a unit');
  toggle.setAttribute('aria-controls','mobileOrderBody');toggle.onclick=()=>open(!expanded);head.append(toggle);
  const body=node('div','mobileOrderBody');dock.append(head,body);$('mapWrap').before(dock);
  move($('end'),head);move($('orders'),body);
  const detail=node('details','mobileUnitDetails');detail.append(node('summary',null,'Unit details & odds'));$('orders').append(detail);
  for(const id of ['roleBrief','unitMechanics','odds'])move($(id),detail);
  open(false);
 }
 const lessons=[
  ['Your mission','Find the ★ objective. Americans win by holding it at the end of two consecutive American turns. Germans must prevent that until the final round. Either army can also win by eliminating the enemy.','.mission'],
  ['Choose your unit','Tap one of your counters on the map. Its name and actions stay in the mobile orders bar. Tap that bar to open or close orders. AP means action points.','#map'],
  ['Move into position','With your unit selected, tap a highlighted neighboring hex to move. Woods and buildings cost more but offer cover. Orange move hexes warn of enemy overwatch. Connected roads can grant one extra hex each turn.','#map'],
  ['Spend actions, not dice','Squads and MGs start with 2 AP; lieutenants start with 3. Available orders are shown for your selected unit. Select an enemy to see attacks. You can learn the flow without reading the dice math.','#orders'],
  ['Cover and attacks','Fire costs 2 AP and may miss. Cover makes units harder to hit; smoke blocks shots. An MG can suppress to pin a visible enemy without damage. Pinned troops must rally before moving or attacking. If no attack is available, keep advancing or skip this tip.','#orders'],
  ['Watch the other side','End turn when ready. In solo play the computer responds, then you can pause, step through, or skip its replay. In DSL, unused AP can carry over: up to 1 per unit, or 2 for a lieutenant.','#end'],
  ['Your specialist tools','Squads carry smoke and a frag grenade. Lieutenants can rally nearby troops, call delayed mortars, or spend 2 AP on “On your feet” for eligible adjacent squad/MG units in their platoon. Incoming mortars threaten both armies: move clear!','#orders'],
  ['You are in command','Keep checking the objective, not just enemy losses. Toggle Simple view off whenever you want odds, modifiers and logs. Save codes and other battle options remain below the board. Finish this guide to keep playing normally.','#simpleToggle']
 ];
 function guideActive(){return prefs.guide?.code===session?.code&&prefs.guide?.battle===(state?.battle_number||1)&&Number.isInteger(prefs.guide.step)&&prefs.guide.step>=0&&prefs.guide.step<lessons.length;}
 function startGuide(){prefs.guide={code:session.code,battle:state.battle_number||1,step:0,since:state.revision};save();sync();}
 function clearFocus(){document.querySelectorAll('.lesson-focus').forEach(n=>n.classList.remove('lesson-focus'));}
 function sync(){
  document.body.classList.toggle('simple-play',prefs.simple);
  if(lastSimple!==prefs.simple){$('battleOptions').open=!prefs.simple;lastSimple=prefs.simple;}
  $('simpleToggle').textContent=`Simple view: ${prefs.simple?'on':'off'}`;$('simpleToggle').setAttribute('aria-pressed',String(prefs.simple));
  if(!state||$('game').hidden)return;
  // Desktop restores its anchors before mobile is allowed to move the same controls.
  if(!matchMedia('(min-width:1100px)').matches&&window.ww2Desktop?.active)return;
  const mobile=!matchMedia('(min-width:1100px)').matches&&state.ruleset==='dsl';
  if(mobile){mount();dock.hidden=!!playbackSession;dock.inert=!!playbackSession;
   const unit=state.units.find(u=>u.id===selected&&u.hp>0);
   $('mobileOrderToggle').textContent=unit?`${unitName(unit)} · ${String.fromCharCode(65+unit.pos[0])}${unit.pos[1]+1} · ${unit.ap} AP${unit.pinned?' · PINNED':''} ▾`:'Select a unit · Orders ▾';
   if(selected!==lastSelection||target!==lastTarget)open(!!unit);
   else if(state.revision!==lastRevision)open(false);
   if(smokeMode||barrageMode)open(false);
   lastSelection=selected;lastTarget=target;lastRevision=state.revision;
  }else unmount();
  if(prefs.simple){
   for(const [id,label] of [['fire','Fire'],['assault','Assault'],['grenade','Frag']])if(!$(id).hidden)$(id).textContent=`${label} · 2 actions`;
   if($('hint').textContent.startsWith('Fire at '))$('hint').textContent='Target in sight. Choose an available attack.';
  }
  $('simpleOutcome').hidden=!prefs.simple||!state.last_combat||!!playbackSession;
  styleActions();
  $('simpleOutcome').textContent=state.last_combat?.result||'';
  $('guideToggle').hidden=state.ruleset!=='dsl';
  const active=guideActive();
  if(active&&!playbackSession){const g=prefs.guide;
   if(g.step===2&&(state.action_history||[]).some(h=>h.revision>g.since&&h.side===state.side&&h.action.kind==='move')){g.step++;g.since=state.revision;clearFocus();save();}
  }
  $('guideToggle').setAttribute('aria-pressed',String(active));$('guideToggle').textContent=active?'Hide learning guide':'Learn as you play';
  $('tutorialCoach').hidden=!active||!!playbackSession;
  if(active){const step=prefs.guide.step,[title,text]=lessons[step];$('lessonCount').textContent=`FIELD TRAINING · ${step+1} / ${lessons.length}`;$('lessonTitle').textContent=title;$('lessonText').textContent=text;$('lessonBack').disabled=step===0;$('lessonNext').textContent=step===lessons.length-1?'Finish guide':'Next tip →';}
 }
 $('simpleToggle').onclick=()=>{prefs.simple=!prefs.simple;save();if(playbackSession){sync();drawPlayback();}else render();};
 $('guideToggle').onclick=()=>{clearFocus();if(guideActive()){prefs.guide=null;save();sync();}else startGuide();};
 $('lessonNext').onclick=()=>{if(!guideActive())return;clearFocus();prefs.guide.since=state.revision;if(++prefs.guide.step===lessons.length){prefs.guide=null;notify('Training complete. Keep playing—and reopen the guide any time.');}save();sync();};
 $('lessonBack').onclick=()=>{if(!guideActive())return;clearFocus();prefs.guide.since=state.revision;prefs.guide.step=Math.max(0,prefs.guide.step-1);save();sync();};
 $('lessonExit').onclick=()=>{clearFocus();prefs.guide=null;save();sync();};
 $('lessonShow').onclick=()=>{if(!guideActive())return;clearFocus();const selector=lessons[prefs.guide.step][2];if(selector==='#orders')open(true);const target=document.querySelector(selector);target?.classList.add('lesson-focus');target?.scrollIntoView({block:'center',behavior:'auto'});};
 $('learnStart').onclick=()=>run(async()=>{remember(await api('/api/match',{ruleset:'dsl',opponent:'computer',scenario:'village'}));prefs.simple=true;prefs.guide={code:session.code,battle:1,step:0,since:0};save();});
 document.addEventListener('ww2:before-layout',unmount);
 document.addEventListener('ww2:render',sync);
 document.addEventListener('ww2:selection',()=>{if(selected&&!playbackSession){open(true);if(guideActive()&&prefs.guide.step===1){prefs.guide.step=2;prefs.guide.since=state.revision;clearFocus();save();sync();}}});
 document.addEventListener('ww2:playback',sync);
 matchMedia('(min-width:1100px)').addEventListener('change',sync);
 sync();
})();
