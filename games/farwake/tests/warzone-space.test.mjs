import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.mjs';
import { getShipClass } from '../dist/fleet.mjs';
import { systemBodyPosition } from '../dist/system-space.mjs';
import { bodyVisualRadius } from '../dist/world-types.mjs';
import { appendWarzoneSystem, nearestWarzoneFactions, CROSSWIND_ARRIVAL, WARZONE_FACTION_STYLE } from '../dist/warzone-content.mjs';
import { installWarzoneSpace, stepWarzoneSpace, captureWarzoneSpace, catchUpWarzoneSpace, warzoneSpaceView, notifyWarzoneDestroyed, recordWarzoneAggression, warzoneTargetLimit, WARZONE_SPACE_LIMITS } from '../dist/warzone-space.mjs';
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
  const old={id:'crosswind',enemies:[{id:'random-raider'},{id:'claimed',capturedBy:'captain'},{id:'promoted',canonicalVesselId:'owned'}],traffic:[{id:'commuter'},{id:'occupied',capturedBy:'captain'}]};installWarzoneSpace(old);
  assert.ok(!old.enemies.some(ship=>ship.id==='random-raider'));assert.ok(old.enemies.some(ship=>ship.id==='claimed'));assert.ok(old.enemies.some(ship=>ship.id==='promoted'));assert.deepEqual(old.traffic.map(ship=>ship.id),['occupied']);
  const other={id:'hearth',enemies:[]};assert.equal(installWarzoneSpace(other),null);assert.deepEqual(other,{id:'hearth',enemies:[]});
});

test('the unattended battle inflicts actual losses, keeps replacing ships, and changes phase within bounded budgets',()=>{
  const runtime=world('crosswind-probe'),phases=new Set(),timings={freewake:[],meridian:[]};let hits=0,losses=0,maxShips=0,maxShots=0,maxEffects=0;
  for(let i=0;i<9000;i++){
    stepWarzoneSpace(runtime,.1,{onShipHit(ship,damage){assert.ok(damage>0&&ship.hp<ship.maxHp);hits++;},onShipDestroyed(){losses++;},onEvent(kind,event){if(kind==='warzone-reinforcement')timings[event.faction].push(runtime.warzone.clock);}});
    phases.add(runtime.warzone.phase);maxShips=Math.max(maxShips,runtime.enemies.length);maxShots=Math.max(maxShots,runtime.warzone.projectiles.length);maxEffects=Math.max(maxEffects,runtime.warzone.effects.length);
  }
  assert.ok(hits>200&&losses>15,`${hits} damaging hits and ${losses} hull losses`);assert.ok(phases.size>=3);
  assert.ok(maxShips<=WARZONE_SPACE_LIMITS.ships&&maxShots<=WARZONE_SPACE_LIMITS.projectiles&&maxEffects<=WARZONE_SPACE_LIMITS.effects);
  assert.ok(runtime.warzone.recentLosses.length<=WARZONE_SPACE_LIMITS.recentLosses);
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
