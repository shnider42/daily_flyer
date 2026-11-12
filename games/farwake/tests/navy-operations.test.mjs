import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,distance} from '../dist/engine.mjs';
import {cabinLayout} from '../dist/fleet.mjs';
import {gunneryOrigin} from '../dist/gunnery.mjs';
import {stepNpcContract,navyParticipantReceipt,settleNavyParticipant} from '../dist/npc-contracts.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const mission=(extra={})=>({id:'navy-runtime-watch',factionId:'freewake',branchId:'navy',title:'Border watch',systemId:'hearth',bodyId:'morrow',deployment:{systemId:'meridian',bodyId:'serein'},
 navy:{kind:'patrol',watchSeconds:35,attackChance:0,attackDelay:20,targetCount:2,targetClassId:'marten',targetHull:130,targetDamage:3,targetSpeed:32,requiredDamage:28,enemyFactionId:'meridian',...extra}});
function embark(spec=mission(),seed='navy-extended'){
 const game=new Game(seed,{startMode:'hardcore'});game.state.pendingEncounter=null;
 ok(game._startNavySortie(spec,{operationId:`military:freewake:navy:local:1`}));
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);
 return game;
}
function controls(game){
 const status=game.gunneryStatus();if(status.available&&!status.active)ok(game.enterGunnery());
 const target=game.system.enemies.find(enemy=>game.state.npcContract.navy.targetIds.includes(enemy.id)&&enemy.hp>0&&!enemy.disabled);
 if(!target)return{};
 const origin=gunneryOrigin(game.state.ship),travel=distance(target,origin)/650,dx=target.x+(target.vx||0)*travel-origin.x,dy=target.y+(target.vy||0)*travel-origin.y,length=Math.hypot(dx,dy);
 return{aiming:true,aimX:dx/length,aimY:dy/length,fire:true};
}
function runUntil(game,predicate,{seconds=240,fire=true,observe=()=>{}}={}){
 for(let i=0;i<seconds*10&&!predicate();i++){
  const input=controls(game);if(!fire)input.fire=false;game.step(.1,input);observe(game);
 }
 assert.ok(predicate(),JSON.stringify({system:game.state.systemId,phase:game.state.npcContract?.phase,route:game.state.npcContract?.navy.route,work:game.state.npcContract?.work,ship:game.state.ship}));
}

test('a quiet escort flies to a rival system, keeps a real watch and physical transport, and returns without requiring invented kills',()=>{
 const game=embark(mission({kind:'escort',escort:true}),'navy-quiet-cross-system'),contract=game.state.npcContract,own=structuredClone(contract.personal.ship),seen=new Set();
 let transportSeen=false,transportMoved=false,lastTransport=null;
 runUntil(game,()=>contract.phase==='docked',{fire:false,observe:g=>{
  seen.add(g.state.systemId);
  const escort=g.system.parkedShips.find(ship=>ship.id===`${contract.id}:escort`);
  if(escort){transportSeen=true;assert.equal(g.state.systemId,'meridian');assert.ok(escort.hull>0);assert.notEqual(escort.ownerId,g.playerId);if(lastTransport&&distance(escort,lastTransport)>.01)transportMoved=true;lastTransport={x:escort.x,y:escort.y};}
 }});
 assert.deepEqual([...seen].sort(),['hearth','meridian']);assert.equal(transportSeen,true);assert.equal(transportMoved,true);
 assert.equal(contract.navy.spawned,false);assert.equal(contract.work.shots,0);assert.equal(contract.work.done,true);
 const result=ok(game.completeNpcContract());assert.equal(result.completed,true);assert.equal(result.returned,true);assert.equal(result.wages,0);
 assert.ok(result.watchSeconds>=35);assert.equal(result.teamTargetCount,0);assert.equal(result.teamNeutralized,0);assert.equal(result.employeeId,game.playerId);
 assert.deepEqual(game.state.ship,own);assert.equal(game.state.locationId,'morrow');assert.equal(game.state.systemId,'hearth');
});

test('a delayed surprise attack survives reload with the same outcome and is fought in the destination system',()=>{
 let game=embark(mission({attackChance:1,attackDelay:28}),'navy-surprise-cross-system');
 runUntil(game,()=>game.state.npcContract.phase==='working',{fire:false});
 let contract=game.state.npcContract;assert.equal(game.state.systemId,'meridian');
 for(let i=0;i<120;i++)game.step(.1,controls(game));
 assert.equal(contract.navy.spawned,false);assert.equal(game.system.enemies.some(enemy=>enemy.militaryOperationId===contract.id),false);
 const attackAt=contract.navy.attackAt,watch=contract.military.participants[game.playerId].watchSeconds;
 game=Game.fromSave(game.save());contract=game.state.npcContract;
 assert.equal(contract.navy.attackPlanned,true);assert.equal(contract.navy.attackAt,attackAt);assert.equal(game.state.stationView,null);assert.equal(contract.military.participants[game.playerId].watchSeconds,watch);
 let actualFight=false;
 runUntil(game,()=>contract.phase==='docked',{observe:g=>{
  const enemies=g.system.enemies.filter(enemy=>enemy.militaryOperationId===contract.id);
  if(enemies.length){actualFight=true;assert.equal(g.state.systemId,'meridian');assert.ok(enemies.every(enemy=>enemy.faction==='meridian'));}
 }});
 assert.equal(actualFight,true);assert.ok(contract.work.damage>0);assert.ok(contract.work.shots>0);
 const result=ok(game.completeNpcContract());assert.equal(result.completed,true);assert.equal(result.teamTargetCount,2);assert.equal(result.teamNeutralized,2);assert.ok(result.watchSeconds>=35);
});

test('shared station duty counts only the present online member and each member settles their own record once',()=>{
 const game=embark({...mission({watchSeconds:15,attackDelay:0}),deployment:{systemId:'hearth',bodyId:'morrow'}},'navy-members'),contract=game.state.npcContract;
 contract.military.sharedOperation=true;contract.military.participants={local:{role:'gunner',active:true,watchSeconds:0,shots:0,damage:0,targets:[]},friend:{role:'gunner',active:true,watchSeconds:0,shots:0,damage:0,targets:[]}};
 const friend=new Game('navy-members',{startMode:'hardcore'});friend._playerId='friend';friend.state.systemId='hearth';friend.state.npcContract=contract;friend.state.mode='person';friend.state.interior=structuredClone(game.state.interior);Object.assign(friend.state.person,cabinLayout(game.state.ship.classId).stations.security);
 game._sharedWorld=true;game.netVesselId=contract.vesselId;game._damageHumans=[game,friend];game._navyOnlineWorkers=[game];
 contract.phase='working';contract.dockedAt=null;Object.assign(game.state.ship,{dockedAt:null,x:contract.workPoint.x,y:contract.workPoint.y});
 game.state.stationView='gunnery';friend.state.stationView='gunnery';
 for(let i=0;i<50;i++)stepNpcContract(game,.1);
 assert.ok(contract.military.participants.local.watchSeconds>4.9);assert.equal(contract.military.participants.friend.watchSeconds,0);
 game._navyOnlineWorkers=[game,friend];friend.state.person.x+=100;
 for(let i=0;i<30;i++)stepNpcContract(game,.1);
 assert.equal(contract.military.participants.friend.watchSeconds,0);
 Object.assign(friend.state.person,cabinLayout(game.state.ship.classId).stations.security);friend.state.person.down=true;
 for(let i=0;i<30;i++)stepNpcContract(game,.1);assert.equal(contract.military.participants.friend.watchSeconds,0);friend.state.person.down=false;
 // The carrier stays for the crewmember who reached their station later.
 for(let i=0;i<80&&contract.phase==='working';i++)stepNpcContract(game,.1);
 assert.equal(contract.phase,'working');assert.ok(contract.military.participants.friend.watchSeconds<15);
 for(let i=0;i<100&&contract.phase==='working';i++)stepNpcContract(game,.1);
 assert.equal(contract.phase,'returning');assert.ok(contract.military.participants.friend.watchSeconds>=15);
 contract.phase='docked';contract.dockedAt='morrow';game.state.systemId='hearth';Object.assign(game.state.ship,{x:contract.dockPoint.x,y:contract.dockPoint.y});
 const before=game.state.credits,guestCredits=friend.state.credits;
 const first=ok(settleNavyParticipant(game,contract,game));assert.equal(first.completed,true);assert.equal(contract.active,true);assert.equal(game.state.npcContractHistory.length,1);assert.equal(friend.state.npcContractHistory.length,0);
 assert.equal(settleNavyParticipant(game,contract,game).code,'paid');
 const second=ok(settleNavyParticipant(game,contract,friend));assert.equal(second.completed,true);assert.equal(contract.active,false);assert.equal(friend.state.npcContractHistory.length,1);
 assert.equal(game.state.credits,before);assert.equal(friend.state.credits,guestCredits);
});

test('being at a remote waypoint cannot fabricate a returned service receipt',()=>{
 const game=embark(mission(),'navy-return-proof'),contract=game.state.npcContract;
 runUntil(game,()=>contract.phase==='working',{fire:false});
 assert.equal(game.state.systemId,'meridian');
 const receipt=navyParticipantReceipt(game,contract,game.playerId);
 assert.equal(receipt.returned,false);assert.equal(receipt.completed,false);assert.equal(game.completeNpcContract().code,'docking');
});

test('the physical convoy transport can be lost to a real projectile, failing an otherwise quiet escort',()=>{
 const game=embark(mission({kind:'escort',escort:true}),'navy-escort-loss'),contract=game.state.npcContract;
 runUntil(game,()=>contract.phase==='working',{fire:false});
 const transport=game.system.parkedShips.find(ship=>ship.id===`${contract.id}:escort`);assert.ok(transport);
 game.system.bullets.push({id:'escort-loss-shot',x:transport.x-12,y:transport.y,vx:200,vy:0,ttl:1,damage:transport.hull+transport.shield+100,owner:'hostile-test-ship',ownerId:'hostile-test-ship',radius:4});
 game.step(.1,{});game.step(.1,{});
 assert.equal(contract.navy.escort.hull,0);assert.equal(contract.phase,'returning');assert.equal(contract.work.done,false);
 runUntil(game,()=>contract.phase==='docked',{fire:false});
 const result=ok(game.completeNpcContract());assert.equal(result.completed,false);assert.equal(result.wages,0);assert.equal(result.returned,true);
});
