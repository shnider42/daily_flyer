import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { advanceShip, getShipClass } from '../dist/fleet.mjs';
import { FarwakeNetwork } from '../dist/network.mjs';
import { correctedPose } from '../dist/prediction.mjs';
import { SpaceRenderer, systemRadarRange } from '../dist/space-art.mjs';
import { createNpcContract } from '../dist/npc-contracts.mjs';
import { syncDirectorWorld } from '../dist/world-director.mjs';
import { LEGACY_WORLD_RADIUS, WORLD_RADIUS, SYSTEM_SPACE_SCALE } from '../dist/system-space.mjs';

const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const coast={flightAssist:false};
const shipAt=(x,y=0)=>({...getShipClass('sparrow').stats,id:'expanded-flight',classId:'sparrow',x,y,vx:100,vy:0,angle:0,angularVelocity:0,energy:100});
const landed=seed=>{
 const game=new Game(seed),body=game.system.bodies.find(body=>body.id==='kettle');
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+75,vx:0,vy:0});
 assert.equal(game.dock(body.id).ok,true);
 return game;
};

test('flight and correction cross the old edge, stop at the new edge, and honor explicit smaller worlds',()=>{
 const ship=shipAt(LEGACY_WORLD_RADIUS+500);
 assert.ok(advanceShip(ship,.1,coast).x>ship.x);
 assert.equal(advanceShip(shipAt(WORLD_RADIUS-1),.1,coast).x,WORLD_RADIUS);
 assert.equal(advanceShip(shipAt(LEGACY_WORLD_RADIUS-1),.1,coast,{worldRadius:LEGACY_WORLD_RADIUS}).x,LEGACY_WORLD_RADIUS);
 assert.equal(correctedPose(ship,{x:20}).x,ship.x+20);
 assert.equal(correctedPose(shipAt(WORLD_RADIUS-1),{x:20}).x,WORLD_RADIUS);
});

test('network replay retains expanded bounds through compact motion updates',()=>{
 let now=0;
 const network=new FarwakeNetwork({url:'http://test',storage:null,autoReconnect:false,now:()=>now,wallNow:()=>1000+now});
 const ship=shipAt(4000),packet={tick:1,serverTime:1000,ack:0,state:{mode:'ship',systemId:'hearth',ship},room:{id:'system:hearth',kind:'system'},world:{radius:WORLD_RADIUS,width:WORLD_RADIUS*2,height:WORLD_RADIUS*2,bodies:[]},events:[]};
 network._snapshot(packet,true);network.setInput(coast);
 now=100;network.predictShip(.1,coast);
 near(network.predictedShip.x,advanceShip(ship,.1,coast).x);
 assert.ok(network.renderedShip.x>4000);
 const authority=advanceShip(ship,.1,coast);
 network._snapshot({...packet,partial:true,tick:2,serverTime:1100,state:{ship:authority},world:{}});
 assert.equal(network.world.radius,WORLD_RADIUS);
 now=150;network.predictShip(.05,coast);
 assert.ok(network.predictedShip.x>authority.x);
 assert.equal(network._radius(),WORLD_RADIUS);
 network.world={};assert.equal(network._radius(),WORLD_RADIUS);
 network.world={radius:LEGACY_WORLD_RADIUS};assert.equal(network._radius(),LEGACY_WORLD_RADIUS);
});

test('radar keeps relative system coverage while physical contacts stay their original size',()=>{
 const marks=[],ctx={canvas:{width:200,height:154},fillStyle:'',clearRect(){},fillRect(x,y,w,h){if(this.fillStyle==='#8bbfb5')marks.push({x,y,w,h});}};
 const renderer=new SpaceRenderer(),game={state:{ship:{x:0,y:0,angle:0}},system:{radius:WORLD_RADIUS,bodies:[{id:'outer-port',kind:'station',x:4500,y:0},{id:'beyond-radar',kind:'station',x:6500,y:0}]}};
 renderer.radar(ctx,game);
 assert.equal(marks.length,1,'The outer port remains charted; a contact beyond radar coverage is still omitted.');
 assert.equal(marks[0].w,5);assert.equal(marks[0].h,5);assert.ok(marks[0].x>140);
 assert.equal(systemRadarRange(game.system),5700);
 marks.length=0;game.system.radius=LEGACY_WORLD_RADIUS;renderer.radar(ctx,game);
 assert.equal(marks.length,0);assert.equal(systemRadarRange(game.system),1900);
});

test('new outer-system crew routes use real destination berths and preserve local approach distances',()=>{
 const game=landed('expanded-contract-routes');
 const origin=game.system.bodies.find(body=>body.id==='kettle'),destination=game.system.bodies.find(body=>body.id==='morrow');
 game.system.bodies=[origin,destination];
 Object.assign(origin,{x:4000,y:3000});Object.assign(destination,{x:6500,y:3000});
 const legacy=createNpcContract(game,'medic');assert.equal(legacy.ok,true);
 near(Math.hypot(legacy.contract.dockPoint.x-origin.x,legacy.contract.dockPoint.y-origin.y),origin.radius+75);
 assert.ok(legacy.contract.workPoint.x>6000,'Legacy watch must not be pulled back inside the former2350m route boundary.');
 near(legacy.contract.workPoint.x,destination.x-destination.radius-250);
 const modern=createNpcContract(game,'cargo');assert.equal(modern.ok,true);
 near(Math.hypot(modern.contract.workPoint.x-destination.x,modern.contract.workPoint.y-destination.y),destination.radius+75);
 assert.equal(modern.contract.destination.bodyId,destination.id);
 assert.ok(modern.contract.workPoint.x>6000);
 assert.equal(modern.ship.speed,getShipClass(modern.ship.classId).stats.speed);
});

test('outer-port crises and profession contacts remain near their named port and spawn only once',()=>{
 const game=new Game('expanded-port-events'),body=game.system.bodies.find(body=>body.id==='kettle');
 Object.assign(body,{x:5000,y:3500});
 const event={id:'outer-raid',systemId:game.state.systemId,bodyId:body.id,bodyName:body.name,factionId:'freewake',rivalFactionId:'cinder',type:'raid',status:'active',spawnIds:['outer-raid:0','outer-raid:1'],neutralized:[]};
 const director={events:[event]};
 syncDirectorWorld(game,director);syncDirectorWorld(game,director);
 const enemies=game.system.enemies.filter(enemy=>enemy.directorEventId===event.id),watch=game.system.traffic.filter(contact=>contact.directorEventId===event.id);
 assert.equal(enemies.length,2);assert.equal(watch.length,1);
 for(const enemy of enemies)near(Math.hypot(enemy.x-body.x,enemy.y-body.y),body.radius+450);
 assert.equal(watch[0].x,body.x+320);assert.equal(watch[0].y,body.y-240);
 game.state.professions.active={id:'outer-warrant',professionId:'law',phase:'intercept',targetSystem:game.state.systemId,targetBody:body.id,targetId:'outer-warrant:target',factionId:'freewake'};
 assert.equal(game.syncProfessionWorld(),true);assert.equal(game.syncProfessionWorld(),false);
 const target=game.system.enemies.find(enemy=>enemy.id==='outer-warrant:target');
 assert.equal(target.x,body.x+body.radius+420);assert.equal(target.y,body.y+310);
});

test('distance-based passenger fares and seeded crew wages remain stable when system spacing grows',()=>{
 const game=landed('expanded-fare-parity');
 const expandedQuotes=game.passengerRoutes().map(quote=>({id:quote.bodyId,fare:quote.fare}));
 const expandedWages=game.npcContractOffers().map(offer=>({id:offer.offerId,reward:offer.reward}));
 for(const body of game.system.bodies){body.x/=SYSTEM_SPACE_SCALE;body.y/=SYSTEM_SPACE_SCALE;}
 game.system.radius=LEGACY_WORLD_RADIUS;
 assert.deepEqual(game.passengerRoutes().map(quote=>({id:quote.bodyId,fare:quote.fare})),expandedQuotes);
 assert.deepEqual(game.npcContractOffers().map(offer=>({id:offer.offerId,reward:offer.reward})),expandedWages);
});
