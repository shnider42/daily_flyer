import * as Sim from './sim.mjs';
import {Renderer} from './renderer.mjs';
import {WORLD,LOCATIONS,VEHICLE_TYPES,islandAt} from './world.mjs';
import {PROTAGONIST,CONTACTS,MISSIONS,JOBS,ARCS,ENDINGS,HELP} from './content.mjs';
import {AudioBus} from './audio.mjs';
import {CoopClient,readSession,CREW_SAVE_KEY} from './coop-client.mjs';
import {normalizeRoomCode} from './coop-protocol.mjs';
import {lobbyContent,crewContent} from './coop-ui.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SAVE='dfe.suncoast.save.v1',SETTINGS='dfe.suncoast.settings.v1';
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function write(key,data){try{localStorage.setItem(key,JSON.stringify(data));return true;}catch{return false;}}
const settings={guidance:'simple',sound:true,music:false,volume:.28,zoom:1,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,touch:matchMedia('(any-pointer: coarse)').matches||navigator.maxTouchPoints>0,...read(SETTINGS,{})};
const audio=new AudioBus(),renderer=new Renderer($('#world'));
let game=Sim.createGame(),mode='title',panel=null,phoneTab='stories',lastFrame=performance.now(),accum=0,hudAt=0,saveAt=0,lastNotification='',toastUntil=0,dialogueSignature='',outcomeSignature='',waypoint=null,fullTransform=null,lastFocus=null,saveFailed=false;
let pointer={x:innerWidth/2,y:innerHeight/2,active:false,fire:false},stick={id:null,x:0,y:0},held={sprint:false,fire:false};
const keys=new Set();let latestHealth=100,latestProgress='',latestObjective='',viewportFrame=0;
let online=false,crewStatus='idle',crewReason='',crewName=read('dfe.suncoast.crew.name.v1',''),crewCode=normalizeRoomCode(new URLSearchParams(location.search).get('crew')||''),crewSaveAt=0,crewSaveRequestedAt=0,crewSaveAnnounce=false,crewRequestType='',lastRosterSignature='',leavingAfterCheckpoint=null,crewExitTimer=null;
const network=new CoopClient({
 onStatus(status,reason){crewStatus=status;crewReason=reason;updateCrewStatus();},
 onState(state){if(!online)return;game=state;if(mode==='play'){observe();updateCrewStatus();}},
 onJoined(message){enterCrew(message.state);},
 onResult(result,action){
  if(result.id===leavingAfterCheckpoint){clearTimeout(crewExitTimer);leavingAfterCheckpoint=null;finishTitle();if(!result.ok||saveFailed)setText('#menu-status','The last crew checkpoint could not be saved. Your earlier checkpoint is still available.');return;}
  if(!result.ok){const text=result.reason||'That action is not available right now.';crewReason=text;if(mode==='play')notify(text);updateCrewStatus();}
  if(action?.type==='choose'&&!result.ok){dialogueSignature='';observe(true);}
 },
 onCheckpoint(save){
  const ok=write(CREW_SAVE_KEY,{savedAt:Date.now(),save});saveFailed=!ok;
  if(ok)crewSaveAt=Date.now();
  if(crewSaveAnnounce||!ok)notify(ok?'Crew checkpoint saved on this device.':'Your browser could not save the crew checkpoint.',6000);
  crewSaveAnnounce=false;updateCrewStatus();
 }
});
function setText(selector,value){const n=$(selector),s=String(value??'');if(n&&n.textContent!==s)n.textContent=s;}
function syncOverlayState(){
 const blocked=!!panel||(mode==='play'&&(!!game.dialogue||game.phase!=='playing'));
 document.body.classList.toggle('modal-open',blocked);
 $('#hud').inert=blocked;
}
function setObjectiveHelp(open){
 document.body.classList.toggle('objective-expanded',open);
 const button=$('#objective-toggle');
 if(button){button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Hide current job guidance':'Show current job guidance');button.textContent=open?'Hide help':'Help';}
}
function queueViewportResize(){
 if(viewportFrame)return;
 resetInput();
 viewportFrame=requestAnimationFrame(()=>{
  viewportFrame=0;renderer.resize();
  if(panel==='map')drawFullMap();
  if(mode==='play')updateHud();
 });
}
function syncSettings(){document.body.classList.toggle('coarse',settings.touch);document.body.classList.toggle('expert',settings.guidance==='expert');document.body.classList.toggle('reduced-motion',settings.reducedMotion);audio.enabled=settings.sound;audio.music=settings.music;audio.volume=settings.volume;write(SETTINGS,settings);}
function resetInput(){
 keys.clear();pointer.fire=false;held.sprint=false;held.fire=false;
 const id=stick.id;stick={id:null,x:0,y:0};
 if(id!==null&&$('#stick').hasPointerCapture(id))$('#stick').releasePointerCapture(id);
 $('#stick-thumb').style.transform='';
 $$('.touch.held').forEach(b=>b.classList.remove('held'));
 if(online)network.neutral();
}
function persist(announce=false){
 if(mode!=='play')return false;
 if(online){
  if(!network.isHost){if(announce)notify('The host saves this crew story. Your solo save stays separate.');return false;}
  if(!network.connected)return false;
  if(!announce&&performance.now()-crewSaveRequestedAt<10000)return true;
  crewSaveAnnounce=announce;crewSaveRequestedAt=performance.now();return !!network.action({type:'checkpoint'});
 }
 const ok=write(SAVE,Sim.serializeGame(game));saveFailed=!ok;
 if(announce)notify(ok?'Story saved on this device.':'This browser could not save. Export a backup from Pause before closing.');return ok;
}
function notify(text,ms=5400){setText('#notification',text);$('#notification').hidden=false;toastUntil=performance.now()+ms;}
function refreshContinue(){const exists=!!read(SAVE,null);$('#continue').hidden=!exists;$('#start').textContent=exists?'New story':'Start your story';$('#start').classList.toggle('primary',!exists);$('#start').classList.toggle('secondary',exists);}
function enter(saved=null){if(online){persist();network.leave();online=false;crewStatus='idle';}updateCrewStatus();try{const next=saved?Sim.restoreGame(saved):Sim.createGame();game=next;mode='play';panel=null;waypoint=null;lastNotification='';dialogueSignature='';outcomeSignature='';renderer.initial=true;$('#title-screen').hidden=true;$('#hud').hidden=false;$('#panel-overlay').hidden=true;document.body.classList.add('playing');resetInput();audio.unlock();lastFrame=performance.now();accum=0;persist();observe(true);updateHud();}catch(e){setText('#menu-status',e.message||'This saved story could not be loaded.');if(panel)notify(e.message);}}
function showTitle(){
 if(online){leaveCrew();return;}persist();finishTitle();
}
function finishTitle(){
 if(online){network.leave();online=false;crewStatus='idle';game=Sim.createGame();}
 mode='title';setText('#menu-status','');resetInput();closePanel();$('#hud').hidden=true;$('#dialogue-overlay').hidden=true;$('#outcome-overlay').hidden=true;$('#title-screen').hidden=false;document.body.classList.remove('playing');audio.silence();refreshContinue();updateCrewStatus();
}
function leaveCrew(){
 if(leavingAfterCheckpoint)return;
 if(!network.connected||!network.isHost){finishTitle();return;}
 crewReason='Saving your crew checkpoint before leaving…';updateCrewStatus();
 leavingAfterCheckpoint=network.action({type:'checkpoint'});
 if(!leavingAfterCheckpoint){finishTitle();return;}
 crewExitTimer=setTimeout(()=>{leavingAfterCheckpoint=null;finishTitle();setText('#menu-status','The final checkpoint could not be confirmed. Your earlier crew checkpoint is available.');},4000);
}
function toggleWeapon(){if(mode!=='play'||panel||game.dialogue)return;if(online){network.action({type:'toggleWeapon'});return;}Sim.toggleWeapon?.(game);observe();updateHud();}
function interact(){if(mode!=='play'||panel)return;audio.unlock();if(game.dialogue)return;if(online){network.action({type:'interact'});return;}Sim.interact(game);observe();updateHud();persist();}
function takeChoice(index){
 if(online){if(network.action({type:'choose',index,dialogueId:game.dialogue?.id}))$$('#dialogue-choices button').forEach(b=>b.disabled=true);resetInput();return;}
 Sim.choose(game,index);audio.play('choice');dialogueSignature='';resetInput();observe(true);updateHud();persist();
}
function observe(force=false){
 const notes=game.notifications||[],latest=notes.at(-1);if(latest&&latest.id!==lastNotification){const seen=notes.findIndex(n=>n.id===lastNotification),fresh=notes.slice(seen+1),priority=fresh.filter(n=>['unlock','complete'].includes(n.kind)).at(-1),last=priority||fresh.filter(n=>n.kind!=='mission'&&n.kind!=='choice').at(-1);lastNotification=latest.id;if(last&&mode==='play'){notify(last.text,last.kind==='complete'||last.kind==='unlock'?8500:5200);audio.play(last.kind);}}
 if(game.dialogue&&mode==='play'&&!panel){
  const signature=JSON.stringify(game.dialogue);if(force||signature!==dialogueSignature){dialogueSignature=signature;resetInput();const d=game.dialogue;setText('#dialogue-speaker',d.speaker||'BAHÍA LUCERO');setText('#dialogue-title',d.title);setText('#dialogue-text',d.text);setText('#speaker-mark',(d.speaker||'BL').split(/\s+/).map(w=>w[0]).slice(0,2).join(''));$('#dialogue-choices').innerHTML=(d.choices||[]).map((c,i)=>`<button data-choice="${i}"><strong>${esc(c.label||'Continue')}</strong>${c.detail?`<small>${esc(c.detail)}</small>`:''}</button>`).join('');$('#dialogue-overlay').hidden=false;$('#dialogue-choices button')?.focus({preventScroll:true});}
 }else{$('#dialogue-overlay').hidden=true;dialogueSignature='';}
 if(game.phase!=='playing'&&mode==='play'&&!panel){
  const sig=game.phase+JSON.stringify(game.outcome);if(force||sig!==outcomeSignature){outcomeSignature=sig;resetInput();setText('#outcome-label',game.phase==='busted'?'ARRESTED · A DIFFERENT KIND OF BAD DAY':'HOSPITAL · ANOTHER CHANCE');setText('#outcome-title',game.outcome?.title||'Still breathing.');setText('#outcome-text',`${game.outcome?.text||''}\n\n${game.phase==='busted'?'Booking fine':'Hospital bill'}: $${game.outcome?.cost||0}. You have $${game.player.cash} left.`);$('#retry').hidden=online||!game.mission;$('#outcome-overlay').hidden=false;$('#recover').focus({preventScroll:true});persist();}
 }else{$('#outcome-overlay').hidden=true;outcomeSignature='';}
 syncOverlayState();
 const prog=game.progress.completed.join('|')+JSON.stringify(game.progress.choices);if(prog!==latestProgress){latestProgress=prog;persist();}
}
function updateHud(){
 setText('#player-name',online?(game.crew?.find(p=>p.id===game.coop?.playerId)?.name||'YOUR CREW'):'LUCÍA REYES');
 const p=game.player,v=Sim.getVehicle(game),w=game.wanted,obj=Sim.getObjective(game),where=p.interior?(LOCATIONS[p.interior]||WORLD.buildings.find(b=>b.id===p.interior))?.island:islandAt(p.x,p.y);
 setText('#cash',`$${Math.floor(p.cash).toLocaleString('en-US')}`);setText('#health-value',Math.ceil(Math.max(0,p.hp)));$('#health-fill').style.width=`${clamp(p.hp,0,100)}%`;$('#health-fill').style.background=p.hp<30?'var(--red)':'var(--mint)';
 document.body.classList.toggle('inside',!!p.interior);setText('#vehicle-label',v?(p.seat==='passenger'?'Passenger · ':'')+VEHICLE_TYPES[v.type]?.name:p.swimming?'Swimming':p.interior?'Inside · on foot':'On foot');setText('#weapon-label',p.weapon==='pistol'?`Pistol · ${p.ammo}`:p.armor>0?`Vest ${Math.ceil(p.armor)} · holstered`:'Holstered');setText('#weapon-toggle',p.weapon==='pistol'?'Holster':'Draw');
 const district=where>=0?WORLD.islands[where].name:'Bahía Lucero';setText('#district',district.toUpperCase());setText('#minimap-label',district.toUpperCase());const hour=Math.floor(game.dayTime||16),min=Math.floor(((game.dayTime||16)-hour)*60);setText('#clock',`${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
 const stars=Math.max(0,w.stars||0),starHtml=Array.from({length:6},(_,i)=>`<span class="${i<stars?'on':''}">★</span>`).join('');if($('#stars').innerHTML!==starHtml)$('#stars').innerHTML=starHtml;$('#stars').classList.toggle('search',w.mode==='search');$('#stars').setAttribute('aria-label',stars?`${stars} star wanted level`:'No police attention');
 const state=w.report>0?'WITNESS REPORTING':w.mode==='pursuit'?'POLICE PURSUIT':w.mode==='search'?'SEARCHING LAST KNOWN POSITION':'NO POLICE ATTENTION';setText('#wanted-state',state);setText('#wanted-reason',stars||w.report>0?w.reason:'');$('.search-meter').hidden=w.mode!=='search';$('.search-meter span').style.width=`${clamp(w.search||0,0,1)*100}%`;
 const objectiveKey=[obj.title,obj.progress,obj.text].join('|');if(objectiveKey!==latestObjective){latestObjective=objectiveKey;setObjectiveHelp(false);}setText('#objective-title',obj.title);setText('#objective-text',obj.text);setText('#objective-progress',obj.progress||'');let hint=obj.hint||'';if(settings.touch)hint=hint.replace('Phone: Tab · Map: M · Interact: E','Use the Phone, Map, and Use buttons').replace(/press E|Press E|use E/g,'tap Use').replace(/W\/S accelerate and brake; A\/D steer\./g,'Point the left stick where you want to drive.').replace(/Use Q/g,'Use Draw / Holster');setText('#objective-hint',settings.guidance==='moderate'?hint.split('. ')[0]+(hint.includes('. ')?'.':''):hint);
 const prompt=Sim.getPrompt(game);const nearbyCar=online&&prompt?.kind==='vehicle'?game.vehicles.filter(c=>c.hp>0&&!c.impounded).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]:null;if(nearbyCar?.driverId)prompt.text='Ride with '+(game.crew?.find(m=>m.id===nearbyCar.driverId)?.name||'your crew');$('#context-prompt').hidden=!prompt;setText('#context-prompt span',prompt?.text||'');const label=prompt?.kind?.includes('vehicle')?(v?'Exit':nearbyCar?.driverId?'Ride':'Drive'):prompt?.kind==='enter'?'Enter':prompt?.kind==='exit'?'Leave':prompt?.kind==='mission'||prompt?.kind==='service'?'Talk':'Use';setText('#touch-interact span',label);$('#touch-interact').style.opacity=prompt?'1':'.6';
 $('#driving-hud').hidden=!v;if(v){setText('#speed',Math.round(Math.abs(v.speed)*.14));setText('#car-health',`VEHICLE ${Math.max(0,Math.round(v.hp/VEHICLE_TYPES[v.type].health*100))}%`);}setText('#touch-sprint span',v?(v.speed>8?'Brake':'Reverse'):'Run');$('#touch-sprint').setAttribute('aria-label',v?'Hold to brake, then reverse':'Hold to run');setText('#touch-fire span',p.weapon==='pistol'?'Fire':'Punch');
 renderer.drawMap($('#minimap'),game,{full:false,objective:mapObjective(obj),waypoint});updateCrewStatus();
}
function mapObjective(o){if(!o||!Number.isFinite(o.x))return null;if(game.player.interior&&o.interior){const l=LOCATIONS[game.player.interior]||WORLD.buildings.find(b=>b.id===game.player.interior);return l?Sim.getObjective({...game,player:{...game.player,interior:null,x:l.door.x,y:l.door.y}}):null;}return o;}
function openPanel(kind){
 if(mode==='play'&&game.phase!=='playing'&&!online)return;if(mode==='play'&&game.dialogue&&!online)return;lastFocus=document.activeElement;panel=kind;resetInput();persist();$('#panel-overlay').hidden=false;if(online){$('#dialogue-overlay').hidden=true;$('#outcome-overlay').hidden=true;}$('#panel').classList.toggle('map-panel',kind==='map');$('#crosshair').hidden=true;
 setText('#panel-kicker',kind==='phone'?'LUCÍA’S PHONE':kind==='map'?'BAHÍA LUCERO':kind==='crew'?'YOUR CREW':kind==='multiplayer'?'SUNCOAST CO-OP':online?'THE CITY IS STILL MOVING':mode==='play'?'THE CITY CAN WAIT':'SUNCOAST');setText('#panel-title',({phone:'People. Places. Possibilities.',map:'Know your way around',pause:'Take a breath.',settings:'Make yourself at home',help:'Getting your bearings',new:'Start a new story?',multiplayer:'Bring your crew.',crew:'Same city. Your people.'})[kind]||'SUNCOAST');
 $('#panel-body').innerHTML=panelContent(kind);$('#close-panel').focus({preventScroll:true});if(kind==='map')requestAnimationFrame(drawFullMap);syncOverlayState();audio.silence();
}
function closePanel(){if(panel==='multiplayer'&&online&&!network.state){network.leave();online=false;crewStatus='idle';updateCrewStatus();}panel=null;$('#panel-overlay').hidden=true;syncOverlayState();resetInput();lastFrame=performance.now();accum=0;if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});if(mode==='play')observe(true);}
function refreshPanel(){if(panel){const at=$('#panel-body').scrollTop;$('#panel-body').innerHTML=panelContent(panel);$('#panel-body').scrollTop=at;if(panel==='map')requestAnimationFrame(drawFullMap);}}
function panelContent(kind){
 if(kind==='multiplayer')return lobbyContent({name:crewName,code:crewCode,hasCheckpoint:!!read(CREW_SAVE_KEY,null),session:readSession(),busy:online&&['connecting','reconnecting'].includes(crewStatus)&&!network.state,reason:crewReason});
 if(kind==='crew'||(kind==='pause'&&online))return network.room?crewContent({game,room:network.room,ping:network.ping,status:crewStatus,reason:crewReason,invite:crewInvite(),host:network.isHost,saveAt:crewSaveAt}):lobbyContent({name:crewName,code:crewCode,reason:crewReason});
 if(kind==='help')return helpContent();if(kind==='settings')return settingsContent();if(kind==='phone')return phoneContent();if(kind==='map')return mapContent();
 if(kind==='new')return `<p>Start again as Lucía returns to Bahía Lucero. This replaces the current story saved in this browser.</p><p>You can export your current save from Pause first.</p><div class="pause-actions"><button class="button primary" data-action="new-confirm">Start a new story</button><button class="button secondary" data-action="close">Keep my current story</button></div>`;
 const done=game.progress.completed.filter(id=>!MISSIONS.find(m=>m.id===id)?.optional).length;
 return `<p>${game.player.interior?esc((LOCATIONS[game.player.interior]||WORLD.buildings.find(b=>b.id===game.player.interior))?.name):esc(WORLD.islands[islandAt(game.player.x,game.player.y)]?.name||'On the bay')} · ${done} of ${MISSIONS.filter(m=>!m.optional).length} main jobs completed.</p>${saveFailed?'<div class="hint-box">Your browser could not save. Export a backup before closing.</div>':''}<div class="pause-actions"><button class="button primary" data-action="close">Back to the city</button><button class="button secondary" data-action="save">Save now</button></div>${game.wanted.stars?`<h3>A way out</h3><p>Surrender ends the pursuit. You pay a fine, lose your ammunition, and can recover your vehicle. Story decisions remain.</p><button class="button secondary" data-action="surrender">Surrender to police</button>`:''}<h3>Your game</h3><div class="pause-actions"><button class="button secondary" data-panel="settings">Options</button><button class="button secondary" data-panel="help">Controls & city rules</button><button class="button secondary" data-panel="phone">Stories & journal</button></div><h3>Your saved story</h3><p>This solo game stores progress on this device, in this browser. Backups let you move it elsewhere.</p><div class="pause-actions"><button class="button secondary" data-action="export">Export save</button><button class="button secondary" data-action="import">Import save</button></div><button class="quiet-button" data-action="title">Return to title screen</button><p class="fine-print">SUNCOAST ${esc(Sim.VERSION)} · Original Daily Flyer game. No account, chat, analytics, or cloud save. Hosting receives ordinary web requests.</p>`;
}
function settingsContent(){return `<label class="settings-row"><span>Guidance<small>Simple spells out the next action. Moderate shortens the hints. Expert keeps the objective.</small></span><select data-setting="guidance"><option value="simple" ${settings.guidance==='simple'?'selected':''}>Simple</option><option value="moderate" ${settings.guidance==='moderate'?'selected':''}>Moderate</option><option value="expert" ${settings.guidance==='expert'?'selected':''}>Expert</option></select></label><label class="settings-row"><span>Sound effects<small>Engines, nearby sirens, and action sounds.</small></span><input type="checkbox" data-setting="sound" ${settings.sound?'checked':''}></label><label class="settings-row"><span>Lucero instrumental radio<small>A quiet original synth loop. Off by default.</small></span><input type="checkbox" data-setting="music" ${settings.music?'checked':''}></label><label class="settings-row"><span>Volume</span><input type="range" min="0" max="0.7" step="0.01" value="${settings.volume}" data-setting="volume"></label><label class="settings-row"><span>Camera zoom<small>Zoom out to see more intersections.</small></span><input type="range" min="0.65" max="1.35" step="0.05" value="${settings.zoom}" data-setting="zoom"></label><label class="settings-row"><span>Touch controls<small>Left thumb steers. Hold Brake / Reverse to back up. Use changes with what is nearby.</small></span><input type="checkbox" data-setting="touch" ${settings.touch?'checked':''}></label><label class="settings-row"><span>Reduce interface motion</span><input type="checkbox" data-setting="reducedMotion" ${settings.reducedMotion?'checked':''}></label><div class="hint-box">Portrait and landscape both work. Landscape gives the city more room on a phone.</div>${mode==='title'?'<button class="quiet-button" data-action="import">Import a saved story</button>':''}`;}
function helpContent(){return `<div class="hint-box"><strong>You are Lucía Reyes.</strong> A Cuban mechanic and recovery driver, 32. Follow the gold marker for your opening job. You can make an honest living, help Nadia expose the deal, or work with Voss.</div><table class="help-table"><tbody><tr><td>Walk / swim</td><td>WASD or arrow keys. On touch, use the left stick.</td></tr><tr><td>Drive</td><td>W / S accelerate and reverse. A / D steer. Space brakes. On touch, point the stick where you want to go. Hold Brake / Reverse to stop and back up.</td></tr><tr><td>Use / enter / get out</td><td>E. On touch, the gold Use button. Stop a vehicle before getting out.</td></tr><tr><td>Run</td><td>Hold Shift. On touch, hold Run.</td></tr><tr><td>Aim and attack</td><td>Mouse to aim; hold left click or F to attack. On touch, hold Fire for assisted aim. Q or Draw / Holster switches weapons.</td></tr><tr><td>Phone / map / pause</td><td>Tab / M / Escape. The labeled buttons work on every device.</td></tr></tbody></table>${HELP.map(h=>`<h3>${esc(h.title)}</h3><p>${esc(h.text)}</p>`).join('')}<h3>The six-star scale</h3><table class="help-table"><tbody><tr><td>1–2 · Local pursuit</td><td>Patrols try to catch and arrest you. Surrender is available from Pause.</td></tr><tr><td>3 · Armed response</td><td>Police use firearms. Breaking sight is usually safer than fighting.</td></tr><tr><td>4 · Tactical units</td><td>Tactical units and roadblocks make main avenues riskier.</td></tr><tr><td>5 · Air support</td><td>A helicopter makes open ground riskier.</td></tr><tr><td>6 · Full cordon</td><td>Maximum response. Restricted islands keep this level active until you leave.</td></tr></tbody></table><h3>Your money matters</h3><p>Vehicles need repairs. Treatment and arrests have costs. Taxi, courier, and harbor jobs offer legal income. Broke players can still receive care and recover a car.</p><h3>When you step away</h3><p>Menus, conversations, and backgrounding the game pause solo play. Story progress saves automatically. Export a backup from Pause to keep a separate copy.</p>`;}
function phoneContent(){const tabs=['stories','work','people','journal'];let body=`<div class="panel-tabs">${tabs.map(t=>`<button data-phone="${t}" class="${phoneTab===t?'active':''}">${({stories:'Stories',work:'Paid work',people:'People',journal:'Your story'})[t]}</button>`).join('')}</div>`;
 if(phoneTab==='stories'){
  const available=new Set(Sim.getAvailableMissions(game).map(m=>m.id));if(game.mission){const m=MISSIONS.find(m=>m.id===game.mission.id),o=Sim.getObjective(game);body+=`<div class="hint-box"><strong>ACTIVE · ${esc(m?.title)}</strong><p>${esc(o.text)}</p><button class="quiet-button" data-action="close">Follow this job</button></div>`;}
  const list=MISSIONS.filter(m=>!game.progress.completed.includes(m.id));body+=list.map(m=>{const availableForCrew=available.has(m.id),open=availableForCrew&&(!online||network.isHost);return `<article class="mission-row ${availableForCrew?'':'locked'}"><div><small>${esc(CONTACTS[m.contact]?.name||'Lucía')} · ${m.optional?'SIDE STORY':'CHAPTER '+m.arc}</small><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><div class="mission-meta"><span>$${m.reward} + choices</span><span>${availableForCrew?(open?'Available':'Host chooses this job'):`After ${esc(MISSIONS.find(q=>q.id===m.requires?.find(r=>!game.progress.completed.includes(r)))?.title||'the next chapter')}`}</span></div></div>${open&&m.id!==game.mission?.id?`<button class="button secondary" data-mission="${m.id}" ${game.mission?'disabled':''}>Take job</button>`:''}</article>`}).join('');if(!list.length)body+='<p>Every authored story is complete. The city is still yours to explore.</p>';return body;
 }
 if(phoneTab==='work'){
  body+='<p>Visit the marked business, go inside, and ask for work. Finish your active story job before accepting a paid side job.</p>';
  const work=[{id:'taxi',title:'Taxi fares',location:'cafe',detail:'Pick up a fare in any road vehicle. Arrive without police heat.',reward:100},{id:'courier',title:'Neighborhood courier',location:'market',detail:'A legal delivery between people who need something moved.',reward:120},{id:'boat',title:'Harbor runs',location:'docks',detail:'Use a runabout to carry a delivery to the offshore buoy.',reward:160},{id:'race',title:'Santa Elena circuit',location:'garage',detail:'Three checkpoints, 110 seconds. Brake before the corners and keep your vehicle moving.',reward:220},{id:'rescue',title:'Medical transport',location:'clinic',detail:'Collect a patient and bring them to the clinic. Stop carefully for pickup and dropoff.',reward:140}];
  body+=work.map(j=>`<article class="mission-row"><div><small>${esc(LOCATIONS[j.location].name)}</small><h3>${j.title}</h3><p>${j.detail}</p><span class="mission-meta">From $${j.reward} per job</span></div><button class="button secondary" data-waypoint="${j.location}">Mark on map</button></article>`).join('');
  body+=`<h3>Keep yourself moving</h3>${[{id:'garage',label:'Repairs, resprays & vehicle recovery'},{id:'clinic',label:'Treatment & recovery'},{id:'market',label:'Ammunition & protective vest'},{id:'home',label:'A place to rest'}].map(j=>`<article class="mission-row"><div><h3>${j.label}</h3><p>${esc(LOCATIONS[j.id].name)}</p></div><button class="button secondary" data-waypoint="${j.id}">Mark</button></article>`).join('')}`;return body;
 }
 if(phoneTab==='people'){body+=`<p>${esc(PROTAGONIST.background)}</p>`;body+=Object.entries(CONTACTS).filter(([k])=>k!=='lucia').map(([id,c])=>`<article class="contact-row"><div class="contact-badge" style="color:${c.color}">${esc(c.name.split(' ').map(w=>w[0]).slice(0,2).join(''))}</div><div><h3>${esc(c.name)}</h3><p>${esc(c.role)}</p><small>${esc(contactState(id))}</small></div></article>`).join('');return body;}
 const rep=game.progress.rep;const ending=Object.entries(ENDINGS).find(([flag])=>game.progress.flags[flag])?.[1];
 body+=`<div class="stat-grid"><div><strong>${rep.community}</strong><span>Community</span></div><div><strong>${rep.underworld}</strong><span>Underworld</span></div><div><strong>${rep.truth}</strong><span>Truth</span></div></div><p>Community support earns better garage prices. Underworld contacts improve paid-job rewards. Truth builds your case and reduces arrest fines once your reputation reaches 4.</p>${ending?`<div class="hint-box"><strong>${esc(ending.title)}</strong><p>${esc(ending.text)}</p></div>`:''}<h3>Your decisions</h3>`;
 const choices=Object.entries(game.progress.choices);body+=choices.length?choices.map(([key,val])=>{const [id,idx]=key.split(':'),m=MISSIONS.find(m=>m.id===id),c=m?.steps[Number(idx)]?.choices?.find(c=>c.id===val);return c?`<div class="choice-log"><strong>${esc(m.title)}</strong><p>${esc(c.label)}</p><small>${esc(c.result)}</small></div>`:'';}).join(''):'<p>The first choice is still ahead of you.</p>';
 body+=`<h3>Life in the city</h3><p>${game.progress.completed.length} completed jobs · ${game.stats.jobs} paid side jobs · ${game.progress.deaths} hospital visits · ${game.progress.arrests} arrests</p><h3>Completed stories</h3>${game.progress.completed.map(id=>`<p>✓ ${esc(MISSIONS.find(m=>m.id===id)?.title||id)}</p>`).join('')}`;return body;
}
function contactState(id){const r=game.progress.rep;if(id==='ines')return game.progress.flags.ending_takeover?'She still leaves the café light on. She has questions.':game.progress.deaths?'She knows you survived. Visit the café.':r.community>=3?'Your help has made its way around the neighborhood.':'There is always a place for you at the café.';if(id==='tomi')return r.community>=3?'Friends’ prices: garage repairs and resprays cost less.':'A practical friend, and your way back to a working vehicle.';if(id==='nadia')return r.truth>=4?'Your documented record earns a reduction on arrest fines.':'She needs proof, and someone who can get around the city.';if(id==='voss')return r.underworld>=3?'His contacts bring a bonus on paid side jobs.':'His favors come with useful money and unfinished obligations.';return game.progress.unlocked>=2?'You have reached the people who profit from the closures.':'Her company’s name is on more of the city every day.';}
function mapContent(){return `${online?'<p class="crew-map-hint">Crew colors show your friends. Tap a destination, then share the pin to arrange a meetup.</p>':''}<canvas id="city-map" aria-label="City map. Tap a location to set a waypoint."></canvas><div class="map-key"><span><b>◆</b> Your destination</span><span>▲ ${online?'You · crew in their own colors':'Lucía'}</span><span>× Restricted crossing</span><span>Colored dots: enterable businesses</span></div><div class="map-tools"><p id="map-note">Tap the map to set a personal waypoint.</p><button class="quiet-button" data-action="clear-waypoint">Clear pin</button>${online?'<button class="button secondary" data-action="crew-share-pin">Share pin with crew</button>':''}</div><div class="island-status">${WORLD.islands.map((i,n)=>`<div class="${n>game.progress.unlocked?'locked':''}"><strong>${esc(i.name)}</strong><small>${n<=game.progress.unlocked?'OPEN':n===1?'Opens after Open Water':'Opens after Customs and Favors'}</small></div>`).join('')}</div><p>Restricted islands are physically reachable. Stepping onto one early triggers six stars. Bridges open one at a time through the story.</p><div class="pause-actions"><button class="button secondary" data-waypoint="home">Home</button><button class="button secondary" data-waypoint="garage">Garage</button><button class="button secondary" data-waypoint="clinic">Clinic</button><button class="button secondary" data-action="close">Back to the city</button></div>`;}
function drawFullMap(){const c=$('#city-map');if(!c)return;fullTransform=renderer.drawMap(c,game,{full:true,waypoint,objective:mapObjective(Sim.getObjective(game))});}
function placeWaypoint(id){const l=LOCATIONS[id];if(!l)return;waypoint={x:l.door.x,y:l.door.y,label:l.name};notify(`Map pin: ${l.name}.`);if(panel==='map'){drawFullMap();setText('#map-note',`Pinned ${l.name}.`);}else closePanel();}
function makeInput(){let mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),my=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const touch=stick.id!==null;if(touch){mx=stick.x;my=stick.y;}const mag=Math.hypot(mx,my);if(mag>1){mx/=mag;my/=mag;}const input={mx,my,steer:mx,throttle:-my,touch,sprint:held.sprint||keys.has('ShiftLeft')||keys.has('ShiftRight'),brake:keys.has('Space'),reverse:!!Sim.getVehicle(game)&&held.sprint,fire:pointer.fire||held.fire||keys.has('KeyF')};if(pointer.active&&!settings.touch){const aim=renderer.screenToWorld(pointer.x,pointer.y);input.aimX=aim.x;input.aimY=aim.y;}return input;}
function frame(now){
 const elapsed=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
 const active=mode==='play'&&!panel&&!game.dialogue&&game.phase==='playing'&&!document.hidden&&(!online||network.connected);
 try{
  if(online&&mode==='play'){
   const next=network.advance(active?makeInput():{brake:true},elapsed);if(next)game=next;accum=0;
  }else if(active){
   accum+=elapsed;let ticks=0;while(accum>=1/60&&ticks<6){Sim.step(game,makeInput(),1/60);accum-=1/60;ticks++;if(game.dialogue||game.phase!=='playing')break;}observe();
  }else accum=0;
  const objective=mode==='play'?Sim.getObjective(game):null;renderer.render(game,{objective,waypoint:game.player.interior?null:waypoint,menu:mode==='title',zoom:settings.zoom});audio.update(game,!active);
  if(mode==='play'&&now-hudAt>120){updateHud();if(panel==='map')drawFullMap();hudAt=now;}
  if(mode==='play'&&now-saveAt>10000){persist();saveAt=now;}
  if(now>toastUntil)$('#notification').hidden=true;
  if(waypoint&&!game.player.interior&&Math.hypot(game.player.x-waypoint.x,game.player.y-waypoint.y)<65){waypoint=null;notify('You reached your map pin.');}
  if(mode==='play'&&pointer.active&&!settings.touch&&!panel&&!game.dialogue){$('#crosshair').hidden=false;$('#crosshair').style.left=`${pointer.x}px`;$('#crosshair').style.top=`${pointer.y}px`;}else $('#crosshair').hidden=true;
 }catch(e){console.error(e);audio.silence();if(mode==='play'){resetInput();openPanel(online?'crew':'pause');notify(online?'The view stopped after an error. Reconnect from the Crew menu.':'The game paused after an error. Your last saved story is preserved.',12000);}else setText('#menu-status','The city could not start. Refresh to try again.');}
 requestAnimationFrame(frame);
}
// UI actions use the same simulation entry points as the keyboard.
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;audio.unlock();if(b.dataset.crewFollow){findCrewMember(b.dataset.crewFollow);return;}if(b.id==='objective-toggle'){setObjectiveHelp(b.getAttribute('aria-expanded')!=='true');return;}if(b.dataset.panel){openPanel(b.dataset.panel);return;}if(b.dataset.choice!==undefined){takeChoice(Number(b.dataset.choice));return;}if(b.dataset.phone){phoneTab=b.dataset.phone;refreshPanel();return;}if(b.dataset.mission){if(online){network.action({type:'startMission',missionId:b.dataset.mission});closePanel();return;}const ok=Sim.startMission(game,b.dataset.mission);if(ok){closePanel();observe(true);persist();}else{observe();refreshPanel();}return;}if(b.dataset.waypoint){placeWaypoint(b.dataset.waypoint);return;}const action=b.dataset.action;if(!action)return;if(action.startsWith('crew-')){handleCrewAction(action);return;}if(action==='close')closePanel();else if(action==='title')showTitle();else if(action==='save')persist(true);else if(action==='clear-waypoint'){waypoint=null;drawFullMap();setText('#map-note','Personal waypoint cleared. Gold still marks your story objective.');}else if(action==='new-confirm')enter();else if(action==='surrender'){closePanel();if(online)network.action({type:'surrender'});else{Sim.surrender(game);observe(true);}}else if(action==='export'&&!online){const blob=new Blob([JSON.stringify(Sim.serializeGame(game),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Suncoast-Saved-Story.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}else if(action==='import'&&!online)$('#import-save').click();});
document.addEventListener('change',e=>{const el=e.target,key=el.dataset.setting;if(!key)return;settings[key]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;audio.unlock();syncSettings();if(mode==='play')updateHud();});
$('#start').addEventListener('click',()=>read(SAVE,null)?openPanel('new'):enter());$('#continue').addEventListener('click',()=>enter(read(SAVE,null)));$('#mini-wrap').addEventListener('click',()=>openPanel('map'));$('#close-panel').addEventListener('click',closePanel);$('#panel-overlay').addEventListener('click',e=>{if(e.target.id==='panel-overlay')closePanel();});
$('#recover').addEventListener('click',()=>{if(online){network.action({type:'recover',choice:'continue'});return;}Sim.recover(game,'continue');observe(true);persist();renderer.initial=true;});$('#retry').addEventListener('click',()=>{if(online)return;Sim.recover(game,'retry');observe(true);persist();renderer.initial=true;});
$('#panel-body').addEventListener('pointerdown',e=>{if(e.target.id!=='city-map'||!fullTransform)return;const r=e.target.getBoundingClientRect(),x=(e.clientX-r.left-fullTransform.ox)/fullTransform.scale,y=(e.clientY-r.top-fullTransform.oy)/fullTransform.scale;if(x<0||x>WORLD.width||y<0||y>WORLD.height)return;let label='Personal waypoint';const nearest=Object.values(LOCATIONS).sort((a,b)=>Math.hypot(a.door.x-x,a.door.y-y)-Math.hypot(b.door.x-x,b.door.y-y))[0];if(nearest&&Math.hypot(nearest.door.x-x,nearest.door.y-y)<180){waypoint={...nearest.door,label:nearest.name};label=nearest.name;}else waypoint={x,y,label};const isle=islandAt(x,y);setText('#map-note',`Pinned ${label}${isle>game.progress.unlocked?' · restricted island, six-star response':''}.`);drawFullMap();});
$('#import-save').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>2000000)throw Error('This file is too large to be a SUNCOAST save.');const data=JSON.parse(await f.text()),validated=Sim.restoreGame(data);if(mode==='play')persist();enter(validated);notify('Saved story imported. Welcome back.');}catch(err){if(mode==='title')setText('#menu-status',err.message);else notify(`Could not import: ${err.message}`,9000);}e.target.value='';});
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Tab'&&mode==='play'&&!panel&&!game.dialogue){e.preventDefault();openPanel('phone');return;}if(e.code==='Escape'){e.preventDefault();if(panel)closePanel();else if(mode==='play'&&!game.dialogue)openPanel('pause');return;}if(panel){if(e.code==='Tab'){const focusable=[...$('#panel').querySelectorAll('button:not([disabled]),select,input')],first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}return;}if(game.dialogue){if(e.code==='Enter'&&game.dialogue.choices.length===1){e.preventDefault();takeChoice(0);}return;}if(mode!=='play')return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyM','KeyE','KeyQ'].includes(e.code))e.preventDefault();if(!e.repeat){if(e.code==='KeyM'){openPanel('map');return;}if(e.code==='KeyE'){interact();return;}if(e.code==='KeyQ'){toggleWeapon();return;}if(e.code==='KeyG'&&online){pingCrew();return;}}keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));
$('#world').addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;});$('#world').addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||mode!=='play'||panel||game.dialogue)return;e.preventDefault();pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;if(e.button===1&&online){pingCrew(renderer.screenToWorld(e.clientX,e.clientY));return;}if(e.button===0)pointer.fire=true;audio.unlock();});window.addEventListener('pointerup',()=>pointer.fire=false);$('#world').addEventListener('contextmenu',e=>e.preventDefault());$('#world').addEventListener('pointerleave',()=>{pointer.fire=false;pointer.active=false;});
function stickMove(e){
 if(stick.id!==e.pointerId)return;
 const rect=$('#stick').getBoundingClientRect(),r=rect.width/2;
 if(!r)return;
 const dx=e.clientX-rect.left-r,dy=e.clientY-rect.top-r,len=Math.hypot(dx,dy),range=r*.68;
 const visualScale=len>range?range/len:1,deadzone=range*.12;
 const magnitude=clamp((len-deadzone)/(range-deadzone),0,1);
 stick.x=len?dx/len*magnitude:0;stick.y=len?dy/len*magnitude:0;
 $('#stick-thumb').style.transform=`translate(${dx*visualScale}px,${dy*visualScale}px)`;
}
$('#stick').addEventListener('pointerdown',e=>{if(mode!=='play'||panel||game.dialogue||game.phase!=='playing'||stick.id!==null)return;e.preventDefault();audio.unlock();stick.id=e.pointerId;$('#stick').setPointerCapture(e.pointerId);stickMove(e);});$('#stick').addEventListener('pointermove',stickMove);for(const kind of ['pointerup','pointercancel','lostpointercapture'])$('#stick').addEventListener(kind,e=>{if(stick.id!==e.pointerId)return;stick={id:null,x:0,y:0};$('#stick-thumb').style.transform='';});
for(const [id,key] of [['touch-fire','fire'],['touch-sprint','sprint']]){const b=$('#'+id);b.addEventListener('pointerdown',e=>{if(mode!=='play'||panel||game.dialogue||game.phase!=='playing')return;e.preventDefault();audio.unlock();held[key]=true;b.classList.add('held');b.setPointerCapture(e.pointerId);});for(const kind of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(kind,()=>{held[key]=false;b.classList.remove('held');});}
$('#touch-interact').addEventListener('click',interact);$('#touch-weapon').addEventListener('click',toggleWeapon);
window.addEventListener('blur',()=>{resetInput();persist();audio.silence();if(mode==='play'&&!panel&&!game.dialogue&&game.phase==='playing')openPanel('pause');});document.addEventListener('visibilitychange',()=>{resetInput();if(document.hidden){persist();audio.silence();}else{lastFrame=performance.now();accum=0;}});window.addEventListener('pagehide',()=>{resetInput();persist();});window.addEventListener('resize',queueViewportResize);
window.visualViewport?.addEventListener('resize',queueViewportResize);
const canvasObserver=new ResizeObserver(queueViewportResize);canvasObserver.observe($('#world'));


function crewInvite(){const url=new URL(location.pathname,location.origin);url.searchParams.set('crew',network.room?.code||crewCode);return url.href;}
function updateCrewStatus(){
 document.body.classList.toggle('online',online&&mode==='play');
 const count=network.room?.players?.filter(p=>p.connected).length||0;
 $('#crew-menu').hidden=!online||mode!=='play';setText('#crew-count',`${count}/4`);
 setText('#session-menu-label',online?'Menu':'Pause');$('#session-menu').setAttribute('aria-label',online?'Open game menu; the city keeps running':'Pause game');
 const problem=online&&mode==='play'&&crewStatus!=='connected';$('#network-banner').hidden=!problem;
 setText('#network-banner-text',crewReason||'Reconnecting to your crew…');
 setText('#crew-feedback',crewReason);
 if($('#crew-save-status'))setText('#crew-save-status',crewSaveAt?'Saved at '+new Date(crewSaveAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Waiting for first checkpoint');
 if(panel==='multiplayer')$$('#panel-body button[data-action^="crew-"]').forEach(b=>b.disabled=online&&['connecting','reconnecting'].includes(crewStatus)&&!network.state);
 if(panel==='crew'||(panel==='pause'&&online)){
  const signature=JSON.stringify((game.crew||[]).map(p=>[p.id,p.name,p.connected,p.interior,p.vehicleId,p.seat,p.phase]))+'|'+network.room?.hostId+'|'+crewStatus;
  if(signature!==lastRosterSignature){lastRosterSignature=signature;refreshPanel();}
 }
}
function beginCrew(type){
 crewName=($('#crew-name')?.value||crewName||'Lucía').trim().slice(0,20)||'Lucía';
 crewCode=normalizeRoomCode($('#crew-code')?.value||crewCode||'');write('dfe.suncoast.crew.name.v1',crewName);
 const checkpoint=read(CREW_SAVE_KEY,null),session=readSession();
 if(type==='join'&&crewCode.length!==6){crewReason='Enter the six-character code from your friend.';updateCrewStatus();return;}
 if(type==='resume'&&!session){crewReason='No reconnect session remains. Join with the room code instead.';updateCrewStatus();return;}
 if(type==='checkpoint'&&!checkpoint?.save){crewReason='There is no saved crew checkpoint on this device yet.';updateCrewStatus();return;}
 if(mode==='play'&&!online)persist();online=true;crewReason='';crewRequestType=type;crewSaveRequestedAt=-Infinity;saveFailed=false;
 const request=type==='resume'?{type:'resume',...session}:type==='join'?{type:'join',code:crewCode,name:crewName}:{type:'create',name:crewName,...(type==='checkpoint'?{save:checkpoint.save}:{})};
 network.connect(request);updateCrewStatus();
}
function enterCrew(state){
 game=state;mode='play';panel=null;waypoint=null;lastNotification='';dialogueSignature='';outcomeSignature='';latestProgress='';latestObjective='';lastRosterSignature='';
 renderer.initial=true;$('#title-screen').hidden=true;$('#hud').hidden=false;$('#panel-overlay').hidden=true;document.body.classList.add('playing');resetInput();audio.unlock();lastFrame=performance.now();accum=0;
 observe(true);updateHud();crewSaveRequestedAt=-Infinity;persist();
 notify(`Crew ${network.room.code}. The city is live. Open Crew to invite friends.`,7000);
 if(['create','checkpoint'].includes(crewRequestType))openPanel('crew');
 crewRequestType='';
}
function pingCrew(point=null,city=false){
 if(!online)return;
 const p=point||game.player;network.action({type:'ping',x:p.x,y:p.y,interior:city?null:game.player.interior});
}
function findCrewMember(id){
 const member=game.crew?.find(p=>p.id===id);if(!member)return;
 const building=member.interior&&(LOCATIONS[member.interior]||WORLD.buildings.find(b=>b.id===member.interior));
 waypoint={x:building?.door.x??member.x,y:building?.door.y??member.y,label:member.name};openPanel('map');
}
async function handleCrewAction(action){
 if(action==='crew-host')beginCrew('create');
 else if(action==='crew-join')beginCrew('join');
 else if(action==='crew-resume-checkpoint')beginCrew('checkpoint');
 else if(action==='crew-reconnect')beginCrew('resume');
 else if(action==='crew-leave'){showTitle();}
 else if(action==='crew-save'){persist(true);}
 else if(action==='crew-ping'){pingCrew();closePanel();}
 else if(action==='crew-share-pin'){if(!waypoint){setText('#map-note','Tap a place on the map first, then share the pin.');return;}pingCrew(waypoint,true);setText('#map-note','Location shared with your crew.');}
 else if(action==='crew-copy'){
  try{await navigator.clipboard.writeText(crewInvite());crewReason='Invite copied. Send it to your friends.';}
  catch{const input=$('#crew-invite');input?.focus();input?.select();crewReason='Select and copy the invitation link above.';}
  updateCrewStatus();
 }
}

syncSettings();refreshContinue();$('#loading').hidden=true;$('#title-screen').hidden=false;setText('#version',`SOLO + CO-OP · ${Sim.VERSION}`);requestAnimationFrame(frame);if(crewCode)openPanel('multiplayer');
// Read-only diagnostics for local QA. No debug mutation or unlock endpoint ships.
Object.defineProperty(globalThis,'suncoast',{value:{get state(){return Sim.serializeGame(game);},get network(){return online?network.diagnostics:null;},get crew(){return online?{code:network.room?.code,playerId:game.coop?.playerId,hostId:network.room?.hostId,players:game.crew}:null;},get renderInfo(){return{backend:'Canvas 2D',buffer:[renderer.canvas.width,renderer.canvas.height],viewport:[innerWidth,innerHeight],mode,panel};}},writable:false});
