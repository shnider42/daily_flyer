import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRecoveryReportUI,recoveryReportMarkup,recoveryNextStep,hostileBoardingBrief} from '../dist/recovery-report-ui.mjs';
import {createLivelihoodUI} from '../dist/livelihood-ui.mjs';
import {RecoveryTransition} from '../dist/recovery-presentation.mjs';
import {MEDICAL_WAKE_SECONDS} from '../dist/medical-recovery.mjs';

const home={systemId:'hearth',bodyId:'morrow',name:'Morrow'};
const hospital={systemId:'crosswind',bodyId:'crosswind-vey',name:'Freewake medical tent',kind:'hospital'};
const crew=Array.from({length:8},(_,index)=>({id:'own-'+index,name:'Crew '+(index+1),role:index===2?'medic':'engineer',species:'human',health:45+index,maxHealth:100,status:'recovered',personal:true,participated:true,location:hospital}));
function fixture({reportPatch={},whereabouts,invoke:handle}={}){
 const report={id:'incident-1',at:180,title:'Recovery after boarding',sourceKind:'boarding',cause:'You lost consciousness during the boarding action.',source:{systemId:'crosswind',name:'Crosswind',vesselName:'Meridian cruiser'},ship:{id:'cinder',name:'Cinder',classId:'osprey',status:'intact',location:{systemId:'crosswind',name:'Crosswind space'}},crew:structuredClone(crew),reserveCount:0,recoveryDestination:hospital,losses:{shipLost:false,cargo:0,upgrades:0,credits:0},home,arrival:{arrived:false,acknowledged:false},evacuation:{home,evacuation:true,canBook:true,nearPickup:true,fare:0,pickup:{...hospital,bodyName:'Vey',entityId:'field-medic:freewake',x:150,y:250,distance:20}},...reportPatch};
 const state={seed:'recovery-ui',mode:'person',systemId:'crosswind',locationId:'crosswind-vey',interior:null,ship:{name:'Cinder',hull:190,maxHull:230},npcContract:null};
 const game={state,recoveryReport:id=>!id||id===report.id?report:null,recoveryReports:()=>[report],npcContractStatus:()=>null,crewWhereabouts:()=>whereabouts||{groups:[{id:'recovered-1',kind:'recovered',label:'Your recovered crew',crew:report.crew,location:hospital,canRejoin:false,reason:'Your ship is not at this port.'}]}};
 const calls=[],marks=[],navigation=[];let refreshes=0;
 const dialog={opened:false,revision:0,items:[],markup:'',open(title,kind,options){this.opened=true;this.title=title;this.kind=kind;this.options=options;this.revision++;this.items=[];this.markup='';},html(value){this.markup=value;},choices(items){this.items.push(...items);},close(){this.opened=false;this.revision++;}};
 dialog.body={insertAdjacentHTML(_where,value){dialog.markup+=value;}};
 const ui=createRecoveryReportUI({getGame:()=>game,dialog,invoke:async(name,args)=>{calls.push({name,args});if(handle)return handle(name,args);if(name==='acknowledgeRecoveryReport')report.arrival.acknowledged=true;return{ok:true};},acceptResult:answer=>!!answer.ok,onChange:()=>refreshes++,markEntity:target=>marks.push(target),openDuty:()=>navigation.push('duty'),openCompany:()=>navigation.push('company'),openCrewManagement:()=>navigation.push('management')});
 return{ui,game,report,dialog,calls,marks,navigation,refreshes:()=>refreshes};
}

test('the post-wake report names all eight people and distinguishes observed outcomes from unknown causes',()=>{
 const f=fixture();f.report.crew[2].status='dead';f.report.crew[2].health=0;f.report.crew[3].status='unknown';f.report.crew[3].location=null;f.report.cause=null;f.report.legacy=true;
 f.ui.open();
 assert.equal(f.dialog.kind,'recovery-report');
 for(const member of crew)assert.match(f.dialog.markup,new RegExp(member.name));
 assert.match(f.dialog.markup,/Died/);assert.match(f.dialog.markup,/Not accounted for/);assert.match(f.dialog.markup,/Location not recorded/);
 assert.match(f.dialog.markup,/does not establish what caused/);assert.match(f.dialog.markup,/older save/);
 assert.match(f.dialog.markup,/Cinder.*Intact/);assert.doesNotMatch(f.dialog.markup,/Recorded losses/);
 assert.equal(f.calls.length,0,'Reading is not an authority mutation.');
});

test('the report waits through the blackout and existing menus, then shows each arrival once and keeps review history',async()=>{
 const f=fixture();assert.equal(f.ui.sync({blocked:true}),false);assert.equal(f.dialog.opened,false);
 assert.equal(f.ui.sync({blocked:false}),true);assert.equal(f.dialog.kind,'recovery-report');f.dialog.close();assert.equal(f.ui.sync(),false);
 f.report.arrival.arrived=true;f.report.evacuation.arrived=true;
 f.dialog.open('An existing conversation','npc');assert.equal(f.ui.sync({blocked:f.dialog.opened}),false);assert.equal(f.dialog.kind,'npc');
 f.dialog.close();assert.equal(f.ui.sync(),true);assert.match(f.dialog.title,/Return to Morrow/);
 await f.dialog.items.find(choice=>/Acknowledge return/.test(choice.label)).action();
 assert.deepEqual(f.calls,[{name:'acknowledgeRecoveryReport',args:{id:'incident-1'}}]);assert.equal(f.report.arrival.acknowledged,true);assert.equal(f.ui.sync(),false);
 f.ui.openHistory();assert.equal(f.dialog.kind,'recovery-history');assert.ok(f.dialog.items.some(choice=>choice.label===f.report.title));
 f.dialog.items.find(choice=>choice.label===f.report.title).action();assert.match(f.dialog.markup,/Crew 8/,'Acknowledging arrival does not remove the named account.');
});

test('finishing the eyes animation cannot pause the last fraction of medical recovery behind an unusable report',()=>{
 const f=fixture(),transition=new RecoveryTransition();
 Object.assign(f.game.state,{stats:{time:0},person:{health:60,down:false},medicalRecovery:{id:'wake-1',wakeUntil:MEDICAL_WAKE_SECONDS,destination:hospital}});
 f.game.medicalRecoveryActive=()=>f.game.state.stats.time<f.game.state.medicalRecovery.wakeUntil;
 transition.update(f.game.state,0);let view;
 for(let frame=0;frame<100&&transition.active;frame++){f.game.state.stats.time+=.1;view=transition.update(f.game.state,.1);}
 assert.equal(view.finished,true);assert.equal(f.game.medicalRecoveryActive(),true,'The animation finishes just before the authoritative wake window.');
 assert.equal(f.ui.sync({blocked:transition.active}),false);assert.equal(f.dialog.opened,false,'Solo simulation must continue until boarding is available.');
 f.game.state.stats.time+=.2;assert.equal(f.ui.sync(),true);assert.ok(f.dialog.items.some(choice=>/Board for Morrow/.test(choice.label)));
});

test('free departure displays its destination and calls only the real transport command',async()=>{
 const f=fixture();f.ui.open();const board=f.dialog.items.find(choice=>/Board for Morrow/.test(choice.label));
 assert.ok(board);assert.match(board.label,/Free/);assert.match(board.detail,/0 CR/);assert.match(f.dialog.markup,/Evacuation to Morrow/);
 await board.action();assert.deepEqual(f.calls,[{name:'startMilitaryPassage',args:{}}]);assert.equal(f.dialog.opened,false);assert.equal(f.refreshes(),1);
});

test('a distant pickup has a real navigation action and never permits remote boarding',()=>{
 const f=fixture();Object.assign(f.report.evacuation,{canBook:false,nearPickup:false,reason:'Return to the field hospital.'});f.report.evacuation.pickup.distance=420;
 f.ui.open();assert.equal(f.dialog.items.some(choice=>/Board for/.test(choice.label)),false);assert.match(f.dialog.markup,/420 m away/);
 f.dialog.items.find(choice=>/Show evacuation pickup/.test(choice.label)).action();assert.equal(f.dialog.opened,false);
 assert.deepEqual(f.marks,[f.report.evacuation.pickup]);assert.equal(f.calls.length,0);
});

test('the transport next step becomes disembark at the actual destination, never a second booking',async()=>{
 const f=fixture();Object.assign(f.report.evacuation,{passage:true,canBook:false});f.game.npcContractStatus=()=>({canFinish:true,destination:home,task:'Use the entry airlock at Morrow.'});
 assert.equal(recoveryNextStep(f.report,f.game.npcContractStatus()).kind,'disembark');await f.ui.primary();
 assert.deepEqual(f.calls,[{name:'completeNpcContract',args:{}}]);
});

test('personal waiting crew and the current Navy company remain separate and navigable',()=>{
 const waiting=crew.map(person=>({...person,status:'waiting',participated:false,location:home}));
 const f=fixture({whereabouts:{groups:[{id:'personal',kind:'personal',label:'Your personal crew',location:home,ship:{name:'Cinder'},crew:waiting},{id:'service',kind:'service',label:'Navy ship’s company',location:{name:'Dawnwatch'},crew:[{id:'officer',name:'Captain Navarre',role:'captain',status:'aboard',personal:false,location:{name:'Dawnwatch'}}]}]}});
 f.game.state.npcContract={active:true,military:{branchId:'navy'}};f.ui.openCrew();
 assert.match(f.dialog.markup,/Your personal crew/);assert.match(f.dialog.markup,/Navy ship’s company/);assert.match(f.dialog.markup,/Crew 8/);assert.match(f.dialog.markup,/Captain Navarre/);assert.match(f.dialog.markup,/Waiting/);
 f.dialog.items.find(choice=>/Current Navy ship/.test(choice.label)).action();assert.deepEqual(f.navigation,['company']);
 assert.equal(f.dialog.items.some(choice=>/hiring/.test(choice.label)),false,'Personal hiring is not offered on an employer’s ship.');
});

test('recovered crew can be marked nearby and rejoin only through their exact authority group',async()=>{
 const group={id:'evacuated-eight',kind:'recovered',label:'Your survivors',location:hospital,crew:structuredClone(crew),canRejoin:false,reason:'Bring your own ship to this port.'};
 const f=fixture({whereabouts:{groups:[group]}});f.ui.openCrew();let rejoin=f.dialog.items.find(choice=>/Bring survivors aboard/.test(choice.label));
 assert.equal(rejoin.disabled,true);assert.match(rejoin.detail,/own ship/);
 f.dialog.items.find(choice=>/Show these survivors/.test(choice.label)).action();assert.deepEqual(f.marks,[{crewId:'own-0'}]);
 group.canRejoin=true;group.reason=null;f.ui.openCrew();rejoin=f.dialog.items.find(choice=>/Bring survivors aboard/.test(choice.label));assert.equal(rejoin.disabled,false);await rejoin.action();
 assert.deepEqual(f.calls,[{name:'rejoinRecoveredCrew',args:{groupId:'evacuated-eight'}}]);assert.equal(f.dialog.kind,'crew-whereabouts');
});

test('a delayed command cannot close a newer menu or replace its contents',async()=>{
 let release;const f=fixture({invoke:()=>new Promise(resolve=>release=resolve)});f.ui.open();const result=f.dialog.items.find(choice=>/Board for/.test(choice.label)).action();
 f.dialog.open('Another conversation','npc');release({ok:true});await result;
 assert.equal(f.dialog.kind,'npc');assert.equal(f.dialog.opened,true);assert.equal(f.refreshes(),1);
});

test('hostile boarding briefs count the real current allies and expose the actual origin hull',()=>{
 const game={state:{ship:{name:'Osprey Dawn',hull:125,maxHull:230},casualCrew:{requestedCount:500}},livingCrew:[...crew.slice(0,3),{id:'dead',name:'Lost member',health:0,status:'dead'}]};
 const brief=hostileBoardingBrief(game,{name:'Enemy capital'});assert.equal(brief.allyCount,3);assert.equal(brief.names.length,3);assert.match(brief.text,/3 allied NPCs/);assert.match(brief.exposure,/Osprey Dawn.*125\/230/);assert.match(brief.exposure,/outside fire/);assert.doesNotMatch(brief.text,/500/);
});

test('Navy and transport duty menus retain a path to personal crew and recovery records',()=>{
 const f=fixture();let crewOpened=0,reportsOpened=0;const noop=()=>{};
 const ui=createLivelihoodUI({getGame:()=>f.game,dialog:f.dialog,invoke:noop,acceptResult:noop,refreshWorld:noop,markEntity:noop,openJobs:noop,openShipyard:noop,openProfile:noop,openDamage:noop,openNavyDuty:()=>{f.dialog.open('Current orders','navy-duty');return true;},openCrewWhereabouts:()=>crewOpened++,openRecoveryReport:()=>reportsOpened++});
 ui.openDuty();f.dialog.items.find(choice=>/personal crew/.test(choice.label)).action();f.dialog.items.find(choice=>/Recovery & return report/.test(choice.label)).action();assert.equal(crewOpened,1);assert.equal(reportsOpened,1);
});

const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
function declaration(name){const index=declarations.findIndex(match=>match[1]===name);assert.ok(index>=0);return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);}

test('the shipped Crew handler opens the personal roster during Navy duty, not just the service company',async()=>{
 let own=0,company=0;const context=vm.createContext({testSession:null,game:{state:{npcContract:{active:true,military:{branchId:'navy'}}}},recoveryReportUI:{openCrew:()=>own++},navyDutyUI:{openCompany:()=>company++}});
 vm.runInContext(declaration('openCrew'),context);await context.openCrew();assert.equal(own,1);assert.equal(company,0);
});

test('the shipped local command transport forwards report and survivor group identities',async()=>{
 const calls=[],game={state:{npcContract:null},militaryRecoveryAccess:()=>({ok:true}),acknowledgeRecoveryReport:id=>{calls.push(['ack',id]);return{ok:true};},rejoinRecoveredCrew:id=>{calls.push(['rejoin',id]);return{ok:true};}};
 const context=vm.createContext({game,network:null,testSession:null});vm.runInContext(declaration('performInvoke'),context);
 await context.performInvoke('acknowledgeRecoveryReport',{id:'receipt-owner-1'});await context.performInvoke('rejoinRecoveredCrew',{groupId:'survivors-owner-1'});
 assert.deepEqual(calls,[['ack','receipt-owner-1'],['rejoin','survivors-owner-1']]);
});
