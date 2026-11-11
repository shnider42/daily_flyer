import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../../server/realm.mjs';
import {MILITARY_RECRUITER} from '../../dist/military-content.mjs';
import {sidearmAim} from '../../dist/combat.mjs';
import {isWalkable} from '../../dist/surface.mjs';
import {createPrivacyExport} from '../../server/privacy.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
function storage(){return{kind:'memory',version:0,snapshot:null,async save(id,version,snapshot){this.snapshot=structuredClone(snapshot);this.version=version+1;return{version:this.version};}};}
async function fixture(){
 const persistence=storage(),realm=new Realm({id:'ARMY13',seed:'army-authority',persistence}),captains=[];
 for(const name of ['First recruit','Second recruit']){const {captain}=await realm.createCaptain(name,{startMode:'hardcore'});ok(realm.attach(captain,{close(){}}));captains.push(captain);}
 return{realm,captains,persistence};
}
function place(realm,captain,predicate){const entity=realm._surface(captain).entities.find(predicate);assert.ok(entity);Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});return entity;}
async function orders(realm,captain){place(realm,captain,entity=>entity.id===MILITARY_RECRUITER.id);ok(await realm.command(captain,'militaryCareerAction',{action:'join',branchId:'army',entityId:MILITARY_RECRUITER.id}));ok(await realm.command(captain,'militaryCareerAction',{action:'start',entityId:MILITARY_RECRUITER.id}));}
async function enter(realm,captain){place(realm,captain,entity=>entity.type==='siteEntrance'&&entity.data.siteId==='service-range');ok(await realm.command(captain,'enterSite',{siteId:'service-range'}));}
function fire(realm,captain){
 const target=captain.game.state.exploration.encounter.monsters.find(enemy=>enemy.health>0);if(!target)return;
 const surface=realm._surface(captain);let input;
 for(const radius of [96,120,72]){for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,position={x:target.x+Math.cos(angle)*radius,y:target.y+Math.sin(angle)*radius},candidate={fire:true,aiming:true,aimX:-Math.cos(angle),aimY:-Math.sin(angle)};
  if(isWalkable(surface,position.x,position.y)&&sidearmAim(position,captain.game.state.exploration.encounter.monsters,candidate,surface.combatLayout).targetId===target.id){Object.assign(captain.game.state.person,position);input=candidate;break;}
 }if(input)break;}
 assert.ok(input);
 for(const other of realm.captains.values())if(other.session)realm.acceptInput(other,other.inputSeq+1,other===captain?input:{});
 realm.step(1/30,realm.tick+1,Date.now());
}
async function restart(f){f.realm.markDirty();await f.realm.flush();const realm=new Realm({id:f.realm.id,version:f.persistence.version,snapshot:structuredClone(f.persistence.snapshot),persistence:f.persistence}),captains=f.captains.map(captain=>realm.captains.get(captain.id));for(const captain of captains)ok(realm.attach(captain,{close(){}}));return{realm,captains,persistence:f.persistence};}

test('parallel Army recruits get distinct operations, rooms, target wounds and progress, which survive a realm restart',async()=>{
 let f=await fixture();for(const captain of f.captains){await orders(f.realm,captain);await enter(f.realm,captain);}
 let [one,two]=f.captains;const operation=one.game.state.militaryCareer.active.operationId;
 assert.notEqual(operation,two.game.state.militaryCareer.active.operationId);assert.notEqual(one.game.state.exploration.encounter,two.game.state.exploration.encounter);assert.notEqual(f.realm.roomInfo(one).id,f.realm.roomInfo(two).id);
 assert.ok(!f.realm.snapshotFor(one).players.some(player=>player.captainId===two.id));
 fire(f.realm,one);assert.equal(one.game.state.militaryCareer.active.evidence.hits.value,1);assert.equal(two.game.state.militaryCareer.active.evidence.hits.value,0);assert.ok(two.game.state.exploration.encounter.monsters.every(enemy=>enemy.health===24));
 f=await restart(f);[one,two]=f.captains;assert.equal(one.game.state.militaryCareer.active.operationId,operation);assert.equal(one.game.state.militaryCareer.active.evidence.hits.value,1);assert.equal(one.game.state.exploration.encounter.monsters.filter(enemy=>enemy.health<=0).length,1);assert.ok(two.game.state.exploration.encounter.monsters.every(enemy=>enemy.health===24));
 for(let i=0;i<100&&!one.game.state.exploration.encounter.cleared;i++)fire(f.realm,one);assert.ok(one.game.state.exploration.encounter.cleared);
 const terminal=place(f.realm,one,entity=>entity.type==='siteRecord'&&entity.data.recordId==='drill');ok(await f.realm.command(one,'siteAction',{entityId:terminal.id,action:'inspect'}));assert.equal(one.game.state.militaryCareer.active.phase,'debrief');
 const compact=f.realm.snapshotFor(one,{compact:true});assert.equal(compact.state.militaryCareer.active.phase,'debrief');assert.equal(two.game.state.militaryCareer.active.phase,'active');
 const personal=createPrivacyExport(f.realm,one,{sourceKind:'live-authority'});assert.deepEqual(personal.captain.game.militaryCareer,one.game.state.militaryCareer);assert.ok(!personal.manifest.unrecognizedGameFields.includes('militaryCareer'));assert.equal(JSON.stringify(personal.captain.game).includes(two.game.state.militaryCareer.active.operationId),false);
 place(f.realm,one,entity=>entity.type==='siteExit');ok(await f.realm.command(one,'exitSite',{}));place(f.realm,one,entity=>entity.id===MILITARY_RECRUITER.id);const before=one.game.state.credits;
 const args={action:'debrief',entityId:MILITARY_RECRUITER.id};ok(await f.realm.command(one,'militaryCareerAction',args,'army-one-pay'));ok(await f.realm.command(one,'militaryCareerAction',args,'army-one-pay'));assert.equal(one.game.state.credits,before+100);assert.equal((await f.realm.command(one,'militaryCareerAction',args,'army-replay')).ok,false);
 assert.equal(one.game.state.professions.careers.military.completed,1);assert.equal(two.game.state.professions.careers.military.completed,0);
});

test('untrusted commands cannot mint infantry evidence, open another assignment, or bypass recruiter proximity',async()=>{
 const {realm,captains:[one,two]}=await fixture();
 assert.equal((await realm.command(one,'militaryCareerAction',{action:'join',branchId:'army',entityId:MILITARY_RECRUITER.id})).ok,false);
 await orders(realm,one);await enter(realm,one);const operationId=one.game.state.militaryCareer.active.operationId,before=structuredClone(one.game.state.militaryCareer.active.evidence);
 for(const name of ['observeMilitaryEvent','recordMilitarySortie'])assert.equal((await realm.command(one,name,{type:'ground-hit',operationId,siteId:'service-range',objectiveId:'hits',amount:999,token:'invented'})).ok,false);
 assert.deepEqual(one.game.state.militaryCareer.active.evidence,before);
 place(realm,two,entity=>entity.type==='siteEntrance'&&entity.data.siteId==='service-range');assert.equal((await realm.command(two,'enterSite',{siteId:'service-range',operationId,encounter:one.game.state.exploration.encounter})).code,'military-orders');assert.equal(two.game.state.exploration,null);
 const terminal=realm._surface(one).entities.find(entity=>entity.data?.recordId==='drill');assert.equal((await realm.command(one,'siteAction',{entityId:terminal.id,action:'inspect'})).code,'distance');place(realm,one,entity=>entity.id===terminal.id);assert.equal((await realm.command(one,'siteAction',{entityId:terminal.id,action:'inspect'})).code,'military-threat');
 assert.deepEqual(one.game.state.militaryCareer.active.evidence,before);assert.ok(!realm.failed);
});
