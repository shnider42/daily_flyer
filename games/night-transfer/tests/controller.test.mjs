import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as world from '../public/world.mjs';
import {movementVector,FirstPersonControls} from '../public/controls.js';

const controller=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .+;\n/gm,'');
const markup=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
function harness(){
  const elements=new Map(),storage=new Map(),timers=[];let transport;
  class Element{
    constructor(id){this.id=id;this.hidden=false;this.value='';this.style={};this.dataset={};this.listeners={};this.children=[];this.childIds=[];this.classList={add(){},remove(){},toggle(){}};}
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
    click(){for(const fn of this.listeners.click||[])fn({});}
    setAttribute(name,value){this[name]=value;}
    toggleAttribute(name,enabled){this[name]=enabled;}
    focus(){}
    set innerHTML(value){this.html=value;for(const id of this.childIds)elements.delete(id);this.childIds=[];this.children=[];for(const match of value.matchAll(/\bid="([^"]+)"/g)){const child=new Element(match[1]);this.childIds.push(child.id);elements.set(child.id,child);this.children.push(child);}}
    get innerHTML(){return this.html||'';}
    insertBefore(element){elements.set(element.id,element);this.children.push(element);}
  }
  for(const match of markup.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element(match[1]));
  const document={getElementById:id=>elements.get(id),querySelectorAll:()=>[],body:new Element('body'),hidden:false,addEventListener(){},createElement:()=>new Element('new')};
  class FirstPersonControls{
    constructor(){this.pose={x:0,z:3.2,yaw:0,crouch:false};this.enabled=false;}
    setPose(p){this.pose={...p,pitch:p.pitch||0,crouch:!!p.crouch};}
    setEnabled(v){this.enabled=v;}
    update(){}
  }
  class CoopClient{
    constructor(callbacks){this.callbacks=callbacks;this.actions=[];this.active=false;this.connected=false;this.leaves=0;transport=this;}
    get session(){return {id:'self',code:'ABC234',name:'Test'};}
    get serverNow(){return Date.now();}
    get resumeInfo(){return null;}
    create(){this.active=true;this.callbacks.onStatus('connecting','Opening…');}
    join(){this.create();}
    presence(){}
    samplePoses(){return [];}
    leave(){this.active=this.connected=false;this.leaves++;this.callbacks.onStatus('disconnected','Left');}
    sendAction(action){if(!this.connected)return null;const id=`action-${this.actions.length}`;this.actions.push({id,action:structuredClone(action)});return id;}
    welcome(state){this.active=this.connected=true;this.callbacks.onStatus('connected','Ready');this.callbacks.onRoster([{id:'self',name:'Test',connected:true,room:'holding'}]);this.callbacks.onState(state,{initial:true});}
  }
  const context=vm.createContext({...world,FirstPersonControls,CoopClient,createScene:()=>({loadRoom(){},setCamera(){},canMove(){return true;},resize(){},setBrightness(){},render(){}}),document,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:false}),requestAnimationFrame:()=>1,setTimeout:fn=>timers.push(fn),clearTimeout(){},URL,Date,Math,console,structuredClone,performance:{now:()=>100},location:{href:'https://night-transfer.example/',origin:'https://night-transfer.example',pathname:'/'},navigator:{}});
  vm.runInContext(controller+'\nglobalThis.app={startSolo,returnToMenu,showCoop,closeModal,dispatch,useFocused,openObject,saveSolo,snapshot:()=>({mode,state,roomId,dialogKind,selected,teamIntent,pending:[...pending.keys()]})};',context);
  return {app:context.app,transport,elements,storage,document,flush(){while(timers.length)timers.shift()();}};
}
function join(h){h.app.showCoop();h.elements.get('create-team').click();h.transport.welcome(world.newGame());h.app.closeModal();}
const firstAct=[{type:'interact',id:'bunkPocket'},{type:'interact',id:'holdingDoor'},{type:'solve',id:'routeCabinet',value:['gate','eye','lamp','moon']},{type:'interact',id:'recordsDoor'},{type:'interact',id:'transferDesk'},{type:'interact',id:'transferExit'}];

test('first-person inspection does not collect an item until the player searches',()=>{
  const h=harness();h.app.startSolo();h.app.closeModal();h.app.useFocused({id:'bunkPocket',distance:1.2});
  assert.equal(h.app.snapshot().dialogKind,'object');assert.equal(h.app.snapshot().state.inventory.length,0);
  h.elements.get('object-action').click();assert(h.app.snapshot().state.inventory.includes('holdingKey'));assert.equal(h.app.snapshot().dialogKind,'result');
});
test('objects out of reach do not open or mutate the escape',()=>{
  const h=harness();h.app.startSolo();h.app.closeModal();h.app.useFocused({id:'bunkPocket',distance:4});
  assert.equal(h.app.snapshot().dialogKind,'');assert.equal(h.app.snapshot().state.inventory.length,0);
});
test('cancelled joins cannot reopen the game when a late welcome arrives',()=>{
  const h=harness();h.app.showCoop();h.elements.get('create-team').click();assert.equal(h.transport.active,true);
  h.elements.get('close-dialog').click();assert.equal(h.transport.active,false);h.transport.welcome(world.newGame());assert.equal(h.app.snapshot().mode,'menu');assert.equal(h.app.snapshot().teamIntent,false);
});
test('a co-op acknowledgement keeps its original object even after another panel opens',()=>{
  const h=harness();join(h);h.app.openObject(world.OBJECTS.bunkPocket);h.elements.get('object-action').click();const sent=h.transport.actions[0];h.app.closeModal();h.app.openObject(world.OBJECTS.routeMarks);
  const result=world.reduce(h.app.snapshot().state,sent.action);h.transport.callbacks.onState(result.state);h.transport.callbacks.onMessage({...result,type:'action-result',actionId:sent.id});
  assert.equal(h.app.snapshot().selected,'routeMarks');assert.equal(h.app.snapshot().dialogKind,'object');assert.equal(h.app.snapshot().pending.length,0);
});
test('team progress and act transitions never overwrite the solo slot',()=>{
  const h=harness();h.app.startSolo();h.app.dispatch(firstAct[0]);h.app.returnToMenu();const before=h.storage.get('night-transfer.solo.v1');join(h);
  let state=world.newGame();for(const action of firstAct){state=world.reduce(state,action).state;h.transport.callbacks.onState(state,{initial:false});}
  assert.equal(h.app.snapshot().state.level,1);assert.equal(h.app.snapshot().roomId,'laundry');h.app.saveSolo();assert.equal(h.storage.get('night-transfer.solo.v1'),before);
});
test('a delayed door acknowledgement cannot drag a player back into a finished act',()=>{
  const h=harness();join(h);let state=world.newGame();state=world.reduce(state,firstAct[0]).state;h.transport.callbacks.onState(state);
  h.app.dispatch(firstAct[1],{kind:'door',object:world.OBJECTS.holdingDoor});const sent=h.transport.actions[0];const delayed=world.reduce(state,sent.action);state=delayed.state;
  for(const action of firstAct.slice(2))state=world.reduce(state,action).state;
  h.transport.callbacks.onState(state);h.transport.callbacks.onMessage({...delayed,type:'action-result',actionId:sent.id});h.flush();
  assert.equal(h.app.snapshot().state.level,1);assert.equal(h.app.snapshot().roomId,'laundry');assert.equal(h.app.snapshot().dialogKind,'intro');
});
test('an old or hidden tab cannot overwrite the newly claimed solo session',()=>{
  const h=harness();h.app.startSolo();const previous=JSON.parse(h.storage.get('night-transfer.solo.v1'));const newer=JSON.stringify({...previous,owner:'another-tab',savedAt:Date.now()+100});h.storage.set('night-transfer.solo.v1',newer);h.app.dispatch(firstAct[0]);assert.equal(h.storage.get('night-transfer.solo.v1'),newer);
  h.app.startSolo(true);const saved=h.storage.get('night-transfer.solo.v1');h.document.hidden=true;h.app.dispatch(firstAct[0]);assert.equal(h.storage.get('night-transfer.solo.v1'),saved);
});
test('movement is frame-bounded, diagonal-normalized and follows first-person yaw',()=>{
  const forward=movementVector(0,1,0,2,.02),diagonal=movementVector(0,1,1,2,.02);assert.equal(forward.x,0);assert.equal(forward.z,-.04);assert(Math.abs(Math.hypot(diagonal.x,diagonal.z)-.04)<1e-12);
  const left=movementVector(Math.PI/2,1,0,2,.02);assert(Math.abs(left.x+.04)<1e-12);assert(Math.abs(left.z)<1e-12);assert(Math.hypot(...Object.values(movementVector(0,1,0,2,10)))<=.1);
});
test('slow graphics frames retain walking speed through small collision-checked steps',()=>{
  const control={enabled:true,keys:new Set(['w']),stick:{x:0,y:0},sensitivity:1,pose:{x:0,z:0,yaw:0,crouch:false}};let checks=0;
  FirstPersonControls.prototype.update.call(control,.2,()=>{checks++;return true;});
  assert(Math.abs(control.pose.z+.49)<1e-12);assert.equal(checks,8);
});
