import {VERSION,LEVELS,ROOMS,OBJECTS,ITEMS,newGame,reduce,availableRooms,getObjects,isDone,objective,getHints,scanPhase,validateSave} from './world.mjs';
import {createScene} from './scene.js';
import {FirstPersonControls} from './controls.js';
import {CoopClient} from './network.js';
import {PrisonAudio} from './audio.js';
import {DEFAULT_SETTINGS,SETTING_RANGES,loadSettings,saveSettings,normalizeSettings} from './settings.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAVE='night-transfer.solo.v1';
const preferenceStorage={getItem:key=>globalThis.localStorage.getItem(key),setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state=newGame(),roomId=LEVELS[0].startRoom,mode='menu',scene,controls,network,selected=null,dialogKind='',dialogData=null;
let pending=new Map(),roster=[],peers=[],teamIntent=false,connected=false,slotOwner=null,tipUntil=0,toastTimer,frame=0,lastFrame=0,lastUi=0,lastPresence=0,lastSave=0,currentTarget=null,elapsedSeconds=0,completedShown=false;
let settings=loadSettings(preferenceStorage,matchMedia('(prefers-reduced-motion: reduce)').matches);
let sound,settingsTab='controls',lookUsed=false,moveUsed=false,previewTimer;
const publicRoom=room=>ROOMS[room]?.title||room;
const levelTitle=level=>LEVELS[level]?.shortTitle||LEVELS[level]?.title||`Wing ${level+1}`;
const now=()=>mode==='coop'&&network?network.serverNow:Date.now();

function readSave(){
  try{
    const raw=JSON.parse(localStorage.getItem(SAVE)||'null');if(!raw||raw.version!==1)return null;
    const valid=validateSave(raw.state);if(!valid)return null;
    return {...raw,state:valid,room:availableRooms(valid).some(r=>r.id===raw.room)?raw.room:LEVELS[valid.level].startRoom};
  }catch{return null;}
}
function refreshMenu(){const saved=readSave();$('continue-btn').hidden=!saved||saved.state.won;$('save-note').textContent=saved&&!saved.state.won?`Saved escape · ${levelTitle(saved.state.level)} · ${publicRoom(saved.room)}`:'A first-person escape. No account. No download.';}
function claimSave(){slotOwner=uid();saveSolo(true);}
function saveSolo(claim=false){
  if(mode!=='solo'||document.hidden||!slotOwner)return;
  try{
    const previous=JSON.parse(localStorage.getItem(SAVE)||'null');
    if(!claim&&previous?.owner&&previous.owner!==slotOwner){slotOwner=null;toast('A newer solo session is open in another tab. This tab will not overwrite it.');return;}
    localStorage.setItem(SAVE,JSON.stringify({version:1,state,room:roomId,pose:controls.pose,elapsedSeconds,owner:slotOwner,savedAt:Date.now()}));
  }catch{$('session-label').textContent='SOLO / STORAGE UNAVAILABLE';}
}
function toast(text){if(!text)return;$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
function modal(kind,html,data=null){dialogKind=kind;dialogData=data;$('dialog-content').innerHTML=html;$('modal-backdrop').hidden=false;controls?.setEnabled(false);$('dialog').scrollTop=0;$('dialog').focus({preventScroll:true});syncAudioActivity();}
function closeModal(){dialogKind='';dialogData=null;selected=null;$('modal-backdrop').hidden=true;controls?.setEnabled(mode!=='menu'&&!state.won);syncAudioActivity();}
function panelTitle(kicker,title){return `<p class="eyebrow">${esc(kicker)}</p><h2 id="dialog-title">${esc(title)}</h2>`;}
function bind(id,handler){$(id)?.addEventListener('click',handler);}
function setRoom(id,pose=null){
  if(!ROOMS[id]||!availableRooms(state).some(room=>room.id===id))return false;roomId=id;scene.loadRoom(ROOMS[id],getObjects(state,id),state);
  const fallback=ROOMS[id].spawn||{x:0,z:3.2,yaw:0};
  const valid=pose&&[pose.x,pose.z,pose.yaw].every(Number.isFinite)&&scene.canMove(pose.x,pose.z,.23);
  controls.setPose(valid?pose:fallback);scene.setCamera(controls.pose);sound?.setRoom(id);network?.presence({room:id,...controls.pose});updateHud();
}
function changeRoom(id){closeModal();$('transition').classList.add('active');controls.setEnabled(false);setTimeout(()=>{setRoom(id);$('transition').classList.remove('active');controls.setEnabled(mode!=='menu'&&!state.won&&!dialogKind);saveSolo();},settings.reduced?0:170);}
function showGame(){mode=mode==='coop'?'coop':'solo';$('menu').hidden=true;$('hud').hidden=false;lookUsed=moveUsed=false;document.body.classList.remove('look-learned');tipUntil=performance.now()+16000;$('control-tip').style.opacity='1';controls.setEnabled(true);syncAudioActivity();updateHud();}
function startSolo(resume=false){
  network?.leave();teamIntent=false;pending.clear();roster=[];peers=[];connected=false;mode='solo';completedShown=false;closeModal();
  const saved=resume?readSave():null;state=saved?.state||newGame();elapsedSeconds=saved?.elapsedSeconds||0;
  showGame();setRoom(saved?.room||LEVELS[state.level].startRoom,saved?.pose);claimSave();
  if(!saved)showIntro();
}
function returnToMenu(){saveSolo();network?.leave();mode='menu';connected=false;teamIntent=false;pending.clear();roster=[];peers=[];closeModal();controls.setEnabled(false);$('hud').hidden=true;$('menu').hidden=false;refreshMenu();state=newGame();setRoom(LEVELS[0].startRoom);}
function showIntro(){
  const level=LEVELS[state.level];const first=state.level===0;
  modal('intro',panelTitle(`WING ${String(state.level+1).padStart(2,'0')} / ${level.mechanic||'ESCAPE'}`,level.title)+`<p>${esc(level.intro||'Look closely. Every lock has a way through.')}</p>${first?controlMap():'<div class="notice"><p>Your keys and notes stay with you. Three fresh hints are available in this wing.</p></div>'}${first?'<div class="intro-audio-row"><div><strong>Put yourself inside.</strong><small>Optional footsteps & echoes. Every clue stays visual.</small></div><button id="intro-audio" class="audio-toggle" aria-pressed="false">SOUND OFF</button></div><button id="intro-setup" class="text-button">ADJUST CONTROLS & SOUND</button>':''}<button id="intro-go" class="button primary">${first?'FIND A WAY OUT':'KEEP MOVING'} <span>→</span></button>`);
  bind('intro-go',closeModal);bind('intro-audio',toggleSound);bind('intro-setup',()=>showSettings('controls'));refreshAudioUi();
}
function updateHud(){
  $('act-title').textContent=`WING ${String(state.level+1).padStart(2,'0')} / ${levelTitle(state.level).toUpperCase()}`;
  $('room-title').textContent=publicRoom(roomId);$('objective-text').textContent=objective(state);
  $('item-count').textContent=String(state.inventory.length);const hints=getHints(state);$('hint-count').textContent=hints.remaining;$('hint-btn').setAttribute('aria-label',`Open hints, ${hints.remaining} of 3 remaining`);
  $('session-label').textContent=mode==='coop'?(connected?`TEAM ${network?.session?.code||''}`:'TEAM / RECONNECTING'):'SOLO / SAVED LOCALLY';
  $('crew-btn').hidden=mode!=='coop';$('crew-count').textContent=`${roster.filter(p=>p.connected).length||1}/4`;
  if(state.won&&!completedShown){completedShown=true;setTimeout(showWin,220);}
}
function useFocused(target=currentTarget){
  if(mode==='menu'||dialogKind||state.won)return;
  if(!target){toast('Look toward an object, then move close enough to inspect it.');return;}
  if(target.distance>2.6){toast('Move closer to inspect this.');return;}
  const object=OBJECTS[target.id];if(!object)return;
  if(object.kind==='door'||object.kind==='exit'||(object.kind==='timed'&&object.targetRoom&&isDone(state,object.id))){dispatch({type:'interact',id:object.id,room:roomId},{kind:'door',object});return;}
  openObject(object);if(['clue','flavor','puzzle'].includes(object.kind)&&!state.inspected.includes(object.id))dispatch({type:'interact',id:object.id,room:roomId},{kind:'inspect',object});
}
function dispatch(action,context={}){
  if(mode==='coop'){
    if(!connected){toast('Reconnecting to your team. Wait for the connection before interacting.');return;}
    if([...pending.values()].some(p=>p.action.type===action.type&&p.action.id===action.id))return;
    const id=network.sendAction(action);if(id){pending.set(id,{...context,action});if(context.kind==='solve'||context.kind==='pickup')setBusy(true);if(context.kind==='hint'&&$('reveal-hint'))$('reveal-hint').disabled=true;}return;
  }
  const result=reduce(state,action,{now:now()});state=result.state||state;updateHud();saveSolo();handleResult(result,{...context,action});
}
function setBusy(busy){$('submit-puzzle')?.toggleAttribute('disabled',busy);$('object-action')?.toggleAttribute('disabled',busy);}
function handleResult(result,context={}){
  const event=result.event;setBusy(false);
  if(result.ok&&context.kind==='pickup')sound?.cue('key');
  if(result.ok&&context.kind==='solve')sound?.cue('mechanism');
  if(result.ok&&['room','level'].includes(event?.type))sound?.cue('door');
  if(!result.ok){
    if(context.kind==='inspect')return;
    if($('puzzle-feedback')&&selected===context.object?.id){$('puzzle-feedback').textContent=result.message||'That did not work.';$('puzzle-feedback').hidden=false;}else toast(result.message);return;
  }
  if(event?.type==='room'){if(availableRooms(state).some(room=>room.id===event.room))changeRoom(event.room);return;}
  if(event?.type==='level'){if(event.level!==state.level)return;closeModal();setRoom(LEVELS[state.level].startRoom);saveSolo();showIntro();return;}
  if(event?.type==='win'){showWin();return;}
  if(context.kind==='hint'){showHints();return;}
  if(context.kind==='inspect')return;
  if(context.kind==='pickup'||context.kind==='solve'){
    if(dialogKind==='object'&&selected===context.object?.id){
      modal('result',panelTitle('ONE STEP CLOSER',context.object.title)+`<p class="result-text">${esc(result.message)}</p><button id="result-done" class="button primary">BACK TO THE ROOM <span>→</span></button>`);bind('result-done',closeModal);
    }else toast(result.message);return;
  }
  toast(result.message);
}
function clueHtml(clue){
  if(!clue)return '';
  const entries=['order','frames'].includes(clue.type)?`<div class="clue-strip">${(clue.entries||[]).map((entry,i)=>`<div class="clue-tile ${clue.type==='frames'?(entry.watched?'watched':'dark-frame'):''}"><small>${String(i+1).padStart(2,'0')}</small><b>${esc(clue.type==='frames'?entry.value:entry.symbol)}</b><span>${esc(clue.type==='frames'?(entry.watched?'WATCHED':'DARK'):entry.label)}</span></div>`).join('')}</div>`:(clue.entries||[]).map(entry=>`<div class="clue-row"><b>${esc(entry.symbol||'')}</b><span>${esc(entry.label||'')}</span>${entry.value!==undefined?`<b>${esc(entry.value)}</b>`:''}</div>`).join('');
  return `<div class="clue-card"><h3>${esc(clue.heading||'FOUND IN THE PRISON')}</h3>${(clue.lines||[]).map(line=>`<p>${esc(line)}</p>`).join('')}${entries}${clue.caption?`<p style="margin-top:15px">${esc(clue.caption)}</p>`:''}${clue.stamp?`<span class="stamp">${esc(clue.stamp)}</span>`:''}</div>`;
}
function openObject(object){
  selected=object.id;
  let html=panelTitle(`${publicRoom(object.room)} / INSPECTION`,object.title)+`<p>${esc(object.description)}</p>${clueHtml(object.clue)}`;
  const done=isDone(state,object.id);
  if(done&&(object.kind==='pickup'||object.kind==='timed'||object.kind==='puzzle'))html+=`<p class="result-text">${esc(object.doneText||'You already recovered what you need here.')}</p><button id="object-done" class="button primary">BACK TO THE ROOM <span>→</span></button>`;
  else if(object.kind==='puzzle')html+=puzzleHtml(object);
  else if(object.kind==='timed')html+=`<div class="scan-meter" id="timed-meter"><div class="scan-state"><span id="timed-label">WATCH THE LIGHT</span><span id="timed-seconds"></span></div><div class="scan-track"><div class="scan-fill" id="timed-fill"></div></div></div><button id="object-action" class="button primary">WAIT FOR BLIND INTERVAL <span>→</span></button><p id="puzzle-feedback" class="error-text" hidden></p>`;
  else if(object.kind==='pickup')html+=`<button id="object-action" class="button primary">${esc(object.actionLabel||'SEARCH HERE')} <span>→</span></button>`;
  else html+=`<button id="object-done" class="button primary">BACK TO THE ROOM <span>→</span></button>`;
  modal('object',html,{id:object.id});selected=object.id;
  bind('object-done',closeModal);bind('object-action',()=>dispatch({type:'interact',id:object.id,room:roomId},{kind:'pickup',object}));
  if(object.kind==='puzzle'&&!done)bindPuzzle(object);
}
function puzzleHtml(object){
  const puzzle=object.puzzle||{};let html=`<p class="puzzle-prompt">${esc(puzzle.prompt||'Use what you have seen in this wing.')}</p>`;
  if(puzzle.type==='code')html+=`<div class="code-readout" id="puzzle-readout" aria-live="polite">${'—'.repeat(puzzle.length||3)}</div><div class="keypad">${[1,2,3,4,5,6,7,8,9,'CLEAR',0,'⌫'].map(v=>`<button data-digit="${v}" class="${typeof v==='number'?'':'small-key'}">${v}</button>`).join('')}</div>`;
  else if(puzzle.type==='sequence')html+=`<div class="code-readout" id="puzzle-readout" aria-live="polite">${'·'.repeat(puzzle.length||4)}</div><div class="sequence-options">${(puzzle.options||[]).map((o,i)=>`<button data-sequence="${i}"><b>${esc(o.symbol)}</b><small>${esc(o.label)}</small></button>`).join('')}</div><button class="text-button" id="sequence-clear">CLEAR SEQUENCE</button>`;
  else if(puzzle.type==='valves')html+=(puzzle.labels||[]).map((label,i)=>`<div class="valve-row"><span>${esc(label)}</span><div class="valve-control"><button data-valve="${i}" data-step="-1" aria-label="Decrease ${esc(label)}">−</button><b class="valve-number" id="valve-value-${i}">${puzzle.initial?.[i]||0}</b><button data-valve="${i}" data-step="1" aria-label="Increase ${esc(label)}">+</button></div></div>`).join('');
  html+=`<p id="puzzle-feedback" class="error-text" hidden></p><button id="submit-puzzle" class="button primary">${esc(puzzle.submitLabel||'TRY THE MECHANISM')} <span>→</span></button>`;return html;
}
function bindPuzzle(object){
  const puzzle=object.puzzle;let value=puzzle.type==='code'?'':puzzle.type==='valves'?[...(puzzle.initial||puzzle.labels.map(()=>0))]:[];
  const render=()=>{if(puzzle.type==='code')$('puzzle-readout').textContent=(value+'—'.repeat(puzzle.length)).slice(0,puzzle.length);else if(puzzle.type==='sequence')$('puzzle-readout').textContent=value.map(v=>puzzle.options.find(o=>o.value===v)?.symbol||v).join(' ')+ ' ·'.repeat(Math.max(0,puzzle.length-value.length));};
  document.querySelectorAll('[data-digit]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.digit;if(key==='CLEAR')value='';else if(key==='⌫')value=value.slice(0,-1);else if(value.length<puzzle.length)value+=key;render();}));
  document.querySelectorAll('[data-sequence]').forEach(button=>button.addEventListener('click',()=>{if(value.length<puzzle.length)value.push(puzzle.options[Number(button.dataset.sequence)].value);render();}));
  bind('sequence-clear',()=>{value=[];render();});
  document.querySelectorAll('[data-valve]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.valve);value[i]=Math.max(puzzle.min??0,Math.min(puzzle.max??6,value[i]+Number(button.dataset.step)));$('valve-value-'+i).textContent=value[i];}));
  bind('submit-puzzle',()=>dispatch({type:'solve',id:object.id,value,room:roomId},{kind:'solve',object}));
}
function showInventory(){
  modal('inventory',panelTitle('WHAT YOU CARRIED OUT','Your pockets')+(state.inventory.length?`<div class="inventory-grid">${state.inventory.map(id=>{const item=ITEMS[id];return `<button class="inventory-item" data-item="${esc(id)}"><b>${esc(item.symbol||'⚿')}</b><span>${esc(item.title)}</span></button>`;}).join('')}</div>`:'<p>Empty, for now. Search the room for what someone left behind.</p>')+'<p>Matching keys are used automatically when you inspect a lock.</p>');
  document.querySelectorAll('[data-item]').forEach(b=>b.addEventListener('click',()=>{const item=ITEMS[b.dataset.item];modal('item',panelTitle('IN YOUR POCKETS',item.title)+`<div class="victory-mark">${esc(item.symbol||'⚿')}</div><p>${esc(item.description)}</p><button id="back-inventory" class="button secondary">BACK TO POCKETS <span>←</span></button>`);bind('back-inventory',showInventory);}));
}
function showNotebook(){
  const notes=state.inspected.map(id=>OBJECTS[id]).filter(o=>o?.clue);const rooms=Object.values(ROOMS).filter(r=>r.level===state.level);const access=availableRooms(state).map(r=>r.id);
  modal('notebook',panelTitle('NOTHING TO REMEMBER BY SOUND','Field notes')+`<p>Clues you inspect are copied here. Take your time.</p><div class="room-list">${rooms.map(r=>`<span class="room-tag ${r.id===roomId?'current':''} ${access.includes(r.id)?'':'locked'}">${esc(r.title)}</span>`).join('')}</div>${notes.length?notes.map(o=>`<button class="note-button" data-note="${o.id}">${esc(o.title)} <span>↗</span></button>`).join(''):'<div class="notice"><p>No clues recorded yet. Look for papers, markings, and diagrams inside the prison.</p></div>'}`);
  document.querySelectorAll('[data-note]').forEach(b=>b.addEventListener('click',()=>{const o=OBJECTS[b.dataset.note];modal('note',panelTitle(publicRoom(o.room),o.title)+clueHtml(o.clue)+'<button id="back-notes" class="button secondary">BACK TO NOTES <span>←</span></button>');bind('back-notes',showNotebook);}));
}
function showHints(){const hints=getHints(state);modal('hints',panelTitle(`WING ${state.level+1} / ${hints.remaining} OF 3 REMAINING`,'A way forward')+`<p>Three hints per wing. Open only what you need.${mode==='coop'?' Your team shares this allowance.':''}</p>${(hints.log||[]).map((text,i)=>`<div class="hint-entry"><small>HINT ${i+1}</small><p>${esc(text)}</p></div>`).join('')}<button id="reveal-hint" class="button primary" ${hints.remaining?'':'disabled'}>${hints.remaining?'REVEAL NEXT HINT':'ALL THREE HINTS USED'} <span>↗</span></button>`);bind('reveal-hint',()=>dispatch({type:'hint'},{kind:'hint'}));}
function controlMap(){return `<div class="control-map" aria-label="${settings.leftHanded?'Right':'Left'} thumb moves; ${settings.leftHanded?'left':'right'} thumb looks"><div class="map-move"><span class="mini-stick"><i></i></span><strong>MOVE</strong><small>${settings.leftHanded?'RIGHT':'LEFT'} THUMB</small></div><p>Hold both<br>to walk & look</p><div class="map-look"><span class="mini-look">↔</span><strong>LOOK</strong><small>${settings.leftHanded?'LEFT':'RIGHT'} THUMB</small></div></div>`;}
function showHelp(){modal('help',panelTitle('FIND YOUR FEET','Two thumbs. One way out.')+controlMap()+`<div class="help-row"><b>01</b><p><strong>A lighter touch to move.</strong>Slide the MOVE stick a little to walk slowly, or farther to move faster. You can move and look at the same time.</p></div><div class="help-row"><b>02</b><p><strong>Your other thumb goes on LOOK.</strong>Drag the labeled look pad to turn. Lift and reposition your thumb whenever you need. You can also swipe the open scene.</p></div><div class="help-row"><b>03</b><p><strong>Point. Get close. Inspect.</strong>The INSPECT button lights up when you can use an object. Matching keys work automatically.</p></div><p>Computer: WASD to move, drag to look, E to inspect, C to crouch. Notes keep your clues; each wing has three hints.</p><div class="notice"><p>Headphones add footsteps, echoes and distant activity. <strong>Every puzzle is still solvable with sound off.</strong></p></div><button id="help-setup" class="button secondary">ADJUST MY CONTROLS <span>→</span></button><button id="help-done" class="button primary">GOT IT <span>→</span></button>`);bind('help-done',closeModal);bind('help-setup',()=>showSettings('controls'));}
function settingValue(key){const value=settings[key];if(key==='stickSize')return `${Math.round(value)} px`;if(key==='sensitivity')return `${value.toFixed(1)}×`;return `${Math.round(value*100)}%`;}
function sliderSetting(key,label,detail,step){const [min,max]=SETTING_RANGES[key];return `<label class="setting-slider" for="${key}"><span>${label}<output id="${key}-value" for="${key}">${settingValue(key)}</output></span><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-label="${label}"><small>${detail}</small></label>`;}
function toggleSetting(key,label,detail,id=key){return `<label class="setting-toggle" for="${id}"><span><strong>${label}</strong><small>${detail}</small></span><input id="${id}" type="checkbox" role="switch" aria-label="${label}" ${settings[key]?'checked':''}></label>`;}
function showSettings(tab='controls'){
  settingsTab=['controls','sound','view'].includes(tab)?tab:'controls';
  const tabs=`<div class="settings-tabs" role="tablist" aria-label="Setup sections">${[['controls','CONTROLS'],['sound','SOUND'],['view','VIEW']].map(([id,label])=>`<button id="tab-${id}" role="tab" aria-selected="${settingsTab===id}" aria-controls="settings-panel">${label}</button>`).join('')}</div>`;
  let content='';
  if(settingsTab==='controls')content=`<div class="control-preview" aria-hidden="true"><div class="preview-stick"><i></i><span>MOVE</span></div><span class="preview-inspect">INSPECT</span><div class="preview-look"><span>↔<small>LOOK</small></span></div></div><p class="settings-caption">Changes apply immediately. Make room for your view.</p>`+sliderSetting('buttonScale','Button size','Inspect, crouch and the look pad. Other targets stay easy to tap.',.05)+sliderSetting('stickSize','Movement stick size','A compact stick, with extra touch space around its edge.',4)+sliderSetting('sensitivity','Look sensitivity','Lower for small, precise turns.',.1)+sliderSetting('controlOpacity','Control visibility','Fade the thumb pads while keeping their labels visible.',.05)+toggleSetting('leftHanded','Swap thumb controls','Move with your right thumb; look with your left.')+toggleSetting('lookGuide','Show look guide','Keep the LOOK ring visible when you lift your thumb.')+toggleSetting('invert','Invert vertical look','Drag up to look down.')+'<button id="reset-controls" class="text-button reset-button">RESET CONTROLS TO DEFAULT</button>';
  else if(settingsTab==='sound')content=`<p class="settings-intro">A prison beyond your cell: footsteps, concrete echoes, pipes and muffled voices down the hall.</p>`+toggleSetting('sound','Prison sound','Optional atmosphere. No clue or solution depends on hearing.','sound-enabled')+sliderSetting('volume','Master volume','Start quietly, especially with headphones.',.05)+sliderSetting('atmosphere','Background atmosphere','Hum, distant chatter and room sounds. Footsteps keep their own clarity.',.05)+`<p id="audio-status" class="audio-status" role="status"></p><button id="sound-retry" class="button secondary" hidden>RESUME SOUND <span>→</span></button><button id="test-audio" class="button secondary">TRY A CELL DOOR ECHO <span>→</span></button><div class="notice"><p>Muted play is fully supported. Camera warnings, notes and every puzzle remain visual. Audio pauses when you leave the game or switch apps.</p></div>`;
  else content=sliderSetting('brightness','Brightness','Lift the shadows for a bright room or a busy bar.',.05)+toggleSetting('reduced','Reduce motion','Steadier presentation and quicker room transitions.')+`<div class="notice"><p>Portrait and landscape both work. Keep your thumbs near the bottom corners; the center stays clear for clues.</p></div>`;
  modal('settings',panelTitle('YOUR ESCAPE, YOUR FIT','Make yourself comfortable.')+tabs+`<div id="settings-panel" role="tabpanel">${content}</div><div class="settings-footer"><button id="settings-done" class="button primary">DONE <span>→</span></button></div>`);
  for(const id of ['controls','sound','view'])bind('tab-'+id,()=>showSettings(id));
  for(const key of Object.keys(SETTING_RANGES))if($(key))$(key).addEventListener('input',()=>{changeSetting(key,Number($(key).value));if($(key+'-value'))$(key+'-value').textContent=settingValue(key);});
  for(const key of ['invert','reduced','leftHanded','lookGuide'])if($(key))$(key).addEventListener('change',()=>changeSetting(key,$(key).checked));
  if($('sound-enabled'))$('sound-enabled').addEventListener('change',()=>changeSetting('sound',$('sound-enabled').checked));
  bind('reset-controls',()=>{for(const key of ['buttonScale','stickSize','controlOpacity','sensitivity','leftHanded','lookGuide','invert'])settings[key]=DEFAULT_SETTINGS[key];applySettings();saveSettings(preferenceStorage,settings);showSettings('controls');});
  bind('test-audio',previewSound);bind('sound-retry',()=>{sound?.unlock();});bind('settings-done',closeModal);refreshAudioUi();
}
function changeSetting(key,value){settings=normalizeSettings({...settings,[key]:value},settings.reduced);applySettings();saveSettings(preferenceStorage,settings);if(key==='sound'&&settings.sound)sound?.unlock();}
function applySettings(){
  scene?.setBrightness(settings.brightness);if(controls){controls.sensitivity=settings.sensitivity;controls.invert=settings.invert;}
  const style=document.body.style;style.setProperty('--button-scale',settings.buttonScale);style.setProperty('--stick-size',settings.stickSize+'px');style.setProperty('--control-opacity',settings.controlOpacity);
  document.body.classList.toggle('reduced-motion',settings.reduced);document.body.classList.toggle('left-handed',settings.leftHanded);document.body.classList.toggle('hide-look-guide',!settings.lookGuide);
  if($('look-nudge'))$('look-nudge').textContent=`${settings.leftHanded?'LEFT':'RIGHT'} THUMB · DRAG`;
  const touchTip=document.querySelector('.touch-tip');if(touchTip)touchTip.textContent=`${settings.leftHanded?'RIGHT':'LEFT'} PAD TO MOVE · ${settings.leftHanded?'LEFT':'RIGHT'} PAD TO LOOK`;
  sound?.setEnabled(settings.sound);sound?.setVolume(settings.volume);sound?.setAtmosphere(settings.atmosphere);syncAudioActivity();refreshAudioUi();
}
function syncAudioActivity(){sound?.setActive(mode!=='menu'&&!state.won&&dialogKind!=='pause');}
function markLookUsed(){lookUsed=true;document.body.classList.add('look-learned');if(moveUsed)tipUntil=0;}
function markMoveUsed(){moveUsed=true;if(lookUsed)tipUntil=0;}
const speakerIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path class="audio-waves" d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/><path class="audio-slash" d="m17 9 5 6m0-6-5 6"/></svg>`;
function refreshAudioUi(status=sound?.getStatus()){
  for(const id of ['menu-audio','audio-btn','intro-audio']){const button=$(id);if(!button||button.dataset.soundState===String(settings.sound))continue;button.dataset.soundState=String(settings.sound);button.setAttribute('aria-pressed',String(settings.sound));button.setAttribute('aria-label',settings.sound?'Mute prison sound':'Enable prison sound');button.innerHTML=speakerIcon+`<span>SOUND ${settings.sound?'ON':'OFF'}</span>`;}
  document.body.classList.toggle('sound-on',settings.sound);
  if($('sound-enabled'))$('sound-enabled').checked=settings.sound;
  if($('audio-status'))$('audio-status').textContent=!settings.sound?'Sound is off. You can complete the entire escape in silence.':status?.supported===false?'Audio is unavailable here. Your escape will continue with every visual clue.':mode==='menu'?'Sound starts when you enter. Use the preview below to set a comfortable volume.':status?.message||'Prison sound is ready.';
  if($('sound-retry'))$('sound-retry').hidden=!(settings.sound&&status?.needsGesture);
}
function toggleSound(){changeSetting('sound',!settings.sound);}
function previewSound(){
  if(!settings.sound)changeSetting('sound',true);sound?.setActive(true);
  Promise.resolve(sound?.unlock()).then(ready=>{if(ready&&settings.sound&&dialogKind==='settings')sound.cue('door');});
  clearTimeout(previewTimer);previewTimer=setTimeout(syncAudioActivity,2200);
}
function showPause(){modal('pause',panelTitle('TAKE A BREATH','Still on the inside.')+`<p>${mode==='coop'?'Your crew can keep moving while this menu is open.':'Your escape is saved in this browser.'}</p><button id="resume-btn" class="button primary">RETURN TO THE ROOM <span>→</span></button><button id="pause-settings" class="button secondary">SETTINGS <span>☷</span></button><button id="pause-help" class="button ghost">CONTROLS <span>↗</span></button><button id="pause-title" class="button ghost">${mode==='coop'?'LEAVE TEAM & TITLE SCREEN':'SAVE & TITLE SCREEN'} <span>←</span></button>`);bind('resume-btn',closeModal);bind('pause-settings',showSettings);bind('pause-help',showHelp);bind('pause-title',returnToMenu);}
function showWin(){
  if(mode==='menu')return;completedShown=true;controls.setEnabled(false);saveSolo();const mins=Math.floor(elapsedSeconds/60),secs=Math.floor(elapsedSeconds%60);
  modal('win',panelTitle('ASHGATE / OUTSIDE THE WIRE','The list ends here.')+`<div class="victory-mark">FREE.</div><p>For the first time tonight, the road has no lock. Behind you, the prison waits for a transfer that will never arrive.</p><div class="stats-row"><div><strong>${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</strong><small>TIME INSIDE</small></div><div><strong>${state.hintsUsed.reduce((a,b)=>a+b,0)} / 9</strong><small>HINTS USED</small></div></div><button id="win-menu" class="button primary">BACK TO THE OUTSIDE <span>↗</span></button>`);bind('win-menu',returnToMenu);
}
function showCoop(){
  modal('coop',panelTitle('PRIVATE ESCAPE / 2–4 PLAYERS','Nobody leaves alone.')+`<p>Walk independently. Share keys, clues, and progress. You will see your crew when you are in the same room.</p><label class="field-label" for="player-name">YOUR CALL SIGN</label><input id="player-name" class="text-input" value="Inmate 41" maxlength="20" autocomplete="off"><button id="create-team" class="button primary">CREATE A TEAM <span>→</span></button><div class="panel-divider"></div><label class="field-label" for="join-code">OR ENTER A SIX-CHARACTER ROOM CODE</label><input id="join-code" class="text-input code-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false"><button id="join-team" class="button secondary">JOIN YOUR CREW <span>→</span></button><p id="team-feedback" class="error-text" hidden></p><p style="font-size:10px;margin-top:20px;margin-bottom:0">Co-op is a separate escape. Your solo save stays here. Brief disconnects can recover; a server restart ends the team session.</p>`);
  if(network.resumeInfo){const resume=document.createElement('button');resume.id='resume-team';resume.className='button secondary';resume.textContent=`REJOIN TEAM ${network.resumeInfo.code}`;$('dialog-content').insertBefore(resume,$('dialog-content').children[2]);resume.addEventListener('click',()=>{teamIntent=true;resume.disabled=true;$('create-team').disabled=true;$('join-team').disabled=true;$('team-feedback').hidden=false;$('team-feedback').textContent='Rejoining your crew…';network.reconnect();});}
  const connect=create=>{const name=$('player-name').value.trim()||'Inmate 41';const code=$('join-code').value.trim().toUpperCase();if(!create&&!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)){$('team-feedback').hidden=false;$('team-feedback').textContent='Enter the six-character code from your crew.';return;}teamIntent=true;$('create-team').disabled=true;$('join-team').disabled=true;$('team-feedback').hidden=false;$('team-feedback').textContent='Opening a connection…';if(create)network.create(name);else network.join(code,name);};
  bind('create-team',()=>connect(true));bind('join-team',()=>connect(false));
  const invite=new URL(location.href).searchParams.get('room');if(invite)$('join-code').value=invite.toUpperCase().slice(0,6);
}
function showCrew(){
  const code=network.session?.code||'';modal('crew',panelTitle('YOUR PRIVATE ESCAPE','The crew')+`<p>Share the code or invite. Everyone explores freely; discoveries belong to the team.</p><div class="team-code">${esc(code)}</div><div class="modal-actions"><button id="copy-code" class="button secondary">COPY CODE</button><button id="copy-invite" class="button secondary">COPY INVITE</button></div><div id="crew-list">${crewHtml()}</div><button id="crew-done" class="button primary">START EXPLORING <span>→</span></button>`);bind('copy-code',()=>copyText(code,'Room code copied.'));bind('copy-invite',()=>{const url=new URL(location.origin+location.pathname);url.searchParams.set('room',code);copyText(url.href,'Invite copied.');});bind('crew-done',closeModal);
}
function crewHtml(){return roster.map(p=>`<div class="crew-row ${p.connected?'':'offline'}"><span><i></i>${esc(p.name)}${p.id===network.session?.id?' (you)':''}</span><span>${p.connected?esc(publicRoom(p.room||LEVELS[state.level].startRoom)):'RECONNECTING'}</span></div>`).join('');}
async function copyText(text,message){try{await navigator.clipboard.writeText(text);toast(message);}catch{toast('Copy this code: '+(network.session?.code||text));}}
function onTeamState(next,meta={}){
  if(!teamIntent&&mode!=='coop')return;const initial=mode!=='coop';const previousLevel=state.level;state=next;mode='coop';connected=true;
  if(initial){elapsedSeconds=0;completedShown=false;showGame();setRoom(LEVELS[state.level].startRoom);showCrew();}
  else if(previousLevel!==state.level){closeModal();setRoom(LEVELS[state.level].startRoom);showIntro();}
  updateHud();if(dialogKind==='hints')showHints();
}
function onTeamStatus(status,detail=''){
  const statusName=typeof status==='string'?status:status?.status;const message=typeof status==='object'?status.message:detail;
  connected=statusName==='connected';
  if(['error','failed','ended'].includes(statusName)){
    teamIntent=false;if(dialogKind==='coop'){$('create-team').disabled=false;$('join-team').disabled=false;if($('resume-team'))$('resume-team').disabled=false;$('team-feedback').hidden=false;$('team-feedback').textContent=message||'The team connection could not be opened. Try again.';}else toast(message||'The team session ended. Return to the title screen to create another.');
  }
  if(mode==='coop')updateHud();
}
function animate(time){
  frame=requestAnimationFrame(animate);const dt=Math.min(.25,(time-(lastFrame||time))/1000);lastFrame=time;
  if(document.hidden)return;
  if(mode==='menu'){
    const spawn=ROOMS[LEVELS[0].startRoom].spawn;scene.setCamera({x:spawn.x+.5,z:spawn.z-.15,yaw:-.37+(settings.reduced?0:Math.sin(time*.00013)*.07),pitch:-.025,crouch:false});
  }else{
    controls.update(dt,(x,z,r)=>scene.canMove(x,z,r));scene.setCamera(controls.pose);sound?.update({dt,pose:controls.pose,room:roomId});if(!state.won)elapsedSeconds+=dt;
    if(time-lastPresence>100){lastPresence=time;if(mode==='coop')network.presence({room:roomId,...controls.pose});}
    if(time-lastSave>5000){lastSave=time;if(mode==='solo')saveSolo();}
  }
  scene.render({dt,time:now(),state,players:(mode==='coop'?(network.samplePoses?.()||peers):[]).filter(p=>p.id!==network?.session?.id).map(p=>({...p,name:roster.find(member=>member.id===p.id)?.name||'Prisoner'}))});
  if(time-lastUi>90){lastUi=time;refreshFocus(time);}
}
function refreshFocus(time){
  if(mode==='menu')return;
  currentTarget=scene.getTarget();const object=currentTarget?OBJECTS[currentTarget.id]:null;const ready=!!object&&currentTarget.distance<=2.6;
  $('reticle').classList.toggle('active',ready&&!dialogKind);$('focus-label').classList.toggle('visible',!!object&&!dialogKind);
  $('focus-title').textContent=object?.title||'';$('focus-distance').textContent=ready?(['door','exit'].includes(object.kind)?'OPEN / USE MATCHING KEY':'INSPECT'):object?'MOVE CLOSER':'';
  $('interact-btn').classList.toggle('ready',ready);$('action-label').textContent=object&&['door','exit'].includes(object.kind)?'OPEN':'INSPECT';
  $('control-tip').style.opacity=time>tipUntil?'0':'1';
  $('elapsed').textContent=`${String(Math.floor(elapsedSeconds/60)).padStart(2,'0')}:${String(Math.floor(elapsedSeconds%60)).padStart(2,'0')}`;
  const phase=scanPhase(now());const activeTimed=getObjects(state,roomId).some(o=>o.kind==='timed'&&!isDone(state,o.id));$('scan-warning').hidden=!activeTimed;
  if(activeTimed){$('scan-warning').classList.toggle('safe',phase.safe);$('scan-text').textContent=phase.safe?'BLIND INTERVAL':'WATCHED';}
  if(dialogKind==='object'&&OBJECTS[selected]?.kind==='timed'&&$('timed-meter')){
    $('timed-meter').classList.toggle('safe',phase.safe);$('timed-label').textContent=phase.safe?'BLIND INTERVAL':'WATCHED · HOLD';$('timed-seconds').textContent=`${Math.ceil(phase.remaining||0)}s`;
    $('timed-fill').style.width=`${(phase.progress??0)*100}%`;$('object-action').disabled=!phase.safe||[...pending.values()].some(p=>p.object?.id===selected);$('object-action').innerHTML=phase.safe?'OPEN SHUTTER <span>→</span>':'WAIT FOR BLIND INTERVAL <span>·</span>';
  }
}

try{
  scene=createScene($('world'));
  sound=new PrisonAudio({enabled:settings.sound,volume:settings.volume,atmosphere:settings.atmosphere,onStatus:refreshAudioUi});
  controls=new FirstPersonControls({canvas:$('world'),joystick:$('touch-move'),knob:$('joystick-knob'),lookPad:$('touch-look'),onLook:markLookUsed,onMove:markMoveUsed,onInteract:()=>useFocused(),onPause:showPause,onTap:(x,y)=>{const target=scene.targetAt?.(x,y);if(target)useFocused(target);},onCrouch:crouch=>{$('crouch-btn').setAttribute('aria-pressed',String(crouch));$('stance').textContent=crouch?'CROUCHING':'STANDING';}});
  network=new CoopClient({onState:onTeamState,onStatus:onTeamStatus,onRoster:list=>{roster=list;updateHud();if(dialogKind==='crew'&&$('crew-list'))$('crew-list').innerHTML=crewHtml();},onPoses:list=>{peers=list;},onMessage:packet=>{
    if(packet.type==='action-result'){const context=pending.get(packet.actionId);pending.delete(packet.actionId);if(context)handleResult(packet,context);}
    else if(packet.message&&mode==='coop')toast(packet.message);
  }});
  bind('start-btn',()=>{if(readSave()&&!readSave().state.won){modal('new',panelTitle('A FRESH ESCAPE','Start from the beginning?')+'<p>Your existing solo escape will be replaced when you start.</p><button id="confirm-new" class="button primary">START A NEW ESCAPE <span>→</span></button><button id="cancel-new" class="button ghost">KEEP MY SAVE <span>←</span></button>');bind('confirm-new',()=>startSolo(false));bind('cancel-new',closeModal);}else startSolo(false);});
  bind('continue-btn',()=>startSolo(true));bind('coop-btn',showCoop);bind('how-btn',showHelp);bind('pause-btn',showPause);bind('notes-btn',showNotebook);bind('hint-btn',showHints);bind('settings-btn',()=>showSettings('controls'));bind('menu-settings',()=>showSettings('controls'));bind('menu-audio',toggleSound);bind('audio-btn',toggleSound);bind('inventory-btn',showInventory);bind('crew-btn',showCrew);bind('interact-btn',()=>useFocused());bind('crouch-btn',()=>controls.toggleCrouch());
  bind('close-dialog',()=>{if(dialogKind==='coop'&&teamIntent){network.leave();teamIntent=false;}if(dialogKind==='win'){returnToMenu();return;}closeModal();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&dialogKind){if(dialogKind==='coop'&&teamIntent){network.leave();teamIntent=false;}closeModal();}});
  window.addEventListener('pointerdown',()=>{if(settings.sound)sound?.unlock();},{capture:true,passive:true});
  window.addEventListener('keydown',()=>{if(settings.sound)sound?.unlock();},{capture:true});
  window.addEventListener('resize',()=>scene.resize());window.addEventListener('pagehide',()=>saveSolo());
  window.addEventListener('storage',event=>{if(event.key===SAVE&&mode==='menu')refreshMenu();});
  bind('reload-btn',()=>location.reload());
  applySettings();setRoom(LEVELS[0].startRoom);refreshMenu();frame=requestAnimationFrame(animate);
  if(new URL(location.href).searchParams.has('room'))showCoop();
}catch(error){$('fatal').hidden=false;$('fatal-message').textContent='The 3D view could not start in this browser. Try reopening the link in Safari or Chrome, then reload.';console.error('Night Transfer startup failed',error);$('reload-btn').addEventListener('click',()=>location.reload());}
