import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpeningUI, openingPrompt } from '../dist/opening-ui.mjs';

function fixture({branch='regular',stageId='meet',answer={ok:true},pending=null}={}){
 const calls=[],markers=[],messages=[],dialog={opened:false,choicesList:[],open(title,kind){this.title=title;this.kind=kind;this.opened=true;},html(value){this.markup=value;},choices(value){this.choicesList=value;},close(){this.opened=false;}};
 const state={seed:'intro-ui',credits:180,cargo:{ore:2},locationId:branch==='hardcore'?'morrow':'kettle'};
 const mission={active:true,title:'A small favor',branch,stageId,objective:'Meet the dockworker.',reward:35,canFinish:stageId==='return',contactIds:['kettle:dockworker','morrow:courier'],contactEntityId:branch==='hardcore'&&stageId!=='return'?'morrow:courier':'kettle:dockworker',target:{systemId:'hearth',bodyId:'kettle',entityId:'kettle:dockworker'}};
 const game={state,atInhabitedPort:true,openingMissionStatus:()=>mission};
 const ui=createOpeningUI({getGame:()=>game,dialog,invoke:async(name,args)=>{calls.push({name,args});return pending?await pending:answer;},acceptResult:r=>r.ok,track:target=>markers.push(target),openPassage:()=>calls.push('passage'),openConversation:entity=>calls.push({ordinary:entity.id}),dialogueHeader:(_e,text)=>{dialog.words=text;},toast:(...args)=>messages.push(args),document:{createElement:()=>({children:[],append(value){this.children.push(value);}})}});
 const choose=label=>dialog.choicesList.find(choice=>choice.label===label);
 return {state,mission,game,ui,dialog,calls,markers,messages,choose};
}
test('ordinary NPCs and finished missions retain ordinary conversation',()=>{
 const f=fixture();assert.equal(f.ui.openContact({id:'kettle:mechanic'}),false);assert.equal(f.dialog.opened,false);
 f.mission.active=false;assert.equal(f.ui.openContact({id:'kettle:dockworker'}),false);assert.equal(f.ui.openLog(),false);assert.equal(f.calls.length,0);
});
test('accepting the offered job sends contact identity, never a requested stage or reward',async()=>{
 const f=fixture();assert.equal(f.ui.openContact({id:'kettle:dockworker',name:'Dockworker'}),true);
 assert.equal(f.calls.length,0);await f.choose('I can do that').action();
 assert.deepEqual(f.calls,[{name:'openingAction',args:{action:'accept',entityId:'kettle:dockworker'}}]);assert.equal(f.dialog.opened,false);assert.equal(f.markers.length,1);
});
test('a rejected completion keeps the contact open and cannot present a payment',async()=>{
 const f=fixture({stageId:'return',answer:{ok:false,reason:'The ore is aboard a remote ship.'}});
 f.ui.openContact({id:'kettle:dockworker',name:'Dockworker'});await f.choose('Hand it over · collect 35 CR').action();
 assert.equal(f.dialog.opened,true);assert.equal(f.messages.length,0);assert.equal(f.markers.length,0);assert.equal(f.state.credits,180);
});
test('rapid repeated completion submits one command and changing captain ignores its late presentation',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;}),f=fixture({stageId:'return',pending});
 f.ui.openContact({id:'kettle:dockworker',name:'Dockworker'});const action=f.choose('Hand it over · collect 35 CR').action;
 const first=action();await action();assert.equal(f.calls.length,1);f.state.seed='another-voyage';resolve({ok:true});await first;
 assert.equal(f.messages.length,0);assert.equal(f.markers.length,0);
});
test('skipping is available from the job log without contacting an NPC or granting a reward',async()=>{
 const f=fixture({stageId:'ore'});f.ui.openLog();await f.choose('Leave this job and explore').action();
 assert.deepEqual(f.calls,[{name:'openingAction',args:{action:'skip'}}]);assert.equal(f.state.credits,180);
});
test('Hardcore opens the existing priced passenger departures instead of granting a hull',()=>{
 const f=fixture({branch:'hardcore',stageId:'passage'});f.ui.openLog();f.choose('Passenger departures').action();
 assert.deepEqual(f.calls,['passage']);assert.match(f.dialog.markup,/Book a normal passenger fare/);assert.equal(f.state.credits,180);
});
test('route hints distinguish walking, interacting, boarding, mining, and docking controls',()=>{
 const status={active:true,stageId:'meet',objective:'Meet the dockworker.',target:{bodyId:'kettle',entityId:'kettle:dockworker'}};
 assert.equal(openingPrompt(status,{touch:true}).controlTarget,'stick');
 assert.equal(openingPrompt(status,{touch:true,nearby:{id:'kettle:dockworker'}}).controlTarget,'contextButton');
 status.stageId='ore';assert.equal(openingPrompt(status,{touch:true,perspective:{label:'Board Cinder'}}).controlTarget,'modePill');
 assert.equal(openingPrompt(status,{mode:'ship',touch:true,mining:{inRange:true,holdFull:false}}).controlTarget,'mineButton');
 status.stageId='return';assert.equal(openingPrompt(status,{mode:'ship',touch:true,nearby:{type:'dock',id:'kettle'}}).controlTarget,'contextButton');
 assert.equal(openingPrompt({active:false},{}),null);
});
test('depleted mining routes point back to the dock rather than offering an impossible mine action',()=>{
 const status={active:true,stageId:'ore',fallbackAvailable:true,objective:'Return the relay report.',target:{bodyId:'kettle',entityId:'kettle:dockworker'}};
 const p=openingPrompt(status,{mode:'ship',touch:true,mining:{inRange:true}});assert.notEqual(p.controlTarget,'mineButton');assert.match(p.body,/marked port/);
});
