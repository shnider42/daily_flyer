import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGameButton, protectGameSurface, setGameButtonEnabled} from '../../daily_flyer/themes/pocket_gridiron_assets/controls.js';

class Button extends EventTarget {
  disabled=false;
  attrs=new Map();
  getAttribute(key){return this.attrs.get(key)??null;}
  setAttribute(key,value){this.attrs.set(key,value);}
}
function fire(target,type,props={}){
  const event=new Event(type,{cancelable:true});
  Object.assign(event,props);
  target.dispatchEvent(event);
  return event;
}
test('a receiver responds to the second thumb once, without a compatibility-click repeat',()=>{
  const button=new Button();let throws=0;
  bindGameButton(button,()=>throws++);
  assert.equal(fire(button,'pointerdown',{pointerType:'touch',isPrimary:false,button:0}).defaultPrevented,true);
  assert.equal(throws,1);
  fire(button,'click',{detail:1});
  assert.equal(throws,1);
  fire(button,'pointerdown',{pointerType:'touch',isPrimary:false,button:0});
  fire(button,'click',{detail:2});
  assert.equal(throws,2);
});
test('cooldown taps are consumed without an action, then controls re-enable',()=>{
  const button=new Button();let calls=0;
  bindGameButton(button,()=>calls++);
  setGameButtonEnabled(button,false);
  for(let i=0;i<20;i++)assert.equal(fire(button,'pointerdown',{pointerType:'touch'}).defaultPrevented,true);
  fire(button,'click',{detail:0});
  assert.equal(calls,0);
  assert.equal(button.disabled,false);
  setGameButtonEnabled(button,true);
  fire(button,'pointerdown',{pointerType:'touch'});
  assert.equal(calls,1);
});
test('keyboard and assistive clicks work; secondary mouse buttons do not activate',()=>{
  const button=new Button();let calls=0;
  bindGameButton(button,()=>calls++);
  fire(button,'click',{detail:0});
  fire(button,'pointerdown',{pointerType:'mouse',button:2});
  assert.equal(calls,1);
  button.disabled=true;
  fire(button,'click',{detail:0});
  assert.equal(calls,1);
});
test('game surfaces cancel browser gestures while unrelated surfaces remain available',()=>{
  const game=new EventTarget(),menu=new EventTarget();
  protectGameSurface(game);
  for(const type of ['touchstart','touchmove','touchend','dblclick','contextmenu','gesturestart']){
    assert.equal(fire(game,type).defaultPrevented,true,type);
    assert.equal(fire(menu,type).defaultPrevented,false,type);
  }
});
