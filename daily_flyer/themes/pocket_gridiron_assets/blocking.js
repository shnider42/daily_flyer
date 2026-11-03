// Assignment + contact model. A block buys time; it never refreshes a stun.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function clearBlocks(g){
 g.blocks=[];g.blockRead=0;
 for(const p of [...(g.players||[]),...(g.defenders||[])]){p.blocked=false;p.blocking=false;p.blockFactor=1;p.blockCooldown=0;p.assignment=null;}
}
export function shedBlock(g,defender){
 const i=g.defenders.indexOf(defender),block=g.blocks.find(b=>b.d===i);
 if(!block)return false;
 const p=g.players[block.p];p.blocking=false;p.assignment=null;defender.blocked=false;defender.blockFactor=1;defender.blockCooldown=1;
 g.blocks=g.blocks.filter(b=>b!==block);return true;
}
export function isBlocker(g,p){
 if(p===g.carrier||p===g.pass?.target||g.pitch&&p===g.players[g.pitch.runner??1])return false;
 if(g.isReturn||g.receivedPass||g.scrambleRecovery||g.crossed)return true;
 if(g.playDefinition.kind==='run'&&g.liveTime>=(g.playDefinition.delay||0))return true;
 return p.slot>=5||p.slot===1&&g.play!=='draw';
}
export function updateBlocking(g,dt){
 const pocket=!g.isReturn&&!g.receivedPass&&!g.scrambleRecovery&&!g.crossed&&g.carrier===g.players[0]&&(g.playDefinition.kind==='pass'||g.liveTime<(g.playDefinition.delay||0));
 for(const d of g.defenders){d.blocked=false;d.blockFactor=1;d.blockCooldown=Math.max(0,(d.blockCooldown||0)-dt);}
 for(const p of g.players)p.blocking=false;
 const active=[];
 for(const b of g.blocks){
  const p=g.players[b.p],d=g.defenders[b.d];b.left-=dt;b.age+=dt;
  if(!isBlocker(g,p)||p.stun>0||d.stun>.2||dist(p,d)>3.2){p.assignment=null;d.blockCooldown=.35;continue;}
  if(b.left<=0){
   // A beaten pocket blocker occasionally grabs to hang on. The foul is tied
   // to this failed engagement, checked once, and shown at the player's location.
   const beaten=pocket&&dist(d,g.carrier)<8&&b.age>1&&(d.shed||d.power||70)>=(p.passBlock||p.power||70)-10;
   if(!b.held&&beaten&&g.playStart&&g.rng()<.035){b.held=true;b.left=.35;g.flag('holding',g.offense,p);}
   else{p.assignment=null;d.blockCooldown=.85;continue;}
  }
  p.blocking=true;d.blocked=true;d.blockFactor=b.held?.05:.20;
  // Keep bodies apart, with a little run-block drive. Defenders can shed or
  // work around the edge; they cannot walk straight through the blocker.
  const dx=d.x-p.x,dy=d.y-p.y,n=Math.hypot(dx,dy)||1;
  if(n<1.9){const push=(1.9-n)*.5;d.x+=dx/n*push;d.y+=dy/n*push;p.x-=dx/n*push;p.y-=dy/n*push;}
  if(!pocket){const drive=clamp(((p.runBlock||p.power||70)-(d.shed||d.power||70))/50+.15,-.25,.6)*dt;d.y+=drive;p.y+=drive;}
  active.push(b);
 }
 g.blocks=active;
 const blockers=g.players.filter(p=>isBlocker(g,p)&&!p.blocking&&p.stun<=0);
 const claimed=new Set(active.map(b=>b.d));
 // Reassess a few times per second and keep still-valid assignments. Give the
 // two linemen first choice, then the lead/backfield blockers and receivers.
 g.blockRead-=dt;
 for(const p of [...blockers].sort((a,b)=>(b.slot>=5)-(a.slot>=5))){
  const pull=g.playDefinition.pull,lead=g.playDefinition.lead,designed=!g.isReturn&&!g.receivedPass&&!g.crossed;
  if(designed&&pull?.slot===p.slot&&g.liveTime<pull.until){p.assignment=null;g.move(p,pull.x-p.x,g.spot+pull.y-p.y,p.speed,dt);continue;}
  if(designed&&!pocket&&lead?.slot===p.slot&&g.liveTime<lead.until){p.assignment=null;g.move(p,lead.x-p.x,g.carrier.y+4-p.y,p.speed,dt);continue;}
  const eligible=(d,i)=>!claimed.has(i)&&d.blockCooldown<=0&&d.stun<=0&&dist(p,d)<18&&(pocket?d.y<g.spot+7&&dist(d,g.carrier)<17:d.y>g.carrier.y-2&&d.y<g.carrier.y+22);
  let i=p.assignment;
  if(i===null||i===undefined||!eligible(g.defenders[i],i)||g.blockRead<=0){
   const candidates=g.defenders.map((d,i)=>({d,i})).filter(o=>eligible(o.d,o.i));
   candidates.sort((a,b)=>(dist(p,a.d)+dist(g.carrier,a.d)*.45)-(dist(p,b.d)+dist(g.carrier,b.d)*.45));
   i=candidates[0]?.i??null;p.assignment=i;
  }
  if(i===null){
   const lane=!g.isReturn&&!g.receivedPass?(g.playDefinition.blockLane??g.carrier.x):g.carrier.x;
   const tx=pocket?(p.slot===5?23:p.slot===6?30:26.5):lane+(p.slot%2? -3:3),ty=pocket?g.spot-1:g.carrier.y+5;
   g.move(p,tx-p.x,ty-p.y,p.speed*.8,dt);continue;
  }
  claimed.add(i);const d=g.defenders[i];
  const dx=d.x-g.carrier.x,dy=d.y-g.carrier.y,n=Math.hypot(dx,dy)||1;
  let tx=d.x-dx/n*1.6,ty=d.y-dy/n*1.6;
  if(pocket&&dist(d,g.carrier)>7){tx=clamp(tx,(p.slot===5?23:p.slot===6?30:26.5)-5,(p.slot===5?23:p.slot===6?30:26.5)+5);ty=clamp(ty,g.spot-2.5,g.spot+1);}
  g.move(p,tx-p.x,ty-p.y,p.speed*(pocket?.86:.96),dt);
  // Contact is only legal while the blocker is between the threat and runner.
  if(dist(p,d)<2.15&&dist(d,g.carrier)>dist(p,g.carrier)+.1){
   const left=clamp((pocket?2.0:.85)+g.rng()*.65+((pocket?(p.passBlock||p.power||70):(p.runBlock||p.power||70))-(d.shed||d.power||70))*.018,.55,3);
   g.blocks.push({p:g.players.indexOf(p),d:i,left,age:0,held:false});g.emit('block','','',{distance:dist(p,g.carrier)});p.blocking=true;d.blocked=true;d.blockFactor=.2;
  }
 }
 if(g.blockRead<=0)g.blockRead=.3;
}
