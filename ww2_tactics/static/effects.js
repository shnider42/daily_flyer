'use strict';
const seenBattleEffects=new Map();
let lastPlaybackEffect=null;
function paintEffects(svg,events){
 for(const event of events||[])for(const pos of event.positions){
  const [cx,cy]=center(...pos),g=element('g',{class:`battle-effect effect-${event.kind}`,transform:`translate(${cx} ${cy})`,'aria-hidden':'true'});
  if(event.kind==='smoke'){
   for(const [x,y,r] of [[-12,4,16],[9,5,18],[-3,-9,17]])g.append(element('circle',{cx:x,cy:y,r,class:'effect-puff'}));
  }else{
   g.append(element('circle',{r:9,class:'effect-flash'}),element('circle',{r:25,class:'effect-ring'}));
   for(let i=0;i<6;i++){const a=i*Math.PI/3;g.append(element('line',{x1:Math.cos(a)*10,y1:Math.sin(a)*10,x2:Math.cos(a)*24,y2:Math.sin(a)*24,class:'effect-spark'}));}
  }
  svg.append(g);setTimeout(()=>g.remove(),event.kind==='smoke'?1600:1000);
 }
}
function renderBattleEffects(value,svg){
 if(busy)return;
 const key=`${value.code}:${value.battle_number||1}`,sequence=value.effect_sequence||0,previous=seenBattleEffects.get(key);
 seenBattleEffects.set(key,sequence);
 if(previous===undefined||sequence<=previous)return;
 const recorded=new Set((value.computer_playback?.frames||[]).flatMap(f=>(f.effects||[]).map(e=>e.sequence)));
 paintEffects(svg,(value.effects||[]).filter(e=>e.sequence>previous&&!recorded.has(e.sequence)));
}
function renderPlaybackEffects(value,frame,svg,playback){
 const key=`${value.code}:${value.battle_number||1}:${value.computer_playback.id}:${playback.index}:${playback.phase}`;
 if(lastPlaybackEffect===key)return;lastPlaybackEffect=key;
 if(playback.phase==='after')paintEffects(svg,frame.effects||[]);
}
