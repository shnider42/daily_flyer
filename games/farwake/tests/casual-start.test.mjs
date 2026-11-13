import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,buildGalaxy,distance} from '../dist/engine.mjs';
import {STARTER_SHIP_IDS} from '../dist/fleet.mjs';
import {CASUAL_START_UPGRADES,normalizeStartMode,publicStartingPort} from '../dist/livelihoods.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const casual=(seed='casual-start',options={})=>new Game(seed,{startMode:'casual',...options});

test('Casual equips every starter for an immediate first fold without completing the story',()=>{
 assert.ok(Object.isFrozen(CASUAL_START_UPGRADES));
 for(const starterShip of STARTER_SHIP_IDS){
  const game=casual(`casual-${starterShip}`,{starterShip});
  assert.equal(game.state.startMode,'casual');assert.equal(game.state.mode,'ship');assert.equal(game.ownsShip,true);
  assert.equal(game.state.ship.classId,starterShip);assert.equal(game.state.systemId,'hearth');assert.equal(game.state.lastBodyId,'kettle');
  assert.deepEqual(game.state.upgrades,CASUAL_START_UPGRADES);assert.notEqual(game.state.upgrades,CASUAL_START_UPGRADES);
  assert.equal(game.state.ship.warpRange,5);assert.equal(game.hasHyperdrive,true);assert.equal(game.state.credits,180);
  assert.deepEqual(game.state.cargo,{ore:0,crystal:0});assert.deepEqual(game.state.completedChapters,[]);
  assert.equal(game.hasFlag('belt_signal_found'),false);assert.equal(game.hasFlag('first_jump'),false);
  assert.equal(game.state.journal[0].text.includes('Fold Drive I'),true);
  const before=game.state.ship.fuel,quote=ok(game.travelInfo('vesper'));
  ok(game.travel('vesper'));assert.equal(game.state.systemId,'vesper');assert.equal(game.state.ship.fuel,before-quote.fuelCost);
 }
 const first=casual('casual-isolated'),second=casual('casual-isolated');
 delete first.state.upgrades.fold_1;assert.equal(second.state.upgrades.fold_1,1);assert.equal(CASUAL_START_UPGRADES.fold_1,1);
});

test('Casual validates named and procedural origins against the actual seeded galaxy and discovers nearby stars',()=>{
 for(const seed of ['casual-chart-a','casual-chart-b']){
  const galaxy=buildGalaxy(seed),frontier=galaxy.find(system=>!system.authored&&system.frontier);
  for(const startSystemId of ['brindle','sol','lacuna','sector-0',frontier.id]){
   const game=casual(seed,{startSystemId}),source=galaxy.find(system=>system.id===startSystemId),port=publicStartingPort(game.system);
   assert.equal(game.state.systemId,startSystemId);assert.equal(game.currentSystem.name,source.name);
   assert.equal(game.currentSystem.faction,source.faction);assert.equal(game.currentSystem.danger,source.danger);
   assert.ok(port);assert.equal(port.id,publicStartingPort(source).id);assert.notEqual(port.portType,'military');
   assert.equal(game.state.lastBodyId,port.id);assert.equal(game.state.locationId,null);assert.equal(game.state.mode,'ship');
   assert.equal(game.state.ship.x,port.x);assert.equal(game.state.ship.y,port.y+port.radius+95);
   assert.equal(game.state.ship.vx,0);assert.equal(game.state.ship.vy,0);assert.ok(distance(game.state.ship,port)>port.radius);
   assert.deepEqual(game.state.visited,[startSystemId]);assert.equal(game.state.discovered[0],startSystemId);
   for(const nearby of galaxy.filter(system=>Math.hypot(system.gx-source.gx,system.gy-source.gy)<7.5))assert.ok(game.state.discovered.includes(nearby.id));
   if(startSystemId==='lacuna')assert.equal(game.state.discovered.includes('hearth'),false);
   const journal=game.state.journal.find(entry=>entry.title==='A ship of your own');
   assert.equal(journal.systemId,startSystemId);assert.ok(journal.text.includes(port.name));assert.ok(journal.text.includes(source.name));
   ok(game.dock(port.id));assert.equal(game.state.locationId,port.id);
  }
 }
});

test('origin fallback is Hearth and origin inputs do not change Regular or Hardcore',()=>{
 for(const startSystemId of [undefined,null,'missing-system',42,{},['sol']]){
  const game=casual('invalid-origin',{startSystemId});
  assert.equal(game.state.systemId,'hearth');assert.equal(game.state.lastBodyId,'kettle');assert.deepEqual(game.state.visited,['hearth']);
 }
 for(const startMode of ['regular','hardcore']){
  const normal=new Game('unchanged-origin',{startMode}),requested=new Game('unchanged-origin',{startMode,startSystemId:'sol'});
  assert.deepEqual(requested.state,normal.state);
  assert.equal(requested.state.systemId,'hearth');assert.deepEqual(requested.state.upgrades,{});assert.equal(requested.hasHyperdrive,false);
  assert.equal(requested.state.mode,startMode==='hardcore'?'person':'ship');assert.equal(requested.ownsShip,startMode!=='hardcore');
 }
 assert.equal(normalizeStartMode('casual'),'casual');assert.equal(normalizeStartMode('hardcore'),'hardcore');assert.equal(normalizeStartMode('unknown'),'regular');
});

test('remote Casual starts skip the Hearth opening while a Hearth Casual captain can play it',()=>{
 for(const startSystemId of ['vesper','sol','sector-12']){
  const game=casual('remote-opening',{startSystemId,openingMission:true});
  assert.equal(game.state.systemId,startSystemId);assert.equal(game.state.mode,'ship');assert.equal(game.state.openingMission,null);
  assert.equal(game.state.lastBodyId,publicStartingPort(game.system).id);assert.deepEqual(game.state.upgrades,CASUAL_START_UPGRADES);
 }
 const hearth=casual('hearth-opening',{openingMission:true});
 assert.equal(hearth.state.systemId,'hearth');assert.equal(hearth.state.locationId,'kettle');assert.equal(hearth.state.mode,'person');
 assert.equal(hearth.state.openingMission.status,'active');assert.equal(hearth.state.openingMission.branch,'regular');
 assert.equal(hearth.ownsShip,true);assert.deepEqual(hearth.state.upgrades,CASUAL_START_UPGRADES);ok(hearth.quickLaunch());
 assert.equal(hearth.state.mode,'ship');ok(hearth.travelInfo('vesper'));
});

test('Casual origin grants neither military docking clearance nor Earth quarantine access',()=>{
 const game=casual('casual-clearance',{startSystemId:'vesper'}),military=game.system.bodies.find(body=>body.portType==='military');
 assert.ok(military);assert.notEqual(game.state.lastBodyId,military.id);
 Object.assign(game.state.ship,{x:military.x,y:military.y+military.radius+80});
 assert.equal(game.dock(military.id).ok,false);assert.equal(game.state.mode,'ship');
 const sol=casual('casual-quarantine',{startSystemId:'sol'}),earth=sol.system.bodies.find(body=>body.id==='earth');
 Object.assign(sol.state.ship,{x:earth.x,y:earth.y+earth.radius+80});
 assert.equal(sol.dock('earth').code,'quarantine');assert.equal(sol.hasFlag('vault_recovered'),false);
});

test('loading a Casual voyage preserves its destination and depleted equipment despite new start options',()=>{
 const game=casual('casual-persist',{startSystemId:'brindle',starterShip:'kestrel'});
 ok(game.travel('hearth'));delete game.state.upgrades.fold_1;game._updateStats(false);
 Object.assign(game.state.ship,{x:812,y:-611,vx:3,vy:-4,fuel:7});game.state.stats.time=42;game.state.credits=81;
 const saved=game.save(),restored=new Game(saved,{startMode:'casual',startSystemId:'sol',starterShip:'mule',openingMission:true});
 assert.equal(restored.state.startMode,'casual');assert.equal(restored.state.systemId,'hearth');assert.equal(restored.state.ship.classId,'kestrel');
 for(const field of ['x','y','vx','vy','fuel'])assert.equal(restored.state.ship[field],saved.ship[field]);
 for(const field of ['upgrades','visited','discovered','flags','journal','completedChapters'])assert.deepEqual(restored.state[field],saved[field]);
 assert.equal(restored.state.credits,81);assert.equal(restored.state.stats.time,42);assert.equal(restored.hasHyperdrive,false);
 assert.equal(restored.state.openingMission,null);
});

test('Casual ship destruction and reload leave the captain shipless with no replacement fold drive',()=>{
 const game=casual('casual-loss',{startSystemId:'brindle'}),station=publicStartingPort(game.system);
 game.state.ship.hull=0;game.state.ship.destroyed=true;ok(game._rescue('The Casual starter was destroyed.'));
 assert.equal(game.ownsShip,false);assert.equal(game.state.mode,'person');assert.equal(game.state.locationId,station.id);
 const saved=game.save(),restored=new Game(saved,{startMode:'casual',startSystemId:'sol'});
 assert.equal(restored.state.startMode,'casual');assert.equal(restored.state.systemId,'brindle');assert.equal(restored.state.locationId,station.id);
 assert.equal(restored.ownsShip,false);assert.equal(restored.hasActiveVessel,false);assert.equal(restored.hasHyperdrive,false);
 assert.deepEqual(restored.state.upgrades,{});assert.deepEqual(restored.state.fleet.owned,[]);
 assert.deepEqual(restored.state.fleet.history,saved.fleet.history);assert.equal(restored.state.ship.id,saved.ship.id);
});

test('legacy saves and Hardcore saves cannot opt into a new origin or Casual equipment on restore',()=>{
 const legacy=new Game('legacy-origin').save();delete legacy.startMode;
 const loaded=new Game(legacy,{startMode:'casual',startSystemId:'sol'});
 assert.equal(loaded.state.startMode,'regular');assert.equal(loaded.state.systemId,'hearth');assert.deepEqual(loaded.state.upgrades,{});
 assert.equal(loaded.state.ship.x,legacy.ship.x);assert.equal(loaded.state.ship.y,legacy.ship.y);
 const shipless=new Game('hardcore-origin',{startMode:'hardcore'}).save(),restored=new Game(shipless,{startMode:'casual',startSystemId:'vesper'});
 assert.equal(restored.state.startMode,'hardcore');assert.equal(restored.state.locationId,'morrow');assert.equal(restored.ownsShip,false);
 assert.equal(restored.hasHyperdrive,false);assert.deepEqual(restored.state.upgrades,{});
});
