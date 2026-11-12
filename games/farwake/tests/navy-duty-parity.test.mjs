import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { cabinLayout } from '../dist/fleet.mjs';
import { generateSurface } from '../dist/surface.mjs';
import { MILITARY_RECRUITER } from '../dist/military-content.mjs';
import { navyDutyRoles } from '../dist/navy-duty.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
function station(game,role){Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations[role]);}
function fixture(completed=8){
 const game=new Game(`navy-duty-solo-${completed}`,{startMode:'hardcore'}),surface=generateSurface(game.currentBody,game.state.seed,game.state.flags);
 const recruiter=surface.entities.find(entity=>entity.id===MILITARY_RECRUITER.id);assert.ok(recruiter);
 Object.assign(game.state.person,{x:recruiter.x,y:recruiter.y});game.state.pendingEncounter=null;
 ok(game.militaryCareerAction({action:'join',branchId:'navy',entityId:recruiter.id}));
 Object.assign(game.state.professions.careers.military,{completed,rankVersion:1,legacyRankFloor:0});
 ok(game.militaryCareerAction({action:'start',entityId:recruiter.id}));
 for(let n=0;n<1200&&game.state.npcContract.phase!=='working';n++)game.step(.1,{});
 assert.equal(game.state.npcContract.phase,'working');assert.equal(game.state.ship.classId,'leviathan');
 game.state.pendingEncounter=null;return game;
}
function signal(game,id='navy-duty-signal',offset=100){
 const value={id,name:'Duty survey packet',kind:'anomaly',x:game.state.ship.x+offset,y:game.state.ship.y,scanned:false,resolved:false,story:false};
 game.system.signals.push(value);return value;
}

test('a solo Able crew scanner uses the real carrier, spends eight power and records the captain’s own survey',()=>{
 const game=fixture(3),carrier=game.state.ship,personal=structuredClone(game.personalShip),fleet=structuredClone(game.state.fleet),credits=game.state.credits,scans=game.state.stats.scans;
 station(game,'navigation');const contact=signal(game);carrier.energy=100;
 assert.equal(game.scan(contact.id).ok,false,'ordinary scan still requires the personal ship’s helm');
 ok(game.navyCrewAction('scan',{signalId:contact.id}));
 assert.equal(carrier.energy,92);assert.equal(contact.scanned,true);assert.equal(game.state.stats.scans,scans+1);assert.ok(game.state.credits>=credits+18);
 assert.ok(game.hasFlag('first_scan'));assert.ok(game._record().scanned.includes(contact.id));
 assert.deepEqual(game.personalShip,personal);assert.deepEqual(game.state.fleet,fleet);assert.equal(game.ownsShip,false);
 assert.equal(game.state.mode,'person');assert.equal(game.state.interior.location.vesselId,carrier.id);assert.equal(game.ownShipAccess().ok,false);
 game.state.pendingEncounter=null;const far=signal(game,'beyond-duty-range',carrier.scanRange+1),before=carrier.energy;
 assert.equal(game.navyCrewAction('scan',{signalId:far.id}).code,'distance');assert.equal(far.scanned,false);assert.equal(carrier.energy,before);
 carrier.energy=7;const near=signal(game,'low-power-duty-scan');assert.equal(game.navyCrewAction('scan',{signalId:near.id}).code,'energy');assert.equal(near.scanned,false);assert.equal(carrier.energy,7);
});

test('a solo Petty officer repairs the actual Leviathan with its normal power cost and cooldown',()=>{
 const game=fixture(8),carrier=game.state.ship,personal=structuredClone(game.personalShip);station(game,'engineering');
 carrier.hull=carrier.maxHull-60;carrier.energy=100;const damaged=carrier.hull;
 const repaired=ok(game.navyCrewAction('repair'));
 assert.equal(repaired.hull,22);assert.equal(repaired.energy,28);assert.equal(carrier.hull,damaged+22);assert.equal(carrier.energy,72);
 assert.equal(game.navyCrewAction('repair').code,'cooldown');assert.equal(carrier.hull,damaged+22);assert.equal(carrier.energy,72);
 for(let n=0;n<51;n++)game.step(.1,{});
 const hull=carrier.hull,energy=carrier.energy;ok(game.navyCrewAction('repair'));
 assert.equal(carrier.hull,hull+22);assert.equal(carrier.energy,energy-28);assert.deepEqual(game.personalShip,personal);
 assert.equal(game.ownsShip,false);assert.equal(game.state.fleet.owned.includes('leviathan'),false);
});

test('solo Navy duty enforces rank, physical console, membership, health and standing without charging denied actions',()=>{
 const game=fixture(8),carrier=game.state.ship,contact=signal(game),career=game.state.professions.careers.military,contract=game.state.npcContract;
 carrier.hull=carrier.maxHull-60;carrier.energy=100;
 for(const [completed,roles] of [[0,['weapons']],[3,['weapons','scanner']],[8,['weapons','scanner','engineering']]]){
  career.completed=completed;assert.deepEqual(navyDutyRoles(game),roles);
  if(completed<3){station(game,'navigation');assert.equal(game.navyCrewAction('scan',{signalId:contact.id}).code,'military-rank');}
  if(completed<8){station(game,'engineering');assert.equal(game.navyCrewAction('repair').code,'military-rank');}
 }
 const scenarios=[
  {name:'remote console',mutate:()=>{game.state.person.x+=100;},restore:()=>{}},
  {name:'other vessel',mutate:()=>{game.state.interior.location.vesselId='another-carrier';},restore:()=>{game.state.interior.location.vesselId=carrier.id;}},
  {name:'incapacitated',mutate:()=>{game.state.person.health=0;},restore:()=>{game.state.person.health=game.state.person.maxHealth;}},
  {name:'hostile standing',mutate:()=>{game.state.rep.freewake=-25;},restore:()=>{game.state.rep.freewake=0;}},
  {name:'withdrawn member',mutate:()=>{contract.military.participants[game.playerId].withdrawn=true;},restore:()=>{delete contract.military.participants[game.playerId].withdrawn;}}
 ];
 for(const scenario of scenarios)for(const action of ['scan','repair']){
  station(game,action==='scan'?'navigation':'engineering');scenario.mutate();
  const before={energy:carrier.energy,hull:carrier.hull,credits:game.state.credits,scans:game.state.stats.scans};
  assert.equal(game.navyCrewAction(action,{signalId:contact.id}).ok,false,scenario.name+' '+action);
  assert.deepEqual({energy:carrier.energy,hull:carrier.hull,credits:game.state.credits,scans:game.state.stats.scans},before);scenario.restore();
 }
 assert.equal(game.navyCrewAction('helm').ok,false);assert.equal(game.ownShipAccess().ok,false);
});

test('solo support watch credit requires a permitted physical station and a living serving captain',()=>{
 const game=fixture(8),contract=game.state.npcContract,member=contract.military.participants[game.playerId];
 station(game,'navigation');const start=member.watchSeconds;for(let n=0;n<10;n++)game.step(.1,{});
 assert.ok(member.watchSeconds>=start+.99);assert.equal(game.state.stationView,null);
 station(game,'engineering');const scanned=member.watchSeconds;for(let n=0;n<10;n++)game.step(.1,{});assert.ok(member.watchSeconds>=scanned+.99);
 station(game,'engineering');game.state.person.x+=100;const away=member.watchSeconds;for(let n=0;n<10;n++)game.step(.1,{});assert.equal(member.watchSeconds,away);
 station(game,'navigation');game.state.professions.careers.military.completed=0;for(let n=0;n<10;n++)game.step(.1,{});assert.equal(member.watchSeconds,away);
});
