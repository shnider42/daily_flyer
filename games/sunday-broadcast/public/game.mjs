import {Football,PLAYS,DEFENSE,TEAMS,clamp} from './football.mjs?v=3';
import {Stadium} from './stadium.mjs?v=3';
import {FallbackStadium} from './fallback-stadium.mjs?v=3';
import {OnlineMatch} from './online.mjs?v=3';
const $=id=>document.getElementById(id);
const screen=$('screen'),keys=new Set();
const touchMode=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
let game=new Football(),stadium,started=false,paused=false,mode=0,replay=null,last=performance.now(),uiState='',muted=true,audio,crowd;
const thumb={x:0,y:0,sprint:false};
const bulletHold=175;
let passHold=null,queuedPass=null;
let room=null,roomMode=false,roomBusy=false,bookTab='',selected=null,readyPending=false;
let cameraPin=null,zoom=1,fromFrame=null,toFrame=null,frameReceived=0,controlsAvailable=false;
const neutral={x:0,y:0,sprint:false};
const online=new OnlineMatch({onState:receiveRoom,onStatus:roomNotice,onError:roomError});

function resetInputs(){
  keys.clear();clearPass();thumb.x=thumb.y=0;thumb.sprint=false;
  const knob=$('stick').firstElementChild;
  knob.style.transform='';
}
function roomNotice(message){
  if(!message){showRoomBar();return}
  if(!online.connected&&started){resetInputs();refresh()}
  if(roomMode&&!started)$('menu-status').textContent=message||'';
  if(roomMode&&started)$('room-status').textContent=message||'';
}
function roomError(error){
  readyPending=false;
  const message=error?.message||String(error);
  if(roomMode&&started){
    refresh();
    $('room-status').textContent=message;
  }else $('menu-status').textContent=message;
}
function setMenuBusy(value){
  roomBusy=value;
  ['create-room','join-room','rejoin-room','start'].forEach(id=>{$(id).disabled=value||!stadium});
}
function showRoomBar(){
  $('room-bar').hidden=!roomMode;
  if(!roomMode)return;
  $('room-label').textContent=online.code?'ROOM '+online.code+' · '+TEAMS[online.side]?.abbr:'ONLINE 1V1';
  const other=room?.ready?.[1-online.side];
  $('room-status').textContent=room?.status==='waiting'?'Waiting for a second player':
    room?.status==='reconnecting'?'Match held while a player reconnects':
    room?.status==='closed'?'Room closed':
    other&&game.state!=='live'?'Opponent ready':'Private 1v1';
}
async function openRoom(method,value){
  if(roomBusy||started||!stadium)return;
  roomMode=true;room=null;
  setMenuBusy(true);
  roomNotice('Connecting to match server…');
  try{
    await online[method](value);
    showRoomBar();
    if(room?.status==='waiting')roomNotice('Waiting for opponent. Copy the invite above.');
  }catch(error){
    roomMode=false;showRoomBar();roomError(error);
  }finally{
    setMenuBusy(false);
    $('rejoin-room').hidden=!online.hasSavedSession;
  }
}
function frameOf(model){
  return {
    off:model.off,def:model.def,ball:model.ball,possession:model.possession,
    spot:model.spot,marker:model.marker,active:model.player?.i,
    offenseHuman:model.offenseHuman,t:model.t,carrierIndex:model.carrierIndex,control:model.control,
    flight:model.flight,dive:model.dive,playBall:model.playBall
  };
}
function receiveRoom(packet){
  if(!roomMode)return;
  const oldRoom=room,oldState=game.state;
  room=packet.room;
  const phaseChanged=oldRoom?.phase!==room.phase;
  const availabilityChanged=controlsAvailable!==roomPlayable();
  controlsAvailable=roomPlayable();
  if(room.status==='closed'){
    returnToMenu();
    $('menu-status').textContent=packet.room.reason||'The other player left the room.';
    return;
  }
  if(packet.game){
    if(!started||(packet.game.state==='pre'&&packet.game.quarter===1&&game.state==='summary')){
      game=new Football({human:online.side,online:true});
      enterMatch();
    }
    if(phaseChanged){
      clearPass();selected=null;readyPending=false;bookTab='';
      if(packet.game.state==='live')replay=null;
    }
    Object.assign(game,packet.game,{human:online.side});
    if(packet.replay)Object.assign(game,packet.replay);
    if(room.ready?.[online.side])readyPending=false;
    if(oldRoom?.status==='playing'&&room.status!=='playing')resetInputs();
    const next=frameOf(game);
    fromFrame=phaseChanged?next:displayFrame(performance.now());
    toFrame=next;frameReceived=performance.now();
    if(oldState!==game.state){
      if(game.state==='dead')cue(1710,.24,'sine',1160);
      if(game.state==='live')cue(170,.13,'triangle',83);
    }
    if(availabilityChanged||phaseChanged||oldState!==game.state||oldRoom?.status!==room.status||
      oldRoom?.ready?.[0]!==room.ready?.[0]||oldRoom?.ready?.[1]!==room.ready?.[1]||uiState!==game.state)refresh();
  }
  if(phaseChanged||oldRoom?.status!==room.status||oldRoom?.ready?.join()!==room.ready?.join())showRoomBar();
  if(room.status==='waiting'&&!started)roomNotice('Waiting for opponent. Copy the invite above.');
}
function roomPlayable(){return !roomMode||room?.status==='playing'&&online.connected}
function displayFrame(time){
  if(!roomMode||!fromFrame||!toFrame||game.state!=='live')return frameOf(game);
  const amount=clamp((time-frameReceived)/42,0,1);
  const mix=(a,b)=>a+(b-a)*amount;
  const roster=(prev,next)=>next.map((p,i)=>({...p,x:mix(prev[i]?.x??p.x,p.x),y:mix(prev[i]?.y??p.y,p.y)}));
  return {
    ...toFrame,
    off:roster(fromFrame.off,toFrame.off),def:roster(fromFrame.def,toFrame.def),
    ball:{x:mix(fromFrame.ball.x,toFrame.ball.x),y:mix(fromFrame.ball.y,toFrame.ball.y),h:mix(fromFrame.ball.h,toFrame.ball.h)},
    t:mix(fromFrame.t,toFrame.t)
  };
}

function clearPass(){
  passHold=null;
  queuedPass=null;
}
function beginPass(id,index){
  if(paused||replay||!roomPlayable()||!game.offenseHuman||!game.canPass||passHold||queuedPass)return;
  passHold={id,index,time:performance.now()};
}
function queuePass(index,bullet){
  if(!paused&&!replay&&roomPlayable()&&game.offenseHuman&&game.canPass){
    const {x,y}=input();
    queuedPass={index,bullet,aim:{x,y}};
  }
}
function releasePass(id){
  if(passHold?.id!==id)return;
  const {index,time}=passHold;
  passHold=null;
  queuePass(index,performance.now()-time>=bulletHold);
}
function updatePass(time){
  if(!roomPlayable()||!game.canPass){clearPass();return}
  if(passHold&&time-passHold.time>=bulletHold){
    const {index}=passHold;
    passHold=null;
    queuePass(index,true);
  }
  if(!queuedPass)return;
  if(roomMode){
    if(game.t<.12)return;
    online.command('pass',queuedPass);
    queuedPass=null;
  }else if(game.pass(queuedPass.index,queuedPass.bullet,game.human,queuedPass.aim))queuedPass=null;
}
function bindPass(button,index){
  button.type='button';
  button.setAttribute('aria-label','Pass to receiver '+(index+1));
  button.onpointerdown=e=>{
    if(e.button!==0)return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    beginPass(e.pointerId,index);
  };
  button.onpointerup=e=>releasePass(e.pointerId);
  button.onlostpointercapture=e=>{if(passHold?.id===e.pointerId)passHold=null};
  button.onclick=e=>{if(e.detail===0&&e.pointerType!=='touch')queuePass(index,false)};
}
function passButtons(parent,className){
  return Array.from({length:4},(_,i)=>{
    const button=document.createElement('button');
    button.className=className;
    button.textContent=i+1;
    button.hidden=true;
    bindPass(button,i);
    parent.append(button);
    return button;
  });
}
const tags=passButtons($('tags'),'tag');
const receiverBar=$('receiver-bar');
const receiverButtons=passButtons(receiverBar,'receiver-button');
try{
  stadium=new Stadium($('field'));
}catch{
  try{
    stadium=new FallbackStadium($('field'));
    $('menu-status').textContent='Field view is active on this device.';
  }catch{
    call('This browser could not open the field.');
    setMenuBusy(false);
  }
}
function fmt(seconds){
  const s=Math.ceil(seconds);
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
function audioOn(){
  if(!audio){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return;
    audio=new Context();
    const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),data=buffer.getChannelData(0);
    let filter=0;
    for(let i=0;i<data.length;i++){filter=filter*.94+(Math.random()-.5)*.13;data[i]=filter}
    const bed=audio.createBufferSource();bed.buffer=buffer;bed.loop=true;
    const band=audio.createBiquadFilter();band.type='bandpass';band.frequency.value=540;band.Q.value=.5;
    crowd=audio.createGain();crowd.gain.value=0;bed.connect(band).connect(crowd).connect(audio.destination);bed.start();
  }
  audio.resume().catch(()=>{});
  volume();
}
function volume(){
  if(crowd)crowd.gain.setTargetAtTime(muted||paused||!started?0:game.state==='live'?.17:game.state==='dead'?.24:.09,audio.currentTime,.25);
}
function cue(frequency,duration,shape='sine',end=frequency){
  if(!audio||muted)return;
  const tone=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;
  tone.type=shape;tone.frequency.setValueAtTime(frequency,time);tone.frequency.exponentialRampToValueAtTime(end,time+duration);
  gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.065,time+.018);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  tone.connect(gain).connect(audio.destination);tone.start(time);tone.stop(time+duration);
}
function call(text){$('call').textContent=text}
function start(){
  if(roomBusy||roomMode)return;
  game=new Football({human:Number($('team').value),quarter:Number($('duration').value),difficulty:$('difficulty').value});
  enterMatch();refresh();
}
function enterMatch(){
  replay=null;paused=false;started=true;uiState='';bookTab='';selected=null;cameraPin=null;
  readyPending=false;fromFrame=toFrame=null;resetInputs();
  $('start').blur();$('menu').hidden=true;$('desk').hidden=false;$('bug').hidden=false;
  $('camera-desk').hidden=false;$('pause').hidden=roomMode;$('match-layout').classList.add('in-game');
  $('follow-camera').setAttribute('aria-pressed','true');
  if(!muted)audioOn();
}
function diagram(play,i){
  const points=play.routes?.map((route,j)=>{
    const x=[8,17,36,46][j];
    return '<polyline points="'+[[x,27],...route.map(([dx,dy])=>[clamp(x+dx*.53,2,52),Math.max(3,27-dy*.72)])].map(p=>p.join(',')).join(' ')+'"/>';
  }).join('')|| (play.type==='RUN'
    ?'<polyline points="27,29 27,23 '+(play.lane<0?'13,17 9,5':'30,17 34,5')+'"/>'
    :play.type==='KICK'?'<path d="M9 28Q28 1 46 11"/>'
    :i===3?'<path d="M8 5l10 15 M46 5L36 20 M24 5l3 15 M34 5l-7 15"/>'
    :'<path d="M8 25Q8 7 18 7 M24 25Q27 4 31 8 M46 25Q46 7 37 7"/>');
  return '<svg viewBox="0 0 54 33" aria-hidden="true"><path stroke="#526677" d="M1 24h52"/><g stroke="#edc174" stroke-width="1.7" fill="none">'+points+'</g></svg>';
}
function choose(i){
  if(game.state!=='pre'||paused||!roomPlayable()||readyPending)return;
  selected=i;
  if(roomMode)online.command('select',{index:i});
  else game.select(i);
  refresh();
}
function action(){
  if(!started||paused)return;
  if(replay){replay=null;refresh();return}
  if(roomMode){
    if(!roomPlayable())return;
    if(game.state==='live'){
      if(!game.offenseHuman||game.kickMeter)online.command('dive');
      return;
    }
    if(readyPending||room?.ready?.[online.side])return;
    readyPending=true;
    const phase=room.phase;
    online.command(game.state==='summary'&&game.quarter>=4?'rematch':'ready').then(result=>{
      if(result===false&&room?.phase===phase){readyPending=false;refresh()}
    });
    refresh();
    return;
  }
  if(game.state==='dead'||game.state==='summary'){
    if(game.state==='summary'&&game.quarter===4){returnToMenu();return}
    game.advance();refresh();return;
  }
  if(game.state==='pre'){
    game.snap();cue(170,.13,'triangle',83);refresh();
    return;
  }
  game.action();
}
function beginReplay(frames=game.lastReplay){
  if(!frames?.length||game.state==='live')return;
  replay={frames,time:0};refresh();
}
function returnToMenu(){
  if(roomMode)online.leave();
  roomMode=false;room=null;controlsAvailable=false;showRoomBar();
  started=false;replay=null;paused=false;resetInputs();
  $('match-layout').classList.remove('in-game');$('pause').hidden=true;
  $('menu-status').textContent='';$('rejoin-room').hidden=!online.hasSavedSession;
  const url=new URL(location.href);
  url.searchParams.delete('room');
  if(url.href!==location.href)history.replaceState(null,'',url.href);
  $('menu').hidden=false;$('desk').hidden=true;$('bug').hidden=true;$('touch').hidden=true;
  $('pause').textContent='Pause';call('');volume();
}
function touchButtons(){
  const active=started&&!paused&&roomPlayable()&&touchMode&&!replay&&['pre','live'].includes(game.state);
  $('touch').hidden=!active;
  if(!active)return;
  const passActions=$('touch-pass'), liveActions=$('touch-live');
  if(!passActions.children.length){
    for(let i=0;i<4;i++){
      const button=document.createElement('button');button.textContent=i+1;
      bindPass(button,i);passActions.append(button);
    }
  }
  passActions.hidden=!game.offenseHuman||!game.canPass;
  const config=game.state==='pre'?[[roomMode?'Ready':'Snap','snap']]:game.offenseHuman
    ?game.kickMeter?[['Kick','snap']]:[['Cut','skill'],['Sprint','sprint']]
    :[['Switch','skill'],['Tackle / ball','snap'],['Sprint','sprint']];
  const signature=config.map(x=>x.join(':')).join(',');
  if(liveActions.dataset.signature===signature)return;
  liveActions.dataset.signature=signature;liveActions.replaceChildren();
  thumb.sprint=false;
  for(const [label,what] of config){
    const button=document.createElement('button');button.textContent=label;button.type='button';
    liveActions.append(button);
    if(what==='sprint'){
      button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);thumb.sprint=true};
      button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>{thumb.sprint=false};
    }else button.onclick=()=>what==='skill'?skill():action();
  }
}
function skill(){
  if(!roomPlayable())return;
  if(roomMode)online.command('skill');
  else game.skill();
}
function matchButton(label){
  const button=document.createElement('button');
  button.className='primary';
  const ready=roomMode&&(readyPending||room?.ready?.[online.side]);
  button.textContent=ready?'Waiting for opponent':label;
  button.disabled=!!ready||!roomPlayable();
  button.onclick=action;
  return button;
}
function playbook(plays){
  const offense=game.offenseHuman,list=offense?PLAYS:DEFENSE;
  const suggested=offense
    ?game.down===4?(game.spot>=59?5:6):game.marker-game.spot<=3?3:game.down>=3?1:0
    :game.marker-game.spot>7?1:game.marker-game.spot<=3?3:0;
  if(!bookTab)bookTab=offense?list[selected??game.play].type:'DEFENSE';
  const choices=offense?['PASS','RUN','KICK']:['DEFENSE',...(list.length>4?['MORE']:[])];
  const tabs=document.createElement('div');
  tabs.className='playbook-tabs';
  for(const name of choices){
    const button=document.createElement('button');
    button.textContent=name==='MORE'?'More calls':name==='DEFENSE'?'Base calls':name[0]+name.slice(1).toLowerCase();
    button.setAttribute('aria-pressed',String(bookTab===name));
    button.onclick=()=>{bookTab=name;refresh()};
    tabs.append(button);
  }
  const grid=document.createElement('div');grid.className='play-grid';
  const active=selected??(offense?game.play:game.cover);
  if(!choices.includes(bookTab))bookTab=offense?list[active].type:'DEFENSE';
  const options=list.map((p,i)=>({p,i})).filter(({p,i})=>
    offense?p.type===bookTab:bookTab==='MORE'?i>=4:i<4);
  options.forEach(({p,i},index)=>{
    const hotkey=index+1;
    const button=document.createElement('button');
    button.className='play'+(i===active?' selected':'');button.dataset.play=i;
    if(hotkey<=4)button.dataset.hotkey=hotkey;
    button.setAttribute('aria-pressed',String(i===active));
    button.innerHTML=diagram(p,i)+'<span><strong>'+(hotkey<=4?'<span class="hotkey">'+hotkey+'</span>':'')+p.name+'</strong><small>'+p.detail+'</small></span>';
    button.disabled=!roomPlayable()||readyPending;
    button.onclick=()=>choose(i);grid.append(button);
  });
  const footer=document.createElement('div');footer.className='playbook-footer';
  const advice=document.createElement('small');
  advice.textContent='Suggested · '+list[suggested].name;
  if(active!==suggested){
    advice.title='Use the suggested call';
    const use=document.createElement('button');
    use.type='button';use.textContent=advice.textContent;use.disabled=!roomPlayable();
    use.onclick=()=>{bookTab=offense?list[suggested].type:'DEFENSE';choose(suggested)};
    footer.append(use);
  }else footer.append(advice);
  footer.append(matchButton(roomMode?'Ready · Space':offense?'Snap · Space':'Ready · Space'));
  plays.append(tabs,grid,footer);
}
function refresh(){
  if(!started)return;
  uiState=game.state;
  const caption=$('caption'),title=$('desk-title'),plays=$('plays');
  $('replay').hidden=game.state==='live'||!game.lastReplay.length;
  $('replay').textContent=replay?'Exit replay':'↶ Last play';
  plays.className='';plays.replaceChildren();
  if(replay){
    caption.textContent='DFE SPORTS REPLAY';title.textContent='Instant replay';
    call('REPLAY · sideline camera');touchButtons();return;
  }
  if(game.state==='pre'){
    const offense=game.offenseHuman;
    caption.textContent=TEAMS[game.possession].name.toUpperCase()+' BALL · '+(offense?'OFFENSE':'DEFENSE');
    title.textContent=offense?'Call an offensive play':'Set your defense';
    playbook(plays);
    call(game.message||'');
  }else if(game.state==='live'){
    caption.textContent=game.offenseHuman?'OFFENSE':'DEFENSE';
    title.textContent=game.offenseHuman?game.playcall.name:DEFENSE[game.cover].name;
    const p=document.createElement('p');
    p.textContent=game.offenseHuman
      ?game.playcall.type==='PASS'?'Tap 1–4 or click for a lob. Hold for a bullet. Steer as you throw to shade the lead.'
        :game.playcall.type==='RUN'?'Follow the blocks, then press E to cut upfield.'
        :game.kickMeter?'Kick when the needle crosses the gold zone.':'Watch the kick.'
      :'Press E to switch. Space dives for a tackle or plays the ball while a pass is in the air.';
    plays.append(p);
    if(game.offenseHuman&&game.playcall.type==='KICK'){
      const kick=document.createElement('button');
      kick.className='primary';kick.id='kick-action';kick.textContent='Kick · Space';kick.onclick=action;
      kick.hidden=!game.kickMeter;
      plays.append(kick);
    }
    call('');
  }else if(game.state==='dead'){
    caption.textContent='END OF PLAY';title.textContent=game.message;call(game.message);
    plays.append(matchButton('Continue · Space'));
  }else{
    const half=game.quarter===2;
    caption.textContent='DFE SPORTS DESK';title.textContent=half?'Halftime report':game.score[0]===game.score[1]?'Final · tie':TEAMS[game.score[0]>game.score[1]?0:1].name+' win';
    call(half?'HALFTIME':'FINAL');
    const stats=document.createElement('div');stats.className='summary';
    TEAMS.forEach((team,i)=>{
      const s=game.stats[i],block=document.createElement('div');
      block.innerHTML='<strong>'+team.name+' · '+game.score[i]+'</strong><br>'+s.yards+' yards · '+s.pass+'/'+s.att+' passing · '+s.first+' first downs · '+s.turnovers+' giveaways';
      stats.append(block);
    });
    plays.append(stats);
    const highlights=game.highlights.filter(h=>h.frames).sort((a,b)=>b.points-a.points||b.gain-a.gain).slice(0,3);
    const p=document.createElement('p');p.textContent=highlights.length?'Highlights':'No scoring plays, takeaways or gains of 15+ yards yet.';plays.append(p);
    for(const h of highlights){
      const b=document.createElement('button');b.textContent=TEAMS[h.team].abbr+' · Q'+h.quarter+' · '+h.label;b.onclick=()=>beginReplay(h.frames);plays.append(b);
    }
    plays.append(matchButton(half?'Start second half':roomMode?'Ready for rematch':'Back to matchup'));
  }
  touchButtons();volume();
}
function scorebug(){
  const down=['','1st','2nd','3rd','4th'][game.down];
  const toGo=Math.max(1,Math.ceil(game.marker-game.spot));
  const yard=Math.round(game.spot),location=yard===50?'50':TEAMS[yard<50?game.possession:1-game.possession].abbr+' '+(yard<50?yard:100-yard);
  const html='<span class="bos">'+(game.possession===0?'▸ ':'')+'BOS '+game.score[0]+'</span><span class="chi">'+(game.possession===1?'▸ ':'')+'CHI '+game.score[1]+'</span><span>Q'+game.quarter+' '+fmt(game.clock)+'</span><span class="down">'+down+' &amp; '+(game.marker>=100?'Goal':toGo)+' · '+location+'</span>';
  if($('bug').dataset.html!==html){$('bug').innerHTML=html;$('bug').dataset.html=html}
}
function togglePause(){
  if(!started||roomMode)return;
  paused=!paused;keys.clear();clearPass();thumb.x=thumb.y=0;thumb.sprint=false;
  $('pause').textContent=paused?'Resume':'Pause';$('pause-screen')?.remove();
  if(paused){
    const scrim=document.createElement('div');scrim.id='pause-screen';scrim.className='scrim';
    scrim.innerHTML='<div><h2>Game paused</h2><button id="resume-game">Resume</button> <button id="quit-game">Quit to matchup</button></div>';
    screen.append(scrim);$('resume-game').onclick=togglePause;$('quit-game').onclick=()=>{scrim.remove();returnToMenu()};
    $('resume-game').focus();
  }
  volume();touchButtons();
}
function camera(){mode=(mode+1)%3;$('camera').textContent=['Broadcast','All-22','Field'][mode]}
$('start').onclick=start;$('pause').onclick=togglePause;$('camera').onclick=camera;
$('create-room').onclick=()=>openRoom('create',{team:Number($('team').value),quarter:Number($('duration').value)});
$('join-form').onsubmit=e=>{e.preventDefault();openRoom('join',$('room-code').value.trim().toUpperCase())};
$('rejoin-room').onclick=()=>openRoom('rejoin');
$('rejoin-room').hidden=!online.hasSavedSession;
$('leave').onclick=returnToMenu;
const inviteCode=new URL(location.href).searchParams.get('room');
if(inviteCode){$('room-code').value=inviteCode.slice(0,8).toUpperCase();$('menu-status').textContent='Invitation received. Choose Join 1v1.'}
$('copy-invite').onclick=async()=>{
  if(!online.code)return;
  const invite=new URL(location.href);
  invite.searchParams.set('room',online.code);
  try{
    await navigator.clipboard.writeText(invite.href);
    $('room-status').textContent='Invite copied';
  }catch{
    $('room-status').textContent='Share room code '+online.code;
  }
};
$('sound').onclick=()=>{
  muted=!muted;$('sound').textContent=muted?'Sound off':'Sound on';$('sound').setAttribute('aria-pressed',String(!muted));
  if(!muted)audioOn();else volume();
};
$('replay').onclick=()=>replay?(replay=null,refresh()):beginReplay();
const moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
function receiver(code){return /^Digit[1-4]$/.test(code)?Number(code.at(-1))-1:-1}
window.addEventListener('keydown',e=>{
  if(!started||e.altKey||e.metaKey||e.ctrlKey||e.target instanceof HTMLSelectElement)return;
  if(e.target instanceof HTMLInputElement&&e.code!=='Escape')return;
  if(e.code==='Space'&&e.target instanceof HTMLButtonElement&&e.target.matches(':focus-visible'))return;
  if(moveKeys.has(e.code)){e.preventDefault();keys.add(e.code);return}
  const i=receiver(e.code);
  if(!['Space','KeyE','KeyV','Escape'].includes(e.code)&&i<0)return;
  e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Escape'){togglePause();return}
  if(e.code==='KeyV'){camera();return}
  if(paused||replay&&e.code!=='Space')return;
  if(i>=0){
    if(game.state==='pre'){
      const play=$('plays').querySelector('[data-hotkey="'+(i+1)+'"]');
      if(play)choose(Number(play.dataset.play));
    }else beginPass(e.code,i);
  }
  if(e.code==='Space')action();
  if(e.code==='KeyE')skill();
});
window.addEventListener('keyup',e=>{
  keys.delete(e.code);
  releasePass(e.code);
});
window.addEventListener('blur',()=>{
  resetInputs();if(roomMode)online.input(neutral);
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    resetInputs();if(roomMode)online.input(neutral);
  }
});
const stick=$('stick'),knob=stick.firstElementChild;
let pointer=null;
function stickMove(e){
  const r=stick.getBoundingClientRect();
  const x=(e.clientX-r.left-r.width/2)/32,y=(e.clientY-r.top-r.height/2)/32;
  const magnitude=Math.hypot(x,y);
  const scale=magnitude>.12?Math.min(1,(magnitude-.12)/.88)/magnitude:0;
  thumb.x=x*scale;thumb.y=-y*scale;knob.style.transform='translate('+thumb.x*26+'px,'+(-thumb.y*26)+'px)';
}
stick.onpointerdown=e=>{if(pointer===null){pointer=e.pointerId;stick.setPointerCapture(pointer);stickMove(e)}};
stick.onpointermove=e=>{if(e.pointerId===pointer)stickMove(e)};
stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=e=>{if(e.pointerId===pointer){pointer=null;thumb.x=thumb.y=0;knob.style.transform=''}};
function input(){
  const x=thumb.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const y=thumb.y+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const magnitude=Math.max(1,Math.hypot(x,y));
  return {x:x/magnitude,y:y/magnitude,sprint:thumb.sprint||keys.has('ShiftLeft')||keys.has('ShiftRight')};
}
const map=$('minimap'),mapCtx=map.getContext('2d');
function mapPin(event){
  const rect=map.getBoundingClientRect();
  cameraPin={x:clamp((event.clientY-rect.top)/rect.height*53.33-26.665,-26.665,26.665),
    y:clamp((event.clientX-rect.left)/rect.width*120-10,-10,110)};
  $('follow-camera').setAttribute('aria-pressed','false');
}
map.onpointerdown=event=>{map.setPointerCapture(event.pointerId);mapPin(event)};
map.onpointermove=event=>{if(map.hasPointerCapture(event.pointerId))mapPin(event)};
$('follow-camera').onclick=()=>{
  cameraPin=null;$('follow-camera').setAttribute('aria-pressed','true');
};
$('zoom').oninput=event=>{zoom=Number(event.target.value)/100};
function drawMap(frame){
  if(!mapCtx||!started)return;
  const w=map.width,h=map.height,g=mapCtx;
  const mapX=y=>(y+10)*w/120,mapY=x=>(x+26.665)*h/53.33;
  g.fillStyle='#274c36';g.fillRect(0,0,w,h);
  const colors=['#234f79','#a4472c'];
  g.fillStyle=colors[frame.possession];g.fillRect(0,0,mapX(0),h);
  g.fillStyle=colors[1-frame.possession];g.fillRect(mapX(100),0,w-mapX(100),h);
  g.strokeStyle='#b1c0a875';g.strokeRect(.5,.5,w-1,h-1);
  for(let yard=0;yard<=100;yard+=10){
    g.beginPath();g.moveTo(mapX(yard),1);g.lineTo(mapX(yard),h-1);g.stroke();
  }
  g.fillStyle='#6dd8ff';g.fillRect(mapX(frame.spot)-.5,0,1,h);
  g.fillStyle='#ffd168';g.fillRect(mapX(frame.marker)-.5,0,1,h);
  for(const [players,color] of [[frame.off,'#faf2dd'],[frame.def,'#e78b71']]){
    g.fillStyle=color;
    for(const p of players)g.fillRect(mapX(p.y)-1,mapY(p.x)-1,2,2);
  }
  const focus=cameraPin??frame.ball;
  g.strokeStyle='#fff5c4';g.strokeRect(clamp(mapX(focus.y)-11,0,w-22),clamp(mapY(focus.x)-8,0,h-16),22,16);
}
function renderKickMeter(){
  const meter=$('kick-meter'),k=game.kickMeter;
  meter.hidden=!started||!k||!game.offenseHuman||paused||!!replay;
  if(!meter.hidden){
    $('kick-window').style.left=((1-k.window)*50)+'%';
    $('kick-window').style.width=k.window*100+'%';
    $('kick-needle').style.left=((k.value+1)*50)+'%';
  }
  const button=$('kick-action');
  if(button)button.hidden=meter.hidden;
}
let accumulator=0;
function frame(time){
  const dt=Math.min(.05,(time-last)/1000);last=time;
  if(started&&!paused){
    if(replay){
      if(roomMode)online.input(neutral);
      replay.time+=dt*19;
      if(replay.time>=replay.frames.length+12){replay=null;refresh()}
    }else{
      accumulator+=dt;
      updatePass(time);
      const controls=input();
      if(roomMode){
        online.input(roomPlayable()&&game.state==='live'?controls:neutral);
        accumulator=0;
      }else while(accumulator>=1/120){game.tick(1/120,controls);accumulator-=1/120}
      if(uiState!==game.state){
        if(game.state==='dead')cue(1710,.24,'sine',1160);
        refresh();
      }
      if(touchMode&&game.state==='live')touchButtons();
    }
    scorebug();
  }
  let renderFrame=displayFrame(time);
  if(replay){
    const saved=replay.frames[Math.min(replay.frames.length-1,Math.floor(replay.time))];
    const offenseHuman=saved.possession===game.human;
    renderFrame={...saved,offenseHuman,active:offenseHuman?saved.carrierIndex:saved.control};
  }
  const play=started&&!replay&&game.state==='pre'&&game.offenseHuman?PLAYS[selected??game.play]:null;
  stadium.render(renderFrame,mode,dt,!started,Boolean(replay),{
    play,pin:cameraPin,zoom,showReceivers:started&&game.offenseHuman&&game.canPass
  });
  drawMap(renderFrame);renderKickMeter();
  const showTags=started&&!replay&&!paused&&roomPlayable()&&game.offenseHuman&&game.canPass;
  receiverBar.hidden=!showTags||touchMode;
  receiverButtons.forEach((button,i)=>{
    button.hidden=receiverBar.hidden;
    button.classList.toggle('loading',passHold?.index===i);
  });
  tags.forEach((tag,i)=>{
    const pos=showTags?stadium.screen(renderFrame.off[7+i]):null;
    tag.hidden=!pos?.visible;
    tag.classList.toggle('loading',passHold?.index===i);
    if(pos?.visible){tag.style.left=pos.x+'%';tag.style.top=pos.y+'%'}
  });
  requestAnimationFrame(frame);
}
if(stadium)requestAnimationFrame(frame);
