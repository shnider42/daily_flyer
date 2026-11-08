import test from 'node:test';
import assert from 'node:assert/strict';
import {GunnerControls} from '../public/gunner-controls.mjs';
import {GUNSHIP_AIM_LIMITS} from '../public/gunship.mjs';
import {normalizeSettings,loadSettings,saveSettings} from '../public/settings.mjs';
import {DEFAULT_GUNNER_BINDINGS,DEFAULT_KEY_BINDINGS,normalizeGunnerBindings} from '../public/keybindings.mjs';

class Surface{
  constructor(tag='DIV'){this.tag=tag;this.events=new Map();this.style={};this.captures=new Set();this.classList={add(){},remove(){}};}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  dispatch(type,event={}){const e={target:this,button:0,preventDefault(){this.defaultPrevented=true;},...event};for(const fn of this.events.get(type)||[])fn(e);return e;}
  closest(){return this.tag==='INPUT'?this:null;}
  getBoundingClientRect(){return {width:100,height:100};}
  setPointerCapture(id){this.captures.add(id);}
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){this.captures.delete(id);}
}
function withGunner(run){
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  const window=globalThis.window=new Surface(),document=globalThis.document=new Surface();window.visualViewport=new Surface();
  const elements={surface:new Surface(),pad:new Surface(),knob:new Surface(),fire:new Surface()};
  const edges=[],actions=[],cancellations=[];let pauses=0;
  const c=new GunnerControls({...elements,settings:normalizeSettings(),onPress:()=>edges.push(c.read(0).fire),onRelease:()=>edges.push(c.read(0).fire),onAction:(...a)=>actions.push(a),onPause:()=>pauses++,onCancel:()=>cancellations.push(c.read(0).fire)});
  c.setActive(true);
  try{return run({c,window,document,...elements,edges,actions,cancellations,get pauses(){return pauses;}});}
  finally{c.destroy();globalThis.window=oldWindow;globalThis.document=oldDocument;}
}

test('two thumbs aim and fire independently, without aircraft flight inputs or a release jump',()=>withGunner(({c,pad,fire})=>{
  pad.dispatch('pointerdown',{pointerId:1,pointerType:'touch',clientX:35,clientY:67});
  assert.equal(c.read(.1).yaw,0,'touch placement is neutral');
  pad.dispatch('pointermove',{pointerId:1,clientX:73,clientY:29});
  fire.dispatch('pointerdown',{pointerId:2,pointerType:'touch'});
  const aimed=c.read(.1);assert.ok(aimed.yaw>0&&aimed.pitch>0);assert.equal(aimed.fire,true);
  for(const key of ['roll','throttle','flightPitch'])assert.equal(key in aimed,false);
  fire.dispatch('pointerup',{pointerId:2});assert.equal(c.read(0).fire,false);
  const before=c.yaw;c.read(.1);assert.ok(c.yaw>before,'releasing fire does not release aim');
  pad.dispatch('pointerup',{pointerId:1});const held=c.read(0);c.read(.1);assert.equal(c.yaw,held.yaw);assert.equal(c.pitch,held.pitch);
  assert.equal(pad.captures.size,0);assert.equal(fire.captures.size,0);
}));

test('a short mouse, touch or keyboard tap emits press and release even between animation frames',()=>withGunner(({c,surface,fire,window,edges})=>{
  const inputs=[()=>{surface.dispatch('pointerdown',{pointerId:1,pointerType:'mouse',clientX:40,clientY:50});surface.dispatch('pointerup',{pointerId:1});},()=>{fire.dispatch('pointerdown',{pointerId:2,pointerType:'touch'});fire.dispatch('pointerup',{pointerId:2});},()=>{window.dispatch('keydown',{code:'Space'});window.dispatch('keyup',{code:'Space'});}];
  for(const tap of inputs){edges.length=0;tap();assert.deepEqual(edges,[true,false]);assert.equal(c.read(0).fire,false);}
}));

test('mouse aim follows screen direction, stays within gun limits and zoom reduces movement sensitivity',()=>withGunner(({c,surface})=>{
  surface.dispatch('pointermove',{pointerType:'mouse',clientX:50,clientY:50});assert.equal(c.yaw,0);
  surface.dispatch('pointermove',{pointerType:'mouse',clientX:90,clientY:20});assert.ok(c.yaw>0&&c.pitch>0);
  const unzoomed=c.yaw;c.recenter();c.toggleZoom();
  surface.dispatch('pointermove',{pointerType:'mouse',clientX:50,clientY:50});surface.dispatch('pointermove',{pointerType:'mouse',clientX:90,clientY:20});assert.ok(c.yaw<unzoomed);
  for(let i=0;i<100;i++)surface.dispatch('pointermove',{pointerType:'mouse',clientX:100+i*100,clientY:-100-i*100});
  assert.equal(c.yaw,GUNSHIP_AIM_LIMITS.yawMax);assert.equal(c.pitch,GUNSHIP_AIM_LIMITS.pitchMax);
  const saved=c.read(0);surface.dispatch('pointermove',{pointerType:'touch',clientX:0,clientY:100});assert.deepEqual(c.read(0),saved,'a stray touch cannot steal the aim pad');
}));

test('switching station releases held fire and keeps sight orientation; invalid seats are ignored',()=>withGunner(({c,window,fire,actions})=>{
  c.yaw=.2;c.pitch=-.1;fire.dispatch('pointerdown',{pointerId:2,pointerType:'touch'});assert.equal(c.read(0).fire,true);
  window.dispatch('keydown',{code:'Digit3'});assert.equal(c.seat,'105mm');assert.equal(c.yaw,.2);assert.equal(c.pitch,-.1);assert.equal(c.read(0).fire,false);assert.equal(fire.captures.size,0);
  assert.deepEqual(actions.at(-1),['seat','105mm']);c.selectSeat('invalid');assert.equal(c.seat,'105mm');
  window.dispatch('keydown',{code:'Digit1'});assert.equal(c.seat,'25mm');window.dispatch('keydown',{code:'Digit2'});assert.equal(c.seat,'40mm');
}));

test('pause, blur, lost capture and reconnect deactivation cannot leave the trigger held',()=>withGunner(({c,window,document,pad,fire,surface})=>{
  for(const release of [()=>window.dispatch('blur'),()=>document.dispatch('visibilitychange'),()=>c.setActive(false)]){
    document.hidden=true;c.setActive(true);window.dispatch('keydown',{code:'Space'});pad.dispatch('pointerdown',{pointerId:1,clientX:50,clientY:50});fire.dispatch('pointerdown',{pointerId:2});
    release();assert.equal(c.read(0).fire,false);assert.equal(pad.captures.size,0);assert.equal(fire.captures.size,0);
    c.setActive(true);window.dispatch('keydown',{code:'Space',repeat:true});assert.equal(c.read(0).fire,false,'resume requires a new key press');
  }
  surface.dispatch('pointerdown',{pointerId:3,pointerType:'mouse',clientX:4,clientY:5});surface.dispatch('lostpointercapture',{pointerId:3});assert.equal(c.read(0).fire,false);
  window.dispatch('keydown',{code:'Space'});window.dispatch('keydown',{code:'Escape'});assert.equal(c.read(0).fire,false);
}));

test('gunner remaps persist separately from pilot keys and respect forms/browser shortcuts',()=>withGunner(({c,window,document})=>{
  let data=JSON.stringify({keyBindings:{...DEFAULT_KEY_BINDINGS,fire:'KeyJ'},gunnerBindings:{...DEFAULT_GUNNER_BINDINGS,fire:'KeyK',seat105:'KeyJ'}});
  const storage={getItem(){return data;},setItem(k,v){data=v;}};
  c.settings=loadSettings(storage);assert.equal(c.settings.keyBindings.fire,'KeyJ');assert.equal(c.settings.gunnerBindings.seat105,'KeyJ');
  assert.equal(saveSettings(c.settings,storage),true);assert.deepEqual(loadSettings(storage),c.settings);
  window.dispatch('keydown',{code:'Space'});assert.equal(c.read(0).fire,false);window.dispatch('keydown',{code:'KeyK'});assert.equal(c.read(0).fire,true);
  window.dispatch('keydown',{code:'KeyJ'});assert.equal(c.seat,'105mm');assert.equal(c.read(0).fire,false);
  const text=new Surface('INPUT');document.dispatch('focusin',{target:text});const e=window.dispatch('keydown',{target:text,code:'ArrowUp'});assert.equal(!!e.defaultPrevented,false);assert.equal(c.read(.1).pitch,0);
  assert.equal(!!window.dispatch('keydown',{code:'KeyK',ctrlKey:true}).defaultPrevented,false);assert.equal(c.read(0).fire,false);
  assert.equal(normalizeGunnerBindings({aimUp:'Escape'}).aimUp,'ArrowUp');assert.equal(normalizeGunnerBindings({aimUp:'Space'}).fire,null);
}));


test('forced cancellation is distinct from a normal trigger release so quick taps still reach the host',()=>withGunner(({c,window,edges,cancellations})=>{
  window.dispatch('keydown',{code:'Space'});window.dispatch('keyup',{code:'Space'});assert.deepEqual(edges,[true,false]);assert.deepEqual(cancellations,[]);
  window.dispatch('keydown',{code:'Space'});c.setActive(false);assert.deepEqual(cancellations,[false]);assert.equal(c.read(0).fire,false);
  c.setActive(true);window.dispatch('keydown',{code:'Space'});window.dispatch('blur');assert.deepEqual(cancellations,[false,false]);
}));
