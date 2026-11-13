import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.mjs';
import {questThread} from '../dist/quest-content.mjs';
import {LEGACY_WORLD_RADIUS,SYSTEM_SPACE_SCALE,WORLD_RADIUS} from '../dist/system-space.mjs';
import {releasedChart,releasedBody,releasedRadius,releasedAsteroids,releasedSignals} from './helpers/world-type-projection.mjs';

// Captured by running the committed e8a86eb dist files in an independent
// directory. No current placement helper or generator supplied these hashes.
const baseline=JSON.parse(readFileSync(new URL('./fixtures/system-space-010.json',import.meta.url)));
const keys=['bodies','asteroids','enemies','signals','traffic'];
const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round=value=>Math.round(value*1e6)/1e6;
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

function content(items,key){
 return items.map(item=>{
  const result=Object.fromEntries(Object.entries(item).filter(([field])=>!['x','y',...(key==='traffic'?['vx','vy','angle','angularVelocity','speed','trafficStatus','originId','originName','destinationId','destinationName']:[])].includes(field)));
  // Moving vessels can be on the opposite leg as the voyage gets longer.
  // Their two named ports, hulls, identities and other content must remain.
  if(key==='traffic'&&item.originId)result.routePorts=[[item.originId,item.originName],[item.destinationId,item.destinationName]].sort((a,b)=>a[0].localeCompare(b[0]));
  return result;
 });
}

let surveyed;
function surveyGalaxy(){
 if(surveyed)return surveyed;
 const game=new Game(baseline.seed),trafficControl=new Game(baseline.seed),hashes=Object.fromEntries(keys.map(key=>[key,createHash('sha256')])),poses=Object.fromEntries(keys.filter(key=>key!=='traffic').map(key=>[key,createHash('sha256')]));
 // The new catalog intentionally changes port purpose, traffic budget and body
 // outlines. A control loaded with the released chart inputs still protects
 // every old hull/route field against the independent0.10 fixture. Bounds and
 // duplicate checks below always use the actual new runtime, including traffic.
 trafficControl.galaxy=releasedChart(game.galaxy).map(system=>({...system,bodies:system.bodies.map(body=>({...body,visualRadius:releasedRadius(body)}))}));
 const counts=Object.fromEntries(keys.map(key=>[key,0])),actualCounts=Object.fromEntries(keys.map(key=>[key,0])),bounds=[],duplicates=[],dimensions=new Set();
 for(const system of game.galaxy){
  game.state.systemId=system.id;game._loadSystem(system.id);const world=game.system;
  trafficControl.state.systemId=system.id;trafficControl._loadSystem(system.id);
  const released={
   bodies:world.bodies.map(body=>releasedBody(body,{authored:system.authored,runtime:true})),
   asteroids:releasedAsteroids(world.asteroids),enemies:world.enemies,signals:releasedSignals(world.signals),traffic:trafficControl.system.traffic
  };
  dimensions.add(`${world.radius}:${world.width}:${world.height}`);
  for(const key of keys){
   const items=world[key];actualCounts[key]+=items.length;counts[key]+=released[key].length;hashes[key].update(JSON.stringify([system.id,content(released[key],key)]));
   if(new Set(items.map(item=>item.id)).size!==items.length)duplicates.push(`${system.id}/${key}`);
   for(const item of items){
    const extent=Math.max(item.radius||0,(item.renderLength||0)/2,(item.renderWidth||0)/2);
    if(!Number.isFinite(item.x)||!Number.isFinite(item.y)||Math.abs(item.x)+extent>world.radius||Math.abs(item.y)+extent>world.radius)bounds.push(`${system.id}/${key}/${item.id}`);
   }
  }
  for(const key of Object.keys(poses)){
   const points=released[key].map(item=>{
    let x=item.x/SYSTEM_SPACE_SCALE,y=item.y/SYSTEM_SPACE_SCALE;
    if(item.id==='hearth:story:tinbell'){
     const moon=world.bodies.find(body=>body.id==='tinbell');
     x=moon.x/SYSTEM_SPACE_SCALE+(item.x-moon.x);y=moon.y/SYSTEM_SPACE_SCALE+(item.y-moon.y);
    }
    return{id:item.id,x:round(x),y:round(y)};
   });
   poses[key].update(JSON.stringify([system.id,points]));
  }
 }
 return surveyed={systemCount:game.galaxy.length,chartHash:checksum(releasedChart(game.galaxy)),counts,actualCounts,contentHashes:Object.fromEntries(keys.map(key=>[key,hashes[key].digest('hex')])),placementHashes:Object.fromEntries(Object.keys(poses).map(key=>[key,poses[key].digest('hex')])),bounds,duplicates,dimensions:[...dimensions]};
}

test('all900 released systems retain original geography and physics while type additions remain explicit',()=>{
 const current=surveyGalaxy();
 assert.equal(current.systemCount,900);assert.equal(current.systemCount,baseline.systemCount);
 assert.equal(current.chartHash,baseline.chartHash,'Coordinates, destinations and every original chart field remain the released0.10 data.');
 assert.deepEqual(current.counts,baseline.counts);
 for(const key of keys)assert.equal(current.contentHashes[key],baseline.contentHashes[key],`${key}: the released projection/control retains its committed0.10 fields`);
 assert.ok(current.actualCounts.asteroids>current.counts.asteroids,'type-specific resource fields are appended to the protected original rocks');
 assert.deepEqual(current.duplicates,[]);
});

test('every generated system uses3x spacing and contains physical objects inside its8100m bounds',()=>{
 const current=surveyGalaxy();
 assert.equal(SYSTEM_SPACE_SCALE,3);assert.equal(LEGACY_WORLD_RADIUS,2700);assert.equal(WORLD_RADIUS,8100);
 assert.deepEqual(current.dimensions,['8100:16200:16200']);assert.deepEqual(current.bounds,[]);
 for(const key of Object.keys(baseline.placementHashes))assert.equal(current.placementHashes[key],baseline.placementHashes[key],`${key}: scaling back the generated positions recovers the independent old layout`);
});

test('new captains keep their original Kettle berth and on-foot placement while Tinbell keeps its local beacon clearance',()=>{
 for(const start of baseline.starts){
  const game=new Game(start.seed,{openingMission:start.openingMission}),port=game.system.bodies.find(body=>body.id==='kettle'),moon=game.system.bodies.find(body=>body.id==='tinbell'),beacon=game.system.signals.find(signal=>signal.id==='hearth:story:tinbell');
  assert.equal(game.state.mode,start.mode);assert.equal(game.state.locationId,start.locationId);
  assert.deepEqual({x:game.state.ship.x,y:game.state.ship.y,radius:game.state.ship.radius},start.ship);
  assert.deepEqual({x:game.state.person.x,y:game.state.person.y},start.person);
  assert.ok(Math.hypot(game.state.ship.x-port.x,game.state.ship.y-port.y)<port.radius+150,'The first harbor remains reachable by the unchanged docking interaction.');
  near(beacon.x-moon.x,moon.radius+165);near(beacon.y-moon.y,85);assert.equal(beacon.radius,24);
 }
});

const activeRecord=(game,stage)=>({status:'active',stage,choices:{},solved:[],rewardQuote:440,shipId:game.state.ship.id,targetId:null,huntOutcome:null,startedAt:0,finishedAt:null});

test('Umbra public reading target follows the moved well at its old safe offset and the scan gate uses that target',()=>{
 for(const old of baseline.umbra){
  const game=new Game(old.seed);game.state.systemId='umbra';game._loadSystem('umbra');
  const record=game.state.narrative.quests.borrowed_time=activeRecord(game,2),well=game.system.bodies.find(body=>body.id===old.id),authored=questThread('borrowed_time').stages[2].at;
  const target=game.narrativeBoard().active.find(thread=>thread.id==='borrowed_time').target;
  near(well.x,old.x*3);near(well.y,old.y*3);
  for(const field of['radius','gravityRadius','tideRadius','warningRadius'])assert.equal(well[field],old[field]);
  near(target.x-well.x,authored.x-old.x);near(target.y-well.y,authored.y-old.y);
  const localDistance=Math.hypot(target.x-well.x,target.y-well.y);
  assert.ok(localDistance>well.tideRadius&&localDistance<well.warningRadius,'The same outer contour still offers the reading without entering damaging tides.');
  Object.assign(game.state.ship,{x:authored.x,y:authored.y,vx:0,vy:0});
  assert.equal(game.threadAction({threadId:'borrowed_time',action:'advance'}).code,'distance');assert.equal(record.stage,2);
  Object.assign(game.state.ship,{x:target.x,y:target.y});
  assert.equal(game.threadAction({threadId:'borrowed_time',action:'advance'}).ok,true);assert.equal(record.stage,3);
 }
});

test('Rook public fallback and actual once-only spawn agree at3x the released position',()=>{
 const game=new Game('expanded-rook-target'),record=game.state.narrative.quests.paper_bounty=activeRecord(game,2);
 const fallback=game.narrativeBoard().active.find(thread=>thread.id==='paper_bounty').target;
 assert.equal(fallback.x,4380);assert.equal(fallback.y,2280);
 game.syncNarrativeWorld();game.syncNarrativeWorld();
 const contacts=game.system.enemies.filter(enemy=>enemy.id===record.targetId);assert.equal(contacts.length,1);
 const enemy=contacts[0];assert.equal(enemy.x,1460*3);assert.equal(enemy.y,760*3);
 assert.deepEqual({classId:enemy.classId,hp:enemy.hp,maxHp:enemy.maxHp,speed:enemy.speed,damage:enemy.damage,reward:enemy.reward},{classId:'kestrel',hp:72,maxHp:72,speed:92,damage:6,reward:0});
 const live=game.narrativeBoard().active.find(thread=>thread.id==='paper_bounty').target;
 assert.equal(live.enemyId,enemy.id);assert.equal(live.x,enemy.x);assert.equal(live.y,enemy.y);
});

test('ferry prices and carried-passenger identities, fares and tips equal independent0.10 quotes',()=>{
 for(const old of baseline.passengers){
  const game=new Game(old.seed);game.state.systemId=old.systemId;game._loadSystem(old.systemId);
  const body=game.system.bodies.find(body=>body.id===old.bodyId);game.state.mode='person';game.state.locationId=body.id;game.state.interior=null;game.state.pendingEncounter=null;
  Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+75,vx:0,vy:0});
  assert.deepEqual(game.passengerRoutes().map(quote=>({id:quote.bodyId,fare:quote.fare})),old.ferries,`${old.seed}/${old.systemId}: ferry tariffs`);
  assert.deepEqual(game.passengerOffers().map(offer=>({id:offer.id,targetBody:offer.targetBody,name:offer.name,type:offer.type,fare:offer.fare,bonus:offer.bonus})),old.offers,`${old.seed}/${old.systemId}: carried passengers`);
 }
});
