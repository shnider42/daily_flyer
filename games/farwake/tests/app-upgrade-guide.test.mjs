import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Game,distance} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {getDisembarkAction,getPerspectiveAction} from '../dist/perspective-controls.mjs';

// Exercise the real navigation handlers and game state. Browser dialogs are
// boundaries here; guidance must mark a route without piloting or purchasing.
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const declarations=[...source.matchAll(/^(?:async )?function (\w+)\(/gm)];
const declaration=name=>{const index=declarations.findIndex(match=>match[1]===name);assert.ok(index>=0,name);return source.slice(declarations[index].index,declarations[index+1]?.index??source.length);};
const code=['followFoldDriveStep','deferFoldDriveTarget','syncFoldDriveTarget','trackJob'].map(declaration).join('\n');
const ok=result=>assert.equal(result.ok,true,result.reason);
function dock(game,id='kettle'){
 const body=game.system.bodies.find(body=>body.id===id);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0});
 ok(game.dock(id));
}
function dockedDeck(game,id='kettle'){
 const body=game.system.bodies.find(body=>body.id===id);
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+60,vx:0,vy:0,dockedAt:id});
 ok(game.enterCabin());
 assert.equal(game.dockedPortInfo()?.id,id);
}
function fixture({game=new Game('app-upgrade-guide'),shared=false}={}){
 const maps=[],help=[],toasts=[],services=[];
 let context;
 const network=shared?{connected:true}:null;
 const fleet=[{...game.state.ship,ownerId:'captain',dockedAt:game.state.ship.dockedAt}];
 const ensureSurface=()=>{context.surface=game.state.mode==='person'?generateSurface(game.currentBody,game.state.seed):null;};
 context=vm.createContext({game,network,touchLayout:shared,surface:null,surfaceTarget:null,tracked:null,trackedThreadId:'old-thread',narrativeWaypoint:{id:'old-waypoint'},guideIntent:null,hudDirty:false,foldDriveTarget:null,
  distance,ensureSurface,dialog:{opened:true,close(){this.opened=false;}},
  openMap:(...args)=>maps.push(args),openHelp:options=>help.push(options),toast:(...args)=>toasts.push(args),
  currentDisembarkAction:()=>getDisembarkAction(game,{shared,connected:true,fleet,surface:context.surface}),
  currentPerspectiveAction:()=>getPerspectiveAction(game,{shared,connected:true,fleet,surface:context.surface}),
  openOnline:()=>services.push('crew'),openOutfitter:(_entity,tab)=>services.push(tab),
  livelihoodUI:{openDuty:()=>services.push('duty'),openPort:()=>services.push('port')}
 });
 if(shared)game.state.multiplayer={serverAuthoritative:true,captainId:'captain',ownedVesselId:game.state.ship.id,aboardVesselId:game.state.interior?game.state.ship.id:null,portVesselId:game.state.ship.id,dockedAt:game.state.ship.dockedAt||game.state.locationId};
 ensureSurface();vm.runInContext(code,context);
 return{context,game,maps,help,toasts,services,follow:id=>context.followFoldDriveStep({id}),marked:()=>context.surface?.entities.find(entity=>entity.id===context.surfaceTarget)};
}

test('the Iona route marks her actual workshop without moving or spending for the captain',()=>{
 const game=new Game('guide-app-iona');dock(game);const f=fixture({game}),before=JSON.stringify(game.state);
 f.follow('meet-iona');
 assert.equal(f.context.tracked,'kettle');assert.equal(f.marked()?.type,'mechanic');
 assert.equal(f.context.trackedThreadId,null);assert.equal(f.context.narrativeWaypoint,null);
 assert.equal(f.context.dialog.opened,false);assert.equal(JSON.stringify(game.state),before);
});

test('a workshop at the current berth routes a deck passenger to the airlock, while another port routes to Helm',()=>{
 const here=new Game('guide-app-docked-here');dockedDeck(here);const atPort=fixture({game:here,shared:true});
 atPort.follow('port');assert.equal(atPort.marked()?.data.airlock,true);
 const elsewhere=new Game('guide-app-docked-away');dockedDeck(elsewhere,'morrow');const travel=fixture({game:elsewhere,shared:true});
 travel.follow('meet-iona');assert.equal(travel.context.tracked,'kettle');assert.equal(travel.marked()?.data.stationRole,'helm');
});

test('a shared captain ashore gets the return-to-ship route before a real mining target arrives',()=>{
 const game=new Game('guide-app-shared-mining');dock(game);const rocks=game.system.asteroids;
 game.system.asteroids=[];game.system.signals=[];const f=fixture({game,shared:true}),before=JSON.stringify(game.state);
 f.follow('mine-six');
 assert.equal(f.marked()?.type,'exit');assert.equal(f.help.length,0);
 assert.equal(f.context.foldDriveTarget?.kind,'mining');assert.equal(f.context.foldDriveTarget?.systemId,'hearth');
 assert.equal(JSON.stringify(game.state),before,'Guidance does not launch automatically.');
 ok(game.launch());game.system.asteroids=rocks;f.context.syncFoldDriveTarget();
 assert.ok(rocks.some(rock=>rock.hp>0&&rock.id===f.context.tracked),'The route targets an actual live asteroid after ship data arrives.');
 assert.equal(f.context.foldDriveTarget,null);assert.equal(f.context.guideIntent,'mine');
});

test('a beacon route from a shared docked deck points to Helm and later tracks the signal, not the moon',()=>{
 const game=new Game('guide-app-shared-beacon');dockedDeck(game);const signals=game.system.signals;
 game.system.asteroids=[];game.system.signals=[];const f=fixture({game,shared:true});
 f.follow('beacon');assert.equal(f.marked()?.data.stationRole,'helm');
 assert.equal(f.context.foldDriveTarget?.kind,'beacon');assert.equal(f.help.length,0);
 ok(game.quickHelm());game.system.signals=signals;f.context.syncFoldDriveTarget();
 assert.equal(f.context.tracked,'hearth:story:tinbell');assert.equal(f.context.guideIntent,'scan');assert.equal(f.context.foldDriveTarget,null);
});

test('a deferred fold-drive route cannot overwrite the next captain’s navigation',()=>{
 const game=new Game('guide-app-captain-change');dock(game);const rocks=game.system.asteroids;game.system.asteroids=[];
 const f=fixture({game,shared:true});f.follow('mine-six');assert.equal(f.context.foldDriveTarget?.kind,'mining');
 game.state.multiplayer.captainId='different-captain';game.state.mode='ship';game.system.asteroids=rocks;
 f.context.tracked='independent-route';f.context.syncFoldDriveTarget();
 assert.equal(f.context.foldDriveTarget,null);assert.equal(f.context.tracked,'independent-route');
});

test('tracking a different job cancels a deferred fold-drive destination',()=>{
 const game=new Game('guide-app-change-route');dock(game);const f=fixture({game});
 f.follow('mine-six');assert.equal(f.context.foldDriveTarget?.kind,'mining');
 f.context.trackJob({type:'delivery',status:'active',targetSystem:'hearth',targetBody:'morrow'});
 assert.equal(f.context.tracked,'morrow');ok(game.launch());f.context.syncFoldDriveTarget();
 assert.equal(f.context.foldDriveTarget,null);assert.equal(f.context.tracked,'morrow');
});

test('credit guidance prefers reachable maintenance over a remote ready contract',()=>{
 const game=new Game('guide-app-paid-work');dock(game);
 const local=game.availableJobs().find(job=>job.type==='work');ok(game.acceptJob(local.id));
 const remote={id:'remote-ready',type:'delivery',status:'ready',targetSystem:'vesper',targetBody:'listening'};game.state.missions.unshift(remote);
 const f=fixture({game});f.follow('credits');
 assert.equal(f.maps.length,0,'Earning first-drive money must not send the captain to an unavailable jump.');
 assert.equal(f.marked()?.type,'work');assert.equal(remote.status,'ready');
 const onlyRemote=new Game('guide-app-remote-only');dock(onlyRemote);onlyRemote.state.missions=[{...remote}];
 const noLocal=fixture({game:onlyRemote});noLocal.follow('first-job');
 assert.equal(noLocal.maps.length,0);assert.equal(noLocal.marked()?.type,'jobboard');
});

test('space routes select a real beacon or an accessible serviced port',()=>{
 const beacon=fixture();beacon.follow('beacon');assert.equal(beacon.context.tracked,'hearth:story:tinbell');
 assert.equal(beacon.context.guideIntent,'scan');
 const game=new Game('guide-app-barren-moon');dock(game,'tinbell');const port=fixture({game});port.follow('port');
 assert.notEqual(port.context.tracked,'tinbell');
 const target=game.system.bodies.find(body=>body.id===port.context.tracked);
 assert.ok(target&&game.portAccess(target).ok&&game.portAccess(target).profile);
 assert.equal(port.marked()?.type,'exit');
});
