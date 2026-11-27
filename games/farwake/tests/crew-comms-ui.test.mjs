import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createCrewCommsUI,custodyPresentation,custodyGuidePrompt} from '../dist/crew-comms-ui.mjs';
import {TutorialRuntime} from '../dist/tutorial-runtime.mjs';

class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.textContent='';this.className='';this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
 append(...nodes){this.children.push(...nodes);}setAttribute(name,value){this.attributes[name]=value;}getBoundingClientRect(){return{width:300,height:44};}
}
const content=node=>[node.textContent,...node.children.map(content)].join(' ');
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),functions=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{const index=functions.findIndex(match=>match[1]===name);assert.ok(index>=0,name);return source.slice(functions[index].index,functions[index+1]?.index??source.length);};
const load=(names,values)=>{const context=vm.createContext(values);vm.runInContext(names.map(declaration).join('\n'),context);return context;};
const detained=()=>({phase:'detained',title:'Quarantine custody',captorName:'TCS Last Accord',factionId:'concord',vesselName:'Cinder',remainingSeconds:75,detail:'You are in the brig. Review your release conditions or reach the service panel.',factors:[{label:'Reason',value:'Unauthorized approach'}],actions:[{id:'petition',label:'Petition for release',detail:'Your standing determines the answer.',enabled:true},{id:'service',label:'Take a maintenance shift',enabled:false,reason:'Reach the service panel first.'},{id:'release',label:'Leave custody',enabled:false,reason:'Your review is still pending.'}]});
function fixture(){
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 const status={current:detained()},game={state:{mode:'person',multiplayer:{captainId:'captain-a'}},livingCrew:[{id:'crew-a',name:'Iona',health:100}],custodyStatus:()=>status.current};
 const dialog={opened:false,kind:null,body:new Element(),choicesList:[],open(title,kind){this.title=title;this.kind=kind;this.opened=true;this.body=new Element();this.choicesList=[];},choices(items){this.choicesList.push(...items);},close(){this.opened=false;this.kind=null;}};
 const calls=[],results=[],changes=[],contacts=[],network={connected:true},view={game,network};let respond=()=>Promise.resolve({ok:true});
 const ui=createCrewCommsUI({getGame:()=>view.game,getNetwork:()=>view.network,getAwareness:()=>({detail:'Ren aboard Cinder'}),getContacts:()=>contacts,dialog,
  invoke:(name,args)=>{calls.push({name,args});return respond();},acceptResult:answer=>results.push(answer),onChange:answer=>changes.push(answer),
  openCrew:()=>calls.push('manifest'),openOnline:()=>calls.push('shared'),openRecentMessages:()=>calls.push('messages')});
 return{ui,game,view,status,dialog,calls,results,changes,contacts,setRespond:fn=>respond=fn,cleanup(){if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}};
}

test('the comms hub contains on-demand people and message routes without exposing an absent nearby scene',()=>{
 const f=fixture();try{
  assert.equal(f.dialog.opened,false);f.ui.open();assert.equal(f.dialog.kind,'crew-comms');
  const copy=content(f.dialog.body);assert.match(copy,/Crew manifest/);assert.match(copy,/Shared crew & boarding/);assert.match(copy,/Recent messages/);assert.match(copy,/shared galaxy keeps moving/);
  assert.doesNotMatch(copy,/Within reach/);assert.equal(f.calls.length,0);assert.equal(f.game.state.mode,'person');
  f.contacts.push({id:'nearby-medic',label:'Talk with Mara',detail:'A conversation within reach',open:()=>f.calls.push('local-talk')});assert.equal(f.ui.refresh(),true);
  const row=f.dialog.body.children[0].children.find(node=>node.dataset.dialogKey==='contact:nearby-medic');assert.ok(row);row.onclick();assert.equal(f.calls.at(-1),'local-talk');
  f.contacts.length=0;row.onclick();assert.equal(f.calls.filter(value=>value==='local-talk').length,1,'The contact is revalidated immediately before opening.');
 }finally{f.cleanup();}
});

test('custody lists actual enabled actions and sends one acknowledged command without advancing time locally',async()=>{
 const f=fixture();try{
  let resolve;f.setRespond(()=>new Promise(done=>resolve=done));f.ui.openCustody();const before=f.status.current.remainingSeconds;
  const petition=f.dialog.choicesList.find(choice=>choice.id==='petition'),service=f.dialog.choicesList.find(choice=>choice.id==='service');assert.equal(service.disabled,true);assert.match(service.detail,/service panel/);
  const action=petition.action();petition.action();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{name:'custodyAction',args:{action:'petition'}});
  assert.ok(f.dialog.choicesList.filter(choice=>choice.id).every(choice=>choice.disabled));assert.equal(f.status.current.remainingSeconds,before);
  f.status.current={...f.status.current,remainingSeconds:25};resolve({ok:true,text:'Review recorded.'});await action;
  assert.equal(f.results.length,1);assert.equal(f.changes.length,1);assert.match(content(f.dialog.body),/25s/);
 }finally{f.cleanup();}
});

test('stale custody actions, closed panels and captain changes cannot apply an old UI acknowledgement',async()=>{
 const f=fixture();try{
  f.ui.openCustody();const petition=f.dialog.choicesList.find(choice=>choice.id==='petition');f.status.current={...f.status.current,phase:'towing'};
  await petition.action();assert.equal(f.calls.length,0,'A different custody phase must be reviewed first.');
  f.status.current=detained();let resolve;f.setRespond(()=>new Promise(done=>resolve=done));f.ui.openCustody();const pending=f.dialog.choicesList.find(choice=>choice.id==='petition').action();
  f.dialog.close();f.view.game={...f.game,state:{mode:'person',multiplayer:{captainId:'captain-b'}}};resolve({ok:true});await pending;
  assert.equal(f.dialog.opened,false);assert.equal(f.results.length,0);assert.equal(f.changes.length,0);
 }finally{f.cleanup();}
});

test('denied custody requests retain their failure receipt and do not present a successful change',async()=>{
 const f=fixture();try{f.setRespond(async()=>({ok:false,reason:'The review is unavailable.'}));f.ui.openCustody();await f.dialog.choicesList.find(choice=>choice.id==='petition').action();
  assert.equal(f.results[0].ok,false);assert.equal(f.changes.length,0);assert.equal(f.status.current.phase,'detained');
 }finally{f.cleanup();}
});

test('custody identifies the impounded ship and refreshes only when its displayed countdown changes',()=>{
 const f=fixture();try{
  f.ui.openCustody();assert.match(content(f.dialog.body),/Your ship · Cinder/);assert.doesNotMatch(content(f.dialog.body),/Aboard · Cinder/);
  const displayed=f.dialog.body;f.status.current.remainingSeconds=74.9;assert.equal(f.ui.refresh(),false);assert.equal(f.dialog.body,displayed);
  f.status.current.remainingSeconds=74;assert.equal(f.ui.refresh(),true);assert.match(content(f.dialog.body),/1m 14s/);
 }finally{f.cleanup();}
});

test('brig contacts open custody or their own observed dialogue without granting generic work rewards',async()=>{
 const f=fixture();try{
  let custodyOpened=0,invoked=0,html='';f.dialog.html=value=>html=value;
  const context=load(['handleEntity','contextLabel'],{game:f.game,getGunneryView:()=>({active:false}),crewCommsUI:{openCustody:()=>custodyOpened++},dialog:f.dialog,
   esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),invoke:()=>invoked++});
  await context.handleEntity({type:'work',name:'Ventilation service',data:{custodyAction:'service'}});
  assert.equal(custodyOpened,1);assert.equal(invoked,0);assert.equal(context.contextLabel({type:'work',data:{custodyAction:'service'}}),'Ventilation service');
  await context.handleEntity({type:'npc',name:'Waiting courier',text:'I saw <isolated lights>.',data:{custodyDialogue:true}});
  assert.equal(f.dialog.kind,'custody-dialogue');assert.equal(invoked,0);assert.match(html,/&lt;isolated lights&gt;/);
 }finally{f.cleanup();}
});

test('the app checks custody access before sending a restricted command and dispatches permitted custody choices',async()=>{
 const calls=[],game={militaryRecoveryAccess:()=>({ok:true}),custodyAccess:name=>name==='custodyAction'?{ok:true}:{ok:false,reason:'Use the brig liaison.'},custodyAction:action=>{calls.push(action);return{ok:true};}};
 const context=load(['performInvoke'],{game,testSession:null,network:null});
 const blocked=await context.performInvoke('travel',{id:'hearth'});assert.equal(blocked.ok,false);assert.equal(calls.length,0);
 assert.equal((await context.performInvoke('custodyAction',{action:'petition'})).ok,true);assert.deepEqual(calls,['petition']);
});

test('a detained captain gets a custody shortcut and no personal or station firing interpretation',async()=>{
 const f=fixture();try{
  f.game.state.person={health:100};f.game.state.npcContract={active:true,roleId:'gunner'};f.game.state.multiplayer.crewRole='weapons';let opened=0,invoked=0;
  const context=load(['currentPerspectiveAction','switchPerspective','personalAimAvailable','armedOnFoot','pointerAimAvailable'],{
   game:f.game,playing:true,dialog:f.dialog,actionPending:false,surface:{kind:'brig'},getGunneryView:()=>({active:true}),personalFireUsesShipStation:()=>false,
   setViewPanel(){},clearPerspectiveInput(){},crewCommsUI:{openCustody:()=>opened++},invoke:()=>invoked++,
  });
  assert.equal(context.currentPerspectiveAction().label,'Custody');assert.equal(context.currentPerspectiveAction().enabled,true);
  assert.equal(context.personalAimAvailable(),false);assert.equal(context.armedOnFoot(),false);assert.equal(context.pointerAimAvailable(),false);
  await context.switchPerspective();assert.equal(opened,1);assert.equal(invoked,0);assert.equal(f.game.state.mode,'person');
 }finally{f.cleanup();}
});

test('the actual brig HUD hides weapon status and offers Use only for a nearby interaction',()=>{
 const f=fixture();try{
  f.game.state.person={health:100,maxHealth:100};f.game.currentBody={name:'TCS Last Accord · holding deck'};const nodes=new Map(),classes=new Map();
  const $=id=>{if(!nodes.has(id)){const node=new Element();node.querySelector=()=>new Element('span');nodes.set(id,node);}return nodes.get(id);};
  const context=load(['personalAimAvailable','pointerAimAvailable','armedOnFoot','updateCombatHUD','updateMobileHUD'],{
   game:f.game,playing:true,surface:{kind:'brig'},getGunneryView:()=>({active:false}),personalFireUsesShipStation:()=>false,updateBatteryControls(){},$: $,settings:{},
   document:{body:{classList:{toggle:(name,value)=>classes.set(name,value)}}},hudText:(node,value)=>{node.textContent=value;},hudHTML(){},labelLayoutDirty:false,aboardDamageHull:()=>false,toolTrayOpen:false,
  });
  context.updateCombatHUD();context.updateMobileHUD({vx:0,vy:0,shield:35},{id:'service',name:'Ventilation service',type:'work',data:{custodyAction:'service'}});
  assert.equal($('combatPanel').hidden,true);assert.equal($('mobileWeapon').hidden,true);assert.equal(classes.get('combat-active'),false);assert.equal(classes.get('crew-gunner'),false);
  assert.equal($('mobileSpeed').textContent,'Holding deck');assert.equal($('fireButton').attributes['aria-label'],'Use · Ventilation service');assert.equal($('fireButton').dataset.custodyUse,'true');
  context.updateMobileHUD({vx:0,vy:0,shield:35},null);assert.equal($('fireButton').dataset.custodyUse,'false');assert.equal(classes.get('custody-detained'),true);
 }finally{f.cleanup();}
});

test('the actual Expert HUD keeps custody actionable in Situation while avoiding a duplicate automatic coach',()=>{
 const f=fixture();try{
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},settings={guidance:'expert'},tutorial=new TutorialRuntime({nonce:'custody-ui'});let shown='uninitialized';
  const context=load(['updateSituationHUD','updateGuidance','chooseGuidancePrompt'],{game:f.game,playing:true,testSession:null,$,settings,tutorial,custodyPresentation,custodyGuidePrompt,
   dialog:f.dialog,viewPanelOpen:false,labelLayoutDirty:false,document:{body:{classList:{toggle(){}}}},hudText:(node,value)=>{const changed=node.textContent!==value;node.textContent=value;return changed;},
   selectGuide:()=>tutorial.select({seed:'custody',mode:'expert'}),guidanceContext:()=>({playing:true,mode:'person',device:'touch',guidance:'expert'}),nearby:()=>null,
   showCoach:prompt=>shown=prompt,hideCoach:()=>shown=null,
  });context.updateSituationHUD();assert.equal($('situationButton').hidden,false);assert.match($('situationIdentity').textContent,/custody.*1m 15s/i);assert.match($('situationDetail').textContent,/release conditions/);
  context.updateGuidance();assert.equal(shown,null);
  const help=context.chooseGuidancePrompt({},null,{requested:true});assert.equal(help.critical,true);assert.match(help.body,/service panel/);assert.equal(tutorial.controller.count('dock'),0);
 }finally{f.cleanup();}
});

test('local capture and release events survive a guest ship-id change but never disclose another captain’s custody',()=>{
 const f=fixture();try{
  const events=[{type:'sol-tractor-captured',targetCaptainId:'captain-a',targetVesselId:'old-shared-hull',text:'Captured. Open custody for your options.'},{type:'sol-custody-release',targetCaptainId:'captain-a',targetVesselId:'old-shared-hull',text:'Released. Your ship is at Threshold.'},{type:'sol-tractor-warning',targetCaptainId:'captain-b',text:'Another captain’s lock.'},{type:'supercapital-warning',targetVesselId:'personal-hull',text:'Batteries acquiring your ship. Move away from the lanes.'},{type:'supercapital-warning',targetVesselId:'someone-else',text:'Their batteries.'}];
  f.game.state.ship={id:'personal-hull'};f.game.drainEvents=()=>events;let cleared=0;const notices=[];
  const context=load(['processEvents'],{game:f.game,updateRecovery(){},ensureSurface(){},surface:null,performance:{now:()=>0},sampleScoreContext:()=>({}),localSiteVisibility:()=>null,visibleSiteCombatEvent:event=>event,
   network:{passport:{captainId:'captain-a'}},testSession:null,touchLayout:true,audio:{musicEvent(){},play(){}},classifyMusicEvent:event=>event,recordGuideEvent(){},processCombatEvent:()=>false,
   controls:{clear:()=>cleared++},clearPointerAim(){},toast:(...args)=>notices.push(args),
  });context.processEvents();assert.equal(notices.length,3);assert.equal(notices[0][1],'bad');assert.equal(notices[1][1],'good');assert.equal(notices[2][1],'bad');assert.ok(notices.every(value=>value[3].priority==='urgent'));assert.equal(cleared,1);
 }finally{f.cleanup();}
});
