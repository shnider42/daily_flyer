// Fictional field operations; the four campaign chapters keep their existing order.
export const MISSIONS = [
  {id:'cordon',title:'Cordon',subtitle:'An assignment comes apart',time:'3 OCT 1993 · AFTERNOON',lighting:'day',category:'campaign',durationLabel:'Extended operation',description:'Recover the field radio, inspect the approach, protect collection, and carry the radio to the withdrawing convoy.',briefing:['The chalk has landed away from its assigned collection point. A field radio was left in a nearby courtyard.','Retrieve it, observe the market approach, and keep the collection point covered until transport is ready. The original pickup plan can still change.'],goals:['Retrieve the courtyard radio','Observe the market approach','Cover collection and withdraw with the radio']},
  {id:'first-crash',title:'First Crash',subtitle:'The mission has changed',time:'3 OCT 1993 · LATE AFTERNOON',lighting:'late-afternoon',category:'campaign',durationLabel:'Extended operation',description:'Observe the wreck approach, recover two crew members, and lead them through a sheltered withdrawal route.',briefing:['A helicopter is down. Look at the approach before committing the squad; the crew’s condition is unconfirmed.','Once treated, the crew must physically follow you through the west-side route. You can bypass opposition; the people, rather than the street, are the objective.'],goals:['Observe and reach the wreck','Stabilize both crew members','Escort them through the west-side route']},
  {id:'night-relief',title:'Night Relief',subtitle:'A way through the city',time:'3–4 OCT 1993 · OVERNIGHT',lighting:'night',category:'campaign',durationLabel:'Extended operation',description:'Check the convoy approach, clear obstructions, reconnect the collection-point radio, and cover casualty loading.',briefing:['A relief force is working through the city. Malaysian and Pakistani troops participated in the historical rescue alongside U.S. forces.','This fictional chalk checks a junction, accompanies the vehicles, and reconnects a radio at the loading point. The vehicles wait for the squad.'],goals:['Observe the lead vehicle’s route','Escort and clear the convoy','Restore the collection-point radio and cover loading']},
  {id:'dawn-mile',title:'Dawn Mile',subtitle:'Get the survivors through',time:'4 OCT 1993 · DAWN',lighting:'dawn',category:'campaign',durationLabel:'Extended operation',description:'Bring two exhausted soldiers through the withdrawal, recover a medical satchel, and hand it to the forward aid team before reaching safety.',briefing:['The transports are full. Your chalk is withdrawing on foot through streets that have not been secured.','A medical satchel remains at a sheltered stop. Recover it if you can reach it, pass it to the forward aid team, and bring your surviving chalk to the station.'],goals:['Check the withdrawal approach','Retrieve and deliver medical supplies','Reach the aid station together']},
  {id:'signal-house',title:'Signal House',subtitle:'A connection in the dark',time:'FICTIONAL SIDE OPERATION · NIGHT',lighting:'night',category:'side',durationLabel:'Extended operation',description:'Carry a replacement battery across the district, restore an isolated field radio, and withdraw after transmitting the route report.',briefing:['This standalone fictional operation explores a communications problem; it is not a claim about a specific historical action.','Collect the battery from a house, observe the open avenue, and carry it to the disabled radio. The transmission runs while you withdraw.'],goals:['Collect the radio battery','Observe the avenue and deliver the battery','Withdraw after the route report transmits']},
  {id:'courtyard-evac',title:'Courtyard Evacuation',subtitle:'Two households, one route',time:'FICTIONAL SIDE OPERATION · LATE AFTERNOON',lighting:'late-afternoon',category:'side',durationLabel:'Extended operation',description:'Find two injured residents in separate houses, treat them, and escort them along a route to the aid station.',briefing:['This standalone fictional scenario puts the squad among households caught in the fighting. Its residents and events are invented.','The two residents are in different buildings. Treat the first, move them to the next sheltered stop, reach the second, and keep both with you during the withdrawal.'],goals:['Reach and treat the first resident','Escort them to the second household','Bring the survivors to the aid station']},
];
export const getNextCampaignMission = index => Number.isInteger(index)&&index>=0&&index<3?index+1:null;
export const nightMission = state => state?.mission?.lighting==='night'||!state?.mission?.lighting&&state?.missionIndex===2;
const stage=(id,kind,x,y,title,description,extra={})=>({id,kind,x,y,radius:120,duration:2,title,description,...extra});
export function stagesFor(m){
  if(m===0)return[
    stage('cordon-entry','rally',680,1340,'Form the cordon','Bring the chalk to the first street.'),
    stage('cordon-radio','interact',680,1120,'Recover the field radio','Enter the courtyard house and pick up the field radio.',{interior:true,action:'pickup',itemId:'field-radio',itemKind:'radio',itemLabel:'Field radio',duration:3,radius:58,interactionLabel:'Pick up radio'}),
    stage('cordon-observe','recon',1160,1340,'Observe the market approach','Face the marked junction and hold Assist, or observe with Mercer’s binoculars.',{lookAt:{x:1160,y:960},observeRange:520,duration:3}),
    stage('collection-hold','hold',1160,960,'Cover the collection point','Cover the collection point while transport prepares to withdraw.',{radius:125,duration:55}),
    stage('cordon-convoy','convoy',1160,960,'Guide the loaded transport','Keep the loaded vehicles with the chalk through the west-side detour.',{radius:190,duration:1}),
    stage('cordon-delivery','deliver',1640,580,'Bring the radio to transport','Carry the recovered radio to the convoy and hand it over.',{itemId:'field-radio',objectKind:'radio',duration:3,radius:70,interactionLabel:'Hand over radio'}),
    stage('cordon-extract','extract',1640,580,'Regroup at the convoy','Bring every surviving squad member to the vehicles.',{radius:150,duration:3}),
  ];
  if(m===1)return[
    stage('crash-observe','recon',680,1340,'Observe the wreck approach','Check the long approach before crossing to the wreck.',{lookAt:{x:680,y:960},observeRange:520,duration:3}),
    stage('crash-entry','rally',1160,960,'Reach the crash site','Move the chalk to the downed helicopter.',{radius:130}),
    stage('crash-crew-one','rescue',1110,950,'Stabilize the first crew member','Hold Assist nearby, or protect the medic while they work.',{radius:75,duration:13,crew:0}),
    stage('crash-crew-two','rescue',1215,1020,'Stabilize the second crew member','The second crew member needs treatment before moving.',{radius:75,duration:13,crew:1}),
    stage('crash-west-route','escort',680,580,'Bring the crew west of the market','Lead the recovered crew around the west-side blocks. Wait for stragglers.',{radius:150}),
    stage('crash-exit-observe','recon',1640,580,'Check the collection-point approach','Observe the final open street before moving the crew.',{lookAt:{x:2120,y:580},observeRange:560,duration:3}),
    stage('crash-extract','extract',2120,580,'Escort the crew to safety','Bring the recovered crew and surviving chalk into the collection point.',{radius:165,duration:3}),
  ];
  if(m===2)return[
    stage('relief-entry','rally',200,1340,'Meet the relief convoy','Rally with the vehicles before the lead vehicle moves.',{radius:130}),
    stage('relief-observe','recon',680,1340,'Check the first junction','Face east and observe the convoy’s first crossing.',{lookAt:{x:1160,y:1340},observeRange:560,duration:3}),
    stage('relief-convoy','convoy',200,1340,'Accompany the relief convoy','Stay close to the lead vehicle. Clear its two blocked approaches.',{radius:190,duration:1}),
    stage('relief-radio','interact',1900,760,'Reconnect the collection-point radio','Enter the nearby house and reconnect the loading-point radio.',{interior:true,action:'activate',objectKind:'radio',duration:4,radius:58,interactionLabel:'Reconnect radio'}),
    stage('relief-loading','hold',2120,580,'Cover casualty loading','Bring the surviving chalk to the convoy and cover casualty loading.',{radius:160,duration:42}),
  ];
  if(m===3)return[
    stage('dawn-entry','rally',680,1340,'Leave the collection point','Bring the chalk onto the withdrawal route.',{radius:130,duration:3}),
    stage('dawn-observe','recon',1160,1340,'Check the next approach','Observe the market junction; the next route report may change your approach.',{lookAt:{x:1160,y:960},observeRange:520,duration:3}),
    stage('dawn-medical','interact',1160,1115,'Retrieve the medical satchel','Enter the sheltered house and recover the aid team’s satchel.',{interior:true,action:'pickup',itemId:'medical-satchel',itemKind:'medical',itemLabel:'Medical satchel',duration:3,radius:58,interactionLabel:'Pick up satchel'}),
    stage('dawn-covered-route','escort',680,580,'Bring the stragglers through the covered route','The direct avenue is blocked. Keep the two exhausted soldiers with the chalk through the west-side approach.',{radius:145}),
    stage('dawn-route','deliver',1640,580,'Bring supplies to the forward aid team','Carry the satchel to the next aid rendezvous and hand it over.',{itemId:'medical-satchel',objectKind:'medical',duration:3,radius:70,interactionLabel:'Hand over supplies'}),
    stage('dawn-final','escort',1640,200,'Regroup before the aid station','Move together through the final northbound approach.',{radius:140,duration:2}),
    stage('dawn-extract','extract',2120,200,'Reach the aid station','Bring every surviving squad member inside the station perimeter.',{radius:170,duration:3}),
  ];
  if(m===4)return[
    stage('signal-entry','rally',200,1340,'Reach the battery route','Bring the squad onto the sheltered southern approach.'),
    stage('signal-battery','interact',680,1340,'Collect the replacement battery','Enter the house and pick up the replacement radio battery.',{interior:true,action:'pickup',itemId:'radio-battery',itemKind:'battery',itemLabel:'Radio battery',duration:3,radius:58,interactionLabel:'Pick up battery'}),
    stage('signal-observe','recon',1160,1340,'Observe the open avenue','Face north and inspect the avenue from cover.',{lookAt:{x:1160,y:960},observeRange:520,duration:3}),
    stage('signal-restore','deliver',1160,960,'Restore the isolated radio','Bring the battery into the radio house and connect it.',{interior:true,itemId:'radio-battery',objectKind:'radio',duration:4,radius:58,interactionLabel:'Connect battery',transmission:25}),
    stage('signal-withdraw','escort',1640,580,'Withdraw through the eastern junction','The report is transmitting. Withdraw together while it finishes.',{radius:150}),
    stage('signal-extract','extract',2120,200,'Reach the pickup street','Bring the chalk to transport after the route report is sent.',{radius:160,duration:3,requiresTransmission:true}),
  ];
  return[
    stage('evac-entry','rally',680,1340,'Reach the first household','Approach the house where the first resident is waiting.'),
    stage('evac-resident-one','rescue',680,960,'Treat the first resident','Enter the house and treat the resident so they can walk.',{interior:true,radius:65,duration:10,crew:0}),
    stage('evac-west-stop','escort',680,580,'Escort to the sheltered crossing','Keep the first resident close while moving to the next block.',{radius:145}),
    stage('evac-resident-two','rescue',1160,580,'Treat the second resident','Reach the second household while keeping the first resident with the chalk.',{interior:true,radius:65,duration:10,crew:1}),
    stage('evac-north-route','escort',1640,200,'Bring the residents around the north block','Lead both residents along the northern route. Recover anyone who falls behind.',{radius:150}),
    stage('evac-extract','extract',2120,200,'Reach the aid station','Bring every surviving resident and squad member into the aid station.',{radius:175,duration:3}),
  ];
}
