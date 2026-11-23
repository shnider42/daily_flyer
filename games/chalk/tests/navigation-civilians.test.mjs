import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,findPath,rebuildNavigationGrid,segmentRectEntry,step,hasLineOfSight,buildingAt,getSolidWalls} from '../public/sim.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function quiet(seed=17,mission=0){
  const s=createGame({seed,mission,difficulty:'story'});s.enemies=[];s.maxEnemies=0;s.spawnTimer=1e9;
  if(s.story)s.story.opportunities=[];
  return s;
}
function run(s,seconds,input={}){for(let i=0;i<Math.ceil(seconds*30);i++)step(s,input,1/30);}
function clearSegment(s,from,to,radius=13){return getSolidWalls(s.world).every(w=>!Number.isFinite(segmentRectEntry(from,to,w,radius)));}
function alone(s){for(const other of s.squad.slice(1))other.alive=false;s.survivors=[];return s.squad[0];}

test('navigation rejects thin walls between otherwise free grid cells and retains a valid route around them',()=>{
  const s=quiet();s.world.buildings=[];s.world.walls=[{id:'thin',x:119,y:950,w:2,h:100}];s.world.geometryRevision++;rebuildNavigationGrid(s);
  const from={x:100,y:980},to={x:140,y:980},route=findPath(s,from,to);
  assert.equal(s.grid[24*60+2],0);assert.equal(s.grid[24*60+3],0,'both endpoint cells alone are free');
  assert.ok(route.length>1,'must go around the wall instead of crossing its unoccupied grid edge');
  let previous=from;for(const point of route){assert.ok(clearSegment(s,previous,point),'each actual segment clears the thin wall');previous=point;}
  assert.ok(distance(previous,to)<1e-6);
  s.world.walls=[];s.world.geometryRevision++;rebuildNavigationGrid(s);
  assert.deepEqual(findPath(s,from,to),[to],'changed geometry invalidates the cached blocked edge');
});

test('a civilian reaches a final waypoint inside the old 18px discard distance instead of stalling',()=>{
  const s=quiet(),c=s.civilians[0];alone(s);s.civilians=[c];
  Object.assign(c,{x:200,y:1720,needsAid:false,transportWaiting:false,shelter:{x:217,y:1720},shelterAssigned:true,shelterRevision:0,civilianState:'fleeing',panicked:0});
  run(s,1);
  assert.ok(distance(c,c.shelter)<=8,'final destination is retained until the actual arrival radius is reached');
  assert.equal(c.moving,false);
});

test('a smaller rescued resident can replan from a legal tight corner without moving their valid destination',()=>{
  const s=quiet(17,5),from={x:1081.4008,y:313.9837,radius:11},target={x:1081.7,y:400};
  assert.ok(clearSegment(s,from,from,11),'the resident is outside the actual collision radius');
  assert.equal(clearSegment(s,from,from,13),false,'the old fixed soldier clearance rejected this source attachment');
  assert.ok(clearSegment(s,target,target,11));
  const route=findPath(s,from,target);assert.ok(route.length);
  let previous=from;for(const point of route){assert.ok(clearSegment(s,previous,point,11));previous=point;}
  assert.ok(distance(previous,target)<1e-6,'a valid small-actor goal is not shifted across the neighbouring wall');
});

test('residents navigate actual angled doorway approaches and partitions across varied layouts without wall crossings',()=>{
  for(const mission of [0,1,2,3])for(const seed of [4,17,90210]){
    const s=quiet(seed,mission),c=s.civilians[0];alone(s);s.civilians=[c];
    const house=s.world.buildings.find(b=>b.rooms?.length===2),south=house.doors.find(d=>d.side==='south'),room=house.rooms[0];
    const target={x:room.x+25,y:room.y+30};
    Object.assign(c,{x:south.x+55,y:south.outside.y+30,needsAid:false,transportWaiting:false,shelter:target,shelterAssigned:true,shelterRevision:0,panicked:30});
    let previous={x:c.x,y:c.y};
    for(let tick=0;tick<30*14;tick++){
      step(s,{},1/30);assert.ok(clearSegment(s,previous,c,c.radius),`${mission}/${seed}: actual movement segment remains outside masonry`);previous={x:c.x,y:c.y};
    }
    assert.equal(buildingAt(s.world,c),house,`${mission}/${seed}: entered the intended house`);
    assert.ok(distance(c,target)<=8,`${mission}/${seed}: cleared door and partition, reached cover`);
  }
});

test('nearby real rifle fire sends an exposed civilian to reachable, occluded interior cover and they remain sheltered',()=>{
  for(const seed of [4,17,19931003]){
    const s=quiet(seed),p=alone(s),c=s.civilians[0];s.civilians=[c];
    const house=s.world.buildings.find(b=>b.id==='b30a'),door=house.doors.find(d=>d.side==='south');
    Object.assign(c,{x:door.x,y:door.y+84,needsAid:false,transportWaiting:false,shelterAssigned:false,shelterRevision:0,panicked:0,path:[]});
    Object.assign(p,{x:door.x-120,y:door.y+100,cooldown:0});
    const start={x:c.x,y:c.y};
    step(s,{fire:true,aimX:p.x-300,aimY:p.y},1/30);
    assert.ok(c.panicked>0);assert.equal(c.civilianState,'fleeing');assert.ok(c.shelterAssigned);
    assert.ok(findPath(s,c,c.shelter).length,'the chosen refuge has a legal door route');
    run(s,14);
    assert.ok(distance(c,start)>35,'resident leaves the exposed street');
    assert.ok(buildingAt(s.world,c),'resident enters shelter rather than stopping at another street point');
    assert.equal(hasLineOfSight(s,c,p),false,'the refuge blocks sight from the actual nearby firing position');
    assert.equal(c.civilianState,'sheltered');
    const settled={x:c.x,y:c.y};run(s,18);
    assert.ok(distance(c,settled)<1,'the resident stays sheltered after the immediate panic timer expires');
  }
});

test('nearby impacts and explosions provoke shelter behavior while distant gunfire does not reveal an unseen shooter',()=>{
  for(const type of ['impact','explosion']){
    const s=quiet(),c=s.civilians[2];alone(s);s.civilians=[c];
    Object.assign(c,{x:680,y:1340,needsAid:false,transportWaiting:false,shelterAssigned:false,panicked:0});
    const before={x:c.x,y:c.y};
    s.soundEvents.push({id:++s.nextId,type:'shot',time:s.time,x:2100,y:200,team:'enemy',actorId:999});
    step(s,{},1/30);assert.equal(c.panicked,0);assert.equal(c.civilianState,'idle');assert.equal(distance(c,before),0);
    s.soundEvents.push({id:++s.nextId,type,time:s.time,x:c.x+35,y:c.y+20,team:'enemy',actorId:999});
    step(s,{},1/30);assert.ok(c.panicked>0);assert.equal(c.civilianState,'fleeing');
    assert.ok(s.soundEvents.some(e=>e.type==='civilian_fear'&&e.victimId===c.id));
  }
});

test('injured and transport-waiting residents stay available for aid, then move to cover when released',()=>{
  const s=quiet(),c=s.civilians[0];alone(s);s.civilians=[c];
  Object.assign(c,{x:680,y:1340,needsAid:true,transportWaiting:false,shelterAssigned:false,panicked:0});
  const start={x:c.x,y:c.y};s.soundEvents.push({id:++s.nextId,type:'explosion',time:s.time,x:720,y:1340,team:'enemy',actorId:999});
  run(s,1);assert.equal(distance(c,start),0);assert.equal(c.civilianState,'cowering');
  c.needsAid=false;c.transportWaiting=true;run(s,1);assert.equal(distance(c,start),0);
  c.transportWaiting=false;run(s,10);assert.ok(distance(c,start)>35);assert.ok(buildingAt(s.world,c));
});

test('ordinary residents start in a mix of sheltered and outdoor positions with no doorway occupancy',()=>{
  const s=quiet(),ordinary=s.civilians.filter(c=>!c.needsAid&&!c.transportWaiting);
  const indoors=ordinary.filter(c=>buildingAt(s.world,c));
  assert.ok(indoors.length>=2);assert.ok(indoors.length<ordinary.length);
  for(const c of indoors){const house=buildingAt(s.world,c);assert.equal(c.civilianState,'sheltered');assert.ok(house.doors.every(d=>distance(c,d)>35));assert.ok(getSolidWalls(s.world).every(w=>!Number.isFinite(segmentRectEntry(c,c,w,c.radius))));}
});

test('the AI squad and recovered crew negotiate both doors and a partition together across seeds',()=>{
  for(const seed of [4,17,90210]){
    const s=quiet(seed,1);s.civilians=[];
    const house=s.world.buildings.find(b=>b.id==='b30'),south=house.doors[1],north=house.doors[0],leader=s.squad[0];
    Object.assign(leader,{x:south.x,y:house.y+66});
    s.squad.slice(1).forEach((a,i)=>Object.assign(a,{x:south.x+(i-1)*35,y:south.outside.y+30+i*24,path:[],pathTimer:0}));
    s.survivors.forEach((a,i)=>Object.assign(a,{x:south.x+i*20,y:south.outside.y+100,alive:true,downed:false,stabilized:true,missionWait:false,path:[],pathTimer:0}));
    run(s,15);
    assert.ok([...s.squad,...s.survivors].every(a=>buildingAt(s.world,a)===house),`${seed}: the full party comes inside`);
    Object.assign(leader,{x:north.x,y:north.outside.y-105});run(s,18);
    assert.ok([...s.squad,...s.survivors].every(a=>a.y<house.y-13&&!buildingAt(s.world,a)),`${seed}: the full party exits through the other door`);
  }
});
