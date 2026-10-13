'use strict';
const seenBattleEffects=new Map();
let lastPlaybackEffect=null;
function paintBlast(g){
 g.append(element('circle',{r:9,class:'effect-flash'}),element('circle',{r:25,class:'effect-ring'}));
 for(let i=0;i<6;i++){const a=i*Math.PI/3;g.append(element('line',{x1:Math.cos(a)*10,y1:Math.sin(a)*10,x2:Math.cos(a)*24,y2:Math.sin(a)*24,class:'effect-spark'}));}
}
function paintBombing(g,event,pos){
 const [cx,cy]=center(...pos),origin=event.origin?center(...event.origin):[cx,cy-50];
 const bomb=element('g',{class:'effect-falling-bomb'});
 bomb.style.setProperty('--launch-x',`${origin[0]-cx}px`);bomb.style.setProperty('--launch-y',`${origin[1]-cy-24}px`);
 bomb.append(element('path',{d:'M-3 -9h6v10l-3 4-3-4z M-3 -7l-4 -4v6l4 2 M3 -7l4 -4v6l-4 2',class:'effect-bomb-body'}));
 const impact=element('g',{class:`effect-bomb-impact ${event.hit?'effect-hit':'effect-miss'}`});
 if(event.hit)paintBlast(impact);
 else{impact.append(element('circle',{r:22,class:'effect-miss-ring'}));for(const [x,y,r] of [[-9,4,10],[8,1,12],[0,-6,9]])impact.append(element('circle',{cx:x,cy:y,r,class:'effect-dust'}));}
 g.append(bomb,impact);
}
function paintAirFire(g,event,pos){
 const [cx,cy]=center(...pos),aa=event.kind==='anti_air';
 if(event.origin){
  const [sx,sy]=center(...event.origin),x=sx-cx,y=sy-cy;
  // The server omits unobserved origins. Never infer a hidden gun position.
  for(let i=0;i<3;i++){const trace=element('path',{d:`M${x} ${y}L${(i-1)*5} ${(i-1)*4}`,pathLength:1,class:`effect-air-tracer ${aa?'effect-aa-tracer':'effect-fighter-tracer'}`});trace.style.animationDelay=`${i*.13}s`;g.append(trace);}
  g.append(element('circle',{cx:x,cy:y,r:7,class:'effect-muzzle-flash'}));
 }
 if(aa){
  const burst=element('g',{class:`effect-flak-burst effect-${event.battery||'heavy'}-battery`});
  for(const [i,[x,y,r]] of [[-16,-12,8],[14,-6,11],[-3,15,9]].entries()){
   const puff=element('circle',{cx:x,cy:y,r,class:'effect-flak-puff'});puff.style.animationDelay=`${.22+i*.13}s`;burst.append(puff);
   const flash=element('path',{d:`M${x-5} ${y}h10 M${x} ${y-5}v10`,class:'effect-flak-flash'});flash.style.animationDelay=`${.22+i*.13}s`;burst.append(flash);
  }
  g.append(burst);
 }
 if(event.hit){const hit=element('g',{class:'effect-air-impact'});paintBlast(hit);g.append(hit);}
 else g.append(element('circle',{r:25,class:'effect-air-miss'}));
}
function paintEffects(svg,events){
 for(const event of events||[])for(const pos of event.positions){
  const [cx,cy]=center(...pos),g=element('g',{class:`battle-effect effect-${event.kind}${event.hit===true?' effect-hit':event.hit===false?' effect-miss':''}`,transform:`translate(${cx} ${cy})`,'aria-hidden':'true'});
  if(event.kind==='smoke'){
   for(const [x,y,r] of [[-12,4,16],[9,5,18],[-3,-9,17]])g.append(element('circle',{cx:x,cy:y,r,class:'effect-puff'}));
  }else if(event.kind==='bombing')paintBombing(g,event,pos);
  else if(event.kind==='anti_air'||event.kind==='air_fire')paintAirFire(g,event,pos);
  else paintBlast(g);
  svg.append(g);setTimeout(()=>g.remove(),['smoke','bombing','anti_air','air_fire'].includes(event.kind)?1700:1000);
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
