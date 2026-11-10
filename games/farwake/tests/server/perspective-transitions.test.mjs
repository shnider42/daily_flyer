import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout,enemyHullProfile} from '../../dist/fleet.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const pose=ship=>Object.fromEntries(['id','x','y','vx','vy','angle','angularVelocity','hull','shield','fuel'].map(key=>[key,ship[key]]));
async function fixture(count=2){
 const persistence={kind:'memory',async save(_id,version){return{version:version+1};}},realm=new Realm({id:'QUICKMODE',seed:'quick-perspective-shared',persistence}),captains=[];
 for(let i=0;i<count;i++){const{captain}=await realm.createCaptain(`Captain ${i+1}`);realm.attach(captain,{close(){}});captains.push(captain);Object.assign(realm.vessels.get(captain.ownedVesselId).ship,{x:i*100,y:500,vx:0,vy:0,angularVelocity:0});}
 const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];
 return{realm,captains,vessels:captains.map(c=>realm.vessels.get(c.ownedVesselId)),room};
}
async function access(realm,owner,guest,roles=['helm']){ok(await realm.command(owner,'setCrewAccess',{captainId:guest.id,allowed:true,roles}));}
async function dock(realm,c,bodyId='kettle'){
 const vessel=realm.vessels.get(c.aboard),body=realm._room(vessel.systemId).runtime.bodies.find(value=>value.id===bodyId);Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(await realm.command(c,'dock',{id:body.id}));return body;
}

test('shared quick helm preserves the live carrier and clears walking input before flight',async()=>{
 const{realm,captains:[c],vessels:[vessel],room}=await fixture(1);Object.assign(vessel.ship,{vx:32,vy:-17,angle:1.25,angularVelocity:.31,hull:81});ok(await realm.command(c,'enterCabin'));
 Object.assign(c.game.state.person,{x:260,y:440});c.input={x:1,y:-1,fire:true};c.appliedInput={...c.input};const before=pose(vessel.ship);
 room.runtime.enemies.push({id:'outside-attacker',hp:40,active:true,x:vessel.ship.x+200,y:vessel.ship.y});
 ok(await realm.command(c,'quickHelm'));assert.equal(c.aboard,vessel.id);assert.equal(vessel.helmOwner,c.id);assert.equal(c.game.state.mode,'ship');assert.deepEqual(pose(vessel.ship),before);
 assert.equal(c.input.x,0);assert.equal(c.input.fire,false);assert.equal(c.appliedInput.y,0);
 assert.equal((await realm.command(c,'quickHelm')).ok,false);
});

test('a permitted visiting captain takes the occupied friend’s helm while their original ship stays parked',async()=>{
 const{realm,captains:[owner,guest],vessels:[carrier,origin]}=await fixture();await access(realm,owner,guest);ok(await realm.command(owner,'enterCabin'));ok(await realm.command(guest,'boardShip',{vesselId:carrier.id}));
 const beforeCarrier=pose(carrier.ship),beforeOrigin=pose(origin.ship);Object.assign(guest.game.state.person,{x:260,y:440});
 ok(await realm.command(guest,'quickHelm'));assert.equal(guest.aboard,carrier.id);assert.equal(carrier.helmOwner,guest.id);assert.equal(origin.helmOwner,null);assert.equal(guest.ownedVesselId,origin.id);
 assert.deepEqual(pose(carrier.ship),beforeCarrier);assert.deepEqual(pose(origin.ship),beforeOrigin);assert.equal(realm.snapshotFor(guest).state.ship.id,carrier.id);
});

test('quick helm never takes a live player’s station or bypasses friendly permission',async()=>{
 const{realm,captains:[owner,guest],vessels:[carrier]}=await fixture();await access(realm,owner,guest);ok(await realm.command(guest,'boardShip',{vesselId:carrier.id}));
 const before=structuredClone(guest.game.state.person);assert.equal((await realm.command(guest,'quickHelm')).code,'station-occupied');assert.equal(carrier.helmOwner,owner.id);assert.deepEqual(guest.game.state.person,before);
 ok(await realm.command(owner,'enterCabin'));await access(realm,owner,guest,[]);assert.equal((await realm.command(guest,'quickHelm')).code,'permission');assert.deepEqual(guest.game.state.person,before);assert.equal(carrier.helmOwner,null);
});

test('failed delegated station admission restores the captain’s pose',async()=>{
 const{realm,captains:[owner,guest],vessels:[carrier]}=await fixture();await access(realm,owner,guest);ok(await realm.command(guest,'boardShip',{vesselId:carrier.id}));
 // Station membership is authoritative too, even if its helm-owner record is stale.
 carrier.helmOwner=null;owner.crewRole='helm';const before=structuredClone(guest.game.state.person);
 assert.equal((await realm.command(guest,'quickHelm')).code,'station-occupied');assert.deepEqual(guest.game.state.person,before);assert.equal(guest.game.state.mode,'person');assert.equal(owner.crewRole,'helm');
});

test('helm availability respects disconnect grace and permits the existing expired-pilot handover',async()=>{
 const{realm,captains:[owner,guest],vessels:[carrier]}=await fixture();await access(realm,owner,guest);ok(await realm.command(guest,'boardShip',{vesselId:carrier.id}));
 owner.session=null;owner.disconnectUntil=Date.now()+60_000;
 assert.equal(realm._publicVessel(carrier,guest).helmOccupied,true);assert.equal((await realm.command(guest,'quickHelm')).code,'station-occupied');
 owner.disconnectUntil=Date.now()-1;
 assert.equal(realm._publicVessel(carrier,guest).helmOccupied,false);ok(await realm.command(guest,'quickHelm'));assert.equal(carrier.helmOwner,guest.id);assert.equal(owner.crewRole,'passenger');assert.equal(realm._publicVessel(carrier,guest).helmOccupied,true);
});

test('active NPC boarding, pending conversations, and unconscious captains cannot use quick helm',async()=>{
 const cases=[['boarding',(c,v)=>{v.boarding={phase:'active',kind:'defense'};}],['encounter',c=>{c.game.state.pendingEncounter={id:'lifeboat'};}],['incapacitated',c=>{c.game.state.person.down=true;}],['destroyed',(_c,v)=>{v.ship.hull=0;}],['mode',c=>{c.game.state.interior={kind:'site'};c.game.state.exploration={key:'cave'};}]];
 for(const[code,mutate]of cases){const{realm,captains:[c],vessels:[v]}=await fixture(1);ok(await realm.command(c,'enterCabin'));mutate(c,v);const person=structuredClone(c.game.state.person),before=pose(v.ship);assert.equal((await realm.command(c,'quickHelm')).code,code);assert.deepEqual(c.game.state.person,person);assert.deepEqual(pose(v.ship),before);assert.equal(v.helmOwner,null);}
});

test('a PvP boarder cannot switch perspective until the actual deck is clear',async()=>{
 const{realm,captains:[attacker,defender],vessels:[origin,target]}=await fixture();target.ship.hull=target.ship.maxHull*.35;target.ship.shield=0;
 ok(await realm.command(attacker,'declareHostility',{vesselId:target.id}));ok(await realm.command(attacker,'boardHostileShip',{vesselId:target.id}));
 const before=structuredClone(attacker.game.state.person);assert.equal((await realm.command(attacker,'quickHelm')).code,'boarding');assert.deepEqual(attacker.game.state.person,before);assert.equal(target.helmOwner,null);
 defender.game.state.person.health=0;defender.game.state.person.down=true;realm._refreshOccupation(target);const targetPose=pose(target.ship),originPose=pose(origin.ship);
 ok(await realm.command(attacker,'quickHelm'));assert.equal(target.helmOwner,attacker.id);assert.equal(attacker.aboard,target.id);assert.equal(attacker.game.state.mode,'ship');assert.deepEqual(pose(target.ship),targetPose);assert.deepEqual(pose(origin.ship),originPose);
});

test('a secured NPC prize can use quick helm after the origin hull is destroyed',async()=>{
 const{realm,captains:[c],vessels:[origin],room}=await fixture(1),enemy={id:'quick-prize',name:'Damaged cutter',...enemyHullProfile('sparrow'),x:origin.ship.x+130,y:origin.ship.y,angle:.4,hp:35,maxHp:100,shield:0,disabled:true,active:false,cooldown:99,speed:0,damage:5,reward:20,faction:'cinder'};
 room.runtime.enemies.push(enemy);ok(await realm.command(c,'boardEnemy',{id:enemy.id}));const prize=realm.vessels.get(c.aboard),actor=realm._actor(prize);
 for(const guard of prize.boarding.enemies)guard.health=0;actor._finishBoarding('won');realm._syncActor(prize);origin.destroyed=true;origin.ship.hull=0;const before=pose(prize.ship);
 Object.assign(c.game.state.person,cabinLayout(prize.ship.classId).spawn);ok(await realm.command(c,'quickHelm'));assert.equal(c.aboard,prize.id);assert.equal(prize.helmOwner,c.id);assert.deepEqual(pose(prize.ship),before);assert.equal(origin.ship.hull,0);
});

test('a secured PvP prize departs as the same controlled ship from the port or its docked cabin',async()=>{
 const{realm,captains:[captor,defender],vessels:[origin,prize]}=await fixture();prize.ship.hull=prize.ship.maxHull*.35;prize.ship.shield=0;
 ok(await realm.command(captor,'declareHostility',{vesselId:prize.id}));ok(await realm.command(captor,'boardHostileShip',{vesselId:prize.id}));defender.game.state.person.health=0;defender.game.state.person.down=true;realm._refreshOccupation(prize);ok(await realm.command(captor,'quickHelm'));
 const originPose=pose(origin.ship),hull=prize.ship.hull;await dock(realm,captor);assert.equal(captor.portVesselId,prize.id);assert.equal(realm._hostileOccupied(prize),true);Object.assign(captor.game.state.person,{x:1600,y:1600});
 ok(await realm.command(captor,'quickLaunch'));assert.equal(captor.aboard,prize.id);assert.equal(prize.dockedAt,null);assert.equal(prize.occupation.controllerId,captor.id);
 await dock(realm,captor);ok(await realm.command(captor,'boardShip',{vesselId:prize.id}));assert.equal(captor.boardingTeam,captor.id);ok(await realm.command(captor,'quickHelm'));
 assert.equal(prize.dockedAt,null);assert.equal(prize.helmOwner,captor.id);assert.equal(captor.game.state.mode,'ship');assert.equal(prize.ship.hull,hull);assert.deepEqual(pose(origin.ship),originPose);
});

test('quick launch uses the local port carrier, including an authorized friend’s vessel',async()=>{
 const{realm,captains:[owner,guest],vessels:[carrier,origin]}=await fixture();await access(realm,owner,guest);ok(await realm.command(owner,'enterCabin'));ok(await realm.command(guest,'boardShip',{vesselId:carrier.id}));ok(await realm.command(guest,'quickHelm'));
 const body=await dock(realm,guest,'morrow');assert.equal(guest.portVesselId,carrier.id);const beforeOrigin=pose(origin.ship),hull=carrier.ship.hull;Object.assign(guest.game.state.person,{x:2000,y:1600});
 ok(await realm.command(guest,'quickLaunch'));assert.equal(guest.aboard,carrier.id);assert.equal(carrier.helmOwner,guest.id);assert.equal(carrier.dockedAt,null);assert.equal(carrier.ship.x,body.x);assert.equal(carrier.ship.hull,hull);assert.deepEqual(pose(origin.ship),beforeOrigin);
});

test('quick launch rejects sites, remote ships, competing helmsmen, active boarding, and stale landing data',async()=>{
 const cases=[
  ['location',c=>{c.game.state.interior={kind:'site',location:{id:'cave'}};c.game.state.exploration={key:'cave'};}],
  ['location',(_c,v)=>{v.systemId='afterlight';}],
  ['location',(_c,v)=>{v.dockedAt='morrow';}],
  ['location',(_c,v)=>{v.ship.x+=2000;}],
  ['station-occupied',(_c,v,other)=>{v.helmOwner=other.id;}],
  ['permission',(c,v)=>{v.ownerId='not-this-captain';v.allowCrew=false;}],
  ['combat',(_c,v)=>{v.pvp={phase:'active'};}],
  ['incapacitated',c=>{c.game.state.person.down=true;}],
  ['encounter',c=>{c.game.state.pendingEncounter={id:'union_strike'};}]
 ];
 for(const[code,mutate]of cases){const{realm,captains:[c,other],vessels:[v]}=await fixture();await dock(realm,c);Object.assign(c.game.state.person,{x:1600,y:1600});mutate(c,v,other);const person=structuredClone(c.game.state.person),before=pose(v.ship),system=c.game.state.systemId;assert.equal((await realm.command(c,'quickLaunch')).code,code);assert.deepEqual(c.game.state.person,person);assert.deepEqual(pose(v.ship),before);assert.equal(c.game.state.systemId,system);assert.equal(c.game.state.mode,'person');assert.equal(c.aboard,null);}
});
