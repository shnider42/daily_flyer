import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,buildGalaxy} from '../dist/engine.mjs';
import {FACTIONS} from '../dist/content.mjs';
import {SHIP_CLASSES,STARTER_SHIP_IDS,getShipClass,starterShipChoices,advanceShip} from '../dist/fleet.mjs';
import {cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
import {FACTION_SUPERCAPITALS,factionSupercapitalPlan,installFactionSupercapitals,captureFactionSupercapitals,stepFactionSupercapitals,findFactionSupercapital,supercapitalTractorAnchor,supercapitalBrig,damageFactionSupercapital,factionSupercapitalHit,supercapitalHullHit,supercapitalTelegraphs} from '../dist/faction-supercapitals.mjs';
import {SUPERCAPITAL_VISUALS,drawFactionSupercapitalHull} from '../dist/faction-supercapital-art.mjs';
import {trafficHailDistance} from '../dist/peacekeeper.mjs';
import {advanceTraffic} from '../dist/traffic.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';

const seed='faction-flagships';
const worldFor=(systemId,record={})=>{const game=new Game(seed);game.state.systemId=systemId;game._loadSystem(systemId);const world={id:systemId,name:game.system.name,radius:game.system.radius,bodies:structuredClone(game.system.bodies),traffic:[],enemies:[],bullets:[]};installFactionSupercapitals(world,{seed,record});return world;};
const tick=(world,seconds,options={})=>{for(let n=0;n<Math.round(seconds*10);n++)stepFactionSupercapitals(world,.1,options);};
const participant=(actor,id='intruder',dx=1700)=>({id:`captain:${id}`,vesselId:id,ship:{id,x:actor.x+dx,y:actor.y+700,vx:0,vy:0,hull:100,radius:21}});

test('five original supercapital classes add real late commissions while ordinary starts remain unchanged',()=>{
 const classes=SHIP_CLASSES.filter(hull=>hull.supercapital);
 assert.equal(classes.length,5);assert.deepEqual(classes.map(hull=>hull.faction).sort(),FACTIONS.map(f=>f.id).sort());
 assert.deepEqual(STARTER_SHIP_IDS,['sparrow','kestrel','mule']);
 for(const options of [{},{startMode:'casual',startContext:'solo',casualCrewCount:99}])assert.ok(starterShipChoices(options).every(hull=>!hull.supercapital));
 for(const hull of classes){
  const game=withHull(new Game(`commission:${hull.id}`),'capital'),port=game.system.bodies.find(body=>body.id==='kettle');
  Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+40});assert.equal(game.dock(port.id).ok,true);
  game.state.credits=hull.cost;game.state.cargo.ore=hull.ore;assert.equal(game.buyShip(hull.id).ok,false);
  game.state.upgrades.fold_3=1;game._flag('ally_chosen');assert.equal(game.buyShip(hull.id).ok,true);
  assert.equal(game.state.credits,0);assert.equal(game.state.cargo.ore,0);assert.equal(game.state.ship.classId,hull.id);assert.equal(game.state.ship.berths,48);
  assert.ok(hull.stats.renderLength>=getShipClass('judicator').stats.renderLength*3.6);assert.ok(hull.stats.maxHull>getShipClass('judicator').stats.maxHull*5);
  const restored=Game.fromSave(game.save());assert.equal(restored.state.ship.classId,hull.id);assert.equal(restored.state.ship.berths,48);
 }
});

test('each faction has one stable actual traffic hull and new seeds can change its home anchorage',()=>{
 const catalog=new Set(buildGalaxy(seed).map(system=>system.id)),plan=factionSupercapitalPlan(seed);
 assert.deepEqual(plan,factionSupercapitalPlan(seed));assert.equal(plan.length,5);assert.equal(new Set(plan.map(row=>row.faction)).size,5);
 assert.ok(plan.every(row=>catalog.has(row.systemId)&&!['hearth','crosswind'].includes(row.systemId)));
 const variations=new Set(Array.from({length:8},(_,i)=>JSON.stringify(factionSupercapitalPlan(`seed${i}`))));assert.ok(variations.size>1);
 for(const row of plan){
  const world=worldFor(row.systemId),actor=findFactionSupercapital(world,row.faction);assert.ok(actor);assert.equal(actor.id,row.id);
  installFactionSupercapitals(world,{seed});assert.equal(world.traffic.filter(contact=>contact.id===row.id).length,1);
  assert.equal(world.enemies.length,0);assert.ok(actor.hp>0);assert.equal(actor.active,false);
  for(const body of world.bodies)assert.ok(trafficHailDistance(actor,{...body,radius:body.radius})>35,`${row.id} clears ${body.id}`);
  const pose={x:actor.x,y:actor.y,angle:actor.angle};advanceTraffic(world.traffic,15,{radius:world.radius});assert.deepEqual({x:actor.x,y:actor.y,angle:actor.angle},pose);
  tick(world,20,{participants:[participant(actor)]});assert.equal(world.bullets.length,0);assert.equal(actor.active,false,'Peaceful visitors never provoke fire.');
 }
});

test('the actual Sol flagship has an attached hangar, a distinct small brig and no arrival overlap',()=>{
 const world=worldFor('sol'),actor=findFactionSupercapital(world,'concord'),anchor=supercapitalTractorAnchor(actor),brig=supercapitalBrig(actor),earth=world.bodies.find(body=>body.id==='earth');
 assert.equal(actor.id,'sol:supercapital:concord');assert.equal(anchor.hostVesselId,actor.id);assert.equal(anchor.systemId,'sol');
 assert.ok(Math.hypot(anchor.x-earth.x,anchor.y-earth.y-640)<2200);assert.ok(trafficHailDistance(actor,{x:earth.x,y:earth.y+640,radius:21})>300);
 assert.equal(brig.hostVesselId,actor.id);assert.equal(brig.shipClass,'bastion');assert.equal(brig.kind,'brig');assert.equal(brig.cols*brig.rows,308);assert.notEqual(brig.id,'player-ship');
 for(const point of [brig.cell,brig.console,brig.medical,brig.release])assert.ok(point.x>24&&point.x<(brig.cols-1)*brig.tile&&point.y>24&&point.y<(brig.rows-1)*brig.tile);
 const prior={...anchor};actor.x+=100;actor.angle+=Math.PI/2;const moved=supercapitalTractorAnchor(actor);assert.notDeepEqual(moved,prior);assert.equal(moved.hostVesselId,actor.id);
});

test('shots contact the visible bow and rotated hull, while the foundry cradle remains empty space',()=>{
 const world=worldFor('sol'),actor=findFactionSupercapital(world,'concord');actor.x=actor.y=0;actor.angle=0;
 assert.equal(factionSupercapitalHit(actor,1400,0,1050,0),true,'The bow is outside the old circular combat radius.');
 assert.equal(factionSupercapitalHit(actor,0,500,0,600),false);
 actor.angle=Math.PI/2;assert.equal(factionSupercapitalHit(actor,0,1400,0,1050),true);assert.equal(factionSupercapitalHit(actor,1400,0,1050,0),false);
 const row=factionSupercapitalPlan(seed).find(row=>row.faction==='cinder'),foundry=findFactionSupercapital(worldFor(row.systemId),'cinder');foundry.x=foundry.y=foundry.angle=0;
 assert.equal(factionSupercapitalHit(foundry,1000,0,300,0),false,'A projectile can pass through the open recovery cradle.');
 assert.equal(factionSupercapitalHit(foundry,1000,230,300,230),true,'The adjacent recovery arm is a real target.');
});

test('a commissioned player supercapital exposes its actual bow and stern without becoming a faction traffic actor',()=>{
 const game=withHull(new Game('owned-supercapital-collision'),'capital'),port=game.system.bodies.find(body=>body.id==='kettle'),hull=getShipClass('bastion');
 Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+40});assert.equal(game.dock(port.id).ok,true);
 game.state.credits=hull.cost;game.state.cargo.ore=hull.ore;game.state.upgrades.fold_3=1;game._flag('ally_chosen');
 assert.equal(game.buyShip(hull.id).ok,true);assert.equal(game.launch().ok,true);
 const ship=game.state.ship;Object.assign(ship,{x:420,y:-135,angle:.7});
 const global=(x,y)=>({x:ship.x+Math.cos(ship.angle)*x-Math.sin(ship.angle)*y,y:ship.y+Math.sin(ship.angle)*x+Math.cos(ship.angle)*y});
 for(const [a,b] of [[[1400,0],[1050,0]],[[-1400,0],[-1050,0]]]){
  const from=global(...a),to=global(...b);
  assert.ok(Math.hypot(to.x-ship.x,to.y-ship.y)>ship.radius,'The hit is outside the old center circle.');
  assert.equal(supercapitalHullHit(ship,from.x,from.y,to.x,to.y),true);
  assert.equal(factionSupercapitalHit(ship,from.x,from.y,to.x,to.y),false,'Ownership does not create an NPC contact tag.');
 }
 assert.equal(supercapitalHullHit({...ship,classId:'sparrow'},0,0,100,0),false,'Existing hull collision rules are unchanged.');
 const from=global(1400,0),to=global(1050,0);ship.hull=0;
 assert.equal(supercapitalHullHit(ship,from.x,from.y,to.x,to.y),false);
});

test('confirmed damage consumes shield then hull, provokes only that vessel, and uses warned physical batteries',()=>{
 const world=worldFor('sol'),actor=findFactionSupercapital(world,'concord'),target=participant(actor),neighbor=participant(actor,'neutral',1650),events=[];
 const result=damageFactionSupercapital(actor,actor.maxShield+37,{sourceVesselId:target.vesselId});assert.equal(result.hullDamage,37);assert.equal(actor.shield,0);assert.equal(actor.hp,actor.maxHp-37);
 const options={participants:[target,neighbor,{...target}],onEvent:(type,event)=>events.push({type,...event})};
 tick(world,1.7,options);assert.equal(world.bullets.length,0);assert.equal(actor.supercapitalState.phase,'windup');assert.ok(Math.abs(actor.supercapitalState.clock-1.7)<1e-9);
 const lines=supercapitalTelegraphs(actor);assert.equal(lines.length,getShipClass(actor.classId).systems.pulseCount);assert.ok(lines.every(line=>line.targetVesselId===target.vesselId));
 tick(world,.3,options);assert.equal(world.bullets.length,lines.length);assert.ok(world.bullets.every(bullet=>bullet.targetVesselId===target.vesselId&&bullet.factionSupercapital&&bullet.damage>0));
 assert.equal(events.filter(event=>event.type==='supercapital-warning').length,1);assert.equal(events.filter(event=>event.type==='enemy-shot').length,1);
 target.ship.x=actor.x+5000;tick(world,.1,options);assert.equal(actor.active,false);assert.equal(actor.supercapitalState.phase,'idle');
});

test('flagship damage and the next attack survive reload exactly, and destroyed ships never return as live captors',()=>{
 const world=worldFor('sol'),actor=findFactionSupercapital(world,'concord'),target=participant(actor);damageFactionSupercapital(actor,53,{sourceVesselId:target.vesselId});tick(world,.7,{participants:[target]});
 const record={factionSupercapitals:captureFactionSupercapitals(world)},restored=worldFor('sol',record),saved=findFactionSupercapital(restored,'concord');
 assert.deepEqual(captureFactionSupercapitals(restored),record.factionSupercapitals);assert.deepEqual(supercapitalTelegraphs(saved),supercapitalTelegraphs(actor));
 tick(world,1.4,{participants:[target]});tick(restored,1.4,{participants:[target]});assert.deepEqual(restored.bullets,world.bullets);
 damageFactionSupercapital(saved,saved.hp+saved.shield+1,{sourceVesselId:target.vesselId});assert.equal(saved.hp,0);assert.equal(saved.hull,0);assert.equal(saved.destroyed,true);
 const dead=worldFor('sol',{factionSupercapitals:captureFactionSupercapitals(restored)}),wreck=findFactionSupercapital(dead,'concord');tick(dead,10,{participants:[target]});assert.equal(wreck.hp,0);assert.equal(wreck.active,false);assert.equal(dead.bullets.length,0);
});

test('working decks and equipment support forty-eight actual occupants without changing existing deck identities',()=>{
 for(const spec of FACTION_SUPERCAPITALS){const layout=cabinLayout(spec.classId),hull=getShipClass(spec.classId);assert.equal(layout.bunks.length,hull.berths);assert.ok(layout.cols*layout.rows<50000);
  for(const point of [layout.spawn,layout.archive,layout.manifest,...layout.bunks,...Object.values(layout.stations)])assert.ok(isCabinWalkable(layout,point.x,point.y));
  assert.ok(layout.rooms.some(room=>room.id==='brig'));assert.ok(layout.rooms.some(room=>room.id==='hangar'));assert.equal(hull.systems.pulseMuzzles.length,hull.systems.pulseCount);
  const initial={...hull.stats,classId:hull.id,x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,energy:100};const moved=advanceShip(initial,.1,{thrust:1,turn:1});assert.ok(moved.vx>0);assert.ok(moved.angularVelocity>0);assert.ok(moved.vx<advanceShip({...getShipClass('judicator').stats,...initial,classId:'judicator',thrustAcceleration:30,angularAcceleration:.22},.1,{thrust:1,turn:1}).vx);
 }
 assert.equal(cabinLayout('sparrow').revision,3);assert.equal(cabinLayout('sparrow').bunks.length,2);
});

test('the native render helpers draw five distinct giant hulls within their declared buffers',()=>{
 const signatures=[];for(const spec of FACTION_SUPERCAPITALS){const profile=SUPERCAPITAL_VISUALS[spec.classId],rects=[],context={fillStyle:'',fillRect(x,y,w,h){assert.ok(x>=-profile.length/2-7&&x+w<=profile.length/2+7&&y>=-profile.width/2-7&&y+h<=profile.width/2+7);rects.push([this.fillStyle,x,y,w,h]);}};
  assert.equal(drawFactionSupercapitalHull(context,{shipClass:spec.classId,color:spec.color,damage:.5}),true);assert.ok(rects.length>300);signatures.push(JSON.stringify(rects));assert.ok(profile.thrusters.length>=3);
 }assert.equal(new Set(signatures).size,5);
});
