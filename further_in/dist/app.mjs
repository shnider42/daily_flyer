import {createGame,update,interact,target,pulse,developerAction,TITLES,VERSION,clamp,distance} from './core.mjs';
import {Renderer} from './renderer.mjs';
import {SoftwareRenderer} from './software.mjs';
import {Sound} from './audio.mjs';
const $=id=>document.getElementById(id);
const detectedTouch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
let touch=detectedTouch;
const defaults={sensitivity:1,brightness:1.1,volume:.65,controlSize:1,fov:73,quality:'medium',touchControls:'auto',lamp:true,bob:!matchMedia('(prefers-reduced-motion:reduce)').matches,captions:true};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
const settings={...defaults,...read('further-in-settings',{})};
for(const [name,min,max] of [['sensitivity',.3,2.5],['brightness',.7,2],['volume',0,1],['controlSize',.7,1.5],['fov',60,95]]) settings[name]=Number.isFinite(Number(settings[name]))?clamp(Number(settings[name]),min,max):defaults[name];
if(!['low','medium','high'].includes(settings.quality))settings.quality='medium';
if(!['auto','on','off'].includes(settings.touchControls))settings.touchControls='auto';
for(const name of ['bob','captions','lamp'])if(typeof settings[name]!=='boolean')settings[name]=defaults[name];
const requestedLevel=Number(new URLSearchParams(location.search).get('level'));
let launchLevel=[1,2,3].includes(requestedLevel)?requestedLevel:null;
let state=createGame(1,104),mode='menu',last=performance.now(),renderer,audio=new Sound(),keys=new Set(),pointerLook=null,movePointer=null,stick={forward:0,side:0,run:false},moveOrigin=null,runLatch=false,noteReturn='playing',captionTimer=0,chapterTimer=0,ended=false,fromMenu=false,frame=0,rollingFrame=16.7,storage=read('further-in-progress',{});
let metrics={frames:0,errors:0};
let chapterLoad=0;
function fail(message){resetInput();audio.setPaused(true);$('error-text').textContent=message;$('error').hidden=false;mode='error';metrics.errors++;}
window.addEventListener('error',e=>fail(e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason?.message||'The game could not continue. Reload to try again.'));
try{renderer=new Renderer($('world'));renderer.quality(settings.quality);}catch(e){try{const oldCanvas=$('world'),freshCanvas=oldCanvas.cloneNode(false);oldCanvas.replaceWith(freshCanvas);renderer=new SoftwareRenderer(freshCanvas);renderer.quality(settings.quality);}catch(fallbackError){fail('This browser could not start either graphics renderer. '+fallbackError.message);}}
function resetInput(){keys.clear();for(const id of [pointerLook?.id,movePointer]){try{if(id!=null&&$('world').hasPointerCapture?.(id))$('world').releasePointerCapture(id);}catch{}}pointerLook=null;movePointer=null;moveOrigin=null;stick={forward:0,side:0,run:false};runLatch=false;$('joystick').firstElementChild.style.transform='';$('run').classList.remove('active');}
function screens(name){for(const id of['menu','pause-screen','note-screen','end-screen'])$(id).hidden=id!==name;$('hud').hidden=name==='menu'||name==='end-screen';}
function caption(text,seconds=4){$('caption').textContent=text;captionTimer=seconds;$('caption').style.opacity=1;}
function checkpoint(){storage.floor=state.level;storage.tool=!!state.tool;save('further-in-progress',storage);}
function updateMenu(){
 const floor=launchLevel||([1,2,3].includes(storage.floor)?storage.floor:null);
 $('continue').hidden=!floor;
 if(floor)$('continue').textContent=launchLevel?`Enter floor ${floor} →`:`Continue from floor ${floor} →`;
 $('medal-home').textContent=storage.medal?'✶ BAD IDEA. GOOD FORM.':'';
}
function start(level,keepTool=false){
 if(![1,2,3].includes(level)||!renderer)return;
 chapterLoad++;
 resetInput();
 state=createGame(level,(Date.now()^Math.floor(Math.random()*1e8))>>>0);
 state.tool=!!keepTool;
 audio.reset?.(state);
 audio.unlock().catch(()=>{});
 ended=false;mode='playing';launchLevel=null;last=performance.now();
 screens('none');$('hud').hidden=false;$('blackout').style.opacity=0;
 $('pause-title').textContent='Still here.';$('pause-eyebrow').textContent='TAKE A BREATH';
 audio.setPaused(false);audio.setVolume(settings.volume);checkpoint();updateMenu();
 $('floor-label').textContent=['','01 / SERVICE ACCESS','02 / THE YELLOW ROOMS','03 / THE OTHER SIDE'][level];
 $('chapter').textContent=TITLES[level];chapterTimer=5;captionTimer=0;$('caption').textContent='';
 $('controls-tip').textContent=touch?'LEFT TO MOVE · RIGHT TO LOOK · USE NEAR OBJECTS':'WASD move · mouse / drag look · E interact · Shift run';
 if(level===1)caption('There was a door here.',4);
 if(level===2)caption('The lights are still on.',4);
 $('world').focus({preventScroll:true});
 if(!touch)lockMouse();
}
function lockMouse(){if(mode==='playing'&&document.pointerLockElement!==$('world')){try{const p=$('world').requestPointerLock?.();p?.catch?.(()=>{});}catch{}}}
function pause(isMenu=false){if(!['playing','menu'].includes(mode))return;fromMenu=isMenu;resetInput();mode='paused';audio.setPaused(true);document.exitPointerLock?.();screens('pause-screen');$('resume').textContent=isMenu?'Back':'Return ↗';$('restart').hidden=isMenu;updateTest();}
function resume(){resetInput();if(fromMenu){home();return;}mode='playing';screens('none');audio.unlock().catch(()=>{});audio.setPaused(false);if(!touch)lockMouse();last=performance.now();}
function home(){resetInput();mode='menu';screens('menu');audio.reset?.();audio.setPaused(true);document.exitPointerLock?.();state=createGame(1,104);$('blackout').style.opacity=0;updateMenu();}
function note(text){noteReturn=mode;mode='note';resetInput();audio.setPaused(true);document.exitPointerLock?.();$('note-text').textContent=text;screens('note-screen');}
function closeNote(){mode='playing';screens('none');resetInput();audio.unlock().catch(()=>{});audio.setPaused(false);if(!touch)lockMouse();}
function use(){if(mode!=='playing')return;interact(state);}
function tool(){if(mode==='playing')pulse(state);}
function turn(){if(mode==='playing'){state.player.yaw+=Math.PI;resetInput();}}
function end(){if(ended)return;ended=true;mode='end';resetInput();document.exitPointerLock?.();screens('end-screen');audio.setPaused(true);$('blackout').style.opacity=0;const win=state.status==='won';$('end-kicker').textContent=win?'END OF DESCENT / FOR NOW':state.medal?'A SMALL CONSOLATION':'FLOOR '+state.level+' / AGAIN';$('end-title').textContent=win?'You stayed.':state.medal?'Brave. Not helpful.':'Still inside.';$('end-copy').textContent=win?'It stopped when you did. A door opens somewhere behind you. You no longer feel the need to run.':state.medal?'You ran toward it. The building seems impressed. It is letting you try again.':state.level===3?'The hallway was never going to end. There is another way to face this.':'You hear the lights before you open your eyes.';$('medal').hidden=!state.medal;$('retry').hidden=win;if(state.medal){storage.medal=true;save('further-in-progress',storage);}if(win){storage.completed=true;storage.floor=1;save('further-in-progress',storage);}updateMenu();}
$('begin').onclick=()=>start(1);$('continue').onclick=()=>start(launchLevel||storage.floor||1,!launchLevel&&!!storage.tool);document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>start(Number(b.dataset.level)));$('pause').onclick=()=>pause();$('menu-settings').onclick=()=>pause(true);$('resume').onclick=resume;$('restart').onclick=()=>start(state.level);$('home').onclick=home;$('end-home').onclick=()=>{home();$('choose').open=true;};$('retry').onclick=()=>start(state.level);$('close-note').onclick=closeNote;$('use').onclick=use;$('tool').onclick=tool;$('turn-back').onclick=turn;$('run').onclick=()=>{runLatch=!runLatch;$('run').classList.toggle('active',runLatch);};document.querySelector('.brand').onclick=e=>{e.preventDefault();home();};
$('sound-toggle').onclick=()=>{audio.unlock().catch(()=>{});settings.volume=settings.volume?0:.65;audio.setVolume(settings.volume);syncSettings();save('further-in-settings',settings);};
function syncSettings(){touch=settings.touchControls==='on'||(settings.touchControls==='auto'&&detectedTouch);document.body.classList.toggle('touch',touch);for(const name of Object.keys(defaults)){const el=$(name);if(typeof settings[name]==='boolean')el.checked=settings[name];else el.value=settings[name];const out=$(name+'-value');if(out)out.textContent=name==='volume'||name==='controlSize'?Math.round(settings[name]*100)+'%':name==='fov'?settings[name]+'°':Number(settings[name]).toFixed(1);}document.documentElement.style.setProperty('--scale',settings.controlSize);$('controls-tip').textContent=touch?'LEFT TO MOVE · RIGHT TO LOOK · USE NEAR OBJECTS':'WASD move · mouse / drag look · E interact · Shift run';$('sound-toggle').textContent=settings.volume?'SOUND ON':'SOUND OFF';audio.setVolume(settings.volume);}
for(const name of Object.keys(defaults))$(name).addEventListener('input',()=>{settings[name]=$(name).type==='checkbox'?$(name).checked:$(name).type==='range'?Number($(name).value):$(name).value;syncSettings();if(name==='quality')renderer?.quality(settings.quality);save('further-in-settings',settings);});syncSettings();
function updateTest(){$('test-description').textContent=state.level===1?'Pattern: one knock, two, three, one. Wrong choices return to the room.':state.level===2?'The resonator is beside the starting room. Repeated pulses stun for less time and make the pursuer faster. Drop through the floor to continue.':'After 7–9 doors: stop moving and face the ghost for 4.5 seconds. Running at it earns the medal but ends the attempt.';document.querySelectorAll('[data-test]').forEach(b=>b.hidden=({pattern:1,chase:2,hole:2,ghost:3})[b.dataset.test]!==state.level);}
document.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>{developerAction(state,b.dataset.test);fromMenu=false;resume();});
window.addEventListener('keydown',e=>{
 if(e.code==='Escape'){
  if(mode==='playing')pause();else if(mode==='paused')resume();else if(mode==='note')closeNote();
  return;
 }
 if(['INPUT','SELECT','TEXTAREA','BUTTON','SUMMARY'].includes(document.activeElement?.tagName)&&mode!=='playing')return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(mode!=='playing')return;
 keys.add(e.code);if(e.repeat)return;
 if(e.code==='KeyE')use();if(e.code==='Space')tool();if(e.code==='KeyX')turn();
 if(e.code==='KeyF'){settings.lamp=!settings.lamp;syncSettings();save('further-in-settings',settings);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',resetInput);
document.addEventListener('visibilitychange',()=>{resetInput();if(document.hidden&&mode==='playing')pause();});
// Pointer lock changes deliberately do not pause: Safari and overlays can release it.
window.addEventListener('mousemove',e=>{if(mode==='playing'&&document.pointerLockElement===$('world')){state.player.yaw+=e.movementX*.0023*settings.sensitivity;state.player.pitch=clamp(state.player.pitch-e.movementY*.002*settings.sensitivity,-.8,.8);}});
function ignorePointer(e){return !!e.target.closest('button,input,select,details,a,.screen');}
window.addEventListener('pointerdown',e=>{if(mode!=='playing'||ignorePointer(e))return;audio.unlock().catch(()=>{});if(e.pointerType==='mouse'){if(document.pointerLockElement!==$('world')){pointerLook={id:e.pointerId,x:e.clientX,y:e.clientY};lockMouse();}return;}e.preventDefault();try{$('world').setPointerCapture(e.pointerId);}catch{}if(e.clientX<innerWidth*.44&&movePointer===null){movePointer=e.pointerId;moveOrigin={x:e.clientX,y:e.clientY};}else if(!pointerLook)pointerLook={id:e.pointerId,x:e.clientX,y:e.clientY};},{passive:false});
window.addEventListener('pointermove',e=>{if(mode!=='playing')return;if(e.pointerId===movePointer){e.preventDefault();const radius=48*settings.controlSize;let x=(e.clientX-moveOrigin.x)/radius,y=(e.clientY-moveOrigin.y)/radius,len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}stick.side=Math.abs(x)<.08?0:x;stick.forward=Math.abs(y)<.08?0:-y;stick.run=len>.95;$('joystick').firstElementChild.style.transform=`translate(${x*28}px,${y*28}px)`;}else if(pointerLook?.id===e.pointerId&&document.pointerLockElement!==$('world')){e.preventDefault();const dx=e.clientX-pointerLook.x,dy=e.clientY-pointerLook.y;state.player.yaw+=dx*.004*settings.sensitivity;state.player.pitch=clamp(state.player.pitch-dy*.003*settings.sensitivity,-.8,.8);pointerLook.x=e.clientX;pointerLook.y=e.clientY;}},{passive:false});
function releasePointer(e){if(e.pointerId===movePointer){movePointer=null;moveOrigin=null;stick={forward:0,side:0,run:false};$('joystick').firstElementChild.style.transform='';}if(pointerLook?.id===e.pointerId)pointerLook=null;}
window.addEventListener('pointerup',releasePointer);window.addEventListener('pointercancel',releasePointer);$('world').addEventListener('lostpointercapture',releasePointer);document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});window.addEventListener('resize',()=>renderer?.resize());
function events(){for(const e of state.events.splice(0)){audio.event(e.type,state);if(e.type==='note'||e.type==='pickup'){if(e.type==='pickup')checkpoint();note(e.text);}if(e.type==='caption')caption(e.text);if(e.type==='distant'&&settings.captions)caption('[Something moves, far beyond the walls.]',3);if(e.type==='screech'&&settings.captions)caption('[A mechanical scream. Then footsteps that are not yours.]',4);if(e.type==='ghost'&&settings.captions)caption('[The whispers are behind you now.]',3);if(e.type==='room'&&e.count>=3&&settings.captions)caption(['','', '', '[A whisper, almost too quiet to hear.]','[Several whispers. Closer.]','[“You keep leaving.”]','[“Stay.”]','[“Look at me.”]'][e.count]||'[The whispers fill the hallway.]',3);}}
function loop(now){requestAnimationFrame(loop);if(!renderer||mode==='error')return;const rawElapsed=Math.max(0,(now-last)/1000),elapsed=Math.min(.05,rawElapsed);last=now;metrics.frames++;rollingFrame=rollingFrame*.98+Math.min(rawElapsed*1000,1000)*.02;if(mode==='playing'){const input={forward:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+stick.forward,side:(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+stick.side,turn:(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyQ')?1:0),run:keys.has('ShiftLeft')||keys.has('ShiftRight')||stick.run||runLatch};update(state,input,elapsed);events();audio.update(state,elapsed);if(state.status==='next'){const tool=state.tool;start(state.nextLevel,tool);return;}if(['lost','won'].includes(state.status))end();captionTimer=Math.max(0,captionTimer-elapsed);chapterTimer=Math.max(0,chapterTimer-elapsed);$('caption').style.opacity=captionTimer>0?1:0;$('chapter').style.opacity=chapterTimer>0?Math.min(chapterTimer,1):0;$('controls-tip').style.opacity=state.time<12?.65:0;const t=target(state);$('interact-hint').textContent=t?({door:touch?'OPEN DOOR':'E / OPEN DOOR',note:touch?'READ NOTE':'E / READ NOTE',tool:touch?'TAKE RESONATOR':'E / TAKE RESONATOR',hole:touch?'DROP DOWN':'E / DROP DOWN'})[t.kind]:'';$('use').textContent=t?({door:'OPEN',note:'READ',tool:'TAKE',hole:'DROP'})[t.kind]:'USE';$('use').style.opacity=t?1:.3;$('tool').hidden=!state.tool;$('tool').disabled=state.cooldown>0;$('tool').textContent=state.cooldown>0?Math.ceil(state.cooldown)+'s':'PULSE';$('tool-status').textContent=state.tool?(state.cooldown>0?'RESONATOR / '+Math.ceil(state.cooldown)+'s':'RESONATOR / READY'):'';$('stamina').firstElementChild.style.width=state.stamina*100+'%';let black=state.phase==='blackout'?1:0;if(state.transition){const t=state.transition.time/state.transition.duration;black=Math.sin(Math.PI*t);if(state.transition.kind==='level')black=t;}if(state.status==='lost')black=1;$('blackout').style.opacity=black;$('pulse-flash').style.opacity=state.flash>0?.13:0;}
renderer.render(state,elapsed,settings,mode==='menu');$('debug-info').hidden=!$('debug').checked;if($('debug').checked&&frame++%12===0)$('debug-info').textContent=`FURTHER IN ${VERSION}\nSeed ${state.seed}\nFloor ${state.level} · ${state.phase}\nPosition ${state.player.x.toFixed(1)}, ${state.player.z.toFixed(1)}\nTime ${state.time.toFixed(1)} · Doors ${state.choices}/${state.ghostDoor}\nPattern ${state.pattern}/4 · Still ${Number(state.stare||0).toFixed(1)}\nGPU calls ${renderer.renderer.info.render.calls} · ${(1000/rollingFrame).toFixed(0)} fps\n${state.entity?'Entity distance '+distance(state.entity,state.player).toFixed(1):'No pursuer'}`;}
updateMenu();if(launchLevel)$('choose').open=true;
// Read-only simulation snapshot makes QA possible without relying on rendered pixels.
window.furtherIn={snapshot:()=>({version:VERSION,mode,level:state.level,phase:state.phase,status:state.status,seed:state.seed,time:state.time,position:{...state.player},choices:state.choices,ghostDoor:state.ghostDoor,pattern:state.pattern,tool:state.tool,stare:state.stare||0,chasing:state.chasing,entity:state.entity?{...state.entity}:null,renderer:{calls:renderer?.renderer.info.render.calls,geometries:renderer?.renderer.info.memory.geometries,textures:renderer?.renderer.info.memory.textures},metrics:{...metrics,chapterLoad},rendererType:renderer?.constructor.name,touch})};
requestAnimationFrame(loop);
