import test from 'node:test';import assert from 'node:assert/strict';
import {Game,makeCity,makeCar,collideVehicle,collide,dist,stepCar,applyDamage,visible,BOSTON_JOBS}from'../../daily_flyer/themes/last_exit_assets/engine.js';
import {BOSTON_EDGES,BOSTON_NODES,bostonHeight,bostonSide,bridgePosition}from'../../daily_flyer/themes/last_exit_assets/boston.js';
import {edgeLength,roadFrame,advanceRoute}from'../../daily_flyer/themes/last_exit_assets/navigation.js';
import {igniteVehicle,stepVehicleFire,canObserve}from'../../daily_flyer/themes/last_exit_assets/fire.js';
import {Renderer,Mesh}from'../../daily_flyer/themes/last_exit_assets/render.js';import{drawCar,drawPerson,drawVehicleFire}from'../../daily_flyer/themes/last_exit_assets/models.js';
const ticks=(g,n,input={})=>{for(let i=0;i<n;i++)g.tick(1/60,input);};
const empty=()=>{const g=new Game({buildings:[],palms:[],signals:[]});g.traffic=[];g.parked=[];g.pedestrians=[];g.cops=[];g.officers=[];g.car=makeCar(0,0,0);return g;};
const person=(x,z,a=0)=>({x,z,a,speed:0,walk:0,life:Infinity,y:0});
test('the irregular graph has two connected banks with exactly one bridge cut',()=>{
 const reach=(without)=>{const seen=new Set(['b_bridge']);for(let i=0;i<30;i++)for(const e of BOSTON_EDGES){if(without&&e.bridge)continue;if(seen.has(e.from)||seen.has(e.to)){seen.add(e.from);seen.add(e.to);}}return seen;};
 assert.equal(reach(false).size,Object.keys(BOSTON_NODES).length);assert.equal(reach(true).size,9);assert.ok(!reach(true).has('c_bridge'));assert.equal(BOSTON_EDGES.filter(e=>e.bridge).length,1);assert.ok(BOSTON_EDGES.filter(e=>e.points.some(p=>Math.abs(p.x-e.points[0].x)>4&&Math.abs(p.z-e.points[0].z)>4)).length>20);
});
test('every lane, mission stop, parked car and landmark entrance has real collision clearance',()=>{
 const city=makeCity('boston'),g=new Game(city);for(const edge of city.roads)for(const reverse of[false,true])for(let d=5;d<edgeLength(edge)-5;d+=5){const p=roadFrame(edge,d,reverse),c={...makeCar(p.x,p.z,p.a,'boston'),kind:'pickup'};collideVehicle(c,city.buildings);assert.ok(dist(c,p)<.02,edge.id+' '+d);}
 for(const p of[...BOSTON_JOBS.flatMap(j=>j.targets),...city.features.map(f=>f.entrance),g.car,...g.parked]){const c=makeCar(p.x,p.z,p.a||0,'boston');collideVehicle(c,city.buildings);assert.ok(dist(c,p)<.02,'blocked target');}
});
test('the starter drives across the actual bridge with suspension following its deck',()=>{
 const city=makeCity('boston'),edge=city.roads.find(e=>e.bridge),p=roadFrame(edge,7,false),c=makeCar(p.x,p.z,p.a,'boston');let high=0;
 for(let i=0;i<1200&&bridgePosition(c.x,c.z).u<.98;i++){stepCar(c,{gas:1},1/60,city.buildings);high=Math.max(high,c.y);assert.ok(c.y>1);}
 assert.equal(bostonSide(c),'cambridge');assert.ok(bridgePosition(c.x,c.z).u>=.98);assert.ok(high>9);assert.ok(Math.abs(bridgePosition(c.x,c.z).cross)<9);assert.ok(c.damage<1);
});
test('riverside and bridge rails stop cars and people instead of allowing water shortcuts',()=>{
 const city=makeCity('boston');const c=makeCar(150,70,Math.PI,'boston');for(let i=0;i<350;i++)stepCar(c,{gas:1},1/60,city.buildings);assert.ok(c.z-.15*c.x>35);
 const p={x:150,z:60,vx:0,vz:-3};for(let i=0;i<200;i++){p.z-=.1;collide(p,city.buildings,.4);}assert.ok(p.z-.15*p.x>35);
});
test('network route planning carries a vehicle over the sole bridge without teleporting',()=>{
 const city=makeCity('boston'),edge=city.roads.find(e=>e.id==='b_approach'),c={route:{edge,reverse:false,d:20}};let crossed=false,last=null,maxJump=0;
 for(let i=0;i<2500;i++){const p=advanceRoute(c,city,.2,{x:126,z:-154});if(last)maxJump=Math.max(maxJump,dist(last,p));last=p;if(bostonSide(p)==='cambridge')crossed=true;}assert.ok(crossed);assert.ok(maxJump<.7,maxJump);
});
test('witness vision respects distance, facing and walls; a nearby incident is noticed',()=>{
 const p=person(0,0,0);assert.ok(canObserve(p,{x:0,z:25},[],visible));assert.equal(canObserve(p,{x:0,z:-25},[],visible),false);assert.equal(canObserve(p,{x:0,z:80},[],visible),false);assert.equal(canObserve(p,{x:0,z:25},[{x:0,z:12,w:5,d:2,h:5}],visible),false);assert.ok(canObserve(p,{x:0,z:-5},[],visible));
});
test('deserted incidents do not summon police and a civilian report takes time',()=>{
 const g=empty();assert.equal(g.recordCrime('crash',g.car),false);ticks(g,360);assert.equal(g.heat,0);
 const w=person(0,-20,0);g.pedestrians=[w];assert.equal(g.recordCrime('theft',g.car),true);assert.equal(g.heat,0);ticks(g,240);assert.equal(g.heat,0);ticks(g,40);assert.equal(g.heat,1);assert.equal(g.reports.length,0);
});
test('dispatch gets the last witnessed location when the player leaves before the call completes',()=>{
 const g=empty(),w=person(0,-20,0);g.pedestrians=[w];g.recordCrime('theft',g.car);g.car.x=180;g.car.z=180;ticks(g,275);assert.equal(g.heat,1);assert.deepEqual(g.lastKnown,{x:0,z:0});assert.ok(g.cops.every(p=>p.last.x===0&&p.last.z===0));
});
test('officers on foot and in cars can observe a crime immediately',()=>{
 for(const foot of[false,true]){const g=empty(),o=foot?{...person(0,-15,0),officer:true,home:{x:0,z:-15},jurisdiction:'meridian'}:{...makeCar(0,-15,0),police:true,jurisdiction:'meridian'};if(foot)g.officers=[o];else g.cops=[o];assert.ok(g.recordCrime('crash',g.car));assert.equal(g.heat,1);assert.equal(g.reports.length,0);}
});
test('reports activate the correct bank livery and crossing does not repaint pursuing cars',()=>{
 for(const side of['boston','cambridge']){const g=new Game(makeCity('boston')),at=side==='boston'?{x:-42,z:70}:{x:42,z:-70};g.raiseHeat(1,at,side);const active=g.cops.filter(c=>c.active);assert.equal(active.length,1);assert.equal(active[0].jurisdiction,side);g.car.z=-g.car.z;assert.equal(active[0].jurisdiction,side);}
});
test('body damage alone stays drivable while severe targeted damage can start a timed fire',()=>{
 const c=makeCar();c.damage=100;c.panelDamage={front:100,rear:100,left:100,right:100};for(let i=0;i<60;i++)stepVehicleFire(c,1/60);assert.ok(!c.fire&&!c.exploded);c.engineDamage=70;c.hit=0;applyDamage(c,25,0,1);assert.ok(c.fire>0);for(let i=0;i<600;i++)stepVehicleFire(c,1/60);assert.ok(!c.exploded);for(let i=0;i<130;i++)stepVehicleFire(c,1/60);assert.ok(c.exploded);assert.equal(c.engineDamage,100);
});
test('an explosion damages nearby cars, can start a delayed chain, and leaves a non-enterable wreck',()=>{
 const g=empty();g.onFoot=true;g.person={...person(25,0),mapId:'meridian'};g.car=makeCar(0,0,0);const near=makeCar(4,0,0),far=makeCar(30,0,0);g.parked=[near,far];igniteVehicle(g.car,.02);ticks(g,3);assert.ok(g.car.exploded);assert.ok(near.damage>0);assert.ok(near.fire>0);assert.equal(far.damage,0);assert.equal(g.explosionCount,1);g.person.x=2.2;g.person.z=0;g.person.y=g.car.y;assert.ok(g.interactionInfo()?.car!==g.car);ticks(g,330);assert.ok(near.exploded);assert.ok(g.explosionCount>=2);
});
test('a player can exit a burning car before it explodes and free recovery clears fire state',()=>{
 const g=empty();igniteVehicle(g.car,12);assert.equal(g.interact(),true);g.person.x=30;ticks(g,730);assert.equal(g.done,null);assert.ok(g.car.exploded);g.recover();assert.equal(g.onFoot,true);assert.equal(g.car.exploded,false);assert.equal(g.car.fire,0);assert.equal(g.car.engineDamage,0);
});
test('new world, police liveries, officers, flames and wreck meshes are finite and bounded',()=>{
 const city=makeCity('boston'),world=Renderer.prototype.makeWorld.call({},city);assert.ok(world.v.every(Number.isFinite));assert.ok(world.v.length/27<45000);
 for(const jurisdiction of['boston','cambridge'])for(const exploded of[false,true]){const m=new Mesh(),c={...makeCar(),police:true,jurisdiction,exploded,fire:exploded?0:2,burnTime:exploded?5:0};drawCar(m,c);drawVehicleFire(m,c,1);drawPerson(m,{...person(0,0),officer:true});assert.ok(m.v.every(Number.isFinite));assert.equal(m.transform,null);}
});

test('an unexplained remote explosion does not magically identify the player',()=>{
 const g=empty();g.onFoot=true;g.person=person(150,150);g.car=makeCar(0,0);g.car.playerCausedUntil=30;g.pedestrians=[person(0,-15)];igniteVehicle(g.car,.01);ticks(g,320);assert.ok(g.car.exploded);assert.equal(g.heat,0);assert.equal(g.reports.length,0);
});

test('junction priority goes to the front of the queue and clears after the turn',()=>{
 const g=new Game(makeCity('boston')),edge=g.city.roads.find(e=>e.id==='b_approach'),len=edgeLength(edge),make=d=>({...g.makeCar(),engineDamage:0,route:{edge,reverse:false,d}}),rear=make(len-29),front=make(len-20);g.traffic=[rear,front];g.cops=[];g.junctions.clear();
 assert.ok(g.junctionSpeed(rear,10)<10);assert.equal(g.junctions.get(edge.to),front);assert.equal(g.junctionSpeed(front,10),10);front.route={edge:g.city.roads.find(e=>e.bridge),reverse:false,d:15};g.junctionSpeed(front,10);assert.equal(g.junctions.has(edge.to),false);
});
test('a minute of two-bank traffic keeps flowing and uses the bridge without entering water',()=>{
 const g=new Game(makeCity('boston')),origin=new Map(g.traffic.map(c=>[c,bostonSide(c)])),crossed=new Set();let water=0;
 for(let i=0;i<3600;i++){g.tick(1/60,{});for(const c of g.traffic){if(bostonSide(c)!==origin.get(c))crossed.add(c);if(bostonHeight(c.x,c.z)<0)water++;assert.ok([c.x,c.z,c.y].every(Number.isFinite));}}
 assert.equal(water,0);assert.ok(crossed.size>=2);assert.ok(g.traffic.filter(c=>c.speed>1).length>=20);assert.equal(g.heat,0);
});
