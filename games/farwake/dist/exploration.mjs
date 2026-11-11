/** Deterministic surface expeditions. Geometry, rewards and combat are shared by solo and authority. */
import { SIDEARM, ensureSidearm, sidearmAim, clearSidearmSight, facingAngle } from './combat.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';
import { planetPlaces } from './planet-content.mjs';
import { socialPlaces, isPreflightBody } from './social-world.mjs';
const TILE=24, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
const hash=value=>{let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const pt=(x,y)=>({x:(x+.5)*TILE,y:(y+.5)*TILE});
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const reward=(credits=0,ore=0,crystal=0,heal=0)=>({credits,ore,crystal,heal});
const defaults={cave:{cols:42,rows:32,atmosphere:'cave'},shelter:{cols:28,rows:24,atmosphere:'shelter'},igloo:{cols:28,rows:24,atmosphere:'ice'},pump:{cols:36,rows:28,atmosphere:'machinery'},observatory:{cols:36,rows:28,atmosphere:'signal'},vault:{cols:36,rows:28,atmosphere:'signal'},market:{cols:44,rows:32,atmosphere:'market'},clinic:{cols:44,rows:32,atmosphere:'clinic'},laboratory:{cols:44,rows:32,atmosphere:'machinery'},sanctum:{cols:44,rows:32,atmosphere:'choral'},conservatory:{cols:44,rows:32,atmosphere:'garden'},theatre:{cols:44,rows:32,atmosphere:'theatre'},social:{cols:44,rows:32,atmosphere:'quiet'}};
const morrow=[
 {id:'chalkfold',name:'Chalkfold Cavern',kind:'cave',tileX:74,tileY:17,summary:'Fresh drag marks cross the cave mouth. The survey lamps end inside.',hostile:true,monsterCount:2,story:'The first survey team marked this passage as an aquifer. Something has been sharpening the old marker stakes.',caches:[{id:'field-kit',name:'Lost survey case',x:33,y:24,reward:reward(95,3,1),text:'The case belongs to a missing survey shift. Its recorded measurements are worth more to the cooperative than the equipment.'}],records:[{id:'last-shift',name:'Waterproof field log',x:23,y:9,text:'DAY 18. We heard the same knock three times. It came through stone, not through air. Mara wants to turn back. I should have listened sooner.'}]},
 {id:'orchard-pump',name:'Old Orchard Pump House',kind:'pump',tileX:54,tileY:45,summary:'An amber service lamp blinks above a rusted pressure door.',story:'The outer orchards depend on a pump nobody has been paid to maintain since the last flood.',choices:[{id:'water-line',name:'Orchard pressure regulator',x:25,y:10,text:'The regulator can be restored for the farming cooperative, or stripped for parts. The decision will remain here.',options:[{id:'restore',label:'Restore the orchard water line',reward:reward(125),text:'Warm pipes begin to tick. A receipt arrives from the cooperative: the outer orchards have water again.'},{id:'salvage',label:'Strip the regulator for salvage',reward:reward(35,8),text:'You take the intact coils. The pressure light goes dark; the orchard will need another regulator.'}]}],records:[{id:'rota',name:'Handwritten repair rota',x:11,y:18,text:'Three names are crossed out. A fourth has been added in a child’s handwriting. Underneath: PLEASE DO NOT TURN THE WATER OFF.'}]},
 {id:'northwatch',name:'Northwatch Weather Dome',kind:'observatory',tileX:96,tileY:26,summary:'The dome still rotates. No one answers its door channel.',story:'A chair faces a bank of blank weather screens. A cup has been washed and placed upside down beside it.',empty:true,records:[{id:'watch',name:'Last watch entry',x:25,y:10,text:'The station records wind, pressure and the noise of the dome turning. Every ninth hour it also records a chair moving. No one has signed in for eleven years.'}]},
 {id:'tideglass',name:'Tideglass Listening Hut',kind:'shelter',tileX:90,tileY:61,summary:'A narrow trail runs down to a hut above the salt flats.',story:'The door has been propped open with a polished stone. Sea wind plays through a loose copper tube.',records:[{id:'letters',name:'Unsent letters',x:18,y:9,text:'There are forty-six letters here, all addressed to different ships. The newest is for a vessel that has not been built yet. The handwriting is the same throughout.'}],caches:[{id:'travel-tin',name:'Traveler’s supply tin',x:10,y:15,reward:reward(35,0,0,25),text:'A note says TAKE WHAT YOU NEED, LEAVE THE LIGHT. The medical dressings are still sealed.'}]},
 {id:'reed-house',name:'Reed Family Shelter',kind:'shelter',tileX:24,tileY:61,summary:'A small house stands beyond the last planted row.',story:'The beds are made. Boots wait by the door, their soles full of soil from somewhere other than Morrow.',empty:true,records:[{id:'door',name:'Scratched doorframe',x:18,y:9,text:'Four heights and four dates are scratched into the frame. The final mark is much too high. Somewhere behind the wall, a pipe knocks once.'}]},
 {id:'relay-nine',name:'Relay Nine',kind:'vault',tileX:68,tileY:69,summary:'A buried relay shelter hums beneath a dead antenna.',story:'The relay is receiving fragments from ships whose transponders no longer exist.',caches:[{id:'signal-buffer',name:'Recoverable signal buffer',x:25,y:18,reward:reward(80,0,1),text:'You recover a spool of public navigation records. The exchange pays for the intact copies.'}],records:[{id:'voices',name:'Relay fault transcript',x:11,y:9,text:'FAULT 09: repeat callers report hearing their own arrival message before transmitting it. Engineering recommendation: replace the clock. Clock replaced six times.'}]}
];
/** Only landable world context is accepted; body sprites and space physics never change. */
export function explorationSites(body={},seed='farwake'){
 if(typeof body==='string')body={id:body,name:body};
 if(['station','ship','derelict','site'].includes(body.kind))return[];
 const bodyId=String(body.id||'world'),world=body.name||'this world',h=hash(`${seed}:${bodyId}:expeditions`);
 const barren=/barren|rock|dust/.test(String(body.biome))||body.kind==='asteroid',ice=/ice|froz|snow/.test(String(body.biome));
 const raw=isPreflightBody(body)?[]:bodyId==='morrow'?morrow:[
  {id:'hollow',name:ice?'Blue-Ice Fissure':barren?'Basalt Hollow':'Ridgefall Cavern',kind:'cave',tileX:68+(h%9),tileY:16,hostile:true,monsterCount:1+(h%2),summary:ice?'Deep tracks vanish beneath the ice.':'The wind dies at the threshold. Something has dragged debris inside.',story:`An old survey stake bears the name of ${world}. Beneath it, the ground has been disturbed recently.`,caches:[{id:'survey-case',name:'Abandoned survey case',x:33,y:24,reward:reward(65+h%31,2+h%3,h%2),text:'The recorder still holds usable terrain readings. The sealed supplies can travel with you.'}],records:[{id:'warning',name:'Survey warning',x:23,y:9,text:['RETURN BEFORE THE SHADOW REACHES THE MARKER. The rest has been scratched away.','Do not answer the tapping. It follows a different route back.','Our instruments found nothing alive. That is the part I no longer believe.'][h%3]}]},
  {id:'shelter',name:ice?'Unmarked Ice Shelter':barren?'Survey Shelter 04':'Wayfarer’s Hut',kind:ice?'igloo':'shelter',tileX:30+(h%8),tileY:60,empty:true,summary:ice?'One small dome rises from the snow. No footprints approach it.':'A closed shelter stands far from the landing beacon.',story:'Nothing moves in the room. The sound that brought you here stops as soon as the door closes.',records:[{id:'shelter-note',name:'A folded note',x:18,y:9,text:['If you are the next person to sleep here, please tell me what you dreamed. There is no name.','I left a light in every window. From outside, only one was burning.','The heater is cold. You can still hear it cooling.'][h%3]}]},
  ...(!barren?[{id:'field-relay',name:ice?'Thawline Relay':'Outlying Field Relay',kind:'pump',tileX:87,tileY:55,summary:'A maintenance beacon repeats a low-priority fault.',story:`This small field station once kept the outer routes of ${world} supplied.`,choices:[{id:'relay',name:'Field relay controller',x:25,y:10,text:'Restore the relay for local travelers, or take its remaining power cells for salvage.',options:[{id:'restore',label:'Restore the route beacon',reward:reward(100+h%35),text:'The route beacon returns to service. The local cooperative credits your account.'},{id:'salvage',label:'Recover the spare cells',reward:reward(25,6),text:'The cells are reusable. The beacon stays dark.'}]}],records:[{id:'route',name:'Route register',x:11,y:18,text:'The last route record lists a convoy of seven. Eight engines are audible in the recording.'}]}]:[])
 ];
 return [...raw,...planetPlaces(body),...socialPlaces(body,seed)].map(item=>freeze({...defaults[item.kind],...item,bodyId,key:`${bodyId}:site:${item.id}`,entrance:pt(item.tileX,item.tileY),hostile:!!item.hostile,empty:!!item.empty,caches:item.caches||[],records:item.records||[],choices:item.choices||[]}));
}
export function explorationLocation(body,siteId,seed='farwake'){
 const site=explorationSites(body,seed).find(value=>value.id===siteId);if(!site)return null;
 return{...body,id:site.key,kind:'site',name:site.name,parentId:body.id,siteId:site.id,site,localLore:site.story,biome:site.kind==='igloo'?'ice':site.kind==='cave'?'cave':'shelter'};
}
const monsterTemplate=(site,index)=>({id:`${site.key}:wildlife:${index}`,name:site.kind==='conservatory'?(index?'Glass skitter':'Root grazer'):site.kind==='laboratory'?(index?'Vent skitter':'Filter crawler'):index?'Cave skitter':'Stoneback',species:index?'skitter':'stoneback',team:'hostile',hostile:true,x:pt(index?30:25,index?22:14).x,y:pt(index?30:25,index?22:14).y,health:index?48:96,maxHealth:index?48:96,speed:index?64:42,damage:index?9:16,range:25,cooldown:0,windup:0,alert:false,facing:'left',color:site.kind==='conservatory'?(index?'#b6b7d1':'#86b6aa'):index?'#a7b391':'#a5967e'});
/** Restore only authored monsters and known claim IDs; arbitrary save data cannot mint loot. */
export function createSiteState(site,saved={}){
 const prior=saved&&typeof saved==='object'?saved:{},width=site.cols*TILE,height=site.rows*TILE;
 const monsters=Array.from({length:site.hostile?site.monsterCount||1:0},(_,index)=>{
  const base=monsterTemplate(site,index),raw=Array.isArray(prior.monsters)?prior.monsters.find(m=>m?.id===base.id):null;
  return{...base,x:clamp(finite(raw?.x,base.x),TILE,width-TILE),y:clamp(finite(raw?.y,base.y),TILE,height-TILE),health:clamp(finite(raw?.health,base.health),0,base.maxHealth),cooldown:clamp(finite(raw?.cooldown),0,2),windup:0,alert:!!raw?.alert,lastHitBy:typeof raw?.lastHitBy==='string'?raw.lastHitBy.slice(0,80):null,status:raw?.health===0?'dead':'alive'};
 });
 const choices={};for(const choice of site.choices){const chosen=prior.choices?.[choice.id];if(choice.options.some(option=>option.id===chosen))choices[choice.id]=chosen;}
 return{id:site.key,siteId:site.id,time:clamp(finite(prior.time),0,1e12),shotSerial:Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(finite(prior.shotSerial)))),visited:Math.max(0,Math.floor(finite(prior.visited))),monsters,collected:[...new Set((Array.isArray(prior.collected)?prior.collected:[]).filter(id=>site.caches.some(cache=>cache.id===id)))],choices,actorCooldowns:{},cleared:monsters.every(monster=>monster.health<=0)};
}
export function inspectSiteRecord(site,recordId){const record=site.records.find(item=>item.id===recordId);return record?{ok:true,title:record.name,text:record.text}:{ok:false,reason:'That record is not part of this place.'};}
export function claimSiteReward(state,site,id,optionId){
 if(state.id!==site.key)return{ok:false,reason:'This place has changed. Enter it again.'};
 if(optionId!==undefined){
  const choice=site.choices.find(item=>item.id===id),option=choice?.options.find(item=>item.id===optionId);
  if(!option)return{ok:false,reason:'Choose one of the available actions.'};
  if(state.choices[id])return{ok:false,reason:'That decision has already been made here.',chosen:state.choices[id]};
  state.choices[id]=option.id;return{ok:true,...option.reward,text:option.text,choiceId:id,optionId:option.id};
 }
 const cache=site.caches.find(item=>item.id===id);if(!cache)return{ok:false,reason:'There is nothing to recover here.'};
 if(state.collected.includes(id))return{ok:false,reason:'This cache has already been recovered.'};
 if(state.monsters.some(monster=>monster.health>0))return{ok:false,reason:'Clear the nearby threat before opening the cache.'};
 state.collected.push(id);return{ok:true,...cache.reward,text:cache.text,cacheId:id};
}
const routeCache=new WeakMap();
function routeTo(layout,from,to){
 const index=point=>Math.floor(point.y/TILE)*layout.cols+Math.floor(point.x/TILE),start=index(from),end=index(to),parent=new Int32Array(layout.walkable.length).fill(-1),queue=[start];
 if(!layout.walkable[start]||!layout.walkable[end])return[];parent[start]=start;
 for(let n=0;n<queue.length&&parent[end]<0;n++){const cell=queue[n],x=cell%layout.cols,y=Math.floor(cell/layout.cols);for(const[xx,yy]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const next=yy*layout.cols+xx;if(xx<0||yy<0||xx>=layout.cols||yy>=layout.rows||!layout.walkable[next]||parent[next]>=0)continue;parent[next]=cell;queue.push(next);}}
 if(parent[end]<0)return[];const route=[];for(let cell=end;cell!==start;cell=parent[cell])route.push(pt(cell%layout.cols,Math.floor(cell/layout.cols)));return route.reverse();
}
function walkMonster(monster,target,dt,layout,time){
 let next=target;if(!clearSidearmSight(layout,monster,target)){
  let cached=routeCache.get(monster);if(!cached||cached.until<time||Math.hypot(cached.target.x-target.x,cached.target.y-target.y)>24){cached={until:time+.45,target:{x:target.x,y:target.y},route:routeTo(layout,monster,target)};routeCache.set(monster,cached);}
  while(cached.route.length&&Math.hypot(cached.route[0].x-monster.x,cached.route[0].y-monster.y)<7)cached.route.shift();next=cached.route[0];if(!next)return;
 }
 const dx=next.x-monster.x,dy=next.y-monster.y,d=Math.hypot(dx,dy),step=Math.min(d,monster.speed*dt),x=monster.x+(d?dx/d*step:0),y=monster.y+(d?dy/d*step:0);
 const oldX=monster.x,oldY=monster.y;if(isCabinWalkable(layout,x,monster.y,6))monster.x=x;if(isCabinWalkable(layout,monster.x,y,6))monster.y=y;
 monster.moving=Math.hypot(monster.x-oldX,monster.y-oldY)>.01;monster.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
}
/** Participants have {id,name,person,input,damageMultiplier,damageTakenMultiplier,sidearmCooldownMultiplier}. Call once per occupied site. */
export function stepSiteEncounter(state,participants,delta,surface){
 const dt=clamp(finite(delta),0,.25),layout=surface.combatLayout;if(!dt||!layout)return[];
 const actors=participants.filter(actor=>actor?.person&&actor.person.health>0&&!actor.person.down),events=[];state.time+=dt;
 const at=state.time,event=(type,details)=>events.push({type,siteId:state.id,at,...details});
 for(const actor of actors){
  const person=ensureSidearm(actor.person),id=String(actor.id||'local');state.actorCooldowns[id]=Math.max(0,finite(state.actorCooldowns[id])-dt);
  const threatened=state.monsters.some(monster=>monster.health>0);
  if(!threatened){person.weaponDrawn=false;person.aimTargetId=null;person.aimManual=false;continue;}
  const aim=sidearmAim(person,state.monsters,actor.input||{},layout);person.aimAngle=aim.angle;person.aimTargetId=aim.targetId;person.aimManual=aim.manual;person.weaponDrawn=true;
  if(!actor.input?.fire||state.actorCooldowns[id]>0)continue;
  const cooldown=SIDEARM.cooldown*clamp(finite(actor.sidearmCooldownMultiplier,1),.5,2),damage=SIDEARM.damage*clamp(finite(actor.damageMultiplier,1),.4,2),shotId=`${state.id}:shot:${++state.shotSerial}`;
  state.actorCooldowns[id]=cooldown;person.weaponReadyAt=at+cooldown;person.attackUntil=at+SIDEARM.shotDuration;
  const target=aim.target,shot={id:shotId,team:'player',attackerId:id,actorName:actor.name||'Captain',weaponId:SIDEARM.id,angle:aim.angle,from:{...aim.from},to:{...aim.to},x:aim.from.x,y:aim.from.y,targetX:aim.to.x,targetY:aim.to.y,targetId:target?.id||null,targetName:target?.name||null,hit:!!target,blocked:!!aim.blocked,damage:target?damage:0,until:at+SIDEARM.shotDuration};person.lastShot=shot;event('person-shot',shot);
  if(target){target.health=Math.max(0,target.health-damage);target.hitUntil=at+.24;target.lastHitBy=id;target.alert=true;event('person-hit',{...shot,id:shotId+':hit',x:target.x,y:target.y,health:target.health,maxHealth:target.maxHealth});if(target.health<=0){target.status='dead';target.windup=0;event('boarder-down',{...shot,id:shotId+':down',x:target.x,y:target.y,actorId:target.id,text:`${actor.name||'You'} brought down ${target.name}.`});}}
 }
 for(const monster of state.monsters){
  if(monster.health<=0)continue;
  if(!isCabinWalkable(layout,monster.x,monster.y,6)){let best=null,bestDistance=Infinity;for(let cell=0;cell<layout.walkable.length;cell++){if(!layout.walkable[cell])continue;const point=pt(cell%layout.cols,Math.floor(cell/layout.cols)),distance=Math.hypot(point.x-monster.x,point.y-monster.y);if(distance<bestDistance&&isCabinWalkable(layout,point.x,point.y,6)){best=point;bestDistance=distance;}}if(best)Object.assign(monster,best);}
  monster.cooldown=Math.max(0,finite(monster.cooldown)-dt);
  const target=actors.filter(actor=>actor.person.health>0).sort((a,b)=>Math.hypot(a.person.x-monster.x,a.person.y-monster.y)-Math.hypot(b.person.x-monster.x,b.person.y-monster.y))[0];if(!target){monster.windup=0;monster.moving=false;continue;}
  const person=target.person,distance=Math.hypot(person.x-monster.x,person.y-monster.y),visible=clearSidearmSight(layout,monster,person);
  if(!monster.alert&&distance>300){monster.moving=false;continue;}if(visible&&distance<300)monster.alert=true;
  if(monster.windup>0){monster.windup=Math.max(0,monster.windup-dt);monster.moving=false;if(monster.windup>0)continue;
   monster.cooldown=1.15;if(distance>monster.range+10||!visible)continue;
   const damage=monster.damage*clamp(finite(target.damageTakenMultiplier,1),.4,2),id=`${state.id}:bite:${++state.shotSerial}`;person.health=Math.max(0,person.health-damage);person.hitUntil=at+.24;
   const hit={id,team:'hostile',attackerId:monster.id,actorName:monster.name,weaponId:'wildlife-claws',targetId:target.id,targetName:target.name||'Captain',x:person.x,y:person.y,to:{x:person.x,y:person.y},damage,health:person.health,maxHealth:person.maxHealth||100};event('person-hit',hit);
   if(person.health<=0){person.down=true;event('person-down',{...hit,id:id+':down',text:`${monster.name} downed ${target.name||'the captain'}.`});}continue;
  }
  if(distance>monster.range){walkMonster(monster,person,dt,layout,at);continue;}
  monster.moving=false;if(!monster.cooldown&&visible){monster.windup=.55;monster.attackUntil=at+.55;monster.aimAngle=Math.atan2(person.y-monster.y,person.x-monster.x);}
 }
 state.cleared=state.monsters.every(monster=>monster.health<=0);return events;
}
