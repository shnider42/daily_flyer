// THE HOLLOW — an authored expedition, not a random maze or a scaled old map.
// Reversible containment routes always have a walkable detour. No simultaneous
// buttons, carrying restrictions, or new touch controls are required in co-op.
function createHollow() {
  const width=129, height=113, cells=Array.from({length:height},()=>Array(width).fill('#'));
  const carve=(x1,z1,x2,z2,value='.')=>{for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)cells[z][x]=value;};
  const doors=[], interactables=[], pickups=[], enemies=[], landmarks=[], wallNotices=[];
  const sectors=[
    ['west','West repeater',4,4,29,33,'rail'], ['choir','The choir vault',36,4,61,33,'reactor'],
    ['listening','Listening gallery',68,4,93,33,'archives'], ['observatory','Empty observatory',100,4,125,33,'reactor'],
    ['wards','Abandoned wards',4,42,29,71,'arrival'], ['exchange','Resonance exchange',36,42,61,71,'hub'],
    ['archive','Cold archive',68,42,93,71,'archives'], ['well','Signal well',100,42,125,71,'foundry'],
    ['freight','Sealed freight',4,80,29,109,'rail'], ['dock','Intake dock',36,80,61,106,'arrival'],
    ['reservoir','Flood reservoir',68,80,93,109,'floodworks'], ['plant','Intake plant',100,80,125,109,'foundry'],
  ];
  for(const[, ,x1,z1,x2,z2]of sectors)carve(x1,z1,x2,z2);
  const gate=(id,x,z,axis,requires=null,extra={})=>{carve(x,z,x,z);doors.push({id,x:x+.5,z:z+.5,axis,requires,open:false,...extra});};
  const pair=(id,x,z,axis,requires=null,extra={})=>{gate(id,x,z,axis,requires,extra);gate(`${id}-side`,x+(axis==='x'?1:0),z+(axis==='z'?1:0),axis,requires,{...extra,paired:id});};
  const item=(id,type,x,z,label,extra={})=>{const o={id,type,x:x+.5,z:z+.5,label,...extra};interactables.push(o);return o;};
  const supply=(id,type,x,z,amount=1,extra={})=>pickups.push({id,type,x:x+.5,z:z+.5,amount,...extra});
  const foe=(id,type,x,z,extra={})=>{const hp={runner:52,spitter:70,brute:145,stalker:86,sentry:120,bulwark:165,mender:80}[type];enemies.push({id,type,x:x+.5,z:z+.5,health:hp,maxHealth:hp,alive:true,...extra});};
  const prop=(id,type,x1,z1,w,d)=>{carve(x1,z1,x1+w-1,z1+d-1,'#');landmarks.push({id,type,x:x1+w/2,z:z1+d/2,width:w,depth:d,axis:w>d?'x':'z'});};
  // South ring and vertical spines: wide enough to pass and flank together.
  for(const x of [16,48,80,112]){carve(x,72,x+1,80);carve(x,34,x+1,42);}
  carve(16,75,113,76); carve(16,38,113,39);
  for(const x of [30,62,94]){carve(x,94,x+5,95);carve(x,56,x+5,57);}
  // The two top outer galleries join each other; the choir has only its relay seal.
  carve(94,20,99,21);
  pair('arrival',48,78,'x');
  pair('freight-lock',32,94,'z','power');pair('reservoir-lock',64,94,'z','power');
  pair('choir-seal',48,35,'x','relays',{label:'Open the choir vault'});
  carve(46,109,52,111);carve(48,107,48,109);
  gate('security',48,108,'x','key',{label:'Unlock the intake lift'});
  // A key-only return from the vault into the exchange is provided by linked transit.
  item('aux-power','power',43,66,'Restore the isolation grid');
  item('relay-west','relay',7,7,'Reconnect the west repeater',{requires:'power'});
  item('relay-east','relay',122,7,'Reconnect the observatory repeater',{requires:'power'});
  item('extraction','exit',50,110,'Leave the listening facility');
  const circuit=(mark,x,z,axis,a,b,field)=>{
    const id=`route-${mark}`,control=`routing-${mark}-a`;
    pair(id,x,z,axis,'power',{kind:'shutter',controlledBy:control,circuitId:`H-${mark}`,mark:String(mark)});
    for(const[index,[cx,cz]]of[a,b].entries())item(`routing-${mark}-${index?'b':'a'}`,'shutter-switch',cx,cz,`Isolation circuit ${mark}`,{
      requires:'power',repeatable:true,doorIds:[id,`${id}-side`],circuitId:`H-${mark}`,mark:String(mark),routing:true,
      ...(index?{}:{containment:{x:field[0]+.5,z:field[1]+.5,radius:field[2]}}),
    });
  };
  circuit(1,32,56,'z',[28,59],[37,59],[22,56,7]);
  circuit(2,96,56,'z',[92,59],[101,59],[108,56,7]);
  circuit(3,96,20,'z',[92,23],[101,23],[109,20,7]);
  // A distinct silhouette and physical cover language in each wing.
  prop('intake-crates','sealed-crate',44,91,8,5);
  prop('exchange-array','listening-array',46,52,6,6);
  prop('ward-pods-n','sleep-pod',10,46,3,7);prop('ward-pods-s','sleep-pod',10,60,3,7);
  prop('ward-console','tape-vault',19,45,6,2);
  for(const [n,x,z]of[[1,7,85],[2,20,96],[3,7,101]])prop(`freight-${n}`,'sealed-crate',x,z,6,4);
  // Cold archive: interleaved shelves with two continuous outside lanes.
  for(const [n,x,z]of[[1,73,45],[2,81,53],[3,73,61]])prop(`tape-${n}`,'tape-vault',x,z,7,3);
  prop('well-array','listening-array',113,46,7,7);prop('well-pods','sleep-pod',115,63,4,6);
  prop('reservoir-pumps','pump-bank',73,88,7,4);prop('reservoir-vat','water-vat',85,98,5,5);
  prop('intake-transformer','transformer',106,89,8,5);prop('intake-crates-east','sealed-crate',118,98,5,6);
  prop('west-rack','tape-vault',11,16,10,3);prop('west-array','listening-array',19,25,5,4);
  prop('gallery-tapes','tape-vault',73,10,3,12);prop('gallery-pods','sleep-pod',84,20,3,8);
  prop('observatory-array','listening-array',115,12,6,6);
  prop('choir-cover-west','listening-array',40,16,3,4);prop('choir-cover-east','listening-array',55,16,3,4);
  prop('choir-tapes','tape-vault',40,7,4,3);
  const refuge=(id,x,z)=>item(id,'refuge',x,z,'Rest at the isolation refuge',{requires:'power',repeatable:true});
  refuge('exchange-refuge',40,68);refuge('freight-refuge',6,107);refuge('archive-refuge',90,69);
  refuge('west-refuge',5,31);refuge('observatory-refuge',123,31);refuge('gallery-refuge',70,31);
  const transit=(id,x,z,destination)=>item(id,'transit',x,z,`${id.replace('transit-','').replaceAll('-',' ')} transit`,{destination,landing:{x:x+.5,z:z+1.5},repeatable:true});
  transit('transit-dock',40,102,'transit-choir');transit('transit-choir',58,29,'transit-dock');
  transit('transit-exchange-west',39,64,'transit-west');transit('transit-west',5,28,'transit-exchange-west');
  transit('transit-exchange-east',58,64,'transit-observatory');transit('transit-observatory',123,28,'transit-exchange-east');
  const record=(id,x,z,title,text)=>item(id,'record',x,z,title,{repeatable:true,text});
  record('record-intake',53,102,'01 / The return count','INTAKE REGISTER: Twelve staff signed in. Thirteen signed out. The extra signature is the night porter\'s. He retired nine years before this wing was built.');
  record('record-exchange',39,66,'02 / Quiet current','ENGINEERING: The isolation rings do not stop the sound. They slow whatever arrives with it. We diverted a ring to open a shortcut. Something crossed the room between two syllables.');
  record('record-wards',6,48,'03 / Empty beds','WARD LOG: The beds are empty. The monitors still count breaths. When we unplugged the microphones, the recording became clearer. No further live input is authorized.');
  record('record-archive',90,66,'04 / A negative delay','ARCHIVE NOTE: First the playback followed us by four seconds. Then one. At 03:17 it answered a question before the technician asked it. The tape was blank when we removed it.');
  record('record-observatory',121,30,'05 / Facing outward','SECURITY ORDER: The locks face the wrong way because this was never a shelter. Keep the repeaters isolated until the vault can be reached. Do not answer a voice that uses your call sign.');
  record('record-choir',58,6,'06 / Last transmission','FINAL TRANSCRIPT: "The building is empty." The same sentence appears on every channel. Under it, in a second hand: "That is what we taught it to say."');
  // Notes remain optional. Their matching physical placards are visible without USE.
  for(const [id,x,z,dx,dz,title,sub]of[
    ['intake-sign',48,96.02,0,-1,'INTAKE: TWELVE','RETURN COUNT: THIRTEEN'],
    ['exchange-sign',49,58.02,0,-1,'NO LIVE INPUT','ISOLATION GRID / H-19'],
    ['ward-sign',13.02,49, -1,0,'THE BEDS ARE EMPTY','DO NOT RESET THE MONITORS'],
    ['archive-sign',76,64.02,0,-1,'PLAYBACK ONLY','DO NOT ANSWER'],
    ['well-sign',116,53.02,0,-1,'KEEP THE FIELD ON','A SHORTER ROUTE HAS A COST'],
    ['choir-sign',42,10.02,0,-1,'THE BUILDING IS EMPTY','FINAL TRANSCRIPT'],
  ])wallNotices.push({id,x,z,dx,dz,title,sub,width:2.7,height:.84,bottom:1.15});
  supply('arrival-ammo','ammo',48,100,40);supply('arrival-armor','armor',51,100,35);
  supply('pump-shotgun','shotgun',46,100,14);supply('rebound-carbine','ricochet',43,100,20);
  supply('arc-caster','arc',58,68,16,{requires:'power'});supply('thumper','grenade',26,106,8,{requires:'power'});
  supply('health-expansion','healthExpansion',6,69,25,{requires:'power'});
  supply('access-key','key',49,7,1,{requires:'guardian'});
  // Authored supplies in every sector; consumables remain collector-specific in co-op.
  for(const [id,,x1,z1,x2,z2]of sectors){
    if(id==='dock')continue;
    supply(`${id}-ammo`,'ammo',x1+1,z2-2,40);supply(`${id}-health`,'health',x2-1,z2-2,40);
    supply(`${id}-shells`,'shells',x1+3,z2-3,16);supply(`${id}-slugs`,'slugs',x2-3,z2-3,16);
    supply(`${id}-grenades`,'grenades',x1+1,z1+2,4);supply(`${id}-cells`,'cells',x2-1,z1+3,8);
  }
  // No enemies in the dock or south exchange. An observer gets time to orient.
  foe('exchange-runner','runner',39,45);foe('exchange-spitter','spitter',57,45);
  foe('ward-echo','stalker',23,52,{echo:true});foe('ward-runner','runner',18,62);foe('ward-mender','mender',26,46);
  foe('freight-bulwark','bulwark',23,86);foe('freight-runner','runner',15,91);foe('freight-spitter','spitter',26,99);
  foe('freight-brute','brute',16,104);foe('freight-mender','mender',6,95);
  foe('reservoir-spitter','spitter',88,85);foe('reservoir-echo','stalker',83,94,{echo:true});foe('reservoir-runner','runner',70,97);
  foe('reservoir-brute','brute',80,106);foe('plant-bulwark','bulwark',117,85);foe('plant-mender','mender',122,88);
  foe('plant-runner','runner',103,97);foe('plant-spitter','spitter',116,106);foe('plant-echo','stalker',120,95,{echo:true});
  foe('archive-bulwark','bulwark',88,49);foe('archive-mender','mender',90,44);foe('archive-echo','stalker',71,58,{echo:true});
  foe('archive-runner','runner',88,60);foe('archive-spitter','spitter',82,68);
  foe('well-echo','stalker',108,52,{echo:true});foe('well-brute','brute',105,63);foe('well-mender','mender',121,58);foe('well-spitter','spitter',110,68);
  foe('west-bulwark','bulwark',13,27);foe('west-echo','stalker',26,22,{echo:true});foe('west-mender','mender',8,14);
  foe('west-spitter','spitter',24,8);foe('west-runner','runner',7,22);
  foe('gallery-security','sentry',78,28,{faction:'security',encounterId:'last-watch'});
  foe('gallery-runner','runner',90,25,{encounterId:'last-watch'});foe('gallery-brute','brute',90,18,{encounterId:'last-watch'});
  foe('gallery-mender','mender',88,13,{encounterId:'last-watch'});foe('gallery-echo','stalker',79,7,{echo:true});
  foe('observatory-echo','stalker',109,20,{echo:true});foe('observatory-bulwark','bulwark',120,23);
  foe('observatory-mender','mender',124,17);foe('observatory-spitter','spitter',105,9);foe('observatory-runner','runner',114,29);
  foe('north-wanderer','runner',66,38);foe('south-wanderer','spitter',88,75);
  foe('hollow-guardian','brute',49,12,{guardian:true,health:620,maxHealth:620});
  foe('choir-echo-west','stalker',39,24,{echo:true});foe('choir-echo-east','stalker',58,24,{echo:true});
  foe('choir-mender','mender',58,8);foe('choir-bulwark','bulwark',45,20);
  return {id:'hollow-19-v1',missionId:'hollow-19',name:'The Hollow',signCode:'H-19',width,height,
    exploration:true,hollow:true,upgradeNames:{},enemyAwarenessDistance:23,
    guardianId:'hollow-guardian',guardianName:'The Choir Keeper',
    grid:cells.map(row=>row.join('')),spawn:{x:48.5,z:102.5,angle:0},
    coopSpawns:[{x:48.5,z:102.5,angle:0},{x:50.5,z:102.5,angle:0}],
    doors,interactables,pickups,enemies,landmarks,wallNotices,
    hazards:[{type:'flood',x1:69,z1:82,x2:72,z2:107},{type:'flood',x1:81,z1:87,x2:84,z2:107}],
    destinationPreview:{doorId:'security',label:'INTAKE LIFT',mark:'19'},
    zones:sectors.map(([id,name,x1,z1,x2,z2,palette])=>({id,name,shortName:name,x1,x2:x2+1,z1,z2:z2+1,palette})),
  };
}
export const HOLLOW=createHollow();
export const HOLLOW_MISSION={id:'hollow-19',levelId:HOLLOW.id,name:'The Hollow',number:'007',subtitle:'The recording answers first.',
  briefing:'A decommissioned listening complex is still transmitting. Restore the isolation grid, explore twelve connected sectors, and reconnect two distant repeaters. Routing cabinets trade local containment for open shortcuts: the blue rings slow the infestation and prevent phase arrivals, but the corridors they power remain shut. Reach the Choir Keeper and return with the lift key. Play solo or coordinate the expedition with a teammate.',
  steps:['Restore the isolation grid','Explore the looping wings and route containment power','Reconnect both distant repeaters','Silence the Choir Keeper','Return by transit and leave']};

// Deliberately computed from authoritative door/control state, never a local FX timer.
export function containmentAt(game,point){
  if(!game.level.hollow||!game.state.power)return null;
  return game.state.interactables.find(control=>control.containment&&!control.used
    &&Math.hypot(point.x-control.containment.x,point.z-control.containment.z)<=control.containment.radius
    &&game.hasLineOfSight(control.containment.x,control.containment.z,point.x,point.z))||null;
}
export function hollowObjective(game){
  const s=game.state,find=id=>[...s.interactables,...s.doors,...s.pickups,...s.enemies].find(o=>o.id===id);
  const at=(id,title,detail,stage,action='interact')=>{const t=typeof id==='string'?find(id):id;return{title,detail,stage,action,x:t.x,z:t.z};};
  if(s.status==='won')return at('extraction','Signal severed','The intake lift leaves the listening complex behind.','complete',null);
  if(!find('arrival').open)return at('arrival','Enter the resonance exchange','Take the equipment in the intake dock, activate its transit, then open the northern airlock.','arrival');
  if(!s.power)return at('aux-power','Restore the isolation grid','The power console is on the southwest side of the exchange.','power');
  const relays=s.interactables.filter(o=>o.type==='relay'&&!o.used).sort((a,b)=>Math.hypot(a.x-s.player.x,a.z-s.player.z)-Math.hypot(b.x-s.player.x,b.z-s.player.z));
  if(relays.length)return at(relays[0],relays[0].label,'The west repeater and empty observatory can be linked in either order. Visit refuges, activate return transit, and use the broad ring corridors to reach either wing.','relays');
  if(!find('choir-seal').open)return at('choir-seal','Open the choir vault','Both repeaters are online. The entrance is north of the resonance exchange.','guardian');
  if(find('hollow-guardian').alive)return at('hollow-guardian','Silence the Choir Keeper','Use the two array banks as cover. Its reactor opens after each committed attack.','guardian','fight');
  if(!s.player.key)return at('access-key','Recover the intake-lift key','The key is at the back of the choir vault.','key','collect');
  if(Math.hypot(s.player.x-48.5,s.player.z-108.5)>35)return at('transit-choir','Return to intake','Activate the vault transit. Its partner is in the dock; the walking route remains open.','return');
  if(!find('security').open)return at('security','Unlock the intake lift','The departure gate is south of the dock.','return');
  return at('extraction','Leave the listening facility','Use the intake-lift terminal to extract.','extraction');
}
