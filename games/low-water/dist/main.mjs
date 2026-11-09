import * as THREE from './vendor/three.module.js';
import { LEVELS, getLevel, floorAt, roomAt, collides } from './levels.mjs';
import { World } from './world.mjs';
import { Input } from './input.mjs?v=0.1.1';
import { Soundscape } from './audio.mjs';
import { SoftwareView } from './software.mjs';
import { VERSION, SAVE_KEY, SETTINGS_KEY, DEFAULT_SETTINGS, freshState, restoreState, serializable, enterLevel, interact, objective, objectiveTarget, hint } from './core.mjs?v=0.1.1';

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const escapeHTML = str => String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = obj => JSON.parse(JSON.stringify(obj));
let settings = { ...DEFAULT_SETTINGS };
let saved = null;
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; saved = restoreState(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch {}
if (!['simple','moderate','expert'].includes(settings.guidance)) settings.guidance='moderate';
let state = freshState();
let checkpoint = serializable(saved || state);
let level = getLevel(0);
let playing = false, started = false, transitioning = false, menuOpen = true;
let dialogMode = '', target = null, world = null, renderer = null, software = null;
let frameTime = 0, lastTime = performance.now(), hudClock = 0, captionUntil = 0, toastUntil = 0, chapterUntil = 0;
let damageFade = 0, footBob = 0, eyeHeight = 1.65, threat = 0, moved = false, shotAge = 10;
let exhausted = false;
const touchMode = () => document.body.classList.contains('touch-mode');
let hintCount = 0, lastRoom = '', captured = false, fps = 60, fpsClock = 0, frames = 0;
const canvas = $('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9ba9a5');
scene.fog = new THREE.FogExp2('#435854', .014);
const camera = new THREE.PerspectiveCamera(settings.fov,innerWidth/innerHeight,.06,180);
camera.rotation.order='YXZ';
scene.add(camera);
const hemisphere = new THREE.HemisphereLight(0xc5e1dc,0x493c29,1.6);
scene.add(hemisphere);
scene.add(new THREE.AmbientLight(0xb9cbb8,.22));
const sunlight = new THREE.DirectionalLight(0xffe6b2,2.3);
sunlight.position.set(25,40,15);scene.add(sunlight);
const torch = new THREE.SpotLight(0xffe8bb,24,26,.48,.64,1.1);
torch.position.set(.17,-.12,-.1);
const torchTarget = new THREE.Object3D();torchTarget.position.set(0,-.05,-10);camera.add(torchTarget);torch.target=torchTarget;camera.add(torch);
const handLight=new THREE.PointLight(0xc4dfc8,.7,4,1);camera.add(handLight);
const toolGroup=new THREE.Group();camera.add(toolGroup);
const darkMetal=new THREE.MeshStandardMaterial({color:0x2b3432,roughness:.6,metalness:.6});
const wornMetal=new THREE.MeshStandardMaterial({color:0xb8a77c,roughness:.65,metalness:.4});
const toolGlow=new THREE.MeshBasicMaterial({color:0xa7e6cf});
function toolMesh(geo,mat,x,y,z,rx=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.x=rx;toolGroup.add(m);return m;}
toolMesh(new THREE.BoxGeometry(.16,.19,.34),darkMetal,0,0,0);
toolMesh(new THREE.BoxGeometry(.19,.035,.2),wornMetal,0,.105,-.02);
toolMesh(new THREE.CylinderGeometry(.035,.045,.26,8),darkMetal,.075,-.13,.07,.3);
toolMesh(new THREE.BoxGeometry(.035,.055,.26),wornMetal,-.095,.035,-.24);
toolMesh(new THREE.BoxGeometry(.035,.055,.26),wornMetal,.095,.035,-.24);
toolMesh(new THREE.BoxGeometry(.1,.035,.03),toolGlow,0,.12,-.11);
const pulseLight=new THREE.PointLight(0x9fffcf,0,7,1);toolGroup.add(pulseLight);
const pulseRing=new THREE.Mesh(new THREE.TorusGeometry(.1,.009,5,20),new THREE.MeshBasicMaterial({color:0xc4ffdf,transparent:true,opacity:0}));
camera.add(pulseRing);pulseRing.position.z=-1.2;
const sound=new Soundscape();

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=settings.brightness;
} catch (e) {
  const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);
  software=new SoftwareView(replacement,level);
}
const activeCanvas=$('scene');
const input=new Input({
  canvas:activeCanvas,moveZone:$('move-zone'),lookZone:$('look-zone'),stick:$('stick'),stickKnob:$('stick-knob'),
  buttons:Object.fromEntries(['use','jump','crouch','run','tool','flashlight'].map(key=>[key,$(`touch-${key}`)])),
  settings,onAction:action,onPause:reason=>{if(playing&&!transitioning)showPause(reason);},onGesture:()=>sound.unlock()
});

function resize(){
  const w=innerWidth,h=innerHeight;
  const touch=touchMode();
  const dpr=settings.graphics==='low'?1:Math.min(devicePixelRatio||1,touch?1.35:1.7);
  if(renderer){renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);}
  if(software)software.resize(w,h);
  camera.aspect=w/h;camera.fov=clamp(+settings.fov||76,60,96);camera.updateProjectionMatrix();
}
addEventListener('resize',resize);
globalThis.visualViewport?.addEventListener('resize',resize);
activeCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showPause('graphics');notify('Graphics paused by the browser. Your checkpoint is saved; reload to continue.',12);});
activeCanvas.addEventListener('webglcontextrestored',()=>location.reload());

function applySettings(){
  input.updateSettings(settings);
  sound.setEnabled(settings.sound);sound.setVolume(settings.volume);
  if(renderer)renderer.toneMappingExposure=clamp(+settings.brightness||1.12,.65,1.8);
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}
  document.querySelectorAll('[data-guidance]').forEach(button=>button.classList.toggle('selected',button.dataset.guidance===settings.guidance));
  $('guidance-description').textContent={simple:'Clear steps and a marker. Explore at your own pace.',moderate:'Brief objectives. Find the details yourself.',expert:'Read the station. No objective or route markers.'}[settings.guidance];
  $('hint-button').hidden=settings.guidance==='expert';
  resize();updateHUD();
}

function buildLevel(index){
  if(world){world.dispose();world=null;}
  level=getLevel(index);
  if(renderer)world=new World(scene,level,state);
  if(software)software.setLevel(level);
  const hue=[0x435854,0x294946,0x49564d,0x364d4b,0x394c43][index];
  scene.fog.color.setHex(hue);scene.fog.density=index===3?.018:.012;
  scene.background.setHex(index===4?0x747e74:0xa4b4ae);
  lastRoom='';hintCount=0;target=null;
  updateCamera(0);updateHUD();
}

function saveCheckpoint(){
  checkpoint=serializable(state);
  checkpoint.health=100;
  checkpoint.player.vy=0;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(checkpoint));saved=restoreState(checkpoint);}catch{notify('This browser could not save progress. Keep this tab open to continue.',8);}
  $('continue').hidden=false;
}

function notify(message,seconds=5){$('toast').textContent=message;$('toast').classList.add('visible');toastUntil=frameTime+seconds;}
function caption(message,seconds=4){if(!settings.captions)return;$('caption').textContent=message;$('caption').classList.add('visible');captionUntil=frameTime+seconds;}
function setPlaying(value){playing=value;input.setEnabled(value);sound.setPaused(!value);if(!value)target=null;}

function beginGame(resume=false){
  sound.unlock();
  state=resume&&saved?restoreState(copy(saved)):freshState();
  if(state.completed){state.completed=false;state.chapter=4;enterLevel(state,4);}
  checkpoint=serializable(state);
  started=true;menuOpen=false;$('menu').hidden=true;$('hud').hidden=false;$('overlay').hidden=true;
  buildLevel(state.chapter);saveCheckpoint();setPlaying(true);showChapter();
  if(!touchMode())input.requestPointerLock();
  if(state.chapter===0&&!resume)caption('The night shift called in a power fault. Nobody answered your return call.',6);
}

function showChapter(){
  $('chapter-card-number').textContent=`CHAPTER ${String(state.chapter+1).padStart(2,'0')} / BELLWETHER`;
  $('chapter-card-title').textContent=level.name;
  $('chapter-card-text').textContent=level.description||'';
  $('chapter-card').hidden=false;chapterUntil=frameTime+4.8;
}

async function changeLevel(index){
  if(transitioning)return;
  transitioning=true;setPlaying(false);$('fade').classList.add('active');
  await new Promise(resolve=>setTimeout(resolve,700));
  enterLevel(state,index);buildLevel(index);saveCheckpoint();
  $('fade').classList.remove('active');setPlaying(true);transitioning=false;showChapter();
  caption(['','Below the floor, the water moves against the current.','The observation window above you looks back onto your arrival.','Your footsteps return a little too late.','The same corridor. A different station.'][index],5);
}

function updateCamera(dt){
  const p=state.player;
  const targetEye=input?.crouchToggle?1.02:1.65;
  eyeHeight+= (targetEye-eyeHeight)*Math.min(1,dt*12||1);
  const bob=settings.motion&&moved?Math.sin(footBob)*.025:0;
  camera.position.set(p.x,p.y+eyeHeight+bob,p.z);
  camera.rotation.set(p.pitch||0,p.yaw||0,0,'YXZ');
  camera.updateMatrixWorld();
  torch.visible=!!state.flashlight;handLight.intensity=state.flashlight?.65:.23;
  toolGroup.visible=state.tool&&!menuOpen;
  toolGroup.position.set(.32,-.32+(settings.motion?Math.sin(footBob)*.008:0),-.54+Math.max(0,.18-shotAge)*.5);
  toolGroup.rotation.set(-.04,-.07,0);
  pulseLight.intensity=Math.max(0,.2-shotAge)*65;
  pulseRing.material.opacity=Math.max(0,.3-shotAge)*2;
  pulseRing.scale.setScalar(1+Math.min(1,shotAge)*14);
}

function lineClear(ax,az,bx,bz,y=0){
  const distance=Math.hypot(bx-ax,bz-az),steps=Math.ceil(distance/.45);
  for(let i=1;i<steps;i++){const t=i/steps;if(collides(level,ax+(bx-ax)*t,az+(bz-az)*t,.07,state,y))return false;}
  return true;
}

function findTarget(){
  const p=state.player;let best=null,bestScore=-Infinity;
  const forward=new THREE.Vector3();camera.getWorldDirection(forward);
  for(const item of level.interactables){
    if(item.id==='arc-tool'&&state.tool)continue;
    const dx=item.x-p.x,dz=item.z-p.z,dy=(item.y??1.3)-camera.position.y;
    const distance=Math.hypot(dx,dz,dy);
    if(distance>3.4||distance<.05)continue;
    const aim=(dx*forward.x+dy*forward.y+dz*forward.z)/distance;
    if(aim<.78)continue;
    if(!lineClear(p.x,p.z,item.x,item.z,p.y))continue;
    const score=aim-distance*.025;
    if(score>bestScore){bestScore=score;best=item;}
  }
  target=best;
  $('interaction').hidden=!target;
  $('crosshair').classList.toggle('target',!!target);
  if(target){
    $('interact-key').textContent=touchMode()?'USE':'E';
    $('interact-label').textContent=target.label;
    let detail=target.description||'';
    if(target.id.startsWith('damper-'))detail=`POSITION ${state.dampers[['damper-a','damper-b','damper-c'].indexOf(target.id)]} / 3 · TURN TO ADJUST`;
    if(target.id==='crane-breaker')detail=`GANTRY STANDBY · ${state.breakers.crane?'ON / 2 UNITS':'ISOLATED'}`;
    if(target.id==='exit-breaker')detail=`FREIGHT SUPPLY · ${state.breakers.exit?'ON / 2 UNITS':'OFF'}`;
    if(['gantry-control','gantry-recall','gantry-control-return'].includes(target.id))detail=`DOCK: ${['CENTRE','TOOL BAY','EAST DECK'][state.gantryPosition]}`;
    $('interact-description').textContent=detail;
  }
  $('touch-use').querySelector('small').textContent=target?target.type==='note'?'READ NOTE':'INTERACT':'LOOK AT OBJECT';
}

function action(name){
  if(!playing||transitioning)return;
  if(name==='journal'){showJournal();return;}
  if(name==='map'){showMap();return;}
  if(name==='flashlight'){state.flashlight=!state.flashlight;sound.play('flashlight');updateHUD();return;}
  if(name==='tool'){fireTool();return;}
  if(name==='use'){
    findTarget();
    if(!target){notify('Face a control or note, then move close enough to use it.',2.5);return;}
    const result=interact(state,target.id);
    sound.play(result.sound,{x:target.x,z:target.z});
    if(result.message)notify(result.message,result.checkpoint?6:4.5);
    if(result.note)showNote(result.note);
    if(result.nextChapter!==undefined){changeLevel(result.nextChapter);return;}
    if(result.complete){saveCheckpoint();showEnding();return;}
    if(result.checkpoint){saveCheckpoint();caption('Checkpoint recorded.',2);}
    else if(result.changed){try{localStorage.setItem(SAVE_KEY,JSON.stringify(serializable(state)));saved=restoreState(serializable(state));}catch{}}
    updateHUD();
  }
}

function fireTool(){
  if(!state.tool){notify('No defensive tool equipped. The field torch is all you have.',3);return;}
  if(state.cooldown>0){notify('Arc driver recharging.',1.2);return;}
  state.cooldown=3.4;shotAge=0;sound.play('tool');
  const direction=new THREE.Vector3();camera.getWorldDirection(direction);
  let hit=false;
  for(const enemy of state.enemies){
    if(!enemy.alive)continue;
    const dx=enemy.x-state.player.x,dz=enemy.z-state.player.z,distance=Math.hypot(dx,dz);
    const dot=(dx*direction.x+dz*direction.z)/Math.max(.01,distance);
    if(distance<10&&dot>.79&&lineClear(state.player.x,state.player.z,enemy.x,enemy.z,state.player.y)){
      enemy.stunned=6;enemy.alert=0;hit=true;
    }
  }
  caption(hit?'[Arc discharge. The figure locks in place.]':'[Arc discharge. The tool begins to recharge.]',2.5);
}

function movePlayer(dt,controls){
  const p=state.player;
  p.yaw-=controls.lookX*.0023;
  p.pitch=clamp((p.pitch||0)-controls.lookY*.0023*(settings.verticalSensitivity||1)*(settings.invertY?-1:1),-1.25,1.25);
  if(Math.abs(controls.lookX)+Math.abs(controls.lookY)>1)document.body.classList.add('has-looked');
  const motion=Math.hypot(controls.moveX,controls.moveZ);
  if(state.stamina<=3)exhausted=true;
  if(state.stamina>=25)exhausted=false;
  const running=controls.run&&!controls.crouch&&!exhausted&&motion>.1;
  const speed=controls.crouch?1.7:running?5.2:3.15;
  const dx=(Math.cos(p.yaw)*controls.moveX-Math.sin(p.yaw)*controls.moveZ)*speed*dt;
  const dz=(-Math.sin(p.yaw)*controls.moveX-Math.cos(p.yaw)*controls.moveZ)*speed*dt;
  const radius=.27;
  const beforeX=p.x,beforeZ=p.z;
  if(!collides(level,p.x+dx,p.z,radius,state,p.y))p.x+=dx;
  if(!collides(level,p.x,p.z+dz,radius,state,p.y))p.z+=dz;
  let floor=floorAt(level,p.x,p.z,state);
  if(floor===null||floor===undefined||!Number.isFinite(floor)){p.x=beforeX;p.z=beforeZ;floor=floorAt(level,p.x,p.z,state)??0;}
  const grounded=p.y<=floor+.04;
  if(controls.jump&&grounded&&!controls.crouch){p.vy=4.5;sound.play('jump');}
  if(!grounded||p.vy>0){p.vy=(p.vy||0)-13.5*dt;p.y+=p.vy*dt;if(p.y<=floor){if(p.vy<-4)sound.play('land');p.y=floor;p.vy=0;}}
  else{p.y=floor;p.vy=0;}
  moved=Math.hypot(p.x-beforeX,p.z-beforeZ)>.001;
  state.stamina=clamp(state.stamina+(running&&moved?-19:13)*dt,0,100);
  footBob+=dt*(running?12:8)*motion;
  sound.update(dt,{chapter:state.chapter,room:roomAt(level,p.x,p.z),water:state.chapter===1&&!state.waterDrained,moving:moved,running,crouching:controls.crouch,threat,player:{x:p.x,z:p.z,yaw:p.yaw}});
  return {running,moving:moved,crouching:controls.crouch};
}

function routeTo(enemy,tx,tz){
  const step=1.3;const sx=Math.round(enemy.x/step),sz=Math.round(enemy.z/step),gx=Math.round(tx/step),gz=Math.round(tz/step);
  const key=(x,z)=>`${x},${z}`;
  const queue=[[sx,sz]],seen=new Map([[key(sx,sz),null]]);let finish=null;
  for(let head=0;head<queue.length&&head<1600;head++){
    const [x,z]=queue[head];if(Math.abs(x-gx)+Math.abs(z-gz)<=1){finish=[x,z];break;}
    for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+ox,nz=z+oz,k=key(nx,nz);if(seen.has(k)||collides(level,nx*step,nz*step,.28,state,enemy.y||0))continue;
      seen.set(k,[x,z]);queue.push([nx,nz]);
    }
  }
  if(!finish)return [];
  const path=[];let node=finish;
  while(node&&!(node[0]===sx&&node[1]===sz)){path.push({x:node[0]*step,z:node[1]*step});node=seen.get(key(...node));}
  return path.reverse();
}

function updateEnemies(dt,motion){
  threat=0;
  for(const enemy of state.enemies){
    if(!enemy.alive)continue;
    enemy.stunned=Math.max(0,enemy.stunned-dt);enemy.attackCooldown=Math.max(0,(enemy.attackCooldown||0)-dt);
    if(enemy.stunned>0)continue;
    const distance=Math.hypot(enemy.x-state.player.x,enemy.z-state.player.z);
    const sameHeight=Math.abs((enemy.y||0)-state.player.y)<1.7;
    const visible=sameHeight&&distance<13&&lineClear(enemy.x,enemy.z,state.player.x,state.player.z,enemy.y||0);
    const noise=motion.running?1:motion.crouching?.05:motion.moving?.4:0;
    const detects=enemy.kind==='watcher'?visible&&state.flashlight:((distance<15&&noise>.65)||(distance<7&&noise>.2)||(visible&&distance<3.4));
    if(detects){if(!enemy.alert){sound.play('enemy',{x:enemy.x,z:enemy.z});caption(enemy.kind==='watcher'?'[A shape turns toward your light.]':'[Metal feet stop. Something is listening.]',3);}enemy.alert=6;}
    else enemy.alert=Math.max(0,(enemy.alert||0)-dt);
    if(enemy.alert>0){
      threat=Math.max(threat,clamp(1-distance/18,0,1));
      let next={x:state.player.x,z:state.player.z};
      if(!visible){
        enemy.pathTime=(enemy.pathTime||0)-dt;
        if(enemy.pathTime<=0){enemy.path=routeTo(enemy,state.player.x,state.player.z);enemy.pathTime=1.4;}
        if(enemy.path?.length){next=enemy.path[0];if(Math.hypot(next.x-enemy.x,next.z-enemy.z)<.45){enemy.path.shift();next=enemy.path[0]||next;}}
      }
      const dx=next.x-enemy.x,dz=next.z-enemy.z,d=Math.max(.01,Math.hypot(dx,dz));
      const speed=enemy.kind==='watcher'?1.65:2.1;
      const mx=dx/d*speed*dt,mz=dz/d*speed*dt;
      if(!collides(level,enemy.x+mx,enemy.z,.29,state,enemy.y||0))enemy.x+=mx;
      if(!collides(level,enemy.x,enemy.z+mz,.29,state,enemy.y||0))enemy.z+=mz;
      enemy.y=floorAt(level,enemy.x,enemy.z,state)??enemy.y??0;
      if(distance<1.1&&sameHeight&&enemy.attackCooldown===0){
        state.health=Math.max(0,state.health-16);enemy.attackCooldown=1.6;damageFade=.8;sound.play('damage');caption('[Impact. Break line of sight or use the arc driver.]',2.5);
        if(state.health<=0){showDeath();return;}
      }
    }else{
      const tx=enemy.originX+Math.sin(frameTime*.16+state.chapter)*2.2,tz=enemy.originZ+Math.cos(frameTime*.14)*2;
      const dx=tx-enemy.x,dz=tz-enemy.z,d=Math.max(.1,Math.hypot(dx,dz)),sp=.45*dt;
      if(!collides(level,enemy.x+dx/d*sp,enemy.z,.29,state,enemy.y||0))enemy.x+=dx/d*sp;
      if(!collides(level,enemy.x,enemy.z+dz/d*sp,.29,state,enemy.y||0))enemy.z+=dz/d*sp;
    }
  }
}

function updateHUD(){
  if(!$('hud')||!state)return;
  const room=roomAt(level,state.player.x,state.player.z);
  $('chapter-number').textContent=`${String(state.chapter+1).padStart(2,'0')} / ${level.name.toUpperCase()}`;
  $('room-name').textContent=room?.name||'Bellwether Station';
  $('objective').textContent=objective(state,settings.guidance);
  $('objective').hidden=settings.guidance==='expert';
  $('health').textContent=Math.ceil(state.health).toString().padStart(2,'0');
  $('stamina-fill').style.width=`${state.stamina}%`;
  $('noise').textContent=threat>.1?'MOVEMENT · DETECTED':input?.crouchToggle?'MOVEMENT · SILENT':moved?'MOVEMENT · AUDIBLE':'MOVEMENT · QUIET';
  $('equipment-name').textContent=state.tool?'ARC DRIVER':'FIELD TORCH';
  $('equipment-state').textContent=state.tool?(state.cooldown>0?'RECHARGING':'READY'):state.flashlight?'ONLINE':'OFFLINE';
  $('charge').style.width=`${98*(state.tool?1-state.cooldown/3.4:state.flashlight?1:0)}px`;
  $('touch-tool').disabled=!state.tool;
  $('touch-tool').querySelector('small').textContent=!state.tool?'NO TOOL':state.cooldown>0?`${Math.ceil(state.cooldown)}s`:'READY';
  $('touch-flashlight').classList.toggle('is-toggled',state.flashlight);
  $('look-reminder').hidden=!playing||document.body.classList.contains('has-looked')||document.pointerLockElement===activeCanvas||touchMode();
  if(room&&room.id!==lastRoom){lastRoom=room.id;if(!state.visited.includes(`${state.chapter}:${room.id}`))state.visited.push(`${state.chapter}:${room.id}`);}
  updateWaypoint();
}

function updateWaypoint(){
  const el=$('waypoint');
  if(settings.guidance!=='simple'||!playing){el.hidden=true;return;}
  const item=level.interactables.find(i=>i.id===objectiveTarget(state));
  if(!item){el.hidden=true;return;}
  const point=new THREE.Vector3(item.x,(item.y||1.3)+.6,item.z).project(camera);
  const dist=Math.hypot(item.x-state.player.x,item.z-state.player.z);
  if(point.z>1||Math.abs(point.x)>.92||Math.abs(point.y)>.75||dist<3){el.hidden=true;return;}
  el.hidden=false;el.style.left=`${(point.x*.5+.5)*innerWidth}px`;el.style.top=`${(-point.y*.5+.5)*innerHeight}px`;el.querySelector('small').textContent=`${Math.round(dist)} m`;
}

function openDialog(title,kicker,content,mode='pause'){
  setPlaying(false);dialogMode=mode;$('dialog-title').textContent=title;$('dialog-kicker').textContent=kicker;
  $('dialog-body').innerHTML=content;$('overlay').hidden=false;$('chapter-card').hidden=true;$('interaction').hidden=true;$('waypoint').hidden=true;
  $('dialog-close').focus({preventScroll:true});
}
function closeDialog(){
  $('overlay').hidden=true;dialogMode='';
  if(started&&!menuOpen&&!state.completed){setPlaying(true);if(!touchMode())input.requestPointerLock();}
}
function showPause(reason='manual'){
  const explanation={visibility:'Paused because the game went into the background.',pagehide:'Paused because you left the game page.',blur:'Paused because the game window lost focus.',pointerlock:'Paused because mouse look was released.',graphics:'The browser interrupted 3D graphics. Reload the game to return to your saved checkpoint.'}[reason];
  openDialog('Take a breath.','FIELD REPORT / PAUSED',`<p>${escapeHTML(level.name)} · ${escapeHTML(roomAt(level,state.player.x,state.player.z)?.name||'Bellwether Station')}</p>${explanation?`<p class="pause-reason">${explanation}</p>`:''}<div class="pause-grid"><button id="resume-play">RESUME EXPLORATION <span>→</span></button><button id="pause-settings">Controls & comfort</button><button id="pause-journal">Field journal</button><button id="pause-map">Station plan</button><button id="restart-checkpoint">Restart checkpoint</button><button id="pause-chapters">Chapter select</button><button id="back-menu">Return to title</button></div><div class="pause-meta"><span>CHECKPOINTS SAVE ON THIS BROWSER</span><span>${software?'COMPATIBILITY VIEW':'3D VIEW'} · v${VERSION}</span></div>`);
  $('resume-play').onclick=closeDialog;$('pause-settings').onclick=showSettings;$('pause-journal').onclick=showJournal;$('pause-map').onclick=showMap;$('restart-checkpoint').onclick=restartCheckpoint;$('pause-chapters').onclick=showChapters;$('back-menu').onclick=returnMenu;
}

function range(key,label,min,max,step,unit=''){
  return `<div class="setting"><label for="setting-${key}">${label}<output id="out-${key}">${settings[key]}${unit}</output></label><input id="setting-${key}" type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-unit="${unit}"></div>`;
}
function toggle(key,label){return `<label class="setting-toggle" for="setting-${key}">${label}<input id="setting-${key}" data-setting="${key}" type="checkbox" ${settings[key]?'checked':''}></label>`;}
function showSettings(){
  openDialog('Controls & comfort','MAKE ROOM FOR YOURSELF',`<section class="settings-section"><h3>GUIDANCE</h3><div class="segmented">${['simple','moderate','expert'].map(t=>`<button data-guidance="${t}" class="${settings.guidance===t?'selected':''}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div><p>Simple adds clear steps and a destination marker. Moderate offers brief objectives and optional clues. Expert leaves navigation and calibration to you. Every tier has the same world and story.</p></section><section class="settings-section"><h3>YOUR HANDS</h3><div class="settings-grid"><div class="setting"><label for="setting-controls">Control layout</label><select id="setting-controls" data-setting="controls"><option value="auto" ${settings.controls==='auto'?'selected':''}>Automatic</option><option value="touch" ${settings.controls==='touch'?'selected':''}>Touch controls</option><option value="desktop" ${settings.controls==='desktop'?'selected':''}>Desktop controls</option></select></div>${range('stickSize','Movement stick',60,150,2,' px')}${range('buttonSize','Action buttons',70,145,5,'%')}${range('sensitivity','Look sensitivity',.4,2,.05,'×')}${range('verticalSensitivity','Vertical sensitivity',.5,1.5,.05,'×')}${toggle('leftHanded','Swap the touch sides')}${toggle('invertY','Invert vertical look')}</div></section><section class="settings-section"><h3>YOUR VIEW</h3><div class="settings-grid">${range('fov','Field of view',60,96,1,'°')}${range('brightness','Brightness',.65,1.8,.05,'×')}${toggle('motion','Gentle walking motion')}<div class="setting"><label for="setting-graphics">Graphics</label><select id="setting-graphics" data-setting="graphics"><option value="auto" ${settings.graphics==='auto'?'selected':''}>Balanced</option><option value="low" ${settings.graphics==='low'?'selected':''}>Lower resolution</option></select></div></div></section><section class="settings-section"><h3>YOUR SOUND</h3><div class="settings-grid">${toggle('sound','Station soundscape')}${toggle('captions','Sound captions')}${range('volume','Volume',0,1,.05,'')}</div></section><section class="settings-controls"><div><h4>TOUCH</h4><p>Left thumb: move from wherever you touch.<br>Right thumb: drag to look. Separate USE and PULSE buttons.<br>Tap RUN to toggle sprint. Tap CROUCH to stay low. Tap either again to return to normal.</p></div><div><h4>DESKTOP</h4><p>WASD / arrows: move · Mouse: look<br>E: use · F: torch · Shift: run · C: crouch<br>Space: jump · Q / left click: pulse<br>J: journal · M: plan · Escape: pause</p></div></section><p class="settings-footnote">Camera motion is off by default. Essential puzzle clues are also visible. Changes are saved automatically on this browser.</p><button class="primary" id="settings-done">DONE <span>→</span></button>`,'settings');
  $('dialog-body').querySelectorAll('[data-setting]').forEach(el=>el.addEventListener('input',()=>{
    const key=el.dataset.setting;settings[key]=el.type==='checkbox'?el.checked:el.type==='range'?+el.value:el.value;
    if($(`out-${key}`))$(`out-${key}`).textContent=`${el.value}${el.dataset.unit||''}`;
    if(key==='sound'&&el.checked)sound.unlock();applySettings();
  }));
  bindGuidance($('dialog-body'));$('settings-done').onclick=()=>menuOpen?closeDialog():showPause();
}

function bindGuidance(root){root.querySelectorAll('[data-guidance]').forEach(el=>el.onclick=()=>{settings.guidance=el.dataset.guidance;applySettings();});}
function allNotes(){return LEVELS.flatMap(l=>(l.notes||[]).map(n=>({...n,chapter:l.name})));}
function showJournal(){
  const notes=allNotes().filter(n=>state.notes.includes(n.id));
  openDialog('Field journal','KEEP A RECORD',`<p>${escapeHTML(hint(state))}</p><div class="journal-list">${notes.length?notes.map(n=>`<button data-note="${escapeHTML(n.id)}">${escapeHTML(n.title)}<span>${escapeHTML(n.chapter)}</span></button>`).join(''):'<p>No documents collected yet. Inspect the papers and maintenance plates left around the station.</p>'}</div><p class="settings-footnote">Collected documents remain available across chapters.</p>`,'journal');
  $('dialog-body').querySelectorAll('[data-note]').forEach(b=>b.onclick=()=>showNote(allNotes().find(n=>n.id===b.dataset.note)));
}
function showNote(note){
  openDialog(note.title,'RECOVERED DOCUMENT',`<p class="note-content">${escapeHTML(note.text)}</p><button class="primary" id="note-done">RETURN TO THE STATION <span>→</span></button>`,'note');
  $('note-done').onclick=closeDialog;
}

function showMap(){
  openDialog('Station plan',`${String(state.chapter+1).padStart(2,'0')} / ${level.name.toUpperCase()}`,`<div class="map-container"><canvas id="map-canvas" width="1000" height="620" aria-label="Plan showing current location and discovered rooms"></canvas></div><div class="map-key"><span>▲ YOU</span><span>— DISCOVERED SPACE</span><span>▧ UNEXPLORED AREA</span></div><p class="map-help">A maintenance plan of this part of the station. Your heading is shown by the arrow. ${settings.guidance==='simple'?'The amber diamond marks your next control.':'Room signs and service lines connect the route.'}</p>`,'map');
  drawMap();
}
function drawMap(){
  const c=$('map-canvas');if(!c)return;const ctx=c.getContext('2d');
  const minX=Math.min(...level.rooms.map(r=>r.x))-2,minZ=Math.min(...level.rooms.map(r=>r.z))-2,maxX=Math.max(...level.rooms.map(r=>r.x+r.w))+2,maxZ=Math.max(...level.rooms.map(r=>r.z+r.d))+2;
  const scale=Math.min(900/(maxX-minX),510/(maxZ-minZ)),ox=(1000-(maxX-minX)*scale)/2,oz=(620-(maxZ-minZ)*scale)/2;
  const px=x=>ox+(x-minX)*scale,pz=z=>oz+(z-minZ)*scale;
  ctx.fillStyle='#0d1912';ctx.fillRect(0,0,1000,620);
  ctx.lineWidth=.7;ctx.strokeStyle='#263629';for(let x=0;x<1000;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,620);ctx.stroke();}for(let z=0;z<620;z+=25){ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(1000,z);ctx.stroke();}
  for(const room of level.rooms){const known=state.visited.includes(`${state.chapter}:${room.id}`);ctx.fillStyle=known?'#314c38':'#192b20';ctx.strokeStyle=known?'#8ba47f':'#43573b';ctx.lineWidth=known?2:1;ctx.fillRect(px(room.x),pz(room.z),room.w*scale,room.d*scale);ctx.strokeRect(px(room.x),pz(room.z),room.w*scale,room.d*scale);if(room.w*scale>70&&room.d*scale>35){ctx.fillStyle=known?'#c0ccb2':'#617456';ctx.font='11px monospace';ctx.textAlign='center';const name=room.name.toUpperCase().split(' ');name.forEach((word,i)=>ctx.fillText(word,px(room.x+room.w/2),pz(room.z+room.d/2)+(i-(name.length-1)/2)*14,room.w*scale-8));}}
  for(const gate of level.gates||[]){ctx.fillStyle=state[gate.requires]?'#8cb18d':'#d38b53';ctx.fillRect(px(gate.x-gate.w/2),pz(gate.z-gate.d/2),Math.max(3,gate.w*scale),Math.max(3,gate.d*scale));}
  if(settings.guidance==='simple'){const t=level.interactables.find(i=>i.id===objectiveTarget(state));if(t){ctx.fillStyle='#e7bb70';ctx.font='26px monospace';ctx.textAlign='center';ctx.fillText('◇',px(t.x),pz(t.z));}}
  ctx.save();ctx.translate(px(state.player.x),pz(state.player.z));ctx.rotate(-state.player.yaw);ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.fillStyle='#edc17c';ctx.fill();ctx.restore();
}

function showChapters(){
  openDialog('Your route so far','CHAPTERS / RECORDED CHECKPOINTS',`<p>Replay a chapter you have reached. This starts that chapter again and replaces the current checkpoint.</p><div class="chapter-list">${LEVELS.map((l,i)=>`<button data-chapter="${i}" ${i>state.unlocked?'disabled':''}><b>${String(i+1).padStart(2,'0')}</b><span>${i<=state.unlocked?escapeHTML(l.name):'Not yet reached'}</span><small>${i===state.chapter?'CURRENT':i<=state.unlocked?'REPLAY':'LOCKED'}</small></button>`).join('')}</div>`,'chapters');
  $('dialog-body').querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{const index=+b.dataset.chapter,unlocked=state.unlocked,notes=state.notes;state=freshState(index);state.unlocked=unlocked;state.notes=notes;buildLevel(index);saveCheckpoint();closeDialog();showChapter();});
}
function restartCheckpoint(){
  const unlocked=state.unlocked;const deaths=state.deaths;
  state=restoreState(copy(checkpoint))||freshState();state.health=100;state.deaths=deaths;state.unlocked=Math.max(unlocked,state.unlocked);state.enemies.forEach(e=>{e.stunned=4;e.alert=0;});
  buildLevel(state.chapter);$('overlay').hidden=true;setPlaying(true);if(!touchMode())input.requestPointerLock();notify('Checkpoint restored.',2.5);
}
function showDeath(){state.deaths++;setPlaying(false);openDialog('The signal goes dark.','CHECKPOINT AVAILABLE',`<p>You can return to the last recorded checkpoint. Completed machinery and discoveries at that checkpoint are retained.</p><button class="primary" id="death-retry">RETURN TO CHECKPOINT <span>→</span></button>`,'death');$('death-retry').onclick=restartCheckpoint;}
function showEnding(){
  setPlaying(false);sound.play('complete');
  openDialog('Shift complete.','FIELD REPORT / LOW WATER',`<div class="ending-content"><span class="ending-label">BELLWETHER STATION · OFFLINE</span><h3>For a moment,<br>nothing answers.</h3><p>The evacuation lift clears the sea wall. The machinery below falls quiet, one system at a time. You count the last three lights going out.</p><p>Then the maintenance indicator beside your hand pulses twice.</p><div class="pause-meta"><span>5 CHAPTERS COMPLETED</span><span>${state.notes.length} DOCUMENTS RECOVERED</span></div><button class="primary" id="ending-menu">RETURN TO TITLE <span>→</span></button></div>`,'ending');$('ending-menu').onclick=returnMenu;
}
function returnMenu(){setPlaying(false);menuOpen=true;started=false;$('overlay').hidden=true;$('hud').hidden=true;$('menu').hidden=false;$('chapter-card').hidden=true;state=freshState();buildLevel(0);$('continue').hidden=!saved;}

$('start').onclick=()=>{if(saved){openDialog('Begin a new shift?','NEW FIELD REPORT',`<p>This replaces your saved LOW WATER checkpoint. Your control and comfort settings stay in place.</p><button class="primary" id="confirm-new">BEGIN NEW SHIFT <span>→</span></button><button class="text-button" id="cancel-new">Keep my checkpoint</button>`,'new');$('confirm-new').onclick=()=>beginGame(false);$('cancel-new').onclick=closeDialog;}else beginGame(false);};
$('continue').onclick=()=>beginGame(true);$('menu-settings').onclick=showSettings;$('pause-button').onclick=()=>showPause();$('journal-button').onclick=showJournal;$('map-button').onclick=showMap;
$('dialog-close').onclick=()=>{if(dialogMode==='death')restartCheckpoint();else if(dialogMode==='ending')returnMenu();else closeDialog();};
$('hint-button').onclick=()=>{caption(hint(state,hintCount++>0),8);};
addEventListener('keydown',event=>{if(event.code==='Escape'&&!event.defaultPrevented&&!$('overlay').hidden){event.preventDefault();if(dialogMode==='death')restartCheckpoint();else if(dialogMode==='ending')returnMenu();else closeDialog();}});
bindGuidance($('menu'));
$('continue').hidden=!saved;

function tick(now){
  requestAnimationFrame(tick);
  const dt=Math.min(.045,Math.max(0,(now-lastTime)/1000));lastTime=now;frameTime+=dt;
  frames++;fpsClock+=dt;if(fpsClock>1){fps=frames/fpsClock;frames=0;fpsClock=0;}
  if(playing){
    const controls=input.sample();const motion=movePlayer(dt,controls);
    state.elapsed+=dt;state.cooldown=Math.max(0,state.cooldown-dt);shotAge+=dt;
    updateEnemies(dt,motion);updateCamera(dt);
    hudClock+=dt;if(hudClock>.09){hudClock=0;findTarget();updateHUD();}
  }else if(menuOpen){
    const p=level.spawn;camera.position.set(p.x+.18*Math.sin(frameTime*.13),p.y+1.85,p.z);
    camera.rotation.set(.015,(p.yaw||0)+.15*Math.sin(frameTime*.1),0,'YXZ');camera.updateMatrixWorld();torch.visible=false;toolGroup.visible=false;
  }
  if(world)world.update(playing?dt:0,frameTime,state,state.player);
  damageFade=Math.max(0,damageFade-dt*.7);$('damage').style.opacity=String(damageFade);
  if(frameTime>toastUntil){$('toast').classList.remove('visible');$('toast').textContent='';}
  if(frameTime>captionUntil){$('caption').classList.remove('visible');$('caption').textContent='';}
  if(frameTime>chapterUntil)$('chapter-card').hidden=true;
  if(renderer)renderer.render(scene,camera);else if(software)software.render(state,camera,frameTime,settings.brightness);
}

try {
  buildLevel(0);applySettings();resize();
  $('load-status').textContent=software?'COMPATIBILITY VIEW READY':'STATION READY';
  requestAnimationFrame(tick);
}catch(error){
  $('error').hidden=false;$('error-message').textContent='The 3D view did not finish loading. Refresh this page to try again. Your saved checkpoint is kept.';
  console.error(error);
}
