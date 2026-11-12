/** Public crew presence, shared by the compact HUD and the Play together panel. */
const stateOf=game=>game?.state||{};
const nameOf=(game,systemId)=>game?.galaxy?.find(system=>system.id===systemId)?.name||systemId||'Unknown system';
const bodyOf=(game,systemId,locationId)=>{
 const bodies=game?.galaxy?.find(system=>system.id===systemId)?.bodies||[];
 return bodies.find(body=>body.id===locationId)||bodies.find(body=>String(locationId||'').startsWith(`${body.id}:`))||null;
};

/** Presence exposes place IDs, never another captain's private game state. */
export function publicCrewLocation(game,person={},fleet=[]) {
 const vessel=fleet.find(ship=>ship.id===person.vesselId),systemId=vessel?.systemId||person.systemId;
 const systemName=nameOf(game,systemId),mp=stateOf(game).multiplayer||{};
 if(vessel){
  const dockedAt=mp.aboardVesselId===vessel.id&&Object.hasOwn(mp,'dockedAt')?mp.dockedAt:vessel.dockedAt;
  const port=bodyOf(game,systemId,dockedAt),portName=port?.name||dockedAt;
  const place=dockedAt?`Docked at ${portName}`:`In flight · ${systemName}`;
  const outside=person.roomKind==='eva'||String(person.roomId||'').includes(':eva:');
  return {systemId,systemName,bodyId:dockedAt||null,bodyName:portName||null,vesselId:vessel.id,vesselName:vessel.name||'Unnamed ship',roomKind:outside?'eva':'ship',
   short:outside?`Outside ${vessel.name||'ship'}`:vessel.name||'Unnamed ship',
   text:`${outside?'Outside':'Aboard'} ${vessel.name||'ship'} · ${place}`};
 }
 // Older servers already expose the same body in roomId. Keep their snapshots useful.
 const legacy=String(person.roomId||'').match(/:(surface|site|derelict):([^:]+):(.+)$/),roomKind=person.roomKind||legacy?.[1]||null;
 const locationId=person.locationId||legacy?.[3]||null,body=bodyOf(game,systemId,locationId);
 const bodyName=body?.name||null;
 const text=bodyName?`${roomKind==='site'?'Inside a site on ':roomKind==='derelict'?'At a wreck near ':''}${bodyName} · ${systemName}`:systemName;
 return {systemId,systemName,bodyId:body?.id||null,bodyName,vesselId:person.vesselId||null,vesselName:null,roomKind,short:bodyName||systemName,text};
}

/** Pure display model: sharing a ship never implies sharing enlistment or rank. */
export function crewAwareness(game,snapshot={}) {
 const state=stateOf(game),mp=state.multiplayer||{},fleet=snapshot.fleet||[],seen=new Set();
 const people=(snapshot.presence||[]).filter(person=>person?.captainId&&!seen.has(person.captainId)&&seen.add(person.captainId));
 const self=people.find(person=>person.captainId===mp.captainId),localMilitary=self?.military||null;
 const current=fleet.find(vessel=>vessel.id===mp.aboardVesselId)||null;
 const localOutside=state.interior?.kind==='eva';
 const localPort=mp.aboardVesselId&&Object.hasOwn(mp,'dockedAt')?mp.dockedAt:current?.dockedAt||state.exploration?.bodyId||state.interior?.returnLocation||state.locationId;
 const friends=people.filter(person=>person.captainId!==mp.captainId).map(person=>{
  const location=publicCrewLocation(game,person,fleet),sameVessel=!!mp.aboardVesselId&&person.vesselId===mp.aboardVesselId;
  const aboardTogether=sameVessel&&!localOutside&&location.roomKind!=='eva';
  const sameOperation=!!localMilitary?.operationId&&localMilitary.operationId===person.military?.operationId;
  const sameUnit=!!localMilitary?.branchId&&localMilitary.factionId===person.military?.factionId&&localMilitary.branchId===person.military?.branchId;
  const samePort=!!localPort&&state.systemId===location.systemId&&localPort===location.bodyId;
  const relation=sameVessel?aboardTogether?'Same ship':'Same crew · Hull walk':sameOperation?'Same deployment':samePort?'Same port':state.systemId===location.systemId?'Same system':'Another system';
  return {...person,online:person.online===true,location,vesselName:location.vesselName,sameVessel,aboardTogether,sameOperation,sameUnit,samePort,relation};
 }).sort((a,b)=>Number(b.online)-Number(a.online)||Number(b.sameVessel)-Number(a.sameVessel)||Number(b.sameOperation)-Number(a.sameOperation)||String(a.name).localeCompare(String(b.name)));
 const online=friends.filter(person=>person.online),aboard=online.filter(person=>person.sameVessel),crewCount=mp.aboardVesselId?aboard.length+1:0;
 const onlineCount=people.length?online.length+(self?.online===false?0:1):Number(snapshot.realm?.online)||1;
 const first=online[0],names=aboard.map(person=>person.name).slice(0,2).join(' & '),outside=aboard.filter(person=>person.location.roomKind==='eva');
 const detail=localOutside?`You are outside ${current?.name||'your ship'}`:outside.length?`${outside.map(person=>person.name).slice(0,2).join(' & ')} outside ${current?.name||'your ship'}`:aboard.length?`${names}${aboard.length>2?` +${aboard.length-2}`:''} aboard ${current?.name||'your ship'}`:
  first?`${first.name} · ${first.sameOperation?'same deployment · ':''}${first.location.short}`:'Invite a friend with your galaxy code';
 return {onlineCount,crewCount,label:crewCount>1?`Crew ${crewCount}`:'Play together',detail,currentVesselId:current?.id||mp.aboardVesselId||null,localMilitary,localOutside,friends};
}
