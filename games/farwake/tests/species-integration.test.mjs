import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {NAMED_SYSTEMS} from '../dist/content.mjs';
import {FRONTIER_SYSTEMS} from '../dist/galaxy-expansion.mjs';
import {SPECIES_HOMEWORLDS} from '../dist/species-content.mjs';
import {FACTION_PORTS} from '../dist/port-content.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import {SYSTEM_SPACE_SCALE} from '../dist/system-space.mjs';
import {releasedBody,releasedAsteroids,releasedSignals} from './helpers/world-type-projection.mjs';

const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const addedBodies=new Set([...SPECIES_HOMEWORLDS.map(entry=>entry.body.id),...FACTION_PORTS.map(port=>port.id)]);
const releasedBodies=bodies=>bodies.filter(body=>!addedBodies.has(body.id));
const ok=result=>{assert.equal(result.ok,true,result.reason);return result;};
// Derived independently from committed0.10 after verifying its unrounded data
// against all16 original0.7.1 signatures. Coordinates use released system units;
// six decimals avoid binary rounding noise from multiplying then dividing by3.
// The 0.39 identity changes were audited object-by-object against 0.38: all
// bodies, rocks, retained enemy fields and signal positions are unchanged.
// The nine revised signatures include only the deliberate smaller raider
// rosters, the seed-selected Cinder/Sable heavy contacts, and (for the first
// seed) Chorus signal6 becoming an ordinary survey under its quieter policy.
// The seven unaffected signatures remain byte-for-byte identical.
const physical={
  "species-compatibility": {
    "kindred": "5488985cfc8c68cd6e7c89eec68c87b40449f0f90b5bb08331d624f6e968273f",
    "brassfall": "69a4ce1c613eb8be1f4eb59401bd3a5c3877a2f2db7b441d43060340981e9693",
    "chorus": "18fa620eaa4d3db77ad43fde4c3327bf16ce38a39e51ca431d2b7d7f90ae7ca7",
    "brindle": "454c85a4a65f592efa014cb059dcc339410bb9cad583e2691738d924fb4a70ea",
    "nacre": "caab4d8125b3e7b616d1690b8e573bb1aedd07f2d1b2e987939013cea5fd0b0e",
    "sable": "85cf93a5ab3d8a5880739e38534f4d3bc61efa87bbcab6c4e4b873a6aaa71b43",
    "vesper": "a68e870fb57e1345fe10b5619a6492236b8b13a1fd6ba7807480b05cd9f51908",
    "cinder": "f3d07bd2569986094dcddd2e4146d62e6aae81b6fd720d40dc0f343123004963"
  },
  "farwake": {
    "kindred": "6f1f64f7a4d92b8db5760b19226b5bc7a0261f99bf46cf0f757078cd73bb7601",
    "brassfall": "da4e005b09d6d7b7ae1823a0724217968bd8091c5d6c0953dda4da7c5027e3d5",
    "chorus": "2f94f4386a9d05c80a5e50a43ab953b1992a7ed8e5a847840c1dbb2a9eef6648",
    "brindle": "cc0fa73e15860f14b0117ace8eb6c3bae41c4891cb7b6db6ee6a881535488d40",
    "nacre": "0919f08cf7c7260e3b2bf279c1d35a13853bc0168c943b98146f6fddbd4ce241",
    "sable": "62d7e6e9a7377d3ad0b71d51746e0331b46d787f55134a46138affcc04cbb7be",
    "vesper": "d6be9ef19329d7dab5fa8cb3ef85cc87d454be0e9e3624dbb7f99205dcb2329d",
    "cinder": "60e2387da0db778cbbe6c279ea7f14add7510b0e590df607cbd33e402dbb813a"
  }
};

test('the compact chart keeps every established species homeworld and older authored body',()=>{
 for(const seed of ['species-compatibility','farwake']){
  const galaxy=buildGalaxy(seed);
  assert.equal(galaxy.length,26);
  for(const original of [...NAMED_SYSTEMS,...FRONTIER_SYSTEMS]){
   const system=galaxy.find(value=>value.id===original.id);assert.ok(system,original.id);
   assert.deepEqual(system.bodies.slice(0,original.bodies.length).map(body=>releasedBody(body,{authored:true})),original.bodies,`${original.id}: authored people and destinations`);
  }
  for(const entry of SPECIES_HOMEWORLDS){
   const system=galaxy.find(value=>value.id===entry.systemId);
   assert.equal(system.bodies.filter(body=>body.id===entry.body.id).length,1);
   assert.equal(system.bodies.at(-1).id,entry.body.id);
  }
 }
});

test('population and traffic changes cannot consume other physical world random draws',()=>{
 for(const[seed,systems]of Object.entries(physical))for(const[systemId,expected]of Object.entries(systems)){
  const game=new Game(seed);game.state.systemId=systemId;game._loadSystem(systemId);
  // Traffic and place appearance intentionally vary. The complete physical
  // projection also fixes the reviewed local rosters and heavy encounters.
  const coordinates=items=>items.map(item=>({...item,x:Math.round(item.x/SYSTEM_SPACE_SCALE*1e6)/1e6,y:Math.round(item.y/SYSTEM_SPACE_SCALE*1e6)/1e6}));
  const projection=()=>({bodies:coordinates(releasedBodies(game.system.bodies).map(body=>releasedBody(body,{authored:game.currentSystem.authored,runtime:true}))),asteroids:coordinates(releasedAsteroids(game.system.asteroids)),enemies:coordinates(game.system.enemies),signals:coordinates(releasedSignals(game.system.signals))});
  assert.equal(checksum(projection()),expected);
  for(const body of game.system.bodies)generateSurface(body,seed);
  assert.equal(checksum(projection()),expected,'creating person views never mutates the space simulation');
 }
});

test('a recruited alien remains the same person on deck, during boarding, after reloading and in the memorial',()=>{
 let game=withHull(new Game('species-crew-life'),'hauler');game.state.credits=4000;
 const kettle=game.system.bodies.find(body=>body.id==='kettle');Object.assign(game.state.ship,{x:kettle.x,y:kettle.y+110});ok(game.dock(kettle.id));
 const crew=ok(game.recruitCrew('medic',{id:'medical-nai',name:'Nai Serin',species:'vaeli'})).crew;
 ok(game.launch());ok(game.enterCabin());
 const view=generateSurface(game.currentBody,game.state.seed).entities.find(entity=>entity.data?.crewId===crew.id);
 assert.equal(view.name,crew.name);assert.equal(view.species,'vaeli');assert.equal(view.data.species,'vaeli');
 Object.assign(game.state.person,game.currentBody?generateSurface(game.currentBody,game.state.seed).exit:{});ok(game.exitCabin());
 // Returning to the docked exterior and launching keeps the hired person's record.
 if(game.state.mode==='person')ok(game.launch());
 const enemy=placeRaider(game,{disabled:true,x:game.state.ship.x+65,y:game.state.ship.y});ok(game.boardEnemy(enemy.id));
 assert.equal(game.state.boarding.allies.find(actor=>actor.crewId===crew.id).species,'vaeli');
 game=Game.fromSave(game.save());
 assert.equal(game.state.crew.find(member=>member.id===crew.id).species,'vaeli');
 assert.equal(game.state.boarding.allies.find(actor=>actor.crewId===crew.id).species,'vaeli');
 game._damageCrew(crew.id,999,'Controlled boarding injury');
 const restored=Game.fromSave(game.save());
 assert.equal(restored.state.memorial.find(entry=>entry.crewId===crew.id).species,'vaeli');
 assert.equal(restored.state.memorial.find(entry=>entry.crewId===crew.id).name,crew.name);
});

test('ordinary alien dialogue adds optional background without replacing physical danger or changing standing',()=>{
 const game=new Game('people-dialogue');game.state.systemId='kindred';game._loadSystem('kindred');game.state.mode='person';game.state.locationId='avel';
 const surface=generateSurface('avel',game.state.seed),entity=surface.entities.find(person=>person.id==='avel:district:quay-host');
 const before=structuredClone(game.state.rep),intro=game.conversation(entity,{time:600,record:false});
 assert.equal(intro.species,'vaeli');assert.equal(intro.speciesLabel,'Vaeli');assert.ok(intro.background.length>20&&intro.background.length<=300);assert.match(intro.greeting,/towels/);
 assert.deepEqual(game.state.rep,before);
 game.state.boarding={phase:'active',enemies:[{health:20}],allies:[]};
 assert.notEqual(game.conversation(entity,{time:600,record:false}).context,'urgent','a battle on a different deck cannot interrupt this planet conversation');
 game.state.person.health=12;
 const urgent=game.conversation(surface.entities.find(person=>person.type==='medic'),{time:600,record:false});
 assert.equal(urgent.context,'urgent');assert.equal(urgent.background,'');
 assert.deepEqual(game.state.rep,before);
});

test('community advice is physical, remembered on return, and never turns a peaceful room into a fight',()=>{
 for(const[systemId,bodyId,siteId,residentId,option,expected]of[
  ['kindred','avel','threshold-house','room-steward','ramp',/ramp/i],
  ['brassfall','hadrun','repair-court','plate-keeper','restore',/restor|old pump|basin/i]
 ]){
  let game=new Game('people-return-'+bodyId,{startMode:'hardcore'});game.state.systemId=systemId;game._loadSystem(systemId);game.state.mode='person';game.state.locationId=bodyId;
  const outside=generateSurface(game.currentBody,game.state.seed),entrance=outside.entities.find(entity=>entity.data?.siteId===siteId);
  Object.assign(game.state.person,entrance);ok(game.enterSite(siteId));
  assert.equal(game.state.person.weaponDrawn,true,'the same ready weapon is available in a peaceful public room');
  assert.equal(game.state.exploration.encounter.monsters.length,0);game.drainEvents();game.stepExploration(.01,{});
  assert.ok(!game.drainEvents().some(event=>['person-shot','person-hit','monster-revealed'].includes(event.type)),'weapon readiness cannot start an encounter or fire by itself');
  let inside=generateSurface(game.currentBody,game.state.seed),speaker=inside.entities.find(entity=>entity.id.endsWith(':resident:'+residentId));
  assert.notEqual(game.conversation(speaker,{record:false}).context,'local-choice');
  const choice=inside.entities.find(entity=>entity.type==='siteChoice'),credits=game.state.credits;
  Object.assign(game.state.person,choice);ok(game.siteAction(choice.id,'choose',option));
  assert.equal(game.state.credits,credits);assert.equal(game.siteAction(choice.id,'choose',option).ok,false);
  game=Game.fromSave(game.save());game.drainEvents();game.stepExploration(.01,{});
  assert.ok(!game.drainEvents().some(event=>['person-shot','person-hit','monster-revealed'].includes(event.type)),'restoring transient weapon readiness keeps the room peaceful');
  inside=generateSurface(game.currentBody,game.state.seed);speaker=inside.entities.find(entity=>entity.id.endsWith(':resident:'+residentId));
  const returned=game.conversation(speaker,{record:false});assert.equal(returned.context,'local-choice');assert.match(returned.greeting,expected);
  assert.equal(game.state.credits,credits);assert.equal(game.state.person.weaponDrawn,true);assert.equal(game.state.exploration.encounter.monsters.length,0);
 }
});
