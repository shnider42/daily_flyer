/* Sea and sky introductions over separate, ordinary Current battles.
 * Public legal actions only. No rules, dice, hidden state or API overrides.
 * Ground First Command and its v1 progress are deliberately left intact.
 */
'use strict';
(()=>{
 if(window.ww2DomainTraining)return;
 const $t=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const profiles={
  naval:{name:'Naval command',scenario:'current:midway',side:'us',noun:'ship',description:'Sail a ship, search with a carrier, compare guns and torpedoes, then take a full turn.',kinds:['destroyer','cruiser','battleship','carrier'],steps:['Mission','Select a ship','Sail','Search','Naval weapons','Damage control','End turn','Enemy turn','Your next decision']},
  air:{name:'Air command',scenario:'current:britain',side:'de',noun:'aircraft',description:'Fly a fighter, prepare interception, compare fighters and bombers, and plan aircraft service.',kinds:['fighter','bomber'],steps:['Mission','Select a flight','Fly','Intercept','Air combat','Service','End turn','Enemy turn','Your next decision']}
 };
 const key='ww2-domain-training-v1',same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a[0]===b[0]&&a[1]===b[1],hex=p=>`${hexColumn(p[0])}${p[1]+1}`;
 const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
 let memory={version:1,runs:{}},frame=0,starting=false,before=null,lastSignature='';
 const stored=read(key);
 if(stored?.version===1&&stored.runs)for(const kind of Object.keys(profiles)){
  const r=stored.runs[kind];
  if(r&&typeof r.code==='string'&&Number.isInteger(r.battle)&&r.battle>0&&Number.isInteger(r.step)&&r.step>=0&&r.step<9&&Number.isInteger(r.since))memory.runs[kind]={...r,paused:r.paused===true,completed:r.completed===true,done:r.done===true,feedback:typeof r.feedback==='string'?r.feedback:'',practice:Array.isArray(r.practice)?r.practice.filter(x=>typeof x==='string'):[],review:Array.isArray(r.review)?r.review.filter(x=>typeof x==='string'):[],baseline:r.baseline&&r.baseline.code===r.code&&r.baseline.battle===r.battle&&r.baseline.side===profiles[kind].side&&Number.isInteger(r.baseline.revision)&&Array.isArray(r.baseline.units)&&r.baseline.units.every(u=>typeof u.id==='string'&&Array.isArray(u.pos)&&u.pos.length===2&&u.pos.every(Number.isFinite)&&Number.isFinite(u.ap))?r.baseline:null};
 }
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(memory));}catch{/* page-memory fallback */}};
 const match=kind=>{const r=memory.runs[kind];return !!r&&!!state&&session?.code===r.code&&state.code===r.code&&(state.battle_number||1)===r.battle&&state.ruleset==='dsl'&&state.scenario?.id===profiles[kind].scenario&&state.side===profiles[kind].side&&!state.coop;};
 const current=()=>Object.keys(profiles).find(match);
 const visible=()=>!!state&&!$t('game').hidden&&!lobbyMode&&!document.body.classList.contains('empires-active');
 const active=()=>{const kind=current(),r=memory.runs[kind];return visible()&&r&&!r.paused&&!r.completed?kind:null;};
 const ours=u=>u.side===state.side&&u.hp>0&&!u.reserve&&!u.carrier_id&&!u.evacuated&&controlsUnit(u);
 const pending=()=>!!(smokeMode||barrageMode||combatMode||$t('map').matches('.support-picking,.transport-picking')||$t('map').querySelector('.airdrop-aim,.engineering-choice,.signal-choice,.night-choice,.small-front-choice,.landing-zone,.transport-choice,.recon-choice'));
 const canAct=()=>!busy&&!playbackSession&&state.ready&&!state.winner&&state.turn===state.side&&!state.computer_work?.pending&&!state.order_history?.redo_required;
 const gap=(a,b)=>{const q=p=>p[0]-(p[1]-(p[1]&1))/2,d=q(a)-q(b),y=a[1]-b[1];return Math.max(Math.abs(d),Math.abs(y),Math.abs(d+y));};
 const marker=()=>{$t('domainTrainingMarker')?.remove();document.querySelectorAll('.domain-training-focus').forEach(n=>n.classList.remove('domain-training-focus'));};
 const home=make('section');home.id='domainTrainingHome';home.setAttribute('aria-labelledby','domainTrainingHomeTitle');
 home.innerHTML='<p class="training-kicker">LEARN ANOTHER THEATER</p><h2 id="domainTrainingHomeTitle">Sea &amp; sky.</h2><p class="training-intro">Separate guided battles. Your ground tutorial and other games stay saved.</p><div class="training-courses"></div><p id="domainTrainingStatus" role="status"></p>';
 ($t('firstCommandHome')||$t('homeExperience').closest('.home-experience')).after(home);
 const symbols={naval:'M3 16h26l-5 9H9ZM10 16V9h12v7M15 9V4h3v5M3 29q4-4 8 0t8 0t10 0',air:'M16 2l3 11 12 6v3l-12-3-1 9 4 3H10l4-3-1-9-12 3v-3l12-6Z'};
 for(const [kind,p]of Object.entries(profiles)){
  const box=make('article',undefined,'training-course');box.dataset.domain=kind;
  const icon=make('div',undefined,'training-course-icon');icon.innerHTML=`<svg viewBox="0 0 34 34" aria-hidden="true"><path d="${symbols[kind]}"/></svg>`;
  const copy=make('div');copy.append(make('h3',kind==='naval'?'Naval combat':'Air combat'),make('p',p.description));
  const button=make('button',`Start ${kind} tutorial`);button.id=`${kind}TrainingStart`;button.type='button';button.onclick=()=>start(kind);
  const status=make('small');status.id=`${kind}TrainingSaved`;
  const fresh=make('button','New attempt','training-new');fresh.id=`${kind}TrainingNew`;fresh.type='button';fresh.hidden=true;fresh.onclick=()=>start(kind,true);
  copy.append(button,status,fresh);box.append(icon,copy);home.querySelector('.training-courses').append(box);
  const help=make('button',`${p.name} tutorial`);help.id=`${kind}TrainingHelp`;help.type='button';help.onclick=()=>start(kind);($t('battleViewHelp')||$t('playTools')).append(help);
 }
 const rail=make('section');rail.id='domainTrainingCard';rail.hidden=true;rail.setAttribute('aria-labelledby','domainTrainingTitle');
 rail.innerHTML='<div class="training-progress"><p id="domainTrainingStep" class="training-kicker"></p><ol id="domainTrainingDots" aria-label="Tutorial progress"></ol></div><div class="training-instruction"><h2 id="domainTrainingTitle" tabindex="-1"></h2><p id="domainTrainingText"></p><p id="domainTrainingReceipt" role="status" aria-live="polite"></p></div><div class="training-actions"><button id="domainTrainingFind" type="button">Show me where</button><button id="domainTrainingNext" type="button">Continue</button><button id="domainTrainingReview" type="button">Review instead</button><button id="domainTrainingPause" type="button">Pause tutorial</button></div>';
 document.body.append(rail);
 const resume=make('button','Resume tutorial','training-resume');resume.id='domainTrainingResume';resume.type='button';resume.hidden=true;document.body.append(resume);resume.onclick=()=>{const k=current();if(k)start(k);};
 const snapshot=()=>state?{code:state.code,battle:state.battle_number||1,revision:state.revision,round:state.round,side:state.side,selected,units:state.units.filter(u=>u.side===state.side).map(u=>({id:u.id,kind:u.kind,pos:u.pos.slice(),hp:u.hp,ap:u.ap,bombs:u.bombs,torpedoes:u.torpedoes}))}:null;
 const goal=()=>state.scenario.objective||[Math.floor(state.map[0].length/2),Math.floor(state.map.length/2)];
 function mover(kind){
  const r=memory.runs[kind],candidates=state.units.filter(u=>ours(u)&&profiles[kind].kinds.includes(u.kind)&&state.legal[u.id]?.moves?.length);
  let u=candidates.find(v=>v.id===r.unit);
  if(!u){u=candidates.sort((a,b)=>profiles[kind].kinds.indexOf(a.kind)-profiles[kind].kinds.indexOf(b.kind)||gap(a.pos,goal())-gap(b.pos,goal()))[0];if(u){r.unit=u.id;save();}}
  return u;
 }
 function choices(kind,step){
  const units=state.units.filter(ours),result=[];
  for(const u of units){const l=state.legal[u.id]||{};
   if(step===3&&kind==='naval'&&u.kind==='carrier'&&l.recon?.length)result.push({unit:u.id,kind:'recon',control:'recon'});
   if(step===3&&kind==='air'&&u.kind==='fighter'&&l.overwatch===true)result.push({unit:u.id,kind:'overwatch',control:'overwatch'});
   if(step===4&&profiles[kind].kinds.includes(u.kind)){
    for(const [action,field]of kind==='naval'?[['torpedo','torpedoes'],['fire','targets'],['airstrike','airstrikes']]:[['fire','targets']])for(const t of l[field]||[]){
     const enemy=(window.signalSnapshot?.(state)||state).units.find(v=>v.id===t.id&&v.hp>0&&v.side!==state.side);
     if(enemy)result.push({unit:u.id,kind:action,control:action,target:t.id,threshold:t.threshold,damage:t.damage,bomber:u.kind==='bomber'});
    }
   }
   if(step===5&&kind==='naval'&&profiles.naval.kinds.includes(u.kind)&&l.repair===true)result.push({unit:u.id,kind:'repair',control:'repair'});
   if(step===5&&kind==='air'&&profiles.air.kinds.includes(u.kind)&&l.rearm===true)result.push({unit:u.id,kind:'rearm',control:'rearm'});
  }
  if(kind==='air'&&step===4)result.sort((a,b)=>Number(b.bomber)-Number(a.bomber));
  return result;
 }
 function choice(kind){const r=memory.runs[kind],list=choices(kind,r.step);return list.find(x=>x.unit===selected&&(!target||x.target===target))||list[0];}
 function instruction(kind){
  const p=profiles[kind],r=memory.runs[kind],out=(title,text,focus=null,manual=false,review=false)=>({title,text,focus,manual,review});
  if(r.done)return out(r.review.includes(String(r.step))?'Lesson reviewed.':'Order confirmed.',r.feedback,null,true);
  if(busy)return out('Waiting for the result.','The server is checking your order. An animation or a tap alone does not complete a lesson.');
  if(playbackSession)return out('Watch the enemy turn.','This is recorded action, not a live target. Watch, pause or skip the replay.',{control:'skipPlayback'});
  if(state.winner)return out('The battle has ended.', 'Review its result. You may finish this introduction without claiming unperformed actions, or start a new attempt from Home.',{control:'showBattleResult'},true);
  if(state.computer_work?.status==='paused')return out('The computer turn is paused.','Your confirmed progress is safe. Use Retry computer orders to continue.',{control:'retryComputer'});
  if(!state.ready||state.turn!==state.side||state.computer_work?.pending)return out('The other army is acting.','Wait for YOUR TURN. You can inspect your units without issuing orders.');
  if(state.order_history?.redo_required)return out('Restore the recorded result.','Redo keeps the same dice. Restore it before trying another order.',{control:'redoOrder'});
  if(pending())return out(kind==='naval'&&r.step===3?'Choose the search area.':'Finish your target choice.',kind==='naval'&&r.step===3?'Tap a highlighted search hex near the sea-control area. A search reveals only what the normal rules allow; it does not track the enemy indefinitely.':'Finish or cancel the pending order. Tutorial navigation will not select a unit or fire for you.',{control:'orders'});
  if(r.step===0)return out(kind==='naval'?'Command a fleet, not a platoon.':'Fighters and bombers have different jobs.',`${ww2Briefing.mission(state).goal} You command ${sideLabel(state.side)}. `+(kind==='naval'?'Ships use hull strength, water routes and finite torpedoes. This Midway uses abstract carrier search/strike orders, not movable carrier aircraft.':'Fighters attack aircraft; bombers attack surface targets. This introductory Britain mission has airborne flights and nearby-field service—not the launch, landing and fuel system of Britain 2.0.'),{pos:goal()},true);
  if(r.step===1){const u=mover(kind);return u?out(`Select the outlined ${p.noun}.`,`${unitName(u)} · ${u.ap} AP. Select its counter or roster entry. Selection is free; the order buttons belong to this unit.`,{unit:u.id}):out('No movable unit is ready.','End your turn to refresh available AP. This step stays here.',{control:'end'});}
  if(r.step===2){
   const u=mover(kind);if(!u)return out('Your units need another turn.','No suitable legal move is available. End turn and return to this lesson.',{control:'end'});
   if(selected!==u.id)return out(`Select your ${p.noun} again.`,`${unitName(u)} must be selected before its move highlights apply.`,{unit:u.id});
   const moves=state.legal[u.id].moves.slice().sort((a,b)=>Number(!!a.threats)-Number(!!b.threats)||a.cost-b.cost||gap(a.pos,goal())-gap(b.pos,goal())),m=moves[0];
   return out(kind==='naval'?'Sail one legal step.':'Fly a complete leg.',kind==='naval'?`Tap ${hex(m.pos)} for ${m.cost} AP. Warships stay on water; islands block routes and surface fire. Other highlighted legal moves also count.`:`Tap ${hex(m.pos)} for ${m.cost} AP${m.path?.length?` across ${m.path.length} hexes`:''}. Interception can occur along the flight path, not just at its destination. Other legal flights also count.`,{pos:m.pos});
  }
  if([3,4,5].includes(r.step)){
   const c=choice(kind);
   if(c){
    const u=state.units.find(v=>v.id===c.unit);
    if(selected!==u.id)return out(`Select ${unitName(u)}.`,r.step===3?(kind==='naval'?'The carrier can search an area before the fleet commits to an attack.':'This fighter can prepare one possible interception. Bombers cannot intercept.'):r.step===5?'This unit has a legal recovery order. Its own action points pay the cost.':'This unit has a legal target. Switching units does not end your turn.',{unit:u.id});
    if(c.target&&target!==c.target){const enemy=state.units.find(v=>v.id===c.target);return out('Preview a visible target.',`Select the outlined ${unitName(enemy)}. This only previews the attack; it does not fire.`,{unit:c.target});}
    if(c.target)return out(c.bomber?'Release a bomb load.':c.kind==='torpedo'?'Fire a finite torpedo salvo.':c.kind==='airstrike'?'Launch the carrier strike.':'Give the Fire order.',`${Number.isFinite(c.threshold)?Math.round(Math.max(0,Math.min(6,7-c.threshold))/6*100)+'% hit chance. ':''}${c.damage!==undefined?c.damage+' damage on a hit. ':''}Cost: 2 AP. ${c.bomber?'Bombing spends one load, even on a miss.':c.kind==='torpedo'?'A miss still spends a salvo. Torpedoes ignore armor.':'A legal attack can miss.'} The tutorial accepts a confirmed miss too.`,{control:c.control});
    const copy={recon:['Search before attacking.','Choose Search aircraft for 1 AP, then tap a highlighted area. A search is information, not a strike. It does not guarantee contact.'],overwatch:['Prepare interception.','Choose Intercept for 2 AP. It prepares one possible reaction to enemy flight. No attack happens yet; no suitable enemy flight means no reaction.'],repair:['Repair the damaged ship.',`Choose Damage control for 2 AP. It restores up to ${u.repair_amount||1} hull using a finite repair use. It cannot restore a sunk ship.`],rearm:['Service this aircraft.','Choose Service for 2 aircraft AP. The legal order checks the nearby usable friendly field and supplies. It restores 1 strength and reloads the bomber; service stores are finite on this Current mission.']};
    return out(...copy[c.kind],{control:c.control});
   }
   if(r.step===3)return out(kind==='naval'?'Search is not ready.':'Interception is not ready.',kind==='naval'?'A surviving carrier needs an unused search and enough AP. End turn to refresh, or review this idea without claiming a search.':'A fighter needs 2 AP and must not already be intercepting. End turn to refresh, or review without claiming an order.',{control:'end'},false,true);
   if(r.step===4)return out('No legal attack yet.',kind==='naval'?'A gun or torpedo shot needs a spotted target, a clear surface lane, range and 2 AP. Carrier strikes also need a spotted target. Move, search or end turn to create an opportunity. Review instead records reading—not firing.':'Fighters need an air target; bombers need a spotted surface target and a bomb load. Keep 2 AP for the attack. Move or end turn to find an opportunity; Review instead does not count as combat practice.',{control:'orders'},false,true);
   return out(kind==='naval'?'Keep repairs and torpedoes in reserve.':'Plan the return before spending bombs.',kind==='naval'?'No repair is legal now. An undamaged ship does not need repair. Damage control costs 2 AP and a finite use; torpedoes and smoke are separate supplies. You do not need to take damage for this lesson.':'No service is legal now. A full-strength, fully loaded flight needs none. Return a depleted flight within 1 hex of a usable friendly field, keep 2 AP and check the field’s finite stores. This mission services nearby aircraft without a separate landing order.',{control:'orders'},false,true);
  }
  if(r.step===6)return out('Finish your army’s orders.','Check your other units, then choose End turn and confirm. Each unit keeps its own AP. Preparing interception does not end the turn.',{control:'end'});
  if(r.step===7)return out('Wait for control to return.','When the enemy finishes and the replay ends, the next step appears. Do not repeat an order while waiting.');
  const combat=r.practice.includes('4'),care=r.practice.includes('5');
  return out('Take command from here.',`${ww2Briefing.mission(state).goal} ${combat?'You gave an attack order.':'Weapons were reviewed; firing has not been practiced.'} ${care?'You used recovery/service.':'Recovery/service was reviewed, not performed.'} Keep playing this battle. Field coach remains available.`,{pos:goal()},true);
 }
 function complete(kind,text,review=false){const r=memory.runs[kind];if(!r||r.done)return;r.done=true;r.feedback=text;const list=review?r.review:r.practice;if(!list.includes(String(r.step)))list.push(String(r.step));save();schedule();}
 function confirmOrder(kind,action,b){
  const r=memory.runs[kind];if(!active()||active()!==kind||r.done||!b||state.code!==b.code||(state.battle_number||1)!==b.battle||b.side!==state.side||state.revision<=b.revision)return;
  if(r.step===2&&action==='move'){
   const old=b.units.find(u=>u.id===r.unit),u=state.units.find(u=>u.id===r.unit&&u.side===state.side);
   if(old&&u&&!same(old.pos,u.pos))complete(kind,`Movement confirmed at ${hex(u.pos)}. ${u.hp>0?`${u.ap} AP remain.`:'The unit was lost during the resolved move.'}${u.hp>0&&u.hp<old.hp?' Reaction fire caused strength loss.':''}`);
  }
  const expected=r.step===3?(kind==='naval'?['recon']:['overwatch']):r.step===4?(kind==='naval'?['fire','torpedo','airstrike']:['fire']):r.step===5?(kind==='naval'?['repair']:['rearm']):[];
  if(expected.includes(action)){
   const u=state.units.find(v=>v.id===b.selected&&v.side===state.side),old=b.units.find(v=>v.id===b.selected);
   if(!old||!profiles[kind].kinds.includes(old.kind))return;
   if(r.step===3&&(kind==='naval'&&old.kind!=='carrier'||kind==='air'&&old.kind!=='fighter'))return;
   const event=state.last_combat,combat=r.step===4;
   complete(kind,(combat?(event?.revision>b.revision?event.result:'Attack order confirmed. Read the battle report for its result.'):action==='recon'?'Search confirmed. Only revealed contacts may be targeted.':action==='overwatch'?'Interception prepared. This is not an attack already made.':action==='repair'?'Damage control confirmed.':'Aircraft service confirmed.')+(u?` ${u.ap} AP remain.`:'')+(combat?' A miss also counts as practice.':''));
  }
  if(r.step===6&&action==='end'){r.endRound=b.round;complete(kind,'Turn accepted. Watch or skip the opponent’s recorded orders.');}
 }
 function recover(kind){
  const r=memory.runs[kind];if(r.done)return;
  if(r.step===1&&canAct()&&!pending()){
   const u=state.units.find(v=>v.id===selected&&ours(v)&&profiles[kind].kinds.includes(v.kind)&&state.legal[v.id]?.moves?.length);
   if(u){r.unit=u.id;complete(kind,`${unitName(u)} selected. ${u.ap} AP. Selection spent nothing.`);}
  }
  if(r.step===7&&Number.isInteger(r.endRound)&&!busy&&!playbackSession&&!state.computer_work?.pending&&(state.winner||state.turn===state.side&&state.round>r.endRound))complete(kind,state.winner?'The turn sequence ended this battle.':'YOUR TURN has returned. Your surviving units can act again.');
  if(!r.baseline)return;
  for(const h of state.action_history||[]){if(r.done)break;if(h.side!==state.side||h.revision<=r.since||h.revision>state.revision||!h.action)continue;if(r.step===2&&h.action.unit!==r.unit)continue;confirmOrder(kind,h.action.kind,{...r.baseline,selected:h.action.unit||r.baseline.selected});}
 }
 function advance(){const kind=active();if(!kind||busy||playbackSession)return;const r=memory.runs[kind],i=instruction(kind);if(!r.done&&!i.manual)return;
  if(state.winner||r.step===8){r.completed=true;r.paused=true;save();schedule();notify(`${profiles[kind].name} introduction complete. Reviewed lessons are not recorded as practiced orders.`);return;}
  if(!r.done)complete(kind,'Reviewed.',true);r.step++;r.done=false;r.feedback='';r.since=state.revision;r.baseline=snapshot();save();lastSignature='';schedule();requestAnimationFrame(()=>{if(active()===kind){$t('domainTrainingTitle').focus({preventScroll:true});if([1,2].includes(r.step))locate();}});
 }
 function point(spec){marker();if(!spec||busy||playbackSession)return;
  if(spec.control){$t(spec.control)?.classList.add('domain-training-focus');return;}
  const u=spec.unit&&state.units.find(v=>v.id===spec.unit),pos=u?.pos||spec.pos;if(!pos)return;
  if(u&&!(window.signalSnapshot?.(state)||state).units.some(v=>v.id===u.id))return;
  const svg=$t('map'),g=document.createElementNS(svg.namespaceURI,'g'),[x,y]=center(...pos);g.id='domainTrainingMarker';g.setAttribute('aria-hidden','true');g.setAttribute('pointer-events','none');
  for(const [radius,cls]of [[29,'first-command-ring'],[34,'first-command-ring-outer']]){const c=document.createElementNS(svg.namespaceURI,'circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',radius);c.setAttribute('class',cls);g.append(c);}svg.append(g);
 }
 function locate(){const kind=active();if(!kind||busy||playbackSession)return;const f=instruction(kind).focus;if(!f)return;
  if(f.unit||f.pos){const u=f.unit&&state.units.find(v=>v.id===f.unit),pos=u?.pos||f.pos;if(!pos)return;for(const d of document.querySelectorAll('dialog[open]'))d.close();
   const tile=$t('map').querySelector(`.hex[data-x="${pos[0]}"][data-y="${pos[1]}"]`),box=tile?.getBoundingClientRect();
   if(innerWidth<1100&&box&&Math.min(box.width,box.height)<38&&!$t('mapWrap').classList.contains('enlarged')&&!$t('zoom')?.disabled)$t('zoom')?.click();
   focusMapUnit({pos});requestAnimationFrame(()=>{if(active()===kind)focusMapUnit({pos});});
  }else{const n=$t(f.control);if(!n)return;const d=n.closest('dialog');if(d&&!d.open){if(d.classList.contains('mobile-battle-sheet'))window.ww2Mobile?.openSheet(d.id);else{for(const open of document.querySelectorAll('dialog[open]'))open.close();d.showModal();}}window.ww2ExperimentalDesktop?.openContaining(n);window.ww2BattleNavigation?.openContaining(n);for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;n.scrollIntoView({block:'nearest',inline:'nearest'});n.focus?.({preventScroll:true});}schedule();
 }
 function pause(){const k=current();if(k){memory.runs[k].paused=true;save();schedule();}}
 async function start(kind,force=false){
  if(!profiles[kind]||starting||busy||playbackSession){notify('Finish the order or replay before opening a tutorial.');return;}
  const p=profiles[kind],old=memory.runs[kind];
  if(force&&!confirm('Start a separate new practice attempt? Existing battles remain saved.'))return;
  if(!force&&visible()&&match(kind)&&!old.completed){old.paused=false;for(const d of document.querySelectorAll('dialog[open]'))d.close();save();schedule();return;}
  const seat=!force&&old&&!old.completed?savedSessions.find(s=>s.code===old.code):null;
  starting=true;$t('domainTrainingStatus').textContent=seat?'Resuming your saved practice…':'Creating a separate practice battle…';window.ww2FirstCommand?.pause();pause();
  for(const d of document.querySelectorAll('dialog[open]'))d.close();let entered=false;
  await run(async()=>{
   if(seat){const value=await apiWithSession(seat);if(value.scenario?.id!==p.scenario||(value.battle_number||1)!==old.battle||value.side!==p.side)throw new Error('This practice battle changed. Start a new attempt from the tutorial card.');remember(seat);state=value;old.paused=false;old.baseline=old.baseline||snapshot();}
   else{const created=await api('/api/match',{ruleset:'dsl',opponent:'computer',scenario:p.scenario,side:p.side});remember(created);memory.runs[kind]={code:created.code,battle:1,step:0,since:0,paused:false,completed:false,done:false,feedback:'',practice:[],review:[]};save();state=await apiWithSession(session);Object.assign(memory.runs[kind],{battle:state.battle_number||1,since:state.revision,baseline:snapshot()});}
   save();entered=true;render();
  });starting=false;$t('domainTrainingStatus').textContent=entered?'':'Practice could not open. Check the connection message. Existing battles remain saved.';schedule();
 }
 function placement(){
  const d=[...document.querySelectorAll('dialog[open]')].find(n=>['dadOrders','mobileUnitDetails','experimentalUnitDetails','mobileRoster','experimentalRoster','battleViewSettings','orderGuide'].includes(n.id));
  const parent=d||document.body;if(rail.parentNode!==parent){if(d){const h=d.querySelector('.mobile-sheet-heading,.battle-view-heading');h?h.after(rail):d.prepend(rail);}else parent.append(rail);}
  rail.classList.toggle('training-inline',!!d);const reserve=!rail.hidden&&!d;document.body.classList.toggle('domain-training-active',reserve);document.documentElement.style.setProperty('--domain-training-space',reserve?`${Math.ceil(rail.getBoundingClientRect().height)}px`:'0px');
 }
 function paint(){frame=0;
  for(const [kind,p]of Object.entries(profiles)){const r=memory.runs[kind],exists=r&&!r.completed&&(match(kind)||savedSessions.some(s=>s.code===r.code));$t(`${kind}TrainingStart`).textContent=exists?`Resume ${kind} tutorial`:`Start ${kind} tutorial`;$t(`${kind}TrainingStart`).disabled=starting||busy||!!playbackSession;$t(`${kind}TrainingSaved`).textContent=exists?`Step ${r.step+1}/9 · ${p.steps[r.step]}`:r?.completed?'Introduction completed · practice again any time':'Separate saved battle · Current rules';$t(`${kind}TrainingNew`).hidden=!exists;$t(`${kind}TrainingNew`).disabled=starting||busy||!!playbackSession;}
  const kind=active(),currentKind=current(),r=memory.runs[kind];rail.hidden=!kind;document.body.classList.toggle('domain-training-guiding',!!kind);resume.hidden=!visible()||!currentKind||memory.runs[currentKind].completed||!memory.runs[currentKind].paused||!!document.querySelector('dialog[open]');
  if(!resume.hidden){const b=$t('mapWrap').getBoundingClientRect();resume.textContent=`Resume ${currentKind} tutorial`;resume.style.top=(b.top+8)+'px';resume.style.right=Math.max(8,innerWidth-b.right+8)+'px';}
  if(!kind){marker();document.body.classList.remove('domain-training-active');document.documentElement.style.removeProperty('--domain-training-space');if(rail.parentNode!==document.body)document.body.append(rail);return;}
  recover(kind);const i=instruction(kind),p=profiles[kind],sig=JSON.stringify([kind,r.step,r.done,i]);
  if(sig!==lastSignature){lastSignature=sig;rail.dataset.domain=kind;rail.dataset.complete=String(r.done);$t('domainTrainingStep').textContent=`${p.name.toUpperCase()} · ${r.step+1} / 9`;$t('domainTrainingTitle').textContent=i.title;$t('domainTrainingText').textContent=i.text;$t('domainTrainingReceipt').textContent=r.done?(r.review.includes(String(r.step))?'Reviewed · not practiced':'Confirmed by the game'):'';$t('domainTrainingDots').replaceChildren(...p.steps.map((text,j)=>{const li=make('li');li.setAttribute('aria-label',`${j+1}. ${text}`);li.dataset.status=j<r.step?'done':j===r.step?'current':'later';if(j===r.step)li.setAttribute('aria-current','step');return li;}));}
  $t('domainTrainingNext').hidden=!(r.done||i.manual);$t('domainTrainingNext').disabled=busy||!!playbackSession;$t('domainTrainingNext').textContent=r.step===8||state.winner?'Finish introduction':r.step===0?'I understand →':'Continue →';$t('domainTrainingReview').hidden=!i.review;$t('domainTrainingFind').hidden=!i.focus;$t('domainTrainingFind').disabled=busy||!!playbackSession;point(i.focus);placement();
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
 $t('domainTrainingFind').onclick=locate;$t('domainTrainingPause').onclick=pause;$t('domainTrainingNext').onclick=advance;
 $t('domainTrainingReview').onclick=()=>{const k=active();if(k&&canAct()&&instruction(k).review)complete(k,'Read this lesson without performing the order. Return to practice when the battlefield provides an opportunity.',true);};
 $t('lessonIgnore')?.addEventListener('click',()=>{for(const r of Object.values(memory.runs))r.paused=true;save();schedule();});
 for(const event of ['ww2:render','ww2:selection','ww2:layout','ww2:playback','ww2:experience'])document.addEventListener(event,schedule);
 document.addEventListener('ww2:busy',()=>{if(busy)before=snapshot();schedule();});
 document.addEventListener('ww2:order',e=>{const kind=active();if(kind&&e.detail?.code===state.code&&e.detail.battle===(state.battle_number||1))confirmOrder(kind,e.detail.kind,before);schedule();});
 document.addEventListener('ww2:before-layout',()=>{document.body.append(rail);marker();});document.addEventListener('close',schedule,true);
 new MutationObserver(schedule).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});new MutationObserver(schedule).observe($t('game'),{attributes:true,attributeFilter:['hidden']});new ResizeObserver(()=>{if(active())placement();}).observe(rail);window.addEventListener('resize',schedule);
 window.ww2DomainTraining={start,pause,get progress(){return JSON.parse(JSON.stringify(memory.runs));}};schedule();
})();
