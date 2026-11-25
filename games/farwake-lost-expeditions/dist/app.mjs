import { SCENES, RECORDS, RECORD_ORDER, CHAPTER } from './content.mjs';
import { initialState, hydrateState, perform, availableActions, getEnding, sceneDescription } from './state.mjs';
import { NightglassAudio } from './audio.mjs?v=0.3.3';
import { MENU_THEME } from './menu-theme.mjs';
import { mobileActions, mobileLabel } from './mobile-actions.mjs';
import { missionStatus, MISSION_BRIEF } from './mission.mjs';
import { sceneObservations, sceneObservationLead, evidenceCards, EVIDENCE_QUESTIONS, assessEvidence } from './investigation.mjs';

const SAVE_KEY = 'farwake.lost-expeditions.nightglass.v1';
const PREF_KEY = 'farwake.lost-expeditions.preferences.v1';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const rawSave = readLocal(SAVE_KEY);
let state = hydrateState(rawSave);
const rawPrefs = readLocal(PREF_KEY) || {};
const preferences = {
  sound: typeof rawPrefs.sound === 'boolean' ? rawPrefs.sound : true,
  volume: Number.isFinite(rawPrefs.volume) ? Math.max(0, Math.min(1, rawPrefs.volume)) : 0.5,
  music: typeof rawPrefs.music === 'boolean' ? rawPrefs.music : true,
  musicVolume: Number.isFinite(rawPrefs.musicVolume) ? Math.max(0, Math.min(1, rawPrefs.musicVolume)) : 0.65,
  markers: typeof rawPrefs.markers === 'boolean' ? rawPrefs.markers : true,
  labels: typeof rawPrefs.labels === 'boolean' ? rawPrefs.labels : true,
  reducedMotion: typeof rawPrefs.reducedMotion === 'boolean' ? rawPrefs.reducedMotion : matchMedia('(prefers-reduced-motion: reduce)').matches
};
const sound = new NightglassAudio({ enabled: preferences.sound, volume: preferences.volume, musicEnabled: preferences.music, musicVolume: preferences.musicVolume });
let active = false;
let entryToken = 0;
let audioAvailable = true;
let sceneToken = 0;
let lastScene = null;
let pan = 0;
let geometry = null;
let currentActions = [];
let toastTimer, captionTimer;
let hintOpen = false;
let panelReturn = null;
const compactMedia = matchMedia('(max-width: 800px), (max-height: 520px) and (max-width: 1000px)');
let compact = compactMedia.matches;
let latestFeedback = null;
let travelReadyAt = 0;
const image = $('#scene-image');
const stage = $('#stage');
const panel = $('#panel');
const fieldControls = $('.field-controls');
document.body.classList.toggle('compact-layout', compact);
fieldControls.open = !compact;

// Anchors are in the source photograph's coordinate system. Movement also has a
// persistent button, so a cropped panoramic edge never hides the way home.
const ANCHORS = {
  'read-dispatch':[43,63], 'check-return':[25,54],
  'take-photo':[28,33], 'read-survey-log':[65,62],
  'read-maintenance':[25,44], 'open-panel':[42,54],
  'power-inspection':[48,51], 'power-receiver':[69,48],
  'listen-receiver':[24,47], 'inspect-cable':[39,42],
  'compare-signal':[54,40], 'mute-receiver':[24,51],
  'redirect-receiver':[71,43], 'recover-recorder':[65,59],
  'publish-warning':[48,54], 'finish':[50,45]
};

// Scene directions are separate from optional object markers. "Back" follows
// the station's fixed geography, so revisiting a room never reverses the exits.
const DIRECTIONS = {
  approach: {
    airlock: { x:55, y:54, direction:'forward', label:'Airlock' },
    beacon: { x:88, y:58, direction:'right', label:'Beacon' }
  },
  airlock: {
    junction: { x:53, y:53, direction:'forward', label:'Inside' },
    approach: { direction:'back', label:'Surface' }
  },
  junction: {
    survey: { x:13, y:48, direction:'left', label:'Survey room' },
    service: { x:87, y:48, direction:'right', label:'Service bay' },
    shaft: { x:50, y:75, direction:'down', label:'Listening shaft' },
    airlock: { direction:'back', label:'Airlock' }
  },
  survey: { junction: { direction:'back', label:'Junction' } },
  service: { junction: { x:93, y:54, direction:'right', label:'Junction' } },
  shaft: {
    lower: { x:54, y:72, direction:'down', label:'Lower landing' },
    junction: { direction:'back', label:'Junction' }
  },
  lower: { shaft: { x:24, y:46, direction:'forward', label:'Up to shaft' } },
  beacon: { approach: { x:89, y:42, direction:'forward', label:'Station' } }
};
const DIRECTION_PATHS = {
  forward:'M12 20V4m-7 7 7-7 7 7',
  down:'M12 4v16m-7-7 7 7 7-7',
  left:'M20 12H4m7-7-7 7 7 7',
  right:'M4 12h16m-7-7 7 7-7 7',
  back:'M9 4 4 9l5 5M4 9h9a7 7 0 0 1 0 14'
};

function directionButton(action,nextId){
  const route=DIRECTIONS[state.scene]?.[action.target];
  if(!route)return null;
  const button=document.createElement('button');
  button.type='button';button.dataset.action=action.id;
  button.className=`scene-direction direction-${route.direction}${action.id===nextId?' suggested':''}`;
  button.setAttribute('aria-label',action.label+(action.disabled?' · not yet available':''));
  button.title=action.label;
  if(action.disabled){button.setAttribute('aria-disabled','true');button.title=action.reason;}
  if(route.direction!=='back'){button.dataset.x=route.x;button.dataset.y=route.y;}
  button.innerHTML=`<svg viewBox="0 0 24 26" aria-hidden="true"><path d="${DIRECTION_PATHS[route.direction]}"/></svg><span class="direction-label">${escape(route.label)}</span>${action.disabled?'<span class="direction-lock" aria-hidden="true"><svg viewBox="0 0 16 18"><path d="M4 7V5a4 4 0 0 1 8 0v2M2 7h12v9H2z"/></svg></span>':''}`;
  return button;
}

function hasProgress(){ return state.moves > 0 || state.records.length > 0 || state.completed; }
function persist(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); $('#save-status').textContent='Saved on this device'; }
  catch { $('#save-status').textContent='Saving unavailable · keep this tab open'; }
  updateIntro();
}
function savePreferences(){
  try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch { /* Gameplay remains available. */ }
  applyPreferences();
}
function applyPreferences(){
  document.body.classList.toggle('hide-markers', !preferences.markers);
  document.body.classList.toggle('show-labels', preferences.labels);
  document.body.classList.toggle('reduced-motion', preferences.reducedMotion);
  sound.setEnabled(preferences.sound);
  sound.setVolume(preferences.volume);
  sound.setMusicEnabled(preferences.music);
  sound.setMusicVolume(preferences.musicVolume);
  $('#sound-status').textContent=!preferences.sound?'Sound off · all clues remain readable':!audioAvailable?'Audio unavailable · written clues active':'Sound on · captions included';
  updateMusicControls();
}
function updateIntro(){
  $('#begin-button').textContent=state.completed?'Read your expedition report':hasProgress()?'Continue expedition':'Begin expedition';
  $('#intro-restart').hidden=!hasProgress();
  updateMusicControls();
}
function updateMusicControls(){
  const music=sound.musicStatus();
  const running=music.mode==='menu'&&['playing','loading'].includes(music.status);
  const button=$('#menu-music-button');
  button.textContent=running?'Stop theme':'Listen to theme';
  button.setAttribute('aria-pressed',String(running));
  button.dataset.playback=music.status;
  $('#menu-music-title').textContent=MENU_THEME.title;
  $('#menu-music-credit').textContent=MENU_THEME.credit;
  const messages={
    ready:'Music starts when you choose Listen.',
    loading:'Loading the Farwake theme…',
    playing:music.mode==='report'?'Farwake theme · closing reprise':'Farwake theme · playing',
    paused:'Music paused.',
    waiting:'The closing theme follows the recovery cue.',
    quiet:'During the investigation: station sounds and the receiver.',
    muted:!music.masterEnabled||music.masterVolume===0?'All sound is muted.':'Music level is at zero.',
    off:'Music is off.',
    ended:'The closing theme has finished.',
    blocked:active?'Music could not start. Tap Retry music to try again.':'Music could not start. Tap Listen to try again.',
    error:active?'The music could not load. Tap Retry music to try again.':'The music could not load. Tap Listen to try again.'
  };
  const notice=$('#menu-music-status');
  notice.hidden=!['loading','blocked','error'].includes(music.status);
  notice.textContent=messages[music.status]||'';
  const status=$('#music-status');
  if(status){status.textContent=messages[music.status]||'';status.dataset.playback=music.status;}
  const retry=$('#music-retry');
  if(retry)retry.hidden=!['blocked','error'].includes(music.status);
}
async function listenToTheme(){
  const music=sound.musicStatus();
  if(music.mode==='menu'&&['playing','loading'].includes(music.status)){
    preferences.music=false;savePreferences();return;
  }
  // Listen is an explicit request for audible music, including after a saved mute.
  preferences.sound=true;preferences.music=true;
  if(preferences.volume===0)preferences.volume=0.5;
  if(preferences.musicVolume===0)preferences.musicVolume=0.65;
  sound.setMode('menu');savePreferences();
  const starting=sound.start();updateMusicControls();
  audioAvailable=await starting;updateMusicControls();
}
$('#menu-music-button').addEventListener('click',listenToTheme);
document.addEventListener('farwake-music-status',updateMusicControls);
for(const type of ['playing','pause','ended','waiting','error','loadedmetadata','canplay']){
  document.addEventListener(type,event=>{if(event.target.id==='farwake-theme-audio')updateMusicControls();},true);
}
function toast(message){
  clearTimeout(toastTimer);
  $('#toast').textContent=message; $('#toast').hidden=false;
  toastTimer=setTimeout(()=>{$('#toast').hidden=true;},6500);
}
function caption(message,duration=6500){
  latestFeedback=message?{message,expanded:false}:null;
  renderFeedback();
  clearTimeout(captionTimer); $('#scene-caption').textContent=message || '';
  if(message) captionTimer=setTimeout(()=>{$('#scene-caption').textContent='';latestFeedback=null;renderFeedback();},duration);
}
function renderFeedback(){
  const el=$('#mobile-feedback');
  el.hidden=!compact||!latestFeedback;
  el.textContent=latestFeedback?.message||'';
}
function openPanel(kicker,title,html){
  if(!panel.open)panelReturn=document.activeElement;
  latestFeedback=null;renderFeedback();clearTimeout(captionTimer);$('#scene-caption').textContent='';
  $('#panel-kicker').textContent=kicker;
  $('#panel-title').textContent=title;
  $('#panel-body').innerHTML=html;
  if(!panel.open)panel.showModal();
  panel.scrollTop=0;
  $('#panel-body').scrollTop=0;
  $('#panel-done').textContent=active?`Back to ${SCENES[state.scene].title.toLowerCase()}`:'Close';
  $('#panel-done').dataset.panelAction='close';
  $('#panel-done').className='secondary-button';
  $('#panel-title').tabIndex=-1;
  $('#panel-title').focus({preventScroll:true});
}
function closePanel(){ panel.close(); }
panel.addEventListener('close',()=>{
  if(panelReturn?.isConnected&&panelReturn.tabIndex>=0&&!panelReturn.matches(':disabled')&&!panel.contains(panelReturn)&&panelReturn.getClientRects().length&&!panelReturn.closest('details:not([open])'))panelReturn.focus({preventScroll:true});
  else if(active)stage.focus({preventScroll:true});
});
$('#close-panel').addEventListener('click',closePanel);
panel.addEventListener('click',event=>{if(event.target===panel){const b=panel.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closePanel();}});

function positionScene(){
  const rect=stage.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const iw=image.naturalWidth||1672, ih=image.naturalHeight||941;
  const scale=(compact?Math.min:Math.max)(rect.width/iw,rect.height/ih);
  const width=iw*scale,height=ih*scale;
  const maxPan=Math.max(0,(width-rect.width)/2);
  pan=Math.max(-maxPan,Math.min(maxPan,pan));
  const left=(rect.width-width)/2+pan;
  const top=(rect.height-height)/2;
  const topClearance=compact?$('.topbar').getBoundingClientRect().height+4:48;
  const bottomClearance=compact?$('#mobile-task').getBoundingClientRect().height+parseFloat(getComputedStyle(fieldControls).paddingBottom)+10:10;
  Object.assign(image.style,{width:`${width}px`,height:`${height}px`,left:`${left}px`,top:`${top}px`});
  geometry={width,height,left,top,maxPan};
  const closer=$('#look-closer');
  const controlBottom=Math.max(bottomClearance,rect.height-(top+height)+8);
  if(compact){
    closer.style.bottom=`${controlBottom}px`;
    closer.style.right=`${Math.max(8,rect.width-left-width+8)}px`;
  }else{
    closer.style.removeProperty('bottom');closer.style.removeProperty('right');
  }
  const directionBounds=[];
  for(const el of $('#scene-directions').children){
    if(el.dataset.x){
      const halfWidth=el.offsetWidth/2,halfHeight=el.offsetHeight/2;
      const x=Math.max(halfWidth+8,Math.min(rect.width-halfWidth-8,Number(el.dataset.x)/100*width+left));
      const y=Math.max(halfHeight+topClearance,Math.min(rect.height-halfHeight-bottomClearance,Number(el.dataset.y)/100*height+top));
      el.style.left=`${x}px`;el.style.top=`${y}px`;
    }else if(compact){
      el.style.left=`${Math.max(8,left+8)}px`;el.style.bottom=`${controlBottom}px`;
    }
    directionBounds.push(el.getBoundingClientRect());
  }
  const occupied=[];
  for(const el of $('#scene-hotspots').children){
    const x=Number(el.dataset.x)/100*width+left,y=Number(el.dataset.y)/100*height+top;
    el.style.left=`${x}px`;el.style.top=`${y}px`;
    el.classList.toggle('label-below',compact?y<rect.height*.55:['listen-receiver','power-receiver'].includes(el.dataset.action));
    const crowded=compact&&occupied.some(point=>Math.abs(x-point.x)<52&&Math.abs(y-point.y)<52);
    el.hidden=x<24||x>rect.width-24||y<(compact?topClearance+24:75)||y>rect.height-(compact?bottomClearance+22:35)||crowded;
    if(compact&&!el.hidden){
      const overlaps=(a,b)=>a.left<b.right+4&&a.right>b.left-4&&a.top<b.bottom+4&&a.bottom>b.top-4;
      // Phone labels are only shown on keyboard focus; reserve the actual tap
      // targets instead of hiding objects behind their invisible label bounds.
      el.hidden=[...directionBounds,closer.getBoundingClientRect()].some(control=>overlaps(el.getBoundingClientRect(),control));
    }
    if(!el.hidden)occupied.push({x,y});
  }
  $('#view-instruction').textContent=state.completed?'Recovery complete · review your notebook':maxPan>20?'Arrows move · dots inspect · drag to look':'Tap a direction to move · dots inspect';
}
new ResizeObserver(positionScene).observe(stage);
image.addEventListener('load',positionScene);

function actionButton(action,hotspot=false){
  const button=document.createElement('button');
  button.type='button';button.dataset.action=action.id;
  if(action.disabled)button.setAttribute('aria-disabled','true');
  if(hotspot){
    button.className=`hotspot ${action.kind}${['listen-receiver','power-receiver'].includes(action.id)?' label-below':''}`;
    button.setAttribute('aria-label',action.label+(action.disabled?' · not yet available':''));
    button.title=action.disabled?action.reason:action.label;
    const [x,y]=ANCHORS[action.id]||[action.x??50,action.y??60];
    button.dataset.x=x;button.dataset.y=y;
    button.innerHTML=`<span class="pin" aria-hidden="true"></span><span class="hotspot-label">${escape(compact?mobileLabel(action):action.label)}</span>`;
  }else{
    button.className=`action-button ${action.kind}`;
    if(compact){
      const lock=action.disabled?'<span class="action-lock" aria-hidden="true">◇</span>':'';
      button.innerHTML=`<span class="action-label">${lock}${escape(action.label)}</span>${action.disabled?'<small>Tap to see what’s needed</small>':''}`;
    }else button.textContent=action.label;
    if(action.disabled)button.title=action.reason||'Inspect the nearby evidence first.';
  }
  return button;
}
function renderActions(){
  currentActions=availableActions(state);
  const touch=mobileActions(state,currentActions);
  const interactions=$('#interactions'),routes=$('#routes'),hotspots=$('#scene-hotspots'),directions=$('#scene-directions');
  interactions.replaceChildren();routes.replaceChildren();hotspots.replaceChildren();directions.replaceChildren();
  const task=missionStatus(state);
  const next=currentActions.find(a=>a.id===task.nextActionId&&!a.disabled);
  const primary=$('#primary-action');
  primary.hidden=(!next&&!state.completed)||(compact&&next?.kind==='move');
  primary.textContent=state.completed?'Read your expedition report':next?.label||'';
  if(next)primary.dataset.action=next.id;else delete primary.dataset.action;
  const presented=[...touch.interactions,...touch.routes];
  const physical=touch.hotspots.filter(a=>!['read-dispatch','compare-signal','finish'].includes(a.id)).sort((a,b)=>Number(b.id===task.nextActionId)-Number(a.id===task.nextActionId));
  const hotspotIds=new Set((compact?physical.slice(0,2):physical).map(a=>a.id));
  for(const action of presented){
    if(action.id!==next?.id||(compact&&action.kind==='move'))(action.kind==='move'?routes:interactions).append(actionButton(action));
  }
  for(const action of touch.routes){const button=directionButton(action,task.nextActionId);if(button)directions.append(button);}
  $('#move-content').open=!compact;
  for(const action of physical)if(hotspotIds.has(action.id))hotspots.append(actionButton(action,true));
  $('.inspection-group').hidden=!interactions.children.length;
  $('.route-group').hidden=!routes.children.length;
  for(const el of document.querySelectorAll('.action-button'))el.classList.toggle('suggested',el.dataset.action===task.nextActionId);
  positionScene();
}
function render(){
  const scene=SCENES[state.scene];
  $('#header-location').textContent=scene.title.toUpperCase();
  $('#mobile-location').textContent=scene.title;
  $('#scene-subtitle').textContent=scene.subtitle.toUpperCase();
  $('#scene-title').textContent=scene.title;
  image.alt=sceneDescription(state);
  $('#record-count').textContent=state.records.length;
  $('#journal-button').setAttribute('aria-label',`Open field notebook · ${state.records.length} records`);
  const task=missionStatus(state);
  $('#mobile-task-label').textContent=task.title;
  $('#mobile-task').setAttribute('aria-label',`Task: ${task.title}. Assignment and available actions`);
  const phases={recover:'Recover the field recorder',warn:'Warn the next crew',return:'Return to the airlock',complete:'Recovery complete'};
  $('#objective-phase').textContent=task.phase==='complete'?'EXPEDITION RECORD':'YOUR ASSIGNMENT';
  $('#objective-title').textContent=state.flags.signalCompared&&!state.receiverMode?'Control the repeated call':phases[task.phase];
  $('#objective-text').textContent=task.nextScene!==state.scene&&task.nextScene!==task.destination
    ? `Continue through ${SCENES[task.nextScene].title.toLowerCase().replace(/^(?!the )/,'the ')} to ${SCENES[task.destination].title.toLowerCase().replace(/^(?!the )/,'the ')}.`
    : task.text;
  $('#scene-observation').textContent=sceneObservationLead(state);
  $('#hint-box').textContent=task.hint;$('#hint-box').hidden=!hintOpen;
  $('#hint-button').textContent='Help';
  document.body.classList.toggle('inspection-on',!!state.flags.inspectionPowered&&['junction','service','shaft','lower'].includes(state.scene));
  $('#scene-status').textContent=state.completed?'EXPEDITION RECOVERED':state.receiverMode==='mute'?'RECEIVER ISOLATED':state.receiverMode==='redirect'?'RETURN ROUTE LIT':'RETURN ROUTE AVAILABLE';
  renderActions();
  sound.setScene(state.scene,state);
  if(lastScene!==state.scene){
    lastScene=state.scene;pan=0;
    const token=++sceneToken,source=`assets/${scene.image}.webp`;
    stage.classList.add('changing');
    const preload=new Image();
    preload.onload=()=>{if(token!==sceneToken)return;image.src=source;stage.style.setProperty('--scene-backdrop',`url("${source}")`);stage.classList.remove('changing');$('#scene-loading').hidden=true;requestAnimationFrame(positionScene);};
    preload.onerror=()=>{if(token!==sceneToken)return;stage.classList.remove('changing');$('#scene-loading').hidden=true;toast('This view could not load. Your progress is safe; reload to try again.');};
    preload.src=source;
    setTimeout(()=>{if(token===sceneToken&&!preload.complete)$('#scene-loading').hidden=false;},400);
    latestFeedback=null;renderFeedback();$('#scene-caption').textContent='';
  }
  updateIntro();
}

async function begin(){
  const token=++entryToken;
  active=true;$('#intro').hidden=true;
  $('#game').inert=false;
  fieldControls.open=!compact;
  // An old report stays quiet; only a newly completed recovery earns its reprise.
  sound.setMode('expedition');
  audioAvailable=await sound.start();
  if(token!==entryToken||!active)return;
  applyPreferences();render();persist();
  if(state.completed)showEnding();else stage.focus({preventScroll:true});
}
$('#begin-button').addEventListener('click',begin);
$('#home-button').addEventListener('click',async()=>{
  entryToken++;
  active=false;$('#intro').hidden=false;$('#game').inert=true;
  sound.setMode('menu');
  const starting=sound.start();updateIntro();$('#begin-button').focus();
  audioAvailable=await starting;updateMusicControls();
});
$('#intro-restart').addEventListener('click',confirmRestart);
function showHint(){
  const task=missionStatus(state);
  openPanel('YOUR ASSIGNMENT','Bring back the record',`<ol class="mission-steps">${task.steps.map(step=>`<li class="${step.done?'done':step.current?'current':''}">${escape(step.label)}${step.done?' · done':''}</li>`).join('')}</ol><div class="panel-copy"><p>${escape(MISSION_BRIEF)}</p><h3>${escape(task.title)}</h3><p>${escape(task.text)}</p><details class="optional-hint"><summary>Show me a more specific lead</summary><p>${escape(task.hint)}</p></details></div>`);
}
$('#hint-button').addEventListener('click',showHint);
$('#settings-button').addEventListener('click',showSettings);
$('#journal-button').addEventListener('click',()=>showJournal());
$('#about-button').addEventListener('click',showAbout);
$('#look-closer').addEventListener('click',showSceneDetails);
$('#primary-action').addEventListener('click',()=>{if(state.completed)showEnding();});

function execute(actionId, direct=false){
  if(!active||state.completed)return;
  const entry=currentActions.find(a=>a.id===actionId);
  if(!entry)return;
  if(entry.kind==='move'&&(stage.classList.contains('changing')||performance.now()<travelReadyAt))return;
  if(!direct&&actionId==='compare-signal'){showEvidence();return;}
  if(entry.disabled){openPanel('NOT YET AVAILABLE',entry.label,`<div class="panel-copy"><p>${escape(entry.reason||'Inspect the nearby evidence first.')}</p></div>`);return;}
  if(!direct&&['power-inspection','power-receiver'].includes(actionId)){showServicePanel();return;}
  if(!direct&&['mute-receiver','redirect-receiver'].includes(actionId)){showReceiverControls();return;}
  if(!direct&&actionId==='publish-warning'){showBeacon();return;}
  if(entry.kind==='move'&&panel.open)closePanel();
  const result=perform(state,actionId);
  state=result.state;
  if(entry.kind==='move'){hintOpen=false;latestFeedback=null;travelReadyAt=performance.now()+350;if(compact)fieldControls.open=false;}
  render();persist();
  if(result.event)sound.cue(result.event);
  if(result.record)showRecord(result.record);
  else if(result.message&&!(compact&&entry.kind==='move'))caption(result.message,result.event==='redirect'?9500:6500);
  if(actionId==='open-panel')showServicePanel();
  if(actionId==='listen-receiver')openPanel('LISTENING TRANSCRIPT','The repeated call',`<div class="panel-copy"><p>${escape(result.message)}</p></div><p class="record-takeaway">Your listening is saved with the evidence. Compare it with the survey log and the marks on the cable.</p><button class="secondary-button" data-action="listen-receiver">Listen again</button>`);
  if(actionId==='check-return')openPanel('THE WAY BACK','The green return supply',`<div class="panel-copy"><p>${escape(result.message)}</p></div><p class="record-takeaway">The green lamps remain your route back to the airlock.</p>`);
  if(['mute-receiver','redirect-receiver'].includes(actionId)){
    openPanel('AT THE RECEIVER',actionId==='mute-receiver'?'The call falls silent':'Something follows the call',`<div class="panel-copy"><p>${escape(result.message)}</p></div><p class="record-takeaway">The lower landing is clear. You can recover the recorder and return along the green lamps.</p>`);
    $('#panel-done').textContent='Go to the lower landing';$('#panel-done').dataset.panelAction='continue-lower';$('#panel-done').className='primary-button';
  }
  if(entry.kind==='move'){stage.focus({preventScroll:true});if(compact)window.scrollTo({top:0,behavior:'instant'});}
  if(state.completed){sound.setMode('report');updateMusicControls();showEnding();}
}
document.addEventListener('click',event=>{const action=event.target.closest('[data-action]');if(action){event.preventDefault();execute(action.dataset.action,action.dataset.direct==='true');}});

function sceneDetailImage(title,anchor=[50,50]){
  return `<div class="inspection-visual" role="img" aria-label="${escape(title)} in ${escape(SCENES[state.scene].title.toLowerCase())}" style="background-image:url('assets/${SCENES[state.scene].image}.webp');background-size:180%;background-position:${anchor[0]}% ${anchor[1]}%"></div>`;
}
function showSceneDetails(){
  const details=sceneObservations(state);
  const objects=mobileActions(state,currentActions).interactions.filter(a=>!a.disabled);
  openPanel('LOOK CLOSER',SCENES[state.scene].title,`<div class="panel-copy"><p>${escape(sceneDescription(state))}</p></div>${objects.length?`<h3 class="inspection-subtitle">Equipment & records</h3><div class="record-list">${objects.map(a=>`<button class="record-entry" data-action="${escape(a.id)}"><span><strong>${escape(a.label)}</strong><small>${a.record?'Read and keep in your notebook':'Inspect the equipment'}</small></span></button>`).join('')}</div>`:''}<h3 class="inspection-subtitle">Take a moment</h3><div class="record-list">${details.map(item=>`<button class="record-entry" data-observation="${escape(item.id)}"><span><strong>${escape(item.title)}</strong><small>Optional observation</small></span></button>`).join('')}</div>`);
}
function showObservation(id){
  const item=sceneObservations(state).find(detail=>detail.id===id);if(!item)return;
  openPanel('A CLOSER LOOK',item.title,`${sceneDetailImage(item.title,item.anchor)}<div class="panel-copy"><p>${escape(item.body)}</p></div><button class="secondary-button" data-panel-action="scene-details">Other details in this view</button>`);
}
function showServicePanel(feedback=''){
  const f=state.flags;
  openPanel('SERVICE BAY','The service panel',`<div class="panel-copy"><p>Two switched circuits sit below a separate green return cable.</p></div><div class="circuit-panel" aria-label="Service panel circuits"><div class="circuit-row circuit-return"><div><strong>RETURN</strong><small>Independent cell · route lamps</small></div><span class="circuit-status">ON · leave connected</span></div><button class="circuit-row ${f.inspectionPowered?'circuit-on':''}" data-panel-action="circuit-inspection" ${f.inspectionPowered?'disabled':''}><span><strong>INSPECTION</strong><small>Shaft and lower landing</small></span><span class="circuit-status">${f.inspectionPowered?'ON':'OFF · switch on'}</span></button><button class="circuit-row" data-panel-action="circuit-receiver" ${f.inspectionPowered?'disabled':''}><span><strong>RECEIVER</strong><small>Pickup and playback</small></span><span class="circuit-status">${f.inspectionPowered?'Already powered':'ON · test supply'}</span></button></div>${feedback?`<p class="puzzle-feedback" role="status">${escape(feedback)}</p>`:''}${!state.records.includes('maintenance')?'<p class="panel-copy">Read the maintenance card to identify the circuit before switching it.</p><button class="secondary-button" data-action="read-maintenance">Read the maintenance card</button>':`<p class="record-takeaway">${f.inspectionPowered?'The shaft is lit. Your green return lamps are still on.':'The card identifies INSPECTION as the supply for the lamps. The receiver already has power.'}</p>`}`);
}
function showEvidence(){
  const cards=evidenceCards(state),assessment=assessEvidence(state,{});
  openPanel('AT THE RECEIVER','Put the clues together',`<div class="panel-copy"><p>Use what you found to decide what the call means and how to keep your way back.</p></div><details class="evidence-cards" ${assessment.ready?'':'open'}><summary>Your evidence · ${cards.length} of 4 clues</summary>${cards.map(card=>`<article><h3>${escape(card.title)}</h3><p>${escape(card.text)}</p></article>`).join('')}${state.records.includes('maintenance')?'<p class="record-takeaway">Maintenance card: the green RETURN lamps have an independent supply.</p>':''}</details>${assessment.ready?`<form id="evidence-form">${EVIDENCE_QUESTIONS.map(q=>`<fieldset class="evidence-question"><legend>${escape(q.prompt)}</legend>${q.options.map(option=>`<label class="evidence-option"><input type="radio" name="${q.id}" value="${option.id}"><span>${escape(option.label)}</span></label>`).join('')}</fieldset>`).join('')}<p id="puzzle-feedback" class="puzzle-feedback" role="status" hidden></p></form>`:`<p class="puzzle-feedback">${escape(assessment.feedback)}</p><p class="panel-copy">Your notes will be here when you return.</p>`}`);
  if(assessment.ready){$('#panel-done').textContent='Check my reasoning';$('#panel-done').dataset.panelAction='check-evidence';$('#panel-done').className='primary-button';}
}
function showReceiverControls(){
  if(!state.flags.signalCompared||state.receiverMode)return;
  openPanel('THE REPEATED CALL','Choose what happens to it',`<div class="panel-copy"><p>The clipped ending matches the damaged survey call. The green exit lamps have their own supply.</p><p>Either control clears your route to the recorder. Choose what you want to do with the sound.</p></div><div class="receiver-choices"><button class="record-entry" data-panel-action="receiver-mute"><span><strong>Mute the receiver</strong><small>Stop the playback here. The return lights stay on.</small></span></button><button class="record-entry" data-panel-action="receiver-redirect"><span><strong>Redirect into the side shaft</strong><small>Send the playback away from your recovery route. Keep the return lights on.</small></span></button></div>`);
}
function showBeacon(){
  openPanel('SURFACE BEACON','Leave a useful warning',`<p class="record-meta">REPLACE: CLEAR SURVEY ACCESS</p><div class="warning-draft"><h3>Your field warning</h3><p>Repeated survey call. The recovered recording describes an animal imitating it. Do not use the voice as a route marker.</p><p>${state.receiverMode==='mute'?'The receiver is muted.':'The playback has been redirected into the side shaft.'} Follow the independent green lamps back to the airlock.</p><p>The earlier crew’s later movements are unconfirmed.</p><small>Attachment: recovered field recording</small></div>`);
  $('#panel-done').textContent='Transmit this warning';$('#panel-done').dataset.panelAction='transmit-warning';$('#panel-done').className='primary-button';
}

function recordPhoto(record){
  return record.kind==='photo'?`<div class="wiring-sketch"><p class="eyebrow">COPIED FROM THE CREW’S ANNOTATIONS</p><div class="sketch-wire green"><strong>GREEN RETURN CABLE</strong><span>Independent cell · exit lamps</span></div><div class="sketch-wire white"><strong>WHITE LISTENING LEAD</strong><span>Receiver · central passage</span></div><div class="sketch-wire capped"><strong>SIDE-SHAFT SOCKET</strong><span>Capped before the last shift</span></div></div>`:'';
}
function showRecord(id){
  if(!state.records.includes(id)||!RECORDS[id])return;
  const record=RECORDS[id];
  const photograph=recordPhoto(record);
  const takeaways={dispatch:'Recover the recorder, warn the next crew, and return to the airlock.',photograph:'You have a reference for the receiver’s original wiring.',survey_log:'Listen for the same clipped ending when you reach the receiver.',maintenance:'Restore INSPECTION while keeping the green return supply connected.',cable_marks:'Compare the moved lead with the reference notes and the repeated call.',field_recorder:'You can now replace the beacon’s old clearance with a supported warning.'};
  openPanel(record.kind==='audio'?'RECOVERED TRANSCRIPT':record.kind==='photo'?'REFERENCE NOTES':'PHYSICAL RECORD',record.title,`${photograph}<p class="record-meta">${escape(record.source)}</p><div class="panel-copy"><p>${escape(record.body)}</p></div><p class="record-takeaway">${escape(takeaways[id])}</p><div class="inline-buttons"><button class="secondary-button" data-panel-action="back-journal">All records</button></div>`);
}
function showJournal(tab='records'){
  const tabs=`<div class="notebook-tabs"><button data-panel-action="journal-records" class="${tab==='records'?'active':''}">Records (${state.records.length})</button><button data-panel-action="journal-route" class="${tab==='route'?'active':''}">Your route</button></div>`;
  let body;
  if(tab==='route'){
    const links={approach:['airlock','beacon'],airlock:['approach','junction'],junction:['airlock','survey','service','shaft'],survey:['junction'],service:['junction'],shaft:['junction','lower'],lower:['shaft'],beacon:['approach']};
    const returns={approach:['approach','airlock'],airlock:['airlock'],junction:['junction','airlock'],survey:['survey','junction','airlock'],service:['service','junction','airlock'],shaft:['shaft','junction','airlock'],lower:['lower','shaft','junction','airlock'],beacon:['beacon','approach','airlock']};
    const exits=currentActions.filter(a=>a.kind==='move'&&!a.disabled);
    body=`<p class="record-meta">YOU ARE AT ${escape(SCENES[state.scene].title.toUpperCase())}</p><div class="connected-route"><strong>Your way back</strong><ol class="return-path">${returns[state.scene].map(id=>`<li>${escape(SCENES[id].title)}</li>`).join('')}</ol></div>${exits.length?`<h3 class="inspection-subtitle">From here</h3><div class="action-list">${exits.map(a=>`<button class="action-button" data-action="${a.id}">${escape(a.label)}</button>`).join('')}</div>`:''}<h3 class="inspection-subtitle">Places you have visited</h3><div class="route-map">${state.visited.map(id=>`<div class="route-node ${state.scene===id?'current':''}">${escape(SCENES[id].title)}<small>${links[id].filter(link=>state.visited.includes(link)).map(link=>escape(SCENES[link].title)).join(' · ')||'No further route recorded'}</small></div>`).join('')}</div>`;
  }else{
    const ids=RECORD_ORDER.filter(id=>state.records.includes(id));
    body=ids.length?`<div class="record-list">${ids.map(id=>`<button class="record-entry" data-record="${id}"><span><strong>${escape(RECORDS[id].title)}</strong><small>${escape(RECORDS[id].source)}</small></span><span aria-hidden="true">＋</span></button>`).join('')}</div>`:'<div class="panel-copy"><p>Your notebook is empty. Enter the airlock and visit the survey room to find the crew’s reference notes and log. The dispatch at the entrance is optional.</p></div>';
  }
  openPanel(CHAPTER.archive.toUpperCase(),'Field notebook',tabs+body+(state.completed?'<div class="inline-buttons"><button class="primary-button" data-panel-action="ending">View expedition report</button></div>':''));
}
function showSettings(){
  openPanel('EXPEDITION SETTINGS','Make yourself comfortable',`
    <div class="setting-row"><label for="pref-sound">All sound<small>Master switch for music and station sounds. All clues are also readable.</small></label><input id="pref-sound" type="checkbox" ${preferences.sound?'checked':''}></div>
    <div class="setting-row"><label for="pref-volume">Master volume</label><input id="pref-volume" type="range" min="0" max="1" step=".05" value="${preferences.volume}" aria-label="Sound volume"></div>
    <div class="setting-row"><label for="pref-music">Music<small>The Farwake theme plays on the title screen and after a new recovery. Investigation leaves room for the station and receiver.</small></label><input id="pref-music" type="checkbox" ${preferences.music?'checked':''}></div>
    <div class="setting-row"><label for="pref-music-volume">Music level</label><input id="pref-music-volume" type="range" min="0" max="1" step=".05" value="${preferences.musicVolume}" aria-label="Music level"></div>
    <p id="music-status" class="credits" aria-live="polite"></p><button id="music-retry" class="secondary-button" data-panel-action="retry-music" hidden>Retry music</button>
    <p class="credits">${escape(MENU_THEME.title)}. ${escape(MENU_THEME.credit)}</p>
    <div class="setting-row"><label for="pref-markers">Object markers<small>Direction arrows stay visible. Open Task on phones for every object action.</small></label><input id="pref-markers" type="checkbox" ${preferences.markers?'checked':''}></div>
    <div class="setting-row"><label for="pref-labels">Always show desktop marker labels<small>Phone labels appear on keyboard focus. Open Task or Look closer for the action names.</small></label><input id="pref-labels" type="checkbox" ${preferences.labels?'checked':''}></div>
    <div class="setting-row"><label for="pref-motion">Reduce motion<small>Use immediate transitions between viewpoints.</small></label><input id="pref-motion" type="checkbox" ${preferences.reducedMotion?'checked':''}></div>
    <div class="settings-foot"><button class="secondary-button" data-panel-action="about">About & controls</button><button class="secondary-button" data-panel-action="restart">Start over</button></div>
    <p class="credits">Your progress and settings are saved only in this browser. This game has no accounts, analytics, or online save sync.</p>`);
  updateMusicControls();
}
function showAbout(){
  openPanel('FARWAKE · LOST EXPEDITIONS','Nightglass',`<div class="panel-copy"><p>${escape(CHAPTER.fiction)}</p><p>A scene-by-scene investigation on Luna. Follow the physical evidence, recover the recorder, and leave a useful warning.</p><p><strong>Controls:</strong> tap an arrow in the scene to move in that direction. Dots mark objects to inspect. On phones, open Task for your assignment, help, and all actions, including List of exits. The magnifier opens Look closer for objects and optional details. Records stay in your notebook. Closing an inspection returns you to the same view.</p><p><strong>Keyboard:</strong> Tab through controls, Enter or Space to activate, J for the notebook, H for help, M to toggle sound, and Escape to close a panel. Left and right keys pan a cropped desktop view.</p><p>Your notebook and progress stay in this browser. You can leave, reload, and continue. Clearing this browser’s site data removes the save.</p><p><strong>Atmosphere:</strong> isolation, an imitated call, and brief implied animal movement. All sound clues are readable. There are no timed reading challenges.</p></div><p class="credits">Created for Christopher Holtsnider’s DailyFlyer project. Original Farwake setting and Nightglass adaptation. Fictional scene artwork generated for this game; it is not authentic lunar photography. Station sounds are synthesized locally. The original Farwake menu recording is bundled with this game. ${escape(MENU_THEME.credit)} Version 0.3.3.</p>`);
}
function confirmRestart(){
  openPanel('START A NEW RECORD','Restart this expedition?',`<div class="panel-copy"><p>This replaces the Nightglass progress saved in this browser. Your sound and display settings stay as they are.</p></div><div class="inline-buttons"><button class="secondary-button" data-panel-action="close">Keep my progress</button><button class="primary-button" data-panel-action="confirm-restart">Start over</button></div>`);
}
function showEnding(){
  const ending=getEnding(state);if(!ending)return;
  openPanel('EXPEDITION RECORD COMPLETE',ending.title,`<p class="ending-label">NIGHTGLASS · LUNA</p><div class="panel-copy"><p>${escape(ending.text)}</p></div><div class="ending-stats"><span>${state.records.length} of ${RECORD_ORDER.length} records recovered</span><span>Return route preserved</span></div><ul class="ending-details">${ending.details.map(text=>`<li>${escape(text)}</li>`).join('')}</ul><p class="credits">Filed with the Lilt Library, Vesper. The local incident has an explanation. The earlier crew’s later movements remain unconfirmed.</p><div class="inline-buttons"><button class="primary-button" data-panel-action="download">Download your field report</button><button class="secondary-button" data-panel-action="journal-records">Read your records</button><button class="secondary-button" data-panel-action="restart">Try another approach</button></div>`);
}
function downloadReport(){
  const ending=getEnding(state);if(!ending)return;
  const report=`FARWAKE: LOST EXPEDITIONS\nNIGHTGLASS — FIELD REPORT\n\n${ending.title}\n${ending.text}\n\n${ending.details.join('\n')}\n\nRECOVERED RECORDS\n\n${RECORD_ORDER.filter(id=>state.records.includes(id)).map(id=>`${RECORDS[id].title}\n${RECORDS[id].source}\n${RECORDS[id].body}`).join('\n\n')}\n\n${CHAPTER.fiction}\nVersion 0.3.3\n`;
  const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='nightglass-field-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
panel.addEventListener('click',event=>{
  const record=event.target.closest('[data-record]');if(record){showRecord(record.dataset.record);return;}
  const observation=event.target.closest('[data-observation]');if(observation){showObservation(observation.dataset.observation);return;}
  const control=event.target.closest('[data-panel-action]');if(!control)return;
  switch(control.dataset.panelAction){
    case 'close':closePanel();break;
    case 'back-journal':case 'journal-records':showJournal();break;
    case 'journal-route':showJournal('route');break;
    case 'scene-details':showSceneDetails();break;
    case 'check-evidence':$('#evidence-form')?.requestSubmit();break;
    case 'continue-lower':execute('go:lower');break;
    case 'circuit-inspection':{
      const action=currentActions.find(a=>a.id==='power-inspection');
      if(action?.disabled){showServicePanel(action.reason);break;}
      execute('power-inspection',true);showServicePanel('The lamps come on in stages. The green return supply stays steady.');break;
    }
    case 'circuit-receiver':execute('power-receiver',true);showServicePanel('A short burst of feedback. The receiver is already powered; this does not light the passage.');break;
    case 'receiver-mute':closePanel();execute('mute-receiver',true);break;
    case 'receiver-redirect':closePanel();execute('redirect-receiver',true);break;
    case 'transmit-warning':closePanel();execute('publish-warning',true);break;
    case 'about':showAbout();break;
    case 'restart':confirmRestart();break;
    case 'ending':showEnding();break;
    case 'download':downloadReport();break;
    case 'retry-music':void sound.start().then(updateMusicControls);break;
    case 'confirm-restart':state=initialState();lastScene=null;hintOpen=false;latestFeedback=null;persist();closePanel();begin();break;
  }
});
panel.addEventListener('submit',event=>{
  if(event.target.id!=='evidence-form')return;
  event.preventDefault();
  const answers=Object.fromEntries(new FormData(event.target));
  const result=assessEvidence(state,answers);
  if(result.correct){execute('compare-signal',true);showReceiverControls();}
  else{const feedback=$('#puzzle-feedback');feedback.textContent=result.feedback;feedback.hidden=false;feedback.scrollIntoView({block:'nearest',behavior:'auto'});}
});
panel.addEventListener('change',async event=>{
  switch(event.target.id){
    case 'pref-sound':preferences.sound=event.target.checked;sound.setEnabled(preferences.sound);if(preferences.sound)audioAvailable=await sound.start();break;
    case 'pref-volume':preferences.volume=Number(event.target.value);break;
    case 'pref-music':preferences.music=event.target.checked;sound.setMusicEnabled(preferences.music);if(preferences.music)audioAvailable=await sound.start();break;
    case 'pref-music-volume':preferences.musicVolume=Number(event.target.value);break;
    case 'pref-markers':preferences.markers=event.target.checked;break;
    case 'pref-labels':preferences.labels=event.target.checked;break;
    case 'pref-motion':preferences.reducedMotion=event.target.checked;break;
    default:return;
  }
  if(['pref-volume','pref-music-volume'].includes(event.target.id)&&preferences.sound&&preferences.music&&preferences.volume>0&&preferences.musicVolume>0)audioAvailable=await sound.start();
  savePreferences();
});
panel.addEventListener('input',event=>{
  if(event.target.id==='pref-volume'){preferences.volume=Number(event.target.value);sound.setVolume(preferences.volume);}
  if(event.target.id==='pref-music-volume'){preferences.musicVolume=Number(event.target.value);sound.setMusicVolume(preferences.musicVolume);}
  updateMusicControls();
});
document.addEventListener('keydown',async event=>{
  if(!active||panel.open||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  switch(event.key.toLowerCase()){
    case 'j':event.preventDefault();showJournal();break;
    case 'h':event.preventDefault();showHint();break;
    case 'm':event.preventDefault();preferences.sound=!preferences.sound;sound.setEnabled(preferences.sound);if(preferences.sound)audioAvailable=await sound.start();savePreferences();toast(preferences.sound?'Sound on':'Sound off');break;
    case 'arrowleft':if(geometry?.maxPan>0){event.preventDefault();pan+=70;positionScene();}break;
    case 'arrowright':if(geometry?.maxPan>0){event.preventDefault();pan-=70;positionScene();}break;
  }
});
let pointer=null;
stage.addEventListener('pointerdown',event=>{
  if(event.target.closest('button')||!active||!geometry?.maxPan||compact)return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,start:pan,dragging:false};
});
stage.addEventListener('pointermove',event=>{
  if(!pointer||pointer.id!==event.pointerId)return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(!pointer.dragging){
    if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){pointer=null;return;}
    if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.15)return;
    pointer.dragging=true;stage.setPointerCapture(event.pointerId);stage.classList.add('dragging');
  }
  pan=pointer.start+dx;positionScene();
});
const release=()=>{pointer=null;stage.classList.remove('dragging');};
stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
compactMedia.addEventListener('change',event=>{
  compact=event.matches;document.body.classList.toggle('compact-layout',compact);
  fieldControls.open=!compact;
  render();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.pause();else void sound.resume().then(updateMusicControls);});
window.addEventListener('pagehide',()=>sound.pause());
window.addEventListener('pageshow',()=>{void sound.resume().then(updateMusicControls);});
$('#game').inert=true;
applyPreferences();updateIntro();render();
