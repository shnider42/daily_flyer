import { Game } from './core.mjs';
import { BreachRenderer } from './renderer.mjs';
import { BreachAudio } from './audio.mjs';

const $ = id => document.getElementById(id);
const SETTINGS_KEY = 'dfe.breach.settings.v1';
const SAVE_KEY = 'dfe.breach.run.v1';
const BEST_KEY = 'dfe.breach.best.v1';
const touchMedia = matchMedia('(pointer: coarse)');
let touch = touchMedia.matches;
let storageAvailable = true;
function readStorage(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { storageAvailable = false; return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { storageAvailable = false; return false; } }
function removeStorage(key) { try { localStorage.removeItem(key); } catch (_) { storageAvailable = false; } }
const prior = readStorage(SETTINGS_KEY) || {};
const choices = (x, valid, fallback) => valid.includes(x) ? x : fallback;
const settings = {
  controls: choices(prior.controls, ['auto','touch','keyboard'], 'auto'),
  guidance: choices(prior.guidance, ['simple','moderate','expert'], 'simple'),
  difficulty: choices(prior.difficulty, ['relaxed','standard','hard'], 'standard'),
  sound: typeof prior.sound === 'boolean' ? prior.sound : true,
  aimAssist: typeof prior.aimAssist === 'boolean' ? prior.aimAssist : touch,
  autoFire: !!prior.autoFire,
  reducedMotion: typeof prior.reducedMotion === 'boolean' ? prior.reducedMotion : matchMedia('(prefers-reduced-motion: reduce)').matches,
  sensitivity: Number.isFinite(prior.sensitivity) ? Math.min(2,Math.max(.35,prior.sensitivity)) : 1,
  tutorial: prior.tutorial !== false,
};
let config = {};
try { config = JSON.parse($('breach-config').textContent); } catch (_) { /* A direct development view can use the default mission. */ }
const seed = Number.isFinite(Number(config.seed)) ? Number(config.seed) : 1;
const audio = new BreachAudio(settings.sound);
const keys = new Set();
const input = {forward:0,strafe:0,turn:0,fire:false};
let game, renderer, mode = 'menu', ready = false;
let savedRecord = readStorage(SAVE_KEY);
let explored = new Set();
let mapVisible = false;
let mouseFire = false;
let firePulse = false;
let lookPointer = null;
let movePointer = null;
let firePointer = null;
let lookLastX = 0;
let fireLastX = 0;
let joyX = 0, joyY = 0;
let pendingTurn = 0;
let lastFrame = 0, lastHud = 0, lastMap = 0, lastSave = 0;
let toastTimer = 0, damageUntil = 0, hitUntil = 0;
let pathTimer = 0, pathHint = null, mapDirty = true;
let helpRevealed = 0;
let statusError = false;
let pointerLockedOnce = false;

function formatTime(value) {
  const seconds = Math.max(0,Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function setTouch(value) {
  touch = value;
  document.body.classList.toggle('touch',touch);
  $('device-hint').textContent = touch ? 'TOUCH TO PLAY · LANDSCAPE RECOMMENDED' : 'WASD MOVE · MOUSE AIM · E INTERACT';
  if(ready && !statusError) $('load-status').textContent = touch ? 'READY · TURN YOUR PHONE SIDEWAYS FOR A WIDER VIEW' : 'READY · CLICK TO ENTER';
}
function applyControlMode() {
  const wanted = settings.controls === 'touch' || (settings.controls === 'auto' && touchMedia.matches);
  if(wanted !== touch) clearInputs();
  setTouch(wanted);
}
applyControlMode();
function showToast(text, duration = 3300) {
  if(!text) return;
  $('toast').textContent = text;
  $('toast').hidden = false;
  toastTimer = performance.now() + duration;
}
function clearInputs() {
  keys.clear(); pendingTurn = 0; mouseFire = false; firePulse = false; joyX = 0; joyY = 0;
  lookPointer = movePointer = firePointer = null;
  input.forward = input.strafe = input.turn = 0; input.fire = false;
  $('joystick-knob').style.transform = '';
  $('fire-pad').classList.remove('pressed');
}
function releasePointer() { if(document.pointerLockElement) { try { document.exitPointerLock(); } catch (_) {} } }
function requestMouse() {
  if(touch || !ready || mode !== 'playing') return;
  const canvas = $('world');
  if(typeof canvas.requestPointerLock !== 'function') return;
  try { const promise = canvas.requestPointerLock(); if(promise && promise.catch) promise.catch(() => { showToast('Mouse capture unavailable. Hold and drag to aim, or use the arrow keys.'); }); } catch (_) { showToast('Hold and drag to aim, or use the arrow keys.'); }
}
function setMode(next) {
  mode = next; document.body.dataset.mode = next;
  $('menu').hidden = next !== 'menu';
  $('hud').hidden = !['playing','paused'].includes(next);
  $('pause-screen').hidden = next !== 'paused';
  $('end-screen').hidden = !['dead','won'].includes(next);
  audio.setPlaying(next === 'playing');
  if(next !== 'playing') { clearInputs(); releasePointer(); }
  $('checkpoint').hidden = !game?.state.checkpoint;
  if(next === 'menu') updateContinue();
}
function saveSettings() {
  writeStorage(SETTINGS_KEY,settings);
  document.body.classList.toggle('reduced-motion',settings.reducedMotion);
  if(game) { game.options.guidance = settings.guidance; game.options.aimAssist = settings.aimAssist; }
  if(renderer) renderer.options.reducedMotion = settings.reducedMotion;
  applyControlMode();
  audio.setEnabled(settings.sound);
}
function updateChoices() {
  document.querySelectorAll('[data-guidance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guidance === settings.guidance)));
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.difficulty === settings.difficulty)));
  $('guidance-description').textContent = {
    simple:'Learn as you play, with clear objectives and a route hint.',
    moderate:'Clear objectives with fewer prompts. Explore at your own pace.',
    expert:'Minimal guidance. Read the facility and find your own route.',
  }[settings.guidance];
  $('difficulty-description').textContent = {
    relaxed:'More breathing room. Enemies are slower and less dangerous.',
    standard:'A balanced first run. Keep moving and watch your ammunition.',
    hard:'More pressure, tougher enemies. Every supply matters.',
  }[settings.difficulty];
}
function updateSettingsFields() {
  $('setting-controls').value = settings.controls;
  $('setting-sound').checked = settings.sound;
  $('setting-aim').checked = settings.aimAssist;
  $('setting-auto').checked = settings.autoFire;
  $('setting-motion').checked = settings.reducedMotion;
  $('setting-sensitivity').value = settings.sensitivity;
  $('sensitivity-value').textContent = `${settings.sensitivity.toFixed(2).replace(/0$/,'')}×`;
  if($('setting-tutorial')) $('setting-tutorial').checked = settings.tutorial;
}
function updateContinue() {
  $('continue').hidden = !savedRecord;
  $('start').classList.toggle('subdued',!!savedRecord);
  $('start').classList.toggle('primary',!savedRecord);
  $('start').innerHTML = savedRecord ? 'NEW MISSION <span>↗</span>' : 'ENTER FACILITY <span>↗</span>';
  if(savedRecord?.game?.state?.time) $('continue').innerHTML = `CONTINUE RUN <span>${formatTime(savedRecord.game.state.time)}</span>`;
}
function saveRun() {
  if(!game || !['playing','paused'].includes(game.state.status) || game.state.player.health <= 0) return false;
  try {
    savedRecord = {version:1,game:game.serialize(),explored:[...explored],savedAt:Date.now()};
    const persisted = writeStorage(SAVE_KEY,savedRecord);
    $('pause-screen').querySelector('.overlay-copy').textContent = persisted ? 'Take a breath. Your position is saved on this device.' : 'Take a breath. Your position is held while this page stays open.';
    return persisted;
  } catch (_) { return false; }
}
function resetExploration() { explored = new Set(); mapDirty = true; pathHint = null; pathTimer = 0; }
function makeGame(options = {}) {
  const candidate = new Game({difficulty:settings.difficulty,guidance:settings.guidance,aimAssist:settings.aimAssist,seed,...options});
  renderer?.dispose();
  game = candidate;
  renderer = new BreachRenderer($('world'),game,{quality:'auto',reducedMotion:settings.reducedMotion});
  resetExploration(); helpRevealed = 0;
}
function launchNew() {
  if(!ready) return;
  try {
    makeGame(); savedRecord = null; removeStorage(SAVE_KEY);
    mapVisible = false; updateMapVisibility();
    audio.unlock(); game.start(); setMode('playing'); lastSave = 0; lastFrame = performance.now();
    saveRun(); updateHud(); requestMouse();
  } catch(error) { fail(error); }
}
function continueRun() {
  if(!ready || !savedRecord) return;
  try {
    const record = savedRecord;
    makeGame(record.game?.options || {});
    if(!game.restore(record.game)) {
      savedRecord = null; removeStorage(SAVE_KEY); updateContinue();
      $('load-status').textContent = 'That saved run could not be restored. Start a new mission.'; return;
    }
    game.options.guidance = settings.guidance; game.options.aimAssist = settings.aimAssist;
    if(Array.isArray(record.explored)) for(const value of record.explored) if(Number.isInteger(value) && value>=0 && value<game.level.width*game.level.height) explored.add(value);
    mapVisible = false; updateMapVisibility(); audio.unlock(); game.resume(); setMode('playing');
    lastFrame = performance.now(); updateHud(); requestMouse();
  } catch(error) { fail(error); }
}
function pauseGame() {
  if(mode !== 'playing') return;
  game.pause(); saveRun(); setMode('paused'); updateHud();
  $('resume').focus({preventScroll:true});
}
function resumeGame() {
  if(!ready || !game || game.state.status !== 'paused') return;
  closeDialogs(); audio.unlock(); game.resume(); setMode('playing'); lastFrame = performance.now(); requestMouse();
}
function retryCheckpoint() {
  if(!game || !ready) return;
  if(!game.restartCheckpoint()) return launchNew();
  mapVisible = false; updateMapVisibility(); audio.unlock(); setMode('playing');
  pathHint = null; pathTimer = 0; lastFrame = performance.now(); saveRun(); updateHud(); requestMouse();
}
function backToMenu() {
  if(mode === 'playing') game.pause();
  saveRun(); closeDialogs();
  try { makeGame(); } catch(error) { return fail(error); }
  setMode('menu'); $('start').focus({preventScroll:true});
}
function finish(won) {
  if(mode === 'dead' || mode === 'won') return;
  setMode(won ? 'won' : 'dead');
  $('end-kicker').textContent = won ? 'EXTRACTION CONFIRMED' : 'SIGNAL TERMINATED';
  $('end-title').innerHTML = won ? 'SURVIVED<span>_</span>' : 'LOST<span>_</span>';
  $('end-copy').textContent = won ? 'You made it out of Blacksite 07. The facility will keep its secrets. For now.' : 'The facility got the better of you. Keep moving, use cover, and collect supplies.';
  $('result-time').textContent = formatTime(game.state.time);
  $('result-kills').textContent = `${game.state.kills} / ${game.state.enemies.length}`;
  $('result-secrets').textContent = `${game.state.secretFound ? 1 : 0} / 1`;
  $('end-checkpoint').hidden = won || !game.state.checkpoint;
  $('end-restart').classList.toggle('subdued',!won && game.state.checkpoint);
  $('end-restart').classList.toggle('primary',won || !game.state.checkpoint);
  $('end-restart').innerHTML = won ? 'PLAY AGAIN <span>↗</span>' : 'RESTART MISSION <span>↗</span>';
  if(won) {
    const oldBest = readStorage(BEST_KEY);
    if(!oldBest || game.state.time < oldBest.time) writeStorage(BEST_KEY,{time:game.state.time,difficulty:game.options.difficulty});
    savedRecord = null; removeStorage(SAVE_KEY);
  }
}
function fail(error) {
  console.error(error); statusError = true; ready = false;
  try { game?.pause(); } catch (_) {}
  setMode('menu'); $('start').disabled = true; $('continue').disabled = true;
  $('load-status').classList.add('error');
  $('load-status').textContent = /webgl|context|gpu/i.test(String(error)) ? 'This browser could not start the 3D view. Try opening this link in Safari or Chrome, then reload.' : 'The game hit a loading problem. Reload to try again; saved progress stays on this device.';
  $('retry-load').hidden = false;
}
function openDialog(id) {
  if(mode === 'playing') pauseGame();
  releasePointer(); clearInputs(); updateSettingsFields();
  const dialog = $(id);
  if(typeof dialog.showModal === 'function') { if(!dialog.open) dialog.showModal(); }
  else { dialog.setAttribute('open',''); dialog.classList.add('fallback-dialog'); }
}
function closeDialogs() {
  for(const id of ['settings-dialog','controls-dialog']) {
    const dialog = $(id); if(dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  }
  clearInputs();
}
function updateMapVisibility() {
  $('map-panel').hidden = !mapVisible;
  $('map-toggle').setAttribute('aria-pressed',String(mapVisible));
  $('map-toggle').setAttribute('aria-label',mapVisible ? 'Hide map' : 'Show map');
  if(mapVisible) { revealMap(); drawMap(); }
}
function toggleMap() { if(mode !== 'playing') return; mapVisible = !mapVisible; updateMapVisibility(); }
function revealMap() {
  if(!game) return;
  const p = game.state.player, level = game.level;
  for(let z=Math.max(0,Math.floor(p.z)-5);z<Math.min(level.height,Math.floor(p.z)+6);z++) {
    for(let x=Math.max(0,Math.floor(p.x)-5);x<Math.min(level.width,Math.floor(p.x)+6);x++) {
      const dx=x+.5-p.x,dz=z+.5-p.z,d=Math.hypot(dx,dz);
      if(d>5.8) continue;
      const nearT = d > .6 ? (d-.6)/d : 0;
      if(game.hasLineOfSight(p.x,p.z,p.x+dx*nearT,p.z+dz*nearT)) explored.add(z*level.width+x);
    }
  }
  mapDirty = true;
}
function drawMap() {
  if(!game || !mapVisible) return;
  const canvas=$('minimap'),ctx=canvas.getContext('2d'),level=game.level;
  const scale=Math.min((canvas.width-20)/level.width,(canvas.height-20)/level.height);
  const ox=(canvas.width-level.width*scale)/2,oz=(canvas.height-level.height*scale)/2;
  ctx.fillStyle='#08110f';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const index of explored) {
    const x=index%level.width,z=Math.floor(index/level.width);
    ctx.fillStyle=level.grid[z]?.[x]==='#'?'#4d6254':'#20392d';ctx.fillRect(ox+x*scale,oz+z*scale,scale-.35,scale-.35);
  }
  for(const door of game.state.doors) {
    if(!explored.has(Math.floor(door.z)*level.width+Math.floor(door.x)))continue;
    ctx.fillStyle=door.open?'#8acac1':'#f2a744';ctx.fillRect(ox+(door.x-.35)*scale,oz+(door.z-.35)*scale,scale*.7,scale*.7);
  }
  if(settings.guidance==='simple' && pathHint?.path) {
    ctx.strokeStyle='#f2a74488';ctx.lineWidth=1;ctx.beginPath();let started=false;
    for(const cell of pathHint.path) {
      if(!explored.has(cell.z*level.width+cell.x)) { started=false; continue; }
      if(!started){ctx.moveTo(ox+(cell.x+.5)*scale,oz+(cell.z+.5)*scale);started=true;}
      else ctx.lineTo(ox+(cell.x+.5)*scale,oz+(cell.z+.5)*scale);
    }ctx.stroke();
  }
  const target=game.getObjective();
  if(Number.isFinite(target.x) && (settings.guidance==='simple' || explored.has(Math.floor(target.z)*level.width+Math.floor(target.x)))) {
    const tx=ox+target.x*scale,tz=oz+target.z*scale;ctx.fillStyle='#f2a744';ctx.beginPath();ctx.moveTo(tx,tz-4);ctx.lineTo(tx+4,tz);ctx.lineTo(tx,tz+4);ctx.lineTo(tx-4,tz);ctx.closePath();ctx.fill();
  }
  const p=game.state.player;ctx.save();ctx.translate(ox+p.x*scale,oz+p.z*scale);ctx.rotate(p.angle);ctx.fillStyle='#d7f7e8';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,4);ctx.lineTo(0,2);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();
  mapDirty=false;
}
function calculatePath() {
  const level=game.level,p=game.state.player,target=game.getObjective();
  if(!Number.isFinite(target.x)||!Number.isFinite(target.z))return null;
  const sx=Math.floor(p.x),sz=Math.floor(p.z),tx=Math.floor(target.x),tz=Math.floor(target.z);
  const start=sz*level.width+sx,end=tz*level.width+tx;
  const queue=[start],came=new Map([[start,null]]);let head=0;
  while(head<queue.length) {
    const index=queue[head++];if(index===end)break;
    const x=index%level.width,z=Math.floor(index/level.width);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,nz=z+dz,ni=nz*level.width+nx;
      if(nx<0||nz<0||nx>=level.width||nz>=level.height||level.grid[nz][nx]==='#'||came.has(ni))continue;
      const door=game.state.doors.find(d=>!d.open&&Math.floor(d.x)===nx&&Math.floor(d.z)===nz);
      if(door && ni!==end && ((door.requires==='power'&&!game.state.power)||(door.requires==='key'&&!p.key)||door.secret))continue;
      came.set(ni,index);queue.push(ni);
    }
  }
  if(!came.has(end))return {x:target.x,z:target.z,distance:Math.hypot(target.x-p.x,target.z-p.z),path:null};
  const path=[];let at=end;
  while(at!==null){path.push({x:at%level.width,z:Math.floor(at/level.width)});at=came.get(at);}
  path.reverse();const next=path[Math.min(2,path.length-1)];
  return {x:next.x+.5,z:next.z+.5,distance:path.length-1,path};
}
function normAngle(angle) { return Math.atan2(Math.sin(angle),Math.cos(angle)); }
function updateDirection() {
  if(settings.guidance!=='simple'||!pathHint){$('direction').textContent='';return;}
  const p=game.state.player,a=normAngle(Math.atan2(pathHint.x-p.x,-(pathHint.z-p.z))-p.angle);
  const label=Math.abs(a)>2.45?'↓ TURN AROUND':a>.48?'→ TURN RIGHT':a<-.48?'← TURN LEFT':'↑ AHEAD';
  $('direction').textContent=pathHint.distance<2?'NEARBY · LOOK FOR THE USE PROMPT':`${label} · ${Math.round(pathHint.distance)} M TO OBJECTIVE`;
}
function updateTutorial() {
  const state=game.state,t=state.tutorial||{};
  const show=settings.guidance==='simple'&&settings.tutorial&&mode==='playing';
  if(!show){$('tutorial').hidden=true;return;}
  let text='',index='FIELD TRAINING';
  if(!t.moved)text=touch?'Drag the left pad to move. Drag the right side of the screen to turn.':'Use W A S D to move. Move your mouse to look around. Arrow keys also turn.';
  else if(!t.interacted && !state.doors[0]?.open)text=touch?'Approach the arrival airlock. When USE lights up, tap it to open the door.':'Approach the arrival airlock. Press E when the door prompt appears.';
  else if(!t.fired)text=touch?'Hold FIRE and drag on the same pad to aim. Keep moving with your left thumb.':'Click or hold SPACE to fire. Move sideways with A and D to dodge.';
  else if(!state.power) {text='Find the generator console. Walk over health and ammunition to collect them. The route hint points the way.';index='MISSION BRIEF';}
  else if(state.player.hasShotgun&&!t.weaponSwitched)text=touch?'Scattergun acquired. Tap SWAP to change weapons. It is strongest up close.':'Scattergun acquired. Press 2 to equip it, or 1 to return to the pistol. It is strongest up close.';
  else if(!state.player.key){text='Power is restored and your checkpoint is saved. Open the powered airlocks to reach the research lab.';index='MISSION BRIEF';}
  else {text='You have the access key. Head through quarantine and use the extraction terminal.';index='MISSION BRIEF';}
  // Early controls stay visible until performed. Later mission reminders fade after a short time.
  if(index==='MISSION BRIEF') {
    const identity=`${state.power}-${state.player.key}`;
    if(updateTutorial.identity!==identity){updateTutorial.identity=identity;helpRevealed=performance.now();}
    if(performance.now()-helpRevealed>8500){$('tutorial').hidden=true;return;}
  }
  $('tutorial').hidden=false;$('tutorial-text').textContent=text;$('tutorial-index').textContent=index;
}
function updateHud() {
  if(!game)return;
  const state=game.state,p=state.player;
  $('zone').textContent=game.getZone().toUpperCase();$('clock').textContent=formatTime(state.time);
  $('health').textContent=Math.ceil(p.health);$('armor').textContent=Math.ceil(p.armor);
  $('health-fill').style.width=`${Math.max(0,p.health)}%`;$('health').closest('.health').classList.toggle('low',p.health<30);
  $('ammo').textContent=p.weapon==='shotgun'?p.ammo.shells:p.ammo.pistol;
  $('ammo-label').textContent=p.weapon==='shotgun'?'SCATTERGUN SHELLS':'9MM AMMUNITION';
  $('weapon-name').textContent=p.weapon==='shotgun'?'SCATTERGUN':'SERVICE PISTOL';
  $('power-token').classList.toggle('active',state.power);$('key-token').classList.toggle('active',p.key);
  $('power-token').setAttribute('aria-label',state.power?'Power restored':'Power offline');$('key-token').setAttribute('aria-label',p.key?'Access key collected':'Access key needed');
  const obj=game.getObjective();$('objective-title').textContent=obj.title;$('objective-detail').textContent=obj.detail;
  $('objective-detail').hidden=settings.guidance==='expert';
  $('objective').querySelector('.label').textContent=settings.guidance==='expert'?'MISSION':'CURRENT OBJECTIVE';
  const prompt=game.getPrompt();$('interaction').hidden=!prompt||mode!=='playing';$('interaction-text').textContent=prompt;
  $('touch-interact').disabled=!prompt;$('touch-weapon').disabled=!p.hasShotgun;
  $('checkpoint').hidden=!state.checkpoint;
  updateDirection();updateTutorial();
}
function processEvents(events) {
  if(!events.length)return;
  renderer.handleEvents(events);audio.events(events);
  let notice=null;
  for(const event of events) {
    if(['message','pickup','checkpoint','secret'].includes(event.type)&&event.text)notice=event.text;
    if(event.type==='hurt')damageUntil=performance.now()+(settings.reducedMotion?130:200);
    if(event.type==='hit')hitUntil=performance.now()+120;
    if(['door','power','pickup'].includes(event.type)) {pathTimer=0;mapDirty=true;}
    if(event.type==='checkpoint')saveRun();
    if(event.type==='win')finish(true);
    if(event.type==='death')finish(false);
  }
  if(notice&&mode==='playing')showToast(notice);
}
function shouldAutoFire() {
  if(!settings.autoFire)return false;
  const p=game.state.player;
  return game.state.enemies.some(e=>e.alive&&Math.hypot(e.x-p.x,e.z-p.z)<16&&Math.abs(normAngle(Math.atan2(e.x-p.x,-(e.z-p.z))-p.angle))<.085&&game.hasLineOfSight(p.x,p.z,e.x,e.z));
}
function frame(now) {
  if(statusError)return;
  const dt=Math.min(.05,Math.max(0,(now-(lastFrame||now))/1000));lastFrame=now;
  try {
    if(mode==='playing') {
      input.forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joyY;
      input.strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+joyX;
      input.forward=Math.max(-1,Math.min(1,input.forward));input.strafe=Math.max(-1,Math.min(1,input.strafe));
      input.turn=pendingTurn+((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*2.3*settings.sensitivity;
      pendingTurn=0;input.fire=firePulse||mouseFire||firePointer!==null||keys.has('Space')||shouldAutoFire();
      game.update(dt,input);firePulse=false;processEvents(game.drainEvents());
      if(game.state.status==='dead')finish(false);else if(game.state.status==='won')finish(true);
      if(now-lastMap>300){revealMap();lastMap=now;}
      if(now-pathTimer>650){pathHint=calculatePath();pathTimer=now;}
      if(now-lastSave>10000){saveRun();lastSave=now;}
    }
    if(now-lastHud>90){updateHud();lastHud=now;if(mapVisible&&mapDirty)drawMap();}
    if(now>toastTimer)$('toast').hidden=true;
    $('damage-flash').classList.toggle('active',now<damageUntil&&mode==='playing');
    $('hitmarker').classList.toggle('active',now<hitUntil&&mode==='playing');
    renderer.render(dt);
    requestAnimationFrame(frame);
  }catch(error){fail(error);}
}

// Menu, dialogs, and discrete commands.
$('start').addEventListener('click',launchNew);$('continue').addEventListener('click',continueRun);
$('retry-load').addEventListener('click',()=>location.reload());
$('brand-home').addEventListener('click',event=>{event.preventDefault();});
$('pause').addEventListener('click',pauseGame);$('resume').addEventListener('click',resumeGame);
$('checkpoint').addEventListener('click',retryCheckpoint);$('end-checkpoint').addEventListener('click',retryCheckpoint);
$('restart').addEventListener('click',launchNew);$('end-restart').addEventListener('click',launchNew);
$('back-menu').addEventListener('click',backToMenu);$('end-menu').addEventListener('click',backToMenu);
$('open-settings').addEventListener('click',()=>openDialog('settings-dialog'));
$('pause-settings').addEventListener('click',()=>openDialog('settings-dialog'));
$('open-controls').addEventListener('click',()=>openDialog('controls-dialog'));
for(const id of ['close-settings','done-settings','close-controls','done-controls'])$(id).addEventListener('click',closeDialogs);
for(const id of ['settings-dialog','controls-dialog']) {
  $(id).addEventListener('close',clearInputs);
  $(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialogs();}});
}
$('map-toggle').addEventListener('click',toggleMap);$('map-close').addEventListener('click',()=>{mapVisible=false;updateMapVisibility();});
$('dismiss-tutorial').addEventListener('click',()=>{settings.tutorial=false;saveSettings();$('tutorial').hidden=true;showToast('Tutorial hidden. You can turn it on again in Settings.');});
for(const button of document.querySelectorAll('[data-guidance]'))button.addEventListener('click',()=>{settings.guidance=button.dataset.guidance;updateChoices();saveSettings();});
for(const button of document.querySelectorAll('[data-difficulty]'))button.addEventListener('click',()=>{settings.difficulty=button.dataset.difficulty;updateChoices();saveSettings();});
for(const [id,property]of [['setting-sound','sound'],['setting-aim','aimAssist'],['setting-auto','autoFire'],['setting-motion','reducedMotion']])$(id).addEventListener('change',event=>{settings[property]=event.target.checked;saveSettings();});
$('setting-controls').addEventListener('change',event=>{settings.controls=event.target.value;saveSettings();updateSettingsFields();});
const controlMediaChanged = () => { if(settings.controls === 'auto') applyControlMode(); };
if(touchMedia.addEventListener) touchMedia.addEventListener('change',controlMediaChanged);
else if(touchMedia.addListener) touchMedia.addListener(controlMediaChanged);
$('setting-sensitivity').addEventListener('input',event=>{settings.sensitivity=Number(event.target.value);updateSettingsFields();saveSettings();});
// Give explicitly dismissed training a way back without resetting other preferences.
const trainingRow=document.createElement('label');trainingRow.className='setting-row';trainingRow.innerHTML='<span><b>Show tutorial</b><small>Step-by-step prompts when Simple guidance is selected</small></span><input id="setting-tutorial" type="checkbox">';
$('setting-motion').closest('.setting-row').after(trainingRow);
$('setting-tutorial').addEventListener('change',event=>{settings.tutorial=event.target.checked;helpRevealed=performance.now();saveSettings();});

window.addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement||document.querySelector('dialog[open]'))return;
  if(mode==='playing') {
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','KeyE','KeyP','Escape','Digit1','Digit2','KeyQ'].includes(event.code))event.preventDefault();
    if(event.code==='Escape'||event.code==='KeyP'){pauseGame();return;}
    if(!event.repeat) {
      if(event.code==='Space')firePulse=true;
      if(event.code==='KeyE')game.interact();
      if(event.code==='Tab')toggleMap();
      if(event.code==='KeyQ')game.switchWeapon();
      if(event.code==='Digit1'&&game.state.player.weapon!=='pistol')game.switchWeapon();
      if(event.code==='Digit2'&&game.state.player.weapon!=='shotgun')game.switchWeapon();
    }
    keys.add(event.code);
  }else if(mode==='paused'&&(event.code==='Escape'||event.code==='KeyP')){event.preventDefault();resumeGame();}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{if(mode==='playing')pauseGame();else clearInputs();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(mode==='playing')pauseGame();saveRun();clearInputs();}});
window.addEventListener('pagehide',()=>{if(mode==='playing')game.pause();saveRun();audio.setPlaying(false);clearInputs();});
window.addEventListener('pageshow',event=>{if(event.persisted&&game?.state.status==='paused')setMode('paused');});
window.addEventListener('resize',()=>{clearInputs();renderer?.resize();});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===$('world')){pointerLockedOnce=true;return;}
  if(pointerLockedOnce&&mode==='playing')pauseGame();
});
document.addEventListener('pointerlockerror',()=>{if(mode==='playing')showToast('Hold and drag to aim, or use the arrow keys.');});
document.addEventListener('mousemove',event=>{if(mode==='playing'&&document.pointerLockElement===$('world'))pendingTurn+=event.movementX*.0028*settings.sensitivity;});
$('world').addEventListener('contextmenu',event=>event.preventDefault());
$('world').addEventListener('pointerdown',event=>{
  if(mode!=='playing')return;
  if(event.pointerType==='touch') {
    if(!touch && settings.controls === 'auto')setTouch(true);
    if(lookPointer!==null)return;
    lookPointer=event.pointerId;lookLastX=event.clientX;
    try{$('world').setPointerCapture(event.pointerId);}catch(_){}
  }else if(event.button===0) {
    mouseFire=true;firePulse=true;lookPointer=event.pointerId;lookLastX=event.clientX;
    if(!document.pointerLockElement) {try{$('world').setPointerCapture(event.pointerId);}catch(_){}requestMouse();}
  }
  event.preventDefault();
});
$('world').addEventListener('pointermove',event=>{
  if(mode!=='playing'||event.pointerId!==lookPointer||document.pointerLockElement===$('world'))return;
  pendingTurn+=(event.clientX-lookLastX)*.005*settings.sensitivity;lookLastX=event.clientX;
});
function endLook(event){if(event.pointerId===lookPointer)lookPointer=null;if(event.pointerType!=='touch')mouseFire=false;}
$('world').addEventListener('pointerup',endLook);$('world').addEventListener('pointercancel',endLook);$('world').addEventListener('lostpointercapture',endLook);
window.addEventListener('mouseup',()=>{mouseFire=false;});
$('move-zone').addEventListener('pointerdown',event=>{
  if(mode!=='playing'||movePointer!==null)return;
  movePointer=event.pointerId;$('move-zone').setPointerCapture(event.pointerId);moveJoystick(event);event.preventDefault();
});
function moveJoystick(event){
  if(event.pointerId!==movePointer)return;
  const bounds=$('move-zone').getBoundingClientRect(),radius=bounds.width*.33;
  let dx=event.clientX-(bounds.left+bounds.width/2),dy=event.clientY-(bounds.top+bounds.height/2);const length=Math.hypot(dx,dy);
  if(length>radius){dx=dx/length*radius;dy=dy/length*radius;}
  joyX=dx/radius;joyY=dy/radius;
  if(Math.abs(joyX)<.1)joyX=0;if(Math.abs(joyY)<.1)joyY=0;
  $('joystick-knob').style.transform=`translate(${dx}px,${dy}px)`;
}
$('move-zone').addEventListener('pointermove',moveJoystick);
function endMove(event){if(event.pointerId!==movePointer)return;movePointer=null;joyX=joyY=0;$('joystick-knob').style.transform='';}
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('move-zone').addEventListener(type,endMove);
$('fire-pad').addEventListener('pointerdown',event=>{
  if(mode!=='playing'||firePointer!==null)return;firePointer=event.pointerId;firePulse=true;fireLastX=event.clientX;
  $('fire-pad').setPointerCapture(event.pointerId);$('fire-pad').classList.add('pressed');event.preventDefault();
});
$('fire-pad').addEventListener('pointermove',event=>{if(event.pointerId===firePointer&&mode==='playing'){pendingTurn+=(event.clientX-fireLastX)*.005*settings.sensitivity;fireLastX=event.clientX;}});
function endFire(event){if(event.pointerId!==firePointer)return;firePointer=null;$('fire-pad').classList.remove('pressed');}
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('fire-pad').addEventListener(type,endFire);
$('touch-interact').addEventListener('click',()=>{if(mode==='playing')game.interact();});
$('touch-weapon').addEventListener('click',()=>{if(mode==='playing')game.switchWeapon();});

try {
  makeGame();
  if(savedRecord?.version!==1 || !savedRecord.game) savedRecord=null;
  if(savedRecord) { const validator=new Game();if(!validator.restore(savedRecord.game)){savedRecord=null;removeStorage(SAVE_KEY);} }
  updateChoices();updateSettingsFields();updateContinue();
  document.body.classList.toggle('reduced-motion',settings.reducedMotion);
  ready=true;$('start').disabled=false;$('continue').disabled=false;
  $('load-status').textContent=touch?'READY · TURN YOUR PHONE SIDEWAYS FOR A WIDER VIEW':'READY · CLICK TO ENTER';
  setMode('menu');renderer.resize();requestAnimationFrame(frame);
}catch(error){fail(error);}
