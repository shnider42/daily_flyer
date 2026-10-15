/* Basic recognition symbols and Detailed painted miniatures. Counters own input. */
'use strict';
(()=>{
 let detailed=true;
 try{detailed=!['basic','classic'].includes(localStorage.getItem('ww2-unit-style'));}catch{}
 const ns='http://www.w3.org/2000/svg',observed=new Set();
 let illustrationId=0;
 const ships=new Set(['carrier','battleship','cruiser','destroyer']);
 const planes=new Set(['fighter','bomber','transport_aircraft']);
 function el(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;}
 function size(svg){const width=svg.viewBox.baseVal.width;svg.classList.toggle('compact-unit-art',!!width&&svg.getBoundingClientRect().width/width*40<40);}
 const observer=new ResizeObserver(entries=>entries.forEach(e=>size(e.target)));
 function illustrate(drawing,u,art){
  const library=window.ww2UnitIllustrations,portrait=library?.resolve(u,state);
  if(!portrait)return;
  const atlas=library.atlases[portrait.atlas];
  const fallback=el('g',{class:'unit-art-fallback'});
  while(drawing.firstChild)fallback.append(drawing.firstChild);
  const viewport=el('svg',{x:-24,y:-17,width:48,height:29,viewBox:portrait.box.join(' '),class:'unit-illustration',overflow:'hidden',preserveAspectRatio:'xMidYMid meet','data-portrait':portrait.key});
  const picture=el('image',{href:`/assets/unit-images/${atlas.file}`,width:atlas.width,height:atlas.height});
  // A viewBox with "meet" can expose adjacent atlas cells in its letterbox.
  // Clip the source window itself as well as the outer SVG viewport.
  const id=`unit-illustration-${++illustrationId}`,defs=el('defs',{}),clip=el('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
  const [x,y,width,height]=portrait.box;
  clip.append(portrait.clip?el('path',{d:portrait.clip}):el('rect',{x,y,width,height}));defs.append(clip);viewport.append(defs);picture.setAttribute('clip-path',`url(#${id})`);
  picture.addEventListener('load',()=>drawing.classList.add('illustration-ready'),{once:true});
  picture.addEventListener('error',()=>{drawing.classList.remove('illustration-ready');viewport.remove();},{once:true});
  viewport.append(picture);drawing.append(fallback,viewport);
  if(portrait.badge){
   const badge=el('g',{class:`illustration-role role-${portrait.badge}`,transform:'translate(16 -13)'});
   badge.append(el('circle',{r:4.5,class:'role-disc'}));
   const marks={leader:'M-2-2V2M1-2V2',commander:'M0-3 .9-1 3-1 1.3.5 2 3 0 1.5-2 3-1.3.5-3-1-.9-1Z',pathfinder:'M0-3V3M-3 0H3',aa:'M-2 2L2-2M2 2L-2-2',torpedo:'M-3 0H3M1-2L3 0 1 2'};
   badge.append(el('path',{d:marks[portrait.badge],class:'role-symbol'}));art.append(badge);
  }
 }
 function drawUnit(drawing,u){
  const add=(tag,attrs,parent=drawing)=>{const n=el(tag,attrs);parent.append(n);return n;};
  const path=(d,cls='art-solid',parent=drawing)=>add('path',{d,class:cls},parent);
  const circle=(x,y,r,cls='art-solid',parent=drawing)=>add('circle',{cx:x,cy:y,r,class:cls},parent);
  const detail=(d,parent=drawing)=>path(d,'art-detail',parent);
  const line=(d,parent=drawing)=>path(d,'art-line',parent);
  if(planes.has(u.kind)){
   const four=['lancaster','halifax'].includes(u.variant),twin=four||u.kind!=='fighter'||['mosquito_fighter','bf110'].includes(u.variant);
   const wide=u.kind==='bomber'||u.kind==='transport_aircraft';
   path(u.kind==='transport_aircraft'?'M-2.5-14Q0-17 2.5-14L3-5 20 .3V4L3 .1 2.5 9 8 12V14L0 12-8 14V12L-2.5 9-3 .1-20 4V.3L-3-5Z':wide?'M-1.8-14Q0-17 1.8-14L2.2-5 20 .3V4L2.4 .1 2 9 8 12V14L0 12-8 14V12L-2 9-2.4 .1-20 4V.3L-2.2-5Z':'M-1.4-14Q0-17 1.4-14L1.8-5 17 1V4L2 .3 1.5 10 6 12V14L0 12-6 14V12L-1.5 10-2 .3-17 4V1L-1.8-5Z');
   const engines=four?[-12,-6,6,12]:twin?[-8,8]:[0];
   for(const x of engines){path(`M${x-1.3}-5h2.6v9h-2.6Z`);line(`M${x-3}-5h6`);detail(`M${x-.5}-3v5`);}
   path('M-1-12H1V-7H-1Z','art-cutout');
   detail('M0-5V11M-14 1l10-2M4-1l10 2M-5 12h10');
   if(u.variant==='halifax')path('M-6 11v4h2v-4ZM4 11v4h2v-4Z');
   if(u.variant==='bf110'){line('M-2-13l-4-4M2-13l4-4M-5-15h10');}
   if(u.variant==='mosquito_pathfinder'){circle(14,-9,3,'art-role-disc');line('M14-13v8M10-9h8');}
   if(u.kind==='transport_aircraft'){path('M-1.2 3h2.4v4h-2.4Z','art-cutout');detail('M-1 0h2M-1 8h2');}
   if(u.variant==='torpedo_bomber'){path('M-1-1h2v10l-1 2-1-2Z','art-secondary');}
   if(u.variant==='dive_bomber'){line('M12-11l6 6M18-5v-5M18-5h-5');}
   return;
  }
  if(ships.has(u.kind)){
   path('M-21 7H21L16 13H-16Z');
   path('M-16 9H16','art-cutline');
   if(u.kind==='carrier'){
    path('M-21 3H21V7H-21Z');path('M6-5H11V3H3V0H6Z');line('M9-10v5M6-8h6');
    path('M-15-1h10v2h-10ZM-11-4h2v7h-2Z','art-secondary');
    detail('M-19 5H1M-3 4V6M1 4V6M5 4V6M13 4V6');
   }else{
    path(u.kind==='battleship'?'M-6 7V0H-3V-8H3V-3H7V7Z':'M-5 7V-1H2V2H6V7Z');
    line('M-1-12v10M-4-9h6');
    for(const x of (u.kind==='cruiser'?[-9,5,10]:u.kind==='destroyer'?[-7,6]:[-9,9]))path(`M${x-1.5} 0h3v7h-3Z`,'art-secondary');
    for(const x of (u.kind==='battleship'?[-15,-9,14]:[-14,14])){
     path(`M${x-2} 4h4v3h-4Z`);line(`M${x} 4h${x<0?-6:6}`);
     if(u.kind==='battleship')detail(`M${x} 2h${x<0?-6:6}`);
    }
    if(u.variant==='aa_escort')for(const x of [-13,12])line(`M${x} 3l-4-6M${x} 3l4-6`);
    if(u.variant==='torpedo_cruiser')path('M-11 1h8v2h-8ZM-11-2h8v2h-8Z','art-secondary');
    detail('M-3-5h3M-3-2h3M-3 1h3M-17 10h3M-10 10h3M3 10h3M10 10h3');
   }
   return;
  }
  if(u.kind==='tank'||u.kind==='halftrack'){
   const heavy=['tiger','kv1','matilda'].includes(u.variant);
   path(u.kind==='halftrack'?'M-17 6H1Q5 6 5 10Q5 14 1 14H-17Q-21 14-21 10Q-21 6-17 6Z':'M-15 6H15Q21 6 21 10Q21 14 15 14H-15Q-21 14-21 10Q-21 6-15 6Z');
   path(u.kind==='halftrack'?'M-18-3H2L8 1H14L18 7H-18Z':heavy?'M-17 0H16V7H-17ZM-9-9H6V0H-9Z':'M-14 1H12L17 7H-18ZM-7-7H4L8 1H-10Z','art-secondary');
   line(u.kind==='halftrack'?'M0-5h9':heavy?'M-2-5H21':'M2-4H21');
   if(u.kind==='halftrack')circle(15,10,4);
   const wheels=u.kind==='halftrack'?[-15,-9,-3]:[-15,-9,-3,3,9,15];
   for(const x of wheels)circle(x,10,2,'art-cutout');
   detail(u.kind==='halftrack'?'M-15-1H0M8 2h5M-15 7v6M-8 7v6':'M-12 3H10M-6-5H2M-16 7v6M-8 7v6M0 7v6M8 7v6M16 7v6');
   return;
  }
  if(u.kind==='landing_craft'||u.kind==='amphibious'){
   const afloat=u.kind==='landing_craft'||!state?.naval_version||['water','objective'].includes(state.map?.[u.pos[1]]?.[u.pos[0]]);
   if(afloat){
    path('M-20 3H20V12H-15Z');path('M-19-5H-12V3H-19ZM15-7H20V3H15Z','art-secondary');
    path('M-11-1H13V4H-11Z','art-cutout');for(const x of [-8,0,8]){circle(x,-1,2);path(`M${x-2} 1h4v3h-4Z`);}
    detail('M-16 8H15M17-4v13M-16-3h2');
   }else{
    for(const [x,s] of [[-11,.72],[0,1],[11,.72]]){const person=add('g',{transform:`translate(${x} 1) scale(${s})`});infantry(person,'squad');}
   }
   return;
  }
  if(['aa_gun','at_gun','flak'].includes(u.kind)){
   const aa=u.kind!=='at_gun',light=u.kind==='flak'||u.variant==='light_flak';
   path('M-4 2H4V9H-4Z');line('M0 8l-14 6M0 8l14 6');
   for(const x of [-8,8])circle(x,9,3.5);
   if(aa){
    path(light?'M-5 0L10-15 13-12-2 3Z':'M-7-3L7-17 13-11-1 3Z','art-secondary');
    line(light?'M1-6l11-11':'M3-7l12-13');
    if(light)line('M4-3l11-11');
    detail('M-4 0l4-4M1-5l5-5M-8 8v3M8 8v3');
   }else{
    path('M-6-6H5L8 4H-8Z','art-secondary');line('M1-4H21');detail('M-5-4H2M-5-1H4M-8 8v3M8 8v3');
   }
   return;
  }
  if(u.kind==='radar'){
   path('M-4 1H4V12H-4Z');line('M0 5l-10 9M0 5l10 9');
   path('M-14-15Q-11 1 7-1L-14-15Z','art-secondary');line('M-3-8L5-16M-3-8L10-7');
   detail('M-10-12Q-7-3 3-3M-12-10l9 9M-7-10l7 8M-2 5H2M-2 9H2');return;
  }
  if(u.kind==='spotlight'){
   line('M0 5l-12 9M0 5l12 9M0 5V-1');
   path('M-11-8L0-14 9 1-2 7Z');path('M0-14L9 1l4-3-9-15Z','art-secondary');
   line('M11-11l7-7M15-4l8-3');detail('M-7-5l6-4M-5-1l6-4M0 9v4');return;
  }
  if(u.kind==='airfield'){
   path('M-19-10H-3V13H-19ZM3-4H20V13H3Z');path('M5-4L12-11 20-4Z','art-secondary');
   path('M-13-8H-9V11H-13Z','art-cutout');path('M7 1H16V13H7Z','art-cutout');
   line('M-11-7v3M-11 0v3M-11 7v3');detail('M6-2h11M17 0v10');return;
  }
  if(u.kind==='supply'){
   path('M-16-7H16V13H-16Z');path('M-16-7L0-15 16-7Z','art-secondary');
   path('M-2-7H2V13H-2Z','art-cutout');detail('M-12-3H-6M6-3H12M-12 8H-6M6 8H12');return;
  }
  if(u.kind==='paratrooper'){
   path('M-17-4Q-16-18 0-18Q16-18 17-4Q11-7 6-4Q0-7-6-4Q-11-7-17-4Z');
   line('M-15-4L-2 7M15-4L2 7M-6-4L-1 7M6-4L1 7');
   circle(0,7,2);path('M-3 9H3L4 13H-4Z');line('M-2 12l-3 4M2 12l3 4');
   detail('M0-17Q-9-15-6-5M0-17Q9-15 6-5M0-17V-6');return;
  }
  if(u.kind==='mg'){
   line('M0 5l-12 9M0 5l10 9M0 5V1');
   path('M-18-5H-1V-2H-18ZM-1-7H10V0H-1ZM10-5H17V-2H10Z');
   path('M4 0H8L9 4H6Z','art-secondary');
   for(const x of [-14,-10,-6])path(`M${x}-4h2v1h-2Z`,'art-cutout');
   detail('M1-5H7M-17-7v2M8-9v2M1-1v3h3');return;
  }
  if(u.kind==='mortar'){
   line('M-17 14H17M-3 8l8 6M3 0l10 14');
   path('M-9 10L2-13 7-10-4 12Z');path('M-12 10H1V14H-12Z','art-secondary');
   detail('M-7 9L3-10M4-10l2 1M-7 13H-3');return;
  }
  if(u.kind==='squad'){
   const rear=add('g',{transform:'translate(-8 -1) scale(.8)',class:'art-secondary-figure'});infantry(rear,'squad');
   const front=add('g',{transform:'translate(5 1)'});infantry(front,'squad');return;
  }
  infantry(drawing,u.kind);
  if(u.kind==='leader')path('M-16-11h3v8h-3ZM-11-11h3v8h-3Z','art-role-mark');
  if(u.kind==='commander')path('M-13-16l2 5 5 .5-4 3 1 5-4-3-4 3 1-5-4-3 5-.5Z','art-role-mark');
  if(u.kind==='pathfinder'){line('M14-15V-3M9-9h10');circle(14,-9,2,'art-role-mark');}
  function infantry(parent,kind){
   const p=(d,cls='art-solid')=>path(d,cls,parent),l=d=>line(d,parent),dt=d=>detail(d,parent);
   p('M-7-7Q-10-12-5-14Q0-15 3-10L3-7Z','art-solid landing-helmet');circle(-2,-7,3,'art-secondary',parent);
   p('M-6-4L0-4 4 6-1 8-4 4-7 9-12 8-8 2Z');
   p('M-11 7L-6 8-7 14H-14V11H-11ZM0 6L4 6 8 13H3Z');
   l('M-5-2L1 1 8-2');
   if(kind==='scout'){p('M5-7h10v4H5Z');circle(7,-5,1,'art-cutout',parent);circle(13,-5,1,'art-cutout',parent);l('M-4-1L4-5');}
   else if(kind==='engineer'){l('M1 9L12-13');p('M10-13l4-3 5 4-5 5Z','art-secondary');}
   else if(kind==='at_team'){p('M-3-6H19V-2H-3Z');p('M14-7h4v6h-4Z','art-secondary');}
   else if(kind==='radioman'){p('M-12-5h6v10h-6Z','art-secondary');l('M-10-5V-17');dt('M-11-2h3M-11 1h3');}
   else if(kind==='commando'){l('M4 4L14-9');p('M12-9l5-4-1 6Z','art-secondary');}
   else if(kind==='mountain'){l('M3 13L14-14M9-12h10');p('M10-12l4-2 5 2Z','art-secondary');}
   else{l(kind==='sniper'?'M-2-1L20-5':'M-1 0L17-3');p('M3-1L11-2 11 0 3 1Z','art-secondary');if(kind==='sniper')p('M5-5h7v2H5Z');}
   if(kind==='partisan')p('M-8-10L1-15 5-9Z','art-secondary');
   if(kind==='askari')p('M-5-15H1V-10H-5Z','art-secondary');
   dt('M-4-2L-6 4M-8 9l-1 3M1 8l3 3M-5-11h5');
  }
 }
 function decorate(svg,units,force=false){
  if(!svg)return;
  if(force)svg._artUnits=units;
  if(!force&&!observed.has(svg)){observer.observe(svg);observed.add(svg);}
  const byId=new Map(units.map(u=>[u.id,u]));
  for(const counter of svg.querySelectorAll('.unit')){
   const u=byId.get(counter.dataset.unitId);if(!u)continue;
   const style=detailed?'detailed':'basic';
   if(counter._unitArtStyle===style)continue;
   counter._unitArtStyle=style;
   counter.querySelector('.unit-art')?.remove();counter.querySelector('.unit-art-title')?.remove();
   const [cx,cy]=center(...u.pos),art=el('g',{class:`unit-art unit-art-${style}${u.pinned?' is-pinned':''}`,transform:`translate(${cx} ${cy})`,'aria-hidden':'true','data-art-kind':u.kind});
   const title=el('title',{class:'unit-art-title'},`${sideLabel(u.side)} ${unitName(u)} · ${u.hp} strength · ${u.ap} AP${u.pinned?' · pinned':''}${u.entrenched?' · dug in':''}${u.overwatch?' · overwatch':''}`);counter.prepend(title);
   art.append(el('path',{class:'portrait-panel',d:'M-17-15H17Q19-15 19-13V5H-19V-13Q-19-15-17-15Z'}));
   const drawing=el('g',{class:`unit-portrait portrait-${u.kind}${u.variant?' portrait-'+u.variant:''}${ships.has(u.kind)?' naval-silhouette':''}${u.kind==='halftrack'?' insignia-halftrack':''}`,transform:'translate(0 -6) scale(.8)'});art.append(drawing);drawUnit(drawing,u);
   if(detailed)illustrate(drawing,u,art);
   if(u.entrenched){
    const bags=el('g',{class:'counter-sandbags'});art.append(bags);
    for(let x=-19;x<19;x+=9)bags.append(el('path',{d:`M${x} 15q-2 0-2 3t2 3h6q2 0 2-3t-2-3Z`,class:'sandbag'}));
   }
   if(u.overwatch){const eye=el('g',{class:'counter-overwatch',transform:'translate(-16 -15)'});art.append(eye);eye.append(el('circle',{r:5.5,class:'status-disc'}),el('path',{d:'M-4 0Q0-5 4 0Q0 5-4 0Z',class:'status-eye'}),el('circle',{r:1.3,class:'eye-pupil'}));}
   if(u.pinned){const pin=el('g',{class:'counter-pin',transform:'translate(17 -14)'});art.append(pin);pin.append(el('path',{d:'M-5-5H5V3L0 7-5 3Z',class:'pin-flag'}),el('path',{d:'M0-2V1M0 3v.2',class:'pin-alert'}));}
   art.append(el('path',{d:'M-23-10V-19H-13M13-19H23V-10M23 10V20H13M-13 20H-23V10',class:'selection-brackets'}),el('path',{d:'M17-19h6v6Z',class:'selection-corner'}));
   const name=counter.querySelector('.unit-name');if(name)name.before(art);else counter.append(art);
  }
  if(!force&&svg._artViewWidth!==svg.viewBox.baseVal.width){svg._artViewWidth=svg.viewBox.baseVal.width;requestAnimationFrame(()=>{if(svg.isConnected)size(svg);});}
 }
 function sync(){
  document.body.classList.add('illustrated-units');document.body.classList.toggle('detailed-unit-art',detailed);
  button.textContent=detailed?'Units: detailed':'Units: basic';button.setAttribute('aria-pressed',String(detailed));
  for(const svg of observed)if(!svg.isConnected){observer.unobserve(svg);observed.delete(svg);}
  if(!state)return;
  decorate(document.getElementById('map'),state.units);
  for(const svg of document.querySelectorAll('.dad-unit-portrait'))if(svg._artUnits)decorate(svg,svg._artUnits,true);
  const replay=typeof playbackSession!=='undefined'&&playbackSession;
  if(replay)decorate(document.getElementById('playbackMap'),replay.frames[replay.index][replay.phase].units);
 }
 // Close-ups use the same artwork and preference as the map, including reserves.
 window.makeUnitPortrait=u=>{
  const [x,y]=center(...u.pos),svg=el('svg',{class:'dad-unit-portrait illustrated-units',viewBox:`${x-26} ${y-25} 52 50`,'aria-hidden':'true',focusable:'false'});
  const counter=el('g',{class:`unit ${u.side}`,'data-unit-id':u.id});counter.append(el('rect',{x:x-22,y:y-19,width:44,height:40,rx:3}));svg.append(counter);decorate(svg,[u],true);return svg;
 };
 const button=document.createElement('button');button.id='unitStyleToggle';button.type='button';button.title='Switch all unit icons between basic silhouettes and detailed painted miniatures';document.getElementById('playTools').append(button);
 button.onclick=()=>{detailed=!detailed;try{localStorage.setItem('ww2-unit-style',detailed?'detailed':'basic');}catch{}sync();document.dispatchEvent(new Event('ww2:unit-style'));};
 document.addEventListener('ww2:render',sync);document.addEventListener('ww2:playback',sync);sync();
})();
