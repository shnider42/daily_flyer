import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { SHIP_CLASSES, getShipClass } from '../dist/fleet.mjs';
import { portProfile, canHullUsePort } from '../dist/port-traffic.mjs';
import { createSystemTraffic, advanceTraffic, captureTraffic, restoreTraffic, catchUpTraffic } from '../dist/traffic.mjs';
import { WorldPresentation } from '../dist/world-presentation.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const system = {id:'working-lanes', faction:'freewake', danger:1, gx:0, gy:0};
const bodies = [
  {id:'hub',name:'City Port',kind:'station',portType:'hub',x:0,y:0,radius:90},
  {id:'small',name:'Small Dock',kind:'station',portType:'outpost',x:1100,y:650,radius:70},
  {id:'yard',name:'Fleet Yard',kind:'station',portType:'military',x:-800,y:750,radius:85},
  {id:'works',name:'Ore Exchange',kind:'station',portType:'industrial',x:600,y:-1100,radius:80}
];
const make = (seed='working-lanes') => createSystemTraffic({seed,system,bodies,count:22});
const poses = traffic => traffic.map(({id,x,y,vx,vy,angle,angularVelocity,trafficStatus,destinationId}) => ({id,x,y,vx,vy,angle,angularVelocity,trafficStatus,destinationId}));

test('every obtainable hull can be seen in scheduled traffic without unlocking its purchase', () => {
  const seen = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const traffic = make(`all-hulls-${seed}`);
    assert.equal(traffic.length,22);
    for (const ship of traffic) seen.add(ship.classId);
  }
  assert.deepEqual([...seen].sort(),SHIP_CLASSES.map(ship=>ship.id).sort());
  assert.equal(new Game('working-lanes').state.fleet.owned.length,1,'sightings do not add hulls to the player fleet');
});

test('large scheduled ships never receive a small docking field as either endpoint', () => {
  let large = 0, small = 0;
  for (let seed = 0; seed < 45; seed++) for (const ship of make(`port-capacity-${seed}`)) {
    if (ship.renderLength > 90) large++;
    for (const endpoint of [ship.originId,ship.destinationId]) {
      if (endpoint.startsWith('lane:')) continue;
      const body = bodies.find(body=>body.id===endpoint);
      assert.ok(body,`real endpoint exists: ${endpoint}`);
      assert.ok(canHullUsePort(ship.classId,portProfile(system,body)),`${ship.classId} fits ${endpoint}`);
      if (endpoint==='small') small++;
    }
    const home = bodies.find(body=>body.id===ship.homePortId);
    assert.equal(ship.faction,portProfile(system,home).faction);
  }
  assert.ok(large>100); assert.ok(small>20,'small ports still get their own smaller service craft');
});

test('unserviced worlds, quarantine and black holes do not become commuter destinations', () => {
  const quiet = [{id:'earth',name:'Earth',kind:'planet',biome:'earth',x:0,y:0},
    {id:'rock',kind:'moon',biome:'barren',x:1000,y:500},
    {id:'hole',kind:'blackhole',landable:false,x:1300,y:-1200},
    {id:'village',kind:'planet',portServices:false,x:-700,y:700}];
  assert.deepEqual(createSystemTraffic({seed:'quiet',system,bodies:quiet,count:22}),[]);
});

test('generated schedules are deterministic, bounded, and exclude lane geometry from snapshots', () => {
  const a=make('deterministic'), b=make('deterministic');
  assert.deepEqual(clone(a),clone(b));
  assert.deepEqual(captureTraffic(a),captureTraffic(b));
  assert.equal(JSON.stringify(a).includes('_traffic'),false);
  assert.equal(JSON.stringify(a).includes('bend'),false);
  assert.ok(JSON.stringify(captureTraffic(a)).length<2200);
  assert.equal(createSystemTraffic({seed:'ceiling',system,bodies,count:100000}).length,32);
});

test('traffic eases through arrivals and departures with finite continuous heading and true stopped poses', () => {
  const traffic=make('flight-continuity'), observed=new Set();
  let previous=poses(traffic);
  for(let tick=0;tick<4000;tick++){
    advanceTraffic(traffic,.1);
    for(let i=0;i<traffic.length;i++){
      const ship=traffic[i], before=previous[i], hull=getShipClass(ship.classId);
      for(const key of ['x','y','vx','vy','angle','angularVelocity','speed'])assert.ok(Number.isFinite(ship[key]),`${ship.id}:${key}`);
      assert.ok(Math.abs(ship.x)<2601&&Math.abs(ship.y)<2601);
      assert.ok(Math.hypot(ship.x-before.x,ship.y-before.y)<18,'no endpoint teleport');
      assert.ok(Math.abs(Math.atan2(Math.sin(ship.angle-before.angle),Math.cos(ship.angle-before.angle)))<.08,'no instant direction snap');
      assert.ok(Math.abs(ship.angularVelocity)<hull.stats.maxAngularVelocity,'large hull turns stay below its normal turning limit');
      close(ship.speed,Math.hypot(ship.vx,ship.vy));
      if(['At berth','Lane clearance'].includes(ship.trafficStatus)){
        close(ship.vx,0);close(ship.vy,0);close(ship.speed,0);observed.add('stopped');
      }else observed.add(ship.trafficStatus);
      for(const body of bodies)assert.ok(Math.hypot(ship.x-body.x,ship.y-body.y)>body.radius+hull.stats.radius+8,'scheduled traffic clears physical hull and port outlines');
    }
    previous=poses(traffic);
  }
  assert.deepEqual([...observed].sort(),['Departing','In transit','On approach','stopped']);
});

test('lane evaluation is independent of tick subdivision and catchup does not replay full simulations', () => {
  const one=make('timesteps'), many=make('timesteps');
  advanceTraffic(one,60);
  for(let tick=0;tick<1800;tick++)advanceTraffic(many,1/30);
  for(let i=0;i<one.length;i++)for(const key of ['x','y','vx','vy','angle'])close(one[i][key],many[i][key],1e-6);
  const resumed=make('timesteps'), expected=make('timesteps');
  restoreTraffic(resumed,captureTraffic(one));restoreTraffic(expected,captureTraffic(one));
  catchUpTraffic(resumed,24*60*60);advanceTraffic(expected,15);
  assert.deepEqual(poses(resumed),poses(expected));
});

test('routes clear intervening small stations and the gravity wells in remote observatory systems', () => {
  const game=new Game('full-lanes-audit');
  for(const systemId of ['sector-172','umbra','lacuna']){
    game.state.systemId=systemId;game._loadSystem(systemId);
    const scheduled=game.system.traffic.filter(ship=>ship.trafficRole);
    assert.ok(scheduled.length>0);
    for(let tick=0;tick<240;tick++){
      advanceTraffic(scheduled,1);
      for(const ship of scheduled)for(const body of game.system.bodies){
        const exclusion=body.kind==='blackhole'?body.gravityRadius:body.radius;
        assert.ok(Math.hypot(ship.x-body.x,ship.y-body.y)>exclusion+ship.radius+3,`${ship.id} clears ${body.id}`);
      }
    }
  }
});

test('busy city and fleet ports reserve separated berths with enough room for ships to turn', () => {
  const scenarios=[];
  for(const seed of ['farwake','harbor-rush'])for(const systemId of ['hearth','nacre']){
    const game=new Game(seed);game.state.systemId=systemId;game._loadSystem(systemId);
    scenarios.push(game.system.traffic.filter(ship=>ship.trafficRole));
  }
  scenarios.push(createSystemTraffic({seed:'fleet-berths',system,bodies:[{id:'yard',name:'Fleet Yard',kind:'station',portType:'military',x:0,y:0,radius:85}],count:22}));
  let checks=0;
  for(const traffic of scenarios){
    assert.ok(traffic.length>=16,'berth allocation retains the busy-port traffic budget');
    const initial=captureTraffic(traffic);
    for(let tick=0;tick<800;tick++){
      advanceTraffic(traffic,.5);
      const docked=traffic.filter(ship=>ship.trafficStatus==='At berth');
      for(let a=0;a<docked.length;a++)for(let b=0;b<a;b++){
        const left=docked[a],right=docked[b];
        const turningFootprint=ship=>Math.hypot(ship.renderLength,ship.renderWidth)*.5;
        assert.ok(Math.hypot(left.x-right.x,left.y-right.y)>=turningFootprint(left)+turningFootprint(right)+15,`${left.id} has a separate berth from ${right.id}`);
        checks++;
      }
    }
    restoreTraffic(traffic,initial);
    assert.deepEqual(captureTraffic(traffic),initial,'berth reservations add no extra mutable runtime state');
  }
  assert.ok(checks>1000,'many simultaneous docked pairs were checked over several schedules');
});

test('solo saves and leave-return transitions preserve traffic phase without copying its routes', () => {
  const game=new Game('traffic-save');advanceTraffic(game.system.traffic,47.123);
  const expected=poses(game.system.traffic), saved=game.save(), restored=Game.fromSave(saved);
  assert.deepEqual(poses(restored.system.traffic),expected);
  assert.ok(restored._record().trafficStates.length===22);
  game._persistRuntime();game.state.systemId='brindle';game._loadSystem('brindle');
  game._persistRuntime();game.state.systemId='hearth';game._loadSystem('hearth');
  assert.deepEqual(poses(game.system.traffic),expected);
});

test('old straight-line saves and corrupt phases cannot move a ship onto an unrelated route', () => {
  const traffic=make('old-save'), expected=poses(traffic), state=captureTraffic(traffic);
  restoreTraffic(traffic,traffic.map(ship=>({id:ship.id,x:999999,y:-999999,angle:100,routeTime:22})));
  assert.deepEqual(poses(traffic),expected);
  restoreTraffic(traffic,state.map(row=>({...row,routeTime:NaN})));
  assert.deepEqual(poses(traffic),expected);
  restoreTraffic(traffic,state.map(row=>({...row,routeKey:'unrelated',routeTime:800})));
  assert.deepEqual(poses(traffic),expected);
});

test('physical distress contacts keep their source position and ordinary traffic never creates incidents', () => {
  const traffic=make('no-new-events');
  const contact={id:'lifeboat',contact:true,encounterId:'lifeboat',x:500,y:180,angle:.4,speed:0};
  traffic.push(contact);const before=clone(contact);
  advanceTraffic(traffic,1000);catchUpTraffic(traffic,300);restoreTraffic(traffic,[{id:contact.id,x:0,y:0}]);
  assert.deepEqual(contact,before);
  assert.equal(captureTraffic(traffic).some(row=>row.id===contact.id),false);
  assert.equal(traffic.filter(ship=>ship!==contact).some(ship=>ship.encounterId||ship.hostile),false);
});

test('civilian ferries and dispatch runners cannot inherit a military patrol transmission', () => {
  const game=new Game('patrol-source-audit');let civilians=0,patrols=0;
  for(const system of game.galaxy){
    game.state.systemId=system.id;game._loadSystem(system.id);
    for(const contact of game.system.traffic){
      if(contact.encounterId==='patrol'){
        patrols++;
        assert.equal(contact.faction,'concord');
        assert.ok(['patrol','escort','carrier'].includes(contact.trafficRole),`${contact.id} is a working military hull`);
        assert.notEqual(game.system.context.region,'core');
      }
      if(['passenger','courier'].includes(contact.trafficRole)){civilians++;assert.notEqual(contact.encounterId,'patrol');}
    }
  }
  assert.ok(civilians>100);
  assert.ok(patrols>0,'a rare actual patrol still offers assistance');
});

test('shared presentation interpolates real lane velocities and stops extrapolating at a berth', () => {
  const traffic=make('snapshot-motion'), presentation=new WorldPresentation({delayMs:100});
  const packet=time=>({simulatedAt:time,room:{id:'working'},state:{systemId:system.id},world:{id:system.id,traffic:clone(traffic),enemies:[],bullets:[]}});
  presentation.push(packet(1000));const previous=poses(traffic);
  advanceTraffic(traffic,.1);presentation.push(packet(1100));
  const view=presentation.sample(1150).world.traffic;
  for(let i=0;i<traffic.length;i++){close(view[i].x,(previous[i].x+traffic[i].x)/2);close(view[i].y,(previous[i].y+traffic[i].y)/2);}
  let stopped;
  for(let tick=0;tick<200&&!stopped;tick++){advanceTraffic(traffic,.5);stopped=traffic.find(ship=>ship.trafficStatus==='At berth');}
  assert.ok(stopped);presentation.reset();presentation.push(packet(2000));
  const future=presentation.sample(2200).world.traffic.find(ship=>ship.id===stopped.id);
  close(future.x,stopped.x);close(future.y,stopped.y);
});
