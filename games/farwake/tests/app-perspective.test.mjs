import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game} from '../dist/engine.mjs';
import {generateSurface,isWalkable} from '../dist/surface.mjs';
import {syncDamageMarkers} from '../dist/interior-presentation.mjs';
import {rescueOccupants} from '../dist/rescue-rules.mjs';
import {getPerspectiveAction} from '../dist/perspective-controls.mjs';
import {normalizeModeZoom,zoomLimits} from '../dist/camera-preferences.mjs';
import {TutorialRuntime} from '../dist/tutorial-runtime.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

// Run the application handlers against real game rules. Only browser rendering,
// storage and the asynchronous transport are replaced at their boundaries.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
function declaration(name){
  const index=declarations.findIndex(match=>match[1]===name);
  assert.ok(index>=0,`The application declares ${name}.`);
  return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);
}
const appCode=['currentPerspectiveAction','updatePerspectiveControl','clearPerspectiveInput','switchPerspective','clearPointerAim','command','invoke','performInvoke','openCrewDeparture','runDeckAction','result','saveNow','ensureSurface','updateSurfaceFlags','currentDamageHull','aboardDamageHull','syncDeckDamage','syncViewControls','selectGuide'].map(declaration).join('\n');
const copy=value=>JSON.parse(JSON.stringify(value));
const pose=ship=>Object.fromEntries(['id','x','y','vx','vy','angle','angularVelocity','hull','shield','fuel'].map(key=>[key,ship[key]]));
function element(){return{hidden:false,disabled:false,textContent:'',value:'',dataset:{},attributes:{},setAttribute(key,value){this.attributes[key]=String(value);}};}
function fixture({shared=false,game=new Game('app-perspective')}={}){
  const elements=new Map(),calls=[],packets=[],inputs=[],toasts=[],writes=[],resizes=[],focus=[],viewPanels=[],events=[];
  const tutorial=new TutorialRuntime({nonce:'app-perspective'}),cameraPreferences={shipZoom:.25,personZoom:.8};
  let heldInput={thrust:1,strafe:1,x:1,fire:true,mine:true},clearCount=0,context;
  const network=shared?{connected:true,command(name,args){return new Promise((resolve,reject)=>packets.push({name,args,resolve,reject}));},setInput(input){inputs.push(copy(input));}}:null;
  if(shared)game.state.multiplayer={captainId:'captain',ownedVesselId:game.state.ship.id,aboardVesselId:game.state.ship.id};
  context=vm.createContext({Game,generateSurface,isWalkable,syncDamageMarkers,rescueOccupants,getPerspectiveAction,normalizeModeZoom,zoomLimits,
    game,playing:true,network,onlineSnapshot:shared?{fleet:[{...game.state.ship,ownerId:'captain',helmOwner:null}]}:null,
    actionPending:false,surface:null,surfaceKey:'',surfaceTarget:null,guideIntent:null,personVisualOffset:{x:8,y:-5},
    wasFire:true,wasMine:true,pointerAim:{active:true,fire:true},combatPreview:{target:'stale-target'},labelLayoutDirty:false,
    testSession:null,stored:null,settings:{...cameraPreferences,guidance:'simple',immersiveHud:true,translucentHud:true,compactTips:true},
    cameraProfile:{status:'local',preferences:cameraPreferences},tutorial,dismissedRoute:'',dismissedGuideEpisode:'',coachPrompt:null,
    dialog:{opened:false,items:[],open(title,kind){this.opened=true;this.kind=kind;this.title=title;this.items=[];},html(value){this.htmlText=value;},choices(items){this.items.push(...items);},close(){this.opened=false;}},esc:value=>String(value),openSharedShip(){},openOnline(){},document:{querySelector:()=>null},
    $:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    controls:{clear(){clearCount++;heldInput={};}},
    hudText(target,text){const changed=target.textContent!==text;target.textContent=text;return changed;},
    setViewPanel(...args){viewPanels.push(args);},toast:(...args)=>toasts.push(args),
    resize(){resizes.push({mode:context.game.state.mode,surface:context.surface?.id??null});},
    canvas:{focus:options=>focus.push(options)},saveGame:active=>{writes.push(active.save());return true;},
    processEvents(){events.push(...context.game.drainEvents());},
    guidanceContext(){return{playing:context.playing,mode:context.game.state.mode,device:'touch',systemId:context.game.state.systemId,locationId:context.game.state.locationId,vesselId:context.game.state.ship.id};},
    updateHUD(){context.updatePerspectiveControl();tutorial.update(context.guidanceContext());},
    interact(){throw new Error('A pending perspective switch must not allow an interaction.');},
    enterCabin(){throw new Error('A pending perspective switch must not allow another cabin command.');}
  });
  vm.runInContext(appCode,context);
  const invoke=context.performInvoke;
  context.performInvoke=(name,args)=>{calls.push({name,args:copy(args)});return invoke(name,args);};
  context.selectGuide();context.updateHUD();context.syncViewControls();
  return{context,game,elements,calls,packets,inputs,toasts,writes,resizes,focus,viewPanels,events,tutorial,
    call:(name,...args)=>context[name](...args),get heldInput(){return heldInput;},get clearCount(){return clearCount;},
    acknowledge(index=0){const packet=packets[index],answer=game[packet.name]();packet.resolve({ok:answer.ok,result:answer});return answer;}};
}

test('the solo HUD switches Walk deck → Take helm on the same moving hull and syncs both camera controls',async()=>{
  const f=fixture(),ship=f.game.state.ship,button=f.elements.get('modePill');
  Object.assign(ship,{x:500,y:-600,vx:37,vy:-22,angle:1.23,angularVelocity:.4,hull:61});
  const before=pose(ship),credits=f.game.state.credits;
  assert.equal(f.elements.get('perspectiveLabel').textContent,'Walk deck');
  assert.equal(button.hidden,false);assert.equal(button.dataset.state,'ready');
  assert.match(button.attributes['aria-label'],/Ship view\. Walk deck/);

  await f.call('switchPerspective');
  assert.equal(f.game.state.mode,'person');assert.equal(f.game.state.interior.kind,'ship');
  assert.equal(f.game.state.ship,ship);assert.deepEqual(pose(ship),before);assert.equal(f.game.state.credits,credits);
  assert.equal(f.context.surface.kind,'ship');assert.ok(isWalkable(f.context.surface,f.game.state.person.x,f.game.state.person.y));
  assert.equal(f.elements.get('perspectiveLabel').textContent,'Take helm');
  assert.match(button.attributes['aria-label'],/Person view\. Take helm/);
  assert.equal(f.elements.get('personZoomActive').hidden,false);assert.equal(f.elements.get('shipZoomActive').hidden,true);
  assert.equal(f.elements.get('personZoom').value,'0.8');assert.equal(f.elements.get('shipZoom').value,'0.25');
  assert.equal(f.elements.get('personZoom').attributes['aria-valuetext'],'80 percent person zoom');
  assert.equal(f.resizes.at(-1).mode,'person');assert.ok(f.resizes.at(-1).surface);
  assert.deepEqual(copy(f.context.personVisualOffset),{x:0,y:0});

  await f.call('switchPerspective');
  assert.equal(f.game.state.mode,'ship');assert.equal(f.game.state.interior,null);assert.equal(f.game.state.ship,ship);
  assert.deepEqual(pose(ship),before);assert.equal(f.context.surface,null);assert.equal(f.context.surfaceKey,'');
  assert.equal(f.elements.get('perspectiveLabel').textContent,'Walk deck');
  assert.equal(f.elements.get('shipZoomActive').hidden,false);assert.equal(f.elements.get('personZoomActive').hidden,true);
  assert.deepEqual(f.resizes.map(value=>value.mode),['person','ship']);
  assert.deepEqual(f.calls.map(call=>call.name),['enterCabin','quickHelm']);
  assert.equal(f.tutorial.controller.count('take-helm'),1,'Only the completed helm command earns tutorial progress.');
  assert.equal(f.focus.length,2);assert.ok(f.focus.every(value=>value.preventScroll===true));
  assert.equal(f.writes.at(-1).mode,'ship');assert.deepEqual(f.writes.at(-1).cameraPreferences,{shipZoom:.25,personZoom:.8});
  assert.equal(button.disabled,false);assert.equal(button.attributes['aria-busy'],'false');
});

test('a shared switch stays pending until acknowledgement, rejects duplicate actions, and releases all held input',async()=>{
  const f=fixture({shared:true}),button=f.elements.get('modePill'),pending=f.call('switchPerspective');
  assert.equal(f.context.actionPending,true);assert.equal(f.game.state.mode,'ship');
  assert.equal(f.packets.length,1);assert.equal(f.packets[0].name,'enterCabin');
  assert.equal(button.disabled,true);assert.equal(button.dataset.state,'pending');
  assert.equal(button.attributes['aria-disabled'],'true');assert.equal(button.attributes['aria-busy'],'true');
  assert.equal(f.elements.get('perspectiveLabel').textContent,'Switching…');
  assert.deepEqual(f.heldInput,{});assert.deepEqual(f.inputs,[{}]);
  assert.equal(f.context.wasFire,false);assert.equal(f.context.wasMine,false);
  assert.equal(f.context.pointerAim.active,false);assert.equal(f.context.pointerAim.fire,false);assert.equal(f.context.combatPreview,null);
  assert.equal(f.resizes.length,0);assert.equal(f.tutorial.controller.count('take-helm'),0);
  await f.call('switchPerspective');await f.call('command','interact');await f.call('command','cabin');
  assert.equal(f.packets.length,1,'Repeated taps and keyboard commands cannot enqueue a second transition.');
  assert.equal(f.calls.length,1);

  assert.equal(f.acknowledge().ok,true);await pending;
  assert.equal(f.game.state.mode,'person');assert.equal(f.context.actionPending,false);
  assert.equal(f.elements.get('perspectiveLabel').textContent,'Take helm');assert.equal(button.dataset.state,'ready');
  assert.equal(button.disabled,false);assert.equal(button.attributes['aria-busy'],'false');
  assert.equal(f.inputs.length,2);assert.deepEqual(f.inputs.at(-1),{});assert.ok(f.clearCount>=2);
  assert.equal(f.resizes.length,1);assert.equal(f.writes.length,0,'The shared switch does not create a solo save.');
});

test('a distant boarding airlock marks the real return route and explains the block without issuing a command',async()=>{
  const game=new Game('app-perspective-airlock');Object.assign(game.state.ship,{x:0,y:450});
  const enemy=placeRaider(game,{x:100,y:450,hp:14,maxHp:46,disabled:true,active:false});
  assert.equal(game.boardEnemy(enemy.id).ok,true);
  const f=fixture({game});f.call('ensureSurface');
  const airlock=f.context.surface.entities.find(entity=>entity.data?.airlock);
  Object.assign(game.state.person,{x:airlock.x+200,y:airlock.y});f.call('updatePerspectiveControl');
  const before=JSON.stringify(game.state),button=f.elements.get('modePill');
  assert.equal(f.elements.get('perspectiveLabel').textContent,'Return to ship');
  assert.equal(button.dataset.state,'blocked');assert.equal(button.attributes['aria-disabled'],'true');
  assert.equal(button.disabled,false,'A blocked shortcut stays tappable so its explanation is reachable.');
  assert.match(button.title,/marked entry airlock/);

  await f.call('switchPerspective');
  assert.equal(f.context.surfaceTarget,airlock.id);assert.equal(f.context.guideIntent,'return');
  assert.match(f.toasts.at(-1)[0],/Walk to the marked entry airlock/);
  assert.equal(f.calls.length,0);assert.equal(f.resizes.length,0);assert.equal(f.writes.length,0);
  assert.equal(JSON.stringify(game.state),before,'A route hint cannot move the captain or either ship.');
  assert.equal(f.context.actionPending,false);assert.deepEqual(f.heldInput,{});
});

test('failed and rejected acknowledgements restore the shortcut and permit a later successful retry',async t=>{
  for(const failure of ['denied','transport'])await t.test(failure,async()=>{
    const f=fixture({shared:true}),button=f.elements.get('modePill'),before=JSON.stringify(f.game.state);
    const pending=f.call('switchPerspective');
    if(failure==='denied')f.packets[0].resolve({ok:false,result:{reason:'Another captain has taken the helm.'}});
    else f.packets[0].reject(new Error('The connection was interrupted.'));
    await pending;
    assert.equal(f.context.actionPending,false);assert.equal(button.disabled,false);
    assert.equal(button.dataset.state,'ready');assert.equal(button.attributes['aria-busy'],'false');
    assert.equal(f.elements.get('perspectiveLabel').textContent,'Walk deck');
    assert.match(f.toasts.at(-1)[0],failure==='denied'?/Another captain/:/connection was interrupted/);
    assert.equal(JSON.stringify(f.game.state),before);assert.equal(f.resizes.length,0);assert.equal(f.focus.length,0);
    assert.equal(f.tutorial.controller.count('take-helm'),0);assert.deepEqual(f.inputs.at(-1),{});
    const retry=f.call('switchPerspective');assert.equal(f.packets.length,2);
    assert.equal(f.acknowledge(1).ok,true);await retry;
    assert.equal(f.game.state.mode,'person');assert.equal(f.context.actionPending,false);assert.equal(button.disabled,false);
  });
});

test('the perspective shortcut is hidden outside play and cannot act through an open dialog',async()=>{
  const f=fixture();f.context.playing=false;f.call('updatePerspectiveControl');
  assert.equal(f.elements.get('modePill').hidden,true);await f.call('switchPerspective');assert.equal(f.calls.length,0);
  f.context.playing=true;f.context.dialog.opened=true;f.call('updatePerspectiveControl');
  assert.equal(f.elements.get('modePill').hidden,false);await f.call('switchPerspective');assert.equal(f.calls.length,0);
  assert.equal(f.clearCount,0);assert.equal(f.game.state.mode,'ship');
});


test('a departure refusal opens a named crew check and only explicit confirmation sends leaveCrewBehind',async()=>{
 const game=new Game('app-crew-departure');assert.equal(game.enterCabin().ok,true);
 const f=fixture({shared:true,game}),vessel=f.context.onlineSnapshot.fleet[0];vessel.dockedAt='kettle';
 const refusal={ok:false,result:{ok:false,code:'crew-ashore',vesselId:vessel.id,crewAshore:[{captainId:'friend',name:'Ari'}],reason:'Ari is still ashore.'}};
 const first=f.call('switchPerspective');assert.equal(f.packets[0].name,'quickHelm');f.packets[0].resolve(refusal);await first;
 assert.equal(f.context.dialog.kind,'crew-departure');assert.match(f.context.dialog.htmlText,/Ari/);assert.equal(f.context.actionPending,false);assert.equal(f.toasts.length,0,'The named dialog replaces a generic failure toast.');
 const wait=f.context.dialog.items.find(item=>item.label==='Wait for my crew');wait.action();
 assert.equal(f.context.dialog.opened,false);assert.equal(f.packets.length,1);assert.equal(vessel.dockedAt,'kettle');
 const second=f.call('switchPerspective');f.packets[1].resolve(refusal);await second;
 const depart=f.context.dialog.items.find(item=>item.label==='Depart without them').action();
 assert.equal(f.packets[2].name,'quickHelm');assert.equal(f.packets[2].args.leaveCrewBehind,true);assert.equal(f.packets[2].args.vesselId,vessel.id);
 f.packets[2].resolve({ok:true,result:{ok:true}});await depart;assert.equal(f.context.dialog.opened,false);
});
