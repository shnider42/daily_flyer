/** The HUD describes the next physical perspective transition; authority performs it. */
import { cabinLayout } from './interior-layouts.mjs';

const distance=(a,b)=>Number.isFinite(a?.x)&&Number.isFinite(a?.y)&&Number.isFinite(b?.x)&&Number.isFinite(b?.y)?Math.hypot(a.x-b.x,a.y-b.y):Infinity;
const dead=hull=>!!hull&&(hull.destroyed===true||hull.hull<=0||hull.hp<=0);
const action=(label,command,detail,targetId=null)=>({label,command,args:{},enabled:true,reason:'',detail,...(targetId?{targetId}:{})});
const blocked=(value,reason)=>({...value,enabled:false,reason});
const canPilot=(vessel,captainId)=>!!vessel&&(vessel.ownerId===captainId||vessel.occupation?.controllerId===captainId&&!vessel.occupation?.contested||vessel.canBoard!==false&&vessel.grantedRoles?.includes('helm'));
const stationHeld=(vessel,captainId,releaseExpired=false)=>!!vessel?.helmOwner&&vessel.helmOwner!==captainId&&(!releaseExpired||vessel.helmOccupied!==false);

function helmAction(game,{shared,fleet}){
 const state=game.state,mp=state.multiplayer||{},interior=state.interior,boarding=state.boarding;
 const vessel=shared?fleet.find(ship=>ship.id===mp.aboardVesselId):null;
 const target=interior?.kind==='enemy'&&!shared?game.system?.enemies?.find(ship=>ship.id===(boarding?.targetId||interior.signalId)):null;
 const captured=interior?.kind==='enemy'||!shared&&boarding?.kind==='assault'||mp.hostileBoarding===true;
 const result=action(vessel?.dockedAt?'Launch ship':'Take helm','quickHelm',vessel?.dockedAt?'Take this ship’s helm and depart from its current port.':'Take the helm of the ship you are aboard.');
 if(boarding?.phase==='active'||vessel?.occupation?.contested)return blocked(result,'Clear the hostile boarders before taking the helm.');
 if(shared){
  if(!vessel)return blocked(result,'Waiting for the current ship’s status.');
  if(dead(vessel))return blocked(result,'This hull is no longer intact.');
  if(stationHeld(vessel,mp.captainId,!captured))return blocked(result,'Another captain is at the helm. They must step onto the deck first.');
  if(captured){
   if(!(mp.canTakeHelm||vessel.canTakeHelm||boarding?.phase==='won'||vessel.captured&&canPilot(vessel,mp.captainId)))return blocked(result,'Secure this ship’s deck before taking its helm.');
  }else if(vessel.npcHostile&&!vessel.captured)return blocked(result,'Clear the hostile occupation before taking this ship’s helm.');
  else if(!canPilot(vessel,mp.captainId))return blocked(result,'The owner has not granted you helm access. Ask them through Menu → Crew.');
 }else if(captured){
  if(!target||dead(target))return blocked(result,'The target hull is no longer intact.');
  if(boarding?.phase!=='won'||!target.deck?.cleared)return blocked(result,'Secure this ship’s deck before taking its helm.');
 }else if(dead(state.ship))return blocked(result,'This hull is no longer intact.');
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
 let carrier=state.ship;
 if(shared){
  const vessel=fleet.find(ship=>ship.id===(mp.portVesselId||mp.ownedVesselId));
  if(!vessel)return blocked(result,'Waiting for your parked ship’s status.');
  if(dead(vessel))return blocked(result,'Your parked ship is no longer intact.');
  if(vessel.systemId!==state.systemId||vessel.dockedAt!==state.locationId)return blocked(result,'Your ship is not parked at this landing area. Return to its actual port first.');
  if(!canPilot(vessel,mp.captainId))return blocked(result,'The owner has not granted you helm access. Ask them through Menu → Crew.');
  if(stationHeld(vessel,mp.captainId))return blocked(result,'Another captain is at the helm. They must step onto the deck first.');
  if(vessel.occupation?.contested||vessel.npcHostile&&!vessel.captured)return blocked(result,'Clear the hostile occupation before returning to this ship.');
  carrier=vessel;
 }else if(dead(state.ship))return blocked(result,'Your parked ship is no longer intact.');
 if(distance(carrier,body)>(body.radius||0)+155)return blocked(result,'Your ship is no longer at this landing area. Return to its actual port first.');
 if(game._hitTimer>0||game.system?.enemies?.some(enemy=>enemy.hp>0&&enemy.active&&distance(enemy,carrier)<700))return blocked(result,'Clear the immediate attack before returning to your parked ship.');
 return result;
}

/** A read-only description suitable for every frame, including compact shared snapshots. */
export function getPerspectiveAction(game,{shared=false,connected=true,fleet=[],surface=null}={}){
 const state=game?.state||{},interior=state.interior,boarding=state.boarding,mp=state.multiplayer||{};
 const localBorrowed=shared&&fleet.find(vessel=>vessel.id===mp.portVesselId&&vessel.systemId===state.systemId&&vessel.dockedAt===state.locationId&&canPilot(vessel,mp.captainId));
 let result;
 if(state.npcContract?.active){
  result=action('Crew duty','openCrewDuty','View your assigned work aboard this NPC-piloted ship, or collect wages after docking.');
 }else if(state.mode==='person'&&!interior&&!state.exploration&&game.atInhabitedPort&&!localBorrowed&&(game.ownsShip===false||game.canUseOwnShipHere?.()===false)){
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
