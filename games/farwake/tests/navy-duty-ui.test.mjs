import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavyDutyUI,navyOrderPrompt,navyOrderMatchesEntity} from '../dist/navy-duty-ui.mjs';

function fixture({ready=true,pending=null}={}){
 const view={active:true,id:'sortie',title:'Rescue watch',phase:'working',shipName:'FWS Steadfast',work:{watchSeconds:8,requiredWatchSeconds:55},target:{stationRole:'medical'},navyOperation:{brief:'Recover survivors.',rulesOfEngagement:'Hold fire. The launch is civilian.',stages:[{id:'triage',title:'Prepare medical',done:false}],activeTask:{id:'triage',title:'Prepare medical',brief:'Check the pressure suit and clear the medical berth.',stationRole:'medical',stationName:'Medical',ready,reason:ready?null:'Reach Medical.',choices:[{id:'oxygen',label:'Prepare oxygen and blankets'},{id:'cargo',label:'Clear a cargo pallet'}]}}};
 const game={state:{seed:'navy-ui',multiplayer:{captainId:'one'},npcContract:{id:'sortie',military:{branchId:'navy'}},crew:[{id:'npc-chief',name:'Chief Nara',role:'sailor',serviceCrew:true,dutyLabel:'Gunnery chief',department:'Weapons',activity:'Checking the battery feed',health:100}]},npcContractStatus:()=>view};
 const dialog={opened:false,revision:0,items:[],open(title,kind){Object.assign(this,{title,kind,opened:true,items:[]});this.revision++;},html(text){this.markup=text;},choices(items){this.items.push(...items);},close(){this.opened=false;this.revision++;}};
 const calls=[],markers=[],refreshes=[];
 const ui=createNavyDutyUI({getGame:()=>game,dialog,invoke:async(command,args)=>{calls.push({command,args});return pending?await pending:{ok:true};},acceptResult:answer=>answer.ok,refreshWorld:()=>refreshes.push(true),markEntity:target=>markers.push(target)});
 return{ui,dialog,game,view,calls,markers,refreshes,choose:label=>dialog.items.find(item=>item.label===label)};
}

test('navy orders display fire discipline and submit only the authored task and choice',async()=>{
 const f=fixture();assert.equal(f.ui.open(),true);assert.match(f.dialog.markup,/Hold fire/);assert.match(f.dialog.markup,/Service pay and promotion credit are recorded at debrief/);assert.doesNotMatch(f.dialog.markup,/0 CR/);
 await f.choose('Prepare oxygen and blankets').action();assert.deepEqual(f.calls,[{command:'npcContractAction',args:{action:'navyOrder',taskId:'triage',choiceId:'oxygen'}}]);assert.equal(f.dialog.opened,false);assert.equal(f.refreshes.length,1);
});

test('out-of-position and stale orders cannot be submitted from the UI',async()=>{
 const f=fixture({ready:false});f.ui.open();assert.equal(f.choose('Prepare oxygen and blankets').disabled,true);await f.choose('Prepare oxygen and blankets').action();assert.equal(f.calls.length,0);
 f.view.navyOperation.activeTask.ready=true;f.ui.open();const old=f.choose('Prepare oxygen and blankets');f.view.navyOperation.activeTask={...f.view.navyOperation.activeTask,id:'different'};await old.action();assert.equal(f.calls.length,0);
});

test('duplicate submissions and a late reply after changing captain do not change the new view',async()=>{
 let resolve;const f=fixture({pending:new Promise(done=>{resolve=done;})});f.ui.open();const first=f.choose('Prepare oxygen and blankets').action();await f.choose('Prepare oxygen and blankets').action();assert.equal(f.calls.length,1);
 f.game.state.multiplayer.captainId='two';resolve({ok:true});await first;assert.equal(f.dialog.opened,true);assert.equal(f.refreshes.length,0);
});

test('a late Navy order response cannot close a different dialog',async()=>{
 let resolve;const f=fixture({pending:new Promise(done=>{resolve=done;})});f.ui.open();const first=f.choose('Prepare oxygen and blankets').action();f.dialog.open('Settings','settings');resolve({ok:true});await first;assert.equal(f.dialog.kind,'settings');assert.equal(f.dialog.opened,true);
});

test('station markers and ship company use actual duty targets and persisted crew',()=>{
 const f=fixture();f.ui.open();f.choose('Show my assigned station').action();assert.deepEqual(f.markers,[{stationRole:'medical'}]);f.ui.openCompany();assert.match(f.dialog.markup,/Chief Nara/);assert.match(f.dialog.markup,/Checking the battery feed/);assert.match(f.dialog.markup,/Gunnery chief/);
 f.game.state.crew[0].health=0;f.ui.openCompany();assert.match(f.dialog.markup,/Lost in service/);
});

test('gunnery coaching sends sailors to an ordered non-weapon station without telling them to fire',()=>{
 const f=fixture();let prompt=navyOrderPrompt(f.view,{gunnery:true});assert.match(prompt.body,/Hold fire/);assert.match(prompt.body,/Return to the deck/);assert.equal(prompt.controlTarget,'objectiveDetails');
 f.view.navyOperation.activeTask={...f.view.navyOperation.activeTask,running:true,elapsed:3,duration:12};prompt=navyOrderPrompt(f.view);assert.match(prompt.body,/3 \/ 12s/);assert.match(prompt.body,/Stay at Medical/);
 assert.equal(navyOrderPrompt({active:true}),null);
});

test('verified contact reports are visible beside the response choices and cannot inject markup',()=>{
 const f=fixture();f.view.navyOperation.report='Signals: <registry confirmed>. Release the civilian.';f.ui.open();assert.match(f.dialog.markup,/Verified bridge report/);assert.match(f.dialog.markup,/&lt;registry confirmed&gt;/);
});

test('mission station interactions match exact objects and preserve unrelated stations',()=>{
 const f=fixture();f.view.navyOperation.activeTask.target={entityId:'ship:sortie:crew-console'};
 assert.equal(navyOrderMatchesEntity(f.view,{id:'ship:sortie:crew-console'}),true);assert.equal(navyOrderMatchesEntity(f.view,{id:'ship:other:crew-console'}),false);
 f.view.navyOperation.activeTask.target={stationRole:'weapons'};assert.equal(navyOrderMatchesEntity(f.view,{data:{stationRole:'security'}}),true);assert.equal(navyOrderMatchesEntity(f.view,{data:{stationRole:'helm'}}),false);
});

test('casualty transfer guidance keeps the gunner defending before suggesting medical work',()=>{
 const f=fixture();Object.assign(f.view.navyOperation.activeTask,{ready:false,combatFirst:true,reason:'Clear the marked attackers before transferring casualties.'});
 const prompt=navyOrderPrompt(f.view,{gunnery:true});assert.match(prompt.body,/Clear the marked attackers/);assert.doesNotMatch(prompt.body,/Return to the deck/);assert.equal(prompt.controlTarget,'fireButton');
 f.view.phase='returning';f.view.task='The commander is returning to Morrow.';assert.equal(navyOrderPrompt(f.view).body,f.view.task);
});
