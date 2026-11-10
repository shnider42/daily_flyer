/** Additive frontier charts and bounded stellar hazards shared by every simulation. */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const random=seed=>{let n=hash(seed);return()=>{n=(n+0x6D2B79F5)>>>0;let t=Math.imul(n^(n>>>15),n|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};};
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export const GALAXY_SYSTEM_COUNT=900;
export const FRONTIER_SYSTEMS=freeze([
 {id:'chorus',name:'Chorus',gx:-34,gy:14,faction:'lantern',biome:'ocean',danger:3,region:'The Listening Coast',description:'A blue star above a living ocean. Human receivers can hear the harbor answering in more than one voice.',bodies:[
  {id:'glass-harbor',name:'Glass Harbor',kind:'station',biome:'station',lore:'The concourse has two atmospheres and three kinds of door. Docking instructions ask visitors to wait for an answer before repeating themselves.'},
  {id:'chora',name:'Chora',kind:'planet',biome:'ocean',alienCulture:'choral',lore:'Shallow seas shine through translucent reef cities. The people living here remember a conversation as something built together, rather than something said by one speaker.'}]},
 {id:'umbra',name:'Umbra',gx:34,gy:-19,faction:'lantern',biome:'ice',danger:4,region:'The Falling Light',cosmic:{name:'The Threadwell'},description:'A patient observatory keeps watch beside a stellar black hole. Survey buoys mark the safe approach, and every departing ship is counted.',bodies:[
  {id:'umbra-watch',name:'Umbra Watch',kind:'station',biome:'station',lore:'Every observation has two timestamps: when it was made, and when it finally arrived. The watch keeps an empty chair for a surveyor whose last message is still on its way.'},
  {id:'moth',name:'Moth',kind:'planet',biome:'ice',lore:'Low domes shelter beneath a frozen ridge. Their windows face away from the bright accretion stream.'}]},
 {id:'ravel',name:'Ravel',gx:33,gy:18,faction:'cinder',biome:'desert',danger:4,region:'The Unlicensed Reach',description:'The official lanes end before the market begins. Favors, names and safe passage trade hands beneath the cargo gantries.',bodies:[
  {id:'ravel-market',name:'Ravel Night Market',kind:'station',biome:'station',lore:'Cargo manifests are written in erasable ink. The water vendors keep permanent ledgers, because even a gangster needs someone to trust.'},
  {id:'tessera',name:'Tessera',kind:'planet',biome:'desert',lore:'Old landing rights divide the salt flats into a thousand overlapping claims. Refugees and racketeers both know the unmarked routes.'}]},
 {id:'cairnsea',name:'Cairnsea',gx:-17,gy:-38,faction:'concord',biome:'ice',danger:4,region:'The Winter Stations',description:'A rescue line crosses a cold system where abandoned beacons continue to report occupied rooms.',bodies:[
  {id:'still-berth',name:'Still Berth',kind:'station',biome:'station',lore:'The station closes one corridor every night. Its remaining crew have stopped agreeing about how many corridors there were.'},
  {id:'low-water',name:'Low Water',kind:'moon',biome:'ice',lore:'Long shadows stretch beneath transparent ice. A weather station broadcasts a calm voice, regardless of the weather.'}]},
 {id:'brassfall',name:'Brassfall',gx:41,gy:0,faction:'meridian',biome:'industrial',danger:4,region:'The Claimant Belt',description:'Factory lights and blockade lamps share the same horizon. Union crews and Combine inspectors each claim to be protecting the workers.',bodies:[
  {id:'brass-customs',name:'Brass Customs',kind:'station',biome:'station',lore:'Three queues feed the same airlock: contract holders, workers, and people whose papers are still being reviewed.'},
  {id:'brassfall-works',name:'The Brassfall Works',kind:'planet',biome:'industrial',lore:'Reclaimed machinery fills a valley once mined to bedrock. A strike kitchen keeps feeding both sides of the picket line.'}]},
 {id:'kindred',name:'Kindred',gx:0,gy:38,faction:'freewake',biome:'temperate',danger:2,region:'The Open Settlements',description:'A chain of small settlements takes in ships turned away elsewhere. The welcome is real; the supply shortage is real too.',bodies:[
  {id:'kindred-port',name:'Kindred Port',kind:'station',biome:'station',lore:'The arrivals board records the number of people aboard before the size of their cargo. Volunteers disagree over who should get the last empty room.'},
  {id:'kindred-landing',name:'Kindred Landing',kind:'planet',biome:'temperate',lore:'New houses stand around an old public well. Their doors have been painted in the colors of places their residents cannot return to.'}]},
 {id:'lacuna',name:'Lacuna',gx:-40,gy:-12,faction:'lantern',biome:'ice',danger:5,region:'The Falling Light',cosmic:{name:'Hollow Crown'},description:'A dark mass bends the light of a distant companion. Pilots trade careful routes; observatory staff trade unfinished apologies.',bodies:[
  {id:'lacuna-observatory',name:'Lacuna Observatory',kind:'station',biome:'station',lore:'The observatory is listening to a probe with a failed engine. Shutting down the receiver would release enough power to warm the lower decks.'},
  {id:'noonless',name:'Noonless',kind:'planet',biome:'ice',lore:'A settlement follows the geothermal vents beneath a sunless ridge. Its people measure the year by which families can afford to move.'}]},
 {id:'greenwake',name:'Greenwake',gx:-26,gy:34,faction:'freewake',biome:'forest',danger:3,region:'The Listening Coast',description:'Human orchards grow beside a forest that responds to sound. Farmers, researchers and its first inhabitants disagree over what cultivation means.',bodies:[
  {id:'greenwake-depot',name:'Greenwake Depot',kind:'station',biome:'station',lore:'The freight handlers lower their voices around the seed containers. Nothing in the shipping contract explains why.'},
  {id:'ochre-garden',name:'Ochre Garden',kind:'planet',biome:'forest',alienCulture:'choral',lore:'Paths follow quiet strips between resonant trunks. The local hosts permit visitors to harvest fallen fruit; cutting a branch requires a conversation.'}]}
]);

const BIOMES=['forest','ice','ocean','desert','volcanic','industrial','barren','temperate'];
const FACTIONS=['concord','freewake','meridian','lantern','cinder'];
const PREFIX=['Beryl','Celandine','Wicker','Murmur','Lark','Thimble','Gloam','Spindle','Quarry','Fennel','Saffron','Dovetail','Umber','Tern','Harrow','Nettle','Asterfall','Rook','Bracken','Flint'];
const SUFFIX=['Sound','Commons','Corridor','Reach','Hollow','Bight','Spur','Landing','Shallows','Cross','Fold','Garden','Hold','Hearth','Pass','Shelf'];
const REGIONS=['The Listening Coast','The Claimant Belt','The Winter Stations','The Open Settlements','The Unlicensed Reach'];
const localIndex=(col,row)=>`${col<0?'m'+Math.abs(col):col}_${row<0?'m'+Math.abs(row):row}`;

/** Existing entries retain identity, coordinates and order. Only new records are created. */
export function expandGalaxy(baseSystems,seed='farwake'){
 const base=Array.isArray(baseSystems)?baseSystems:[],known=new Set(base.map(system=>system.id));
 // Re-applying expansion to a restored chart is harmless and does not duplicate places.
 if(base.length>=GALAXY_SYSTEM_COUNT)return base;
 const authored=FRONTIER_SYSTEMS.filter(system=>!known.has(system.id)).map(system=>({...clone(system),authored:true,frontier:true,index:0}));
 const cells=[];
 for(let row=-9;row<27;row++)for(let col=-10;col<26;col++){
  if(col>=0&&col<16&&row>=0&&row<18)continue;
  const gx=(col-7.5)*3.8,gy=(row-8.5)*3.8,id=`frontier-${localIndex(col,row)}`;
  if(known.has(id)||FRONTIER_SYSTEMS.some(system=>Math.hypot(gx-system.gx,gy-system.gy)<1.35))continue;
  // Grow connected rings around the original rectangle, then favor even radial coverage.
  const ring=Math.max(0,-col,col-15,-row,row-17);
  cells.push({col,row,gx,gy,id,ring,distance:Math.hypot(gx,gy)});
 }
 cells.sort((a,b)=>a.ring-b.ring||a.distance-b.distance||a.row-b.row||a.col-b.col);
 const added=cells.slice(0,Math.max(0,GALAXY_SYSTEM_COUNT-base.length-authored.length)).map(cell=>{
  const rng=random(`${seed}:${cell.id}:frontier`),biome=BIOMES[Math.floor(rng()*BIOMES.length)],faction=FACTIONS[Math.floor(rng()*FACTIONS.length)];
  const name=`${PREFIX[Math.floor(rng()*PREFIX.length)]} ${SUFFIX[Math.floor(rng()*SUFFIX.length)]} ${localIndex(cell.col,cell.row).replace('_','·')}`;
  const region=REGIONS[(Math.floor((Math.atan2(cell.gy,cell.gx)+Math.PI)/Math.PI*2.5))%REGIONS.length];
  const danger=clamp(Math.floor(cell.distance/18+rng()*2),2,5),bodyRoot=cell.id;
  return{id:cell.id,name,gx:cell.gx+(rng()-.5)*.44,gy:cell.gy+(rng()-.5)*.44,faction,biome,danger,region,authored:false,frontier:true,index:0,
   description:`${name} lies along ${region.toLowerCase()}. ${biome==='ice'?'Heat contracts keep its settlements alive, and disputes rarely wait for a thaw.':biome==='ocean'?'Passenger boats and orbital ferries link islands with separate customs.':biome==='industrial'?'A workshop economy has grown around machinery too old to replace.':biome==='barren'?'A small salvage port supplies expeditions beyond the mapped landing fields.':'The long supply route gives local captains a choice of work and a reason to stay.'}`,
   bodies:[
    {id:`${bodyRoot}-port`,name:`${name.split(' ')[0]} Landing`,kind:'station',biome:'station',faction,lore:'Passengers, dockworkers and visiting crews share a public board of routes and favors. An unreliable captain soon finds fewer names willing to answer.'},
    {id:`${bodyRoot}-world`,name:`${name.split(' ')[0]} ${cell.row%2?'Near':'Far'}`,kind:'planet',biome,faction,lore:biome==='ice'?'A chain of heated shelters links the settlement to older survey stations. Not every lamp on that route belongs to an occupied room.':biome==='industrial'?'People have made homes between the surviving machines. The factory records do not agree with the stories told around the evening kitchens.':'Trails lead from the landing field toward isolated homes, field stations and places locals mention only after getting to know a visitor.'},
    ...(hash(cell.id)%3===0?[{id:`${bodyRoot}-moon`,name:`${name.split(' ')[0]} Outlier`,kind:'moon',biome:hash(cell.id)%2?'barren':'ice',faction,lore:'The supply schedule lists one landing beacon and a handful of shelters. Most visiting ships leave before the long shadow reaches the pad.'}]:[])
   ]};
 });
 const result=[...base,...authored,...added];
 for(let index=base.length;index<result.length;index++)result[index].index=index;
 return result;
}

export const COSMIC_RULES=freeze({warningRadius:1250,gravityRadius:1100,tideRadius:460,coreRadius:140,maxAcceleration:18,maxDamagePerSecond:18});

/** Runtime-only objects: never included among inhabited bodies or landing destinations. */
export function systemCosmicBodies(system,seed='farwake'){
 if(!system?.frontier)return[];
 const authored=system.cosmic;
 if(!authored&&(!String(system.id).startsWith('frontier-')||hash(`${seed}:${system.id}:stellar-remnant`)%47!==0))return[];
 const rng=random(`${seed}:${system.id}:stellar-position`);
 return[{id:`${system.id}:blackhole`,name:authored?.name||'Uncatalogued stellar remnant',kind:'blackhole',landable:false,biome:'void',
  x:1450+(rng()-.5)*120,y:-1300+(rng()-.5)*120,radius:COSMIC_RULES.coreRadius,...COSMIC_RULES,
  color:'#e8ad79',description:'A stellar black hole. The amber boundary warns of gravitational pull; the inner red boundary marks damaging tidal shear. Turn outward and thrust to escape.'}];
}

const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
/** Pure hazard read used by controls, the HUD and the simulation. */
export function cosmicInfluence(ship,bodies=[]){
 const x=finite(ship?.x),y=finite(ship?.y);let ax=0,ay=0,damageRate=0,nearest=null;
 for(const body of Array.isArray(bodies)?bodies:[]){
  if(body?.kind!=='blackhole')continue;
  const dx=finite(body.x)-x,dy=finite(body.y)-y,distance=Math.hypot(dx,dy),warningRadius=Math.max(1,finite(body.warningRadius,COSMIC_RULES.warningRadius));
  if(distance>=warningRadius)continue;
  const gravityRadius=Math.max(1,finite(body.gravityRadius,COSMIC_RULES.gravityRadius)),coreRadius=clamp(finite(body.coreRadius,body.radius||COSMIC_RULES.coreRadius),1,gravityRadius-1),tideRadius=clamp(finite(body.tideRadius,COSMIC_RULES.tideRadius),coreRadius+1,gravityRadius);
  const strength=smooth((gravityRadius-distance)/(gravityRadius-coreRadius)),acceleration=clamp(finite(body.maxAcceleration,COSMIC_RULES.maxAcceleration),0,COSMIC_RULES.maxAcceleration)*strength;
  const nx=distance>1e-8?dx/distance:Math.cos(finite(ship?.angle)),ny=distance>1e-8?dy/distance:Math.sin(finite(ship?.angle));
  ax+=nx*acceleration;ay+=ny*acceleration;
  const severity=smooth((tideRadius-distance)/(tideRadius-coreRadius));
  damageRate+=clamp(finite(body.maxDamagePerSecond,COSMIC_RULES.maxDamagePerSecond),0,COSMIC_RULES.maxDamagePerSecond)*severity;
  const level=severity>0?'danger':strength>0?'pull':'warning';
  if(!nearest||distance<nearest.distance){const text=level==='danger'?'TIDAL SHEAR · Turn outward and thrust':level==='pull'?'GRAVITY WELL · Turn outward to leave':'GRAVITY WARNING · Keep outside the amber boundary';
   nearest={id:body.id,name:body.name||'Stellar remnant',distance,level,severity:level,escapeAngle:Math.atan2(-ny,-nx),text,warning:text};}
 }
 const magnitude=Math.hypot(ax,ay);if(magnitude>COSMIC_RULES.maxAcceleration){ax*=COSMIC_RULES.maxAcceleration/magnitude;ay*=COSMIC_RULES.maxAcceleration/magnitude;}
 return{ax,ay,damageRate:Math.min(COSMIC_RULES.maxDamagePerSecond,damageRate),hazard:nearest};
}

/** Apply after flight integration; prediction passes damage:false. Never mutates inputs. */
export function applyCosmicHazards(ship,delta,bodies=[],{damage=true}={}){
 const next={...ship},dt=clamp(finite(delta),0,.25),influence=cosmicInfluence(ship,bodies),amount=damage?influence.damageRate*dt:0;
 if(dt){
  next.vx=finite(ship?.vx)+influence.ax*dt;next.vy=finite(ship?.vy)+influence.ay*dt;
  next.x=finite(ship?.x)+influence.ax*dt*dt*.5;next.y=finite(ship?.y)+influence.ay*dt*dt*.5;
 }
 return{ship:next,hazard:influence.hazard,damage:amount};
}
