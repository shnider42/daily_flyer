import test from 'node:test';
import assert from 'node:assert/strict';
import {Realm} from '../server/realm.mjs';
import {cabinLayout,enemyHullProfile} from '../dist/fleet.mjs';
import {createAirlockUI} from '../dist/airlock-ui.mjs';
import {getBoardingAction,getAirlockBoardingTargets} from '../dist/perspective-controls.mjs';
import {mergeSnapshot} from '../dist/network.mjs';

const ok=result=>{assert.equal(result?.ok,true,result?.reason);return result;};
async function fixture(){
 const realm=new Realm({id:'AIRLOCKUI',seed:'airlock-ui-regression',persistence:{kind:'memory',save:async(_id,version)=>({version:version+1})}});
 const people=[];
 for(let i=0;i<2;i++){
  const {captain}=await realm.createCaptain(i?'Guest':'Pilot');realm.attach(captain,{close(){}});
  captain.game.state.fleet.owned.push('hauler');captain.game._activateClass('hauler',true);
  Object.assign(realm.vessels.get(captain.ownedVesselId).ship,{x:i*100,y:0,angle:0,vx:0,vy:0});people.push(captain);
 }
 const [pilot,guest]=people,source=realm.vessels.get(pilot.aboard),room=realm._room('hearth');
 for(const key of ['enemies','bullets','asteroids','pickups','signals'])room.runtime[key]=[];
 ok(realm._command(pilot,'setCrewAccess',{vesselId:source.id,captainId:guest.id,allowed:true,roles:[]}));
 ok(realm._command(guest,'boardShip',{vesselId:source.id}));
 const enemy={id:'scrap-raider',name:'Scrap raider',...enemyHullProfile('hauler'),x:source.ship.x+130,y:0,angle:0,hp:35,maxHp:100,shield:0,disabled:true,active:false,cooldown:99,speed:0,damage:5,reward:20,faction:'covenant'};
 room.runtime.enemies.push(enemy);
 let snapshot=realm.snapshotFor(guest,{drainEvents:false});
 const game={state:snapshot.state,system:snapshot.world},network={connected:true},calls=[],marks=[],toasts=[];
 const dialog={body:{scrollTop:0},opened:false,kind:null,items:[],open(title,kind){this.title=title;this.kind=kind;this.opened=true;},html(value){this.markup=value;},choices(items){this.items=items;},close(){this.opened=false;}};
 const sync=(compact=false)=>{const next=realm.snapshotFor(guest,{drainEvents:false,compact});snapshot=mergeSnapshot(snapshot,next);game.state=snapshot.state;game.system=snapshot.world;};
 const ui=createAirlockUI({getGame:()=>game,getSnapshot:()=>snapshot,getNetwork:()=>network,getSurface:()=>realm._surface(guest),dialog,
  runDeckAction:async(command,args)=>{calls.push({command,args});const answer=realm._command(guest,command,args);if(answer.ok)dialog.close();sync();return answer;},markAirlock:id=>marks.push(id),toast:message=>toasts.push(message)});
 return {realm,pilot,guest,source,enemy,game,network,dialog,ui,calls,marks,toasts,sync,get snapshot(){return snapshot;},choice:label=>dialog.items.find(item=>item.label===label)};
}

test('an airlock guest without helm access can board a disabled raider while the pilot stays in control',async()=>{
 const f=await fixture();assert.equal(f.snapshot.fleet.find(ship=>ship.id===f.source.id).canPilot,false);
 f.ui.open();const board=f.choice('Board Scrap raider');assert.ok(board);assert.equal(board.disabled,false);
 await board.action();assert.equal(f.calls[0].command,'boardEnemy');assert.equal(f.calls[0].args.id,f.enemy.id);
 assert.notEqual(f.guest.aboard,f.source.id);assert.equal(f.source.helmOwner,f.pilot.id);assert.equal(f.pilot.aboard,f.source.id);
 assert.equal(f.guest.returnVesselId,f.source.id);assert.equal(f.dialog.opened,false);
});

test('a canonical occupied raider exposes Join boarding and preserves the existing fight',async()=>{
 const f=await fixture();f.ui.open();
 ok(f.realm._command(f.pilot,'boardEnemy',{id:f.enemy.id}));
 const target=f.realm.vessels.get(f.pilot.aboard),guard=target.boarding.enemies[0];guard.health=17;
 f.sync();assert.equal(f.ui.refresh(),true);
 const contact=f.snapshot.fleet.find(ship=>ship.id===target.id),board=getBoardingAction(f.game,contact,{fleet:f.snapshot.fleet});
 assert.equal(board.command,'boardEnemy');assert.equal(board.enabled,true);assert.equal(contact.canBoard,false,'A hostile NPC still has no friendly invitation.');
 const join=f.choice('Join boarding of Scrap raider');assert.ok(join);assert.equal(join.disabled,false);await join.action();
 assert.equal(f.guest.aboard,target.id);assert.equal(f.pilot.aboard,target.id);assert.equal(guard.health,17);
 assert.equal(f.calls[0].command,'boardEnemy');assert.equal(f.calls[0].args.id,f.enemy.id);
});

test('walking to the airlock enables a guest action through a compact snapshot and keeps the door mark usable',async()=>{
 const f=await fixture(),layout=cabinLayout(f.source.ship.classId);
 Object.assign(f.guest.game.state.person,layout.stations.engineering);f.sync();f.ui.open();
 const board=f.choice('Board Scrap raider');assert.equal(board.disabled,true);assert.match(board.detail,/entry airlock/i);
 const mark=f.choice('Mark entry airlock');assert.ok(mark);mark.action();assert.match(f.marks[0],/entry-airlock/);
 Object.assign(f.guest.game.state.person,layout.spawn);f.sync(true);assert.equal(f.ui.refresh(),true);
 assert.equal(f.choice('Board Scrap raider').disabled,false);await f.choice('Board Scrap raider').action();
 assert.equal(f.calls.length,1);assert.notEqual(f.guest.aboard,f.source.id);
});

test('an open airlock rechecks vanished targets and connection before issuing a transfer',async()=>{
 const f=await fixture();f.ui.open();const oldAction=f.choice('Board Scrap raider').action;
 f.enemy.x+=5000;f.sync(true);await oldAction();assert.equal(f.calls.length,0);assert.match(f.toasts[0],/no longer available/i);
 f.enemy.x-=5000;f.sync();f.ui.open();const enabledAction=f.choice('Board Scrap raider').action;
 f.network.connected=false;await enabledAction();assert.equal(f.calls.length,0);assert.match(f.toasts.at(-1),/Reconnecting/);
 assert.equal(f.choice('Board Scrap raider').disabled,true);
});

test('hostile boarding actions do not become friendly permission requests in compact views',async()=>{
 const f=await fixture();ok(f.realm._command(f.pilot,'boardEnemy',{id:f.enemy.id}));f.sync();
 const target=f.snapshot.fleet.find(ship=>ship.id===f.pilot.aboard);
 Object.assign(f.guest.game.state.person,cabinLayout(f.source.ship.classId).stations.engineering);f.sync(true);
 const action=getBoardingAction(f.game,target,{fleet:f.snapshot.fleet});
 assert.equal(action.command,'boardEnemy');assert.equal(action.enabled,false);assert.match(action.reason,/entry airlock/i);
 const choices=getAirlockBoardingTargets(f.game,{shared:true,connected:true,fleet:f.snapshot.fleet});
 assert.equal(choices.find(value=>value.vesselId===target.id).boardingAction.enabled,false);
});

test('a compact snapshot cannot revive an airborne boarding action from an older fleet list',async()=>{
 const f=await fixture();ok(f.realm._command(f.pilot,'boardEnemy',{id:f.enemy.id}));f.sync();
 const target=f.snapshot.fleet.find(ship=>ship.id===f.pilot.aboard);
 assert.equal(getBoardingAction(f.game,target,{fleet:f.snapshot.fleet}).enabled,true);
 f.realm.vessels.get(target.id).ship.x+=5000;f.sync(true);
 assert.equal(target.boardingAction.enabled,true,'This retained fleet entry predates the move.');
 const action=getBoardingAction(f.game,target,{fleet:f.snapshot.fleet});
 assert.equal(action.enabled,false);assert.match(action.reason,/no longer available/i);
});

test('a pilot docking while the guest airlock is open replaces the tether with the real port exit',async()=>{
 const f=await fixture();assert.ok(f.guest.returnVesselId);f.ui.open();
 const port=f.pilot.game.system.bodies.find(body=>body.id==='kettle');
 Object.assign(f.source.ship,{x:port.x,y:port.y+port.radius+40,vx:0,vy:0});
 ok(f.realm._command(f.pilot,'dock',{id:port.id}));f.sync(true);assert.equal(f.ui.refresh(),true);
 assert.ok(f.choice('Disembark at Kettle Station'));assert.equal(f.choice('Return across the tether'),undefined);
 assert.equal(f.choice('Board Scrap raider'),undefined);
});
