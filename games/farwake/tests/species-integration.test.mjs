import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {SPECIES_HOMEWORLDS} from '../dist/species-content.mjs';
import {FACTION_PORTS} from '../dist/port-content.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import {SYSTEM_SPACE_SCALE} from '../dist/system-space.mjs';

const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const addedBodies=new Set([...SPECIES_HOMEWORLDS.map(entry=>entry.body.id),...FACTION_PORTS.map(port=>port.id)]);
const releasedBodies=bodies=>bodies.filter(body=>!addedBodies.has(body.id));
const ok=result=>{assert.equal(result.ok,true,result.reason);return result;};
// Recorded from the live 0.7.1 source, before the species additions. Only the
// appended homeworlds and service bases are projected out. Existing chart bytes remain intact.
const charts={
 'species-compatibility':'41f71102e91aafa3c37ddd178bd1792c55cc0aff93f073dff75ed4aa2eb90d69',
 farwake:'9bd1c91c285e7efa3f214c8053014723306c4744092c98e11c2689eb4473ca47'
};
// Derived independently from committed0.10 after verifying its unrounded data
// against all16 original0.7.1 signatures. Coordinates use released system units;
// six decimals avoid binary rounding noise from multiplying then dividing by3.
const physical={
  "species-compatibility": {
    "kindred": "81c32c2dea74907708cd1de4142e5b67fe9a8b6cc78a37c8d99b142445d9c60e",
    "brassfall": "b4ef7faff4ab83f06b2f0ee0943d5a392ede8c4a989ee33feada52d82cc7cb6d",
    "chorus": "6525cdf8b46ca0d1199bbed5fafc81b989375fa6d0fa7addfd389ef42ee49e23",
    "brindle": "454c85a4a65f592efa014cb059dcc339410bb9cad583e2691738d924fb4a70ea",
    "nacre": "caab4d8125b3e7b616d1690b8e573bb1aedd07f2d1b2e987939013cea5fd0b0e",
    "sable": "ee390ef7411b1807c4db55a6588ed4edc1a2a5f2836220019ac96539b240d92f",
    "vesper": "a68e870fb57e1345fe10b5619a6492236b8b13a1fd6ba7807480b05cd9f51908",
    "cinder": "acca4e4830528d4e7b387f9b7d018758b180a7f55ddde75aa4b63301d05b0882"
  },
  "farwake": {
    "kindred": "c0e97b6f8533c041af00cdcf86b05471f3b9738102c8376e27be60713eb57791",
    "brassfall": "0ffa62d433ed1e044fcc499fd86251d3bc66f85f5bcf3294dcd1373274d09336",
    "chorus": "a3ae113a13f505c4c5ae69321d82f9dd3fe13c24fcf8440254efeea01cbc592e",
    "brindle": "cc0fa73e15860f14b0117ace8eb6c3bae41c4891cb7b6db6ee6a881535488d40",
    "nacre": "0919f08cf7c7260e3b2bf279c1d35a13853bc0168c943b98146f6fddbd4ce241",
    "sable": "cebd63f6c2676eeb5dc4be66704ec28350ffd089c139e6a75aaa08b2f97f0cfb",
    "vesper": "d6be9ef19329d7dab5fa8cb3ef85cc87d454be0e9e3624dbb7f99205dcb2329d",
    "cinder": "60e2387da0db778cbbe6c279ea7f14add7510b0e590df607cbd33e402dbb813a"
  }
};

test('adding people and homeworlds preserves all 900 released stars and every older body',()=>{
 for(const[seed,expected]of Object.entries(charts)){
  const galaxy=buildGalaxy(seed);
  assert.equal(galaxy.length,900);
  assert.equal(checksum(galaxy.map(system=>({...system,bodies:releasedBodies(system.bodies)}))),expected);
  for(const entry of SPECIES_HOMEWORLDS)assert.equal(galaxy.find(system=>system.id===entry.systemId).bodies.at(-1).id,entry.body.id);
 }
});

test('population and traffic changes cannot consume other physical world random draws',()=>{
 for(const[seed,systems]of Object.entries(physical))for(const[systemId,expected]of Object.entries(systems)){
  const game=new Game(seed);game.state.systemId=systemId;game._loadSystem(systemId);
  // Traffic intentionally has new hull selection and lanes. Normalize only
  // physical spacing; every other released body, rock, hull and signal field stays exact.
  const coordinates=items=>items.map(item=>({...item,x:Math.round(item.x/SYSTEM_SPACE_SCALE*1e6)/1e6,y:Math.round(item.y/SYSTEM_SPACE_SCALE*1e6)/1e6}));
  const projection=()=>({bodies:coordinates(releasedBodies(game.system.bodies)),asteroids:coordinates(game.system.asteroids),enemies:coordinates(game.system.enemies),signals:coordinates(game.system.signals)});
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
  assert.equal(game.state.person.weaponDrawn,false,'a clinic or public workshop never draws the gun on entry');
  let inside=generateSurface(game.currentBody,game.state.seed),speaker=inside.entities.find(entity=>entity.id.endsWith(':resident:'+residentId));
  assert.notEqual(game.conversation(speaker,{record:false}).context,'local-choice');
  const choice=inside.entities.find(entity=>entity.type==='siteChoice'),credits=game.state.credits;
  Object.assign(game.state.person,choice);ok(game.siteAction(choice.id,'choose',option));
  assert.equal(game.state.credits,credits);assert.equal(game.siteAction(choice.id,'choose',option).ok,false);
  game=Game.fromSave(game.save());inside=generateSurface(game.currentBody,game.state.seed);speaker=inside.entities.find(entity=>entity.id.endsWith(':resident:'+residentId));
  const returned=game.conversation(speaker,{record:false});assert.equal(returned.context,'local-choice');assert.match(returned.greeting,expected);
  assert.equal(game.state.credits,credits);assert.equal(game.state.person.weaponDrawn,false);
 }
});
