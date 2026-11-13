/** One-time repair of saved flight berths after place sizes become physical.
 * Call after migrateRealmSpace: these positions are already in current units.
 */
import { WORLD_TYPES_VERSION, bodyVisualRadius, migrateExpandedBodyPose } from '../dist/world-types.mjs';
import { systemBodyPosition } from '../dist/system-space.mjs';
import { generateSurface, isWalkable } from '../dist/surface.mjs';
import { isPreflightBody } from '../dist/social-world.mjs';
import { PLANET_LAYOUT_VERSION } from '../dist/planet-layout.mjs';

export const PLANET_LAYOUT_MIGRATION_VERSION = PLANET_LAYOUT_VERSION;

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

/** Keep paid homes usable when a settlement is rebuilt; personal progress stays intact. */
export function migrateRealmPlanetLayouts(snapshot, { systems = [] } = {}) {
 if (!object(snapshot) || Number(snapshot.planetLayoutVersion) >= PLANET_LAYOUT_MIGRATION_VERSION) return snapshot;
 const next = structuredClone(snapshot), changed = new Map(), surfaces = new Map();
 for (const system of systems) for (const body of system.bodies || []) {
  if (['planet', 'moon', 'asteroid'].includes(body.kind) && body.id !== 'morrow' && !isPreflightBody(body)) changed.set(`${system.id}:${body.id}`, body);
 }
 // A conversation pause stores an NPC's old absolute position. Resume that
 // resident's regenerated daily route instead of holding them inside new walls.
 for (const roomId of Object.keys(object(next.npcHolds) ? next.npcHolds : {})) {
  const separator = roomId.lastIndexOf(':surface:');
  if (separator >= 0 && changed.has(roomId.slice(separator + 9))) delete next.npcHolds[roomId];
 }
 function accessible(key) {
  if (surfaces.has(key)) return surfaces.get(key);
  const surface = generateSurface(changed.get(key), next.seed), tile = surface.tileSize || 24;
  const start = Math.floor(surface.spawn.y / tile) * surface.cols + Math.floor(surface.spawn.x / tile);
  const seen = new Set([start]), cells = [start];
  for (let index = 0; index < cells.length; index++) {
   const cell = cells[index], x = cell % surface.cols, y = Math.floor(cell / surface.cols);
   for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
    const id = yy * surface.cols + xx;
    if (xx < 0 || yy < 0 || xx >= surface.cols || yy >= surface.rows || seen.has(id) || !isWalkable(surface, (xx + .5) * tile, (yy + .5) * tile)) continue;
    seen.add(id); cells.push(id);
   }
  }
  const result = { surface, tile, seen, cells }; surfaces.set(key, result); return result;
 }
 function repair(home) {
  if (!object(home) || !['room', 'outpost'].includes(home.kind)) return;
  const key = `${home.systemId}:${home.locationId}`; if (!changed.has(key)) return;
  const { surface, tile, seen, cells } = accessible(key), cell = Math.floor(home.y / tile) * surface.cols + Math.floor(home.x / tile);
  if (Number.isFinite(home.x) && Number.isFinite(home.y) && seen.has(cell) && isWalkable(surface, home.x, home.y)) return;
  let best = surface.spawn, score = Infinity;
  for (const index of cells) {
   const point = { x: (index % surface.cols + .5) * tile, y: (Math.floor(index / surface.cols) + .5) * tile };
   const distance = Number.isFinite(home.x) && Number.isFinite(home.y) ? (point.x - home.x) ** 2 + (point.y - home.y) ** 2 : 0;
   if (distance < score) { score = distance; best = point; }
  }
  home.x = best.x; home.y = best.y;
 }
 for (const lease of values(next.leases)) repair(lease);
 for (const captain of values(next.captains)) repair(captain.home);
 next.planetLayoutVersion = PLANET_LAYOUT_MIGRATION_VERSION;
 return next;
}
