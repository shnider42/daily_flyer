/** Personal duty records on one physical Navy operation. Server membership is authoritative. */
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;

export function navyMember(contract,playerId){
 const members=contract?.military?.participants;
 return members&&typeof members==='object'&&!Array.isArray(members)?members[String(playerId)]||null:null;
}

export function isNavyParticipant(contract,playerId){
 if(!contract?.active||contract.military?.branchId!=='navy')return false;
 const member=navyMember(contract,playerId);
 if(contract.military.sharedOperation)return !!member&&member.active!==false&&!member.withdrawn&&!member.settled;
 return String(contract.employeeId)===String(playerId)&&(!member||member.active!==false&&!member.withdrawn&&!member.settled);
}

export function navyServiceProof(contract,playerId){
 const member=navyMember(contract,playerId),shared=contract?.military?.sharedOperation===true,extended=!!contract?.navy?.kind;
 const targets=(member?.targets||contract?.work?.targets||[]).map(target=>({...target,damage:Math.max(0,finite(target.damage))}));
 const teamTargets=contract?.work?.targets||[];
 const watchSeconds=Math.max(0,finite(member?.watchSeconds));
 const damage=member?Math.max(0,finite(member.damage)):Math.max(0,finite(contract?.work?.damage));
 const requiredWatchSeconds=extended?Math.max(1,finite(contract.navy.watchSeconds,45)):15;
 const duty=extended?watchSeconds+1e-6>=requiredWatchSeconds:watchSeconds+1e-6>=requiredWatchSeconds||damage>=finite(contract?.navy?.requiredDamage,28);
 const teamTargetCount=contract?.navy?.spawned?contract.navy.targetIds.length:0;
 const teamNeutralized=teamTargets.filter(target=>target.neutralized).length;
 return{employeeId:String(playerId),operationId:contract?.military?.operationId,sharedOperation:shared,watchSeconds,requiredWatchSeconds,teamTargetCount,teamNeutralized,damage,shots:Math.max(0,finite(member?.shots,contract?.work?.shots)),targets,duty:!!duty};
}
