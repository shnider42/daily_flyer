import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SHIP_CLASSES,CREW_ROLES} from '../dist/engine.mjs';
import {cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
const ok=r=>{assert.equal(r?.ok,true,r?.reason);return r;};
const frame=(g,input={},n=1)=>{for(let i=0;i<n;i++)g.step(1/60,input);};
function port(g){const b=g.system.bodies.find(b=>b.id==='kettle')||g.system.bodies[0];Object.assign(g.state.ship,{x:b.x,y:b.y+b.radius+60});ok(g.dock(b.id));}
function funded(g){g.state.credits=15000;g.state.flags.push('first_fold_done','archive_decoded','ally_chosen');Object.assign(g.state.upgrades,{fold_1:1,fold_2:1,fold_3:1});g._updateStats();}
function closeEnemy(g){const enemy=g.system.enemies[0];g.system.enemies=[enemy];Object.assign(enemy,{x:g.state.ship.x+100,y:g.state.ship.y,hp:46,maxHp:46,speed:0,cooldown:999,disabled:false});return enemy;}

test('fleet commissioning enforces earned prerequisites, prices and port mode while preserving the canonical ship object',()=>{
  const g=new Game('fleet-buy'),reference=g.state.ship;
  assert.equal(g.buyShip('hauler').code,'mode');port(g);assert.equal(g.classInfo('hauler').code,'prerequisite');
  g.state.upgrades.fold_1=1;g.state.credits=5000;g.state.cargo.ore=20;assert.equal(g.classInfo('hauler').code,'story');
  g.state.flags.push('first_fold_done');const credits=g.state.credits;ok(g.buyShip('hauler'));
  assert.equal(g.state.ship,reference);assert.equal(g.state.credits,credits-1150);assert.equal(g.state.cargo.ore,0);assert.equal(g.state.ship.berths,6);
  assert.equal(g.buyShip('hauler').code,'owned');assert.equal(g.state.credits,credits-1150);
  assert.equal(g.classInfo('sparrow').ok,true,'An owned inactive hull can be selected from the shipyard');
  assert.equal(g.buyShip('sparrow').code,'owned');
  const before=g.state.ship.hull/g.state.ship.maxHull;g.state.ship.hull*=.4;ok(g.selectShip('sparrow'));ok(g.selectShip('hauler'));assert.ok(Math.abs(g.state.ship.hull/g.state.ship.maxHull-before*.4)<1e-10);
  const save=Game.fromSave(g.serialize());assert.equal(save.state.ship.classId,'hauler');assert.ok(save.state.fleet.owned.includes('sparrow'));
});

test('four hulls support 4/6/8/10 occupied berths, expanded NPC roles, and safe downsizing',()=>{
  const g=new Game('capacity');port(g);funded(g);
  for(const role of ['engineer','navigator','medic'])ok(g.recruitCrew(role));
  assert.equal(g.freeBerths,0);assert.equal(g.recruitCrew('gunner').code,'capacity');
  for(const [id,roles]of [['hauler',['gunner','security']],['frigate',['scientist','quartermaster']],['capital',['engineer','security']]]){
    g.state.cargo.ore=SHIP_CLASSES.find(c=>c.id===id).ore;ok(g.buyShip(id));
    for(const [i,role] of roles.entries())ok(g.recruitCrew(role,{id:`${id}-${role}-${i}`,name:`${id} ${role}`}));
    assert.equal(g.livingCrew.length+1,g.shipClass.berths);assert.equal(g.freeBerths,0);
  }
  assert.equal(g.state.ship.berths,10);assert.equal(g.livingCrew.length,9);assert.equal(g.selectShip('sparrow').code,'capacity');
  assert.equal(g.recruitCrew('medic',{id:'eleventh'}).code,'capacity');
  const restored=Game.fromSave(g.serialize());assert.equal(restored.livingCrew.length,9);assert.equal(restored.state.ship.berths,10);
});

test('human occupants share the same capacity and dismissed specialists leave persistent departure records',()=>{
  const g=new Game('human-berths');port(g);g.state.credits=1000;g.state.ship.humanOccupants=3;
  ok(g.recruitCrew('engineer'));assert.equal(g.freeBerths,0);assert.equal(g.recruitCrew('navigator').code,'capacity');
  ok(g.dismissCrew('crew-engineer'));assert.equal(g.freeBerths,1);assert.equal(g.state.formerCrew.length,1);assert.equal(g.state.ship.maxHull,100);
  ok(g.recruitCrew('navigator'));assert.equal(g.livingCrew.length,1);
  const restored=Game.fromSave(g.serialize());assert.equal(restored.state.formerCrew[0].id,'crew-engineer');assert.equal(restored.state.ship.humanOccupants,3);
});

test('legacy saves retain crew identities, facing and casualties without discarding an over-capacity old roster',()=>{
  const old=new Game('legacy').save();delete old.ship.classId;delete old.ship.angularVelocity;delete old.fleet;
  old.ship.angle=1.234;old.crew=Array.from({length:5},(_,i)=>({id:`legacy-${i}`,name:`Old friend ${i}`,role:'engineer'}));
  old.crew.push({id:'lost-friend',name:'Lost friend',role:'medic',health:0,status:'dead'});
  const g=Game.fromSave(old);assert.equal(g.state.crew.length,6);assert.equal(g.livingCrew.length,5);assert.equal(g.state.crew.at(-1).health,0);assert.equal(g.freeBerths,0);
  assert.equal(g.state.ship.classId,'sparrow');assert.equal(g.state.ship.angle,1.234);assert.equal(g.state.ship.angularVelocity,0);
});

test('engineering and medical stations spend reactor charge, respect cooldowns, and never revive dead crew',()=>{
  const g=new Game('station-routines');port(g);g.state.credits=1000;ok(g.recruitCrew('engineer'));ok(g.recruitCrew('medic'));ok(g.launch());
  Object.assign(g.state.ship,{x:500,y:-700,hull:60});g.state.person.health=50;g.state.crew[0].health=60;g.state.crew[0].status='injured';
  ok(g.enterCabin());const energy=g.state.ship.energy;ok(g.repairFromStation());assert.equal(g.state.ship.hull,68);assert.equal(g.state.ship.energy,energy-18);assert.equal(g.repairFromStation().code,'cooldown');
  ok(g.medicalFromStation());assert.equal(g.state.person.health,62);assert.equal(g.state.crew[0].health,68);assert.equal(g.medicalFromStation().code,'cooldown');
  g.state.crew[1].health=0;g.state.crew[1].status='dead';frame(g,{},361);ok(g.medicalFromStation());assert.equal(g.state.crew[1].health,0);
});

test('disabled ships are boardable, boarding is live combat, and victories cannot be paid twice',()=>{
  const g=new Game('assault');Object.assign(g.state.ship,{x:0,y:400,vx:0,vy:0,angle:0});const enemy=closeEnemy(g);
  for(let n=0;n<120&&!enemy.disabled;n++)g.step(1/60,{fire:true});assert.equal(enemy.disabled,true);assert.ok(enemy.hp>0);
  assert.equal(g.interact().type,'board');const saved=Game.fromSave(g.serialize());assert.equal(saved.system.enemies.find(e=>e.id===enemy.id).disabled,true);
  ok(saved.boardEnemy(enemy.id));assert.equal(saved.state.mode,'person');assert.equal(saved.state.boarding.phase,'active');assert.equal(saved.state.boarding.kind,'assault');
  assert.equal(saved.attackBoarder().ok,false,'The entry airlock is initially out of pistol range');
  const first=saved.state.boarding.enemies[0],x=first.x;frame(saved,{},30);assert.notEqual(first.x,x,'Hostiles actually move through the deck');
  Object.assign(saved.state.person,{x:252,y:300});assert.ok(isCabinWalkable(cabinLayout('sparrow'),252,300));
  const before=saved.state.credits;for(let n=0;n<600&&saved.state.boarding.phase==='active';n++)saved.step(1/60,{fire:true});
  assert.equal(saved.state.boarding.phase,'won');assert.equal(saved.state.credits,before+95);assert.ok(saved.state.boarding.enemies.every(e=>e.health===0));
  const reward=saved.state.credits;assert.equal(saved.attackBoarder().ok,false);frame(saved,{},30);assert.equal(saved.state.credits,reward);
  ok(saved.leaveInterior());assert.equal(saved.state.mode,'ship');assert.equal(saved.state.boarding,null);
  assert.ok(!Game.fromSave(saved.serialize()).system.enemies.some(e=>e.id===enemy.id));
});

test('weak shields permit a telegraphed pirate grapple and crew casualties come from actual combat',()=>{
  const g=new Game('defense');port(g);g.state.credits=500;ok(g.recruitCrew('engineer',{name:'Mara'}));ok(g.launch());
  const enemy=closeEnemy(g);g.state.ship.shield=0;g._hitTimer=10;
  frame(g,{},90);assert.equal(g.state.boarding,null,'A grapple takes time');frame(g,{},100);
  assert.equal(g.state.boarding?.kind,'defense');assert.equal(g.state.boarding.phase,'active');assert.ok(g.drainEvents().some(e=>e.type==='boarding-warning'));
  const ally=g.state.boarding.allies[0];g.state.crew[0].health=7;ally.health=7;Object.assign(ally,{x:140,y:300});Object.assign(g.state.person,{x:612,y:132});
  frame(g,{},180);assert.equal(g.state.crew[0].health,0);assert.equal(g.state.crew[0].status,'dead');assert.equal(g.state.memorial.length,1);assert.equal(g.state.memorial[0].crewId,'crew-engineer');
  const resumed=Game.fromSave(g.serialize());assert.equal(resumed.state.crew[0].name,'Mara');assert.equal(resumed.state.crew[0].health,0);assert.equal(resumed.state.memorial.length,1);assert.equal(resumed.state.ship.maxHull,100);
  assert.equal(resumed.retreatBoarding().code,'defense');assert.ok(enemy.boardingTargetId);
  Object.assign(resumed.state.person,{x:252,y:300});
  for(let i=0;i<600&&resumed.state.boarding.phase==='active';i++)resumed.step(1/60,{fire:true});
  assert.equal(resumed.state.boarding.phase,'won');ok(resumed.leaveInterior());port(resumed);
  const replacement=ok(resumed.recruitCrew('engineer')).crew;
  assert.notEqual(replacement.id,'crew-engineer');assert.notEqual(replacement.name,'Mara');assert.equal(resumed.state.crew.find(c=>c.id==='crew-engineer').health,0);assert.equal(resumed.state.memorial.length,1);
});

test('live boarding persists actors, hull momentum, and shared-character sidearm cooldowns through saves',()=>{
  const actor=new Game('boarding-save');Object.assign(actor.state.ship,{x:0,y:450,vx:12,vy:-7,angle:.7,angularVelocity:.3});const enemy=closeEnemy(actor);enemy.disabled=true;enemy.hp=14;
  ok(actor.boardEnemy(enemy.id));const resumed=Game.fromSave(actor.serialize());assert.equal(resumed.state.boarding.enemies.length,2);assert.equal(resumed.state.interior.returnShip.angularVelocity,.3);
  const character=new Game('visitor');character._playerId='visitor';character.state.mode='person';Object.assign(character.state.person,{x:252,y:300});
  ok(resumed.attackBoarder(null,character));assert.equal(resumed.attackBoarder(null,character).code,'cooldown');
  for(let i=0;i<11;i++)resumed.stepPilot(1/30,{}, {boardingParticipants:[character]});assert.ok(character._boardingShotTimer===0);ok(resumed.attackBoarder(null,character));
});
