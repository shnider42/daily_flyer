import {powerProfile,POWER_LABELS} from '../dist/ship-power.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game} from '../dist/engine.mjs';
import {FACTIONS} from '../dist/content.mjs';
import {getShipClass} from '../dist/fleet.mjs';
import {publicStartingPort} from '../dist/livelihoods.mjs';
import {systemIdentity} from '../dist/world-identity.mjs';
import {earthCampaignPresentation} from '../dist/earth-campaign-ui.mjs';
import {situationView} from '../dist/situation-guidance.mjs';
import {fittedFoldDrive} from '../dist/start-options.mjs';
import {NEW_GALAXY_REQUIRED} from '../dist/galaxy-epoch.mjs';

// Run the real HUD and connection handlers with Game state; only browser and
// transport boundaries are replaced. The assertions observe displayed advice
// and selected world targets, including a switch between two shared captains.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{
 const index=declarations.findIndex(match=>match[1]===name);assert.ok(index>=0,name);
 return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);
};
const code=['updateSituationHUD','updateHUD','connectGalaxy'].map(declaration).join('\n');
const noop=()=>{};
function classes(){
 const values=new Set();return{add:(...names)=>names.forEach(name=>values.add(name)),remove:(...names)=>names.forEach(name=>values.delete(name)),contains:name=>values.has(name),toggle(name,force){const enabled=force??!values.has(name);enabled?values.add(name):values.delete(name);return enabled;}};
}
function node(){
 const children=new Map();return{textContent:'',innerHTML:'',hidden:false,style:{},dataset:{},classList:classes(),setAttribute:noop,focus:noop,
  children:Array.from({length:7},()=>({textContent:'',innerHTML:'',hidden:false})),
  querySelector(selector){if(!children.has(selector))children.set(selector,node());return children.get(selector);}};
}
function fixture(game){
 const elements=new Map(),toasts=[],markers=[];let context,arrival=game;
 const element=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
 const dialog={kind:null,opened:false,open(_title,kind){this.kind=kind;this.opened=true;},close(){this.opened=false;},html:noop,choices:noop};
 class Transport{
  constructor(options){this.options=options;this.connected=false;this.passport={realmCode:'ABC12345',captainId:'incoming'};}
  async connect(){this.connected=true;const packet={state:arrival.state};this.options.onSnapshot(packet);return packet;}
  disconnect(){this.connected=false;}setInput(){}
 }
 context=vm.createContext({powerProfile,POWER_LABELS,Game,FACTIONS,getShipClass,publicStartingPort,systemIdentity,earthCampaignPresentation,situationView,fittedFoldDrive,NEW_GALAXY_REQUIRED,narrativeUI:{refreshCampaign:noop},warzoneUI:{refresh:noop},game,network:null,onlineSnapshot:null,stored:null,playing:true,testSession:null,connectionState:'offline',
  tracked:'kettle',trackedThreadId:'previous-story',narrativeWaypoint:{id:'old-waypoint'},narrativeMarkerKey:'old-story',openingMarkerKey:'old-opening',dutyMarkerKey:'old-duty',militaryMarkerKey:'old-military',guideIntent:'scan',foldDriveTarget:{kind:'beacon'},
  surface:null,surfaceKey:'',surfaceTarget:null,combatPreview:null,personVisualOffset:{x:0,y:0},personPredictedAt:null,personVisualAt:null,
  touchLayout:false,settings:{guidance:'simple',showPerformance:false},hudDirty:true,labelLayoutDirty:false,cameraSaveTimer:null,cameraScope:'local',cameraKey:null,localCameraPreferences:{},militaryValue:null,narrativeValue:null,
  $:element,document:{body:{classList:classes()}},dialog,canvas:{focus:noop},audio:{unlock:noop},worldPresentation:{reset:noop},
  hudText(target,value){const changed=target.textContent!==value;target.textContent=value;return changed;},hudHTML(target,value){target.innerHTML=value;},hudStyle(target,key,value){const changed=target.style[key]!==value;target.style[key]=value;return changed;},fmt:String,esc:String,
  localSiteVisibility:()=>null,getGunneryView:()=>({active:false}),activeMilitaryCareer:()=>context.militaryValue,narrativeNavigation:()=>context.narrativeValue,
  markMilitaryTarget:target=>markers.push(target),markNarrativeTarget:target=>markers.push(target),markOpeningTarget:target=>markers.push(target),markLivelihoodTarget:target=>markers.push(target),
  syncFoldDriveTarget:noop,updateRecoveryHUD:noop,updatePerspectiveControl:noop,personalAimAvailable:()=>false,pointerAimAvailable:()=>false,armedOnFoot:()=>false,
  testSessionStatus:()=>null,currentDisembarkAction:()=>null,nearby:()=>null,contextLabel:()=>'',updateContacts:noop,updateCombatHUD:noop,updateMobileHUD:noop,updateGuidance:noop,
  SERVER_URL:'https://example.test',FarwakeNetwork:Transport,cameraProfile:{activateLocal:noop,flush:async()=>true},clearTimeout:noop,saveNow:noop,ensureSurface:noop,activateLocalCamera:noop,reportCameraSaveFailure:noop,updateConnectionHUD:noop,syncViewControls:noop,
  receiveSnapshot(packet){context.game=arrival;context.onlineSnapshot=packet;},toast:(...args)=>toasts.push(args),groupStartUI:{open:noop},openEncounter:noop
 });
 vm.runInContext(code,context);
 return{context,element,markers,toasts,arriveAs(next){arrival=next;},hint:()=>element('objectiveText').textContent};
}
function shared(game,captainId){
 game.state.multiplayer={serverAuthoritative:true,captainId,ownedVesselId:game.state.ship.id,aboardVesselId:game.state.ship.id};return game;
}

test('remote Casual onboarding names its local port and usable fold drive on the actual HUD',()=>{
 for(const startSystemId of ['sol','lacuna','alpha-centauri']){
  const game=new Game('app-casual-hud',{startMode:'casual',startSystemId}),f=fixture(game),before=JSON.stringify(game.state);
  f.context.updateHUD();
  assert.ok(f.hint().includes(publicStartingPort(game.system).name));assert.match(f.hint(),/fold drive is ready.*Galaxy chart/);
  assert.doesNotMatch(f.hint(),/Kettle|Iona/);assert.equal(JSON.stringify(game.state),before);
  for(const id of ['fold_1','fold_2','fold_3'])delete game.state.upgrades[id];game._updateStats(false);f.context.updateHUD();
  assert.doesNotMatch(f.hint(),/fold drive is ready/);assert.ok(f.hint().includes(publicStartingPort(game.system).name));
 }
});

test('local onboarding and real tracked duties retain their own guidance priority',()=>{
 const regular=new Game('app-original-hud'),local=fixture(regular);local.context.updateHUD();
 assert.equal(local.hint(),'Dock at Kettle Station. Meet Iona, then find the contract exchange.');
 const game=new Game('app-casual-duty',{startMode:'casual',startSystemId:'vesper'}),f=fixture(game);
 f.context.narrativeValue={title:'Local rescue',objective:'Bring the survivors to Listening House.',target:{systemId:'vesper',bodyId:'listening'},stageId:'rescue'};
 f.context.updateHUD();assert.equal(f.hint(),f.context.narrativeValue.objective);assert.equal(f.element('objectiveTitle').textContent,'Local rescue');
 f.context.militaryValue={title:'Convoy watch',objective:'Stay with the escort and await your orders.',branchName:'Navy',branchId:'navy',target:{systemId:'vesper',bodyId:'lantern-guard'}};
 f.context.updateHUD();assert.equal(f.hint(),f.context.militaryValue.objective);assert.equal(f.element('objectiveTitle').textContent,'Convoy watch');
 assert.equal(f.markers.at(-1).bodyId,'lantern-guard');
});

test('a new remote shared captain receives a real local marker instead of the previous captain’s route',async()=>{
 const previous=shared(new Game('same-chart'),'older-captain'),incoming=shared(new Game('same-chart',{startMode:'casual',startSystemId:'brindle'}),'new-captain');
 const f=fixture(previous);f.arriveAs(incoming);const before=JSON.stringify(incoming.state);
 await f.context.connectGalaxy({startMode:'casual',startSystemId:'brindle',realmCode:'ABC12345'});
 assert.equal(f.context.dialog.kind,'connecting');assert.equal(f.context.dialog.opened,false);
 assert.equal(f.context.game,incoming);assert.equal(f.context.tracked,'weighhouse');
 assert.ok(incoming.system.bodies.some(body=>body.id===f.context.tracked));
 assert.equal(f.context.trackedThreadId,null);assert.equal(f.context.narrativeWaypoint,null);assert.equal(f.context.guideIntent,null);assert.equal(f.context.foldDriveTarget,null);
 assert.match(f.hint(),/Weighhouse/);assert.equal(JSON.stringify(incoming.state),before);
});

test('resuming the same shared captain preserves an intentional navigation marker',async()=>{
 const game=shared(new Game('app-casual-resume',{startMode:'casual',startSystemId:'vesper'}),'same-captain'),f=fixture(game);
 f.context.tracked='lilt';f.context.trackedThreadId='local-story';f.context.narrativeWaypoint={id:'intentional-waypoint'};f.context.guideIntent='dock';
 f.arriveAs(Game.fromSave(game.save()));
 await f.context.connectGalaxy({passport:{realmCode:'ABC12345',captainId:'same-captain',token:'saved-token'}});
 assert.equal(f.context.dialog.opened,false);assert.equal(f.context.tracked,'lilt');assert.equal(f.context.trackedThreadId,'local-story');
 assert.equal(f.context.narrativeWaypoint.id,'intentional-waypoint');assert.equal(f.context.guideIntent,'dock');
});

test('shared Casual arrival names the drive supplied for a distant origin',async()=>{
 const incoming=shared(new Game('app-distant-drive',{startMode:'casual',startSystemId:'lacuna'}),'new-distant-captain');
 const f=fixture(new Game('app-distant-drive'));f.arriveAs(incoming);
 await f.context.connectGalaxy({startMode:'casual',startSystemId:'lacuna',realmCode:'ABC12345'});
 assert.ok(f.toasts.some(([text])=>text.includes('Farwake field coil is ready (15 ly range)')));
});

test('the real Solo setup boundary carries a crew-capable hull into the new voyage',()=>{
 let setup,started;
 const context=vm.createContext({testSession:null,dialog:{close(){}},newVoyageSeed:()=> 'solo-ui-boundary',
  buildGalaxy:()=>[],startSystemChoices:()=>[],openCaptainSetup:(_dialog,options)=>{setup=options;},
  start:(fresh,options)=>{assert.equal(fresh,true);started=new Game(options.galaxySeed,options);},
  openTestControls:()=>assert.fail('ordinary Solo setup entered the test range')});
 vm.runInContext(declaration('openNewCaptain'),context);context.openNewCaptain();
 assert.equal(setup.startContext,'solo');
 const result=setup.onComplete({startMode:'casual',casualCrewCount:8,starterShip:'osprey',startContext:'shared'});
 assert.equal(result.ok,true);assert.equal(started.state.ship.classId,'osprey');
 assert.equal(started.casualCrewStatus().activeCount,8);assert.equal(started.casualCrewStatus().reserveCount,0);
});

test('the actual local command dispatcher applies an explicit old-Solo crew ship choice',async()=>{
 const game=new Game('old-solo-command',{startMode:'casual',casualCrewCount:8});
 assert.equal(game.state.ship.classId,'sparrow');assert.equal(game.dock('kettle').ok,true);
 const context=vm.createContext({game,network:null,testSession:null});
 vm.runInContext(declaration('performInvoke'),context);
 const before=game.state.credits,result=await context.performInvoke('fitCasualCrewShip',{id:'osprey'});
 assert.equal(result.ok,true);assert.equal(result.cost,0);assert.equal(game.state.credits,before);
 assert.equal(game.state.ship.classId,'osprey');assert.equal(game.casualCrewStatus().activeCount,8);
 assert.equal((await context.performInvoke('fitCasualCrewShip',{id:'atlas'})).ok,false);
});
