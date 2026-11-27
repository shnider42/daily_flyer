import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {startSystemChoices,casualStartingDrive} from '../dist/start-options.mjs';
import {GALAXY_EPOCH,NEW_GALAXY_REQUIRED} from '../dist/galaxy-epoch.mjs';
import {solClearance} from '../dist/sol-access.mjs';
import {solCordonStatus,solCordonRetreat,captureSolCordon} from '../dist/sol-cordon.mjs';

const ready=()=>{const game=new Game('cordon',{startMode:'casual'});game.state.upgrades.fold_3=1;game._updateStats();game.state.systemId='witness';game._loadSystem('witness');game.state.pendingEncounter=null;game.state.ship.fuel=game.state.ship.maxFuel;return game;};
const advance=(game,seconds,input={})=>{for(let time=0;time<seconds-.001;time+=.1)game.step(.1,input);};

test('an early Sol jump succeeds at ordinary fuel cost, warns clearly, and grants no expedition evidence',()=>{
  const game=ready(),fuel=game.state.ship.fuel,info=game.travelInfo('sol');
  assert.equal(info.ok,true);assert.equal(info.quarantine,true);assert.match(info.warning,/interceptors|batteries/);
  assert.equal(game.travel('sol').ok,true);assert.equal(game.state.systemId,'sol');assert.equal(game.state.ship.fuel,fuel-info.fuelCost);
  assert.deepEqual({x:game.state.ship.x,y:game.state.ship.y},game.system.solCordon.arrival);
  assert.deepEqual(solClearance(game),{entry:false,landing:false});
  for(const flag of ['vault_recovered','homeward_signal','threshold_answered','earth_reached','landed_earth'])assert.equal(game.hasFlag(flag),false,flag);
  assert.equal(game.availableEncounters().some(encounter=>encounter.id==='earth_arrival'),false);
  assert.equal(solCordonRetreat(game,'witness'),true);assert.equal(solCordonRetreat(game,'hearth'),false);
  assert.ok(game.state.journal.some(row=>row.title==='Earth from the quarantine line'));
});

test('risk metadata never overrides genuine drive, range, or fuel failures',()=>{
  const game=ready(),cost=game.travelInfo('sol').fuelCost;
  game.state.ship.fuel=cost-1;assert.equal(game.travelInfo('sol').ok,false);assert.equal(game.travel('sol').code,'fuel');assert.equal(game.state.systemId,'witness');
  game.state.ship.fuel=30;game.state.ship.warpRange=.1;assert.equal(game.travelInfo('sol').ok,false);assert.equal(game.travel('sol').code,'range');
});

test('earned route and arrival answer still permit the ordinary protected landing',()=>{
  const game=ready();game._flag('vault_recovered');game._flag('homeward_signal');assert.equal(game.travel('sol').ok,true);
  assert.equal(game.hasFlag('threshold_answered'),false,'The arrival answer must be earned inside Sol, not required to reach it.');
  game.state.pendingEncounter=null;const earth=game.system.bodies.find(body=>body.id==='earth');Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+40});
  assert.equal(game.dock('earth').code,'permission');assert.equal(game.state.pendingEncounter.id,'earth_arrival');assert.equal(game.state.mode,'ship');
  game.state.pendingEncounter=null;game._flag('threshold_answered');assert.equal(game.dock('earth').ok,true);
});

test('an early ship has time to withdraw, while armed resistance ends in real ship loss and screened recovery',()=>{
  const retreat=ready();retreat.travel('sol');const fuel=retreat.state.ship.fuel;
  advance(retreat,7.5);assert.equal(retreat.state.ship.hull,retreat.state.ship.maxHull);assert.equal(retreat.state.ship.shield,retreat.state.ship.maxShield);
  assert.equal(retreat.travel('witness').ok,true);assert.ok(retreat.state.ship.fuel<fuel);assert.equal(retreat.state.stats.rescues,0);
  const linger=ready();linger.travel('sol');linger.system.solCordon.visits[linger.state.ship.id].aggressive=true;const originalId=linger.state.ship.id;advance(linger,13);
  assert.equal(linger.ownsShip,false);assert.ok(linger.state.fleet.history.some(row=>row.type==='loss'&&row.vesselId===originalId));
  assert.equal(linger.state.shipRecovery.destination.bodyId,'threshold');assert.equal(linger.state.mode,'person');
  assert.equal(linger.hasFlag('landed_earth'),false);assert.deepEqual(solClearance(linger),{entry:false,landing:false});
  assert.equal(linger.portAccess(linger.system.bodies.find(body=>body.id==='threshold')).ok,true);
});

test('flying outward during the challenge reaches a real safe perimeter',()=>{
  const game=ready();game.travel('sol');advance(game,10,{thrust:1});
  assert.equal(game.ownsShip,true);assert.equal(game.state.stats.rescues,0);assert.equal(solCordonStatus(game).phase,'outside');
  assert.equal(game.state.ship.hull,game.state.ship.maxHull);
});

test('attempting Earth is a live interception with no surface transition or story reward',()=>{
  const game=ready();game.travel('sol');const earth=game.system.bodies.find(body=>body.id==='earth');
  Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+90});
  const before=game.state.stats.dockings,result=game.dock('earth');
  assert.equal(result.ok,true);assert.equal(result.approach,true);assert.equal(game.state.mode,'ship');assert.equal(game.state.locationId,null);
  assert.equal(game.state.stats.dockings,before);assert.equal(game.hasFlag('landed_earth'),false);
  advance(game,3.5);assert.equal(game.custodyStatus()?.phase,'locking');assert.equal(game.state.stats.rescues,0);
  assert.equal(game.hasFlag('threshold_answered'),false);
});

test('saving, loading and revisiting preserve challenge time, damage and defense identities',()=>{
  const game=ready();game.travel('sol');advance(game,8.5);
  const guard=game.system.enemies.find(enemy=>enemy.solCordon);guard.hp-=17;
  const before=captureSolCordon(game.system),restored=Game.fromSave(game.save());
  assert.deepEqual(captureSolCordon(restored.system),before);
  assert.equal(restored.system.enemies.filter(enemy=>enemy.solCordon).length,8);
  restored.state.ship.fuel=30;assert.equal(restored.travel('witness').ok,true);restored.state.ship.fuel=30;
  assert.equal(restored.travel('sol').ok,true);assert.equal(solCordonStatus(restored).seconds,0);
  assert.equal(restored.system.enemies.find(enemy=>enemy.id===guard.id).hp,guard.hp);
});

test('cordon volleys target only the intruding physical hull and cannot hit a cleared neighbor',()=>{
  const intruder=ready();intruder.travel('sol');intruder.state.ship.hull=10000;intruder.system.solCordon.visits[intruder.state.ship.id].aggressive=true;
  const friend=new Game('cleared-neighbor',{startMode:'casual'});friend.state.systemId='sol';friend._runtime=intruder.system;
  for(const flag of ['vault_recovered','homeward_signal','threshold_answered'])friend._flag(flag);
  Object.assign(friend.state.ship,{x:intruder.state.ship.x+5,y:intruder.state.ship.y,shield:friend.state.ship.maxShield});
  for(let i=0;i<110;i++)intruder.stepWorld(.1,[intruder,friend]);
  assert.equal(friend.state.ship.hull,friend.state.ship.maxHull);assert.equal(friend.state.ship.shield,friend.state.ship.maxShield);
  assert.ok(intruder.system.bullets.filter(bullet=>bullet.solCordon).every(bullet=>bullet.targetVesselId===intruder.state.ship.id));
  assert.ok(intruder.state.ship.hull<10000);
});

test('physical defeat of the inner screen can permit a breach without inventing legal clearance',()=>{
  const game=ready();game.travel('sol');const earth=game.system.bodies.find(body=>body.id==='earth');
  for(const enemy of game.system.enemies.filter(enemy=>enemy.solCordon&&enemy.cordonRole==='battery')){enemy.hp=0;game._defeat(enemy);}
  Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+80});
  assert.equal(game.dock('earth').ok,true);assert.equal(game.state.locationId,'earth');
  assert.deepEqual(solClearance(game),{entry:false,landing:false});assert.equal(game.hasFlag('threshold_answered'),false);
  assert.equal(game.state.stats.kills,0);assert.equal(game.system.pickups.length,0);
});

test('assisted aim never redirects fire into neutral cordon ships, while deliberate fire remains physical',()=>{
  const game=ready();game.travel('sol');const sh=game.state.ship,guard=game.system.enemies.find(enemy=>enemy.solCordon);
  Object.assign(guard,{x:sh.x+300,y:sh.y+40,active:false,targetVesselId:null});game.system.enemies=[guard];sh.angle=0;
  game._fire();assert.equal(Math.atan2(game.system.bullets.at(-1).vy,game.system.bullets.at(-1).vx),0);
  guard.active=true;guard.targetVesselId='another-hull';game._fire();assert.equal(Math.atan2(game.system.bullets.at(-1).vy,game.system.bullets.at(-1).vx),0);
  guard.active=false;guard.targetVesselId=null;game.system.bullets=[];sh.angle=Math.atan2(40,300);game._fire();
  for(let i=0;i<6;i++)game._updateBullets(.1,[game]);
  assert.ok(guard.hp<guard.maxHp);assert.equal(game.system.solCordon.visits[sh.id].aggressive,true);
});

test('a captain can depart Sol without evidence and supported voyages restore their clearance',()=>{
  const game=ready();game.state.systemId='sol';game._loadSystem('sol');game.state.pendingEncounter=null;
  assert.equal(game.travelInfo('witness').ok,true);
  game._flag('vault_recovered');game._flag('homeward_signal');game._flag('threshold_answered');
  const restored=Game.fromSave(game.save());assert.equal(restored.portAccess({id:'earth'}).ok,true);assert.equal(restored.state.galaxyEpoch,GALAXY_EPOCH);
  assert.throws(()=>Game.fromSave({...game.save(),galaxyEpoch:'compact-v1'}),error=>error.code===NEW_GALAXY_REQUIRED);
});

test('every public origin has a route home that does not pass through the cordon',()=>{
  const galaxy=buildGalaxy('public-origins'),choices=startSystemChoices(galaxy);
  assert.equal(choices.length,25);assert.ok(!choices.some(system=>system.id==='sol'));assert.equal(casualStartingDrive(galaxy,'sol'),null);
  assert.throws(()=>new Game('forged-origin',{startMode:'casual',startSystemId:'sol'}),/quarantine/);
  for(const origin of choices){
    const drive=casualStartingDrive(galaxy,origin.id),seen=new Set([origin.id]),pending=[galaxy.find(system=>system.id===origin.id)];assert.ok(drive);
    for(const from of pending)for(const to of galaxy){if(to.id==='sol'||seen.has(to.id)||Math.hypot(from.gx-to.gx,from.gy-to.gy)>drive.range)continue;seen.add(to.id);pending.push(to);}
    assert.ok(seen.has('hearth'),`${origin.id} has a public route home`);
  }
});
