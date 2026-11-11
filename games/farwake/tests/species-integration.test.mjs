import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {SPECIES_HOMEWORLDS} from '../dist/species-content.mjs';
import {FACTION_PORTS} from '../dist/port-content.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

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
const physical={
  "species-compatibility": {
    "kindred": "dc6441c05c1594305a9cdda73749ccd04551c424952130e37c9aa53d699806e0",
    "brassfall": "570b110cc42e0c1275712dff948dd4b0f68655dffd676c0e30529f7ae34f1fd7",
    "chorus": "fee7c2b15de308b046fb300dc98cba91e1db89a4e5ae3c4a651399342ed52318",
    "brindle": "dffaedc49810cffdce6b775a315593bd671b8367fa2e06c08ed13ad673218805",
    "nacre": "f0049997844776d28d8cd3751fbb0c39771a29f4bf38d9877b7afa552202e16c",
    "sable": "a729842cd1d7b6c69d493ea74084306a786a4ca70d4f8834b1aa84acd293a717",
    "vesper": "1ad0daa3de1b4b262a927ebb251a62da5836dfb2d00902c841e2e00726c1b528",
    "cinder": "2fc4b6fab5f7b8053fb15780d632e75cd14e7a43644b2291e24171bb09871642"
  },
  "farwake": {
    "kindred": "c83969693e3d45f34fda2e0ef87eb60eaed92794f5d13b1c82b126d2f0efb8c4",
    "brassfall": "ef2329a74e8f62fa937f657774ff0d7850dd8e50e87b636c0c695a3265bac5ee",
    "chorus": "c426e2f92a7c59312603e5016e10eeaa37b03d95820b796e41973e5bd9263b1c",
    "brindle": "e46ad3dcc93d60790936b6ea61cf4b0bff42fc59bda02d02f5c63e0f7cab9128",
    "nacre": "e0a2e2bedcd64098212ca2c1102e4114b38f921f35385ba4db4dad9471ed143a",
    "sable": "1f2ff18e5acd0cdc1bbf348ddf2f06841d61910a62ed09660998d7d054b07b47",
    "vesper": "de293a09c1bb3850c5a0bce0077cc81fefa415e25a37264b559a153acfe9c71d",
    "cinder": "7a557c5567a3c27fa397ca972fdec0535ca99cd37b359542788fb06aa78fc21c"
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
  const {bodies,asteroids,enemies,signals}=game.system;
  // Traffic intentionally has new hull selection and lanes. Every older body,
  // rock, hostile hull and story signal must still match released 0.7.1 bytes.
  const projection={bodies:releasedBodies(bodies),asteroids,enemies,signals};
  assert.equal(checksum(projection),expected);
  for(const body of bodies)generateSurface(body,seed);
  assert.equal(checksum(projection),expected,'creating person views never mutates the space simulation');
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
