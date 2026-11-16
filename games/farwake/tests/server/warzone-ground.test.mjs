import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {warzoneGroundHostiles,WARZONE_GROUND_SITE_ID} from '../../dist/warzone-ground.mjs';
import {sidearmAim} from '../../dist/combat.mjs';
import {isWalkable} from '../../dist/surface.mjs';
const ok=value=>{assert.equal(value?.ok,true,value?.reason);return value;};
const persistence=()=>({kind:'memory',version:0,snapshot:null,async save(_id,version,snapshot){this.snapshot=structuredClone(snapshot);this.version=version+1;return{version:this.version};}});
const session=()=>({close(){}});
async function fixture(count=2){const storage=persistence(),realm=new Realm({id:'ASHFALL1',seed:'ashfall-authority',persistence:storage}),captains=[];for(let i=0;i<count;i++){const{captain}=await realm.createCaptain(`Relief captain ${i+1}`,{startMode:'hardcore'});ok(realm.attach(captain,session()));realm._landCharacter(captain,'crosswind','crosswind-vey');const entry=place(realm,captain,e=>e.type==='siteEntrance'&&e.data?.siteId===WARZONE_GROUND_SITE_ID);assert.ok(entry);ok(await realm.command(captain,'enterSite',{siteId:WARZONE_GROUND_SITE_ID}));captains.push(captain);}return{realm,captains,storage};}
function place(realm,captain,predicate){const entity=realm._surface(captain).entities.find(predicate);assert.ok(entity);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
function object(realm,captain,id){return place(realm,captain,e=>e.data?.choiceId===id);}
async function choose(realm,captain,id,optionId,requestId){const entity=object(realm,captain,id);return ok(await realm.command(captain,'siteAction',{entityId:entity.id,action:'choose',optionId},requestId));}
function step(realm,count=1){for(let i=0;i<count;i++){for(const captain of realm.captains.values())if(captain.session)realm.acceptInput(captain,captain.inputSeq+1,{});realm.step(.1,realm.tick+1,Date.now());}}
async function restart(f){f.realm.markDirty();await f.realm.flush();const realm=new Realm({id:f.realm.id,version:f.storage.version,snapshot:structuredClone(f.storage.snapshot),persistence:f.storage}),captains=f.captains.map(c=>realm.captains.get(c.id));for(const c of captains)ok(realm.attach(c,session()));return{realm,captains,storage:f.storage};}

test('Ashfall captains share one encounter and one clock while snapshots hide future battle rolls',async()=>{
 const{realm,captains:[one,two]}=await fixture(),encounter=one.game.state.exploration.encounter;assert.equal(encounter,two.game.state.exploration.encounter);assert.equal(encounter,realm.sites[one.game.state.exploration.key]);assert.equal(realm.roomInfo(one).id,realm.roomInfo(two).id);
 const before=encounter.time;step(realm);assert.ok(Math.abs(encounter.time-before-.1)<1e-9,'the shared war advances once per room');
 for(const compact of[false,true]){const snap=realm.snapshotFor(one,{compact,drainEvents:false}),publicWar=snap.state.exploration.encounter.warzoneGround;assert.equal(publicWar.phase,encounter.warzoneGround.phase);for(const field of['rng','nextWave','nextShell','phaseUntil','lastActiveAt','lastSoloAt'])assert.equal(publicWar[field],undefined,field);assert.equal(snap.state.exploration.encounter.monsters.length,36);assert.deepEqual(snap.state.warzoneStories,one.game.state.warzoneStories);}
 assert.ok(Number.isFinite(encounter.warzoneGround.rng),'public snapshot does not mutate canonical RNG');assert.ok(!realm.failed);
});

test('each captain sees their own army relationships and confirmed neutral fire changes only their hostility',async()=>{
 const{realm,captains:[one,two,neutral]}=await fixture(3),encounter=one.game.state.exploration.encounter;
 ok(await realm.command(one,'warzoneAction',{action:'join',factionId:'freewake'}));ok(await realm.command(two,'warzoneAction',{action:'join',factionId:'meridian'}));
 const hostiles=c=>warzoneGroundHostiles(encounter,c.game.explorationParticipant());assert.ok(hostiles(one).every(u=>u.factionId==='meridian'));assert.ok(hostiles(two).every(u=>u.factionId==='freewake'));assert.equal(hostiles(neutral).length,0);
 for(const c of[one,two]){const shown=realm.snapshotFor(c,{drainEvents:false}).state.exploration.encounter.monsters;assert.ok(shown.filter(u=>u.hostile).every(u=>u.factionId!==c.game.warzoneFaction()));assert.equal(shown.filter(u=>u.team==='ally').length,18);}
 one.game.recordWarzoneAggression('freewake',{ground:true});assert.equal(hostiles(one).length,36,'explicit hostility overrides old service or pledge friendship');assert.equal(hostiles(two).length,18);assert.equal(hostiles(neutral).length,0);
 const target=encounter.monsters.find(u=>u.factionId==='meridian'),surface=realm._surface(neutral);let input;
 for(const radius of[72,96,120]){for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:target.x+Math.cos(a)*radius,y:target.y+Math.sin(a)*radius},candidate={fire:true,aiming:true,aimX:-Math.cos(a),aimY:-Math.sin(a)};if(isWalkable(surface,p.x,p.y)&&sidearmAim(p,encounter.monsters,candidate,surface.combatLayout).targetId===target.id){Object.assign(neutral.game.state.person,p);input=candidate;break;}}if(input)break;}
 assert.ok(input);const health=target.health;neutral.appliedInput=input;one.appliedInput={};two.appliedInput={};realm._stepExplorations([one,two,neutral],.1);assert.ok(target.health<health);assert.deepEqual(neutral.game.state.warzone.hostileFactions,['meridian']);assert.deepEqual(two.game.state.warzone.hostileFactions,[]);assert.equal(neutral.game.warzoneFaction(),null,'firing does not automatically pledge military service');assert.ok(!realm.failed);
});

test('disconnected captains receive no passive escort progress while the shared armies continue',async()=>{
 const{realm,captains:[one,two]}=await fixture();await choose(realm,two,'evacuation','accept');await choose(realm,two,'shelter','escort');const task=two.game.state.warzoneStories.evacuation,escort=structuredClone(task.escort),credits=two.game.state.credits;Object.assign(two.game.state.person,{x:escort.x-90,y:escort.y});realm.detach(two,two.session);
 const encounter=one.game.state.exploration.encounter,time=encounter.time;for(let i=0;i<30;i++)realm._stepExplorations([one,two],.1);
 assert.ok(encounter.time>time);assert.equal(task.stage,'escorting');assert.deepEqual(task.escort,escort);assert.equal(two.game.state.credits,credits);assert.ok(!realm.failed);
});

test('physical relief work and rewards stay personal, survive restart, and reject duplicate or forged claims',async()=>{
 let f=await fixture(),[one,two]=f.captains,realm=f.realm;const credits=one.game.state.credits,otherCredits=two.game.state.credits;
 const hospital=realm._surface(one).entities.find(e=>e.data?.choiceId==='hospital');assert.equal((await realm.command(one,'siteAction',{entityId:hospital.id,action:'choose',optionId:'accept'})).code,'distance');
 await choose(realm,one,'hospital','accept');await choose(realm,one,'depot','recover');await choose(realm,one,'generator','theatre');const desk=object(realm,one,'hospital');const args={entityId:desk.id,action:'choose',optionId:'complete'};ok(await realm.command(one,'siteAction',args,'ashfall-pay'));ok(await realm.command(one,'siteAction',args,'ashfall-pay'));assert.equal(one.game.state.credits,credits+180);assert.equal(two.game.state.credits,otherCredits);assert.equal(two.game.state.warzoneStories.hospital.stage,'unasked');
 assert.equal((await realm.command(one,'siteAction',{...args,credits:999999,optionId:'complete'},'forged-repeat')).ok,false);assert.equal(one.game.state.credits,credits+180);
 await choose(realm,two,'hospital','accept');await choose(realm,two,'depot','recover');await choose(realm,two,'generator','triage');await choose(realm,two,'hospital','complete');assert.equal(two.game.state.credits,otherCredits+180);assert.equal(one.game.state.warzoneStories.hospital.allocation,'theatre');assert.equal(two.game.state.warzoneStories.hospital.allocation,'triage');
 await choose(realm,one,'names','accept');await choose(realm,one,'registry','recover');object(realm,one,'names');assert.equal((await realm.command(one,'siteAction',{entityId:object(realm,one,'names').id,action:'choose',optionId:'public'})).ok,false);await choose(realm,one,'tags','recover');await choose(realm,one,'names','public');
 f=await restart(f);realm=f.realm;[one,two]=f.captains;assert.equal(one.game.state.exploration.encounter,two.game.state.exploration.encounter);assert.equal(one.game.state.warzoneStories.names.decision,'public');assert.equal(two.game.state.warzoneStories.names.stage,'unasked');assert.equal(one.game.state.credits,credits+340);assert.equal(two.game.state.credits,otherCredits+180);
 const result=await realm.command(one,'siteAction',{entityId:object(realm,one,'names').id,action:'choose',optionId:'public'});assert.equal(result.ok,false);assert.equal(one.game.state.credits,credits+340);assert.match(ok(await realm.command(one,'siteAction',{entityId:object(realm,one,'hospital').id,action:'inspect'})).text,/theatre is still running/);assert.ok(!realm.failed);
});

test('Lorn dispatch remains personal and single-payment while Orsa and empty-front revisit show saved consequences',async()=>{
 let f=await fixture(),realm=f.realm,[one,two]=f.captains;const key=one.game.state.exploration.key,encounter=one.game.state.exploration.encounter;
 const enter=async(captain,bodyId,siteId)=>{if(captain.game.state.exploration){place(realm,captain,e=>e.type==='siteExit');ok(await realm.command(captain,'exitSite',{}));}realm._landCharacter(captain,'crosswind',bodyId);place(realm,captain,e=>e.type==='siteEntrance'&&e.data?.siteId===siteId);ok(await realm.command(captain,'enterSite',{siteId}));};
 await enter(one,'crosswind-lorn','fuel-dispatch');await enter(two,'crosswind-lorn','fuel-dispatch');const credits=one.game.state.credits;await choose(realm,one,'fuel-dispatch','hauler','dispatch-pay');assert.equal(one.game.state.credits,credits+90);assert.equal(two.game.state.warzoneStories.dispatch.decision,null);assert.equal((await realm.command(one,'siteAction',{entityId:object(realm,one,'fuel-dispatch').id,action:'choose',optionId:'hauler'},'dispatch-repeat')).ok,false);await choose(realm,two,'fuel-dispatch','relief');
 await enter(two,'crosswind-orsa','thawline-reception');assert.match(ok(await realm.command(two,'siteAction',{entityId:object(realm,two,'refuge-arrivals').id,action:'inspect'})).text,/whole sleeping hall/);
 const time=encounter.time;encounter.warzoneGround.lastActiveAt=Date.now()-200000;await enter(one,'crosswind-vey',WARZONE_GROUND_SITE_ID);assert.equal(one.game.state.exploration.encounter,realm.sites[key]);assert.ok(Math.abs(encounter.time-time-90)<.01,'an empty front catches up only ninety seconds');assert.equal(one.game.state.warzoneStories.evacuation.stage,'unasked');assert.equal(one.game.state.credits,credits+90);
 f=await restart(f);realm=f.realm;[one,two]=f.captains;assert.equal(one.game.state.warzoneStories.dispatch.decision,'hauler');assert.equal(two.game.state.warzoneStories.dispatch.decision,'relief');assert.equal(one.game.state.credits,credits+90);assert.ok(!realm.failed);
});
