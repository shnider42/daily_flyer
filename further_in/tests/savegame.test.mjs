import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVEL_ORDER, createGame, update, interact, target, beginChase, developerAction, finalHall, pathBetween, distance, openAt} from '../dist/core.mjs';
import {serializeGame, restoreGame} from '../dist/savegame.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const advance=(s,seconds,input={})=>{for(let n=0;n<Math.ceil(seconds*60);n++)update(s,input,1/60);};
function use(s,item){
  s.player={...s.player,x:item.x,z:item.z,yaw:0};
  assert.ok(target(s));assert.equal(interact(s),true);
}
function door(s,id){
  use(s,s.doors.find(d=>d.id===id));advance(s,.75);
  assert.equal(s.transition,null);
}

test('all six floors round-trip their world, equipment, identity, and RNG without retaining references or events',()=>{
  for(const level of LEVEL_ORDER){
    const original=createGame(level,92017);original.tool=true;
    original.events.push({type:'note',text:'Transient UI content'});
    const snapshot=serializeGame(original);
    assert.ok(snapshot);assert.equal(snapshot.schema,1);
    assert.equal(snapshot.data.events,undefined);assert.equal(snapshot.data.random,undefined);
    const restored=restoreGame(JSON.parse(JSON.stringify(snapshot)));
    assert.ok(restored,`Floor ${level} resumes`);
    assert.equal(restored.level,level);assert.equal(restored.seed,92017);
    assert.equal(restored.tool,true);assert.equal(restored.status,'playing');
    assert.equal(restored.transition,null);assert.deepEqual(restored.events,[]);
    assert.deepEqual(restored.map,original.map);assert.deepEqual(restored.items,original.items);
    assert.notEqual(restored.map,original.map);assert.notEqual(restored.map,snapshot.data.map);
    assert.equal(restored.random.getState(),original.random.getState());
    for(let i=0;i<12;i++)assert.equal(restored.random(),original.random());
    restored.player.x+=.1;assert.notEqual(restored.player.x,snapshot.data.player.x);
  }
});

test('partial drainage progress survives reload and its remaining controls still unlock the physical gate',()=>{
  const original=createGame(4,522);
  use(original,original.items.find(i=>i.kind==='control'&&i.id===2));
  advance(original,.75);
  const snapshot=serializeGame(original),resumed=restoreGame(snapshot,{safe:false});
  assert.ok(resumed);assert.equal(resumed.puzzle.progress,1);
  assert.equal(resumed.puzzle.water,original.puzzle.water);
  assert.equal(resumed.items.find(i=>i.id===2).active,true);
  const exit=resumed.items.find(i=>i.kind==='exit');
  assert.equal(pathBetween(resumed.map,resumed.player,exit).length,0);
  for(const id of [1,3])use(resumed,resumed.items.find(i=>i.kind==='control'&&i.id===id));
  assert.equal(resumed.puzzle.solved,true);
  assert.ok(pathBetween(resumed.map,resumed.player,exit).length>0);
  const again=restoreGame(serializeGame(resumed));
  assert.equal(again.puzzle.solved,true);assert.equal(again.items.find(i=>i.kind==='exit').locked,false);
  assert.deepEqual(again.map,resumed.map,'An opened gate does not revert during reconstruction');
});

test('records saves retain latched breakers and reached refuges while clearing imminent danger on safe resume',()=>{
  const original=createGame(5,713),breaker=original.items.find(i=>i.kind==='control');
  use(original,breaker);update(original);
  original.puzzle.awareness=.94;original.moving=2.8;original.run=true;
  const snapshot=serializeGame(original),exact=restoreGame(snapshot,{safe:false}),safe=restoreGame(snapshot);
  assert.equal(exact.puzzle.awareness,.94);assert.equal(safe.puzzle.awareness,0);
  for(const resumed of [exact,safe]){
    assert.equal(resumed.puzzle.breakers,1);assert.equal(resumed.checkpointIndex,1);
    assert.deepEqual(resumed.checkpoint,original.checkpoint);assert.equal(resumed.items.find(i=>i.id===1).active,true);
    assert.equal(resumed.moving,0);assert.equal(resumed.run,false);
    use(resumed,resumed.items.find(i=>i.kind==='control'&&i.id===2));
    assert.equal(resumed.puzzle.solved,true);
    assert.ok(pathBetween(resumed.map,resumed.player,resumed.items.find(i=>i.kind==='exit')).length);
  }
  assert.ok(safe.settle>=2.5);
});

test('service passage saves keep completed inspections and the latest safe alcove',()=>{
  const original=createGame(6,338),refuge=original.refuges[2];
  original.player={x:refuge.x,z:refuge.z,yaw:0,pitch:0};update(original);
  original.exposure=.4;
  assert.equal(original.puzzle.cleared,1);assert.equal(original.checkpointIndex,2);
  const snapshot=serializeGame(original),exact=restoreGame(snapshot,{safe:false}),safe=restoreGame(snapshot);
  assert.equal(exact.exposure,.4);assert.equal(safe.exposure,0);
  assert.deepEqual(safe.inspections,original.inspections);
  assert.deepEqual(safe.checkpoint,original.checkpoint);assert.equal(safe.checkpointIndex,2);
  developerAction(safe,'transit');
  const finished=restoreGame(serializeGame(safe));
  assert.equal(finished.puzzle.cleared,3);assert.equal(finished.puzzle.solved,true);
  assert.equal(finished.items.find(i=>i.kind==='exit').locked,false);
});

test('a saved yellow-room pursuit preserves its maze and gives a returning player time to orient',()=>{
  const original=createGame(2,1104);original.tool=true;beginChase(original);
  original.entity.stunned=.1;original.cooldown=4;
  const resumed=restoreGame(serializeGame(original));
  assert.ok(resumed.chasing);assert.equal(resumed.tool,true);assert.equal(resumed.cooldown,4);
  assert.deepEqual(resumed.map,original.map);assert.deepEqual(resumed.hole,original.hole);
  assert.ok(resumed.entity.stunned>=3);
  const before={...resumed.entity};advance(resumed,1);
  assert.equal(resumed.entity.x,before.x);assert.equal(resumed.entity.z,before.z);
});

test('finale saves retain door progression and reproduce later generated rooms exactly',()=>{
  const original=createGame(3,633);original.tool=true;advance(original,7);
  for(let i=0;i<3;i++)door(original,original.doors[0].id);
  const resumed=restoreGame(serializeGame(original),{safe:false});
  assert.ok(resumed);assert.equal(resumed.choices,3);
  assert.equal(resumed.ghostDoor,original.ghostDoor);
  assert.deepEqual(resumed.map,original.map);
  while(original.phase==='doors'){
    const chosen=original.doors.at(-1).id;
    door(original,chosen);door(resumed,chosen);
    assert.equal(resumed.phase,original.phase);assert.equal(resumed.choices,original.choices);
    assert.deepEqual(resumed.map,original.map);assert.deepEqual(resumed.doors,original.doors);
    assert.equal(resumed.random.getState(),original.random.getState());
  }
  assert.equal(resumed.phase,'ghost');assert.equal(resumed.tool,true);
});

test('safe ghost restore restarts only the encounter and can still be completed by facing it',()=>{
  const original=createGame(3,912);original.tool=true;original.choices=original.ghostDoor;finalHall(original);
  original.player.yaw=Math.PI;advance(original,2);
  original.cooldown=6;original.stunCount=3;
  assert.ok(original.stare>1.9);
  const snapshot=serializeGame(original),exact=restoreGame(snapshot,{safe:false}),resumed=restoreGame(snapshot);
  assert.equal(exact.stare,original.stare);assert.equal(exact.player.yaw,Math.PI);
  assert.equal(resumed.level,3);assert.equal(resumed.phase,'ghost');assert.equal(resumed.choices,original.choices);
  assert.equal(resumed.stare,0);assert.equal(resumed.cooldown,0);assert.equal(resumed.stunCount,0);
  assert.equal(resumed.tool,true);assert.equal(resumed.player.yaw,0);assert.equal(resumed.phaseTime,0);
  assert.ok(distance(resumed.player,resumed.entity)>10);
  resumed.player.yaw=Math.PI;advance(resumed,4.7);assert.equal(resumed.status,'won');
});

test('dead, completed, transitioning, or blacked-out states cannot overwrite a useful checkpoint',()=>{
  for(const status of ['lost','won','next']){
    const s=createGame(1,104);s.status=status;assert.equal(serializeGame(s),null);
  }
  const transition=createGame(4,104);transition.transition={kind:'level',level:5,time:.2,duration:1};
  assert.equal(serializeGame(transition),null);
  const blackout=createGame(3,104);advance(blackout,5);assert.equal(blackout.phase,'blackout');
  assert.equal(serializeGame(blackout),null);
});

test('legacy floor-only storage is left for app migration and unsupported snapshot schemas are refused',()=>{
  assert.equal(restoreGame({floor:3,tool:true}),null);
  assert.equal(restoreGame(null),null);
  const old=serializeGame(createGame(3,104));old.schema=0;assert.equal(restoreGame(old),null);
  old.schema=2;assert.equal(restoreGame(old),null);
});

test('corrupt snapshots cannot restore unusable worlds or invalid progression',()=>{
  const cases=[
    ['invalid floor',1,s=>{s.level=7;}],
    ['invalid seed',1,s=>{s.seed=-1;}],
    ['invalid RNG',1,s=>{s.randomState=1.25;}],
    ['player in wall',1,s=>{s.data.player.x=0;s.data.player.z=0;}],
    ['nonfinite camera',1,s=>{s.data.player.yaw=Infinity;}],
    ['nonrectangular map',1,s=>{s.data.map[0]=[1,1];}],
    ['invalid phase',4,s=>{s.data.phase='ghost';}],
    ['fractional pattern',1,s=>{s.data.pattern=.5;}],
    ['fractional doors',3,s=>{s.data.choices=2.5;}],
    ['fractional ghost threshold',3,s=>{s.data.ghostDoor=7.5;}],
    ['fractional valve progress',4,s=>{s.data.puzzle.progress=1.5;}],
    ['fractional breaker progress',5,s=>{s.data.puzzle.breakers=1.5;}],
    ['fractional inspection progress',6,s=>{s.data.puzzle.cleared=1.5;}],
    ['invalid gate cell',4,s=>{s.data.gate=[{x:999,z:999}];}],
    ['refuge in void',5,s=>{s.data.checkpoint.x=-100;s.data.checkpoint.z=-100;}],
    ['missing listening bounds',5,s=>{s.data.quietHall={};}],
    ['missing inspection width',6,s=>{delete s.data.inspections[0].width;}],
    ['negative inspection depth',6,s=>{s.data.inspections[0].depth=-2;}],
    ['dangerous property',1,s=>{s.data.player.constructor={prototype:{bad:true}};}],
  ];
  const accepted=[];
  for(const [name,level,mutate]of cases){
    const save=copy(serializeGame(createGame(level,104)));mutate(save);
    if(restoreGame(save)!==null)accepted.push(name);
  }
  assert.deepEqual(accepted,[],'Invalid saves accepted by the reader');
});

test('unknown saved fields cannot inject live status, transitions, random functions, or inherited properties',()=>{
  const save=serializeGame(createGame(1,104));
  save.data.status='lost';save.data.transition={kind:'level',level:3,time:0,duration:0};
  save.data.unknown={html:'ignored'};
  const resumed=restoreGame(save);
  assert.ok(resumed);assert.equal(resumed.status,'playing');assert.equal(resumed.transition,null);
  assert.equal(resumed.unknown,undefined);assert.equal(typeof resumed.random,'function');
  assert.ok(openAt(resumed.map,resumed.player.x,resumed.player.z));
});
