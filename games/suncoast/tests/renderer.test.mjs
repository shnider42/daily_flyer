import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../public/renderer.mjs';

function fakeCanvas(width=428,height=926) {
  let pixelWidth=300,pixelHeight=150;
  const stats={resizes:0,contexts:0},rect={width,height};
  const gradient={addColorStop(){}};
  const context=new Proxy({}, {get(o,key){
    if(key==='measureText')return value=>({width:String(value).length*6});
    if(key==='createRadialGradient'||key==='createLinearGradient')return ()=>gradient;
    return o[key]||(()=>{});
  },set(o,key,value){o[key]=value;return true;}});
  return {
    stats,rect,
    get width(){return pixelWidth;},set width(value){pixelWidth=value;stats.resizes++;},
    get height(){return pixelHeight;},set height(value){pixelHeight=value;stats.resizes++;},
    getBoundingClientRect(){return rect;},getContext(){stats.contexts++;return context;}
  };
}
const state=()=>({player:{x:740,y:1148,angle:0,hp:100,interior:null,vehicleId:null},progress:{unlocked:0},wanted:{stars:0},vehicles:[],npcs:[],police:[],bullets:[],effects:[],phase:'playing',dayTime:16});

// Restore globals even if an assertion fails; no browser or rasterizer is required.
function environment(dpr,fn) {
  const oldDpr=globalThis.devicePixelRatio,oldDocument=globalThis.document;
  globalThis.devicePixelRatio=dpr;globalThis.document={createElement:()=>fakeCanvas()};
  try{return fn();}finally{if(oldDpr===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=oldDpr;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
}

test('a CSS-hidden minimap never grows its backing buffer or requests a drawing context',()=>environment(3,()=>{
  const r=new Renderer(fakeCanvas()),map=fakeCanvas(119,73),g=state();
  r.drawMap(map,g,{full:false});
  assert.deepEqual([map.width,map.height],[357,219]);
  map.rect.width=0;map.rect.height=0;
  const before={width:map.width,height:map.height,...map.stats};
  for(let i=0;i<1200;i++)assert.equal(r.drawMap(map,g,{full:false}),null);
  assert.deepEqual({width:map.width,height:map.height,...map.stats},before);
  map.rect.width=119;map.rect.height=73;
  r.drawMap(map,g,{full:false});
  assert.deepEqual([map.width,map.height],[357,219]);
  assert.equal(map.stats.resizes,before.resizes);
}));

test('an iPhone-sized 3x viewport renders natively and repeated resize calls remain stable',()=>environment(3,()=>{
  const canvas=fakeCanvas(428,926),r=new Renderer(canvas);
  assert.deepEqual([canvas.width,canvas.height],[1284,2778]);
  const resizes=canvas.stats.resizes;
  for(let i=0;i<100;i++)r.resize();
  assert.equal(canvas.stats.resizes,resizes);
  canvas.rect.width=926;canvas.rect.height=428;r.resize();
  assert.deepEqual([canvas.width,canvas.height],[2778,1284]);
  canvas.rect.width=0;canvas.rect.height=0;const count=canvas.stats.resizes;
  assert.equal(r.resize(),false);assert.equal(canvas.stats.resizes,count);
}));

test('large retina canvases obey explicit pixel budgets without changing CSS map coordinates',()=>environment(3,()=>{
  const canvas=fakeCanvas(2560,1440),r=new Renderer(canvas),g=state();
  assert.ok(canvas.width*canvas.height<=4_000_000);
  assert.ok(canvas.width>=2560&&canvas.height>=1440,'1440p display retains at least one raster pixel per CSS pixel');
  const map=fakeCanvas(1100,700),transform=r.drawMap(map,g);
  assert.ok(map.width*map.height<=2_000_000);
  assert.equal(transform.width,1100);assert.equal(transform.height,700);
  for(let i=0;i<10;i++)r.drawMap(map,g);
  assert.ok(map.width*map.height<=2_000_000);
}));

test('retina terrain stays within its byte budget and evicted canvases release their buffers',()=>environment(3,()=>{
  const r=new Renderer(fakeCanvas()),g=state(),created=[];
  globalThis.document.createElement=()=>{const tile=fakeCanvas();created.push(tile);return tile;};
  r._terrain=()=>{}; // Exercise allocation/composition, without testing the artwork.
  for(let i=0;i<18;i++){
    g.player.x=500+i*240;g.player.y=1000+(i%3)*320;r.initial=true;r.render(g);
    const retained=[...r.cache.values()].reduce((bytes,tile)=>bytes+tile.width*tile.height*4,0);
    assert.equal(r.cacheBytes,retained);
    assert.ok(retained<=48*1024*1024);
  }
  assert.ok(created.some(tile=>tile.width>258),'terrain is rasterized above 1x on a retina display');
  assert.ok(created.some(tile=>tile.width===1&&tile.height===1),'eviction releases old canvas backing stores');
  assert.ok(r.cache.size<created.length);
}));
