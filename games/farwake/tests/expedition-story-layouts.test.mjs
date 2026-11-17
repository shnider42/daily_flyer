import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {expeditionStoryLayout,EXPEDITION_LAYOUT_IDS,EXPEDITION_LAYOUT_ANCHORS} from '../dist/expedition-story-layouts.mjs';
import {drawExpeditionWildlife,drawExpeditionProp,EXPEDITION_WILDLIFE} from '../dist/expedition-story-art.mjs';

const blocked=new Set([0,2,5]),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function flood(p){
 const start=p.spawn.y*p.cols+p.spawn.x,seen=new Set([start]),queue=[start];
 for(let i=0;i<queue.length;i++){const n=queue[i],x=n%p.cols,y=Math.floor(n/p.cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*p.cols+xx;if(xx>=0&&yy>=0&&xx<p.cols&&yy<p.rows&&!blocked.has(p.tiles[yy][xx])&&!seen.has(k)){seen.add(k);queue.push(k);}}}
 return seen;
}

for(const layout of EXPEDITION_LAYOUT_IDS)test(`${layout}: the authored geography is deterministic and every floor and task anchor has a way home`,()=>{
 const site={layout,records:[{x:14,y:10}],choices:[{x:38,y:13}],caches:[{x:35,y:26}],residents:[{x:8,y:28}],hostiles:[{tileX:17,tileY:11},{tileX:37,tileY:13},{tileX:38,tileY:21}]},before=JSON.stringify(site),p=expeditionStoryLayout(site),seen=flood(p);
 assert.deepEqual(expeditionStoryLayout(site),p);assert.equal(JSON.stringify(site),before,'generating a map must not mutate the catalogue');
 assert.equal(p.cols,48);assert.equal(p.rows,36);assert.deepEqual(p.spawn,{x:4,y:31});assert.deepEqual(p.exit,{x:2,y:31});
 for(const a of p.anchors)assert.ok(seen.has(a.y*p.cols+a.x),`${layout}: an authored interaction or unit at ${a.x},${a.y} is cut off`);
 assert.equal(seen.size,p.tiles.flat().filter(t=>!blocked.has(t)).length,'there are no stranded walkable pockets');
 for(let y=29;y<34;y++)for(let x=1;x<7;x++)assert.ok(!blocked.has(p.tiles[y][x]),'the arrival apron fits a captain and joining crew');
 assert.ok(p.zones.length>=2);assert.ok(p.decor.some(d=>d.kind==='story-trail-marker'),'the safe return has a visible marker');
});

test('sixteen layouts differ in physical routing, with exposed outdoor edges and real water crossings',()=>{
 const plans=EXPEDITION_LAYOUT_IDS.map(layout=>expeditionStoryLayout({layout}));
 assert.equal(new Set(plans.map(p=>digest(p.tiles))).size,16);
 for(let i=0;i<plans.length;i++)for(let j=i+1;j<plans.length;j++){
  const a=plans[i].tiles.flat().map(t=>blocked.has(t)),b=plans[j].tiles.flat().map(t=>blocked.has(t));
  assert.ok(a.filter((v,n)=>v!==b[n]).length>=80,`${plans[i].layout} and ${plans[j].layout} must change traversable geography, not just colors`);
 }
 for(const p of plans.filter(p=>p.outdoors)){
  const rim=[...p.tiles[0],...p.tiles.at(-1),...p.tiles.map(row=>row[0]),...p.tiles.map(row=>row.at(-1))];
  assert.ok(rim.filter(t=>t===0||t===2).length<rim.length*.2,`${p.layout} is an open landscape, not an enclosed room`);
 }
 const river=plans.find(p=>p.layout==='bridgefront');assert.equal(river.tiles[6][23],5);assert.equal(river.tiles[10][23],9);assert.equal(river.tiles[26][23],7);
 const reef=plans.find(p=>p.layout==='tidal-reef');assert.ok(reef.tiles.flat().filter(t=>t===5).length>500);assert.ok(reef.tiles.flat().filter(t=>t===9).length>80);
 const plant=plans.find(p=>p.layout==='powerplant');assert.equal(plant.outdoors,false);assert.equal(plant.decor.filter(d=>d.kind==='engine').length,3,'three separated turbine beds create different service routes');
 const road=plans.find(p=>p.layout==='convoy-road');assert.equal(road.decor.filter(d=>d.kind==='story-wreckage').length,3,'convoy vehicles are physical road cover');
});

test('off-route authored objects gain reachable access without being moved',()=>{
 const site={layout:'flooded-ruins',records:[{id:'isolated',x:3,y:4}],choices:[{id:'water-console',x:24,y:18}],residents:[{id:'stranded',x:43,y:29}],hostiles:[{x:(39.5)*24,y:(5.5)*24}]},p=expeditionStoryLayout(site),seen=flood(p);
 for(const[x,y]of[[3,4],[24,18],[43,29],[39,5]])assert.ok(seen.has(y*48+x),`access to ${x},${y}`);
 assert.ok(p.tiles.flat().filter(t=>t===5).length>800,'access repairs retain the flooded landscape');
 assert.deepEqual(EXPEDITION_LAYOUT_ANCHORS.entry,[4,31]);
});

class Recorder{
 constructor(canvas=null){this.canvas=canvas;this.x=0;this.y=0;this.stack=[];this.pixels=new Set();this.rects=[];this.images=0;}
 save(){this.stack.push([this.x,this.y]);}restore(){[this.x,this.y]=this.stack.pop();}translate(x,y){this.x+=x;this.y+=y;}
 fillRect(x,y,w,h){this.rects.push([x+this.x,y+this.y,w,h,this.fillStyle]);for(let yy=Math.round(y+this.y);yy<Math.round(y+this.y+h);yy++)for(let xx=Math.round(x+this.x);xx<Math.round(x+this.x+w);xx++)this.pixels.add(`${xx},${yy}`);}
 drawImage(){this.images++;}
}

test('all eight expedition creatures have distinct nonhuman outlines and death poses',()=>{
 const masks=[];
 for(const species of EXPEDITION_WILDLIFE){const actor={species,x:64,y:64,health:100,facing:'right'},ctx=new Recorder(),before=JSON.stringify(actor);assert.equal(drawExpeditionWildlife(ctx,actor,2),true);assert.equal(JSON.stringify(actor),before);masks.push(digest([...ctx.pixels].sort()));
  const dead=new Recorder();drawExpeditionWildlife(dead,{...actor,health:0},2);assert.notEqual(digest([...ctx.pixels].sort()),digest([...dead.pixels].sort()));
  assert.ok(ctx.rects.every(r=>r.slice(0,4).every(Number.isFinite)));
 }
 assert.equal(new Set(masks).size,8,'different species require visibly different outlines, independent of palette');
 assert.equal(drawExpeditionWildlife(new Recorder(),{species:'bellwether',x:1,y:1,health:100},0),false,'Hearth keeps its existing renderer');
});

test('expedition props and creatures reuse cached sprites after warmup',()=>{
 const previous=globalThis.OffscreenCanvas;let allocations=0;
 class Canvas{constructor(width,height){this.width=width;this.height=height;this.ctx=new Recorder(this);allocations++;}getContext(){return this.ctx;}}
 globalThis.OffscreenCanvas=Canvas;
 try{
  const ctx=new Recorder(),props=['story-trail-marker','story-gate','story-sandbags','story-wreckage','story-tent','story-mushroom','story-nest','story-dish','coral'].map(kind=>({kind,x:10,y:12,w:72,h:48,color:'#9cafa8'}));
  const render=time=>{for(const d of props)assert.equal(drawExpeditionProp(ctx,d),true);for(const species of EXPEDITION_WILDLIFE)drawExpeditionWildlife(ctx,{species,x:60,y:60,health:100},time);};
  render(1);const warm=allocations;assert.ok(warm>=17);for(let i=0;i<30;i++)render(i*.2);assert.equal(allocations,warm);assert.ok(ctx.images>500);
  assert.equal(drawExpeditionProp(ctx,{kind:'cave-mouth',x:0,y:0,w:96,h:72}),false,'original cave facade remains original art');
 }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});
