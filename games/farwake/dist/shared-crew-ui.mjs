/** Shared ships, invitations, and returning aboard share one small crew panel. */
import { getShipClass } from './fleet.mjs';
import { FACTIONS } from './content.mjs';
import { getBoardingAction, getDisembarkAction, getHelmAction } from './perspective-controls.mjs';
import { crewAwareness, publicCrewLocation } from './crew-awareness.mjs';
import { flowGuidanceLevel, guidanceFlowMarkup } from './guidance-flows.mjs';

const SERVICE_ROLES = ['weapons', 'engineering', 'scanner', 'navigation', 'medical', 'security'];
const GENERAL_SERVICE_ROLES = ['weapons', 'engineering', 'scanner', 'medical', 'security'];
const stateOf = game => game?.state || {};
const portOf = game => {
 const state=stateOf(game);
 return state.exploration?.bodyId || state.interior?.returnLocation || state.locationId;
};
const intact = vessel => !!vessel && !vessel.destroyed && !(vessel.hull<=0);
const isOwner = (game,vessel) => vessel?.ownerId===stateOf(game).multiplayer?.captainId && !vessel?.npcContractId;
const militaryText=person=>{const service=person.military;if(!service?.rank)return '';const faction=FACTIONS.find(faction=>faction.id===service.factionId)?.name||service.factionId||'',branch={army:'Army',navy:'Navy'}[service.branchId]||'service',role={leader:'Operation leader',commander:'Operation leader',gunner:'Gunner',infantry:'Infantry',crew:'Assigned crew'}[service.role]||service.role;return`${faction} ${branch} · ${service.rank}${role?' · '+role:''}`;};

/** A remembered port carrier is useful only while it is actually at this port. */
export function selectedCrewVessel(game,snapshot={}) {
 const state=stateOf(game),mp=state.multiplayer||{},fleet=snapshot.fleet||[];
 const aboard=fleet.find(vessel=>vessel.id===mp.aboardVesselId);
 if(aboard)return aboard;
 const arriving=fleet.find(vessel=>vessel.id===mp.portVesselId);
 if(intact(arriving)&&arriving.systemId===state.systemId&&arriving.dockedAt===portOf(game)&&arriving.canBoard!==false)return arriving;
 return fleet.find(vessel=>vessel.id===mp.ownedVesselId)||null;
}

/** Keep a narrow permission change from silently replacing other permissions. */
export function crewAccessChange(vessel,captainId,control) {
 const grant=vessel.grants?.[captainId],allowed=grant?grant.allowed===true:vessel.allowCrew===true;
 const roles=[...new Set(Array.isArray(grant?.roles)?grant.roles:vessel.allowCrew?GENERAL_SERVICE_ROLES:SERVICE_ROLES)];
 const allowBunk=grant?grant.allowBunk===true:vessel.allowCrew===true;
 if(control==='invite')return {vesselId:vessel.id,captainId,allowed:true,roles:allowed?roles:roles.filter(role=>role!=='helm'),allowBunk};
 if(control==='boarding')return {vesselId:vessel.id,captainId,allowed:!allowed,roles:roles.filter(role=>role!=='helm'),allowBunk};
 if(control==='helm')return {vesselId:vessel.id,captainId,allowed,roles:roles.includes('helm')?roles.filter(role=>role!=='helm'):[...roles,'helm'],allowBunk};
 if(control==='bunk')return {vesselId:vessel.id,captainId,allowed,roles,allowBunk:!allowBunk};
 throw new RangeError('Unknown crew permission.');
}

export function createSharedCrewUI({getGame,getSnapshot,getNetwork,getGuidance=()=> 'simple',dialog,invoke,acceptResult,runDeckAction,disembark,openHome,openPassport,openContact,openCrewDuty,openMilitary,walkDeck,disconnect,toast}) {
 let renderRevision=0,permissionPending=false,activeView=null;
 const game=()=>getGame(),snapshot=()=>getSnapshot()||{},network=()=>getNetwork();
 const guidance=()=>flowGuidanceLevel(getGuidance());
 const connected=()=>network()?.connected===true;
 const context=()=>({game:game(),network:network(),captainId:stateOf(game()).multiplayer?.captainId,revision:renderRevision,root:dialog.body.children[0]});
 const currentContext=value=>game()===value.game&&network()===value.network&&stateOf(game()).multiplayer?.captainId===value.captainId&&renderRevision===value.revision&&dialog.opened&&dialog.body.children[0]===value.root;
 const element=(tag,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
 const append=(parent,tag,className,text)=>{const node=element(tag,className,text);parent.append(node);return node;};
 function button(parent,label,onClick,{primary=false,disabled=false,reason='',pressed,control}={}) {
  const node=append(parent,'button',primary?'button-primary':'button-secondary',label);node.type='button';node.disabled=disabled;
  if(reason)node.title=reason;
  if(pressed!==undefined)node.setAttribute('aria-pressed',String(pressed));
  if(control)node.dataset.crewControl=control;
  const owner=context();node.onclick=(...args)=>{if(!node.disabled&&currentContext(owner))return onClick(...args);};return node;
 }
 function bodyName(systemId,bodyId) {
  if(!bodyId)return '';
  return game().galaxy?.find(system=>system.id===systemId)?.bodies?.find(body=>body.id===bodyId)?.name||bodyId;
 }
 function locationText(vessel) {
  if(vessel.destroyed||vessel.hull<=0)return 'Hull lost';
  const mp=stateOf(game()).multiplayer||{},dockedAt=mp.aboardVesselId===vessel.id&&Object.hasOwn(mp,'dockedAt')?mp.dockedAt:vessel.dockedAt;
  if(dockedAt)return `Docked at ${bodyName(vessel.systemId,dockedAt)}`;
  const system=game().galaxy?.find(system=>system.id===vessel.systemId);
  return `In flight · ${system?.name||vessel.systemId}`;
 }
 function pilotName(vessel) {
  if(!vessel.helmOwner)return 'No one';
  return vessel.helmName||snapshot().presence?.find(person=>person.captainId===vessel.helmOwner)?.name||'Another captain';
 }
 function begin(title,kind,eyebrow) {
  renderRevision++;dialog.open(title,kind,{eyebrow});const root=append(dialog.body,'div','shared-crew');
  if(!connected())append(root,'p','shared-crew-connection','Reconnecting. Ship actions will return when your captain is connected.');
  return root;
 }
 function repaint(open,control) {
  const top=dialog.body.scrollTop,details=new Map([...(dialog.body.querySelectorAll?.('details')||[])].map(node=>[node.children[0]?.textContent.split(' · ')[0],node.open===true]));
  open();dialog.body.scrollTop=top;
  for(const node of dialog.body.querySelectorAll?.('details')||[]){const key=node.children[0]?.textContent.split(' · ')[0];if(details.has(key))node.open=details.get(key);}
  const focus=[...(dialog.body.querySelectorAll?.('[data-crew-control]')||[])].find(node=>node.dataset.crewControl===control);
  focus?.focus?.({preventScroll:true});
 }
 function presenceSignature() {
  const state=stateOf(game()),snap=snapshot(),mp=state.multiplayer||{},fleet=snap.fleet||[];
  return JSON.stringify({guidance:guidance(),connected:connected(),realm:snap.realm,place:[state.mode,state.systemId,state.locationId,state.interior?.kind,state.exploration?.bodyId,state.npcContract?.active,state.person?.down,state.person?.health<=0],mp:[mp.captainId,mp.ownedVesselId,mp.aboardVesselId,mp.portVesselId,mp.dockedAt,mp.dockedName,mp.returnVesselId,mp.canReturn],
   people:(snap.presence||[]).map(({captainId,name,online,systemId,locationId,roomKind,roomId,vesselId,crewRole,military})=>({captainId,name,online,systemId,locationId,roomKind,roomId,vesselId,crewRole,military})),
   fleet:fleet.map(vessel=>({id:vessel.id,name:vessel.name,ownerId:vessel.ownerId,ownerName:vessel.ownerName,systemId:vessel.systemId,dockedAt:vessel.dockedAt,allowCrew:vessel.allowCrew,grants:vessel.grants,grantedRoles:vessel.grantedRoles,canBoard:vessel.canBoard,canPilot:vessel.canPilot,helmOwner:vessel.helmOwner,helmName:vessel.helmName,helmOccupied:vessel.helmOccupied,berths:vessel.berths,occupants:vessel.occupants,availableBerths:vessel.availableBerths,occupiedBerths:vessel.occupiedBerths,crewAshore:vessel.crewAshore,destroyed:!intact(vessel),npcContractId:vessel.npcContractId,boarding:getBoardingAction(game(),vessel,{fleet,connected:connected()}).reason})),
   exit:getDisembarkAction(game(),{shared:true,connected:connected(),fleet})?.reason,helm:getHelmAction(game(),{shared:true,connected:connected(),fleet}).reason});
 }
 function rememberView(open,root){activeView={open,root,owner:context(),signature:presenceSignature()};}
 function refresh() {
  if(permissionPending||!activeView||!currentContext(activeView.owner)||!['online','sharedship','port-ships'].includes(dialog.kind)||dialog.body.children[0]!==activeView.root)return false;
  const signature=presenceSignature();if(signature===activeView.signature)return false;
  const scroll=dialog.body.scrollTop,details=new Map([...(dialog.body.querySelectorAll?.('details')||[])].map(node=>[node.children[0]?.textContent.split(' · ')[0],node.open===true]));
  const focus=document.activeElement?.dataset?.crewControl,open=activeView.open;open();
  for(const node of dialog.body.querySelectorAll?.('details')||[]){const key=node.children[0]?.textContent.split(' · ')[0];if(details.has(key))node.open=details.get(key);}
  dialog.body.scrollTop=scroll;
  if(focus)[...(dialog.body.querySelectorAll?.('[data-crew-control]')||[])].find(node=>node.dataset.crewControl===focus)?.focus?.({preventScroll:true});
  return true;
 }
 async function changeAccess(vesselId,captainId,control,refresh) {
  if(permissionPending||!connected()||stateOf(game()).npcContract?.active)return;
  const vessel=snapshot().fleet?.find(value=>value.id===vesselId);
  if(!vessel||!isOwner(game(),vessel)||!snapshot().presence?.some(person=>person.captainId===captainId))return;
  const payload=crewAccessChange(vessel,captainId,control);
  if(control!=='boarding'&&!payload.allowed)return;
  const owner=context();permissionPending=true;
  for(const node of dialog.body.querySelectorAll?.('[data-crew-control]')||[])node.disabled=true;
  try {
   const response=await invoke('setCrewAccess',payload);
   if(currentContext(owner))acceptResult(response);
  } finally {
   permissionPending=false;
   if(currentContext(owner))repaint(refresh,`${vesselId}:${captainId}:${control}`);
  }
 }
 function boardVessel(vesselId) {
  const vessel=snapshot().fleet?.find(ship=>ship.id===vesselId),board=getBoardingAction(game(),vessel,{fleet:snapshot().fleet||[],connected:connected()});
  if(!board.enabled){toast?.(board.reason);return;}
  return runDeckAction('boardShip',{vesselId});
 }
 function shipCard(parent,vessel,{compact=false}={}) {
  const g=game(),mp=stateOf(g).multiplayer||{},aboard=mp.aboardVesselId===vessel.id,hiredDuty=!!(vessel.npcContractId&&stateOf(g).npcContract?.active);
  const card=append(parent,'section','shared-ship-card');
  const heading=append(card,'div','shared-ship-heading');
  append(heading,'h3','',vessel.name||getShipClass(vessel.classId).name);
  append(heading,'span','shared-ship-relation',isOwner(g,vessel)?'YOUR SHIP':aboard?stateOf(g).interior?.kind==='eva'?'YOU ARE OUTSIDE':'YOU ARE ABOARD':mp.portVesselId===vessel.id?'YOUR ARRIVING SHIP':`${vessel.ownerName||'Another captain'}’s ship`);
  append(card,'p','shared-ship-location',locationText(vessel));
  const facts=append(card,'div','shared-ship-facts');
  append(facts,'span','',`At helm: ${pilotName(vessel)}`);
  append(facts,'span','',Number.isFinite(vessel.occupiedBerths)?`${vessel.occupiedBerths} / ${vessel.berths} berths in use`:`${vessel.occupants??0} aboard · ${vessel.berths} berths`);
  if(vessel.crewAshore?.length)append(card,'p','shared-crew-ashore',`Still ashore: ${vessel.crewAshore.map(person=>person.name).join(', ')}`);
  const actions=append(card,'div','shared-crew-actions');
  if(hiredDuty) {
   if(openCrewDuty)button(actions,'Crew duty',openCrewDuty,{primary:true});
   append(card,'p','shared-crew-explanation','Use Crew duty to complete your watch or request an early return.');
  }else if(aboard&&stateOf(g).mode==='ship')button(actions,'Walk the deck',walkDeck,{primary:true,disabled:!connected()});
  else if(aboard) {
   const helm=getHelmAction(g,{shared:true,connected:connected(),fleet:snapshot().fleet||[]});
   if(helm.command==='quickHelm') {
    const permissionOnly=!helm.enabled&&helm.reason==='The owner has not granted you helm access. They can turn on Allow piloting in CREW.';
    if(permissionOnly){
     const access=append(card,'details','shared-crew-options');append(access,'summary','','Helm access');
     append(access,'p','shared-crew-explanation',`Ask ${vessel.ownerName||'the owner'} to enable Allow piloting under Ship permissions.`);
    }else{
     button(actions,helm.label,()=>runDeckAction('quickHelm'),{primary:true,disabled:!helm.enabled,reason:helm.reason});
     if(!helm.enabled)append(card,'p','shared-crew-explanation',helm.reason);
    }
   }
  } else {
   const board=getBoardingAction(g,vessel,{fleet:snapshot().fleet||[],connected:connected()});
   button(actions,`Board ${vessel.name||'ship'}`,()=>boardVessel(vessel.id),{primary:true,disabled:!board.enabled,reason:board.reason});
   if(!board.enabled||guidance()!=='expert')append(card,'p','shared-crew-explanation',board.enabled?(guidance()==='moderate'?'Boarding does not launch the ship.':vessel.dockedAt?'Step aboard the deck. The ship stays docked until someone launches.':'Cross to this ship’s crew deck. Your own ship stays where you leave it.'):board.reason);
  }
  const exit=aboard?getDisembarkAction(g,{shared:true,connected:connected(),fleet:snapshot().fleet||[]}):null;
  if(exit){
   button(actions,exit.label,()=>disembark?disembark():exit.enabled?runDeckAction('disembark'):toast?.(exit.reason),{primary:true,disabled:!connected(),reason:exit.reason||exit.detail});
   append(card,'p','shared-crew-explanation',exit.reason||exit.detail);
  }
  if(!compact&&openContact&&!hiredDuty)button(actions,'Ship details',()=>openContact(vessel.id));
  return card;
 }
 function permissionCards(parent,vessel,refresh) {
  if(!isOwner(game(),vessel))return;
  const mp=stateOf(game()).multiplayer||{},people=(snapshot().presence||[]).filter(person=>person.captainId!==mp.captainId),working=!!stateOf(game()).npcContract?.active;
  const section=append(parent,'section','shared-crew-permissions');append(section,'h3','',`Who can board ${vessel.name||'your ship'}?`);
  if(guidance()!=='expert')append(section,'p','shared-crew-explanation','Allow a friend aboard, then choose separately whether they may pilot.');
  if(working)append(section,'p','shared-crew-explanation','Complete your current paid watch before changing ship permissions.');
  if(!people.length)append(section,'p','shared-crew-explanation','When your friend joins this galaxy, their boarding controls appear here.');
  for(const person of people) {
   const grant=vessel.grants?.[person.captainId],allowed=grant?grant.allowed===true:vessel.allowCrew===true,helm=allowed&&grant?.roles?.includes('helm');
   const row=append(section,'article','shared-captain-card'),heading=append(row,'div','shared-captain-heading');
   append(heading,'strong','',person.name);append(heading,'span','shared-captain-presence',person.online?'Online':'Away');
   append(row,'p','shared-captain-location',captainLocation(person,vessel));
   if(militaryText(person))append(row,'p','shared-captain-location',militaryText(person));
   const controls=append(row,'div','shared-permission-controls');
   for(const [control,label,on] of [['boarding','Allow aboard',allowed],['helm','Allow piloting',!!helm]]) {
    const key=`${vessel.id}:${person.captainId}:${control}`;
    const node=button(controls,label,()=>changeAccess(vessel.id,person.captainId,control,refresh),{disabled:!connected()||working||control==='helm'&&!allowed,pressed:on,control:key});
    node.setAttribute('aria-label',`${label} · ${person.name}`);
   }
  }
  const extra=append(section,'details','shared-crew-options');append(extra,'summary','','More access options');
  append(extra,'p','shared-crew-explanation','Crew can use working stations. Piloting and a home bunk use their own permissions.');
  const general=button(extra,'Allow everyone in this galaxy aboard',async()=>{
   if(permissionPending||!connected()||stateOf(game()).npcContract?.active)return;
   const current=snapshot().fleet?.find(value=>value.id===vessel.id);if(!current||!isOwner(game(),current))return;
   permissionPending=true;const owner=context();
   try{const response=await invoke('setCrewAccess',{vesselId:vessel.id,allowed:!current.allowCrew});if(currentContext(owner)&&acceptResult(response))refresh();}finally{permissionPending=false;}
  },{pressed:vessel.allowCrew===true,disabled:!connected()||working});general.setAttribute('aria-label','Allow everyone in this galaxy aboard');
  append(extra,'p','shared-crew-explanation','Individual boarding choices still apply. Everyone still needs a free berth.');
  for(const person of people) {
   const grant=vessel.grants?.[person.captainId],allowed=grant?grant.allowed===true:vessel.allowCrew===true,bunk=allowed&&(grant?grant.allowBunk===true:vessel.allowCrew===true);
   button(extra,`Home bunk · ${person.name}`,()=>changeAccess(vessel.id,person.captainId,'bunk',refresh),{pressed:bunk,disabled:!connected()||working||!allowed,control:`${vessel.id}:${person.captainId}:bunk`});
  }
 }
 function captainLocation(person,vessel) {
  if(person.vesselId===vessel?.id&&(person.captainId===stateOf(game()).multiplayer?.captainId?stateOf(game()).interior?.kind==='eva':publicCrewLocation(game(),person,snapshot().fleet||[]).roomKind==='eva'))return 'Outside on a hull walk';
  if(person.vesselId===vessel?.id)return vessel.helmOwner===person.captainId?'At the helm':person.online?'Aboard this ship':'Resting aboard';
  if(vessel?.crewAshore?.some(other=>other.captainId===person.captainId))return `Ashore at ${bodyName(vessel.systemId,vessel.dockedAt)}`;
  const other=snapshot().fleet?.find(ship=>ship.id===person.vesselId);
  if(other)return other.ownerId===person.captainId?`Aboard their ship · ${other.name||'unnamed vessel'}`:`Aboard ${other.name||'another ship'} · ${other.ownerName||'another captain'}`;
  return publicCrewLocation(game(),person,snapshot().fleet||[]).text;
 }
 function crewRoster(parent,vessel) {
  const people=(snapshot().presence||[]).filter(person=>person.vesselId===vessel.id);
  if(!people.length)return;
  const section=append(parent,'section','shared-crew-roster');append(section,'h3','','Ship crew');
  for(const person of people) {
   const row=append(section,'div','shared-roster-row');append(row,'strong','',person.name);append(row,'span','',captainLocation(person,vessel));
   if(militaryText(person))append(row,'span','shared-captain-location',militaryText(person));
  }
 }
 function localPortShips() {
  const g=game(),state=stateOf(g),mp=state.multiplayer||{},aboard=snapshot().fleet?.find(v=>v.id===mp.aboardVesselId),port=mp.aboardVesselId&&Object.hasOwn(mp,'dockedAt')?mp.dockedAt:aboard?.dockedAt||portOf(g);
  if(!port)return [];
  return (snapshot().fleet||[]).filter(vessel=>vessel.systemId===state.systemId&&vessel.dockedAt===port&&intact(vessel)&&!vessel.hostile&&!vessel.npcContractId);
 }
 /** Both captains see the same suggested ship; this never forms a crew by itself. */
 function meetingVessel(friend) {
  const snap=snapshot(),mp=stateOf(game()).multiplayer||{},fleet=snap.fleet||[],ids=[mp.captainId,friend.captainId];
  const pair=(snap.presence||[]).filter(person=>ids.includes(person.captainId)).map(person=>person.captainId===mp.captainId?{...person,vesselId:mp.aboardVesselId}:person);
  if(!pair.some(person=>person.captainId===mp.captainId))pair.unshift({captainId:mp.captainId,vesselId:mp.aboardVesselId});
  const occupied=[...new Set(pair.map(person=>person.vesselId).filter(Boolean))].map(id=>fleet.find(vessel=>vessel.id===id)).filter(intact);
  const shared=occupied.find(vessel=>pair.every(person=>person.vesselId===vessel.id));if(shared)return shared;
  const military=occupied.find(vessel=>vessel.npcContractId);if(military)return military;
  const friendly=vessel=>intact(vessel)&&!vessel.npcContractId&&!vessel.hostile&&!vessel.occupation?.contested;
  const aboard=occupied.filter(friendly);if(aboard.length)return aboard[0];
  const owned=pair.map(person=>fleet.find(vessel=>vessel.ownerId===person.captainId&&friendly(vessel))).filter(Boolean);
  if(friend.samePort){const local=owned.find(vessel=>vessel.systemId===stateOf(game()).systemId&&vessel.dockedAt===friend.location.bodyId);if(local)return local;}
  return owned[0]||null;
 }
 function boardWithFriend(captainId,vesselId) {
  const friend=crewAwareness(game(),snapshot()).friends.find(person=>person.captainId===captainId);
  if(!friend?.online||meetingVessel(friend)?.id!==vesselId){toast?.('Your friend’s location changed. Review the updated meeting ship.');openHub();return;}
  return boardVessel(vesselId);
 }
 function friendGuide(parent,friend,awareness,{expanded=false}={}) {
  const g=game(),s=stateOf(g),mp=s.multiplayer||{},vessel=meetingVessel(friend),level=guidance();
  if(vessel?.npcContractId){
   const military=[friend.military?.operationId,awareness.localMilitary?.operationId].some(id=>id&&id===vessel.npcContractId);
   const guide=append(parent,'div','guidance-flow-container');
   guide.innerHTML=guidanceFlowMarkup({id:'crew-service',title:military?'How to share this deployment':'About paid crew assignments',level,expanded,
    next:military?'Use Serve together to review the exact deployment roster.':'Meet your friend after this paid watch returns to port.',
    notes:military?['Each captain enlists personally and joins the same muster before departure. Boarding a civilian ship together does not add anyone to a military unit.','Your own rank determines your station access. The operation leader authorizes departure; an NPC commander flies the Navy carrier.']:['An NPC paid watch is an individual job. It does not invite another captain or enlist them in the military.','Once the watch returns, meet at the same port and board one civilian ship.']});
   return;
  }
  const localAboard=!!vessel&&mp.aboardVesselId===vessel.id,remoteAboard=!!vessel&&friend.vesselId===vessel.id;
  const localAtPort=!!vessel?.dockedAt&&s.systemId===vessel.systemId&&(localAboard||s.mode==='person'&&!s.interior&&!s.exploration&&s.locationId===vessel.dockedAt);
  const friendAtPort=!!vessel?.dockedAt&&friend.location.systemId===vessel.systemId&&(remoteAboard||friend.location.roomKind==='surface'&&friend.location.bodyId===vessel.dockedAt);
  const grant=vessel?.grants?.[friend.captainId],allowed=vessel?isOwner(g,vessel)?grant?grant.allowed===true:vessel.allowCrew===true:vessel.canBoard===true:false;
  const shipName=vessel?.name||'one ship',portName=vessel?.dockedAt?bodyName(vessel.systemId,vessel.dockedAt):null;
  const together=friend.aboardTogether;
  const board=vessel&&!localAboard?getBoardingAction(g,vessel,{fleet:snapshot().fleet||[],connected:connected()}):null;
  const boardInstruction=board&&!board.enabled&&allowed&&localAtPort&&friendAtPort?`${board.reason} Board when that is resolved.`:`Each captain still ashore chooses Board ${shipName}. Check that both names say Same ship.`;
  const steps=[
   {text:portName?`Meet at ${portName}, where ${shipName} is docked.`:vessel?`Rendezvous with ${shipName}; check the boarding action for range and access.`:'Meet at the same port and choose one ship.',done:together||localAtPort&&friendAtPort},
   {text:vessel&&isOwner(g,vessel)?`Allow ${friend.name} aboard ${shipName}. This grants boarding access, not piloting.`:`Ask ${vessel?.ownerName||'the owner'} for boarding access to ${shipName}.`,done:together||allowed},
   {text:friend.sameVessel&&!together?'Return inside through the airlock so you are both on the deck.':boardInstruction,done:together}
  ];
  const next=together?'You are aboard together. Choose your stations; the pilot can launch when everyone is ready.':steps.find(step=>!step.done)?.text;
  const guide=append(parent,'div','guidance-flow-container');
  guide.innerHTML=guidanceFlowMarkup({id:'crew-boarding',title:'Board together, step by step',level,expanded,steps,next,
   notes:['Boarding and launching are separate. Wait for your friend before departing; Allow piloting is a separate permission.','At a docked port, use Disembark and the entry airlock to go ashore. You do not need Helm permission.','For military service together, use Serve together and join the same deployment roster. Your rank remains your own.']});
 }
 function friendCard(parent,friend,awareness,{expanded=false}={}) {
  const card=append(parent,'article','shared-friend-card'),heading=append(card,'div','shared-captain-heading');
  append(heading,'strong','',friend.name);append(heading,'span','shared-friend-relation',friend.relation);
  append(card,'p','shared-friend-location',friend.location.text);
  if(friend.sameVessel)append(card,'p','shared-together-status',friend.aboardTogether?(friend.sameOperation?'Same crew · Same deployment':'Aboard together'):awareness.localOutside?'Same crew · You are outside on a hull walk':`Same crew · ${friend.name} is outside on a hull walk`);
  else if(friend.sameOperation)append(card,'p','shared-together-status','Same deployment · Meet at your assigned ship or muster point');
  if(militaryText(friend))append(card,'p','shared-captain-location',militaryText(friend));
  const actions=element('div','shared-friend-actions');
  if(!friend.sameVessel){
   const vessel=meetingVessel(friend),mp=stateOf(game()).multiplayer||{},working=!!stateOf(game()).npcContract?.active;
   if(vessel&&!vessel.npcContractId){
    const grant=vessel.grants?.[friend.captainId],allowed=grant?grant.allowed===true:vessel.allowCrew===true;
    append(card,'p','shared-meeting-plan',`Meet aboard ${vessel.name||'the ship'} · ${locationText(vessel)}`);
    if(isOwner(game(),vessel)&&!allowed){
     const key=`${vessel.id}:${friend.captainId}:invite`;
     button(actions,`Allow ${friend.name} aboard`,()=>changeAccess(vessel.id,friend.captainId,'invite',openHub),{primary:true,disabled:!connected()||working,reason:working?'Complete your current paid watch before changing ship permissions.':'Boarding access only. Piloting remains a separate permission.',control:key});
     if(guidance()!=='expert')append(card,'p','shared-crew-explanation',guidance()==='moderate'?`${friend.name} can board after you allow access.`:`Then ${friend.name} can choose “Board ${vessel.name}” here. You keep control of the helm.`);
    }else if(mp.aboardVesselId!==vessel.id){
     const board=getBoardingAction(game(),vessel,{fleet:snapshot().fleet||[],connected:connected()});
     const reason=vessel.canBoard===false&&vessel.ownerId!==mp.captainId?`Ask ${vessel.ownerName||friend.name} to choose “Allow ${mp.name||'you'} aboard” in Play together.`:board.reason;
     button(actions,`Board ${vessel.name||'ship'}`,()=>boardWithFriend(friend.captainId,vessel.id),{primary:true,disabled:!board.enabled,reason});
     if(!board.enabled||guidance()!=='expert')append(card,'p','shared-crew-explanation',board.enabled?(guidance()==='moderate'?'Board, then wait for your friend before launch.':isOwner(game(),vessel)?`${friend.name} is cleared to board. Step onto the deck, then wait for them before launching.`:'Step aboard the same ship. It stays docked until the pilot launches.'):reason);
    }else append(card,'p','shared-crew-explanation',`${friend.name} can board ${vessel.name} from Play together. Wait for them before launching.`);
   }else if(vessel?.npcContractId){
    const militaryDeployment=[friend.military?.operationId,awareness.localMilitary?.operationId].some(id=>id&&id===vessel.npcContractId);
    append(card,'p','shared-crew-explanation',militaryDeployment?'Join the same deployment to receive your own assigned place aboard.':'This is a paid NPC crew assignment. Meet after the ship returns to port.');
   }
   else append(card,'p','shared-crew-explanation','Meet at the same port, then board one ship together.');
  }
  if(openMilitary){
   button(actions,friend.sameOperation?'View shared deployment':'Serve together',()=>{
    const current=snapshot().presence?.find(person=>person.captainId===friend.captainId);if(!current)return;
    return openMilitary({captainId:current.captainId,operationId:current.military?.operationId||null});
   },{primary:!actions.children.length,disabled:!connected()});
   if(!friend.sameOperation&&guidance()!=='expert')append(card,'p','shared-crew-explanation',friend.sameUnit?'Same branch · Choose the same deployment; each captain keeps their own rank.':!friend.military&&!awareness.localMilitary?guidance()==='moderate'?'Serve together starts at Sergeant Venn on Morrow.':'Sergeant Venn on Morrow recruits for Navy and Army. Choose the same branch, then the same deployment.':'Military service is a separate choice for each captain.');
  }
  if(actions.children.length)card.append(actions);
  friendGuide(card,friend,awareness,{expanded});
  return card;
 }
 function friendsSection(parent,awareness) {
  const online=awareness.friends.filter(person=>person.online),section=append(parent,'section','shared-friends');
  if(online.length){
   append(section,'h3','',online.length===1?'Your friend':'Friends in this galaxy');
   for(const [index,friend] of online.entries())friendCard(section,friend,awareness,{expanded:index===0});
  }else{
   append(section,'h3','','Invite a friend');
   append(section,'p','shared-crew-explanation','Share your galaxy code. Once your friend joins, this panel shows where they are and how to board the same ship.');
  }
  const away=awareness.friends.filter(person=>!person.online);
  if(away.length){
   const details=append(section,'details','shared-crew-options');append(details,'summary','',`Away captains · ${away.length}`);
   for(const person of away){const row=append(details,'div','shared-roster-row');append(row,'strong','',person.name);append(row,'span','',person.location.text);}
  }
 }
 function secondaryActions(parent,current) {
  const mp=stateOf(game()).multiplayer||{},actions=append(parent,'div','shared-crew-actions shared-crew-secondary');
  const local=localPortShips();if(local.length&&(!mp.aboardVesselId||local.some(v=>v.id!==mp.aboardVesselId)))button(actions,'Ships at this port',openLocalShips);
  const docked=getDisembarkAction(game(),{shared:true,connected:connected(),fleet:snapshot().fleet||[]});
  if(mp.returnVesselId&&!docked)button(actions,'Return across the tether',()=>runDeckAction('returnToOwnShip'),{disabled:!connected()});
  const own=snapshot().fleet?.find(vessel=>vessel.id===mp.ownedVesselId);
  if(own&&current?.id!==own.id)button(actions,`Your ship · ${own.name}`,()=>openShip(own.id));
  if(!mp.aboardVesselId&&stateOf(game()).mode==='person'&&!stateOf(game()).interior&&own?.systemId===stateOf(game()).systemId&&!own.dockedAt&&intact(own))button(actions,'Return to your drifting ship',()=>runDeckAction('returnToShip'),{disabled:!connected()});
 }
 function galaxyOptions(parent,{showInvite=false}={}) {
  const snap=snapshot(),net=network(),section=append(parent,'details','shared-crew-options');append(section,'summary','','Invite & galaxy options');
  if(showInvite)section.open=true;
  const code=append(section,'div','shared-invite-code');append(code,'span','','Galaxy code');append(code,'strong','',net?.passport?.realmCode||snap.realm?.code||'');
  button(code,'Copy code',async()=>{const value=network()?.passport?.realmCode||snapshot().realm?.code||'';try{await navigator.clipboard.writeText(value);toast?.('Galaxy code copied.','good');}catch{toast?.(`Galaxy code: ${value}`);}});
  const actions=append(section,'div','shared-crew-actions');
  if(openHome)button(actions,'Home berth & recovery',openHome);
  if(openPassport)button(actions,'Captain passport',()=>openPassport());
  button(actions,'Refresh crew',openHub);
  if(disconnect)button(actions,'Sign off safely',disconnect);
 }
 function nearbyContacts(parent,current) {
  const state=stateOf(game()),ships=(snapshot().fleet||[]).filter(vessel=>vessel.id!==current?.id&&vessel.systemId===state.systemId&&!vessel.npcContractId);
  if(!ships.length||!openContact)return;
  const section=append(parent,'details','shared-crew-options');append(section,'summary','',`Other ships nearby · ${ships.length}`);
  for(const vessel of ships) {
   const node=button(section,`${vessel.name||getShipClass(vessel.classId).name} · ${vessel.ownerName||'Captain'}`,()=>openContact(vessel.id));
   node.classList.add('shared-contact-button');append(node,'small','',locationText(vessel));
  }
 }
 function openHub() {
  const snap=snapshot(),g=game(),mp=stateOf(g).multiplayer||{},current=selectedCrewVessel(g,snap),awareness=crewAwareness(g,snap),online=awareness.friends.filter(person=>person.online);
  const root=begin('Play together','online',`${snap.realm?.name||'SHARED GALAXY'} · ${awareness.onlineCount} / 10 ONLINE`);
  friendsSection(root,awareness);
  if(current) {
   let shipParent=root;
   if(!mp.aboardVesselId&&online.length){shipParent=append(root,'details','shared-crew-options');append(shipParent,'summary','','Your ship & boarding');}
   shipCard(shipParent,current,{compact:true});
   if(awareness.localMilitary)append(shipParent,'p','shared-captain-location',`Your service: ${militaryText({military:awareness.localMilitary})}`);
   const people=(snap.presence||[]).filter(person=>person.vesselId===current.id);
   if(people.length){const roster=append(shipParent,'details','shared-crew-options');append(roster,'summary','',`Ship crew · ${people.length}`);crewRoster(roster,current);}
   if(isOwner(g,current)){const permissions=append(root,'details','shared-crew-options shared-crew-management');append(permissions,'summary','','Ship permissions');permissionCards(permissions,current,openHub);}
  } else append(root,'p','shared-crew-explanation','Choose a ship at this port or ask its owner to allow you aboard.');
  secondaryActions(root,current);nearbyContacts(root,current);galaxyOptions(root,{showInvite:!online.length});
  button(root,'Back to the world',()=>dialog.close());
  rememberView(openHub,root);
 }
 function openShip(vesselId=null) {
  const snap=snapshot(),vessel=vesselId?snap.fleet?.find(ship=>ship.id===vesselId):selectedCrewVessel(game(),snap);
  if(!vessel){openHub();return;}
  const root=begin(vessel.name||'Ship crew','sharedship','BOARDING & CREW'),refresh=()=>openShip(vessel.id);
  shipCard(root,vessel);permissionCards(root,vessel,refresh);crewRoster(root,vessel);secondaryActions(root,vessel);
  button(root,'Back to galaxy crew',openHub);
  rememberView(refresh,root);
 }
 function openLocalShips() {
  const g=game(),selected=selectedCrewVessel(g,snapshot()),local=localPortShips();
  local.sort((a,b)=>Number(b.id===selected?.id)-Number(a.id===selected?.id)||Number(isOwner(g,b))-Number(isOwner(g,a))||String(a.name).localeCompare(String(b.name)));
  const root=begin('Ships at this port','port-ships','BOARD FIRST · LAUNCH WHEN YOUR CREW IS READY');
  append(root,'p','shared-crew-explanation','Boarding puts you on the deck. Everyone can board before a pilot launches.');
  if(!local.length) {
   append(root,'p','','No friendly ships are docked here.');
   if(selected)append(root,'p','shared-crew-explanation',`${selected.name||'Your ship'}: ${locationText(selected)}.`);
  }
  for(const vessel of local)shipCard(root,vessel,{compact:true});
  button(root,'Back to crew',openHub);
  rememberView(openLocalShips,root);
 }
 return {openHub,openShip,openLocalShips,refresh};
}
