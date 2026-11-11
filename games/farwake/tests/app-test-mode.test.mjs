import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game, distance} from '../dist/engine.mjs';
import {getShipClass, cabinLayout} from '../dist/fleet.mjs';
import {generateSurface, isWalkable, nearestEntity} from '../dist/surface.mjs';
import {TEST_SCENARIOS, testEnemyChoices, unlockTestMode, createTestSession, resetTestSession, testSessionStatus} from '../dist/test-lab.mjs';
import {TutorialRuntime} from '../dist/tutorial-runtime.mjs';
import {SIDEARM,getPersonalWeapon} from '../dist/combat.mjs';
import {isFoggedSite,createSiteVisibility,visibleSiteHostiles,visibleSiteCombatEvent} from '../dist/site-visibility.mjs';
import {CameraProfile} from '../dist/camera-profile.mjs';
import {normalizeCameraPreferences,normalizeModeZoom,zoomLimits} from '../dist/camera-preferences.mjs';
import {syncDamageMarkers,nearestDamageMarker,nearestDeckInteraction,damageStatus} from '../dist/interior-presentation.mjs';
import {DAMAGE_CONTROL_ACTIONS,interiorDamageSummary} from '../dist/interior-damage.mjs';
import {rescueOccupants} from '../dist/rescue-rules.mjs';
import {getPerspectiveAction} from '../dist/perspective-controls.mjs';
import {updateNpcLife} from '../dist/npc-life.mjs';
import {musicContext,classifyMusicEvent} from '../dist/music-context.mjs';

// Exercise the real app handlers with a small DOM boundary, without opening a
// browser, invoking the render loop, or replacing the actual Game rules.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{
  const index=declarations.findIndex(match=>match[1]===name);
  assert.ok(index>=0,`The application declares ${name}.`);
  return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);
};
const names=['openTestGate','openTestMenu','enterTestSession','retryTest','exitTestMode','openTestControls','start','saveNow','invoke','performInvoke','runDeckAction','result','processEvents','ensureSurface','npcTime','syncNpcLife','updateSurfaceFlags','currentDamageHull','aboardDamageHull','syncDeckDamage','openDamageOverview','openDamageSection','damageSectionText','hullSystemMarkup','nearby','interact','leaveSurface','handleEntity','openStation','openMap','openOutfitter','openShip','openCrew','openJournal','openSavePanel','openOnline','openConnect','connectGalaxy','openHome','openHelp','selectGuide','guidanceContext','currentPerspectiveAction','recordGuide','recordGuideEvent','contextLabel','workFinished','currentWorkToken','personCombat','personHostiles','sidearmDelay','activateLocalCamera','readCameraDraft','persistCameraDraft','reportCameraSaveFailure','applyCameraState','syncViewControls','setModeZoom'];
const appCode=[...names,'sampleScoreContext','localSiteVisibility','personalAimAvailable'].map(declaration).join('\n');

function classes() {
  const values=new Set();
  return {add:(...names)=>names.forEach(name=>values.add(name)),remove:(...names)=>names.forEach(name=>values.delete(name)),contains:name=>values.has(name),toggle(name,force){const add=force??!values.has(name);if(add)values.add(name);else values.delete(name);return add;}};
}
function element() {
  return {hidden:false,value:'',textContent:'',children:[],attributes:{},classList:classes(),append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},setAttribute(key,value){this.attributes[key]=value;},addEventListener(){},insertAdjacentHTML(){},focus(){},select(){}};
}
function fixture() {
  const elements=new Map(),storageEntries=new Map(),writes=[],guidanceWrites=[],preferenceWrites=[],toasts=[],opened=[],effects=[],timers=new Map();let timerSerial=0;
  const schedule=(callback,delay)=>{const id=++timerSerial;timers.set(id,{callback,delay});return id;},cancel=id=>timers.delete(id);
  const tutorial=new TutorialRuntime({nonce:'app-test-mode',storage:{getItem:()=>null,setItem:(...args)=>guidanceWrites.push(args)}});
  const normal=new Game('normal-voyage-to-preserve');normal.state.credits=623;normal.state.flags.push('a-earned-milestone');
  const stored=normal.save(),body={classList:classes()},dialog={opened:false,kind:null,items:[],htmlText:'',body:element(),
    open(title,kind){this.opened=true;this.kind=kind;this.items=[];opened.push({title,kind});},html(value){this.htmlText=value;},choices(items){this.items.push(...items);},
    close(){if(!this.opened)return;this.opened=false;context.saveNow();}};
  const context=vm.createContext({Game,distance,updateNpcLife,musicContext,classifyMusicEvent,syncDamageMarkers,nearestDamageMarker,nearestDeckInteraction,damageStatus,DAMAGE_CONTROL_ACTIONS,interiorDamageSummary,getShipClass,generateSurface,isWalkable,nearestEntity,TEST_SCENARIOS,testEnemyChoices,unlockTestMode,createTestSession,resetTestSession,testSessionStatus,SIDEARM,getPersonalWeapon,isFoggedSite,createSiteVisibility,visibleSiteHostiles,visibleSiteCombatEvent,rescueOccupants,getPerspectiveAction,
    $:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},document:{body,createElement:()=>element(),querySelector:()=>null},dialog,
    localStorage:{getItem:key=>storageEntries.get(key)??null,setItem:(key,value)=>storageEntries.set(key,value),removeItem:key=>storageEntries.delete(key)},
    game:normal,stored,tracked:'saved-contact',playing:false,actionPending:false,testSession:null,testReturn:null,testUnlocked:false,testConfig:{scenario:'ship-combat',enemyClassId:testEnemyChoices()[0].id},testOutcome:'',
    network:null,onlineSnapshot:null,connectionState:'offline',surface:null,surfaceKey:'',surfaceTarget:null,personVisualOffset:{x:0,y:0},personPredictedAt:null,personVisualAt:null,
    stepAccumulator:0,saveTimer:0,localShotAt:-Infinity,elapsed:0,combatFeed:[],controls:{clear(){}},combatPresentation:{reset(){}},worldPresentation:{reset(){}},renderer:{lastSystem:'hearth'},
    tutorial,settings:{guidance:'simple',leftHanded:false,shipZoom:.65,personZoom:1.15,immersiveHud:true,translucentHud:true,compactTips:true},touchLayout:false,guideIntent:null,combatPreview:null,coachPrompt:null,ambientCue:null,performance:{now:()=>0},hideCoach(){},
    localCameraPreferences:{shipZoom:.65,personZoom:1.15},cameraScope:'local',cameraKey:null,cameraSaveTimer:null,normalizeCameraPreferences,normalizeModeZoom,zoomLimits,labelLayoutDirty:false,hudDirty:false,
    setTimeout:schedule,clearTimeout:cancel,applySettings(settings,{cameraPreferences=settings}={}){preferenceWrites.push(normalizeCameraPreferences(cameraPreferences));},queueResize(){},updatePerformanceHUD(){},
    audio:{unlock(){},musicEvent(){},play(name){effects.push(name);}},canvas:{focus(){}},clearPointerAim(){},setViewPanel(){},resize(){},updateHUD(){},updateConnectionHUD(){},shipPreview(){},
    hudText:(target,text)=>{target.textContent=text;},esc:value=>String(value??''),fmt:value=>String(value),toast:(...args)=>toasts.push(args),
    saveGame:game=>{writes.push(game.serialize());return true;},readPassport:()=>null,readPassports:()=>({}),openEncounter:encounter=>effects.push(encounter),processCombatEvent:()=>false,
    openCombatHelp:()=>effects.push('combat-help'),openLocalMapContent:()=>effects.push('local-chart'),
    FarwakeNetwork:class {constructor(){throw new Error('Test mode must not construct a network transport.');}},
  });
  vm.runInContext(appCode,context);
  const cameraProfile=new CameraProfile({onChange:(...args)=>context.applyCameraState(...args),schedule,cancel});context.cameraProfile=cameraProfile;
  context.activateLocalCamera(context.localCameraPreferences);preferenceWrites.length=0;
  return {context,normal,stored,elements,writes,guidanceWrites,preferenceWrites,cameraProfile,timers,tutorial,toasts,opened,effects,dialog,call:(name,...args)=>context[name](...args),runTimers(){const ready=[...timers];for(const[id,task]of ready)if(timers.delete(id))task.callback();}};
}
function enter(fixture,scenario='boarding') {
  const session=createTestSession({scenario,seed:'app-isolation'});fixture.call('enterTestSession',session);return session;
}
function secure(game) {
  for(const enemy of game.state.boarding.enemies)enemy.health=0;
  game._finishBoarding('won');
}

test('the actual menu gate accepts the requested password and shows only the permitted practice opponents',()=>{
  const f=fixture();f.call('openTestGate');
  f.elements.get('testPassword').value='0123';f.elements.get('testGateForm').onsubmit({preventDefault(){}});
  assert.equal(f.context.testUnlocked,false);assert.equal(f.dialog.kind,'test-gate');
  f.elements.get('testPassword').value='123';f.elements.get('testGateForm').onsubmit({preventDefault(){}});
  assert.equal(f.context.testUnlocked,true);assert.equal(f.dialog.kind,'test-menu');
  assert.deepEqual(f.elements.get('testEnemy').children.map(option=>option.value),testEnemyChoices().map(hull=>hull.id));
  assert.equal(f.elements.get('testScenarios').children.length,TEST_SCENARIOS.length);assert.equal(f.writes.length,0);
});

test('enter, retry, change exercise, and exit preserve the exact normal voyage and never write a practice save',()=>{
  const f=fixture(),before=JSON.stringify(f.normal.state);f.dialog.open('Test','test-menu');
  const first=enter(f),returnState=f.context.testReturn;
  assert.equal(f.context.game,first.game);assert.equal(f.context.playing,true);assert.equal(returnState.game,f.normal);assert.equal(returnState.stored,f.stored);
  first.game.state.credits=999999;first.game.state.flags.push('test-only');first.game.system.enemies[0].hp=1;
  assert.equal(f.call('saveNow'),true);assert.equal(f.elements.get('saveState').textContent,'TEST · UNSAVED');
  f.call('retryTest');assert.notEqual(f.context.game,first.game);assert.equal(f.context.testReturn,returnState);assert.equal(f.context.game.state.credits,0);
  const changed=createTestSession({scenario:'person-combat',enemyClassId:testEnemyChoices().at(-1).id,seed:'changed'});f.call('enterTestSession',changed);
  assert.equal(f.context.testReturn,returnState);assert.equal(f.context.game,changed.game);
  f.call('exitTestMode');assert.equal(f.context.game,f.normal);assert.equal(f.context.stored,f.stored);assert.equal(f.context.tracked,'saved-contact');
  assert.equal(f.context.testSession,null);assert.equal(f.context.playing,false);assert.equal(JSON.stringify(f.normal.state),before);assert.equal(f.writes.length,0);
  assert.equal(f.elements.get('testBar').hidden,true);assert.equal(f.elements.get('welcome').hidden,false);
});

test('an active shared connection cannot be replaced by a test exercise',()=>{
  const f=fixture(),network={connected:true,command(){throw new Error('Unexpected network mutation.');}};f.context.network=network;
  const session=createTestSession();f.call('enterTestSession',session);
  assert.equal(f.context.game,f.normal);assert.equal(f.context.network,network);assert.equal(f.context.testSession,null);assert.equal(f.context.testReturn,null);
  assert.equal(f.context.playing,false);assert.match(f.toasts.at(-1)[0],/Sign off/);assert.equal(f.writes.length,0);
});

test('practice camera edits survive exercise retries but restore both saved cameras on exit',()=>{
  const f=fixture(),saved=f.cameraProfile.preferences,before=JSON.stringify(f.normal.state);
  enter(f,'ship-combat');
  assert.equal(f.cameraProfile.status,'practice');assert.deepEqual(f.context.testReturn.cameraPreferences,saved);
  f.call('setModeZoom','ship',.25);f.call('setModeZoom','person',1.6);f.runTimers();
  assert.deepEqual(f.cameraProfile.preferences,{shipZoom:.25,personZoom:1.6});
  assert.equal(f.writes.length,0);assert.equal('cameraPreferences' in f.context.game.state,false);
  assert.ok(f.preferenceWrites.every(value=>value.shipZoom===saved.shipZoom&&value.personZoom===saved.personZoom),'Practice settings writes retain the saved solo camera values.');
  f.call('retryTest');assert.deepEqual(f.cameraProfile.preferences,{shipZoom:.25,personZoom:1.6});
  f.call('enterTestSession',createTestSession({scenario:'person-combat',seed:'camera-practice-switch'}));
  assert.deepEqual(f.cameraProfile.preferences,{shipZoom:.25,personZoom:1.6});
  f.call('exitTestMode');f.runTimers();
  assert.equal(f.cameraProfile.status,'local');assert.deepEqual(f.cameraProfile.preferences,saved);
  assert.deepEqual(normalizeCameraPreferences(f.context.settings),saved);assert.deepEqual(normalizeCameraPreferences(f.context.localCameraPreferences),saved);
  assert.equal(f.context.game,f.normal);assert.equal(JSON.stringify(f.normal.state),before);assert.equal(f.writes.length,0);assert.equal(f.timers.size,0);
});

test('normal progression, importing, connection menus, and stale start callbacks stay behind test mode',async()=>{
  const f=fixture();enter(f);const practice=f.context.game,returnState=f.context.testReturn;let redirected=0;
  f.context.openTestControls=()=>{redirected++;};
  for(const name of ['openOutfitter','openShip','openCrew','openJournal','openSavePanel','openOnline','openConnect','openHome'])f.call(name);
  await f.call('connectGalaxy',{create:true});f.call('start',true);f.call('start',false);
  assert.equal(redirected,11);assert.equal(f.context.game,practice);assert.equal(f.context.testReturn,returnState);assert.equal(f.context.network,null);
  f.call('openMap');assert.equal(f.dialog.kind,'test-map');assert.ok(f.effects.includes('local-chart'));
  f.call('openHelp');assert.ok(f.effects.includes('combat-help'));assert.equal(f.writes.length,0);
});

test('the invocation boundary rejects story, upgrades, passports, and a stale transport while allowing actual boarding rules',async()=>{
  const f=fixture(),session=enter(f);
  for(const [name,args]of [['travel',{id:'earth'}],['buyShip',{id:'capital'}],['buyUpgrade',{id:'fold_3'}],['triggerEncounter',{id:'earth_council'}],['applyChoice',{encounterId:'earth_council',choice:0}],['recruitCrew',{role:'gunner'}],['setHome',{kind:'room'}],['setCrewAccess',{allowed:true}],['crewAction',{action:'scan'}]]){
    const result=await f.call('invoke',name,args);assert.equal(result.code,'test-mode',name);assert.equal(result.ok,false,name);
  }
  const result=await f.call('invoke','boardEnemy',{id:session.targetId});assert.equal(result.ok,true);assert.equal(f.context.game.state.boarding.kind,'assault');
  let networkCommands=0;f.context.network={command(){networkCommands++;return {ok:true};}};
  assert.equal((await f.call('invoke','attackBoarder')).code,'test-mode');assert.equal(networkCommands,0);assert.equal(f.writes.length,0);
});

test('test event handling suppresses authored story notifications while retaining ordinary combat feedback',()=>{
  const f=fixture();enter(f);f.context.game.events.push({type:'chapter',chapter:{title:'Hidden chapter'}},{type:'encounter',encounter:{title:'Hidden story'}},{type:'job-complete',text:'Hidden contract'},{type:'hit'});
  f.call('processEvents');assert.deepEqual(f.effects,['hit']);assert.equal(f.toasts.filter(([text])=>/Hidden/.test(text)).length,0);assert.equal(f.context.game.events.length,0);
});

test('the target helm is a command-transfer action, stays locked during combat, and never invokes the return airlock',async()=>{
  const f=fixture(),session=enter(f,'person-combat'),game=session.game,originId=game.state.ship.id;
  const helm=f.context.surface.entities.find(entity=>entity.data?.stationRole==='helm');assert.ok(helm);
  await f.call('handleEntity',helm);let choice=f.dialog.items.find(item=>item.label==='Take this ship’s helm');assert.ok(choice);assert.equal(choice.disabled,true);
  assert.equal(game.state.ship.id,originId);assert.equal(game.state.mode,'person');
  secure(game);Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).stations.helm);f.call('openStation',helm);
  choice=f.dialog.items.find(item=>item.label==='Take this ship’s helm');assert.equal(choice.disabled,false);await choice.action();
  assert.equal(game.state.ship.id,session.targetId);assert.equal(game.state.mode,'ship');assert.equal(game.system.parkedShips[0].id,originId);
  assert.equal(f.writes.length,0);
});

test('the entry airlock routes an active assault back to the actual source hull',async()=>{
  const f=fixture(),session=enter(f,'person-combat'),game=session.game,origin=game.state.ship,targetHull=game.system.enemies.find(enemy=>enemy.id===session.targetId).hp;
  const airlock=f.context.surface.entities.find(entity=>entity.type==='exit'&&!entity.data?.stationRole);assert.ok(airlock,'A separate entry-airlock action must exist on the target deck.');
  Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).spawn);
  await f.call('handleEntity',airlock);
  assert.equal(game.state.ship,origin);assert.equal(game.state.mode,'ship');assert.equal(game.state.boarding,null);
  assert.equal(game.system.enemies.find(enemy=>enemy.id===session.targetId).hp,targetHull);assert.equal(f.writes.length,0);
});

test('test mode permits real engineering and medical actions aboard the player ship',async()=>{
  const f=fixture(),session=enter(f,'ship-combat'),game=session.game;game.system.enemies=[];
  assert.equal((await f.call('invoke','enterCabin')).ok,true);f.call('ensureSurface');
  Object.assign(game.state.ship,{hull:50,energy:100});game.state.person.health=40;
  const engineering=f.context.surface.entities.find(entity=>entity.data?.stationRole==='engineering');f.call('openStation',engineering);
  await f.dialog.items.find(item=>item.label==='Repair the hull').action();assert.equal(game.state.ship.hull,58);assert.equal(game.state.ship.energy,82);
  const medical=f.context.surface.entities.find(entity=>entity.data?.stationRole==='medical');f.call('openStation',medical);
  await f.dialog.items.find(item=>item.label==='Treat injuries').action();assert.equal(game.state.person.health,52);assert.equal(game.state.ship.energy,67);assert.equal(f.writes.length,0);
});

test('damage-control practice hides the opponent selector and uses the real marked compartment and supplies',async()=>{
  const f=fixture();f.context.testUnlocked=true;f.context.testConfig.scenario='damage-control';f.call('openTestMenu');
  assert.equal(f.elements.get('testTarget').hidden,true);assert.equal(f.elements.get('testEnemy').disabled,true);
  assert.equal(f.elements.get('testLayout').classList.contains('solo-exercise'),true);
  const session=enter(f,'damage-control'),game=session.game;
  for(let i=0;i<240;i++)game.step(1/60,{});
  const section=game.state.ship.damageControl.sections.find(s=>s.fire>0&&s.breach>0);assert.ok(section);
  Object.assign(game.state.person,{x:section.x,y:section.y});f.call('ensureSurface');
  assert.ok(f.context.surface.entities.some(e=>e.type==='damageControl'&&e.data.sectionId===section.id));
  const fire=section.fire;f.call('openDamageSection',section.id);
  assert.match(f.dialog.htmlText,/100 reactor charge · 6 ore/);
  const suppress=f.dialog.items.find(i=>i.label==='Suppress fire');assert.equal(suppress.disabled,false);assert.match(suppress.detail,/Cost 2 charge/);
  await suppress.action();assert.equal(section.fire,Math.max(0,fire-35));assert.equal(game.state.ship.energy,98);assert.equal(game.state.cargo.ore,6);
  assert.equal(f.dialog.opened,false);assert.equal(f.writes.length,0);
  f.call('openDamageSection',section.id);const remaining=section.fire;await f.dialog.items.find(i=>i.label==='Suppress fire').action();
  assert.equal(f.dialog.opened,false,'A recharge rejection returns to the deck so the paused tool can recover.');
  assert.equal(section.fire,remaining);assert.equal(game.state.ship.energy,98);assert.equal(f.writes.length,0);
});

test('damage panels show the boarded physical hull instead of the source ship',()=>{
  const f=fixture(),session=enter(f,'person-combat'),game=session.game;
  const target=game.currentDamageHull(),source=game.state.ship;target.energy=17;source.energy=99;
  target.damageControl.sections[0].damage=12;source.damageControl.sections[0].fire=30;
  f.call('openDamageOverview');assert.match(f.dialog.htmlText,/17 reactor charge/);assert.doesNotMatch(f.dialog.htmlText,/99 reactor charge/);
  assert.ok(f.opened.at(-1).title.includes(target.name));assert.equal(f.dialog.items.filter(i=>i.label===target.damageControl.sections[0].name).length,1);
  assert.equal(source.damageControl.sections[0].fire,30);assert.equal(f.writes.length,0);
});
