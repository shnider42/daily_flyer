import {withTinbellResidue} from './tinbell-evidence.mjs';
/** Deterministic surface expeditions. Geometry, rewards and combat are shared by solo and authority. */
import { ensureSidearm, getPersonalWeapon, personalWeaponDamage, sidearmAim, clearSidearmSight } from './combat.mjs';
import { isCabinWalkable } from './interior-layouts.mjs';
import { canSeeConcealedActor, canSeeSitePoint } from './site-visibility.mjs';
import { planetPlaces } from './planet-content.mjs';
import { socialPlaces, isPreflightBody } from './social-world.mjs';
import { SPECIES_PLANET_PLACES } from './species-content.mjs';
import { militaryGroundSites } from './military-sites.mjs';
import { fieldSites, isFieldSite, normalizeFieldState, stepFieldEncounter, resetFieldAttempt } from './floodworks.mjs';
import { warzoneGroundSites, createWarzoneGroundState, stepWarzoneGround } from './warzone-ground.mjs';
import { expeditionStorySites } from './expedition-stories.mjs';
import { quietEarthSites, quietEarthRestoreSite } from './quiet-earth-content.mjs';
import { normalizeQuietEarthState, stepQuietEarthEncounter } from './quiet-earth-rules.mjs';
import { configureCreature, restoreCreatureState, usesCreatureRules, stepCreatureEncounter, interruptCreature, creatureDamageTaken } from './creature-rules.mjs';
import { cavernSites } from './cavern-content.mjs';
import { normalizeStoryState, inspectStoryRecord, claimStoryChoice, storyGate, applyStoryConsequences, storyThreats, storyMonsterTemplate, restoreStoryMonster, expeditionHostileTo, recordStoryAggression, stepStoryMonster, bumpStoryRevision } from './expedition-story-rules.mjs';
const TILE=24, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
const hash=value=>{let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const pt=(x,y)=>({x:(x+.5)*TILE,y:(y+.5)*TILE});
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const reward=(credits=0,ore=0,crystal=0,heal=0)=>({credits,ore,crystal,heal});
export const BELLWETHER_ID='tinbell:site:hollow:bellwether';
export const BELLWETHER_PROFILE=Object.freeze({health:1500,armor:20,damage:58,speed:208,sightRange:230,radius:14,hitRadius:16,lungeSpeed:360,lungeRange:400,lungeTriggerRange:64,windupDuration:.8,recoveryDuration:1.1,
 shockwaveRadius:124,shockwaveDamage:44,shockwaveWindup:1.3,rockfallRadius:30,rockfallDamage:46,rockfallWindup:1.1,enrageHealthFraction:.45,enrageSpeed:224});
const BELLWETHER_ATTACKS=Object.freeze({lunge:{windup:.8,recovery:1.1},shockwave:{windup:1.3,recovery:1.3},rockfall:{windup:1.1,recovery:1.4}});
export const isBellwether=monster=>monster?.id===BELLWETHER_ID&&monster.species==='bellwether';
const isBellwetherSite=site=>site?.bodyId==='tinbell'&&site.id==='hollow';
const serial=value=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(finite(value))));
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
function legacyExplorationSites(body={},seed='farwake'){
 if(typeof body==='string')body={id:body,name:body};
 if(['station','ship','derelict','site'].includes(body.kind))return[];
 const bodyId=String(body.id||'world'),world=body.name||'this world',h=hash(`${seed}:${bodyId}:expeditions`);
 const barren=/barren|rock|dust/.test(String(body.biome))||body.kind==='asteroid',ice=/ice|froz|snow/.test(String(body.biome));
 const raw=isPreflightBody(body)||['crosswind-vey','crosswind-orsa','crosswind-lorn'].includes(bodyId)?[]:bodyId==='morrow'?morrow:[
  {id:'hollow',name:ice?'Blue-Ice Fissure':barren?'Basalt Hollow':'Ridgefall Cavern',kind:'cave',tileX:68+(h%9),tileY:16,hostile:true,monsterCount:1+(h%2),summary:ice?'Deep tracks vanish beneath the ice.':'The wind dies at the threshold. Something has dragged debris inside.',story:`An old survey stake bears the name of ${world}. Beneath it, the ground has been disturbed recently.`,caches:[{id:'survey-case',name:'Abandoned survey case',x:33,y:24,reward:reward(65+h%31,2+h%3,h%2),text:'The recorder still holds usable terrain readings. The sealed supplies can travel with you.'}],records:[{id:'warning',name:'Survey warning',x:23,y:9,text:['RETURN BEFORE THE SHADOW REACHES THE MARKER. The rest has been scratched away.','Do not answer the tapping. It follows a different route back.','Our instruments found nothing alive. That is the part I no longer believe.'][h%3]}]},
  {id:'shelter',name:ice?'Unmarked Ice Shelter':barren?'Survey Shelter 04':'Wayfarer’s Hut',kind:ice?'igloo':'shelter',tileX:30+(h%8),tileY:60,empty:true,summary:ice?'One small dome rises from the snow. No footprints approach it.':'A closed shelter stands far from the landing beacon.',story:'Nothing moves in the room. The sound that brought you here stops as soon as the door closes.',records:[{id:'shelter-note',name:'A folded note',x:18,y:9,text:['If you are the next person to sleep here, please tell me what you dreamed. There is no name.','I left a light in every window. From outside, only one was burning.','The heater is cold. You can still hear it cooling.'][h%3]}]},
  ...(!barren?[{id:'field-relay',name:ice?'Thawline Relay':'Outlying Field Relay',kind:'pump',tileX:87,tileY:55,summary:'A maintenance beacon repeats a low-priority fault.',story:`This small field station once kept the outer routes of ${world} supplied.`,choices:[{id:'relay',name:'Field relay controller',x:25,y:10,text:'Restore the relay for local travelers, or take its remaining power cells for salvage.',options:[{id:'restore',label:'Restore the route beacon',reward:reward(100+h%35),text:'The route beacon returns to service. The local cooperative credits your account.'},{id:'salvage',label:'Recover the spare cells',reward:reward(25,6),text:'The cells are reusable. The beacon stays dark.'}]}],records:[{id:'route',name:'Route register',x:11,y:18,text:'The last route record lists a convoy of seven. Eight engines are audible in the recording.'}]}]:[])
 ];
 const quietEarth=quietEarthSites(body,seed);
 return [...raw.filter(item=>!quietEarth.some(site=>site.id===item.id)),...quietEarth,...planetPlaces(body),...(SPECIES_PLANET_PLACES[bodyId]||[]),...socialPlaces(body,seed),...militaryGroundSites(body),...fieldSites(body),...warzoneGroundSites(body)].map(item=>freeze({...defaults[item.kind],...item,...(bodyId==='tinbell'&&item.id==='hollow'?{monsterCount:1,bossId:'bellwether'}:{}),bodyId,key:`${bodyId}:site:${item.id}`,entrance:pt(item.tileX,item.tileY),hostile:!!item.hostile,empty:!!item.empty,caches:item.caches||[],records:item.records||[],choices:item.choices||[]}));
}
/** Replace only repeatable frontier slots; authored places and Hearth stay intact. */
export function explorationSites(body={},seed='farwake'){
 if(typeof body==='string')body={id:body,name:body};
 const existing=legacyExplorationSites(body,seed).map(withTinbellResidue),stories=expeditionStorySites(body,seed);
 if(!stories.length)return[...existing,...cavernSites(body,seed,existing)];
 const bodyId=String(body.id||'world');
 const authored=stories.map(item=>freeze({...defaults[item.kind],...item,bodyId,key:`${bodyId}:site:${item.id}`,entrance:pt(item.tileX,item.tileY),hostile:!!item.hostile,empty:!!item.empty,caches:item.caches||[],records:item.records||[],choices:item.choices||[]}));
 const sites=[...authored,...existing.filter(site=>!['hollow','shelter','field-relay'].includes(site.id))];
 return[...sites,...cavernSites(body,seed,sites)];
}
export function explorationLocation(body,siteId,seed='farwake'){
 const site=explorationSites(body,seed).find(value=>value.id===siteId)||(['hollow','shelter','field-relay'].includes(siteId)?legacyExplorationSites(body,seed).find(value=>value.id===siteId):null);if(!site)return null;
 return{...body,id:site.key,kind:'site',name:site.name,parentId:body.id,siteId:site.id,site,localLore:site.story,biome:site.kind==='igloo'?'ice':site.kind==='cave'?'cave':'shelter'};
}
const monsterTemplate=(site,index)=>site.expedition?storyMonsterTemplate(site,index):site.military&&site.hostiles?.[index]?{...site.hostiles[index],id:`${site.key}:infantry:${site.hostiles[index].id}`,cooldown:.8+index*.25,windup:0,alert:false,facing:'left'}:configureCreature({id:`${site.key}:wildlife:${index}`,name:site.kind==='conservatory'?(index?'Glass skitter':'Root grazer'):site.kind==='laboratory'?(index?'Vent skitter':'Filter crawler'):index?'Cave skitter':'Stoneback',species:index?'skitter':'stoneback',team:'hostile',hostile:true,x:pt(index?30:25,index?22:14).x,y:pt(index?30:25,index?22:14).y,health:index?48:96,maxHealth:index?48:96,speed:index?64:42,damage:index?9:16,range:25,cooldown:0,windup:0,alert:false,facing:'left',color:site.kind==='conservatory'?(index?'#b6b7d1':'#86b6aa'):index?'#a7b391':'#a5967e'});
const bellwetherTemplate=()=>({id:BELLWETHER_ID,name:'The Bellwether',species:'bellwether',team:'hostile',hostile:true,...BELLWETHER_PROFILE,...pt(27,7),maxHealth:BELLWETHER_PROFILE.health,
 range:26,status:'alive',concealed:true,hidden:true,revealed:false,alert:false,phase:'dormant',facing:'left',color:'#929185',moving:false,windup:0,cooldown:0,recovery:0,lungeRemaining:0,lungeHitIds:[],aimAngle:Math.PI,attackUntil:0,hitUntil:0,lastHitBy:null,targetId:null,
 bossAttack:'lunge',attackSerial:0,attackTargets:[],strikeRemaining:0,enraged:false});
function restoreBellwether(raw,site,time,attemptSerial,revealSerial){
 const base=bellwetherTemplate();if(!raw)return{...base,attemptSerial,revealSerial};
 const health=clamp(finite(raw.health,base.health),0,base.maxHealth),dead=health<=0,revealed=dead||raw.revealed===true||raw.alert===true;
 const bossAttack=Object.hasOwn(BELLWETHER_ATTACKS,raw.bossAttack)?raw.bossAttack:'lunge',timing=BELLWETHER_ATTACKS[bossAttack];
 let phase=dead?'dead':!revealed?'dormant':['chase','windup','lunge','strike','recovery'].includes(raw.phase)?raw.phase:'chase';
 const attackTargets=(Array.isArray(raw.attackTargets)?raw.attackTargets:[]).filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)).slice(0,2).map(point=>({x:clamp(point.x,TILE,site.cols*TILE-TILE),y:clamp(point.y,TILE,site.rows*TILE-TILE)}));
 if(phase==='lunge'&&bossAttack!=='lunge'||phase==='strike'&&bossAttack==='lunge'||phase==='windup'&&bossAttack==='rockfall'&&!attackTargets.length)phase='chase';
 const windup=phase==='windup'?clamp(finite(raw.windup),0,timing.windup):0,recovery=phase==='recovery'?clamp(finite(raw.recovery),0,timing.recovery):0,strikeRemaining=phase==='strike'?clamp(finite(raw.strikeRemaining),0,.35):0;
 const enraged=health>0&&health<=base.maxHealth*base.enrageHealthFraction;
 return{...base,x:clamp(finite(raw.x,base.x),TILE,site.cols*TILE-TILE),y:clamp(finite(raw.y,base.y),TILE,site.rows*TILE-TILE),health,status:dead?'dead':'alive',revealed,hidden:!revealed,alert:revealed&&!dead,phase,windup,recovery,
  lungeRemaining:phase==='lunge'?clamp(finite(raw.lungeRemaining),0,base.lungeRange):0,lungeHitIds:phase==='lunge'?[...new Set((Array.isArray(raw.lungeHitIds)?raw.lungeHitIds:[]).filter(id=>typeof id==='string'&&id.length<=80))].slice(0,10):[],
  bossAttack,attackSerial:serial(raw.attackSerial),attackTargets:dead?[]:attackTargets,strikeRemaining,enraged,speed:enraged?base.enrageSpeed:base.speed,
  aimAngle:finite(raw.aimAngle,base.aimAngle),attackUntil:phase==='windup'?time+windup:phase==='lunge'?time+clamp(finite(raw.lungeRemaining),0,base.lungeRange)/base.lungeSpeed:phase==='strike'?time+strikeRemaining:0,
  lastHitBy:typeof raw.lastHitBy==='string'?raw.lastHitBy.slice(0,80):null,targetId:typeof raw.targetId==='string'?raw.targetId.slice(0,80):null,attemptSerial,revealSerial};
}
/** Restore only authored monsters and known claim IDs; arbitrary save data cannot mint loot. */
export function createSiteState(site,saved={}){
 if(site.warzone)return createWarzoneGroundState(site,saved);
 const prior=saved&&typeof saved==='object'?saved:{},width=site.cols*TILE,height=site.rows*TILE;
 const time=clamp(finite(prior.time),0,1e12),attemptSerial=serial(prior.attemptSerial),revealSerial=serial(prior.revealSerial);
 const watch=site.military&&site.watch?{elapsed:clamp(finite(prior.watch?.elapsed),0,site.watch.seconds),contactResolved:false,attackOccurred:false,completed:false}:null;
 if(watch&&watch.elapsed+1e-6>=site.watch.attackDelay){watch.contactResolved=true;watch.attackOccurred=(hash(`${site.key}:watch-contact`)/4294967296)<site.watch.attackChance;}
 const restorationSite=site.quietEarth?quietEarthRestoreSite(site,prior):site;
 const encounterSite=watch?{...restorationSite,hostile:watch.attackOccurred,monsterCount:watch.attackOccurred?site.hostiles.length:0}:restorationSite;
 // This is a new authored encounter, not an upgraded generic Stoneback. Old
 // wildlife cannot stand in for its death; old cache claims still remain paid.
 const monsters=isBellwetherSite(site)?[restoreBellwether((Array.isArray(prior.monsters)?prior.monsters:[]).find(monster=>monster?.id===BELLWETHER_ID),site,time,attemptSerial,revealSerial)]:Array.from({length:encounterSite.expedition?Math.min(8,encounterSite.hostiles?.length||0):encounterSite.hostile?encounterSite.monsterCount||1:0},(_,index)=>{
  const base=monsterTemplate(encounterSite,index),raw=Array.isArray(prior.monsters)?prior.monsters.find(m=>m?.id===base.id):null;
  const pristineRelay=site.quietEarth&&raw?.quietEarthDormant===true&&raw?.revealed!==true&&!raw?.alert&&raw?.health>0&&raw.health===raw.maxHealth&&prior.choices?.receiver!=='copy'&&prior.choices?.evacuate!=='seal';
  const restored={...base,...(site.expedition?restoreStoryMonster(base,raw||{}):{}),x:clamp(finite(raw?.x,base.x),TILE,width-TILE),y:clamp(finite(raw?.y,base.y),TILE,height-TILE),health:pristineRelay?base.health:clamp(finite(raw?.health,base.health),0,base.maxHealth),cooldown:clamp(finite(raw?.cooldown),0,site.expedition?4:2),windup:0,alert:!!raw?.alert,lastHitBy:typeof raw?.lastHitBy==='string'?raw.lastHitBy.slice(0,80):null,status:raw?.health===0?'dead':'alive'};
  return restoreCreatureState(restored,raw||{},time);
 });
 if(watch)watch.completed=watch.elapsed+1e-6>=site.watch.seconds&&monsters.every(monster=>monster.health<=0);
 const choices={};for(const choice of site.choices){const chosen=prior.choices?.[choice.id];if(choice.puzzle?chosen==='complete':choice.options.some(option=>option.id===chosen))choices[choice.id]=chosen;}
 const field=isFieldSite(site)?normalizeFieldState(site,prior.field):null;
 const state={id:site.key,siteId:site.id,time,shotSerial:serial(prior.shotSerial),...(site.expedition?{story:normalizeStoryState(site,prior.story)}:{}),...(field?{field}:{}),...(site.military?{military:true,operationId:site.operationId,objectives:prior.objectives?.[site.objectiveId]===true?{[site.objectiveId]:true}:{},...(watch?{watch}:{})}:{}),...(isBellwetherSite(site)?{bossVersion:2,attemptSerial,revealSerial}:{}),visited:Math.max(0,Math.floor(finite(prior.visited))),monsters,collected:[...new Set((Array.isArray(prior.collected)?prior.collected:[]).filter(id=>site.caches.some(cache=>cache.id===id)))],choices,actorCooldowns:{},cleared:(!watch||watch.completed)&&monsters.every(monster=>monster.health<=0)&&(!field?.foreman||field.foreman.disabled)};
 if(site.quietEarth)state.quietEarth=normalizeQuietEarthState(site,prior.quietEarth);
 if(site.expedition)applyStoryConsequences(state,site);return state;
}
export function inspectSiteRecord(site,recordId,state){if(site.expedition&&state)return inspectStoryRecord(state,site,recordId);const record=site.records.find(item=>item.id===recordId);return record?{ok:true,title:record.name,text:record.text}:{ok:false,reason:'That record is not part of this place.'};}
export function claimSiteReward(state,site,id,optionId){
 if(state.id!==site.key)return{ok:false,reason:'This place has changed. Enter it again.'};
 if(optionId!==undefined){
  if(site.expedition)return claimStoryChoice(state,site,id,optionId);
  const choice=site.choices.find(item=>item.id===id),option=choice?.options.find(item=>item.id===optionId);
  if(!option)return{ok:false,reason:'Choose one of the available actions.'};
  if(state.choices[id])return{ok:false,reason:'That decision has already been made here.',chosen:state.choices[id]};
  state.choices[id]=option.id;return{ok:true,...option.reward,text:option.text,choiceId:id,optionId:option.id};
 }
 const cache=site.caches.find(item=>item.id===id);if(!cache)return{ok:false,reason:'There is nothing to recover here.'};
 if(state.collected.includes(id))return{ok:false,reason:'This cache has already been recovered.'};
 if(site.expedition){const gate=storyGate(state,site,cache);if(!gate.ok)return gate;}
 if((site.expedition?storyThreats(state):state.monsters.filter(monster=>monster.health>0)).length)return{ok:false,reason:'Clear the nearby threat before opening the cache.'};
 state.collected.push(id);bumpStoryRevision(state);return{ok:true,...cache.reward,text:cache.text,cacheId:id};
}
const routeCache=new WeakMap();
/** Reset only an unfinished Bellwether attempt; death and claimed supplies persist. */
export function resetSiteBoss(state){
 if(state?.field?.foreman)return resetFieldAttempt(state);
 const monster=state?.monsters?.find(isBellwether);if(!monster||monster.health<=0)return false;
 const base=bellwetherTemplate();
 if(monster.health===base.health&&!monster.revealed&&!monster.alert&&monster.phase==='dormant'&&monster.x===base.x&&monster.y===base.y)return false;
 state.attemptSerial=serial(state.attemptSerial)+1;
 Object.assign(monster,base,{attemptSerial:state.attemptSerial,revealSerial:serial(state.revealSerial)});
 state.actorCooldowns={};state.cleared=false;routeCache.delete(monster);return true;
}
function routeTo(layout,from,to,radius=6){
 const index=point=>Math.floor(point.y/TILE)*layout.cols+Math.floor(point.x/TILE),start=index(from),end=index(to),parent=new Int32Array(layout.walkable.length).fill(-1),queue=[start];
 if(!layout.walkable[start]||radius<=6&&!layout.walkable[end])return[];parent[start]=start;
 for(let n=0;n<queue.length&&parent[end]<0;n++){const cell=queue[n],x=cell%layout.cols,y=Math.floor(cell/layout.cols);for(const[xx,yy]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const next=yy*layout.cols+xx;if(xx<0||yy<0||xx>=layout.cols||yy>=layout.rows||!layout.walkable[next]||parent[next]>=0)continue;const point=pt(xx,yy);if(radius>6&&!isCabinWalkable(layout,point.x,point.y,radius))continue;parent[next]=cell;queue.push(next);}}
 let destination=end;
 if(parent[end]<0){if(radius<=6)return[];destination=queue.reduce((best,cell)=>{const a=pt(cell%layout.cols,Math.floor(cell/layout.cols)),b=pt(best%layout.cols,Math.floor(best/layout.cols));return Math.hypot(a.x-to.x,a.y-to.y)<Math.hypot(b.x-to.x,b.y-to.y)?cell:best;},start);}
 const route=[];for(let cell=destination;cell!==start;cell=parent[cell])route.push(pt(cell%layout.cols,Math.floor(cell/layout.cols)));return route.reverse();
}
function clearMonsterPath(layout,from,to,radius){const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/8));for(let i=1;i<=steps;i++)if(!isCabinWalkable(layout,from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps,radius))return false;return true;}
function walkMonster(monster,target,dt,layout,time){
 const radius=isBellwether(monster)?monster.radius:6;
 let next=target;if(!clearSidearmSight(layout,monster,target)||radius>6&&!clearMonsterPath(layout,monster,target,radius)){
  let cached=routeCache.get(monster);if(!cached||cached.until<time||Math.hypot(cached.target.x-target.x,cached.target.y-target.y)>24){cached={until:time+.45,target:{x:target.x,y:target.y},route:routeTo(layout,monster,target,radius)};routeCache.set(monster,cached);}
  while(cached.route.length&&Math.hypot(cached.route[0].x-monster.x,cached.route[0].y-monster.y)<7)cached.route.shift();next=cached.route[0];if(!next)return;
 }
 const dx=next.x-monster.x,dy=next.y-monster.y,d=Math.hypot(dx,dy),step=Math.min(d,monster.speed*dt),x=monster.x+(d?dx/d*step:0),y=monster.y+(d?dy/d*step:0);
 const oldX=monster.x,oldY=monster.y;if(isCabinWalkable(layout,x,monster.y,radius))monster.x=x;if(isCabinWalkable(layout,monster.x,y,radius))monster.y=y;
 monster.moving=Math.hypot(monster.x-oldX,monster.y-oldY)>.01;monster.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
}

function revealBellwether(state,monster,target,event){
 if(monster.revealed||monster.health<=0)return;
 state.revealSerial=serial(state.revealSerial)+1;
 Object.assign(monster,{revealed:true,hidden:false,alert:true,phase:'chase',revealSerial:state.revealSerial,attemptSerial:serial(state.attemptSerial),targetId:target.id});
 event('monster-revealed',{id:`${state.id}:reveal:${state.revealSerial}`,serial:state.revealSerial,attemptSerial:serial(state.attemptSerial),actorId:monster.id,monsterId:monster.id,attackerId:monster.id,actorName:monster.name,name:monster.name,targetId:target.id,x:monster.x,y:monster.y,text:'A ragged, bell-like scream tears through the cavern.'});
}
const nearestActor=(monster,actors)=>actors.reduce((nearest,actor)=>!nearest||Math.hypot(actor.person.x-monster.x,actor.person.y-monster.y)<Math.hypot(nearest.person.x-monster.x,nearest.person.y-monster.y)?actor:nearest,null);
function recoverBellwether(monster){Object.assign(monster,{phase:'recovery',recovery:BELLWETHER_ATTACKS[monster.bossAttack||'lunge'].recovery,windup:0,lungeRemaining:0,strikeRemaining:0,moving:false,attackUntil:0});}
function bellwetherAttackEvent(state,monster,event,phase){
 const kind=monster.bossAttack||'lunge',text=phase==='tell'?{lunge:'It braces to charge. Move sideways.',shockwave:'Its throat widens. Get outside the ring.',rockfall:'Dust gathers overhead. Move off the marked ground.'}[kind]:phase==='enraged'?'The shell splits. It is moving faster.':undefined;
 event('bellwether-attack',{id:`${state.id}:boss:${state.attemptSerial||0}:${monster.attackSerial}:${phase}`,actorId:monster.id,attackerId:monster.id,actorName:monster.name,kind,phase,x:monster.x,y:monster.y,targetId:monster.targetId,text});
}
function beginBellwetherAttack(state,monster,target,kind,layout,event){
 const person=target.person,angle=Math.atan2(person.y-monster.y,person.x-monster.x),targets=[];
 if(kind==='rockfall'){
  targets.push({x:person.x,y:person.y});
  if(monster.enraged){const extra={x:person.x+Math.cos(angle)*66,y:person.y+Math.sin(angle)*66};if(isCabinWalkable(layout,extra.x,extra.y,6)&&clearSidearmSight(layout,monster,extra))targets.push(extra);}
 }
 Object.assign(monster,{bossAttack:kind,attackSerial:serial(monster.attackSerial)+1,phase:'windup',windup:BELLWETHER_ATTACKS[kind].windup,attackUntil:state.time+BELLWETHER_ATTACKS[kind].windup,
  aimAngle:angle,attackTargets:targets,strikeRemaining:0,moving:false,lungeHitIds:[]});
 const dx=person.x-monster.x,dy=person.y-monster.y;monster.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
 bellwetherAttackEvent(state,monster,event,'tell');
}
function hitBellwetherArea(state,monster,actors,layout,event){
 const kind=monster.bossAttack,points=kind==='shockwave'?[monster]:monster.attackTargets,radius=kind==='shockwave'?monster.shockwaveRadius:monster.rockfallRadius;
 for(const target of actors){
  const person=target.person;if(person.health<=0||person.down||!clearSidearmSight(layout,monster,person)||!points.some(point=>Math.hypot(person.x-point.x,person.y-point.y)<=radius+6))continue;
  const damage=(kind==='shockwave'?monster.shockwaveDamage:monster.rockfallDamage)*clamp(finite(target.damageTakenMultiplier,1),.4,2),id=`${state.id}:${kind}:${++state.shotSerial}`;
  person.health=Math.max(0,person.health-damage);person.hitUntil=state.time+.24;
  const hit={id,team:'hostile',attackerId:monster.id,actorName:monster.name,weaponId:`bellwether-${kind}`,targetId:target.id,targetName:target.name||'Captain',x:person.x,y:person.y,to:{x:person.x,y:person.y},damage,health:person.health,maxHealth:person.maxHealth||100};
  event('person-hit',hit);if(person.health<=0){person.down=true;event('person-down',{...hit,id:id+':down',text:`${monster.name} downed ${target.name||'the captain'}.`});}
 }
}
function hitBellwetherTargets(state,monster,actors,from,to,layout,event){
 const dx=to.x-from.x,dy=to.y-from.y,length2=dx*dx+dy*dy,at=state.time;
 for(const target of actors){
  if(target.person.health<=0||monster.lungeHitIds.includes(target.id))continue;
  const person=target.person,t=length2?clamp(((person.x-from.x)*dx+(person.y-from.y)*dy)/length2,0,1):0;
  if(Math.hypot(person.x-(from.x+dx*t),person.y-(from.y+dy*t))>monster.hitRadius+6||!clearSidearmSight(layout,monster,person))continue;
  monster.lungeHitIds.push(target.id);
  const damage=monster.damage*clamp(finite(target.damageTakenMultiplier,1),.4,2),id=`${state.id}:lunge:${++state.shotSerial}`;
  person.health=Math.max(0,person.health-damage);person.hitUntil=at+.24;
  const hit={id,team:'hostile',attackerId:monster.id,actorName:monster.name,weaponId:'bellwether-lunge',targetId:target.id,targetName:target.name||'Captain',x:person.x,y:person.y,to:{x:person.x,y:person.y},damage,health:person.health,maxHealth:person.maxHealth||100};event('person-hit',hit);
  if(person.health<=0){person.down=true;event('person-down',{...hit,id:id+':down',text:`${monster.name} downed ${target.name||'the captain'}.`});}
 }
}
function stepBellwether(state,monster,actors,dt,layout,event){
 if(!monster.revealed||!actors.length){monster.moving=false;return;}
 const at=state.time,living=actors.filter(actor=>actor.person.health>0&&!actor.person.down);
 if(!monster.enraged&&monster.health<=monster.maxHealth*monster.enrageHealthFraction){monster.enraged=true;monster.speed=monster.enrageSpeed;bellwetherAttackEvent(state,monster,event,'enraged');}
 if(monster.phase==='recovery'){
  monster.recovery=Math.max(0,monster.recovery-dt);monster.moving=false;
  if(!monster.recovery)monster.phase='chase';return;
 }
 if(monster.phase==='windup'){
  monster.windup=Math.max(0,monster.windup-dt);monster.moving=false;
  if(!monster.windup){
   if(!monster.bossAttack||monster.bossAttack==='lunge'){monster.phase='lunge';monster.lungeRemaining=monster.lungeRange;monster.lungeHitIds=[];monster.attackUntil=at+monster.lungeRange/monster.lungeSpeed;}
   else{monster.phase='strike';monster.strikeRemaining=.35;monster.attackUntil=at+.35;hitBellwetherArea(state,monster,living,layout,event);}
   bellwetherAttackEvent(state,monster,event,'impact');
  }
  return;
 }
 if(monster.phase==='strike'){
  // Area damage resolves once, after the complete visible warning. The short
  // remaining phase is presentation, so save/reload cannot repeat the hit.
  monster.strikeRemaining=Math.max(0,monster.strikeRemaining-dt);monster.moving=false;
  if(!monster.strikeRemaining)recoverBellwether(monster);return;
 }
 if(monster.phase==='lunge'){
  // Swept, short physical steps stop the entire body at a wall. The locked
  // vector never homes toward a dodging player or cuts across a corner.
  // Existing body contact still counts after the tell, even if a wall blocks
  // the first stride. Otherwise standing against that wall would grant safety.
  hitBellwetherTargets(state,monster,living,monster,monster,layout,event);
  let travel=Math.min(monster.lungeRemaining,monster.lungeSpeed*dt);monster.moving=travel>0;
  const dx=Math.cos(monster.aimAngle),dy=Math.sin(monster.aimAngle);
  while(travel>1e-7){
   const stride=Math.min(5,travel),x=monster.x+dx*stride,y=monster.y+dy*stride;
   if(!isCabinWalkable(layout,x,y,monster.radius)){recoverBellwether(monster);return;}
   const from={x:monster.x,y:monster.y};monster.x=x;monster.y=y;monster.lungeRemaining=Math.max(0,monster.lungeRemaining-stride);travel-=stride;
   hitBellwetherTargets(state,monster,living,from,monster,layout,event);
  }
  if(monster.lungeRemaining<=1e-7)recoverBellwether(monster);return;
 }
 const seen=living.filter(actor=>canSeeSitePoint(layout,actor.person,monster)),target=nearestActor(monster,seen.length?seen:living);
 if(!target){monster.moving=false;return;}
 monster.targetId=target.id;
 const person=target.person,distance=Math.hypot(person.x-monster.x,person.y-monster.y);
 const kind=['lunge','lunge','shockwave','rockfall'][serial(monster.attackSerial)%4];
 if(seen.includes(target)&&kind!=='lunge'&&distance<=(kind==='shockwave'?104:210)){
  beginBellwetherAttack(state,monster,target,kind,layout,event);return;
 }
 const reach=Math.max(0,distance-monster.hitRadius-6+1),contact={x:monster.x+(person.x-monster.x)/Math.max(1,distance)*reach,y:monster.y+(person.y-monster.y)/Math.max(1,distance)*reach};
 // A captain's smaller body may fit beside a corner where this creature
 // cannot. Route around it until the locked charge can physically reach
 // contact; do not repeatedly throw a blocked lunge at a visible target.
 if(kind==='lunge'&&seen.includes(target)&&distance<=monster.lungeTriggerRange&&clearMonsterPath(layout,monster,contact,monster.radius)){
  beginBellwetherAttack(state,monster,target,kind,layout,event);return;
 }
 monster.phase='chase';walkMonster(monster,person,dt,layout,at);
}
/** Infantry locks its shot during the tell. Cover and a sideways dodge both work. */
function stepInfantry(state,monster,actors,dt,layout,event){
 const living=actors.filter(actor=>actor.person.health>0&&!actor.person.down),target=nearestActor(monster,living),at=state.time;
 monster.cooldown=Math.max(0,finite(monster.cooldown)-dt);
 if(!target){monster.targetId=null;monster.windup=0;monster.moving=false;return;}
 monster.targetId=target.id;
 const person=target.person,distance=Math.hypot(person.x-monster.x,person.y-monster.y),visible=clearSidearmSight(layout,monster,person);
 if(!monster.alert){if(!visible||distance>300){monster.moving=false;return;}monster.alert=true;}
 if(monster.windup>0){
  monster.windup=Math.max(0,monster.windup-dt);monster.moving=false;if(monster.windup>0)return;
  monster.cooldown=monster.fireDelay;
  const aim=sidearmAim(monster,living.map(actor=>({...actor.person,id:actor.id})),{aiming:true,aimX:Math.cos(monster.aimAngle),aimY:Math.sin(monster.aimAngle)},layout);
  const hit=aim.target&&living.find(actor=>actor.id===aim.target.id),damage=hit?monster.damage*clamp(finite(hit.damageTakenMultiplier,1),.4,2):0;
  const id=`${state.id}:infantry-shot:${++state.shotSerial}`,shot={id,team:'hostile',attackerId:monster.id,actorName:monster.name,weaponId:'raider-rifle',angle:aim.angle,from:{...aim.from},to:{...aim.to},x:aim.from.x,y:aim.from.y,targetX:aim.to.x,targetY:aim.to.y,targetId:hit?.id||null,intendedTargetId:monster.aimTargetId||target.id,targetName:hit?.name||null,hit:!!hit,blocked:!!aim.blocked,damage,until:at+.22};
  monster.lastShot=shot;monster.attackUntil=at+.22;event('person-shot',shot);
  if(hit){
   const wounded=hit.person;wounded.health=Math.max(0,wounded.health-damage);wounded.hitUntil=at+.24;
   const impact={...shot,id:id+':hit',x:wounded.x,y:wounded.y,health:wounded.health,maxHealth:wounded.maxHealth||100};event('person-hit',impact);
   if(wounded.health<=0){wounded.down=true;event('person-down',{...impact,id:id+':down',text:`${monster.name} downed ${hit.name||'the captain'}.`});}
  }
  return;
 }
 if(distance>monster.range||!visible){walkMonster(monster,person,dt,layout,at);return;}
 monster.moving=false;
 if(!monster.cooldown){
  const dx=person.x-monster.x,dy=person.y-monster.y;
  monster.windup=monster.windupDuration;monster.attackUntil=at+monster.windup;monster.aimTargetId=target.id;monster.aimAngle=Math.atan2(dy,dx);monster.weaponDrawn=true;
  monster.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
 }
}
/** Participants have {id,name,person,input,damageMultiplier,damageTakenMultiplier,sidearmCooldownMultiplier}. Call once per occupied site. */
export function stepSiteEncounter(state,participants,delta,surface){
 if(state.warzoneGround)return stepWarzoneGround(state,participants,delta,surface);
 const dt=clamp(finite(delta),0,.25),layout=surface.combatLayout;if(!dt||!layout)return[];
 const actors=participants.filter(actor=>actor?.person&&!actor.protected&&actor.person.health>0&&!actor.person.down),events=[];state.time+=dt;
 const at=state.time,event=(type,details)=>events.push({type,siteId:state.id,at,...details});
 const site=surface.site;
 if(site?.quietEarth)stepQuietEarthEncounter(state,actors,dt,surface,event);
 if(state.field)stepFieldEncounter(state,actors,dt,surface,event);
 if(state.watch&&site?.military&&site.watch&&actors.length){
  state.watch.elapsed=Math.min(site.watch.seconds,state.watch.elapsed+dt);
  if(!state.watch.contactResolved&&state.watch.elapsed+1e-6>=site.watch.attackDelay){
   state.watch.contactResolved=true;
   if((hash(`${site.key}:watch-contact`)/4294967296)<site.watch.attackChance){
    state.watch.attackOccurred=true;state.monsters=site.hostiles.map((_,index)=>monsterTemplate(site,index));
    event('military-progress',{text:'Section radio: armed contacts at the post. Take cover and secure the position before the relief arrives.'});
   }
  }
 }
 // Acquire before processing shots, so firing on the first visible frame
 // cannot bypass the scream. Walls and fog use the very same discovery rule.
 for(const monster of state.monsters)if(isBellwether(monster)&&monster.health>0){
  if(!isCabinWalkable(layout,monster.x,monster.y,monster.radius)){
   Object.assign(monster,pt(27,7),{phase:monster.revealed?'chase':'dormant',windup:0,recovery:0,lungeRemaining:0,lungeHitIds:[],attackTargets:[],strikeRemaining:0,attackUntil:0,moving:false});routeCache.delete(monster);
  }
  if(monster.revealed)continue;
  const seen=nearestActor(monster,actors.filter(actor=>canSeeSitePoint(layout,actor.person,monster)));
  if(seen)revealBellwether(state,monster,seen,event);
 }
 for(const actor of actors){
  const person=ensureSidearm(actor.person),id=String(actor.id||'local');state.actorCooldowns[id]=Math.max(0,finite(state.actorCooldowns[id])-dt);
  // The field weapon is available in quiet and cleared places too. Its controls
  // must not reveal that an encounter has started or ended. Empty shots still
  // trace the real walls and use the same recharge as a shot at a live target.
  const candidates=site?.expedition?state.monsters.filter(monster=>!monster.quietEarthDormant&&!monster.hidden&&(actor.input?.aiming===true?!monster.pacified:expeditionHostileTo(monster,id))):state.monsters;
  const aim=sidearmAim(person,candidates,actor.input||{},layout);person.aimAngle=aim.angle;person.aimTargetId=aim.targetId;person.aimManual=aim.manual;person.weaponDrawn=true;
  if(!actor.input?.fire||state.actorCooldowns[id]>0)continue;
  const weapon=getPersonalWeapon(person),target=aim.target,cooldown=weapon.cooldown*clamp(finite(actor.sidearmCooldownMultiplier,1),.5,2),damage=target?creatureDamageTaken(target,person,personalWeaponDamage(person,target,clamp(finite(actor.damageMultiplier,1),.4,2))):0,shotId=`${state.id}:shot:${++state.shotSerial}`;
  state.actorCooldowns[id]=cooldown;person.weaponReadyAt=at+cooldown;person.attackUntil=at+weapon.shotDuration;
  const shot={id:shotId,team:'player',attackerId:id,actorName:actor.name||'Captain',weaponId:weapon.id,angle:aim.angle,from:{...aim.from},to:{...aim.to},x:aim.from.x,y:aim.from.y,targetX:aim.to.x,targetY:aim.to.y,targetId:target?.id||null,targetName:target?.name||null,hit:!!target,blocked:!!aim.blocked,damage,until:at+weapon.shotDuration};person.lastShot=shot;event('person-shot',shot);
  if(target){recordStoryAggression(state,target,id);target.health=Math.max(0,target.health-damage);target.hitUntil=at+.24;target.lastHitBy=id;target.alert=true;if(target.quietEarthActor&&target.health>0){target.quietEarthStaggerUntil=at+.45;target.windup=0;target.attackUntil=0;interruptCreature(target);}event('person-hit',{...shot,id:shotId+':hit',x:target.x,y:target.y,health:target.health,maxHealth:target.maxHealth});if(target.health<=0){target.status='dead';target.windup=0;interruptCreature(target);if(isBellwether(target)){target.phase='dead';target.alert=false;target.recovery=0;target.lungeRemaining=0;target.attackTargets=[];target.strikeRemaining=0;target.attackUntil=0;target.moving=false;}event('boarder-down',{...shot,id:shotId+':down',x:target.x,y:target.y,actorId:target.id,text:`${actor.name||'You'} brought down ${target.name}.`});}}
 }
 for(const monster of state.monsters){
  if(monster.health<=0||monster.quietEarthDormant)continue;
  if(monster.quietEarthActor&&at<finite(monster.quietEarthStaggerUntil)){monster.moving=false;monster.windup=0;interruptCreature(monster);continue;}
  if(isBellwether(monster)){stepBellwether(state,monster,actors,dt,layout,event);continue;}
  if(monster.stationary&&!usesCreatureRules(monster)||monster.attackKind==='none'){monster.moving=false;monster.windup=0;continue;}
  if(!isCabinWalkable(layout,monster.x,monster.y,6)){let best=null,bestDistance=Infinity;for(let cell=0;cell<layout.walkable.length;cell++){if(!layout.walkable[cell])continue;const point=pt(cell%layout.cols,Math.floor(cell/layout.cols)),distance=Math.hypot(point.x-monster.x,point.y-monster.y);if(distance<bestDistance&&isCabinWalkable(layout,point.x,point.y,6)){best=point;bestDistance=distance;}}if(best)Object.assign(monster,best);}
  if(monster.expeditionActor){stepStoryMonster(state,monster,actors,dt,layout,event,walkMonster);continue;}
  if(usesCreatureRules(monster)){stepCreatureEncounter(state,monster,actors,dt,layout,event,walkMonster);continue;}
  if(monster.attackKind==='ranged'){stepInfantry(state,monster,actors,dt,layout,event);continue;}
  monster.cooldown=Math.max(0,finite(monster.cooldown)-dt);
  const target=actors.filter(actor=>actor.person.health>0).sort((a,b)=>Math.hypot(a.person.x-monster.x,a.person.y-monster.y)-Math.hypot(b.person.x-monster.x,b.person.y-monster.y))[0];if(!target){monster.targetId=null;monster.windup=0;monster.moving=false;continue;}
  monster.targetId=target.id;
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
 if(!actors.some(actor=>actor.person.health>0&&!actor.person.down))resetSiteBoss(state);
 const wasCleared=state.cleared;
 state.cleared=(site?.expedition?storyThreats(state).length===0:state.monsters.every(monster=>monster.health<=0))&&(!state.watch||state.watch.elapsed+1e-6>=site.watch.seconds)&&(!state.field?.foreman||state.field.foreman.disabled);
 if(state.cleared!==wasCleared)bumpStoryRevision(state);
 if(state.watch&&state.cleared&&!state.watch.completed){state.watch.completed=true;event('military-progress',{text:state.watch.attackOccurred?'Section radio: the position is secure and the watch is complete. Sign the field log.':'Section radio: relief is here. Nothing further to report; sign the completed watch log.'});}
 return events;
}
