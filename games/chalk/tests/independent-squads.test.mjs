import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,stepCoop,setHumanPlayers,buildingAt,findPath,hasLineOfSight,getSolidWalls,rebuildNavigationGrid} from '../public/sim.mjs';
import {encounterBudget,enemyProfile,canAddEnemy,withInitialFieldReserve,INITIAL_FIELD_RESERVE} from '../public/combat-profiles.mjs';
import {FIELD_SQUAD_LIMITS,initializeIndependentSquads} from '../public/independent-squads.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function run(s,seconds,observe=()=>{}){for(let i=0;i<Math.ceil(seconds*30)&&s.status==='playing';i++){step(s,{},1/30);observe(s);}}
function closeEncounters(s){for(const g of s.encounters.groups)g.closed=true;}
function arena(){
  const s=createGame({seed:17}),ally=s.allies.find(a=>a.fieldSquadId==='field-hammer'),enemy=s.enemies.find(a=>a.fieldSquadId==='field-east-patrol');
  s.allies=[ally];s.enemies=[enemy];s.civilians=[];s.survivors=[];s.world.walls=[];s.world.buildings=[];s.world.streetSolids=[];s.grid.fill(0);closeEncounters(s);
  for(const a of s.squad){a.x=100;a.y=1750;a.hp=10000;a.maxHp=10000;}
  for(const [a,x] of [[ally,500],[enemy,700]])Object.assign(a,{x,y:500,home:{x,y:500},fieldPost:{x,y:500},fieldGoal:{x,y:500},hp:10000,maxHp:10000,cooldown:0,
    path:[],pathTimer:0,coverPoint:null,coverShelter:null,lastKnown:null,lastSeenAt:-100,perceivedTargetId:null,senseTimer:0,frags:0});
  s.fieldSquads.groups=s.fieldSquads.groups.filter(g=>[ally.fieldSquadId,enemy.fieldSquadId].includes(g.id));
  for(const g of s.fieldSquads.groups){const a=g.team==='allied'?ally:enemy;Object.assign(g,{order:'garrison',route:[{x:a.x,y:a.y}],initialStrength:1,leaderId:a.id});}
  return{s,ally,enemy};
}

test('all original missions seed the finite medic team and street cell within count, weighted and interior safety limits',()=>{
  for(let mission=0;mission<10;mission++)for(const difficulty of ['story','standard','veteran']){
    const s=createGame({mission,difficulty,seed:17}),budget=encounterBudget(difficulty);
    assert.equal(s.squad.length,4,'field allies never join the playable or extraction roster');
    assert.equal(s.allies.length,mission===0?FIELD_SQUAD_LIMITS.allies:FIELD_SQUAD_LIMITS.baseAllies);
    const atlas=s.allies.filter(a=>a.fieldSquadId==='field-atlas');
    assert.equal(atlas.length,3);assert.ok(atlas.some(a=>a.role==='medic'&&a.medkits===3));
    assert.equal(s.enemies.filter(a=>a.fieldSquadId==='field-courtyard').length,3,'the added cell keeps its small reserved allocation on Story too');
    assert.ok(s.enemies.length<=budget.maxAlive);
    assert.ok(s.enemies.reduce((sum,a)=>sum+enemyProfile(a).cost,0)<=budget.weight);
    assert.ok(s.fieldSquads.groups.length<=FIELD_SQUAD_LIMITS.groups);
    assert.ok(s.enemies.filter(a=>a.fieldSquadId).length<=FIELD_SQUAD_LIMITS.hostiles);
    for(const a of s.allies){assert.equal(a.team,'allied');if(a.fieldSquadId!=='field-relief'){assert.equal(a.visible,false);assert.ok(distance(a,s.squad[0])>550);}}
    const guards=s.enemies.filter(a=>a.fieldPost);
    if(difficulty!=='story')assert.ok(guards.length>0,`${mission}/${difficulty} has building occupants`);
    for(const a of guards){
      const building=buildingAt(s.world,a);assert.equal(building?.id,a.fieldPost.buildingId);
      assert.ok(building.doors.some(door=>findPath(s,a,door.outside).length),'guard can use a real doorway');
      assert.ok(!getSolidWalls(s.world).some(w=>a.x>w.x&&a.x<w.x+w.w&&a.y>w.y&&a.y<w.y+w.h));
    }
  }
});

test('the small field reservation lasts only through initial authored seeding, including nested scopes and errors',()=>{
  for(const difficulty of ['story','standard','veteran']){
    const budget=encounterBudget(difficulty),s={difficulty,maxEnemies:budget.maxAlive,enemies:[]};
    withInitialFieldReserve(s,()=>withInitialFieldReserve(s,()=>{
      while(canAddEnemy(s,'rifleman'))s.enemies.push({alive:true,kind:'rifleman'});
      assert.equal(s.enemies.length,budget.maxAlive-INITIAL_FIELD_RESERVE);
    }));
    assert.equal(canAddEnemy(s,'rifleman'),true,'later authored entries can use a free reserved slot');
    while(canAddEnemy(s,'rifleman'))s.enemies.push({alive:true,kind:'rifleman'});
    assert.equal(s.enemies.length,budget.maxAlive);
    s.enemies.pop();
    assert.throws(()=>withInitialFieldReserve(s,()=>{throw new Error('interrupted setup');}));
    assert.equal(canAddEnemy(s,'rifleman'),true,'failed setup cannot strand a hidden reservation');
  }
});

test('authored new districts keep the full finite teams and connect every assigned crossing to their real terrain',()=>{
  for(const mission of [10,11,12,13])for(const difficulty of ['story','standard','veteran']){
    const s=createGame({mission,difficulty,seed:17}),budget=encounterBudget(difficulty);
    assert.ok(s.world.missionLayout);
    assert.equal(s.allies.length,FIELD_SQUAD_LIMITS.allies,`${mission}/${difficulty} includes the finite reserve`);
    assert.equal(s.allies.filter(a=>a.fieldSquadId==='field-atlas').length,3);
    assert.equal(s.enemies.filter(a=>a.fieldSquadId==='field-courtyard').length,3);
    assert.ok(s.enemies.length<=budget.maxAlive);
    assert.ok(s.enemies.reduce((n,a)=>n+enemyProfile(a).cost,0)<=budget.weight);
    for(const group of s.fieldSquads.groups){
      const members=[...s.allies,...s.enemies].filter(a=>a.fieldSquadId===group.id);
      assert.ok(members.length<=FIELD_SQUAD_LIMITS.membersPerGroup);
      assert.ok(members.every(a=>findPath(s,a,group.route[0]).length));
      assert.ok(group.route.every((p,i)=>!i||findPath(s,group.route[i-1],p).length),`${mission}/${group.id} has a connected assignment`);
    }
    const reserve=s.allies.filter(a=>a.fieldSquadId==='field-relief');
    assert.ok(reserve.every(a=>s.squad.every(b=>distance(a,b)>60)));
    assert.ok(reserve.every(a=>s.enemies.every(e=>distance(a,e)>600||!hasLineOfSight(s,e,a))));
  }
});

test('declarative street traffic cannot exceed the finite ally or hostile allocation',()=>{
  let id=0;
  const spots=Array.from({length:20},(_,i)=>({x:200+(i%5)*400,y:200+Math.floor(i/5)*300}));
  const s={seed:17,missionIndex:1,time:0,difficulty:'veteran',maxEnemies:23,squad:[{x:30,y:1880}],civilians:[],survivors:[],enemies:[],
    world:{width:2400,height:1900,buildings:[],missionLayout:{fieldRoutes:{}},fieldTraffic:{friendly:{posts:spots,route:[spots[0]]},hostile:{posts:spots.map(p=>({x:p.x+80,y:p.y})),route:[{x:240,y:200}]}}}};
  const hooks={free:()=>true,squadCanSeePoint:()=>false,nearbyFree:(_s,x,y)=>({x,y}),findPath:(_s,_from,to)=>[to],
    actor:(_s,team,name,role,x,y,extra)=>({id:++id,team,name,role,x,y,alive:true,...extra}),
    spawnEnemy:(state,p)=>{if(!canAddEnemy(state,'rifleman'))return false;state.enemies.push({id:++id,team:'enemy',kind:'rifleman',x:p.x,y:p.y,alive:true,accuracy:.1});return true;}};
  initializeIndependentSquads(s,hooks);
  assert.equal(s.allies.length,3,'an oversized route definition cannot turn the medic team into a crowd');
  assert.equal(s.enemies.filter(a=>a.fieldSquadId).length,3,'the new cell remains three actual soldiers');
  assert.ok(s.allies.length<=FIELD_SQUAD_LIMITS.baseAllies);
  assert.ok(s.enemies.filter(a=>a.fieldSquadId).length<=FIELD_SQUAD_LIMITS.hostiles);
  assert.ok(s.fieldSquads.groups.length<=FIELD_SQUAD_LIMITS.groups);
});

test('added groups stage physically before distinct departures, then follow connected assignments without replacement soldiers',()=>{
  const s=createGame({seed:17});s.enemies=[];closeEncounters(s);
  const group=s.fieldSquads.groups.find(g=>g.id==='field-atlas'),members=s.allies.filter(a=>a.fieldSquadId===group.id),initial=members.map(a=>({...a}));
  run(s,group.departAt-.5);
  assert.ok(members.every(a=>distance(a,initial.find(p=>p.id===a.id))<1));
  assert.equal(group.phase,'staging');
  run(s,9);assert.ok(members.some(a=>distance(a,initial.find(p=>p.id===a.id))>60));
  assert.deepEqual(members.map(a=>a.id),initial.map(a=>a.id));
  const hostile=createGame({seed:17});hostile.allies=[];closeEncounters(hostile);
  hostile.enemies=hostile.enemies.filter(a=>a.fieldSquadId==='field-courtyard');
  const cell=hostile.fieldSquads.groups.find(g=>g.id==='field-courtyard'),posts=hostile.enemies.map(a=>({...a}));
  assert.ok(cell.departAt>group.departAt);
  run(hostile,cell.departAt-.5);assert.ok(hostile.enemies.every(a=>distance(a,posts.find(p=>p.id===a.id))<1));
  run(hostile,9);assert.ok(hostile.enemies.some(a=>distance(a,posts.find(p=>p.id===a.id))>40));
});

test('distant squads exchange real fire and damage with an idle player, without revealing their fight or awarding player statistics',()=>{
  const s=createGame({seed:17}),initialOrder=structuredClone(s.order),spawn={...s.squad[0]};
  let last=s.nextId,alliedShots=0,enemyShots=0,alliedHits=0,hostileHits=0,closest=Infinity;
  run(s,40,()=>{
    for(const e of s.soundEvents.filter(e=>e.id>last)){
      if(e.type==='shot'){
        if(e.team==='allied')alliedShots++;if(e.team==='enemy')enemyShots++;
        closest=Math.min(closest,distance(e,spawn));assert.ok(e.sourceTime<=e.time);assert.ok(e.actorId!=null);
      }
      if(e.type==='victim_hit'){if(e.team==='allied')alliedHits++;if(e.team==='enemy')hostileHits++;}
    }last=s.nextId;
  });
  assert.ok(alliedShots>=15&&enemyShots>=15);assert.ok(alliedHits>0&&hostileHits>0);
  assert.ok(closest>540,'fight is truly beyond ordinary player sight');
  assert.equal(s.allies.filter(a=>a.fieldSquadId!=='field-relief').some(a=>a.visible),false);assert.equal(s.enemies.some(a=>a.visible),false);
  assert.equal(s.stats.shots,0);assert.equal(s.stats.hits,0);assert.equal(s.stats.squadDowns,0);
  assert.deepEqual(s.order,initialOrder);assert.equal(s.stageIndex,0);
  assert.ok(s.soundEvents.length<=128);assert.ok(s.effects.length<=220);
});

test('jobs continue without the player and patrols resume their authored route after contacts vanish',()=>{
  const s=createGame({seed:17});s.enemies=[];closeEncounters(s);
  const start=s.allies.map(a=>({id:a.id,x:a.x,y:a.y}));run(s,16);
  assert.ok(s.allies.filter(a=>!['field-relief','field-atlas'].includes(a.fieldSquadId)).every(a=>distance(a,start.find(p=>p.id===a.id))>80));
  assert.ok(s.allies.filter(a=>a.fieldSquadId==='field-relief').every(a=>distance(a,start.find(p=>p.id===a.id))<1),'reserve holds until committed');
  assert.ok(s.fieldSquads.groups.filter(g=>g.team==='allied').some(g=>g.waypoint>0));
  const hostile=createGame({seed:17});hostile.allies=[];closeEncounters(hostile);
  hostile.enemies=hostile.enemies.filter(a=>a.fieldSquadId==='field-east-patrol');
  const patrol=hostile.fieldSquads.groups.find(g=>g.id==='field-east-patrol'),member=hostile.enemies[0],origin={...member};
  run(hostile,18);assert.ok(distance(member,origin)>70);assert.ok(patrol.waypoint>0);
  assert.equal(member.target,null);assert.equal(hostile.order.type,'follow');
});

test('extraction depends on the four playable soldiers while distant independent squads remain alive',()=>{
  const s=createGame({seed:17});closeEncounters(s);s.stageIndex=s.stages.length-1;s.phaseTime=0;
  const extraction=s.stages[s.stageIndex],fieldIds=s.enemies.filter(a=>a.fieldSquadId).map(a=>a.id);
  for(const [i,a] of s.squad.entries())Object.assign(a,{x:extraction.x+(i%2)*25,y:extraction.y+Math.floor(i/2)*25,hp:10000,maxHp:10000});
  for(const a of s.enemies)Object.assign(a,{cooldown:999,hp:10000,maxHp:10000});
  run(s,4);
  assert.equal(s.status,'won');assert.ok(s.enemies.filter(a=>fieldIds.includes(a.id)&&a.alive).length>0);
  assert.ok(s.allies.every(a=>distance(a,extraction)>extraction.radius));
  assert.equal(s.stats.shots,0);assert.equal(s.stats.hits,0);
});

test('field soldiers perceive only actual sight and finite reports, then stop tracking a hidden opponent',()=>{
  const {s,ally,enemy}=arena();run(s,.5);
  assert.equal(ally.target,enemy.id);assert.equal(enemy.target,ally.id);
  const observed={...ally.lastKnown};
  s.world.walls=[{x:600,y:0,w:12,h:1900}];s.world.geometryRevision++;rebuildNavigationGrid(s);
  enemy.x=1300;enemy.fieldPost.x=1300;enemy.fieldGoal.x=1300;enemy.home.x=1300;
  const first=s.nextId;run(s,7);
  assert.deepEqual(ally.lastKnown,observed);assert.equal(ally.target,null);
  assert.equal(hasLineOfSight(s,ally,enemy),false);
  assert.equal(s.soundEvents.some(e=>e.id>first&&e.type==='shot'&&e.team==='allied'),false);
  assert.ok(s.time-ally.lastSeenAt>6);
});

test('a visible field ally uses only player sight, and allied casualties persist without changing playable squad counts',()=>{
  const {s,ally,enemy}=arena();enemy.cooldown=999;ally.cooldown=999;
  Object.assign(s.squad[0],{x:470,y:520});run(s,.2);assert.equal(ally.visible,true);
  Object.assign(s.squad[0],{x:100,y:1750});run(s,.2);assert.equal(ally.visible,false);
  ally.hp=10;s.bullets=[{id:++s.nextId,x:650,y:500,px:650,py:500,vx:-2000,vy:0,team:'enemy',owner:enemy.id,weapon:'hostile',damage:20,ttl:1}];
  run(s,.1);assert.equal(ally.alive,true);assert.equal(ally.downed,true);assert.equal(s.bodies.some(b=>b.actorId===ally.id),false);
  assert.equal(s.stats.squadDowns,0);assert.equal(s.squad.length,4);
  enemy.cooldown=999;ally.bleed=69.9;run(s,.2);assert.equal(ally.alive,false);
  assert.equal(s.bodies.filter(b=>b.actorId===ally.id).length,1);assert.equal(s.bodies.find(b=>b.actorId===ally.id).team,'allied');
  run(s,2);assert.equal(s.bodies.filter(b=>b.actorId===ally.id).length,1);
});

test('NPC grenades are finite real projectiles and withhold throws near a friendly or civilian',()=>{
  const {s,ally,enemy}=arena();s.time=10;ally.frags=1;ally.cooldown=999;enemy.cooldown=999;
  const group=s.fieldSquads.groups.find(g=>g.id===ally.fieldSquadId);group.lastContactAt=10;
  s.civilians=[{id:9000,team:'civilian',x:700,y:540,alive:true,downed:false,hp:45,maxHp:45,radius:11,needsAid:true}];
  run(s,.3);assert.equal(ally.frags,1);assert.equal(s.grenades.length,0,'bystander blocks automatic throw');
  s.civilians=[];run(s,.3);assert.equal(ally.frags,0);assert.ok(s.grenades.some(g=>g.owner===ally.id&&g.weapon==='frag'));
  run(s,2.6);const blast=s.soundEvents.find(e=>e.type==='explosion'&&e.sourceActorId===ally.id);
  assert.ok(blast);assert.equal(blast.team,'allied');assert.equal(group.grenadeUsed,true);assert.ok(enemy.hp<enemy.maxHp);
  assert.equal(s.stats.shots,0);assert.equal(s.stats.hits,0);
});

test('independent collateral harm stays physical without blaming the player, but later chalk damage is attributed once',()=>{
  const {s,ally,enemy}=arena();ally.cooldown=999;enemy.cooldown=999;
  const civilian={id:9001,team:'civilian',x:600,y:500,alive:true,downed:false,hp:100,maxHp:100,radius:11,needsAid:true};
  s.civilians=[civilian];
  const hit=(owner,team)=>{s.bullets=[{id:++s.nextId,x:550,y:500,px:550,py:500,vx:2000,vy:0,team,owner,weapon:'rifle',damage:10,ttl:1}];step(s,{},.05);};
  hit(ally.id,'allied');assert.equal(civilian.hp,90);assert.equal(civilian.harmed,true);
  assert.equal(s.stats.civilianHarm,0);assert.equal(s.radio.some(line=>line.text.includes('Check your fire')),false);
  hit(s.playerId,'squad');assert.equal(civilian.hp,80);assert.equal(s.stats.civilianHarm,1);
  hit(s.squad[1].id,'squad');assert.equal(s.stats.civilianHarm,1);assert.equal(civilian.hp,70);
});

test('independent combat remains deterministic between solo and authoritative co-op stepping',()=>{
  const solo=createGame({seed:63}),coop=createGame({seed:63});setHumanPlayers(coop,[coop.playerId]);
  for(let i=0;i<300;i++){step(solo,{},1/30);stepCoop(coop,{},1/30);}
  const view=s=>({allies:s.allies,enemies:s.enemies,fieldSquads:s.fieldSquads,soundEvents:s.soundEvents});
  assert.deepEqual(view(solo),view(coop));
});
