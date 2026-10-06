/* A shared command room. The server owns assignments, readiness and all dice. */
'use strict';
(()=>{
 const node=(tag,text,id)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(id)n.id=id;return n;};
 const button=(text,id,fn)=>{const n=node('button',text,id);n.type='button';n.onclick=fn;return n;};
 const room=node('section',null,'coopRoom');room.hidden=true;room.setAttribute('aria-labelledby','coopRoomTitle');
 room.innerHTML='<div class="coop-heading"><button id="coopHome" type="button">Home</button><span class="eyebrow">CO-OP &amp; TEAMS</span></div><h1 id="coopRoomTitle">Command room</h1><p id="coopRoomMap"></p><p>Choose an army and one command group. The host also controls their army’s commander, if the map has one. Everyone else keeps their own orders. Unclaimed groups become computer controlled when the host starts.</p><div class="coop-invite"><label for="coopInvite">Invite players</label><input id="coopInvite" readonly><button id="coopCopy" type="button">Copy invitation</button></div><section class="coop-choice"><h2>Your command</h2><label for="coopSide">Army</label><select id="coopSide"></select><label for="coopGroup">Squad / platoon</label><select id="coopGroup"></select><button id="coopClaim" type="button">Take this command</button><p id="coopYourCommand" role="status"></p></section><div id="coopHostSettings"><label for="coopAllDifficulty">Set all unclaimed groups</label><select id="coopAllDifficulty"><option value="standard">Standard computer</option><option value="easy">Easy computer</option></select><button id="coopSetDifficulty" type="button">Apply difficulty</button><p>Standard uses the current tactical opponent. Easy makes less consistent choices and coordinates support less effectively. Both use the same dice, sight and unit stats. Experience changes explanations independently.</p></div><div id="coopAssignments"></div><div class="coop-start"><p id="coopStartHint" role="status"></p><button id="coopStart" type="button" class="primary">Start battle</button></div>';
 $('lobby').after(room);
 const teams=node('dialog',null,'coopTeamsDialog');teams.setAttribute('aria-labelledby','coopTeamsTitle');
 teams.append(button('Back to battle','coopTeamsClose',()=>teams.close()),node('h2','Shared command','coopTeamsTitle'),node('p',null,'coopTurnHelp'),node('div',null,'coopPlayers'));
 const transport=node('label',null,'coopTransportLabel'),consent=node('input',null,'coopTransport');consent.type='checkbox';
 transport.append(consent,document.createTextNode(' Allow allied players and computers to carry, unload or evacuate my troops.'));
 consent.onchange=()=>change({operation:'transport',allow:consent.checked});teams.append(transport);
 const advance=button('Advance computer turn','coopAdvance',()=>{teams.close();change({operation:'advance'});});
 const next=button('Create next co-op battle','coopNext',()=>{teams.close();$('leave').click();$('createCoop').click();});
 teams.append(advance,next);document.body.append(teams);
 const teamButton=button('Teams & computers','coopTeamsOpen',()=>{paintTeams();teams.showModal();});
 teamButton.hidden=true;document.querySelector('#battleOptions .match-tools').prepend(teamButton);
 const quick=button('Team orders','coopQuick',()=>{paintTeams();for(const d of document.querySelectorAll('dialog[open]'))d.close();teams.showModal();});
 quick.hidden=true;$('battleNavigation').append(quick);
 let commandKey='',paintKey='',difficultyKey='',currentJoin=null,autoTimer=null,autoAttempt='';
 const me=()=>state.coop.players.find(p=>p.id===state.coop.me);
 const playerName=id=>state.coop.players.find(p=>p.id===id)?.name||'Computer';
 async function change(body){
  if(busy||playbackSession)return;
  await run(async()=>{state=await api(`/api/match/${session.code}/cooperative`,{...body,revision:state.revision});});
 }
 function continueComputers(){
  clearTimeout(autoTimer);
  if(!state?.coop?.auto_advance||lobbyMode||busy||polling||playbackSession||document.hidden)return;
  const key=`${session.code}:${state.revision}`;
  if(key===autoAttempt)return;
  autoTimer=setTimeout(async()=>{
   if(!state?.coop?.auto_advance||lobbyMode||busy||polling||playbackSession||`${session?.code}:${state.revision}`!==key)return;
   autoAttempt=key;
   await run(async()=>{
    const response=await fetch(`/api/match/${session.code}/cooperative`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},body:JSON.stringify({operation:'advance',revision:state.revision})});
    const data=await response.json();
    if(response.status===409){state=await apiWithSession(session);return;}
    if(!response.ok)throw new Error(data.error||'Computer orders paused. Use Team orders to continue.');
    state=data;
   });
   continueComputers();
  },180);
 }
 function choices(){
  if(!state?.coop)return;
  const select=$('coopGroup'),old=select.value,side=$('coopSide').value,c=state.coop;
  const available=c.groups.filter(g=>g.side===side&&!g.command&&(!g.owner||g.owner===c.me));
  select.replaceChildren(...available.map(g=>new Option(`${g.label} · ${g.count} unit${g.count===1?'':'s'}${g.owner===c.me?' · yours':''}`,g.id)));
  if(available.some(g=>g.id===old))select.value=old;
  $('coopClaim').disabled=busy||!available.length;
  if(!available.length)select.append(new Option('No open groups in this army',''));
 }
 function assignments(){
  const c=state.coop;
  $('coopAssignments').replaceChildren(...['us','de'].map(side=>{
   const section=node('section');section.className='coop-army';section.append(node('h2',sideLabel(side)));
   const humans=c.players.filter(p=>p.side===side&&p.group),computers=c.groups.filter(g=>g.side===side&&!g.owner);
   section.append(node('p',`${humans.length} player${humans.length===1?'':'s'} · ${computers.length} computer group${computers.length===1?'':'s'}`));
   for(const p of humans){const group=c.groups.find(g=>g.id===p.group),row=node('p',`${p.name}${p.id===c.host?' · HOST':''} — ${group?.label||'Choosing'}${p.id===c.host&&c.groups.some(g=>g.command&&g.owner===p.id)?' + army commander':''}`);section.append(row);}
   const details=node('details'),summary=node('summary',`Computer assignments (${computers.length})`);details.append(summary);
   for(const g of computers){
    const row=node('div');row.className='coop-computer';const label=node('label',`${g.label} · ${g.count} unit${g.count===1?'':'s'}`),select=node('select');
    select.id='coopDifficulty-'+g.id.replaceAll(':','-');label.htmlFor=select.id;
    select.append(new Option('Standard','standard'),new Option('Easy','easy'));select.value=g.difficulty;select.disabled=!c.is_host||busy;
    select.onchange=()=>change({operation:'difficulty',group:g.id,difficulty:select.value});row.append(label,select);details.append(row);
   }
   section.append(details);return section;
  }));
 }
 function paintRoom(){
  const c=state.coop,p=me();
  if(difficultyKey!==state.code+':'+c.default_difficulty){difficultyKey=state.code+':'+c.default_difficulty;$('coopAllDifficulty').value=c.default_difficulty;}
  $('coopRoomTitle').textContent=state.match_name||'Command room';
  $('coopRoomMap').textContent=`${state.scenario.name} · ${battleEdition()} DSL · ${c.control_size==='platoons'?'Platoon control':'Squad / unit control'} · ${state.code}`;
  $('coopInvite').value=invitation();
  const key=`${state.code}:${c.me}:${p.group}:${p.side}`;
  if(commandKey!==key){
   $('coopSide').replaceChildren(...['us','de'].map(side=>new Option(sideLabel(side),side)));$('coopSide').value=p.side;
   commandKey=key;choices();$('coopGroup').value=p.group||$('coopGroup').value;
  }else choices();
  const group=c.groups.find(g=>g.id===p.group);
  $('coopYourCommand').textContent=group?`You: ${sideLabel(p.side)} · ${group.label}${c.is_host&&c.groups.some(g=>g.command&&g.owner===p.id)?' + army commander':''}`:'Choose a new command to rejoin, or leave your former group with the computer.';
  $('coopHostSettings').hidden=!c.is_host;$('coopStart').hidden=!c.is_host;
  $('coopStart').disabled=busy||c.players.some(p=>!p.group&&!p.retired);
  $('coopStartHint').textContent=c.is_host?'Start locks armies, player commands and computer difficulties. Friends can resume later; new players cannot claim groups after start.':'Waiting for the host to start. You can change your army and group until then.';
  const sig=JSON.stringify([state.code,c.groups,c.players,c.is_host,busy]);
  if(sig!==paintKey){const open=[...$('coopAssignments').querySelectorAll('details')].map(d=>d.open);assignments();[...$('coopAssignments').querySelectorAll('details')].forEach((d,i)=>d.open=!!open[i]);paintKey=sig;}
 }
 function handoff(pid){
  if(confirm(`Hand ${playerName(pid)}’s command to the computer?${state.coop.phase==='battle'?' This lasts for the rest of this battle. They can still watch from their army’s view.':' They can choose another available group before start.'}`))change({operation:'handoff',player:pid});
 }
 function paintTeams(){
  if(!state?.coop)return;
  const c=state.coop;
  transport.hidden=!state.units.some(u=>u.side===state.side&&['halftrack','landing_craft'].includes(u.kind))||!c.controlled.length||!!state.winner;
  consent.checked=c.transport_consent;consent.disabled=busy||c.aboard;
  transport.title=c.aboard?'Disembark before withdrawing permission.':'Your transport permission applies only to your troops.';

  $('coopTurnHelp').textContent='Each player orders only their own group; gold counter outlines mark your units. Finish my orders commits your turn; teammates keep playing. When the army’s players are done, its computer groups act, then the other army begins. Orders cannot be undone in a shared battle. Only the army captain can concede. A disconnected player keeps their command until they or the host explicitly hand it to the computer.';
  $('coopPlayers').replaceChildren(...c.players.map(p=>{
   const row=node('div');row.className='coop-player';const group=c.groups.find(g=>g.id===p.group);
   row.append(node('p',`${p.name}${p.id===c.host?' · HOST':p.captain?' · ARMY CAPTAIN':''} · ${sideLabel(p.side)} · ${group?.label||'Computer takeover'}${p.done?' · orders finished':''}`));
   if(p.id!==c.host&&p.group&&(c.is_host||p.id===c.me))row.append(button('Hand command to computer',null,()=>handoff(p.id)));
   return row;
  }));
  const computerList=node('details');computerList.append(node('summary','Computer groups & difficulty'));
  for(const g of c.groups.filter(g=>!g.owner))computerList.append(node('p',`${sideLabel(g.side)} · ${g.label} · ${g.difficulty==='easy'?'Easy':'Standard'}`));
  $('coopPlayers').append(computerList);
  advance.hidden=!c.needs_advance;advance.disabled=busy||!!playbackSession;
  next.hidden=!c.is_host||!state.winner;
 }
 function sync(){
  const c=state?.coop,on=!!c&&!lobbyMode,recruiting=on&&c.phase==='lobby';
  continueComputers();
  room.hidden=!recruiting;teamButton.hidden=quick.hidden=!on||recruiting;
  if(!on){teams.close();return;}
  if(recruiting){$('game').hidden=true;selected=null;platoonFilter=state.units.find(u=>controlsUnit(u))?.platoon||'all';paintRoom();return;}
  $('waiting').hidden=true;$('end').textContent=c.done?'Waiting for teammates':'Finish my orders';
  $('end').disabled=busy||!!playbackSession||c.done||!c.controlled.length||state.turn!==state.side||!!state.winner||state.deployment?.phase==='planning';
  const p=me(),group=c.groups.find(g=>g.id===p.group);
  $('side').textContent=`${sideLabel(state.side)} · ${group?.label||'Watching'}${c.is_host&&c.groups.some(g=>g.command&&g.owner===p.id)?' + commander':''}`;
  for(const row of $('roster').children){const owner=c.controllers[row.dataset.unitId];const text=owner===c.me?'Your command':owner?`Controlled by ${playerName(owner)}`:'Computer controlled';row.dataset.coopBaseTitle??=row.title;row.title=row.dataset.coopBaseTitle+` · ${text}`;row.dataset.coopOwned=String(owner===c.me);const meta=row.querySelector('.roster-unit-state');if(meta){meta.dataset.coopBase??=meta.textContent;meta.textContent=meta.dataset.coopBase+` · ${text}`;}}
  for(const counter of $('map').querySelectorAll('.unit[data-unit-id]'))counter.dataset.coopOwned=String(c.controlled.includes(counter.dataset.unitId));
  const selectedUnit=state.units.find(u=>u.id===selected);
  if(selectedUnit&&!controlsUnit(selectedUnit))$('unitPurpose').textContent=c.controllers[selected]?`${playerName(c.controllers[selected])} controls this unit. You can inspect it.`:'The computer controls this unit. You can inspect it.';
  if(teams.open)paintTeams();
 }
 $('coopHome').onclick=()=>$('leave').click();$('coopSide').onchange=choices;
 $('coopClaim').onclick=()=>change({operation:'claim',side:$('coopSide').value,group:$('coopGroup').value});
 $('coopSetDifficulty').onclick=()=>change({operation:'difficulty',difficulty:$('coopAllDifficulty').value});
 $('coopStart').onclick=()=>{const c=state.coop;if(confirm(`Start ${state.scenario.name} with ${c.players.filter(p=>p.group).length} players and ${c.groups.filter(g=>!g.owner).length} computer groups? Command assignments and difficulty will be locked.`))change({operation:'start'});};
 $('coopCopy').onclick=async()=>{try{await navigator.clipboard.writeText(invitation());notify('Invitation copied.');}catch{$('coopInvite').select();notify('Select and copy the invitation above.');}};
 const joinDialog=node('dialog',null,'coopJoinDialog');joinDialog.setAttribute('aria-labelledby','coopJoinTitle');
 joinDialog.innerHTML='<button id="coopJoinClose" type="button" class="dialog-back">Back</button><h2 id="coopJoinTitle">Choose your command</h2><p id="coopJoinInfo"></p><label for="coopJoinSide">Army</label><select id="coopJoinSide"></select><label for="coopJoinGroup">Squad / platoon</label><select id="coopJoinGroup"></select><p>Choose the host’s army to cooperate, or the other army to play against them. You control this group; unclaimed groups become computers at start.</p><p id="coopJoinError" role="alert"></p><button id="coopJoinSubmit" type="button" class="primary">Join this command</button>';
 document.body.append(joinDialog);
 function joinChoices(){
  const groups=currentJoin.details.groups.filter(g=>g.side===$('coopJoinSide').value&&!g.command&&!g.owner);
  $('coopJoinGroup').replaceChildren(...groups.map(g=>new Option(`${g.label} · ${g.count} unit${g.count===1?'':'s'}`,g.id)));
  $('coopJoinSubmit').disabled=currentJoin.details.phase!=='lobby'||!groups.length;
  if(!groups.length)$('coopJoinGroup').append(new Option('No groups available',''));
 }
 function join(details,submit){
  currentJoin={details,submit};$('coopJoinInfo').textContent=`${details.name} · ${details.scenario} · ${details.edition==='current'?'Current':'Legacy'} DSL`;$('coopJoinError').textContent=details.phase==='lobby'?'':'This battle has started. Only existing players can resume.';
  $('coopJoinSide').replaceChildren(...['us','de'].map(side=>new Option(details.factions[side],side)));
  const host=details.players.find(p=>p.id===details.host);$('coopJoinSide').value=host?.side||'us';joinChoices();
  for(const d of document.querySelectorAll('dialog[open]'))d.close();joinDialog.showModal();
 }
 $('coopJoinSide').onchange=joinChoices;$('coopJoinClose').onclick=()=>joinDialog.close();
 $('coopJoinSubmit').onclick=async()=>{
  $('coopJoinSubmit').disabled=true;$('coopJoinError').textContent='';
  try{await currentJoin.submit({side:$('coopJoinSide').value,group:$('coopJoinGroup').value});joinDialog.close();}
  catch(error){$('coopJoinError').textContent=error.message;}
  finally{$('coopJoinSubmit').disabled=false;}
 };
 document.addEventListener('ww2:render',sync);
 document.addEventListener('visibilitychange',continueComputers);
 setInterval(continueComputers,1500);
 new MutationObserver(sync).observe($('lobby'),{attributes:true,attributeFilter:['hidden']});
 window.ww2Cooperative={join,sync};
})();
