import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {TutorialRuntime} from '../dist/tutorial-runtime.mjs';

// Execute the application’s real selection/presentation handlers with browser
// rendering replaced. The tutorial controller and its persistence stay real.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const functions=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{const index=functions.findIndex(match=>match[1]===name);assert.ok(index>=0,name);return source.slice(functions[index].index,functions[index+1]?.index??source.length);};
const code=['guideEpisode','hideCoach','showCoach','toggleCoachDetail','chooseGuidancePrompt','updateGuidance','requestActionHelp'].map(declaration).join('\n');
function fixture(level='simple'){
 const elements=new Map(),storage=new Map(),classes=()=>({add(){},remove(){},toggle(){}});
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:id==='coachCard',textContent:'',classList:classes(),setAttribute(){},getBoundingClientRect:()=>({width:100,height:44})});return elements.get(id);};
 const tutorial=new TutorialRuntime({nonce:'app-guidance',storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}}),settings={guidance:level,compactTips:true,textScale:1};
 const state={playing:true,mode:'person',device:'touch',systemId:'hearth',locationId:'kettle',person:{health:100},ship:{},combat:{active:false},gunnery:{active:false},nearby:null};
 const route={id:'route:next-job',title:'Choose a job',body:'Open the contract exchange. Accept a local job and follow its marked workstation.',compactBody:'Open the exchange for a local job.',flow:'route',controlTarget:'contextButton'};
 const context=vm.createContext({tutorial,settings,playing:true,touchLayout:true,viewPanelOpen:false,coachExpanded:false,coachPrompt:null,highlightedControl:null,toolTrayOpen:false,labelLayoutDirty:false,hudDirty:false,dismissedRoute:'',dismissedGuideEpisode:'',surfaceTarget:null,
  document:{body:{classList:classes()}},window:{innerHeight:850},$:element,hudText:(el,value)=>{const changed=el.textContent!==value;el.textContent=value;return changed;},setToolTray(){},nearby:()=>state.nearby,damageGuide:()=>null,
  dialog:{opened:false,close(){this.opened=false;}},selectGuide:()=>tutorial.select({seed:'app-guidance',mode:settings.guidance}),guidanceContext:()=>({...state,guidance:settings.guidance,timeSeconds:tutorial.time}),
  activeMilitaryCareer:()=>null,game:{state:{mode:'person'},militaryRecoveryStatus:()=>null,openingMissionStatus:()=>null,npcContractStatus:()=>null},navyOrderPrompt:()=>null,militaryCareerPrompt:()=>null,openingPrompt:()=>route,currentPerspectiveAction:()=>({}),routePrompt:()=>route,openHelp(){this.helpOpened=true;}
 });
 vm.runInContext(code,context);context.selectGuide();return{context,tutorial,state,settings,element,route,storage};
}

test('Expert keeps automatic coaching off but explicit contextual help stays available across HUD ticks',()=>{
 const f=fixture('expert');f.context.updateGuidance();assert.equal(f.element('coachCard').hidden,true);
 f.context.requestActionHelp();assert.equal(f.element('coachCard').hidden,false);assert.equal(f.context.coachPrompt.requested,true);
 assert.match(f.element('coachBody').textContent,/WALK stick/);const id=f.context.coachPrompt.id;
 f.tutorial.time+=15;f.context.updateGuidance();assert.equal(f.context.coachPrompt.id,id);assert.equal(f.element('coachBody').hidden,false);
 f.tutorial.controller.dismiss(id);f.context.updateGuidance();assert.equal(f.element('coachCard').hidden,true);
 assert.equal(f.tutorial.controller.count('person-move'),0,'Reading or dismissing help is not movement practice.');
});

test('expanding a Moderate hint reveals its full instructions and stops the automatic reading timeout',()=>{
 const f=fixture('moderate');f.state.shared={id:'crew:lin',friendName:'Lin',friendCount:1,samePort:true,aboardTogether:false};
 f.context.updateGuidance();assert.equal(f.element('coachCard').hidden,false);const full=f.context.coachPrompt.fullBody;
 assert.ok(full.length>f.context.coachPrompt.body.length);
 f.context.toggleCoachDetail();assert.equal(f.context.coachPrompt.requested,true);assert.equal(f.element('coachBody').textContent,full);
 f.tutorial.time+=20;f.context.updateGuidance();assert.equal(f.element('coachCard').hidden,false);assert.equal(f.element('coachBody').textContent,full);
 assert.equal(f.tutorial.controller.count('crew-hub'),0);
});

test('only the selected Moderate route consumes exposure and it does not repeat after fading',()=>{
 const f=fixture('moderate');f.context.game.openingMissionStatus=()=>({active:true});
 f.context.updateGuidance();assert.equal(f.context.coachPrompt.id,f.route.id);
 assert.equal(f.tutorial.controller.exportState().exposures.length,1);
 f.tutorial.time+=10;f.context.updateGuidance();assert.equal(f.element('coachCard').hidden,true);
 f.state.locationId='morrow';f.context.updateGuidance();assert.equal(f.element('coachCard').hidden,true,'Returning to the same learned topic does not restart the hint.');
 assert.equal(f.tutorial.controller.exportState().exposures.length,1);
});

test('visible combat and gun stations take priority over a peaceful opening mission',()=>{
 const f=fixture();f.context.game.openingMissionStatus=()=>({active:true});
 f.state.combat={active:true,targetVisible:true};f.context.updateGuidance();assert.equal(f.context.coachPrompt.flow,'combat');
 f.state.combat={active:false};f.state.gunnery={active:true,batteryId:'fore',batteryName:'Fore',canFire:true,batteries:[{id:'fore',name:'Fore'},{id:'port',name:'Port'}]};
 f.context.updateGuidance();assert.equal(f.context.coachPrompt.flow,'gunnery');
 assert.equal(f.tutorial.controller.count('person-move'),0);
});

test('recovery instructions stay personal and full-depth when requested in Expert',()=>{
 const f=fixture('expert');f.context.game.militaryRecoveryStatus=()=>({arrived:false,status:'awaiting-passage',passage:false});
 f.context.requestActionHelp();assert.equal(f.context.coachPrompt.successAction,'service-return');assert.equal(f.context.coachPrompt.requested,true);
 assert.equal(f.tutorial.controller.count('service-return'),0);
});

test('a Navy crewmate asking for help gets the active order rather than a generic shared-ship lesson',()=>{
 const f=fixture('expert');f.state.shared={id:'carrier',friendName:'Lin',friendCount:1,sameShip:true,aboardTogether:true};
 f.context.activeMilitaryCareer=()=>({branchId:'navy',status:'active'});
 f.context.navyOrderPrompt=()=>({id:'navy:medical',title:'Prepare medical',body:'Reach medical and follow the current casualty-readiness order.',compactBody:'Reach medical for your current order.',flow:'route',controlTarget:'modePill'});
 f.context.requestActionHelp();assert.equal(f.context.coachPrompt.title,'Prepare medical');assert.equal(f.context.coachPrompt.requested,true);
});
