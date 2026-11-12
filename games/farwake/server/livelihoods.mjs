/** Shared authority for civilian passage and NPC employment. */
import { createNpcContract, createNavySortie, performNpcContractWork, requestNpcContractReturn, settleNpcContract, NPC_CREW_ROLES } from '../dist/npc-contracts.mjs';
import { clone, fail, ok } from './protocol.mjs';
import { militaryPermission } from '../dist/military-ranks.mjs';
import { navyDutyRoles } from '../dist/navy-duty.mjs';

export const LivelihoodAuthority={
 _startNavySortie(c,mission,operation){
  if(c.aboard||c.game.state.interior)return fail('Report to the Morrow recruiter on foot before embarkation.','location');
  const result=createNavySortie(c.game,mission,{id:operation.operationId,employeeId:c.id,shared:true,sharedOperation:operation.sharedOperation===true,participants:operation.participants,leaderId:operation.leaderId});if(!result.ok)return result;
  const {contract,ship,inventory}=result,owned=this.vessels.get(c.ownedVesselId);
  if(owned&&owned.systemId===c.game.state.systemId&&owned.dockedAt===c.game.state.locationId)c.game.state.livelihoods.parkedShip={...clone(owned.ship),systemId:owned.systemId,bodyId:owned.dockedAt,vesselId:owned.id};
  c.game.state.npcContract=contract;
  const vessel={id:ship.id,ownerId:c.id,name:ship.name,systemId:contract.origin.systemId,dockedAt:contract.dockedAt,ship,inventory,npcContractId:contract.id,allowCrew:false,
   grants:{[c.id]:{allowed:true,roles:navyDutyRoles(c.game,contract),allowBunk:false}},helmOwner:null,bunks:{},installedBunks:0,actor:null,flightAssist:true,boarding:null,hostileTo:[]};
  this.vessels.set(vessel.id,vessel);this._cabin(c,vessel);c.crewRole='weapons';
  c.events.push({type:'crew-duty',text:'You board FWS Steadfast as the assigned gunner. The commander has the helm; your personal ship remains at its berth.'});
  return ok({vesselId:vessel.id,body:this._location(c),text:'Aboard FWS Steadfast. Walk to the marked gunnery console; the commander will fly the sortie.'});
 },
 _passengerTransit(c,args){
  if(c.aboard||c.game.state.interior)return fail('Disembark at an inhabited port before booking passenger passage.','location');
  const result=c.game.takePassengerTransit(args.bodyId||args.id);
  if(result.ok){this._landCharacter(c,c.game.state.systemId,result.body.id);c.surfaceCache=null;}
  return result;
 },
 _startNpcContract(c,args){
  if(c.aboard||c.game.state.interior)return fail('Sign on from the hiring port, on foot.','location');
  const result=createNpcContract(c.game,args.roleId||args.id,{employeeId:c.id,shared:true,offerId:args.offerId});
  if(!result.ok)return result;
  const {contract,ship,inventory}=result,role=NPC_CREW_ROLES.find(role=>role.id===contract.roleId),roleName=contract.roleName||role.name;
  const owned=this.vessels.get(c.ownedVesselId);
  if(owned&&owned.systemId===c.game.state.systemId&&owned.dockedAt===c.game.state.locationId){
   c.game.state.livelihoods.parkedShip={...clone(owned.ship),systemId:owned.systemId,bodyId:owned.dockedAt,vesselId:owned.id};
  }
  c.game.state.npcContract=contract;
  const vessel={id:ship.id,ownerId:c.id,name:ship.name,systemId:contract.origin.systemId,dockedAt:contract.dockedAt,ship,inventory,npcContractId:contract.id,allowCrew:false,
   grants:{[c.id]:{allowed:true,roles:[role.stationRole],allowBunk:false}},helmOwner:null,bunks:{},installedBunks:0,actor:null,flightAssist:true,boarding:null,hostileTo:[]};
  this.vessels.set(vessel.id,vessel);this._cabin(c,vessel);c.crewRole=role.stationRole;
  const pilot=inventory.crew.find(member=>member.role==='pilot');
  c.events.push({type:'crew-duty',text:`Signed on as ${roleName.toLowerCase()}. ${pilot?.name||'The service captain'} has the helm. Follow your assigned duty; pay is collected after the ship returns.`});
  return ok({vesselId:vessel.id,text:`You board the local service ship as ${roleName.toLowerCase()}.`,body:this._location(c)});
 },
 _npcContractCommand(c,name,args={}){
  const contract=c.game.state.npcContract,vessel=this.vessels.get(contract?.vesselId);
  if(vessel?.militaryOperationId){
   const operation=this._militaryOperation(c),member=contract?.military?.participants?.[c.id];
   if(!contract?.active||!operation||operation.vesselId!==vessel.id||c.aboard!==vessel.id||!member||member.settled||member.withdrawn)return fail('You must be aboard the carrier assigned to your own operation.','contract');
   const actor=this._actor(vessel);
   if(name==='completeNpcContract'){
    const result=this._settleMilitaryParticipant(c,vessel);if(!result.ok)return result;
    this._landCharacter(c,vessel.systemId,vessel.dockedAt);c.surfaceCache=null;
    if(!contract.active&&![...this.captains.values()].some(member=>member.aboard===vessel.id)&&!vessel.destroyed)this.vessels.delete(vessel.id);
    return result;
   }
   let result;
   if(name==='cancelNpcContract'){
    if(operation.leaderId!==c.id)return fail('Only the operation leader can request the carrier’s return. Your personal rank does not change.','military-command');
    const clearance=militaryPermission(c.game,'join',{factionId:operation.factionId,branchId:'navy'});if(!clearance.ok)return clearance;
    result=requestNpcContractReturn(actor);
   }else if(name==='npcContractAction')result=performNpcContractWork(actor,args.action,{worker:c.game,playerId:c.id,sectionId:args.sectionId,taskId:args.taskId,solution:args.solution,input:c.appliedInput||c.input||{}});
   else return fail('Unknown crew-contract action.','command');
   this._syncActor(vessel);return result;
  }
  if(!contract?.active||!vessel||vessel.npcContractId!==contract.id||contract.employeeId!==c.id||c.aboard!==vessel.id)return fail('You must be aboard the vessel for your own active crew watch.','contract');
  const actor=this._actor(vessel);
  let result;
  if(name==='npcContractAction')result=performNpcContractWork(actor,args.action,{worker:c.game,playerId:c.id,sectionId:args.sectionId,taskId:args.taskId,solution:args.solution,input:c.appliedInput||c.input||{}});
  else if(name==='cancelNpcContract')result=requestNpcContractReturn(actor);
  else if(name==='completeNpcContract')result=settleNpcContract(actor);
  else return fail('Unknown crew-contract action.','command');
  this._syncActor(vessel);
  if(result.ok&&name==='npcContractAction'&&['enterEva','exitEva'].includes(args.action)){
   c.surfaceCache=null;this._ensurePersonPosition(c);
   c.input={};c.appliedInput={};c.game.state.person.moving=false;
   c.game.state.person.vx=0;c.game.state.person.vy=0;
  }
  if(result.ok&&name==='completeNpcContract'){
   c.game.state.npcContractHistory=clone(actor.state.npcContractHistory);c.game.state.npcContract=null;
   this._landCharacter(c,contract.origin.systemId,contract.origin.bodyId);c.surfaceCache=null;
   // Completed employers leave the port after their employee disembarks. A
   // destroyed or occupied hull stays in the realm under the ordinary rules.
   if(vessel.dockedAt&&!vessel.destroyed&&!this._hostileOccupied(vessel))this.vessels.delete(vessel.id);
  }
  return result;
 },
 _interruptNpcContract(c){
  const contract=c.game.state.npcContract;if(!contract?.active)return;
  const vessel=this.vessels.get(contract.vesselId);
  if(vessel?.militaryOperationId){this._settleMilitaryParticipant(c,vessel,{interrupted:true});c.game.state.npcContract=null;return;}
  if(vessel){
   const actor=this._actor(vessel);settleNpcContract(actor,{interrupted:true});this._syncActor(vessel);
   c.game.state.npcContractHistory=clone(actor.state.npcContractHistory);
   // Recovery moves the person. The damaged employer hull remains exactly
   // where the interruption happened and is still a physical world object.
   vessel.helmOwner=null;
  }
  c.game.state.npcContract=null;
 },
 _buyFirstShip(c,id){
  if(c.game.ownsShip||c.ownedVesselId)return fail('This captain already has an owned vessel.','owned');
  if(!this._nearTypes(c,['mechanic'])||!c.game.atInhabitedPort||c.aboard)return fail('Visit the port shipwright to purchase your first vessel.','distance');
  const result=c.game.buyShip(id);if(!result.ok)return result;
  const vessel=this._createVessel(c);c.portVesselId=vessel.id;
  if(c.game.state.livelihoods.parkedShip)c.game.state.livelihoods.parkedShip.vesselId=vessel.id;
  c.surfaceCache=null;
  return {...result,text:`Your first ship is paid for and waiting at this landing.`};
 },
 _claimMilitaryShip(c,args){
  if(c.aboard||c.game.state.interior||c.game.state.npcContract?.active)return fail('Collect your service hull on foot at your faction’s public-services desk.','location');
  const owned=this.vessels.get(c.ownedVesselId);
  if(c.ownedVesselId&&!owned)return fail('Your registered vessel is unavailable.','vessel');
  if(owned&&(owned.ownerId!==c.id||owned.npcContractId||owned.destroyed||this._hostileOccupied(owned)||owned.systemId!==c.game.state.systemId||owned.dockedAt!==c.game.state.locationId))return fail('Bring your own intact vessel to this port before collecting a service commission.','vessel');
  const issue=()=>{
   // The recruit is at the desk; reserve their return berth alongside any
   // friends who stayed aboard before considering a smaller service hull.
   if(owned)owned.ship.humanOccupants=1+[...this.captains.values()].filter(other=>other.id!==c.id&&other.aboard===owned.id).length;
   return c.game.professionAction({...args,action:'claimServiceShip'});
  };
  const result=owned?this._withShip(c,owned,issue):issue();
  if(!result.ok)return result;
  if(owned){owned.actor=null;this._linkNpcVessel(owned);}
  else{
   const vessel=this._createVessel(c);c.portVesselId=vessel.id;
   if(c.game.state.livelihoods.parkedShip)c.game.state.livelihoods.parkedShip.vesselId=vessel.id;
  }
  c.surfaceCache=null;return result;
 }
};
