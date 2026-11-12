/** Personal casualty orders, custody, and a real passenger berth home. */
import { FACTIONS } from './content.mjs';
import { getShipClass, cabinLayout } from './fleet.mjs';
import { systemBodyPosition } from './system-space.mjs';
import { militaryServiceRank } from './military-ranks.mjs';
import { nearestRecoveryStation } from './ship-recovery.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ok=data=>({ok:true,...data});
const fail=(reason,code='military-recovery')=>({ok:false,reason,message:reason,code});
const fields=['cargo','upgrades','crew','formerCrew','memorial','boardingHistory','boarding'];
const factionName=id=>FACTIONS.find(faction=>faction.id===id)?.name||id;
export const MILITARY_DETENTION_SECONDS=300;
export const MILITARY_RIVALS=Object.freeze({concord:'cinder',freewake:'meridian',meridian:'freewake',lantern:'cinder',cinder:'concord'});
const homePorts=Object.freeze({freewake:['hearth','morrow'],concord:['nacre','ward'],meridian:['meridian','serein'],lantern:['vesper','lilt'],cinder:['cinder','kiln']});
const recovery=game=>game.state.militaryRecovery;
const location=game=>!game.state.interior&&game.system.bodies.find(body=>body.id===game.state.locationId);
const passenger=game=>game._npcWorkers?.find(worker=>String(worker.playerId)===String(game.state.npcContract?.employeeId))||game;
const aboardPassage=game=>game.state.npcContract?.active&&game.state.npcContract.repatriation===true;
const inhabited=body=>body&&body.portServices!==false&&body.landable!==false&&!['blackhole','site','ship','derelict'].includes(body.kind)&&!(body.kind==='moon'&&/barren|rock|dust/.test(String(body.biome)));
function portDescriptor(game,systemId,bodyId){const system=game.galaxy.find(value=>value.id===systemId),index=system?.bodies.findIndex(body=>body.id===bodyId)??-1;if(index<0)return null;const body=system.bodies[index];return{...body,systemId,bodyId:body.id,...systemBodyPosition(body,index,systemId),radius:body.kind==='planet'?122:body.kind==='moon'?76:70,faction:body.faction||system.faction};}
function homeFor(game,factionId){const ids=homePorts[factionId];if(!ids)return null;const body=portDescriptor(game,...ids);return body?{systemId:body.systemId,bodyId:body.id,name:body.name}:null;}
function emit(game,text,type='military-recovery'){game._event?.(type,{text});}
function cellLocation(game){const r=recovery(game),detention=r?.detention;if(!detention)return null;return{id:`detention:${detention.systemId}:${detention.bodyId}:${game.playerId}`,kind:'detention',biome:'station',name:`${detention.portName} · military detention`,faction:detention.captorFactionId,systemId:detention.systemId,parentId:detention.bodyId,portServices:false,landable:false};}
function enterCell(game,{reset=false}={}){const cell=cellLocation(game);if(!cell)return;const prior=game.state.interior?.kind==='detention';Object.assign(game.state,{mode:'person',locationId:cell.id,interior:{kind:'detention',location:cell},stationView:null,exploration:null,boarding:null,pendingEncounter:null});Object.assign(game.state.person,{weaponDrawn:false,aimManual:false,aimTargetId:null,lastShot:null,attackUntil:0});if(reset||!prior)Object.assign(game.state.person,{x:9.5*24,y:7.5*24,moving:false,vx:0,vy:0});}

/** A small locked station room. It has no exit entity until the authority releases the prisoner. */
export function detentionSurface(location,seed){
 const cols=20,rows=16,tileSize=24,tiles=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>x>=3&&x<=16&&y>=3&&y<=12?(x===3||x===16||y===3||y===12?2:1):0));
 return{id:location.id,name:location.name,kind:'station',biome:'station',seed:1,cols,rows,tileSize,width:cols*tileSize,height:rows*tileSize,pixelWidth:cols*tileSize,pixelHeight:rows*tileSize,tiles,solids:[],entities:[],spawn:{x:9.5*24,y:7.5*24},exit:null,
  palette:{floor:'#26343e',floor2:'#293944',edge:'#42525b',wall:'#18232e',wallTop:'#566976',path:'#38474b',accent:'#c5aa7b',light:'#c5aa7b',ground:'#26343e',ground2:'#293944'},
  decor:[{kind:'bunk',x:5*24,y:5*24,w:3*24,h:24,color:'#738286'},{kind:'table',x:13*24,y:8*24,w:24,h:24,color:'#6d7069'},{kind:'label',x:6*24,y:3.4*24,w:24,h:24,color:'#d2bc8e',text:'MILITARY DETENTION'},{kind:'airlock',x:9*24,y:12*24,w:2*24,h:24,color:'#ae6666'},{kind:'light',x:4*24,y:3.8*24,w:12*24,h:4,color:'#b9c4bd'}]};
}

export const MilitaryRecoveryRules={
 initializeMilitaryRecovery(){
  const raw=recovery(this),career=militaryServiceRank(this);
  if(!raw||!career.enlisted||raw.factionId!==career.factionId||!homeFor(this,raw.factionId)){this.state.militaryRecovery=null;return null;}
  const home=homeFor(this,raw.factionId),detention=raw.detention,port=detention&&portDescriptor(this,detention.systemId,detention.bodyId);
  this.state.militaryRecovery={version:1,factionId:raw.factionId,home,status:['orders','detained','aboard','returned'].includes(raw.status)?raw.status:'orders',issuedAt:Math.max(0,finite(raw.issuedAt)),sourceSystemId:typeof raw.sourceSystemId==='string'?raw.sourceSystemId:this.state.systemId,sourceKind:String(raw.sourceKind||'ship-destroyed').slice(0,60),vesselId:typeof raw.vesselId==='string'?raw.vesselId:null,passageId:typeof raw.passageId==='string'?raw.passageId:null,detention:port&&raw.status==='detained'?{systemId:port.systemId,bodyId:port.id,portName:port.name,captorFactionId:FACTIONS.some(faction=>faction.id===detention.captorFactionId)?detention.captorFactionId:port.faction,remainingSeconds:clamp(finite(detention.remainingSeconds,MILITARY_DETENTION_SECONDS),0,MILITARY_DETENTION_SECONDS)}:null};
  if(this.state.militaryRecovery.detention?.remainingSeconds>0)enterCell(this,{reset:this.state.interior?.kind!=='detention'});
  else if(this.state.militaryRecovery.status==='detained'){this.state.militaryRecovery.status='orders';this.state.militaryRecovery.detention=null;if(this.state.interior?.kind==='detention'&&port){const body=this.system.bodies.find(body=>body.id===port.id);if(body)this._arriveAsPassenger(body);}}
  return this.state.militaryRecovery;
 },
 applyMilitaryRecovery({systemId=this.state.systemId,originFactionId,sourceKind='ship-destroyed',vesselId=null,nearestBody}={}){
  const career=militaryServiceRank(this);if(!career.enlisted)return null;
  const home=homeFor(this,career.factionId);if(!home)return null;
  const system=this.galaxy.find(value=>value.id===systemId),captorFactionId=originFactionId||system?.faction,captured=MILITARY_RIVALS[career.factionId]===captorFactionId||MILITARY_RIVALS[captorFactionId]===career.factionId;
  const body=nearestBody&&portDescriptor(this,nearestBody.systemId||this.state.systemId,nearestBody.bodyId||nearestBody.id)||location(this);
  const state=this.state.militaryRecovery={version:1,factionId:career.factionId,home,status:captured&&body?'detained':'orders',issuedAt:finite(this.state.stats?.time),sourceSystemId:systemId,sourceKind,vesselId,passageId:null,detention:null};
  if(captured&&body){state.detention={systemId:body.systemId||this.state.systemId,bodyId:body.id,portName:body.name,captorFactionId,remainingSeconds:MILITARY_DETENTION_SECONDS};enterCell(this,{reset:true});const text=`${factionName(captorFactionId)} has detained you as opposing military personnel at ${body.name}. Serve five minutes in custody, then use your personal repatriation clearance to request free passage home.`;this._log('Captured in enemy territory',text,'military');emit(this,text);}
  else{const text=`Your ${factionName(career.factionId)} service record is intact. Port services can arrange a passenger berth to ${home.name} at no charge. The transport remains the pilot’s ship.`;this._log('Repatriation orders issued',text,'military');emit(this,text);}
  return state;
 },
 militaryEnemyTerritory(factionId=this.currentSystem.faction){
  const career=militaryServiceRank(this);return career.enlisted&&(MILITARY_RIVALS[career.factionId]===factionId||MILITARY_RIVALS[factionId]===career.factionId);
 },
 recoverMilitaryCasualty({originFactionId=this.currentSystem.faction,position=this.state.ship,sourceKind='military-casualty'}={}){
  if(!this.militaryEnemyTerritory(originFactionId))return null;
  if(this.state.npcContract?.active&&!this._sharedWorld){this.recoverNpcContract('The damaged crew was recovered in opposing faction territory. Your personal hull remains at its berth.');return this._ok({captured:true});}
  const body=nearestRecoveryStation(this.system,position);if(!body)return null;
  const destination={systemId:this.state.systemId,bodyId:body.id,name:body.name},context={sourceSystemId:this.state.systemId,sourceFactionId:originFactionId,sourceKind,sourcePosition:{x:finite(position.x),y:finite(position.y)},vesselId:this.state.ship.id,vesselName:this.state.ship.name,destination,message:'You were incapacitated in opposing faction territory and taken into military custody. Your surviving property remains where you left it.'};
  this._arriveAsPassenger(body);return this.completeShipRecovery(context);
 },
 militaryRecoveryAccess(name){
  if(recovery(this)?.detention?.remainingSeconds>0&&!['setCameraPreferences','renameCaptain','leaveGunnery'].includes(name))return fail(`Military detention: ${Math.ceil(recovery(this).detention.remainingSeconds)} seconds remain. Release and repatriation clearance follow automatically.`, 'military-detention');
  if(aboardPassage(this)&&name==='cancelNpcContract')return fail('This repatriation transport is already assigned to bring you home. Wait for docking, then use the entry airlock.','military-passage');
  return ok({});
 },
 stepMilitaryRecovery(delta){
  const state=recovery(this);if(!state)return false;
  const dt=clamp(finite(delta),0,.1),detention=state.detention;
  if(detention&&state.status==='detained'){
   detention.remainingSeconds=Math.max(0,detention.remainingSeconds-dt);this.state.person.weaponDrawn=false;
   if(detention.remainingSeconds>1e-7){if(this.state.interior?.kind!=='detention')enterCell(this,{reset:true});return false;}
   const body=this.system.bodies.find(body=>body.id===detention.bodyId);
   if(!body)return false;
   state.detention=null;state.status='orders';this._arriveAsPassenger(body);this.state.pendingEncounter=null;
   const text='Your five-minute detention is complete. You are released at the station landing with repatriation clearance. Open Port services to request a free military passenger berth home.';this._log('Released from military detention',text,'military');emit(this,text,'military-released');return true;
  }
  if(!aboardPassage(this)&&!this.state.interior&&this.state.systemId===state.home.systemId&&this.state.locationId===state.home.bodyId&&state.status!=='returned'){state.status='returned';state.passageId=null;emit(this,`You have returned to ${state.home.name}. Your rank, service record, and personal clearance are unchanged.`);}
  return false;
 },
 militaryRecoveryStatus(){
  const state=recovery(this);if(!state)return null;
  const rank=militaryServiceRank(this),body=location(this),detained=!!state.detention&&state.detention.remainingSeconds>1e-7,atHome=!this.state.interior&&this.state.systemId===state.home.systemId&&this.state.locationId===state.home.bodyId,passage=aboardPassage(this),eligible=rank.enlisted&&rank.factionId===state.factionId&&!rank.suspended;
  const reason=detained?'Serve the remaining detention before boarding.':!eligible?'Your own faction must restore your service clearance before authorizing free passage.':passage?'Your repatriation transport is already underway.':atHome||state.status==='returned'?'You have reached your home posting.':this.state.npcContract?.active?'Complete your current crew watch first.':!body||!inhabited(body)?'Request your passenger berth from an inhabited port.':this.state.person.health<=0||this.state.person.down?'Recover before boarding.':this.state.pendingEncounter?'Finish the current conversation before boarding.':null;
  return{status:state.status,factionId:state.factionId,factionName:factionName(state.factionId),rank:rank.rank,home:clone(state.home),detained,remainingSeconds:Math.ceil(Math.max(0,finite(state.detention?.remainingSeconds))),captorFaction:state.detention?factionName(state.detention.captorFactionId):null,eligible,canBook:!reason,reason,passage:!!passage,passagePhase:passage?this.state.npcContract.phase:null,passageShipName:passage?this.state.npcContract.shipName:null,arrived:atHome||state.status==='returned',fare:0};
 },
 startMilitaryPassage(){
  if(this._sharedWorld)return fail('The galaxy authority must assign your transport.','authority');
  const result=createMilitaryPassage(this);if(!result.ok)return result;
  const {contract,ship,inventory}=result;
  const own=this.personalShip,body=location(this);if(this.ownsShip&&body&&this.canUseOwnShipHere())this.state.livelihoods.parkedShip={...clone(own),systemId:this.state.systemId,bodyId:body.id,vesselId:own.id};
  contract.personal={ship:this.state.ship,...Object.fromEntries(fields.map(field=>[field,this.state[field]??(field==='boarding'?null:field==='cargo'?{ore:0,crystal:0}:field==='upgrades'?{}:[])]))};
  this.state.npcContract=contract;this.state.ship=ship;for(const field of fields)this.state[field]=inventory[field];
  Object.assign(this.state,{mode:'ship',interior:null,locationId:null,exploration:null,pendingEncounter:null,stationView:null});
  this._enterInterior({id:`ship:${ship.id}`,vesselId:ship.id,vesselName:ship.name,name:`${ship.name} · repatriation passengers`,kind:'ship',biome:'ship',shipClass:ship.classId,classId:ship.classId,crew:clone(inventory.crew),ownership:'crew',ownerName:'Service transport cooperative',faction:contract.factionId,npcContractId:contract.id,dockedAt:contract.origin.bodyId},'ship');
  recovery(this).status='aboard';recovery(this).passageId=contract.id;
  emit(this,`Military clearance accepted. Your berth to ${contract.destination.name} is paid by your service. Captain Vale has the helm.`);
  return ok({vesselId:ship.id,body:this.currentBody,fare:0,text:'Aboard the repatriation shuttle as a passenger. The NPC captain will bring you home; use the airlock when docked.'});
 }
};

/** Only the server/solo game derives this route and authorizes its personal clearance. */
export function createMilitaryPassage(game,{employeeId=game.playerId||'local',shared=false}={}){
 const status=game.militaryRecoveryStatus();if(!status?.canBook)return fail(status?.reason||'A military casualty report must issue repatriation orders first.');
 const originBody=location(game),destination=portDescriptor(game,status.home.systemId,status.home.bodyId);if(!destination||!inhabited(destination))return fail('The service transport cannot find your home posting.');
 const serial=Math.max(0,Math.floor(finite(game.state.npcContractSerial)))+1,id=`repatriation:${employeeId}:${game.state.seed}:${serial}`,vesselId=`vessel:${id}`,hull=getShipClass('tern');
 const remote=game.state.systemId!==destination.systemId,heading=remote?Math.atan2(-originBody.y,-originBody.x):Math.atan2(destination.y-originBody.y,destination.x-originBody.x),dockPoint={x:originBody.x+Math.cos(heading)*(originBody.radius+75),y:originBody.y+Math.sin(heading)*(originBody.radius+75)},departure={x:dockPoint.x+Math.cos(heading)*850,y:dockPoint.y+Math.sin(heading)*850};
 const arrivalAngle=remote?Math.atan2(-destination.y,-destination.x):heading,arrival={x:destination.x-Math.cos(arrivalAngle)*(destination.radius+1100),y:destination.y-Math.sin(arrivalAngle)*(destination.radius+1100),angle:arrivalAngle},arrivalDock={x:destination.x-Math.cos(arrivalAngle)*(destination.radius+75),y:destination.y-Math.sin(arrivalAngle)*(destination.radius+75)};
 const ship={...hull.stats,id:vesselId,name:'Homeward Passage',classId:hull.id,berths:hull.berths,humanOccupants:1,...dockPoint,vx:0,vy:0,angle:heading,angularVelocity:0,hull:hull.stats.maxHull,shield:hull.stats.maxShield,energy:hull.stats.maxEnergy,fuel:hull.stats.maxFuel,npcEmployer:true,dockedAt:originBody.id};
 const layout=cabinLayout(hull.id),origin={systemId:game.state.systemId,bodyId:originBody.id,name:originBody.name,x:originBody.x,y:originBody.y,radius:originBody.radius};
 const contract={version:4,repatriation:true,id,serial,employeeId:String(employeeId),shared,active:true,roleId:'passenger',roleName:'Military passenger',vesselId,shipName:ship.name,classId:hull.id,origin,destination:{systemId:destination.systemId,bodyId:destination.id,name:destination.name},dockPoint,workPoint:remote?departure:arrivalDock,route:{remote,jumped:false,departure,arrival,arrivalDock,jumpClock:0},routeName:`${origin.name} → ${destination.name}`,factionId:status.factionId,phase:'boarding',dockedAt:originBody.id,clock:0,phaseClock:0,startedAt:finite(game.state.stats?.time),reward:0,paid:false,aborted:false,work:{done:false,progress:0}};
 const inventory={cargo:{ore:0,crystal:0},upgrades:{},crew:[{id:`${id}:pilot`,name:'Captain Vale',species:'human',role:'pilot',...layout.stations.helm,health:100,maxHealth:100,status:'active',greeting:`Your ${status.factionName} repatriation warrant covers this berth. I have the helm. Step ashore at ${destination.name} when we dock.`}],formerCrew:[],memorial:[],boardingHistory:[],boarding:null};
 game.state.npcContractSerial=serial;return ok({contract,ship,inventory});
}

export function stepMilitaryPassage(game,contract,dt){
 contract.clock+=dt;contract.phaseClock+=dt;const ship=game.state.ship;
 if(ship.destroyed||ship.hull<=0){contract.phase='failed';return;}
 if(contract.phase==='boarding'&&contract.phaseClock>=5){contract.phase='outbound';contract.phaseClock=0;contract.dockedAt=null;emit(game,`Captain Vale: clearance confirmed. Departing for ${contract.destination.name}.`);}
 if(contract.phase!=='outbound')return;
 if(distance(ship,contract.workPoint)>60||Math.hypot(ship.vx,ship.vy)>28){contract.route.jumpClock=0;return;}
 if(contract.route.remote&&!contract.route.jumped){
  contract.route.jumpClock+=dt;if(contract.route.jumpClock<3)return;
  const target=contract.destination.systemId,entry=contract.route.arrival;
  if(game._sharedWorld){const result=game._navyTransfer?.(target,entry);if(!result||result.ok===false)return;}
  else{game._persistRuntime();game.state.systemId=target;game._loadSystem(target);Object.assign(ship,entry,{vx:0,vy:0,angularVelocity:0});game.state.stats.jumps++;if(!game.state.visited.includes(target))game.state.visited.push(target);if(!game.state.discovered.includes(target))game.state.discovered.push(target);game._flag(`visited_${target}`);}
  contract.route.jumped=true;contract.workPoint={...contract.route.arrivalDock};contract.phaseClock=0;emit(game,`Captain Vale: we are in ${game.currentSystem.name}. Approaching ${contract.destination.name}.`);return;
 }
 contract.phase='docked';contract.phaseClock=0;contract.dockedAt=contract.destination.bodyId;contract.work.done=true;contract.work.progress=1;Object.assign(ship,{vx:0,vy:0,angularVelocity:0,dockedAt:contract.dockedAt});
 emit(game,`Captain Vale: moored at ${contract.destination.name}. Your fare was covered by the service. Use the entry airlock to go ashore.`);
}

export function militaryPassageStatus(game,contract){return{id:contract.id,version:4,repatriation:true,roleId:'passenger',roleName:'Military passenger',title:'Your passage home',phase:contract.phase,task:contract.phase==='docked'?`Moored at ${contract.destination.name}. Use the entry airlock to go ashore.`:contract.phase==='boarding'?'Your service has paid the fare. Captain Vale departs shortly.':'Captain Vale has the helm. You are travelling as a passenger; your personal ship ownership does not change.',done:contract.work.done,reward:0,earned:0,progress:contract.work.done?1:contract.route?.jumped ? .7 : .2,shipName:contract.shipName,origin:clone(contract.origin),destination:clone(contract.destination),routeName:contract.routeName,dockedAt:contract.dockedAt,canFinish:contract.phase==='docked',fare:0,target:{type:'exit'},work:clone(contract.work)};}

export function settleMilitaryPassage(game,contract,{interrupted=false,ship=game.state.ship,disembarkingAt=null}={}){
 if(contract.paid||(game.state.npcContractHistory||[]).some(entry=>entry.id===contract.id))return fail('This passenger journey is already recorded.','paid');
 const body=game.system.bodies.find(body=>body.id===(disembarkingAt?.id||contract.dockedAt));
 if(!interrupted&&(!body||contract.dockedAt!==body.id||ship.id!==contract.vesselId||ship.destroyed||ship.hull<=0||distance(ship,body)>body.radius+160))return fail('Wait for the transport to dock, then use its entry airlock.','docking');
 const completed=!interrupted&&body?.id===contract.destination.bodyId&&game.state.systemId===contract.destination.systemId,worker=passenger(game),orders=recovery(worker);
 if(orders){orders.status=completed?'returned':'orders';orders.passageId=null;}
 contract.paid=true;contract.active=false;contract.paidAmount=0;contract.completedAt=finite(worker.state.stats?.time);contract.outcome=interrupted?'interrupted':completed?'completed':'partial';
 const destination={systemId:game.state.systemId,bodyId:body?.id||contract.origin.bodyId,name:body?.name||contract.origin.name},text=completed?`Welcome home to ${destination.name}. The service covered your passage. Your rank and clearance are unchanged.`:interrupted?'The repatriation transport was interrupted. Your personal travel orders remain valid.':'You left the transport before reaching home. Your repatriation orders remain valid.';
 game.state.npcContractHistory=[...(game.state.npcContractHistory||[]),{id:contract.id,roleId:'passenger',repatriation:true,origin:clone(contract.origin),destination,wages:0,fare:0,outcome:contract.outcome,at:contract.completedAt}].slice(-32);
 game._log?.('Military repatriation',text,'military');emit(game,text);return ok({contract,origin:clone(contract.origin),destination,wages:0,fare:0,completed,returned:completed,outcome:contract.outcome,text});
}
