/* A first-play walkthrough over a separate, ordinary Current Village battle.
 * No rules, dice, legal actions, opponent state or saved battles are rewritten.
 * Progress is local; action lessons require an authoritative order or history.
 */
'use strict';
(()=>{
 if(window.ww2FirstCommand)return;
 const get=id=>document.getElementById(id);
 const make=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text!==undefined)n.textContent=text;return n;};
 const storage='ww2-first-command-v1',steps=['Your goal','Select','Move','Give an order','End turn','Their turn','Your next decision'];
 const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a[0]===b[0]&&a[1]===b[1];
 const hex=p=>`${hexColumn(p[0])}${p[1]+1}`;
 const own=u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id&&!u.evacuated&&controlsUnit(u);
 const safeRead=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
 let memory={version:1,dismissed:false,run:null},frame=0,beforeOrder=null,starting=false,receiptTimer=0,receipt=null,paintKey='',lastFocus=null;
 const stored=safeRead(storage);
 if(stored?.version===1){
  memory.dismissed=stored.dismissed===true;
  const r=stored.run;
  if(r&&typeof r.code==='string'&&Number.isInteger(r.battle)&&r.battle>0&&Number.isInteger(r.step)&&r.step>=0&&r.step<steps.length&&Number.isInteger(r.since)){
   memory.run={...r,paused:r.paused===true,completed:r.completed===true,done:r.done===true,feedback:typeof r.feedback==='string'?r.feedback:'',practiced:Array.isArray(r.practiced)?r.practiced.filter(s=>steps.includes(s)):[]};
   if(!r.baseline||!Array.isArray(r.baseline.units)||!r.baseline.units.every(u=>u&&typeof u.id==='string'&&Array.isArray(u.pos)&&Number.isFinite(u.ap)))memory.run.baseline=null;
  }
 }
 const save=()=>{try{localStorage.setItem(storage,JSON.stringify(memory));}catch{/* Keep this page's progress even without storage. */}};
 const matches=()=>!!memory.run&&!!state&&session?.code===memory.run.code&&(state.battle_number||1)===memory.run.battle&&state.ruleset==='dsl'&&state.scenario?.id==='current:village'&&!state.coop;
 const shown=()=>matches()&&!get('game').hidden&&!lobbyMode&&!document.body.classList.contains('empires-active');
 const active=()=>shown()&&!memory.run.paused&&!memory.run.completed;
 const consent=()=>safeRead('ww2-coaching-preferences-v1')?.ignored!==true;
 const pendingTarget=()=>!!(smokeMode||barrageMode||combatMode||get('map')?.matches('.support-picking,.transport-picking')||get('map')?.querySelector('.airdrop-aim,.engineering-choice,.signal-choice,.night-choice,.small-front-choice,.landing-zone,.transport-choice,.recon-choice'));
 const playable=()=>!busy&&!playbackSession&&state.ready&&!state.winner&&state.turn===state.side&&!state.computer_work?.pending&&!state.order_history?.redo_required;
 const visibleUnit=u=>(window.signalSnapshot?.(state)||state).units.some(v=>v.id===u.id&&v.hp>0);
 const unitNode=id=>[...get('map').querySelectorAll('.unit[data-unit-id]')].find(n=>n.dataset.unitId===id);
 const tileNode=pos=>get('map').querySelector(`.hex[data-x="${pos[0]}"][data-y="${pos[1]}"]`);
 const distance=(a,b)=>{const aq=a[0]-(a[1]-(a[1]&1))/2,bq=b[0]-(b[1]-(b[1]&1))/2;return Math.max(Math.abs(aq-bq),Math.abs(a[1]-b[1]),Math.abs(aq-bq+a[1]-b[1]));};

 const entry=make('section','firstCommandHome');entry.className='first-command-home';entry.setAttribute('aria-labelledby','firstCommandHomeTitle');
 entry.innerHTML='<div class="first-command-emblem" aria-hidden="true">01<span>FIRST COMMAND</span></div><div class="first-command-home-copy"><p class="first-command-kicker">NEW TO DSL? START HERE</p><h2 id="firstCommandHomeTitle">Learn by playing.</h2><p id="firstCommandHomeText">One small battle. Select a squad, make a move, give an order, and see a full turn. Your other battles stay saved.</p><p id="firstCommandSavedNote" class="first-command-small">Uses Current rules. No account needed. Tutorial progress stays on this browser.</p></div><div class="first-command-home-actions"><button id="firstCommandStart" type="button">Start tutorial <span aria-hidden="true">→</span></button><button id="firstCommandChapters" type="button" class="first-command-secondary">Browse practice chapters</button><button id="firstCommandDismiss" type="button" class="first-command-quiet">Ignore tutorial</button><p id="firstCommandStartStatus" role="status"></p></div>';
 const homeAnchor=get('homeExperience')?.closest('.home-experience')||get('entryStatus');homeAnchor.after(entry);
 const shortcut=make('button','firstCommandFromHelp','First-play tutorial');shortcut.type='button';
 (get('battleViewHelp')||get('playTools')).append(shortcut);
 const quickStart=make('button','firstCommandQuick','Start tutorial');quickStart.type='button';quickStart.className='first-command-quick';document.querySelector('.home-shortcuts')?.prepend(quickStart);
 const compactEntry=make('button','firstCommandRestore','Start first-play tutorial');compactEntry.type='button';compactEntry.className='first-command-restore';compactEntry.hidden=true;entry.after(compactEntry);

 const card=make('section','firstCommandCard');card.hidden=true;card.setAttribute('aria-labelledby','firstCommandTitle');
 card.innerHTML='<div class="first-command-progress"><p id="firstCommandStep" class="first-command-kicker"></p><ol id="firstCommandSteps" aria-label="Tutorial progress"></ol></div><div class="first-command-instruction"><h2 id="firstCommandTitle"></h2><p id="firstCommandText"></p><p id="firstCommandResult" role="status" aria-live="polite" aria-atomic="true"></p></div><div class="first-command-actions"><button id="firstCommandFind" type="button">Show me where</button><button id="firstCommandNext" type="button" hidden>Continue →</button><button id="firstCommandPause" type="button" class="first-command-quiet">Pause tutorial</button></div>';
 const progressItems=steps.map((s,i)=>{const item=make('li',null);item.setAttribute('aria-label',`${i+1}. ${s}`);item.title=s;get('firstCommandSteps')?.append(item);return item;});
 document.body.append(card);get('firstCommandSteps').replaceChildren(...progressItems);get('firstCommandTitle').tabIndex=-1;
 const resumeChip=make('button','firstCommandResume','Resume tutorial');resumeChip.type='button';resumeChip.className='first-command-resume';resumeChip.hidden=true;document.body.append(resumeChip);
 const ringLayer=()=>{let g=get('firstCommandMarker');if(!g){g=document.createElementNS('http://www.w3.org/2000/svg','g');g.id='firstCommandMarker';g.setAttribute('pointer-events','none');g.setAttribute('aria-hidden','true');get('map').append(g);}return g;};
 function clearFocus(){get('firstCommandMarker')?.remove();document.querySelectorAll('.first-command-focus').forEach(n=>n.classList.remove('first-command-focus'));lastFocus=null;}
 function pointAt(spec){
  clearFocus();if(!spec||busy||playbackSession)return;
  const n=spec.unit?unitNode(spec.unit):spec.pos?tileNode(spec.pos):get(spec.control);
  if(spec.unit||spec.pos){
   const unit=spec.unit&&state.units.find(u=>u.id===spec.unit),pos=unit?.pos||spec.pos;if(!pos||!n)return;
   const [x,y]=center(...pos),g=ringLayer();
   for(const [radius,cls]of [[28,'first-command-ring'],[33,'first-command-ring-outer']]){const circle=document.createElementNS(g.namespaceURI,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r',radius);circle.setAttribute('class',cls);g.append(circle);}
  }else if(n)n.classList.add('first-command-focus');
  lastFocus=spec;
 }
 function locate(spec){
  if(!active()||busy||playbackSession||!spec)return;
  if(spec.unit||spec.pos){
   const unit=spec.unit&&state.units.find(u=>u.id===spec.unit),pos=unit?.pos||spec.pos;
   // Centering is read-only. Never call chooseUnit here: it can fire an
   // already pending smoke/barrage order instead of selecting a unit.
   if(pos){
    for(const d of document.querySelectorAll('dialog[open]'))d.close();
    const tile=tileNode(pos),box=tile?.getBoundingClientRect();
    if(innerWidth<1100&&box&&Math.min(box.width,box.height)<38&&!get('mapWrap').classList.contains('enlarged')&&!get('zoom')?.disabled)get('zoom')?.click();
    focusMapUnit({pos});requestAnimationFrame(()=>{if(active())focusMapUnit({pos});});
   }
  }else{
   const n=get(spec.control);if(!n)return;
   const sheet=n.closest('dialog');
   if(sheet&&!sheet.open){
    if(sheet.classList.contains('mobile-battle-sheet'))window.ww2Mobile?.openSheet(sheet.id);
    else{for(const d of document.querySelectorAll('dialog[open]'))if(d!==sheet)d.close();sheet.showModal();}
   }
   window.ww2ExperimentalDesktop?.openContaining(n);window.ww2BattleNavigation?.openContaining(n);
   for(let p=n.parentElement;p&&p!==document.body;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
   n.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});n.focus?.({preventScroll:true});
  }
  schedule();
 }
 function mark(feedback,practiced=true){
  const r=memory.run;if(!r||r.done)return;r.done=true;r.feedback=feedback;
  if(practiced&&!r.practiced.includes(steps[r.step]))r.practiced.push(steps[r.step]);save();schedule();
 }
 function movable(){return state.units.filter(own).filter(u=>state.legal[u.id]?.moves?.length).sort((a,b)=>(b.kind==='squad')-(a.kind==='squad'));}
 function chooseMover(){
  const r=memory.run;let u=state.units.find(u=>u.id===r.unit&&own(u)&&state.legal[u.id]?.moves?.length);
  if(!u){u=movable()[0];if(u){r.unit=u.id;r.origin=u.pos.slice();r.startAP=u.ap;r.since=state.revision;save();}}
  return u;
 }
 function orderChoice(){
  const r=memory.run,units=state.units.filter(own),candidates=[];
  for(const u of units){const legal=state.legal[u.id]||{};
   for(const t of legal.targets||[]){const enemy=state.units.find(v=>v.id===t.id);if(enemy&&enemy.side!==state.side&&visibleUnit(enemy))candidates.push({unit:u.id,kind:'fire',target:t.id,control:'fire'});}
  }
  for(const kind of ['dig','overwatch','rally'])for(const u of units)if(state.legal[u.id]?.[kind]===true)candidates.push({unit:u.id,kind,control:kind});
  const previous=candidates.find(c=>c.unit===r.order?.unit&&c.kind===r.order.kind&&c.target===r.order.target);
  const choice=previous||candidates[0];
  if(JSON.stringify(choice)!==JSON.stringify(r.order)){r.order=choice||null;save();}
  return choice;
 }
 function currentInstruction(){
  const r=memory.run,m=ww2Briefing.mission(state),name=u=>unitName(u),unit=()=>state.units.find(u=>u.id===r.unit);
  const out=(title,text,focus=null,manual=false)=>({title,text,focus,manual});
  if(r.done)return out('That action is complete.',r.feedback,null,true);
  if(state.winner&&r.step!==6)return out('This battle has ended.','You can review the result or restart the tutorial in a new practice battle. No win is required to learn the controls.',{control:'showBattleResult'});
  if(busy)return out('Waiting for confirmation.','The order is being checked. The tutorial will not count it until the server confirms it.');
  if(playbackSession)return out('Watch the other army.','This is a replay, not your live turn. Watch it, step through it, or choose Skip to live board.',{control:'skipPlayback'});
  if(state.computer_work?.status==='paused')return out('The computer turn needs attention.','Your confirmed orders remain saved. Use Retry computer orders to continue.',{control:'retryComputer'});
  if(state.turn!==state.side||state.computer_work?.pending)return out('The other army is acting.','You can inspect the board while you wait. Your orders return when YOUR TURN appears.');
  if(state.order_history?.redo_required)return out('Restore the recorded result.','Use Redo before giving a different order. It keeps the same dice; it does not roll again.',{control:'redoOrder'});
  if(pendingTarget())return out('Finish your current target choice.','An order is waiting for its target. Finish or cancel it using the normal controls. Tutorial navigation will not issue the order for you.',{control:'orders'});
  if(r.step===0)return out('Your mission comes first.',`${m.goal} You command the ${sideLabel(state.side)}. Find the marked objective, then continue. You do not have to win to finish this introduction.`,{pos:state.scenario.objective},true);
  if(r.step===1){const u=chooseMover();return u?out('Select the outlined team.',`${name(u)} is one of your units. Tap its counter or its name in Your units. Selecting it does not spend any action points (AP).`,{unit:u.id}):out('Refresh your unit actions.','No team can move right now. End your turn; we will continue when your units can act.',{control:'end'});}
  if(r.step===2){
   let u=unit();if(!u||!own(u)||!state.legal[u.id]?.moves?.length)u=chooseMover();
   if(!u)return out('Your units need another turn.','There is no legal move to practice now. End turn, then return to this step when your actions refresh.',{control:'end'});
   if(selected!==u.id)return out('Select your moving team.',`Select ${name(u)} again. A movement highlight only applies to the unit currently selected.`,{unit:u.id});
   const moves=state.legal[u.id].moves.slice().sort((a,b)=>(!!a.threats)-(!!b.threats)||a.cost-b.cost||distance(a.pos,state.scenario.objective)-distance(b.pos,state.scenario.objective));
   const move=moves[0];
   return out('Move to the outlined hex.',`Tap ${hex(move.pos)} to move ${name(u)} for ${move.cost} AP. This is a real order. Other highlighted legal moves also count; no highlight promises safety.`,{pos:move.pos});
  }
  if(r.step===3){
   const choice=orderChoice();if(!choice)return out('Refresh your actions.','No suitable order is available right now. End turn to refresh AP; this lesson will still be here.',{control:'end'});
   const u=state.units.find(u=>u.id===choice.unit);
   if(selected!==u.id)return out('Choose a team with an order available.',`Select ${name(u)}. Each unit has its own AP; changing selection does not end your army’s turn.`,{unit:u.id});
   if(choice.kind==='fire'){
    const enemy=state.units.find(v=>v.id===choice.target);
    if(target!==choice.target)return out('Select a visible enemy.',`Tap the outlined ${name(enemy)} to preview an attack. Selecting a target does not fire or spend AP.`,{unit:enemy.id});
    return out('Give the Fire order.','Open Orders if needed, then choose Fire at unit. Firing costs 2 AP and may miss. Either result teaches the action; this tutorial does not change the dice.',{control:'fire'});
   }
   const copy={dig:['Try a defensive order.','Choose Dig in for 2 AP. It protects this team while it stays in place. No enemy is currently a legal firing target for this practice step.'],overwatch:['Prepare a reaction.','Choose Overwatch for 2 AP. It reserves a possible reaction later, rather than firing immediately.'],rally:['Help this team recover.','Choose Rally for 1 AP. It removes the pin but does not restore strength.']};
   return out(...copy[choice.kind],{control:choice.control});
  }
  if(r.step===4)return out('End the army’s turn.','You can switch between all your units before ending. For this practice, choose End turn and confirm. The other army then gets to act; unused AP banks only up to the normal limits.',{control:'end'});
  if(r.step===5)return out('Wait for control to return.','Orders remain unavailable during the opponent’s turn. When the computer has finished, the next step will appear.');
  return out('Now make a plan of your own.',`${m.goal} You have practiced selection, movement, an order and a full turn. Keep playing this battle, or return Home. If you used a defensive order, targeting and firing remain available in Field coach.`,{pos:state.scenario.objective},true);
 }
 function syncSelection(){
  if(!active()||!playable()||pendingTarget()||memory.run.step!==1||memory.run.done)return;
  const u=state.units.find(u=>u.id===selected&&own(u)&&state.legal[u.id]?.moves?.length);if(!u)return;
  Object.assign(memory.run,{unit:u.id,origin:u.pos.slice(),startAP:u.ap});
  mark(`${unitName(u)} selected. ${u.ap} AP available. Selection spent nothing.`);
 }
 function snapshot(){return state?{code:state.code,battle:state.battle_number||1,revision:state.revision,round:state.round,side:state.side,selected,units:state.units.filter(u=>u.side===state.side).map(u=>({id:u.id,pos:u.pos.slice(),ap:u.ap,hp:u.hp}))}:null;}
 function confirmed(kind,baseline){
  if(!active()||memory.run.done||!baseline||state.code!==baseline.code||(state.battle_number||1)!==baseline.battle||state.revision<=baseline.revision)return;
  const r=memory.run;
  if(r.step===2&&kind==='move'){
   const old=baseline.units.find(u=>u.id===r.unit),u=state.units.find(u=>u.id===r.unit);
   if(old&&u&&!same(old.pos,u.pos))mark(`Move confirmed at ${hex(u.pos)}. ${u.hp<=0?'The team was lost during the resolved move.':`${u.ap} AP remain${u.ap<old.ap?`; ${old.ap-u.ap} AP spent`:''}.`}${u.hp>0&&u.hp<old.hp?' Reaction fire also caused strength loss.':''}`);
  }
  if(r.step===3&&['fire','dig','overwatch','rally','suppress','grenade','assault','inspire'].includes(kind)){
   const moved=state.units.find(u=>u.id===baseline.selected&&u.side===state.side);
   const combat=['fire','suppress','grenade','assault'].includes(kind),event=state.last_combat;
   const result=combat&&event?.revision>baseline.revision?String(event.result||'Attack resolved.'):{dig:'Dig in confirmed. Moving or assaulting removes this extra protection.',overwatch:'Overwatch confirmed. The shot is a possible reaction, not an immediate attack.',rally:'Rally confirmed. Removing a pin is different from healing.',inspire:'Nearby rally confirmed.'}[kind]||'Order confirmed. Check the result shown by the game.';
   mark(`${result}${moved?` ${unitName(moved)} has ${moved.ap} AP left.`:''}${combat?' A hit is not required to complete this lesson.':''}`);
  }
  if(r.step===4&&kind==='end'){r.endRound=baseline.round;mark('Your turn was accepted. The computer now resolves its orders. You can watch or skip its replay.');}
 }
 function recoverProgress(){
  if(!active()||memory.run.done)return;
  const r=memory.run;
  if(r.step===5&&r.endRound!==undefined&&!busy&&!playbackSession&&!state.computer_work?.pending&&(state.winner||state.turn===state.side&&state.round>r.endRound))mark(state.winner?'The turn sequence ended the battle. Review the result; the practice still counts.':'YOUR TURN has returned. Available units have their next-turn AP, including any allowed banking.');
  if(![2,3,4].includes(r.step)||!r.baseline)return;
  // A lost response followed by an authenticated refresh can recover progress.
  // A read does not itself constitute practice; require a new own-side action.
  const records=(state.action_history||[]).filter(h=>h.side===state.side&&h.revision>r.since&&h.action&&h.revision<=state.revision);
  for(const h of records){
   if(r.step===2&&(h.action.kind!=='move'||h.action.unit!==r.unit))continue;
   if(r.step===3&&!['fire','dig','overwatch','rally','suppress','grenade','assault','inspire'].includes(h.action.kind))continue;
   if(r.step===4&&h.action.kind!=='end')continue;
   confirmed(h.action.kind,{...r.baseline,selected:h.action.unit||r.baseline.selected});if(r.done)break;
  }
 }
 function next(){
  if(!active()||busy||playbackSession)return;
  const r=memory.run;if(!r.done&&![0,6].includes(r.step))return;
  if(r.step===6){r.completed=true;r.paused=true;save();schedule();notify('First command complete. Keep playing or return Home. Field coach remains available.');return;}
  r.step++;r.done=false;r.feedback='';r.since=state.revision;r.baseline=snapshot();r.order=null;save();paintKey='';schedule();requestAnimationFrame(()=>get('firstCommandTitle').focus({preventScroll:true}));
 }
 function pause(){if(!matches())return;memory.run.paused=true;save();clearFocus();schedule();}
 async function start(forceNew=false){
  if(starting||busy||playbackSession){notify('Finish the current order or replay before opening the tutorial.');return;}
  const previous=memory.run,seat=!forceNew&&previous&&!previous.completed?savedSessions.find(s=>s.code===previous.code):null;
  if(!forceNew&&shown()&&!previous.completed){previous.paused=false;memory.dismissed=false;save();for(const d of document.querySelectorAll('dialog[open]'))d.close();schedule();return;}
  if(forceNew&&!confirm('Start a new tutorial battle? Your existing battles and this practice attempt remain saved.'))return;
  starting=true;get('firstCommandStartStatus').textContent=seat?'Opening your practice battle…':'Creating a separate practice battle…';
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  let entered=false;
  await run(async()=>{
   if(seat){
    const value=await apiWithSession(seat);
    if(value.scenario?.id!=='current:village'||(value.battle_number||1)!==previous.battle)throw new Error('That practice battle has changed. Use Start a new tutorial in View & help.');
    remember(seat);state=value;previous.paused=false;
   }else{
    // Same creation and session paths as a normal solo game; no reset endpoint.
    const created=await api('/api/match',{ruleset:'dsl',opponent:'computer',scenario:'current:village',side:'us'});
    remember(created);
    memory.run={code:created.code,battle:1,step:0,since:0,paused:false,completed:false,done:false,feedback:'',practiced:[]};save();
    state=await apiWithSession(session);memory.run.battle=state.battle_number||1;memory.run.since=state.revision;
   }
   memory.dismissed=false;save();entered=true;render();
  });
  starting=false;get('firstCommandStartStatus').textContent=entered?'':'The tutorial did not open. Check the connection message; your other battles remain saved.';schedule();
 }
 get('firstCommandStart').onclick=()=>start();quickStart.onclick=()=>start();compactEntry.onclick=()=>start();resumeChip.onclick=()=>start();
 shortcut.onclick=()=>start();
 const restart=make('button','firstCommandRestart','Start a new tutorial');restart.type='button';restart.onclick=()=>start(true);shortcut.after(restart);
 get('firstCommandChapters').onclick=()=>window.ww2Journey?.open();
 get('firstCommandDismiss').onclick=()=>{memory.dismissed=true;save();get('lessonIgnore')?.click();schedule();};
 get('firstCommandNext').onclick=next;get('firstCommandPause').onclick=pause;
 get('lessonIgnore')?.addEventListener('click',()=>{memory.dismissed=true;if(memory.run)memory.run.paused=true;save();schedule();});
 get('firstCommandFind').onclick=()=>{if(active())locate(currentInstruction().focus);};

 function placement(){
  const dialog=[...document.querySelectorAll('dialog[open]')].find(d=>!['firstCommandCard'].includes(d.id));
  const inline=dialog&&['dadOrders','mobileUnitDetails','experimentalUnitDetails','mobileRoster','experimentalRoster','battleViewSettings','orderGuide'].includes(dialog.id);
  const parent=inline?dialog:document.body;
  if(card.parentNode!==parent){if(inline){const heading=parent.querySelector('.mobile-sheet-heading,.battle-view-heading');if(heading)heading.after(card);else parent.prepend(card);}else parent.append(card);}
  card.classList.toggle('first-command-inline',!!inline);
  // Reserve space rather than covering counters. Existing responsive battle
  // grids, replay rows and result panels keep their own layout rules.
  const reserve=!inline&&!card.hidden;
  document.body.classList.toggle('first-command-active',reserve);
  if(reserve){const height=Math.ceil(card.getBoundingClientRect().height);if(height>0)document.documentElement.style.setProperty('--first-command-space',`${height}px`);}
  else document.documentElement.style.removeProperty('--first-command-space');
 }
 function paint(){
  frame=0;
  document.body.classList.toggle('dsl-interaction-polish',!!state&&state.ruleset==='dsl'&&state.edition==='current'&&!lobbyMode);
  const r=memory.run,resumable=r&&!r.completed,canResume=resumable&&(shown()||savedSessions.some(s=>s.code===r.code));
  const hiddenWelcome=memory.dismissed||!consent();entry.hidden=hiddenWelcome;compactEntry.hidden=!hiddenWelcome;
  get('firstCommandStart').replaceChildren(document.createTextNode(canResume?'Resume tutorial →':r?.completed?'Practice again →':'Start tutorial →'));
  get('firstCommandStart').disabled=starting||busy||!!playbackSession;quickStart.disabled=starting||busy||!!playbackSession;quickStart.textContent=canResume?'Resume tutorial':'Start tutorial';
  get('firstCommandHomeTitle').textContent=canResume?'Continue your first command.':r?.completed?'Your first command, practiced.':'Learn by playing.';
  get('firstCommandSavedNote').textContent=canResume?`Step ${r.step+1} of ${steps.length} · ${steps[r.step]}. Progress stays on this browser; normal SAVE / MOVE codes preserve the battle.`:'Uses Current rules. No account needed. Tutorial progress stays on this browser.';
  shortcut.textContent=shown()&&resumable?(r.paused?'Resume first-play tutorial':'First-play tutorial'):resumable?'Resume first-play tutorial':'First-play tutorial';
  resumeChip.hidden=!shown()||!resumable||!r.paused||!!document.querySelector('dialog[open]');
  if(!resumeChip.hidden){const box=get('mapWrap').getBoundingClientRect();resumeChip.style.left=Math.max(box.left+8,box.right-166)+'px';resumeChip.style.top=(box.top+8)+'px';}
  const on=active();card.hidden=!on;
  // Hide only the duplicate compact coach prompt, not its lessons or consent.
  document.body.classList.toggle('first-command-guiding',on);
  if(!on){clearFocus();document.body.classList.remove('first-command-active');document.documentElement.style.removeProperty('--first-command-space');if(card.parentNode!==document.body)document.body.append(card);return;}
  recoverProgress();syncSelection();
  const instruction=currentInstruction();
  const signature=JSON.stringify([r.step,r.done,instruction,r.feedback]);
  if(signature!==paintKey){
   paintKey=signature;card.dataset.step=String(r.step);card.dataset.complete=String(r.done);
   get('firstCommandStep').textContent=`FIRST COMMAND · ${r.step+1} / ${steps.length}`;
   get('firstCommandTitle').textContent=instruction.title;get('firstCommandText').textContent=instruction.text;
   get('firstCommandResult').textContent=r.done?'Confirmed · '+steps[r.step]:'';
   progressItems.forEach((item,i)=>{item.dataset.status=i<r.step?'done':i===r.step?'current':'later';if(i===r.step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
   get('firstCommandNext').textContent=r.step===6?'Finish tutorial':r.step===0?'I understand the goal →':'Continue →';
  }
  const canNext=(r.done||instruction.manual)&&!busy&&!playbackSession;
  get('firstCommandNext').hidden=!canNext;get('firstCommandNext').disabled=!canNext;
  get('firstCommandFind').hidden=!instruction.focus;get('firstCommandFind').disabled=busy||!!playbackSession;
  get('firstCommandPause').disabled=false;
  pointAt(instruction.focus);placement();
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
 new ResizeObserver(()=>{if(active())placement();}).observe(card);
 for(const event of ['ww2:render','ww2:selection','ww2:playback','ww2:layout','ww2:experience','ww2:commander'])document.addEventListener(event,schedule);
 document.addEventListener('ww2:before-layout',()=>{document.body.append(card);clearFocus();});
 document.addEventListener('ww2:busy',()=>{if(busy)beforeOrder=snapshot();schedule();});
 document.addEventListener('ww2:order',e=>{
  const b=beforeOrder;if(e.detail?.code!==state?.code||e.detail?.battle!==(state?.battle_number||1))return;
  confirmed(e.detail.kind,b);if(e.detail.kind==='move')movementReceipt(b);schedule();
 });
 document.addEventListener('close',schedule,true);
 // Observe dialog openings too: the guide follows Orders into its sheet.
 new MutationObserver(schedule).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 new MutationObserver(schedule).observe(get('game'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',schedule);

 // A brief landing ring supplements the existing travel animation. It follows
 // a confirmed friendly move only, never a pointer-down or speculative update.
 function movementReceipt(b){
  if(!b||state.ruleset!=='dsl'||state.edition!=='current'||state.code!==b.code||state.revision<=b.revision)return;
  const old=b.units.find(u=>u.id===b.selected),u=old&&state.units.find(v=>v.id===old.id);
  if(!old||!u||same(old.pos,u.pos)||u.hp<=0)return;
  receipt={code:state.code,pos:u.pos.slice()};clearTimeout(receiptTimer);
  requestAnimationFrame(()=>{
   if(!receipt||receipt.code!==state?.code||lobbyMode||playbackSession)return;
   get('confirmedMoveRing')?.remove();const circle=document.createElementNS('http://www.w3.org/2000/svg','circle'),[x,y]=center(...receipt.pos);
   circle.id='confirmedMoveRing';circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r',26);circle.setAttribute('pointer-events','none');circle.setAttribute('aria-hidden','true');get('map').append(circle);
   receiptTimer=setTimeout(()=>{get('confirmedMoveRing')?.remove();receipt=null;},850);
  });
 }
 window.ww2FirstCommand={start,pause,get progress(){return memory.run?JSON.parse(JSON.stringify(memory.run)):null;}};
 schedule();
})();
