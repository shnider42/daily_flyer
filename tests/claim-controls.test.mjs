import test from 'node:test';
import assert from 'node:assert/strict';
import {TouchControls, startControlStream, bindGameLifecycle, bindDesktopControls, preferTouchControls} from '../daily_flyer/themes/claim_denied_assets/controls.mjs';

class Surface extends EventTarget {
  style={};classes=new Set();captures=new Set();
  classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
  setPointerCapture(id){this.captures.add(id);}
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){this.captures.delete(id);this.emit('lostpointercapture',id);}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  emit(type,pointerId=1,clientX=50,clientY=50){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId,clientX,clientY});this.dispatchEvent(e);}
}
function setup(options={}){
  const stick=new Surface(),knob=new Surface(),look=new Surface();
  const buttons={fire:new Surface(),use:new Surface(),reload:new Surface()},turns=[];
  let active=true;
  const controls=new TouchControls({stick,knob,look,buttons,active:()=>active,onLook:(x,y)=>turns.push([x,y]),...options});
  return {stick,knob,look,buttons,turns,controls,setActive:v=>active=v};
}
test('move, look and fire retain independent fingers; stray lifts cannot cancel aiming',()=>{
  const {stick,look,buttons,turns,controls}=setup();
  stick.emit('pointerdown',1,50,18);look.emit('pointerdown',2,150,120);buttons.fire.emit('pointerdown',3);
  look.emit('pointerup',4);look.emit('pointermove',2,180,100);
  buttons.fire.emit('pointerup',4);
  assert.deepEqual(turns,[[30,-20]]);assert.equal(controls.stick.y,-1);assert.equal(controls.consume().fire,true);
  buttons.fire.emit('pointerup',3);assert.equal(controls.consume().fire,false);
  assert.equal(controls.stick.y,-1);look.emit('pointermove',2,185,100);assert.deepEqual(turns.at(-1),[5,0]);
});
test('looking never fires; a quick fire tap survives until a simulation/input tick',()=>{
  const {look,buttons,controls}=setup();
  look.emit('pointerdown',1);look.emit('pointermove',1,90,60);assert.equal(controls.consume().fire,false);
  buttons.fire.emit('pointerdown',2);buttons.fire.emit('pointerup',2);
  assert.equal(controls.consume().fire,true);assert.equal(controls.consume().fire,false);
});
test('pause/reset releases captures and allows a fresh aiming gesture',()=>{
  const {stick,look,buttons,turns,controls,setActive}=setup();
  stick.emit('pointerdown',1,0,50);look.emit('pointerdown',2);buttons.use.emit('pointerdown',3);
  controls.reset();setActive(false);look.emit('pointerdown',4);look.emit('pointermove',4,90,90);
  assert.equal(turns.length,0);assert.deepEqual(controls.stick,{x:0,y:0});assert.equal(controls.consume().use,false);
  assert.equal(look.captures.size,0);assert.equal(buttons.use.classes.size,0);
  setActive(true);look.emit('pointerdown',5);look.emit('pointermove',5,55,60);assert.deepEqual(turns,[[5,10]]);
});
test('a second finger cannot steal the movement stick; cancellation neutralizes it',()=>{
  const {stick,controls}=setup();stick.emit('pointerdown',1,18,50);stick.emit('pointerdown',2,82,50);
  stick.emit('pointerup',2);assert.equal(controls.stick.x,-1);
  stick.emit('pointercancel',1);assert.equal(controls.stick.x,0);
});
test('visible mobile focus changes keep the run and gesture active; backgrounding pauses',()=>{
  const window=new EventTarget(),document=new EventTarget();let resets=0;const reasons=[];
  bindGameLifecycle({window,document,touch:true,reset:()=>resets++,pause:r=>reasons.push(r),active:()=>true});
  window.dispatchEvent(new Event('blur'));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(resets,0);assert.deepEqual(reasons,[]);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(resets,1);assert.deepEqual(reasons,['background']);
});
test('desktop focus loss clears held keys without creating a synthetic background pause',()=>{
  const window=new EventTarget(),document=new EventTarget();let resets=0,pauses=0;
  bindGameLifecycle({window,document,touch:false,reset:()=>resets++,pause:()=>pauses++,active:()=>true});
  window.dispatchEvent(new Event('blur'));assert.equal(resets,1);assert.equal(pauses,0);
});
test('controls keep streaming with no animation frames and stop during pause',()=>{
  let tick,active=true,reads=0;const sent=[];
  startControlStream({active:()=>active,read:()=>({seq:reads++}),send:p=>sent.push(p),schedule:(fn,ms)=>{tick=fn;assert.equal(ms,1000/30);}});
  for(let i=0;i<90;i++)tick();assert.equal(sent.length,90);
  active=false;tick();assert.equal(reads,90);active=true;tick();assert.equal(sent.length,91);
});

test('desktop keyboard/mouse controls work and release cleanly; only actual lock loss pauses',()=>{
 const document=new Surface(),canvas=new Surface(),keys=new Set(),pulses={};const turns=[],weapons=[];let active=true,fire=false,pauses=0,locks=0;
 const reset=()=>{keys.clear();fire=false;};
 bindDesktopControls({document,canvas,keys,pulses,touch:false,lock:()=>locks++,pause:()=>{pauses++;active=false;reset();},reset,active:()=>active,onFire:v=>fire=v,onLook:(x,y)=>turns.push([x,y]),selectWeapon:w=>weapons.push(w)});
 const key=(type,code)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{code});document.dispatchEvent(e);};
 document.tagName='BODY';canvas.emit('click');assert.equal(locks,1);
 // Failed capture / unrelated lock notification must not open a pause dialog.
 document.emit('pointerlockchange');assert.equal(pauses,0);
 for(const code of ['KeyW','KeyA','KeyS','KeyD','ShiftLeft','KeyR','KeyE','Space','Digit2'])key('keydown',code);
 assert.ok(keys.has('KeyW')&&keys.has('KeyD')&&keys.has('ShiftLeft'));assert.deepEqual(pulses,{reload:true,use:true,fire:true});assert.deepEqual(weapons,['shotgun']);
 key('keyup','KeyW');assert.equal(keys.has('KeyW'),false);
 document.pointerLockElement=canvas;document.emit('pointerlockchange');
 const mouse=new Event('mousemove');Object.assign(mouse,{movementX:12,movementY:-4});document.dispatchEvent(mouse);assert.deepEqual(turns,[[12,-4]]);
 const down=new Event('mousedown');Object.assign(down,{button:0});canvas.dispatchEvent(down);assert.equal(fire,true);document.emit('mouseup');assert.equal(fire,false);
 document.pointerLockElement=null;document.emit('pointerlockchange');assert.equal(pauses,1);assert.equal(keys.size,0);
 key('keydown','KeyW');assert.equal(keys.size,0); // No held input accumulates behind the pause screen.
 active=true;key('keydown','Escape');assert.equal(pauses,2);
});
test('phones get the thumb pads while desktop and touchscreen laptops retain mouse controls',()=>{
 assert.equal(preferTouchControls({coarse:true,fine:false,touchPoints:5,force:false}),true);
 assert.equal(preferTouchControls({coarse:false,fine:true,touchPoints:0,force:false}),false);
 assert.equal(preferTouchControls({coarse:false,fine:true,touchPoints:10,force:false}),false);
 assert.equal(preferTouchControls({coarse:false,fine:true,touchPoints:0,force:true}),true);
});

test('double tap and hold fires while dragging; first drag and cancelled gestures never arm it',()=>{
 let clock=0;const {look,controls,turns}=setup({settings:()=>({fireMode:'double'}),now:()=>clock});
 look.emit('pointerdown',1);clock=80;look.emit('pointerup',1);assert.equal(controls.consume().fire,false);
 clock=150;look.emit('pointerdown',2);assert.equal(controls.consume().fire,true);look.emit('pointermove',2,80,60);assert.deepEqual(turns,[[30,10]]);assert.equal(controls.consume().fire,true);
 look.emit('pointerup',2);assert.equal(controls.consume().fire,false);
 clock=500;look.emit('pointerdown',3);look.emit('pointermove',3,80,50);clock=550;look.emit('pointerup',3);clock=600;look.emit('pointerdown',4);assert.equal(controls.consume().fire,false);look.emit('pointercancel',4);
 clock=650;look.emit('pointerdown',5);assert.equal(controls.consume().fire,false);
 controls.reset();clock=700;look.emit('pointerdown',6);assert.equal(controls.consume().fire,false);
});
test('hold-to-fire and separate fire retain independent ownership',()=>{
 const {look,buttons,controls}=setup({settings:()=>({fireMode:'hold'})});
 look.emit('pointerdown',1);buttons.fire.emit('pointerdown',2);assert.equal(controls.consume().fire,true);
 look.emit('pointerup',1);assert.equal(controls.consume().fire,true);buttons.fire.emit('pointerup',2);assert.equal(controls.consume().fire,false);
});
