import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {createSharedCrewUI,selectedCrewVessel} from '../dist/shared-crew-ui.mjs';

class Element {
 constructor(tag='div') {this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.className='';this.textContent='';this.disabled=false;this.scrollTop=0;this.classList={add:name=>{this.className+=' '+name;}};}
 append(...nodes) {this.children.push(...nodes);}
 replaceChildren(...nodes) {this.children=[...nodes];}
 setAttribute(name,value) {this.attributes[name]=String(value);}
 querySelectorAll(selector) {return descendants(this).filter(node=>selector==='[data-crew-control]'?!!node.dataset.crewControl:node.tagName===selector);}
 focus() {this.focused=true;}
}
const descendants=root=>root.children.flatMap(node=>[node,...descendants(node)]);
const text=root=>[root.textContent,...root.children.map(text)].join(' ');
function fixture({guest=false,aboard=false}={}) {
 const game=new Game('crew-panel-review'),port=game.system.bodies.find(body=>body.id==='kettle');
 game.state.mode='person';game.state.locationId='kettle';game.state.interior=null;
 Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+50,vx:0,vy:0});
 const captainId=guest?'guest':'owner';
 game.state.multiplayer={captainId,name:guest?'Jade':'Morgan',ownedVesselId:guest?'guest-hull':'owner-hull',aboardVesselId:aboard?'owner-hull':null,portVesselId:'owner-hull'};
 const ship={id:'owner-hull',name:'Cinder',classId:'sparrow',ownerId:'owner',ownerName:'Morgan',systemId:'hearth',dockedAt:'kettle',x:game.state.ship.x,y:game.state.ship.y,vx:0,vy:0,hull:100,maxHull:100,shield:35,maxShield:35,radius:18,berths:2,occupants:0,occupiedBerths:0,availableBerths:2,canBoard:true,canPilot:!guest,grantedRoles:guest?[]:['helm'],allowCrew:false,helmOwner:null,grants:{},crewAshore:[]};
 const own={...ship,id:'guest-hull',name:'Quiet Step',ownerId:'guest',ownerName:'Jade',dockedAt:'morrow',canBoard:guest,grants:{}};
 const snapshot={fleet:[ship,own],presence:[{captainId:'owner',name:'Morgan',online:true,systemId:'hearth',vesselId:aboard?'owner-hull':null,crewRole:'passenger'},{captainId:'guest',name:'Jade',online:true,systemId:'hearth',vesselId:null,crewRole:'passenger'}],realm:{name:'Our galaxy',code:'ROOM22',online:2},crew:[]};
 const document={createElement:tag=>new Element(tag)};globalThis.document=document;
 const dialog={body:new Element(),opened:false,kind:null,open(title,kind,options){this.title=title;this.kind=kind;this.options=options;this.opened=true;this.body.replaceChildren();this.body.scrollTop=0;},close(){this.opened=false;}};
 const network={connected:true,passport:{realmCode:'ROOM22'}},calls=[],deckCalls=[],callbacks=[];
 const ui=createSharedCrewUI({getGame:()=>game,getSnapshot:()=>snapshot,getNetwork:()=>network,dialog,
  invoke:async(name,args)=>{calls.push({name,args});if(name==='setCrewAccess'){const vessel=snapshot.fleet.find(v=>v.id===args.vesselId);if(args.captainId)vessel.grants[args.captainId]={allowed:args.allowed,roles:args.roles,allowBunk:args.allowBunk};else vessel.allowCrew=args.allowed;}return{ok:true};},acceptResult:result=>result.ok,
  runDeckAction:async(name,args={})=>deckCalls.push({name,args}),openHome:()=>callbacks.push('home'),openPassport:()=>callbacks.push('passport'),openContact:id=>callbacks.push(['contact',id]),openCrewDuty:()=>callbacks.push('duty'),walkDeck:()=>callbacks.push('deck'),disconnect:()=>callbacks.push('disconnect'),toast:()=>{}});
 const buttons=()=>descendants(dialog.body).filter(node=>node.tagName==='button');
 const byLabel=label=>buttons().find(node=>node.attributes['aria-label']===label||node.textContent===label);
 return {game,port,ship,own,snapshot,dialog,network,calls,deckCalls,callbacks,ui,buttons,byLabel,text:()=>text(dialog.body)};
}

test('crew hub exposes named boarding controls before secondary galaxy options',()=>{
 const f=fixture();f.ui.openHub();
 assert.equal(f.dialog.title,'Crew & boarding');
 const labels=f.buttons().map(button=>button.textContent);
 assert.ok(labels.indexOf('Allow aboard')<labels.indexOf('Home berth & recovery'));
 assert.ok(f.byLabel('Allow aboard · Jade'));assert.ok(f.byLabel('Allow piloting · Jade'));
 assert.equal(f.byLabel('Allow piloting · Jade').disabled,true);
 assert.match(f.text(),/Docked at Kettle Station/);assert.match(f.text(),/At helm: No one/);
 assert.equal(f.calls.length,0,'Opening a roster never changes access.');
});

test('captain locations distinguish identically named owned hulls from the current ship',()=>{
 const f=fixture();f.own.name='Cinder';f.snapshot.presence[1].vesselId=f.own.id;f.ui.openHub();
 assert.match(f.text(),/Aboard their ship · Cinder/);
 f.snapshot.presence[1].vesselId=f.ship.id;f.ui.openHub();
 assert.match(f.text(),/Aboard this ship/);assert.doesNotMatch(f.text(),/Jade Online Aboard their ship/);
});

test('allowing a friend aboard never grants the helm or a new home bunk implicitly',async()=>{
 const f=fixture();f.ui.openHub();await f.byLabel('Allow aboard · Jade').onclick();
 const {name,args}=f.calls[0];assert.equal(name,'setCrewAccess');
 assert.equal(args.vesselId,'owner-hull');assert.equal(args.captainId,'guest');assert.equal(args.allowed,true);
 assert.equal(args.roles.includes('helm'),false);assert.ok(args.roles.includes('medical'));assert.ok(args.roles.includes('engineering'));assert.equal(args.allowBunk,false);
 assert.equal(f.byLabel('Allow aboard · Jade').attributes['aria-pressed'],'true');
 assert.equal(f.byLabel('Allow piloting · Jade').attributes['aria-pressed'],'false');assert.equal(f.byLabel('Allow piloting · Jade').disabled,false);
});

test('granting and removing piloting preserves other station and bunk permissions',async()=>{
 const f=fixture();f.ship.grants.guest={allowed:true,roles:['medical','navigation'],allowBunk:true};f.ui.openHub();
 f.dialog.body.scrollTop=240;await f.byLabel('Allow piloting · Jade').onclick();
 assert.deepEqual(f.calls[0].args,{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['medical','navigation','helm'],allowBunk:true});
 assert.equal(f.dialog.body.scrollTop,240,'Changing a permission keeps the place in the panel.');
 assert.equal(f.byLabel('Allow piloting · Jade').focused,true);
 await f.byLabel('Allow piloting · Jade').onclick();
 assert.deepEqual(f.calls[1].args,{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['medical','navigation'],allowBunk:true});
});

test('reallowing a revoked boarding invitation does not silently restore old helm access',async()=>{
 const f=fixture();f.ship.grants.guest={allowed:false,roles:['helm','engineering'],allowBunk:false};f.ui.openShip();
 await f.byLabel('Allow aboard · Jade').onclick();
 assert.deepEqual(f.calls[0].args,{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['engineering'],allowBunk:false});
});

test('personal denied access overrides open general boarding and controls show that state',()=>{
 const f=fixture();f.ship.allowCrew=true;f.ship.grants.guest={allowed:false,roles:['helm'],allowBunk:true};f.ui.openHub();
 assert.equal(f.byLabel('Allow aboard · Jade').attributes['aria-pressed'],'false');
 assert.equal(f.byLabel('Allow piloting · Jade').disabled,true);
});

test('granting a generally admitted visitor piloting keeps their existing effective station and bunk access',async()=>{
 const f=fixture();f.ship.allowCrew=true;f.ui.openHub();await f.byLabel('Allow piloting · Jade').onclick();
 assert.deepEqual(f.calls[0].args,{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['weapons','engineering','scanner','medical','security','helm'],allowBunk:true});
});

test('current carrier selection follows aboard, a valid arriving hull, then the owned hull',()=>{
 const f=fixture({guest:true});
 assert.equal(selectedCrewVessel(f.game,f.snapshot).id,'owner-hull');
 f.game.state.multiplayer.aboardVesselId='guest-hull';assert.equal(selectedCrewVessel(f.game,f.snapshot).id,'guest-hull');
 f.game.state.multiplayer.aboardVesselId=null;f.ship.dockedAt='morrow';assert.equal(selectedCrewVessel(f.game,f.snapshot).id,'guest-hull');
 f.ship.dockedAt='kettle';f.ship.canBoard=false;assert.equal(selectedCrewVessel(f.game,f.snapshot).id,'guest-hull');
 f.ship.canBoard=true;f.ui.openShip();assert.equal(f.dialog.title,'Cinder');
});

test('local boarding enters the named hull without piloting or launching, even with another captain at the helm',async()=>{
 const f=fixture({guest:true});Object.assign(f.ship,{helmOwner:'owner',helmName:'Morgan',helmOccupied:true,occupants:1,occupiedBerths:1,availableBerths:1});f.ui.openLocalShips();
 const board=f.byLabel('Board Cinder');assert.ok(board);assert.equal(board.disabled,false);
 await board.onclick();assert.deepEqual(f.deckCalls,[{name:'boardShip',args:{vesselId:'owner-hull'}}]);assert.equal(f.calls.length,0);
 assert.match(f.text(),/At helm: Morgan/);assert.match(f.text(),/ship stays docked/);
 assert.equal(f.byLabel('Board Quiet Step'),undefined,'The remote owned hull is not a local boarding choice.');
});

test('in-flight contacts remain accessible without a false ships-at-this-port menu',()=>{
 const f=fixture({aboard:true});f.game.state.mode='ship';f.game.state.locationId=null;f.ship.dockedAt=null;f.own.dockedAt=null;
 f.ui.openHub();assert.equal(f.byLabel('Ships at this port'),undefined);
 assert.match(f.text(),/Other ships nearby/);assert.ok(f.byLabel('Quiet Step · Jade'));
 f.ui.openLocalShips();assert.equal(f.byLabel('Board Quiet Step'),undefined);assert.match(f.text(),/No friendly ships are docked here/);
});

test('the local list explains a full hull without turning its permission into a boarding success',()=>{
 const f=fixture({guest:true});Object.assign(f.ship,{occupants:2,occupiedBerths:2,availableBerths:0});f.ui.openLocalShips();
 assert.equal(f.byLabel('Board Cinder').disabled,true);assert.match(f.text(),/free berth|berth.*full/i);assert.equal(f.deckCalls.length,0);
});

test('crew hub identifies the pilot and people still ashore by name',()=>{
 const f=fixture({aboard:true});f.game.state.interior={kind:'ship',location:{id:'owner-hull'}};
 Object.assign(f.ship,{helmOwner:'guest',helmName:'Jade',helmOccupied:true,occupants:2,occupiedBerths:2,availableBerths:0,crewAshore:[{captainId:'other',name:'Tavi'}]});
 f.snapshot.presence[1].vesselId='owner-hull';f.snapshot.presence[1].crewRole='helm';f.ui.openShip();
 assert.match(f.text(),/At helm: Jade/);assert.match(f.text(),/Still ashore: Tavi/);assert.match(f.text(),/Jade.*At the helm/);
 assert.equal(f.byLabel('Jade at helm').disabled,true,'A passenger cannot displace the named current pilot.');
});

test('a disconnected crew panel keeps state visible while disabling permission and boarding actions',()=>{
 const f=fixture();f.network.connected=false;f.ui.openHub();
 assert.match(f.text(),/Reconnecting/);assert.equal(f.byLabel('Allow aboard · Jade').disabled,true);assert.equal(f.byLabel('Board Cinder').disabled,true);
 assert.equal(f.byLabel('Captain passport').disabled,false);assert.equal(f.calls.length,0);
});

test('an NPC employee reaches duty and account options without a false manual disembark action',()=>{
 const f=fixture({aboard:true});f.game.state.interior={kind:'ship',location:{id:'owner-hull'}};f.game.state.npcContract={id:'watch',active:true};f.ship.npcContractId='watch';
 f.ui.openHub();assert.ok(f.byLabel('Crew duty'));f.byLabel('Crew duty').onclick();assert.deepEqual(f.callbacks,['duty']);
 assert.equal(f.buttons().some(node=>node.textContent.startsWith('Disembark')),false);assert.equal(f.byLabel('Allow aboard · Jade'),undefined);
 assert.ok(f.byLabel('Captain passport'));assert.ok(f.byLabel('Sign off safely'));assert.equal(f.deckCalls.length,0);
});
