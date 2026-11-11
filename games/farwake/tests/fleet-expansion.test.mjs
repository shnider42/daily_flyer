import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.mjs';
import {SHIP_CLASSES,STARTER_SHIPS,STARTER_SHIP_IDS,normalizeStarterShip,getShipClass,advanceShip,enemyHullProfile,enemyShipState} from '../dist/fleet.mjs';
import {cabinLayout} from '../dist/interior-layouts.mjs';
import {drawShip,SHIP_VISUALS} from '../dist/space-art.mjs';
import {testEnemyChoices,createTestSession} from '../dist/test-lab.mjs';

const newClasses=['kestrel','mule','petrel','marten','atlas','tern','quill','mender','bulwark','cairn'];
const ok=result=>assert.equal(result.ok,true,result.reason);
function dock(game){const body=game.system.bodies.find(body=>body.id==='kettle');Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60});ok(game.dock(body.id));}

test('starter catalog exposes three modest, meaningfully different hulls without later discoveries',()=>{
 assert.equal(SHIP_CLASSES.length,19);assert.equal(new Set(SHIP_CLASSES.map(hull=>hull.id)).size,19);
 assert.deepEqual(STARTER_SHIP_IDS,['sparrow','kestrel','mule']);assert.deepEqual(STARTER_SHIPS.map(hull=>hull.id),STARTER_SHIP_IDS);
 for(const [id,berths] of [['sparrow',2],['kestrel',1],['mule',2]]){assert.equal(normalizeStarterShip(id),id);assert.equal(getShipClass(id).berths,berths);assert.equal(enemyHullProfile(id).boardable,false);}
 for(const invalid of [undefined,null,'capital','atlas','petrel','tern','quill','mender','bulwark','cairn','lark','puffin','osprey','leviathan','judicator',{},['mule'],'MULE'])assert.equal(normalizeStarterShip(invalid),'sparrow');
 const [cutter,scout,tug]=STARTER_SHIPS;
 assert.ok(scout.stats.speed>cutter.stats.speed&&scout.stats.scanRange>cutter.stats.scanRange&&scout.stats.maxHull<cutter.stats.maxHull&&scout.stats.cargoCap<cutter.stats.cargoCap);
 assert.ok(tug.stats.mining>cutter.stats.mining&&tug.stats.cargoCap>cutter.stats.cargoCap&&tug.stats.speed<cutter.stats.speed&&tug.stats.angularAcceleration<cutter.stats.angularAcceleration);
 const travel=hull=>{let ship={...hull.stats,classId:hull.id,x:0,y:0,vx:0,vy:0,angle:0,angularVelocity:0};for(let i=0;i<180;i++)ship=advanceShip(ship,1/60,{thrust:1,flightAssist:false});return ship.x;};
 assert.ok(travel(scout)>travel(cutter)&&travel(cutter)>travel(tug),'the advertised handling differences affect the common flight integrator');
});

test('expanded hulls commission through ordinary costs, persist, and preserve their captured deck identity',()=>{
 for(const id of newClasses){
  const game=new Game(`commission-${id}`);dock(game);game.state.credits=15000;game.state.cargo.ore=100;
  if(getShipClass(id).requires?.length)assert.equal(game.classInfo(id).ok,false,'later hulls are gated even with ample funds');
  Object.assign(game.state.upgrades,{fold_1:1,fold_2:1,fold_3:1});game.state.flags.push('first_fold_done','archive_decoded','ally_chosen');
  if(id==='atlas'){game.state.cargo.ore=getShipClass('hauler').ore;ok(game.buyShip('hauler'));}
  const hull=getShipClass(id);game.state.cargo.ore=hull.ore;const credits=game.state.credits,ore=game.state.cargo.ore,orePrice=hull.starter?0:hull.ore;
  assert.equal(game.classInfo(id).ore,orePrice,'Used starter hulls are a credits-only purchase for every captain.');
  ok(game.buyShip(id));assert.equal(game.state.credits,credits-hull.cost);assert.equal(game.state.cargo.ore,ore-orePrice);
  assert.equal(game.state.ship.classId,id);assert.equal(game.state.ship.berths,hull.berths);assert.equal(game.state.ship.cargoCap,hull.stats.cargoCap);
  const restored=Game.fromSave(game.serialize());assert.equal(restored.state.ship.classId,id);assert.ok(restored.state.fleet.owned.includes(id));
  const profile=enemyHullProfile(id),captured=enemyShipState({id:'captured',...profile,hp:24,maxHp:100,disabled:true});
  assert.equal(captured.classId,id);assert.equal(captured.hull,hull.stats.maxHull*.24);assert.equal(cabinLayout(captured.classId).berths,hull.berths);
 }
});

class CaptureCanvas{
 constructor(width,height){this.width=width;this.height=height;this.ctx=new CaptureContext(this);}
 getContext(){return this.ctx;}
}
class CaptureContext{
 constructor(canvas){this.canvas=canvas;this.images=[];this.fills=[];this.x=0;this.y=0;}
 save(){}restore(){}rotate(){}scale(){}clearRect(){}
 translate(x,y){this.x+=x;this.y+=y;}
 fillRect(x,y,w,h){this.fills.push([this.fillStyle,Math.round(x+this.x),Math.round(y+this.y),Math.round(w),Math.round(h)]);}
 drawImage(canvas,...args){this.images.push({canvas,args});}
}
function rasterDigest(canvas){
 const pixels=new Map();
 for(const[color,x,y,w,h]of canvas.ctx.fills)for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)pixels.set(`${col},${row}`,color);
 assert.ok(pixels.size>300,'a hull is painted rather than represented by an empty canvas');
 const coordinates=[...pixels.keys()].map(key=>key.split(',').map(Number));
 assert.ok(coordinates.every(([x,y])=>x>=0&&y>=0&&x<canvas.width&&y<canvas.height),'the sprite is not clipped by its working canvas');
 return createHash('sha256').update(JSON.stringify([...pixels])).digest('hex');
}

test('every new silhouette renders at its real hull dimensions and reuses its art buffers',()=>{
 const previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=CaptureCanvas;
 try{
  const images=new Set();
  for(const id of newClasses){
   const hull=getShipClass(id),profile=SHIP_VISUALS[id],canvas=new CaptureCanvas(500,300),ctx=canvas.ctx;
   assert.equal(profile.length,hull.stats.renderLength);assert.equal(profile.width,hull.stats.renderWidth);
   assert.deepEqual(drawShip(ctx,100,100,0,'#b8c7be',1,false,0,false,{shipClass:id}),{length:profile.length,width:profile.width});
   const work=ctx.images.at(-1).canvas,sprite=work.ctx.images.at(-1).canvas;images.add(rasterDigest(sprite));
   drawShip(ctx,104,102,.3,'#b8c7be',1,false,1,false,{shipClass:id});assert.equal(ctx.images.at(-1).canvas,work);assert.equal(work.ctx.images.at(-1).canvas,sprite);
  }
  assert.equal(images.size,newClasses.length,'each added role has distinct pixel artwork');
 }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});

test('the expanded practice range still reveals only the smaller half and keeps its player cutter fixed',()=>{
 const choices=testEnemyChoices();assert.equal(choices.length,9);assert.deepEqual(choices.map(hull=>hull.id),['kestrel','sparrow','mule','tern','petrel','lark','quill','hauler','mender']);
 for(const choice of choices){const practice=createTestSession({enemyClassId:choice.id});assert.equal(practice.game.state.ship.classId,'sparrow');assert.equal(practice.game.system.enemies[0].classId,choice.id);assert.ok(practice.game.currentSystem.danger<=5);}
 for(const id of ['marten','atlas','capital','frigate','bulwark','cairn','puffin','osprey','leviathan','judicator'])assert.throws(()=>createTestSession({enemyClassId:id}),/not available/);
});
