/** The HUD describes the next physical perspective transition; authority performs it. */
import { cabinLayout } from './interior-layouts.mjs';

const distance=(a,b)=>Number.isFinite(a?.x)&&Number.isFinite(a?.y)&&Number.isFinite(b?.x)&&Number.isFinite(b?.y)?Math.hypot(a.x-b.x,a.y-b.y):Infinity;
const dead=hull=>!!hull&&(hull.destroyed===true||hull.hull<=0||hull.hp<=0);
const action=(label,command,detail,targetId=null)=>({label,command,args:{},enabled:true,reason:'',detail,...(targetId?{targetId}:{})});
const blocked=(value,reason)=>({...value,enabled:false,reason});
const canPilot=(vessel,captainId)=>!!vessel&&(vessel.ownerId===captainId||vessel.occupation?.controllerId===captainId&&!vessel.occupation?.contested||vessel.canBoard!==false&&vessel.grantedRoles?.includes('helm'));
const stationHeld=(vessel,captainId,releaseExpired=false)=>!!vessel?.helmOwner&&vessel.helmOwner!==captainId&&(!releaseExpired||vessel.helmOccupied!==false);
const boardAccess=(vessel,captainId)=>!!vessel&&vessel.canBoard!==false&&(vessel.canBoard===true||vessel.ownerId===captainId||vessel.occupation?.controllerId===captainId&&!vessel.occupation?.contested||vessel.allowCrew||vessel.grantedRoles?.length>0);

/** Dock metadata belongs to the occupied hull, never the captain's parked ship. */
function occupiedDock(game,{shared,fleet}){
 const state=game?.state||{},interior=state.interior,mp=state.multiplayer||{},location=interior?.location||{};
 if(state.mode!=='person'||state.exploration||!['ship','enemy'].includes(interior?.kind))return null;
 let source,systemId=state.systemId;
 if(shared){
  const vessel=fleet.find(ship=>ship.id===mp.aboardVesselId);
  // Compact packets refresh the occupied hull here while retaining an older fleet.
  // An explicit null clears a previous berth as soon as the pilot departs.
  if(mp.aboardVesselId&&Object.hasOwn(mp,'dockedAt'))source=mp;
  else if(vessel){source=vessel;systemId=vessel.systemId||systemId;}
  else if(mp.aboardVesselId&&location.vesselId===mp.aboardVesselId)source=location;
  else return null;
 }else{
  if(typeof game.dockedPortInfo==='function'){
   const port=game.dockedPortInfo();return port?{bodyId:port.id,name:port.name,kind:port.kind,systemId:port.systemId}:null;
  }
  const job=state.npcContract,ship=interior.kind==='enemy'?game.system?.enemies?.find(vessel=>vessel.id===(state.boarding?.targetId||interior.signalId)):state.ship;
  if(job?.active&&job.vesselId===(location.vesselId||ship?.id))source=job;
  else if(ship&&Object.hasOwn(ship,'dockedAt'))source=ship;
  else source=location;
 }
 const bodyId=source?.dockedAt;if(typeof bodyId!=='string'||!bodyId)return null;
 const body=game.system?.bodies?.find(body=>body.id===bodyId)||game.galaxy?.find(system=>system.id===systemId)?.bodies?.find(body=>body.id===bodyId);
 return{bodyId,name:body?.name||source.dockedName||bodyId,kind:body?.kind||source.dockedKind||'port',systemId};
}

/** Leaving a docked deck needs an airlock, not boarding or piloting permission. */
export function getDisembarkAction(game,{shared=false,connected=true,fleet=[],surface=null}={}){
 const port=occupiedDock(game,{shared,fleet});if(!port)return null;
 const state=game.state,interior=state.interior,airlock=surface?.entities?.find(entity=>entity.data?.airlock&&!entity.hidden)||
  {...cabinLayout(interior.location?.shipClass||state.boarding?.shipClass||state.ship?.classId).spawn,id:`${state.locationId}:entry-airlock`};
 let result={...action(`Disembark at ${port.name}`,'disembark',`Use this ship’s entry airlock to step onto ${port.name}.`,airlock.id),port};
 if(state.person?.health<=0||state.person?.down)return blocked(result,'You are incapacitated. Wait for recovery before using the airlock.');
 if(shared&&!connected)return blocked(result,'Reconnecting to the galaxy. The airlock will be ready when your captain is connected.');
 if(distance(state.person,airlock)>70)result=blocked(result,`Walk to the marked entry airlock to disembark at ${port.name}.`);
 return result;
}

/** Boarding permission and a free berth are independent of who operates the helm. */
export function getBoardingAction(game,vessel,{fleet=[],connected=true}={}){
 const state=game?.state||{},mp=state.multiplayer||{};
 let result={...action(vessel?.name?`Board ${vessel.name}`:'Board ship','boardShip','Walk aboard the docked ship. Boarding does not launch it.'),args:{vesselId:vessel?.id}};
 if(!connected)return blocked(result,'Reconnecting to the galaxy. Boarding will be ready when your captain is connected.');
 if(state.person?.health<=0||state.person?.down)return blocked(result,'You are incapacitated. Wait for recovery before boarding.');
 if(!vessel)return blocked(result,'Waiting for this ship’s status.');
 if(mp.aboardVesselId===vessel.id)return blocked(result,'You are already aboard this ship.');
 if(dead(vessel))return blocked(result,'This hull is no longer intact.');
 if(vessel.occupation?.contested||vessel.npcHostile&&!vessel.captured||vessel.hostile)return blocked(result,'This ship is hostile or occupied. Use its boarding contact to resolve the encounter.');
 if(!boardAccess(vessel,mp.captainId))return blocked(result,'The owner must allow you aboard. Open CREW to review ship access.');
 if(vessel.systemId!==state.systemId)return blocked(result,'Travel to the same star system before boarding.');
 if(state.interior||state.exploration)return blocked(result,'Leave this interior and reach the ship’s port or approach in your own ship.');
 if(state.mode==='person'){
  if(!vessel.dockedAt||vessel.dockedAt!==state.locationId)return blocked(result,'This ship is not parked at your port. Meet it at its actual landing area.');
 }else{
  const source=fleet.find(ship=>ship.id===mp.aboardVesselId)||state.ship;
  if(vessel.dockedAt)return blocked(result,'Dock at this ship’s port before boarding it.');
  if(distance(source,vessel)>=220||Math.hypot(vessel.vx||0,vessel.vy||0)>=90)return blocked(result,'Approach within 220 metres while the other ship is moving slowly.');
  result={...result,detail:'Cross to this ship’s crew deck. Your current hull stays where you leave it.'};
 }
 const available=Number.isFinite(vessel.availableBerths)?vessel.availableBerths:Number.isFinite(vessel.berths)&&Number.isFinite(vessel.occupants)?vessel.berths-vessel.occupants:Infinity;
 if(available<1)return blocked(result,'No free berth. Captains, hired crew, and passengers share this ship’s capacity.');
 return result;
}

export function getLocalPortVessels(game,fleet=[]){
 const state=game?.state||{},mp=state.multiplayer||{};
 if(state.mode!=='person'||state.interior||state.exploration)return [];
 return fleet.filter(vessel=>vessel.systemId===state.systemId&&vessel.dockedAt===state.locationId&&!dead(vessel)&&!vessel.hostile&&!vessel.occupation?.contested&&boardAccess(vessel,mp.captainId));
}

function helmAction(game,{shared,fleet}){
 const state=game.state,mp=state.multiplayer||{},interior=state.interior,boarding=state.boarding;
 const vessel=shared?fleet.find(ship=>ship.id===mp.aboardVesselId):null;
 const target=interior?.kind==='enemy'&&!shared?game.system?.enemies?.find(ship=>ship.id===(boarding?.targetId||interior.signalId)):null;
 const captured=interior?.kind==='enemy'||!shared&&boarding?.kind==='assault'||mp.hostileBoarding===true;
 const docked=!!occupiedDock(game,{shared,fleet});
 const result=action(docked?'Launch ship':'Take helm','quickHelm',docked?'Take this ship’s helm and depart from its current port.':'Take the helm of the ship you are aboard.');
 if(boarding?.phase==='active'||vessel?.occupation?.contested)return blocked(result,'Clear the hostile boarders before taking the helm.');
 if(shared){
  if(!vessel)return blocked(result,'Waiting for the current ship’s status.');
  if(dead(vessel))return blocked(result,'This hull is no longer intact.');
  if(stationHeld(vessel,mp.captainId,!captured))return blocked({...result,label:vessel.helmName?`${vessel.helmName} at helm`:'Helm occupied'},`${vessel.helmName||'Another captain'} is at the helm. They must step onto the deck before you can pilot.`);
  if(captured){
   if(!(mp.canTakeHelm||vessel.canTakeHelm||boarding?.phase==='won'||vessel.captured&&canPilot(vessel,mp.captainId)))return blocked(result,'Secure this ship’s deck before taking its helm.');
  }else if(vessel.npcHostile&&!vessel.captured)return blocked(result,'Clear the hostile occupation before taking this ship’s helm.');
  else if(!canPilot(vessel,mp.captainId))return blocked(result,'The owner has not granted you helm access. They can turn on Allow piloting in CREW.');
 }else if(captured){
  if(!target||dead(target))return blocked(result,'The target hull is no longer intact.');
  if(boarding?.phase!=='won'||!target.deck?.cleared)return blocked(result,'Secure this ship’s deck before taking its helm.');
 }else if(dead(state.ship))return blocked(result,'This hull is no longer intact.');
 return result;
}

/** The physical helm keeps its own permission/launch action when the top button points ashore. */
export function getHelmAction(game,{shared=false,connected=true,fleet=[]}={}){
 const state=game?.state||{};
 let result=helmAction(game,{shared,fleet});
 if(state.npcContract?.active)return blocked(result,'The NPC captain operates this helm. Use Crew duty for your assigned work.');
 if(state.person?.health<=0||state.person?.down)return blocked(result,'You are incapacitated. Wait for recovery before taking the helm.');
 if(shared&&!connected)return blocked(result,'Reconnecting to the galaxy. The helm will be ready when your captain is connected.');
 if(state.pendingEncounter)return blocked(result,'Finish or close the current conversation before taking the helm.');
 return result;
}

function returnAction(game,{shared,fleet,surface}){
 const state=game.state,mp=state.multiplayer||{},boarding=state.boarding,interior=state.interior;
 const airlock=surface?.entities?.find(entity=>entity.data?.airlock)||{...cabinLayout(boarding?.shipClass||interior?.location?.shipClass||state.ship?.classId).spawn,id:`${state.locationId}:entry-airlock`};
 const result=action('Return to ship','returnToOwnShip','Cross the tether back to the ship you arrived in.',airlock.id);
 if(shared){
  const origin=fleet.find(ship=>ship.id===mp.returnVesselId);
  if(!origin||dead(origin))return blocked(result,'Your return ship is unavailable. Secure this ship’s bridge to take its helm.');
  if(mp.canReturn===false)return blocked(result,'Your return ship must be intact, free of boarders, and within tether range.');
 }else{
  if(interior?.originDestroyed||dead(state.ship))return blocked(result,'Your original ship was destroyed. Secure this ship’s bridge to take its helm.');
  const target=game.system?.enemies?.find(ship=>ship.id===(boarding?.targetId||interior?.signalId)&&ship.hp>0);
  if(!target)return blocked(result,'The target hull is no longer intact.');
  if(boarding?.systemId&&boarding.systemId!==state.systemId||boarding?.originVesselId&&boarding.originVesselId!==state.ship.id||distance(target,state.ship)>270+Math.max(state.ship.radius||0,target.radius||0))return blocked(result,'Your original ship must remain nearby and within tether range.');
 }
 if(distance(state.person,airlock)>70)return blocked(result,'Walk to the marked entry airlock to cross back to your ship.');
 return result;
}

function launchAction(game,{shared,fleet}){
 const state=game.state,mp=state.multiplayer||{},result=action('Return to ship','quickLaunch','Return to your locally parked ship and launch.');
 if(state.interior||state.exploration)return blocked(result,'Leave this interior before returning to your ship.');
 const body=game.system?.bodies?.find(body=>body.id===state.locationId);
 if(!body)return blocked(result,'Reach your ship’s landing area before launching.');
 if(shared){
  const local=getLocalPortVessels(game,fleet),remembered=fleet.find(ship=>ship.id===mp.portVesselId&&ship.systemId===state.systemId&&ship.dockedAt===state.locationId),owned=local.find(ship=>ship.id===mp.ownedVesselId);
  if(!remembered&&!owned&&local.length>1)return action('Board a ship','openPortShips','Choose which docked ship to board. Each ship stays at the port until a pilot launches it.');
  const vessel=remembered||owned||local[0]||fleet.find(ship=>ship.id===(mp.portVesselId||mp.ownedVesselId));
  return getBoardingAction(game,vessel,{fleet});
 }
 const carrier=state.ship;
 if(dead(carrier))return blocked(result,'Your parked ship is no longer intact.');
 if(distance(carrier,body)>(body.radius||0)+155)return blocked(result,'Your ship is no longer at this landing area. Return to its actual port first.');
 if(game._hitTimer>0||game.system?.enemies?.some(enemy=>enemy.hp>0&&enemy.active&&distance(enemy,carrier)<700))return blocked(result,'Clear the immediate attack before returning to your parked ship.');
 return result;
}

/** A read-only description suitable for every frame, including compact shared snapshots. */
export function getPerspectiveAction(game,{shared=false,connected=true,fleet=[],surface=null}={}){
 const state=game?.state||{},interior=state.interior,boarding=state.boarding,mp=state.multiplayer||{};
 const disembark=getDisembarkAction(game,{shared,connected,fleet,surface});if(disembark)return disembark;
 const localBoarding=shared&&getLocalPortVessels(game,fleet).length>0;
 let result;
 if(interior?.kind==='eva'){
  const airlock=surface?.entities?.find(entity=>entity.type==='evaAirlock'&&!entity.hidden);
  result={...action('Return inside','npcContractAction','Return through this ship’s tethered airlock.',airlock?.id||'eva:airlock'),args:{action:'exitEva'}};
  if(!state.npcContract?.active)result=blocked(result,'Your hull-walk assignment is no longer active. Call for recovery.');
  else if(!airlock||distance(state.person,airlock)>56)result=blocked(result,'Follow the hull markings back to the exterior airlock.');
 }else if(state.npcContract?.active){
  result=action('Crew duty','openCrewDuty','View your assigned work aboard this NPC-piloted ship, or collect wages after docking.');
 }else if(state.mode==='person'&&!interior&&!state.exploration&&game.atInhabitedPort&&!localBoarding&&(game.ownsShip===false||game.canUseOwnShipHere?.()===false)){
  result=action('Port services','openPortServices','Find work, buy passenger passage, or visit the shipwright.');
 }else if(state.mode==='ship'){
  result=action('Walk deck','enterCabin','Leave the helm and walk inside this ship. Its momentum continues.');
  if(dead(state.ship))result=blocked(result,'This hull is no longer intact.');
  else if(!shared&&game.system?.enemies?.some(enemy=>enemy.hp>0&&enemy.active&&distance(enemy,state.ship)<600))result=blocked(result,'Clear the immediate attack before leaving the helm.');
 }else if(interior?.kind==='site'||state.exploration){
  const exit=surface?.entities?.find(entity=>entity.type==='siteExit'&&!entity.hidden);
  result=action('Exit site','exitSite','Return through this place’s entrance to the surface.',exit?.id||`${state.locationId}:exit`);
  if(!exit||distance(state.person,exit)>46)result=blocked(result,'Walk to the marked entrance to leave this place.');
 }else if(interior?.kind==='derelict'){
  result=action('Return to ship','leaveDerelict','Cross the docking tether back to your own ship.');
  if(dead(state.ship))result=blocked(result,'Your original ship is no longer intact.');
 }else if(interior?.kind==='enemy'||boarding?.kind==='assault'||mp.hostileBoarding){
  const cleared=boarding?.phase==='won'||mp.canTakeHelm||fleet.some(ship=>ship.id===mp.aboardVesselId&&ship.canTakeHelm);
  result=cleared?helmAction(game,{shared,fleet}):returnAction(game,{shared,fleet,surface});
 }else if(interior?.kind==='ship')result=helmAction(game,{shared,fleet});
 else result=launchAction(game,{shared,fleet});
 if(state.person?.health<=0||state.person?.down)return blocked(result,'You are incapacitated. Wait for recovery before changing perspective.');
 if(shared&&!connected)return blocked(result,'Reconnecting to the galaxy. The shortcut will be ready when your captain is connected.');
 if(state.pendingEncounter)return blocked(result,'Finish or close the current conversation before changing perspective.');
 return result;
}
