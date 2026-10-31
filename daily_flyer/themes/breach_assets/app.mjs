import { Game, MISSIONS, WEAPONS, ownedWeapons } from './core.mjs';
import { BreachRenderer } from './renderer.mjs';
import { BreachAudio } from './audio.mjs';
import { CoopClient } from './coop-client.mjs';
import { GUIDANCE_DESCRIPTIONS, interactionForGuidance, objectiveForGuidance, briefingForGuidance, noticeForGuidance, markerLabelForGuidance, markerCueForGuidance, visibleEquipment, hostileToPlayer, automaticFireAllowed } from './guidance.mjs';
import { resolveTouchPreset, joystickVector, resolveFireGesture, TouchFireGestures } from './touch-controls.mjs';

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
const requestedMission = new URL(location.href).searchParams.get('mission');
const missionIds = MISSIONS.map(mission=>mission.id);
const coopMissionIds=['crosslink-11','underworks-13','glasshouse-17','hollow-19'].filter(id=>missionIds.includes(id));
const weaponHotkeys={Digit1:'pistol',Digit2:'shotgun',Digit3:'arc',Digit4:'ricochet',Digit5:'grenade'};
const settings = {
  coopMission: choices(prior.coopMission,coopMissionIds,coopMissionIds[0]),
  callSign: typeof prior.callSign==='string'?prior.callSign.slice(0,20):'Operator',
  mission: choices(requestedMission, missionIds, choices(prior.mission,missionIds,MISSIONS[0].id)),
  fov: [80,90].includes(prior.fov) ? prior.fov : null,
  quality: choices(prior.quality, ['auto','low','high'], 'auto'),
  controls: choices(prior.controls, ['auto','touch','keyboard'], 'auto'),
  touchPreset: resolveTouchPreset(prior.touchPreset, {coarse:touch,width:innerWidth,height:innerHeight}),
  fireGesture: resolveFireGesture(prior.fireGesture),
  guidance: choices(prior.guidance, ['simple','moderate','expert'], 'simple'),
  difficulty: choices(prior.difficulty, ['relaxed','standard','hard'], 'standard'),
  sound: typeof prior.sound === 'boolean' ? prior.sound : true,
  music: typeof prior.music === 'boolean' ? prior.music : true,
  musicVolume: Number.isFinite(prior.musicVolume) ? Math.min(1,Math.max(0,prior.musicVolume)) : .45,
  aimAssist: typeof prior.aimAssist === 'boolean' ? prior.aimAssist : touch,
  autoFire: !!prior.autoFire,
  reducedMotion: typeof prior.reducedMotion === 'boolean' ? prior.reducedMotion : matchMedia('(prefers-reduced-motion: reduce)').matches,
  sensitivity: Number.isFinite(prior.sensitivity) ? Math.min(2,Math.max(.35,prior.sensitivity)) : 1,
  tutorial: prior.tutorial !== false,
};
let config = {};
try { config = JSON.parse($('breach-config').textContent); } catch (_) { /* A direct development view can use the default mission. */ }
const coopConfigured=typeof config.coopServer==='string'&&!!config.coopServer.trim();
let requestedRoom=(new URL(location.href).searchParams.get('room')||'').trim().toUpperCase().slice(0,8);
let coop=null,coopConnection='idle';
const seed = Number.isFinite(Number(config.seed)) ? Number(config.seed) : 1;
const audio = new BreachAudio(settings.sound,{musicEnabled:settings.music,musicVolume:settings.musicVolume});
const keys = new Set();
const input = {forward:0,strafe:0,turn:0,fire:false};
const fireGestures = new TouchFireGestures({mode:settings.fireGesture});
let game, renderer, mode = 'menu', ready = false;
let savedRecord = readStorage(SAVE_KEY);
let explored = new Set();
let mapVisible = false;
let mapView='local',mapZoom=1,mapCenter=null,mapFollow=true,mapPan=null,mapScale=1,mapHits=[];
let mapSelected=null,mapIndexSignature='',mapFloorTotal=0,mapKnownMarkers=[],mapKnownSectors=[];
let mouseFire = false;
let firePulse = false;
let firePadPulse = false;
let lookPointer = null;
let movePointer = null;
let firePointer = null;
let lookLastX = 0;
let joyX = 0, joyY = 0;
let pendingTurn = 0;
let lastFrame = 0, lastHud = 0, lastMap = 0, lastSave = 0;
let toastTimer = 0, damageUntil = 0, hitUntil = 0;
let pathTimer = 0, pathHint = null, mapDirty = true;
let helpRevealed = 0;
let statusError = false;
let pointerLockedOnce = false;
let fullscreenTransitionUntil = 0;
let lastWeaponWheel = 0;
let touchLookHintUntil = 0, touchLookHelpShown = false;
const encounterNotices = new Set();

function formatTime(value) {
  const seconds = Math.max(0,Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function setTouch(value) {
  touch = value;
  document.body.classList.toggle('touch',touch);
  document.body.dataset.touchPreset=settings.touchPreset;
  document.body.dataset.fireGesture=settings.fireGesture;
  $('fire-caption').textContent=settings.fireGesture==='safe'?'FIRE':'FIRE / AIM';
  $('fire-pad').setAttribute('aria-label',settings.fireGesture==='safe'?'Fire: tap once, or hold still briefly for continuous fire. Drag immediately to look without firing.':'Hold to fire and drag to aim');
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
  coop?.clearInput();
  keys.clear(); pendingTurn = 0; mouseFire = false; firePulse = false; firePadPulse = false; joyX = 0; joyY = 0;
  lookPointer = movePointer = firePointer = null;
  fireGestures.cancel();
  input.forward = input.strafe = input.turn = 0; input.fire = false;
  $('joystick-knob').style.transform = '';
  $('fire-pad').classList.remove('pressed','pending','aim-only');
}
function releasePointer() { if(document.pointerLockElement) { try { document.exitPointerLock(); } catch (_) {} } }
function requestMouse() {
  if(touch || !ready || mode !== 'playing') return;
  const canvas = $('world');
  if(typeof canvas.requestPointerLock !== 'function') return;
  try { const promise = canvas.requestPointerLock(); if(promise && promise.catch) promise.catch(() => { showToast('Mouse capture unavailable. Hold and drag to aim, or use the arrow keys.'); }); } catch (_) { showToast('Hold and drag to aim, or use the arrow keys.'); }
}
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function fullscreenAvailable() {
  const root=document.documentElement;
  return (typeof root.requestFullscreen==='function'&&document.fullscreenEnabled!==false)
    || (typeof root.webkitRequestFullscreen==='function'&&document.webkitFullscreenEnabled!==false);
}
function updateFullscreen() {
  const supported=fullscreenAvailable(),active=!!fullscreenElement();
  $('fullscreen').hidden=!supported;$('settings-fullscreen').hidden=!supported;
  $('fullscreen').setAttribute('aria-pressed',String(active));
  $('fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
  $('fullscreen').innerHTML=`${active?'EXIT FULLSCREEN':'FULLSCREEN'} <span class="keycap">F</span>`;
  $('settings-fullscreen').innerHTML=`${active?'EXIT FULLSCREEN':'ENTER FULLSCREEN'} <span>↗</span>`;
}
async function toggleFullscreen() {
  if(!fullscreenAvailable())return;
  fullscreenTransitionUntil=performance.now()+1500;clearInputs();
  $('fullscreen-status').hidden=true;
  try {
    if(fullscreenElement()) {
      const exit=document.exitFullscreen||document.webkitExitFullscreen;
      if(exit)await exit.call(document);
    }else {
      const enter=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
      await enter.call(document.documentElement);
    }
  }catch(_) {
    const message='Fullscreen is unavailable in this view. You can keep playing in the window.';
    $('fullscreen-status').textContent=message;$('fullscreen-status').hidden=false;
    if(mode==='playing')showToast(message);else if(mode==='menu')$('load-status').textContent=message;
  }finally {
    fullscreenTransitionUntil=performance.now()+350;updateFullscreen();renderer?.resize();
    if(mode==='playing'&&!document.hidden)requestMouse();
  }
}
function setMode(next) {
  if(next==='playing'&&!touchLookHelpShown){touchLookHintUntil=performance.now()+7000;touchLookHelpShown=true;}
  mode = next; document.body.dataset.mode = next;
  if(mapVisible&&!['playing','paused'].includes(next)){mapVisible=false;updateMapVisibility();}
  $('menu').hidden = next !== 'menu';
  $('room-screen').hidden = next !== 'room';
  $('hud').hidden = !['playing','paused'].includes(next);
  $('pause-screen').hidden = next !== 'paused';
  $('end-screen').hidden = !['dead','won'].includes(next);
  audio.setPlaying(next === 'playing');
  if(next !== 'playing') { clearInputs(); releasePointer(); }
  updatePauseRoom();updateTeamStatus();
  if(next === 'menu') updateContinue();
  if(next === 'paused') updateFieldJournal();
}
function updateFieldJournal() {
  const journal=$('field-journal');
  if(!journal)return;
  const records=(game?.state.interactables||[]).filter(item=>item.type==='record');
  journal.hidden=!records.length;
  const found=records.filter(item=>item.used);
  $('journal-summary').textContent=`FIELD RECORDS / ${found.length} OF ${records.length}`;
  $('journal-entries').replaceChildren(...found.map(record=>{
    const article=document.createElement('article'),title=document.createElement('h3'),text=document.createElement('p');
    title.textContent=record.label;text.textContent=record.text;article.append(title,text);return article;
  }));
  if(!found.length){const p=document.createElement('p');p.textContent='No records recovered. Inspect the tape terminals in the facility.';$('journal-entries').append(p);}
}
function saveSettings() {
  clearInputs();
  fireGestures.setMode(settings.fireGesture);
  writeStorage(SETTINGS_KEY,settings);
  document.body.classList.toggle('reduced-motion',settings.reducedMotion);
  document.body.dataset.guidance=settings.guidance;
  if(game) { game.options.guidance = settings.guidance; game.options.aimAssist = settings.aimAssist; }
  if(renderer) { renderer.options.reducedMotion = settings.reducedMotion; renderer.options.fov = settings.fov; renderer.options.quality = settings.quality; renderer.resize(); }
  applyControlMode();
  if(coop)coop.aimAssist=settings.aimAssist;
  audio.setEnabled(settings.sound);
  audio.setMusic(settings.music,settings.musicVolume);
}
function updateChoices() {
  document.querySelectorAll('[data-guidance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guidance === settings.guidance)));
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.difficulty === settings.difficulty)));
  $('guidance-description').textContent=GUIDANCE_DESCRIPTIONS[settings.guidance];
  document.body.dataset.guidance=settings.guidance;
  $('difficulty-description').textContent = {
    relaxed:'More breathing room. Enemies are slower and less dangerous.',
    standard:'A balanced first run. Keep moving and watch your ammunition.',
    hard:'More pressure, tougher enemies. Every supply matters.',
  }[settings.difficulty];
}
function changeGuidance(value) {
  settings.guidance=choices(value,['simple','moderate','expert'],'simple');
  $('toast').hidden=true;toastTimer=0;pathHint=null;pathTimer=0;mapDirty=true;mapIndexSignature='';
  updateTutorial.identity=null;helpRevealed=performance.now();
  encounterNotices.clear();
  updateChoices();saveSettings();updateSettingsFields();updateMissionMenu();updateRoomBriefing();
  $('minimap').setAttribute('aria-label',settings.guidance==='simple'?'Map showing explored facility, your position, and the current objective':'Map showing explored facility and your position');
  if(game){updateHud();if(mapVisible){if(settings.guidance==='simple')pathHint=calculatePath();drawMap();}}
}
function updateSettingsFields() {
  $('setting-controls').value = settings.controls;
  $('setting-touch-preset').value = settings.touchPreset;
  $('setting-fire-gesture').value = settings.fireGesture;
  $('setting-guidance').value = settings.guidance;
  $('setting-fov').value = settings.fov === null ? 'auto' : String(settings.fov);
  $('setting-quality').value = settings.quality;
  $('setting-sound').checked = settings.sound;
  $('setting-music').checked = settings.music;
  $('setting-music-volume').value = Math.round(settings.musicVolume*100);
  $('music-volume-value').textContent = `${Math.round(settings.musicVolume*100)}%`;
  $('setting-music-volume').disabled = !settings.music || !settings.sound;
  $('setting-aim').checked = settings.aimAssist;
  $('setting-auto').checked = settings.autoFire;
  $('setting-motion').checked = settings.reducedMotion;
  $('setting-sensitivity').value = settings.sensitivity;
  $('sensitivity-value').textContent = `${settings.sensitivity.toFixed(2).replace(/0$/,'')}×`;
  if($('setting-tutorial')) $('setting-tutorial').checked = settings.tutorial;
}
function missionForId(id) { return MISSIONS.find(mission=>mission.id===id)||MISSIONS[0]; }
function savedMission(record=savedRecord) {
  return MISSIONS.find(mission=>mission.levelId===record?.game?.levelId)
    || MISSIONS.find(mission=>mission.id===record?.game?.options?.mission) || MISSIONS[0];
}
function currentMission() { return missionForId(game?.level?.missionId); }
function updateMissionMenu() {
  const selected=missionForId(settings.mission);
  $('mission-count').textContent=`${MISSIONS.length} AUTHORED MISSIONS`;
  $('mission-briefing').closest('.mission-dossier').classList.toggle('exploration-dossier',['underworks-13','hollow-19'].includes(selected.id));
  $('mission-mode').textContent=coopMissionIds.includes(selected.id)?'SOLO / PRIVATE CO-OP':'SINGLE PLAYER';
  $('mission-number').textContent=`MISSION ${selected.number}`;
  $('mission-title').textContent=selected.name.toUpperCase();
  const briefing=briefingForGuidance(selected,settings.guidance);
  $('mission-subtitle').textContent=briefing.subtitle;
  $('mission-briefing').textContent=briefing.text;
  $('mission-steps').hidden=!briefing.steps.length;
  $('mission-steps').replaceChildren(...briefing.steps.map((step,index)=>{
    const li=document.createElement('li'),number=document.createElement('span');
    number.textContent=String(index+1).padStart(2,'0');li.append(number,document.createTextNode(step));return li;
  }));
  $('mission-picker').replaceChildren(...MISSIONS.map(mission=>{
    const button=document.createElement('button');button.type='button';button.dataset.mission=mission.id;
    button.setAttribute('aria-pressed',String(mission.id===settings.mission));
    const number=document.createElement('span');number.className='mission-choice-number';number.textContent=`${mission.number} /`;
    const title=document.createElement('strong');title.textContent=mission.name.replace('Blacksite07','Blacksite 07').replace(/^The /,'');
    const subtitle=document.createElement('small');subtitle.textContent=briefingForGuidance(mission,settings.guidance).subtitle;
    button.append(number,title,subtitle);return button;
  }));
  updateContinue();
}
function selectMission(id) {
  if(!missionIds.includes(id)||mode!=='menu'||id===settings.mission)return;
  settings.mission=id;saveSettings();updateMissionMenu();
  const url=new URL(location.href);url.searchParams.set('mission',id);
  try{history.replaceState(null,'',url);}catch(_){}
  // Browsing briefings never replaces a saved run.
  if(ready){try{makeGame();}catch(error){fail(error);}}
}
function updateContinue() {
  const selected=missionForId(settings.mission);
  $('continue').hidden = !savedRecord;
  $('start').classList.toggle('subdued',!!savedRecord);
  $('start').classList.toggle('primary',!savedRecord);
  $('start').replaceChildren(document.createTextNode(`START ${selected.name.toUpperCase()} `));
  const arrow=document.createElement('span');arrow.textContent='↗';$('start').append(arrow);
  if(savedRecord) {
    $('continue').replaceChildren(document.createTextNode(`CONTINUE ${savedMission().name.toUpperCase()} `));
    const time=document.createElement('span');time.textContent=formatTime(savedRecord.game?.state?.time);$('continue').append(time);
  }
}

function saveRun() {
  if(coop || !game || !['playing','paused'].includes(game.state.status) || game.state.player.health <= 0) return false;
  try {
    savedRecord = {version:1,game:game.serialize(),explored:[...explored],savedAt:Date.now()};
    const persisted = writeStorage(SAVE_KEY,savedRecord);
    $('pause-screen').querySelector('.overlay-copy').textContent = persisted ? 'Take a breath. Your position is saved on this device.' : 'Take a breath. Your position is held while this page stays open.';
    return persisted;
  } catch (_) { return false; }
}
function resetExploration() { explored=new Set();mapDirty=true;pathHint=null;pathTimer=0;mapCenter=null;mapFollow=true;mapView='local';mapZoom=1;mapSelected=null;mapIndexSignature='';mapKnownMarkers=[];mapKnownSectors=[];$('map-selection').textContent='Select a landmark to inspect its location and access.';mapFloorTotal=game?.level.grid.reduce((sum,row)=>sum+[...row].filter(cell=>cell!=='#').length,0)||0; }
function mountGame(candidate) {
  audio.resetMusic();
  renderer?.dispose();game=candidate;
  renderer = new BreachRenderer($('world'),game,{quality:settings.quality,fov:settings.fov,reducedMotion:settings.reducedMotion});
  resetExploration(); helpRevealed=0;updateTutorial.identity=null;touchLookHelpShown=false;encounterNotices.clear();
}
function makeGame(options = {}) {
  mountGame(new Game({mission:settings.mission,difficulty:settings.difficulty,guidance:settings.guidance,aimAssist:settings.aimAssist,seed,...options}));
}
function launchMission(missionId, runOptions = {}) {
  if(coop||!ready||!missionIds.includes(missionId))return;
  try {
    makeGame({...runOptions,mission:missionId}); savedRecord=null;removeStorage(SAVE_KEY);
    mapVisible=false;updateMapVisibility();
    audio.unlock();game.start();setMode('playing');lastSave=0;lastFrame=performance.now();
    saveRun();updateHud();requestMouse();
  }catch(error){fail(error);}
}
function launchNew() { launchMission(settings.mission); }
function restartCurrent() {
  if(coop){if(roomOwner())coop.restart(false);return;}
  if(!game)return;
  launchMission(currentMission().id,{difficulty:game.options.difficulty,seed:game.options.seed});
}
function continueRun() {
  if(coop||!ready||!savedRecord)return;
  try {
    const record=savedRecord;
    const restored=new Game({mission:savedMission(record).id,...record.game?.options});
    if(!restored.restore(record.game)) {
      $('load-status').textContent='That saved run could not be restored. Start a new mission.';return;
    }
    restored.options.guidance=settings.guidance;restored.options.aimAssist=settings.aimAssist;
    // Restore chooses the saved level before its geometry is constructed.
    mountGame(restored);
    if(Array.isArray(record.explored))for(const value of record.explored)if(Number.isInteger(value)&&value>=0&&value<game.level.width*game.level.height)explored.add(value);
    mapVisible=false;updateMapVisibility();audio.unlock();game.resume();setMode('playing');
    lastFrame=performance.now();updateHud();requestMouse();
  }catch(error){fail(error);}
}

function pauseGame(reason='menu') {
  if(mode !== 'playing') return;
  if(coop){coop.pause(reason==='background'?'background':'menu');setMode('paused');updatePauseRoom();return;}
  game.pause(); saveRun(); setMode('paused'); updateHud();
  $('resume').focus({preventScroll:true});
}
function resumeGame() {
  if(coop){if(coop.connected&&coop.room?.status==='paused'){closeDialogs();audio.unlock();coop.resume();$('resume').disabled=true;$('resume').textContent='READY · WAITING FOR TEAMMATE';}return;}
  if(!ready || !game || game.state.status !== 'paused') return;
  closeDialogs(); audio.unlock(); game.resume(); setMode('playing'); lastFrame = performance.now(); requestMouse();
}
function retryCheckpoint() {
  if(coop){if(roomOwner())coop.restart(true);return;}
  if(!game || !ready) return;
  if(!game.restartCheckpoint()) return restartCurrent();
  audio.resetMusic();
  mapVisible = false; updateMapVisibility(); audio.unlock(); setMode('playing');
  pathHint = null; pathTimer = 0; lastFrame = performance.now(); saveRun(); updateHud(); requestMouse();
}
function backToMenu() {
  if(coop)return leaveRoom();
  if(mode === 'playing') game.pause();
  saveRun(); closeDialogs();
  try { makeGame(); } catch(error) { return fail(error); }
  setMode('menu'); $('start').focus({preventScroll:true});
}
function finish(won) {
  if(coop)return finishRoom(won);
  $('end-restart').hidden=false;$('end-restart').disabled=false;$('end-menu').textContent='MAIN MENU';$('end-room-status').hidden=true;
  if(mode === 'dead' || mode === 'won') return;
  setMode(won ? 'won' : 'dead');
  $('end-kicker').textContent = won ? 'EXTRACTION CONFIRMED' : 'SIGNAL TERMINATED';
  $('end-title').innerHTML = won ? 'SURVIVED<span>_</span>' : 'LOST<span>_</span>';
  const completed=currentMission(),next=MISSIONS[MISSIONS.findIndex(mission=>mission.id===completed.id)+1];
  $('end-copy').textContent=won ? `You made it out of ${completed.name}. Your mission is complete.` : 'The facility got the better of you. Keep moving, use cover, and collect supplies.';
  $('end-next').hidden=!won||!next;
  if(next){$('end-next').textContent=`NEXT: ${next.name.toUpperCase()} ↗`;$('end-next').dataset.mission=next.id;}
  $('result-time').textContent = formatTime(game.state.time);
  $('result-kills').textContent = String(game.state.kills);
  $('result-secrets').textContent = `${game.state.secretFound ? 1 : 0} / 1`;
  $('end-checkpoint').hidden = won || !game.state.checkpoint;
  const secondaryRestart=(!won&&game.state.checkpoint)||(won&&!!next);
  $('end-restart').classList.toggle('subdued',secondaryRestart);
  $('end-restart').classList.toggle('primary',!secondaryRestart);
  $('end-restart').innerHTML = won ? 'PLAY AGAIN <span>↗</span>' : 'RESTART MISSION <span>↗</span>';
  if(won) {
    const bestKey=`${BEST_KEY}.${completed.id}.${game.options.difficulty}`;
    const oldBest=readStorage(bestKey);
    if(!oldBest||game.state.time<oldBest.time)writeStorage(bestKey,{time:game.state.time,mission:completed.id,difficulty:game.options.difficulty});
    savedRecord = null; removeStorage(SAVE_KEY);
  }
}
// Private rooms keep their network view separate from the single-player save.
function roomInvite(id) {
  const url=new URL(location.href);url.searchParams.delete('mission');url.searchParams.set('room',id);url.hash='';return url.href;
}
function clearRoomQuery() { requestedRoom='';const url=new URL(location.href);url.searchParams.delete('room');try{history.replaceState(null,'',url);}catch(_){} }
function roomOwner() { return !!coop&&coop.selfId===coop.room?.ownerId; }
function suspendRoomReadiness(reason='menu') {
  if(!coop?.connected||!coop.room)return;
  const self=coop.room.players.find(player=>player.id===coop.selfId);
  if(coop.room.status==='lobby') {
    if(self?.ready){self.ready=false;coop.ready(false);updateRoomEntry();}
  }else if(coop.room.status==='playing'&&!coop.waitingPause||coop.room.status==='paused'&&self?.ready) {
    if(self)self.ready=false;coop.pause(reason);updatePauseRoom();
  }
}
function localOperatorAlive() { return !coop||game?.state.player.alive!==false&&game?.state.player.health>0; }
function updateRoomBriefing(id) {
  const mission=missionForId(id||coop?.room?.mission||$('room-mission').value);
  $('room-mission-tag').textContent=`MISSION ${mission.number} / PRIVATE CO-OP`;
  $('room-mission-title').textContent=mission.name.toUpperCase();
  $('room-mission-briefing').textContent=briefingForGuidance(mission,settings.guidance).text;
  $('room-exploration-rule').hidden=!['underworks-13','hollow-19'].includes(mission.id);
}
function populateRoomMissions() {
  $('room-mission').replaceChildren(...coopMissionIds.map(id=>{
    const option=document.createElement('option');option.value=id;option.textContent=missionForId(id).name;return option;
  }));
  $('room-mission').value=settings.coopMission;updateRoomBriefing();
}
function updateRoomEntry() {
  const busy=!!coop&&['connecting','reconnecting'].includes(coopConnection),room=coop?.room;
  $('room-entry').hidden=!!room;$('room-lobby').hidden=!room;
  for(const id of ['room-name','room-mission','room-difficulty','room-code','room-create','room-join'])$(id).disabled=busy;
  $('room-back').textContent=room?'LEAVE ROOM ←':busy?'CANCEL CONNECTION ←':'BACK TO MENU ←';
  if(!room)return;
  if(requestedRoom!==room.id){requestedRoom=room.id;$('room-code').value=room.id;try{history.replaceState(null,'',roomInvite(room.id));}catch(_){}}
  $('room-id').textContent=room.id;$('room-combat').textContent=`${missionForId(room.mission).name.toUpperCase()} / ${room.difficulty.toUpperCase()}`;updateRoomBriefing(room.mission);
  $('room-invite').value=roomInvite(room.id);
  const players=room.players||[];
  $('room-players').replaceChildren(...['p1','p2'].map(id=>{
    const player=players.find(value=>value.id===id),row=document.createElement('div');row.className='room-operator';
    const indicator=document.createElement('span');indicator.className=`operator-light${player?.connected?' connected':''}${player?.ready?' ready':''}`;
    const name=document.createElement('strong');name.textContent=player?`${player.name}${player.id===coop.selfId?' / YOU':''}`:'Awaiting operator';
    const state=document.createElement('small');state.textContent=!player?'OPEN SLOT':!player.connected?'RECONNECTING':player.ready?'READY':'NOT READY';
    row.append(indicator,name,state);return row;
  }));
  const self=players.find(player=>player.id===coop.selfId),allReady=players.length===2&&players.every(player=>player.connected&&player.ready);
  $('room-ready').disabled=!coop.connected||room.status!=='lobby';
  $('room-ready').setAttribute('aria-pressed',String(!!self?.ready));
  $('room-ready').textContent=self?.ready?'READY ✓ / TAP TO UNDO':'I’M READY ✓';
  $('room-ready').classList.toggle('subdued',!!self?.ready);$('room-ready').classList.toggle('primary',!self?.ready);
  $('room-start').textContent=`START ${missionForId(room.mission).name.toUpperCase()} ↗`;
  $('room-start').hidden=!roomOwner();$('room-start').disabled=!allReady||!coop.connected||room.status!=='lobby';
  $('room-wait').textContent=players.length<2?'Send your invite to one friend.':!allReady?'Both operators must mark ready.':roomOwner()?'Your team is ready. Start the mission when you are.':'Your team is ready. Waiting for the room owner to start.';
  if(coop.connected&&room.status==='lobby')$('room-status').textContent='ROOM OPEN · INVITE ONE FRIEND';
}
function updateTeamStatus() {
  const room=coop?.room,network=coop?.view?.state;
  $('team-status').hidden=!room||!network||!['playing','paused'].includes(mode);
  const downed=!!network&&(network.player.alive===false||network.player.health<=0);
  $('downed-banner').hidden=!downed||mode!=='playing';
  document.body.classList.toggle('operator-downed',downed&&mode==='playing');
  if(!room||!network)return;
  const teammate=room.players.find(player=>player.id!==coop.selfId),body=network.players?.[teammate?.id];
  const status=!teammate?'WAITING':!teammate.connected?'RECONNECTING':body?.alive===false||body?.health<=0?'DOWN':`${Math.ceil(body?.health??100)} HP`;
  $('team-status-text').textContent=`${teammate?.name||'TEAMMATE'} · ${status}`;
  $('team-status').classList.toggle('teammate-down',body?.alive===false);
}
function updatePauseRoom() {
  const room=coop?.room,network=coop?.view;
  $('pause-map').hidden=!game?.level.exploration;
  $('pause-room-status').hidden=!coop;
  $('restart').hidden=!!coop&&!roomOwner();
  $('checkpoint').hidden=!game?.state.checkpoint||!!coop&&!roomOwner();
  $('back-menu').textContent=coop?'LEAVE ROOM':'MAIN MENU';
  if(!coop) {
    $('pause-screen').querySelector('.eyebrow').textContent='SIGNAL HELD';
    $('resume').innerHTML='RETURN TO FACILITY <span>↗</span>';$('resume').disabled=false;$('restart').disabled=false;$('checkpoint').disabled=false;
    return;
  }
  const self=room?.players.find(player=>player.id===coop.selfId);
  const offline=room?.players.some(player=>!player.connected);
  $('pause-screen').querySelector('.eyebrow').textContent='TEAM SIGNAL HELD';
  $('pause-screen').querySelector('.overlay-copy').textContent=coopConnection==='reconnecting'?'Connection interrupted. We’re rejoining your room.':(room?.pauseReason||'The whole team is paused. Both operators must choose Resume to continue.');
  $('pause-room-status').textContent=coopConnection==='reconnecting'?'Your slot is reserved briefly. Keep this page open.':offline?'Waiting for your teammate to reconnect.':self?.ready?'YOU ARE READY · WAITING FOR YOUR TEAMMATE':'RESUME WHEN BOTH OPERATORS ARE READY';
  $('resume').disabled=!coop.connected||room?.status!=='paused'||!!self?.ready;
  $('resume').textContent=self?.ready?'READY · WAITING FOR TEAMMATE':'READY TO RESUME ↗';
  $('restart').disabled=!coop.connected||offline;
  $('checkpoint').disabled=!coop.connected||offline||!network;
}
function applyRoomStatus() {
  if(!coop?.room)return;
  updateRoomEntry();
  if(!coop.view){if(mode!=='room')setMode('room');return;}
  const status=coop.room.status;
  if(status==='playing') {
    if(document.hidden||document.querySelector('dialog[open]')||mapVisible&&game.level.exploration) {if(!coop.waitingPause)coop.pause(document.hidden?'background':'menu');if(mode!=='paused')setMode('paused');}
    else if(!coop.waitingPause&&coop.connected&&mode!=='playing') {
      closeDialogs();setMode('playing');lastFrame=performance.now();requestMouse();
    }
  } else if(status==='paused') {if(mode!=='paused')setMode('paused');updatePauseRoom();}
  else if(['dead','won'].includes(status)&&coop.view.state.status===status)finishRoom(status==='won');
  updateTeamStatus();
}
function finishRoom(won) {
  if(!coop?.view)return;
  if(mode!==(won?'won':'dead'))setMode(won?'won':'dead');
  $('end-kicker').textContent=won?'TEAM EXTRACTION CONFIRMED':'TEAM SIGNAL LOST';
  $('end-title').innerHTML=won?'TOGETHER<span>_</span>':'TEAM DOWN<span>_</span>';
  $('end-copy').textContent=won?`${missionForId(coop.room.mission).name} is clear. Your team made it out.`:'Both operators are down. Regroup at the shared checkpoint and try again.';
  $('result-time').textContent=formatTime(game.state.time);$('result-kills').textContent=String(game.state.kills);
  $('result-secrets').textContent=`${game.state.secretFound?1:0} / 1`;
  $('end-next').hidden=true;$('end-checkpoint').hidden=won||!game.state.checkpoint||!roomOwner();
  $('end-restart').hidden=!roomOwner();$('end-restart').disabled=!coop.connected;
  $('end-restart').classList.toggle('subdued',!won&&!!game.state.checkpoint);$('end-restart').classList.toggle('primary',won||!game.state.checkpoint);
  $('end-restart').textContent=won?'PLAY TOGETHER AGAIN ↗':'RESTART TEAM MISSION ↗';
  $('end-menu').textContent='LEAVE ROOM';$('end-room-status').hidden=false;
  $('end-room-status').textContent=roomOwner()?'You own this room. A restart moves both operators together.':'Waiting for the room owner to restart the team mission.';
}
function openRoom() {
  if(!coopConfigured||!ready)return;
  closeDialogs();setMode('room');$('room-error').hidden=true;
  $('room-name').value=settings.callSign||'Operator';$('room-difficulty').value=settings.difficulty;
  $('room-mission').value=coopMissionIds.includes(settings.mission)?settings.mission:settings.coopMission;updateRoomBriefing();
  $('room-entry').classList.toggle('join-first',!!requestedRoom);
  $('room-entry').querySelector('.room-divider span').textContent=requestedRoom?'OR CREATE A NEW ROOM':'HAVE AN INVITE?';
  if(requestedRoom)$('room-code').value=requestedRoom;
  $('room-status').textContent=requestedRoom?'YOU HAVE AN INVITE · ENTER YOUR CALL SIGN AND JOIN':'Create a private room, or enter a friend’s code.';
  updateRoomEntry();
}
function endRoomConnection(message) {
  coop=null;coopConnection='idle';clearInputs();closeDialogs();
  try{makeGame();}catch(error){fail(error);return;}
  setMode('room');updateRoomEntry();$('room-status').textContent='ROOM ENDED';
  $('room-error').textContent=message;$('room-error').hidden=false;
}
function beginRoom(joining) {
  if(!coopConfigured)return;
  const name=$('room-name').value.trim().slice(0,20)||'Operator';
  const roomId=$('room-code').value.trim().toUpperCase();
  if(joining&&!/^[A-Z0-9]{8}$/.test(roomId)){$('room-error').textContent='Enter the 8-character room code from your invite.';$('room-error').hidden=false;$('room-code').focus();return;}
  settings.callSign=name;saveSettings();$('room-error').hidden=true;audio.unlock();
  coop?.leave();
  let client;
  try {
    client=new CoopClient({base:config.coopServer,callbacks:{
      onConnection(status,message){if(coop!==client)return;
        if(status==='error'&&client.view){endRoomConnection(message);return;}
        coopConnection=status;$('room-status').textContent=message;
        if(['connecting','reconnecting','suspended'].includes(status)){clearInputs();if(client.view)setMode('paused');}
        updateRoomEntry();updatePauseRoom();},
      onRoom(){if(coop!==client)return;applyRoomStatus();},
      onView(view){if(coop!==client)return;view.options.guidance=settings.guidance;view.options.aimAssist=settings.aimAssist;
        try{mountGame(view);mapVisible=false;updateMapVisibility();}catch(error){client.pause();fail(error);}},
      onState(state,events,allEvents){if(coop!==client)return;
        if(state.player.alive===false)clearInputs();
        processEvents(events,allEvents);applyRoomStatus();updateHud();if(mapVisible){mapDirty=true;pathHint=calculatePath();}},
      onError(message){if(coop!==client)return;$('room-error').textContent=message;$('room-error').hidden=false;
        if(mode==='playing')showToast(message);if(mode==='paused')$('pause-room-status').textContent=message;},
      onClosed(message){if(coop!==client)return;endRoomConnection(message);},
    }});
    coop=client;coop.aimAssist=settings.aimAssist;
    if(joining)client.join({roomId,name});else client.create({name,mission:choices($('room-mission').value,coopMissionIds,coopMissionIds[0]),difficulty:$('room-difficulty').value});
  }catch(error){coop=null;coopConnection='error';$('room-error').textContent=error.message||'The room connection could not start.';$('room-error').hidden=false;updateRoomEntry();}
}
function leaveRoom() {
  const current=coop;coop=null;coopConnection='idle';current?.leave();clearRoomQuery();closeDialogs();clearInputs();
  try{makeGame();}catch(error){fail(error);return;}
  setMode('menu');$('open-coop').focus({preventScroll:true});
}
async function copyInvite() {
  const text=$('room-invite').value;
  try{if(!navigator.clipboard?.writeText)throw new Error('Copy unavailable');await navigator.clipboard.writeText(text);$('room-status').textContent='INVITE COPIED · SEND IT TO ONE FRIEND';}
  catch(_){$('room-invite').focus();$('room-invite').select();$('room-status').textContent='SELECTED YOUR INVITE · COPY IT AND SEND IT TO ONE FRIEND';}
}
function interact() { if(!localOperatorAlive())return;if(coop)coop.interact();else game.interact(); }
function switchWeapon() { if(!localOperatorAlive())return;if(coop)coop.weapon();else game.switchWeapon(); }
function selectWeapon(id) {
  if(!localOperatorAlive()||!ownedWeapons(game.state.player).includes(id)||game.state.player.weapon===id)return;
  if(coop)coop.weapon(id);else game.selectWeapon(id);
}

function fail(error) {
  console.error(error); statusError = true; ready = false;
  try { if(coop)coop.pause('menu');else game?.pause(); } catch (_) {}
  setMode('menu'); $('start').disabled = true; $('continue').disabled = true;
  $('load-status').classList.add('error');
  $('load-status').textContent = /webgl|context|gpu/i.test(String(error)) ? 'This browser could not start the 3D view. Try opening this link in Safari or Chrome, then reload.' : 'The game hit a loading problem. Reload to try again; saved progress stays on this device.';
  $('retry-load').hidden = false;
}
function openDialog(id) {
  if(mode === 'playing') pauseGame();else suspendRoomReadiness('menu');
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
function mapInfo() { return game.getMapInfo?.()||{large:false,sectors:[],markers:[],upgrades:[]}; }
function updateMapVisibility() {
  const large=!!game?.level.exploration;
  $('map-panel').hidden=!mapVisible;$('map-panel').classList.toggle('expanded-map',large);
  document.body.classList.toggle('map-expanded',mapVisible&&large);
  $('map-toggle').setAttribute('aria-pressed',String(mapVisible));
  $('map-toggle').setAttribute('aria-label',mapVisible?'Hide map':'Show map');
  $('map-title').textContent=large?currentMission().name.toUpperCase():'FACILITY MAP';
  $('map-help').textContent=coop?'Drag to pan · + / − to zoom. The whole team is paused. Close the map, then both choose Resume.':'Drag to pan · + / − to zoom. Close the map to return to Resume. Arrow keys pan; Home finds you.';
  if(mapVisible){revealMap();if(large){pathHint=settings.guidance==='simple'?calculatePath():null;refreshMapIndex(true);}drawMap();}
}
function closeMap() {
  mapVisible=false;mapPan=null;updateMapVisibility();
  const target=mode==='paused'&&game?.level.exploration?$('pause-map'):$('map-toggle');
  target.focus({preventScroll:true});
}
function toggleMap() {
  if(mapVisible){closeMap();return;}
  if(!game||!['playing','paused'].includes(mode))return;
  if(game.level.exploration){
    if(mode==='playing')pauseGame();else suspendRoomReadiness('menu');
    mapFollow=true;mapCenter={x:game.state.player.x,z:game.state.player.z};mapView='local';mapZoom=1;
    $('map-index').open=innerWidth>=1000&&innerHeight>=560;
  }else if(mode!=='playing')return;
  mapVisible=true;updateMapVisibility();
  if(game.level.exploration)$('minimap').focus({preventScroll:true});
}
function revealMap() {
  if(!game)return;
  const p=game.state.player,level=game.level;
  for(let z=Math.max(0,Math.floor(p.z)-5);z<Math.min(level.height,Math.floor(p.z)+6);z++) {
    for(let x=Math.max(0,Math.floor(p.x)-5);x<Math.min(level.width,Math.floor(p.x)+6);x++) {
      const dx=x+.5-p.x,dz=z+.5-p.z,d=Math.hypot(dx,dz);if(d>5.8)continue;
      const nearT=d>.6?(d-.6)/d:0;
      if(game.hasLineOfSight(p.x,p.z,p.x+dx*nearT,p.z+dz*nearT))explored.add(z*level.width+x);
    }
  }
  mapDirty=true;
}
function markerSymbol(marker) {
  return {refuge:'+',transit:'T',upgrade:'◆',grille:'╳',hazard:'ϟ',phase:'◎',shortcut:'↔',exit:'⇧',cache:'□',guardian:'!',power:'P',relay:'R',key:'K',gate:'▣'}[marker.type]||'•';
}
function markerColor(marker) {
  if(marker.locked&&settings.guidance==='simple')return '#d28d70';
  return {refuge:'#a9deba',transit:'#81cfd9',upgrade:'#f2bd66',grille:'#e8ad5f',hazard:'#a6d5b2',phase:'#c0a2e7',exit:'#eee8ce',guardian:'#f49b72',cache:'#a8bbaa'}[marker.type]||'#a3bdae';
}
function markerDescription(marker,info=mapInfo()) {
  const observed=markerCueForGuidance(marker,settings.guidance);
  if(observed!==null)return observed;
  const equipment=info.upgrades.find(item=>item.id===marker.requires)?.name;
  if(marker.locked)return equipment?`Needs ${equipment}`:({power:'Needs central power',relays:'Needs both relay links',key:'Needs the lift key',guardian:'Defeat the guardian first'}[marker.requires]||'Route not yet available');
  if(marker.type==='upgrade')return marker.active?'Equipment acquired':'Equipment available here';
  if(marker.type==='refuge')return marker.active?'Refuge visited · use to regroup':'Refuge · shared checkpoint';
  if(marker.type==='transit'){if(!marker.active)return 'Transit station · activate on arrival';if(!game.state.power)return 'Activated · central power needed';const partner=info.markers.find(item=>item.id===marker.destination);return partner?.active?'Transit linked · use here to travel':'Activated · link the other station to travel';}
  if(marker.type==='cache')return marker.active?'Cache recovered':'Optional cache';
  if(marker.type==='guardian')return marker.active?'Guardian cleared':'Hostile guardian';
  if(marker.type==='exit')return 'Arrival lift · return here to extract';
  if(['grille','hazard','phase','shortcut','gate'].includes(marker.type))return marker.active?'Route open':'Access available · interact to open';
  return marker.active?'Activated':'Discovered landmark';
}
function upgradeTokens(container,upgrades,compact=false) {
  upgrades=visibleEquipment(upgrades,settings.guidance);
  const signature=`${settings.guidance}:${upgrades.map(item=>`${item.id}:${item.owned}`).join('|')}`;
  if(container.dataset.signature===signature)return;container.dataset.signature=signature;
  container.replaceChildren(...upgrades.map(item=>{
    const token=document.createElement('span');token.className=`equipment-token${item.owned?' owned':''}`;
    token.textContent=compact?({cutter:'CUT',insulator:'INS',phase:'PHASE'}[item.id]||item.name):item.name;
    token.title=`${item.name}: ${item.owned?'acquired':'not acquired'}`;token.setAttribute('aria-label',token.title);return token;
  }));
}
function refreshMapIndex(force=false) {
  if(!game.level.exploration)return;
  const info=mapInfo(),level=game.level;
  const signature=`${settings.guidance}:${explored.size}:${info.markers.map(m=>`${m.id}:${m.active}:${m.locked}`).join('|')}:${info.upgrades.map(u=>u.owned).join('')}`;
  const objective=objectiveForGuidance(game.getObjective(),settings.guidance);
  $('map-objective').textContent=objective?.title||'';
  $('map-objective').closest('.map-current').hidden=!objective;
  if(!force&&signature===mapIndexSignature)return;mapIndexSignature=signature;
  let floorSeen=0;const sectorSeen=new Set();
  for(const index of explored){const x=index%level.width,z=Math.floor(index/level.width);if(level.grid[z]?.[x]==='#')continue;floorSeen++;
    for(const sector of info.sectors){const b=sector.bounds;if(x>=b.x1&&x<=b.x2&&z>=b.z1&&z<=b.z2)sectorSeen.add(sector.id);}
  }
  const sharedTypes=new Set(['upgrade','refuge','transit','cache','power','relay']);
  mapKnownMarkers=info.markers.filter(marker=>explored.has(Math.floor(marker.z)*level.width+Math.floor(marker.x))||marker.active&&sharedTypes.has(marker.type));
  for(const marker of mapKnownMarkers)for(const sector of info.sectors){const b=sector.bounds;if(marker.x>=b.x1&&marker.x<=b.x2&&marker.z>=b.z1&&marker.z<=b.z2)sectorSeen.add(sector.id);}
  mapKnownSectors=info.sectors.filter(sector=>sectorSeen.has(sector.id));
  const progress=game.getExplorationProgress();
  $('map-progress').textContent=`${Math.min(100,Math.floor(floorSeen/Math.max(1,mapFloorTotal)*100))}% SURVEYED · ${progress.refugesVisited}/${progress.refugesTotal} REFUGES · ${progress.transitsActive}/${progress.transitsTotal} TRANSIT`;
  upgradeTokens($('map-upgrades'),info.upgrades);
  const selectedSector=$('map-sector').value;
  $('map-sector').replaceChildren(...[{id:'',name:'Choose a discovered sector'},...mapKnownSectors].map(sector=>{const option=document.createElement('option');option.value=sector.id;option.textContent=sector.id?`${String(info.sectors.findIndex(item=>item.id===sector.id)+1).padStart(2,'0')} / ${sector.name}`:sector.name;return option;}));
  if(mapKnownSectors.some(sector=>sector.id===selectedSector))$('map-sector').value=selectedSector;
  $('map-marker-count').textContent=String(mapKnownMarkers.length);
  const ranks={refuge:0,transit:1,exit:2,grille:3,hazard:3,phase:3,shortcut:3,gate:3,upgrade:4,guardian:5,cache:6};
  const markers=[...mapKnownMarkers].sort((a,b)=>(ranks[a.type]??7)-(ranks[b.type]??7)||a.label.localeCompare(b.label));
  $('map-marker-list').replaceChildren(...markers.map(marker=>{
    const button=document.createElement('button');button.type='button';button.dataset.mapMarker=marker.id;
    button.setAttribute('aria-pressed',String(marker.id===mapSelected));
    const icon=document.createElement('b');icon.textContent=markerSymbol(marker);icon.style.color=markerColor(marker);
    const content=document.createElement('span'),label=document.createElement('strong'),detail=document.createElement('small');
    label.textContent=markerLabelForGuidance(marker,settings.guidance);detail.textContent=markerDescription(marker,info);detail.hidden=!detail.textContent;content.append(label,detail);button.append(icon,content);return button;
  }));
  if(mapSelected){const marker=mapKnownMarkers.find(item=>item.id===mapSelected);if(marker)$('map-selection').textContent=[markerLabelForGuidance(marker,settings.guidance),markerDescription(marker,info)].filter(Boolean).join(' · ');}
}
function drawMap() {
  if(!game||!mapVisible)return;
  if(game.level.exploration){refreshMapIndex();drawExpandedMap();}else drawSmallMap();
  mapDirty=false;
}
function drawSmallMap() {
  const canvas=$('minimap');if(canvas.width!==350||canvas.height!==280){canvas.width=350;canvas.height=280;}
  const ctx=canvas.getContext('2d'),level=game.level;ctx.setTransform(1,0,0,1,0,0);
  const scale=Math.min((canvas.width-20)/level.width,(canvas.height-20)/level.height),ox=(canvas.width-level.width*scale)/2,oz=(canvas.height-level.height*scale)/2;
  ctx.fillStyle='#08110f';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const index of explored){const x=index%level.width,z=Math.floor(index/level.width);ctx.fillStyle=level.grid[z]?.[x]==='#'?'#4d6254':'#20392d';ctx.fillRect(ox+x*scale,oz+z*scale,scale-.35,scale-.35);}
  for(const door of game.state.doors){if(!explored.has(Math.floor(door.z)*level.width+Math.floor(door.x)))continue;ctx.fillStyle=door.open?'#8acac1':'#f2a744';ctx.fillRect(ox+(door.x-.35)*scale,oz+(door.z-.35)*scale,scale*.7,scale*.7);}
  drawMapRoute(ctx,scale,ox,oz);
  const target=game.getObjective();
  if(settings.guidance==='simple'&&Number.isFinite(target.x))drawObjectiveMarker(ctx,ox+target.x*scale,oz+target.z*scale,4);
  drawMapPlayers(ctx,scale,ox,oz,6);
}
function drawMapRoute(ctx,scale,ox,oz) {
  if(settings.guidance!=='simple'||!pathHint?.path)return;
  ctx.strokeStyle='#f2a74488';ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();let started=false;
  for(const cell of pathHint.path){if(!explored.has(cell.z*game.level.width+cell.x)){started=false;continue;}if(!started){ctx.moveTo(ox+(cell.x+.5)*scale,oz+(cell.z+.5)*scale);started=true;}else ctx.lineTo(ox+(cell.x+.5)*scale,oz+(cell.z+.5)*scale);}
  ctx.stroke();ctx.setLineDash([]);
}
function drawObjectiveMarker(ctx,x,z,radius) {
  ctx.fillStyle='#f2a744';ctx.strokeStyle='#111b13';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,z-radius);ctx.lineTo(x+radius,z);ctx.lineTo(x,z+radius);ctx.lineTo(x-radius,z);ctx.closePath();ctx.stroke();ctx.fill();
}
function drawMapPlayers(ctx,scale,ox,oz,size) {
  if(coop)for(const[id,player]of Object.entries(game.state.players||{})){if(id===coop.selfId)continue;ctx.fillStyle=player.alive===false?'#e29977':'#81cfd9';ctx.beginPath();ctx.arc(ox+player.x*scale,oz+player.z*scale,size*.7,0,Math.PI*2);ctx.fill();}
  const p=game.state.player;ctx.save();ctx.translate(ox+p.x*scale,oz+p.z*scale);ctx.rotate(p.angle);ctx.fillStyle='#eff7dc';ctx.strokeStyle='#07110d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.7,size*.7);ctx.lineTo(0,size*.3);ctx.lineTo(-size*.7,size*.7);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
}
function expandedMapSize() {
  const bounds=$('minimap').getBoundingClientRect();return {width:Math.max(1,bounds.width),height:Math.max(1,bounds.height)};
}
function drawExpandedMap() {
  const canvas=$('minimap'),{width,height}=expandedMapSize(),dpr=Math.min(2,devicePixelRatio||1),level=game.level,info=mapInfo();
  const pixelsX=Math.round(width*dpr),pixelsY=Math.round(height*dpr);if(canvas.width!==pixelsX||canvas.height!==pixelsY){canvas.width=pixelsX;canvas.height=pixelsY;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#07100e';ctx.fillRect(0,0,width,height);
  if(!mapCenter||mapFollow)mapCenter={x:game.state.player.x,z:game.state.player.z};
  const base=mapView==='facility'?Math.min((width-28)/level.width,(height-28)/level.height):Math.max(12,Math.min(width/28,height/24));
  mapScale=Math.max(.5,base*mapZoom);const ox=width/2-mapCenter.x*mapScale,oz=height/2-mapCenter.z*mapScale;
  const colors=['#294438','#343b49','#48402c','#3c354a','#294748','#42392f','#3e4640','#283c4b','#463438'];
  const sectorFor=(x,z)=>info.sectors.findIndex(sector=>{const b=sector.bounds;return x>=b.x1&&x<=b.x2&&z>=b.z1&&z<=b.z2;});
  for(const index of explored){const x=index%level.width,z=Math.floor(index/level.width),px=ox+x*mapScale,pz=oz+z*mapScale;if(px<-mapScale||pz<-mapScale||px>width||pz>height)continue;
    ctx.fillStyle=level.grid[z]?.[x]==='#'?'#52645b':colors[Math.max(0,sectorFor(x,z))%colors.length];ctx.fillRect(px,pz,Math.max(1,mapScale-.45),Math.max(1,mapScale-.45));
  }
  for(const sector of mapKnownSectors){const x=ox+sector.x*mapScale,z=oz+sector.z*mapScale;if(x<12||x>width-12||z<12||z>height-12)continue;
    const overview=mapView==='facility'&&mapZoom<1.5,number=String(info.sectors.findIndex(item=>item.id===sector.id)+1).padStart(2,'0');
    ctx.font=`bold ${overview?9:12}px "Courier New",monospace`;ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#07100edf';ctx.fillStyle='#c4d3bcbf';
    const lines=[];let line='';const maxWidth=overview?Math.max(48,(sector.bounds.x2-sector.bounds.x1)*mapScale-8):220;
    if(mapScale<2.2)lines.push(number);else{for(const word of `${number} ${sector.name.toUpperCase()}`.split(' ')){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);}
    lines.forEach((label,index)=>{const half=ctx.measureText(label).width/2+5,tx=Math.max(half,Math.min(width-half,x)),tz=z-18+index*(overview?11:14);ctx.strokeText(label,tx,tz);ctx.fillText(label,tx,tz);});
  }
  const activeTransits=mapKnownMarkers.filter(marker=>marker.type==='transit'&&marker.active);
  ctx.strokeStyle='#81cfd948';ctx.lineWidth=1.5;ctx.setLineDash([3,6]);
  for(const from of activeTransits){const to=activeTransits.find(marker=>marker.id===from.destination);if(!to||from.id>to.id)continue;ctx.beginPath();ctx.moveTo(ox+from.x*mapScale,oz+from.z*mapScale);ctx.lineTo(ox+to.x*mapScale,oz+to.z*mapScale);ctx.stroke();}ctx.setLineDash([]);
  drawMapRoute(ctx,mapScale,ox,oz);
  mapHits=[];
  for(const marker of mapKnownMarkers){const x=ox+marker.x*mapScale,z=oz+marker.z*mapScale;if(x<-12||z<-12||x>width+12||z>height+12)continue;
    const selected=marker.id===mapSelected,r=mapView==='facility'&&mapZoom<1.4?7:9;
    ctx.fillStyle='#0a1713';ctx.strokeStyle=selected?'#f4e7b9':markerColor(marker);ctx.lineWidth=selected?2:1;
    if(marker.type==='transit'){ctx.beginPath();ctx.arc(x,z,r,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(x-r,z-r,r*2,r*2);ctx.strokeRect(x-r,z-r,r*2,r*2);}
    ctx.fillStyle=markerColor(marker);ctx.font=`bold ${r+3}px "Courier New",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(markerSymbol(marker),x,z+.5);ctx.textBaseline='alphabetic';
    mapHits.push({id:marker.id,x,z});
  }
  const objective=game.getObjective();if(settings.guidance==='simple'&&Number.isFinite(objective.x))drawObjectiveMarker(ctx,ox+objective.x*mapScale,oz+objective.z*mapScale,6);
  drawMapPlayers(ctx,mapScale,ox,oz,8);
  $('map-local').setAttribute('aria-pressed',String(mapView==='local'));$('map-facility').setAttribute('aria-pressed',String(mapView==='facility'));
  $('map-zoom-label').textContent=`${mapZoom.toFixed(1).replace('.0','')}×`;
  $('map-zoom-out').disabled=mapZoom<=(mapView==='facility'?1:.65);$('map-zoom-in').disabled=mapZoom>=(mapView==='facility'?6:3);
}
function changeMapView(view) {
  if(!game?.level.exploration)return;mapView=view;mapZoom=1;mapFollow=view==='local';
  mapCenter=view==='facility'?{x:game.level.width/2,z:game.level.height/2}:{x:game.state.player.x,z:game.state.player.z};drawMap();
}
function changeMapZoom(factor) {
  if(!mapVisible||!game?.level.exploration)return;mapZoom=Math.max(mapView==='facility'?1:.65,Math.min(mapView==='facility'?6:3,mapZoom*factor));drawMap();
}
function selectMapMarker(id,center=true) {
  const marker=mapKnownMarkers.find(item=>item.id===id);if(!marker)return;
  mapSelected=id;$('map-selection').textContent=[markerLabelForGuidance(marker,settings.guidance),markerDescription(marker)].filter(Boolean).join(' · ');
  document.querySelectorAll('[data-map-marker]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapMarker===id)));
  if(center){mapView='local';mapZoom=1.4;mapFollow=false;mapCenter={x:marker.x,z:marker.z};if(innerWidth<700)$('map-index').open=false;}
  drawMap();
}
function calculatePath() {
  const level=game.level,p=game.state.player,target=game.getObjective();
  const progress=game.getMissionProgress();
  const doorCells=new Map(game.state.doors.map(door=>[Math.floor(door.z)*level.width+Math.floor(door.x),door]));
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
      const door=doorCells.get(ni);
      if(door&&!door.open){const permitted=game.canTraverseDoor?game.canTraverseDoor(door):!((door.requires==='power'&&!game.state.power)||(door.requires==='key'&&!p.key)||(door.requires==='relays'&&(!game.state.power||progress.relaysUsed<progress.relaysTotal))||door.secret);if(!permitted)continue;}
      came.set(ni,index);queue.push(ni);
    }
  }
  if(!came.has(end))return {x:target.x,z:target.z,distance:Math.hypot(target.x-p.x,target.z-p.z),path:null,blocked:true};
  const path=[];let at=end;
  while(at!==null){path.push({x:at%level.width,z:Math.floor(at/level.width)});at=came.get(at);}
  path.reverse();const next=path[Math.min(2,path.length-1)];
  return {x:next.x+.5,z:next.z+.5,distance:path.length-1,path};
}
function normAngle(angle) { return Math.atan2(Math.sin(angle),Math.cos(angle)); }
function updateDirection() {
  if(settings.guidance!=='simple'||!pathHint){$('direction').textContent='';return;}
  if(pathHint.blocked){$('direction').textContent=game.level.exploration?'ROUTE SEALED · CHECK YOUR MAP AND EQUIPMENT':'ROUTE SEALED · CHECK THE CURRENT OBJECTIVE';return;}
  const p=game.state.player,a=normAngle(Math.atan2(pathHint.x-p.x,-(pathHint.z-p.z))-p.angle);
  const label=Math.abs(a)>2.45?'↓ TURN AROUND':a>.48?'→ TURN RIGHT':a<-.48?'← TURN LEFT':'↑ AHEAD';
  const nearby = game.getObjective().action === 'fight' ? 'HOSTILE NEARBY · KEEP MOVING AND USE COVER' : game.getObjective().action === 'collect' ? 'NEARBY · WALK OVER THE MARKED ITEM' : (touch ? 'NEARBY · TAP THE ACTION PROMPT' : 'NEARBY · LOOK FOR THE USE PROMPT');
  $('direction').textContent=pathHint.distance<2?nearby:`${label} · ${Math.round(pathHint.distance)} M TO OBJECTIVE`;
}
function visibleHostileForTraining() {
  const p=game.state.player;
  return game.state.enemies.some(enemy=>hostileToPlayer(enemy)
    && Math.hypot(enemy.x-p.x,enemy.z-p.z)<12
    && Math.abs(normAngle(Math.atan2(enemy.x-p.x,-(enemy.z-p.z))-p.angle))<.72
    && game.hasLineOfSight(p.x,p.z,enemy.x,enemy.z));
}
function updateTutorial() {
  const state=game.state,t=state.tutorial||{},objective=game.getObjective();
  const show=settings.guidance==='simple'&&settings.tutorial&&mode==='playing'&&localOperatorAlive();
  // A nearby action or its missing requirement is the most useful guidance now.
  if(!show || (touch && game.getInteractionInfo())){$('tutorial').hidden=true;return;}
  let text='',index='FIELD TRAINING';
  if(!t.moved)text=touch?'Left pad: move. Drag the right side to turn.':'Use W A S D to move. Move your mouse to look around. Arrow keys also turn.';
  else if(objective.stage==='arrival'&&game.level.exploration&&state.interactables.some(item=>item.type==='transit'&&!item.used&&item.x===objective.x&&item.z===objective.z))text=touch?'Walk to the marked transit station. Tap LINK to activate your return route.':'Approach the marked transit station and press E. Linking it now prepares your return route.';
  else if(objective.stage==='arrival')text=touch?'Walk to the airlock. Tap OPEN when it lights up.':'Approach the arrival airlock. Press E when the door prompt appears.';
  else if(!t.fired) {
    if(!visibleHostileForTraining()){
      if(game.level.exploration&&objective.stage==='power'){text=touch?'MAP pauses the run. Use it to remember gates, refuges, and your route back.':'Press TAB to inspect the facility map. It pauses the run and remembers discovered routes.';index='EXPLORATION TIP';}
      else{$('tutorial').hidden=true;return;}
    }else text=touch?(settings.fireGesture==='safe'?'Drag the view to aim. Tap FIRE once, or hold it still briefly for continuous fire.':'Hold FIRE. Drag on it to aim while you shoot.'):'Click or hold SPACE to fire. Move sideways with A and D to dodge.';
  }
  else if(ownedWeapons(state.player).length>1&&!t.weaponSwitched)text=touch?'Tap a gun in the bottom weapon selector to equip it.':'Press 1–5 to select a carried weapon. The numbers match the bottom weapon selector; the mouse wheel cycles them.';
  else if(state.enemies.some(enemy=>enemy.alive&&enemy.faction==='security'&&!enemy.provoked&&Math.hypot(enemy.x-state.player.x,enemy.z-state.player.z)<9&&game.hasLineOfSight(state.player.x,state.player.z,enemy.x,enemy.z))){text='Security sentries fight the creatures. They leave you alone unless you shoot them.';index='ENCOUNTER TIP';}
  else if(game.level.exploration&&['cutter','insulator','phase','return'].includes(objective.stage)){text=objective.stage==='return'?'Activated transit stations shorten the trip back. Check the map for linked stations.':'New equipment opens routes you passed earlier. The map remembers discovered gates and refuges.';index='EXPLORATION TIP';}
  else if(objective.stage==='relays'){text=touch?'Bring both relay consoles online. Each active link stays lit.':'Find and activate both relay consoles. Active links stay lit; the link counter tracks your progress.';index='MISSION BRIEF';}
  else if(objective.action==='collect'){text='Walk over the marked item to collect it.';index='MISSION BRIEF';}
  else {text=touch?'Keep moving. Walk over supplies to collect them.':'Keep moving and use cover. Walk over health, armor, and ammunition to collect them.';index='FIELD TIP';}
  // Early controls wait for the action; the later supply reminder appears briefly.
  if(index==='MISSION BRIEF'||index==='FIELD TIP'||index==='EXPLORATION TIP'||index==='ENCOUNTER TIP') {
    const identity=`${game.level.missionId}:${index==='FIELD TIP'?'supplies':index==='ENCOUNTER TIP'?'security':objective.stage}`;
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
  $('health-fill').style.width=`${Math.max(0,p.health)/(p.maxHealth||100)*100}%`;$('health-unit').textContent=p.maxHealth>100?`/ ${p.maxHealth}`:'HP';$('health').closest('.health').classList.toggle('low',p.health<30);
  const weapon=WEAPONS[p.weapon]||WEAPONS.pistol;
  $('ammo').textContent=p.ammo[weapon.ammoKey]||0;
  $('ammo-label').textContent=({pistol:'9MM AMMUNITION',shells:'SCATTERGUN SHELLS',cells:'ARC CELLS',slugs:'REBOUND SLUGS',grenades:'THUMPER GRENADES'})[weapon.ammoKey]||'AMMUNITION';
  $('ammo-unit').textContent=({cells:'CELLS',slugs:'SLUGS',grenades:'GREN'})[weapon.ammoKey]||'RDS';
  $('weapon-name').textContent=weapon.name.toUpperCase();
  const carried=ownedWeapons(p);
  $('weapon-slots').hidden=carried.length<2;
  $('weapon-slots').dataset.count=String(carried.length);
  $('weapon-slots').parentElement.classList.toggle('expanded-arsenal',carried.length>3);
  for(const button of document.querySelectorAll('[data-weapon]')){
    const id=button.dataset.weapon;button.hidden=!carried.includes(id);button.disabled=!localOperatorAlive();
    button.setAttribute('aria-pressed',String(p.weapon===id));
  }
  $('power-token').classList.toggle('active',state.power);$('key-token').classList.toggle('active',p.key);
  $('power-token').setAttribute('aria-label',state.power?'Power restored':'Power offline');$('key-token').setAttribute('aria-label',p.key?'Access key collected':'Access key needed');
  $('power-token').hidden=settings.guidance!=='simple'&&!state.power;$('key-token').hidden=settings.guidance!=='simple'&&!p.key;
  const progress=game.getMissionProgress();
  $('relay-token').hidden=!progress.relaysTotal||settings.guidance!=='simple'&&!progress.relaysUsed;
  $('relay-token').textContent=`LINK ${progress.relaysUsed}/${progress.relaysTotal}`;
  $('relay-token').classList.toggle('active',progress.relaysTotal>0&&progress.relaysUsed===progress.relaysTotal);
  $('relay-token').setAttribute('aria-label',`${progress.relaysUsed} of ${progress.relaysTotal} relay links online`);
  const equipment=game.getExplorationProgress?.().upgrades||[];
  $('hud-upgrades').hidden=!visibleEquipment(equipment,settings.guidance).length;
  if(equipment.length)upgradeTokens($('hud-upgrades'),equipment,true);
  const obj=objectiveForGuidance(game.getObjective(),settings.guidance);$('objective-title').textContent=obj?.title||'';$('objective-detail').textContent=obj?.detail||'';
  $('objective').hidden=!obj;
  $('objective-detail').hidden=touch||settings.guidance==='expert';
  $('objective').querySelector('.label').textContent=settings.guidance==='expert'?'MISSION':'CURRENT OBJECTIVE';
  const interaction=interactionForGuidance(game.getInteractionInfo(),settings.guidance);
  const canUse=!!interaction?.canUse&&localOperatorAlive();
  $('interaction').hidden=!interaction||mode!=='playing'||!localOperatorAlive();
  $('interaction-text').textContent=interaction?.text||'';
  $('interaction-label').textContent=interaction?.label||'USE';
  $('interaction').disabled=!canUse;
  $('interaction').classList.toggle('action-ready',canUse);
  $('interaction').setAttribute('aria-label',interaction ? `${interaction.label}: ${interaction.text}` : 'Interact');
  $('touch-interact').disabled=!canUse;
  $('touch-interact').hidden=settings.guidance==='expert'&&!canUse;
  $('touch-interact').textContent=interaction?.label||'USE';
  $('touch-interact').classList.toggle('action-ready',canUse);
  $('touch-interact').setAttribute('aria-label',interaction ? `${interaction.label}: ${interaction.text}` : 'Interact when near a door or console');
  $('fire-pad').disabled=!localOperatorAlive();
  $('touch-look-hint').hidden=!(touch&&settings.fireGesture==='safe'&&settings.guidance==='simple'&&settings.tutorial&&mode==='playing'&&performance.now()<touchLookHintUntil);
  $('checkpoint').hidden=!state.checkpoint||!!coop&&!roomOwner();
  updateDirection();updateTutorial();updateTeamStatus();
}
function processEvents(events,allEvents=events) {
  if(!allEvents.length)return;
  renderer.handleEvents(allEvents);audio.events(events,game.state.player);
  let notice=null;
  for(const event of events) {
    const combatCue=['shield-hit','heal','heal-interrupt'].includes(event.type);
    const p=game.state.player,actor=combatCue?game.state.enemies.find(enemy=>enemy.id===event.id):null;
    const observed=!!actor&&!encounterNotices.has(event.type)&&Math.hypot(actor.x-p.x,actor.z-p.z)<14
      &&Math.abs(normAngle(Math.atan2(actor.x-p.x,-(actor.z-p.z))-p.angle))<.72&&game.hasLineOfSight(p.x,p.z,actor.x,actor.z);
    const eventNotice=noticeForGuidance(event,settings.guidance,game.getInteractionInfo(),{observed});
    if(combatCue&&eventNotice)encounterNotices.add(event.type);
    if(eventNotice)notice=eventNotice;
    if(event.type==='record')updateFieldJournal();
    if(event.type==='hurt')damageUntil=performance.now()+(settings.reducedMotion?130:200);
    if(event.type==='hit')hitUntil=performance.now()+120;
    if(['door','shutter','power','pickup','relay','upgrade','refuge','transit-activated','transit','reward','hit','death'].includes(event.type)) {pathTimer=0;mapDirty=true;}
    if(['checkpoint','upgrade','refuge','transit-activated','reward','record','shutter'].includes(event.type))saveRun();
    if(event.type==='win'&&!coop)finish(true);
    if(event.type==='death'&&!coop)finish(false);
    if(event.type==='revive'&&coop)notice='Back in the fight. The team reached a shared checkpoint.';
    if(event.type==='downed'&&coop)notice='Operator down. Your teammate can bring you back at the next checkpoint.';
  }
  if(notice&&mode==='playing')showToast(notice);
}
function shouldAutoFire(gesture) {
  if(!settings.autoFire||!localOperatorAlive()||gesture.blocksAutoFire)return false;
  return automaticFireAllowed(game.state.enemies,game.state.player,{aimAssist:settings.aimAssist,hasLineOfSight:(...args)=>game.hasLineOfSight(...args)});
}
function frame(now) {
  if(statusError)return;
  const dt=Math.min(.05,Math.max(0,(now-(lastFrame||now))/1000));lastFrame=now;
  try {
    if(mode==='playing') {
      const gesture=fireGestures.sample(now);updateFireAppearance(gesture);
      input.forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joyY;
      input.strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+joyX;
      input.forward=Math.max(-1,Math.min(1,input.forward));input.strafe=Math.max(-1,Math.min(1,input.strafe));
      input.turn=pendingTurn+((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*2.3*settings.sensitivity;
      pendingTurn=0;input.fire=firePulse||firePadPulse||mouseFire||gesture.firing||keys.has('Space')||shouldAutoFire(gesture);
      if(coop)coop.drive(dt,input);else{game.update(dt,input);processEvents(game.drainEvents());}
      firePulse=false;firePadPulse=false;
      if(!coop){if(game.state.status==='dead')finish(false);else if(game.state.status==='won')finish(true);}
      if(now-lastMap>300){revealMap();lastMap=now;}
      if(settings.guidance==='simple'&&now-pathTimer>650){pathHint=calculatePath();pathTimer=now;}
      if(now-lastSave>10000){saveRun();lastSave=now;}
    }
    if(coop&&mode!=='playing')coop.drive(dt,{forward:0,strafe:0,turn:0,fire:false});
    audio.updateMusic(game,dt,mode!=='playing'||document.hidden||mapVisible||!!document.querySelector('dialog[open]'));
    if(now-lastHud>90){updateHud();lastHud=now;if(mapVisible&&mapDirty)drawMap();}
    if(now>toastTimer)$('toast').hidden=true;
    $('damage-flash').classList.toggle('active',now<damageUntil&&mode==='playing');
    $('hitmarker').classList.toggle('active',now<hitUntil&&mode==='playing');
    renderer.render(dt);
    requestAnimationFrame(frame);
  }catch(error){fail(error);}
}

// Menu, dialogs, and discrete commands.
$('open-coop').hidden=!coopConfigured;
$('open-coop').addEventListener('click',openRoom);
$('room-entry').addEventListener('submit',event=>{event.preventDefault();beginRoom($('room-entry').classList.contains('join-first'));});
$('room-create').addEventListener('click',()=>beginRoom(false));
$('room-join').addEventListener('click',()=>beginRoom(true));
$('room-code').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);});
$('room-code').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();beginRoom(true);}});
$('room-back').addEventListener('click',leaveRoom);
$('room-copy').addEventListener('click',copyInvite);
$('room-ready').addEventListener('click',()=>{audio.unlock();const self=coop?.room?.players.find(player=>player.id===coop.selfId);coop?.ready(!self?.ready);});
$('room-start').addEventListener('click',()=>{audio.unlock();coop?.start();});
$('room-settings').addEventListener('click',()=>openDialog('settings-dialog'));
$('room-mission').addEventListener('change',()=>{settings.coopMission=$('room-mission').value;saveSettings();updateRoomBriefing();});
$('start').addEventListener('click',launchNew);$('continue').addEventListener('click',continueRun);
$('retry-load').addEventListener('click',()=>location.reload());
$('brand-home').addEventListener('click',event=>{event.preventDefault();});
$('fullscreen').addEventListener('click',toggleFullscreen);$('settings-fullscreen').addEventListener('click',toggleFullscreen);
$('pause').addEventListener('click',pauseGame);$('resume').addEventListener('click',resumeGame);
$('checkpoint').addEventListener('click',retryCheckpoint);$('end-checkpoint').addEventListener('click',retryCheckpoint);
$('restart').addEventListener('click',restartCurrent);$('end-restart').addEventListener('click',restartCurrent);
$('end-next').addEventListener('click',()=>{const id=$('end-next').dataset.mission;if(missionIds.includes(id)){settings.mission=id;saveSettings();updateMissionMenu();const url=new URL(location.href);url.searchParams.set('mission',id);try{history.replaceState(null,'',url);}catch(_){}launchMission(id);}});
$('mission-picker').addEventListener('click',event=>{const button=event.target.closest('[data-mission]');if(button)selectMission(button.dataset.mission);});
$('back-menu').addEventListener('click',backToMenu);$('end-menu').addEventListener('click',backToMenu);
$('open-settings').addEventListener('click',()=>openDialog('settings-dialog'));
$('pause-settings').addEventListener('click',()=>openDialog('settings-dialog'));
$('open-controls').addEventListener('click',()=>openDialog('controls-dialog'));
for(const id of ['close-settings','done-settings','close-controls','done-controls'])$(id).addEventListener('click',closeDialogs);
for(const id of ['settings-dialog','controls-dialog']) {
  $(id).addEventListener('close',clearInputs);
  $(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialogs();}});
}
$('map-toggle').addEventListener('click',toggleMap);$('map-close').addEventListener('click',closeMap);$('pause-map').addEventListener('click',toggleMap);
$('map-local').addEventListener('click',()=>changeMapView('local'));$('map-facility').addEventListener('click',()=>changeMapView('facility'));
$('map-center').addEventListener('click',()=>changeMapView('local'));
$('map-zoom-in').addEventListener('click',()=>changeMapZoom(1.3));$('map-zoom-out').addEventListener('click',()=>changeMapZoom(1/1.3));
$('map-marker-list').addEventListener('click',event=>{const button=event.target.closest('[data-map-marker]');if(button)selectMapMarker(button.dataset.mapMarker);});
$('map-sector').addEventListener('change',event=>{const sector=mapKnownSectors.find(item=>item.id===event.target.value);if(!sector)return;mapView='local';mapZoom=.85;mapFollow=false;mapCenter={x:sector.x,z:sector.z};drawMap();});
$('map-index').addEventListener('toggle',()=>{if(mapVisible)drawMap();});
$('minimap').addEventListener('wheel',event=>{if(!game?.level.exploration||!mapVisible)return;event.preventDefault();event.stopPropagation();changeMapZoom(Math.exp(-event.deltaY*.0015));},{passive:false});
$('minimap').addEventListener('pointerdown',event=>{
  if(!game?.level.exploration||!mapVisible||mapPan||event.pointerType==='mouse'&&event.button!==0)return;
  mapFollow=false;mapPan={id:event.pointerId,x:event.clientX,y:event.clientY,cx:mapCenter.x,cz:mapCenter.z,moved:false};
  try{$('minimap').setPointerCapture(event.pointerId);}catch(_){}event.preventDefault();
});
$('minimap').addEventListener('pointermove',event=>{
  if(!mapPan||event.pointerId!==mapPan.id)return;const dx=event.clientX-mapPan.x,dz=event.clientY-mapPan.y;if(Math.hypot(dx,dz)>5)mapPan.moved=true;
  mapCenter={x:Math.max(0,Math.min(game.level.width,mapPan.cx-dx/mapScale)),z:Math.max(0,Math.min(game.level.height,mapPan.cz-dz/mapScale))};drawMap();
});
$('minimap').addEventListener('pointerup',event=>{
  if(!mapPan||event.pointerId!==mapPan.id)return;const clicked=!mapPan.moved;mapPan=null;
  if(clicked){const bounds=$('minimap').getBoundingClientRect(),x=event.clientX-bounds.left,z=event.clientY-bounds.top;const nearest=mapHits.map(hit=>({...hit,d:Math.hypot(hit.x-x,hit.z-z)})).filter(hit=>hit.d<=22).sort((a,b)=>a.d-b.d)[0];if(nearest)selectMapMarker(nearest.id,false);}
});
for(const event of ['pointercancel','lostpointercapture'])$('minimap').addEventListener(event,()=>{mapPan=null;});
$('dismiss-tutorial').addEventListener('click',()=>{settings.tutorial=false;saveSettings();$('tutorial').hidden=true;showToast('Tutorial hidden. You can turn it on again in Settings.');});
for(const button of document.querySelectorAll('[data-guidance]'))button.addEventListener('click',()=>changeGuidance(button.dataset.guidance));
for(const button of document.querySelectorAll('[data-difficulty]'))button.addEventListener('click',()=>{settings.difficulty=button.dataset.difficulty;updateChoices();saveSettings();});
for(const [id,property]of [['setting-sound','sound'],['setting-music','music'],['setting-aim','aimAssist'],['setting-auto','autoFire'],['setting-motion','reducedMotion']])$(id).addEventListener('change',event=>{settings[property]=event.target.checked;saveSettings();updateSettingsFields();});
$('setting-fov').addEventListener('change',event=>{settings.fov=event.target.value==='auto'?null:Number(event.target.value);saveSettings();});
$('setting-quality').addEventListener('change',event=>{settings.quality=event.target.value;saveSettings();});
$('setting-controls').addEventListener('change',event=>{settings.controls=event.target.value;saveSettings();updateSettingsFields();});
$('setting-guidance').addEventListener('change',event=>changeGuidance(event.target.value));
$('setting-touch-preset').addEventListener('change',event=>{clearInputs();settings.touchPreset=resolveTouchPreset(event.target.value);saveSettings();updateSettingsFields();});
$('setting-fire-gesture').addEventListener('change',event=>{settings.fireGesture=resolveFireGesture(event.target.value);saveSettings();updateSettingsFields();});
const controlMediaChanged = () => { if(settings.controls === 'auto') applyControlMode(); };
if(touchMedia.addEventListener) touchMedia.addEventListener('change',controlMediaChanged);
else if(touchMedia.addListener) touchMedia.addListener(controlMediaChanged);
$('setting-sensitivity').addEventListener('input',event=>{settings.sensitivity=Number(event.target.value);updateSettingsFields();saveSettings();});
$('setting-music-volume').addEventListener('input',event=>{settings.musicVolume=Math.min(1,Math.max(0,Number(event.target.value)/100));updateSettingsFields();saveSettings();});
// Give explicitly dismissed training a way back without resetting other preferences.
const trainingRow=document.createElement('label');trainingRow.className='setting-row';trainingRow.innerHTML='<span><b>Show tutorial</b><small>Step-by-step prompts when Simple guidance is selected</small></span><input id="setting-tutorial" type="checkbox">';
$('setting-motion').closest('.setting-row').after(trainingRow);
$('setting-tutorial').addEventListener('change',event=>{settings.tutorial=event.target.checked;helpRevealed=performance.now();saveSettings();});

window.addEventListener('keydown',event=>{
  if((event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement)||document.querySelector('dialog[open]'))return;
  if(event.target instanceof HTMLElement&&event.target.closest('[data-weapon]')&&['Space','Enter'].includes(event.code))return;
  if(mapVisible&&game?.level.exploration){
    if(['Escape','Tab','KeyP'].includes(event.code)){event.preventDefault();closeMap();return;}
    if(['Equal','NumpadAdd','Minus','NumpadSubtract'].includes(event.code)){event.preventDefault();changeMapZoom(['Equal','NumpadAdd'].includes(event.code)?1.3:1/1.3);return;}
    if(event.code==='Home'){event.preventDefault();changeMapView('local');return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();mapFollow=false;const shift=70/mapScale;mapCenter.x=Math.max(0,Math.min(game.level.width,mapCenter.x+(event.code==='ArrowRight'?shift:event.code==='ArrowLeft'?-shift:0)));mapCenter.z=Math.max(0,Math.min(game.level.height,mapCenter.z+(event.code==='ArrowDown'?shift:event.code==='ArrowUp'?-shift:0)));drawMap();}return;
  }
  if(mode==='playing') {
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','KeyE','KeyP','Escape','Digit1','Digit2','Digit3','Digit4','Digit5','KeyQ','KeyF'].includes(event.code))event.preventDefault();
    if(event.code==='Escape'||event.code==='KeyP'){pauseGame();return;}
    if(event.code==='KeyF'&&!event.repeat){toggleFullscreen();return;}
    if(!event.repeat) {
      if(event.code==='Space')firePulse=true;
      if(event.code==='KeyE')interact();
      if(event.code==='Tab')toggleMap();
      if(event.code==='KeyQ')switchWeapon();
      if(weaponHotkeys[event.code])selectWeapon(weaponHotkeys[event.code]);
    }
    keys.add(event.code);
  }else if(mode==='paused'&&(event.code==='Escape'||event.code==='KeyP')){event.preventDefault();resumeGame();}
  else if(['menu','paused'].includes(mode)&&event.code==='KeyF'&&!event.repeat){event.preventDefault();toggleFullscreen();}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{if(mode==='playing'&&performance.now()>fullscreenTransitionUntil)pauseGame('background');else{if(performance.now()>fullscreenTransitionUntil)suspendRoomReadiness('background');clearInputs();}});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(mode==='playing')pauseGame('background');else suspendRoomReadiness('background');coop?.setPageVisible(false);saveRun();clearInputs();}
  else coop?.setPageVisible(true);
});
window.addEventListener('pagehide',()=>{
  if(coop){if(mode==='playing')pauseGame('background');else suspendRoomReadiness('background');coop.suspend();}
  else if(mode==='playing')game.pause();
  saveRun();audio.setPlaying(false);clearInputs();
});
window.addEventListener('pageshow',event=>{
  if(coop){if(event.persisted&&coop.view)setMode('paused');coop.setPageVisible(!document.hidden);}
  else if(event.persisted&&game?.state.status==='paused')setMode('paused');
});
window.addEventListener('resize',()=>{clearInputs();renderer?.resize();if(mapVisible)requestAnimationFrame(drawMap);});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===$('world')){pointerLockedOnce=true;return;}
  if(pointerLockedOnce&&mode==='playing'){if(performance.now()<fullscreenTransitionUntil)clearInputs();else pauseGame();}
});
for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,()=>{clearInputs();renderer?.resize();updateFullscreen();});
window.addEventListener('wheel',event=>{
  if(mode!=='playing'||ownedWeapons(game.state.player).length<2||document.querySelector('dialog[open]'))return;
  if(document.pointerLockElement!==$('world')&&event.target!==$('world'))return;
  event.preventDefault();
  if(event.deltaY!==0&&performance.now()-lastWeaponWheel>180){switchWeapon();lastWeaponWheel=performance.now();}
},{passive:false});
document.addEventListener('pointerlockerror',()=>{if(mode==='playing')showToast('Hold and drag to aim, or use the arrow keys.');});
document.addEventListener('mousemove',event=>{if(mode==='playing'&&document.pointerLockElement===$('world'))pendingTurn+=event.movementX*.0028*settings.sensitivity;});
$('world').addEventListener('contextmenu',event=>event.preventDefault());
$('world').addEventListener('pointerdown',event=>{
  if(mode!=='playing'||!localOperatorAlive())return;
  if(event.pointerType==='touch'||event.pointerType==='pen') {
    if(!touch && settings.controls === 'auto')setTouch(true);
    if(lookPointer!==null)return;
    if(!fireGestures.begin({pointerId:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),source:'look'}).accepted)return;
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
  fireGestures.move({pointerId:event.pointerId,x:event.clientX,y:event.clientY});
  pendingTurn+=(event.clientX-lookLastX)*.005*settings.sensitivity;lookLastX=event.clientX;
});
function endLook(event){fireGestures.cancel(event.pointerId);if(event.pointerId===lookPointer)lookPointer=null;if(event.pointerType==='mouse')mouseFire=false;}
$('world').addEventListener('pointerup',endLook);$('world').addEventListener('pointercancel',endLook);$('world').addEventListener('lostpointercapture',endLook);
window.addEventListener('mouseup',()=>{mouseFire=false;});
$('move-zone').addEventListener('pointerdown',event=>{
  if(mode!=='playing'||movePointer!==null)return;
  movePointer=event.pointerId;$('move-zone').setPointerCapture(event.pointerId);moveJoystick(event);event.preventDefault();
});
function moveJoystick(event){
  if(event.pointerId!==movePointer)return;
  const move=joystickVector($('move-zone').getBoundingClientRect(),event.clientX,event.clientY);
  joyX=move.x;joyY=move.y;
  $('joystick-knob').style.transform=`translate(${move.dx}px,${move.dy}px)`;
}
$('move-zone').addEventListener('pointermove',moveJoystick);
function endMove(event){if(event.pointerId!==movePointer)return;movePointer=null;joyX=joyY=0;$('joystick-knob').style.transform='';}
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('move-zone').addEventListener(type,endMove);
$('fire-pad').addEventListener('pointerdown',event=>{
  if(mode!=='playing'||!localOperatorAlive()||firePointer!==null||event.pointerType==='mouse'&&event.button!==0)return;
  const started=fireGestures.begin({pointerId:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),source:'fire',mode:event.pointerType==='mouse'?'classic':settings.fireGesture});
  if(!started.accepted)return;
  firePointer=event.pointerId;firePadPulse ||= started.pulse;
  try{$('fire-pad').setPointerCapture(event.pointerId);}catch(_){}
  updateFireAppearance(fireGestures.sample(performance.now()));event.preventDefault();
});
$('fire-pad').addEventListener('pointermove',event=>{
  if(event.pointerId!==firePointer||mode!=='playing')return;
  const moved=fireGestures.move({pointerId:event.pointerId,x:event.clientX,y:event.clientY});
  pendingTurn+=moved.dx*.005*settings.sensitivity;
  updateFireAppearance(fireGestures.sample(performance.now()));
});
function updateFireAppearance(gesture) {
  $('fire-pad').classList.toggle('pending',gesture.pending);
  $('fire-pad').classList.toggle('pressed',gesture.firing);
  $('fire-pad').classList.toggle('aim-only',gesture.fireLooking);
}
function endFire(event){
  if(event.pointerId!==firePointer)return;
  if(event.type==='pointerup'&&mode==='playing'&&localOperatorAlive()){
    const ended=fireGestures.end({pointerId:event.pointerId,x:event.clientX,y:event.clientY});
    firePadPulse ||= ended.pulse;
  }else{fireGestures.cancel(event.pointerId);firePadPulse=false;}
  firePointer=null;updateFireAppearance(fireGestures.sample(performance.now()));
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('fire-pad').addEventListener(type,endFire);
// Pointer gestures own firing. A synthesized click after a touch cannot fire twice.
$('fire-pad').addEventListener('click',event=>event.preventDefault());
function useAvailableAction() { if(mode==='playing'&&game.getInteractionInfo()?.canUse)interact(); }
$('touch-interact').addEventListener('click',useAvailableAction);
$('interaction').addEventListener('click',useAvailableAction);
for(const button of document.querySelectorAll('[data-weapon]'))button.addEventListener('click',()=>{if(mode==='playing')selectWeapon(button.dataset.weapon);});

try {
  makeGame();
  if(savedRecord?.version!==1 || !savedRecord.game) savedRecord=null;
  if(savedRecord) { const validator=new Game();if(!validator.restore(savedRecord.game)){savedRecord=null;removeStorage(SAVE_KEY);} }
  updateChoices();updateSettingsFields();updateMissionMenu();populateRoomMissions();updateFullscreen();
  $('minimap').setAttribute('aria-label',settings.guidance==='simple'?'Map showing explored facility, your position, and the current objective':'Map showing explored facility and your position');
  document.body.classList.toggle('reduced-motion',settings.reducedMotion);
  ready=true;$('start').disabled=false;$('continue').disabled=false;
  $('load-status').textContent=touch?'READY · TURN YOUR PHONE SIDEWAYS FOR A WIDER VIEW':'READY · CLICK TO ENTER';
  setMode('menu');renderer.resize();requestAnimationFrame(frame);
  if(requestedRoom&&coopConfigured)openRoom();
}catch(error){fail(error);}
