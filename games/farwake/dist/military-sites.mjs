/** Authored infantry deployments. Ordinary planetary expeditions keep their own records. */
import { militaryMission } from './military-content.mjs';
const point=(x,y)=>({x:(x+.5)*24,y:(y+.5)*24});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const infantry=(id,name,x,y,options={})=>({id,name,species:'human',team:'hostile',hostile:true,...point(x,y),health:48,maxHealth:48,speed:48,damage:6,range:158,attackKind:'ranged',windupDuration:.65,fireDelay:1.55,color:'#b8826e',...options});
const target=(id,x,y)=>infantry(id,'Range target',x,y,{health:24,maxHealth:24,speed:0,damage:0,attackKind:'none',stationary:true,trainingTarget:true,color:'#94b8b4'});
const record=(id,name,x,y,text)=>({id,name,x,y,text});
const sites=[
 {id:'service-range',missionId:'freewake-army-range',name:'Morrow Service Range',tileX:18,tileY:35,objectiveId:'drill',training:true,
  summary:'A supervised range. Learn to move, aim and fire before anyone fires back.',
  story:'Sergeant Venn has left three target frames beyond the cover blocks. Walk the course at your own pace, hit each target, then use the range terminal. The quartermaster confirms that your pulse sidearm is already issued; its cell recharges between shots.',
  hostiles:[target('left',17,9),target('center',25,9),target('right',33,9)],
  records:[record('briefing','Range orders',6,23,'WASD moves; Shift runs. Aim with the mouse or the aiming stick, then fire. The blocks stop shots. You can leave by the door at any time. Hit all three target frames before checking the terminal.'),record('drill','Range terminal',35,24,'Three target frames register hits. Your instructor records the qualification and asks you to return to the recruiter for the first field assignment.')]
 },
 {id:'service-relay',missionId:'freewake-army-relay',name:'Rainline Relay Annex',tileX:51,tileY:34,objectiveId:'relay',
  summary:'A relay crew is pinned outside its own annex. Restore their emergency channel.',
  story:'The same raiders who have been testing Hearth’s shipping lanes have cut a ground relay on Morrow. Your section is covering the outside stair. You have the annex: move between the equipment rooms, clear the armed raiders, and restore the relay.',
  hostiles:[infantry('sentry','Relay sentry',15,23),infantry('rifle','Raider rifleman',16,8),infantry('operator','Saboteur',31,10)],
  records:[record('briefing','Section orders',6,23,'Use the walls and equipment as cover. An enemy raises a weapon before firing; move across the line of fire or get behind a wall. Clear the annex, then use the relay console in the northeast room.'),record('relay','Emergency relay console',36,7,'The emergency carrier returns. A farm worker answers immediately: the evacuation road is open, but the clinic convoy never arrived. Your section is being sent to find it.')]
 },
 {id:'service-rescue',missionId:'freewake-army-rescue',name:'Eastbank Aid Post',tileX:83,tileY:43,objectiveId:'rescue',
  summary:'Two clinic workers are trapped inside an aid post. Secure their evacuation.',
  story:'The missing clinic convoy stopped here after a road ambush. Two workers have barricaded themselves in the treatment room. Freewake orders are explicit: clear a path, signal the waiting rescue shuttle, and leave the medical stores for the farms.',
  hostiles:[infantry('road','Roadblock rifleman',15,23,{health:60,maxHealth:60,damage:7}),infantry('breacher','Aid-post raider',15,9,{health:60,maxHealth:60,damage:7}),infantry('rear','Rear sentry',31,12,{damage:7})],
  residents:[{id:'clinician',name:'Medic Sela Orr',role:'medic',x:34,y:5,color:'#9bc5b7',text:'The shuttle is holding beyond the ridge. Clear the building and use the evacuation radio. We can carry the medicine ourselves.',data:{fixedPost:true,militaryCivilian:true}},{id:'driver',name:'Driver Len Moss',role:'settler',x:37,y:5,color:'#bdc7a2',text:'I kept the doors shut. That was all I could do.',data:{fixedPost:true,militaryCivilian:true}}],
  records:[record('briefing','Rescue orders',6,23,'Keep the workers out of the firing line. Clear the raiders before using the evacuation radio beside their treatment room. Friendly people are not targets.'),record('rescue','Evacuation radio',36,8,'The rescue shuttle acknowledges your clear signal. The clinic workers leave with their medicine under your section’s protection. The driver identifies the raiders’ next target: the Rainline landing beacon.')]
 },
 {id:'service-line',missionId:'freewake-army-line',name:'Rainline Beacon Station',tileX:96,tileY:61,objectiveId:'beacon',
  summary:'Hold the landing beacon long enough to bring the last relief convoy home.',
  story:'The Navy has opened the approach above Morrow. On the ground, the relief ships still need this beacon. Your section takes the outer perimeter while you clear the station and transmit a safe landing corridor. This is the operation the earlier assignments were preparing you for.',
  hostiles:[infantry('entry','Raider rifleman',15,24,{health:60,maxHealth:60,damage:8}),infantry('west','Raider marksman',16,8,{health:60,maxHealth:60,damage:8}),infantry('east','Raid leader',30,10,{health:96,maxHealth:96,armor:4,damage:9,fireDelay:1.35,color:'#bb766d'}),infantry('rear','Raider rifleman',35,23,{health:60,maxHealth:60,damage:8})],
  records:[record('briefing','Final section orders',6,23,'Do not run into the center of the station. Clear one room at a time, use cover while your cell recharges, and send the landing clearance from the beacon console.'),record('beacon','Landing corridor beacon',36,7,'Your clearance reaches the ships above. One by one, the relief pilots report the beacon in sight. The farms will have medicine and working pumps tonight. Sergeant Venn asks for your final report at Morrow’s landing.')]
 },
 {id:'service-border-watch',missionId:'freewake-army-border-watch',systemId:'meridian',bodyId:'serein',name:'Serein Observation Post',tileX:20,tileY:35,objectiveId:'log',
  summary:'A disputed water road needs a patient watch, not a prediction.',
  story:'A Freewake liaison meets your section at the old observation post. Meridian traffic has been passing all afternoon. Keep the radio staffed and the approach under observation until the watch is relieved. If a threat appears, secure the post before signing the watch log.',
  hostiles:[infantry('road','Armed roadblock guard',15,23,{damage:7}),infantry('flank','Flanking rifleman',31,10,{damage:7})],
  residents:[{id:'liaison',name:'Private Tavi Renn',role:'security',x:7,y:22,color:'#91b9ad',text:'Keep the watch even when nothing moves. That is how the water crews get a normal working day.',data:{fixedPost:true,militaryFactionId:'freewake',militaryBranchId:'army'}}],
  records:[record('briefing','Observation orders',6,23,'Remain inside the post for the full watch. Cover the road and the equipment room. When the duty window closes and the position is secure, sign the watch log.'),record('log','Section watch log',36,7,'The relief section acknowledges your report and takes over the post. Return to the landing for the service shuttle to Morrow.')]
 },
 {id:'service-condenser',missionId:'freewake-army-condenser',systemId:'meridian',bodyId:'serein',name:'Violet Condenser Annex',tileX:52,tileY:35,objectiveId:'relay',
  summary:'Restore a communal water control seized by an armed detail.',
  story:'A condenser crew has refused a new gate fee. An armed detail has locked the workers out of their own controls. Your orders are to clear the annex and restore the communal bypass. Leave the pipes and the civilian equipment intact.',
  hostiles:[infantry('gate','Private gate guard',15,23,{health:60,maxHealth:60,damage:7}),infantry('operator','Control-room guard',16,8,{health:60,maxHealth:60,damage:7}),infantry('rear','Annex rifleman',31,10,{health:60,maxHealth:60,damage:7})],
  records:[record('briefing','Condenser orders',6,23,'Clear the armed detail using the rooms as cover. Restore the communal bypass at the northeast console; the local crew will handle the pipes.'),record('relay','Communal bypass console',36,7,'Water pressure returns to the public branch. The crew takes responsibility for the plant and asks your section to leave the gate open. The return shuttle waits at the landing.')]
 },
 {id:'service-depot-watch',missionId:'freewake-army-depot-watch',systemId:'meridian',bodyId:'serein',name:'Serein Supply Depot',tileX:84,tileY:44,objectiveId:'log',
  summary:'Keep a relief depot secure while the loaders finish their shift.',
  story:'There is no confirmed attack report. There is a loading schedule, a tired radio operator, and a stack of relief crates that need to reach the road at dawn. Your section has the watch until the civilian foreman signs the load closed.',
  hostiles:[infantry('entry','Depot intruder',15,23,{health:60,maxHealth:60,damage:7}),infantry('yard','Yard rifleman',16,8,{damage:7}),infantry('rear','Rear-entry raider',31,10,{damage:7})],
  records:[record('briefing','Night orders',6,23,'Keep the depot occupied throughout the watch. If hostile contacts enter, clear the rooms before signing the load and watch log.'),record('log','Load and watch log',36,7,'The last crate is sealed and the civilian foreman releases your section. The relief convoy can leave. Return to the service shuttle at the landing.')]
 },
 {id:'service-refinery-rescue',missionId:'freewake-army-refinery-rescue',systemId:'sable',bodyId:'tallow',name:'Tallow Shift Shelter',tileX:22,tileY:35,objectiveId:'rescue',
  summary:'Get civilian refinery workers out of an armed checkpoint dispute.',
  story:'The shift shelter is caught between rival checkpoint crews. Two workers have stayed behind with an injured colleague’s records. Clear the shelter and signal a civilian evacuation rather than making them choose a flag.',
  hostiles:[infantry('entry','Checkpoint rifleman',15,23,{health:64,maxHealth:64,damage:8}),infantry('west','Private security rifleman',16,8,{health:64,maxHealth:64,damage:8}),infantry('east','Checkpoint leader',30,10,{health:88,maxHealth:88,damage:9}),infantry('rear','Rear sentry',35,23,{health:60,maxHealth:60,damage:8})],
  residents:[{id:'worker-one',name:'Shift engineer Mera Sol',role:'settler',x:34,y:5,color:'#b6c1a4',text:'We maintain the pumps. None of us signed up for this checkpoint.',data:{fixedPost:true,militaryCivilian:true}},{id:'worker-two',name:'Fitter Jun Vale',role:'settler',x:37,y:5,color:'#bba799',text:'The evacuation channel is open. Clear the shelter and call them.',data:{fixedPost:true,militaryCivilian:true}}],
  records:[record('briefing','Evacuation orders',6,23,'Clear the checkpoint crews from the shelter. The two civilian workers are in the northeast treatment room. Use their radio once the building is secure.'),record('rescue','Civilian evacuation radio',36,8,'The civilian shuttle takes the workers to a staffed clinic. Neither is entered as a military recruit. Your section can return to its own shuttle at the landing.')]
 },
 {id:'service-fuel-watch',missionId:'freewake-army-fuel-watch',systemId:'sable',bodyId:'tallow',name:'Tallow Fuel-Line Post',tileX:54,tileY:35,objectiveId:'log',
  summary:'Protect a maintenance window at the edge of the refinery.',
  story:'An engineer is replacing a pressure sensor beyond the perimeter. Your section holds the post while the maintenance crew works. The regular traffic is loud enough to hide an approaching vehicle. Wait for an actual contact report.',
  hostiles:[infantry('entry','Armed lane guard',15,23,{health:70,maxHealth:70,damage:8}),infantry('west','Refinery rifleman',16,8,{health:70,maxHealth:70,damage:8}),infantry('east','Flank patrol leader',31,10,{health:88,maxHealth:88,damage:9})],
  records:[record('briefing','Maintenance watch orders',6,23,'Keep the fuel-line post staffed through the entire repair window. Remain behind cover if contact is made. Sign the maintenance watch log after the position is secure.'),record('log','Maintenance watch log',36,7,'The engineer closes the pressure sensor housing and reports normal readings. Your section is relieved. Return to the landing for the Morrow shuttle.')]
 },
 {id:'service-switchyard',missionId:'freewake-army-switchyard',systemId:'sable',bodyId:'tallow',name:'Tallow Switchyard',tileX:86,tileY:44,objectiveId:'beacon',
  summary:'Open a civilian relief corridor across the contested refinery belt.',
  story:'The switchyard carries both military supplies and civilian medicine. Command has authorized a narrow operation: remove the armed blockade, transmit the relief route, and leave the local rail controls in civilian hands.',
  hostiles:[infantry('entry','Switchyard rifleman',15,23,{health:76,maxHealth:76,damage:8}),infantry('west','Checkpoint marksman',16,8,{health:76,maxHealth:76,damage:9}),infantry('east','Blockade leader',30,10,{health:108,maxHealth:108,armor:4,damage:10}),infantry('rear','Reserve rifleman',35,23,{health:70,maxHealth:70,damage:8})],
  records:[record('briefing','Corridor orders',6,23,'Use the switch rooms as cover. Clear the blockade and transmit the relief route from the northeast console. The track equipment is not a military prize.'),record('beacon','Relief route transmitter',36,7,'The first medical cars clear the switchyard. A civilian controller accepts the handover and confirms the corridor remains open. Your section has completed its orders.')]
 }
].map(site=>freeze({...site,systemId:site.systemId||'hearth',bodyId:site.bodyId||'morrow',kind:'military',military:true,cols:44,rows:32,atmosphere:site.training?'training':'military',hostile:!militaryMission(site.missionId)?.watch,monsterCount:site.hostiles.length,...(militaryMission(site.missionId)?.watch?{watch:militaryMission(site.missionId).watch}:{}),caches:[],choices:[]}));

export const MILITARY_GROUND_SITES=Object.freeze(sites);
export const militaryGroundSite=siteId=>sites.find(site=>site.id===siteId)||null;
export const militaryGroundSites=body=>sites.filter(site=>site.bodyId===body?.id);

/** A deployment is scoped to its actual assignment, not a caller-supplied room. */
export function militarySiteContext(game,bodyId,siteId,{allowPaused=false}={}){
 const candidate=militaryGroundSite(siteId),site=candidate?.bodyId===bodyId?candidate:null,career=game.state.militaryCareer,active=career?.active;
 if(!site)return null;
 if(game.state.systemId!==site.systemId||career?.factionId!=='freewake'||career.branchId!=='army'||!active||active.missionId!==site.missionId||!['active','debrief',...(allowPaused?['paused']:[])].includes(active.phase)||typeof active.operationId!=='string'||!/^[-a-zA-Z0-9_:]{1,240}$/.test(active.operationId))return{ok:false,reason:'Speak with the military recruiter on Morrow and take the matching Army assignment first.',code:'military-orders'};
 const base=`${bodyId}:site:${siteId}`,instanceId=`${base}:${active.operationId}`;
 return{ok:true,site,operationId:active.operationId,key:`${game.state.systemId}:${instanceId}`,instanceId};
}

export function militarySiteLocation(game,body,location,options){
 if(!location?.site?.military)return{ok:true,location,key:`${game.state.systemId}:${body.id}:${location.site.id}`};
 const context=militarySiteContext(game,body.id,location.site.id,options);if(!context?.ok)return context;
 return{...context,location:{...location,id:context.instanceId,site:{...location.site,key:context.instanceId,operationId:context.operationId}}};
}

/** Small authored cover layouts use the same collision grid as all person combat. */
export function militaryInterior(map,site,{rect,prop,label,point,TILE}){
 rect(map,3,3,map.cols-6,map.rows-6,TILE.FLOOR);
 rect(map,3,23,map.cols-6,3,TILE.PATH);map.spawn=point(6,25);map.exit=point(4,25);
 map.palette={...map.palette,floor:'#314448',floor2:'#2b3d43',path:'#566269',wall:'#223039',wallTop:'#7a8c8a',accent:'#9bb9ab'};
 label(map,'SURFACE ←',4,27,'#b7d0b4');
 if(site.training){
  for(const x of [14,22,30]){rect(map,x,15,5,1,TILE.WALL);prop(map,'cargo',x,18,1,1,'#81928a',true);}
  rect(map,10,20,29,1,TILE.PATH);
  label(map,'SERVICE RANGE / NO LIVE RETURN FIRE',11,4,'#c7d4bc');
  label(map,'MOVE / AIM / FIRE',15,21,'#c7cfbb');
  prop(map,'training-mat',11,19,28,2,'#708a83',false);
 }else{
  rect(map,22,3,1,14,TILE.WALL);rect(map,22,9,1,3,TILE.FLOOR);
  rect(map,10,17,26,1,TILE.WALL);rect(map,18,17,4,1,TILE.FLOOR);rect(map,29,17,4,1,TILE.FLOOR);
  for(const [x,y]of[[12,20],[19,12],[27,21],[33,15]])prop(map,'cargo',x,y,2,2,'#7b8e89',true);
  prop(map,'console',26,4,11,1,'#8caeac',true);
  label(map,site.watch?'SECTION POST / WATCH LOG':site.objectiveId==='rescue'?'CIVILIAN SHELTER / EVACUATION':site.objectiveId==='relay'?'FIELD CONTROL / COMMUNICATIONS':'RELIEF CORRIDOR / LANDING CONTROL',9,4,'#c9d4be');
  if(site.objectiveId==='rescue'){prop(map,'bed',34,3,1,2,'#b5c9bc',true);prop(map,'bed',37,3,1,2,'#b5c9bc',true);}
 }
 prop(map,'light',5,28,32,.3,'#c8c6a1',false);
}
