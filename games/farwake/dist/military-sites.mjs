/** Authored infantry deployments. Ordinary planetary expeditions keep their own records. */
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
 }
].map(site=>freeze({...site,kind:'military',military:true,cols:44,rows:32,atmosphere:site.training?'training':'military',hostile:true,monsterCount:site.hostiles.length,caches:[],choices:[]}));

export const MILITARY_GROUND_SITES=Object.freeze(sites);
export const militaryGroundSite=siteId=>sites.find(site=>site.id===siteId)||null;
export const militaryGroundSites=body=>body?.id==='morrow'?sites:[];

/** A deployment is scoped to its actual assignment, not a caller-supplied room. */
export function militarySiteContext(game,bodyId,siteId,{allowPaused=false}={}){
 const site=bodyId==='morrow'&&militaryGroundSite(siteId),career=game.state.militaryCareer,active=career?.active;
 if(!site)return null;
 if(game.state.systemId!=='hearth'||career?.factionId!=='freewake'||career.branchId!=='army'||!active||active.missionId!==site.missionId||!['active','debrief',...(allowPaused?['paused']:[])].includes(active.phase)||typeof active.operationId!=='string'||!/^[-a-zA-Z0-9_:]{1,240}$/.test(active.operationId))return{ok:false,reason:'Speak with the military recruiter on Morrow and take the matching Army assignment first.',code:'military-orders'};
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
  label(map,site.id==='service-rescue'?'AID POST / EVACUATION':site.id==='service-relay'?'RAINLINE / COMMUNICATIONS':'RAINLINE / LANDING CONTROL',9,4,'#c9d4be');
  if(site.id==='service-rescue'){prop(map,'bed',34,3,1,2,'#b5c9bc',true);prop(map,'bed',37,3,1,2,'#b5c9bc',true);}
 }
 prop(map,'light',5,28,32,.3,'#c8c6a1',false);
}
