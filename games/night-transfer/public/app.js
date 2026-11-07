import {VERSION,LEVELS,ROOMS,OBJECTS,ITEMS,newGame,reduce,availableRooms,getObjects,isDone,objective,getHints,scanPhase,validateSave,objectView,getGuidance,annexSignal,circuitReadout} from './world.mjs';
import {createScene} from './scene.js';
import {FirstPersonControls} from './controls.js';
import {CoopClient} from './network.js';
import {PrisonAudio} from './audio.js';
import {DEFAULT_SETTINGS,SETTING_RANGES,loadSettings,saveSettings,normalizeSettings} from './settings.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAVE='night-transfer.solo.v1';
const ANNEX_SAVE='night-transfer.annex.solo.v1';
const saveKey=campaign=>campaign==='annex'?ANNEX_SAVE:SAVE;
const GUIDANCE={simple:{title:'Simple',summary:'Guided objectives, useful references and a visual signal worksheet.'},moderate:{title:'Moderate',summary:'Broad direction and visible signal notation. Work out the connections yourself.'},expert:{title:'Expert',summary:'Minimal direction. Decode the receiver by ear. Sound is required.'}};
const preferenceStorage={getItem:key=>globalThis.localStorage.getItem(key),setItem:(key,value)=>globalThis.localStorage.setItem(key,value)};
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state=newGame(),roomId=LEVELS[0].startRoom,mode='menu',scene,controls,network,selected=null,dialogKind='',dialogData=null;
let pending=new Map(),roster=[],peers=[],teamIntent=false,connected=false,slotOwner=null,tipUntil=0,toastTimer,frame=0,lastFrame=0,lastUi=0,lastPresence=0,lastSave=0,currentTarget=null,elapsedSeconds=0,completedShown=false;
let settings=loadSettings(preferenceStorage,matchMedia('(prefers-reduced-motion: reduce)').matches);
let sound,settingsTab='controls',lookUsed=false,moveUsed=false,previewTimer;
let puzzleDrafts=new Map(),workingNotes='',signalUiTicket=0,coopCampaign='escape',puzzleKeyboard=null;
const isAnnex=()=>state.campaign==='annex';
const viewObject=id=>objectView(state,id,settings.guidance);
const publicRoom=room=>ROOMS[room]?.title||room;
const levelTitle=level=>LEVELS[level]?.shortTitle||LEVELS[level]?.title||`Wing ${level+1}`;
const now=()=>mode==='coop'&&network?network.serverNow:Date.now();
const desktopPointer=matchMedia('(hover: hover) and (pointer: fine)');
let mouseLookStatus={supported:true,enabled:true,locked:false,pending:false,reason:'ready'};

function readSave(campaign='escape'){
  try{
    const raw=JSON.parse(localStorage.getItem(saveKey(campaign))||'null');if(!raw||raw.version!==1)return null;
    const valid=validateSave(raw.state);if(!valid||(valid.campaign||'escape')!==campaign)return null;
    return {...raw,state:valid,room:availableRooms(valid).some(r=>r.id===raw.room)?raw.room:LEVELS[valid.level].startRoom};
  }catch{return null;}
}
function refreshMenu(){const saved=readSave(),annex=readSave('annex');$('continue-btn').hidden=!saved||saved.state.won;$('save-note').textContent=saved&&!saved.state.won?`Saved escape · ${levelTitle(saved.state.level)} · ${publicRoom(saved.room)}`:'A first-person escape. No account. No download.';if($('annex-save-note'))$('annex-save-note').textContent=annex&&!annex.state.won?`Continue from ${publicRoom(annex.room)}`:'Four rooms · Three guidance tiers · A harder escape';}
function claimSave(){slotOwner=uid();saveSolo(true);}
function saveSolo(claim=false){
  if(mode!=='solo'||document.hidden||!slotOwner)return;
  try{
    const key=saveKey(state.campaign),previous=JSON.parse(localStorage.getItem(key)||'null');
    if(!claim&&previous?.owner&&previous.owner!==slotOwner){slotOwner=null;toast('A newer solo session is open in another tab. This tab will not overwrite it.');return;}
    localStorage.setItem(key,JSON.stringify({version:1,state,room:roomId,pose:controls.pose,elapsedSeconds,owner:slotOwner,savedAt:Date.now(),drafts:Object.fromEntries(puzzleDrafts),workingNotes}));
  }catch{$('session-label').textContent='SOLO / STORAGE UNAVAILABLE';}
}
function toast(text){if(!text)return;$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
function stopSignal(){signalUiTicket++;sound?.stopPuzzleSignal?.('panel-closed');}
function modal(kind,html,data=null){stopSignal();puzzleKeyboard=null;dialogKind=kind;dialogData=data;$('dialog-content').innerHTML=html;$('modal-backdrop').hidden=false;controls?.setEnabled(false);$('dialog').scrollTop=0;$('dialog').focus({preventScroll:true});syncAudioActivity();refreshMouseLookUi();}
function closeModal(){stopSignal();puzzleKeyboard=null;dialogKind='';dialogData=null;selected=null;$('modal-backdrop').hidden=true;controls?.setEnabled(mode!=='menu'&&!state.won);if(mode!=='menu'&&!state.won)$('world').focus({preventScroll:true});syncAudioActivity();refreshMouseLookUi();}
function dismissPanel(){if(dialogKind==='coop'&&teamIntent){network.leave();teamIntent=false;}if(dialogKind==='win'){returnToMenu();return;}closeModal();}
function resumeWithMouse(){closeModal();if(desktopPointer.matches&&settings.desktopMouseLook)controls?.requestMouseLook();}
function panelTitle(kicker,title){return `<p class="eyebrow">${esc(kicker)}</p><h2 id="dialog-title">${esc(title)}</h2>`;}
function bind(id,handler){$(id)?.addEventListener('click',handler);}
function setRoom(id,pose=null){
  if(!ROOMS[id]||!availableRooms(state).some(room=>room.id===id))return false;roomId=id;scene.loadRoom(ROOMS[id],getObjects(state,id,settings.guidance),state);
  const fallback=ROOMS[id].spawn||{x:0,z:3.2,yaw:0};
  const valid=pose&&[pose.x,pose.z,pose.yaw].every(Number.isFinite)&&scene.canMove(pose.x,pose.z,.23);
  controls.setPose(valid?pose:fallback);scene.setCamera(controls.pose);sound?.setRoom(id);network?.presence({room:id,...controls.pose});updateHud();
}
function changeRoom(id){closeModal();$('transition').classList.add('active');controls.setEnabled(false);setTimeout(()=>{setRoom(id);$('transition').classList.remove('active');controls.setEnabled(mode!=='menu'&&!state.won&&!dialogKind);saveSolo();},settings.reduced?0:170);}
function showGame(){mode=mode==='coop'?'coop':'solo';$('menu').hidden=true;$('hud').hidden=false;lookUsed=moveUsed=false;document.body.classList.remove('look-learned');tipUntil=performance.now()+16000;$('control-tip').style.opacity='1';controls.setEnabled(true);syncAudioActivity();refreshMouseLookUi();updateHud();}
function startSolo(resume=false,campaign='escape'){
  network?.leave();teamIntent=false;pending.clear();roster=[];peers=[];connected=false;mode='solo';completedShown=false;closeModal();
  const saved=resume?readSave(campaign):null;state=saved?.state||newGame({campaign,seed:1+Math.floor(Math.random()*0x7ffffffe)});elapsedSeconds=saved?.elapsedSeconds||0;
  puzzleDrafts=new Map();if(saved?.drafts&&typeof saved.drafts==='object'&&!Array.isArray(saved.drafts))for(const [id,value]of Object.entries(saved.drafts).slice(0,24))if(OBJECTS[id]?.level===state.level){const object=viewObject(id);if(object?.puzzle)puzzleDrafts.set(id,sanitizeDraft(object.puzzle,value));}
  workingNotes=typeof saved?.workingNotes==='string'?saved.workingNotes.slice(0,3000):'';
  showGame();setRoom(saved?.room||LEVELS[state.level].startRoom,saved?.pose);claimSave();
  if(!saved)showIntro();
}
function returnToMenu(){saveSolo();network?.leave();mode='menu';connected=false;teamIntent=false;pending.clear();roster=[];peers=[];closeModal();controls.setEnabled(false);$('hud').hidden=true;$('menu').hidden=false;refreshMenu();state=newGame();setRoom(LEVELS[0].startRoom);}
function showIntro(){
  const level=LEVELS[state.level];const first=state.level===0;
  if(isAnnex()){
    modal('intro',panelTitle('WING 04 / '+GUIDANCE[settings.guidance].title.toUpperCase(),level.title)+`<p>${esc(level.intro)}</p><div class="notice"><p>${esc(guidanceContract())}</p><p>Three hints for this entire wing. Wrong attempts cost nothing. Your notes and unfinished combinations stay with you.</p></div><p class="desktop-only">WASD to move. Click or L for mouse look. E to inspect. N for notes; Esc releases the cursor.</p><p class="touch-only">One thumb on MOVE, the other on LOOK. Aim at an object and step closer until INSPECT lights up.</p><div class="intro-audio-row"><div><strong>Listen when you choose.</strong><small>Signals replay on demand. Headphones are optional.</small></div><button id="intro-audio" class="audio-toggle" aria-pressed="false">SOUND OFF</button></div><button id="intro-guide" class="text-button">CHANGE GUIDANCE</button><button id="intro-go" class="button primary">ENTER THE ANNEX <span>→</span></button>`);
    bind('intro-go',resumeWithMouse);bind('intro-guide',()=>showGuidance());bind('intro-audio',toggleSound);refreshAudioUi();return;
  }
  modal('intro',panelTitle(`WING ${String(state.level+1).padStart(2,'0')} / ${level.mechanic||'ESCAPE'}`,level.title)+`<p>${esc(level.intro||'Look closely. Every lock has a way through.')}</p>${first?inputControlMap():'<div class="notice"><p>Your keys and notes stay with you. Three fresh hints are available in this wing.</p></div>'}${first?'<div class="intro-audio-row"><div><strong>Put yourself inside.</strong><small>Optional footsteps & echoes. Every clue stays visual.</small></div><button id="intro-audio" class="audio-toggle" aria-pressed="false">SOUND OFF</button></div><button id="intro-setup" class="text-button">ADJUST CONTROLS & SOUND</button>':''}<button id="intro-go" class="button primary">${first?'FIND A WAY OUT':'KEEP MOVING'} <span>→</span></button>`);
  bind('intro-go',resumeWithMouse);bind('intro-audio',toggleSound);bind('intro-setup',()=>showSettings('controls'));refreshAudioUi();
}
function updateHud(){
  $('act-title').textContent=`WING ${String(state.level+1).padStart(2,'0')} / ${levelTitle(state.level).toUpperCase()}`;
  $('room-title').textContent=publicRoom(roomId);$('objective-text').textContent=isAnnex()?getGuidance(state,settings.guidance).objective:objective(state);
  document.body.classList.toggle('annex-mode',isAnnex());if($('guidance-btn')){$('guidance-btn').hidden=!isAnnex();$('guidance-btn').textContent=GUIDANCE[settings.guidance].title+' · GUIDANCE';$('guidance-btn').setAttribute('aria-label','Change guidance: '+GUIDANCE[settings.guidance].title);}
  $('item-count').textContent=String(state.inventory.length);const hints=getHints(state);$('hint-count').textContent=hints.remaining;$('hint-btn').setAttribute('aria-label',`Open hints, ${hints.remaining} of 3 remaining`);
  $('session-label').textContent=mode==='coop'?(connected?`TEAM ${network?.session?.code||''}`:'TEAM / RECONNECTING'):'SOLO / SAVED LOCALLY';
  $('crew-btn').hidden=mode!=='coop';$('crew-count').textContent=`${roster.filter(p=>p.connected).length||1}/4`;
  if(state.won&&!completedShown){completedShown=true;setTimeout(showWin,220);}
}
function useFocused(target=currentTarget){
  if(mode==='menu'||dialogKind||state.won)return;
  if(!target){toast('Look toward an object, then move close enough to inspect it.');return;}
  if(target.distance>2.6){toast('Move closer to inspect this.');return;}
  const object=viewObject(target.id);if(!object)return;
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
  if(result.ok&&context.kind==='solve'&&context.object){puzzleDrafts.delete(context.object.id);saveSolo();}
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
  if(context.kind==='hint'){if(dialogKind==='hints')showHints();else toast('A hint was added to your hint log.');return;}
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
  if(clue.type==='table')return `<div class="clue-card"><h3>${esc(clue.heading||'ANNEX RECORD')}</h3>${(clue.lines||[]).map(line=>`<p>${esc(line)}</p>`).join('')}<div class="clue-table-wrap" tabindex="0" aria-label="Scrollable evidence table"><table class="clue-table"><thead><tr>${(clue.columns||[]).map(column=>`<th scope="col">${esc(column)}</th>`).join('')}</tr></thead><tbody>${(clue.rows||[]).map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${clue.caption?`<p>${esc(clue.caption)}</p>`:''}${clue.stamp?`<span class="stamp">${esc(clue.stamp)}</span>`:''}</div>`;
  const entries=['order','frames'].includes(clue.type)?`<div class="clue-strip">${(clue.entries||[]).map((entry,i)=>`<div class="clue-tile ${clue.type==='frames'?(entry.watched?'watched':'dark-frame'):''}"><small>${String(i+1).padStart(2,'0')}</small><b>${esc(clue.type==='frames'?entry.value:entry.symbol)}</b><span>${esc(clue.type==='frames'?(entry.watched?'WATCHED':'DARK'):entry.label)}</span></div>`).join('')}</div>`:(clue.entries||[]).map(entry=>`<div class="clue-row"><b>${esc(entry.symbol||'')}</b><span>${esc(entry.label||'')}</span>${entry.value!==undefined?`<b>${esc(entry.value)}</b>`:''}</div>`).join('');
  return `<div class="clue-card"><h3>${esc(clue.heading||'FOUND IN THE PRISON')}</h3>${(clue.lines||[]).map(line=>`<p>${esc(line)}</p>`).join('')}${entries}${clue.caption?`<p style="margin-top:15px">${esc(clue.caption)}</p>`:''}${clue.stamp?`<span class="stamp">${esc(clue.stamp)}</span>`:''}</div>`;
}
function openObject(object){
  object=viewObject(object.id)||object;
  selected=object.id;
  const done=isDone(state,object.id);
  const inlineClue=object.puzzle?.type==='signal'&&!done?'':clueHtml(object.clue);
  let html=panelTitle(`${publicRoom(object.room)} / INSPECTION`,object.title)+`<p>${esc(object.description)}</p>${inlineClue}`;
  if(done&&(object.kind==='pickup'||object.kind==='timed'||object.kind==='puzzle'))html+=`<p class="result-text">${esc(object.doneText||'You already recovered what you need here.')}</p><button id="object-done" class="button primary">BACK TO THE ROOM <span>→</span></button>`;
  else if(object.kind==='puzzle')html+=puzzleHtml(object);
  else if(object.kind==='timed')html+=`<div class="scan-meter" id="timed-meter"><div class="scan-state"><span id="timed-label">WATCH THE LIGHT</span><span id="timed-seconds"></span></div><div class="scan-track"><div class="scan-fill" id="timed-fill"></div></div></div><button id="object-action" class="button primary">WAIT FOR BLIND INTERVAL <span>→</span></button><p id="puzzle-feedback" class="error-text" hidden></p>`;
  else if(object.kind==='pickup')html+=`<button id="object-action" class="button primary">${esc(object.actionLabel||'SEARCH HERE')} <span>→</span></button>`;
  else html+=`<button id="object-done" class="button primary">BACK TO THE ROOM <span>→</span></button>`;
  modal('object',html,{id:object.id});selected=object.id;
  bind('object-done',closeModal);bind('object-action',()=>dispatch({type:'interact',id:object.id,room:roomId},{kind:'pickup',object}));
  if(object.kind==='puzzle'&&!done)bindPuzzle(object);
}
function sanitizeDraft(puzzle,value){
  if(['code','signal'].includes(puzzle.type))return typeof value==='string'&&/^\d*$/.test(value)?value.slice(0,puzzle.length):'';
  if(puzzle.type==='sequence')return Array.isArray(value)?value.filter(v=>puzzle.options.some(o=>o.value===v)).slice(0,puzzle.length):[];
  if(puzzle.type==='switches')return (puzzle.labels||[]).map((_,i)=>Array.isArray(value)&&value[i]===true);
  if(puzzle.type==='valves')return (puzzle.labels||[]).map((_,i)=>Array.isArray(value)&&Number.isInteger(value[i])?Math.max(puzzle.min??0,Math.min(puzzle.max??6,value[i])):puzzle.initial?.[i]||0);
  return [];
}
function signalHtml(object){
  const data=annexSignal(state),packets=object.puzzle.packets||[],expert=settings.guidance==='expert';
  return `<section class="signal-receiver" aria-label="Annex receiver"><div class="receiver-head"><span><i></i> FIVE-PACKET TRANSMISSION</span><b>${expert?'LISTENING MODE':'VISUAL + AUDIO'}</b></div><p>${expert?'The carrier labels are visible; their two tones must be heard. Compare the reference tones, replay each packet, then apply the written protocol.':'Read the two tones in each packet or listen to them. The same evidence is available both ways. Apply the written protocol before entering the release code.'}</p><div class="tone-references" role="group" aria-label="Reference tones">${data.legend.map(tone=>`<button data-tone="${tone.id}"><span>▶</span> ${esc(tone.label)}<small>REFERENCE ${tone.value}</small></button>`).join('')}</div><div class="signal-packets">${packets.map((packet,i)=>`<div class="signal-packet" id="signal-packet-${i}"><span class="packet-label"><small>PACKET ${i+1}</small><b>${esc(packet.symbol)} ${esc(packet.label)}</b></span><span class="packet-notation">${expert?'<span class="ear-only">TWO TONES · LISTEN</span>':`<b>${(packet.tones||[]).map(t=>esc(t.toUpperCase())).join(' → ')}</b>${settings.guidance==='simple'&&Number.isInteger(packet.rawDigit)?`<small>Raw digit: ${packet.rawDigit} · correction still required</small>`:''}`}</span><button data-packet="${i}" aria-label="Replay packet ${i+1}">▶</button></div>`).join('')}</div><div class="signal-actions"><button id="signal-play" class="button secondary">${settings.sound?'PLAY TRANSMISSION':'ENABLE SOUND & PLAY'} <span>▶</span></button><button id="signal-stop" class="signal-stop" aria-label="Stop transmission">■ STOP</button></div><p id="signal-status" class="signal-status" role="status">${expert?'Replay freely. The signal is repeatable and never times out.':'No sound required with this guidance tier. Audio is optional.'}</p><button id="signal-guidance" class="text-button">${expert?'CANNOT HEAR IT? CHANGE GUIDANCE':'CHANGE GUIDANCE'}</button></section>`;
}
function puzzleHtml(object){
  const puzzle=object.puzzle||{};let html=`<p class="puzzle-prompt">${esc(puzzle.prompt||'Use what you have seen in this wing.')}</p>`;
  if(puzzle.type==='signal')html+=signalHtml(object);
  if(['code','signal'].includes(puzzle.type))html+=`<div class="code-readout" id="puzzle-readout" aria-live="polite">${'—'.repeat(puzzle.length||3)}</div><p class="keyboard-entry desktop-only">Type digits, Backspace to erase, Enter to submit.</p><div class="keypad">${[1,2,3,4,5,6,7,8,9,'CLEAR',0,'⌫'].map(v=>`<button data-digit="${v}" class="${typeof v==='number'?'':'small-key'}">${v}</button>`).join('')}</div>`;
  else if(puzzle.type==='sequence')html+=`<div class="code-readout" id="puzzle-readout" aria-live="polite">${'·'.repeat(puzzle.length||4)}</div><div class="sequence-options">${(puzzle.options||[]).map((o,i)=>`<button data-sequence="${i}"><b>${esc(o.symbol)}</b><small>${esc(o.label)}</small></button>`).join('')}</div><button class="text-button" id="sequence-clear">CLEAR SEQUENCE</button>`;
  else if(puzzle.type==='valves')html+=(puzzle.labels||[]).map((label,i)=>`<div class="valve-row"><span>${esc(label)}</span><div class="valve-control"><button data-valve="${i}" data-step="-1" aria-label="Decrease ${esc(label)}">−</button><b class="valve-number" id="valve-value-${i}">${puzzle.initial?.[i]||0}</b><button data-valve="${i}" data-step="1" aria-label="Increase ${esc(label)}">+</button></div></div>`).join('');
  else if(puzzle.type==='switches')html+=`<div class="relay-lamps" id="relay-lamps" role="status" aria-label="Live relay lamps"></div><div class="relay-switches" role="group" aria-label="Relay switches">${(puzzle.labels||[]).map((label,i)=>`<button data-switch="${i}" aria-pressed="false"><span class="switch-track"><i></i></span><b>${esc(label)}</b><small id="switch-state-${i}">OFF</small></button>`).join('')}</div><p class="relay-caption">A switch changes every lamp wired to it. Two feeds to the same lamp cancel. Commit the pattern when all lamps match the operating rule.</p>`;
  html+=`<p id="puzzle-feedback" class="error-text" hidden></p><button id="submit-puzzle" class="button primary">${esc(puzzle.submitLabel||'TRY THE MECHANISM')} <span>→</span></button>`;
  if(isAnnex())html+=`<div class="puzzle-tools"><button id="puzzle-notes" class="text-button">FIELD NOTES ↗</button><button id="puzzle-guide" class="text-button">${GUIDANCE[settings.guidance].title.toUpperCase()} GUIDANCE</button></div><p class="settings-caption">Your unfinished combination is kept while you check the evidence.</p>`;
  return html;
}
function bindPuzzle(object){
  const puzzle=object.puzzle;let value=sanitizeDraft(puzzle,puzzleDrafts.get(object.id));
  const render=()=>{
    if(['code','signal'].includes(puzzle.type))$('puzzle-readout').textContent=(value+'—'.repeat(puzzle.length)).slice(0,puzzle.length);
    else if(puzzle.type==='sequence')$('puzzle-readout').textContent=value.map(v=>puzzle.options.find(o=>o.value===v)?.symbol||v).join(' ')+ ' ·'.repeat(Math.max(0,puzzle.length-value.length));
    else if(puzzle.type==='valves')value.forEach((v,i)=>{$('valve-value-'+i).textContent=v;});
    else if(puzzle.type==='switches'){
      const readout=circuitReadout(state,value,settings.guidance);
      $('relay-lamps').innerHTML=readout.lamps.map(lamp=>`<div class="relay-lamp ${lamp.on?'is-on':''}"><i></i><b>${esc(lamp.symbol)}</b><span>${esc(lamp.label)}</span><strong>${lamp.on?'ON':'OFF'}</strong>${typeof lamp.target==='boolean'?`<small>NEED ${lamp.target?'ON':'OFF'}</small>`:''}</div>`).join('');
      document.querySelectorAll('[data-switch]').forEach(button=>{const i=Number(button.dataset.switch);button.setAttribute('aria-pressed',String(value[i]));$('switch-state-'+i).textContent=value[i]?'ON':'OFF';});
    }
    puzzleDrafts.set(object.id,Array.isArray(value)?[...value]:value);saveSolo();
  };
  const digit=key=>{if(key==='CLEAR')value='';else if(key==='⌫')value=value.slice(0,-1);else if(value.length<puzzle.length)value+=key;render();};
  document.querySelectorAll('[data-digit]').forEach(button=>button.addEventListener('click',()=>digit(button.dataset.digit)));
  document.querySelectorAll('[data-sequence]').forEach(button=>button.addEventListener('click',()=>{if(value.length<puzzle.length)value.push(puzzle.options[Number(button.dataset.sequence)].value);render();}));
  bind('sequence-clear',()=>{value=[];render();});
  document.querySelectorAll('[data-valve]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.valve);value[i]=Math.max(puzzle.min??0,Math.min(puzzle.max??6,value[i]+Number(button.dataset.step)));render();}));
  document.querySelectorAll('[data-switch]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.dataset.switch);value[i]=!value[i];render();}));
  const submit=()=>{if(!$('submit-puzzle')?.disabled)dispatch({type:'solve',id:object.id,value:Array.isArray(value)?[...value]:value,room:roomId},{kind:'solve',object});};
  bind('submit-puzzle',submit);bind('puzzle-notes',()=>showNotebook(object.id));bind('puzzle-guide',()=>showGuidance(object.id));
  if(['code','signal'].includes(puzzle.type))puzzleKeyboard=event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||event.isComposing||event.repeat||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||event.target?.isContentEditable)return;
    if(event.key==='Enter'&&['BUTTON','A','SUMMARY'].includes(event.target?.tagName))return;
    if(/^\d$/.test(event.key)){event.preventDefault();digit(event.key);}else if(event.key==='Backspace'){event.preventDefault();digit('⌫');}else if(event.key==='Enter'){event.preventDefault();submit();}
  };
  if(puzzle.type==='signal')bindSignal(object);
  render();
}
function bindSignal(object){
  const signal=annexSignal(state);
  const play=async({packetIndex,tone}={})=>{
    const ticket=++signalUiTicket;
    if(!settings.sound)changeSetting('sound',true);
    const active=()=>ticket===signalUiTicket&&dialogKind==='object'&&selected===object.id;
    const status=text=>{if(active()&&$('signal-status'))$('signal-status').textContent=text;};
    const callbacks={onProgress:progress=>{
      if(!active())return;
      signal.packets.forEach((_,i)=>$('signal-packet-'+i)?.classList.toggle('playing',progress.playing&&i===progress.packetIndex&&!tone));
      if(progress.playing)status(tone?`Reference ${tone.toUpperCase()} · listening`:`Packet ${progress.packetIndex+1} of ${signal.packets.length} · listening`);
    },onEnded:result=>{
      if(!active())return;
      signal.packets.forEach((_,i)=>$('signal-packet-'+i)?.classList.remove('playing'));
      status(result.reason==='completed'?'Playback complete. Replay any packet when you need.':'Playback stopped. You can replay whenever you are ready.');
    }};
    status('Preparing the receiver…');
    const result=await (tone?sound?.playPuzzleTone?.(tone,callbacks):sound?.playPuzzleSignal?.(signal.packets,{...callbacks,...(Number.isInteger(packetIndex)?{packetIndex}:{})}));
    if(!active())return;
    if(!result?.ok)status(result?.reason==='volume-zero'?'Master volume is at zero. Raise it in Setup → Sound, or switch to visual guidance.':(result?.message||'Sound could not start. Try Play again, or change to Simple or Moderate for visual signal cues.'));
    if($('signal-play'))$('signal-play').innerHTML='PLAY TRANSMISSION <span>▶</span>';
  };
  bind('signal-play',()=>play());bind('signal-stop',()=>{sound?.stopPuzzleSignal?.('stopped');});bind('signal-guidance',()=>showGuidance(object.id));
  document.querySelectorAll('[data-tone]').forEach(button=>button.addEventListener('click',()=>play({tone:button.dataset.tone})));
  document.querySelectorAll('[data-packet]').forEach(button=>button.addEventListener('click',()=>play({packetIndex:Number(button.dataset.packet)})));
}
function showInventory(){
  modal('inventory',panelTitle('WHAT YOU CARRIED OUT','Your pockets')+(state.inventory.length?`<div class="inventory-grid">${state.inventory.map(id=>{const item=ITEMS[id];return `<button class="inventory-item" data-item="${esc(id)}"><b>${esc(item.symbol||'⚿')}</b><span>${esc(item.title)}</span></button>`;}).join('')}</div>`:'<p>Empty, for now. Search the room for what someone left behind.</p>')+'<p>Matching keys are used automatically when you inspect a lock.</p>');
  document.querySelectorAll('[data-item]').forEach(b=>b.addEventListener('click',()=>{const item=ITEMS[b.dataset.item];modal('item',panelTitle('IN YOUR POCKETS',item.title)+`<div class="victory-mark">${esc(item.symbol||'⚿')}</div><p>${esc(item.description)}</p><button id="back-inventory" class="button secondary">BACK TO POCKETS <span>←</span></button>`);bind('back-inventory',showInventory);}));
}
function showNotebook(returnObject=null){
  const returnId=typeof returnObject==='string'?returnObject:null;
  const notes=state.inspected.map(id=>viewObject(id)).filter(o=>o?.clue),rooms=Object.values(ROOMS).filter(r=>r.level===state.level),access=availableRooms(state).map(r=>r.id);
  modal('notebook',panelTitle(isAnnex()?'DEAD AIR / FIELD EVIDENCE':'NOTHING TO REMEMBER BY SOUND','Field notes')+`<p>Clues you inspect are copied here. Take your time.${isAnnex()&&settings.guidance==='expert'?' Receiver tones are heard at the equipment; write your own deductions below.':''}</p><div class="room-list">${rooms.map(r=>`<span class="room-tag ${r.id===roomId?'current':''} ${access.includes(r.id)?'':'locked'}">${esc(r.title)}</span>`).join('')}</div>${notes.length?notes.map(o=>`<button class="note-button" data-note="${o.id}">${esc(o.title)} <span>↗</span></button>`).join(''):'<div class="notice"><p>No clues recorded yet. Look for papers, markings, and diagrams inside the prison.</p></div>'}${isAnnex()?`<label class="working-label" for="working-notes">YOUR WORKING NOTES</label><textarea id="working-notes" class="working-notes" maxlength="3000" placeholder="Record the route, packet readings or combinations you want to try…">${esc(workingNotes)}</textarea><p class="settings-caption">Private notes. Solo notes are saved with this escape.</p>`:''}${returnId?'<button id="notebook-return" class="button primary">BACK TO THE PUZZLE <span>←</span></button>':''}`);
  document.querySelectorAll('[data-note]').forEach(button=>button.addEventListener('click',()=>{const o=viewObject(button.dataset.note);modal('note',panelTitle(publicRoom(o.room),o.title)+clueHtml(o.clue)+'<button id="back-notes" class="button secondary">BACK TO NOTES <span>←</span></button>');bind('back-notes',()=>showNotebook(returnId));}));
  if($('working-notes'))$('working-notes').addEventListener('input',()=>{workingNotes=$('working-notes').value.slice(0,3000);saveSolo();});
  bind('notebook-return',()=>{if(OBJECTS[returnId]?.room===roomId)openObject(viewObject(returnId));else closeModal();});
}
function showHints(){const hints=getHints(state);modal('hints',panelTitle(`WING ${state.level+1} / ${hints.remaining} OF 3 REMAINING`,'A way forward')+`<p>Three hints per wing. Open only what you need.${mode==='coop'?' Your team shares this allowance.':''}</p>${(hints.log||[]).map((text,i)=>`<div class="hint-entry"><small>HINT ${i+1}</small><p>${esc(text)}</p></div>`).join('')}<button id="reveal-hint" class="button primary" ${hints.remaining?'':'disabled'}>${hints.remaining?'REVEAL NEXT HINT':'ALL THREE HINTS USED'} <span>↗</span></button>`);bind('reveal-hint',()=>dispatch({type:'hint'},{kind:'hint'}));}
function guidanceContract(){return settings.guidance==='expert'?'Expert uses a listening-only receiver clue. Compare the reference tones, then decode the transmission by ear. Switch guidance any time if you cannot hear it.':settings.guidance==='simple'?'Simple shows the next task, related evidence and a visual worksheet for the transmission. The deductions are still yours.':'Moderate gives broad direction and a visible notation of the transmission. Connect the evidence across rooms.';}
function guidanceChoices(){return `<div class="guidance-choices" role="group" aria-label="Guidance tier">${Object.entries(GUIDANCE).map(([id,tier])=>`<button id="guidance-${id}" data-guidance="${id}" class="guidance-choice" aria-pressed="${settings.guidance===id}"><strong>${tier.title}</strong><span>${tier.summary}</span>${id==='expert'?'<small>SOUND REQUIRED</small>':'<small>PLAYABLE SILENTLY</small>'}</button>`).join('')}</div><p id="guidance-contract" class="guidance-contract">${esc(guidanceContract())}</p>`;}
function bindGuidanceChoices(onChange=()=>{}){
  document.querySelectorAll('[data-guidance]').forEach(button=>button.addEventListener('click',()=>{
    changeSetting('guidance',button.dataset.guidance);
    document.querySelectorAll('[data-guidance]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice.dataset.guidance===settings.guidance)));
    if($('guidance-contract'))$('guidance-contract').textContent=guidanceContract();
    updateHud();onChange();
  }));
}
function guidanceDetail(){
  const guide=getGuidance(state,settings.guidance);
  return `<div class="guide-detail"><small>${settings.guidance==='expert'?'YOUR TASK':'CURRENT DIRECTION'}</small><h3>${esc(guide.objective)}</h3><p>${esc(guide.detail)}</p>${guide.references?.length?`<ul>${guide.references.map(id=>{const o=viewObject(id);return o?`<li><strong>${esc(o.title)}</strong><span>${esc(publicRoom(o.room))} · ${state.inspected.includes(id)?'in your notes':'not yet recorded'}</span></li>`:'';}).join('')}</ul>`:''}</div>`;
}
function showGuidance(returnObject=null){
  const returnId=typeof returnObject==='string'?returnObject:null;
  modal('guidance',panelTitle('DEAD AIR / GUIDANCE','Choose your challenge.')+guidanceChoices()+`<div id="guide-detail">${guidanceDetail()}</div><p class="settings-caption">Change tiers whenever you need. Progress and used hints are preserved. In co-op, this choice is yours.</p><button id="guidance-done" class="button primary">${returnId?'BACK TO THE PUZZLE':'BACK TO THE ROOM'} <span>→</span></button>`);
  bindGuidanceChoices(()=>{$('guide-detail').innerHTML=guidanceDetail();});
  bind('guidance-done',()=>{if(returnId&&OBJECTS[returnId]?.room===roomId)openObject(viewObject(returnId));else closeModal();});
}
function showAnnexSetup(){
  const saved=readSave('annex'),canContinue=saved&&!saved.state.won;
  modal('chapter',panelTitle('NEW ESCAPE / WING 04','Dead Air')+`<div class="annex-brief"><span class="annex-frequency">ASHGATE / COMMUNICATIONS ANNEX</span><p>A release protocol was scattered across four sealed rooms. Reconstruct the missing order. Bring the dormant network back to life. Find out what it has been repeating.</p><div class="chapter-rooms"><span>01 · ARCHIVE</span><span>02 · RELAYS</span><span>03 · LISTENING</span><span>04 · RELEASE</span></div></div><p>Clues connect across rooms. Routes, wiring and transmissions vary between runs. There is no countdown.</p><h3 class="section-label">HOW MUCH GUIDANCE?</h3>${guidanceChoices()}${canContinue?`<p class="chapter-save">Saved in ${esc(publicRoom(saved.room))}. Your original escape has its own save.</p>`:'<p class="chapter-save">A separate escape. Your original run stays saved.</p>'}<button id="annex-play" class="button primary">${canContinue?'CONTINUE DEAD AIR':'ENTER DEAD AIR'} <span>→</span></button>${canContinue?'<button id="annex-new" class="button ghost">START A NEW TRANSMISSION <span>↻</span></button>':''}<button id="annex-team" class="button secondary">ENTER WITH A CREW <small>2–4 PLAYERS</small></button>`);
  bindGuidanceChoices();bind('annex-play',()=>startSolo(!!canContinue,'annex'));bind('annex-team',()=>showCoop('annex'));
  bind('annex-new',()=>{modal('new-annex',panelTitle('A NEW TRANSMISSION','Replace the saved Dead Air run?')+'<p>Routes, wiring and signals will change. Your original escape stays saved.</p><button id="confirm-annex" class="button primary">START A NEW DEAD AIR <span>→</span></button><button id="cancel-annex" class="button ghost">KEEP THIS RUN <span>←</span></button>');bind('confirm-annex',()=>startSolo(false,'annex'));bind('cancel-annex',showAnnexSetup);});
}
function controlMap(){return `<div class="control-map" aria-label="${settings.leftHanded?'Right':'Left'} thumb moves; ${settings.leftHanded?'left':'right'} thumb looks"><div class="map-move"><span class="mini-stick"><i></i></span><strong>MOVE</strong><small>${settings.leftHanded?'RIGHT':'LEFT'} THUMB</small></div><p>Hold both<br>to walk & look</p><div class="map-look"><span class="mini-look">↔</span><strong>LOOK</strong><small>${settings.leftHanded?'LEFT':'RIGHT'} THUMB</small></div></div>`;}
function keyboardMap(){return `<div class="keyboard-map"><div><span class="key-cluster"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><strong>MOVE</strong></div><div><span class="mouse-symbol" aria-hidden="true"><i></i></span><strong>${settings.desktopMouseLook?'MOUSE LOOK':'DRAG TO LOOK'}</strong></div></div><p class="keyboard-intro">${settings.desktopMouseLook?'Click the scene or press <kbd>L</kbd> to capture the mouse. Move your mouse freely to look. When the cursor is free, the first click only captures.':'Hold the left mouse button and drag to look. Release, then click an object to inspect it.'} <kbd>Esc</kbd> opens the menu and frees your cursor.</p><div class="key-reference"><span><kbd>E</kbd> Inspect</span><span><kbd>C</kbd> Crouch</span><span><kbd>N</kbd> Notes</span><span><kbd>I</kbd> Pockets</span><span><kbd>H</kbd> Hints</span><span><kbd>M</kbd> Sound</span><span><kbd>O</kbd> Setup</span></div>`;}
function inputControlMap(){return `<div class="desktop-only">${keyboardMap()}</div><div class="touch-only">${controlMap()}</div>`;}
function showHelp(){modal('help',panelTitle('FIND YOUR FEET','Make your next move.')+inputControlMap()+`<div class="desktop-only"><div class="help-row"><b>01</b><p><strong>Walk and look together.</strong>WASD moves through the room; your mouse turns the view. The arrow keys also work: up/down walks, left/right turns.</p></div><div class="help-row"><b>02</b><p><strong>Aim. Step closer. Inspect.</strong>${settings.desktopMouseLook?'Point the center reticle at an object, then press E or left-click while the mouse is captured. Notes and panels release your cursor. Close them, then click the scene or press L to look again.':'Hold and drag to turn. Move close to an object, release the mouse, then click the object or aim the center reticle and press E. Close a panel to keep exploring.'}</p></div><p>C or Space toggles crouch. H opens the hints panel; it only spends a hint when you choose REVEAL NEXT HINT. Mouse sensitivity, vertical inversion and drag-look are in Setup.</p></div><div class="touch-only"><div class="help-row"><b>01</b><p><strong>A lighter touch to move.</strong>Slide the MOVE stick a little to walk slowly, or farther to move faster. You can move and look at the same time.</p></div><div class="help-row"><b>02</b><p><strong>Your other thumb goes on LOOK.</strong>Drag the labeled look pad to turn. Lift and reposition your thumb whenever you need. You can also swipe the open scene.</p></div><div class="help-row"><b>03</b><p><strong>Point. Get close. Inspect.</strong>The INSPECT button lights up when you can use an object. Matching keys work automatically.</p></div></div><p>Matching keys work automatically. Your notes keep every clue you inspect, and each wing has three hints.</p><div class="notice"><p>Headphones add footsteps, echoes and distant activity. <strong>The original escape stays fully visual. Dead Air adds a listening-only clue on Expert; Simple and Moderate include visual equivalents.</strong></p></div><button id="help-setup" class="button secondary">ADJUST MY CONTROLS <span>→</span></button><button id="help-done" class="button primary">GOT IT <span>→</span></button>`);bind('help-done',closeModal);bind('help-setup',()=>showSettings('controls'));}
function settingValue(key){const value=settings[key];if(key==='stickSize')return `${Math.round(value)} px`;if(key==='sensitivity')return `${value.toFixed(1)}×`;return `${Math.round(value*100)}%`;}
function sliderSetting(key,label,detail,step){const [min,max]=SETTING_RANGES[key];return `<label class="setting-slider" for="${key}"><span>${label}<output id="${key}-value" for="${key}">${settingValue(key)}</output></span><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-label="${label}"><small>${detail}</small></label>`;}
function toggleSetting(key,label,detail,id=key){return `<label class="setting-toggle" for="${id}"><span><strong>${label}</strong><small>${detail}</small></span><input id="${id}" type="checkbox" role="switch" aria-label="${label}" ${settings[key]?'checked':''}></label>`;}
function showSettings(tab='controls'){
  settingsTab=['controls','sound','view'].includes(tab)?tab:'controls';
  const tabs=`<div class="settings-tabs" role="tablist" aria-label="Setup sections">${[['controls','CONTROLS'],['sound','SOUND'],['view','VIEW']].map(([id,label])=>`<button id="tab-${id}" role="tab" aria-selected="${settingsTab===id}" aria-controls="settings-panel">${label}</button>`).join('')}</div>`;
  let content='';
  if(settingsTab==='controls'){
    const touchSettings=`<div class="control-preview" aria-hidden="true"><div class="preview-stick"><i></i><span>MOVE</span></div><span class="preview-inspect">INSPECT</span><div class="preview-look"><span>↔<small>LOOK</small></span></div></div><p class="settings-caption">Changes apply immediately. Make room for your view.</p>`+sliderSetting('buttonScale','Button size','Inspect, crouch and the look pad. Other targets stay easy to tap.',.05)+sliderSetting('stickSize','Movement stick size','A compact stick, with extra touch space around its edge.',4)+sliderSetting('controlOpacity','Control visibility','Fade the thumb pads while keeping their labels visible.',.05)+toggleSetting('leftHanded','Swap thumb controls','Move with your right thumb; look with your left.')+toggleSetting('lookGuide','Show look guide','Keep the LOOK ring visible when you lift your thumb.');
    const sharedSettings=sliderSetting('sensitivity','Look sensitivity','Lower for small, precise turns. Applies to mouse and touch.',.1)+toggleSetting('invert','Invert vertical look','Move or drag up to look down.');
    const mouseSettings=toggleSetting('desktopMouseLook','Capture mouse for free look','Click the scene or press L to look freely. Escape releases the cursor. Turn this off to hold and drag instead.');
    content=desktopPointer.matches?`<p class="settings-intro">A familiar first-person setup. Move with WASD, look with your mouse, inspect with E.</p>`+mouseSettings+sharedSettings+`<details class="touch-settings"><summary>TOUCHSCREEN CONTROLS</summary>${touchSettings}</details>`:touchSettings+sharedSettings+`<details class="touch-settings"><summary>MOUSE & KEYBOARD</summary>${mouseSettings}${keyboardMap()}</details>`;
    content+='<button id="reset-controls" class="text-button reset-button">RESET CONTROLS TO DEFAULT</button>';
  }
  else if(settingsTab==='sound')content=`<p class="settings-intro">A prison beyond your cell: footsteps, concrete echoes, pipes and muffled voices down the hall.</p>`+toggleSetting('sound','Prison sound','Atmosphere is optional. Dead Air Expert also uses sound to decode a clue.','sound-enabled')+sliderSetting('volume','Master volume','Start quietly, especially with headphones.',.05)+sliderSetting('atmosphere','Background atmosphere','Hum, distant chatter and room sounds. Footsteps keep their own clarity.',.05)+`<p id="audio-status" class="audio-status" role="status"></p><button id="sound-retry" class="button secondary" hidden>RESUME SOUND <span>→</span></button><button id="test-audio" class="button secondary">TRY A CELL DOOR ECHO <span>→</span></button><div class="notice"><p>The original escape and Dead Air on Simple or Moderate can be completed silently. Expert requires listening to the receiver. Audio pauses when you leave the game or switch apps.</p></div>`;
  else content=sliderSetting('brightness','Brightness','Lift the shadows for a bright room or a busy bar.',.05)+toggleSetting('reduced','Reduce motion','Steadier presentation and quicker room transitions.')+`<div class="notice"><p>Keep the center reticle on what you want to inspect. Phone controls adapt to portrait and landscape; desktop controls keep the view clear.</p></div>`;
  modal('settings',panelTitle('YOUR ESCAPE, YOUR FIT','Make yourself comfortable.')+tabs+`<div id="settings-panel" role="tabpanel">${content}</div>${isAnnex()?'<button id="settings-guidance" class="button secondary">DEAD AIR GUIDANCE <span>→</span></button>':''}<div class="settings-footer"><button id="settings-done" class="button primary">DONE <span>→</span></button></div>`);
  for(const id of ['controls','sound','view'])bind('tab-'+id,()=>showSettings(id));
  for(const key of Object.keys(SETTING_RANGES))if($(key))$(key).addEventListener('input',()=>{changeSetting(key,Number($(key).value));if($(key+'-value'))$(key+'-value').textContent=settingValue(key);});
  for(const key of ['invert','reduced','leftHanded','lookGuide','desktopMouseLook'])if($(key))$(key).addEventListener('change',()=>changeSetting(key,$(key).checked));
  if($('sound-enabled'))$('sound-enabled').addEventListener('change',()=>changeSetting('sound',$('sound-enabled').checked));
  bind('reset-controls',()=>{for(const key of ['buttonScale','stickSize','controlOpacity','sensitivity','leftHanded','lookGuide','invert','desktopMouseLook'])settings[key]=DEFAULT_SETTINGS[key];applySettings();saveSettings(preferenceStorage,settings);showSettings('controls');});
  bind('settings-guidance',()=>showGuidance());bind('test-audio',previewSound);bind('sound-retry',()=>{sound?.unlock();});bind('settings-done',closeModal);refreshAudioUi();
}
function changeSetting(key,value){settings=normalizeSettings({...settings,[key]:value},settings.reduced);applySettings();saveSettings(preferenceStorage,settings);if(key==='sound'&&settings.sound)sound?.unlock();if(key==='guidance'&&scene&&controls){scene.loadRoom(ROOMS[roomId],getObjects(state,roomId,settings.guidance),state);scene.setCamera(controls.pose);}}
function applySettings(){
  scene?.setBrightness(settings.brightness);if(controls){controls.sensitivity=settings.sensitivity;controls.invert=settings.invert;controls.setMouseLookEnabled(settings.desktopMouseLook);}
  const style=document.body.style;style.setProperty('--button-scale',settings.buttonScale);style.setProperty('--stick-size',settings.stickSize+'px');style.setProperty('--control-opacity',settings.controlOpacity);
  document.body.classList.toggle('reduced-motion',settings.reduced);document.body.classList.toggle('left-handed',settings.leftHanded);document.body.classList.toggle('hide-look-guide',!settings.lookGuide);
  if($('look-nudge'))$('look-nudge').textContent=`${settings.leftHanded?'LEFT':'RIGHT'} THUMB · DRAG`;
  const touchTip=document.querySelector('.touch-tip');if(touchTip)touchTip.textContent=`${settings.leftHanded?'RIGHT':'LEFT'} PAD TO MOVE · ${settings.leftHanded?'LEFT':'RIGHT'} PAD TO LOOK`;
  sound?.setEnabled(settings.sound);sound?.setVolume(settings.volume);sound?.setAtmosphere(settings.atmosphere);syncAudioActivity();refreshAudioUi();refreshMouseLookUi();if(scene&&controls&&mode!=='menu')updateHud();
}
function refreshMouseLookUi(status=mouseLookStatus){
  mouseLookStatus=status||mouseLookStatus;
  const {locked,pending,reason,supported}=mouseLookStatus;
  const fallback=!settings.desktopMouseLook||supported===false||reason==='denied';
  document.body.classList.toggle('mouse-captured',!!locked);
  if($('desktop-controls')){$('desktop-controls').hidden=mode==='menu'||!!dialogKind||state.won;$('desktop-controls').dataset.state=locked?'locked':fallback?'drag':pending?'pending':'ready';}
  const button=$('mouse-look-btn');
  if(button){button.hidden=!!locked||!settings.desktopMouseLook||supported===false;button.disabled=!!pending;button.innerHTML=(pending?'CAPTURING…':reason==='denied'?'RETRY MOUSE LOOK':'CLICK TO LOOK')+' <kbd>L</kbd>';}
  if($('mouse-look-status'))$('mouse-look-status').textContent=locked?'MOUSE LOOK · ESC FREES CURSOR':fallback?'Hold and drag to look. Click an object or press E to inspect.':pending?'Waiting for mouse capture…':'Click the scene or press L to look freely.';
}
function desktopShortcut(action){
  if(mode==='menu'||dialogKind||state.won)return;
  const actions={notes:showNotebook,pockets:showInventory,hints:showHints,sound:toggleSound,settings:()=>showSettings('controls')};actions[action]?.();
}
function syncAudioActivity(){sound?.setActive(mode!=='menu'&&!state.won&&dialogKind!=='pause');}
function markLookUsed(){lookUsed=true;document.body.classList.add('look-learned');if(moveUsed)tipUntil=0;}
function markMoveUsed(){moveUsed=true;if(lookUsed)tipUntil=0;}
const speakerIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path class="audio-waves" d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/><path class="audio-slash" d="m17 9 5 6m0-6-5 6"/></svg>`;
function refreshAudioUi(status=sound?.getStatus()){
  for(const id of ['menu-audio','audio-btn','intro-audio']){const button=$(id);if(!button||button.dataset.soundState===String(settings.sound))continue;button.dataset.soundState=String(settings.sound);button.setAttribute('aria-pressed',String(settings.sound));button.setAttribute('aria-label',settings.sound?'Mute prison sound':'Enable prison sound');button.innerHTML=speakerIcon+`<span>SOUND ${settings.sound?'ON':'OFF'}</span>`;}
  document.body.classList.toggle('sound-on',settings.sound);
  if($('sound-enabled'))$('sound-enabled').checked=settings.sound;
  if($('audio-status'))$('audio-status').textContent=!settings.sound?(isAnnex()&&settings.guidance==='expert'?'Sound is off. Expert needs the receiver tones; enable sound when you reach it, or choose visual guidance.':'Sound is off. This escape is playable with visual clues.'):status?.supported===false?(isAnnex()&&settings.guidance==='expert'?'Audio is unavailable here. Switch to Simple or Moderate for visual signal cues.':'Audio is unavailable here. Every required clue remains visual.'):mode==='menu'?'Sound starts when you enter. Use the preview below to set a comfortable volume.':status?.message||'Prison sound is ready.';
  if($('sound-retry'))$('sound-retry').hidden=!(settings.sound&&status?.needsGesture);
}
function toggleSound(){changeSetting('sound',!settings.sound);}
function previewSound(){
  if(!settings.sound)changeSetting('sound',true);sound?.setActive(true);
  Promise.resolve(sound?.unlock()).then(ready=>{if(ready&&settings.sound&&dialogKind==='settings')sound.cue('door');});
  clearTimeout(previewTimer);previewTimer=setTimeout(syncAudioActivity,2200);
}
function showPause(){if(mode==='menu'||dialogKind||state.won)return;modal('pause',panelTitle('TAKE A BREATH','Still on the inside.')+`<p>${mode==='coop'?'Your crew can keep moving while this menu is open.':'Your escape is saved in this browser.'}</p><button id="resume-btn" class="button primary">RETURN TO THE ROOM <span>→</span></button><button id="pause-settings" class="button secondary">SETTINGS <span>☷</span></button><button id="pause-help" class="button ghost">CONTROLS <span>↗</span></button><button id="pause-title" class="button ghost">${mode==='coop'?'LEAVE TEAM & TITLE SCREEN':'SAVE & TITLE SCREEN'} <span>←</span></button>`);bind('resume-btn',resumeWithMouse);bind('pause-settings',()=>showSettings('controls'));bind('pause-help',showHelp);bind('pause-title',returnToMenu);}
function showWin(){
  if(mode==='menu')return;completedShown=true;controls.setEnabled(false);saveSolo();const mins=Math.floor(elapsedSeconds/60),secs=Math.floor(elapsedSeconds%60),annex=isAnnex();
  modal('win',panelTitle(annex?'DEAD AIR / OUTSIDE THE ANNEX':'ASHGATE / OUTSIDE THE WIRE',annex?'Your signal got through.':'The list ends here.')+`<div class="victory-mark">${annex?'CLEAR.':'FREE.'}</div><p>${annex?'The interlock releases. Behind you, the receiver keeps a silent watch over a transfer that will never come. The last door belongs to you.':'For the first time tonight, the road has no lock. Behind you, the prison waits for a transfer that will never arrive.'}</p><div class="stats-row"><div><strong>${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</strong><small>TIME INSIDE</small></div><div><strong>${state.hintsUsed.reduce((a,b)=>a+b,0)} / ${annex?3:9}</strong><small>HINTS USED</small></div></div><button id="win-annex" class="button secondary">${annex?'TRY A NEW TRANSMISSION':'NEXT CHALLENGE · DEAD AIR'} <span>↗</span></button><button id="win-menu" class="button primary">BACK TO THE TITLE <span>→</span></button>`);bind('win-menu',returnToMenu);bind('win-annex',()=>{returnToMenu();showAnnexSetup();});
}
function showCoop(campaign='escape'){
  coopCampaign=campaign==='annex'?'annex':'escape';
  modal('coop',panelTitle('PRIVATE ESCAPE / 2–4 PLAYERS','Nobody leaves alone.')+`<p>Walk independently. Share keys, clues, and progress. You will see your crew when you are in the same room.</p><label class="field-label" for="team-campaign">ESCAPE FOR A NEW TEAM</label><select id="team-campaign" class="text-input"><option value="escape" ${coopCampaign==='escape'?'selected':''}>Original escape · Three wings</option><option value="annex" ${coopCampaign==='annex'?'selected':''}>Dead Air · Communications annex</option></select><label class="field-label" for="player-name">YOUR CALL SIGN</label><input id="player-name" class="text-input" value="Inmate 41" maxlength="20" autocomplete="off"><button id="create-team" class="button primary">CREATE A TEAM <span>→</span></button><div class="panel-divider"></div><label class="field-label" for="join-code">OR ENTER A SIX-CHARACTER ROOM CODE</label><input id="join-code" class="text-input code-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false"><button id="join-team" class="button secondary">JOIN YOUR CREW <span>→</span></button><p id="team-feedback" class="error-text" hidden></p><p style="font-size:10px;margin-top:20px;margin-bottom:0">Co-op is a separate escape. Your solo save stays here. Brief disconnects can recover; a server restart ends the team session.</p>`);
  if(network.resumeInfo){const resume=document.createElement('button');resume.id='resume-team';resume.className='button secondary';resume.textContent=`REJOIN TEAM ${network.resumeInfo.code}`;$('dialog-content').insertBefore(resume,$('dialog-content').children[2]);resume.addEventListener('click',()=>{teamIntent=true;resume.disabled=true;$('create-team').disabled=true;$('join-team').disabled=true;$('team-feedback').hidden=false;$('team-feedback').textContent='Rejoining your crew…';network.reconnect();});}
  const connect=create=>{const name=$('player-name').value.trim()||'Inmate 41';const code=$('join-code').value.trim().toUpperCase();if(!create&&!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)){$('team-feedback').hidden=false;$('team-feedback').textContent='Enter the six-character code from your crew.';return;}teamIntent=true;$('create-team').disabled=true;$('join-team').disabled=true;$('team-feedback').hidden=false;$('team-feedback').textContent='Opening a connection…';if(create)network.create(name,{campaign:$('team-campaign')?.value==='annex'?'annex':'escape'});else network.join(code,name);};
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
  if(initial){elapsedSeconds=0;completedShown=false;puzzleDrafts=new Map();workingNotes='';showGame();setRoom(LEVELS[state.level].startRoom);showCrew();}
  else if(previousLevel!==state.level){closeModal();setRoom(LEVELS[state.level].startRoom);showIntro();}
  updateHud();if(dialogKind==='hints')showHints();if(dialogKind==='guidance'&&$('guide-detail'))$('guide-detail').innerHTML=guidanceDetail();
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
  controls=new FirstPersonControls({canvas:$('world'),joystick:$('touch-move'),knob:$('joystick-knob'),lookPad:$('touch-look'),onLook:markLookUsed,onMove:markMoveUsed,onMouseLook:refreshMouseLookUi,onShortcut:desktopShortcut,onInteract:()=>useFocused(),onPause:showPause,onTap:(x,y)=>{const target=scene.targetAt?.(x,y);if(target)useFocused(target);},onCrouch:crouch=>{$('crouch-btn').setAttribute('aria-pressed',String(crouch));$('stance').textContent=crouch?'CROUCHING':'STANDING';}});
  network=new CoopClient({onState:onTeamState,onStatus:onTeamStatus,onRoster:list=>{roster=list;updateHud();if(dialogKind==='crew'&&$('crew-list'))$('crew-list').innerHTML=crewHtml();},onPoses:list=>{peers=list;},onMessage:packet=>{
    if(packet.type==='action-result'){const context=pending.get(packet.actionId);pending.delete(packet.actionId);if(context)handleResult(packet,context);}
    else if(packet.message&&mode==='coop')toast(packet.message);
  }});
  bind('start-btn',()=>{if(readSave()&&!readSave().state.won){modal('new',panelTitle('A FRESH ESCAPE','Start from the beginning?')+'<p>Your existing solo escape will be replaced when you start.</p><button id="confirm-new" class="button primary">START A NEW ESCAPE <span>→</span></button><button id="cancel-new" class="button ghost">KEEP MY SAVE <span>←</span></button>');bind('confirm-new',()=>startSolo(false));bind('cancel-new',closeModal);}else startSolo(false);});
  bind('continue-btn',()=>startSolo(true));bind('coop-btn',showCoop);bind('how-btn',showHelp);bind('pause-btn',showPause);bind('notes-btn',showNotebook);bind('hint-btn',showHints);bind('settings-btn',()=>showSettings('controls'));bind('menu-settings',()=>showSettings('controls'));bind('menu-audio',toggleSound);bind('audio-btn',toggleSound);bind('inventory-btn',showInventory);bind('crew-btn',showCrew);bind('interact-btn',()=>useFocused());bind('crouch-btn',()=>controls.toggleCrouch());
  bind('mouse-look-btn',()=>controls.requestMouseLook());bind('annex-btn',showAnnexSetup);bind('guidance-btn',()=>showGuidance());
  bind('close-dialog',dismissPanel);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.repeat&&!e.defaultPrevented&&dialogKind){e.preventDefault();dismissPanel();}else if(dialogKind==='object'&&!e.defaultPrevented)puzzleKeyboard?.(e);});
  window.addEventListener('pointerdown',()=>{if(settings.sound)sound?.unlock();},{capture:true,passive:true});
  window.addEventListener('keydown',()=>{if(settings.sound)sound?.unlock();},{capture:true});
  window.addEventListener('resize',()=>scene.resize());window.addEventListener('pagehide',()=>saveSolo());
  desktopPointer.addEventListener?.('change',()=>{if(dialogKind==='settings'&&settingsTab==='controls')showSettings('controls');refreshMouseLookUi();});
  window.addEventListener('storage',event=>{if([SAVE,ANNEX_SAVE].includes(event.key)&&mode==='menu')refreshMenu();});
  bind('reload-btn',()=>location.reload());
  applySettings();setRoom(LEVELS[0].startRoom);refreshMenu();frame=requestAnimationFrame(animate);
  if(new URL(location.href).searchParams.has('room'))showCoop();else if(new URL(location.href).searchParams.get('chapter')==='dead-air')showAnnexSetup();
}catch(error){$('fatal').hidden=false;$('fatal-message').textContent='The 3D view could not start in this browser. Try reopening the link in Safari or Chrome, then reload.';console.error('Night Transfer startup failed',error);$('reload-btn').addEventListener('click',()=>location.reload());}
