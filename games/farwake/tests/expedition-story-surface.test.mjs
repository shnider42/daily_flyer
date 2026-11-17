import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPEDITION_ARCHETYPES,materializeExpeditionArchetype} from '../dist/expedition-stories.mjs';
import {EXPEDITION_LAYOUT_IDS} from '../dist/expedition-story-layouts.mjs';
import {generateSurface,isWalkable,movePerson,drawSurface,drawSurfaceMap} from '../dist/surface.mjs';
import {createSiteState} from '../dist/exploration.mjs';
import {storySurfaceView} from '../dist/expedition-story-rules.mjs';

const body={id:'expedition-geometry-check',name:'Geometry check',kind:'planet',systemId:'qa',biome:'temperate'};
function location(site){return{id:site.key,name:site.name,kind:'site',parentId:body.id,site};}
function flood(surface){
 const index=p=>Math.floor(p.y/24)*surface.cols+Math.floor(p.x/24),start=index(surface.spawn),parent=new Map([[start,null]]),queue=[start];
 for(let i=0;i<queue.length;i++){const n=queue[i],x=n%surface.cols,y=Math.floor(n/surface.cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*surface.cols+xx;if(xx<0||yy<0||xx>=surface.cols||yy>=surface.rows||parent.has(k)||!isWalkable(surface,(xx+.5)*24,(yy+.5)*24,6))continue;parent.set(k,n);queue.push(k);}}
 return{index,parent};
}

for(const archetype of EXPEDITION_ARCHETYPES.filter(a=>!a.legacy))test(`${archetype.id}: every authored story interaction and unit fits the actual physical map`,()=>{
 assert.ok(EXPEDITION_LAYOUT_IDS.includes(archetype.layout),'catalogue layout must be implemented explicitly');
 const site=materializeExpeditionArchetype(archetype,body,'story-geometry'),surface=generateSurface(location(site),'story-geometry'),{index,parent}=flood(surface),state=createSiteState(site);
 assert.equal(surface.kind,'site');assert.equal(surface.cols,48);assert.equal(surface.rows,36);assert.equal(surface.outdoors,site.outdoors);assert.equal(surface.expeditionLayout,site.layout);
 assert.equal(surface.entities.find(e=>e.type==='siteExit').name,site.outdoors?'Return to landing trails':'Return to surface');
 for(const e of [...surface.entities,...state.monsters]){
  assert.ok(isWalkable(surface,e.x,e.y,6),`${e.id} is blocked`);assert.ok(parent.has(index(e)),`${e.id} cannot reach the exit`);
  assert.equal(surface.combatLayout.walkable[index(e)],1,'combat and person movement share the physical terrain');
  const route=[];for(let n=index(e);n!==null;n=parent.get(n))route.push(n);route.reverse();const person={...surface.spawn,speed:120};
  for(const n of route.slice(1)){const x=(n%surface.cols+.5)*24,y=(Math.floor(n/surface.cols)+.5)*24,dx=Math.abs(x-person.x)<.001?0:Math.sign(x-person.x),dy=Math.abs(y-person.y)<.001?0:Math.sign(y-person.y);movePerson(surface,person,dx,dy,.2);assert.ok(Math.hypot(person.x-x,person.y-y)<.001,`${e.id}: collision blocks the route at ${x},${y}`);}
 }
 for(const unit of state.monsters)assert.ok(Math.hypot(unit.x-surface.spawn.x,unit.y-surface.spawn.y)>=240,`${unit.name} starts too close to arriving captains`);
});

test('outdoor story entrance and exit labels describe the trail and carry its authored briefing',()=>{
 const surface=generateSurface({id:'kindred-landing',kind:'planet'},'story-entrance'),entrances=surface.entities.filter(e=>e.type==='siteEntrance'&&e.data.expedition);
 assert.ok(entrances.length>=2);
 for(const e of entrances){const site=surface.sites.find(s=>s.id===e.data.siteId);assert.equal(e.data.outdoors,site.outdoors);assert.equal(e.data.actionLabel,site.outdoors?'Follow trail':'Enter');assert.equal(e.role,e.data.actionLabel);assert.equal(e.data.objective,site.objective);assert.equal(e.data.storyType,site.storyType||site.genre);}
 assert.ok(surface.decor.some(d=>d.kind==='story-trail-marker'));
});

test('injured authored residents retain their wounds until a rescue actually treats them',()=>{
 const site=materializeExpeditionArchetype('courier-crash',body,'medical-story'),surface=generateSurface(location(site),'medical-story'),person=surface.entities.find(e=>e.type==='npc'),state=createSiteState(site);
 assert.equal(person.health,34);assert.equal(person.maxHealth,100);
 assert.equal(storySurfaceView(surface,state).entities.find(e=>e.id===person.id).health,34);
 state.choices.hatch='complete';state.story.revision++;
 const rescued=storySurfaceView(surface,state).entities.find(e=>e.id===person.id);assert.equal(rescued.health,100);assert.equal(rescued.hidden,true);assert.equal(person.health,34,'presentation leaves the base map immutable');
});

class Context{
 constructor(){this.canvas={width:420,height:320};this.rects=0;this.text=[];}
 save(){}restore(){}translate(){}scale(){}rotate(){}clearRect(){}fillRect(){this.rects++;}strokeRect(){}drawImage(){}setLineDash(){}
 fillText(value){this.text.push(value);}measureText(value){return{width:String(value).length*6};}
}

test('map and world colors distinguish an unprovoked faction from a threat to this captain',()=>{
 const site=materializeExpeditionArchetype('relief-bridge',body,'map-factions'),surface=generateSurface(location(site),'map-factions'),state=createSiteState(site),first=state.monsters[0];
 for(const unit of state.monsters)unit.alert=true;
 first.aggressors=['captain-one'];
 const firstMap=drawSurfaceMap(new Context(),surface,{exploration:state,localCaptainId:'captain-one'}),secondMap=drawSurfaceMap(new Context(),surface,{exploration:state,localCaptainId:'captain-two'});
 assert.equal(firstMap.markers.find(m=>m.id===first.id).kind,'hostile');assert.equal(secondMap.markers.find(m=>m.id===first.id).kind,'infantry');
 const before=JSON.stringify({surface,state}),labels=[],ctx=new Context();
 drawSurface(ctx,surface,{person:{...surface.spawn,health:100},cameraX:first.x-100,cameraY:first.y-100,width:420,height:320,exploration:state,localCaptainId:'captain-one',labels,time:2});
 assert.ok(labels.some(l=>l.kind==='hostile'&&l.text===first.name));assert.ok(ctx.rects>100);assert.equal(JSON.stringify({surface,state}),before);
});
