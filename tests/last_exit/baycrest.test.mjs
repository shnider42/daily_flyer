import test from 'node:test';import assert from 'node:assert/strict';
import{Game,makeCity,makeCar,stepCar,collideVehicle,collide,dist,BAY_JOBS,JOBS,visible,boxContact}from'../../daily_flyer/themes/last_exit_assets/engine.js';
import{terrainHeight,walkHeight,vehicleSurface,groundHeight}from'../../daily_flyer/themes/last_exit_assets/terrain.js';
import{vehicleSpec,VEHICLES}from'../../daily_flyer/themes/last_exit_assets/vehicles.js';
import{Mesh,Renderer}from'../../daily_flyer/themes/last_exit_assets/render.js';
const ticks=(g,n,input={})=>{for(let i=0;i<n;i++)g.tick(1/60,input);};
const measure=kind=>{const c=makeCar(-36,-36,0,'baycrest');c.kind=kind;let n=0;while(c.speed<60/2.237&&n<2400){c.x=-36;c.z=-36;stepCar(c,{gas:1},1/60,[]);n++;}return n/60;};
test('the starter has an ordinary 0–60 time and rare cars have a meaningful advantage',()=>{
 const sedan=measure('sedan'),sport=measure('sport'),muscle=measure('muscle'),compact=measure('compact'),wagon=measure('wagon');
 assert.ok(sedan>11.5&&sedan<12.5,sedan);assert.ok(compact>13.5&&compact<15,compact);assert.ok(wagon>15&&wagon<16.5,wagon);
 assert.ok(sport>5.5&&sport<6.5,sport);assert.ok(muscle>6.5&&muscle<7.7,muscle);assert.ok(sedan/sport>1.8);
});
test('all modes start in a common car and each city keeps its own jobs',()=>{
 for(const id of['meridian','baycrest']){const g=new Game(makeCity(id));for(const job of(id==='baycrest'?BAY_JOBS:JOBS)){g.start(job.id);assert.ok(!vehicleSpec(g.car).rare);assert.equal(g.car.mapId,id);assert.equal(g.job.time,job.time);}}
});
test('Baycrest is separate terrain, with flat intersections and six level landmark blocks',()=>{
 const city=makeCity('baycrest');assert.equal(city.features.length,6);const heights=[20,34,6,6,4,18];
 for(const[f,i]of city.features.map((f,i)=>[f,i]))for(const dx of[-24,0,24])for(const dz of[-24,0,24])assert.ok(Math.abs(terrainHeight(f.x+dx,f.z+dz,city.id)-heights[i])<.001,f.name);
 for(const x of[-144,-72,0,72,144])for(const z of[-144,-72,0,72,144])assert.ok(Math.abs(terrainHeight(x,z,'baycrest')-terrainHeight(x+4,z-4,'baycrest'))<.001);
 assert.ok(terrainHeight(-72,-72,'baycrest')>30);assert.notEqual(terrainHeight(-72,-72,'meridian'),terrainHeight(-72,-72,'baycrest'));
});
test('two game instances keep independent vehicle and pedestrian surface heights',()=>{
 const a=new Game(makeCity('meridian')),b=new Game(makeCity('baycrest'));a.traffic=[];b.traffic=[];const y=a.car.y;ticks(b,30);ticks(a,1);
 assert.ok(Math.abs(a.car.y-y)<.15);assert.ok(Math.abs(b.car.y-groundHeight(b.car.x,b.car.z,'baycrest'))<.15);assert.ok(b.pedestrians.every(p=>p.mapId==='baycrest'));assert.ok(a.pedestrians.every(p=>p.mapId==='meridian'));
});
test('the ordinary starter can pull away uphill on a steep Baycrest street',()=>{
 const c=makeCar(-72,180,Math.PI,'baycrest'),z=c.z;let maxPitch=0;
 for(let i=0;i<420;i++){stepCar(c,{gas:1},1/60,[]);maxPitch=Math.max(maxPitch,Math.abs(c.pitch));assert.ok(Number.isFinite(c.y));}
 assert.ok(c.z<z-22);assert.ok(c.speed>2);assert.ok(maxPitch>.15);
});
test('crests can block police sight and level streets remain visible',()=>{
 const a=makeCar(-72,-150,0,'baycrest'),b=makeCar(-72,130,0,'baycrest');assert.equal(visible(a,b,[]),false);
 assert.equal(visible(makeCar(144,3,0,'baycrest'),makeCar(144,69,0,'baycrest'),[]),true);
});
test('rare cars are limited to two off-street discoveries in Baycrest',()=>{
 const a=new Game(),g=new Game(makeCity('baycrest')),rare=g.parked.filter(c=>c.rare);assert.equal(a.parked.filter(c=>c.rare).length,0);assert.equal(rare.length,2);assert.ok(!g.traffic.some(c=>vehicleSpec(c).rare));assert.equal(g.discoveries.size,0);
 for(const c of rare){const p={...c};collideVehicle(p,g.city.buildings);assert.ok(dist(p,c)<.001,c.kind);assert.ok(Math.min(...[-216,-144,-72,0,72,144,216].map(r=>Math.min(Math.abs(c.x-r),Math.abs(c.z-r))))>11);}
 g.car.x=rare[0].x;g.car.z=rare[0].z+10;g.car.y=groundHeight(g.car.x,g.car.z,'baycrest');g.traffic=[];g.pedestrians=[];ticks(g,1);assert.ok(g.discoveries.has('sport'));assert.equal(g.discoveries.has('muscle'),false);
});
test('both rare cars can be entered, driven and exited with damage retained',()=>{
 for(const kind of['sport','muscle']){const g=new Game(makeCity('baycrest')),c=g.parked.find(c=>c.kind===kind);g.traffic=[];g.pedestrians=[];c.damage=41;g.onFoot=true;g.person={x:c.x+Math.cos(c.a)*2.25,z:c.z-Math.sin(c.a)*2.25,y:c.y,a:c.a,speed:0,mapId:'baycrest'};
  assert.equal(g.interact(),true);assert.equal(g.car,c);assert.equal(c.damage,41);assert.ok(g.discoveries.has(kind));ticks(g,30,{gas:1});assert.ok(c.speed>1);c.vx=c.vz=c.speed=0;assert.equal(g.interact(),true);assert.equal(g.onFoot,true);
 }
});
test('all new mission stops and landmark entrances have vehicle clearance',()=>{
 const city=makeCity('baycrest');for(const job of BAY_JOBS)for(const t of job.targets){const c=makeCar(t.x,t.z,0,'baycrest');collideVehicle(c,city.buildings);assert.ok(dist(c,t)<.01,job.id);}
 for(const f of city.features){const c=makeCar(f.entrance.x,f.z+36,0,'baycrest');collideVehicle(c,city.buildings);assert.ok(dist(c,{x:f.entrance.x,z:f.z+36})<.01,f.name);}
});
test('Telegraph Terrace stairs lead to the same visible elevated surface',()=>{
 const g=new Game(makeCity('baycrest'));g.interact();g.traffic=[];g.parked=[];g.person.x=-22;g.person.z=-18;g.person.y=walkHeight(-22,-18,g.city);
 for(let i=0;i<300;i++)g.stepPerson({moveY:1,viewHeading:Math.PI},1/60);
 assert.ok(g.person.z<-30);assert.ok(g.person.y>35.9&&g.person.y<36.1);
});
test('Baycrest world mesh is finite, has a bridge beyond the city and stays within a mobile geometry budget',()=>{
 const m=Renderer.prototype.makeWorld.call({},makeCity('baycrest'));assert.ok(m.v.every(Number.isFinite));assert.ok(m.v.length/27<65000);let maxX=0,maxY=0;for(let i=0;i<m.v.length;i+=9){maxX=Math.max(maxX,m.v[i]);maxY=Math.max(maxY,m.v[i+1]);}assert.ok(maxX>400);assert.ok(maxY>50);
});
