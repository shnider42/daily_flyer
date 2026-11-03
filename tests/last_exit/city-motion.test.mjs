import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,makeCar,personVehicleContact,boxContact,angle,dist} from '../../daily_flyer/themes/last_exit_assets/engine.js';
import {groundHeight} from '../../daily_flyer/themes/last_exit_assets/terrain.js';
import {VEHICLES,vehicleSpec} from '../../daily_flyer/themes/last_exit_assets/vehicles.js';
import {makeView,stepView,beginGesture,advanceGesture,moveGesture,isLooking,movementHeading} from '../../daily_flyer/themes/last_exit_assets/controls.js';
import {Mesh} from '../../daily_flyer/themes/last_exit_assets/render.js';
import {drawCar,drawPerson} from '../../daily_flyer/themes/last_exit_assets/models.js';
const empty=()=>new Game({buildings:[],palms:[],signals:[]});
const person=(x=0,z=0)=>({x,z,y:groundHeight(x,z),a:0,vx:0,vz:0,speed:0,life:Infinity,walk:0});
const ticks=(g,n,input={})=>{for(let i=0;i<n;i++)g.tick(1/60,input);};

test('holding GAS follows a full turn without any manual camera movement',()=>{
 const v=makeView(0),g=beginGesture(350,720,0,'gas');advanceGesture(g,150);
 for(let i=0;i<120;i++){const heading=i/120*Math.PI/2;stepView(v,heading,false,1/60,isLooking([g],150+i*17),15);}
 assert.ok(v.yaw>1.25&&v.yaw<Math.PI/2,`camera yaw ${v.yaw}`);
});
test('deliberate looking pauses follow and eases back after release',()=>{
 const v=makeView(1),g=beginGesture(320,600,0,'gas');moveGesture(g,355,600);
 stepView(v,0,false,.2,isLooking([g],200),10);assert.equal(v.yaw,1);
 for(let i=0;i<50;i++)stepView(v,0,false,1/60,false,10);assert.equal(v.yaw,1);
 for(let i=0;i<90;i++)stepView(v,0,false,1/60,false,10);assert.ok(v.yaw<.08&&v.yaw>0);
});
test('a held pedal only pauses chase while its thumb is actually dragging',()=>{
 const g=beginGesture(0,0,0,'gas');advanceGesture(g,150);moveGesture(g,30,0);g.lastLookAt=200;
 assert.equal(isLooking([g],250),true);assert.equal(isLooking([g],350),false);
});
test('walking follow preserves a held movement direction instead of spiralling',()=>{
 const s={moving:false},v=makeView(0);assert.equal(movementHeading(s,1,0,0),0);
 for(let i=0;i<180;i++){stepView(v,-Math.PI/2,true,1/60,false,3);assert.equal(movementHeading(s,1,0,v.yaw),0);}
 assert.ok(v.yaw<-1.4);movementHeading(s,0,0,v.yaw);assert.equal(movementHeading(s,1,0,v.yaw),v.yaw);
 assert.equal(movementHeading(s,1,0,.4,true),.4);
});
test('a parked car has a solid full-length footprint for someone on foot',()=>{
 const p=person(0,2.7),c=makeCar(0,0,0);assert.equal(personVehicleContact(p,c),0);assert.ok(p.z>3);assert.equal(p.stun,undefined);
 const side=person(.2,0);personVehicleContact(side,c);assert.ok(side.x>1.47);
});
test('moving cars knock down a stationary player after the vehicle step',()=>{
 const g=empty();g.car=makeCar(100,100,0);g.onFoot=true;g.person=person(-5.4,0);g.parked=[];g.pedestrians=[];
 g.traffic=[{...makeCar(-5.4,-3.2,0),occupied:true,speed:12,cruiseSpeed:12,vertical:true,dir:1}];
 ticks(g,3);assert.ok(g.person.lastVehicleImpact>7);assert.ok(g.person.knockdown>0);assert.ok(g.person.z>0);assert.match(g.message,/Knocked down/);
 g.traffic=[];ticks(g,120);assert.equal(g.person.stun,0);assert.equal(g.person.knockdown,0);const z=g.person.z;ticks(g,30,{moveY:1,viewHeading:0});assert.ok(g.person.z>z+1);
});
test('player vehicle impacts affect an NPC and report the collision',()=>{
 const g=empty();g.car=makeCar(0,-3.2,0);g.car.vz=16;g.car.speed=16;g.traffic=[];g.parked=[];g.pedestrians=[person(0,0)];
 ticks(g,3);assert.ok(g.pedestrians[0].lastVehicleImpact>7);assert.ok(g.pedestrians[0].knockdown>0);assert.equal(g.heat,1);
});
test('swept contact catches a car crossing the person between positions',()=>{
 const p=person(0,0),c={...makeCar(0,4,0),y:p.y,previousX:0,previousZ:-4,vz:30};
 assert.equal(personVehicleContact(p,c),30);assert.ok(p.z>7);assert.ok(p.knockdown>0);
});
test('vehicle contact does not reach a person on a raised floor',()=>{
 const c={...makeCar(0,0,0),vz:15},p={...person(0,2.9),y:c.y+2};const before={...p};
 assert.equal(personVehicleContact(p,c),0);assert.deepEqual(p,before);
});
test('damage impulse cooldown prevents repeated hits while sliding along a car',()=>{
 const c={...makeCar(0,0,0),vz:15},p=person(0,2.9);assert.ok(personVehicleContact(p,c)>7);
 p.z=2.9;assert.equal(personVehicleContact(p,c),0);assert.equal(p.contactCooldown,1);
});
test('an empty player car still receives traffic momentum while on foot',()=>{
 const g=empty();g.onFoot=true;g.person=person(30,30);g.car=makeCar(0,0,0);const c={...makeCar(0,-5,0),occupied:true,vz:12,speed:12};
 g.carCollision(c,1/60);assert.ok(g.car.vz>0);assert.equal(g.heat,0);g.traffic=[];g.parked=[];g.pedestrians=[];const z=g.car.z;ticks(g,10);assert.ok(g.car.z>z);
});
test('city has over a hundred traffic cars, seven types and crossing pedestrians',()=>{
 const g=new Game();assert.equal(g.traffic.length,113);assert.equal(new Set(g.traffic.map(c=>c.kind)).size,7);assert.equal(g.pedestrians.length,44);
 for(const c of g.traffic){assert.ok(VEHICLES[c.kind]);assert.equal(boxContact(c,g.car),null);}
});
test('traffic follows a curved junction turn and joins the correct outgoing lane',()=>{
 const g=empty();g.car=makeCar(180,180);g.pedestrians=[];g.parked=[];g.elapsed=1;g.city.signals=[{x:0,z:0}];
 const c={...makeCar(-5.4,-14,0),occupied:true,speed:9,cruiseSpeed:9,vertical:true,dir:1,nextTurnAt:0};g.traffic=[c];
 let turning=false,maxStep=0,last={...c};for(let i=0;i<360;i++){g.stepTraffic(1/60);turning||=!!c.turn;maxStep=Math.max(maxStep,dist(c,last));last={...c};}
 assert.ok(turning);assert.equal(c.vertical,false);assert.equal(c.turn,null);assert.ok(Math.abs(c.z-c.dir*5.4)<.15);assert.ok(Math.abs(angle(c.a-c.dir*Math.PI/2))<.05);assert.ok(maxStep<.5);
});
test('all seven vehicle bodies and distant meshes tolerate severe damage and open doors',()=>{
 for(const kind of Object.keys(VEHICLES))for(const lod of[false,true])for(const damage of[0,100]){
  const m=new Mesh(),c={...makeCar(),kind,damage,y:10,pitch:.3,roll:-.15,panelDamage:{front:damage,rear:damage,left:damage,right:damage},engineDamage:damage};
  drawCar(m,c,{lod,door:{side:1,time:.5}});assert.equal(m.v.length%27,0);assert.ok(m.v.every(Number.isFinite));assert.equal(m.transform,null);assert.ok(m.v.length>1000);
 }
 assert.ok(vehicleSpec({kind:'pickup'}).mass>vehicleSpec({kind:'compact'}).mass);
});
test('stumble, fallen and recovering pedestrian poses stay finite',()=>{
 for(const knockdown of[0,.25,.8,1.65]){const m=new Mesh();drawPerson(m,{...person(),stun:1,knockdown});assert.ok(m.v.every(Number.isFinite));assert.equal(m.transform,null);assert.ok(m.v.length>100);}
});

test('Safari native gestures are cancelled on game surfaces only during play',async()=>{
 const {guardGameTouches}=await import('../../daily_flyer/themes/last_exit_assets/controls.js');let playing=true;const registrations=[];
 const surface={addEventListener(type,fn,options){registrations.push({type,fn,options});}};
 guardGameTouches([surface],()=>playing,surface);let prevented=0;
 for(const r of registrations){assert.equal(r.options.passive,false);r.fn({cancelable:true,preventDefault(){prevented++;}});}
 assert.ok(registrations.some(r=>r.type==='touchend'));assert.ok(registrations.some(r=>r.type==='gesturestart'));assert.equal(prevented,registrations.length);
 playing=false;for(const r of registrations)r.fn({cancelable:true,preventDefault(){prevented++;}});assert.equal(prevented,registrations.length);
});

test('a quick pedal tap produces a pulse action; a swipe or cancelled tap never does',async()=>{
 const {finishGesture}=await import('../../daily_flyer/themes/last_exit_assets/controls.js');const tap=beginGesture(20,20,0,'gas');assert.equal(finishGesture(tap),'gas');assert.equal(finishGesture(tap,true),null);
 moveGesture(tap,38,20);assert.equal(finishGesture(tap),null);
});

test('on-foot camera retracts before a nearby car but leaves an unobstructed view alone',async()=>{
 const {safeFootCamera}=await import('../../daily_flyer/themes/last_exit_assets/engine.js');const c={...makeCar(0,0,0),y:0},p={...person(2.25,0),y:0};
 const blocked=safeFootCamera(p,[-5,2,0],[c]);assert.ok(blocked[0]>1.22);assert.ok(blocked[0]<p.x);
 const clear=[5,3,0];assert.deepEqual(safeFootCamera(p,clear,[c]),clear);
});
