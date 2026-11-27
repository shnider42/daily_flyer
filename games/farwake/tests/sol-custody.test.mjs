import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {solCaptureProfile,SOL_TRACTOR_RANGE} from '../dist/sol-custody.mjs';
import {findFactionSupercapital,supercapitalTractorAnchor} from '../dist/faction-supercapitals.mjs';
import {solClearance} from '../dist/sol-access.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';

const ok=r=>{assert.equal(r?.ok,true,r?.reason);return r;};
function ready(){const g=new Game('custody-integration',{startMode:'casual'});g.state.upgrades.fold_3=1;g._updateStats();g.state.systemId='witness';g._loadSystem('witness');g.state.pendingEncounter=null;g.state.ship.fuel=g.state.ship.maxFuel;ok(g.travel('sol'));return g;}
function tick(g,seconds,input={}){for(let i=0;i<Math.round(seconds*10);i++)g.step(.1,input);}
function capture(g=ready()){for(let i=0;i<500&&!g.state.custody;i++)g.step(.1,{});assert.equal(g.state.custody?.phase,'detained');return g;}

test('a small ship has a real acquisition, visible tow and intact impound inside the actual flagship',()=>{
 const g=ready(),id=g.state.ship.id,cargo=structuredClone(g.state.cargo),hull=g.state.ship.hull;
 tick(g,8.2);assert.equal(g.custodyStatus().phase,'locking');assert.equal(g.system.bullets.some(b=>b.solCordon),false);assert.equal(g.state.ship.hull,hull);
 const start={x:g.state.ship.x,y:g.state.ship.y};tick(g,7);assert.equal(g.custodyStatus().phase,'towing');assert.ok(Math.hypot(g.state.ship.x-start.x,g.state.ship.y-start.y)>100);
 const beam=g.system.solCordon.visits[id].tractor,anchor=supercapitalTractorAnchor(findFactionSupercapital(g.system,'concord'));
 assert.equal(beam.sourceId,anchor.hostVesselId);assert.equal(beam.source.x,anchor.x);assert.equal(beam.source.y,anchor.y);assert.equal(beam.range,SOL_TRACTOR_RANGE);
 capture(g);assert.equal(g.state.ship.id,id);assert.equal(g.ownsShip,true);assert.equal(g.state.ship.hull,hull);assert.deepEqual(g.state.cargo,cargo);
 assert.equal(g.state.interior.kind,'brig');assert.equal(g.state.interior.location.hostVesselId,'sol:supercapital:concord');assert.equal(g.state.ship.impoundedBy,'sol:supercapital:concord');
 assert.equal(g.state.stats.rescues,0);assert.equal(g.state.shipRecovery,undefined);assert.equal(g.state.fleet.history.some(r=>r.type==='loss'),false);assert.deepEqual(solClearance(g),{entry:false,landing:false});
});

test('the physical tractor, spent countermeasure and prisoner timer survive supported save/load',()=>{
 let g=ready();tick(g,15);const beam=structuredClone(g.system.solCordon.visits[g.state.ship.id].tractor);g=Game.fromSave(g.save());assert.deepEqual(g.system.solCordon.visits[g.state.ship.id].tractor,beam);
 capture(g);tick(g,10);const record=structuredClone(g.state.custody),position={x:g.state.person.x,y:g.state.person.y};g=Game.fromSave(g.save());assert.deepEqual(g.state.custody,record);assert.deepEqual({x:g.state.person.x,y:g.state.person.y},position);assert.equal(g.state.interior.kind,'brig');
});

test('counterpulse spends real energy once and ordinary return travel remains available during a tractor lock',()=>{
 const g=ready();tick(g,8.2);const energy=g.state.ship.energy;ok(g.custodyAction('break-lock'));assert.equal(g.state.ship.energy,energy-60);assert.equal(g.custodyStatus(),null);assert.equal(g.system.solCordon.visits[g.state.ship.id].counterUsed,true);
 const reloaded=Game.fromSave(g.save());assert.equal(reloaded.system.solCordon.visits[g.state.ship.id].counterUsed,true);
 const anchor=supercapitalTractorAnchor(findFactionSupercapital(reloaded.system,'concord'));Object.assign(reloaded.state.ship,{x:anchor.x+SOL_TRACTOR_RANGE+100,y:anchor.y,vx:0,vy:0});tick(reloaded,12);assert.equal(reloaded.system.solCordon.visits[g.state.ship.id].tractorSuppressed,0);
 const fuel=g.state.ship.fuel;ok(g.travel('witness'));assert.ok(g.state.ship.fuel<fuel);assert.equal(g.state.custody,null);
 g.state.ship.fuel=g.state.ship.maxFuel;ok(g.travel('sol'));assert.equal(g.system.solCordon.visits[g.state.ship.id].counterUsed,false);assert.equal(g.system.solCordon.visits[g.state.ship.id].tractor,null);
});

test('fleeing beyond the actual source range releases a tow; destroying the captor removes its tractor',()=>{
 const g=ready();tick(g,15);const anchor=supercapitalTractorAnchor(findFactionSupercapital(g.system,'concord'));
 Object.assign(g.state.ship,{x:anchor.x+SOL_TRACTOR_RANGE+100,y:anchor.y,vx:0,vy:0});g.stepWorld(.1,[g]);assert.equal(g.custodyStatus(),null);assert.equal(g.state.custody,null);
 const second=ready();tick(second,8.2);findFactionSupercapital(second.system,'concord').hp=0;second.stepWorld(.1,[second]);assert.equal(second.custodyStatus(),null);
});

test('hull size, fitted drives, living working crew, shields, power and affiliation have explicit effects',()=>{
 const g=ready(),base=solCaptureProfile(g);g.state.upgrades.thrusters_2=1;g.state.upgrades.shield_2=1;g.state.ship.powerPriority='thrusters';g.state.crew=[{role:'engineer',health:100,status:'active'},{role:'navigator',health:100,status:'active'},{role:'engineer',health:0,status:'dead'},{role:'engineer',health:100,status:'reserve'}];
 g.state.rep.concord=40;g.state.alliance='concord';const upgraded=solCaptureProfile(g);assert.ok(upgraded.resistance>base.resistance);assert.ok(upgraded.lockSeconds>base.lockSeconds);assert.ok(upgraded.breakSeconds>base.breakSeconds);assert.ok(upgraded.inspectionSeconds<base.inspectionSeconds);assert.equal(upgraded.engineers,1);assert.equal(upgraded.navigators,1);
 g.state.ship.classId='capital';assert.equal(solCaptureProfile(g).eligible,false);g.state.ship.classId='sparrow';g.system.solCordon.visits[g.state.ship.id].aggressive=true;assert.equal(solCaptureProfile(g).eligible,false);
});

test('large and aggressive ships retain warned armed interception, and earned clearance avoids both',()=>{
 for(const kind of ['large','aggressive']){const g=ready();if(kind==='large'){g.state.ship.classId='capital';g._updateStats(true);}else g.system.solCordon.visits[g.state.ship.id].aggressive=true;tick(g,10);assert.equal(g.custodyStatus(),null);assert.ok(g.system.bullets.some(b=>b.solCordon)||g.state.ship.hull<g.state.ship.maxHull||g.state.ship.shield<g.state.ship.maxShield);}
 const g=ready();for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])g._flag(flag);tick(g,30);assert.equal(g.state.custody,null);assert.equal(g.custodyStatus(),null);assert.equal(g.state.ship.hull,g.state.ship.maxHull);
});

test('the brig is walkable, has local activities and no helm or exit that bypasses inspection',()=>{
 const g=capture(),surface=generateSurface(g.currentBody,g.state.seed);
 assert.equal(surface.hostVesselId,g.state.custody.captorId);assert.equal(surface.exit,null);assert.ok(isWalkable(surface,surface.spawn.x,surface.spawn.y));
 assert.deepEqual(surface.entities.filter(e=>e.data.custodyAction).map(e=>e.data.custodyAction),['petition','service','release']);
 assert.ok(surface.entities.every(e=>isWalkable(surface,e.x,e.y)));assert.equal(surface.entities.some(e=>['exit','station'].includes(e.type)),false);
 for(const name of ['travel','launch','leaveInterior','quickHelm','setHome','useWeapon','takePassengerTransit'])assert.equal(g.custodyAccess(name).ok,false,name);
 assert.equal(g.launch().ok,false);assert.equal(g.leaveInterior().ok,false);assert.equal(g.travel('witness').ok,false);assert.equal(g.custodyAction('service').ok,false);
});

test('local petition and service shorten one inspection without free money or lost possessions; release returns the same ship at Threshold',()=>{
 const g=capture(),shipId=g.state.ship.id,cargo=structuredClone(g.state.cargo),upgrades=structuredClone(g.state.upgrades),credits=g.state.credits;
 Object.assign(g.state.person,g.state.custody.brig.console);ok(g.custodyAction('petition'));assert.equal(g.state.credits,credits-40);assert.equal(g.state.custody.remainingSeconds,75);assert.equal(g.custodyAction('petition').ok,false);
 Object.assign(g.state.person,{x:252,y:348});ok(g.custodyAction('service'));assert.equal(g.state.custody.remainingSeconds,30);assert.equal(g.custodyAction('service').ok,false);assert.equal(g.custodyAction('release').ok,false);
 tick(g,30.1);assert.equal(g.state.custody,null);assert.equal(g.state.locationId,'threshold');assert.equal(g.state.interior,null);assert.equal(g.state.ship.id,shipId);assert.equal(g.state.ship.impoundedBy,undefined);assert.equal(g.state.ship.dockedAt,'threshold');assert.deepEqual(g.state.cargo,cargo);assert.deepEqual(g.state.upgrades,upgrades);assert.equal(g.state.credits,credits-40);
 assert.equal(g.canUseOwnShipHere(),true);assert.deepEqual(solClearance(g),{entry:false,landing:false});for(const flag of ['vault_recovered','homeward_signal','threshold_answered','landed_earth'])assert.equal(g.hasFlag(flag),false);
});

test('compliance shortens detention and a captain without money can finish the bounded inspection',()=>{
 const g=ready();g.state.credits=0;tick(g,8.2);ok(g.custodyAction('comply'));capture(g);assert.equal(g.state.custody.totalSeconds,90);
 Object.assign(g.state.person,g.state.custody.brig.console);assert.equal(g.custodyAction('petition').ok,false);tick(g,90.1);assert.equal(g.state.locationId,'threshold');assert.equal(g.state.custody,null);assert.equal(g.state.credits,0);
});

test('a destroyed flagship cannot leave a prisoner inside a nonexistent brig',()=>{
 const g=capture(),id=g.state.ship.id,hull=g.state.ship.hull;findFactionSupercapital(g.system,'concord').hp=0;g.step(.1,{});
 assert.equal(g.state.custody,null);assert.equal(g.state.interior,null);assert.equal(g.state.locationId,'threshold');assert.equal(g.state.ship.id,id);assert.equal(g.state.ship.hull,hull);assert.equal(g.hasFlag('landed_earth'),false);assert.ok(g.drainEvents().some(e=>e.type==='sol-custody-release'&&/evacuation/.test(e.text)));
});
