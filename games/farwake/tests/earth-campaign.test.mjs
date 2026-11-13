import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { STORY_CHAPTERS } from '../dist/content.mjs';
import { questContact, questThread } from '../dist/quest-content.mjs';
import { EARTH_CAMPAIGN_ID, EARTH_CAMPAIGN, EARTH_CAMPAIGN_CONTACTS, EARTH_CAMPAIGN_OBJECTS } from '../dist/earth-campaign-content.mjs';
import { earthStageTarget, normalizeEarthCampaignRecord } from '../dist/earth-campaign-rules.mjs';

const id=EARTH_CAMPAIGN_ID;
const ok=result=>{assert.equal(result?.ok,true,result?.reason||result?.message);return result;};
const record=game=>game.state.narrative.quests[id];
const current=game=>EARTH_CAMPAIGN.stages[record(game).stage];
const fresh=seed=>{const game=new Game(seed);game.state.credits=2000;game.state.cargo.ore=20;game.state.ship.fuel=game.state.ship.maxFuel;return game;};
const canonical=['talked_mechanic','first_job','first_shift_done','mined_six_ore','belt_signal_scanned','belt_signal_found','first_fold_done','archive_terminal_repaired','archive_restored','archive_decoded','alliance_committed','ally_chosen','climate_record_recovered','vault_recovered','homeward_signal','threshold_answered','earth_reached','council_decision_made'];
function allowExistingStory(game){for(const flag of canonical)game._flag(flag);game.state.completedChapters=STORY_CHAPTERS.map(chapter=>chapter.id);}
function go(game,target){
 if(game.state.exploration)game._returnFromSite(false);
 game._persistRuntime();Object.assign(game.state,{mode:'ship',interior:null,locationId:null,exploration:null,systemId:target.systemId});game.state.ship.destroyed=false;game.state.ship.hull=game.state.ship.maxHull;game._loadSystem(target.systemId);
 if(!target.bodyId){Object.assign(game.state.ship,{x:target.x??0,y:target.y??0,vx:0,vy:0,energy:game.state.ship.maxEnergy});return;}
 const body=game.system.bodies.find(body=>body.id===target.bodyId);assert.ok(body,target.bodyId);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(game.dock(body.id));
 const surface=generateSurface(body,game.state.seed,game.state.flags),entity=surface.entities.find(entity=>entity.id===target.entityId);assert.ok(entity,target.entityId);Object.assign(game.state.person,{x:entity.x,y:entity.y});
}
function accept(game){return ok(game.threadAction({threadId:id,action:'accept'}));}
function setStep(game,stageId){if(!record(game))accept(game);record(game).stage=EARTH_CAMPAIGN.stages.findIndex(step=>step.id===stageId);assert.ok(record(game).stage>=0);record(game).earth.operation=null;game.syncNarrativeWorld();return current(game);}
function toCurrent(game){const step=current(game);go(game,earthStageTarget(game,step));game.syncNarrativeWorld();return step;}
function act(game,action='advance',extra={}){const step=current(game);return game.threadAction({threadId:id,action,entityId:step.at.entityId,...extra});}
function disable(game,enemy){
 Object.assign(game.state.ship,{x:enemy.x-155,y:enemy.y,angle:0,vx:0,vy:0,energy:game.state.ship.maxEnergy});
 for(let i=0;i<20&&enemy.hp>0&&!enemy.disabled;i++){game._shotTimer=0;game.state.ship.energy=game.state.ship.maxEnergy;ok(game.fireWeapons());game._updateBullets(.25,[game]);}
 assert.ok(enemy.disabled||enemy.hp<=0,enemy.name);
}
function winDefense(game){
 const step=current(game);ok(act(game,'beginDefense'));
 for(let tick=0;tick<Math.ceil(step.duration*10)+3;tick++){
  for(const enemy of [...game.system.enemies].filter(enemy=>enemy.earthCampaign&&enemy.campaignKey===record(game).earth.key&&!enemy.disabled))disable(game,enemy);
  Object.assign(game.state.ship,earthStageTarget(game,step));
  game.stepNarrativeWorld(.1,[game]);
 }
 assert.equal(game.earthCampaignStatus().status,'ready');return ok(act(game));
}

test('sixteen numbered missions are discoverable remotely without inventing existing Earth clearance',()=>{
 const game=fresh('earth-remote-lead');go(game,{systemId:'nacre',x:600,y:300});
 const lead=game.narrativeBoard().available.find(thread=>thread.id===id);assert.ok(lead);assert.equal(lead.actions[0].available,true);assert.equal(lead.campaign.missionCount,16);
 const before=[...game.state.flags];accept(game);assert.equal(current(game).id,'tinbell-reading');assert.deepEqual(game.state.flags,before);
 toCurrent(game);assert.equal(act(game).code,'requirements');assert.equal(record(game).stage,1);
 assert.deepEqual([...new Set(EARTH_CAMPAIGN.stages.map(step=>step.mission))],Array.from({length:16},(_,index)=>index+1));
 go(game,{systemId:'sol',x:0,y:0});const earth=game.system.bodies.find(body=>body.id==='earth');Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+60});assert.equal(game.dock('earth').code,'quarantine');
 for(const contactId of ['earth-ines','earth-vale']){const contact=questContact(contactId);go(game,{...contact,entityId:`quest:${contactId}`});assert.ok(ok(game.inspectContact(`quest:${contactId}`)).contact);}
});

test('campaign rescue needs physical range, one genuinely spare berth, and the same hull at the drop zone',()=>{
 const game=fresh('earth-real-rescue');setStep(game,'tinbell-rescue');const step=toCurrent(game),target=earthStageTarget(game,step);
 game.state.ship.x+=500;assert.equal(act(game).code,'distance');Object.assign(game.state.ship,target);
 game.state.ship.humanOccupants=game.state.ship.berths;assert.equal(act(game).code,'capacity');assert.equal(record(game).earth.passenger,null);
 game.state.ship.humanOccupants=1;ok(act(game));const passenger=record(game).earth.passenger;assert.equal(passenger.id,'engineer-aru');assert.equal(game.narrativeBerths(),1);
 toCurrent(game);const hull=game.state.ship.id,credits=game.state.credits;game.state.ship.id='wrong-carrier';assert.equal(act(game).code,'vessel');assert.equal(game.state.credits,credits);game.state.ship.id=hull;
 ok(act(game));assert.equal(record(game).earth.passenger,null);assert.equal(game.narrativeBerths(),0);assert.equal(game.state.credits,credits+100);assert.deepEqual(record(game).earth.delivered,['engineer-aru']);
 assert.equal(act(game).ok,false);assert.equal(game.state.credits,credits+100);
});

test('shared berth overrides and a permitted borrowed vessel work for a captain without a personal hull',()=>{
 const game=fresh('earth-shared-berths');setStep(game,'tinbell-rescue');toCurrent(game);
 const originalOwn=Object.getOwnPropertyDescriptor(game,'ownsShip'),originalActive=Object.getOwnPropertyDescriptor(game,'hasActiveVessel');
 Object.defineProperty(game,'ownsShip',{configurable:true,value:false});Object.defineProperty(game,'hasActiveVessel',{configurable:true,value:true});
 game.state.ship.id='friend-physical-hull';game.state.ship.berths=4;game.state.ship.humanOccupants=2;
 game.narrativeBerths=()=>2;assert.equal(act(game).code,'capacity');
 game.narrativeBerths=()=>1;ok(act(game));assert.equal(record(game).earth.passenger.shipId,'friend-physical-hull');
 if(originalOwn)Object.defineProperty(game,'ownsShip',originalOwn);else delete game.ownsShip;
 if(originalActive)Object.defineProperty(game,'hasActiveVessel',originalActive);else delete game.hasActiveVessel;
});

test('defense cannot be clicked through: real hull neutralization, presence, timed waves and protected integrity are required',()=>{
 const game=fresh('earth-actual-defense');setStep(game,'brindle-defense');toCurrent(game);assert.equal(act(game).code,'requirements');ok(act(game,'beginDefense'));
 const first=game.system.enemies.find(enemy=>enemy.earthCampaign);assert.ok(first);assert.equal(act(game).code,'requirements');
 const marker=earthStageTarget(game,current(game));Object.assign(game.state.ship,{x:marker.x+1500,y:marker.y});
 for(let i=0;i<10;i++)game.stepNarrativeWorld(.1,[game]);assert.equal(record(game).earth.operation.held,0);assert.ok(record(game).earth.operation.integrity<record(game).earth.operation.maxIntegrity);
 Object.assign(game.state.ship,marker);disable(game,first);assert.ok(first.disabled);assert.equal(act(game).code,'requirements');
 for(let i=0;i<365;i++){for(const enemy of game.system.enemies.filter(e=>e.earthCampaign&&!e.disabled))disable(game,enemy);Object.assign(game.state.ship,earthStageTarget(game,current(game)));game.stepNarrativeWorld(.1,[game]);}
 assert.equal(game.earthCampaignStatus().neutralized,2);assert.equal(game.earthCampaignStatus().status,'ready');ok(act(game));
 assert.ok(!game.system.enemies.some(enemy=>enemy.earthCampaign));assert.equal(record(game).earth.operation,null);
});

test('failed defense can be retried without duplicate targets, while a reload retains real damage and its attempt',()=>{
 let game=fresh('earth-defense-retry');setStep(game,'brindle-defense');toCurrent(game);ok(act(game,'beginDefense'));
 const enemy=game.system.enemies.find(e=>e.earthCampaign);disable(game,enemy);const targetId=enemy.id,hp=enemy.hp;
 game=Game.fromSave(game.save());assert.equal(game.system.enemies.find(e=>e.id===targetId).hp,hp);assert.equal(record(game).earth.operation.shipId,game.state.ship.id);
 for(let i=0;i<20;i++)game.syncNarrativeWorld();assert.equal(game.system.enemies.filter(e=>e.id===targetId).length,1);
 record(game).earth.operation.integrity=.001;
 // A new second wave supplies actual pressure, rather than treating a disabled hull as a threat.
 record(game).earth.operation.elapsed=16;game.syncNarrativeWorld();Object.assign(game.state.ship,earthStageTarget(game,current(game)));game.stepNarrativeWorld(.1,[game]);
 assert.equal(game.earthCampaignStatus().status,'failed');assert.equal(record(game).earth.failures,1);assert.ok(!game.system.enemies.some(e=>e.earthCampaign));
 const credits=game.state.credits;ok(act(game,'retryDefense'));assert.equal(record(game).earth.operation.attempt,1);assert.equal(game.state.credits,credits);
 assert.ok(game.system.enemies.some(e=>e.id.includes(':brindle-defense:1:')));assert.ok(!game.system.enemies.some(e=>e.id===targetId));
 assert.equal(act(game,'retryDefense').code,'action');
});

test('carrier loss is precise, never delivers a phantom survivor, and a new pickup restores the route',()=>{
 const game=fresh('earth-carrier-loss');setStep(game,'sable-rescue');toCurrent(game);ok(act(game));const carrier=record(game).earth.passenger.shipId;toCurrent(game);ok(act(game,'beginDefense'));
 assert.equal(game.earthCarrierLost('unrelated-personal-hull').affected,false);assert.ok(record(game).earth.passenger);assert.equal(record(game).earth.operation.failed,null);
 const credits=game.state.credits;assert.equal(game.earthCarrierLost(carrier).affected,true);assert.equal(current(game).id,'sable-rescue');assert.equal(record(game).earth.passenger,null);assert.equal(game.narrativeBerths(),0);assert.equal(record(game).earth.recoveries,1);assert.equal(game.state.credits,credits);
 assert.equal(game.earthCarrierLost(carrier).affected,false);toCurrent(game);game.state.ship.id='replacement-hull';ok(act(game));assert.equal(record(game).earth.passenger.shipId,'replacement-hull');assert.equal(current(game).id,'sable-escort');
});

test('borrowed-hull defense ticks follow the physical carrier and deduplicate captain and actor views',()=>{
 const game=fresh('earth-physical-context');setStep(game,'brindle-defense');toCurrent(game);game.state.ship.id='actual-crew-hull';ok(act(game,'beginDefense'));
 const ship=structuredClone(game.state.ship),operation=record(game).earth.operation;game.state.ship={...game.state.ship,id:'parked-personal',x:90000,y:90000,hull:0,destroyed:true};
 game._earthFlightContext=shipId=>({ship:shipId===ship.id?ship:null,operating:true});
 const actor=Object.create(game);actor.state={...game.state,ship};
 game.stepNarrativeWorld(.1,[game,actor]);assert.equal(operation.failed,null);assert.equal(operation.held,.1);assert.equal(operation.elapsed,.1);
});

test('shared battles are physical to other captains but never grant unaccepted or future narrative progress',()=>{
 const a=fresh('earth-shared-scene'),b=fresh('earth-shared-scene');a._playerId='earth-alpha';b._playerId='earth-beta';b.state.ship.id='second-hull';
 setStep(a,'brindle-defense');toCurrent(a);go(b,{systemId:'brindle',x:a.state.ship.x,y:a.state.ship.y});b.bindSharedWorld(a.system,a._record(),'earth-beta');a.bindSharedWorld(a.system,a._record(),'earth-alpha');ok(act(a,'beginDefense'));
 assert.ok(b.system.enemies.some(enemy=>enemy.earthCampaign));const enemy=b.system.enemies.find(enemy=>enemy.earthCampaign);disable(b,enemy);assert.equal(a.system.enemies.find(e=>e.id===enemy.id).disabled,true);assert.equal(record(b),undefined);
 const marker=b.system.signals.find(signal=>signal.earthCampaign);const credits=b.state.credits;assert.equal(b.earthSignalAction(marker.id).code,'mission');assert.equal(b.state.credits,credits);
 accept(b);assert.equal(current(b).id,'tinbell-reading');assert.notEqual(record(a).earth.key,record(b).earth.key);assert.equal(act(b).code,'requirements');
});

test('every authored mission completes through real surface interactions, physical rescue drops and combat, retaining choices and canon',()=>{
 let game=fresh('earth-full-arc');allowExistingStory(game);const canonicalBefore=[...game.state.flags];accept(game);const startCredits=game.state.credits;
 while(record(game).status==='active'){
  const step=toCurrent(game);
  if(step.kind==='earth-defense'){winDefense(game);continue;}
  if(step.kind==='puzzle'){const view=game.narrativeBoard().active.find(q=>q.id===id);assert.equal(view.puzzle.solution,undefined);assert.equal(act(game,'solve',{solution:['forged']}).code,'puzzle');ok(act(game,'solve',{solution:step.puzzle.solution}));}
  else if(step.kind==='choice')ok(act(game,'choose',{choiceId:step.options[0].id}));
  else ok(act(game));
  if(current(game)?.id==='bastion-drop'){game=Game.fromSave(game.save());assert.equal(game.narrativeBerths(),1);}
 }
 const done=record(game);assert.equal(done.stage,EARTH_CAMPAIGN.stages.length);assert.equal(done.earth.delivered.length,3);assert.equal(done.choices['earth-legacy'],'public-record');assert.equal(done.earth.failures,0);
 assert.equal(game.state.credits,startCredits+300+900);for(const flag of canonicalBefore)assert.ok(game.hasFlag(flag));assert.ok(game.hasFlag('thread:earth_long_silence_resolved'));assert.equal(game.narrativeBerths(),0);
 const saved=Game.fromSave(game.save());assert.deepEqual(record(saved),done);assert.equal(saved.earthCampaignStatus().status,'completed');assert.equal(saved.threadAction({threadId:id,action:'advance'}).code,'duplicate');assert.equal(saved.state.credits,game.state.credits);
});

test('normalization bounds mission state and discards invented survivors and invalid operation evidence',()=>{
 const stage=EARTH_CAMPAIGN.stages.findIndex(s=>s.id==='brindle-defense');
 const normalized=normalizeEarthCampaignRecord({key:'<forged>',delivered:['invented','engineer-aru','engineer-aru'],failures:Infinity,passenger:{id:'invented',shipId:'forged'},operation:{stepId:'sol-defense',started:true,integrity:1e9,waves:[99]},attempts:{'brindle-defense':-5}},stage);
 assert.equal(normalized.key,null);assert.deepEqual(normalized.delivered,['engineer-aru']);assert.equal(normalized.passenger,null);assert.equal(normalized.operation,null);assert.equal(normalized.attempts['brindle-defense'],0);
 const ids=[...EARTH_CAMPAIGN_CONTACTS,...EARTH_CAMPAIGN_OBJECTS].map(value=>value.id);assert.equal(new Set(ids).size,ids.length);assert.equal(questThread(id),EARTH_CAMPAIGN);
});

test('losing an escort carrier allocates fresh wave identities after repickup and reconnect',()=>{
 let game=fresh('earth-escort-replay');setStep(game,'sable-rescue');toCurrent(game);ok(act(game));toCurrent(game);ok(act(game,'beginDefense'));
 const first=game.system.enemies.find(enemy=>enemy.earthCampaign),oldId=first.id;disable(game,first);
 for(let i=0;i<12&&first.hp>0;i++){game._shotTimer=0;game.state.ship.energy=game.state.ship.maxEnergy;ok(game.fireWeapons());game._updateBullets(.25,[game]);}
 assert.ok(game._record().defeated.includes(oldId));ok({ok:game.earthCarrierLost(game.state.ship.id).affected});
 game=Game.fromSave(game.save());assert.equal(current(game).id,'sable-rescue');toCurrent(game);ok(act(game));toCurrent(game);ok(act(game,'beginDefense'));
 const freshTarget=game.system.enemies.find(enemy=>enemy.earthCampaign);assert.ok(freshTarget);assert.notEqual(freshTarget.id,oldId);assert.equal(freshTarget.hp,freshTarget.maxHp);assert.equal(game.earthCampaignStatus().neutralized,0);
});

test('the relief tug travels beyond the initial watch radius so a stationary escort cannot finish',()=>{
 const game=fresh('earth-escort-distance');setStep(game,'sable-escort');toCurrent(game);ok(act(game,'beginDefense'));const initial=earthStageTarget(game,current(game));
 for(let tick=0;tick<480;tick++){
  for(const enemy of game.system.enemies.filter(enemy=>enemy.earthCampaign&&!enemy.disabled))disable(game,enemy);
  Object.assign(game.state.ship,initial);game.stepNarrativeWorld(.1,[game]);
 }
 const status=game.earthCampaignStatus();assert.ok(status.held<status.requiredHold);assert.ok(status.held>10);assert.notEqual(status.status,'ready');assert.ok(Math.hypot(earthStageTarget(game,current(game)).x-initial.x,earthStageTarget(game,current(game)).y-initial.y)>900);
});

test('native scanner routing cannot collect generic survey rewards from campaign contacts',()=>{
 const game=fresh('earth-native-scan');setStep(game,'tinbell-rescue');toCurrent(game);const marker=game.system.signals.find(signal=>signal.earthCampaign),credits=game.state.credits,scans=game.state.stats.scans;
 game.state.ship.x+=400;assert.equal(game.scan(marker.id).code,'distance');Object.assign(game.state.ship,earthStageTarget(game,current(game)));ok(game.scan(marker.id));
 assert.equal(record(game).earth.passenger.id,'engineer-aru');assert.equal(game.state.credits,credits);assert.equal(game.state.stats.scans,scans);assert.ok(!game._record().scanned.includes(marker.id));
});

test('a carrier lost after leaving a defense cleans the operation’s saved system, not unrelated local enemies',()=>{
 const game=fresh('earth-cross-system-loss');setStep(game,'sable-rescue');toCurrent(game);ok(act(game));toCurrent(game);ok(act(game,'beginDefense'));
 assert.ok(game.state.worlds.sable.spawned.some(enemy=>enemy.earthCampaign));const carrier=game.state.ship.id;
 go(game,{systemId:'nacre',x:900,y:400});const local=game.system.enemies.map(enemy=>enemy.id);const loss=game.earthCarrierLost(carrier);
 assert.equal(loss.operationSystemId,'sable');assert.ok(!game.state.worlds.sable.spawned.some(enemy=>enemy.earthCampaign));assert.deepEqual(game.system.enemies.map(enemy=>enemy.id),local);assert.equal(current(game).id,'sable-rescue');
});

test('every campaign flight waypoint resolves to the same actual position before and after entering its system',()=>{
 const game=fresh('earth-stable-waypoints');accept(game);
 for(const step of EARTH_CAMPAIGN.stages.filter(step=>['earth-scan','earth-rescue','earth-defense'].includes(step.kind))){
  go(game,{systemId:step.at.systemId==='hearth'?'nacre':'hearth',x:0,y:0});const remote=earthStageTarget(game,step);
  go(game,{systemId:step.at.systemId,x:0,y:0});const local=earthStageTarget(game,step);
  assert.equal(remote.x,local.x,step.id);assert.equal(remote.y,local.y,step.id);
 }
});
