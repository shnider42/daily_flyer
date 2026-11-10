import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {materializeEncounterContacts} from '../dist/encounter-rules.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import {generateSurface} from '../dist/surface.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||result?.message);return result;};
const pose=ship=>Object.fromEntries(['x','y','vx','vy','angle','angularVelocity'].map(key=>[key,ship[key]]));

test('walking time and overdue legacy timers cannot produce an encounter when taking the helm',()=>{
 const raw=new Game('a-quiet-walk').save();raw.encounterPolicyVersion=1;raw.nextEncounterAt=95;raw.stats.time=1200;raw.stats.distance=20000;
 const game=Game.fromSave(raw);Object.assign(game.state.ship,{x:1500,y:-1500,vx:0,vy:0});
 ok(game.enterCabin());game.drainEvents();
 for(let i=0;i<9000;i++)game.step(.1,{x:1,y:0});
 assert.equal(game.state.pendingEncounter,null);
 assert.equal(game.state.mode,'person');
 ok(game.exitCabin());game.step(1/60,{});
 assert.equal(game.state.pendingEncounter,null,'A change of perspective must not roll a random event.');
 for(let i=0;i<20;i++){ok(game.enterCabin());game.step(.1,{});ok(game.exitCabin());game.step(.1,{});}
 assert.equal(game.state.pendingEncounter,null);
 assert.equal(game.drainEvents().some(event=>event.type==='encounter'),false);
 assert.equal(game.state.ship.hull,game.state.ship.maxHull);
});

test('a solo hull keeps coasting while its captain walks and the helm resumes the exact live pose',()=>{
 const game=new Game('one-physical-vessel');Object.assign(game.state.ship,{x:520,y:-700,vx:37,vy:-22,angle:1.37,angularVelocity:.62});
 const comparison=Game.fromSave(game.save()),ship=game.state.ship,start=pose(ship);
 ok(game.enterCabin());assert.equal(game.state.interior.liveVessel,true);
 for(let i=0;i<120;i++){
  game.step(1/60,{x:1,y:-1,thrust:1,strafe:1,turn:1,boost:true,fire:true,mine:true});
  comparison.step(1/60,{});
 }
 assert.ok(Math.hypot(ship.x-start.x,ship.y-start.y)>10,'Leaving the helm does not freeze the hull.');
 for(const key of Object.keys(start))assert.ok(Math.abs(ship[key]-comparison.state.ship[key])<1e-7,`${key}: walking controls must not pilot the ship`);
 assert.equal(game.state.stats.oreMined,0);assert.equal(game.system.bullets.length,0);
 const actual=pose(ship);ok(game.exitCabin());assert.equal(game.state.ship,ship);assert.deepEqual(pose(ship),actual);
 const restored=Game.fromSave(game.save());assert.deepEqual(pose(restored.state.ship),actual);
});

test('actual outside projectiles damage the same cabin hull and leave their attacker in the ship view',()=>{
 const game=new Game('same-space-outside');Object.assign(game.state.ship,{x:500,y:-700,vx:0,vy:0,shield:0});
 ok(game.enterCabin());const ship=game.state.ship,before=ship.hull;
 const enemy=placeRaider(game,{x:ship.x+250,y:ship.y,speed:0,cooldown:999,active:true});
 game._hitTimer=2;
 game.system.bullets.push({id:'visible-attacker:pulse',owner:enemy.id,ownerId:enemy.id,vesselId:enemy.id,x:ship.x+60,y:ship.y,vx:-500,vy:0,ttl:1,damage:7,radius:4});
 game.step(.1,{});assert.equal(ship.hull,before-7);assert.equal(game.state.mode,'person');
 const attackerPose={x:enemy.x,y:enemy.y,hp:enemy.hp};
 ok(game.exitCabin());assert.equal(game.state.ship,ship);assert.equal(ship.hull,before-7);
 assert.equal(game.system.enemies.find(contact=>contact.id===enemy.id),enemy);
 assert.deepEqual({x:enemy.x,y:enemy.y,hp:enemy.hp},attackerPose);
 assert.ok(game.drainEvents().some(event=>event.type==='hit'&&event.vesselId===ship.id));
});

test('new captains begin in a busy central hub with ordinary traffic and navigation signals',()=>{
 for(const seed of ['quiet-city','beginner','farwake','morrow-workday']){
  const game=new Game(seed);assert.equal(game.state.systemId,'hearth');assert.equal(game.currentSystem.gx,0);assert.equal(game.currentSystem.gy,0);
  assert.equal(game.system.traffic.length,22);assert.equal(game.system.enemies.length,0);
  assert.equal(game.system.signals.some(signal=>['distress','derelict','standoff','suspicion'].includes(signal.kind)),false);
  assert.ok(game.system.signals.some(signal=>signal.story),'The authored opening beacon stays available.');
  assert.ok(new Set(game.system.traffic.map(ship=>ship.id)).size===22);
 }
});

test('an ordinary survey can never fall back to an unrelated rescue or armed standoff',()=>{
 for(const seed of ['routine-survey','routine-survey-2','routine-survey-3']){
  const game=new Game(seed),signal=game.system.signals.find(signal=>signal.kind==='survey');assert.ok(signal);
  Object.assign(game.state.ship,{x:signal.x,y:signal.y});const hull=game.state.ship.hull;
  const result=ok(game.scan(signal.id));assert.equal(result.encounter,undefined);assert.equal(game.state.pendingEncounter,null);
  assert.equal(signal.resolved,true);assert.equal(game.state.ship.hull,hull);assert.equal(game.system.enemies.length,0);
  assert.equal(game.drainEvents().some(event=>event.type==='encounter'),false);
 }
});

for(const[encounterId,kind,choice]of [['cinder_toll','standoff','refuse'],['signal_imposter','suspicion','warn']])test(`${encounterId}: the decision arms a persistent visible hull without narrative damage`,()=>{
 const game=new Game(`physical-${encounterId}`);game.state.systemId='afterlight';game._loadSystem('afterlight');game.system.enemies=[];
 const signal={id:`afterlight:controlled:${kind}`,name:'A physical contact',kind,encounterId,x:game.state.ship.x+100,y:game.state.ship.y,radius:20,resolved:false,scanned:false};
 game.system.signals.push(signal);materializeEncounterContacts(game);
 const visible=game.system.traffic.find(contact=>contact.id===signal.vesselId);assert.ok(visible);
 ok(game.triggerEncounter(encounterId,{sourceType:'signal',sourceId:signal.id}));const hull=game.state.ship.hull;
 ok(game.applyChoice(encounterId,choice));assert.equal(game.state.ship.hull,hull,'Only real weapon impacts may remove hull.');
 const hostile=game.system.enemies.find(contact=>contact.id===visible.id);assert.ok(hostile);assert.equal(hostile.active,true);
 assert.deepEqual({x:hostile.x,y:hostile.y},{x:visible.x,y:visible.y});assert.ok(!game.system.traffic.some(contact=>contact.id===visible.id));
 const restored=Game.fromSave(game.save()),retained=restored.system.enemies.find(contact=>contact.id===hostile.id);
 assert.ok(retained);assert.equal(retained.hp,hostile.hp);assert.equal(retained.x,hostile.x);assert.equal(retained.y,hostile.y);
 assert.equal(restored.state.ship.hull,hull);
});

test('evacuated freighters remain physical hulls but cannot duplicate their rescued occupants',()=>{
 const game=new Game('context-playtest-9');game.state.systemId='afterlight';game._loadSystem('afterlight');
 const signal=game.system.signals.find(value=>value.encounterId==='ghost_freighter');assert.ok(signal);
 Object.assign(game.state.ship,{x:signal.x+75,y:signal.y,vx:0,vy:0});
 ok(game.boardDerelict(signal.id));
 assert.ok(generateSurface(game.currentBody,game.state.seed).entities.some(entity=>entity.role==='survivor'));
 ok(game.leaveDerelict());ok(game.scan(signal.id));ok(game.applyChoice('ghost_freighter','board'));
 assert.equal(game.rescuedBerths(),3);assert.equal(game.system.traffic.find(ship=>ship.id===signal.vesselId).evacuated,true);
 ok(game.boardDerelict(signal.id));assert.equal(game.currentBody.evacuated,true);
 assert.equal(generateSurface(game.currentBody,game.state.seed).entities.some(entity=>entity.role==='survivor'),false);
 const restored=Game.fromSave(game.save()),contact=restored.system.traffic.find(ship=>ship.id===signal.vesselId);
 assert.ok(contact,'An evacuated hull remains present after a save/reload.');assert.equal(contact.evacuated,true);
 assert.equal(restored.currentBody.evacuated,true);assert.equal(restored.rescuedBerths(),3);
 assert.equal(generateSurface(restored.currentBody,restored.state.seed).entities.some(entity=>entity.role==='survivor'),false);
});
