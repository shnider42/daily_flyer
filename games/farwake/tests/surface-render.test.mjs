import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSurface,isWalkable,movePerson,nearestEntity,drawSurface,repairSolution} from '../dist/surface.mjs';
import {CABIN_CLASSES,cabinLayout,isCabinWalkable} from '../dist/interior-layouts.mjs';
import {getShipClass} from '../dist/fleet.mjs';
import {SpaceRenderer,drawShip,SHIP_VISUALS} from '../dist/space-art.mjs';
import {seededRandom} from '../dist/engine.mjs';
import {surfaceCanvasToWorld,surfaceWorldToCanvas} from '../dist/camera-view.mjs';

function flood(layout){
 const index=p=>Math.floor(p.y/24)*layout.cols+Math.floor(p.x/24),start=index(layout.spawn),parent=new Map([[start,null]]),queue=[start];
 for(let i=0;i<queue.length;i++){
  const n=queue[i],x=n%layout.cols,y=Math.floor(n/layout.cols);
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*layout.cols+xx;if(xx<0||xx>=layout.cols||yy<0||yy>=layout.rows||!layout.walkable[k]||parent.has(k))continue;parent.set(k,n);queue.push(k);}
 }
 return{parent,index};
}

for(const[classId,berths]of CABIN_CLASSES.map(c=>[c,getShipClass(c).berths]))test(`${classId}: cabins, crew and boarding use one reachable collision map`,()=>{
 const crewCount=Math.max(12,berths-1),crew=Array.from({length:crewCount},(_,i)=>({id:`crew-${i}`,name:`Crew ${i}`,role:i%2?'security':'engineer',health:100}));
 crew.unshift({id:'fallen',name:'Memorial',role:'engineer',health:0,status:'dead'});
 const location={id:'ship:shared',kind:'ship',shipClassId:classId,crew,bunkAssignments:{1:{captainId:'guest'}}},layout=cabinLayout(location),surface=generateSurface(location,'crew-check');
 const {parent,index}=flood(layout);
 assert.equal(surface.berths,berths);assert.equal(surface.entities.filter(e=>e.type==='bunk').length,berths);
 const visibleCrew=surface.entities.filter(e=>e.type==='crew');assert.equal(visibleCrew.length,crewCount,'Full working crews and over-capacity legacy rosters remain physically visible.');assert.ok(!surface.entities.some(e=>e.data?.crewId==='fallen'));
 assert.equal(new Set(visibleCrew.map(e=>`${e.x}:${e.y}`)).size,crewCount,'Living crew never hide beneath one another.');
 if(berths>1)assert.equal(surface.entities.find(e=>e.id==='ship:shared:bunk:1').data.assignedTo,'guest');
 else assert.equal(surface.entities.some(e=>e.id==='ship:shared:bunk:1'),false,'The solo scout does not invent a guest bunk.');
 assert.equal(surface.entities.find(e=>e.id==='ship:shared:exit').data.stationRole,'helm');
 const airlock=surface.entities.find(e=>e.id==='ship:shared:entry-airlock');assert.equal(airlock.type,'exit');assert.equal(airlock.data.stationRole,undefined);assert.equal(airlock.data.airlock,true);assert.equal(airlock.x,layout.spawn.x);assert.equal(airlock.y,layout.spawn.y);
 assert.equal(nearestEntity(surface,layout.spawn,10)?.id,airlock.id,'the arrival collar is usable independently of the helm');
 assert.equal(new Set(layout.combatSpawns.map(p=>index(p))).size,4,'four raiders need distinct arrival positions');
 assert.equal(new Set(layout.crewSpawns.map(p=>index(p))).size,layout.crewSpawns.length,'Every authored standing point is distinct.');
 assert.ok(layout.crewSpawns.length>=crewCount,'Standing space supports both a full working crew and older crowded rosters.');
 for(const p of [...surface.entities,...layout.breaches,...layout.combatSpawns,...layout.crewSpawns]){
  assert.ok(isCabinWalkable(layout,p.x,p.y),`${p.id||p.name||index(p)} is clear in the authority map`);
  assert.ok(parent.has(index(p)),`${p.id||p.name||index(p)} can be reached through doors`);
 }
 for(let y=0;y<layout.rows;y++)for(let x=0;x<layout.cols;x++)assert.equal(isWalkable(surface,(x+.5)*24,(y+.5)*24),Boolean(layout.walkable[y*layout.cols+x]),`renderer and AI disagree at ${x},${y}`);
 // Walk the actual collision code to the helm, including every corridor turn.
 const path=[];for(let n=index(surface.exit);n!==null;n=parent.get(n))path.push(n);path.reverse();
 const person={...surface.spawn,speed:120};
 for(const n of path.slice(1)){const x=(n%layout.cols+.5)*24,y=(Math.floor(n/layout.cols)+.5)*24,dx=Math.abs(x-person.x)<.001?0:Math.sign(x-person.x),dy=Math.abs(y-person.y)<.001?0:Math.sign(y-person.y);movePerson(surface,person,dx,dy,.2);assert.ok(Math.hypot(person.x-x,person.y-y)<.01,`walk stopped at ${person.x},${person.y} before ${x},${y}`);}
 assert.equal(nearestEntity(surface,person,10)?.data.stationRole,'helm');
});

class FakeCanvas{
 static allocations=0;
 constructor(width,height){this.width=width;this.height=height;this.ctx=new FakeContext(this);FakeCanvas.allocations++;}
 getContext(){return this.ctx;}
}
class FakeContext{
 constructor(canvas){this.canvas=canvas;this.textCalls=[];this.imageCalls=0;}
 save(){}restore(){}translate(){}rotate(){}scale(){}fillRect(){}clearRect(){}strokeRect(){}setLineDash(){}
 drawImage(){this.imageCalls++;}fillText(...args){this.textCalls.push(args);}measureText(s){return{width:String(s).length*6};}
}
test('surface labels stay sharp, camera-relative and immutable for remote crew and boarders',()=>{
 const surface=generateSurface({id:'ship:labels',kind:'ship',shipClass:'capital'},'labels'),bridge=surface.rooms.find(room=>room.id==='bridge'),cameraX=bridge.x*24,cameraY=bridge.y*24-24,person={x:cameraX+108,y:cameraY+84,health:85,maxHealth:100,facing:'up'};
 const remotePeople=[{captainId:'guest',name:'Captain Aya',mode:'person',x:cameraX+140,y:cameraY+120,facing:'left'}],boardingActors=[{id:'raider',name:'Boarding raider',x:cameraX+200,y:cameraY+150,team:'hostile',health:23,maxHealth:52,lastShot:{x:cameraX+200,y:cameraY+140,targetX:person.x,targetY:person.y-10,until:9}}];
 const snapshot=JSON.stringify({surface,person,remotePeople,boardingActors}),ctx=new FakeCanvas(360,260).ctx,labels=[];
 const view=drawSurface(ctx,surface,{width:360,height:260,cameraX,cameraY,person,remotePeople,boardingActors,labels,time:15,combatTime:8});
 assert.deepEqual(view,{cameraX,cameraY,width:360,height:260,zoom:1,offsetX:-cameraX,offsetY:-cameraY});assert.equal(ctx.textCalls.length,0,'canvas must not rasterize duplicate instructions');
 const remote=labels.find(l=>l.kind==='remote'),hostile=labels.find(l=>l.kind==='hostile');
 assert.equal(remote.text,'Captain Aya');assert.equal(remote.x,140);assert.equal(remote.y,73);assert.equal(remote.size,13);assert.equal(hostile.text,'Boarding raider');assert.ok(hostile.priority>remote.priority);
 assert.ok(labels.some(l=>l.kind==='room'));assert.ok(labels.every(l=>Number.isFinite(l.x)&&Number.isFinite(l.y)));
 assert.equal(JSON.stringify({surface,person,remotePeople,boardingActors}),snapshot);
});

test('a physical helm projection stays visible and identifies the pilot without duplicating them',()=>{
 const surface=generateSurface({id:'ship:pilot',kind:'ship',shipClass:'sparrow'},'helm-presence'),person={...surface.spawn,health:100},helm=surface.stations.helm;
 const pilot={captainId:'guest',name:'Captain Aya',mode:'person',perspective:'ship',station:'helm',crewRole:'helm',x:helm.x,y:helm.y,vx:0,vy:0,facing:'up',health:100};
 const remotePeople=[pilot,{...pilot}, {...pilot,captainId:'other',name:'Other vessel pilot',mode:'ship'}],before=JSON.stringify({surface,person,remotePeople});
 const render=(people)=>{const labels=[];drawSurface(new FakeCanvas(520,620).ctx,surface,{width:520,height:620,cameraX:0,cameraY:0,person,remotePeople:people,labels,time:3});return labels.filter(label=>label.kind==='remote');};
 let labels=render(remotePeople);assert.equal(labels.length,1,'the authoritative deck representation appears once; unprojected ship views do not become extra people');
 assert.equal(labels[0].text,'Captain Aya · Piloting');assert.equal(labels[0].color,'#e6c58a');assert.equal(labels[0].x,helm.x);assert.equal(labels[0].y,helm.y-47);
 labels=render([{...pilot,sleeping:true}]);assert.equal(labels[0].text,'Captain Aya · Helm (away)','an offline helmsman is visible without claiming active input');
 labels=render([{...pilot,perspective:'person',station:null,crewRole:'passenger'}]);assert.equal(labels[0].text,'Captain Aya','leaving the helm removes the flying cue');
 labels=render([{...pilot,health:0,down:true}]);assert.equal(labels.length,0,'a casualty is not labelled as still piloting');
 assert.equal(JSON.stringify({surface,person,remotePeople}),before,'presentation does not mutate physical crew or deck state');
});

test('interior camera shake keeps rendered labels and pointer picking on the same snapped view',()=>{
 const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=FakeCanvas;
 try{
  const surface=generateSurface({id:'ship:shaken',kind:'ship',shipClass:'sparrow'},'shake'),person={...surface.spawn,health:100};
  const remotePeople=[{captainId:'guest',name:'Captain Aya',mode:'person',x:person.x+40,y:person.y+25}],before=JSON.stringify({surface,person,remotePeople});
  const ctx=new FakeCanvas(360,260).ctx;
  for(const [zoom,rasterScale] of [[1,1],[.8,3],[1.6,1]]){
   const options={width:360,height:260,person,remotePeople,zoom,rasterScale},base=drawSurface(ctx,surface,{...options,labels:[]});
   const labels=[],view=drawSurface(ctx,surface,{...options,labels,cameraShake:{x:99,y:-99}});
   assert.notEqual(view.offsetX,base.offsetX);assert.notEqual(view.offsetY,base.offsetY);
   const shakeLimit=Math.min(14,3.5/zoom);
   assert.ok(Math.abs(view.cameraX-base.cameraX)<=shakeLimit+.5/view.zoom);
   assert.ok(Math.abs(view.cameraY-base.cameraY)<=shakeLimit+.5/view.zoom);
   assert.ok(Number.isInteger(view.offsetX)&&Number.isInteger(view.offsetY),'shake stays on the raster grid');
   const remote=remotePeople[0],label=labels.find(label=>label.kind==='remote'),labelPoint=surfaceWorldToCanvas(remote.x,remote.y-47,view);
   assert.equal(label.x,Math.round(labelPoint.x));assert.equal(label.y,Math.round(labelPoint.y));assert.equal(label.size,13);
   const target=surfaceWorldToCanvas(remote.x,remote.y,view),picked=surfaceCanvasToWorld(target.x,target.y,view);
   assert.ok(Math.abs(picked.x-remote.x)<1e-8&&Math.abs(picked.y-remote.y)<1e-8,'aiming uses the displayed shaken position');
   assert.deepEqual(drawSurface(ctx,surface,{...options,labels:[],cameraShake:{x:0,y:0}}),base,'an expired impulse leaves no camera drift');
  }
  assert.equal(JSON.stringify({surface,person,remotePeople}),before,'shake never moves the physical people or deck');
 }finally{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;}
});

test('persisted rooms and outposts have ownership labels without changing collision',()=>{
 const surface=generateSurface('morrow','home-check'),person={...surface.spawn},homes=[
  {id:'own-home',ownerId:'local',ownerName:'Henri',kind:'outpost',x:person.x-50,y:person.y-30,systemId:surface.systemId,locationId:surface.id},
  {id:'other-home',ownerId:'other',ownerName:'Aya',kind:'room',x:person.x+70,y:person.y+30,systemId:surface.systemId,locationId:surface.id},
  {id:'wrong-port',ownerId:'other',ownerName:'Elsewhere',kind:'room',x:person.x,y:person.y,locationId:'kettle'}
 ],before=JSON.stringify({surface,person,homes}),labels=[],ctx=new FakeCanvas(400,300).ctx;
 const walkable=homes.slice(0,2).map(h=>isWalkable(surface,h.x,h.y));
 drawSurface(ctx,surface,{width:400,height:300,person,homes,localCaptainId:'local',labels,time:2});
 const markers=labels.filter(l=>l.kind==='home');assert.equal(markers.length,2);
 assert.equal(markers[0].text,'Your outpost');assert.equal(markers[0].color,'#e5be79');assert.equal(markers[1].text,'Aya’s room');assert.equal(markers[1].color,'#8ec8d2');assert.ok(markers.every(l=>l.size>=12));
 assert.equal(ctx.textCalls.length,0);assert.equal(JSON.stringify({surface,person,homes}),before);assert.deepEqual(homes.slice(0,2).map(h=>isWalkable(surface,h.x,h.y)),walkable);
});

function demoGame(shipClass='sparrow'){
 return{state:{systemId:'render-test',stats:{time:8},ship:{id:'player',x:100,y:200,shipClass,hull:100,maxHull:100,angle:0,vx:20,shield:30}},system:{bodies:[{id:'station-test',kind:'station',name:'Test Station',x:200,y:120,radius:35},{id:'planet-test',kind:'planet',biome:'arid',name:'Test World',x:-80,y:100,radius:55}],asteroids:[],enemies:[],traffic:[],signals:[],bullets:[],pickups:[]}};
}
test('space labels preserve world picking, fit the capital and cache artwork after warmup',()=>{
 const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=FakeCanvas;
 try{
  const game=demoGame('capital'),ctx=new FakeCanvas(200,340).ctx,renderer=new SpaceRenderer(),labels=[],remoteShips=[{id:'remote-test',name:'Captain Vale',ship:{name:'Wayfarer II',x:180,y:250,shipClass:'hauler',hull:100,maxHull:100}}],before=JSON.stringify({game,remoteShips});
  const view=renderer.draw(ctx,game,{width:200,height:340,time:1,labels,remoteShips,motion:false});
  assert.ok(SHIP_VISUALS.capital.length*view.zoom<=200*.44+.01);assert.deepEqual(renderer.toWorld(100,170),{x:view.cameraX,y:view.cameraY});assert.deepEqual(renderer.camera,{x:100,y:200},'the eased camera keeps its original continuous coordinates');assert.ok(Math.abs(view.cameraX-100)*view.zoom<=.5);
  const picked=renderer.toWorld(100+40*view.zoom,170-30*view.zoom);assert.ok(Math.hypot(picked.x-(view.cameraX+40),picked.y-(view.cameraY-30))<1e-8);assert.equal(ctx.textCalls.length,0);
  const remote=labels.find(l=>l.kind==='remote');assert.equal(remote.text,'Wayfarer II');assert.equal(remote.x,Math.round(180*view.zoom+view.offsetX));
  assert.ok(labels.some(l=>l.kind==='place'));assert.equal(JSON.stringify({game,remoteShips}),before);
  // Warm both beacon phases; a moving frame must not allocate new canvases.
  renderer.draw(ctx,game,{time:1,labels:[],motion:true,remoteShips});renderer.draw(ctx,game,{time:2,labels:[],motion:true,remoteShips});
  const allocations=FakeCanvas.allocations;
  for(let i=0;i<30;i++)renderer.draw(ctx,game,{time:2+i*.1,labels:[],motion:true,remoteShips});
  assert.equal(FakeCanvas.allocations,allocations);
  assert.deepEqual(drawShip(ctx,100,100,0,'#c6d5c8',1,false,0,false,'capital'),{length:260,width:128});
  const tracking=[];renderer.draw(ctx,game,{time:5,labels:tracking,remoteShips:[{id:'far-ship',ship:{name:'Distant Wayfarer',x:5000,y:200}}],tracked:'far-ship'});
  assert.ok(tracking.some(l=>l.kind==='objective'&&l.text.includes('Distant Wayfarer')),'nested remote vessels remain trackable');
 }finally{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;}
});

test('shared repair solutions match the engine seed without importing game state',()=>{
 for(const id of['listening:repair:0','kettle:work:2','unexplored-port:relay']){const rng=seededRandom(id);assert.deepEqual(repairSolution(id),[Math.floor(rng()*4),Math.floor(rng()*4),Math.floor(rng()*4)]);}
});

test('boarded vessels keep their name and tether while parked hulls remain visible without duplicate shared hulls',()=>{
 const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=FakeCanvas;
 try{
  const game=demoGame(),renderer=new SpaceRenderer(),ctx=new FakeCanvas(500,400).ctx,labels=[];
  game.state.boarding={phase:'active',originVesselId:'player',targetVesselId:'target'};
  game.system.enemies=[{id:'target',name:'Copper Finch',classId:'hauler',x:220,y:200,hp:30,maxHp:100,disabled:true,boardingOriginId:'player',boardingTargetId:'player',occupation:{contested:true}}];
  game.system.parkedShips=[{id:'parked',name:'Homeward',classId:'sparrow',x:80,y:310,hull:70,maxHull:100}];
  renderer.draw(ctx,game,{width:500,height:400,time:1,labels,motion:false});
  assert.ok(labels.some(label=>label.kind==='boarding'&&label.text==='Copper Finch'));
  assert.ok(labels.some(label=>label.kind==='boarding'&&label.text.startsWith('CONTESTED · 6 BERTHS')));
  assert.equal(labels.filter(label=>label.kind==='boarding-link').length,1);
  assert.ok(labels.some(label=>label.kind==='parked'&&label.text==='Homeward'));
  game.system.enemies[0].canonicalVesselId='target';
  const promotedLabels=[];
  renderer.draw(ctx,game,{width:500,height:400,time:1.1,labels:promotedLabels,motion:false,remoteShips:[{id:'target',ship:{id:'target',name:'Copper Finch',classId:'hauler',x:220,y:200,hull:30,maxHull:100}}]});
  assert.equal(promotedLabels.filter(label=>label.text==='Copper Finch').length,1,'the canonical shared hull replaces its NPC exterior');
  assert.equal(promotedLabels.filter(label=>label.kind==='boarding-link').length,1);
 }finally{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;}
});
