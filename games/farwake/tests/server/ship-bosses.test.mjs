import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {shipBossPlan,captureShipBosses} from '../../dist/ship-bosses.mjs';
import {mergeSnapshot} from '../../dist/network.mjs';
import {musicContext} from '../../dist/music-context.mjs';

const seed='boss-shared-integration';
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const persistence=()=>({kind:'memory',async save(_id,version,snapshot){this.snapshot=structuredClone(snapshot);return{version:version+1};}});
async function fixture(){
 const systemId=shipBossPlan(seed).find(entry=>entry.archetype==='siege-monitor').systemId;
 const realm=new Realm({id:'BOSSROOM',seed,persistence:persistence()}),captains=[];
 for(let i=0;i<2;i++){
  const {captain}=await realm.createCaptain(`Boss test ${i+1}`);ok(realm.attach(captain,{close(){},send(){}}));captains.push(captain);
  const vessel=realm.vessels.get(captain.ownedVesselId);vessel.systemId=systemId;vessel.dockedAt=null;vessel.helmOwner=captain.id;vessel.actor=null;
  captain.aboard=vessel.id;captain.crewRole='helm';captain.game.state.systemId=systemId;captain.game.state.mode='ship';captain.game.state.interior=null;realm._bindCaptain(captain);
 }
 const room=realm._room(systemId),enemy=room.runtime.enemies.find(actor=>actor.shipBoss&&!actor.shipBossPart);assert.ok(enemy);
 room.runtime.enemies=room.runtime.enemies.filter(actor=>actor.shipBoss);room.runtime.traffic=[];room.runtime.signals=[];
 for(const [i,captain]of captains.entries())Object.assign(realm.vessels.get(captain.aboard).ship,{x:enemy.x+650+i*60,y:enemy.y,vx:0,vy:0,angularVelocity:0});
 return{realm,captains,room,enemy,systemId};
}

test('one shared boss advances once for two captains and full/compact snapshots retain its physical warning',async()=>{
 const {realm,captains,room,enemy}=await fixture();
 realm.step(.1,realm.tick+1,Date.now());assert.equal(enemy.bossState.phase,'windup');assert.equal(enemy.bossState.clock,.1);
 const before=enemy.bossState.remaining;
 realm.step(.1,realm.tick+1,Date.now());assert.ok(Math.abs(enemy.bossState.remaining-(before-.1))<1e-8);assert.equal(enemy.bossState.clock,.2);
 assert.equal(captains[0].game.system,room.runtime);assert.equal(captains[1].game.system,room.runtime);
 const full=realm.snapshotFor(captains[0],{drainEvents:false}),other=realm.snapshotFor(captains[1],{drainEvents:false});
 const merged=mergeSnapshot(other,realm.snapshotFor(captains[1],{compact:true,drainEvents:false}));
 for(const packet of [full,merged]){
  const observed=packet.world.enemies.find(actor=>actor.id===enemy.id);assert.ok(observed?.shipBoss);assert.equal(observed.bossState.phase,'windup');assert.equal(observed.bossState.aimAngle,enemy.bossState.aimAngle);assert.equal(observed.bossState.remaining,enemy.bossState.remaining);
 }
});

test('shared realm restart retains the same injured boss and warning rather than spawning a replacement',async()=>{
 const {realm,captains,room,enemy,systemId}=await fixture();
 for(let i=0;i<5;i++)realm.step(.1,realm.tick+1,Date.now());enemy.hp-=117;
 const before=captureShipBosses(room.runtime),document=realm.document();
 const restored=new Realm({id:realm.id,seed,version:realm.version,snapshot:document,persistence:persistence()});
 for(const captain of captains)ok(restored.attach(restored.captains.get(captain.id),{close(){},send(){}}));
 const resumed=restored._room(systemId),live=resumed.runtime.enemies.find(actor=>actor.id===enemy.id);
 assert.deepEqual(captureShipBosses(resumed.runtime),before);assert.equal(live.hp,enemy.hp);
 restored.step(.1,restored.tick+1,Date.now());assert.ok(Math.abs(live.bossState.remaining-(enemy.bossState.remaining-.1))<1e-8);
 assert.equal(resumed.runtime.enemies.filter(actor=>actor.id===enemy.id).length,1);
});

test('cabin guests receive only their occupied vessel’s observed boss cue in full and compact snapshots',async()=>{
 const {realm,captains:[pilot,guest],enemy}=await fixture(),vessel=realm.vessels.get(pilot.aboard);
 const read=packet=>musicContext({game:{state:packet.state,system:packet.world,currentBody:packet.state.interior?.location},playing:true,network:{passport:{captainId:packet.state.multiplayer.captainId}}});
 realm.step(.1,realm.tick+1,Date.now());assert.equal(enemy.bossState.targetVesselId,vessel.id);
 const pilotView=realm.snapshotFor(pilot,{drainEvents:false}),unrelated=realm.snapshotFor(guest,{drainEvents:false});
 const key=read(pilotView).bossEncounterKey;assert.ok(key);assert.equal(read(unrelated).bossEncounterKey,null,'Another ship in the same room cannot borrow the battle.');
 vessel.grants[guest.id]={allowed:true,roles:[]};realm._cabin(guest,vessel);
 const full=realm.snapshotFor(guest,{drainEvents:false}),compact=realm.snapshotFor(guest,{compact:true,drainEvents:false}),merged=mergeSnapshot(full,compact);
 for(const packet of [full,merged]){
  assert.deepEqual(packet.world.enemies,[]);assert.deepEqual(packet.world.bullets,[]);
  assert.equal(packet.state.musicThreat.vesselId,vessel.id);assert.equal(packet.state.musicThreat.bossObserved,true);
  assert.deepEqual(Object.keys(packet.state.musicThreat).sort(),['bossEncounterKey','bossObserved','incoming','pursuit','vesselId'].sort(),'Only present observation facts accompany the existing threat summary.');
  assert.equal(read(packet).bossEncounterKey,key);assert.equal(read(packet).bossObserved,true);
 }
 const wrongVessel=structuredClone(full);wrongVessel.state.musicThreat.vesselId='another-ship';assert.equal(read(wrongVessel).bossEncounterKey,null);
 const down=structuredClone(full);down.state.person.down=true;assert.equal(read(down).bossEncounterKey,null,'A projected key cannot override observer incapacitation.');
 Object.assign(vessel.ship,{x:enemy.bossState.originX+2600,y:enemy.bossState.originY});realm.step(.1,realm.tick+1,Date.now());
 const after=mergeSnapshot(full,realm.snapshotFor(guest,{compact:true,drainEvents:false}));
 assert.equal(read(after).bossEncounterKey,null,'Retreat replaces the prior compact cue rather than leaving a stale boss latch.');
 assert.equal(after.state.musicThreat.bossObserved,undefined);assert.equal(after.state.musicThreat.bossEncounterKey,undefined);
});
