/* Presentation preferences and opt-in coaching; all orders still use the live rules engine. */
'use strict';
(()=>{
 const key='ww2-play-preferences';
 let prefs={simple:false,guide:null};
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&typeof saved.simple==='boolean')prefs={simple:saved.simple,guide:saved.guide};}catch{}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}};
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
