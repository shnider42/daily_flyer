import test from 'node:test';
import assert from 'node:assert/strict';
import { Realm } from '../../server/realm.mjs';
import { cabinLayout } from '../../dist/fleet.mjs';
import { MILITARY_RECRUITER } from '../../dist/military-content.mjs';
import { navyDutyRoles } from '../../dist/navy-duty.mjs';

const storage=()=>({kind:'memory',async save(_id,version){return{version:version+1};}});
const ok=result=>{assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));return result;};
const tick=realm=>{const at=Date.now();realm.step(.1,realm.tick+1,at,at);};
function station(captain,vessel,role){Object.assign(captain.game.state.person,cabinLayout(vessel.ship.classId).stations[role]);}
function recruiter(realm,captain){
 const entity=realm._surface(captain).entities.find(item=>item.id===MILITARY_RECRUITER.id);assert.ok(entity);
 Object.assign(captain.game.state.person,{x:entity.x,y:entity.y});captain.game.state.pendingEncounter=null;return entity.id;
}
async function recruit(realm,name,completed,{regular=false}={}){
 const {captain}=await realm.createCaptain(name,{startMode:regular?'regular':'hardcore'});ok(realm.attach(captain,{close(){}}));
 if(regular){const own=realm.vessels.get(captain.ownedVesselId),body=realm._room('hearth').runtime.bodies.find(item=>item.id==='morrow');Object.assign(own.ship,{x:body.x+body.radius+80,y:body.y,vx:0,vy:0});ok(realm._command(captain,'dock',{id:'morrow'}));}
 ok(realm._command(captain,'militaryCareerAction',{action:'join',branchId:'navy',entityId:recruiter(realm,captain)}));
 Object.assign(captain.game.state.professions.careers.military,{completed,rankVersion:1,legacyRankFloor:0});return captain;
}
async function fixture({shared=true}={}){
 const realm=new Realm({id:'DUTY1234',seed:'navy-duty-authority',persistence:storage()}),leader=await recruit(realm,'Engineer',8,{regular:true});
 const ownId=leader.ownedVesselId,ownShip=structuredClone(realm.vessels.get(ownId).ship),ownCargo=structuredClone(leader.game.state.cargo);
 let scanner=leader,junior=null;
 if(shared){
  scanner=await recruit(realm,'Scanner',3);junior=await recruit(realm,'Recruit',0);
  const started=ok(realm._command(leader,'militaryCareerAction',{action:'createOperation',entityId:recruiter(realm,leader)}));
  for(const member of [scanner,junior])ok(realm._command(member,'militaryCareerAction',{action:'joinOperation',operationId:started.operationId,entityId:recruiter(realm,member)}));
  ok(realm._command(leader,'militaryCareerAction',{action:'launchOperation',operationId:started.operationId}));
 }else ok(realm._command(leader,'militaryCareerAction',{action:'start',entityId:recruiter(realm,leader)}));
 const vessel=realm.vessels.get(leader.aboard),contract=leader.game.state.npcContract;
 for(let n=0;n<1200&&contract.phase!=='working';n++)tick(realm);
 assert.equal(contract.phase,'working');assert.equal(vessel.ship.classId,'leviathan');
 for(const member of [leader,scanner,junior].filter(Boolean))member.game.state.pendingEncounter=null;
 return{realm,leader,scanner,junior,vessel,contract,ownId,ownShip,ownCargo};
}
function signal(realm,vessel,id='shared-duty-signal',offset=100){
 const value={id,name:'Duty survey packet',kind:'anomaly',x:vessel.ship.x+offset,y:vessel.ship.y,scanned:false,resolved:false,story:false};
 realm._room(vessel.systemId).runtime.signals.push(value);return value;
}

test('a shared Navy scanner credits only the acting captain and uses the canonical carrier’s power and range',async()=>{
 const {realm,leader,scanner,junior,vessel,ownId,ownShip}=await fixture();
 station(scanner,vessel,'navigation');const contact=signal(realm,vessel);vessel.ship.energy=100;
 const before=new Map([leader,scanner,junior].map(c=>[c.id,{credits:c.game.state.credits,scans:c.game.state.stats.scans,flags:[...c.game.state.flags]}]));
 ok(realm._command(scanner,'crewAction',{action:'scan',signalId:contact.id}));
 assert.equal(vessel.ship.energy,92);assert.equal(contact.scanned,true);assert.equal(scanner.game.state.stats.scans,before.get(scanner.id).scans+1);assert.ok(scanner.game.state.credits>=before.get(scanner.id).credits+18);assert.ok(scanner.game.hasFlag('first_scan'));
 for(const other of [leader,junior]){assert.equal(other.game.state.stats.scans,before.get(other.id).scans);assert.equal(other.game.state.credits,before.get(other.id).credits);assert.deepEqual(other.game.state.flags,before.get(other.id).flags);}
 assert.equal(scanner.crewRole,'scanner');assert.equal(scanner.game.state.mode,'person');assert.equal(scanner.aboard,vessel.id);assert.equal(vessel.helmOwner,null);
 assert.equal(scanner.ownedVesselId,null);assert.equal(scanner.game.state.fleet.owned.includes('leviathan'),false);assert.equal(leader.ownedVesselId,ownId);assert.deepEqual(realm.vessels.get(ownId).ship,ownShip);
 assert.equal(realm._command(scanner,'quickHelm',{}).ok,false);
 scanner.game.state.pendingEncounter=null;const far=signal(realm,vessel,'shared-far-duty-signal',vessel.ship.scanRange+1),energy=vessel.ship.energy;
 assert.equal(realm._command(scanner,'crewAction',{action:'scan',signalId:far.id}).code,'distance');assert.equal(far.scanned,false);assert.equal(vessel.ship.energy,energy);
});

test('personal and shared server deployments grant the same ranked support duties as solo',async()=>{
 for(const shared of [false,true]){
  const {realm,leader,scanner,junior,vessel,ownId,ownShip,ownCargo}=await fixture({shared});
  assert.deepEqual(navyDutyRoles(leader.game),['weapons','scanner','engineering']);
  assert.deepEqual(vessel.grants[leader.id].roles,['weapons','scanner','engineering']);
  if(shared){assert.deepEqual(navyDutyRoles(scanner.game),['weapons','scanner']);assert.deepEqual(navyDutyRoles(junior.game),['weapons']);}
  station(leader,vessel,'engineering');vessel.ship.hull=vessel.ship.maxHull-60;vessel.ship.energy=100;const hull=vessel.ship.hull;
  const repaired=ok(realm._command(leader,'crewAction',{action:'repair'}));
  assert.equal(repaired.hull,22);assert.equal(repaired.energy,28);assert.equal(vessel.ship.hull,hull+22);assert.equal(vessel.ship.energy,72);
  assert.equal(realm._command(leader,'crewAction',{action:'repair'}).code,'cooldown');assert.equal(vessel.ship.hull,hull+22);assert.equal(vessel.ship.energy,72);
  for(let n=0;n<51;n++)tick(realm);
  const before={hull:vessel.ship.hull,energy:vessel.ship.energy};ok(realm._command(leader,'crewAction',{action:'repair'}));
  assert.equal(vessel.ship.hull,before.hull+22);assert.equal(vessel.ship.energy,before.energy-28);
  assert.equal(leader.ownedVesselId,ownId);assert.deepEqual(realm.vessels.get(ownId).ship,ownShip);assert.deepEqual(leader.game.state.cargo,ownCargo);assert.equal(vessel.helmOwner,null);assert.equal(realm._command(leader,'quickHelm',{}).ok,false);
 }
});

test('shared Navy duty rejects junior, remote, wrong-vessel, incapacitated, and suspended captains before mutating the world',async()=>{
 const {realm,leader,junior,vessel}=await fixture();const contact=signal(realm,vessel);vessel.ship.energy=100;vessel.ship.hull=vessel.ship.maxHull-60;
 // Even an accidentally broad stored vessel grant cannot override a recruit’s
 // personal service rank at the authority boundary.
 vessel.grants[junior.id].roles=['weapons','scanner','engineering','helm'];
 for(const action of ['scan','repair']){station(junior,vessel,action==='scan'?'navigation':'engineering');assert.equal(realm._command(junior,'crewAction',{action,signalId:contact.id}).ok,false);}
 assert.equal(realm._command(junior,'quickHelm',{}).ok,false,'a Navy service grant never authorizes the employer helm');
 const scenarios=[
  {name:'remote console',mutate:()=>{leader.game.state.person.x+=100;},restore:()=>{}},
  {name:'wrong vessel',mutate:()=>{leader.game.state.interior.location.vesselId='foreign-vessel';},restore:()=>{leader.game.state.interior.location.vesselId=vessel.id;}},
  {name:'incapacitated',mutate:()=>{leader.game.state.person.down=true;},restore:()=>{leader.game.state.person.down=false;}},
  {name:'suspended standing',mutate:()=>{leader.game.state.rep.freewake=-25;},restore:()=>{leader.game.state.rep.freewake=0;}}
 ];
 for(const scenario of scenarios)for(const action of ['scan','repair']){
  station(leader,vessel,action==='scan'?'navigation':'engineering');scenario.mutate();
  const before={energy:vessel.ship.energy,hull:vessel.ship.hull,credits:leader.game.state.credits,scans:leader.game.state.stats.scans};
  assert.equal(realm._command(leader,'crewAction',{action,signalId:contact.id}).ok,false,scenario.name+' '+action);
  assert.deepEqual({energy:vessel.ship.energy,hull:vessel.ship.hull,credits:leader.game.state.credits,scans:leader.game.state.stats.scans},before);scenario.restore();
 }
 assert.equal(contact.scanned,false);assert.equal(vessel.ship.energy,100);assert.equal(vessel.helmOwner,null);
});

test('shared support watch time belongs only to living online members at their personally permitted consoles',async()=>{
 const {realm,leader,scanner,junior,vessel,contract}=await fixture();
 station(leader,vessel,'engineering');station(scanner,vessel,'navigation');station(junior,vessel,'navigation');
 const records=contract.military.participants,start=Object.fromEntries([leader,scanner,junior].map(c=>[c.id,records[c.id].watchSeconds]));
 for(let n=0;n<10;n++)tick(realm);
 assert.ok(records[leader.id].watchSeconds>=start[leader.id]+.99);assert.ok(records[scanner.id].watchSeconds>=start[scanner.id]+.99);assert.equal(records[junior.id].watchSeconds,start[junior.id]);
 const served=records[scanner.id].watchSeconds;realm.detach(scanner,scanner.session);for(let n=0;n<10;n++)tick(realm);assert.equal(records[scanner.id].watchSeconds,served);
 assert.equal(leader.game.state.stationView,null);assert.equal(vessel.helmOwner,null);
});
