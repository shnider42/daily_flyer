import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {startSystemChoices,casualStartingDrive} from '../dist/start-options.mjs';
import {GALAXY_EPOCH,NEW_GALAXY_REQUIRED} from '../dist/galaxy-epoch.mjs';

const ready=()=>{const game=new Game('cordon',{startMode:'casual'});game.state.upgrades.fold_3=1;game._updateStats();game.state.systemId='witness';game._loadSystem('witness');game.state.pendingEncounter=null;game.state.ship.fuel=game.state.ship.maxFuel;return game;};
test('Sol rejects an unearned jump without fuel, movement or story mutation',()=>{
  const game=ready(),before=structuredClone({fuel:game.state.ship.fuel,systemId:game.state.systemId,flags:game.state.flags,visited:game.state.visited});
  assert.equal(game.travelInfo('sol').code,'quarantine');assert.equal(game.travel('sol').code,'quarantine');
  assert.deepEqual({fuel:game.state.ship.fuel,systemId:game.state.systemId,flags:game.state.flags,visited:game.state.visited},before);
  game._flag('vault_recovered');assert.equal(game.travel('sol').code,'quarantine');
  game._flag('homeward_signal');assert.equal(game.travel('sol').ok,true);
  assert.equal(game.hasFlag('threshold_answered'),false,'The arrival answer must be earned inside Sol, not required to reach it.');
  game.state.pendingEncounter=null;const earth=game.system.bodies.find(body=>body.id==='earth');Object.assign(game.state.ship,{x:earth.x,y:earth.y+earth.radius+40});
  assert.equal(game.dock('earth').code,'permission');assert.equal(game.state.mode,'ship');
  game.state.pendingEncounter=null;game._flag('threshold_answered');assert.equal(game.dock('earth').ok,true);
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
