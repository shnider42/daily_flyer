import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,loadSettings,saveSettings,loadProgress,saveProgress,applySettings,DEFAULTS,VERSION} from '../public/settings.mjs';
import {BINDING_ACTIONS,DEFAULT_KEY_BINDINGS,normalizeKeyBindings,isBindableKey,formatKeyCode} from '../public/keybindings.mjs';
import {FlightControls} from '../public/controls.mjs';

test('preferences recover from blocked storage and malformed data without losing bounded controls',()=>{
  const broken={getItem(){throw Error('Private storage');},setItem(){throw Error('Quota');}};
  assert.deepEqual(loadSettings(broken),DEFAULTS);assert.equal(saveSettings(DEFAULTS,broken),false);
  for(const raw of ['{',null,'null','[]','"settings"']){
    assert.deepEqual(loadSettings({getItem(){return raw;}}),DEFAULTS);
  }
  const s=normalizeSettings({stickSize:999,buttonSize:-10,offsetY:Infinity,sensitivity:NaN,assist:'unsafe',sound:'false',leftHanded:true,theme:'neon',keyBindings:{pitchUp:'Escape'}});
  assert.equal(s.stickSize,152);assert.equal(s.buttonSize,44);assert.equal(s.offsetY,22);assert.equal(s.sensitivity,1);assert.equal(s.assist,'assisted');assert.equal(s.sound,true);assert.equal(s.leftHanded,true);assert.equal(s.theme,'night');assert.deepEqual(s.keyBindings,DEFAULT_KEY_BINDINGS);
  assert.deepEqual(loadProgress(broken),{completed:{},lastMission:null,totalTime:0});
});

test('a blocked localStorage getter cannot prevent settings or logbook startup',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage denied');}});
  try{
    assert.deepEqual(loadSettings(),DEFAULTS);assert.equal(saveSettings(DEFAULTS),false);
    assert.deepEqual(loadProgress(),{completed:{},lastMission:null,totalTime:0});assert.equal(saveProgress({completed:{}}),false);
  }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});

test('existing preferences gain night mode and controls; saved remaps survive reload without changing logbook',()=>{
  const progress={completed:{training:{score:100,time:54}},lastMission:'training',totalTime:54};
  const data=new Map([
    ['dfe.skyward.settings.v1',JSON.stringify({assist:'expert',sound:false,stickSize:130,invertPitch:true})],
    ['dfe.skyward.logbook.v1',JSON.stringify(progress)],
  ]);
  const storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const s=loadSettings(storage);
  assert.equal(VERSION,'0.2.1');assert.equal(s.assist,'expert');assert.equal(s.sound,false);assert.equal(s.stickSize,130);assert.equal(s.invertPitch,true);assert.equal(s.theme,'night');
  assert.deepEqual(s.keyBindings,DEFAULT_KEY_BINDINGS);assert.notEqual(s.keyBindings,DEFAULT_KEY_BINDINGS);
  const originalLogbook=data.get('dfe.skyward.logbook.v1');
  s.theme='day';s.keyBindings={...s.keyBindings,pitchUp:'KeyI',fire:'KeyJ'};
  assert.equal(saveSettings(s,storage),true);
  assert.deepEqual(loadSettings(storage),s);
  assert.equal(data.get('dfe.skyward.logbook.v1'),originalLogbook);assert.deepEqual(loadProgress(storage),progress);
  assert.equal(normalizeSettings().keyBindings.pitchUp,'ArrowDown');
});

test('bindings reject reserved keys, recover malformed values, and resolve collisions without coupled actions',()=>{
  for(const key of ['Escape','Tab','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','F1','F5','CapsLock','Unidentified','Keya','',12,null])assert.equal(isBindableKey(key),false,String(key));
  for(const key of ['ArrowDown','KeyA','KeyZ','Digit3','Space','Enter','ShiftLeft','Numpad7','NumpadAdd','BracketLeft'])assert.equal(isBindableKey(key),true,key);
  assert.equal(formatKeyCode('ArrowDown'),'↓');assert.equal(formatKeyCode('KeyA'),'A');assert.equal(formatKeyCode('Numpad7'),'Num 7');assert.equal(formatKeyCode(null),'Unassigned');
  for(const value of [null,[],false,'KeyW',42])assert.deepEqual(normalizeKeyBindings(value),DEFAULT_KEY_BINDINGS);
  const normalized=normalizeKeyBindings({pitchUp:'KeyW',pitchDown:'KeyW',yawLeft:'Escape',rollRight:null,extra:'KeyZ'});
  assert.equal(normalized.pitchUp,'KeyW');assert.equal(normalized.pitchDown,null);assert.equal(normalized.throttleUp,null);assert.equal(normalized.yawLeft,'KeyA');assert.equal(normalized.rollRight,null);assert.equal('extra' in normalized,false);
  assert.equal(Object.keys(normalized).length,BINDING_ACTIONS.length);
  const assigned=Object.values(normalized).filter(Boolean);assert.equal(new Set(assigned).size,assigned.length);
  assert.deepEqual(normalizeKeyBindings(normalized),normalized,'normalization must be stable across saves');
  const swap=normalizeKeyBindings({...DEFAULT_KEY_BINDINGS,pitchUp:'KeyW',throttleUp:'ArrowDown'});
  assert.equal(swap.pitchUp,'KeyW');assert.equal(swap.throttleUp,'ArrowDown');assert.ok(Object.values(swap).every(Boolean));
});

class Surface {
  constructor(tagName='DIV'){
    this.tagName=tagName;this.handlers={};this.style={setProperty(name,value){this[name]=value;}};this.dataset={};this.value=0;this.attributes={};this.blurCount=0;
    const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
  }
  addEventListener(name,fn){(this.handlers[name]||=[]).push(fn);}
  removeEventListener(name,fn){this.handlers[name]=(this.handlers[name]||[]).filter(f=>f!==fn);}
  dispatch(name,event={}){
    const e={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},target:this,...event};
    for(const fn of this.handlers[name]||[])fn(e);return e;
  }
  closest(selector){return (['INPUT','SELECT','TEXTAREA'].includes(this.tagName)&&selector.includes('input,select,textarea'))||this.isContentEditable?this:null;}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  setPointerCapture(){}
  setAttribute(name,value){this.attributes[name]=value;}
  blur(){this.blurCount++;}
}
function withControls(run,preferences={}){
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  const window=globalThis.window=new Surface(),document=globalThis.document=new Surface();
  const surfaces={stick:new Surface(),knob:new Surface(),look:new Surface(),fire:new Surface(),throttle:new Surface('INPUT')};
  const actions=[],state={pauses:0};
  const c=new FlightControls({...surfaces,settings:normalizeSettings(preferences),onAction:action=>actions.push(action),onPause:()=>state.pauses++});c.setActive(true);
  try{return run({c,...surfaces,window,document,actions,state});}
  finally{c.destroy();globalThis.window=oldWindow;globalThis.document=oldDocument;}
}

test('theme applies to the page and browser chrome in both directions',()=>{
  const previous=globalThis.document,root=new Surface(),meta=new Surface('META');
  globalThis.document={documentElement:root,querySelector:()=>meta};
  try{
    applySettings(normalizeSettings());assert.equal(root.dataset.theme,'night');assert.equal(meta.attributes.content,'#0b141c');
    applySettings(normalizeSettings({theme:'day'}));assert.equal(root.dataset.theme,'day');assert.equal(meta.attributes.content,'#f6f2e9');
    applySettings(normalizeSettings({theme:'night'}));assert.equal(root.dataset.theme,'night');
  }finally{globalThis.document=previous;}
});

test('all eight movement defaults produce only their named direction, with independent simultaneous controls',()=>withControls(({c,window})=>{
  const expected=[
    ['ArrowDown','pitch',1],['ArrowUp','pitch',-1],['ArrowLeft','roll',-1],['ArrowRight','roll',1],
    ['KeyA','yaw',-1],['KeyD','yaw',1],['KeyW','throttle',.85],['KeyS','throttle',.15],
  ];
  for(const [code,axis,value] of expected){
    c.clear();c.setThrottle(.5);const event=window.dispatch('keydown',{code}),input=c.read(1);
    assert.equal(event.defaultPrevented,true,code);assert.ok(Math.abs(input[axis]-value)<1e-8,code+' '+axis);
    for(const other of ['roll','pitch','yaw'])if(other!==axis)assert.equal(input[other],0,code+' must not change '+other);
    if(axis!=='throttle')assert.equal(input.throttle,.5,code+' must not change thrust');
    assert.equal(input.fire,false,code);
  }
  c.clear();c.setThrottle(.5);
  for(const code of ['ArrowDown','ArrowLeft','KeyD','KeyW','Space'])window.dispatch('keydown',{code});
  assert.deepEqual(c.read(1),{pitch:1,roll:-1,yaw:1,throttle:.85,fire:true});
  for(const code of ['ArrowUp','ArrowRight','KeyA','KeyS'])window.dispatch('keydown',{code});
  assert.deepEqual(c.read(1),{pitch:0,roll:0,yaw:0,throttle:.85,fire:true});
}));

test('keyboard throttle uses elapsed time, clamps to range, and auto-repeat never accelerates it',()=>withControls(({c,window,throttle})=>{
  window.dispatch('keydown',{code:'KeyW'});
  for(let i=0;i<60;i++){window.dispatch('keydown',{code:'KeyW',repeat:true});c.read(1/60);}
  assert.ok(Math.abs(c.throttleValue-.35)<1e-8);assert.equal(throttle.value,35);
  c.read(10);assert.equal(c.throttleValue,1);window.dispatch('keyup',{code:'KeyW'});
  window.dispatch('keydown',{code:'KeyS'});c.read(10);assert.equal(c.throttleValue,0);
}));

test('remapping movement, guns and actions removes old keys and old aliases have no hidden effects',()=>withControls(({c,window,actions})=>{
  c.settings=normalizeSettings({...c.settings,keyBindings:{...c.settings.keyBindings,pitchUp:'KeyI',yawLeft:'KeyQ',throttleUp:'ShiftLeft',fire:'KeyJ',gear:'Digit1',startup:'Digit2'}});
  c.setThrottle(.5);
  for(const code of ['ArrowDown','KeyA','KeyW','Space','KeyG','Enter','KeyE','ControlLeft','Tab']){
    const event=window.dispatch('keydown',{code});assert.equal(event.defaultPrevented,false,code);
  }
  assert.deepEqual(c.read(1),{roll:0,pitch:0,yaw:0,throttle:.5,fire:false});assert.deepEqual(actions,[]);
  for(const code of ['KeyI','KeyQ','ShiftLeft','KeyJ','Digit1','Digit2'])window.dispatch('keydown',{code});
  assert.deepEqual(c.read(1),{roll:0,pitch:1,yaw:-1,throttle:.85,fire:true});assert.deepEqual(actions,['gear','startup']);
  c.settings=normalizeSettings({...c.settings,keyBindings:{...c.settings.keyBindings,pitchUp:'KeyU'}});
  assert.deepEqual(c.read(1),{roll:0,pitch:0,yaw:0,throttle:.85,fire:false},'a new mapping clears keys held under the previous mapping');
}));

test('unrelated preference updates preserve held flight input when key assignments are unchanged',()=>withControls(({c,window})=>{
  c.setThrottle(.5);
  for(const code of ['ArrowDown','ArrowRight','KeyA','KeyW','Space'])window.dispatch('keydown',{code});
  const before=c.read(0);
  assert.deepEqual(before,{roll:1,pitch:1,yaw:-1,throttle:.5,fire:true});
  c.settings=normalizeSettings({...c.settings,sound:false,theme:'day'});
  assert.deepEqual(c.read(0),before,'a sound or display update must not cancel a held maneuver');
  assert.ok(Math.abs(c.read(.25).throttle-.5875)<1e-8,'held thrust must keep advancing after settings refresh');
  window.dispatch('keyup',{code:'ArrowDown'});window.dispatch('keyup',{code:'Space'});
  assert.equal(c.read(0).pitch,0);assert.equal(c.read(0).fire,false);
}));

test('every discrete command can be rebound and fires once per physical key press',()=>withControls(({c,window,actions,state})=>{
  const continuous=new Set(['pitchUp','pitchDown','yawLeft','yawRight','throttleUp','throttleDown','rollLeft','rollRight','fire']);
  for(const {id,defaultCode} of BINDING_ACTIONS.filter(({id})=>!continuous.has(id))){
    c.settings=normalizeSettings({...DEFAULTS,keyBindings:{...DEFAULT_KEY_BINDINGS,[id]:'KeyZ'}});c.clear();actions.length=0;state.pauses=0;
    const old=window.dispatch('keydown',{code:defaultCode});assert.equal(old.defaultPrevented,false,id+' old key');
    window.dispatch('keydown',{code:'KeyZ'});window.dispatch('keydown',{code:'KeyZ',repeat:true});
    if(id==='pause'){assert.equal(state.pauses,1);assert.deepEqual(actions,[]);}
    else {assert.deepEqual(actions,[id]);assert.equal(state.pauses,0);}
  }
}));

test('forms and browser shortcuts keep their keys; focus and pause cannot leave keyboard input held',()=>withControls(({c,window,document,throttle,actions,state})=>{
  window.dispatch('keydown',{code:'ArrowDown'});assert.equal(c.read(0).pitch,1);
  const text=new Surface('TEXTAREA');document.dispatch('focusin',{target:text});assert.equal(c.read(0).pitch,0);
  const editable=new Surface();editable.isContentEditable=true;
  for(const target of [text,throttle,new Surface('SELECT'),editable]){
    const event=window.dispatch('keydown',{target,code:'ArrowDown'});assert.equal(event.defaultPrevented,false);assert.equal(c.read(1).pitch,0);
    window.dispatch('keydown',{target,code:'KeyG'});
  }
  for(const modifier of ['ctrlKey','metaKey','altKey']){
    window.dispatch('keydown',{code:'KeyW'});const before=c.throttleValue;
    const event=window.dispatch('keydown',{code:'KeyR',[modifier]:true});assert.equal(event.defaultPrevented,false);assert.equal(c.read(1).throttle,before);
  }
  assert.deepEqual(actions,[]);
  for(const code of ['ArrowDown','KeyW','Space'])window.dispatch('keydown',{code});
  window.dispatch('keydown',{code:'Escape'});assert.equal(state.pauses,1);assert.equal(c.read(0).pitch,0);assert.equal(c.read(0).fire,false);
  c.setActive(false);c.setActive(true);const before=c.throttleValue;
  window.dispatch('keydown',{code:'KeyW',repeat:true});assert.equal(c.read(1).throttle,before,'keys held through pause require a fresh press');
  window.dispatch('keydown',{code:'KeyW'});window.dispatch('blur');assert.equal(c.read(1).throttle,before);
  window.dispatch('keydown',{code:'ArrowDown'});document.hidden=true;document.dispatch('visibilitychange');assert.equal(c.read(0).pitch,0);
}));

test('pointer throttle releases focus, while native range-key navigation remains available',()=>withControls(({c,window,document,throttle,stick})=>{
  stick.dispatch('pointerdown',{pointerId:1,clientX:88,clientY:50});
  document.dispatch('focusin',{target:throttle});assert.equal(c.read(0).roll,1,'adjusting throttle must not drop the other thumb’s flight stick');
  throttle.value=68;throttle.dispatch('input');assert.equal(c.read(0).throttle,.68);
  const arrow=window.dispatch('keydown',{target:throttle,code:'ArrowUp'});assert.equal(arrow.defaultPrevented,false);assert.equal(c.read(0).pitch,0);
  assert.equal(throttle.blurCount,0);throttle.dispatch('pointerup');assert.equal(throttle.blurCount,1);throttle.dispatch('pointercancel');assert.equal(throttle.blurCount,2);
}));

test('touch pitch inversion changes only touch; flight and look pointers stay independent and cancel cleanly',()=>withControls(({c,window,stick,look,fire})=>{
  stick.dispatch('pointerdown',{pointerId:1,clientX:50,clientY:12});assert.equal(c.read(0).pitch,1);
  c.settings.invertPitch=true;assert.equal(c.read(0).pitch,-1);stick.dispatch('pointercancel',{pointerId:1});
  for(const invertPitch of [true,false]){
    c.settings.invertPitch=invertPitch;window.dispatch('keydown',{code:'ArrowDown'});assert.equal(c.read(0).pitch,1);window.dispatch('keyup',{code:'ArrowDown'});
    window.dispatch('keydown',{code:'ArrowUp'});assert.equal(c.read(0).pitch,-1);window.dispatch('keyup',{code:'ArrowUp'});
  }
  stick.dispatch('pointerdown',{pointerId:2,clientX:88,clientY:50});
  look.dispatch('pointerdown',{pointerId:3,clientX:50,clientY:50});look.dispatch('pointermove',{pointerId:3,clientX:70,clientY:50});
  const input=c.read(1/60);assert.equal(input.roll,1);assert.equal(input.fire,false);assert.ok(c.lookX>0);
  stick.dispatch('pointercancel',{pointerId:2});assert.equal(c.read(1/60).roll,0);
  fire.dispatch('pointerdown',{pointerId:4});assert.equal(c.read(0).fire,true);fire.dispatch('lostpointercapture',{pointerId:4});assert.equal(c.read(0).fire,false);
  window.dispatch('blur');assert.equal(c.lookX,0);assert.equal(c.lookY,0);assert.equal(c.lookId,null);
}));
