import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {cabinLayout,getShipClass} from '../dist/fleet.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {MILITARY_RECRUITER} from '../dist/military-content.mjs';
import {getGunneryBatteries,getGunneryBattery,batteryOrigin} from '../dist/gunnery-batteries.mjs';
import {clampGunneryAim} from '../dist/gunnery.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const nearAngle=(a,b)=>near(Math.atan2(Math.sin(a-b),Math.cos(a-b)),0);
function navy(){
 const game=new Game('capital-batteries',{startMode:'hardcore'}),body=game.system.bodies.find(body=>body.id==='morrow');
 const recruiter=generateSurface(body,game.state.seed,game.state.flags).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);
 Object.assign(game.state.person,{x:recruiter.x,y:recruiter.y});game.state.pendingEncounter=null;
 ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter.id}));
 ok(game.militaryCareerAction({action:'start',entityId:recruiter.id}));
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);
 for(let n=0;n<1500&&game.state.npcContract.phase!=='working';n++)game.step(.1,{});
 assert.equal(game.state.npcContract.phase,'working');ok(game.enterGunnery());return game;
}

test('large hulls expose four physical directional batteries while small hulls retain their native forward volley',()=>{
 for(const classId of ['capital','leviathan','judicator']){
  const ship={classId,...getShipClass(classId).stats,x:300,y:-200,angle:.7},batteries=getGunneryBatteries(ship);
  assert.deepEqual(batteries.map(battery=>battery.id),['fore','port','starboard','aft']);
  assert.equal(new Set(batteries.map(battery=>JSON.stringify(batteryOrigin(ship,battery)))).size,4);
  for(let degrees=0;degrees<360;degrees++)assert.ok(batteries.some(battery=>Math.abs(Math.atan2(Math.sin(degrees*Math.PI/180-battery.bearing),Math.cos(degrees*Math.PI/180-battery.bearing)))<=battery.arcHalfAngle));
 }
 const small=getGunneryBatteries('marten');assert.equal(small.length,1);assert.equal(small[0].mountCount,2);
 assert.equal(getGunneryBattery({classId:'sparrow'},'aft'),null);
});

test('a Navy gunner changes real muzzle and arc in all directions without moving the body or turning the carrier',()=>{
 const game=navy(),ship=game.state.ship,pose={x:game.state.person.x,y:game.state.person.y,angle:ship.angle},energy=ship.energy;
 game.system.bullets=[];
 for(const batteryId of ['fore','port','starboard','aft']){
  ok(game.selectGunneryBattery({batteryId}));const status=game.gunneryStatus();
  assert.equal(status.selectedBatteryId,batteryId);assert.equal(status.batteryCount,4);assert.equal(status.npcPilot,true);assert.equal(status.canFire,true);
  ok(game.npcContractAction('fire',{input:{aiming:true,aimX:Math.cos(status.arcCenter),aimY:Math.sin(status.arcCenter)}}));
  const shot=game.system.bullets.at(-1);assert.equal(shot.batteryId,batteryId);assert.equal(shot.vesselId,ship.id);
  near(shot.x,status.origin.x);near(shot.y,status.origin.y);
  nearAngle(Math.atan2(shot.vy-ship.vy*.3,shot.vx-ship.vx*.3),status.arcCenter);
 }
 assert.deepEqual({x:game.state.person.x,y:game.state.person.y,angle:ship.angle},pose);
 near(energy-ship.energy,12);assert.equal(game.state.mode,'person');
 assert.equal(game.selectGunneryBattery('unlisted-turret').code,'battery');
});

test('battery cooldowns survive switching, leaving the console and save reloads, and share reactor charge',()=>{
 const game=navy();ok(game.selectGunneryBattery('port'));ok(game.npcContractAction('fire'));
 assert.equal(game.npcContractAction('fire').code,'cooldown');
 ok(game.selectGunneryBattery('aft'));ok(game.npcContractAction('fire'));
 ok(game.selectGunneryBattery('port'));assert.equal(game.npcContractAction('fire').code,'cooldown');
 const restored=Game.fromSave(game.save());assert.equal(restored.state.stationView,null);assert.equal(restored.state.person.gunneryBatteryId,'port');
 ok(restored.enterGunnery());assert.equal(restored.npcContractAction('fire').code,'cooldown');
 for(let n=0;n<4;n++)restored.step(.1,{});
 restored.state.ship.energy=2;assert.equal(restored.npcContractAction('fire').code,'energy');
 restored.state.ship.energy=6;ok(restored.npcContractAction('fire'));near(restored.state.ship.energy,3);
});

test('side and stern batteries hit real exterior targets and retain the actual Navy gunner’s damage credit',()=>{
 const game=navy(),target=game.system.enemies.find(enemy=>game.state.npcContract.navy.targetIds.includes(enemy.id));
 game.system.enemies=[target];
 for(const batteryId of ['fore','port','starboard','aft']){
  ok(game.selectGunneryBattery(batteryId));const status=game.gunneryStatus();
  Object.assign(target,{x:status.origin.x+Math.cos(status.arcCenter)*100,y:status.origin.y+Math.sin(status.arcCenter)*100,hp:112,maxHp:112,disabled:false});
  game.system.bullets=[];const contribution=target.professionContributors?.[game.playerId]||0;
  ok(game.npcContractAction('fire',{input:{aiming:true,aimX:Math.cos(status.arcCenter),aimY:Math.sin(status.arcCenter)}}));
  game._updateBullets(.2,[game]);
  near(target.hp,112-game.state.ship.damage);near(target.professionContributors[game.playerId]-contribution,game.state.ship.damage);
 }
});

test('manual fire cannot supply a forged firing arc or unknown mount',()=>{
 const game=navy(),ship=game.state.ship,desired=ship.angle+Math.PI/2;
 const before=game.system.bullets.length;
 assert.equal(game.fireWeapons(game.playerId,{manual:true,batteryId:'invented',angle:desired,arcHalfAngle:Math.PI}).code,'battery');
 assert.equal(game.system.bullets.length,before);
 ok(game.fireWeapons(game.playerId,{manual:true,batteryId:'port',angle:desired,arcHalfAngle:Math.PI,arcCenter:desired}));
 const shot=game.system.bullets.at(-1),actual=Math.atan2(shot.vy-ship.vy*.3,shot.vx-ship.vx*.3);
 nearAngle(actual,clampGunneryAim(desired,ship.angle-Math.PI/2,Math.PI/3));
});

test('Navy guns remain available while outbound and returning, and are locked while moored or away from the console',()=>{
 const game=navy(),contract=game.state.npcContract;
 for(const phase of ['outbound','returning']){
  contract.phase=phase;ok(game.selectGunneryBattery(phase==='outbound'?'port':'aft'));
  assert.equal(game.gunneryStatus().canFire,true);ok(game.npcContractAction('fire'));
 }
 contract.dockedAt='morrow';assert.equal(game.selectGunneryBattery('fore').ok,false);assert.equal(game.npcContractAction('fire').ok,false);
 contract.dockedAt=null;game.state.person.x+=100;assert.equal(game.selectGunneryBattery('fore').ok,false);
});

test('an owned solo capital ship can use its actual battery console while its existing flight simply coasts',()=>{
 const game=new Game('owned-capital-battery'),hull=getShipClass('judicator');
 Object.assign(game.state.ship,hull.stats,{classId:hull.id,hull:hull.stats.maxHull,shield:hull.stats.maxShield,energy:200,vx:8,vy:0,angle:0,dockedAt:null});
 game.state.pendingEncounter=null;game.system.enemies=[];ok(game.enterCabin());
 Object.assign(game.state.person,cabinLayout(hull.id).stations.security);ok(game.enterGunnery());ok(game.selectGunneryBattery('aft'));
 assert.equal(game.gunneryStatus().npcPilot,false);const x=game.state.ship.x;
 game.step(.1,{fire:true,aiming:true,aimX:-1,aimY:0,thrust:1,turn:1});
 assert.ok(game.state.ship.x>x);near(game.state.ship.angle,0);
 assert.equal(game.system.bullets.filter(bullet=>bullet.batteryId==='aft').length,2);
 assert.equal(game.state.mode,'person');assert.equal(!!game.state.npcContract?.active,false);
});
