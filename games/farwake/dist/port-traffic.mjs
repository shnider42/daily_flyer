/**
 * Port capacity and civilian traffic policy, shared by solo and the authority.
 * Selection has its own versioned hash stream: adding a hull or a port never
 * consumes the legacy galaxy, asteroid, enemy or encounter random sequence.
 */
import { SHIP_CLASSES } from './fleet.mjs';
import { systemContext } from './encounter-context.mjs';

const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return(h^(h>>>16))>>>0;};
const own=(value,key)=>value&&Object.hasOwn(value,key)?value[key]:undefined;
const knownFaction=value=>['concord','freewake','meridian','lantern','cinder'].includes(value)?value:null;
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);return Object.freeze(value);};
const hulls=new Map(SHIP_CLASSES.map(hull=>[hull.id,hull]));

export const PORT_KINDS=freeze({
 hub:{label:'Major spaceport',maxShipLength:520,trafficWeight:6},
 military:{label:'Military base',maxShipLength:520,trafficWeight:5},
 industrial:{label:'Industrial port',maxShipLength:360,trafficWeight:3.6},
 research:{label:'Research port',maxShipLength:154,trafficWeight:1.4},
 regional:{label:'Regional port',maxShipLength:126,trafficWeight:2},
 outpost:{label:'Small docking field',maxShipLength:90,trafficWeight:.7}
});

// Military berths are new, separate bodies. Public hospitals, customs desks,
// refugee terminals and existing story destinations keep their public access.
export const MILITARY_PORT_FACTIONS=freeze({
 'common-watch':'freewake','bastion-yard':'concord','combine-garrison':'meridian',
 'lantern-guard':'lantern','ember-muster':'cinder'
});
const authored=freeze({
 kettle:'hub',morrow:'regional',orchard:'regional',weighhouse:'industrial',
 serein:'hub',ledger:'hub',lilt:'regional',listening:'research',ward:'regional',
 bastion:'regional',kiln:'industrial',patchwork:'industrial',blindpost:'research',
 tallow:'industrial',checkpoint:'industrial',newshore:'regional',porch:'outpost',
 census:'outpost',threshold:'research',wide:'regional',door:'outpost',
 'glass-harbor':'hub',chora:'regional','umbra-watch':'research',moth:'outpost',
 'ravel-market':'hub',tessera:'regional','still-berth':'outpost','low-water':'outpost',
 'brass-customs':'industrial','brassfall-works':'industrial','kindred-port':'regional',
 'kindred-landing':'regional','lacuna-observatory':'research',noonless:'outpost',
 'greenwake-depot':'industrial','ochre-garden':'regional',avel:'regional',hadrun:'industrial'
});
const quietPorts=freeze({census:.15,threshold:.2,'still-berth':.35,door:.3});
const absentPorts=new Set(['earth','palimpsest','stillwater']);

/** A null profile means that scheduled ships have no serviced berth here. */
export function portProfile(system={},body={}){
 if(!body||typeof body!=='object'||body.landable===false||body.portServices===false||
    !['station','planet','moon','asteroid'].includes(body.kind)||
    ['preflight','pre-spaceflight'].includes(body.techLevel)||absentPorts.has(body.id)||
    (['moon','asteroid'].includes(body.kind)&&/barren|rock|dust/.test(String(body.biome))))return null;
 const id=typeof body.id==='string'?body.id:'';if(!id)return null;
 const faction=knownFaction(own(MILITARY_PORT_FACTIONS,id))||knownFaction(own(body,'portFaction'))||knownFaction(body.faction)||knownFaction(system.faction)||'freewake';
 let kind=own(MILITARY_PORT_FACTIONS,id)?'military':own(authored,id);
 const explicit=own(body,'portType');
 if(!kind&&Object.hasOwn(PORT_KINDS,explicit))kind=explicit;
 if(!kind){
  const context=systemContext(system),roll=hash(`${system.id||''}:${id}:port-purpose-v1`)%100;
  // A generic public landing board is never silently made a restricted base.
  // Industry and distance determine its mix; seed-independent IDs keep its
  // capacity stable across old saves and future content additions.
  if(body.biome==='industrial'||system.biome==='industrial'&&body.kind==='station')kind='industrial';
  else if(context.region==='core')kind=body.kind==='station'&&roll<60?'hub':'regional';
  else if(context.region==='settled')kind=body.kind==='station'&&roll<20?'hub':roll<35?'research':'regional';
  else kind=roll<12?'research':roll<43?'regional':'outpost';
 }
 const definition=PORT_KINDS[kind];
 return Object.freeze({id,systemId:String(system.id||''),kind,label:definition.label,faction,
  maxShipLength:definition.maxShipLength,trafficWeight:own(quietPorts,id)??definition.trafficWeight,restricted:kind==='military'});
}

export function canHullUsePort(classId,profile){
 const hull=hulls.get(classId),limit=profile?.maxShipLength;
 return !!hull&&!!profile&&Object.hasOwn(PORT_KINDS,profile.kind)&&Number.isFinite(limit)&&limit>0&&hull.stats.renderLength<=limit;
}

const roles=freeze({sparrow:'utility',kestrel:'courier',mule:'salvage',tern:'passenger',hauler:'freight',
 quill:'courier',petrel:'survey',mender:'medical',marten:'escort',frigate:'survey',
 bulwark:'patrol',atlas:'salvage',cairn:'miner',capital:'carrier',
 lark:'passenger',puffin:'freight',osprey:'survey',leviathan:'tender',judicator:'destroyer'});

// Context multiplies acquisition rarity, rather than replacing it. A crowded
// terminal needs many working transports; a capital hull remains an uncommon
// sight there. Bases favor escorts, patrol ships and supporting medical craft.
const suitability=freeze({
 hub:{sparrow:.8,kestrel:.65,mule:.4,tern:5,hauler:32,quill:4,petrel:2,mender:4,marten:1,frigate:1.2,bulwark:.25,atlas:5,cairn:4,capital:.8,lark:.65,puffin:1.4,osprey:1.1,leviathan:3,judicator:.5},
 military:{sparrow:.4,kestrel:.7,mule:.3,tern:.5,hauler:2,quill:2,petrel:1,mender:8,marten:50,frigate:35,bulwark:70,atlas:1,cairn:.3,capital:8,lark:.2,puffin:.8,osprey:.9,leviathan:6,judicator:28},
 industrial:{sparrow:1,kestrel:.5,mule:8,tern:1,hauler:18,quill:1,petrel:.5,mender:1,marten:2,frigate:.5,bulwark:.5,atlas:50,cairn:60,capital:.3,lark:.4,puffin:1.5,osprey:.6,leviathan:20,judicator:0},
 research:{sparrow:1.5,kestrel:4,mule:.5,tern:2,hauler:2,quill:5,petrel:22,mender:3,marten:.7,frigate:4,bulwark:0,atlas:0,cairn:0,capital:0,lark:.5,puffin:1,osprey:0,leviathan:0,judicator:0},
 regional:{sparrow:2,kestrel:2,mule:1.5,tern:6,hauler:8,quill:3,petrel:2,mender:3,marten:1,frigate:0,bulwark:0,atlas:0,cairn:0,capital:0,lark:1.4,puffin:1.5,osprey:0,leviathan:0,judicator:0},
 outpost:{sparrow:4,kestrel:3,mule:3,tern:3,hauler:0,quill:0,petrel:2,mender:0,marten:0,frigate:0,bulwark:0,atlas:0,cairn:0,capital:0,lark:0,puffin:0,osprey:0,leviathan:0,judicator:0}
});

/** The public tables contain proportions; divide a weight by the total for %. */
export const TRAFFIC_ACQUISITION_RARITY=freeze(Object.fromEntries(SHIP_CLASSES.map(hull=>{
 const gates=(hull.requires?.length||0)*.25+(hull.conditions?.flags?.length||0)*.18+(hull.requiresClass?.length ? .22 : 0);
 return[hull.id,Math.pow(420/Math.max(420,hull.cost),.9)/(1+gates)];
})));

const profileRows=freeze(Object.fromEntries(Object.keys(PORT_KINDS).map(kind=>{
 const profile={kind,...PORT_KINDS[kind]};
 const rows=SHIP_CLASSES.filter(hull=>canHullUsePort(hull.id,profile)&&suitability[kind][hull.id]>0).map(hull=>({
  classId:hull.id,weight:TRAFFIC_ACQUISITION_RARITY[hull.id]*suitability[kind][hull.id],
  role:kind==='hub'&&['hauler','capital'].includes(hull.id)?'passenger':kind==='military'&&hull.id==='frigate'?'patrol':roles[hull.id]
 }));
 return[kind,rows];
})));

const emptyRows=Object.freeze([]);
export function trafficHullWeights(profile){
 const rows=own(profileRows,profile?.kind);if(!rows||!Number.isFinite(profile.maxShipLength)||profile.maxShipLength<=0)return emptyRows;
 // Resolute is the sole line destroyer on the starting watch. Generic traffic
 // cannot quietly add another one behind it, even at a capital-capable berth.
 if(profile.maxShipLength===PORT_KINDS[profile.kind].maxShipLength&&profile.systemId!=='hearth')return rows;
 return Object.freeze(rows.filter(row=>canHullUsePort(row.classId,profile)&&!(profile.systemId==='hearth'&&row.classId==='judicator')));
}

/** Repeatable identity, independent of generation order, time and player rank. */
export function chooseTrafficHull(seed,identityId,profile){
 const rows=trafficHullWeights(profile);if(!rows.length)return null;
 const total=rows.reduce((sum,row)=>sum+row.weight,0);
 let selection=hash(`${seed}:${identityId}:${profile.id||''}:${profile.kind}:traffic-hull-v1`)/4294967296*total;
 for(const row of rows){selection-=row.weight;if(selection<0)return row.classId;}
 return rows[rows.length-1].classId;
}
