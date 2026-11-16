import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {advanceShip,cabinLayout} from '../dist/fleet.mjs';
import {powerProfile,routeShipPower} from '../dist/ship-power.mjs';
import {getGunneryBattery} from '../dist/gunnery-batteries.mjs';

test('power routing uses installed systems and a fixed budget, with safe defaults for old saves',()=>{
 const game=new Game('power'),ship=game.state.ship;
 const base=powerProfile(ship);assert.equal(base.mode,'balanced');assert.equal(base.thrust,1);assert.equal(base.gunRate,1);assert.equal(base.shieldRate,1);
 for(const mode of base.systems){
  const p=powerProfile({...ship,powerPriority:mode});assert.ok(Math.abs(Object.values(p.shares).reduce((a,b)=>a+b,0)-1)<1e-8);
  assert.ok(p[mode==='thrusters'?'thrust':mode==='guns'?'gunRate':'shieldRate']>1);
 }
 const noShield={...ship,maxShield:0};assert.equal(routeShipPower(noShield,'shields').code,'power-systems');
 assert.ok(!powerProfile(noShield).systems.includes('shields'));
 assert.equal(routeShipPower({...ship,damage:0},'guns').code,'power-systems');
 assert.equal(routeShipPower({...ship,maxShield:0,damage:0},'thrusters').code,'power-systems');
 assert.equal(routeShipPower(ship,'invented').code,'power-mode');
 const save=game.save();save.ship.powerPriority='invented';save.ship.powerRerouteRemaining=1e12;
 const restored=Game.fromSave(save);assert.equal(restored.state.ship.powerPriority,'balanced');assert.equal(restored.state.ship.powerRerouteRemaining,2);
});
test('priorities affect real physics, gun cycles and shield recovery without refilling resources',()=>{
 const game=new Game('power-physics'),ship=game.state.ship;ship.energy=80;ship.shield=5;
 const before=structuredClone(ship),normal=advanceShip(ship,.1,{thrust:1,strafe:.4});
 assert.equal(game.setShipPower('thrusters').ok,true);
 assert.equal(ship.energy,80);assert.equal(ship.shield,5);
 assert.ok(Math.hypot(...['vx','vy'].map(k=>advanceShip(ship,.1,{thrust:1,strafe:.4})[k]))>Math.hypot(normal.vx,normal.vy));
 assert.ok(getGunneryBattery(ship).cooldown>getGunneryBattery(before).cooldown);
 assert.equal(game.setShipPower('guns').code,'cooldown');
 ship.powerRerouteRemaining=0;assert.equal(game.setShipPower('guns').ok,true);
 assert.equal(game.fireWeapons().ok,true);const cycling=game._shotTimer;
 assert.ok(cycling<getGunneryBattery(before).cooldown);
 ship.powerRerouteRemaining=0;assert.equal(game.setShipPower('shields').ok,true);assert.equal(game._shotTimer,cycling,'switching never clears a fired gun cooldown');
 const shield=ship.shield;game._hitTimer=0;game.stepPilot(.1,{});assert.ok(ship.shield-shield>.4);
 const paused=ship.shield;game._hitTimer=2;game.stepPilot(.1,{});assert.equal(ship.shield,paused,'shield delay still applies under shield priority');
 assert.equal(Game.fromSave(game.save()).state.ship.powerPriority,'shields');
});
test('solo routing requires the actual helm or engineering console and a conscious captain',()=>{
 const game=new Game('power-access');assert.equal(game.enterCabin().ok,true);
 Object.assign(game.state.person,{x:0,y:0});assert.equal(game.setShipPower('guns').code,'station');
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).stations.engineering);assert.equal(game.setShipPower('guns').ok,true);
 game.state.person.down=true;assert.equal(game.setShipPower('balanced').code,'incapacitated');
});
