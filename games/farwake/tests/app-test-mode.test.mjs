import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game, distance} from '../dist/engine.mjs';
import {getShipClass, cabinLayout} from '../dist/fleet.mjs';
import {generateSurface, isWalkable, nearestEntity} from '../dist/surface.mjs';
import {TEST_SCENARIOS, testEnemyChoices, unlockTestMode, createTestSession, resetTestSession, testSessionStatus} from '../dist/test-lab.mjs';
import {TutorialRuntime} from '../dist/tutorial-runtime.mjs';
import {SIDEARM} from '../dist/combat.mjs';

// Exercise the real app handlers with a small DOM boundary, without opening a
// browser, invoking the render loop, or replacing the actual Game rules.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{
  const index=declarations.findIndex(match=>match[1]===name);
  assert.ok(index>=0,`The application declares ${name}.`);
  return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);
};
const names=['openTestGate','openTestMenu','enterTestSession','retryTest','exitTestMode','openTestControls','start','saveNow','invoke','performInvoke','runDeckAction','result','processEvents','ensureSurface','updateSurfaceFlags','nearby','interact','leaveSurface','handleEntity','openStation','openMap','openOutfitter','openShip','openCrew','openJournal','openSavePanel','openOnline','openConnect','connectGalaxy','openHome','openHelp','selectGuide','guidanceContext','recordGuide','recordGuideEvent','contextLabel','workFinished','currentWorkToken','personCombat'];
const appCode=names.map(declaration).join('\n');

function classes() {
  const values=new Set();
  return {add:(...names)=>names.forEach(name=>values.add(name)),remove:(...names)=>names.forEach(name=>values.delete(name)),contains:name=>values.has(name),toggle(name,force){const add=force??!values.has(name);if(add)values.add(name);else values.delete(name);return add;}};
}
function element() {
  return {hidden:false,value:'',textContent:'',children:[],attributes:{},classList:classes(),append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},setAttribute(key,value){this.attributes[key]=value;},addEventListener(){},insertAdjacentHTML(){},focus(){},select(){}};
}
function fixture() {
  const elements=new Map(),writes=[],guidanceWrites=[],toasts=[],opened=[],effects=[];
  const tutorial=new TutorialRuntime({nonce:'app-test-mode',storage:{getItem:()=>null,setItem:(...args)=>guidanceWrites.push(args)}});
  const normal=new Game('normal-voyage-to-preserve');normal.state.credits=623;normal.state.flags.push('a-earned-milestone');
  const stored=normal.save(),body={classList:classes()},dialog={opened:false,kind:null,items:[],htmlText:'',body:element(),
    open(title,kind){this.opened=true;this.kind=kind;this.items=[];opened.push({title,kind});},html(value){this.htmlText=value;},choices(items){this.items.push(...items);},
    close(){if(!this.opened)return;this.opened=false;context.saveNow();}};
  const context=vm.createContext({Game,distance,getShipClass,generateSurface,isWalkable,nearestEntity,TEST_SCENARIOS,testEnemyChoices,unlockTestMode,createTestSession,resetTestSession,testSessionStatus,SIDEARM,
    $:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},document:{body,createElement:()=>element()},dialog,
    game:normal,stored,tracked:'saved-contact',playing:false,testSession:null,testReturn:null,testUnlocked:false,testConfig:{scenario:'ship-combat',enemyClassId:testEnemyChoices()[0].id},testOutcome:'',
    network:null,onlineSnapshot:null,connectionState:'offline',surface:null,surfaceKey:'',surfaceTarget:null,personVisualOffset:{x:0,y:0},personPredictedAt:null,personVisualAt:null,
    stepAccumulator:0,saveTimer:0,localShotAt:-Infinity,elapsed:0,combatFeed:[],controls:{clear(){}},combatPresentation:{reset(){}},worldPresentation:{reset(){}},renderer:{lastSystem:'hearth'},
    tutorial,settings:{guidance:'simple',leftHanded:false},touchLayout:false,guideIntent:null,combatPreview:null,coachPrompt:null,hideCoach(){},
    audio:{unlock(){},play(name){effects.push(name);}},canvas:{focus(){}},clearPointerAim(){},resize(){},updateHUD(){},updateConnectionHUD(){},shipPreview(){},
    hudText:(target,text)=>{target.textContent=text;},esc:value=>String(value??''),fmt:value=>String(value),toast:(...args)=>toasts.push(args),
    saveGame:game=>{writes.push(game.serialize());return true;},readPassport:()=>null,readPassports:()=>({}),openEncounter:encounter=>effects.push(encounter),processCombatEvent:()=>false,
    openCombatHelp:()=>effects.push('combat-help'),openLocalMapContent:()=>effects.push('local-chart'),
    FarwakeNetwork:class {constructor(){throw new Error('Test mode must not construct a network transport.');}},
  });
  vm.runInContext(appCode,context);
  return {context,normal,stored,elements,writes,guidanceWrites,tutorial,toasts,opened,effects,dialog,call:(name,...args)=>context[name](...args)};
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
  const f=fixture(),session=enter(f,'person-combat'),game=session.game,origin=game.state.ship;
  const airlock=f.context.surface.entities.find(entity=>entity.type==='exit'&&!entity.data?.stationRole);assert.ok(airlock,'A separate entry-airlock action must exist on the target deck.');
  Object.assign(game.state.person,cabinLayout(game.state.boarding.shipClass).spawn);
  await f.call('handleEntity',airlock);
  assert.equal(game.state.ship,origin);assert.equal(game.state.mode,'ship');assert.equal(game.state.boarding,null);
  assert.equal(game.system.enemies.find(enemy=>enemy.id===session.targetId).hp,16);assert.equal(f.writes.length,0);
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
