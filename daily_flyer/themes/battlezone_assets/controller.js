(function () {
  'use strict';
  const root=document.getElementById('battlezone');
  if(!root)return;
  const $=id=>document.getElementById('bz-'+id);
  const canvas=$('screen'),game=$('game');
  if(!canvas.getContext('2d')){$('overlay-title').textContent='Canvas unavailable';$('overlay-copy').textContent='Try a browser with Canvas support.';$('start').disabled=true;return;}
  const view=new VectorView(canvas,$('radar'));
  let dailySeed=Number(root.dataset.seed)>>>0,date=root.dataset.date;
  const fixedDate=root.dataset.datePolicy!=='live';
  function refreshDaily(){
    if(fixedDate)return;
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=name=>parts.find(p=>p.type===name).value;
    date=`${part('year')}-${part('month')}-${part('day')}`;
    dailySeed=Number(date.replaceAll('-',''))>>>0;
  }
  const elapsedLabel=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode='patrol',difficulty='standard',state=VectorPatrol.create(1980),sound=false,glow=!reduced;
  let audio=null,last=0,accumulator=0,hudClock=0,previousPhase='ready',best=0,precision=false;
  const held=new Set(),pointers=new Map();
  const bindings={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'fire',ShiftLeft:'precision',ShiftRight:'precision'};
  const store={get(key,fallback){try{return localStorage.getItem('dfe.battlezone.v1.'+key)??fallback;}catch(_){return fallback;}},set(key,value){try{localStorage.setItem('dfe.battlezone.v1.'+key,String(value));}catch(_){/* Storage is optional, including in private browsing. */}}};
  const scoreKey=()=>`best.v3.${mode}.${difficulty}`;
  function loadBest(){
    try{const v=JSON.parse(store.get(scoreKey(),'null'));best=v&&Number.isFinite(v.score)&&(mode!=='daily'||v.seed===dailySeed)?Math.max(0,v.score):0;}catch(_){best=0;}
  }
  function saveBest(){if(state.score>best){best=state.score;store.set(scoreKey(),JSON.stringify({score:best,seed:state.seed}));}}
  function clearInput(){held.clear();pointers.clear();root.querySelectorAll('[data-input]').forEach(b=>b.classList.remove('pressed'));}
  function tone(type){
    if(!sound||!audio)return;
    if(audio.state==='suspended')return;
    const settings={fire:[125,45,.09,'sawtooth'],destroy:[70,22,.28,'sawtooth'],hit:[220,80,.1,'square'],damage:[65,35,.23,'square'],'enemy-fire':[170,80,.08,'triangle'],end:[200,50,.45,'triangle'],bonus:[320,700,.25,'sine'],repair:[420,840,.3,'sine']};
    const [start,end,duration,wave]=settings[type]||settings.hit;
    const oscillator=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
    oscillator.type=wave;oscillator.frequency.setValueAtTime(start,t);oscillator.frequency.exponentialRampToValueAtTime(end,t+duration);
    gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(t);oscillator.stop(t+duration);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  function enableAudio(){
    if(!sound)return;
    try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio();}if(audio)audio.resume().catch(()=>{});}catch(_){sound=false;}
  }
  function updateOptions(){
    const active=state.phase==='playing'||state.phase==='paused';
    root.querySelectorAll('[data-mode]').forEach(b=>{b.disabled=active;b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
    $('difficulty').disabled=active;
    $('pause').disabled=!active;$('pause').textContent=state.phase==='paused'?'▶ RESUME':'Ⅱ PAUSE';
    $('mission-title').textContent=mode==='daily'?'Five waves. One daily sector.':'One tank. An open horizon.';
    $('mission-copy').textContent=mode==='daily'?'Clear five waves with three hull points. The sector repeats for this date. Hunt bonus saucers and recover repair crates along the way.':'Scouts close fast. Flankers circle from wave two; heavy armor arrives in wave three. Grab repair drops and take a shot at the golden bonus saucer.';
    $('seed-note').textContent=mode==='daily'?`${date} · Sector ${dailySeed} · ${fixedDate?'Fixed mission.':'New mission at midnight New York time.'} Best saved in this browser for each crew level.`:'Best scores stay in this browser, separately for each crew level.';
    $('sound').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));
    $('effects').textContent=glow?'GLOW ON':'GLOW OFF';$('effects').setAttribute('aria-pressed',String(glow));root.classList.toggle('no-glow',!glow);view.glow=glow;
    $('precision').textContent=precision?'AIM: FINE':'AIM: NORMAL';$('precision').setAttribute('aria-pressed',String(precision));
  }
  function showOverlay(){
    const phase=state.phase;
    $('overlay').hidden=phase==='playing';
    $('hangar').hidden=phase!=='paused';
    if(phase==='playing')return;
    const won=phase==='won',lost=phase==='lost',paused=phase==='paused';
    $('overlay-kicker').textContent=paused?'SIMULATION PAUSED':won?'MISSION COMPLETE':lost?'SIGNAL LOST':'ALL SYSTEMS READY';
    $('overlay-title').textContent=paused?'Holding position.':won?'Sector secured.':lost?'Patrol ended.':'Hold the line.';
    $('overlay-copy').textContent=(won||lost)?`${state.score.toLocaleString()} points · ${state.wavesCleared}${mode==='daily'?'/5':''} waves cleared · ${state.bonusKills} bonus saucers`:paused?'Your tank is safe. Resume when you are ready.':mode==='daily'?'Five waves. Three hull points. Secure today’s sector.':'Find the contact. Line up your sights. Fire, move, survive.';
    $('results').hidden=!(won||lost);
    $('result-kills').textContent=state.kills;
    $('result-accuracy').textContent=`${state.shots?Math.round(state.hits/state.shots*100):0}%`;
    $('result-time').textContent=elapsedLabel(state.time);
    $('result-hull').textContent=`${state.player.hp}/3`;
    $('start').replaceChildren(document.createTextNode(paused?'RESUME PATROL':won||lost?'PLAY AGAIN':mode==='daily'?'START MISSION':'START PATROL'));
    const arrow=document.createElement('span');arrow.textContent='↗';$('start').append(arrow);
    $('overlay-hint').textContent=won||lost?'CHANGE MISSION OR CREW LEVEL BELOW':'W A S D / ARROWS TO DRIVE · SPACE TO FIRE';
  }
  function hud(){
    $('score').textContent=String(state.score).padStart(6,'0');$('best').textContent=String(best).padStart(6,'0');
    $('hull').textContent=Array.from({length:3},(_,i)=>i<state.player.hp?'▰':'▱').join(' ');
    $('wave').textContent=String(state.wave).padStart(2,'0')+(mode==='daily'?'/5':'');
    $('contacts').textContent=`${state.enemies.length} CONTACT${state.enemies.length===1?'':'S'}`;
    $('clock').textContent=elapsedLabel(state.time);
    $('objective').textContent=state.phase==='won'?'ALL FIVE WAVES CLEARED':state.nextWave>0?`NEXT WAVE IN ${Math.ceil(state.nextWave)}`:`${String(state.wave).padStart(2,'0')} / ${VectorPatrol.waveName(state.wave).toUpperCase()}`;
    $('progress').hidden=mode!=='daily';
    [...$('progress').children].forEach((el,i)=>{el.dataset.complete=String(i<state.wavesCleared);el.setAttribute('aria-current',i===state.wave-1?'step':'false');el.title=VectorPatrol.waveName(i+1);});
    $('bearing').textContent='HDG '+String(Math.round((state.player.angle*180/Math.PI+360)%360)%360).padStart(3,'0')+'°';
    const closest=state.enemies.reduce((best,e)=>Math.min(best,VectorPatrol.distance(state.player,e)),Infinity);
    $('range').textContent=Number.isFinite(closest)?`CONTACT ${Math.round(closest)} M`:'SECTOR CLEAR';
    const incoming=VectorPatrol.firingThreat(state);
    $('field-status').textContent=state.phase==='playing'?(incoming?`ENEMY FIRING · ${incoming}`:Math.hypot(state.player.x,state.player.z)>183?'SECTOR BOUNDARY':state.player.aiming?'PRECISION AIM':'PATROL ACTIVE'):state.phase==='paused'?'PAUSED':'SYSTEM READY';
    $('field-status').style.color=incoming?'#ff9478':'';
    const msg=state.phase==='ready'?'AWAITING COMMAND':state.phase==='paused'?'HOLDING POSITION':state.phase==='won'?'MISSION COMPLETE':state.phase==='lost'?'PATROL ENDED':state.messageTime>0?state.message:'SCAN · AIM · FIRE · MOVE';
    if($('message').textContent!==msg)$('message').textContent=msg;
    $('weapon').textContent=state.player.cooldown>.02?`RELOAD ${state.player.cooldown.toFixed(1)}s`:'CANNON READY';
  }
  function start(){
    enableAudio();clearInput();
    if(state.phase==='paused'){state.phase='playing';}
    else{refreshDaily();const seed=mode==='daily'?dailySeed:Math.floor(Math.random()*4294967296);state=VectorPatrol.create(seed,mode,difficulty);state.phase='playing';loadBest();}
    accumulator=0;last=performance.now();previousPhase=state.phase;
    showOverlay();updateOptions();hud();canvas.focus({preventScroll:true});
  }
  function pause(){
    if(state.phase!=='playing'&&state.phase!=='paused')return;
    if(state.phase==='paused'){start();return;}
    state.phase='paused';clearInput();accumulator=0;showOverlay();updateOptions();hud();$('start').focus({preventScroll:true});
  }
  $('hangar').addEventListener('click',()=>{clearInput();saveBest();refreshDaily();state=VectorPatrol.create(mode==='daily'?dailySeed:1980,mode,difficulty);loadBest();showOverlay();updateOptions();hud();view.draw(state);});
  $('start').addEventListener('click',start);$('pause').addEventListener('click',pause);
  $('sound').addEventListener('click',()=>{sound=!sound;enableAudio();store.set('sound',sound?'1':'0');updateOptions();});
  $('effects').addEventListener('click',()=>{glow=!glow;store.set('glow',glow?'1':'0');updateOptions();view.draw(state);});
  $('precision').addEventListener('click',()=>{precision=!precision;updateOptions();if(state.phase==='playing')canvas.focus({preventScroll:true});});
  root.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    if(state.phase==='playing'||state.phase==='paused')return;
    refreshDaily();mode=b.dataset.mode;state=VectorPatrol.create(mode==='daily'?dailySeed:1980,mode,difficulty);loadBest();updateOptions();showOverlay();hud();view.draw(state);
  }));
  $('difficulty').addEventListener('change',()=>{
    difficulty=$('difficulty').value;state=VectorPatrol.create(mode==='daily'?dailySeed:1980,mode,difficulty);loadBest();updateOptions();showOverlay();hud();view.draw(state);
  });
  if(!game.requestFullscreen)$('fullscreen').hidden=true;
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await game.requestFullscreen();}
    catch(_){$('message').textContent='EXPAND UNAVAILABLE IN THIS BROWSER';}
  });
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'⛶ EXIT':'⛶ EXPAND';view.resize();view.draw(state);});
  function acceptsKeys(event){return root.contains(document.activeElement)&&!['SELECT','INPUT','TEXTAREA'].includes(event.target.tagName);}
  document.addEventListener('keydown',event=>{
    if(!acceptsKeys(event))return;
    if((event.code==='KeyP'||event.code==='Escape')&&!event.repeat){if(state.phase==='playing'||state.phase==='paused'){event.preventDefault();pause();}return;}
    if(state.phase!=='playing'||!bindings[event.code])return;
    // Space still activates a focused button; gameplay keys belong to the canvas.
    if(document.activeElement!==canvas)return;
    event.preventDefault();held.add(event.code);
  });
  document.addEventListener('keyup',event=>{if(bindings[event.code]){held.delete(event.code);if(document.activeElement===canvas)event.preventDefault();}});
  canvas.addEventListener('pointerdown',()=>canvas.focus({preventScroll:true}));
  canvas.addEventListener('blur',()=>held.clear());
  root.querySelectorAll('[data-input]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{
      if(state.phase!=='playing')return;
      event.preventDefault();button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,button.dataset.input);button.classList.add('pressed');canvas.focus({preventScroll:true});enableAudio();
    });
    const release=event=>{pointers.delete(event.pointerId);if(![...pointers.values()].includes(button.dataset.input))button.classList.remove('pressed');};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',event=>event.preventDefault());
  });
  window.addEventListener('blur',()=>{clearInput();if(state.phase==='playing')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(state.phase==='playing')pause();saveBest();}});
  window.addEventListener('pagehide',saveBest);
  window.addEventListener('resize',()=>{view.resize();view.draw(state);});
  if(window.ResizeObserver)new ResizeObserver(()=>{view.resize();view.draw(state);}).observe($('viewport'));
  function frame(now){
    const elapsed=last?Math.max(0,Math.min((now-last)/1000,.1)):0;last=now;
    if(state.phase==='playing'){
      accumulator+=elapsed;const input={precision};held.forEach(code=>{input[bindings[code]]=true;});pointers.forEach(action=>{input[action]=true;});
      while(accumulator>=1/60){VectorPatrol.step(state,input,1/60);accumulator-=1/60;}
      state.events.splice(0).forEach(tone);saveBest();hudClock+=elapsed;
      if(hudClock>=.08){hud();hudClock=0;}
      view.draw(state);
    }
    if(state.phase!==previousPhase){previousPhase=state.phase;clearInput();saveBest();showOverlay();updateOptions();hud();if(state.phase==='won'||state.phase==='lost')$('start').focus({preventScroll:true});}
    requestAnimationFrame(frame);
  }
  sound=store.get('sound','0')==='1';glow=!reduced&&store.get('glow','1')==='1';
  refreshDaily();loadBest();updateOptions();showOverlay();view.resize();view.draw(state);hud();requestAnimationFrame(frame);
})();
