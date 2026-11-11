/** Shared authority for civilian passage and NPC employment. */
import { createNpcContract, performNpcContractWork, requestNpcContractReturn, settleNpcContract, NPC_CREW_ROLES } from '../dist/npc-contracts.mjs';
import { clone, fail, ok } from './protocol.mjs';

export const LivelihoodAuthority={
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
  c.events.push({type:'crew-duty',text:`Signed on as ${roleName.toLowerCase()}. Captain Vale has the helm. Follow your assigned duty; pay is collected after the ship returns.`});
  return ok({vesselId:vessel.id,text:`You board the local service ship as ${roleName.toLowerCase()}.`,body:this._location(c)});
 },
 _npcContractCommand(c,name,args={}){
  const contract=c.game.state.npcContract,vessel=this.vessels.get(contract?.vesselId);
  if(!contract?.active||!vessel||vessel.npcContractId!==contract.id||contract.employeeId!==c.id||c.aboard!==vessel.id)return fail('You must be aboard the vessel for your own active crew watch.','contract');
  const actor=this._actor(vessel);
  let result;
  if(name==='npcContractAction')result=performNpcContractWork(actor,args.action,{worker:c.game,playerId:c.id,sectionId:args.sectionId,taskId:args.taskId,solution:args.solution});
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
 }
};
