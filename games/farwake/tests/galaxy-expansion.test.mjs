import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildGalaxy} from '../dist/engine.mjs';
import {FACTION_PORTS} from '../dist/port-content.mjs';
import {expandGalaxy,FRONTIER_SYSTEMS,GALAXY_SYSTEM_COUNT,COSMIC_RULES,systemCosmicBodies,cosmicInfluence,applyCosmicHazards} from '../dist/galaxy-expansion.mjs';
import {advanceShip,getShipClass} from '../dist/fleet.mjs';
import {SpaceRenderer} from '../dist/space-art.mjs';
import {releasedBody} from './helpers/world-type-projection.mjs';

const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Recorded from the released0.4.0 generator. Expansion must not move saved worlds.
const legacyHashes={
 'legacy-frontier':'cd8ce8c8f7eea6c2d83a9a74facb26d91af37ea8de04f651395887f8538fe2c7',
 farwake:'9c4b45b8cfd3de1173e06978fdf73f91bedbd0fe5f1f241b009019c85cb3e572',
 'quiet-earth':'6a1a1920b93e72d5cbad82ee7ba2a8851fa00e9731060fae2bfaa38254498d33'
};
// These two intentional 0.5.1 descriptions clarify the existing core port. New
// type metadata and service berths are projected out. Procedural station moves
// are also projected back to their old implicit positions; planets and authored
// routes, IDs and every other released field stay protected by these hashes.
function releasedChartProjection(systems){
 const additions=new Set(FACTION_PORTS.map(port=>port.id));
 const projected=structuredClone(systems).map(system=>({...system,bodies:system.bodies.filter(body=>!additions.has(body.id))})),hearth=projected.find(system=>system.id==='hearth');
 for(const system of projected){
  for(const key of ['systemTypeId','typeLabel','typeDescription','stellar','activity'])delete system[key];
  system.bodies=system.bodies.map(body=>releasedBody(body,{authored:system.authored}));
 }
 hearth.description='A tired orange star and a station built from ships that never made it home.';
 hearth.bodies.find(body=>body.id==='kettle').lore='A salvage port where every welded corridor remembers a different ship. Cinder is the smallest vessel on the departure board.';
 return projected;
}

test('expanded charts preserve released fields while adding type metadata and unique deterministic places',()=>{
 for(const[seed,expected]of Object.entries(legacyHashes)){
  const current=buildGalaxy(seed),base=current.slice(0,300),before=JSON.stringify(base),expanded=expandGalaxy(base,seed);
  assert.equal(checksum(releasedChartProjection(base)),expected,'existing stars, body IDs and all data except the two named prose fields retain their released values');
  assert.equal(expanded.length,GALAXY_SYSTEM_COUNT);assert.equal(new Set(expanded.map(system=>system.id)).size,GALAXY_SYSTEM_COUNT);
  assert.equal(new Set(expanded.flatMap(system=>system.bodies.map(body=>body.id))).size,expanded.reduce((n,system)=>n+system.bodies.length,0));
  assert.equal(JSON.stringify(base),before);assert.ok(base.every((system,index)=>expanded[index]===system));
  assert.deepEqual(expandGalaxy(base,seed),expanded);assert.equal(expandGalaxy(expanded,seed),expanded,'a second load cannot add duplicates');
  assert.equal(expanded.filter(system=>system.frontier&&system.authored).length,8);
  assert.ok(FRONTIER_SYSTEMS.every(system=>expanded.some(candidate=>candidate.id===system.id)));
 }
});

test('Hearth remains the central starter system and describes its busy inhabited port',()=>{
 for(const seed of Object.keys(legacyHashes)){
  const hearth=buildGalaxy(seed).find(system=>system.id==='hearth'),kettle=hearth.bodies.find(body=>body.id==='kettle');
  assert.equal(hearth.gx,0);assert.equal(hearth.gy,0);
  assert.equal(hearth.description,'The crowded heart of the settled lanes. Ferries, supply ships, port tugs and watch patrols cross beneath a tired orange star; emergencies usually reach a staffed service long before a passing captain.');
  assert.equal(kettle.lore,'A busy city of welded ship corridors, markets and apartment rings. Ferries queue beside the freight locks while the port watch directs traffic. Cinder is a small name on a very long departure board.');
 }
});

test('all900 systems are reachable with the first fold drive across different frontier seeds',()=>{
 for(const seed of ['farwake','quiet-earth','outer-route-check','a','b']){
  const systems=expandGalaxy(buildGalaxy(seed).slice(0,300),seed),seen=new Set(['hearth']),queue=[systems.find(system=>system.id==='hearth')];
  for(let at=0;at<queue.length;at++)for(const next of systems){
   if(!seen.has(next.id)&&Math.hypot(next.gx-queue[at].gx,next.gy-queue[at].gy)<=5){seen.add(next.id);queue.push(next);}
  }
  assert.equal(seen.size,GALAXY_SYSTEM_COUNT,`${seed}: every added sector has a traversable route`);
 }
});

test('stellar remnants are deterministic runtime objects and cannot become inhabited chart bodies',()=>{
 const galaxy=expandGalaxy(buildGalaxy('remnants').slice(0,300),'remnants'),base=galaxy.slice(0,300),umbra=galaxy.find(system=>system.id==='umbra'),before=JSON.stringify(galaxy);
 assert.ok(base.every(system=>systemCosmicBodies(system,'remnants').length===0),'the old300 systems keep their original physical worlds');
 const wells=systemCosmicBodies(umbra,'remnants');assert.equal(wells.length,1);assert.deepEqual(systemCosmicBodies(umbra,'remnants'),wells);
 const hole=wells[0];assert.equal(hole.landable,false);assert.equal(hole.kind,'blackhole');assert.ok(hole.warningRadius>hole.gravityRadius&&hole.gravityRadius>hole.tideRadius&&hole.tideRadius>hole.radius);
 assert.ok(Math.hypot(hole.x,hole.y)>hole.warningRadius+400,'arrival at the first port cannot begin inside the gravity warning');
 assert.equal(JSON.stringify(galaxy),before);assert.ok(!galaxy.some(system=>system.bodies.some(body=>body.kind==='blackhole')));
 assert.ok(galaxy.some(system=>system.bodies.some(body=>body.alienCulture==='choral')));
});

const well={id:'test:well',name:'Test well',kind:'blackhole',x:0,y:0,radius:140,...COSMIC_RULES};
test('gravity is telegraphed before pull or damage and leaves damage resolution to the authority',()=>{
 const ship={id:'pilot',x:1400,y:0,vx:0,vy:0,hull:100,shield:35,angle:0};
 assert.equal(cosmicInfluence(ship,[well]).hazard,null);
 const warning=cosmicInfluence({...ship,x:1200},[well]);assert.equal(warning.hazard.level,'warning');assert.equal(warning.ax,0);assert.equal(warning.damageRate,0);
 const pull=cosmicInfluence({...ship,x:800},[well]);assert.equal(pull.hazard.level,'pull');assert.ok(pull.ax<0);assert.equal(pull.damageRate,0);
 const danger=cosmicInfluence({...ship,x:250},[well]);assert.equal(danger.hazard.level,'danger');assert.ok(danger.damageRate>0&&danger.damageRate<=18);
 const before=JSON.stringify({ship,well}),stepped=applyCosmicHazards({...ship,x:250},.1,[well]);
 assert.ok(stepped.ship.vx<0);assert.ok(stepped.damage>0);assert.equal(stepped.ship.hull,100);assert.equal(stepped.ship.shield,35);
 const predicted=applyCosmicHazards({...ship,x:250},.1,[well],{damage:false});assert.equal(predicted.damage,0);assert.deepEqual(predicted.ship,stepped.ship);
 assert.equal(JSON.stringify({ship,well}),before);
 const center=applyCosmicHazards({...ship,x:0,y:0},.1,[well]);assert.ok([center.ship.x,center.ship.y,center.ship.vx,center.ship.vy,center.damage].every(Number.isFinite));
 assert.ok(Math.hypot(cosmicInfluence(ship,[{...well,x:1400}, {...well,x:1400}]).ax,cosmicInfluence(ship,[{...well,x:1400}, {...well,x:1400}]).ay)<=18+.0001,'overlapping wells never create unbounded acceleration');
});

test('even the slow industrial hull can thrust out of the well and frame rates remain close',()=>{
 const hull=getShipClass('atlas'),initial={id:'heavy',classId:hull.id,...hull.stats,x:180,y:0,vx:0,vy:0,angle:0,angularVelocity:0,hull:465,shield:115};
 function run(hz){let ship={...initial},damage=0;for(let i=0;i<30*hz;i++){ship=advanceShip(ship,1/hz,{thrust:1,flightAssist:false});const result=applyCosmicHazards(ship,1/hz,[well]);ship=result.ship;damage+=result.damage;}return{ship,damage};}
 const thirty=run(30),sixty=run(60),oneTwenty=run(120);
 for(const result of[thirty,sixty,oneTwenty]){assert.ok(result.ship.x>COSMIC_RULES.warningRadius);assert.equal(cosmicInfluence(result.ship,[well]).hazard,null);assert.ok(result.damage<initial.hull*.35,'escaping immediately is survivable even for the slow hull');}
 assert.ok(Math.abs(thirty.ship.x-oneTwenty.ship.x)<6);assert.ok(Math.abs(sixty.ship.x-oneTwenty.ship.x)<3);
 assert.ok(Math.abs(thirty.damage-oneTwenty.damage)<2);
});

class FakeCanvas{
 static allocations=0;
 constructor(width,height){this.width=width;this.height=height;this.ctx=new FakeContext(this);FakeCanvas.allocations++;}
 getContext(){return this.ctx;}
}
class FakeContext{
 constructor(canvas){this.canvas=canvas;this.images=[];this.fills=[];}
 save(){}restore(){}translate(){}rotate(){}setTransform(){}scale(){}clearRect(){}strokeRect(){}setLineDash(){}
 fillRect(x,y,w,h){this.fills.push({color:this.fillStyle,x,y,w,h});}
 drawImage(...args){this.images.push(args);}fillText(){}measureText(s){return{width:String(s).length*6};}
}

test('black holes have crisp separate art, readable warnings and bounded reusable frames at wide zoom',()=>{
 const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=FakeCanvas;
 try{
  const game={state:{systemId:'umbra',stats:{time:8},ship:{id:'local',classId:'sparrow',x:-800,y:0,angle:0,hull:100,maxHull:100}},system:{bodies:[well],asteroids:[],traffic:[],enemies:[],signals:[],bullets:[],pickups:[]}},snapshot=JSON.stringify(game),ctx=new FakeCanvas(428,700).ctx,renderer=new SpaceRenderer(),labels=[];
  renderer.draw(ctx,game,{width:428,height:700,time:0,motion:false,zoomMultiplier:.25,labels});
  assert.ok(labels.some(label=>label.kind==='hazard'&&label.text.includes('GRAVITY WELL')&&label.size>=14));
  assert.ok(labels.some(label=>label.text.includes('BLACK HOLE · NO LANDING')));assert.equal(renderer.planetCache.size,0,'a remnant never borrows a planet texture');
  assert.equal(JSON.stringify(game),snapshot);assert.equal(ctx.imageSmoothingEnabled,false);
  for(let i=0;i<4;i++)renderer.draw(ctx,game,{time:i/0.6,motion:true,zoomMultiplier:.25,labels:[]});
  const allocated=FakeCanvas.allocations;
  for(let i=0;i<16;i++)renderer.draw(ctx,game,{time:i*1.17,motion:true,zoomMultiplier:.25,labels:[]});
  assert.equal(FakeCanvas.allocations,allocated,'animation uses four shared frames rather than allocating by body or time');
  const radar=new FakeCanvas(140,140).ctx;renderer.radar(radar,game,well.id);assert.ok(radar.fills.some(fill=>fill.color==='#03070f'));
 }finally{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;}
});
