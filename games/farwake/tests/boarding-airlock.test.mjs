import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {cabinLayout} from '../dist/fleet.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';

const ok=result=>assert.equal(result?.ok,true,result?.reason);
function fixture({cabin=true}={}) {
  const game=withHull(new Game('boarding-airlock'),'tern'),origin=game.state.ship;
  Object.assign(origin,{x:0,y:450,vx:0,vy:0,hull:71,shield:0});
  const enemy=placeRaider(game,{x:90,y:450,hp:14,maxHp:46,disabled:true,active:false});
  game.system.enemies=[enemy];
  if(cabin)ok(game.enterCabin());
  return {game,origin,enemy};
}

test('the actual entry airlock boards a disabled target without taking the helm or healing either hull',()=>{
  const {game,origin,enemy}=fixture(),before=structuredClone({state:game.state,enemy});
  assert.equal(game.state.mode,'person');
  assert.deepEqual(game.state.person.x,cabinLayout(origin.classId).spawn.x);
  ok(game.enemyBoardingAccess(enemy.id));
  assert.deepEqual({state:game.state,enemy},before,'Checking an airlock action does not change the voyage.');
  ok(game.boardEnemy(enemy.id));
  assert.equal(game.state.mode,'person');assert.equal(game.state.interior.kind,'enemy');
  assert.equal(game.state.interior.location.vesselId,enemy.id);
  assert.equal(game.state.boarding.originVesselId,origin.id);
  assert.equal(game.state.ship,origin);assert.equal(origin.hull,71);assert.equal(enemy.hp,14);
  assert.equal(game.state.person.weaponDrawn,true);
});

test('airlock boarding requires the real occupied cabin and leaves unavailable routes unchanged',()=>{
  const cases=[
    ['away from the airlock','distance',({game})=>Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.helm)],
    ['invalid airlock coordinates','distance',({game})=>{game.state.person.x=NaN;}],
    ['another hull’s interior','vessel',({game})=>{game.state.interior.location.vesselId='a-different-ship';}],
    ['ashore beside a parked personal ship','mode',({game})=>{game.state.interior=null;game.state.locationId='morrow';}],
    ['outside on EVA','mode',({game})=>{game.state.interior.kind='eva';}],
    ['inside another enemy','mode',({game})=>{game.state.interior.kind='enemy';}],
    ['docked source ship','docking',({origin})=>{origin.dockedAt='kettle';}],
  ];
  for(const [name,code,change]of cases){
    const f=fixture();change(f);const before=structuredClone({state:f.game.state,enemy:f.enemy});
    assert.equal(f.game.boardEnemy(f.enemy.id).code,code,name);
    assert.deepEqual({state:f.game.state,enemy:f.enemy},before,name+' cannot transfer or repair a vessel');
  }
});

test('incapacitation, active duty and fighting on the source deck do not become boarding shortcuts',()=>{
  const cases=[
    ['down','incapacitated',({game})=>{game.state.person.down=true;}],
    ['dead','incapacitated',({game})=>{game.state.person.health=0;}],
    ['destroyed origin','destroyed',({origin})=>{origin.hull=0;}],
    ['active duty','contract',({game})=>{game.state.npcContract={active:true};}],
    ['source deck still contested','boarding',({game})=>{game.state.boarding={kind:'defense',phase:'active'};}],
    ['unresolved encounter','encounter',({game})=>{game.state.pendingEncounter={id:'open-transmission'};}],
  ];
  for(const [name,code,change]of cases){
    const f=fixture();change(f);const before=structuredClone({state:f.game.state,enemy:f.enemy});
    assert.equal(f.game.boardEnemy(f.enemy.id).code,code,name);
    assert.deepEqual({state:f.game.state,enemy:f.enemy},before,name+' cannot bypass existing state');
  }
});

test('airlock and helm boarding keep physical range and disabled target rules',()=>{
  for(const cabin of [false,true]){
    const good=fixture({cabin});ok(good.game.boardEnemy(good.enemy.id));
    const cases=[
      ['distant target','distance',({enemy})=>{enemy.x=5000;}],
      ['fast target','speed',({enemy})=>{enemy.vx=100;}],
      ['powered target','disabled',({enemy})=>{enemy.disabled=false;}],
      ['destroyed target','disabled',({enemy})=>{enemy.hp=0;}],
      ['occupied tether','occupied',({enemy})=>{enemy.boardingTargetId='another-captain';}],
      ['training drone','training-target',({enemy})=>{enemy.trainingTarget=true;}],
      ['single-seat target','capacity',({enemy})=>{enemy.classId='sparrow';}],
    ];
    for(const [name,code,change]of cases){
      const f=fixture({cabin});change(f);
      assert.equal(f.game.boardEnemy(f.enemy.id).code,code,`${cabin?'airlock':'helm'}: ${name}`);
      assert.equal(f.game.state.interior?.kind,cabin?'ship':undefined);
      assert.equal(f.game.state.boarding,null);
    }
  }
});
