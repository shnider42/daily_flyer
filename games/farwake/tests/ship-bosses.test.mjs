import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIP_BOSS_ARCHETYPES,shipBossPlan,installShipBossEncounter,stepShipBosses,captureShipBosses,shipBossDamage,shipBossTelegraph,bossMusicContext} from '../dist/ship-bosses.mjs';
import {drawShipBossTelegraphs} from '../dist/ship-boss-art.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const seed='boss-mechanics';
function fixture(archetype,record={}){
 const plan=shipBossPlan(seed).find(entry=>entry.archetype===archetype),world={id:plan.systemId,radius:8100,bodies:[{id:'port',x:1300,y:300,radius:180}],enemies:[],bullets:[]};
 installShipBossEncounter(world,{seed,record});
 return {world,enemy:world.enemies.find(enemy=>!enemy.shipBossPart)};
}
function participant(enemy,offset=550,id='pilot',vesselId='player-ship'){
 return{id,vesselId,ship:{id:vesselId,x:enemy.x+offset,y:enemy.y,radius:21,hull:100},targetEligible:true};
}
function advance(world,seconds,options={}){for(let i=0;i<Math.ceil(seconds/.1);i++)stepShipBosses(world,.1,options);}

test('the seeded galaxy has three optional bosses, no arrival-hub rolls, and no visit reroll',()=>{
 const encountered=new Map(Object.keys(SHIP_BOSS_ARCHETYPES).map(id=>[id,new Set()]));
 for(let i=0;i<80;i++){
  const value=`seed-${i}`,plan=shipBossPlan(value);
  assert.equal(plan.length,3);assert.equal(new Set(plan.map(entry=>entry.systemId)).size,3);
  assert.deepEqual(plan,shipBossPlan(value));
  for(const entry of plan){
   assert.ok(!['hearth','sol','crosswind','meridian','brindle','voltage'].includes(entry.systemId));encountered.get(entry.archetype).add(entry.systemId);
   const world={id:entry.systemId,radius:8100,bodies:[{x:0,y:0,radius:100},{x:2000,y:0,radius:160}],enemies:[],bullets:[]};
   installShipBossEncounter(world,{seed:value});const before=clone(world);
   installShipBossEncounter(world,{seed:value});assert.deepEqual(world,before);
   const boss=world.enemies[0];assert.ok(Math.hypot(boss.x,boss.y)>5000);assert.ok(Math.hypot(boss.x-2000,boss.y)>2000);
  }
 }
 for(const [id,locations]of encountered)assert.equal(locations.size,SHIP_BOSS_ARCHETYPES[id].systems.length);
 const quiet={id:'hearth',enemies:[],bullets:[]};assert.equal(installShipBossEncounter(quiet,{seed}),null);assert.deepEqual(quiet.enemies,[]);
});

test('siege monitor commits its aim before firing and opens armor during recovery',()=>{
 const {world,enemy}=fixture('siege-monitor'),pilot=participant(enemy,700),events=[];
 stepShipBosses(world,.1,{participants:[pilot],onEvent:(type,event)=>events.push({type,...event})});
 assert.equal(enemy.bossState.phase,'windup');assert.equal(world.bullets.length,0);assert.equal(enemy.bossState.aimAngle,0);
 const covered=shipBossDamage(enemy,100,world);assert.equal(covered,55.00000000000001);
 pilot.ship.y+=450;
 advance(world,2.1,{participants:[pilot]});assert.equal(world.bullets.length,0,'the warning is a real damage-free interval');
 advance(world,.2,{participants:[pilot]});assert.equal(world.bullets.length,1);assert.equal(world.bullets[0].vy,0,'the fixed shot cannot track a sideways dodge');
 assert.equal(enemy.bossState.phase,'recovery');assert.equal(shipBossDamage(enemy,100,world),135);
 assert.equal(events.filter(event=>event.type==='ship-boss-warning').length,1);
 assert.equal(shipBossTelegraph(enemy,world).kind,'recovery');
});

test('ram tug warns, sweeps its real path, and can hit one shared vessel only once per charge',()=>{
 const {world,enemy}=fixture('ram-tug'),pilot=participant(enemy,520),crew={...pilot,id:'crew'},hits=[];
 const options={participants:[pilot,crew],onPlayerHit:(target,amount,details)=>hits.push({target:target.id,amount,...details})};
 stepShipBosses(world,.1,options);assert.equal(enemy.bossState.phase,'windup');assert.equal(hits.length,0);
 advance(world,1.6,options);assert.equal(hits.length,0);assert.equal(enemy.bossState.phase,'windup');
 advance(world,1.8,options);assert.equal(hits.length,1);assert.equal(hits[0].targetVesselId,pilot.vesselId);assert.equal(hits[0].amount,58);
 assert.equal(enemy.bossState.phase,'recovery');assert.equal(shipBossDamage(enemy,100,world),125);
 const dodged=fixture('ram-tug'),avoider=participant(dodged.enemy,520),misses=[];
 stepShipBosses(dodged.world,.1,{participants:[avoider]});avoider.ship.y+=260;
 advance(dodged.world,3.5,{participants:[avoider],onPlayerHit:(...args)=>misses.push(args)});
 assert.equal(misses.length,0,'moving across the locked charge path prevents the impact');
});

test('carrier relays are persistent physical objectives and the spread leaves a central gap',()=>{
 const {world,enemy}=fixture('screen-carrier'),pilot=participant(enemy,700);
 const relays=world.enemies.filter(actor=>actor.shipBossPart);assert.equal(relays.length,2);
 assert.ok(relays.every(relay=>relay.trainingTarget&&relay.noLoot&&!relay.boardable));
 assert.equal(shipBossDamage(enemy,100,world),0);assert.equal(shipBossDamage(relays[0],100,world),100);
 stepShipBosses(world,.1,{participants:[pilot]});const telegraph=shipBossTelegraph(enemy,world);assert.equal(telegraph.kind,'spread');assert.ok(telegraph.angles.every(angle=>Math.abs(angle)>=.09));
 advance(world,1.8,{participants:[pilot]});assert.equal(world.bullets.length,6);assert.ok(world.bullets.every(bullet=>Math.abs(bullet.vy)>0));
 relays[0].hp=0;assert.equal(shipBossDamage(enemy,100,world),0);
 const saved=captureShipBosses(world),restored=fixture('screen-carrier',{shipBosses:saved});
 assert.equal(restored.world.enemies.filter(actor=>actor.shipBossPart).length,1);
 restored.world.enemies.find(actor=>actor.shipBossPart).hp=0;
 assert.equal(shipBossDamage(restored.enemy,100,restored.world),100);
 assert.equal(captureShipBosses(restored.world).defeated.length,2);
});

test('a saved warning restores phase, locked aim, targeting, positions, and the exact next attack',()=>{
 for(const archetype of Object.keys(SHIP_BOSS_ARCHETYPES)){
  const {world,enemy}=fixture(archetype),pilot=participant(enemy,580);
  advance(world,.7,{participants:[pilot]});enemy.hp-=87;
  const saved=captureShipBosses(world),snapshot=clone(saved),restored=fixture(archetype,{shipBosses:saved});
  assert.deepEqual(captureShipBosses(restored.world),saved,archetype);
  pilot.ship.y+=100;const otherPilot=clone(pilot),one=[],two=[];
  advance(world,2.7,{participants:[pilot],onPlayerHit:(p,a,d)=>one.push([p.id,a,d])});
  advance(restored.world,2.7,{participants:[otherPilot],onPlayerHit:(p,a,d)=>two.push([p.id,a,d])});
  assert.deepEqual(captureShipBosses(world),captureShipBosses(restored.world));assert.deepEqual(world.bullets,restored.world.bullets);assert.deepEqual(one,two);
  assert.deepEqual(saved,snapshot,'the persisted record is never mutated by the live fight');
 }
});

test('retreat cancels an armed attack, ignores parked ships, and preserves all damage',()=>{
 for(const archetype of Object.keys(SHIP_BOSS_ARCHETYPES)){
  const {world,enemy}=fixture(archetype),pilot=participant(enemy,500),events=[],hits=[];
  advance(world,.5,{participants:[pilot]});enemy.hp-=123;
  pilot.ship.x=enemy.bossState.originX+2400;
  advance(world,4,{participants:[pilot,{...participant(enemy,100,'parked','empty-ship'),parked:true}],onEvent:type=>events.push(type),onPlayerHit:(...args)=>hits.push(args)});
  assert.equal(world.bullets.length,0);assert.equal(hits.length,0);assert.equal(enemy.active,false);assert.equal(enemy.hp,enemy.maxHp-123);
  assert.equal(events.filter(type=>type==='ship-boss-disengaged').length,1);assert.deepEqual(bossMusicContext(world,pilot.vesselId),{bossEncounterKey:null,bossObserved:false});
 }
});

test('a destroyed boss never returns and carrier objectives cannot outlive the hull',()=>{
 const {world,enemy}=fixture('screen-carrier');enemy.hp=0;
 stepShipBosses(world,.1,{participants:[]});assert.ok(world.enemies.every(actor=>actor.hp===0));
 const saved=captureShipBosses(world),restored=fixture('screen-carrier',{shipBosses:saved});assert.equal(restored.world.enemies.length,0);
 const fromDefeat=fixture('screen-carrier',{defeated:[enemy.id]});assert.equal(fromDefeat.world.enemies.length,0);
});

test('boss scoring is limited to the currently engaged vessel and render warnings cannot mutate play',()=>{
 const {world,enemy}=fixture('ram-tug'),pilot=participant(enemy,500);
 assert.equal(bossMusicContext(world,pilot.vesselId).bossObserved,false);
 stepShipBosses(world,.1,{participants:[pilot]});assert.equal(bossMusicContext(world,pilot.vesselId).bossObserved,true);assert.equal(bossMusicContext(world,'distant-ship').bossObserved,false);
 const before=clone(world),labels=[];
 const ctx={save(){},restore(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},strokeRect(){}};
 drawShipBossTelegraphs(ctx,world,{to:(x,y)=>({x,y}),scale:.3,pixelRatio:1,reducedMotion:true,emit:text=>labels.push(text)});
 assert.deepEqual(world,before);assert.ok(labels.some(text=>text.includes('Move out of its path')));
});
