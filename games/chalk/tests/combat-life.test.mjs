import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,createGame,step,issueOrder,hasLineOfSight,rebuildNavigationGrid,buildingAt} from '../public/sim.mjs';
import {enemyProfile} from '../public/combat-profiles.mjs';
import {initializeEncounters,updateEncounters} from '../public/encounters.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function run(s,seconds,input={},observe=()=>{}){
  for(let i=0;i<Math.ceil(seconds*30)&&s.status==='playing';i++){step(s,input,1/30);observe(s);}
}
function arena(){
  const s=createGame({seed:17,difficulty:'story'}),template={...s.enemies[0]};
  s.enemies=[];s.maxEnemies=0;s.civilians=[];s.survivors=[];s.vehicles=[];s.story.opportunities=[];
  s.world.walls=[];s.world.buildings=[];s.world.streetSolids=[];s.grid.fill(0);
  for(const a of s.squad)Object.assign(a,{hp:100000,maxHp:100000,cooldown:0,path:[],pathTimer:0});
  Object.assign(s.squad[0],{x:500,y:500});
  function enemy(kind,x,y,extra={}){
    const profile=enemyProfile(kind),a={...template,id:++s.nextId,kind,x,y,home:{x,y},hp:100000,maxHp:100000,
      ammo:profile.magazine,magSize:profile.magazine,reserve:profile.reserve,cooldown:0,accuracy:0,
      defensive:false,perceivedTargetId:null,lastKnown:null,lastSeenAt:-100,senseTimer:0,
      path:[],pathTimer:0,burst:0,braceProgress:0,braced:false,coverPoint:null,coverShelter:null,...extra};
    s.enemies.push(a);return a;
  }
  return{s,enemy};
}
function sawArena(){
  const {s,enemy}=arena(),webb=s.squad[3];s.squad[1].alive=false;s.squad[2].alive=false;
  Object.assign(webb,{x:620,y:550});s.order={type:'hold',x:542,y:480,label:'Hold'};
  const target=enemy('rifleman',900,550,{cooldown:999});return{s,webb,target};
}

test('authored approaches start as separated, connected small groups across every operation',()=>{
  for(let mission=0;mission<MISSIONS.length;mission++)for(const seed of [4,17,63]){
    const s=createGame({mission,seed,difficulty:'standard'}),groups=Map.groupBy(s.enemies,a=>a.encounterId);
    assert.ok(groups.size>=1);
    for(const [id,members] of groups){
      assert.ok(members.length>=3,`${mission}/${seed}/${id}: a populated approach is a group`);
      for(const a of members){
        assert.ok(members.some(b=>b!==a&&distance(a,b)<430),`${id}: members are within contact-report distance`);
        assert.ok(members.every(b=>b===a||distance(a,b)>=60),`${id}: no stacked spawn silhouettes`);
      }
    }
  }
});

test('a blocked group member does not prevent safe members entering, and expires without an endless retry wave',()=>{
  const s={missionIndex:0,difficulty:'standard',time:0,stageIndex:0,maxEnemies:16,enemies:[],
    squad:[{x:200,y:1720,alive:true,downed:false}],stages:[{id:'cordon-entry'},{id:'cordon-radio'},{id:'cordon-observe'}]};
  const hooks={nearbyFree:(s,x,y)=>({x,y}),canAddEnemy:()=>true,squadCanSeePoint:(s,p)=>p.y>1035,
    spawnEnemy:(s,p,unused,kind)=>{s.enemies.push({...p,kind,alive:true});return true;}};
  initializeEncounters(s,hooks);
  assert.equal(s.enemies.length,3);assert.equal(s.encounters.groups[0].placedIndices.includes(0),false);
  assert.deepEqual(s.enemies.map(a=>a.encounterSlot),[1,2,3]);
  s.time=36;hooks.squadCanSeePoint=()=>false;updateEncounters(s,1,hooks);
  assert.equal(s.enemies.length,3);assert.equal(s.encounters.groups[0].closed,true);
  s.enemies=[];s.time=100;updateEncounters(s,1,hooks);assert.equal(s.enemies.length,0);
});

test('the AI SAW produces a twelve-round automatic string, a real recovery pause, and another string',()=>{
  const {s,webb}=sawArena();run(s,3);
  const shots=s.soundEvents.filter(e=>e.type==='shot'&&e.actorId===webb.id);
  assert.ok(shots.length>12);assert.equal(webb.ammo,100-shots.length);
  assert.ok(shots.slice(0,12).every(e=>e.weapon==='support'));
  assert.ok(shots[11].sourceTime-shots[0].sourceTime>=1.04);
  for(let i=1;i<12;i++)assert.ok(shots[i].sourceTime-shots[i-1].sourceTime<.14);
  assert.ok(shots[12].sourceTime-shots[11].sourceTime>=.85);
});

test('a fighter uses a reachable edge, steps behind physical cover to reload, then resumes real aimed fire',()=>{
  const {s,enemy}=arena();for(const a of s.squad.slice(1))a.alive=false;
  s.world.walls=[{x:680,y:560,w:100,h:12}];rebuildNavigationGrid(s);
  const fighter=enemy('rifleman',770,510),start={x:770,y:510};run(s,1.5);
  assert.ok(fighter.coverPoint&&fighter.coverShelter);assert.ok(distance(start,fighter)>20);
  assert.ok(s.soundEvents.some(e=>e.type==='shot'&&e.actorId===fighter.id));
  fighter.ammo=0;run(s,2);
  assert.ok(fighter.reloadTimer>0);assert.equal(fighter.tactic,'reload');
  assert.equal(hasLineOfSight(s,fighter,s.squad[0]),false,'the reload refuge is actually occluded');
  const last=s.nextId;run(s,4);
  assert.ok(fighter.ammo>0&&fighter.ammo<30);assert.equal(hasLineOfSight(s,fighter,s.squad[0]),true);
  assert.ok(s.soundEvents.some(e=>e.id>last&&e.type==='shot'&&e.actorId===fighter.id));
});

test('squad movement alternates covering and moving soldiers while immediate human movement and fresh orders stay responsive',()=>{
  const {s,enemy}=arena(),lead=s.squad[0];
  Object.assign(lead,{x:500,y:650});
  s.squad.slice(1).forEach((a,i)=>Object.assign(a,[{x:420,y:700},{x:580,y:700},{x:500,y:780}][i]));
  enemy('rifleman',900,650,{cooldown:999});let mixed=0;
  run(s,3,{moveX:1},()=>{const ais=s.squad.slice(1);if(ais.some(a=>a.moving)&&ais.some(a=>a.tactic==='covering'&&!a.moving))mixed++;});
  assert.ok(mixed>=8,'visible fire and movement intervals occur together');assert.ok(lead.x>=820,'AI covering never delays the human');
  assert.ok(s.squad.slice(1).some(a=>distance(a,lead)>85),'the squad does not sit on the player');
  assert.equal(issueOrder(s,'move',{x:1100,y:900}),true);step(s,{},1/30);
  assert.ok(s.squad.slice(1).every(a=>a.moving),'a direct move order bypasses autonomous covering pauses');
});

test('longer AI strings still hold fire for a civilian inside the weapon dispersion corridor',()=>{
  const {s,webb}=sawArena();
  const civilian={id:++s.nextId,team:'civilian',kind:'civilian',name:'Resident',x:760,y:580,hp:45,maxHp:45,alive:true,downed:false,
    radius:11,needsAid:true,panicked:0,shelter:{x:760,y:580}};s.civilians=[civilian];
  run(s,.8);assert.equal(s.soundEvents.some(e=>e.type==='shot'&&e.actorId===webb.id),false);
  civilian.y=800;civilian.shelter.y=800;run(s,.5);
  assert.ok(s.soundEvents.some(e=>e.type==='shot'&&e.actorId===webb.id));assert.equal(s.stats.civilianHarm,0);
});

test('a broad formation contracts along a narrow street instead of sending followers through unrelated houses',()=>{
  const s=createGame({seed:17}),lead=s.squad[0];s.enemies=[];s.maxEnemies=0;s.civilians=[];
  Object.assign(lead,{x:680,y:1490});s.squad.slice(1).forEach((a,i)=>Object.assign(a,{x:680,y:1580+i*35}));
  run(s,8);
  assert.ok(s.squad.slice(1).every(a=>!buildingAt(s.world,a)&&distance(a,lead)<190));
  assert.ok(s.squad[1].x>lead.x&&s.squad[2].x<lead.x,'the kerb-constrained formation still has independent left and right slots');
});

test('a group report shares only an observed position and expires after the player becomes unseen',()=>{
  const {s,enemy}=arena();for(const a of s.squad.slice(1))a.alive=false;
  s.world.walls=[{x:600,y:600,w:200,h:12}];rebuildNavigationGrid(s);
  const observer=enemy('rifleman',700,500,{encounterId:'contact',cooldown:999});
  const partner=enemy('rifleman',700,680,{encounterId:'contact',cooldown:999});
  step(s,{},1/30);
  assert.equal(observer.target,s.squad[0].id);assert.equal(partner.target,null);assert.deepEqual(partner.lastKnown,{x:500,y:500});
  const known={...partner.lastKnown};s.squad[0].x=1700;s.world.walls.push({x:1100,y:0,w:12,h:1900});s.world.geometryRevision++;rebuildNavigationGrid(s);
  run(s,7);assert.deepEqual(partner.lastKnown,known);assert.equal(partner.alert,false);assert.ok(partner.lastSeenAt<1);
});

test('first-street play produces grouped rifle and automatic contacts without firing by the human',()=>{
  const s=createGame({seed:17,mission:0,difficulty:'standard'}),lead=s.squad[0],counts={},shooters=new Set();
  // Health only is raised so this observation is not truncated by casualty RNG.
  for(const a of s.squad){a.hp=100000;a.maxHp=100000;}
  const route=[{x:680,y:1720},{x:680,y:1340},{x:680,y:1190}];let next=0,last=s.nextId;
  for(let frame=0;frame<18*30;frame++){
    const goal=route[next],d=goal?distance(lead,goal):0;if(goal&&d<8)next++;
    const input=goal&&d>=8?{moveX:(goal.x-lead.x)/d,moveY:(goal.y-lead.y)/d,aimX:680,aimY:950}:{aimX:680,aimY:950};
    step(s,input,1/30);
    for(const event of s.soundEvents)if(event.id>last&&event.type==='shot'){
      const key=`${event.team}:${event.weapon}`;counts[key]=(counts[key]||0)+1;if(event.team==='enemy')shooters.add(event.actorId);
    }last=s.nextId;
  }
  assert.ok(counts['enemy:hostile']>=12);assert.ok(counts['enemy:hostile_support']>=12);
  assert.ok(counts['squad:support']>=6);assert.ok(shooters.size>=3);assert.equal(s.stats.shots,0);
});

test('a street-cover bullet impact reports its real material and stops before the actor behind it',()=>{
  const {s,enemy}=arena();for(const a of s.squad.slice(1))a.alive=false;
  const target=enemy('rifleman',700,500,{cooldown:999});s.world.streetSolids=[{x:590,y:460,w:20,h:80,material:'metal',propId:'parked-car'}];rebuildNavigationGrid(s);
  step(s,{fire:true,aimX:700,aimY:500},.05);
  const impact=s.soundEvents.find(e=>e.type==='impact');assert.ok(impact);assert.equal(impact.material,'metal');assert.equal(impact.propId,'parked-car');
  assert.equal(target.hp,target.maxHp);assert.equal(s.bullets.length,0);
});
