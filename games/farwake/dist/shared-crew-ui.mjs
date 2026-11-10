/** Shared ships, invitations, and returning aboard share one small crew panel. */
import { getShipClass } from './fleet.mjs';
import { getBoardingAction, getPerspectiveAction } from './perspective-controls.mjs';

const SERVICE_ROLES = ['weapons', 'engineering', 'scanner', 'navigation', 'medical', 'security'];
const GENERAL_SERVICE_ROLES = ['weapons', 'engineering', 'scanner', 'medical', 'security'];
const stateOf = game => game?.state || {};
const portOf = game => {
 const state=stateOf(game);
 return state.exploration?.bodyId || state.interior?.returnLocation || state.locationId;
};
const intact = vessel => !!vessel && !vessel.destroyed && !(vessel.hull<=0);
const isOwner = (game,vessel) => vessel?.ownerId===stateOf(game).multiplayer?.captainId && !vessel?.npcContractId;

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
 if(control==='boarding')return {vesselId:vessel.id,captainId,allowed:!allowed,roles:roles.filter(role=>role!=='helm'),allowBunk};
 if(control==='helm')return {vesselId:vessel.id,captainId,allowed,roles:roles.includes('helm')?roles.filter(role=>role!=='helm'):[...roles,'helm'],allowBunk};
 if(control==='bunk')return {vesselId:vessel.id,captainId,allowed,roles,allowBunk:!allowBunk};
 throw new RangeError('Unknown crew permission.');
}

export function createSharedCrewUI({getGame,getSnapshot,getNetwork,dialog,invoke,acceptResult,runDeckAction,openHome,openPassport,openContact,openCrewDuty,walkDeck,disconnect,toast}) {
 let renderRevision=0,permissionPending=false;
 const game=()=>getGame(),snapshot=()=>getSnapshot()||{},network=()=>getNetwork();
 const connected=()=>network()?.connected===true;
 const element=(tag,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
 const append=(parent,tag,className,text)=>{const node=element(tag,className,text);parent.append(node);return node;};
 function button(parent,label,onClick,{primary=false,disabled=false,reason='',pressed,control}={}) {
  const node=append(parent,'button',primary?'button-primary':'button-secondary',label);node.type='button';node.disabled=disabled;
  if(reason)node.title=reason;
  if(pressed!==undefined)node.setAttribute('aria-pressed',String(pressed));
  if(control)node.dataset.crewControl=control;
  node.onclick=onClick;return node;
 }
 function bodyName(systemId,bodyId) {
  if(!bodyId)return '';
  return game().galaxy?.find(system=>system.id===systemId)?.bodies?.find(body=>body.id===bodyId)?.name||bodyId;
 }
 function locationText(vessel) {
  if(vessel.destroyed||vessel.hull<=0)return 'Hull lost';
  if(vessel.dockedAt)return `Docked at ${bodyName(vessel.systemId,vessel.dockedAt)}`;
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
  const top=dialog.body.scrollTop;open();dialog.body.scrollTop=top;
  const focus=[...(dialog.body.querySelectorAll?.('[data-crew-control]')||[])].find(node=>node.dataset.crewControl===control);
  focus?.focus?.({preventScroll:true});
 }
 async function changeAccess(vesselId,captainId,control,refresh) {
  if(permissionPending||!connected()||stateOf(game()).npcContract?.active)return;
  const vessel=snapshot().fleet?.find(value=>value.id===vesselId);
  if(!vessel||!isOwner(game(),vessel))return;
  const payload=crewAccessChange(vessel,captainId,control);
  if(control!=='boarding'&&!payload.allowed)return;
  const revision=renderRevision;permissionPending=true;
  for(const node of dialog.body.querySelectorAll?.('[data-crew-control]')||[])node.disabled=true;
  try {
   if(acceptResult(await invoke('setCrewAccess',payload))&&renderRevision===revision&&dialog.opened)repaint(refresh,`${vesselId}:${captainId}:${control}`);
  } finally {
   permissionPending=false;
   if(renderRevision===revision&&dialog.opened)repaint(refresh,`${vesselId}:${captainId}:${control}`);
  }
 }
 function shipCard(parent,vessel,{compact=false}={}) {
  const g=game(),mp=stateOf(g).multiplayer||{},aboard=mp.aboardVesselId===vessel.id,hiredDuty=!!(vessel.npcContractId&&stateOf(g).npcContract?.active);
  const card=append(parent,'section','shared-ship-card');
  const heading=append(card,'div','shared-ship-heading');
  append(heading,'h3','',vessel.name||getShipClass(vessel.classId).name);
  append(heading,'span','shared-ship-relation',isOwner(g,vessel)?'YOUR SHIP':aboard?'YOU ARE ABOARD':mp.portVesselId===vessel.id?'YOUR ARRIVING SHIP':`${vessel.ownerName||'Another captain'}’s ship`);
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
   const helm=getPerspectiveAction(g,{shared:true,connected:connected(),fleet:snapshot().fleet||[]});
   if(helm.command==='quickHelm') {
    button(actions,helm.label,()=>runDeckAction('quickHelm'),{primary:true,disabled:!helm.enabled,reason:helm.reason});
    if(!helm.enabled)append(card,'p','shared-crew-explanation',helm.reason);
   }
  } else {
   const board=getBoardingAction(g,vessel,{fleet:snapshot().fleet||[],connected:connected()});
   button(actions,`Board ${vessel.name||'ship'}`,()=>runDeckAction('boardShip',{vesselId:vessel.id}),{primary:true,disabled:!board.enabled,reason:board.reason});
   append(card,'p','shared-crew-explanation',board.enabled?(vessel.dockedAt?'Step aboard the deck. The ship stays docked until someone launches.':'Cross to this ship’s crew deck. Your own ship stays where you leave it.'):board.reason);
  }
  if(aboard&&vessel.dockedAt&&!hiredDuty)button(actions,`Disembark at ${bodyName(vessel.systemId,vessel.dockedAt)}`,()=>runDeckAction('leaveCrew'),{disabled:!connected()});
  if(!compact&&openContact&&!hiredDuty)button(actions,'Ship details',()=>openContact(vessel.id));
  return card;
 }
 function permissionCards(parent,vessel,refresh) {
  if(!isOwner(game(),vessel))return;
  const mp=stateOf(game()).multiplayer||{},people=(snapshot().presence||[]).filter(person=>person.captainId!==mp.captainId),working=!!stateOf(game()).npcContract?.active;
  const section=append(parent,'section','shared-crew-permissions');append(section,'h3','',`Who can board ${vessel.name||'your ship'}?`);
  append(section,'p','shared-crew-explanation','Allow a friend aboard, then choose separately whether they may pilot.');
  if(working)append(section,'p','shared-crew-explanation','Complete your current paid watch before changing ship permissions.');
  if(!people.length)append(section,'p','shared-crew-explanation','When your friend joins this galaxy, their boarding controls appear here.');
  for(const person of people) {
   const grant=vessel.grants?.[person.captainId],allowed=grant?grant.allowed===true:vessel.allowCrew===true,helm=allowed&&grant?.roles?.includes('helm');
   const row=append(section,'article','shared-captain-card'),heading=append(row,'div','shared-captain-heading');
   append(heading,'strong','',person.name);append(heading,'span','shared-captain-presence',person.online?'Online':'Away');
   append(row,'p','shared-captain-location',captainLocation(person,vessel));
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
   if(permissionPending||!connected()||working)return;permissionPending=true;const revision=renderRevision;
   try{const current=snapshot().fleet?.find(value=>value.id===vessel.id);if(current&&acceptResult(await invoke('setCrewAccess',{vesselId:vessel.id,allowed:!current.allowCrew}))&&renderRevision===revision&&dialog.opened)refresh();}finally{permissionPending=false;}
  },{pressed:vessel.allowCrew===true,disabled:!connected()||working});general.setAttribute('aria-label','Allow everyone in this galaxy aboard');
  append(extra,'p','shared-crew-explanation','Individual boarding choices still apply. Everyone still needs a free berth.');
  for(const person of people) {
   const grant=vessel.grants?.[person.captainId],allowed=grant?grant.allowed===true:vessel.allowCrew===true,bunk=allowed&&(grant?grant.allowBunk===true:vessel.allowCrew===true);
   button(extra,`Home bunk · ${person.name}`,()=>changeAccess(vessel.id,person.captainId,'bunk',refresh),{pressed:bunk,disabled:!connected()||working||!allowed,control:`${vessel.id}:${person.captainId}:bunk`});
  }
 }
 function captainLocation(person,vessel) {
  if(person.vesselId===vessel?.id)return vessel.helmOwner===person.captainId?'At the helm':person.online?'Aboard this ship':'Resting aboard';
  if(vessel?.crewAshore?.some(other=>other.captainId===person.captainId))return `Ashore at ${bodyName(vessel.systemId,vessel.dockedAt)}`;
  const other=snapshot().fleet?.find(ship=>ship.id===person.vesselId);
  if(other)return other.ownerId===person.captainId?`Aboard their ship · ${other.name||'unnamed vessel'}`:`Aboard ${other.name||'another ship'} · ${other.ownerName||'another captain'}`;
  const system=game().galaxy?.find(system=>system.id===person.systemId);
  return system?.name||person.systemId||'Elsewhere in the galaxy';
 }
 function crewRoster(parent,vessel) {
  const people=(snapshot().presence||[]).filter(person=>person.vesselId===vessel.id);
  if(!people.length)return;
  const section=append(parent,'section','shared-crew-roster');append(section,'h3','','People aboard');
  for(const person of people) {
   const row=append(section,'div','shared-roster-row');append(row,'strong','',person.name);append(row,'span','',captainLocation(person,vessel));
  }
 }
 function localPortShips() {
  const g=game(),state=stateOf(g),mp=state.multiplayer||{},aboard=snapshot().fleet?.find(v=>v.id===mp.aboardVesselId),port=aboard?.dockedAt||portOf(g);
  if(!port)return [];
  return (snapshot().fleet||[]).filter(vessel=>vessel.systemId===state.systemId&&vessel.dockedAt===port&&intact(vessel)&&!vessel.hostile&&!vessel.npcContractId);
 }
 function secondaryActions(parent,current) {
  const mp=stateOf(game()).multiplayer||{},actions=append(parent,'div','shared-crew-actions shared-crew-secondary');
  const local=localPortShips();if(local.length&&(!mp.aboardVesselId||local.some(v=>v.id!==mp.aboardVesselId)))button(actions,'Ships at this port',openLocalShips);
  if(mp.returnVesselId)button(actions,'Return across the tether',()=>runDeckAction('returnToOwnShip'),{disabled:!connected()});
  const own=snapshot().fleet?.find(vessel=>vessel.id===mp.ownedVesselId);
  if(own&&current?.id!==own.id)button(actions,`Your ship · ${own.name}`,()=>openShip(own.id));
  if(!mp.aboardVesselId&&stateOf(game()).mode==='person'&&!stateOf(game()).interior&&own?.systemId===stateOf(game()).systemId&&!own.dockedAt&&intact(own))button(actions,'Return to your drifting ship',()=>runDeckAction('returnToShip'),{disabled:!connected()});
 }
 function galaxyOptions(parent) {
  const snap=snapshot(),net=network(),section=append(parent,'details','shared-crew-options');append(section,'summary','','Invite & galaxy options');
  const code=append(section,'div','shared-invite-code');append(code,'span','','Galaxy code');append(code,'strong','',net?.passport?.realmCode||snap.realm?.code||'');
  button(code,'Copy code',async()=>{const value=network()?.passport?.realmCode||snapshot().realm?.code||'';try{await navigator.clipboard.writeText(value);toast?.('Galaxy code copied.','good');}catch{toast?.(`Galaxy code: ${value}`);}});
  const roster=append(section,'div','shared-crew-roster');append(roster,'h3','','Captains in this galaxy');
  for(const person of snap.presence||[]) {
   const row=append(roster,'div','shared-roster-row');append(row,'strong','',person.name);append(row,'span','',`${person.online?'Online':'Away'} · ${captainLocation(person,null)}`);
  }
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
  const snap=snapshot(),g=game(),current=selectedCrewVessel(g,snap),root=begin('Crew & boarding','online',`${snap.realm?.name||'SHARED GALAXY'} · ${snap.realm?.online??1} / 10 ONLINE`);
  if(current) {
   shipCard(root,current);permissionCards(root,current,openHub);if(!isOwner(g,current))crewRoster(root,current);
  } else append(root,'p','shared-crew-explanation','Choose a ship at this port or ask its owner to allow you aboard.');
  secondaryActions(root,current);nearbyContacts(root,current);galaxyOptions(root);
  button(root,'Back to the world',()=>dialog.close());
 }
 function openShip(vesselId=null) {
  const snap=snapshot(),vessel=vesselId?snap.fleet?.find(ship=>ship.id===vesselId):selectedCrewVessel(game(),snap);
  if(!vessel){openHub();return;}
  const root=begin(vessel.name||'Ship crew','sharedship','BOARDING & CREW'),refresh=()=>openShip(vessel.id);
  shipCard(root,vessel);permissionCards(root,vessel,refresh);crewRoster(root,vessel);secondaryActions(root,vessel);
  button(root,'Back to galaxy crew',openHub);
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
 }
 return {openHub,openShip,openLocalShips};
}
