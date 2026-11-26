/** Code-native warnings for the actual collision paths; never a decorative danger roll. */
import {isShipBossActor,shipBossTelegraph} from './ship-bosses.mjs';

export function drawShipBossTelegraphs(ctx,world,{to=(x,y)=>({x,y}),scale=1,pixelRatio=1,reducedMotion=false,emit}={}){
 const unit=Math.max(.5,pixelRatio),zoom=Math.max(.01,scale);
 ctx.save();
 const line=(from,end,color,width=1,dashed=false)=>{
  const a=to(from.x,from.y),b=to(end.x,end.y);ctx.strokeStyle=color;ctx.lineWidth=width*unit;
  ctx.setLineDash?.(dashed?[7*unit,5*unit]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
 };
 for(const enemy of world?.enemies||[]){
  if(!isShipBossActor(enemy)||enemy.shipBossPart||enemy.hp<=0)continue;
  const cue=shipBossTelegraph(enemy,world),p=to(enemy.x,enemy.y);if(!cue)continue;
  const active=enemy.active===true,color=cue.kind==='recovery'?'#a5d8b3':cue.kind==='screen'?'#a7d5e0':'#f1be86';
  if(['lane','charge','spread'].includes(cue.kind)){
   // The two edges expose the exact travel corridor. Fixed warnings remain
   // fully readable when reduced motion removes the mild charging pulse.
   ctx.globalAlpha=reducedMotion?.82:.72+.1*Math.sin(enemy.bossState.clock*5);
   for(const angle of cue.angles){
    const end={x:enemy.x+Math.cos(angle)*cue.length,y:enemy.y+Math.sin(angle)*cue.length},half=cue.width/2;
    const offset={x:-Math.sin(angle)*half,y:Math.cos(angle)*half};
    line({x:enemy.x+offset.x,y:enemy.y+offset.y},{x:end.x+offset.x,y:end.y+offset.y},color,1,true);
    line({x:enemy.x-offset.x,y:enemy.y-offset.y},{x:end.x-offset.x,y:end.y-offset.y},color,1,true);
    line(enemy,end,color,cue.kind==='spread'?1:2,false);
    const left={x:end.x-Math.cos(angle-.5)*35,y:end.y-Math.sin(angle-.5)*35},right={x:end.x-Math.cos(angle+.5)*35,y:end.y-Math.sin(angle+.5)*35};
    line(left,end,color,2);line(right,end,color,2);
   }
  }
  if(enemy.bossState.archetype==='screen-carrier'){
   const relays=(world.enemies||[]).filter(part=>part.shipBossPart&&part.hp>0&&part.id.startsWith(`${enemy.id}:relay:`));
   ctx.globalAlpha=active?.72:.38;
   for(const relay of relays){
    line(enemy,relay,'#9acbd6',1,true);
    const q=to(relay.x,relay.y);ctx.strokeStyle='#acdce5';ctx.lineWidth=2*unit;ctx.setLineDash?.([]);
    ctx.strokeRect(q.x-17*unit,q.y-17*unit,34*unit,34*unit);
   }
  }
  ctx.globalAlpha=1;
  if(active){
   const text=cue.kind==='lane'||cue.kind==='charge'||cue.kind==='spread'?`${cue.text} ${Math.max(0,cue.seconds).toFixed(1)}s`:cue.text;
   const y=p.y+(enemy.radius+32)*zoom;
   if(emit)emit(text,p.x,y,color,12,'center',96,'ship-boss-warning');
   else{ctx.textAlign='center';ctx.font=`${12*unit}px monospace`;ctx.fillStyle='#091119';const width=Math.min(720*unit,ctx.measureText?.(text)?.width||text.length*7*unit);ctx.fillRect(p.x-width/2-6*unit,y-13*unit,width+12*unit,19*unit);ctx.fillStyle=color;ctx.fillText(text,p.x,y,width);}
  }
 }
 ctx.restore();
}
