// Authored arcade conditioning. No rubber-band speeds or outcome caps.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const athleticSpeed=rating=>4.1+clamp(rating||70,40,99)/27;
export function fatigueFactor(energy=100,endurance=80){
 const loss=clamp((75-energy)/75,0,1);
 return 1-loss*(.30-(endurance-75)*.003);
}
export function exert(g,p,dx,dy,dt,weather){
 p.energy??=100;p.carrySeconds??=0;
 const moving=Math.hypot(dx,dy)>.15,carrying=p===g.carrier&&g.isLive&&!g.pass&&!g.pitch&&!g.fakeActive;
 const endurance=clamp(p.endurance??80,40,99);
 if(!g.isLive)return 1;
 if(carrying&&moving)p.carrySeconds+=dt;
 // The first two seconds preserve the burst off the line. After that a runner
 // spends more energy than a pursuing defender. Endurance controls the gap.
 const carryLoad=carrying&&p.carrySeconds>2+1e-8?Math.max(2.4,11-(endurance-70)*.29):0;
 const baseLoad=2.7-(endurance-70)*.035;
 const burstLoad=carrying&&g.burstLeft>0?3:0;
 const drain=(baseLoad+carryLoad+burstLoad)*weather.cost;
 p.energy=clamp(p.energy+dt*(moving?-drain:5*weather.recovery),0,100);
 return fatigueFactor(p.energy,endurance);
}
export function pursuitTarget(g,d){
 const p=g.carrier,ai=g.defenseAI,dist=Math.hypot(d.x-p.x,d.y-p.y),reads=clamp(d.recognition??80,40,99);
 const travel=dist/Math.max(1,d.speed),cap=.22+ai.adapt*.40+(reads-75)*.005;
 const lead=ai.lead+Math.min(Math.max(.2,cap),travel*(.10+ai.adapt*.08));
 const vx=p.vx||0,vy=p.vy||0;
 if(Math.hypot(vx,vy)<.1)return {x:p.x,y:p.y};
 // Outside defenders approach from the boundary; the middle unit keeps help
 // inside. No prediction beyond observed velocity or teleporting to the edge.
 const outside=d.y>p.y+3&&Math.abs(d.x-26.5)>18;
 return {x:clamp(p.x+vx*lead+(outside?Math.sign(d.x-26.5)*1.0:0),1,52),y:clamp(p.y+vy*lead,-5,107)};
}
export function coverageLane(d,target,elapsed){
 const lanes=[-10,10,-6,-2,2,6,0,-14,-4,4,14];
 const offset=lanes[d.slot]||0;
 // Gunners close first. Other coverage players retain lanes instead of
 // converging into one blockable pile before the catch.
 return {x:clamp(target.x+offset,2,51),y:clamp(target.y+(d.slot===6?24:d.slot<2?2:6+Math.abs(offset)*.2),2,104)};
}
