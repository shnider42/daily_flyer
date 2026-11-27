import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,stepCoop,setHumanPlayers,getFieldSupportStatus,requestFieldSupport,hasLineOfSight,combatLOS,rebuildNavigationGrid,findPath} from '../public/sim.mjs';
import {FIELD_AID,fieldAidSafe} from '../public/field-support.mjs';
import {FIELD_SQUAD_LIMITS} from '../public/independent-squads.mjs';
import {enemyProfile,ballisticProfile} from '../public/combat-profiles.mjs';
import {squadCanSeePoint} from '../public/visibility.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function run(s,seconds,input={},dt=1/30){for(let t=0;t<seconds-1e-8&&s.status==='playing';t+=dt)step(s,input,dt);}
function quiet(s){s.enemies=[];s.civilians=[];s.survivors=[];for(const e of s.encounters.groups)e.closed=true;return s;}
function clearWorld(s){s.world.walls=[];s.world.buildings=[];s.world.streetSolids=[];s.world.geometryRevision++;s.grid.fill(0);return s;}
function positionGroup(s,id,spots){
  const group=s.fieldSquads.groups.find(g=>g.id===id),members=s.allies.filter(a=>a.fieldSquadId===id);
  Object.assign(group,{staging:{...spots[0]},route:[{...spots[0]}],reachedStops:[{...spots[0]}],waypoint:0,order:'reserve',withdrawing:false,fieldJobDone:false});
  members.forEach((a,i)=>Object.assign(a,{...spots[i],home:{...spots[i]},fieldHome:{...spots[i]},fieldGoal:{...spots[i]},path:[],pathTimer:0,perceivedTargetId:null,lastKnown:null,lastSeenAt:-100,fieldAidTargetId:null}));
  return {group,members};
}

test('Cordon relief is finite, prepositioned, and reports actual availability without exposing hidden orders',()=>{
  const s=createGame({seed:17}),status=getFieldSupportStatus(s),reserve=s.allies.filter(a=>a.fieldSquadId==='field-relief');
  assert.equal(reserve.length,3);assert.equal(s.allies.length,FIELD_SQUAD_LIMITS.allies);assert.equal(s.squad.length,4);
  assert.equal(status.available,true);assert.equal(status.remaining,1);assert.equal(status.status,'available');
  assert.deepEqual(Object.keys(status).sort(),['enabled','available','remaining','status','callsign','text','updatedAt','requestId'].sort());
  assert.equal(JSON.stringify(status).includes('destination'),false);assert.ok(reserve.every(a=>a.visible===squadCanSeePoint(s,a)));
  reserve[0].hp=15;assert.equal(getFieldSupportStatus(s).available,false);
  assert.equal(getFieldSupportStatus(s).status,'recovering');assert.equal(requestFieldSupport(s,{x:200,y:1340}),false);
  assert.equal(s.fieldSupport.remaining,1,'failed request cannot spend the only deployment');
  assert.equal(getFieldSupportStatus(createGame({mission:1})).enabled,false);
});

test('Cordon reserves stage outside opening hostile fire and remain reachable on the reproduced problem seeds',()=>{
  for(const seed of [6,1,4,17,41,91]){
    const s=createGame({seed,role:'member'}),reserve=s.allies.filter(a=>a.fieldSquadId==='field-relief');
    const group=s.fieldSquads.groups.find(g=>g.id==='field-relief'),start=reserve.map(a=>({id:a.id,x:a.x,y:a.y}));
    assert.equal(reserve.length,3,`three real reserve actors on seed ${seed}`);
    assert.deepEqual(group.staging,group.posts[0]);assert.deepEqual(group.route[0],group.staging);
    for(const a of reserve){
      assert.deepEqual(a.fieldHome,{x:a.x,y:a.y});
      assert.ok(s.squad.every(other=>distance(a,other)>60),'initial formations must not overlap');
      assert.ok(s.enemies.every(e=>distance(a,e)>=520),'reserve is outside the opening close encounter');
      assert.ok(s.enemies.every(e=>distance(a,e)>ballisticProfile(enemyProfile(e).weapon).range||!hasLineOfSight(s,e,a)),`no initial unobstructed hostile firing exposure on seed ${seed}`);
      assert.ok(findPath(s,a,{x:200,y:1340}).length,'rear staging has a real outbound route');
    }
    run(s,15);assert.equal(getFieldSupportStatus(s).available,true,`opening pressure must not consume reserve availability on seed ${seed}`);
    assert.ok(reserve.every(a=>a.alive&&!a.downed&&a.hp===a.maxHp));
    assert.ok(reserve.every(a=>distance(a,start.find(p=>p.id===a.id))<1),'reserve remains physically at staging before dispatch');
    quiet(s);assert.equal(requestFieldSupport(s,{x:200,y:1340}),true);run(s,14);
    assert.equal(getFieldSupportStatus(s).status,'covering');
    assert.ok(reserve.some(a=>distance(a,start.find(p=>p.id===a.id))>150),'accepted request moves the same real soldiers');
  }
});

test('one explicit request moves the existing detachment, covers the area, then returns without spawning replacements',()=>{
  const s=quiet(clearWorld(createGame({seed:17}))),before=s.allies.map(a=>({id:a.id,x:a.x,y:a.y}));
  const order=structuredClone(s.order),reserve=s.allies.filter(a=>a.fieldSquadId==='field-relief');
  assert.equal(requestFieldSupport(s,{x:200,y:1340}),true);const requestId=s.fieldSupport.request.id;
  assert.equal(requestFieldSupport(s,{x:1640,y:580}),false);assert.equal(s.fieldSupport.request.id,requestId);
  assert.ok(reserve.every(a=>distance(a,before.find(b=>b.id===a.id))<.01),'dispatch changes orders, never teleports');
  run(s,10);assert.equal(getFieldSupportStatus(s).status,'covering');
  assert.ok(reserve.some(a=>distance(a,before.find(b=>b.id===a.id))>100));
  assert.deepEqual(s.order,order);assert.equal(s.stats.shots,0);assert.equal(s.stats.squadDowns,0);
  run(s,50);assert.equal(getFieldSupportStatus(s).status,'complete');assert.equal(getFieldSupportStatus(s).available,false);
  assert.equal(requestFieldSupport(s,{x:200,y:1340}),false);assert.equal(s.allies.length,FIELD_SQUAD_LIMITS.allies);
  assert.deepEqual(s.allies.map(a=>a.id),before.map(a=>a.id));
});

test('public support status stays unavailable when the private reserve group cannot be resolved',()=>{
  const s=createGame({seed:17});
  for(const fieldSquads of [undefined,null,[],{secret:'private orders'},{groups:[]},{groups:'not initialized'}]){
    s.fieldSquads=fieldSquads;
    assert.equal(getFieldSupportStatus(s).available,false);
  }
  s.allies=[{alive:true,hp:100,maxHp:100},{alive:true,hp:100,maxHp:100}];
  assert.equal(getFieldSupportStatus(s).available,false,'unassigned actors cannot stand in for an unresolved reserve');
});

test('co-op accepts support only from a living assigned human and commits one shared request',()=>{
  const s=quiet(createGame({seed:31}));setHumanPlayers(s,[s.squad[0].id,s.squad[1].id]);
  assert.equal(requestFieldSupport(s,{x:200,y:1340},s.squad[2].id),false);
  assert.equal(requestFieldSupport(s,{x:200,y:1340},s.squad[1].id),true);
  const request=structuredClone(s.fieldSupport.request);
  assert.equal(requestFieldSupport(s,{x:680,y:1340},s.squad[0].id),false);
  assert.deepEqual(s.fieldSupport.request,request);
});

test('later encounters respect independent friendly occupancy and sight without revealing enemy locations',()=>{
  const s=createGame({seed:41}),ally=s.allies.find(a=>a.fieldSquadId==='field-hammer');
  for(const g of s.encounters.groups)g.closed=g.id!=='cordon-withdraw';
  s.fieldSquads.enabled=false;s.enemies=[];Object.assign(ally,{x:1640,y:580});
  s.stageIndex=4;run(s,.6);
  assert.equal(s.enemies.filter(a=>a.encounterId==='cordon-withdraw').length,0,'cannot appear on the occupied approach');
  assert.equal(ally.visible,false);assert.equal(s.squad.length,4);
  ally.x=200;ally.y=1400;run(s,1);
  const entrants=s.enemies.filter(a=>a.encounterId==='cordon-withdraw');
  assert.ok(entrants.length>0,'an unoccupied authored approach can still receive defenders');
  assert.ok(entrants.every(a=>(s.allies||[]).filter(b=>b.alive).every(b=>distance(a,b)>420)));
  assert.ok(entrants.every(a=>!a.visible),'field placement checks grant no player sight');
});

test('critical wounds trigger withdrawal before a death and choose reachable shelter instead of a forward waypoint',()=>{
  const s=quiet(createGame({seed:91})),group=s.fieldSquads.groups.find(g=>g.id==='field-hammer'),members=s.allies.filter(a=>a.fieldSquadId===group.id);
  const leader=members[0];leader.hp=20;leader.lastKnown={x:2120,y:1040};leader.lastSeenAt=0;
  run(s,.1);assert.equal(group.withdrawing,true);assert.ok(members.every(a=>a.alive));
  assert.notDeepEqual(group.withdrawPoint,group.route[0]);
  assert.equal(hasLineOfSight(s,group.withdrawPoint,leader.lastKnown),false);
  run(s,35);assert.equal(leader.alive,true);assert.ok(leader.hp>20,'one finite bandage supports recovery');
  assert.ok(leader.medkits<1);assert.equal(group.withdrawing,false,'recovery can finish');
});

test('buddy aid consumes a supply, keeps a casualty alive, and never joins the extraction roster',()=>{
  const s=quiet(clearWorld(createGame({seed:17}))),{members}=positionGroup(s,'field-raven',[{x:500,y:500},{x:550,y:500},{x:500,y:560}]);
  const casualty=members[0];Object.assign(casualty,{hp:0,downed:true,bleed:5,medkits:0});
  const kitsBefore=members.reduce((sum,a)=>sum+a.medkits,0);run(s,5.2);
  assert.equal(casualty.alive,true);assert.equal(casualty.downed,false);assert.equal(casualty.fieldRecovered,true);
  assert.equal(members.reduce((sum,a)=>sum+a.medkits,0),kitsBefore-1);
  assert.equal(s.squad.length,4);assert.equal(s.stats.squadDowns,0);assert.equal(s.stats.rescued,0);
  assert.equal(s.bodies.some(b=>b.actorId===casualty.id),false);
});

test('the added medic team can treat a nearby other squad with its own finite supplies',()=>{
  const s=quiet(clearWorld(createGame({seed:17})));
  const {members:raven}=positionGroup(s,'field-raven',[{x:570,y:500},{x:620,y:500},{x:570,y:560}]);
  const {group,members:atlas}=positionGroup(s,'field-atlas',[{x:480,y:500},{x:480,y:560},{x:530,y:520}]);
  group.order='patrol';group.departAt=30;
  const casualty=raven[0],medic=atlas.find(a=>a.role==='medic');
  raven.forEach(a=>a.medkits=0);atlas.filter(a=>a!==medic).forEach(a=>a.medkits=0);
  Object.assign(casualty,{hp:0,downed:true,bleed:2});const before=medic.medkits;
  run(s,4.2);
  assert.equal(casualty.downed,false);assert.equal(casualty.fieldRecovered,true);
  assert.equal(medic.medkits,before-1);assert.equal(s.fieldSupport.remaining,1);
  assert.equal(s.squad.length,4);assert.equal(s.stats.rescued,0);
});

test('a blocked or exposed aid approach waits instead of sending every buddy into the same fire',()=>{
  const s=quiet(clearWorld(createGame({seed:17}))),{members}=positionGroup(s,'field-raven',[{x:500,y:500},{x:550,y:500},{x:500,y:560}]);
  const casualty=members[0];Object.assign(casualty,{hp:0,downed:true,bleed:5});
  for(const a of members){a.smokes=0;a.lastKnown={x:700,y:500};a.lastSeenAt=0;}
  assert.equal(fieldAidSafe(s,members[1],casualty,members,{hasLineOfSight,combatLOS}),false);
  run(s,3);assert.equal(casualty.downed,true);assert.equal(casualty.reviveProgress,0);
  assert.ok(members.every(a=>a.fieldAidTargetId==null));
  s.world.walls=[{x:520,y:0,w:10,h:1900}];s.world.geometryRevision++;rebuildNavigationGrid(s);
  assert.equal(fieldAidSafe(s,members[1],casualty,members,{hasLineOfSight,combatLOS}),false,'blocked aid needs a usable approach');
});

test('manual Assist uses a finite kit with equivalent treatment at 30 and 60 simulation steps per second',()=>{
  const outcomes=[];
  for(const dt of [1/30,1/60]){
    const s=quiet(clearWorld(createGame({seed:17})));s.fieldSquads.enabled=false;
    const casualty=s.allies[0],helper=s.squad[0];Object.assign(casualty,{x:200,y:1665,hp:0,downed:true,bleed:0,visible:true});
    const before=helper.medkits;run(s,4.7,{interact:true},dt);
    assert.equal(casualty.downed,false);assert.equal(helper.medkits,before-1);assert.equal(s.squad.length,4);
    outcomes.push({hp:casualty.hp,alive:casualty.alive,kits:helper.medkits,fieldRecovered:casualty.fieldRecovered});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
});

test('a wounded group can summon the finite reserve while ordinary recoverable wounds leave it available',()=>{
  const ordinary=quiet(createGame({seed:17})),wounded=ordinary.allies.find(a=>a.fieldSquadId==='field-hammer');
  wounded.hp=25;run(ordinary,27);assert.equal(getFieldSupportStatus(ordinary).remaining,1,'bandageable wounds do not immediately consume the reserve');
  const s=quiet(clearWorld(createGame({seed:17}))),casualty=s.allies.find(a=>a.fieldSquadId==='field-raven');
  s.time=25;Object.assign(casualty,{hp:0,downed:true,bleed:0});
  for(const a of s.allies.filter(a=>a.fieldSquadId==='field-raven'))a.medkits=0;
  run(s,.5);assert.equal(getFieldSupportStatus(s).status,'moving');assert.equal(s.fieldSupport.request.groupId,'field-raven');
  assert.equal(getFieldSupportStatus(s).remaining,0);
});

test('support and casualty decisions remain deterministic in solo and co-op stepping',()=>{
  const solo=quiet(createGame({seed:63})),coop=quiet(createGame({seed:63}));setHumanPlayers(coop,[coop.playerId]);
  requestFieldSupport(solo,{x:680,y:1340});requestFieldSupport(coop,{x:680,y:1340});
  for(let i=0;i<900;i++){step(solo,{},1/30);stepCoop(coop,{},1/30);}
  const view=s=>({allies:s.allies,fieldSquads:s.fieldSquads,fieldSupport:s.fieldSupport,soundEvents:s.soundEvents});
  assert.deepEqual(view(solo),view(coop));
});

test('buddy smoke consumes one real grenade, travels before its cloud, and blocks sight for both sides',()=>{
  const s=quiet(clearWorld(createGame({seed:17}))),{members,group}=positionGroup(s,'field-raven',[{x:500,y:500},{x:550,y:500},{x:500,y:560}]);
  const casualty=members[1];Object.assign(casualty,{hp:0,downed:true,bleed:5});
  for(const a of members){a.lastKnown={x:750,y:500};a.lastSeenAt=0;}
  run(s,.05);assert.equal(group.smokeUsed,true);assert.equal(s.smokes.length,0,'cloud cannot precede the actual smoke projectile');
  const grenade=s.grenades.find(g=>g.weapon==='smoke');assert.ok(grenade);assert.equal(grenade.owner,members[0].id);
  assert.equal(members[0].smokes,0);assert.equal(grenade.kind,'hand');
  run(s,1.3);assert.equal(s.smokes.length,1);assert.ok(distance(s.smokes[0],casualty)<2);
  assert.equal(combatLOS(s,{x:750,y:500},{x:400,y:500}),false);
  assert.equal(combatLOS(s,{x:400,y:500},{x:750,y:500}),false);
  run(s,1);assert.equal(s.grenades.filter(g=>g.weapon==='smoke').length,0);assert.equal(members[0].smokes,0);
});

test('a completed patrol returns and settles as a formation instead of holding an endless returning state',()=>{
  const s=quiet(createGame({seed:17})),group=s.fieldSquads.groups.find(g=>g.id==='field-raven');
  run(s,120);assert.equal(group.fieldJobDone,true);assert.equal(group.phase,'complete');
  const members=s.allies.filter(a=>a.fieldSquadId===group.id),positions=members.map(a=>({x:a.x,y:a.y}));
  assert.ok(members.every(a=>distance(a,group.staging)<185));run(s,8);
  assert.equal(group.phase,'complete');assert.ok(members.every((a,i)=>distance(a,positions[i])<2));
});
