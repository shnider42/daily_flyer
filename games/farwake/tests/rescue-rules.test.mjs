import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { cabinLayout, isCabinWalkable, enemyShipState } from '../dist/fleet.mjs';
import { placeRaider } from './helpers/combat-fixtures.mjs';
import { withHull } from './helpers/fleet-fixtures.mjs';
import { RescueRules, RESCUE_RULES, pirateRescueRoll, rescueDisposition, rescueOccupants, rescuedBerthCount } from '../dist/rescue-rules.mjs';

Object.assign(Game.prototype,RescueRules);
const source={sourceId:'hearth:signal:0'};
function seedFor(pirates){for(let i=0;i<1000;i++){const seed=`rescue-person-${i}`;if(rescueDisposition(seed,'hearth',source.sourceId,'lifeboat').pirates===pirates)return seed;}throw new Error('No suitable deterministic seed');}
function gameFor(pirates=false){const game=withHull(new Game(seedFor(pirates)),'quill');game.initializeRescueOccupants();return game;}
function rescue(game){const result=game.takeRescueOccupants('lifeboat','rescue',source);assert.equal(result.ok,true,result.reason);return game.state.ship.rescueGroups[0];}
function advance(game,seconds){for(let spent=0;spent<seconds;spent+=.1){const dt=Math.min(.1,seconds-spent);game.state.stats.time+=dt;game.stepRescueOccupants(dt);}}
function atPort(game,bodyId='kettle'){const body=game.system.bodies.find(body=>body.id===bodyId);Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+30});game.state.mode='person';game.state.locationId=body.id;game.state.interior=null;return body;}

test('rescue intent has a ten-percent boundary and a stable source-specific one-time outcome',()=>{
 assert.equal(pirateRescueRoll(0),true);assert.equal(pirateRescueRoll(.099999),true);assert.equal(pirateRescueRoll(.1),false);assert.equal(pirateRescueRoll(.999),false);
 for(const invalid of [-1,NaN,Infinity,undefined])assert.equal(pirateRescueRoll(invalid),false);
 const intent=rescueDisposition('stable-source','rim','distress-104','lifeboat');assert.deepEqual(intent,rescueDisposition('stable-source','rim','distress-104','lifeboat'));
 assert.ok(intent.revealAfter>=30&&intent.revealAfter<=75);
 let pirates=0;for(let i=0;i<10000;i++)if(rescueDisposition('rescue-probe-'+i,'hearth',source.sourceId,'lifeboat').pirates)pirates++;
 assert.ok(pirates>850&&pirates<1150,`${pirates}/10000 varied seeds should be close to ten percent`);
});

test('physical rescue counts every human, specialist, fare, and patient before admission',()=>{
 const game=gameFor();assert.equal(game.rescueAdmissionCheck('lifeboat','rescue').ok,true);
 game.state.ship.humanOccupants=3;assert.equal(game.rescueAdmissionCheck('lifeboat','rescue').code,'capacity');game.state.ship.humanOccupants=1;
 game.state.crew=[{id:'engineer',role:'engineer',health:100},{id:'gunner',role:'gunner',health:100}];assert.equal(game.rescueAdmissionCheck('lifeboat','rescue').code,'capacity');game.state.crew=[];
 game.narrativeBerths=()=>1;game.professionBerths=()=>1;assert.equal(game.rescueAdmissionCheck('lifeboat','rescue').code,'capacity');
 game.professionBerths=()=>0;assert.equal(game.rescueAdmissionCheck('lifeboat','rescue').ok,true);
 rescue(game);assert.equal(game.rescuedBerths(),2);assert.equal(game.rescueAdmissionCheck('ghost_freighter','board').code,'capacity');
 assert.equal(game.takeRescueOccupants('ghost_freighter','board',{sourceId:'other'}).ok,false);assert.equal(game.rescuedBerths(),2);
});

test('rescued people have persistent names, positions, berths, and the actual carrier identity',()=>{
 const game=gameFor(),rng=game.state.rng,group=rescue(game),view=rescueOccupants(game.state.ship),layout=cabinLayout(game.state.ship.classId);
 assert.equal(view.length,2);assert.equal(game.state.rng,rng);assert.equal(new Set(view.map(person=>person.id)).size,2);
 assert.ok(view.every(person=>person.shipId===game.state.ship.id&&isCabinWalkable(layout,person.x,person.y,6)));
 assert.ok(view.every(person=>!('pirates'in person)&&!('revealAfter'in person)&&person.greeting));
 const restored=Game.fromSave(game.save());restored.initializeRescueOccupants();assert.deepEqual(rescueOccupants(restored.state.ship),view);
 assert.equal(restored.state.ship.rescueGroups[0].pirates,group.pirates);assert.equal(restored.state.ship.rescueGroups[0].revealAfter,group.revealAfter);
 assert.equal(restored.takeRescueOccupants('lifeboat','rescue',source).ok,false);assert.equal(restored.rescuedBerths(),2);
});

test('changing perspective neither rerolls passengers nor advances the hijack timer',()=>{
 const game=gameFor(true),group=rescue(game),before=copy(group);
 for(let i=0;i<5;i++){assert.equal(game.enterCabin().ok,true);assert.equal(game.exitCabin().ok,true);}
 assert.deepEqual(group,before);assert.equal(game.state.boarding,null);
 advance(game,10);assert.ok(Math.abs(group.elapsed-10)<.001);
 const restored=Game.fromSave(game.save());restored.initializeRescueOccupants();assert.equal(restored.state.ship.rescueGroups[0].elapsed,group.elapsed);
 assert.equal(restored.state.ship.rescueGroups[0].pirates,true);
});

test('hidden hijackers become those same visible passengers in real defense combat without an outside ship',()=>{
 const game=gameFor(true),group=rescue(game),people=rescueOccupants(game.state.ship),ships=game.system.enemies.map(enemy=>enemy.id);
 assert.equal(game.enterCabin().ok,true);const position={x:game.state.person.x,y:game.state.person.y};
 advance(game,group.revealAfter-.2);assert.equal(game.state.boarding,null);advance(game,.3);
 const boarding=game.state.boarding;assert.equal(boarding.source,'rescued-pirates');assert.equal(boarding.kind,'defense');assert.equal(boarding.phase,'active');
 assert.deepEqual({x:game.state.person.x,y:game.state.person.y},position);assert.equal(boarding.vesselId,game.state.ship.id);
 assert.deepEqual(boarding.enemies.map(enemy=>enemy.id),people.map(person=>person.id));assert.deepEqual(boarding.enemies.map(enemy=>[enemy.x,enemy.y]),people.map(person=>[person.x,person.y]));
 assert.deepEqual(game.system.enemies.map(enemy=>enemy.id),ships);assert.equal(game.exitCabin().code,'boarding');
 assert.equal(game.rescueDockCheck().code,'boarding');assert.equal(game.retreatBoarding().code,'defense');
 const layout=cabinLayout(boarding.shipClass);
 for(const enemy of boarding.enemies){
  const point=[{x:enemy.x-24,y:enemy.y},{x:enemy.x+24,y:enemy.y},{x:enemy.x,y:enemy.y-24},{x:enemy.x,y:enemy.y+24}].find(point=>isCabinWalkable(layout,point.x,point.y,6));assert.ok(point);
  Object.assign(game.state.person,point);
  for(let shot=0;shot<3&&enemy.health>0;shot++){game._boardingShotTimer=0;const hit=game.attackBoarder(enemy.id);assert.equal(hit.ok,true,hit.reason);assert.equal(hit.hit,true);game.syncRescueCombat();}
 }
 assert.equal(boarding.phase,'won');assert.equal(group.status,'defeated');assert.equal(game.rescuedBerths(),0);assert.equal(game.state.ship.rescueHistory.filter(item=>item.outcome==='defeated').length,1);
 const saved=Game.fromSave(game.save());saved.initializeRescueOccupants();saved.syncRescueCombat();assert.equal(saved.rescuedBerths(),0);
 assert.equal(saved.state.ship.rescueHistory.filter(item=>item.outcome==='defeated').length,1);
});

test('unarmed survivors disembark only with their physical carrier at a safe port',()=>{
 const game=gameFor(),group=rescue(game),body=game.system.bodies.find(body=>body.id==='kettle');
 assert.equal(game.disembarkRescuedOccupants(body).ok,false);assert.equal(game.rescuedBerths(),2);
 atPort(game);game.state.ship.x=2000;assert.equal(game.disembarkRescuedOccupants(body).code,'distance');
 atPort(game);const result=game.disembarkRescuedOccupants(body);assert.equal(result.ok,true);assert.equal(result.delivered,2);assert.equal(result.detained,0);
 assert.equal(game.rescuedBerths(),0);assert.equal(game.state.ship.rescueHistory[0].id,group.id);assert.equal(game.state.ship.rescueHistory[0].outcome,'delivered');
 assert.equal(game.disembarkRescuedOccupants(body).delivered,0);assert.ok(game.drainEvents().some(event=>event.type==='rescue-delivered'&&event.text.includes('Kettle')));
});

test('a secure arrival can catch concealed weapons but cannot erase an overdue or active hijack',()=>{
 const early=gameFor(true);rescue(early);const body=atPort(early),result=early.disembarkRescuedOccupants(body);
 assert.equal(result.detained,2);assert.equal(result.delivered,0);assert.equal(early.state.ship.rescueHistory[0].outcome,'detained');
 const due=gameFor(true),group=rescue(due);group.elapsed=group.revealAfter;
 assert.equal(due.rescueDockCheck().code,'boarding');assert.equal(due.state.boarding.phase,'active');
 const port=atPort(due);assert.equal(due.disembarkRescuedOccupants(port).code,'boarding');assert.equal(due.rescuedBerths(),2);
});

test('passengers and their delayed betrayal stay with the hull when its captain changes ships',()=>{
 const game=gameFor(true),group=rescue(game);advance(game,8);
 const parked=game._parkCurrentVessel(),replacement=new Game('other-hull').state.ship;game.state.ship=copy(replacement);game.initializeRescueOccupants();
 assert.equal(game.rescuedBerths(),0);advance(game,80);assert.equal(game.state.boarding,null);
 assert.equal(rescuedBerthCount(parked),2);assert.equal(parked.rescueGroups[0].elapsed,group.elapsed);
 game.state.ship=copy(parked);game.initializeRescueOccupants();advance(game,group.revealAfter-8+.1);
 assert.equal(game.state.boarding.vesselId,parked.id);assert.equal(game.state.boarding.enemies[0].id,group.members[0].id);
});

test('a foreign on-foot deck is never replaced by a rescue reveal',()=>{
 const game=gameFor(true),group=rescue(game),other={kind:'enemy',location:{id:'other-deck'},returnShip:{x:0,y:0}};
 game.state.mode='person';game.state.interior=other;game.state.locationId='other-deck';
 advance(game,80);assert.equal(game.state.interior,other);assert.equal(game.state.locationId,'other-deck');assert.equal(game.state.boarding,null);
 assert.ok(group.elapsed>=group.revealAfter);assert.equal(group.status,'aboard');
});

test('a successful hijack keeps wounded intruders on the lost hull and recapture cannot resurrect them',()=>{
 let game=gameFor(true);const group=rescue(game),originId=game.state.ship.id,ids=group.members.map(person=>person.id);
 Object.assign(game.state.ship,{x:700,y:800,hull:63});advance(game,group.revealAfter+.1);
 const hijack=game.state.boarding;hijack.enemies[0].health=0;hijack.enemies[0].status='dead';hijack.enemies[1].health=20;
 game.state.person.health=0;game.state.person.down=true;game._finishBoarding('lost');
 assert.notEqual(game.state.ship.id,originId);assert.equal(game.rescuedBerths(),0);assert.deepEqual(rescueOccupants(game.state.ship),[]);
 let occupied=game.system.enemies.find(enemy=>enemy.id===originId);assert.ok(occupied);assert.equal(occupied.hp,63);
 assert.deepEqual(occupied.rescueGroups[0].members.map(member=>member.id),ids);assert.deepEqual(occupied.rescueGroups[0].members.map(member=>member.health),[0,20]);
 assert.equal(occupied.deck.enemies.length,1);assert.equal(occupied.deck.enemies[0].id,ids[1]);
 game=Game.fromSave(game.save());occupied=game.system.enemies.find(enemy=>enemy.id===originId);
 assert.equal(game.ownsShip,false);assert.equal(game.state.mode,'person');assert.equal(game.boardEnemy(originId).ok,false);
 game.state.credits=1000;assert.equal(game.buyShip('sparrow').ok,true);assert.equal(game.state.credits,580);assert.equal(game.launch().ok,true);
 Object.assign(game.state.ship,{x:occupied.x+45,y:occupied.y});assert.equal(game.boardEnemy(originId).ok,true);
 assert.equal(game.state.boarding.enemies.length,1);assert.equal(game.currentBody.guests.length,1);assert.equal(game.currentBody.guests[0].id,ids[1]);
 const hostile=game.state.boarding.enemies[0],layout=cabinLayout(game.state.boarding.shipClass),point=[{x:hostile.x-24,y:hostile.y},{x:hostile.x+24,y:hostile.y}].find(point=>isCabinWalkable(layout,point.x,point.y,6));assert.ok(point);
 Object.assign(game.state.person,{...point,health:100,down:false});game._boardingShotTimer=0;assert.equal(game.attackBoarder(hostile.id).hit,true);assert.equal(game.state.boarding.phase,'won');
 Object.assign(game.state.person,layout.stations.helm);assert.equal(game.takeCapturedHelm().ok,true);
 assert.equal(game.state.ship.id,originId);assert.equal(game.rescuedBerths(),0);assert.equal(game.state.ship.rescueGroups[0].status,'defeated');
 assert.deepEqual(game.state.ship.rescueGroups[0].members.map(member=>member.id),ids);assert.deepEqual(game.state.ship.rescueGroups[0].members.map(member=>member.health),[0,0]);
 const restored=Game.fromSave(game.save());advance(restored,100);assert.equal(restored.state.boarding,null);assert.equal(restored.rescuedBerths(),0);
 assert.equal(restored.system.parkedShips.length,1);assert.notEqual(restored.system.parkedShips[0].id,originId);
  // Losing the recaptured hull again replaces its old promoted record; it does
  // not create another physical ship or another set of the same passengers.
  const raider=placeRaider(restored);Object.assign(restored.state.ship,{shield:0});Object.assign(raider,{x:restored.state.ship.x+60,y:restored.state.ship.y,disabled:false});
  assert.equal(restored.startBoarding(raider.id).ok,true);restored.state.person.health=0;restored.state.person.down=true;restored._finishBoarding('lost');
  assert.equal(restored.system.enemies.filter(enemy=>enemy.id===originId).length,1);assert.equal(restored._record().spawned.filter(enemy=>enemy.id===originId).length,1);
  assert.equal(rescuedBerthCount(restored.system.enemies.find(enemy=>enemy.id===originId)),0);
});

test('innocent survivors remain on a ship seized by other pirates and still occupy its berths after capture',()=>{
 const game=gameFor(),group=rescue(game),originId=game.state.ship.id,ids=group.members.map(member=>member.id),raider=placeRaider(game);
 Object.assign(game.state.ship,{x:700,y:800,shield:0,hull:60});Object.assign(raider,{x:760,y:800,disabled:false});
 assert.equal(game.startBoarding(raider.id).ok,true);game.state.person.health=0;game.state.person.down=true;game._finishBoarding('lost');
 const occupied=game.system.enemies.find(enemy=>enemy.id===originId);assert.equal(rescuedBerthCount(occupied),2);assert.equal(game.rescuedBerths(),0);
 assert.equal(occupied.rescueGroups[0].status,'aboard');assert.deepEqual(occupied.rescueGroups[0].members.map(member=>member.id),ids);
 for(const actor of occupied.deck.enemies)actor.health=0;occupied.deck.cleared=true;
 assert.equal(game.ownsShip,false);assert.equal(game.state.mode,'person');assert.equal(game.boardEnemy(originId).ok,false);
 game.state.credits=1000;assert.equal(game.buyShip('sparrow').ok,true);assert.equal(game.state.credits,580);
 withHull(game,'tern');assert.equal(game.launch().ok,true);
 game.state.crew=[{id:'one',name:'First crew',role:'engineer',health:100,maxHealth:100},{id:'two',name:'Second crew',role:'gunner',health:100,maxHealth:100}];
 Object.assign(game.state.ship,{x:occupied.x+45,y:occupied.y});assert.equal(game.boardEnemy(originId).ok,true);
 Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).stations.helm);assert.equal(game.takeCapturedHelm().code,'capacity');
 game.state.crew.pop();assert.equal(game.takeCapturedHelm().ok,true);assert.equal(game.rescuedBerths(),2);assert.deepEqual(rescueOccupants(game.state.ship).map(person=>person.id),ids);
 assert.ok(game.system.parkedShips.every(ship=>rescuedBerthCount(ship)===0));
});

test('canonical vessel promotion rebases passenger ownership and copies current guard wounds without mutation',()=>{
 const game=gameFor(true),group=rescue(game);advance(game,group.revealAfter+.1);game.state.boarding.enemies[0].health=9;game.syncRescueCombat();
 const enemy={...copy(game.state.ship),hp:41,maxHp:100,deck:{enemies:copy(game.state.boarding.enemies)}};
 enemy.deck.enemies[0].health=0;const before=copy(enemy),promoted=enemyShipState(enemy,'prize:hearth:'+enemy.id);
 assert.equal(promoted.rescueGroups[0].shipId,promoted.id);assert.equal(promoted.rescueGroups[0].members[0].health,0);assert.equal(promoted.rescueGroups[0].members[1].health,68);
 assert.deepEqual(enemy,before);game.state.ship=promoted;game.initializeRescueOccupants();assert.equal(game.rescuedBerths(),1);
});

test('same-hull assault casualty sync updates original hijackers without changing unrelated survivors',()=>{
 const game=gameFor(true),group=rescue(game);advance(game,group.revealAfter+.1);
 const innocent=copy(group);innocent.id='unrelated-rescue';innocent.pirates=false;innocent.status='aboard';innocent.members=innocent.members.slice(0,1).map(member=>({...member,id:'unrelated-person',status:'aboard'}));game.state.ship.rescueGroups.push(innocent);
 const before=copy(innocent);game.state.boarding.source=undefined;game.state.boarding.kind='assault';game.state.boarding.phase='won';
 for(const actor of game.state.boarding.enemies)actor.health=0;game.syncRescueCombat();game.syncRescueCombat();
 assert.equal(group.status,'defeated');assert.ok(group.members.every(member=>member.health===0));assert.deepEqual(innocent,before);
 assert.equal(game.state.ship.rescueHistory.filter(item=>item.id===group.id&&item.outcome==='defeated').length,1);
});

function copy(value){return JSON.parse(JSON.stringify(value));}
