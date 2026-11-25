import { SCENES, RECORDS, RECORD_ORDER, CHAPTER } from './content.mjs';
import { initialState, hydrateState, perform, objective, availableActions, getEnding, sceneDescription } from './state.mjs';
import { NightglassAudio } from './audio.mjs';
import { mobileActions, mobileLabel } from './mobile-actions.mjs';

const SAVE_KEY = 'farwake.lost-expeditions.nightglass.v1';
const PREF_KEY = 'farwake.lost-expeditions.preferences.v1';
const $ = selector => document.querySelector(selector);
const countText = (count, word) => `${count} ${word}${count===1?'':'s'}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const rawSave = readLocal(SAVE_KEY);
let state = hydrateState(rawSave);
const rawPrefs = readLocal(PREF_KEY) || {};
const preferences = {
  sound: typeof rawPrefs.sound === 'boolean' ? rawPrefs.sound : true,
  volume: Number.isFinite(rawPrefs.volume) ? Math.max(0, Math.min(1, rawPrefs.volume)) : 0.5,
  markers: typeof rawPrefs.markers === 'boolean' ? rawPrefs.markers : true,
  labels: rawPrefs.labels === true,
  reducedMotion: typeof rawPrefs.reducedMotion === 'boolean' ? rawPrefs.reducedMotion : matchMedia('(prefers-reduced-motion: reduce)').matches
};
const sound = new NightglassAudio({ enabled: preferences.sound, volume: preferences.volume });
let active = false;
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
let dockTab = null;
let readingRecord = null;
let latestFeedback = null;
let expandedView = false;
const image = $('#scene-image');
const stage = $('#stage');
const panel = $('#panel');
const fieldControls = $('.field-controls');
document.body.classList.toggle('compact-layout', compact);

// Anchors are in the source photograph's coordinate system. Movement also has a
// persistent button, so a cropped panoramic edge never hides the way home.
const ANCHORS = {
  'read-dispatch':[43,63], 'check-return':[25,54],
  'take-photo':[28,33], 'read-survey-log':[65,62],
  'read-maintenance':[25,44], 'open-panel':[42,54],
  'power-inspection':[48,51], 'power-receiver':[69,48],
  'listen-receiver':[24,47], 'inspect-cable':[39,42],
  'compare-signal':[54,40], 'mute-receiver':[24,51],
  'redirect-receiver':[71,43], 'recover-recorder':[65,62],
  'publish-warning':[76,58], 'finish':[50,45]
};

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
  $('#sound-status').textContent=!preferences.sound?'Sound off · all clues remain readable':!audioAvailable?'Audio unavailable · written clues active':'Sound on · captions included';
}
function updateIntro(){
  $('#begin-button').textContent=state.completed?'Review completed expedition':hasProgress()?'Continue expedition':'Enter expedition';
  $('#intro-restart').hidden=!hasProgress();
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
  if(message) captionTimer=setTimeout(()=>{$('#scene-caption').textContent='';},duration);
}
function renderFeedback(){
  const el=$('#mobile-feedback');
  el.hidden=!compact||!latestFeedback||(readingRecord&&dockTab==='inspect');
  if(el.hidden)return;
  const message=latestFeedback.message;
  const first=message.match(/^(.+?[.!?])(?:\s|$)/s)?.[1]||message;
  const rest=message.slice(first.length).trim();
  el.innerHTML=rest?`<details ${latestFeedback.expanded?'open':''}><summary>${escape(first)}</summary><p>${escape(rest)}</p></details>`:`<p>${escape(message)}</p>`;
}
function setDock(value,{reset=true}={}){
  dockTab=value;
  fieldControls.dataset.dock=value;
  fieldControls.dataset.reading=String(Boolean(readingRecord));
  $('#inspect-tab').setAttribute('aria-pressed',String(value==='inspect'));
  $('#move-tab').setAttribute('aria-pressed',String(value==='move'));
  if(reset)$('.action-area').scrollTop=0;
  renderFeedback();
}
function clearReading(){
  readingRecord=null;$('#mobile-observation').hidden=true;
  fieldControls.dataset.reading='false';
  $('#inspect-count').textContent=countText(mobileActions(state,currentActions).interactions.filter(a=>!a.disabled).length,'object');
}
function clearObservation(){
  clearReading();
  setDock(mobileActions(state,currentActions).defaultTab);
}
function setExpanded(value){
  expandedView=compact&&value;
  $('#game').classList.toggle('view-expanded',expandedView);
  $('#view-toggle').textContent=expandedView?'Back to controls':'Expand view';
  $('#view-toggle').setAttribute('aria-expanded',String(expandedView));
  pan=0;requestAnimationFrame(positionScene);
}
function openPanel(kicker,title,html){
  if(!panel.open)panelReturn=document.activeElement;
  $('#panel-kicker').textContent=kicker;
  $('#panel-title').textContent=title;
  $('#panel-body').innerHTML=html;
  if(!panel.open)panel.showModal();
  panel.scrollTop=0;
  $('#panel-body').scrollTop=0;
  $('#panel-done').textContent=active?'Back to expedition':'Close';
}
function closePanel(){ panel.close(); }
panel.addEventListener('close',()=>{
  if(panelReturn?.isConnected&&!panel.contains(panelReturn))panelReturn.focus({preventScroll:true});
  else if(active)(compact?$('#inspect-tab'):stage).focus({preventScroll:true});
});
$('#close-panel').addEventListener('click',closePanel);
$('#panel-done').addEventListener('click',closePanel);
panel.addEventListener('click',event=>{if(event.target===panel){const b=panel.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closePanel();}});

function positionScene(){
  const rect=stage.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const iw=image.naturalWidth||1672, ih=image.naturalHeight||941;
  const fitWhole=compact&&!expandedView;
  const zoom=!fitWhole&&state.scene==='lower'?1.12:1;
  const scale=(fitWhole?Math.min:Math.max)(rect.width/iw,rect.height/ih)*zoom;
  const width=iw*scale,height=ih*scale;
  const maxPan=Math.max(0,(width-rect.width)/2);
  pan=Math.max(-maxPan,Math.min(maxPan,pan));
  const left=(rect.width-width)/2+pan,top=(rect.height-height)/2;
  Object.assign(image.style,{width:`${width}px`,height:`${height}px`,left:`${left}px`,top:`${top}px`});
  geometry={width,height,left,top,maxPan};
  for(const el of $('#scene-hotspots').children){
    const x=Number(el.dataset.x)/100*width+left,y=Number(el.dataset.y)/100*height+top;
    el.style.left=`${x}px`;el.style.top=`${y}px`;
    el.hidden=x<22||x>rect.width-22||y<(compact?58:75)||y>rect.height-(compact?28:35);
  }
  $('.pan-controls').hidden=!(compact&&expandedView&&maxPan>20);
  $('#pan-left').disabled=pan>=maxPan-1;
  $('#pan-right').disabled=pan<=-maxPan+1;
  $('#view-instruction').textContent=state.completed?'Recovery complete · review your notebook':maxPan>20?'Drag to look · select a marker to explore':currentActions.some(a=>a.kind!=='move'&&!a.disabled)?'Select an object · routes are below':'Choose a route below';
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
    const [x,y]=ANCHORS[action.id]||[action.x??50,action.y??60];
    button.dataset.x=x;button.dataset.y=y;
    button.innerHTML=`<span class="pin" aria-hidden="true"></span><span class="hotspot-label">${escape(compact?mobileLabel(action):action.label)}</span>`;
  }else{
    button.className=`action-button ${action.kind}`;
    if(compact){
      const lock=action.disabled?'<span class="action-lock" aria-hidden="true">◇</span>':'';
      const arrow=action.kind==='move'&&!action.disabled?'<span class="route-arrow" aria-hidden="true">→</span>':'';
      button.innerHTML=`<span class="action-label">${lock}${escape(action.label)}${arrow}</span>${action.disabled&&action.reason?`<small>${escape(action.reason)}</small>`:''}`;
    }else button.textContent=action.label;
    if(action.disabled)button.title=action.reason||'Inspect the nearby evidence first.';
  }
  return button;
}
function renderActions(){
  currentActions=availableActions(state);
  const touch=mobileActions(state,currentActions);
  const interactions=$('#interactions'),routes=$('#routes'),hotspots=$('#scene-hotspots');
  interactions.replaceChildren();routes.replaceChildren();hotspots.replaceChildren();
  const mobileInteractions=state.flags.signalCompared?[...touch.interactions].sort((a,b)=>Number(a.id==='listen-receiver')-Number(b.id==='listen-receiver')):touch.interactions;
  const presented=compact?[...mobileInteractions,...touch.routes]:currentActions;
  const hotspotIds=new Set((compact?touch.hotspots:currentActions.filter(a=>a.kind!=='move'&&!a.disabled&&!(a.id==='listen-receiver'&&currentActions.some(x=>x.id==='mute-receiver')))).map(a=>a.id));
  for(const action of presented){
    (action.kind==='move'?routes:interactions).append(actionButton(action));
    if(hotspotIds.has(action.id))hotspots.append(actionButton(action,true));
  }
  if(!interactions.children.length){const p=document.createElement('span');p.className='empty-actions';p.textContent=state.completed?'Your expedition record is complete.':'Nothing new to inspect here. Choose Move to continue; recovered clues stay in your notebook.';interactions.append(p);}
  if(!routes.children.length){const p=document.createElement('span');p.className='empty-actions';p.textContent='No further route from this position.';routes.append(p);}
  $('#inspect-count').textContent=readingRecord?'Reading':countText(touch.interactions.filter(a=>!a.disabled).length,'object');
  $('#move-count').textContent=countText(touch.routes.filter(a=>!a.disabled).length,'route');
  $('#mobile-record-count').textContent=countText(state.records.length,'record');
  $('#mobile-journal-button').setAttribute('aria-label',`Open field notebook · ${state.records.length} records`);
  setDock(dockTab||touch.defaultTab,{reset:false});
  positionScene();
}
function render(){
  const scene=SCENES[state.scene];
  $('#header-location').textContent=scene.title.toUpperCase();
  $('#scene-subtitle').textContent=scene.subtitle.toUpperCase();
  $('#scene-title').textContent=scene.title;
  image.alt=sceneDescription(state);
  $('#record-count').textContent=state.records.length;
  $('#journal-button').setAttribute('aria-label',`Open field notebook · ${state.records.length} records`);
  const task=objective(state);
  $('#objective-title').textContent=task.title;$('#objective-text').textContent=task.text;
  $('#hint-box').textContent=task.hint;$('#hint-box').hidden=!hintOpen;
  $('#hint-button').textContent=hintOpen?'Hide lead':'Need a lead?';
  document.body.classList.toggle('inspection-on',!!state.flags.inspectionPowered&&['junction','service','shaft','lower'].includes(state.scene));
  $('#scene-status').textContent=state.completed?'EXPEDITION RECOVERED':state.receiverMode==='mute'?'RECEIVER ISOLATED':state.receiverMode==='redirect'?'RETURN ROUTE LIT':'RETURN ROUTE AVAILABLE';
  renderActions();
  sound.setScene(state.scene,state);
  if(lastScene!==state.scene){
    lastScene=state.scene;pan=0;
    const token=++sceneToken,source=`assets/${scene.image}.webp`;
    stage.classList.add('changing');
    const preload=new Image();
    preload.onload=()=>{if(token!==sceneToken)return;image.src=source;stage.classList.remove('changing');$('#scene-loading').hidden=true;requestAnimationFrame(positionScene);};
    preload.onerror=()=>{if(token!==sceneToken)return;stage.classList.remove('changing');$('#scene-loading').hidden=true;toast('This view could not load. Your progress is safe; reload to try again.');};
    preload.src=source;
    setTimeout(()=>{if(token===sceneToken&&!preload.complete)$('#scene-loading').hidden=false;},400);
    caption(sceneDescription(state),7500);
  }
  updateIntro();
}

async function begin(){
  active=true;$('#intro').hidden=true;
  $('#game').inert=false;
  audioAvailable=await sound.start();applyPreferences();render();persist();
  if(state.completed)showEnding();else stage.focus({preventScroll:true});
}
$('#begin-button').addEventListener('click',begin);
$('#home-button').addEventListener('click',()=>{sound.pause();active=false;$('#intro').hidden=false;$('#game').inert=true;updateIntro();$('#begin-button').focus();});
$('#intro-restart').addEventListener('click',confirmRestart);
function showHint(){
  if(compact){const task=objective(state);openPanel('CURRENT TASK',task.title,`<div class="panel-copy"><p>${escape(task.text)}</p><p>${escape(task.hint)}</p></div>`);}
  else{hintOpen=!hintOpen;render();}
}
$('#hint-button').addEventListener('click',showHint);
$('#settings-button').addEventListener('click',showSettings);
$('#journal-button').addEventListener('click',()=>showJournal());
$('#mobile-journal-button').addEventListener('click',()=>showJournal());
$('#inspect-tab').addEventListener('click',()=>{clearReading();setDock('inspect');});
$('#move-tab').addEventListener('click',()=>setDock('move'));
$('#view-toggle').addEventListener('click',()=>setExpanded(!expandedView));
$('#pan-left').addEventListener('click',()=>{pan+=Math.max(100,stage.clientWidth*.55);positionScene();});
$('#pan-right').addEventListener('click',()=>{pan-=Math.max(100,stage.clientWidth*.55);positionScene();});
$('#mobile-observation').addEventListener('click',event=>{if(event.target.closest('[data-return-objects]'))clearObservation();});
$('#mobile-feedback').addEventListener('toggle',event=>{if(latestFeedback&&event.target.matches('details'))latestFeedback.expanded=event.target.open;},true);
$('#about-button').addEventListener('click',showAbout);

function execute(actionId){
  if(!active||state.completed)return;
  const entry=currentActions.find(a=>a.id===actionId);
  if(!entry)return;
  clearReading();
  if(entry.disabled){
    if(compact){caption(entry.reason||'Inspect the evidence nearby first.');latestFeedback.expanded=true;renderFeedback();}
    else toast(entry.reason||'Inspect the evidence nearby first.');
    return;
  }
  const result=perform(state,actionId);
  state=result.state;
  if(entry.kind==='move'){
    readingRecord=null;$('#mobile-observation').hidden=true;dockTab=null;hintOpen=false;
    setExpanded(false);$('.action-area').scrollTop=0;
  }else if(compact){dockTab='inspect';setExpanded(false);}
  render();persist();
  if(result.event)sound.cue(result.event);
  if(result.record){if(compact)showObservation(result.record);else showRecord(result.record);}
  else if(result.message){
    caption(result.message,result.event==='redirect'?9500:6500);
    if(compact){
      latestFeedback.expanded=['redirect','receiver','diagnosis'].includes(result.event);
      if(entry.kind!=='move'&&mobileActions(state,currentActions).defaultTab==='move')setDock('move');
      else renderFeedback();
    }
  }
  if(state.completed)showEnding();
}
document.addEventListener('click',event=>{const action=event.target.closest('[data-action]');if(action){event.preventDefault();execute(action.dataset.action);}});

function recordPhoto(record){
  return record.kind==='photo'?`<figure class="archive-photo"><img src="assets/shaft.webp" alt="A survey reference view of the receiver and side shaft, annotated with the independent return circuit."><span class="photo-annotation">RETURN SUPPLY<br>Keep independent</span><figcaption>NIGHTGLASS / REFERENCE VIEW / BEFORE SERVICE WORK</figcaption></figure>`:'';
}
function showObservation(id){
  const record=RECORDS[id];if(!record||!state.records.includes(id))return;
  readingRecord=id;latestFeedback=null;
  const continueText=mobileActions(state,currentActions).defaultTab==='move'?'Continue to routes':'Back to objects';
  const observation=$('#mobile-observation');
  observation.innerHTML=`<div class="observation-heading"><button data-return-objects>← ${continueText}</button><span>Saved to notebook</span></div><h3>${escape(record.title)}</h3>${recordPhoto(record)}<p class="record-meta">${escape(record.source)}</p><p class="observation-copy">${escape(record.body)}</p>`;
  observation.hidden=false;
  $('#inspect-count').textContent='Reading';
  setDock('inspect');
}
function showRecord(id){
  if(!state.records.includes(id)||!RECORDS[id])return;
  const record=RECORDS[id];
  const photograph=recordPhoto(record);
  openPanel(record.kind==='audio'?'RECOVERED TRANSCRIPT':record.kind==='photo'?'REFERENCE PHOTOGRAPH':'PHYSICAL RECORD',record.title,`${photograph}<p class="record-meta">${escape(record.source)}</p><div class="panel-copy"><p>${escape(record.body)}</p></div><div class="inline-buttons"><button class="secondary-button" data-panel-action="back-journal">All records</button><button class="primary-button" data-panel-action="close">Return to expedition</button></div>`);
}
function showJournal(tab='records'){
  const tabs=`<div class="notebook-tabs"><button data-panel-action="journal-records" class="${tab==='records'?'active':''}">Records (${state.records.length})</button><button data-panel-action="journal-route" class="${tab==='route'?'active':''}">Your route</button></div>`;
  let body;
  if(tab==='route'){
    body=`<div class="panel-copy"><p>The route stays where you left it. Return through the service junction to reach the airlock.</p></div><div class="route-map">${Object.values(SCENES).map(scene=>`<div class="route-node ${state.scene===scene.id?'current':''} ${!state.visited.includes(scene.id)?'unknown':''}">${state.visited.includes(scene.id)?escape(scene.title):'Unvisited'}<small>${state.scene===scene.id?'You are here':state.visited.includes(scene.id)?'Previously visited':'Not yet recorded'}</small></div>`).join('')}</div>`;
  }else{
    const ids=RECORD_ORDER.filter(id=>state.records.includes(id));
    body=ids.length?`<div class="record-list">${ids.map(id=>`<button class="record-entry" data-record="${id}"><span><strong>${escape(RECORDS[id].title)}</strong><small>${escape(RECORDS[id].source)}</small></span><span aria-hidden="true">＋</span></button>`).join('')}</div>`:'<div class="panel-copy"><p>Your notebook is empty. Read the field dispatch at the approach, then look for photographs and records inside.</p></div>';
  }
  openPanel(CHAPTER.archive.toUpperCase(),'Field notebook',tabs+body+(state.completed?'<div class="inline-buttons"><button class="primary-button" data-panel-action="ending">View expedition report</button></div>':''));
}
function showSettings(){
  openPanel('EXPEDITION SETTINGS','Make yourself comfortable',`
    <div class="setting-row"><label for="pref-sound">Sound<small>All recorded information is also available as text.</small></label><input id="pref-sound" type="checkbox" ${preferences.sound?'checked':''}></div>
    <div class="setting-row"><label for="pref-volume">Volume</label><input id="pref-volume" type="range" min="0" max="1" step=".05" value="${preferences.volume}" aria-label="Sound volume"></div>
    <div class="setting-row"><label for="pref-markers">Scene markers<small>Available actions always remain below the view.</small></label><input id="pref-markers" type="checkbox" ${preferences.markers?'checked':''}></div>
    <div class="setting-row"><label for="pref-labels">Always show marker labels<small>Helpful when learning the controls.</small></label><input id="pref-labels" type="checkbox" ${preferences.labels?'checked':''}></div>
    <div class="setting-row"><label for="pref-motion">Reduce motion<small>Use immediate transitions between viewpoints.</small></label><input id="pref-motion" type="checkbox" ${preferences.reducedMotion?'checked':''}></div>
    <div class="settings-foot"><button class="secondary-button" data-panel-action="about">About & controls</button><button class="secondary-button" data-panel-action="restart">Start over</button></div>
    <p class="credits">Your progress and settings are saved only in this browser. This game has no accounts, analytics, or online save sync.</p>`);
}
function showAbout(){
  openPanel('FARWAKE · LOST EXPEDITIONS','Nightglass',`<div class="panel-copy"><p>${escape(CHAPTER.fiction)}</p><p>A complete first case in a planned collection of expedition mysteries. You are a recovery operator on Luna. Follow the physical evidence, recover the recorder, and leave a useful warning.</p><p><strong>Mouse or touch:</strong> select a labeled object or an action. On a phone, Inspect and Move stay at the bottom; the full scene fits the view. Expand view lets you look closer, with left and right buttons. Desktop views can be dragged sideways when cropped.</p><p><strong>Keyboard:</strong> Tab through controls, Enter or Space to activate, J for the notebook, H for a lead, M to toggle sound, and Escape to close a panel. Left and right keys pan the view.</p><p>The field notebook preserves every record you read. You can leave, reload, and continue. Clearing this browser’s site data removes the save.</p><p><strong>Atmosphere:</strong> isolation, an imitated call, and brief implied animal movement. There are no flashing jump scares, death loops, or timed reading challenges.</p></div><p class="credits">Created for Christopher Holtsnider’s DailyFlyer project. Original Farwake setting and Nightglass adaptation. Fictional scene artwork generated for this game; it is not authentic lunar photography. Sound is generated locally. Version 0.1.1.</p><div class="inline-buttons"><button class="primary-button" data-panel-action="close">Close</button></div>`);
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
  const report=`FARWAKE: LOST EXPEDITIONS\nNIGHTGLASS — FIELD REPORT\n\n${ending.title}\n${ending.text}\n\n${ending.details.join('\n')}\n\nRECOVERED RECORDS\n\n${RECORD_ORDER.filter(id=>state.records.includes(id)).map(id=>`${RECORDS[id].title}\n${RECORDS[id].source}\n${RECORDS[id].body}`).join('\n\n')}\n\n${CHAPTER.fiction}\nVersion 0.1.1\n`;
  const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='nightglass-field-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
panel.addEventListener('click',event=>{
  const record=event.target.closest('[data-record]');if(record){showRecord(record.dataset.record);return;}
  const control=event.target.closest('[data-panel-action]');if(!control)return;
  switch(control.dataset.panelAction){
    case 'close':closePanel();break;
    case 'back-journal':case 'journal-records':showJournal();break;
    case 'journal-route':showJournal('route');break;
    case 'about':showAbout();break;
    case 'restart':confirmRestart();break;
    case 'ending':showEnding();break;
    case 'download':downloadReport();break;
    case 'confirm-restart':state=initialState();lastScene=null;hintOpen=false;readingRecord=null;latestFeedback=null;dockTab=null;$('#mobile-observation').hidden=true;setExpanded(false);persist();closePanel();begin();break;
  }
});
panel.addEventListener('change',async event=>{
  switch(event.target.id){
    case 'pref-sound':preferences.sound=event.target.checked;sound.setEnabled(preferences.sound);if(preferences.sound)audioAvailable=await sound.start();break;
    case 'pref-volume':preferences.volume=Number(event.target.value);break;
    case 'pref-markers':preferences.markers=event.target.checked;break;
    case 'pref-labels':preferences.labels=event.target.checked;break;
    case 'pref-motion':preferences.reducedMotion=event.target.checked;break;
    default:return;
  }
  savePreferences();
});
panel.addEventListener('input',event=>{if(event.target.id==='pref-volume'){preferences.volume=Number(event.target.value);sound.setVolume(preferences.volume);}});
document.addEventListener('keydown',async event=>{
  if(!active||panel.open||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  switch(event.key.toLowerCase()){
    case 'j':event.preventDefault();showJournal();break;
    case 'h':event.preventDefault();showHint();break;
    case 'm':event.preventDefault();preferences.sound=!preferences.sound;sound.setEnabled(preferences.sound);if(preferences.sound)audioAvailable=await sound.start();savePreferences();toast(preferences.sound?'Sound on':'Sound off');break;
    case 'arrowleft':if(geometry?.maxPan>0){event.preventDefault();pan+=70;positionScene();}break;
    case 'arrowright':if(geometry?.maxPan>0){event.preventDefault();pan-=70;positionScene();}break;
    case 'escape':if(expandedView)setExpanded(false);break;
  }
});
let pointer=null;
stage.addEventListener('pointerdown',event=>{
  if(event.target.closest('button')||!active||!geometry?.maxPan||(compact&&!expandedView))return;
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
  dockTab=null;setExpanded(false);render();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.pause();else if(active)sound.resume();});
window.addEventListener('pagehide',()=>sound.pause());
window.addEventListener('pageshow',()=>{if(active)sound.resume();});
$('#game').inert=true;
applyPreferences();updateIntro();render();
