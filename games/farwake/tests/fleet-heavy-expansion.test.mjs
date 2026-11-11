import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.mjs';
import {getShipClass,SHIP_CLASSES,STARTER_SHIP_IDS,normalizeStarterShip,advanceShip,enemyHullProfile,enemyShipState} from '../dist/fleet.mjs';
import {getHullSystems} from '../dist/hull-systems.mjs';
import {cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {drawShip,SHIP_VISUALS,SpaceRenderer} from '../dist/space-art.mjs';
import {withHull} from './helpers/fleet-fixtures.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const launches=['lark','puffin','osprey'],heavy=['leviathan','judicator'],added=[...launches,...heavy];
const ok=result=>assert.equal(result.ok,true,result.reason);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function vessel(id){const game=withHull(new Game('new-hull-'+id),id);Object.assign(game.state.ship,{x:0,y:500,vx:0,vy:0,angle:0,angularVelocity:0,energy:80});game.system.enemies=[];return game;}
function dock(game){const port=game.system.bodies.find(body=>body.id==='kettle');Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+60});ok(game.dock(port.id));}

test('exactly five additional hulls provide crew space without expanding ordinary solo starts or granting drive progress',()=>{
 assert.equal(SHIP_CLASSES.filter(hull=>added.includes(hull.id)).length,5);
 assert.deepEqual(STARTER_SHIP_IDS,['sparrow','kestrel','mule']);
 for(const [index,id] of launches.entries()){
  const hull=getShipClass(id),game=new Game('modest-'+id),flags=[...game.state.flags],upgrades={...game.state.upgrades};
  assert.equal(hull.berths,[4,7,10][index]);assert.equal(hull.crewLaunchMinPlayers,[2,4,7][index]);
  assert.equal(hull.starter,undefined);assert.equal(normalizeStarterShip(id),'sparrow');
  assert.equal(hull.systems.pulseCount,1);assert.ok(hull.stats.damage<=getShipClass('sparrow').stats.damage);
  withHull(game,id);assert.deepEqual(game.state.flags,flags);assert.deepEqual(game.state.upgrades,upgrades);
  assert.equal(game.state.ship.warpRange,0);assert.equal(game.travelInfo('vesper').code,'hyperdrive');
 }
});

test('all five hulls have real paid acquisition paths and heavy ships require earned predecessors and expedition progress',()=>{
 for(const id of added){
  const hull=getShipClass(id),game=vessel(hull.requiresClass||'mule');dock(game);game.state.credits=40000;game.state.cargo.ore=hull.ore;
  if(heavy.includes(id)){
   assert.equal(game.classInfo(id).code,'prerequisite');game.state.upgrades.fold_3=1;
   assert.equal(game.classInfo(id).code,'story');game.state.flags.push('ally_chosen');
   const withoutPredecessor=game.state.fleet.owned.filter(owned=>owned!==hull.requiresClass);const owned=game.state.fleet.owned;
   game.state.fleet.owned=withoutPredecessor;assert.equal(game.classInfo(id).code,'prerequisite');game.state.fleet.owned=owned;
  }
  assert.ok(hull.ore<=hull.stats.cargoCap,'A commission must be physically possible with the ore carried into its new hold.');
  const before=game.state.credits;ok(game.classInfo(id));ok(game.buyShip(id));
  assert.equal(game.state.credits,before-hull.cost);assert.equal(game.state.cargo.ore,0);
  assert.equal(game.state.ship.classId,id);assert.equal(game.state.ship.berths,hull.berths);
  const restored=Game.fromSave(game.serialize());assert.equal(restored.state.ship.classId,id);assert.ok(restored.state.fleet.owned.includes(id));
  const capture=enemyShipState({id:'prize',...enemyHullProfile(id),hp:40,maxHp:100,disabled:true});
  assert.equal(capture.classId,id);assert.equal(capture.berths,hull.berths);near(capture.hull,hull.stats.maxHull*.4);
 }
});

test('launch service equipment changes real repair, treatment and reactor outcomes at ordinary beginning strength',()=>{
 const lark=vessel('lark');lark.state.ship.hull-=30;lark.state.person.health=40;ok(lark.enterCabin());
 let before=lark.state.ship.energy;ok(lark.repairFromStation());near(lark.state.ship.energy,before-14);near(lark.state.ship.hull,lark.state.ship.maxHull-22);
 before=lark.state.ship.energy;ok(lark.medicalFromStation());near(lark.state.ship.energy,before-12);assert.equal(lark.state.person.health,52);
 const puffin=vessel('puffin');puffin.state.ship.shield=10;puffin._hitTimer=0;puffin.stepPilot(.1,{});
 near(puffin.state.ship.energy,81.5);near(puffin.state.ship.shield,10.3);puffin.state.person.health=40;
 puffin.state.crew=[{id:'injured',name:'Mara',role:'engineer',health:20,maxHealth:100,status:'injured'}];ok(puffin.enterCabin());ok(puffin.medicalFromStation());
 assert.equal(puffin.state.person.health,54);assert.equal(puffin.state.crew[0].health,30);
 const osprey=vessel('osprey');osprey.state.ship.hull-=30;ok(osprey.enterCabin());before=osprey.state.ship.energy;ok(osprey.repairFromStation());
 near(osprey.state.ship.hull,osprey.state.ship.maxHull-20);near(osprey.state.ship.energy,before-18);assert.equal(osprey.shipClass.systems.damageControlMultiplier,1.15);
});

test('the heavy tender repairs and retrieves salvage beyond ordinary working hulls without gaining a free remote repair power',()=>{
 const tender=vessel('leviathan'),barge=vessel('cairn');
 for(const game of [tender,barge]){game.system.asteroids=[{id:'distant-rock',x:440,y:500,radius:12,hp:1,ore:4,crystal:0}];game._mine(.1);game.system.pickups=[{id:'salvage',x:375,y:500,ore:2,crystal:0,credits:0}];game._updatePickups(.1,[game]);}
 assert.equal(tender.state.cargo.ore,4);assert.equal(barge.state.cargo.ore,0);assert.ok(tender.system.pickups[0].x<375);assert.equal(barge.system.pickups[0].x,375);
 tender.system.pickups[0].x=410;ok(tender.salvage('salvage'));assert.equal(tender.state.cargo.ore,6);
 tender.state.ship.hull-=100;const before=tender.state.ship.energy;ok(tender.enterCabin());ok(tender.repairFromStation());
 near(tender.state.ship.hull,tender.state.ship.maxHull-78);near(tender.state.ship.energy,before-28);assert.equal(tender._repairTimer,5);assert.equal(tender.repairFromStation().code,'cooldown');
 assert.match(tender.shipClass.systems.tradeoff,/own hull/);
});

test('Judicator batteries have immutable physical mounts inside their wedge and fire attributed, charge-limited volleys',()=>{
 const hull=getShipClass('judicator'),equipment=hull.systems,layout=cabinLayout(hull.id),game=vessel(hull.id);
 assert.equal(equipment.pulseMuzzles.length,4);assert.ok(Object.isFrozen(equipment.pulseMuzzles));
 for(const point of equipment.pulseMuzzles){
  assert.ok(Object.isFrozen(point));const [x,y]=point;
  const tileX=2+(y+hull.stats.renderWidth/2)/hull.stats.renderWidth*(layout.cols-4),tileY=2+(hull.stats.renderLength/2-x)/hull.stats.renderLength*(layout.rows-4);
  assert.equal(layout.hullMask[Math.floor(tileY)*layout.cols+Math.floor(tileX)],1,'Every barrel is attached to the actual pressure-hull silhouette.');
 }
 game.state.ship.angle=.31;const angle=game.state.ship.angle,before=game.state.ship.energy;game.drainEvents();ok(game.fireWeapons('crew-gunner'));
 const shots=game.system.bullets;assert.equal(shots.length,4);assert.equal(new Set(shots.map(shot=>shot.id)).size,4);
 for(const [index,shot] of shots.entries()){
  const [forward,side]=equipment.pulseMuzzles[index];near(shot.x,Math.cos(angle)*forward-Math.sin(angle)*side);near(shot.y,500+Math.sin(angle)*forward+Math.cos(angle)*side);
  assert.equal(shot.ownerId,'crew-gunner');assert.equal(shot.vesselId,game.state.ship.id);near(shot.damage,hull.stats.damage*.38);
 }
 near(game.state.ship.energy,before-22);near(game._shotTimer,.75);assert.equal(game.drainEvents().filter(event=>event.type==='shot').length,1);
 assert.equal(game.fireWeapons().code,'cooldown');game._shotTimer=0;game.state.ship.energy=21;assert.equal(game.fireWeapons().code,'energy');
});

test('a hostile line destroyer uses the same physical battery origins instead of floating guns beside its bow',()=>{
 const game=vessel('sparrow'),enemy=placeRaider(game,{classId:'judicator',x:300,y:500,cooldown:0,active:true,damage:20});
 game._updateEnemies(.01,[game]);const shots=game.system.bullets.filter(shot=>shot.vesselId===enemy.id);assert.equal(shots.length,4);
 const angle=enemy.angle;
 for(const [index,shot] of shots.entries()){const [forward,side]=getHullSystems('judicator').pulseMuzzles[index];near(shot.x,enemy.x+Math.cos(angle)*forward-Math.sin(angle)*side);near(shot.y,enemy.y+Math.sin(angle)*forward+Math.cos(angle)*side);near(shot.damage,7.6);}
});

test('the monumental hulls have tangible acceleration, steering and cargo tradeoffs',()=>{
 const integrate=id=>{const hull=getShipClass(id);let ship={...hull.stats,classId:id,x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0,energy:100};for(let frame=0;frame<120;frame++)ship=advanceShip(ship,1/60,{thrust:1,turn:1,flightAssist:false});return ship;};
 const light=integrate('osprey'),tender=integrate('leviathan'),destroyer=integrate('judicator');
 assert.ok(Math.hypot(light.vx,light.vy)>Math.hypot(tender.vx,tender.vy));assert.ok(Math.hypot(tender.vx,tender.vy)>Math.hypot(destroyer.vx,destroyer.vy));
 assert.ok(Math.abs(light.angularVelocity)>Math.abs(tender.angularVelocity));assert.ok(Math.abs(tender.angularVelocity)>Math.abs(destroyer.angularVelocity));
 assert.ok(getShipClass('judicator').stats.cargoCap<getShipClass('capital').stats.cargoCap);assert.ok(getShipClass('leviathan').stats.cargoCap>getShipClass('cairn').stats.cargoCap);
});

test('large decks offer a real reachable bunk and distinct standing place for every crew member',()=>{
 for(const id of added){
  const hull=getShipClass(id),layout=cabinLayout(id);assert.equal(layout.bunks.length,hull.berths);assert.equal(new Set(layout.bunks.map(point=>`${point.x}:${point.y}`)).size,hull.berths);
  assert.ok(layout.crewSpawns.length>=hull.berths);assert.equal(new Set(layout.crewSpawns.map(point=>`${point.x}:${point.y}`)).size,layout.crewSpawns.length);
  for(const point of [...layout.bunks,...layout.crewSpawns,...Object.values(layout.stations)])assert.ok(isCabinWalkable(layout,point.x,point.y));
  const crew=Array.from({length:hull.berths-1},(_,i)=>({id:`crew-${i}`,name:`Crew ${i}`,role:'engineer',health:100,species:i%7?'human':'oru'}));
  const surface=generateSurface({id:'full-'+id,vesselId:'full-'+id,kind:'ship',shipClass:id,crew},'large-interior');
  const actors=surface.entities.filter(entity=>entity.type==='crew');assert.equal(actors.length,hull.berths-1);assert.equal(new Set(actors.map(point=>`${point.x}:${point.y}`)).size,actors.length);
  assert.equal(surface.entities.filter(entity=>entity.type==='bunk').length,hull.berths);assert.equal(actors[0].species,'oru');
 }
 const tender=cabinLayout('leviathan'),center=Math.floor(tender.cols/2),fore=Math.round(tender.rows*.2);
 assert.equal(tender.hullMask[fore*tender.cols+center],0);assert.equal(tender.walkable[fore*tender.cols+center],0);
 assert.ok(cabinLayout('judicator').floor.filter(Boolean).length>cabinLayout('capital').floor.filter(Boolean).length*2);
});

class CaptureCanvas{constructor(width,height){this.width=width;this.height=height;this.ctx=new CaptureContext(this);}getContext(){return this.ctx;}}
class CaptureContext{
 constructor(canvas){this.canvas=canvas;this.images=[];this.fills=[];this.x=0;this.y=0;this.stack=[];}
 save(){this.stack.push([this.x,this.y]);}restore(){[this.x,this.y]=this.stack.pop()||[0,0];}rotate(){}scale(){}clearRect(){}setTransform(){this.x=0;this.y=0;}measureText(text){return{width:text.length*7};}fillText(){}
 translate(x,y){this.x+=x;this.y+=y;}fillRect(x,y,w,h){this.fills.push([this.fillStyle,Math.round(x+this.x),Math.round(y+this.y),Math.round(w),Math.round(h)]);}drawImage(canvas,...args){this.images.push({canvas,args});}
}
function withCanvas(fn){const previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=CaptureCanvas;try{return fn();}finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}}
function digest(canvas){const pixels=new Map();for(const[color,x,y,w,h]of canvas.ctx.fills)for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){assert.ok(col>=0&&row>=0&&col<canvas.width&&row<canvas.height,'No hull pixel is clipped.');pixels.set(`${col},${row}`,color);}assert.ok(pixels.size>500);return createHash('sha256').update(JSON.stringify([...pixels])).digest('hex');}

test('new hulls have distinct native artwork at their actual proportions and reuse both render buffers',()=>withCanvas(()=>{
 const pictures=new Set();for(const id of added){const hull=getShipClass(id),profile=SHIP_VISUALS[id],canvas=new CaptureCanvas(800,600),ctx=canvas.ctx;
  assert.equal(profile.length,hull.stats.renderLength);assert.equal(profile.width,hull.stats.renderWidth);assert.deepEqual(drawShip(ctx,400,300,0,'#b8c7bd',1,false,0,false,{shipClass:id}),{length:profile.length,width:profile.width});
  const work=ctx.images.at(-1).canvas,sprite=work.ctx.images.at(-1).canvas;pictures.add(digest(sprite));
  drawShip(ctx,402,300,.2,'#b8c7bd',1,false,0,false,{shipClass:id});assert.equal(ctx.images.at(-1).canvas,work);assert.equal(work.ctx.images.at(-1).canvas,sprite);
 }assert.equal(pictures.size,5);
}));

test('a destroyer remains visible when its bow is on screen and its center is off screen, with a readable peacekeeping label',()=>withCanvas(()=>{
 const hull=getShipClass('judicator'),player=getShipClass('sparrow'),labels=[];
 const state={systemId:'visibility-test',stats:{time:0},ship:{...player.stats,id:'player',classId:'sparrow',x:0,y:0,angle:0,hull:100,maxHull:100}};
 const keeper={...hull.stats,id:'keeper',name:'FWS Resolute',classId:'judicator',faction:'freewake',peacekeeper:true,x:-400,y:0,angle:0,hp:100,maxHp:100};
 const world={bodies:[],traffic:[keeper]},game={state,system:world},canvas=new CaptureCanvas(400,300),renderer=new SpaceRenderer();
 renderer.draw(canvas.ctx,game,{width:400,height:300,zoom:1,motion:false,labels});
 assert.ok(canvas.ctx.images.some(image=>image.canvas.width===664),'The 500-unit wedge is painted although its center is left of the viewport.');
 // Label sinks may drop an offscreen label even when a hull fragment is visible.
 keeper.x=0;canvas.ctx.images=[];labels.length=0;renderer.draw(canvas.ctx,game,{width:400,height:600,zoom:.5,motion:false,labels});
 assert.ok(labels.some(label=>(label.text||'').includes('FWS Resolute')));assert.ok(labels.some(label=>(label.text||'').includes('PEACEKEEPING')));
 keeper.x=-1000;canvas.ctx.images=[];renderer.draw(canvas.ctx,game,{width:400,height:300,zoom:1,motion:false,labels:[]});assert.ok(!canvas.ctx.images.some(image=>image.canvas.width===664));
}));
