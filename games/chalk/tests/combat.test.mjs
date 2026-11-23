import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,step,selectSquadMember,hasLineOfSight,findPath,rebuildNavigationGrid} from '../public/sim.mjs';
import {enemyProfile,ballisticProfile,encounterBudget,WORLD_UNITS_PER_METRE} from '../public/combat-profiles.mjs';
import {squadCanSeePoint} from '../public/visibility.mjs';

function run(s,seconds,input={}){for(let i=0;i<Math.ceil(seconds*30)&&s.status==='playing';i++)step(s,input,1/30);}
function arena(kind=null){
  const s=createGame({seed:17,difficulty:'story'}),template={...s.enemies[0]},p=s.squad[0];
  s.enemies=[];s.civilians=[];s.maxEnemies=0;s.world.buildings=[];s.world.walls=[];s.grid.fill(0);s.story.opportunities=[];
  Object.assign(p,{x:500,y:500,hp:100000,maxHp:100000});
  for(const other of s.squad)if(other!==p)other.alive=false;
  let enemy=null;
  if(kind){const profile=enemyProfile(kind);enemy={...template,id:++s.nextId,kind,name:profile.name,x:780,y:500,hp:1000,maxHp:1000,alive:true,downed:false,
    ammo:profile.magazine,magSize:profile.magazine,reserve:profile.reserve,accuracy:0,cooldown:0,senseTimer:0,perceivedTargetId:null,lastKnown:null,lastSeenAt:-100,
    braceProgress:0,braced:false,nextFlankAt:0,flankSide:1,defensive:false,path:[],pathTimer:0,suppression:0};s.enemies=[enemy];}
  return {s,p,enemy};
}
function projectile(s,{x=300,y=525,range=600,weapon='hostile'}={}){
  const speed=ballisticProfile(weapon).speedMps*WORLD_UNITS_PER_METRE;
  const b={id:++s.nextId,x,y,px:x,py:y,vx:speed,vy:0,team:'enemy',owner:999,weapon,damage:10,ttl:range/speed,
    rangeRemaining:range,originX:x,originY:y,firedAt:s.time,speedMps:speed/WORLD_UNITS_PER_METRE,travelled:0,nearPassIds:[]};
  s.bullets.push(b);return b;
}

test('the support gunner must brace, fires a distinct finite burst, and loses its firing posture under smoke or suppression',()=>{
  const {s,enemy}=arena('gunner');run(s,.6);assert.ok(enemy.braceProgress>0&&enemy.braceProgress<1);
  assert.equal(s.soundEvents.some(e=>e.type==='shot'),false);
  run(s,.95);const shots=s.soundEvents.filter(e=>e.type==='shot');
  assert.equal(shots.length,6);assert.ok(shots[0].sourceTime>=.8-1e-6);assert.ok(shots.every(e=>e.weapon==='hostile_support'));
  assert.equal(enemy.ammo,54);assert.ok(enemy.cooldown>2);assert.equal(enemy.braced,true);
  s.smokes=[{x:640,y:500,radius:105,ttl:14}];step(s,{},1/30);assert.equal(enemy.braced,false);assert.equal(enemy.braceProgress,0);
  s.smokes=[];enemy.suppression=.9;run(s,.3);assert.equal(enemy.braced,false);
  enemy.ammo=0;step(s,{},1/30);assert.equal(enemy.reloadTimer,4.4);
  run(s,4.45);assert.equal(enemy.ammo,60);assert.equal(enemy.reserve,120);
});

test('the flanker physically takes a lateral path, pauses to shoot and searches its last known position instead of tracking an unseen player',()=>{
  const {s,p,enemy}=arena('flanker'),initial={x:enemy.x,y:enemy.y},plans=new Set(),senses=new Set();
  for(let i=0;i<120;i++){step(s,{},1/30);if(enemy.flankPlannedAt!==undefined)plans.add(enemy.flankPlannedAt);if(enemy.sensedAt!==undefined)senses.add(enemy.sensedAt);}
  assert.ok(Math.abs(enemy.y-initial.y)>120,'a flanker changes the firing angle instead of walking directly at the player');
  assert.ok(s.soundEvents.some(e=>e.type==='shot'&&e.actorId===enemy.id),'it can fire after reaching its flank');
  assert.ok(plans.size<=2);assert.ok(senses.size<=24,'perception runs at a staggered 5–6Hz');
  const known={...enemy.lastKnown};p.x=1700;
  s.world.walls=[{x:1100,y:0,w:10,h:1900}];rebuildNavigationGrid(s);run(s,7);
  assert.deepEqual(enemy.lastKnown,known);assert.equal(enemy.tactic,'search');assert.equal(enemy.moving,false);assert.ok(enemy.x<1100);
});

test('larger encounters honor living-count, weighted specialist and sight-safe reinforcement budgets',()=>{
  for(const difficulty of ['story','standard','veteran'])for(let seed=1;seed<=8;seed++){
    const s=createGame({difficulty,seed}),budget=encounterBudget(difficulty);
    for(const a of s.squad){a.hp=100000;a.maxHp=100000;a.ammo=0;a.reserve=0;}
    for(let wave=0;wave<14;wave++){
      const prior=new Set(s.enemies.map(a=>a.id));s.stageIndex=Math.min(s.stages.length-1,Math.floor(wave/2));s.phaseTime=0;s.spawnTimer=0;s.time+=20;step(s,{},1/30);
      const living=s.enemies.filter(a=>a.alive);
      assert.ok(living.length<=budget.maxAlive);assert.ok(living.reduce((total,a)=>total+enemyProfile(a).cost,0)<=budget.weight);
      for(const [kind,cap] of [['gunner',budget.gunners],['flanker',budget.flankers],['sniper',1]])assert.ok(living.filter(a=>a.kind===kind).length<=cap);
      for(const fresh of living.filter(a=>!prior.has(a.id))){assert.equal(squadCanSeePoint(s,fresh),false);assert.ok(s.squad.every(a=>Math.hypot(a.x-fresh.x,a.y-fresh.y)>420));}
    }
  }
});

test('supersonic bullets retain a fixed gameplay range instead of gaining range with their speed',()=>{
  const {s,p}=arena();step(s,{fire:true,aimX:2000,aimY:500},.05);
  const bullet=s.bullets[0],shot=s.soundEvents.find(e=>e.type==='shot');assert.ok(bullet);
  assert.equal(shot.sourceTime,0);assert.equal(shot.time,.05);assert.equal(bullet.firedAt,0);
  assert.equal(Math.hypot(bullet.vx,bullet.vy),800*WORLD_UNITS_PER_METRE);assert.equal(bullet.speedMps,800);
  step(s,{},.05);assert.equal(s.bullets.length,0);assert.ok(Math.abs(bullet.travelled-600)<1e-8);assert.equal(bullet.rangeRemaining,0);
  assert.ok(Math.abs(Math.hypot(bullet.x-bullet.originX,bullet.y-bullet.originY)-600)<1e-8);assert.equal(p.ammo,29);
});

test('same-tick hits and thin-wall impacts have coherent fractional source times and cannot precede their shot',()=>{
  const {s,p,enemy}=arena('rifleman');Object.assign(enemy,{x:600,y:500,cooldown:999});
  step(s,{fire:true,aimX:600,aimY:500},.05);
  const shot=s.soundEvents.find(e=>e.type==='shot'),hit=s.soundEvents.find(e=>e.type==='victim_hit');
  assert.ok(hit);assert.ok(hit.sourceTime>=shot.sourceTime&&hit.sourceTime<s.time);assert.ok(hit.damage>0);
  const wall=arena('rifleman');Object.assign(wall.enemy,{x:600,y:500,cooldown:999});wall.s.world.walls=[{x:560,y:400,w:2,h:200}];
  step(wall.s,{fire:true,aimX:600,aimY:500},.05);
  const impact=wall.s.soundEvents.find(e=>e.type==='impact');assert.ok(impact);assert.ok(Math.abs(impact.x-560)<1e-7);
  assert.ok(impact.sourceTime>=0&&impact.sourceTime<.05);assert.equal(wall.enemy.hp,wall.enemy.maxHp);assert.equal(wall.s.bullets.length,0);
});

test('a real near pass carries its actual closest point and time once per bullet/listener',()=>{
  const {s,p}=arena(),b=projectile(s);step(s,{},.05);
  const pass=s.soundEvents.find(e=>e.type==='near_pass');assert.ok(pass);
  assert.equal(pass.victimId,p.id);assert.equal(pass.actorId,p.id);assert.equal(pass.sourceActorId,999);assert.equal(pass.bulletId,b.id);
  assert.equal(pass.x,500);assert.equal(pass.y,525);assert.equal(pass.missDistance,25);assert.equal(pass.speedMps,700);
  assert.ok(Math.abs(pass.sourceTime-200/(700*8))<1e-9);assert.ok(pass.sourceTime>=pass.firedAt&&pass.sourceTime<s.time);
  step(s,{},.05);assert.equal(s.soundEvents.filter(e=>e.type==='near_pass'&&e.bulletId===b.id).length,1);assert.equal(p.hp,p.maxHp);
});

test('a direct hit, stopped endpoint, exhausted range and shielding wall cannot invent a near-pass crack',()=>{
  for(const scenario of ['hit','stop','range','shield']){
    const {s}=arena();
    if(scenario==='stop')s.world.walls=[{x:480,y:0,w:10,h:1900}];
    if(scenario==='shield')s.world.walls=[{x:0,y:513,w:2400,h:5}];
    projectile(s,{y:scenario==='hit'?500:525,range:scenario==='range'?180:600});step(s,{},.05);
    assert.equal(s.soundEvents.some(e=>e.type==='near_pass'),false,scenario);
  }
});

test('a real launcher breach preserves initial wall shielding, then opens sight and navigation for subsequent shots',()=>{
  const s=createGame({seed:17});s.enemies=[];s.maxEnemies=0;s.civilians=[];const p=s.squad[1];selectSquadMember(s,p.id);Object.assign(p,{x:210,y:1500});
  const resident={id:++s.nextId,team:'civilian',kind:'civilian',name:'Resident',x:328,y:1500,hp:45,maxHp:45,alive:true,downed:false,radius:11,needsAid:true,panicked:0,shelter:{x:328,y:1500}};s.civilians=[resident];
  const outside={x:252,y:1500},inside={x:328,y:1500};assert.equal(hasLineOfSight(s,outside,inside),false);assert.ok(findPath(s,outside,inside).length>1);
  const cell=Math.floor(1500/40)*60+Math.floor(300/40);assert.equal(s.grid[cell],1);
  step(s,{grenade:true,aimX:350,aimY:1500},1/30);
  for(let i=0;i<30&&s.destruction.revision===0;i++)step(s,{},1/30);
  assert.equal(s.destruction.revision,1);assert.equal(s.world.geometryRevision,1);assert.equal(resident.hp,45,'the wall shields the first blast before it is removed');
  assert.equal(hasLineOfSight(s,outside,inside),true);assert.deepEqual(findPath(s,outside,inside),[inside]);assert.equal(s.grid[cell],0);
  assert.ok(s.squad.every(a=>a.path.length===0),'a changed wall invalidates routes at the moment of the breach');
  const blast=s.soundEvents.find(e=>e.type==='explosion');assert.equal(blast.breached,true);assert.equal(blast.breachCount,1);assert.ok(blast.sourceTime<=blast.time);
  run(s,.2);step(s,{fire:true,aimX:328,aimY:1500},.05);assert.ok(resident.hp<45,'a later bullet can use the new passage');
  const hale=s.squad[0];selectSquadMember(s,hale.id);Object.assign(hale,inside);
  s.squad.slice(1).forEach((a,i)=>Object.assign(a,{x:252-i*12,y:1488+i*12}));run(s,2.5);
  assert.ok(s.squad.slice(1).every(a=>a.x>300),'AI followers use the rebuilt grid to enter through the breach');
  const fresh=createGame({seed:17});assert.equal(fresh.destruction.revision,0);assert.equal(hasLineOfSight(fresh,outside,inside),false);
});
