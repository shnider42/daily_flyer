import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGalaxy,Game} from '../dist/engine.mjs';
import {generateSurface,isWalkable,TILE} from '../dist/surface.mjs';
import {placeIdentity} from '../dist/world-identity.mjs';

function reachable(surface){
 const tile=surface.tileSize,index=(x,y)=>y*surface.cols+x,start=index(Math.floor(surface.spawn.x/tile),Math.floor(surface.spawn.y/tile)),seen=new Set([start]),pending=[start];
 for(const value of pending){const x=value%surface.cols,y=Math.floor(value/surface.cols);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,key=index(xx,yy);if(seen.has(key)||!isWalkable(surface,(xx+.5)*tile,(yy+.5)*tile))continue;seen.add(key);pending.push(key);}}
 return point=>seen.has(index(Math.floor(point.x/tile),Math.floor(point.y/tile)));
}
test('both rings have distinct inner landscapes and every resident, service and story object is reachable',()=>{
 const galaxy=buildGalaxy('habitats');assert.equal(galaxy.length,26);
 const maps=[];
 for(const id of ['ledger','still-berth']){
  const body=galaxy.flatMap(system=>system.bodies).find(body=>body.id===id),surface=generateSurface(body,'habitats'),canReach=reachable(surface);maps.push(surface);
  assert.equal(surface.ringHabitat,id);assert.equal(surface.outdoors,true);assert.match(placeIdentity(body).scale,/landscape/);
  assert.ok(canReach(surface.exit));assert.ok(surface.entities.some(entity=>entity.type==='mechanic'));assert.ok(surface.entities.some(entity=>entity.type==='jobboard'));
  for(const entity of surface.entities)assert.ok(canReach(entity),`${id}: ${entity.id} is reachable from the docking lift`);
  assert.ok(surface.tiles.some(row=>row.includes(TILE.GROUND)));assert.ok(surface.tiles.some(row=>row.includes(TILE.WATER)));
  assert.deepEqual(generateSurface(body,'habitats'),surface);
 }
 assert.notDeepEqual(maps[0].tiles,maps[1].tiles,'Still Berth has a sealed damaged district, rather than a palette swap.');
});

test('ring docking, position and work persist through an ordinary voyage save',()=>{
 const game=new Game('ring-voyage',{startMode:'casual',startSystemId:'meridian'}),body=game.system.bodies.find(body=>body.id==='ledger');
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+35});assert.equal(game.dock(body.id).ok,true);
 const surface=generateSurface(game.currentBody,game.state.seed);Object.assign(game.state.person,surface.spawn);
 const saved=game.save(),restored=Game.fromSave(saved);assert.equal(restored.state.locationId,'ledger');
 assert.deepEqual({x:restored.state.person.x,y:restored.state.person.y},{x:game.state.person.x,y:game.state.person.y});
 assert.ok(isWalkable(generateSurface(restored.currentBody,restored.state.seed),restored.state.person.x,restored.state.person.y));
});
