import test from 'node:test';
import assert from 'node:assert/strict';
import {placeRaider} from './helpers/combat-fixtures.mjs';
import { Game } from '../dist/engine.mjs';
import { STARTER_SHIPS, enemyHullProfile, cabinLayout, isCabinWalkable } from '../dist/fleet.mjs';
import { SIDEARM, clearSidearmSight } from '../dist/combat.mjs';
import { normalizeCharacter, characterModifiers } from '../dist/character.mjs';
import { movePerson, generateSurface, isWalkable } from '../dist/surface.mjs';
import { Realm } from '../server/realm.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason||result?.message);return result;};
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,message||`${a} differs from ${b}`);
const look={skin:'deep',suit:'rust',hair:'silver',style:'swept'};
function captain(seed,traits=[],starterShip='sparrow') {return new Game(seed,{starterShip,character:{appearance:look,traits},name:'Ada Vale'});}
function land(game,id='kettle') {
  const body=game.system.bodies.find(body=>body.id===id);
  Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(game.dock(id));
}
function legacy(seed='legacy-character') {
  const save=new Game(seed).save();delete save.character;delete save.characterLocked;
  delete save.person.appearance;delete save.person.maxHealth;delete save.person.speed;
  return Game.fromSave(save);
}
function boarded(traits=[],withMedic=false) {
  const game=captain('trait-boarding',traits);
  if(withMedic){land(game);ok(game.recruitCrew('medic'));ok(game.launch());}
  const enemy=placeRaider(game);
  game.system.enemies=[enemy];
  Object.assign(enemy,enemyHullProfile('hauler'),{x:game.state.ship.x+80,y:game.state.ship.y,hp:14,disabled:true,cooldown:999,speed:0});
  ok(game.boardEnemy(enemy.id));
  const layout=cabinLayout(game.state.boarding.shipClass),hostilePoint=layout.combatSpawns[0];
  const firingPoint={x:(layout.spawn.x+hostilePoint.x)/2,y:(layout.spawn.y+hostilePoint.y)/2};
  assert.ok(isCabinWalkable(layout,firingPoint.x,firingPoint.y));assert.ok(clearSidearmSight(layout,firingPoint,hostilePoint));
  Object.assign(game.state.person,firingPoint);
  const target=game.state.boarding.enemies[0];
  Object.assign(target,hostilePoint,{health:1000,maxHealth:1000,cooldown:999,speed:0});
  for(const other of game.state.boarding.enemies.slice(1))Object.assign(other,{health:0,status:'dead'});
  game.drainEvents();return {game,target};
}
function advancePilot(game,seconds) {for(let remaining=seconds;remaining>1e-9;){const dt=Math.min(.1,remaining);game.stepPilot(dt,{});remaining-=dt;}}
function memoryPersistence() {return {saved:null,async save(id,version,snapshot){this.saved=structuredClone(snapshot);return {version:version+1};}};}

test('each new starter uses its actual hull and chosen captain, with full trait-adjusted health',()=>{
  for(const hull of STARTER_SHIPS) {
    const game=captain('starting-'+hull.id,['bulkhead_born'],hull.id);
    assert.equal(game.state.ship.classId,hull.id);assert.deepEqual(game.state.fleet.owned,[hull.id]);
    for(const key of ['maxHull','maxShield','cargoCap','speed','mining','renderLength','renderWidth'])assert.equal(game.state.ship[key],hull.stats[key],hull.id+' '+key);
    assert.equal(game.state.ship.hull,hull.stats.maxHull);assert.equal(game.state.ship.berths,hull.berths);
    assert.equal(game.state.person.maxHealth,120);assert.equal(game.state.person.health,120);
    assert.equal(game.state.characterLocked,true);assert.equal(game.state.captainName,'Ada Vale');
    assert.deepEqual(game.state.person.appearance,look);assert.equal(game.state.credits,180);
    assert.equal(game.state.ship.warpRange,0);assert.deepEqual(game.state.upgrades,{});
  }
  const lighter=captain('light-start',['long_stride']);assert.equal(lighter.state.person.health,85);
});

test('creation whitelists starter hulls and traits, and loading cannot apply new-game overrides',()=>{
  const game=new Game('creation-input',{starterShip:'capital',character:{appearance:{suit:'url(evil)'},traits:['invented','hot_cell','hot_cell','quick_hands','bulkhead_born']}});
  assert.equal(game.state.ship.classId,'sparrow');assert.deepEqual(game.state.character.traits,['hot_cell','quick_hands']);
  assert.equal(game.state.character.appearance.suit,'teal');
  const saved=captain('retain-save',['long_stride'],'kestrel');saved.state.ship.hull=30;saved.state.person.health=40;
  const restored=new Game(saved.save(),{starterShip:'mule',character:{traits:['bulkhead_born']}});
  assert.equal(restored.state.ship.classId,'kestrel');assert.equal(restored.state.ship.hull,30);
  assert.deepEqual(restored.state.character,saved.state.character);assert.equal(restored.state.person.health,40);
});

test('appearance, traits, lock, health, and derived stats survive repeated solo save/load',()=>{
  let game=captain('captain-save',['long_stride','hot_cell'],'mule');game.state.person.health=34;
  ok(game.customizeCharacter({appearance:{...look,suit:'plum',style:'hood'},traits:['bulkhead_born']}));
  const profile=structuredClone(game.state.character);
  for(let i=0;i<4;i++) {
    game=Game.fromSave(game.serialize());
    assert.deepEqual(game.state.character,profile);assert.deepEqual(game.state.person.appearance,profile.appearance);
    assert.equal(game.state.characterLocked,true);assert.equal(game.state.person.maxHealth,85);close(game.state.person.health,34);
    close(game.state.person.speed,112*1.15);assert.equal(game.state.ship.classId,'mule');
    assert.equal(game.customizeCharacter({traits:['bulkhead_born'],chooseTraits:true}).code,'locked');
  }
});

test('legacy captains get one optional trait choice that preserves health fraction and their current hull',()=>{
  const game=legacy();game.state.person.health=37;land(game);
  assert.deepEqual(game.state.character,normalizeCharacter());assert.equal(game.state.characterLocked,false);
  ok(game.customizeCharacter({appearance:look,traits:['bulkhead_born']}));
  assert.deepEqual(game.state.character.traits,[]);assert.equal(game.state.characterLocked,false);assert.equal(game.state.person.health,37);
  const before={credits:game.state.credits,cargo:structuredClone(game.state.cargo),hull:game.state.ship.classId};
  ok(game.customizeCharacter({traits:['long_stride','hot_cell'],chooseTraits:true}));
  assert.equal(game.state.characterLocked,true);assert.equal(game.state.person.maxHealth,85);close(game.state.person.health/85,.37);
  assert.deepEqual({credits:game.state.credits,cargo:game.state.cargo,hull:game.state.ship.classId},before);
  const unchanged=structuredClone(game.state.character),health=game.state.person.health;
  assert.equal(game.customizeCharacter({traits:['bulkhead_born'],chooseTraits:true}).code,'locked');
  assert.deepEqual(game.state.character,unchanged);assert.equal(game.state.person.health,health);
  ok(game.customizeCharacter({appearance:{...look,suit:'ivory'}}));close(game.state.person.health,health);
  const noTraits=legacy('deliberate-no-traits');ok(noTraits.customizeCharacter({traits:[],chooseTraits:true}));
  assert.equal(noTraits.state.characterLocked,true);assert.deepEqual(noTraits.characterEffects,characterModifiers());
});

test('trait changes are rejected during combat and actual walking uses the captain speed',()=>{
  const {game}=boarded();game.state.characterLocked=false;
  assert.equal(game.customizeCharacter({traits:['bulkhead_born'],chooseTraits:true}).code,'combat');
  assert.deepEqual(game.state.character.traits,[]);
  const surface={width:1200,height:1200,tileSize:24,tiles:Array.from({length:50},()=>Array(50).fill(1)),solids:[]};
  for(const traits of [[],['long_stride'],['bulkhead_born'],['long_stride','bulkhead_born']]) {
    const walker=captain('walking-'+traits.join('-'),traits);Object.assign(walker.state.person,{x:500,y:500});
    movePerson(surface,walker.state.person,1,0,.1);
    close(walker.state.person.x-500,112*.1*characterModifiers({traits}).walkSpeed);
  }
});

test('boarding damage and firing cooldown use the shooter traits rather than the vessel or victim',()=>{
  for(const traits of [[],['hot_cell'],['quick_hands'],['hot_cell','quick_hands']]) {
    const {game,target}=boarded(traits),effects=characterModifiers({traits}),before=target.health;
    const shot=ok(game.attackBoarder(null,game,{aiming:true,aimX:-1,aimY:0}));
    assert.equal(shot.hit,true);close(before-target.health,SIDEARM.damage*effects.sidearmDamage);
    close(shot.shot.damage,SIDEARM.damage*effects.sidearmDamage);
    close(game.state.person.weaponReadyAt-game.state.stats.time,SIDEARM.cooldown*effects.sidearmCooldown);
    assert.equal(game.attackBoarder().code,'cooldown');
    advancePilot(game,SIDEARM.cooldown*effects.sidearmCooldown-.0001);
    assert.equal(game.attackBoarder().code,'cooldown');advancePilot(game,.0002);
    ok(game.attackBoarder(null,game,{aiming:true,aimX:-1,aimY:0}));
  }
  const {game:host,target}=boarded(),visitor=captain('visitor-traits',['hot_cell']);
  visitor.state.mode='person';Object.assign(visitor.state.person,{x:host.state.person.x,y:host.state.person.y});
  const health=target.health;ok(host.attackBoarder(null,visitor,{aiming:true,aimX:-1,aimY:0}));
  close(health-target.health,30);close(visitor._boardingShotTimer,.416);assert.equal(host._boardingShotTimer||0,0);
});

test('mining traits change time to extract a finite deposit without multiplying its payout',()=>{
  function extract(traits) {
    const game=captain('mining-traits',traits),rock=game.system.asteroids[0];game.system.asteroids=[rock];
    Object.assign(rock,{hp:100,maxHp:100,ore:4,crystal:0});Object.assign(game.state.ship,{x:rock.x,y:rock.y,vx:0,vy:0});
    let steps=0;while(rock.hp>0&&steps<200){game.stepPilot(.1,{mine:true});steps++;}
    assert.equal(rock.hp,0);assert.equal(game.state.cargo.ore,4);assert.equal(game.state.stats.oreMined,4);
    const restored=Game.fromSave(game.serialize());assert.equal(restored.system.asteroids.find(item=>item.id===rock.id).hp,0);assert.equal(restored.state.cargo.ore,4);
    return steps;
  }
  const baseline=extract([]),miner=extract(['belt_born']),port=extract(['port_regular']);
  close(baseline/miner,1.25);assert.ok(port>baseline);assert.ok(Math.abs(port*.85-baseline)<1);
});

test('service discounts match actual charges and heal to the trait-adjusted maximum',()=>{
  for(const traits of [['port_regular','bulkhead_born'],['port_regular','long_stride']]) {
    const game=captain('service-traits-'+traits[1],traits);land(game);game.state.credits=500;
    game.state.ship.hull=41;game.state.ship.fuel=7;game.state.person.health=17;
    const expected={repair:Math.ceil((game.state.ship.maxHull-41)*.65*.85),refuel:Math.ceil((game.state.ship.maxFuel-7)*2*.85),rest:Math.ceil((game.state.person.maxHealth-17)*.25*.85)};
    for(const action of ['repair','refuel','rest']) {
      const quote=game.serviceQuote(action),before=game.state.credits;assert.equal(quote.cost,expected[action]);
      assert.equal(ok(game.service(action)).cost,quote.cost);assert.equal(game.state.credits,before-quote.cost);
      assert.equal(game.service(action).code,'full');assert.equal(game.state.credits,before-quote.cost);
    }
    assert.equal(game.state.person.health,game.state.person.maxHealth);
    game.state.cargo={ore:4,crystal:1};assert.equal(game.serviceQuote('sell').value,104,'Service discounts never alter commodity income.');
    const credits=game.state.credits;ok(game.service('sell'));assert.equal(game.state.credits,credits+104);
  }
});

test('story effects and boarding medics respect both higher and lower captain health caps',()=>{
  const robust=captain('healthy-story',['bulkhead_born']);robust._effects({credits:5});
  assert.equal(robust.state.person.health,120,'A choice with no health effect must not injure the captain.');
  const light=captain('light-story',['long_stride']);light.state.person.health=80;light._effects({health:20});
  assert.equal(light.state.person.health,85,'Story healing uses the captain health cap.');
  for(const traits of [['long_stride'],['bulkhead_born']]) {
    const {game}=boarded(traits,true),max=game.state.person.maxHealth,medic=game.state.boarding.allies.find(ally=>ally.role==='medic');
    const layout=cabinLayout(game.state.boarding.shipClass),medicPoint={x:game.state.person.x+layout.tile,y:game.state.person.y};
    assert.ok(isCabinWalkable(layout,medicPoint.x,medicPoint.y));assert.ok(clearSidearmSight(layout,medicPoint,game.state.person));
    assert.ok(medic);game.state.person.health=max-1;Object.assign(medic,medicPoint,{healTimer:0});
    game.stepPilot(.01,{});assert.equal(game.state.person.health,max,'Medics heal toward the actual captain maximum.');
  }
});

test('job reward shown at acceptance is exactly what pays, including after a legacy trait choice',()=>{
  const miner=captain('contract-trait',['belt_born']);land(miner);
  const work=miner.availableJobs().find(job=>job.type==='work');assert.equal(work.reward,108);ok(miner.acceptJob(work.id));
  for(let i=0;i<3;i++)ok(miner.recordActivity('work',{token:'panel-'+i}));
  const credits=miner.state.credits;ok(miner.turnInJob(work.id));assert.equal(miner.state.credits,credits+work.reward);
  assert.equal(miner.turnInJob(work.id).ok,false);assert.equal(miner.state.credits,credits+work.reward);
  const older=legacy('older-contract');land(older);
  const accepted=older.availableJobs().find(job=>job.type==='work');ok(older.acceptJob(accepted.id));
  ok(older.customizeCharacter({traits:['belt_born'],chooseTraits:true}));
  assert.equal(older.availableJobs().find(job=>job.id===accepted.id).reward,accepted.reward,'An accepted contract retains its quoted wage.');
  for(let i=0;i<3;i++)ok(older.recordActivity('work',{token:'old-panel-'+i}));
  const oldCredits=older.state.credits;ok(older.turnInJob(accepted.id));assert.equal(older.state.credits,oldCredits+accepted.reward);
});

test('shared captain creation, commands, snapshots, movement, and restart retain independent profiles',async()=>{
  const persistence=memoryPersistence(),realm=new Realm({id:'CHARS001',seed:'shared-traits',persistence});
  const first=await realm.createCaptain('Ada',{starterShip:'kestrel',character:{appearance:look,traits:['long_stride']}});
  const second=await realm.createCaptain('Bren',{starterShip:'mule',character:{appearance:{...look,suit:'moss'},traits:['bulkhead_born']}});
  const a=first.captain,b=second.captain;
  assert.equal(a.game.state.ship.classId,'kestrel');assert.equal(b.game.state.ship.classId,'mule');
  assert.equal(a.game.state.person.health,85);assert.equal(b.game.state.person.health,120);
  ok(await realm.command(a,'customizeCharacter',{appearance:{...look,style:'hood'}}));
  assert.equal((await realm.command(a,'customizeCharacter',{traits:['bulkhead_born'],chooseTraits:true})).code,'locked');
  for(const c of [a,b]) {
    realm._landCharacter(c,'hearth','kettle');c.session={close(){}};
    const surface=generateSurface({id:'kettle'},realm.seed),point=surface.spawn;
    assert.ok(isWalkable(surface,point.x+16,point.y));Object.assign(c.game.state.person,point);
    assert.equal(realm.acceptInput(c,1,{x:1,y:0}),true);
  }
  const beforeA=a.game.state.person.x,beforeB=b.game.state.person.x;
  realm.step(.1,1,Date.now());
  close(a.game.state.person.x-beforeA,112*.1*1.15);close(b.game.state.person.x-beforeB,112*.1*.88);
  const packet=realm.snapshotFor(a),remote=packet.players.find(player=>player.captainId===b.id);
  assert.deepEqual(packet.state.character,a.game.state.character);assert.equal(packet.state.characterLocked,true);
  assert.deepEqual(remote.appearance,b.game.state.person.appearance);assert.equal(remote.maxHealth,120);
  realm.markDirty();await realm.flush();
  const restored=new Realm({id:realm.id,persistence,version:realm.version,snapshot:persistence.saved});
  assert.deepEqual(restored.captains.get(a.id).game.state.character,a.game.state.character);
  assert.equal(restored.captains.get(a.id).game.state.characterLocked,true);
  assert.equal(restored.captains.get(b.id).game.state.person.maxHealth,120);
  assert.equal(restored.vessels.get(b.ownedVesselId).ship.classId,'mule');
});

test('shared PvP sidearms apply each shooter trait and publish the actual victim health cap',async()=>{
  const realm=new Realm({id:'CHARPVP1',seed:'trait-pvp',persistence:memoryPersistence()});
  const {captain:attacker}=await realm.createCaptain('Quick pulse',{character:{traits:['hot_cell']}});
  const {captain:defender}=await realm.createCaptain('Bulkhead',{character:{traits:['bulkhead_born']}});
  for(const captain of [attacker,defender])realm.attach(captain,{close(){}});
  const source=realm.vessels.get(attacker.ownedVesselId),target=realm.vessels.get(defender.ownedVesselId);
  Object.assign(source.ship,{x:0,y:0,vx:0,vy:0});Object.assign(target.ship,{x:130,y:0,vx:0,vy:0,hull:35,shield:0});
  const room=realm._room('hearth');room.runtime.enemies=[];room.runtime.bullets=[];
  ok(realm._command(attacker,'declareHostility',{vesselId:target.id}));ok(realm._command(attacker,'boardHostileShip',{vesselId:target.id}));
  const point=cabinLayout(target.ship.classId).spawn;
  Object.assign(attacker.game.state.person,point);Object.assign(defender.game.state.person,{x:point.x+22,y:point.y});
  const shot=ok(realm._command(attacker,'attackBoarder',{enemyId:defender.id}));
  assert.equal(shot.hit,true);close(shot.damage,30);assert.equal(defender.game.state.person.health,90);
  const hit=defender.events.find(event=>event.type==='person-hit');assert.equal(hit.maxHealth,120);
  assert.equal(realm._command(attacker,'attackBoarder',{enemyId:defender.id}).code,'cooldown');
  for(let i=0;i<12;i++)realm.step(1/30,i+1,Date.now());
  assert.equal(realm._command(attacker,'attackBoarder',{enemyId:defender.id}).code,'cooldown');
  realm.step(.02,13,Date.now());ok(realm._command(attacker,'attackBoarder',{enemyId:defender.id}));
  assert.equal(defender.game.state.person.health,60);
});

test('Dead Reckoning changes the chart quote and the fuel actually spent at the helm',()=>{
  const game=new Game('fold-perk',{startMode:'casual',character:{traits:['dead_reckoning']}});
  const plain=new Game('fold-perk',{startMode:'casual'});
  const target='vesper',quote=ok(game.travelInfo(target)),fuel=game.state.ship.fuel;
  assert.equal(quote.fuelCost,Math.ceil((2+quote.distance*.65)*.8));
  assert.ok(quote.fuelCost<ok(plain.travelInfo(target)).fuelCost);
  game.state.ship.fuel=quote.fuelCost-1;
  assert.equal(game.travel(target).code,'fuel');
  game.state.ship.fuel=fuel;
  ok(game.travel(target)); assert.equal(game.state.ship.fuel,fuel-quote.fuelCost);
});

test('Wreck Rigger offers a manual pickup at the same extended boundary the action accepts',()=>{
  const game=captain('distant-crate',['wreck_rigger']),plain=captain('distant-crate');
  const range=plain.manualSalvageReach*1.35;
  for(const g of [game,plain]){
    Object.assign(g.state.ship,{x:0,y:0});g.system.bodies=[];g.system.enemies=[];g.system.signals=[];g.system.traffic=[];
    g.system.pickups=[{id:'outer-crate',name:'Test cargo',x:range,y:0,ore:2}];
  }
  assert.equal(plain.salvage('outer-crate').code,'distance');
  assert.equal(game.interact().range,range);
  game.system.pickups[0].x+=1;assert.equal(game.salvage('outer-crate').code,'distance');
  game.system.pickups[0].x=range;assert.equal(ok(game.salvage('outer-crate')).ore,2);
  assert.equal(game.salvage('outer-crate').code,'target');
});

test('Core Sampler pays once on the first successful derelict scan and respects hold capacity',()=>{
  for(const [traits,kind,full,expected] of [
    [['core_sampler'],'derelict',false,1],[['core_sampler'],'derelict',true,0],
    [['core_sampler'],'survey',false,0],[[],'derelict',false,0]
  ]){
    const game=new Game('derelict-perk',{startMode:'casual',startSystemId:'afterlight',character:{traits}});
    const signal=game.system.signals.find(s=>s.kind===kind);
    Object.assign(game.state.ship,{x:signal.x,y:signal.y,energy:0});
    if(full)game.state.cargo.ore=game.state.ship.cargoCap;
    assert.equal(game.scan(signal.id).code,'energy');assert.equal(game.state.cargo.crystal,0);
    game.state.ship.energy=100;ok(game.scan(signal.id));assert.equal(game.state.cargo.crystal,expected);
    const reloaded=Game.fromSave(game.save());
    reloaded.scan(signal.id);
    assert.equal(reloaded.state.cargo.crystal,expected);
    assert.ok(reloaded.cargoUsed<=reloaded.state.ship.cargoCap);
  }
});

test('port perks pay their posted sale and job values, and Standby Rider works on foot',()=>{
  for(const [trait,priceRate,wageRate] of [['ore_broker',1.2,.9],['contract_hand',.9,1.15]]){
    const game=captain('paid-perks',[trait]);land(game);
    game.state.cargo={ore:10,crystal:5};const before=game.state.credits;
    const quote=game.serviceQuote('sell');assert.equal(quote.value,Math.floor(380*priceRate));
    ok(game.service('sell'));assert.equal(game.state.credits,before+quote.value);
    const work=game.availableJobs().find(job=>job.type==='work');assert.equal(work.reward,Math.round(120*wageRate));
    ok(game.acceptJob(work.id));for(let i=0;i<3;i++)ok(game.recordActivity('work',{token:'port-perk-'+i}));
    const credits=game.state.credits;ok(game.turnInJob(work.id));assert.equal(game.state.credits,credits+work.reward);
  }
  const plain=new Game('commuter',{startMode:'hardcore'});
  const rider=new Game('commuter',{startMode:'hardcore',character:{traits:['standby_rider']}});
  const fare=Math.round(ok(plain.passengerQuote('kettle')).fare*.7);
  assert.equal(ok(rider.passengerQuote('kettle')).fare,fare);
  rider.state.credits=fare;assert.equal(ok(rider.takePassengerTransit('kettle')).receipt.fare,fare);
  assert.equal(rider.state.credits,0);assert.equal(rider.ownsShip,false);
});
