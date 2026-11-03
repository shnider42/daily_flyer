import {returnLane} from './special-teams.js?v=23';
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
 for(const slot of [block.p,block.help]){const p=g.players[slot];if(p){p.blocking=false;p.assignment=null;}}
 defender.blocked=false;defender.blockFactor=1;defender.blockCooldown=1;
 g.blocks=g.blocks.filter(b=>b!==block);return true;
}
// A held defender has no full tackle bubble. A free arm can reach only on the
// exposed side of a single block, once per engagement; failed reaches do not
// slow the runner. No retries every animation frame and no tackle through bodies.
export function canTackle(g,d,radius=1.65){
 if(dist(d,g.carrier)>=radius)return false;
 if(!d.blocked)return true;
 const b=g.blocks.find(b=>g.defenders[b.d]===d);if(!b||b.reachAttempted||b.help!==undefined)return false;
 const p=g.players[b.p],r=g.carrier,dx=r.x-d.x,dy=r.y-d.y,n=Math.hypot(dx,dy)||1;
 const along=((p.x-d.x)*dx+(p.y-d.y)*dy)/n,across=Math.abs((p.x-d.x)*dy-(p.y-d.y)*dx)/n;
 if(along>0&&along<n+.45&&across<1.25)return false;
 const elite=(d.shed||75)>=90&&(d.tackling||75)>=90,reach=elite?1.05:.65;
 if(n>=reach)return false;
 b.reachAttempted=true;
 const chance=elite?clamp(.18+((d.shed||75)-(p.runBlock||75))*.004,.12,.30):.04;
 return g.rng()<chance;
}
export function stuntTarget(g,d){
 const stunt=g.defenseDefinition.coverage?.stunt;
 if(!stunt||g.isReturn||g.receivedPass||g.scrambleRecovery||g.crossed||g.pass||d.blocked||g.liveTime>(g.carrier===g.players[0]?1.3:.85))return null;
 const [penetrator,looper]=stunt,sign=penetrator===0?1:-1;
 if(d.slot===penetrator)return {x:26.5+sign*1.5,y:g.spot-3};
 if(d.slot===looper)return g.liveTime<.22?{x:26.5+sign*4,y:g.spot+3}:{x:26.5-sign*4,y:g.spot-2};
 return null;
}
export function isBlocker(g,p){
 if(g.fakeActive&&p===g.players[1])return false;
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
  let helper=g.players[b.help];
  if(helper&&(!isBlocker(g,helper)||helper.stun>0||dist(helper,d)>3.4||g.carrier.y>d.y+2)){helper.assignment=null;delete b.help;helper=null;}
  if(helper){helper.blocking=true;helper.assignment=b.d;const side=p.x<d.x?1:-1;g.move(helper,d.x+side*1.2-helper.x,d.y-.9-helper.y,helper.speed*.8,dt);}
  p.blocking=true;d.blocked=true;d.blockFactor=b.held?.05:helper?.12:.20;
  // Keep bodies apart, with a little run-block drive. Defenders can shed or
  // work around the edge; they cannot walk straight through the blocker.
  const dx=d.x-p.x,dy=d.y-p.y,n=Math.hypot(dx,dy)||1;
  if(n<1.9){const push=(1.9-n)*.5;d.x+=dx/n*push;d.y+=dy/n*push;p.x-=dx/n*push;p.y-=dy/n*push;}
  if(!pocket){const drive=clamp(((p.runBlock||p.power||70)-(d.shed||d.power||70))/50+.15+(helper?.15:0),-.25,.6)*dt;d.y+=drive;p.y+=drive;
   if(!g.isReturn&&!g.receivedPass&&g.playDefinition.kind==='run'&&g.carrier.y<g.spot+3){const lane=g.playDefinition.lane??26.5,side=d.x<lane?-1:1,kickout=clamp(.7+((p.runBlock||75)-(d.shed||75))*.018,.25,1.3)*dt;d.x+=side*kickout;p.x+=side*kickout*.7;}
  }
  active.push(b);
 }
 g.blocks=active;
 const blockers=g.players.filter(p=>isBlocker(g,p)&&!p.blocking&&p.stun<=0);
 const claimed=new Set(active.map(b=>b.d));
 // Reassess a few times per second and keep still-valid assignments. Give the
 // two linemen first choice, then the lead/backfield blockers and receivers.
 g.blockRead-=dt;
 for(const p of [...blockers].sort((a,b)=>(b.slot>=5)-(a.slot>=5))){
  if(p.blocking)continue;
  const pull=g.playDefinition.pull,lead=g.playDefinition.lead,designed=!g.isReturn&&!g.receivedPass&&!g.crossed;
  // A spare adjacent lineman helps a dominant interior defender, but never
  // abandons a close free rusher. Help takes two actual bodies and expires.
  if(designed&&!pocket&&g.playDefinition.kind==='run'&&p.slot>=5&&!g.defenders.some((d,i)=>!claimed.has(i)&&d.stun<=0&&dist(p,d)<3.5)){
   const b=active.find(b=>b.help===undefined&&!b.helpUsed&&b.left>.2&&g.players[b.p].slot>=5&&(g.playDefinition.doubleTeam||(g.defenders[b.d].shed||75)>=90||(g.defenders[b.d].shed||75)>(g.players[b.p].runBlock||75)+8)&&dist(p,g.defenders[b.d])<5);
   if(b){const d=g.defenders[b.d],side=g.players[b.p].x<d.x?1:-1;p.assignment=b.d;g.move(p,d.x+side*1.2-p.x,d.y-.9-p.y,p.speed,dt);
    if(dist(p,d)<2.25){b.help=g.players.indexOf(p);b.helpUsed=true;b.left=Math.min(3,b.left+.35+(p.runBlock||75)*.002);p.blocking=true;d.blockFactor=.12;g.emit('block','','',{distance:dist(p,g.carrier),doubleTeam:true});}
    continue;
   }
  }
  const threatClose=g.defenders.some(d=>!claimed.has(g.defenders.indexOf(d))&&d.stun<=0&&dist(p,d)<3.1&&(!pull||pull.slot!==p.slot||(d.x-p.x)*(pull.x-p.x)>1));
  if(designed&&!threatClose&&pull?.slot===p.slot&&g.liveTime<pull.until){p.assignment=null;g.move(p,pull.x-p.x,g.spot+pull.y-p.y,p.speed,dt);continue;}
  if(designed&&!threatClose&&!pocket&&lead?.slot===p.slot&&g.liveTime<lead.until){p.assignment=null;g.move(p,lead.x-p.x,g.carrier.y+4-p.y,p.speed,dt);continue;}
  const eligible=(d,i)=>!claimed.has(i)&&d.blockCooldown<=0&&d.stun<=0&&dist(p,d)<18&&(pocket?d.y<g.spot+7&&dist(d,g.carrier)<17:d.y>g.carrier.y-2&&d.y<g.carrier.y+22);
  let i=p.assignment;
  if(i===null||i===undefined||!eligible(g.defenders[i],i)||g.blockRead<=0){
   const candidates=g.defenders.map((d,i)=>({d,i})).filter(o=>eligible(o.d,o.i));
   candidates.sort((a,b)=>(dist(p,a.d)+dist(g.carrier,a.d)*.45+(g.isReturn?Math.abs(a.d.x-returnLane(g))*.25:0))-(dist(p,b.d)+dist(g.carrier,b.d)*.45+(g.isReturn?Math.abs(b.d.x-returnLane(g))*.25:0)));
   i=candidates[0]?.i??null;p.assignment=i;
  }
  if(i===null){
   const lane=g.isReturn?returnLane(g):!g.receivedPass?(g.playDefinition.blockLane??g.carrier.x):g.carrier.x;
   const tx=pocket?(g.format===11&&p.slot>=5&&p.slot<10?[23.25,29.75,20,26.5,33][p.slot-5]:(p.slot===5?23:p.slot===6?30:26.5)):lane+(p.slot%2? -3:3),ty=pocket?g.spot-1:g.carrier.y+5;
   g.move(p,tx-p.x,ty-p.y,p.speed*.8,dt);continue;
  }
  claimed.add(i);const d=g.defenders[i];
  const dx=d.x-g.carrier.x,dy=d.y-g.carrier.y,n=Math.hypot(dx,dy)||1;
  let tx=d.x-dx/n*1.6,ty=d.y-dy/n*1.6;
  if(pocket&&dist(d,g.carrier)>7){tx=clamp(tx,(g.format===11&&p.slot>=5&&p.slot<10?[23.25,29.75,20,26.5,33][p.slot-5]:(p.slot===5?23:p.slot===6?30:26.5))-5,(g.format===11&&p.slot>=5&&p.slot<10?[23.25,29.75,20,26.5,33][p.slot-5]:(p.slot===5?23:p.slot===6?30:26.5))+5);ty=clamp(ty,g.spot-2.5,g.spot+1);}
  g.move(p,tx-p.x,ty-p.y,p.speed*(pocket?.86:.96),dt);
  // Contact is only legal while the blocker is between the threat and runner.
  if(dist(p,d)<2.15&&dist(d,g.carrier)>dist(p,g.carrier)+.1){
   const left=clamp((pocket?2.0:!g.isReturn&&!g.receivedPass&&g.playDefinition.kind==='run'?(g.format===11?1.4:1.0):.85)+g.rng()*.65+((pocket?(p.passBlock||p.power||70):(p.runBlock||p.power||70))-(d.shed||d.power||70))*.018,.55,3);
   g.blocks.push({p:g.players.indexOf(p),d:i,left,age:0,held:false});g.emit('block','','',{distance:dist(p,g.carrier)});p.blocking=true;d.blocked=true;d.blockFactor=.2;
  }
 }
 if(g.blockRead<=0)g.blockRead=.3;
}
