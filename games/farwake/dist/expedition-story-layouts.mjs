/** Authored expedition geography. Coordinates here are tiles, never world pixels.
 * The inspection plan is also the source of the rendered/combat collision map.
 * Original Hearth caves and the Vey front never pass through this module.
 */
const T={VOID:0,FLOOR:1,WALL:2,PATH:3,GROUND:4,WATER:5,PAD:6,METAL:7,RUBBLE:8,GRATE:9};
const BLOCKED=new Set([T.VOID,T.WALL,T.WATER]);
export const EXPEDITION_LAYOUT_IDS=Object.freeze(['bridgefront','trenches','crashfield','tidal-reef','quarry','fungal-grove','courtyard','archive-yard','powerplant','clinic-camp','creature-nest','ice-fissure','antenna-array','flooded-ruins','observatory','convoy-road']);
export const EXPEDITION_LAYOUT_ANCHORS=Object.freeze({entry:Object.freeze([4,31]),exit:Object.freeze([2,31]),tasks:Object.freeze([[9,25],[14,10],[26,8],[38,13],[35,26],[23,25]].map(Object.freeze)),residents:Object.freeze([[8,28],[11,27],[16,26]].map(Object.freeze))});
const DEFAULTS={
 bridgefront:['barren','continental','RIVER CROSSINGS'],trenches:['volcanic','ashlands','RELIEF APPROACH'],crashfield:['arid','dunes','WRECK / RECOVERY FIELD'],
 'tidal-reef':['ocean','reefs','LOW-TIDE WALKWAYS'],quarry:['arid','mesas','QUARRY TERRACES'],'fungal-grove':['verdant','spores','CANOPY / OPEN SKY'],
 courtyard:['verdant','city','COMMON COURTYARD'],'archive-yard':['barren','ruins','PUBLIC RECORD YARD'],powerplant:['shelter','factory','TURBINE HALL'],
 'clinic-camp':['arid','steppe','TRIAGE / WATER / SHELTER'],'creature-nest':['verdant','spores','NESTING GROUND'],'ice-fissure':['ice','icefields','ICE BRIDGES'],
 'antenna-array':['barren','craters','ARRAY / SERVICE TRAILS'],'flooded-ruins':['ocean','ruins','FLOODMARK / WALKWAYS'],observatory:['shelter','factory','OBSERVATION GALLERY'],
 'convoy-road':['arid','red-rock','CONVOY / ROADSIDE']
};
const inBounds=(p,x,y)=>x>=0&&y>=0&&x<p.cols&&y<p.rows;
function rect(p,x,y,w,h,tile){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(p.rows,Math.ceil(y+h));yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(p.cols,Math.ceil(x+w));xx++)p.tiles[yy][xx]=tile;}
function ellipse(p,cx,cy,rx,ry,tile){for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(p.rows-1,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(p.cols-1,Math.ceil(cx+rx));x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)p.tiles[y][x]=tile;}
function trail(p,points,tile=T.PATH,width=2){for(let i=1;i<points.length;i++){const[a,b]=[points[i-1],points[i]],steps=Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]));for(let n=0;n<=steps;n++)rect(p,Math.round(a[0]+(b[0]-a[0])*n/(steps||1)),Math.round(a[1]+(b[1]-a[1])*n/(steps||1)),width,width,tile);}}
function prop(p,kind,x,y,w=1,h=1,color=null,extra={}){p.decor.push({kind,x,y,w,h,color,...extra});}
function cover(p,kind,x,y,w,h,color){rect(p,x,y,w,h,T.WALL);prop(p,kind,x,y,w,h,color,{cover:true});}
function sign(p,text,x,y,color='#c5d2b4'){prop(p,'label',x,y,1,1,color,{text});}
function zone(p,id,name,x,y,w,h){p.zones.push({id,name,x,y,w,h});}
function hall(p,x,y,w,h,doors=[]){rect(p,x,y,w,h,T.WALL);rect(p,x+1,y+1,w-2,h-2,T.FLOOR);for(const[dx,dy,dw=2,dh=1]of doors)rect(p,dx,dy,dw,dh,T.FLOOR);}
function rocks(p,points,kind='rock',color='#999687'){for(const[x,y]of points)cover(p,kind,x,y,1,1,color);}

const BUILDERS={
 bridgefront(p){
  rect(p,21,0,5,36,T.WATER);rect(p,19,12,2,8,T.WATER);rect(p,26,19,2,8,T.WATER);
  trail(p,[[2,31],[11,26],[21,26],[32,26],[38,17],[38,9]],T.PATH,3);
  rect(p,19,25,10,3,T.METAL);rect(p,19,9,9,3,T.GRATE);trail(p,[[10,26],[11,10],[20,10]],T.PATH,2);trail(p,[[27,10],[38,10]],T.PATH,2);
  rect(p,19,18,3,2,T.RUBBLE);rect(p,25,18,4,2,T.RUBBLE);
  for(const[x,y,w]of[[12,14,5],[13,21,5],[30,14,5],[30,22,5],[37,5,5]])cover(p,'story-sandbags',x,y,w,1,'#a19a75');
  prop(p,'story-trail-marker',18,27,2,2,'#b3c7ac');prop(p,'story-trail-marker',28,8,2,2,'#99b6c8');
  prop(p,'banner',16,11,.5,3,'#8bb9ab');prop(p,'banner',30,10,.5,3,'#bd9a7c');
  sign(p,'NORTH FOOTBRIDGE',12,7);sign(p,'LOW CROSSING',28,29);sign(p,'BROKEN SPAN',20,16,'#c8ae89');
  zone(p,'approach','Western relief bank',2,22,16,12);zone(p,'crossing','Two river crossings',19,8,10,21);zone(p,'far-bank','Eastern earthworks',30,5,14,24);
 },
 trenches(p){
  for(const[x,y,w]of[[11,9,14],[29,9,14],[15,17,8],[27,17,16],[11,24,9],[28,24,15]])cover(p,'story-sandbags',x,y,w,1,'#98846b');
  trail(p,[[3,31],[8,27],[8,14],[13,14],[13,5],[25,5],[25,14],[37,14],[37,21],[24,21],[24,29],[42,29]],T.GRATE,2);
  ellipse(p,30,5,3,2,T.WATER);ellipse(p,18,20,3,2,T.RUBBLE);ellipse(p,39,31,3,2,T.RUBBLE);ellipse(p,42,19,3,2,T.WATER);
  cover(p,'story-tent',4,5,5,3,'#7f8b76');cover(p,'cargo',31,28,3,2,'#8a7d64');
  for(const[x,y]of[[22,12],[33,20],[42,4],[17,30]])prop(p,'debris',x,y,2,1,'#b29c85');
  sign(p,'MEDICAL APPROACH',3,25);sign(p,'FORWARD TRAVERSES',29,12,'#c4a28c');
  zone(p,'approach','Sheltered rear trench',2,25,17,9);zone(p,'traverses','Broken front line',11,7,33,18);
 },
 crashfield(p){
  ellipse(p,29,16,15,10,T.RUBBLE);trail(p,[[43,29],[33,21],[22,13],[18,9]],T.RUBBLE,5);
  cover(p,'story-wreckage',21,12,9,4,'#9aa5a0');cover(p,'story-wreckage',30,17,7,3,'#8a9699');cover(p,'story-wreckage',15,7,5,3,'#ad9c85');
  cover(p,'story-wreckage',39,23,4,5,'#7c8d96');cover(p,'engine',32,8,2,4,'#7c9994');
  trail(p,[[3,31],[10,25],[18,25],[18,19],[12,14],[12,9],[26,8],[38,8],[38,14],[41,18],[35,27]],T.PATH,2);
  for(const[x,y]of[[19,20],[26,20],[33,23],[40,30],[11,17],[29,5]])prop(p,'debris',x,y,2,1,'#b3a18a');
  prop(p,'story-tent',5,21,3,2,'#98aaa0');sign(p,'RECOVERY LINE',5,23);sign(p,'BROKEN MIDSHIP',25,10,'#d0b894');
  zone(p,'camp','Salvage camp',3,22,13,11);zone(p,'hull','Broken hull and skid furrow',15,7,29,24);
 },
 'tidal-reef'(p){
  rect(p,0,0,48,36,T.WATER);ellipse(p,8,28,9,7,T.GROUND);ellipse(p,14,10,8,7,T.GROUND);ellipse(p,32,8,8,6,T.GROUND);ellipse(p,38,24,8,8,T.GROUND);ellipse(p,23,25,4,5,T.GROUND);
  trail(p,[[8,28],[10,21],[14,10],[26,8],[36,10],[38,24],[23,25],[10,27]],T.GRATE,2);
  ellipse(p,18,8,2,1,T.WATER);ellipse(p,40,20,3,2,T.WATER);
  for(const[x,y]of[[5,21],[10,6],[19,14],[30,5],[43,25],[32,30],[21,28]]){cover(p,'coral',x,y,2,1,'#8fb8a8');prop(p,'alien-plant',x,y-1,2,2,'#a7c49d');}
  prop(p,'story-trail-marker',11,18,2,2,'#c9c49b');prop(p,'story-trail-marker',28,26,2,2,'#c9c49b');
  sign(p,'TIDE POOLS',4,18);sign(p,'REEF BOARDWALK',28,13);zone(p,'shore','Dry arrival beach',1,24,15,10);zone(p,'islets','Reef islands and raised paths',5,3,41,28);
 },
 quarry(p){
  ellipse(p,26,17,18,13,T.WALL);ellipse(p,26,17,15,10,T.GROUND);ellipse(p,26,17,11,7,T.WALL);ellipse(p,26,17,8,4,T.RUBBLE);
  trail(p,[[4,31],[10,26],[10,10],[16,10],[16,6],[37,6],[40,13],[40,26],[30,26],[30,22],[20,22],[20,17],[26,17]],T.PATH,3);
  trail(p,[[14,10],[26,8],[38,13]],T.PATH,2);trail(p,[[9,25],[23,25],[35,26]],T.PATH,2);
  cover(p,'engine',30,15,3,3,'#a79b7b');cover(p,'cargo',5,18,3,2,'#a29373');
  rocks(p,[[6,8],[7,13],[43,8],[44,25],[17,29],[35,31]],'rock','#b19a75');
  prop(p,'pipe',25,15,1,6,'#b5a587');sign(p,'UPPER RIM',13,4);sign(p,'CUT FLOOR',22,19,'#d2bc8d');
  zone(p,'ramp','Quarry haul road',5,6,9,27);zone(p,'terraces','Two cut terraces',10,4,32,27);zone(p,'floor','Extraction floor',19,14,15,8);
 },
 'fungal-grove'(p){
  trail(p,[[4,31],[9,25],[13,17],[14,10],[26,8],[38,13],[35,26],[23,25],[9,25]],T.PATH,2);
  ellipse(p,23,17,5,4,T.WATER);ellipse(p,39,5,4,2,T.WATER);
  for(const[x,y,w,h]of[[4,8,4,4],[19,4,3,5],[31,13,4,4],[17,27,3,4],[39,24,4,4],[26,29,4,4],[7,17,3,3]]){cover(p,'story-mushroom',x,y,w,h,'#8ca8ac');}
  for(const[x,y]of[[10,5],[25,11],[29,22],[12,29],[43,15],[23,30]])prop(p,'alien-plant',x,y,2,2,'#c5b1bc');
  sign(p,'CANOPY GAP',11,14);sign(p,'SPORE POOL',19,21,'#b8cbb0');zone(p,'glade','Open arrival glade',2,23,13,11);zone(p,'grove','Living canopy and pools',3,3,42,30);
 },
 courtyard(p){
  rect(p,5,5,38,26,T.FLOOR);rect(p,7,7,34,22,T.PATH);rect(p,10,10,28,16,T.GROUND);rect(p,20,14,8,7,T.WATER);
  hall(p,4,3,12,7,[[9,9,3,1]]);hall(p,33,3,11,7,[[37,9,3,1]]);
  for(const[x,y]of[[8,12],[8,21],[39,12],[39,22],[17,6],[29,6]])cover(p,'resonator',x,y,1,2,'#b5c5b1');
  for(const[x,y,w]of[[13,14,4],[31,17,4],[20,26,6]])cover(p,'bench',x,y,w,1,'#9d9f85');
  trail(p,[[3,31],[8,28],[16,26],[35,26],[38,13]],T.PATH,2);prop(p,'fountain',22,16,4,3,'#adc6b7');
  prop(p,'banner',18,3,.5,4,'#8dbbaf');prop(p,'banner',29,3,.5,4,'#b9a3c0');sign(p,'OPEN FORUM',17,11);
  zone(p,'forum','Open-air forum',8,11,31,16);zone(p,'pavilions','Two delegation pavilions',4,3,40,7);
 },
 'archive-yard'(p){
  rect(p,3,3,41,29,T.FLOOR);rect(p,17,12,14,12,T.GROUND);
  for(const[x,y,w,h]of[[7,5,2,8],[18,4,7,2],[30,4,2,7],[36,17,2,7],[6,18,2,6],[18,28,11,2]])cover(p,'books',x,y,w,h,'#939b8b');
  rect(p,4,15,12,1,T.WALL);rect(p,31,12,12,1,T.WALL);rect(p,15,4,1,7,T.WALL);rect(p,31,25,1,6,T.WALL);
  trail(p,[[3,31],[11,27],[14,10],[26,8],[38,13],[41,26],[23,25]],T.PATH,2);
  prop(p,'story-wreckage',20,16,5,3,'#8ca0a2');prop(p,'window',8,2,5,1,'#a9c3bb');prop(p,'window',33,2,8,1,'#a9c3bb');
  sign(p,'UNSORTED ARRIVALS',5,26);sign(p,'OPEN RECORD COURT',18,13);sign(p,'WITNESS DESKS',33,28);
  zone(p,'yard','Roofless record court',17,12,14,12);zone(p,'records','Archive wings',3,3,41,29);
 },
 powerplant(p){
  rect(p,0,0,48,36,T.VOID);hall(p,2,2,44,32,[[2,30,1,3]]);
  cover(p,'engine',19,12,4,9,'#79a7a5');cover(p,'engine',28,12,4,9,'#7f9cae');cover(p,'engine',40,19,3,5,'#92a093');
  rect(p,7,17,8,2,T.WATER);rect(p,33,4,1,8,T.WALL);rect(p,6,4,5,3,T.WALL);
  trail(p,[[3,31],[12,31],[12,24],[35,24],[35,9],[26,9],[13,9],[13,14],[5,14]],T.GRATE,2);
  trail(p,[[14,10],[14,25],[23,25],[35,26],[38,13]],T.METAL,2);
  prop(p,'pipe',24,10,1,13,'#a5ad94');prop(p,'pipe',34,13,1,9,'#a5ad94');prop(p,'console',35,5,8,1,'#82b3ad');
  prop(p,'light',5,3,7,.4,'#b5d9b4');prop(p,'light',34,3,8,.4,'#b5d9b4');sign(p,'ISOLATE / REPAIR / RESTART',13,4);sign(p,'COOLANT',6,20,'#a3c4cf');
  zone(p,'service','Clear service gallery',3,24,42,9);zone(p,'turbines','Three turbine beds',17,10,25,14);
 },
 'clinic-camp'(p){
  trail(p,[[3,31],[10,28],[10,17],[10,10],[38,10],[38,27],[23,27],[23,18]],T.PATH,3);trail(p,[[10,18],[38,18]],T.PATH,3);
  for(const[x,y,w,h,c]of[[4,4,7,4,'#aab8a0'],[18,4,6,4,'#b3b19a'],[31,4,7,4,'#a4b5b3'],[17,12,8,4,'#a6c1b3'],[31,21,6,3,'#b3b99a'],[17,29,6,3,'#aba9bf']])cover(p,'story-tent',x,y,w,h,c);
  for(const[x,y]of[[7,13],[27,21],[41,17]])prop(p,'clinic-sign',x,y,1,1,'#a5d0ba');
  cover(p,'cistern',42,26,3,4,'#8bb4ad');cover(p,'cargo',4,19,3,2,'#a99c7c');prop(p,'laundry',27,29,12,2,'#afc2ab');
  prop(p,'table',17,21,4,1,'#a99d80');prop(p,'bowls',17,21,4,1,'#c7b58d');
  sign(p,'INTAKE / SHADE',4,25);sign(p,'CARE CANOPY',17,10);sign(p,'SHARED WATER',37,31);zone(p,'intake','Sheltered intake',2,23,14,11);zone(p,'camp','Open camp lanes',4,4,41,28);
 },
 'creature-nest'(p){
  ellipse(p,30,15,14,11,T.RUBBLE);ellipse(p,30,15,9,7,T.GROUND);
  for(const[x,y,w,h]of[[17,7,4,9],[33,4,9,3],[40,17,4,7],[22,22,8,2],[11,18,3,5]])cover(p,'story-mushroom',x,y,w,h,'#8d9c80');
  trail(p,[[3,31],[9,25],[15,26],[17,18],[14,10],[26,8],[38,13],[35,26],[23,25]],T.PATH,2);
  ellipse(p,29,16,3,2,T.WATER);prop(p,'story-nest',25,11,5,4,'#b7c69b');prop(p,'story-nest',34,19,4,3,'#d2bf9a');
  prop(p,'bones',22,18,2,1,'#c4b8a0');prop(p,'clawmarks',16,14,2,1,'#b3a17f');prop(p,'story-wreckage',5,20,3,2,'#91a6a2');
  sign(p,'OLD SURVEY TRAIL',4,29);sign(p,'NURSERY RIM',28,25,'#c6c19d');zone(p,'approach','Abandoned survey approach',2,21,16,13);zone(p,'nest','Open nesting hollow',18,6,24,20);
 },
 'ice-fissure'(p){
  for(let y=0;y<36;y++){const x=18+Math.floor(y/3);rect(p,x,y,4,1,T.WATER);}
  trail(p,[[3,31],[9,25],[14,10],[26,8],[38,13],[35,26],[23,25],[9,25]],T.PATH,2);
  rect(p,18,9,9,3,T.METAL);rect(p,23,24,10,3,T.GRATE);
  rocks(p,[[5,5],[10,15],[15,19],[31,4],[38,20],[42,29],[19,30]],'ice','#bfded8');
  cover(p,'story-tent',6,20,4,3,'#a7bec4');cover(p,'equipment',36,5,3,2,'#9cb2b4');
  prop(p,'story-trail-marker',16,10,2,2,'#d8c7a0');prop(p,'story-trail-marker',32,25,2,2,'#d8c7a0');
  sign(p,'CREVASSE / TWO CROSSINGS',23,29);zone(p,'shelf','Western ice shelf',1,3,17,31);zone(p,'fissure','Diagonal blue-ice fissure',18,0,17,36);
 },
 'antenna-array'(p){
  const pads=[[9,7],[24,5],[38,7],[12,17],[35,18],[22,28],[40,29]];
  for(const[x,y]of pads){ellipse(p,x,y,5,4,T.PAD);trail(p,[[24,18],[x,y]],T.GRATE,1);cover(p,'story-dish',x-1,y-1,2,2,'#a0b7b7');}
  rect(p,21,15,7,6,T.METAL);prop(p,'console',22,16,4,1,'#90b5a7');
  trail(p,[[3,31],[9,25],[14,10],[26,8],[38,13],[35,26],[23,25]],T.PATH,2);
  rocks(p,[[4,14],[18,3],[30,9],[43,18],[29,32]],'rock','#a8aaa0');sign(p,'ARRAY CONTROL',20,22);sign(p,'SERVICE RING',6,12);
  zone(p,'array','Seven isolated dish pads',4,1,42,33);zone(p,'control','Central control apron',21,15,7,6);
 },
 'flooded-ruins'(p){
  rect(p,0,0,48,36,T.WATER);rect(p,1,25,15,10,T.GROUND);rect(p,8,6,12,13,T.FLOOR);rect(p,23,4,11,10,T.FLOOR);rect(p,34,10,11,13,T.FLOOR);rect(p,19,22,22,10,T.FLOOR);
  for(const[x,y,w,h]of[[8,6,12,1],[8,7,1,7],[23,4,11,1],[33,5,1,6],[44,10,1,13],[34,21,6,1],[19,31,13,1]])rect(p,x,y,w,h,T.WALL);
  trail(p,[[4,31],[9,25],[14,10],[26,8],[38,13],[35,26],[23,25],[9,25]],T.GRATE,2);
  cover(p,'books',10,7,2,5,'#83988e');cover(p,'story-wreckage',26,27,5,2,'#859d9b');cover(p,'resonator',40,15,2,3,'#91b9b0');
  prop(p,'story-trail-marker',18,21,2,2,'#c3c6a6');prop(p,'alien-plant',36,7,2,2,'#b3c6a2');sign(p,'DRY WAY BACK',3,28);sign(p,'OLD HIGH-WATER LINE',24,15);
  zone(p,'shore','Dry rescue bank',1,25,15,10);zone(p,'ruins','Separate flooded foundations',8,4,38,28);
 },
 observatory(p){
  rect(p,0,0,48,36,T.VOID);ellipse(p,29,16,17,14,T.WALL);ellipse(p,29,16,16,13,T.FLOOR);
  hall(p,3,5,14,10,[[16,9,1,3]]);hall(p,3,22,15,12,[[3,30,1,3],[17,25,1,3]]);
  rect(p,7,14,4,9,T.WALL);rect(p,8,14,2,9,T.FLOOR);trail(p,[[4,31],[14,26],[24,26],[37,21],[38,13],[29,8],[16,10]],T.PATH,2);
  ellipse(p,28,17,7,6,T.PAD);cover(p,'story-dish',25,13,5,5,'#b3c3ba');cover(p,'console',33,7,7,1,'#8db6b8');cover(p,'books',5,6,2,5,'#a2a99a');
  prop(p,'window',20,3,13,1,'#a7c5cf');prop(p,'window',43,12,1,9,'#a7c5cf');prop(p,'light',5,23,8,.4,'#b8ccb4');
  sign(p,'OPEN SHUTTER GALLERY',19,5);sign(p,'WARM ROOM',6,23);zone(p,'warm-room','Arrival and weather room',3,22,15,12);zone(p,'gallery','Circular telescope gallery',13,3,33,27);
 },
 'convoy-road'(p){
  trail(p,[[6,35],[14,27],[20,19],[27,10],[34,0]],T.PATH,7);
  trail(p,[[5,35],[13,27],[19,19],[26,10],[33,0]],T.RUBBLE,1);trail(p,[[14,35],[22,27],[28,19],[35,10],[42,0]],T.RUBBLE,1);
  cover(p,'story-wreckage',18,14,5,7,'#9ea6a3');cover(p,'story-wreckage',30,3,4,6,'#ab9a83');cover(p,'story-wreckage',28,29,6,3,'#8ca5a5');
  cover(p,'story-sandbags',34,19,3,1,'#b7a17c');cover(p,'story-sandbags',40,19,4,1,'#b7a17c');cover(p,'story-tent',4,20,4,3,'#a5ac8a');cover(p,'cargo',39,26,3,2,'#a99272');
  trail(p,[[3,31],[9,25],[14,10],[26,8],[38,13],[35,26],[23,25]],T.PATH,2);
  rocks(p,[[6,5],[9,13],[41,6],[43,22],[22,31]],'rock','#a99c83');prop(p,'story-trail-marker',36,19,2,2,'#c1b990');
  sign(p,'CONVOY STOP',4,26);sign(p,'PASSING LANE',26,21);zone(p,'road','Diagonal convoy road',7,1,33,34);zone(p,'stop','Roadside camp',2,20,13,14);
 }
};

function reachable(p){const seen=new Set(),start=p.spawn.y*p.cols+p.spawn.x,queue=[start];seen.add(start);for(let i=0;i<queue.length;i++){const n=queue[i],x=n%p.cols,y=Math.floor(n/p.cols);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*p.cols+xx;if(inBounds(p,xx,yy)&&!BLOCKED.has(p.tiles[yy][xx])&&!seen.has(k)){seen.add(k);queue.push(k);}}}return seen;}
function connectAnchor(p,anchor){
 const x=Math.max(1,Math.min(p.cols-2,Math.floor(anchor.x))),y=Math.max(1,Math.min(p.rows-2,Math.floor(anchor.y))),target=y*p.cols+x;
 if(BLOCKED.has(p.tiles[y][x]))p.tiles[y][x]=p.tiles[y][x]===T.WATER?T.GRATE:p.outdoors?T.PATH:T.FLOOR;
 const connected=reachable(p);if(connected.has(target))return;
 // A short access repair favors existing floor over removing cover, and cover
 // over crossing water. It cannot regenerate a room or move a story object.
 const count=p.cols*p.rows,cost=new Float64Array(count).fill(Infinity),previous=new Int32Array(count).fill(-1),visited=new Uint8Array(count);cost[target]=0;let found=-1;
 for(let guard=0;guard<count;guard++){
  let n=-1,best=Infinity;for(let i=0;i<count;i++)if(!visited[i]&&cost[i]<best){best=cost[i];n=i;}if(n<0)break;if(connected.has(n)){found=n;break;}visited[n]=1;
  const xx=n%p.cols,yy=Math.floor(n/p.cols);
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=xx+dx,ny=yy+dy,k=ny*p.cols+nx;if(nx<1||ny<1||nx>=p.cols-1||ny>=p.rows-1||visited[k])continue;const tile=p.tiles[ny][nx],next=best+(tile===T.WATER?12:BLOCKED.has(tile)?8:1);if(next<cost[k]){cost[k]=next;previous[k]=n;}}
 }
 for(let n=found;n>=0;n=previous[n]){const xx=n%p.cols,yy=Math.floor(n/p.cols),tile=p.tiles[yy][xx];if(BLOCKED.has(tile))p.tiles[yy][xx]=tile===T.WATER?T.GRATE:p.outdoors?T.PATH:T.FLOOR;if(n===target)break;}
}
function allAnchors(site){
 const points=[...EXPEDITION_LAYOUT_ANCHORS.tasks,...EXPEDITION_LAYOUT_ANCHORS.residents].map(([x,y])=>({x,y}));
 for(const item of [...(site.records||[]),...(site.choices||[]),...(site.caches||[]),...(site.residents||[])])if(Number.isFinite(item.x)&&Number.isFinite(item.y))points.push({x:item.x,y:item.y});
 for(const item of site.hostiles||[])if(Number.isFinite(item.tileX)&&Number.isFinite(item.tileY))points.push({x:item.tileX,y:item.tileY});else if(Number.isFinite(item.x)&&Number.isFinite(item.y))points.push({x:Math.floor(item.x/24),y:Math.floor(item.y/24)});
 return points;
}

/** Pure, deterministic, serializable inspection surface used by map/AI tests. */
export function expeditionStoryLayout(site={}){
 const layout=EXPEDITION_LAYOUT_IDS.includes(site.layout)?site.layout:'courtyard',defaults=DEFAULTS[layout],outdoors=site.outdoors??!['powerplant','observatory'].includes(layout);
 const p={layout,cols:48,rows:36,outdoors,biome:site.terrainBiome||(!outdoors&&site.kind==='cave'?'cave':defaults[0]),terrain:site.terrain||defaults[1],tiles:Array.from({length:36},()=>Array(48).fill(T.GROUND)),decor:[],zones:[],spawn:{x:4,y:31},exit:{x:2,y:31},barrierKind:layout==='quarry'?'chasm':null};
 BUILDERS[layout](p);
 if(!p.outdoors&&p.biome==='cave'){
  rect(p,0,0,48,2,T.WALL);rect(p,0,34,48,2,T.WALL);rect(p,0,0,2,36,T.WALL);rect(p,46,0,2,36,T.WALL);
  // A listening shaft uses the exposed rock ridges; the same natural geometry
  // can support a living grove outside without putting a canopy underground.
  p.decor=p.decor.filter(d=>d.kind!=='story-mushroom');
 }
 // The arrival/return apron always has enough room for a captain and guests.
 rect(p,1,29,6,5,outdoors?T.GROUND:T.FLOOR);
 const anchors=[p.exit,...allAnchors(site)];for(const anchor of anchors)connectAnchor(p,anchor);
 // A repaired access tile cannot be visually covered by a solid-looking prop.
 p.decor=p.decor.filter(d=>!d.cover||Array.from({length:Math.ceil(d.h)},(_,dy)=>Array.from({length:Math.ceil(d.w)},(_,dx)=>p.tiles[Math.floor(d.y)+dy]?.[Math.floor(d.x)+dx]===T.WALL).every(Boolean)).every(Boolean));
 sign(p,defaults[2],3,1,'#d1d8b8');sign(p,outdoors?'LANDING TRAIL ←':'RETURN EXIT ←',2,33,'#b9d7b2');
 prop(p,'story-trail-marker',1,27,2,2,'#b9d7b2');
 p.anchors=anchors.map(a=>({x:Math.floor(a.x),y:Math.floor(a.y)}));
 return p;
}

export function buildExpeditionStoryLayout(m,site,{prop,point}){
 const p=expeditionStoryLayout(site);m.tiles=p.tiles;m.outdoors=p.outdoors;m.expedition=true;m.expeditionLayout=p.layout;m.terrain=p.terrain;m.biome=p.biome;
 if(p.outdoors&&(!m.atmosphere||m.atmosphere==='cave'))m.atmosphere='daylight';
 m.spawn=point(p.spawn.x,p.spawn.y);m.exit=point(p.exit.x,p.exit.y);m.storyZones=p.zones;m.storyAnchors=p.anchors.map(a=>point(a.x,a.y));
 if(p.barrierKind)m.regionalBarrierKind=p.barrierKind;
 for(const d of p.decor){const{kind,x,y,w,h,color,...extra}=d;prop(m,kind,x,y,w,h,color,false,extra);}
 return m;
}
