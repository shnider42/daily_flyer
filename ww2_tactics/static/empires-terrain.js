/* Small, reusable landscape drawings. Only the public remembered map is read. */
'use strict';
(()=>{
 const ns='http://www.w3.org/2000/svg';
 const points=[[0,-98/3],[26,-49/3],[26,49/3],[0,98/3],[-26,49/3],[-26,-49/3]];
 const node=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const path=(d,fill,extra={})=>node('path',{d,fill,...extra});
 const use=(id,attrs={})=>node('use',{href:'#'+id,...attrs});
 const line=(d,stroke,width=1,extra={})=>path(d,'none',{stroke,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',...extra});
 const neighbors=(x,y)=>[[x+(y&1),y-1],[x+1,y],[x+(y&1),y+1],[x-1+(y&1),y+1],[x-1,y],[x-1+(y&1),y-1]];
 const water=t=>t==='water'||t==='bridge';
 const variant=(x,y)=>((x*37+y*19+(x*y)*7)>>>0)%4;
 function gradient(defs,id,colors){
  const g=node('linearGradient',{id,x1:'15%',y1:'0%',x2:'80%',y2:'100%'});
  colors.forEach((color,i)=>g.append(node('stop',{offset:i/(colors.length-1),'stop-color':color})));defs.append(g);
 }
 function tree(x,y,scale=1,round=false){
  const g=node('g',{transform:`translate(${x} ${y}) scale(${scale})`});
  g.append(node('ellipse',{cx:1,cy:4,rx:7,ry:2.5,fill:'#233d34',opacity:.24}),line('M0 0V5','#624b34',1.8));
  if(round){
   g.append(path('M-7-3Q-10-9-5-11Q-4-17 2-14Q8-15 8-8Q11-2 5 1Q-2 3-7-3Z','#395f48'),path('M-6-6Q-7-11-3-11Q-2-16 2-12Q6-13 6-8Q1-5-6-6Z','#789568'),path('M-6-6Q-1-3 4-5L5 1Q-2 3-7-3Z','#4f7655'));
  }else{
   g.append(path('M0-20 6-9 3-9 9 1Q0 5-9 1L-3-9-6-9Z','#315b46'),path('M0-20 0-1-7 0-3-9-6-9Z','#739363'),path('M0-14 5-6 2-6 8 1 0 3V-14Z','#436d4e'),line('M-3-8 0-9M-5-1 0-3','#99ab79',.7,{opacity:.75}));
  }
  return g;
 }
 function hill(x,y,scale=1){
  const g=node('g',{transform:`translate(${x} ${y}) scale(${scale})`});
  g.append(path('M-22 8Q-14 5-10-3Q-3-18 7-11Q14-8 17 0L24 8Q3 16-22 8Z','url(#emp-land-hill-paint)'),path('M0-12Q9-14 17 0L24 8Q13 11 5 7Q10 2 5-2Z','#887c58',{opacity:.68}),line('M-17 6Q-9 2-6-5Q-3-11 0-11','#e4cf98',1.2,{opacity:.8}),line('M-13 10Q-3 13 12 9','#6e7350',.7,{opacity:.5}));return g;
 }
 function mountain(x,y,scale=1){
  const g=node('g',{transform:`translate(${x} ${y}) scale(${scale})`});
  g.append(path('M-23 11-5-23 2-14 9-18 26 12 9 17Z','url(#emp-land-rock-paint)'),path('M-5-23-6 2-1 0 3 12 9 17 26 12 9-18 2-14Z','#69776d'),path('M-5-23 2-14 9-18 15-7 8-11 5-5-1-13-9-14Z','#d8d9c2'),line('M-10-9-15 1M-5-5-8 6M8-5 14 6','#b8baa1',1,{opacity:.7}));return g;
 }
 function install(svg){
  const defs=node('defs',{'data-emp-land-defs':''});
  gradient(defs,'emp-land-grass-paint',['#b0bd86','#8da471','#718c62']);
  gradient(defs,'emp-land-woods-paint',['#8eaa77','#6f8a61','#536f53']);
  gradient(defs,'emp-land-hill-ground',['#beb18a','#a39c73','#879366']);
  gradient(defs,'emp-land-mountain-ground',['#b1b19b','#8c9983','#748574']);
  gradient(defs,'emp-land-water-paint',['#669c9a','#407e87','#326474']);
  gradient(defs,'emp-land-hill-paint',['#e0cb92','#bca575','#91875d']);
  gradient(defs,'emp-land-rock-paint',['#d4d3b8','#a3ac95','#7c8c7b']);
  const clip=node('clipPath',{id:'emp-land-hex-clip'});clip.append(node('polygon',{points:points.map(p=>p.join(',')).join(' ')}));defs.append(clip);
  for(const kind of ['grass','woods','hill','mountain','water','bridge'])for(let v=0;v<4;v++){
   const symbol=node('g',{id:`emp-land-${kind}-${v}`}),shift=v-1.5;
   const paint=kind==='bridge'?'water-paint':kind==='hill'?'hill-ground':kind==='mountain'?'mountain-ground':kind+'-paint';
   symbol.append(node('polygon',{points:points.map(p=>p.join(',')).join(' '),fill:`url(#emp-land-${paint})`}));
   if(water(kind)){
    symbol.append(path(`M-30 ${-15+v*3}Q-8 ${-24+v*3} 5 -12T35-16V-35H-35Z`,'#b3ceba',{opacity:.09}),path('M-29 19Q-8 8 9 18T31 13V35H-30Z','#193f58',{opacity:.08}));
    for(const [x,y,w]of [[-19,-17,11],[7,-8,14],[-17,7,15],[3,21,9]])symbol.append(line(`M${x+shift} ${y}q${w/4} -1.7 ${w/2} 0t${w/2} 0`,'#b7d4c4',.85,{opacity:.45}));
   }else{
    symbol.append(path(`M-32-14Q-13 ${-22-v*3} 3-13T33-18V-35H-35Z`,'#edf0bf',{opacity:.1}),path('M-32 18Q-12 5 7 16T32 8V35H-32Z','#385e45',{opacity:.09}));
    for(const [x,y]of [[-19,-7],[17,5],[-10,23],[7,-23]])symbol.append(line(`M${x+shift} ${y}l-1-3m1 3 2-2`,'#4d704d',.65,{opacity:.36}));
   }
   if(kind==='woods'){
    for(const [x,y,s,round]of [[-12,-6,.8,false],[6,-13,.8,true],[18,0,.78,false],[-18,13,.85,true],[-3,8,1,false],[12,20,.9,true]])symbol.append(tree(x+shift,y, s+(v===2?.05:0),v===1?!round:round));
   }
   if(kind==='hill'){symbol.append(hill(-8,-10,.76),hill(7,9,.95));if(v%2)symbol.append(node('ellipse',{cx:-17,cy:19,rx:2.5,ry:1.5,fill:'#657959',opacity:.6}));}
   if(kind==='mountain')symbol.append(mountain(-9,-7,.66),mountain(5,7,1));
   if(kind==='bridge'){
    symbol.append(path('M-28-7H28V9H-28Z','#253f43',{opacity:.35}),path('M-28-6H28V6H-28Z','#b7a476'));
    for(let x=-24;x<28;x+=5)symbol.append(line(`M${x}-5V5`,'#73684c',.7));
    symbol.append(line('M-28-6H28M-28 6H28','#e3d0a0',1.4),line('M-22-9V-4M-8-9V-4M8-9V-4M22-9V-4M-22 4V9M-8 4V9M8 4V9M22 4V9','#857a59',1.4));
   }
   defs.append(symbol);
  }
  const farm=node('g',{id:'emp-land-farm'});
  farm.append(path('M-22-9 8-20 23-8-7 3Z','#6d744b'),path('M-20-9-6-14 7-3-7 2Z','#b9aa69'),path('M-4-15 8-19 21-8 9-4Z','#95a461'));
  for(let i=0;i<5;i++)farm.append(line(`M${-18+i*2.4} ${-9-i*.85}l10 8`,'#e0c585',1.1),line(`M${-1+i*2.1} ${-14-i*.7}l11 8`,'#ced09a',1));
  farm.append(path('M-20 1-14-2-8 2-14 5Z','#594f36',{opacity:.28}),path('M-19-5-19 0-14 3-9 0V-5Z','#e0cca1'),path('M-21-5-15-11-7-5-14-2Z','#8d684a'),line('M-14-2V2','#a28561',.8));defs.append(farm);
  const mine=node('g',{id:'emp-land-mine'});
  mine.append(path('M-18-1-14-9-6-11 2-6 4 2-3 5-13 5Z','#7f8873'),path('M-13 1V-6Q-8-12-3-6V2Z','#263e39'),line('M-14 2V-8H-2V3','#c5a779',2),line('M-13-7-10-3M-3-7-6-3','#8f7454',1),path('M-10 1-4 1 5 8-2 10Z','#626f5e'),line('M-10 2-2 9M-5 2 4 8','#c5bd93',.8),path('M7-2 12-7 19-4 22 3 17 6 10 4Z','#acac8b'),path('M12-7 14 0 22 3 19-4Z','#d3d0ae'));defs.append(mine);
  const ruins=node('g',{id:'emp-land-ruins'});
  ruins.append(path('M-14 0 9-8 20 0-5 8Z','#66765a',{opacity:.45}),path('M-11-5-7-6V2L-11 4ZM1-13 5-14V-3L1-1ZM11-8 15-9V1L11 3Z','#d3caa5'),path('M-7-6-4-4V1L-7 2ZM5-14 8-12V-4L5-3ZM15-9 18-7V0L15 1Z','#8c9279'),line('M-13-5-6-8-2-5M-1-13 6-16 10-12','#e4d7af',1.8));defs.append(ruins);
  svg.prepend(defs);return defs;
 }
 function descriptor(map,x,y){
  const tile=map[y]?.[x];if(!tile)return null;
  const adjacent=neighbors(x,y).map(([xx,yy])=>map[yy]?.[xx]?.terrain||null);
  return {tile,adjacent,variant:variant(x,y),key:JSON.stringify([tile,adjacent,variant(x,y)])};
 }
 function draw(group,description){
  group.replaceChildren();if(!description)return;
  const {tile,adjacent,variant:v}=description;
  const clipped=node('g',{'clip-path':'url(#emp-land-hex-clip)'});group.append(clipped);
  clipped.append(use(`emp-land-${tile.terrain}-${v}`));
  if(!water(tile.terrain))for(const [edge,kind]of adjacent.entries())if(water(kind)){
   const a=points[edge],b=points[(edge+1)%6],outer=`M${a.join(' ')}L${b.join(' ')}`;
   // Draw into the known land, never infer a shoreline against unexplored fog.
   const beach=path(`${outer}L${(b[0]*.83).toFixed(2)} ${(b[1]*.83).toFixed(2)}Q${((a[0]+b[0])*.37).toFixed(2)} ${((a[1]+b[1])*.37).toFixed(2)} ${(a[0]*.83).toFixed(2)} ${(a[1]*.83).toFixed(2)}Z`,'#ceb983',{class:'emp-shore','data-edge':edge});
   clipped.append(beach,line(outer,'#e9d5a2',1.5,{opacity:.9}),line(`M${a[0]*.93} ${a[1]*.93}L${b[0]*.93} ${b[1]*.93}`,'#f1ddb0',.6,{opacity:.5}));
  }
  // Edge foliage suggests continuity without covering the center's overlays.
  if(tile.terrain==='woods')for(const [edge,kind]of adjacent.entries())if(kind==='woods'){
   const a=points[edge],b=points[(edge+1)%6];clipped.append(tree((a[0]+b[0])*.39,(a[1]+b[1])*.39+6,.52,edge%2===0));
  }
  if(tile.improvement==='farm'||tile.improvement==='mine')clipped.append(use('emp-land-'+tile.improvement,{class:'emp-land-improvement'}));
  if(tile.resource==='ruins')clipped.append(use('emp-land-ruins',{class:'emp-land-ruins'}));
 }
 function roads(group,game,center){
  const signature=JSON.stringify([game.map.map(row=>row.map(t=>t?[t.road,t.terrain]:null)),game.visible]);
  if(group._landRoadKey===signature)return;group._landRoadKey=signature;group.replaceChildren();
  const seen=new Set(game.visible);
  for(let y=0;y<game.height;y++)for(let x=0;x<game.width;x++)if(game.map[y][x]?.road){
   const [cx,cy]=center(x,y);
   for(const [nx,ny]of [[x+1,y],[x+(y%2),y+1],[x-1+(y%2),y+1]])if(game.map[ny]?.[nx]?.road){
    const [xx,yy]=center(nx,ny),d=`M${cx} ${cy}L${xx} ${yy}`;
    const segment=node('g',{opacity:seen.has(`${x},${y}`)&&seen.has(`${nx},${ny}`)?1:.35});segment.append(line(d,'#4e5844',5.4,{opacity:.65}),line(d,'#d3c396',3.2,{class:'emp-road-surface'}),line(d,'#f1dfb0',.65,{opacity:.65}));group.append(segment);
   }
   group.append(node('circle',{cx,cy,r:2.2,fill:'#d3c396',opacity:seen.has(`${x},${y}`)?1:.35}));
  }
 }
 window.empiresTerrain={install,descriptor,draw,roads,points};
})();
