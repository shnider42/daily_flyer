/** Navy duty clearance is personal; the same checks govern solo and shared decks. */
import { cabinLayout } from './interior-layouts.mjs';
import { militaryPermission } from './military-ranks.mjs';
import { isNavyParticipant } from './navy-service.mjs';

const aliases=Object.freeze({weapons:'weapons',security:'weapons',gunner:'weapons',scanner:'scanner',navigation:'scanner',engineering:'engineering'});
export const navyDutyRole=value=>Object.hasOwn(aliases,value)?aliases[value]:null;
const identity=worker=>String(worker?.state?.multiplayer?.captainId||worker?.playerId||'');
const denied=(reason,code='navy-duty')=>({ok:false,reason,message:reason,code});

export function navyDutyRoles(worker,contract=worker?.state?.npcContract){
 if(!contract?.active||contract.military?.branchId!=='navy'||!isNavyParticipant(contract,identity(worker)))return[];
 const access=militaryPermission(worker,'join',{factionId:contract.military.factionId||contract.factionId,branchId:'navy'});
 if(!access.ok)return[];
 return['weapons',...(access.rank.rankIndex>=1?['scanner']:[]),...(access.rank.rankIndex>=2?['engineering']:[])];
}

export function navyDutyAccess(actor,requested,{worker=actor,requireStation=true}={}){
 const role=navyDutyRole(requested),state=worker?.state,contract=actor?.state?.npcContract,ship=actor?.state?.ship,person=state?.person;
 if(!role)return denied('This station is not part of your Navy duty clearance.','navy-station');
 if(!contract?.active||contract.military?.branchId!=='navy'||!isNavyParticipant(contract,identity(worker))||state?.npcContract?.id!==contract.id)return denied('This captain is not enrolled on this service carrier.','navy-member');
 const clearance=militaryPermission(worker,'join',{factionId:contract.military.factionId||contract.factionId,branchId:'navy'});
 if(!clearance.ok)return denied(clearance.reason,clearance.code);
 if(!navyDutyRoles(worker,contract).includes(role))return denied(role==='engineering'?'Petty officer rank is required to operate this carrier’s engineering station.':role==='scanner'?'Able crew rank is required to operate this carrier’s scanner.':'Your current service standing does not permit this duty.','military-rank');
 if(!ship||ship.id!==contract.vesselId||ship.destroyed||ship.hull<=0)return denied('The assigned carrier is unavailable.','navy-vessel');
 if(state.mode!=='person'||state.interior?.kind!=='ship'||state.interior.location?.vesselId!==contract.vesselId||state.systemId!==actor.state.systemId)return denied('Enter your assigned carrier’s crew deck first.','location');
 if(!person||person.health<=0||person.down)return denied('Recover before operating a duty station.','incapacitated');
 if(state.boarding?.phase==='active'||actor.state.boarding?.phase==='active')return denied('Resolve the boarding alarm before operating this station.','boarding');
 const stationName=role==='weapons'?'security':role==='scanner'?'navigation':'engineering',station=cabinLayout(ship.classId).stations[stationName];
 if(requireStation&&(!station||!Number.isFinite(person.x)||!Number.isFinite(person.y)||Math.hypot(person.x-station.x,person.y-station.y)>46))return denied('Walk to the assigned station inside the carrier first.','distance');
 return{ok:true,reason:null,role,vesselId:contract.vesselId,station:station?{...station}:null};
}
