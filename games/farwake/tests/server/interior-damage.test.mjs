import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {cabinLayout,getShipClass,isCabinWalkable} from '../../dist/fleet.mjs';
import {ensureDamageControl,impactSection,interiorDamageSummary} from '../../dist/interior-damage.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>assert.equal(result?.ok,true,result?.reason);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function fixture(count=2,classId='capital'){
 const realm=new Realm({id:'DECK123',seed:'interior-authority',persistence:storage()}),captains=[];
 for(let i=0;i<count;i++){
  const{captain}=await realm.createCaptain(`Captain ${i+1}`);realm.attach(captain,{close(){}});captains.push(captain);
  Object.assign(realm.vessels.get(captain.ownedVesselId).ship,{x:i?90:0,y:500,angle:0,vx:0,vy:0});
 }
 const owner=captains[0],vessel=realm.vessels.get(owner.ownedVesselId),hull=getShipClass(classId);
 Object.assign(vessel.ship,hull.stats,{classId,berths:hull.berths,hull:hull.stats.maxHull,shield:0,energy:50});ensureDamageControl(vessel.ship);
 const room=realm._room('hearth');for(const key of ['enemies','bullets','asteroids','pickups','signals'])room.runtime[key]=[];
 vessel.allowCrew=true;
 for(const guest of captains.slice(1))ok(realm._command(guest,'boardShip',{vesselId:vessel.id}));
 ok(realm._command(owner,'enterCabin',{}));
 return{realm,captains,owner,vessel,room};
}
function hit(f,ratio=.20){
 const {realm,vessel,captains}=f,ship=vessel.ship,details={sourceX:ship.x+200,sourceY:ship.y},point=impactSection(ship,details).point;
 for(const captain of captains)Object.assign(captain.game.state.person,point);
 const actor=realm._actor(vessel);actor._damageShip(ship.maxHull*ratio,details);realm._syncActor(vessel);
 return{actor,point,section:ship.damageControl.sections.find(section=>section.fire>0)};
}
function tick(realm,count=1){for(let i=0;i<count;i++){const at=Date.now();realm.step(.1,realm.tick+1,at,at);}}

test('one physical deck advances once with one captain or ten independent occupants',async()=>{
 const single=await fixture(1),crowded=await fixture(10);const a=hit(single),b=hit(crowded);
 const initial=single.owner.game.state.person.health;
 for(const captain of crowded.captains)near(captain.game.state.person.health,initial);
 tick(single.realm,10);tick(crowded.realm,10);
 near(single.vessel.ship.damageControl.clock,1);near(crowded.vessel.ship.damageControl.clock,1);near(a.section.fire,b.section.fire);
 assert.ok(single.owner.game.state.person.health<initial);
 for(const captain of crowded.captains)near(captain.game.state.person.health,single.owner.game.state.person.health);
});

test('an actual outside pulse harms the occupied foreign deck while its ashore owner and the visitor’s own hull remain untouched',async()=>{
 const f=await fixture(2),{realm,owner,vessel,room,captains:[,guest]}=f;
 realm._landCharacter(owner,'hearth','kettle');const personalHull=realm.vessels.get(guest.ownedVesselId),original=personalHull.ship.hull;
 const shot={id:'outside-hit',owner:'pirate',ownerId:'pirate',vesselId:'pirate',x:vessel.ship.x-vessel.ship.radius-20,y:vessel.ship.y,vx:500,vy:0,ttl:2,damage:vessel.ship.maxHull*.2,radius:4};
 Object.assign(guest.game.state.person,impactSection(vessel.ship,{bullet:shot}).point);realm._actor(vessel)._hitTimer=10;room.runtime.bullets.push(shot);
 tick(realm);
 assert.ok(guest.game.state.person.health<100);assert.equal(owner.game.state.person.health,100);assert.equal(personalHull.ship.hull,original);assert.equal(personalHull.ship.damageControl.serial,0);
 assert.equal(vessel.ship.damageControl.serial,1);assert.ok(interiorDamageSummary(vessel.ship).alarm);assert.equal(room.runtime.bullets.length,0);
 for(const compact of [false,true]){
  const view=realm.snapshotFor(guest,{compact,drainEvents:false});assert.equal(view.state.ship.id,vessel.id);assert.deepEqual(view.state.ship.damageControl,vessel.ship.damageControl);
 }
});

test('shared damage control spends the actual vessel’s stores and enforces reach, grants, cooldown and rejected-action immutability',async()=>{
 const f=await fixture(2),{realm,owner,vessel,captains:[,guest]}=f,{section}=hit(f),personalHull=realm.vessels.get(guest.ownedVesselId);
 vessel.grants[guest.id]={allowed:true,roles:['passenger']};realm._inventoryFor(vessel).cargo.ore=3;guest.game.state.cargo.ore=17;
 const originalCharge=personalHull.ship.energy,damagedHull=vessel.ship.hull,untouched=structuredClone(vessel.ship.damageControl);
 assert.equal(realm._command(guest,'damageControl',{sectionId:section.id,action:'patch'}).code,'permission');assert.deepEqual(vessel.ship.damageControl,untouched);
 Object.assign(guest.game.state.person,section);const charge=vessel.ship.energy;
 ok(realm._command(guest,'damageControl',{sectionId:section.id,action:'suppress'}));assert.equal(vessel.ship.energy,charge-2);assert.equal(personalHull.ship.energy,originalCharge);assert.equal(guest.game.state.cargo.ore,17);
 assert.equal(realm._command(guest,'damageControl',{sectionId:section.id,action:'suppress'}).code,'cooldown');
 vessel.grants[guest.id].roles.push('engineering');guest.damageControlUntil=0;guest.game.state.person.x=-100;
 const before=structuredClone(vessel.ship.damageControl);assert.equal(realm._command(guest,'damageControl',{sectionId:section.id,action:'patch'}).code,'distance');assert.deepEqual(vessel.ship.damageControl,before);
 Object.assign(guest.game.state.person,section);ok(realm._command(guest,'damageControl',{sectionId:section.id,action:'patch'}));
 assert.equal(realm._inventoryFor(vessel).cargo.ore,2);assert.equal(guest.game.state.cargo.ore,17);assert.equal(vessel.ship.hull,damagedHull);assert.equal(section.breach,0);
 assert.equal(realm._command(owner,'damageControl',{sectionId:section.id,action:'invent'}).code,'action');
});

test('save, authority restart and reconnect preserve damage, injuries, motion and a guest’s valid pose on the actual larger hull',async()=>{
 const f=await fixture(2),{realm,vessel,captains:[,guest]}=f;hit(f);const layout=cabinLayout(vessel.ship.classId),position=layout.stations.engineering;
 assert.ok(!isCabinWalkable(cabinLayout('sparrow'),position.x,position.y,6));Object.assign(guest.game.state.person,position);Object.assign(vessel.ship,{vx:17,vy:-4,angularVelocity:.12});
 const before=structuredClone(vessel.ship.damageControl),health=guest.game.state.person.health,document=realm.document();
 const restored=new Realm({id:realm.id,snapshot:document,persistence:storage()}),captain=restored.captains.get(guest.id),ship=restored.vessels.get(vessel.id).ship;
 assert.deepEqual(ship.damageControl,before);assert.equal(captain.game.state.person.health,health);assert.equal(captain.aboard,vessel.id);assert.equal(ship.vx,17);assert.equal(ship.vy,-4);assert.equal(ship.angularVelocity,.12);
 restored.attach(captain,{close(){}});assert.equal(captain.game.state.person.x,position.x);assert.equal(captain.game.state.person.y,position.y);
 const invalid=realm.document();invalid.captains[guest.id].game.person.x=-200;invalid.captains[guest.id].game.person.y=-200;
 const migrated=new Realm({id:realm.id,snapshot:invalid,persistence:storage()}),person=migrated.captains.get(guest.id).game.state.person;
 assert.ok(isCabinWalkable(layout,person.x,person.y,6));assert.equal(person.health,health);assert.deepEqual(migrated.vessels.get(vessel.id).ship.damageControl,before);
});

test('PvP crew injuries use moving deck actors and persist on the real hired crew member',async()=>{
 const f=await fixture(1,'sparrow'),{realm,owner,vessel}=f,ship=vessel.ship,details={sourceX:ship.x+200,sourceY:ship.y},point=impactSection(ship,details).point;
 owner.game.state.crew=[{id:'guard',name:'Hired guard',role:'security',health:100,maxHealth:140,status:'active'}];
 const pvp=realm._ensurePvP(vessel),guard=pvp.crewActors[0];Object.assign(guard,point);Object.assign(owner.game.state.person,cabinLayout(ship.classId).spawn);
 realm._actor(vessel)._damageShip(22,details);assert.ok(owner.game.state.crew[0].health<100);assert.equal(realm._crewActors(vessel)[0].health,owner.game.state.crew[0].health);
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:storage()});assert.equal(restored._crewFor(restored.vessels.get(vessel.id))[0].health,owner.game.state.crew[0].health);
});

test('rescue occupants and sleeping people share physical hazards without multiplying their damage',async()=>{
 const f=await fixture(3),{realm,vessel,captains:[owner,guest,other]}=f,{section}=hit(f);vessel.ship.rescueGroups=[{id:'survivors',shipId:vessel.id,status:'aboard',members:[{id:'rescued-1',name:'Traveller',...section,health:68,maxHealth:68,status:'aboard'}]}];
 const health=guest.game.state.person.health;guest.session=null;guest.disconnectUntil=0;tick(realm);
 assert.ok(guest.game.state.person.health<health);assert.ok(vessel.ship.rescueGroups[0].members[0].health<68);near(vessel.ship.damageControl.clock,.1);
 const saved=realm.document(),restored=new Realm({id:realm.id,snapshot:saved,persistence:storage()});
 assert.equal(restored.captains.get(guest.id).game.state.person.health,guest.game.state.person.health);assert.equal(restored.vessels.get(vessel.id).ship.rescueGroups[0].members[0].health,vessel.ship.rescueGroups[0].members[0].health);
 restored.attach(restored.captains.get(owner.id),{close(){}});
 const sleepers=[guest,other].map(c=>restored.captains.get(c.id));for(const captain of sleepers)captain.disconnectUntil=0;
 const before=sleepers.map(c=>c.game.state.person.health);tick(restored);
 for(let i=0;i<sleepers.length;i++)assert.ok(sleepers[i].game.state.person.health<before[i],'Every restored physical sleeper is exposed, even before a network identity is rebound.');
 near(before[0]-sleepers[0].game.state.person.health,before[1]-sleepers[1].game.state.person.health);
});

test('an interior casualty recovers at a safe berth while the real damaged hull and other occupants stay in space',async()=>{
 const f=await fixture(2),{realm,owner,vessel,captains:[,guest]}=f;owner.game.state.person.health=1;const{section}=hit(f),before={x:vessel.ship.x,y:vessel.ship.y,hull:vessel.ship.hull,damage:section.damage,breach:section.breach};
 assert.equal(owner.game.state.person.down,true);tick(realm,40);assert.equal(owner.aboard,vessel.id);
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence:storage()}),patient=restored.captains.get(owner.id),friend=restored.captains.get(guest.id),physical=restored.vessels.get(vessel.id);
 for(const captain of [patient,friend])restored.attach(captain,{close(){}});tick(restored,12);
 assert.equal(patient.aboard,null);assert.equal(patient.game.state.mode,'person');assert.equal(patient.game.state.locationId,'kettle');assert.equal(patient.game.state.person.down,false);assert.equal(patient.game.state.person.health,55);
 assert.equal(friend.aboard,vessel.id);assert.equal(physical.dockedAt,null);assert.equal(physical.ship.x,before.x);assert.equal(physical.ship.y,before.y);assert.equal(physical.ship.hull,before.hull);
 const damaged=physical.ship.damageControl.sections.find(value=>value.id===section.id);assert.equal(damaged.damage,before.damage);assert.equal(damaged.breach,before.breach);assert.ok(damaged.fire>0);
});

test('a fatal hit still destroys the physical ship when its last engineer dies in the same impact',async()=>{
 const f=await fixture(1,'sparrow'),{realm,owner,vessel}=f,details={sourceX:vessel.ship.x+200,sourceY:vessel.ship.y},point=impactSection(vessel.ship,details).point;
 owner.game.state.crew=[{id:'engineer',name:'Engineer',role:'engineer',health:1,maxHealth:100,status:'injured'}];
 vessel.pvp={phase:'repelled',crewActors:[{id:'crew:engineer',crewId:'engineer',...point,health:1}]};vessel.ship.hull=10;
 realm._actor(vessel)._damageShip(100,details);assert.equal(vessel.ship.hull,0);assert.equal(vessel.destroyed,true);
 assert.equal(realm._crewFor(vessel)[0].health,0);assert.equal(owner.aboard,null);assert.notEqual(owner.ownedVesselId,vessel.id);
});
