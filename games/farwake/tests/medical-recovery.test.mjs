import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {medicalDestination,medicalFaction,FIELD_HOSPITALS} from '../dist/medical-recovery.mjs';
import {RecoveryTransition} from '../dist/recovery-presentation.mjs';

function front(side){const g=new Game('medical-front');g.state.systemId='crosswind';g._loadSystem('crosswind');g.state.warzone.side=side;const body=g.system.bodies.find(b=>b.id==='crosswind-vey');g._arriveAsPassenger(body);return g;}

test('explicit faction wins; reputation resolves unaffiliated casualties; equal zero standing uses both rescue teams',()=>{
 const game=front('freewake');game.state.rep={freewake:-10,meridian:90};assert.equal(medicalFaction(game,()=>.9),'freewake');
 game.state.warzone.side=null;assert.equal(medicalFaction(game),'meridian');
 game.state.rep={freewake:0,meridian:0};assert.equal(medicalFaction(game,()=>.2),'freewake');assert.equal(medicalFaction(game,()=>.8),'meridian');
});
for(const side of ['freewake','meridian'])test(`${side}: surface casualty wakes in its medical post and keeps the war and property intact`,()=>{
 const g=front(side),ship=structuredClone(g.state.ship),record=g.state.exploration.encounter;g.state.credits=200;
 g.state.person.health=0;g.state.person.down=true;const result=g._returnFromSite(true);
 assert.equal(result.ok,true);assert.equal(g.state.locationId,'crosswind-vey');assert.equal(g.state.medicalRecovery.destination.factionId,side);assert.equal(g.state.credits,180);
 assert.deepEqual(g.state.ship,ship);assert.deepEqual(g.state.exploration.encounter.monsters,record.monsters);assert.deepEqual(g.state.exploration.encounter.warzoneGround,record.warzoneGround);assert.equal(g.state.person.down,false);
 assert.equal(g.state.person.x,FIELD_HOSPITALS[side].x);assert.equal(g.state.person.y,FIELD_HOSPITALS[side].y);
 assert.ok(isWalkable(g._expeditionSurface(),g.state.person.x,g.state.person.y));assert.ok(g.explorationParticipant().protected);
 const saved=Game.fromSave(g.save());assert.equal(saved.state.medicalRecovery.id,g.state.medicalRecovery.id);assert.equal(saved.state.medicalRecovery.destination.factionId,side);assert.equal(saved.state.person.x,g.state.person.x);
});
test('ordinary recovery uses the local clinic or nearest medical body; a closer planet is eligible',()=>{
 const g=new Game('medical-distance'),planet=g.system.bodies.find(b=>b.id==='morrow');
 const destination=medicalDestination(g,{position:planet});assert.equal(destination.bodyId,planet.id);
 g._arriveAsPassenger(planet);g.state.person.health=0;g.recoverOnFoot();
 const surface=generateSurface(planet,g.state.seed,g.state.flags),medic=surface.entities.find(e=>e.type==='medic');
 assert.ok(Math.hypot(g.state.person.x-medic.x,g.state.person.y-medic.y)<=24);assert.ok(Math.hypot(g.state.person.x-surface.spawn.x,g.state.person.y-surface.spawn.y)>24);
});
test('ship destroyed in war-zone space reaches faction care and never replaces the lost hull',()=>{
 const g=front('meridian');g.state.mode='ship';g.state.exploration=null;g.state.locationId=null;g.state.interior=null;g._damageShip(99999);
 assert.equal(g.ownsShip,false);assert.equal(g.state.medicalRecovery.destination.factionId,'meridian');assert.equal(g.state.locationId,'crosswind-vey');
});
function healthy(){return {seed:'test',person:{health:100},stats:{time:0}};}
function tick(t,s,seconds,options){let view;for(let i=0;i<seconds*10;i++)view=t.update(s,.1,options);return view;}
test('blackout waits for recovery, survives duplicate snapshots, then opens eyes once',()=>{
 const t=new RecoveryTransition(),s=healthy();t.update(s,0);s.person.health=0;t.update(s,0);assert.equal(t.phase,'lost');
 tick(t,s,8);assert.equal(t.phase,'lost');s.person.health=60;s.medicalRecovery={id:'1',destination:{name:'Clinic'},wakeUntil:7};
 tick(t,s,2.6);assert.equal(t.phase,'waking');tick(t,s,4);assert.equal(t.phase,'idle');tick(t,s,3);assert.equal(t.phase,'idle');
});
test('same-frame destruction and recovery still show black; reconnect does not replay old recovered lives',()=>{
 const s=healthy(),t=new RecoveryTransition();t.update(s,0);s.medicalRecovery={id:'1',destination:{name:'Clinic'},wakeUntil:7};
 t.update(s,0);assert.equal(t.phase,'lost');tick(t,s,2);assert.equal(t.phase,'lost');tick(t,s,5);assert.equal(t.phase,'idle');
 s.stats.time=9;const rejoined=new RecoveryTransition();rejoined.update(s,0);assert.equal(rejoined.phase,'idle');
});
test('reduced motion substitutes a brief fade and leaving play restores input/audio eligibility',()=>{
 const s=healthy();s.medicalRecovery={id:'1',destination:{name:'Clinic'},wakeUntil:7};const t=new RecoveryTransition();
 tick(t,s,2.6,{reducedMotion:true});const a=t.view(true).opening;tick(t,s,.3,{reducedMotion:true});assert.ok(t.view(true).opening>a);tick(t,s,4,{reducedMotion:true});assert.equal(t.active,false);
 s.person.health=0;t.update(s,0);assert.equal(t.active,true);t.update(s,0,{playing:false});assert.equal(t.active,false);
});

test('field medical posts offer real treatment without enabling trading anywhere on Vey',()=>{
 const g=front('freewake');g._returnFromSite(true);const medic=g._expeditionSurface().entities.find(e=>e.id==='field-medic:freewake');Object.assign(g.state.person,{x:medic.x,y:medic.y});
 assert.equal(g.service('rest').ok,true);assert.equal(g.state.person.health,g.state.person.maxHealth);assert.equal(g.service('refuel').ok,false);
 g.state.person.x+=300;g.state.person.health=40;assert.equal(g.service('rest').ok,false);
});

test('medical evacuation ends a solo employer watch and restores the captain’s own inventory',()=>{
 const g=new Game('medical-contract',{startMode:'hardcore'});assert.ok(g.acceptNpcContract('gunner').ok);const employer=g.state.ship.id;
 g.state.person.health=0;const result=g.recoverOnFoot();assert.equal(result.ok,true);assert.equal(g.state.npcContract,null);assert.notEqual(g.state.ship.id,employer);assert.equal(g.ownsShip,false);assert.equal(g.state.medicalRecovery.destination.kind,'hospital');
});
