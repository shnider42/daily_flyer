/* Optional decorative counters. Existing SVG groups still own input and game identity. */
'use strict';
(()=>{
 let illustrated=true;
 try{illustrated=localStorage.getItem('ww2-unit-style')!=='classic';}catch{}
 const ns='http://www.w3.org/2000/svg',observed=new Set();
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
   const title=el('title',{class:'unit-art-title'},`${u.side.toUpperCase()} ${unitName(u)} · ${u.hp} strength · ${u.ap} AP${u.pinned?' · pinned':''}${u.entrenched?' · dug in':''}${u.overwatch?' · overwatch':''}`);counter.prepend(title);
   art.append(el('path',{class:'portrait-panel',d:'M-17-14H16Q18-14 18-12V3H-18V-12Q-18-14-17-14Z'}));
   const drawing=el('g',{class:`unit-portrait portrait-${u.kind}`});art.append(drawing);
   const add=(tag,attrs,parent=drawing)=>{const n=el(tag,attrs);parent.append(n);return n;};
   const path=(d,cls,parent=drawing)=>add('path',{d,class:cls},parent);
   if(u.kind==='squad'&&u.side==='us'){
    drawing.classList.add('insignia-us-infantry');
    path('M-10 0L-2-7 2-14 6-7 14 0V4L3-5 2-7 1-5-10 4Z','rank-gold');
    path('M-8 0L0-8 2-12 4-8 12 0','rank-gold-highlight insignia-detail');
   }else if(u.kind==='squad'){
    drawing.classList.add('insignia-de-infantry');
    add('circle',{cx:2,cy:-6,r:9,class:'rank-roundel'});
    path('M2-12L8-6 2 0-4-6Z','rank-diamond');
    path('M2-11L7-6H2Z','rank-silver-light');
    path('M2-11L-3-6H2Z','rank-silver-mid');
    path('M-3-6L2-1V-6Z','rank-silver-dark');
    path('M2-6H7L2-1Z','rank-silver-shadow');
    add('circle',{cx:2,cy:-6,r:1,class:'rank-rivet'});
   }else if(u.kind==='leader'&&u.side==='us'){
    drawing.classList.add('insignia-us-leader');
    for(const x of [-6,6]){
     path(`M${x}-14h6V3h-6Z`,'rank-silver-bar');
     path(`M${x+1}-13h4v3l-4 2Z`,'rank-silver-light');
     path(`M${x+1} 2V-8l1-1V1h3v1Z`,'rank-silver-dark');
    }
   }else if(u.kind==='leader'){
    drawing.classList.add('insignia-de-leader');
    path('M-10-15H15V3H-10Z','rank-green-patch');
    for(const y of [-7,-3,1])path(`M-8 ${y}H13`,'rank-green-stripe');
    path('M-7-11Q2-9 11-12','rank-branch');
    for(const [x,y] of [[-6,-12],[-2,-11],[2,-11],[6,-12],[10,-13]]){
     path(`M${x} ${y+1}q-3-4-4-2q1 3 4 2M${x} ${y+1}q3-4 4-2q-1 3-4 2`,'rank-leaf');
    }
   }else{
    path('M-13-8L-10-9-8-6-11-5-13-6Z','portrait-face');
    path('M-15-8Q-15-12-12-12Q-9-12-8-8Z','portrait-helmet');
    path('M-13-5L-9-5-5-1-10 1H-16L-17-1Z','portrait-coat');
    path('M-10-4L-7-2-3-5','portrait-arm');
    path('M-6-6H4V-3H-6Z M4-5H16 M9-4L5 3M9-4L13 3M-6-5L-10-3','portrait-gun');
    path('M-2-7H2V-6M1-3V1H-2V-3','portrait-gun');
    path('M5-5H6M8-5H9M11-5H12M-1-2V0','portrait-detail');
   }
   art.append(el('text',{x:-16,y:-9,class:'counter-army'},u.side.toUpperCase()));
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
