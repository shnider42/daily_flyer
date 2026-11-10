import assert from 'node:assert/strict';
import {Game} from '../../dist/engine.mjs';
import {enemyHullProfile} from '../../dist/fleet.mjs';

let template;
/** Explicit persisted attackers for combat tests; a new core system is peaceful. */
export function placeRaider(game,overrides={}){
 if(!template){
  const frontier=new Game('controlled-combat-fixture');frontier.state.systemId='cinder';frontier._loadSystem('cinder');
  assert.ok(frontier.system.enemies.length,'The combat fixture is drawn from the hostile Cinder frontier.');
  template=structuredClone(frontier.system.enemies[0]);
 }
 const serial=game._record().spawned.filter(enemy=>enemy.testFixture).length;
 const enemy={...structuredClone(template),...enemyHullProfile('hauler'),id:`${game.state.systemId}:test-raider:${serial}`,name:'Controlled raider',testFixture:true,x:1900,y:1800,vx:0,vy:0,hp:46,maxHp:46,speed:90,damage:6,reward:47,cooldown:2,active:false,disabled:false,...overrides};
 game.system.enemies.push(enemy);game._record().spawned.push(structuredClone(enemy));return enemy;
}

/** Find actual generated remote wreckage without assuming a guaranteed core emergency. */
export function findDerelict(game){
 for(const system of game.galaxy.filter(system=>system.danger>=3)){
  game.state.systemId=system.id;game._loadSystem(system.id);
  const signal=game.system.signals.find(signal=>signal.kind==='derelict');
  if(signal)return signal;
 }
 assert.fail('The fixture galaxy contains no remote derelict.');
}
