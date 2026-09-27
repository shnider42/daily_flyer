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
   if(u.kind==='squad'){
    // Staggered marching profiles, not a row of faces. Heads stay small relative to kit.
    for(const [x,y,s,cls] of [[-7,-1,.78,'rear-rifleman'],[3,1,1,'front-rifleman']]){
     const man=el('g',{transform:`translate(${x} ${y}) scale(${s})`,class:cls});drawing.append(man);
     path('M-2-12Q0-14 2-12L3-10 1-9-1-10Z','portrait-face',man);
     path('M-3-12Q-3-16 0-16Q3-16 3-12L4-11H-3Z','portrait-helmet',man);
     path('M-2-9L1-10 4-5 2-2H-3L-4-6Z M-3-2L0-2-2 3H-5Z M0-2H2L5 2H2Z','portrait-coat',man);
     path('M-4-9L-6-7-5-3-3-4Z','portrait-pack',man);
     path('M0-8L4-5 7-7','portrait-arm',man);
     path('M4-1L9-13','portrait-rifle',man);
     path('M4-1L6-6','portrait-stock',man);
     path('M-1-8L1-3M-3-3H2','portrait-detail',man);
    }
   }else if(u.kind==='leader'){
    path('M-3-12L0-13 2-10 0-8-3-9Z','portrait-face');
    path('M-5-13L-4-16H0L2-13 4-12H-4Z','portrait-helmet');
    path('M-4-8L0-9 3-4 1-1H-4L-6-5Z M-4-1H-1L-2 3H-5Z M-1-1H1L3 3H0Z','portrait-coat');
    path('M-1-7L4-4 6-10M-3-7L1-5 4-10','portrait-arm');
    path('M3-12L9-13 10-10 4-9Z','portrait-optics');
    path('M9-13L10-10','portrait-lens');
    path('M-5-6L-7-4-5-1-3-2Z','portrait-pack');
    path('M-3-7L0-2M-4-2H1M4-9L2-4','portrait-detail');
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
