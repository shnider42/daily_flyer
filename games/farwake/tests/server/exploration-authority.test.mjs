import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {SIDEARM,clearSidearmSight,sidearmAim} from '../../dist/combat.mjs';
import {isWalkable} from '../../dist/surface.mjs';
import {getShipClass,STARTER_SHIP_IDS} from '../../dist/fleet.mjs';
import {DEFAULT_APPEARANCE} from '../../dist/character.mjs';

function storage(){return{kind:'memory',snapshot:null,version:0,async save(id,version,snapshot){this.snapshot=structuredClone(snapshot);this.version=version+1;return{version:this.version};}};}
const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
async function fixture(options=[{},{}]){
 const persistence=storage(),realm=new Realm({id:'EXPLORE1',seed:'shared-expeditions',persistence}),captains=[];
 for(let index=0;index<options.length;index++){const {captain}=await realm.createCaptain(`Explorer ${index+1}`,options[index]);ok(realm.attach(captain,{close(){}}));captains.push(captain);}
 const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];room.runtime.signals=[];
 return{realm,captains,persistence};
}
async function land(realm,captain,bodyId='morrow'){
 const vessel=realm.vessels.get(captain.ownedVesselId),body=realm._room('hearth').runtime.bodies.find(item=>item.id===bodyId);assert.ok(body,bodyId);
 Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(await realm.command(captain,'dock',{id:bodyId}));
 assert.equal(captain.game.state.locationId,bodyId);return realm._surface(captain);
}
function placeAt(realm,captain,type,predicate=()=>true){const entity=realm._surface(captain).entities.find(item=>item.type===type&&predicate(item));assert.ok(entity,`No ${type} on this surface`);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
async function enter(realm,captain,siteId='chalkfold'){
 const entrance=placeAt(realm,captain,'siteEntrance',entity=>entity.data.siteId===siteId);const back={x:entrance.x,y:entrance.y};ok(await realm.command(captain,'enterSite',{siteId}));assert.equal(captain.game.state.exploration.siteId,siteId);return back;
}
async function exit(realm,captain){placeAt(realm,captain,'siteExit');ok(await realm.command(captain,'exitSite',{}));}
function tick(realm,inputs=new Map(),count=1){for(let i=0;i<count;i++){for(const captain of realm.captains.values())if(captain.session)realm.acceptInput(captain,captain.inputSeq+1,inputs.get(captain.id)||{});realm.step(1/30,realm.tick+1,Date.now());}}
function aimPosition(realm,captain,monster){
 const surface=realm._surface(captain),layout=surface.combatLayout;
 for(const radius of [96,120,144,72])for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,point={x:monster.x+Math.cos(angle)*radius,y:monster.y+Math.sin(angle)*radius};
  if(!isWalkable(surface,point.x,point.y)||!clearSidearmSight(layout,point,monster))continue;
  const aim={fire:true,aiming:true,aimX:(monster.x-point.x)/radius,aimY:(monster.y-point.y)/radius};
  if(sidearmAim(point,captain.game.state.exploration.encounter.monsters,aim,layout).targetId!==monster.id)continue;
  Object.assign(captain.game.state.person,point);return aim;
 }
 assert.fail('No reachable clear firing position near the fixture monster');
}
function clearWildlife(realm,captain){
 for(let i=0;i<180&&captain.game.state.exploration.encounter.monsters.some(monster=>monster.health>0);i++){
  const monster=captain.game.state.exploration.encounter.monsters.find(monster=>monster.health>0),aim=aimPosition(realm,captain,monster);tick(realm,new Map([[captain.id,aim]]));
 }
 assert.ok(captain.game.state.exploration.encounter.monsters.every(monster=>monster.health===0),'explicit sidearm shots clear wildlife');
}
async function restart(f){
 f.realm.markDirty();await f.realm.flush();const realm=new Realm({id:f.realm.id,version:f.persistence.version,snapshot:structuredClone(f.persistence.snapshot),persistence:f.persistence});
 const captains=f.captains.map(original=>realm.captains.get(original.id));for(const captain of captains)ok(realm.attach(captain,{close(){}}));return{realm,captains,persistence:f.persistence};
}

test('captains inside the same site share one combat clock and wounds, while rewards cannot be collected twice',async()=>{
 const f=await fixture(),{realm,captains:[one,two]}=f;await land(realm,one);await land(realm,two);await enter(realm,one);await enter(realm,two);
 const shared=one.game.state.exploration.encounter;assert.equal(shared,two.game.state.exploration.encounter);assert.equal(shared,realm.sites[one.game.state.exploration.key]);assert.equal(realm.roomInfo(one).id,realm.roomInfo(two).id);
 const health=shared.monsters.map(monster=>monster.health),time=shared.time;tick(realm);assert.ok(Math.abs(shared.time-time-1/30)<1e-9,'an occupied site advances once, not once per person');assert.deepEqual(shared.monsters.map(monster=>monster.health),health,'idle players do not shoot automatically');
 const target=shared.monsters[0],before=target.health,aim=aimPosition(realm,one,target);tick(realm,new Map([[one.id,aim]]));assert.equal(target.health,before-SIDEARM.damage);assert.equal(two.game.state.exploration.encounter.monsters[0].health,target.health);
 assert.equal(realm.snapshotFor(two,{compact:true}).state.exploration.encounter.monsters[0].health,target.health);assert.ok(realm.snapshotFor(two).players.some(player=>player.captainId===one.id));
 clearWildlife(realm,one);const cache=placeAt(realm,one,'siteCache'),otherCache=placeAt(realm,two,'siteCache'),oneCredits=one.game.state.credits,twoCredits=two.game.state.credits;
 const result=ok(await realm.command(one,'siteAction',{entityId:cache.id,action:'collect'},'shared-cache-claim'));assert.equal(one.game.state.credits,oneCredits+result.credits);assert.equal(two.game.state.credits,twoCredits);
 assert.equal((await realm.command(two,'siteAction',{entityId:otherCache.id,action:'collect'})).ok,false);
 ok(await realm.command(one,'siteAction',{entityId:cache.id,action:'collect'},'shared-cache-claim'));assert.equal(one.game.state.credits,oneCredits+result.credits,'retrying an acknowledged request cannot mint another reward');
 const restored=await restart(f),[returned,friend]=restored.captains;assert.equal(returned.game.state.exploration.encounter,friend.game.state.exploration.encounter);assert.ok(returned.game.state.exploration.encounter.monsters.every(monster=>monster.health===0));
 placeAt(restored.realm,friend,'siteCache');assert.equal((await restored.realm.command(friend,'siteAction',{entityId:cache.id,action:'collect'})).ok,false);assert.equal(friend.game.state.credits,twoCredits);assert.equal(returned.game.state.credits,oneCredits+result.credits);
});

test('separate surface sites have independent monsters and clocks, and do not leak occupants or claims',async()=>{
 const {realm,captains:[one,two]}=await fixture();await land(realm,one);await land(realm,two,'tinbell');await enter(realm,one);await enter(realm,two,'hollow');
 const first=one.game.state.exploration,second=two.game.state.exploration;assert.notEqual(first.key,second.key);assert.notEqual(first.encounter,second.encounter);assert.notEqual(realm.roomInfo(one).id,realm.roomInfo(two).id);
 const health=second.encounter.monsters.map(monster=>monster.health),firstTime=first.encounter.time,secondTime=second.encounter.time;
 const target=first.encounter.monsters[0],before=target.health;tick(realm,new Map([[one.id,aimPosition(realm,one,target)]]));
 assert.equal(target.health,before-SIDEARM.damage);assert.deepEqual(second.encounter.monsters.map(monster=>monster.health),health);assert.ok(Math.abs(first.encounter.time-firstTime-1/30)<1e-9);assert.ok(Math.abs(second.encounter.time-secondTime-1/30)<1e-9);
 assert.ok(!realm.snapshotFor(one).players.some(player=>player.captainId===two.id));assert.ok(!realm.snapshotFor(two).players.some(player=>player.captainId===one.id));
 first.encounter.collected.push('field-kit');assert.deepEqual(second.encounter.collected,[]);
});

test('site entry, records, loot, and exits require physical proximity, and retreat preserves monster wounds',async()=>{
 const {realm,captains:[captain]}=await fixture([{}]);await land(realm,captain);
 assert.equal((await realm.command(captain,'enterSite',{siteId:'chalkfold'})).code,'distance');assert.equal(captain.game.state.exploration,null);
 const back=await enter(realm,captain),surface=realm._surface(captain),record=surface.entities.find(entity=>entity.type==='siteRecord'),cache=surface.entities.find(entity=>entity.type==='siteCache');
 assert.equal((await realm.command(captain,'siteAction',{entityId:record.id,action:'inspect'})).code,'distance');assert.equal((await realm.command(captain,'siteAction',{entityId:cache.id,action:'collect'})).code,'distance');
 const target=captain.game.state.exploration.encounter.monsters[0],aim=aimPosition(realm,captain,target);tick(realm,new Map([[captain.id,aim]]));const wounded=target.health;
 assert.equal((await realm.command(captain,'exitSite',{})).code,'distance');assert.ok(captain.game.state.exploration);
 placeAt(realm,captain,'siteRecord');ok(await realm.command(captain,'siteAction',{entityId:record.id,action:'inspect'}));
 placeAt(realm,captain,'siteCache');assert.equal((await realm.command(captain,'siteAction',{entityId:cache.id,action:'collect'})).ok,false,'a live threat blocks cache recovery even at its position');
 await exit(realm,captain);assert.equal(captain.game.state.exploration,null);assert.equal(captain.game.state.locationId,'morrow');assert.deepEqual({x:captain.game.state.person.x,y:captain.game.state.person.y},back);
 await enter(realm,captain);assert.equal(captain.game.state.exploration.encounter.monsters[0].health,wounded);assert.equal((await realm.command(captain,'enterSite',{siteId:'northwatch'})).ok,false,'entering another place from indoors is rejected');
});

test('a downed explorer finishes field recovery after a long restart without relocating their ship',async()=>{
 const {realm,captains:[captain],persistence}=await fixture([{}]);await land(realm,captain);await enter(realm,captain);
 const active=captain.game.state.exploration,monster=active.encounter.monsters[0],key=active.key;
 tick(realm,new Map([[captain.id,aimPosition(realm,captain,monster)]]));
 assert.ok(monster.health<monster.maxHealth,'wildlife damage precedes the interrupted recovery');
 const point={x:monster.x+20,y:monster.y};assert.ok(isWalkable(realm._surface(captain),point.x,point.y));
 Object.assign(captain.game.state.person,point,{health:1});
 for(let i=0;i<60&&captain.game.state.person.health>0;i++)tick(realm);
 assert.equal(captain.game.state.person.health,0);assert.equal(captain.game.state.person.down,true);assert.ok(captain.game._siteDownTime<2.5);
 const vessel=realm.vessels.get(captain.ownedVesselId),pose={x:vessel.ship.x,y:vessel.ship.y,hull:vessel.ship.hull,dockedAt:vessel.dockedAt},credits=captain.game.state.credits,wounds=active.encounter.monsters.map(value=>value.health);
 realm.markDirty();await realm.flush();const snapshot=structuredClone(persistence.snapshot);
 snapshot.captains[captain.id].lastSeen=Date.now()-31000;
 const restored=new Realm({id:realm.id,snapshot,persistence,version:persistence.version}),returned=restored.captains.get(captain.id);
 ok(restored.attach(returned,{close(){}}));
 assert.equal(returned.game.state.locationId,'morrow');assert.equal(returned.game.state.mode,'person');assert.equal(returned.game.state.interior,null);assert.equal(returned.game.state.exploration,null);assert.equal(returned.aboard,null);
 assert.equal(returned.game.state.person.health,Math.round(returned.game.state.person.maxHealth*.35));assert.equal(returned.game.state.person.down,false);assert.equal(returned.game.state.credits,credits-Math.floor(credits*.1));
 assert.deepEqual({x:returned.game.state.person.x,y:returned.game.state.person.y},restored._surface(returned).spawn,'recovery returns to the same planetary landing zone');
 const parked=restored.vessels.get(returned.ownedVesselId);assert.deepEqual({x:parked.ship.x,y:parked.ship.y,hull:parked.ship.hull,dockedAt:parked.dockedAt},pose,'the physical vessel remains at Morrow');
 assert.deepEqual(restored.sites[key].monsters.map(value=>value.health),wounds);assert.equal(returned.game.state.explorationRecords,restored.sites);
 const after=returned.game.state.credits;ok(restored.attach(returned,{close(){}}));assert.equal(returned.game.state.credits,after,'reconnecting cannot apply the recovery fee twice');
});

test('surface decisions are shared, persisted, and remain one-time after either captain returns',async()=>{
 const f=await fixture(),{realm,captains:[one,two]}=f;for(const captain of [one,two]){await land(realm,captain);await enter(realm,captain,'orchard-pump');}
 const first=placeAt(realm,one,'siteChoice'),second=placeAt(realm,two,'siteChoice'),before=one.game.state.credits,otherBefore=two.game.state.credits;
 const inspected=ok(await realm.command(one,'siteAction',{entityId:first.id,action:'inspect'}));assert.ok(inspected.choice.options.some(option=>option.id==='restore'));
 assert.equal((await realm.command(one,'siteAction',{entityId:first.id,action:'choose',optionId:'give-me-million-credits'})).ok,false);assert.equal(one.game.state.credits,before);
 const restored=ok(await realm.command(one,'siteAction',{entityId:first.id,action:'choose',optionId:'restore'}));assert.equal(one.game.state.credits,before+restored.credits);assert.equal(two.game.state.credits,otherBefore);
 assert.equal((await realm.command(two,'siteAction',{entityId:second.id,action:'choose',optionId:'salvage'})).ok,false);assert.equal(ok(await realm.command(two,'siteAction',{entityId:second.id,action:'inspect'})).chosen,'restore');
 await exit(realm,one);await enter(realm,one,'orchard-pump');assert.equal(one.game.state.exploration.encounter.choices['water-line'],'restore');
 const saved=await restart(f),returned=saved.captains[0];placeAt(saved.realm,returned,'siteChoice');assert.equal((await saved.realm.command(returned,'siteAction',{entityId:first.id,action:'choose',optionId:'restore'})).ok,false);assert.equal(returned.game.state.credits,before+restored.credits);
});

test('authority accepts only starter hulls and bounded character choices, with traits locked after creation',async()=>{
 const selected={appearance:{skin:'deep',suit:'rust',hair:'silver',style:'hood'},traits:['long_stride','hot_cell','bulkhead_born','long_stride','made-up-trait'],modifiers:{maxHealth:999},characterLocked:false};
 const f=await fixture([{starterShip:'mule',character:selected},{starterShip:'capital',character:{appearance:{skin:'javascript:alert(1)',suit:'#fff',hair:null,style:'outside-catalog'},traits:['immortal'],health:9000}}]);
 const {realm,captains:[selectedCaptain,invalidCaptain]}=f;
 assert.equal(selectedCaptain.game.state.ship.classId,'mule');assert.deepEqual(selectedCaptain.game.state.fleet.owned,['mule']);assert.equal(selectedCaptain.game.state.credits,180);assert.equal(selectedCaptain.game.state.ship.maxHull,getShipClass('mule').stats.maxHull);
 assert.deepEqual(selectedCaptain.game.state.character.appearance,selected.appearance);assert.deepEqual(selectedCaptain.game.state.character.traits,['long_stride','hot_cell']);assert.equal(selectedCaptain.game.state.person.maxHealth,85);assert.equal(selectedCaptain.game.state.characterLocked,true);
 assert.equal(invalidCaptain.game.state.ship.classId,'sparrow');assert.deepEqual(invalidCaptain.game.state.character.appearance,DEFAULT_APPEARANCE);assert.deepEqual(invalidCaptain.game.state.character.traits,[]);assert.equal(invalidCaptain.game.state.person.maxHealth,100);
 assert.equal((await realm.command(selectedCaptain,'customizeCharacter',{chooseTraits:true,traits:['bulkhead_born'],characterLocked:false})).code,'locked');
 ok(await realm.command(selectedCaptain,'customizeCharacter',{appearance:{skin:'olive',suit:'moss',hair:'brown',style:'crop'},traits:['bulkhead_born'],modifiers:{walkSpeed:99}}));assert.deepEqual(selectedCaptain.game.state.character.traits,['long_stride','hot_cell']);assert.equal(selectedCaptain.game.state.character.appearance.suit,'moss');assert.equal(selectedCaptain.game.state.person.maxHealth,85);
 for(const id of STARTER_SHIP_IDS){const {captain}=await realm.createCaptain('Starter',{starterShip:id});assert.equal(captain.game.state.ship.classId,id);assert.deepEqual(captain.game.state.fleet.owned,[id]);assert.equal(captain.game.state.credits,180);}
 const saved=await restart(f),returned=saved.captains[0];assert.equal(returned.game.state.character.appearance.suit,'moss');assert.equal(returned.game.state.characterLocked,true);assert.deepEqual(returned.game.state.character.traits,['long_stride','hot_cell']);assert.equal((await saved.realm.command(returned,'customizeCharacter',{chooseTraits:true,traits:[]})).code,'locked');
});
