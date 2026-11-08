import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../dist/input.mjs';

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
const idle={x:0,y:0,fire:false,mine:false,boost:false,brake:false};

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
