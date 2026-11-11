/** Authored service campaigns. Factions without an entry have no campaign yet. */
const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};

export const MILITARY_RECRUITER=freeze({id:'morrow:military-recruiter',name:'Sergeant Sera Venn',role:'Freewake recruiter',factionId:'freewake',systemId:'hearth',bodyId:'morrow'});
export const MILITARY_RECRUITER_TARGET=freeze({systemId:'hearth',bodyId:'morrow',entityId:MILITARY_RECRUITER.id,label:'Sergeant Sera Venn · Morrow'});

const ground=(id,title,siteId,siteName,summary,objective,objectiveId,damage,reward,xp)=>({
 id:`freewake-army-${id}`,factionId:'freewake',branchId:'army',title,siteId,siteName,summary,objective,reward,xp,
 systemId:'hearth',bodyId:'morrow',
 objectives:damage===0?[
  {id:'hits',label:'Hit each of the three range targets',event:'ground-hit',required:3,distinct:true},
  {id:objectiveId,label:'Record your qualification at the range terminal',event:'ground-objective',required:1}
 ]:[
  {id:'damage',label:'Contribute to the fighting with your own weapon',event:'ground-hit',required:damage},
  {id:'clear',label:'Clear the armed threat from the site',event:'ground-clear',required:1},
  {id:objectiveId,label:{relay:'Restore the emergency relay',rescue:'Call the medical evacuation shuttle',beacon:'Transmit the safe landing corridor'}[objectiveId],event:'ground-objective',required:1}
 ]
});
const navy=(id,title,summary,profile,reward,xp)=>({
 id:`freewake-navy-${id}`,factionId:'freewake',branchId:'navy',title,summary,reward,xp,systemId:'hearth',bodyId:'morrow',
 objective:`Work the gun battery aboard FWS Steadfast. ${profile.training?'Qualify on both marked range targets.':'Help neutralize every marked hostile.'} Return to Morrow with the carrier, then report to Sergeant Venn.`,
 navy:{classId:'leviathan',shipName:'FWS Steadfast',...profile,objectiveText:summary},
 objectives:[
  {id:'targets',label:`Neutralize ${profile.targetCount} marked targets with at least ${profile.requiredDamage} of your own hull damage to each`,event:'sortie-targets',required:profile.targetCount},
  {id:'return',label:'Return to Morrow aboard the carrier and go ashore',event:'sortie-return',required:1}
 ]
});

const army=[
 ground('range','Field qualification','service-range','Morrow Service Range','Learn to move between cover, aim your issued sidearm, and register hits on three harmless target frames.','Walk to Morrow Service Range. Hit the three target frames, then use the range terminal.','drill',0,100,1),
 ground('relay','Restore the Rainline relay','service-relay','Rainline Relay Annex','A farm district has lost its emergency channel. Clear the occupied annex and bring the relay back.','Reach the Rainline Relay Annex. Clear the raiders, then restore the emergency relay.','relay',24,200,1),
 ground('rescue','Bring the clinic workers home','service-rescue','Eastbank Aid Post','The clinic convoy has been ambushed. Secure the aid post and call the waiting shuttle for its two stranded workers.','Reach Eastbank Aid Post. Clear the raiders, then call the medical evacuation shuttle.','rescue',24,300,2),
 ground('line','Hold the Rainline landing','service-line','Rainline Beacon Station','The relief convoy needs a safe beacon. Your section holds the perimeter while you clear the station and transmit its landing corridor.','Reach Rainline Beacon Station. Clear the station, then send the relief convoy its landing corridor.','beacon',40,450,4)
];
const fleet=[
 navy('battery','Gunnery qualification','The NPC captain flies the carrier. Find the gun console, learn its exterior aiming view, and neutralize both harmless range targets.',{training:true,targetCount:2,targetClassId:'hauler',targetHull:112,targetDamage:0,targetSpeed:0,requiredDamage:28},100,1),
 navy('escort','Merchant-lane escort','Two armed cutters threaten the local freighters. Work the carrier battery and contribute to stopping both while the captain keeps the ship on station.',{training:false,targetCount:2,targetClassId:'marten',targetHull:160,targetDamage:5,targetSpeed:48,requiredDamage:28},225,1),
 navy('distress','Answer the distress call','Three raiders have trapped a relief ship on the Morrow approach. Help clear every contact before the carrier returns to collect the survivors.',{training:false,targetCount:3,targetClassId:'marten',targetHull:190,targetDamage:7,targetSpeed:58,requiredDamage:38},325,2),
 navy('patrol','Hold the patrol line','A heavier raiding group is pressing the relief corridor. Complete the carrier’s final patrol and keep the approach open for the civilian convoy.',{training:false,targetCount:3,targetClassId:'bulwark',targetHull:240,targetDamage:9,targetSpeed:64,requiredDamage:48},450,4)
];

export const MILITARY_CAMPAIGNS=freeze([
 {factionId:'freewake',title:'The Hearth service campaign',recruiter:MILITARY_RECRUITER,rivalId:'meridian',branches:[
  {id:'navy',name:'Freewake Navy',description:'Serve aboard a Freewake carrier, qualify on its battery, escort traffic, answer a distress call, and hold the patrol line.',completion:'The carrier’s patrol has opened the Morrow approach. Your first Navy campaign is complete; ordinary service assignments remain available.',missions:fleet},
  {id:'army',name:'Freewake Army',description:'Train on Morrow, restore a relay, rescue trapped clinic workers, and defend the settlement’s landing line.',completion:'Rainline’s relay, clinic route, and landing beacon are working again. Your first Army campaign is complete; ordinary service assignments remain available.',missions:army}
 ]}
]);
export const MILITARY_MISSIONS=Object.freeze(MILITARY_CAMPAIGNS.flatMap(campaign=>campaign.branches.flatMap(branch=>branch.missions)));
export const militaryCampaign=factionId=>MILITARY_CAMPAIGNS.find(campaign=>campaign.factionId===factionId)||null;
export const militaryBranch=(factionId,branchId)=>militaryCampaign(factionId)?.branches.find(branch=>branch.id===branchId)||null;
export const militaryMission=id=>MILITARY_MISSIONS.find(mission=>mission.id===id)||null;
