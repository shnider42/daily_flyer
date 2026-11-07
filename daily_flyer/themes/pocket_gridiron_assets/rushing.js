const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Decide run/pass first; adding passing plays must not dilute the running game.
export function runProbability(g){
 const t=g.teams[g.offense],o=t.offense,style=t.profile?.offense.id,run=(o[1].power+o[1].agility+o[5].runBlock+o[6].runBlock)/4,pass=(o[0].accuracy+o[2].catching+o[3].catching+o[4].catching)/4;
 let p=(t.profile?.offense.runRate??({power:.57,space:.48,mobile:.47,quick:.42,vertical:.39}[style]??.46))+(run-pass)*.003;
 const toGo=g.target-g.spot,margin=g.scores[g.offense]-g.scores[1-g.offense];
 if(g.down===2)p+=toGo<=5?.12:toGo>=10?-.08:0;
 if(g.down>=3)p+=toGo<=2?.22:toGo<=4?.06:toGo>=8?-.29:-.15;
 if(g.spot>=95&&toGo<=3)p+=.10;
 if(['wind','rain','snow'].includes(g.weather?.kind))p+=.07;
 if(g.quarter>=4&&g.clock<Math.max(18,g.quarterSeconds*.35))p+=margin>0?.20:margin<0?-.28:-.08;
 return clamp(p,.10,.78);
}
export function chooseOffense(g){
 const run=g.rng()<runProbability(g),book=g.offensePlays.filter(p=>(p.kind==='run')===run),t=g.teams[g.offense],recent=g.offenseCalls?.[g.offense]||[];
 return g.weighted(book.length?book:g.offensePlays,p=>{
  let weight=t.profile?.offense.signature.includes(p.id)?1.65:1;
  if(p.kind==='run'){
   const outside=Math.abs(p.lane-26.5)>11,toGo=g.target-g.spot;
   if(toGo<=3)weight*=outside?.60:1.5;
   if(outside&&t.offense[1].speed>90)weight*=1.2;
   if(p.carrier===0)weight*=(t.offense[0].speed>80?1.1:.45);
  }
  if(p.id===recent.at(-1))weight*=.48;if(recent.slice(-4).filter(id=>id===p.id).length>=2)weight*=.4;
  return weight;
 }).id;
}
export function runLandmark(g){
 const p=g.carrier,play=g.playDefinition,center=g.ballX??26.5,lane=play.lane??center,outside=Math.abs(lane-center)>11;
 if(play.delay>g.liveTime)return {x:center,y:g.spot-4,stage:'wait'};
 const baseEdge=lane>center?(g.format===11?40:37):(g.format===11?13:16),edge=g.fieldX?g.fieldX(baseEdge):baseEdge;
 if(p.y<g.spot+1&&outside&&(lane>center?p.x<edge-3.5:p.x>edge+3.5))return {x:edge,y:g.spot-.5,stage:'edge'};
 return {x:lane,y:Math.max(g.spot+6,p.y+8),stage:'upfield'};
}
export function cpuRunTarget(g){
 const p=g.carrier,base=runLandmark(g),ai=g.offenseAI,designed=p.y<g.spot+4;
 // Read actual bodies and existing blocks, never a hidden defensive call.
 if((g.nextRunRead||0)>g.liveTime&&g.runRead)return g.runRead;
 g.nextRunRead=g.liveTime+({rookie:.34,pro:.23,legend:.15}[g.difficulty]||.23);
 const candidates=[base,...[-7,-3.5,0,3.5,7].map(dx=>({x:clamp((designed?base.x:p.x)+dx,3,50),y:base.y}))];
 const travel=q=>Math.hypot(q.x-p.x,q.y-p.y),danger=q=>{
  let risk=0;const steps=6,len=Math.min(8,travel(q)),nx=(q.x-p.x)/(travel(q)||1),ny=(q.y-p.y)/(travel(q)||1);
  for(const d of g.defenders){if(d.stun>.15)continue;for(let i=1;i<=steps;i++){const x=p.x+nx*len*i/steps,y=p.y+ny*len*i/steps,dist=Math.hypot(x-d.x,y-d.y);risk+=Math.max(0,4.4-dist)*(d.blocked?.12:1)/steps;}}
  return risk;
 };
 // A safe spot beside the runner is not a route. Without this progress cost,
 // outside runners could stop short of the landmark while searching for space.
 const score=q=>danger(q)*(1+ai.adapt)+Math.abs(q.x-base.x)*(designed?.11:.035)+Math.max(0,p.y-q.y)*.5+Math.max(0,4-travel(q))*1.4;
 candidates.sort((a,b)=>score(a)-score(b));
 g.runRead={x:candidates[0].x,y:candidates[0].y};return g.runRead;
}
export function cpuRunBurst(g,target){
 if(g.userOffense||g.burstCooldown>0||g.stamina<30||g.contact||g.pass||g.pitch||g.carrier.y<g.spot-1)return;
 const p=g.carrier,clear=g.defenders.every(d=>d.stun>0||d.blocked||d.y<p.y-1||Math.hypot(d.x-p.x,d.y-p.y)>5);
 if(clear&&Math.abs(target.x-p.x)<5&&g.liveTime>({rookie:2.1,pro:1.4,legend:1}[g.difficulty]||1.4))g.burstForRunner();
}
