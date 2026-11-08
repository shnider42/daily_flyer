/** Shared, DOM-free cabin geometry for rendering, server validation and boarding AI. */
export const CABIN_TILE = 24;
export const CABIN_CLASSES = ['sparrow','hauler','frigate','capital'];
const pt=(x,y)=>({x:(x+.5)*CABIN_TILE,y:(y+.5)*CABIN_TILE});
const room=(id,name,x,y,w,h,color)=>({id,name,x,y,w,h,color});
const fixture=(kind,x,y,w=1,h=1,color=null,solid=true)=>({kind,x,y,w,h,color,solid});
const definitions={
 sparrow:{
  name:'Sparrow',cols:32,rows:26,berths:4,
  rooms:[room('medical','SICKBAY',3,2,11,9,'#82bcae'),room('bridge','BRIDGE',17,2,12,9,'#97c6ce'),room('engineering','ENGINEERING',3,15,11,9,'#e5ba7b'),room('quarters','CREW QUARTERS',17,15,12,9,'#a6accc')],
  corridors:[{x:3,y:11,w:26,h:3},{x:14,y:3,w:3,h:20}],
  doors:[{x:13,y:6,w:1,h:2},{x:17,y:6,w:1,h:2},{x:13,y:18,w:1,h:2},{x:17,y:18,w:1,h:2},{x:23,y:10,w:2,h:1},{x:23,y:14,w:2,h:2}],
  stations:{helm:[25,5],engineering:[10,20],medical:[8,7],security:[7,12],navigation:[20,8]},
  spawn:[15,12],bunks:[[20,20],[22,20],[24,20],[26,20]],breaches:[[3,12]],combatSpawns:[[4,11],[5,12],[4,13],[6,13]],crewSpawns:[[9,18],[22,7],[10,7],[15,5],[15,8],[15,18],[19,12],[25,12],[27,21]],archive:[19,22],manifest:[18,12],
  fixtures:[fixture('bed',5,4,1,2,'#91c3b3'),fixture('cabinet',11,4,1,2,'#779b9f'),fixture('console',19,3,8,1,'#59878f'),fixture('engine',5,17,2,4,'#528491'),fixture('equipment',11,16,1,1,'#718f97'),fixture('table',19,16,2,1,'#8b7963'),fixture('window',19,2,8,1,null,false),fixture('window',3,4,1,5,null,false)]
 },
 hauler:{
  name:'Wayfarer Hauler',cols:44,rows:30,berths:6,
  rooms:[room('engineering','DRIVE ROOM',2,3,11,10,'#d6ad78'),room('cargo','CARGO HOLD',13,3,10,10,'#c6af82'),room('medical','SICKBAY',26,3,7,10,'#82bcae'),room('bridge','BRIDGE',33,3,9,10,'#91c4cf'),room('quarters','SIX BERTHS',2,17,21,11,'#a6accc'),room('security','SECURITY',26,17,7,11,'#d29783'),room('galley','MESS & ARCHIVE',33,17,9,11,'#b7c09b')],
  corridors:[{x:3,y:13,w:38,h:3},{x:23,y:3,w:3,h:24}],
  doors:[{x:7,y:12,w:2,h:1},{x:17,y:12,w:2,h:1},{x:29,y:12,w:2,h:1},{x:36,y:12,w:2,h:1},{x:10,y:16,w:2,h:2},{x:29,y:16,w:2,h:2},{x:36,y:16,w:2,h:2}],
  stations:{helm:[38,6],engineering:[8,8],medical:[29,7],security:[29,22],navigation:[35,9]},
  spawn:[5,14],bunks:[[5,22],[8,22],[11,22],[14,22],[17,22],[20,22]],breaches:[[3,14],[40,14]],combatSpawns:[[4,13],[5,15],[39,13],[39,15]],crewSpawns:[[9,9],[37,9],[30,9],[30,24],[36,23],[9,25],[18,25],[24,7],[24,21]],archive:[38,25],manifest:[35,21],
  fixtures:[fixture('engine',4,5,2,5,'#57818a'),fixture('equipment',10,5,1,2,'#b6a783'),fixture('cargo',15,5,2,2,'#93866b'),fixture('cargo',19,5,2,2,'#607d83'),fixture('cargo',15,9,2,2,'#a18459'),fixture('bed',27,5,1,2,'#91c3b3'),fixture('cabinet',31,5,1,2,'#719f99'),fixture('console',35,4,5,1,'#59878f'),fixture('armory',27,19,4,1,'#8a919c'),fixture('table',35,19,4,1,'#978469'),fixture('books',40,22,1,3,'#82988b'),fixture('window',35,3,5,1,null,false),fixture('window',4,27,17,1,null,false)]
 },
 frigate:{
  name:'Peregrine Frigate',cols:48,rows:36,berths:8,
  rooms:[room('bridge','COMMAND BRIDGE',16,2,16,12,'#91c4cf'),room('medical','MEDICAL',3,3,12,11,'#83c5b3'),room('security','SECURITY & ARMORY',3,20,12,13,'#d99782'),room('portquarters','PORT QUARTERS',33,3,12,11,'#acb5dc'),room('starboardquarters','AFT QUARTERS',33,20,12,13,'#b4add1'),room('engineering','TWIN REACTORS',16,21,16,12,'#e3b577')],
  corridors:[{x:22,y:3,w:4,h:29},{x:4,y:15,w:40,h:4}],
  doors:[{x:8,y:13,w:2,h:2},{x:8,y:19,w:2,h:2},{x:37,y:13,w:2,h:2},{x:37,y:19,w:2,h:2}],
  stations:{helm:[24,6],engineering:[24,27],medical:[9,8],security:[9,25],navigation:[29,10]},
  spawn:[24,17],bunks:[[35,10],[38,10],[41,10],[43,10],[35,28],[38,28],[41,28],[43,28]],breaches:[[4,17],[43,17]],combatSpawns:[[5,16],[5,18],[42,16],[42,18]],crewSpawns:[[25,29],[28,8],[11,8],[11,25],[20,17],[36,12],[36,30],[13,17],[39,17]],archive:[19,10],manifest:[20,17],
  fixtures:[fixture('console',19,3,10,1,'#5c8c98'),fixture('commandtable',22,9,3,2,'#6fa6a5'),fixture('bed',5,5,1,3,'#90c0b1'),fixture('bed',12,5,1,3,'#90c0b1'),fixture('cabinet',5,11,2,1,'#799f98'),fixture('armory',5,22,8,1,'#8e8b8a'),fixture('table',5,28,3,1,'#9b896d'),fixture('engine',18,24,2,5,'#64949b'),fixture('engine',28,24,2,5,'#64949b'),fixture('window',18,2,12,1,null,false),fixture('window',17,32,14,1,null,false)]
 },
 capital:{
  name:'Horizon Capital',cols:58,rows:42,berths:10,
  rooms:[room('medical','MEDICAL WING',3,2,18,10,'#85c9b5'),room('bridge','COMMAND BRIDGE',22,2,14,10,'#9dced9'),room('security','SECURITY WING',37,2,18,10,'#df9f89'),room('portquarters','PORT QUARTERS / 01–05',3,15,24,12,'#aeb8de'),room('starboardquarters','STARBOARD / 06–10',31,15,24,12,'#b6b1da'),room('hangar','HANGAR & FREIGHT',3,30,18,10,'#c2af89'),room('engineering','REACTOR CONTROL',22,30,14,10,'#e3b477'),room('galley','COMMON ROOM & ARCHIVE',37,30,18,10,'#b2c5a0')],
  corridors:[{x:4,y:12,w:50,h:3},{x:4,y:27,w:50,h:3},{x:27,y:3,w:4,h:36}],
  doors:[{x:10,y:11,w:2,h:1},{x:46,y:11,w:2,h:1},{x:10,y:15,w:2,h:1},{x:26,y:20,w:1,h:2},{x:46,y:15,w:2,h:1},{x:31,y:20,w:1,h:2},{x:10,y:26,w:2,h:1},{x:46,y:26,w:2,h:1},{x:10,y:30,w:2,h:1},{x:46,y:30,w:2,h:1}],
  stations:{helm:[29,5],engineering:[29,35],medical:[11,7],security:[46,7],navigation:[33,8]},
  spawn:[29,28],bunks:[[6,22],[10,22],[14,22],[18,22],[22,22],[34,22],[38,22],[42,22],[46,22],[50,22]],breaches:[[4,13],[53,28]],combatSpawns:[[5,12],[5,14],[52,27],[52,29]],crewSpawns:[[30,36],[32,6],[13,7],[48,7],[24,13],[6,24],[18,24],[36,24],[48,24]],archive:[48,36],manifest:[40,34],
  fixtures:[fixture('bed',5,4,1,3,'#94c9b9'),fixture('bed',8,4,1,3,'#94c9b9'),fixture('bed',17,4,1,3,'#94c9b9'),fixture('cabinet',13,3,2,1,'#7ba49d'),fixture('console',24,3,10,1,'#628e9c'),fixture('armory',39,4,4,1,'#9c9183'),fixture('armory',49,4,4,1,'#9c9183'),fixture('table',39,8,3,1,'#897d67'),fixture('cargo',5,32,3,2,'#9e8c6d'),fixture('cargo',13,32,3,2,'#6c8c8d'),fixture('shuttle',5,35,7,3,'#98b8b7',false),fixture('engine',24,33,2,4,'#60969e'),fixture('engine',32,33,2,4,'#60969e'),fixture('table',39,32,4,1,'#9d8b6f'),fixture('table',47,32,4,1,'#9d8b6f'),fixture('books',52,35,1,3,'#8d9d8f'),fixture('plant',39,37,1,1,'#76a78b',false),fixture('window',24,2,10,1,null,false),fixture('window',4,2,15,1,null,false),fixture('window',38,2,15,1,null,false)]
 }
};
export function resolveCabinClass(value='sparrow'){
 const key=typeof value==='object'?value.shipClassId||value.shipClass||value.classId||value.id:value;
 return CABIN_CLASSES.includes(key)?key:'sparrow';
}
/** Tile layout is authority-safe: walkable also excludes all solid furniture. */
export function cabinLayout(value='sparrow'){
 const shipClass=resolveCabinClass(value),d=definitions[shipClass],layout={...d,shipClass,tile:CABIN_TILE,tileSize:CABIN_TILE,width:d.cols*CABIN_TILE,height:d.rows*CABIN_TILE};
 layout.rooms=d.rooms.map(r=>({...r}));layout.corridors=d.corridors.map(r=>({...r}));layout.doors=d.doors.map(r=>({...r}));
 layout.fixtures=d.fixtures.map(f=>({...f}));
 layout.bunks=d.bunks.map(([x,y],index)=>({...pt(x,y),index,tileX:x,tileY:y}));
 for(const bunk of layout.bunks)layout.fixtures.push(fixture('bunk',bunk.tileX,bunk.tileY-4,1,3,indexColor(bunk.index),true));
 layout.stations=Object.fromEntries(Object.entries(d.stations).map(([role,[x,y]])=>[role,{...pt(x,y),role,tileX:x,tileY:y}]));
 for(const key of ['spawn','archive','manifest'])layout[key]=pt(...d[key]);
 for(const key of ['breaches','combatSpawns','crewSpawns'])layout[key]=d[key].map(p=>pt(...p));
 const floor=new Uint8Array(d.cols*d.rows),paint=(r)=>{for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(x>=0&&y>=0&&x<d.cols&&y<d.rows)floor[y*d.cols+x]=1;};
 for(const r of layout.rooms)paint({x:r.x+1,y:r.y+1,w:r.w-2,h:r.h-2});
 for(const r of [...layout.corridors,...layout.doors])paint(r);
 layout.floor=Array.from(floor);layout.walkable=Array.from(floor);
 for(const bunk of layout.bunks){const x=bunk.tileX+1,y=bunk.tileY-4;if(floor[y*d.cols+x])layout.fixtures.push(fixture('cabinet',x,y,1,1,'#7e9499',true));}
 for(const f of layout.fixtures)if(f.solid)for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)if(x>=0&&y>=0&&x<d.cols&&y<d.rows)layout.walkable[y*d.cols+x]=0;
 return layout;
}
function indexColor(index){return['#819aab','#9fa58d','#a293aa','#b39979','#79a49b'][index%5];}
export function isCabinWalkable(layout,x,y,radius=6){
 for(const[ox,oy]of[[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]){
  const tx=Math.floor((x+ox)/layout.tile),ty=Math.floor((y+oy)/layout.tile);
  if(tx<0||ty<0||tx>=layout.cols||ty>=layout.rows||!layout.walkable[ty*layout.cols+tx])return false;
 }
 return true;
}
