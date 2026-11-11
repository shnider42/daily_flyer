import { Game, distance, seededRandom } from './engine.mjs';
import { FACTIONS, NAMED_SYSTEMS, ENCOUNTERS, DIALOGUE, STORY_CHAPTERS, UPGRADES, LORE } from './content.mjs';
import { generateSurface, movePerson, nearestEntity, drawSurface, drawSurfaceMap, drawContactPortrait, isWalkable } from './surface.mjs';
import { updateNpcLife, npcClock } from './npc-life.mjs';
import { navIcon } from './ui-icons.mjs';
import { createAmbientMemory, sampleAmbientConversation } from './ambient-social.mjs';
import { createNarrativeUI } from './narrative-ui.mjs';
import { createLivelihoodUI } from './livelihood-ui.mjs';
import { createSharedCrewUI } from './shared-crew-ui.mjs';
import { createOpeningUI, openingPrompt } from './opening-ui.mjs';
import { SpaceRenderer, drawShip } from './space-art.mjs';
import { Controls } from './input.mjs';
import { pixelViewport, clientToCanvas, beginPixelFrame } from './render-viewport.mjs';
import { surfaceCanvasToWorld, surfaceWorldToCanvas } from './camera-view.mjs';
import { normalizeCameraPreferences, normalizeModeZoom, zoomLimits } from './camera-preferences.mjs';
import { CameraProfile } from './camera-profile.mjs';
import { TutorialRuntime } from './tutorial-runtime.mjs';
import { SHIP_CLASSES, STARTER_SHIP_IDS, CREW_ROLES, getShipClass } from './fleet.mjs';
import { openCaptainSetup } from './captain-setup.mjs';
import { FarwakeNetwork, readPassport, readPassports, savePassport } from './network.mjs';
import { SERVER_URL } from './network-config.mjs';
import { openPrivacyData } from './privacy-ui.mjs';
import { Soundscape } from './audio.mjs';
import { FrameMonitor } from './performance.mjs';
import { WorldPresentation } from './world-presentation.mjs';
import { SIDEARM, sidearmAim } from './combat.mjs';
import { CombatPresentation } from './combat-presentation.mjs';
import { rescueOccupants } from './rescue-rules.mjs';
import { getPerspectiveAction, getBoardingAction } from './perspective-controls.mjs';
import { DAMAGE_CONTROL_ACTIONS, interiorDamageSummary } from './interior-damage.mjs';
import { InteriorPresentation, syncDamageMarkers, nearestDeckInteraction, damageStatus } from './interior-presentation.mjs';
import { TEST_SCENARIOS, testEnemyChoices, unlockTestMode, createTestSession, resetTestSession, testSessionStatus } from './test-lab.mjs';
import { $, escapeHtml as esc, fmt, Dialog, readSave, saveGame, readSettings, applySettings, toast, portrait, STORAGE_KEY } from './ui.mjs';

const settings=readSettings();let localCameraPreferences=normalizeCameraPreferences(settings);applySettings(settings,{cameraPreferences:localCameraPreferences});
let stored=readSave(),game;
try{game=stored?Game.fromSave(stored):new Game('farwake-'+Date.now());}catch{stored=null;game=new Game('farwake-'+Date.now());}
let playing=false,surface=null,surfaceKey='',tracked='kettle',surfaceTarget=null,elapsed=0,lastTime=0,saveTimer=0,hudTimer=0,stepAccumulator=0,transitionFlash=0,lastPrimary=0;
const canvas=$('gameCanvas'),worldCanvas=document.createElement('canvas'),worldCtx=worldCanvas.getContext('2d',{alpha:false}),presentationCtx=canvas.getContext('2d',{alpha:false}),renderer=new SpaceRenderer(),audio=new Soundscape(()=>settings.sound);
let ctx=worldCtx;
let controls,network=null,onlineSnapshot=null,connectionState='offline',actionPending=false,personVisualOffset={x:0,y:0},lastAttack=0;
const labelCanvas=$('labelCanvas'),labelCtx=labelCanvas.getContext('2d');
const PIXEL_SCALE=2;
let touchLayout=window.matchMedia('(pointer: coarse)').matches||window.innerWidth<=800,pixelView=pixelViewport(),resizeQueued=false,renderCameraKey='';
let guideStorage=null;try{guideStorage=localStorage;}catch{}
const tutorial=new TutorialRuntime({storage:guideStorage});
let highlightedControl=null,coachPrompt=null,guideIntent=null,toolTrayOpen=false,viewPanelOpen=false,coachExpanded=false;
const frameMonitor=new FrameMonitor(),worldPresentation=new WorldPresentation();
let personPredictedAt=null,personVisualAt=null;
let testSession=null,testReturn=null,testUnlocked=false,testConfig={scenario:'ship-combat',enemyClassId:testEnemyChoices()[0].id},testOutcome='';
const combatPresentation=new CombatPresentation(),combatFeed=[];
const interiorPresentation=new InteriorPresentation();
const pointerAim={active:false,x:0,y:0,fire:false};
let surfaceView={cameraX:0,cameraY:0},combatPreview=null,localShotAt=-Infinity;
let hudDirty=true,labelLayoutDirty=true;
let labelLayout={width:1,height:1,dpr:1,boxes:[]};
const labelObstacles=[...document.querySelectorAll('.location-card,.objective-card,.coach-card,.cockpit,.interaction-wrap,.contacts-panel,.combat-panel,.mobile-weapon,.mobile-readout,#modePill,#onlineButton,#pauseButton,#viewButton,#stick,#aimStick,#fireButton,#brakeButton,#toolsButton,#boostButton,#toolTray,.test-bar,#viewPanel')];
const labelWidths=new Map();
const contactRows=new Map();
let cameraScope='local',cameraKey=null,cameraSaveTimer=null;
const cameraProfile=new CameraProfile({onChange:applyCameraState});
const dialog=new Dialog({onOpen:()=>{setViewPanel(false,{restoreFocus:false});controls?.clear();clearPointerAim();hideCoach();setToolTray(false);labelLayoutDirty=true;audio.play('click');},onClose:(kind)=>{if(kind==='encounter'&&game.state.pendingEncounter){if(network)invoke('dismissEncounter').catch(()=>{});else game.dismissEncounter();}controls?.clear();clearPointerAim();labelLayoutDirty=true;hudDirty=true;saveNow();}});
const narrativeUI=createNarrativeUI({getGame:()=>game,dialog,invoke,acceptResult:result,track:trackNarrativeTarget,legacyJournal:openJournal,legacyJobs:openJobs,drawPortrait:drawContactPortrait});
const livelihoodUI=createLivelihoodUI({getGame:()=>game,dialog,invoke,acceptResult:result,refreshWorld:()=>{surface=null;surfaceKey='';surfaceTarget=null;ensureSurface(false);resize();updateHUD();},markEntity:markLivelihoodTarget,openJobs,openShipyard:openOutfitter,openProfile:openCaptainProfile,openDamage:openDamageOverview});
const sharedCrewUI=createSharedCrewUI({getGame:()=>game,getSnapshot:()=>onlineSnapshot,getNetwork:()=>network,dialog,invoke,acceptResult:result,runDeckAction,openHome,openPassport,openContact:openVesselContact,walkDeck:enterCabin,disconnect:disconnectGalaxy,openCrewDuty:()=>livelihoodUI.openDuty(),toast});
const openingUI=createOpeningUI({getGame:()=>game,dialog,invoke,acceptResult:result,track:target=>{openingMarkerKey='';markOpeningTarget(target);updateHUD();},openPassage:()=>livelihoodUI.openPassage(),openConversation:entity=>openNPC(entity,{ordinary:true}),dialogueHeader,toast});
controls=new Controls({stick:$('stick'),knob:$('knob'),aimStick:$('aimStick'),aimKnob:$('aimKnob'),getMode:()=>game.state.mode,getCombat:personCombat,getFlightState:()=>({ship:network?.predictedShip??game.state.ship,flightAssist:settings.flightAssist}),brake:$('brakeButton'),fire:$('fireButton'),mine:$('mineButton'),boost:$('boostButton'),active:()=>playing&&!dialog.opened&&!viewPanelOpen&&!actionPending,onCommand:command});
$('continueButton').hidden=!stored;
$('startButton').textContent=stored?'Start another solo voyage':'Play solo';
$('resumeGalaxy').hidden=!readPassport();
$('privacyDataButton').onclick=openPrivacy;
$('testModeButton').onclick=openTestGate;$('retryTest').onclick=retryTest;$('chooseTest').onclick=openTestMenu;$('exitTest').onclick=exitTestMode;$('combatHelp').onclick=openCombatHelp;
$('createGalaxy').onclick=async()=>openConnect('create');
$('joinGalaxy').onclick=async()=>openConnect('join');
$('resumeGalaxy').onclick=async()=>connectGalaxy({passport:readPassport()});
$('scannerButton').onclick=async()=>{const panel=$('contactsPanel');panel.hidden=!panel.hidden;labelLayoutDirty=true;hudDirty=true;$('scannerButton').setAttribute('aria-expanded',String(!panel.hidden));};
$('closeContacts').onclick=closeContacts;
$('objectiveToggle').onclick=async()=>{const collapsed=$('objectiveCard').classList.toggle('collapsed');labelLayoutDirty=true;$('objectiveToggle').textContent=collapsed?'+':'−';$('objectiveToggle').setAttribute('aria-label',collapsed?'Expand objective':'Collapse objective');};
document.body.classList.add('welcome-active');
$('startButton').onclick=async()=>{if(stored){dialog.open('Start a new voyage?','new',{eyebrow:'YOUR CAPTAIN’S LOG'});dialog.html('<p>This browser already has a voyage. Export your save from Settings if you want to keep it before starting again.</p>');dialog.choices([{label:'Keep my current voyage',action:async()=>{dialog.close();start(false);}},{label:'Start a fresh voyage',detail:'Replace the current save on this device.',warning:true,action:async()=>{dialog.close();openNewCaptain();}}]);}else openNewCaptain();};
$('continueButton').onclick=async()=>start(false);
$('pauseButton').onclick=async()=>command('pause');
$('contextButton').onclick=async()=>interact();
$('modePill').onclick=switchPerspective;
$('helpButton').onclick=openHelp;
$('objectiveDetails').onclick=async()=>game.state.npcContract?.active?livelihoodUI.openDuty():game.openingMissionStatus?.().active?openingUI.openLog():trackedThreadId==='@profession'?narrativeUI.openProfessions():trackedThreadId==='@passenger'?narrativeUI.openBoard():trackedThreadId?narrativeUI.openThread(trackedThreadId):openJournal('missions');
$('mobileReadout').onclick=()=>playing?openShip():openSettings();
$('mobileWeaponHelp').onclick=openCombatHelp;
$('toolsButton').onclick=()=>setToolTray(!toolTrayOpen);
$('viewButton').onclick=()=>setViewPanel(!viewPanelOpen);
$('closeView').onclick=()=>setViewPanel(false);
for(const mode of ['ship','person']){
 $(mode+'Zoom').addEventListener('input',e=>setModeZoom(mode,e.target.value));
 $(mode+'ZoomOut').onclick=()=>setModeZoom(mode,settings[mode+'Zoom']-.1);
 $(mode+'ZoomIn').onclick=()=>setModeZoom(mode,settings[mode+'Zoom']+.1);
}
for(const[id,key]of [['viewImmersive','immersiveHud'],['viewTranslucent','translucentHud'],['viewCompactTips','compactTips']])$(id).addEventListener('change',e=>setViewPreference(key,e.target.checked));
$('resetView').onclick=resetView;
$('viewPanel').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();setViewPanel(false);}});
$('viewButton').addEventListener('keydown',e=>e.stopPropagation());
$('coachExpand').onclick=()=>{coachExpanded=!coachExpanded;showCoach(coachPrompt);};
$('coachDismiss').onclick=()=>{if(coachPrompt?.flow==='route')dismissedRoute=coachPrompt.id;else{tutorial.controller?.dismiss();dismissedGuideEpisode=guideEpisode(guidanceContext());}hideCoach();};
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>command(b.dataset.open)));
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(viewPanelOpen){e.preventDefault();e.stopImmediatePropagation();setViewPanel(false);}},{capture:true});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||!playing||dialog.opened||viewPanelOpen||!personCombat())return;const point=clientToCanvas(e.clientX,e.clientY,pixelView,canvas.getBoundingClientRect());pointerAim.active=true;pointerAim.x=point.x;pointerAim.y=point.y;});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||!playing||dialog.opened||viewPanelOpen||!personCombat())return;const point=clientToCanvas(e.clientX,e.clientY,pixelView,canvas.getBoundingClientRect());pointerAim.active=true;pointerAim.fire=true;pointerAim.x=point.x;pointerAim.y=point.y;e.preventDefault();canvas.setPointerCapture?.(e.pointerId);canvas.focus({preventScroll:true});});
canvas.addEventListener('pointerleave',()=>{if(!pointerAim.fire)pointerAim.active=false;});
window.addEventListener('pointerup',()=>{pointerAim.fire=false;});window.addEventListener('pointercancel',clearPointerAim);window.addEventListener('blur',clearPointerAim);
canvas.addEventListener('pointerdown',e=>{if(!playing||dialog.opened)return;const point=clientToCanvas(e.clientX,e.clientY,pixelView,canvas.getBoundingClientRect()),p=renderer.toWorld(point.x,point.y);if(game.state.mode==='ship'){const b=game.system.bodies.map(b=>({b,d:Math.hypot(b.x-p.x,b.y-p.y)})).sort((a,b)=>a.d-b.d)[0];if(b&&b.d<b.b.radius+70){tracked=b.b.id;guideIntent='dock';toast(`${b.b.name} tracked. Fly toward its marker.`);updateHUD();}}});
window.addEventListener('pagehide',()=>{if(playing)saveNow();if(network?.connected)void cameraProfile.flush();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){frameMonitor.frame(performance.now(),false);clearPointerAim();}if(document.hidden&&playing){saveNow();controls.clear();if(!network&&!dialog.opened)openSettings();if(network){network.setInput({});if(network.connected)void cameraProfile.flush();}}});

function openTestGate(){
 if(testUnlocked){openTestMenu();return;}
 dialog.open('Test mode','test-gate',{eyebrow:'A SEPARATE PRACTICE RANGE'});
 dialog.html('<p>Try the combat systems in isolation. Your voyage and shared captain stay where you left them.</p><form id="testGateForm" class="test-gate"><label for="testPassword">Test password</label><input id="testPassword" type="password" inputmode="numeric" autocomplete="off" maxlength="20" required><p id="testGateError" class="danger-note" role="status"></p><button class="button-primary" type="submit">Enter test mode →</button></form>');
 $('testGateForm').onsubmit=e=>{e.preventDefault();if(!unlockTestMode($('testPassword').value)){hudText($('testGateError'),'That password did not match.');$('testPassword').select();return;}testUnlocked=true;openTestMenu();};
 $('testPassword').focus();
}
function openTestMenu(){
 if(!testUnlocked){openTestGate();return;}
 const hulls=testEnemyChoices(testConfig.scenario);if(!hulls.some(h=>h.id===testConfig.enemyClassId))testConfig.enemyClassId=hulls[0].id;
 dialog.open('The proving ground','test-menu',{eyebrow:'TEST MODE / ISOLATED & UNSAVED',wide:true});
 dialog.html('<p class="section-note">Practice in a starting cutter, then return to your voyage. Combat opponents reveal only a small selection of early hulls.</p><div id="testLayout" class="test-layout"><div><h3>Choose an exercise</h3><div id="testScenarios" class="test-scenarios"></div></div><div id="testTarget" class="test-target"><span class="eyebrow">ENEMY HULL</span><canvas id="testShipPreview" aria-label="Selected practice enemy"></canvas><label for="testEnemy">Practice opponent</label><select id="testEnemy"></select><p id="testHullDetail" class="mini"></p><p class="mini muted">Your cutter and equipment are fixed; raid defense uses a small training shuttle. This range has no story rewards or saved progression.</p></div></div><div class="test-launch"><p id="testGoal"></p><button id="launchTest" class="button-primary">Begin exercise →</button></div>');
 const select=$('testEnemy');for(const hull of hulls){const option=document.createElement('option');option.value=hull.id;option.textContent=hull.name;select.append(option);}select.value=testConfig.enemyClassId;
 const renderHull=()=>{testConfig.enemyClassId=select.value;const hull=hulls.find(h=>h.id===select.value);shipPreview($('testShipPreview'),hull.id);hudText($('testHullDetail'),`${hull.subtitle} · ${hull.berths} berths. Its exterior and interior use the same hull.`);};select.onchange=renderHull;
 const renderScenarios=()=>{const damage=testConfig.scenario==='damage-control';$('testTarget').hidden=damage;select.disabled=damage;$('testLayout').classList.toggle('solo-exercise',damage);$('testScenarios').replaceChildren();for(const scenario of TEST_SCENARIOS){const button=document.createElement('button');button.className='test-scenario'+(testConfig.scenario===scenario.id?' selected':'');button.setAttribute('aria-pressed',String(testConfig.scenario===scenario.id));button.innerHTML=`<strong>${esc(scenario.title)}</strong><small>${esc(scenario.description)}</small>`;button.onclick=()=>{testConfig.scenario=scenario.id;openTestMenu();};$('testScenarios').append(button);}hudText($('testGoal'),TEST_SCENARIOS.find(s=>s.id===testConfig.scenario).goal);};
 renderScenarios();renderHull();$('launchTest').onclick=()=>enterTestSession(createTestSession({...testConfig,seed:'range-'+Date.now()}));
}
function enterTestSession(session){
 if(network){toast('Sign off from the shared galaxy before opening an isolated exercise.','bad');return;}
 if(!testSession)testReturn={game,stored,tracked,cameraPreferences:cameraProfile.preferences};
 testSession=session;game=session.game;$('toastStack').replaceChildren();testConfig={scenario:session.scenarioId,enemyClassId:session.enemyClassId};testOutcome='';
 activateLocalCamera(cameraProfile.preferences,{practice:true});
 playing=true;dialog.close();$('welcome').hidden=true;$('testBar').hidden=false;document.body.classList.remove('welcome-active');document.body.classList.add('test-mode');
 hudText($('testScenarioName'),session.scenario.title);tracked=session.targetId;surface=null;surfaceKey='';surfaceTarget=null;personVisualOffset={x:0,y:0};personPredictedAt=null;personVisualAt=null;stepAccumulator=0;saveTimer=0;
 combatPresentation.reset();combatFeed.length=0;worldPresentation.reset();clearPointerAim();controls.clear();localShotAt=-Infinity;game.drainEvents();renderer.lastSystem=null;ensureSurface();audio.unlock();resize();updateHUD();canvas.focus({preventScroll:true});if(!touchLayout)toast(session.goal,'info',6500);
}
function retryTest(){if(testSession)enterTestSession(resetTestSession(testSession));}
function exitTestMode(){
 if(!testSession)return;setViewPanel(false,{restoreFocus:false});dialog.close();controls.clear();clearPointerAim();combatPresentation.reset();combatFeed.length=0;worldPresentation.reset();
 const prior=testReturn;game=prior.game;stored=prior.stored;tracked=prior.tracked;testSession=null;testReturn=null;testOutcome='';playing=false;surface=null;surfaceKey='';surfaceTarget=null;personVisualOffset={x:0,y:0};
 activateLocalCamera(prior.cameraPreferences);
 $('testBar').hidden=true;$('combatPanel').hidden=true;$('welcome').hidden=false;document.body.classList.remove('test-mode','person-mode','combat-active');document.body.classList.add('welcome-active');$('continueButton').hidden=!stored;renderer.lastSystem=null;resize();updateConnectionHUD();
}
function openTestControls(){
 if(!testSession){openTestGate();return;}const status=testSessionStatus(testSession);
 dialog.open(testSession.scenario.title,'test-controls',{eyebrow:'TEST MODE / YOUR VOYAGE IS UNCHANGED'});dialog.html(`<div class="guide-card"><strong>${esc(status.title)}</strong><p>${esc(status.detail)}</p></div><p>${esc(testSession.goal)}</p>`);
 dialog.choices([{label:'Resume exercise',action:()=>dialog.close()},{label:'Weapon & boarding controls',action:openCombatHelp},{label:'Retry this exercise',detail:'Restore the same target, ships, and crew deck.',action:retryTest},{label:'Choose another exercise',action:openTestMenu},{label:'Exit to main menu',action:exitTestMode}]);
}
function openCombatHelp(){
 const boarding=game.state.boarding,mp=game.state.multiplayer??{};
 dialog.open('Your sidearm & the deck','combat-help',{eyebrow:'PERSON COMBAT'});
 dialog.html(`<div class="weapon-brief"><span class="sidearm-glyph" aria-hidden="true"></span><div><h3>${esc(SIDEARM.name)}</h3><p>Included in your standard airlock kit. Its cell recharges between shots; it is ready when the weapon panel says READY.</p></div></div><h3>Aim, then fire</h3><p class="desktop-only-help"><strong>Desktop:</strong> WASD walks. Move the mouse over the deck or hold arrow keys to aim independently. Left-click or hold Space to fire. E uses nearby stations and airlocks.</p><p class="touch-only-help"><strong>Touch:</strong> the left stick walks; push the right stick toward a target to aim and fire. The FIRE button fires at the marked aim-assist target.</p><p>With no manual aim, the bracket marks a nearby visible hostile. Firing into a wall or empty space still produces a shot. A damage number confirms a hit; the DOWN label identifies the attacker. Your sidearm never fires by itself.</p><h3>Two ships remain in space</h3><p>Crossing an airlock puts you on that target’s actual deck. Both hulls remain exposed to outside fire. Reach the entry airlock to return across the tether, or clear the defenders and use the target’s helm. A destroyed hull cannot be used as an escape ship.</p><p>Friendly crew are protected. In a shared galaxy, declaring hostility makes ship and boarding combat deliberate. Hostile occupation blocks recovery into that ship’s bunks.</p>`);
 const choices=[{label:'Back to the deck',action:()=>dialog.close()}];if(boarding?.kind==='assault'||mp.returnVesselId)choices.push({label:'Return across the tether',detail:'Stand beside the entry airlock. Your origin ship must still be nearby and intact.',action:()=>runDeckAction('returnToOwnShip')});if(testSession)choices.push({label:'Exercise controls',action:openTestControls});dialog.choices(choices);
}
function openBoardingBrief(target){
 const enemy=game.system.enemies.find(e=>e.id===target.id);if(!enemy)return;const hull=getShipClass(enemy.cabinClass??enemy.classId);
 dialog.open(enemy.name??target.name,'boarding-brief',{eyebrow:'DISABLED CONTACT / BOARDING TETHER'});
 dialog.html(`<div class="ship-profile"><canvas id="boardingPortrait" aria-label="Boarding target hull"></canvas><div><h3>${esc(enemy.name??target.name)}</h3><p>${esc(hull.name)} · ${hull.berths} berths<br>Hull ${Math.round(enemy.hp/enemy.maxHp*100)}% remaining · Engines disabled</p></div></div><div class="guide-card"><strong>Pulse sidearm equipped</strong><p>${touchLayout?'The WALK stick moves you. Point the AIM stick at a hostile to aim and fire, or press FIRE for the marked target.':'WASD moves. Mouse or arrows aim. Click or Space fires.'}</p></div><p>You will enter this ship, leaving your own alongside. Both remain vulnerable. Clear the deck to use its helm, or return through the entry airlock.</p>`);shipPreview($('boardingPortrait'),hull.id);
 const story=game.narrativeBoard().active.find(view=>view.target?.enemyId===target.id);if(story)dialog.choices([{label:'Resolve the warrant',detail:story.objective,action:()=>narrativeUI.openThread(story.id)}]);
 const duty=game.professionBoard().active;if(duty?.target?.enemyId===target.id)dialog.choices([{label:'Resolve your assignment',detail:duty.objective,action:()=>narrativeUI.openProfessions()}]);
 dialog.choices([{label:'Board the target ship',action:async()=>{if(result(await invoke('boardEnemy',{id:target.id}))){dialog.close();surfaceKey='';ensureSurface();controls.clear();if(!touchLayout||settings.guidance!=='simple')toast('Target deck · Pulse sidearm ready. Aim, then fire.','good',5500);}}},{label:'Keep flying',action:()=>dialog.close()}]);
}
async function runDeckAction(method,args={}){if(result(await invoke(method,args))){dialog.close();surface=null;surfaceKey='';surfaceTarget=null;ensureSurface();controls.clear();clearPointerAim();updateHUD();}}
function currentPerspectiveAction(){return getPerspectiveAction(game,{shared:!!network,connected:!network||network.connected,fleet:onlineSnapshot?.fleet??[],surface});}
function updatePerspectiveControl(){
 const button=$('modePill'),action=currentPerspectiveAction(),label=actionPending?'Switching…':action.label;
 button.hidden=!playing;button.disabled=actionPending;
 if(hudText($('perspectiveLabel'),label))labelLayoutDirty=true;
 button.dataset.state=actionPending?'pending':action.enabled?'ready':'blocked';
 button.setAttribute('aria-disabled',String(actionPending||!action.enabled));button.setAttribute('aria-busy',String(actionPending));
 const explanation=action.reason||action.detail||'Switch between the ship and your captain.';
 button.title=explanation;button.setAttribute('aria-label',`${game.state.mode==='ship'?'Ship view':'Person view'}. ${label}. ${explanation}`);
}
function clearPerspectiveInput(){controls?.clear();clearPointerAim();wasFire=false;wasMine=false;network?.setInput({});}
async function switchPerspective(){
 if(!playing||dialog.opened||actionPending)return;
 const action=currentPerspectiveAction();
 setViewPanel(false,{restoreFocus:false});clearPerspectiveInput();
 if(!action.enabled){if(action.targetId){surfaceTarget=action.targetId;guideIntent='return';}toast(action.reason||'This perspective is unavailable here.','info',5500);updatePerspectiveControl();return;}
 if(action.command==='openCrewDuty'){livelihoodUI.openDuty();return;}
 if(action.command==='openPortServices'){livelihoodUI.openPort();return;}
 if(action.command==='openPortShips'){sharedCrewUI.openLocalShips();return;}
 const owner=network,activeGame=game;actionPending=true;updatePerspectiveControl();
 try{
  const answer=await invoke(action.command,action.args||{});
  if(owner!==network||activeGame!==game||!playing)return;
  if(!result(answer))return;
  surface=null;surfaceKey='';surfaceTarget=null;guideIntent=null;personVisualOffset={x:0,y:0};ensureSurface(false);
  resize();syncViewControls();saveNow();canvas.focus({preventScroll:true});
 }finally{actionPending=false;clearPerspectiveInput();updateHUD();}
}
function updateCombatHUD(){
 const boarding=game.state.boarding,expedition=game.state.exploration,visible=playing&&game.state.mode==='person'&&!!(boarding||personCombat()),panel=$('combatPanel');
 if(panel.hidden===visible){panel.hidden=!visible;labelLayoutDirty=true;}
 document.body.classList.toggle('combat-active',visible);if(!visible)return;
 const active=!!expedition||boarding?.phase==='active',down=game.state.person.health<=0||game.state.person.down,aim=combatPreview,remaining=personHostiles().filter(e=>e.health>0).length;
 hudText($('weaponName'),SIDEARM.name);hudText($('weaponState'),down?'DOWN':active?(elapsed-localShotAt<sidearmDelay()?'CYCLING':'READY'):'HOLSTERED');panel.classList.toggle('deck-secure',!active);
 hudText($('aimStatus'),down?'INCAPACITATED · Waiting for recovery':!active?'Deck secure · Use the helm or entry airlock':aim?.blocked?'WALL BLOCKING SHOT':aim?.target?(aim.manual?'AIM: ':'ASSIST: ')+(aim.target.name??'Hostile'):aim?.manual?'MANUAL AIM · No target in sights':'AIM ASSIST · No visible target');
 hudText($('combatCount'),expedition?(remaining?`${remaining} lifeform${remaining===1?'':'s'} · Entrance remains open`:'No movement detected · Explore or return outside'):active?`${remaining} hostile${remaining===1?'':'s'} · ${boarding.kind==='assault'?'Target deck · Both hulls exposed':'Defend this ship'}`:'Crew cleared · Outside fire can still hit the hull');
 if(boarding?.kind==='assault'){const origin=network?onlineSnapshot?.fleet?.find(v=>v.id===game.state.multiplayer?.returnVesselId):game.state.ship;if(origin)hudText($('combatCount'),`${remaining} hostile${remaining===1?'':'s'} · Origin hull ${Math.ceil(origin.hull)} / ${Math.ceil(origin.maxHull)}`);}
 const recent=combatFeed.filter(e=>elapsed-e.at<7).slice(-3);if(hudHTML($('combatFeed'),recent.map(e=>`<div>${esc(e.text)}</div>`).join('')))labelLayoutDirty=true;
}
function recordCombatFeed(text){combatFeed.push({text,at:elapsed});if(combatFeed.length>5)combatFeed.shift();hudDirty=true;}
function processCombatEvent(event){
 const accepted=combatPresentation.push(event,elapsed);if(!accepted)return false;
 const id=network?.passport?.captainId??game.playerId??'local',local=event.attackerId===id||!network&&event.attackerId==='local';
 if(event.type==='person-shot'){audio.play(local?'sidearm':event.team==='hostile'?'enemyShot':'crewShot');if(local)localShotAt=elapsed;}
 if(event.type==='person-hit'){if(event.targetId===id)audio.play('personHit');else if(local)audio.play('sidearmHit');}
 if(['boarder-down','person-down','crew-death'].includes(event.type)){audio.play('personDown');recordCombatFeed(`${event.targetName??event.name??'Crew member'} down · ${local?'Your shot':event.actorName??event.attackerName??'Boarding combat'}`);}
 hudDirty=true;return true;
}
function openVesselContact(vesselId){
 const v=onlineSnapshot?.fleet?.find(item=>item.id===vesselId);if(!v){openOnline();return;}const mp=game.state.multiplayer??{},owner=onlineSnapshot?.presence?.find(c=>c.captainId===v.ownerId),aboard=mp.aboardVesselId===v.id;
 dialog.open(v.name??'Vessel contact','vessel-contact',{eyebrow:`${getShipClass(v.classId).name.toUpperCase()} / ${v.hostile?'HOSTILE CONTACT':'SHIP CONTACT'}`});
 const range=game.state.mode==='ship'&&Number.isFinite(v.x)?Math.round(Math.hypot(v.x-game.state.ship.x,v.y-game.state.ship.y)):null,port=game.galaxy.find(system=>system.id===v.systemId)?.bodies.find(body=>body.id===v.dockedAt),boarding=getBoardingAction(game,v,{fleet:onlineSnapshot?.fleet||[],connected:network?.connected!==false});
 dialog.html(`<p>${owner?`${esc(owner.name)}’s vessel · `:''}${v.occupants??0} captains aboard · ${v.berths} total berths${range!==null&&!aboard?` · ${range} m away`:''}</p><div class="stat-grid"><div class="stat-cell"><small>HULL</small><strong>${Math.ceil(v.hull??0)} / ${Math.ceil(v.maxHull??0)}</strong></div><div class="stat-cell"><small>STATUS</small><strong class="contact-state">${v.destroyed?'DESTROYED':v.occupation?.contested?'CONTESTED':v.dockedAt?'DOCKED':v.disabled?'DISABLED':v.hostile?'HOSTILE':'UNDER WAY'}</strong></div></div>${v.dockedAt?`<p>Docked at <strong>${esc(port?.name||v.dockedAt)}</strong>. Board the deck before anyone launches.</p>`:''}${v.helmName&&v.helmOccupied!==false?`<p><strong>${esc(v.helmName)}</strong> is at the helm.</p>`:''}<p>${v.occupation?.contested?'Hostile boarders are aboard. This ship cannot be a recovery destination.':'Boarding changes which deck you occupy. Your own ship stays where you leave it.'}</p>`);
 const actions=[];if(!aboard&&!v.hostile)actions.push({label:boarding.label,disabled:!boarding.enabled,detail:boarding.reason||boarding.detail,action:()=>runDeckAction('boardShip',{vesselId:v.id})});
 if(v.ownerId===mp.captainId)actions.push({label:'Crew & boarding permissions',detail:'Choose who may board and who may pilot.',action:()=>sharedCrewUI.openShip(v.id)});
 if(!aboard&&v.canDeclareHostility)actions.push({label:'Declare this ship hostile',warning:true,detail:'Both sides can damage each other. Disable its hull before attempting forced boarding.',action:async()=>{if(result(await invoke('declareHostility',{vesselId:v.id})))openVesselContact(v.id);}});
 if(!aboard&&v.hostile)actions.push({label:'Board the hostile ship',disabled:!v.canHostileBoard,detail:v.canHostileBoard?'Cross onto the actual target deck. Both hulls remain in space.':'Disable the hull and approach close enough to board.',action:()=>runDeckAction('boardHostileShip',{vesselId:v.id})});
 if(aboard&&(mp.canTakeHelm||v.canTakeHelm))actions.push({label:'Use this ship’s helm',detail:'Reach its helm. The vessel keeps its existing damage.',action:()=>runDeckAction('takeCapturedHelm')});
 if(aboard&&mp.returnVesselId)actions.push({label:'Return across the tether',detail:'Reach the airlock; your origin ship must remain close enough.',action:()=>runDeckAction('returnToOwnShip')});
 actions.push({label:'Back to nearby ships',action:openOnline},{label:'Return to the world',action:()=>dialog.close()});dialog.choices(actions);
}

function start(fresh,options={}){if(testSession){openTestControls();return;}if(network){network.disconnect();network=null;onlineSnapshot=null;connectionState='offline';game=stored?Game.fromSave(stored):new Game('farwake-'+Date.now());}audio.unlock();if(!fresh&&stored){game=Game.fromSave(stored);surface=null;surfaceKey='';}if(fresh){game=new Game('farwake-'+Math.floor(Date.now()/1000),options);surface=null;surfaceKey='';tracked='kettle';openingMarkerKey='';trackedThreadId=null;narrativeWaypoint=null;}activateLocalCamera(game.state.cameraPreferences??localCameraPreferences);playing=true;$('welcome').hidden=true;document.body.classList.remove('welcome-active');resize();ensureSurface(false);game.drainEvents();saveNow();updateHUD();canvas.focus({preventScroll:true});if(!fresh&&game.state.pendingEncounter)openEncounter(game.getEncounter());else if(!game.openingMissionStatus?.().active&&(!touchLayout||settings.guidance!=='simple'))toast(fresh?(game.ownsShip?'Your ship, Cinder, is beside Kettle Station. Dock to meet Iona and find work.':'You begin on Morrow with 180 credits and no ship. Port services opens work and paid passage.'):'Welcome back, captain. Your voyage is right where you left it.','good',6500);}
function openNewCaptain(){
 if(testSession){openTestControls();return;}
 openCaptainSetup(dialog,{mode:'create',onComplete:selection=>{dialog.close();start(true,selection);return {ok:true};}});
}
function openCaptainProfile(){
 if(testSession){openTestControls();return;}
 if(!playing){toast('Start or resume a voyage to open your captain’s locker.');return;}
 if(game.state.boarding?.phase==='active'||game.state.exploration){toast('Return to a safe place before changing your captain.');return;}
 openCaptainSetup(dialog,{mode:'edit',character:game.state.character,locked:game.state.characterLocked===true,onComplete:async selection=>{
  const answer=await invoke('customizeCharacter',{appearance:selection.character.appearance,traits:selection.character.traits,chooseTraits:selection.chooseTraits});
  if(!answer?.ok)return answer;
  result(answer);toast('Captain saved.','good');return answer;
 }});
}
function saveNow(){if(testSession){hudText($('saveState'),'TEST · UNSAVED');return true;}if(!playing)return;if(network){$('saveState').textContent=network.connected?'SHARED GALAXY':'RECONNECTING';return network.connected;}game.state.cameraPreferences=cameraProfile.preferences;const ok=saveGame(game);if(ok)stored=game.state;return ok;}
function result(r,{success='',refresh=null}={}){if(!r?.ok){if(!r?.presented)toast(r?.reason??r?.message??'That action is unavailable.','bad');return false;}if(success)toast(success,'good');processEvents();saveNow();if(refresh)refresh();updateHUD();return true;}
async function command(name){if(name==='online'){openOnline();return;}if(name==='pause'){if(dialog.opened)dialog.close();else if(touchLayout&&playing)openFlightMenu();else openSettings();return;}if(!playing||actionPending)return;if(name==='galaxy')openMap(game.state.systemId,game.state.mode==='person'?'local':'galaxy');else if(name==='journal')openJournal();else if(name==='ship')openShip();else if(name==='cabin')enterCabin();else if(name==='interact')interact();else if(name==='scan')scanNearest();else if(name==='primaryDown'&&game.state.mode==='person'&&!armedOnFoot()){if(elapsed-lastPrimary>.25){lastPrimary=elapsed;wasFire=true;interact();}}else if(name==='mine'&&game.state.mode==='person')openJournal('missions');}
function ensureSurface(reset=false){if(game.state.mode!=='person'){surface=null;surfaceKey='';return;}const body=game.currentBody??game.state.interior?.body??{id:game.state.locationId??'own-ship',name:'Cinder · crew deck',kind:game.state.locationId?.includes('derelict')?'derelict':'ship',crew:game.state.crew};const crew=body.crew??game.state.crew;if(!network&&game.state.interior?.kind==='ship')body.guests=rescueOccupants(game.state.ship);const guests=body.guests||[];const key=game.state.systemId+':'+body.id+':'+!!body.evacuated+':'+(game.state.ship.classId??'sparrow')+':'+(body.classId??body.shipClassId??body.shipClass??'')+':'+crew.filter(c=>c.health>0).map(c=>c.id).join(',')+':'+guests.map(g=>g.id+':'+g.status+':'+(g.health>0)).join(',');if(surfaceKey!==key||reset){controls?.clear();surface=generateSurface({...body,crew},game.state.seed,game.state.flags);surfaceKey=key;if(reset||!isWalkable(surface,game.state.person.x,game.state.person.y))Object.assign(game.state.person,surface.spawn);surfaceTarget=null;updateSurfaceFlags();}syncNpcLife();game._surfaceForInteraction=()=>{syncNpcLife();return surface;};game._npcTime=npcTime;syncDeckDamage();}
function npcTime(){
 const clock=network?game.state.npcLife:null;
 return clock&&Number.isFinite(clock.time)?clock.time+Math.max(0,Math.min(2,(Date.now()+(network.clockOffset||0)-clock.sampledAt)/1000)):game.state.stats.time;
}
function syncNpcLife(){
 if(!surface)return;
 const shared=network?game.state.npcLife:null;
 const holds=shared?.surfaceId===surface.id?shared.holds||[]:[];
 updateNpcLife(surface,npcTime(),{holds});
}
async function speakTo(e,role=resolveRole(e)){
 const owner=game,transport=network,place=game.state.systemId+':'+game.state.locationId;
 let answer;
 if(network){answer=await invoke('surfaceAction',{entityId:e.id,action:'talk'});if(game!==owner||network!==transport||place!==game.state.systemId+':'+game.state.locationId||game.state.mode!=='person')return null;if(!result(answer))return null;}
 else{game.recordActivity('talk',{role,token:e.id});}
 const words=answer?.dialogue||game.conversation(e,{record:!network,time:npcTime()});
 e.conversation=words;return words;
}
function updateAmbientLife(active){
 const element=$('ambientCaption');if(!element)return;
 if(!active||game.state.mode!=='person'||!surface||personCombat()||game.state.npcContract?.active){element.hidden=true;ambientCue=null;return;}
 const time=npcTime(),room=[game.state.seed,game.state.multiplayer?.captainId||'solo',surface.id].join('|');
 if(room!==ambientRoom){ambientRoom=room;ambientMemory=createAmbientMemory(surface,time);ambientCue=null;}
 if(ambientCue&&time>=ambientCue.until)ambientCue=null;
 if(!ambientCue){const cue=sampleAmbientConversation(surface,time,game.state.person,{memory:ambientMemory,allow:true});if(cue){ambientCue=cue;ambientMemory=cue.nextMemory;}}
 element.hidden=!ambientCue;
 if(ambientCue){const markup=ambientCue.lines.map(line=>`<p><strong>${esc(line.speaker)}:</strong> ${esc(line.text)}</p>`).join('');hudHTML(element,markup);}
}
function updateSurfaceFlags(){if(!surface)return;const perspective=currentPerspectiveAction(),passengerLanding=!game.state.interior&&perspective.command==='openPortServices',mp=game.state.multiplayer||{},vessel=network?onlineSnapshot?.fleet?.find(v=>v.id===mp.aboardVesselId):null;for(const e of surface.entities){if(e.type==='exit'&&!game.state.interior){e.data.departureName??=e.name;e.data.departureRole??=e.role;e.name=passengerLanding?'Passenger service':network&&perspective.command==='boardShip'?perspective.label:network&&perspective.command==='openPortShips'?'Ship berths':e.data.departureName;e.role=passengerLanding?'Port services':network&&['boardShip','openPortShips'].includes(perspective.command)?'Board without departing':e.data.departureRole;}if(e.data?.stationRole==='helm'){e.data.stationName??=e.name;e.data.helmPilotName=vessel?.helmOwner&&vessel.helmOwner!==mp.captainId&&vessel.helmOccupied!==false?(vessel.helmName||onlineSnapshot?.presence?.find(c=>c.captainId===vessel.helmOwner)?.name||'Another captain'):null;e.name=e.data.helmPilotName?`${e.data.helmPilotName} · helm`:e.data.stationName;}if(e.type==='sample')e.hidden=game.state.flags.includes('done:'+e.id);if(e.type==='crate')e.hidden=game.state.flags.includes('carrying:'+surface.id)||game.state.flags.includes('delivered:'+surface.id);}}
function flag(name){if(!game.state.flags.includes(name))game.state.flags.push(name);}
function currentWorkToken(e){const job=game.state.missions.find(m=>m.type==='work'&&m.targetBody===game.state.locationId&&m.status!=='completed');return `${e.id}:${job?.id??'once'}`;}
function currentDamageHull(){return network?game.state.ship:(game.currentDamageHull?.()??game.state.ship);}
function aboardDamageHull(){return game.state.mode==='person'&&['ship','enemy'].includes(game.state.interior?.kind);}
function hullSystemMarkup(classId){const systems=getShipClass(classId).systems;return systems?`<div class="hull-system"><strong>${esc(systems.name)}</strong><p>${esc(systems.description)}</p><small>${esc(systems.tradeoff)}</small></div>`:'';}
function syncDeckDamage(){
 if(!aboardDamageHull()||surface?.kind!=='ship')return;
 const hull=currentDamageHull();syncDamageMarkers(surface,hull);
 const body=game.currentBody,crew=body?.crew??game.state.crew,guests=body?.guests??rescueOccupants(hull);
 for(const entity of surface.entities){
  const person=entity.data?.crewId?crew.find(c=>c.id===entity.data.crewId):entity.data?.guestId?guests.find(g=>g.id===entity.data.guestId):null;
  if(!person)continue;
  Object.assign(entity.data,{health:person.health,maxHealth:person.maxHealth??100,hurtUntil:person.hurtUntil??person.hitUntil??0});
  if(entity.data.guestId&&Number.isFinite(person.x)&&Number.isFinite(person.y)&&isWalkable(surface,person.x,person.y)){entity.x=person.x;entity.y=person.y;}
 }
 if(surfaceTarget?.includes(':damage:')&&!surface.entities.some(e=>e.id===surfaceTarget))surfaceTarget=null;
}
function damageSectionText(section){return[section.fire>.1?`Fire ${Math.ceil(section.fire)}%`:'',section.breach>.1?`Breach ${Math.ceil(section.breach)}%`:'',section.damage>.1?`Compartment damage ${Math.ceil(section.damage)}%`:''].filter(Boolean).join(' · ')||'Compartment secure';}
function openDamageOverview(){
 const hull=currentDamageHull(),summary=interiorDamageSummary(hull),classId=hull.classId??'sparrow',spec=getShipClass(classId),onDeck=aboardDamageHull();
 dialog.open(hull.name||spec.name,'damage-overview',{eyebrow:'THIS HULL / DAMAGE CONTROL'});
 dialog.html(`<div class="ship-profile"><canvas id="damageShipPortrait" aria-label="Current hull exterior"></canvas><div><h3>${esc(spec.name)}</h3><p>Hull ${Math.ceil(hull.hull??hull.hp??0)} / ${Math.ceil(hull.maxHull??hull.maxHp??spec.stats.maxHull)}<br>${spec.berths} berths · ${Math.floor(hull.energy??0)} reactor charge</p></div></div>${hullSystemMarkup(classId)}<p>${summary.alarm?'Fires and open breaches can injure people nearby. Reach the marked compartment, put out its fire, then patch the breach.':'Damage stays with this hull until repaired. Shield hits do not start fires or open breaches.'}</p><p class="mini">Local work uses reactor charge; patches and compartment repairs also use ore. You have ${Math.floor(hull.energy??0)} charge · ${game.state.cargo.ore} ore. A port hull repair restores all compartments.</p>`);
 shipPreview($('damageShipPortrait'),classId);
 const damaged=summary.sections.filter(section=>section.damage>.1||section.fire>.1||section.breach>.1);
 const items=damaged.map(section=>({label:section.name,detail:damageSectionText(section),action:()=>openDamageSection(section.id)}));
 if(!damaged.length)dialog.body.insertAdjacentHTML('beforeend','<p class="result-note">All compartments secure.</p>');
 if(!onDeck&&game.state.mode==='ship')items.push({label:'Walk the deck',action:enterCabin});
 items.push({label:'Back to the world',action:()=>dialog.close()});dialog.choices(items);
}
function openDamageSection(sectionId){
 const hull=currentDamageHull(),section=interiorDamageSummary(hull).sections.find(value=>value.id===sectionId);
 if(!section){toast('This compartment is no longer part of the occupied hull.');return;}
 const onDeck=aboardDamageHull(),near=onDeck&&distance(game.state.person,section)<=72,charge=Math.floor(hull.energy??0),ore=game.state.cargo.ore;
 dialog.open(section.name,'damage-section',{eyebrow:'LOCAL DAMAGE CONTROL'});
 dialog.html(`<p class="damage-condition">${esc(damageSectionText(section))}</p><p>Keep clear of the damaged point. Work from within three deck tiles; walls can block access.</p><p><strong>Available:</strong> ${charge} reactor charge · ${ore} ore</p>${!near?'<p class="mini">Reach this compartment on the actual ship before working on it.</p>':''}`);
 const items=Object.entries(DAMAGE_CONTROL_ACTIONS).filter(([,rule])=>section[rule.field]>.1).map(([action,rule])=>({
  label:rule.label,detail:`Cost ${rule.energy} charge${rule.ore?` + ${rule.ore} ore`:''} · You have ${charge} charge / ${ore} ore.`,
  disabled:!near||charge<rule.energy||ore<rule.ore||game.state.person.health<=0||game.state.person.down,
  action:async()=>{const duty=game.state.npcContract,assigned=duty?.active&&duty.vesselId===hull.id&&duty.work?.sectionId===sectionId;const answer=await invoke(assigned?'npcContractAction':'damageControl',{sectionId,action});if(result(answer)){dialog.close();syncDeckDamage();audio.play('repair');updateHUD();}else if(answer?.code==='cooldown')dialog.close();}
 }));
 if(onDeck)items.push({label:'Mark this compartment',detail:'Return to the deck and follow its marker.',action:()=>{syncDeckDamage();surfaceTarget=surface?.entities.find(entity=>entity.type==='damageControl'&&entity.data.sectionId===sectionId)?.id??null;dialog.close();}});
 items.push({label:'All compartments',action:openDamageOverview},{label:'Return to the deck',action:()=>dialog.close()});dialog.choices(items);
}
function damageGuide(target=nearby()){
 if(settings.guidance!=='simple'||!aboardDamageHull()||personCombat())return null;
 const hull=currentDamageHull(),practice=testSession?.scenarioId==='damage-control',sections=interiorDamageSummary(hull).sections.filter(section=>section.fire>.1||section.breach>.1||practice&&section.damage>.1);
 if(!sections.length)return null;
 const near=target?.type==='damageControl'&&sections.some(s=>s.id===target.data.sectionId)?target:null,section=sections.find(s=>s.id===near?.data.sectionId)||sections.sort((a,b)=>distance(a,game.state.person)-distance(b,game.state.person))[0];
 const id=surface?.entities.find(entity=>entity.type==='damageControl'&&entity.data.sectionId===section.id)?.id;if(id&&!surfaceTarget)surfaceTarget=id;
 return{id:`route:damage:${hull.id}:${section.id}`,flow:'route',title:section.fire>.1?'Fire on deck':section.breach>.1?'Hull breach':'Compartment repairs',
  body:near?`${touchLayout?'Tap Damage control':'Press E'} to work on ${section.name}. The panel shows each action’s cost and your supplies. Keep away from the damaged point.`:`${section.name} needs attention. Follow the marker, stay off the damaged point, and work from nearby.`,
  compactBody:near?`${touchLayout?'Tap Damage control':'Press E'} to ${section.fire>.1?'suppress the fire':section.breach>.1?'patch the breach':'repair the compartment'}.`:`Reach the marked compartment. Keep clear of the damage.`,controlTarget:near?'contextButton':'stick'};
}
function personCombat(){return game.state.mode==='person'&&(game.state.boarding?.phase==='active'||!!game.state.exploration?.encounter?.monsters?.some(enemy=>enemy.health>0));}
function personHostiles(){return game.state.exploration?.encounter?.monsters??game.state.boarding?.enemies??[];}
function sidearmDelay(){return SIDEARM.cooldown*(game.characterEffects?.sidearmCooldown??1);}
function clearPointerAim(){pointerAim.active=false;pointerAim.fire=false;combatPreview=null;}
function armedOnFoot(){const contract=game.state.npcContract,incident=contract?.assignment?.complication;return personCombat()||contract?.active&&(contract.version===2?incident?.started&&!incident.resolved&&incident.type==='attack':contract.roleId==='gunner')||!!network&&game.state.multiplayer?.crewRole==='weapons';}
function nearby(){if(game.state.mode!=='ship')return surface?(surface.kind==='ship'?nearestDeckInteraction(surface,game.state.person):nearestEntity(surface,game.state.person,43)):null;const local=game.interact();if(local?.type==='board')return local;if(network){const mp=game.state.multiplayer??{},contact=(onlineSnapshot?.fleet??[]).filter(v=>v.id!==(mp.aboardVesselId??mp.ownedVesselId)&&v.systemId===game.state.systemId&&!v.destroyed&&Number.isFinite(v.x)&&Math.hypot(v.x-game.state.ship.x,v.y-game.state.ship.y)<220).sort((a,b)=>distance(a,game.state.ship)-distance(b,game.state.ship))[0];if(contact)return{type:'shared-ship',id:contact.id,name:contact.name??'Nearby ship',vessel:contact};}return local;}
async function interact(){if(!playing||dialog.opened||actionPending)return;const target=nearby();if(!target){toast(game.state.mode==='ship'?'Fly close to a station, planet, or signal. Hold MINE near asteroids.':'Move close to a person, terminal, or marked workstation.');return;}audio.play('click');if(game.state.mode==='ship'){if(target.type==='dock'){if(result(await invoke('dock',{id:target.id}))){ensureSurface(true);audio.play('dock');if(!touchLayout&&!game.openingMissionStatus?.().active)toast(`Person mode · ${target.name}. Find the contract exchange or explore.`,'good');saveNow();}}else if(target.type==='signal'){if(target.signal.kind==='derelict'&&!target.signal.resolved){dialog.open(target.name,'derelict',{eyebrow:'UNPOWERED VESSEL'});dialog.html('<p>A freighter drifts with its running lights dark. The docking collar still has pressure. You can investigate the signal from here, or go aboard.</p>');dialog.choices([{label:'Board the freighter',detail:'Explore its holds, find the recorder, and check for survivors.',action:async()=>{dialog.close();if(typeof game.boardDerelict==='function'){if(result(await invoke('boardDerelict',{id:target.id}))){ensureSurface(true);saveNow();}}else{result(await invoke('scan',{id:target.id}));if(game.state.pendingEncounter)openEncounter(game.getEncounter());}}},{label:'Scan its transmission',detail:'Resolve the signal from the safety of your cockpit.',action:async()=>{dialog.close();scanSignal(target.id);}}]);}else scanSignal(target.id);}else if(target.type==='shared-ship'){openVesselContact(target.id);}else if(target.type==='board'){openBoardingBrief(target);}else if(target.type==='parked-ship'){if(result(await invoke('boardParkedShip',{id:target.id}))){surfaceKey='';ensureSurface();}}else if(target.type==='salvage')result(await invoke('salvage',{id:target.id}));else if(target.type==='hail'){dialog.open(target.name,'hail',{eyebrow:'OPEN FREQUENCY'});dialog.html(`<p>“Another small captain out here. Good to see a friendly transponder.”</p><p class="mini">${esc(game.currentSystem.description)}</p>`);dialog.choices([{label:'Ask what is happening nearby',action:async()=>{const r=await invoke('triggerEncounter',{sourceId:target.id,sourceType:'traffic'});if(r.ok)openEncounter(r.encounter);else dialog.html('<p>“Quiet, for now. There is always work on the port boards, and the old beacons still have stories to tell.”</p>');}},{label:'Wish them safe travels',action:async()=>dialog.close()}]);}}else{selectGuide();const uses=tutorial.controller.count('person-use');await handleEntity(target);if(dialog.opened&&tutorial.controller.count('person-use')===uses)recordGuide('person-use');}updateHUD();}
async function scanSignal(id){const r=await invoke('scan',{id:id});if(!result(r))return;if(r.encounter)openEncounter(r.encounter);else if(r.text){dialog.open('Signal recovered','discovery',{eyebrow:'SCANNER RECORD'});dialog.html(`<p>${esc(r.text)}</p>`);dialog.choices([{label:'Add it to the log',action:async()=>dialog.close()}]);}}
async function scanNearest(){if(network&&game.state.mode==='person'&&['scanner','navigation'].includes(game.state.multiplayer?.crewRole)){const r=await invoke('crewAction',{action:'scan'});if(result(r)){if(r.encounter)openEncounter(r.encounter);else if(r.text)toast(r.text,'good');}return;}if(game.state.mode!=='ship')return interact();const sig=game.system.signals.filter(s=>!s.resolved).sort((a,b)=>distance(a,game.state.ship)-distance(b,game.state.ship))[0];if(sig)scanSignal(sig.id);else toast('All local signals have been resolved.');}
async function leaveSurface(){if(network&&!game.state.interior&&!game.state.exploration){const action=currentPerspectiveAction();if(action.command==='openPortServices'){livelihoodUI.openPort();return;}if(action.command==='openPortShips'){sharedCrewUI.openLocalShips();return;}if(!action.enabled){toast(action.reason,'info');return;}await runDeckAction(action.command,action.args);return;}if(game.state.boarding?.kind==='assault'||game.state.multiplayer?.returnVesselId){await runDeckAction('returnToOwnShip');return;}let r;if(game.state.interior&&typeof game.leaveInterior==='function')r=await invoke('leaveInterior');else if(surface?.kind==='ship'&&typeof game.exitCabin==='function')r=await invoke('exitCabin');else if(surface?.kind==='derelict'&&typeof game.leaveDerelict==='function')r=await invoke('leaveDerelict');else r=await invoke('launch');if(result(r)){controls.clear();surface=null;surfaceKey='';surfaceTarget=null;audio.play('dock');saveNow();}}
async function enterCabin(){if(!playing)return;dialog.close();if(game.state.mode!=='ship'){toast('Return to your ship first.');return;}if(typeof game.enterCabin==='function'){if(result(await invoke('enterCabin'))){ensureSurface(true);saveNow();}}else{toast('Crew quarters are available at the next port.');}}
async function handleEntity(e){const type=e.type;if(type==='damageControl'){openDamageSection(e.data.sectionId);return;}if(testSession&&!['exit','station'].includes(type)){openTestControls();return;}
 if(e.data?.rescuePassenger){dialog.open(e.name,'rescued-passenger',{eyebrow:'ABOARD THIS SHIP'});dialogueHeader(e,e.data.greeting||e.text||'“A berth and a safe port are all we need.”');dialog.body.insertAdjacentHTML('beforeend','<p class="mini">Dock this ship at an inhabited port to bring its rescued passengers ashore.</p>');dialog.choices([{label:'Safe travels',action:async()=>dialog.close()}]);return;}
 if(e.data?.professionDesk)return narrativeUI.openProfessions(e);
 if(e.data?.contactId)return narrativeUI.openContact(e);
 if(type==='questObject')return narrativeUI.openObject(e);
 if(type==='evaAirlock'){if(result(await invoke('npcContractAction',{action:'exitEva'}))){surface=null;surfaceKey='';ensureSurface();}return;}
 if(type==='evaWork'){livelihoodUI.openTask();return;}
 if(type.startsWith('site'))return openSiteEntity(e);
 if(type==='exit'){if(game.state.npcContract?.active){livelihoodUI.openDuty();return;}if(!game.state.interior&&currentPerspectiveAction().command==='openPortServices'){livelihoodUI.openPort();return;}if(e.data?.stationRole==='helm')openStation(e);else leaveSurface();return;}
 if(type==='jobboard'){openJobs();return;}
 if(type==='mechanic'){if(!await speakTo(e,'mechanic'))return;if(game.state.interior){dialog.open(e.name,'console',{eyebrow:'RESERVE POWER'});dialog.html('<p>The fabricator is on reserve power. You can calibrate this vessel’s relays, but fitting Cinder with new equipment requires an inhabited port.</p>');dialog.choices([{label:'Find a maintenance relay',action:async()=>{surfaceTarget=surface.entities.find(x=>x.type==='work')?.id;dialog.close();}},{label:'Return to the hold',action:async()=>dialog.close()}]);}else openOutfitter(e);return;}
 if(type==='medic')return openMedic(e);
 if(type==='crew'){openCrew(e);return;}
 if(type==='terminal'){if(e.data?.journal){openJournal();return;}if(e.data?.crew){openCrew();return;}return openTerminal(e);}
 if(type==='work'){openRepair(e);return;}
 if(type==='station'){openStation(e);return;}
 if(type==='bunk'){openBunk(e);return;}
 if(network&&['crate','delivery','sample'].includes(type)){const r=await invoke('surfaceAction',{entityId:e.id,action:{crate:'pickup',delivery:'deliver',sample:'collect'}[type]});if(result(r)){updateSurfaceFlags();surfaceTarget=type==='crate'?surface.entities.find(x=>x.type==='delivery')?.id:null;toast(r.text??r.message??(type==='crate'?'Freight collected. Carry it to the striped pad.':'Work recorded. Your payment is saved.'),'good');}return;}
 if(type==='crate'){if(game.state.flags.includes('delivered:'+surface.id)){toast('This shipment has been delivered.');return;}flag('carrying:'+surface.id);game.state.person.carrying=true;e.hidden=true;surfaceTarget=surface.entities.find(x=>x.type==='delivery')?.id;toast('Freight collected. Carry it to the striped loading pad.','good');saveNow();return;}
 if(type==='delivery'){if(!game.state.flags.includes('carrying:'+surface.id)){toast('The loading pad is waiting for the freight crate in storage.');surfaceTarget=surface.entities.find(x=>x.type==='crate')?.id;return;}game.state.flags=game.state.flags.filter(f=>f!=='carrying:'+surface.id);flag('delivered:'+surface.id);flag(e.data.flag);game.state.person.carrying=false;const r=game.recordActivity('freight',{token:e.id+':cargo',kind:'cargo'});if(r.first){game.state.credits+=35;game.state.rep.freewake=Math.min(100,game.state.rep.freewake+2);}surfaceTarget=null;toast('Freight delivered · +35 cr · Freewake +2','good');audio.play('quest');processEvents();saveNow();return;}
 if(type==='sample'){if(game.state.flags.includes('done:'+e.id))return;flag('done:'+e.id);flag(e.data.flag);e.hidden=true;if(surfaceTarget===e.id)surfaceTarget=surface.entities.find(x=>x.type==='sample'&&!x.hidden&&x.id!==e.id)?.id??surface.entities.find(x=>x.type==='jobboard')?.id;const r=game.recordActivity('sample',{token:e.id,kind:'sample'});if(r.first){game.state.credits+=15;game.state.rep.lantern=Math.min(100,game.state.rep.lantern+2);}toast('Survey sample catalogued · +15 cr · Lantern +2','good');audio.play('pickup');processEvents();saveNow();return;}
 return openNPC(e);
}
async function openSiteEntity(entity){
 if(entity.type==='siteExit'){await runDeckAction('exitSite');return;}
 if(entity.type==='siteEntrance'){
  dialog.open(entity.name,'site-entrance',{eyebrow:'BEYOND THE LANDING ZONE'});
  const social=entity.data?.siteKind==='social'||entity.data?.socialOnly;
  dialog.html(`<p>${esc(entity.data?.summary||entity.text)}</p>${social?'':`<div class="guide-card"><strong>Field kit · Pulse sidearm</strong><p>${touchLayout?'The left stick walks. Point the right AIM stick to aim and fire; FIRE shoots at the marked target.':'WASD walks. Mouse or arrow keys aim. Click or Space fires.'} You choose when to shoot. Return to the entrance to leave at any time.</p></div><p class="mini muted">Read what was left behind. Some places have supplies, some have danger, and some are simply quiet.</p>`}`);
  dialog.choices([{label:'Enter '+entity.name,action:()=>runDeckAction('enterSite',{siteId:entity.data.siteId})},{label:'Stay outside',action:()=>dialog.close()}]);return;
 }
 if(entity.type==='siteCache'){
  const claimed=game.state.exploration?.encounter?.collected?.includes(entity.data.cacheId);
  dialog.open(entity.name,'site-cache',{eyebrow:'FIELD SUPPLIES'});
  dialog.html(`<p>${claimed?'The container has already been searched. Its contents remain recorded in the log.':'A sealed container. Recovering its contents requires enough space in your ship’s hold.'}</p><p class="mini">Hold ${game.cargoUsed} / ${game.state.ship.cargoCap} · You have ${fmt(game.state.credits)} cr</p>`);
  dialog.choices([{label:claimed?'Already recovered':'Recover supplies',disabled:claimed,action:async()=>{const answer=await invoke('siteAction',{entityId:entity.id,action:'collect'});if(result(answer))showSiteResult(entity.name,answer);}},{label:'Step away',action:()=>dialog.close()}]);return;
 }
 const answer=await invoke('siteAction',{entityId:entity.id,action:'inspect'});if(!result(answer))return;
 dialog.open(answer.title??entity.name,'site-record',{eyebrow:answer.choice?'A DECISION THAT STAYS':'FIELD RECORD'});
 dialog.html(`<p>${esc(answer.text)}</p>`);
 if(answer.choice){
  if(answer.chosen){const chosen=answer.choice.options.find(option=>option.id===answer.chosen);dialog.body.insertAdjacentHTML('beforeend',`<div class="result-note">${esc(chosen?.text??'This decision has already been made.')}</div>`);}
  else dialog.choices(answer.choice.options.map(option=>({label:option.label,detail:option.reward?`Payment: ${effectSummary(option.reward)||'Recorded in the log'}`:undefined,action:async()=>{const resolved=await invoke('siteAction',{entityId:entity.id,action:'choose',optionId:option.id});if(result(resolved))showSiteResult(answer.title,resolved);}})));
 }
 dialog.choices([{label:'Return to exploring',action:()=>dialog.close()}]);
}
function showSiteResult(title,answer){
 dialog.open(title,'site-result',{eyebrow:'DISCOVERY RECORDED'});
 const parts=[effectSummary(answer),answer.crystal?`+${answer.crystal} crystal`:'',answer.heal?`Up to ${answer.heal} vitality restored`:''].filter(Boolean);
 dialog.html(`<p>${esc(answer.text)}</p><div class="result-note">${parts.join(' · ')||'Your discovery is recorded.'}</div><p class="mini">You now have ${fmt(game.state.credits)} cr · Hold ${game.cargoUsed} / ${game.state.ship.cargoCap}</p>`);
 dialog.choices([{label:'Keep exploring',action:()=>dialog.close()}]);audio.play('pickup');
}
function dialogueHeader(e,text,context=e.conversation){
 const wrap=document.createElement('div');wrap.className='dialogue-intro';
 const portraitWrap=document.createElement('div');portraitWrap.className='portrait';
 const c=document.createElement('canvas');c.width=32;c.height=40;drawContactPortrait(c.getContext('2d'),e);portraitWrap.append(c);
 const words=document.createElement('div');words.className='dialogue-words';
 const activity=context?.activity||e.life?.label;
 words.innerHTML=`<div class="speaker-role">${esc(e.data?.roleLabel??e.role??'Local contact')}</div>${activity?`<span class="speaker-activity">${esc(activity)}</span>`:''}<p>${esc(text)}</p>${context?.relationship&&!['Stranger','Unacquainted'].includes(context.relationship)?`<span class="speaker-relationship">${esc(context.relationship)}</span>`:''}`;
 wrap.append(portraitWrap,words);dialog.body.append(wrap);
}
function resolveRole(e){const aliases={Shipwright:'mechanic',bartender:'refugee',trader:'merchant',settler:'governor',scientist:'archivist',courier:'pilot',survivor:'refugee','Field archivist':'archivist'};return DIALOGUE[e.role]?e.role:e.data?.dialogueRole??aliases[e.role]??(e.data?.story?'archivist':'refugee');}
async function openNPC(e,{ordinary=false}={}){
 const role=resolveRole(e),words=await speakTo(e,role);if(!words)return;
 processEvents();if(!ordinary&&openingUI.openContact(e))return;
 dialog.open(e.name,'npc',{eyebrow:surface?.name||'ON THE CONCOURSE'});dialogueHeader(e,words.greeting);
 const items=[];
 if(e.data?.story)items.push({label:'The old Earth signal',action:()=>storyConversation(e)});
 items.push({label:'Any news?',action:()=>{
  dialog.open(e.name,'npc',{eyebrow:surface?.name||'WORD ON THE DOCKS'});dialogueHeader(e,words.rumor||words.greeting);
  const available=game.availableEncounters('person');
  const preferred=e.data?.socialOnly||e.data?.techLevel==='preflight'?null:available.find(x=>x.tag==='CONSEQUENCE')??available.find(x=>x.conditions?.locationId===game.state.locationId);
  const replies=[];
  if(preferred)replies.push({label:'Tell me more',detail:preferred.title,action:async()=>{const r=await invoke('triggerEncounter',{id:preferred.id});if(result(r))openEncounter(r.encounter);}});
  if(!e.data?.socialOnly&&e.data?.techLevel!=='preflight'&&['dockworker','broker','merchant','pilot'].includes(role))replies.push({label:'Looking for work',action:openJobs});
  replies.push({label:'See you around',action:()=>dialog.close()});dialog.choices(replies);
 }});
 if(!e.data?.socialOnly&&e.data?.techLevel!=='preflight'&&['dockworker','broker','merchant','pilot'].includes(role))items.push({label:'Looking for work',action:openJobs});
 if(!e.data?.socialOnly&&e.data?.techLevel!=='preflight'&&['pilot','engineer','medic','archivist'].includes(role))items.push({label:'Join my crew?',action:()=>openCrew(e)});
 items.push({label:'See you around',action:()=>dialog.close()});dialog.choices(items);saveNow();
}
async function storyConversation(e){const chapter=game.chapter;const targeted=game.availableEncounters('person').find(x=>x.conditions?.locationId===game.state.locationId)??game.availableEncounters('person').find(x=>x.conditions?.systemId===game.state.systemId);if(targeted){const r=await invoke('triggerEncounter',{id:targeted.id});if(r.ok){openEncounter(r.encounter);return;}}dialog.open(e.name,'story',{eyebrow:'THE QUIET EARTH'});dialogueHeader(e,chapter?chapter.brief:'The old home is speaking again. Your log carries the choices that made that possible.');if(chapter){const p=document.createElement('div');p.className='guide-card';p.innerHTML=`<span class="eyebrow">${esc(chapter.title)}</span><p>${esc(chapter.objective)}</p>`;dialog.body.append(p);}const items=[];if(game.state.systemId==='vesper'&&game.hasFlag('first_fold_done')&&!game.hasFlag('archive_decoded')){items.push({label:'Help restore the archive array',detail:'Find and calibrate a maintenance relay in this station.',action:async()=>{surfaceTarget=surface.entities.find(x=>x.type==='work')?.id;dialog.close();toast('Find an amber maintenance relay. Its panel needs calibration.','good');}});}items.push({label:'Show the mission log',action:async()=>openJournal('missions')},{label:'I’ll keep looking',action:async()=>dialog.close()});dialog.choices(items);}
async function openTerminal(e){if(network){const r=await invoke('surfaceAction',{entityId:e.id,action:'read'});if(!result(r))return;}else game.recordActivity('explore',{token:e.id});if(e.data?.loreId&&LORE.some(l=>l.id===e.data.loreId)&&!game.state.knownLore.includes(e.data.loreId))game.state.knownLore.push(e.data.loreId);const targeted=game.availableEncounters('person').find(x=>x.conditions?.locationId===game.state.locationId);if(targeted&&(e.data?.story||['stillwater','earth','listening','ledger'].includes(game.state.locationId))){const r=await invoke('triggerEncounter',{id:targeted.id});if(r.ok){openEncounter(r.encounter);return;}}dialog.open(e.name,'archive',{eyebrow:'LOCAL ARCHIVE'});const lore=LORE.find(l=>l.id===e.data?.loreId);dialog.html(`<p>${esc(e.data?.localLore||e.text||game.currentBody?.lore||'The records of the people who made a life here.')}</p>${lore?`<h3>${esc(lore.title)}</h3><p>${esc(lore.text)}</p>`:''}`);dialog.choices([{label:'Open the collected archive',action:async()=>openJournal('lore')},{label:'Step away from the terminal',action:async()=>dialog.close()}]);processEvents();saveNow();}
function openEncounter(encounter){if(!encounter)return;dialog.open(encounter.title,'encounter',{eyebrow:(encounter.tag??'ENCOUNTER')+' / '+(game.state.mode==='ship'?'INCOMING TRANSMISSION':'A STORY IN PROGRESS')});dialog.html(`<p>${esc(encounter.text)}</p>`);dialog.choices(encounter.choices.map((c,i)=>({label:c.label,detail:[c.text,choiceCost(c.effects),game.rescueAdmissionCheck(encounter.id,c.id).reason].filter(Boolean).join(' · '),disabled:!game.choiceAvailable(encounter.id,i),action:async()=>{const r=await invoke('applyChoice',{encounterId:encounter.id,choice:i});if(!result(r))return;if(r.hostileContactId){dialog.close();audio.play('alert');saveNow();return;}dialog.open(encounter.title,'result',{eyebrow:'A CHOICE REMEMBERED'});dialog.html(`<p>${esc(r.text)}</p><div class="result-note">${effectSummary(c.effects)||'Your decision has been recorded in your captain’s log.'}</div>`);dialog.choices([{label:game.hasFlag('earth_decision')?'Keep exploring':'Continue your voyage',action:async()=>dialog.close()}]);audio.play('quest');saveNow();}})));}
function effectSummary(fx={}){const parts=[];if(fx.credits)parts.push(`${fx.credits>0?'+':''}${fx.credits} credits`);if(fx.ore)parts.push(`${fx.ore>0?'+':''}${fx.ore} ore`);if(fx.fuel)parts.push(`${fx.fuel>0?'+':''}${fx.fuel} fuel`);for(const[id,n]of Object.entries(fx.rep??{}))parts.push(`${esc(FACTIONS.find(f=>f.id===id)?.name??id)} ${n>0?'+':''}${n}`);return parts.join(' · ');}
function canAfford(credits=0,ore=0){return game.state.credits>=credits&&game.state.cargo.ore>=ore;}
function costParts(credits=0,ore=0){
 const balance=game.state.credits,held=game.state.cargo.ore,short=[];
 if(balance<credits)short.push(`${fmt(credits-balance)} cr`);if(held<ore)short.push(`${ore-held} ore`);
 return {cost:`Cost ${fmt(credits)} cr${ore?` + ${ore} ore`:''}`,have:`You have ${fmt(balance)} cr${ore?` · ${held} ore`:''}`,after:short.length?`Need ${short.join(' + ')} more`:`After: ${fmt(balance-credits)} cr${ore?` · ${held-ore} ore`:''}`,affordable:!short.length};
}
function costDetail(credits=0,ore=0){const p=costParts(credits,ore);return `${p.cost} · ${p.have} · ${p.after}`;}
function costMarkup(credits=0,ore=0){const p=costParts(credits,ore);return `<span class="purchase-cost${p.affordable?'':' shortfall'}"><strong>${esc(p.cost)}</strong><span>${esc(p.have)}</span><small>${esc(p.after)}</small></span>`;}
function choiceCost(effects={}){
 const creditCost=Math.max(0,-(effects.credits||0)),oreCost=Math.max(0,-(effects.ore||0)),parts=[];
 if(creditCost||oreCost)parts.push(costDetail(creditCost,oreCost));
 if(effects.crystal<0)parts.push(`Cost ${-effects.crystal} crystal · You have ${game.state.cargo.crystal}`);
 if(effects.fuel<0)parts.push(`Cost ${-effects.fuel} fuel · You have ${Math.floor(game.state.ship.fuel)}`);
 return parts.join(' · ');
}
function openJobs(){if(game.state.mode!=='person'){openJournal('missions');return;}dialog.open('The contract exchange','jobs',{eyebrow:(game.currentBody?.name??surface?.name??'PORT')+' / '+fmt(game.state.credits)+' CR'});dialog.html('<p class="section-note">Take a job. Return for your pay.</p>');notebookShortcuts(dialog.body);const active=game.state.missions.filter(m=>m.status!=='completed');if(active.length){const h=document.createElement('h3');h.textContent='Your active contracts';dialog.body.append(h);for(const job of active)jobCard(job,true);}const h=document.createElement('h3');h.textContent='Work available here';dialog.body.append(h);const jobs=game.availableJobs().filter(j=>j.status==='available');if(!jobs.length){const p=document.createElement('p');p.textContent='You have taken the current offers. Other ports have their own exchange.';dialog.body.append(p);}for(const job of jobs)jobCard(job,false);const note=document.createElement('p');note.className='mini muted';note.textContent='Dockside freight and survey samples also pay.';dialog.body.append(note);}
function jobCard(job,active){const card=document.createElement('div');card.className='entry-card';const target=game.galaxy.find(s=>s.id===job.targetSystem)?.bodies.find(b=>b.id===job.targetBody);card.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(job.title)}</span><span class="entry-meta">${fmt(job.reward)} CR</span></div><p>${esc(job.description)}</p><div class="entry-foot"><span class="mini muted">${esc(target?.name??job.targetBody)}${active?` · ${job.progress} / ${job.goal}`:''}</span><div class="job-actions"></div></div>`;const actions=card.querySelector('.job-actions');if(active){const ready=job.status==='ready'&&game.state.locationId===job.targetBody&&game.state.systemId===job.targetSystem;if(ready){const b=document.createElement('button');b.textContent='Collect payment';b.onclick=async()=>{if(result(await invoke('turnInJob',{id:job.id}))){audio.play('quest');openJobs();}};actions.append(b);}else{const b=document.createElement('button');b.textContent=job.status==='ready'?'Track destination':'Track work';b.onclick=async()=>{dialog.close();trackJob(job);};actions.append(b);}}else{const b=document.createElement('button');b.textContent='Take contract';b.onclick=async()=>{if(result(await invoke('acceptJob',{id:job.id}))){trackJob(job);dialog.close();toast(job.type==='work'?'Find the three amber relays. Calibrate each one, then return to the contract exchange.':job.description,'good',6500);}};actions.append(b);}dialog.body.append(card);}
let ambientMemory=null,ambientRoom='',ambientCue=null;
let trackedThreadId=null,narrativeWaypoint=null,narrativeMarkerKey='',openingMarkerKey='',dutyMarkerKey='';
function notebookShortcuts(root){
 const row=document.createElement('div');row.className='journal-shortcuts';
 for(const [label,action] of [['Stories & favors',()=>narrativeUI.openBoard()],['Passenger fares',()=>trackNarrativeTarget({systemId:game.state.systemId,bodyId:game.state.locationId,entityId:'quest:passage-desk:'+game.state.locationId})],['Professions & events',()=>narrativeUI.openProfessions()]]){const button=document.createElement('button');button.textContent=label;button.onclick=action;row.append(button);}root.append(row);
}
function narrativeNavigation(){
 if(!trackedThreadId)return null;
 if(trackedThreadId==='@profession'){const active=game.professionBoard().active;return Array.isArray(active)?active[0]:active;}
 if(trackedThreadId==='@passenger'){const fare=game.state.narrative?.passenger;return fare?{id:'@passenger',title:fare.name,objective:'Deliver your passenger to the passage desk at '+fare.targetName,target:{systemId:fare.targetSystem,bodyId:fare.targetBody,entityId:fare.targetEntityId}}:null;}
 const data=game.narrativeBoard();return [...data.active,...data.available].find(view=>view.id===trackedThreadId)||null;
}
function markLivelihoodTarget(target={},{quiet=false}={}){
 ensureSurface(false);const role=({weapons:'security',scanner:'navigation'})[target.stationRole]||target.stationRole;
 const e=surface?.entities.find(e=>target.entityId?e.id===target.entityId:target.sectionId?e.type==='damageControl'&&e.data?.sectionId===target.sectionId:target.crewId?e.data?.crewId===target.crewId:role?e.data?.stationRole===role:target.type?e.type===target.type:false);
 if(e){surfaceTarget=e.id;if(!quiet)toast(e.name+' marked.');}else if(!quiet)toast('Open Crew duty for your next task.');
}
function markNarrativeTarget(target){
 if(!target)return;
 narrativeWaypoint=null;
 if(game.state.systemId!==target.systemId){if(surface)surfaceTarget=surface.entities.find(e=>['exit','siteExit'].includes(e.type))?.id;return;}
 if(game.state.mode==='ship'){
  if(target.enemyId)tracked=target.enemyId;
  else if(Number.isFinite(target.x)&&Number.isFinite(target.y)){tracked='narrative-waypoint';narrativeWaypoint={id:tracked,name:target.label||'Reading point',x:target.x,y:target.y,radius:15};}
  else if(target.bodyId)tracked=target.bodyId;
  return;
 }
 const bodyId=game.state.exploration?.bodyId||game.state.locationId;
 if(bodyId===target.bodyId&&surface){
  const matching=surface.entities.find(e=>e.id===target.entityId);
  const entry=target.siteId&&surface.entities.find(e=>e.type==='siteEntrance'&&e.data?.siteId===target.siteId);
  surfaceTarget=matching?.id||entry?.id||surface.entities.find(e=>e.type==='siteExit')?.id||null;
 }else if(surface)surfaceTarget=surface.entities.find(e=>['exit','siteExit'].includes(e.type))?.id;
}
function markOpeningTarget(target){
 if(!target)return;
 // Contact and panel coordinates are inside the port, not positions in space.
 const {x,y,...portTarget}=target;
 markNarrativeTarget(target.bodyId?portTarget:target);
}
function trackNarrativeTarget(target,id=null){
 trackedThreadId=id;narrativeMarkerKey='';dialog.close();markNarrativeTarget(target);
 if(target?.systemId&&target.systemId!==game.state.systemId){openMap(target.systemId);return;}
 toast(game.state.mode==='person'?'Destination marked on your local map. Follow the marker; return to your ship for another port.':'Destination marked. Follow its bearing in ship mode.','info',4500);updateHUD();
}
function trackJob(job){if(game.state.systemId!==job.targetSystem){openMap(job.targetSystem);return;}if(job.type==='work'&&surface&&job.targetBody===game.state.locationId){const next=surface.entities.find(e=>e.type==='work'&&!game.state.activityTokens.some(t=>t.endsWith(':work:'+e.id+':'+job.id)));surfaceTarget=next?.id??surface.entities.find(e=>e.type==='jobboard')?.id;toast(next?'Maintenance relay marked on your local map.':'Return to the contract exchange.');}else if(job.type==='delivery'||job.type==='work'||job.status==='ready'){tracked=job.targetBody;if(game.state.mode==='person'&&job.targetBody!==game.state.locationId)toast(game.ownsShip?'Return to your ship and fly to the marked destination.':'Use Port services to buy passage to the marked destination.');}else if(job.type==='mining'){const a=game.system.asteroids.find(a=>a.hp>0);tracked=a?.id;toast('Mining belt tracked. Launch, move near a rock, then hold MINE.');}else if(job.type==='survey'){tracked=game.system.signals.find(s=>!s.resolved)?.id;toast('A signal is tracked. Approach it and use SCAN.');}else if(job.type==='bounty'){tracked=game.system.enemies[0]?.id;toast('Hostile contact tracked. Use your shield, keep moving, and watch the reactor.');}}
function shipPreview(c,classId,size=108){c.width=128;c.height=128;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#091423';g.fillRect(0,0,128,128);g.strokeStyle='#203a4e';for(let n=0;n<128;n+=16){g.beginPath();g.moveTo(n,0);g.lineTo(n,128);g.moveTo(0,n);g.lineTo(128,n);g.stroke();}drawShip(g,64,64,-.4,'#c3d0c7',1,false,0,false,{classId,size});}

function openOutfitter(e=null,tab='equipment'){if(!game.ownsShip&&tab==='equipment')tab='ships';if(testSession){openTestControls();return;}if(!game.atInhabitedPort){toast('This place has no shipyard. Visit an inhabited port.');return;}
 dialog.open(game.state.locationId==='kettle'?'Iona’s shipyard':'Local shipyard','outfitter',{eyebrow:`${game.currentBody?.name??'PORT'} / ${fmt(game.state.credits)} CR · ${game.state.cargo.ore} ORE`});
 const tabs=document.createElement('div');tabs.className='panel-tabs';for(const[key,label]of [['equipment','Equipment'],['ships','New hulls'],['service','Repairs & trade']]){const b=document.createElement('button');b.className=tab===key?'active':'';b.textContent=label;b.onclick=()=>openOutfitter(null,key);tabs.append(b);}dialog.body.append(tabs);
 if(e)dialogueHeader(e,e.conversation?.greeting||e.text||DIALOGUE.mechanic.greeting);
 if(tab==='service'){dialog.html('<p>Keep enough ore for your next upgrade. The port’s prices reflect your standing with its faction.</p>');dialog.choices([{label:'Open cargo & services',action:openMarket},{label:'Back to equipment',action:()=>openOutfitter()}]);return;}
 if(tab==='ships'){dialog.body.insertAdjacentHTML('beforeend','<p class="section-note">Your next hull should suit the work you want to do. Larger ships bring roomier decks and more inertia. Other designs become available as your voyage progresses.</p>');for(const c of SHIP_CLASSES){const info=game.classInfo(c.id);if(!info.owned&&!STARTER_SHIP_IDS.includes(c.id)&&['prerequisite','story'].includes(info.code))continue;const card=document.createElement('article');card.className='entry-card'+(info.active?' done':'');card.innerHTML=`<div class="ship-profile"><canvas aria-label="${esc(c.name)} silhouette"></canvas><div><span class="eyebrow">${esc(c.subtitle)}</span><h3>${esc(c.name)}</h3><p>${c.berths} berths · ${c.stats.cargoCap} cargo<br>${c.stats.maxHull} hull · ${c.stats.mass}× mass</p></div></div><p>${esc(c.description)}</p>${hullSystemMarkup(c.id)}<div class="entry-foot">${info.owned?'<span class="cost">OWNED</span>':costMarkup(info.cost??c.cost,info.ore??c.ore)}<button ${!info.ok?'disabled':''}>${info.active?'Current vessel':info.owned?'Activate this hull':info.used?'Buy used starter':'Commission vessel'}</button></div>${!info.ok&&!info.active?`<p class="mini muted" style="margin-bottom:0">${esc(info.reason)}</p>`:''}`;shipPreview(card.querySelector('canvas'),c.id);card.querySelector('button').onclick=async()=>{if(result(await invoke(info.owned?'selectShip':'buyShip',{id:c.id}))){surfaceKey='';audio.play('quest');openOutfitter(null,'ships');}};dialog.body.append(card);}return;}
 dialog.body.insertAdjacentHTML('beforeend',`<p class="section-note">${esc(getShipClass(game.state.ship.classId).name)} · Fit vector thrusters and an echo scanner before the first fold drive. Installed equipment travels with you when you commission a new hull.</p>`);
 for(const u of UPGRADES){const info=game.upgradeInfo(u.id),owned=!!game.state.upgrades[u.id],card=document.createElement('div');card.className='entry-card'+(owned?' done':'');card.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(u.name)}</span><span class="pill">${esc(u.slot)}</span></div><p>${esc(u.description)}</p><div class="entry-foot">${owned?'<span class="cost">INSTALLED</span>':costMarkup(u.cost,u.ore??0)}<button ${!info.ok?'disabled':''}>${owned?'Installed':info.code==='prerequisite'?'Parts required':'Install upgrade'}</button></div>${!owned&&!info.ok?`<p class="mini muted" style="margin-bottom:0">${esc(info.reason)}</p>`:''}`;card.querySelector('button').onclick=async()=>{if(result(await invoke('buyUpgrade',{id:u.id}))){audio.play('quest');openOutfitter();}};dialog.body.append(card);}
}
function openMarket(){dialog.open('Cargo & port services','market',{eyebrow:(game.currentBody?.name??'PORT')+' / '+fmt(game.state.credits)+' CREDITS'});dialog.html(`<div class="stat-grid"><div class="stat-cell"><small>ORE</small><strong>${game.state.cargo.ore}</strong></div><div class="stat-cell"><small>CRYSTAL</small><strong>${game.state.cargo.crystal}</strong></div><div class="stat-cell"><small>HOLD USED</small><strong>${game.cargoUsed}/${game.state.ship.cargoCap}</strong></div></div><p>Ore is also used for ship upgrades and mining contracts. Local prices reflect your reputation with the port’s faction.</p>`);const items=[];for(const key of ['sellOre','sellCrystal','refuel','repair','emergency']){const q=game.serviceQuote(key);items.push({label:key==='sellOre'?`Sell all ore · ${q.value} cr`:key==='sellCrystal'?`Sell all crystal · ${q.value} cr`:q.label+(q.cost?` · ${q.cost} cr`:''),detail:key==='emergency'?`Cost 0 cr · You have ${fmt(game.state.credits)} cr. Enough fuel to leave, in exchange for Freewake standing.`:key.startsWith('sell')?`Sell ${q.ore||q.crystal} ${key==='sellOre'?'ore':'crystal'} from your hold. You have ${fmt(game.state.credits)} cr · After: ${fmt(game.state.credits+q.value)} cr`:costDetail(q.cost),disabled:key.startsWith('sell')?!q.value:key==='emergency'?game.state.credits>=24||game.state.ship.fuel>=10:!q.cost||q.cost>game.state.credits,action:async()=>{if(result(await invoke('service',{action:key})))openMarket();}});}items.push({label:'Back to the outfitter',action:async()=>openOutfitter()});dialog.choices(items);}
async function openMedic(e){if(game.state.interior){dialog.open('Medical station','medical-console',{eyebrow:'CINDER / VITAL SIGNS'});dialog.html(`<p>Your vitality is ${Math.round(game.state.person.health)} / ${game.state.person.maxHealth||100}. Visit a port infirmary for medical treatment.</p>`);dialog.choices([{label:'Review the crew manifest',action:async()=>openCrew()},{label:'Step away',action:async()=>dialog.close()}]);return;}const words=await speakTo(e,'medic');if(!words)return;dialog.open(e.name,'medic',{eyebrow:'INFIRMARY'});dialogueHeader(e,words.greeting);const q=game.serviceQuote('rest');dialog.choices([{label:q.cost?`Treatment · ${q.cost} credits`:'You are in good health',detail:`Vitality ${Math.ceil(game.state.person.health)} / ${game.state.person.maxHealth||100} · ${costDetail(q.cost)}`,disabled:!q.cost||game.state.credits<q.cost,action:async()=>{if(result(await invoke('service',{action:'rest'})))dialog.close();}},{label:'Ask about this place',action:async()=>openNPC({...e,role:'medic'})},{label:'Thanks, doctor',action:async()=>dialog.close()}]);}
function openRepair(e){const token=currentWorkToken(e),already=game.state.activityTokens.some(t=>t.endsWith(':work:'+token));if(already){toast('This relay is calibrated. Look for the next amber panel.');const next=surface.entities.find(x=>x.type==='work'&&!game.state.activityTokens.some(t=>t.endsWith(':work:'+currentWorkToken(x))));surfaceTarget=next?.id??surface.entities.find(x=>x.type==='jobboard')?.id;return;}
 dialog.open(e.name,'repair',{eyebrow:'MAINTENANCE / ALIGN THE CONDUCTORS'});const rng=seededRandom(e.id),target=Array.from({length:3},()=>Math.floor(rng()*4)),values=target.map((v,i)=>(v+i+1)%4);dialog.html('<p>The power route is broken. Rotate each conductor until its arrow matches the faint reference above it, then reconnect the relay.</p><div id="circuit" class="circuit-grid"></div><div id="circuitMessage" class="mini muted">A safe calibration can be retried.</div><div class="dialogue-actions"><button id="checkCircuit" class="button-primary">Reconnect relay</button><button id="leaveCircuit">Leave the panel</button></div>');const grid=$('circuit');const arrows=['↑','→','↓','←'];const draw=()=>{grid.replaceChildren();values.forEach((v,i)=>{const b=document.createElement('button');b.className='circuit-knob';b.innerHTML=`<small>LINE ${i+1} <span>${arrows[target[i]]}</span></small><strong>${arrows[v]}</strong><em>${v===target[i]?'ALIGNED':'ROTATE'}</em>`;b.setAttribute('aria-label',`Conductor ${i+1}, points ${['up','right','down','left'][v]}, target ${['up','right','down','left'][target[i]]}`);b.onclick=async()=>{values[i]=(values[i]+1)%4;audio.play('click');draw();};grid.append(b);});};draw();$('leaveCircuit').onclick=async()=>dialog.close();$('checkCircuit').onclick=async()=>{if(!values.every((v,i)=>v===target[i])){$('circuitMessage').textContent='The route is still broken. Match all three reference arrows.';audio.play('alert');return;}let r;if(network){r=await invoke('surfaceAction',{entityId:e.id,action:'repair',solution:values});if(!result(r))return;}else{r=game.recordActivity('work',{token,role:game.state.locationId==='listening'?'archive':e.data?.workType??'repair',kind:'repair'});if(r.first){game.state.credits+=12;flag(e.data?.flag??'done:'+e.id);recordGuide('work','work:'+token);}}surfaceTarget=surface.entities.find(x=>x.type==='work'&&!game.state.activityTokens.some(t=>t.endsWith(':work:'+currentWorkToken(x))))?.id??surface.entities.find(x=>x.type==='jobboard')?.id;openingMarkerKey='';dialog.close();audio.play('quest');toast('Relay calibrated · +12 cr. The local grid is steadier.','good');processEvents();saveNow();};}
function openShip(){if(!testSession&&game.state.npcContract?.active){livelihoodUI.openDuty();return;}if(!testSession&&!game.ownsShip){livelihoodUI.openPort();return;}if(testSession){openTestControls();return;}if(!network&&game.state.interior?.kind==='enemy'){openDamageOverview();return;}const s=game.state,sh=s.ship,c=getShipClass(sh.classId);dialog.open(sh.name??'Cinder','ship',{eyebrow:`${c.name.toUpperCase()} / ${c.subtitle.toUpperCase()}`});dialog.html(`<div class="ship-profile"><canvas id="shipPortrait" aria-label="Your ship"></canvas><div><h3>${esc(c.name)}</h3><p>${c.berths} berths · ${c.stats.mass}× mass<br>${esc(c.description)}</p></div></div><div class="stat-grid"><div class="stat-cell"><small>HULL</small><strong>${Math.ceil(sh.hull)}<span class="mini muted"> / ${sh.maxHull}</span></strong></div><div class="stat-cell"><small>JUMP RANGE</small><strong>${sh.warpRange}<span class="mini muted"> ly</span></strong></div><div class="stat-cell"><small>CREDITS</small><strong>${fmt(s.credits)}</strong></div></div><h3>In the hold</h3><p>${s.cargo.ore} ore · ${s.cargo.crystal} crystal · ${game.cargoUsed} / ${sh.cargoCap} capacity<br>Fuel ${Math.ceil(sh.fuel)} / ${sh.maxFuel} · Shield ${Math.ceil(sh.shield)} / ${sh.maxShield}</p>${hullSystemMarkup(c.id)}<h3>Installed equipment</h3><p>${Object.keys(s.upgrades).length?UPGRADES.filter(u=>s.upgrades[u.id]).map(u=>esc(u.name)).join(' · '):'Utility thrusters, pulse emitter, mining beam, harbor shield. No fold drive installed.'}</p>`);shipPreview($('shipPortrait'),c.id);
 const items=[{label:'Your captain',detail:'Appearance and the traits that shape your voyage.',action:openCaptainProfile},{label:'Walk the crew deck',detail:`${c.berths} berths, a helm, engineering, medical, navigation, and security.`,disabled:s.mode!=='ship',action:enterCabin},{label:'Crew & alliances',detail:`${game.livingCrew.length} specialists aboard · ${game.freeBerths} free berths.`,action:()=>openCrew()},{label:'Shipyard & upgrades',detail:game.atInhabitedPort?'Inspect equipment and earn larger hulls.':'Dock at an inhabited port to commission equipment.',disabled:!game.atInhabitedPort,action:()=>openOutfitter()},{label:'Home berth',detail:'Your place to return to in a shared galaxy.',action:openHome}];
 items.unshift({label:'Port services & paid work',detail:'Passenger passage, local work, and employment aboard NPC ships.',action:()=>livelihoodUI.openPort()});
 items.unshift({label:'Damage control',detail:damageStatus(currentDamageHull())||'Compartment condition, fires, and hull breaches.',action:openDamageOverview});
 if(network)items.push({label:'Shared ship controls',detail:'Crew permissions, assigned stations, and other captains.',action:openSharedShip});
 if(s.boarding?.phase==='active'){items.unshift({label:'Boarding in progress',detail:`${s.boarding.enemies.filter(e=>e.health>0).length} hostiles aboard. Hold FIRE on foot to fight.`,action:()=>dialog.close()});if(s.boarding.kind==='assault')items.push({label:'Retreat through the airlock',detail:'Reach your boarding entry to withdraw. Crew left behind may be lost.',action:async()=>{if(result(await invoke('retreatBoarding')))dialog.close();}});}
 items.push({label:'Back to the world',action:()=>dialog.close()});dialog.choices(items);
}
const crewOffers=[{id:'anik',name:'Anik Sol',role:'engineer',cost:160,color:'#d8b878',description:'Keeps the frame sound. +10 maximum hull.'},{id:'jules',name:'Jules Aster',role:'navigator',cost:140,color:'#88bbb7',description:'Sees the signal beneath the noise. +45 scanner range.'},{id:'tavi',name:'Tavi Sen',role:'medic',cost:150,color:'#acb8d6',description:'Maintains the crew and reactor routines. +10 reactor capacity.'}];
function openCrew(e=null){if(game.state.npcContract?.active){livelihoodUI.openDuty();return;}if(testSession){openTestControls();return;}const guests=game.state.interior?.kind==='ship'?(game.currentBody?.guests??rescueOccupants(game.state.ship)):rescueOccupants(game.state.ship);dialog.open('The people aboard','crew',{eyebrow:`${game.livingCrew.length} SPECIALISTS · ${guests.length} RESCUED · ${game.freeBerths} FREE BERTHS`});if(e)dialogueHeader(e,e.text||'Every berth is a promise to bring someone back.');
 if(network)dialog.choices([{label:'Friends & boarding permissions',detail:'See who is piloting, allow friends aboard, and manage their helm access.',action:openOnline}]);
 if(guests.length){dialog.body.insertAdjacentHTML('beforeend','<h3>Rescued passengers</h3><p>These people are aboard this hull. Dock at an inhabited port to bring them ashore.</p>');for(const guest of guests){const row=document.createElement('div');row.className='entry-card';row.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(guest.name)}</span><span class="pill">${guest.status==='hostile'?'HOSTILE':'PASSENGER'}</span></div><p>${esc(guest.origin||'Rescued passenger')} · Health ${Math.ceil(guest.health)} / ${guest.maxHealth}</p>`;dialog.body.append(row);}}
 if(!game.livingCrew.length)dialog.body.insertAdjacentHTML('beforeend','<p>Your specialist bunks are empty. Hire crew in an inhabited port. Human crew and specialists share the same berth capacity.</p>');
 for(const c of game.livingCrew){const role=CREW_ROLES[c.role]??{},row=document.createElement('div');row.className='entry-card';row.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(c.name)}</span><span class="pill">${esc(role.name??c.role)}</span></div><p>${esc(role.description??'A member of your crew.')}<br><strong>Health ${Math.ceil(c.health)} / ${c.maxHealth}</strong></p><div class="entry-foot"><span class="mini muted">${esc(c.status??'active')}</span><button ${game.state.mode!=='person'||game.state.interior?'disabled':''}>Release at this port</button></div>`;row.querySelector('button').onclick=async()=>{dialog.open('Release this crewmate?','crew-release',{eyebrow:'CREW MANIFEST'});dialog.html(`<p>${esc(c.name)} will leave your crew at this port. Their berth becomes available to another specialist or human captain.</p>`);dialog.choices([{label:'Keep them aboard',action:()=>openCrew()},{label:'Release crewmate',action:async()=>{if(result(await invoke('dismissCrew',{crewId:c.id})))openCrew();}}]);};dialog.body.append(row);}
 dialog.body.insertAdjacentHTML('beforeend','<h3>Hire a specialist</h3>');
 for(const[role,offer]of Object.entries(CREW_ROLES)){const hired=game.livingCrew.some(c=>c.role===role),card=document.createElement('div');card.className='entry-card';card.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(offer.name)}</span><span class="entry-meta">${offer.cost} CR</span></div><p>${esc(offer.description)}</p>${hired?'':costMarkup(offer.cost)}<button ${hired||!game.freeBerths||!game.atInhabitedPort||game.state.credits<offer.cost?'disabled':''}>${hired?'Specialist aboard':game.freeBerths?'Hire '+esc(offer.name.toLowerCase()):'No free berth'}</button>`;card.querySelector('button').onclick=async()=>{if(result(await invoke('recruitCrew',{role}))){surfaceKey='';ensureSurface();audio.play('quest');openCrew();}};dialog.body.append(card);}
 if(game.state.memorial?.length){dialog.body.insertAdjacentHTML('beforeend','<h3>Remembered crew</h3>');for(const c of game.state.memorial){const p=document.createElement('p');p.className='danger-note';p.textContent=`${c.name} · ${c.role} · ${c.cause??'Lost during boarding'}`;dialog.body.append(p);}}
 dialog.body.insertAdjacentHTML('beforeend','<h3>Your place in the galaxy</h3>');for(const f of FACTIONS){const rep=game.state.rep[f.id]??0,row=document.createElement('div');row.className='reputation-row';row.innerHTML=`<div class="rep-name"><strong style="color:${f.color}">${esc(f.name)}</strong><small>${esc(rep>=25?'Trusted ally':rep<=-20?'Unwelcome':rep>0?'Known favorably':rep<0?'Under suspicion':'An unfamiliar face')}</small></div><div class="rep-bar"><i style="width:${(rep+100)/2}%;background:${f.color}"></i></div><span class="rep-num">${rep>0?'+':''}${rep}</span>`;dialog.body.append(row);}
}
function openJournal(tab='stories'){if(testSession){openTestControls();return;}if(['stories','people','factions'].includes(tab)){narrativeUI.openBoard(tab);return;}if(tab==='professions'){narrativeUI.openProfessions();return;}dialog.open(tab==='lore'?'The collected archive':'Captain’s journal','journal',{eyebrow:'CINDER / '+fmt(game.state.stats.jumps)+' JUMPS · '+game.state.stats.jobs+' CONTRACTS'});const tabs=document.createElement('div');tabs.className='panel-tabs';for(const[key,label]of [['stories','Stories'],['missions','Missions'],['log','Voyage log'],['lore','Archive'],['factions','Factions'],['professions','Work & service']]){const b=document.createElement('button');b.className=key===tab?'active':'';b.textContent=label;b.onclick=async()=>openJournal(key);tabs.append(b);}dialog.body.append(tabs);
 if(tab==='missions'){openingUI.appendEntry(dialog.body);const chapter=game.chapter;if(chapter){const card=document.createElement('div');card.className='entry-card';card.innerHTML=`<span class="eyebrow">THE QUIET EARTH / MAIN STORY</span><h3 style="margin-top:8px">${esc(chapter.title)}</h3><p>${esc(chapter.brief)}</p><div class="guide-card"><strong>${esc(chapter.objective)}</strong></div><button>Track this chapter</button>`;card.querySelector('button').onclick=async()=>{if(chapter.targetSystem!==game.state.systemId){openMap(chapter.targetSystem);return;}tracked=chapter.targetSignal??chapter.targetBody??game.system.bodies[0]?.id;if(surface)surfaceTarget=surface.entities.find(e=>e.data?.story)?.id;dialog.close();toast('Chapter destination tracked.');};dialog.body.append(card);}else{dialog.body.insertAdjacentHTML('beforeend','<div class="result-note">Earth is speaking again. Your choices are in the voyage log, and the galaxy is still open to you.</div>');}dialog.body.insertAdjacentHTML('beforeend','<h3>Active contracts</h3>');const active=game.state.missions.filter(m=>m.status!=='completed');if(!active.length)dialog.body.insertAdjacentHTML('beforeend','<p>No active contracts. Visit the exchange on a station or settlement to find work.</p>');for(const m of active){const card=document.createElement('div');card.className='entry-card';card.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(m.title)}</span><span class="entry-meta">${m.progress}/${m.goal} · ${m.reward} cr</span></div><p>${esc(m.description)}</p><div class="entry-foot"><button data-track>Track</button><button data-abandon class="muted">Abandon</button></div>`;card.querySelector('[data-track]').onclick=async()=>{dialog.close();trackJob(m);};card.querySelector('[data-abandon]').onclick=async()=>{dialog.open('Abandon this contract?','confirm',{eyebrow:'CONTRACT EXCHANGE'});dialog.html(`<p>${esc(m.title)} will be removed. The issuing faction will remember the broken commitment (−2 reputation).</p>`);dialog.choices([{label:'Keep the contract',action:async()=>openJournal('missions')},{label:'Abandon the contract',warning:true,action:async()=>{if(result(await invoke('abandonJob',{id:m.id})))openJournal('missions');}}]);};dialog.body.append(card);}dialog.body.insertAdjacentHTML('beforeend',`<p class="mini muted">${game.state.completedChapters.length} / ${STORY_CHAPTERS.length} story chapters completed · ${game.state.visited.filter(x=>!x.includes('/')).length} systems visited</p>`);}
 if(tab==='log'){if(!game.state.journal.length)dialog.body.insertAdjacentHTML('beforeend','<p>Your first entry is waiting to be written.</p>');for(const e of game.state.journal){const row=document.createElement('div');row.className='log-entry';row.innerHTML=`<small>SHIPTIME ${Math.floor((e.time??0)/60)}:${String((e.time??0)%60).padStart(2,'0')} · ${esc(e.type??'LOG')}</small><p><strong>${esc(e.title)}</strong><br>${esc(e.text).replaceAll('\n','<br>')}</p>`;dialog.body.append(row);}}
 if(tab==='lore'){const known=LORE.filter(l=>game.state.knownLore.includes(l.id)||l.id==='quiet_earth'||l.id==='sparrow');dialog.body.insertAdjacentHTML('beforeend',`<p class="mini muted">${known.length} / ${LORE.length} records found. Talk to people, read local archives, and investigate signals to find more.</p>`);for(const l of known){const row=document.createElement('article');row.className='lore-entry';row.innerHTML=`<h3>${esc(l.title)}</h3><p>${esc(l.text)}</p>`;dialog.body.append(row);}}
 if(tab==='factions'){for(const f of FACTIONS){const row=document.createElement('article');row.className='entry-card';row.innerHTML=`<div class="entry-top"><span class="entry-title" style="color:${f.color}">${esc(f.name)}</span><span class="entry-meta">${(game.state.rep[f.id]??0)>0?'+':''}${game.state.rep[f.id]??0} standing</span></div><p>${esc(f.philosophy)}</p><p class="mini muted">${esc(f.tension)}</p>`;dialog.body.append(row);}}
}
function openMap(selectId=game.state.systemId,tab='galaxy'){if(testSession){dialog.open('Test range chart','test-map',{eyebrow:'ISOLATED PRACTICE'});openLocalMapContent();return;}dialog.open(tab==='local'?'Local chart':'The known sky','map',{eyebrow:'NAVIGATION / '+game.galaxy.length+' STAR SYSTEMS',wide:true});const tabs=document.createElement('div');tabs.className='panel-tabs';for(const [key,label]of [['galaxy','Galaxy'],['local',game.state.mode==='person'?'This place':'Local system']]){const b=document.createElement('button');b.className=tab===key?'active':'';b.textContent=label;b.onclick=async()=>openMap(selectId,key);tabs.append(b);}dialog.body.append(tabs);if(tab==='local'){openLocalMapContent();return;}
 dialog.body.insertAdjacentHTML('beforeend','<input class="map-search" id="mapSearch" placeholder="Find a star system…" aria-label="Find a star system"><div class="galaxy-layout"><div><div class="galaxy-canvas-wrap"><canvas id="galaxyCanvas" aria-label="Interactive galaxy chart. Tap a star to inspect, drag to pan."></canvas><div class="map-scale">DRAG TO PAN · SELECT A STAR</div><div class="map-toolbar"><button id="zoomOut" aria-label="Zoom out">−</button><button id="mapHome">HOME</button><button id="zoomIn" aria-label="Zoom in">+</button></div></div><div class="map-legend" id="mapLegend"></div></div><div class="system-info" id="systemInfo"></div></div><div id="nearbyStars" class="system-nearby"></div>');const gc=$('galaxyCanvas'),g=gc.getContext('2d'),home=game.currentSystem;let selected=game.galaxy.find(s=>s.id===selectId)??home,center={x:home.gx,y:home.gy},scale=9,pan=null;const known=new Set(game.state.visited);
 $('mapLegend').innerHTML=FACTIONS.map(f=>`<span><i style="background:${f.color}"></i>${esc(f.short)}</span>`).join('');
 const size=()=>{const r=gc.getBoundingClientRect();gc.width=Math.round(r.width*Math.min(3,window.devicePixelRatio||1));gc.height=Math.round(r.height*Math.min(3,window.devicePixelRatio||1));return{w:r.width,h:r.height,ratio:gc.width/r.width};};
 const draw=()=>{if(!gc.isConnected)return;const{w,h,ratio}=size();g.setTransform(ratio,0,0,ratio,0,0);g.fillStyle='#07131e';g.fillRect(0,0,w,h);const to=s=>({x:w/2+(s.gx-center.x)*scale,y:h/2+(s.gy-center.y)*scale});const rr=seededRandom(846);for(let i=0;i<200;i++){g.fillStyle=i%5?'#273e50':'#576d79';g.fillRect(rr()*w,rr()*h,1,1);}g.strokeStyle='#24435355';g.lineWidth=.5;for(let i=-50;i<=50;i+=5){let x=w/2+(i-center.x)*scale,y=h/2+(i-center.y)*scale;g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
 const hp=to(home);if(game.state.ship.warpRange>0){g.fillStyle='#67aa8b0c';g.strokeStyle='#6aaf9488';g.setLineDash([3,5]);g.beginPath();g.arc(hp.x,hp.y,game.state.ship.warpRange*scale,0,Math.PI*2);g.fill();g.stroke();g.setLineDash([]);}const nearby=game.galaxy.filter(s=>Math.hypot(s.gx-home.gx,s.gy-home.gy)<Math.max(5,game.state.ship.warpRange));g.strokeStyle='#6a9f8240';for(const s of nearby){const p=to(s);g.beginPath();g.moveTo(hp.x,hp.y);g.lineTo(p.x,p.y);g.stroke();}
 for(const s of game.galaxy){const p=to(s);if(p.x<-10||p.x>w+10||p.y<-10||p.y>h+10)continue;const f=FACTIONS.find(f=>f.id===s.faction),isSelected=s.id===selected.id,isCurrent=s.id===home.id;g.fillStyle=f?.color??'#aac5b4';g.globalAlpha=s.authored||known.has(s.id)?1:.55;const radius=isCurrent?4:s.authored?3:2;g.fillRect(Math.round(p.x)-radius/2,Math.round(p.y)-radius/2,radius,radius);g.globalAlpha=1;if(isSelected){g.strokeStyle='#eed9a3';g.strokeRect(p.x-7,p.y-7,14,14);}if(isCurrent){g.strokeStyle='#a8c8bd';g.beginPath();g.arc(p.x,p.y,10,0,Math.PI*2);g.stroke();}if((s.authored&&scale>7)||isSelected||isCurrent){g.font=`${12*settings.textScale}px Verdana,sans-serif`;g.fillStyle=isSelected?'#eddaa6':s.authored?'#adc0c6':'#78939e';g.textAlign='left';g.fillText(s.name,p.x+10,p.y+3);}}
 if(selected.id!==home.id){const p=to(selected);g.strokeStyle='#e1c58c99';g.setLineDash([2,5]);g.beginPath();g.moveTo(hp.x,hp.y);g.lineTo(p.x,p.y);g.stroke();g.setLineDash([]);}};
 const info=()=>{const f=FACTIONS.find(f=>f.id===selected.faction),travel=game.travelInfo(selected.id),dist=Math.hypot(selected.gx-home.gx,selected.gy-home.gy);$('systemInfo').innerHTML=`<span class="eyebrow" style="color:${f?.color}">${esc(f?.name??'FRONTIER SPACE')}</span><h3>${esc(selected.name)}</h3><p>${esc(selected.description)}</p><div class="system-facts"><span>${dist.toFixed(1)} light-years away</span><span>Threat ${'◆'.repeat(selected.danger)}${'◇'.repeat(5-selected.danger)}</span><span>${selected.bodies.length} charted destinations</span><span>${known.has(selected.id)?'VISITED':'UNVISITED'}</span><span>Your range: ${game.state.ship.warpRange} ly</span><span>${travel.fuelCost??0} fuel to jump</span></div><button id="jumpButton" class="jump-button" ${travel.ok?'':'disabled'}>${travel.ok?'Engage fold drive →':selected.id===home.id?'Current system':game.hasHyperdrive?'Jump unavailable':'Fold drive not installed'}</button><p class="mini muted">${esc(travel.ok?'Land at a port to refuel, find work, and meet the people who live here.':travel.reason)}</p>`;$('jumpButton').onclick=async()=>{if(result(await invoke('travel',{id:selected.id}))){dialog.close();surface=null;surfaceKey='';tracked=game.system.bodies.find(b=>b.kind==='station')?.id??game.system.bodies[0]?.id;transitionFlash=1;renderer.lastSystem=null;audio.play('jump');processEvents();saveNow();setTimeout(async()=>{if(!dialog.opened){const arrival=game.availableEncounters().find(e=>e.id==='earth_arrival');if(arrival){const r=await invoke('triggerEncounter',{id:arrival.id});if(r.ok)openEncounter(r.encounter);}}},150);}};draw();};
 const local=game.galaxy.filter(s=>s.id!==home.id).sort((a,b)=>Math.hypot(a.gx-home.gx,a.gy-home.gy)-Math.hypot(b.gx-home.gx,b.gy-home.gy)).slice(0,7);$('nearbyStars').innerHTML='<span class="mini muted" style="padding:7px 0">NEARBY</span>';for(const s of local){const b=document.createElement('button');b.textContent=s.name;b.onclick=async()=>{selected=s;info();};$('nearbyStars').append(b);}
 gc.addEventListener('pointerdown',e=>{e.preventDefault();gc.setPointerCapture(e.pointerId);pan={id:e.pointerId,x:e.clientX,y:e.clientY,cx:center.x,cy:center.y,moved:false};});gc.addEventListener('pointermove',e=>{if(!pan||pan.id!==e.pointerId)return;const dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(Math.hypot(dx,dy)>5)pan.moved=true;center={x:pan.cx-dx/scale,y:pan.cy-dy/scale};draw();});gc.addEventListener('pointerup',e=>{if(!pan||pan.id!==e.pointerId)return;if(!pan.moved){const r=gc.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/scale+center.x,y=(e.clientY-r.top-r.height/2)/scale+center.y;const nearest=game.galaxy.map(s=>({s,d:Math.hypot(s.gx-x,s.gy-y)*scale})).sort((a,b)=>a.d-b.d)[0];if(nearest?.d<22){selected=nearest.s;info();}}pan=null;});gc.addEventListener('pointercancel',()=>pan=null);gc.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(3.4,Math.min(25,scale*(e.deltaY<0?1.15:.87)));draw();},{passive:false});$('zoomIn').onclick=async()=>{scale=Math.min(25,scale*1.3);draw();};$('zoomOut').onclick=async()=>{scale=Math.max(3.4,scale/1.3);draw();};$('mapHome').onclick=async()=>{center={x:home.gx,y:home.gy};selected=home;scale=9;info();};$('mapSearch').addEventListener('input',e=>{const query=e.target.value.trim().toLowerCase();if(query.length<2)return;const found=game.galaxy.find(s=>s.name.toLowerCase()===query)??game.galaxy.find(s=>s.name.toLowerCase().includes(query));if(found){selected=found;center={x:found.gx,y:found.gy};info();}});requestAnimationFrame(()=>info());
}
function openLocalMapContent(){if(game.state.mode==='person'&&surface){
 dialog.body.insertAdjacentHTML('beforeend',`<p class="section-note">${esc(surface.name)} · Choose a destination, then follow the gold marker in the world.</p><div class="surface-map-wrap"><canvas id="localSurfaceCanvas" aria-label="Local walking map: your position, trails, exits and marked places"></canvas></div><p class="map-legend"><span class="map-self">● You</span><span class="map-place">■ Places</span><span class="map-exit">■ Return</span><span class="map-target">□ Destination</span></p><div class="system-nearby" id="localPlaces"></div>`);
 const c=$('localSurfaceCanvas');c.width=720;c.height=Math.min(720,Math.max(240,Math.round(692*surface.rows/surface.cols)+28));
 drawSurfaceMap(c.getContext('2d'),surface,{person:game.state.person,targetEntityId:surfaceTarget,width:c.width,height:c.height,exploration:game.state.exploration?.encounter});
 const types=['exit','siteExit','siteEntrance','siteRecord','siteCache','siteChoice','station','bunk','mechanic','medic','jobboard','work','sample','crate','delivery','terminal'];
 const places=surface.entities.filter(e=>types.includes(e.type)&&!e.hidden).sort((a,b)=>distance(a,game.state.person)-distance(b,game.state.person));
 for(const e of places){const b=document.createElement('button');b.className=e.id===surfaceTarget?'selected':'';b.textContent=`${e.name} · ${Math.round(distance(e,game.state.person)/(surface.tileSize||24))} paces`;b.onclick=()=>{surfaceTarget=e.id;dialog.close();toast(`${e.name} marked. Follow the gold direction marker.`);};$('localPlaces').append(b);}
 }else{dialog.body.insertAdjacentHTML('beforeend','<p class="section-note">Select a contact to mark it in ship mode. Fly close enough to dock, land, scan, or mine.</p>');for(const b of [...game.system.bodies,...game.system.signals.filter(s=>!s.resolved)]){const card=document.createElement('div');card.className='entry-card';card.innerHTML=`<div class="entry-top"><span class="entry-title">${esc(b.name)}</span><span class="entry-meta">${Math.round(distance(b,game.state.ship))} m</span></div><p>${esc(b.lore??b.kind)}</p><button>Track contact</button>`;card.querySelector('button').onclick=async()=>{tracked=b.id;dialog.close();};dialog.body.append(card);}const b=document.createElement('button');b.className='button-secondary';b.textContent='Track nearby mining belt';b.onclick=async()=>{tracked=game.system.asteroids.filter(a=>a.hp>0).sort((a,b)=>distance(a,game.state.ship)-distance(b,game.state.ship))[0]?.id;dialog.close();};dialog.body.append(b);}}
function openSettings(){dialog.open('A moment between stars','settings',{eyebrow:testSession?'PAUSED / ISOLATED TEST':network?'SETTINGS / THE GALAXY KEEPS MOVING':'PAUSED / SOLO VOYAGE SAVED'});saveNow();const form=document.createElement('div');const defs=[['guidance','Guidance','Simple teaches actions through your first two successful uses. Moderate offers tips on request; Expert hides them.','select',[['simple','Simple'],['moderate','Moderate'],['expert','Expert']]],['shipZoom','Ship zoom','25% gives a wide battle view. Text and controls stay the same size.','range',[.25,1.6,.05]],['personZoom','Person zoom','Your separate camera for ports, planets, and ship interiors.','range',[.5,1.6,.05]],['immersiveHud','Fill the mobile screen','Let the world continue behind floating controls. Turn off for the framed cockpit.','checkbox'],['translucentHud','See-through mobile controls','Show the world beneath the HUD while keeping text readable.','checkbox'],['compactTips','Compact mobile tips','Keep instructions short. Tap + on a tip to read its full explanation.','checkbox'],['controlScale','Touch control size','Adjust the space beneath each thumb.','range',[.8,1.2,.05]],['textScale','Text size','Scales menus, the HUD, and crisp labels in the world.','range',[1,1.6,.05]],['flightAssist','Flight assist','Counter small drifts when the thrusters are released. Larger hulls still need time to stop.','checkbox'],['leftHanded','Swap thumb controls','Move the joystick to your right hand.','checkbox'],['sound','Sound effects','Engine pulses, footsteps, mining, and ship systems.','checkbox'],['music','Ambient score','A quiet, original electronic soundscape.','checkbox'],['reduceMotion','Reduce motion','Steadier camera and fewer atmospheric changes.','checkbox'],['showPerformance','Show performance','Display frame rate and network ping in the corner.','checkbox']];
 for(const[key,label,help,type,options]of defs){const row=document.createElement('div');row.className='setting-row';const text=document.createElement('label');text.htmlFor='setting-'+key;text.innerHTML=`<strong>${esc(label)}${type==='range'?' · '+Math.round(settings[key]*100)+'%':''}</strong><small>${esc(help)}</small>`;let input;if(type==='select'){input=document.createElement('select');for(const[value,name]of options){const o=document.createElement('option');o.value=value;o.textContent=name;o.selected=settings[key]===value;input.append(o);}}else{input=document.createElement('input');input.type=type;if(type==='range'){[input.min,input.max,input.step]=options;input.value=settings[key];}else input.checked=!!settings[key];}input.id='setting-'+key;input.addEventListener(type==='range'?'input':'change',()=>{if(key==='shipZoom'||key==='personZoom')setModeZoom(key==='shipZoom'?'ship':'person',input.value);else settings[key]=type==='checkbox'?input.checked:type==='range'?Number(input.value):input.value;applySettings(settings,{cameraPreferences:localCameraPreferences});clearPointerAim();if(key==='immersiveHud')controls.clear();if(key==='compactTips'){coachExpanded=false;document.body.classList.remove('coach-expanded');}if(key==='guidance')tutorial.controller?.setMode(settings.guidance);if(type==='range')text.querySelector('strong').textContent=label+' · '+Math.round(settings[key]*100)+'%';audio.mute();resize();syncViewControls();updateHUD();});row.append(text,input);form.append(row);}dialog.body.append(form);dialog.body.insertAdjacentHTML('beforeend','<details class="performance-details"><summary>Performance &amp; connection</summary><p>FPS measures how smoothly this browser draws. Ping measures the trip to the galaxy server and back.</p><pre id="performanceReport" aria-label="Performance report"></pre><button id="copyPerformance">Copy performance report</button></details>');$('copyPerformance').onclick=async()=>{try{await navigator.clipboard.writeText(performanceReport());toast('Performance report copied.');}catch{toast('Select and copy the report below.');}};updatePerformanceHUD();const buttons=document.createElement('div');buttons.className='setting-buttons';for(const[label,fn]of [['Resume voyage',()=>dialog.close()],...(!testSession&&playing?[['Your captain',openCaptainProfile]]:[]),['Controls & help',testSession?openCombatHelp:openHelp],['Privacy & data',openPrivacy],[testSession?'Test controls':'Export / import save',testSession?openTestControls:openSavePanel],[testSession?'Exit test mode':'Return to title',()=>{if(testSession){exitTestMode();return;}if(network){disconnectGalaxy();return;}dialog.close();saveNow();playing=false;$('welcome').hidden=false;$('continueButton').hidden=false;document.body.classList.add('welcome-active');}]]){const b=document.createElement('button');b.textContent=label;b.onclick=fn;buttons.append(b);}dialog.body.append(buttons);const reset=document.createElement('div');reset.className='guide-reset';reset.innerHTML='<button id="resetActionGuide">Replay action tips</button><p>Teach the controls and common actions again for this captain. Your voyage progress stays saved.</p>';$('modalBody').append(reset);$('resetActionGuide').onclick=()=>{selectGuide();tutorial.reset();settings.guidance='simple';applySettings(settings,{cameraPreferences:localCameraPreferences});tutorial.controller?.setMode('simple');dialog.close();updateHUD();};dialog.body.insertAdjacentHTML('beforeend','<p class="audio-note">Solo voyages save in this browser and pause in menus. Shared galaxies save on the server and keep moving while your menus are open. Both camera zoom settings follow your shared captain. Export your captain passport to return from another device.</p>');}
function openPrivacy(){openPrivacyData(dialog,{serverURL:SERVER_URL,currentPassport:network?.passport,download:downloadJSON});}
function openSavePanel(){if(testSession){openTestControls();return;}if(network){openPassport();return;}dialog.open('Carry your voyage with you','save',{eyebrow:'LOCAL SAVE / EXPORT & IMPORT'});dialog.html('<p>Your save contains your captain’s appearance and traits, ship, contracts, discoveries, decisions, visited systems, and both camera zoom settings. Download a copy, or paste a previously exported save below.</p><div class="dialogue-actions"><button id="downloadSave" class="button-primary">Download save</button></div><h3>Import a voyage</h3><textarea id="saveText" aria-label="Paste Farwake save" placeholder="Paste your Farwake save JSON here…"></textarea><div class="dialogue-actions"><button id="importSave">Check and import save</button></div><div id="saveFeedback" class="mini muted" style="margin-top:12px"></div>');$('downloadSave').onclick=async()=>{const blob=new Blob([game.serialize()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='farwake-voyage.json';a.click();setTimeout(async()=>URL.revokeObjectURL(url),1000);};$('importSave').onclick=async()=>{try{const raw=JSON.parse($('saveText').value);if(!raw||typeof raw!=='object'||!raw.seed||!raw.ship||!raw.stats||!Array.isArray(raw.flags))throw new Error('This does not look like a Farwake save.');const next=Game.fromSave(raw);next.state.cameraPreferences=normalizeCameraPreferences(raw.cameraPreferences,localCameraPreferences);if(!saveGame(next))throw new Error('This browser could not store the imported voyage.');game=next;stored=next.state;activateLocalCamera(next.state.cameraPreferences);surface=null;surfaceKey='';ensureSurface(false);$('continueButton').hidden=false;$('startButton').textContent='Start another solo voyage';dialog.close();toast('Voyage imported. Welcome back, captain.','good');updateHUD();}catch(e){$('saveFeedback').textContent='Could not import: '+e.message;}};}
function openHelp(){if(testSession){openCombatHelp();return;}dialog.open('The captain’s field guide','help',{eyebrow:'SHIP MODE + PERSON MODE'});dialog.html('<h3>Choose your starting life</h3><p>Regular begins with one of three compact ships. Hardcore begins on foot on Morrow with no ship. Both start with 180 credits and use the same health, traits, economy, and recovery rules. All professions, passenger travel, and paid NPC crew jobs are available to both.</p><h3>Work and travel without a ship</h3><p>At an inhabited port, Menu → Port services offers paid passage and crew contracts. A local maintenance shift can be repeated and has no entry cost. Used starter hulls at the shipwright cost credits without ore or a trade-in. Your owned ship stays where you parked it while you travel as a passenger.</p><h3>Paid watches aboard NPC ships</h3><p>Sign on as a gunner, fire crew, or ship medic. Captain Vale flies the actual service boat and returns to the hiring port. Crew duty marks your console, damaged compartment, or patient. The gunner holds FIRE by the security console; fire crew suppresses flames and repairs equipment; the medic treats the injured worker by medical. Collect wages after docking. Early return pays only for completed work, and idle time earns nothing.</p><h3>Your first flight</h3><p>Dock at Kettle Station. Find the contract exchange for a maintenance shift, meet Iona in the workshop, and explore the station. Launch into Hearth to mine ore and investigate signals. Earn vector thrusters, an echo scanner, and a fold drive before leaving the system.</p><h3>Ship and person perspectives</h3><p>The button at the top stays available while you play. Walk deck leaves the helm and puts you aboard your current ship. Take helm returns to flying that same hull. In a shared galaxy, Board ship returns you to the docked deck without departing. Wait for your crew, then choose Launch ship. Solo Return to ship resumes your flight. Inside a cave or other site, Exit site marks the way out first. Active boarders and another captain at the helm still matter; tap an unavailable shortcut to see why.</p><h3>Ship controls</h3><p>Your thrusters and your facing are independent. Strafe around a target while turning to keep your weapons on it. Release the turn control and angular momentum eases away. Larger hulls accelerate and rotate more slowly.</p><table class="keyboard-table"><tbody><tr><td>W / S</td><td>Forward thrust / slow down</td></tr><tr><td>A / D</td><td>Strafe left / right relative to the hull</td></tr><tr><td>← / →</td><td>Turn left / right with angular inertia</td></tr><tr><td>WASD on foot</td><td>Walk; arrows also walk when your sidearm is holstered</td></tr><tr><td>Mouse / arrows in combat</td><td>Aim your sidearm independently of movement</td></tr><tr><td>Click / Space in combat</td><td>Fire the Pulse sidearm; the marked target is aim assist</td></tr><tr><td>E</td><td>Dock, land, talk, or use</td></tr><tr><td>Space</td><td>Fire; use on foot; fight boarders</td></tr><tr><td>R / Shift / X</td><td>Mine / boost / brake</td></tr><tr><td>F / M / J / I / C</td><td>Scan / map / journal / ship / crew deck</td></tr><tr><td>Esc / P</td><td>Settings or close a menu</td></tr></tbody></table><h3>Two thumbs</h3><p>In space, point the left STEER stick where you want to fly. Your ship turns gradually and adds thrust as its nose lines up; release to coast. Slide the small right STRAFE stick left or right to move sideways relative to the bow. Its vertical axis does nothing. FIRE sits above it; hold BRAKE to slow down. Tools opens the mining beam and boost. On foot, the left stick walks. Inside a ship boarding action or a surface site, push the right AIM stick toward a hostile to aim and fire, or use FIRE for the marked aim-assist target. Approach a person or console and tap the action offered in the world. Settings can swap the sticks and change their size.</p><h3>Beyond the landing zone</h3><p>Planet and moon maps extend beyond their landing areas. Open MAP to mark caves, shelters, or other entrances, then follow the gold marker. Approach a door and use it to go inside. Your pulse sidearm is part of the standard field kit: aim and fire yourself when threatened. The entrance remains open if you need to retreat. Some places have no supplies or creatures; listen and read what was left behind. Defeated creatures, recovered supplies, and local decisions stay recorded.</p><h3>Your captain</h3><p>New voyages offer three starting ships and up to two optional traits. Every trait includes a benefit and a drawback. Ship → Your captain opens your appearance options. Existing captains can choose their traits once there; appearance stays editable.</p><h3>A larger life aboard</h3><p>Earn larger hulls as your voyage progresses. Their interiors grow with the ship, with room for more crew and stations. Visit engineering, the helm, medical, security, and the crew bunks. Specialists share berth capacity with human players. Boarding is dangerous: crew members who die stay in the memorial.</p><h3>Shared galaxies</h3><p>Create a galaxy and share its code. Each of up to ten captains can travel independently or work aboard a shared vessel. Open CREW to find each friend by name. Allow aboard lets them join your deck; Allow piloting separately permits the helm. The pilot stays visible at the helm while flying. After docking, each captain can board the same ship independently. The ship waits for a pilot to launch, and warns if a connected crewmate is still ashore. A slow connection delays that player’s updates; there is no lobby-wide ping pause. Menus do not pause a shared world.</p><h3>Come back on your own schedule</h3><p>Shared progress saves to the server. Register a port room, build a surface outpost, or fit and claim a ship bunk as home. Your captain can return without the other players online. Empty systems sleep; inhabited systems continue. Keep a private captain passport backup to continue on another device.</p><h3>Work and survival</h3><p>The mining beam locks onto nearby rocks. Contracts pay at the named destination. Local work includes freight, surveys, and relay puzzles. Shields recover after damage stops. Local flight does not spend jump fuel. Ports can offer emergency fuel, and loss triggers recovery with a penalty.</p>');}
function hudText(element,value){value=String(value??'');if(element.textContent!==value){element.textContent=value;return true;}return false;}
function hudHTML(element,value){if(element.innerHTML!==value){element.innerHTML=value;return true;}return false;}
function hudStyle(element,key,value){if(element.style[key]!==value){element.style[key]=value;return true;}return false;}
function updateContacts(ship){
 if($('contactsPanel').hidden)return;
 const contacts=[...game.system.bodies];
 let signal=null,rock=null,signalDistance=Infinity,rockDistance=Infinity;
 for(const candidate of game.system.signals){if(candidate.resolved)continue;const d=distance(candidate,ship);if(d<signalDistance){signal=candidate;signalDistance=d;}}
 for(const candidate of game.system.asteroids){if(candidate.hp<=0)continue;const d=distance(candidate,ship);if(d<rockDistance){rock=candidate;rockDistance=d;}}
 if(signal)contacts.push(signal);if(rock)contacts.push({...rock,name:'Mining belt',kind:'ore'});
 const list=$('contactsList'),shown=contacts.slice(0,5),ids=new Set(shown.map(c=>c.id));
 for(const[id,row]of contactRows)if(!ids.has(id)){row.button.remove();contactRows.delete(id);labelLayoutDirty=true;}
 shown.forEach((contact,index)=>{
  let row=contactRows.get(contact.id);
  if(!row){const button=document.createElement('button');button.className='contact-row';button.innerHTML='<span class="contact-symbol"></span><span><span class="contact-name"></span><small></small></span><span class="dist"></span>';button.onclick=()=>{tracked=contact.id;guideIntent=contact.kind==='ore'?'mining':['station','planet','moon'].includes(contact.kind)?'dock':null;if(touchLayout)closeContacts();updateHUD();};row={button,symbol:button.children[0],name:button.querySelector('.contact-name'),kind:button.querySelector('small'),distance:button.children[2]};contactRows.set(contact.id,row);}
  if(list.children[index]!==row.button){list.insertBefore(row.button,list.children[index]??null);labelLayoutDirty=true;}
  row.button.classList.toggle('selected',tracked===contact.id);
  hudText(row.symbol,{station:'⊞',planet:'◉',moon:'◌',ore:'◇'}[contact.kind]??'⌁');hudText(row.name,contact.name);hudText(row.kind,contact.kind?.toUpperCase()??'CONTACT');hudText(row.distance,Math.round(distance(contact,ship))+'m');
 });
}
function updateHUD(){
 hudDirty=false;
 const s=game.state,onFoot=s.mode==='person',body=game.currentBody,sh=onFoot&&s.interior?.kind==='enemy'&&body?.hull!==undefined?{...s.ship,hull:body.hull,maxHull:body.maxHull,shield:0,name:body.vesselName,classId:body.shipClass}:s.ship,sys=game.currentSystem,f=FACTIONS.find(f=>f.id===(body?.faction??sys.faction));
 if(document.body.classList.contains('person-mode')!==onFoot){document.body.classList.toggle('person-mode',onFoot);labelLayoutDirty=true;}
 const help=$('controlDeck').querySelector('.desktop-controls');
 hudHTML(help.children[0],onFoot?(personCombat()?'<kbd>WASD</kbd> walk':'<kbd>WASD / arrows</kbd> walk'):'<kbd>W/S</kbd> thrust / slow');help.children[1].hidden=onFoot;help.children[2].hidden=onFoot&&!personCombat();hudHTML(help.children[2],personCombat()?'<kbd>Mouse / arrows</kbd> aim':'<kbd>← →</kbd> turn');
 hudHTML(help.children[4],onFoot&&!armedOnFoot()?'<kbd>SPACE</kbd> use':'<kbd>SPACE</kbd> fire');hudHTML(help.children[5],onFoot?'<kbd>R</kbd> log':'<kbd>R</kbd> mine');hudHTML(help.children[6],onFoot?'<kbd>SHIFT</kbd> run':'<kbd>SHIFT</kbd> boost');
 hudText($('credits'),fmt(s.credits));hudText($('cargo'),`${game.cargoUsed} / ${sh.cargoCap}`);hudText($('fuel'),Math.round(sh.fuel/sh.maxFuel*100));updatePerspectiveControl();
 hudText($('shipName'),game.hasActiveVessel?(sh.name??'Cinder').toUpperCase()+' / '+getShipClass(sh.classId).name.toUpperCase():'ON FOOT / NO SHIP OWNED');
 document.body.classList.toggle('shipless',!game.hasActiveVessel);
 if(hudText($('locationName'),onFoot?(body?.name??surface?.name):sys.name))labelLayoutDirty=true;
 hudText($('sectorLabel'),onFoot?sys.name.toUpperCase()+' SYSTEM / '+(surface?.kind==='ship'?'CREW DECK':'ON FOOT'):'THE CINDER REACH / '+(sys.authored?'CHARTED SYSTEM':'FRONTIER'));
 if(hudText($('locationDetail'),(f?.short??'INDEPENDENT')+' SPACE · '+(onFoot?(surface?npcClock(npcTime(),surface).text+' LOCAL':'ON FOOT'):game.hasHyperdrive?'FOLD DRIVE ONLINE':'SUBLIGHT FLIGHT')))labelLayoutDirty=true;
 hudText($('coordinate'),settings.showPerformance?performanceSummary():onFoot?`${Math.round(s.person.x)} / ${Math.round(s.person.y)}`:`${Math.round(sh.x).toString().padStart(4,'0')} / ${Math.round(sh.y).toString().padStart(4,'0')}`);
 if(hudStyle($('contactsPanel'),'display',onFoot?'none':''))labelLayoutDirty=true;hudStyle($('scannerButton'),'display',onFoot?'none':'');
 for(const[id,value,max]of [['hull',sh.hull,sh.maxHull],['shield',sh.shield,sh.maxShield],['energy',sh.energy,sh.maxEnergy]]){hudText($(id+'Number'),Math.ceil(value));hudStyle($(id+'Meter'),'width',(Math.max(0,Math.min(100,value/max*100))).toFixed(1)+'%');}
 hudHTML($('speedLabel'),onFoot?`<small>VITALITY</small> ${Math.ceil(s.person.health)}<small> / ${s.person.maxHealth||100}</small>`:`${Math.round(Math.hypot(sh.vx,sh.vy)).toString().padStart(3,'0')} <small>m/s</small>`);
 const testStatus=testSessionStatus(testSession),boarding=s.boarding,expedition=s.exploration,chapter=game.chapter,job=s.missions.find(m=>m.status!=='completed'&&m.type==='work'&&m.targetBody===s.locationId);
 hudText($('objectiveKind'),testStatus?'TEST MODE':expedition?'FIELD EXPLORATION':boarding&&onFoot?'BOARDING / '+(boarding.kind==='defense'?'DEFEND':'TARGET DECK'):job?'LOCAL CONTRACT':chapter?'THE QUIET EARTH':'YOUR OWN WAY');
 if(hudText($('objectiveTitle'),testStatus?testStatus.title:expedition?body?.name??surface?.name:boarding&&onFoot?(boarding.phase==='active'?'Secure the deck':'Deck secure'):job?job.title+` · ${job.progress}/${job.goal}`:chapter?.title??'The galaxy is still open'))labelLayoutDirty=true;
 let hint=job?(job.status==='ready'?'Return to the contract exchange for payment.':'Calibrate the amber maintenance relays around this place.'):chapter?.objective??'Explore, trade, and choose where you go next.';
 if(!onFoot&&!s.completedChapters.length)hint='Dock at Kettle Station. Meet Iona, then find the contract exchange.';
 if(onFoot&&s.locationId==='kettle'&&!s.flags.includes('accepted_job')&&!s.completedChapters.length)hint='Find the contract exchange in the central concourse. Iona’s workshop is to the north.';
 if(onFoot&&s.locationId==='kettle'&&s.openingMission?.status==='completed'&&!s.flags.includes('talked_mechanic'))hint='Your first job is paid. Meet Iona in the workshop north of the concourse.';
 if(onFoot&&surface?.kind==='ship')hint='Explore your crew deck. Take helm at the top returns you to flying this ship.';
 if(expedition)hint=personHostiles().some(e=>e.health>0)?(touchLayout?'WALK to evade. AIM points and fires; FIRE uses the marked target. Retreat through the entrance.':'WASD to evade. Mouse or arrows aim; Click or Space fires. The entrance remains open.'):'Explore the room. Approach objects to read or search them. MAP marks the way outside.';
 if(onFoot&&!s.interior&&['planet','moon'].includes(body?.kind)&&!job)hint='Follow the trails beyond the landing zone. MAP marks entrances, services, and your ship.';
 if(testStatus)hint=testStatus.detail;else if(boarding&&onFoot)hint=boarding.phase==='active'?(touchLayout?'WALK moves. Point AIM at a hostile to fire, or press FIRE at the marked target.':'Pulse sidearm ready. Mouse or arrows aim; Click or Space fires. WASD moves.'):'The deck is secure. Take helm at the top pilots this hull; the entry airlock returns to your ship.';
 const opening=game.openingMissionStatus?.(),narrative=opening?.active?null:narrativeNavigation();
 if(narrative&&!testStatus&&!(boarding&&onFoot&&boarding.phase==='active')){
  hudText($('objectiveKind'),trackedThreadId==='@profession'?'YOUR DUTY':'A STORY IN PROGRESS');hudText($('objectiveTitle'),narrative.title);hint=narrative.objective||hint;
  const key=[trackedThreadId,narrative.stageId,narrative.objective,s.systemId,s.locationId,s.mode].join('|');
  if(key!==narrativeMarkerKey){markNarrativeTarget(narrative.target);narrativeMarkerKey=key;}
 }
 const duty=game.npcContractStatus?.();if(duty?.active){hudText($('objectiveKind'),duty.eva?.active?'EVA · '+Math.ceil(duty.eva.oxygen)+'s AIR':'PAID CREW DUTY');hudText($('objectiveTitle'),duty.canFinish?'Collect your pay':duty.activeTask?.title||duty.title||duty.roleName);hint=duty.task||'Follow your duty marker.';if(duty.canFinish)hint='Crew duty → collect your pay and go ashore.';const key=[duty.id,duty.phase,duty.activeTask?.id,duty.target?.entityId,duty.work?.sectionId,s.locationId].join('|');if(key!==dutyMarkerKey){markLivelihoodTarget(duty.target,{quiet:true});dutyMarkerKey=key;}}else if(!game.ownsShip&&!job&&!expedition){hudText($('objectiveKind'),'YOUR FIRST SHIP');hudText($('objectiveTitle'),'Earn your passage');hint='Port services at the top opens paid crew work and passenger fares. Find the contract exchange for a local shift.';}
 if(opening?.active&&!testStatus&&!duty?.active&&!expedition&&!(boarding&&onFoot)){
  hudText($('objectiveKind'),'A SMALL FAVOR');hudText($('objectiveTitle'),opening.title);hint=opening.objective;
  const key=JSON.stringify([s.seed,s.multiplayer?.captainId,opening.stageId,opening.target,s.systemId,s.locationId,s.mode]);
  if(key!==openingMarkerKey){markOpeningTarget(opening.target);openingMarkerKey=key;}
 }else openingMarkerKey='';
 if(!onFoot&&s.cosmicWarning){hudText($('objectiveKind'),'GRAVITY WARNING');hudText($('objectiveTitle'),s.cosmicWarning.name||'Tidal forces');hint=s.cosmicWarning.warning||s.cosmicWarning.text||'Turn away from the dark center and apply thrust.';}
 if(hudText($('objectiveText'),settings.guidance==='expert'?'Your journal keeps the details.':hint))labelLayoutDirty=true;hudStyle($('objectiveText'),'display',settings.guidance==='expert'?'none':'');
 const n=nearby();let context=onFoot?'Walk close to a person or workstation':'Fly toward a port, signal, or asteroid belt';
 if(n){if(onFoot)context=n.type==='damageControl'?'Damage control':n.type==='exit'?(surface?.kind==='ship'?(n.data?.stationRole==='helm'?'Use the helm':(s.boarding?.kind==='assault'||s.multiplayer?.returnVesselId)?'Return across the tether':'Use the airlock'):'Return to your ship'):n.type==='npc'||n.type==='crew'?'Talk to '+n.name:n.type==='mechanic'?'Visit '+n.name:n.type==='jobboard'?'Open the contract exchange':n.type==='work'?'Calibrate '+n.name:n.type==='crate'?'Pick up freight crate':n.type==='delivery'?'Use loading pad':n.type==='sample'?'Collect '+n.name:'Use '+n.name;else context=n.type==='dock'?(n.body.kind==='station'?'Dock at ':'Land on ')+n.name:n.type==='signal'?'Investigate '+n.name:n.type==='salvage'?'Collect salvage':n.type==='shared-ship'?'Boarding & crew: '+n.name:n.type==='board'?'Board '+n.name:n.type==='parked-ship'?'Return to '+n.name:'Hail '+n.name;}
 if(touchLayout||n?.type.startsWith('site')||n?.data?.stationRole==='helm'||network&&onFoot&&n?.type==='exit')context=contextLabel(n);if(hudText($('contextText'),context))labelLayoutDirty=true;$('contextButton').classList.toggle('idle',!n);
 hudText($('fireButton').querySelector('small'),onFoot&&!armedOnFoot()?'USE':'FIRE');hudText($('stick').querySelector('.stick-caption'),onFoot?'WALK':'STEER');hudText($('aimStick').querySelector('.stick-caption'),onFoot?(personCombat()?'AIM / FIRE':'AIM'):'STRAFE');hudText($('fireButton').querySelector('span'),onFoot?'◇':'✛');hudText($('mineButton').querySelector('small'),onFoot?'LOG':'MINE');hudText($('boostButton').querySelector('small'),onFoot?'RUN':'BOOST');
 hudText($('footerTime'),'YEAR 2481 · '+String(Math.floor(s.stats.time/60)).padStart(2,'0')+':'+String(Math.floor(s.stats.time)%60).padStart(2,'0'));
 if(!onFoot)updateContacts(sh);updateCombatHUD();updateMobileHUD(sh,n);updateGuidance(n);if(testSession){hudText($('saveState'),'TEST · UNSAVED');if(testStatus?.complete&&testOutcome!==testStatus.title){testOutcome=testStatus.title;toast(testStatus.title+' · Retry or choose another test when ready.','good',4500);}}
}

function processEvents(){for(const e of game.drainEvents()){recordGuideEvent(e);if(processCombatEvent(e))continue;if(testSession&&['chapter','encounter','job-complete'].includes(e.type))continue;if(e.type==='shot'){audio.play('fire');continue;}if(e.type==='hit'||e.type==='damage'){if(!aboardDamageHull())audio.play('hit');continue;}if(e.type==='mined'){if(game.system.asteroids.some(a=>a.id===tracked&&a.hp<=0))tracked=game.system.asteroids.filter(a=>a.hp>0).sort((a,b)=>distance(a,game.state.ship)-distance(b,game.state.ship))[0]?.id;audio.play('mine');toast(e.text,'good',1800);continue;}if(e.type==='encounter'){if(!dialog.opened&&playing)openEncounter(e.encounter??game.getEncounter());continue;}if(e.type==='boarding'&&game.state.boarding?.phase==='active'){dialog.close();setViewPanel(false);surfaceKey='';ensureSurface();audio.play('alert');if(e.text)toast(e.text,'bad',7000);continue;}if(e.type==='chapter'){audio.play('quest');toast(e.chapter.title+' complete. Your journal has the next chapter.','good',6000);continue;}if(e.type==='job-complete'||e.type==='upgrade')audio.play('quest');if(e.type==='salvage')audio.play('pickup');if(['rescue','cosmic-warning','world-active'].includes(e.type))audio.play('alert');if(e.type==='choice')continue;if(e.text)toast(e.text,['rescue','cosmic-warning'].includes(e.type)?'bad':['job-complete','upgrade','service','salvage'].includes(e.type)?'good':'info');}}
function resize(){
 const wasTouch=touchLayout;touchLayout=window.matchMedia('(pointer: coarse)').matches||window.innerWidth<=800;
 document.body.classList.toggle('touch-layout',touchLayout);document.body.classList.toggle('touch-landscape',touchLayout&&window.innerWidth>window.innerHeight);
 $('pauseButton').setAttribute('aria-label',touchLayout?'Open game menu':'Settings and pause');$('pauseButton').title=touchLayout?'Game menu':'Settings and pause';
 if(wasTouch!==touchLayout){controls?.clear();hideCoach();setViewPanel(false,{restoreFocus:false});}clearPointerAim();
 const r=$('flightdeck').getBoundingClientRect(),vv=window.visualViewport,dpr=window.devicePixelRatio||1;
 const cameraMode=playing?game.state.mode:'ship',zoom=playing?settings[cameraMode+'Zoom']:1;renderCameraKey=cameraMode+':'+zoom;
 pixelView=pixelViewport({width:r.width,height:r.height,left:r.left,top:r.top,dpr,scale:PIXEL_SCALE,zoom,mode:cameraMode,visualScale:vv?.scale??1,visualOffsetX:vv?.offsetLeft??0,visualOffsetY:vv?.offsetTop??0});
 // Below 100% the world already uses the native display grid. Draw straight
 // into it, avoiding a second full-resolution allocation and canvas copy.
 const direct=zoom<1&&pixelView.physicalPixelsPerPixel===1;ctx=direct?presentationCtx:worldCtx;
 const worldWidth=direct?1:pixelView.logicalWidth,worldHeight=direct?1:pixelView.logicalHeight;
 if(worldCanvas.width!==worldWidth)worldCanvas.width=worldWidth;if(worldCanvas.height!==worldHeight)worldCanvas.height=worldHeight;
 // On phones, pre-expand into real device pixels instead of relying on a CSS
 // compositor to upscale the low-resolution world. Desktop keeps its old cost.
 const width=touchLayout?pixelView.physicalWidth:pixelView.logicalWidth,height=touchLayout?pixelView.physicalHeight:pixelView.logicalHeight;
 if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
 canvas.style.width=pixelView.cssWidth+'px';canvas.style.height=pixelView.cssHeight+'px';canvas.style.left=pixelView.offsetX+'px';canvas.style.top=pixelView.offsetY+'px';canvas.style.right='auto';canvas.style.bottom='auto';
 const textDpr=Math.min(4,dpr*(vv?.scale??1)),labelWidth=Math.max(1,Math.round(r.width*textDpr)),labelHeight=Math.max(1,Math.round(r.height*textDpr));
 if(labelCanvas.width!==labelWidth)labelCanvas.width=labelWidth;if(labelCanvas.height!==labelHeight)labelCanvas.height=labelHeight;
 labelCanvas.style.width=r.width+'px';labelCanvas.style.height=r.height+'px';beginPixelFrame(ctx);beginPixelFrame(presentationCtx);labelLayoutDirty=true;labelWidths.clear();hudDirty=true;
}
function queueResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(()=>{resizeQueued=false;resize();});}

activateLocalCamera(game.state.cameraPreferences??localCameraPreferences);
new ResizeObserver(queueResize).observe($('flightdeck'));window.addEventListener('resize',queueResize);window.visualViewport?.addEventListener('resize',queueResize);window.visualViewport?.addEventListener('scroll',queueResize);window.matchMedia('(pointer: coarse)').addEventListener('change',queueResize);const labelObserver=new ResizeObserver(()=>{labelLayoutDirty=true;});for(const element of labelObstacles)labelObserver.observe(element);window.addEventListener('orientationchange',()=>{controls.clear();setTimeout(resize,150);});resize();
const attract={state:{systemId:'attract',ship:{x:0,y:30,vx:20,vy:0,angle:-.42,shield:35},jumpFlash:0},system:{bodies:[{id:'welcome-planet',name:'Morrow',kind:'planet',x:300,y:-110,radius:170,biome:'temperate'},{id:'welcome-moon',name:'Tinbell',kind:'moon',x:570,y:85,radius:47,biome:'barren'},{id:'welcome-port',name:'Kettle',kind:'station',x:35,y:210,radius:50,biome:'station'}],asteroids:Array.from({length:18},(_,i)=>({id:'attract-'+i,x:220+i*23,y:170+Math.sin(i*.8)*57,radius:7+i%8,hp:10,seed:i+8})),enemies:[],traffic:[{x:80,y:145,angle:-.6,vx:10}],signals:[],bullets:[],pickups:[]}};
let wasFire=false,wasMine=false;
async function invoke(name,args={}){
 selectGuide();const profileId=tutorial.controller?.profileId,context=tutorial.context??guidanceContext();
 const answer=await performInvoke(name,args);
 if(!network&&answer?.ok)game.observeOpeningAction?.(name,args,answer);
 if(answer?.code==='crew-ashore'&&!args.leaveCrewBehind&&network){openCrewDeparture(name,args,answer);return {...answer,presented:true};}
 if(answer?.ok&&profileId===tutorial.controller?.profileId){
  const action={dock:'dock',acceptJob:'job-accept',turnInJob:'job-turn-in',boardEnemy:'board-enemy',boardHostileShip:'board-enemy',boardShip:'board-friend',returnToOwnShip:'return-airlock',takeCapturedHelm:'take-helm',exitCabin:'take-helm',quickHelm:'take-helm'}[name];
  if(action)tutorial.record(action,null,context);
  if(name==='takeStation'&&args.role==='helm')tutorial.record('take-helm',null,context);
  if(name==='setCrewAccess'&&args.allowed)tutorial.record('crew-permission',null,context);
  if(name==='surfaceAction'&&args.action==='repair'&&answer.first!==false)tutorial.record('work',null,context);
  if(name==='surfaceAction'&&['talk','read'].includes(args.action))tutorial.record('person-use',null,context);
 }
 return answer;
}
function openCrewDeparture(method,args,answer){
 const owner=network,captainId=game.state.multiplayer?.captainId,vesselId=answer.vesselId;
 const names=(answer.crewAshore||[]).map(c=>c.name).join(', ')||'Your crew';
 dialog.open('Crew still ashore','crew-departure',{eyebrow:'SHIP REMAINS DOCKED'});
 dialog.html(`<p><strong>${esc(names)}</strong> ${(answer.crewAshore||[]).length===1?'is':'are'} still at this port.</p><p>They can use <strong>Board ship</strong> to join you on the deck. Launch when everyone you want aboard has returned.</p>`);
 dialog.choices([{label:'Wait for my crew',detail:'Return to the deck. The ship stays docked.',action:()=>dialog.close()},{label:'Review crew & boarding access',action:openSharedShip},{label:'Depart without them',detail:'Leave these captains at the port. They can continue playing there.',warning:true,action:async()=>{const mp=game.state.multiplayer||{};if(network!==owner||mp.captainId!==captainId||(mp.aboardVesselId||mp.portVesselId||mp.ownedVesselId)!==vesselId){toast('Your ship or connection changed. Check the crew before departing.','info');openOnline();return;}await runDeckAction(method,{...args,vesselId,leaveCrewBehind:true});}}]);
}
async function performInvoke(name,args={}){
 if(testSession){
  const exerciseActions=['damageControl','enterCabin','quickHelm','quickLaunch','exitCabin','leaveInterior','boardEnemy','boardParkedShip','attackBoarder','repelBoarders','retreatBoarding','returnToOwnShip','takeCapturedHelm','crewAction','fireWeapons','salvage'];
  if(network||!game?.isTestMode||!exerciseActions.includes(name)||name==='crewAction'&&!['repair','heal'].includes(args.action))return {ok:false,code:'test-mode',reason:'This action belongs to your voyage. The test range stays isolated.'};
 }
 if(network){try{const packet=await network.command(name,args);const answer=packet.result??packet;return {...answer,ok:packet.ok??answer.ok,reason:answer.reason??packet.reason};}catch(error){return {ok:false,reason:error.message};}}
 const idMethods=['dock','boardDerelict','scan','salvage','boardParkedShip','turnInJob','acceptJob','buyUpgrade','buyShip','selectShip','abandonJob','travel','boardEnemy','attackBoarder'];
 if(idMethods.includes(name))return game[name](args.id);
 if(name==='applyChoice')return game.applyChoice(args.encounterId,args.choice);
 if(name==='openingAction')return game.openingAction(args.action,args);
 if(name==='takePassengerTransit')return game.takePassengerTransit(args.bodyId);
 if(name==='acceptNpcContract')return game.acceptNpcContract(args.roleId,args);
 if(name==='npcContractAction')return game.npcContractAction(args.action,args);
 if(name==='service')return game.service(args.action);
 if(name==='damageControl')return game.damageControl(args.sectionId,args.action);
 if(name==='enterSite')return game.enterSite(args.siteId);
 if(name==='siteAction')return game.siteAction(args.entityId,args.action,args.optionId);
 if(name==='customizeCharacter')return game.customizeCharacter(args);
 if(name==='inspectContact'||name==='inspectQuestObject')return game[name](args.entityId);
 if(name==='threadAction'||name==='enlistProfession'||name==='professionAction')return game[name](args);
 if(name==='acceptPassenger')return game.acceptPassenger(args.offerId,args.entityId);
 if(name==='deliverPassenger'||name==='abandonPassenger')return game[name](args.entityId);
 if(name==='pledgeFaction')return game.pledgeFaction(args.factionId,args.entityId);
 if(name==='triggerEncounter')return game.triggerEncounter(args.id,{sourceId:args.sourceId,sourceType:args.sourceType});
 if(name==='recruitCrew')return game.recruitCrew(args.role,args.offer);
 if(name==='dismissCrew')return game.dismissCrew(args.crewId);
 if(name==='crewAction'){if(args.action==='repair')return game.repairFromStation?.()??{ok:false,reason:'Repairs require an engineering station.'};if(args.action==='heal')return game.medicalFromStation?.()??{ok:false,reason:'Treatment requires a medical station.'};}
 if(typeof game[name]==='function')return game[name]();
 return {ok:false,reason:'This action is available in a shared galaxy.'};
}
function advanceOnlinePerson(now=network?.now()??performance.now()){
 if(!network||game.state.mode!=='person')return;
 const until=network.clampPredictionTime(now),person=game.state.person,canMove=person.health>0&&!person.down;
 if(surface&&personPredictedAt!==null&&until>personPredictedAt&&canMove){for(const frame of network.inputFrames(personPredictedAt,until)){person.speed=(frame.input.boost?155:112)*(game.characterEffects?.walkSpeed??1);movePerson(surface,person,frame.input.x||0,frame.input.y||0,frame.dt);}}
 if(!canMove)person.moving=false;
 personPredictedAt=Math.max(personPredictedAt??until,until);
 const visualNow=Math.max(personVisualAt??now,now),decay=Math.exp(-Math.max(0,visualNow-(personVisualAt??visualNow))/1000*16);
 personVisualOffset.x*=decay;personVisualOffset.y*=decay;personVisualAt=visualNow;
}
function receiveSnapshot(packet){
 const now=network?.now()??performance.now(),oldMode=game.state.mode,oldRoom=onlineSnapshot?.room?.id;
 if(oldMode==='person'&&packet.state.mode==='person'&&oldRoom===packet.room?.id&&!network?.predictionReset)advanceOnlinePerson(now);
 const previous=game.state.person?{x:game.state.person.x+personVisualOffset.x,y:game.state.person.y+personVisualOffset.y}:null;
 if(game.state.seed!==packet.state.seed)game=Game.fromSave(packet.state);
 game.state=structuredClone(packet.state);game._playerId=packet.state.multiplayer?.captainId||'local';game._sharedWorld=true;delete game._directorShared;if(packet.world)game._runtime=structuredClone(packet.world);onlineSnapshot=packet;receiveCameraPreferences(packet);
 worldPresentation.push(packet);
 if(packet.events?.length)game.events.push(...packet.events);
 const changedRoom=oldRoom!==packet.room?.id||oldMode!==game.state.mode;
 if(changedRoom||network?.predictionReset==='vessel'){surface=null;surfaceKey='';surfaceTarget=null;combatPresentation.reset();combatFeed.length=0;clearPointerAim();controls?.clear();}
 if(changedRoom||network?.predictionReset){personVisualOffset={x:0,y:0};personPredictedAt=null;personVisualAt=now;}
 ensureSurface(false);
 if(game.state.mode==='ship'&&network?.predictedShip)Object.assign(game.state.ship,network.predictedShip);
 if(game.state.mode==='person'&&surface&&network){
  if(game.state.person.health>0&&!game.state.person.down){for(const frame of network.predictionFrames(packet,now)){game.state.person.speed=(frame.input.boost?155:112)*(game.characterEffects?.walkSpeed??1);movePerson(surface,game.state.person,frame.input.x||0,frame.input.y||0,frame.dt);}}else game.state.person.moving=false;
  const until=network.clampPredictionTime(now);personPredictedAt=Math.max(personPredictedAt??until,until);personVisualAt=Math.max(personVisualAt??now,now);
  if(previous&&!changedRoom&&!network.predictionReset){const dx=previous.x-game.state.person.x,dy=previous.y-game.state.person.y;personVisualOffset=Math.hypot(dx,dy)<70?{x:dx,y:dy}:{x:0,y:0};}
 }
 updateSurfaceFlags();frameMonitor.snapshot(packet);hudDirty=true;if(playing)processEvents();
}
function updateConnectionHUD(){const b=$('onlineButton');b.classList.toggle('connected',!!network?.connected);b.classList.toggle('reconnecting',!!network&&!network.connected);hudText($('networkLabel'),network?(network.connected?`CREW · ${onlineSnapshot?.realm?.online??1}/10`:'RECONNECTING'):'CREW');const title=network?`Board ships & manage crew · ${onlineSnapshot?.realm?.name??'Shared galaxy'} · ${Math.round(network.latency.rtt||0)} ms`:'Shared galaxies and crew';if(b.title!==title)b.title=title;}
function openConnect(mode='create'){if(testSession){openTestControls();return;}
 dialog.open(mode==='create'?'A galaxy to call your own':'Find your crew','connect',{eyebrow:mode==='create'?'PERSISTENT GALAXY / 1–10 CAPTAINS':'JOIN A SHARED GALAXY'});
 dialog.html(`<p>${mode==='create'?'Invite friends now or later. Everyone can return and make progress on their own schedule.':'Enter a galaxy code from a friend. Your captain passport will be saved on this device.'}</p><form id="connectForm"><label class="form-field"><span>Your captain’s name</span><input id="captainName" maxlength="24" value="Captain" autocomplete="nickname" required></label>${mode==='create'?'<label class="form-field"><span>Galaxy name</span><input id="realmName" maxlength="40" value="The Cinder Reach" required></label>':'<label class="form-field"><span>Galaxy code</span><input id="realmCode" maxlength="32" placeholder="Enter invite code" autocapitalize="characters" autocomplete="off" required></label>'}<button class="button-primary" type="submit">Choose ship &amp; captain →</button></form><p class="mini muted" style="margin-top:18px">Choose one of three starting ships and customize your captain next. Your solo voyage stays on this device.</p>`);
 $('connectForm').onsubmit=e=>{e.preventDefault();const options={create:mode==='create',name:$('captainName').value.trim(),realmName:$('realmName')?.value.trim(),realmCode:$('realmCode')?.value.trim().toUpperCase()};openCaptainSetup(dialog,{mode:'create',openingPolicy:mode==='create'?'choose':'realm',onComplete:selection=>connectGalaxy({...options,...selection}),onCancel:()=>openConnect(mode)});};
 const passes=Object.entries(readPassports()).filter(([key,value])=>key!=='lastRealm'&&value?.token);
 if(passes.length){dialog.body.insertAdjacentHTML('beforeend','<h3>Your captains</h3>');dialog.choices(passes.map(([code,passport])=>({label:`Return to ${code}`,detail:'Resume this device’s saved captain.',action:()=>connectGalaxy({passport})})));}
 dialog.choices([{label:'Restore a captain passport',detail:'Use your private backup to continue from another device.',action:()=>openPassport(true)}]);
}
async function connectGalaxy(options){if(testSession){openTestControls();return;}
 const wasPlaying=playing,wasGame=game,wasNetwork=network;if(playing&&!network)saveNow();if(wasNetwork?.connected){wasNetwork.setInput({});const cameraSaved=await cameraProfile.flush();if(network!==wasNetwork)return;if(!cameraSaved)reportCameraSaveFailure();}network?.disconnect();clearTimeout(cameraSaveTimer);cameraScope='connecting';cameraKey=null;cameraProfile.activateLocal(localCameraPreferences);audio.unlock();
 dialog.open('Opening the airlock…','connecting',{eyebrow:'CONTACTING YOUR GALAXY'});dialog.html('<p>The galaxy server may take a moment to wake. Your captain and progress will be restored before you take control.</p><div class="network-status">Connecting securely…</div>');
 const candidate=new FarwakeNetwork({url:SERVER_URL,onSnapshot:packet=>{if(network===candidate)receiveSnapshot(packet);},onStatus:status=>{if(network!==candidate)return;connectionState=status.state;updateConnectionHUD();syncViewControls();if(status.state==='connected')void cameraProfile.flush();if(status.state==='reconnecting'&&playing)toast('Connection interrupted. Reconnecting your captain…','info',4000);if(status.state==='error')toast(status.reason??'The server could not confirm that action.','bad');}});network=candidate;worldPresentation.reset();personPredictedAt=null;personVisualAt=null;personVisualOffset={x:0,y:0};
 try{const welcome=await candidate.connect(options);if(network!==candidate){candidate.disconnect();return;}playing=true;surface=null;surfaceKey='';ensureSurface(false);$('welcome').hidden=true;document.body.classList.remove('welcome-active');$('resumeGalaxy').hidden=false;dialog.close();saveNow();updateHUD();canvas.focus({preventScroll:true});toast(`Welcome aboard. Galaxy code: ${candidate.passport.realmCode}. Share the code from CREW.`,'good',7000);if(welcome.state.pendingEncounter)openEncounter(game.getEncounter());}
 catch(error){candidate.disconnect();if(network!==candidate)return;network=null;game=wasNetwork?(stored?Game.fromSave(stored):new Game('farwake-'+Date.now())):wasGame;playing=wasNetwork?false:wasPlaying;activateLocalCamera(game.state.cameraPreferences??localCameraPreferences);if(!playing){$('welcome').hidden=false;document.body.classList.add('welcome-active');}onlineSnapshot=null;connectionState='offline';dialog.open('Could not reach the galaxy','connection-error',{eyebrow:'YOUR SAVED CAPTAIN IS SAFE'});dialog.html(`<p>${esc(error.message)}</p><p class="mini muted">If the server is waking from idle, wait a moment and try again.</p>`);dialog.choices([{label:'Try again',action:()=>connectGalaxy(options)},{label:'Back',action:()=>dialog.close()}]);}
}
function downloadJSON(value,name){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}}
function openPassport(importOnly=false){
 dialog.open('Your captain passport','passport',{eyebrow:'RETURN FROM ANY DEVICE'});dialog.html('<p>Your private passport restores the same captain, progress, and saved ship and person zoom on another device. Keep the backup private: it grants access to your captain. Share the galaxy code when inviting a friend.</p>');
 if(!importOnly&&network?.passport){const b=document.createElement('button');b.className='button-primary';b.textContent='Download captain passport';b.onclick=()=>downloadJSON(network.exportPassport(),'farwake-captain-passport.json');dialog.body.append(b);}
 dialog.body.insertAdjacentHTML('beforeend','<h3>Restore your captain</h3><textarea id="passportText" aria-label="Paste captain passport" placeholder="Paste your captain passport JSON…"></textarea><div class="dialogue-actions"><button id="restorePassport" class="button-primary">Restore captain →</button></div><p id="passportFeedback" class="mini"></p>');
 $('restorePassport').onclick=async()=>{try{const value=JSON.parse($('passportText').value);if(!value?.realmCode||!value?.captainId||!value?.token)throw new Error('This is not a captain passport.');await connectGalaxy({passport:value});}catch(error){$('passportFeedback').textContent=error.message;}};
}
function openOnline(){if(testSession){openTestControls();return;}
 if(!network){dialog.open('A crew beyond the horizon','online',{eyebrow:'PLAY TOGETHER · RETURN WHEN YOU WANT'});dialog.html('<p>Up to ten captains can explore independently, meet at a port, or crew one ship. A shared galaxy remembers your progress even when everyone is offline.</p>');dialog.choices([{label:'Create a shared galaxy',detail:'Start a new galaxy and invite your crew.',action:()=>openConnect('create')},{label:'Join a galaxy',detail:'Use an invite code or a saved captain passport.',action:()=>openConnect('join')},...(readPassport()?[{label:'Resume your shared captain',action:()=>connectGalaxy({passport:readPassport()})}]:[])]);return;}
 sharedCrewUI.openHub();
}
async function disconnectGalaxy(){const owner=network;owner?.setInput({});const cameraSaved=owner?.connected?await cameraProfile.flush():cameraProfile.status!=='offline'&&cameraProfile.status!=='saving';if(network!==owner)return;if(!cameraSaved)reportCameraSaveFailure();owner?.disconnect();network=null;onlineSnapshot=null;game=stored?Game.fromSave(stored):new Game('farwake-'+Date.now());worldPresentation.reset();personPredictedAt=null;personVisualAt=null;personVisualOffset={x:0,y:0};playing=false;surface=null;surfaceKey='';connectionState='offline';activateLocalCamera(localCameraPreferences);dialog.close();$('welcome').hidden=false;$('resumeGalaxy').hidden=!readPassport();document.body.classList.add('welcome-active');updateConnectionHUD();}
function openSharedShip(){if(game.state.npcContract?.active){livelihoodUI.openDuty();return;}sharedCrewUI.openShip();}

function homeName(home){if(!home)return 'Kettle Station · recovery berth';if(home.kind==='bunk'){const v=onlineSnapshot?.fleet?.find(v=>v.id===home.vesselId);return `Bunk ${(home.bunkIndex??0)+1} aboard ${v?.name??'your ship'}`;}const body=game.galaxy.find(s=>s.id===home.systemId)?.bodies.find(b=>b.id===home.locationId);return `${body?.name??home.locationId??'Kettle Station'} · ${home.kind==='room'?'rented room':home.kind==='outpost'?'surface outpost':'recovery berth'}`;}
function openHome(){if(testSession){openTestControls();return;}if(!network){dialog.open('A place to return to','home',{eyebrow:'HOME BERTHS'});dialog.html('<p>Your solo voyage resumes exactly where you saved. In a shared galaxy, your home berth also gives your captain a recovery point after a loss. Rent a port room, establish an outpost, or claim a bunk aboard a ship.</p>');dialog.choices([{label:'Shared galaxy options',action:openOnline},{label:'Back to your ship',action:openShip}]);return;}
 const mp=game.state.multiplayer??{},home=mp.home,inside=game.state.interior?.kind==='ship'||surface?.kind==='ship';dialog.open('Somewhere to come home to','home',{eyebrow:'YOUR PERSISTENT BERTH'});dialog.html(`<div class="guide-card"><span class="eyebrow">CURRENT HOME</span><p>${esc(homeName(home))}<br><span class="mini">${esc(game.galaxy.find(s=>s.id===home?.systemId)?.name??home?.systemId??'Hearth')}</span></p></div><p>A registered home is your recovery point. You can log out and return without waiting for the rest of your crew. A ship bunk travels with its vessel.</p>`);dialog.choices([{label:'Rent a room at this port',detail:costDetail(50)+' · Permanent lodging at an inhabited port.',disabled:!game.atInhabitedPort||!canAfford(50),action:async()=>{if(result(await invoke('setHome',{kind:'room'})))openHome();}},{label:'Establish a surface outpost',detail:costDetail(180,12)+' · Requires a planetary surface.',disabled:game.state.mode!=='person'||!!game.state.interior||!canAfford(180,12)||!['planet','moon'].includes(game.currentBody?.kind),action:async()=>{if(result(await invoke('setHome',{kind:'outpost'})))openHome();}},{label:'Fit an additional ship bunk',detail:costDetail(60,4)+' · Ship owner, aboard your crew deck.',disabled:!inside||!canAfford(60,4),action:async()=>{if(result(await invoke('installBunk')))openHome();}},{label:'Find a bunk on this deck',detail:'Walk to a numbered bunk and use it to register your home.',disabled:!inside,action:()=>{surfaceTarget=surface?.entities.find(e=>e.type==='bunk')?.id;dialog.close();toast('A bunk is marked on your local map.');}},{label:'Back to the crew',action:openOnline}]);}
function openBunk(e){dialog.open(e.name??'Ship bunk','bunk',{eyebrow:'A HOME THAT TRAVELS'});dialog.html('<p>A quiet berth behind the pressure door. Register this bunk as home to recover aboard the vessel. Its owner must have fitted the bunk and granted you access.</p>');dialog.choices([{label:'Make this bunk your home',disabled:!network,action:async()=>{if(result(await invoke('setHome',{kind:'bunk',entityId:e.id,bunkIndex:e.data?.bunkIndex}))){toast('Home berth registered.','good');dialog.close();}}},{label:'Fit another bunk',detail:costDetail(60,4)+' · Owner only.',disabled:!network||!canAfford(60,4),action:async()=>{if(result(await invoke('installBunk')))openBunk(e);}},{label:'Home & recovery details',action:openHome},{label:'Leave the bunk',action:()=>dialog.close()}]);}
function openStation(e){if(game.state.npcContract?.active){livelihoodUI.openDuty();return;}const role=e.data?.stationRole??e.data?.role??'helm',hull=currentDamageHull(),systems=getShipClass(hull.classId).systems;if(testSession&&!['helm','engineering','medical','security','weapons'].includes(role)){openTestControls();return;}dialog.open(e.name??role+' station','station',{eyebrow:'CREW STATION / '+role.toUpperCase()});dialog.html(`<p>${esc({helm:'Take command of the vessel. The ship keeps its momentum when a captain leaves the helm.',engineering:`Keep the hull together. Each repair cycle restores ${systems.repairHull} hull and consumes ${systems.repairEnergy} reactor charge. Local fires and breaches need damage control.`,medical:'Treat the captain and injured crew using the medical systems.',navigation:'Plot the route to the next system. Fold travel is unlocked through ship upgrades.',scanner:'Work the sensors and investigate signals.',security:'Guard the airlocks. During a boarding attack, hold FIRE to engage hostile crew.',weapons:'Operate the ship weapons while another captain pilots.'}[role]??'Work alongside the rest of your crew.')}</p>`);
 const helmState=role==='helm'&&network?currentPerspectiveAction():null;
 const items=[];const captured=role==='helm'&&(game.state.boarding?.kind==='assault'||game.state.multiplayer?.hostileBoarding||game.state.multiplayer?.canTakeHelm);if(captured)items.push({label:'Take this ship’s helm',detail:'Clear its defenders first. You will pilot this hull with its existing damage.',disabled:game.state.boarding?.phase==='active',action:()=>runDeckAction('takeCapturedHelm')});else if(network)items.push({label:helmState?.label||`Work ${role}`,detail:helmState?(helmState.reason||helmState.detail):'Your assigned station is saved with your captain.',disabled:helmState?.enabled===false,action:async()=>{if(result(await invoke('takeStation',{role,entityId:e.id})))dialog.close();}});else if(role==='helm')items.push({label:'Take the helm',action:async()=>{await leaveSurface();dialog.close();}});
 if(role==='engineering')items.push({label:'Repair the hull',disabled:!network&&game.state.interior?.kind==='enemy',detail:!network&&game.state.interior?.kind==='enemy'?'Take this hull’s helm before operating its systems.':`Cost ${systems.repairEnergy} reactor charge · You have ${Math.floor(hull.energy)} · Restores ${systems.repairHull} hull points.`,action:async()=>{if(result(await invoke('crewAction',{action:'repair'})))openStation(e);}});
 if(role==='engineering')items.push({label:'Damage control',detail:damageStatus(hull)||'Inspect compartments, suppress fires, and patch breaches.',action:openDamageOverview});
 if(role==='medical')items.push({label:'Treat injuries',disabled:!network&&game.state.interior?.kind==='enemy',detail:!network&&game.state.interior?.kind==='enemy'?'Take this hull’s helm before operating its systems.':`Cost ${systems.healEnergy} reactor charge · You have ${Math.floor(hull.energy)} · Restores up to ${systems.healPerson} captain / ${systems.healCrew} crew vitality.`,action:async()=>{if(result(await invoke('crewAction',{action:'heal'})))openStation(e);}});
 if(network&&role==='security')items.push({label:'Operate ship weapons',detail:'Work the gunnery console. Hold FIRE while another captain pilots.',action:async()=>{if(result(await invoke('takeStation',{role:'weapons',entityId:e.id})))dialog.close();}});
 if(network&&role==='navigation')items.push({label:'Work the scanner',detail:'Monitor nearby signals while another captain pilots.',action:async()=>{if(result(await invoke('takeStation',{role:'scanner',entityId:e.id})))dialog.close();}});
 if(role==='navigation'||role==='scanner'){items.push({label:'Open navigation chart',action:()=>openMap()});if(network)items.push({label:'Scan the closest signal',detail:'Your captain must be working navigation or the scanner; the vessel must be within scan range.',action:async()=>{const r=await invoke('crewAction',{action:'scan'});if(result(r)){if(r.encounter)openEncounter(r.encounter);else{toast(r.text??'Scan recorded.','good');dialog.close();}}}});}

 if(game.state.boarding?.phase==='active')items.push({label:'Return to the defense',detail:touchLayout?'WALK moves. AIM points and fires; FIRE uses the marked target. Crew casualties are permanent.':'Aim with the mouse or arrows; Click or Space fires. Crew casualties are permanent.',action:()=>dialog.close()});
 if(!testSession)items.push({label:'Crew manifest',action:()=>openCrew()});items.push({label:'Back to the deck',action:()=>dialog.close()});dialog.choices(items);
}

function contextLabel(target){
 if(!target)return '';
 if(target.type==='damageControl')return 'Damage control';
 if(game.state.mode==='ship')return {dock:target.body?.kind==='station'?'Dock':'Land',signal:'Investigate',salvage:'Collect salvage','shared-ship':'Boarding & crew',board:'Board target','parked-ship':'Return to ship',hail:'Hail ship'}[target.type]??'Use';
 if(target.data?.stationRole==='helm')return target.data.helmPilotName?`${target.data.helmPilotName} at helm`:network?currentPerspectiveAction().label:'Use helm';
 if(target.type==='exit'&&game.state.npcContract?.active)return 'Crew duty';
 if(target.type==='exit'&&!game.state.interior&&currentPerspectiveAction().command==='openPortServices')return 'Port services';
 if(target.type==='exit'&&network&&!game.state.interior)return currentPerspectiveAction().label;
 if(target.type==='exit')return target.data?.stationRole==='helm'?'Use helm':surface?.kind==='ship'?'Airlock':'Return to ship';
 if(target.type==='siteEntrance')return 'Enter · '+target.name;
 if(target.type==='siteExit')return 'Return outside';
 if(target.type==='siteRecord')return 'Read · '+target.name;
 if(target.type==='siteCache')return 'Search · '+target.name;
 if(target.type==='siteChoice')return 'Inspect · '+target.name;
 if(target.data?.professionDesk)return 'Public services & work';
 if(target.type==='questObject')return 'Examine · '+target.name;
 if(target.type==='npc'||target.type==='crew')return 'Talk · '+target.name;
 if(target.type==='station'&&target.data?.stationRole==='helm')return 'Use helm';
 return {jobboard:'Use contract exchange',work:'Use relay',crate:'Collect freight',sample:'Collect sample',delivery:'Use loading pad',mechanic:'Visit workshop',medic:'Visit infirmary',bunk:'Use bunk'}[target.type]??'Use · '+target.name;
}
function closeContacts(){$('contactsPanel').hidden=true;$('scannerButton').setAttribute('aria-expanded','false');labelLayoutDirty=true;}
function activateLocalCamera(preferences,{practice=false}={}){
 clearTimeout(cameraSaveTimer);cameraScope=practice?'practice':'local';cameraKey=null;
 cameraProfile.activateLocal(normalizeCameraPreferences(preferences,localCameraPreferences),{practice});
}
function readCameraDraft(key){
 try{return JSON.parse(localStorage.getItem('dfe.farwake.camera-pending.v1:'+key)||'null');}catch{return null;}
}
function persistCameraDraft(){
 if(cameraScope!=='shared'||!cameraKey)return;
 try{const key='dfe.farwake.camera-pending.v1:'+cameraKey,draft=cameraProfile.exportPending();if(draft)localStorage.setItem(key,JSON.stringify(draft));else localStorage.removeItem(key);}catch{}
}
function reportCameraSaveFailure(){
 toast(readCameraDraft(cameraKey)?'Camera changes are waiting on this device. They will retry when you return, unless newer settings are already saved with your captain.':'Camera changes have not reached the server. Your last saved camera settings will return with your captain.','info',6500);
}
function receiveCameraPreferences(packet){
 const passport=network?.passport;if(!passport||!packet.cameraPreferences||!Number.isInteger(packet.cameraRevision))return;
 const key=passport.realmCode+':'+passport.captainId;
 if(cameraScope!=='shared'||cameraKey!==key){
  clearTimeout(cameraSaveTimer);cameraScope='shared';cameraKey=key;const owner=network;
  cameraProfile.activateShared({key,preferences:packet.cameraPreferences,revision:packet.cameraRevision,seedPreferences:localCameraPreferences,pendingChanges:readCameraDraft(key),send:args=>{
   if(network!==owner||!owner.connected)return Promise.reject(new Error('Camera changes will save after reconnection.'));
   return owner.command('setCameraPreferences',args,{timeoutMs:5000});
  }});
 }else cameraProfile.receiveShared({key,preferences:packet.cameraPreferences,revision:packet.cameraRevision});
}
function applyCameraState(preferences){
 const changed=settings.shipZoom!==preferences.shipZoom||settings.personZoom!==preferences.personZoom;
 const localCameraChanged=game.state.cameraPreferences?.shipZoom!==preferences.shipZoom||game.state.cameraPreferences?.personZoom!==preferences.personZoom;
 Object.assign(settings,preferences);if(cameraScope==='local')localCameraPreferences={...preferences};
 applySettings(settings,{cameraPreferences:localCameraPreferences});persistCameraDraft();syncViewControls();
 if(cameraScope==='local'&&!network&&!testSession){game.state.cameraPreferences={...preferences};if(!playing&&stored?.seed===game.state.seed)stored.cameraPreferences={...preferences};}
 if(!changed)return;
 clearPointerAim();labelLayoutDirty=true;hudDirty=true;queueResize();
 if(localCameraChanged&&cameraScope==='local'&&(playing||stored)&&!network&&!testSession){
  const owner=game;clearTimeout(cameraSaveTimer);
  cameraSaveTimer=setTimeout(()=>{if(cameraScope!=='local'||game!==owner||network||testSession)return;if(playing)saveNow();else if(stored&&saveGame(game))stored=game.state;},300);
 }
}
function syncViewControls(){
 for(const mode of ['ship','person']){
  const zoom=normalizeModeZoom(settings[mode+'Zoom'],mode),limits=zoomLimits(mode);
  $(mode+'Zoom').value=String(zoom);hudText($(mode+'ZoomValue'),Math.round(zoom*100)+'%');
  $(mode+'Zoom').setAttribute('aria-valuetext',Math.round(zoom*100)+' percent '+mode+' zoom');
  $(mode+'ZoomOut').disabled=zoom<=limits.min;$(mode+'ZoomIn').disabled=zoom>=limits.max;$(mode+'ZoomActive').hidden=game.state.mode!==mode;
  const setting=$('setting-'+mode+'Zoom');if(setting){setting.value=String(zoom);const title=document.querySelector('label[for="setting-'+mode+'Zoom"] strong');if(title)hudText(title,(mode==='ship'?'Ship':'Person')+' zoom · '+Math.round(zoom*100)+'%');}
 }
 const status=cameraProfile.status;
 hudText($('cameraSaveStatus'),status==='practice'?'Practice only · Your saved cameras stay unchanged':status==='saving'?'Saving camera settings…':status==='offline'?'Camera changes waiting for reconnection':status==='saved'?'Saved with your captain · Available on other devices':'Saved in this browser · Included in voyage exports');
 $('viewImmersive').checked=settings.immersiveHud;$('viewTranslucent').checked=settings.translucentHud;$('viewCompactTips').checked=settings.compactTips;
}
function setModeZoom(mode,value){
 cameraProfile.set(mode,value);updatePerformanceHUD();
}
function setViewPreference(key,value){
 if(!['immersiveHud','translucentHud','compactTips'].includes(key))return;
 settings[key]=!!value;applySettings(settings,{cameraPreferences:localCameraPreferences});controls?.clear();clearPointerAim();coachExpanded=false;document.body.classList.remove('coach-expanded');resize();syncViewControls();hudDirty=true;
}
function resetView(){
 Object.assign(settings,{immersiveHud:true,translucentHud:true,compactTips:true});cameraProfile.set('ship',zoomLimits('ship').default);cameraProfile.set('person',zoomLimits('person').default);applySettings(settings,{cameraPreferences:localCameraPreferences});controls?.clear();clearPointerAim();coachExpanded=false;document.body.classList.remove('coach-expanded');resize();syncViewControls();hudDirty=true;
}
function setViewPanel(open,{restoreFocus=true}={}){
 if(open&&(!playing||dialog.opened))return;
 const wasOpen=viewPanelOpen;viewPanelOpen=!!open;
 $('viewPanel').hidden=!viewPanelOpen;$('viewButton').setAttribute('aria-expanded',String(viewPanelOpen));document.body.classList.toggle('view-open',viewPanelOpen);labelLayoutDirty=true;hudDirty=true;
 if(viewPanelOpen){controls?.clear();clearPointerAim();closeContacts();setToolTray(false);hideCoach();syncViewControls();$(game.state.mode+'Zoom').focus({preventScroll:true});}
 else if(wasOpen&&restoreFocus)$('viewButton').focus({preventScroll:true});
}
function setToolTray(open){toolTrayOpen=!!open;document.body.classList.toggle('tools-open',toolTrayOpen);$('toolTray').hidden=!toolTrayOpen;$('toolsButton').setAttribute('aria-expanded',String(toolTrayOpen));labelLayoutDirty=true;}
function updateMobileHUD(ship,target){
 const onFoot=game.state.mode==='person',combat=personCombat(),body=game.currentBody,speed=Math.round(Math.hypot(ship.vx,ship.vy)),alarm=!onFoot||aboardDamageHull()?damageStatus(currentDamageHull()):'';
 document.body.classList.toggle('crew-gunner',onFoot&&armedOnFoot()&&!combat);document.body.classList.toggle('performance-visible',!!settings.showPerformance);
 hudText($('mobileLocation'),onFoot?body?.name??surface?.name??'Crew deck':game.currentSystem.name);
 hudText($('mobileHealth'),onFoot?'Vitality '+Math.ceil(game.state.person.health)+' / '+(game.state.person.maxHealth||100):'Hull '+Math.ceil(ship.hull));hudText($('mobileShield'),'Shield '+Math.ceil(ship.shield));hudText($('mobileSpeed'),alarm||(onFoot?(combat?$('weaponState').textContent:surface?.kind==='ship'?'Crew deck':surface?npcClock(npcTime(),surface).text+' local':'On foot'):speed+' m/s'));
 $('mobileReadout').classList.toggle('danger',!!alarm||(onFoot?game.state.person.health<30:ship.hull/ship.maxHull<.3));
 $('mobileReadout').setAttribute('aria-label',`${$('mobileLocation').textContent}. ${$('mobileHealth').textContent}. ${onFoot?'':$('mobileShield').textContent+'. '}${$('mobileSpeed').textContent}. Open ship status.`);
 $('stick').setAttribute('aria-label',onFoot?'Walking joystick. Move toward an open passage.':'Steering and thrust joystick. Point where you want to fly; release to coast.');
 $('aimStick').setAttribute('aria-label',onFoot?'Aim and fire joystick. Point toward a hostile.':'Strafe joystick. Move left or right relative to the bow. Vertical movement does nothing.');
 hudText($('aimKnob').querySelector('span'),onFoot?'✛':'↔');
 const visible=playing&&combat;if($('mobileWeapon').hidden===visible){$('mobileWeapon').hidden=!visible;labelLayoutDirty=true;}
 if(visible){hudText($('mobileWeaponState'),$('weaponState').textContent);const remaining=personHostiles().filter(e=>e.health>0).length;hudText($('mobileAim'),combatPreview?.blocked?'Wall in the way':combatPreview?.target?'Target · '+(combatPreview.target.name??'Hostile'):remaining?remaining+' hostile'+(remaining===1?'':'s'):'No movement detected');}
 $('contextButton').dataset.action=target?.type??'none';
 if(onFoot&&toolTrayOpen)setToolTray(false);
}
function selectGuide(){
 const mp=game.state.multiplayer??{},passport=network?.passport,previous=tutorial.controller?.profileId;
 tutorial.select({seed:game.state.seed,captainId:passport?.captainId??mp.captainId,realmId:passport?.realmCode??mp.realmCode,testId:testSession?game.state.seed:null,mode:settings.guidance});
 if(previous!==tutorial.controller.profileId){dismissedRoute='';dismissedGuideEpisode='';coachPrompt=null;guideIntent=null;}
}
function workFinished(entity){return entity?.type==='work'&&game.state.activityTokens.some(token=>token.endsWith(':work:'+currentWorkToken(entity))||token.endsWith(':work:'+entity.id+':local')||token.endsWith(':work:'+entity.id+':local:'));}
function guidanceContext(target=nearby()){
 const s=game.state,onFoot=s.mode==='person',mp=s.multiplayer??{},ship=s.ship,boarding=s.boarding,perspective=currentPerspectiveAction();
 const port=target?.type==='dock'?target.body:game.system.bodies.find(b=>b.id===tracked),rock=game.system.asteroids.filter(a=>a.hp>0).sort((a,b)=>distance(a,ship)-distance(b,ship))[0];
 const job=s.missions.find(m=>m.status!=='completed'&&m.targetBody===s.locationId&&m.targetSystem===s.systemId),vessel=target?.vessel;
 const near=target?{type:target.type,id:target.id,name:target.name,inRange:true,disabled:target.enemy?.disabled??vessel?.disabled,hostile:target.type==='board'||vessel?.hostile,completed:workFinished(target),stationRole:target.data?.stationRole,controlLabel:contextLabel(target)}:null;
 return {playing,blocked:dialog.opened||!playing,mode:s.mode,device:touchLayout?'touch':'keyboard',leftHanded:settings.leftHanded,systemId:s.systemId,locationId:s.locationId,vesselId:mp.aboardVesselId??s.interior?.targetId??s.ship.id,intent:guideIntent??(!onFoot&&port?'dock':null),
  ship:{speed:Math.hypot(ship.vx,ship.vy),heavy:getShipClass(ship.classId).stats.mass>2,threat:game.system.enemies.some(e=>e.hp>0&&!e.disabled&&distance(e,ship)<800)},nearby:near,
  docking:!onFoot&&port?{id:port.id,name:port.name,inRange:distance(ship,port)<=port.radius+150,speed:Math.hypot(ship.vx,ship.vy),safeSpeed:35}:null,
  mining:!onFoot&&rock?{id:rock.id,inRange:distance(ship,rock)<getShipClass(ship.classId).systems.miningReach+rock.radius,holdFull:game.cargoUsed>=ship.cargoCap}:null,
  person:onFoot?{health:s.person.health,down:s.person.down}:undefined,
  combat:{active:personCombat()&&(!s.exploration||personHostiles().some(enemy=>enemy.health>0)),ready:elapsed-localShotAt>=sidearmDelay(),aiming:!!combatPreview?.manual,targetVisible:combatPreview?.target?true:undefined,blocked:!!combatPreview?.blocked},
  boarding:boarding?{id:boarding.id,kind:boarding.kind,phase:boarding.phase,canReturn:mp.canReturn??(boarding.kind==='assault'&&s.ship.hull>0),atAirlock:target?.type==='exit'&&target.data?.stationRole!=='helm',atHelm:target?.data?.stationRole==='helm',canTakeHelm:perspective.command==='quickHelm'?perspective.enabled:mp.canTakeHelm??boarding.phase==='won'}:null,
  job:job?{id:job.id,type:job.type,accepted:true,ready:job.status==='ready',nearBoard:target?.type==='jobboard',nearWork:job.type==='work'&&target?.type==='work',workCompleted:workFinished(target)}:{nearBoard:target?.type==='jobboard',nearWork:target?.type==='work',workCompleted:workFinished(target)},
  shared:target?.type==='shared-ship'?{id:vessel.id,name:vessel.name,canBoard:vessel.canBoard,inRange:true,permissionNeeded:!vessel.canBoard,canManageCrew:vessel.ownerId===mp.captainId,ownerName:onlineSnapshot?.presence?.find(c=>c.captainId===vessel.ownerId)?.name}:null,
  helm:{available:perspective.command==='quickHelm'&&perspective.enabled,quick:perspective.command==='quickHelm',label:perspective.label,near:target?.data?.stationRole==='helm'}
 };
}
let dismissedRoute='',dismissedGuideEpisode='';
function guideEpisode(context){return JSON.stringify([tutorial.controller?.profileId,context.mode,context.systemId,context.locationId,context.vesselId,context.nearby?.id,context.boarding?.phase,context.device,tutorial.controller?.revision]);}
function routePrompt(){
 if(settings.guidance!=='simple'||game.state.mode!=='person'||personCombat()||game.state.boarding||game.openingMissionStatus?.().active)return null;
 const s=game.state,job=s.missions.find(m=>m.status!=='completed'&&m.targetBody===s.locationId&&m.targetSystem===s.systemId),entities=surface?.entities??[];
 let destination=null,title='',body='';
 if(job?.status==='ready'){destination=entities.find(e=>e.type==='jobboard');title='Collect your contract payment';body='Follow the marker back to the contract exchange. Use it to turn in your completed work.';}
 else if(job?.type==='work'){destination=entities.find(e=>e.type==='work'&&!workFinished(e));title='Find the amber relay';body='Follow the marker to an unfinished relay. Walk close, then use it to start the calibration.';}
 else if(s.locationId==='kettle'&&game.ownsShip&&s.openingMission?.status==='completed'&&!s.flags.includes('talked_mechanic')){destination=entities.find(e=>e.type==='mechanic');title='Meet the shipwright';body='Your first job is paid. Iona is in the marked workshop north of the concourse.';}
 else if(!s.flags.includes('accepted_job')&&(s.locationId==='kettle'||!game.ownsShip)){destination=entities.find(e=>e.type==='jobboard');title='Find your first job';body='Follow the marker to the contract exchange. Walk close, then use it to choose a local job.';}
 else if(s.npcContract?.active){const duty=game.npcContractStatus();return{id:'route:crew:'+duty.id+':'+duty.phase,title:duty.roleName,body:duty.canFinish?'Tap Crew duty to collect your wages and disembark.':duty.task,compactBody:duty.canFinish?'Crew duty → collect your wages.':duty.task,flow:'route',controlTarget:'modePill'};}
 else if(surface?.kind==='ship'){const action=currentPerspectiveAction();if(action.command!=='quickHelm'||!action.enabled||tutorial.controller?.count('take-helm')>=2)return null;return {id:'route:'+s.locationId+':perspective',title:'Your ship’s crew deck',body:`Explore the rooms. ${action.label} at the top returns you to flying this ship.`,compactBody:`${action.label} at the top returns to ship view.`,flow:'route',controlTarget:'modePill'};}
 else if(s.locationId==='kettle'&&!s.completedChapters.length){destination=entities.find(e=>e.data?.story);title='Meet the people here';body='The workshop is marked. Walk up to its contact and talk to learn what comes next.';}
 if(!destination)return null;
 if(!surfaceTarget)surfaceTarget=destination.id;
 return {id:'route:'+s.locationId+':'+destination.id+':'+(job?.status??''),title,body,compactBody:'Follow the marker. Use the highlighted contact.',flow:'route',controlTarget:'stick'};
}
function hideCoach(){
 if(highlightedControl){highlightedControl.classList.remove('coach-highlight');highlightedControl=null;}
 if(!$('coachCard').hidden){$('coachCard').hidden=true;labelLayoutDirty=true;}document.body.classList.remove('coach-visible');
}
function showCoach(prompt){
 if(!prompt){hideCoach();coachPrompt=null;return;}
 const changed=coachPrompt?.id!==prompt.id;coachPrompt=prompt;
 if(changed)coachExpanded=false;document.body.classList.toggle('coach-expanded',coachExpanded);
 if(changed&&prompt.controlTarget==='mineButton'&&touchLayout)setToolTray(true);
 if($('coachCard').hidden){$('coachCard').hidden=false;labelLayoutDirty=true;}document.body.classList.add('coach-visible');
 hudText($('coachStep'),prompt.requested?'ACTION HELP':prompt.flow==='route'?'YOUR NEXT STEP':prompt.completed?'A QUICK REMINDER':'LEARN AS YOU GO');
 if(hudText($('coachTitle'),prompt.title))labelLayoutDirty=true;
 const compact=touchLayout&&!coachExpanded&&(settings.compactTips||settings.textScale>=1.25||window.innerHeight<500),body=compact?prompt.compactBody??prompt.body:prompt.body;if(hudText($('coachBody'),body))labelLayoutDirty=true;
 $('coachExpand').setAttribute('aria-expanded',String(coachExpanded));$('coachExpand').setAttribute('aria-label',coachExpanded?'Collapse this action tip':'Expand this action tip');hudText($('coachExpand'),coachExpanded?'−':'+');
 let target=$(prompt.controlTarget);if(prompt.controlTarget==='onlineButton'&&touchLayout)target=$('pauseButton');if(prompt.controlTarget==='weaponState'&&touchLayout)target=$('mobileWeaponState');if(prompt.controlTarget==='mineButton'&&!toolTrayOpen)target=$('toolsButton');
 if(!touchLayout&&['stick','aimStick','fireButton','brakeButton','mineButton'].includes(prompt.controlTarget))target=null;
 if(highlightedControl!==target){highlightedControl?.classList.remove('coach-highlight');highlightedControl=target;if(target?.getBoundingClientRect().width)target.classList.add('coach-highlight');}
}
function updateGuidance(target){
 if(!playing||dialog.opened||viewPanelOpen){hideCoach();return;}selectGuide();
 const context=guidanceContext(target),prompt=tutorial.update(context),opening=game.openingMissionStatus?.();
 const intro=settings.guidance==='simple'&&opening?.active&&!context.combat.active&&!context.ship.threat&&!game.state.boarding&&!game.state.cosmicWarning&&!game.state.npcContract?.active?openingPrompt(opening,{mode:game.state.mode,touch:touchLayout,nearby:target,perspective:currentPerspectiveAction(),mining:context.mining,interior:!!game.state.interior}):null;
 let next=damageGuide(target)??intro??prompt??(dismissedGuideEpisode===guideEpisode(context)?null:routePrompt());
 if(next?.id===dismissedRoute)next=null;showCoach(next);
}
function recordGuide(action,id=null){selectGuide();if(!tutorial.context)tutorial.update(guidanceContext());return tutorial.record(action,id);}
function recordGuideEvent(event){
 const id=network?.passport?.captainId??game.playerId??'local',local=event.attackerId===id||event.shooterId===id||event.ownerId===id||!network&&(event.attackerId==='local'||event.type==='shot');
 if(['shot','person-shot','person-hit'].includes(event.type))tutorial.shot(event,{local,mode:game.state.mode});
 if(local&&event.type==='mined')recordGuide('mine',event.id);if(local&&event.type==='salvage')recordGuide('salvage',event.id);
}
function guideMotionState(){const s=game.state,ship=network?.predictedShip??s.ship,p=s.person;return {mode:s.mode,ship:{x:ship.x,y:ship.y,vx:ship.vx,vy:ship.vy,angle:ship.angle},person:{x:p.x,y:p.y,health:p.health,down:p.down}};}
function requestActionHelp({repeat=false}={}){
 dialog.close();selectGuide();const context=guidanceContext();tutorial.update(context);
 if(settings.guidance==='expert'){openHelp();return;}
 const prompt=repeat?tutorial.controller.repeat(context):tutorial.controller.requestHelp(context);dismissedRoute='';dismissedGuideEpisode='';showCoach(prompt??routePrompt());hudDirty=true;
}
function openFlightMenu(){
 if(!playing){openSettings();return;}
 dialog.open('Captain’s menu','flight-menu',{eyebrow:testSession?'ISOLATED PRACTICE':network?'SHARED GALAXY · STILL RUNNING':'SOLO VOYAGE · PAUSED'});
 dialog.html(`<div class="flight-menu-goal"><small>${esc($('objectiveKind').textContent)}</small><strong>${esc($('objectiveTitle').textContent)}</strong><p>${esc($('objectiveText').textContent)}</p></div><div id="flightMenuGrid" class="flight-menu-grid"></div>`);
 const entries=[['Map',game.state.mode==='person'?'Find a person or place':'Set your next course',()=>openMap(game.state.systemId,game.state.mode==='person'?'local':'galaxy')],['Log','Story & current jobs',()=>openJournal()],[game.ownsShip?'Ship':'Captain',game.ownsShip?'Cargo, systems & crew':'Work, travel & your first ship',()=>openShip()],['Port services','Paid passage & crew work',()=>livelihoodUI.openPort()],['Crew','Friends & boarding',()=>openOnline()],['Action help','Show the next useful step',()=>requestActionHelp()],['Settings','Text, controls & guidance',()=>openSettings()],['View','Camera zoom & screen layout',()=>{dialog.close();setViewPanel(true);}]];
 if(game.openingMissionStatus?.().active)entries.unshift(['A small favor','Your current opening job',()=>openingUI.openLog()]);
 if(aboardDamageHull())entries.push(['Damage control',damageStatus(currentDamageHull())||'Inspect this hull’s compartments',openDamageOverview]);
 if(testSession){entries[1]=['Exercise','Retry or change scenario',openTestControls];entries[3]=['Sidearm','Aim, fire & board',openCombatHelp];}
 if(game.state.mode==='ship')entries.push(['Contacts','Track a nearby port or signal',()=>{dialog.close();$('contactsPanel').hidden=false;$('scannerButton').setAttribute('aria-expanded','true');labelLayoutDirty=true;hudDirty=true;}]);
 const grid=$('flightMenuGrid');for(const[label,detail,action]of entries){const button=document.createElement('button');button.innerHTML=`<span class="menu-symbol">${navIcon(label)}</span><span><strong>${esc(label)}</strong><small>${esc(detail)}</small></span>`;button.onclick=action;grid.append(button);}
 dialog.choices([{label:'Resume',action:()=>dialog.close()}]);
}

function performanceSummary(){const metrics=frameMonitor.summary();return `${metrics.fps?Math.round(metrics.fps):'…'} FPS${network?` · ${Math.round(network.latency.rtt||0)} ms`:''}`;}
function performanceReport(){
 const metrics=frameMonitor.summary(),latency=network?.latency,lines=['FARWAKE 0.5.3',`Mode: ${testSession?'isolated test':network?'shared galaxy':'solo'} / ${game.state.mode}`,`Frame rate: ${metrics.fps.toFixed(1)} FPS`,`Frame interval p95: ${metrics.frameP95.toFixed(1)} ms`,`Longest recent frame: ${metrics.frameMax.toFixed(1)} ms`];
 if(network)lines.push(`Connection: ${connectionState}`,`Round-trip ping: ${Math.round(latency?.rtt||0)} ms`,`Server updates: ${metrics.updateHz.toFixed(1)} / second`,`Update gap p95: ${metrics.updateP95.toFixed(1)} ms`,`Longest recent update gap: ${metrics.updateMax.toFixed(1)} ms`);
 lines.push(`World pixels: ${pixelView.logicalWidth} × ${pixelView.logicalHeight}`,`Presentation: ${canvas.width} × ${canvas.height} / ${pixelView.physicalPixelsPerPixel} device pixels per world pixel`,`Ship zoom: ${Math.round(settings.shipZoom*100)}% / Person zoom: ${Math.round(settings.personZoom*100)}%`,`Mobile view: ${settings.immersiveHud?'fills screen':'framed'} / ${settings.translucentHud?'translucent':'solid'} controls`,`Text scale: ${Math.round(settings.textScale*100)}%`,`Reduced motion: ${settings.reduceMotion?'on':'off'}`);return lines.join('\n');
}
function updatePerformanceHUD(){const report=$('performanceReport');if(report)hudText(report,performanceReport());if(playing&&settings.showPerformance)hudText($('coordinate'),performanceSummary());}
function refreshLabelLayout(){
 if(!labelLayoutDirty)return;
 const rect=labelCanvas.getBoundingClientRect();
 labelLayout={width:rect.width,height:rect.height,dpr:labelCanvas.width/Math.max(1,rect.width),boxes:[]};
 for(const element of labelObstacles){if(element.hidden||getComputedStyle(element).visibility==='hidden')continue;const box=element.getBoundingClientRect();if(!box.width||!box.height)continue;labelLayout.boxes.push({x:box.left-rect.left-6,y:box.top-rect.top-6,w:box.width+12,h:box.height+12});}
 labelLayoutDirty=false;
}
function drawLabels(labels){
 refreshLabelLayout();const{width,height,dpr}=labelLayout;
 labelCtx.setTransform(dpr,0,0,dpr,0,0);labelCtx.clearRect(0,0,width,height);if(!labels.length)return;
 const occupied=labelLayout.boxes.slice();let drawn=0;labelCtx.textBaseline='middle';labelCtx.lineJoin='miter';
 for(const label of labels.sort((a,b)=>(b.priority??0)-(a.priority??0))){
  if(!label.text||touchLayout&&drawn>=4)continue;const size=Math.max(12,label.size??13)*settings.textScale,x=Math.round(label.x*pixelView.cssScale+pixelView.offsetX),y=Math.round(label.y*pixelView.cssScale+pixelView.offsetY);
  if(x<8||y<8||x>width-8||y>height-(touchLayout?14:83))continue;
  const font=`${label.kind==='heading'?'bold ':''}${size}px Verdana,sans-serif`,key=font+'|'+label.text;labelCtx.font=font;
  let textWidth=labelWidths.get(key);if(textWidth===undefined){textWidth=labelCtx.measureText(label.text).width;if(labelWidths.size>=512)labelWidths.delete(labelWidths.keys().next().value);labelWidths.set(key,textWidth);}
  const align=label.align??'center',left=x-(align==='center'?textWidth/2:align==='right'?textWidth:0),box={x:left-5,y:y-size*.6-4,w:textWidth+10,h:size*1.2+8};
  if(box.x<5||box.x+box.w>width-5)continue;if(occupied.some(o=>box.x<o.x+o.w&&box.x+box.w>o.x&&box.y<o.y+o.h&&box.y+box.h>o.y))continue;
  occupied.push(box);drawn++;labelCtx.textAlign=align;labelCtx.fillStyle='#07111dd9';labelCtx.fillRect(Math.round(box.x),Math.round(box.y),Math.ceil(box.w),Math.ceil(box.h));labelCtx.lineWidth=3;labelCtx.strokeStyle='#07111d';labelCtx.strokeText(label.text,x,y);labelCtx.fillStyle=label.color??'#e5eee6';labelCtx.fillText(label.text,x,y);
 }
}

function frame(now){frameMonitor.frame(now,!document.hidden);const rawDt=Math.max(0,(now-(lastTime||now))/1000),dt=Math.min(.1,rawDt);lastTime=now;elapsed+=dt;const active=playing&&!dialog.opened&&!document.hidden;const input=active&&!actionPending?controls.vector():{};input.flightAssist=settings.flightAssist;if(active&&!actionPending&&personCombat()){if(pointerAim.active&&!input.aiming){const aim=surfaceCanvasToWorld(pointerAim.x,pointerAim.y,surfaceView),dx=aim.x-game.state.person.x-personVisualOffset.x,dy=aim.y-game.state.person.y-personVisualOffset.y,length=Math.hypot(dx,dy);if(length>.5){input.aimX=dx/length;input.aimY=dy/length;input.aiming=true;}}if(pointerAim.fire)input.fire=true;}
 const guideBefore=active?guideMotionState():null;
 if(playing){if(network){
  network.setInput(input,rawDt);
  if(network.connected){
   if(game.state.mode==='ship'){network.predictShip(dt,input);if(network.predictedShip)Object.assign(game.state.ship,network.predictedShip);}
    else{ensureSurface();advanceOnlinePerson();}
  }
 }
 else if(active){stepAccumulator+=dt;let count=0;while(stepAccumulator>=1/60&&count<10){game.step(1/60,input);if(game.state.mode==='person'){ensureSurface();game.state.person.speed=(input.boost?155:112)*(game.characterEffects?.walkSpeed??1);if(surface&&game.state.person.health>0&&!game.state.person.down)movePerson(surface,game.state.person,input.x,input.y,1/60);else game.state.person.moving=false;}stepAccumulator-=1/60;count++;}}
 else stepAccumulator=0;
 if(active&&game.state.mode==='person'){if(!armedOnFoot()&&input.fire&&!wasFire)interact();if(input.mine&&!wasMine&&!dialog.opened)openJournal('missions');if(game.state.person.moving)audio.play('footstep');}wasFire=!!input.fire;wasMine=!!input.mine;tutorial.observe(input,guideBefore,guideMotionState(),dt,{active,combat:personCombat()});processEvents();if(active&&game.state.pendingEncounter)openEncounter(game.getEncounter());saveTimer+=dt;if(saveTimer>12){saveNow();saveTimer=0;}if(active){audio.atmosphere(game.state.stats.time,game.state.mode,settings.music);if(game.state.exploration){const sound=audio.siteAtmosphere(elapsed,surface?.atmosphere);if(sound)recordCombatFeed(sound);}else audio.siteSoundKind=null;}
 }else{stepAccumulator=0;wasFire=false;wasMine=false;}
 updateAmbientLife(active);
 const deckHull=playing&&(aboardDamageHull()||game.state.mode==='person'&&game.state.interior?.kind==='eva')?currentDamageHull():null,interiorView=interiorPresentation.sample(deckHull,elapsed,{visible:!!deckHull&&!document.hidden,motion:!settings.reduceMotion});
 if(active&&interiorView.fresh.length)audio.play('bulkhead');
 audio.interiorAlarm(elapsed,{active:active&&!!deckHull&&interiorView.alarm});
 if(active&&interiorView.newEmergency){hudDirty=true;toast('Damage aboard '+(deckHull.name||'this ship')+'. Reach the marked compartment for damage control.','bad',5000);}
 const cameraMode=playing?game.state.mode:'ship',cameraZoom=playing?settings[cameraMode+'Zoom']:1;if(renderCameraKey!==cameraMode+':'+cameraZoom){resize();syncViewControls();}
 const w=pixelView.logicalWidth,h=pixelView.logicalHeight,labels=[],remotes=network?.sampleRemotes()??{remoteShips:[],players:[]},presentation=playing&&network?worldPresentation.sample(Date.now()+network.clockOffset):null;if(playing&&game.state.mode==='person'){ensureSurface();if(surface){const person={...game.state.person,x:game.state.person.x+personVisualOffset.x,y:game.state.person.y+personVisualOffset.y};const remotePeople=remotes.players.filter(p=>p.captainId!==network?.passport?.captainId&&p.roomId===onlineSnapshot?.room?.id);const boarding=game.state.boarding,expedition=game.state.exploration?.encounter;combatPreview=personCombat()?sidearmAim(game.state.person,personHostiles(),input,expedition?surface.combatLayout:boarding.shipClass):null;const playerTeams=new Map([...(boarding?.enemies??[]).map(p=>[p.id,'hostile']),...(boarding?.allies??[]).map(p=>[p.id,'friendly'])]);for(const remote of remotePeople)if(playerTeams.has(remote.captainId))remote.team=playerTeams.get(remote.captainId);const camera=drawSurface(ctx,surface,{person,width:w,height:h,zoom:settings.personZoom,rasterScale:pixelView.rasterScale,time:settings.reduceMotion?0:elapsed,damageControl:deckHull?.damageControl,damageHits:interiorView.hits,damageMotion:!settings.reduceMotion,cameraShake:{x:interiorView.shake.x/settings.personZoom,y:interiorView.shake.y/settings.personZoom},flags:game.state.flags,mission:{targetEntityId:surfaceTarget},labels,remotePeople,homes:onlineSnapshot?.homes??[],localCaptainId:network?.passport?.captainId,boardingActors:boarding?((boarding.phase==='active'?presentation?.boardingActors:null)??[...boarding.enemies,...boarding.allies]).filter(actor=>!actor.human&&!actor.captainId):[],boarding,exploration:expedition?{...expedition,monsters:presentation?.explorationActors??expedition.monsters}:null,combat:{active:personCombat(),aim:combatPreview},combatEffects:combatPresentation.sample(elapsed),effectTime:elapsed,combatTime:expedition?.time??boarding?.combatTime??game.state.stats.time});surfaceView=camera;if(surfaceTarget&&settings.guidance!=='expert'){const target=surface.entities.find(e=>e.id===surfaceTarget);if(target){const{x,y}=surfaceWorldToCanvas(target.x,target.y,camera);const cueScale=pixelView.rasterScale??1;if(x<25*cueScale||x>w-25*cueScale||y<35*cueScale||y>h-65*cueScale){const px=Math.max(28*cueScale,Math.min(w-28*cueScale,x)),py=Math.max(38*cueScale,Math.min(h-65*cueScale,y)),angle=Math.atan2(y-h/2,x-w/2);ctx.save();ctx.translate(px,py);ctx.scale(cueScale,cueScale);ctx.rotate(angle);ctx.fillStyle='#ffce75';ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4);ctx.lineTo(-4,4);ctx.fill();ctx.restore();labels.push({text:target.name,x:px+(x>w/2?-12:12)*cueScale,y:py+3*cueScale,align:x>w/2?'right':'left',size:13,color:'#ffe1a5',priority:100});}}}}}
 else{if(!playing){const small=w<450;Object.assign(attract.system.bodies[0],{x:small?120:300,y:small?-150:-110,radius:small?190:220});}renderer.draw(ctx,playing?game:attract,{width:w,height:h,time:elapsed,welcome:!playing,tracked,waypoint:narrativeWaypoint,zoomMultiplier:playing?settings.shipZoom:1,rasterScale:pixelView.rasterScale,guidance:settings.guidance,motion:!settings.reduceMotion,labels,remoteShips:remotes.remoteShips,world:presentation?.world,ship:playing?network?.renderedShip:undefined,dt});if(playing&&!$('contactsPanel').hidden)renderer.radar($('radarCanvas').getContext('2d'),game,tracked);}
 if(interiorView.flash>0){ctx.fillStyle=`rgba(235,217,185,${interiorView.flash})`;ctx.fillRect(0,0,w,h);}
 drawLabels(playing?labels:[]);if(transitionFlash>0&&!settings.reduceMotion){transitionFlash=Math.max(0,transitionFlash-dt*.8);ctx.fillStyle=`rgba(178,225,218,${transitionFlash*.5})`;ctx.fillRect(0,0,w,h);}
 if(ctx!==presentationCtx){beginPixelFrame(presentationCtx);presentationCtx.drawImage(worldCanvas,0,0,canvas.width,canvas.height);}
 hudTimer+=dt;if(hudTimer>.2){if(playing&&(active||hudDirty))updateHUD();updateConnectionHUD();updatePerformanceHUD();hudTimer=0;}requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
