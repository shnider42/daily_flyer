import test from 'node:test';
import assert from 'node:assert/strict';
import {Controls,inputVector} from '../dist/input.mjs';

test('desktop ship controls separate thrust, braking, strafe and rotation while walking stays unchanged',()=>{
  const flight=inputVector({keys:new Set(['KeyW','KeyA','ArrowRight'])});
  assert.equal(flight.thrust,1);assert.equal(flight.strafe,-1);assert.equal(flight.turn,1);
  const brake=inputVector({keys:new Set(['KeyS'])});assert.equal(brake.thrust,-1);assert.equal(brake.strafe,0);assert.equal(brake.turn,0);
  const arrows=inputVector({keys:new Set(['ArrowUp','ArrowLeft'])});assert.equal(arrows.thrust,1);assert.equal(arrows.strafe,0);assert.equal(arrows.turn,-1);
  const walk=inputVector({mode:'person',keys:new Set(['KeyW','KeyD'])});assert.ok(Math.abs(walk.x-Math.SQRT1_2)<1e-12);assert.ok(Math.abs(walk.y+Math.SQRT1_2)<1e-12);assert.equal(walk.turn,0);assert.equal(walk.thrust,0);
});

test('mobile left stick supplies local jets and aim-stick up fires while turning',()=>{
  const v=inputVector({move:{x:.5,y:-1},aim:{x:.6,y:-.8}});
  assert.equal(v.thrust,1);assert.equal(v.strafe,.5);assert.equal(v.turn,.6);assert.equal(v.fire,true);assert.equal(v.aimY,-.8);
  assert.equal(inputVector({aim:{x:1,y:0}}).fire,false);
  assert.equal(inputVector({mode:'person',aim:{x:0,y:-.7}}).fire,true);
});

class Surface {
  constructor(){this.listeners={};this.style={};this.captured=new Set();this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
  emit(type,values={}){const event={pointerId:0,pointerType:'touch',button:0,clientX:50,clientY:50,cancelable:true,preventDefault(){},target:this,...values};for(const fn of this.listeners[type]||[])fn(event);}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);this.emit('lostpointercapture',{pointerId:id});}
}

test('independent touch ownership survives one stick or fire pointer being cancelled',()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window=new Surface();globalThis.document=new Surface();
  try{
    const stick=new Surface(),aimStick=new Surface(),fire=new Surface(),mine=new Surface(),boost=new Surface(),knob=new Surface(),aimKnob=new Surface();
    const commands=[];const controls=new Controls({stick,knob,aimStick,aimKnob,fire,mine,boost,active:()=>true,onCommand:c=>commands.push(c),getMode:()=> 'ship'});
    stick.emit('pointerdown',{pointerId:11,clientX:50,clientY:14});aimStick.emit('pointerdown',{pointerId:22,clientX:86,clientY:14});fire.emit('pointerdown',{pointerId:33});
    assert.equal(controls.vector().thrust,1);assert.ok(controls.vector().turn>.6);assert.equal(controls.vector().fire,true);assert.deepEqual(commands,['primaryDown']);
    aimStick.emit('pointercancel',{pointerId:999});assert.equal(controls.aimOwner,22);
    fire.emit('pointercancel',{pointerId:33});assert.equal(controls.vector().fire,true,'Aim-stick firing remains held');assert.equal(controls.vector().thrust,1);
    stick.emit('pointercancel',{pointerId:11});assert.equal(controls.vector().thrust,0);assert.ok(controls.vector().turn>.6);assert.equal(controls.vector().fire,true);
    controls.clear();assert.equal(controls.owner,null);assert.equal(controls.aimOwner,null);assert.equal(controls.vector().fire,false);assert.equal(controls.vector().turn,0);assert.equal(controls.held.size,0);
  }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});

// EventTarget gives these controls real event dispatch / preventDefault semantics.
// Geometry and pointer capture are the only browser facilities that need doubles.
class ControlSurface extends EventTarget {
 constructor(){
  super();this.style={};this.captures=new Set();this.classes=new Set();
  this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
 }
 emit(type,values={}){
  const e=new Event(type,{cancelable:true});
  Object.assign(e,{pointerType:'touch',button:0,clientX:50,clientY:50,...values});
  this.dispatchEvent(e);
  if((type==='pointerup'||type==='pointercancel')&&this.hasPointerCapture(e.pointerId))this.releasePointerCapture(e.pointerId);
  return e;
 }
 getBoundingClientRect(){return{left:0,top:0,width:100,height:100};}
 setPointerCapture(id){this.captures.add(id);}
 hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){if(this.captures.delete(id))this.emit('lostpointercapture',{pointerId:id});}
}
function fixture(){
 globalThis.window=new ControlSurface();globalThis.document=new ControlSurface();document.hidden=false;
 const elements=Object.fromEntries(['stick','knob','fire','mine','boost'].map(name=>[name,new ControlSurface()]));
 const commands=[];let active=true;
 const controls=new Controls({...elements,active:()=>active,onCommand:name=>commands.push(name)});
 return{...elements,controls,commands,deactivate:()=>{active=false;}};
}
const idle={x:0,y:0,thrust:0,strafe:0,turn:0,aimX:0,aimY:0,aiming:false,fire:false,mine:false,boost:false,brake:false};

test('boarding keyboard aim is independent of walking and does not shoot until fire is held',()=>{
 const walkAndAim=inputVector({mode:'person',combat:true,keys:new Set(['KeyW','ArrowRight'])});
 assert.equal(walkAndAim.y,-1);assert.equal(walkAndAim.x,0);
 assert.equal(walkAndAim.aimX,1);assert.equal(walkAndAim.aimY,0);assert.equal(walkAndAim.aiming,true);assert.equal(walkAndAim.fire,false);
 assert.equal(inputVector({mode:'person',combat:true,keys:new Set(['ArrowRight','Space'])}).fire,true);
 const assisted=inputVector({mode:'person',combat:true,keys:new Set(['Space'])});
 assert.equal(assisted.fire,true);assert.equal(assisted.aiming,false,'Fire alone leaves selection to the marked aim-assist target');
 const ordinaryWalk=inputVector({mode:'person',keys:new Set(['ArrowRight'])});
 assert.equal(ordinaryWalk.x,1);assert.equal(ordinaryWalk.aiming,false,'Outside combat the arrows still walk');
});

test('boarding touch aim fires in every direction while the left stick keeps walking',()=>{
 for(const aim of[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
  const vector=inputVector({mode:'person',combat:true,move:{x:-.6,y:.8},aim});
  assert.equal(vector.x,-.6);assert.equal(vector.y,.8);assert.equal(vector.aiming,true);assert.equal(vector.fire,true);
  assert.equal(vector.aimX,aim.x);assert.equal(vector.aimY,aim.y);
 }
 assert.equal(inputVector({mode:'person',combat:true,aim:{x:.1,y:.1}}).fire,false,'The thumbstick center has a deliberate firing deadzone');
 const released=inputVector({mode:'person',combat:true,move:{x:0,y:-1}});
 assert.equal(released.y,-1);assert.equal(released.aiming,false);assert.equal(released.fire,false);
});

test('touch controls keep independent owners and ignore another finger’s release',()=>{
 const{stick,fire,mine,controls,commands}=fixture();
 stick.emit('pointerdown',{pointerId:1,clientX:86});
 fire.emit('pointerdown',{pointerId:2});mine.emit('pointerdown',{pointerId:3});
 assert.equal(controls.vector().x,1);assert.equal(controls.vector().fire,true);assert.equal(controls.vector().mine,true);
 stick.emit('pointerdown',{pointerId:4,clientX:14});stick.emit('pointermove',{pointerId:4,clientX:14});fire.emit('pointerup',{pointerId:4});
 assert.equal(controls.vector().x,1);assert.equal(controls.vector().fire,true);
 mine.emit('pointercancel',{pointerId:3});assert.equal(controls.vector().mine,false);assert.equal(controls.vector().fire,true);assert.equal(controls.vector().x,1);
 stick.releasePointerCapture(1);assert.equal(controls.vector().x,0);assert.equal(controls.vector().fire,true);
 fire.emit('pointerup',{pointerId:2});assert.deepEqual(controls.vector(),idle);assert.deepEqual(commands,['primaryDown']);
});

test('layout/modal clear releases all inputs and a stale cancellation cannot cancel a new touch',()=>{
 const{stick,knob,fire,boost,controls}=fixture();
 window.emit('keydown',{code:'KeyW'});window.emit('keydown',{code:'ShiftLeft'});
 stick.emit('pointerdown',{pointerId:10,clientX:86});fire.emit('pointerdown',{pointerId:11});boost.emit('pointerdown',{pointerId:12});
 controls.clear();assert.deepEqual(controls.vector(),idle);assert.equal(knob.style.transform,'translate(0,0)');
 for(const el of[stick,fire,boost]){assert.equal(el.captures.size,0);assert.equal(el.classes.has('held'),false);}
 fire.emit('pointerdown',{pointerId:13});fire.emit('lostpointercapture',{pointerId:11});stick.emit('pointermove',{pointerId:10,clientX:14});
 assert.equal(controls.vector().fire,true);assert.equal(controls.vector().x,0);
 fire.emit('pointercancel',{pointerId:13});assert.deepEqual(controls.vector(),idle);
});

test('window blur and page hiding release keyboard and touch holds',()=>{
 const{fire,mine,controls}=fixture();
 window.emit('keydown',{code:'KeyD'});fire.emit('pointerdown',{pointerId:20});
 window.emit('blur');assert.deepEqual(controls.vector(),idle);assert.equal(fire.captures.size,0);
 mine.emit('pointerdown',{pointerId:21});window.emit('keydown',{code:'Space'});
 document.hidden=true;document.emit('visibilitychange');assert.deepEqual(controls.vector(),idle);assert.equal(mine.captures.size,0);
});

test('one primary press dispatches one command; input sampling and compatibility clicks do not repeat it',()=>{
 const{fire,controls,commands,deactivate}=fixture();
 fire.emit('pointerdown',{pointerId:30});assert.deepEqual(commands,['primaryDown']);
 for(let i=0;i<4;i++)assert.equal(controls.vector().fire,true);
 fire.emit('pointermove',{pointerId:30});fire.emit('pointerdown',{pointerId:31});fire.emit('click',{detail:1});
 assert.deepEqual(commands,['primaryDown']);
 fire.emit('pointerup',{pointerId:30});fire.emit('click',{detail:1});assert.equal(controls.vector().fire,false);assert.deepEqual(commands,['primaryDown']);
 fire.emit('click',{detail:0});assert.deepEqual(commands,['primaryDown','primaryDown']);assert.equal(controls.vector().fire,false);
 fire.emit('pointerdown',{pointerId:32,pointerType:'mouse',button:2});assert.equal(controls.vector().fire,false);
 deactivate();fire.emit('pointerdown',{pointerId:33});fire.emit('click',{detail:0});assert.deepEqual(commands,['primaryDown','primaryDown']);
});
