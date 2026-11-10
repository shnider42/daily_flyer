import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {generateSurface} from '../dist/surface.mjs';
import {cabinLayout} from '../dist/interior-layouts.mjs';
import {getPerspectiveAction,getBoardingAction,getLocalPortVessels} from '../dist/perspective-controls.mjs';
import {placeRaider} from './helpers/combat-fixtures.mjs';

const ok=result=>assert.equal(result.ok,true,result.reason);
const choice=(game,options)=>getPerspectiveAction(game,{surface:game.state.mode==='person'&&game.currentBody?generateSurface(game.currentBody,game.state.seed):null,...options});
const vessel=(game,overrides={})=>({id:game.state.ship.id,ownerId:'captain',systemId:game.state.systemId,x:game.state.ship.x,y:game.state.ship.y,dockedAt:null,helmOwner:null,hull:100,maxHull:100,grantedRoles:[],...overrides});
function sharedDeck(){
 const game=new Game('perspective-friendly');ok(game.enterCabin());
 game.state.multiplayer={captainId:'captain',ownedVesselId:'original',aboardVesselId:'friend',returnVesselId:'original',crewRole:'passenger'};
 const current=vessel(game,{id:'friend',ownerId:'friend-owner',grantedRoles:['helm']});
 return{game,current,fleet:[current,vessel(game,{id:'original'})]};
}
function assault(){
 const game=new Game('perspective-boarding'),enemy=placeRaider(game,{x:100,y:450,hp:14,maxHp:46,disabled:true,active:false});
 Object.assign(game.state.ship,{x:0,y:450});ok(game.boardEnemy(enemy.id));
 return{game,enemy};
}

test('one persistent action follows the actual solo perspective without mutating the voyage',()=>{
 const game=new Game('perspective-alone'),before=JSON.stringify(game.state);
 assert.equal(choice(game).label,'Walk deck');assert.equal(choice(game).command,'enterCabin');assert.equal(choice(game).enabled,true);
 assert.equal(JSON.stringify(game.state),before);
 ok(game.enterCabin());const aboard=JSON.stringify(game.state),action=choice(game);
 assert.equal(action.label,'Take helm');assert.equal(action.command,'quickHelm');assert.equal(action.enabled,true);
 assert.deepEqual(action.args,{});assert.equal(JSON.stringify(game.state),aboard);
});

test('friendly crew shortcut targets the occupied hull even with an original return vessel',()=>{
 const{game,current,fleet}=sharedDeck();
 const action=choice(game,{shared:true,fleet});
 assert.equal(action.command,'quickHelm');assert.equal(action.enabled,true);assert.equal(action.label,'Take helm');
 current.dockedAt='kettle';assert.equal(choice(game,{shared:true,fleet}).label,'Launch ship');
 current.grantedRoles=[];assert.match(choice(game,{shared:true,fleet}).reason,/not granted.*helm/);
 current.occupation={controllerId:'captain',contested:false};assert.equal(choice(game,{shared:true,fleet}).enabled,true);
});

test('a friendly visitor on a previously captured ship still needs a helm grant',()=>{
 const{game,current,fleet}=sharedDeck();game.state.boarding={kind:'assault',phase:'won'};
 game.state.multiplayer.canTakeHelm=true;game.state.multiplayer.hostileBoarding=false;current.captured=true;
 assert.equal(choice(game,{shared:true,fleet}).enabled,true);
 current.grantedRoles=[];assert.match(choice(game,{shared:true,fleet}).reason,/not granted.*helm/);
});

test('occupied stations, boarders, missing hulls and disconnected captains explain the blocked switch',()=>{
 const{game,current,fleet}=sharedDeck();current.helmOwner='friend-owner';
 let action=choice(game,{shared:true,fleet});assert.equal(action.enabled,false);assert.match(action.reason,/Another captain/);
 current.helmOccupied=false;assert.equal(choice(game,{shared:true,fleet}).enabled,true,'An expired offline helm holder is left to authority to release.');delete current.helmOccupied;
 current.helmOwner=null;game.state.boarding={kind:'defense',phase:'active'};
 action=choice(game,{shared:true,fleet});assert.equal(action.command,'quickHelm');assert.match(action.reason,/hostile boarders/);
 game.state.boarding=null;current.occupation={contested:true};assert.equal(choice(game,{shared:true,fleet}).enabled,false);
 current.occupation=null;current.hull=0;assert.match(choice(game,{shared:true,fleet}).reason,/hull/);
 current.hull=100;assert.match(choice(game,{shared:true,fleet,connected:false}).reason,/Reconnecting/);
 assert.equal(choice(game,{shared:true,fleet:[]}).enabled,false);
});

test('shared port return boards the remembered carrier without taking its helm or launching',()=>{
 const game=new Game('perspective-departure'),body=game.system.bodies.find(body=>body.id==='kettle');
 Object.assign(game.state.ship,{x:body.x,y:body.y+body.radius+30});ok(game.dock(body.id));
 assert.equal(choice(game).command,'quickLaunch','The solo shortcut retains its flight transition.');
 game.state.multiplayer={captainId:'captain',ownedVesselId:'original',portVesselId:'friend'};
 const original=vessel(game,{id:'original',dockedAt:'elsewhere'}),current=vessel(game,{id:'friend',name:'Wayfarer',ownerId:'friend-owner',dockedAt:'kettle',canBoard:true,grantedRoles:[],berths:2,occupants:0}),fleet=[original,current];
 const before=JSON.stringify(game.state),action=choice(game,{shared:true,fleet});
 assert.equal(action.command,'boardShip');assert.equal(action.label,'Board Wayfarer');assert.deepEqual(action.args,{vesselId:'friend'});assert.equal(action.enabled,true);
 current.helmOwner='friend-owner';current.helmOccupied=true;current.helmName='Ari';current.occupants=1;
 assert.equal(choice(game,{shared:true,fleet}).enabled,true,'Passenger boarding does not require piloting or an empty helm.');
 assert.equal(JSON.stringify(game.state),before);assert.equal(current.dockedAt,'kettle');
 current.availableBerths=0;assert.match(choice(game,{shared:true,fleet}).reason,/No free berth/);
 current.availableBerths=1;current.canBoard=false;assert.match(choice(game,{shared:true,fleet}).reason,/allow you aboard/);
 current.canBoard=true;current.dockedAt='morrow';assert.match(choice(game,{shared:true,fleet}).reason,/not parked/);
 current.dockedAt='kettle';current.systemId='afterlight';assert.match(choice(game,{shared:true,fleet}).reason,/same star system/);
 current.systemId='hearth';current.hull=0;assert.match(choice(game,{shared:true,fleet}).reason,/no longer intact/);
 game._hitTimer=1;assert.match(choice(game).reason,/immediate attack/,'Solo departure still refuses an immediate attack.');
});

test('a shipless passenger can board locally without a helm grant, and choose when several ships are available',()=>{
 const game=new Game('perspective-shipless',{startMode:'hardcore'});
 game.state.multiplayer={serverAuthoritative:true,captainId:'visitor',ownedVesselId:null,aboardVesselId:null,portVesselId:'friend'};
 const friend=vessel(game,{id:'friend',name:'Lantern',ownerId:'owner',dockedAt:'morrow',canBoard:true,grantedRoles:[],availableBerths:1}),fleet=[friend];
 assert.equal(choice(game,{shared:true,fleet}).command,'boardShip');assert.equal(choice(game,{shared:true,fleet}).enabled,true);
 assert.deepEqual(getLocalPortVessels(game,fleet).map(v=>v.id),['friend']);
 game.state.multiplayer.portVesselId=null;fleet.push({...friend,id:'second',name:'Second ship'});
 assert.equal(choice(game,{shared:true,fleet}).command,'openPortShips','An unassigned passenger chooses between local ships.');
 assert.equal(choice(game,{shared:true,fleet,connected:false}).enabled,false);
});

test('boarding feedback distinguishes location, permission, capacity and destruction',()=>{
 const game=new Game('boarding-feedback');game.state.multiplayer={captainId:'visitor',aboardVesselId:'own'};
 const own=vessel(game,{id:'own',ownerId:'visitor'}),friend=vessel(game,{id:'friend',ownerId:'owner',canBoard:true,berths:2,occupants:1});
 const check=()=>getBoardingAction(game,friend,{fleet:[own,friend]});
 assert.equal(check().enabled,true);friend.dockedAt='kettle';assert.match(check().reason,/Dock at/);
 friend.dockedAt=null;friend.x=own.x+250;assert.match(check().reason,/220 metres/);
 friend.x=own.x;friend.vx=100;assert.equal(check().enabled,false);friend.vx=0;
 friend.availableBerths=0;assert.match(check().reason,/No free berth/);friend.availableBerths=1;
 friend.canBoard=false;assert.match(check().reason,/allow you aboard/);friend.canBoard=true;
 friend.destroyed=true;assert.match(check().reason,/no longer intact/);friend.destroyed=false;
 game.state.person.health=0;assert.match(check().reason,/incapacitated/);
});

test('an occupied helm names the actual pilot in the perspective action',()=>{
 const{game,current,fleet}=sharedDeck();current.helmOwner='other';current.helmName='Ari';current.helmOccupied=true;
 const action=choice(game,{shared:true,fleet});assert.equal(action.enabled,false);assert.equal(action.label,'Ari at helm');assert.match(action.reason,/Ari is at the helm/);
});

test('active target boarding exposes the real airlock return and never a distant escape',()=>{
 const{game,enemy}=assault(),surface=generateSurface(game.currentBody,game.state.seed),airlock=surface.entities.find(entity=>entity.data?.airlock);
 Object.assign(game.state.person,{x:airlock.x+200,y:airlock.y});
 let action=choice(game,{surface});assert.equal(action.command,'returnToOwnShip');assert.equal(action.enabled,false);assert.equal(action.targetId,airlock.id);
 assert.match(action.reason,/marked entry airlock/);
 Object.assign(game.state.person,airlock);assert.equal(choice(game,{surface}).enabled,true);
 enemy.x=2000;assert.match(choice(game,{surface}).reason,/tether range/);
 game.state.ship.hull=0;assert.match(choice(game,{surface}).reason,/original ship was destroyed/);
});

test('a secured target offers its own helm even when the original ship was destroyed',()=>{
 const{game,enemy}=assault();game.state.boarding.phase='won';enemy.deck.cleared=true;
 game.state.ship.hull=0;game.state.ship.destroyed=true;
 const action=choice(game);assert.equal(action.command,'quickHelm');assert.equal(action.enabled,true);
 assert.notDeepEqual(game.state.person,cabinLayout(game.state.boarding.shipClass).stations.helm,'Reading the shortcut does not move the captain.');
 enemy.hp=0;assert.equal(choice(game).enabled,false);
});

test('shared captured hulls retain boarder and return-vessel restrictions',()=>{
 const{game,current,fleet}=sharedDeck();game.state.multiplayer.hostileBoarding=true;game.state.multiplayer.canReturn=true;
 game.state.boarding={kind:'assault',phase:'active',shipClass:'sparrow'};
 Object.assign(game.state.person,cabinLayout('sparrow').spawn);
 assert.equal(choice(game,{shared:true,fleet}).command,'returnToOwnShip');assert.equal(choice(game,{shared:true,fleet}).enabled,true);
 game.state.multiplayer.canReturn=false;assert.match(choice(game,{shared:true,fleet}).reason,/within tether range/);
 game.state.boarding.phase='won';game.state.multiplayer.canTakeHelm=true;current.grantedRoles=[];
 assert.equal(choice(game,{shared:true,fleet}).command,'quickHelm');assert.equal(choice(game,{shared:true,fleet}).enabled,true);
 current.helmOwner='other';assert.equal(choice(game,{shared:true,fleet}).enabled,false);
 current.helmOccupied=false;assert.equal(choice(game,{shared:true,fleet}).enabled,false,'Capturing a helm does not release another station holder.');
});

test('site shortcut points to the actual entrance and leaves only when in reach',()=>{
 const game=new Game('perspective-site');game.state.mode='person';game.state.locationId='morrow:site:cave';game.state.interior={kind:'site',location:{id:game.state.locationId}};
 game.state.exploration={bodyId:'morrow'};game.state.person.x=200;game.state.person.y=200;
 const exit={id:'cave:exit',type:'siteExit',x:100,y:100},surface={entities:[exit]};
 let action=getPerspectiveAction(game,{surface});assert.equal(action.label,'Exit site');assert.equal(action.command,'exitSite');assert.equal(action.enabled,false);assert.equal(action.targetId,exit.id);
 Object.assign(game.state.person,{x:exit.x+46,y:exit.y});assert.equal(getPerspectiveAction(game,{surface}).enabled,true);
 game.state.person.x+=1;assert.equal(getPerspectiveAction(game,{surface}).enabled,false);
});

test('pending stories, incapacitation and immediate solo attacks block only the unsafe transition',()=>{
 const game=new Game('perspective-guards');game.state.pendingEncounter={id:'waiting'};
 assert.match(choice(game).reason,/current conversation/);game.state.pendingEncounter=null;
 game.state.person.health=0;assert.match(choice(game).reason,/incapacitated/);game.state.person.health=100;
 const enemy=placeRaider(game,{x:game.state.ship.x+100,y:game.state.ship.y,active:true});assert.match(choice(game).reason,/immediate attack/);
 assert.equal(choice(game,{shared:true}).enabled,true,'Shared captains can leave the helm while their actual hull stays exposed.');
 enemy.active=false;ok(game.enterCabin());enemy.active=true;assert.equal(choice(game).enabled,true,'Outside fire never prevents taking the helm on a clear deck.');
});

test('derelict return uses its tether and never the multiplayer recovery-shuttle operation',()=>{
 const game=new Game('perspective-derelict');game.state.mode='person';game.state.interior={kind:'derelict',location:{id:'derelict'}};
 const action=getPerspectiveAction(game);assert.equal(action.label,'Return to ship');assert.equal(action.command,'leaveDerelict');assert.equal(action.enabled,true);
});
