/** Authored field expeditions. All decisions use physical objects and shared site state. */
import { isCabinWalkable } from './interior-layouts.mjs';

const T=24,point=(x,y)=>({x:(x+.5)*T,y:(y+.5)*T});
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const serial=value=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(finite(value))));
const ids=value=>[...new Set((Array.isArray(value)?value:[]).filter(id=>typeof id==='string'&&id.length>0&&id.length<=100))].slice(-128);
const fail=(reason,code='field')=>({ok:false,reason,message:reason,code});
const object=(id,name,x,y,text,extra={})=>({id,name,...point(x,y),text,...extra});
export const FIELD_SITE_ID='floodworks-6';
export const FIELD_TOOL_IDS=Object.freeze(['field_cutter','power_bridge']);
export const FOREMAN_BAY=Object.freeze({x:24*T,y:29*T,w:25*T,h:23*T});
export const FOREMAN_POSITION=Object.freeze(point(36,40));
export const FOREMAN_TIMING=Object.freeze({telegraph:1.5,sweep:1.25,recovery:3.5,damage:28});

const MAIN_OBJECTS=[
 object('workshop-cutter','Field cutter rack',11,43,'A reusable cutter opens damaged service panels. Take a tool from the cooperative rack; every crew member may carry one.',{tool:'field_cutter'}),
 object('workshop-bridge','Power bridge rack',15,43,'A portable bridge feeds isolated circuits from a safe supply. The tool stays with its user.',{tool:'power_bridge'}),
 object('service-panel','Welded service panel',12,30,'The gallery is blocked by a warped service panel. Its marked cutting seam is clear of the pressure line.'),
 object('pump-terminal','Drain pump terminal',34,21,'The pump is intact, but its feeder is dead. Bridge the supply here to drain the route into the machine bay.'),
 object('archive-panel','Archive service hatch',45,13,'A damaged hatch protects the maintenance archive. Drain the live feeder before cutting its seam.'),
 object('archive-terminal','Floodworks maintenance archive',66,8,'The records describe the Foreman’s two physical interlocks. Release them during its blue recovery window; each release stays latched.'),
 object('release-port','West interlock',27,34,'The orange lane warns where the sweep will travel. Step out of that lane, then release this interlock while the machine recovers.'),
 object('release-starboard','East interlock',45,47,'This interlock latches independently. One person can release both in separate recovery windows.'),
 object('shortcut-lever','Intake shortcut lever',25,44,'This lever opens a permanent passage back to the intake. It can be opened from this side without another tool.'),
 object('casualty-mara','Mara Venn · injured technician',65,44,'Mara has a splinted leg and needs stabilization before walking. Escort her slowly to the intake aid point.',{survivorId:'mara'}),
 object('casualty-ivo','Ivo Pell · archive keeper',65,18,'Ivo is conscious but shaken. Stabilize him, then stay close while he walks back to the intake.',{survivorId:'ivo'}),
 object('entry-aid','Intake aid point',7,38,'A staffed recovery point waits beside the open exit. Bring stabilized survivors here and complete their handover.')
];
const CONDENSER_OBJECTS=[
 object('workshop-cutter','Condenser field desk',6,18,'The condenser crew accepts field reports here. Bring the tools issued at Floodworks 6.'),
 object('entry-aid','Condenser aid point',7,16,'A sheltered meeting point beside the exit.'),
 object('service-panel','Jammed condenser access',12,11,'A warped access panel blocks the condenser floor. Its cutting seam is marked in white.'),
 object('pump-terminal','Condenser auxiliary feeder',22,17,'Bridge this feeder to restore the circulating pump and open the dry records bay.'),
 object('archive-terminal','Water-quality recorder',25,5,'The restored instrument records clean water reaching the outer settlement.')
];
const ARCHIVE_OBJECTS=[
 object('workshop-cutter','Library field desk',6,18,'The floating library receives field reports here. The power bridge from Floodworks fits its emergency sockets.'),
 object('entry-aid','Library aid point',7,16,'Bring the library keeper to this dry receiving point.'),
 object('pump-terminal','Library bilge feeder',11,10,'Bridge the bilge pump to drain the eastern reading room.'),
 object('archive-terminal','Tide ledger',24,5,'The ledger preserves a route through the libraries when the ordinary ferry channel closes.'),
 object('casualty-lin','Lin Saye · injured librarian',24,17,'Lin needs stabilization before crossing the drained passage. Walk together to the receiving point.',{survivorId:'lin'})
];
const definitions={
 orchard:{id:FIELD_SITE_ID,name:'Floodworks 6',kind:'fieldworks',cols:78,rows:56,tileX:59,tileY:64,fieldKind:'floodworks',atmosphere:'machinery',hostile:false,
  summary:'Six connected sections: intake, service gallery, pump room, machine bay, recovery ward and archive.',
  story:'The orchard floodworks stopped answering during a drainage test. Two workers remain inside. The old maintenance machine is still following a sweep order. Its marked interlocks can stop it safely.',
  objects:MAIN_OBJECTS,sections:['Intake workshop','Service gallery','Drain pump room','Foreman machine bay','Recovery ward','Maintenance archive'],
  caches:[],records:[],choices:[]},
 serein:{id:'condenser-annex',name:'West Condenser Annex',kind:'fieldworks',cols:32,rows:24,tileX:59,tileY:65,fieldKind:'condenser',atmosphere:'machinery',hostile:false,
  summary:'A damaged access panel and an isolated water circuit need the Floodworks tools.',story:'The outer condenser still holds water, but its maintenance route has been welded shut. A local crew will accept a verified repair report at the field desk.',objects:CONDENSER_OBJECTS,caches:[],records:[],choices:[]},
 lilt:{id:'archive-annex',name:'Tide Library Annex',kind:'fieldworks',cols:32,rows:24,tileX:59,tileY:65,fieldKind:'library',atmosphere:'signal',hostile:false,
  summary:'A flooded reading room contains a stranded librarian and an old tide ledger.',story:'A listing library has isolated its wet reading room. The portable power bridge can restart the bilge circuit. A keeper is waiting beyond the shallow flood.',objects:ARCHIVE_OBJECTS,caches:[],records:[],choices:[]}
};
for(const definition of Object.values(definitions)){
 for(const item of definition.objects)Object.freeze(item);
 Object.freeze(definition.objects);Object.freeze(definition);
}

/** These authored body IDs are all outside Hearth; ordinary worlds receive no new template. */
export function fieldSites(body={}){
 if(body.systemId==='hearth'||!definitions[body.id]||['station','ship','site','derelict'].includes(body.kind))return[];
 const site=definitions[body.id];return[{...site,bodyId:body.id,key:`${body.id}:site:${site.id}`,entrance:point(site.tileX,site.tileY)}];
}
export const isFieldSite=site=>site?.kind==='fieldworks'&&['floodworks','condenser','library'].includes(site.fieldKind);
const sourceObjects=site=>isFieldSite(site)?site.objects||[]:[];
const hasTool=(tools,id)=>tools instanceof Set?tools.has(id):Array.isArray(tools)?tools.includes(id):tools?.[id]===true||tools?.[id==='field_cutter'?'cutter':'powerBridge']===true;
const safePoint=(site,value,fallback)=>({x:clamp(finite(value?.x,fallback.x),T,site.cols*T-T),y:clamp(finite(value?.y,fallback.y),T,site.rows*T-T)});
const survivorObject=(site,id)=>sourceObjects(site).find(item=>item.survivorId===id);
const entryPosition=site=>sourceObjects(site).find(item=>item.id==='entry-aid')||point(6,16);
const inBay=person=>person&&person.x>=FOREMAN_BAY.x&&person.x<FOREMAN_BAY.x+FOREMAN_BAY.w&&person.y>=FOREMAN_BAY.y&&person.y<FOREMAN_BAY.y+FOREMAN_BAY.h;

export function normalizeFieldState(site,saved={}){
 if(!isFieldSite(site))return null;
 const raw=saved&&typeof saved==='object'?saved:{},main=site.fieldKind==='floodworks';
 const serviceCut=site.fieldKind==='library'||raw.serviceCut===true,powerBridged=raw.powerBridged===true&&serviceCut,drained=powerBridged;
 const releases={port:main&&drained&&raw.releases?.port===true,starboard:main&&drained&&raw.releases?.starboard===true};
 const disabled=releases.port&&releases.starboard,prior=raw.foreman||{},phase=disabled?'shutdown':['idle','telegraph','sweep','recovery'].includes(prior.phase)?prior.phase:'idle';
 const survivors={};
 for(const item of sourceObjects(site).filter(value=>value.survivorId)){
  const old=raw.survivors?.[item.survivorId]||{},status=['injured','stabilized','following','safe'].includes(old.status)?old.status:'injured';
  const escorted=typeof old.escortId==='string'&&old.escortId.length<=100?old.escortId:null;
  const settled=status==='safe'?{x:entryPosition(site).x+24+Object.keys(survivors).length*24,y:entryPosition(site).y}:safePoint(site,old,item);
  survivors[item.survivorId]={id:item.survivorId,name:item.name.split(' · ')[0],...settled,status:status==='following'&&!escorted?'stabilized':status,escortId:status==='following'?escorted:null,stabilizers:ids(old.stabilizers),escorts:ids(old.escorts),aftercare:ids(old.aftercare),travel:Object.fromEntries(Object.entries(old.travel||{}).filter(([id,value])=>typeof id==='string'&&id.length<=100&&Number.isFinite(value)&&value>=0).slice(-128).map(([id,value])=>[id,Math.min(value,100000)]))};
 }
 return{version:1,revision:serial(raw.revision),serviceCut,powerBridged,drained,archiveOpen:main?drained&&raw.archiveOpen===true:drained,archiveRead:raw.archiveRead===true&&(main?drained&&raw.archiveOpen===true:drained),shortcutOpen:main&&drained&&raw.shortcutOpen===true,releases,
  foreman:main?{phase,timer:clamp(finite(prior.timer),0,phase==='telegraph'?FOREMAN_TIMING.telegraph:phase==='sweep'?FOREMAN_TIMING.sweep:FOREMAN_TIMING.recovery),lane:prior.lane===1?1:0,serial:serial(prior.serial),attempt:serial(prior.attempt),disabled,participants:ids(prior.participants),hitIds:ids(prior.hitIds)}:null,survivors};
}
export function fieldObjectPosition(encounter,site,id){
 const item=sourceObjects(site).find(value=>value.id===id);if(!item)return null;
 const survivor=item.survivorId&&encounter?.field?.survivors?.[item.survivorId];
 return{...item,...(survivor?{x:survivor.x,y:survivor.y,survivorId:survivor.id,status:survivor.status}:{} )};
}
const evidence=(site,id,kind,extra={})=>({id:`${site.key}:${id}:${kind}`,kind,objectId:id,siteId:site.id,...extra});
const stateOf=(encounter,site)=>encounter?.field||normalizeFieldState(site);
const action=(id,label,enabled=true,reason=null)=>({id,label,enabled:!!enabled,...(!enabled?{reason}:{} )});
export function inspectFieldObject(encounter,site,id,{actorId='local',tools=[]}={}){
 const item=fieldObjectPosition(encounter,site,id);if(!item)return fail('That object is not part of this expedition.','target');
 const field=stateOf(encounter,site),main=site.fieldKind==='floodworks',actions=[action('inspect','Inspect')];let text=item.text;
 if(item.tool)actions.push(action('claim',hasTool(tools,item.tool)?'Check my issued tool':`Take ${item.tool==='field_cutter'?'field cutter':'power bridge'}`));
 if(id==='service-panel'){
  if(field.serviceCut)text=main?'The marked service seam has been cut. The gallery is open, and the cleared panel is ready for a repair check.':'The jammed access panel has been cut clear. The condenser floor is open, and the repair can be checked here.';
  actions.push(action('cut',field.serviceCut?'Verify the cleared service panel':'Cut the marked service seam',field.serviceCut||hasTool(tools,'field_cutter'),'Collect a field cutter from the intake workshop.'));
 }
 if(id==='pump-terminal'){
  if(field.powerBridged)text=main?'The bridged feeder is powering the pump. The machine-bay approach is drained and safe to cross.':site.fieldKind==='condenser'?'The auxiliary feeder is restored. The circulating pump is running, and the records bay is dry.':'The bilge feeder is restored. The eastern reading room is drained, and its crossing is open.';
  actions.push(action('bridge',field.powerBridged?'Verify the restored pump':'Bridge the auxiliary supply',field.powerBridged||field.serviceCut&&hasTool(tools,'power_bridge'),!field.serviceCut?'Open the marked service panel first.':'Collect a power bridge from the intake workshop.'));
 }
 if(id==='archive-panel'){
  if(field.archiveOpen)text='The archive hatch is open onto dry flooring. Its cleared seam is ready for a repair check.';
  else if(field.drained)text='The live feeder has been drained. The damaged archive hatch can now be opened by cutting its marked seam.';
  actions.push(action('cut',field.archiveOpen?'Verify the opened archive':'Cut the archive access seam',field.archiveOpen||field.drained&&hasTool(tools,'field_cutter'),!field.drained?'Drain the live feeder at the pump terminal first.':'A field cutter is required.'));
 }
 if(id==='archive-terminal'){
  if(field.archiveRead)text=main?'The maintenance record is preserved. It documents the Foreman’s two independent interlocks and blue recovery window.':'The record is preserved. '+(site.fieldKind==='condenser'?'Water-quality readings confirm that the restored circuit feeds the outer settlement.':'The tide ledger records an alternative ferry route through the libraries.');
  actions.push(action('read',field.archiveRead?'Review the recovered record':'Read and preserve the record',field.archiveOpen,'Restore access to the archive first.'));
 }
 if(id.startsWith('release-')){
  const key=id==='release-port'?'port':'starboard',done=field.releases[key],safe=field.foreman?.phase==='recovery';
  actions.push(action('release',done?'Verify the latched interlock':'Latch this interlock',done||safe,'Close this panel, stay outside the amber lane, and reopen it during the blue recovery window.'));
  text+=` ${Number(field.releases.port)+Number(field.releases.starboard)} of 2 interlocks latched. ${field.foreman?.disabled?'The machine is safely stopped.':safe?'Recovery window: this interlock can be released now.':'The machine will pause after each sweep.'}`;
 }
 if(id==='shortcut-lever'){
  if(field.shortcutOpen)text='The passage back to the intake is open. This permanent shortcut is available for the return escort.';
  actions.push(action('open',field.shortcutOpen?'Verify the intake shortcut':'Open the intake shortcut',field.drained,'Drain the machine-bay approach first.'));
 }
 if(item.survivorId){
  const survivor=field.survivors[item.survivorId],safe=survivor.status==='safe';
  text=safe?`${survivor.name} is at the aid point. A later crew can provide follow-up care; the original evacuation remains complete.`:item.text;
  if(survivor.status==='stabilized')text=`${survivor.name} is stable enough to walk and waiting for an escort. Ask them to follow, then stay close on the route to the aid point.`;
  else if(survivor.status==='following')text=survivor.escortId===actorId?`${survivor.name} is following you toward the aid point. Walk slowly and stay close; they will wait if you get too far ahead.`:`${survivor.name} is following another crew member toward the aid point. Stay close to assist, or take over the escort here.`;
  actions.push(action('stabilize',safe?'Provide follow-up care':survivor.status==='injured'?'Stabilize for walking':'Check the stabilization'));
  if(!safe)actions.push(action('escort',survivor.escortId===actorId?'Continue escorting':'Escort to the intake aid point',survivor.status!=='injured','Stabilize this person before asking them to walk.'));
 }
 if(id==='entry-aid'){
  const ready=Object.values(field.survivors).some(s=>s.status==='safe'&&(s.escorts.includes(actorId)||s.aftercare.includes(actorId)));
  actions.push(action('handover','Complete rescue or follow-up handover',ready,'Escort a stabilized person here, or provide follow-up care to someone already at the aid point.'));
 }
 return{ok:true,...item,text,actions};
}

export function performFieldObject(encounter,site,id,requested,{actorId='local',person,tools=[]}={}){
 if(!isFieldSite(site)||!encounter?.field)return fail('This expedition is not active.','site');
 if(!person||!Number.isFinite(person.health)||person.health<=0||person.down)return fail('You must be conscious and beside the object.','incapacitated');
 if(!Number.isFinite(person.x)||!Number.isFinite(person.y))return fail('Move beside the physical object first.','distance');
 const view=inspectFieldObject(encounter,site,id,{actorId,person,tools}),spec=view.actions?.find(value=>value.id===requested);
 if(!view.ok)return view;if(!spec)return fail('Choose an action offered by this object.','action');
 if(Math.hypot(person.x-view.x,person.y-view.y)>46)return fail('Move closer to this object first.','distance');
 if(!spec.enabled)return fail(spec.reason,'requirements');
 const field=encounter.field,changed=key=>{if(field[key])return false;field[key]=true;field.revision++;return true;};
 let text=view.text,kind=requested,extra={},geometryChanged=false;
 if(requested==='inspect')return{ok:true,text,evidence:evidence(site,id,'inspect')};
 if(requested==='claim')return{ok:true,text:hasTool(tools,view.tool)?'Your issued tool is ready.':'The cooperative issues you a reusable field tool.',grantTool:view.tool,evidence:evidence(site,id,'tool',{toolId:view.tool})};
 if(id==='service-panel'&&requested==='cut'){geometryChanged=changed('serviceCut');text=geometryChanged?'The service seam parts. The gallery is open.':'The cleared panel is sound. You verify the repair.';kind='cut';}
 else if(id==='pump-terminal'&&requested==='bridge'){
  geometryChanged=changed('powerBridged');if(geometryChanged){field.drained=true;if(site.fieldKind!=='floodworks')field.archiveOpen=true;}
  text=geometryChanged?'The pump catches. Water falls below the marked crossing; the route is now dry.':'You check the restored circuit. The pump is holding.';kind='power';
 }
 else if(id==='archive-panel'&&requested==='cut'){geometryChanged=changed('archiveOpen');text=geometryChanged?'The archive hatch opens onto dry flooring.':'The archive opening is secure.';kind='cut';}
 else if(id==='archive-terminal'&&requested==='read'){field.archiveRead=true;text=site.fieldKind==='floodworks'?'The archive identifies two independent interlocks. Wait for the Foreman’s sweep to end, latch each one, and its drive will stop. The records are preserved.':site.fieldKind==='condenser'?'Water-quality records confirm that the restored circuit is feeding the outer settlement.':'You preserve the tide ledger and its alternative ferry route.';kind='archive';}
 else if(id==='shortcut-lever'&&requested==='open'){geometryChanged=changed('shortcutOpen');text=geometryChanged?'The intake passage opens. This shortcut will stay available.':'The intake shortcut is still clear.';kind='shortcut';}
 else if(id.startsWith('release-')&&requested==='release'){
  const key=id==='release-port'?'port':'starboard';field.releases[key]=true;
  if(field.releases.port&&field.releases.starboard&&!field.foreman.disabled){field.foreman.disabled=true;field.foreman.phase='shutdown';field.foreman.timer=0;field.foreman.hitIds=[];field.revision++;geometryChanged=true;encounter.cleared=true;}
  text=field.foreman.disabled?'Both interlocks are latched. The Foreman winds down and the recovery ward opens.':'The interlock latches. It will stay released through another sweep or a retreat.';kind='release';
 }
 else if(view.survivorId&&requested==='stabilize'){
  const survivor=field.survivors[view.survivorId];extra.survivorId=survivor.id;
  if(survivor.status==='safe'){survivor.aftercare=ids([...survivor.aftercare,actorId]);kind='aftercare';text=`You check ${survivor.name} at the aid point and complete their follow-up care.`;}
  else{if(survivor.status==='injured')survivor.status='stabilized';survivor.stabilizers=ids([...survivor.stabilizers,actorId]);kind='stabilize';text=`${survivor.name} is stable enough to walk. Stay nearby during the escort.`;}
 }
 else if(view.survivorId&&requested==='escort'){
  const survivor=field.survivors[view.survivorId];survivor.status='following';survivor.escortId=actorId;kind='escort-start';extra.survivorId=survivor.id;text=`${survivor.name} will follow you. Walk slowly and use the marked route to the aid point.`;
 }
 else if(id==='entry-aid'&&requested==='handover'){
  const receipts=Object.values(field.survivors).filter(s=>s.status==='safe'&&(s.escorts.includes(actorId)||s.aftercare.includes(actorId))).map(s=>evidence(site,`casualty-${s.id}`,s.escorts.includes(actorId)?'rescue':'aftercare',{survivorId:s.id}));
  return{ok:true,text:'The aid team accepts your handover and records the care you actually provided.',evidence:receipts};
 }else return fail('That action does not apply here.','action');
 return{ok:true,text,geometryChanged,evidence:evidence(site,id,kind,extra)};
}

/** Pure view refresh keeps moving people current without rebuilding collision geometry. */
export function fieldSurfaceView(surface,encounter){
 if(!surface?.site||!isFieldSite(surface.site))return surface;
 const field=encounter?.field||surface.field;if(!field)return surface;
 const active={field},entities=surface.entities.map(entity=>{
  const id=entity.data?.fieldObjectId;if(!id)return entity;
  const object=fieldObjectPosition(active,surface.site,id);if(!object)return entity;
  return{...entity,x:object.x,y:object.y,...(object.survivorId?{name:`${field.survivors[object.survivorId].name} · ${object.status==='safe'?'at the aid point':object.status}`,data:{...entity.data,survivorId:object.survivorId,survivorStatus:object.status}}:{})};
 });
 return{...surface,field,entities};
}

export function resetFieldAttempt(encounter){
 const foreman=encounter?.field?.foreman;if(!foreman||foreman.disabled||foreman.phase==='idle')return false;
 foreman.phase='idle';foreman.timer=0;foreman.hitIds=[];foreman.attempt=serial(foreman.attempt)+1;return true;
}
const routes=new WeakMap();
function route(layout,from,to){
 const cell=p=>Math.floor(p.y/T)*layout.cols+Math.floor(p.x/T),start=cell(from),goal=cell(to),parent=new Int32Array(layout.walkable.length).fill(-1),queue=[start];
 if(!layout.walkable[start]||!layout.walkable[goal])return[];parent[start]=start;
 for(let n=0;n<queue.length&&parent[goal]<0;n++){
  const at=queue[n],x=at%layout.cols,y=Math.floor(at/layout.cols);
  for(const [xx,yy]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const next=yy*layout.cols+xx;if(xx<0||yy<0||xx>=layout.cols||yy>=layout.rows||!layout.walkable[next]||parent[next]>=0)continue;parent[next]=at;queue.push(next);}
 }
 if(parent[goal]<0)return[];const path=[];for(let next=goal;next!==start;next=parent[next])path.push(point(next%layout.cols,Math.floor(next/layout.cols)));return path.reverse();
}
function walkSurvivor(survivor,target,dt,layout,revision){
 const cell=p=>Math.floor(p.y/T)*layout.cols+Math.floor(p.x/T),key=`${cell(target)}:${revision}`;let cached=routes.get(survivor);
 if(!cached||cached.key!==key||!cached.path.length){cached={key,path:route(layout,survivor,target)};routes.set(survivor,cached);}
 while(cached.path.length&&Math.hypot(cached.path[0].x-survivor.x,cached.path[0].y-survivor.y)<5)cached.path.shift();
 const next=cached.path[0]||target,dx=next.x-survivor.x,dy=next.y-survivor.y,d=Math.hypot(dx,dy),step=Math.min(d,70*dt),x=survivor.x+(d?dx/d*step:0),y=survivor.y+(d?dy/d*step:0);
 if(!isCabinWalkable(layout,x,y,6))return 0;survivor.x=x;survivor.y=y;return step;
}
export function stepFieldEncounter(encounter,actors,dt,surface,event){
 const field=encounter.field,site=surface.site;if(!field||!isFieldSite(site))return;
 const foreman=field.foreman,living=actors.filter(actor=>actor.person?.health>0&&!actor.person.down),inside=living.filter(actor=>inBay(actor.person));
 if(foreman&&!foreman.disabled){
  if(!living.length)resetFieldAttempt(encounter);
  else if(foreman.phase==='idle'&&inside.length){foreman.phase='telegraph';foreman.timer=FOREMAN_TIMING.telegraph;foreman.serial++;foreman.hitIds=[];event('field-progress',{text:'Foreman: amber lane marked. Step out of the stripe; release an interlock when the machine turns blue.',fieldKind:'foreman',attempt:foreman.attempt,serial:foreman.serial});}
  else if(foreman.phase!=='idle'){
   foreman.participants=ids([...foreman.participants,...inside.map(actor=>actor.id)]);
   const previousTimer=foreman.timer;foreman.timer=Math.max(0,foreman.timer-dt);
   if(foreman.phase==='sweep'){
    const y=(foreman.lane===0?35.5:45.5)*T,progress=1-foreman.timer/FOREMAN_TIMING.sweep,x=(26+progress*20)*T,previousX=(26+(1-previousTimer/FOREMAN_TIMING.sweep)*20)*T;
    for(const actor of inside){
     if(foreman.hitIds.includes(actor.id)||Math.abs(actor.person.y-y)>28||actor.person.x<Math.min(previousX,x)-34||actor.person.x>Math.max(previousX,x)+34)continue;
     foreman.hitIds.push(actor.id);const damage=FOREMAN_TIMING.damage*clamp(finite(actor.damageTakenMultiplier,1),.4,2),person=actor.person;
     person.health=Math.max(0,person.health-damage);person.hitUntil=encounter.time+.24;
     const hit={id:`${encounter.id}:foreman:${foreman.attempt}:${foreman.serial}:${actor.id}`,team:'hostile',attackerId:`${encounter.id}:foreman`,actorName:'Foreman sweep',weaponId:'foreman-sweep',targetId:actor.id,targetName:actor.name||'Captain',x:person.x,y:person.y,to:{x:person.x,y:person.y},damage,health:person.health,maxHealth:person.maxHealth||100};event('person-hit',hit);
     if(person.health<=0){person.down=true;event('person-down',{...hit,id:hit.id+':down',text:'The maintenance sweep knocked you down.'});}
    }
   }
   if(foreman.timer<=0){
    if(foreman.phase==='telegraph'){foreman.phase='sweep';foreman.timer=FOREMAN_TIMING.sweep;}
    else if(foreman.phase==='sweep'){foreman.phase='recovery';foreman.timer=FOREMAN_TIMING.recovery;event('field-progress',{text:'Foreman drive cooling: interlocks are safe to release.',fieldKind:'foreman',serial:foreman.serial});}
    else{foreman.phase='telegraph';foreman.timer=FOREMAN_TIMING.telegraph;foreman.lane=1-foreman.lane;foreman.serial++;foreman.hitIds=[];}
   }
  }
 }
 for(const survivor of Object.values(field.survivors)){
  if(survivor.status!=='following')continue;
  const leader=living.find(actor=>actor.id===survivor.escortId);
  if(!leader){survivor.status='stabilized';survivor.escortId=null;routes.delete(survivor);continue;}
  const distance=Math.hypot(leader.person.x-survivor.x,leader.person.y-survivor.y);
  if(distance>340)continue;
  const moved=distance>28?walkSurvivor(survivor,leader.person,dt,surface.combatLayout,field.revision):0;
  if(moved>0){
   for(const helper of living.filter(actor=>Math.hypot(actor.person.x-survivor.x,actor.person.y-survivor.y)<=130)){
    survivor.travel[helper.id]=Math.min(100000,(survivor.travel[helper.id]||0)+moved);
    if(survivor.travel[helper.id]>=72)survivor.escorts=ids([...survivor.escorts,helper.id]);
   }
  }
  if(Math.hypot(survivor.x-entryPosition(site).x,survivor.y-entryPosition(site).y)<=62){
   survivor.status='safe';survivor.escortId=null;routes.delete(survivor);event('field-progress',{text:`${survivor.name} reached the aid point. Complete the handover with the receiving team.`,fieldKind:'rescue',survivorId:survivor.id});
  }
 }
}

/** Geometry is selected exclusively from persistent, validated field flags. */
export function buildFieldInterior(m,site,field,helpers){
 const {rect,prop,label,point:tilePoint,TILE}=helpers,main=site.fieldKind==='floodworks';
 m.field=field;m.fieldRevision=field.revision;m.atmosphere=site.atmosphere;
 m.palette={ground:'#122630',floor:'#31454b',floor2:'#2c4047',edge:'#718b8b',wall:'#1a3039',wallTop:'#77918e',path:'#7c7862',water:'#254f67',light:'#e1c788',accent:'#8abbb4'};
 if(main){
  const sections=[['INTAKE / FIELD WORKSHOP',3,29,18,23,'#537466'],['SERVICE GALLERY',3,3,18,23,'#6c7161'],['DRAIN PUMP ROOM',24,3,24,22,'#456e7c'],['FOREMAN / MACHINE BAY',24,29,25,23,'#86694d'],['RECOVERY WARD',53,29,22,23,'#527367'],['MAINTENANCE ARCHIVE',53,3,22,22,'#62677d']];
  m.rooms=sections.map(([name,x,y,w,h,color])=>({name,x,y,w,h,color}));
  for(const [name,x,y,w,h]of sections){rect(m,x,y,w,h,TILE.FLOOR);label(m,name,x+1,y+1,'#c2d0bb');}
  // The service gallery and its entry passage share one traversal cue.
  m.musicCorridors=[{x:3*T,y:3*T,w:18*T,h:23*T}];
  if(field.serviceCut)m.musicCorridors.push({x:10*T,y:25*T,w:5*T,h:6*T});
  rect(m,10,25,5,6,field.serviceCut?TILE.GRATE:TILE.WALL);
  rect(m,20,12,5,4,TILE.PATH);
  rect(m,32,24,5,7,field.drained?TILE.GRATE:TILE.WATER);
  rect(m,47,12,7,4,field.archiveOpen?TILE.GRATE:TILE.WALL);
  rect(m,48,40,6,5,field.foreman.disabled?TILE.PATH:TILE.WALL);
  rect(m,20,42,6,5,field.shortcutOpen?TILE.PATH:TILE.WALL);
  m.spawn=tilePoint(5,43);m.exit=tilePoint(3,43);
  label(m,'SURFACE ←',4,48,'#a9d1b4');label(m,'CUT SEAM ↑',10,32,'#dfbc80');label(m,field.drained?'DRY CROSSING ↓':'FLOODED / RESTORE PUMP',29,23,'#9fc6d1');
  label(m,'SAFE EDGE / WAIT FOR BLUE',26,31,'#a7c3d4');label(m,'AID POINT ←',27,49,'#a9d1b4');
  for(const x of[7,15]){prop(m,'equipment',x,7,2,4,'#6f8784',true);prop(m,'pipe',x,18,1,5,'#8a9b8e',false);}
  prop(m,'engine',27,6,3,6,'#6c8f98',true);prop(m,'engine',40,6,3,6,'#6c8f98',true);prop(m,'pipe',29,16,14,.5,'#a7ac8b',false);
  for(const x of[56,62,69])prop(m,'books',x,5,1,8,'#9b9b80',true);
  for(const y of[34,40,47])prop(m,'bed',57,y,2,3,'#a7baaf',true);
  prop(m,'table',12,34,5,2,'#9b8b69',true);prop(m,'cabinet',17,47,2,3,'#7b9995',true);
  prop(m,'roomstripe',26,35,21,.2,'#c59a5f',false);prop(m,'roomstripe',26,45,21,.2,'#c59a5f',false);
 }else{
  rect(m,3,3,10,18,TILE.FLOOR);rect(m,16,3,13,18,TILE.FLOOR);m.spawn=tilePoint(5,16);m.exit=tilePoint(3,16);
  if(site.fieldKind==='condenser'){
   rect(m,12,10,5,4,field.serviceCut?TILE.GRATE:TILE.WALL);rect(m,16,10,13,2,field.drained?TILE.GRATE:TILE.WATER);
   label(m,'WEST CONDENSER',4,4,'#d5c49d');prop(m,'engine',19,14,2,5,'#87948b',true);prop(m,'pipe',27,12,.5,8,'#c5b98c',false);
  }else{
   rect(m,12,10,5,4,field.drained?TILE.GRATE:TILE.WATER);label(m,'TIDE LIBRARY',4,4,'#b7cdd2');
   prop(m,'books',18,4,1,5,'#9999ad',true);prop(m,'books',27,11,1,8,'#9999ad',true);
  }
  prop(m,'table',5,6,4,2,'#a18c69',true);label(m,'SURFACE ←',4,21,'#b9d1b4');
 }
}
