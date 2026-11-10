import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {STARTER_SHIP_IDS,getShipClass,enemyHullProfile} from '../dist/fleet.mjs';
import {cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const ok=result=>assert.equal(result.ok,true,result.reason);

test('starter cabins are genuinely small and keep only their physical one or two berths',()=>{
 const previousAreas={sparrow:30*44,kestrel:24*44,mule:32*46};
 for(const [id,berths] of [['sparrow',2],['kestrel',1],['mule',2]]){
  const hull=getShipClass(id),layout=cabinLayout(id);
  assert.equal(hull.berths,berths);assert.equal(layout.bunks.length,berths);
  assert.ok(layout.cols*layout.rows<=previousAreas[id]*.3,'Every starter deck has at least 70% less map footprint.');
  assert.ok(layout.crewSpawns.length>=10,'Legacy crew need standing space without inventing extra beds.');
  assert.equal(new Set(layout.crewSpawns.map(p=>`${p.x}:${p.y}`)).size,layout.crewSpawns.length);
  assert.ok(Object.values(layout.stations).every(p=>isCabinWalkable(layout,p.x,p.y)));
 }
 assert.ok(cabinLayout('tern').cols*cabinLayout('tern').rows>Math.max(...STARTER_SHIP_IDS.map(id=>{const l=cabinLayout(id);return l.cols*l.rows;})));
});

test('tiny starter craft keep personal cabins but cannot accept external boarding parties',()=>{
 for(const id of STARTER_SHIP_IDS){
  const game=new Game(`starter-boarding-${id}`,{starterShip:id});
  assert.equal(game.state.ship.classId,id);ok(game.enterCabin());
  assert.equal(game.currentBody.shipClass,id);assert.ok(isCabinWalkable(cabinLayout(id),game.state.person.x,game.state.person.y));
  ok(game.exitCabin());
  const enemy=placeRaider(game,{...enemyHullProfile(id),x:game.state.ship.x+90,y:game.state.ship.y,disabled:true});
  assert.equal(game.boardEnemy(enemy.id).code,'capacity');
  enemy.disabled=false;game.state.ship.shield=0;
  assert.equal(game.startBoarding(enemy.id).code,'capacity');assert.equal(game.state.boarding,null);
 }
});

test('shrinking an old starter migrates its captain and displays every surviving crew member and passenger',()=>{
 for(const id of STARTER_SHIP_IDS){
  const old=new Game(`legacy-small-${id}`,{starterShip:id});ok(old.enterCabin());
  const saved=old.save();saved.ship.berths=4;
  saved.person.x=24*24;saved.person.y=36*24;
  saved.crew=Array.from({length:9},(_,i)=>({id:`old-${i}`,name:`Watchmate ${i}`,role:'engineer',health:80,maxHealth:100,status:'injured'}));
  saved.crew.push({id:'lost',name:'Lost watchmate',role:'medic',health:0,maxHealth:100,status:'dead'});
  saved.ship.rescueGroups=[{id:'old-rescue',shipId:saved.ship.id,status:'aboard',pirates:false,members:[{id:'old-passenger',name:'Quiet traveler',shipId:saved.ship.id,status:'aboard',health:60,maxHealth:68,x:600,y:900}]}];
  const game=Game.fromSave(saved),layout=cabinLayout(id),surface=generateSurface(game.currentBody,game.state.seed);
  assert.equal(game.state.crew.length,10);assert.equal(game.livingCrew.length,9);assert.equal(game.state.crew.at(-1).health,0);
  assert.equal(game.state.ship.berths,getShipClass(id).berths);assert.equal(game.freeBerths,0);
  assert.ok(isCabinWalkable(layout,game.state.person.x,game.state.person.y));
  const visible=surface.entities.filter(e=>e.data?.crewId);assert.equal(visible.length,9);
  assert.deepEqual(visible.map(e=>e.data.crewId).sort(),game.livingCrew.map(c=>c.id).sort());
  assert.ok(visible.every(e=>isCabinWalkable(layout,e.x,e.y)));
  const passenger=surface.entities.find(e=>e.data?.guestId==='old-passenger');assert.ok(passenger);
  assert.ok(isCabinWalkable(layout,passenger.x,passenger.y));assert.equal(surface.bunks.length,getShipClass(id).berths);
 }
});
