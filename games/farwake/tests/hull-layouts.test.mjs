import test from 'node:test';
import assert from 'node:assert/strict';
import {CABIN_CLASSES,CABIN_REVISION,cabinLayout,isCabinWalkable,nearestCabinPoint} from '../dist/interior-layouts.mjs';
import {getShipClass} from '../dist/fleet.mjs';
import {generateSurface,TILE,isWalkable} from '../dist/surface.mjs';

const index=(l,p)=>Math.floor(p.y/l.tile)*l.cols+Math.floor(p.x/l.tile);
function connected(l){const start=index(l,l.spawn),seen=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++){const key=queue[i],x=key%l.cols,y=Math.floor(key/l.cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,next=yy*l.cols+xx;if(xx>=0&&xx<l.cols&&yy>=0&&yy<l.rows&&l.walkable[next]&&!seen.has(next)){seen.add(next);queue.push(next);}}}return seen;}
for(const id of CABIN_CLASSES)test(`${id}: every deck tile and fitting remains inside the physical hull and reachable`,()=>{
 const l=cabinLayout(id),hull=getShipClass(id),surface=generateSurface({id:`layout:${id}`,kind:'ship',shipClass:id},'pressure-hull');
 assert.equal(l.hullForward,'up');assert.equal(l.revision,CABIN_REVISION);assert.equal(l.berths,hull.berths);
 const expectedRatio=hull.stats.renderLength/hull.stats.renderWidth,deckRatio=l.rows/l.cols;
 assert.ok(Math.abs(deckRatio/expectedRatio-1)<.12,`Deck proportions ${deckRatio} should track exterior ${expectedRatio}.`);
 const reachable=connected(l);assert.equal(reachable.size,l.walkable.filter(Boolean).length,'No isolated floor islands may trap a captain or a boarder.');
 for(let y=0;y<l.rows;y++)for(let x=0;x<l.cols;x++){
  const key=y*l.cols+x;
  if(l.floor[key])assert.equal(l.hullMask[key],1,`Floor is outside the hull at ${x},${y}.`);
  if(!l.hullMask[key])assert.equal(surface.tiles[y][x],TILE.VOID,`The renderer must leave vacuum at ${x},${y}.`);
  assert.equal(isWalkable(surface,(x+.5)*24,(y+.5)*24),Boolean(l.walkable[key]),`Client and authority collision disagree at ${x},${y}.`);
 }
 for(const f of l.fixtures)if(f.solid)for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)assert.equal(l.hullMask[y*l.cols+x],1,`${f.kind} cannot hang outside the pressure hull.`);
 for(const p of [l.spawn,l.archive,l.manifest,...l.bunks,...Object.values(l.stations),...l.crewSpawns,...l.combatSpawns,...l.breaches])assert.ok(isCabinWalkable(l,p.x,p.y,6));
 assert.ok(l.hullMask.filter(Boolean).length<l.cols*l.rows*.86,'A silhouette must have meaningful vacuum around it.');
});

test('salvage hulls retain an open forward cradle between accessible arms',()=>{
 for(const id of ['mule','atlas']){
  const l=cabinLayout(id),fore=Math.round(l.rows*.2),center=Math.floor(l.cols/2);
  assert.equal(l.hullMask[fore*l.cols+center],0,`${id} forward cradle is open to space.`);
  assert.equal(l.walkable[fore*l.cols+center],0);
  assert.ok(l.hullMask.slice(fore*l.cols,fore*l.cols+center).some(Boolean),'A port arm flanks the cradle.');
  assert.ok(l.hullMask.slice(fore*l.cols+center,fore*l.cols+l.cols).some(Boolean),'A starboard arm flanks the cradle.');
  assert.ok(l.stations.helm.y>l.rows*l.tile*.5,'Cradle control sits aft of the open jaws.');
 }
 const scout=cabinLayout('kestrel'),cutter=cabinLayout('sparrow');
 assert.ok(scout.rows/scout.cols>cutter.rows/cutter.cols,'The scout is distinctly narrower than the cutter.');
 const signatures=CABIN_CLASSES.map(id=>{const l=cabinLayout(id);return JSON.stringify({rooms:l.rooms.map(r=>[r.id,r.x/l.cols,r.y/l.rows,r.w/l.cols,r.h/l.rows]),corridors:l.corridors});});
 assert.equal(new Set(signatures).size,CABIN_CLASSES.length,'Every hull has its own authored room arrangement.');
});

test('saved pose migration preserves valid positions and moves invalid positions onto the nearest safe deck',()=>{
 for(const id of CABIN_CLASSES){
  const l=cabinLayout(id),valid={x:l.spawn.x+2,y:l.spawn.y+1};
  assert.deepEqual(nearestCabinPoint(l,valid.x,valid.y),valid);
  for(const invalid of [{x:-900,y:80},{x:l.width/2,y:-500},{x:Infinity,y:NaN}]){
   const migrated=nearestCabinPoint(l,invalid.x,invalid.y);assert.ok(isCabinWalkable(l,migrated.x,migrated.y));
   assert.deepEqual(nearestCabinPoint(l,migrated.x,migrated.y),migrated);
  }
 }
});

test('cached geometry cannot be changed by a renderer or another ship instance',()=>{
 const first=cabinLayout('sparrow'),before=JSON.stringify(cabinLayout('sparrow'));
 first.walkable.fill(0);first.floor.fill(0);first.hullMask.fill(0);first.rooms[0].name='Changed';first.hullOutline[0].x=-1;first.stations.helm.x=-1;first.spawn.x=-1;
 assert.equal(JSON.stringify(cabinLayout('sparrow')),before);
});
