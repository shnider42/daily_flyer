import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { crewAwareness } from '../dist/crew-awareness.mjs';

// Run the real HUD handlers with only browser boundaries replaced.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{
 const index=declarations.findIndex(match=>match[1]===name);assert.ok(index>=0,name);
 return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);
};
const code=['updateConnectionHUD','showCoach','hideCoach','requestActionHelp'].map(declaration).join('\n');
function classes(){const values=new Set();return{add(...names){names.forEach(name=>values.add(name));},remove(...names){names.forEach(name=>values.delete(name));},contains:name=>values.has(name),toggle(name,force){const add=force??!values.has(name);add?values.add(name):values.delete(name);return add;}};}
function fixture(){
 const elements=new Map(),body={classList:classes()},element=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',hidden:id==='coachCard',title:'',attributes:{},classList:classes(),setAttribute(key,value){this.attributes[key]=String(value);},getBoundingClientRect(){return{width:100,height:44};}});
  return elements.get(id);
 };
 const prompt={id:'board-friend',title:'Board Cinder',body:'Open Crew, then board Cinder at Kettle.',compactBody:'Crew → Board Cinder',flow:'route',controlTarget:'onlineButton'};
 const game={state:{systemId:'hearth',mode:'person',locationId:'kettle',multiplayer:{captainId:'ada',aboardVesselId:'cinder',dockedAt:'kettle'}},galaxy:[{id:'hearth',name:'Hearth',bodies:[{id:'kettle',name:'Kettle Station'},{id:'morrow',name:'Morrow'}]}],militaryRecoveryStatus:()=>null};
 const snapshot={realm:{name:'Test galaxy',online:2},fleet:[{id:'cinder',name:'Cinder',systemId:'hearth',dockedAt:'kettle'}],presence:[{captainId:'ada',name:'Ada',online:true,systemId:'hearth',vesselId:'cinder'},{captainId:'jade',name:'Jade',online:true,systemId:'hearth',roomKind:'surface',locationId:'morrow',vesselId:null}]};
 const context=vm.createContext({playing:true,chooseGuidancePrompt:(_,prompt)=>prompt,crewAwareness,game,onlineSnapshot:snapshot,network:{connected:true},$:element,document:{body},window:{innerHeight:926},touchLayout:true,settings:{compactTips:true,textScale:1,guidance:'simple'},coachPrompt:null,coachExpanded:false,labelLayoutDirty:false,highlightedControl:null,toolTrayOpen:false,
  hudText(target,value){const changed=target.textContent!==value;target.textContent=value;return changed;},setToolTray(){},dialog:{close(){}},selectGuide(){},guidanceContext:()=>({}),activeMilitaryCareer:()=>null,getGunneryView:()=>({active:false}),routePrompt:()=>prompt,tutorial:{update(){},present:(prompt,context,options)=>({...prompt,requested:!!options?.requested}),controller:{requestHelp:()=>prompt,repeat:()=>prompt}},dismissedRoute:'',dismissedGuideEpisode:'',hudDirty:false,
 });
 vm.runInContext(code,context);return{context,element,body,prompt,snapshot};
}

test('the phone header distinguishes sharing a galaxy from actually sharing a crew',()=>{
 const f=fixture();f.context.updateConnectionHUD();
 assert.equal(f.element('networkLabel').textContent,'Crew');
 assert.match(f.element('onlineButton').attributes['aria-label'],/Jade · Morrow.*2 online/);
 f.snapshot.presence[1].vesselId='cinder';f.context.updateConnectionHUD();
 assert.equal(f.element('networkLabel').textContent,'Crew 2');
 assert.match(f.element('onlineButton').attributes['aria-label'],/Jade aboard Cinder/);
 f.snapshot.presence[1].online=false;f.context.updateConnectionHUD();
 assert.equal(f.element('networkLabel').textContent,'Crew','a disconnected captain is not counted as a live crewmate');
});

test('reconnecting and departure states replace stale crew claims without losing the shared route',()=>{
 const f=fixture();f.context.network.connected=false;f.context.updateConnectionHUD();
 assert.equal(f.element('networkLabel').textContent,'Crew …');
 assert.match(f.element('onlineButton').attributes['aria-label'],/connection is being restored/);
 f.context.network.connected=true;f.context.game.state.multiplayer.waitingForGroupStart=true;f.context.updateConnectionHUD();
 assert.equal(f.element('networkLabel').textContent,'Departure');
 f.context.network=null;f.context.updateConnectionHUD();
 assert.equal(f.element('networkLabel').textContent,'Crew');
 assert.match(f.element('onlineButton').attributes['aria-label'],/Create or join a shared galaxy/);
});

test('compact mobile guidance expands without covering the screen by default or highlighting the wrong menu',()=>{
 const f=fixture();f.context.showCoach(f.prompt);
 assert.equal(f.element('coachBody').hidden,true);assert.equal(f.element('coachCopy').attributes.role,'button');
 assert.equal(f.element('coachCopy').attributes['aria-expanded'],'false');
 assert.equal(f.element('onlineButton').classList.contains('coach-highlight'),true);
 assert.equal(f.element('pauseButton').classList.contains('coach-highlight'),false);
 f.context.labelLayoutDirty=false;f.context.coachExpanded=true;f.context.showCoach(f.prompt);
 assert.equal(f.element('coachBody').hidden,false);assert.equal(f.element('coachBody').textContent,f.prompt.body);
 assert.equal(f.element('coachCopy').attributes['aria-describedby'],'coachBody');assert.equal(f.context.labelLayoutDirty,true);
});

test('explicit Action help expands even the same dismissed detail and remains collapsible afterward',()=>{
 const f=fixture();f.context.showCoach(f.prompt);f.context.requestActionHelp();
 assert.equal(f.element('coachBody').hidden,false);assert.equal(f.context.coachExpanded,true);
 f.context.coachExpanded=false;f.context.showCoach(f.context.coachPrompt);
 assert.equal(f.element('coachBody').hidden,true);
 f.context.requestActionHelp();assert.equal(f.element('coachBody').hidden,false);
});

test('full-tip preference and desktop keep their explanations visible',()=>{
 for(const change of[{touchLayout:false},{settings:{compactTips:false,textScale:1.4,guidance:'simple'}}]){
  const f=fixture();Object.assign(f.context,change);f.context.showCoach(f.prompt);
  assert.equal(f.element('coachBody').hidden,false);assert.equal(f.element('coachCopy').attributes.role,'group');
 }
});
