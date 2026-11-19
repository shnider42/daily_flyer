import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameCursor} from '../dist/game-cursor.mjs';

class Events {
  listeners=new Map();
  addEventListener(type,handler){const group=this.listeners.get(type)||new Set();group.add(handler);this.listeners.set(type,group);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  emit(type,event={}){for(const handler of this.listeners.get(type)||[])handler(event);}
}
function setup(){
  const canvas=new Events(),document=new Events(),window=new Events();
  canvas.dataset={};canvas.getBoundingClientRect=()=>({left:10,top:20,right:210,bottom:180});
  document.hidden=false;document.hasFocus=()=>true;
  const state={active:true,aiming:true};
  const cursor=createGameCursor({canvas,document,window,active:()=>state.active,aiming:()=>state.aiming});
  const move=(extra={})=>canvas.emit('pointermove',{pointerType:'mouse',clientX:100,clientY:90,...extra});
  return {canvas,document,window,state,cursor,move};
}

test('world mouse gets a compact aiming cursor and restores the native pointer for blocked play',()=>{
  const f=setup();
  assert.equal(f.cursor.update(),null,'a keyboard-only start does not change the pointer');
  f.move();assert.equal(f.canvas.dataset.gameCursor,'aim');
  f.state.aiming=false;f.cursor.update();assert.equal(f.canvas.dataset.gameCursor,'navigate');
  // The application supplies the same guard for menus, pause, view controls,
  // recovery, and pending actions. Each frame can restore the pointer in place.
  f.state.active=false;f.cursor.update();assert.equal(f.canvas.dataset.gameCursor,undefined);
  f.state.active=true;f.cursor.update();assert.equal(f.canvas.dataset.gameCursor,'navigate');
  f.canvas.emit('pointerleave');assert.equal(f.canvas.dataset.gameCursor,undefined);
  f.cursor.dispose();
});

test('touch, capture outside the canvas, hidden documents and lost focus never keep a game cursor',()=>{
  const f=setup();
  f.move();f.move({pointerType:'touch'});assert.equal(f.canvas.dataset.gameCursor,undefined);
  f.move();f.move({clientX:240});assert.equal(f.canvas.dataset.gameCursor,undefined,'captured pointer movement outside restores native cursor');
  f.move();f.window.emit('blur');assert.equal(f.canvas.dataset.gameCursor,undefined);
  f.move();assert.equal(f.canvas.dataset.gameCursor,undefined,'background pointer events cannot reactivate it');
  f.window.emit('focus');f.move();assert.equal(f.canvas.dataset.gameCursor,'aim');
  f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.canvas.dataset.gameCursor,undefined);
  f.move();assert.equal(f.canvas.dataset.gameCursor,undefined);
  f.document.hidden=false;f.document.emit('visibilitychange');f.cursor.update();assert.equal(f.canvas.dataset.gameCursor,undefined,'resuming does not reuse a stale hover');
  f.move();assert.equal(f.canvas.dataset.gameCursor,'aim');
  f.cursor.dispose();
});

test('cursor updates leave controls, pointer ownership and UI nodes untouched and clean up listeners',()=>{
  const f=setup();let prevented=0,captured=0;
  f.canvas.setPointerCapture=()=>captured++;
  f.canvas.emit('pointerdown',{pointerType:'mouse',clientX:100,clientY:90,preventDefault:()=>prevented++});
  assert.equal(f.canvas.dataset.gameCursor,'aim');assert.equal(prevented,0);assert.equal(captured,0);
  const before=JSON.stringify(f.canvas.dataset);for(let i=0;i<100;i++)f.cursor.update();assert.equal(JSON.stringify(f.canvas.dataset),before);
  f.cursor.dispose();assert.equal(f.canvas.dataset.gameCursor,undefined);
  for(const target of [f.canvas,f.document,f.window])assert.ok([...target.listeners.values()].every(group=>group.size===0));
  f.move();assert.equal(f.cursor.update(),null);
});
