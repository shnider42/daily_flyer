/* Decorative SVG only: hit targets, coordinates and rules remain on the original hexes. */
'use strict';
(()=>{
 let detailed=true;
 try{detailed=localStorage.getItem('ww2-terrain-style')!=='basic';}catch{}
 const ns='http://www.w3.org/2000/svg';
 function shape(tag,attrs){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;}
 function paint(svg,grid){
  if(!svg||!grid)return;
  const tile=svg.querySelector(':scope > .hex');
  if(svg._terrainTile===tile&&svg._terrainDetailed===detailed)return;
  svg._terrainTile=tile;svg._terrainDetailed=detailed;
  svg.querySelectorAll('.terrain-art,.terrain-defs').forEach(n=>n.remove());
  if(!detailed)return;
  const defs=shape('defs',{class:'terrain-defs'});svg.prepend(defs);
  [...svg.querySelectorAll(':scope > .hex')].forEach((tile,i)=>{
   const x=i%grid[0].length,y=Math.floor(i/grid[0].length),type=grid[y]?.[x];if(!type)return;
   const [cx,cy]=center(x,y),id=`terrain-${svg.id}-${i}`;
   const clip=shape('clipPath',{id});clip.append(shape('polygon',{points:tile.getAttribute('points')}));defs.append(clip);
   const outer=shape('g',{class:'terrain-art','clip-path':`url(#${id})`,'aria-hidden':'true'}),g=shape('g',{transform:`translate(${cx} ${cy})`});outer.append(g);tile.after(outer);
   const add=(tag,attrs)=>g.append(shape(tag,attrs));
   const path=(d,stroke,width=1,fill='none')=>add('path',{d,stroke,'stroke-width':width,fill,'stroke-linecap':'round','stroke-linejoin':'round'});
   if(type==='field'){
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
   }else if(type==='building'){
    add('rect',{x:-15,y:-5,width:32,height:22,rx:2,fill:'#77664c30'});
    add('rect',{x:-14,y:-9,width:26,height:22,fill:'#e5d3ad',stroke:'#897b61','stroke-width':1});
    path('M-18-6l16-13 18 13-17 7z','#835244',1,'#ad7154');
    path('M-2-17L-1-1M-13-7L9-7M-8-12L4-12','#c38c68',1);
    add('rect',{x:-9,y:4,width:4,height:5,fill:'#60726d'});add('rect',{x:3,y:4,width:5,height:9,fill:'#7b6852'});
    path('M17 18h7M19 14h5','#b4a484',1);
   }else if(type==='water'){
    path('M-30-10Q-18-16-6-10T18-10T42-10M-34 5Q-22-1-10 5T14 5T38 5M-25 20Q-13 14-1 20T23 20','#c9e4dd',1.3);
    path('M-25-7l10-2M7 8l9 1M-4-22l8 1','#5d99a2',1);
   }else if(type==='road'||type==='bridge'){
    let links=[];
    for(let ny=Math.max(0,y-1);ny<=Math.min(grid.length-1,y+1);ny++)for(let nx=Math.max(0,x-1);nx<=Math.min(grid[0].length-1,x+1);nx++){
     if(nx===x&&ny===y||!['road','bridge'].includes(grid[ny][nx]))continue;
     const [px,py]=center(nx,ny),dx=px-cx,dy=py-cy;if(Math.hypot(dx,dy)<58)links.push([dx*.57,dy*.57]);
    }
    if(links.length===1)links.push([-links[0][0],-links[0][1]]);
    if(!links.length)links=[[0,-31],[0,31]];
    const d=links.map(([dx,dy])=>`M0 0L${dx} ${dy}`).join(' ');
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
  });
 }
 function sync(){
  document.body.classList.toggle('detailed-terrain',detailed);
  const button=document.getElementById('terrainToggle');button.textContent=detailed?'Terrain: detailed':'Terrain: basic';button.setAttribute('aria-pressed',String(detailed));
  if(typeof state!=='undefined'&&state){paint(document.getElementById('map'),state.map);paint(document.getElementById('playbackMap'),state.map);}
  if(typeof scenarios!=='undefined')paint(document.getElementById('scenarioPreview'),scenarios.find(s=>s.id===document.getElementById('scenarioSelect').value)?.map);
 }
 const button=document.createElement('button');button.id='terrainToggle';button.type='button';button.title='Switch between basic and detailed terrain';
 document.getElementById('playTools').append(button);
 button.onclick=()=>{detailed=!detailed;try{localStorage.setItem('ww2-terrain-style',detailed?'detailed':'basic');}catch{}sync();};
 document.addEventListener('ww2:render',sync);document.addEventListener('ww2:playback',sync);document.addEventListener('ww2:preview',sync);sync();
})();
