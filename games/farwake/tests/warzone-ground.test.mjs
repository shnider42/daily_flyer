import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {createSiteState,explorationLocation,stepSiteEncounter} from '../dist/exploration.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {isCabinWalkable} from '../dist/interior-layouts.mjs';
import {sidearmAim} from '../dist/combat.mjs';
import {WARZONE_GROUND_SITE_ID,warzoneGroundHostiles,warzoneGroundView,normalizeWarzoneGroundStories,catchUpWarzoneGround} from '../dist/warzone-ground.mjs';
const pt=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
const ok=value=>{assert.equal(value?.ok,true,value?.reason);return value;};
function fixture(){const location=explorationLocation({id:'crosswind-vey',kind:'planet'},WARZONE_GROUND_SITE_ID),surface=generateSurface(location,'warzone-ground'),encounter=createSiteState(location.site);return{location,surface,encounter};}
function captain(){const game=new Game('warzone-ground-captain');game.state.systemId='crosswind';game._loadSystem('crosswind');game.state.mode='person';game.state.locationId='crosswind-vey';game.state.lastBodyId='crosswind-vey';game.state.interior=null;game.state.pendingEncounter=null;const surface=generateSurface(game.currentBody,game.state.seed),entrance=surface.entities.find(e=>e.data?.siteId===WARZONE_GROUND_SITE_ID);Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite(WARZONE_GROUND_SITE_ID));return game;}
function at(game,id){const entity=game._expeditionSurface().entities.find(e=>e.data?.choiceId===id);assert.ok(entity,id);Object.assign(game.state.person,{x:entity.x,y:entity.y});return entity;}
function choose(game,id,option){return ok(game.siteAction(at(game,id).id,'choose',option));}

test('Ashfall has three connected lanes, a protected retreat and reachable physical relief objects',()=>{
 const {location,surface,encounter}=fixture();assert.equal(location.site.warzone,true);assert.equal(location.site.military,undefined);assert.deepEqual([surface.cols,surface.rows],[96,68]);assert.equal(encounter.monsters.length,36);
 const visited=new Set(),todo=[Math.floor(surface.spawn.y/24)*surface.cols+Math.floor(surface.spawn.x/24)];
 for(let head=0;head<todo.length;head++){const i=todo[head];if(visited.has(i))continue;visited.add(i);const x=i%surface.cols,y=Math.floor(i/surface.cols);for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy,j=ny*surface.cols+nx;if(nx>=0&&ny>=0&&nx<surface.cols&&ny<surface.rows&&!visited.has(j)&&isWalkable(surface,(nx+.5)*24,(ny+.5)*24))todo.push(j);}}
 for(const entity of surface.entities){assert.ok(isWalkable(surface,entity.x,entity.y),entity.id);assert.ok(visited.has(Math.floor(entity.y/24)*surface.cols+Math.floor(entity.x/24)),entity.id);}
 for(const y of[20,34,48])for(const x of[7,47,89])assert.ok(visited.has(y*surface.cols+x),`Lane ${y} connects through ${x}`);
 for(let x=6;x<90;x++)assert.ok(isWalkable(surface,...Object.values(pt(x,61))),`Covered route tile ${x} remains open`);
});

test('armies fight without a player, change phases and replenish bounded squads after a wipe',()=>{
 const {location,surface,encounter}=fixture(),events=[];for(let i=0;i<1800;i++)events.push(...stepSiteEncounter(encounter,[],.1,surface));
 assert.ok(encounter.warzoneGround.casualties.freewake>0);assert.ok(encounter.warzoneGround.casualties.meridian>0);assert.ok(events.some(e=>e.type==='warzone-ground-phase'));assert.ok(events.some(e=>e.type==='warzone-ground-impact'));assert.ok(events.some(e=>e.type==='warzone-ground-reinforcements'));
 assert.equal(encounter.cleared,false);assert.equal(encounter.monsters.length,36);assert.ok(encounter.warzoneGround.scars.length<=32);assert.ok(encounter.warzoneGround.shells.length<=6);
 for(const unit of encounter.monsters.filter(u=>u.health>0))assert.ok(isCabinWalkable(surface.combatLayout,unit.x,unit.y,6),unit.id);
 encounter.monsters.forEach(u=>u.health=0);const before=encounter.time;catchUpWarzoneGround(encounter,99999,surface);assert.ok(Math.abs(encounter.time-before-90)<1e-6);assert.ok(encounter.monsters.some(u=>u.health>0));assert.equal(encounter.cleared,false);
 const raw=structuredClone(encounter);raw.monsters.push({...raw.monsters[0],slot:999,damage:99999});raw.monsters[0].damage=99999;raw.warzoneGround.scars.push(...Array.from({length:300},()=>({x:-999,y:1e9})));const restored=createSiteState(location.site,raw);
 assert.equal(restored.monsters.length,36);assert.ok(restored.monsters.every(u=>u.damage<=14));assert.equal(restored.warzoneGround.scars.length,32);assert.deepEqual(restored.warzoneGround.casualties,encounter.warzoneGround.casualties);assert.equal(new Set(restored.monsters.map(u=>u.id)).size,36);
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
 const previous=game.state.exploration.encounter.time;const exit=game._expeditionSurface().entities.find(e=>e.type==='siteExit');Object.assign(game.state.person,{x:exit.x,y:exit.y});ok(game.exitSite());game.state.stats.time+=200;const entrance=generateSurface(game.currentBody,game.state.seed).entities.find(e=>e.data?.siteId===WARZONE_GROUND_SITE_ID);Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite(WARZONE_GROUND_SITE_ID));assert.ok(Math.abs(game.state.exploration.encounter.time-previous-90)<1e-5);assert.equal(game.state.credits,credits+560);
});

test('NPC-only catch-up cannot advance a paused civilian escort',()=>{
 const {surface,encounter}=fixture(),stories=normalizeWarzoneGroundStories({evacuation:{stage:'escorting',escort:pt(79,59)}}),before=structuredClone(stories);catchUpWarzoneGround(encounter,30,surface);assert.deepEqual(stories,before);
});

test('Orsa and Lorn have reachable authored rooms with personal dispatch and named rescue aftermaths',()=>{
 let game=captain();
 const visit=(bodyId,siteId)=>{if(game.state.exploration){const exit=game._expeditionSurface().entities.find(e=>e.type==='siteExit');Object.assign(game.state.person,{x:exit.x,y:exit.y});ok(game.exitSite());}game.state.locationId=bodyId;game.state.lastBodyId=bodyId;game.state.interior=null;game.state.pendingEncounter=null;const outdoor=generateSurface(game.currentBody,game.state.seed),entrance=outdoor.entities.find(e=>e.data?.siteId===siteId);assert.ok(entrance);assert.ok(isWalkable(outdoor,entrance.x,entrance.y));Object.assign(game.state.person,{x:entrance.x,y:entrance.y});ok(game.enterSite(siteId));return game._expeditionSurface();};
 let room=visit('crosswind-orsa','thawline-reception');assert.equal(room.site.crosswindSupport,'refuge');assert.equal(game.state.exploration.encounter.warzoneGround,undefined);assert.equal(room.entities.filter(e=>e.data?.crosswindResident==='rescued-tenant').length,0);assert.match(game.siteAction(at(game,'refuge-arrivals').id).text,/no completed evacuation/);
 room=visit('crosswind-lorn','fuel-dispatch');assert.equal(room.site.crosswindSupport,'dispatch');assert.equal(game.state.exploration.encounter.monsters.length,0);const credits=game.state.credits;choose(game,'fuel-dispatch','relief');assert.equal(game.state.credits,credits);assert.equal(game.state.warzoneStories.dispatch.decision,'relief');assert.equal(game.siteAction(at(game,'fuel-dispatch').id,'choose','hauler').ok,false);
 // The preceding full-arc test proves the walk/registration gate. Here this
 // saved result exercises the distinct destination scene, not another escort.
 game.state.warzoneStories.evacuation=normalizeWarzoneGroundStories({evacuation:{stage:'done',escort:pt(15,61)}}).evacuation;
 room=visit('crosswind-orsa','thawline-reception');assert.deepEqual(room.entities.filter(e=>e.data?.crosswindResident==='rescued-tenant').map(e=>e.name),['Siv','Oren','Mara']);assert.match(game.siteAction(at(game,'refuge-arrivals').id).text,/whole sleeping hall/);assert.match(room.entities.find(e=>e.data?.crosswindResident==='heating').data.greeting,/All sleeping bays have heat/);
 for(const[bodyId,siteId]of[['crosswind-orsa','thawline-reception'],['crosswind-lorn','fuel-dispatch']]){const location=explorationLocation({id:bodyId,kind:'planet'},siteId),map=generateSurface(location),visited=new Set(),todo=[Math.floor(map.spawn.y/24)*map.cols+Math.floor(map.spawn.x/24)];for(let head=0;head<todo.length;head++){const i=todo[head];if(visited.has(i))continue;visited.add(i);const x=i%map.cols,y=Math.floor(i/map.cols);for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy,j=ny*map.cols+nx;if(nx>=0&&ny>=0&&nx<map.cols&&ny<map.rows&&!visited.has(j)&&isWalkable(map,(nx+.5)*24,(ny+.5)*24))todo.push(j);}}for(const entity of map.entities)assert.ok(visited.has(Math.floor(entity.y/24)*map.cols+Math.floor(entity.x/24)),entity.id);}
 game=Game.fromSave(game.save());assert.equal(game.state.warzoneStories.dispatch.decision,'relief');assert.equal(game._expeditionSurface().entities.filter(e=>e.data?.crosswindResident==='rescued-tenant').length,3);
});
