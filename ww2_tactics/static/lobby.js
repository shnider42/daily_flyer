/* Multiplayer discovery is server-backed; browser shortcuts remain independent. */
'use strict';
(()=>{
 let player=null,pending=null,register=false,offset=0,requestNumber=0,lastList='',renameCode=null,searchTimer,identityReady=false;
 try{const saved=JSON.parse(localStorage.getItem('ww2-commander'));if(typeof saved?.token==='string'&&typeof saved?.name==='string')player=saved;}catch{}
 window.ww2Commander={get name(){return player?.name;},get guest(){return identityReady&&!player;},get ready(){return identityReady;}};
 function storePlayer(){try{if(player)localStorage.setItem('ww2-commander',JSON.stringify(player));else localStorage.removeItem('ww2-commander');}catch{}}
 async function requestLobby(path,body,seat){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(player?{'X-Commander-Token':player.token}:{}),...(seat?{Authorization:`Bearer ${seat.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok){const e=new Error((data.error||'Unable to load games. Try again.')+(data.request_id?` Reference: ${data.request_id}`:''));e.status=response.status;throw e;}return data;
 }
 function identity(){
  $('commanderIdentity').textContent=player?`Commander ${player.name}`:'Find your games';
  $('commanderHint').textContent=player?'Your multiplayer seats follow this sign-in.':'Sign in to resume multiplayer on any device.';
  $('commanderSignIn').hidden=!!player;$('commanderSignOut').hidden=!player;
  $('adminConsoleLink').hidden=player?.name?.toLowerCase()!=='shnider42';
  renderSessions();
  document.dispatchEvent(new Event('ww2:commander'));
 }
 function mode(newPlayer){
  register=newPlayer;$('commanderLoginMode').setAttribute('aria-pressed',String(!register));$('commanderRegisterMode').setAttribute('aria-pressed',String(register));
  $('commanderSubmit').textContent=register?'Create commander':'Sign in';$('commanderPassword').autocomplete=register?'new-password':'current-password';
  $('commanderFormHint').textContent=register?'Choose a public nickname and a password you can remember. Save them in your password manager: there is no email password reset.':'Use the same name and password you chose before.';$('commanderError').textContent='';
 }
 function loginDialog(after){pending=after||null;mode(false);$('commanderPassword').value='';$('commanderDialog').showModal();}
 const ready=(async()=>{
  if(player){try{await requestLobby('/api/commander');}catch(e){if(e.status===401){player=null;storePlayer();}}}
  identityReady=true;identity();await load();
 })();
 async function ensure(after){await ready;if(player)return after();loginDialog(after);}
 $('commanderSignIn').onclick=()=>loginDialog();$('commanderLoginMode').onclick=()=>mode(false);$('commanderRegisterMode').onclick=()=>mode(true);
 $('closeCommander').onclick=()=>{$('commanderDialog').close();};
 $('commanderDialog').addEventListener('close',()=>{$('commanderPassword').value='';pending=null;});
 $('commanderForm').onsubmit=async e=>{
  e.preventDefault();$('commanderSubmit').disabled=true;$('commanderError').textContent='';
  try{
   player=await requestLobby(`/api/commander/${register?'register':'login'}`,{name:$('commanderName').value.trim(),password:$('commanderPassword').value});storePlayer();identity();
   const next=pending;pending=null;$('commanderDialog').close();offset=0;lastList='';await load();if(next)await next();
  }catch(error){$('commanderError').textContent=error.message;}finally{$('commanderSubmit').disabled=false;}
 };
 $('commanderSignOut').onclick=async()=>{
  try{await requestLobby('/api/commander/logout',{});}catch(e){notify(e.message);return;}
  const name=player?.name;player=null;storePlayer();identity();savedSessions=savedSessions.filter(s=>s.commander!==name);
  if(session?.commander===name){session=null;state=null;}persistSessions();renderSessions();offset=0;lastList='';load();
 };
 function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
 async function enter(game){
  const code=typeof game==='string'?game:game.code;
  const local=savedSessions.find(s=>s.code===code);
  if(!game.your_side&&local){
   try{const next=await apiWithSession(local);remember(local);state=next;render();return;}
   catch(e){if(!player)throw e;}
  }
  await ensure(()=>run(async()=>{
   // Joining is idempotent for a linked commander: the server resumes their
   // existing side even when both seats are occupied or armies have swapped.
   const data=await requestLobby(`/api/match/${code}/join`,{},local);data.commander=player.name;remember(data);
  }));
 }
 function display(games){
  const signature=JSON.stringify([games,savedSessions.map(s=>s.code),player?.name]);if(signature===lastList)return;lastList=signature;
  $('publicGames').replaceChildren(...games.map(g=>{
   const yours=g.your_side,local=savedSessions.some(s=>s.code===g.code),yourTurn=yours&&g.ready&&!g.winner&&g.phase!=='planning'&&g.turn===yours;
   const row=text('article','',`public-game${yourTurn?' your-turn':''}`);row.dataset.code=g.code;
   const details=document.createElement('div');details.append(text('h3',g.name));
   details.append(text('p',`${g.open_side==='us'?'Open seat':g.host_name||'Original commander'} (${g.allies||'Americans'}) vs ${g.open_side==='de'?'Open seat':g.guest_name||'Original commander'} (${g.opponent})`));
   const phase=g.winner?'Finished':g.phase==='planning'?'Pre-battle setup':!g.ready?'Waiting for opponent':yourTurn?'Your turn':yours?'Opponent’s turn':`${g.turn==='us'?g.allies||'Americans':g.opponent} to move`;
   details.append(text('p',`${phase} · Round ${g.round}${yours?` · You: ${yours==='us'?g.allies||'Americans':g.opponent}`:''}`,'game-phase'));
   details.append(text('p',`${g.scenario||'Village Crossing'} · ${(g.ruleset||'classic').toUpperCase()} · ${g.code}`));
   const button=text('button',yours||local?'Resume game':!g.full?`Join as ${g.open_side==='us'?g.allies||'Americans':g.opponent}`:player?'Both seats taken':'Sign in to resume');button.type='button';button.disabled=!!(g.full&&player&&!yours&&!local);
   button.onclick=async()=>{button.disabled=true;try{if(g.full&&!player&&!local){loginDialog(()=>load());}else await enter(g);}catch(e){notify(e.message);if(e.status===401){player=null;storePlayer();identity();loginDialog(()=>enter(g));}}finally{button.disabled=false;await load();}};
   row.append(details,button);return row;
  }));
 }
 async function load(){
  if($('lobby').hidden)return;
  const number=++requestNumber;
  const params=new URLSearchParams({q:$('lobbySearch').value,mine:$('lobbyScope').value==='mine'?'1':'0',finished:$('lobbyFinished').checked?'1':'0',offset:String(offset)});
  try{
   const data=await requestLobby('/api/lobby?'+params);if(number!==requestNumber)return;display(data.games);
   $('lobbyStatus').textContent=data.games.length?'Live game list · refreshes automatically':$('lobbyScope').value==='mine'?(player?'No linked games here yet. Start one or link an older game below.':'Sign in to see your games across devices.'):$('lobbySearch').value?'No games match that search.':'No multiplayer games yet. Start one below.';
   $('lobbyPages').hidden=!offset&&!data.has_more;$('lobbyPrevious').disabled=!offset;$('lobbyNext').disabled=!data.has_more;
  }catch(e){if(number!==requestNumber)return;if(e.status===401){player=null;storePlayer();identity();lastList='';await load();}else $('lobbyStatus').textContent=`Could not refresh games. ${e.message} Use Refresh to retry.`;}
 }
 function filter(){offset=0;load();}
 $('lobbySearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(filter,250);};$('lobbyScope').onchange=filter;$('lobbyFinished').onchange=filter;
 $('lobbyRefresh').onclick=()=>{lastList='';load();};$('lobbyPrevious').onclick=()=>{offset=Math.max(0,offset-50);load();};$('lobbyNext').onclick=()=>{offset+=50;load();};
 new MutationObserver(()=>{if(!$('lobby').hidden){lastList='';load();}}).observe($('lobby'),{attributes:true,attributeFilter:['hidden']});
 setInterval(()=>{if(!document.hidden)load();},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 function nameDialog(code){
  renameCode=code||null;$('multiplayerTeams').hidden=!!code;$('namedGameTitle').textContent=code?'Rename this game.':'Name your game.';$('namedGameSubmit').textContent=code?'Save game name':'Create multiplayer game';
  $('multiplayerName').value=code?state.match_name:`${player.name} · ${scenarios.find(s=>s.id===$('scenarioSelect').value)?.name||'New battle'}`;
  $('namedGameError').textContent='';$('namedGameDialog').showModal();
 }
 $('closeNamedGame').onclick=()=>$('namedGameDialog').close();
 $('create').onclick=()=>ensure(()=>nameDialog());
 $('namedGameForm').onsubmit=async e=>{
  e.preventDefault();$('namedGameSubmit').disabled=true;$('namedGameError').textContent='';
  try{
   if(renameCode){await requestLobby(`/api/match/${renameCode}/name`,{name:$('multiplayerName').value},session);$('namedGameDialog').close();await refresh();}
   else{
    const data=await requestLobby('/api/match',{...window.ww2BattleSetup.multiplayer(),name:$('multiplayerName').value,scenario:$('scenarioSelect').value,ruleset:$('rulesetSelect').value});data.commander=player.name;
    $('namedGameDialog').close();await run(async()=>remember(data));
   }
   lastList='';
  }catch(error){$('namedGameError').textContent=error.message;if(error.status===401){player=null;storePlayer();identity();$('namedGameDialog').close();loginDialog(()=>nameDialog());}}
  finally{$('namedGameSubmit').disabled=false;}
 };
 $('joinForm').onsubmit=async e=>{e.preventDefault();try{await enter($('code').value.trim().toUpperCase());}catch(error){notify(error.message);}};
 async function linkSeats(seats){
  let linked=0,skipped=0;
  for(const seat of seats){
   try{const s=await apiWithSession(seat);if(s.ai_side)continue;await requestLobby(`/api/match/${seat.code}/link`,{},seat);seat.commander=player.name;linked++;}
   catch{skipped++;}
  }
  persistSessions();renderSessions();lastList='';load();
  const message=`${linked} multiplayer game${linked===1?'':'s'} linked to ${player.name}.${skipped?` ${skipped} could not be linked: the seat may be unavailable or belong to another commander.`:''}`;
  $('linkResult').textContent=message;notify(message);
 }
 $('linkBrowserGames').onclick=()=>ensure(()=>linkSeats(savedSessions));
 const linkButton=text('button','Link to my commander','quiet');linkButton.id='linkCommanderSeat';linkButton.onclick=()=>{
  for(const d of document.querySelectorAll('dialog[open]'))d.close();ensure(()=>linkSeats([session]));
 };
 const renameButton=text('button','Rename game','quiet');renameButton.id='renameMultiplayer';renameButton.onclick=()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();nameDialog(session.code);};
 document.querySelector('#battleOptions .match-tools').prepend(linkButton,renameButton);
 document.addEventListener('ww2:render',()=>{linkButton.hidden=renameButton.hidden=!!state?.ai_side;});
})();
