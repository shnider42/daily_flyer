import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { getShipClass } from '../dist/fleet.mjs';
import { getHullSystems } from '../dist/hull-systems.mjs';
import { advanceTraffic, captureTraffic, restoreTraffic, catchUpTraffic } from '../dist/traffic.mjs';
import { portProfile, trafficHullWeights, canHullUsePort, PORT_KINDS } from '../dist/port-traffic.mjs';
import { PEACEKEEPER_ID, PEACEKEEPER_HAIL_DISTANCE, isPeacekeeper, trafficHailDistance, createPeacekeeper, stepPeacekeeperDefense } from '../dist/peacekeeper.mjs';
import { musicContext, classifyMusicEvent } from '../dist/music-context.mjs';

const keeperOf = game => game.system.traffic.find(isPeacekeeper);
const pose = ship => Object.fromEntries(['id','x','y','vx','vy','angle','angularVelocity'].map(key=>[key,ship[key]]));
const nearBow = (game, extra=140) => {
  const keeper=keeperOf(game), reach=keeper.renderLength/2+game.state.ship.radius+extra;
  Object.assign(game.state.ship,{x:keeper.x+Math.cos(keeper.angle)*reach,y:keeper.y+Math.sin(keeper.angle)*reach,vx:0,vy:0});
  return keeper;
};

test('every authored starting system has exactly one named destroyer and no random second destroyer',()=>{
  for(let seed=0;seed<60;seed++){
    const game=new Game(`single-watch-${seed}`), keepers=game.system.traffic.filter(isPeacekeeper);
    assert.equal(keepers.length,1);
    assert.equal(keepers[0].name,'FWS Resolute');
    assert.equal(keepers[0].classId,'judicator');
    assert.equal(keepers[0].boardable,false);
    assert.equal(game.system.traffic.filter(ship=>ship.classId==='judicator').length,1);
    assert.equal(game.system.traffic.length,game.system.context.trafficCount,'the watch replaces one traffic slot');
    const profile=portProfile(game.currentSystem,game.system.bodies.find(body=>body.id==='kettle'));
    assert.equal(trafficHullWeights(profile).some(row=>row.classId==='judicator'),false);
    assert.equal(game.state.fleet.owned.includes('judicator'),false);
  }
  const game=new Game('one-home-only');
  for(const id of ['brindle','nacre','vesper','sable','sector-40']){
    game.state.systemId=id;game._loadSystem(id);
    assert.equal(game.system.traffic.filter(isPeacekeeper).length,0);
  }
});

test('Resolute has a slow continuous patrol which clears the full capital hull and civilian berths',()=>{
  const game=new Game('patrol-clearance'),keeper=keeperOf(game),hull=getShipClass('judicator');
  const footprint=Math.hypot(hull.stats.renderLength,hull.stats.renderWidth)/2;
  let previous=pose(keeper);
  for(let tick=0;tick<Math.ceil(keeper._peacekeeperPatrol.period*4)+10;tick++){
    advanceTraffic(game.system.traffic,.5);
    for(const key of ['x','y','vx','vy','angle','angularVelocity','speed'])assert.ok(Number.isFinite(keeper[key]));
    assert.ok(Math.hypot(keeper.x-previous.x,keeper.y-previous.y)<6,'no teleport at the loop join');
    assert.ok(keeper.speed>0&&keeper.speed<12,'a monumental ship drifts, rather than chasing fighters');
    assert.ok(Math.abs(keeper.angularVelocity)<hull.stats.maxAngularVelocity);
    for(const body of game.system.bodies)assert.ok(Math.hypot(keeper.x-body.x,keeper.y-body.y)>body.radius+footprint+30,`${body.id} remains clear`);
    previous=pose(keeper);
  }
  assert.equal(keeper.trafficStatus,'Keeping the harbor watch');
  assert.equal(JSON.stringify(keeper).includes('_peacekeeperPatrol'),false);
  const scenery=[...game.system.bodies,{id:'new-scenery',x:keeper._peacekeeperPatrol.x,y:keeper._peacekeeperPatrol.y,radius:450}];
  const shifted=createPeacekeeper({seed:'patrol-clearance',system:{...game.currentSystem,spatialScale:game.system.spatialScale,radius:game.system.radius},bodies:scenery});
  assert.ok(shifted,'new scenery closes one loop but does not remove the unique watch');
  assert.notDeepEqual(shifted._peacekeeperPatrol,keeper._peacekeeperPatrol);
});

test('solo saves, legacy records, leave-return and bounded catchup retain one watch and its phase',()=>{
  const game=new Game('watch-save');advanceTraffic(game.system.traffic,83.25);
  const expected=pose(keeperOf(game)),saved=game.save(),restored=Game.fromSave(saved);
  assert.deepEqual(pose(keeperOf(restored)),expected);
  assert.equal(restored.system.traffic.filter(isPeacekeeper).length,1);
  game._persistRuntime();game.state.systemId='brindle';game._loadSystem('brindle');
  game._persistRuntime();game.state.systemId='hearth';game._loadSystem('hearth');
  assert.deepEqual(pose(keeperOf(game)),expected);
  const legacy=structuredClone(saved);legacy.worlds.hearth.trafficStates=legacy.worlds.hearth.trafficStates.filter(row=>row.id!==PEACEKEEPER_ID);
  assert.equal(Game.fromSave(legacy).system.traffic.filter(isPeacekeeper).length,1);
  const traffic=restored.system.traffic,phases=captureTraffic(traffic),keeper=keeperOf(restored);
  catchUpTraffic(traffic,86400);const caughtUp=pose(keeper);
  restoreTraffic(traffic,phases);advanceTraffic(traffic,15);assert.deepEqual(pose(keeper),caughtUp);
  const before=pose(keeper);
  restoreTraffic(traffic,[{id:keeper.id,routeKey:'wrong',routeTime:Infinity,x:99999}]);
  assert.deepEqual(pose(keeper),before,'a malformed old pose cannot teleport the navy into a port');
});

test('hail range follows a giant visible bow, and an out-of-range radio request is rejected',()=>{
  const game=new Game('radio-distance'),keeper=nearBow(game,PEACEKEEPER_HAIL_DISTANCE-1);
  assert.ok(Math.hypot(game.state.ship.x-keeper.x,game.state.ship.y-keeper.y)>400);
  assert.ok(trafficHailDistance(keeper,game.state.ship)<PEACEKEEPER_HAIL_DISTANCE);
  assert.equal(game.hailTraffic(keeper.id).ok,true);
  nearBow(game,PEACEKEEPER_HAIL_DISTANCE+1);
  assert.equal(game.hailTraffic(keeper.id).code,'distance');
  assert.equal(game.hailTraffic('invented-ship').code,'target');
  game.state.mode='person';game.state.interior=null;
  assert.equal(game.hailTraffic(keeper.id).code,'mode');
});

test('the restricted radio checks actual faction service and standing, and never grants cargo or access',()=>{
  const game=new Game('radio-clearance'),keeper=nearBow(game),career=game.state.professions.careers.military;
  const before=JSON.stringify(game.state),reply=game.hailTraffic(keeper.id);
  assert.equal(reply.ok,true);assert.equal(reply.clearance,false);assert.equal(reply.restricted,true);
  assert.match(reply.message,/Alter course/);assert.match(reply.message,/No boarding or docking/);
  assert.equal(JSON.stringify(game.state),before,'a refusal grants nothing and changes no progress');
  game.state.rep.freewake=100;career.enlisted=true;career.factionId='concord';
  assert.equal(game.hailTraffic(keeper.id).clearance,false,'high reputation and another uniform are not fleet clearance');
  career.factionId='freewake';game.state.rep.freewake=0;
  const allowed=game.hailTraffic(keeper.id);assert.equal(allowed.clearance,true);assert.match(allowed.message,/Service identity confirmed/);assert.match(allowed.message,/Docking is not authorized/);
  game.state.rep.freewake=-25;
  assert.equal(game.hailTraffic(keeper.id).clearance,false);assert.match(game.hailTraffic(keeper.id).message,/suspended/);
  assert.equal(game.startBoarding(keeper.id).ok,false,'radio permission is not an enemy boarding target');
});

test('the watch cannot be used as a generic encounter source or trigger horror music merely by hailing',()=>{
  const game=new Game('radio-context'),keeper=nearBow(game);game.drainEvents();
  game.hailTraffic(keeper.id);
  assert.equal(game.triggerEncounter(undefined,{sourceType:'traffic',sourceId:keeper.id}).code,'restricted-channel');
  assert.equal(game.triggerEncounter('patrol',{sourceType:'traffic',vesselId:keeper.id}).code,'restricted-channel');
  assert.equal(game.state.pendingEncounter,null);assert.deepEqual(game.drainEvents(),[]);
  const context=musicContext({game,playing:true,dialogOpen:true,dialogKind:'hail'});
  assert.equal(context.terror,false);assert.equal(context.combat,false);assert.equal(context.tension,false);
  assert.equal(classifyMusicEvent({type:'peacekeeper-defense',targetId:game.playerId,vesselId:keeper.id},context),null);
});

function threatenedWatch(){
  const game=new Game('local-defence'),keeper=keeperOf(game);
  Object.assign(game.state.ship,{x:keeper.x+300,y:keeper.y,vx:0,vy:0});
  const target=game.state.ship,enemy={id:'real-attacker',classId:'sparrow',x:target.x+150,y:target.y,hp:100,maxHp:100,active:true};
  const shot={id:'incoming',owner:enemy.id,ownerId:enemy.id,vesselId:enemy.id,team:'hostile',targetId:game.playerId,x:target.x+60,y:target.y,vx:-120,vy:0,ttl:1,damage:14,radius:4};
  game.system.enemies=[enemy];game.system.bullets=[shot];
  return{game,keeper,enemy,shot};
}

test('point defence removes only imminent local hostile shots, with a bounded rate and no kill rewards',()=>{
  const {game,keeper,enemy,shot}=threatenedWatch(),health=game.state.ship.hull,credits=game.state.credits;
  stepPeacekeeperDefense(game.system,.1,[game]);
  assert.equal(shot.ttl,0);assert.equal(enemy.hp,100);assert.equal(game.state.stats.kills,0);
  const tracer=game.system.bullets.find(bullet=>bullet.cosmetic);assert.ok(tracer);assert.equal(tracer.damage,0);
  const second={...shot,id:'second',ttl:1};game.system.bullets.push(second);
  stepPeacekeeperDefense(game.system,.1,[game]);assert.equal(second.ttl,1,'the watch cannot clear an unbounded volley in one tick');
  // Even a malformed visual tracer cannot damage a ship or steal an enemy.
  Object.assign(tracer,{x:game.state.ship.x,y:game.state.ship.y,vx:0,vy:0,ttl:.1,damage:999});
  game._updateBullets(.1,[game]);
  assert.equal(game.state.ship.hull,health);assert.equal(game.state.credits,credits);
  assert.equal(game.state.stats.kills,0);assert.equal(game.system.pickups.length,0);
  assert.ok(keeper._defenseCooldown>0);
});

test('distant attacks, player fire, fake hostile shots and already-disabled ships are outside the watch action',()=>{
  for(const kind of ['distant','player','fake','disabled','not-approaching']){
    const {game,enemy,shot}=threatenedWatch();
    if(kind==='distant')game.state.ship.x+=2500;
    if(kind==='player')shot.team='player';
    if(kind==='fake')shot.ownerId='not-a-real-enemy';
    if(kind==='disabled')enemy.disabled=true;
    if(kind==='not-approaching')shot.vx=120;
    stepPeacekeeperDefense(game.system,.1,[game]);
    assert.equal(shot.ttl,1,kind);assert.equal(game.system.bullets.length,1,kind);
  }
});

test('new capital traffic has deliberate large berths and cannot overflow small airstrip-style ports',()=>{
  const profile=kind=>({id:kind,kind,...PORT_KINDS[kind]});
  for(const id of ['lark','puffin','osprey','leviathan','judicator']){
    assert.ok(Object.keys(PORT_KINDS).some(kind=>trafficHullWeights(profile(kind)).some(row=>row.classId===id)),`${id} has a traffic home`);
  }
  assert.equal(canHullUsePort('judicator',profile('military')),true);
  assert.equal(canHullUsePort('leviathan',profile('industrial')),true);
  assert.equal(canHullUsePort('judicator',profile('industrial')),false);
  for(const kind of ['outpost','regional','research'])for(const id of ['leviathan','judicator'])assert.equal(canHullUsePort(id,profile(kind)),false);
});

test('four destroyer batteries fire from the actual hull mounts while preserving volley energy and damage',()=>{
  const game=new Game('capital-batteries');game._activateClass('judicator',true);game.system.enemies=[];
  Object.assign(game.state.ship,{x:100,y:50,angle:0,vx:0,vy:0});
  const system=getHullSystems('judicator'),before=game.state.ship.energy;
  assert.equal(game.fireWeapons().ok,true);assert.equal(game.system.bullets.length,4);
  for(const [index,bullet] of game.system.bullets.entries()){
    assert.equal(bullet.x,100+system.pulseMuzzles[index][0]);assert.equal(bullet.y,50+system.pulseMuzzles[index][1]);
    assert.equal(bullet.damage,game.state.ship.damage*system.pulseDamageScale);
  }
  assert.equal(game.state.ship.energy,before-system.pulseEnergy);
});
