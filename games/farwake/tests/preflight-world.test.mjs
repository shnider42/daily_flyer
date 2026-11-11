import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {advanceWorldDirector} from '../dist/world-director.mjs';

function arrive(game,bodyId){
 const body=game.system.bodies.find(body=>body.id===bodyId);assert.ok(body);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});
 const answer=game.dock(body.id);assert.equal(answer.ok,true,answer.reason);return body;
}

test('the preflight settlement supports private landing without inventing modern port services',()=>{
 const game=new Game('preflight-service-check');game.state.systemId='greenwake';game._loadSystem('greenwake');
 arrive(game,'greenwake-depot');
 assert.equal(game.passengerQuote('reedbank').ok,false,'there is no commercial ferry to the village');
 assert.ok(game.npcContractOffers().every(offer=>!offer.routeName?.includes('Reedbank')));
 assert.equal(game.quickLaunch().ok,true);arrive(game,'reedbank');
 const credits=game.state.credits,shipId=game.state.ship.id,surface=generateSurface(game.currentBody,game.state.seed);
 assert.equal(game.atInhabitedPort,false);assert.deepEqual(game.passengerRoutes(),[]);assert.deepEqual(game.availableJobs(),[]);
 assert.ok(game.npcContractOffers().every(offer=>offer.available===false));
 assert.equal(game.acceptNpcContract('cargo').ok,false);assert.equal(game.buyShip('mule').ok,false);
 assert.equal(game.service('repair').ok,false);assert.equal(game.enlistProfession({professionId:'doctor'}).ok,false);
 assert.equal(game.state.credits,credits);assert.equal(game.state.ship.id,shipId);
 assert.ok(surface.entities.some(entity=>entity.type==='npc'&&entity.data?.techLevel==='preflight'));
 assert.ok(!surface.entities.some(entity=>['jobboard','mechanic','medic','station','work'].includes(entity.type)||entity.data?.professionDesk));
 assert.equal(game.quickLaunch().ok,true,'the captain can still return to the ship they landed');
});

test('modern dispatch events never target a preflight-only population',()=>{
 const game=new Game('preflight-director'),system=game.galaxy.find(system=>system.id==='greenwake');
 const nativeSystem={...system,bodies:system.bodies.filter(body=>body.id==='reedbank')};
 let director=null;
 for(let elapsed=0;elapsed<=40000;elapsed+=1000){
  const result=advanceWorldDirector(director,elapsed,{seed:'preflight-director',systems:[nativeSystem]});director=result.state;
  assert.deepEqual(result.spawns,[]);assert.deepEqual(director.events,[]);assert.deepEqual(director.history,[]);
 }
});
