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
   const drawing=el('g',{class:`unit-portrait portrait-${u.kind}`});art.append(drawing);
   const add=(tag,attrs,parent=drawing)=>{const n=el(tag,attrs);parent.append(n);return n;};
   const path=(d,cls,parent=drawing)=>add('path',{d,class:cls},parent);
   if(u.kind==='squad'){
    for(const [x,y,s] of [[-7,-7,.8],[9,-7,.8],[1,-3,1]]){
     const man=el('g',{transform:`translate(${x} ${y}) scale(${s})`});drawing.append(man);
     add('circle',{cx:0,cy:-3,r:2.4,class:'portrait-face'},man);
     path('M-4-4Q-4-9 0-9Q4-9 4-4Z','portrait-helmet',man);
     path('M-5 6V2Q-5-1-2-1H2Q5-1 5 2V6Z','portrait-coat',man);
     path('M-3 2L4 5M-1-1V5','portrait-detail',man);
     path('M4 6L6-3','portrait-rifle',man);
    }
   }else if(u.kind==='leader'){
    add('circle',{cx:2,cy:-8,r:3,class:'portrait-face'});
    path('M-2-10V-13H5L7-10Z M-3-9H8','portrait-helmet');
    path('M-6 3V-1Q-6-6 0-6H4Q10-6 10-1V3Z','portrait-coat');
    path('M-6-2L-2-6M10-2L6-6','portrait-arm');
    add('circle',{cx:0,cy:-5,r:2.2,class:'portrait-optics'});add('circle',{cx:4.5,cy:-5,r:2.2,class:'portrait-optics'});
    path('M0-4H4M0-1L2 2 4-1M5-1V2','portrait-detail');
   }else{
    path('M-14-6H7V-3H-14Z M7-5H15 M-12-4L-16 1 M-2-3L-8 4 M0-3L6 4','portrait-gun');
    path('M-8-6V-10H0V-6 M-13-8H-6','portrait-gun');
    path('M-6-10V-7M-3-10V-7M1-5H4','portrait-detail');
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
