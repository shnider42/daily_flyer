// Beneath The Shadow: a complete expedition under a city built to hide an engine.
// No DOM, random geometry or client authority. Authored jumps use the normal USE action.
export const SHADOW_ID='beneath-the-shadow';
export const SHADOW_WORLD_REVISION=2;
export const SHADOW_PUZZLE_IDS=['street-feed','street-bridge','aqueduct-flow','aqueduct-latch','aqueduct-sluice'];
function createShadow(){
  const width=121,height=113,cells=Array.from({length:height},()=>Array(width).fill('#'));
  const carve=(x1,z1,x2,z2,v='.')=>{for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)cells[z][x]=v;};
  const doors=[],interactables=[],pickups=[],enemies=[],landmarks=[],wallNotices=[],platformRooms=[],addedSolidBounds=[],gardenZones=[],skylights=[];
  const sectors=[
    ['descent','The falling road',50,94,72,109,'rail'],['exchange','Under the city',48,70,74,90,'hub'],
    ['forge','The rivet works',6,74,40,106,'foundry'],['null','The still laboratory',84,76,114,106,'reactor'],
    ['lantern','Lantern quarter',6,36,40,64,'archives'],['gantry','Suspended street',48,36,74,64,'rail'],
    ['hydra','House of Echoes',84,36,114,64,'floodworks'],['chapel','Chapel of the absent',6,5,40,27,'archives'],
    ['bridge','The broken aqueduct',48,5,74,27,'rail'],['engine','The buried sun',84,5,114,27,'reactor'],
  ];
  for(const[,,x1,z1,x2,z2]of sectors)carve(x1,z1,x2,z2);
  // Broad return loops; no mandatory simultaneous switches or partner-only jumps.
  carve(59,89,62,95);carve(40,82,48,85);carve(74,82,84,85);
  carve(20,64,23,74);carve(59,64,62,70);carve(98,64,101,76);
  carve(40,53,48,56);carve(74,53,84,56);
  carve(20,27,23,36);carve(59,27,62,36);carve(98,27,101,36);
  carve(40,17,48,20);carve(74,17,84,20);
  const door=(id,x,z,axis,requires=null,extra={})=>{carve(x,z,x,z);doors.push({id,x:x+.5,z:z+.5,axis,requires,open:false,...extra});};
  const seal=(id,x1,z1,x2,z2,axis,requires,label)=>{carve(x1,z1,x2,z2,'#');const x=Math.floor((x1+x2)/2),z=Math.floor((z1+z2)/2);door(id,x,z,axis,requires,{label});};
  seal('arrival',59,92,62,92,'x',null,'Open the descent bulkhead');
  seal('lab-seal',80,82,80,85,'z','boss:warden','Release the Warden laboratory lock');
  seal('lab-north',98,71,101,71,'x','boss:warden','Release the laboratory north lock');
  seal('sun-south',98,31,101,31,'x','relays','Open the buried-sun iris');
  seal('sun-west',79,17,79,20,'z','relays','Open the engine side iris');
  const item=(id,type,x,z,label,extra={})=>interactables.push({id,type,x:x+.5,z:z+.5,label,...extra});
  const supply=(id,type,x,z,amount=1,extra={})=>pickups.push({id,type,x:x+.5,z:z+.5,amount,...extra});
  const foe=(id,type,x,z,hp=65,extra={})=>enemies.push({id,type,x:x+.5,z:z+.5,health:hp,maxHealth:hp,alive:hp>0,...extra});
  const prop=(id,type,x,z,w,d,added=false)=>{carve(x,z,x+w-1,z+d-1,'#');landmarks.push({id,type,x:x+w/2,z:z+d/2,width:w,depth:d,axis:w>d?'x':'z'});if(added)addedSolidBounds.push({id,x1:x,z1:z,x2:x+w,z2:z+d});};
  const record=(id,x,z,label,text)=>item(id,'record',x,z,label,{repeatable:true,text});
  const refuge=(id,x,z)=>item(id,'refuge',x,z,'Rest at the lantern refuge',{requires:'power',repeatable:true});
  const transit=(id,x,z,destination)=>item(id,'transit',x,z,'Lantern transit',{destination,landing:{x:x+.5,z:z+1.5},repeatable:true});
  item('aux-power','power',51,79,'Restore the lantern circuit');
  item('relay-west','relay',10,9,'Ring the western bell',{requires:'boss:warden'});
  item('relay-east','relay',110,39,'Silence the echo bell',{requires:'boss:hydra'});
  item('extraction','exit',65,106,'Raise the road to daylight');
  door('security',65,103,'x','key',{label:'Unlock the road lift'});carve(63,103,67,103,'#');carve(65,103,65,103);
  carve(63,104,67,108); // Lift alcove; its other edges are physical walls.
  carve(62,103,62,109,'#');carve(68,103,68,109,'#');carve(62,109,68,109,'#');
  supply('arrival-ammo','ammo',59,100,36);supply('arrival-health','health',70,97,35);
  supply('rivet-repeater','repeater',11,96,90); // A defended detour, not the spawn rack.
  supply('pump-shotgun','shotgun',10,46,18);
  supply('null-projector','nullgun',108,98,28,{requires:'boss:warden'});
  supply('breach-lance','lance',109,58,16,{requires:'boss:hydra'});
  supply('access-key','key',100,8,1,{requires:'guardian'});
  supply('health-expansion','healthExpansion',9,21,25);
  refuge('exchange-refuge',51,87);refuge('lantern-refuge',9,59);refuge('lab-refuge',87,101);refuge('chapel-refuge',37,24);refuge('echo-refuge',111,61);
  transit('transit-road',53,104,'transit-sun');transit('transit-sun',111,24,'transit-road');
  transit('transit-exchange',71,87,'transit-chapel');transit('transit-chapel',37,7,'transit-exchange');
  // Physical landmarks give the districts different silhouettes and sightlines.
  prop('road-piston','transformer',52,96,3,4);prop('exchange-obelisk','shadow-obelisk',60,76,3,5);
  prop('forge-furnace','transformer',22,86,6,5);prop('forge-crates','sealed-crate',30,98,5,4);
  prop('forge-press','shadow-arch',12,78,3,5);prop('lab-coils','glass-lab',91,85,4,7);
  prop('lab-shield','water-vat',104,84,3,3);prop('quarter-houses','sleep-pod',16,40,4,9);
  prop('quarter-houses-two','sleep-pod',29,52,4,8);prop('quarter-bell','shadow-obelisk',29,39,3,3);
  prop('chapel-altar','shadow-arch',18,8,7,3);prop('chapel-pews','tape-vault',13,15,3,6);
  prop('echo-pillar-west','root-mass',89,45,3,4);prop('echo-pillar-east','root-mass',106,45,3,4);
  prop('sun-core','shadow-sun',97,13,5,5);prop('sun-cover','sealed-crate',87,20,3,3);prop('sun-cover-two','sealed-crate',107,20,3,3);
  // New cover is authored explicitly so an older save can move an operator out
  // of these exact new footprints without accepting arbitrary wall positions.
  prop('road-counterweight','shadow-descent',70,104,2,4,true);
  prop('exchange-switchboard','shadow-exchange',53,72,3,2,true);
  prop('quarter-stage','shadow-lantern',9,38,4,3,true);
  prop('street-anchor','shadow-gantry',70,43,3,5,true);
  prop('chapel-window','shadow-chapel',30,7,3,6,true);
  prop('aqueduct-pump','pump-bank',70,21,3,3,true);
  prop('sun-reservoir','shadow-engine',91,6,3,3,true);
  // The laboratory cultivates a restrained, sterile garden inside cold glass;
  // the House of Echoes is its flooded, overgrown counterpart. Both retain
  // broad walking lanes and the original weapon/boss approaches.
  prop('lab-cultivation','cultivation-bed',90,96,5,3,true);
  prop('lab-irrigation','pump-bank',100,78,2,3,true);
  prop('echo-graftbed','cultivation-bed',95,60,6,2,true);
  prop('echo-waterwheel','pump-bank',95,38,3,2,true);
  prop('echo-glass','glass-lab',110,46,3,3,true);
  gardenZones.push(
    {id:'lab-water',zoneId:'null',x:98.5,z:91,width:7,depth:4,type:'water',palette:'cyan'},
    {id:'lab-growth',zoneId:'null',x:92.5,z:97.5,width:7,depth:5,type:'garden',palette:'green'},
    {id:'lab-cold-floor',zoneId:'null',x:106.5,z:94,width:8,depth:7,type:'lab',palette:'violet'},
    {id:'lab-pipes',zoneId:'null',x:101,z:81,width:5,depth:6,type:'pumpworks',palette:'cyan'},
    {id:'echo-channel',zoneId:'hydra',x:99.5,z:43,width:10,depth:3,type:'water',palette:'cyan'},
    {id:'echo-reeds',zoneId:'hydra',x:98,z:61,width:12,depth:3,type:'garden',palette:'amber'},
    {id:'echo-runoff',zoneId:'hydra',x:98.5,z:53,width:15,depth:3,type:'water',palette:'green'},
    {id:'echo-glass-floor',zoneId:'hydra',x:110,z:47.5,width:6,depth:6,type:'lab',palette:'green'},
    {id:'aqueduct-channel',zoneId:'bridge',x:60,z:15,width:18,depth:14,type:'water',palette:'cyan'},
  );
  skylights.push(
    {id:'lab-skylight',zoneId:'null',x:99.5,z:88,width:17,depth:10},
    {id:'lab-seedlight',zoneId:'null',x:94,z:99,width:12,depth:6},
    {id:'echo-broken-roof',zoneId:'hydra',x:99,z:47,width:23,depth:15,fractured:true},
  );
  // Two genuine gap courses. A safe outside walk keeps required objectives
  // accessible; their islands hide valuable optional routes and rewards.
  const course=(id,x,z,combat=false)=>{
    const feed=combat?'aqueduct-flow':'street-feed',finish=combat?'aqueduct-sluice':'street-bridge';
    const area={id,x1:x,z1:z,x2:x+18,z2:z+14,platforms:[],name:combat?'Tidal lock':'Lantern route',puzzleKind:combat?'flow':'circuit',accent:combat?'#67d5cc':'#e8bf75',controls:combat?[feed,'aqueduct-latch',finish]:[feed,finish],
      instructions:combat?'Open the flow valve, watch the green launch window, then latch the pressure island. Its counterweight holds while you stand on it. Open the far sluice to restore the service walk.':'Cross to the first relay and restore its feed. The middle island will lock in place. Reconnect the far relay to raise the return bridge.',
      routeLabel:combat?'Outside service bank stays walkable':'Outside street stays walkable',completedText:combat?'Flow balanced / service walk restored':'Circuit restored / return bridge raised'};platformRooms.push(area);
    const pads=[[x+1,z+11],[x+7,z+10],[x+7,z+3],[x+14,z+3],[x+14,z+11]];
    pads.forEach(([px,pz],i)=>area.platforms.push({id:`${id}-${i}`,x1:px,z1:pz,x2:px+3,z2:pz+3,role:i===0?'entry':i===4?'exit':i===2?'controlled':'relay',label:i===2?(combat?'Pressure island':'Circuit island'):`${combat?'Lock':'Gantry'} ${i+1}`,
      ...(i===2?combat?{period:8.5,on:6.2,offset:1,unlockAfter:[feed],stableAfter:['aqueduct-latch'],holdWhileOccupied:true}:{period:7,on:4.5,offset:0,stableAfter:[feed]}:{})}));
    for(let i=0;i<pads.length-1;i++){
      const [ax,az]=pads[i],[bx,bz]=pads[i+1];
      item(`jump-${id}-${i}`,'jump',ax+1,az+1,'Cross to the next gantry',{repeatable:true,course:id,target:i+1,landingPhase:area.platforms[i+1],landing:{x:bx+1.5,z:bz+1.5},duration:1.05,...(i===1?{requirementId:feed}:combat&&i===2?{requirementId:'aqueduct-latch'}:{})});
      item(`jump-${id}-back-${i+1}`,'jump',bx+1,bz+1,'Return across the gantry',{repeatable:true,course:id,target:i,landingPhase:area.platforms[i],landing:{x:ax+1.5,z:az+1.5},duration:1.05,...(i===2?{requirementId:feed}:{})});
    }
    area.platforms.push({id:`${id}-return`,x1:x+4,z1:z+12,x2:x+14,z2:z+14,role:'return',label:combat?'Restored service walk':'Restored return bridge',unlockAfter:[finish]});
    const control=(controlId,pad,stage,label,extra={})=>{const[px,pz]=pads[pad];item(controlId,'shadow-puzzle',px+.05,pz+.5,label,{course:id,stage,requires:'power',controlLabel:label,...extra});};
    control(feed,1,1,combat?'Open the flow valve':'Restore the first relay',{
      effect:combat?'flow':'circuit',usedText:combat?'Flow valve open. Launch on green; the pressure island holds under your weight.':'First relay live. The middle island is now permanently stable.',
    });
    if(combat)control('aqueduct-latch',2,2,'Latch the pressure island',{requirementId:feed,effect:'latch',usedText:'Pressure island latched. It will stay up for both operators. Reach the far sluice.'});
    control(finish,combat?4:3,combat?3:2,combat?'Open the return sluice':'Reconnect the return bridge',{requirementId:combat?'aqueduct-latch':feed,effect:'restore',reward:combat?{armor:35,ammo:{slugs:12}}:{armor:25,ammo:{cells:12}},usedText:combat?'Sluice balanced. The service walk is restored. Armor and lance ammunition recovered.':'Route restored. The return bridge is raised. Armor and Null cells recovered.'});
    supply(`${id}-cache`,combat?'slugs':'cells',pads[2][0]+1,pads[2][1]+1,combat?22:24);
    if(combat)foe('aqueduct-emplacement','spitter',72,9,90,{stationary:true});
  };
  course('street',51,40);course('aqueduct',51,8,true);
  // Three independently counted secrets, each with a visible seam or clue.
  for(const[id,x,z,title]of[['cache-panel',7,103,'The foreman’s loose panel'],['secret-chapel',37,11,'The bell without a rope'],['secret-gantry',67,45,'The lantern beneath the walkway']]){
    item(id,'secret',x,z,title,{reward:true});
  }
  record('record-road',69,100,'01 / The daylight contract','The city paid for a second sunrise. The contractors built one beneath the first. When the shadow appeared at noon, they sealed the road and changed the maps.');
  record('record-exchange',52,77,'02 / Light has weight','LANTERN OFFICE: The lamps are not lighting the district. They are holding its ceiling up. Restore their circuit before disturbing the bells.');
  record('record-forge',10,92,'03 / The Warden’s key','The Warden controls the still laboratory. Its mortar is bolted to the floor. Cover breaks the shot; the hot barrel must cool between salvos.');
  record('record-lab',107,96,'04 / A still wound','NULL PROJECTOR: A marked root cannot divide for eight seconds. Mark it, switch to a heavier weapon, finish the wound before the blue corona fades. The street conduits answer the same field.');
  record('record-lantern',8,55,'05 / People under the light','We kept the houses after the people left. Familiar rooms calmed the engine. Yesterday a lamp lit in a room we had demolished. No one volunteered to count its occupants.');
  record('record-hydra',86,60,'06 / Seven mouths','The first root becomes two. Those become four. The seventh generation never came: each branch spends what the parent had left. Without the null field, keep space and finish every mouth.');
  record('record-chapel',11,25,'07 / The last bell','Ring both bells to open the sun. One is guarded by iron; one by echoes. The evacuation lift is already here. We built the way home before we learned what we had buried.');
  record('record-engine',113,8,'08 / Beneath the shadow','The sun was never a light. It was a mouth held open by the city’s current. Take its key, leave its lamps burning, and let the road remember the sky.');
  // The projector also earns a shortcut, independently of the hydra fight.
  seal('null-shortcut',44,53,44,56,'z','weapon:nullgun','Discharge the blue seal with the Null projector');
  for(const[id,x,z,title,sub]of[
    ['road-sign',54,100.02,'BENEATH THE SHADOW','THE SECOND SUN / LOWER ROAD'],
    ['forge-sign',25,91.02,'RIVET WORKS','THE WARDEN NEVER LEAVES ITS POST'],
    ['lab-sign',93,92.02,'STILLGLASS CONSERVATORY','BLUE MARK / THEN FINISH THE ROOT'],
    ['echo-sign',90,49.02,'HOUSE OF ECHOES','THE DROWNED ORCHARD / SEVEN MOUTHS'],
    ['sun-sign',99,18.02,'THE BURIED SUN','LEAVE THE LAMPS BURNING'],
    ['street-sign',71.5,48.02,'SUSPENDED STREET','FEED / STABILIZE / RECONNECT'],
    ['aqueduct-sign',71.5,24.02,'TIDAL LOCK','FLOW / GREEN WINDOW / LATCH / SLUICE'],
  ])wallNotices.push({id,x,z,dx:0,dz:-1,title,sub,width:3,height:.9,bottom:1.05});
  for(const[id,,x1,z1,x2,z2]of sectors){if(['descent','chapel'].includes(id))continue;
    supply(`${id}-ammo`,'ammo',x1+2,z2-2,55);supply(`${id}-rivets`,'ammo',x2-2,z2-2,55);
    supply(`${id}-health`,'health',x2-2,z1+2,45);supply(`${id}-shells`,'shells',x1+3,z2-4,16);
    supply(`${id}-cells`,'cells',x2-3,z1+4,16);supply(`${id}-slugs`,'slugs',x1+2,z1+2,12);
  }
  foe('forge-watch','runner',14,98);foe('forge-spitter','spitter',34,94,75);foe('forge-brute','brute',32,80,145);
  foe('iron-warden','spitter',25,78,420,{guardian:true,stationary:true,bossGroup:'warden',bossName:'The Iron Warden'});
  foe('exchange-runner','runner',68,72);foe('exchange-emplacement','spitter',72,74,95,{stationary:true});
  foe('lantern-stalker','stalker',35,44,86);foe('lantern-runner','runner',22,57);foe('lab-runner','runner',105,81);foe('lab-emplacement','spitter',111,86,100,{stationary:true});
  // Each new threat first appears with readable floor space and real cover;
  // later districts combine their different pressures. The teaching course
  // stays free of authored enemies, and every required route remains on foot.
  foe('forge-sower','cinder-sower',17,88,82,{introduction:true});
  foe('lantern-widow','tether-widow',21,43,92,{introduction:true});
  foe('lab-skimmer','glass-skimmer',99,90,68,{introduction:true});
  foe('echo-maw','lantern-maw',87,51,86,{introduction:true});
  foe('chapel-sower','cinder-sower',28,17,82);foe('chapel-widow','tether-widow',18,17,92);
  foe('aqueduct-skimmer','glass-skimmer',72,16,68);
  foe('engine-skimmer','glass-skimmer',92,12,68);foe('engine-maw','lantern-maw',106,16,86);
  foe('echo-bulwark','bulwark',87,40,160);
  const roots=[[99,45],[95,50],[103,50],[91,56],[97,57],[102,57],[109,55]];
  roots.forEach(([x,z],i)=>foe(`echo-root-${i}`,'hydra',x,z,i?0:310,{maxHealth:i<3?230:150,guardian:true,stationary:true,bossGroup:'hydra',bossName:'The Many-Mouthed',rootIndex:i,dormant:i>0,...(i===0?{maxHealth:310}:{})}));
  foe('sun-guardian','brute',100,22,740,{guardian:true,bossGroup:'sun',bossName:'The Umbra Engine'});
  foe('sun-turret','spitter',111,10,105,{stationary:true});foe('sun-turret-west','spitter',87,10,105,{stationary:true});
  const identities={
    descent:{identity:'Rustbound descent',accent:'#e6a575',motif:'counterweights',landmarkLabel:'The suspended road lift',description:'Tall counterweights and a single strip of daylight frame the way home.'},
    exchange:{identity:'Lantern exchange',accent:'#e5bf6f',motif:'lamp-circuits',landmarkLabel:'The circuit obelisk',description:'A civic switching hall routes warm lantern light into every district.'},
    forge:{identity:'The iron choir',accent:'#ed7956',motif:'furnace-teeth',landmarkLabel:'The rivet furnace',description:'Low furnace teeth, press frames and hot iron break the Warden’s firing lanes.'},
    null:{identity:'Stillglass conservatory',accent:'#8de0cf',motif:'frosted-cultivation',landmarkLabel:'The sealed seed laboratory',description:'Cold glass preserves pale cultivation beds above violet irrigation channels.'},
    lantern:{identity:'The false neighbourhood',accent:'#bda3ee',motif:'window-lanterns',landmarkLabel:'The abandoned street stage',description:'Narrow house fronts and repeating windows surround a small silent square.'},
    gantry:{identity:'The skyless street',accent:'#74bedb',motif:'broken-suspension',landmarkLabel:'The hanging street anchor',description:'Broken suspended islands become a usable route as their lantern circuit returns.'},
    hydra:{identity:'The drowned orchard',accent:'#b4d783',motif:'root-irrigation',landmarkLabel:'The fractured growing house',description:'An overgrown glass roof shelters root pillars, flooded channels and the seven mouths.'},
    chapel:{identity:'Rainbell chapel',accent:'#a2b6ea',motif:'tall-ribs',landmarkLabel:'The blind chapel window',description:'Tall blue ribs and a blind window lead toward the western bell.'},
    bridge:{identity:'The tidal aqueduct',accent:'#5bc7c3',motif:'sluice-wheels',landmarkLabel:'The aqueduct pressure pump',description:'Flow valves and a counterweighted island restore a service walk above moving water.'},
    engine:{identity:'The captive second sun',accent:'#ebad5b',motif:'radial-core',landmarkLabel:'The buried solar core',description:'Amber reservoirs and radial machinery focus every sightline on the engine.'},
  };
  const zones=sectors.map(([id,name,x1,z1,x2,z2,palette])=>({id,name,shortName:name,x1,x2:x2+1,z1,z2:z2+1,palette,...identities[id]}));
  for(const landmark of landmarks)landmark.shadowDistrict=zones.find(zone=>landmark.x>=zone.x1&&landmark.x<zone.x2&&landmark.z>=zone.z1&&landmark.z<zone.z2)?.id;
  return {id:'beneath-the-shadow-v1',missionId:SHADOW_ID,name:'Beneath The Shadow',signCode:'S-21',shadow:true,shadowRevision:SHADOW_WORLD_REVISION,exploration:true,upgradeNames:{},enemyAwarenessDistance:25,
    width,height,grid:cells.map(r=>r.join('')),spawn:{x:60.5,z:106.5,angle:0},coopSpawns:[{x:60.5,z:106.5,angle:0},{x:58.5,z:106.5,angle:0}],
    guardianId:'sun-guardian',guardianName:'The Umbra Engine',doors,interactables,pickups,enemies,landmarks,wallNotices,platformRooms,addedSolidBounds,gardenZones,skylights,zones,hazards:[],
  };
}
export const SHADOW=createShadow();
export const SHADOW_ADDED_SOLID_BOUNDS=SHADOW.addedSolidBounds;
export const SHADOW_MISSION={id:SHADOW_ID,levelId:SHADOW.id,name:SHADOW.name,number:'008',subtitle:'They buried a second sun.',briefing:'Descend through ten districts beneath an abandoned city. Restore the lantern circuit, earn new weapons in the rivet works and stillglass conservatory, reconnect the suspended street and balance the tidal aqueduct. Four new threats inhabit the streets, glass laboratories and drowned orchard. Defeat the Iron Warden and the multiplying House of Echoes to ring both bells. The Null projector can stop a wounded root dividing, but a careful early assault can defeat every generation. Silence the Umbra Engine, take its key and return to daylight. Solo or two-player co-op.',steps:['Restore the lantern circuit','Earn the Warden’s laboratory access','Recover the Null projector or challenge the roots early','Ring both bells and silence the Umbra Engine','Return to the road lift']};
export const bossDefeated=(game,group)=>game.state.enemies.some(e=>e.bossGroup===group)&&game.state.enemies.filter(e=>e.bossGroup===group).every(e=>!e.alive);
const contains=(p,x,z)=>x>=p.x1&&x<p.x2&&z>=p.z1&&z<p.z2;
const used=(game,id)=>game?.state?.interactables?.some(o=>o.id===id&&o.used)===true;
const allUsed=(game,ids)=>!!ids?.length&&ids.every(id=>used(game,id));
const operators=game=>Object.values(game?.state?.players||{solo:game?.state?.player}).filter(Boolean);

// The two-argument form deliberately describes the authored mechanical cycle.
// Gameplay and rendering pass game (or just {state}) to include shared controls,
// restored walks and the aqueduct's weight/arrival counterweight. No timer or
// floating platform flag needs to be serialized separately from used controls.
export function platformStatus(p,time=0,game=null){
  if(!p)return{solid:false,stable:false,held:false,unlocked:false,remaining:0,wait:null,phase:0};
  const unlocked=!game||!p.unlockAfter?.length||allUsed(game,p.unlockAfter);
  const stable=unlocked&&(!p.period||!!game&&allUsed(game,p.stableAfter));
  const held=unlocked&&!!game&&!!p.holdWhileOccupied&&operators(game).some(player=>player.alive!==false&&(
    !player.jump&&contains(p,player.x,player.z)||player.jump&&contains(p,player.jump.targetX,player.jump.targetZ)));
  const phase=p.period?((time+(p.offset||0))%p.period+p.period)%p.period:0;
  const solid=unlocked&&(stable||held||phase<p.on);
  return{solid,stable,held,unlocked,phase,remaining:stable||held?null:solid?Math.max(0,p.on-phase):0,wait:!unlocked?null:solid?0:p.period-phase};
}
export function platformSolid(p,time,game){return platformStatus(p,time,game).solid;}
export function shadowGroundAt(game,x,z,time=game.state.time){
  const grid=game.level.grid;
  if(grid&&grid[Math.floor(z)]?.[Math.floor(x)]!=='.')return false;
  const room=game.level.platformRooms?.find(r=>contains(r,x,z));
  return !room||room.platforms.some(p=>contains(p,x,z)&&platformSolid(p,time,game));
}
export function courseStatus(game,roomOrId){
  const room=typeof roomOrId==='string'?game.level?.platformRooms?.find(r=>r.id===roomOrId):roomOrId;
  if(!room)return null;
  const controls=(room.controls||[]).map(id=>game.state.interactables.find(o=>o.id===id)).filter(Boolean);
  const completed=controls.filter(o=>o.used).length,total=(room.controls||[]).length,solved=total>0&&completed===total;
  const nextControl=controls.find(o=>!o.used)||null;
  const phase=solved?'complete':!game.state.power?'unpowered':completed===0?'start':room.puzzleKind==='flow'&&completed===1?'timing':'restoring';
  const moving=room.platforms.find(p=>p.period),window=moving?platformStatus(moving,game.state.time,game):null;
  return{id:room.id,name:room.name,solved,phase,label:solved?room.completedText:!game.state.power?'Restore the lantern circuit':nextControl?.controlLabel||room.name,completed,total,progress:total?completed/total:0,nextControlId:nextControl?.id||null,nextControl,
    controlledPadIds:room.platforms.filter(p=>p.stableAfter?.length||p.unlockAfter?.length).map(p=>p.id),window};
}
export function shadowPuzzleInfo(game,o){
  if(o?.type!=='shadow-puzzle')return null;
  const status=courseStatus(game,o.course),complete=!!o.used;
  const dependency=o.requirementId?game.state.interactables.find(other=>other.id===o.requirementId):null;
  const active=game.state.status==='playing'&&game.state.player.alive!==false&&!game.state.player.jump;
  const blocked=!!o.requirementId&&!dependency?.used;
  return{complete,completed:status?.completed||0,total:status?.total||0,progress:status?.progress||0,
    text:complete?o.usedText:!game.state.power?'Restore the lantern circuit before using this control':blocked?`First: ${dependency?.controlLabel||'restore the preceding control'}`:o.controlLabel,
    label:complete?'RESTORED':!game.state.power?'OFFLINE':blocked?'LOCKED':o.effect==='flow'?'FLOW':o.effect==='latch'?'LATCH':o.effect==='restore'?'RESTORE':'POWER',
    canUse:active&&!complete&&game.state.power&&!blocked};
}
export function useShadowPuzzle(game,o){
  const info=shadowPuzzleInfo(game,o);
  if(!info?.canUse){if(info)game._events.push({type:'message',text:info.text});return false;}
  const checkpoint=game._checkpoint?.state||game._checkpoint;
  const checkpointUsed=checkpoint?.interactables?.find(saved=>saved.id===o.id)?.used;
  o.used=true;
  const reward=players=>{for(const player of players){
      if(o.reward?.armor)player.armor=Math.min(100,player.armor+o.reward.armor);
      for(const[key,amount]of Object.entries(o.reward?.ammo||{}))player.ammo[key]=(player.ammo[key]||0)+amount;
    }};
  reward(operators(game));
  // A permanent repair must not consume its one-time reward when retrying an
  // earlier refuge. Credit its existing checkpoint supply allowance once;
  // used flags still prevent either operator from collecting the reward again.
  if(checkpoint&&!checkpointUsed)reward(operators({state:checkpoint}));
  const status=courseStatus(game,o.course);
  game._events.push({type:'shadow-puzzle',id:o.id,course:o.course,x:o.x,z:o.z,text:o.usedText,completed:status.completed,total:status.total,solved:status.solved,...(game.state.player.id?{playerId:game.state.player.id}:{})},{type:'message',text:o.usedText});
  game.state.effects.push({id:`route-${++game._serial}`,type:'teleport',x:o.x,z:o.z,life:.7});
  game._syncPermanentProgress?.();
  return true;
}
export function shadowPuzzleStateValid(interactables,power){
  const flags=new Map(interactables.map(o=>[o.id,o.used]));
  return SHADOW.interactables.filter(o=>o.type==='shadow-puzzle').every(o=>!flags.get(o.id)||(power===true&&(!o.requirementId||flags.get(o.requirementId)===true)));
}
export function jumpInfo(game,o){
  const course=game.level.platformRooms?.find(r=>r.id===o.course),target=course?.platforms[o.target];
  const p=game.state.player;
  const facing=Math.atan2(o.landing.x-p.x,-(o.landing.z-p.z));
  const aligned=Math.abs(Math.atan2(Math.sin(facing-p.angle),Math.cos(facing-p.angle)))<1.05;
  const dependency=o.requirementId?game.state.interactables.find(other=>other.id===o.requirementId):null;
  const unlocked=!o.requirementId||dependency?.used===true;
  // Reserve enough mechanical window for the whole jump and readable landing.
  // Once committed, the aqueduct counterweight holds for the arriving player;
  // it cannot disappear beneath an operator deciding which control to use.
  const horizon=(o.duration||1.05)+1.25;
  const now=platformStatus(target,game.state.time,game);
  const ready=!!target&&unlocked&&now.solid&&(now.stable||now.held||now.remaining>=horizon);
  const waitSeconds=!unlocked||!target?null:ready?0:now.unlocked?Math.max(0,target.period-now.phase):null;
  const controlText=dependency?.controlLabel||'Restore the route control';
  return {text:!unlocked?`First: ${controlText}`:!aligned?'Face the landing lights':!ready?`Wait for a green launch window${waitSeconds===null?'':` · ${Math.ceil(waitSeconds)}s`}`:'Jump to the lit gantry',label:!unlocked?'LOCKED':!aligned?'FACE':!ready?'WAIT':'JUMP',
    ready,aligned,waitSeconds,landingWindow:now.remaining,targetId:target?.id||null,canUse:game.state.status==='playing'&&p.alive!==false&&!p.jump&&aligned&&ready};
}
export function updateTraversal(game,dt){
  if(!game.level.shadow)return false;
  const p=game.state.player;
  if(p.jump){const j=p.jump;j.t=Math.min(j.duration,j.t+dt);const a=j.t/j.duration;p.x=j.x+(j.targetX-j.x)*a;p.z=j.z+(j.targetZ-j.z)*a;p.elevation=Math.sin(a*Math.PI)*1.15;p.moving=true;
    if(a===1){p.jump=null;p.elevation=0;}return true;}
  const room=game.level.platformRooms.find(r=>contains(r,p.x,p.z));
  const safe=!room||room.platforms.some(q=>contains(q,p.x,p.z)&&platformSolid(q,game.state.time,game));
  if(safe){if(!room||room.platforms.some(q=>contains(q,p.x,p.z)&&platformStatus(q,game.state.time,game).stable))p.safeGround={x:p.x,z:p.z};return false;}
  const home=p.safeGround||game.level.spawn;p.x=home.x;p.z=home.z;p.elevation=0;p.moving=false;
  // Falling always returns to the last stable ledge; no lost gear or soft lock.
  game._hurt(10,'fall');game._events.push({type:'message',text:'Safety tether caught you. Watch the landing lights.'});return true;
}
export function shadowObjective(game){
  const s=game.state,find=id=>[...s.interactables,...s.pickups,...s.enemies,...s.doors].find(o=>o.id===id);
  const at=(id,title,detail,stage,action='interact')=>{const t=find(id);return{title,detail,stage,action,x:t.x,z:t.z};};
  if(s.status==='won')return at('extraction','Daylight','The road rises. The lamps remain below.','complete',null);
  if(!find('arrival').open)return at('arrival','Follow the falling road','Open the northern bulkhead. Your weapons must be found in the city below.','arrival');
  if(!s.power)return at('aux-power','Restore the lantern circuit','The console is on the west side of the exchange.','power');
  if(!s.player.hasRepeater)return at('rivet-repeater','Explore the rivet works','Take the western route. The repeater is in the defended southern store.','weapon','collect');
  if(!bossDefeated(game,'warden'))return at('iron-warden','Break the Iron Warden','Its emplacement cannot chase you. Use the furnace for cover between warned salvos.','guardian','fight');
  if(!s.player.hasNull&&!bossDefeated(game,'hydra'))return at('null-projector','Recover the Null projector','The Warden released the still laboratory. Mark roots blue, then finish them before the field fades. The hydra can also be fought without it.','weapon','collect');
  if(!bossDefeated(game,'hydra')){const root=s.enemies.find(e=>e.bossGroup==='hydra'&&e.alive);return at(root.id,'Silence the House of Echoes','Mark each root with the Null projector, then switch weapons. Unmarked roots divide into two; there are only two further generations.','guardian','fight');}
  const bell=s.interactables.find(o=>o.type==='relay'&&!o.used);if(bell)return at(bell.id,bell.label,'The western bell is in the chapel; the echo bell is in the House of Echoes.','relays');
  if(!bossDefeated(game,'sun'))return at('sun-guardian','Shut the second sun','Reach the north-eastern engine room. Dodge its charge and strike its cooling core.','guardian','fight');
  if(!s.player.key)return at('access-key','Recover the road-lift key','The key is at the northern end of the engine chamber.','key','collect');
  return at('extraction','Return to daylight','Activate the sun transit and its road partner, or retrace the district loops. Unlock the lift at the south end of the road.','return');
}

export function updateShadowEnemy(game,enemy,dt,target,visible){
  if(!enemy.stationary)return false;
  if(enemy.telegraph){
    enemy.telegraph.remaining=Math.max(0,enemy.telegraph.remaining-dt);
    if(enemy.telegraph.remaining===0){
      const aim=Math.atan2(enemy.telegraph.x-enemy.x,-(enemy.telegraph.z-enemy.z));
      const offsets=enemy.guardian?[-.2,0,.2]:[0];
      for(const offset of offsets)game.state.projectiles.push({id:`p-${++game._serial}`,type:'plasma',x:enemy.x,z:enemy.z,dx:Math.sin(aim+offset)*4.4,dz:-Math.cos(aim+offset)*4.4,life:4,damage:enemy.guardian?17:12});
      const attackRate=game._difficulty.attackRate||1;
      enemy.telegraph=null;enemy.attackCooldown=(enemy.guardian?2.6:2.1)/attackRate;
      if(enemy.guardian){enemy.bossPhase='recover';enemy.phaseTimer=1.7/attackRate;}
      game._events.push({type:'enemy-shot',id:enemy.id,x:enemy.x,z:enemy.z});
    }return true;
  }
  if(enemy.guardian&&enemy.bossPhase==='recover'){
    enemy.phaseTimer=Math.max(0,enemy.phaseTimer-dt);if(!enemy.phaseTimer)enemy.bossPhase='stalk';return true;
  }
  if(visible&&Math.hypot(enemy.x-target.x,enemy.z-target.z)<13&&enemy.attackCooldown===0){
    const duration=enemy.guardian?1.05:.9;
    game._warning(enemy,enemy.guardian?'volley':'shot',target,duration,.8);
    if(enemy.guardian){enemy.bossPhase='volley-windup';enemy.phaseTimer=duration;}
  }return true;
}
export function splitShadowRoot(game,enemy){
  if(enemy.type!=='hydra'||enemy.rootIndex>=3||enemy.suppressedTimer>0)return;
  const children=[enemy.rootIndex*2+1,enemy.rootIndex*2+2];
  for(const index of children){const child=game.state.enemies.find(e=>e.id===`echo-root-${index}`);if(!child?.dormant)continue;
    child.dormant=false;child.alive=true;child.health=child.maxHealth;child.active=true;child.attackCooldown=1.7;child.bossPhase='stalk';child.telegraph=null;
    game.state.effects.push({id:`root-${++game._serial}`,type:'teleport',x:child.x,z:child.z,life:.8});
  }
  game._events.push({type:'root-split',id:enemy.id,x:enemy.x,z:enemy.z,text:'The wound divides. A Null mark prevents the next split.'});
}
