import {effects,weatherPassDrift} from './weather.js?v=32';
// Pass placement is a destination, never a homing ball. No randomness here:
// the same preview, CPU plan and released throw use the same geometry.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function passAim(input={}){
 const x=Number.isFinite(input.x)?input.x:0,y=Number.isFinite(input.y)?input.y:0,n=Math.hypot(x,y);
 if(n<.08)return {x:0,y:0,amount:0};
 return {x:x/Math.max(1,n),y:y/Math.max(1,n),amount:Math.min(1,n)};
}
function forecast(g,p,seconds){
 const q={x:p.x,y:p.y},step=.05;
 for(let t=0;t<seconds;t+=step){const dt=Math.min(step,seconds-t),r=g.route(p,g.liveTime+t+dt),dx=r.x-q.x,dy=r.y-q.y,n=Math.hypot(dx,dy),travel=Math.min(n,p.stun>t?0:p.speed*effects(g.weather).speed*dt);if(n){q.x+=dx/n*travel;q.y+=dy/n*travel;}}
 return q;
}
export function passPlacement(g,target,input={}){
 const aim=passAim(input),qb=g.carrier,velocity=30+(qb.armStrength||85)*.075;
 let duration=clamp(dist(qb,target)/velocity,.3,1.4),point;
 for(let i=0;i<3;i++){
  // Leave a little running room ahead of the assisted throw. A neutral stick
  // follows route breaks and settled hooks instead of extrapolating forever.
  const base=forecast(g,target,duration*.45),scale=.65+.35*duration/1.4;
  point={x:base.x+aim.x*4.5*scale,y:base.y+aim.y*(aim.y>0?6:4)*scale};
  duration=clamp(dist(qb,point)/velocity,.3,1.4);
 }
 const drift=weatherPassDrift(g,duration);point={x:point.x+drift.x,y:point.y+drift.y};
 return {...point,drift,duration,aim,range:dist(qb,point),reachable:dist(qb,point)<=48+(qb.armStrength||85)*.1,inBounds:point.x>.4&&point.x<52.9&&point.y<=110&&point.y>=-9};
}
export function eligibleReceivers(g){return g.players.slice(1,5);}
export function catchReach(p){return 1.9+clamp(((p.catching||80)-65)/100,0,.35);}
export function landingPickChance(g,ball,defender,base){
 const gap=Math.min(...eligibleReceivers(g).map(p=>dist(p,ball))),separation=gap-dist(defender,ball);
 if(separation<=1)return base;
 // A defender alone under a misplaced pass has a catch opportunity, not the
 // tiny per-pass league interception rate. Drops/tips still leave some mercy.
 const clean=clamp(.55+(defender.coverage||80)*.0025,.65,.8);
 return base+(clean-base)*clamp((separation-1)/2.5,0,1);
}
