import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {cabinLayout} from '../dist/fleet.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
const pose=ship=>Object.fromEntries(['id','x','y','vx','vy','angle','angularVelocity','hull','shield','fuel'].map(key=>[key,ship[key]]));
function cabin(){const game=new Game('perspective-cabin');Object.assign(game.state.ship,{x:500,y:-600,vx:37,vy:-22,angle:1.23,angularVelocity:.4});ok(game.enterCabin());return game;}
function port(){const game=new Game('perspective-port'),body=game.system.bodies.find(value=>value.id==='morrow');Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60});ok(game.dock(body.id));Object.assign(game.state.person,{x:2000,y:1600,facing:'left'});return{game,body};}
function captured(){
 const game=new Game('perspective-captured'),origin=game.state.ship;Object.assign(origin,{x:0,y:500});
 const enemy=placeRaider(game,{x:90,y:500,hp:14,maxHp:46,disabled:true,active:false});ok(game.boardEnemy(enemy.id));
 for(const guard of game.state.boarding.enemies)guard.health=0;game._finishBoarding('won');
 Object.assign(game.state.person,cabinLayout(enemy.classId).spawn);return{game,origin,enemy};
}

test('quick helm changes perspective on the same live hull without moving or repairing it',()=>{
 const game=cabin(),ship=game.state.ship,before=pose(ship),credits=game.state.credits;
 // A captain must be able to reach the helm when a real outside threat arrives.
 placeRaider(game,{x:ship.x+200,y:ship.y,active:true});
 ok(game.quickHelm());assert.equal(game.state.mode,'ship');assert.equal(game.state.interior,null);
 assert.equal(game.state.ship,ship);assert.deepEqual(pose(ship),before);assert.equal(game.state.credits,credits);
 assert.equal(game.state.person.x,cabinLayout(ship.classId).stations.helm.x);assert.equal(game.state.person.y,cabinLayout(ship.classId).stations.helm.y);
 assert.equal(game.quickHelm().ok,false,'A double tap cannot perform a second transition.');
});

test('quick helm cannot escape an active boarding or act from a site, wrong hull, or incapacitated captain',()=>{
 const mutations=[
  ['boarding',g=>{g.state.boarding={phase:'active',kind:'defense'};}],
  ['incapacitated',g=>{g.state.person.health=0;}],
  ['incapacitated',g=>{g.state.person.down=true;}],
  ['encounter',g=>{g.state.pendingEncounter={id:'lifeboat'};}],
  ['destroyed',g=>{g.state.ship.hull=0;}],
  ['vessel',g=>{g.state.interior.location.vesselId='someone-else';}],
  ['mode',g=>{g.state.interior.kind='site';g.state.exploration={key:'site'};}]
 ];
 for(const[code,mutate]of mutations){const game=cabin();mutate(game);const person=structuredClone(game.state.person),ship=pose(game.state.ship);assert.equal(game.quickHelm().code,code);assert.deepEqual(game.state.person,person);assert.deepEqual(pose(game.state.ship),ship);assert.equal(game.state.mode,'person');}
});

test('a secured captured helm uses the target hull even after the origin was destroyed',()=>{
 const{game,origin,enemy}=captured();origin.hull=0;origin.destroyed=true;const x=enemy.x,y=enemy.y,damage=enemy.hp/enemy.maxHp;
 ok(game.quickHelm());assert.equal(game.state.mode,'ship');assert.equal(game.state.ship.id,enemy.id);assert.equal(game.state.ship.x,x);assert.equal(game.state.ship.y,y);
 assert.ok(Math.abs(game.state.ship.hull/game.state.ship.maxHull-damage)<1e-10);assert.equal(game.state.returnVesselId,null);
});

test('a rejected captured transfer restores the captain’s exact pose and keeps both hulls',()=>{
 const{game,origin,enemy}=captured();game.state.cargo.ore=999;const person=structuredClone(game.state.person),before=pose(origin),target={x:enemy.x,y:enemy.y,hp:enemy.hp};
 assert.equal(game.quickHelm().code,'capacity');assert.deepEqual(game.state.person,person);assert.equal(game.state.mode,'person');assert.equal(game.state.ship,origin);assert.deepEqual(pose(origin),before);assert.deepEqual({x:enemy.x,y:enemy.y,hp:enemy.hp},target);
});

test('quick launch returns to the locally parked ship from the outdoor landing and uses normal departure rules',()=>{
 const{game,body}=port(),ship=game.state.ship,normal=Game.fromSave(game.save()),hull=ship.hull,credits=game.state.credits;ok(normal.launch());
 ok(game.quickLaunch());assert.equal(game.state.ship,ship);assert.equal(game.state.mode,'ship');assert.deepEqual(pose(ship),pose(normal.state.ship));
 assert.equal(ship.x,body.x);assert.equal(ship.hull,hull);assert.equal(game.state.credits,credits);assert.equal(game.quickLaunch().ok,false);
});

test('quick launch cannot retrieve a distant hull or bypass site, combat, conversation, or vitality gates',()=>{
 const mutations=[
  ['location',g=>{g.state.interior={kind:'site',location:{id:'cave'}};g.state.exploration={key:'cave'};}],
  ['location',g=>{g.state.interior={kind:'ship',location:{id:'own-ship'}};}],
  ['location',g=>{g.state.ship.x+=2000;}],
  ['incapacitated',g=>{g.state.person.down=true;}],
  ['encounter',g=>{g.state.pendingEncounter={id:'union_strike'};}],
  ['destroyed',g=>{g.state.ship.destroyed=true;}],
  ['combat',g=>{g.state.boarding={phase:'active',kind:'defense'};}],
  ['combat',g=>{g._hitTimer=2;}],
  ['combat',g=>{placeRaider(g,{x:g.state.ship.x+100,y:g.state.ship.y,active:true});}]
 ];
 for(const[code,mutate]of mutations){const{game}=port();mutate(game);const person=structuredClone(game.state.person),ship=pose(game.state.ship);assert.equal(game.quickLaunch().code,code);assert.deepEqual(game.state.person,person);assert.deepEqual(pose(game.state.ship),ship);assert.equal(game.state.mode,'person');}
});
