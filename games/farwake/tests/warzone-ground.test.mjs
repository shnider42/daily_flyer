import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {createSiteState,explorationLocation,stepSiteEncounter} from '../dist/exploration.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {isCabinWalkable} from '../dist/interior-layouts.mjs';
import {sidearmAim,clearSidearmSight} from '../dist/combat.mjs';
import {cabinLayout} from '../dist/fleet.mjs';
import {pixelViewport} from '../dist/render-viewport.mjs';
import {surfaceCamera,surfaceWorldToCanvas} from '../dist/camera-view.mjs';
import {PERSON_ZOOM} from '../dist/camera-preferences.mjs';
import {WARZONE_GROUND_SITE_ID,warzoneGroundHostiles,warzoneGroundView,normalizeWarzoneGroundStories,catchUpWarzoneGround,WARZONE_INFANTRY_WEAPONS,drawWarzoneGroundEffects} from '../dist/warzone-ground.mjs';
const pt=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
const ok=value=>{assert.equal(value?.ok,true,value?.reason);return value;};
function fixture(){const location=explorationLocation({id:'crosswind-vey',kind:'planet'},WARZONE_GROUND_SITE_ID),surface=generateSurface({id:'crosswind-vey',kind:'planet',name:'Vey'},'warzone-ground'),encounter=createSiteState(location.site);return{location,surface,encounter};}
function captain(){const game=new Game('warzone-ground-captain');game.state.systemId='crosswind';game._loadSystem('crosswind');game.state.mode='ship';game.state.interior=null;game.state.pendingEncounter=null;const body=game.system.bodies.find(b=>b.id==='crosswind-vey');Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});ok(game.dock(body.id));return game;}
function at(game,id){const entity=game._expeditionSurface().entities.find(e=>e.data?.choiceId===id);assert.ok(entity,id);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity;}
function choose(game,id,option){return ok(game.siteAction(at(game,id).id,'choose',option));}

test('Ashfall has three connected lanes, a protected retreat and reachable physical relief objects',()=>{
 const {location,surface,encounter}=fixture();assert.equal(location.site.warzone,true);assert.equal(surface.kind,'planet');assert.equal(surface.id,'crosswind-vey');assert.equal(surface.outdoorWarzone,true);assert.equal(surface.entities.some(e=>e.type==='siteEntrance'||e.type==='siteExit'),false);assert.equal(location.site.military,undefined);assert.deepEqual([surface.cols,surface.rows],[96,68]);assert.equal(encounter.monsters.length,36);
 const visited=new Set(),todo=[Math.floor(surface.spawn.y/24)*surface.cols+Math.floor(surface.spawn.x/24)];
 for(let head=0;head<todo.length;head++){const i=todo[head];if(visited.has(i))continue;visited.add(i);const x=i%surface.cols,y=Math.floor(i/surface.cols);for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy,j=ny*surface.cols+nx;if(nx>=0&&ny>=0&&nx<surface.cols&&ny<surface.rows&&!visited.has(j)&&isWalkable(surface,(nx+.5)*24,(ny+.5)*24))todo.push(j);}}
 for(const entity of surface.entities){assert.ok(isWalkable(surface,entity.x,entity.y),entity.id);assert.ok(visited.has(Math.floor(entity.y/24)*surface.cols+Math.floor(entity.x/24)),entity.id);}
 for(const y of[20,34,48])for(const x of[7,47,89])assert.ok(visited.has(y*surface.cols+x),`Lane ${y} connects through ${x}`);
 for(let x=6;x<90;x++)assert.ok(isWalkable(surface,...Object.values(pt(x,61))),`Covered route tile ${x} remains open`);
});

test('landing immediately opens the outdoor front with both armies visible at the ordinary person camera',()=>{
 const game=captain(),surface=game._expeditionSurface(),encounter=game.state.exploration.encounter;
 assert.equal(game.state.mode,'person');assert.equal(game.state.locationId,'crosswind-vey');assert.equal(game.state.interior,null);assert.equal(game.state.exploration.outdoor,true);
 assert.deepEqual({x:game.state.person.x,y:game.state.person.y},surface.spawn);
 assert.equal(game.enterSite(WARZONE_GROUND_SITE_ID).code,'outdoor');assert.equal(game.exitSite().code,'outdoor');
 for(const [width,height]of[[1280,720],[960,600],[390,844]]){
  const viewport=pixelViewport({width,height,mode:'person',zoom:PERSON_ZOOM.default}),view=surfaceCamera({x:surface.spawn.x,y:surface.spawn.y,worldWidth:surface.width,worldHeight:surface.height,width:viewport.logicalWidth,height:viewport.logicalHeight,zoom:PERSON_ZOOM.default,rasterScale:viewport.rasterScale});
  const visible=encounter.monsters.filter(unit=>{const p=surfaceWorldToCanvas(unit.x,unit.y,view);return p.x>=0&&p.y>=0&&p.x<view.width&&p.y<view.height;});
  assert.deepEqual([...new Set(visible.map(unit=>unit.factionId))].sort(),['freewake','meridian'],`${width}×${height} shows both lines on arrival`);
 }
 const before=encounter.monsters.map(unit=>({x:unit.x,y:unit.y})),events=[];
 for(let i=0;i<25;i++)events.push(...stepSiteEncounter(encounter,[],.1,surface));
 assert.ok(encounter.monsters.some((unit,i)=>Math.hypot(unit.x-before[i].x,unit.y-before[i].y)>20));
 assert.ok(events.some(event=>event.type==='person-shot'),'the visible front opens fire within the first few seconds');
 const landing={id:'landing',person:{...surface.spawn,health:100,maxHealth:100},input:{},factionId:'freewake',hostileFactions:['meridian']};
 for(let i=0;i<400;i++){stepSiteEncounter(encounter,[landing],.1,surface);assert.ok(encounter.monsters.every(unit=>unit.targetId!=='landing'));}
 assert.equal(landing.person.health,100,'the screened landing remains clear of scheduled bombardment and deliberate targeting');
});

test('solo dock, physical launch and a docked airlock rebind the same outdoor battle and personal work',()=>{
 const game=captain(),key=game.state.exploration.key;choose(game,'hospital','accept');
 Object.assign(game.state.person,pt(48,34));const active=game.state.exploration;
 assert.equal(game.launch().code,'distance');assert.equal(game.quickLaunch().code,'distance');assert.equal(game.state.exploration,active);
 let exit=game._expeditionSurface().entities.find(entity=>entity.type==='exit');Object.assign(game.state.person,{x:exit.x,y:exit.y});
 ok(game.launch());assert.equal(game.state.mode,'ship');assert.equal(game.state.exploration,null);assert.equal(game.state.explorationRecords[key],active.encounter);
 const elapsed=active.encounter.time;game.state.stats.time+=8;ok(game.dock('crosswind-vey'));
 assert.equal(game.state.exploration.key,key);assert.ok(Math.abs(game.state.exploration.encounter.time-elapsed-8)<1e-6);assert.equal(game.state.warzoneStories.hospital.stage,'accepted');
 // The cabin-entry primitive is also used by crew duty and rescue visits. The
 // public airlock command must restore the outdoor battle without a front door.
 const encounter=game.state.exploration.encounter;ok(game._enterInterior(game._cabinLocation(),'ship'));
 assert.equal(game.state.exploration,null);assert.equal(game.state.explorationRecords[key],encounter);
 Object.assign(game.state.person,{x:0,y:0});assert.equal(game.disembark().code,'distance');
 Object.assign(game.state.person,cabinLayout(game.state.ship.classId).spawn);ok(game.disembark());
 assert.equal(game.state.interior,null);assert.equal(game.state.exploration.outdoor,true);assert.equal(game.state.exploration.key,key);assert.equal(game.state.locationId,'crosswind-vey');
 assert.deepEqual({x:game.state.person.x,y:game.state.person.y},game._expeditionSurface().spawn);assert.equal(game.state.warzoneStories.hospital.stage,'accepted');
 exit=game._expeditionSurface().entities.find(entity=>entity.type==='exit');Object.assign(game.state.person,{x:exit.x,y:exit.y});ok(game.quickLaunch());assert.equal(game.state.exploration,null);
});

test('old Ashfall interior saves migrate outdoors without resetting wounds, stories, rewards or valid positions',()=>{
 const game=captain();choose(game,'hospital','accept');choose(game,'depot','recover');choose(game,'generator','theatre');choose(game,'hospital','complete');
 Object.assign(game.state.person,pt(7,61));const key=game.state.exploration.key,raw=game.save(),position={x:raw.person.x,y:raw.person.y},credits=raw.credits;
 const legacyLocation=structuredClone(explorationLocation(game.currentBody,WARZONE_GROUND_SITE_ID,game.state.seed));delete legacyLocation.site.outdoor;
 delete raw.exploration.outdoor;raw.exploration.returnPosition={x:1368,y:1008};raw.interior={kind:'site',location:legacyLocation};raw.locationId=legacyLocation.id;
 raw.exploration.encounter.monsters[0].health=41;raw.explorationRecords[key].monsters[0].health=41;
 const restored=Game.fromSave(raw);assert.equal(restored.state.locationId,'crosswind-vey');assert.equal(restored.state.interior,null);assert.equal(restored.state.exploration.outdoor,true);assert.equal(restored.state.exploration.key,key);
 assert.deepEqual({x:restored.state.person.x,y:restored.state.person.y},position);assert.equal(restored.state.exploration.encounter.monsters[0].health,41);assert.equal(restored.state.warzoneStories.hospital.stage,'done');assert.equal(restored.state.warzoneStories.hospital.allocation,'theatre');assert.equal(restored.state.credits,credits);
 assert.equal(restored.siteAction(at(restored,'hospital').id,'choose','complete').ok,false);assert.equal(restored.state.credits,credits);
});

test('armies fight without a player, change phases and replenish bounded squads after a wipe',()=>{
 const {location,surface,encounter}=fixture(),events=[],tactics=new Set();let engaged=0,engagedMoving=0;
 for(let i=0;i<1800;i++){
  events.push(...stepSiteEncounter(encounter,[],.1,surface));
  for(const unit of encounter.monsters){tactics.add(unit.tactic);if(unit.health>0&&unit.targetId){engaged++;if(unit.moving)engagedMoving++;}}
 }
 assert.ok(encounter.warzoneGround.casualties.freewake>0);assert.ok(encounter.warzoneGround.casualties.meridian>0);assert.ok(events.some(e=>e.type==='warzone-ground-phase'));assert.ok(events.some(e=>e.type==='warzone-ground-impact'));assert.ok(events.some(e=>e.type==='warzone-ground-reinforcements'));
 assert.ok(engagedMoving/engaged>.25,'troops relocate while engaged instead of standing in two firing lines');
 for(const tactic of['bound','cover','flank','suppress','overwatch','aid','fallback','evade'])assert.ok(tactics.has(tactic),tactic);
 const fired=new Set(events.filter(event=>event.type==='person-shot').map(event=>event.weaponId));for(const profile of Object.values(WARZONE_INFANTRY_WEAPONS))assert.ok(fired.has(profile.id),profile.id);
 const warnings=new Map(events.filter(event=>event.type==='warzone-ground-incoming').map(event=>[event.id,event]));
 assert.ok([...warnings.values()].some(event=>event.kind==='grenade'));assert.ok([...warnings.values()].some(event=>event.kind==='mortar'));
 for(const impact of events.filter(event=>event.type==='warzone-ground-impact')){const warning=warnings.get(impact.id);assert.ok(warning,impact.id);assert.ok(impact.at-warning.at>=1.5,'each blast gives time to leave its marked radius');}
 assert.equal(encounter.cleared,false);assert.equal(encounter.monsters.length,36);assert.ok(encounter.warzoneGround.scars.length<=32);assert.ok(encounter.warzoneGround.shells.length<=10);
 for(const unit of encounter.monsters.filter(u=>u.health>0))assert.ok(isCabinWalkable(surface.combatLayout,unit.x,unit.y,6),unit.id);
 encounter.monsters.forEach(u=>u.health=0);const before=encounter.time;catchUpWarzoneGround(encounter,99999,surface);assert.ok(Math.abs(encounter.time-before-90)<1e-6);assert.ok(encounter.monsters.some(u=>u.health>0));assert.equal(encounter.cleared,false);
 const raw=structuredClone(encounter);raw.monsters.push({...raw.monsters[0],slot:999,damage:99999});raw.monsters[0].damage=99999;raw.warzoneGround.scars.push(...Array.from({length:300},()=>({x:-999,y:1e9})));const restored=createSiteState(location.site,raw);
 assert.equal(restored.monsters.length,36);assert.ok(restored.monsters.every(u=>u.damage===WARZONE_INFANTRY_WEAPONS[u.role].damage));assert.equal(restored.warzoneGround.scars.length,32);assert.deepEqual(restored.warzoneGround.casualties,encounter.warzoneGround.casualties);assert.equal(new Set(restored.monsters.map(u=>u.id)).size,36);
});

test('infantry acquisition respects walls and does not invent a hidden target position',()=>{
 const{surface,encounter}=fixture();encounter.monsters.forEach(unit=>unit.health=0);
 const one=encounter.monsters.find(unit=>unit.factionId==='freewake'&&unit.role==='marksman'),two=encounter.monsters.find(unit=>unit.factionId==='meridian'&&unit.role==='marksman');
 Object.assign(one,pt(32,27),{health:78,lastSeen:null});Object.assign(two,pt(44,27),{health:78,lastSeen:null});
 assert.equal(clearSidearmSight(surface.combatLayout,one,two),false);stepSiteEncounter(encounter,[],.01,surface);
 assert.equal(one.targetId,null);assert.equal(two.targetId,null);assert.equal(one.lastSeen,null);assert.equal(two.lastSeen,null);
});

test('ground blasts draw warnings, lobbed grenades, flash, shockwave, debris, smoke and persistent craters without mutating battle state',()=>{
 const{surface,encounter}=fixture(),origin=pt(47,48),area={...surface,warzoneFires:[]},shell={id:'visual-shell',...origin,kind:'grenade',from:pt(43,48),launchedAt:0,impactAt:2,until:5.4,radius:42,impacted:false};
 encounter.time=1;encounter.warzoneGround.shells=[shell];encounter.warzoneGround.scars=[{...origin,type:'crater',radius:42,at:0}];
 const context=()=>({fills:[],globalAlpha:1,fillRect(x,y,w,h){assert.ok([x,y,w,h].every(Number.isFinite));this.fills.push({color:this.fillStyle,x,y,w,h,alpha:this.globalAlpha});}});
 const options={cameraX:origin.x-180,cameraY:origin.y-180,width:360,height:360,time:1};
 let before=JSON.stringify(encounter),floor=context(),air=context(),reduced=context();
 drawWarzoneGroundEffects(floor,area,encounter,{...options,layer:'floor'});drawWarzoneGroundEffects(air,area,encounter,{...options,layer:'air'});drawWarzoneGroundEffects(reduced,area,encounter,{...options,layer:'air',reduceMotion:true});
 assert.ok(floor.fills.some(fill=>fill.color==='#edc782'),'a grenade has a readable amber ground warning');assert.ok(floor.fills.some(fill=>fill.color==='#24282c'),'crater interior survives the flash');
 assert.ok(air.fills.some(fill=>fill.color==='#b7c6a1'),'a thrown grenade is visible in flight');assert.equal(reduced.fills.length,0,'reduced motion skips the flying projectile');assert.equal(JSON.stringify(encounter),before);
 shell.impacted=true;encounter.time=2.1;before=JSON.stringify(encounter);air=context();reduced=context();
 drawWarzoneGroundEffects(air,area,encounter,{...options,layer:'air'});drawWarzoneGroundEffects(reduced,area,encounter,{...options,layer:'air',reduceMotion:true});
 for(const color of['#fff0c6','#c5b79b','#d5a564'])assert.ok(air.fills.some(fill=>fill.color===color),color);
 assert.equal(reduced.fills.some(fill=>fill.color==='#fff0c6'||fill.color==='#d5a564'),false,'reduced motion removes the bright core and flying debris');assert.ok(reduced.fills.length>0,'the impact remains readable');assert.equal(JSON.stringify(encounter),before);
 encounter.time=3.2;air=context();drawWarzoneGroundEffects(air,area,encounter,{...options,layer:'air'});assert.ok(air.fills.some(fill=>fill.color==='#6d6a61'||fill.color==='#81786a'),'smoke remains after the flash');
});

test('neutral captains are not automatically targeted, explicit aggression is personal, and friendly aim is filtered',()=>{
 const {surface,encounter}=fixture();const neutral={id:'neutral',person:{...pt(48,20),health:100,maxHealth:100},input:{},hostileFactions:[]};const ally={id:'union',person:{...pt(48,34),health:100,maxHealth:100},input:{},factionId:'freewake',hostileFactions:[]};
 assert.equal(warzoneGroundHostiles(encounter,neutral).length,0);assert.equal(warzoneGroundHostiles(encounter,ally).length,18);assert.equal(warzoneGroundHostiles(encounter,'meridian').length,18);assert.equal(warzoneGroundHostiles(encounter,{factionId:'freewake',hostileFactions:['freewake']}).length,36);
 for(let i=0;i<30;i++){stepSiteEncounter(encounter,[neutral,ally],.1,surface);assert.ok(encounter.monsters.every(u=>u.targetId!=='neutral'));assert.ok(encounter.monsters.filter(u=>u.targetId==='union').length<=2);}
 const view=warzoneGroundView(encounter,neutral);assert.ok(view.monsters.every(u=>!u.hostile));assert.equal(view.warzoneGround.rng,undefined);assert.equal(view.warzoneGround.nextWave,undefined);assert.equal(view.warzoneGround.nextShell,undefined);assert.equal(view.warzoneGround.phaseUntil,undefined);
 const target=encounter.monsters.find(u=>u.factionId==='meridian'&&u.health>0);let shot=null;for(const radius of[72,96,120])for(let i=0;i<16&&!shot;i++){const a=i*Math.PI/8,p={x:target.x+Math.cos(a)*radius,y:target.y+Math.sin(a)*radius},input={fire:true,aiming:true,aimX:-Math.cos(a),aimY:-Math.sin(a)};if(isWalkable(surface,p.x,p.y)&&sidearmAim(p,encounter.monsters,input,surface.combatLayout).targetId===target.id)shot={p,input};}assert.ok(shot);
 Object.assign(neutral.person,shot.p);neutral.input=shot.input;const aggression=[];neutral.onWarzoneAggression=id=>aggression.push(id);stepSiteEncounter(encounter,[neutral,ally],.1,surface);assert.deepEqual(aggression,['meridian']);assert.ok(warzoneGroundHostiles(encounter,neutral).every(u=>u.factionId==='meridian'));assert.deepEqual(ally.hostileFactions,[]);
});

test('squad medics heal wounded comrades and soldiers retain working route positions',()=>{
 const {surface,encounter}=fixture(),medic=encounter.monsters.find(u=>u.factionId==='freewake'&&u.role==='medic'),wounded=encounter.monsters.find(u=>u.factionId==='freewake'&&u.role==='leader');
 Object.assign(medic,pt(20,61));Object.assign(wounded,pt(21,61),{health:20});for(let i=0;i<8;i++)stepSiteEncounter(encounter,[],.1,surface);assert.ok(wounded.health>20);assert.equal(medic.healTargetId,wounded.id);
});

test('three relief stories require physical stages, escort walking, and preserve consequences without repeat payouts',()=>{
 let game=captain(),credits=game.state.credits;const hospital=game._expeditionSurface().entities.find(e=>e.data?.choiceId==='hospital');assert.equal(game.siteAction(hospital.id,'choose','accept').code,'distance');
 choose(game,'hospital','accept');assert.equal(game.siteAction(at(game,'hospital').id,'choose','complete').ok,false);choose(game,'depot','recover');choose(game,'generator','triage');choose(game,'hospital','complete');assert.equal(game.state.credits,credits+180);assert.equal(game.siteAction(at(game,'hospital').id,'choose','complete').ok,false);assert.equal(game.state.warzoneStories.hospital.allocation,'triage');
 choose(game,'evacuation','accept');choose(game,'shelter','escort');const initial=structuredClone(game.state.warzoneStories.evacuation.escort);Object.assign(game.state.person,pt(15,61));for(let i=0;i<20;i++)game.stepExploration(.1,{});assert.deepEqual({x:game.state.warzoneStories.evacuation.escort.x,y:game.state.warzoneStories.evacuation.escort.y},{x:initial.x,y:initial.y},'running away leaves the group waiting');
 for(let i=0;i<600&&game.state.warzoneStories.evacuation.stage==='escorting';i++){const escort=game.state.warzoneStories.evacuation.escort;Object.assign(game.state.person,{x:Math.max(pt(15,61).x,escort.x-90),y:pt(15,61).y});game.stepExploration(.1,{});}
 assert.equal(game.state.warzoneStories.evacuation.stage,'arrived');choose(game,'evacuation','complete');assert.equal(game.state.credits,credits+400);assert.equal(game._expeditionSurface().entities.filter(e=>e.data?.warzoneResident==='tenant').length,0);
 choose(game,'names','accept');choose(game,'registry','recover');assert.equal(game.siteAction(at(game,'names').id,'choose','public').ok,false);choose(game,'tags','recover');choose(game,'names','families');assert.equal(game.state.credits,credits+560);
 game=Game.fromSave(game.save());assert.equal(game.state.warzoneStories.hospital.stage,'done');assert.equal(game.state.warzoneStories.names.decision,'families');assert.equal(game.siteAction(at(game,'names').id,'choose','families').ok,false);assert.equal(game.state.credits,credits+560);assert.match(game.siteAction(at(game,'hospital').id).text,/still running/);
 const previous=game.state.exploration.encounter.time;const exit=game._expeditionSurface().entities.find(e=>e.type==='exit');Object.assign(game.state.person,{x:exit.x,y:exit.y});ok(game.launch());game.state.stats.time+=200;ok(game.dock('crosswind-vey'));assert.ok(Math.abs(game.state.exploration.encounter.time-previous-90)<1e-5);assert.equal(game.state.credits,credits+560);
});

test('NPC-only catch-up cannot advance a paused civilian escort',()=>{
 const {surface,encounter}=fixture(),stories=normalizeWarzoneGroundStories({evacuation:{stage:'escorting',escort:pt(79,59)}}),before=structuredClone(stories);catchUpWarzoneGround(encounter,30,surface);assert.deepEqual(stories,before);
});

test('Orsa and Lorn have reachable authored rooms with personal dispatch and named rescue aftermaths',()=>{
 let game=captain();
 const visit=(bodyId,siteId)=>{if(game.state.exploration){const outdoor=game.state.exploration.outdoor,exit=game._expeditionSurface().entities.find(e=>e.type===(outdoor?'exit':'siteExit'));Object.assign(game.state.person,{x:exit.x,y:exit.y});ok(outdoor?game.launch():game.exitSite());}game.state.mode='person';game.state.locationId=bodyId;game.state.lastBodyId=bodyId;game.state.interior=null;game.state.pendingEncounter=null;const outdoor=generateSurface(game.currentBody,game.state.seed),entrance=outdoor.entities.find(e=>e.data?.siteId===siteId);assert.ok(entrance);assert.ok(isWalkable(outdoor,entrance.x,entrance.y));Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite(siteId));return game._expeditionSurface();};
 let room=visit('crosswind-orsa','thawline-reception');assert.equal(room.site.crosswindSupport,'refuge');assert.equal(game.state.exploration.encounter.warzoneGround,undefined);assert.equal(room.entities.filter(e=>e.data?.crosswindResident==='rescued-tenant').length,0);assert.match(game.siteAction(at(game,'refuge-arrivals').id).text,/no completed evacuation/);
 room=visit('crosswind-lorn','fuel-dispatch');assert.equal(room.site.crosswindSupport,'dispatch');assert.equal(game.state.exploration.encounter.monsters.length,0);const credits=game.state.credits;choose(game,'fuel-dispatch','relief');assert.equal(game.state.credits,credits);assert.equal(game.state.warzoneStories.dispatch.decision,'relief');assert.equal(game.siteAction(at(game,'fuel-dispatch').id,'choose','hauler').ok,false);
 // The preceding full-arc test proves the walk/registration gate. Here this
 // saved result exercises the distinct destination scene, not another escort.
 game.state.warzoneStories.evacuation=normalizeWarzoneGroundStories({evacuation:{stage:'done',escort:pt(15,61)}}).evacuation;
 room=visit('crosswind-orsa','thawline-reception');assert.deepEqual(room.entities.filter(e=>e.data?.crosswindResident==='rescued-tenant').map(e=>e.name),['Siv','Oren','Mara']);assert.match(game.siteAction(at(game,'refuge-arrivals').id).text,/whole sleeping hall/);assert.match(room.entities.find(e=>e.data?.crosswindResident==='heating').data.greeting,/All sleeping bays have heat/);
 for(const[bodyId,siteId]of[['crosswind-orsa','thawline-reception'],['crosswind-lorn','fuel-dispatch']]){const location=explorationLocation({id:bodyId,kind:'planet'},siteId),map=generateSurface(location),visited=new Set(),todo=[Math.floor(map.spawn.y/24)*map.cols+Math.floor(map.spawn.x/24)];for(let head=0;head<todo.length;head++){const i=todo[head];if(visited.has(i))continue;visited.add(i);const x=i%map.cols,y=Math.floor(i/map.cols);for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy,j=ny*map.cols+nx;if(nx>=0&&ny>=0&&nx<map.cols&&ny<map.rows&&!visited.has(j)&&isWalkable(map,(nx+.5)*24,(ny+.5)*24))todo.push(j);}}for(const entity of map.entities)assert.ok(visited.has(Math.floor(entity.y/24)*map.cols+Math.floor(entity.x/24)),entity.id);}
 game=Game.fromSave(game.save());assert.equal(game.state.warzoneStories.dispatch.decision,'relief');assert.equal(game._expeditionSurface().entities.filter(e=>e.data?.crosswindResident==='rescued-tenant').length,3);
});
