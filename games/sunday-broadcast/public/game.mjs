import {Football,PLAYS,DEFENSE,TEAMS,clamp} from './football.mjs';
import {Stadium} from './stadium.mjs';
const $=id=>document.getElementById(id);
const screen=$('screen'),keys=new Set();
const touchMode=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
let game=new Football(),stadium,started=false,paused=false,mode=0,replay=null,last=performance.now(),uiState='',muted=true,audio,crowd;
const thumb={x:0,y:0,sprint:false};
const bulletHold=175;
let passHold=null,queuedPass=null;

function clearPass(){
  passHold=null;
  queuedPass=null;
}
function beginPass(id,index){
  if(paused||replay||!game.offenseHuman||!game.canPass||passHold||queuedPass)return;
  passHold={id,index,time:performance.now()};
}
function queuePass(index,bullet){
  if(!paused&&!replay&&game.offenseHuman&&game.canPass)queuedPass={index,bullet};
}
function releasePass(id){
  if(passHold?.id!==id)return;
  const {index,time}=passHold;
  passHold=null;
  queuePass(index,performance.now()-time>=bulletHold);
}
function updatePass(time){
  if(!game.canPass){clearPass();return}
  if(passHold&&time-passHold.time>=bulletHold){
    const {index}=passHold;
    passHold=null;
    queuePass(index,true);
  }
  if(queuedPass&&game.pass(queuedPass.index,queuedPass.bullet))queuedPass=null;
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
try{stadium=new Stadium($('field'))}catch(error){
  console.error(error);
  $('call').textContent='This game needs WebGL. Enable hardware acceleration or try another browser.';
  $('start').disabled=true;
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
  game=new Football({human:Number($('team').value),quarter:Number($('duration').value),difficulty:$('difficulty').value});
  replay=null;paused=false;started=true;uiState='';$('start').blur();$('menu').hidden=true;$('desk').hidden=false;$('bug').hidden=false;
  if(!muted)audioOn();
  refresh();
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
  game.select(i);
  $('plays').querySelectorAll('[data-play]').forEach((button,j)=>{
    button.classList.toggle('selected',i===j);button.setAttribute('aria-pressed',String(i===j));
  });
}
function action(){
  if(!started||paused)return;
  if(replay){replay=null;refresh();return}
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
  started=false;replay=null;paused=false;keys.clear();clearPass();$('menu').hidden=false;$('desk').hidden=true;$('bug').hidden=true;$('touch').hidden=true;
  $('pause').textContent='Pause';call('');volume();
}
function touchButtons(){
  const active=started&&!paused&&touchMode&&!replay&&['pre','live'].includes(game.state);
  $('touch').hidden=!active;
  if(!active)return;
  const actions=$('actions');
  const config=game.state==='pre'?[['Snap','snap']]:game.offenseHuman
    ?[...(game.canPass?[['1','pass0'],['2','pass1'],['3','pass2'],['4','pass3']]:[]),['Cut','skill'],['Sprint','sprint']]
    :[['Switch','skill'],['Dive','snap'],['Sprint','sprint']];
  const signature=config.map(x=>x[1]).join();
  if(actions.dataset.signature===signature)return;
  actions.dataset.signature=signature;actions.replaceChildren();
  thumb.sprint=false;
  for(const [label,what] of config){
    const b=document.createElement('button');b.textContent=label;b.type='button';
    actions.append(b);
    if(what.startsWith('pass')){
      bindPass(b,Number(what.at(-1)));
    }else if(what==='sprint'){
      b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);thumb.sprint=true};
      b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{thumb.sprint=false};
    }else b.onclick=()=>what==='skill'?game.skill():action();
  }
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
    const offense=game.offenseHuman,list=offense?PLAYS:DEFENSE;
    caption.textContent=TEAMS[game.possession].name.toUpperCase()+' BALL · '+(offense?'OFFENSE':'DEFENSE');
    title.textContent=offense?'Call an offensive play':'Set your defense';
    plays.className='play-grid';
    list.forEach((p,i)=>{
      if(p.type==='KICK'&&game.down!==4&&p.name==='Punt')return;
      const b=document.createElement('button');b.className='play'+(i===(offense?game.play:game.cover)?' selected':'');b.dataset.play=i;
      b.setAttribute('aria-pressed',String(b.classList.contains('selected')));
      b.innerHTML=diagram(p,i)+'<span><strong>'+p.name+'</strong><small>'+p.detail+'</small></span>';
      b.onclick=()=>choose(i);plays.append(b);
    });
    const snap=document.createElement('button');snap.className='primary';snap.textContent=offense?'Snap · Space':'Ready · Space';snap.onclick=action;plays.append(snap);
    call(game.message||'');
  }else if(game.state==='live'){
    caption.textContent=game.offenseHuman?'OFFENSE':'DEFENSE';
    title.textContent=game.offenseHuman?game.playcall.name:DEFENSE[game.cover].name;
    const p=document.createElement('p');
    p.textContent=game.offenseHuman?(game.playcall.type==='PASS'?'Tap 1–4 or click a receiver to lob. Hold briefly for a bullet.':game.playcall.type==='RUN'?'Follow the blocks, then cut upfield.':'Watch the kick.'):'Close the angle. Switch to a nearby defender or dive for the tackle.';
    plays.append(p);call('');
  }else if(game.state==='dead'){
    caption.textContent='END OF PLAY';title.textContent=game.message;call(game.message);
    const next=document.createElement('button');next.className='primary';next.textContent='Continue · Space';next.onclick=action;plays.append(next);
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
    const next=document.createElement('button');next.className='primary';next.textContent=half?'Start second half':'Back to matchup';next.onclick=action;plays.append(next);
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
  if(!started)return;
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
function camera(){mode=(mode+1)%3;$('camera').textContent=['Camera · Broadcast','Camera · All-22','Camera · Field'][mode]}
$('start').onclick=start;$('pause').onclick=togglePause;$('camera').onclick=camera;
$('sound').onclick=()=>{
  muted=!muted;$('sound').textContent=muted?'Sound off':'Sound on';$('sound').setAttribute('aria-pressed',String(!muted));
  if(!muted)audioOn();else volume();
};
$('replay').onclick=()=>replay?(replay=null,refresh()):beginReplay();
const moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
function receiver(code){return /^Digit[1-4]$/.test(code)?Number(code.at(-1))-1:-1}
window.addEventListener('keydown',e=>{
  if(!started||e.altKey||e.metaKey||e.ctrlKey||e.target instanceof HTMLSelectElement)return;
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
    if(game.state==='pre'&&$('plays').querySelector('[data-play="'+i+'"]'))choose(i);
    else beginPass(e.code,i);
  }
  if(e.code==='Space')action();
  if(e.code==='KeyE')game.skill();
});
window.addEventListener('keyup',e=>{
  keys.delete(e.code);
  releasePass(e.code);
});
window.addEventListener('blur',()=>{keys.clear();clearPass();thumb.x=thumb.y=0;thumb.sprint=false});
const stick=$('stick'),knob=stick.firstElementChild;
let pointer=null;
function stickMove(e){
  const r=stick.getBoundingClientRect();
  const x=(e.clientX-r.left-r.width/2)/32,y=(e.clientY-r.top-r.height/2)/32,d=Math.max(1,Math.hypot(x,y));
  thumb.x=x/d;thumb.y=-y/d;knob.style.transform='translate('+thumb.x*26+'px,'+(-thumb.y*26)+'px)';
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
let accumulator=0;
function frame(time){
  const dt=Math.min(.05,(time-last)/1000);last=time;
  if(started&&!paused){
    if(replay){
      replay.time+=dt*19;
      if(replay.time>=replay.frames.length+12){replay=null;refresh()}
    }else{
      accumulator+=dt;
      updatePass(time);
      const controls=input();
      while(accumulator>=1/120){game.tick(1/120,controls);accumulator-=1/120}
      if(uiState!==game.state){
        if(game.state==='dead')cue(1710,.24,'sine',1160);
        refresh();
      }
      if(touchMode&&game.state==='live')touchButtons();
    }
    scorebug();
  }
  const renderFrame=replay?replay.frames[Math.min(replay.frames.length-1,Math.floor(replay.time))]:{
    ...game,active:game.player?.i,offenseHuman:game.offenseHuman
  };
  stadium.render(renderFrame,mode,dt,!started,Boolean(replay));
  const showTags=started&&!replay&&!paused&&game.offenseHuman&&game.canPass;
  receiverBar.hidden=!showTags||touchMode;
  receiverButtons.forEach((button,i)=>{
    button.hidden=receiverBar.hidden;
    button.classList.toggle('loading',passHold?.index===i);
  });
  tags.forEach((tag,i)=>{
    const pos=showTags?stadium.screen(game.off[7+i]):null;
    tag.hidden=!pos?.visible;
    tag.classList.toggle('loading',passHold?.index===i);
    if(pos?.visible){tag.style.left=pos.x+'%';tag.style.top=pos.y+'%'}
  });
  requestAnimationFrame(frame);
}
if(stadium)requestAnimationFrame(frame);
