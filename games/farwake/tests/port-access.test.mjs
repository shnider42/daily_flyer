import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {NAMED_SYSTEMS} from '../dist/content.mjs';
import {FRONTIER_SYSTEMS} from '../dist/galaxy-expansion.mjs';
import {FACTION_PORTS,appendFactionPorts} from '../dist/port-content.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {releasedBody} from './helpers/world-type-projection.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
function arrive(game,systemId,bodyId,{person=false}={}){
 game.state.systemId=systemId;game._loadSystem(systemId);game.state.pendingEncounter=null;
 const body=game.system.bodies.find(value=>value.id===bodyId);assert.ok(body);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+80,vx:0,vy:0});
 Object.assign(game.state,{mode:person?'person':'ship',locationId:person?bodyId:null,interior:null});
 if(person)game._arriveAsPassenger(body,{discovery:false});
 return body;
}
function enlist(game){
 const desk=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.find(entity=>entity.data?.professionDesk);assert.ok(desk);
 Object.assign(game.state.person,{x:desk.x,y:desk.y});
 return ok(game.enlistProfession({professionId:'military',entityId:desk.id}));
}
const publicOrigin={brindle:'orchard',nacre:'ward',sable:'tallow',vesper:'lilt',cinder:'kiln'};

test('five service bases append without changing the identities or order of any established body',()=>{
 const chart=buildGalaxy('port-regression');assert.equal(chart.length,901);
 for(const original of [...NAMED_SYSTEMS,...FRONTIER_SYSTEMS]){
  const system=chart.find(value=>value.id===original.id);assert.ok(system);
  assert.deepEqual(system.bodies.slice(0,original.bodies.length).map(body=>releasedBody(body,{authored:true})),original.bodies,original.id);
 }
 const allIds=chart.flatMap(system=>system.bodies.map(body=>body.id));
 for(const port of FACTION_PORTS){
  assert.equal(allIds.filter(id=>id===port.id).length,1);
  const system=chart.find(value=>value.id===port.systemId),body=system.bodies.at(-1);
  assert.equal(body.id,port.id);assert.equal(body.portType,'military');assert.equal(body.faction,port.faction);
 }
 const before=JSON.stringify(chart),again=appendFactionPorts(chart);
 assert.equal(JSON.stringify(chart),before,'Appending does not mutate the supplied chart.');
 assert.deepEqual(again,chart,'Restoring or applying expansion twice does not create duplicate bases.');
 assert.equal(new Set(FACTION_PORTS.map(port=>port.faction)).size,5);
});

test('every military dock refuses civilian entry without changing ship, perspective, money or discovery',()=>{
 for(const port of FACTION_PORTS){
  const game=new Game(`port-denied:${port.id}`);arrive(game,port.systemId,port.id);
  const before={ship:structuredClone(game.state.ship),mode:game.state.mode,location:game.state.locationId,credits:game.state.credits,visited:[...game.state.visited],dockings:game.state.stats.dockings};
  const result=game.dock(port.id);assert.equal(result.ok,false);assert.equal(result.code,'military-clearance');
  assert.deepEqual({ship:game.state.ship,mode:game.state.mode,location:game.state.locationId,credits:game.state.credits,visited:game.state.visited,dockings:game.state.stats.dockings},before);
 }
});

test('ordinary and shipless captains cannot buy their way around base clearance on the passenger ferry',()=>{
 for(const startMode of ['regular','hardcore'])for(const port of FACTION_PORTS){
  const game=new Game(`port-ferry:${startMode}:${port.id}`,{startMode});arrive(game,port.systemId,publicOrigin[port.systemId],{person:true});
  game.state.credits=10000;
  const before={credits:game.state.credits,location:game.state.locationId,mode:game.state.mode,journeys:structuredClone(game.state.livelihoods.journeys),ship:structuredClone(game.state.ship)};
  assert.equal(game.passengerQuote(port.id).code,'military-clearance');
  assert.equal(game.takePassengerTransit(port.id).code,'military-clearance');
  assert.deepEqual({credits:game.state.credits,location:game.state.locationId,mode:game.state.mode,journeys:game.state.livelihoods.journeys,ship:game.state.ship},before);
  const displayed=game.passengerRoutes().find(route=>route.bodyId===port.id);assert.ok(displayed);assert.equal(displayed.ok,false);
 }
});

test('real faction enlistment permits that faction’s berths, with hostile standing suspending both approaches',()=>{
 const game=new Game('service-base-entry');arrive(game,'nacre','ward',{person:true});enlist(game);
 const base=game.system.bodies.find(body=>body.id==='bastion-yard');ok(game.portAccess(base));
 const foreign=game.galaxy.find(system=>system.id==='brindle');
 assert.equal(game.portAccess(foreign.bodies.find(body=>body.id==='common-watch'),foreign).code,'military-clearance');
 game.state.rep.concord=-25;assert.equal(game.passengerQuote(base.id).code,'military-standing');
 const before=game.state.credits;assert.equal(game.takePassengerTransit(base.id).code,'military-standing');assert.equal(game.state.credits,before);
 arrive(game,'nacre',base.id);assert.equal(game.dock(base.id).code,'military-standing');
 game.state.rep.concord=-24;ok(game.dock(base.id));assert.equal(game.state.locationId,base.id);assert.equal(game.state.mode,'person');
 const restored=Game.fromSave(game.save());ok(restored.portAccess(restored.currentBody));
});

test('serving captains pay the quoted fare while Bastion’s hospital remains open to civilians',()=>{
 const game=new Game('service-ferry',{startMode:'hardcore'});arrive(game,'nacre','ward',{person:true});
 ok(game.passengerQuote('bastion'));const initial=game.state.credits;ok(game.takePassengerTransit('bastion'));assert.ok(game.state.credits<initial);
 assert.equal(game.currentBody.id,'bastion');enlist(game);
 const quote=ok(game.passengerQuote('bastion-yard')),credits=game.state.credits;
 ok(game.takePassengerTransit('bastion-yard'));assert.equal(game.state.credits,credits-quote.fare);assert.equal(game.currentBody.id,'bastion-yard');
 assert.equal(game.ownsShip,false,'Base access and hiring do not mint an unclaimed ship.');
});

test('civilian fare and NPC work boards never assign an inaccessible military destination',()=>{
 for(const port of FACTION_PORTS){
  const game=new Game(`accessible-work:${port.id}`);arrive(game,port.systemId,publicOrigin[port.systemId],{person:true});
  let fares=0,work=0;
  for(let serial=0;serial<50;serial++){
   game.state.narrative.passengerSerial=serial;game.state.npcContractSerial=serial;
   for(const offer of game.passengerOffers()){
    fares++;assert.notEqual(offer.targetBody,port.id);
    ok(game.portAccess(game.system.bodies.find(body=>body.id===offer.targetBody)));
   }
   for(const offer of game.npcContractOffers()){
    work++;assert.notEqual(offer.destinationId,port.id);
    if(offer.destinationId)ok(game.portAccess(game.system.bodies.find(body=>body.id===offer.destinationId)));
   }
  }
  assert.ok(fares>0&&work>0,'Access filtering does not leave the public work boards empty.');
 }
});

test('on-foot recovery does not turn an expired service clearance into a free base landing',()=>{
 const game=new Game('recovery-access',{startMode:'hardcore'});arrive(game,'nacre','bastion-yard',{person:true});
 game.state.person.health=0;game.state.person.down=true;game.state.lastBodyId='bastion-yard';
 ok(game.recoverOnFoot());assert.notEqual(game.state.locationId,'bastion-yard');ok(game.portAccess(game.currentBody));
 assert.equal(game.ownsShip,false);assert.ok(game.state.person.health>0);
});
