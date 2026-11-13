import { BaseballGame, PITCHES, PITCHERS, STEP } from './engine.mjs?v=0.3.1';
import { BallparkRenderer } from './renderer.mjs?v=0.3.1';
import { CompatibilityRenderer } from './fallback-renderer.mjs?v=0.3.1';
import { BallparkAudio } from './audio.mjs?v=0.3.1';
import { OnlineSession } from './online.mjs?v=0.3.1';
import { ONLINE_API_BASE } from './online-config.mjs?v=0.3.1';

const $ = id => document.getElementById(id);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const text = (element, value) => { const next = String(value); if (element.textContent !== next) element.textContent = next; };
const visible = (element, show) => { if (element.hidden === show) element.hidden = !show; };
const defaults = { innings: 3, difficulty: 'rookie', guidance: 'simple', sound: true, quality: 'auto', pitcher: 'balanced', opponentPitcher: 'balanced' };
let saved = {};
try { saved = JSON.parse(localStorage.getItem('dfe.baseball.preferences.v1') || '{}') || {}; } catch { /* Private browsing can decline persistence. */ }
const prefs = {
  innings: [3, 6, 9].includes(+saved.innings) ? +saved.innings : defaults.innings,
  difficulty: ['rookie', 'club', 'pro'].includes(saved.difficulty) ? saved.difficulty : defaults.difficulty,
  guidance: ['simple', 'moderate', 'expert'].includes(saved.guidance) ? saved.guidance : defaults.guidance,
  sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
  quality: ['auto', 'low', 'high'].includes(saved.quality) ? saved.quality : defaults.quality,
  pitcher: PITCHERS[saved.pitcher] ? saved.pitcher : defaults.pitcher,
  opponentPitcher: PITCHERS[saved.opponentPitcher] ? saved.opponentPitcher : defaults.opponentPitcher,
};
function savePrefs() { try { localStorage.setItem('dfe.baseball.preferences.v1', JSON.stringify(prefs)); } catch {} }

const refs = Object.fromEntries([
  'app','home-screen','game-ui','loading','error-panel','error-message','scorebug','practicebug','inning-label','away-score','home-score','away-bat','home-bat','count','outs',
  'practice-pitches','practice-hits','practice-hr','practice-best','role-banner','role-title','role-detail','pitch-readout','pitch-name','pitch-speed','timing-cue','timing-marker','timing-label',
  'status-tip','status-label','status-detail','controls','aim-label','aim-pad','aim-stick','pitch-selection','pitch-meter','meter-marker','meter-label','power-button','action-button','action-label','action-hint',
  'result-card','result-kicker','result-title','result-detail','contact-feedback','next-button','final-menu','line-score','event-toast','pause-dialog','pause-reason','help-dialog',
  'sound-button','pause-button','help-button','innings','difficulty','guidance','pause-guidance','quality','setup-note',
  'pitcher','opponent-pitcher','pitcher-note','opponent-note','field-controls','throw-status','field-control-hint',
  'runner-controls','runner-name','runner-target','runner-picker','run-advance','run-advance-label','run-hold','run-hold-label','run-return','run-return-label','runner-control-hint',
  'preplay-controls','preplay-title','preplay-state','preplay-runners','lead-actions','lead-back','lead-more','steal-button','steal-label','pickoff-actions','preplay-hint',
  'online-dialog','online-entry','online-lobby','online-status','online-title','create-room','join-room','room-code','room-share-code','room-players','room-ready','room-settings','rejoin-room',
  'connection-strip','connection-label','connection-detail',
].map(id => [id, $(id)]));
const audio = new BallparkAudio(prefs.sound);
let renderer, rendererKind = 'webgl', game = new BaseballGame({ ...prefs, mode: 'exhibition', seed: 2003 });
let screen = 'menu', paused = false, helpOrigin = null, lastFrame = performance.now();
let aim = { x: 0, y: 0 }, aimPointer = null, pitchType = 'fastball', meter = { active: false, startedAt: 0, value: 0 };
let lastPhase = null, lastBattingSide = null, toastUntil = 0, frameError = false;
let selectedRunnerId = null, selectedThrowBase = null, lastRepertoire = '', runnerPickerSignature = '';
let preplayPickerSignature = '', online = null, onlineBusy = false, onlinePauseRequested = false, onlineAttempt = 0;
const pressed = new Set();
let touchMode = matchMedia('(pointer: coarse)').matches;
refs.app.classList.toggle('touch-mode', touchMode);
const guidanceDescriptions = {
  simple: 'Timing cue, strike zone, and a little help between pitches.',
  moderate: 'Aim guide and short tips. Read the timing yourself.',
  expert: 'Just the essentials. Same baseball, fewer overlays.',
};

for (const id of ['innings','difficulty','guidance','quality']) refs[id].value = String(prefs[id]);
refs['pause-guidance'].value = prefs.guidance;
for (const id of ['pitcher','opponent-pitcher']) {
  for (const pitcher of Object.values(PITCHERS)) {
    const option=document.createElement('option'); option.value=pitcher.id; option.textContent=pitcher.label||pitcher.name;
    refs[id].append(option);
  }
}
refs.pitcher.value=prefs.pitcher;refs['opponent-pitcher'].value=prefs.opponentPitcher;
const pitcherNotes={
  balanced:'Four pitches. Reliable location, even mix.',
  power:'97 mph fastball; less forgiving command.',
  movement:'Sinker, curve and change. Vary shape and speed.',
  knuckle:'3 pitches. Slow flutter; shakier command and hang risk.',
};
function updatePitcherNotes() {
  for(const [id,key,note] of [['pitcher','pitcher','pitcher-note'],['opponent-pitcher','opponentPitcher','opponent-note']]) {
    const profile=PITCHERS[refs[id].value]||PITCHERS.balanced;
    prefs[key]=profile.id;text(refs[note],pitcherNotes[profile.id]||profile.description||'');
    refs[id].title=profile.description||profile.name;
  }
  savePrefs();
}
updatePitcherNotes();
function applyGuidance(value) {
  prefs.guidance = ['simple','moderate','expert'].includes(value) ? value : 'simple';
  refs.guidance.value = prefs.guidance; refs['pause-guidance'].value = prefs.guidance;
  for (const level of ['simple','moderate','expert']) refs.app.classList.toggle(`guidance-${level}`, level === prefs.guidance);
  text(refs['setup-note'], guidanceDescriptions[prefs.guidance]);
  if (game) { game.options.guidance = prefs.guidance; game.state.options.guidance = prefs.guidance; }
  savePrefs();
}
applyGuidance(prefs.guidance);
function updateSoundButton() {
  refs['sound-button'].classList.toggle('muted', !prefs.sound);
  refs['sound-button'].setAttribute('aria-pressed', String(prefs.sound));
  refs['sound-button'].setAttribute('aria-label', prefs.sound ? 'Turn sound off' : 'Turn sound on');
  refs['sound-button'].title = prefs.sound ? 'Sound on' : 'Sound off';
}
updateSoundButton();

function resetInput() {
  pressed.clear();
  if (aimPointer !== null) { try { refs['aim-pad'].releasePointerCapture(aimPointer); } catch {} }
  aimPointer = null;
}
function resetFrameClock() { lastFrame = performance.now(); game.resetClock?.(); }
function showToast(message, seconds = 2) { text(refs['event-toast'], message); toastUntil = performance.now() + seconds * 1000; visible(refs['event-toast'], true); }

function onlineBase() {
  return ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin : (ONLINE_API_BASE || location.origin);
}
function isOnlineBlocked() { return !!online && (!online.connected || online.room?.status !== 'playing'); }
function dispatch(input) { return online ? (!isOnlineBlocked() && online.command(input)) : game.command(input); }
function onlineError(error) {
  const message=typeof error==='string'?error:error?.message||'The room could not be reached. Try again.';
  text(refs['online-status'],message);
  if(screen==='game')showToast(message,3.5);
}
function disconnectOnline() {
  const previous=online;online=null;onlinePauseRequested=false;onlineBusy=false;onlineAttempt++;
  if(previous)previous.leave().catch(()=>{});
  refs.app.classList.remove('is-online');
  visible(refs['connection-strip'],false);
  if(refs['online-dialog'].open)refs['online-dialog'].close();
  $('resume-button').disabled=false;text($('resume-button'),'BACK TO THE GAME');
  refs['create-room'].disabled=false;refs['join-room'].disabled=false;refs['rejoin-room'].disabled=false;
}
function newOnlineSession() {
  let session;
  session=new OnlineSession({baseUrl:onlineBase(),onChange:()=>{if(online===session)onlineChanged();},onError:error=>{if(online===session)onlineError(error);}});
  online=session;return session;
}
function onlineChanged() {
  if(!online)return;
  const room=online.room,players=room?.players||[];
  const hasRoom=!!online.code&&!!room;
  visible(refs['online-entry'],!hasRoom);visible(refs['online-lobby'],hasRoom);
  if(hasRoom){
    text(refs['room-share-code'],online.code);
    const options=online.game?.options||{};
    text(refs['room-settings'],`${options.innings||3} innings · ${options.difficulty||'rookie'} difficulty · You play ${online.side===0?'Boston Harbor (visitors)':'Brooklyn Foundry (home)'}.`);
    for(const side of [0,1]){
      let row=refs['room-players'].querySelector(`[data-side="${side}"]`);
      if(!row){row=document.createElement('div');row.className='room-player';row.dataset.side=String(side);const label=document.createElement('span');label.append(document.createElement('b'),document.createElement('small'));row.append(label,document.createElement('span'));refs['room-players'].append(row);}
      const player=players.find(p=>p?.side===side&&p.pitcher),profile=PITCHERS[player?.pitcher];
      text(row.querySelector('b'),`${side===0?'BOSTON HARBOR':'BROOKLYN FOUNDRY'}${side===online.side?' · YOU':''}`);
      text(row.querySelector('small'),player?`${profile?.label||'Balanced'} pitcher`:'Waiting for your friend');
      text(row.lastElementChild,player?(player.connected?(player.ready?'READY':'IN ROOM'):'RECONNECTING'):'OPEN SEAT');
    }
    const me=players.find(p=>p?.side===online.side),both=players.filter(p=>p?.connected).length===2;
    refs['room-ready'].disabled=onlineBusy||!online.connected||!!me?.ready;
    text(refs['room-ready'],me?.ready?'READY · WAITING FOR FRIEND':'READY TO PLAY');
    if(!onlineBusy&&room.status==='waiting')text(refs['online-status'],both?'Both players are here. Ready up to begin.':'Give your friend the six-character code above.');
  }
  if(hasRoom&&['playing','paused','finished'].includes(room.status)&&(online.connected||(screen==='game'&&game===online.game))){
    if(screen!=='game'||game!==online.game)startOnlineGame();
    if(room.status==='playing'&&!onlinePauseRequested&&paused){paused=false;if(refs['pause-dialog'].open)refs['pause-dialog'].close();resetFrameClock();}
    if(room.status==='paused'){
      paused=true;resetInput();
      text(refs['pause-reason'],onlinePauseRequested?'Time is called. Resume when you are ready.':room.reason||'The match is paused while your opponent returns.');
      if(!refs['pause-dialog'].open&&!refs['help-dialog'].open)refs['pause-dialog'].showModal();
    }
    updateOnlineStatus();updateHUD();
  }
  if(hasRoom&&room.status==='closed'){
    text(refs['online-status'],room.reason||'This room has closed. Create a new game.');
    refs['room-ready'].disabled=true;
    if(screen==='game'){
      paused=true;resetInput();text(refs['pause-reason'],room.reason||'This room has closed. Return to the ballpark to start a new match.');
      if(refs['help-dialog'].open){helpOrigin=null;refs['help-dialog'].close();}
      if(!refs['pause-dialog'].open)refs['pause-dialog'].showModal();
      updateOnlineStatus();
    }
  }
}
function startOnlineGame() {
  game=online.game;screen='game';paused=false;helpOrigin=null;lastPhase=null;lastBattingSide=null;
  onlinePauseRequested=!!online.room?.pauseSides?.includes(online.side);
  aim={x:0,y:0};meter.active=false;selectedRunnerId=null;selectedThrowBase=null;lastRepertoire='';runnerPickerSignature='';preplayPickerSignature='';
  refs.app.classList.remove('is-menu');refs.app.classList.add('is-online');
  visible(refs['home-screen'],false);visible(refs['game-ui'],true);visible(refs['event-toast'],false);
  if(refs['online-dialog'].open)refs['online-dialog'].close();
  if(refs['pause-dialog'].open)refs['pause-dialog'].close();
  resetInput();resetFrameClock();updatePitchButtons();drawAimStick();
  audio.unlock().then(()=>audio.organ());refs.app.focus({preventScroll:true});
}
function updateOnlineStatus() {
  visible(refs['connection-strip'],!!online);if(!online)return;
  const room=online.room||{},blocked=isOnlineBlocked(),other=room.players?.find(p=>p?.side!==online.side);
  text(refs['connection-label'],`1v1 · ${online.code}`);
  let detail=online.connected?`${online.side===0?'HARBOR':'FOUNDRY'} · ${Math.round(online.latencyMs||0)} ms`:'Reconnecting · play is held';
  if(room.status==='paused')detail=!other?.connected?'Opponent reconnecting · play is held':onlinePauseRequested?'Paused · resume when ready':'Opponent paused the match';
  if(room.status==='finished')detail='Match complete';
  if(room.status==='closed')detail='Room closed · return to ballpark';
  refs['connection-strip'].classList.toggle('waiting',blocked);text(refs['connection-detail'],detail);
  if(refs['pause-dialog'].open){
    const canResume=online.connected&&other?.connected&&(onlinePauseRequested||!room.pauseSides?.length)&&room.status!=='closed';
    $('resume-button').disabled=!canResume;
    text($('resume-button'),room.status==='closed'?'ROOM CLOSED':canResume?'BACK TO THE GAME':online.connected&&other?.connected?'WAITING FOR OPPONENT':'WAITING FOR CONNECTION');
  }
}
function openOnline() {
  audio.unlock();text(refs['online-status'],'');
  visible(refs['online-entry'],true);visible(refs['online-lobby'],false);
  visible(refs['rejoin-room'],Boolean(OnlineSession.hasSavedSession?.(onlineBase())));
  refs['online-dialog'].showModal();refs['online-title'].focus({preventScroll:true});
}
async function enterOnline(kind) {
  if(onlineBusy)return;
  if(kind==='join'&&!/^[A-Z0-9]{6}$/.test(refs['room-code'].value.trim().toUpperCase())){text(refs['online-status'],'Enter the six-character room code from your friend.');return;}
  const attempt=++onlineAttempt;
  onlineBusy=true;refs['create-room'].disabled=true;refs['join-room'].disabled=true;refs['rejoin-room'].disabled=true;
  text(refs['online-status'],'Opening the ballpark. The first connection can take a moment…');
  const session=newOnlineSession();
  try{
    if(kind==='create')await session.create({innings:+refs.innings.value,difficulty:refs.difficulty.value,guidance:refs.guidance.value,pitcher:refs.pitcher.value});
    else if(kind==='join')await session.join(refs['room-code'].value.trim().toUpperCase(),{pitcher:refs.pitcher.value});
    else await session.rejoin();
  }catch(error){if(attempt===onlineAttempt){if(online===session){online=null;session.dispose().catch(()=>{});}visible(refs['online-entry'],true);visible(refs['online-lobby'],false);visible(refs['rejoin-room'],Boolean(OnlineSession.hasSavedSession?.(onlineBase())));onlineError(error);}}
  finally{if(attempt===onlineAttempt){onlineBusy=false;refs['create-room'].disabled=false;refs['join-room'].disabled=false;refs['rejoin-room'].disabled=false;onlineChanged();}}
}
$('open-online').addEventListener('click',openOnline);
refs['create-room'].addEventListener('click',()=>enterOnline('create'));
$('join-room-form').addEventListener('submit',event=>{event.preventDefault();enterOnline('join');});
refs['room-code'].addEventListener('input',()=>{refs['room-code'].value=refs['room-code'].value.toUpperCase().replace(/[^A-Z0-9]/g,'');});
refs['rejoin-room'].addEventListener('click',()=>enterOnline('rejoin'));
refs['room-ready'].addEventListener('click',async()=>{
  if(!online||onlineBusy)return;
  const session=online,attempt=onlineAttempt;onlineBusy=true;refs['room-ready'].disabled=true;
  try{await session.ready();}catch(error){if(online===session&&attempt===onlineAttempt)onlineError(error);}
  finally{if(online===session&&attempt===onlineAttempt){onlineBusy=false;onlineChanged();}}
});
$('copy-room-code').addEventListener('click',async()=>{if(!online)return;try{await navigator.clipboard.writeText(online.code);text(refs['online-status'],'Room code copied. Send it to your friend.');}catch{text(refs['online-status'],`Your room code is ${online.code}. Select it above to copy.`);}});
$('close-online').addEventListener('click',()=>{if(online)disconnectOnline();else refs['online-dialog'].close();$('game-title').focus({preventScroll:true});});
refs['online-dialog'].addEventListener('cancel',event=>{event.preventDefault();$('close-online').click();});

function startGame(mode = 'exhibition', scenario = null) {
  disconnectOnline();
  const seed = (Date.now() ^ Math.floor(performance.now()*1000)) >>> 0;
  prefs.innings = +refs.innings.value; prefs.difficulty = refs.difficulty.value; prefs.guidance = refs.guidance.value;
  prefs.pitcher=refs.pitcher.value;prefs.opponentPitcher=refs['opponent-pitcher'].value;
  savePrefs();
  game = new BaseballGame({ seed, innings: prefs.innings, difficulty: prefs.difficulty, guidance: prefs.guidance, pitcher:prefs.pitcher, opponentPitcher:prefs.opponentPitcher, mode, scenario });
  aim = { x: 0, y: 0 }; meter.active = false; pitchType = 'fastball';
  screen = 'game'; paused = false; lastPhase = null; lastBattingSide = null; toastUntil = 0;
  selectedRunnerId=null;selectedThrowBase=null;lastRepertoire='';runnerPickerSignature='';preplayPickerSignature='';
  resetInput(); resetFrameClock();
  refs.app.classList.remove('is-menu');
  visible(refs['home-screen'], false); visible(refs['game-ui'], true); visible(refs['event-toast'], false);
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
  if (refs['help-dialog'].open) refs['help-dialog'].close();
  applyGuidance(prefs.guidance); updatePitchButtons(); updateHUD();
  audio.unlock().then(() => audio.organ());
  refs.app.focus({ preventScroll: true });
}
function returnHome() {
  disconnectOnline();
  screen = 'menu'; paused = false; helpOrigin = null; meter.active = false;
  resetInput(); resetFrameClock();
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
  if (refs['help-dialog'].open) refs['help-dialog'].close();
  visible(refs['home-screen'], true); visible(refs['game-ui'], false);
  refs.app.classList.add('is-menu'); refs.app.classList.remove('is-pitching','is-live','has-preplay','is-online');
  game = new BaseballGame({ ...prefs, mode: 'exhibition', seed: 2003 });
  $('game-title').focus({ preventScroll: true });
  refs['home-screen'].scrollTop=0;
}
function pauseGame(reason = 'Take your time. The next pitch can wait.', showDialog = true) {
  if (screen !== 'game') return;
  paused = true; resetInput(); resetFrameClock();
  if(online&&!onlinePauseRequested){onlinePauseRequested=true;online.pause().catch(onlineError);}
  text(refs['pause-reason'], reason);
  if (showDialog && !refs['pause-dialog'].open && !refs['help-dialog'].open) refs['pause-dialog'].showModal();
}
function resumeGame() {
  if (screen !== 'game') return;
  if(online){
    const room=online.room,other=room?.players?.find(p=>p?.side!==online.side);
    if(!online.connected||room?.status==='closed'||!other?.connected||(!onlinePauseRequested&&room?.pauseSides?.length))return;
  }
  paused = false; resetInput(); resetFrameClock();
  if(online){onlinePauseRequested=false;online.resume().catch(onlineError);}
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
  refs.app.focus({ preventScroll: true });
  audio.unlock();
}
function openHelp(origin = 'game') {
  if (refs['help-dialog'].open) return;
  helpOrigin = screen === 'menu' ? 'menu' : (origin === 'pause' || paused ? 'pause' : 'game');
  if (screen === 'game') pauseGame(undefined, false);
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
  refs['help-dialog'].showModal();
  // Start long guides at their heading, rather than the bottom close button.
  $('help-title').focus({ preventScroll: true });
  refs['help-dialog'].scrollTop = 0;
}
function closeHelp() { if (refs['help-dialog'].open) refs['help-dialog'].close(); }
refs['help-dialog'].addEventListener('close', () => {
  const origin = helpOrigin; helpOrigin = null;
  if (screen === 'game' && origin === 'pause') pauseGame();
  else if (screen === 'game' && origin === 'game') resumeGame();
});
refs['pause-dialog'].addEventListener('cancel', event => { event.preventDefault(); resumeGame(); });

$('setup').addEventListener('submit', event => { event.preventDefault(); startGame('exhibition'); });
$('start-practice').addEventListener('click', () => startGame('practice'));
$('start-runners').addEventListener('click', () => startGame('practice','runners'));
refs.innings.addEventListener('change', () => { prefs.innings=+refs.innings.value;savePrefs(); });
refs.difficulty.addEventListener('change', () => { prefs.difficulty=refs.difficulty.value;savePrefs(); });
refs.pitcher.addEventListener('change',updatePitcherNotes);
refs['opponent-pitcher'].addEventListener('change',updatePitcherNotes);
refs.guidance.addEventListener('change', () => applyGuidance(refs.guidance.value));
refs['pause-guidance'].addEventListener('change', () => applyGuidance(refs['pause-guidance'].value));
refs.quality.addEventListener('change', () => { prefs.quality=refs.quality.value;renderer?.setQuality(prefs.quality);savePrefs(); });
refs['sound-button'].addEventListener('click', () => { prefs.sound=!prefs.sound;audio.setEnabled(prefs.sound);updateSoundButton();savePrefs(); });
refs['pause-button'].addEventListener('click', () => pauseGame());
refs['help-button'].addEventListener('click', () => openHelp());
$('home-help').addEventListener('click', () => openHelp('menu'));
$('pause-help').addEventListener('click', () => openHelp('pause'));
$('close-help').addEventListener('click', closeHelp);
$('resume-button').addEventListener('click', event => {event.preventDefault();resumeGame();});
$('quit-button').addEventListener('click', returnHome);
refs['final-menu'].addEventListener('click', returnHome);
$('reload-button').addEventListener('click', () => location.reload());
$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else { text($('fullscreen-button'), 'Use landscape for a wider field'); return; }
  } catch { text($('fullscreen-button'), 'Full screen unavailable in this browser'); }
});
document.addEventListener('fullscreenchange', () => {text($('fullscreen-button'),document.fullscreenElement?'Leave full screen':'Full screen');renderer?.resize();});

function updatePitchButtons() {
  const keys=game.availablePitches||game.activePitcher?.pitches||PITCHERS.balanced.pitches;
  const signature=keys.join('|');
  if(signature!==lastRepertoire){
    lastRepertoire=signature;
    pitchType=keys[0];
    refs['pitch-selection'].replaceChildren();
    for(const [index,key] of keys.entries()){
      const button=document.createElement('button');button.type='button';button.dataset.pitch=key;
      const label=document.createElement('span');label.textContent=({fastball:'4-SEAM',changeup:'CHANGE',curveball:'CURVE',slider:'SLIDER',sinker:'SINKER',cutter:'CUTTER',splitter:'SPLITTER',knuckleball:'KNUCKLE'})[key]||PITCHES[key].label.toUpperCase();
      const hotkey=document.createElement('small');hotkey.textContent=String(index+1);button.append(label,hotkey);
      button.setAttribute('aria-label',`${PITCHES[key].label}, key ${index+1}`);
      refs['pitch-selection'].append(button);
    }
  }
  if(!keys.includes(pitchType))pitchType=keys[0];
  for (const button of refs['pitch-selection'].querySelectorAll('button')) {
    const selected = button.dataset.pitch === pitchType;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
}
function choosePitch(event) {
  const button=event.target.closest('button[data-pitch]');
  if(!button||screen!=='game'||paused||game.state.phase!=='ready'||game.isBatting)return;
  event.preventDefault();pitchType=button.dataset.pitch;updatePitchButtons();audio.unlock();
}
refs['pitch-selection'].addEventListener('pointerdown',choosePitch);
refs['pitch-selection'].addEventListener('click',event=>{if(event.detail===0)choosePitch(event);});

const baseName=base=>({0:'HOME',1:'1ST',2:'2ND',3:'3RD',4:'HOME'})[base]||'BASE';
function liveRunners(){return(game.state.runners||[]).filter(r=>!r.out&&!r.scored&&(r.pathPosition??r.base??0)<4);}
function selectedRunner(){
  const runners=liveRunners();
  let runner=runners.find(r=>String(r.id)===String(selectedRunnerId));
  if(!runner){runner=runners.find(r=>r.id===game.state.play?.batter?.id)||runners.find(r=>(r.fromBase??r.base)===0)||runners[0];selectedRunnerId=runner?.id??null;}
  return runner;
}
function runnerName(r){return r.id===game.state.play?.batter?.id||(r.fromBase??r.base)===0?'BATTER':`RUNNER ${r.number||r.id}`;}
function runnerHoldBase(r){
  const position=r.pathPosition??r.base??0;
  const bag=(r.targetBase??position)<position?Math.floor(position+1e-8):Math.ceil(position-1e-8);
  return clamp(Math.max(Number(r.forcedBase)||0,bag),1,4);
}
function controlRunner(action){
  if(screen!=='game'||paused||isOnlineBlocked()||game.state.phase!=='live'||game.state.play?.fair===false||!game.isBatting)return;
  const runner=selectedRunner();if(!runner)return;
  audio.unlock();
  if(!dispatch({type:'run',runnerId:runner.id,action}))showToast(game.lastRejection||'That runner cannot make this move.',1.6);
  updateLiveControls();
}
function cycleRunner(){
  if(screen!=='game'||paused||isOnlineBlocked()||!['ready','windup','pitch','live'].includes(game.state.phase)||game.state.play?.fair===false||!game.isBatting)return;
  const runners=liveRunners();if(!runners.length)return;
  const index=runners.findIndex(r=>String(r.id)===String(selectedRunnerId));
  selectedRunnerId=runners[(index+1)%runners.length].id;updateLiveControls();updatePreplayControls();
}
function throwToBase(base){
  if(screen!=='game'||paused||isOnlineBlocked()||game.state.phase!=='live'||game.state.play?.fair===false||game.isBatting)return;
  audio.unlock();
  if(dispatch({type:'throw',base})){selectedThrowBase=base;updateLiveControls();}
  else showToast(game.lastRejection||'Wait for the fielder to get the ball.',1.6);
}
function bindPress(element,handler){
  element.addEventListener('pointerdown',event=>{event.preventDefault();handler(event);});
  element.addEventListener('click',event=>{if(event.detail===0)handler(event);});
}
for(const button of refs['field-controls'].querySelectorAll('[data-throw]'))bindPress(button,()=>throwToBase(+button.dataset.throw));
bindPress(refs['run-advance'],()=>controlRunner('advance'));
bindPress(refs['run-hold'],()=>controlRunner('hold'));
bindPress(refs['run-return'],()=>controlRunner('retreat'));
function pickRunner(event){
  const button=event.target.closest('button[data-runner-id]');if(!button||paused)return;
  event.preventDefault();selectedRunnerId=liveRunners().find(r=>String(r.id)===button.dataset.runnerId)?.id??null;updateLiveControls();
}
refs['runner-picker'].addEventListener('pointerdown',pickRunner);
refs['runner-picker'].addEventListener('click',event=>{if(event.detail===0)pickRunner(event);});

function preplayCommand(type,action){
  if(screen!=='game'||paused||isOnlineBlocked()||!game.isBatting||!['ready','windup','pitch'].includes(game.state.phase))return;
  const runner=selectedRunner();if(!runner)return;
  audio.unlock();
  if(!dispatch({type,runnerId:runner.id,...(action?{action}:{})}))showToast(game.lastRejection||'Wait for the runner to settle.',1.8);
  updatePreplayControls();
}
function pickOff(base){
  if(screen!=='game'||paused||isOnlineBlocked()||game.isBatting||game.state.phase!=='ready')return;
  audio.unlock();meter.active=false;
  if(!dispatch({type:'pickoff',base}))showToast(game.lastRejection||'No runner to pick off there.',1.8);
  updateHUD();
}
bindPress(refs['lead-back'],()=>preplayCommand('lead','shorten'));
bindPress(refs['lead-more'],()=>preplayCommand('lead','extend'));
bindPress(refs['steal-button'],()=>preplayCommand('steal'));
for(const button of refs['pickoff-actions'].querySelectorAll('[data-pickoff]'))bindPress(button,()=>pickOff(+button.dataset.pickoff));
function choosePreplayRunner(event){
  const button=event.target.closest('button[data-runner-id]');if(!button||paused||isOnlineBlocked())return;
  event.preventDefault();selectedRunnerId=liveRunners().find(r=>String(r.id)===button.dataset.runnerId)?.id??null;updatePreplayControls();
}
refs['preplay-runners'].addEventListener('pointerdown',choosePreplayRunner);
refs['preplay-runners'].addEventListener('click',event=>{if(event.detail===0)choosePreplayRunner(event);});
function updatePreplayControls(){
  const s=game.state,batting=game.isBatting,active=screen==='game'&&['ready','windup','pitch'].includes(s.phase),runners=active?liveRunners():[];
  const show=active&&runners.length>0;
  visible(refs['preplay-controls'],show);refs.app.classList.toggle('has-preplay',show);
  if(!show)return;
  const ready=s.phase==='ready',blocked=paused||isOnlineBlocked();
  visible(refs['lead-actions'],batting);visible(refs['preplay-runners'],batting);visible(refs['pickoff-actions'],!batting);
  text(refs['preplay-title'],batting?'ON BASE':'HOLD THE RUNNERS');
  if(!batting){
    const remaining=Math.max(0,2-(s.pickoffAttempts||0));
    text(refs['preplay-state'],ready?`${remaining} PICKOFF${remaining===1?'':'S'} LEFT`:'WATCH THE RUNNERS');
    for(const button of refs['pickoff-actions'].querySelectorAll('[data-pickoff]'))button.disabled=blocked||!ready||!remaining||!s.bases[+button.dataset.pickoff-1];
    text(refs['preplay-hint'],ready?(remaining?'Tap a base to throw over. Longer leads are easier to catch.':'Two attempts used. Deliver a pitch to the batter.'):'A steal opens the fielding controls after the pitch.');
    return;
  }
  const runner=selectedRunner();if(!runner)return;
  const bag=clamp(runner.fromBase||runner.base||1,1,3),target=bag+1,lead=clamp(runner.leadLevel||0,0,2);
  text(refs['preplay-state'],runner.stealing?'RUNNER GOING':runner.stealQueued?'STEAL QUEUED':`${baseName(bag)} · ${['ON THE BAG','NORMAL LEAD','LONG LEAD'][lead]}`);
  const signature=runners.map(r=>r.id).join('|');
  if(signature!==preplayPickerSignature){
    preplayPickerSignature=signature;refs['preplay-runners'].replaceChildren();
    for(const r of runners){const button=document.createElement('button');button.type='button';button.dataset.runnerId=String(r.id);refs['preplay-runners'].append(button);}
  }
  for(const button of refs['preplay-runners'].querySelectorAll('button')){
    const r=runners.find(r=>String(r.id)===button.dataset.runnerId);if(!r)continue;
    text(button,`${baseName(r.fromBase||r.base||1)} · #${r.number||r.id}`);
    const selected=String(r.id)===String(selectedRunnerId);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=blocked;
  }
  refs['lead-back'].disabled=blocked||!ready||lead===0||runner.stealing;
  refs['lead-more'].disabled=blocked||!ready||lead===2||runner.stealing;
  const ahead=target<4?runners.find(r=>r.id!==runner.id&&r.fromBase===target):null;
  const occupied=!!ahead&&!ahead.stealQueued&&!ahead.stealing;
  refs['steal-button'].disabled=blocked||!!runner.stealing||!!occupied;
  refs['steal-button'].classList.toggle('queued',!!runner.stealQueued);
  text(refs['steal-label'],runner.stealing?'RUNNER GOING':runner.stealQueued?'CANCEL STEAL':`STEAL ${baseName(target)}`);
  text(refs['preplay-hint'],runner.stealQueued?'Going on the delivery. Tap again to cancel before the windup.':runner.stealing?'Watch the pitch. The catcher can throw behind the runner.':lead===2?'A longer lead gives a better jump, with more pickoff risk.':'LEAD + takes a bigger lead. STEAL commits on the delivery.');
}

function updateLiveControls(){
  const s=game.state,live=screen==='game'&&s.phase==='live'&&s.play?.fair!==false,batting=game.isBatting;
  visible(refs['field-controls'],live&&!batting);
  const runners=live?liveRunners():[],runner=live?selectedRunner():null;
  visible(refs['runner-controls'],live&&batting&&!!runner);
  if(!live)return;
  if(!batting){
    const p=s.play||{},queued=p.queuedBase??null,thrown=p.stage==='throw'?p.throwBase:null,preparing=p.stage==='held'&&p.transferUntil?p.throwBase:null;
    text(refs['throw-status'],preparing?`PREPARING: ${baseName(preparing)}`:thrown?`TO ${baseName(thrown)}${queued?` · NEXT: ${baseName(queued)}`:''}`:queued?`QUEUED: ${baseName(queued)}`:p.stage==='held'?'BALL IN HAND':'CHOOSE A BASE');
    for(const button of refs['field-controls'].querySelectorAll('[data-throw]')){
      const base=+button.dataset.throw,selected=base===(queued??preparing??thrown??selectedThrowBase);
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('recommended',prefs.guidance==='simple'&&base===p.recommendedBase&&!selected);
      button.classList.toggle('in-flight',base===thrown);
    }
    text(refs['field-control-hint'],preparing?`Preparing ${baseName(preparing)}. Tap another base to change it.`:p.stage==='throw'?(queued?`Next throw queued to ${baseName(queued)}.`:'Choose the next throw while the ball travels.'):queued?'Your choice is queued. Tap another base to change it.':prefs.guidance==='simple'?'Tap a base now. Gold outline suggests a play.':'Tap a base to queue the throw.');
    return;
  }
  if(!runner)return;
  const target=clamp(Number(runner.targetBase)||Math.max(1,Number(runner.base)||0),1,4);
  const next=clamp(target+1,1,4),hold=runnerHoldBase(runner);
  text(refs['runner-name'],runnerName(runner));
  const atDestination=runner.safe&&Math.abs((runner.pathPosition??runner.base??0)-target)<.001;
  const returning=target<(runner.pathPosition??runner.base??0)-.001;
  text(refs['runner-target'],runner.tagRequired?`RETURN TO TAG ${baseName(runner.fromBase)}`:runner.tagQueued?'TAGGING UP':`${atDestination?'AT':returning?'RETURNING TO':'HEADING TO'} ${baseName(atDestination?runner.base:target)}`);
  text(refs['run-advance-label'],runner.tagRequired?(runner.tagQueued?'TAG UP QUEUED':`TAG & GO ${baseName((runner.fromBase||runner.base)+1)}`):runner.tagReady&&atDestination?`TAG UP · ${baseName(next)}`:target<4?`GO ${baseName(next)}`:'HEADING HOME');
  refs['run-advance'].disabled=target>=4||!!(runner.tagRequired&&runner.tagQueued)||isOnlineBlocked();
  text(refs['run-hold-label'],`HOLD AT ${baseName(hold)}`);
  refs['run-return'].disabled=(runner.base??0)<1||atDestination;
  text(refs['run-return-label'],(runner.base??0)>=1?`RETURN ${baseName(runner.base)}`:'RETURN');
  const ids=runners.map(r=>r.id).join('|');
  if(ids!==runnerPickerSignature){
    runnerPickerSignature=ids;refs['runner-picker'].replaceChildren();
    for(const r of runners){const button=document.createElement('button');button.type='button';button.dataset.runnerId=String(r.id);refs['runner-picker'].append(button);}
  }
  visible(refs['runner-picker'],runners.length>1);
  for(const button of refs['runner-picker'].querySelectorAll('button')){
    const r=runners.find(r=>String(r.id)===button.dataset.runnerId);if(!r)continue;
    text(button,`${runnerName(r)} · ${baseName(r.targetBase||r.base||1)}`);
    const selected=String(r.id)===String(selectedRunnerId);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
  text(refs['runner-control-hint'],runner.tagRequired?'Touch the original bag after the catch. TAG & GO queues the attempt.':runner.tagReady&&atDestination?'The catch is made. TAG UP sends this runner to the next base.':prefs.guidance==='simple'?(target===1?'Tap GO 2ND now to try for a double.':target<4?`Destination: ${baseName(target)}. HOLD stops at the next bag.`:'Running home. HOLD can stop at the next bag.'):(runners.length>1?'Tap a runner to select. R cycles runners.':'Your next base is shown above.'));
}

function eventSimulationTime(event) {
  const now=performance.now();
  let stamp=Number(event?.timeStamp);
  if (stamp > 1e12) stamp -= performance.timeOrigin;
  const age=Number.isFinite(stamp)&&stamp>0?clamp((now-stamp)/1000,0,.075):0;
  const interpolation=(1-clamp(game.interpolationAlpha??1,0,1))*STEP;
  return Math.max(0,game.state.time-interpolation-age);
}
function triggerAction(event, power = false) {
  if(screen!=='game'||paused||isOnlineBlocked()||refs['help-dialog'].open||refs['pause-dialog'].open)return;
  audio.unlock();
  const s=game.state;
  if(s.phase==='result'||s.phase==='half'){nextPlay();return;}
  if(s.phase==='final'){if(online)returnHome();else startGame(game.options.mode,game.options.scenario);return;}
  if(s.phase==='live'){
    if(s.play?.fair===false)return;
    if(game.isBatting)controlRunner('advance');
    else if(selectedThrowBase!==null)throwToBase(selectedThrowBase);
    else showToast('Choose 1ST, 2ND, 3RD, or HOME. Keys 1–4.',1.8);
    return;
  }
  if(game.isBatting){
    if(['windup','pitch'].includes(s.phase)&&!s.swing){
      const accepted=dispatch({type:'swing',power,aim:{...aim},time:eventSimulationTime(event)});
      if(accepted){audio.whoosh();refs['action-button'].classList.add('pressed');}
    }
  }else if(s.phase==='ready'){
    if(!meter.active){meter={active:true,startedAt:s.time,value:0};}
    else{
      meter.value = meterValue(s.time);
      const quality=clamp(1-Math.abs(meter.value-.845)/.47,0,1);
      const accepted=dispatch({type:'pitch',pitchType,aim:{...aim},quality});
      if(accepted){meter.active=false;showToast(quality>.9?'GREAT RELEASE':quality>.68?'GOOD RELEASE':'MISSED THE RELEASE',1.2);}
    }
  }
  updateHUD();
}
function nextPlay() {
  if(screen!=='game'||paused)return;
  audio.unlock();
  if(game.state.phase==='final'){if(online)returnHome();else startGame(game.options.mode,game.options.scenario);return;}
  if(isOnlineBlocked())return;
  dispatch({type:'next'});
  // The between-innings card is deliberately kept separate from the third-out call.
  meter.active=false; resetInput(); resetFrameClock(); updateHUD();
}
refs['next-button'].addEventListener('click', nextPlay);
refs['action-button'].addEventListener('pointerdown', event => {event.preventDefault();triggerAction(event,false);});
refs['power-button'].addEventListener('pointerdown', event => {event.preventDefault();triggerAction(event,true);});
// Native keyboard/assistive clicks have no pointerdown. Pointer clicks are already handled.
refs['action-button'].addEventListener('click', event => {if(event.detail===0)triggerAction(event,false);});
refs['power-button'].addEventListener('click', event => {if(event.detail===0)triggerAction(event,true);});

function setAimFromPointer(event) {
  const rect=refs['aim-pad'].getBoundingClientRect();
  const x=(event.clientX-rect.left-rect.width/2)/(rect.width*.38),y=-(event.clientY-rect.top-rect.height/2)/(rect.height*.38);
  aim={x:clamp(x,-1,1),y:clamp(y,-1,1)};
  drawAimStick();
}
function drawAimStick() { refs['aim-stick'].style.transform=`translate(${aim.x*31}px,${-aim.y*31}px)`; }
refs['aim-pad'].addEventListener('pointerdown', event => {
  if(screen!=='game'||paused||aimPointer!==null)return;
  event.preventDefault();aimPointer=event.pointerId;
  refs['aim-pad'].setPointerCapture(event.pointerId);setAimFromPointer(event);audio.unlock();
  if(event.pointerType==='touch'){touchMode=true;refs.app.classList.add('touch-mode');}
});
refs['aim-pad'].addEventListener('pointermove', event => {if(event.pointerId===aimPointer){event.preventDefault();setAimFromPointer(event);}});
function releaseAim(event) {if(event.pointerId===aimPointer){aimPointer=null;try{refs['aim-pad'].releasePointerCapture(event.pointerId);}catch{}}}
for(const name of ['pointerup','pointercancel','lostpointercapture']) window.addEventListener(name,releaseAim);
document.addEventListener('pointerdown', event=>{if(event.pointerType==='touch'&&!touchMode){touchMode=true;refs.app.classList.add('touch-mode');}},{passive:true});
refs['aim-pad'].addEventListener('contextmenu', event=>event.preventDefault());

function isFormTarget(target) {return target instanceof Element && !!target.closest('input,select,textarea');}
window.addEventListener('keydown', event => {
  if (isFormTarget(event.target)) return;
  if (event.code==='Escape') {
    if(refs['help-dialog'].open)return;
    if(screen==='game'){event.preventDefault();paused?resumeGame():pauseGame();}return;
  }
  if(screen!=='game'||paused||isOnlineBlocked()||refs['help-dialog'].open)return;
  // Let a focused button retain its normal Enter/Space activation semantics.
  if(['Space','Enter'].includes(event.code)&&event.target instanceof Element&&event.target.closest('button'))return;
  const codes=['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Enter','Digit1','Digit2','Digit3','Digit4','KeyE','KeyQ','KeyR','KeyB','KeyZ','KeyX','KeyC'];
  if(!codes.includes(event.code))return;
  event.preventDefault();
  if(event.repeat)return;
  pressed.add(event.code);
  if(event.code==='Space')triggerAction(event,pressed.has('ShiftLeft')||pressed.has('ShiftRight'));
  else if(event.code==='ShiftLeft'||event.code==='ShiftRight'){if(game.isBatting&&['windup','pitch'].includes(game.state.phase))triggerAction(event,true);}
  else if(event.code==='Enter'&&['result','half','final'].includes(game.state.phase))nextPlay();
  else if(game.isBatting&&['ready','windup','pitch'].includes(game.state.phase)){
    if(event.code==='KeyZ')preplayCommand('lead','shorten');
    else if(event.code==='KeyX')preplayCommand('lead','extend');
    else if(event.code==='KeyC')preplayCommand('steal');
    else if(event.code==='KeyR')cycleRunner();
  }
  else if(game.state.phase==='live'&&game.isBatting){
    if(event.code==='KeyE')controlRunner('advance');
    else if(event.code==='KeyQ')controlRunner('hold');
    else if(event.code==='KeyB')controlRunner('retreat');
    else if(event.code==='KeyR')cycleRunner();
  }
  else if(event.code.startsWith('Digit')&&!game.isBatting&&game.state.phase==='live')throwToBase(+event.code.slice(-1));
  else if(event.code.startsWith('Digit')&&!game.isBatting&&game.state.phase==='ready'){
    const key=(game.availablePitches||[])[+event.code.slice(-1)-1];if(key){pitchType=key;updatePitchButtons();}
  }
});
window.addEventListener('keyup',event=>pressed.delete(event.code));
window.addEventListener('blur',()=>{if(!touchMode||document.hidden)resetInput();});
document.addEventListener('visibilitychange',()=>{
  resetInput();resetFrameClock();
  if(document.hidden){if(screen==='game'&&!paused)pauseGame('Paused while you were away. Ready when you are.');audio.suspend();}
});
window.addEventListener('resize',()=>renderer?.resize());
window.addEventListener('orientationchange',()=>{resetInput();resetFrameClock();requestAnimationFrame(()=>renderer?.resize());});

function meterValue(time) {const phase=((time-meter.startedAt)*1.3)%2;return phase<=1?phase:2-phase;}
function lineScoreHTML(s) {
  const max=Math.max(s.inning,game.options.innings),headers=Array.from({length:max},(_,i)=>`<th scope="col">${i+1}</th>`).join('');
  return `<table aria-label="Final line score"><thead><tr><th>CLUB</th>${headers}<th>R</th><th>H</th></tr></thead><tbody>${['BOS','BKN'].map((name,side)=>`<tr><th scope="row">${name}</th>${Array.from({length:max},(_,i)=>`<td>${s.lineScore[side][i]??'–'}</td>`).join('')}<td>${s.score[side]}</td><td>${s.hits[side]}</td></tr>`).join('')}</tbody></table>`;
}
function setTips(title,detail) {text(refs['status-label'],title);text(refs['status-detail'],prefs.guidance==='simple'?detail:'');}
function updateHUD() {
  if(screen!=='game')return;
  const s=game.state,batting=game.isBatting,practice=game.options.mode==='practice',phase=s.phase;
  const phaseChanged=lastPhase!==phase,sideChanged=lastBattingSide!==s.battingSide;
  if(phaseChanged){
    lastPhase=phase;refs['action-button'].classList.remove('pressed');
    if(phase==='ready'){meter.active=false;selectedRunnerId=null;selectedThrowBase=null;preplayPickerSignature='';visible(refs['event-toast'],false);toastUntil=0;}
    if(phase==='live'){
      meter.active=false;selectedThrowBase=null;runnerPickerSignature='';
      if(s.play?.kind==='pickoff')selectedRunnerId=s.runners.find(r=>r.fromBase===s.play.throwBase)?.id??selectedRunnerId;
      else if(s.play?.kind==='steal')selectedRunnerId=s.runners.find(r=>r.id===selectedRunnerId&&r.stealing)?.id??s.runners.find(r=>r.stealing&&!r.out&&!r.scored)?.id??selectedRunnerId;
      else selectedRunnerId=null;
    }
  }
  if(sideChanged){lastBattingSide=s.battingSide;aim={x:0,y:0};meter.active=false;drawAimStick();}
  if(sideChanged||phaseChanged&&phase==='ready')updatePitchButtons();
  refs.app.classList.toggle('is-pitching',!batting);
  refs.app.classList.toggle('is-live',phase==='live');
  visible(refs.scorebug,!practice);visible(refs.practicebug,practice);
  text(refs['inning-label'],`${s.half==='top'?'TOP':'BOT'} ${s.inning}`);
  text(refs['away-score'],s.score[0]);text(refs['home-score'],s.score[1]);text(refs.count,`${s.balls}–${s.strikes}`);
  refs['away-bat'].classList.toggle('active',s.battingSide===0);refs['home-bat'].classList.toggle('active',s.battingSide===1);
  refs.outs.setAttribute('aria-label',`${s.outs} outs`);
  [...refs.outs.querySelectorAll('i')].forEach((dot,i)=>dot.classList.toggle('on',s.outs>i));
  const occupied=[];
  for(const base of document.querySelectorAll('.base-diamond i')){const i=+base.dataset.base-1;const on=!!s.bases[i];base.classList.toggle('occupied',on);if(on)occupied.push(i+1);}
  document.querySelector('.base-diamond').setAttribute('aria-label',occupied.length?`Runners on base ${occupied.join(' and ')}`:'Bases empty');
  text(refs['practice-pitches'],`${s.practice.swings} SWING${s.practice.swings===1?'':'S'}`);text(refs['practice-hits'],s.practice.hits);text(refs['practice-hr'],s.practice.homeRuns);text(refs['practice-best'],Math.round(s.practice.bestDistance*3.28084));
  text(refs.practicebug.querySelector('.score-heading span'),game.options.scenario==='runners'?'BASERUNNING PRACTICE':'BATTING PRACTICE');
  text(refs['role-title'],phase==='live'?(s.play?.fair===false?'FOUL BALL':batting?'RUN THE BASES':'YOU’RE FIELDING'):practice?(game.options.scenario==='runners'?'BASERUNNING PRACTICE':'BATTING PRACTICE'):batting?'YOU’RE AT BAT':'YOU’RE PITCHING');
  const pitcher=game.activePitcher||PITCHERS.balanced;
  text(refs['role-detail'],batting?`Batter ${(s.batterIndex[s.battingSide]%9)+1} · Facing ${pitcher.label||pitcher.name}`:`${pitcher.label||pitcher.name} · ${s.battingSide===0?'Boston':'Brooklyn'} batter ${(s.batterIndex[s.battingSide]%9)+1}`);
  visible(refs['role-banner'],!['result','half','final'].includes(phase));
  const pitchRead=!!s.pitch&&['live','result'].includes(phase);
  visible(refs['pitch-readout'],pitchRead);
  if(pitchRead){text(refs['pitch-name'],PITCHES[s.pitch.type]?.label?.toUpperCase()||s.pitch.type.toUpperCase());text(refs['pitch-speed'],`${Math.round(s.pitch.mph)} MPH`);}
  const active=['ready','windup','pitch'].includes(phase);
  visible(refs.controls,active);
  text(refs['aim-label'],batting?'BAT AIM':'PITCH LOCATION');
  visible(refs['power-button'],batting);
  visible(refs['pitch-selection'],!batting&&phase==='ready');
  visible(refs['pitch-meter'],!batting&&phase==='ready');
  refs['action-button'].classList.toggle('pitching',!batting);
  const canSwing=batting&&['windup','pitch'].includes(phase)&&!s.swing;
  refs['action-button'].disabled=isOnlineBlocked()||(batting?!canSwing:phase!=='ready');
  refs['power-button'].disabled=isOnlineBlocked()||!canSwing;
  text(refs['action-label'],batting?(s.swing?'SWUNG':'SWING'):(meter.active?'RELEASE':'PITCH'));
  text(refs['action-hint'],'SPACE');
  if(!batting&&phase==='ready'){
    meter.value=meter.active?meterValue(s.time):0;
    refs['meter-marker'].style.left=`${meter.value*100}%`;
    text(refs['meter-label'],meter.active?'TAP AGAIN IN THE GOLD':'TAP PITCH TO START');
  }
  const showTiming=batting&&prefs.guidance==='simple'&&phase==='pitch'&&!s.swing;
  visible(refs['timing-cue'],showTiming);
  if(showTiming){const progress=clamp(s.pitch.elapsed/s.pitch.duration,0,1);refs['timing-marker'].style.left=`${progress*100}%`;text(refs['timing-label'],progress>.96?'SWING':'WATCH IT IN');}
  updateLiveControls();
  updatePreplayControls();updateOnlineStatus();
  visible(refs['status-tip'],!['result','half','final'].includes(phase));
  if(phase==='ready'){
    if(batting)setTips('WATCH THE PITCHER','Aim with your left thumb. Swing as the ball reaches the plate.');
    else setTips(meter.active?'HIT THE GOLD':'PICK YOUR PITCH',meter.active?'Tap RELEASE as the marker crosses the gold target.':'Choose a pitch, aim, then tap PITCH to start the meter.');
  }else if(phase==='windup')setTips(batting?'HERE COMES THE PITCH':'DELIVERING',batting?'Stay patient. Let the ball come to the plate.':'Watch the hitter. Your fielders are ready.');
  else if(phase==='pitch'){
    if(batting)setTips(s.swing?'SWING COMMITTED':'READ IT IN',s.swing?'Watch the contact.':'Timing and location both matter. You can let a ball go.');
    else setTips('PITCH ON THE WAY','Your fielders handle the ball once it is in play.');
  }else if(phase==='live'){
    if(s.play?.fair===false)setTips('FOUL BALL','Runners return. Watch the call.');
    else if(batting&&s.play?.caught){
      const runner=selectedRunner();
      setTips(runner?.tagRequired?'BACK TO TAG UP':'CATCH MADE',runner?.tagRequired?'Touch your original base. TAG & GO queues the next base.':'Select a runner and TAG UP to challenge the throw.');
    }else if(batting){
      const runner=selectedRunner(),target=runner?.targetBase||1;
      setTips(target===1?'STRETCH THE HIT':`DESTINATION: ${baseName(target)}`,target===1?'Tap GO 2ND while heading to first to risk a double.':'HOLD stops at the next reachable bag. RETURN goes back when legal.');
    }else setTips(s.play?.stage==='throw'?'THROW IN FLIGHT':s.play?.stage==='held'?'BALL IN HAND':'CHOOSE YOUR PLAY',s.play?.stage==='throw'?'You can queue another base for the next throw.':'Tap a base now to queue the throw. Your fielder will collect the ball.');
  }

  const showResult=['result','half','final'].includes(phase);
  visible(refs['result-card'],showResult);
  if(showResult){
    let title=s.result?.title||'',detail=s.result?.detail||'',kicker='THE CALL',next='NEXT PITCH';
    if(phase==='half'){
      const bottomNext=s.half==='top',nextSide=bottomNext?1:0,willBat=nextSide===(online?.side??0);
      title=willBat?'BACK TO THE PLATE':'TAKE THE FIELD';
      detail=`${bottomNext?'Bottom':'Top'} of inning ${s.inning+(bottomNext?0:1)}. ${willBat?'Read the pitch and find your timing.':'Choose a pitch and work the corners.'}`;
      kicker='THREE OUTS';next=willBat?'STEP IN':'START PITCHING';
    }else if(phase==='final'){
      title=s.result?.winner===0?'HARBOR WINS':'FOUNDRY WINS';
      kicker='FINAL SCORE';next=online?'BACK TO BALLPARK':'PLAY AGAIN';
    }else if(s.pending==='half')next=s.half==='top'?'CHANGE SIDES':'END THE INNING';
    else if(s.pending==='final')next='FINAL SCORE';
    else if(!batting)next='NEXT BATTER / PITCH';
    text(refs['result-title'],String(title).toUpperCase());text(refs['result-detail'],detail);text(refs['result-kicker'],kicker);
    const waiting=online&&online.room?.readySides?.includes(online.side)&&phase!=='final';
    if(waiting)next='WAITING FOR OPPONENT';
    refs['next-button'].disabled=!!waiting||(isOnlineBlocked()&&phase!=='final');
    const labelNode=refs['next-button'].firstChild;if(labelNode.textContent!==`${next} `)labelNode.textContent=`${next} `;
    const c=s.lastContact;
    const feedback=phase==='result'&&!!s.swing&&!!c;
    visible(refs['contact-feedback'],feedback);
    if(feedback){const parts=[c.timingLabel||''];if(c.exitVelocity>0)parts.push(`${c.exitVelocity} MPH EXIT`);if(c.distance>1)parts.push(`${Math.round(c.distance*3.28084)} FT`);text(refs['contact-feedback'],parts.filter(Boolean).join(' · ').toUpperCase());}
    visible(refs['line-score'],phase==='final');visible(refs['final-menu'],phase==='final');
    if(phase==='final'&&phaseChanged)refs['line-score'].innerHTML=lineScoreHTML(s);
  }
  if(toastUntil&&performance.now()>toastUntil){visible(refs['event-toast'],false);toastUntil=0;}
}

function processEvents() {
  for(const event of game.drainEvents()){
    audio.event(event);
    if(event.type==='run')showToast(event.side===0?'HARBOR SCORES':'FOUNDRY SCORES',1.8);
    if(event.type==='contact'&&event.quality>.9)showToast('ON THE BARREL',1.1);
    if(event.type==='out'&&event.base)showToast(`OUT AT ${baseName(event.base)}`,1.5);
    if(event.type==='pickoff')showToast('PICKOFF ATTEMPT',1.3);
    if(event.type==='steal')showToast('RUNNER GOING',1.3);
    if(event.type==='catch'&&game.state.runners.some(r=>!r.out&&!r.scored))showToast(game.isBatting?'CATCH MADE · TAG UP?':'CATCH MADE · CHECK THE RUNNERS',1.8);
    if(event.type==='safe'&&game.isBatting&&event.runnerId===selectedRunnerId){
      const runner=game.state.runners.find(r=>r.id===event.runnerId);
      showToast(`${runner?.targetBase>event.base?'ROUNDING':'SAFE AT'} ${baseName(event.base)}`,1.1);
    }
  }
}
function fail(error) {
  frameError=true;visible(refs.loading,false);visible(refs['error-panel'],true);
  text(refs['error-message'],'The game could not finish loading. Refresh to try again. If this keeps happening, try another browser.');
  console.error('Pocket Baseball:',error);
}

function createCompatibilityRenderer() {
  // A canvas that attempted WebGL cannot reliably be reused for a 2D context.
  const oldCanvas=$('ballpark'),canvas=oldCanvas.cloneNode(false);
  oldCanvas.replaceWith(canvas);
  rendererKind='compatibility';
  visible($('renderer-note'),true);
  return new CompatibilityRenderer(canvas);
}
try {
  if(new URLSearchParams(location.search).get('software')==='1')renderer=createCompatibilityRenderer();
  else {
    try {
      renderer=new BallparkRenderer($('ballpark'),{onContextLost:()=>pauseGame('Graphics paused. Wait a moment, then resume the game.')});
    } catch {
      console.info('Pocket Baseball: WebGL unavailable; using the compatibility renderer.');
      renderer=createCompatibilityRenderer();
    }
  }
  renderer.setQuality(prefs.quality);renderer.resize();
  visible(refs.loading,false);
}catch(error){fail(error);}

function frame(now){
  requestAnimationFrame(frame);
  if(frameError||!renderer)return;
  const dt=clamp((now-lastFrame)/1000,0,.10);lastFrame=now;
  try{
    if(screen==='game'&&!paused&&!isOnlineBlocked()){
      if(aimPointer===null){
        const dx=(pressed.has('ArrowRight')||pressed.has('KeyD')?1:0)-(pressed.has('ArrowLeft')||pressed.has('KeyA')?1:0);
        const dy=(pressed.has('ArrowUp')||pressed.has('KeyW')?1:0)-(pressed.has('ArrowDown')||pressed.has('KeyS')?1:0);
        if(dx||dy){aim.x=clamp(aim.x+dx*dt*1.8,-1,1);aim.y=clamp(aim.y+dy*dt*1.8,-1,1);drawAimStick();}
      }
      if(online)online.update(dt);else game.update(dt);
      processEvents();updateHUD();
    }
    if(screen==='game'&&online&&(paused||isOnlineBlocked())){online.update(0);processEvents();updateHUD();}
    renderer.render(game.state,dt,{menu:screen==='menu',paused:paused||isOnlineBlocked(),guidance:prefs.guidance,aim:{...aim},quality:prefs.quality,interpolationAlpha:game.interpolationAlpha,batting:game.isBatting,selectedRunnerId});
  }catch(error){fail(error);}
}
requestAnimationFrame(frame);

// Explicit local inspection hook; it is absent in an ordinary player session.
if(new URLSearchParams(location.search).has('debug'))window.__baseball={
  get game(){return game;},get renderer(){return renderer;},get rendererKind(){return rendererKind;},get paused(){return paused;},get screen(){return screen;},get aim(){return {...aim};},get selectedRunnerId(){return selectedRunnerId;},
  startGame,pauseGame,resumeGame,returnHome,updateHUD,triggerAction,controlRunner,throwToBase,
};
