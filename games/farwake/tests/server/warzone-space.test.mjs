import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { compactSnapshot } from '../../server/index.mjs';
import { captureWarzoneSpace, WARZONE_SPACE_LIMITS } from '../../dist/warzone-space.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const storage=()=>({kind:'warzone-memory',async save(_id,version,snapshot){this.snapshot=structuredClone(snapshot);return{version:version+1};}});
function clock(t){let value=1_800_000_000_000;t.mock.method(Date,'now',()=>value);return{now:()=>value,advance(seconds){value+=seconds*1000;return value;}};}
function locate(realm,captain,systemId='crosswind',index=0){
  const vessel=realm.vessels.get(captain.ownedVesselId);vessel.systemId=systemId;vessel.dockedAt=null;vessel.helmOwner=captain.id;vessel.actor=null;
  captain.aboard=vessel.id;captain.crewRole='helm';captain.game.state.systemId=systemId;captain.game.state.mode='ship';captain.game.state.interior=null;
  Object.assign(vessel.ship,{x:-5600+index*110,y:-4500,vx:0,vy:0,angularVelocity:0});realm._bindCaptain(captain);return vessel;
}
async function fixture(count=2){
  const persistence=storage(),realm=new Realm({id:'WARZONE1',seed:'warzone-shared',persistence}),captains=[];
  for(let index=0;index<count;index++){const{captain}=await realm.createCaptain(`Captain ${index+1}`);ok(realm.attach(captain,{close(){},send(){}}));captains.push(captain);locate(realm,captain,'crosswind',index);}
  return{realm,captains,persistence,room:realm._room('crosswind')};
}
function ticks(realm,time,count=1){for(let i=0;i<count;i++){time.advance(1/30);realm.step(1/30,realm.tick+1,time.now());}}
const poses=runtime=>runtime.enemies.filter(ship=>ship.warzone).map(({id,x,y,hp,targetId})=>({id,x,y,hp,targetId}));

test('shared weapons honor the helmsman’s side and friendly boarding is denied without creating hostility',async()=>{
 const{realm,captains:[helm,gunner],room}=await fixture(),vessel=realm.vessels.get(helm.aboard);
 ok(await realm.command(helm,'warzoneAction',{action:'join',factionId:'freewake'}));
 ok(await realm.command(gunner,'warzoneAction',{action:'join',factionId:'meridian'}));
 vessel.grants[gunner.id]={allowed:true,roles:['weapons']};realm._cabin(gunner,vessel);gunner.crewRole='weapons';
 const ally=room.runtime.enemies.find(ship=>ship.faction==='freewake'&&ship.warzoneSize==='medium');
 Object.assign(ally,{x:vessel.ship.x+110,y:vessel.ship.y,disabled:true,active:false,hp:ally.maxHp*.35,vx:0,vy:0});
 const before=ally.hp,actor=realm._actor(vessel);
 actor._worldGames=[actor];actor._rewardGames=new Map([[helm.id,helm.game],[gunner.id,gunner.game]]);
 room.runtime.bullets.push({id:'shared-stray-pulse',owner:'player',ownerId:gunner.id,vesselId:vessel.id,x:ally.x-ally.radius-8,y:ally.y,vx:300,vy:0,ttl:1,damage:11,radius:4});
 actor._updateBullets(.1,[actor]);
 assert.equal(ally.hp,before,'a gunner with different personal allegiance still uses the occupied ship’s allegiance');
 assert.deepEqual(helm.game.state.warzone.hostileFactions,[]);assert.deepEqual(vessel.warzoneHostileFactions||[],[]);
 assert.equal((await realm.command(helm,'boardEnemy',{id:ally.id})).code,'friendly');
 assert.equal(helm.aboard,vessel.id);assert.deepEqual(helm.game.state.warzone.hostileFactions,[]);
 const promoted={id:'promoted-allied-hull',ownerId:gunner.id,systemId:'crosswind',npcEnemyId:ally.id,npcHostile:true,captured:false,ship:{...ally,hull:ally.hp},hostileTo:[]};
 assert.equal(realm._shipsHostile(vessel,promoted),false);assert.equal(realm._shipsHostile(promoted,vessel),false,'promoting a boarded NPC hull does not reverse an ally’s relation');
});

test('an Orsa ceasefire repairs the requesting captain and permitted docked hull without clearing another captain’s record',async()=>{
 const{realm,captains:[one,two],room}=await fixture(),vessel=realm.vessels.get(one.aboard),other=realm.vessels.get(two.aboard);
 for(const captain of[one,two]){ok(await realm.command(captain,'warzoneAction',{action:'join',factionId:'freewake'}));captain.game.state.warzone.hostileFactions=['freewake','meridian'];}
 vessel.warzoneHostileFactions=['freewake','meridian'];other.warzoneHostileFactions=['freewake','meridian'];
 const orsa=room.runtime.bodies.find(body=>body.id==='crosswind-orsa');
 vessel.dockedAt=orsa.id;vessel.helmOwner=null;Object.assign(vessel.ship,{x:orsa.x,y:orsa.y+orsa.radius+60,vx:0,vy:0});
 realm._landCharacter(one,'crosswind',orsa.id);assert.equal(one.portVesselId,vessel.id);
 const before=structuredClone(one.game.state.warzone.mission);
 vessel.boarding={phase:'active'};assert.equal((await realm.command(one,'warzoneAction',{action:'ceasefire'})).ok,false);
 assert.deepEqual(one.game.state.warzone.hostileFactions,['freewake','meridian']);vessel.boarding=null;
 assert.equal(realm.snapshotFor(one,{drainEvents:false}).state.warzoneView.ceasefire.available,true);
 ok(await realm.command(one,'warzoneAction',{action:'ceasefire',factionId:'freewake'}));
 assert.deepEqual(one.game.state.warzone.hostileFactions,['meridian']);assert.deepEqual(vessel.warzoneHostileFactions,['meridian']);
 assert.deepEqual(two.game.state.warzone.hostileFactions,['freewake','meridian']);assert.deepEqual(other.warzoneHostileFactions,['freewake','meridian']);
 assert.deepEqual(one.game.state.warzone.mission,before);
 vessel.warzoneHostileFactions.push('freewake');assert.equal(one.game.warzoneStatus().ceasefire.needed,true,'a ship-only incident is still visible to its permitted captain');
 ok(await realm.command(one,'warzoneAction',{action:'ceasefire'}));
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence});
 assert.deepEqual(restored.captains.get(one.id).game.warzoneHostilities(),['meridian']);
 assert.deepEqual(restored.vessels.get(vessel.id).warzoneHostileFactions,['meridian']);
 assert.deepEqual(restored.captains.get(two.id).game.state.warzone.hostileFactions,['freewake','meridian']);
});

test('one shared fleet advances once per room with one or ten captains and stays within the frame budget',async t=>{
  const time=clock(t),small=await fixture(1),full=await fixture(10);
  const start=performance.now();
  for(let tick=0;tick<300;tick++){time.advance(1/30);for(const f of[small,full])f.realm.step(1/30,f.realm.tick+1,time.now());}
  const elapsed=performance.now()-start;
  assert.ok(Math.abs(full.room.runtime.warzone.clock-10)<1e-7);assert.equal(full.room.ticks,300);assert.equal(small.room.ticks,300);
  assert.deepEqual(captureWarzoneSpace(full.room.runtime),captureWarzoneSpace(small.room.runtime),'ten neutral captains must not accelerate or duplicate fleet combat');
  for(const captain of full.captains){assert.equal(captain.game.system,full.room.runtime);assert.equal(captain.game.state.worlds.crosswind,full.room.record);}
  assert.equal(new Set(full.room.runtime.enemies.map(ship=>ship.id)).size,full.room.runtime.enemies.length);
  assert.ok(full.room.runtime.enemies.length<=WARZONE_SPACE_LIMITS.ships);
  const costStart=performance.now();ticks(full.realm,time,300);const roomMs=performance.now()-costStart;
  const snapshotsStart=performance.now();for(let index=0;index<20;index++)for(const captain of full.captains)full.realm.snapshotFor(captain,{compact:true,drainEvents:false});const snapshotsMs=performance.now()-snapshotsStart;
  t.diagnostic(`One + ten captain rooms: ${elapsed.toFixed(1)}ms / 300 paired ticks. Ten-captain room: ${(roomMs/300).toFixed(3)}ms per tick; compact snapshot: ${(snapshotsMs/200).toFixed(3)}ms per captain.`);
});

test('full and compact observations share real fleet damage and pulses without disclosing future rolls',async t=>{
  const time=clock(t),{realm,captains:[one,two],room}=await fixture();ticks(realm,time,600);
  assert.ok(room.runtime.warzone.projectiles.length>0);const original=poses(room.runtime),first=realm.snapshotFor(one,{drainEvents:false}),second=realm.snapshotFor(two,{drainEvents:false}),compact=realm.snapshotFor(one,{compact:true,drainEvents:false});
  assert.deepEqual(first.world.enemies,second.world.enemies);assert.deepEqual(first.world.warzone,second.world.warzone);assert.deepEqual(compact.world.warzone,first.world.warzone);
  assert.deepEqual(compactSnapshot(first).world.warzone,first.world.warzone,'both compact encodings retain the same public combat observations');
  assert.equal(first.world.warzone.projectiles.length,room.runtime.warzone.projectiles.length);
  for(const view of[first,second,compact]){
    for(const key of ['rng','nextWaveAt','nextPhaseAt','nextBoardingAt','serial','recentLosses','carriers','fighterFlights','batteries','maneuvers'])assert.equal(Object.hasOwn(view.world.warzone,key),false,key);
    assert.equal(view.state.worlds?.crosswind?.warzoneSpace,undefined);assert.ok(view.world.enemies.some(ship=>ship.hp<ship.maxHp),'captains see actual fleet wounds');
    assert.ok(view.world.enemies.some(ship=>ship.warzoneSortie&&['needle','kite'].includes(ship.classId)),'the shared room shows actual launched fighters');
    assert.ok(view.world.warzone.squadrons.length>=2);assert.ok(view.world.warzone.squadrons.every(wing=>wing.deployed+wing.ready+wing.rearming===wing.capacity));
  }
  first.world.enemies[0].hp=99999;first.world.warzone.projectiles[0].x=99999;assert.deepEqual(poses(room.runtime),original);assert.notEqual(room.runtime.warzone.projectiles[0].x,99999);
  const vessel=realm.vessels.get(one.aboard);realm._cabin(one,vessel);const interior=realm.snapshotFor(one,{compact:true,drainEvents:false});assert.equal(interior.world.warzone.projectiles.length,0);assert.equal(interior.world.warzone.effects.length,0);
});

test('an occupied capital stops NPC launches and keeps its canonical hull and detached wings after restart',async t=>{
  const time=clock(t),{realm,captains:[captain,witness],room}=await fixture();captain.game.state.fleet.owned.push('marten');captain.game._activateClass('marten',true);
  const source=realm.vessels.get(captain.ownedVesselId),enemy=room.runtime.enemies.find(ship=>ship.faction==='meridian'&&ship.classId==='ark');
  room.runtime.warzone.carriers[enemy.id].nextLaunchAt=0;ticks(realm,time,1);
  const wing=room.runtime.enemies.filter(ship=>ship.warzoneSortie?.carrierId===enemy.id);assert.equal(wing.length,2);
  Object.assign(enemy,{disabled:true,active:false,hp:enemy.maxHp*.35,vx:0,vy:0,warzoneExitAt:.1});Object.assign(source.ship,{x:enemy.x-130,y:enemy.y,vx:0,vy:0});
  ok(realm._command(captain,'boardEnemy',{id:enemy.id}));const prize=realm.vessels.get(captain.aboard);assert.equal(prize.ship.classId,'ark');assert.equal(enemy.canonicalVesselId,prize.id);
  ticks(realm,time,3);assert.equal(room.runtime.warzone.carriers[enemy.id],undefined);assert.equal(room.runtime.warzone.batteries[enemy.id],undefined);
  for(const fighter of wing)assert.notEqual(room.runtime.warzone.fighterFlights[fighter.id]?.carrierId,enemy.id,'boarding does not leave an enemy fighter factory inside the player vessel');
  const observed=realm.snapshotFor(witness,{drainEvents:false});assert.equal(observed.remoteShips.filter(ship=>ship.id===prize.id).length,1);assert.ok(!observed.world.enemies.some(ship=>ship.id===enemy.id));
  const document=realm.document(),restored=new Realm({id:realm.id,snapshot:structuredClone(document),persistence:realm.persistence}),returned=restored._room('crosswind');
  assert.equal(restored.vessels.get(prize.id).ship.classId,'ark');assert.equal(returned.runtime.enemies.find(ship=>ship.id===enemy.id).canonicalVesselId,prize.id);
  assert.equal(returned.runtime.warzone.carriers[enemy.id],undefined);assert.equal(returned.runtime.warzone.batteries[enemy.id],undefined);
  for(const [id,flight]of Object.entries(returned.runtime.warzone.fighterFlights)){
    assert.ok(returned.runtime.enemies.some(ship=>ship.id===id));if(flight.carrierId)assert.equal(returned.runtime.warzone.carriers[flight.carrierId].slots[flight.slot].fighterId,id);
  }
});

test('authority restart and empty-room revisits keep one persistent battle with bounded catchup',async t=>{
  const time=clock(t),{realm,captains,room}=await fixture();ticks(realm,time,180);
  const target=room.runtime.enemies.find(ship=>ship.classId==='judicator');target.hp-=73;const saved=captureWarzoneSpace(room.runtime),document=realm.document();
  assert.deepEqual(document.worlds.crosswind.record.warzoneSpace,saved);for(const captain of captains)assert.deepEqual(document.captains[captain.id].game.worlds,{});
  const restored=new Realm({id:realm.id,snapshot:structuredClone(document),persistence:realm.persistence}),returned=restored._room('crosswind');assert.deepEqual(captureWarzoneSpace(returned.runtime),saved);
  for(const captain of captains)locate(realm,captain,'hearth');time.advance(11);realm.step(1/30,realm.tick+1,time.now());assert.equal(realm.rooms.has('crosswind'),false,'an empty front can be evicted without resetting its record');
  const departed=structuredClone(realm.worlds.crosswind.record.warzoneSpace);time.advance(600);locate(realm,captains[0]);const revisited=realm._room('crosswind');
  assert.ok(Math.abs(revisited.runtime.warzone.clock-departed.clock-WARZONE_SPACE_LIMITS.catchUpSeconds)<1e-5);
  assert.ok(revisited.runtime.warzone.serial>=departed.serial);assert.ok(revisited.runtime.warzone.casualties.freewake>=departed.casualties.freewake);assert.ok(revisited.runtime.warzone.waves.meridian>=departed.waves.meridian);
  assert.ok(revisited.runtime.enemies.length<=WARZONE_SPACE_LIMITS.ships);assert.equal(captains[0].game.system,revisited.runtime);
});

test('boarding and capturing a military hull preserve one canonical vessel through authority restart',async t=>{
  const time=clock(t),{realm,captains:[captain,witness],room}=await fixture();captain.game.state.fleet.owned.push('marten');captain.game._activateClass('marten',true);
  const source=realm.vessels.get(captain.ownedVesselId),enemy=room.runtime.enemies.find(ship=>ship.faction==='meridian'&&ship.classId==='marten');
  Object.assign(enemy,{disabled:true,active:false,hp:enemy.maxHp*.35,vx:0,vy:0,warzoneExitAt:.1});Object.assign(source.ship,{x:enemy.x-130,y:enemy.y,vx:0,vy:0});
  ok(realm._command(captain,'boardEnemy',{id:enemy.id}));const target=realm.vessels.get(captain.aboard);assert.ok(target.npcEnemyId===enemy.id);assert.equal(enemy.canonicalVesselId,target.id);
  const firstGuard=target.boarding.enemies[0];firstGuard.health=19;target.ship.hull-=5;realm._syncActor(target);
  const aboardSnapshot=realm.snapshotFor(witness,{drainEvents:false});assert.ok(!aboardSnapshot.world.enemies.some(ship=>ship.id===enemy.id));assert.equal(aboardSnapshot.remoteShips.filter(ship=>ship.id===target.id).length,1);
  const savedHull=target.ship.hull,restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence}),restoredTarget=restored.vessels.get(target.id),restoredCaptain=restored.captains.get(captain.id);
  assert.equal(restoredCaptain.aboard,target.id);assert.equal(restoredTarget.ship.hull,savedHull);assert.equal(restoredTarget.boarding.enemies[0].health,19);
  const restoredEnemy=restored._room('crosswind').runtime.enemies.find(ship=>ship.id===enemy.id);assert.equal(restoredEnemy.canonicalVesselId,target.id);
  for(const guard of target.boarding.enemies)guard.health=0;realm._actor(target)._finishBoarding('won');realm._syncActor(target);assert.equal(target.captured,true);
  const bridge=realm._surface(captain).entities.find(entity=>entity.data?.stationRole==='helm');assert.ok(bridge);Object.assign(captain.game.state.person,{x:bridge.x,y:bridge.y});ok(realm._command(captain,'takeCapturedHelm',{}));
  const before={x:target.ship.x,y:target.ship.y};realm.acceptInput(captain,1,{thrust:1});ticks(realm,time,8);assert.ok(Math.hypot(target.ship.x-before.x,target.ship.y-before.y)>0);
  assert.ok(room.runtime.enemies.includes(enemy),'promotion keeps the linking record instead of towing the hull');assert.equal(captain.ownedVesselId,source.id);
  const after=new Realm({id:realm.id,snapshot:realm.document(),persistence:realm.persistence}),prize=after.vessels.get(target.id);assert.equal(prize.captured,true);assert.equal(prize.helmOwner,captain.id);assert.equal(after.captains.get(captain.id).aboard,target.id);
  assert.equal(prize.ship.hull,target.ship.hull);assert.notEqual(prize.ship,after.vessels.get(source.id).ship);
  const recoveredEnemy=after._room('crosswind').runtime.enemies.find(ship=>ship.id===enemy.id);assert.equal(recoveredEnemy.canonicalVesselId,target.id);assert.ok(cabinLayout(prize.ship.classId).walkable.length>0);
});
