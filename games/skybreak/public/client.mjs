import { Match, WEAPONS, RARITIES, movePlayer, buildPlacement, aimDirection, raycastWorld } from './engine.mjs';
import { terrainHeight, LANDMARKS, BUILDINGS, ROADS, TREES, PADS, WORLD_RADIUS, clamp } from './world.mjs';
import { IslandRenderer } from './renderer.mjs';
import { AudioDirector } from './audio.mjs';
import { Vector3 } from './vendor/three.module.js';

const $ = id => document.getElementById(id);
const visible = (id,yes) => $(id).classList.toggle('hidden',!yes);
const text = (id,value) => {const el=$(id),s=String(value);if(el.textContent!==s)el.textContent=s;};
const COLORS=['#64b9bd','#e8ad56','#b5a2d6','#d67f6c','#a6bd83','#e6ce8c','#6598c7','#d699b5','#9db6b1','#cf8f54'];
const touch=matchMedia('(pointer:coarse)').matches;
const standalone=window.SKYBREAK_PREVIEW===true||location.protocol==='file:';
document.body.classList.toggle('touch',touch);
const defaults={name:'Pilot',color:0,quality:'auto',difficulty:'regular',sensitivity:1,volume:.65,buildEnabled:true,aimAssist:true,invert:false,alwaysSprint:false};
let preferences={...defaults};
try{const stored=JSON.parse(localStorage.getItem('skybreak-settings')||'{}');preferences={...preferences,...stored};}catch{}
preferences.color=Number.isInteger(preferences.color)?clamp(preferences.color,0,9):0;
const save=()=>{try{localStorage.setItem('skybreak-settings',JSON.stringify(preferences));}catch{}};
let renderer,audio,mode='home',snapshot,solo=null,localId=0,spectateId=0,viewYaw=0,viewPitch=-.12;
let paused=false,mapOpen=false,settingsOpen=false,settingsFromPause=false,ignoreUnlock=false,connectedGamepad=false,activeDevice=touch?'touch':'mouse',deathReleased=false,lastPauseToggle=0;
let lastTime=performance.now(),accumulator=0,hudAccumulator=0,mapAccumulator=0,sendAccumulator=0,lastEvent=0,eventMatch='',lastMatchId='',lastPhase='',lastHp=150;
let toastTimer,damageTimer,hitTimer,lastKillEvents=[],buildGhost=null,ghostUntil=0,waypoint=null,resultsShown=false,receivedAt=0,ping=0;
let net=null,session=null,netEpoch=0,intentionalClose=false,reconnectTimer,connectTimer,reconnectAttempts=0,seq=0,predicted=null,correction={x:0,y:0,z:0},lastAuth=null,previousAuth=null;
const keys=new Set(),mouse={fire:false,aim:false},padPrevious=[],touchInput={x:0,z:0,fire:false,aim:false,jump:false,sprint:false};
const renderedPlayers=new Map();
let lastInput={moveX:0,moveZ:0,yaw:0,pitch:0,sprint:false,jump:false,fire:false,aim:false};
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const duration=s=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.ceil(Math.max(0,s))%60).padStart(2,'0')}`;
const sound=()=>{audio?.start();};
function toast(message,milliseconds=2800){clearTimeout(toastTimer);text('toast',message);visible('toast',true);toastTimer=setTimeout(()=>visible('toast',false),milliseconds);}
function connection(message){text('connection-banner',message);visible('connection-banner',!!message);}
function replaceUrl(value){try{history.replaceState(null,'',value);}catch{}}
function clearInputs(){keys.clear();mouse.fire=mouse.aim=false;touchInput.x=touchInput.z=0;touchInput.fire=touchInput.aim=touchInput.jump=false;$('move-stick').firstElementChild.style.transform='';$('touch-aim').classList.remove('active');if(session&&net?.readyState===1)send({type:'input',matchId:snapshot?.id,seq:++seq,input:{yaw:viewYaw,pitch:viewPitch}});}
function releaseMouse(){ignoreUnlock=true;if(document.pointerLockElement)document.exitPointerLock();setTimeout(()=>{ignoreUnlock=false;},150);}
function requestMouse(){if(touch||activeDevice==='gamepad'||mode!=='play'||paused||settingsOpen||mapOpen)return;try{const p=$('world').requestPointerLock();p?.catch(()=>visible('capture-mouse',true));}catch{visible('capture-mouse',true);}}
function setMode(value){mode=value;visible('home',value==='home');visible('lobby',value==='lobby');visible('hud',value==='play');visible('touch-controls',value==='play'&&touch&&!paused&&!settingsOpen&&!mapOpen&&ownPlayer()?.alive!==false);if(value!=='play'){clearInputs();releaseMouse();}document.body.dataset.mode=value;}
function ownPlayer(){return snapshot?.players?.[localId];}
function displayPlayer(){const own=ownPlayer();return own?.alive?own:snapshot?.players?.[spectateId]||own;}
function cleanName(){preferences.name=$('pilot-name').value.trim().slice(0,18)||'Pilot';$('pilot-name').value=preferences.name;save();return preferences.name;}
function options(){return{difficulty:preferences.difficulty,buildEnabled:preferences.buildEnabled};}

function resetRound(snap){
  lastMatchId=snap.id;lastEvent=0;eventMatch=snap.id;lastKillEvents=[];renderedPlayers.clear();resultsShown=false;lastPhase='';lastHp=150;waypoint=null;
  predicted=null;correction={x:0,y:0,z:0};previousAuth=null;visible('results',false);visible('spectate',false);visible('pause',false);visible('map-screen',false);mapOpen=false;paused=false;buildGhost=null;deathReleased=false;
  const p=snap.players[localId];if(p){viewYaw=p.yaw;viewPitch=p.gliding?-.35:-.12;}
  text('feed','');
}
function startSolo(){
  leaveNetwork();sound();cleanName();solo=new Match({seed:(Date.now()^Math.random()*1e9)>>>0,...options()});solo.setHuman(0,preferences.name,preferences.color);localId=0;spectateId=0;solo.start();snapshot=solo;resetRound(snapshot);setMode('play');requestMouse();text('network-label','SOLO · 9 BOTS');checkOrientation();
}
function goHome(){
  leaveNetwork();solo=null;paused=false;mapOpen=false;settingsOpen=false;resultsShown=false;visible('results',false);visible('pause',false);visible('settings',false);visible('map-screen',false);visible('rotate-hint',false);visible('storm-warning',false);$('storm-tint').style.opacity='0';$('damage-flash').style.opacity='0';
  snapshot=new Match(options());snapshot.setHuman(0,preferences.name,preferences.color);localId=0;lastMatchId='';setMode('home');connection('');replaceUrl(location.pathname); 
}

function send(value){if(net?.readyState===1){net.send(JSON.stringify(value));return true;}return false;}
function storeSession(){try{if(session)sessionStorage.setItem('skybreak-seat',JSON.stringify(session));else sessionStorage.removeItem('skybreak-seat');}catch{}}
function leaveNetwork(){
  clearTimeout(reconnectTimer);clearTimeout(connectTimer);netEpoch++;intentionalClose=true;if(net?.readyState===1){net.send(JSON.stringify({type:'leave'}));net.close(1000,'Left match');}else net?.close();net=null;session=null;storeSession();predicted=null;lastAuth=null;previousAuth=null;reconnectAttempts=0;connection('');
}
function connect(kind,code=''){
  if(standalone){toast('Online rooms use the full server build. This preview plays locally against nine bots.',5000);return;}
  sound();cleanName();solo=null;clearInputs();
  if(kind!=='resume'){leaveNetwork();connection('Connecting to the island…');}else connection('Reconnecting to your match…');
  const epoch=++netEpoch;intentionalClose=false;clearTimeout(connectTimer);clearTimeout(reconnectTimer);
  const url=new URL('/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';net=new WebSocket(url);
  connectTimer=setTimeout(()=>{if(epoch===netEpoch&&!session)connection('The island server is waking up. You can still play solo.');},12000);
  net.onopen=()=>{if(epoch!==netEpoch)return;seq=0;
    if(kind==='resume'&&session)send({type:'resume',code:session.code,token:session.token});
    else if(kind==='create')send({type:'create',name:preferences.name,color:preferences.color,options:options(),public:false});
    else if(kind==='quick')send({type:'quick',name:preferences.name,color:preferences.color});
    else send({type:'join',code,name:preferences.name,color:preferences.color});
  };
  net.onmessage=event=>{
    if(epoch!==netEpoch)return;let data;try{data=JSON.parse(event.data);}catch{return;}
    if(data.type==='welcome'){
      clearTimeout(connectTimer);connection('');reconnectAttempts=0;localId=data.playerId;spectateId=localId;seq=data.lastSeq||0;session={code:data.code,token:data.token,playerId:localId};storeSession();
      acceptSnapshot(data.snapshot);updateLobby(data.lobby);replaceUrl(`?room=${encodeURIComponent(data.code)}`);
      if(snapshot.phase==='lobby')setMode('lobby');else{setMode('play');if(!touch&&!connectedGamepad)visible('capture-mouse',true);checkOrientation();}
    }else if(data.type==='snapshot'){acceptSnapshot(data.snapshot);if(data.lobby)updateLobby(data.lobby);}
    else if(data.type==='lobby')updateLobby(data.lobby);
    else if(data.type==='pong')ping=Math.max(0,Date.now()-data.at);
    else if(data.type==='error'){
      toast(data.message,5000);if(!session||kind==='resume'&&/expired|no longer|incorrect|invalid|reserved/i.test(data.message)){leaveNetwork();goHome();}
    }else if(data.type==='left'){session=null;storeSession();}
  };
  net.onclose=event=>{
    if(epoch!==netEpoch||intentionalClose)return;clearInputs();
    if(event.code===4001){session=null;storeSession();connection('');goHome();toast('This player continued in another tab.');return;}
    if(session){reconnectAttempts++;connection('Connection lost. Rejoining your reserved seat…');reconnectTimer=setTimeout(()=>connect('resume'),Math.min(7000,900*reconnectAttempts));}
    else{connection('');toast('Could not reach the match server. Try again, or play solo.',6000);}
  };
  net.onerror=()=>{};
}
function acceptSnapshot(snap){
  if(!snap||!Array.isArray(snap.players)||snap.players.length!==10)return;
  const changed=snap.id!==lastMatchId;if(changed)resetRound(snap);
  previousAuth=lastAuth;lastAuth=snap;receivedAt=performance.now();snapshot=snap;
  const auth=snap.players[localId];
  if(auth){
    if(!predicted||changed||!auth.alive||Math.hypot(auth.x-predicted.x,auth.y-predicted.y,auth.z-predicted.z)>7){predicted={...auth,_jumpHeld:lastInput.jump};correction={x:0,y:0,z:0};}
    else{
      const lead={...auth,_jumpHeld:predicted._jumpHeld};movePlayer(lead,lastInput,Math.min(.08,ping/2000+.025),snap.builds);
      correction={x:lead.x-predicted.x,y:lead.y-predicted.y,z:lead.z-predicted.z};
      const pos={x:predicted.x,y:predicted.y,z:predicted.z,vx:predicted.vx,vy:predicted.vy,vz:predicted.vz,_jumpHeld:predicted._jumpHeld};Object.assign(predicted,auth,pos);
    }
  }
  if((snap.phase==='drop'||snap.phase==='active')&&mode!=='play'){setMode('play');checkOrientation();if(!touch&&!connectedGamepad)visible('capture-mouse',true);}
  if(snap.phase==='lobby'&&mode==='play')setMode('lobby');
}
let lobbyState=null;
function updateLobby(lobby){
  if(!lobby)return;lobbyState=lobby;text('lobby-code',lobby.code);
  const humans=lobby.players.filter(p=>!p.bot).length;text('human-count',`${humans} HUMAN${humans===1?'':'S'} / ${10-humans} BOTS`);
  const fragment=document.createDocumentFragment();
  for(const p of lobby.players){const row=document.createElement('div');row.className='roster-seat'+(p.bot?' bot':'');const stripe=document.createElement('i');stripe.style.background=COLORS[p.color%COLORS.length];const name=document.createElement('span');name.textContent=p.name;const note=document.createElement('small');note.textContent=p.bot?'BOT':!p.connected?'AWAY':p.id===localId?'YOU':p.id===lobby.hostId?'HOST':'READY';row.append(stripe,name,note);fragment.append(row);}
  $('roster').replaceChildren(fragment);const host=lobby.hostId===localId;$('start-match').disabled=!host;visible('start-match',!lobby.public);
  text('lobby-status',lobby.public?`Drop begins in ${lobby.countdown??12} seconds. Bots fill empty seats.`:host?'Share the invite, then start when you’re ready.':'Waiting for the host to start the drop.');
  if(lobby.phase==='finished'){$('play-again').disabled=!host;text('play-again',host?'ONE MORE DROP ↗':'WAITING FOR HOST');}
}

function action(name){
  if(mode!=='play'||paused||settingsOpen||mapOpen||!ownPlayer()?.alive)return;
  sound();
  if(name==='wall'||name==='ramp'){
    if(snapshot.buildEnabled===false){toast('Building is off for this match.');return;}
    const placement=buildPlacement(predicted||ownPlayer(),name,snapshot.builds);buildGhost=placement;ghostUntil=performance.now()+550;
    if(!placement.valid){toast(placement.reason||'No room to build here.',1600);return;}
    if(ownPlayer().materials<10){toast('Need 10 materials. Press F near trees, rocks, or crates.',2300);return;}
  }
  if(solo){const result=solo.action(localId,name);if(!result&&name==='harvest')toast('Move closer to a tree, rock, or supply crate.',1800);}
  else send({type:'action',matchId:snapshot.id,seq:++seq,action:name});
}
function cycleWeapon(delta){const p=ownPlayer();if(!p)return;for(let n=1;n<=4;n++){const next=(p.weapon+delta*n+8)%4;if(p.owned[next]){action('slot'+next);break;}}}
function togglePause(force){
  if(mode!=='play'||snapshot.phase==='finished')return;if(force===undefined&&performance.now()-lastPauseToggle<200)return;lastPauseToggle=performance.now();paused=force??!paused;clearInputs();visible('pause',paused);visible('touch-controls',touch&&!paused&&!mapOpen&&ownPlayer()?.alive);visible('capture-mouse',false);
  text('pause-note',solo?'Your solo match is paused.':'This is an online match. The island keeps moving.');
  if(paused)releaseMouse();else requestMouse();
}
function toggleMap(force){if(mode!=='play'||snapshot.phase==='finished')return;mapOpen=force??!mapOpen;clearInputs();visible('map-screen',mapOpen);visible('touch-controls',touch&&!mapOpen&&!paused&&ownPlayer()?.alive);if(mapOpen){releaseMouse();drawMap($('bigmap'),true);}else requestMouse();}
function openSettings(){sound();settingsFromPause=paused;settingsOpen=true;clearInputs();releaseMouse();visible('settings',true);visible('touch-controls',false);visible('capture-mouse',false);}
function closeSettings(){settingsOpen=false;visible('settings',false);if(mode==='play'&&!settingsFromPause){visible('touch-controls',touch&&ownPlayer()?.alive&&!mapOpen);requestMouse();}}
function checkOrientation(){visible('rotate-hint',touch&&innerHeight>innerWidth&&mode==='play'&&!sessionStorage.getItem('skybreak-portrait'));}

function updateAimTarget(input){
  const p=predicted||ownPlayer();if(!p||!renderer?.camera||p.gliding)return input;
  // Aim through the camera reticle, then trace from the actual muzzle on the server.
  // This avoids shoulder-offset misses close to walls and nearby opponents.
  const origin=renderer.camera.position,dir=renderer.camera.getWorldDirection(new Vector3());
  const limit=WEAPONS[p.weapon].range;let distance=Math.min(limit,raycastWorld(origin,dir,limit,snapshot.builds).distance);
  for(const enemy of snapshot.players){if(!enemy.alive||enemy.id===localId)continue;
    for(const [height,radius]of[[.65,.43],[1.12,.47],[1.62,.29]]){
      const dx=enemy.x-origin.x,dy=enemy.y+height-origin.y,dz=enemy.z-origin.z;
      const along=dx*dir.x+dy*dir.y+dz*dir.z;if(along<=0||along>=distance)continue;
      const perpendicular=dx*dx+dy*dy+dz*dz-along*along;if(perpendicular<radius*radius)distance=Math.min(distance,along-Math.sqrt(radius*radius-perpendicular));
    }
  }
  distance=Math.max(.5,distance);const dx=origin.x+dir.x*distance-p.x,dy=origin.y+dir.y*distance-(p.y+1.4),dz=origin.z+dir.z*distance-p.z;
  input.aimYaw=Math.atan2(-dx,-dz);input.aimPitch=Math.atan2(dy,Math.hypot(dx,dz));return input;
}
function assistAim(dt,input){
  if(!preferences.aimAssist||!(touch||connectedGamepad)||!(input.aim||input.fire))return;
  const p=predicted||ownPlayer();if(!p)return;let best=null,bestError=.1;
  for(const e of snapshot.players){if(e.id===localId||!e.alive)continue;const dx=e.x-p.x,dz=e.z-p.z,dy=e.y+1.05-(p.y+1.4),d=Math.hypot(dx,dz);if(d>80||d<3)continue;
    const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,d),error=Math.hypot(angle(yaw-viewYaw),pitch-viewPitch);if(error>=bestError)continue;
    const ray=raycastWorld({x:p.x,y:p.y+1.4,z:p.z},aimDirection(yaw,pitch),d,snapshot.builds);if(ray.distance<d-.6)continue;best={yaw,pitch};bestError=error;
  }
  if(best){const amount=1-Math.exp(-dt*1.8);viewYaw+=angle(best.yaw-viewYaw)*amount;viewPitch+=(best.pitch-viewPitch)*amount;input.yaw=viewYaw;input.pitch=viewPitch;}
}
function readInput(dt){
  const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);
  if(pad&&(pad.axes.some(v=>Math.abs(v)>.25)||pad.buttons.some(b=>b.pressed))){activeDevice='gamepad';connectedGamepad=true;}
  if(!pad){connectedGamepad=false;if(activeDevice==='gamepad')activeDevice=touch?'touch':'mouse';}
  if(pad?.buttons[9]?.pressed&&!padPrevious[9]&&mode==='play'&&!settingsOpen&&!mapOpen)togglePause();
  const enabled=mode==='play'&&!paused&&!mapOpen&&!settingsOpen&&!document.hidden&&ownPlayer()?.alive;
  const input={moveX:0,moveZ:0,yaw:viewYaw,pitch:viewPitch,sprint:false,jump:false,fire:false,aim:false};
  if(!enabled){if(pad)pad.buttons.forEach((b,i)=>padPrevious[i]=b.pressed);return input;}
  input.moveX=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touchInput.x;input.moveZ=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touchInput.z;
  input.sprint=preferences.alwaysSprint||keys.has('ShiftLeft')||keys.has('ShiftRight')||touchInput.sprint;input.jump=keys.has('Space')||touchInput.jump;
  input.fire=mouse.fire||touchInput.fire;input.aim=mouse.aim||touchInput.aim;
  if(keys.has('ArrowLeft'))viewYaw+=dt*1.5;if(keys.has('ArrowRight'))viewYaw-=dt*1.5;if(keys.has('ArrowUp'))viewPitch+=dt;if(keys.has('ArrowDown'))viewPitch-=dt;
  if(pad){
    const dead=v=>Math.abs(v)<.15?0:(Math.abs(v)-.15)/.85*Math.sign(v);
    input.moveX+=dead(pad.axes[0]||0);input.moveZ-=dead(pad.axes[1]||0);viewYaw-=dead(pad.axes[2]||0)*dt*2.4*preferences.sensitivity;viewPitch-=dead(pad.axes[3]||0)*dt*1.7*preferences.sensitivity*(preferences.invert?-1:1);
    input.fire||=pad.buttons[7]?.value>.2;input.aim||=pad.buttons[6]?.value>.2;input.jump||=pad.buttons[0]?.pressed;input.sprint||=pad.buttons[10]?.pressed;
    const actions={1:'wall',2:'reload',3:'interact',12:'heal',13:'shield',14:'harvest',15:'ramp'};
    pad.buttons.forEach((b,i)=>{if(b.pressed&&!padPrevious[i]){if(actions[i])action(actions[i]);else if(i===4)cycleWeapon(-1);else if(i===5)cycleWeapon(1);}padPrevious[i]=b.pressed;});
  }
  viewYaw=angle(viewYaw);viewPitch=clamp(viewPitch,-1.25,1.2);input.yaw=viewYaw;input.pitch=viewPitch;
  const magnitude=Math.max(1,Math.hypot(input.moveX,input.moveZ));input.moveX/=magnitude;input.moveZ/=magnitude;
  assistAim(dt,input);return updateAimTarget(input);
}

function updateEvents(){
  if(eventMatch!==snapshot.id){eventMatch=snapshot.id;lastEvent=0;}
  for(const e of snapshot.events||[]){if(e.id<=lastEvent)continue;lastEvent=e.id;
    if(e.type==='loot'&&e.player===localId)toast(e.text,1600);
    if(e.type==='hit'&&e.player===localId){clearTimeout(hitTimer);$('hitmarker').style.opacity='1';text('damage-numbers',Math.round(e.amount||0));$('damage-numbers').style.opacity='1';hitTimer=setTimeout(()=>{$('hitmarker').style.opacity='0';$('damage-numbers').style.opacity='0';},280);}
    if(e.type==='elimination'){lastKillEvents.push(e);lastKillEvents=lastKillEvents.slice(-4);renderFeed();if(e.player===localId)toast(`ELIMINATED ${snapshot.players[e.target]?.name||'OPPONENT'}`,2000);}
    if(e.type==='build'&&e.player===localId)ghostUntil=0;
  }
}
function renderFeed(){const list=document.createDocumentFragment();for(const event of lastKillEvents){const row=document.createElement('div');row.textContent=event.text||`${snapshot.players[event.player]?.name||'The storm'} eliminated ${snapshot.players[event.target]?.name||'a contender'}`;list.append(row);}$('feed').replaceChildren(list);}
function nearestLoot(player){
  let found=null,best=3.7;for(const item of snapshot.loot||[]){const d=Math.hypot(item.x-player.x,item.z-player.z,(item.y-player.y)*.6);if(d>=best||Math.abs(item.y-player.y)>3.1)continue;const h=Math.hypot(item.x-player.x,item.z-player.z);if(h>.15){const hit=raycastWorld({x:player.x,y:player.y+.8,z:player.z},{x:(item.x-player.x)/h,y:0,z:(item.z-player.z)/h},h,snapshot.builds);if(hit.distance<h-.6)continue;}found=item;best=d;}return found;
}
function updateHud(){
  const p=ownPlayer();if(!p)return;const alive=snapshot.players.filter(p=>p.alive).length;text('alive-count',alive);text('kill-count',p.kills);text('player-callsign',p.name.toUpperCase());text('build-count',`▱ ${p.materials}`);text('health-value',Math.ceil(p.hp));text('shield-value',Math.ceil(p.shield));$('health-bar').style.width=`${p.hp}%`;$('shield-bar').style.width=`${p.shield}%`;
  const v=p.hp+p.shield;if(v<lastHp-.3){$('damage-flash').style.opacity='1';clearTimeout(damageTimer);damageTimer=setTimeout(()=>$('damage-flash').style.opacity='0',180);}lastHp=v;
  const viewpoint=displayPlayer();let nearest=LANDMARKS.reduce((a,b)=>Math.hypot(viewpoint.x-a.x,viewpoint.z-a.z)<Math.hypot(viewpoint.x-b.x,viewpoint.z-b.z)?a:b);text('location-name',Math.hypot(viewpoint.x-nearest.x,viewpoint.z-nearest.z)<nearest.radius+12?nearest.name:'BREAKWATER WILDS');
  const heading=(((-viewYaw*180/Math.PI)%360)+360)%360;const directions=['N','NE','E','SE','S','SW','W','NW'];const index=Math.round(heading/45)%8;text('compass-text',`${directions[(index+6)%8]}　　${directions[(index+7)%8]}　　${directions[index]}　　${directions[(index+1)%8]}　　${directions[(index+2)%8]}`);text('bearing',String(Math.round(heading)).padStart(3,'0'));
  text('storm-label',snapshot.storm.label.toUpperCase());text('storm-clock',duration(snapshot.storm.remaining));const outside=p.alive&&Math.hypot(p.x-snapshot.storm.x,p.z-snapshot.storm.z)>snapshot.storm.radius;visible('storm-warning',outside&&snapshot.phase==='active');$('storm-tint').style.opacity=outside?'1':'0';
  if(session)text('network-label',net?.readyState===1?`${session.code} · ${Math.round(ping)} ms`:'RECONNECTING');
  const weapon=WEAPONS[p.weapon];text('ammo-current',p.ammo[p.weapon]);text('ammo-reserve',p.reserve[p.weapon]);text('weapon-name',`${RARITIES[p.rarity[p.weapon]].name.toUpperCase()} ${weapon.name.toUpperCase()}`);text('med-count',p.medkits);text('cell-count',p.shieldCells);
  for(let i=0;i<4;i++){const slot=$('inventory').children[i];slot.classList.toggle('selected',p.weapon===i);slot.classList.toggle('empty',!p.owned[i]);slot.style.setProperty('--rarity',RARITIES[p.rarity[i]].color);slot.title=p.owned[i]?`${RARITIES[p.rarity[i]].name} ${WEAPONS[i].name}`:`Find a ${WEAPONS[i].name}`;}
  $('crosshair').classList.toggle('aiming',lastInput.aim);visible('crosshair',p.alive&&!p.gliding&&!paused&&!mapOpen&&!settingsOpen);visible('ammo-display',p.alive);visible('interaction',false);
  if(p.alive&&!p.gliding&&!paused&&!mapOpen&&!settingsOpen){const item=nearestLoot(predicted||p);if(item){visible('interaction',true);const labels={chest:['OPEN SUPPLY CACHE','Weapon, materials, and supplies'],ammo:['TAKE AMMUNITION','Ammo for all weapon types'],shield:['TAKE SHIELD CELLS','Use J to recharge your shield'],medkit:['TAKE MEDKIT','Use H to recover health'],materials:['TAKE MATERIALS','Build walls and ramps']};const label=item.kind==='weapon'?[WEAPONS[item.weapon].name.toUpperCase(),RARITIES[item.rarity].name+' · '+WEAPONS[item.weapon].short]:labels[item.kind]||['PICK UP',''];text('interact-name',label[0]);text('interact-detail',touch?'Tap the hand button · '+label[1]:label[1]);$('interaction').style.borderColor=item.kind==='weapon'?RARITIES[item.rarity].color:'';}}
  const use=p.using||p.reloading;visible('use-progress',!!use&&p.alive);if(use){text('use-label',p.using==='heal'?'USING MEDKIT':p.using==='shield'?'CHARGING SHIELD':'RELOADING');const max=p.using==='heal'?3:p.using==='shield'?1.8:weapon.reload;const remaining=p.using?p.useRemaining:p.reloading;$('use-progress').querySelector('i').style.width=`${clamp(1-remaining/max,0,1)*100}%`;}
  const drop=snapshot.phase==='drop';visible('phase-banner',drop);if(drop){text('phase-title',p.gliding?'CHOOSE YOUR LANDING':'READY ON THE GROUND');text('phase-description',p.gliding?(touch?'Left stick to steer your glider. Look for the gold caches.':'WASD to steer. Look for the gold caches.'): `Combat starts in ${Math.ceil(snapshot.dropRemaining)} seconds.`);}
  if(!p.alive){if(!deathReleased){deathReleased=true;clearInputs();releaseMouse();}if(!snapshot.players[spectateId]?.alive){spectateId=snapshot.players.find(p=>p.alive)?.id??localId;}visible('spectate',snapshot.phase!=='finished');text('placement',`#${p.placement||alive+1}`);text('spectate-name',`WATCHING ${snapshot.players[spectateId]?.name?.toUpperCase()||'THE ISLAND'}`);visible('touch-controls',false);visible('capture-mouse',false);}else visible('spectate',false);
  if(snapshot.phase==='finished'&&!resultsShown)showResults();
  visible('capture-mouse',mode==='play'&&!touch&&!connectedGamepad&&p.alive&&!paused&&!mapOpen&&!settingsOpen&&!resultsShown&&!document.pointerLockElement);
}
function showResults(){
  resultsShown=true;clearInputs();releaseMouse();visible('results',true);visible('touch-controls',false);visible('capture-mouse',false);visible('spectate',false);const p=ownPlayer(),won=snapshot.winner===localId;
  text('result-eyebrow',won?'LAST ONE STANDING':'UNTIL THE NEXT DROP');$('result-title').innerHTML=won?'ISLAND<br>CHAMPION.':`PLACED #${p.placement||10}.`;
  text('result-subtitle',won?'The storm ran out of people to chase.':snapshot.winner==null?'The storm claimed the island.':`${snapshot.players[snapshot.winner].name} takes Breakwater this time.`);text('result-place',`#${p.placement||10}`);text('result-kills',p.kills);text('result-damage',Math.round(p.damage));
  $('play-again').disabled=!!session&&lobbyState?.hostId!==localId;text('play-again',session&&lobbyState?.hostId!==localId?'WAITING FOR HOST':'ONE MORE DROP ↗');
}

// The map is rendered locally from exactly the terrain and architecture used in the match.
const mapBase=document.createElement('canvas');mapBase.width=mapBase.height=640;
function prepareMap(){
  const ctx=mapBase.getContext('2d'),size=320,image=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const wx=(x/size-.5)*300,wz=(y/size-.5)*300,h=terrainHeight(wx,wz);const col=h<-.2?[48,112,127]:h<2?[207,190,132]:h>18?[134,151,106]:[99+Math.round(h*1.1),141+Math.round(h*.7),92+Math.round(h*.6)];const i=(y*size+x)*4;image.data.set([...col,255],i);}
  const small=document.createElement('canvas');small.width=small.height=size;small.getContext('2d').putImageData(image,0,0);ctx.drawImage(small,0,0,640,640);const scale=640/300,point=v=>(v+150)*scale;
  for(const road of ROADS){ctx.strokeStyle='#d7c8a2';ctx.lineWidth=road.width*scale;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();road.points.forEach(([x,z],i)=>i?ctx.lineTo(point(x),point(z)):ctx.moveTo(point(x),point(z)));ctx.stroke();}
  for(const t of TREES){ctx.fillStyle=t.kind==='pine'?'#486d4b':'#62814e';ctx.beginPath();ctx.arc(point(t.x),point(t.z),t.size*.27*scale,0,Math.PI*2);ctx.fill();}
  for(const b of BUILDINGS){ctx.save();ctx.translate(point(b.x),point(b.z));ctx.rotate(-b.yaw);ctx.fillStyle='#765e4c';ctx.fillRect(-b.w*scale/2+2,-b.d*scale/2+2,b.w*scale,b.d*scale);ctx.fillStyle='#dfbea0';ctx.fillRect(-b.w*scale/2,-b.d*scale/2,b.w*scale,b.d*scale);ctx.restore();}
}
function drawMap(canvas,big=false){
  const ctx=canvas.getContext('2d'),w=canvas.width,s=w/300,px=x=>(x+150)*s;ctx.clearRect(0,0,w,w);ctx.drawImage(mapBase,0,0,w,w);
  if(snapshot&&mode==='play'){
    const storm=snapshot.storm;ctx.save();ctx.fillStyle='#7955b999';ctx.beginPath();ctx.rect(0,0,w,w);ctx.arc(px(storm.x),px(storm.z),storm.radius*s,0,Math.PI*2,true);ctx.fill('evenodd');ctx.restore();
    ctx.strokeStyle='#e2baf4';ctx.lineWidth=big?3:1.5;ctx.beginPath();ctx.arc(px(storm.x),px(storm.z),storm.radius*s,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#f7f7e8';ctx.lineWidth=big?2:1;ctx.setLineDash(big?[8,5]:[4,3]);ctx.beginPath();ctx.arc(px(storm.nextX),px(storm.nextZ),Math.max(0,storm.nextRadius*s),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    if(big){ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.textBaseline='middle';for(const l of LANDMARKS){ctx.lineWidth=4;ctx.strokeStyle='#1a3c39cc';ctx.strokeText(l.name,px(l.x),px(l.z)+20);ctx.fillStyle='#fff4d0';ctx.fillText(l.name,px(l.x),px(l.z)+20);}for(const pad of PADS){ctx.fillStyle='#a3dcec';ctx.fillRect(px(pad.x)-3,px(pad.z)-3,6,6);}}
    const p=displayPlayer();if(p){
      for(const other of snapshot.players){if(other.id===localId||!other.alive||snapshot.time-other.shotAt>1.1||Math.hypot(other.x-p.x,other.z-p.z)>65)continue;ctx.fillStyle='#f2ac7477';ctx.strokeStyle='#f1b895';ctx.beginPath();ctx.arc(px(other.x),px(other.z),big?6:3,0,Math.PI*2);ctx.fill();ctx.stroke();}
      ctx.save();ctx.translate(px(p.x),px(p.z));ctx.rotate(-viewYaw);ctx.fillStyle='#f9dc6b';ctx.strokeStyle='#213945';ctx.lineWidth=big?2:1;const r=big?10:5;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.7,r*.7);ctx.lineTo(0,r*.3);ctx.lineTo(-r*.7,r*.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
    if(waypoint){ctx.strokeStyle='#ffde6a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(waypoint.x),px(waypoint.z),big?9:4,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(px(waypoint.x)-6,px(waypoint.z));ctx.lineTo(px(waypoint.x)+6,px(waypoint.z));ctx.moveTo(px(waypoint.x),px(waypoint.z)-6);ctx.lineTo(px(waypoint.x),px(waypoint.z)+6);ctx.stroke();}
  }
}
function renderState(dt){
  if(!session||!lastAuth)return snapshot;
  const state={...snapshot,players:snapshot.players.map(p=>({...p}))};
  for(const p of state.players){
    if(p.id===localId&&predicted&&p.alive){Object.assign(p,predicted);continue;}
    let visual=renderedPlayers.get(p.id);if(!visual){visual={...p};renderedPlayers.set(p.id,visual);}
    const alpha=1-Math.exp(-dt*16);visual.x+=(p.x-visual.x)*alpha;visual.y+=(p.y-visual.y)*alpha;visual.z+=(p.z-visual.z)*alpha;visual.yaw+=angle(p.yaw-visual.yaw)*alpha;
    Object.assign(p,{x:visual.x,y:visual.y,z:visual.z,yaw:visual.yaw});
  }
  return state;
}
function frame(now){
  const dt=Math.min((now-lastTime)/1000,.06);lastTime=now;
  try{
    lastInput=readInput(dt);
    if(mode==='play'){
      if(solo&&!paused&&!settingsOpen&&!document.hidden){accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps++<5){solo.step(1/60,new Map([[localId,lastInput]]));accumulator-=1/60;}snapshot=solo;}
      else if(session&&predicted&&ownPlayer()?.alive&&!document.hidden&&net?.readyState===1){movePlayer(predicted,lastInput,dt,snapshot.builds);const amount=1-Math.exp(-dt*13);for(const k of ['x','y','z']){predicted[k]+=correction[k]*amount;correction[k]*=1-amount;}sendAccumulator+=dt;if(sendAccumulator>=.05){sendAccumulator=0;send({type:'input',matchId:snapshot.id,seq:++seq,input:lastInput});}}
      if(!ownPlayer()?.alive&&displayPlayer()){viewYaw=displayPlayer().yaw;viewPitch=-.17;}
      updateEvents();hudAccumulator+=dt;if(hudAccumulator>.09){hudAccumulator=0;updateHud();}mapAccumulator+=dt;if(mapAccumulator>.13){mapAccumulator=0;drawMap($('minimap'));if(mapOpen)drawMap($('bigmap'),true);}
    }
    if(now>ghostUntil)buildGhost=null;
    renderer.render(renderState(dt),dt,{localId:ownPlayer()?.alive?localId:spectateId,yaw:viewYaw,pitch:viewPitch,aim:lastInput.aim,menu:mode!=='play',spectating:ownPlayer()?.alive===false,buildPreview:buildGhost});
    audio?.update(snapshot,localId,dt,{menu:mode!=='play',listenerId:ownPlayer()?.alive?localId:spectateId});
  }catch(error){if(!frame.error){console.error(error);frame.error=true;toast('Something interrupted the island. Reload to reconnect.',8000);}}
  requestAnimationFrame(frame);
}

// Menus and preferences.
$('pilot-name').value=preferences.name;$('pilot-name').addEventListener('change',cleanName);
COLORS.slice(0,6).forEach((color,i)=>{const button=document.createElement('button');button.className='swatch'+(preferences.color===i?' selected':'');button.style.background=color;button.title=['Seafoam','Saffron','Lilac','Coral','Fern','Sand'][i];button.setAttribute('aria-label',button.title+' outfit');button.onclick=()=>{preferences.color=i;save();$('colors').querySelectorAll('button').forEach((b,n)=>b.classList.toggle('selected',n===i));if(mode==='home')snapshot.setHuman(0,preferences.name,i);};$('colors').append(button);});
$('solo-play').onclick=startSolo;$('quick-play').onclick=()=>standalone?startSolo():connect('quick');$('create-room').onclick=()=>connect('create');$('join-form').onsubmit=e=>{e.preventDefault();const code=$('room-code').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length!==6){toast('Enter the six-character room code.');return;}connect('join',code);};$('room-code').oninput=()=>{$('room-code').value=$('room-code').value.toUpperCase().replace(/[^A-Z0-9]/g,'');};
$('start-match').onclick=()=>{sound();send({type:'start'});};$('leave-lobby').onclick=goHome;$('copy-invite').onclick=async()=>{const link=`${location.origin}/?room=${session.code}`;try{await navigator.clipboard.writeText(link);toast('Invite copied. Send it to your friends.');}catch{toast(`Share this room code: ${session.code}`,5000);}};
$('pause-open').onclick=()=>togglePause(true);$('resume-play').onclick=()=>togglePause(false);$('leave-match').onclick=goHome;$('map-toggle').onclick=()=>toggleMap(true);$('map-close').onclick=()=>toggleMap(false);$('capture-mouse').onclick=()=>{activeDevice='mouse';connectedGamepad=false;sound();requestMouse();};
$('results-home').onclick=goHome;$('play-again').onclick=()=>{if(solo)startSolo();else{send({type:'rematch'});visible('results',false);}};$('next-spectate').onclick=()=>{const alive=snapshot.players.filter(p=>p.alive);if(alive.length)spectateId=alive[(alive.findIndex(p=>p.id===spectateId)+1)%alive.length].id;};$('spectate-exit').onclick=goHome;
document.querySelectorAll('.settings-open').forEach(el=>el.onclick=openSettings);document.querySelectorAll('.settings-close').forEach(el=>el.onclick=closeSettings);
$('quality').value=preferences.quality;$('difficulty').value=preferences.difficulty;$('sensitivity').value=preferences.sensitivity;$('volume').value=preferences.volume;$('build-enabled').checked=preferences.buildEnabled;$('aim-assist').checked=preferences.aimAssist;$('invert-look').checked=preferences.invert;$('always-sprint').checked=preferences.alwaysSprint;text('sensitivity-value',Number(preferences.sensitivity).toFixed(1));text('volume-value',Math.round(preferences.volume*100)+'%');
$('quality').onchange=e=>{preferences.quality=e.target.value;renderer.setQuality(preferences.quality);save();};$('difficulty').onchange=e=>{preferences.difficulty=e.target.value;save();};$('sensitivity').oninput=e=>{preferences.sensitivity=Number(e.target.value);text('sensitivity-value',preferences.sensitivity.toFixed(1));save();};$('volume').oninput=e=>{preferences.volume=Number(e.target.value);text('volume-value',Math.round(preferences.volume*100)+'%');audio?.setVolume(preferences.volume);sound();save();};
for(const [id,key]of[['build-enabled','buildEnabled'],['aim-assist','aimAssist'],['invert-look','invert'],['always-sprint','alwaysSprint']])$(id).onchange=e=>{preferences[key]=e.target.checked;save();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s fullscreen option.');}};
$('how-open').onclick=()=>{sound();visible('how',true);};$('how-close').onclick=$('how-done').onclick=()=>visible('how',false);
$('rotate-dismiss').onclick=()=>{sessionStorage.setItem('skybreak-portrait','1');visible('rotate-hint',false);};
$('bigmap').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();waypoint={x:(e.clientX-r.left)/r.width*300-150,z:(e.clientY-r.top)/r.height*300-150};drawMap($('bigmap'),true);toast('Waypoint placed.',1200);});
const silhouettes=[
  '<path d="M2 13h7l2-5h28v3h17v3H38l-2 3H23l-3 10h-5l1-10H8l-5 5H1zm22-9h12v3H24z"/>',
  '<path d="M5 9h30v4h15v3H34l-2 5H20v8h-5l-2-10H4zm7-5h15v4H12z"/>',
  '<path d="M1 11h55v5H30l-4 3H15L4 25H0l3-9zM21 17h18v4H21z"/>',
  '<path d="M2 13h25v-3h19v3h14v2H30l-5 4H14L3 25H0zM23 4h17v5H23z"/>'
];
WEAPONS.forEach((weapon,i)=>{const el=document.createElement('button');el.className='weapon-slot'+(i===0?' selected':' empty');el.innerHTML=`<kbd>${i+1}</kbd><svg viewBox="0 0 60 32" aria-hidden="true">${silhouettes[i]}</svg><small>${weapon.short}</small>`;el.setAttribute('aria-label',weapon.name);el.onclick=()=>action('slot'+i);$('inventory').append(el);});
const salvage=document.createElement('button');salvage.dataset.action='harvest';salvage.innerHTML='<kbd>F</kbd> SALVAGE';salvage.setAttribute('aria-label','Salvage materials');document.querySelector('.supplies').append(salvage);
document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>action(el.dataset.action));

// Keyboard / mouse. Browser/menu focus always clears held fire and movement.
const actionKeys={KeyE:'interact',KeyR:'reload',KeyQ:'wall',KeyC:'ramp',KeyF:'harvest',KeyH:'heal',KeyJ:'shield',Digit1:'slot0',Digit2:'slot1',Digit3:'slot2',Digit4:'slot3'};
addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){activeDevice='mouse';connectedGamepad=false;}},true);
addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.code==='Escape'){e.preventDefault();if(settingsOpen)closeSettings();else if(mapOpen)toggleMap(false);else if(!$('how').classList.contains('hidden'))visible('how',false);else if(mode==='play')togglePause();return;}
  if(mode!=='play')return;activeDevice='mouse';connectedGamepad=false;
  if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='KeyM'||e.code==='Tab'){if(!e.repeat)toggleMap();return;}
  if(paused||settingsOpen||mapOpen)return;keys.add(e.code);if(!e.repeat&&actionKeys[e.code])action(actionKeys[e.code]);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('world')||mode!=='play'||paused||settingsOpen||mapOpen)return;viewYaw-=e.movementX*.0021*preferences.sensitivity;viewPitch-=e.movementY*.0018*preferences.sensitivity*(preferences.invert?-1:1);viewPitch=clamp(viewPitch,-1.25,1.2);});
$('world').addEventListener('pointerdown',e=>{if(touch||mode!=='play'||paused||settingsOpen||mapOpen)return;sound();if(document.pointerLockElement!==$('world')){requestMouse();return;}if(e.button===0)mouse.fire=true;if(e.button===2)mouse.aim=true;});
addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)mouse.fire=false;if(e.button===2)mouse.aim=false;}});
addEventListener('contextmenu',e=>{if(mode==='play')e.preventDefault();});
addEventListener('wheel',e=>{if(mode==='play'&&!paused&&!settingsOpen&&!mapOpen){e.preventDefault();if(!frame.lastWheel||performance.now()-frame.lastWheel>130){frame.lastWheel=performance.now();cycleWeapon(e.deltaY>0?1:-1);}}},{passive:false});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement){visible('capture-mouse',false);return;}clearInputs();if(!ignoreUnlock&&mode==='play'&&!settingsOpen&&!mapOpen&&!resultsShown&&ownPlayer()?.alive)togglePause(true);});
addEventListener('blur',()=>{clearInputs();if(solo&&mode==='play'&&!resultsShown)togglePause(true);});
document.addEventListener('visibilitychange',()=>{clearInputs();if(document.hidden&&solo&&mode==='play'&&!resultsShown)togglePause(true);});
addEventListener('resize',()=>{renderer?.resize();checkOrientation();});
addEventListener('gamepadconnected',()=>{connectedGamepad=true;visible('capture-mouse',false);toast('Controller connected. RT fires, LT aims, A jumps.',4000);});

// Two independent touch regions, with action buttons above the look region.
let movePointer=null,moveOrigin=null,lookPointer=null,lookLast=null;
$('move-stick').addEventListener('pointerdown',e=>{e.preventDefault();sound();movePointer=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();moveOrigin={x:r.left+r.width/2,y:r.top+r.height/2,r:r.width*.34};moveTouch(e);});
function moveTouch(e){if(e.pointerId!==movePointer)return;let dx=e.clientX-moveOrigin.x,dy=e.clientY-moveOrigin.y;const length=Math.max(moveOrigin.r,Math.hypot(dx,dy));touchInput.x=dx/length;touchInput.z=-dy/length;$('move-stick').firstElementChild.style.transform=`translate(${touchInput.x*moveOrigin.r}px,${-touchInput.z*moveOrigin.r}px)`;}
$('move-stick').addEventListener('pointermove',moveTouch);for(const event of ['pointerup','pointercancel','lostpointercapture'])$('move-stick').addEventListener(event,e=>{if(e.pointerId===movePointer){movePointer=null;touchInput.x=touchInput.z=0;$('move-stick').firstElementChild.style.transform='';}});
$('look-zone').addEventListener('pointerdown',e=>{e.preventDefault();sound();lookPointer=e.pointerId;lookLast={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);});
$('look-zone').addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;const dx=e.clientX-lookLast.x,dy=e.clientY-lookLast.y;viewYaw-=dx*.005*preferences.sensitivity;viewPitch-=dy*.004*preferences.sensitivity*(preferences.invert?-1:1);viewPitch=clamp(viewPitch,-1.25,1.2);lookLast={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('look-zone').addEventListener(event,e=>{if(e.pointerId===lookPointer)lookPointer=null;});
for(const [id,key]of[['touch-fire','fire'],['touch-jump','jump']]){
  $(id).addEventListener('pointerdown',e=>{e.preventDefault();sound();touchInput[key]=true;e.currentTarget.classList.add('active');e.currentTarget.setPointerCapture(e.pointerId);});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])$(id).addEventListener(ev,()=>{touchInput[key]=false;$(id).classList.remove('active');});
}
$('touch-aim').onclick=()=>{touchInput.aim=!touchInput.aim;$('touch-aim').classList.toggle('active',touchInput.aim);};$('touch-sprint').onclick=()=>{touchInput.sprint=!touchInput.sprint;$('touch-sprint').classList.toggle('active',touchInput.sprint);};$('touch-reload').onclick=()=>action('reload');$('touch-interact').onclick=()=>action('interact');

setInterval(()=>{if(session&&net?.readyState===1)send({type:'ping',at:Date.now()});},2500);
async function boot(){
  try{
    prepareMap();snapshot=new Match(options());snapshot.setHuman(0,preferences.name,preferences.color);
    renderer=new IslandRenderer($('world'),{quality:preferences.quality,mobile:touch});audio=new AudioDirector();audio.setVolume(preferences.volume);
    renderer.render(snapshot,.016,{menu:true,localId:0});await new Promise(resolve=>requestAnimationFrame(resolve));visible('loading',false);setMode('home');
    if(standalone){$('quick-play').innerHTML='PLAY SOLO <span>↗</span>';document.querySelector('.play-row').classList.add('hidden');visible('join-form',false);document.querySelector('.mode-note').textContent='Playable preview · nine bots · full island and gameplay';}
    const requested=new URLSearchParams(location.search).get('room');if(requested&&!standalone){$('room-code').value=requested.toUpperCase().slice(0,6);toast('Enter your callsign, then join the room.',4500);}
    let saved;try{saved=JSON.parse(sessionStorage.getItem('skybreak-seat')||'null');}catch{}
    if(!standalone&&saved?.token&&saved?.code&&(!requested||requested.toUpperCase()===saved.code)){session=saved;connect('resume');}
    requestAnimationFrame(frame);
  }catch(error){console.error(error);text('load-note','The 3D view could not start. Enable hardware acceleration in your browser, then reload.');$('loading').querySelector('strong').textContent='THE ISLAND NEEDS WEBGL';}
}
boot();
