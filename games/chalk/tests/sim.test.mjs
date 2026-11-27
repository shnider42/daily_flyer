import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,createGame,step,issueOrder,setRole,getObjective,hasLineOfSight,findPath,getSolidWalls} from '../public/sim.mjs';
import {navigationInput,quietMission} from './mission-navigation-helper.mjs';
import {pointBlockedByVehicle,segmentVehicleEntry} from '../public/armored-vehicles.mjs';

const pl=s=>s.squad.find(a=>a.id===s.playerId);
function clearThreats(s){s.enemies=[];s.maxEnemies=0;}
function run(s,seconds,input={}){for(let i=0;i<seconds*30&&s.status==='playing';i++)step(s,input,1/30);}
function travel(s,target,maxSeconds=60){
  for(let i=0;i<maxSeconds*30&&s.status==='playing';i++){
    const p=pl(s);if(Math.hypot(p.x-target.x,p.y-target.y)<35)return true;
    const route=findPath(s,p,target),next=route[0];if(!next)return false;const dx=next.x-p.x,dy=next.y-p.y,d=Math.hypot(dx,dy);step(s,{moveX:dx/d,moveY:dy/d,interact:true},1/30);
  }return false;
}

test('all fourteen missions create isolated, deterministic states and objectives',()=>{
  assert.equal(MISSIONS.length,14);
  for(let m=0;m<MISSIONS.length;m++){const a=createGame({mission:m,seed:42}),b=createGame({mission:m,seed:42});assert.deepEqual(a,b);assert.equal(a.squad.length,4);assert.ok(getObjective(a).title);assert.equal(a.status,'playing');step(a,{moveX:1},1/30);assert.notEqual(pl(a).x,pl(b).x);}
});
test('collision and pathfinding keep mission routes reachable',()=>{
  for(let m=0;m<MISSIONS.length;m++){const s=createGame({mission:m,seed:4});for(const stage of s.stages){const route=findPath(s,pl(s),stage);assert.ok(route.length,`mission ${m}, ${stage.title}`);for(const p of route)assert.ok(!getSolidWalls(s.world).some(b=>p.x>b.x&&p.x<b.x+b.w&&p.y>b.y&&p.y<b.y+b.h));}}
  const s=createGame();clearThreats(s);const b=s.world.buildings[0];pl(s).x=b.x-15;pl(s).y=b.y+30;run(s,2,{moveX:1});assert.ok(pl(s).x<b.x);assert.equal(hasLineOfSight(s,{x:b.x-50,y:b.y+50},{x:b.x+b.w+50,y:b.y+50}),false);
});
test('commander orders are different from member requests',()=>{
  const s=createGame();assert.ok(issueOrder(s,'hold',{x:680,y:1340}));assert.equal(s.order.type,'hold');const leaderId=s.playerId;setRole(s,'member');assert.notEqual(s.playerId,leaderId);assert.equal(issueOrder(s,'move',{x:100,y:100}),false);assert.equal(issueOrder(s,'wait'),true);assert.equal(s.waitUntil,12);issueOrder(s,'ready');assert.equal(s.waitUntil,0);assert.equal(issueOrder(s,'help'),true);
});
test('AI leader waits for a separated human and responds to wait',()=>{
  const s=createGame({role:'member'});clearThreats(s);pl(s).x=2120;pl(s).y=1720;const leader=s.squad[0],before={x:leader.x,y:leader.y};run(s,2);assert.match(s.leaderOrder,/Waiting/);assert.ok(Math.hypot(leader.x-before.x,leader.y-before.y)<25);pl(s).x=leader.x+35;pl(s).y=leader.y;issueOrder(s,'wait');run(s,2);assert.match(s.leaderOrder,/Holding/);issueOrder(s,'ready');run(s,2);assert.ok(Math.hypot(leader.x-before.x,leader.y-before.y)>50);
});
test('magazines, reloads and finite smoke supplies work',()=>{
  const s=createGame();clearThreats(s);const p=pl(s);p.ammo=2;run(s,.4,{fire:true,aimX:p.x+200,aimY:p.y});assert.equal(p.ammo,0);run(s,3,{reload:true});assert.ok(p.ammo>0);assert.ok(p.reserve<180);step(s,{smoke:true},1/30);assert.equal(p.smokes,2);assert.equal(s.smokes.length,1);run(s,15);assert.equal(s.smokes.length,0);
});
test('medic recovers a downed player without ending the mission',()=>{
  const s=createGame({role:'member'});clearThreats(s);const p=pl(s);p.hp=0;p.downed=true;run(s,12);assert.equal(s.status,'playing');assert.equal(p.downed,false);assert.ok(p.hp>0);
});
test('AI never selects civilians and player fire records civilian harm',()=>{
  const s=createGame();clearThreats(s);const p=pl(s),c=s.civilians[0];c.x=p.x+75;c.y=p.y;c.shelter={x:c.x,y:c.y};run(s,2);assert.equal(c.hp,c.maxHp);run(s,.5,{fire:true,aimX:c.x,aimY:c.y});assert.equal(s.stats.civilianHarm,1);assert.ok(c.hp<c.maxHp);
});
test('leader can finish the expanded cordon without killing every enemy',()=>{
  const s=quietMission(createGame({mission:0}));
  for(let frame=0;frame<30*480&&s.status==='playing';frame++){
    step(s,navigationInput(s,pl(s),getObjective(s)),1/30);
  }
  assert.equal(s.status,'won');assert.equal(s.stats.objectives,s.stages.length);assert.equal(s.operation.items[0].status,'delivered');
});

test('the human test driver yields through legal input even inside its follow distance',()=>{
  const s=quietMission(createGame({mission:2,role:'member',seed:17}));s.civilians=[];
  s.stageIndex=s.stages.findIndex(stage=>stage.kind==='convoy');
  const [lead,rear,tail]=s.vehicles;
  Object.assign(lead,{x:534.8,y:1340,angle:0,waiting:true});
  Object.assign(rear,{x:226.61226,y:1415.4194,angle:-.3734885,routeIndex:0});
  Object.assign(tail,{x:203.38954,y:1524.75239,angle:-1.3667293,routeIndex:0});
  const human=pl(s),leader=s.squad.find(actor=>actor.commander);
  Object.assign(human,{x:271.78676,y:1382.67353});Object.assign(leader,{x:275.62346,y:1450.02786});
  const before={x:human.x,y:human.y},angle=rear.angle;
  assert.ok(Number.isFinite(segmentVehicleEntry({...rear,angle:angle+.024},human,human,human.radius)));
  const input=navigationInput(s,human,leader,{stopDistance:100});
  assert.ok(Math.hypot(input.moveX||0,input.moveY||0)>.9);
  assert.deepEqual({x:human.x,y:human.y},before,'the driver must not move the controlled actor directly');
  for(let frame=0;frame<30&&rear.angle-angle<.08;frame++){
    const start={x:human.x,y:human.y};step(s,navigationInput(s,human,leader,{stopDistance:100}),1/30);
    assert.ok(Math.hypot(human.x-start.x,human.y-start.y)<5,'movement must use normal walking speed');
    assert.equal(pointBlockedByVehicle(s,human.x,human.y,human.radius),false,'the whole human footprint stays clear');
  }
  assert.ok(rear.angle-angle>.08,'the carrier can turn once the human walks clear');
});

for(let mission=0;mission<MISSIONS.length;mission++){
  test(`${MISSIONS[mission].title} progresses with an AI leader and a human keeping up`,()=>{
    const s=quietMission(createGame({mission,role:'member',seed:17}));
    for(let frame=0;frame<30*720&&s.status==='playing';frame++){
      const p=pl(s),leader=s.squad.find(a=>a.commander);
      step(s,navigationInput(s,p,leader,{stopDistance:47}),1/30);
    }
    assert.equal(s.status,'won',`${MISSIONS[mission].title}: stage ${s.stageIndex}, ${s.objective?.detail}, ${s.leaderOrder}`);
    if(mission===1)assert.equal(s.stats.rescued,2);
    if(mission===2)assert.equal(s.convoyCleared.length,2);
  });
}
test('a squad wipe fails clearly and stops simulation',()=>{
  const s=createGame();for(const a of s.squad){a.downed=true;a.hp=0;}step(s,{},1/30);assert.equal(s.status,'lost');const time=s.time;step(s,{},1);assert.equal(s.time,time);
});
test('recovered crew can be helped again if hit during the escort',()=>{
  const s=createGame({mission:1});clearThreats(s);const crew=s.survivors[0];crew.stabilized=true;crew.hp=0;crew.downed=true;crew.x=pl(s).x+45;crew.y=pl(s).y+20;run(s,12);assert.equal(crew.downed,false);assert.ok(crew.hp>0);
});
test('buildings stop shots before they can hit actors behind them',()=>{
  const s=createGame();clearThreats(s);const b=s.world.buildings[0],p=pl(s),c=s.civilians[0];p.x=b.x-35;p.y=b.y+60;c.x=b.x+b.w+35;c.y=p.y;c.shelter={x:c.x,y:c.y};run(s,2,{fire:true,aimX:c.x,aimY:c.y});assert.equal(c.hp,c.maxHp);assert.equal(s.stats.civilianHarm,0);
});
test('a shot hits an actor in front of a wall before reaching the wall in the same step',()=>{
  const s=createGame();clearThreats(s);const wall=s.world.buildings[0],civilian=s.civilians[0];
  civilian.x=wall.x-17;civilian.y=wall.y+70;civilian.shelter={x:civilian.x,y:civilian.y};
  const origin={x:wall.x-60,y:civilian.y};
  s.bullets=[{id:9000,x:origin.x,y:origin.y,px:origin.x,py:origin.y,vx:2000,vy:0,team:'squad',owner:s.playerId,damage:24,ttl:1}];
  step(s,{},.05);
  assert.equal(civilian.hp,civilian.maxHp-24);assert.equal(s.stats.civilianHarm,1);
});
test('final convoy loading cannot complete with a teammate outside or downed',()=>{
  const s=createGame({mission:2});clearThreats(s);s.stageIndex=s.stages.length-1;
  const objective=s.stages[s.stageIndex];s.phaseTime=objective.duration-.1;
  for(let i=0;i<s.squad.length;i++){s.squad[i].x=objective.x+i*22;s.squad[i].y=objective.y;}
  const straggler=s.squad[3];straggler.x=objective.x-500;
  run(s,.3);assert.equal(s.status,'playing');assert.ok(s.phaseTime<objective.duration);
  straggler.x=objective.x+50;straggler.y=objective.y;straggler.hp=0;straggler.downed=true;
  run(s,.3);assert.equal(s.status,'playing');assert.ok(s.phaseTime<objective.duration);
  straggler.downed=false;straggler.hp=60;
  run(s,.5);assert.equal(s.status,'won');
});
test('member can clear a nearby convoy barrier while the AI leader is away',()=>{
  function atBarrier(playerOffset){
    const s=createGame({mission:2,role:'member'});clearThreats(s);
    s.stageIndex=s.stages.findIndex(p=>p.kind==='convoy');s.convoyIndex=1;
    const barrier=s.convoyRoute[2];
    s.vehicles[0].x=barrier.x-70;s.vehicles[0].y=barrier.y;
    pl(s).x=barrier.x+playerOffset;pl(s).y=barrier.y;
    return s;
  }
  const working=atBarrier(-30);step(working,{interact:true},1/30);
  assert.ok(working.convoyClear>0);assert.match(working.interactionPrompt,/Clearing obstruction/);
  const idle=atBarrier(-30);step(idle,{},1/30);assert.equal(idle.convoyClear,0);
  const tooFar=atBarrier(-90);step(tooFar,{interact:true},1/30);assert.equal(tooFar.convoyClear,0);
  const downed=atBarrier(-30);pl(downed).downed=true;pl(downed).hp=0;step(downed,{interact:true},1/30);assert.equal(downed.convoyClear,0);
});
test('automatic leader barrier clearing respects wait and never doubles player progress',()=>{
  const s=createGame({mission:2,role:'member'});clearThreats(s);s.stageIndex=s.stages.findIndex(p=>p.kind==='convoy');s.convoyIndex=1;
  const barrier=s.convoyRoute[2],leader=s.squad[0];
  s.vehicles[0].x=barrier.x-70;s.vehicles[0].y=barrier.y;
  leader.x=barrier.x+35;leader.y=barrier.y;pl(s).x=barrier.x-30;pl(s).y=barrier.y;
  step(s,{},1/30);assert.ok(Math.abs(s.convoyClear-1/30)<1e-10);
  step(s,{interact:true},1/30);assert.ok(Math.abs(s.convoyClear-2/30)<1e-10);
  issueOrder(s,'wait');step(s,{},1/30);assert.ok(Math.abs(s.convoyClear-2/30)<1e-10);
  step(s,{interact:true},1/30);assert.ok(Math.abs(s.convoyClear-3/30)<1e-10);
});
test('shot sounds remain readable after short muzzle flashes expire during catch-up',()=>{
  const s=createGame();clearThreats(s);const p=pl(s);
  step(s,{fire:true,aimX:p.x+200,aimY:p.y},1/60);
  const shot=s.soundEvents.find(event=>event.type==='shot'&&event.actorId===p.id);
  assert.ok(shot);assert.equal(shot.weapon,'rifle');assert.equal(shot.team,'squad');
  const muzzle=s.effects.find(effect=>effect.type==='muzzle');
  assert.equal(muzzle.actorId,p.id);assert.equal(muzzle.weapon,'rifle');
  run(s,2.2);
  assert.equal(s.effects.some(effect=>effect.type==='muzzle'),false);
  assert.equal(s.soundEvents.filter(event=>event.id===shot.id).length,1);
  run(s,1);assert.equal(s.soundEvents.some(event=>event.id===shot.id),false);
});
test('held reload input emits one start and one completion event per transition',()=>{
  const s=createGame();clearThreats(s);const p=pl(s);p.ammo=0;
  run(s,2.8,{reload:true});
  const reloads=s.soundEvents.filter(event=>event.actorId===p.id&&event.type.startsWith('reload_'));
  assert.deepEqual(reloads.map(event=>event.type),['reload_start','reload_end']);
  assert.ok(reloads[0].id<reloads[1].id);assert.ok(reloads[0].time<reloads[1].time);
  assert.equal(p.ammo,p.magSize);
});
test('sound events are bounded, ordered and contain spatial smoke and concrete impacts',()=>{
  const s=createGame();clearThreats(s);const p=pl(s);
  step(s,{smoke:true},1/60);
  const smoke=s.soundEvents.find(event=>event.type==='smoke');assert.ok(smoke);assert.equal(smoke.actorId,p.id);assert.ok(Math.hypot(smoke.x-p.x,smoke.y-p.y)>50);
  const wall=s.world.buildings[0],origin={x:wall.x-20,y:wall.y+65};
  s.bullets=[{id:9000,x:origin.x,y:origin.y,px:origin.x,py:origin.y,vx:1000,vy:0,team:'squad',owner:p.id,weapon:'rifle',damage:24,ttl:1}];
  step(s,{},.05);const impact=s.soundEvents.find(event=>event.type==='impact');assert.ok(impact);assert.equal(impact.material,'concrete');assert.ok(Math.abs(impact.x-wall.x)<.001);
  for(let i=0;i<180;i++){p.cooldown=0;p.ammo=p.magSize;step(s,{fire:true,aimX:p.x+200,aimY:p.y},.001);}
  assert.equal(s.soundEvents.length,128);
  assert.equal(new Set(s.soundEvents.map(event=>event.id)).size,128);
  assert.ok(s.soundEvents.every((event,i,all)=>!i||event.id>all[i-1].id));
});
