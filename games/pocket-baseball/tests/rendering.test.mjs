import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { BallparkRenderer, samplePlayerMotion } from '../public/renderer.mjs';
import { BaseballGame, pitchPosition } from '../public/engine.mjs';

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
