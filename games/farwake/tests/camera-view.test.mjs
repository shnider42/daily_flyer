import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWorldZoom,normalizeShipZoom,normalizePersonZoom,surfaceCamera,surfaceCanvasToWorld,surfaceWorldToCanvas} from '../dist/camera-view.mjs';
import {pixelViewport} from '../dist/render-viewport.mjs';
import {drawSurface,generateSurface} from '../dist/surface.mjs';
import {SpaceRenderer} from '../dist/space-art.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
test('world zoom has bounded steps and safe defaults for old or malformed settings',()=>{
 assert.equal(normalizeWorldZoom(undefined),1);assert.equal(normalizeWorldZoom(null),1);assert.equal(normalizeWorldZoom(''),1);
 assert.equal(normalizeWorldZoom('1.3'),1.3);assert.equal(normalizeWorldZoom(.82),.8);assert.equal(normalizeWorldZoom(.83),.85);
 assert.equal(normalizeWorldZoom(-10),.5);assert.equal(normalizeWorldZoom(99),1.6);
 assert.equal(normalizeWorldZoom(Infinity),1);assert.equal(normalizeWorldZoom(NaN,.9),.9);assert.equal(normalizeWorldZoom('bad','bad'),1);
});

test('ship overview and walking zoom use their separate shared ranges',()=>{
 assert.equal(normalizeShipZoom(0),.25);assert.equal(normalizePersonZoom(0),.5);
 assert.equal(normalizeShipZoom(.27),.25);assert.equal(normalizePersonZoom(.27),.5);
 assert.equal(normalizeShipZoom(2),1.6);assert.equal(normalizePersonZoom(2),1.6);
});

test('surface camera changes field of view while pointer and marker transforms stay inverse',()=>{
 const origin={x:733.17,y:567.82,worldWidth:1440,worldHeight:1200,width:214,height:400};
 for(const zoom of[.6,.85,1,1.3,1.6]){
  const view=surfaceCamera({...origin,zoom});
  assert.ok(Number.isInteger(view.offsetX)&&Number.isInteger(view.offsetY));
  const center=surfaceCanvasToWorld(origin.width/2,origin.height/2,view);
  assert.ok(Math.abs(center.x-origin.x)<=.5/zoom);assert.ok(Math.abs(center.y-origin.y)<=.5/zoom);
  const left=surfaceCanvasToWorld(0,0,view),right=surfaceCanvasToWorld(origin.width,origin.height,view);
  close(right.x-left.x,origin.width/zoom);close(right.y-left.y,origin.height/zoom);
  for(const point of[{x:origin.x,y:origin.y},{x:814.234,y:592.81},{x:0,y:0}]){
   const pixel=surfaceWorldToCanvas(point.x,point.y,view),back=surfaceCanvasToWorld(pixel.x,pixel.y,view);
   close(back.x,point.x);close(back.y,point.y);
  }
 }
 assert.deepEqual(origin,{x:733.17,y:567.82,worldWidth:1440,worldHeight:1200,width:214,height:400});
});

test('person camera follows room edges and centers small rooms at every zoom',()=>{
 for(const zoom of[.6,1,1.6]){
  const bounds={worldWidth:1000,worldHeight:800,width:214,height:400,zoom};
  const low=surfaceCamera({...bounds,x:0,y:0});close(low.cameraX,0);close(low.cameraY,0);
  const high=surfaceCamera({...bounds,x:1000,y:800});
  assert.ok(Math.abs(high.cameraX+214/zoom-1000)<=.5/zoom);assert.ok(Math.abs(high.cameraY+400/zoom-800)<=.5/zoom);
  const tiny=surfaceCamera({...bounds,worldWidth:90,worldHeight:80,x:12,y:12}),far=surfaceCamera({...bounds,worldWidth:90,worldHeight:80,x:80,y:70});
  assert.deepEqual(tiny,far,'a room smaller than the viewport stays centered instead of following every step');
  const center=surfaceWorldToCanvas(45,40,tiny);assert.ok(Math.abs(center.x-107)<=.5);assert.ok(Math.abs(center.y-200)<=.5);
 }
 const legacy=surfaceCamera({x:110.5,y:180.5,worldWidth:900,worldHeight:900,width:200,height:300});
 assert.equal(legacy.cameraX,11);assert.equal(legacy.cameraY,31);
 assert.deepEqual(surfaceCanvasToWorld(40,70,{cameraX:100,cameraY:200}),{x:140,y:270});
});

class FakeCanvas{
 static allocations=0;
 constructor(width,height){this.width=width;this.height=height;this.ctx=new FakeContext(this);FakeCanvas.allocations++;}
 getContext(){return this.ctx;}
}
class FakeContext{
 constructor(canvas){this.canvas=canvas;this.textCalls=[];this.images=[];this.scales=[];this.transforms=[];this.fills=[];this.captureFills=false;this.imageSmoothingEnabled=true;}
 save(){}restore(){}translate(){}rotate(){}fillRect(x,y,w,h){if(this.captureFills)this.fills.push({color:this.fillStyle,x,y,w,h});}clearRect(){}strokeRect(){}setLineDash(){}
 scale(...args){this.scales.push(args);}setTransform(...args){this.transforms.push(args);}
 drawImage(...args){this.images.push(args);}fillText(...args){this.textCalls.push(args);}measureText(s){return{width:String(s).length*6};}
}
function withCanvas(fn){const before=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=FakeCanvas;try{fn();}finally{if(before===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=before;}}

test('person zoom samples a reusable pixel layer and keeps labels at their UI size',()=>withCanvas(()=>{
 const surface=generateSurface({id:'ship:zoom',kind:'ship',shipClass:'capital'},'camera'),person={x:708.2,y:684.6,health:100},remotePeople=[{captainId:'guest',name:'Captain Aya',mode:'person',x:740,y:720}],snapshot=JSON.stringify({surface,person,remotePeople});
 const ctx=new FakeCanvas(360,300).ctx;
 for(const zoom of[.6,.85,1,1.6]){
  const labels=[],view=drawSurface(ctx,surface,{person,remotePeople,width:360,height:300,zoom,labels,time:1});
  const label=labels.find(l=>l.kind==='remote'),point=surfaceWorldToCanvas(740,720-47,view);
  assert.equal(label.text,'Captain Aya');assert.equal(label.size,13);assert.equal(label.x,Math.round(point.x));assert.equal(label.y,Math.round(point.y));
  assert.equal(ctx.imageSmoothingEnabled,false);assert.equal(ctx.textCalls.length,0);
  if(zoom!==1){const sample=ctx.images.at(-1);assert.equal(sample.length,9);close(sample[3],360/zoom);close(sample[4],300/zoom);assert.deepEqual(sample.slice(5),[0,0,360,300]);}
 }
 assert.equal(JSON.stringify({surface,person,remotePeople}),snapshot);
 drawSurface(ctx,surface,{person,width:360,height:300,zoom:.85,labels:[]});
 const allocated=FakeCanvas.allocations;
 for(let i=0;i<30;i++)drawSurface(ctx,surface,{person:{...person,x:person.x+i*.17},width:360,height:300,zoom:.85,labels:[]});
 assert.equal(FakeCanvas.allocations,allocated,'camera drift reuses the same raster layer');
 const scaledText=new FakeCanvas(360,300).ctx;drawSurface(scaledText,surface,{person,remotePeople,width:360,height:300,zoom:.6});assert.ok(scaledText.textCalls.length>0,'callers without a label overlay still get unscaled fallback labels');
}));

test('space zoom preserves hull-aware framing, picking, and continuous camera state',()=>withCanvas(()=>{
 const game={state:{systemId:'zoom-test',ship:{id:'local',shipClass:'sparrow',x:100.123,y:200.789,hull:100,maxHull:100}},system:{bodies:[],asteroids:[],enemies:[],traffic:[],signals:[],bullets:[],pickups:[]}},before=JSON.stringify(game),ctx=new FakeCanvas(214,400).ctx,renderer=new SpaceRenderer();
 const base=renderer.draw(ctx,game,{width:214,height:400,motion:false,time:1,labels:[]});
 for(const zoomMultiplier of[.6,.85,1,1.6]){
  const view=renderer.draw(ctx,game,{width:214,height:400,zoomMultiplier,motion:false,time:1,labels:[]});
  close(view.zoom,base.zoom*zoomMultiplier);
  assert.deepEqual(renderer.camera,{x:100.123,y:200.789});
  const center=renderer.toWorld(107,200);close(center.x,view.cameraX);close(center.y,view.cameraY);
  const point=renderer.toWorld(view.offsetX+250*view.zoom,view.offsetY+300*view.zoom);close(point.x,250);close(point.y,300);
 }
 const explicit=renderer.draw(ctx,game,{width:214,height:400,zoom:.73,zoomMultiplier:1.6,motion:false,time:1,labels:[]});assert.equal(explicit.zoom,.73);
 assert.equal(JSON.stringify(game),before);
}));

test('native zoom-out samples retain camera coverage, precise picking, and CSS label sizes',()=>withCanvas(()=>{
 const surface=generateSurface({id:'ship:density',kind:'ship',shipClass:'capital'},'camera'),person={x:708.2,y:684.6,health:100},remotePeople=[{captainId:'guest',name:'Captain Aya',mode:'person',x:740,y:720}];
 const game={state:{systemId:'density',ship:{id:'local',shipClass:'sparrow',x:100.123,y:200.789,hull:100,maxHull:100}},system:{bodies:[],asteroids:[],enemies:[],traffic:[],signals:[],bullets:[],pickups:[]}},renderer=new SpaceRenderer();
 for(const dpr of[1,1.25,2,3]){
  const viewport=pixelViewport({width:420,height:800,dpr,zoom:.8,mode:'person'}),rasterScale=viewport.rasterScale,width=viewport.logicalWidth,height=viewport.logicalHeight,ctx=new FakeCanvas(width,height).ctx,labels=[];
  const view=drawSurface(ctx,surface,{person,remotePeople,width,height,zoom:.8,rasterScale,labels});
  close(view.zoom,.8*rasterScale);close(width/view.zoom,viewport.cssWidth/(viewport.cssScale*rasterScale*.8));
  const label=labels.find(l=>l.kind==='remote'),expected=surfaceWorldToCanvas(740,673,view);assert.equal(label.size,13);assert.equal(label.x,Math.round(expected.x));assert.equal(label.y,Math.round(expected.y));
  const sample=ctx.images.at(-1);close(sample[3],width/(.8*rasterScale));close(sample[4],height/(.8*rasterScale));
  assert.ok(sample[0].width<300&&sample[0].height<510,'visible-world source buffer does not grow with DPR');
  for(const zoomMultiplier of[.25,.4,.8]){
   const space=renderer.draw(ctx,game,{width,height,rasterScale,zoomMultiplier,motion:false,labels:[]});
   close(space.zoom/rasterScale,.7*zoomMultiplier);
   const point=renderer.toWorld(space.offsetX+235.567*space.zoom,space.offsetY-72.123*space.zoom);close(point.x,235.567);close(point.y,-72.123);
   close(width/space.zoom,viewport.cssWidth/(viewport.cssScale*rasterScale*.7*zoomMultiplier));
  }
 }
}));

test('dense ship sampling retains combat cue sizes and asteroid details; overview brackets do not enlarge hulls',()=>withCanvas(()=>{
 const ship={id:'local',shipClass:'sparrow',x:100,y:200,angle:.3,hull:100,maxHull:100},enemy={id:'enemy',name:'Raider',shipClass:'sparrow',x:120,y:230,hp:60,maxHp:100,hostile:true};
 const game={state:{systemId:'cues',ship},system:{bodies:[],asteroids:[{id:'crystal',x:170,y:200,radius:16,seed:23,type:'crystal',hp:100,maxHp:100}],enemies:[enemy],traffic:[],signals:[],bullets:[{x:130,y:210,vx:100,vy:0,owner:'player'}],pickups:[]}};
 for(const rasterScale of[2,4,6]){
  const ctx=new FakeCanvas(195*rasterScale,320*rasterScale).ctx;ctx.captureFills=true;const labels=[],renderer=new SpaceRenderer(),view=renderer.draw(ctx,game,{rasterScale,zoomMultiplier:.8,motion:false,labels});
  const bar=ctx.fills.find(f=>f.color==='#543b3c'),bullet=ctx.fills.find(f=>f.color==='#fff0c6'),crystal=ctx.fills.find(f=>f.color==='#a8d7c6');
  assert.equal(bar.h,3*rasterScale);assert.equal(bullet.w,2*rasterScale);assert.equal(bullet.h,2*rasterScale);
  assert.equal(crystal.w,Math.round(2*.8*rasterScale),'crystal facets must scale along with their rock, not become single device-pixel specks');
  const label=labels.find(l=>l.kind==='hostile');assert.equal(label.size,13);
  const enemyY=Math.round(enemy.y*view.zoom+view.offsetY);assert.ok(Math.abs(label.y-enemyY-(42*view.zoom*.6+8*rasterScale))<=.5,'label spacing scales while its CSS font size stays fixed');
 }
 const ctx=new FakeCanvas(390,640).ctx;ctx.captureFills=true;new SpaceRenderer().draw(ctx,game,{rasterScale:2,zoomMultiplier:.25,motion:false,labels:[]});
 assert.ok(ctx.fills.some(f=>f.color==='#c6dfcf'),'the DPR1 overview keeps a visible local-ship bracket');
 close(ctx.scales.at(-1)[0],.35);close(ctx.scales.at(-1)[1],.35);
 assert.equal(game.state.ship,ship);assert.equal(ship.hull,100);
}));
