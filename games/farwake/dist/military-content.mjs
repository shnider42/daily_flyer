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
 objective:`Work the gun battery aboard FWS Steadfast. ${profile.training?'Qualify on both marked range targets.':'Help neutralize every marked hostile.'} ${profile.procedureKind==='rescue'?'Then follow the rescue orders at the gun console, medical station and entry airlock to bring the survivors aboard. ':''}Return to Morrow with the carrier, then report to Sergeant Venn.`,
 navy:{classId:'leviathan',shipName:'FWS Steadfast',...profile,objectiveText:summary},
 objectives:[
  {id:'targets',label:`Crew: neutralize ${profile.targetCount} marked contacts`,event:'sortie-targets',required:profile.targetCount},
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
 navy('escort','Merchant-lane escort','A real relief transport is crossing the Morrow lane. Two armed cutters threaten it; cover its passage while the commander holds the carrier between the transport and the attack.',{training:false,escort:true,watchSeconds:60,targetCount:2,targetClassId:'marten',targetHull:160,targetDamage:5,targetSpeed:48,requiredDamage:28},225,1),
 navy('distress','Answer the distress call','Three raiders have trapped a damaged survey tender on the Morrow approach. Clear the attackers, then assist the ship’s medics and rescue crew to bring the survivors aboard.',{training:false,procedureKind:'rescue',targetCount:3,targetClassId:'marten',targetHull:190,targetDamage:7,targetSpeed:58,requiredDamage:38},325,2),
 navy('patrol','Hold the patrol line','A heavier raiding group is pressing the relief corridor. Protect the civilian transport while the crew holds the approach open; this is your final local qualification before standing fleet duty.',{training:false,escort:true,watchSeconds:75,targetCount:3,targetClassId:'bulwark',targetHull:240,targetDamage:9,targetSpeed:64,requiredDamage:48},450,4)
];

// Standing orders continue after qualification. The mission gives a posting,
// not a prediction: whether a watch stays quiet is resolved once per operation
// by the authority, and survives a restart with that operation.
const posting=(systemId,bodyId,systemName,bodyName)=>({systemId,bodyId,systemName,bodyName});
const field=(id,title,siteId,siteName,deployment,summary,objectiveId,reward,leadRank,{watchSeconds=0,attackChance=0,attackDelay=0,damage=24}={})=>({
 id:`freewake-army-${id}`,factionId:'freewake',branchId:'army',repeatable:true,leadRank,minRank:0,title,siteId,siteName,deployment,
 systemId:deployment.systemId,bodyId:deployment.bodyId,summary,reward,xp:1,
 objective:`Take the service shuttle to ${deployment.bodyName} in ${deployment.systemName}. ${watchSeconds?'Keep watch at':'Secure'} ${siteName}, then use its ${watchSeconds?'watch log':'field console'}. Return on the service shuttle for your debrief.`,
 ...(watchSeconds?{watch:{seconds:watchSeconds,attackChance,attackDelay,enemyFactionId:'meridian'}}:{}),
 objectives:[
  ...(watchSeconds?[{id:'watch',label:`Serve ${watchSeconds} seconds of watch at the assigned post`,event:'ground-watch',required:watchSeconds}]:[{id:'damage',label:'Contribute to securing the position with your own weapon',event:'ground-hit',required:damage}]),
  {id:'clear',label:'Keep the assigned position secure',event:'ground-clear',required:1},
  {id:watchSeconds?'log':objectiveId,label:watchSeconds?'Sign the completed watch log':objectiveId==='rescue'?'Signal the civilian evacuation shuttle':'Transmit the completed field objective',event:'ground-objective',required:1}
 ]
});
const sea=(id,title,deployment,summary,reward,leadRank,profile)=>({
 ...navy(id,title,summary,{training:false,targetCount:2,targetClassId:'marten',targetHull:170,targetDamage:6,targetSpeed:48,requiredDamage:28,enemyFactionId:'meridian',...profile},reward,1),
 repeatable:true,leadRank,minRank:0,deployment,
 objective:`Report aboard FWS Steadfast for ${title.toLowerCase()} in ${deployment.systemName}. ${profile.procedure?'Follow the posted Navy orders at their marked stations, keep your watch, and protect the assigned vessels.':'Keep the gun station manned and respond to verified contacts.'} Return to Morrow for debrief.`,
 objectives:[{id:'watch',label:`Serve ${profile.watchSeconds} seconds at your assigned station`,event:'sortie-watch',required:profile.watchSeconds},{id:'return',label:'Complete the operation and return to Morrow',event:'sortie-return',required:1}]
});
const serein=posting('meridian','serein','Meridian','Serein'),cairn=posting('meridian','cairn','Meridian','Cairn'),tallow=posting('sable','tallow','Sable','Tallow');
const armyDeployments=[
 field('border-watch','Serein border watch','service-border-watch','Serein Observation Post',serein,'The water crews have asked for a Freewake observer on the disputed road. Sign in, keep the post, and report what actually happens. A quiet shift still matters.','watch',190,1,{watchSeconds:55,attackChance:.35,attackDelay:26}),
 field('condenser','Restore the violet condenser','service-condenser','Violet Condenser Annex',serein,'A private security detail has cut the communal condenser controls. Restore access to the water workers and leave their machinery intact.','relay',310,1),
 field('depot-watch','Supply depot night shift','service-depot-watch','Serein Supply Depot',serein,'Relief crates are waiting for a dawn collection. Your section keeps watch while the loaders finish. Intelligence has no confirmed threat.','watch',240,1,{watchSeconds:70,attackChance:.45,attackDelay:38}),
 field('refinery-rescue','Bring the refinery shift home','service-refinery-rescue','Tallow Shift Shelter',tallow,'The refinery dispute has trapped civilian workers between armed checkpoints. Secure the shelter and call the evacuation shuttle.','rescue',410,2,{damage:36}),
 field('fuel-watch','A quiet fuel line','service-fuel-watch','Tallow Fuel-Line Post',tallow,'A maintenance crew needs a secure work window at the edge of the refinery. Hold the line until the engineer closes the repair log.','watch',320,2,{watchSeconds:85,attackChance:.5,attackDelay:46}),
 field('switchyard','Open the Sable relief corridor','service-switchyard','Tallow Switchyard',tallow,'Relief traffic cannot cross the refinery belt while the switchyard is occupied. Clear the armed blockade and transmit a protected civilian route.','beacon',490,3,{damage:40})
];
const navyDeployments=[
 sea('border-watch','Meridian border watch',serein,'A posted watch on the edge of Meridian space. The commander will fly the circuit; keep the battery ready and wait for a clear contact report.',230,1,{kind:'patrol',watchSeconds:55,attackChance:.35,attackDelay:27}),
 sea('grain-escort','The Orchard grain convoy',posting('brindle','weighhouse','Brindle','The Weighhouse'),'Escort the harvest freight to the exchange. A safe arrival earns the same completed watch whether or not a shot is fired.',250,1,{kind:'escort',watchSeconds:65,attackChance:.25,attackDelay:34,escort:true}),
 sea('quarry-escort','Cairn supply escort',cairn,'A relief freighter is crossing a disputed lane above Cairn. Stay at your post while the commander shepherds it through the corridor.',310,1,{kind:'escort',watchSeconds:70,attackChance:.5,attackDelay:36,escort:true}),
 sea('sable-watch','Sable outer patrol',posting('sable','checkpoint','Sable','Checkpoint Sable'),'Conflicting transponders are moving beyond the refinery approach. Hold the patrol line while the commander sorts ordinary traffic from a threat.',360,2,{kind:'patrol',watchSeconds:80,attackChance:.6,attackDelay:42,targetCount:3,targetHull:200,targetDamage:7}),
 sea('refinery-escort','The Tallow relief passage',tallow,'Keep a medical freighter safe through Sable’s contested industrial approaches. Wait for identification before treating a contact as hostile.',420,2,{kind:'escort',watchSeconds:90,attackChance:.65,attackDelay:50,escort:true,targetCount:3,targetHull:210,targetDamage:8}),
 sea('lane-screen','Ledger evacuation screen',posting('meridian','ledger','Meridian','Ledger Ring'),'The fleet has opened a civilian departure window. Cover the approach while evacuee ships clear the ring; the timing of any interception is uncertain.',480,3,{kind:'patrol',watchSeconds:100,attackChance:.75,attackDelay:54,targetCount:3,targetClassId:'bulwark',targetHull:240,targetDamage:9}),
 sea('rescue-watch','A light in the dark',posting('hearth','morrow','Hearth','Morrow'),'A survey tender has lost its drives. Find its live beacon, assist the medical reception, and account for its crew during the rescue transfer. A rescue needs attention even when nobody fires a shot.',280,1,{kind:'rescue',procedure:true,watchSeconds:45,attackChance:.2,attackDelay:28,targetCount:1,targetDamage:4}),
 sea('traffic-identification','The incomplete transponder',posting('brindle','weighhouse','Brindle','The Weighhouse'),'Sort an identification problem from a hostile act. Compare the traffic report, relay an authenticated challenge, and act on the reply. A faulty civilian transmitter must not become a target by mistake.',290,1,{kind:'inspection',procedure:true,watchSeconds:45,attackChance:.35,attackDelay:30,targetCount:1}),
 sea('approach-survey','Soundings for the morning traffic',posting('hearth','morrow','Hearth','Morrow'),'A navigation tender needs a fresh approach survey. Take an independent reference, compare the navigator’s fixes, and publish a usable hazard notice for the next civilian arrivals.',270,1,{kind:'survey',procedure:true,watchSeconds:45,attackChance:0,attackDelay:0}),
 sea('engineering-assist','Keep the Worklight burning',posting('brindle','weighhouse','Brindle','The Weighhouse'),'A service cutter is stranded with a damaged power feed. Relay the isolation check, transfer a complete repair kit, and monitor the chief’s staged restart without taking over engineering clearance.',320,1,{kind:'repair',procedure:true,watchSeconds:45,attackChance:.15,attackDelay:32,targetCount:1,targetDamage:4}),
 sea('fleet-replenishment','Stores before the long watch',posting('hearth','morrow','Hearth','Morrow'),'Meet a fleet auxiliary for replenishment. Check the assigned stores, assist the counted transfer, and relay all-lines-clear before separation. Routine seamanship keeps the fleet working.',260,1,{kind:'replenishment',procedure:true,watchSeconds:45,attackChance:0,attackDelay:0}),
 sea('civilian-evacuation','The last boarding list',posting('meridian','ledger','Meridian','Ledger Ring'),'Help an evacuation transport leave rival territory. Verify who is actually aboard, assist urgent casualties, and cover the final shuttle while the movement lists are reconciled.',460,2,{kind:'evacuation',procedure:true,watchSeconds:45,attackChance:.55,attackDelay:32,targetCount:2,targetHull:200,targetDamage:7}),
 sea('readiness-exercise','Quiet Measure fleet exercise',posting('hearth','morrow','Hearth','Morrow'),'A controlled fleet exercise combines target identification, a simulated compartment muster, and a range safety check. Work with the ship’s company, then disable the harmless practice hulls.',300,1,{kind:'exercise',procedure:true,training:true,watchSeconds:45,attackChance:1,attackDelay:16,targetCount:2,targetClassId:'hauler',targetHull:112,targetDamage:0,targetSpeed:0}),
 sea('border-standoff','Leave an open lane',cairn,'A rival patrol challenges a civilian relief passage. Report the separation picture, relay the commander’s measured signal, and distinguish an actual attack from a negotiated withdrawal.',510,3,{kind:'standoff',procedure:true,watchSeconds:45,attackChance:.45,attackDelay:30,targetCount:3,targetClassId:'bulwark',targetHull:220,targetDamage:8})
];

export const MILITARY_CAMPAIGNS=freeze([
 {factionId:'freewake',title:'The Hearth service campaign',recruiter:MILITARY_RECRUITER,rivalId:'meridian',branches:[
  {id:'navy',name:'Freewake Navy',description:'Serve aboard a Freewake carrier, qualify on its battery, escort traffic, answer a distress call, and hold the patrol line.',completion:'The Morrow approach is open. You have completed initial qualification; standing fleet orders now take your service beyond Hearth.',missions:fleet,deployments:navyDeployments},
  {id:'army',name:'Freewake Army',description:'Train on Morrow, restore a relay, rescue trapped clinic workers, and defend the settlement’s landing line.',completion:'Rainline’s relay, clinic route, and landing beacon are working again. Initial qualification is complete; the service desk now offers postings beyond Hearth.',missions:army,deployments:armyDeployments}
 ]}
]);
export const MILITARY_MISSIONS=Object.freeze(MILITARY_CAMPAIGNS.flatMap(campaign=>campaign.branches.flatMap(branch=>[...branch.missions,...branch.deployments])));
export const MILITARY_DEPLOYMENTS=Object.freeze(MILITARY_MISSIONS.filter(mission=>mission.repeatable));
export const militaryCampaign=factionId=>MILITARY_CAMPAIGNS.find(campaign=>campaign.factionId===factionId)||null;
export const militaryBranch=(factionId,branchId)=>militaryCampaign(factionId)?.branches.find(branch=>branch.id===branchId)||null;
export const militaryMission=id=>MILITARY_MISSIONS.find(mission=>mission.id===id)||null;
