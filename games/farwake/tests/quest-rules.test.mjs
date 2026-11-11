import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game} from '../dist/engine.mjs';
import {Realm} from '../server/realm.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {QUEST_THREADS,QUEST_CONTACTS,questThread,questContact} from '../dist/quest-content.mjs';
import {occupiedNarrativeBerths} from '../dist/quest-rules.mjs';
import {enemyHullProfile} from '../dist/fleet.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||result?.message);return result;};
const fresh=seed=>{const game=new Game(seed||'story-tests');game.state.credits=5000;game.state.cargo.ore=30;return game;};
function go(game,target){
 if(game.state.exploration)game._returnFromSite(false);
 game._persistRuntime();game.state.mode='ship';game.state.interior=null;game.state.locationId=null;game.state.exploration=null;game.state.systemId=target.systemId;game._loadSystem(target.systemId);
 if(!target.bodyId){Object.assign(game.state.ship,{x:target.x||0,y:target.y||0,vx:0,vy:0});return;}
 const body=game.system.bodies.find(body=>body.id===target.bodyId);assert.ok(body,target.bodyId);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(game.dock(body.id));
 let surface=generateSurface(body,game.state.seed,game.state.flags);
 if(target.siteId){const entrance=surface.entities.find(entity=>entity.type==='siteEntrance'&&entity.data?.siteId===target.siteId);assert.ok(entrance,target.siteId);Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite(target.siteId));surface=generateSurface(game.currentBody,game.state.seed,game.state.flags);}
 if(target.entityId){const entity=surface.entities.find(entity=>entity.id===target.entityId);assert.ok(entity,target.entityId);Object.assign(game.state.person,{x:entity.x,y:entity.y});}
}
const contactTarget=id=>{const c=questContact(id);return{...c,entityId:`quest:${id}`};};
function accept(game,id){const q=questThread(id);go(game,contactTarget(q.offeredBy));return ok(game.threadAction({threadId:id,action:'accept',entityId:`quest:${q.offeredBy}`}));}
function fireAt(game,enemy,count){
 Object.assign(game.state.ship,{x:enemy.x-155,y:enemy.y,angle:0,vx:0,vy:0,energy:game.state.ship.maxEnergy});
 for(let i=0;i<count;i++){game._shotTimer=0;ok(game.fireWeapons());game._updateBullets(.25,[game]);}
}
function progress(game,id,choices={}){
 const def=questThread(id),record=game.state.narrative.quests[id],step=def.stages[record.stage];
 go(game,step.kind==='ship-scan'?game.narrativeBoard().active.find(thread=>thread.id===id).target:step.at);
 if(step.kind==='hunt'){game.syncNarrativeWorld();const enemy=game.system.enemies.find(enemy=>enemy.id===record.targetId);assert.ok(enemy);fireAt(game,enemy,3);assert.equal(enemy.disabled,true);return ok(game.threadAction({threadId:id,action:'capture'}));}
 return ok(game.threadAction({threadId:id,action:step.kind==='choice'?'choose':step.kind==='puzzle'?'solve':'advance',entityId:step.at.entityId,choiceId:choices[step.id]||step.options?.[0].id,solution:step.puzzle?.solution}));
}
function complete(game,id,choices={}){accept(game,id);while(game.state.narrative.quests[id].status==='active')progress(game,id,choices);return game.state.narrative.quests[id];}
const deskTarget=(systemId,bodyId)=>({systemId,bodyId,entityId:`quest:passage-desk:${bodyId}`});

test('stories require their actual contact, location, current step and conscious captain',()=>{
 const game=fresh('story-guards'),before=game.state.credits;
 assert.equal(game.threadAction({threadId:'last_fare',action:'accept',entityId:'quest:len-vale'}).code,'mode');
 go(game,contactTarget('len-vale'));game.state.person.x+=100;
 assert.equal(game.inspectContact('quest:len-vale').code,'distance');
 assert.equal(game.threadAction({threadId:'last_fare',action:'accept',entityId:'quest:len-vale'}).code,'distance');
 go(game,contactTarget('len-vale'));const met=ok(game.inspectContact('quest:len-vale'));
 assert.ok(met.threads.some(q=>q.id==='last_fare'));assert.ok(!met.threads.some(q=>q.id==='first_names'));
 assert.equal(game.threadAction({threadId:'first_names',action:'accept',entityId:'quest:len-vale'}).code,'requirements');
 ok(game.threadAction({threadId:'last_fare',action:'accept',entityId:'quest:len-vale'}));
 assert.equal(game.threadAction({threadId:'last_fare',action:'choose',choiceId:'protect'}).code,'action');
 assert.equal(game.threadAction({threadId:'last_fare',action:'accept',entityId:'quest:len-vale'}).code,'duplicate');
 const step=questThread('last_fare').stages[1];go(game,step.at);game.state.person.health=0;game.state.person.down=true;
 assert.equal(game.threadAction({threadId:'last_fare',action:'advance',entityId:step.at.entityId}).code,'mode');
 assert.equal(game.state.credits,before);assert.equal(occupiedNarrativeBerths(game),1);
});

test('local passage, remembered moral choice and accepted reward survive save and do not pay twice',()=>{
 let game=fresh('recorded-passage');accept(game,'last_fare');const quote=game.state.narrative.quests.last_fare.rewardQuote;
 progress(game,'last_fare');assert.equal(game.narrativeBerths(),1);
 game=Game.fromSave(game.save());assert.equal(game.narrativeBerths(),1);progress(game,'last_fare');assert.equal(game.narrativeBerths(),0);
 const target=questThread('last_fare').stages[3].at;go(game,target);const before=game.state.credits;
 const result=ok(game.threadAction({threadId:'last_fare',action:'choose',choiceId:'protect',entityId:target.entityId}));
 assert.equal(result.paid,quote);assert.equal(game.state.credits,before+quote);assert.equal(game.state.narrative.quests.last_fare.choices.privacy,'protect');
 assert.ok(game.state.narrative.relations['mara-reed'].trust>0);assert.ok(game.state.rep.freewake>0&&game.state.rep.concord<0);
 game=Game.fromSave(game.save());go(game,target);const paid=game.state.credits;
 assert.equal(game.threadAction({threadId:'last_fare',action:'choose',choiceId:'register',entityId:target.entityId}).code,'duplicate');assert.equal(game.state.credits,paid);
 assert.match(ok(game.inspectContact('quest:len-vale')).contact.lastMemory,/Nessa/);
 assert.ok(game.narrativeBoard().available.some(q=>q.id==='water_dividend'));
});

test('an unaffordable decision changes no credits, allegiance, memories, or stage',()=>{
 const game=fresh('atomic-choice');accept(game,'last_fare');progress(game,'last_fare');progress(game,'last_fare');go(game,questThread('last_fare').stages[3].at);game.state.credits=44;
 const before=structuredClone(game.state);
 assert.equal(game.threadAction({threadId:'last_fare',action:'choose',choiceId:'appeal',entityId:'quest:len-vale'}).code,'cost');
 assert.deepEqual(game.state,before);
});

test('three puzzle forms use server-side answers and public clues without exposing a solution field',()=>{
 const game=fresh('puzzle-forms');
 const cases=[['nine_knocks','recorder'],['paper_bounty','evidence']];
 for(const[id,stageId]of cases){accept(game,id);const step=questThread(id).stages.find(step=>step.id===stageId);go(game,step.at);const viewed=ok(game.inspectQuestObject(step.at.entityId)).threads.find(q=>q.id===id);
  assert.ok(viewed.puzzle.inputs.length>=3);assert.equal(Object.hasOwn(viewed.puzzle,'solution'),false);
  const before=structuredClone(game.state.narrative.quests[id]);assert.equal(game.threadAction({threadId:id,action:'solve',entityId:step.at.entityId,solution:['invented','invented','invented']}).code,'puzzle');assert.deepEqual(game.state.narrative.quests[id],before);
  ok(game.threadAction({threadId:id,action:'solve',entityId:step.at.entityId,solution:step.puzzle.solution}));
 }
 complete(game,'last_fare');accept(game,'water_dividend');const step=questThread('water_dividend').stages[1];go(game,step.at);assert.equal(game.narrativeBoard().active.find(q=>q.id==='water_dividend').puzzle.type,'dials');
 assert.equal(game.threadAction({threadId:'water_dividend',action:'solve',entityId:step.at.entityId,solution:['2','2','0']}).code,'puzzle');ok(game.threadAction({threadId:'water_dividend',action:'solve',entityId:step.at.entityId,solution:['2','1','1']}));
});

test('a named bounty requires real disabling shots, rejects occupied hulls, and preserves its target across reload',()=>{
 let game=fresh('real-bounty');accept(game,'paper_bounty');progress(game,'paper_bounty');
 let record=game.state.narrative.quests.paper_bounty;go(game,{systemId:'hearth'});game.syncNarrativeWorld();let enemy=game.system.enemies.find(e=>e.id===record.targetId);const targetId=record.targetId;
 Object.assign(game.state.ship,{x:enemy.x-150,y:enemy.y});assert.equal(game.threadAction({threadId:'paper_bounty',action:'capture'}).code,'requirements');
 fireAt(game,enemy,3);assert.equal(enemy.hp,24);assert.equal(enemy.disabled,true);
 game=Game.fromSave(game.save());record=game.state.narrative.quests.paper_bounty;enemy=game.system.enemies.find(e=>e.id===targetId);
 assert.equal(record.targetId,targetId);assert.equal(enemy.hp,24);for(let i=0;i<30;i++)game.syncNarrativeWorld();assert.equal(game.system.enemies.filter(e=>e.id===targetId).length,1);
 enemy.promotedVesselId='occupied-shared-vessel';assert.equal(game.threadAction({threadId:'paper_bounty',action:'capture'}).code,'occupied');delete enemy.promotedVesselId;
 Object.assign(game.state.ship,{x:enemy.x-500,y:enemy.y});assert.equal(game.threadAction({threadId:'paper_bounty',action:'capture'}).code,'distance');Object.assign(game.state.ship,{x:enemy.x-150,y:enemy.y});
 ok(game.threadAction({threadId:'paper_bounty',action:'capture'}));assert.equal(game.narrativeBerths(),1);assert.ok(!game.system.enemies.some(e=>e.id===targetId));
 const before=game.state.credits;progress(game,'paper_bounty',{judgment:'hearing'});assert.equal(game.state.credits,before+240);assert.equal(game.narrativeBerths(),0);
 assert.equal(game.threadAction({threadId:'paper_bounty',action:'capture'}).code,'duplicate');
});

test('destroyed bounty targets produce an inquest, not a fictitious living prisoner',()=>{
 const game=fresh('dead-bounty');accept(game,'paper_bounty');progress(game,'paper_bounty');go(game,{systemId:'hearth'});game.syncNarrativeWorld();const enemy=game.system.enemies.find(e=>e.id===game.state.narrative.quests.paper_bounty.targetId);
 fireAt(game,enemy,5);assert.ok(game._record().defeated.includes(enemy.id));ok(game.threadAction({threadId:'paper_bounty',action:'confirmKill'}));assert.equal(game.narrativeBerths(),0);
 const current=game.narrativeBoard().active.find(q=>q.id==='paper_bounty');assert.match(current.text,/Rook is dead/);assert.match(current.actions[0].label,/inquest/);
});

test('all linked long-form stories can be completed through real destinations and retain distinct decisions',()=>{
 const game=fresh('all-story-routes');
 for(const id of ['last_fare','nine_knocks','salt_debt','paper_bounty','water_dividend','borrowed_voice','first_names','borrowed_time','rusk_ledger']){
  const record=complete(game,id);assert.equal(record.status,'completed',id);assert.equal(record.stage,questThread(id).stages.length);assert.ok(record.finishedAt!==null);
 }
 assert.equal(game.narrativeBoard().completed.length,9);assert.equal(game.state.stats.storyThreads,9);assert.ok(game.state.narrative.met.includes('vey'));assert.ok(game.state.narrative.met.includes('mother-rusk'));
 const restored=Game.fromSave(game.save());assert.deepEqual(restored.state.narrative.quests,game.state.narrative.quests);assert.equal(restored.state.credits,game.state.credits);
 assert.ok(QUEST_THREADS.reduce((sum,quest)=>sum+quest.stages.length,0)>=40);
});

test('repeatable passenger fares require a real berth, both desks, the accepted hull and a clean trip for a tip',()=>{
 let game=fresh('taxi-rules');go(game,deskTarget('hearth','kettle'));const offer=game.passengerOffers()[0];assert.ok(offer&&offer.targetBody!=='tinbell');
 const fake='passenger:hearth:kettle:99999';assert.equal(game.acceptPassenger(fake,'quest:passage-desk:kettle').code,'target');
 ok(game.acceptPassenger(offer.id,'quest:passage-desk:kettle'));assert.equal(game.narrativeBerths(),1);assert.deepEqual(game.passengerOffers(),[]);
 assert.equal(game.deliverPassenger('quest:passage-desk:kettle').code,'location');
 game.state.ship.shield=10;game._damageShip(3);assert.equal(game.state.narrative.passenger.damageTaken,0,'shield absorption preserves the comfort bonus');
 game.state.ship.shield=0;game._damageShip(5);game.state.ship.hull=game.state.ship.maxHull;
 game=Game.fromSave(game.save());const passenger=game.state.narrative.passenger;assert.equal(passenger.fare,offer.fare);assert.equal(passenger.damageTaken,5);
 go(game,deskTarget(passenger.targetSystem,passenger.targetBody));const hull=game.state.ship.id;game.state.ship.id='another-hull';assert.equal(game.deliverPassenger(passenger.targetEntityId).code,'vessel');game.state.ship.id=hull;
 const before=game.state.credits,result=ok(game.deliverPassenger(passenger.targetEntityId));assert.equal(result.tip,0);assert.equal(result.paid,offer.fare);assert.equal(game.state.credits,before+offer.fare);assert.equal(game.narrativeBerths(),0);
 assert.equal(game.deliverPassenger(passenger.targetEntityId).code,'target');
 const next=game.passengerOffers()[0];assert.ok(next&&next.id!==offer.id);ok(game.acceptPassenger(next.id,next.sourceEntityId));go(game,deskTarget(next.targetSystem,next.targetBody));const clean=ok(game.deliverPassenger(next.targetEntityId));assert.equal(clean.tip,next.bonus);
});

test('taxi capacity shares the actual crew berths and stranded bookings can be ended safely without a payout',()=>{
 const game=fresh('fare-capacity');go(game,deskTarget('hearth','kettle'));game.state.ship.humanOccupants=game.state.ship.berths;
 const full=game.passengerOffers()[0];assert.equal(full.available,false);assert.equal(game.acceptPassenger(full.id,full.sourceEntityId).code,'capacity');
 game.state.ship.humanOccupants=1;const offer=game.passengerOffers()[0];ok(game.acceptPassenger(offer.id,offer.sourceEntityId));const credits=game.state.credits;
 game.state.mode='ship';assert.equal(game.abandonPassenger().code,'mode');go(game,deskTarget('hearth','kettle'));game.state.ship.id='recovery-hull';ok(game.abandonPassenger());assert.equal(game.state.credits,credits);assert.equal(game.state.narrative.passenger,null);
});

test('faction pledges affect real passenger quotes and rivals, cannot be farmed, and preserve an already accepted fare',()=>{
 const game=fresh('pledge-quotes');go(game,deskTarget('hearth','kettle'));const base=game.passengerOffers()[0].fare;
 go(game,{systemId:'hearth',bodyId:'kettle',entityId:'quest:liaison:kettle'});const original=game.state.rep.meridian;
 ok(game.pledgeFaction('freewake','quest:liaison:kettle'));assert.equal(game.state.rep.meridian,original-4);assert.equal(game.pledgeFaction('freewake','quest:liaison:kettle').code,'duplicate');assert.equal(game.pledgeFaction('cinder','quest:liaison:kettle').code,'faction');
 go(game,deskTarget('hearth','kettle'));const offer=game.passengerOffers()[0];assert.ok(offer.fare>base);ok(game.acceptPassenger(offer.id,offer.sourceEntityId));game.state.rep.freewake=90;game.state.narrative.pledge='lantern';assert.equal(game.state.narrative.passenger.fare,offer.fare);
 const restored=Game.fromSave(game.save());assert.equal(restored.state.narrative.passenger.fare,offer.fare);assert.equal(restored.state.narrative.pledge,'lantern');
});

test('separate captains share physical bounty state without sharing choices or generating duplicate targets',()=>{
 const a=fresh('shared-threads'),b=fresh('shared-threads');a._playerId='alpha';b._playerId='beta';b.state.ship.id='second-vessel';
 accept(a,'paper_bounty');progress(a,'paper_bounty');accept(b,'paper_bounty');progress(b,'paper_bounty');go(a,{systemId:'hearth'});go(b,{systemId:'hearth'});
 const world=a.system,record=a._record();b.bindSharedWorld(world,record,'beta');a.bindSharedWorld(world,record,'alpha');
 for(let i=0;i<20;i++){a.syncNarrativeWorld();b.syncNarrativeWorld();}
 const aId=a.state.narrative.quests.paper_bounty.targetId,bId=b.state.narrative.quests.paper_bounty.targetId;
 assert.notEqual(aId,bId);assert.equal(world.enemies.filter(e=>[aId,bId].includes(e.id)).length,2);
 const target=world.enemies.find(e=>e.id===aId);fireAt(a,target,3);ok(a.threadAction({threadId:'paper_bounty',action:'capture'}));
 assert.equal(a.state.narrative.quests.paper_bounty.stage,3);assert.equal(b.state.narrative.quests.paper_bounty.stage,2);assert.ok(world.enemies.some(e=>e.id===bId));
});

test('restore whitelists story IDs and choices, limits memory, and rescue preserves people without inventing a fare',()=>{
 const game=withHull(fresh('narrative-restore'),'quill');accept(game,'last_fare');go(game,deskTarget('hearth','kettle'));const offer=game.passengerOffers()[0];ok(game.acceptPassenger(offer.id,offer.sourceEntityId));
 const raw=game.save();raw.narrative.quests.invented={status:'completed',rewardQuote:100000};raw.narrative.quests.last_fare.choices={privacy:'invented-choice'};raw.narrative.quests.last_fare.rewardQuote=100000;raw.narrative.met.push('invented-contact');raw.narrative.relations['len-vale'].memories=Array.from({length:40},()=>({text:'<bad>test',at:0}));
 const restored=Game.fromSave(raw);assert.equal(restored.state.narrative.quests.invented,undefined);assert.deepEqual(restored.state.narrative.quests.last_fare.choices,{});assert.equal(restored.state.narrative.quests.last_fare.rewardQuote,Math.ceil(95*1.5));assert.ok(!restored.state.narrative.met.includes('invented-contact'));assert.equal(restored.state.narrative.relations['len-vale'].memories.length,6);assert.ok(!restored.state.narrative.relations['len-vale'].memories[0].text.includes('<'));
 const credits=restored.state.credits;restored.state.ship.id='replacement';restored._rescue('Test emergency recovery');assert.equal(restored.state.narrative.passenger,null);assert.equal(restored.state.credits,credits-Math.floor(credits*.12));assert.equal(restored.state.narrative.quests.last_fare.shipId,'replacement');assert.equal(restored.narrativeBerths(),1);assert.equal(restored.state.narrative.quests.last_fare.evacuated,true);
});

test('private fares, story passengers, and medical patients share real berth capacity in both directions',()=>{
 const medical=fresh('shared-berths-medical'),clinic={systemId:'hearth',bodyId:'kettle',entityId:'quest:profession-desk:kettle'};
 go(medical,clinic);ok(medical.enlistProfession({professionId:'paramedic',entityId:clinic.entityId}));
 const offer=medical.professionBoard(clinic.entityId).offers.find(offer=>offer.professionId==='paramedic');ok(medical.professionAction({action:'accept',jobId:offer.id,entityId:clinic.entityId}));
 const job=medical.state.professions.active;medical.state.ship.humanOccupants=medical.state.ship.berths-1;
 const pickup={systemId:job.targetSystem,bodyId:job.targetBody,entityId:`quest:profession-desk:${job.targetBody}`};go(medical,pickup);ok(medical.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickup.entityId}));assert.equal(medical.professionBerths(),1);
 go(medical,deskTarget(job.targetSystem,job.targetBody));const full=medical.passengerOffers()[0];assert.equal(full.available,false);assert.equal(medical.acceptPassenger(full.id,full.sourceEntityId).code,'capacity');
 go(medical,contactTarget('len-vale'));assert.equal(medical.threadAction({threadId:'last_fare',action:'accept',entityId:'quest:len-vale'}).code,'capacity');
 const story=fresh('shared-berths-story');accept(story,'last_fare');story.state.ship.humanOccupants=story.state.ship.berths-1;go(story,clinic);ok(story.enlistProfession({professionId:'paramedic',entityId:clinic.entityId}));
 const blocked=story.professionBoard(clinic.entityId).offers.find(offer=>offer.professionId==='paramedic');assert.equal(blocked.actions[0].available,false);assert.equal(story.professionAction({action:'accept',jobId:blocked.id,entityId:clinic.entityId}).code,'capacity');assert.equal(story.crewCapacity,0);
});

test('Earth desks work after legal landing while taxi dispatch does not offer a quarantined destination',()=>{
 const game=fresh('earth-services');go(game,deskTarget('sol','threshold'));assert.ok(game.passengerOffers().every(offer=>offer.targetBody!=='earth'));
 game.state.mode='ship';game.state.locationId=null;const earth=game.system.bodies.find(body=>body.id==='earth');Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+60});assert.equal(game.dock('earth').code,'quarantine');
 game._flag('vault_recovered');game._flag('homeward_signal');assert.equal(game.dock('earth').code,'permission');ok(game.applyChoice('earth_arrival',0));go(game,deskTarget('sol','earth'));const passage=ok(game.inspectContact('quest:passage-desk:earth'));assert.ok(passage.passengers.length);assert.equal(passage.passengers[0].targetBody,'threshold');
 ok(game.acceptPassenger(passage.passengers[0].id,'quest:passage-desk:earth'));const saved=Game.fromSave(game.save());assert.equal(saved.state.narrative.passenger.originBody,'earth');
 go(saved,{systemId:'sol',bodyId:'earth',entityId:'quest:liaison:earth'});const office=ok(saved.inspectContact('quest:liaison:earth'));assert.equal(office.factions[0].id,'concord');ok(saved.pledgeFaction('concord','quest:liaison:earth'));
});

test('actual client snapshot binding computes a profession offer the authority can accept',async()=>{
 const persistence={kind:'identity-test',async save(id,version){return{version:version+1};}};
 const realm=new Realm({id:'IDENTITY',seed:'client-narrative-identity',persistence});
 const {captain}=await realm.createCaptain('Client identity');ok(realm.attach(captain,{close(){}}));
 const vessel=realm.vessels.get(captain.ownedVesselId),body=realm._room('hearth').runtime.bodies.find(body=>body.id==='kettle');Object.assign(vessel.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(await realm.command(captain,'dock',{id:'kettle'}));
 const desk=realm._surface(captain).entities.find(entity=>entity.id==='quest:profession-desk:kettle');Object.assign(captain.game.state.person,{x:desk.x,y:desk.y});ok(await realm.command(captain,'enlistProfession',{professionId:'doctor',entityId:desk.id}));
 const packet=realm.snapshotFor(captain,{drainEvents:false}),client=new Game(realm.seed);client._playerId='stale-captain';client._directorShared={stale:true};
 const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),start=app.indexOf('function receiveSnapshot('),end=app.indexOf('\nfunction ',start+1);assert.ok(start>=0&&end>start);
 const context=vm.createContext({Game,structuredClone,game:client,packet,network:{now:()=>0,predictionReset:'welcome'},performance:{now:()=>0},onlineSnapshot:null,surface:null,surfaceKey:'',surfaceTarget:null,playing:false,hudDirty:false,personVisualOffset:{x:0,y:0},personPredictedAt:null,personVisualAt:null,combatPresentation:{reset(){}},combatFeed:[],controls:{clear(){}},worldPresentation:{push(){}},frameMonitor:{snapshot(){}},advanceOnlinePerson(){},receiveCameraPreferences(){},clearPointerAim(){},ensureSurface(){},updateSurfaceFlags(){},processEvents(){}});
 vm.runInContext(app.slice(start,end)+'\nreceiveSnapshot(packet);',context);
 assert.equal(context.game.playerId,captain.id);assert.equal(context.game._directorShared,undefined);assert.deepEqual(context.game.worldDirector,packet.state.worldDirector);
 const clientOffer=context.game.professionBoard(desk.id).offers.find(offer=>offer.professionId==='doctor'),authorityOffer=captain.game.professionBoard(desk.id).offers.find(offer=>offer.professionId==='doctor');assert.equal(clientOffer.id,authorityOffer.id);assert.equal(clientOffer.actions[0].available,true);
 ok(await realm.command(captain,'professionAction',{action:'accept',jobId:clientOffer.id,entityId:desk.id}));assert.equal(captain.game.state.professions.active.id,clientOffer.id);
});

test('a boarded bounty hull keeps a durable wreck record without inheriting its boarder’s passengers',async()=>{
 const persistence={kind:'promoted-wreck-test',async save(id,version){return{version:version+1};}};
 const realm=new Realm({id:'WRECKONE',seed:'promoted-bounty-wreck',persistence}),{captain}=await realm.createCaptain('Warrant captain');ok(realm.attach(captain,{close(){}}));
 const walk=(r,c,id)=>{const e=r._surface(c).entities.find(e=>e.id===id);assert.ok(e,id);Object.assign(c.game.state.person,{x:e.x,y:e.y});return e;};
 const launch=async(r,c)=>{if(c.game.state.mode==='ship')return;const exit=r._surface(c).entities.find(e=>e.type==='exit');assert.ok(exit);walk(r,c,exit.id);ok(await r.command(c,'launch'));};
 const land=async(r,c,bodyId)=>{await launch(r,c);const hull=r.vessels.get(c.ownedVesselId),body=r._room(hull.systemId).runtime.bodies.find(body=>body.id===bodyId);Object.assign(hull.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(await r.command(c,'dock',{id:bodyId}));};
 await land(realm,captain,'kettle');walk(realm,captain,'quest:passage-desk:kettle');const fare=captain.game.passengerOffers()[0];ok(await realm.command(captain,'acceptPassenger',{offerId:fare.id,entityId:fare.sourceEntityId}));
 walk(realm,captain,'quest:orin-dax');ok(await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'accept',entityId:'quest:orin-dax'}));
 await land(realm,captain,'morrow');const entrance=realm._surface(captain).entities.find(e=>e.type==='siteEntrance'&&e.data.siteId==='orchard-pump');walk(realm,captain,entrance.id);ok(await realm.command(captain,'enterSite',{siteId:'orchard-pump'}));
 const evidence=questThread('paper_bounty').stages[1];walk(realm,captain,evidence.at.entityId);ok(await realm.command(captain,'threadAction',{threadId:'paper_bounty',action:'solve',entityId:evidence.at.entityId,solution:evidence.puzzle.solution}));
 walk(realm,captain,realm._surface(captain).entities.find(e=>e.type==='siteExit').id);ok(await realm.command(captain,'exitSite'));await launch(realm,captain);
 const room=realm._room('hearth'),owned=realm.vessels.get(captain.ownedVesselId),enemy=room.runtime.enemies.find(e=>e.id===captain.game.state.narrative.quests.paper_bounty.targetId),source=realm._actor(owned);
 // This promotion regression needs a crew-capable prize. Rook's normal solo
 // scout remains too small to board; the warrant can still be negotiated.
 Object.assign(enemy,enemyHullProfile('hauler'));
 Object.assign(owned.ship,{x:enemy.x-155,y:enemy.y,angle:0,vx:0,vy:0,energy:owned.ship.maxEnergy});
 for(let shot=0;shot<3;shot++){source._shotTimer=0;ok(source.fireWeapons(captain.id));room.coordinator._updateBullets(.25,[source]);}assert.equal(enemy.disabled,true);
 owned.ship.x=enemy.x-100;ok(await realm.command(captain,'boardEnemy',{id:enemy.id}));const prize=realm.vessels.get(enemy.canonicalVesselId),prizeActor=realm._actor(prize);assert.ok(prize);
 assert.equal(source.narrativeBerths(),1);assert.equal(prizeActor.narrativeBerths(),0,'the borrowed actor state must not place the private fare aboard the prize');prizeActor.recordPassengerDamage(5);assert.equal(captain.game.state.narrative.passenger.damageTaken,0);
 ok(await realm.command(captain,'returnToOwnShip'));const primary=realm._actor(owned),targetActor=realm._actor(prize),credits=captain.game.state.credits,pickups=room.runtime.pickups.length;
 Object.assign(owned.ship,{x:prize.ship.x-155,y:prize.ship.y,angle:0,vx:0,vy:0,energy:owned.ship.maxEnergy});
 for(let shot=0;shot<12&&!prize.destroyed;shot++){primary._shotTimer=0;ok(primary.fireWeapons(captain.id));room.coordinator._updateBullets(.25,[primary,targetActor]);}
 assert.equal(prize.destroyed,true);assert.equal(room.record.defeated.filter(id=>id===enemy.id).length,1);assert.equal(room.record.enemyHealth[enemy.id],undefined);assert.equal(captain.game.state.credits,credits);assert.equal(room.runtime.pickups.length,pickups);
 realm._destroyVessel(prize);assert.equal(room.record.defeated.filter(id=>id===enemy.id).length,1);
 const restored=new Realm({id:realm.id,snapshot:realm.document(),persistence}),returned=restored.captains.get(captain.id);ok(restored.attach(returned,{close(){}}));assert.equal(restored.vessels.get(prize.id).destroyed,true);assert.ok(!restored._room('hearth').runtime.enemies.some(e=>e.id===enemy.id));
 ok(await restored.command(returned,'threadAction',{threadId:'paper_bounty',action:'confirmKill'}));assert.equal(returned.game.state.narrative.quests.paper_bounty.huntOutcome,'destroyed');assert.equal(returned.game.narrativeBerths(),1,'only the original private fare occupies a berth');
 await land(restored,returned,'kettle');walk(restored,returned,'quest:orin-dax');const before=returned.game.state.credits;ok(await restored.command(returned,'threadAction',{threadId:'paper_bounty',action:'choose',choiceId:'hearing',entityId:'quest:orin-dax'}));assert.equal(returned.game.state.credits,before+240);
 assert.equal((await restored.command(returned,'threadAction',{threadId:'paper_bounty',action:'choose',choiceId:'hearing',entityId:'quest:orin-dax'})).code,'duplicate');
});
