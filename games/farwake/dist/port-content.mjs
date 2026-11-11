/** Dedicated service berths. Appending preserves every existing chart/body identity. */
export const FACTION_PORTS = Object.freeze([
  {systemId:'brindle',id:'common-watch',name:'Common Watch',faction:'freewake',lore:'A Union convoy base built around a shared repair dock. Watch crews protect the food lanes; visiting vessels need current Freewake service clearance.'},
  {systemId:'nacre',id:'bastion-yard',name:'Bastion Fleet Yard',faction:'concord',lore:'The fleet berths beyond Bastion Three’s public hospital. Patrol cutters and heavier escorts rotate through the guarded locks. Terran Continuity service clearance is required.'},
  {systemId:'sable',id:'combine-garrison',name:'Sable Fleet Garrison',faction:'meridian',lore:'A guarded naval yard beside the refinery lanes. Meridian escorts queue behind supply tenders; the civilian checkpoint remains separate. Current Combine service clearance opens these berths.'},
  {systemId:'vesper',id:'lantern-guard',name:'Lantern Guard Anchorage',faction:'lantern',lore:'An Assembly escort base for survey convoys and archive ships. Scientific traffic shares the outer approach with patrol craft. The inner docks require Lantern service clearance.'},
  {systemId:'cinder',id:'ember-muster',name:'Ember Muster',faction:'cinder',lore:'A clan defense anchorage assembled from armored hull sections. Salvage tenders supply its escorts, but a friendly radio call alone will not open the lock. Current Cinder service clearance is required.'}
].map(port=>Object.freeze(port)));

export function appendFactionPorts(systems){
  return systems.map(system=>{
    const additions=FACTION_PORTS.filter(port=>port.systemId===system.id&&!system.bodies.some(body=>body.id===port.id));
    if(!additions.length)return system;
    return {...system,bodies:[...system.bodies,...additions.map(({systemId,...port})=>({...port,kind:'station',biome:'station',portType:'military',portFaction:port.faction,portServices:true,civilianSettlement:false}))]};
  });
}
