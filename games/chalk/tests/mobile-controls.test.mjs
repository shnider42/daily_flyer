import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {stickVector,touchIntent,GroundOrderTap,ThrowableDrag,thumbOrigin,thumbDisplayOrigin} from '../public/touch-input.mjs';
import {renderDensity} from '../public/settings.mjs';

// Execute the shipped app listeners and resize cleanup with two separate
// captured pointers. The fixture supplies geometry, not a second controller.
const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
const section=(start,end)=>{
  const from=app.indexOf(start),to=app.indexOf(end,from);
  assert.ok(from>=0&&to>from,`production section ${start} exists`);
  return app.slice(from,to);
};
const listeners=section('function bindStick(element, kind)','function screenPoint(event)');
const clear=section('function clearInput()','function startMission(');
const resize=section('function fit()','function measureSafeInsets()');
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
class Surface{
  handlers=new Map();captured=new Set();released=[];
  classes=new Set();properties=new Map();
  constructor(bounds=rect(0,0,1,1)){
    this.bounds=bounds;
    this.style={setProperty:(key,value)=>this.properties.set(key,value),removeProperty:key=>this.properties.delete(key)};
    this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),
      contains:name=>this.classes.has(name),toggle:(name,on)=>{const enabled=on??!this.classes.has(name);if(enabled)this.classes.add(name);else this.classes.delete(name);return enabled;}};
  }
  getBoundingClientRect(){return this.bounds;}
  querySelector(selector){return selector==='.stick-base'?this.base:selector==='.stick-knob'?this.knob:null;}
  addEventListener(type,handler){this.handlers.set(type,[...this.handlers.get(type)||[],handler]);}
  setPointerCapture(id){this.captured.add(id);}
  releasePointerCapture(id){if(this.captured.delete(id)){this.released.push(id);this.emit('lostpointercapture',{pointerId:id});}}
  emit(type,values={}){
    const event={type,pointerId:1,pointerType:'touch',button:0,clientX:0,clientY:0,preventDefault(){this.prevented=true;},...values};
    for(const handler of this.handlers.get(type)||[])handler(event);return event;
  }
}
function fixture(){
  const viewport=new Surface(rect(0,0,390,844)),move=new Surface(rect(4,690,128.7,140)),aim=new Surface(rect(257.3,690,128.7,140));
  for(const pad of [move,aim]){pad.base=new Surface(rect(0,0,100,100));pad.knob=new Surface(rect(0,0,42,42));}
  const nodes={battlefield:viewport,moveStick:move,aimStick:aim,touchThrow:new Surface(),touchInteract:new Surface()};
  const state={
    $:id=>nodes[id],canvas:viewport,activeSticks:new Map(),stickVector,thumbOrigin,thumbDisplayOrigin,renderDensity,
    touchInput:{moveX:0,moveY:0,aimX:0,aimY:0,aimStrength:0,interact:false},
    pointer:{fire:false,valid:false},keys:new Set(),desktopPointerId:null,interactionPointer:null,
    touchAim:null,throwAim:null,observing:false,touch:true,mode:'playing',viewportSize:'',canvasRect:viewport.bounds,
    devicePixelRatio:3,preferences:{renderScale:'auto',graphicsQuality:'balanced'},
    actions:{reload:false,smoke:false,grenade:false,frag:false,flashbang:false},
    throwableDrag:new ThrowableDrag(),groundOrderTap:new GroundOrderTap(),
    document:{body:new Surface(),querySelectorAll:selector=>selector==='.stick-knob'?[move.knob,aim.knob]:selector==='.joystick'?[move,aim]:[]},
    renderer:{width:390,height:844,resize(width,height){this.width=width;this.height=height;}},
    online:()=>false,audio:{unlock(){}},text(){},measureSafeInsets(){},enabled:true,
  };
  state.canAct=()=>state.enabled;
  vm.runInNewContext(clear+'\n'+resize+'\n'+listeners,state);
  state.fit();return{state,move,aim,viewport};
}
function neutral(state){assert.equal(state.touchInput.moveX,0);assert.equal(state.touchInput.moveY,0);assert.equal(state.touchInput.aimX,0);assert.equal(state.touchInput.aimY,0);assert.equal(state.touchInput.aimStrength,0);}

test('actual move and aim handlers start neutral at pad edges and follow deliberate drag from touchdown',()=>{
  const {state,move,aim}=fixture();
  move.emit('pointerdown',{pointerId:1,clientX:7,clientY:824});
  aim.emit('pointerdown',{pointerId:2,clientX:383,clientY:824});neutral(state);
  assert.ok(Math.abs(parseFloat(move.properties.get('--stick-origin-x')))<=9.36);
  assert.ok(Math.abs(parseFloat(aim.properties.get('--stick-origin-x')))<=9.36);
  assert.ok(Math.abs(parseFloat(move.properties.get('--stick-origin-y')))<=15);
  move.emit('pointermove',{pointerId:1,clientX:7,clientY:812});
  assert.equal(state.touchInput.moveX,0);assert.ok(state.touchInput.moveY<0,'upward drag does not inherit an edge-induced sideways vector');
  aim.emit('pointermove',{pointerId:2,clientX:383,clientY:815});
  assert.equal(state.touchInput.aimX,0);assert.ok(state.touchInput.aimY<0);assert.equal(touchIntent(state.touchInput).firing,false);
  aim.emit('pointermove',{pointerId:2,clientX:383,clientY:800});assert.equal(touchIntent(state.touchInput).firing,true);
});

test('simultaneous captured sticks ignore another pointer and release independently without stale fire',()=>{
  const {state,move,aim}=fixture();
  move.emit('pointerdown',{pointerId:1,clientX:70,clientY:760});move.emit('pointermove',{pointerId:1,clientX:70,clientY:710});
  aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});aim.emit('pointermove',{pointerId:2,clientX:370,clientY:760});
  move.emit('pointerdown',{pointerId:3,clientX:10,clientY:760});assert.equal(state.activeSticks.size,2);
  aim.emit('pointercancel',{pointerId:3});assert.equal(touchIntent(state.touchInput).firing,true);
  aim.emit('pointercancel',{pointerId:2});assert.equal(touchIntent(state.touchInput).firing,false);assert.equal(state.touchInput.moveY,-1);
  assert.equal(aim.classes.has('active'),false);assert.equal(aim.properties.has('--stick-origin-x'),false);
  move.emit('lostpointercapture',{pointerId:1});neutral(state);assert.equal(state.activeSticks.size,0);
});

test('actual viewport resize releases both captured fingers and late movement cannot revive old input',()=>{
  const {state,move,aim,viewport}=fixture();
  move.emit('pointerdown',{pointerId:11,clientX:70,clientY:760});move.emit('pointermove',{pointerId:11,clientX:70,clientY:710});
  aim.emit('pointerdown',{pointerId:12,clientX:320,clientY:760});aim.emit('pointermove',{pointerId:12,clientX:370,clientY:760});
  state.fit();assert.equal(state.activeSticks.size,2,'unchanged resize measurements do not cancel held thumbs');
  viewport.bounds=rect(0,0,844,390);move.bounds=rect(47,245,136,124);aim.bounds=rect(661,245,136,124);
  move.base.bounds=aim.base.bounds=rect(0,0,96,96);state.fit();
  neutral(state);assert.equal(state.activeSticks.size,0);assert.deepEqual(move.released,[11]);assert.deepEqual(aim.released,[12]);
  move.emit('pointermove',{pointerId:11,clientX:100,clientY:280});aim.emit('pointermove',{pointerId:12,clientX:740,clientY:280});neutral(state);
  move.emit('pointerdown',{pointerId:13,clientX:60,clientY:350});assert.equal(state.touchInput.moveX,0);assert.equal(state.touchInput.moveY,0);
  assert.equal(state.activeSticks.get(13).radius,96*.34,'new gesture uses the actual landscape circle size');
});

test('blocked gameplay and malformed pointer coordinates do not capture a stick',()=>{
  const {state,move}=fixture();state.enabled=false;
  move.emit('pointerdown',{pointerId:1,clientX:60,clientY:750});assert.equal(state.activeSticks.size,0);
  state.enabled=true;move.emit('pointerdown',{pointerId:2,clientX:NaN,clientY:750});assert.equal(state.activeSticks.size,0);neutral(state);
});
