/** One-time repair of saved flight berths after place sizes become physical.
 * Call after migrateRealmSpace: these positions are already in current units.
 */
import { WORLD_TYPES_VERSION, bodyVisualRadius, migrateExpandedBodyPose } from '../dist/world-types.mjs';
import { systemBodyPosition } from '../dist/system-space.mjs';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const values=value=>object(value)?Object.values(value):[];

/** Legacy input is cloned. A current document is returned unchanged by reference. */
export function migrateRealmPlaceSizes(snapshot,{systems=[]}={}){
 if(!object(snapshot)||Number(snapshot.worldTypesVersion)>=WORLD_TYPES_VERSION)return snapshot;
 const next=structuredClone(snapshot),systemMap=new Map(systems.map(system=>[system.id,system])),bodyCache=new Map();
 const bodies=systemId=>{
  if(!bodyCache.has(systemId))bodyCache.set(systemId,(systemMap.get(systemId)?.bodies||[]).map((body,index)=>({...body,...systemBodyPosition(body,index,systemId)})));
  return bodyCache.get(systemId);
 };
 const repair=(pose,systemId)=>migrateExpandedBodyPose(pose,bodies(systemId));
 const vessels=object(next.vessels)?next.vessels:{},vesselById=new Map();
 for(const vessel of values(vessels)){
  for(const id of [vessel.id,vessel.ship?.id,vessel.npcEnemyId])if(id)vesselById.set(id,vessel);
 }
 function repairRecord(record,systemId){
  if(!object(record))return;
  for(const key of ['parkedShips','spawned'])if(Array.isArray(record[key]))record[key]=record[key].map(ship=>repair(ship,systemId));
  for(const key of ['enemyStates','encounterContacts'])for(const[id,ship]of Object.entries(object(record[key])?record[key]:{}))record[key][id]=repair(ship,systemId);
 }
 function repairEndpoint(endpoint,fallbackSystemId){
  if(!object(endpoint))return;
  const body=systemMap.get(endpoint.systemId||fallbackSystemId)?.bodies?.find(body=>body.id===endpoint.bodyId);
  // An endpoint names the center of a body, not a ship standing inside it.
  // Its coordinates stay fixed while the pilot learns the new berth radius.
  if(body)endpoint.radius=bodyVisualRadius(body);
 }
 const repairedContracts=new WeakSet();
 function repairContract(contract,currentSystemId,parkedSystemId=null){
  if(!object(contract)||repairedContracts.has(contract))return;
  repairedContracts.add(contract);
  const originSystem=contract.origin?.systemId||currentSystemId,route=contract.navy?.route;
  const destinationSystem=contract.destination?.systemId||route?.destinationSystemId||currentSystemId||originSystem;
  const workSystem=route?.remote&&!route.reached?originSystem:destinationSystem;
  if(contract.dockPoint)contract.dockPoint=repair(contract.dockPoint,originSystem);
  if(contract.workPoint)contract.workPoint=repair(contract.workPoint,workSystem);
  repairEndpoint(contract.origin,originSystem);repairEndpoint(contract.destination,destinationSystem);
  if(contract.personal?.ship){
   const personal=contract.personal.ship,systemId=vesselById.get(personal.id)?.systemId||parkedSystemId||originSystem;
   contract.personal.ship=repair(personal,systemId);
  }
  if(route){
   if(route.homeGate)route.homeGate=repair(route.homeGate,originSystem);
   if(route.remoteGate)route.remoteGate=repair(route.remoteGate,destinationSystem);
  }
  if(contract.navy?.escort)contract.navy.escort=repair(contract.navy.escort,destinationSystem);
  const operation=contract.navy?.operation;
  if(Array.isArray(operation?.contacts))operation.contacts=operation.contacts.map(ship=>repair(ship,destinationSystem));
 }
 // Canonical hulls and unloaded shared records never pass through Game.fromSave.
 for(const vessel of values(vessels)){
  if(vessel.ship)vessel.ship=repair(vessel.ship,vessel.systemId);
  if(vessel.combatInterior?.returnShip)vessel.combatInterior.returnShip=repair(vessel.combatInterior.returnShip,vessel.systemId);
 }
 for(const[systemId,world]of Object.entries(object(next.worlds)?next.worlds:{})){
  if(!object(world))continue;
  repairRecord(world.record,systemId);
  for(const key of ['enemies','parkedShips'])if(Array.isArray(world[key]))world[key]=world[key].map(ship=>repair(ship,systemId));
 }
 for(const captain of values(next.captains)){
  const game=captain.game;if(!object(game))continue;
  const owned=vessels[captain.ownedVesselId],occupied=vessels[captain.aboard],ownedSystem=owned?.systemId||game.systemId,activeSystem=occupied?.systemId||game.systemId;
  if(game.ship)game.ship=repair(game.ship,ownedSystem);
  if(game.interior?.returnShip)game.interior.returnShip=repair(game.interior.returnShip,activeSystem);
  const parked=game.livelihoods?.parkedShip,parkedSystem=parked?.systemId||ownedSystem;
  if(parked)game.livelihoods.parkedShip=repair(parked,parkedSystem);
  repairContract(game.npcContract,activeSystem,parkedSystem);
  for(const[systemId,record]of Object.entries(object(game.worlds)?game.worlds:{}))repairRecord(record,systemId);
  // A guest's own ship may be in a different system from their actual body.
  // Mark the completed authority migration before Game restores that passport.
  game.worldTypesVersion=WORLD_TYPES_VERSION;
 }
 for(const operation of values(next.militaryOperations?.operations)){
  const vessel=vessels[operation.vesselId],owner=next.captains?.[operation.ownerId];
  repairContract(operation.contract,vessel?.systemId||owner?.game?.systemId||operation.contract?.origin?.systemId);
 }
 next.worldTypesVersion=WORLD_TYPES_VERSION;
 return next;
}
