/** Public observations and physical warning lines at Sol. No undiscovered story data. */
import {pixelRect,pixelLine} from './pixel-art.mjs';
import {solCordonTelegraph} from './sol-cordon.mjs';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const TAU=Math.PI*2;

/** Beam endpoints come from the authority's actual emitter and target positions. */
export function drawSolTractors(ctx,world,{to=(x,y)=>({x,y}),pixelRatio=1,ship,status,emit}={}){
 const beams=new Map(),r=Math.max(.5,pixelRatio);
 for(const tractor of [status?.tractor,...Object.values(world?.solCordon?.visits||{}).map(visit=>visit.tractor)]){
  if(!tractor||!['locking','towing'].includes(tractor.phase)||![tractor.source?.x,tractor.source?.y,tractor.target?.x,tractor.target?.y].every(Number.isFinite))continue;
  const key=tractor.sourceId+':'+tractor.targetVesselId;if(!beams.has(key))beams.set(key,tractor);
 }
 for(const beam of beams.values()){
  const a=to(beam.source.x,beam.source.y),b=to(beam.target.x,beam.target.y),towing=beam.phase==='towing';
  ctx.save();ctx.strokeStyle=towing?'#9ac8d586':'#c6b17b8a';ctx.lineWidth=(towing?5:1)*r;ctx.setLineDash?.(towing?[]:[5*r,7*r]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  if(towing){ctx.strokeStyle='#d2eff0';ctx.lineWidth=r;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  ctx.setLineDash?.([]);
  for(const x of [-1,1])for(const y of [-1,1]){pixelLine(ctx,b.x+x*13*r,b.y+y*13*r,b.x+x*7*r,b.y+y*13*r,'#c6dedd',r);pixelLine(ctx,b.x+x*13*r,b.y+y*13*r,b.x+x*13*r,b.y+y*7*r,'#c6dedd',r);}
  if(beam.targetVesselId===ship?.id)emit?.(towing?'TRACTOR ATTACHED':'TRACTOR LOCK',b.x,b.y-28*r,towing?'#d0e8e7':'#ecd2a0',12,'center',115,'tractor');ctx.restore();
 }
}

/** Briefly frame the ship and Earth together during the actual arrival challenge.
 * Flight inputs, aim coordinates and the captain's saved zoom remain unchanged. */
export function solCordonArrivalFrame(world,ship,status,{width,height,zoom}={}){
 if(!world?.solCordon||!status?.active||status.cleared||status.phase!=='warning')return null;
 const earth=world.bodies?.find(body=>body.id===world.solCordon.earthId);
 if(!earth||!ship||Math.hypot(ship.x-earth.x,ship.y-earth.y)>1050)return null;
 const radius=finite(earth.radius,122),padding=105;
 const minX=Math.min(earth.x-radius,ship.x-80),maxX=Math.max(earth.x+radius,ship.x+80);
 const minY=Math.min(earth.y-radius,ship.y-80),maxY=Math.max(earth.y+radius,ship.y+80);
 return{x:(minX+maxX)/2,y:(minY+maxY)/2,
  zoom:Math.min(zoom,Math.max(.04,Math.min(width/(maxX-minX+padding*2),height/(maxY-minY+padding*2))))};
}

/** The patches are visible damage, not a diagnosis of Earth's condition. */
export function drawSolCordonOverlay(ctx,world,{to=(x,y)=>({x,y}),scale=1,pixelRatio=1,ship,status,emit,width=Infinity,height=Infinity}={}){
 const cordon=world?.solCordon,earth=world?.bodies?.find(body=>body.id===cordon?.earthId);
 if(!cordon||!earth)return;
 const r=Math.max(.5,pixelRatio),z=Math.max(.01,scale),p=to(earth.x,earth.y),radius=earth.radius*z;
 const visible=(point,margin=0)=>point.x>=-margin&&point.x<=width+margin&&point.y>=-margin&&point.y<=height+margin;
 ctx.save();
 if(visible(p,radius+35*r)){
  ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);ctx.clip();
  const bands=[[-.72,-.31,-.1,.05],[-.1,.05,.49,-.15],[-.23,-.03,-.43,.53],[-.4,.48,.05,.67],[.2,-.12,.39,-.61],[.1,.05,.56,.36]];
  for(const [ax,ay,bx,by]of bands){
   pixelLine(ctx,p.x+ax*radius,p.y+ay*radius,p.x+bx*radius,p.y+by*radius,'#27322f',Math.max(r,Math.round(radius*.075)));
   pixelLine(ctx,p.x+ax*radius,p.y+(ay+.045)*radius,p.x+bx*radius,p.y+(by+.045)*radius,'#655d41',Math.max(r,Math.round(radius*.025)));
  }
  // Small surviving light clusters sit apart from the unlit damaged regions.
  for(const [x,y]of [[-.53,-.51],[-.46,-.49],[.49,.53],[.54,.48]])pixelRect(ctx,'#dfce9e',p.x+x*radius,p.y+y*radius,Math.max(r,z*2),r);
  ctx.restore();
 }
 // Broken orbital structures have fixed positions on every visit.
 for(const wreck of [{x:205,y:-115,a:.35},{x:-215,y:195,a:-.65},{x:278,y:100,a:1.1}]){
  const q=to(earth.x+wreck.x,earth.y+wreck.y);if(!visible(q,35*r))continue;
  const length=27*z,dx=Math.cos(wreck.a)*length,dy=Math.sin(wreck.a)*length;
  pixelLine(ctx,q.x-dx,q.y-dy,q.x+dx*.3,q.y+dy*.3,'#778078',Math.max(r,4*z));
  pixelLine(ctx,q.x-dy*.6,q.y+dx*.6,q.x+dy*.3,q.y-dx*.3,'#4a5959',Math.max(r,2*z));
  pixelRect(ctx,'#9a876a',q.x+dx*.7,q.y+dy*.7,Math.max(r,5*z),Math.max(r,2*z));
  pixelRect(ctx,'#526265',q.x-dx*.8+10*z,q.y-dy*.8-12*z,Math.max(r,3*z),r);
 }
 const boundary=(radius,color)=>{
  if(!(radius>0))return;
  ctx.strokeStyle=color;ctx.lineWidth=r;ctx.setLineDash?.([4*r,8*r]);ctx.beginPath();ctx.arc(p.x,p.y,radius*z,0,TAU);ctx.stroke();ctx.setLineDash?.([]);
 };
 boundary(cordon.outerRadius,'#ad98694f');boundary(cordon.innerRadius,'#d78b667a');
 if(ship&&status?.active){
  const angle=Math.atan2(ship.y-earth.y,ship.x-earth.x),point=to(earth.x+Math.cos(angle)*cordon.innerRadius,earth.y+Math.sin(angle)*cordon.innerRadius);
  if(visible(point,20*r))emit?.('EARTH APPROACH · DEFENSE LINE',point.x,point.y-15*r,'#e7b78c',12,'center',85,'cordon-boundary');
  const source=status.tractor?.source,away=source?Math.atan2(ship.y-source.y,ship.x-source.x):angle;
  const current=to(ship.x,ship.y),out={x:Math.cos(away),y:Math.sin(away)};
  const from={x:current.x+out.x*45*r,y:current.y+out.y*45*r},end={x:current.x+out.x*82*r,y:current.y+out.y*82*r};
  pixelLine(ctx,from.x,from.y,end.x,end.y,'#a6d1bd',2*r);
  for(const side of [-1,1])pixelLine(ctx,end.x,end.y,end.x-out.x*11*r-out.y*side*7*r,end.y-out.y*11*r+out.x*side*7*r,'#a6d1bd',2*r);
  if(visible(end,10*r))emit?.(source?'BREAK AWAY':'WITHDRAW',end.x,end.y+10*r,'#bddac9',12,'center',100,'cordon-retreat');
 }
 drawSolTractors(ctx,world,{to,pixelRatio:r,ship,status,emit});
 for(const enemy of world.enemies||[]){
  const telegraph=solCordonTelegraph(enemy);if(!telegraph)continue;
  const origin=to(enemy.x,enemy.y);
  ctx.strokeStyle='#efb281';ctx.lineWidth=r;ctx.setLineDash?.([5*r,5*r]);ctx.beginPath();
  for(const angle of telegraph.angles){
   const dx=Math.cos(angle),dy=Math.sin(angle);
   const from=to(enemy.x+dx*telegraph.muzzleOffset,enemy.y+dy*telegraph.muzzleOffset);
   const end=to(enemy.x+dx*(telegraph.muzzleOffset+telegraph.length),enemy.y+dy*(telegraph.muzzleOffset+telegraph.length));
   ctx.moveTo(from.x,from.y);ctx.lineTo(end.x,end.y);
  }
  ctx.stroke();ctx.setLineDash?.([]);
  if(visible(origin,30*r)&&enemy.cordonState.targetVesselId===ship?.id)emit?.('LOCKING',origin.x,origin.y+(enemy.radius+18)*z,'#f0bf8d',12,'center',92,'cordon-lock');
 }
 ctx.restore();
}
