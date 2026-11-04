import {ClaimGame,WEAPONS,VERSION,WEAPON_ORDER,mapFor} from './core.mjs';
import {HouseRenderer} from './renderer.mjs';
import {PartyClient} from './network.mjs';
import {HouseAudio} from './audio.mjs';
import {TouchControls, startControlStream, bindGameLifecycle, bindDesktopControls, preferTouchControls} from './controls.mjs';
import {loadSettings,saveSettings,mountSettings,assistAim} from './settings.mjs';
const $=id=>document.getElementById(id),canvas=$('world'),touch=preferTouchControls({coarse:matchMedia('(pointer:coarse)').matches,fine:matchMedia('(any-pointer:fine)').matches,touchPoints:navigator.maxTouchPoints,force:new URL(location.href).searchParams.get('controls')==='touch'});
const audio=new HouseAudio();let renderer;
try{renderer=new HouseRenderer(canvas);}catch(e){$('solo').disabled=true;$('party').disabled=true;document.querySelector('.intro').textContent='The renderer could not start. Reload the page or try another browser.';throw e;}
let game=new ClaimGame(),remote=false,selfId='p1',playing=false,menu=true,paused=false,room=null,angle=Math.PI,pitch=0,last=performance.now(),acc=0,toastUntil=0,announceUntil=0,hurtUntil=0,hitUntil=0,endShown=false,weaponKey='',windowKey='',squadKey='',ready=false,mouseFire=false;
const pulses={fire:false,use:false,reload:false};
const keys=new Set();let touchControls;
if(touch){document.body.classList.add('touch');$('touch').hidden=false;}
const settings=loadSettings(localStorage);
function applySettings(){const style=document.documentElement.style;style.setProperty('--pad-scale',Math.sqrt(settings.padArea/100));style.setProperty('--button-scale',Math.sqrt(settings.buttonArea/100));style.setProperty('--control-opacity',settings.opacity/100);style.setProperty('--crosshair-scale',settings.crosshair/100);audio.volume=settings.volume/100;if(audio.master)audio.master.gain.value=audio.enabled?.4*audio.volume:0;renderer.configure(settings);saveSettings(localStorage,settings);if(touchControls)resetControls();$('look-zone').setAttribute('aria-label',settings.fireMode==='separate'?'Drag to aim':settings.fireMode==='hold'?'Hold to aim and fire':'Drag to aim; double tap and hold to fire');$('look-hint').textContent=settings.fireMode==='double'?'2× TAP + HOLD = FIRE':settings.fireMode==='hold'?'HOLD = AIM + FIRE':'DRAG TO AIM';}
mountSettings($('settings-controls'),settings,applySettings);applySettings();
const config=JSON.parse($('claim-config').textContent);
function textToast(text,seconds=3){$('toast').textContent=text;toastUntil=performance.now()+seconds*1000;}
function announce(title,detail=''){const el=$('announcement');el.querySelector('strong').textContent=title;el.querySelector('span').textContent=detail;el.classList.add('active');announceUntil=performance.now()+3500;}
function resetControls(){Object.assign(pulses,{fire:false,use:false,reload:false});keys.clear();mouseFire=false;touchControls?.reset();}
function handleEvents(events){renderer.event(events,selfId);audio.events(events,selfId);for(const e of events){
  if(e.type==='wave')announce('WAVE '+String(e.wave).padStart(2,'0'),e.text);
  if(e.type==='clear')announce('APPEAL SUCCESSFUL','22 seconds to repair, reload, and regroup.');
  if(e.type==='breach')textToast(e.text);
  if(e.type==='hurt'&&e.playerId===selfId)hurtUntil=performance.now()+200;
  if(e.type==='hit'&&e.playerId===selfId)hitUntil=performance.now()+110;
  if(e.type==='down')textToast(e.playerId===selfId?'You are down. A teammate can revive you.':'A neighbor is down! Hold USE beside them.',5);
  if((e.type==='message'||e.type==='purchase')&&e.playerId===selfId)textToast(e.text);
}}
const net=new PartyClient({
  status:text=>{$('network-status').textContent=text;if(paused)$('pause-detail').textContent=text;},
  room:r=>{room=r;selfId=net.selfId||selfId;renderLobby();
    if(r.status==='playing'){if(!playing)enterGame(true);paused=false;$('pause-panel').hidden=true;}
    if(r.status==='paused'){if(!playing)enterGame(true);paused=true;resetControls();$('pause-title').textContent='HOUSE ON HOLD.';$('pause-detail').textContent=r.pauseReason;$('resume').textContent=r.players.find(p=>p.id===selfId)?.ready?'WAITING FOR NEIGHBORS…':'READY TO RESUME';$('pause-panel').hidden=false;document.exitPointerLock?.();}
  },
  state:(s,events)=>{const first=game.state.status==='ready'||!remote;game.state=s;game.map=mapFor(s.mapId);$('location-name').textContent=game.map.name.toUpperCase();remote=true;selfId=net.selfId||'p1';if(first){const p=game.player(selfId);if(p){angle=p.angle;pitch=p.pitch;}}handleEvents(events);},
  disconnected:()=>{if(playing){paused=true;resetControls();$('pause-title').textContent='CONNECTION INTERRUPTED';$('pause-detail').textContent='Reconnecting. Your place is reserved for 60 seconds.';$('pause-panel').hidden=false;document.exitPointerLock?.();}},
  closed:text=>{if(playing){paused=true;$('pause-panel').hidden=false;$('pause-title').textContent='ROOM ENDED';$('pause-detail').textContent=text;$('resume').disabled=true;}else{$('room-entry').hidden=false;$('room-lobby').hidden=true;$('network-status').textContent=text;}},
},config.coopServer);
function enterGame(isRemote=false){
  remote=isRemote;playing=true;menu=false;paused=false;endShown=false;weaponKey='';windowKey='';squadKey='';$('menu').hidden=true;$('hud').hidden=false;$('game-over').hidden=true;$('pause-panel').hidden=true;$('resume').disabled=false;
  $('location-name').textContent=game.map.name.toUpperCase();$('mode-label').textContent=isRemote?'PRIVATE CO-OP · ROOM '+(room?.id||''): 'SOLO SURVIVAL';resetControls();acc=0;last=performance.now();audio.start();
  const p=game.player(selfId);if(p){angle=p.angle;pitch=p.pitch;}if(!isRemote)announce('BOARD UP',game.map.subtitle+' · Make them wait.');
}
function startSolo(){net.leave();room=null;selfId='p1';game=new ClaimGame({mission:$('map-select').value,difficulty:$('difficulty').value,seed:Date.now()});game.start();enterGame();lock();}
function lock(){if(!touch&&playing&&!paused&&game.state.status==='playing'){try{const p=canvas.requestPointerLock();p?.catch?.(()=>textToast('Click the view to capture the mouse.'));}catch{}}}
function pause(reason='manual'){
  if(!playing||paused||game.state.status==='dead')return;resetControls();paused=true;document.exitPointerLock?.();
  if(remote){net.send({type:'pause',reason});$('pause-detail').textContent='The team is paused. Everyone must resume.';}else{game.pause();$('pause-detail').textContent='The world is paused. Your house is waiting.';}
  $('pause-title').textContent='TAKE A BREATH.';$('resume').textContent='BACK TO THE HOUSE';$('pause-panel').hidden=false;
}
function resume(){audio.start();if(remote){net.send({type:'resume'});$('resume').textContent='WAITING FOR NEIGHBORS…';}else{game.resume();acc=0;last=performance.now();paused=false;$('pause-panel').hidden=true;lock();}}
function mainMenu(){net.leave();remote=false;room=null;playing=false;menu=true;paused=false;endShown=false;game=new ClaimGame();selfId='p1';resetControls();document.exitPointerLock?.();$('menu').hidden=false;$('hud').hidden=true;$('pause-panel').hidden=true;$('game-over').hidden=true;$('party-panel').hidden=true;$('main-actions').hidden=false;$('room-entry').hidden=false;$('room-lobby').hidden=true;$('resume').disabled=false;}
function renderLobby(){if(!room)return;$('room-entry').hidden=true;$('room-lobby').hidden=false;$('room-id').textContent=room.id;const roster=$('roster');roster.replaceChildren();for(const p of room.players){const li=document.createElement('li'),name=document.createElement('b'),status=document.createElement('span');name.textContent=p.name+(p.id===room.ownerId?' · HOST':'');status.textContent=!p.connected?'RECONNECTING':p.ready?'READY':'GETTING SET';li.append(name,status);roster.append(li);}ready=room.players.find(p=>p.id===selfId)?.ready||false;$('ready').textContent=ready?'READY ✓':'I’M READY';$('start-room').hidden=selfId!==room.ownerId;$('start-room').disabled=room.players.length<2||!room.players.every(p=>p.ready&&p.connected);}
function beginConnect(join=false){audio.start();$('network-status').textContent='Connecting…';const name=$('player-name').value.trim()||'Neighbor',code=$('room-code').value.trim().toUpperCase();if(join&&!/^[A-Z2-9]{8}$/.test(code)){$('network-status').textContent='Enter the eight-character room code.';return;}net.leave();net.connect({code:join?code:undefined,name,difficulty:$('difficulty').value,mission:$('map-select').value});remote=true;}
function selectWeapon(id){if(remote)net.send({type:'weapon',weapon:id});else game.switchWeapon(selfId,id);}
$('map-select').onchange=()=>{game=new ClaimGame({mission:$('map-select').value});$('map-caption').textContent=game.map.name.toUpperCase();$('map-description').textContent=game.map.subtitle;};
$('solo').onclick=startSolo;
$('party').onclick=()=>{$('party-panel').hidden=false;$('main-actions').hidden=true;};
$('party-back').onclick=()=>{net.leave();remote=false;room=null;$('party-panel').hidden=true;$('main-actions').hidden=false;$('room-entry').hidden=false;$('room-lobby').hidden=true;};
$('instructions').onclick=()=>$('guide').showModal();$('close-guide').onclick=()=>$('guide').close();
$('sound').onclick=()=>{audio.start();$('sound').textContent=audio.mute()?'SOUND ON':'SOUND OFF';};
$('create-room').onclick=()=>beginConnect();$('join-room').onclick=()=>beginConnect(true);
$('ready').onclick=()=>net.send({type:'ready',ready:!ready});$('start-room').onclick=()=>net.send({type:'start'});
$('leave-room').onclick=()=>{net.leave();remote=false;room=null;$('room-entry').hidden=false;$('room-lobby').hidden=true;$('network-status').textContent='Room closed.';};
$('copy-invite').onclick=async()=>{const url=new URL(location.href);url.search='';url.searchParams.set('room',room.id);try{await navigator.clipboard.writeText(url.href);$('network-status').textContent='Invite copied.';}catch{$('network-status').textContent='Share this room code: '+room.id;}};
$('pause').onclick=()=>pause();$('resume').onclick=resume;$('quit').onclick=mainMenu;$('end-menu').onclick=mainMenu;
$('retry').onclick=()=>{if(remote){net.send({type:'restart'});$('game-over').hidden=true;endShown=false;}else startSolo();};
bindDesktopControls({document,canvas,keys,pulses,touch,lock,pause,reset:resetControls,selectWeapon,
  active:()=>playing&&!paused&&game.state.status==='playing',onFire:value=>mouseFire=value,
  onLook:(dx,dy)=>{angle+=dx*.0025*settings.mouseSensitivity;pitch=Math.max(-.85,Math.min(.85,pitch-dy*.0022*settings.mouseSensitivity*(settings.invertY?-1:1)));},
});
bindGameLifecycle({window,document,touch,reset:resetControls,pause,active:()=>playing&&!paused});
window.addEventListener('resize',()=>renderer.resize());
touchControls=new TouchControls({
  stick:$('stick'),knob:$('stick-knob'),look:$('look-zone'),
  settings:()=>settings,buttons:{fire:$('touch-fire'),use:$('touch-use'),reload:$('touch-reload')},
  active:()=>playing&&!paused&&game.state.status==='playing',onAction:()=>audio.start(),
  onLook:(dx,dy)=>{angle+=dx*.006*settings.touchSensitivity;pitch=Math.max(-.85,Math.min(.85,pitch-dy*.005*settings.touchSensitivity*(settings.invertY?-1:1)));},
});
startControlStream({active:()=>remote&&playing&&!paused&&!document.hidden,read:input,send:input=>net.input(input)});
function input(){const stick=touchControls.stick,touchInput=touchControls.consume();const result={forward:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-stick.y,strafe:(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+stick.x,angle,pitch,fire:mouseFire||keys.has('Space')||touchInput.fire||pulses.fire,use:keys.has('KeyE')||touchInput.use||pulses.use,reload:keys.has('KeyR')||touchInput.reload||pulses.reload,sprint:keys.has('ShiftLeft')};Object.assign(pulses,{fire:false,use:false,reload:false});return result;}
function hud(){
  const s=game.state,p=game.player(selfId)||s.players[0];if(!p)return;
  $('health').textContent=p.dead?'OUT':p.down?'DOWN':Math.ceil(p.health);$('health-bar').value=p.health;$('credits').textContent=p.credits+' CREDITS';$('weapon-name').textContent=WEAPONS[p.weapon].name.toUpperCase();$('ammo').textContent=p.ammo[p.weapon];$('reserve').textContent='/ '+p.reserve[p.weapon];$('reload-status').textContent=p.reloading>0?'RELOADING…':p.ammo[p.weapon]===0?'RELOAD':touch?'':'R TO RELOAD';
  $('wave-label').textContent=s.phase==='prep'?(s.wave?'REGROUP':'BOARD UP'):'WAVE';$('wave-number').textContent=String(s.wave).padStart(2,'0');$('floor-label').textContent=game.map.stairs.length?((p.y||0)>3.3?'UPPER GALLERY':(p.y||0)>.1?'STAIRCASE':'GROUND FLOOR'):'';$('wave-detail').textContent=s.phase==='prep'?Math.ceil(Math.max(0,s.timer))+' seconds':(s.remaining+s.enemies.length)+' remaining';
  const c=game.context(selfId);$('prompt').hidden=!c||paused;if(c){$('prompt-text').textContent=(touch?'USE':'[E]')+' '+c.text;$('prompt-progress').style.width=Math.min(100,(c.progress||0)*100)+'%';$('touch-use-label').textContent=c.type==='repair'?'REPAIR':c.type==='revive'?'REVIVE':'BUY';}else $('touch-use-label').textContent='USE';
  const wk=s.windows.map(w=>Math.ceil(w.health/40)).join(',');if(wk!==windowKey){windowKey=wk;$('window-list').replaceChildren();for(const w of s.windows){const div=document.createElement('div');div.className='window-status'+(w.health<=0?' breached':'');const label=document.createElement('span');label.textContent=w.name;div.append(label);for(let i=0;i<3;i++){const bar=document.createElement('i');if(w.health<=i*40)bar.className='gone';div.append(bar);}$('window-list').append(div);}}
  const sk=s.players.map(q=>q.id+Math.ceil(q.health)+q.down+q.dead).join();if(sk!==squadKey){squadKey=sk;$('squad').replaceChildren();if(s.players.length>1)for(const q of s.players){const el=document.createElement('p'),b=document.createElement('b');el.textContent=(room?.players.find(v=>v.id===q.id)?.name||q.id)+' ';b.textContent=q.dead?'OUT':q.down?'DOWN':Math.ceil(q.health)+' HP';el.append(b);$('squad').append(el);}}
  const wep=p.owned.join()+p.weapon;if(wep!==weaponKey){weaponKey=wep;$('weapon-bar').replaceChildren();for(const id of p.owned){const b=document.createElement('button');b.textContent=touch?String(WEAPON_ORDER.indexOf(id)+1):WEAPONS[id].name;b.setAttribute('aria-label',WEAPONS[id].name);b.title=WEAPONS[id].name;b.className=p.weapon===id?'selected':'';b.onclick=()=>selectWeapon(id);$('weapon-bar').append(b);}}
  if(p.down||p.dead)textToast(p.dead?'Eliminated. Watching a neighbor. Return next wave.':'DOWNED · '+Math.ceil(p.bleed)+' seconds to be revived',.2);
  if(s.status==='dead'&&!endShown){endShown=true;resetControls();document.exitPointerLock?.();$('game-over').hidden=false;$('pause-panel').hidden=true;let best=0;try{best=Number(localStorage.getItem('claim-best'))||0;localStorage.setItem('claim-best',String(Math.max(best,s.wave)));}catch{}$('end-summary').textContent='The house fell on wave '+s.wave+'. '+s.kills+' executives sent packing. Best wave: '+Math.max(best,s.wave)+'.';$('end-stats').replaceChildren();for(const [value,label] of [[p.kills,'YOUR ELIMINATIONS'],[p.repairs,'BOARDS REPAIRED'],[p.revives,'NEIGHBORS REVIVED']]){const d=document.createElement('div'),b=document.createElement('b'),span=document.createElement('span');b.textContent=value;span.textContent=label;d.append(b,span);$('end-stats').append(d);}$('retry').hidden=remote&&room?.ownerId!==selfId;}
}
function frame(now){
  const elapsed=(now-last)/1000,dt=Math.min(.25,elapsed);last=now;canvas.dataset.frameMs=String(Math.round(elapsed*1000));canvas.dataset.simTime=game.state.time.toFixed(2);canvas.dataset.status=game.state.status;canvas.dataset.angle=angle.toFixed(3);canvas.dataset.paused=String(paused);canvas.dataset.map=game.state.mapId;canvas.dataset.height=String(game.player(selfId)?.y||0);canvas.dataset.playerX=String(game.player(selfId)?.x);canvas.dataset.playerZ=String(game.player(selfId)?.z);
  if(playing&&!paused){const aim=assistAim(game.state,game.player(selfId),angle,pitch,settings.aimAssist/100,Math.min(dt,.05));angle=aim.angle;pitch=aim.pitch;if(keys.has('ArrowLeft'))angle-=dt*1.8;if(keys.has('ArrowRight'))angle+=dt*1.8;
    if(!remote){acc+=dt;while(acc>=1/60){game.update(1/60,{[selfId]:input()});acc-=1/60;}handleEvents(game.drainEvents());}
  }
  if(playing){hud();audio.update(game.state);}
  if(now>toastUntil)$('toast').textContent='';if(now>announceUntil)$('announcement').classList.remove('active');$('damage').style.opacity=now<hurtUntil?.55:0;$('hitmarker').style.opacity=now<hitUntil?1:0;
  const renderStart=performance.now();renderer.render(dt,game.state,selfId,{menu,remote,angle,pitch});canvas.dataset.renderMs=String(Math.round(performance.now()-renderStart));requestAnimationFrame(frame);
}
const code=new URL(location.href).searchParams.get('room');if(code){$('party-panel').hidden=false;$('main-actions').hidden=true;$('room-code').value=code.toUpperCase();}
try{const saved=JSON.parse(sessionStorage.getItem('claim-room'));if(saved?.code&&saved?.token){$('party-panel').hidden=false;$('main-actions').hidden=true;$('player-name').value=saved.name;$('room-code').value=saved.code;net.token=saved.token;remote=true;net.connect({code:saved.code,name:saved.name,resume:true});}}catch{}
// Read-only QA/diagnostics: no test cheats or writable game state exposed.
window.claimDenied={version:VERSION,inspect:()=>({state:game.networkSnapshot(),selfId,remote,playing,paused,room:room?{id:room.id,status:room.status,players:room.players}:null,renderer:{calls:renderer.renderer.info.render.calls,software:!!renderer.renderer.isSoftware}})};
requestAnimationFrame(frame);
