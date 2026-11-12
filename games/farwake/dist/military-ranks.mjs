/** A service rank belongs to a captain's record, never to their ship or squad. */
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:0;
const count=value=>Math.min(100000,Math.max(0,Math.floor(finite(value))));
const stateOf=value=>value?.state||value||{};
const labels=Object.freeze({
 navy:Object.freeze(['Recruit','Able crew','Petty officer','Chief petty officer','Lieutenant']),
 army:Object.freeze(['Recruit','Private','Corporal','Sergeant','Lieutenant']),
 service:Object.freeze(['Volunteer','Fleet specialist','Veteran','Section leader','Commissioned officer'])
});
export const MILITARY_PROMOTION_MISSIONS=Object.freeze([0,3,8,16,28]);
export const MILITARY_PERMISSION_RANKS=Object.freeze({join:0,leadRoutine:1,leadFrontier:2,command:3,strategicOrders:4});
const permissionLabels=Object.freeze({join:'Serve in an assigned squad or ship watch',leadRoutine:'Lead routine deployments',leadFrontier:'Lead deployments in rival territory',command:'Direct section operations',strategicOrders:'Request senior command assignments'});

/** Old saves keep an earned tier. New service advances only on completed work. */
export function normalizeMilitaryServiceRank(raw={}){
 const old=raw.rankVersion!==1,earned=raw.enlisted?(finite(raw.xp)>=16?3:finite(raw.xp)>=8?2:finite(raw.xp)>=3?1:0):0;
 return{rankVersion:1,legacyRankFloor:old?earned:Math.min(3,count(raw.legacyRankFloor))};
}

export function militaryRankFor(career={}, {branchId=null}={}){
 const completed=count(career.completed),enlisted=career.enlisted===true,names=Object.hasOwn(labels,branchId)?labels[branchId]:labels.service;
 const history=normalizeMilitaryServiceRank(career),earned=MILITARY_PROMOTION_MISSIONS.reduce((rank,threshold,index)=>completed>=threshold?index:rank,0);
 const rankIndex=enlisted?Math.max(earned,history.legacyRankFloor):0,nextRank=MILITARY_PROMOTION_MISSIONS[rankIndex+1]??null;
 const permissions=Object.fromEntries(Object.entries(MILITARY_PERMISSION_RANKS).map(([id,required])=>[id,enlisted&&rankIndex>=required]));
 return{enlisted,factionId:career.factionId||null,branchId:['army','navy'].includes(branchId)?branchId:null,rank:names[rankIndex],rankIndex,completed,nextRank,nextRankName:nextRank===null?null:names[rankIndex+1],remaining:nextRank===null?0:Math.max(0,nextRank-completed),permissions,permissionLabels:Object.entries(permissionLabels).filter(([id])=>permissions[id]).map(([,label])=>label)};
}

export function militaryServiceRank(gameOrState){
 const state=stateOf(gameOrState),career=state.professions?.careers?.military||{},branchId=state.militaryCareer?.factionId===career.factionId?state.militaryCareer?.branchId:null;
 const rank=militaryRankFor(career,{branchId});
 if(finite(state.rep?.[career.factionId])<=-25){rank.suspended=true;rank.permissions=Object.fromEntries(Object.keys(MILITARY_PERMISSION_RANKS).map(id=>[id,false]));rank.permissionLabels=[];}
 return rank;
}

/** Call this on the acting captain at the authority, not on a displayed roster. */
export function militaryPermission(gameOrState,permission,{factionId=null,branchId=null,minRank}={}){
 const rank=militaryServiceRank(gameOrState),required=Object.hasOwn(MILITARY_PERMISSION_RANKS,permission)?Number.isInteger(minRank)&&minRank>=0&&minRank<=4?minRank:MILITARY_PERMISSION_RANKS[permission]:undefined;
 const denied=(reason,code='military-rank')=>({ok:false,reason,code,rank});
 if(required===undefined)return denied('These orders do not grant that permission.','military-permission');
 if(!rank.enlisted)return denied('Enlist with this faction before accepting military orders.','military-enlistment');
 if(factionId&&rank.factionId!==factionId)return denied('These orders belong to another faction. Your service record does not grant its clearance.','military-faction');
 if(branchId&&rank.branchId!==branchId)return denied('Join the matching military branch before taking this duty.','military-branch');
 if(rank.suspended)return denied('Your faction has suspended duty permissions while your standing is hostile.','military-standing');
 if(rank.rankIndex<required){const names=Object.hasOwn(labels,rank.branchId)?labels[rank.branchId]:labels.service;return denied(`${names[required]} rank is required to authorize these orders. You can still serve under an eligible operation leader.`);}
 return{ok:true,reason:null,rank};
}

/** Authored forms of address; no rank or reputation is awarded by talking. */
export function militaryDialogue(gameOrState,{factionId=null,branchId=null,role='member',baseText=''}={}){
 const rank=militaryServiceRank(gameOrState);
 if(rank.enlisted&&factionId&&rank.factionId!==factionId)return role==='recruiter'?'You already serve another faction. I cannot issue its orders or transfer its clearance. Report to your own service desk.':baseText||'Your service record belongs to another faction. These orders and duty stations are reserved for our own personnel.';
 if(!rank.enlisted)return role==='recruiter'?'If you want a clear next assignment, I can put you with a crew. Choose Navy or Army. The enlistment is yours to make.':baseText||'Service personnel only beyond this point. Speak to recruiting if you want to join.';
 if(rank.suspended)return `${rank.rank}, your service record is intact, but your duty clearance is suspended. Settle your standing with the faction before asking for new orders.`;
 const own=branchId&&rank.branchId!==branchId?'You serve in the other branch; the duty officer keeps separate orders here. ':'';
 if(role==='recruiter')return `${rank.rank}, ${[
  'learn your post and bring your people back. A few completed assignments will earn your first stripe.',
  'you have earned your place. Routine deployments can now go out under your lead; take the new recruits with you.',
  'your record is ready for frontier duty. Brief the recruits before you cross into rival territory.',
  'the section looks to you now. Keep the watch organized and make sure every member knows the return plan.',
  'command has put the senior assignments on your board. The people under you still have their own duties and clearances.'
 ][rank.rankIndex]}`;
 const greeting=[
  'check in with your section leader. Stay at your assigned post and ask if the orders are unclear.',
  'good to have a qualified hand on this watch. Show the new arrivals where to report.',
  'your experience will help on this deployment. Keep the newer crew informed.',
  'the section is ready for your briefing. Every recruit is accounted for.',
  'the duty report is ready. The crew are standing by for the operation briefing.'
 ][rank.rankIndex];
 return `${rank.rank}, ${own}${baseText||greeting}`;
}
