import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings,loadSettings,saveSettings,loadProgress,DEFAULTS } from '../public/settings.mjs';
import { FlightControls } from '../public/controls.mjs';

test('preferences recover from blocked storage and malformed data without losing bounded controls',()=>{
  const broken={getItem(){throw Error('Private storage');},setItem(){throw Error('Quota');}};
  assert.deepEqual(loadSettings(broken),DEFAULTS);assert.equal(saveSettings(DEFAULTS,broken),false);
  const s=normalizeSettings({stickSize:999,buttonSize:-10,offsetY:Infinity,sensitivity:NaN,assist:'unsafe',sound:'false',leftHanded:true});
  assert.equal(s.stickSize,152);assert.equal(s.buttonSize,44);assert.equal(s.offsetY,22);assert.equal(s.sensitivity,1);assert.equal(s.assist,'assisted');assert.equal(s.sound,true);assert.equal(s.leftHanded,true);
  assert.deepEqual(loadProgress(broken),{completed:{},lastMission:null,totalTime:0});
});

class Surface {
  constructor(){this.handlers={};this.style={};this.value=0;this.classList={add(){},remove(){}};}
  addEventListener(name,fn){(this.handlers[name]||=[]).push(fn);}
  removeEventListener(name,fn){this.handlers[name]=(this.handlers[name]||[]).filter(f=>f!==fn);}
  dispatch(name,event={}){for(const fn of this.handlers[name]||[])fn({preventDefault(){},target:{closest(){return false;}},...event});}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  setPointerCapture(){}
}
test('flight and look accept separate pointers; firing never starts from looking; pointer cancellation clears input',()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window=new Surface();globalThis.document=new Surface();
  const stick=new Surface(),knob=new Surface(),look=new Surface(),fire=new Surface(),throttle=new Surface();
  const c=new FlightControls({stick,knob,look,fire,throttle,settings:{...DEFAULTS}});c.setActive(true);
  stick.dispatch('pointerdown',{pointerId:1,clientX:88,clientY:50});look.dispatch('pointerdown',{pointerId:2,clientX:50,clientY:50});look.dispatch('pointermove',{pointerId:2,clientX:70,clientY:50});
  let input=c.read(1/60);assert.ok(input.roll>.9);assert.equal(input.fire,false);assert.ok(c.lookX>0);
  stick.dispatch('pointercancel',{pointerId:1});assert.equal(c.read(1/60).roll,0);
  fire.dispatch('pointerdown',{pointerId:3});assert.equal(c.read(1/60).fire,true);fire.dispatch('lostpointercapture',{pointerId:3});assert.equal(c.read(1/60).fire,false);
  globalThis.window.dispatch('keydown',{code:'KeyW'});assert.equal(c.read(1/60).pitch,1);globalThis.window.dispatch('blur');assert.equal(c.read(1/60).pitch,0);
  c.destroy();globalThis.window=oldWindow;globalThis.document=oldDocument;
});

test('keyboard throttle uses elapsed time and pause clears held inputs',()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=new Surface();globalThis.document=new Surface();
  const s=()=>new Surface(),c=new FlightControls({stick:s(),knob:s(),look:s(),fire:s(),throttle:s(),settings:{...DEFAULTS}});c.setActive(true);
  globalThis.window.dispatch('keydown',{code:'ShiftLeft'});for(let i=0;i<60;i++)c.read(1/60);assert.ok(Math.abs(c.throttleValue-.35)<1e-8);
  c.setActive(false);c.setActive(true);const previous=c.throttleValue;c.read(1);assert.equal(c.throttleValue,previous);
  c.settings.invertPitch=true;globalThis.window.dispatch('keydown',{code:'ArrowUp'});assert.equal(c.read(1/60).pitch,-1);
  c.destroy();globalThis.window=oldWindow;globalThis.document=oldDocument;
});
