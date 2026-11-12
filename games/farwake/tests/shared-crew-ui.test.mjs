import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {createSharedCrewUI,selectedCrewVessel,crewAccessChange} from '../dist/shared-crew-ui.mjs';
import {crewAwareness,publicCrewLocation} from '../dist/crew-awareness.mjs';
import {Realm} from '../server/realm.mjs';

class Element {
 constructor(tag='div') {this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.className='';this.textContent='';this.disabled=false;this.scrollTop=0;this.classList={add:name=>{this.className+=' '+name;}};}
 append(...nodes) {this.children.push(...nodes);}
 replaceChildren(...nodes) {this.children=[...nodes];}
 setAttribute(name,value) {this.attributes[name]=String(value);}
 querySelectorAll(selector) {return descendants(this).filter(node=>selector==='[data-crew-control]'?!!node.dataset.crewControl:node.tagName===selector);}
 focus() {this.focused=true;}
}
const descendants=root=>root.children.flatMap(node=>[node,...descendants(node)]);
const visibleDescendants=root=>(root.tagName==='details'&&!root.open?root.children.filter(node=>node.tagName==='summary'):root.children).flatMap(node=>[node,...visibleDescendants(node)]);
const text=root=>[root.textContent,...root.children.map(text)].join(' ');
function fixture({guest=false,aboard=false,invokeOverride=null,acceptOverride=null}={}) {
 const game=new Game('crew-panel-review'),port=game.system.bodies.find(body=>body.id==='kettle');
 game.state.mode='person';game.state.locationId='kettle';game.state.interior=null;
 Object.assign(game.state.ship,{x:port.x,y:port.y+port.radius+50,vx:0,vy:0});
 const captainId=guest?'guest':'owner';
 game.state.multiplayer={captainId,name:guest?'Jade':'Morgan',ownedVesselId:guest?'guest-hull':'owner-hull',aboardVesselId:aboard?'owner-hull':null,portVesselId:'owner-hull'};
 const ship={id:'owner-hull',name:'Cinder',classId:'sparrow',ownerId:'owner',ownerName:'Morgan',systemId:'hearth',dockedAt:'kettle',x:game.state.ship.x,y:game.state.ship.y,vx:0,vy:0,hull:100,maxHull:100,shield:35,maxShield:35,radius:18,berths:2,occupants:0,occupiedBerths:0,availableBerths:2,canBoard:true,canPilot:!guest,grantedRoles:guest?[]:['helm'],allowCrew:false,helmOwner:null,grants:{},crewAshore:[]};
 const own={...ship,id:'guest-hull',name:'Quiet Step',ownerId:'guest',ownerName:'Jade',dockedAt:'morrow',canBoard:guest,grants:{}};
 const snapshot={fleet:[ship,own],presence:[{captainId:'owner',name:'Morgan',online:true,systemId:'hearth',locationId:'kettle',roomKind:'surface',roomId:'ROOM22:surface:hearth:kettle',vesselId:aboard?'owner-hull':null,crewRole:'passenger'},{captainId:'guest',name:'Jade',online:true,systemId:'hearth',locationId:'kettle',roomKind:'surface',roomId:'ROOM22:surface:hearth:kettle',vesselId:null,crewRole:'passenger'}],realm:{name:'Our galaxy',code:'ROOM22',online:2},crew:[]};
 const document={createElement:tag=>new Element(tag)};globalThis.document=document;
 const dialog={body:new Element(),opened:false,kind:null,open(title,kind,options){this.title=title;this.kind=kind;this.options=options;this.opened=true;this.body.replaceChildren();this.body.scrollTop=0;},close(){this.opened=false;}};
 const network={connected:true,passport:{realmCode:'ROOM22'}},calls=[],deckCalls=[],callbacks=[],toasts=[];
 const ui=createSharedCrewUI({getGame:()=>game,getSnapshot:()=>snapshot,getNetwork:()=>network,dialog,
  invoke:async(name,args)=>{calls.push({name,args});if(invokeOverride)return invokeOverride(name,args);if(name==='setCrewAccess'){const vessel=snapshot.fleet.find(v=>v.id===args.vesselId);if(args.captainId)vessel.grants[args.captainId]={allowed:args.allowed,roles:args.roles,allowBunk:args.allowBunk};else vessel.allowCrew=args.allowed;}return{ok:true};},acceptResult:result=>acceptOverride?acceptOverride(result):result.ok,
  runDeckAction:async(name,args={})=>deckCalls.push({name,args}),disembark:()=>callbacks.push('disembark'),openHome:()=>callbacks.push('home'),openPassport:()=>callbacks.push('passport'),openContact:id=>callbacks.push(['contact',id]),openCrewDuty:()=>callbacks.push('duty'),openMilitary:context=>callbacks.push(['military',context]),walkDeck:()=>callbacks.push('deck'),disconnect:()=>callbacks.push('disconnect'),toast:message=>toasts.push(message)});
 const buttons=()=>descendants(dialog.body).filter(node=>node.tagName==='button');
 const byLabel=label=>buttons().find(node=>node.attributes['aria-label']===label||node.textContent===label);
 return {game,port,ship,own,snapshot,dialog,network,calls,deckCalls,callbacks,toasts,ui,buttons,byLabel,text:()=>text(dialog.body)};
}

test('Play together leads with one named friend action and collapses permission management',()=>{
 const f=fixture();f.ui.openHub();
 assert.equal(f.dialog.title,'Play together');
 const visible=visibleDescendants(f.dialog.body),labelsVisible=visible.filter(node=>node.tagName==='button').map(node=>node.textContent);
 assert.equal(labelsVisible[0],'Allow Jade aboard');assert.ok(labelsVisible.includes('Serve together'));
 assert.ok(!labelsVisible.includes('Allow piloting'));assert.ok(!labelsVisible.includes('Home berth & recovery'));
 const management=descendants(f.dialog.body).find(node=>node.tagName==='details'&&node.children[0]?.textContent==='Ship permissions');assert.ok(management);assert.notEqual(management.open,true);
 const labels=f.buttons().map(button=>button.textContent);
 assert.ok(labels.indexOf('Allow aboard')<labels.indexOf('Home berth & recovery'));
 assert.ok(f.byLabel('Allow aboard · Jade'));assert.ok(f.byLabel('Allow piloting · Jade'));
 assert.equal(f.byLabel('Allow piloting · Jade').disabled,true);
 assert.match(f.text(),/Docked at Kettle Station/);assert.match(f.text(),/At helm: No one/);
 assert.equal(f.calls.length,0,'Opening a roster never changes access.');
});

test('crew roster shows individual military rank and operation duty without changing ship permissions',()=>{
 const f=fixture({aboard:true});f.snapshot.presence[0].military={factionId:'freewake',branchId:'navy',rank:'Petty officer',rankIndex:2,operationId:'watch-one',role:'leader'};
 f.snapshot.presence[1].military={factionId:'freewake',branchId:'navy',rank:'Recruit',rankIndex:0,operationId:'watch-one',role:'gunner'};
 f.snapshot.presence[1].vesselId=f.ship.id;const grants=structuredClone(f.ship.grants);f.ui.openShip(f.ship.id);
 assert.match(f.text(),/Navy · Petty officer · Operation leader/);assert.match(f.text(),/Navy · Recruit · Gunner/);
 assert.deepEqual(f.ship.grants,grants);assert.equal(f.calls.length,0);assert.equal(f.byLabel('Allow piloting · Jade').disabled,true);
 f.ui.openHub();assert.match(f.text(),/Petty officer/);assert.match(f.text(),/Recruit/);assert.equal(f.calls.length,0);
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
 const permissions=()=>descendants(f.dialog.body).find(node=>node.tagName==='details'&&node.children[0]?.textContent==='Ship permissions');permissions().open=true;
 f.dialog.body.scrollTop=240;await f.byLabel('Allow piloting · Jade').onclick();
 assert.deepEqual(f.calls[0].args,{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['medical','navigation','helm'],allowBunk:true});
 assert.equal(f.dialog.body.scrollTop,240,'Changing a permission keeps the place in the panel.');
 assert.equal(f.byLabel('Allow piloting · Jade').focused,true);
 assert.equal(permissions().open,true,'Changing access keeps expanded management controls open.');
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

test('an NPC employee can leave the docked watch without opening duty, while an underway watch has no port exit',()=>{
 const f=fixture({aboard:true});f.game.state.interior={kind:'ship',location:{id:'owner-hull'}};f.game.state.npcContract={id:'watch',active:true};f.ship.npcContractId='watch';
 f.ui.openHub();assert.ok(f.byLabel('Crew duty'));f.byLabel('Crew duty').onclick();assert.deepEqual(f.callbacks,['duty']);
 assert.ok(f.byLabel('Disembark at Kettle Station'));f.byLabel('Disembark at Kettle Station').onclick();assert.deepEqual(f.callbacks,['duty','disembark']);assert.equal(f.byLabel('Allow aboard · Jade'),undefined);
 assert.ok(f.byLabel('Captain passport'));assert.ok(f.byLabel('Sign off safely'));assert.equal(f.deckCalls.length,0);
 f.game.state.multiplayer.dockedAt=null;f.ui.openHub();assert.equal(f.buttons().some(node=>node.textContent.startsWith('Disembark')),false);assert.ok(f.byLabel('Crew duty'));
});


test('the crew hub uses fresh dock metadata, marks a distant airlock, and keeps its helm and tether choices separate',()=>{
 const f=fixture({aboard:true});f.game.state.interior={kind:'ship',location:{id:'owner-hull',vesselId:'owner-hull',shipClass:'sparrow'}};
 f.ship.dockedAt='morrow';f.ship.grantedRoles=[];f.ship.canBoard=false;
 Object.assign(f.game.state.multiplayer,{dockedAt:'kettle',dockedName:'Kettle Station',returnVesselId:'stale-tether'});
 Object.assign(f.game.state.person,{x:-500,y:-500});f.ui.openHub();
 const exit=f.byLabel('Disembark at Kettle Station');assert.ok(exit);assert.equal(exit.disabled,false);assert.match(exit.title,/marked entry airlock/);
 assert.equal(f.byLabel('Return across the tether'),undefined);assert.match(f.text(),/Cinder YOUR SHIP Docked at Kettle Station/);
 exit.onclick();assert.deepEqual(f.callbacks,['disembark']);assert.equal(f.deckCalls.length,0,'The app callback guides to the airlock; the crew panel does not issue an out-of-range exit.');
 f.game.state.multiplayer.dockedAt=null;f.ui.openHub();assert.equal(f.byLabel('Disembark at Kettle Station'),undefined);assert.ok(f.byLabel('Return across the tether'));assert.match(f.text(),/In flight/);
});

test('both ashore captains see the same meeting ship and an owner can allow only the named friend',async()=>{
 const owner=fixture();owner.ship.grants.guest={allowed:false,roles:['navigation','engineering'],allowBunk:true};owner.ui.openHub();
 assert.match(owner.text(),/Meet aboard Cinder/);await owner.byLabel('Allow Jade aboard').onclick();
 assert.deepEqual(owner.calls,[{name:'setCrewAccess',args:{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['navigation','engineering'],allowBunk:true}}]);
 assert.equal(owner.ship.allowCrew,false);assert.equal(owner.ship.ownerId,'owner');assert.equal(owner.game.state.multiplayer.aboardVesselId,null);
 assert.ok(owner.byLabel('Board Cinder'));assert.match(owner.text(),/Jade is cleared to board/);
 const guest=fixture({guest:true});guest.ui.openHub();assert.match(guest.text(),/Meet aboard Cinder/);
 await guest.byLabel('Board Cinder').onclick();assert.deepEqual(guest.deckCalls,[{name:'boardShip',args:{vesselId:'owner-hull'}}]);
 assert.equal(guest.calls.length,0,'Joining does not grant permissions, change ownership, or enlist the friend.');
});

test('a narrow repeated invitation preserves an existing helm, station, and bunk grant',()=>{
 const f=fixture();f.ship.grants.guest={allowed:true,roles:['helm','engineering','medical'],allowBunk:true};
 assert.deepEqual(crewAccessChange(f.ship,'guest','invite'),{vesselId:'owner-hull',captainId:'guest',allowed:true,roles:['helm','engineering','medical'],allowBunk:true});
 f.ui.openHub();assert.equal(f.byLabel('Allow Jade aboard'),undefined,'A friend already allowed aboard is never offered a destructive toggle as the next step.');
 assert.equal(f.byLabel('Allow piloting · Jade').attributes['aria-pressed'],'true');assert.equal(f.calls.length,0);
});

test('a denied friend sees exactly which owner action is required and cannot bypass boarding',async()=>{
 const f=fixture({guest:true});f.ship.canBoard=false;f.ui.openHub();
 const board=f.byLabel('Board Cinder');assert.ok(board);assert.equal(board.disabled,true);
 assert.match(f.text(),/Ask Morgan to choose “Allow Jade aboard” in Play together/);
 await board.onclick();assert.equal(f.deckCalls.length,0);assert.equal(f.calls.length,0);
});

test('fresh boarding access and a changed meeting ship are checked again on click',async()=>{
 const f=fixture({guest:true});f.snapshot.presence[0].vesselId=f.ship.id;f.ui.openHub();
 const board=f.byLabel('Board Cinder');f.ship.canBoard=false;await board.onclick();assert.equal(f.deckCalls.length,0);assert.match(f.toasts[0],/owner must allow/i);
 f.ship.canBoard=true;f.ui.openHub();const moving=f.byLabel('Board Cinder');f.snapshot.presence[0].vesselId=f.own.id;await moving.onclick();
 assert.equal(f.deckCalls.length,0);assert.match(f.toasts.at(-1),/location changed/);
});

test('same ship and same deployment are separate public states with personal ranks',()=>{
 const f=fixture({aboard:true});f.snapshot.presence[1].vesselId=f.ship.id;
 f.snapshot.presence[0].military={factionId:'freewake',branchId:'navy',rank:'Petty officer',operationId:'watch-one',role:'leader'};
 f.snapshot.presence[1].military={factionId:'freewake',branchId:'navy',rank:'Recruit',operationId:'watch-two',role:'gunner'};
 f.ui.openHub();assert.match(f.text(),/Aboard together/);assert.doesNotMatch(f.text(),/Same crew · Same deployment/);assert.ok(f.byLabel('Serve together'));
 f.byLabel('Serve together').onclick();assert.deepEqual(f.callbacks,[['military',{captainId:'guest',operationId:'watch-two'}]]);
 f.snapshot.presence[1].military.operationId='watch-one';f.ui.openHub();assert.match(f.text(),/Same crew · Same deployment/);assert.ok(f.byLabel('View shared deployment'));
 assert.match(f.text(),/Recruit/);assert.match(f.text(),/Petty officer/);assert.equal(f.calls.length,0);
});

test('two unenlisted friends can discover military service without changing enlistment',()=>{
 const f=fixture();f.ui.openHub();assert.ok(f.byLabel('Serve together'));assert.match(f.text(),/Sergeant Venn on Morrow.*Navy and Army/);
 f.byLabel('Serve together').onclick();assert.deepEqual(f.callbacks,[['military',{captainId:'guest',operationId:null}]]);assert.equal(f.calls.length,0);
});

test('military carrier joining is routed through deployment permissions rather than direct ship boarding',()=>{
 const f=fixture({guest:true});f.ship.npcContractId='watch-one';f.snapshot.presence[0].vesselId=f.ship.id;
 f.snapshot.presence[0].military={factionId:'freewake',branchId:'navy',rank:'Petty officer',operationId:'watch-one',role:'leader'};
 f.ui.openHub();const visible=visibleDescendants(f.dialog.body).filter(node=>node.tagName==='button').map(node=>node.textContent);
 assert.ok(visible.includes('Serve together'));assert.ok(!visible.includes('Board Cinder'));assert.match(f.text(),/Join the same deployment/);
 assert.equal(f.deckCalls.length,0);assert.equal(f.calls.length,0);
});

test('an enlisted captain on a paid NPC watch is not described as having a military deployment',()=>{
 const f=fixture({guest:true});f.ship.npcContractId='ordinary-paid-watch';f.snapshot.presence[0].vesselId=f.ship.id;
 f.snapshot.presence[0].military={factionId:'freewake',branchId:'navy',rank:'Petty officer',operationId:null,role:'Independent service'};
 f.snapshot.presence[1].military={factionId:'freewake',branchId:'navy',rank:'Recruit',operationId:'unrelated-muster',role:'gunner'};
 f.ui.openHub();assert.match(f.text(),/This is a paid NPC crew assignment/);assert.doesNotMatch(f.text(),/Join the same deployment to receive/);
 assert.ok(f.byLabel('Serve together'),'Enlisted captains may still review service separately from this paid watch.');assert.equal(f.calls.length,0);
});

test('a hull walk retains crew association without claiming both captains are aboard',()=>{
 const f=fixture({aboard:true});f.game.state.interior={kind:'ship',location:{id:f.ship.id}};
 Object.assign(f.snapshot.presence[1],{vesselId:f.ship.id,roomKind:'eva',roomId:'ROOM22:eva:owner-hull'});
 let model=crewAwareness(f.game,f.snapshot);assert.equal(model.crewCount,2);assert.equal(model.friends[0].sameVessel,true);assert.equal(model.friends[0].aboardTogether,false);assert.match(model.detail,/Jade outside Cinder/);
 f.ui.openHub();assert.match(f.text(),/Outside Cinder/);assert.match(f.text(),/Jade is outside on a hull walk/);assert.doesNotMatch(f.text(),/Aboard together/);
 Object.assign(f.snapshot.presence[1],{roomKind:'ship',roomId:'ROOM22:ship:owner-hull'});f.game.state.interior.kind='eva';
 model=crewAwareness(f.game,f.snapshot);assert.equal(model.localOutside,true);assert.equal(model.friends[0].aboardTogether,false);assert.match(model.detail,/You are outside Cinder/);
 f.ui.openHub();assert.match(f.text(),/You are outside on a hull walk/);assert.doesNotMatch(f.text(),/Aboard together/);
});

test('guest airlock remains prominent while permanent Helm denial is collapsed and temporary states stay visible',()=>{
 const f=fixture({guest:true,aboard:true});f.game.state.interior={kind:'ship',location:{id:f.ship.id}};f.snapshot.presence[1].vesselId=f.ship.id;f.ui.openHub();
 assert.ok(f.byLabel('Disembark at Kettle Station'));assert.equal(f.byLabel('Launch ship'),undefined);
 const access=descendants(f.dialog.body).find(node=>node.tagName==='details'&&node.children[0]?.textContent==='Helm access');assert.ok(access);assert.notEqual(access.open,true);
 assert.match(text(access),/Ask Morgan to enable Allow piloting/);
 Object.assign(f.ship,{helmOwner:'owner',helmName:'Morgan',helmOccupied:true});f.ui.openHub();assert.equal(f.byLabel('Morgan at helm').disabled,true);
 f.ship.helmOwner=null;f.network.connected=false;f.ui.openHub();assert.equal(f.byLabel('Launch ship').disabled,true);assert.match(f.byLabel('Launch ship').title,/Reconnecting/);
});

test('public crew awareness uses actual public places, with old room IDs as a fallback',()=>{
 const f=fixture(),friend=f.snapshot.presence[1];friend.home={systemId:'hearth',locationId:'morrow'};
 let model=crewAwareness(f.game,f.snapshot);assert.match(model.friends[0].location.text,/Kettle Station/);assert.equal(model.friends[0].samePort,true);
 delete friend.locationId;delete friend.roomKind;model=crewAwareness(f.game,f.snapshot);assert.match(model.friends[0].location.text,/Kettle Station/);
 delete friend.roomId;assert.doesNotMatch(publicCrewLocation(f.game,friend,f.snapshot.fleet).text,/Morrow/,'Home is not a live location.');
});

test('compact crew counts human friends and keeps dock arrival fresher than the fleet record',()=>{
 const f=fixture({aboard:true});f.snapshot.presence[1].vesselId=f.ship.id;f.ship.occupants=20;f.ship.dockedAt='morrow';f.game.state.multiplayer.dockedAt='kettle';
 let model=crewAwareness(f.game,f.snapshot);assert.equal(model.crewCount,2);assert.equal(model.label,'Crew 2');assert.match(model.detail,/Jade aboard Cinder/);assert.match(model.friends[0].location.text,/Kettle Station/);
 f.snapshot.presence[1].online=false;model=crewAwareness(f.game,f.snapshot);assert.equal(model.crewCount,1);assert.equal(model.onlineCount,1);assert.equal(model.friends[0].online,false);
});

test('hub refresh reacts to friend access and location changes while retaining expanded management and scroll',()=>{
 const f=fixture({guest:true});f.ship.canBoard=false;f.ui.openHub();
 const root=f.dialog.body.children[0],details=descendants(root).find(node=>node.tagName==='details'&&node.children[0]?.textContent==='Your ship & boarding');details.open=true;f.dialog.body.scrollTop=165;
 assert.equal(f.ui.refresh(),false);assert.equal(f.dialog.body.children[0],root);
 f.ship.x+=4;assert.equal(f.ui.refresh(),false,'Routine ship motion at a dock does not rebuild the panel.');
 f.ship.canBoard=true;assert.equal(f.ui.refresh(),true);assert.equal(f.byLabel('Board Cinder').disabled,false);assert.equal(f.dialog.body.scrollTop,165);
 assert.equal(descendants(f.dialog.body).find(node=>node.tagName==='details'&&node.children[0]?.textContent==='Your ship & boarding').open,true);
 f.snapshot.presence[0].vesselId=f.ship.id;assert.equal(f.ui.refresh(),true);assert.match(f.text(),/Aboard Cinder/);
 f.dialog.open('Other activity','online');assert.equal(f.ui.refresh(),false,'A different online dialog is not replaced by crew refresh.');
});

test('old controls and late permission results cannot act on a different captain',async()=>{
 const stale=fixture();stale.ui.openHub();const invite=stale.byLabel('Allow Jade aboard');stale.game.state.multiplayer.captainId='new-captain';await invite.onclick();assert.equal(stale.calls.length,0);
 let finish,accepted=0;const f=fixture({invokeOverride:()=>new Promise(resolve=>{finish=resolve;}),acceptOverride:()=>{accepted++;return true;}});
 f.ui.openHub();const root=f.dialog.body.children[0],pending=f.byLabel('Allow Jade aboard').onclick();assert.equal(f.calls.length,1);assert.equal(f.ui.refresh(),false);
 f.game.state.multiplayer.captainId='new-captain';finish({ok:true});await pending;
 assert.equal(accepted,0);assert.equal(f.dialog.body.children[0],root);assert.equal(f.ui.refresh(),false);
});

test('the friend-first buttons form a real docked crew through realm authority and leave a guest free to disembark',async()=>{
 const realm=new Realm({id:'PLAYTOGETHER',seed:'crew-mobile-live',persistence:{kind:'memory',async save(_id,version){return{version:version+1};}}});
 const owner=(await realm.createCaptain('Morgan')).captain,guest=(await realm.createCaptain('Jade')).captain,room=realm._room('hearth');
 for(const field of ['enemies','bullets','signals','pickups'])room.runtime[field]=[];
 const port=room.runtime.bodies.find(body=>body.id==='kettle'),vessel=realm.vessels.get(owner.ownedVesselId);vessel.name='Cinder';
 for(const captain of [owner,guest]){
  assert.equal(realm.attach(captain,{close(){}}).ok,true);
  Object.assign(realm.vessels.get(captain.ownedVesselId).ship,{x:port.x,y:port.y+port.radius+80,vx:0,vy:0});
  const dock=await realm.command(captain,'dock',{id:port.id});assert.equal(dock.ok,true,dock.reason);
 }
 globalThis.document={createElement:tag=>new Element(tag)};
 function client(captain){
  let snapshot=realm.snapshotFor(captain,{drainEvents:false});const game=Game.fromSave(snapshot.state),network={connected:true},dialog={body:new Element(),opened:false,open(title,kind){this.title=title;this.kind=kind;this.opened=true;this.body.replaceChildren();},close(){this.opened=false;}};
  const pull=()=>{snapshot=realm.snapshotFor(captain,{drainEvents:false});game.state=structuredClone(snapshot.state);};
  const command=async(name,args={})=>{const response=await realm.command(captain,name,args);pull();assert.equal(response.ok,true,response.reason);return response;};
  const ui=createSharedCrewUI({getGame:()=>game,getSnapshot:()=>snapshot,getNetwork:()=>network,dialog,invoke:command,acceptResult:response=>response.ok,runDeckAction:command,disembark:()=>command('disembark'),openMilitary:()=>{},toast:()=>{}});
  return {game,ui,dialog,pull,byLabel:label=>descendants(dialog.body).find(node=>node.tagName==='button'&&node.textContent===label),snapshot:()=>snapshot};
 }
 const host=client(owner),visitor=client(guest);host.ui.openHub();visitor.ui.openHub();
 assert.equal(visitor.byLabel('Board Cinder').disabled,true);await host.byLabel('Allow Jade aboard').onclick();
 assert.equal(vessel.grants[guest.id].allowed,true);assert.equal(vessel.grants[guest.id].roles.includes('helm'),false);assert.equal(vessel.grants[guest.id].allowBunk,false);
 await host.byLabel('Board Cinder').onclick();visitor.pull();assert.equal(visitor.ui.refresh(),true);await visitor.byLabel('Board Cinder').onclick();
 assert.equal(owner.aboard,vessel.id);assert.equal(guest.aboard,vessel.id);assert.equal(vessel.dockedAt,'kettle');assert.equal(vessel.helmOwner,null);assert.notEqual(guest.ownedVesselId,vessel.id);
 visitor.pull();assert.equal(crewAwareness(visitor.game,visitor.snapshot()).label,'Crew 2');
 assert.equal(realm._canRole(guest,vessel,'helm'),false);
 const airlock=realm._surface(guest).entities.find(entity=>entity.data?.airlock);assert.ok(airlock);Object.assign(guest.game.state.person,{x:airlock.x,y:airlock.y});
 visitor.pull();visitor.ui.openHub();await visitor.byLabel('Disembark at Kettle Station').onclick();
 assert.equal(guest.aboard,null);assert.equal(guest.game.state.locationId,'kettle');assert.equal(owner.aboard,vessel.id);assert.equal(vessel.dockedAt,'kettle');
});
