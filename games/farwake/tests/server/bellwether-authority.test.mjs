import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { BELLWETHER_ID, isBellwether } from '../../dist/exploration.mjs';

const key='hearth:tinbell:hollow',point=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function storage(){return{kind:'memory',snapshot:null,version:0,async save(id,version,snapshot){this.snapshot=structuredClone(snapshot);this.version=version+1;return{version:this.version};}};}
async function fixture(count=2){
 const persistence=storage(),realm=new Realm({id:'BELLTEST',seed:'shared-bellwether',persistence}),captains=[];
 for(let index=0;index<count;index++){
  const {captain}=await realm.createCaptain(`Explorer ${index+1}`);ok(realm.attach(captain,{close(){}}));captains.push(captain);
  const body=realm._room('hearth').runtime.bodies.find(body=>body.id==='tinbell'),vessel=realm.vessels.get(captain.ownedVesselId);
  Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(await realm.command(captain,'dock',{id:'tinbell'}));
 }
 const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];
 return{realm,captains,persistence};
}
function atEntity(realm,captain,type,predicate=()=>true){const entity=realm._surface(captain).entities.find(entity=>entity.type===type&&predicate(entity));assert.ok(entity);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
async function enter(realm,captain){atEntity(realm,captain,'siteEntrance',entity=>entity.data.siteId==='hollow');ok(await realm.command(captain,'enterSite',{siteId:'hollow'}));}
async function leave(realm,captain){atEntity(realm,captain,'siteExit');ok(await realm.command(captain,'exitSite',{}));}
function tick(realm,inputs=new Map(),count=1){for(let frame=0;frame<count;frame++){for(const c of realm.captains.values())if(c.session)realm.acceptInput(c,c.inputSeq+1,inputs.get(c.id)||{});realm.step(1/30,realm.tick+1,Date.now());}}
async function enterAll(f){for(const captain of f.captains)await enter(f.realm,captain);return f.realm.sites[key];}
function revealAndWound(f){
 const captain=f.captains[0];Object.assign(captain.game.state.person,point(27,11));tick(f.realm,new Map([[captain.id,{fire:true}]]));return f.realm.sites[key].monsters[0];
}
async function restart(f){
 f.realm.markDirty();await f.realm.flush();const realm=new Realm({id:f.realm.id,snapshot:structuredClone(f.persistence.snapshot),persistence:f.persistence,version:f.persistence.version}),captains=f.captains.map(c=>realm.captains.get(c.id));
 for(const captain of captains)ok(realm.attach(captain,{close(){}}));return{realm,captains,persistence:f.persistence};
}

test('one or four captains share one Bellwether, one combat tick and one authoritative scream per recipient',async()=>{
 const outcomes=[];
 for(const count of [1,4]){
  const f=await fixture(count),encounter=await enterAll(f);assert.equal(encounter.monsters.filter(isBellwether).length,1);assert.equal(encounter.monsters.length,1);
  for(const captain of f.captains)assert.equal(captain.game.state.exploration.encounter,encounter);
  const time=encounter.time,boss=revealAndWound(f);assert.equal(encounter.time,time+1/30);assert.equal(boss.health,1496);
  for(const captain of f.captains){
   const snapshot=f.realm.snapshotFor(captain,{compact:true}),reveals=snapshot.events.filter(event=>event.type==='monster-revealed');
   assert.equal(reveals.length,1);assert.equal(reveals[0].id,`${encounter.id}:reveal:1`);assert.equal(snapshot.state.exploration.encounter.monsters[0].id,BELLWETHER_ID);
  }
  outcomes.push(Object.fromEntries(['x','y','health','phase','windup','revealed','revealSerial'].map(field=>[field,boss[field]])));
  tick(f.realm);for(const captain of f.captains)assert.equal(f.realm.snapshotFor(captain).events.filter(event=>event.type==='monster-revealed').length,0);
 }
 assert.deepEqual(outcomes[0],outcomes[1],'additional idle captains do not multiply movement, damage or reveals');
});

test('an ally still alive inside prevents a reset when another captain leaves or is downed',async()=>{
 const f=await fixture(),[one,two]=f.captains;await enterAll(f);const boss=revealAndWound(f),health=boss.health;
 await leave(f.realm,one);assert.equal(boss.health,health);assert.equal(boss.revealed,true);assert.equal(f.realm.sites[key].attemptSerial,0);
 await enter(f.realm,one);Object.assign(one.game.state.person,{health:0,down:true});tick(f.realm);
 assert.equal(boss.health,health);assert.equal(boss.revealed,true,'a living ally keeps the same attempt');
 Object.assign(two.game.state.person,{health:0,down:true});tick(f.realm);
 assert.equal(boss.health,1500);assert.equal(boss.phase,'dormant');assert.equal(boss.revealed,false);assert.equal(f.realm.sites[key].attemptSerial,1);
});

test('last departure and last disconnect reset living attempts, while reconnects and late joins cannot replay old screams',async()=>{
 const f=await fixture(),[one,two]=f.captains;await enterAll(f);const boss=revealAndWound(f);
 await leave(f.realm,one);assert.equal(boss.health,1496);await leave(f.realm,two);
 assert.equal(boss.health,1500);assert.equal(boss.phase,'dormant');assert.equal(f.realm.sites[key].attemptSerial,1);
 await enterAll(f);revealAndWound(f);const serial=f.realm.sites[key].revealSerial;
 f.realm.detach(one,one.session);assert.equal(boss.health,1496,'one disconnect cannot reset an ally’s fight');
 f.realm.detach(two,two.session);assert.equal(boss.health,1500);assert.equal(boss.phase,'dormant');assert.equal(f.realm.sites[key].attemptSerial,2);
 tick(f.realm,new Map(),3);assert.equal(boss.revealed,false,'disconnected grace-period bodies cannot reawaken it');
 ok(f.realm.attach(one,{close(){}}));assert.equal(f.realm.snapshotFor(one).events.filter(event=>event.type==='monster-revealed').length,0);
 Object.assign(one.game.state.person,point(27,11));tick(f.realm);const event=f.realm.snapshotFor(one).events.find(event=>event.type==='monster-revealed');
 assert.ok(event);assert.equal(event.serial,serial+1);
 ok(f.realm.attach(two,{close(){}}));assert.equal(f.realm.snapshotFor(two).events.filter(event=>event.type==='monster-revealed').length,0,'late join receives current state rather than a historical reveal');
});

test('active realm restart keeps current wounds and reveal identity without replaying the encounter',async()=>{
 const f=await fixture();await enterAll(f);const boss=revealAndWound(f),expected={health:boss.health,revealSerial:f.realm.sites[key].revealSerial,x:boss.x,y:boss.y};
 const resumed=await restart(f),state=resumed.realm.sites[key],restored=state.monsters[0];
 assert.equal(resumed.captains[0].game.state.exploration.encounter,state);assert.equal(resumed.captains[1].game.state.exploration.encounter,state);
 assert.equal(restored.health,expected.health);assert.equal(restored.x,expected.x);assert.equal(restored.y,expected.y);assert.equal(restored.revealed,true);assert.equal(state.revealSerial,expected.revealSerial);
 for(const captain of resumed.captains)assert.equal(resumed.realm.snapshotFor(captain).events.filter(event=>event.type==='monster-revealed').length,0);
 tick(resumed.realm);assert.equal(state.monsters.filter(isBellwether).length,1);assert.equal(state.revealSerial,expected.revealSerial);
});

test('new content replaces old generic wildlife without repaying old loot, and Bellwether death persists',async()=>{
 const f=await fixture();f.realm.sites[key]={id:'tinbell:site:hollow',siteId:'hollow',visited:4,cleared:true,collected:['survey-case'],monsters:[{id:'tinbell:site:hollow:wildlife:0',health:0},{id:'tinbell:site:hollow:wildlife:1',health:0}]};
 const state=await enterAll(f),boss=state.monsters[0],captain=f.captains[0];
 assert.equal(state.monsters.length,1);assert.equal(boss.id,BELLWETHER_ID);assert.equal(boss.health,1500);assert.deepEqual(state.collected,['survey-case']);
 Object.assign(captain.game.state.person,{...point(27,11),ownedWeapons:['pulse-sidearm','breach-rifle'],weapon:'breach-rifle'});boss.health=72;
 tick(f.realm,new Map([[captain.id,{fire:true}]]));assert.equal(boss.health,0);assert.equal(state.cleared,true);
 const credits=captain.game.state.credits,cache=atEntity(f.realm,captain,'siteCache');assert.equal((await f.realm.command(captain,'siteAction',{entityId:cache.id,action:'collect'})).ok,false);assert.equal(captain.game.state.credits,credits);
 for(const c of f.captains)await leave(f.realm,c);assert.equal(boss.health,0);await enterAll(f);assert.equal(state.monsters[0].health,0);
 const resumed=await restart(f);assert.equal(resumed.realm.sites[key].monsters[0].health,0);assert.equal(resumed.realm.sites[key].cleared,true);assert.deepEqual(resumed.realm.sites[key].collected,['survey-case']);
});

test('the authority ignores client damage and weapon claims and exposes no reset action',async()=>{
 const f=await fixture(1);await enterAll(f);const captain=f.captains[0],state=f.realm.sites[key];Object.assign(captain.game.state.person,point(27,11));
 tick(f.realm,new Map([[captain.id,{fire:true,damage:99999,armorPiercing:9999,weaponId:'breach-rifle',ownedWeapons:['breach-rifle']}]]));assert.equal(state.monsters[0].health,1496);
 const time=state.time,health=state.monsters[0].health;
 assert.equal((await f.realm.command(captain,'resetSiteBoss',{key})).ok,false);assert.equal(state.monsters[0].health,health);assert.equal(state.time,time);
 assert.equal((await f.realm.command(captain,'enterSite',{siteId:'hollow'})).ok,false,'entering again from inside cannot reset wounds');assert.equal(state.monsters[0].health,health);
});
