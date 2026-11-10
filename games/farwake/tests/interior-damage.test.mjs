import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {cabinLayout,isCabinWalkable,enemyShipState} from '../dist/fleet.mjs';
import {ensureDamageControl,registerShipImpact,impactSection,stepShipDamage,interiorExposure,interiorDamageSummary,DAMAGE_CONTROL_ACTIONS} from '../dist/interior-damage.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const ok=result=>assert.equal(result?.ok,true,result?.reason);
function cabin(seed='damage-cabin'){const game=new Game(seed);Object.assign(game.state.ship,{x:500,y:600,shield:0,vx:0,vy:0});ok(game.enterCabin());return game;}
const source=ship=>({sourceX:ship.x+500,sourceY:ship.y});
function hit(game,amount=22){const ship=game.state.ship,{point}=impactSection(ship,source(ship));Object.assign(game.state.person,point);game._damageShip(amount,source(ship));return{ship,point,section:ship.damageControl.sections.find(section=>section.damage>0)};}

test('world hit mapping rotates with the real hull and distinguishes different sides',()=>{
 const game=cabin(),ship=game.state.ship;ship.angle=0;
 const a=impactSection(ship,{sourceX:ship.x+100,sourceY:ship.y}),b=impactSection(ship,{sourceX:ship.x-100,sourceY:ship.y});
 assert.notEqual(a.section.id,b.section.id);ship.angle=Math.PI/2;
 const rotated=impactSection(ship,{sourceX:ship.x,sourceY:ship.y+100});assert.equal(rotated.section.id,a.section.id);assert.deepEqual(rotated.point,a.point);
 const bullet=impactSection(ship,{bullet:{vx:0,vy:-280}});assert.deepEqual(bullet.point,rotated.point);
 assert.ok(isCabinWalkable(cabinLayout(ship.classId),a.point.x,a.point.y,6));
});

test('shield absorption gives an impact impulse without local injury, fire or rupture',()=>{
 const game=cabin(),ship=game.state.ship;ship.shield=35;const {point}=impactSection(ship,source(ship));Object.assign(game.state.person,point);
 game._damageShip(12,source(ship));const summary=interiorDamageSummary(ship);
 assert.equal(ship.hull,ship.maxHull);assert.equal(ship.shield,23);assert.equal(game.state.person.health,100);
 assert.equal(summary.recentImpact.shieldOnly,true);assert.equal(summary.fireCount,0);assert.equal(summary.breachCount,0);assert.equal(summary.damagedCount,0);
});

test('penetrating fire causes local visible damage and hurts nearby people while distant rooms stay safe',()=>{
 const game=cabin(),ship=game.state.ship,{point}=impactSection(ship,source(ship));
 const layout=cabinLayout(ship.classId),far=Object.values(layout.stations).sort((a,b)=>Math.hypot(b.x-point.x,b.y-point.y)-Math.hypot(a.x-point.x,a.y-point.y))[0];
 game.state.crew=[{id:'near',name:'Near',role:'engineer',health:100,maxHealth:100,status:'active'},{id:'far',name:'Far',role:'medic',health:100,maxHealth:100,status:'active'}];
 game.state.boarding={kind:'defense',phase:'won',vesselId:ship.id,allies:[{crewId:'near',...point},{crewId:'far',...far}],enemies:[]};
 Object.assign(game.state.person,point);game._damageShip(22,source(ship));
 assert.equal(ship.hull,78);assert.ok(game.state.person.health<100);assert.ok(game.state.crew[0].health<100);assert.equal(game.state.crew[1].health,100);
 const summary=interiorDamageSummary(ship);assert.equal(summary.fireCount,1);assert.equal(summary.breachCount,1);assert.equal(summary.alarm,true);
 assert.equal(interiorExposure(ship,far,{delta:.1}),0);assert.ok(interiorExposure(ship,point,{delta:.1})>0);
});

test('pressure damage cannot cross an intact bulkhead just because a person is nearby',()=>{
 const game=cabin('damage-wall'),ship=game.state.ship,layout=cabinLayout(ship.classId),state=ensureDamageControl(ship);
 let pair;
 for(let y=1;y<layout.rows-1&&!pair;y++)for(let x=1;x<layout.cols-1&&!pair;x++)for(const[dx,dy]of[[1,0],[0,1]]){
  const before={x:x-dx,y:y-dy},after={x:x+dx,y:y+dy};
  if(!layout.floor[y*layout.cols+x]&&layout.walkable[before.y*layout.cols+before.x]&&layout.walkable[after.y*layout.cols+after.x]){pair=[before,after].map(p=>({x:(p.x+.5)*layout.tile,y:(p.y+.5)*layout.tile}));break;}
 }
 assert.ok(pair,'The deck has a real separating bulkhead.');
 assert.ok(Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)<78,'Both people are within the local impact radius.');
 const impact={...pair[0],shieldOnly:false,hullDamage:30};assert.equal(interiorExposure(ship,pair[1],{impact}),0);
 Object.assign(state.sections[0],pair[0],{fire:100,breach:100});assert.equal(interiorExposure(ship,pair[1],{delta:.1}),0);
 Object.assign(game.state.person,pair[1]);const before=structuredClone(ship.damageControl),energy=ship.energy;
 assert.equal(game.damageControl(state.sections[0].id,'suppress').code,'blocked');assert.deepEqual(ship.damageControl,before);assert.equal(ship.energy,energy);
});

test('hazards stay attached to a saved hull; old damaged saves migrate to scars without invented emergencies',()=>{
 const game=cabin(),{ship}=hit(game);const before=structuredClone(ship.damageControl);const restored=Game.fromSave(game.save());
 assert.deepEqual(restored.state.ship.damageControl,before);assert.equal(restored.state.person.health,game.state.person.health);
 const legacy=game.save();delete legacy.ship.damageControl;const migrated=Game.fromSave(legacy),summary=interiorDamageSummary(migrated.state.ship);
 assert.ok(summary.damagedCount>0);assert.equal(summary.fireCount,0);assert.equal(summary.breachCount,0);assert.equal(summary.recentImpact,null);
});

test('one-time deck migration preserves valid poses and relocates only invalid saved coordinates',()=>{
 const game=cabin(),layout=cabinLayout(game.state.ship.classId);Object.assign(game.state.person,layout.stations.medical);
 const valid=Game.fromSave(game.save());assert.equal(valid.state.person.x,game.state.person.x);assert.equal(valid.state.person.y,game.state.person.y);
 const save=game.save();save.person.x=-100;save.person.y=-100;const repaired=Game.fromSave(save);
 assert.ok(isCabinWalkable(layout,repaired.state.person.x,repaired.state.person.y,6));assert.equal(repaired.state.ship.hull,game.state.ship.hull);
});

test('local damage control validates reach, charge, ore and cooldown without repairing the global hull',()=>{
 const game=cabin(),{ship,section}=hit(game);game.state.cargo.ore=3;ship.energy=20;const hull=ship.hull;
 game.state.person.x=-200;const before=structuredClone(section);assert.equal(game.damageControl(section.id,'suppress').code,'distance');assert.deepEqual(section,before);
 Object.assign(game.state.person,section);ok(game.damageControl(section.id,'suppress'));assert.equal(ship.energy,18);assert.equal(game.state.cargo.ore,3);assert.equal(ship.hull,hull);
 assert.equal(game.damageControl(section.id,'patch').code,'cooldown');game._damageControlTimer=0;game.state.cargo.ore=0;
 assert.equal(game.damageControl(section.id,'patch').code,'cost');assert.equal(ship.energy,18);
 game.state.cargo.ore=2;ok(game.damageControl(section.id,'patch'));assert.equal(ship.energy,15);assert.equal(game.state.cargo.ore,1);assert.equal(section.breach,0);
 assert.equal(DAMAGE_CONTROL_ACTIONS.patch.range,72);
});

test('crew fatalities and incapacitated captains follow actual damage, while rescued people retain injuries',()=>{
 const game=cabin(),ship=game.state.ship,{point}=impactSection(ship,source(ship));
 Object.assign(game.state.person,point,{health:1});game.state.crew=[{id:'lost',name:'Mara',role:'engineer',health:1,maxHealth:100,status:'injured'}];
 game.state.boarding={kind:'defense',phase:'won',vesselId:ship.id,allies:[{crewId:'lost',...point}],enemies:[]};
 ship.rescueGroups=[{id:'rescued',shipId:ship.id,status:'aboard',members:[{id:'guest',name:'Guest',...point,health:68,maxHealth:68,status:'aboard'}]}];
 game._damageShip(22,source(ship));assert.equal(game.state.person.down,true);assert.equal(game.state.crew[0].status,'dead');assert.equal(game.state.memorial[0].crewId,'lost');assert.ok(ship.rescueGroups[0].members[0].health<68);
});

test('boarded enemy hits affect the target deck and its people, without damaging the original hull',()=>{
 const game=new Game('damage-prize'),enemy=placeRaider(game,{x:100,y:500,hp:30,maxHp:100,disabled:true,active:false});Object.assign(game.state.ship,{x:0,y:500});ok(game.boardEnemy(enemy.id));
 ensureDamageControl(enemy);const {point}=impactSection(enemy,{sourceX:enemy.x+100,sourceY:enemy.y});Object.assign(game.state.person,point);const hull=game.state.ship.hull;
 game._registerInteriorHit(enemy,20,0,{sourceX:enemy.x+100,sourceY:enemy.y});assert.ok(game.state.person.health<100);assert.equal(game.state.ship.hull,hull);assert.ok(interiorDamageSummary(enemy).alarm);
 const captured=enemyShipState(enemy);assert.deepEqual(captured.damageControl,enemy.damageControl);assert.notEqual(captured.damageControl,enemy.damageControl);
});

test('active effects are bounded and fire never jumps into another compartment by elapsed time',()=>{
 const game=cabin(),{ship,section}=hit(game);const first=section.fire;
 for(let i=0;i<100;i++)registerShipImpact(ship,{shieldDamage:1});assert.equal(ship.damageControl.impacts.length,6);
 for(let i=0;i<50;i++)stepShipDamage(ship,.1);
 assert.equal(ship.damageControl.impacts.length,0);assert.ok(section.fire<first);assert.equal(ship.damageControl.sections.filter(section=>section.fire>0).length,1);
});

test('paid port repair clears local damage and emergency rescue does not leave a lethal fire loop',()=>{
 const game=cabin(),{ship}=hit(game);ok(game.quickHelm());const body=game.system.bodies.find(body=>body.id==='kettle');Object.assign(ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(game.dock(body.id));game.state.credits=1000;
 ok(game.service('repair'));assert.equal(ship.hull,ship.maxHull);assert.equal(interiorDamageSummary(ship).damagedCount,0);assert.equal(interiorDamageSummary(ship).alarm,false);
 registerShipImpact(ship,{hullDamage:20});game._rescue('Test tow');assert.equal(interiorDamageSummary(ship).alarm,false);
});

test('solo interior incapacitation stabilizes at a safe medical point without repairing the hull or erasing hazards',()=>{
 const game=cabin();game.state.person.health=1;const{ship,section}=hit(game),damage=section.damage,breach=section.breach,hull=ship.hull;
 assert.equal(game.state.person.health,0);assert.equal(game.state.person.down,true);
 for(let i=0;i<40;i++)game.stepPilot(.1,{});assert.equal(game.state.person.health,0,'The beacon takes five seconds.');
 const restored=Game.fromSave(game.save());for(let i=0;i<12;i++)restored.stepPilot(.1,{});
 assert.equal(restored.state.person.health,25);assert.equal(restored.state.person.down,false);assert.equal(restored.state.mode,'person');assert.equal(restored.state.ship.hull,hull);
 const savedSection=restored.state.ship.damageControl.sections.find(value=>value.id===section.id);assert.equal(savedSection.damage,damage);assert.equal(savedSection.breach,breach);assert.ok(savedSection.fire>0);
 assert.equal(interiorExposure(restored.state.ship,restored.state.person,{delta:.1}),0);for(let i=0;i<10;i++)restored.stepPilot(.1,{});assert.equal(restored.state.person.health,25,'The recovery area does not immediately down the captain again.');
});

test('an active boarding fight keeps its established downed and escape rules',()=>{
 const game=cabin();game.state.person.health=1;hit(game);game.state.boarding={kind:'defense',phase:'active'};
 for(let i=0;i<70;i++)game._stepInteriorRecovery(.1);
 assert.equal(game.state.person.health,0);assert.equal(game.state.person.down,true);assert.equal(game.state.person.interiorDown.elapsed,0);
});
