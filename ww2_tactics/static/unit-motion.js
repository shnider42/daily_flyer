/* Confirmed movement only. Art interpolates; orders and hit targets stay at the
   authoritative hex. No waits, optimistic positions, or hidden flight routes. */
'use strict';
(()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),identity=()=>new DOMMatrix(),air=u=>['fighter','bomber','transport_aircraft'].includes(u.kind);
 const same=(a,b)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1];
 const active=u=>u.hp>0&&!u.reserve&&!u.carrier_id;
 function outerMatrix(g){let matrix=identity();for(let i=0;i<g.transform.baseVal.numberOfItems;i++)matrix=matrix.multiply(g.transform.baseVal.getItem(i).matrix);return matrix;}
 function visualMatrix(g){const value=g?._motionAnimation&&getComputedStyle(g).transform;return value&&value!=='none'?new DOMMatrix(value):identity();}
 function stop(g){if(!g)return;g._motionAnimation?.cancel();g._motionAnimation=null;g._motionUntil=0;}
 function capture(svg){
  if(!svg)return;
  const before=new Map();
  for(const g of svg.querySelectorAll('.unit')){
   const pos=g._unitPos;if(!pos||g.classList.contains('joint-hidden'))continue;
   const visual=g.querySelector(':scope > .unit-motion');
   before.set(g.dataset.unitId,{pos:pos.slice(),matrix:outerMatrix(g).multiply(visualMatrix(visual)),until:visual?._motionUntil||0,node:g,visual,outer:g.getAttribute('transform')});
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
  const key=options.key||`${state.code}:${state.battle_number||1}`,before=svg._motionBefore,currentSight=sight(value),now=performance.now();
  const continuous=options.allowAnimation!==false&&before?.key===key&&(options.playback||value.revision===before.revision+1);
  const units=new Map(value.units.filter(active).map(u=>[u.id,u]));
  for(const g of svg.querySelectorAll('.unit')){
   const u=units.get(g.dataset.unitId);if(!u)continue;
   const visual=wrapper(g),old=before?.key===key&&before.units.get(u.id),changed=old&&!same(old.pos,u.pos),continuing=old?.until>now&&!changed;
   g._unitPos=u.pos.slice();
   if(reduced.matches||document.hidden||g.classList.contains('joint-hidden')||!old||(!continuing&&(!changed||!continuous||!visibleMove(u,old.pos,u.pos,before.sight,currentSight)))){stop(visual);continue;}
   if(continuing&&old.node===g&&old.visual===visual&&old.outer===g.getAttribute('transform'))continue;
   const [oldX,oldY]=center(...old.pos),[x,y]=center(...u.pos),inverse=outerMatrix(g).inverse();
   const start=inverse.multiply(old.matrix).translate(oldX-x,oldY-y),distance=Math.hypot(oldX-x,oldY-y),duration=continuing?Math.max(1,old.until-now):Math.min(260,170+distance*.35);
   stop(visual);
   const frames=[{transform:start.toString(),offset:0}];
   const order=svg._motionSubmitted;
   if(changed&&order?.id===u.id&&same(order.from,old.pos)&&order.path?.length){
    const end=order.path.findIndex(p=>same(p,u.pos));
    if(end>=0)for(const [i,pos] of order.path.slice(0,end).entries()){
     const [px,py]=center(...pos),point=inverse.multiply(outerMatrix(g)).translate(px-x,py-y);
     frames.push({transform:point.toString(),offset:(i+1)/(end+1)});
    }
   }
   frames.push({transform:identity().toString(),offset:1});
   visual._motionUntil=now+duration;
   const animation=visual.animate(frames,{duration,easing:continuing?'linear':'cubic-bezier(.22,.61,.36,1)'});visual._motionAnimation=animation;
   animation.onfinish=()=>{if(visual._motionAnimation===animation){visual._motionAnimation=null;visual._motionUntil=0;}};
  }
  svg._motionKey=key;svg._motionRevision=value.revision;svg._motionSight=currentSight;svg._motionBefore=null;
 }
 function submitted(svg,u,move){svg._motionSubmitted={id:u.id,from:u.pos.slice(),path:move?.path?.map(p=>p.slice())};}
 function clearSubmitted(svg){if(svg)svg._motionSubmitted=null;}
 window.ww2Motion={capture,finish,submitted,clearSubmitted};
 document.addEventListener('ww2:render',()=>finish($('map'),window.signalSnapshot?.(state)||state));
 document.addEventListener('ww2:playback',()=>{
  if(!playbackSession)return;
  const p=playbackSession,svg=$('playbackMap'),value=p.frames[p.index][p.phase];
  finish(svg,value,{key:`${state.code}:${state.battle_number||1}:replay:${state.computer_playback.id}:${p.index}`,playback:true,allowAnimation:svg._motionForward});
 });
 reduced.addEventListener('change',()=>{if(reduced.matches)document.querySelectorAll('.unit-motion').forEach(stop);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelectorAll('.unit-motion').forEach(stop);});
})();
