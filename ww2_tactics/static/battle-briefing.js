/* Public mission rules and turn state. Never count unseen enemy units. */
'use strict';
(()=>{
 const node=(tag,id,text)=>{const n=document.createElement(tag);if(id)n.id=id;if(text)n.textContent=text;return n;};
 function mission(s){
  const attacker=s.factions?.us||'Americans',defender=s.factions?.de||'Germans',rounds=s.scenario.rounds;
  if(s.front_mode==='armored_control'){
   const score=s.front_score||{us:0,de:0};
   return {goal:'Capture three flags with armor or fighting infantry. First to 10 points.',compact:`Win: 10 points · Soviets ${score.us} / Germans ${score.de}`,progress:`Soviets ${score.us}/10 · Germans ${score.de}/10 · Round ${s.round}/${rounds}`,
    rules:['Occupy Fuel yard for 1, Rail junction for 2, Repair works for 1 point at each own turn end. Tanks and fighting infantry can capture; supply, radio, mortars, fixed guns, reserves and passengers cannot.',
     `First to 10 wins. At the end of round ${rounds}, higher score wins; Germans win an exact tie. Eliminating every enemy also wins.`,
     'Flag ownership is public mission information, not a scan of nearby hidden units. Facility names are landmarks: they do not give free repairs, ammunition or fuel.',
     'Supplies are finite: 3 packs per supply squad; 2 AP and one pack restore up to 2 mortar shells or 1 engineer repair kit to an adjacent ally. Each recipient once per round. No AP, health or firing cooldown is restored.',s.scenario.reinforcement_brief],focus:s.scenario.objective};
  }
  if(s.front_mode==='evacuation'){
   const count=s.evacuated_count||0,ally=s.side==='us';
   return {goal:ally?`Evacuate 6 of 8 marked infantry units before round ${rounds} ends.`:`Prevent six Allied evacuations through round ${rounds}.`,compact:`Rescued ${count}/6 · deadline R${rounds}`,progress:`${count}/6 rescued · Round ${s.round}/${rounds}`,
    rules:['Only infantry marked RESCUE counts. French rearguards, the Matilda and supply squad buy time; they do not count toward six.',
     'Select a boat and Load adjacent marked infantry (1 infantry AP). Sail to any water hex on the top edge. Evacuate costs 1 boat AP, saves one whole unit and empties the boat. Return for another trip.',
     `Six rescued units wins immediately. If fewer than six can still be rescued, every rescue boat is destroyed, or round ${rounds} ends first, Germany wins. Resign and army elimination still end the battle.`,
     'Beach lanes and the East mole are embarkation routes. Boats stay on water and carry one unit. There are three boats, with no automatic replacements.',
     'Evacuation commits earlier undo orders. The rescue count is public, but enemy manifests and individual survivors’ strength remain private.'],focus:[9,3]};
  }
  if(s.joint_ops_version){
   const score=s.joint_score||{us:0,de:0};
   return {goal:'Reach 10 control points. Ships take the sea lane; infantry take the two land flags.',
    compact:`Win: 10 points · Allies ${score.us} / Axis ${score.de}`,progress:`Allies ${score.us}/10 · Axis ${score.de}/10 · Round ${s.round}/${rounds}`,
    rules:['At the end of your turn, each uncontested objective you occupy earns 1 point. Warships occupy the sea zone within one hex; infantry must stand on a land flag. Aircraft, armor, fixed guns, passengers and reserves cannot capture land flags.',
     `First to 10 points wins. At the end of round ${rounds}, higher score wins; Axis wins an exact tie. Eliminating every enemy also wins. Losing a carrier, bomber or airfield alone does not end Fubar.`,
     'One surface unit and one aircraft can share a hex. Use Both / Surface / Air above the map; tap a stacked counter to choose which unit you mean. These controls change only your view, never fog of war.',
     'Radar spots the air layer, not distant ground. Aircraft spot surface units within 4 hexes, or 2 in concealment. Fighters and AA attack aircraft; bombers attack the surface. Smoke hides surface targets, not aircraft.',
     'Carrier search and strike are abstract support sorties, separate from the movable fighter and bomber units. Airfields service aircraft. Cruiser escorts protect against carrier sorties; fixed AA, Flak and fighter overwatch intercept movable planes.',
     s.scenario.reinforcement_brief],focus:s.scenario.objective};
  }
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
  if(s.airborne_version){
   const hold=s.hold||0;
   return {goal:s.side==='us'?'Hold the command post AND either canal exit with infantry for two consecutive turn endings.':`Break the Allied canal link; hold out through round ${rounds}.`,
    compact:`Win: post + canal exit · ${hold}/2 holds`,progress:`Linked Allied hold: ${hold}/2 · Round ${s.round}/${rounds}`,
    rules:[s.scenario.linked_brief,'Only infantry can garrison, including pinned infantry. Tanks, guns, passengers and off-map reserves cannot. Losing either required link immediately resets the hold.',
     'Three reserve squads; one commander airlift per Allied round for 3 AP. Any hex may be requested. A natural 1 loses the squad before spotting; higher rolls scatter less. Hidden Flak may intercept.',
     'Successful arrivals have only 1 AP until their next turn. Water costs 2 strength at each own turn end; swim ashore for 1 AP. Woods and other rough landings cost 1 strength.',
     'Pathfinders spend 2 AP on a one-use beacon: aims within two hexes scatter one hex less. Moving or attacking ends it. Pinning disables it.',
     'Objective flags are public. Either side can also win by eliminating every enemy, including airborne reserves. Airlifts and beacons commit undo.'],focus:s.scenario.objective};
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
 function displayed(){return playbackSession&&state?.front_mode?{...state,...playbackSession.frames[playbackSession.index][playbackSession.phase]}:state;}
 function phase(s){
  if(playbackSession)return {id:'replay',title:'WATCHING THE REPLAY',text:'Pause, step through or finish the replay before issuing orders.'};
  if(s.winner)return {id:'finished',title:s.winner===s.side?'VICTORY':'DEFEAT',text:s.resigned_by?`${s.factions?.[s.resigned_by]||names[s.resigned_by]} resigned. This battle has ended.`:'This battle has ended. Open the mission for the result.'};
  if(s.coop?.phase==='lobby')return {id:'waiting',title:'HOST SETTING UP',text:'Choose a command group. The host starts after everyone has joined.'};
  if(s.deployment?.phase==='planning')return {id:'prebattle',title:s.coop?.done?'WAITING FOR TEAM':s.deployment.locked[s.side]?'PLAN LOCKED':'PRE-BATTLE',text:s.coop?(s.coop.done?'Your placements are final. The plan locks after every teammate finishes.':'Place your own units, then Finish my preparation. The army captain sets shared support.'):s.deployment.locked[s.side]?'Waiting for the other plan. Enemy preparations remain private.':'Arrange your force and support plan, then review and lock. No AP is spent.'};
  if(!s.ready)return {id:'waiting',title:'WAITING FOR A PLAYER',text:'Share the invitation. Orders unlock when your opponent joins.'};
  if(busy)return {id:'sending',title:'RESOLVING ORDERS',text:s.ai_side?'The server is confirming the order. The computer takes its full turn only after End turn.':'Waiting for the server to confirm the order.'};
  if(s.coop?.needs_advance)return {id:'computer',title:s.coop.resolving?'COMPUTERS GIVING ORDERS':'COMPUTER GROUPS READY',text:s.coop.resolving?'Computer groups act in short batches. If the player continuing them disconnects, open Team orders and Advance computer turn to take over.':'Open Team orders and Advance computer turn to continue after human commands are lost.'};
  if(s.turn!==s.side)return {id:'opponent',title:'OPPONENT’S TURN',text:'You can inspect the battlefield. Your orders unlock when their turn ends.'};
  if(s.coop?.done)return {id:'teamwait',title:'WAITING FOR TEAM',text:'Your orders are finished. Waiting for '+s.coop.waiting_for.map(id=>s.coop.players.find(p=>p.id===id)?.name||'a teammate').join(', ')+'.'};
  if(s.coop&&!s.coop.controlled.length)return {id:'watching',title:'WATCHING YOUR ARMY',text:'Your command is computer controlled. You can inspect the battlefield and watch replays.'};
  if(s.coop)return {id:'yours',title:'YOUR COMMAND',text:'Give orders to your assigned units, then Finish my orders. Computer allies act when everyone on your army is done.'};
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
  const shown=displayed(),m=mission(shown);if(state.scenario.doctrine){m.rules=[...m.rules,'Your force: '+state.scenario.doctrine[state.side],state.scenario.historical_note,'Communications: each platoon spots locally. Radio reports allow distant mortar aiming, but never unlock direct fire on an unseen unit.'];}goal.textContent=m.goal;progress.textContent=m.progress;
  if(state.deployment_version)m.rules.push('This operation starts with private pre-battle deployment. Both armies lock their plans before naval fire and round 1. See How it works in the preparation panel.');
  for(const shot of state.prebattle_impacts||[])m.rules.push(`Opening naval fire: aimed at ${hexColumn(shot.aim[0])}${shot.aim[1]+1}, d6 ${shot.roll}, landed at ${hexColumn(shot.impact[0])}${shot.impact[1]+1} and neighboring hexes. Enemy casualties unconfirmed.`);
  list.replaceChildren(...m.rules.map(t=>node('li',null,t)));
  flags.hidden=!state.linked_front_version;flags.textContent=(state.scenario.linked_objectives||[]).map(p=>`${p.name}: ${state.objective_control?.[p.id]?sideLabel(state.objective_control[p.id]):'Ungarrisoned'}`).join(' · ');
  sectors.replaceChildren(...(state.scenario.joint_objectives||state.scenario.sectors||[]).map(s=>{const b=node('button',null,s.name);b.type='button';b.onclick=()=>{dialog.close();focusMapUnit({pos:s.pos});};return b;}));
  if(state.joint_ops_version){flags.hidden=false;flags.textContent=(state.joint_control||[]).map(p=>`${p.name}: ${p.contested?'Contested':p.owner?sideLabel(p.owner):'Unoccupied'}`).join(' · ');}
  if(shown.front_control){flags.hidden=false;flags.textContent=shown.front_control.map(p=>`${p.name} +${p.points}: ${p.owner?sideLabel(p.owner):'Unoccupied'}`).join(' · ');}
  result.hidden=!shown.winner;result.textContent=shown.winner?`${state.factions?.[shown.winner]||names[shown.winner]} won.${shown.resigned_by?' The opponent resigned.':''}`:'';
  find.textContent=state.air_version?'Find a sector station':'Find ★ on the map';
 }
 function sync(){
  if(!state||$('game').hidden||lobbyMode){dialog.close();clearTimeout(timer);announcement='';lastPaint='';return;}
  const shown=displayed(),m=mission(shown),p=phase(state),mobile=$('mobileBattleTop');
  const compact=!!mobile||state.ruleset==='dsl'&&window.ww2Desktop?.active&&window.ww2ViewMode?.mode==='experimental';
  const paintKey=[state.code,state.battle_number,state.side,state.round,state.match_name,p.id,p.title,p.text,m.goal,m.compact,m.progress,compact].join('|');
  // Unit selection cannot change this public briefing. Avoid rebuilding the
  // header on every tap: that forces large SVG maps through another layout.
  if(lastPaint===paintKey&&lastMobile===mobile)return;
  lastPaint=paintKey;lastMobile=mobile;
  missionRow.classList.toggle('has-mission-brief',!mobile);
  if(mobile){if(button.parentNode!==mobile)mobile.append(button);}else if(button.previousSibling!==desktopSlot)desktopSlot.after(button);
  button.replaceChildren(node('span',null,compact?m.compact:'Win: '+m.goal),node('span',null,'›'));
  button.setAttribute('aria-label',`${m.goal} ${m.progress}. Open win conditions.`);
  $('game').dataset.phase=p.id;if(mobile)mobile.dataset.phase=p.id;
  const banner=$('turnBanner');banner.dataset.phase=p.id;banner.replaceChildren(node('strong',null,p.title),node('span',null,p.text));
  if(mobile){const status=$('mobileBattleStatus'),short={opponent:'THEIR TURN',waiting:'WAITING',teamwait:'TEAM WAIT',computer:'AI READY',watching:'WATCHING',replay:'REPLAY',sending:'RESOLVING',redo:'REDO FIRST'};status.replaceChildren(node('strong',null,short[p.id]||p.title),node('span',null,`${sideLabel(state.side)} · ${state.deployment?.phase==='planning'?'Before round 1':`Round ${shown.round}/${state.scenario.rounds}`}`));status.removeAttribute('role');status.setAttribute('aria-label',p.title+'. '+p.text);status.title=p.text;}
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
