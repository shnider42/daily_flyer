/* Optional decorative counters. Existing SVG groups still own input and game identity. */
'use strict';
(()=>{
 let illustrated=true;
 try{illustrated=localStorage.getItem('ww2-unit-style')!=='classic';}catch{}
 const ns='http://www.w3.org/2000/svg',observed=new Set();
 const rasterKinds=new Set(['carrier','battleship','cruiser','destroyer','paratrooper','scout','engineer','halftrack','at_gun','at_team']);
 function rasterName(u){
  if(rasterKinds.has(u.kind))return u.kind;
  if(u.kind==='tank')return `tank-${u.side}`;
  if(u.kind==='amphibious')return ['water','objective'].includes(state.map[u.pos[1]][u.pos[0]])?'landing-craft':'landing-infantry';
  return null;
 }
 function el(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;}
 function size(svg){const width=svg.viewBox.baseVal.width;svg.classList.toggle('compact-unit-art',!!width&&svg.getBoundingClientRect().width/width*40<40);}
 const observer=new ResizeObserver(entries=>entries.forEach(e=>size(e.target)));
 function decorate(svg,units){
  if(!svg)return;
  if(!observed.has(svg)){observer.observe(svg);observed.add(svg);}
  const byId=new Map(units.map(u=>[u.id,u]));
  for(const counter of svg.querySelectorAll('.unit')){
   counter.querySelector('.unit-art')?.remove();counter.querySelector('.unit-art-title')?.remove();
   const u=byId.get(counter.dataset.unitId);if(!illustrated||!u)continue;
   const [cx,cy]=center(...u.pos),art=el('g',{class:`unit-art${u.pinned?' is-pinned':''}`,transform:`translate(${cx} ${cy})`,'aria-hidden':'true'});
   const title=el('title',{class:'unit-art-title'},`${sideLabel(u.side)} ${unitName(u)} · ${u.hp} strength · ${u.ap} AP${u.pinned?' · pinned':''}${u.entrenched?' · dug in':''}${u.overwatch?' · overwatch':''}`);counter.prepend(title);
   art.append(el('path',{class:'portrait-panel',d:'M-17-14H16Q18-14 18-12V3H-18V-12Q-18-14-17-14Z'}));
   const drawing=el('g',{class:`unit-portrait portrait-${u.kind}`});art.append(drawing);
   const add=(tag,attrs,parent=drawing)=>{const n=el(tag,attrs);parent.append(n);return n;};
   const path=(d,cls,parent=drawing)=>add('path',{d,class:cls},parent);
   if(['carrier','battleship','cruiser','destroyer'].includes(u.kind)){
    drawing.classList.add('naval-silhouette');
    path('M-18 2Q-8 0 0 2T18 2','ship-wake');
    path(u.kind==='destroyer'?'M-16-4H17L12 0H-12Z':'M-17-5H18L12 1H-13Z','ship-hull');
    path('M-12 0H12','ship-keel');
    if(u.kind==='carrier'){
     path('M-18-7H18V-4H-18Z','ship-deck');
     path('M3-12H9V-7H1V-9H3Z','ship-superstructure');
     path('M5-15V-12M3-14H8','ship-mast');
     path('M-13-10H-5M-9-13V-8M-11-9H-7','ship-aircraft');
     path('M-16-6H0','ship-marking');
    }else{
     path(u.kind==='battleship'?'M-5-5V-9H-3V-13H2V-10H5V-5Z':'M-4-5V-10H1V-8H4V-5Z','ship-superstructure');
     path('M-1-15V-10M-4-13H2','ship-mast');
     path('M4-9H6V-5H4Z','ship-funnel');
     if(u.kind!=='destroyer')path('M7-9H9V-5H7Z','ship-funnel');
     for(const x of (u.kind==='battleship'?[-12,10]:[10])){
      path(`M${x-2}-5V-8H${x+2}V-5Z`,'ship-turret');
      path(`M${x}-8h${x<0?-6:6}`,'ship-barrel');
     }
     if(u.kind==='destroyer')path('M-12-6H-6M-10-8H-5','ship-barrel');
    }
    for(const x of [-10,-6,7,11])add('circle',{cx:x,cy:-2,r:.65,class:'ship-porthole'});
   }else if(u.kind==='amphibious'&&state?.naval_version&&!['water','objective'].includes(state.map[u.pos[1]][u.pos[0]])){
    for(const x of [-9,0,9]){
     add('circle',{cx:x,cy:-9,r:2.8,class:'landing-helmet'});
     path(`M${x-3}-5H${x+3}L${x+4}2H${x-4}Z`,'landing-uniform');
     path(`M${x+2}-5L${x+5}-10`,'ship-barrel');
    }
   }else if(u.kind==='commander'){
    path('M2-14L5-8 12-8 7-3 9 3 2-1-5 3-3-3-8-8-1-8Z','commander-star');
   }else if(u.kind==='tank'){
    path('M-13-3H14Q17-3 17 0Q17 3 14 3H-13Q-16 3-16 0Q-16-3-13-3Z','vehicle-track');
    path('M-12-6H12L15-2H-15Z M-5-11H5L8-6H-7Z','vehicle-body');
    path(u.side==='us'?'M5-9H17':'M-5-9H-17','specialist-line');
    for(const x of [-10,-4,2,8,13])add('circle',{cx:x,cy:0,r:1.1,class:'rank-silver-mid'});
   }else if(u.kind==='at_gun'){
    path('M-5-10H4L6-2H-7Z','vehicle-body');
    path('M1-8H17M-3-2L-13 3M-3-2L5 3','specialist-line');
    for(const x of [-6,5])add('circle',{cx:x,cy:0,r:3,class:'vehicle-track'});
   }else if(u.kind==='halftrack'){
    drawing.classList.add('insignia-halftrack');
    path('M-13-2H2Q5-2 5 1Q5 3 2 3H-13Q-16 3-16 1Q-16-2-13-2Z','vehicle-track');
    path('M-14-9H3L7-6H13L16-1H-14Z M-3-12H2V-9H-3Z','vehicle-body');
    path('M0-11H10','specialist-line');
    add('circle',{cx:12,cy:1,r:3,class:'vehicle-track'});
    for(const x of [-11,-6,-1])add('circle',{cx:x,cy:1,r:1,class:'rank-silver-mid'});
   }else if(u.kind==='amphibious'){
    path('M-15-7H15L11 0H-10Z M-6-11H5L8-7H-6Z','vehicle-body');
    path('M-15 3q4-3 8 0t8 0t8 0M4-10H13','specialist-line');
   }else if(u.kind==='paratrooper'){
    path('M-12-5Q-11-14 1-14Q13-14 14-5Q10-7 7-5Q3-7 1-5Q-3-7-6-5Q-9-7-12-5Z','parachute-canopy');
    path('M1-14Q-5-12-6-5M1-14Q7-12 7-5M1-13V-6','parachute-rib');
    path('M-11-5L-1 2M-6-5L0 2M7-5L2 2M13-5L3 2','parachute-cord');
    path('M-1 0H3V4H-1Z','parachute-pack');
   }else if(u.kind==='scout'){
    path('M-7-9H-2L0-2H-10Z M5-9H10L13-2H3Z','vehicle-body');
    path('M-2-6H5','specialist-line');
    for(const x of [-5,8])add('circle',{cx:x,cy:-1,r:3.6,class:'vehicle-track'});
   }else if(u.kind==='engineer'){
    path('M-7-12L7 1M8-11L-6 2','tool-handle');
    path('M4-2L9-5 13 0Q11 5 7 3Z M3-12Q8-16 13-9L8-11Z','tool-steel');
    path('M-10-13L-7-15-4-12-7-9Z','tool-steel');
   }else if(u.kind==='at_team'){
    path('M-12-9H13V-5H-12Z M-6-5V-1H-3V-5Z','vehicle-body');
    path('M-14-10V-4M14-10V-4M2-3L-1 2M2-3L6 2','specialist-line');
   }else if(u.kind==='squad'&&u.side==='us'){
    drawing.classList.add('insignia-us-infantry');
    path('M-9-2L2-13 13-2V2L2-8-9 2Z','rank-gold');
    path('M-8-2L2-12 12-2','rank-gold-highlight insignia-detail');
   }else if(u.kind==='squad'){
    drawing.classList.add('insignia-de-infantry');
    add('circle',{cx:2,cy:-6,r:8,class:'rank-roundel'});
    path('M2-12L8-6 2 0-4-6Z','rank-diamond');
    path('M2-11L7-6H2Z','rank-silver-light');
    path('M2-11L-3-6H2Z','rank-silver-mid');
    path('M-3-6L2-1V-6Z','rank-silver-dark');
    path('M2-6H7L2-1Z','rank-silver-shadow');
    add('circle',{cx:2,cy:-6,r:1,class:'rank-rivet'});
   }else if(u.kind==='leader'&&u.side==='us'){
    drawing.classList.add('insignia-us-leader');
    for(const x of [-6,4]){
     path(`M${x}-13h6V2h-6Z`,'rank-silver-bar');
     path(`M${x+1}-12h4v2l-4 2Z`,'rank-silver-light');
     path(`M${x+1} 1V-8l1-1V0h3v1Z`,'rank-silver-dark');
    }
   }else if(u.kind==='leader'){
    drawing.classList.add('insignia-de-leader');
    path('M-10-14H14V2H-10Z','rank-green-patch');
    for(const y of [-7,-3.5,0])path(`M-8 ${y}H12`,'rank-green-stripe');
    path('M-7-11Q2-9 11-12','rank-branch');
    for(const [x,y] of [[-6,-12],[-2,-11],[2,-11],[6,-12],[10,-13]]){
     path(`M${x} ${y+1}q-3-4-4-2q1 3 4 2M${x} ${y+1}q3-4 4-2q-1 3-4 2`,'rank-leaf');
    }
   }else if(u.side==='us'){
    drawing.classList.add('insignia-us-mg');
    // Broad receiver, left-facing ventilated barrel and a three-legged mount.
    path('M1-5V-2M1-2L-6 2M1-2L8 1M1-2L15 3','mg-mount');
    path('M-7 2H-4M7 1H9M14 3H16','mg-feet');
    path('M-16-8H-1V-5H-16Z M-1-10H11V-4H-1Z M11-8H14V-6H11Z','mg-metal');
    path('M12-6H14L15-3H13Z','mg-grip');
    path('M0-11H1V-10M8-11H10V-10','mg-sight');
    for(const x of [-12,-9,-6,-3])add('circle',{cx:x,cy:-6.5,r:.65,class:'mg-vent'});
    path('M1-9H10M-15-7.8H-2M2-7H5V-6H2','mg-engraving insignia-detail');
   }else{
    drawing.classList.add('insignia-de-mg');
    // Shoulder stock, long barrel jacket and forward bipod distinguish the German MG.
    path('M10-5L8 2M10-5L13 2','mg-mount');
    path('M7 2H9M12 2H14','mg-feet');
    path('M-16-10L-12-8H-9V-5H-12L-16-3Z','mg-grip');
    path('M-9-8H-4L-2-9H2V-8H13L14-7H16V-5H14L13-4H2V-5H-9Z','mg-metal');
    path('M-5-5H-2L-3-1H-5Z','mg-grip');
    path('M-2-5V-3H0V-5','mg-trigger insignia-detail');
    path('M11-10V-8M-7-9H-5','mg-sight');
    for(const x of [3.5,6,8.5,11])add('rect',{x,y:-6.8,width:1.4,height:1.1,rx:.4,class:'mg-vent'});
    path('M-8-7H-3L-1-8H1','mg-engraving insignia-detail');
   }
   const raster=rasterName(u);
   if(raster){
    // Keep the deterministic symbol as an immediate fallback until the bitmap loads.
    const fallback=el('g',{class:'raster-fallback'});
    while(drawing.firstChild)fallback.append(drawing.firstChild);
    const picture=el('image',{class:'unit-bitmap',x:-20,y:-16,width:40,height:21,preserveAspectRatio:'xMidYMid meet',href:`/assets/unit-images/${raster}-v1.webp`});
    picture.addEventListener('load',()=>{fallback.setAttribute('display','none');picture.classList.add('bitmap-ready');});
    picture.addEventListener('error',()=>{fallback.removeAttribute('display');picture.remove();});
    drawing.append(fallback,picture);
   }
   if(u.entrenched){
    const bags=el('g',{class:'counter-sandbags'});art.append(bags);
    for(let x=-19;x<19;x+=9)path(`M${x} 16q-2 0-2 3t2 3h6q2 0 2-3t-2-3Z`,'sandbag',bags);
    path('M-15 18h2M-6 20h2M3 18h2M12 20h2','sandbag-seam',bags);
   }
   if(u.overwatch){
    const eye=el('g',{class:'counter-overwatch',transform:'translate(-16 -15)'});art.append(eye);
    add('circle',{r:5.5,class:'status-disc'},eye);path('M-4 0Q0-5 4 0Q0 5-4 0Z','status-eye',eye);add('circle',{r:1.3,class:'eye-pupil'},eye);
   }
   if(u.pinned){
    const pin=el('g',{class:'counter-pin',transform:'translate(17 -14)'});art.append(pin);
    path('M-5-5H5V3L0 7-5 3Z','pin-flag',pin);path('M0-2V1M0 3v.2','pin-alert',pin);
   }
   path('M-23-10V-19H-13M13-19H23V-10M23 10V20H13M-13 20H-23V10','selection-brackets',art);
   path('M17-19h6v6Z','selection-corner',art);
   // Art covers only the old name area. Strength/AP, platoon and hit targets stay intact.
   const name=counter.querySelector('.unit-name');if(name)counter.insertBefore(art,name);else counter.append(art);
  }
  size(svg);
 }
 function sync(){
  document.body.classList.toggle('illustrated-units',illustrated);
  button.textContent=illustrated?'Units: illustrated':'Units: classic';button.setAttribute('aria-pressed',String(illustrated));
  for(const svg of observed)if(!svg.isConnected){observer.unobserve(svg);observed.delete(svg);}
  if(!state)return;
  decorate(document.getElementById('map'),state.units);
  const replay=typeof playbackSession!=='undefined'&&playbackSession;
  if(replay)decorate(document.getElementById('playbackMap'),replay.frames[replay.index][replay.phase].units);
 }
 const button=document.createElement('button');button.id='unitStyleToggle';button.type='button';button.title='Switch unit counters independently of terrain';
 document.getElementById('playTools').append(button);
 button.onclick=()=>{illustrated=!illustrated;try{localStorage.setItem('ww2-unit-style',illustrated?'illustrated':'classic');}catch{}sync();};
 document.addEventListener('ww2:render',sync);document.addEventListener('ww2:playback',sync);sync();
})();
