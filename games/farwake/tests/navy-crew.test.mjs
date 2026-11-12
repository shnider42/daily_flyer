import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { cabinLayout,isCabinWalkable } from '../dist/interior-layouts.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { militaryMission,MILITARY_RECRUITER } from '../dist/military-content.mjs';
import { NAVY_SHIP_COMPANY,initializeNavyCrew,stepNavyCrew,syncNavyCrewSurface,sampleNavyCrewConversation } from '../dist/navy-crew.mjs';
import { conversation } from '../dist/npc-dialogue.mjs';

const ok=value=>{assert.equal(value.ok,true,value.reason);return value;};
function company(){
 const contract={id:'company:test',vesselId:'service-hull',classId:'leviathan',active:true,phase:'boarding',clock:0,military:{branchId:'navy'},navy:{},work:{targets:[]}};
 const game={state:{ship:{id:contract.vesselId,classId:'leviathan'},crew:[],boarding:null}};
 initializeNavyCrew(game,contract);return{game,contract};
}
function embark(seed='navy-company'){
 const game=new Game(seed,{startMode:'hardcore'}),body=game.system.bodies.find(body=>body.id==='morrow');
 const recruiter=generateSurface(body,game.state.seed,game.state.flags).entities.find(entity=>entity.id===MILITARY_RECRUITER.id);
 Object.assign(game.state.person,{x:recruiter.x,y:recruiter.y});game.state.pendingEncounter=null;
 ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter.id}));
 ok(game._startNavySortie(militaryMission('freewake-navy-battery'),{operationId:'company:solo'}));return game;
}

test('the carrier has a complete company on accessible posts, including people near the entry and battery',()=>{
 const {game,contract}=company(),layout=cabinLayout('leviathan'),crew=game.state.crew;
 assert.equal(crew.length,20);assert.equal(NAVY_SHIP_COMPANY.length,crew.length);
 assert.equal(new Set(crew.map(member=>member.id)).size,crew.length);
 assert.equal(new Set(crew.map(member=>member.department)).size,6);
 for(const member of crew){assert.equal(member.serviceCrew,true);assert.ok(member.dutyLabel);assert.ok(isCabinWalkable(layout,member.x,member.y),member.name);}
 for(const [name,point] of [['entry',layout.spawn],['battery',layout.stations.security]]){
  assert.ok(crew.filter(member=>Math.hypot(member.x-point.x,member.y-point.y)<190).length>=2,name);
  assert.ok(crew.every(member=>Math.hypot(member.x-point.x,member.y-point.y)>43),`${name} remains usable`);
 }
 assert.equal(crew.find(member=>member.id.endsWith(':pilot')).name,'Commander Isen');
 assert.equal(crew.find(member=>member.id.endsWith(':worker')).name,'Chief Nara');
 assert.equal(contract.navy.companyIds.length,crew.length);
});

test('canonical rounds move continuously through real walkable deck tiles and pause for boarding',()=>{
 const {game,contract}=company(),layout=cabinLayout('leviathan'),moved=new Set();
 for(let step=0;step<900;step++){
  const before=game.state.crew.map(member=>({x:member.x,y:member.y}));stepNavyCrew(game,contract,.1);
  game.state.crew.forEach((member,index)=>{
   assert.ok(isCabinWalkable(layout,member.x,member.y),member.name);
   const delta=Math.hypot(member.x-before[index].x,member.y-before[index].y);assert.ok(delta<=3.01,`${member.name} moved ${delta}`);if(delta>.01)moved.add(member.id);
  });
 }
 assert.equal(moved.size,19);assert.ok(!moved.has(`${contract.id}:pilot`));
 const before=structuredClone(game.state.crew.map(({x,y,serviceWatch})=>({x,y,serviceWatch})));
 game.state.boarding={phase:'active'};stepNavyCrew(game,contract,1);
 assert.deepEqual(game.state.crew.map(({x,y,serviceWatch})=>({x,y,serviceWatch})),before);
 game.state.boarding=null;game._navyCrewInCombat=true;stepNavyCrew(game,contract,1);
 assert.deepEqual(game.state.crew.map(({x,y,serviceWatch})=>({x,y,serviceWatch})),before);
});

test('legacy Navy saves add missing sailors once and never restore an injured or dead crewmember',()=>{
 const {game,contract}=company(),pilot=game.state.crew[0],chief=game.state.crew[1];
 delete contract.navy.companyIds;delete contract.navy.companyVersion;
 game.state.crew=[{id:pilot.id,name:'Commander Isen',health:37,maxHealth:100,status:'injured'},{id:chief.id,name:'Chief Nara',health:0,maxHealth:100,status:'dead'}];
 initializeNavyCrew(game,contract);assert.equal(game.state.crew.length,20);
 assert.equal(game.state.crew[0].health,37);assert.equal(game.state.crew[0].status,'injured');assert.equal(game.state.crew[1].health,0);assert.equal(game.state.crew[1].status,'dead');
 const missing=game.state.crew.pop();initializeNavyCrew(game,contract);assert.equal(game.state.crew.length,19);assert.ok(!game.state.crew.some(member=>member.id===missing.id));
 const deadBefore={x:game.state.crew[1].x,y:game.state.crew[1].y};stepNavyCrew(game,contract,1);
 assert.deepEqual({x:game.state.crew[1].x,y:game.state.crew[1].y},deadBefore);assert.equal(game.state.crew[1].health,0);
});

test('service sailors do not consume player berths, grant specialist bonuses, or change the personal roster',()=>{
 const game=embark(),contract=game.state.npcContract;
 assert.equal(game.state.crew.length,20);assert.equal(game.livingCrew.length,20);assert.equal(game.freeBerths,15);
 const expected={maxHull:game.state.ship.maxHull,maxEnergy:game.state.ship.maxEnergy,damage:game.state.ship.damage,cargoCap:game.state.ship.cargoCap};
 const sailor=game.state.crew.find(member=>member.serviceId==='engine-chief');sailor.role='engineer';game._updateStats(false);
 assert.deepEqual({maxHull:game.state.ship.maxHull,maxEnergy:game.state.ship.maxEnergy,damage:game.state.ship.damage,cargoCap:game.state.ship.cargoCap},expected);
 assert.equal(contract.personal.crew.length,0);
 for(let n=0;n<250;n++)game.step(.1,{});
 const pose=game.state.crew.map(({id,x,y,serviceWatch,health})=>({id,x,y,serviceWatch:structuredClone(serviceWatch),health}));
 const restored=Game.fromSave(game.save());assert.deepEqual(restored.state.crew.map(({id,x,y,serviceWatch,health})=>({id,x,y,serviceWatch,health})),pose);
 assert.equal(restored.state.npcContract.personal.crew.length,0);assert.equal(restored.state.crew.length,20);
});

test('the deck renders canonical sailor activity and the capitalized Helm without separate crowd simulation',()=>{
 const {game,contract}=company(),location={kind:'ship',id:`ship:${contract.vesselId}`,vesselId:contract.vesselId,classId:'leviathan',crew:game.state.crew};
 const surface=generateSurface(location,'company');assert.equal(surface.entities.filter(entity=>entity.data?.serviceCrew).length,20);
 assert.equal(surface.entities.find(entity=>entity.data?.stationRole==='helm').name,'Captain’s Helm');
 for(let n=0;n<400;n++)stepNavyCrew(game,contract,.1);syncNavyCrewSurface(surface,game.state.crew);
 for(const member of game.state.crew){const entity=surface.entities.find(entity=>entity.data?.crewId===member.id);assert.equal(entity.x,member.x);assert.equal(entity.y,member.y);assert.deepEqual(entity.life,member.life);assert.equal(entity.data.roleLabel,member.dutyLabel);}
 const sailor=game.state.crew[8],entity=surface.entities.find(entity=>entity.data?.crewId===sailor.id);sailor.health=0;sailor.status='dead';syncNavyCrewSurface(surface,game.state.crew);assert.equal(entity.hidden,true);
});

test('crew conversations retain personal rank and nearby chatter does not predict a future attack',()=>{
 const game=embark(),contract=game.state.npcContract;stepNavyCrew(game,contract,.1);
 const surface=generateSurface(game.state.interior.location,game.state.seed),chief=surface.entities.find(entity=>entity.data?.crewId===`${contract.id}:worker`);
 const dialogue=conversation(game,chief,{record:false});assert.equal(dialogue.context,'military-service');assert.match(dialogue.greeting,/four batteries/);assert.equal(dialogue.role,'Chief gunner');
 const speaker=surface.entities.find(entity=>entity.data?.serviceCrew&&entity.data.department==='Deck');Object.assign(game.state.person,{x:speaker.x,y:speaker.y});
 contract.clock=8;contract.navy.attackPlanned=true;const cue=sampleNavyCrewConversation(surface,contract,game.state.person);assert.ok(cue);assert.equal(cue.seconds,7);assert.equal(sampleNavyCrewConversation(surface,contract,game.state.person,{lastKey:cue.key}),null);
 contract.navy.spawned=true;contract.work.targets=[{neutralized:false}];assert.equal(sampleNavyCrewConversation(surface,contract,game.state.person),null);
});
