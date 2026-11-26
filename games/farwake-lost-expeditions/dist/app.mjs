import { ALL_SCENES as SCENES, RECORDS, CHAPTER_ORDER, getChapter, recordOrder, STORY_VERSION, ERA } from './content.mjs';
import { initialState, hydrateCollection, storeChapter, SAVE_KEY, LEGACY_SAVE_KEY, RESET_NOTICE, perform, availableActions, getEnding, sceneDescription } from './state.mjs';
import { NightglassAudio } from './audio.mjs?v=0.4.0';
import { MENU_THEME } from './menu-theme.mjs';
import { mobileActions, mobileLabel } from './mobile-actions.mjs';
import { missionStatus, missionBrief, routeTo } from './mission.mjs';
import { sceneObservations, sceneObservationLead } from './investigation.mjs';

const PREF_KEY = 'farwake.lost-expeditions.preferences.v1';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const rawSave = readLocal(SAVE_KEY);
let collection = hydrateCollection(rawSave);
let state = collection.chapters[collection.selected];
const resetOldStory = !rawSave && Boolean(readLocal(LEGACY_SAVE_KEY));
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

// Every action also remains in the task panel when its image marker is cropped.
const ANCHORS = {};

const DIRECTION_PATHS = {
  forward:'M12 20V4m-7 7 7-7 7 7',
  down:'M12 4v16m-7-7 7 7 7-7',
  left:'M20 12H4m7-7-7 7 7 7',
  right:'M4 12h16m-7-7 7 7-7 7',
  back:'M9 4 4 9l5 5M4 9h9a7 7 0 0 1 0 14'
};

function directionButton(action,nextId){
  const route=action.route;
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

function hasProgress(value=state){ return value.moves > 0 || value.records.length > 0 || Object.values(value.flags).some(Boolean) || value.completed; }
function persist(){
  collection=storeChapter(collection,state);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(collection)); $('#save-status').textContent='Saved on this device'; }
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
  const chapter=getChapter(state.chapter);
  $('#intro-title').textContent=chapter.title;
  $('#intro-tagline').textContent=chapter.tagline;
  $('#intro-brief').textContent=chapter.brief;
  $('#intro-location').textContent=`${chapter.location} · ${chapter.character}`;
  $('#intro-case').textContent=chapter.subtitle;
  $('.intro-backdrop').style.backgroundImage=`linear-gradient(90deg,#0b1218f2 0%,#0b1218d9 45%,#0b121878 100%),linear-gradient(0deg,#0a1119cf,transparent 75%),url("assets/${chapter.image}")`;
  $('#begin-button').textContent=state.completed?'Read the ending':hasProgress()?'Continue chapter':'Begin chapter';
  $('#intro-restart').hidden=!hasProgress();
  $('#chapter-options').innerHTML=CHAPTER_ORDER.map(id=>{
    const c=getChapter(id),saved=collection.chapters[id];
    return `<button type="button" class="chapter-option ${id===state.chapter?'selected':''}" data-chapter="${id}" aria-pressed="${id===state.chapter}"><span>${escape(c.location)}</span><strong>${escape(c.title)}</strong><small>${saved.completed?'Complete':hasProgress(saved)?'In progress':c.role}</small></button>`;
  }).join('');
  $('#save-reset-note').hidden=!resetOldStory;
  $('#save-reset-note').textContent=RESET_NOTICE;
  updateMusicControls();
}
function chooseChapter(id){
  if(!CHAPTER_ORDER.includes(id))return;
  collection=storeChapter(collection,state);collection.selected=id;
  state=collection.chapters[id];lastScene=null;hintOpen=false;latestFeedback=null;
  render();persist();
  $(`[data-chapter="${id}"]`)?.focus({preventScroll:true});
}
$('#chapter-options').addEventListener('click',event=>{
  const button=event.target.closest('[data-chapter]');if(button)chooseChapter(button.dataset.chapter);
});
async function showChapterMenu(){
  entryToken++;active=false;if(panel.open)closePanel();
  $('#intro').hidden=false;$('#game').inert=true;
  sound.setMode('menu');updateIntro();$('#begin-button').focus();
  audioAvailable=await sound.start();updateMusicControls();
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
    waiting:'The theme is ready.',
    quiet:'During the chapter: station sounds, with written equivalents.',
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
  $('#view-instruction').textContent=state.completed?'Chapter complete · review your notebook':maxPan>20?'Arrows move · dots inspect · drag to look':'Tap a direction to move · dots inspect';
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
  primary.textContent=state.completed?'Read the ending':next?.label||'';
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
  const scene=SCENES[state.scene],chapter=getChapter(state.chapter);
  $('#header-location').textContent=scene.title.toUpperCase();
  $('#chapter-era').textContent=`${chapter.location} · ${ERA}`;
  $('#mobile-location').textContent=scene.title;
  $('#scene-subtitle').textContent=scene.subtitle.toUpperCase();
  $('#scene-title').textContent=scene.title;
  image.alt=sceneDescription(state);
  $('#record-count').textContent=state.records.length;
  $('#journal-button').setAttribute('aria-label',`Open field notebook · ${state.records.length} records`);
  const task=missionStatus(state);
  $('#mobile-task-label').textContent=task.title;
  $('#mobile-task').setAttribute('aria-label',`Task: ${task.title}. Assignment and available actions`);
  $('#objective-phase').textContent=state.completed?'CHAPTER COMPLETE':`${chapter.character.toUpperCase()} · CURRENT TASK`;
  $('#objective-title').textContent=task.title;
  $('#objective-text').textContent=task.nextScene!==state.scene&&task.nextScene!==task.destination
    ? `Continue through ${SCENES[task.nextScene].title.toLowerCase().replace(/^(?!the )/,'the ')} to ${SCENES[task.destination].title.toLowerCase().replace(/^(?!the )/,'the ')}.`
    : task.text;
  $('#scene-observation').textContent=sceneObservationLead(state);
  $('#hint-box').textContent=task.hint;$('#hint-box').hidden=!hintOpen;
  $('#hint-button').textContent='Help';
  document.body.classList.toggle('inspection-on',!!state.flags.inspectionPowered&&['junction','service','shaft','lower'].includes(state.scene));
  $('#scene-status').textContent=state.completed?'CHAPTER COMPLETE':`${chapter.character} · ${chapter.location}`;
  document.body.dataset.activeChapter=state.chapter;
  stage.classList.toggle('chapter-ended',state.completed);
  renderActions();
  sound.setScene(state.scene,state);
  if(lastScene!==state.scene){
    lastScene=state.scene;pan=0;
    const token=++sceneToken,source=`assets/${scene.image}`;
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
  // The final viewpoint stays quiet. The contributed theme belongs to the menu.
  sound.setMode('expedition');
  audioAvailable=await sound.start();
  if(token!==entryToken||!active)return;
  applyPreferences();render();persist();
  if(state.completed)showEnding();else stage.focus({preventScroll:true});
}
$('#begin-button').addEventListener('click',begin);
$('#home-button').addEventListener('click',()=>void showChapterMenu());
$('#intro-restart').addEventListener('click',confirmRestart);
function showHint(){
  const task=missionStatus(state);
  openPanel(ERA.toUpperCase(),getChapter(state.chapter).title,`<ol class="mission-steps">${task.steps.map(step=>`<li class="${step.done?'done':step.current?'current':''}">${escape(step.label)}${step.done?' · done':''}</li>`).join('')}</ol><div class="panel-copy"><p>${escape(missionBrief(state))}</p><h3>${escape(task.title)}</h3><p>${escape(task.text)}</p><details class="optional-hint"><summary>Show me a more specific lead</summary><p>${escape(task.hint)}</p></details></div>`);
}
$('#hint-button').addEventListener('click',showHint);
$('#settings-button').addEventListener('click',showSettings);
$('#journal-button').addEventListener('click',()=>showJournal());
$('#about-button').addEventListener('click',showAbout);
$('#look-closer').addEventListener('click',showSceneDetails);
$('#primary-action').addEventListener('click',()=>{if(state.completed)showEnding();});

function execute(actionId){
  if(!active||state.completed)return;
  const entry=currentActions.find(a=>a.id===actionId);
  if(!entry)return;
  if(entry.kind==='move'&&(stage.classList.contains('changing')||performance.now()<travelReadyAt))return;
  if(entry.disabled){openPanel('NOT YET AVAILABLE',entry.label,`<div class="panel-copy"><p>${escape(entry.reason)}</p></div>`);return;}
  if(entry.kind==='move'&&panel.open)closePanel();
  const result=perform(state,actionId);state=result.state;
  if(entry.kind==='move'){hintOpen=false;latestFeedback=null;travelReadyAt=performance.now()+350;if(compact)fieldControls.open=false;}
  render();persist();
  if(result.event)sound.cue(result.event);
  if(state.completed){showEnding();return;}
  if(result.record)showRecord(result.record);
  else if(entry.kind!=='move')openPanel('EQUIPMENT CHECK',result.title||entry.label,`<div class="panel-copy"><p>${escape(result.message)}</p></div><p class="record-takeaway">${escape(missionStatus(state).text)}</p>`);
  else {stage.focus({preventScroll:true});if(compact)window.scrollTo({top:0,behavior:'instant'});}
}
document.addEventListener('click',event=>{const action=event.target.closest('[data-action]');if(action){event.preventDefault();execute(action.dataset.action);}});

function sceneDetailImage(title,anchor=[50,50]){
  return `<div class="inspection-visual" role="img" aria-label="${escape(title)} in ${escape(SCENES[state.scene].title.toLowerCase())}" style="background-image:url('assets/${SCENES[state.scene].image}');background-size:180%;background-position:${anchor[0]}% ${anchor[1]}%"></div>`;
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
function showRecord(id){
  if(!state.records.includes(id)||!RECORDS[id])return;
  const record=RECORDS[id];
  openPanel(record.kind==='audio'?'WRITTEN TRANSCRIPT':'YOUR NOTES',record.title,`<p class="record-meta">${escape(record.source)}</p><div class="panel-copy">${record.body.split('\n\n').map(p=>`<p>${escape(p)}</p>`).join('')}</div>${record.takeaway?`<p class="record-takeaway">${escape(record.takeaway)}</p>`:''}<div class="inline-buttons"><button class="secondary-button" data-panel-action="journal-records">All notes</button></div>`);
}
function showJournal(tab='records'){
  const chapter=getChapter(state.chapter);
  const tabs=`<div class="notebook-tabs"><button data-panel-action="journal-records" class="${tab==='records'?'active':''}">Notes (${state.records.length})</button><button data-panel-action="journal-route" class="${tab==='route'?'active':''}">Your route</button></div>`;
  let body;
  if(tab==='route'){
    const exits=currentActions.filter(a=>a.kind==='move'&&!a.disabled);
    const route=state.completed?[]:routeTo(state,chapter.startScene)||[];
    body=`<p class="record-meta">YOU ARE AT ${escape(SCENES[state.scene].title.toUpperCase())}</p>${route.length?`<div class="connected-route"><strong>Back to ${escape(SCENES[chapter.startScene].title.toLowerCase())}</strong><ol class="return-path">${route.map(id=>`<li>${escape(SCENES[id].title)}</li>`).join('')}</ol></div>`:''}${exits.length?`<h3 class="inspection-subtitle">From here</h3><div class="action-list">${exits.map(a=>`<button class="action-button" data-action="${a.id}">${escape(a.label)}</button>`).join('')}</div>`:''}<h3 class="inspection-subtitle">Places you have visited</h3><div class="route-map">${state.visited.map(id=>`<div class="route-node ${state.scene===id?'current':''}">${escape(SCENES[id].title)}<small>${SCENES[id].routes.filter(r=>state.visited.includes(r.target)).map(r=>escape(SCENES[r.target].title)).join(' · ')||'No further route recorded'}</small></div>`).join('')}</div>`;
  }else{
    const ids=recordOrder(state.chapter).filter(id=>state.records.includes(id));
    body=ids.length?`<div class="record-list">${ids.map(id=>`<button class="record-entry" data-record="${id}"><span><strong>${escape(RECORDS[id].title)}</strong><small>${escape(RECORDS[id].source)}</small></span><span aria-hidden="true">＋</span></button>`).join('')}</div>`:'<div class="panel-copy"><p>Your notes will appear here as you inspect the equipment and records. Open Task for your current job.</p></div>';
  }
  openPanel(chapter.archive.toUpperCase(),`${chapter.character} · notebook`,tabs+body+(state.completed?'<div class="inline-buttons"><button class="primary-button" data-panel-action="ending">Read the ending</button></div>':''));
}
function showSettings(){
  openPanel('EXPEDITION SETTINGS','Make yourself comfortable',`
    <div class="setting-row"><label for="pref-sound">All sound<small>Master switch for music and station sounds. All clues are also readable.</small></label><input id="pref-sound" type="checkbox" ${preferences.sound?'checked':''}></div>
    <div class="setting-row"><label for="pref-volume">Master volume</label><input id="pref-volume" type="range" min="0" max="1" step=".05" value="${preferences.volume}" aria-label="Sound volume"></div>
    <div class="setting-row"><label for="pref-music">Music<small>The original Farwake theme plays on the chapter menu. Chapters and their endings leave room for station sounds and silence.</small></label><input id="pref-music" type="checkbox" ${preferences.music?'checked':''}></div>
    <div class="setting-row"><label for="pref-music-volume">Music level</label><input id="pref-music-volume" type="range" min="0" max="1" step=".05" value="${preferences.musicVolume}" aria-label="Music level"></div>
    <p id="music-status" class="credits" aria-live="polite"></p><button id="music-retry" class="secondary-button" data-panel-action="retry-music" hidden>Retry music</button>
    <p class="credits">${escape(MENU_THEME.title)}. ${escape(MENU_THEME.credit)}</p>
    <div class="setting-row"><label for="pref-markers">Object markers<small>Direction arrows stay visible. Open Task on phones for every object action.</small></label><input id="pref-markers" type="checkbox" ${preferences.markers?'checked':''}></div>
    <div class="setting-row"><label for="pref-labels">Always show desktop marker labels<small>Phone labels appear on keyboard focus. Open Task or Look closer for the action names.</small></label><input id="pref-labels" type="checkbox" ${preferences.labels?'checked':''}></div>
    <div class="setting-row"><label for="pref-motion">Reduce motion<small>Use immediate transitions between viewpoints.</small></label><input id="pref-motion" type="checkbox" ${preferences.reducedMotion?'checked':''}></div>
    <div class="settings-foot"><button class="secondary-button" data-panel-action="about">About & controls</button><button class="secondary-button" data-panel-action="chapters">Choose chapter</button><button class="secondary-button" data-panel-action="restart">Restart this chapter</button></div>
    <p class="credits">Your progress and settings are saved only in this browser. This game has no accounts, analytics, or online save sync.</p>`);
  updateMusicControls();
}
function showAbout(){
  openPanel('FARWAKE · LOST EXPEDITIONS','Three final viewpoints',`<div class="panel-copy"><p>Three playable chapters, 93 years before Farwake: Nightglass on Luna, The Empty Track on Mars, and No Arrival Logged at an isolated outpost on Callisto.</p><p>You are the person still at each site. Repair a radio feed, restore a frozen camera, or secure a pressure door. Each local puzzle has a definite result. The wider cause is beyond these witnesses.</p><p><strong>Controls:</strong> tap scene arrows to move and dots to inspect. On phones, open Task for every action and the list of exits. Look closer offers optional details. The notebook keeps your own observations. Closing a panel returns you to the same view.</p><p><strong>Keyboard:</strong> Tab through controls, Enter or Space to activate, J for the notebook, H for help, M for sound, and Escape to close a panel. Left and right keys pan a cropped desktop view.</p><p>Each chapter saves separately in this browser. Old recovery progress starts fresh because the story has changed. Sound and display preferences are kept.</p><p><strong>Atmosphere:</strong> isolation, an unknown figure, a written scream and unexplained knocking. All sound clues have written equivalents. There are no timed reading challenges.</p></div><p class="credits">Created for Christopher Holtsnider’s DailyFlyer project. Fictional scene artwork generated for this game. Station effects are synthesized locally. ${escape(MENU_THEME.title)}: ${escape(MENU_THEME.credit)} Version ${STORY_VERSION}.</p>`);
}
function confirmRestart(){
  openPanel('RESTART CHAPTER',`Restart ${getChapter(state.chapter).title}?`,`<div class="panel-copy"><p>This replaces only this chapter’s progress. Your other chapters and sound and display settings are kept.</p></div><div class="inline-buttons"><button class="secondary-button" data-panel-action="close">Keep my progress</button><button class="primary-button" data-panel-action="confirm-restart">Restart this chapter</button></div>`);
}
function showEnding(){
  const ending=getEnding(state);if(!ending)return;
  const chapter=getChapter(state.chapter);
  openPanel(ERA.toUpperCase(),ending.title,`<p class="ending-label">${escape(chapter.character)} · ${escape(chapter.location)}</p><div class="panel-copy ending-prose">${ending.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</div><details class="ending-notes"><summary>Your last observations</summary><ul class="ending-details">${ending.details.map(p=>`<li>${escape(p)}</li>`).join('')}</ul></details><p class="credits">End of ${escape(chapter.title)}.</p><div class="inline-buttons"><button class="secondary-button" data-panel-action="journal-records">Read your notes</button><button class="secondary-button" data-panel-action="download">Download your notes</button><button class="secondary-button" data-panel-action="restart">Replay this chapter</button></div>`);
  $('#panel-done').textContent='Choose another chapter';$('#panel-done').dataset.panelAction='chapters';$('#panel-done').className='primary-button';
}
function downloadReport(){
  const ending=getEnding(state);if(!ending)return;
  const chapter=getChapter(state.chapter);
  const report=`FARWAKE: LOST EXPEDITIONS\n${chapter.title.toUpperCase()}\n${ERA}\n${chapter.character} · ${chapter.location}\n\n${ending.title}\n${ending.text}\n\nYOUR NOTES\n\n${recordOrder(state.chapter).filter(id=>state.records.includes(id)).map(id=>`${RECORDS[id].title}\n${RECORDS[id].source}\n${RECORDS[id].body}`).join('\n\n')}\n\n${chapter.fiction}\nVersion ${STORY_VERSION}\n`;
  const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`${state.chapter}-last-notes.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
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
    case 'about':showAbout();break;
    case 'chapters':void showChapterMenu();break;
    case 'restart':confirmRestart();break;
    case 'ending':showEnding();break;
    case 'download':downloadReport();break;
    case 'retry-music':void sound.start().then(updateMusicControls);break;
    case 'confirm-restart':state=initialState(state.chapter);lastScene=null;hintOpen=false;latestFeedback=null;persist();closePanel();void begin();break;
  }
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
