import assert from 'node:assert/strict';
import test from 'node:test';
import { appFixture } from './helpers/app-fixture.mjs';
import { createArenaMission } from '../public/arena.mjs';

test('the scene drags independently of flight controls and zoom follows the camera panel', async t=>{
  const {app,document,window,frame}=await appFixture(t);
  app.startMission(createArenaMission({mode:'freeflight'},'f16'));
  const scene=document.getElementById('view'),panel=document.getElementById('camera-panel');
  const pointer={pointerId:7,pointerType:'mouse',buttons:1,button:0};
  scene.dispatch('pointerdown',{...pointer,clientX:330,clientY:400});
  scene.dispatch('pointermove',{...pointer,clientX:450,clientY:360});
  frame();
  assert.ok(app.renderer.lastRender.options.lookX>.7);
  assert.ok(app.renderer.lastRender.options.lookY>.2);
  assert.equal(app.controls.read(0).fire,false);
  assert.equal(app.controls.read(0).roll,0);
  scene.dispatch('pointerup',pointer);
  frame();
  assert.equal(app.renderer.lastRender.options.lookX,0);
  assert.equal(scene.dispatch('wheel',{deltaY:1}).defaultPrevented,true);
  frame();
  assert.equal(app.renderer.lastRender.options.chaseZoom,1.05);

  document.getElementById('camera-button').onclick();
  assert.equal(panel.hidden,false);
  assert.equal(document.getElementById('camera-distance').value,'105');
  const cockpit=document.querySelector('[data-camera-mode="cockpit"]');
  cockpit.onclick();
  frame();
  assert.equal(app.renderer.lastRender.options.camera,'cockpit');
  assert.equal(document.getElementById('camera-distance').disabled,true);
  assert.equal(scene.dispatch('wheel',{deltaY:1}).defaultPrevented,false);
  window.dispatch('keydown',{code:'Escape'});
  assert.equal(panel.hidden,true);
  assert.equal(app.paused,false);
});

test('hold-angle mouse look can be reset with the current keyboard shortcut', async t=>{
  const {app,document,window,frame}=await appFixture(t);
  app.startMission(createArenaMission({mode:'freeflight'},'f16'));
  document.getElementById('settings-content').dispatch('input',{target:{dataset:{setting:'keepLookAngle'},type:'checkbox',checked:true}});
  const scene=document.getElementById('view'),pointer={pointerId:3,pointerType:'mouse',buttons:1,button:0};
  scene.dispatch('pointerdown',{...pointer,clientX:210,clientY:140});
  scene.dispatch('pointermove',{...pointer,clientX:380,clientY:140});
  scene.dispatch('pointerup',pointer);
  frame();assert.ok(app.renderer.lastRender.options.lookX>1);
  window.dispatch('keydown',{code:'KeyO'});
  frame();assert.equal(app.renderer.lastRender.options.lookX,0);
});
