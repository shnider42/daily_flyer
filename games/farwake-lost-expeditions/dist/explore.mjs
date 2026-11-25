import { NightglassWorld } from './world3d.mjs';
import { SCENES, RECORDS, RECORD_ORDER, CHAPTER } from './content.mjs';
import { initialState, hydrateState, availableActions, perform, getEnding } from './state.mjs';
import { missionStatus, MISSION_BRIEF } from './mission.mjs';
import { mobileActions } from './mobile-actions.mjs';
import { NightglassAudio } from './audio.mjs';

const SAVE_KEY='farwake.lost-expeditions.nightglass.v1';
const PREF_KEY='farwake.lost-expeditions.preferences.v1';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readLocal=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
let state=hydrateState(readLocal(SAVE_KEY));
const rawPrefs=readLocal(PREF_KEY)||{};
const preferences={sound:typeof rawPrefs.sound==='boolean'?rawPrefs.sound:true,volume:Number.isFinite(rawPrefs.volume)?Math.max(0,Math.min(1,rawPrefs.volume)):.5,...(typeof rawPrefs.reducedMotion==='boolean'?{reducedMotion:rawPrefs.reducedMotion}:{})};
const sound=new NightglassAudio({enabled:preferences.sound,volume:preferences.volume});
const canvas=$('#world'),panel=$('#panel');
let world=null,started=false,focus=null,pendingAction=null,panelReturn=null,pointer=null,walkingPointer=null;
let keys=new Set(),audioAvailable=true,failed=false,autoWalking=false;
const controlTip=()=>!matchMedia('(pointer: coarse)').matches&&innerWidth>800?'WASD to move · Drag to look · E to interact':'Drag to look · Tap the floor to walk';
function walkingChanged(value){autoWalking=value;$('#walk-button > span').textContent=value?'■':'↑';$('#walk-button small').textContent=value?'Stop walking':'Hold to walk';$('#walk-button').setAttribute('aria-label',value?'Stop walking':'Hold to walk forward');$('#controls-tip').textContent=value?'Walking… tap Stop to pause':controlTip();}

function persist(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));$('#save-notice').textContent='Progress saved on this device';}
  catch{$('#save-notice').textContent='Saving unavailable · keep this tab open';}
}
function savePreferences(){try{localStorage.setItem(PREF_KEY,JSON.stringify({...rawPrefs,...preferences}));}catch{/* Controls remain usable. */}}
function feedback(message){$('#feedback').textContent=message||'';$('#feedback').hidden=!message;$('#controls-tip').hidden=Boolean(message);}
function resetMotion(){pointer=null;pendingAction=null;keys.clear();world?.stop();walkingPointer=null;$('#walk-button').setAttribute('data-held','false');world?.setMotion({forward:0,strafe:0});}
function updateActivity(){
  const active=started&&!panel.open&&!document.hidden&&!state.completed;
  world?.setActive(active);
  if(!active){resetMotion();sound.pause();}else sound.resume();
}
function render(){
  $('#location-title').textContent=SCENES[state.scene].title;
  const task=missionStatus(state);
  $('#mission-phase').textContent=state.completed?'RECOVERY COMPLETE':state.flags.warningPublished?'RETURN TO THE AIRLOCK':state.flags.recorderRecovered?'WARN THE NEXT CREW':'RECOVER THE RECORDER';
  $('#task-title').textContent=task.title;
  $('#task-text').textContent=task.text;
  $('#begin-button').textContent=state.completed?'Read your recovery report':state.moves||state.records.length?'Resume the recovery':'Begin the recovery';
  $('#notebook-button').setAttribute('aria-label',`Open notebook · ${state.records.length} records`);
  sound.setScene(state.scene,state);
  world?.setState(state);
  updateFocus(focus);
}
function updateFocus(item){
  focus=item;
  const entry=item&&availableActions(state).find(a=>a.id===item.actionId&&!a.disabled);
  const enabled=Boolean(entry)&&!state.completed;
  $('#interact-button').disabled=!enabled;
  $('#interact-label').textContent=enabled?entry.label:state.completed?'Recovery complete':'Look toward an object';
  $('#interact-detail').textContent=enabled?'Tap to inspect or use':'Or tap Nearby for room actions';
  if(entry&&pendingAction===entry.id){
    const id=pendingAction;pendingAction=null;
    queueMicrotask(()=>{if(started&&!panel.open)execute(id);});
  }
}
function changeScene(sceneId){
  if(sceneId===state.scene||state.completed)return;
  const entry=availableActions(state).find(a=>a.id===`go:${sceneId}`&&!a.disabled);
  if(!entry){world?.setState(state);return;}
  state=perform(state,entry.id).state;
  pendingAction=null;focus=null;feedback('');render();persist();sound.cue('step');
}
function execute(id){
  if(!started||state.completed)return;
  const entry=availableActions(state).find(a=>a.id===id);
  if(!entry)return;
  if(entry.disabled){feedback(entry.reason);return;}
  if(entry.kind==='move'){pendingAction=null;if(world?.walkTo(entry.target)===false)feedback('This route is blocked. Check the current task or choose another doorway.');return;}
  resetMotion();
  const result=perform(state,id);state=result.state;pendingAction=null;
  render();persist();if(result.event)sound.cue(result.event);
  if(result.record){feedback('');showRecord(result.record);}
  else feedback(result.message);
  if(state.completed){updateActivity();showEnding();}
}
function approachAction(id){
  const entry=availableActions(state).find(a=>a.id===id);
  if(!entry)return;
  if(entry.disabled){feedback(entry.reason);return;}
  if(entry.kind==='move'){pendingAction=null;feedback('');if(world?.walkTo(entry.target)===false)feedback('This route is blocked. Check the current task or choose another doorway.');return;}
  if(focus?.actionId===id){execute(id);return;}
  pendingAction=id;
  if(world?.focusAction(id)===false){pendingAction=null;feedback('Move closer to the equipment, then try again.');}
  else feedback(`Approaching: ${entry.label.toLowerCase()}.`);
}
function openPanel(kicker,title,html){
  if(!panel.open)panelReturn=document.activeElement;
  resetMotion();
  $('#panel-kicker').textContent=kicker;$('#panel-title').textContent=title;$('#panel-body').innerHTML=html;
  $('#panel-done').textContent=`Back to ${SCENES[state.scene].title.toLowerCase()}`;
  if(!panel.open)panel.showModal();
  $('#panel-body').scrollTop=0;updateActivity();
}
function closePanel(){panel.close();updateActivity();}
panel.addEventListener('close',()=>{
  if(panelReturn?.isConnected&&!panel.contains(panelReturn))panelReturn.focus({preventScroll:true});else canvas.focus({preventScroll:true});
  updateActivity();
});
$('#close-panel').addEventListener('click',closePanel);$('#panel-done').addEventListener('click',closePanel);
panel.addEventListener('click',event=>{if(event.target===panel){const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePanel();}});

function showAssignment(){
  const task=missionStatus(state);
  const steps=[['Recover the field recorder',state.flags.recorderRecovered],['Warn the next crew',state.flags.warningPublished],['Return to the airlock',state.completed]];
  let currentShown=false;
  const list=steps.map(([label,done])=>{const current=!done&&!currentShown;if(current)currentShown=true;return `<li class="${current?'current':''}"><span class="check" aria-hidden="true">${done?'✓':current?'→':'○'}</span>${escape(label)}${done?' · done':''}</li>`;}).join('');
  openPanel('RECOVERY ASSIGNMENT','Bring back the record',`<div class="panel-copy"><p>${escape(MISSION_BRIEF)}</p></div><ul class="mission-checklist">${list}</ul><div class="panel-copy"><h3>${escape(task.title)}</h3><p>${escape(task.text)}</p><p>${escape(task.hint)}</p><p class="credits">You are investigating the earlier crew’s expedition. You are not playing as that missing crew. The green lights mark the route back outside.</p></div>`);
}
function recordNotes(record){return record.kind==='photo'?'<div class="reference-notes"><p class="eyebrow">ANNOTATIONS ON THE SURVEY PHOTOGRAPH</p><p>Receiver → central passage<br>White lead → listening input<br>Side-shaft socket → capped<br>Green exit cable → separate supply</p></div>':'';}
function showRecord(id){
  if(!state.records.includes(id)||!RECORDS[id])return;
  const record=RECORDS[id],task=missionStatus(state);
  openPanel(record.kind==='audio'?'RECOVERED TRANSCRIPT':'RECOVERED RECORD',record.title,`${recordNotes(record)}<p class="record-source">${escape(record.source)}</p><div class="panel-copy"><p>${escape(record.body)}</p><h3>Next: ${escape(task.title.toLowerCase())}</h3><p>${escape(task.text)}</p></div>`);
}
function showNotebook(){
  const records=RECORD_ORDER.filter(id=>state.records.includes(id));
  openPanel('LILT LIBRARY · FIELD RECORDS','Your notebook',records.length?`<div class="record-list">${records.map(id=>`<button class="record-entry" data-record="${id}">${escape(RECORDS[id].title)}<small>${escape(RECORDS[id].source)}</small></button>`).join('')}</div>${state.completed?'<div class="panel-links"><button data-panel="ending">Recovery report</button></div>':''}`:'<div class="panel-copy"><p>Your first record is the recovery assignment outside the airlock. Every record you read will stay here.</p></div>');
}
function showNearby(){
  if(state.completed){showEnding();return;}
  const {interactions,routes}=mobileActions(state,availableActions(state)),task=missionStatus(state);
  const button=a=>`<button class="room-action ${a.id===task.nextActionId?'recommended':''}" data-room-action="${escape(a.id)}" ${a.disabled?'aria-disabled="true"':''}>${escape(a.label)}${a.disabled?`<small>${escape(a.reason)}</small>`:a.kind==='move'?'<small>Walk through this doorway</small>':'<small>Approach and inspect</small>'}</button>`;
  openPanel('YOUR SURROUNDINGS',SCENES[state.scene].title,`<div class="panel-copy"><p>${escape(task.text)}</p></div>${interactions.length?`<p class="section-label">EQUIPMENT AND RECORDS</p><div class="room-actions">${interactions.map(button).join('')}</div>`:''}<p class="section-label">CONNECTED ROOMS</p><div class="room-actions">${routes.map(button).join('')}</div><p class="credits">Choose a destination to walk there. You can also explore freely by tapping the floor and dragging the view.</p>`);
}
function showSettings(){
  openPanel('CONTROLS & SETTINGS','Explore at your pace',`<div class="panel-copy"><p><strong>Touch:</strong> drag across the scene to look. Tap the floor or a doorway to walk there. Tap equipment to approach and inspect it. Hold the ↑ button to keep walking forward; release to stop.</p><p><strong>Keyboard:</strong> W, A, S, D or arrow keys to move. Drag with the mouse to look. E or Enter uses the nearby object. J opens your notebook; H opens your assignment. Nearby lists the equipment and connected rooms.</p><p>There are no timed tasks or death loops. Reading pauses movement.</p></div><div class="setting-row"><label for="pref-sound">Sound<small>Every clue is also written.</small></label><input id="pref-sound" type="checkbox" ${preferences.sound?'checked':''}></div><div class="setting-row"><label for="pref-volume">Volume</label><input id="pref-volume" type="range" min="0" max="1" step=".05" value="${preferences.volume}"></div><div class="panel-links"><button data-panel="assignment">Your assignment</button><a href="index.html">Snapshot version</a><button data-panel="restart">Start over</button></div><p class="credits">A fictional Farwake expedition. This is a 3D movement preview, with simplified station artwork. Your progress is shared with the snapshot view on this browser. ${world?.rendererMode==='basic'?'Basic graphics are active in this browser. ':''}Version 0.2.0.</p>`);
}
function confirmRestart(){openPanel('NEW RECOVERY','Start from the beginning?',`<div class="panel-copy"><p>This replaces the Nightglass progress saved in both views on this browser. Your sound settings stay the same.</p></div><div class="panel-links"><button data-panel="close">Keep my progress</button><button data-panel="restart-confirmed">Start over</button></div>`);}
function showEnding(){
  const ending=getEnding(state);if(!ending)return;
  openPanel('RECOVERY COMPLETE',ending.title,`<div class="panel-copy"><p>${escape(ending.text)}</p><ul class="ending-details">${ending.details.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><p>${state.records.length} of ${RECORD_ORDER.length} records preserved. Your route remained lit.</p></div><div class="panel-links"><button data-panel="download">Download field report</button><button data-panel="notebook">Your records</button><button data-panel="restart">Try another approach</button></div><p class="credits">Filed with the Lilt Library, Vesper. The local incident has an explanation. The earlier crew’s later movements remain unconfirmed.</p>`);
}
function downloadReport(){
  const ending=getEnding(state);if(!ending)return;
  const report=`FARWAKE: LOST EXPEDITIONS\nNIGHTGLASS — FIELD REPORT\n\n${ending.title}\n${ending.text}\n\n${ending.details.join('\n')}\n\nRECOVERED RECORDS\n\n${RECORD_ORDER.filter(id=>state.records.includes(id)).map(id=>`${RECORDS[id].title}\n${RECORDS[id].source}\n${RECORDS[id].body}`).join('\n\n')}\n\n${CHAPTER.fiction}\nVersion 0.2.0\n`;
  const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='nightglass-field-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
panel.addEventListener('click',event=>{
  const record=event.target.closest('[data-record]');if(record){showRecord(record.dataset.record);return;}
  const action=event.target.closest('[data-room-action]');if(action){const id=action.dataset.roomAction;closePanel();approachAction(id);return;}
  switch(event.target.closest('[data-panel]')?.dataset.panel){
    case 'close':closePanel();break;case 'assignment':showAssignment();break;case 'notebook':showNotebook();break;
    case 'restart':confirmRestart();break;case 'ending':showEnding();break;case 'download':downloadReport();break;
    case 'restart-confirmed':state=initialState();pendingAction=null;focus=null;feedback('');world?.reset?.(state);render();persist();closePanel();break;
  }
});
panel.addEventListener('change',async event=>{
  if(event.target.id==='pref-sound'){preferences.sound=event.target.checked;sound.setEnabled(preferences.sound);if(preferences.sound)audioAvailable=await sound.start();savePreferences();updateActivity();}
});
panel.addEventListener('input',event=>{if(event.target.id==='pref-volume'){preferences.volume=Number(event.target.value);sound.setVolume(preferences.volume);savePreferences();}});
$('#assignment-button').addEventListener('click',showAssignment);$('#notebook-button').addEventListener('click',showNotebook);$('#menu-button').addEventListener('click',showSettings);$('#nearby-button').addEventListener('click',showNearby);
$('#interact-button').addEventListener('click',()=>{if(focus)execute(focus.actionId);});

canvas.addEventListener('pointerdown',event=>{
  if(!started||panel.open||failed||state.completed||event.button>0||pointer)return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,dragged:false};
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  if(!pointer||pointer.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>6)pointer.dragged=true;
  if(pointer.dragged){pendingAction=null;world.look(event.clientX-pointer.lastX,event.clientY-pointer.lastY);}
  pointer.lastX=event.clientX;pointer.lastY=event.clientY;
});
canvas.addEventListener('pointerup',event=>{
  if(!pointer||pointer.id!==event.pointerId)return;
  const tap=!pointer.dragged;pointer=null;
  if(!tap)return;
  const target=world.pick(event.clientX,event.clientY);if(!target)return;
  if(target.actionId){if(target.reachable)execute(target.actionId);else approachAction(target.actionId);}
  else if(target.point){pendingAction=null;feedback('');if(world.walkToPoint(target.point)===false)feedback('That point is beyond the walkable route. Choose a clear part of the floor or a doorway.');}
  else if(target.sceneId){const route=availableActions(state).find(a=>a.target===target.sceneId);if(route?.disabled)feedback(route.reason);else{pendingAction=null;feedback('');if(world.walkTo(target.sceneId)===false)feedback('That doorway is not available yet. Check your current task.');}}
});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
function motionFromKeys(){world?.setMotion({forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),strafe:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});}
$('#walk-button').addEventListener('pointerdown',event=>{if(!started||panel.open||state.completed)return;event.preventDefault();pendingAction=null;if(autoWalking){world.stop();return;}walkingPointer=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.setAttribute('data-held','true');world.setMotion({forward:1,strafe:0});});
const stopWalking=event=>{if(walkingPointer===event.pointerId){walkingPointer=null;$('#walk-button').setAttribute('data-held','false');world?.setMotion({forward:0,strafe:0});}};
$('#walk-button').addEventListener('pointerup',stopWalking);$('#walk-button').addEventListener('pointercancel',stopWalking);$('#walk-button').addEventListener('lostpointercapture',stopWalking);
$('#walk-button').addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(autoWalking)world?.stop();else world?.setMotion({forward:1,strafe:0});}});
$('#walk-button').addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();world?.setMotion({forward:0,strafe:0});}});
document.addEventListener('keydown',event=>{
  if(!started||panel.open||failed||state.completed||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.altKey||event.metaKey||event.ctrlKey)return;
  const key=event.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){event.preventDefault();pendingAction=null;keys.add(key);motionFromKeys();}
  else if(key==='j'){event.preventDefault();showNotebook();}
  else if(key==='h'){event.preventDefault();showAssignment();}
  else if(key==='e'||(key==='enter'&&event.target===canvas)){event.preventDefault();if(focus)execute(focus.actionId);}
});
document.addEventListener('keyup',event=>{keys.delete(event.key.toLowerCase());if(!walkingPointer)motionFromKeys();});
window.addEventListener('blur',()=>{resetMotion();world?.setActive(false);sound.pause();});
window.addEventListener('focus',updateActivity);
window.addEventListener('resize',()=>{if(!autoWalking)$('#controls-tip').textContent=controlTip();});
document.addEventListener('visibilitychange',updateActivity);
window.addEventListener('pagehide',()=>{resetMotion();world?.setActive(false);sound.pause();});
window.addEventListener('pageshow',updateActivity);

async function begin(){
  if(failed||!world)return;
  started=true;$('#start-screen').hidden=true;$('#expedition').inert=false;
  audioAvailable=await sound.start();render();persist();updateActivity();
  if(!audioAvailable)feedback('Audio is unavailable here. Every sound clue is also written.');
  if(state.completed)showEnding();else canvas.focus({preventScroll:true});
}
function showFailure(){
  if(failed)return;failed=true;started=false;$('#start-screen').hidden=false;$('#expedition').inert=true;
  $('#begin-button').textContent='3D is unavailable in this browser';$('#begin-button').disabled=true;
  $('#start-controls').innerHTML='Your progress is safe. Open the <a href="index.html">snapshot version</a> to continue.';
}
$('#begin-button').addEventListener('click',begin);
$('#expedition').inert=true;
try{
  world=new NightglassWorld({canvas,onSceneChange:changeScene,onInteract:execute,onFocus:updateFocus,onWalkingChange:walkingChanged,onError:showFailure});
  render();world.setActive(false);if(!failed)$('#begin-button').disabled=false;
  if(world.rendererMode==='basic')$('.preview-note').textContent='3D movement preview · Basic graphics · Version 0.2.0';
  if(!matchMedia('(pointer: coarse)').matches&&innerWidth>800){$('#controls-tip').textContent='WASD to move · Drag to look · E to interact';$('#start-controls').innerHTML='WASD to move. Drag to look. E to interact.<br>You can also click the floor or use Nearby. All sound clues are readable.';}
}catch(error){console.error('Nightglass 3D could not start:',error);showFailure();}
