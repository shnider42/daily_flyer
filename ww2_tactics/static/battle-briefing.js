/* Public mission rules and turn state. Never count unseen enemy units. */
'use strict';
(()=>{
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 function mission(s){
  const attacker=s.factions?.us||'Americans',defender=s.factions?.de||'Germans',rounds=s.scenario.rounds;
  if(s.air_version){
   const lost=s.raid_destroyed?.length||0,defending=s.side==='us';
   return {goal:defending?`Keep at least one RAF station through round ${rounds}, or destroy every enemy bomber.`:`Destroy both RAF sector stations before round ${rounds} ends.`,
    compact:defending?`Win: defend stations · ${lost}/2 lost`:`Win: destroy stations · ${lost}/2 lost`,progress:`Stations lost: ${lost}/2 · Round ${s.round}/${rounds}`,
    rules:[`RAF win if at least one sector station survives the final round, or if every German bomber is destroyed.`,`Luftwaffe win as soon as both RAF sector stations are destroyed. Destroying fighters or radar alone does not win.`,`The ${rounds}-round limit includes both sides’ final turns. Bombers must still have ordnance and a legal target; friendly airfields can reload them.`],focus:[5,3]};
  }
  if(s.naval_version){
   const score=s.sea_score||{us:0,de:0};
   return {goal:'Reach 6 control points, or sink every enemy carrier.',compact:`Win: 6 points or carriers · ${score[s.side]}/6`,progress:`US ${score.us}/6 · Japan ${score.de}/6 · Round ${s.round}/${rounds}`,
    rules:[`Either fleet wins by reaching 6 control points or sinking every enemy carrier.`,
     `At the end of your turn, earn 1 point if your units are the only side within two hexes of ★.${s.scenario.island_objectives?.length?' Each flagged outpost occupied by your amphibious infantry adds another point.':''}`,
     `If round ${rounds} ends without a winner, higher control score wins. A tied score uses total remaining strength; an exact tie goes to Japan. Hidden fleet strength is not shown here.`],focus:s.scenario.objective};
  }
  if(s.linked_front_version){
   const attack=s.side==='us',hold=s.hold||0;
   return {goal:attack?'Hold the town AND either beach exit with infantry for two consecutive turn endings.':`Break the town-to-beach link; prevent two linked holds through round ${rounds}.`,
    compact:`Win: town + an exit · ${hold}/2 holds`,progress:`Linked American hold: ${hold}/2 · Round ${s.round}/${rounds}`,
    rules:['Americans must occupy the inland command post and at least one causeway exit simultaneously when ending two consecutive turns. Losing either required link resets the hold immediately.',
     'Only infantry can garrison an objective, including pinned infantry. Tanks, guns, amphibious sections, boats, passengers and off-map reserves cannot garrison. German infantry can replace an American garrison.',
     `Germans win when their round ${rounds} ends without an American victory. Either side can also win by eliminating every enemy unit, including reserves.`,
     'Objective flags are public mission signals. They report the garrison’s side only; nearby hidden units and their strength remain concealed.',
     s.scenario.reinforcement_brief,'This is a fictional compressed Normandy-inspired playtest, not a reconstruction or an ASL rules simulation.'],focus:s.scenario.objective};
  }
  const attack=s.side==='us',objective=s.scenario.objective_name,hold=s.hold||0;
  return {goal:attack?`Hold ${objective} at the end of two of your turns in a row.`:`Keep the attackers from holding ${objective} twice in a row; survive through round ${rounds}.`,
   compact:attack?`Win: hold ★ for 2 turns · ${hold}/2`:`Win: deny ★ to R${rounds} · enemy ${hold}/2`,progress:`${attacker} hold: ${hold}/2 · Round ${s.round}/${rounds}`,
   rules:[`${attacker} must occupy ★ when ending two consecutive turns. Merely reaching it does not win. Losing the objective breaks the hold immediately.`,
    `${defender} win if the attackers have not won when the defenders end round ${rounds}.`,
    `Either side also wins by eliminating every enemy unit. Resigning awards the battle to the opponent. Fog hides enemy strength, so no hidden unit counts are used in this briefing.`],focus:s.scenario.objective};
 }
 function phase(s){
  if(s.winner)return {id:'finished',title:s.winner===s.side?'VICTORY':'DEFEAT',text:s.resigned_by?`${s.factions?.[s.resigned_by]||names[s.resigned_by]} resigned. This battle has ended.`:'This battle has ended. Open the mission for the result.'};
  if(!s.ready)return {id:'waiting',title:'WAITING FOR A PLAYER',text:'Share the invitation. Orders unlock when your opponent joins.'};
  if(playbackSession)return {id:'replay',title:'WATCHING THE REPLAY',text:'Pause, step through or finish the replay before issuing orders.'};
  if(busy)return {id:'sending',title:'RESOLVING ORDERS',text:s.ai_side?'Your order and the computer’s response are being resolved.':'Waiting for the server to confirm the order.'};
  if(s.turn!==s.side)return {id:'opponent',title:'OPPONENT’S TURN',text:'You can inspect the battlefield. Your orders unlock when their turn ends.'};
  if(s.order_history?.redo_required)return {id:'redo',title:'YOUR TURN · REDO FIRST',text:'Restore the revealed dice result with Redo before giving a new order.'};
  return {id:'yours',title:'YOUR TURN',text:'Choose a unit, issue orders, then press End turn when ready.'};
 }
 const button=node('button','battleMission'),desktopSlot=document.createComment('mission button home'),missionRow=document.querySelector('.mission');
 button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','missionDialog');
 missionRow.append(desktopSlot,button);missionRow.classList.add('has-mission-brief');
 const dialog=node('dialog','missionDialog');dialog.setAttribute('aria-labelledby','missionTitle');
 const close=node('button','missionClose','Back to battle');close.onclick=()=>dialog.close();
 const heading=node('h2','missionTitle','How to win'),goal=node('p','missionGoal'),progress=node('p','missionProgress'),list=node('ul','missionRules'),result=node('p','missionResult'),find=node('button','missionFind','Find the objective');
 find.onclick=()=>{dialog.close();const point=mission(state).focus;if(point)focusMapUnit({pos:point});};
 const flags=node('p','missionFlags'),sectors=node('nav','missionSectors');sectors.setAttribute('aria-label','Jump to battlefield sector');
 dialog.append(close,heading,result,goal,progress,flags,sectors,list,find);document.body.append(dialog);
 const live=node('div','battleAnnouncer');live.className='screen-reader-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');document.body.append(live);
 let announcement='',timer=null,lastPaint='',lastMobile=null;
 function open(){if(!state||$('game').hidden)return;fill();for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();if(!dialog.open)dialog.showModal();}
 button.onclick=open;
 function fill(){
  const m=mission(state);if(state.scenario.doctrine){m.rules=[...m.rules,'Your force: '+state.scenario.doctrine[state.side],state.scenario.historical_note,'Communications: each platoon spots locally. Radio reports allow distant mortar aiming, but never unlock direct fire on an unseen unit.'];}goal.textContent=m.goal;progress.textContent=m.progress;
  list.replaceChildren(...m.rules.map(t=>node('li',null,t)));
  flags.hidden=!state.linked_front_version;flags.textContent=(state.scenario.linked_objectives||[]).map(p=>`${p.name}: ${state.objective_control?.[p.id]?sideLabel(state.objective_control[p.id]):'Ungarrisoned'}`).join(' · ');
  sectors.replaceChildren(...(state.scenario.sectors||[]).map(s=>{const b=node('button',null,s.name);b.type='button';b.onclick=()=>{dialog.close();focusMapUnit({pos:s.pos});};return b;}));
  result.hidden=!state.winner;result.textContent=state.winner?`${state.factions?.[state.winner]||names[state.winner]} won.${state.resigned_by?' The opponent resigned.':''}`:'';
  find.textContent=state.air_version?'Find a sector station':'Find ★ on the map';
 }
 function sync(){
  if(!state||$('game').hidden||lobbyMode){dialog.close();clearTimeout(timer);announcement='';lastPaint='';return;}
  const m=mission(state),p=phase(state),mobile=$('mobileBattleTop');
  const paintKey=[state.code,state.battle_number,state.side,state.round,state.match_name,p.id,p.title,p.text,m.goal,m.compact,m.progress].join('|');
  // Unit selection cannot change this public briefing. Avoid rebuilding the
  // header on every tap: that forces large SVG maps through another layout.
  if(lastPaint===paintKey&&lastMobile===mobile)return;
  lastPaint=paintKey;lastMobile=mobile;
  missionRow.classList.toggle('has-mission-brief',!mobile);
  if(mobile){if(button.parentNode!==mobile)mobile.append(button);}else if(button.previousSibling!==desktopSlot)desktopSlot.after(button);
  button.replaceChildren(node('span',null,mobile?m.compact:'Win: '+m.goal),node('span',null,'›'));
  button.setAttribute('aria-label',`${m.goal} ${m.progress}. Open win conditions.`);
  $('game').dataset.phase=p.id;if(mobile)mobile.dataset.phase=p.id;
  const banner=$('turnBanner');banner.dataset.phase=p.id;banner.replaceChildren(node('strong',null,p.title),node('span',null,p.text));
  if(mobile){const status=$('mobileBattleStatus'),short={opponent:'THEIR TURN',waiting:'WAITING',replay:'REPLAY',sending:'RESOLVING',redo:'REDO FIRST'};status.replaceChildren(node('strong',null,short[p.id]||p.title),node('span',null,`${sideLabel(state.side)} · Round ${state.round}/${state.scenario.rounds}`));status.removeAttribute('role');status.setAttribute('aria-label',p.title+'. '+p.text);status.title=p.text;}
  $('end').textContent=p.id==='opponent'?'Opponent’s turn':p.id==='waiting'?'Waiting for player':p.id==='finished'?'Battle finished':p.id==='redo'?'Redo first':'End turn →';
  document.title=`${p.title} · ${state.match_name||state.scenario.name} · DSL`;
  const key=[state.code,state.battle_number,state.round,p.id].join(':');
  if(p.id!=='sending'&&key!==announcement){announcement=key;clearTimeout(timer);timer=setTimeout(()=>{
   if($('game').hidden)return;live.textContent=`${p.title}. Round ${state.round}. ${p.text}`;
   if(p.id==='yours'){const n=$('mobileBattleTop')||banner;n.classList.remove('turn-arrived');void n.offsetWidth;n.classList.add('turn-arrived');}
  },250);}
  if(dialog.open)fill();
 }
 window.ww2Briefing={mission,phase,open,sync};
 for(const event of ['ww2:render','ww2:playback','ww2:busy','ww2:layout'])document.addEventListener(event,sync);
 new MutationObserver(()=>{if($('game').hidden)sync();}).observe($('game'),{attributes:true,attributeFilter:['hidden']});
 sync();
})();
