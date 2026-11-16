import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.mjs';
import {getShipClass,enemyHullProfile,enemyShipState,STARTER_SHIP_IDS} from '../dist/fleet.mjs';
import {cabinLayout} from '../dist/interior-layouts.mjs';
import {getHullSystems} from '../dist/hull-systems.mjs';
import {SHIP_VISUALS,SpaceRenderer,drawShip,drawWarzoneEffect,drawBatteryFlash} from '../dist/space-art.mjs';
import {WARZONE_HULL_TACTICS} from '../dist/warzone-content.mjs';
import {testEnemyChoices} from '../dist/test-lab.mjs';

const hullIds=['needle','kite','confluence','ark'];
const ok=result=>assert.equal(result.ok,true,result.reason);
class CaptureCanvas{
 constructor(width,height){this.width=width;this.height=height;this.ctx=new CaptureContext(this);}
 getContext(){return this.ctx;}
}
class CaptureContext{
 constructor(canvas){this.canvas=canvas;this.fills=[];this.images=[];this.x=0;this.y=0;this.globalAlpha=1;this.stack=[];}
 save(){this.stack.push([this.x,this.y,this.globalAlpha]);}
 restore(){[this.x,this.y,this.globalAlpha]=this.stack.pop()||[0,0,1];}
 translate(x,y){this.x+=x;this.y+=y;}rotate(){}scale(){}clearRect(){}
 setTransform(){this.x=0;this.y=0;}measureText(text){return{width:text.length*7};}fillText(){}
 fillRect(x,y,w,h){this.fills.push([this.fillStyle,Math.round(x+this.x),Math.round(y+this.y),Math.round(w),Math.round(h),this.globalAlpha]);}
 drawImage(canvas,...args){this.images.push({canvas,args});}
}
function withCanvas(fn){const previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=CaptureCanvas;try{return fn();}finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}}
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function paintedHull(canvas){const pixels=new Map();for(const[color,x,y,w,h]of canvas.ctx.fills)for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){
 assert.ok(col>=0&&row>=0&&col<canvas.width&&row<canvas.height,'Hull detail must fit its native render buffer.');pixels.set(`${col},${row}`,color);
}assert.ok(pixels.size>400);return digest([...pixels]);}
function effectPaint(effect,clock,motion=true){const canvas=new CaptureCanvas(1000,1000);drawWarzoneEffect(canvas.ctx,effect,{x:500,y:500,clock,zoom:.8,rasterScale:1,motion});return canvas.ctx.fills;}
const extent=fills=>{const xs=fills.flatMap(row=>[row[1],row[1]+row[3]]),ys=fills.flatMap(row=>[row[2],row[2]+row[4]]);return{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};};

test('four faction hulls commission, save, capture, and keep actual cabin and equipment identities',()=>{
 for(const id of hullIds){
  const hull=getShipClass(id),game=new Game('warzone-hull-'+id),port=game.system.bodies.find(body=>body.id==='kettle');
  Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+60});ok(game.dock(port.id));
  game.state.credits=50000;game.state.cargo.ore=hull.ore;
  assert.equal(game.classInfo(id).ok,false,'A military commission still requires earned drive/story progress.');
  Object.assign(game.state.upgrades,{fold_1:1,fold_2:1,fold_3:1});game.state.flags.push('first_fold_done','archive_decoded','ally_chosen');
  if(hull.requiresClass)game.state.fleet.owned.push(hull.requiresClass);
  ok(game.buyShip(id));const restored=Game.fromSave(game.serialize());
  assert.equal(restored.state.ship.classId,id);assert.equal(restored.state.ship.berths,hull.berths);assert.equal(cabinLayout(id).berths,hull.berths);
  assert.equal(hull.systems,getHullSystems(id));assert.equal(hull.systems.id,id);assert.ok(Object.isFrozen(hull.systems.pulseMuzzles));
  const enemy={id:'prize:'+id,...enemyHullProfile(id),hp:40,maxHp:100,disabled:true},before=JSON.stringify(enemy),captured=enemyShipState(enemy);
  assert.equal(captured.classId,id);assert.equal(captured.interiorClassId,id);assert.equal(captured.hull,hull.stats.maxHull*.4);assert.equal(JSON.stringify(enemy),before);
  assert.equal(enemy.boardable,hull.berths>=3);
 }
 assert.deepEqual(STARTER_SHIP_IDS,['sparrow','kestrel','mule']);
 assert.deepEqual(testEnemyChoices().map(hull=>hull.id),['kestrel','sparrow','mule','tern','petrel','lark','quill','hauler','mender','marten']);
});

test('fighters and Meridian capitals render four unclipped native silhouettes and reuse buffers',()=>withCanvas(()=>{
 const pictures=new Set();for(const id of hullIds){
  const hull=getShipClass(id),profile=SHIP_VISUALS[id],canvas=new CaptureCanvas(900,700);
  assert.equal(profile.length,hull.stats.renderLength);assert.equal(profile.width,hull.stats.renderWidth);
  assert.deepEqual(drawShip(canvas.ctx,450,350,0,'#b8c7bd',1,false,0,false,{shipClass:id}),{length:profile.length,width:profile.width});
  const work=canvas.ctx.images.at(-1).canvas,sprite=work.ctx.images.at(-1).canvas;pictures.add(paintedHull(sprite));
  drawShip(canvas.ctx,450,350,.3,'#b8c7bd',1,true,1,false,{shipClass:id,warzone:true});
  assert.equal(canvas.ctx.images.at(-1).canvas,work);assert.equal(work.ctx.images.at(-1).canvas,sprite);
 }assert.equal(pictures.size,4);
}));

test('battery and launch art uses the physical side-bank and hangar geometry of each capital',()=>{
 for(const id of ['capital','judicator','confluence','ark']){
  const tactics=WARZONE_HULL_TACTICS[id],hull=getShipClass(id);
  assert.deepEqual(tactics.batteries.map(bank=>bank.id),['port','starboard']);
  for(const bank of tactics.batteries){assert.equal(bank.kind,'cannon');assert.equal(bank.muzzles.length,4);for(const [x,y]of bank.muzzles){assert.ok(Math.abs(x)<=hull.stats.renderLength/2);assert.ok(Math.abs(y)<=hull.stats.renderWidth/2);assert.equal(Math.sign(y),Math.sign(bank.angle));}}
  assert.equal(tactics.hangars.length,2);for(const bay of tactics.hangars){assert.ok(Math.abs(bay.x)<=hull.stats.renderLength/2);assert.ok(Math.abs(bay.y)<=hull.stats.renderWidth/2);}
 }
 const forward=new CaptureCanvas(200,200),sideways=new CaptureCanvas(200,200);
 drawBatteryFlash(forward.ctx,100,100,0,1);drawBatteryFlash(sideways.ctx,100,100,Math.PI/2,1);
 assert.ok(extent(forward.ctx.fills).width>extent(forward.ctx.fills).height);
 assert.ok(extent(sideways.ctx.fills).height>extent(sideways.ctx.fills).width,'A broadside flash follows its actual firing angle.');
});

test('explosion frames are deterministic, varied by hull event, and do not mutate frozen snapshots',()=>{
 const effect=Object.freeze({id:'destroyed-cruiser',kind:'explosion',x:0,y:0,at:0,until:5.8,size:440,shipClass:'confluence',angle:.35,vx:12,vy:-8,seed:641,faction:'meridian'}),before=JSON.stringify(effect);
 const paint=effectPaint(effect,2.2);assert.deepEqual(effectPaint(effect,2.2),paint);assert.equal(JSON.stringify(effect),before);
 assert.notEqual(digest(effectPaint({...effect,seed:775},2.2)),digest(paint),'Debris and vapor do not repeat the same radial pattern.');
 const impact=effectPaint({...effect,kind:'impact',size:24,until:.3},.12);
 assert.ok(extent(paint).width>extent(impact).width*2);assert.ok(extent(paint).height>extent(impact).height*2);
});

test('destruction moves from a brief bright core into uneven debris, smoke, and a dim afterglow',()=>{
 const effect={id:'destroyed-ark',kind:'explosion',x:0,y:0,at:10,until:16,size:400,angle:.2,seed:912,faction:'meridian'},early=effectPaint(effect,10.1),late=effectPaint(effect,14.7);
 assert.ok(early.some(row=>row[0]==='#fff1cb'));assert.ok(!late.some(row=>row[0]==='#fff1cb'));
 assert.ok(late.some(row=>row[0]==='#263139'));assert.ok(late.some(row=>row[0]==='#b0734d'));
 assert.ok(extent(late).width>extent(early).width);
 assert.equal(effectPaint(effect,16).length,0,'Expired effects leave no permanent flare.');
});

test('reduced motion holds a muted stable aftermath and launch/recovery trails remain distinct',()=>{
 const effect={id:'reduced',kind:'explosion',at:0,until:6,size:440,seed:222,x:0,y:0,faction:'meridian'};
 assert.deepEqual(effectPaint(effect,.1,false),effectPaint(effect,5.5,false));assert.ok(!effectPaint(effect,.1,false).some(row=>row[0]==='#fff1cb'));
 const launch={...effect,kind:'fighter-launch',size:52,angle:Math.PI/2,until:1},recovery={...launch,kind:'fighter-recovery'};
 assert.notEqual(digest(effectPaint(launch,.4)),digest(effectPaint(recovery,.4)));
 assert.equal(effectPaint(launch,1.1).length,0);
});

test('the battle renderer reads at most 48 effects and leaves the simulation snapshot untouched',()=>withCanvas(()=>{
 const hull=getShipClass('sparrow'),effects=Array.from({length:76},(_,i)=>({id:'effect-'+i,kind:'impact',at:0,until:1,x:10,y:10,size:20,seed:i}));
 const state={systemId:'effect-budget',stats:{time:.4},ship:{...hull.stats,id:'player',classId:'sparrow',x:0,y:0,angle:0,hull:100,maxHull:100}},system={bodies:[],enemies:[],warzone:{clock:.4,sectors:[],effects}},before=JSON.stringify({state,system});
 const render=world=>{const canvas=new CaptureCanvas(600,400);new SpaceRenderer().draw(canvas.ctx,{state,system:world},{width:600,height:400,zoom:1,motion:false,labels:[]});return canvas.ctx.fills;};
 assert.deepEqual(render(system),render({...system,warzone:{...system.warzone,effects:effects.slice(-48)}}));
 assert.equal(JSON.stringify({state,system}),before);
}));

test('occupied capital flashes use the shared battle clock and disappear after leaving Crosswind',()=>withCanvas(()=>{
 const hull=getShipClass('ark'),state={systemId:'crosswind',stats:{time:120},ship:{...hull.stats,id:'occupied-ark',classId:'ark',x:0,y:0,angle:0,hull:920,maxHull:920,
  lastShot:{clock:'warzone',systemId:'crosswind',at:3,until:3.15,bankId:'starboard',angle:Math.PI/2,muzzles:[{x:55,y:78,angle:Math.PI/2,until:3.15,bankId:'starboard',mountId:'starboard:2'}]}}};
 const render=warzone=>{const canvas=new CaptureCanvas(700,500);new SpaceRenderer().draw(canvas.ctx,{state,system:{bodies:[],enemies:[],warzone}},{width:700,height:500,zoom:1,motion:false,labels:[]});return canvas.ctx.fills;};
 assert.ok(render({clock:3.05,effects:[]}).some(row=>row[0]==='#c28e62'),'The captain clock can be far ahead of the shared battle clock.');
 assert.ok(!render({clock:3.3,effects:[]}).some(row=>row[0]==='#c28e62'));
 assert.ok(!render(undefined).some(row=>row[0]==='#c28e62'),'A shot observation cannot keep flashing after departure.');
}));
