/** SUNCOAST — authored city geometry. Distances are in world pixels. */
export const VEHICLE_TYPES = {
  compact:{name:'Palma hatchback',maxSpeed:315,accel:170,turn:2.5,grip:4.8,w:25,h:47,color:'#e8c357',water:false,health:105},
  sedan:{name:'Marlin sedan',maxSpeed:350,accel:150,turn:2.1,grip:4,w:28,h:57,color:'#cbe1d7',water:false,health:130},
  sport:{name:'Cobre GT',maxSpeed:475,accel:240,turn:2.4,grip:3.2,w:28,h:54,color:'#d96248',water:false,health:95},
  van:{name:'Sol delivery van',maxSpeed:265,accel:110,turn:1.8,grip:4,w:31,h:65,color:'#e4e0cf',water:false,health:180},
  truck:{name:'Bison pickup',maxSpeed:300,accel:130,turn:1.8,grip:4.2,w:32,h:64,color:'#709689',water:false,health:200},
  motorcycle:{name:'Avispa motorcycle',maxSpeed:410,accel:230,turn:3.2,grip:3.8,w:14,h:35,color:'#cf7353',water:false,health:60},
  boat:{name:'Marea runabout',maxSpeed:335,accel:115,turn:1.6,grip:1.4,w:35,h:83,color:'#e9e2ce',water:true,health:155},
  police:{name:'BPD interceptor',maxSpeed:385,accel:190,turn:2.3,grip:4.5,w:29,h:59,color:'#e3e7dc',water:false,health:165}
};
const islands = [
  {id:0,name:'Santa Elena',subtitle:'The neighborhood that raised you',color:'#a6bb87',polygon:[[170,500],[470,320],[1300,340],[1750,580],[1810,1140],[1740,1420],[1820,2170],[1540,2810],[760,2980],[220,2620],[100,1650]]},
  {id:1,name:'Cayo Espejo',subtitle:'Every window sells a different view',color:'#b8c5a1',polygon:[[2250,370],[2690,170],[3420,300],[3710,680],[3650,1350],[3820,1830],[3650,2720],[3190,3060],[2350,2820],[2120,2120],[2180,1560],[2110,840]]},
  {id:2,name:'Puerto Umbral',subtitle:'The port. The money. The fine print.',color:'#8eac94',polygon:[[4230,600],[4750,330],[5470,530],[5720,1040],[5640,1670],[5820,2260],[5390,2820],[4430,2750],[4050,2200],[4160,1480],[4040,960]]}
];
export function pointInPoly(x,y,p){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){let [xi,yi]=p[i],[xj,yj]=p[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))hit=!hit;}return hit;}
export function islandAt(x,y){for(const i of islands)if(pointInPoly(x,y,i.polygon))return i.id;return -1;}
const roads=[],bridges=[
 {x:1680,y:1300,w:600,h:100,axis:'h',to:1,name:'Esperanza Causeway'},
 {x:3580,y:2020,w:780,h:100,axis:'h',to:2,name:'Umbral Crossing'}
];
const grids=[
 {xs:[500,1020,1510],ys:[800,1350,1900,2470],left:350,right:1660,top:570,bottom:2680},
 {xs:[2430,2940,3450],ys:[720,1240,1790,2380,2730],left:2260,right:3580,top:500,bottom:2850},
 {xs:[4380,4880,5400],ys:[840,1370,2070,2550],left:4260,right:5540,top:690,bottom:2670}
];
for(let i=0;i<3;i++){const grid=grids[i];for(const x of grid.xs)roads.push({x:x-48,y:grid.top,w:96,h:grid.bottom-grid.top,axis:'v',island:i});for(const y of grid.ys){const left=i===1&&y===2730?2360:i===2&&y===2550?4335:grid.left;roads.push({x:left,y:y-48,w:grid.right-left,h:96,axis:'h',island:i});}}
roads.push({x:1600,y:1302,w:680,h:96,axis:'h',island:0},{x:2210,y:1302,w:270,h:96,axis:'h',island:1},{x:3400,y:2022,w:980,h:96,axis:'h',island:1});
function rect(x,y,r){return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
export function isLand(x,y){return islandAt(x,y)>=0||bridges.some(b=>rect(x,y,b));}
const buildings=[];
export const LOCATIONS={};
function landmark(id,name,x,y,w,h,color,kind,island){const b={id,name,x,y,w,h,color,roof:kind==='home'?'tile':'flat',kind,island,enterable:true,door:{x:x+w/2,y:y+h+8}};buildings.push(b);LOCATIONS[id]=b;return b;}
landmark('cafe','Café Inés',620,930,240,168,'#d99874','cafe',0);
landmark('home','Las Palmas · Home',1125,950,220,178,'#bb805f','home',0);
landmark('garage','Tomi’s Garage',620,1510,265,202,'#738c87','garage',0);
landmark('clinic','Harbor Clinic',1120,1510,245,195,'#d9d6bd','clinic',0);
landmark('precinct','Santa Elena Precinct',1175,2120,220,180,'#8caba9','precinct',0);
landmark('docks','El Bajo Docks',1580,2160,115,170,'#aa9170','docks',0);
landmark('market','Mercado de la Calle',620,2120,260,205,'#e0b15d','market',0);
landmark('radio','Radio Lucero',1120,520,220,160,'#c98c8d','radio',0);
landmark('depot','City Tow Depot',620,530,265,155,'#a1a5a0','depot',0);
landmark('club','Club Mirador',2520,1430,285,235,'#b88eab','club',1);
landmark('hotel','Hotel Mar Azul',3070,850,265,260,'#c8d6c0','hotel',1);
landmark('marina','Espejo Marina',3508,2145,138,155,'#8eb5aa','marina',1);
landmark('records','Municipal Records',2545,2050,260,205,'#d7c5a1','records',1);
landmark('port','Umbral Terminal',4480,1520,290,320,'#8a9b9b','port',2);
landmark('tower','Suncoast Development',5010,960,270,245,'#91b6b2','tower',2);
landmark('estate','Ward House',5020,2190,285,225,'#e3d3b4','estate',2);
let seed=429;function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
function overlap(a,b,p=20){return a.x<b.x+b.w+p&&a.x+a.w>b.x-p&&a.y<b.y+b.h+p&&a.y+a.h>b.y-p;}
const names=['Casa Coral','Lavandería Sol','Barbería Leon','El Patio','Palma Apartments','Bodega Luna','Flor del Día','Marlin Motors','Azotea Records','Pensión Mar','La Esquina','Estudio Azul'];
const palettes=[['#dfb08c','#b6bdab','#d3a89f','#a7bfba','#d8bf83','#b98471'],['#d8b3bb','#a5c8c4','#e3d5b5','#a8b5c2','#d2c6d1'],['#a7aaa0','#8da9ab','#b6b3a1','#c9bba3','#a2b3a6']];
for(let isle=0;isle<3;isle++){
 const gr=grids[isle];let index=0;
 for(let xi=0;xi<gr.xs.length-1;xi++)for(let yi=0;yi<gr.ys.length-1;yi++){
  const sx=gr.xs[xi]+88,sy=gr.ys[yi]+85,cw=gr.xs[xi+1]-gr.xs[xi]-176,ch=gr.ys[yi+1]-gr.ys[yi]-170;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++){
   const x=sx+a*cw/2+rand()*6,y=sy+b*ch/2+rand()*5,w=cw/2-26,h=ch/2-27;
   const candidate={x,y,w,h};if(w<65||h<55||buildings.some(q=>overlap(candidate,q,28))||roads.some(q=>overlap(candidate,q,12))||islandAt(x+w,y+h)!==isle)continue;
   const id=`block-${isle}-${index++}`,enterable=index%3===0&&!['block-1-2','block-2-5'].includes(id);
   buildings.push({id,name:names[(index+isle*3)%names.length],x,y,w,h,color:palettes[isle][Math.floor(rand()*palettes[isle].length)],roof:rand()<.42?'tile':'flat',kind:enterable?'shop':'residence',island:isle,enterable,door:{x:x+w/2,y:y+h+8}});
  }
 }
}
// Parking courts, small parks and waterfront boardwalks add navigable open spaces.
const parks=[{x:255,y:2100,w:170,h:250},{x:1135,y:2540,w:255,h:190},{x:3080,y:2470,w:270,h:220},{x:4480,y:2180,w:280,h:270}];
const parking=[{x:605,y:1740,w:300,h:90},{x:610,y:706,w:280,h:54},{x:1135,y:1725,w:250,h:100},{x:3080,y:1140,w:255,h:50},{x:4480,y:1855,w:280,h:100}];
const decor=[];
for(const r of roads){for(let d=35;d<(r.axis==='h'?r.w:r.h);d+=108){for(const side of [-1,1]){const x=r.axis==='h'?r.x+d:r.x+r.w/2+side*77,y=r.axis==='h'?r.y+r.h/2+side*77:r.y+d;if(islandAt(x,y)>=0&&!buildings.some(b=>rect(x,y,{x:b.x-10,y:b.y-10,w:b.w+20,h:b.h+20}))&&!roads.some(q=>q!==r&&rect(x,y,q)))decor.push({x,y,type:'palm',variant:rand()*7});}}}
for(const p of parks)for(let n=0;n<12;n++)decor.push({x:p.x+rand()*p.w,y:p.y+rand()*p.h,type:n%3===0?'tree':'palm',variant:rand()*7});
const vehicleSpawns=[
 {id:'lucia-car',type:'compact',x:902,y:1160,angle:Math.PI/2,owned:true,color:'#e8c357'},
 {id:'tomi-truck',type:'truck',x:762,y:1780,angle:0,owned:true},
 {id:'taxi-0',type:'sedan',x:960,y:1450,angle:Math.PI/2,owned:true,color:'#e6b951'},
 {id:'delivery-van',type:'van',x:760,y:729,angle:0,owned:true},
 {id:'bike-0',type:'motorcycle',x:1430,y:1260,angle:Math.PI/2},
 {id:'boat-0',type:'boat',x:1810,y:2360,angle:-Math.PI/2,owned:true},
 {id:'boat-1',type:'boat',x:3770,y:2310,angle:-Math.PI/2},
 {id:'boat-2',type:'boat',x:4030,y:2310,angle:-Math.PI/2},
 {id:'sport-1',type:'sport',x:3380,y:1165,angle:Math.PI/2},
 {id:'sedan-1',type:'sedan',x:2850,y:1660,angle:Math.PI/2},
 {id:'van-2',type:'van',x:4630,y:1905,angle:0},
 {id:'sport-2',type:'sport',x:5315,y:2450,angle:Math.PI/2}
];
export const WORLD={width:6000,height:3400,islands,roads,bridges,buildings,decor,parks,parking,vehicleSpawns,grids,interior:{width:640,height:460,exit:{x:320,y:420},interaction:{x:320,y:150}},spawn:{x:740,y:1148}};
export function isSolid(x,y,r=0){return buildings.some(b=>x+r>b.x&&x-r<b.x+b.w&&y+r>b.y&&y-r<b.y+b.h);}
export function nearestRoad(x,y){let best=null,dist=Infinity;for(const road of [...roads,...bridges]){const p={x:road.axis==='v'?road.x+road.w/2:Math.max(road.x,Math.min(road.x+road.w,x)),y:road.axis==='h'?road.y+road.h/2:Math.max(road.y,Math.min(road.y+road.h,y))};const d=Math.hypot(p.x-x,p.y-y);if(d<dist){best={...p,road,distance:d};dist=d;}}return best;}
export function lineOfSight(a,b){const d=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.ceil(d/18);for(let i=1;i<steps;i++){if(isSolid(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,0))return false;}return true;}
