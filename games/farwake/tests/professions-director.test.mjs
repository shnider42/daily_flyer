import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, buildGalaxy } from '../dist/engine.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { advanceWorldDirector, syncDirectorWorld, recordDirectorDamage, recordDirectorAid, directorBoard, WORLD_DIRECTOR_RULES } from '../dist/world-director.mjs';

const deskId=body=>`quest:profession-desk:${body}`;
function clinic(game,bodyId,systemId=game.state.systemId){
 if(game.state.mode==='person'){game.state.pendingEncounter=null;assert.equal(game.launch().ok,true);}
 if(systemId!==game.state.systemId){game._persistRuntime();game.state.systemId=systemId;game._loadSystem(systemId);}
 const body=game.system.bodies.find(body=>body.id===bodyId);assert.ok(body);
 Object.assign(game.state.ship,{x:body.x+body.radius+35,y:body.y});game.state.pendingEncounter=null;
 assert.equal(game.dock(body.id).ok,true);
 const desk=generateSurface(body,game.state.seed,game.state.flags).entities.find(entity=>entity.id===deskId(bodyId));assert.ok(desk);
 Object.assign(game.state.person,{x:desk.x,y:desk.y});return desk.id;
}
function begin(game,professionId,entityId){
 const joined=game.enlistProfession({professionId,entityId});assert.equal(joined.ok,true,joined.reason);
 const offered=game.professionBoard(entityId).offers.find(value=>value.professionId===professionId);assert.ok(offered);
 const accepted=game.professionAction({action:'accept',jobId:offered.id,eventId:offered.eventId,entityId});assert.equal(accepted.ok,true,accepted.reason);return game.state.professions.active;
}
function solveTriage(game,job,entityId){
 const puzzle=game.professionBoard(entityId).active.puzzle;
 const first=puzzle.inputs[0].options.find(option=>option.label==='Aster')?'Aster':puzzle.inputs[0].options.find(option=>option.label==='Daro')?'Daro':'Gita';
 const order={Aster:['Aster','Celia','Bram'],Daro:['Eli','Fenn','Daro'],Gita:['Iris','Gita','Holl']}[first];
 const solution=order.map(name=>puzzle.inputs[0].options.find(option=>option.label===name).id);
 return game.professionAction({action:'triage',jobId:job.id,entityId,solution});
}
function shoot(game,enemy,damage,playerId=game.playerId){
 game.system.bullets.push({id:`test:${playerId}:${damage}`,x:enemy.x,y:enemy.y,vx:1,vy:0,ttl:1,damage,owner:'player',ownerId:playerId,vesselId:game.state.ship.id,radius:4});
 game._updateBullets(.05,[game]);
}

function scheduledIncident(game,type,status='active'){
 const options={seed:game.state.seed,systems:game.galaxy};
 for(let seconds=30;seconds<=86400;seconds+=30){
  game.state.worldDirector=advanceWorldDirector(game.worldDirector,seconds,options).state;
  const incident=game.worldDirector.events.find(event=>event.type===type&&event.status===status);
  if(incident){game.state.stats.time=seconds;game._persistRuntime();game.state.systemId=incident.systemId;game._loadSystem(incident.systemId);return incident;}
 }
 assert.fail(`No ${status} ${type} occurred during the simulated day`);
}

test('director uses monotonic, deterministic clocks and bounded offline catch-up',()=>{
 const systems=buildGalaxy('director-clock'),options={seed:'director-clock',systems};
 const first=advanceWorldDirector(null,0,options);assert.equal(first.state.cycle,-1);assert.equal(first.state.events.length,0);
 const frozen=JSON.stringify(first.state),same=advanceWorldDirector(first.state,2,options);assert.equal(same.state,first.state);assert.equal(JSON.stringify(first.state),frozen);
 assert.equal(advanceWorldDirector(first.state,-4,options).state,first.state);
 let stepped=first.state;for(let now=5;now<=6000;now+=5)stepped=advanceWorldDirector(stepped,now,options).state;
 const direct=advanceWorldDirector(first.state,6000,options).state;
 for(const key of ['events','history','conditions','factionPressure','cycle'])assert.deepEqual(direct[key],stepped[key],key);
 assert.ok(direct.history.some(event=>event.outcome==='unassisted'));
 assert.ok(Object.values(direct.conditions).some(condition=>condition.serviceMultiplier>1));
 const future=advanceWorldDirector(direct,365*86400,options).state;
 assert.ok(future.skippedCycles>20000);assert.ok(future.events.length<=WORLD_DIRECTOR_RULES.maxEvents);assert.ok(future.history.length<=24);assert.ok(Object.keys(future.conditions).length<=48);
 assert.equal(new Set(future.history.map(event=>event.id)).size,future.history.length);
 const persisted=JSON.parse(JSON.stringify(future));assert.deepEqual(advanceWorldDirector(persisted,365*86400,options).state,persisted);
});

test('raid warning becomes real ships; repeated synchronization is idempotent and damaged hulls persist',()=>{
 const game=new Game('director-ships'),options={seed:game.state.seed,systems:game.galaxy};
 const incident=scheduledIncident(game,'raid','warning');syncDirectorWorld(game,game.worldDirector);
 assert.equal(game.system.enemies.filter(enemy=>enemy.directorEventId).length,0);
 game.state.worldDirector=advanceWorldDirector(game.worldDirector,incident.activeAt,options).state;syncDirectorWorld(game,game.worldDirector);
 const raiders=game.system.enemies.filter(enemy=>enemy.directorEventId);assert.equal(raiders.length,2);assert.ok(raiders.every(enemy=>enemy.boardable&&enemy.renderLength>=56));
 syncDirectorWorld(game,game.worldDirector);assert.equal(game.system.enemies.filter(enemy=>enemy.directorEventId).length,2);
 raiders[0].hp-=5;game._record().enemyHealth[raiders[0].id]=raiders[0].hp;
 game.state.worldDirector=advanceWorldDirector(game.worldDirector,incident.expiresAt+5,options).state;syncDirectorWorld(game,game.worldDirector);
 assert.ok(game.system.enemies.some(enemy=>enemy.id===raiders[0].id));assert.ok(!game.system.enemies.some(enemy=>enemy.id===raiders[1].id));
});

test('each real contributor can receive one relief stipend; a late arrival cannot',()=>{
 const game=new Game('director-team');game._playerId='medic-one';const options={seed:game.state.seed,systems:game.galaxy};
 scheduledIncident(game,'raid');syncDirectorWorld(game,game.worldDirector);
 const raid=game.worldDirector.events.find(event=>event.type==='raid'),enemies=game.system.enemies.filter(enemy=>enemy.directorEventId===raid.id);
 enemies[0].hp=25;recordDirectorDamage(game.worldDirector,enemies[0],'medic-one',40);
 enemies[1].hp=30;recordDirectorDamage(game.worldDirector,enemies[1],'medic-two',50);
 game.state.worldDirector=advanceWorldDirector(game.worldDirector,game.worldDirector.time+5,options).state;
 const event=game.worldDirector.history.find(event=>event.id===raid.id);assert.equal(event.outcome,'stabilized');
 const entityId=clinic(game,event.bodyId),before=game.state.credits;
 assert.equal(game.professionAction({action:'claimRelief',eventId:event.id,entityId}).ok,true);assert.equal(game.state.credits,before+45);
 assert.equal(game.professionAction({action:'claimRelief',eventId:event.id,entityId}).ok,false);
 game._playerId='late-arrival';assert.equal(game.professionAction({action:'claimRelief',eventId:event.id,entityId}).code,'contribution');
 game._playerId='medic-two';assert.equal(game.professionAction({action:'claimRelief',eventId:event.id,entityId}).ok,true);
 const publicData=directorBoard(game.worldDirector,{playerId:'medic-two'});assert.ok(publicData.history.find(value=>value.id===raid.id).contribution.claimed);
});

test('medical contributions use once-only physical action tokens',()=>{
 const game=new Game('director-aid'),options={seed:game.state.seed,systems:game.galaxy};
 const event=scheduledIncident(game,'rescue');assert.equal(recordDirectorAid(game.worldDirector,event.id,'local','completed-shift-1'),true);assert.equal(recordDirectorAid(game.worldDirector,event.id,'local','completed-shift-1'),false);
 assert.equal(event.progress,1);assert.equal(recordDirectorAid(game.worldDirector,event.id,'colleague','completed-shift-2'),true);
 game.state.worldDirector=advanceWorldDirector(game.worldDirector,game.worldDirector.time+5,options).state;assert.equal(game.worldDirector.history.find(value=>value.id===event.id).outcome,'stabilized');
});

test('paramedic shift requires both real docking legs, assigned hull and a real spare berth',()=>{
 let game=new Game('patient-transfer');const entityId=clinic(game,'kettle'),job=begin(game,'paramedic',entityId),before=game.state.credits;
 assert.notEqual(job.originBody,job.targetBody);assert.equal(game.professionBerths(),0);
 assert.equal(game.professionAction({action:'admitPatient',jobId:job.id,entityId}).ok,false);
 assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId}).ok,false);
 const pickupId=clinic(game,job.targetBody);const shipId=game.state.ship.id;
 game.state.ship.id='different-ship';assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickupId}).code,'vessel');game.state.ship.id=shipId;
 game.state.ship.humanOccupants=game.state.ship.berths;assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickupId}).code,'capacity');game.state.ship.humanOccupants=1;
 assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickupId}).ok,true);assert.equal(game.professionBerths(),1);
 assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickupId}).ok,false);
 game=Game.fromSave(game.save());assert.equal(game.professionBerths(),1);
 const original=clinic(game,job.originBody);assert.equal(game.professionAction({action:'admitPatient',jobId:job.id,entityId:original}).ok,true);assert.equal(game.state.credits,before+job.reward);assert.equal(game.professionBerths(),0);
 assert.equal(game.professionAction({action:'admitPatient',jobId:job.id,entityId:original}).ok,false);
});

test('a lost patient hull closes the shift without wages or stranded reserved seats',()=>{
 const game=new Game('rescue-patient'),entityId=clinic(game,'kettle'),job=begin(game,'paramedic',entityId),pickupId=clinic(game,job.targetBody);
 assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickupId}).ok,true);const credits=game.state.credits;
 assert.equal(game.professionRescue(),true);assert.equal(game.professionBerths(),0);assert.equal(game.state.professions.active,null);assert.equal(game.state.credits,credits);assert.equal(game.state.professions.history[0].paid,0);
});

test('clinic work needs three valid scanner cases; wrong answers, remote actions and replay cannot mint wages',()=>{
 const game=new Game('doctor-shift'),entityId=clinic(game,'kettle'),job=begin(game,'doctor',entityId),before=game.state.credits;
 assert.equal(game.professionBoard(entityId).active.puzzle.solution,undefined);
 assert.equal(game.professionAction({action:'triage',jobId:job.id,entityId,solution:['wrong','wrong','wrong']}).code,'puzzle');assert.equal(game.state.credits,before);
 game.state.person.x+=100;assert.equal(solveTriage(game,job,entityId).code,'distance');game.state.person.x-=100;
 assert.equal(solveTriage(game,job,entityId).ok,true);assert.equal(game.state.credits,before);
 assert.equal(solveTriage(game,job,entityId).ok,true);assert.equal(game.state.credits,before);
 assert.equal(solveTriage(game,job,entityId).ok,true);assert.equal(game.state.credits,before+job.reward);assert.equal(game.state.professions.careers.doctor.xp,1);
 assert.equal(game.professionAction({action:'triage',jobId:job.id,entityId,solution:[]}).ok,false);
 const next=game.professionBoard(entityId).offers.find(o=>o.professionId==='doctor');assert.equal(next.actions[0].available,false);assert.match(next.actions[0].reason,/resets/);
});

test('law inquiry requires another port and permits a morally consequential civilian protection route',()=>{
 const game=new Game('law-protect'),entityId=clinic(game,'kettle'),job=begin(game,'law',entityId);
 assert.equal(game.professionAction({action:'interview',jobId:job.id,entityId}).code,'location');
 const remote=clinic(game,job.targetBody);assert.equal(game.professionAction({action:'interview',jobId:job.id,entityId:remote}).ok,true);
 assert.equal(game.professionAction({action:'choose',jobId:job.id,entityId:remote,choiceId:'protect'}).ok,true);
 assert.equal(game.professionAction({action:'report',jobId:job.id,entityId:remote}).code,'location');
 const origin=clinic(game,job.originBody),before=game.state.credits,result=game.professionAction({action:'report',jobId:job.id,entityId:origin});assert.equal(result.ok,true);assert.equal(result.paid,Math.round(job.reward*.7));assert.equal(game.state.credits,before+result.paid);
});

test('living arrest requires real hull damage and preserves the surrendered ship',()=>{
 const game=new Game('law-arrest'),entityId=clinic(game,'kettle'),job=begin(game,'law',entityId),remote=clinic(game,job.targetBody);
 assert.equal(game.professionAction({action:'interview',jobId:job.id,entityId:remote}).ok,true);assert.equal(game.professionAction({action:'choose',jobId:job.id,entityId:remote,choiceId:'detain'}).ok,true);
 assert.equal(game.launch().ok,true);const enemy=game.system.enemies.find(e=>e.id===job.targetId);assert.ok(enemy);Object.assign(game.state.ship,{x:enemy.x-60,y:enemy.y});
 assert.equal(game.professionAction({action:'demandSurrender',jobId:job.id}).code,'requirements');shoot(game,enemy,60);assert.equal(enemy.disabled,true);
 assert.equal(game.professionAction({action:'demandSurrender',jobId:job.id}).ok,true);assert.ok(game.system.enemies.some(e=>e.id===enemy.id));assert.equal(enemy.surrendered,true);
 const origin=clinic(game,job.originBody);assert.equal(game.professionAction({action:'report',jobId:job.id,entityId:origin}).ok,true);
});

test('military patrol rewards actual participation and rival employers cannot issue its work',()=>{
 const game=new Game('military-patrol'),entityId=clinic(game,'kettle'),job=begin(game,'military',entityId);assert.equal(job.eventId,null);
 assert.equal(game.launch().ok,true);const enemy=game.system.enemies.find(e=>e.id===job.targetId);assert.ok(enemy);Object.assign(game.state.ship,{x:enemy.x-70,y:enemy.y});
 shoot(game,enemy,60,'another-captain');assert.equal(game.professionAction({action:'confirmPatrol',jobId:job.id}).ok,false);
 shoot(game,enemy,14);assert.equal(game.professionAction({action:'confirmPatrol',jobId:job.id}).ok,true);
 const origin=clinic(game,job.originBody);assert.equal(game.professionAction({action:'report',jobId:job.id,entityId:origin}).ok,true);
 game.state.stats.time+=60;const rivalDesk=clinic(game,'patchwork','cinder'),offered=game.professionBoard(rivalDesk).offers.find(value=>value.professionId==='military');assert.equal(offered.actions[0].available,false);assert.match(offered.actions[0].reason,/employer/);
 assert.equal(game.professionAction({action:'accept',jobId:offered.id,entityId:rivalDesk}).code,'faction');
});

test('medical credentials travel, but a new shift benefits the local clinic faction',()=>{
 const game=new Game('mobile-clinician'),origin=clinic(game,'kettle');assert.equal(game.enlistProfession({professionId:'doctor',entityId:origin}).ok,true);
 const entityId=clinic(game,'bastion','nacre'),offered=game.professionBoard(entityId).offers.find(value=>value.professionId==='doctor');assert.equal(offered.actions[0].available,true);assert.equal(game.professionAction({action:'accept',jobId:offered.id,entityId}).ok,true);const job=game.state.professions.active;
 assert.equal(job.factionId,'concord');const before=game.state.rep.concord;for(let round=0;round<3;round++)assert.equal(solveTriage(game,job,entityId).ok,true);assert.equal(game.state.rep.concord,before+2);
});

test('lawful Earth landings can use and restore clinic work without dispatching new jobs behind quarantine',()=>{
 let game=new Game('earth-clinic');
 for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])game._flag(flag);
 const entityId=clinic(game,'earth','sol'),job=begin(game,'doctor',entityId);
 assert.equal(game.professionBoard(entityId).available,true);assert.equal(job.originBody,'earth');
 game=Game.fromSave(game.save());assert.equal(game.state.professions.active?.id,job.id);
 for(let round=0;round<3;round++)assert.equal(solveTriage(game,job,entityId).ok,true);
 const threshold=clinic(game,'threshold');
 const offers=game.professionBoard(threshold).offers;
 assert.ok(!offers.some(offer=>['paramedic','law'].includes(offer.professionId)), 'Earth is not offered as the only other destination');
 assert.ok(offers.some(offer=>offer.professionId==='doctor'));
});

test('abandoning an occupied solo hull closes its ambulance assignment before replacing the ship id',()=>{
 const game=new Game('occupied-ambulance'),entityId=clinic(game,'kettle'),job=begin(game,'paramedic',entityId),pickup=clinic(game,job.targetBody);
 assert.equal(game.professionAction({action:'pickupPatient',jobId:job.id,entityId:pickup}).ok,true);
 const oldId=game.state.ship.id,credits=game.state.credits;
 game._abandonOccupiedShip({enemies:[{id:'boarder',health:30}]},{faction:'cinder'});
 assert.notEqual(game.state.ship.id,oldId);assert.equal(game.state.professions.active,null);assert.equal(game.professionBerths(),0);assert.equal(game.state.credits,credits);
 assert.equal(game.state.professions.history.filter(entry=>entry.id===job.id).length,1);
 game.professionRescue();assert.equal(game.state.professions.history.filter(entry=>entry.id===job.id).length,1);
});
