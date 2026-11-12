import test from 'node:test';
import assert from 'node:assert/strict';
import {GuidanceController} from '../dist/guidance.mjs';
import {guidanceActionsForResult,localGuidanceEvent} from '../dist/guidance-evidence.mjs';

test('practice credits confirmed personal actions without crediting failed orders or another mount selection',()=>{
 const guide=new GuidanceController({profileId:'crew-test'}),context={device:'touch',gunnery:{batteryId:'fore'}};
 const record=(name,args,answer,before=context)=>guidanceActionsForResult(name,args,answer,before).forEach((action,index)=>guide.record({action,id:`${name}:${args.batteryId||args.action||''}:${index}`,success:true},context));
 record('militaryCareerAction',{action:'joinOperation'},{ok:false,reason:'The unit has departed.'});
 record('npcContractAction',{action:'navyOrder'},{ok:false,code:'procedure'});
 record('selectGunneryBattery',{batteryId:'fore'},{ok:true});
 assert.equal(guide.count('military-muster'),0);assert.equal(guide.count('navy-order'),0);assert.equal(guide.count('gunnery-battery'),0);
 record('selectGunneryBattery',{batteryId:'port'},{ok:true});
 record('militaryCareerAction',{action:'joinOperation'},{ok:true});
 record('npcContractAction',{action:'navyOrder'},{ok:true});
 assert.equal(guide.count('gunnery-battery'),1);assert.equal(guide.count('military-muster'),1);assert.equal(guide.count('navy-order'),1);
 record('boardShip',{vesselId:'own'},{ok:true},{ownedVesselId:'own'});
 assert.equal(guide.count('board-friend'),0,'Returning to your own hull is not joining a friend.');
});

test('both real passenger exit paths earn arrival only after a confirmed docked passage',()=>{
 const underway={recovery:{passage:true,passagePhase:'outbound'}},docked={recovery:{passage:true,passagePhase:'docked'}};
 for(const method of ['disembark','completeNpcContract']){
  assert.ok(!guidanceActionsForResult(method,{}, {ok:false},docked).includes('passage-arrive'));
  assert.ok(!guidanceActionsForResult(method,{}, {ok:true},underway).includes('passage-arrive'));
  assert.ok(guidanceActionsForResult(method,{}, {ok:true},docked).includes('passage-arrive'));
 }
 assert.deepEqual(guidanceActionsForResult('takePassengerTransit',{}, {ok:true}),['passage-book','passage-arrive']);
 assert.deepEqual(guidanceActionsForResult('startMilitaryPassage',{}, {ok:true}),['service-return']);
 assert.deepEqual(guidanceActionsForResult('completeNpcContract',{}, {ok:true},{duty:{canFinish:true}}),['disembark'],'Ending a docked watch is going ashore, not booking transport.');
});

test('NPC and crewmate shooting cannot complete a passenger’s combat lessons',()=>{
 assert.equal(localGuidanceEvent({type:'shot',ownerId:'local',shooterId:'npc-vale'},'local'),false);
 assert.equal(localGuidanceEvent({type:'shot',ownerId:'ada',shooterId:'lin'},'ada',{shared:true}),false);
 assert.equal(localGuidanceEvent({type:'shot',shooterId:'lin'},'lin',{shared:true}),true);
 assert.equal(localGuidanceEvent({type:'person-hit',attackerId:'local'},'local'),true);
 assert.equal(localGuidanceEvent({type:'mined',ownerId:'ada'},'ada',{shared:true}),true);
 assert.equal(localGuidanceEvent({type:'shot'},'local'),false);
});
