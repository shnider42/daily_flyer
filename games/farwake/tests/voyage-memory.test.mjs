import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, distance } from '../dist/engine.mjs';
import { cabinLayout, getShipClass } from '../dist/fleet.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { gunneryOrigin } from '../dist/gunnery.mjs';
import { MILITARY_RECRUITER } from '../dist/military-content.mjs';
import { placeRaider } from './helpers/combat-fixtures.mjs';

const ok = result => { assert.equal(result?.ok, true, result?.reason); return result; };
const ids = people => people.map(person => person.id).sort();
const tick = (game, seconds) => { for (let n=0;n<Math.ceil(seconds*10);n++) game.step(.1,{}); };
function system(game,id) { if(game.state.systemId!==id){game._persistRuntime();game.state.systemId=id;game._loadSystem(id);} }
function at(game,systemId,bodyId,{ship=false}={}) { system(game,systemId);const body=game.system.bodies.find(body=>body.id===bodyId);if(ship)Object.assign(game.state.ship,{x:body.x+body.radius+70,y:body.y,dockedAt:body.id,vx:0,vy:0});game._arriveAsPassenger(body);return body; }
function fresh(seed='voyage-eight') { const game=new Game(seed,{startMode:'casual',startContext:'solo',casualCrewCount:8});at(game,'hearth','morrow',{ship:true});game.state.pendingEncounter=null;return game; }
function recruiter(game) { const entity=generateSurface(game.currentBody,game.state.seed,game.state.flags).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);assert.ok(entity);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity.id; }
function enlist(game) { ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter(game)})); }
function finishFirstWatch(game) {
  ok(game.militaryCareerAction({action:'start',entityId:recruiter(game)}));
  Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.security);
  for(let n=0;n<5000&&game.state.npcContract?.phase!=='docked';n++){
    if(game.gunneryStatus().available&&!game.gunneryStatus().active)ok(game.enterGunnery());
    const target=game.system.enemies.find(enemy=>game.state.npcContract.navy.targetIds.includes(enemy.id)&&enemy.hp>0&&!enemy.disabled),input={};
    if(target){const origin=gunneryOrigin(game.state.ship),travel=distance(target,origin)/650,dx=target.x+(target.vx||0)*travel-origin.x,dy=target.y+(target.vy||0)*travel-origin.y,length=Math.hypot(dx,dy);Object.assign(input,{aiming:true,aimX:dx/length,aimY:dy/length,fire:true});}
    game.step(.1,input);
  }
  assert.equal(game.state.npcContract?.phase,'docked');ok(game.completeNpcContract());
  ok(game.militaryCareerAction({action:'debrief',entityId:recruiter(game)}));
}
function crosswindLoss(game) { system(game,'crosswind');Object.assign(game.state,{mode:'ship',locationId:null,interior:null});game.state.ship.shield=0;game._damageShip(99999,{sourceId:'known-fixture-impact'}); }
function flyHome(game) { for(let n=0;n<5500&&game.state.npcContract?.phase!=='docked';n++)game.step(.1,{});assert.equal(game.state.npcContract?.phase,'docked');ok(game.completeNpcContract()); }
function boarding(seed) {
  const game=fresh(seed);enlist(game);system(game,'crosswind');game.state.mode='ship';game.state.locationId=null;
  const target=placeRaider(game,{classId:'ark',name:'Recorded enemy carrier',faction:'meridian',x:90,y:450,hp:300,maxHp:920,disabled:true,active:false,cooldown:999});
  Object.assign(game.state.ship,{x:0,y:450,vx:0,vy:0,shield:0,dockedAt:null});game.system.enemies=[target];ok(game.boardEnemy(target.id));
  return {game,target,action:game.state.boarding};
}

test('eight named crew survive a completed Navy watch, real hull evacuation, physical passage home and an idempotent saved debrief',()=>{
  let game=fresh(),crew=structuredClone(game.state.crew);assert.equal(crew.length,8);
  game.state.crew[0].health=37;game.state.crew[0].status='injured';crew=structuredClone(game.state.crew);enlist(game);
  finishFirstWatch(game);
  assert.equal(game.state.professions.careers.military.completed,1);assert.deepEqual(ids(game.state.crew),ids(crew));assert.equal(game.state.crew.find(person=>person.id===crew[0].id).health,37);
  const career=structuredClone(game.state.professions.careers.military),hullId=game.state.ship.id;
  crosswindLoss(game);
  const report=game.recoveryReport(),incidentId=report.id;
  assert.equal(report.source.systemId,'crosswind');assert.match(report.source.name,/Crosswind/);assert.equal(report.ship.id,hullId);assert.equal(report.losses.shipLost,true);
  assert.deepEqual(ids(game.recoveredCrewAt()),ids(crew));assert.equal(game.recoveredCrewAt().find(person=>person.id===crew[0].id).health,37);assert.equal(game.ownsShip,false);
  assert.equal(report.service.factionId,'freewake');assert.equal(report.home.bodyId,'morrow');
  tick(game,7);ok(game.startMilitaryPassage());
  const transportId=game.state.ship.id,passengers=game.state.crew.filter(person=>person.recoveredPassenger);
  assert.equal(game.state.ship.classId,'osprey');assert.equal(passengers.length,8);assert.equal(game.state.crew.length+1,getShipClass('osprey').berths);assert.deepEqual(ids(passengers),ids(crew));
  assert.ok(passengers.every(person=>person.role==='passenger'&&!person.serviceCrew));assert.equal(game.freeBerths,0);assert.equal(game.recoveredCrewAt('crosswind-vey','crosswind').length,0);
  const deck=generateSurface(game.currentBody,game.state.seed,game.state.flags),actors=deck.entities.filter(entity=>entity.type==='crew');
  assert.equal(actors.length,9);assert.equal(new Set(actors.map(actor=>`${actor.x},${actor.y}`)).size,9);assert.ok(actors.every(actor=>isWalkable(deck,actor.x,actor.y)));
  tick(game,6);game=Game.fromSave(game.save());assert.equal(game.state.ship.id,transportId);assert.deepEqual(ids(game.state.crew.filter(person=>person.recoveredPassenger)),ids(crew));assert.equal(game.state.crew.find(person=>person.id===crew[0].id).health,37);
  flyHome(game);
  assert.equal(game.state.systemId,'hearth');assert.equal(game.state.locationId,'morrow');assert.deepEqual(ids(game.recoveredCrewAt()),ids(crew));assert.equal(game.recoveredCrewAt().find(person=>person.id===crew[0].id).health,37);
  assert.equal(game.recoveryReport().id,incidentId);assert.equal(game.recoveryReport().arrival.arrived,true);assert.deepEqual(game.state.professions.careers.military,career);
  const credits=game.state.credits,rescues=game.state.stats.rescues;ok(game.acknowledgeRecoveryReport(incidentId));assert.equal(game.acknowledgeRecoveryReport(incidentId).ok,false);
  game=Game.fromSave(game.serialize());assert.equal(game.recoveryReports().length,1);assert.equal(game.recoveryReport().arrival.acknowledged,true);assert.equal(game.state.credits,credits);assert.equal(game.state.stats.rescues,rescues);assert.equal(game.state.npcContractHistory.filter(row=>row.repatriation).length,1);
  assert.equal(game.rejoinRecoveredCrew(game.state.voyageMemory.recoveredCrews[0].id).ok,false,'A passenger does not receive a replacement hull.');
});

test('victory after captain incapacitation retains the actual winning outcome, last attacker and eight rescued boarding allies',()=>{
  const {game,action}=boarding('won-but-down');game.state.crew[0].health=37;game.state.crew[0].status='injured';
  game.state.person.health=0;game.state.person.down=true;game.state.person.lastInjury={boardingId:action.id,actorName:'Military boarding trooper',at:game.state.stats.time};
  for(const guard of action.enemies)guard.health=0;game._finishBoarding('won');
  const report=game.recoveryReport();assert.equal(report.boarding.phase,'won');assert.match(report.cause,/Military boarding trooper/);assert.match(report.cause,/secured the target/);assert.doesNotMatch(report.cause,/defeat/);assert.equal(report.losses.shipLost,false);assert.equal(game.ownsShip,true);
  assert.equal(report.crew.filter(person=>person.participated).length,8);assert.equal(game.recoveredCrewAt().length,8);assert.equal(game.state.crew.length,0);assert.equal(game.state.ship.casualCrew,undefined);
  const restored=Game.fromSave(game.save());assert.deepEqual(restored.recoveryReport().boarding,report.boarding);assert.equal(restored.recoveryReports().length,1);assert.equal(restored.recoveredCrewAt().find(person=>person.health===37)?.id,report.crew.find(person=>person.health===37)?.id);
});

test('boarding defeat preserves confirmed deaths as memorials and survivors retain their original roster and wounds',()=>{
  const {game,action}=boarding('lost-with-casualty'),dead=game.state.crew[1],wounded=game.state.crew[0];wounded.health=31;
  game._damageCrew(dead.id,9999,'Recorded guard fire');game.state.person.health=0;game.state.person.down=true;game._finishBoarding('lost');
  const report=game.recoveryReport();assert.equal(report.boarding.phase,'lost');assert.equal(report.losses.shipLost,false);assert.equal(game.recoveredCrewAt().length,7);assert.equal(report.crew.find(person=>person.id===dead.id).status,'dead');assert.ok(game.state.memorial.some(row=>row.crewId===dead.id));
  assert.equal(game.recoveredCrewAt().find(person=>person.id===wounded.id).health,31);assert.equal(action.enemies.some(person=>person.health>0),true);
  const group=game.state.voyageMemory.recoveredCrews[0];at(game,'hearth','morrow',{ship:true});assert.equal(game.rejoinRecoveredCrew(group.id).ok,false,'A remote hospital party cannot teleport aboard at Morrow.');
  at(game,'crosswind','crosswind-vey',{ship:true});assert.equal(game.rejoinRecoveredCrew(group.id).ok,false,'A field aid post is not an invented commercial berth.');
});

test('an intact employer watch keeps its separate company and named personal crew at their real berth',()=>{
  const game=fresh('company-distinction'),personal=structuredClone(game.state.crew);enlist(game);ok(game.militaryCareerAction({action:'start',entityId:recruiter(game)}));
  const serviceIds=ids(game.state.crew),serviceShip=game.state.ship.id;system(game,'crosswind');game.state.person.health=0;game.state.person.down=true;
  ok(game.recoverMedicalCasualty());const report=game.recoveryReport();
  assert.equal(report.ship.id,serviceShip);assert.equal(report.ship.personal,false);assert.equal(report.losses.shipLost,false);assert.deepEqual(ids(game.state.crew),ids(personal));assert.equal(game.recoveredCrewAt().length,0);
  assert.ok(report.crew.filter(row=>row.personal).every(row=>row.status==='waiting'&&row.location.systemId==='hearth'&&row.location.bodyId==='morrow'));
  assert.ok(report.crew.filter(row=>!row.personal).every(row=>row.status==='aboard'));assert.deepEqual(ids(report.crew.filter(row=>!row.personal)),serviceIds);
  assert.equal(game.crewWhereabouts().groups.find(group=>group.kind==='personal').location.bodyId,'morrow');
});

test('a second transport casualty rescues the same wounded passengers and never leaves duplicate actors on its hull',()=>{
  let game=fresh('interrupted-homeward');enlist(game);const original=ids(game.state.crew);crosswindLoss(game);tick(game,7);ok(game.startMilitaryPassage());
  const transport=game.state.ship,inventory=game.state.crew,wounded=inventory.find(person=>person.recoveredPassenger);wounded.health=24;
  game._recoveryTimer=0;transport.shield=0;game._damageShip(99999);
  assert.deepEqual(ids(game.recoveredCrewAt()),original);assert.equal(game.recoveredCrewAt().find(person=>person.id===wounded.id).health,24);assert.ok(inventory.every(person=>!person.recoveredPassenger));assert.equal(game.recoveryReports().length,2);
  const old=game.recoveryReports()[1];assert.equal(old.evacuation,null);game=Game.fromSave(game.save());assert.equal(game.recoveryReports().length,2);assert.deepEqual(ids(game.recoveredCrewAt()),original);
});

test('reunion needs an actual fitting hull at the same port and never revives stale positive-health tombstones',()=>{
  const game=fresh('reunion-capacity'),people=game.state.crew,deadId=people[1].id;people[0].health=38;people[1].dead=true;
  const casualty=game.beginRecoveryIncident({sourceKind:'ship-destroyed'}),destination={systemId:'hearth',bodyId:'morrow',name:'Morrow'};
  const group=game.evacuatePersonalCrew(destination,{incidentId:casualty.id});game.completeRecoveryIncident({incidentId:casualty.id,destination});
  assert.equal(group.crew.length,7);assert.ok(game.state.memorial.some(row=>row.crewId===deadId));
  game._activateClass('sparrow',false);assert.equal(game.rejoinRecoveredCrew(group.id).code,'capacity');
  game._activateClass('osprey',false);game.state.pendingEncounter=null;ok(game.rejoinRecoveredCrew(group.id));assert.equal(game.state.crew.length,7);assert.equal(game.state.crew.find(person=>person.health===38)?.id,group.crew[0].id);assert.equal(game.state.voyageMemory.recoveredCrews.length,0);assert.equal(game.rejoinRecoveredCrew(group.id).ok,false);
  const restored=Game.fromSave(game.save());assert.equal(restored.state.crew.length,7);assert.equal(restored.state.crew.some(person=>person.dead),false);assert.equal(restored.casualCrewStatus().lostCount,1);
});

test('legacy receipts are backfilled once with unknown crew facts and bounded reports retain no new death rewards',()=>{
  const game=fresh('legacy-receipt');game.state.person.health=0;ok(game.recoverMedicalCasualty());const raw=game.save();delete raw.voyageMemory;
  let restored=Game.fromSave(raw);assert.equal(restored.recoveryReports().length,1);assert.equal(restored.recoveryReport().legacy,true);assert.deepEqual(restored.recoveryReport().crew,[]);assert.ok(restored.recoveryReport().unknowns.length);const credits=restored.state.credits;
  restored=Game.fromSave(restored.save());assert.equal(restored.recoveryReports().length,1);assert.equal(restored.state.credits,credits);
  for(let n=0;n<20;n++){const incident=restored.beginRecoveryIncident({key:`factual-${n}`,sourceKind:'medical-casualty',crew:[]});restored.completeRecoveryIncident({incidentId:incident.id,destination:{systemId:'hearth',bodyId:'morrow',name:'Morrow'},silent:true});}
  assert.equal(restored.recoveryReports().length,12);assert.equal(restored.state.credits,credits);
  const malformed=restored.save();delete malformed.voyageMemory.incidents[0].arrival;delete malformed.voyageMemory.incidents[0].crew;assert.doesNotThrow(()=>Game.fromSave(malformed).recoveryReports());
});

test('casual reserves stay compact in recovery and a real transport leaves excess physical survivors accounted for at the pickup',()=>{
  const game=new Game('large-roster-recovery',{startMode:'casual',startContext:'solo',casualCrewCount:Number.MAX_SAFE_INTEGER});at(game,'hearth','morrow',{ship:true});game.state.pendingEncounter=null;enlist(game);
  assert.equal(game.state.crew.length,15);crosswindLoss(game);assert.equal(game.recoveredCrewAt().length,15);assert.equal(game.state.voyageMemory.recoveredCrews[0].casualCrew.records.length,15);
  tick(game,7);ok(game.startMilitaryPassage());assert.equal(game.state.ship.classId,'leviathan');assert.equal(game.state.crew.length,15);assert.equal(game.state.npcContract.recoveredPassengers.length,14);assert.equal(game.state.npcContract.waitingSurvivors,1);
  assert.equal(game.recoveredCrewAt('crosswind-vey','crosswind').length,1);assert.equal(game.crewWhereabouts().groups.find(group=>group.kind==='recovered').crew.length,15);
  assert.ok(JSON.stringify(game.state.voyageMemory).length<35000,'The selected virtual count never becomes a passenger array.');
});

test('a former Casual hull keeps a visible waiting manifest when command moves to another ship',()=>{
  const game=fresh('parked-casual-manifest'),crew=structuredClone(game.state.crew);system(game,'crosswind');game.state.mode='ship';game.state.locationId=null;
  const parked=game._parkCurrentVessel();game.state.ship={...structuredClone(parked),id:'another-owned-ship'};delete game.state.ship.casualCrew;game.state.crew=[];game._updateStats(false);
  const manifest=game.crewWhereabouts().groups.find(group=>group.id===`parked:${parked.id}`);assert.ok(manifest);assert.deepEqual(ids(manifest.crew),ids(crew));assert.equal(manifest.location.systemId,'crosswind');assert.ok(manifest.crew.every(person=>person.status==='waiting'));
  const incident=game.beginRecoveryIncident({sourceKind:'medical-casualty'});assert.deepEqual(ids(incident.crew),ids(crew));assert.ok(incident.crew.every(person=>person.location.vesselId===parked.id&&!person.participated));
});
