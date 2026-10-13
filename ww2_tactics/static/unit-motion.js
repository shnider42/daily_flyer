/* Confirmed movement only. Art interpolates; orders and hit targets stay at the
   authoritative hex. No waits, optimistic positions, or hidden flight routes. */
'use strict';
(()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),identity=()=>new DOMMatrix(),air=u=>['fighter','bomber','transport_aircraft'].includes(u.kind);
 const same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1];
 const active=u=>u.hp>0&&!u.reserve&&!u.carrier_id;
 function outerMatrix(g){let matrix=identity();for(let i=0;i<g.transform.baseVal.numberOfItems;i++)matrix=matrix.multiply(g.transform.baseVal.getItem(i).matrix);return matrix;}
 function visualMatrix(g){
  const ghost=g?._motionGhost,root=ghost?._motionRoot,value=g?._motionAnimation&&getComputedStyle(root||g).transform;
  if(!value||value==='none')return identity();
  const matrix=new DOMMatrix(value);return root?root._motionBasis.inverse().multiply(matrix).multiply(root._motionBasis):matrix;
 }
 function stop(g){
  if(!g)return;g._motionAnimation?.cancel();g._motionAnimation=null;g._motionUntil=0;
  const avatar=g._motionGhost?._motionRoot,layer=avatar?.parentElement;
  avatar?.remove();g._motionGhost=null;g.removeAttribute('visibility');
  if(layer&&!layer.children.length){layer._motionObserver?.disconnect();layer.remove();}
 }
 function clearOverlay(svg){for(const counter of [...(svg?._motionOverlay?.children||[])])stop(counter._motionSource);}
 function fitOverlay(svg,overlay){
  if(!svg.isConnected||!overlay.isConnected)return;
  const matrix=svg.getScreenCTM(),parent=svg.parentElement,rect=parent.getBoundingClientRect();if(!matrix)return;
  for(const avatar of [...overlay.children]){
   if(avatar._motionScale&&(Math.abs(avatar._motionScale[0]-matrix.a)>.001||Math.abs(avatar._motionScale[1]-matrix.d)>.001)){stop(avatar._motionSource);continue;}
   const box=avatar._motionBox;avatar._motionScale=[matrix.a,matrix.d];
   avatar.setAttribute('viewBox',`${box.x} ${box.y} ${box.width} ${box.height}`);
   avatar.style.left=`${matrix.e+box.x*matrix.a-rect.left+parent.scrollLeft-parent.clientLeft}px`;
   avatar.style.top=`${matrix.f+box.y*matrix.d-rect.top+parent.scrollTop-parent.clientTop}px`;
   avatar.style.width=`${box.width*matrix.a}px`;avatar.style.height=`${box.height*matrix.d}px`;
   avatar._motionBasis=identity().scale(matrix.a,matrix.d).translate(-box.x,-box.y).multiply(outerMatrix(avatar.firstElementChild));
   for(let i=0;i<svg.style.length;i++){const name=svg.style.item(i);if(name.startsWith('--'))avatar.style.setProperty(name,svg.style.getPropertyValue(name));}
  }
 }
 function movingVisual(svg,g,visual){
  let overlay=svg._motionOverlay;
  if(!overlay?.isConnected){
   overlay=document.createElement('div');overlay.className='unit-motion-layer';overlay.setAttribute('aria-hidden','true');
   svg.parentElement.append(overlay);svg._motionOverlay=overlay;
   overlay._motionObserver=new ResizeObserver(()=>fitOverlay(svg,overlay));overlay._motionObserver.observe(svg);
  }
  const counter=g.cloneNode(true);counter.removeAttribute('tabindex');counter.removeAttribute('role');counter._unitPos=g._unitPos.slice();counter._motionSource=visual;
  const avatar=element('svg',{class:'unit-motion-overlay',focusable:'false',preserveAspectRatio:'none'}),[x,y]=center(...g._unitPos);
  avatar.dataset.unitId=g.dataset.unitId;avatar._motionSource=visual;avatar._motionBox={x:x-38,y:y-38,width:76,height:76};avatar.append(counter);overlay.append(avatar);fitOverlay(svg,overlay);
  const ghost=counter.querySelector(':scope > .unit-motion');ghost.removeAttribute('visibility');ghost._motionRoot=avatar;
  visual.setAttribute('visibility','hidden');visual._motionGhost=ghost;return ghost;
 }
 function capture(svg){
  if(!svg)return;
  const before=new Map();
  for(const g of svg.querySelectorAll('.unit')){
   const pos=g._unitPos;if(!pos||g.classList.contains('joint-hidden'))continue;
   const visual=g.querySelector(':scope > .unit-motion');
   const until=visual?._motionUntil||0,remaining=until===Infinity?visual?._motionAnimation?._motionDuration:Math.max(1,until-performance.now());
   before.set(g.dataset.unitId,{pos:pos.slice(),matrix:outerMatrix(g).multiply(visualMatrix(visual)),until,remaining,node:g,visual,outer:g.getAttribute('transform')});
  }
  svg._motionBefore={units:before,key:svg._motionKey,revision:svg._motionRevision,sight:svg._motionSight};
 }
 function wrapper(g){
  let visual=g.querySelector(':scope > .unit-motion');
  if(!visual){visual=element('g',{class:'unit-motion'});g.append(visual);}
  // Decorators may append new status/portrait nodes on a retained counter.
  for(const child of [...g.children])if(child!==visual&&!child.classList.contains('unit-hit-target')&&child.tagName.toLowerCase()!=='title')visual.append(child);
  return visual;
 }
 function sight(value){return {fog:!!state?.fog_of_war,ground:new Set((value.visible_hexes||[]).map(p=>p.join(','))),air:new Set((value.visible_air_hexes||value.visible_hexes||[]).map(p=>p.join(',')))};}
 function hexLine(start,end){
  const cube=p=>{const x=p[0]-(p[1]-(p[1]&1))/2;return [x,-x-p[1],p[1]];},a=cube(start),b=cube(end),steps=Math.max(...a.map((v,i)=>Math.abs(v-b[i]))),line=[];
  for(let i=0;i<=steps;i++){
   const fraction=steps?i/steps:0,p=a.map((v,j)=>v+(b[j]-v)*fraction+(j<2?1e-6:-2e-6)),r=p.map(Math.round),k=p.reduce((best,v,j)=>Math.abs(r[j]-v)>Math.abs(r[best]-p[best])?j:best,0);
   r[k]=-r.reduce((sum,v,j)=>j===k?sum:sum+v,0);line.push([r[0]+(r[2]-(r[2]&1))/2,r[2]]);
  }
  return line;
 }
 function visibleMove(u,from,to,previous,current){
  if(u.side===state.side||!current.fog)return true;
  if(!previous)return false;
  const field=air(u)?'air':'ground';
  // Seeing both endpoints does not disclose a route across unobserved hexes.
  return hexLine(from,to).every(p=>previous[field].has(p.join(','))&&current[field].has(p.join(',')));
 }
 function finish(svg,value,options={}){
  if(!svg||!value)return;
  const key=options.key||`${state.code}:${state.battle_number||1}`,before=svg._motionBefore,currentSight=sight(value),now=performance.now(),reduceNow=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(before?.key!==key)clearOverlay(svg);
  const continuous=options.allowAnimation!==false&&before?.key===key&&(options.playback||value.revision===before.revision+1);
  const units=new Map(value.units.filter(active).map(u=>[u.id,u]));
  // A contact disappearing from the public view must disappear immediately,
  // including any separate image that was still in mid-flight.
  for(const counter of [...(svg._motionOverlay?.children||[])])if(!units.has(counter.dataset.unitId))stop(counter._motionSource);
  for(const g of svg.querySelectorAll('.unit')){
   const u=units.get(g.dataset.unitId);if(!u)continue;
   const visual=wrapper(g),old=before?.key===key&&before.units.get(u.id),changed=old&&!same(old.pos,u.pos),continuing=old?.until>now&&!changed;
   if(old?.visual&&old.visual!==visual)stop(old.visual);
   g._unitPos=u.pos.slice();
   if(reduceNow||document.hidden||g.classList.contains('joint-hidden')||!old||(!continuing&&(!changed||!continuous||!visibleMove(u,old.pos,u.pos,before.sight,currentSight)))){stop(visual);continue;}
   if(continuing&&old.node===g&&old.visual===visual&&old.outer===g.getAttribute('transform')){visual._motionGhost?.parentElement?.setAttribute('class',g.getAttribute('class'));continue;}
   const [oldX,oldY]=center(...old.pos),[x,y]=center(...u.pos),inverse=outerMatrix(g).inverse();
   const start=inverse.multiply(old.matrix).translate(oldX-x,oldY-y),order=svg._motionSubmitted,route=[];
   if(changed&&order?.id===u.id&&same(order.from,old.pos)&&order.path?.length){
    const end=order.path.findIndex(p=>same(p,u.pos));
    if(end>=0)route.push(...order.path.slice(0,end));
   }
   // A multi-hex flight needs time for each leg. Compressing the whole route
   // into about 200 ms made even genuine interpolation look like a jump.
   let distance=0,previous=[oldX,oldY];
   const legs=route.concat([u.pos]).map(pos=>{const point=center(...pos);distance+=Math.hypot(point[0]-previous[0],point[1]-previous[1]);previous=point;return {point,distance};});
   const duration=continuing?old.remaining:Math.min(650,300+Math.max(0,distance/52-1)*120);
   stop(visual);
   const frames=[{transform:start.toString(),offset:0}];
   for(const leg of legs.slice(0,-1)){
    const [px,py]=leg.point,point=inverse.multiply(outerMatrix(g)).translate(px-x,py-y);
    frames.push({transform:point.toString(),offset:distance?leg.distance/distance:0});
   }
   frames.push({transform:identity().toString(),offset:1});
   // Animate a small independent SVG, leaving the large terrain/fog drawing
   // untouched on every frame. The original counter retains all input targets.
   const ghost=movingVisual(svg,g,visual),avatar=ghost._motionRoot,basis=avatar._motionBasis,inverseBasis=basis.inverse();
   const screenFrames=frames.map(frame=>({...frame,transform:basis.multiply(new DOMMatrix(frame.transform)).multiply(inverseBasis).toString()}));
   const animation=avatar.animate(screenFrames,{duration,easing:continuing?'linear':'cubic-bezier(.35,0,.65,1)'});visual._motionAnimation=animation;
   // Paint the origin first. Layout work after this listener must not consume
   // the animation before the browser gets a chance to display its first frame.
   animation.pause();animation.currentTime=0;animation._motionDuration=duration;visual._motionUntil=Infinity;
   requestAnimationFrame(()=>{
    if(visual._motionAnimation!==animation)return;
    if(!visual.isConnected||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){stop(visual);return;}
    visual._motionUntil=performance.now()+duration;animation.play();
   });
   animation.onfinish=()=>{if(visual._motionAnimation===animation)stop(visual);};
  }
  svg._motionKey=key;svg._motionRevision=value.revision;svg._motionSight=currentSight;svg._motionBefore=null;
 }
 function submitted(svg,u,move){svg._motionSubmitted={id:u.id,from:u.pos.slice(),path:move?.path?.map(p=>p.slice())};}
 function clearSubmitted(svg){if(svg)svg._motionSubmitted=null;}
 window.ww2Motion={capture,finish,submitted,clearSubmitted,clear:clearOverlay,visual:(svg,id)=>{const visual=svg?.querySelector(`.unit[data-unit-id="${id}"] > .unit-motion`);return visual?._motionGhost||visual;},animations:(svg,id)=>{const visual=svg?.querySelector(`.unit[data-unit-id="${id}"] > .unit-motion`);return visual?._motionAnimation?[visual._motionAnimation]:[];}};
 document.addEventListener('ww2:render',()=>finish($('map'),window.signalSnapshot?.(state)||state));
 document.addEventListener('ww2:playback',()=>{
  if(!playbackSession)return;
  clearOverlay($('map'));
  const p=playbackSession,svg=$('playbackMap'),value=p.frames[p.index][p.phase];
  finish(svg,value,{key:`${state.code}:${state.battle_number||1}:replay:${state.computer_playback.id}:${p.index}`,playback:true,allowAnimation:svg._motionForward});
 });
 document.addEventListener('ww2:before-layout',()=>{clearOverlay($('map'));clearOverlay($('playbackMap'));});
 reduced.addEventListener('change',()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)document.querySelectorAll('.unit-motion').forEach(stop);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelectorAll('.unit-motion').forEach(stop);});
})();
