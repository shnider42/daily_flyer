import test from 'node:test';
import assert from 'node:assert/strict';
import { socialPlaces, recurringPresence, socialConversation, normalizeSocialVisits } from '../dist/social-world.mjs';
import { createAmbientMemory, sampleAmbientConversation } from '../dist/ambient-social.mjs';
import { explorationSites, explorationLocation, createSiteState, claimSiteReward } from '../dist/exploration.mjs';
import { generateSurface, isWalkable, evaLayout, drawSurface } from '../dist/surface.mjs';
import { updateNpcLife } from '../dist/npc-life.mjs';
import { conversation } from '../dist/npc-dialogue.mjs';

const body=id=>({id,name:id,kind:'planet',systemId:id==='reedbank'?'greenwake':'remote',biome:'temperate'});
const interior=(id,siteId)=>generateSurface(explorationLocation(body(id),siteId,'social-check'),'social-check');
const walkableEntities=surface=>{
 const t=surface.tileSize,start=Math.floor(surface.spawn.y/t)*surface.cols+Math.floor(surface.spawn.x/t),seen=new Set([start]),queue=[start];
 for(let i=0;i<queue.length;i++){const cell=queue[i],x=cell%surface.cols,y=Math.floor(cell/surface.cols);for(const[xx,yy]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const next=yy*surface.cols+xx;if(xx<0||yy<0||xx>=surface.cols||yy>=surface.rows||seen.has(next)||!isWalkable(surface,(xx+.5)*t,(yy+.5)*t))continue;seen.add(next);queue.push(next);}}
 for(const entity of surface.entities)assert.ok(seen.has(Math.floor(entity.y/t)*surface.cols+Math.floor(entity.x/t)),`${surface.id}/${entity.id} is unreachable`);
};

test('social rooms are absent from Hearth and sparse, deterministic, and bounded across frontier planets',()=>{
 for(const id of['morrow','kettle','tinbell'])assert.deepEqual(socialPlaces({id,kind:'planet',systemId:'hearth'},'test'),[]);
 let count=0;const styles=new Set();
 for(let n=0;n<1000;n++){const world={id:`frontier-social-${n}-world`,kind:'planet',biome:'temperate',systemId:`frontier-${n}`},a=socialPlaces(world,'rare'),b=socialPlaces(world,'rare');assert.deepEqual(a,b);assert.ok(a.length<=1);if(a.length){count++;styles.add(a[0].style);assert.equal(a[0].hostile,false);assert.deepEqual(a[0].caches,[]);}}
 assert.ok(count>=20&&count<=65,`expected around one in25, got${count}/1000`);assert.equal(styles.size,7);
 assert.deepEqual(socialPlaces({id:'frontier-ordinary-world',kind:'planet',biome:'barren'},'rare'),[]);
});

test('every new ordinary venue is reachable, has no compulsory combat or loot, and preserves its environmental records',()=>{
 const places=[];
 for(const id of['kindred-landing','tessera','ochre-garden','chora','noonless','reedbank'])for(const site of explorationSites(body(id),'social-check').filter(site=>site.kind==='social'))places.push({world:body(id),site});
 const styles=new Set(places.map(({site})=>site.style));
 for(let n=0;styles.size<9&&n<1000;n++){const world=body(`frontier-social-${n}-world`),site=explorationSites(world,'social-check').find(site=>site.kind==='social');if(site&&!styles.has(site.style)){styles.add(site.style);places.push({world,site});}}
 assert.ok(places.length>=9);
 for(const{world,site}of places){const surface=generateSurface(explorationLocation(world,site.id,'social-check'),'social-check');walkableEntities(surface);assert.equal(site.hostile,false);assert.equal(createSiteState(site).monsters.length,0);assert.equal(surface.entities.filter(entity=>entity.type==='siteCache').length,0);assert.ok(surface.entities.filter(entity=>entity.type==='siteRecord').length>=2);for(const t of[0,360,720,1320]){updateNpcLife(surface,t);for(const entity of surface.entities.filter(entity=>!entity.hidden))assert.ok(isWalkable(surface,entity.x,entity.y));}}
});

test('a preflight village has its own ordinary culture, walking paths and landing exit, with no modern services',()=>{
 const surface=generateSurface({...body('reedbank'),techLevel:'preflight',portServices:false,culture:'reedbound'},'village');walkableEntities(surface);
 assert.equal(surface.noPortServices,true);assert.ok(surface.entities.some(entity=>entity.type==='exit'));
 assert.ok(surface.entities.filter(entity=>entity.type==='npc').length>=4);
 assert.ok(!surface.entities.some(entity=>['mechanic','medic','jobboard','work','station'].includes(entity.type)||entity.data?.serviceDesk||entity.data?.contactId));
 assert.ok(!surface.decor.some(prop=>['console','equipment','engine','vending','antenna'].includes(prop.kind)));
 const game={state:{stats:{time:0},flags:[],rep:{freewake:100},narrative:{},missions:[],systemId:'greenwake',locationId:'reedbank'}};
 for(const entity of surface.entities.filter(entity=>entity.type==='npc')){const response=conversation(game,entity);assert.equal(response.context,'culture');assert.equal(response.relationship,'Visitor');assert.ok(!/shipyard|spaceport|credits|passenger|starship|night watch/i.test(response.greeting+' '+response.rumor));}
});

test('benign farm animals wander on their own floor and never enter the hostile encounter roster',()=>{
 for(const surface of[interior('ochre-garden','held-breath'),generateSurface(body('reedbank'),'village')]){
  assert.equal(surface.ambientAnimals.length,3);const starts=surface.ambientAnimals.map(animal=>({x:animal.x,y:animal.y}));
  for(let t=0;t<90;t+=.25){updateNpcLife(surface,t);for(const animal of surface.ambientAnimals){assert.ok(isWalkable(surface,animal.x,animal.y));assert.equal(animal.hostile,undefined);assert.equal(animal.team,undefined);}}
  assert.ok(surface.ambientAnimals.some((animal,index)=>Math.hypot(animal.x-starts[index].x,animal.y-starts[index].y)>1));
 }
});

test('an itinerant exists at only one stop and walks through actual doors when arriving or leaving',()=>{
 const a=interior('tessera','small-mercy'),b=interior('kindred-landing','table-of-arrivals'),get=surface=>surface.entities.find(entity=>entity.data?.recurringId==='tamsin-rue');
 let before=null;
 for(let seconds=0;seconds<=3000;seconds+=.25){updateNpcLife(a,seconds);updateNpcLife(b,seconds);const visible=[get(a),get(b)].filter(entity=>!entity.hidden);assert.ok(visible.length<=1,'one traveler cannot occupy two planets');if(visible.length){const current=visible[0],surface=current===get(a)?a:b;assert.ok(isWalkable(surface,current.x,current.y));if(before?.id===surface.id)assert.ok(Math.hypot(current.x-before.x,current.y-before.y)<18,'arrival/departure changes cannot teleport');before={id:surface.id,x:current.x,y:current.y};}else before=null;}
 updateNpcLife(a,300);updateNpcLife(b,300);assert.equal(get(a).hidden,false);assert.equal(get(b).hidden,true);
 updateNpcLife(a,1740);updateNpcLife(b,1740);assert.equal(get(a).hidden,true);assert.equal(get(b).hidden,false);
});

test('recurring people remember real later visits without click farming or divergent world stories',()=>{
 const a=interior('tessera','small-mercy'),b=interior('kindred-landing','table-of-arrivals'),tamsin=surface=>surface.entities.find(entity=>entity.data?.recurringId==='tamsin-rue'),state={stats:{time:0},locationId:a.id};
 const first=socialConversation(state,tamsin(a),300);assert.equal(first.relationship,'First meeting');assert.equal(state.socialVisits.people[0].meetings,1);
 for(let n=0;n<20;n++)socialConversation(state,tamsin(a),301+n);assert.equal(state.socialVisits.people[0].meetings,1);
 socialConversation(state,tamsin(b),1740);assert.equal(state.socialVisits.people[0].meetings,2);
 const before=JSON.stringify(state),reading=socialConversation(state,tamsin(b),6000,{record:false});assert.equal(JSON.stringify(state),before);assert.equal(reading.storyStage,2);
 const stranger=socialConversation({stats:{}},tamsin(b),6000,{record:false});assert.equal(stranger.storyStage,reading.storyStage);assert.match(reading.greeting,/letters/);assert.match(stranger.greeting,/letters/);
 const restored=JSON.parse(JSON.stringify(state));assert.match(socialConversation(restored,tamsin(b),6000).greeting,/Since we last spoke/);assert.equal(normalizeSocialVisits({people:Array.from({length:500},(_,i)=>({id:`fake-${i}`,meetings:900}))}).people.length,0);
});

test('ambient conversations require actual nearby awake people and leave long quiet intervals',()=>{
 const surface={id:'quiet-court',seed:42,kind:'site',systemId:'remote',socialStyle:'park',entities:[{id:'one',type:'npc',name:'One',x:100,y:100,life:{activity:'resting'}},{id:'two',type:'npc',name:'Two',x:140,y:100,life:{activity:'working'}}]},person={x:110,y:120};
 let memory=createAmbientMemory(surface,0),found=[];
 for(let seconds=0;seconds<5000;seconds++){const cue=sampleAmbientConversation(surface,seconds,person,{memory});if(cue){assert.ok(seconds>=45);if(found.length)assert.ok(seconds-found.at(-1).at>=240);assert.ok(cue.lines.length<=2);found.push({...cue,at:seconds});memory=cue.nextMemory;}}
 assert.ok(found.length>0&&found.length<12,'a quiet place must not become a continuous dialogue feed');
 const event=found.find(cue=>cue.kind==='overheard');assert.ok(event);
 const initial=createAmbientMemory(surface,0);assert.equal(sampleAmbientConversation({...surface,systemId:'hearth'},event.at,person,{memory:initial}),null);
 assert.equal(sampleAmbientConversation(surface,event.at,{x:999,y:999},{memory:initial}),null);
 assert.equal(sampleAmbientConversation({...surface,entities:surface.entities.map(entity=>({...entity,life:{activity:'sleeping'}}))},event.at,person,{memory:initial}),null);
 assert.equal(sampleAmbientConversation(surface,event.at,person,{memory:initial,allow:false}),null);
 assert.deepEqual(createAmbientMemory(surface,0),initial,'sampling does not mutate caller memory');
});

test('EVA uses a reachable short exterior route on the actual selected hull',()=>{
 for(const classId of['sparrow','mule','hauler','frigate','capital']){const layout=evaLayout(classId),surface=generateSurface({id:'eva:actual',vesselId:'actual',classId,kind:'eva'},'hull');assert.equal(surface.kind,'eva');assert.equal(surface.shipClass,classId);assert.deepEqual(surface.spawn,layout.spawn);assert.ok(layout.path.length>=8&&layout.path.length<=13);for(const point of layout.path)assert.ok(isWalkable(surface,point.x,point.y));assert.equal(surface.entities.find(entity=>entity.id==='eva:repair').x,layout.repair.x);assert.equal(surface.entities.find(entity=>entity.id==='eva:airlock').y,layout.spawn.y);assert.ok(!surface.entities.some(entity=>entity.type==='npc'||entity.type==='crew'));}
});

test('the sealed vault records an optional persistent witness choice without unlocking loot or opening the door',()=>{
 let site;
 for(let n=0;n<1000&&!site;n++)site=explorationSites(body(`frontier-social-${n}-world`),'social-check').find(value=>value.style==='vault');
 assert.ok(site);const state=createSiteState(site),result=claimSiteReward(state,site,'witness','sign');
 assert.equal(result.ok,true);assert.equal(result.credits,undefined);assert.equal(result.ore,undefined);assert.match(result.text,/stays sealed/);
 const restored=createSiteState(site,JSON.parse(JSON.stringify(state)));assert.equal(restored.choices.witness,'sign');assert.equal(claimSiteReward(restored,site,'witness','leave').ok,false);
});

test('social props, civilian animals and the exterior hull render without mutating their simulation',()=>{
 const context={canvas:{width:900,height:760},save(){},restore(){},fillRect(){},fillText(){},translate(){},scale(){},setLineDash(){},strokeRect(){},measureText(text){return{width:String(text).length*6};}};
 const surfaces=[interior('tessera','small-mercy'),interior('kindred-landing','table-of-arrivals'),interior('ochre-garden','held-breath'),interior('noonless','third-floor'),generateSurface(body('reedbank'),'render'),generateSurface({id:'eva:draw',kind:'eva',classId:'hauler'},'render')];
 for(const surface of surfaces){updateNpcLife(surface,600);const before=JSON.stringify(surface);drawSurface(context,surface,{person:surface.spawn,labels:[],time:0});assert.equal(JSON.stringify(surface),before);}
});
