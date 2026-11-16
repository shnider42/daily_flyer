import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { getShipClass } from '../dist/fleet.mjs';
import { systemBodyPosition } from '../dist/system-space.mjs';
import { bodyVisualRadius } from '../dist/world-types.mjs';
import { appendWarzoneSystem, nearestWarzoneFactions, CROSSWIND_ARRIVAL, WARZONE_FACTION_STYLE, WARZONE_HULL_TACTICS } from '../dist/warzone-content.mjs';
import { installWarzoneSpace, stepWarzoneSpace, captureWarzoneSpace, catchUpWarzoneSpace, warzoneSpaceView, notifyWarzoneDestroyed, recordWarzoneAggression, warzoneTargetLimit, WARZONE_SPACE_LIMITS, WARZONE_SPACE_VERSION } from '../dist/warzone-space.mjs';
import { SpaceRenderer, warzoneVesselPresentation } from '../dist/space-art.mjs';

function world(seed='crosswind-test',saved=null){
  const source=appendWarzoneSystem([])[0],runtime={...source,bodies:source.bodies.map((body,index)=>({...body,...systemBodyPosition(body,index,source.id),radius:body.kind==='planet'?145:88})),enemies:[],traffic:[]};
  installWarzoneSpace(runtime,{seed,saved});return runtime;
}
const run=(runtime,seconds,options={})=>{for(let i=0;i<Math.ceil(seconds/.1);i++)stepWarzoneSpace(runtime,Math.min(.1,seconds-i*.1),options);};
const player=(id,classId='sparrow',factionId=null)=>({id:`captain-${id}`,vesselId:id,factionId,hostileFactions:[],ship:{...getShipClass(classId).stats,id,classId,x:0,y:0,vx:0,vy:0,angle:0,hull:getShipClass(classId).stats.maxHull,shield:0},boardingEligible:false});
function freezeWaves(runtime){runtime.warzone.nextPhaseAt=1e9;for(const faction of runtime.warzone.factions)runtime.warzone.nextWaveAt[faction]=1e9;}

test('Crosswind is additive, has three distinct worlds, and uses the nearest authored territories',()=>{
  const galaxy=new Game('crosswind-chart').galaxy.filter(system=>system.id!=='crosswind'),before=JSON.stringify(galaxy),next=appendWarzoneSystem(galaxy),crosswind=next.at(-1);
  assert.equal(JSON.stringify(galaxy),before);assert.deepEqual(next.slice(0,-1),galaxy);assert.equal(next[0],galaxy[0]);
  assert.equal(appendWarzoneSystem(next),next,'reinstalling does not duplicate or reorder the chart');
  assert.equal(crosswind.bodies.filter(body=>body.kind==='planet').length,3);
  assert.equal(new Set(crosswind.bodies.filter(body=>body.kind==='planet').map(body=>body.planetTypeId)).size,3);
  assert.deepEqual(new Set(nearestWarzoneFactions(galaxy).map(side=>side.id)),new Set(['freewake','meridian']));
  assert.deepEqual(new Set(crosswind.warzoneNeighbours.map(side=>side.systemId)),new Set(['brindle','meridian']));
  const hearth=galaxy.find(system=>system.id==='hearth');assert.ok(Math.hypot(crosswind.gx-hearth.gx,crosswind.gy-hearth.gy)<=4.5);
  const polluted=[...galaxy,{id:'random-claim',faction:'cinder',gx:crosswind.gx,gy:crosswind.gy,authored:false}];
  assert.deepEqual(nearestWarzoneFactions(polluted),nearestWarzoneFactions(galaxy),'a scattered generated claim does not replace an authored neighboring power');
  const runtime=world(),relief=runtime.bodies.find(body=>body.kind==='station'),orsa=runtime.bodies.find(body=>body.id==='crosswind-orsa');
  const crossing=Math.hypot(relief.x-orsa.x,relief.y-orsa.y)-bodyVisualRadius(relief)-bodyVisualRadius(orsa);
  assert.ok(crossing>=420&&crossing<=850,`Third Light needs a short, clear surface-to-surface crossing to Orsa; measured ${crossing}`);
  assert.deepEqual(relief.stationGeography.anchorBodyIds,[orsa.id]);
  assert.ok(runtime.bodies.every(body=>Math.hypot(body.x-CROSSWIND_ARRIVAL.x,body.y-CROSSWIND_ARRIVAL.y)>body.radius+200));
});

test('each fleet starts with 28 real military hulls in four size groups and a medium picket',()=>{
  const runtime=world();assert.equal(runtime.enemies.length,56);
  for(const faction of runtime.warzone.factions){
    const ships=runtime.enemies.filter(ship=>ship.faction===faction);
    assert.equal(ships.length,28);
    assert.deepEqual(Object.fromEntries(['small','medium','large','massive'].map(size=>[size,ships.filter(ship=>ship.warzoneSize===size).length])),{small:12,medium:8,large:6,massive:2});
    assert.equal(ships.find(ship=>ship.warzonePicket).warzoneSize,'medium');
    for(const ship of ships){const hull=getShipClass(ship.classId);assert.equal(ship.radius,hull.stats.radius);assert.equal(ship.renderLength,hull.stats.renderLength);assert.equal(ship.berths,hull.berths);assert.equal(ship.boardable,hull.berths>=3);assert.equal(ship.reward,0);}
  }
  assert.ok(runtime.enemies.find(ship=>ship.classId==='judicator').renderLength>runtime.enemies.find(ship=>ship.classId==='sparrow').renderLength*7);
  assert.deepEqual(runtime.enemies.filter(ship=>ship.faction==='freewake'&&ship.warzoneSize==='massive').map(ship=>ship.classId),['capital','judicator']);
  assert.deepEqual(runtime.enemies.filter(ship=>ship.faction==='meridian'&&ship.warzoneSize==='massive').map(ship=>ship.classId),['ark','confluence']);
  const old={id:'crosswind',enemies:[{id:'random-raider'},{id:'claimed',capturedBy:'captain'},{id:'promoted',canonicalVesselId:'owned'}],traffic:[{id:'commuter'},{id:'occupied',capturedBy:'captain'}]};installWarzoneSpace(old);
  assert.ok(!old.enemies.some(ship=>ship.id==='random-raider'));assert.ok(old.enemies.some(ship=>ship.id==='claimed'));assert.ok(old.enemies.some(ship=>ship.id==='promoted'));assert.deepEqual(old.traffic.map(ship=>ship.id),['occupied']);
  const other={id:'hearth',enemies:[]};assert.equal(installWarzoneSpace(other),null);assert.deepEqual(other,{id:'hearth',enemies:[]});
});

test('the unattended battle inflicts actual losses, keeps replacing ships, and changes phase within bounded budgets',()=>{
  const runtime=world('crosswind-probe'),phases=new Set(),timings={freewake:[],meridian:[]};let hits=0,losses=0,maxShips=0,maxShots=0,maxEffects=0,maxFighters=0;
  for(let i=0;i<9000;i++){
    stepWarzoneSpace(runtime,.1,{onShipHit(ship,damage){assert.ok(damage>0&&ship.hp<ship.maxHp);hits++;},onShipDestroyed(){losses++;},onEvent(kind,event){if(kind==='warzone-reinforcement')timings[event.faction].push(runtime.warzone.clock);}});
    phases.add(runtime.warzone.phase);maxShips=Math.max(maxShips,runtime.enemies.length);maxShots=Math.max(maxShots,runtime.warzone.projectiles.length);maxEffects=Math.max(maxEffects,runtime.warzone.effects.length);
    maxFighters=Math.max(maxFighters,runtime.enemies.filter(ship=>['needle','kite'].includes(ship.classId)).length);
  }
  assert.ok(hits>200&&losses>15,`${hits} damaging hits and ${losses} hull losses`);assert.ok(phases.size>=3);
  assert.ok(maxShips<=WARZONE_SPACE_LIMITS.ships&&maxShots<=WARZONE_SPACE_LIMITS.projectiles&&maxEffects<=WARZONE_SPACE_LIMITS.effects);
  assert.ok(runtime.warzone.recentLosses.length<=WARZONE_SPACE_LIMITS.recentLosses);
  assert.ok(maxFighters>=8&&maxFighters<=WARZONE_SPACE_LIMITS.fighters,'visible sorties remain inside the fighter reserve and the total hull cap');
  for(const faction of runtime.warzone.factions){
    assert.ok(timings[faction].length>8);const intervals=timings[faction].slice(1).map((time,index)=>Math.round(time-timings[faction][index]));assert.ok(new Set(intervals).size>4);
    assert.ok(runtime.enemies.filter(ship=>ship.faction===faction).length>=18,'replacement traffic sustains fleet scale after a long visit');
  }
  assert.notDeepEqual(timings.freewake,timings.meridian,'factions do not arrive on a synchronized timer');
  assert.ok(JSON.stringify(captureWarzoneSpace(runtime)).length<65000,'fleet persistence stays compact without shot history');
});

test('destroying an entire side never ends the front and casualty callbacks are idempotent',()=>{
  const runtime=world();for(const ship of runtime.enemies.filter(ship=>ship.faction==='meridian')){assert.equal(notifyWarzoneDestroyed(runtime,ship,{byPlayer:true,sourceId:'crew-ship'}),true);assert.equal(notifyWarzoneDestroyed(runtime,ship),false);}
  stepWarzoneSpace(runtime,.1);assert.equal(runtime.enemies.filter(ship=>ship.faction==='meridian').length,0);assert.equal(runtime.warzone.casualties.meridian,28);
  run(runtime,78);assert.ok(runtime.enemies.filter(ship=>ship.faction==='meridian').length>=9);assert.ok(runtime.warzone.waves.meridian>0);
  assert.equal(new Set(runtime.warzone.effects.map(effect=>effect.id)).size,runtime.warzone.effects.length);
});

test('one mass casualty pass cannot double count hulls after the bounded recent-loss ring wraps',()=>{
  const runtime=world(),template=runtime.enemies[0];runtime.enemies=Array.from({length:80},(_,index)=>({...template,id:`crosswind:fleet:freewake:${index+100}`}));freezeWaves(runtime);
  for(const ship of runtime.enemies)notifyWarzoneDestroyed(runtime,ship);
  assert.equal(runtime.warzone.casualties.freewake,80);assert.equal(runtime.warzone.effects.length,48);assert.equal(new Set(runtime.warzone.effects.map(effect=>effect.id)).size,48);
  stepWarzoneSpace(runtime,.1);assert.equal(runtime.warzone.casualties.freewake,80);assert.equal(runtime.enemies.length,0);
});

test('restoring keeps live damage, schedules, RNG and monotonic IDs without refilling an empty roster',()=>{
  const runtime=world();run(runtime,18);runtime.enemies[0].hp=31;runtime.enemies[1].disabled=true;runtime.enemies[1].warzoneExitAt=runtime.warzone.clock+107;
  const saved=captureWarzoneSpace(runtime),restored=world('ignored-during-restore',JSON.parse(JSON.stringify(saved))),again=captureWarzoneSpace(restored);
  assert.deepEqual(again,saved);assert.equal(restored.warzone.projectiles.length,0,'transient pulses are not a growing save log');
  const empty=world('empty',{...saved,ships:[]});assert.equal(empty.enemies.length,0);run(empty,78);assert.ok(empty.enemies.length>0);assert.ok(empty.enemies.every(ship=>Number(ship.id.split(':').at(-1))>saved.serial));
  const clock=restored.warzone.clock;catchUpWarzoneSpace(restored,24*60*60);assert.ok(Math.abs(restored.warzone.clock-clock-WARZONE_SPACE_LIMITS.catchUpSeconds)<1e-6);
  const view=warzoneSpaceView(restored,{factionId:'freewake',hostileFactions:['meridian','made-up']});
  assert.equal(view.viewerFaction,'freewake');assert.deepEqual(view.hostileFactions,['meridian']);assert.ok(view.factions.every(faction=>Number.isInteger(faction.ships)));
  for(const key of ['rng','nextWaveAt','nextPhaseAt','nextBoardingAt','recentLosses','serial'])assert.equal(Object.hasOwn(view,key),false,key);
});

test('legacy fleets acquire faction hulls without resetting wounds, clocks, or occupied prizes',()=>{
  const original=world(),legacy=captureWarzoneSpace(original);legacy.version=1;legacy.clock=118;legacy.nextPhaseAt=180;
  delete legacy.carriers;delete legacy.fighterFlights;delete legacy.batteries;delete legacy.maneuvers;
  const carrier=legacy.ships.find(ship=>ship.faction==='meridian'&&ship.classId==='ark'),prize=legacy.ships.find(ship=>ship.faction==='meridian'&&ship.classId==='confluence');
  carrier.classId='capital';carrier.hp=Math.round(getShipClass('capital').stats.maxHull*1.28)*.37;
  prize.classId='judicator';prize.hp=287;prize.canonicalVesselId='occupied-capital';prize.capturedBy='captain';prize.deck={guardState:'retained'};
  const restored=world('ignored-legacy-seed',legacy),upgraded=restored.enemies.find(ship=>ship.id===carrier.id),occupied=restored.enemies.find(ship=>ship.id===prize.id);
  assert.equal(upgraded.classId,'ark');assert.ok(Math.abs(upgraded.hp/upgraded.maxHp-.37)<1e-12);
  assert.equal(occupied.classId,'judicator');assert.equal(occupied.hp,287);assert.equal(occupied.canonicalVesselId,'occupied-capital');assert.deepEqual(occupied.deck,{guardState:'retained'});
  assert.equal(restored.warzone.clock,118);assert.equal(restored.enemies.length,legacy.ships.length);assert.deepEqual(restored.enemies.map(ship=>ship.id),legacy.ships.map(ship=>ship.id));
  const saved=captureWarzoneSpace(restored);assert.equal(saved.version,WARZONE_SPACE_VERSION);assert.deepEqual(captureWarzoneSpace(world('reload-upgrade',saved)),saved);
});

test('fighters launch from physical faction hangars, recover, rearm, and survive a save between sorties',()=>{
  for(const [classId,fighterId]of[['capital','needle'],['ark','kite']]){
    const runtime=world(`hangar-${classId}`),carrier=runtime.enemies.find(ship=>ship.classId===classId);runtime.enemies=[carrier];runtime.bodies=[];
    Object.assign(carrier,{x:0,y:0,vx:0,vy:0,angle:0,warzoneAim:{x:0,y:0},cooldown:0});runtime.warzone.nextDecisionAt=1e9;runtime.warzone.carriers[carrier.id].nextLaunchAt=0;
    stepWarzoneSpace(runtime,.001);const wing=runtime.enemies.filter(ship=>ship!==carrier);assert.equal(wing.length,2,'the carrier launches a cohort instead of instantly filling space');
    for(const [index,fighter]of wing.entries()){
      const bay=WARZONE_HULL_TACTICS[classId].hangars[index];assert.equal(fighter.classId,fighterId);assert.ok(Math.hypot(fighter.x-bay.x,fighter.y-bay.y)<1);
      assert.equal(fighter.warzoneSortie.carrierId,carrier.id);assert.equal(fighter.warzoneSortie.phase,'launching');assert.equal(fighter.boardable,false);
    }
    const saved=captureWarzoneSpace(runtime),restored=world('hangar-restore',saved);assert.deepEqual(captureWarzoneSpace(restored),saved);freezeWaves(runtime);
    const recoveries=new Set(),launches=new Set(),phases=new Set();let sawRearm=false,max=0;
    for(let tick=0;tick<1600;tick++){
      stepWarzoneSpace(runtime,.1);max=Math.max(max,runtime.enemies.length);sawRearm||=carrier.warzoneCarrier.rearming>0;
      for(const fighter of runtime.enemies)if(fighter.warzoneSortie)phases.add(fighter.warzoneSortie.phase);
      for(const effect of runtime.warzone.effects){if(effect.kind==='fighter-recovery')recoveries.add(effect.id);if(effect.kind==='fighter-launch')launches.add(effect.id);}
      for(const [id,flight]of Object.entries(runtime.warzone.fighterFlights))assert.equal(runtime.warzone.carriers[flight.carrierId]?.slots[flight.slot]?.fighterId,id,'every deployed fighter has one real carrier slot');
    }
    assert.ok(phases.has('attack')&&phases.has('returning'));assert.ok(recoveries.size>=3&&launches.size>6,`${classId}: ${recoveries.size} recoveries and ${launches.size} launches`);
    assert.ok(sawRearm);assert.ok(max<=1+WARZONE_HULL_TACTICS[classId].fighterCapacity);assert.equal(runtime.warzone.casualties[carrier.faction],0,'recovery is not counted as a casualty');
  }
});

test('captured or lost carriers stop launching and their fighters rehome or withdraw without orphan links',()=>{
  const runtime=world(),carrier=runtime.enemies.find(ship=>ship.classId==='capital'),fallback=runtime.enemies.find(ship=>ship.classId==='judicator');runtime.enemies=[carrier,fallback];runtime.bodies=[];freezeWaves(runtime);
  runtime.warzone.nextDecisionAt=1e9;runtime.warzone.carriers[carrier.id].nextLaunchAt=0;runtime.warzone.carriers[fallback.id].nextLaunchAt=1e9;
  stepWarzoneSpace(runtime,.01);const wing=runtime.enemies.filter(ship=>ship.classId==='needle');assert.equal(wing.length,2);
  carrier.canonicalVesselId='player-prize';carrier.capturedBy='captain';stepWarzoneSpace(runtime,.01);
  assert.equal(runtime.warzone.carriers[carrier.id],undefined);assert.equal(carrier.warzoneCarrier,undefined);
  for(const fighter of wing){assert.equal(fighter.warzoneSortie.carrierId,fallback.id);assert.equal(fighter.warzoneSortie.phase,'returning');}
  notifyWarzoneDestroyed(runtime,fallback);stepWarzoneSpace(runtime,.01);
  for(const fighter of wing){assert.equal(fighter.warzoneSortie.carrierId,null);assert.equal(fighter.warzoneSortie.phase,'disengaging');}
  run(runtime,46);assert.deepEqual(Object.keys(runtime.warzone.carriers),[]);assert.deepEqual(Object.keys(runtime.warzone.fighterFlights),[]);
  assert.deepEqual(runtime.enemies.map(ship=>ship.id),[carrier.id],'the canonical prize remains while unhomed NPC wings leave');
});

test('cannon banks fire from their own hull tips and require a real broadside turn',()=>{
  const prepare=(x,y)=>{
    const runtime=world(),ship=runtime.enemies.find(ship=>ship.classId==='judicator'),target=runtime.enemies.find(ship=>ship.classId==='confluence');runtime.enemies=[ship,target];runtime.bodies=[];freezeWaves(runtime);runtime.warzone.nextDecisionAt=1e9;
    Object.assign(ship,{x:0,y:0,vx:0,vy:0,angle:0,cooldown:0,targetId:target.id,targetVesselId:target.id,warzoneTargetKind:'fleet',warzoneAim:{x:0,y:0}});
    Object.assign(target,{x,y,vx:0,vy:0,angle:0,cooldown:1000,warzoneAim:{x,y}});
    for(const state of Object.values(runtime.warzone.batteries[ship.id]))Object.assign(state,{readyAt:0,nextAt:0,cursor:0});
    for(const state of Object.values(runtime.warzone.carriers))state.nextLaunchAt=1e9;
    return{runtime,ship,target};
  };
  const broadside=prepare(0,900);stepWarzoneSpace(broadside.runtime,.001);
  const first=broadside.runtime.warzone.projectiles.find(shot=>shot.ownerId===broadside.ship.id);assert.ok(first);assert.equal(first.bankId,'starboard');assert.equal(first.kind,'cannon');
  const mount=WARZONE_HULL_TACTICS.judicator.batteries.find(bank=>bank.id==='starboard').muzzles[0],ship=broadside.ship;
  assert.ok(Math.abs(first.sourceX-(ship.x+Math.cos(ship.angle)*mount[0]-Math.sin(ship.angle)*mount[1]))<1e-8);
  assert.ok(Math.abs(first.sourceY-(ship.y+Math.sin(ship.angle)*mount[0]+Math.cos(ship.angle)*mount[1]))<1e-8);
  assert.equal(ship.lastShot.muzzles[0].mountId,first.mountId);assert.equal(ship.lastShot.muzzles[0].x,first.sourceX);
  run(broadside.runtime,.7);const volley=broadside.runtime.warzone.projectiles.filter(shot=>shot.ownerId===ship.id);
  assert.deepEqual(new Set(volley.map(shot=>shot.mountId)),new Set(['starboard:0','starboard:1','starboard:2','starboard:3']));
  assert.ok(broadside.runtime.warzone.batteries[ship.id].starboard.readyAt>broadside.runtime.warzone.clock);assert.equal(broadside.runtime.warzone.batteries[ship.id].port.readyAt,0,'the unused bank has an independent cycle');
  const bow=prepare(900,0),hp=bow.target.hp;stepWarzoneSpace(bow.runtime,.001);assert.ok(!bow.runtime.warzone.projectiles.some(shot=>shot.ownerId===bow.ship.id),'there is no invisible all-direction nose cannon');
  run(bow.runtime,14);assert.ok(Math.abs(bow.ship.angle)>.6,'the capital physically turns to present a cannon bank');assert.ok(bow.target.hp<hp,'aligned batteries then damage the opposing real hull');
});

test('carrier fighters make forward firing passes and break away before returning to attack',()=>{
  const runtime=world(),carrier=runtime.enemies.find(ship=>ship.classId==='capital'),target=runtime.enemies.find(ship=>ship.faction==='meridian'&&ship.classId==='marten');runtime.enemies=[carrier,target];runtime.bodies=[];freezeWaves(runtime);
  runtime.warzone.nextDecisionAt=1e9;runtime.warzone.carriers[carrier.id].nextLaunchAt=0;Object.assign(carrier,{x:-2200,y:0,cooldown:1000,warzoneAim:{x:-2200,y:0}});stepWarzoneSpace(runtime,.001);
  const fighter=runtime.enemies.find(ship=>ship.classId==='needle');runtime.enemies=[carrier,target,fighter];runtime.warzone.carriers[carrier.id].nextLaunchAt=1e9;
  Object.assign(fighter,{x:-450,y:0,vx:180,vy:0,angle:0,cooldown:0,targetId:target.id,targetVesselId:target.id,warzoneTargetKind:'fleet'});runtime.warzone.fighterFlights[fighter.id].phase='attack';
  Object.assign(target,{x:0,y:0,vx:0,vy:0,angle:0,cooldown:1000,warzoneAim:{x:0,y:0}});for(const bank of Object.values(runtime.warzone.batteries[fighter.id])){bank.readyAt=0;bank.nextAt=0;}
  const phases=new Set(),shots=new Set();let passed=false;
  for(let tick=0;tick<180;tick++){
    stepWarzoneSpace(runtime,.1);phases.add(runtime.warzone.maneuvers[fighter.id]?.phase);passed||=fighter.x>target.x+120;
    for(const shot of runtime.warzone.projectiles.filter(shot=>shot.ownerId===fighter.id&&!shots.has(shot.id))){shots.add(shot.id);const offset=Math.atan2(Math.sin(Math.atan2(shot.vy,shot.vx)-fighter.angle),Math.cos(Math.atan2(shot.vy,shot.vx)-fighter.angle));assert.ok(Math.abs(offset)<.28,'fighter guns cannot swivel behind its cockpit');}
  }
  assert.ok(shots.size>0);assert.ok(passed&&phases.has('pass')&&phases.has('break'));assert.ok(target.hp<target.maxHp);
});

test('one vessel counts once, neutral ships are ignored, and large hulls attract more of a bounded hostile response',()=>{
  const runtime=world();freezeWaves(runtime);runtime.bodies=[];
  for(const [i,ship]of runtime.enemies.entries()){ship.x=ship.faction==='freewake'?-2000:200;ship.y=(i%7)*10;ship.cooldown=1000;}
  const small=player('small','sparrow','freewake'),large=player('large','judicator','freewake'),neutral=player('neutral','capital');small.ship.x=large.ship.x=neutral.ship.x=200;
  const passenger={...large,id:'same-ship-crew'};stepWarzoneSpace(runtime,.01,{participants:[small,large,neutral,passenger]});
  const assignments=runtime.enemies.filter(ship=>ship.warzoneTargetKind==='player'),smallCount=assignments.filter(ship=>ship.targetVesselId==='small').length,largeCount=assignments.filter(ship=>ship.targetVesselId==='large').length;
  assert.equal(smallCount,2);assert.equal(largeCount,7);assert.ok(assignments.length<=Math.floor(runtime.enemies.length*.28));
  assert.ok(assignments.every(ship=>ship.faction==='meridian'));assert.ok(!assignments.some(ship=>ship.targetVesselId==='neutral'));
  assert.equal(warzoneTargetLimit(small.ship),2);assert.equal(warzoneTargetLimit(large.ship),7);
  const target=runtime.enemies.find(ship=>ship.faction==='freewake');assert.deepEqual(recordWarzoneAggression(runtime,neutral,target),{factionId:'freewake',targetId:target.id});assert.equal(target.warzoneProvokedBy,'neutral');
  neutral.hostileFactions=['freewake'];runtime.warzone.nextDecisionAt=0;neutral.ship.x=-2000;stepWarzoneSpace(runtime,.01,{participants:[neutral]});assert.ok(runtime.enemies.some(ship=>ship.targetVesselId==='neutral'&&ship.faction==='freewake'));
});

test('swept military pulses damage actual hulls and route captain damage through its authority callback',()=>{
  const runtime=world();freezeWaves(runtime);runtime.bodies=[];const target=runtime.enemies.find(ship=>ship.faction==='meridian');runtime.enemies=[target];Object.assign(target,{x:80,y:0,disabled:true,hp:10,cooldown:100});
  const pulse=(faction='freewake')=>({id:'test-pulse',x:0,y:0,vx:800,vy:0,ttl:2,radius:3,damage:30,ownerId:'gun',vesselId:'gun',faction});
  runtime.warzone.projectiles=[pulse()];let destroyed=0,afterHit=null;stepWarzoneSpace(runtime,.1,{onShipHit(ship,amount){afterHit={hp:ship.hp,amount};},onShipDestroyed(){destroyed++;}});
  assert.deepEqual(afterHit,{hp:0,amount:10});assert.equal(destroyed,1);assert.equal(runtime.warzone.casualties.meridian,1);assert.equal(runtime.enemies.length,0);
  const captain=player('crew','marten');captain.ship.x=80;let captainHits=0;runtime.warzone.projectiles=[pulse('meridian')];stepWarzoneSpace(runtime,.1,{participants:[captain],onPlayerHit(participant,amount,details){assert.equal(participant.vesselId,'crew');assert.equal(amount,30);assert.equal(details.faction,'meridian');captainHits++;}});
  assert.equal(captainHits,1);assert.equal(captain.ship.hull,captain.ship.maxHull,'the callback owns captain shield/hull damage exactly once');
  captain.factionId='meridian';runtime.warzone.projectiles=[pulse('meridian')];stepWarzoneSpace(runtime,.1,{participants:[captain],onPlayerHit(){captainHits++;}});assert.equal(captainHits,1);
});

test('enemy boarding requires rare opportunity, exposed shields, a real cabin, and a cancelable grapple',()=>{
  const runtime=world(),enemy=runtime.enemies.find(ship=>ship.faction==='meridian'&&ship.classId==='marten'),captain=player('crew','marten','freewake');runtime.enemies=[enemy];runtime.bodies=[];freezeWaves(runtime);captain.boardingEligible=true;
  let warnings=0,started=0;const options={participants:[captain],onEvent(kind){if(kind==='boarding-warning')warnings++;},onBoarding(){started++;return true;}};
  const ready=seed=>{runtime.warzone.rng=seed;runtime.warzone.nextBoardingAt=0;runtime.warzone.nextDecisionAt=1e9;enemy.x=0;enemy.y=0;enemy.vx=enemy.vy=0;enemy.warzoneAim={x:0,y:0};enemy.boardingCooldown=0;enemy.cooldown=1000;delete enemy.warzoneBoarding;};
  for(let seed=0;seed<200;seed++){ready(seed);stepWarzoneSpace(runtime,.001,options);}
  assert.ok(warnings>5&&warnings<60,`opportunities happened ${warnings}/200 times, not on every eligibility check`);assert.equal(started,0,'the warning is followed by a four-second grapple');
  const before=warnings;captain.ship.shield=captain.ship.maxShield;for(let seed=0;seed<100;seed++){ready(seed);stepWarzoneSpace(runtime,.001,options);}assert.equal(warnings,before);
  captain.ship.shield=0;for(let seed=0;seed<200&&!enemy.warzoneBoarding;seed++){ready(seed);stepWarzoneSpace(runtime,.001,options);}assert.ok(enemy.warzoneBoarding);
  captain.ship.x=1000;stepWarzoneSpace(runtime,.01,options);assert.equal(enemy.warzoneBoarding,undefined);assert.equal(started,0,'boosting away cancels the grapple');
  captain.ship.x=0;for(let seed=0;seed<200&&!enemy.warzoneBoarding;seed++){ready(seed);stepWarzoneSpace(runtime,.001,options);}assert.ok(enemy.warzoneBoarding);
  for(let tick=0;tick<42;tick++){enemy.x=0;enemy.y=0;stepWarzoneSpace(runtime,.1,options);}
  assert.equal(started,1);assert.ok(enemy.boardingCooldown>299);assert.equal(enemy.warzoneBoarding,undefined);
});

test('a boarded or captured disabled hull is not towed out from under its crew',()=>{
  const runtime=world();freezeWaves(runtime);const [boarded,captured,abandoned]=runtime.enemies;runtime.enemies=[boarded,captured,abandoned];
  for(const ship of runtime.enemies){ship.disabled=true;ship.warzoneExitAt=1;}
  boarded.boardingTargetId='active-encounter';captured.capturedBy='captain';run(runtime,2);
  assert.ok(runtime.enemies.includes(boarded));assert.ok(runtime.enemies.includes(captured));assert.ok(!runtime.enemies.includes(abandoned));
});

class Canvas{
  constructor(width,height){this.width=width;this.height=height;this.ctx=new Context(this);}getContext(){return this.ctx;}
}
class Context{
  constructor(canvas){this.canvas=canvas;this.fills=[];this.images=0;}save(){}restore(){}translate(){}rotate(){}scale(){}clearRect(){}strokeRect(){}setLineDash(){}fillText(){}measureText(text){return{width:String(text).length*6};}
  drawImage(){this.images++;}fillRect(x,y,w,h){assert.ok([x,y,w,h].every(Number.isFinite));this.fills.push({color:this.fillStyle,x,y,w,h});}
}
test('the renderer draws distinct fleet markings, bounds combat labels, and consumes sanitized observations',()=>{
  const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=Canvas;
  try{
    const runtime=world();run(runtime,12);runtime.bodies=[];const captain=player('render','sparrow','freewake'),view=warzoneSpaceView(runtime,captain),game={state:{systemId:'crosswind',ship:captain.ship,stats:{time:12}},system:{...runtime,warzone:view}};
    const ctx=new Canvas(1000,700).ctx,labels=[],renderer=new SpaceRenderer(),before=JSON.stringify(game);
    renderer.draw(ctx,game,{zoom:.18,zoomMultiplier:.25,time:12,motion:false,labels});assert.equal(JSON.stringify(game),before);
    assert.ok(labels.filter(label=>label.kind==='fleet-contact').length<=6);assert.ok(labels.some(label=>label.kind==='fleet-contact'));
    for(const faction of ['freewake','meridian'])assert.ok(ctx.fills.some(fill=>fill.color===WARZONE_FACTION_STYLE[faction].color),`${faction} has visible markings`);
    assert.notEqual(warzoneVesselPresentation({faction:'freewake'},view).stripe,warzoneVesselPresentation({faction:'meridian'},view).stripe);
    assert.equal(warzoneVesselPresentation({faction:'freewake'},view).hostile,false);assert.equal(warzoneVesselPresentation({faction:'meridian'},view).hostile,true);
    assert.equal(warzoneVesselPresentation({faction:'meridian'},{viewerFaction:null}).hostile,false);
    game.system.enemies=[];renderer.draw(ctx,game,{zoom:.18,zoomMultiplier:.25,time:12.1,motion:false,labels:[]});assert.ok(renderer.health.size<=1,'lost hull IDs do not grow a render history forever');
  }finally{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;}
});
