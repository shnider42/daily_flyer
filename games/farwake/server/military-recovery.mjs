/** A captain's service warrant books a passenger berth, never an owned hull. */
import { createMilitaryPassage } from '../dist/military-recovery.mjs';
import { clone, fail, ok } from './protocol.mjs';

export const MilitaryRecoveryAuthority={
 _startMilitaryPassage(c){
  if(c.aboard||c.game.state.interior)return fail('Request repatriation from the station or settlement landing, on foot.','location');
  const result=createMilitaryPassage(c.game,{employeeId:c.id,shared:true});if(!result.ok)return result;
  const {contract,ship,inventory}=result,owned=this.vessels.get(c.ownedVesselId);
  if(owned&&!owned.destroyed&&owned.systemId===c.game.state.systemId&&owned.dockedAt===c.game.state.locationId)c.game.state.livelihoods.parkedShip={...clone(owned.ship),systemId:owned.systemId,bodyId:owned.dockedAt,vesselId:owned.id};
  c.game.state.npcContract=contract;c.game.state.militaryRecovery.status='aboard';c.game.state.militaryRecovery.passageId=contract.id;
  const vessel={id:ship.id,ownerId:c.id,name:ship.name,systemId:contract.origin.systemId,dockedAt:contract.dockedAt,ship,inventory,npcContractId:contract.id,allowCrew:false,
   grants:{[c.id]:{allowed:true,roles:[],allowBunk:false}},helmOwner:null,bunks:{},installedBunks:0,actor:null,flightAssist:true,boarding:null,hostileTo:[]};
  this.vessels.set(vessel.id,vessel);this._cabin(c,vessel);c.crewRole='passenger';c.input={};c.appliedInput={};
  c.events.push({type:'military-recovery',text:`Your personal ${c.game.militaryRecoveryStatus().factionName} clearance covers a passenger berth to ${contract.destination.name}. Captain Vale has the helm.`});
  return ok({vesselId:vessel.id,body:this._location(c),fare:0,text:'Aboard Homeward Passage as a passenger. The NPC captain will bring you home; use the airlock when docked.'});
 }
};
