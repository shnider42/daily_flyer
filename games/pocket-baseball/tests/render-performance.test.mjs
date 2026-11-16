import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { BallparkRenderer } from '../public/renderer.mjs';
import { BaseballGame } from '../public/engine.mjs';
import { getRoster } from '../public/rosters.mjs';

// These checks measure allocations and buffer lifecycle, not browser/GPU FPS.
const context = new Proxy({}, { get: (target, key) => key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({addColorStop() {}}) : target[key] ?? (() => {}), set: (target, key, value) => (target[key] = value, true) });
const canvas = () => ({ width: 1, height: 1, clientWidth: 430, clientHeight: 932, getContext: () => context, removeEventListener() {} });
globalThis.document = { createElement: canvas };
globalThis.devicePixelRatio = 1;
function scene() {
  const renderer = Object.create(BallparkRenderer.prototype);
  Object.assign(renderer, { canvas: canvas(), width: 430, height: 932, dpr: 1, quality: 'auto', touch: true,
    frameAverage: 1/60, adaptiveScale: 1, frameCount: 0, menuTime: 0, lastTick: -1,
    models: new Map(), runnerModels: [], lastBoard: '', wasMenu: true, materials: new Map(),
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(51,430/932,.075,700),
    look: new THREE.Vector3(), targetCamera: new THREE.Vector3(), targetLook: new THREE.Vector3(), scratch: new THREE.Vector3(),
    geometries: { box: new THREE.BoxGeometry(1,1,1), sphere: new THREE.SphereGeometry(1,10,8),
      cylinder: new THREE.CylinderGeometry(1,1,1,8), plane: new THREE.PlaneGeometry(1,1), disc: new THREE.CircleGeometry(1,24) },
    renderer: { setSize() {}, setPixelRatio() {}, dispose() {}, render(s,c) { s.updateMatrixWorld(true); c.updateMatrixWorld(true); } }, updateBoard() {} });
  renderer.buildActors(); renderer.buildGuides(); renderer.buildEffects(); return renderer;
}

test('prepared rosters need no rig construction at contact, handedness changes, or defensive switches', async () => {
  const renderer = scene(); await renderer.prepare();
  const templateCount = renderer.playerTemplates.size;
  renderer.buildPlayer = () => { throw new Error('A live frame tried to rebuild a player rig'); };
  const state = new BaseballGame({mode:'practice'}).state;
  renderer.render(state, 1/60, {});
  state.batterIndex[0] = 1; renderer.render(state, 1/60, {});
  assert.equal(renderer.batter.hand, 'L');
  state.runners = [{id:50,number:7,x:18,z:20,prevX:18,prevZ:20,targetBase:1}];
  renderer.render(state, 1/60, {}); assert.equal(renderer.runnerModels[0].number, 7);
  state.battingSide = 1; state.fielders = []; renderer.render(state, 1/60, {});
  for (const side of [0,1]) {
    const roster=getRoster(side), home=side===1;
    for (const person of [...roster.lineup,...roster.bench]) {
      for (const hand of person.bats==='S'?['R','L']:[person.bats]) renderer.releaseModel(renderer.player(home,person.number,true,'batter',hand));
      renderer.releaseModel(renderer.player(home,person.number,false,'runner','R'));
    }
    for (const person of roster.pitchers) renderer.releaseModel(renderer.player(home,person.number,false,'pitcher',person.throws));
  }
  assert.equal(renderer.playerTemplates.size, templateCount);
});

test('cached players share GPU geometry, retain independent poses and labels, and release resources only at disposal', () => {
  const renderer=scene(), first=renderer.player(false,1,true,'batter','R'), second=renderer.player(false,5,true,'batter','R');
  assert.notEqual(first.group,second.group); assert.notEqual(first.rightHand,second.rightHand);
  assert.equal(first.ownedGeometries[0],second.ownedGeometries[0]);
  assert.notEqual(first.frontLabel.material,second.frontLabel.material);
  first.rightHand.position.x=.3; assert.notEqual(second.rightHand.position.x,.3);
  let disposals=0; first.ownedGeometries[0].addEventListener('dispose',()=>disposals++);
  renderer.releaseModel(first); renderer.releaseModel(second); assert.equal(disposals,0);
  renderer.dispose(); assert.equal(disposals,1);
});

test('steady rendering avoids layout reads and defers adaptive buffer changes until a dead ball', async () => {
  const renderer=scene(); await renderer.prepare(); const state=new BaseballGame({mode:'practice'}).state;
  let reads=0,resizes=0;
  Object.defineProperties(renderer.canvas,{clientWidth:{get(){reads++;return 430;}},clientHeight:{get(){reads++;return 932;}}});
  renderer.renderer.setSize=()=>resizes++;
  state.phase='pitch'; renderer.frameAverage=.05; renderer.qualityAge=2;
  for(let i=0;i<10;i++) renderer.render(state,.05,{});
  assert.equal(reads,0); assert.equal(resizes,0); assert.equal(renderer.adaptiveScale,1); assert(renderer.pendingScale<1);
  state.phase='result'; renderer.render(state,.05,{});
  assert.equal(resizes,1); assert.equal(reads,2); assert(renderer.adaptiveScale<1);
  for(let i=0;i<10;i++) renderer.render(state,1/60,{});
  assert.equal(reads,2); assert.equal(resizes,1);
});

test('Automatic bounds render pixels at large viewports while Sharp keeps its explicit quality choice', () => {
  const renderer=scene(); renderer.canvas.clientWidth=2560; renderer.canvas.clientHeight=1440; renderer.touch=false;
  globalThis.devicePixelRatio=2;
  renderer.resize(true); const automatic=renderer.getDiagnostics();
  assert(automatic.width*automatic.height<=1600000); assert.equal(automatic.kind,'webgl');
  renderer.setQuality('high'); const sharp=renderer.getDiagnostics();
  assert.equal(sharp.width,5120); assert.equal(sharp.height,2880);
  renderer.setQuality('low'); const low=renderer.getDiagnostics(); assert(low.width*low.height<=1000000);
  globalThis.devicePixelRatio=1;
});
