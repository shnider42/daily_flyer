import test from 'node:test';
import assert from 'node:assert/strict';
import {STATION_TYPES,PLANET_TYPES,WORLD_SIZES,SYSTEM_TYPES} from '../dist/world-types.mjs';
import {stationPlan,planetSurfaceDimensions,planetTerrainSample} from '../dist/place-geometry.mjs';
import {generateSurface,isWalkable,TILE,drawSurface} from '../dist/surface.mjs';
import {drawStation,SpaceRenderer} from '../dist/space-art.mjs';

function flood(surface){
 const start=Math.floor(surface.spawn.y/24)*surface.cols+Math.floor(surface.spawn.x/24),seen=new Set([start]),queue=[start];
 for(let i=0;i<queue.length;i++){const n=queue[i],x=n%surface.cols,y=Math.floor(n/surface.cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*surface.cols+xx;if(xx<0||yy<0||xx>=surface.cols||yy>=surface.rows||seen.has(k)||!isWalkable(surface,(xx+.5)*24,(yy+.5)*24))continue;seen.add(k);queue.push(k);}}
 return seen;
}
function assertAccess(surface){
 assert.ok(isWalkable(surface,surface.spawn.x,surface.spawn.y),`${surface.id}: landing is clear`);
 const reachable=flood(surface);
 for(const e of surface.entities){assert.ok(isWalkable(surface,e.x,e.y),`${e.id}: clear standing point`);assert.ok(reachable.has(Math.floor(e.y/24)*surface.cols+Math.floor(e.x/24)),`${e.id}: route from airlock`);}
 return reachable;
}
function enclosedWells(plan){
 const seen=new Set();let wells=0;
 for(let n=0;n<plan.hull.length;n++)if(!plan.hull[n]&&!seen.has(n)){
  const q=[n];seen.add(n);let edge=false;
  for(let i=0;i<q.length;i++){const k=q[i],x=k%plan.cols,y=Math.floor(k/plan.cols);if(x===0||y===0||x===plan.cols-1||y===plan.rows-1)edge=true;
   for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*plan.cols+xx;if(xx<0||yy<0||xx>=plan.cols||yy>=plan.rows||plan.hull[j]||seen.has(j))continue;seen.add(j);q.push(j);}
  }
  if(!edge)wells++;
 }
 return wells;
}

test('all25 station hulls have connected real floor, reachable services and stable silhouettes',()=>{
 const signatures=new Set();
 for(const type of STATION_TYPES){
  const body={id:`geometry:${type.id}`,name:type.name,kind:'station',stationTypeId:type.id},plan=stationPlan(body),surface=generateSurface(body,'geometry');
  signatures.add(`${plan.cols}:${plan.rows}:${plan.hull.join('')}`);
  assert.equal(surface.layoutVersion,plan.layoutVersion);assert.deepEqual(surface.outline.hull,plan.hull);
  const reachable=assertAccess(surface);assert.equal(reachable.size,plan.floorTiles.length,`${type.id}: no isolated arm or sealed ward`);
  for(let y=0;y<surface.rows;y++)for(let x=0;x<surface.cols;x++){assert.equal(surface.tiles[y][x]!==TILE.VOID,Boolean(plan.hull[y*surface.cols+x]));assert.equal(isWalkable(surface,(x+.5)*24,(y+.5)*24),Boolean(plan.walkable[y*surface.cols+x]));}
  for(const role of ['mechanic','medic','bartender','dockworker'])assert.ok(surface.entities.some(e=>e.role===role),`${type.id}: ${role}`);
  assert.ok(surface.entities.some(e=>e.type==='jobboard'));assert.ok(surface.entities.some(e=>e.data.story));
  assert.deepEqual(generateSurface(body,'geometry'),surface,'solo and server generation remain deterministic');
 }
 assert.equal(signatures.size,25);
 const planFor=shape=>stationPlan({stationTypeId:STATION_TYPES.find(t=>t.shape===shape).id});
 assert.equal(enclosedWells(planFor('ring')),1);assert.equal(enclosedWells(planFor('wheel')),4);assert.equal(enclosedWells(planFor('ladder')),2);assert.equal(enclosedWells(planFor('honeycomb')),3);
});

class RasterCanvas{
 constructor(width,height){this.width=width;this.height=height;this.pixels=new Uint8Array(width*height);const canvas=this;this.context={canvas,fillStyle:'',globalAlpha:1,fillRect(x,y,w,h){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(height,Math.ceil(y+h));yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(width,Math.ceil(x+w));xx++)canvas.pixels[yy*width+xx]=1;},drawImage(){},save(){},restore(){},translate(){},scale(){},rotate(){},setLineDash(){},strokeRect(){},fillText(){},measureText(text){return{width:text.length*6};}};}
 getContext(){return this.context;}
}
test('the orbital renderer leaves the same station holes and perimeter as the walking map',()=>{
 const previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=RasterCanvas;
 try{
  for(const type of STATION_TYPES){const body={id:`raster:${type.id}`,stationTypeId:type.id},plan=stationPlan(body);let sprite;drawStation({drawImage(c){sprite=c;}},0,0,80,0,body,1);
   const unit=160/Math.max(plan.cols,plan.rows),ox=96-plan.cols*unit/2,oy=96-plan.rows*unit/2;
   for(let y=0;y<plan.rows;y++)for(let x=0;x<plan.cols;x++){
    if(x>=plan.collar.x-3&&x<=plan.collar.x+1&&Math.abs(y-plan.collar.y)<=2)continue; // External docking collar is intentionally attached here.
    const px=Math.floor(ox+(x+.5)*unit),py=Math.floor(oy+(y+.5)*unit);
    assert.equal(Boolean(sprite.pixels[py*192+px]),Boolean(plan.hull[y*plan.cols+x]),`${type.id}: orbital occupancy ${x},${y}`);
   }
  }
 }finally{globalThis.OffscreenCanvas=previous;}
});

test('all25 planet terrains change the actual country while keeping authored routes usable',()=>{
 const signatures=new Set(),samples=new Set();
 for(const type of PLANET_TYPES){
  const body={id:'terrain-comparison',name:type.name,kind:'planet',biome:type.biome,planetTypeId:type.id},surface=generateSurface(body,'terrain-check');assertAccess(surface);
  assert.equal(surface.terrain,type.terrain);assert.ok(surface.terrainStats.features>0);assert.ok(surface.entities.some(e=>e.type==='siteEntrance'));
  signatures.add(JSON.stringify([surface.palette,surface.tiles,surface.decor.filter(p=>p.terrainFeature)]));
  samples.add(Array.from({length:20},(_,i)=>planetTerrainSample(type.terrain,(i%5)/5,Math.floor(i/5)/4,13).toFixed(4)).join(','));
  if(['wetlands','islands','reefs','stormcoast','lavafields'].includes(type.terrain))assert.ok(surface.terrainStats.waterTiles>200,`${type.id}: collision geography must change`);
  if(['factory','city','ruins','mesas','crystals'].includes(type.terrain))assert.ok(surface.terrainStats.terrainTiles>100,`${type.id}: yards or geological districts`);
 }
 assert.equal(signatures.size,25);assert.equal(samples.size,25);
});

test('region area and route distances increase from moon to supermassive world, with safe scaled entrances',()=>{
 let previousArea=0,previousDistance=0;const dimensions=[];
 for(const sizeClass of Object.keys(WORLD_SIZES)){
  const body={id:'scale-check',kind:'planet',planetTypeId:'garden',biome:'temperate',sizeClass},surface=generateSurface(body,'size'),spec=planetSurfaceDimensions(body);assertAccess(surface);
  const sites=surface.entities.filter(e=>e.type==='siteEntrance'),distance=Math.max(...sites.map(e=>Math.hypot(e.x-surface.spawn.x,e.y-surface.spawn.y)));
  assert.ok(surface.cols*surface.rows>previousArea);assert.ok(distance>previousDistance);assert.equal(surface.cols,spec.cols);assert.equal(surface.rows,spec.rows);previousArea=surface.cols*surface.rows;previousDistance=distance;dimensions.push([surface.cols,surface.rows]);
  const ctx=new RasterCanvas(360,240).context,before=JSON.stringify(surface);drawSurface(ctx,surface,{width:360,height:240,person:{...surface.spawn,facing:'down'},time:0});assert.equal(JSON.stringify(surface),before);
 }
 assert.deepEqual(dimensions[0],[76,56]);assert.deepEqual(dimensions.at(-1),[178,132]);assert.ok((178*132)/(76*56)>5.5);
 const morrow=generateSurface('morrow','size');assert.deepEqual([morrow.cols,morrow.rows],[108,80]);assert.deepEqual(morrow.spawn,{x:252,y:636});
 const kettle=generateSurface('kettle','size');assert.deepEqual([kettle.cols,kettle.rows],[38,38]);assert.deepEqual(kettle.spawn,{x:156,y:348});assert.equal(kettle.entities.find(e=>e.id==='kettle:mechanic').name,'Iona Vale');
});

test('orbital planet and stellar artwork is immutable, cached by type and distinct across the catalog',()=>{
 const previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=RasterCanvas;
 try{const renderer=new SpaceRenderer(),canvases=new Set(),skies=new Set();
  for(const type of PLANET_TYPES){const body={id:'catalog-planet',planetTypeId:type.id},snapshot=JSON.stringify(body),canvas=renderer.planet(body);assert.equal(renderer.planet(body),canvas);assert.equal(JSON.stringify(body),snapshot);canvases.add(canvas);}
  for(const type of SYSTEM_TYPES){const system={id:'catalog-system',systemTypeId:type.id},canvas=renderer.nebula(system);assert.equal(renderer.nebula(system),canvas);skies.add(canvas);}
  assert.equal(canvases.size,25);assert.equal(skies.size,25);
 }finally{globalThis.OffscreenCanvas=previous;}
});
