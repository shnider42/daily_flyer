import { BaseballGame, PITCHES, STEP } from './engine.mjs';
import { BallparkRenderer } from './renderer.mjs';
import { CompatibilityRenderer } from './fallback-renderer.mjs';
import { BallparkAudio } from './audio.mjs';

const $ = id => document.getElementById(id);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const text = (element, value) => { const next = String(value); if (element.textContent !== next) element.textContent = next; };
const visible = (element, show) => { if (element.hidden === show) element.hidden = !show; };
const defaults = { innings: 3, difficulty: 'rookie', guidance: 'simple', sound: true, quality: 'auto' };
let saved = {};
try { saved = JSON.parse(localStorage.getItem('dfe.baseball.preferences.v1') || '{}') || {}; } catch { /* Private browsing can decline persistence. */ }
const prefs = {
  innings: [3, 6, 9].includes(+saved.innings) ? +saved.innings : defaults.innings,
  difficulty: ['rookie', 'club', 'pro'].includes(saved.difficulty) ? saved.difficulty : defaults.difficulty,
  guidance: ['simple', 'moderate', 'expert'].includes(saved.guidance) ? saved.guidance : defaults.guidance,
  sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
  quality: ['auto', 'low', 'high'].includes(saved.quality) ? saved.quality : defaults.quality,
};
function savePrefs() { try { localStorage.setItem('dfe.baseball.preferences.v1', JSON.stringify(prefs)); } catch {} }

const refs = Object.fromEntries([
  'app','home-screen','game-ui','loading','error-panel','error-message','scorebug','practicebug','inning-label','away-score','home-score','away-bat','home-bat','count','outs',
  'practice-pitches','practice-hits','practice-hr','practice-best','role-banner','role-title','role-detail','pitch-readout','pitch-name','pitch-speed','timing-cue','timing-marker','timing-label',
  'status-tip','status-label','status-detail','controls','aim-label','aim-pad','aim-stick','pitch-selection','pitch-meter','meter-marker','meter-label','power-button','action-button','action-label','action-hint','throw-button',
  'result-card','result-kicker','result-title','result-detail','contact-feedback','next-button','final-menu','line-score','event-toast','pause-dialog','pause-reason','help-dialog',
  'sound-button','pause-button','help-button','innings','difficulty','guidance','pause-guidance','quality','setup-note',
].map(id => [id, $(id)]));
const audio = new BallparkAudio(prefs.sound);
let renderer, rendererKind = 'webgl', game = new BaseballGame({ ...prefs, mode: 'exhibition', seed: 2003 });
let screen = 'menu', paused = false, helpOrigin = null, lastFrame = performance.now();
let aim = { x: 0, y: 0 }, aimPointer = null, pitchType = 'fastball', meter = { active: false, startedAt: 0, value: 0 };
let lastPhase = null, lastBattingSide = null, toastUntil = 0, frameError = false;
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

function startGame(mode = 'exhibition') {
  const seed = (Date.now() ^ Math.floor(performance.now()*1000)) >>> 0;
  prefs.innings = +refs.innings.value; prefs.difficulty = refs.difficulty.value; prefs.guidance = refs.guidance.value;
  savePrefs();
  game = new BaseballGame({ seed, innings: prefs.innings, difficulty: prefs.difficulty, guidance: prefs.guidance, mode });
  aim = { x: 0, y: 0 }; meter.active = false; pitchType = 'fastball';
  screen = 'game'; paused = false; lastPhase = null; lastBattingSide = null; toastUntil = 0;
  resetInput(); resetFrameClock();
  refs.app.classList.remove('is-menu');
  visible(refs['home-screen'], false); visible(refs['game-ui'], true); visible(refs['event-toast'], false);
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
  if (refs['help-dialog'].open) refs['help-dialog'].close();
  applyGuidance(prefs.guidance); updatePitchButtons(); updateHUD();
  audio.unlock().then(() => audio.organ());
  refs['pause-button'].focus({ preventScroll: true });
  refs['pause-button'].blur();
}
function returnHome() {
  screen = 'menu'; paused = false; helpOrigin = null; meter.active = false;
  resetInput(); resetFrameClock();
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
  if (refs['help-dialog'].open) refs['help-dialog'].close();
  visible(refs['home-screen'], true); visible(refs['game-ui'], false);
  refs.app.classList.add('is-menu'); refs.app.classList.remove('is-pitching');
  game = new BaseballGame({ ...prefs, mode: 'exhibition', seed: 2003 });
  $('start-exhibition').focus({ preventScroll: true });
}
function pauseGame(reason = 'Take your time. The next pitch can wait.', showDialog = true) {
  if (screen !== 'game') return;
  paused = true; resetInput(); resetFrameClock();
  text(refs['pause-reason'], reason);
  if (showDialog && !refs['pause-dialog'].open && !refs['help-dialog'].open) refs['pause-dialog'].showModal();
}
function resumeGame() {
  if (screen !== 'game') return;
  paused = false; resetInput(); resetFrameClock();
  if (refs['pause-dialog'].open) refs['pause-dialog'].close();
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
refs.innings.addEventListener('change', () => { prefs.innings=+refs.innings.value;savePrefs(); });
refs.difficulty.addEventListener('change', () => { prefs.difficulty=refs.difficulty.value;savePrefs(); });
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
  for (const button of refs['pitch-selection'].querySelectorAll('button')) {
    const selected = button.dataset.pitch === pitchType;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
}
for (const button of refs['pitch-selection'].querySelectorAll('button')) {
  const choose = event => {
    if (screen !== 'game' || paused || game.state.phase !== 'ready' || game.isBatting) return;
    event.preventDefault(); pitchType = button.dataset.pitch; updatePitchButtons(); audio.unlock();
  };
  button.addEventListener('pointerdown', choose);
  button.addEventListener('click', event => { if (event.detail === 0) choose(event); });
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
  if(screen!=='game'||paused||refs['help-dialog'].open||refs['pause-dialog'].open)return;
  audio.unlock();
  const s=game.state;
  if(s.phase==='result'||s.phase==='half'){nextPlay();return;}
  if(s.phase==='final'){startGame(game.options.mode);return;}
  if(s.phase==='live'&&!game.isBatting&&s.play?.stage==='held'){game.command({type:'throw',base:1});return;}
  if(game.isBatting){
    if(['windup','pitch'].includes(s.phase)&&!s.swing){
      const accepted=game.command({type:'swing',power,aim:{...aim},time:eventSimulationTime(event)});
      if(accepted){audio.whoosh();refs['action-button'].classList.add('pressed');}
    }
  }else if(s.phase==='ready'){
    if(!meter.active){meter={active:true,startedAt:s.time,value:0};}
    else{
      meter.value = meterValue(s.time);
      const quality=clamp(1-Math.abs(meter.value-.845)/.47,0,1);
      const accepted=game.command({type:'pitch',pitchType,aim:{...aim},quality});
      if(accepted){meter.active=false;showToast(quality>.9?'GREAT RELEASE':quality>.68?'GOOD RELEASE':'MISSED THE RELEASE',1.2);}
    }
  }
  updateHUD();
}
function nextPlay() {
  if(screen!=='game'||paused)return;
  audio.unlock();
  if(game.state.phase==='final'){startGame(game.options.mode);return;}
  game.command({type:'next'});
  // The between-innings card is deliberately kept separate from the third-out call.
  meter.active=false; resetInput(); resetFrameClock(); updateHUD();
}
refs['next-button'].addEventListener('click', nextPlay);
refs['action-button'].addEventListener('pointerdown', event => {event.preventDefault();triggerAction(event,false);});
refs['power-button'].addEventListener('pointerdown', event => {event.preventDefault();triggerAction(event,true);});
refs['throw-button'].addEventListener('pointerdown', event => {event.preventDefault();triggerAction(event,false);});
// Native keyboard/assistive clicks have no pointerdown. Pointer clicks are already handled.
refs['action-button'].addEventListener('click', event => {if(event.detail===0)triggerAction(event,false);});
refs['power-button'].addEventListener('click', event => {if(event.detail===0)triggerAction(event,true);});
refs['throw-button'].addEventListener('click', event => {if(event.detail===0)triggerAction(event,false);});

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
  if(screen!=='game'||paused||refs['help-dialog'].open)return;
  // Let a focused button retain its normal Enter/Space activation semantics.
  if(['Space','Enter'].includes(event.code)&&event.target instanceof Element&&event.target.closest('button'))return;
  const codes=['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Enter','Digit1','Digit2','Digit3','Digit4'];
  if(!codes.includes(event.code))return;
  event.preventDefault();
  if(event.repeat)return;
  pressed.add(event.code);
  if(event.code==='Space')triggerAction(event,pressed.has('ShiftLeft')||pressed.has('ShiftRight'));
  else if(event.code==='ShiftLeft'||event.code==='ShiftRight'){if(game.isBatting)triggerAction(event,true);}
  else if(event.code==='Enter'&&['result','half','final'].includes(game.state.phase))nextPlay();
  else if(event.code.startsWith('Digit')&&!game.isBatting&&game.state.phase==='ready'){
    pitchType=['fastball','changeup','curveball','slider'][+event.code.slice(-1)-1];updatePitchButtons();
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
    if(phase==='ready'){meter.active=false;visible(refs['event-toast'],false);toastUntil=0;}
    if(phase==='live')meter.active=false;
  }
  if(sideChanged){lastBattingSide=s.battingSide;aim={x:0,y:0};meter.active=false;drawAimStick();}
  refs.app.classList.toggle('is-pitching',!batting);
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
  text(refs['role-title'],practice?'BATTING PRACTICE':batting?'YOU’RE AT BAT':'YOU’RE PITCHING');
  text(refs['role-detail'],batting?`Boston Harbor · Batter ${(s.batterIndex[0]%9)+1}`:`Facing Brooklyn · Batter ${(s.batterIndex[1]%9)+1}`);
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
  refs['action-button'].disabled=batting?!canSwing:phase!=='ready';
  refs['power-button'].disabled=!canSwing;
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
  visible(refs['throw-button'],!batting&&phase==='live'&&s.play?.stage==='held');
  visible(refs['status-tip'],!['result','half','final'].includes(phase));
  if(phase==='ready'){
    if(batting)setTips('WATCH THE PITCHER','Aim with your left thumb. Swing as the ball reaches the plate.');
    else setTips(meter.active?'HIT THE GOLD':'PICK YOUR PITCH',meter.active?'Tap RELEASE as the marker crosses the gold target.':'Choose a pitch, aim, then tap PITCH to start the meter.');
  }else if(phase==='windup')setTips(batting?'HERE COMES THE PITCH':'DELIVERING',batting?'Stay patient. Let the ball come to the plate.':'Watch the hitter. Your fielders are ready.');
  else if(phase==='pitch'){
    if(batting)setTips(s.swing?'SWING COMMITTED':'READ IT IN',s.swing?'Watch the contact.':'Timing and location both matter. You can let a ball go.');
    else setTips('PITCH ON THE WAY','Your fielders handle the ball once it is in play.');
  }else if(phase==='live')setTips(s.play?.stage==='throw'?'THROW TO FIRST':s.play?.stage==='held'?'BALL FIELDED':'BALL IN PLAY',batting?'Running is assisted. Follow the play.':s.play?.stage==='held'?'Tap THROW TO 1ST for an early release.':'Fielders pursue the ball. Get ready for the throw.');

  const showResult=['result','half','final'].includes(phase);
  visible(refs['result-card'],showResult);
  if(showResult){
    let title=s.result?.title||'',detail=s.result?.detail||'',kicker='THE CALL',next='NEXT PITCH';
    if(phase==='half'){
      const bottomNext=s.half==='top';
      title=bottomNext?'TAKE THE FIELD':'BACK TO THE PLATE';
      detail=bottomNext?`Bottom of inning ${s.inning}. Choose a pitch and work the corners.`:`Top of inning ${s.inning+1}. Boston Harbor is up.`;
      kicker='THREE OUTS';next=bottomNext?'START PITCHING':'STEP IN';
    }else if(phase==='final'){
      title=s.result?.winner===0?'HARBOR WINS':'FOUNDRY WINS';
      kicker='FINAL SCORE';next='PLAY AGAIN';
    }else if(s.pending==='half')next=s.half==='top'?'CHANGE SIDES':'END THE INNING';
    else if(s.pending==='final')next='FINAL SCORE';
    else if(!batting)next='NEXT BATTER / PITCH';
    text(refs['result-title'],String(title).toUpperCase());text(refs['result-detail'],detail);text(refs['result-kicker'],kicker);
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
    if(screen==='game'&&!paused){
      if(aimPointer===null){
        const dx=(pressed.has('ArrowRight')||pressed.has('KeyD')?1:0)-(pressed.has('ArrowLeft')||pressed.has('KeyA')?1:0);
        const dy=(pressed.has('ArrowUp')||pressed.has('KeyW')?1:0)-(pressed.has('ArrowDown')||pressed.has('KeyS')?1:0);
        if(dx||dy){aim.x=clamp(aim.x+dx*dt*1.8,-1,1);aim.y=clamp(aim.y+dy*dt*1.8,-1,1);drawAimStick();}
      }
      game.update(dt);processEvents();updateHUD();
    }
    renderer.render(game.state,dt,{menu:screen==='menu',paused,guidance:prefs.guidance,aim:{...aim},quality:prefs.quality,interpolationAlpha:game.interpolationAlpha,batting:game.isBatting});
  }catch(error){fail(error);}
}
requestAnimationFrame(frame);

// Explicit local inspection hook; it is absent in an ordinary player session.
if(new URLSearchParams(location.search).has('debug'))window.__baseball={
  get game(){return game;},get renderer(){return renderer;},get rendererKind(){return rendererKind;},get paused(){return paused;},get screen(){return screen;},get aim(){return {...aim};},
  startGame,pauseGame,resumeGame,returnHome,updateHUD,triggerAction,
};
