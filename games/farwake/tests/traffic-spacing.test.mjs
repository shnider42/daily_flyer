import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemTraffic, advanceTraffic, captureTraffic, restoreTraffic, catchUpTraffic } from '../dist/traffic.mjs';
import { createPeacekeeper, isPeacekeeper, PEACEKEEPER_HAIL_DISTANCE, trafficHailDistance } from '../dist/peacekeeper.mjs';
import { portProfile } from '../dist/port-traffic.mjs';
import { SYSTEM_SPACE_SCALE, WORLD_RADIUS, LEGACY_WORLD_RADIUS, systemBodyPosition } from '../dist/system-space.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);
const catalog = {id:'spread-lanes',faction:'freewake',danger:1,gx:0,gy:0,bodies:[
  {id:'hub',name:'City Port',kind:'station',portType:'hub',x:0,y:0,radius:90},
  {id:'small',name:'Small Dock',kind:'station',portType:'outpost',x:1100,y:650,radius:70},
  {id:'yard',name:'Fleet Yard',kind:'station',portType:'military',x:-800,y:750,radius:85},
  {id:'works',name:'Ore Exchange',kind:'station',portType:'industrial',x:600,y:-1100,radius:80}
]};
const bodiesFor = (data,scale) => data.bodies.map((body,index)=>({...body,...systemBodyPosition(body,index,data.id,scale)}));
const make = (scale=SYSTEM_SPACE_SCALE,data=catalog,seed='spacing') => createSystemTraffic({seed,system:{...data,spatialScale:scale,radius:LEGACY_WORLD_RADIUS*scale},bodies:bodiesFor(data,scale),count:22});
const poses = traffic => traffic.map(({id,x,y,vx,vy,angle,trafficStatus,originId,destinationId})=>({id,x,y,vx,vy,angle,trafficStatus,originId,destinationId}));

test('spreading a system keeps its port purposes, traffic identities, hull sizes and physical berth clearances',()=>{
  const old=make(1),traffic=make(),oldBodies=bodiesFor(catalog,1),newBodies=bodiesFor(catalog,SYSTEM_SPACE_SCALE);
  assert.equal(traffic.length,old.length);assert.equal(traffic.length,22);
  assert.equal(WORLD_RADIUS,8100);
  for(let index=0;index<newBodies.length;index++)assert.deepEqual(portProfile(catalog,newBodies[index]),portProfile(catalog,oldBodies[index]));
  for(const contact of traffic){
    const previous=old.find(ship=>ship.id===contact.id),lane=contact._trafficLane,oldLane=previous._trafficLane;
    for(const key of ['id','name','classId','faction','trafficRole','homePortId','radius','renderLength','renderWidth'])assert.equal(contact[key],previous[key],key);
    assert.equal(lane.origin.id,oldLane.origin.id);assert.equal(lane.destination.id,oldLane.destination.id);
    const home=newBodies.find(body=>body.id===lane.origin.id),oldHome=oldBodies.find(body=>body.id===oldLane.origin.id);
    close(Math.hypot(lane.a.x-home.x,lane.a.y-home.y),Math.hypot(oldLane.a.x-oldHome.x,oldLane.a.y-oldHome.y));
    assert.equal(lane.a.footprint,oldLane.a.footprint,'ships do not receive three-times-larger berths');
    close(lane.dwellA,oldLane.dwellA);close(lane.dwellB,oldLane.dwellB);
    assert.ok(lane.travel>oldLane.travel*2,'longer journeys take longer at the existing cruise speed');
    if(lane.destination.id.startsWith('lane:'))close(Math.hypot(lane.b.x,lane.b.y),7050);
  }
  assert.equal(JSON.stringify(traffic).includes('_legacyTrafficContact'),false);
  assert.equal(JSON.stringify(traffic).includes('_trafficRadius'),false);
  assert.ok(JSON.stringify(captureTraffic(traffic)).length<2200,'migration adds no geometry to persisted traffic phases');
});

test('large-system routes remain inside the expanded bounds and clear the same physical hazards',()=>{
  const traffic=make(),bodies=bodiesFor(catalog,SYSTEM_SPACE_SCALE);
  let beyondOldBoundary=false;
  for(let tick=0;tick<600;tick++){
    advanceTraffic(traffic,1);
    for(const ship of traffic){
      assert.ok(Math.abs(ship.x)<7801&&Math.abs(ship.y)<7801);
      beyondOldBoundary ||= Math.abs(ship.x)>2700||Math.abs(ship.y)>2700;
      assert.ok(ship.speed<130,'a larger route cannot multiply cruise speed');
      for(const body of bodies)assert.ok(Math.hypot(ship.x-body.x,ship.y-body.y)>body.radius+ship.radius+8,`${ship.id} clears ${body.id}`);
    }
  }
  assert.ok(beyondOldBoundary,'traffic uses the enlarged system');
});

test('old saved traffic preserves its outbound, loading, inbound and home-berth phase on the rebuilt route',()=>{
  const old=make(1),traffic=make();
  const previous=old.find(ship=>ship._trafficLane.destination.id==='works'),contact=traffic.find(ship=>ship.id===previous.id);
  const oldLane=previous._trafficLane,lane=contact._trafficLane;
  const cases=[
    {old:oldLane.travel*.37,next:lane.travel*.37,status:'In transit',from:lane.origin.id,to:lane.destination.id},
    {old:oldLane.travel+oldLane.dwellB*.65,next:lane.travel+lane.dwellB*.65,status:'At berth',from:lane.origin.id,to:lane.destination.id},
    {old:oldLane.travel+oldLane.dwellB+oldLane.travel*.43,next:lane.travel+lane.dwellB+lane.travel*.43,status:'In transit',from:lane.destination.id,to:lane.origin.id},
    {old:oldLane.travel*2+oldLane.dwellB+oldLane.dwellA*.29,next:lane.travel*2+lane.dwellB+lane.dwellA*.29,status:'At berth',from:lane.destination.id,to:lane.origin.id}
  ];
  for(const phase of cases){
    restoreTraffic(old,[{id:previous.id,routeKey:oldLane.key,routeTime:phase.old}]);
    restoreTraffic(traffic,[{id:previous.id,routeKey:oldLane.key,routeTime:phase.old+oldLane.period*3,x:previous.x,y:previous.y}]);
    close(contact._trafficTime,phase.next);
    assert.equal(contact.trafficStatus,phase.status);assert.equal(contact.originId,phase.from);assert.equal(contact.destinationId,phase.to);
    if(phase.status==='At berth'){
      close(contact.speed,0);const point=phase.to===lane.origin.id?lane.a:lane.b;
      close(contact.x,point.x);close(contact.y,point.y);
    }
    assert.ok(Math.hypot(contact.x-previous.x*3,contact.y-previous.y*3)>10,'old ship poses are not stretched into oversized berth clearances');
  }
  const expected=poses(traffic),current=captureTraffic(traffic),resumed=make();
  restoreTraffic(resumed,current);assert.deepEqual(poses(resumed),expected,'new saves restore exactly without a second migration');
  restoreTraffic(resumed,current.map(row=>({...row,routeKey:'another-route'})));assert.deepEqual(poses(resumed),expected);
});

test('legacy route lookup reconstructs catalog coordinates exactly instead of round-tripping scaled floats',()=>{
  const implicit={...catalog,id:'fractional-lanes',bodies:catalog.bodies.map(({x,y,...body})=>body)};
  const oldBodies=bodiesFor(implicit,1),newBodies=bodiesFor(implicit,SYSTEM_SPACE_SCALE);
  assert.notEqual(newBodies[1].x/SYSTEM_SPACE_SCALE,oldBodies[1].x,'the fixture exercises a real floating-point round-trip difference');
  const old=make(1,implicit),traffic=make(SYSTEM_SPACE_SCALE,implicit);
  let checked=0;
  for(const contact of traffic){
    const previous=old.find(ship=>ship.id===contact.id);
    if(!previous)continue;
    assert.equal(contact._legacyTrafficContact()._trafficLane.key,previous._trafficLane.key);
    if(previous._trafficLane.destination.id!==contact._trafficLane.destination.id)continue;
    restoreTraffic(traffic,[{id:contact.id,routeKey:previous._trafficLane.key,routeTime:previous._trafficLane.travel*.37}]);
    close(contact._trafficTime,contact._trafficLane.travel*.37);checked++;
  }
  assert.ok(checked>=16,'many independently routed ships retain valid old phases');
});

test('the unique watch covers the enlarged harbor at its original speed, keeping orbit phase and fixed hail range',()=>{
  const data={id:'hearth',faction:'freewake',danger:1,gx:0,gy:0,bodies:[{id:'kettle',name:'Kettle',kind:'station',x:0,y:0,radius:70}]};
  const old=make(1,data),traffic=make(SYSTEM_SPACE_SCALE,data),previous=old.find(isPeacekeeper),contact=traffic.find(isPeacekeeper);
  assert.equal(traffic.filter(isPeacekeeper).length,1);assert.equal(traffic.length,22);
  assert.equal(traffic.filter(ship=>ship.classId==='judicator').length,1);
  assert.equal(previous._peacekeeperPatrol.period,210);assert.equal(contact._peacekeeperPatrol.period,630);
  for(const key of ['x','y','rx','ry'])close(contact._peacekeeperPatrol[key],previous._peacekeeperPatrol[key]*3);
  const saved={id:previous.id,routeKey:previous._peacekeeperPatrol.key,routeTime:83.25+previous._peacekeeperPatrol.period*2,defenseCooldown:.4};
  restoreTraffic(old,[saved]);restoreTraffic(traffic,[saved]);
  close(contact.x,previous.x*3);close(contact.y,previous.y*3);close(contact.vx,previous.vx);close(contact.vy,previous.vy);
  close(contact.angle,previous.angle);close(contact.angularVelocity*3,previous.angularVelocity);close(contact._defenseCooldown,.4);
  const ship={radius:21,x:contact.x+Math.cos(contact.angle)*(contact.renderLength/2+21+PEACEKEEPER_HAIL_DISTANCE),y:contact.y+Math.sin(contact.angle)*(contact.renderLength/2+21+PEACEKEEPER_HAIL_DISTANCE)};
  close(trafficHailDistance(contact,ship),165);
  const snapshot=captureTraffic(traffic),resumed=make(SYSTEM_SPACE_SCALE,data);
  restoreTraffic(resumed,snapshot);assert.deepEqual(poses(resumed),poses(traffic));
  catchUpTraffic(resumed,86400);advanceTraffic(traffic,15);assert.deepEqual(poses(resumed),poses(traffic));
  const before=poses(resumed);restoreTraffic(resumed,[{...saved,routeKey:'unverified-watch'}]);assert.deepEqual(poses(resumed),before);
  const shifted=createPeacekeeper({seed:'spacing',system:{...data,spatialScale:3,radius:WORLD_RADIUS},bodies:[...bodiesFor(data,3),{id:'obstruction',x:-2130,y:1500,radius:1000}]});
  assert.ok(shifted);assert.notDeepEqual(shifted._peacekeeperPatrol,contact._peacekeeperPatrol,'the fallback search also operates in the expanded frame');
});

test('director support craft reflect at the expanded watch line and can return from outside it',()=>{
  const traffic=make(),watch={id:'watch-event',directorEventId:'watch',x:3000,y:0,angle:0,speed:30};
  traffic.push(watch);advanceTraffic(traffic,1);close(watch.x,3030);close(watch.angle,0);
  Object.assign(watch,{x:7000,y:0,angle:0});advanceTraffic(traffic,1);close(watch.x,7030);close(watch.vx,-30);
  advanceTraffic(traffic,5);close(watch.x,6880);assert.equal(watch.vx,-30,'an inward ship does not bounce every tick outside the line');
  const filtered=[watch];Object.assign(watch,{x:6500,y:0,angle:0});advanceTraffic(filtered,1,{radius:WORLD_RADIUS});close(watch.vx,30);
  catchUpTraffic(filtered,86400,{radius:WORLD_RADIUS});close(watch.x,6980);close(watch.vx,-30);
  assert.equal(watch.speed,30);
});
