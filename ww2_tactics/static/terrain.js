/* Decorative SVG only: hit targets, coordinates and rules remain on the original hexes. */
'use strict';
(()=>{
 let detailed=true;
 try{detailed=localStorage.getItem('ww2-terrain-style')!=='basic';}catch{}
 const ns='http://www.w3.org/2000/svg';
 function shape(tag,attrs){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;}
 function paint(svg,grid,conditions){
  if(!svg||!grid)return;
  const tile=svg.querySelector(':scope > .hex');
  const terrainKey=JSON.stringify([grid,conditions]);
  if(svg._terrainTile===tile&&svg._terrainDetailed===detailed&&svg._terrainKey===terrainKey)return;
  svg._terrainTile=tile;svg._terrainDetailed=detailed;svg._terrainKey=terrainKey;
  svg.querySelectorAll('.terrain-art,.terrain-defs').forEach(n=>n.remove());
  const defs=shape('defs',{class:'terrain-defs'});svg.prepend(defs);
  // One reusable ocean texture avoids hundreds of individual clip masks and
  // wave paths on Midway. Hex polygons still provide the exact clipping edge.
  const waterId=`water-texture-${svg.id}`,water=shape('pattern',{id:waterId,patternUnits:'userSpaceOnUse',width:48,height:30});
  water.append(shape('path',{d:'M-24 5Q-12-1 0 5T24 5T48 5T72 5M-24 20Q-12 14 0 20T24 20T48 20T72 20',fill:'none',stroke:'#c9e4dd','stroke-width':1.3}),shape('path',{d:'M3 8l10-2M27 23l9 1',fill:'none',stroke:'#5d99a2','stroke-width':1}));defs.append(water);
  // Reuse artwork by terrain/condition/road shape. The old per-hex trees and
  // clip masks multiplied into tens of thousands of SVG nodes on large maps.
  const symbols=new Map(),clipId=`terrain-clip-${svg.id}`;
  const clip=shape('clipPath',{id:clipId});
  clip.append(shape('polygon',{points:Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return `${30*Math.cos(a)},${30*Math.sin(a)}`;}).join(' ')}));defs.append(clip);
  const stamp=(tile,symbol,cx,cy)=>tile.after(shape('use',{class:'terrain-art'+(symbol.classes?' '+symbol.classes:''),href:`#${symbol.id}`,x:cx,y:cy,'aria-hidden':'true'}));
  [...svg.querySelectorAll(':scope > .hex')].forEach((tile,i)=>{
   const x=i%grid[0].length,y=Math.floor(i/grid[0].length),type=grid[y]?.[x];if(!type)return;
   const structure=['building','tower','church','bunker'].includes(type),condition=structure&&conditions?(conditions[`${x},${y}`]||'intact'):null;
   for(const name of ['intact','damaged','destroyed'])tile.classList.toggle('building-'+name,condition===name);
   if(condition)tile.dataset.buildingState=condition;else delete tile.dataset.buildingState;
   if(!detailed&&!(structure&&condition)&&type!=='tower')return;
   if(type==='water'){tile.after(shape('polygon',{class:'terrain-art',points:tile.getAttribute('points'),fill:`url(#${waterId})`,'aria-hidden':'true'}));return;}
   const [cx,cy]=center(x,y),links=[];
   if(['road','bridge','causeway'].includes(type)){
    for(let ny=Math.max(0,y-1);ny<=Math.min(grid.length-1,y+1);ny++)for(let nx=Math.max(0,x-1);nx<=Math.min(grid[0].length-1,x+1);nx++){
     if(nx===x&&ny===y||!['road','bridge','causeway'].includes(grid[ny][nx]))continue;
     const [px,py]=center(nx,ny),dx=px-cx,dy=py-cy;if(Math.hypot(dx,dy)<58)links.push([dx*.57,dy*.57]);
    }
    if(links.length===1)links.push([-links[0][0],-links[0][1]]);
    if(!links.length)links.push([0,-31],[0,31]);
   }
   const key=JSON.stringify([type,condition,links]),cached=symbols.get(key);
   if(cached){stamp(tile,cached,cx,cy);return;}
   const id=`terrain-${svg.id}-${symbols.size}`;
   const outer=shape('g',{id,'clip-path':`url(#${clipId})`}),g=shape('g',{});outer.append(g);defs.append(outer);
   const add=(tag,attrs)=>g.append(shape(tag,attrs));
   const path=(d,stroke,width=1,fill='none')=>add('path',{d,stroke,'stroke-width':width,fill,'stroke-linecap':'round','stroke-linejoin':'round'});
   if(type==='mountain'){
    path('M-30 22L-5-25 9-2 16-13 32 22Z','#555f52',1.5,'#a8ae99');
    path('M-5-25L1 4-8-2-15 4Z','#e4e2cd',1,'#dfdfc9');path('M-5-20l5 24 12 15','#73816b',2);
   }else if(type==='ridge'){
    path('M-31 14L-16-10-4-6 7-20 30 12M-20 18l13-12 8 8 10-10 14 14','#746e55',2.5);
   }else if(type==='desert'){
    path('M-25 8q14-8 28-1M-5-14l11 2M10 19l9-3','#b59966',1.2);
   }else if(type==='dune'){
    path('M-30 12Q-8-24 28 5M-25 21Q-1-10 29 17','#a7844f',2);path('M-28 11Q-8-20 27 6','#f2dfb5',3);
   }else if(type==='wadi'){
    path('M-26-25Q18-4-4 8T22 28','#807456',16);path('M-26-25Q18-4-4 8T22 28','#d5bd8f',9);
   }else if(type==='oasis'){
    add('ellipse',{cx:0,cy:8,rx:19,ry:10,fill:'#79b4b0'});
    path('M-11 11l3-24M-8-13q-12-4-17 5M-8-13q9-6 15 3M-8-13q-3-12-12-10','#426a43',3);
   }else if(type==='beach'){
    path('M-24 12q8-5 16 0t16 0M-18-8l5-2M8-16l7 2','#ad956c',1.3);
    add('circle',{cx:15,cy:8,r:1.5,fill:'#897e5c'});
   }else if(type==='marsh'){
    path('M-28-10q10-6 20 0t20 0M-28 12q10-6 20 0t20 0','#c3ddd2',2);
    path('M-14 14V-3m-4 3l4 5 4-8M12 7V-10m-4 3l4 5 4-8','#3e634e',2);
   }else if(type==='bocage'){
    path('M-30 4L30-4','#544f32',13);path('M-30 0L30-8','#355f3f',11);
    for(const x of [-20,-5,10,24])add('circle',{cx:x,cy:-4-x/8,r:7,fill:x%2?'#476c38':'#537943'});
   }else if(type==='bunker'&&condition!=='destroyed'){
    path('M-23 12V-3l7-9h31l9 10v14z','#414b44',2,'#a8aa99');
    path('M-23-3h47M-15 3h29','#4d5b4f',4);path('M-21 17h44','#636d55',4);
    if(condition==='damaged')path('M2-12l-6 8 7 6-3 9','#543f2d',3);
   }else if(type==='rubble'){
    path('M-22 14l9-10 8 9 9-8 17 10M-14-7l6-6 9 6 10-2','#766d59',3);
   }else if(type==='field'){
    path('M-21 9l3-4 1 4M12-9l2-4 2 4M7 19l2-3 1 3M-13-15l1-3 2 3','#829866',.8);
    add('ellipse',{cx:9,cy:4,rx:16,ry:7,fill:'#aebd8730'});
    path('M-19 17l9-2M3-20l9 1','#dce2b3',1.2);
   }else if(type==='woods'){
    for(const [tx,ty,s] of [[-12,-3,1],[9,-8,.85],[1,10,1.05],[19,13,.7],[-20,16,.65]]){
     add('ellipse',{cx:tx+2,cy:ty+9*s,rx:8*s,ry:3*s,fill:'#355f4430'});
     path(`M${tx} ${ty+4*s}v${8*s}`,'#776547',2);
     path(`M${tx-8*s} ${ty+7*s}l${8*s}-${18*s} ${8*s} ${18*s}z`,'#42684c',.6,'#557c50');
     path(`M${tx-4*s} ${ty+1*s}l${4*s}-${10*s}v${15*s}`,'#769258',.8,'#769258');
    }
   }else if(structure&&condition==='destroyed'){
    outer.classList.add('structure-art','structure-destroyed');
    add('ellipse',{cx:0,cy:9,rx:22,ry:12,fill:detailed?'#716e6660':'#827e72'});
    path('M-18 10v-17l5 4 4-9 3 12v13M7 13V-3l5-4 6 7v10','#494b45',2,detailed?'#a29a88':'#c8bda8');
    path('M-19 14l6-8 6 6 6-4 9 8 7-5 6 7z','#635d51',1.4,'#b2a48d');
    path('M-9 17l4-4 4 5M5 5l3 4 5-1M-3-7l5 2-3 6','#5d5549',2);
    path('M14-17l8 8M22-17l-8 8','#f3eee0',5);path('M14-17l8 8M22-17l-8 8','#783f31',2.5);
   }else if(type==='church'){
    outer.classList.add('structure-art','church-art','structure-'+(condition||'intact'));
    if(detailed)add('ellipse',{cx:3,cy:17,rx:24,ry:8,fill:'#4d4e4855'});
    path('M-21 17V-1l12-9 18 9v18z','#5c5b50',1.4,detailed?'#ddd1b3':'#f2e6bb');
    path('M-24-1l15-13L13-1 8 3-9-8-19 3z','#5b5146',1.3,'#98694f');
    path('M7 17V-17h13v34z','#50594f',1.5,'#d5c9a6');
    path('M4-17l10-12 9 12z','#4a554e',1.2,'#677d71');
    path('M-1 6v9M-4 9h6','#414b43',1.8);
    path('M10-10q4-7 7 0v5h-7zM-14 17V8q4-6 8 0v9','#46564e',1.2,'#61766c');
    add('circle',{cx:-8,cy:0,r:3,fill:'#bba668',stroke:'#665b47','stroke-width':1});
    if(condition==='damaged'){
     path('M9-16l5 7-4 7 6 6-4 11','#5a4937',2.6);
     path('M-22 4l8 13h-16z','#694627',1.3,'#ffc66b');
    }
   }else if(type==='tower'){
    outer.classList.add('structure-art','tower-art','structure-'+(condition||'intact'));
    if(detailed)add('ellipse',{cx:5,cy:18,rx:21,ry:7,fill:'#4d4e4855'});
    path('M-13 17V-18h26v35z','#4d5550',1.7,detailed?'#d7ceae':'#f2e6bb');
    path('M-16-18L0-32l16 14z','#454d49',1.5,'#687d75');
    path('M2-29l12 11H2z','#52655e',.6,'#52655e');
    path('M-15 17h30M-13-1h26M-13 4h26','#8c8871',1.4);
    add('circle',{cx:0,cy:-10,r:6,fill:'#faf1d4',stroke:'#424d47','stroke-width':1.8});
    path('M0-14v4l4 2','#303d35',1.6);
    path('M-4 16V9Q0 4 4 9v7','#4d5a50',1.3,'#647467');
    if(condition==='damaged'){
     path('M-10-20l4 7-4 9 6 5-4 11','#5a4937',2.6);
     path('M17-14l8 13H9z','#694627',1.3,'#ffc66b');path('M17-10v4M17-3v.2','#4c3826',1.8);
    }
   }else if(type==='building'&&condition==='damaged'){
    outer.classList.add('structure-art','structure-damaged');
    add('rect',{x:-16,y:-5,width:33,height:22,rx:2,fill:'#67524030'});
    path('M-14 13V-8l12-9 14 9v21z','#61594b',1.5,detailed?'#d8c4a1':'#f0d79c');
    path('M-18-6l16-13 4 5-7 5 5 4-6 6z','#704639',1.2,'#aa6e4c');
    path('M4-12l12 6-9 5-4-4 3-3z','#704639',1.2,'#96634b');
    path('M-2-13l-4 6 6 4-5 6 3 10','#3c3a34',2.5);
    add('rect',{x:-10,y:4,width:4,height:5,fill:'#454b41'});
    path('M7 13V5h5M13 16l7-3 3 4M-16 18h5','#74654f',2);
    path('M18-17l7 12H11z','#5e4125',1.2,'#f0ba55');path('M18-13v3M18-7v.3','#3b3227',1.8);
   }else if(type==='building'&&!detailed){
    outer.classList.add('structure-art','structure-intact');
    path('M-12-5l12-8 12 8v19h-24zM-12-5h24','#655a46',2,'#e4d2ab');
   }else if(type==='building'){
    outer.classList.add('structure-art','structure-intact');
    add('rect',{x:-15,y:-5,width:32,height:22,rx:2,fill:'#77664c30'});
    add('rect',{x:-14,y:-9,width:26,height:22,fill:'#e5d3ad',stroke:'#897b61','stroke-width':1});
    path('M-18-6l16-13 18 13-17 7z','#835244',1,'#ad7154');
    path('M-2-17L-1-1M-13-7L9-7M-8-12L4-12','#c38c68',1);
    add('rect',{x:-9,y:4,width:4,height:5,fill:'#60726d'});add('rect',{x:3,y:4,width:5,height:9,fill:'#7b6852'});
    path('M17 18h7M19 14h5','#b4a484',1);
   }else if(type==='water'){
    path('M-30-10Q-18-16-6-10T18-10T42-10M-34 5Q-22-1-10 5T14 5T38 5M-25 20Q-13 14-1 20T23 20','#c9e4dd',1.3);
    path('M-25-7l10-2M7 8l9 1M-4-22l8 1','#5d99a2',1);
   }else if(type==='road'||type==='bridge'||type==='causeway'){
    const d=links.map(([dx,dy])=>`M0 0L${dx} ${dy}`).join(' ');
    if(type==='causeway')path(d,'#686e54',25);
    path(d,'#aa9471',18);path(d,'#d6c49c',15);path(d,'#eee0b6',1);
    if(type==='bridge'){
     add('rect',{x:-13,y:-29,width:26,height:58,fill:'#aa9873'});
     for(let yy=-25;yy<29;yy+=6)path(`M-12 ${yy}h24`,'#dbcba3',3);
     path('M-15-30v60M15-30v60','#666c62',3);
     path('M-17-23h4M13-23h4M-17 23h4M13 23h4','#d5d0b8',3);
    }
   }else if(type==='objective'){
    add('rect',{x:-19,y:-18,width:38,height:38,rx:3,fill:'#dacd9e',stroke:'#ab9866','stroke-width':1});
    for(let yy=-12;yy<=18;yy+=8)path(`M-18 ${yy}h36`,'#b9ab7d',.7);
    for(let xx=-10;xx<=14;xx+=8)path(`M${xx}-17v36`,'#b9ab7d',.7);
    add('circle',{cx:0,cy:0,r:13,fill:'#f2dfa4',stroke:'#9f8746','stroke-width':1});
   }
   const symbol={id,classes:outer.getAttribute('class')};symbols.set(key,symbol);stamp(tile,symbol,cx,cy);
  });
 }
 function sync(){
  document.body.classList.toggle('detailed-terrain',detailed);
  const button=document.getElementById('terrainToggle');button.textContent=detailed?'Terrain: detailed':'Terrain: basic';button.setAttribute('aria-pressed',String(detailed));
  if(typeof state!=='undefined'&&state){
   paint(document.getElementById('map'),state.map,state.building_version?state.buildings:null);
   const snapshot=playbackSession?.frames[playbackSession.index]?.[playbackSession.phase];
   paint(document.getElementById('playbackMap'),document.getElementById('playbackMap')?._grid||state.map,snapshot?.buildings);
  }
  if(typeof scenarios!=='undefined')paint(document.getElementById('scenarioPreview'),scenarios.find(s=>s.id===document.getElementById('scenarioSelect').value)?.map);
 }
 const button=document.createElement('button');button.id='terrainToggle';button.type='button';button.title='Switch between basic and detailed terrain';
 document.getElementById('playTools').append(button);
 button.onclick=()=>{detailed=!detailed;try{localStorage.setItem('ww2-terrain-style',detailed?'detailed':'basic');}catch{}sync();};
 document.addEventListener('ww2:render',sync);document.addEventListener('ww2:playback',sync);document.addEventListener('ww2:preview',sync);sync();
})();
