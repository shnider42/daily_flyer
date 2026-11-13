import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { BallparkRenderer, samplePlayerMotion, presentationBatter } from '../public/renderer.mjs';
import { BaseballGame, pitchPosition, AIM_AREA, PITCH_AIM_AREA } from '../public/engine.mjs';
import { CompatibilityRenderer } from '../public/fallback-renderer.mjs';
import { getWallSegments } from '../public/parks.mjs';
import { DELIVERIES, getRoster } from '../public/rosters.mjs';

// Scene/rig assertions do not pretend to test a GPU or a browser rasterizer.
// Canvas textures are inert here; actual image QA is a separate render check.
const context = new Proxy({}, { get(target, key) {
  if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
  return target[key] ?? (() => {});
}, set(target, key, value) { target[key] = value; return true; } });
const canvas = () => ({ width: 1, height: 1, clientWidth: 430, clientHeight: 932, getContext: () => context });
globalThis.document = { createElement: canvas };
globalThis.devicePixelRatio = 1;
function scene() {
  const r = Object.create(BallparkRenderer.prototype);
  Object.assign(r, { canvas: canvas(), width: 430, height: 932, dpr: 1.25, quality: 'auto', touch: true,
    frameAverage: 1/60, adaptiveScale: 1, frameCount: 0, menuTime: 0, lastTick: -1,
    models: new Map(), runnerModels: [], lastBoard: '', wasMenu: true, materials: new Map(),
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(51,430/932,.075,700),
    look: new THREE.Vector3(), targetCamera: new THREE.Vector3(), targetLook: new THREE.Vector3(), scratch: new THREE.Vector3(),
    geometries: { box: new THREE.BoxGeometry(1,1,1), sphere: new THREE.SphereGeometry(1,10,8),
      cylinder: new THREE.CylinderGeometry(1,1,1,8), plane: new THREE.PlaneGeometry(1,1), disc: new THREE.CircleGeometry(1,24) },
    renderer: { setSize() {}, setPixelRatio() {}, render(s,c) { s.updateMatrixWorld(true); c.updateMatrixWorld(true); } },
    updateBoard() {} });
  r.buildActors(); r.buildGuides(); r.buildEffects(); return r;
}
function pitchState() {
  const state = new BaseballGame({ mode: 'practice', seed: 2003 }).state;
  state.pitch = { id: 1, type: 'fastball', start: {x:-.32,y:1.88,z:18.44}, target: {x:.07,y:.91,z:0},
    releaseAt: 1, duration: .5, contactAt: 1.5, breakX: .04, breakY: .06, resolved: false };
  state.phase='pitch'; state.time=1;
  state.ball={...state.ball,...pitchPosition(state.pitch,1),visible:true}; return state;
}

test('visual pitching hand meets the authoritative release point', () => {
  const renderer=scene(),state=pitchState(); renderer.render(state,1/60,{});
  const hand=renderer.models.get('P').rightHand.getWorldPosition(new THREE.Vector3());
  assert(hand.distanceTo(new THREE.Vector3(.32,1.88,18.44))<.006);
  renderer.scene.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
});

test('pitch endpoint remains hidden until resolution and respects Expert guidance', () => {
  const renderer=scene(),state=pitchState(); renderer.render(state,1/60,{});
  assert.equal(renderer.pitchMark.visible,false);
  state.phase='result';state.pitch.resolved=true;renderer.render(state,1/60,{});
  assert.equal(renderer.pitchMark.visible,true);
  renderer.render(state,1/60,{guidance:'expert'});assert.equal(renderer.pitchMark.visible,false);
});

test('lead runner stays visible and selected before the pitch', () => {
  const renderer=scene(),state=pitchState();state.phase='ready';state.pitch=null;state.ball.visible=false;
  state.runners=[{id:4,number:2,base:1,fromBase:1,targetBase:1,pathPosition:1.1,x:18.2,z:20.6,prevX:18.2,prevZ:20.6,leadDistance:1.7,stealQueued:true}];
  renderer.render(state,1/60,{selectedRunnerId:4});
  assert.equal(renderer.runnerModels[0].group.visible,true);assert.equal(renderer.runnerSelection.visible,true);
  assert.equal(renderer.runnerSelection.position.x,-18.2);
});

test('shared animation poses remain finite and do not mutate simulation state', () => {
  const state=pitchState();state.phase='live';state.play={stage:'throw',receiver:'SS',fielder:'C',throw:{elapsed:.4,duration:.6,startedAt:.6}};
  const before=JSON.stringify(state);
  for(const role of ['pitcher','catcher','batter','runner','fielder'])for(const moving of [false,true]){
    const pose=samplePlayerMotion(state,role,{moving,actor:{id:'SS',x:0,z:30,number:3,sliding:role==='runner',leadDistance:2}});
    for(const value of Object.values(pose))if(typeof value==='number')assert(Number.isFinite(value));
    assert(pose.bat.every(Number.isFinite));
  }
  assert.equal(JSON.stringify(state),before);
});

test('all deliveries release from the correct anatomical hand for either throwing side', () => {
  const renderer=scene(),state=pitchState();
  for(const delivery of Object.values(DELIVERIES))for(const hand of ['R','L']){
    state.pitch={...state.pitch,hand,delivery:delivery.id,windupDuration:delivery.duration,
      start:{...delivery.start,x:delivery.start.x*(hand==='L'?-1:1)}};
    state.time=state.pitch.releaseAt;Object.assign(state.ball,state.pitch.start);
    renderer.render(state,1/60,{});
    const model=renderer.models.get('P'),throwing=hand==='L'?'left':'right',glove=hand==='L'?'right':'left';
    const point=model[`${throwing}Hand`].getWorldPosition(new THREE.Vector3()),wanted=new THREE.Vector3(-state.pitch.start.x,state.pitch.start.y,state.pitch.start.z);
    assert(point.distanceTo(wanted)<.006,`${delivery.id} ${hand} release misses by ${point.distanceTo(wanted).toFixed(4)}m`);
    assert.equal(model.heldBall.parent,model[`${throwing}Hand`]);assert.equal(model.gloveSide,glove);
  }
});

test('delivery silhouettes differ, use their own timing, and mirror limbs without mutating the pitch', () => {
  const state=pitchState(),poses=[];
  for(const delivery of Object.values(DELIVERIES)){
    state.phase='windup';state.pitch.delivery=delivery.id;state.pitch.windupDuration=delivery.duration;
    state.time=state.pitch.releaseAt-delivery.duration*.25;state.pitch.hand='R';
    const right=samplePlayerMotion(state,'pitcher');state.pitch.hand='L';
    const left=samplePlayerMotion(state,'pitcher');
    assert.equal(left.rightHip,right.leftHip);assert.equal(left.leftArm,right.rightArm);assert.equal(left.twist,-right.twist);
    assert.equal(left.rightSpread,-right.leftSpread);
    poses.push([right.leftHip,right.rightArm,right.rightSpread,right.lean].map(v=>v.toFixed(3)).join('/'));
  }
  assert.equal(new Set(poses).size,Object.keys(DELIVERIES).length);
});

test('left-handed batter mirrors the box, bat and grip without mirroring jersey text', () => {
  const renderer=scene(),state=pitchState(),actor=getRoster(0).lineup[0];state.swing={time:state.time};
  state.pitch.batter={...actor,hand:'R'};renderer.render(state,1/60,{});
  const rightTip=renderer.batter.batPivot.localToWorld(new THREE.Vector3(0,.94,0));
  assert.equal(renderer.batter.group.position.x,1.02);
  state.pitch.batter={...actor,hand:'L'};renderer.render(state,1/60,{});
  const leftTip=renderer.batter.batPivot.localToWorld(new THREE.Vector3(0,.94,0));
  assert.equal(renderer.batter.group.position.x,-1.02);assert.equal(renderer.batter.group.rotation.y,Math.PI/2);
  assert(Math.abs(leftTip.x+rightTip.x)<1e-8);assert(Math.abs(leftTip.y-rightTip.y)<1e-8);assert(Math.abs(leftTip.z-rightTip.z)<1e-8);
  assert.deepEqual(renderer.batter.group.scale.toArray(),[1,1,1]);
  const grip=renderer.batter.batPivot.localToWorld(new THREE.Vector3(0,.055,0)),hand=renderer.batter.leftHand.getWorldPosition(new THREE.Vector3());
  assert(grip.distanceTo(hand)<.006);
});

test('hit-by-pitch presentation keeps the struck batter through the result and starts at impact', () => {
  const renderer=scene(),state=pitchState(),struck={...getRoster(0).lineup[0],hand:'R'};
  state.pitch.batter=struck;state.pitch.hitByPitch={at:1.4,point:{x:-.82,y:1.1,z:-.04},hand:'R',playerId:struck.id};
  state.batterIndex[0]=1;state.phase='result';state.pitch.resolved=true;state.time=1.39;
  renderer.render(state,1/60,{});assert.equal(renderer.bodyImpact.visible,false);assert.equal(presentationBatter(state).id,struck.id);
  state.time=1.55;renderer.render(state,1/60,{});assert.equal(renderer.bodyImpact.visible,true);
  assert.equal(renderer.batter.number,struck.number);assert.equal(renderer.batter.hand,'R');
  assert(samplePlayerMotion(state,'batter',{actor:struck}).hipZ<-.10);
  state.phase='ready';state.pitch=null;renderer.render(state,1/60,{});
  assert.equal(renderer.batter.number,getRoster(0).lineup[1].number);assert.equal(renderer.batter.hand,'L');
  assert.equal(renderer.bodyImpact.visible,false);
});

test('compatibility renderer shares left-handed body placement and release contact', () => {
  const renderer=new CompatibilityRenderer(canvas()),state=pitchState(),lefty=getRoster(0).lineup[1];
  state.pitch.hand='L';state.pitch.delivery='sidearm';state.pitch.windupDuration=DELIVERIES.sidearm.duration;
  state.pitch.start={...DELIVERIES.sidearm.start,x:-DELIVERIES.sidearm.start.x};state.pitch.batter={...lefty,hand:'L'};
  const captured=[],person=renderer.person.bind(renderer);
  renderer.person=(actor,s,home,role,facing)=>{const hands=person(actor,s,home,role,facing);captured.push({actor,role,facing,hands});return hands;};
  renderer.render(state,1/60,{batting:true});
  const batter=captured.find(p=>p.role==='batter'),pitcher=captured.find(p=>p.role==='pitcher');
  assert.equal(batter.actor.x,1.02);assert.equal(batter.facing,Math.PI/2);assert.equal(batter.actor.number,lefty.number);
  assert.equal(pitcher.hands.throwingHand,'left');assert.equal(pitcher.hands.gloveHand,'right');assert.deepEqual(pitcher.hands.left,state.pitch.start);
});

test('pitching reticle can reach the batter while batting aim keeps its original range', () => {
  const renderer=scene(),state=pitchState();
  renderer.render(state,1/60,{batting:false,aim:{x:1,y:0}});assert.equal(renderer.aimRing.position.x,-PITCH_AIM_AREA.x);
  renderer.render(state,1/60,{batting:true,aim:{x:1,y:0}});assert.equal(renderer.aimRing.position.x,-AIM_AREA.x);
  assert(PITCH_AIM_AREA.x>1.02);assert.equal(AIM_AREA.x,.65);
});


test('Fenway wall inner faces align with mirrored simulation segments and their exact heights', () => {
  const renderer=scene();renderer.setPark('fenway');renderer.scene.updateMatrixWorld(true);
  const segments=getWallSegments('fenway');assert.equal(renderer.wallMeshes.length,segments.length);
  for(const [i,wall] of renderer.wallMeshes.entries()){
    const data=segments[i],corners=[-.5,.5].map(x=>new THREE.Vector3(x,-.5,.5).applyMatrix4(wall.matrixWorld));
    const wanted=[new THREE.Vector3(-data.a.x,0,data.a.z),new THREE.Vector3(-data.b.x,0,data.b.z)];
    for(const point of wanted)assert(corners.some(p=>p.distanceTo(point)<1e-8),`wall ${data.zone} misses its authoritative face`);
    assert.equal(wall.scale.y,data.height);
  }
  assert(renderer.wallMeshes[0].scale.y>11);assert(renderer.wallMeshes.at(-1).scale.y<1);
  renderer.scene.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
});

test('switching parks releases static geometry and textures without rebuilding the players', () => {
  const renderer=scene();renderer.parkId='harbor';renderer.buildParkScene();
  const batter=renderer.batter,oldPark=renderer.parkGroup,oldBoard=renderer.board.texture;
  let geometryDisposals=0,textureDisposals=0,sharedDisposals=0;
  const owned=new Set();oldPark.traverse(o=>{if(o.geometry&&!Object.values(renderer.geometries).includes(o.geometry))owned.add(o.geometry);});
  for(const geometry of owned)geometry.addEventListener('dispose',()=>geometryDisposals++);
  oldBoard.addEventListener('dispose',()=>textureDisposals++);renderer.geometries.box.addEventListener('dispose',()=>sharedDisposals++);
  assert.equal(renderer.setPark('fenway'),true);assert.equal(oldPark.parent,null);assert.equal(renderer.batter,batter);assert.equal(batter.group.parent,renderer.scene);
  assert.equal(geometryDisposals,owned.size);assert.equal(textureDisposals,1);assert.equal(sharedDisposals,0);
  const fenwayGroup=renderer.parkGroup,count=renderer.scene.children.length;
  assert.equal(renderer.setPark('fenway'),false);assert.equal(renderer.parkGroup,fenwayGroup);
  renderer.setPark('harbor');assert.equal(fenwayGroup.parent,null);assert.equal(renderer.scene.children.length,count);assert.equal(renderer.batter,batter);
});

test('compatibility park walls use simulation coordinates and keep the selected venue in menu previews', () => {
  const renderer=new CompatibilityRenderer(canvas());renderer.setPark('fenway');
  const surfaces=renderer.wallSurfaces,segments=getWallSegments('fenway');assert.equal(surfaces.length,segments.length);
  for(const [i,surface] of surfaces.entries()){
    assert.deepEqual(surface.points[0],{x:segments[i].a.x,y:0,z:segments[i].a.z});
    assert.deepEqual(surface.points[2],{x:segments[i].b.x,y:segments[i].height,z:segments[i].b.z});
  }
  assert.equal(renderer.setPark('fenway'),false);assert.equal(renderer.wallSurfaces,surfaces);
  renderer.render(null,1/60,{menu:true});assert.equal(renderer.parkId,'fenway');
  const fenwayFaceCount=renderer.static.length;renderer.setPark('harbor');renderer.setPark('fenway');assert.equal(renderer.static.length,fenwayFaceCount);
});
