import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {stickVector,touchIntent,GroundOrderTap,ThrowableDrag,thumbOrigin,thumbDisplayOrigin} from '../public/touch-input.mjs';
import {renderDensity,normalizePreferences} from '../public/settings.mjs';
import {touchControlLayout} from '../public/touch-layout.mjs';

// Execute the shipped app listeners and resize cleanup with two separate
// captured pointers. The fixture supplies geometry, not a second controller.
const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
const section=(start,end)=>{
  const from=app.indexOf(start),to=app.indexOf(end,from);
  assert.ok(from>=0&&to>from,`production section ${start} exists`);
  return app.slice(from,to);
};
const listeners=section('function updateTouchIntent()','function screenPoint(event)');
const clear=section('function clearInput()','function startMission(');
const resize=section('function syncTouchLayout(rect)','function measureSafeInsets()');
const closeMenus=section('function closeGear()','function syncObjectiveDetails()');
const menuListeners=section("$('touchOrder').addEventListener('click'","$('touchGear').addEventListener('click'");
const settingsChange=section('function changeSetting(key, value)','function syncControlHints()');
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
class Surface{
  handlers=new Map();captured=new Set();released=[];
  classes=new Set();properties=new Map();attributes=new Map();children=[];parentElement=null;textContent='';
  constructor(bounds=rect(0,0,1,1)){
    this.bounds=bounds;
    this.style={setProperty:(key,value)=>this.properties.set(key,value),getPropertyValue:key=>this.properties.get(key)||'',removeProperty:key=>this.properties.delete(key)};
    this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),
      contains:name=>this.classes.has(name),toggle:(name,on)=>{const enabled=on??!this.classes.has(name);if(enabled)this.classes.add(name);else this.classes.delete(name);return enabled;}};
  }
  getBoundingClientRect(){return this.bounds;}
  querySelector(selector){return selector==='.stick-base'?this.base:selector==='.stick-knob'?this.knob:null;}
  appendChild(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(node=>node!==child);child.parentElement=this;this.children.push(child);return child;}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  getAttribute(key){return this.attributes.get(key)??null;}
  addEventListener(type,handler){this.handlers.set(type,[...this.handlers.get(type)||[],handler]);}
  setPointerCapture(id){this.captured.add(id);}
  releasePointerCapture(id){if(this.captured.delete(id)){this.released.push(id);this.emit('lostpointercapture',{pointerId:id});}}
  emit(type,values={}){
    const event={type,pointerId:1,pointerType:'touch',button:0,clientX:0,clientY:0,preventDefault(){this.prevented=true;},...values};
    for(const handler of this.handlers.get(type)||[])handler(event);return event;
  }
}
function fixture(settings={}){
  const viewport=new Surface(rect(0,0,390,844)),move=new Surface(rect(4,690,128.7,140)),aim=new Surface(rect(257.3,690,128.7,140));
  for(const pad of [move,aim]){pad.base=new Surface(rect(0,0,100,100));pad.knob=new Surface(rect(0,0,42,42));}
  const nodes={battlefield:viewport,moveStick:move,aimStick:aim,touchControls:new Surface(),touchThrow:new Surface(),touchInteract:new Surface(),aimStickLabel:new Surface(),
    squadRoster:new Surface(),touchSquadRosterHost:new Surface(),touchOrder:new Surface(),touchRegroup:new Surface(),orderClose:new Surface(),touchGear:new Surface(),touchGearTray:new Surface()};
  const squadRosterHome=new Surface();squadRosterHome.appendChild(nodes.squadRoster);
  const heldActions=new Set(),orders=[],savedSettings=[],appliedSettings=[];
  const state={
    $:id=>nodes[id],canvas:viewport,activeSticks:new Map(),stickVector,touchIntent,thumbOrigin,thumbDisplayOrigin,renderDensity,touchControlLayout,squadRosterHome,
    touchInput:{moveX:0,moveY:0,aimX:0,aimY:0,aimStrength:0,wasFiring:false,interact:false},
    pointer:{fire:false,valid:false},keys:new Set(),desktopPointerId:null,interactionPointer:null,
    touchAim:null,throwAim:null,observing:false,touch:true,mode:'playing',viewportSize:'',canvasRect:viewport.bounds,
    devicePixelRatio:3,preferences:normalizePreferences(settings),defaults:normalizePreferences({}),
    normalizePreferences:(raw,defaults)=>normalizePreferences(JSON.parse(JSON.stringify(raw)),defaults),
    actions:{reload:false,smoke:false,grenade:false,frag:false,flashbang:false},
    throwableDrag:new ThrowableDrag(),groundOrderTap:new GroundOrderTap(),
    document:{body:new Surface(),querySelector:selector=>selector==='dialog[open]'&&state.dialogOpen?{}:null,querySelectorAll:selector=>selector==='.stick-knob'?[move.knob,aim.knob]:selector==='.joystick'?[move,aim]:[]},
    getComputedStyle:()=>({paddingLeft:'8px',paddingRight:'8px',paddingBottom:'14px'}),
    renderer:{width:390,height:844,resize(width,height){this.width=width;this.height=height;}},
    online:()=>false,audio:{unlock(){}},text(id,value){const node=typeof id==='string'?nodes[id]:id;if(node)node.textContent=String(value);},
    flag(node,name,value){node.classList.toggle(name,!!value);},attr(node,name,value){node.setAttribute(name,value);},held:action=>heldActions.has(action),measureSafeInsets(){},enabled:true,
    game:{role:'leader'},paused:false,showMap:false,placingOrder:false,placingPing:false,storyCardOpen:false,gearOpen:false,dialogOpen:false,
    updateHUD(){},updateStoryUI(){},doOrder:type=>orders.push(type),
    applySettings(key){appliedSettings.push({key,heldPointers:state.activeSticks.size});state.fit();},save(){savedSettings.push({...state.preferences});},
    storyRenderKey:'',tutorialManual:false,
  };
  state.canAct=()=>state.enabled;
  vm.runInNewContext(clear+'\n'+resize+'\n'+listeners+'\n'+closeMenus+'\n'+menuListeners+'\n'+settingsChange,state);
  state.fit();return{state,move,aim,viewport,nodes,heldActions,orders,savedSettings,appliedSettings};
}
function neutral(state){assert.equal(state.touchInput.moveX,0);assert.equal(state.touchInput.moveY,0);assert.equal(state.touchInput.aimX,0);assert.equal(state.touchInput.aimY,0);assert.equal(state.touchInput.aimStrength,0);assert.equal(state.touchInput.wasFiring,false);}
function aimAt(aim,strength,pointerId=2){aim.emit('pointermove',{pointerId,clientX:320+34*strength,clientY:760});}

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
  aim.emit('pointermove',{pointerId:2,clientX:383,clientY:800});assert.equal(touchIntent(state.touchInput).firing,false,'old fire distance is now inside the aim-only range');
  aim.emit('pointermove',{pointerId:2,clientX:383,clientY:792});assert.equal(touchIntent(state.touchInput).firing,true);
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

test('shipped aim listeners keep the visual state and firing latch together across the outer boundary',()=>{
  const {state,aim,nodes}=fixture();
  aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});
  for(const [strength,firing,label] of [[.82,false,'AIM'],[.9,true,'FIRE'],[.82,true,'FIRE'],[.75,false,'AIM'],[.82,false,'AIM']]){
    aimAt(aim,strength);
    assert.equal(state.touchInput.wasFiring,firing,`latch at ${strength}`);
    assert.equal(aim.classes.has('firing'),firing,`firing feedback at ${strength}`);
    assert.equal(aim.classes.has('aiming'),!firing,`aiming feedback at ${strength}`);
    assert.equal(nodes.aimStickLabel.textContent,label);
  }
});

test('measured asymmetric sticks provide more physical aiming travel while retaining neutral pickup',()=>{
  const {state,move,aim,nodes}=fixture();
  move.bounds=rect(8,700,104,130);move.base.bounds=rect(0,0,80,80);move.knob.bounds=rect(0,0,32,32);
  aim.bounds=rect(208,656,174,174);aim.base.bounds=rect(0,0,150,150);aim.knob.bounds=rect(0,0,48,48);
  move.emit('pointerdown',{pointerId:1,clientX:10,clientY:824});
  aim.emit('pointerdown',{pointerId:2,clientX:375,clientY:820});neutral(state);
  assert.equal(state.activeSticks.get(1).radius,80*.34);
  assert.equal(state.activeSticks.get(2).radius,150*.34);
  move.emit('pointermove',{pointerId:1,clientX:10,clientY:804});
  assert.equal(state.touchInput.moveX,0);assert.ok(state.touchInput.moveY<0);
  aim.emit('pointermove',{pointerId:2,clientX:375,clientY:790});
  assert.equal(state.touchInput.wasFiring,false,'30px remains in the larger aim-only zone');
  assert.equal(nodes.aimStickLabel.textContent,'AIM');
  assert.equal(state.touchInput.aimX,0);assert.ok(state.touchInput.aimY<0);
  aim.emit('pointermove',{pointerId:2,clientX:375,clientY:775});
  assert.equal(state.touchInput.wasFiring,true,'45px crosses the larger stick firing boundary');
  assert.equal(nodes.aimStickLabel.textContent,'FIRE');
  aim.emit('pointercancel',{pointerId:2});
  assert.equal(state.touchInput.wasFiring,false);assert.ok(state.touchInput.moveY<0,'aim cancellation leaves the other thumb moving');
});

test('changing either stick size releases both held gestures before layout updates and preserves independent preferences',()=>{
  for(const [key,value,otherKey,otherValue] of [['touchMoveSize',.65,'touchAimSize',1.8],['touchAimSize',1.9,'touchMoveSize',.7]]){
    const {state,move,aim,savedSettings,appliedSettings}=fixture({[otherKey]:otherValue,touchFireThreshold:.94});
    move.emit('pointerdown',{pointerId:1,clientX:70,clientY:760});move.emit('pointermove',{pointerId:1,clientX:70,clientY:710});
    aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});aimAt(aim,1);
    assert.equal(state.touchInput.wasFiring,true);assert.equal(state.activeSticks.size,2);
    state.changeSetting(key,String(value));neutral(state);
    assert.equal(state.activeSticks.size,0);assert.deepEqual(move.released,[1]);assert.deepEqual(aim.released,[2]);
    assert.equal(appliedSettings.at(-1).heldPointers,0,'geometry changes only after captured input is released');
    assert.equal(state.preferences[key],value);assert.equal(state.preferences[otherKey],otherValue);assert.equal(state.preferences.touchFireThreshold,.94);
    assert.equal(savedSettings.at(-1)[key],value);assert.equal(savedSettings.at(-1)[otherKey],otherValue);
    move.emit('pointermove',{pointerId:1,clientX:95,clientY:700});aim.emit('pointermove',{pointerId:2,clientX:380,clientY:760});neutral(state);
  }
});

test('every aim release path clears fire immediately and a fresh inner-ring drag cannot inherit it',()=>{
  for(const event of ['pointerup','pointercancel','lostpointercapture']){
    const {state,aim,nodes}=fixture();
    aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});aimAt(aim,.95);aimAt(aim,.82);
    assert.equal(state.touchInput.wasFiring,true);
    aim.emit(event,{pointerId:2});neutral(state);
    assert.equal(aim.classes.has('firing'),false,event);assert.equal(aim.classes.has('aiming'),false,event);
    assert.equal(nodes.aimStickLabel.textContent,'AIM / FIRE');
    aim.emit('pointermove',{pointerId:2,clientX:370,clientY:760});neutral(state);
    aim.emit('pointerdown',{pointerId:3,clientX:320,clientY:760});aimAt(aim,.82,3);
    assert.equal(state.touchInput.wasFiring,false,`${event} clears the latch for the next gesture`);
  }
});

test('blocking play or using another action releases the fire latch without discarding aim direction',()=>{
  const suppressors=[
    [f=>{f.state.enabled=false;},f=>{f.state.enabled=true;}],
    [f=>{f.state.observing=true;},f=>{f.state.observing=false;}],
    [f=>{f.state.touchInput.interact=true;},f=>{f.state.touchInput.interact=false;}],
    [f=>f.heldActions.add('interact'),f=>f.heldActions.delete('interact')],
    [f=>f.state.throwableDrag.begin(9,0,0),f=>f.state.throwableDrag.cancel()],
    ...['frag','flashbang','smoke'].map(action=>[f=>{f.state.actions[action]=true;},f=>{f.state.actions[action]=false;}]),
  ];
  for(const [suppress,restore] of suppressors){
    const f=fixture();f.aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});aimAt(f.aim,.95);aimAt(f.aim,.82);
    suppress(f);assert.equal(f.state.updateTouchIntent().firing,false);assert.equal(f.state.touchInput.wasFiring,false);assert.equal(f.aim.classes.has('firing'),false);
    restore(f);const resumed=f.state.updateTouchIntent();
    assert.equal(resumed.aiming,true);assert.equal(resumed.firing,false,'returning to an inner-ring aim does not restart a suppressed burst');
    aimAt(f.aim,.95);assert.equal(f.state.touchInput.wasFiring,true,'a new outward push can fire');
  }
});

test('the saved firing distance reaches the actual pointer controller and survives control-layout changes',()=>{
  for(const threshold of [.72,.96]){
    const {state,aim}=fixture({touchFireThreshold:threshold});
    aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});aimAt(aim,threshold-.02);
    assert.equal(state.touchInput.wasFiring,false);
    aimAt(aim,threshold+.02);assert.equal(state.touchInput.wasFiring,true);
    state.touch=false;state.fit();neutral(state);assert.equal(state.preferences.touchFireThreshold,threshold);
    state.touch=true;state.fit();assert.equal(state.preferences.touchFireThreshold,threshold);
    aim.emit('pointerdown',{pointerId:3,clientX:320,clientY:760});aimAt(aim,threshold-.02,3);
    assert.equal(state.touchInput.wasFiring,false);
  }
});

test('layout switching moves the same squad roster between the mobile tray and desktop home',()=>{
  const {state,nodes}=fixture();const roster=nodes.squadRoster,card=new Surface();roster.appendChild(card);
  assert.equal(roster.parentElement,nodes.touchSquadRosterHost);
  state.touch=false;state.fit();assert.equal(roster.parentElement,state.squadRosterHome);assert.equal(nodes.touchSquadRosterHost.children.length,0);
  state.touch=true;state.fit();state.fit();
  assert.equal(roster.parentElement,nodes.touchSquadRosterHost);assert.deepEqual(nodes.touchSquadRosterHost.children,[roster]);
  assert.equal(roster.children[0],card,'reparenting preserves the existing soldier cards');
});

test('opening Squad clears both held thumbs and the dedicated button dispatches role-appropriate regroup',()=>{
  const {state,move,aim,nodes,orders}=fixture();
  move.emit('pointerdown',{pointerId:1,clientX:70,clientY:760});move.emit('pointermove',{pointerId:1,clientX:70,clientY:710});
  aim.emit('pointerdown',{pointerId:2,clientX:320,clientY:760});aimAt(aim,.95);
  nodes.touchOrder.emit('click');neutral(state);assert.equal(state.activeSticks.size,0);assert.equal(state.document.body.classList.contains('orders-open'),true);
  assert.equal(nodes.touchOrder.getAttribute('aria-expanded'),'true');
  nodes.touchRegroup.emit('click');assert.deepEqual(orders,['follow']);assert.equal(state.document.body.classList.contains('orders-open'),false);
  state.game.role='member';nodes.touchRegroup.emit('click');assert.deepEqual(orders,['follow','ready']);
  for(const blockedBy of ['paused','showMap','placingOrder','placingPing','dialogOpen']){
    state[blockedBy]=true;nodes.touchRegroup.emit('click');state[blockedBy]=false;
  }
  assert.deepEqual(orders,['follow','ready'],'targeting and modal screens cannot issue an unintended regroup');
});
